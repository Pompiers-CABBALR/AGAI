-- AGAI — cible de sécurité Supabase
-- À appliquer uniquement après activation de Supabase Auth et ajout des claims
-- app_role et caserne_id dans app_metadata. Le client historique anonyme sera refusé.

alter table public.records enable row level security;
alter table public.records force row level security;

-- La table doit appartenir à la publication Realtime pour que les changements
-- de statut soient diffusés immédiatement aux autres appareils.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end
$$;

revoke all on table public.records from anon;
grant select, insert, update on table public.records to authenticated;

drop policy if exists agai_records_read on public.records;
create policy agai_records_read
on public.records
for select
to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'app_role') in ('superadmin','chef_corps')
  or caserne = (auth.jwt() -> 'app_metadata' ->> 'caserne_id')
);

drop policy if exists agai_records_insert on public.records;
create policy agai_records_insert
on public.records
for insert
to authenticated
with check (
  (auth.jwt() -> 'app_metadata' ->> 'app_role') = 'superadmin'
  or (
    caserne = (auth.jwt() -> 'app_metadata' ->> 'caserne_id')
    and caserne <> '_GLOBAL'
  )
);

drop policy if exists agai_records_update on public.records;
create policy agai_records_update
on public.records
for update
to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'app_role') = 'superadmin'
  or (
    caserne = (auth.jwt() -> 'app_metadata' ->> 'caserne_id')
    and caserne <> '_GLOBAL'
  )
)
with check (
  (auth.jwt() -> 'app_metadata' ->> 'app_role') = 'superadmin'
  or (
    caserne = (auth.jwt() -> 'app_metadata' ->> 'caserne_id')
    and caserne <> '_GLOBAL'
  )
);

-- Compteurs atomiques : évite les doublons lorsque plusieurs postes clôturent
-- simultanément. Un compteur est indépendant par portée et période.
create table if not exists public.agai_counters (
  scope text not null,
  period text not null,
  value bigint not null default 0,
  primary key (scope, period)
);

alter table public.agai_counters enable row level security;
alter table public.agai_counters force row level security;
revoke all on table public.agai_counters from anon, authenticated;

create or replace function public.agai_next_counter(p_scope text, p_period text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'authentication required';
  end if;

  insert into public.agai_counters(scope, period, value)
  values (p_scope, p_period, 1)
  on conflict (scope, period)
  do update set value = public.agai_counters.value + 1
  returning value into next_value;

  return next_value;
end;
$$;

revoke all on function public.agai_next_counter(text,text) from public, anon;
grant execute on function public.agai_next_counter(text,text) to authenticated;
