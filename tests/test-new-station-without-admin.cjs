const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'modules/05-admin-js-partie-1-2-vues-globales-superadmin.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261106230000_admin_station_grant_current_global_v202611_0014.sql'),'utf8');
const between=(start,end)=>admin.slice(admin.indexOf(start),admin.indexOf(end,admin.indexOf(start)));

test('une caserne est créée sans mot de passe ni administrateur implicite',async()=>{
  const source=between('function addCaserne(){','function editCaserne(id){');
  const fields={
    'nc-nom':{value:'UT Nouvelle'},'nc-code':{value:'NOU'},'nc-color':{value:'#2980B9'},
    'nc-astreinte-phone':{value:''},'nc-adresse':{value:'Adresse'},
    'nc-err':{style:{display:'none'},textContent:''},'nc-create':{disabled:false},mb:{innerHTML:''},mt:{textContent:''},
    mi:{textContent:''},mo:{style:{display:'none'}},
  };
  const stations=[{id:'CIS01',code:'CUI'},{id:'CIS02',code:'DIV'}];
  const data={};
  const events=[];
  const station={id:'CIS03',nom:'UT Nouvelle',code:'NOU',couleur:'#2980B9',adresse:'Adresse',latitude:50,longitude:2};
  const ctx={document:{getElementById:id=>fields[id]},CASERNES:stations,CASERNE_DATA:data,
    isSuperAdmin:()=>true,formatCaserneAstreintePhone:value=>value,
    resolveCaserneLocation:async()=>({label:'Adresse',latitude:50,longitude:2}),
    _agaiAuthAccessToken:()=> 'token',
    _agaiAuthFetchWithTimeout:async(url,options)=>{
      events.push(['rpc',url,JSON.parse(options.body)]);
      assert.equal(stations.length,2,'aucune création locale avant confirmation serveur');
      return {ok:true,json:async()=>({id:'CIS03',station})};
    },
    SB_URL:'https://example.supabase.co',SB_KEY:'public-key',
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
  assert.match(events[0][1],/\/rest\/v1\/rpc\/agai_create_station$/);
  assert.equal(events[0][2].p_code,'NOU');
  assert.deepEqual(events[1],['save',true]);
});

test('un refus serveur ne crée ni caserne locale ni succès trompeur',async()=>{
  const source=between('function addCaserne(){','function editCaserne(id){');
  const fields={
    'nc-nom':{value:'UT Nouvelle'},'nc-code':{value:'NOU'},'nc-color':{value:'#2980B9'},
    'nc-astreinte-phone':{value:''},'nc-adresse':{value:'Adresse'},
    'nc-err':{style:{display:'none'},textContent:''},'nc-create':{disabled:false},
  };
  const stations=[{id:'CIS01',code:'CUI'}];
  let saved=false;
  const ctx={document:{getElementById:id=>fields[id]},CASERNES:stations,
    isSuperAdmin:()=>true,formatCaserneAstreintePhone:value=>value,
    resolveCaserneLocation:async()=>({label:'Adresse',latitude:50,longitude:2}),
    _agaiAuthAccessToken:()=> 'token',_agaiAuthFetchWithTimeout:async()=>({ok:false,text:async()=> 'AGAI_STATION_CODE_EXISTS'}),
    SB_URL:'https://example.supabase.co',SB_KEY:'public-key',
    saveData:()=>{saved=true;},showToast:()=>assert.fail('pas de succès avant le serveur')};
  vm.runInNewContext(source+'\nglobalThis.confirm=confirmAddCaserne;',ctx);
  await ctx.confirm();
  assert.equal(stations.length,1);
  assert.equal(saved,false);
  assert.match(fields['nc-err'].textContent,/existe déjà/);
  assert.equal(fields['nc-create'].disabled,false);
});

test('la création serveur verrouille le catalogue et évite de réutiliser un identifiant orphelin',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261106232500_create_station_rpc_v202611_0016.sql'),'utf8');
  assert.match(sql,/security invoker/);
  assert.match(sql,/actor\.app_role <> 'superadmin'/);
  assert.match(sql,/for update/);
  assert.match(sql,/select caserne as id from public\.records/);
  assert.match(sql,/catalog->'CASERNES'\|\|jsonb_build_array\(station\)/);
  assert.doesNotMatch(sql,/insert into public\.agai_identity_credentials/);
});

test('les casernes sont triées par nom dans la vue superadmin',()=>{
  const source=between('function superAdminSortedCasernes(){','function renderSuperAdmin(){');
  const stations=[{nom:'UT Lapugnoy'},{nom:'UT Divion'},{nom:'UT Isbergues'}];
  const sort=auth.slice(auth.indexOf('function sortedCasernesForDisplay('),auth.indexOf('let CURRENT_CASERNE_ID=',auth.indexOf('function sortedCasernesForDisplay(')));
  const ctx={OP_CASERNES:()=>stations};
  vm.runInNewContext(sort+source+'\nglobalThis.sorted=superAdminSortedCasernes;',ctx);
  assert.deepEqual(Array.from(ctx.sorted(),item=>item.nom),['UT Divion','UT Isbergues','UT Lapugnoy']);
  assert.equal(stations[0].nom,'UT Lapugnoy','le catalogue original reste intact');
  assert.match(admin,/const casHtml=superAdminSortedCasernes\(\)\.map/);
});

test('tous les choix de casernes sont alphabétiques et l’État-Major reste en premier',()=>{
  const sort=auth.slice(auth.indexOf('function sortedCasernesForDisplay('),auth.indexOf('let CURRENT_CASERNE_ID=',auth.indexOf('function sortedCasernesForDisplay(')));
  const ctx={};
  vm.runInNewContext(sort+'\nglobalThis.sorted=sortedCasernesForDisplay;',ctx);
  const stations=[{id:'CIS05',nom:'UT Lapugnoy'},{id:'CIS03',nom:'UT Divion'},
    {id:'EMAJ',nom:'État-Major'},{id:'CIS09',nom:'UT Isbergues'}];
  assert.deepEqual(Array.from(ctx.sorted(stations),item=>item.id),['EMAJ','CIS03','CIS09','CIS05']);
  assert.equal(stations[0].id,'CIS05');
  const files=[
    ['modules/03-security-js.js',/sortedCasernesForDisplay\(_agaiAdminStationOptions\.map/],
    ['modules/05-admin-js-partie-1-2-vues-globales-superadmin.js',/const choices=sortedCasernesForDisplay/],
    ['modules/12-astreintes-js.js',/const casOptions=sortedCasernesForDisplay/],
    ['modules/21-astreinte-tel-js.js',/const stations=sortedCasernesForDisplay/],
    ['modules/24-secure-transfers-js.js',/const casOptions=sortedCasernesForDisplay/],
    ['modules/25-report-editions-js.js',/sortedCasernesForDisplay\(CASERNES\.filter/],
  ];
  for(const [file,pattern] of files){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(source,pattern,file);
  }
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
