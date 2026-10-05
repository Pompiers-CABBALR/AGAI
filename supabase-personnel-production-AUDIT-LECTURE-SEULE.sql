-- AGAI — audit préalable de la production pour le suivi du personnel.
-- LECTURE SEULE. Ne change ni compte, ni fiche, ni règle d'accès.
-- Ne renvoie ni mot de passe, ni empreinte, ni contenu de fiche.

with comptes as (
  select c.login,c.caserne_id,c.active,
    l.auth_user_id is not null and u.id is not null as rattache
  from public.agai_identity_credentials c
  left join public.agai_auth_links l on l.login=c.login
  left join auth.users u on u.id=l.auth_user_id
), fonctions as (
  select p.oid,p.prosecdef,pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid=to_regprocedure(
    'public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)')
), global_accounts as (
  select item
  from public.records r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.data->'GLOBAL_ACCOUNTS')='array'
      then r.data->'GLOBAL_ACCOUNTS' else '[]'::jsonb end
  ) item
  where r.caserne='_GLOBAL' and r.type='global'
    and coalesce(r.deleted,false)=false
)
select 'COMPTES' as controle,jsonb_build_object(
  'actifs',(select count(*) from comptes where active),
  'actifs_rattaches',(select count(*) from comptes where active and rattache),
  'actifs_non_rattaches',coalesce((select jsonb_agg(jsonb_build_object('login',login,'caserne',caserne_id) order by caserne_id,login)
    from comptes where active and not rattache),'[]'::jsonb),
  'cis04_admin_actif',(select active from comptes where login='cis04.admin')
) as details
union all
select 'ACCES RECORDS',jsonb_build_object(
  'rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.records')),false),
  'anon_select',coalesce(has_table_privilege('anon',to_regclass('public.records'),'SELECT'),false),
  'anon_insert',coalesce(has_table_privilege('anon',to_regclass('public.records'),'INSERT'),false),
  'anon_update',coalesce(has_table_privilege('anon',to_regclass('public.records'),'UPDATE'),false),
  'anon_delete',coalesce(has_table_privilege('anon',to_regclass('public.records'),'DELETE'),false),
  'authenticated_select',coalesce(has_table_privilege('authenticated',to_regclass('public.records'),'SELECT'),false),
  'politiques',coalesce((select jsonb_agg(jsonb_build_object('nom',policyname,'commande',cmd,'roles',roles,'condition',qual,'verification',with_check)
    order by policyname) from pg_policies where schemaname='public' and tablename='records'),'[]'::jsonb)
)
union all
select 'FONCTION ATOMIQUE',jsonb_build_object(
  'presente',exists(select 1 from fonctions),
  'security_definer',coalesce((select prosecdef from fonctions),false),
  'anon_execute',coalesce(has_function_privilege('anon',to_regprocedure(
    'public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)'),'EXECUTE'),false),
  'authenticated_execute',coalesce(has_function_privilege('authenticated',to_regprocedure(
    'public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)'),'EXECUTE'),false),
  'controle_identite',coalesce((select position('auth.uid' in definition)>0 or position('request.jwt' in definition)>0 from fonctions),false),
  'empreinte_definition',(select md5(definition) from fonctions)
)
union all
select 'DONNEES A SEPARER',jsonb_build_object(
  'fiches_personnel_avec_empreinte',(select count(*) from public.records r where not r.deleted and r.type='user' and r.data ? 'p'),
  'comptes_globaux_avec_empreinte',(select count(*) from global_accounts where item ? 'p'),
  'ligne_globale_presente',exists(select 1 from public.records r
    where r.caserne='_GLOBAL' and r.type='global' and coalesce(r.deleted,false)=false)
)
union all
select 'TABLES SENSIBLES',coalesce((
  select jsonb_agg(jsonb_build_object('table',t.tablename,'anon_select',
    coalesce(has_table_privilege('anon',to_regclass('public.'||t.tablename),'SELECT'),false),
    'anon_write',coalesce(has_table_privilege('anon',to_regclass('public.'||t.tablename),'INSERT'),false)
      or coalesce(has_table_privilege('anon',to_regclass('public.'||t.tablename),'UPDATE'),false)
      or coalesce(has_table_privilege('anon',to_regclass('public.'||t.tablename),'DELETE'),false),
    'rls',coalesce((select c.relrowsecurity from pg_class c where c.oid=to_regclass('public.'||t.tablename)),false)) order by t.tablename)
  from (values ('caserne_data'),('agai_identity_credentials'),('agai_auth_links'),
    ('agai_auth_attempts'),('agai_personnel_access'),('agai_personnel_access_history')) t(tablename)
  where to_regclass('public.'||t.tablename) is not null
),'[]'::jsonb)
union all
select 'REALTIME RECORDS',jsonb_build_object(
  'publications',coalesce((select jsonb_agg(pubname order by pubname)
    from pg_publication_tables where schemaname='public' and tablename='records'),'[]'::jsonb)
);
