-- AGAI V202609_0025 — correctif de la numérotation des interventions liées à une PILP.
-- À étudier et tester sur une copie AVANT toute utilisation en production.
-- Ce script modifie deux définitions de fonctions, sans modifier les fiches existantes.
-- L'intervention d'origine est réelle et doit être numérotée ; seule la copie
-- technique d'historique (_lienPilpSourceId non vide) ne consomme pas de numéro.
-- Les numéros provisoires d'autres fiches dual-v1 ne sont pas pris pour des
-- numéros définitifs lors du calcul du maximum et du contrôle des doublons.

do $agai_pilp_numbering_v25$
declare
  atomic_function regprocedure := to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)');
  health_function regprocedure := to_regprocedure('public.agai_atomic_health()');
  definition text;
  health_definition text;
  old_incoming text := $needle$coalesce(p_data->>'_lienPilp','false')<>'true'$needle$;
  new_incoming text := $needle$coalesce(p_data->>'_lienPilpSourceId','')=''$needle$;
  old_existing text := $needle$coalesce(r.data->>'_lienPilp','false')<>'true'$needle$;
  new_existing text := $needle$coalesce(r.data->>'_lienPilpSourceId','')='' and (coalesce(r.data->>'_numberingScheme','')<>'dual-v1' or r.data->>'_numberFinalized'='true')$needle$;
  incoming_count integer;
  existing_count integer;
  health_count integer;
begin
  if atomic_function is null or health_function is null then
    raise exception 'AGAI V25 : fonctions atomiques absentes ; aucun changement';
  end if;
  definition := pg_get_functiondef(atomic_function);
  health_definition := pg_get_functiondef(health_function);
  if position('AGAI_FINAL_NUMBERING_V1' in definition)=0
     or position('AGAI_REVISION_CONFLICT' in definition)=0 then
    raise exception 'AGAI V25 : version serveur inattendue ; aucun changement';
  end if;
  incoming_count := (length(definition)-length(replace(definition,old_incoming,'')))/length(old_incoming);
  existing_count := (length(definition)-length(replace(definition,old_existing,'')))/length(old_existing);
  health_count := (length(health_definition)-length(replace(health_definition,old_existing,'')))/length(old_existing);

  if position('AGAI_PILP_LINKED_NUMBERING_V2' in definition)>0 then
    if incoming_count=0 and existing_count=0 and health_count=0
       and position(new_incoming in definition)>0
       and position(new_existing in definition)>0
       and position(new_existing in health_definition)>0 then
      raise notice 'AGAI V25 : correctif déjà installé ; aucun changement';
      return;
    end if;
    raise exception 'AGAI V25 : installation partielle ou modifiée ; aucun changement';
  end if;
  if incoming_count<>1 or existing_count<>3 or health_count<>1
     or position(new_incoming in definition)>0
     or position(new_existing in definition)>0
     or position(new_existing in health_definition)>0 then
    raise exception 'AGAI V25 : signatures inattendues (entrant %, existants %, santé %) ; aucun changement',
      incoming_count,existing_count,health_count;
  end if;

  definition := replace(definition,old_incoming,new_incoming);
  definition := replace(definition,old_existing,new_existing);
  definition := replace(definition,'AGAI_FINAL_NUMBERING_V1',
    'AGAI_FINAL_NUMBERING_V1 / AGAI_PILP_LINKED_NUMBERING_V2');
  health_definition := replace(health_definition,old_existing,new_existing);
  execute definition;
  execute health_definition;
  raise notice 'AGAI V25 : règles serveur corrigées ; aucune fiche existante régularisée';
end;
$agai_pilp_numbering_v25$;

select position('AGAI_PILP_LINKED_NUMBERING_V2' in pg_get_functiondef(
  to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)')))>0
  as correctif_pilp_actif;
