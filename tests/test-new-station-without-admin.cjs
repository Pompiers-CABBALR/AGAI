const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'modules/05-admin-js-partie-1-2-vues-globales-superadmin.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261106230000_admin_station_grant_current_global_v202611_0014.sql'),'utf8');
const between=(start,end)=>admin.slice(admin.indexOf(start),admin.indexOf(end,admin.indexOf(start)));

test('une caserne est créée sans mot de passe ni administrateur implicite',async()=>{
  const source=between('function addCaserne(){','function editCaserne(id){');
  const fields={
    'nc-nom':{value:'UT Nouvelle'},'nc-code':{value:'NOU'},'nc-color':{value:'#2980B9'},
    'nc-astreinte-phone':{value:''},'nc-adresse':{value:'Adresse'},
    'nc-err':{style:{display:'none'},textContent:''},mb:{innerHTML:''},mt:{textContent:''},
    mi:{textContent:''},mo:{style:{display:'none'}},
  };
  const stations=[{id:'CIS01',code:'CUI'},{id:'CIS02',code:'DIV'}];
  const data={};
  const events=[];
  const ctx={document:{getElementById:id=>fields[id]},CASERNES:stations,CASERNE_DATA:data,
    isSuperAdmin:()=>true,formatCaserneAstreintePhone:value=>value,
    resolveCaserneLocation:async()=>({label:'Adresse',latitude:50,longitude:2}),
    initCaserneData:id=>{data[id]={users:[],adminLogins:[],adminLogin:''};},
    setCaserneStationLocation:()=>{},saveData:immediate=>events.push(['save',immediate]),
    cM:()=>{},renderSuperAdmin:()=>{},showToast:message=>events.push(message)};
  vm.runInNewContext(source+'\nglobalThis.add=addCaserne;globalThis.confirm=confirmAddCaserne;',ctx);
  ctx.add();
  assert.doesNotMatch(fields.mb.innerHTML,/nc-pwd|Mot de passe admin caserne/);
  await ctx.confirm();
  assert.equal(stations.length,3);
  assert.equal(stations[2].id,'CIS03');
  assert.deepEqual(Array.from(data.CIS03.users),[]);
  assert.deepEqual(Array.from(data.CIS03.adminLogins),[]);
  assert.deepEqual(events[0],['save',true]);
});

test('la carte de caserne montre les admins locaux et délégués, sans créer de fiche',()=>{
  const source=between('function superAdminAdminOverview(){','function renderSuperAdminAdminOverview(){');
  const ctx={CASERNES:[{id:'CIS01',nom:'Une'},{id:'CIS02',nom:'Deux'}],
    CASERNE_DATA:{CIS01:{users:[{l:'local.admin',prenom:'Local',nom:'Admin',caserneId:'CIS01'}]},CIS02:{users:[]}},
    OP_CASERNES:()=>ctx.CASERNES,
    getCaserneAdmins:id=>id==='CIS01'?ctx.CASERNE_DATA.CIS01.users:[],
    SUPERADMIN_ACCESS_AUDIT:{accounts:[
      {login:'local.admin',firstName:'Local',lastName:'Admin',caserneId:'CIS01',appRole:'administrateur_caserne',adminStations:[],linkStatus:'linked'},
      {login:'remote.admin',firstName:'Remote',lastName:'Admin',caserneId:'CIS02',appRole:'administrateur_caserne',adminStations:['CIS01'],linkStatus:'linked'},
    ]},Map,escHtml:value=>String(value)};
  vm.runInNewContext(source+'\nglobalThis.summary=renderSuperAdminStationAdmins;',ctx);
  const summary=ctx.summary('CIS01');
  assert.match(summary,/Local Admin/);
  assert.match(summary,/Remote Admin/);
  assert.match(summary,/Depuis Deux/);
  assert.equal(ctx.CASERNE_DATA.CIS01.users.length,1);
});

test('le droit multi-casernes vérifie la liste actuelle des casernes publiées',()=>{
  assert.match(migration,/from public\.records d/);
  assert.match(migration,/d\.id='_GLOBAL__global__main'/);
  assert.match(migration,/not d\.deleted/);
  assert.doesNotMatch(migration,/from public\.caserne_data/);
  assert.doesNotMatch(migration,/insert into public\.agai_admin_station_grants/);
});
