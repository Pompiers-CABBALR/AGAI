-- Bascule generale AGAI : fermer les anciens acces anonymes apres publication
-- de la version Auth et sauvegarde verifiee. Les interventions ne sont pas modifiees.
DO $migration$
DECLARE
  v_total integer;
  v_unlinked integer;
  v_user_copies integer;
  v_global_copies integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE public.records, public.caserne_data, public.renforts
    IN ACCESS EXCLUSIVE MODE;

  SELECT count(*), count(*) FILTER (WHERE l.auth_user_id IS NULL
    OR u.id IS NULL
    OR l.caserne_id IS DISTINCT FROM c.caserne_id
    OR l.app_role IS DISTINCT FROM c.app_role
    OR u.raw_app_meta_data->>'caserne_id' IS DISTINCT FROM c.caserne_id
    OR u.raw_app_meta_data->>'app_role' IS DISTINCT FROM c.app_role)
  INTO v_total, v_unlinked
  FROM public.agai_identity_credentials c
  LEFT JOIN public.agai_auth_links l ON l.login = c.login
  LEFT JOIN auth.users u ON u.id = l.auth_user_id
  WHERE c.active IS TRUE;
  IF v_total < 1 OR v_unlinked <> 0 THEN
    RAISE EXCEPTION 'AGAI cutover: % active accounts, % without valid Auth link',
      v_total, v_unlinked;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'records' AND policyname = 'agai_records_auth_select')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'records' AND policyname = 'agai_records_auth_insert')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'records' AND policyname = 'agai_records_auth_update')
    OR NOT has_function_privilege('authenticated',
      'public.agai_atomic_upsert_record_auth(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'AGAI cutover: authenticated protections incomplete';
  END IF;

  -- Ces copies historiques deviennent accessibles apres authentification.
  -- Le secret de reference reste uniquement dans agai_identity_credentials.
  UPDATE public.records
     SET data = data - 'p' - 'password_hash' - 'passwordHash'
   WHERE type = 'user' AND data ?| ARRAY['p','password_hash','passwordHash'];
  GET DIAGNOSTICS v_user_copies = ROW_COUNT;

  UPDATE public.records r
     SET data = jsonb_set(r.data, '{GLOBAL_ACCOUNTS}',
       (SELECT jsonb_agg(a.account - 'p' - 'password_hash' - 'passwordHash'
                         ORDER BY a.position)
          FROM jsonb_array_elements(r.data->'GLOBAL_ACCOUNTS')
               WITH ORDINALITY AS a(account,position)))
   WHERE r.type = 'global'
     AND jsonb_typeof(r.data->'GLOBAL_ACCOUNTS') = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.data->'GLOBAL_ACCOUNTS') a
                 WHERE a ?| ARRAY['p','password_hash','passwordHash']);
  GET DIAGNOSTICS v_global_copies = ROW_COUNT;

  DROP POLICY IF EXISTS agai_records_all ON public.records;
  DROP POLICY IF EXISTS agai_caserne_data_all ON public.caserne_data;
  DROP POLICY IF EXISTS agai_renforts_all ON public.renforts;
  REVOKE ALL PRIVILEGES ON TABLE public.records, public.caserne_data,
    public.renforts FROM anon;
  REVOKE ALL PRIVILEGES ON TABLE public.records FROM authenticated;
  GRANT SELECT, INSERT, UPDATE ON TABLE public.records TO authenticated;
  REVOKE ALL PRIVILEGES ON TABLE public.caserne_data, public.renforts
    FROM authenticated;

  REVOKE EXECUTE ON FUNCTION
    public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)
    FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.agai_account_link_health()
    FROM PUBLIC, anon;
  REVOKE EXECUTE ON FUNCTION public.agai_atomic_health()
    FROM PUBLIC, anon;

  IF has_table_privilege('anon','public.records','SELECT')
    OR has_table_privilege('anon','public.caserne_data','SELECT')
    OR has_table_privilege('anon','public.renforts','SELECT')
    OR has_function_privilege('anon',
      'public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.agai_atomic_upsert_record(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated',
      'public.agai_atomic_upsert_record_auth(text,text,text,jsonb,boolean,text,bigint,bigint,text,text,text)', 'EXECUTE')
    OR NOT has_table_privilege('authenticated','public.records','SELECT')
    OR NOT has_table_privilege('authenticated','public.records','INSERT')
    OR NOT has_table_privilege('authenticated','public.records','UPDATE')
    OR has_table_privilege('authenticated','public.records','DELETE')
    OR EXISTS (SELECT 1 FROM public.records WHERE type = 'user'
               AND data ?| ARRAY['p','password_hash','passwordHash'])
    OR EXISTS (SELECT 1 FROM public.records r
                CROSS JOIN LATERAL jsonb_array_elements(r.data->'GLOBAL_ACCOUNTS') a
                WHERE r.type = 'global'
                  AND a ?| ARRAY['p','password_hash','passwordHash'])
  THEN
    RAISE EXCEPTION 'AGAI cutover: post-control failed; transaction rolled back';
  END IF;
  RAISE NOTICE 'AGAI cutover: % active accounts linked; % user copies and % global records sanitized',
    v_total, v_user_copies, v_global_copies;
END;
$migration$;
