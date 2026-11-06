-- Création atomique du catalogue des casernes : la fiche n'est annoncée comme
-- créée qu'après confirmation par le serveur. Aucun utilisateur ou droit n'est
-- créé. SECURITY INVOKER conserve les politiques RLS de records.
begin;

create function public.agai_create_station(
  p_nom text, p_code text, p_couleur text, p_astreinte_phone text,
  p_adresse text, p_latitude numeric, p_longitude numeric
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  actor record;
  catalog jsonb;
  existing jsonb;
  station jsonb;
  station_id text;
  next_number integer;
  station_name text := btrim(coalesce(p_nom,''));
  station_code text := upper(btrim(coalesce(p_code,'')));
  station_address text := btrim(coalesce(p_adresse,''));
begin
  select * into actor from agai_private.current_access();
  if not found or actor.app_role <> 'superadmin'
    or not actor.can_login or not actor.can_operate then
    raise exception 'AGAI_STATION_CREATE_FORBIDDEN' using errcode='42501';
  end if;
  if length(station_name) not between 1 and 100
    or station_name ~ '[<>]'
    or station_code !~ '^[A-Z]{3}$'
    or coalesce(p_couleur,'') !~ '^#[0-9A-Fa-f]{6}$'
    or length(coalesce(p_astreinte_phone,'')) > 30
    or length(station_address) not between 1 and 255
    or station_address ~ '[<>]'
    or p_latitude is null or p_latitude < -90 or p_latitude > 90
    or p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'AGAI_STATION_CREATE_INVALID';
  end if;

  select data into catalog
  from public.records
  where id='_GLOBAL__global__main' and caserne='_GLOBAL'
    and type='global' and not deleted
  for update;
  if not found or jsonb_typeof(catalog->'CASERNES') is distinct from 'array' then
    raise exception 'AGAI_STATION_CATALOG_UNAVAILABLE';
  end if;

  select item into existing
  from jsonb_array_elements(catalog->'CASERNES') item
  where upper(item->>'code')=station_code
  limit 1;
  if found then
    if existing->>'nom'=station_name then
      return jsonb_build_object('id',existing->>'id',
        'station',existing,'alreadyExists',true);
    end if;
    raise exception 'AGAI_STATION_CODE_EXISTS';
  end if;
  if exists (
    select 1 from jsonb_array_elements(catalog->'CASERNES') item
    where lower(item->>'nom')=lower(station_name)
  ) then raise exception 'AGAI_STATION_NAME_EXISTS'; end if;

  select coalesce(max(substring(ids.id from '^CIS([0-9]+)$')::integer),0)+1
    into next_number
  from (
    select caserne as id from public.records where caserne ~ '^CIS[0-9]+$'
    union
    select item->>'id' as id
      from jsonb_array_elements(catalog->'CASERNES') item
  ) ids
  where ids.id ~ '^CIS[0-9]+$';
  station_id='CIS'||lpad(next_number::text,2,'0');
  station=jsonb_build_object('id',station_id,'nom',station_name,
    'code',station_code,'couleur',p_couleur,'email','',
    'astreintePhone',coalesce(p_astreinte_phone,''),
    'adresse',station_address,'latitude',p_latitude,'longitude',p_longitude);

  update public.records
  set data=jsonb_set(catalog,'{CASERNES}',catalog->'CASERNES'||jsonb_build_array(station)),
      updated_at=now(),updated_by=actor.login
  where id='_GLOBAL__global__main' and caserne='_GLOBAL'
    and type='global' and not deleted;
  if not found then raise exception 'AGAI_STATION_CATALOG_NOT_SAVED'; end if;
  return jsonb_build_object('id',station_id,'station',station,'alreadyExists',false);
end;
$function$;

revoke all on function public.agai_create_station(
  text,text,text,text,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.agai_create_station(
  text,text,text,text,text,numeric,numeric) to authenticated;
commit;
