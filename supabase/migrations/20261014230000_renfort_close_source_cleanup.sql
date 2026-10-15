-- Une intervention source close ne laisse pas une demande de renfort departable.
begin;
create function agai_private.cancel_unstarted_renforts_on_source_close()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if new.type='iv'
     and (new.deleted or new.data->>'s' in ('terminee','annulee'))
     and not (old.deleted or old.data->>'s' in ('terminee','annulee')) then
    update public.agai_renfort_requests
       set status='annule',updated_at=now()
     where source_record_id=new.id
       and status in ('en-attente','accepte');
  end if;
  return new;
end;
$function$;
revoke execute on function agai_private.cancel_unstarted_renforts_on_source_close()
  from public, anon, authenticated;
create trigger agai_cancel_unstarted_renforts_on_source_close
after update of data,deleted on public.records
for each row execute function agai_private.cancel_unstarted_renforts_on_source_close();
commit;
