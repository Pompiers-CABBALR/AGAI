-- Pilote additif : les clients historiques anon restent inchangés.
-- Cette étape prépare les écritures Auth sans ouvrir encore la bascule.
begin;

do $$
begin
  if to_regclass('public.records') is null
    or to_regprocedure('agai_private.current_access()') is null
    or to_regprocedure('agai_private.can_write_record(text,text,text,jsonb)') is null
    or exists (select 1 from pg_trigger where tgrelid='public.records'::regclass
      and tgname='agai_stamp_record_writer' and not tgisinternal)
    or exists (select 1 from pg_policies where schemaname='public'
      and tablename='records' and policyname in
        ('agai_records_auth_insert','agai_records_auth_update'))
  then raise exception 'AGAI_AUTH_WRITE_PILOT_PRECONDITION_FAILED'; end if;
end;
$$;

create function agai_private.stamp_record_writer()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  actor_login text;
  jwt_role text := current_setting('request.jwt.claim.role',true);
begin
  -- Les anciens clients restent opérationnels pendant l'essai.
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

revoke execute on function agai_private.stamp_record_writer() from public, anon;
create trigger agai_stamp_record_writer
before insert or update or delete on public.records
for each row execute function agai_private.stamp_record_writer();

create policy agai_records_auth_insert on public.records
for insert to authenticated
with check (agai_private.can_write_record(id,caserne,type,data));

create policy agai_records_auth_update on public.records
for update to authenticated
using (agai_private.can_write_record(id,caserne,type,data))
with check (agai_private.can_write_record(id,caserne,type,data));

commit;
