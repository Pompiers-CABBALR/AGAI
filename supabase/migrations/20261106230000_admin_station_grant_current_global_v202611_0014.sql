-- Les casernes sont publiées dans records, et non dans caserne_data (vide).
-- Seul le contrôle d'existence de la caserne est corrigé ; aucune attribution
-- d'accès n'est créée ou modifiée par cette migration.
begin;

create or replace function agai_private.audit_admin_station_grant()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  owner_station text;
  prior_active boolean;
begin
  if tg_op = 'UPDATE' then
    if new.login is distinct from old.login
      or new.caserne_id is distinct from old.caserne_id then
      raise exception 'AGAI_ADMIN_SCOPE_IMMUTABLE';
    end if;
    prior_active := old.active;
  end if;
  select c.caserne_id into owner_station
  from public.agai_identity_credentials c
  join public.agai_auth_links l on l.login=c.login
    and l.caserne_id=c.caserne_id and l.app_role=c.app_role
  where c.login=new.login and c.active and c.app_role='administrateur_caserne';
  if owner_station is null or new.caserne_id=owner_station then
    raise exception 'AGAI_ADMIN_SCOPE_TARGET_INVALID';
  end if;
  if not exists (
    select 1 from public.agai_identity_credentials c
    where c.login=new.changed_by and c.active and c.app_role='superadmin'
  ) then raise exception 'AGAI_ADMIN_SCOPE_ACTOR_INVALID'; end if;
  if not exists (
    select 1 from public.records d,
      jsonb_array_elements(coalesce(d.data->'CASERNES','[]'::jsonb)) station
    where d.id='_GLOBAL__global__main' and d.caserne='_GLOBAL'
      and d.type='global' and not d.deleted
      and station->>'id'=new.caserne_id
  ) then raise exception 'AGAI_ADMIN_SCOPE_STATION_UNKNOWN'; end if;
  new.changed_at=now();
  if tg_op='UPDATE' and new.active is not distinct from prior_active then
    return old;
  end if;
  insert into public.agai_admin_station_grant_audit
    (login,caserne_id,old_active,new_active,changed_by,changed_at)
  values (new.login,new.caserne_id,prior_active,
    new.active,new.changed_by,new.changed_at);
  return new;
end;
$function$;

revoke execute on function agai_private.audit_admin_station_grant()
  from public, anon, authenticated;
commit;
