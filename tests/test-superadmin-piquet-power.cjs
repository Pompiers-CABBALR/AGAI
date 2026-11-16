const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('SA actif reste administrateur même si le bouton A est désactivé',()=>{
  const source=read('modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js');
  const superAdmin=source.slice(source.indexOf('function isSuperAdmin(){'),source.indexOf('function isChefCorps(){'));
  const rights=source.slice(source.indexOf('function hasRight(r){'),source.indexOf('function isAgres(){'));
  const context={GLOBAL_ROLE:'superadmin',CU:{rights:['Administration']},window:{_adminRoleDisabled:true,_superAdminDisabled:false}};
  vm.createContext(context);vm.runInContext(superAdmin+rights,context);
  assert.equal(context.hasRight('Administration'),false);
  assert.equal(context.isAdminModeActive(),true);
});

for(const file of ['modules/12-astreintes-js.js','app.js']){
  test(file+' montre les actions Piquets au superadmin actif',()=>{
    const source=read(file);
    const start=source.indexOf('function rAstrPiquets(){');
    const end=source.indexOf('// ── Drag & drop des piquets',start);
    const render=source.slice(start,end);
    assert.match(render,/const isAdmin=isAdminModeActive\(\);/);
    assert.match(render,/const canAdd = !isPastPiquet && \(isAdmin \|\| \(isResp && !piquetsValidated\)\);/);
    assert.match(render,/const canAction = !isPastPiquet && \(isAdmin \|\| \(isResp && !piquetsValidated\)\);/);
  });
}

for(const file of ['modules/26-piquet-weekly-js.js','app.js']){
  test(file+' autorise la proposition hebdomadaire au superadmin actif',()=>{
    const source=read(file);
    const start=source.indexOf('function pqWeeklyCanEdit(wk){');
    const end=source.indexOf('function openPiquetWeekly(wk){',start);
    assert.ok(start>=0&&end>start);
    const context={
      astrPiquetWeek:0,PIQUETS_VALIDATED:{week:true},
      weekKey:()=> 'week',getMondayOfWeek:()=>new Date(),
      isRespEquipe:()=>false,isAdminModeActive:()=>true
    };
    vm.createContext(context);vm.runInContext(source.slice(start,end),context);
    assert.equal(context.pqWeeklyCanEdit('week'),true);
    context.isAdminModeActive=()=>false;
    assert.equal(context.pqWeeklyCanEdit('week'),false);
  });
}

test('le superadmin actif valide sans passer par le RPC réservé au responsable',async()=>{
  const source=read('modules/12-astreintes-js.js');
  const start=source.indexOf('let _agaiPiquetValidationRunning=false;');
  const end=source.indexOf('function exportPiquets()',start);
  const data={piquetsValidated:{},disposValidated:{}};
  let callback,remoteCalls=0,saved=0;
  const context={
    astrPiquetWeek:0,PIQUETS:{week:[{chefAgres:'chef',conducteur:''}]},
    PIQUETS_VALIDATED:data.piquetsValidated,DISPOS_VALIDATED:data.disposValidated,
    PERSONNEL_ONLINE_GATE:true,
    getMondayOfWeek:()=>new Date(),weekKey:()=> 'week',weekLabel:()=> 'semaine',
    confirmModal:(_message,action)=>{callback=action;},
    isAdminModeActive:()=>true,
    _rcValidateTeamPiquetWeek:async()=>{remoteCalls++;},
    CD:()=>data,saveData:()=>{saved++;},showToast:()=>{},rAstrPiquets:()=>{}
  };
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  context.validerPiquets();
  await callback();
  assert.equal(remoteCalls,0);
  assert.equal(saved,1);
  assert.equal(data.piquetsValidated.week,true);
  assert.equal(data.disposValidated.week,true);
});
