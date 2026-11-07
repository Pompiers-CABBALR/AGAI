-- Finalize an existing linked report with one UPDATE. INSERT ... ON CONFLICT
-- executes the finalization BEFORE INSERT trigger before the conflict and
-- would otherwise write two audit rows for one validation.
begin;

create or replace function agai_private.finalize_sdis_linked_personnel_report(
  p_caserne text,p_report_id text,p_text text,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  actor record;
  report_row public.records%rowtype;
  source_row public.records%rowtype;
  report_data jsonb;
  status_revision bigint;
begin
  if auth.uid() is null then raise exception 'AGAI_SDIS_RENFORT_AUTH_REQUIRED'; end if;
  select * into actor from agai_private.current_access();
  if not found or not coalesce(actor.can_operate,false)
     or (actor.caserne_id<>p_caserne and actor.app_role<>'superadmin')
     or p_report_id is null or p_report_id not like '%-RPSDIS'
     or p_expected_revision is null or p_expected_revision<0
     or length(btrim(coalesce(p_text,''))) not between 1 and 30000 then
    raise exception 'AGAI_SDIS_RENFORT_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtext('agai-record:'||p_caserne||'__iv__'||p_report_id));
  select * into report_row from public.records
    where id=p_caserne||'__iv__'||p_report_id and caserne=p_caserne
      and type='iv' and not deleted for update;
  if not found or coalesce(report_row.data->>'_isSdisPersonnelRenfort','false')<>'true'
     or coalesce(report_row.data->>'_crValide','false')='true'
     or (actor.login<>report_row.data->>'agr'
       and actor.app_role not in ('administrateur_caserne','superadmin')) then
    raise exception 'AGAI_SDIS_RENFORT_FORBIDDEN';
  end if;
  select * into source_row from public.records
    where id=p_caserne||'__iv__'||(report_row.data->>'_ivSourceId')
      and caserne=p_caserne and type='iv' and not deleted;
  if not found or coalesce(source_row.data->>'_crValide','false')<>'true' then
    raise exception 'AGAI_SDIS_RENFORT_MAIN_REPORT_REQUIRED';
  end if;
  if coalesce(nullif(report_row.data->>'_serverRevision','')::bigint,0)<>p_expected_revision then
    raise exception 'AGAI_SDIS_RENFORT_STALE_REPORT';
  end if;
  status_revision:=coalesce(nullif(report_row.data->>'_statusRevision','')::bigint,0);
  report_data:=report_row.data||jsonb_build_object(
    '_crTexte',btrim(p_text),'_compteRendu',btrim(p_text),'_crValide',true,
    '_crAuteur',report_row.data->>'agr',
    '_crClientValideAt',now(),'_crDate',to_char(now() at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI'));
  report_data:=jsonb_set(report_data,'{_serverRevision}',to_jsonb(p_expected_revision+1),true);
  if actor.login<>report_row.data->>'agr' then
    report_data:=report_data||jsonb_build_object(
      '_crDernierEditeur',actor.login,
      '_crDerniereModification',to_char(now() at time zone 'Europe/Paris','YYYYMMDD_HH24MI'));
  end if;
  update public.records set data=report_data,updated_by=actor.login,updated_at=now()
    where id=report_row.id and caserne=p_caserne and type='iv' and not deleted
      and coalesce(nullif(data->>'_serverRevision','')::bigint,0)=p_expected_revision
    returning data into report_data;
  if not found then raise exception 'AGAI_SDIS_RENFORT_STALE_REPORT'; end if;
  insert into public.agai_operation_log(
    record_id,caserne,record_type,action_type,previous_status,new_status,
    previous_revision,new_revision,updated_by,device_id,app_version,action_id
  ) values(report_row.id,p_caserne,'iv','update','terminee','terminee',
    status_revision,status_revision,actor.login,'','V202611_0022','sdis-renfort-finalize');
  return jsonb_build_object('ok',true,'report',report_data);
end;
$function$;

revoke execute on function agai_private.finalize_sdis_linked_personnel_report(text,text,text,bigint)
  from public,anon,authenticated;
commit;
