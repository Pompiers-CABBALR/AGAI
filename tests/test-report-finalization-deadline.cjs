const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modules/16-email-js.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261022210000_report_finalization_deadline.sql'),'utf8');
const functions=source.slice(source.indexOf('function compteRenduDeadline('),source.indexOf('function showCompteRenduModal('));

function dateContext(today){
  class TestDate extends Date{
    constructor(...args){super(...(args.length?args:[today+'T12:00:00Z']));}
  }
  const context={Date:TestDate,Intl};
  vm.createContext(context);
  vm.runInContext(functions,context);
  return context;
}

test('échéance au 5 du mois suivant, y compris changement d’année',()=>{
  const ctx=dateContext('2026-11-05');
  assert.equal(ctx.compteRenduDeadline({h:'20261021_1230'}),'2026-11-05');
  assert.equal(ctx.compteRenduDeadline({h:'20261231_2300'}),'2027-01-05');
  assert.equal(ctx.compteRenduDeadline({h:'20260230'}),'');
  assert.equal(ctx.compteRenduLate({h:'20261021_1230'}),false);
  assert.equal(dateContext('2026-11-06').compteRenduLate({h:'20261021_1230'}),true);
});
test('aucun blocage rétroactif avant le début du suivi d’octobre',()=>{
  assert.equal(dateContext('2026-11-06').compteRenduLate({h:'20260928_1200'}),false);
});
test('la validation serveur est contrôlée, attribuée et auditée',()=>{
  assert.match(migration,/local_today > limit_day/);
  assert.match(migration,/actor\.app_role<>'superadmin'/);
  assert.match(migration,/length\(reason\)<10/);
  assert.match(migration,/agai_private\.report_finalization_audit/);
  assert.match(migration,/finalized_by_uid uuid not null/);
  assert.match(migration,/new\.data := jsonb_set\(new\.data,'\{_crValidePar\}'/);
  assert.match(migration,/original_author := actor\.login/);
  assert.match(migration,/p_expected_record_revision/);
  assert.match(migration,/report_row\.data->>'_serverRevision'/);
  assert.match(migration,/select data into saved_data from public\.records where id=p_id/);
  assert.match(migration,/result := jsonb_set\(result,'\{data\}',saved_data,true\)/);
  assert.match(migration,/revoke all on agai_private\.report_finalization_audit/);
});
