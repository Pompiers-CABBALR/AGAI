-- Une prolongation contiguë conserve l'arrêt déjà en vigueur jusqu'à sa fin.
-- La nouvelle décision est tracée à sa propre date d'effet, sans rouvrir
-- temporairement l'accès opérationnel si elle est saisie à l'avance.
create or replace function public.agai_set_personnel_access(
  p_login text,
  p_status text,
  p_start date,
  p_end date,
  p_actor text
) returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
  v_login text := lower(trim(p_login));
  v_actor text := lower(trim(p_actor));
  v_caserne text;
  v_old_status text;
  v_old_start date;
  v_old_end date;
  v_extension boolean := false;
  v_revision bigint;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if p_status not in ('actif','arret','disponibilite','demission','licenciement','retraite')
     or v_login = '' or v_actor = '' or v_login = v_actor
     or (p_status <> 'actif' and p_start is null)
     or (p_status = 'disponibilite' and p_end is null)
     or (p_end is not null and (p_start is null or p_end < p_start))
     or (p_status in ('demission','licenciement','retraite') and p_end is not null)
     or (p_status = 'actif' and p_start <> v_today)
  then
    raise exception 'AGAI_PERSONNEL_INVALID_STATUS';
  end if;

  select c.caserne_id into v_caserne
  from public.agai_identity_credentials c
  where c.login = v_login and c.active
  for update;
  if not found then raise exception 'AGAI_PERSONNEL_UNKNOWN_OR_INACTIVE_ACCOUNT'; end if;

  select s.status, s.starts_on, s.ends_on
    into v_old_status, v_old_start, v_old_end
  from public.agai_personnel_access s
  where s.login = v_login
  for update;

  v_extension := p_status = 'arret' and v_old_status = 'arret'
    and v_old_start is not null and v_old_end is not null
    and p_start = v_old_end + 1 and p_end is not null;

  insert into public.agai_personnel_access
    (login, status, starts_on, ends_on, updated_at, updated_by, revision)
  values (v_login, p_status,
    case when v_extension then v_old_start else p_start end,
    p_end, now(), v_actor, 1)
  on conflict (login) do update set
    status = excluded.status,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    updated_at = now(),
    updated_by = excluded.updated_by,
    revision = public.agai_personnel_access.revision + 1
  returning revision into v_revision;

  insert into public.agai_personnel_access_history
    (login, caserne_id, old_status, new_status, starts_on, ends_on, recorded_by)
  values (v_login, v_caserne, v_old_status, p_status, p_start, p_end, v_actor);

  return v_revision;
end;
$$;

revoke execute on function public.agai_set_personnel_access(text,text,date,date,text)
  from public, anon, authenticated;
grant execute on function public.agai_set_personnel_access(text,text,date,date,text)
  to service_role;
