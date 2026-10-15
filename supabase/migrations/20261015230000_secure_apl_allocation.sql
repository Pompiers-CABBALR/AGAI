-- Attribution unique des nouveaux numeros APL, additive et inactive tant
-- que l'interface n'utilise pas encore agai_reserve_apl.
begin;

create table if not exists agai_private.apl_reservations (
  action_key uuid primary key,
  auth_user_id uuid not null,
  caserne text not null,
  login text not null,
  purpose text not null check (purpose in ('appel','suite','echelle','epa','sdis','transfert')),
  year integer not null check (year between 2026 and 9999),
  number bigint not null check (number > 0),
  created_at timestamptz not null default now(),
  unique (year, number)
);
alter table agai_private.apl_reservations enable row level security;
revoke all on agai_private.apl_reservations from public, anon, authenticated;

create or replace function agai_private.reserve_apl(
  p_action_key uuid, p_purpose text
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  current_year integer := extract(year from now() at time zone 'Europe/Paris')::integer;
  existing agai_private.apl_reservations%rowtype;
  highest_existing bigint := 0;
  highest_config bigint := 0;
  allocated bigint;
  prefix text := 'APL_' || current_year::text || '_';
begin
  if (select auth.uid()) is null then
    raise exception 'AGAI_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false) then
    raise exception 'AGAI_APL_ACCESS_DENIED';
  end if;
  if p_action_key is null or not coalesce(p_purpose = any(
    array['appel','suite','echelle','epa','sdis','transfert']),false) then
    raise exception 'AGAI_APL_INVALID_REQUEST';
  end if;

  -- Tous les createurs d'APL prennent le meme verrou annuel. Le second
  -- appel avec la meme cle retrouve son numero apres une coupure reseau.
  perform pg_advisory_xact_lock(hashtext('agai-apl:' || current_year::text));
  select * into existing from agai_private.apl_reservations
    where action_key=p_action_key;
  if found then
    if existing.auth_user_id<>(select auth.uid())
       or existing.caserne<>actor.caserne_id
       or existing.login<>actor.login
       or existing.purpose<>p_purpose then
      raise exception 'AGAI_APL_KEY_REUSED';
    end if;
    return jsonb_build_object('apl','APL_'||existing.year::text||'_'||
      lpad(existing.number::text,6,'0'),
      'actionKey',p_action_key::text);
  end if;

  -- Le compteur historique dans la configuration globale peut etre en
  -- retard. Les fiches actives et archivees non effacees servent de plancher.
  select coalesce(max(substring(
      coalesce(nullif(data->>'_numApl',''),data->>'id')
      from '^APL_'||current_year::text||'_([0-9]+)$')::bigint),0)
    into highest_existing
    from public.records
    where type in ('iv','pilp')
      and coalesce(nullif(data->>'_numApl',''),data->>'id')
        ~ ('^APL_'||current_year::text||'_[0-9]+$');

  select coalesce(max((data->'APL_COUNTER'->>current_year::text)::bigint),0)
    into highest_config from public.records
    where caserne='_GLOBAL' and type='global'
      and data->'APL_COUNTER'->>current_year::text ~ '^[0-9]+$';
  highest_existing:=greatest(highest_existing,highest_config);

  insert into public.agai_number_counters(scope,period,value,updated_at)
    values('apl',current_year::text,highest_existing+1,now())
    on conflict (scope,period) do update
      set value=greatest(public.agai_number_counters.value,highest_existing)+1,
          updated_at=now()
    returning value into allocated;

  insert into agai_private.apl_reservations(
    action_key,auth_user_id,caserne,login,purpose,year,number
  ) values (
    p_action_key,(select auth.uid()),actor.caserne_id,actor.login,
    p_purpose,current_year,allocated
  );
  return jsonb_build_object('apl',prefix||lpad(allocated::text,6,'0'),
    'actionKey',p_action_key::text);
end;
$function$;

revoke execute on function agai_private.reserve_apl(uuid,text)
  from public,anon,authenticated;

create or replace function public.agai_reserve_apl(
  p_action_key uuid, p_purpose text
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or p_purpose='transfert' then
    raise exception 'AGAI_APL_ACCESS_DENIED';
  end if;
  return agai_private.reserve_apl(p_action_key,p_purpose);
end;
$function$;
revoke execute on function public.agai_reserve_apl(uuid,text)
  from public,anon,authenticated;
grant execute on function public.agai_reserve_apl(uuid,text)
  to authenticated;

commit;
