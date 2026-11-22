const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const auth=fs.readFileSync(path.join(root,'modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'modules/11-admin-js-partie-2-2-gestion-utilisateurs.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261122150000_personnel_arret_extension.sql'),'utf8');
const authBlock=auth.slice(auth.indexOf('function personnelLocalDate('),auth.indexOf('// Prépare les deux fiches'));
const saveBlock=admin.slice(admin.indexOf('function savePersonnelLifecycle('),admin.indexOf('function genLogin('));

function context(){
  const ctx={Date,Intl};
  vm.createContext(ctx);
  vm.runInContext(authBlock,ctx);
  return ctx;
}

test('la prolongation du 22 novembre suit sans chevauchement l’arrêt clos le 21',()=>{
  const ctx=context();
  const user={_personnelPeriods:[{kind:'arret',start:'2026-10-23',end:'2026-11-21'}]};
  assert.equal(ctx.personnelCanExtendPeriod(user,'arret','2026-11-22','2026-11-21'),true);
  assert.equal(ctx.personnelCanExtendPeriod(user,'arret','2026-11-21','2026-11-21'),false);
  assert.equal(ctx.personnelCanExtendPeriod(user,'arret','2026-11-23','2026-11-21'),false);
  assert.equal(ctx.personnelCanExtendPeriod(user,'disponibilite','2026-11-22','2026-11-21'),false);
  assert.equal(ctx.personnelCanExtendPeriod(user,'arret','2026-11-22','2026-11-22'),false);
});

test('le formulaire transmet la prolongation et conserve les deux décisions',async()=>{
  const ctx=context();
  const user={l:'agent.test',_personnelPeriods:[{kind:'arret',start:'2026-10-23',end:'2026-11-21'}],
    _personnelHistory:[{status:'arret',start:'2026-10-23',end:'2026-11-21'}]};
  const fields={
    'personnel-lifecycle-status':{value:'arret'},
    'personnel-lifecycle-start':{value:'2026-11-22'},
    'personnel-lifecycle-end':{value:'2026-12-20'},
  };
  let serverCalls=0,saveCalls=0,confirmed;
  Object.assign(ctx,{
    PERSONNEL_ONLINE_GATE:true,CU:{l:'admin.test'},USERS:[user],Date,
    hasRight:()=>true,isSuperAdmin:()=>false,
    document:{getElementById:id=>fields[id]},
    personnelLocalDate:()=> '2026-11-21',
    PERSONNEL_STATUS_LABELS:{arret:'Arrêt de travail'},
    escHtml:String,fullName:()=> 'Agent Test',
    showToast:message=>{throw Error(message);},
    confirmModal:(_message,callback)=>{confirmed=callback();},
    _agaiSetPersonnelStatusServer:async()=>{serverCalls++;return {revision:3};},
    saveData:()=>{saveCalls++;},rAdm:()=>{},
  });
  ctx.showToast=()=>{};
  vm.runInContext(saveBlock,ctx);
  ctx.savePersonnelLifecycle(encodeURIComponent(user.l));
  await confirmed;
  assert.equal(serverCalls,1);
  assert.equal(saveCalls,1);
  assert.equal(user._personnelHistory.length,2);
  assert.equal(user._personnelHistory[0].end,'2026-11-21');
  assert.equal(user._personnelHistory[1].start,'2026-11-22');
  assert.equal(ctx.personnelStatusAt(user,'2026-11-21'),'arret');
  assert.equal(ctx.personnelStatusAt(user,'2026-11-22'),'arret');
});

test('le serveur conserve le début initial pour une prolongation et audite la nouvelle date',()=>{
  assert.match(migration,/p_start = v_old_end \+ 1/);
  assert.match(migration,/case when v_extension then v_old_start else p_start end/);
  assert.match(migration,/values \(v_login, v_caserne, v_old_status, p_status, p_start, p_end, v_actor\)/);
  assert.match(migration,/security invoker/);
  for(const name of ['personnelCanExtendPeriod','savePersonnelLifecycle']){
    const source=name==='personnelCanExtendPeriod'?auth:admin;
    const match=source.match(new RegExp('function '+name+'\\([\\s\\S]*?\\n}'));
    assert.ok(match,name+' absent du module');
    assert.ok(bundle.replace(/\r\n/g,'\n').includes(match[0].replace(/\r\n/g,'\n')),
      name+' différent dans le bundle');
  }
});
