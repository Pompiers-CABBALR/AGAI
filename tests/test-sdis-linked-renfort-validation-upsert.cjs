const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'supabase','migrations',name),'utf8');
const original=read('20261107215000_sdis_linked_personnel_renfort.sql');
const fix=read('20261107215100_fix_sdis_linked_report_upsert_validation.sql');
const auditFix=read('20261107215200_finalize_sdis_linked_report_single_audit.sql');
const functionBody=sql=>{
  const start=sql.indexOf('create or replace function agai_private.guard_sdis_linked_personnel_report()');
  assert.ok(start>=0);
  const end=sql.indexOf('$function$;',start);
  assert.ok(end>start);
  return sql.slice(start,end+'$function$;'.length).replace(/\r\n/g,'\n');
};

test('la correction ne change que le passage préliminaire de l’UPSERT existant',()=>{
  const before=functionBody(original);
  const after=functionBody(fix);
  const blocked="  if tg_op='INSERT' and not rpc_edit then raise exception 'AGAI_SDIS_RENFORT_CREATE_RPC_REQUIRED'; end if;";
  const existing="  if tg_op='INSERT' and exists(select 1 from public.records existing\n"
    +"      where existing.id=new.id and existing.caserne=new.caserne\n"
    +"        and existing.type='iv' and not existing.deleted\n"
    +"        and coalesce(existing.data->>'_isSdisPersonnelRenfort','false')='true') then\n"
    +"    return new;\n  end if;\n";
  assert.ok(before.includes(blocked));
  assert.equal(after,before.replace(blocked,existing+blocked));
});

test('la création directe et la modification après validation restent interdites',()=>{
  const sql=functionBody(fix);
  assert.match(sql,/AGAI_SDIS_RENFORT_CREATE_RPC_REQUIRED/);
  assert.match(sql,/AGAI_SDIS_RENFORT_REVIEW_REQUIRED/);
  assert.match(sql,/coalesce\(old\.data->>'_crValide','false'\)='true'/);
  assert.match(sql,/old\.data->protected_key is distinct from new\.data->protected_key/);
  assert.match(sql,/AGAI_SDIS_RENFORT_MAIN_REPORT_REQUIRED/);
});

test('la validation passe une seule fois par UPDATE et conserve son journal',()=>{
  assert.match(auditFix,/update public\.records set data=report_data,updated_by=actor\.login/);
  assert.match(auditFix,/returning data into report_data/);
  assert.match(auditFix,/insert into public\.agai_operation_log/);
  assert.match(auditFix,/to_jsonb\(p_expected_revision\+1\)/);
  assert.doesNotMatch(auditFix,/agai_atomic_upsert_record/);
  assert.match(auditFix,/AGAI_SDIS_RENFORT_MAIN_REPORT_REQUIRED/);
  assert.match(auditFix,/actor\.login<>report_row\.data->>'agr'/);
});
