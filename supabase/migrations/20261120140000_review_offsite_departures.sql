-- Contrôle administratif des départs hors caserne. Aucune fiche existante
-- n'est réécrite par la migration : la décision s'applique fiche par fiche.
begin;

create or replace function agai_private.guard_offsite_review_write()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if current_setting('agai.offsite_review_rpc',true) is distinct from 'on' then
    if tg_op='INSERT' then
      if new.data ? '_departGeoReview' or new.data ? '_departGeoReviewHistory' then
        raise exception 'AGAI_OFFSITE_REVIEW_RPC_REQUIRED';
      end if;
    elsif new.data->'_departGeoReview' is distinct from old.data->'_departGeoReview'
       or new.data->'_departGeoReviewHistory' is distinct from old.data->'_departGeoReviewHistory' then
      raise exception 'AGAI_OFFSITE_REVIEW_RPC_REQUIRED';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists agai_guard_offsite_review_write on public.records;
create trigger agai_guard_offsite_review_write before insert or update on public.records
for each row execute function agai_private.guard_offsite_review_write();

create or replace function public.agai_review_offsite_departure(
  p_record_id text, p_status text, p_reason text, p_source_date text,
  p_expected_record_revision bigint, p_route_seconds numeric,
  p_route_distance_meters numeric, p_route_resource_version text, p_action_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  actor record;
  row_before public.records%rowtype;
  control jsonb;
  review jsonb;
  history jsonb;
  changed jsonb;
  response jsonb;
  original_time text;
  retained_time text;
  old_time text;
  original_at timestamp;
  retained_at timestamp;
  end_at timestamp;
  end_day text;
  end_hour text;
  is_sdis boolean;
  route_minutes integer := 0;
  stamp text := to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI');
begin
  if (select auth.uid()) is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or actor.app_role not in ('superadmin','administrateur_caserne') then
    raise exception 'AGAI_OFFSITE_REVIEW_ROLE_FORBIDDEN';
  end if;
  if p_record_id is null or p_action_id is null or p_source_date is null
     or p_expected_record_revision is null or p_expected_record_revision<0
     or p_status is null or p_status not in ('justifie','refuse')
     or length(btrim(coalesce(p_reason,'')))<10 or length(p_reason)>500 then
    raise exception 'AGAI_OFFSITE_REVIEW_INVALID_REQUEST';
  end if;
  perform pg_advisory_xact_lock(hashtext('agai-record:'||p_record_id));
  select * into row_before from public.records
    where id=p_record_id and type in ('iv','pilp') and not deleted for update;
  if not found then raise exception 'AGAI_OFFSITE_REVIEW_NOT_FOUND'; end if;
  if actor.app_role<>'superadmin' and row_before.caserne<>actor.caserne_id then
    raise exception 'AGAI_OFFSITE_REVIEW_STATION_FORBIDDEN';
  end if;
  is_sdis:=coalesce(row_before.data->>'_sdis','false')='true';
  control:=row_before.data->'_departGeoControle';
  if row_before.data->>'s' is distinct from 'terminee'
     or control is null or control->>'horsCaserne' is distinct from 'true'
     or control->>'date' is distinct from p_source_date
     or p_source_date !~ '^[0-9]{8}_[0-9]{4}$' then
    raise exception 'AGAI_OFFSITE_REVIEW_SOURCE_FORBIDDEN';
  end if;
  if coalesce(control->>'distanceMetres','') !~ '^[0-9]+(\.[0-9]+)?$'
     or coalesce(control->>'precisionMetres','') !~ '^[0-9]+(\.[0-9]+)?$'
     or (control->>'distanceMetres')::numeric <= 2000+(control->>'precisionMetres')::numeric
     or (control->>'precisionMetres')::numeric > 250 then
    raise exception 'AGAI_OFFSITE_REVIEW_GPS_UNCONFIRMED';
  end if;
  review:=row_before.data->'_departGeoReview';
  if review->>'actionId'=p_action_id::text then
    return jsonb_build_object('ok',true,'data',row_before.data,'recordRevision',
      coalesce(nullif(row_before.data->>'_serverRevision','')::bigint,0));
  end if;
  if coalesce(nullif(row_before.data->>'_serverRevision','')::bigint,0)
     <>p_expected_record_revision then
    raise exception 'AGAI_OFFSITE_REVIEW_STALE_SOURCE';
  end if;
  original_time:=substring(p_source_date from 10 for 2)||':'||substring(p_source_date from 12 for 2);
  original_at:=make_timestamp(
    substring(p_source_date from 1 for 4)::integer,
    substring(p_source_date from 5 for 2)::integer,
    substring(p_source_date from 7 for 2)::integer,
    substring(p_source_date from 10 for 2)::integer,
    substring(p_source_date from 12 for 2)::integer,0);
  retained_at:=original_at;
  if p_status='refuse' and not is_sdis then
    if coalesce(control->>'latitude','') !~ '^-?[0-9]+(\.[0-9]+)?$'
       or coalesce(control->>'longitude','') !~ '^-?[0-9]+(\.[0-9]+)?$'
       or p_route_seconds is null or p_route_seconds<=0 or p_route_seconds>10800
       or p_route_distance_meters is null or p_route_distance_meters<=0
       or p_route_distance_meters>300000
       or p_route_distance_meters+500<(control->>'distanceMetres')::numeric then
      raise exception 'AGAI_OFFSITE_REVIEW_ROUTE_INVALID';
    end if;
    route_minutes:=ceil(p_route_seconds/60)::integer;
    retained_at:=original_at+make_interval(mins=>route_minutes);
    if retained_at::date<>original_at::date then
      raise exception 'AGAI_OFFSITE_REVIEW_CROSSES_MIDNIGHT';
    end if;
  end if;
  old_time:=coalesce(row_before.data->>'_hDebut','');
  retained_time:=case when is_sdis then old_time else to_char(retained_at,'HH24:MI') end;
  end_hour:=row_before.data->>'_hFin';
  end_day:=coalesce(nullif(regexp_replace(row_before.data->>'_dateFin','[^0-9]','','g'),''),
    to_char(original_at,'YYYYMMDD'));
  if end_hour !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or end_day !~ '^[0-9]{8}$' then
    raise exception 'AGAI_OFFSITE_REVIEW_END_UNKNOWN';
  end if;
  end_at:=make_timestamp(substring(end_day from 1 for 4)::integer,
    substring(end_day from 5 for 2)::integer,substring(end_day from 7 for 2)::integer,
    substring(end_hour from 1 for 2)::integer,substring(end_hour from 4 for 2)::integer,0);
  if end_at<original_at then end_at:=end_at+interval '1 day'; end if;
  if not is_sdis and retained_at>=end_at then raise exception 'AGAI_OFFSITE_REVIEW_AFTER_END'; end if;
  history:=coalesce(row_before.data->'_departGeoReviewHistory','[]'::jsonb);
  if jsonb_typeof(history)<>'array' then raise exception 'AGAI_OFFSITE_REVIEW_HISTORY_INVALID'; end if;
  review:=jsonb_build_object('status',p_status,'sourceDate',p_source_date,
    'originalStart',original_time,'previousRetainedStart',old_time,
    'retainedStart',retained_time,'retainedAt',case when is_sdis then null else to_char(retained_at,'YYYY-MM-DD"T"HH24:MI:SS') end,
    'indemnityBasis',case when is_sdis then 'sdis-acquis' else 'departure' end,
    'routeMinutes',route_minutes,'routeSeconds',case when p_status='refuse' and not is_sdis then p_route_seconds else null end,
    'routeDistanceMeters',case when p_status='refuse' and not is_sdis then p_route_distance_meters else null end,
    'routeResourceVersion',case when p_status='refuse' and not is_sdis then left(coalesce(p_route_resource_version,''),60) else null end,
    'routeMethod',case when p_status='refuse' and not is_sdis then 'IGN bdtopo-osrm/car/fastest, sans trafic historique' else null end,
    'gpsLatitude',control->'latitude','gpsLongitude',control->'longitude',
    'gpsAccuracyMeters',control->'precisionMetres','stationId',row_before.caserne,
    'reason',btrim(p_reason),'reviewedBy',actor.login,
    'reviewedAt',to_char(now() at time zone 'Europe/Paris','YYYY-MM-DD"T"HH24:MI:SS'),
    'actionId',p_action_id::text);
  changed:=row_before.data||jsonb_build_object(
    '_departGeoReview',review,'_departGeoReviewHistory',history||jsonb_build_array(review),
    'tl',coalesce(row_before.data->'tl','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      's','modif','h',stamp,'who',actor.login,
      'note','Contrôle départ hors caserne : '||case when p_status='justifie' then 'justifié' else 'heure refusée' end
        ||' ; heure GPS '||original_time||' ; '||(case when is_sdis then 'acquis présence SDIS inchangé' else 'retenue '||retained_time end)
        ||' ; '||btrim(p_reason)))
  );
  if not is_sdis then
    changed:=changed||jsonb_build_object(
      '_hDebut',retained_time,
      '_hDebutReelle',coalesce(nullif(row_before.data->>'_hDebutReelle',''),original_time),
      '_hDebutInitiale',coalesce(nullif(row_before.data->>'_hDebutInitiale',''),original_time),
      '_heureDebutModifiee',old_time is distinct from retained_time);
  end if;
  if not is_sdis and old_time is distinct from retained_time then
    changed:=jsonb_set(changed,'{_heureDebutModifs}',
      coalesce(row_before.data->'_heureDebutModifs','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'ancienne',old_time,'nouvelle',retained_time,'reelle',original_time,
        'auteur',actor.login,'horodatage',stamp,'administrateur',true,
        'motif','Contrôle départ hors caserne : '||btrim(p_reason))),true);
  end if;
  perform set_config('agai.offsite_review_rpc','on',true);
  response:=public.agai_atomic_upsert_record(p_record_id,row_before.caserne,row_before.type,
    changed,false,actor.login,
    coalesce(nullif(row_before.data->>'_statusRevision','')::bigint,0),
    p_expected_record_revision,'','offsite-review','offsite-review:'||p_action_id::text);
  return response;
end;
$function$;

revoke all on function public.agai_review_offsite_departure(
  text,text,text,text,bigint,numeric,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.agai_review_offsite_departure(
  text,text,text,text,bigint,numeric,numeric,text,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
