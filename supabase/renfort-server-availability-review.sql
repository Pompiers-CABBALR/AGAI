-- Appliqué en production le 15 octobre 2026, droits des RPC toujours fermés.
-- Renforts : le serveur confirme la disponibilité au moment du départ.
-- Le verrou par caserne sérialise deux départs de renfort concurrents.
-- Ce fichier n'accorde aucun droit d'exécution aux utilisateurs.
begin;

create or replace function agai_private.renfort_active_member_logins(p_data jsonb)
returns text[]
language sql immutable security invoker set search_path = ''
as $function$
with
data_row as (select coalesce(p_data,'{}'::jsonb) as d),
releves as (
  select item.value as r,item.ordinality as n
  from data_row,
    jsonb_array_elements(case when jsonb_typeof(d->'_releves')='array'
      then d->'_releves' else '[]'::jsonb end) with ordinality as item
),
latest_main as (
  select r->'nouvelEquipage' as crew
  from releves
  where coalesce(r->>'isRenfort','false')<>'true'
    and coalesce(r->>'isRenfortInterne','false')<>'true'
    and jsonb_typeof(r->'nouvelEquipage')='array'
    and jsonb_array_length(r->'nouvelEquipage')>0
  order by n desc limit 1
),
crews as (
  select d,
    coalesce((select crew from latest_main),
      case when jsonb_typeof(d->'_equipage1')='array'
        then d->'_equipage1' else '[]'::jsonb end) as main,
    case when jsonb_typeof(d->'_equipage2')='array'
      then d->'_equipage2' else '[]'::jsonb end as second
  from data_row
),
members as (
  select member->>'login' as login
    from crews,jsonb_array_elements(main) member
  union all
  select member->>'login'
    from crews,jsonb_array_elements(second) member
  union all
  select d->>'agr' from crews where jsonb_array_length(main)=0
  union all
  select d->>'_agr2' from crews where jsonb_array_length(second)=0
  union all
  select member
    from crews,jsonb_array_elements_text(
      case when jsonb_typeof(d->'_personnel')='array'
        then d->'_personnel' else '[]'::jsonb end) member
    where d->>'_isRenfort'='true'
  union all
  select member->>'login'
    from data_row,
      jsonb_array_elements(case when jsonb_typeof(d->'_renfortsInternes')='array'
        then d->'_renfortsInternes' else '[]'::jsonb end) internal,
      jsonb_array_elements(case when jsonb_typeof(internal->'equipage')='array'
        then internal->'equipage' else '[]'::jsonb end) member
    where coalesce(internal->>'missionLiee','false')<>'true'
  union all
  select member->>'login'
    from releves,
      jsonb_array_elements(case when jsonb_typeof(r->'nouvelEquipage')='array'
        then r->'nouvelEquipage' else '[]'::jsonb end) member
    where (coalesce(r->>'isRenfort','false')='true'
           and coalesce(r->>'isRenfortInterne','false')<>'true')
       or (coalesce(r->>'isRenfortInterne','false')='true'
           and coalesce(r->>'_migratedInternal','false')<>'true'
           and member->>'renfortInterne'='true')
)
select coalesce(array_agg(distinct login order by login),'{}'::text[])
from members where login is not null and login<>'';
$function$;

create or replace function agai_private.renfort_active_vehicle_names(p_data jsonb)
returns text[]
language sql immutable security invoker set search_path = ''
as $function$
with
data_row as (select coalesce(p_data,'{}'::jsonb) as d),
names as (
  select d->>'eng' as name from data_row
  union all select d->>'_engin1' from data_row
  union all select d->>'_engin2' from data_row
  union all
  select internal->>'engin'
  from data_row,
    jsonb_array_elements(case when jsonb_typeof(d->'_renfortsInternes')='array'
      then d->'_renfortsInternes' else '[]'::jsonb end) internal
  where coalesce(internal->>'missionLiee','false')<>'true'
  union all
  select coalesce(releve->>'enginRenfort',releve->>'engin')
  from data_row,
    jsonb_array_elements(case when jsonb_typeof(d->'_releves')='array'
      then d->'_releves' else '[]'::jsonb end) releve
  where coalesce(releve->>'isRenfort','false')='true'
     or (coalesce(releve->>'isRenfortInterne','false')='true'
         and coalesce(releve->>'_migratedInternal','false')<>'true')
)
select coalesce(array_agg(distinct lower(btrim(name)) order by lower(btrim(name))),'{}'::text[])
from names where btrim(coalesce(name,''))<>'';
$function$;

revoke execute on function agai_private.renfort_active_member_logins(jsonb)
  from public,anon,authenticated;
revoke execute on function agai_private.renfort_active_vehicle_names(jsonb)
  from public,anon,authenticated;

do $migration$
declare
  definition text;
  anchor text := $part$  select jsonb_agg(jsonb_build_object($part$;
  addition text := $part$  -- Un seul départ de renfort à la fois par caserne, puis contrôle
  -- des ressources sur les fiches actives enregistrées côté serveur.
  perform pg_advisory_xact_lock(hashtext(
    'agai-renfort-start-station:'||request_row.destination_caserne));
  if exists (
    select 1 from public.records active
    where active.caserne=request_row.destination_caserne
      and active.type in ('iv','pilp') and not active.deleted
      and active.data->>'s'='en-cours'
      and (
        agai_private.renfort_active_member_logins(active.data) && p_members
        or (clean_vehicle<>''
          and lower(clean_vehicle)=any(
            agai_private.renfort_active_vehicle_names(active.data)))
      )
  ) then
    raise exception 'AGAI_RENFORT_RESOURCES_BUSY';
  end if;
  select jsonb_agg(jsonb_build_object($part$;
begin
  select pg_get_functiondef(
    'agai_private.start_renfort(uuid,text[],text,uuid)'::regprocedure)
    into definition;
  if definition is null or strpos(definition,anchor)=0
     or strpos(definition,'AGAI_RENFORT_RESOURCES_BUSY')>0 then
    raise exception 'AGAI_RENFORT_AVAILABILITY_PRECONDITION_FAILED';
  end if;
  execute replace(definition,anchor,addition);
end;
$migration$;
commit;
