const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const moduleSource=read('modules/08-interventions-js.js');
const bundle=read('app.js');
const migration=read('supabase/migrations/20261103141948_toggle_pending_intervention_sdis.sql');
function functionSource(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' absent');
  const from=source.slice(start-6,start)==='async '?start-6:start;
  const open=source.indexOf('{',start);let depth=0;
  for(let i=open;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(from,i+1);
  }
  throw Error(name+' incomplet');
}
function environment(response,role=true){
  const iv={id:'APL_2026_000641-Rabc',_numApl:'APL_2026_000641',s:'en-attente',
    _sdis:false,_serverRevision:3,tl:[{s:'en-attente',h:'20261103_1200'}]};
  const calls=[],toasts=[],button={disabled:false};
  const context={
    CU:{l:'admin.test'},CURRENT_CASERNE_ID:'CIS05',USE_RECORDS:true,
    navigator:{onLine:true},SB_URL:'https://example.supabase.co',SB_KEY:'test',
    document:{getElementById:id=>id==='pending-sdis-classification-send'?button:null},
    isAdminModeActive:()=>role,interventionById:id=>id===iv.id?iv:null,
    _agaiAuthAccessToken:()=> 'token',_rcPendingCountInScope:()=>0,
    _rcId:(station,type,id)=>station+'__'+type+'__'+id,
    aplCreationActionKey:()=> '11111111-1111-4111-8111-111111111111',
    clearAplCreationActionKey:()=>calls.push('clear-key'),
    _agaiAuthFetchWithTimeout:async(url,options)=>{calls.push({url,options});return response;},
    _rcPull:async()=>{iv._sdis=true;return true;},oM:id=>calls.push(['open',id]),
    showToast:(message,level)=>toasts.push([message,level])
  };
  vm.createContext(context);
  vm.runInContext('const _pendingSdisClassificationInFlight=new Set();',context);
  for(const name of ['canClassifyPendingInterventionSdis','confirmPendingSdisClassification'])
    vm.runInContext(functionSource(moduleSource,name),context);
  return {context,iv,calls,toasts,button};
}

test('le contrôle serveur garde la même fiche en attente et trace le changement',()=>{
  assert.match(migration,/where id=p_record_id and type='iv' and not deleted for update/);
  assert.match(migration,/source_row\.data->>'s' is distinct from 'en-attente'/);
  assert.match(migration,/actor\.app_role not in \('superadmin','administrateur_caserne'\)/);
  assert.match(migration,/source_row\.caserne<>actor\.caserne_id/);
  assert.match(migration,/source_revision<>p_expected_record_revision/);
  assert.match(migration,/'_sdis',p_sdis/);
  assert.match(migration,/'s','modif','h',stamp,'who',actor\.login/);
  assert.match(migration,/perform public\.agai_atomic_upsert_record\(\s*p_record_id,source_row\.caserne,'iv'/);
  assert.doesNotMatch(migration,/allocateNewApl|insert into public\.records/);
  assert.match(migration,/grant execute on function public\.agai_toggle_pending_intervention_sdis\([\s\S]*?to authenticated/);
});

test('le bouton est réservé aux admins actifs et aux fiches en attente',()=>{
  const env=environment({ok:true});
  assert.equal(env.context.canClassifyPendingInterventionSdis(env.iv),true);
  env.iv.s='selectionne';assert.equal(env.context.canClassifyPendingInterventionSdis(env.iv),false);
  env.iv.s='en-attente';env.iv._isRenfort=true;
  assert.equal(env.context.canClassifyPendingInterventionSdis(env.iv),false);
  assert.equal(environment({ok:true},false).context.canClassifyPendingInterventionSdis(env.iv),false);
  assert.match(moduleSource,/pendingSdisClassificationHtml=!pilpScope&&canClassifyPendingInterventionSdis\(iv\)/);
});

test('la confirmation ne modifie aucune donnée locale avant accord serveur',async()=>{
  const response={ok:true,json:async()=>({ok:true,recordId:'CIS05__iv__APL_2026_000641-Rabc',sdis:true})};
  const env=environment(response);
  const work=env.context.confirmPendingSdisClassification(env.iv.id,true);
  assert.equal(env.iv._sdis,false);
  assert.equal(env.iv.s,'en-attente');
  assert.equal(env.iv.tl.length,1);
  await work;
  const payload=JSON.parse(env.calls[0].options.body);
  assert.equal(payload.p_record_id,'CIS05__iv__APL_2026_000641-Rabc');
  assert.equal(payload.p_sdis,true);
  assert.equal(payload.p_expected_record_revision,3);
  assert.deepEqual(env.calls.at(-1),['open',env.iv.id]);
  assert.equal(env.toasts.at(-1)[1],'success');
});

test('un refus serveur laisse la fiche intacte',async()=>{
  const env=environment({ok:false,status:409,json:async()=>({message:'AGAI_SDIS_CLASSIFICATION_STALE_SOURCE'})});
  await env.context.confirmPendingSdisClassification(env.iv.id,true);
  assert.equal(env.iv._sdis,false);
  assert.equal(env.iv.tl.length,1);
  assert.equal(env.calls.length,1);
  assert.match(env.toasts.at(-1)[0],/a changé/);
});

test('les deux points d’entrée embarquent exactement la même logique',()=>{
  for(const name of ['canClassifyPendingInterventionSdis','showPendingSdisClassification','confirmPendingSdisClassification'])
    assert.equal(functionSource(bundle,name),functionSource(moduleSource,name),name);
  assert.match(bundle,/pendingSdisClassificationHtml=!pilpScope&&canClassifyPendingInterventionSdis\(iv\)/);
});
