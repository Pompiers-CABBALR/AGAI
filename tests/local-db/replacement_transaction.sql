-- Banc d'essai PostgreSQL local : ces RPC ne sont PAS prêtes pour la production.
-- Il manque notamment l'intégration au déclencheur records et aux RLS réels,
-- ainsi que le protocole de synchronisation des écritures côté navigateur.
create table if not exists public.records(
  id text primary key, caserne text not null, type text not null,
  data jsonb not null, deleted boolean not null default false
);

-- Même fenêtre que formationUnavailableWindow : sur plusieurs journées
-- sélectionnées, l'absence va du début de la première à la fin de la dernière.
create or replace function agai_private.replacement_training_overlaps(
  p_training jsonb,p_login text,p_start timestamp,p_end timestamp
) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  first_day date;
  last_day date;
  first_minute integer:=0;
  last_minute integer:=1440;
  pair text[];
  from_minutes integer;
  to_minutes integer;
  any_time boolean:=false;
  precise boolean:=true;
  start_at timestamp;
  end_at timestamp;
begin
  if p_end<=p_start or not coalesce(p_training->'participants','[]'::jsonb) ? p_login
  then return false; end if;
  if pg_catalog.jsonb_typeof(p_training->'joursFormation')='array' then
    select min(value::date),max(value::date) into first_day,last_day
      from pg_catalog.jsonb_array_elements_text(p_training->'joursFormation')
      where value ~ '^\d{4}-\d{2}-\d{2}$';
    if first_day is null then return false; end if;
  else
    -- Les anciennes formations sans joursFormation sont traitées comme
    -- potentiellement actives sur toute leur période (refus conservateur).
    if p_training->>'ddebut' !~ '^\d{4}-\d{2}-\d{2}$'
      or p_training->>'dfin' !~ '^\d{4}-\d{2}-\d{2}$'
    then return false; end if;
    first_day:=(p_training->>'ddebut')::date;
    last_day:=(p_training->>'dfin')::date;
  end if;
  if last_day<first_day then return false; end if;
  for pair in select array[fields.start_time,fields.end_time] from (values
    (p_training->>'hmatind',p_training->>'hmatinf'),
    (p_training->>'hapremd',p_training->>'hapremf')
  ) fields(start_time,end_time)
  loop
    if coalesce(pair[1],'')='' and coalesce(pair[2],'')='' then continue; end if;
    any_time:=true;
    if pair[1] !~ '^([01]?\d|2[0-3]):[0-5]\d$'
      or pair[2] !~ '^([01]?\d|2[0-3]):[0-5]\d$'
    then precise:=false; exit; end if;
    from_minutes:=pg_catalog.split_part(pair[1],':',1)::integer*60
      +pg_catalog.split_part(pair[1],':',2)::integer;
    to_minutes:=pg_catalog.split_part(pair[2],':',1)::integer*60
      +pg_catalog.split_part(pair[2],':',2)::integer;
    if to_minutes<=from_minutes then precise:=false; exit; end if;
  end loop;
  if any_time and precise then
    select min(slots.slot_from),max(slots.slot_to) into first_minute,last_minute
      from (values
        (case when p_training->>'hmatind' ~ '^([01]?\d|2[0-3]):[0-5]\d$'
          then pg_catalog.split_part(p_training->>'hmatind',':',1)::integer*60
            +pg_catalog.split_part(p_training->>'hmatind',':',2)::integer end,
         case when p_training->>'hmatinf' ~ '^([01]?\d|2[0-3]):[0-5]\d$'
          then pg_catalog.split_part(p_training->>'hmatinf',':',1)::integer*60
            +pg_catalog.split_part(p_training->>'hmatinf',':',2)::integer end),
        (case when p_training->>'hapremd' ~ '^([01]?\d|2[0-3]):[0-5]\d$'
          then pg_catalog.split_part(p_training->>'hapremd',':',1)::integer*60
            +pg_catalog.split_part(p_training->>'hapremd',':',2)::integer end,
         case when p_training->>'hapremf' ~ '^([01]?\d|2[0-3]):[0-5]\d$'
          then pg_catalog.split_part(p_training->>'hapremf',':',1)::integer*60
            +pg_catalog.split_part(p_training->>'hapremf',':',2)::integer end)
      ) slots(slot_from,slot_to);
  end if;
  start_at:=first_day::timestamp+pg_catalog.make_interval(mins=>first_minute);
  end_at:=last_day::timestamp+pg_catalog.make_interval(mins=>last_minute);
  return p_start<end_at and p_end>start_at;
end;
$$;

-- Le protocole de fusion AGAI compare _slotUpdatedAt pour chaque heure.
-- Sans cette révision, un ancien téléphone pourrait rétablir une ancienne
-- disponibilité après le COMMIT de la relève.
create or replace function agai_private.stamp_replacement_slots(
  p_slots jsonb,p_keys text[],p_actor text
) returns jsonb
language plpgsql volatile set search_path = ''
as $$
declare
  next_slots jsonb:=p_slots;
  revisions jsonb:=coalesce(p_slots->'_slotUpdatedAt','{}'::jsonb);
  key text;
  stamp bigint;
  current_max bigint;
begin
  if pg_catalog.jsonb_typeof(p_slots)<>'object'
    or pg_catalog.jsonb_typeof(revisions)<>'object'
    or p_actor is null or p_actor=''
  then raise exception 'AGAI_REPLACEMENT_INVALID_SLOTS'; end if;
  select greatest(coalesce((p_slots->>'_updatedAt')::bigint,0),
    coalesce(max(case when value ~ '^\d+$' then value::bigint else 0 end),0))
    into current_max from pg_catalog.jsonb_each_text(revisions);
  stamp:=greatest((extract(epoch from pg_catalog.clock_timestamp())*1000000)::bigint,
    current_max+1);
  foreach key in array p_keys loop
    if key !~ '^[0-6]_[0-9]+$' then raise exception 'AGAI_REPLACEMENT_INVALID_SLOT_KEY'; end if;
    revisions:=pg_catalog.jsonb_set(revisions,array[key],pg_catalog.to_jsonb(stamp),true);
  end loop;
  next_slots:=pg_catalog.jsonb_set(next_slots,'{_slotUpdatedAt}',revisions,true);
  next_slots:=pg_catalog.jsonb_set(next_slots,'{_updatedAt}',pg_catalog.to_jsonb(stamp),true);
  next_slots:=pg_catalog.jsonb_set(next_slots,'{_updatedBy}',pg_catalog.to_jsonb(p_actor),true);
  return next_slots;
end;
$$;

create or replace function agai_private.replacement_level(p_user jsonb)
returns integer language plpgsql immutable set search_path = ''
as $$
declare
  role_name text;
  grade text;
  level integer;
begin
  if p_user is null then return 0; end if;
  role_name:=coalesce(p_user->>'fonction','');
  if role_name in ('Chef de centre','Adjoint au chef de centre')
    and nullif(p_user->>'fonction2','') is not null
  then role_name:=p_user->>'fonction2'; end if;
  role_name:=pg_catalog.lower(role_name);
  grade:=coalesce(p_user->>'grade','');
  level:=case when role_name like '%tout engin%' then 4
    when role_name like '%agrès%' or role_name like '%agres%' then 3
    when role_name like '%chef%' and (role_name like '%équipe%' or role_name like '%equipe%') then 2
    when role_name like '%stagiaire%' then 0 else 1 end;
  if p_user->>'fonction' in ('Chef de centre','Adjoint au chef de centre')
    or grade in ('Caporal-chef','Sergent','Sergent-chef','Adjudant','Adjudant-chef',
      'Lieutenant','Capitaine','Commandant','Lieutenant-colonel','Colonel')
    or coalesce(p_user->'rights','[]'::jsonb) ? 'Chef d''agrès'
  then level:=greatest(level,3); end if;
  return level;
end;
$$;

create or replace function agai_private.replacement_team_granularity(
  p_caserne text,p_login text,p_default integer
) returns integer
language plpgsql stable set search_path = ''
as $$
declare
  granularity integer;
begin
  select (data->>'granularity')::integer into granularity
    from public.records where caserne=p_caserne and type='equipe'
      and not deleted and data->'membres' ? p_login order by id limit 1;
  if granularity is null or granularity<=0
    or 1440%nullif(granularity,0)<>0 then return p_default; end if;
  return granularity;
end;
$$;

create or replace function agai_private.strong_team_lead(
  p_caserne text, p_week text
) returns text
language plpgsql stable set search_path = ''
as $$
declare
  station_config jsonb;
  rotation jsonb;
  strong_team text;
  leader text;
begin
  select data into station_config from public.records
    where id=p_caserne||'__config__main' and caserne=p_caserne
      and type='config' and not deleted;
  if station_config is null then raise exception 'AGAI_REPLACEMENT_CONFIG_MISSING'; end if;
  rotation:=station_config->'planningRotations'->p_week;
  strong_team:=case when pg_catalog.jsonb_typeof(rotation)='array' then rotation->>0
    when pg_catalog.jsonb_typeof(rotation)='string' then trim(both '"' from rotation::text)
    else null end;
  select data->>'resp' into leader from public.records
    where id=p_caserne||'__equipe__'||strong_team and caserne=p_caserne
      and type='equipe' and not deleted;
  if leader is null or leader='' then raise exception 'AGAI_REPLACEMENT_STRONG_LEAD_MISSING'; end if;
  return leader;
end;
$$;

create or replace function public.agai_confirm_dispo_replacement(
  p_request_id text, p_decision text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor record;
  request_row public.records%rowtype;
  next_request jsonb;
  leader text;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
  then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not actor.can_operate then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into request_row from public.records
    where id=p_request_id and type='dispoRequest'
      and caserne=actor.caserne_id and not deleted
    for update;
  if not found then raise exception 'AGAI_REPLACEMENT_NOT_FOUND'; end if;
  if request_row.id is distinct from actor.caserne_id||'__dispoRequest__'
      ||(request_row.data->>'id')
    or request_row.data->>'login' is not distinct from
      request_row.data->>'replacementLogin'
    or request_row.data->>'caserneId' is distinct from actor.caserne_id
  then raise exception 'AGAI_REPLACEMENT_INVALID_REQUEST'; end if;
  if request_row.data->>'statut'='en-attente-responsable'
    and request_row.data->>'confirmePar'=actor.login
    and p_decision='accepte' then return request_row.data; end if;
  leader:=agai_private.strong_team_lead(actor.caserne_id,request_row.data->>'wk');
  next_request:=agai_private.next_replacement_request(
    request_row.data,actor.login,leader,p_decision);
  perform agai_private.permit_replacement_write(
    request_row.id,request_row.data,next_request,actor.login);
  update public.records set data=next_request where id=request_row.id;
  delete from agai_private.replacement_write_permits
    where transaction_id=pg_catalog.txid_current();
  return next_request;
end;
$$;

create or replace function public.agai_resolve_dispo_replacement(
  p_request_id text, p_expected_piquets jsonb, p_decision text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor record;
  preview public.records%rowtype;
  request_row public.records%rowtype;
  config_row public.records%rowtype;
  source_row public.records%rowtype;
  candidate_row public.records%rowtype;
  source_user public.records%rowtype;
  candidate_user public.records%rowtype;
  row_to_lock public.records%rowtype;
  week text;
  source_login text;
  candidate_login text;
  station text;
  leader text;
  source_gran integer;
  candidate_gran integer;
  week_start integer;
  planned jsonb;
  schedule_entry jsonb;
  projected_piquet jsonb;
  projected_member jsonb;
  required_level integer:=0;
  selected_slot jsonb;
  slot_parts text[];
  slot_start timestamp;
  slot_end timestamp;
  training_conflict boolean;
  next_request jsonb;
  next_config jsonb;
  next_source jsonb;
  next_candidate jsonb;
  candidate_initial jsonb;
  piquet_log jsonb;
  log_entry jsonb;
  source_keys text[];
  candidate_keys text[];
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
  then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not actor.can_operate
    or p_decision not in ('accepte','refuse')
    or pg_catalog.jsonb_typeof(p_expected_piquets)<>'array'
  then raise exception 'AGAI_REPLACEMENT_ACCESS_DENIED'; end if;
  station:=actor.caserne_id;
  select * into preview from public.records
    where id=p_request_id and caserne=station and type='dispoRequest'
      and not deleted;
  if not found then raise exception 'AGAI_REPLACEMENT_NOT_FOUND'; end if;
  week:=preview.data->>'wk';
  source_login:=preview.data->>'login';
  candidate_login:=preview.data->>'replacementLogin';
  if week !~ '^[0-9]{8}$' or source_login is null or candidate_login is null
    or source_login=candidate_login
    or preview.id is distinct from station||'__dispoRequest__'||(preview.data->>'id')
    or preview.data->>'caserneId' is distinct from station
  then raise exception 'AGAI_REPLACEMENT_INVALID_REQUEST'; end if;
  if preview.data->>'statut'<>'en-attente-responsable'
    or preview.data->>'confirmePar' is distinct from candidate_login
    or actor.login is distinct from agai_private.strong_team_lead(station,week)
  then raise exception 'AGAI_REPLACEMENT_STRONG_LEAD_REQUIRED'; end if;
  -- Une personne qui accepte une relève peut n'avoir encore aucune ligne
  -- de disponibilités pour la semaine. Elle est créée dans cette transaction.
  candidate_initial:=pg_catalog.jsonb_build_object(
    'wk',week,'login',candidate_login,'slots','{}'::jsonb);
  if not exists(select 1 from public.records
    where id=station||'__dispo__'||week||'__'||candidate_login)
  then
    perform agai_private.permit_replacement_write(
      station||'__dispo__'||week||'__'||candidate_login,null,candidate_initial,actor.login);
    insert into public.records(id,caserne,type,data)
      values(station||'__dispo__'||week||'__'||candidate_login,station,'dispo',candidate_initial)
      on conflict(id) do nothing;
  end if;
  -- Tous les verrous sont pris dans le même ordre, même si la demande a
  -- été lue une première fois sans verrou pour trouver les identifiants.
  for row_to_lock in select * from public.records
    where id in (p_request_id,station||'__config__main',
      station||'__dispo__'||week||'__'||source_login,
      station||'__dispo__'||week||'__'||candidate_login)
    order by id for update
  loop null; end loop;
  select * into request_row from public.records where id=p_request_id;
  select * into config_row from public.records where id=station||'__config__main';
  select * into source_row from public.records
    where id=station||'__dispo__'||week||'__'||source_login;
  select * into candidate_row from public.records
    where id=station||'__dispo__'||week||'__'||candidate_login;
  if request_row.data->>'wk' is distinct from week
    or request_row.data->>'login' is distinct from source_login
    or request_row.data->>'replacementLogin' is distinct from candidate_login
    or config_row.id is null or source_row.id is null or candidate_row.id is null
    or config_row.deleted or source_row.deleted or candidate_row.deleted
    or source_row.data->>'wk' is distinct from week
    or source_row.data->>'login' is distinct from source_login
    or candidate_row.data->>'wk' is distinct from week
    or candidate_row.data->>'login' is distinct from candidate_login
  then raise exception 'AGAI_REPLACEMENT_REVISION_CONFLICT'; end if;
  if request_row.data->>'statut'='accepte'
    and request_row.data->>'reponduPar'=actor.login and p_decision='accepte'
  then return request_row.data; end if;
  leader:=agai_private.strong_team_lead(station,week);
  if actor.login is distinct from leader
  then raise exception 'AGAI_REPLACEMENT_STRONG_LEAD_REQUIRED'; end if;
  if config_row.data->'piquets'->week is distinct from p_expected_piquets
  then raise exception 'AGAI_REPLACEMENT_PIQUET_REVISION_CONFLICT'; end if;
  select * into source_user from public.records
    where id=station||'__user__'||source_login and type='user'
      and caserne=station and not deleted;
  select * into candidate_user from public.records
    where id=station||'__user__'||candidate_login and type='user'
      and caserne=station and not deleted;
  if source_user.id is null or candidate_user.id is null
  then raise exception 'AGAI_REPLACEMENT_PERSONNEL_MISSING'; end if;
  next_request:=agai_private.next_replacement_request(
    request_row.data,actor.login,leader,p_decision);
  if p_decision='refuse' then
    perform agai_private.permit_replacement_write(
      request_row.id,request_row.data,next_request,actor.login);
    update public.records set data=next_request where id=request_row.id;
    delete from agai_private.replacement_write_permits
      where transaction_id=pg_catalog.txid_current();
    return next_request;
  end if;
  source_gran:=coalesce((config_row.data->'astrConfig'->>'granularity')::integer,60);
  source_gran:=agai_private.replacement_team_granularity(station,source_login,source_gran);
  candidate_gran:=agai_private.replacement_team_granularity(station,candidate_login,
    coalesce((config_row.data->'astrConfig'->>'granularity')::integer,60));
  week_start:=coalesce((config_row.data->'astrConfig'->>'weekStartHour')::integer,8);
  select value into schedule_entry
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(config_row.data->'astrConfig'->'scheduleHistory')='array'
        then config_row.data->'astrConfig'->'scheduleHistory' else '[]'::jsonb end
    ) where value->>'effectiveWeek'<=week
    order by value->>'effectiveWeek' desc limit 1;
  if schedule_entry is not null
  then week_start:=(schedule_entry->>'weekStartHour')::integer; end if;
  -- Exclure une situation du personnel bloquante et les formations qui
  -- chevauchent réellement les heures demandées.
  for selected_slot in select value
    from pg_catalog.jsonb_array_elements(request_row.data->'slots')
  loop
    slot_parts:=pg_catalog.string_to_array(selected_slot->>'key','_');
    slot_start:=pg_catalog.to_date(week,'YYYYMMDD')::timestamp
      +pg_catalog.make_interval(days=>slot_parts[1]::integer,
        mins=>week_start*60+slot_parts[2]::integer*source_gran);
    slot_end:=slot_start+pg_catalog.make_interval(mins=>source_gran);
    if exists(
      select 1 from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(candidate_user.data->'_personnelPeriods')='array'
          then candidate_user.data->'_personnelPeriods' else '[]'::jsonb end
      ) period where period->>'kind' in ('arret','disponibilite','suspension')
        and period->>'start'<=(slot_end-interval '1 millisecond')::date::text
        and (period->>'end' is null or period->>'end'>=slot_start::date::text)
        and period->>'cancelledAt' is null
        and (period->>'cancelledFrom' is null
          or period->>'cancelledFrom'>slot_start::date::text)
    ) or exists(
      select 1 from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(candidate_user.data->'_personnelExits')='array'
          then candidate_user.data->'_personnelExits' else '[]'::jsonb end
      ) personnel_exit where personnel_exit->>'start'
        <=(slot_end-interval '1 millisecond')::date::text
        and (personnel_exit->>'cancelledFrom' is null
          or personnel_exit->>'cancelledFrom'>slot_start::date::text)
    ) or candidate_user.data->'_personnelTransferredOut'->>'start'
        <=(slot_end-interval '1 millisecond')::date::text
      or (candidate_user.data->'_personnelExit'->>'start'
        <=(slot_end-interval '1 millisecond')::date::text
        and (candidate_user.data->'_personnelExit'->>'cancelledFrom' is null
          or candidate_user.data->'_personnelExit'->>'cancelledFrom'>slot_start::date::text))
    then raise exception 'AGAI_REPLACEMENT_PERSONNEL_UNAVAILABLE'; end if;
    select exists(
      select 1 from public.records training
      where training.type in ('formStag','formForm') and not training.deleted
        and agai_private.replacement_training_overlaps(
          training.data,candidate_login,slot_start,slot_end)
    ) into training_conflict;
    if training_conflict then raise exception 'AGAI_REPLACEMENT_TRAINING_CONFLICT'; end if;
  end loop;
  planned:=agai_private.plan_replacement(request_row.data,p_expected_piquets,
    source_row.data->'slots',candidate_row.data->'slots',
    week_start,source_gran,candidate_gran);
  select pg_catalog.array_agg(value->>'key') into source_keys
    from pg_catalog.jsonb_array_elements(request_row.data->'slots');
  candidate_keys:=agai_private.replacement_candidate_keys(
    request_row.data,source_gran,candidate_gran);
  if planned->'piquets' is distinct from p_expected_piquets then
    required_level:=1;
    for projected_piquet in
      select value from pg_catalog.jsonb_array_elements(planned->'piquets')
    loop
      for projected_member in
        select value from pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(projected_piquet->'membres')='array'
            then projected_piquet->'membres' else '[]'::jsonb end)
      loop
        if projected_member->>'login' is distinct from candidate_login then continue; end if;
        if projected_member->>'role' ilike '%agrès%'
          or projected_member->>'role' ilike '%agres%'
        then required_level:=greatest(required_level,3);
        elsif projected_member->>'role' ilike '%chef%'
          and (projected_member->>'role' ilike '%équipe%'
            or projected_member->>'role' ilike '%equipe%')
        then required_level:=greatest(required_level,2); end if;
      end loop;
    end loop;
  else required_level:=agai_private.replacement_level(source_user.data); end if;
  if agai_private.replacement_level(candidate_user.data)<required_level
  then raise exception 'AGAI_REPLACEMENT_QUALIFICATION_INSUFFICIENT'; end if;
  next_config:=pg_catalog.jsonb_set(config_row.data,array['piquets',week],
    planned->'piquets',true);
  if config_row.data->'piquetsValidated'->>week='true'
    and planned->'piquets' is distinct from p_expected_piquets
  then
    piquet_log:=case when pg_catalog.jsonb_typeof(
      next_config->'piquets'->'_log'->week)='array'
      then next_config->'piquets'->'_log'->week else '[]'::jsonb end;
    log_entry:=pg_catalog.jsonb_build_object(
      'apresValidation',true,
      'date',pg_catalog.to_char(pg_catalog.clock_timestamp() at time zone 'Europe/Paris',
        'DD/MM/YYYY HH24:MI:SS'),
      'auteur',actor.login,
      'action','relève de disponibilité',
      'piquet','Semaine du '||week,
      'membres',source_login||' → '||candidate_login,
      'details','Demande '||(request_row.data->>'id')||' ; heures demandées : '
        ||pg_catalog.array_to_string(source_keys,', '));
    next_config:=pg_catalog.jsonb_set(next_config,'{piquets,_log}',
      case when pg_catalog.jsonb_typeof(next_config->'piquets'->'_log')='object'
        then next_config->'piquets'->'_log' else '{}'::jsonb end,true);
    next_config:=pg_catalog.jsonb_set(next_config,array['piquets','_log',week],
      piquet_log||pg_catalog.jsonb_build_array(log_entry),true);
  end if;
  next_source:=pg_catalog.jsonb_set(source_row.data,'{slots}',
    agai_private.stamp_replacement_slots(planned->'sourceSlots',source_keys,actor.login),true);
  next_candidate:=pg_catalog.jsonb_set(candidate_row.data,'{slots}',
    agai_private.stamp_replacement_slots(planned->'candidateSlots',candidate_keys,actor.login),true);
  perform agai_private.permit_replacement_write(
    source_row.id,source_row.data,next_source,actor.login);
  perform agai_private.permit_replacement_write(
    candidate_row.id,candidate_row.data,next_candidate,actor.login);
  perform agai_private.permit_replacement_write(
    config_row.id,config_row.data,next_config,actor.login);
  perform agai_private.permit_replacement_write(
    request_row.id,request_row.data,next_request,actor.login);
  update public.records set data=next_source where id=source_row.id;
  update public.records set data=next_candidate where id=candidate_row.id;
  update public.records set data=next_config where id=config_row.id;
  update public.records set data=next_request where id=request_row.id;
  delete from agai_private.replacement_write_permits
    where transaction_id=pg_catalog.txid_current();
  return pg_catalog.jsonb_build_object(
    'request',next_request,'sourceDispo',next_source,
    'candidateDispo',next_candidate,'piquets',planned->'piquets',
    'piquetLog',next_config->'piquets'->'_log'->week);
end;
$$;
