const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('piquet-recovery.js');
const migration=read('supabase/migrations/20261115194500_team_lead_validate_piquet_week.sql');
const localKey='agai_jb_cache_v2:'+encodeURIComponent('CIS05__canneson.eric');
const backupKey='agai_piquet_recovery_v1:'+encodeURIComponent('CIS05__canneson.eric')+':20261116';
const authKey='agai_supabase_auth_v239';
const localPiquets=[{id:'p1',jour:'Lundi',engin:'VTU-01',chefAgres:'eric',conducteur:''}];

async function setup({local=localPiquets,remote=[],sessionLogin='canneson.eric'}={}){
  const storage={};
  if(local!==null)storage[localKey]=JSON.stringify({CASERNE_DATA:{CIS05:{piquets:{20261116:local}}}});
  storage[authKey]=JSON.stringify({_agai_link_login:sessionLogin,access_token:'test-token',expires_at:Math.floor(Date.now()/1000)+3600});
  const state={textContent:''},button={disabled:true,addEventListener(_event,callback){this.click=callback;}};
  const calls=[];
  let server=remote;
  const context={
    window:{AGAI_CONFIG:{supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'publishable'}},
    document:{getElementById:id=>id==='state'?state:button},
    localStorage:{getItem:key=>Object.hasOwn(storage,key)?storage[key]:null,setItem:(key,value)=>{storage[key]=value;}},
    fetch:async(url,options)=>{
      calls.push({url,options});
      if(url.includes('/rest/v1/records?'))return {ok:true,json:async()=>[{data:{piquets:{20261116:server},piquetsValidated:{}},deleted:false}]};
      if(url.includes('/rpc/agai_save_unvalidated_piquet_week')){
        const body=JSON.parse(options.body);
        if(JSON.stringify(body.p_expected)!==JSON.stringify(server))return {ok:false,status:409};
        server=body.p_next;return {ok:true};
      }
      throw new Error('unexpected request');
    },
    AbortController,setTimeout,clearTimeout,Date,JSON
  };
  vm.createContext(context);vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {storage,state,button,calls,getServer:()=>server};
}

test('la reprise sauvegarde avant de lire le serveur puis confirme un seul envoi ciblé',async()=>{
  const env=await setup();
  assert.deepEqual(JSON.parse(env.storage[backupKey]).piquets,localPiquets);
  assert.equal(env.button.disabled,false);
  assert.equal(env.calls.length,1);
  await env.button.click();
  assert.equal(env.calls.filter(call=>call.url.includes('/rpc/agai_save_unvalidated_piquet_week')).length,1);
  assert.deepEqual(env.getServer(),localPiquets);
  assert.match(env.state.textContent,/confirmés sur le serveur/);
  assert.ok(env.storage[localKey]);
});

test('la reprise refuse de remplacer des piquets différents déjà présents sur le serveur',async()=>{
  const env=await setup({remote:[{id:'other'}]});
  assert.equal(env.button.disabled,true);
  assert.match(env.state.textContent,/Aucun écrasement automatique/);
  assert.equal(env.calls.filter(call=>call.url.includes('/rpc/')).length,0);
  assert.ok(env.storage[backupKey]);
});

test('la reprise refuse un autre compte et un cache vide sans modifier les données',async()=>{
  const wrong=await setup({sessionLogin:'another.user'});
  assert.equal(wrong.button.disabled,true);
  assert.match(wrong.state.textContent,/session AGAI d’Éric est absente/);
  const empty=await setup({local:null});
  assert.equal(empty.button.disabled,true);
  assert.equal(empty.storage[backupKey],undefined);
  assert.equal(empty.calls.length,0);
});

test('la migration initiale exigeait une semaine complète, avec verrou et rôle',()=>{
  assert.match(migration,/team_lead_piquet_scope\(actor\.caserne_id,'config'\)/);
  assert.match(migration,/p_week < current_week/);
  assert.match(migration,/for update;/);
  assert.match(migration,/station_config\.data->'piquets'->p_week is distinct from p_expected/);
  assert.match(migration,/nullif\(btrim\(elem\.value->>'chefAgres'\),''\) is null/);
  assert.match(migration,/nullif\(btrim\(elem\.value->>'conducteur'\),''\) is null/);
  assert.match(migration,/array\['piquetsValidated',p_week\]/);
  assert.match(migration,/array\['disposValidated',p_week\]/);
  assert.match(migration,/revoke all on function public\.agai_validate_piquet_week\(text,jsonb\) from public,anon/);
  assert.match(read('modules/06-ui-js-accueil-js.js'),/typeof isSuperAdmin==='function'&&isSuperAdmin\(\)/);
  assert.match(read('app.js'),/const RC_TEAM_PIQUET_VALIDATE_RPC = SB_URL \+ '\/rest\/v1\/rpc\/agai_validate_piquet_week'/);
});

test('le responsable peut transmettre une semaine incomplète et garde sa copie en cas de conflit',async()=>{
  const moduleSource=read('modules/17-animal-js.js');
  const start=moduleSource.indexOf('const RC_TEAM_PIQUET_VALIDATE_RPC');
  const end=moduleSource.indexOf('let _rcAtomicServerState',start);
  assert.ok(start>=0&&end>start);
  let sends=0;
  const context={
    SB_URL:'https://example.supabase.co',CU:{l:'canneson.eric'},
    _rcCanWriteTeamPiquetConfig:()=>true,_sbHeaders:{},
    _agaiFetchWithTimeout:async()=>{sends++;return {ok:false,status:400,text:async()=>'{"message":"AGAI_PIQUET_REVISION_CONFLICT"}'};}
  };
  vm.createContext(context);vm.runInContext(moduleSource.slice(start,end),context);
  await assert.rejects(context._rcValidateTeamPiquetWeek('20261116',[]),/Aucun piquet valide/);
  assert.equal(sends,0);
  await assert.rejects(context._rcValidateTeamPiquetWeek('20261116',localPiquets),/pas encore identiques sur le serveur/);
  assert.equal(sends,1);
});

test('la confirmation avertit du départ non garanti avant transmission',async()=>{
  const moduleSource=read('modules/12-astreintes-js.js');
  const start=moduleSource.indexOf('let _agaiPiquetValidationRunning=false;');
  const end=moduleSource.indexOf('function exportPiquets()',start);
  assert.ok(start>=0&&end>start);
  const piquets=[{chefAgres:'eric',conducteur:''},{chefAgres:'nicolas',conducteur:'valery'}];
  const state={confirmation:'',callback:null,sent:null,toasts:[]};
  const context={
    astrPiquetWeek:0,PIQUETS:{week:piquets},PERSONNEL_ONLINE_GATE:true,
    getMondayOfWeek:()=>new Date('2026-11-16'),weekKey:()=> 'week',weekLabel:()=> '16/11',
    confirmModal:(message,callback)=>{state.confirmation=message;state.callback=callback;},
    hasRight:()=>false,_rcValidateTeamPiquetWeek:async(week,expected)=>{state.sent={week,expected};},
    _rcPull:async()=>{},showToast:(message,type)=>state.toasts.push({message,type}),
    rAstrPiquets:()=>{}
  };
  vm.createContext(context);vm.runInContext(moduleSource.slice(start,end),context);
  context.validerPiquets();
  assert.match(state.confirmation,/1 piquet\(s\) restent à compléter : départ non garanti/);
  await state.callback();
  assert.equal(state.sent.week,'week');
  assert.equal(state.sent.expected,piquets);
  assert.match(state.toasts[0].message,/validée avec 1 piquet\(s\) à compléter/);
  assert.equal(state.toasts[0].type,'warn');
  state.sent=null;
  piquets[0].conducteur='autre-agent';
  await state.callback();
  assert.equal(state.sent,null,'une modification après confirmation ne doit pas être transmise');
  assert.match(state.toasts.at(-1).message,/ont changé pendant la confirmation/);
});
