-- Modèle local du garde d'écriture. Pas une migration de production.
-- Une RPC peut uniquement écrire les données exactes qu'elle a calculées
-- pour cette transaction et ce compte ; une écriture ordinaire est refusée.
create table agai_private.replacement_write_permits(
  transaction_id bigint not null,
  record_id text not null,
  actor_login text not null,
  old_data jsonb,
  next_data jsonb not null,
  primary key(transaction_id,record_id)
);
revoke all on agai_private.replacement_write_permits from public;

create or replace function agai_private.permit_replacement_write(
  p_record_id text,p_old_data jsonb,p_next_data jsonb,p_actor text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or p_record_id is null or p_next_data is null
    or p_actor is distinct from (select login from agai_private.current_access())
  then raise exception 'AGAI_REPLACEMENT_PERMIT_DENIED'; end if;
  insert into agai_private.replacement_write_permits(
    transaction_id,record_id,actor_login,old_data,next_data)
  values(pg_catalog.txid_current(),p_record_id,p_actor,p_old_data,p_next_data)
  on conflict(transaction_id,record_id) do update set
    actor_login=excluded.actor_login,old_data=excluded.old_data,
    next_data=excluded.next_data;
end;
$$;
revoke all on function agai_private.permit_replacement_write(text,jsonb,jsonb,text)
  from public,anon,authenticated;

create or replace function agai_private.test_replacement_write_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_login text;
  has_permit boolean;
begin
  if tg_op='DELETE' then raise exception 'AGAI_HARD_DELETE_FORBIDDEN'; end if;
  select login into v_actor_login from agai_private.current_access();
  select exists(
    select 1 from agai_private.replacement_write_permits permit
    where permit.transaction_id=pg_catalog.txid_current()
      and permit.record_id=new.id
      and permit.actor_login=v_actor_login
      and permit.old_data is not distinct from
        case when tg_op='UPDATE' then old.data else null end
      and permit.next_data is not distinct from new.data
  ) into has_permit;
  if tg_op='UPDATE' and new.type='config' and not has_permit
    and coalesce(old.data->'piquets'->>'_replacementRevision','0')
      is distinct from coalesce(new.data->'piquets'->>'_replacementRevision','0')
  then raise exception 'AGAI_PIQUET_STALE_REPLACEMENT'; end if;
  if not has_permit and not (tg_op='UPDATE' and new.type='config'
      and pg_catalog.current_setting('agai.test_admin',true)='true')
  then raise exception 'AGAI_WRITE_FORBIDDEN'; end if;
  if tg_op='UPDATE' and (new.id is distinct from old.id
    or new.caserne is distinct from old.caserne
    or new.type is distinct from old.type)
  then raise exception 'AGAI_RECORD_IDENTITY_IMMUTABLE'; end if;
  return new;
end;
$$;

create trigger test_replacement_write_guard
before insert or update or delete on public.records
for each row execute function agai_private.test_replacement_write_guard();
