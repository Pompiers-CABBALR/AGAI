const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const repair=fs.readFileSync(path.join(root,'modules/23-login-repair-js.js'),'utf8');
const animal=fs.readFileSync(path.join(root,'modules/17-animal-js.js'),'utf8');
const between=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const row=(id,data)=>({id,caserne:id.split('__')[0],type:id.split('__')[1],data,deleted:false});
function harness({pending=[],rows=[],cache=null,remote=rows,ok=true,storageError=false}={}){
  const values=new Map([['agai_rc_pending_dirty',JSON.stringify(pending)],['agai_jb_cache',cache&&JSON.stringify(cache)]]);
  const calls=[];
  const context={CU:{l:'admin',caserneId:'CIS05'},PERSONNEL_ONLINE_GATE:false,
    _rcTransportRow:r=>r,_rcSplitAll:data=>data.rows,
    localStorage:{getItem:k=>values.get(k)||null},
    SB_REST:'https://project.invalid/rest/v1',SB_KEY:'public-test-key',
    _agaiAuthFetchWithTimeout:async(url,options)=>{calls.push({url,options});return {ok,json:async()=>remote};},
    Map,Set,JSON,console,Promise,encodeURIComponent,
  };
  vm.runInNewContext(between(animal,'function _rcCanonicalSyncValue(','function _rcSentSignatureAfterProtectedPush('),context);
  vm.runInNewContext(between(repair,'let _agaiLegacyCheck=','function agaiShowLegacyPending('),context);
  context._agaiReadLegacyOutbox=async()=>{if(storageError)throw new Error('storage');return rows.map(r=>({id:r.id,row:r}));};
  vm.runInNewContext('globalThis.legacyApi={inspect:_agaiInspectLegacyPending,label:agaiLegacyPendingLabel,setResult:r=>{_agaiLegacyCheck={status:"ready",result:r};}};',context);
  return {context,values,calls,api:context.legacyApi};
}
test('un ancien marqueur sans fiche ne produit plus de message de saisie en attente',async()=>{
  const h=harness({pending:['CIS05__dispo__old']});const original=JSON.stringify([...h.values]);
  const result=await h.api.inspect('token');h.api.setResult(result);
  assert.equal(result.markers,1);assert.equal(result.items.length,0);assert.equal(h.api.label(),'');
  assert.equal(h.calls.length,0);assert.equal(JSON.stringify([...h.values]),original);
});
test('les traces techniques de connexion ne sont pas des interventions à récupérer',async()=>{
  const id='CIS05__login__session';const h=harness({pending:[id],rows:[row(id,{login:'collegue'})]});
  const result=await h.api.inspect('token');h.api.setResult(result);
  assert.equal(result.traces,1);assert.equal(h.api.label(),'');assert.equal(h.calls.length,0);
});
test('une disponibilité identique à Supabase, quel que soit l’ordre JSON, ne crée pas d’alerte',async()=>{
  const id='CIS05__dispo__week__agent';
  const h=harness({pending:[id],rows:[row(id,{login:'agent',slots:[1,2],_serverRevision:2})],remote:[row(id,{_serverRevision:3,slots:[1,2],login:'agent'})]});
  const result=await h.api.inspect('verified');h.api.setResult(result);
  assert.equal(result.matched,1);assert.equal(h.api.label(),'');
  assert.equal(h.calls[0].options.method,'GET');
  assert.equal(h.calls[0].options.headers.Authorization,'Bearer verified');
  assert.equal(h.calls[0].options.body,undefined);
});
test('une différence limitée à la présence de connexion dans la copie globale n’alerte pas',async()=>{
  const id='_GLOBAL__global__main';const h=harness({pending:[id],rows:[row(id,{CASERNES:['CIS05'],LOGIN_HISTORY:[{id:'old'}]})],remote:[row(id,{CASERNES:['CIS05'],LOGIN_HISTORY:[{id:'new'}],LOGIN_HISTORY_DELETED:{old:true}})]});
  const result=await h.api.inspect('token');h.api.setResult(result);
  assert.equal(result.matched,1);assert.equal(h.api.label(),'');
});
test('une copie métier différente reste visible et conservée sans être envoyée',async()=>{
  const id='CIS05__iv__case';const h=harness({pending:[id],rows:[row(id,{s:'terminee'})],remote:[row(id,{s:'en-cours'})]});
  const result=await h.api.inspect('token');h.api.setResult(result);
  assert.equal(result.different,1);assert.equal(h.api.label(),'1 ancienne fiche à vérifier');
  assert.equal(result.items[0].type,'iv');assert.equal(h.calls.length,1);
  assert.equal(h.values.get('agai_rc_pending_dirty'),JSON.stringify([id]));
});
test('la copie cache est aussi contrôlée si elle diffère de l’instantané durable',async()=>{
  const id='CIS05__iv__case';const h=harness({pending:[id],rows:[row(id,{s:'en-cours'})],cache:{rows:[row(id,{s:'terminee'})]},remote:[row(id,{s:'en-cours'})]});
  const result=await h.api.inspect('token');assert.equal(result.different,1);
});
test('une réponse vide sous RLS reste indéterminée, sans affirmer une saisie manquante',async()=>{
  const id='CIS05__iv__case';const h=harness({pending:[id],rows:[row(id,{s:'terminee'})],remote:[]});
  const result=await h.api.inspect('token');assert.equal(result.unknown,1);assert.equal(result.matched,0);
});
test('les fiches d’une autre caserne restent indéterminées sans requête serveur',async()=>{
  const id='CIS04__iv__case';const h=harness({pending:[id],rows:[row(id,{s:'terminee'})]});
  const result=await h.api.inspect('token');assert.equal(result.unknown,1);assert.equal(h.calls.length,0);
});
test('une panne réseau ou de stockage ne permet pas de déclarer les données synchronisées',async()=>{
  const id='CIS05__iv__case';
  for(const options of [{ok:false},{storageError:true}]){
    const h=harness({...options,pending:[id],rows:[row(id,{s:'terminee'})]});
    await assert.rejects(h.api.inspect('token'));
    assert.equal(h.values.get('agai_rc_pending_dirty'),JSON.stringify([id]));
  }
});
