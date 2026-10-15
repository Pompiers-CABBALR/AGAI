-- Vérifie que l'engin choisi pour un renfort complet appartient bien
-- au catalogue courant de la caserne destinataire. Aucun droit ajouté.
begin;

do $migration$
declare
  definition text;
  anchor text := $part$  -- Un seul départ de renfort à la fois par caserne, puis contrôle$part$;
  addition text := $part$  if clean_vehicle<>'' and not exists (
    select 1 from public.records configuration
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(configuration.data->'astrConfig'->'engins')='array'
        then configuration.data->'astrConfig'->'engins'
        else '[]'::jsonb end) configured(name)
    where configuration.id=request_row.destination_caserne||'__config__main'
      and configuration.caserne=request_row.destination_caserne
      and configuration.type='config' and not configuration.deleted
      and lower(btrim(configured.name))=lower(clean_vehicle)
  ) then
    raise exception 'AGAI_RENFORT_VEHICLE_UNKNOWN';
  end if;
  -- Un seul départ de renfort à la fois par caserne, puis contrôle$part$;
begin
  select pg_get_functiondef(
    'agai_private.start_renfort(uuid,text[],text,uuid)'::regprocedure)
    into definition;
  if definition is null or strpos(definition,anchor)=0
     or strpos(definition,'AGAI_RENFORT_RESOURCES_BUSY')=0
     or strpos(definition,'AGAI_RENFORT_VEHICLE_UNKNOWN')>0 then
    raise exception 'AGAI_RENFORT_CATALOG_PRECONDITION_FAILED';
  end if;
  execute replace(definition,anchor,addition);
end;
$migration$;
commit;
