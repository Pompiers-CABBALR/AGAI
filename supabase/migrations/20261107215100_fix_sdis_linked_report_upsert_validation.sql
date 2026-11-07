-- An existing linked report is written through INSERT ... ON CONFLICT UPDATE.
-- BEFORE INSERT fires before the conflict is resolved. Let that preliminary
-- pass continue only for an existing record; BEFORE UPDATE still enforces
-- the full identity, immutability and finalization checks.
begin;

create or replace function agai_private.guard_sdis_linked_personnel_report()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  source_row public.records%rowtype;
  actor record;
  source_id text;
  is_child boolean;
  rpc_edit boolean := current_setting('agai.sdis_renfort_rpc',true)='1';
  protected_key text;
begin
  is_child:=coalesce(new.data->>'_isSdisPersonnelRenfort','false')='true';
  if new.type<>'iv' or coalesce(new.deleted,false) then
    if tg_op='UPDATE' and old.type='iv'
       and (coalesce(old.data->>'_isSdisPersonnelRenfort','false')='true'
         or nullif(old.data->>'_sdisPersonnelRenfortId','') is not null) then
      raise exception 'AGAI_SDIS_RENFORT_LOCKED';
    end if;
    return new;
  end if;
  if tg_op='UPDATE' and coalesce(old.data->>'_isSdisPersonnelRenfort','false')='true'
     and not is_child then raise exception 'AGAI_SDIS_RENFORT_LOCKED'; end if;
  if not is_child then
    if tg_op='UPDATE' and nullif(old.data->>'_sdisPersonnelRenfortId','') is not null then
      new.data:=jsonb_set(new.data,'{_sdisPersonnelRenfortId}',old.data->'_sdisPersonnelRenfortId',true);
      foreach protected_key in array array['_hAcquis','_hOpTerminee','_hDebut','_hFin',
        'agr','_agr2','_equipage1','_equipage2','_sdis','h','_numSDIS','_numApl',
        '_numGlobal','_numCaserne','_numMois','n','addr','com','s'] loop
        if old.data->protected_key is distinct from new.data->protected_key then
          raise exception 'AGAI_SDIS_RENFORT_SOURCE_LOCKED';
        end if;
      end loop;
    elsif not rpc_edit and nullif(new.data->>'_sdisPersonnelRenfortId','') is not null then
      raise exception 'AGAI_SDIS_RENFORT_LINK_FORBIDDEN';
    end if;
    return new;
  end if;
  if auth.uid() is null then raise exception 'AGAI_SDIS_RENFORT_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  source_id:=new.data->>'_ivSourceId';
  if not found or not coalesce(actor.can_operate,false)
     or (actor.caserne_id<>new.caserne and actor.app_role<>'superadmin')
     or (actor.login<>new.data->>'agr' and actor.app_role not in ('administrateur_caserne','superadmin'))
     or new.id<>new.caserne||'__iv__'||(new.data->>'id')
     or new.data->>'id' is distinct from source_id||'-RPSDIS'
     or coalesce(new.data->>'_isRenfort','false')<>'true'
     or new.data->>'s'<>'terminee' or coalesce(new.data->>'_sdis','false')='true'
     or coalesce(new.data->>'eng','')<>'' then
    raise exception 'AGAI_SDIS_RENFORT_FORBIDDEN';
  end if;
  select * into source_row from public.records
   where id=new.caserne||'__iv__'||source_id and type='iv' and not deleted;
  if not found or coalesce(source_row.data->>'_sdis','false')<>'true'
     or source_row.data->>'s'<>'terminee'
     or source_row.data->>'agr' is distinct from new.data->>'agr'
     or source_row.data->>'_sdisPersonnelRenfortId' is distinct from new.data->>'id' then
    raise exception 'AGAI_SDIS_RENFORT_SOURCE_INVALID';
  end if;
  if tg_op='INSERT' and exists(select 1 from public.records existing
      where existing.id=new.id and existing.caserne=new.caserne
        and existing.type='iv' and not existing.deleted
        and coalesce(existing.data->>'_isSdisPersonnelRenfort','false')='true') then
    return new;
  end if;
  if tg_op='INSERT' and not rpc_edit then raise exception 'AGAI_SDIS_RENFORT_CREATE_RPC_REQUIRED'; end if;
  if tg_op='INSERT' and coalesce(new.data->>'_crValide','false')='true' then
    raise exception 'AGAI_SDIS_RENFORT_REVIEW_REQUIRED';
  end if;
  if tg_op='UPDATE' then
    if coalesce(old.data->>'_crValide','false')='true'
       or old.caserne<>new.caserne or old.type<>new.type then
      raise exception 'AGAI_SDIS_RENFORT_LOCKED';
    end if;
    foreach protected_key in array array['_isSdisPersonnelRenfort','_isRenfort','_ivSourceId',
      '_sdisPersonnelRenfortMembers','_equipage1','agr','_hDebut','_hFin','h','_numApl',
      '_numSDIS','_numGlobal','_numCaserne','_numMois','s','eng','_sdis','op',
      '_crAuteur','_renfortPreparedBy','_renfortPreparedAt'] loop
      if old.data->protected_key is distinct from new.data->protected_key and not rpc_edit then
        raise exception 'AGAI_SDIS_RENFORT_LOCKED';
      end if;
    end loop;
  end if;
  if coalesce(new.data->>'_crValide','false')='true'
     and coalesce(source_row.data->>'_crValide','false')<>'true' then
    raise exception 'AGAI_SDIS_RENFORT_MAIN_REPORT_REQUIRED';
  end if;
  return new;
end;
$function$;

revoke execute on function agai_private.guard_sdis_linked_personnel_report()
  from public,anon,authenticated;
commit;
