-- Journal de gestion du personnel : écrit uniquement par les déclencheurs serveur.
-- Aucun mot de passe, condensat ni jeton n'est conservé dans ce journal.
create table public.agai_personnel_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  caserne_id text not null,
  target_login text not null,
  actor_login text not null,
  action text not null check (action in ('create','update','delete','status','admin_grant','admin_revoke')),
  changes jsonb not null default '{}'::jsonb
);

create index agai_personnel_audit_station_time_idx
  on public.agai_personnel_audit (caserne_id, occurred_at desc, id desc);

alter table public.agai_personnel_audit enable row level security;
revoke all on public.agai_personnel_audit from public, anon, authenticated;
grant select on public.agai_personnel_audit to authenticated;

create policy agai_personnel_audit_admin_read
  on public.agai_personnel_audit for select to authenticated
  using (
    exists (
      select 1 from agai_private.current_access() access
      where access.can_login
        and access.app_role in ('superadmin', 'administrateur_caserne')
        and (access.app_role = 'superadmin' or access.caserne_id = agai_personnel_audit.caserne_id)
    )
  );

create function agai_private.audit_personnel_record()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  actor text;
  target text;
  event_action text;
  delta jsonb := '{}'::jsonb;
  field_name text;
  old_admins text[];
  new_admins text[];
begin
  -- updated_by est défini par le serveur pour les écritures authentifiées.
  actor := case when auth.role() = 'authenticated' then new.updated_by else 'système' end;
  if actor is null or actor = '' then actor := 'système'; end if;

  if new.type = 'config' then
    if tg_op <> 'UPDATE' then return new; end if;
    if old.data->'adminLogins' is not distinct from new.data->'adminLogins' then return new; end if;
    select array_agg(value) into old_admins
      from jsonb_array_elements_text(case when jsonb_typeof(old.data->'adminLogins')='array'
        then old.data->'adminLogins' else '[]'::jsonb end) value;
    select array_agg(value) into new_admins
      from jsonb_array_elements_text(case when jsonb_typeof(new.data->'adminLogins')='array'
        then new.data->'adminLogins' else '[]'::jsonb end) value;
    old_admins := coalesce(old_admins, array[]::text[]);
    new_admins := coalesce(new_admins, array[]::text[]);
    foreach target in array new_admins loop
      if not target = any(old_admins) then
        insert into public.agai_personnel_audit(caserne_id,target_login,actor_login,action)
          values (new.caserne,target,actor,'admin_grant');
      end if;
    end loop;
    foreach target in array old_admins loop
      if not target = any(new_admins) then
        insert into public.agai_personnel_audit(caserne_id,target_login,actor_login,action)
          values (new.caserne,target,actor,'admin_revoke');
      end if;
    end loop;
    return new;
  end if;

  if new.type <> 'user' then return new; end if;
  if tg_op = 'INSERT' then
    target := coalesce(new.data->>'l', new.data->>'id');
  else
    target := coalesce(new.data->>'l', new.data->>'id', old.data->>'l', old.data->>'id');
  end if;
  if target is null or target = '' then return new; end if;
  if tg_op = 'INSERT' and new.deleted then
    event_action := 'delete';
  elsif tg_op = 'INSERT' then
    event_action := 'create';
  elsif new.deleted and not old.deleted then
    event_action := 'delete';
  elsif old.deleted and not new.deleted then
    event_action := 'create';
  elsif new.deleted then
    return new;
  else
    event_action := 'update';
    foreach field_name in array array['nom','prenom','matricule','grade','fonction','fonction2',
      'rights','fonctionsFormateur','responsableFormation','appRole'] loop
      if old.data->field_name is distinct from new.data->field_name then
        delta := delta || jsonb_build_object(field_name,
          jsonb_build_object('avant',old.data->field_name,'apres',new.data->field_name));
      end if;
    end loop;
    if old.data->'gradeHistory' is distinct from new.data->'gradeHistory' then
      delta := delta || '{"gradeHistory":{"changed":true}}'::jsonb;
    end if;
    if old.data->'p' is distinct from new.data->'p' then
      delta := delta || '{"p":{"changed":true}}'::jsonb;
    end if;
    if delta = '{}'::jsonb then return new; end if;
  end if;
  insert into public.agai_personnel_audit(caserne_id,target_login,actor_login,action,changes)
    values (new.caserne,target,actor,event_action,delta);
  return new;
end;
$function$;

revoke all on function agai_private.audit_personnel_record() from public, anon, authenticated;
create trigger agai_audit_personnel_record
  after insert or update on public.records
  for each row when (new.type in ('user','config'))
  execute function agai_private.audit_personnel_record();

create function agai_private.audit_personnel_status()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  insert into public.agai_personnel_audit(caserne_id,target_login,actor_login,action,changes)
  values (new.caserne_id,new.login,new.recorded_by,'status',jsonb_build_object(
    'status',jsonb_build_object('avant',new.old_status,'apres',new.new_status),
    'starts_on',jsonb_build_object('avant',null,'apres',new.starts_on),
    'ends_on',jsonb_build_object('avant',null,'apres',new.ends_on)
  ));
  return new;
end;
$function$;

revoke all on function agai_private.audit_personnel_status() from public, anon, authenticated;
create trigger agai_audit_personnel_status
  after insert on public.agai_personnel_access_history
  for each row execute function agai_private.audit_personnel_status();
