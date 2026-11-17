-- Prototype local uniquement : ne pas appliquer directement en production.
-- La fonction définitive devra être incluse dans une migration et appelée
-- exclusivement par une transaction vérifiant droits, absence et révision.
create schema if not exists agai_private;

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
