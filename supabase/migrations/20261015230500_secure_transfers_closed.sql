-- Le commutateur serveur reste ferme : la creation de cette fonction ne
-- suffit pas a ouvrir les transferts, meme avec un ancien lien d'essai.
begin;

create table if not exists agai_private.transfer_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  pilot_login text,
  updated_at timestamptz not null default now()
);
alter table agai_private.transfer_settings enable row level security;
revoke all on agai_private.transfer_settings from public,anon,authenticated;
insert into agai_private.transfer_settings (id,enabled,pilot_login)
values (true,false,null) on conflict (id) do nothing;

create table if not exists agai_private.transfer_events (
  action_key uuid primary key,
  source_record_id text not null unique,
  destination_record_id text not null unique,
  source_caserne text not null,
  destination_caserne text not null,
  actor_login text not null,
  reason text not null,
  apl text not null,
  created_at timestamptz not null default now()
);
alter table agai_private.transfer_events enable row level security;
revoke all on agai_private.transfer_events from public, anon, authenticated;

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

  -- Numero, nouvelle fiche et annulation de la source : une transaction.
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
  insert into agai_private.transfer_events (
    action_key,source_record_id,destination_record_id,source_caserne,
    destination_caserne,actor_login,reason,apl
  ) values (
    p_action_key,p_source_record_id,destination_record_id,source_row.caserne,
    p_destination_caserne,actor.login,clean_reason,apl
  );
  return jsonb_build_object('ok',true,'apl',apl,
    'sourceRecordId',p_source_record_id,
    'destinationRecordId',destination_record_id);
end;
$function$;
revoke execute on function agai_private.transfer_intervention(
  text,text,text,uuid,bigint) from public,anon,authenticated;

create or replace function public.agai_transfer_intervention(
  p_source_record_id text,
  p_destination_caserne text,
  p_reason text,
  p_action_key uuid,
  p_expected_record_revision bigint
) returns jsonb
language sql security definer set search_path = ''
as $function$
  select agai_private.transfer_intervention($1,$2,$3,$4,$5);
$function$;
revoke execute on function public.agai_transfer_intervention(
  text,text,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.agai_transfer_intervention(
  text,text,text,uuid,bigint) to authenticated;

commit;
