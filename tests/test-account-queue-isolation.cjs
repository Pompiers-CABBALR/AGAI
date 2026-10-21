const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.join(__dirname,'..');
const animal=fs.readFileSync(path.join(root,'modules/17-animal-js.js'),'utf8');
const security=fs.readFileSync(path.join(root,'modules/03-security-js.js'),'utf8');
const block=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function harness(){
  const values=new Map([
    ['agai_rc_pending_dirty','["CIS05__dispo__legacy"]'],
    ['agai_jb_cache','legacy cache must remain intact'],
  ]);
  const stores=new Map([['agai-sync-outbox',new Map([['legacy',{id:'CIS05__dispo__legacy',type:'dispo'}]])]]);
  const events=[];
  const context={PERSONNEL_ONLINE_GATE:true,USE_RECORDS:true,CU:null,GLOBAL_ROLE:null,CURRENT_CASERNE_ID:null,
    CASERNE_DATA:{},GLOBAL_ACCOUNTS:[],_agaiLastDataSnapshot:{old:true},
    _rcSaving:false,_rcPulling:false,_rcRecoveryPromise:null,_rcRetryTimer:null,
    _rcOutboxSnapshotTimer:null,_jbSaveTimer:null,_rcOutboxDbPromise:null,
    _rcInitialReconciliationDone:false,_rcNeedsRecoveryPull:false,_rcLastSyncError:'',_rcDirtyGeneration:0,
    _rcStopPolling:()=>{},_rcStopRealtime:()=>{},clearTimeout,
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
    _rcSplitAll:data=>data.rows||[],_buildDataObject:()=>({rows:[]}),
    _rcOutboxPutRows:async rows=>{const db=context.RC_OUTBOX_DB_NAME;if(!stores.has(db))stores.set(db,new Map());for(const row of rows)stores.get(db).set(row.id,structuredClone(row));return true;},
    _rcOutboxGetRows:async()=>Array.from(stores.get(context.RC_OUTBOX_DB_NAME)?.values()||[]),
    _agaiStoreAuthSession:session=>events.push(['session',session&&session.access_token]),syncCaserneContext:()=>{},
    _rcPull:async(...args)=>{events.push(['pull',context.CU.l,...args]);return true;},
    _agaiOnlineBootstrapLogin:async login=>({profile:{login,caserneId:'CIS05',appRole:'agent'},session:{access_token:'verified'}}),
    Set,Date,JSON,encodeURIComponent,console,
  };
  const queueSource=block(animal,'function _rcLoadPendingDirty(){','function _rcPersistDeferredDirty(){');
  vm.runInNewContext("var RC_PENDING_DIRTY_KEY='agai_rc_pending_dirty',RC_PENDING_SINCE_KEY='agai_rc_pending_since',RC_DEFERRED_DIRTY_KEY='agai_rc_deferred_dirty',RC_OUTBOX_DB_NAME='agai-sync-outbox',JB_CACHE_KEY='agai_jb_cache';\n"+queueSource+
    '\nglobalThis.queue={select:_rcSelectAuthenticatedQueue,pending:_rcPendingDirty,legacy:_rcHasLegacyPending};',context);
  vm.runInNewContext(block(security,'async function _agaiOnlinePrepareLogin(','function _agaiOnlineDiscardPreparedLogin(')+'\nglobalThis.login=_agaiOnlinePrepareLogin;',context);
  return {context,values,stores,events};
}
test('une saisie historique Android ne bloque plus la connexion et reste intacte',async()=>{
  const h=harness();const before=JSON.stringify([...h.values]);
  assert.ok(await h.context.login('operateur','password'));
  assert.equal(JSON.stringify([...h.values]),before);
  assert.equal(h.stores.get('agai-sync-outbox').has('legacy'),true);
  assert.equal(h.context.queue.legacy(),true);
  assert.deepEqual(h.events.find(e=>e[0]==='pull'),['pull','operateur',false,true,true]);
  assert.equal(h.context.queue.pending.size,0);
});
test('deux titulaires et deux casernes ne partagent ni file ni cache',async()=>{
  const h=harness();await h.context.queue.select({login:'alice',caserneId:'CIS05'});
  const aliceDb=h.context.RC_OUTBOX_DB_NAME,aliceKey=h.context.RC_PENDING_DIRTY_KEY,aliceCache=h.context.JB_CACHE_KEY;
  h.values.set(aliceKey,'["alice-action"]');
  await h.context._rcOutboxPutRows([{id:'alice-action',data:{s:'terminee'}}]);
  await h.context.queue.select({login:'bob',caserneId:'CIS05'});
  assert.notEqual(h.context.RC_OUTBOX_DB_NAME,aliceDb);assert.notEqual(h.context.JB_CACHE_KEY,aliceCache);
  assert.equal(h.context.queue.pending.size,0);assert.deepEqual(await h.context._rcOutboxGetRows(),[]);
  await h.context.queue.select({login:'alice',caserneId:'CIS04'});
  assert.notEqual(h.context.RC_OUTBOX_DB_NAME,aliceDb);assert.equal(h.context.queue.pending.size,0);
  await h.context.queue.select({login:'alice',caserneId:'CIS05'});
  assert.equal(h.context.queue.pending.has('alice-action'),true);
  assert.equal((await h.context._rcOutboxGetRows())[0].data.s,'terminee');
});
test('les actions du compte connecté ne deviennent pas une barrière de connexion',async()=>{
  const h=harness();const key='agai_rc_pending_dirty_v2:CIS05__alice';
  h.values.set(key,'["CIS05__iv__pending"]');
  h.stores.set('agai-sync-outbox-v2-CIS05__alice',new Map([['id',{id:'CIS05__iv__pending',data:{s:'terminee'}}]]));
  assert.ok(await h.context.login('alice','password'));
  assert.equal(h.context.queue.pending.has('CIS05__iv__pending'),true);
  assert.equal(h.values.get(key),'["CIS05__iv__pending"]');
  assert.equal((await h.context._rcOutboxGetRows())[0].data.s,'terminee');
});
test('la reprise du même compte conserve sa file en mémoire',async()=>{
  const h=harness();await h.context.queue.select({login:'alice',caserneId:'CIS05'});
  h.context.queue.pending.add('new-closure');
  await h.context.queue.select({login:'alice',caserneId:'CIS05'});
  assert.equal(h.context.queue.pending.has('new-closure'),true);
});
test('une saisie présente seulement dans le cache du titulaire est préservée avant réception',async()=>{
  const h=harness();h.values.set('agai_rc_pending_dirty_v2:CIS05__alice','["new-closure"]');
  h.values.set('agai_jb_cache_v2:CIS05__alice',JSON.stringify({rows:[{id:'new-closure',data:{s:'terminee'}}]}));
  await h.context.queue.select({login:'alice',caserneId:'CIS05'});
  assert.equal((await h.context._rcOutboxGetRows())[0].data.s,'terminee');
  assert.equal(h.values.get('agai_jb_cache'),'legacy cache must remain intact');
});
test('un refus Supabase reste bloquant avant tout changement de file',async()=>{
  const h=harness();h.context._agaiOnlineBootstrapLogin=async()=>null;
  assert.equal(await h.context.login('alice','wrong'),null);
  assert.equal(h.context.RC_OUTBOX_DB_NAME,'agai-sync-outbox');
  assert.deepEqual(h.events,[]);
});
test('un échec de réception n’ouvre pas de session et conserve les actions',async()=>{
  const h=harness();h.values.set('agai_rc_pending_dirty_v2:CIS05__alice','["pending"]');
  h.context._rcPull=async()=>false;
  assert.equal(await h.context.login('alice','password'),null);
  assert.equal(h.context.queue.pending.has('pending'),true);
  assert.equal(h.context.CU,null);
});
test('un compte non authentifié ne peut pas sélectionner une file vide arbitraire',async()=>{
  const h=harness();await assert.rejects(h.context.queue.select({login:'',caserneId:'CIS05'}));
  assert.equal(h.context.RC_OUTBOX_DB_NAME,'agai-sync-outbox');
});
test('la reprise après fermeture choisit la file vérifiée avant de recevoir les données',async()=>{
  const h=harness();
  const source=block(animal,'async function _agaiLoadSavedSessionData(','let _agaiSessionRestorePromise=');
  vm.runInNewContext(source+'\nglobalThis.restoreData=_agaiLoadSavedSessionData;',h.context);
  assert.equal(await h.context.restoreData({login:'alice',caserneId:'CIS05'}),true);
  assert.equal(h.context.RC_OUTBOX_DB_NAME,'agai-sync-outbox-v2-CIS05__alice');
  assert.deepEqual(h.events.find(e=>e[0]==='pull'),['pull','alice',false,true,true]);
  assert.equal(h.context.CU,null);
});
test('une réception n’écrase pas la file avec les valeurs initiales de l’interface',()=>{
  const source=block(animal,'function _rcScheduleOutboxSnapshot(){','function _rcRequestPersistentStorage(){');
  let writes=0;
  const context={_rcPulling:true,_rcOutboxSnapshotTimer:null,window:{setTimeout:()=>{writes++;}},clearTimeout};
  vm.runInNewContext(source+'\n_rcScheduleOutboxSnapshot();',context);
  assert.equal(writes,0);
});
