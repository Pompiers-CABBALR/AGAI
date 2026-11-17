-- Relève atomique des disponibilités et piquets (V202611_0042).
-- Les droits existants restent applicables aux autres écritures.

do $$
begin
  if pg_catalog.to_regprocedure('agai_private.stamp_record_writer()') is null
    or pg_catalog.to_regprocedure('agai_private.can_write_record(text,text,text,jsonb)') is null
    or pg_catalog.to_regprocedure('agai_private.team_lead_piquet_update(text,text,text,jsonb)') is null
    or not exists(
      select 1 from pg_catalog.pg_trigger
      where tgrelid='public.records'::pg_catalog.regclass
        and tgname='agai_stamp_record_writer' and not tgisinternal)
    or pg_catalog.strpos(pg_catalog.pg_get_functiondef(
      'agai_private.stamp_record_writer()'::pg_catalog.regprocedure),
      'team_piquet_write')=0
  then raise exception 'AGAI_REPLACEMENT_SCHEMA_PRECONDITION_FAILED'; end if;
end;
$$;
create or replace function agai_private.replacement_candidate_keys(
  p_request jsonb, p_request_granularity integer, p_candidate_granularity integer
) returns text[]
language plpgsql immutable set search_path = ''
as $$
declare
  requested pg_catalog.int4multirange := '{}'::pg_catalog.int4multirange;
  slot jsonb;
  parts text[];
  start_minute integer;
  slot_range pg_catalog.int4range;
  part record;
  index integer;
  per_day integer;
  keys text[] := array[]::text[];
begin
  if p_request_granularity is null or p_request_granularity<=0
    or p_candidate_granularity is null or p_candidate_granularity<=0
    or 1440 % nullif(p_request_granularity,0)<>0
    or 1440 % nullif(p_candidate_granularity,0)<>0
    or pg_catalog.jsonb_typeof(p_request->'slots')<>'array'
  then raise exception 'AGAI_REPLACEMENT_INVALID_GRANULARITY'; end if;
  if pg_catalog.jsonb_array_length(p_request->'slots')=0
    or pg_catalog.jsonb_array_length(p_request->'slots')>10080
  then raise exception 'AGAI_REPLACEMENT_INVALID_SLOT'; end if;
  per_day:=1440/p_candidate_granularity;
  for slot in select value from pg_catalog.jsonb_array_elements(p_request->'slots')
  loop
    if slot->>'newVal'<>'false' or coalesce(slot->>'key','')!~'^[0-6]_[0-9]{1,4}$'
    then raise exception 'AGAI_REPLACEMENT_INVALID_SLOT'; end if;
    parts:=pg_catalog.string_to_array(slot->>'key','_');
    if parts[2]::integer>=1440/p_request_granularity
    then raise exception 'AGAI_REPLACEMENT_INVALID_SLOT'; end if;
    start_minute:=parts[1]::integer*1440+parts[2]::integer*p_request_granularity;
    slot_range:=pg_catalog.int4range(start_minute,start_minute+p_request_granularity,'[)');
    if requested && slot_range then raise exception 'AGAI_REPLACEMENT_DUPLICATE_SLOT'; end if;
    requested:=requested+pg_catalog.int4multirange(slot_range);
  end loop;
  for part in
    select lower(piece) as from_minute, upper(piece) as to_minute
    from pg_catalog.unnest(requested) piece
  loop
    if part.from_minute%p_candidate_granularity<>0
      or part.to_minute%p_candidate_granularity<>0
    then raise exception 'AGAI_REPLACEMENT_GRANULARITY_CONFLICT'; end if;
    for index in part.from_minute/p_candidate_granularity..part.to_minute/p_candidate_granularity-1
    loop
      keys:=pg_catalog.array_append(keys,(index/per_day)::text||'_'||(index%per_day)::text);
    end loop;
  end loop;
  return keys;
end;
$$;

create or replace function agai_private.project_replacement_week(
  p_piquets jsonb, p_request jsonb, p_week_start integer, p_granularity integer
) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  requested pg_catalog.int4multirange := '{}'::pg_catalog.int4multirange;
  slot jsonb;
  pieces text[];
  slot_day integer;
  slot_index integer;
  slot_start integer;
  slot_range pg_catalog.int4range;
  piquet jsonb;
  next_piquet jsonb;
  member jsonb;
  members jsonb;
  next_members jsonb;
  result jsonb := '[]'::jsonb;
  day_index integer;
  member_start integer;
  member_end integer;
  begin_clock text;
  end_clock text;
  affected pg_catalog.int4multirange;
  remaining pg_catalog.int4multirange;
  part record;
  new_login text;
  changed boolean;
  shortcut text;
  role_match text;
  still_present boolean;
begin
  if pg_catalog.jsonb_typeof(p_piquets) <> 'array'
    or pg_catalog.jsonb_typeof(p_request->'slots') <> 'array'
    or p_week_start not between 0 and 23
    or p_granularity is null or p_granularity <= 0
    or 1440 % nullif(p_granularity,0) <> 0
    or pg_catalog.jsonb_array_length(p_request->'slots')=0
    or pg_catalog.jsonb_array_length(p_request->'slots')>10080
    or p_request->>'login' is null
    or p_request->>'replacementLogin' is null
    or p_request->>'login' = p_request->>'replacementLogin'
  then raise exception 'AGAI_REPLACEMENT_INVALID_INPUT'; end if;
  for slot in select value from pg_catalog.jsonb_array_elements(p_request->'slots')
  loop
    if slot->>'newVal' <> 'false' or coalesce(slot->>'key','') !~ '^[0-6]_[0-9]{1,4}$'
    then raise exception 'AGAI_REPLACEMENT_INVALID_SLOT'; end if;
    pieces := pg_catalog.string_to_array(slot->>'key','_');
    slot_day := pieces[1]::integer;
    slot_index := pieces[2]::integer;
    if slot_index >= 1440/p_granularity then raise exception 'AGAI_REPLACEMENT_INVALID_SLOT'; end if;
    slot_start := slot_day*1440+p_week_start*60+slot_index*p_granularity;
    slot_range:=pg_catalog.int4range(slot_start,slot_start+p_granularity,'[)');
    if requested && slot_range then raise exception 'AGAI_REPLACEMENT_DUPLICATE_SLOT'; end if;
    requested := requested + pg_catalog.int4multirange(slot_range);
  end loop;
  for piquet in select value from pg_catalog.jsonb_array_elements(p_piquets)
  loop
    day_index := case piquet->>'jour'
      when 'Lundi' then 0 when 'Mardi' then 1 when 'Mercredi' then 2
      when 'Jeudi' then 3 when 'Vendredi' then 4 when 'Samedi' then 5
      when 'Dimanche' then 6 else null end;
    if day_index is null or coalesce(piquet->>'debut','') !~ '^[0-9]{2}:[0-9]{2}$'
      or coalesce(piquet->>'fin','') !~ '^[0-9]{2}:[0-9]{2}$'
    then
      result := result || pg_catalog.jsonb_build_array(piquet);
      continue;
    end if;
    members := case when pg_catalog.jsonb_typeof(piquet->'membres')='array'
      and pg_catalog.jsonb_array_length(piquet->'membres')>0 then piquet->'membres'
      else pg_catalog.jsonb_build_array(
        case when piquet->>'chefAgres' is not null then
          pg_catalog.jsonb_build_object('role','Chef d''agrès','login',piquet->>'chefAgres',
            'hDebut',piquet->>'debut','hFin',piquet->>'fin') end,
        case when piquet->>'conducteur' is not null then
          pg_catalog.jsonb_build_object('role','Conducteur','login',piquet->>'conducteur',
            'hDebut',piquet->>'debut','hFin',piquet->>'fin') end,
        case when piquet->>'chefEquipe' is not null then
          pg_catalog.jsonb_build_object('role','Chef d''équipe','login',piquet->>'chefEquipe',
            'hDebut',piquet->>'debut','hFin',piquet->>'fin') end,
        case when piquet->>'stagiaire' is not null then
          pg_catalog.jsonb_build_object('role','Équipier','login',piquet->>'stagiaire',
            'hDebut',piquet->>'debut','hFin',piquet->>'fin') end
      ) end;
    select coalesce(pg_catalog.jsonb_agg(value),'[]'::jsonb) into members
      from pg_catalog.jsonb_array_elements(members) where value <> 'null'::jsonb;
    next_members := '[]'::jsonb;
    changed := false;
    for member in select value from pg_catalog.jsonb_array_elements(members)
    loop
      if member->>'login' is distinct from p_request->>'login' then
        next_members := next_members || pg_catalog.jsonb_build_array(member);
        continue;
      end if;
      begin_clock := coalesce(member->>'hDebut',piquet->>'debut');
      end_clock := coalesce(member->>'hFin',piquet->>'fin');
      member_start := day_index*1440
        +case when (pg_catalog.split_part(begin_clock,':',1)::integer*60
          +pg_catalog.split_part(begin_clock,':',2)::integer)<p_week_start*60 then 1440 else 0 end
        +pg_catalog.split_part(begin_clock,':',1)::integer*60
        +pg_catalog.split_part(begin_clock,':',2)::integer;
      member_end := day_index*1440
        +case when (pg_catalog.split_part(begin_clock,':',1)::integer*60
          +pg_catalog.split_part(begin_clock,':',2)::integer)<p_week_start*60 then 1440 else 0 end
        +pg_catalog.split_part(end_clock,':',1)::integer*60
        +pg_catalog.split_part(end_clock,':',2)::integer;
      if member_end<=member_start then member_end:=member_end+1440; end if;
      affected := requested * pg_catalog.int4multirange(
        pg_catalog.int4range(member_start,member_end,'[)')
      );
      if affected='{}'::pg_catalog.int4multirange then
        next_members := next_members || pg_catalog.jsonb_build_array(member);
        continue;
      end if;
      changed := true;
      remaining := pg_catalog.int4multirange(
        pg_catalog.int4range(member_start,member_end,'[)')
      ) - affected;
      for part in
        select lower(piece) as first_minute, upper(piece) as last_minute, true as substitute
        from pg_catalog.unnest(affected) piece
        union all
        select lower(piece), upper(piece), false
        from pg_catalog.unnest(remaining) piece
        order by first_minute
      loop
        new_login := case when part.substitute then p_request->>'replacementLogin'
          else p_request->>'login' end;
        next_members := next_members || pg_catalog.jsonb_build_array(
          member || pg_catalog.jsonb_build_object(
            'login',new_login,
            'hDebut',pg_catalog.lpad(((part.first_minute%1440)/60)::text,2,'0')||':'
              ||pg_catalog.lpad((part.first_minute%60)::text,2,'0'),
            'hFin',pg_catalog.lpad(((part.last_minute%1440)/60)::text,2,'0')||':'
              ||pg_catalog.lpad((part.last_minute%60)::text,2,'0')
          )
        );
      end loop;
    end loop;
    if not changed then
      result := result || pg_catalog.jsonb_build_array(piquet);
      continue;
    end if;
    next_piquet := pg_catalog.jsonb_set(piquet,'{membres}',next_members,true);
    foreach shortcut in array array['chefAgres','conducteur','chefEquipe','stagiaire']
    loop
      if next_piquet->>shortcut is distinct from p_request->>'login' then continue; end if;
      role_match := case shortcut when 'chefAgres' then 'agrès'
        when 'conducteur' then 'Conducteur' when 'chefEquipe' then 'équipe'
        else 'Équipier' end;
      select exists(
        select 1 from pg_catalog.jsonb_array_elements(next_members) m
        where m->>'login'=p_request->>'login'
          and m->>'role' ilike '%'||role_match||'%'
      ) into still_present;
      if not still_present then
        next_piquet := pg_catalog.jsonb_set(next_piquet,array[shortcut],
          pg_catalog.to_jsonb(p_request->>'replacementLogin'),true);
      end if;
    end loop;
    if coalesce(next_piquet->>'note','') like 'Présence partielle : %' then
      next_piquet:=pg_catalog.jsonb_set(next_piquet,'{note}','""'::jsonb,true);
    end if;
    result:=result||pg_catalog.jsonb_build_array(next_piquet);
  end loop;
  return result;
end;
$$;

create or replace function agai_private.next_replacement_request(
  p_current jsonb, p_actor text, p_strong_lead text, p_decision text
) returns jsonb
language plpgsql volatile set search_path = ''
as $$
declare
  status text := p_current->>'statut';
  next_status text;
  event_type text;
  event jsonb;
  now_at timestamptz := pg_catalog.clock_timestamp();
  history jsonb := coalesce(p_current->'historique','[]'::jsonb);
begin
  if p_current->>'kind' <> 'remplacement'
    or p_actor is null or p_actor=''
    or p_strong_lead is null or p_strong_lead=''
    or p_decision not in ('accepte','refuse')
    or pg_catalog.jsonb_typeof(history)<>'array'
  then raise exception 'AGAI_REPLACEMENT_INVALID_TRANSITION'; end if;
  if status='en-attente' then
    if p_actor is distinct from p_current->>'replacementLogin'
    then raise exception 'AGAI_REPLACEMENT_CANDIDATE_REQUIRED'; end if;
    next_status:=case when p_decision='accepte' then 'en-attente-responsable' else 'refuse' end;
    event_type:=case when p_decision='accepte' then 'accord-remplacant' else 'refus-remplacant' end;
  elsif status='en-attente-responsable' then
    if p_actor is distinct from p_strong_lead
      or p_current->>'confirmePar' is distinct from p_current->>'replacementLogin'
    then raise exception 'AGAI_REPLACEMENT_STRONG_LEAD_REQUIRED'; end if;
    next_status:=case when p_decision='accepte' then 'accepte' else 'refuse' end;
    event_type:=case when p_decision='accepte' then 'validation-astreinte-forte' else 'refus-astreinte-forte' end;
  else
    raise exception 'AGAI_REPLACEMENT_ALREADY_RESOLVED';
  end if;
  event:=pg_catalog.jsonb_build_object('action',event_type,'acteur',p_actor,'at',now_at);
  return p_current||pg_catalog.jsonb_build_object(
    'statut',next_status,
    'historique',history||pg_catalog.jsonb_build_array(event),
    'confirmePar',case when status='en-attente' and p_decision='accepte' then p_actor
      else p_current->>'confirmePar' end,
    'confirmeAt',case when status='en-attente' and p_decision='accepte' then now_at::text
      else p_current->>'confirmeAt' end,
    'reponduPar',case when next_status in ('accepte','refuse') then p_actor
      else p_current->>'reponduPar' end,
    'reponduAt',case when next_status in ('accepte','refuse') then now_at::text
      else p_current->>'reponduAt' end,
    'dateReponse',case when next_status in ('accepte','refuse')
      then pg_catalog.to_char(now_at at time zone 'Europe/Paris','DD/MM/YYYY')
      else p_current->>'dateReponse' end,
    'hReponse',case when next_status in ('accepte','refuse')
      then pg_catalog.to_char(now_at at time zone 'Europe/Paris','HH24:MI')
      else p_current->>'hReponse' end
  );
end;
$$;

create or replace function agai_private.member_abs_range(
  p_day text, p_begin text, p_end text, p_week_start integer
) returns pg_catalog.int4range
language plpgsql immutable set search_path = ''
as $$
declare
  day_index integer;
  begin_minute integer;
  end_minute integer;
  offset_minute integer;
begin
  day_index:=case p_day when 'Lundi' then 0 when 'Mardi' then 1
    when 'Mercredi' then 2 when 'Jeudi' then 3 when 'Vendredi' then 4
    when 'Samedi' then 5 when 'Dimanche' then 6 else null end;
  if day_index is null or p_week_start not between 0 and 23
    or coalesce(p_begin,'')!~'^[0-2][0-9]:[0-5][0-9]$'
    or coalesce(p_end,'')!~'^[0-2][0-9]:[0-5][0-9]$'
    or p_begin>='24:00' or p_end>='24:00'
  then raise exception 'AGAI_REPLACEMENT_INVALID_PIQUET_TIME'; end if;
  begin_minute:=pg_catalog.split_part(p_begin,':',1)::integer*60
    +pg_catalog.split_part(p_begin,':',2)::integer;
  end_minute:=pg_catalog.split_part(p_end,':',1)::integer*60
    +pg_catalog.split_part(p_end,':',2)::integer;
  offset_minute:=day_index*1440
    +case when begin_minute<p_week_start*60 then 1440 else 0 end;
  if end_minute<=begin_minute then end_minute:=end_minute+1440; end if;
  return pg_catalog.int4range(offset_minute+begin_minute,
    offset_minute+end_minute,'[)');
end;
$$;

create or replace function agai_private.plan_replacement(
  p_request jsonb, p_piquets jsonb, p_source_slots jsonb,
  p_candidate_slots jsonb, p_week_start integer,
  p_source_granularity integer, p_candidate_granularity integer
) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  source_slots jsonb:=p_source_slots;
  candidate_slots jsonb:=p_candidate_slots;
  projected jsonb;
  candidate_keys text[];
  key text;
  slot jsonb;
  piquet jsonb;
  member jsonb;
  members jsonb;
  occupied pg_catalog.int4multirange:='{}'::pg_catalog.int4multirange;
  member_range pg_catalog.int4range;
begin
  if p_request->>'kind'<>'remplacement'
    or p_request->>'statut'<>'en-attente-responsable'
    or p_request->>'confirmePar' is distinct from p_request->>'replacementLogin'
    or pg_catalog.jsonb_typeof(p_source_slots)<>'object'
    or pg_catalog.jsonb_typeof(p_candidate_slots)<>'object'
  then raise exception 'AGAI_REPLACEMENT_NOT_CONFIRMED'; end if;
  candidate_keys:=agai_private.replacement_candidate_keys(
    p_request,p_source_granularity,p_candidate_granularity);
  for slot in select value from pg_catalog.jsonb_array_elements(p_request->'slots')
  loop
    key:=slot->>'key';
    if source_slots->key is distinct from 'true'::jsonb
    then raise exception 'AGAI_REPLACEMENT_SOURCE_CHANGED'; end if;
    source_slots:=pg_catalog.jsonb_set(source_slots,array[key],'false'::jsonb,true);
  end loop;
  foreach key in array candidate_keys
  loop
    candidate_slots:=pg_catalog.jsonb_set(candidate_slots,array[key],'true'::jsonb,true);
  end loop;
  projected:=agai_private.project_replacement_week(
    p_piquets,p_request,p_week_start,p_source_granularity);
  for piquet in select value from pg_catalog.jsonb_array_elements(projected)
  loop
    if pg_catalog.jsonb_typeof(piquet->'membres')='array'
      and pg_catalog.jsonb_array_length(piquet->'membres')>0
    then members:=piquet->'membres';
    else
      members:=pg_catalog.jsonb_build_array(
        case when piquet->>'chefAgres'=p_request->>'replacementLogin'
          then pg_catalog.jsonb_build_object('login',piquet->>'chefAgres') end,
        case when piquet->>'conducteur'=p_request->>'replacementLogin'
          then pg_catalog.jsonb_build_object('login',piquet->>'conducteur') end,
        case when piquet->>'chefEquipe'=p_request->>'replacementLogin'
          then pg_catalog.jsonb_build_object('login',piquet->>'chefEquipe') end,
        case when piquet->>'stagiaire'=p_request->>'replacementLogin'
          then pg_catalog.jsonb_build_object('login',piquet->>'stagiaire') end
      );
    end if;
    for member in select value from pg_catalog.jsonb_array_elements(members)
    loop
      if member->>'login' is distinct from p_request->>'replacementLogin' then continue; end if;
      member_range:=agai_private.member_abs_range(
        piquet->>'jour',coalesce(member->>'hDebut',piquet->>'debut'),
        coalesce(member->>'hFin',piquet->>'fin'),p_week_start);
      if occupied && member_range
      then raise exception 'AGAI_REPLACEMENT_CANDIDATE_PIQUET_CONFLICT'; end if;
      occupied:=occupied+pg_catalog.int4multirange(member_range);
    end loop;
  end loop;
  return pg_catalog.jsonb_build_object(
    'piquets',projected,'sourceSlots',source_slots,'candidateSlots',candidate_slots
  );
end;
$$;

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

revoke all on function agai_private.replacement_candidate_keys(jsonb,integer,integer)
  from public,anon,authenticated;
revoke all on function agai_private.project_replacement_week(jsonb,jsonb,integer,integer)
  from public,anon,authenticated;
revoke all on function agai_private.next_replacement_request(jsonb,text,text,text)
  from public,anon,authenticated;
revoke all on function agai_private.member_abs_range(text,text,text,integer)
  from public,anon,authenticated;
revoke all on function agai_private.plan_replacement(jsonb,jsonb,jsonb,jsonb,integer,integer,integer)
  from public,anon,authenticated;
revoke all on function agai_private.replacement_training_overlaps(jsonb,text,timestamp,timestamp)
  from public,anon,authenticated;
revoke all on function agai_private.stamp_replacement_slots(jsonb,text[],text)
  from public,anon,authenticated;
revoke all on function agai_private.replacement_level(jsonb)
  from public,anon,authenticated;
revoke all on function agai_private.replacement_team_granularity(text,text,integer)
  from public,anon,authenticated;
revoke all on function agai_private.strong_team_lead(text,text)
  from public,anon,authenticated;

-- Autorisation d'écriture exacte, limitée à la transaction RPC courante.
-- Les rôles navigateur n'ont aucun droit direct sur cette table.
create table if not exists agai_private.replacement_write_permits(
  transaction_id bigint not null,
  record_id text not null,
  actor_login text not null,
  old_data jsonb,
  next_data jsonb not null,
  primary key(transaction_id,record_id)
);
alter table agai_private.replacement_write_permits enable row level security;
revoke all on agai_private.replacement_write_permits from public,anon,authenticated;

create or replace function agai_private.permit_replacement_write(
  p_record_id text,p_old_data jsonb,p_next_data jsonb,p_actor text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or p_record_id is null or p_next_data is null
    or p_actor is distinct from (select login from agai_private.current_access())
  then raise exception 'AGAI_REPLACEMENT_PERMIT_DENIED'; end if;
  insert into agai_private.replacement_write_permits(
    transaction_id,record_id,actor_login,old_data,next_data)
  values(pg_catalog.txid_current(),p_record_id,p_actor,p_old_data,p_next_data)
  on conflict(transaction_id,record_id) do update set
    actor_login=excluded.actor_login,old_data=excluded.old_data,
    next_data=excluded.next_data;
end;
$$;
revoke all on function agai_private.permit_replacement_write(text,jsonb,jsonb,text)
  from public,anon,authenticated;

create or replace function agai_private.replacement_write_allowed(
  p_record_id text,p_old_data jsonb,p_next_data jsonb,p_actor text
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from agai_private.replacement_write_permits permit
    where permit.transaction_id=pg_catalog.txid_current()
      and permit.record_id=p_record_id
      and permit.actor_login=p_actor
      and permit.old_data is not distinct from p_old_data
      and permit.next_data is not distinct from p_next_data
  );
$$;
revoke all on function agai_private.replacement_write_allowed(text,jsonb,jsonb,text)
  from public,anon;
grant execute on function agai_private.replacement_write_allowed(text,jsonb,jsonb,text)
  to authenticated;

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
  -- Sérialiser les relèves de cette semaine et verrouiller les lignes déjà
  -- présentes avant de créer une éventuelle disponibilité manquante.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('agai-replacement:'||station||':'||week));
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
    or config_row.id is null or source_row.id is null
    or config_row.deleted or source_row.deleted
    or source_row.data->>'wk' is distinct from week
    or source_row.data->>'login' is distinct from source_login
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
  -- Une personne qui accepte une relève peut n'avoir encore aucune ligne
  -- de disponibilités pour la semaine. Elle est créée après les verrous.
  if candidate_row.id is null then
    candidate_initial:=pg_catalog.jsonb_build_object(
      'wk',week,'login',candidate_login,'slots','{}'::jsonb);
    perform agai_private.permit_replacement_write(
      station||'__dispo__'||week||'__'||candidate_login,null,candidate_initial,actor.login);
    insert into public.records(id,caserne,type,data)
      values(station||'__dispo__'||week||'__'||candidate_login,station,'dispo',candidate_initial)
      on conflict(id) do nothing;
    select * into candidate_row from public.records
      where id=station||'__dispo__'||week||'__'||candidate_login for update;
  end if;
  if candidate_row.id is null or candidate_row.deleted
    or candidate_row.data->>'wk' is distinct from week
    or candidate_row.data->>'login' is distinct from candidate_login
  then raise exception 'AGAI_REPLACEMENT_REVISION_CONFLICT'; end if;
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
  if planned->'piquets' is distinct from p_expected_piquets then
    next_config:=pg_catalog.jsonb_set(next_config,'{piquets,_replacementRevision}',
      pg_catalog.to_jsonb(
        coalesce((config_row.data->'piquets'->>'_replacementRevision')::bigint,0)+1),true);
  end if;
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
    'piquetLog',next_config->'piquets'->'_log'->week,
    'piquetRevision',next_config->'piquets'->'_replacementRevision');
end;
$$;

revoke all on function public.agai_confirm_dispo_replacement(text,text)
  from public,anon;
grant execute on function public.agai_confirm_dispo_replacement(text,text)
  to authenticated;
revoke all on function public.agai_resolve_dispo_replacement(text,jsonb,text)
  from public,anon;
grant execute on function public.agai_resolve_dispo_replacement(text,jsonb,text)
  to authenticated;

-- Conserver les contrôles existants du déclencheur. La relève n'ouvre
-- qu'une troisième voie d'écriture, exacte et valable pour cette transaction.
create or replace function agai_private.stamp_record_writer()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  actor_login text;
  jwt_role text := auth.role();
  normal_write boolean;
  team_piquet_write boolean := false;
  replacement_write boolean := false;
begin
  if jwt_role is distinct from 'authenticated' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='DELETE' then raise exception 'AGAI_HARD_DELETE_FORBIDDEN'; end if;
  if new.type in ('iv','pilp') and current_user not in ('postgres','supabase_admin') then
    raise exception 'AGAI_OPERATION_REQUIRES_RPC';
  end if;
  if tg_op='UPDATE' and
    (new.id is distinct from old.id or new.caserne is distinct from old.caserne
      or new.type is distinct from old.type) then
    raise exception 'AGAI_RECORD_IDENTITY_IMMUTABLE';
  end if;
  select access.login into actor_login from agai_private.current_access() access
    where access.can_login;
  if actor_login is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  replacement_write := agai_private.replacement_write_allowed(
    new.id,case when tg_op='UPDATE' then old.data else null end,new.data,actor_login);
  -- Un ancien navigateur admin possède encore une ancienne copie complète
  -- de config. La révision, issue du serveur, empêche son envoi d'annuler
  -- silencieusement les nouveaux piquets validés lors de la relève.
  if tg_op='UPDATE' and new.type='config' and not replacement_write
    and coalesce(old.data->'piquets'->>'_replacementRevision','0')
      is distinct from coalesce(new.data->'piquets'->>'_replacementRevision','0')
  then raise exception 'AGAI_PIQUET_STALE_REPLACEMENT'; end if;
  if tg_op='UPDATE' and new.type='dispoRequest' and not replacement_write
    and (old.data->>'kind'='remplacement' or new.data->>'kind'='remplacement')
    and (old.data->>'statut' is distinct from new.data->>'statut'
      or old.data->'historique' is distinct from new.data->'historique'
      or old.deleted is distinct from new.deleted)
  then raise exception 'AGAI_REPLACEMENT_REQUIRES_RPC'; end if;
  normal_write := agai_private.can_write_record(new.id,new.caserne,new.type,new.data)
    and (tg_op<>'UPDATE' or agai_private.can_write_record(old.id,old.caserne,old.type,old.data));
  if tg_op='UPDATE' and new.type='config' and not normal_write then
    team_piquet_write := not old.deleted and not new.deleted
      and agai_private.team_lead_piquet_update(new.id,new.caserne,new.type,new.data);
  end if;
  if not normal_write and not team_piquet_write and not replacement_write then
    raise exception 'AGAI_WRITE_FORBIDDEN';
  end if;
  new.updated_by := actor_login;
  return new;
end;
$$;
