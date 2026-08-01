-- AGAI — activation sûre du temps réel pour la table records
-- Ce script ne modifie ni les comptes, ni les mots de passe, ni les règles RLS.

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
