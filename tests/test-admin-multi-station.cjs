const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sql=read('supabase/migrations/20261106210444_admin_multi_station_access_v202611_0013.sql');
const edge=read('supabase/functions/agai-account-link/index.ts');
const security=read('modules/03-security-js.js');
const animal=read('modules/17-animal-js.js');
const superAdmin=read('modules/05-admin-js-partie-1-2-vues-globales-superadmin.js');
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('les droits sont attribués uniquement au compte admin lié, par caserne, avec audit serveur',()=>{
  assert.match(sql,/create table public\.agai_admin_station_grants/);
  assert.match(sql,/primary key \(login, caserne_id\)/);
  assert.match(sql,/create table public\.agai_admin_station_grant_audit/);
  assert.match(sql,/create trigger agai_audit_admin_station_grant/);
  assert.match(sql,/c\.app_role='administrateur_caserne'/);
  assert.match(sql,/new\.changed_by and c\.active and c\.app_role='superadmin'/);
  assert.match(sql,/enable row level security/g);
  assert.doesNotMatch(sql,/grant (?:select|insert|update|delete).* to authenticated/i);
  assert.match(edge,/mode === 'admin_station_grant' \|\| mode === 'admin_station_grant_history'/);
  assert.match(edge,/callerRole !== 'superadmin'/);
  assert.match(edge,/callerLink\.auth_user_id !== caller\.data\.user\.id/);
  assert.match(edge,/target\.app_role !== 'administrateur_caserne'/);
});

test('une caserne non accordée est refusée, et la caserne d’origine reste inchangée',()=>{
  assert.match(sql,/x-agai-admin-caserne/);
  assert.match(sql,/g\.login=c\.login and g\.caserne_id=requested\.caserne_id and g\.active/);
  assert.match(edge,/requestedStation[\s\S]*?agai_admin_station_grants[\s\S]*?\.eq\('active', true\)/);
  assert.match(edge,/return json\(\{ error: 'admin_station_not_allowed' \}, 403\)/);
  assert.match(edge,/homeStation: callerStation/);
  assert.match(security,/CURRENT_CASERNE_ID=previous;[\s\S]*?agaiApplyAdminStationHeader\(\);syncCaserneContext\(\)/);
});

test('la vue superadmin regroupe les casernes accordées sans créer de fiche de personnel',()=>{
  const source=between(superAdmin,'function superAdminAdminOverview(){','function renderSuperAdminAdminOverview(){');
  const ctx={CASERNES:[{id:'CIS01',nom:'Une'},{id:'CIS02',nom:'Deux'}],
    CASERNE_DATA:{CIS01:{users:[]},CIS02:{users:[]}},
    OP_CASERNES:()=>ctx.CASERNES,getCaserneAdmins:()=>[],
    SUPERADMIN_ACCESS_AUDIT:{accounts:[{login:'admin.test',firstName:'Admin',lastName:'Test',caserneId:'CIS01',appRole:'administrateur_caserne',adminStations:['CIS02'],linkStatus:'linked'}]},Map};
  vm.runInNewContext(source+'\nglobalThis.overview=superAdminAdminOverview;',ctx);
  const rows=ctx.overview();
  assert.equal(rows.length,1);
  assert.deepEqual(Array.from(rows[0].stations),['CIS01','CIS02']);
  assert.equal(ctx.CASERNE_DATA.CIS02.users.length,0);
});

test('le changement de caserne attend une file vide et conserve les autres copies locales',()=>{
  assert.match(security,/_rcSaving\|\|_rcPulling\|\|_rcHasActivePending\(\)/);
  assert.match(animal,/if\(CU&&CU\.appRole==='administrateur_caserne'\)Object\.keys\(CASERNE_DATA\|\|\{\}\)/);
  assert.match(animal,/data\.CASERNE_DATA\[cid\]=CASERNE_DATA\[cid\]/);
  assert.match(animal,/function agaiApplyAdminStationHeader\(\)/);
  assert.match(animal,/delete _sbHeaders\['x-agai-admin-caserne'\]/);
  const writable=between(animal,'function _rcRowWritableHere(row){','function _rcPendingIdInScope(id){');
  const ctx={PERSONNEL_ONLINE_GATE:true,PERSONNEL_SECURE_CIS05_PILOT:false,
    CU:{l:'admin.test',caserneId:'CIS01',appRole:'administrateur_caserne'},
    _rcCanWriteStationConfig:()=>true,_rcSyncScopeCaserne:()=> 'CIS02',
    isSuperAdmin:()=>false};
  vm.runInNewContext(writable+'\nglobalThis.writable=_rcRowWritableHere;',ctx);
  assert.equal(ctx.writable({type:'login',caserne:'CIS01',data:{login:'admin.test'}}),false);
  assert.equal(ctx.writable({type:'login',caserne:'CIS02',data:{login:'admin.test'}}),true);
  assert.equal(ctx.writable({type:'iv',caserne:'CIS01'}),false);
  assert.equal(ctx.writable({type:'iv',caserne:'CIS02'}),true);
});

test('un changement refusé ou une file en attente ne quitte pas la caserne d’origine',async()=>{
  const source=between(security,'async function agaiSwitchAdminStation(target){',"document.addEventListener('visibilitychange'");
  const elements={
    'admin-station-switch':{value:'CIS01'},
    mo:{style:{display:'none'}},mt:{textContent:''},mi:{textContent:''},mb:{textContent:''},t2u:{textContent:''},
  };
  const events=[];
  const ctx={CU:{l:'admin.test',caserneId:'CIS01',appRole:'administrateur_caserne'},
    CURRENT_CASERNE_ID:'CIS01',SESSION_TOKEN:'session',
    _agaiAdminStationOptions:['CIS01','CIS02'],_agaiAdminStationOptionsLogin:'admin.test',
    _agaiAdminStationSwitching:false,_rcSaving:false,_rcPulling:false,
    _rcHasActivePending:()=>true,isAdminModeActive:()=>true,
    document:{getElementById:id=>elements[id]},
    showToast:message=>events.push(message),agaiApplyAdminStationHeader:()=>events.push('header'),
    _rcPull:async()=>false,syncCaserneContext:()=>events.push('context'),
    _rcRefreshRealtimeScope:()=>events.push('realtime'),_agaiDrawAdminStationPicker:()=>{},
    _reloadActiveView:()=>{},cM:()=>{elements.mo.style.display='none';},
    CASERNE_DATA:{CIS01:{}},CASERNES:[{id:'CIS01',nom:'Une'},{id:'CIS02',nom:'Deux'}]};
  vm.runInNewContext(source+'\nglobalThis.switchStation=agaiSwitchAdminStation;',ctx);
  await ctx.switchStation('CIS02');
  assert.equal(ctx.CURRENT_CASERNE_ID,'CIS01');
  assert.equal(events.includes('header'),false);
  ctx._rcHasActivePending=()=>false;
  await ctx.switchStation('CIS02');
  assert.equal(ctx.CURRENT_CASERNE_ID,'CIS01');
  assert.deepEqual(events.filter(event=>event==='header'),['header','header']);
  assert.equal(ctx._agaiAdminStationSwitching,false);
});
