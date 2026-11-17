-- Calcul serveur local, sans écriture. La future RPC devra appeler cette
-- fonction sur les données relues et verrouillées dans la même transaction.
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
