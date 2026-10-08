-- AGAI personnel, phase 1 : structures inertes.
-- Aucun statut existant n'est modifie et aucun controle d'acces n'est active.
-- Les tables ne sont accessibles qu'au service serveur ; jamais au navigateur.

do $$
begin
  if to_regclass('public.agai_personnel_access') is not null
     or to_regclass('public.agai_personnel_access_history') is not null then
    raise exception 'AGAI_PERSONNEL_PHASE_1_ALREADY_PRESENT';
  end if;
  if to_regclass('public.agai_identity_credentials') is null then
    raise exception 'AGAI_PERSONNEL_CREDENTIALS_MISSING';
  end if;
end;
$$;

create table public.agai_personnel_access (
  login text primary key references public.agai_identity_credentials(login) on update cascade,
  status text not null default 'actif'
    check (status in ('actif','arret','disponibilite','demission','licenciement','retraite')),
  starts_on date,
  ends_on date,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  revision bigint not null default 0 check (revision >= 0),
  constraint agai_personnel_access_period check (
    (status = 'actif' or starts_on is not null)
    and (ends_on is null or starts_on is not null and ends_on >= starts_on)
    and (status <> 'disponibilite' or ends_on is not null)
    and (status not in ('demission','licenciement','retraite') or ends_on is null)
  )
);

create table public.agai_personnel_access_history (
  id bigint generated always as identity primary key,
  login text not null,
  caserne_id text not null,
  old_status text,
  new_status text not null
    check (new_status in ('actif','arret','disponibilite','demission','licenciement','retraite')),
  starts_on date,
  ends_on date,
  recorded_at timestamptz not null default now(),
  recorded_by text not null
);

create index agai_personnel_access_history_login_date_idx
  on public.agai_personnel_access_history (login, recorded_at desc);

alter table public.agai_personnel_access enable row level security;
alter table public.agai_personnel_access_history enable row level security;

revoke all on public.agai_personnel_access from public, anon, authenticated;
revoke all on public.agai_personnel_access_history from public, anon, authenticated;
revoke all on sequence public.agai_personnel_access_history_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.agai_personnel_access to service_role;
grant select, insert on public.agai_personnel_access_history to service_role;
grant usage on sequence public.agai_personnel_access_history_id_seq to service_role;
