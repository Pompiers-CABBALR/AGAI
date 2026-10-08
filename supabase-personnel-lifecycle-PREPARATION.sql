-- AGAI — ANCIEN BROUILLON, NE PAS EXÉCUTER.
-- Les phases 1 et 2 sont désormais décrites dans
-- supabase-personnel-phase-1-structures.sql et
-- supabase-personnel-phase-2-service-functions.sql.
-- Ce brouillon contient des définitions obsolètes et ne doit pas être rejoué.
-- Ce fichier seul ne coupe PAS l'accès historique anon aux enregistrements.
-- Les motifs médicaux et diagnostics ne sont jamais stockés ici.

create table if not exists public.agai_personnel_access (
  login text primary key references public.agai_identity_credentials(login) on update cascade,
  status text not null default 'actif' check (status in
    ('actif','arret','disponibilite','demission','licenciement','retraite')),
  starts_on date,
  ends_on date,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  revision bigint not null default 0,
  constraint agai_personnel_access_dates check
    (ends_on is null or starts_on is not null and ends_on >= starts_on)
);

create table if not exists public.agai_personnel_access_history (
  id bigint generated always as identity primary key,
  login text not null,
  caserne_id text not null,
  old_status text,
  new_status text not null,
  starts_on date,
  ends_on date,
  recorded_at timestamptz not null default now(),
  recorded_by text not null
);

alter table public.agai_personnel_access enable row level security;
alter table public.agai_personnel_access_history enable row level security;
revoke all on public.agai_personnel_access from public, anon, authenticated;
revoke all on public.agai_personnel_access_history from public, anon, authenticated;

create or replace function public.agai_personnel_can_login(p_login text,p_on date default (now() at time zone 'Europe/Paris')::date)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.agai_identity_credentials c
    left join public.agai_personnel_access s on s.login=c.login
    where c.login=lower(trim(p_login)) and c.active
      and not (
        s.status in ('disponibilite','demission','licenciement','retraite')
        and s.starts_on<=p_on
        and (s.ends_on is null or p_on<=s.ends_on)
      )
  );
$$;

create or replace function public.agai_personnel_can_operate(p_login text,p_on date default (now() at time zone 'Europe/Paris')::date)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.agai_identity_credentials c
    left join public.agai_personnel_access s on s.login=c.login
    where c.login=lower(trim(p_login)) and c.active
      and not (
        s.status in ('arret','disponibilite','demission','licenciement','retraite')
        and s.starts_on<=p_on
        and (s.ends_on is null or p_on<=s.ends_on)
      )
  );
$$;

-- L'application ne doit pas appeler directement ces fonctions avec anon.
revoke all on function public.agai_personnel_can_login(text,date) from public, anon, authenticated;
revoke all on function public.agai_personnel_can_operate(text,date) from public, anon, authenticated;
grant execute on function public.agai_personnel_can_login(text,date) to service_role;
grant execute on function public.agai_personnel_can_operate(text,date) to service_role;

-- Une seule transition serveur modifie le statut et écrit son audit.
create or replace function public.agai_set_personnel_access(
  p_login text,p_status text,p_start date,p_end date,p_actor text
)
returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_login text:=lower(trim(p_login));
  v_caserne text;
  v_old text;
  v_old_start date;
  v_old_end date;
  v_revision bigint;
begin
  if p_status not in ('actif','arret','disponibilite','demission','licenciement','retraite')
    or trim(coalesce(p_actor,''))=''
    or (p_status<>'actif' and p_start is null)
    or (p_status='disponibilite' and p_end is null)
    or (p_end is not null and (p_start is null or p_end<p_start))
    or (p_status in ('demission','licenciement','retraite') and p_end is not null)
  then raise exception 'AGAI_PERSONNEL_INVALID_STATUS'; end if;
  select caserne_id into v_caserne from public.agai_identity_credentials
    where login=v_login for update;
  if not found then raise exception 'AGAI_PERSONNEL_UNKNOWN_ACCOUNT'; end if;
  select status,starts_on,ends_on into v_old,v_old_start,v_old_end
    from public.agai_personnel_access where login=v_login for update;
  if p_start>(now() at time zone 'Europe/Paris')::date
    and v_old is not null and v_old<>'actif'
    and (v_old_start>(now() at time zone 'Europe/Paris')::date
      or (v_old_start<=(now() at time zone 'Europe/Paris')::date
        and (v_old_end is null or v_old_end>=(now() at time zone 'Europe/Paris')::date)))
  then raise exception 'AGAI_PERSONNEL_PENDING_STATUS'; end if;
  insert into public.agai_personnel_access(login,status,starts_on,ends_on,updated_by,revision)
    values(v_login,p_status,p_start,p_end,p_actor,1)
    on conflict(login) do update set
      status=excluded.status,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
      updated_at=now(),updated_by=excluded.updated_by,
      revision=public.agai_personnel_access.revision+1
    returning revision into v_revision;
  insert into public.agai_personnel_access_history
    (login,caserne_id,old_status,new_status,starts_on,ends_on,recorded_by)
    values(v_login,v_caserne,v_old,p_status,p_start,p_end,p_actor);
  update public.agai_identity_credentials set
    active=case when p_status in ('demission','licenciement','retraite')
      and p_start<=(now() at time zone 'Europe/Paris')::date then false else true end,
    source_updated_at=now()
    where login=v_login;
  return v_revision;
end;
$$;

revoke all on function public.agai_set_personnel_access(text,text,date,date,text) from public, anon, authenticated;
grant execute on function public.agai_set_personnel_access(text,text,date,date,text) to service_role;
