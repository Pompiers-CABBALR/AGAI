-- Appliquée en production sous la version 20261106210444.
-- Aucun droit supplémentaire n'est créé automatiquement : le superadmin
-- attribue explicitement chaque caserne. L'appartenance reste inchangée.
begin;

create table public.agai_admin_station_grants (
  login text not null references public.agai_identity_credentials(login),
  caserne_id text not null,
  active boolean not null default true,
  changed_by text not null references public.agai_identity_credentials(login),
  changed_at timestamptz not null default now(),
  primary key (login, caserne_id),
  constraint agai_admin_station_grants_station_format check (caserne_id ~ '^CIS[0-9]{2,}$')
);
create index agai_admin_station_grants_active_station_idx
  on public.agai_admin_station_grants (caserne_id, login) where active;
alter table public.agai_admin_station_grants enable row level security;
revoke all on public.agai_admin_station_grants from public, anon, authenticated;
grant select, insert, update on public.agai_admin_station_grants to service_role;

create table public.agai_admin_station_grant_audit (
  id bigint generated always as identity primary key,
  login text not null,
  caserne_id text not null,
  old_active boolean,
  new_active boolean not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);
create index agai_admin_station_grant_audit_login_idx
  on public.agai_admin_station_grant_audit (login, changed_at desc);
alter table public.agai_admin_station_grant_audit enable row level security;
revoke all on public.agai_admin_station_grant_audit from public, anon, authenticated;
grant select on public.agai_admin_station_grant_audit to service_role;

create function agai_private.audit_admin_station_grant()
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
    select 1 from public.caserne_data d,
      jsonb_array_elements(coalesce(d.data->'CASERNES','[]'::jsonb)) station
    where d.caserne='_GLOBAL' and station->>'id'=new.caserne_id
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
create trigger agai_audit_admin_station_grant
  before insert or update on public.agai_admin_station_grants
  for each row execute function agai_private.audit_admin_station_grant();

create or replace function agai_private.current_access()
returns table(login text, caserne_id text, app_role text,
  can_login boolean, can_operate boolean)
language sql stable security definer set search_path = ''
as $function$
  with requested as (
    select nullif((coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb
      ->>'x-agai-admin-caserne'),'') as caserne_id
  )
  select c.login,
    case when c.app_role='administrateur_caserne'
           and requested.caserne_id is not null
      then requested.caserne_id else c.caserne_id end,
    c.app_role,
    c.active and not (
      coalesce(s.status,'actif') in
        ('disponibilite','suspension','demission','licenciement','retraite','mutation')
      and s.starts_on <= (now() at time zone 'Europe/Paris')::date
      and (s.ends_on is null or (now() at time zone 'Europe/Paris')::date <= s.ends_on)
    ) as can_login,
    c.active and not (
      coalesce(s.status,'actif') in
        ('arret','disponibilite','suspension','demission','licenciement','retraite','mutation')
      and s.starts_on <= (now() at time zone 'Europe/Paris')::date
      and (s.ends_on is null or (now() at time zone 'Europe/Paris')::date <= s.ends_on)
    ) as can_operate
  from public.agai_auth_links l
  join public.agai_identity_credentials c on c.login=l.login
  left join public.agai_personnel_access s on s.login=c.login
  cross join requested
  where l.auth_user_id=(select auth.uid())
    and l.caserne_id=c.caserne_id and l.app_role=c.app_role
    and (requested.caserne_id is null
      or requested.caserne_id=c.caserne_id
      or c.app_role='superadmin'
      or (c.app_role='administrateur_caserne' and exists (
        select 1 from public.agai_admin_station_grants g
        where g.login=c.login and g.caserne_id=requested.caserne_id and g.active
      )))
  limit 1;
$function$;

-- Realtime ne transmet pas l'en-tête de sélection. Il doit néanmoins pouvoir
-- livrer les fiches des seules casernes explicitement accordées au compte.
create function agai_private.can_read_admin_station(p_caserne text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from agai_private.current_access() actor
    join public.agai_admin_station_grants grant_row
      on grant_row.login=actor.login and grant_row.caserne_id=p_caserne
    where actor.app_role='administrateur_caserne'
      and actor.can_login and grant_row.active
  );
$function$;
revoke execute on function agai_private.can_read_admin_station(text)
  from public, anon;
grant execute on function agai_private.can_read_admin_station(text)
  to authenticated;
create policy agai_records_admin_station_select on public.records
  for select to authenticated
  using (agai_private.can_read_admin_station(caserne));

commit;
