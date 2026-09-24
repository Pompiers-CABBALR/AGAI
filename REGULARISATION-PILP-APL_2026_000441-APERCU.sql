-- APERÇU UNIQUEMENT : la dernière instruction est ROLLBACK.
-- Aucune fiche, journal ou compteur ne doit rester modifié après exécution.
-- Ne lancer qu'après sauvegarde et installation vérifiée du correctif serveur V25.
-- Ne jamais remplacer ROLLBACK par COMMIT sans nouvelle validation explicite.

begin;

do $agai_preview_000441$
declare
  source_record public.records%rowtype;
  pilp_record public.records%rowtype;
  response jsonb;
  function_definition text;
begin
  function_definition := pg_get_functiondef(to_regprocedure(
    'public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)'));
  if position('AGAI_PILP_LINKED_NUMBERING_V2' in coalesce(function_definition,''))=0 then
    raise exception 'AGAI : correctif serveur V25 absent ; aperçu annulé';
  end if;

  select * into source_record from public.records
  where id='CIS05__iv__APL_2026_000441-Rmuaz6bpd-b445f74101'
  for update;
  select * into pilp_record from public.records
  where id='CIS05__pilp__APL_2026_000441-Rmufstipm-9efc7781e3'
  for update;
  if source_record.id is null or pilp_record.id is null
     or source_record.deleted is distinct from false or pilp_record.deleted is distinct from false
     or source_record.caserne is distinct from 'CIS05' or source_record.type is distinct from 'iv'
     or pilp_record.caserne is distinct from 'CIS05' or pilp_record.type is distinct from 'pilp'
     or source_record.data->>'id' is distinct from 'APL_2026_000441-Rmuaz6bpd-b445f74101'
     or source_record.data->>'_numApl' is distinct from 'APL_2026_000441'
     or pilp_record.id is distinct from ('CIS05__pilp__'||coalesce(pilp_record.data->>'id',''))
     or pilp_record.data->>'ivRef' is distinct from source_record.data->>'id'
     or pilp_record.data->>'_numApl' is distinct from source_record.data->>'_numApl'
     or pilp_record.data->>'_createdAfterClosure' is distinct from 'false'
     or pilp_record.data->>'s' is distinct from 'en-attente'
     or source_record.data->>'s' is distinct from 'terminee'
     or source_record.data->>'_lienPilp' is distinct from 'true'
     or coalesce(source_record.data->>'_isRenfort','false')<>'false'
     or coalesce(source_record.data->>'_lienPilpSourceId','')<>''
     or source_record.data->>'_numberingScheme' is distinct from 'dual-v1'
     or source_record.data->>'_numberFinalized' is distinct from 'false'
     or source_record.data->>'_numCaserne' is distinct from '394'
     or source_record.data->>'_numMois' is distinct from '176' then
    raise exception 'AGAI : une des deux fiches a changé ou ne correspond pas au cas vérifié ; aperçu annulé';
  end if;

  response := public.agai_atomic_upsert_record(
    source_record.id,source_record.caserne,source_record.type,source_record.data,false,
    'maintenance-num-pilp-v25',
    coalesce(nullif(source_record.data->>'_statusRevision','')::bigint,0),
    coalesce(nullif(source_record.data->>'_serverRevision','')::bigint,0),
    'maintenance-sql','V202609_0025','apercu-num-pilp-APL_2026_000441'
  );
  if response->>'ok' is distinct from 'true'
     or response->'data'->>'_numberFinalized' is distinct from 'true'
     or coalesce(response->'data'->>'_numCaserne','')=''
     or coalesce(response->'data'->>'_numMois','')='' then
    raise exception 'AGAI : attribution non confirmée ; aperçu annulé';
  end if;
  raise notice 'APERÇU SANS ENREGISTREMENT : UT %, mois %, global %',
    response->'data'->>'_numCaserne',response->'data'->>'_numMois',response->'data'->>'_numGlobal';
end;
$agai_preview_000441$;

select id,data->>'s' as statut,
       data->>'_numberFinalized' as numero_confirme_pendant_aperçu,
       data->>'_numCaserne' as numero_ut_propose,
       data->>'_numMois' as numero_mois_propose,
       data->>'_numGlobal' as numero_global_propose
from public.records
where id='CIS05__iv__APL_2026_000441-Rmuaz6bpd-b445f74101';

rollback;

-- Vérification hors transaction : doit toujours renvoyer false et les anciens
-- numéros provisoires. Le numéro proposé peut changer lors d'une application future.
select id,data->>'_numberFinalized' as numero_confirme_apres_annulation,
       data->>'_numCaserne' as numero_ut_apres_annulation,
       data->>'_numMois' as numero_mois_apres_annulation
from public.records
where id='CIS05__iv__APL_2026_000441-Rmuaz6bpd-b445f74101';
