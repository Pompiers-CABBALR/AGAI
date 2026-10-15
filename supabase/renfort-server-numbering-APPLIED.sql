-- Applique en production le 15 octobre 2026 sous le nom
-- renfort_server_numbering_reviewed ; ne pas activer les renforts avec ce fichier seul.
-- Attribue au depart un numero Renfort propre a la caserne et a l'annee.
-- Le compteur et la fiche locale sont dans la meme transaction ; si le depart
-- echoue, aucun numero n'est consomme.
begin;
do $migration$
declare
  definition text;
  rewritten text;
  old_declaration text := $part$  clean_vehicle text := btrim(coalesce(p_vehicle,''));$part$;
  new_declaration text := $part$  clean_vehicle text := btrim(coalesce(p_vehicle,''));
  renfort_year text;
  existing_renfort_max bigint;
  allocated_renfort_number bigint;$part$;
  old_start text := $part$  local_id:=request_row.destination_caserne||'__iv__RENFORT_'||replace(p_id::text,'-','');$part$;
  new_start text := $part$  renfort_year:=left(started_at_local,4);
  select coalesce(max(case
    when (r.data->>'_numRenfort')~'^[0-9]{1,12}$'
    then (r.data->>'_numRenfort')::bigint else 0 end),0)
    into existing_renfort_max
  from public.records r
  where r.caserne=request_row.destination_caserne
    and r.type='iv' and not r.deleted
    and r.data->>'_isRenfort'='true'
    and r.data->>'s' in ('en-cours','terminee')
    and left(regexp_replace(coalesce(r.data->>'_numberedAtStart',r.data->>'h',''),'[^0-9]','','g'),4)=renfort_year;
  allocated_renfort_number:=public.agai_allocate_number(
    'renfort:'||request_row.destination_caserne,renfort_year,1,existing_renfort_max);
  local_id:=request_row.destination_caserne||'__iv__RENFORT_'||replace(p_id::text,'-','');$part$;
  old_data text := $part$    '_numberedAtStart',started_at_local,
    'n',request_row.source_snapshot->>'ivNature',$part$;
  new_data text := $part$    '_numberedAtStart',started_at_local,
    '_numRenfort',allocated_renfort_number,
    '_numGlobal',source_row.data->'_numGlobal',
    'n',request_row.source_snapshot->>'ivNature',$part$;
begin
  select pg_get_functiondef('agai_private.start_renfort(uuid,text[],text,uuid)'::regprocedure)
    into definition;
  if definition is null or strpos(definition,'AGAI_RENFORT_SOURCE_CHANGED')=0
     or strpos(definition,old_declaration)=0 or strpos(definition,old_start)=0
     or strpos(definition,old_data)=0 then
    raise exception 'AGAI_RENFORT_NUMBERING_PRECONDITION_FAILED';
  end if;
  rewritten:=replace(replace(replace(definition,old_declaration,new_declaration),
                              old_start,new_start),old_data,new_data);
  if rewritten=definition or strpos(rewritten,new_declaration)=0
     or strpos(rewritten,new_start)=0 or strpos(rewritten,new_data)=0 then
    raise exception 'AGAI_RENFORT_NUMBERING_REWRITE_FAILED';
  end if;
  execute rewritten;
end;
$migration$;
commit;
