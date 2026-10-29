-- Align the server with the existing availability screen: an active team
-- leader may edit availability for personnel in their own station, including
-- other teams. This does not grant access to station configuration or teams.
begin;

create or replace function agai_private.can_write_record(
  p_id text, p_caserne text, p_type text, p_data jsonb
) returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
declare
  actor record;
begin
  select * into actor from agai_private.current_access();
  if not found or p_id is null or p_caserne is null or p_type is null
    or p_data is null or coalesce(actor.can_login,false)=false
    or left(p_id,length(p_caserne||'__'||p_type||'__'))
       <> p_caserne||'__'||p_type||'__'
  then return false; end if;

  -- Presence always belongs to the authenticated account.
  if p_type='login' then
    return p_data->>'login'=actor.login
      and (p_caserne=actor.caserne_id
        or p_caserne='_GLOBAL' and actor.app_role in ('superadmin','chef_corps'));
  end if;

  if coalesce(actor.can_operate,false)=false then return false; end if;
  if p_type='user' and p_data ?| array['p','password_hash','passwordHash'] then
    return false;
  end if;
  if p_type='global' then
    if actor.app_role<>'superadmin' or p_caserne<>'_GLOBAL'
      or jsonb_typeof(p_data->'GLOBAL_ACCOUNTS')<>'array'
      or exists (
        select 1 from jsonb_array_elements(p_data->'GLOBAL_ACCOUNTS') account
        where account ?| array['p','password_hash','passwordHash']
      )
    then return false; end if;
    return true;
  end if;

  if actor.app_role='superadmin' then return true; end if;
  if p_caserne<>actor.caserne_id then return false; end if;

  if p_type='dispoRequest' then
    if p_id<>p_caserne||'__dispoRequest__'||coalesce(p_data->>'id','')
       or coalesce(p_data->>'caserneId','')<>p_caserne
       or coalesce(p_data->>'wk','') !~ '^[0-9]{8}$'
       or coalesce(p_data->>'login','')=''
       or coalesce(jsonb_typeof(p_data->'slots'),'')<>'array'
       or not exists (
         select 1 from public.records personnel
         where personnel.id=p_caserne||'__user__'||(p_data->>'login')
           and personnel.caserne=p_caserne and personnel.type='user'
           and not personnel.deleted
       )
    then return false; end if;
    if p_data->>'login'=actor.login then
      return p_data->>'statut' in ('en-attente','annulee')
        and nullif(p_data->>'reponduPar','') is null;
    end if;
    if actor.app_role='administrateur_caserne' then
      return p_data->>'statut' in ('en-attente','accepte','refuse','annulee');
    end if;
    return p_data->>'statut' in ('en-attente','accepte','refuse','annulee')
      and exists (
        select 1 from public.records team
        where team.caserne=p_caserne and team.type='equipe' and not team.deleted
          and team.data->>'resp'=actor.login
      );
  end if;

  if p_type='dispo' then
    if p_data->>'login'=actor.login
       or actor.app_role='administrateur_caserne' then return true; end if;
    -- A team leader can edit all personnel of this station, but cannot
    -- invent an identity or change the identity encoded in the row ID.
    return p_id=p_caserne||'__dispo__'||(p_data->>'wk')||'__'||(p_data->>'login')
      and exists (
        select 1 from public.records team
        where team.caserne=p_caserne and team.type='equipe' and not team.deleted
          and team.data->>'resp'=actor.login
      )
      and exists (
        select 1 from public.records personnel
        where personnel.id=p_caserne||'__user__'||(p_data->>'login')
          and personnel.caserne=p_caserne and personnel.type='user'
          and not personnel.deleted
      );
  end if;
  if p_type in ('iv','pilp','activite','renfort') then return true; end if;
  if p_type in ('fmpa','formStag','formForm') then
    return actor.app_role in ('administrateur_caserne','responsable_formation');
  end if;
  if p_type in ('user','config','equipe','astrTelDuty') then
    return actor.app_role='administrateur_caserne'
      and (p_type<>'user' or coalesce(p_data->>'appRole','agent')
           not in ('superadmin','chef_corps'));
  end if;
  return false;
end;
$function$;

commit;
