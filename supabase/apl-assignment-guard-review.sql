-- Etape finale, a appliquer uniquement apres publication et verification de
-- tous les createurs d'APL : bloque les anciennes versions qui calculent un
-- numero sur le telephone. Non applique par ce fichier de preparation.
begin;

create or replace function agai_private.guard_new_apl_assignment()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  apl text;
  apl_year integer;
  apl_number bigint;
  reservation agai_private.apl_reservations%rowtype;
  linked_id text;
begin
  apl:=new.data->>'_numApl';
  if new.type not in ('iv','pilp') or new.deleted
     or coalesce(new.data->>'_isRenfort','false')='true' then
    return new;
  end if;
  if tg_op='UPDATE' and old.data->>'_numApl' is not distinct from apl then
    return new;
  end if;
  if apl is null or apl !~ '^APL_[0-9]{4}_[0-9]+$' then
    raise exception 'AGAI_APL_RESERVATION_REQUIRED';
  end if;

  -- Un dossier PILP lie peut reprendre l'APL de son appel source ; il ne
  -- consomme pas un second numero. Le lien est controle sur la fiche serveur.
  if new.type='pilp' and coalesce(new.data->>'ivRef','')<>'' then
    linked_id:=new.caserne||'__iv__'||(new.data->>'ivRef');
  elsif new.type='iv' and coalesce(new.data->>'_lienPilpSourceId','')<>'' then
    linked_id:=new.caserne||'__pilp__'||(new.data->>'_lienPilpSourceId');
  else
    linked_id:=null;
  end if;
  if linked_id is not null and exists (
    select 1 from public.records source_row
    where source_row.id=linked_id and not source_row.deleted
      and source_row.data->>'_numApl'=apl
  ) then return new; end if;

  apl_year:=substring(apl from '^APL_([0-9]{4})_')::integer;
  apl_number:=substring(apl from '^APL_[0-9]{4}_([0-9]+)$')::bigint;
  perform pg_advisory_xact_lock(hashtext('agai-apl:'||apl_year::text));
  if coalesce(new.data->>'_aplReservationKey','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'AGAI_APL_RESERVATION_REQUIRED';
  end if;
  select * into reservation from agai_private.apl_reservations
    where action_key=(new.data->>'_aplReservationKey')::uuid;
  if not found or reservation.year<>apl_year or reservation.number<>apl_number
     or reservation.auth_user_id is distinct from (select auth.uid())
     or (reservation.caserne<>new.caserne and reservation.purpose<>'transfert') then
    raise exception 'AGAI_APL_RESERVATION_INVALID';
  end if;
  if exists (
    select 1 from public.records existing
    where existing.id<>new.id and not existing.deleted
      and existing.type in ('iv','pilp')
      and existing.data->>'_numApl'=apl
      and coalesce(existing.data->>'ivRef','')=''
      and coalesce(existing.data->>'_lienPilpSourceId','')=''
  ) then
    raise exception 'AGAI_APL_ALREADY_USED';
  end if;
  return new;
end;
$function$;
revoke execute on function agai_private.guard_new_apl_assignment()
  from public,anon,authenticated;

drop trigger if exists agai_guard_new_apl_assignment on public.records;
create trigger agai_guard_new_apl_assignment
  before insert or update of data,deleted on public.records
  for each row execute function agai_private.guard_new_apl_assignment();

commit;
