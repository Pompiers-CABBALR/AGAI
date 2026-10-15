-- Defense en profondeur : une affectation accidentelle comme chef d'agres
-- ne suffit pas a autoriser une demande de renfort.
begin;

create function agai_private.check_renfort_sender_rights()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  sender_role text;
  sender_rights jsonb;
begin
  select credentials.app_role, person.data->'rights'
    into sender_role,sender_rights
  from public.agai_identity_credentials credentials
  left join public.records person
    on person.id=new.source_caserne||'__user__'||new.requested_by
   and person.type='user' and not person.deleted
  where credentials.login=new.requested_by
    and credentials.caserne_id=new.source_caserne
    and credentials.active;
  if sender_role is null or (
    sender_role not in ('superadmin','administrateur_caserne','chef_corps')
    and not coalesce(sender_rights @> '["Chef d''agrès"]'::jsonb,false)
  ) then
    raise exception 'AGAI_RENFORT_SENDER_NOT_CHIEF';
  end if;
  return new;
end;
$function$;

revoke execute on function agai_private.check_renfort_sender_rights()
  from public, anon, authenticated;
create trigger agai_renfort_sender_rights
before insert on public.agai_renfort_requests
for each row execute function agai_private.check_renfort_sender_rights();
commit;
