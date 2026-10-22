-- Validation des comptes rendus : échéance au 5 du mois suivant, inclus.
-- Le contrôle est fait sur le serveur, y compris pour les anciennes versions
-- clientes ; aucune intervention existante n'est modifiée par la migration.

create table if not exists agai_private.report_finalization_audit (
  id bigint generated always as identity primary key,
  record_id text not null,
  caserne text not null,
  report_type text not null check (report_type in ('iv','pilp')),
  finalized_by text not null,
  finalized_by_uid uuid not null,
  original_author text,
  intervention_date date not null,
  deadline date not null,
  override_reason text,
  finalized_at timestamptz not null default now()
);
create index if not exists agai_report_finalization_audit_record_idx
  on agai_private.report_finalization_audit(record_id, finalized_at desc);
alter table agai_private.report_finalization_audit enable row level security;
revoke all on agai_private.report_finalization_audit from public, anon, authenticated;

create or replace function agai_private.guard_report_finalization()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  report_day_text text;
  report_day date;
  limit_day date;
  local_today date := (now() at time zone 'Europe/Paris')::date;
  reason text;
  original_author text;
  authorization_data jsonb;
  preserved_validation jsonb;
  was_validated boolean := false;
  is_owner boolean := false;
begin
  if new.type not in ('iv','pilp') or coalesce(new.deleted,false) then return new; end if;
  if tg_op='UPDATE' then
    was_validated := coalesce(old.data->>'_crValide','false')='true';
    authorization_data := old.data;
  else
    authorization_data := new.data;
  end if;
  if coalesce(new.data->>'_crValide','false') <> 'true'
     or was_validated then
    -- Une écriture ultérieure ne peut pas réattribuer une validation déjà faite.
    if was_validated and coalesce(new.data->>'_crValide','false')='true' then
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
        into preserved_validation from jsonb_each(old.data)
        where key=any(array['_crValidePar','_crValideAt','_crDateValidation',
          '_crValidationDateLimite','_crDerogationMotif','_crAuteur']::text[]);
      new.data := new.data || preserved_validation;
    end if;
    return new;
  end if;
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    -- Les migrations exécutées par postgres restent possibles ; jamais par anon.
    if session_user='postgres' then return new; end if;
    raise exception 'AGAI_REPORT_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or (actor.caserne_id<>new.caserne and actor.app_role<>'superadmin') then
    raise exception 'AGAI_REPORT_ACCESS_DENIED';
  end if;
  if tg_op='UPDATE' then
    if old.caserne<>new.caserne then raise exception 'AGAI_REPORT_CHANGED'; end if;
  end if;
  if btrim(coalesce(new.data->>'_crTexte',new.data->>'_compteRendu',''))='' then
    raise exception 'AGAI_REPORT_TEXT_REQUIRED';
  end if;
  report_day_text := left(regexp_replace(coalesce(authorization_data->>'h',''),'[^0-9]','','g'),8);
  if report_day_text !~ '^20[0-9]{6}$' then
    raise exception 'AGAI_REPORT_DATE_INVALID';
  end if;
  begin
    report_day := make_date(substr(report_day_text,1,4)::int,
      substr(report_day_text,5,2)::int,substr(report_day_text,7,2)::int);
  exception when others then
    raise exception 'AGAI_REPORT_DATE_INVALID';
  end;
  limit_day := (date_trunc('month',report_day::timestamp) + interval '1 month 4 days')::date;
  is_owner := actor.login in (coalesce(authorization_data->>'agr',''),coalesce(authorization_data->>'_agr2',''))
    or exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(authorization_data->'_equipage1')='array'
          then authorization_data->'_equipage1' else '[]'::jsonb end
        || case when jsonb_typeof(authorization_data->'_equipage2')='array'
          then authorization_data->'_equipage2' else '[]'::jsonb end
      ) as crew_member(value)
      where crew_member.value->>'login'=actor.login
        and (lower(coalesce(crew_member.value->>'role',''))='ca'
          or lower(coalesce(crew_member.value->>'role','')) like '%chef d%agr%')
    )
    or exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(authorization_data->'_renfortsInternes')='array'
          then authorization_data->'_renfortsInternes' else '[]'::jsonb end
      ) as reinforcement(value),
      lateral jsonb_array_elements(
        case when jsonb_typeof(reinforcement.value->'equipage')='array'
          then reinforcement.value->'equipage' else '[]'::jsonb end
      ) as crew_member(value)
      where crew_member.value->>'login'=actor.login
        and (lower(coalesce(crew_member.value->>'role',''))='ca'
          or lower(coalesce(crew_member.value->>'role','')) like '%chef d%agr%')
    )
    or exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(authorization_data->'_releves')='array'
          then authorization_data->'_releves' else '[]'::jsonb end
      ) as relief(value),
      lateral jsonb_array_elements(
        case when jsonb_typeof(relief.value->'nouvelEquipage')='array'
          then relief.value->'nouvelEquipage' else '[]'::jsonb end
      ) as crew_member(value)
      where relief.value->>'isRenfortInterne'='true'
        and crew_member.value->>'renfortInterne'='true'
        and crew_member.value->>'login'=actor.login
        and (lower(coalesce(crew_member.value->>'role',''))='ca'
          or lower(coalesce(crew_member.value->>'role','')) like '%chef d%agr%')
    );
  if actor.app_role not in ('administrateur_caserne','superadmin') and not is_owner then
    raise exception 'AGAI_REPORT_OWNER_REQUIRED';
  end if;
  reason := btrim(coalesce(new.data->>'_crDerogationMotif',''));
  if report_day >= date '2026-10-01' and local_today > limit_day then
    if actor.app_role<>'superadmin' then
      raise exception 'AGAI_REPORT_DEADLINE_PASSED';
    end if;
    if length(reason)<10 or length(reason)>500 then
      raise exception 'AGAI_REPORT_OVERRIDE_REASON_REQUIRED';
    end if;
  else
    reason := '';
  end if;
  original_author := nullif(btrim(coalesce(authorization_data->>'_crAuteur','')),'');
  if original_author is null then
    original_author := actor.login;
  end if;
  new.data := jsonb_set(new.data,'{_crAuteur}',to_jsonb(original_author),true);
  new.data := jsonb_set(new.data,'{_crValidePar}',to_jsonb(actor.login),true);
  new.data := jsonb_set(new.data,'{_crValideAt}',to_jsonb(now()),true);
  new.data := jsonb_set(new.data,'{_crDateValidation}',
    to_jsonb(to_char(now() at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI')),true);
  new.data := jsonb_set(new.data,'{_crValidationDateLimite}',to_jsonb(limit_day),true);
  if reason<>'' then
    new.data := jsonb_set(new.data,'{_crDerogationMotif}',to_jsonb(reason),true);
  else
    new.data := new.data - '_crDerogationMotif';
  end if;
  insert into agai_private.report_finalization_audit(
    record_id,caserne,report_type,finalized_by,finalized_by_uid,
    original_author,intervention_date,deadline,override_reason
  ) values(new.id,new.caserne,new.type,actor.login,auth.uid(),
    original_author,report_day,limit_day,nullif(reason,''));
  return new;
end;
$function$;
revoke execute on function agai_private.guard_report_finalization()
  from public, anon, authenticated;
drop trigger if exists agai_guard_report_finalization on public.records;
create trigger agai_guard_report_finalization
  before insert or update of data on public.records
  for each row execute function agai_private.guard_report_finalization();

create or replace function public.agai_admin_finalize_report(
  p_id text,p_text text,p_expected_record_revision bigint,p_override_reason text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  report_row public.records%rowtype;
  next_data jsonb;
  saved_data jsonb;
  result jsonb;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception 'AGAI_REPORT_AUTH_REQUIRED';
  end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or actor.app_role not in ('administrateur_caserne','superadmin') then
    raise exception 'AGAI_REPORT_ADMIN_REQUIRED';
  end if;
  if p_id is null or length(p_id)>180 or p_expected_record_revision is null
     or p_text is null or btrim(p_text)='' or length(p_text)>30000 then
    raise exception 'AGAI_REPORT_INVALID_REQUEST';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('agai-record:'||p_id));
  select * into report_row from public.records where id=p_id for update;
  if not found or report_row.deleted or report_row.type not in ('iv','pilp')
     or (report_row.caserne<>actor.caserne_id and actor.app_role<>'superadmin') then
    raise exception 'AGAI_REPORT_NOT_FOUND';
  end if;
  if report_row.data->>'s'<>'terminee' or report_row.data->>'_crValide'='true' then
    raise exception 'AGAI_REPORT_NOT_PENDING';
  end if;
  if coalesce(nullif(report_row.data->>'_serverRevision','')::bigint,0)
     <>p_expected_record_revision then
    raise exception 'AGAI_REPORT_CHANGED';
  end if;
  next_data := jsonb_set(report_row.data,'{_crTexte}',to_jsonb(p_text),true);
  next_data := jsonb_set(next_data,'{_compteRendu}',to_jsonb(p_text),true);
  next_data := jsonb_set(next_data,'{_crValide}','true'::jsonb,true);
  next_data := jsonb_set(next_data,'{_crDate}',
    to_jsonb(to_char(now() at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI')),true);
  if btrim(coalesce(report_row.data->>'_crAuteur',''))='' then
    next_data := jsonb_set(next_data,'{_crAuteur}',to_jsonb(actor.login),true);
  end if;
  if p_override_reason is not null then
    next_data := jsonb_set(next_data,'{_crDerogationMotif}',to_jsonb(p_override_reason),true);
  end if;
  result := public.agai_atomic_upsert_record(report_row.id,report_row.caserne,
    report_row.type,next_data,false,actor.login,
    coalesce(nullif(report_row.data->>'_statusRevision','')::bigint,0),
    p_expected_record_revision,'report-admin', 'V202610_0060',
    'report-finalize-'||replace(auth.uid()::text,'-','')||'-'||extract(epoch from clock_timestamp())::bigint);
  -- L'upsert renvoie sa charge initiale ; le trigger a ajouté les mentions de
  -- validation à la ligne effectivement stockée. Renvoyer cette version.
  select data into saved_data from public.records where id=p_id;
  result := jsonb_set(result,'{data}',saved_data,true);
  return result;
end;
$function$;
revoke execute on function public.agai_admin_finalize_report(text,text,bigint,text)
  from public, anon, authenticated;
grant execute on function public.agai_admin_finalize_report(text,text,bigint,text)
  to authenticated;
