-- Contrôle d'écriture isolé du pilote CIS05. La sous-transaction contenant
-- l'écriture est toujours annulée, même quand PostgREST n'offre pas tx=rollback.
create or replace function public.agai_auth_write_probe_cis05()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id text := 'CIS05__iv__auth-write-dry-run-' || pg_catalog.gen_random_uuid()::text;
  v_result jsonb;
  v_succeeded boolean := false;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;

  begin
    v_result := public.agai_atomic_upsert_record_auth(
      v_id, 'CIS05', 'iv',
      pg_catalog.jsonb_build_object(
        'id', pg_catalog.substr(v_id, 12),
        's', 'en-attente',
        '_statusRevision', 0,
        '_serverRevision', 0
      ),
      true, 'client-untrusted', 0, 0,
      'security-control', 'V202610_0016',
      'security-control-' || v_id
    );
    if v_result->>'ok' is distinct from 'true'
       or v_result->>'id' is distinct from v_id
       or v_result->>'status' is distinct from 'en-attente' then
      raise exception 'AGAI_WRITE_PROBE_RESULT_INVALID';
    end if;

    v_succeeded := true;
    raise exception using errcode = 'PZ001', message = 'AGAI_WRITE_PROBE_ROLLBACK';
  exception
    when sqlstate 'PZ001' then
      if not v_succeeded or sqlerrm <> 'AGAI_WRITE_PROBE_ROLLBACK' then
        raise;
      end if;
  end;

  -- Une erreur capturée annule toutes les écritures du bloc intérieur.
  -- Ce contrôle supplémentaire permet de détecter une anomalie avant de répondre.
  if exists (select 1 from public.records where id = v_id) then
    raise exception 'AGAI_WRITE_PROBE_PERSISTED';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'id', v_id,
    'status', v_result->>'status',
    'rolledBack', true
  );
end;
$$;

revoke all on function public.agai_auth_write_probe_cis05() from public, anon;
grant execute on function public.agai_auth_write_probe_cis05() to authenticated;
