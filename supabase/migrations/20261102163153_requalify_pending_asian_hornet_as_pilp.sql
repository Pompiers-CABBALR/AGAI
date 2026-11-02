-- Requalifier un appel encore en attente, sans nouvel APL ni reconnaissance fictive.
-- Les deux fiches sont écrites dans la même transaction ; l'ancienne est
-- conservée comme archive technique et son historique est copié dans la PILP.
begin;

create or replace function agai_private.requalify_pending_pilp(
  p_source_record_id text,
  p_operator_login text,
  p_declared_height numeric,
  p_action_key uuid,
  p_expected_record_revision bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  source_row public.records%rowtype;
  pilp_id text;
  pilp_record_id text;
  source_revision bigint;
  source_status_revision bigint;
  stamp text := to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI');
  operator_login text := btrim(coalesce(p_operator_login,''));
  source_data jsonb;
  pilp_data jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or actor.app_role not in ('superadmin','administrateur_caserne') then
    raise exception 'AGAI_PILP_REQUAL_ROLE_FORBIDDEN';
  end if;
  if p_source_record_id is null or p_action_key is null
     or p_expected_record_revision is null
     or operator_login='' or length(operator_login)>120
     or p_declared_height is null or p_declared_height<=0 or p_declared_height>100 then
    raise exception 'AGAI_PILP_REQUAL_INVALID_REQUEST';
  end if;

  perform pg_advisory_xact_lock(hashtext('agai-record:'||p_source_record_id));
  select * into source_row from public.records
    where id=p_source_record_id and type='iv' and not deleted for update;
  if not found or source_row.caserne<>actor.caserne_id
     and actor.app_role<>'superadmin' then
    raise exception 'AGAI_PILP_REQUAL_SOURCE_FORBIDDEN';
  end if;
  if source_row.data->>'_pilpRequalActionKey'=p_action_key::text then
    pilp_id:=source_row.data->>'_pilpRequalifiedTo';
    pilp_record_id:=source_row.caserne||'__pilp__'||pilp_id;
    if pilp_id is not null and exists (
      select 1 from public.records where id=pilp_record_id and type='pilp' and not deleted
    ) then
      return jsonb_build_object('ok',true,'pilpId',pilp_id,
        'sourceRecordId',p_source_record_id,'pilpRecordId',pilp_record_id);
    end if;
  end if;
  if source_row.data->>'s' is distinct from 'en-attente'
     or source_row.data->>'n' is distinct from 'Nid de frelons asiatiques'
     or coalesce(source_row.data->>'_numApl','') !~ '^APL_[0-9]{4}_[0-9]+$'
     or nullif(source_row.data->>'agr','') is not null
     or coalesce(source_row.data->>'_isRenfort','false')='true'
     or coalesce(source_row.data->>'_sdis','false')='true'
     or coalesce(source_row.data->>'_lienPilp','false')='true'
     or nullif(source_row.data->>'_pilpId','') is not null
     or nullif(source_row.data->>'_pilpRequalifiedTo','') is not null then
    raise exception 'AGAI_PILP_REQUAL_SOURCE_FORBIDDEN';
  end if;
  if nullif(source_row.data->>'op','') is not null
     and source_row.data->>'op'<>operator_login then
    raise exception 'AGAI_PILP_REQUAL_OPERATOR_MISMATCH';
  end if;
  if nullif(source_row.data->>'op','') is null and not exists (
    select 1 from public.records personnel
      where personnel.id=source_row.caserne||'__user__'||operator_login
        and personnel.type='user' and not personnel.deleted
  ) then
    raise exception 'AGAI_PILP_REQUAL_OPERATOR_UNKNOWN';
  end if;
  source_revision:=coalesce(nullif(source_row.data->>'_serverRevision','')::bigint,0);
  source_status_revision:=coalesce(nullif(source_row.data->>'_statusRevision','')::bigint,0);
  if source_revision<>p_expected_record_revision then
    raise exception 'AGAI_PILP_REQUAL_STALE_SOURCE';
  end if;

  pilp_id:='PILP-'||(source_row.data->>'id');
  pilp_record_id:=source_row.caserne||'__pilp__'||pilp_id;
  if exists (select 1 from public.records where id=pilp_record_id) then
    raise exception 'AGAI_PILP_REQUAL_ALREADY_PROCESSED';
  end if;
  pilp_data:=(source_row.data - '_serverRevision' - '_statusRevision'
      - '_statusChangeId' - '_isPilip') || jsonb_build_object(
    'id',pilp_id,'_numApl',source_row.data->>'_numApl',
    'n','Nid de frelons asiatiques — PILP','op',operator_login,
    'ivRef',source_row.data->>'id','s','en-attente','agr',null,'tireur',null,
    'hauteur',p_declared_height,
    'localisation',source_row.data->'_nidsAppel'->0->>'localisation',
    '_nidsAppel',case
      when jsonb_array_length(case
        when jsonb_typeof(source_row.data->'_nidsAppel')='array'
          then source_row.data->'_nidsAppel' else '[]'::jsonb end)>0
      then jsonb_set(source_row.data->'_nidsAppel','{0,hauteur}',
        to_jsonb(p_declared_height::text||' m'),true)
      else jsonb_build_array(jsonb_build_object(
        'nature','Frelons asiatiques','hauteur',p_declared_height::text||' m'))
      end,
    'reconnaissanceFaite',false,'_pilpReconnaissanceChef',null,
    '_pilpReconnaissanceRecordedAt',null,'_pilpReconnaissanceRecordedBy',null,
    'axeTir',null,'_axeTirEtat','a-verifier',
    '_pilpPeriode','a-determiner','_pilpPeriodePrecision','',
    '_pilpPlanningUpdatedAt',(extract(epoch from now())*1000)::bigint,
    '_pilpPlanningUpdatedBy',actor.login,
    '_requalifiedFromRecordId',p_source_record_id,
    '_requalifiedBy',actor.login,'_requalifiedAt',stamp,
    '_appelDetails',(case when jsonb_typeof(source_row.data->'_appelDetails')='object'
      then source_row.data->'_appelDetails' else '{}'::jsonb end) ||
      jsonb_build_object('Hauteur déclarée',p_declared_height::text||' m',
        'Reconnaissance','Non réalisée'),
    'tl',coalesce(source_row.data->'tl','[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object('s','info-compl','h',stamp,
        'who',actor.login,'note','Appel requalifié en PILP ; hauteur déclarée '
          ||p_declared_height::text||' m ; reconnaissance non réalisée'))
  );
  perform public.agai_atomic_upsert_record(
    pilp_record_id,source_row.caserne,'pilp',pilp_data,false,
    actor.login,0,0,'','pilp-requal','pilp-requal-create:'||p_action_key::text);

  source_data:=source_row.data || jsonb_build_object(
    's','annulee','_isPilip',true,'_lienPilp',true,'_pilpId',pilp_id,
    '_pilpRequalifiedTo',pilp_id,
    '_pilpRequalActionKey',p_action_key::text,
    '_statusRevision',source_status_revision+1,
    'tl',coalesce(source_row.data->'tl','[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object('s','annulee','h',stamp,
        'who',actor.login,'note','Requalifiée en PILP '||pilp_id))
  );
  perform public.agai_atomic_upsert_record(
    p_source_record_id,source_row.caserne,'iv',source_data,false,
    actor.login,source_status_revision,source_revision,'','pilp-requal',
    'pilp-requal-archive:'||p_action_key::text);
  return jsonb_build_object('ok',true,'pilpId',pilp_id,
    'sourceRecordId',p_source_record_id,'pilpRecordId',pilp_record_id);
end;
$function$;

revoke execute on function agai_private.requalify_pending_pilp(
  text,text,numeric,uuid,bigint) from public,anon,authenticated;

create or replace function public.agai_requalify_pending_pilp(
  p_source_record_id text,
  p_operator_login text,
  p_declared_height numeric,
  p_action_key uuid,
  p_expected_record_revision bigint
) returns jsonb
language sql security definer set search_path = ''
as $function$
  select agai_private.requalify_pending_pilp($1,$2,$3,$4,$5);
$function$;
revoke execute on function public.agai_requalify_pending_pilp(
  text,text,numeric,uuid,bigint) from public,anon,authenticated;
grant execute on function public.agai_requalify_pending_pilp(
  text,text,numeric,uuid,bigint) to authenticated;

commit;
