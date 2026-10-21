-- Registre partagé des éditions officielles. Activation initiale : désactivée.
-- Aucune fiche existante ni impression historique n'est modifiée.

create table if not exists agai_private.report_edition_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  start_date date,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into agai_private.report_edition_settings(singleton,enabled)
values(true,false) on conflict(singleton) do nothing;
alter table agai_private.report_edition_settings enable row level security;
revoke all on agai_private.report_edition_settings from public,anon,authenticated;

create table if not exists agai_private.report_editions (
  record_id text not null,
  edition_number integer not null check (edition_number > 0),
  caserne text not null,
  report_type text not null check (report_type in ('iv','pilp','activite','fmpa')),
  action_key uuid not null unique,
  issued_by text not null,
  issued_by_uid uuid not null,
  record_updated_at timestamptz not null,
  issued_at timestamptz not null default now(),
  primary key(record_id,edition_number)
);
create index if not exists agai_report_editions_station_idx
  on agai_private.report_editions(caserne,issued_at desc);
alter table agai_private.report_editions enable row level security;
revoke all on agai_private.report_editions from public,anon,authenticated;

create or replace function agai_private.report_edition_state(p_ids text[])
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  settings record;
  items jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_login,false) then
    raise exception 'AGAI_REPORT_ACCESS_DENIED';
  end if;
  if p_ids is null or cardinality(p_ids)>200 or array_position(p_ids,null) is not null then
    raise exception 'AGAI_REPORT_INVALID_REQUEST';
  end if;
  select enabled,start_date into settings
    from agai_private.report_edition_settings where singleton=true;
  select coalesce(jsonb_object_agg(r.id,jsonb_build_object(
      'count',(select count(*) from agai_private.report_editions e where e.record_id=r.id)
        + (select count(*) from jsonb_array_elements(case
          when jsonb_typeof(r.data->case when r.type in ('iv','pilp')
            then '_impressions' else 'impressions' end)='array'
          then r.data->case when r.type in ('iv','pilp')
            then '_impressions' else 'impressions' end
          else '[]'::jsonb end) as legacy(entry)
          where legacy.entry->>'type' is distinct from 'rapport_officiel'),
      'updatedAt',r.updated_at
    )),'{}'::jsonb) into items
    from public.records r
    where r.id=any(p_ids) and r.type in ('iv','pilp','activite','fmpa')
      and not coalesce(r.deleted,false)
      and (r.caserne=actor.caserne_id or actor.app_role='superadmin');
  return jsonb_build_object('enabled',coalesce(settings.enabled,false),
    'startDate',settings.start_date,'items',items);
end;
$function$;
revoke execute on function agai_private.report_edition_state(text[])
  from public,anon,authenticated;
create or replace function public.agai_report_edition_state(p_ids text[])
returns jsonb language sql security definer set search_path = ''
as $function$
  select agai_private.report_edition_state(p_ids);
$function$;
revoke execute on function public.agai_report_edition_state(text[])
  from public,anon,authenticated;
grant execute on function public.agai_report_edition_state(text[])
  to authenticated;

create or replace function agai_private.set_report_edition_settings(
  p_enabled boolean,p_start_date date
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare actor record; result record;
begin
  if (select auth.uid()) is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or actor.app_role<>'superadmin' or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_REPORT_SUPERADMIN_REQUIRED';
  end if;
  if p_enabled is null or (p_enabled and p_start_date is null)
     or (p_start_date is not null and (p_start_date < date '2020-01-01'
       or p_start_date > (now() at time zone 'Europe/Paris')::date + 365)) then
    raise exception 'AGAI_REPORT_INVALID_SETTINGS';
  end if;
  update agai_private.report_edition_settings
    set enabled=p_enabled,start_date=p_start_date,updated_at=now(),updated_by=actor.login
    where singleton=true returning enabled,start_date into result;
  return jsonb_build_object('enabled',result.enabled,'startDate',result.start_date);
end;
$function$;
revoke execute on function agai_private.set_report_edition_settings(boolean,date)
  from public,anon,authenticated;
create or replace function public.agai_set_report_edition_settings(
  p_enabled boolean,p_start_date date
) returns jsonb language sql security definer set search_path = ''
as $function$
  select agai_private.set_report_edition_settings(p_enabled,p_start_date);
$function$;
revoke execute on function public.agai_set_report_edition_settings(boolean,date)
  from public,anon,authenticated;
grant execute on function public.agai_set_report_edition_settings(boolean,date)
  to authenticated;

create or replace function agai_private.issue_report_edition(
  p_id text,p_expected_count integer,p_expected_updated_at timestamptz,p_action_key uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  settings record;
  report_row public.records%rowtype;
  existing agai_private.report_editions%rowtype;
  issue_count integer;
  legacy_count integer;
  report_date text;
  owner_login text;
begin
  if (select auth.uid()) is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_REPORT_ACCESS_DENIED';
  end if;
  if p_id is null or length(p_id)>180 or p_expected_count is null
     or p_expected_count<0 or p_expected_updated_at is null or p_action_key is null then
    raise exception 'AGAI_REPORT_INVALID_REQUEST';
  end if;
  -- Serialise les émissions concurrentes d'un même rapport.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('agai-report-edition:'||p_id));
  select * into existing from agai_private.report_editions where action_key=p_action_key;
  if found then
    if existing.record_id<>p_id or existing.issued_by_uid<>(select auth.uid()) then
      raise exception 'AGAI_REPORT_KEY_REUSED';
    end if;
    return jsonb_build_object('number',existing.edition_number,
      'kind',case when existing.edition_number=1 then 'original' else 'duplicata' end,
      'issuedAt',existing.issued_at);
  end if;
  select enabled,start_date into settings
    from agai_private.report_edition_settings where singleton=true;
  if not found or not settings.enabled or settings.start_date is null then
    raise exception 'AGAI_REPORT_NOT_ACTIVATED';
  end if;
  select * into report_row from public.records
    where id=p_id and type in ('iv','pilp','activite','fmpa')
      and not coalesce(deleted,false) for share;
  if not found or (report_row.caserne<>actor.caserne_id and actor.app_role<>'superadmin') then
    raise exception 'AGAI_REPORT_NOT_FOUND';
  end if;
  if report_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'AGAI_REPORT_CHANGED';
  end if;
  report_date:=case when report_row.type in ('iv','pilp')
    then left(coalesce(report_row.data->>'h',''),8)
    else replace(coalesce(report_row.data->>'date',''),'-','') end;
  if report_date !~ '^20[0-9]{6}$'
     or report_date < to_char(settings.start_date,'YYYYMMDD') then
    raise exception 'AGAI_REPORT_BEFORE_START';
  end if;
  if report_row.type in ('iv','pilp') then
    if report_row.data->>'s'<>'terminee'
      or report_row.data->>'_crValide'<>'true' then
      raise exception 'AGAI_REPORT_NOT_FINAL';
    end if;
    owner_login:=coalesce(report_row.data->>'agr','');
  elsif report_row.type='activite' then
    if btrim(coalesce(report_row.data->>'cr',''))='' then
      raise exception 'AGAI_REPORT_NOT_FINAL';
    end if;
    owner_login:=coalesce(report_row.data->>'auteur','');
  else
    owner_login:=coalesce(report_row.data->>'auteur','');
  end if;
  select count(*) into legacy_count from jsonb_array_elements(case
    when jsonb_typeof(report_row.data->case when report_row.type in ('iv','pilp')
      then '_impressions' else 'impressions' end)='array'
    then report_row.data->case when report_row.type in ('iv','pilp')
      then '_impressions' else 'impressions' end
    else '[]'::jsonb end) as legacy(entry)
    where legacy.entry->>'type' is distinct from 'rapport_officiel';
  select count(*)+legacy_count into issue_count
    from agai_private.report_editions where record_id=p_id;
  if issue_count<>p_expected_count then
    raise exception 'AGAI_REPORT_EDITION_CONFLICT';
  end if;
  if issue_count=0 then
    if actor.login<>owner_login and not (report_row.type in ('iv','pilp')
      and actor.login=coalesce(report_row.data->>'_agr2','')) then
      raise exception 'AGAI_REPORT_OWNER_REQUIRED';
    end if;
  elsif actor.app_role not in ('administrateur_caserne','superadmin') then
    raise exception 'AGAI_REPORT_ADMIN_REQUIRED';
  end if;
  insert into agai_private.report_editions(record_id,edition_number,caserne,
    report_type,action_key,issued_by,issued_by_uid,record_updated_at)
    values(p_id,issue_count+1,report_row.caserne,report_row.type,p_action_key,
      actor.login,(select auth.uid()),report_row.updated_at)
    returning * into existing;
  return jsonb_build_object('number',existing.edition_number,
    'kind',case when existing.edition_number=1 then 'original' else 'duplicata' end,
    'issuedAt',existing.issued_at);
end;
$function$;
revoke execute on function agai_private.issue_report_edition(text,integer,timestamptz,uuid)
  from public,anon,authenticated;
create or replace function public.agai_issue_report_edition(
  p_id text,p_expected_count integer,p_expected_updated_at timestamptz,p_action_key uuid
) returns jsonb language sql security definer set search_path = ''
as $function$
  select agai_private.issue_report_edition(p_id,p_expected_count,p_expected_updated_at,p_action_key);
$function$;
revoke execute on function public.agai_issue_report_edition(text,integer,timestamptz,uuid)
  from public,anon,authenticated;
grant execute on function public.agai_issue_report_edition(text,integer,timestamptz,uuid)
  to authenticated;
