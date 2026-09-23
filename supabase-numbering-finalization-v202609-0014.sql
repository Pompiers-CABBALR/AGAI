-- AGAI V202609_0014 — numéros provisoires au départ, définitifs à la clôture.
-- À installer AVANT l'application V202609_0014, après sauvegarde de production.
-- Ne renumérote aucune fiche existante et ne modifie aucune donnée d'intervention.
-- Le patch conserve le corps actuel de la fonction (dont le correctif HTTP 409).

do $agai_migration$
declare
  atomic_function regprocedure := to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)');
  health_function regprocedure := to_regprocedure('public.agai_atomic_health()');
  definition text;
  health_definition text;
  marker text := $agai_marker$  p_data := jsonb_set(p_data,'{_serverRevision}',to_jsonb(current_record_revision+1),true);$agai_marker$;
  health_marker text := $agai_health_marker$and coalesce(r.data->>'_numCaserne','')<>''$agai_health_marker$;
  finalization text := $agai_patch$
  -- AGAI_FINAL_NUMBERING_V1 : seuls les dossiers terminés consomment le
  -- compteur définitif. Les numéros reçus au départ restent provisoires.
  if current_exists and current_status='terminee' and incoming_status='terminee'
     and current_row.data->>'_numberFinalized'='true' then
    -- Une ancienne copie hors ligne ne peut pas réécrire le numéro final.
    p_data:=jsonb_set(p_data,'{_numCaserne}',coalesce(current_row.data->'_numCaserne','null'::jsonb),true);
    p_data:=jsonb_set(p_data,'{_numMois}',coalesce(current_row.data->'_numMois','null'::jsonb),true);
    p_data:=jsonb_set(p_data,'{_numGlobal}',coalesce(current_row.data->'_numGlobal','null'::jsonb),true);
    p_data:=jsonb_set(p_data,'{_numberingScheme}',to_jsonb('dual-v1'::text),true);
    p_data:=jsonb_set(p_data,'{_numberFinalized}','true'::jsonb,true);
  end if;
  if incoming_status='terminee' and not coalesce(p_deleted,false)
     and coalesce(p_data->>'_isRenfort','false')<>'true'
     and coalesce(p_data->>'_lienPilp','false')<>'true'
     and (not current_exists or current_status<>'terminee'
       or (coalesce(current_row.data->>'_numberFinalized','false')<>'true'
           and coalesce(p_data->>'_numberingScheme','')='dual-v1')) then
    perform pg_advisory_xact_lock(hashtext('agai-numbering'));
    numbered_stamp := regexp_replace(coalesce(p_data->>'_numberedAtStart',p_data->>'h',''),'[^0-9]','','g');
    numbered_year := substring(numbered_stamp from 1 for 4);
    numbered_month := substring(numbered_stamp from 1 for 6);
    if numbered_year !~ '^[0-9]{4}$' or numbered_month !~ '^[0-9]{6}$' then
      raise exception using errcode='22023', message='AGAI_INVALID_NUMBERING_PERIOD';
    end if;

    select coalesce(max((r.data->>'_numCaserne')::bigint),0) into existing_max
    from public.records r
    where r.id<>p_id and not r.deleted and r.type in ('iv','pilp')
      and coalesce(r.data->>'_lienPilp','false')<>'true'
      and r.caserne=p_caserne and r.data->>'s'='terminee'
      and (r.data->>'_numCaserne')~'^[0-9]+$'
      and substring(regexp_replace(coalesce(r.data->>'_numberedAtStart',r.data->>'h',''),'[^0-9]','','g') from 1 for 4)=numbered_year;
    allocated_number:=public.agai_allocate_number('final-ut:'||p_caserne,numbered_year,1,existing_max);
    p_data:=jsonb_set(p_data,'{_numCaserne}',to_jsonb(allocated_number),true);

    select coalesce(max((r.data->>'_numMois')::bigint),0) into existing_max
    from public.records r
    where r.id<>p_id and not r.deleted and r.type in ('iv','pilp')
      and coalesce(r.data->>'_lienPilp','false')<>'true'
      and r.caserne=p_caserne and r.data->>'s'='terminee'
      and (r.data->>'_numMois')~'^[0-9]+$'
      and substring(regexp_replace(coalesce(r.data->>'_numberedAtStart',r.data->>'h',''),'[^0-9]','','g') from 1 for 6)=numbered_month;
    allocated_number:=public.agai_allocate_number('final-month:'||p_caserne,numbered_month,1,existing_max);
    p_data:=jsonb_set(p_data,'{_numMois}',to_jsonb(allocated_number),true);

    if coalesce(p_data->>'_numGlobal',current_row.data->>'_numGlobal','')<>'' then
      select coalesce(max((r.data->>'_numGlobal')::bigint),0) into existing_max
      from public.records r
      where r.id<>p_id and not r.deleted and r.type in ('iv','pilp')
        and coalesce(r.data->>'_lienPilp','false')<>'true'
        and r.data->>'s'='terminee'
        and (r.data->>'_numGlobal')~'^[0-9]+$'
        and substring(regexp_replace(coalesce(r.data->>'_numberedAtStart',r.data->>'h',''),'[^0-9]','','g') from 1 for 4)=numbered_year;
      allocated_number:=public.agai_allocate_number('final-global',numbered_year,1,existing_max);
      p_data:=jsonb_set(p_data,'{_numGlobal}',to_jsonb(allocated_number),true);
    end if;
    p_data:=jsonb_set(p_data,'{_numberingScheme}',to_jsonb('dual-v1'::text),true);
    p_data:=jsonb_set(p_data,'{_numberFinalized}','true'::jsonb,true);
  end if;
$agai_patch$;
begin
  if atomic_function is null or health_function is null then
    raise exception 'AGAI : fonctions atomiques v238 absentes ; aucun changement effectué';
  end if;
  definition := pg_get_functiondef(atomic_function);
  health_definition := pg_get_functiondef(health_function);
  if position('AGAI_FINAL_NUMBERING_V1' in definition)>0 then
    raise notice 'AGAI : numérotation définitive déjà installée';
    return;
  end if;
  if position('AGAI_REVISION_CONFLICT' in definition)=0
     or position('''PT409''' in definition)=0
     or position('agai_allocate_number' in definition)=0
     or position(marker in definition)=0 then
    raise exception 'AGAI : définition atomique inattendue ; aucun changement effectué';
  end if;
  if position(health_marker in health_definition)=0 then
    raise exception 'AGAI : définition du contrôle de santé inattendue ; aucun changement effectué';
  end if;
  execute replace(definition,marker,finalization||E'\n'||marker);
  execute replace(health_definition,health_marker,
    $agai_health_patch$and r.data->>'s'='terminee' and coalesce(r.data->>'_lienPilp','false')<>'true' and coalesce(r.data->>'_numCaserne','')<>''$agai_health_patch$);
  raise notice 'AGAI : numérotation définitive à la clôture installée ; aucune fiche existante modifiée';
end;
$agai_migration$;

select position('AGAI_FINAL_NUMBERING_V1' in pg_get_functiondef(
  to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)')))>0
  as numerotation_definitive_active;
