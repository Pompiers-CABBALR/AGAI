const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modules/17-animal-js.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261115173000_team_lead_unvalidated_piquets_only.sql'),'utf8');
function section(from,to){
  const start=source.indexOf(from),end=source.indexOf(to,start);
  assert.ok(start>=0&&end>start,from);
  return source.slice(start,end);
}

test('la règle serveur limite le responsable aux piquets non validés de sa caserne',()=>{
  assert.match(migration,/actor\.caserne_id = p_caserne/);
  assert.match(migration,/team\.data->>'resp' = actor\.login/);
  assert.match(migration,/previous - 'piquets' <> p_data - 'piquets'/);
  assert.match(migration,/previous->'piquetsValidated'->>changed_week = 'true'/);
  assert.match(migration,/for update;/);
  assert.match(migration,/station_config\.data->'piquets'->p_week is not distinct from p_next/);
  assert.match(migration,/AGAI_PIQUET_REVISION_CONFLICT/);
  assert.match(migration,/revoke all on function public\.agai_save_unvalidated_piquet_week\(text,jsonb,jsonb\) from public,anon/);
});

test('la semaine modifiée conserve sa version initiale malgré plusieurs éditions locales',()=>{
  const store={};
  const context={
    localStorage:{getItem:key=>store[key]||null,setItem:(key,value)=>{store[key]=value;}},
    PERSONNEL_ONLINE_GATE:true,CU:{l:'eric',appRole:'agent'},
    _rcCanonicalSyncValue:value=>{
      if(Array.isArray(value))return value.map(context._rcCanonicalSyncValue);
      if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,context._rcCanonicalSyncValue(value[key])]));
      return value;
    }
  };
  vm.createContext(context);
  vm.runInContext(section('function _rcCanWriteStationConfig(', 'function _rcRowWritableHere('),context);
  const prior={piquets:{20261116:[{id:'initial'}]},astrConfig:{weekStartHour:7}};
  const second={piquets:{20261116:[{id:'second'}]},astrConfig:{weekStartHour:7}};
  const final={piquets:{20261116:[{id:'final'}]},astrConfig:{weekStartHour:7}};
  context._rcTrackTeamLeadPiquetEdits(prior,second,'CIS05');
  context._rcTrackTeamLeadPiquetEdits(second,final,'CIS05');
  const pending=JSON.parse(store.agai_team_piquet_pending_v1);
  assert.equal(pending.CIS05__eric.weeks['20261116'].expected[0].id,'initial');
  assert.equal(context._rcTeamPiquetOtherSignature(prior),context._rcTeamPiquetOtherSignature(final));
  assert.notEqual(context._rcTeamPiquetOtherSignature(prior),context._rcTeamPiquetOtherSignature({...final,astrConfig:{weekStartHour:8}}));
  context.CU={l:'autre',appRole:'agent'};
  assert.equal(context._rcTeamPiquetPendingKey('CIS05'),'CIS05__autre');
});

test('un envoi responsable utilise le RPC ciblé et acquitte seulement après confirmation',async()=>{
  const captured=[];
  const row={id:'CIS05__config__main',caserne:'CIS05',type:'config',data:{piquets:{20261116:[{id:'new'}]}}};
  const pending={weeks:{20261116:{expected:[{id:'old'}]}},otherBaseline:'same'};
  const context={
    _rcTeamPiquetPending:{CIS05__eric:pending},
    _rcTeamPiquetPendingKey:()=> 'CIS05__eric',
    _rcTeamPiquetOtherSignature:()=> 'same',
    _rcCanWriteFullStationConfig:()=>false,
    _rcCanonicalSyncValue:value=>value,
    _rcTeamPiquetPersist:()=>{},
    _rcRequestRealtimePull:()=>{},
    RC_TEAM_PIQUET_RPC:'/rpc/piquets',_sbHeaders:{},PERSONNEL_ONLINE_GATE:true,
    CASERNE_DATA:{CIS05:{piquets:{20261116:[{id:'new'}]}}},
    _agaiFetchWithTimeout:async(url,options)=>{captured.push({url,body:JSON.parse(options.body)});return {ok:true};}
  };
  vm.createContext(context);
  vm.runInContext(section('async function _rcSendRowsWithIsolation(', 'async function _rcPush('),context);
  const result=await context._rcSendRowsWithIsolation([row],'eric');
  assert.equal(result.succeeded.length,1);
  assert.equal(result.failures.length,0);
  assert.equal(captured.length,1);
  assert.equal(captured[0].url,'/rpc/piquets');
  assert.equal(captured[0].body.p_expected[0].id,'old');
  assert.equal(captured[0].body.p_next[0].id,'new');
  assert.equal(context._rcTeamPiquetPending.CIS05__eric,undefined);
});
