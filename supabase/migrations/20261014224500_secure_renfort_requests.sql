-- Circuit serveur des renforts Auth, additif et inactif cote interface.
-- Les demandes historiques de public.renforts ne sont ni copiees ni rejouees.
-- La mise en service exige encore le depart/cloture atomiques et l'interface.
begin;

create table public.agai_renfort_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null,
  source_record_id text not null,
  source_caserne text not null,
  destination_caserne text not null,
  kind text not null check (kind in ('complet','personnel')),
  note text not null default '' check (length(note) <= 1000),
  source_snapshot jsonb not null,
  status text not null default 'en-attente'
    check (status in ('en-attente','accepte','refuse','en-cours','termine','annule')),
  requested_by text not null,
  requested_at timestamptz not null default now(),
  responded_by text,
  responded_at timestamptz,
  start_key uuid,
  local_record_id text unique,
  crew jsonb,
  vehicle text,
  started_by text,
  started_at timestamptz,
  finish_key uuid,
  finished_by text,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint agai_renfort_distinct_stations check (source_caserne <> destination_caserne),
  constraint agai_renfort_request_unique unique (request_key,destination_caserne)
);

create index agai_renfort_requests_source_idx
  on public.agai_renfort_requests (source_caserne, source_record_id, requested_at desc);
create index agai_renfort_requests_destination_idx
  on public.agai_renfort_requests (destination_caserne, status, requested_at desc);

alter table public.agai_renfort_requests enable row level security;
revoke all on public.agai_renfort_requests from public, anon, authenticated;
grant select on public.agai_renfort_requests to authenticated;

create policy agai_renfort_auth_read on public.agai_renfort_requests
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1 from agai_private.current_access() access
      where access.can_login
        and (access.caserne_id in (source_caserne,destination_caserne)
             or access.app_role='superadmin')
    )
  );

-- Une seule transaction cree toutes les branches. Le client ne choisit ni
-- la caserne source ni les informations de l'intervention transmises.
create function agai_private.send_renfort(
  p_source_record_id text,
  p_destinations text[],
  p_kind text,
  p_note text,
  p_request_key uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  source_row public.records%rowtype;
  destination text;
  distinct_destinations text[];
  previous_destinations text[];
  result_ids uuid[] := array[]::uuid[];
  existing public.agai_renfort_requests%rowtype;
  snapshot jsonb;
  clean_note text := btrim(coalesce(p_note,''));
begin
  if (select auth.role()) is distinct from 'authenticated'
     or (select auth.uid()) is null then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  if p_request_key is null or p_kind not in ('complet','personnel')
     or length(clean_note)>1000 or coalesce(cardinality(p_destinations),0)=0
     or cardinality(p_destinations)>12 then
    raise exception 'AGAI_RENFORT_INVALID_REQUEST';
  end if;
  select array_agg(distinct item order by item) into distinct_destinations
    from unnest(p_destinations) item;
  if cardinality(distinct_destinations)<>cardinality(p_destinations)
     or exists(select 1 from unnest(distinct_destinations) item
               where item is null or item !~ '^(CIS[0-9]{2}|EMAJ)$') then
    raise exception 'AGAI_RENFORT_INVALID_DESTINATIONS';
  end if;
  perform pg_advisory_xact_lock(hashtext('agai-renfort-key:'||p_request_key::text));
  select array_agg(destination_caserne order by destination_caserne)
    into previous_destinations
    from public.agai_renfort_requests where request_key=p_request_key;
  if previous_destinations is not null
     and previous_destinations<>distinct_destinations then
    raise exception 'AGAI_RENFORT_KEY_REUSED';
  end if;

  select * into source_row from public.records
    where id=p_source_record_id and type='iv' and not deleted for update;
  if not found or source_row.caserne<>actor.caserne_id
     or source_row.data->>'s' not in ('selectionne','en-cours')
     or coalesce(source_row.data->>'_isRenfort','false')='true'
     or (actor.app_role not in ('superadmin','administrateur_caserne','chef_corps')
         and actor.login is distinct from source_row.data->>'agr'
         and actor.login is distinct from source_row.data->>'_agr2') then
    raise exception 'AGAI_RENFORT_SOURCE_FORBIDDEN';
  end if;
  if actor.app_role='administrateur_caserne' and source_row.caserne<>actor.caserne_id then
    raise exception 'AGAI_RENFORT_SOURCE_FORBIDDEN';
  end if;
  snapshot:=jsonb_build_object(
    'ivId',source_row.data->>'id',
    'ivNature',source_row.data->>'n',
    'ivCommune',source_row.data->>'com',
    'ivAdresse',source_row.data->>'adr',
    'ivHeure',source_row.data->>'h',
    'requerant',source_row.data->>'req',
    'telephone',source_row.data->>'tel'
  );
  foreach destination in array distinct_destinations loop
    if destination=source_row.caserne or not exists (
      select 1 from public.agai_identity_credentials credentials
      where credentials.caserne_id=destination and credentials.active
    ) then
      raise exception 'AGAI_RENFORT_DESTINATION_UNAVAILABLE';
    end if;
    insert into public.agai_renfort_requests (
      request_key,source_record_id,source_caserne,destination_caserne,
      kind,note,source_snapshot,requested_by
    ) values (
      p_request_key,p_source_record_id,source_row.caserne,destination,
      p_kind,clean_note,snapshot,actor.login
    ) on conflict (request_key,destination_caserne) do nothing
    returning id into existing.id;
    if existing.id is null then
      select * into existing from public.agai_renfort_requests
      where request_key=p_request_key and destination_caserne=destination;
      if existing.source_record_id<>p_source_record_id
         or existing.source_caserne<>source_row.caserne
         or existing.kind<>p_kind or existing.note<>clean_note
         or existing.requested_by<>actor.login then
        raise exception 'AGAI_RENFORT_KEY_REUSED';
      end if;
    end if;
    result_ids:=array_append(result_ids,existing.id);
    existing.id:=null;
  end loop;
  return jsonb_build_object('ok',true,'requestIds',to_jsonb(result_ids));
end;
$function$;

create function agai_private.answer_renfort(p_id uuid,p_answer text)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare actor record; request_row public.agai_renfort_requests%rowtype;
begin
  if (select auth.role()) is distinct from 'authenticated'
     or (select auth.uid()) is null then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or p_answer not in ('accepte','refuse') then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  select * into request_row from public.agai_renfort_requests
    where id=p_id for update;
  if not found or (actor.caserne_id<>request_row.destination_caserne
                   and actor.app_role<>'superadmin') then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  if request_row.status=p_answer then
    return jsonb_build_object('ok',true,'id',p_id,'status',p_answer);
  end if;
  if request_row.status<>'en-attente' then
    raise exception 'AGAI_RENFORT_ALREADY_PROCESSED';
  end if;
  update public.agai_renfort_requests
    set status=p_answer,responded_by=actor.login,responded_at=now(),updated_at=now()
    where id=p_id;
  return jsonb_build_object('ok',true,'id',p_id,'status',p_answer);
end;
$function$;

create function agai_private.cancel_renfort(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare actor record; request_row public.agai_renfort_requests%rowtype;
begin
  if (select auth.role()) is distinct from 'authenticated'
     or (select auth.uid()) is null then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  select * into request_row from public.agai_renfort_requests
    where id=p_id for update;
  if not found or (actor.caserne_id<>request_row.source_caserne
                   and actor.app_role<>'superadmin')
     or (actor.app_role not in ('superadmin','administrateur_caserne','chef_corps')
         and actor.login<>request_row.requested_by) then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  if request_row.status='annule' then
    return jsonb_build_object('ok',true,'id',p_id,'status','annule');
  end if;
  if request_row.status<>'en-attente' then
    raise exception 'AGAI_RENFORT_ALREADY_PROCESSED';
  end if;
  update public.agai_renfort_requests
    set status='annule',updated_at=now() where id=p_id;
  return jsonb_build_object('ok',true,'id',p_id,'status','annule');
end;
$function$;

-- Le départ crée la fiche locale et fait passer la demande En cours dans la
-- même transaction. L'ancienne intervention de la caserne source est intacte.
create function agai_private.start_renfort(
  p_id uuid,p_members text[],p_vehicle text,p_action_key uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  request_row public.agai_renfort_requests%rowtype;
  source_row public.records%rowtype;
  local_id text;
  local_data jsonb;
  crew_data jsonb;
  member_count integer;
  valid_members integer;
  started_at_local text := to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI');
  started_hour text := to_char(now() at time zone 'Europe/Paris','HH24:MI');
  clean_vehicle text := btrim(coalesce(p_vehicle,''));
begin
  if (select auth.role()) is distinct from 'authenticated'
     or (select auth.uid()) is null then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  select * into request_row from public.agai_renfort_requests
    where id=p_id for update;
  if not found or request_row.destination_caserne<>actor.caserne_id then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  if request_row.status='en-cours' and request_row.start_key=p_action_key
     and p_action_key is not null then
    return jsonb_build_object('ok',true,'id',p_id,'status','en-cours',
                              'localRecordId',request_row.local_record_id);
  end if;
  if request_row.status<>'accepte' or p_action_key is null then
    raise exception 'AGAI_RENFORT_ALREADY_PROCESSED';
  end if;
  member_count:=coalesce(cardinality(p_members),0);
  if member_count<1 or member_count>4
     or (select count(distinct m) from unnest(p_members) m)<>member_count
     or exists(select 1 from unnest(p_members) m
               where m is null or m !~ '^[a-z0-9._-]{3,80}$')
     or length(clean_vehicle)>60
     or (request_row.kind='complet' and clean_vehicle='')
     or (request_row.kind='personnel' and clean_vehicle<>'') then
    raise exception 'AGAI_RENFORT_INVALID_CREW';
  end if;
  select count(*) into valid_members
  from unnest(p_members) member
  join public.agai_identity_credentials credentials
    on credentials.login=member
   and credentials.caserne_id=request_row.destination_caserne
   and credentials.active
  left join public.agai_personnel_access personnel on personnel.login=member
  where not (
    coalesce(personnel.status,'actif') in
      ('arret','disponibilite','suspension','demission','licenciement','retraite','mutation')
    and personnel.starts_on <= (now() at time zone 'Europe/Paris')::date
    and (personnel.ends_on is null
         or (now() at time zone 'Europe/Paris')::date <= personnel.ends_on)
  );
  if valid_members<>member_count then
    raise exception 'AGAI_RENFORT_PERSONNEL_UNAVAILABLE';
  end if;
  select * into source_row from public.records
    where id=request_row.source_record_id and not deleted and type='iv'
    for update;
  if not found or source_row.caserne<>request_row.source_caserne
     or source_row.data->>'s' not in ('selectionne','en-cours') then
    raise exception 'AGAI_RENFORT_SOURCE_CLOSED';
  end if;
  select jsonb_agg(jsonb_build_object(
    'login',member,
    'role',case member_order when 1 then 'Chef d’agrès'
                         when 2 then 'Conducteur' else 'Équipier' end,
    'nom',coalesce(person.data->>'nom',''),
    'prenom',coalesce(person.data->>'prenom',''),
    'grade',coalesce(person.data->>'grade',''),
    'hDebut',started_hour
  ) order by member_order) into crew_data
  from unnest(p_members) with ordinality as members(member,member_order)
  left join public.records person
    on person.id=request_row.destination_caserne||'__user__'||members.member
   and person.type='user' and not person.deleted;

  local_id:=request_row.destination_caserne||'__iv__RENFORT_'||replace(p_id::text,'-','');
  local_data:=jsonb_build_object(
    'id','RENFORT_'||replace(p_id::text,'-',''),
    '_isRenfort',true,
    '_renfortId',p_id::text,
    '_caserneSource',request_row.source_caserne,
    '_ivSourceId',request_row.source_snapshot->>'ivId',
    'h',started_at_local,
    '_numberedAtStart',started_at_local,
    'n',request_row.source_snapshot->>'ivNature',
    'com',request_row.source_snapshot->>'ivCommune',
    'adr',request_row.source_snapshot->>'ivAdresse',
    'addr',request_row.source_snapshot->>'ivAdresse',
    'req',request_row.source_snapshot->>'requerant',
    'tel',request_row.source_snapshot->>'telephone',
    's','en-cours',
    '_statusRevision',1,
    'agr',p_members[1],
    '_hDebut',started_hour,
    '_equipage1',crew_data,
    '_personnel',to_jsonb(p_members),
    'eng',clean_vehicle,
    'op',actor.login,
    'tl',jsonb_build_array(jsonb_build_object(
      's','en-cours','h',started_at_local,'who',actor.login,
      'note','Renfort depuis '||request_row.source_caserne))
  );
  perform public.agai_atomic_upsert_record_auth(
    local_id,request_row.destination_caserne,'iv',local_data,false,
    actor.login,0,0,'','renfort-auth','renfort-start:'||p_action_key::text);
  update public.agai_renfort_requests
    set status='en-cours',start_key=p_action_key,local_record_id=local_id,
        crew=crew_data,vehicle=clean_vehicle,started_by=actor.login,
        started_at=now(),updated_at=now()
    where id=p_id;
  return jsonb_build_object('ok',true,'id',p_id,'status','en-cours',
                            'localRecordId',local_id);
end;
$function$;

create function agai_private.finish_renfort(
  p_id uuid,p_action_key uuid,p_expected_record_revision bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  request_row public.agai_renfort_requests%rowtype;
  local_row public.records%rowtype;
  current_status_revision bigint;
  current_record_revision bigint;
  finished_hour text := to_char(now() at time zone 'Europe/Paris','HH24:MI');
  finished_stamp text := to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI');
  finished_data jsonb;
begin
  if (select auth.role()) is distinct from 'authenticated'
     or (select auth.uid()) is null then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  select * into request_row from public.agai_renfort_requests
    where id=p_id for update;
  if not found or request_row.destination_caserne<>actor.caserne_id then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  if request_row.status='termine' and request_row.finish_key=p_action_key
     and p_action_key is not null then
    return jsonb_build_object('ok',true,'id',p_id,'status','termine');
  end if;
  if request_row.status<>'en-cours' or p_action_key is null then
    raise exception 'AGAI_RENFORT_ALREADY_PROCESSED';
  end if;
  select * into local_row from public.records
    where id=request_row.local_record_id and not deleted and type='iv'
    for update;
  if not found or local_row.caserne<>request_row.destination_caserne
     or local_row.data->>'_renfortId'<>p_id::text
     or local_row.data->>'s'<>'en-cours' then
    raise exception 'AGAI_RENFORT_LOCAL_RECORD_MISSING';
  end if;
  if actor.app_role not in ('superadmin','administrateur_caserne','chef_corps')
     and actor.login<>local_row.data->>'agr' then
    raise exception 'AGAI_RENFORT_CLOSE_FORBIDDEN';
  end if;
  current_status_revision:=coalesce((local_row.data->>'_statusRevision')::bigint,0);
  current_record_revision:=coalesce((local_row.data->>'_serverRevision')::bigint,0);
  if current_record_revision is distinct from p_expected_record_revision then
    raise exception 'AGAI_RENFORT_STALE_RECORD';
  end if;
  finished_data:=local_row.data || jsonb_build_object(
    's','terminee','_hFin',finished_hour,
    '_statusRevision',current_status_revision+1,
    'tl',coalesce(local_row.data->'tl','[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
        's','terminee','h',finished_stamp,'who',actor.login,
        'note','Clôture renfort'))
  );
  perform public.agai_atomic_upsert_record_auth(
    request_row.local_record_id,request_row.destination_caserne,'iv',
    finished_data,false,actor.login,current_status_revision,
    current_record_revision,'','renfort-auth','renfort-finish:'||p_action_key::text);
  update public.agai_renfort_requests
    set status='termine',finish_key=p_action_key,finished_by=actor.login,
        finished_at=now(),updated_at=now()
    where id=p_id;
  return jsonb_build_object('ok',true,'id',p_id,'status','termine');
end;
$function$;

create function public.agai_renfort_send(
  p_source_record_id text,p_destinations text[],p_kind text,p_note text,p_request_key uuid
) returns jsonb language sql security invoker set search_path = ''
as $$select agai_private.send_renfort($1,$2,$3,$4,$5)$$;
create function public.agai_renfort_answer(p_id uuid,p_answer text)
returns jsonb language sql security invoker set search_path = ''
as $$select agai_private.answer_renfort($1,$2)$$;
create function public.agai_renfort_cancel(p_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$select agai_private.cancel_renfort($1)$$;
create function public.agai_renfort_start(
  p_id uuid,p_members text[],p_vehicle text,p_action_key uuid
) returns jsonb language sql security invoker set search_path = ''
as $$select agai_private.start_renfort($1,$2,$3,$4)$$;
create function public.agai_renfort_finish(
  p_id uuid,p_action_key uuid,p_expected_record_revision bigint
) returns jsonb language sql security invoker set search_path = ''
as $$select agai_private.finish_renfort($1,$2,$3)$$;

revoke all on function agai_private.send_renfort(text,text[],text,text,uuid) from public, anon;
revoke all on function agai_private.answer_renfort(uuid,text) from public, anon;
revoke all on function agai_private.cancel_renfort(uuid) from public, anon;
revoke all on function agai_private.start_renfort(uuid,text[],text,uuid) from public, anon;
revoke all on function agai_private.finish_renfort(uuid,uuid,bigint) from public, anon;
grant execute on function agai_private.send_renfort(text,text[],text,text,uuid) to authenticated;
grant execute on function agai_private.answer_renfort(uuid,text) to authenticated;
grant execute on function agai_private.cancel_renfort(uuid) to authenticated;
grant execute on function agai_private.start_renfort(uuid,text[],text,uuid) to authenticated;
grant execute on function agai_private.finish_renfort(uuid,uuid,bigint) to authenticated;
revoke all on function public.agai_renfort_send(text,text[],text,text,uuid) from public, anon;
revoke all on function public.agai_renfort_answer(uuid,text) from public, anon;
revoke all on function public.agai_renfort_cancel(uuid) from public, anon;
revoke all on function public.agai_renfort_start(uuid,text[],text,uuid) from public, anon;
revoke all on function public.agai_renfort_finish(uuid,uuid,bigint) from public, anon;
grant execute on function public.agai_renfort_send(text,text[],text,text,uuid) to authenticated;
grant execute on function public.agai_renfort_answer(uuid,text) to authenticated;
grant execute on function public.agai_renfort_cancel(uuid) to authenticated;
grant execute on function public.agai_renfort_start(uuid,text[],text,uuid) to authenticated;
grant execute on function public.agai_renfort_finish(uuid,uuid,bigint) to authenticated;
commit;
