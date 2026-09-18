-- AGAI v239 — liaison progressive et invisible des comptes AGAI à Supabase Auth
-- Ce script prépare les identités sans activer les règles RLS restrictives.
-- Il peut être réexécuté : les liaisons déjà réalisées sont conservées.

create table if not exists public.agai_identity_credentials (
  login text primary key,
  caserne_id text not null,
  password_hash text not null,
  app_role text not null default 'agent',
  first_name text not null default '',
  last_name text not null default '',
  active boolean not null default true,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.agai_auth_links (
  login text primary key references public.agai_identity_credentials(login) on update cascade on delete cascade,
  auth_user_id uuid not null unique,
  caserne_id text not null,
  app_role text not null,
  linked_at timestamptz not null default now(),
  last_login_at timestamptz,
  last_device_id text
);

create table if not exists public.agai_auth_attempts (
  login text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now()
);

alter table public.agai_identity_credentials enable row level security;
alter table public.agai_auth_links enable row level security;
alter table public.agai_auth_attempts enable row level security;
revoke all on table public.agai_identity_credentials from public, anon, authenticated;
revoke all on table public.agai_auth_links from public, anon, authenticated;
revoke all on table public.agai_auth_attempts from public, anon, authenticated;

-- Import initial des comptes de caserne depuis les lignes records existantes.
insert into public.agai_identity_credentials(login,caserne_id,password_hash,app_role,first_name,last_name,source_updated_at)
select lower(trim(r.data->>'l')),
       r.caserne,
       r.data->>'p',
       coalesce(nullif(r.data->>'appRole',''),
         case
           when coalesce(r.data->>'_isSA','false')='true' then 'superadmin'
           when coalesce(r.data->'rights','[]'::jsonb) ? 'Administration' then 'administrateur_caserne'
           else 'agent'
         end),
       coalesce(r.data->>'prenom',''),
       coalesce(r.data->>'nom',''),
       now()
from public.records r
where r.type='user'
  and coalesce(r.deleted,false)=false
  and coalesce(trim(r.data->>'l'),'')<>''
  and coalesce(r.data->>'p','')<>''
on conflict(login) do update set
  caserne_id=excluded.caserne_id,
  password_hash=case when exists(select 1 from public.agai_auth_links l where l.login=excluded.login) then public.agai_identity_credentials.password_hash else excluded.password_hash end,
  app_role=excluded.app_role,
  first_name=excluded.first_name,
  last_name=excluded.last_name,
  source_updated_at=now();

-- Import initial des comptes globaux (superadmin et chef de corps).
insert into public.agai_identity_credentials(login,caserne_id,password_hash,app_role,first_name,last_name,source_updated_at)
select lower(trim(account->>'l')),
       coalesce(nullif(account->>'caserneId',''),case when account->>'role'='chef_corps' then 'EMAJ' else '_GLOBAL' end),
       account->>'p',
       case when account->>'role'='superadmin' then 'superadmin'
            when account->>'role'='chef_corps' then 'chef_corps'
            else coalesce(nullif(account->>'appRole',''),'agent') end,
       coalesce(account->>'prenom',''),
       coalesce(account->>'nom',''),
       now()
from public.records r
cross join lateral jsonb_array_elements(coalesce(r.data->'GLOBAL_ACCOUNTS','[]'::jsonb)) account
where r.caserne='_GLOBAL'
  and r.type='global'
  and coalesce(r.deleted,false)=false
  and coalesce(trim(account->>'l'),'')<>''
  and coalesce(account->>'p','')<>''
on conflict(login) do update set
  caserne_id=excluded.caserne_id,
  password_hash=case when exists(select 1 from public.agai_auth_links l where l.login=excluded.login) then public.agai_identity_credentials.password_hash else excluded.password_hash end,
  app_role=excluded.app_role,
  first_name=excluded.first_name,
  last_name=excluded.last_name,
  source_updated_at=now();

create or replace function public.agai_account_link_health()
returns jsonb
language sql
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'version','v239',
    'status','ready',
    'eligibleAccounts',(select count(*) from public.agai_identity_credentials where active),
    'linkedAccounts',(select count(*) from public.agai_auth_links l join public.agai_identity_credentials c on c.login=l.login where c.active),
    'remainingAccounts',(select count(*) from public.agai_identity_credentials c where c.active and not exists(select 1 from public.agai_auth_links l where l.login=c.login)),
    'lastLinkedAt',(select max(linked_at) from public.agai_auth_links)
  );
$$;

revoke all on function public.agai_account_link_health() from public;
grant execute on function public.agai_account_link_health() to anon, authenticated;
