-- Change the SDIS classification of an existing pending intervention only.
-- No APL allocation, record creation, or operational-status transition.
begin;

create or replace function agai_private.toggle_pending_intervention_sdis(
  p_record_id text,
  p_sdis boolean,
  p_action_key uuid,
  p_expected_record_revision bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  source_row public.records%rowtype;
  source_revision bigint;
  status_revision bigint;
  source_data jsonb;
  stamp text := to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI');
begin
  if (select auth.uid()) is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or actor.app_role not in ('superadmin','administrateur_caserne') then
    raise exception 'AGAI_SDIS_CLASSIFICATION_ROLE_FORBIDDEN';
  end if;
  if p_record_id is null or p_sdis is null or p_action_key is null
     or p_expected_record_revision is null or p_expected_record_revision<0 then
    raise exception 'AGAI_SDIS_CLASSIFICATION_INVALID_REQUEST';
  end if;

  perform pg_advisory_xact_lock(hashtext('agai-record:'||p_record_id));
  select * into source_row from public.records
    where id=p_record_id and type='iv' and not deleted for update;
  if not found then raise exception 'AGAI_SDIS_CLASSIFICATION_SOURCE_FORBIDDEN'; end if;
  if actor.app_role<>'superadmin' and source_row.caserne<>actor.caserne_id then
    raise exception 'AGAI_SDIS_CLASSIFICATION_SOURCE_FORBIDDEN';
  end if;
  if source_row.data->>'_sdisChangeActionKey'=p_action_key::text then
    if coalesce(source_row.data->>'_sdis','false')=(case when p_sdis then 'true' else 'false' end) then
      return jsonb_build_object('ok',true,'recordId',p_record_id,'sdis',p_sdis);
    end if;
    raise exception 'AGAI_SDIS_CLASSIFICATION_STALE_SOURCE';
  end if;
  if source_row.data->>'s' is distinct from 'en-attente'
     or coalesce(source_row.data->>'_isRenfort','false')='true'
     or coalesce(source_row.data->>'_isPilip','false')='true'
     or coalesce(source_row.data->>'_lienPilp','false')='true'
     or nullif(source_row.data->>'_pilpId','') is not null then
    raise exception 'AGAI_SDIS_CLASSIFICATION_SOURCE_FORBIDDEN';
  end if;
  source_revision:=coalesce(nullif(source_row.data->>'_serverRevision','')::bigint,0);
  status_revision:=coalesce(nullif(source_row.data->>'_statusRevision','')::bigint,0);
  if source_revision<>p_expected_record_revision then
    raise exception 'AGAI_SDIS_CLASSIFICATION_STALE_SOURCE';
  end if;
  if coalesce(source_row.data->>'_sdis','false')=(case when p_sdis then 'true' else 'false' end) then
    raise exception 'AGAI_SDIS_CLASSIFICATION_ALREADY_SET';
  end if;

  source_data:=source_row.data || jsonb_build_object(
    '_sdis',p_sdis,
    '_sdisChangeActionKey',p_action_key::text,
    'tl',coalesce(source_row.data->'tl','[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
        's','modif','h',stamp,'who',actor.login,
        'note',case when p_sdis then 'Classification modifiée : SDIS'
                    else 'Classification modifiée : non SDIS' end))
  );
  perform public.agai_atomic_upsert_record(
    p_record_id,source_row.caserne,'iv',source_data,false,
    actor.login,status_revision,source_revision,'','sdis-classification',
    'sdis-classification:'||p_action_key::text);
  return jsonb_build_object('ok',true,'recordId',p_record_id,'sdis',p_sdis);
end;
$function$;

revoke execute on function agai_private.toggle_pending_intervention_sdis(
  text,boolean,uuid,bigint) from public,anon,authenticated;

create or replace function public.agai_toggle_pending_intervention_sdis(
  p_record_id text,
  p_sdis boolean,
  p_action_key uuid,
  p_expected_record_revision bigint
) returns jsonb
language sql security definer set search_path = ''
as $function$
  select agai_private.toggle_pending_intervention_sdis($1,$2,$3,$4);
$function$;
revoke execute on function public.agai_toggle_pending_intervention_sdis(
  text,boolean,uuid,bigint) from public,anon,authenticated;
grant execute on function public.agai_toggle_pending_intervention_sdis(
  text,boolean,uuid,bigint) to authenticated;

commit;
