-- Le superadministrateur peut accepter un renfort inter-casernes ; il doit
-- également pouvoir lancer et clôturer ce même renfort avec dérogation.
-- Les comptes ordinaires restent strictement limités à leur caserne.
begin;
do $migration$
declare
  signature text;
  definition text;
  old_check text := $part$  if not found or request_row.destination_caserne<>actor.caserne_id then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;$part$;
  new_check text := $part$  if not found or (
    request_row.destination_caserne<>actor.caserne_id
    and actor.app_role<>'superadmin'
  ) then
    raise exception 'AGAI_RENFORT_ACCESS_DENIED';
  end if;$part$;
begin
  foreach signature in array array[
    'agai_private.start_renfort(uuid,text[],text,uuid)',
    'agai_private.finish_renfort(uuid,uuid,bigint)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if definition is null or strpos(definition,old_check)=0
       or strpos(definition,new_check)>0 then
      raise exception 'AGAI_RENFORT_SUPERADMIN_PRECONDITION_FAILED: %',signature;
    end if;
    execute replace(definition,old_check,new_check);
  end loop;
end;
$migration$;
commit;
