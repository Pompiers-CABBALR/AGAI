-- Applique en production le 15 octobre 2026 sous le nom
-- renfort_consistent_lock_order_reviewed ; les RPC restent desactives.
-- Depart et cloture source verrouillent dans le meme ordre : source, demande.
-- Aucun verrou n'est supprime. Une demande modifiee entre la lecture initiale
-- et le verrou est relue et validee a nouveau sous verrou.
begin;
do $migration$
declare
  definition text;
  rewritten text;
  old_head text := $part$select * into request_row from public.agai_renfort_requests
    where id=p_id for update;$part$;
  new_head text := $part$select * into request_row from public.agai_renfort_requests
    where id=p_id;
  if not found or request_row.destination_caserne<>actor.caserne_id then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;
  select * into source_row from public.records
    where id=request_row.source_record_id for update;
  select * into request_row from public.agai_renfort_requests
    where id=p_id for update;
  if not found
     or request_row.destination_caserne<>actor.caserne_id
     or request_row.source_record_id is distinct from source_row.id then
    raise exception 'AGAI_RENFORT_SOURCE_CHANGED';
  end if;
  select * into source_row from public.records
    where id=request_row.source_record_id for update;
  if not found or source_row.id is distinct from request_row.source_record_id then
    raise exception 'AGAI_RENFORT_SOURCE_CHANGED';
  end if;$part$;
  old_source text := $part$select * into source_row from public.records
    where id=request_row.source_record_id and not deleted and type='iv'
    for update;
  if not found or source_row.caserne<>request_row.source_caserne$part$;
  new_source text := $part$if source_row.id is null or source_row.deleted
     or source_row.type<>'iv'
     or source_row.caserne<>request_row.source_caserne$part$;
begin
  select pg_get_functiondef('agai_private.start_renfort(uuid,text[],text,uuid)'::regprocedure)
    into definition;
  if definition is null or strpos(definition,old_head)=0
     or strpos(definition,old_source)=0 then
    raise exception 'AGAI_RENFORT_LOCK_ORDER_PRECONDITION_FAILED';
  end if;
  rewritten:=replace(replace(definition,old_head,new_head),old_source,new_source);
  if rewritten=definition or strpos(rewritten,old_source)>0
     or strpos(rewritten,new_head)=0 then
    raise exception 'AGAI_RENFORT_LOCK_ORDER_REWRITE_FAILED';
  end if;
  execute rewritten;
end;
$migration$;
commit;
