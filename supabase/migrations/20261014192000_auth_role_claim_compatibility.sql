-- PostgREST peut fournir le rôle dans request.jwt.claims (JSON) plutôt que
-- request.jwt.claim.role. auth.role() lit les deux formes ; l'essai HTTP réel
-- a détecté cette différence. Aucun droit anon n'est modifié ici.
begin;

create or replace function agai_private.stamp_record_writer()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  actor_login text;
  jwt_role text := auth.role();
begin
  if jwt_role is distinct from 'authenticated' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='DELETE' then raise exception 'AGAI_HARD_DELETE_FORBIDDEN'; end if;
  if new.type in ('iv','pilp') and current_user not in ('postgres','supabase_admin') then
    raise exception 'AGAI_OPERATION_REQUIRES_RPC';
  end if;
  if tg_op='UPDATE' and
    (new.id is distinct from old.id or new.caserne is distinct from old.caserne
      or new.type is distinct from old.type) then
    raise exception 'AGAI_RECORD_IDENTITY_IMMUTABLE';
  end if;
  if (tg_op='UPDATE' and not agai_private.can_write_record(old.id,old.caserne,old.type,old.data))
     or not agai_private.can_write_record(new.id,new.caserne,new.type,new.data) then
    raise exception 'AGAI_WRITE_FORBIDDEN';
  end if;
  select access.login into actor_login from agai_private.current_access() access
    where access.can_login;
  if actor_login is null then raise exception 'AGAI_AUTH_REQUIRED'; end if;
  new.updated_by := actor_login;
  return new;
end;
$$;

create or replace function public.agai_atomic_upsert_record_auth(
  p_id text,
  p_caserne text,
  p_type text,
  p_data jsonb,
  p_deleted boolean default false,
  p_updated_by text default '',
  p_expected_revision bigint default 0,
  p_expected_record_revision bigint default 0,
  p_device_id text default '',
  p_app_version text default '',
  p_action_id text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor record;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  if p_type not in ('iv','pilp') or p_id is null or p_caserne is null
     or p_data is null or left(p_id,length(p_caserne||'__'||p_type||'__'))
       <> p_caserne||'__'||p_type||'__' then
    raise exception 'AGAI_INVALID_RECORD';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or (actor.caserne_id<>p_caserne and actor.app_role<>'superadmin') then
    raise exception 'AGAI_WRITE_FORBIDDEN';
  end if;

  return public.agai_atomic_upsert_record(
    p_id,p_caserne,p_type,p_data,p_deleted,actor.login,
    p_expected_revision,p_expected_record_revision,p_device_id,p_app_version,p_action_id
  );
end;
$$;

commit;
