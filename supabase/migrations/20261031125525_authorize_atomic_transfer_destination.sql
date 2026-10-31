-- A validated transfer must be allowed to create its destination intervention.
-- The private transfer event is inserted first in the same transaction; it is
-- not visible to other transactions and disappears if either write fails.
-- Ordinary cross-station writes remain denied.
begin;

create or replace function agai_private.can_write_record(
  p_id text, p_caserne text, p_type text, p_data jsonb
) returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
declare
  actor record;
begin
  select * into actor from agai_private.current_access();
  if not found or p_id is null or p_caserne is null or p_type is null
    or p_data is null or coalesce(actor.can_login,false)=false
    or left(p_id,length(p_caserne||'__'||p_type||'__'))
       <> p_caserne||'__'||p_type||'__'
  then return false; end if;

  if p_type='login' then
    return p_data->>'login'=actor.login
      and (p_caserne=actor.caserne_id
        or p_caserne='_GLOBAL' and actor.app_role in ('superadmin','chef_corps'));
  end if;

  if coalesce(actor.can_operate,false)=false then return false; end if;
  if p_type='user' and p_data ?| array['p','password_hash','passwordHash'] then
    return false;
  end if;
  if p_type='global' then
    if actor.app_role<>'superadmin' or p_caserne<>'_GLOBAL'
      or jsonb_typeof(p_data->'GLOBAL_ACCOUNTS')<>'array'
      or exists (
        select 1 from jsonb_array_elements(p_data->'GLOBAL_ACCOUNTS') account
        where account ?| array['p','password_hash','passwordHash']
      )
    then return false; end if;
    return true;
  end if;

  if actor.app_role='superadmin' then return true; end if;
  if p_caserne<>actor.caserne_id then
    -- Only the first INSERT of a destination intervention prepared by the
    -- private transfer RPC may cross the station boundary. A later UPDATE
    -- cannot reuse the committed event because the record already exists.
    if p_type='iv'
       and not exists (select 1 from public.records existing where existing.id=p_id)
       and exists (
         select 1 from agai_private.transfer_events event
         where event.destination_record_id=p_id
           and event.destination_caserne=p_caserne
           and event.source_caserne=actor.caserne_id
           and event.source_caserne=p_data->>'_transfertDe'
           and event.actor_login=actor.login
           and event.actor_login=p_data->>'op'
           and event.source_record_id=p_data->>'_transfertSourceRecordId'
           and event.apl=p_data->>'_numApl'
           and event.reason=p_data->>'_transfertMotif'
           and event.action_key::text=p_data->>'_aplReservationKey'
           and p_data->>'s'='en-attente'
       )
    then return true; end if;
    return false;
  end if;

  if p_type='dispoRequest' then
    if p_id<>p_caserne||'__dispoRequest__'||coalesce(p_data->>'id','')
       or coalesce(p_data->>'caserneId','')<>p_caserne
       or coalesce(p_data->>'wk','') !~ '^[0-9]{8}$'
       or coalesce(p_data->>'login','')=''
       or coalesce(jsonb_typeof(p_data->'slots'),'')<>'array'
       or not exists (
         select 1 from public.records personnel
         where personnel.id=p_caserne||'__user__'||(p_data->>'login')
           and personnel.caserne=p_caserne and personnel.type='user'
           and not personnel.deleted
       )
    then return false; end if;
    if p_data->>'login'=actor.login then
      return p_data->>'statut' in ('en-attente','annulee')
        and nullif(p_data->>'reponduPar','') is null;
    end if;
    if actor.app_role='administrateur_caserne' then
      return p_data->>'statut' in ('en-attente','accepte','refuse','annulee');
    end if;
    return p_data->>'statut' in ('en-attente','accepte','refuse','annulee')
      and exists (
        select 1 from public.records team
        where team.caserne=p_caserne and team.type='equipe' and not team.deleted
          and team.data->>'resp'=actor.login
      );
  end if;

  if p_type='dispo' then
    if p_data->>'login'=actor.login
       or actor.app_role='administrateur_caserne' then return true; end if;
    return p_id=p_caserne||'__dispo__'||(p_data->>'wk')||'__'||(p_data->>'login')
      and exists (
        select 1 from public.records team
        where team.caserne=p_caserne and team.type='equipe' and not team.deleted
          and team.data->>'resp'=actor.login
      )
      and exists (
        select 1 from public.records personnel
        where personnel.id=p_caserne||'__user__'||(p_data->>'login')
          and personnel.caserne=p_caserne and personnel.type='user'
          and not personnel.deleted
      );
  end if;
  if p_type in ('iv','pilp','activite','renfort') then return true; end if;
  if p_type in ('fmpa','formStag','formForm') then
    return actor.app_role in ('administrateur_caserne','responsable_formation');
  end if;
  if p_type in ('user','config','equipe','astrTelDuty') then
    return actor.app_role='administrateur_caserne'
      and (p_type<>'user' or coalesce(p_data->>'appRole','agent')
           not in ('superadmin','chef_corps'));
  end if;
  return false;
end;
$function$;

create or replace function agai_private.transfer_intervention(
  p_source_record_id text,
  p_destination_caserne text,
  p_reason text,
  p_action_key uuid,
  p_expected_record_revision bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  settings agai_private.transfer_settings%rowtype;
  source_row public.records%rowtype;
  person_row public.records%rowtype;
  previous agai_private.transfer_events%rowtype;
  clean_reason text := btrim(coalesce(p_reason,''));
  source_revision bigint;
  source_status_revision bigint;
  assigned jsonb;
  apl text;
  destination_id text;
  destination_record_id text;
  transfer_stamp text := to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI');
  source_data jsonb;
  destination_data jsonb;
begin
  if (select auth.role()) is distinct from 'authenticated'
     or (select auth.uid()) is null then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_TRANSFER_ACCESS_DENIED';
  end if;
  select * into settings from agai_private.transfer_settings where id=true;
  if not found or not settings.enabled
     and (settings.pilot_login is null or settings.pilot_login<>actor.login) then
    raise exception 'AGAI_TRANSFER_NOT_ENABLED';
  end if;
  if p_source_record_id is null or p_action_key is null
     or p_destination_caserne is null
     or p_destination_caserne !~ '^(CIS[0-9]{2}|EMAJ)$'
     or p_expected_record_revision is null
     or length(clean_reason)<5 or length(clean_reason)>1000 then
    raise exception 'AGAI_TRANSFER_INVALID_REQUEST';
  end if;
  perform pg_advisory_xact_lock(hashtext('agai-record:'||p_source_record_id));
  select * into previous from agai_private.transfer_events
    where action_key=p_action_key or source_record_id=p_source_record_id;
  if found then
    if previous.action_key<>p_action_key
       or previous.source_record_id<>p_source_record_id
       or previous.destination_caserne<>p_destination_caserne
       or previous.actor_login<>actor.login
       or previous.reason<>clean_reason then
      raise exception 'AGAI_TRANSFER_ALREADY_PROCESSED';
    end if;
    return jsonb_build_object('ok',true,'apl',previous.apl,
      'sourceRecordId',previous.source_record_id,
      'destinationRecordId',previous.destination_record_id);
  end if;

  select * into source_row from public.records
    where id=p_source_record_id and type='iv' and not deleted for update;
  if not found or source_row.caserne=p_destination_caserne
     or source_row.data->>'s' is distinct from 'en-attente'
     or coalesce(source_row.data->>'_isRenfort','false')='true'
     or coalesce(source_row.data->>'_isRenfortInterneMission','false')='true'
     or (source_row.caserne<>actor.caserne_id
       and actor.app_role<>'superadmin') then
    raise exception 'AGAI_TRANSFER_SOURCE_FORBIDDEN';
  end if;
  if actor.app_role not in ('superadmin','administrateur_caserne','chef_corps') then
    select * into person_row from public.records
      where id=source_row.caserne||'__user__'||actor.login
        and type='user' and not deleted;
    if not found or not (
      person_row.data->>'grade' = any (array[
        'Caporal-chef','Sergent','Sergent-chef','Adjudant',
        'Adjudant-chef','Lieutenant','Capitaine','Commandant',
        'Lieutenant-colonel','Colonel'])
      or (person_row.data->'rights') ? 'Chef d''agrès'
    ) then
      raise exception 'AGAI_TRANSFER_ROLE_FORBIDDEN';
    end if;
  end if;
  if not exists (
    select 1 from public.agai_identity_credentials identity_row
    where identity_row.caserne_id=p_destination_caserne
      and identity_row.active
  ) then
    raise exception 'AGAI_TRANSFER_DESTINATION_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.agai_renfort_requests request_row
    where request_row.source_record_id=p_source_record_id
      and request_row.status in ('en-attente','accepte','en-cours')
  ) then
    raise exception 'AGAI_TRANSFER_ACTIVE_REINFORCEMENT';
  end if;
  source_revision:=coalesce(nullif(source_row.data->>'_serverRevision','')::bigint,0);
  source_status_revision:=coalesce(nullif(source_row.data->>'_statusRevision','')::bigint,0);
  if source_revision<>p_expected_record_revision then
    raise exception 'AGAI_TRANSFER_STALE_SOURCE';
  end if;

  assigned:=agai_private.reserve_apl(p_action_key,'transfert');
  apl:=assigned->>'apl';
  destination_id:=apl||'-R'||replace(gen_random_uuid()::text,'-','');
  destination_record_id:=p_destination_caserne||'__iv__'||destination_id;
  destination_data:=jsonb_build_object(
    'id',destination_id,'_numApl',apl,'_aplReservationKey',p_action_key::text,
    'n',source_row.data->>'n',
    '_natureAppelInitiale',source_row.data->>'_natureAppelInitiale',
    'addr',source_row.data->>'addr',
    '_addrBase',source_row.data->>'_addrBase',
    '_addressCoordinates',source_row.data->'_addressCoordinates',
    '_gpsCoordinates',source_row.data->'_gpsCoordinates',
    'com',source_row.data->>'com',
    'req',source_row.data->>'req',
    'tel',source_row.data->>'tel',
    'tels',coalesce(source_row.data->'tels','[]'::jsonb),
    '_additionalRequesters',coalesce(source_row.data->'_additionalRequesters','[]'::jsonb),
    'reqDispo',source_row.data->'reqDispo',
    '_nidsAppel',coalesce(source_row.data->'_nidsAppel','[]'::jsonb),
    '_animauxAppel',coalesce(source_row.data->'_animauxAppel','[]'::jsonb),
    '_appelDetails',source_row.data->'_appelDetails',
    '_erp',coalesce(source_row.data->'_erp','false'::jsonb),
    '_urgence',coalesce(source_row.data->'_urgence','false'::jsonb),
    '_sdis',coalesce(source_row.data->'_sdis','false'::jsonb),
    'det',source_row.data->>'det',
    'h',transfer_stamp,'op',actor.login,'s','en-attente',
    'agr',null,'eng',null,'avisIds','[]'::jsonb,'rappels',0,
    '_transfertDe',source_row.caserne,'_origId',source_row.data->>'id',
    '_transfertSourceRecordId',p_source_record_id,
    '_transfertMotif',clean_reason,
    'tl',jsonb_build_array(jsonb_build_object('s','en-attente',
      'h',transfer_stamp,'who',actor.login,
      'note','Transfert depuis '||source_row.caserne||' : '||clean_reason))
  );

  -- This private event is the one-time authorization for the destination
  -- INSERT. The transaction rolls it back if either record write fails.
  insert into agai_private.transfer_events (
    action_key,source_record_id,destination_record_id,source_caserne,
    destination_caserne,actor_login,reason,apl
  ) values (
    p_action_key,p_source_record_id,destination_record_id,source_row.caserne,
    p_destination_caserne,actor.login,clean_reason,apl
  );
  perform public.agai_atomic_upsert_record(
    destination_record_id,p_destination_caserne,'iv',destination_data,false,
    actor.login,0,0,'','transfer-auth','transfer-create:'||p_action_key::text);

  source_data:=source_row.data || jsonb_build_object(
    's','annulee','_transfertVers',p_destination_caserne,
    '_transfertDestId',destination_id,
    '_transfertDestRecordId',destination_record_id,
    '_statusRevision',source_status_revision+1,
    'tl',coalesce(source_row.data->'tl','[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object('s','annulee',
        'h',transfer_stamp,'who',actor.login,
        'note','Transférée vers '||p_destination_caserne||' : '||clean_reason))
  );
  perform public.agai_atomic_upsert_record(
    p_source_record_id,source_row.caserne,'iv',source_data,false,
    actor.login,source_status_revision,source_revision,'','transfer-auth',
    'transfer-close:'||p_action_key::text);
  return jsonb_build_object('ok',true,'apl',apl,
    'sourceRecordId',p_source_record_id,
    'destinationRecordId',destination_record_id);
end;
$function$;

revoke execute on function agai_private.transfer_intervention(
  text,text,text,uuid,bigint) from public,anon,authenticated;

commit;
