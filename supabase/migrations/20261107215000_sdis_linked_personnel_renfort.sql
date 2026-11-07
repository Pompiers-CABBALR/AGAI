-- Un renfort de personnel SDIS est un second rapport, jamais un second départ.
-- Les personnes et minutes créditées sont calculées côté serveur.
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
drop trigger if exists z_agai_guard_sdis_linked_personnel_report on public.records;
create trigger z_agai_guard_sdis_linked_personnel_report
  before insert or update on public.records
  for each row execute function agai_private.guard_sdis_linked_personnel_report();

create or replace function agai_private.save_sdis_linked_personnel_report(
  p_caserne text,p_source_id text,p_members jsonb,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  source_row public.records%rowtype;
  child_row public.records%rowtype;
  source_data jsonb;
  child_data jsonb;
  members jsonb := '[]'::jsonb;
  crew jsonb := '[]'::jsonb;
  entry jsonb;
  login_name text;
  start_h text;
  end_h text;
  acquired_h text;
  operation_h text;
  acquired_min integer;
  operation_minutes integer;
  start_min integer;
  start_offset integer;
  credited integer;
  end_min integer;
  first_offset integer := 1440;
  last_offset integer := -1;
  first_h text;
  last_h text;
  child_id text := p_source_id||'-RPSDIS';
  child_key text := p_caserne||'__iv__'||p_source_id||'-RPSDIS';
  source_key text := p_caserne||'__iv__'||p_source_id;
  seen text[] := array[]::text[];
  source_revision bigint;
  child_revision bigint;
  child_status_revision bigint;
  stamp text := to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI');
  child_result jsonb;
  source_result jsonb;
begin
  if auth.uid() is null then raise exception 'AGAI_SDIS_RENFORT_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or (actor.caserne_id<>p_caserne and actor.app_role<>'superadmin')
     or p_caserne is null or p_source_id is null or p_source_id=''
     or p_expected_revision is null or p_expected_revision<0
     or p_members is null or jsonb_typeof(p_members)<>'array' then
    raise exception 'AGAI_SDIS_RENFORT_FORBIDDEN';
  end if;
  if jsonb_array_length(p_members) not between 1 and 30 then
    raise exception 'AGAI_SDIS_RENFORT_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtext('agai-record:'||source_key));
  select * into source_row from public.records where id=source_key and caserne=p_caserne
    and type='iv' and not deleted for update;
  if not found or source_row.data->>'s'<>'terminee'
     or coalesce(source_row.data->>'_sdis','false')<>'true'
     or coalesce(source_row.data->>'_isRenfort','false')='true'
     or nullif(source_row.data->>'agr','') is null
     or (actor.login not in (coalesce(source_row.data->>'agr',''),coalesce(source_row.data->>'_agr2',''))
       and actor.app_role not in ('administrateur_caserne','superadmin')) then
    raise exception 'AGAI_SDIS_RENFORT_SOURCE_INVALID';
  end if;
  source_revision:=coalesce(nullif(source_row.data->>'_serverRevision','')::bigint,0);
  if source_revision<>p_expected_revision then raise exception 'AGAI_SDIS_RENFORT_STALE_SOURCE'; end if;
  acquired_h:=source_row.data->>'_hAcquis';
  operation_h:=source_row.data->>'_hOpTerminee';
  if coalesce(acquired_h,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or coalesce(operation_h,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'AGAI_SDIS_RENFORT_HOURS_REQUIRED';
  end if;
  acquired_min:=split_part(acquired_h,':',1)::int*60+split_part(acquired_h,':',2)::int;
  operation_minutes:=((split_part(operation_h,':',1)::int*60+split_part(operation_h,':',2)::int)-acquired_min+1440)%1440;
  if operation_minutes=0 then raise exception 'AGAI_SDIS_RENFORT_HOURS_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('agai-record:'||child_key));
  select * into child_row from public.records where id=child_key for update;
  if found and (child_row.deleted or coalesce(child_row.data->>'_crValide','false')='true') then
    raise exception 'AGAI_SDIS_RENFORT_LOCKED';
  end if;
  if nullif(source_row.data->>'_sdisPersonnelRenfortId','') is not null
     and source_row.data->>'_sdisPersonnelRenfortId'<>child_id then
    raise exception 'AGAI_SDIS_RENFORT_ALREADY_LINKED';
  end if;
  for entry in select value from jsonb_array_elements(p_members) as item(value) loop
    login_name:=entry->>'login';start_h:=entry->>'hDebut';
    if coalesce(login_name,'')='' or login_name=any(seen)
       or coalesce(start_h,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or login_name=any(public.agai_record_personnel(source_row.data))
       or exists (
         select 1 from jsonb_array_elements(
           case when jsonb_typeof(source_row.data->'_renfortsInternes')='array'
             then source_row.data->'_renfortsInternes' else '[]'::jsonb end
         ) as reinforcement(value),
         lateral jsonb_array_elements(
           case when jsonb_typeof(reinforcement.value->'equipage')='array'
             then reinforcement.value->'equipage' else '[]'::jsonb end
         ) as crew_member(value)
         where crew_member.value->>'login'=login_name
       )
       or exists (
         select 1 from jsonb_array_elements(
           case when jsonb_typeof(source_row.data->'_releves')='array'
             then source_row.data->'_releves' else '[]'::jsonb end
         ) as relief(value),
         lateral jsonb_array_elements(
           case when jsonb_typeof(relief.value->'nouvelEquipage')='array'
             then relief.value->'nouvelEquipage' else '[]'::jsonb end
         ) as crew_member(value)
         where crew_member.value->>'login'=login_name
       )
       or not exists(select 1 from public.records person
          where person.id=p_caserne||'__user__'||login_name
            and person.caserne=p_caserne and person.type='user' and not person.deleted) then
      raise exception 'AGAI_SDIS_RENFORT_MEMBER_INVALID';
    end if;
    seen:=array_append(seen,login_name);
    start_min:=split_part(start_h,':',1)::int*60+split_part(start_h,':',2)::int;
    start_offset:=(start_min-acquired_min+1440)%1440;
    if start_offset>=operation_minutes then raise exception 'AGAI_SDIS_RENFORT_HOURS_INVALID'; end if;
    credited:=least(60,operation_minutes-start_offset);
    end_min:=(start_min+credited)%1440;
    end_h:=lpad((end_min/60)::text,2,'0')||':'||lpad((end_min%60)::text,2,'0');
    members:=members||jsonb_build_array(jsonb_build_object('login',login_name,
      'hDebut',start_h,'hFin',end_h,'minutes',credited,
      'dayOffset',case when start_min<acquired_min then 1 else 0 end));
    crew:=crew||jsonb_build_array(jsonb_build_object('login',login_name,'role','Renfort hors équipage'));
    if start_offset<first_offset then first_offset:=start_offset;first_h:=start_h; end if;
    if start_offset+credited>last_offset then last_offset:=start_offset+credited;last_h:=end_h; end if;
  end loop;
  source_data:=jsonb_set(source_row.data,'{_sdisPersonnelRenfortId}',to_jsonb(child_id),true);
  source_data:=jsonb_set(source_data,'{tl}',coalesce(source_data->'tl','[]'::jsonb)
    ||jsonb_build_array(jsonb_build_object('s','renfort-sdis','h',stamp,'who',actor.login,
      'note','Rapport de renfort de personnel préparé pour '||array_to_string(seen,', '))),true);
  if child_row.id is null then
    child_data:=jsonb_build_object('id',child_id,'_isRenfort',true,'_isSdisPersonnelRenfort',true,
      '_ivSourceId',p_source_id,'_numApl',coalesce(source_row.data->>'_numApl',''),
      '_numSDIS',coalesce(source_row.data->>'_numSDIS',''),
      '_numGlobal',coalesce(source_row.data->>'_numGlobal',''),
      '_numCaserne',coalesce(source_row.data->>'_numCaserne',''),
      '_numMois',coalesce(source_row.data->>'_numMois',''),
      'n',coalesce(source_row.data->>'n',''),'addr',coalesce(source_row.data->>'addr',''),
      'com',coalesce(source_row.data->>'com',''),'h',source_row.data->>'h',
      'op',actor.login,'s','terminee','agr',source_row.data->>'agr',
      'eng','','_sdis',false,'_crValide',false,
      '_crAuteur',source_row.data->>'agr',
      '_renfortPreparedBy',actor.login,'_renfortPreparedAt',now(),
      '_statusRevision',0,'tl',jsonb_build_array(jsonb_build_object('s','terminee',
        'h',stamp,'who',actor.login,'note','Rapport de renfort lié à '||p_source_id)));
    child_revision:=0;child_status_revision:=0;
  else
    child_data:=child_row.data;
    child_revision:=coalesce(nullif(child_data->>'_serverRevision','')::bigint,0);
    child_status_revision:=coalesce(nullif(child_data->>'_statusRevision','')::bigint,0);
  end if;
  child_data:=child_data||jsonb_build_object('_equipage1',crew,
    '_sdisPersonnelRenfortMembers',members,'_hDebut',first_h,'_hFin',last_h,
    '_renfortLastPreparedBy',actor.login,'_renfortLastPreparedAt',now());
  perform set_config('agai.sdis_renfort_rpc','1',true);
  source_result:=public.agai_atomic_upsert_record(source_key,p_caserne,'iv',source_data,false,
    actor.login,coalesce(nullif(source_row.data->>'_statusRevision','')::bigint,0),source_revision,
    '','V202611_0022','sdis-renfort-link');
  child_result:=public.agai_atomic_upsert_record(child_key,p_caserne,'iv',child_data,false,
    actor.login,child_status_revision,child_revision,'','V202611_0022','sdis-renfort-report');
  -- Le déclencheur de validation peut enrichir la ligne pendant l'UPSERT.
  -- La réponse doit contenir la copie effectivement persistée, pas p_data.
  select data into source_data from public.records where id=source_key;
  select data into child_data from public.records where id=child_key;
  return jsonb_build_object('ok',true,'source',source_data,'report',child_data);
end;
$function$;
revoke execute on function agai_private.save_sdis_linked_personnel_report(text,text,jsonb,bigint)
  from public,anon,authenticated;
create or replace function public.agai_save_sdis_linked_personnel_report(
  p_caserne text,p_source_id text,p_members jsonb,p_expected_revision bigint
) returns jsonb language sql security definer set search_path = ''
as $function$
  select agai_private.save_sdis_linked_personnel_report($1,$2,$3,$4);
$function$;
revoke execute on function public.agai_save_sdis_linked_personnel_report(text,text,jsonb,bigint)
  from public,anon,authenticated;
grant execute on function public.agai_save_sdis_linked_personnel_report(text,text,jsonb,bigint)
  to authenticated;

create or replace function agai_private.finalize_sdis_linked_personnel_report(
  p_caserne text,p_report_id text,p_text text,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  report_row public.records%rowtype;
  source_row public.records%rowtype;
  report_data jsonb;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'AGAI_SDIS_RENFORT_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or (actor.caserne_id<>p_caserne and actor.app_role<>'superadmin')
     or p_report_id is null or p_report_id not like '%-RPSDIS'
     or p_expected_revision is null or p_expected_revision<0
     or length(btrim(coalesce(p_text,''))) not between 1 and 30000 then
    raise exception 'AGAI_SDIS_RENFORT_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtext('agai-record:'||p_caserne||'__iv__'||p_report_id));
  select * into report_row from public.records
    where id=p_caserne||'__iv__'||p_report_id and caserne=p_caserne
      and type='iv' and not deleted for update;
  if not found or coalesce(report_row.data->>'_isSdisPersonnelRenfort','false')<>'true'
     or coalesce(report_row.data->>'_crValide','false')='true'
     or (actor.login<>report_row.data->>'agr'
       and actor.app_role not in ('administrateur_caserne','superadmin')) then
    raise exception 'AGAI_SDIS_RENFORT_FORBIDDEN';
  end if;
  select * into source_row from public.records
    where id=p_caserne||'__iv__'||(report_row.data->>'_ivSourceId')
      and caserne=p_caserne and type='iv' and not deleted;
  if not found or coalesce(source_row.data->>'_crValide','false')<>'true' then
    raise exception 'AGAI_SDIS_RENFORT_MAIN_REPORT_REQUIRED';
  end if;
  if coalesce(nullif(report_row.data->>'_serverRevision','')::bigint,0)<>p_expected_revision then
    raise exception 'AGAI_SDIS_RENFORT_STALE_REPORT';
  end if;
  report_data:=report_row.data||jsonb_build_object(
    '_crTexte',btrim(p_text),'_compteRendu',btrim(p_text),'_crValide',true,
    '_crAuteur',report_row.data->>'agr',
    '_crClientValideAt',now(),'_crDate',to_char(now() at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI'));
  if actor.login<>report_row.data->>'agr' then
    report_data:=report_data||jsonb_build_object(
      '_crDernierEditeur',actor.login,
      '_crDerniereModification',to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI'));
  end if;
  result:=public.agai_atomic_upsert_record(report_row.id,p_caserne,'iv',report_data,false,
    actor.login,coalesce(nullif(report_row.data->>'_statusRevision','')::bigint,0),
    p_expected_revision,'','V202611_0022','sdis-renfort-finalize');
  select data into report_data from public.records where id=report_row.id;
  return jsonb_build_object('ok',true,'report',report_data);
end;
$function$;
revoke execute on function agai_private.finalize_sdis_linked_personnel_report(text,text,text,bigint)
  from public,anon,authenticated;
create or replace function public.agai_finalize_sdis_linked_personnel_report(
  p_caserne text,p_report_id text,p_text text,p_expected_revision bigint
) returns jsonb language sql security definer set search_path = ''
as $function$
  select agai_private.finalize_sdis_linked_personnel_report($1,$2,$3,$4);
$function$;
revoke execute on function public.agai_finalize_sdis_linked_personnel_report(text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.agai_finalize_sdis_linked_personnel_report(text,text,text,bigint)
  to authenticated;
commit;
