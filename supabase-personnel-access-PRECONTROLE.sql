-- Lecture seule : vérifier la préparation avant toute activation du suivi personnel.
-- Ne change ni les comptes, ni les données, ni les droits.
with credentials as (
  select c.login,c.caserne_id,c.active,l.auth_user_id,
         u.id is not null as auth_present
  from public.agai_identity_credentials c
  left join public.agai_auth_links l on l.login=c.login
  left join auth.users u on u.id=l.auth_user_id
),
records_security as (
  select c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced
  from pg_class c where c.oid=to_regclass('public.records')
)
select 'COMPTES ACTIFS' as controle,
  jsonb_build_object(
    'actifs',count(*) filter(where active),
    'rattaches',count(*) filter(where active and auth_user_id is not null and auth_present),
    'non_rattaches',coalesce(jsonb_agg(jsonb_build_object('caserne',caserne_id,'login',login))
      filter(where active and (auth_user_id is null or not auth_present)),'[]'::jsonb)
  ) as details
from credentials
union all
select 'ACCES HISTORIQUE ANON',
  jsonb_build_object(
    'records_rls',coalesce((select rls_enabled from records_security),false),
    'records_select_anon',has_table_privilege('anon','public.records','SELECT'),
    'records_insert_anon',has_table_privilege('anon','public.records','INSERT'),
    'records_update_anon',has_table_privilege('anon','public.records','UPDATE'),
    'atomic_upsert_anon',coalesce(has_function_privilege('anon',
      to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)'),
      'EXECUTE'),false)
  );
