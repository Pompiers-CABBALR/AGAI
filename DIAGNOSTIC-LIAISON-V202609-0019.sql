-- Diagnostic en lecture seule. N'active aucune liaison et ne modifie aucune donnée.
select
  to_regclass('public.agai_identity_credentials') is not null as table_identifiants_presente,
  to_regclass('public.agai_auth_links') is not null as table_liaisons_presente,
  to_regclass('public.agai_auth_attempts') is not null as table_tentatives_presente,
  to_regprocedure('public.agai_account_link_health()') is not null as fonction_sante_presente;

select
  c.relname as table_privee,
  c.relrowsecurity as rls_active,
  has_table_privilege('anon',c.oid,'SELECT') as lecture_anon,
  has_table_privilege('authenticated',c.oid,'SELECT') as lecture_authentifiee
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('agai_identity_credentials','agai_auth_links','agai_auth_attempts')
order by c.relname;

-- Après confirmation de la présence de la fonction, exécuter séparément :
-- select public.agai_account_link_health();
-- Ne pas transmettre les hashes de mots de passe ni les jetons Auth.
