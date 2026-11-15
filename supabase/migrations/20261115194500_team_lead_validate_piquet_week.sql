-- Validation atomique d'une semaine de piquets par un responsable d'équipe.
-- Les autres champs de la configuration et les semaines passées restent protégés.
begin;

create or replace function agai_private.team_lead_piquet_update(
  p_id text, p_caserne text, p_type text, p_data jsonb
)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  previous jsonb;
  before_piquets jsonb;
  after_piquets jsonb;
  before_validated jsonb;
  after_validated jsonb;
  before_dispos jsonb;
  after_dispos jsonb;
  changed_week text;
  changed_count integer := 0;
  current_week text := to_char(date_trunc('week', now() at time zone 'Europe/Paris'),'YYYYMMDD');
begin
  if p_id <> p_caserne||'__config__main' or p_data is null
    or not agai_private.team_lead_piquet_scope(p_caserne,p_type) then
    return false;
  end if;
  select r.data into previous from public.records r
    where r.id = p_id and r.caserne = p_caserne
      and r.type = 'config' and not r.deleted;
  if previous is null or previous - 'piquets' - 'piquetsValidated' - 'disposValidated'
      <> p_data - 'piquets' - 'piquetsValidated' - 'disposValidated' then
    return false;
  end if;
  before_piquets := coalesce(previous->'piquets','{}'::jsonb);
  after_piquets := coalesce(p_data->'piquets','{}'::jsonb);
  before_validated := coalesce(previous->'piquetsValidated','{}'::jsonb);
  after_validated := coalesce(p_data->'piquetsValidated','{}'::jsonb);
  before_dispos := coalesce(previous->'disposValidated','{}'::jsonb);
  after_dispos := coalesce(p_data->'disposValidated','{}'::jsonb);
  if jsonb_typeof(before_piquets) <> 'object'
    or jsonb_typeof(after_piquets) <> 'object'
    or jsonb_typeof(before_validated) <> 'object'
    or jsonb_typeof(after_validated) <> 'object'
    or jsonb_typeof(before_dispos) <> 'object'
    or jsonb_typeof(after_dispos) <> 'object' then
    return false;
  end if;
  if before_piquets is distinct from after_piquets then
    if before_validated is distinct from after_validated
      or before_dispos is distinct from after_dispos
      or coalesce(before_piquets->'_log','{}'::jsonb)
        <> coalesce(after_piquets->'_log','{}'::jsonb) then
      return false;
    end if;
    for changed_week in
      select key from (
        select jsonb_object_keys(before_piquets) as key
        union select jsonb_object_keys(after_piquets) as key
      ) keys where before_piquets->keys.key is distinct from after_piquets->keys.key
    loop
      changed_count := changed_count + 1;
      if changed_week !~ '^[0-9]{8}$' or changed_week < current_week
        or previous->'piquetsValidated'->>changed_week = 'true'
        or jsonb_typeof(after_piquets->changed_week) is distinct from 'array' then
        return false;
      end if;
    end loop;
    return changed_count > 0;
  end if;
  if before_validated is not distinct from after_validated then return false; end if;
  for changed_week in
    select key from (
      select jsonb_object_keys(before_validated) as key
      union select jsonb_object_keys(after_validated) as key
      union select jsonb_object_keys(before_dispos) as key
      union select jsonb_object_keys(after_dispos) as key
    ) keys where before_validated->keys.key is distinct from after_validated->keys.key
      or before_dispos->keys.key is distinct from after_dispos->keys.key
  loop
    changed_count := changed_count + 1;
    if changed_count > 1 or changed_week !~ '^[0-9]{8}$' or changed_week < current_week
      or before_validated->>changed_week = 'true'
      or after_validated->>changed_week is distinct from 'true'
      or after_dispos->>changed_week is distinct from 'true'
      or jsonb_typeof(before_piquets->changed_week) is distinct from 'array'
      or jsonb_array_length(before_piquets->changed_week) = 0
      or exists (
        select 1 from jsonb_array_elements(before_piquets->changed_week) as elem(value)
        where jsonb_typeof(elem.value) <> 'object'
          or nullif(btrim(elem.value->>'chefAgres'),'') is null
          or nullif(btrim(elem.value->>'conducteur'),'') is null
      ) then return false; end if;
  end loop;
  return changed_count = 1;
end;
$$;

create or replace function public.agai_validate_piquet_week(
  p_week text, p_expected jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor record;
  station_config public.records%rowtype;
  current_week text := to_char(date_trunc('week', now() at time zone 'Europe/Paris'),'YYYYMMDD');
  next_data jsonb;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
    or p_week is null or p_week !~ '^[0-9]{8}$' or p_week < current_week
    or to_char(to_date(p_week,'YYYYMMDD'),'YYYYMMDD') <> p_week
    or extract(isodow from to_date(p_week,'YYYYMMDD')) <> 1
    or jsonb_typeof(p_expected) is distinct from 'array'
    or not agai_private.team_lead_piquet_scope(actor.caserne_id,'config') then
    raise exception 'AGAI_PIQUET_ACCESS_DENIED';
  end if;
  select * into station_config from public.records r
    where r.id=actor.caserne_id||'__config__main'
      and r.caserne=actor.caserne_id and r.type='config' and not r.deleted
    for update;
  if not found then raise exception 'AGAI_PIQUET_CONFIG_ABSENT'; end if;
  if station_config.data->'piquets'->p_week is distinct from p_expected then
    raise exception 'AGAI_PIQUET_REVISION_CONFLICT';
  end if;
  if station_config.data->'piquetsValidated'->>p_week='true'
    and station_config.data->'disposValidated'->>p_week='true' then
    return jsonb_build_object('week',p_week,'validated',true);
  end if;
  if jsonb_array_length(p_expected)=0 or exists (
    select 1 from jsonb_array_elements(p_expected) as elem(value)
    where jsonb_typeof(elem.value) <> 'object'
      or nullif(btrim(elem.value->>'chefAgres'),'') is null
      or nullif(btrim(elem.value->>'conducteur'),'') is null
  ) then raise exception 'AGAI_PIQUET_INCOMPLETE'; end if;
  next_data := jsonb_set(station_config.data,'{piquetsValidated}',
    coalesce(station_config.data->'piquetsValidated','{}'::jsonb),true);
  next_data := jsonb_set(next_data,'{disposValidated}',
    coalesce(station_config.data->'disposValidated','{}'::jsonb),true);
  next_data := jsonb_set(
    jsonb_set(next_data,array['piquetsValidated',p_week],'true'::jsonb,true),
    array['disposValidated',p_week],'true'::jsonb,true);
  update public.records r set data=next_data where r.id=station_config.id;
  return jsonb_build_object('week',p_week,'validated',true);
end;
$$;

revoke all on function public.agai_validate_piquet_week(text,jsonb) from public,anon;
grant execute on function public.agai_validate_piquet_week(text,jsonb) to authenticated;

commit;
