-- Un responsable d'équipe peut enregistrer les piquets non validés de sa
-- caserne sans obtenir l'écriture du reste de la configuration.
begin;

create or replace function agai_private.team_lead_piquet_scope(p_caserne text, p_type text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_type = 'config'
    and exists (
      select 1 from agai_private.current_access() actor
      where actor.can_operate and actor.caserne_id = p_caserne
        and exists (
          select 1 from public.records team
          where team.caserne = p_caserne and team.type = 'equipe'
            and not team.deleted and team.data->>'resp' = actor.login
        )
    );
$$;

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
  if previous is null or previous - 'piquets' <> p_data - 'piquets' then
    return false;
  end if;
  before_piquets := coalesce(previous->'piquets','{}'::jsonb);
  after_piquets := coalesce(p_data->'piquets','{}'::jsonb);
  if jsonb_typeof(before_piquets) <> 'object'
    or jsonb_typeof(after_piquets) <> 'object'
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
end;
$$;

revoke all on function agai_private.team_lead_piquet_scope(text,text) from public;
revoke all on function agai_private.team_lead_piquet_update(text,text,text,jsonb) from public;
grant execute on function agai_private.team_lead_piquet_scope(text,text) to authenticated;
grant execute on function agai_private.team_lead_piquet_update(text,text,text,jsonb) to authenticated;

-- La politique RLS ne suffit pas : le déclencheur d'écriture vérifie
-- can_write_record avant chaque modification. Garder toutes ses protections
-- pour les autres types, et n'ajouter que l'exception contrôlée ci-dessus.
create or replace function agai_private.stamp_record_writer()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  actor_login text;
  jwt_role text := auth.role();
  normal_write boolean;
  team_piquet_write boolean := false;
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
  normal_write := agai_private.can_write_record(new.id,new.caserne,new.type,new.data)
    and (tg_op<>'UPDATE' or agai_private.can_write_record(old.id,old.caserne,old.type,old.data));
  if tg_op='UPDATE' and new.type='config' and not normal_write then
    team_piquet_write := not old.deleted and not new.deleted
      and agai_private.team_lead_piquet_update(new.id,new.caserne,new.type,new.data);
  end if;
  if not normal_write and not team_piquet_write then
    raise exception 'AGAI_WRITE_FORBIDDEN';
  end if;
  select access.login into actor_login from agai_private.current_access() access
    where access.can_login;
  if actor_login is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  new.updated_by := actor_login;
  return new;
end;
$$;

-- Le navigateur emploie un RPC, et non un upsert de toute la configuration :
-- seules les données de cette semaine sont échangées, avec comparaison de la
-- version lue avant édition et verrou de ligne contre les conflits simultanés.
create or replace function public.agai_save_unvalidated_piquet_week(
  p_week text, p_expected jsonb, p_next jsonb
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
    or p_week is null or p_next is null
    or p_week !~ '^[0-9]{8}$' or p_week < current_week
    or to_char(to_date(p_week,'YYYYMMDD'),'YYYYMMDD') <> p_week
    or extract(isodow from to_date(p_week,'YYYYMMDD')) <> 1
    or jsonb_typeof(p_next) <> 'array'
    or jsonb_array_length(p_next) > 1000
    or not agai_private.team_lead_piquet_scope(actor.caserne_id,'config') then
    raise exception 'AGAI_PIQUET_ACCESS_DENIED';
  end if;
  select * into station_config from public.records r
    where r.id=actor.caserne_id||'__config__main'
      and r.caserne=actor.caserne_id and r.type='config' and not r.deleted
    for update;
  if not found or station_config.data->'piquetsValidated'->>p_week='true' then
    raise exception 'AGAI_PIQUET_ALREADY_VALIDATED';
  end if;
  -- Une réponse réseau peut se perdre après le COMMIT : le même essai doit
  -- alors être acquitté sans provoquer un faux conflit de version.
  if station_config.data->'piquets'->p_week is not distinct from p_next then
    return p_next;
  end if;
  if station_config.data->'piquets'->p_week is distinct from p_expected then
    raise exception 'AGAI_PIQUET_REVISION_CONFLICT';
  end if;
  if p_next is not distinct from p_expected then
    return p_next;
  end if;
  next_data := jsonb_set(
    jsonb_set(station_config.data,'{piquets}',
      case when jsonb_typeof(station_config.data->'piquets')='object'
        then station_config.data->'piquets' else '{}'::jsonb end,true),
    array['piquets',p_week],p_next,true
  );
  update public.records r set data=next_data
    where r.id=station_config.id;
  return p_next;
end;
$$;

revoke all on function public.agai_save_unvalidated_piquet_week(text,jsonb,jsonb) from public,anon;
grant execute on function public.agai_save_unvalidated_piquet_week(text,jsonb,jsonb) to authenticated;

commit;
