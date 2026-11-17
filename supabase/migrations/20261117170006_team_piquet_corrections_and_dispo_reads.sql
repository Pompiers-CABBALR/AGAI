-- V202611_0045 : corrections ciblées des piquets validés et accusés de lecture
-- des demandes de disponibilité. Aucune semaine terminée n'est modifiable.
begin;

do $$
begin
  if pg_catalog.to_regprocedure(
      'agai_private.permit_replacement_write(text,jsonb,jsonb,text)') is null
    or pg_catalog.to_regprocedure(
      'agai_private.team_lead_piquet_scope(text,text)') is null
    or pg_catalog.to_regprocedure('agai_private.stamp_record_writer()') is null
    or not exists(select 1 from pg_catalog.pg_trigger
      where tgrelid='public.records'::pg_catalog.regclass
        and tgname='agai_stamp_record_writer' and not tgisinternal)
    or pg_catalog.strpos(pg_catalog.pg_get_functiondef(
      'agai_private.stamp_record_writer()'::pg_catalog.regprocedure),
      'replacement_write_allowed')=0
  then raise exception 'AGAI_PIQUET_CORRECTION_SCHEMA_PRECONDITION_FAILED'; end if;
end;
$$;

create table if not exists agai_private.dispo_request_reads(
  caserne text not null,
  request_id text not null,
  reader_login text not null,
  signature text not null,
  read_at timestamptz not null default now(),
  primary key(caserne,request_id,reader_login)
);
alter table agai_private.dispo_request_reads enable row level security;
revoke all on agai_private.dispo_request_reads from public,anon,authenticated;

create or replace function agai_private.dispo_notice_visible(
  p_caserne text,p_request jsonb,p_reader text
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.records team
    where team.caserne=p_caserne and team.type='equipe' and not team.deleted
      and team.data->>'resp'=p_reader
      and (
        team.data->'membres' ? (p_request->>'login')
        or team.data->'membres' ? (p_request->>'replacementLogin')
        or p_request->'notifiedLogins' ? p_reader
      )
  );
$$;
revoke all on function agai_private.dispo_notice_visible(text,jsonb,text)
  from public,anon,authenticated;

create or replace function agai_private.dispo_notice_signature(p_request jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'kind',p_request->'kind',
    'slots',p_request->'slots',
    'slotsDetail',p_request->'slotsDetail',
    'replacementLogin',p_request->'replacementLogin',
    'statut',p_request->'statut',
    'reponduPar',p_request->'reponduPar',
    'dateReponse',p_request->'dateReponse',
    'hReponse',p_request->'hReponse',
    'historique',p_request->'historique',
    'confirmePar',p_request->'confirmePar'
  )::text);
$$;
revoke all on function agai_private.dispo_notice_signature(jsonb)
  from public,anon,authenticated;

create or replace function public.agai_dispo_request_notices()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor record;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_DISPO_NOTICE_ACCESS_DENIED';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'recordId',item.id,'week',item.data->>'wk',
    'login',item.data->>'login','kind',item.data->>'kind',
    'statut',item.data->>'statut',
    'signature',item.signature,
    'readAt',case when ack.signature=item.signature
      then ack.read_at else null end
  ) order by item.updated_at desc),'[]'::jsonb) into result
  from (
    select r.id,r.caserne,r.data,r.updated_at,
      agai_private.dispo_notice_signature(r.data) as signature
    from public.records r
    where r.caserne=actor.caserne_id and r.type='dispoRequest'
      and not r.deleted and r.data->>'caserneId'=actor.caserne_id
      and r.id=actor.caserne_id||'__dispoRequest__'||(r.data->>'id')
      and (coalesce(r.data->>'dateDemande','')>='20261117'
        or r.data->>'statut' in ('en-attente','en-attente-responsable'))
      and agai_private.dispo_notice_visible(actor.caserne_id,r.data,actor.login)
    order by r.updated_at desc limit 200
  ) item
  left join agai_private.dispo_request_reads ack
    on ack.caserne=item.caserne and ack.request_id=item.id
      and ack.reader_login=actor.login;
  return result;
end;
$$;
revoke all on function public.agai_dispo_request_notices() from public,anon;
grant execute on function public.agai_dispo_request_notices() to authenticated;

create or replace function public.agai_mark_dispo_request_read(
  p_request_id text,p_signature text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor record;
  request_row public.records%rowtype;
  actual_signature text;
  seen_at timestamptz;
begin
  if auth.uid() is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
    or p_request_id is null or p_signature is null then
    raise exception 'AGAI_DISPO_NOTICE_ACCESS_DENIED';
  end if;
  select * into request_row from public.records
    where id=p_request_id and caserne=actor.caserne_id
      and type='dispoRequest' and not deleted for update;
  if not found or request_row.data->>'caserneId' is distinct from actor.caserne_id
    or request_row.id is distinct from
      actor.caserne_id||'__dispoRequest__'||(request_row.data->>'id')
    or not agai_private.dispo_notice_visible(
      actor.caserne_id,request_row.data,actor.login)
  then raise exception 'AGAI_DISPO_NOTICE_ACCESS_DENIED'; end if;
  actual_signature:=agai_private.dispo_notice_signature(request_row.data);
  if actual_signature is distinct from p_signature
  then raise exception 'AGAI_DISPO_NOTICE_CHANGED'; end if;
  insert into agai_private.dispo_request_reads(
    caserne,request_id,reader_login,signature,read_at)
  values(actor.caserne_id,p_request_id,actor.login,actual_signature,
    pg_catalog.clock_timestamp())
  on conflict(caserne,request_id,reader_login) do update
    set signature=excluded.signature,read_at=excluded.read_at
  returning read_at into seen_at;
  return pg_catalog.jsonb_build_object(
    'recordId',p_request_id,'signature',actual_signature,'readAt',seen_at);
end;
$$;
revoke all on function public.agai_mark_dispo_request_read(text,text)
  from public,anon;
grant execute on function public.agai_mark_dispo_request_read(text,text)
  to authenticated;

create or replace function public.agai_correct_validated_piquet(
  p_week text,p_expected jsonb,p_action text,p_index integer,
  p_next_piquet jsonb,p_reason text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor record;
  config_row public.records%rowtype;
  before_week jsonb;
  after_week jsonb;
  previous_piquet jsonb;
  changed_piquet jsonb;
  next_data jsonb;
  before_log jsonb;
  log_entry jsonb;
  current_week text:=pg_catalog.to_char(
    pg_catalog.date_trunc('week',now() at time zone 'Europe/Paris'),'YYYYMMDD');
  reason text:=pg_catalog.btrim(coalesce(p_reason,''));
  total integer;
  member jsonb;
  member_login text;
begin
  if auth.uid() is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
    or not agai_private.team_lead_piquet_scope(actor.caserne_id,'config')
    or p_week is null or p_week !~ '^[0-9]{8}$' or p_week<current_week
    or pg_catalog.to_char(pg_catalog.to_date(p_week,'YYYYMMDD'),'YYYYMMDD')<>p_week
    or extract(isodow from pg_catalog.to_date(p_week,'YYYYMMDD'))<>1
    or pg_catalog.jsonb_typeof(p_expected) is distinct from 'array'
    or p_action is null or p_action not in ('ajout','modification','suppression')
    or p_index is null or p_index<0
    or pg_catalog.length(reason)<10 or pg_catalog.length(reason)>500
  then raise exception 'AGAI_PIQUET_CORRECTION_ACCESS_DENIED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('agai-replacement:'||actor.caserne_id||':'||p_week));
  select * into config_row from public.records
    where id=actor.caserne_id||'__config__main'
      and caserne=actor.caserne_id and type='config' and not deleted
    for update;
  if not found or config_row.data->'piquetsValidated'->>p_week is distinct from 'true'
  then raise exception 'AGAI_PIQUET_WEEK_NOT_VALIDATED'; end if;
  before_week:=config_row.data->'piquets'->p_week;
  if pg_catalog.jsonb_typeof(before_week)<>'array'
    or before_week is distinct from p_expected
  then raise exception 'AGAI_PIQUET_REVISION_CONFLICT'; end if;
  total:=pg_catalog.jsonb_array_length(before_week);
  if (p_action='ajout' and p_index<>total)
    or (p_action<>'ajout' and p_index>=total)
  then raise exception 'AGAI_PIQUET_INDEX_INVALID'; end if;
  if p_action<>'ajout' then previous_piquet:=before_week->p_index; end if;
  if p_action='suppression' and p_next_piquet is not null
  then raise exception 'AGAI_PIQUET_CORRECTION_INVALID'; end if;
  if p_action<>'suppression' then
    if pg_catalog.jsonb_typeof(p_next_piquet) is distinct from 'object'
      or pg_catalog.length(coalesce(p_next_piquet->>'engin','')) not between 1 and 60
      or (pg_catalog.jsonb_typeof(config_row.data->'astrConfig'->'engins')='array'
        and pg_catalog.jsonb_array_length(config_row.data->'astrConfig'->'engins')>0
        and not (config_row.data->'astrConfig'->'engins' ? (p_next_piquet->>'engin')))
      or coalesce(p_next_piquet->>'jour','') not in
        ('Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche')
      or coalesce(p_next_piquet->>'debut','') !~
        '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(p_next_piquet->>'fin','') !~
        '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or p_next_piquet->>'debut'=p_next_piquet->>'fin'
      or pg_catalog.jsonb_typeof(p_next_piquet->'membres') is distinct from 'array'
      or pg_catalog.jsonb_array_length(p_next_piquet->'membres')>20
      or (select count(*)<>count(distinct elem.value->>'login')
        from pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(p_next_piquet->'membres')='array'
            then p_next_piquet->'membres' else '[]'::jsonb end) elem)
    then raise exception 'AGAI_PIQUET_CORRECTION_INVALID'; end if;
    for member in select value from pg_catalog.jsonb_array_elements(p_next_piquet->'membres')
    loop
      member_login:=member->>'login';
      if pg_catalog.jsonb_typeof(member) is distinct from 'object'
        or member_login is null or member_login=''
        or coalesce(member->>'hDebut','') !~
          '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(member->>'hFin','') !~
          '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or not exists(select 1 from public.records u
          where u.id=actor.caserne_id||'__user__'||member_login
            and u.caserne=actor.caserne_id and u.type='user' and not u.deleted)
      then raise exception 'AGAI_PIQUET_CORRECTION_MEMBER_INVALID'; end if;
    end loop;
  end if;
  if p_action='ajout' then
    after_week:=before_week||pg_catalog.jsonb_build_array(p_next_piquet);
  elsif p_action='modification' then
    after_week:=pg_catalog.jsonb_set(before_week,array[p_index::text],p_next_piquet,false);
  else
    select coalesce(pg_catalog.jsonb_agg(value order by ordinality),'[]'::jsonb)
      into after_week
      from pg_catalog.jsonb_array_elements(before_week) with ordinality entries(value,ordinality)
      where ordinality<>p_index+1;
  end if;
  if after_week is not distinct from before_week
  then raise exception 'AGAI_PIQUET_CORRECTION_UNCHANGED'; end if;
  changed_piquet:=coalesce(p_next_piquet,previous_piquet);
  next_data:=pg_catalog.jsonb_set(config_row.data,array['piquets',p_week],after_week,true);
  next_data:=pg_catalog.jsonb_set(next_data,'{piquets,_replacementRevision}',
    pg_catalog.to_jsonb(coalesce(
      (config_row.data->'piquets'->>'_replacementRevision')::bigint,0)+1),true);
  before_log:=case when pg_catalog.jsonb_typeof(next_data->'piquets'->'_log'->p_week)='array'
    then next_data->'piquets'->'_log'->p_week else '[]'::jsonb end;
  log_entry:=pg_catalog.jsonb_build_object(
    'apresValidation',true,
    'date',pg_catalog.to_char(pg_catalog.clock_timestamp() at time zone 'Europe/Paris',
      'DD/MM/YYYY HH24:MI:SS'),
    'auteur',actor.login,
    'action',p_action,
    'piquet',coalesce(changed_piquet->>'engin','')||' '
      ||coalesce(changed_piquet->>'jour','')||' '
      ||coalesce(changed_piquet->>'debut','')||'-'
      ||coalesce(changed_piquet->>'fin',''),
    'membres',coalesce((select pg_catalog.string_agg(elem.value->>'login',', ')
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(changed_piquet->'membres')='array'
          then changed_piquet->'membres' else '[]'::jsonb end) elem),'-'),
    'details',reason,'avant',previous_piquet,'apres',p_next_piquet);
  next_data:=pg_catalog.jsonb_set(next_data,'{piquets,_log}',
    case when pg_catalog.jsonb_typeof(next_data->'piquets'->'_log')='object'
      then next_data->'piquets'->'_log' else '{}'::jsonb end,true);
  next_data:=pg_catalog.jsonb_set(next_data,array['piquets','_log',p_week],
    before_log||pg_catalog.jsonb_build_array(log_entry),true);
  -- Le permis exact existant limite cette écriture au contenu calculé dans
  -- la transaction ; le garde des anciennes copies admin reste actif.
  perform agai_private.permit_replacement_write(
    config_row.id,config_row.data,next_data,actor.login);
  update public.records set data=next_data where id=config_row.id;
  delete from agai_private.replacement_write_permits
    where transaction_id=pg_catalog.txid_current();
  return pg_catalog.jsonb_build_object(
    'week',p_week,'piquets',after_week,'log',next_data->'piquets'->'_log'->p_week,
    'revision',next_data->'piquets'->'_replacementRevision');
end;
$$;
revoke all on function public.agai_correct_validated_piquet(
  text,jsonb,text,integer,jsonb,text) from public,anon;
grant execute on function public.agai_correct_validated_piquet(
  text,jsonb,text,integer,jsonb,text) to authenticated;

commit;
