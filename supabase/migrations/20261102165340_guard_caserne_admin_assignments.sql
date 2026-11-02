-- Un administrateur de caserne peut gérer le personnel, mais seul le
-- superadmin peut attribuer ou retirer le rôle Administration.
-- Conserver les valeurs du serveur lors d'une écriture non-superadmin évite
-- qu'une copie locale ancienne bloque la synchronisation des autres champs.
begin;

create function agai_private.preserve_caserne_admin_assignments(
  p_type text, p_old jsonb, p_new jsonb
) returns jsonb
language plpgsql immutable set search_path = ''
as $function$
declare
  previous jsonb := coalesce(p_old, '{}'::jsonb);
  incoming jsonb := coalesce(p_new, '{}'::jsonb);
  previous_admin boolean;
  incoming_admin boolean;
  ordinary_rights jsonb;
begin
  if p_type = 'config' then
    incoming := incoming - 'adminLogins' - 'adminLogin';
    if previous ? 'adminLogins' then
      incoming := jsonb_set(incoming, '{adminLogins}', previous->'adminLogins', true);
    end if;
    if previous ? 'adminLogin' then
      incoming := jsonb_set(incoming, '{adminLogin}', previous->'adminLogin', true);
    end if;
    return incoming;
  end if;

  if p_type <> 'user' then return incoming; end if;
  previous_admin := jsonb_typeof(previous->'rights') = 'array'
    and previous->'rights' @> '["Administration"]'::jsonb;
  incoming_admin := jsonb_typeof(incoming->'rights') = 'array'
    and incoming->'rights' @> '["Administration"]'::jsonb;
  if coalesce(previous_admin, false) is distinct from coalesce(incoming_admin, false) then
    select coalesce(jsonb_agg(right_name order by ordinal), '[]'::jsonb)
      into ordinary_rights
    from jsonb_array_elements(case when jsonb_typeof(incoming->'rights') = 'array'
      then incoming->'rights' else '[]'::jsonb end)
      with ordinality as item(right_name, ordinal)
    where right_name <> '"Administration"'::jsonb;
    if coalesce(previous_admin, false) then
      ordinary_rights := ordinary_rights || '["Administration"]'::jsonb;
    end if;
    incoming := jsonb_set(incoming, '{rights}', ordinary_rights, true);
  end if;

  if coalesce(previous->>'appRole', '') in
       ('superadmin', 'chef_corps', 'administrateur_caserne')
     or coalesce(incoming->>'appRole', '') in
       ('superadmin', 'chef_corps', 'administrateur_caserne') then
    incoming := incoming - 'appRole';
    if previous ? 'appRole' then
      incoming := jsonb_set(incoming, '{appRole}', previous->'appRole', true);
    end if;
  end if;
  if coalesce(previous->>'role', '') in ('superadmin', 'chef_corps')
     or coalesce(incoming->>'role', '') in ('superadmin', 'chef_corps') then
    incoming := incoming - 'role';
    if previous ? 'role' then
      incoming := jsonb_set(incoming, '{role}', previous->'role', true);
    end if;
  end if;
  incoming := incoming - '_isSA';
  if previous ? '_isSA' then
    incoming := jsonb_set(incoming, '{_isSA}', previous->'_isSA', true);
  end if;
  return incoming;
end;
$function$;
revoke execute on function agai_private.preserve_caserne_admin_assignments(
  text, jsonb, jsonb) from public, anon, authenticated;

create function agai_private.guard_caserne_admin_assignments()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  actor_role text;
  previous_data jsonb;
begin
  if new.type not in ('user', 'config') or (select auth.uid()) is null then
    return new;
  end if;
  select access.app_role into actor_role
  from agai_private.current_access() access where access.can_login;
  if actor_role is distinct from 'administrateur_caserne' then return new; end if;
  if tg_op = 'UPDATE' then
    previous_data := old.data;
    if new.type = 'user' and (
      old.data->'rights' @> '["Administration"]'::jsonb
      or old.data->>'appRole' in
        ('superadmin', 'chef_corps', 'administrateur_caserne')
      or old.data->>'role' in ('superadmin', 'chef_corps')
      or old.data->>'_isSA' = 'true'
    ) then
      new.deleted := old.deleted;
    end if;
  else
    previous_data := '{}'::jsonb;
  end if;
  new.data := agai_private.preserve_caserne_admin_assignments(
    new.type, previous_data, new.data
  );
  return new;
end;
$function$;
revoke execute on function agai_private.guard_caserne_admin_assignments()
  from public, anon, authenticated;

create trigger m_agai_guard_caserne_admin_assignments
  before insert or update of data, type, deleted on public.records
  for each row when (new.type in ('user', 'config'))
  execute function agai_private.guard_caserne_admin_assignments();

commit;
