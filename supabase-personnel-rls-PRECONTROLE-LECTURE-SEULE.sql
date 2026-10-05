-- Lecture seule : état réel des protections de la table records et du RPC atomique.
-- Ne renvoie ni mot de passe, ni jeton, ni donnée d'intervention.
with atomic as (
  select p.oid,p.prosecdef,pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid=to_regprocedure(
    'public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)')
), policies as (
  select policyname,cmd,roles,qual,with_check
  from pg_policies where schemaname='public' and tablename='records'
), record_triggers as (
  select t.tgname as name
  from pg_trigger t
  where t.tgrelid=to_regclass('public.records') and not t.tgisinternal
)
select 'POLITIQUES RECORDS' as controle,
  jsonb_build_object(
    'politiques',coalesce((select jsonb_agg(to_jsonb(policies) order by policyname) from policies),'[]'::jsonb),
    'declencheurs',coalesce((select jsonb_agg(name order by name) from record_triggers),'[]'::jsonb)
  ) as details
union all
select 'FONCTION ATOMIQUE',
  jsonb_build_object(
    'presente',exists(select 1 from atomic),
    'privileges_execute_anon',coalesce(has_function_privilege('anon',
      to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)'),
      'EXECUTE'),false),
    'security_definer',coalesce((select prosecdef from atomic),false),
    'empreinte_definition',(select md5(definition) from atomic),
    'mention_auth_uid',coalesce((select position('auth.uid' in definition)>0 from atomic),false),
    'mention_jwt',coalesce((select position('request.jwt' in definition)>0 from atomic),false)
  );
