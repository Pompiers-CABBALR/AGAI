-- Le second contrôle, après acquisition des verrous source/demande, doit
-- conserver la même exception superadmin que le premier contrôle.
begin;
do $migration$
declare
  definition text;
  old_check text := $part$  if not found
     or request_row.destination_caserne<>actor.caserne_id
     or request_row.source_record_id is distinct from source_row.id then$part$;
  new_check text := $part$  if not found
     or (request_row.destination_caserne<>actor.caserne_id
         and actor.app_role<>'superadmin')
     or request_row.source_record_id is distinct from source_row.id then$part$;
begin
  select pg_get_functiondef(
    'agai_private.start_renfort(uuid,text[],text,uuid)'::regprocedure)
    into definition;
  if definition is null or strpos(definition,old_check)=0
     or strpos(definition,new_check)>0 then
    raise exception 'AGAI_RENFORT_LOCKED_SOURCE_PRECONDITION_FAILED';
  end if;
  execute replace(definition,old_check,new_check);
end;
$migration$;
commit;
