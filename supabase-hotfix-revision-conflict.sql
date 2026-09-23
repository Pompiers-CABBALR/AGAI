-- Correctif ciblé AGAI : les conflits de révision restent refusés avec HTTP 409,
-- sans SQLSTATE 40001 (serialization_failure), qui provoque des reprises en
-- boucle dans certaines versions de PostgREST.
-- Exécuter UNE fois dans le SQL Editor Supabase, sur la base de production.
-- Ne modifie aucune ligne de public.records et ne vide aucune file locale.

do $$
declare
  target_function regprocedure := to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)');
  definition text;
  old_code_count integer;
begin
  if target_function is null then
    raise exception 'AGAI : fonction agai_atomic_upsert_record introuvable ; aucun changement effectué';
  end if;

  definition := pg_get_functiondef(target_function);
  if position('AGAI_REVISION_CONFLICT' in definition)=0 then
    raise exception 'AGAI : fonction inattendue ; aucun changement effectué';
  end if;

  old_code_count := (length(definition)-length(replace(definition, '''40001''', '')))/7;
  if old_code_count=0 and position('''PT409''' in definition)>0 then
    raise notice 'AGAI : correctif déjà installé';
    return;
  end if;
  if old_code_count<>4 then
    raise exception 'AGAI : % codes 40001 trouvés, 4 attendus ; aucun changement effectué',old_code_count;
  end if;

  execute replace(definition, '''40001''', '''PT409''');
  raise notice 'AGAI : quatre conflits de révision convertis en HTTP 409';
end;
$$;

select
  position('''40001''' in pg_get_functiondef(to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)')))=0 as aucun_40001,
  position('''PT409''' in pg_get_functiondef(to_regprocedure('public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)')))>0 as conflit_http_409;
