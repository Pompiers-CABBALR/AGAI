const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');

const root=path.join(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'modules/17-animal-js.js'),'utf8');
const bundleSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
function between(source,start,end){
  const from=source.indexOf(start);
  const to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,start+' absent');
  return source.slice(from,to);
}
function harness(source){
  const pending=new Set(['CIS05__dispo__2026-44__alice']);
  const deferred={};
  const timers=[];
  const values=new Map();
  const c={
    _rcPendingDirty:pending,_rcDeferredDirty:deferred,_rcRetryTimer:null,
    _rcRetryDelay:2500,_rcSaving:false,_rcInitialReconciliationDone:true,
    _rcPendingIdInScope:()=>true,_rcPersistPendingDirty:()=>{},
    _rcRecoverPendingQueue:async()=>true,_rcPush:()=>{},
    _rcOutboxDelete:()=>{throw new Error('La file ne doit pas être supprimée');},
    localStorage:{setItem:(key,value)=>values.set(key,value)},
    window:{setTimeout:(callback,delay)=>{timers.push(delay);return timers.length;}},
    clearTimeout:()=>{},USE_RECORDS:true,RC_DEFERRED_DIRTY_KEY:'deferred',
    Date,Number,Math,Array,Set,String,JSON,Promise,console
  };
  const functions=between(source,'function _rcPersistDeferredDirty(){','function _rcPersistPendingDirty(){')
    +between(source,'function _rcScheduleRetry(delay){','// Les photos originales et les aperçus PDF');
  vm.runInNewContext(functions+'\nglobalThis.api={defer:_rcDeferFailedRow,summary:_rcRejectedSummary,retry:_rcScheduleRetry,clear:_rcClearDeferred};',c);
  return {c,pending,deferred,timers,values};
}

for(const [label,source] of [['module',moduleSource],['bundle',bundleSource]]){
  test(label+' : un refus de droit conserve l’action sans retenter toutes les 30 secondes',()=>{
    const h=harness(source);
    const id='CIS05__dispo__2026-44__alice';
    const before=Date.now();
    assert.equal(h.c.api.defer({row:{id,type:'dispo'},status:400,detail:'AGAI_WRITE_FORBIDDEN'}),true);
    assert.equal(h.pending.has(id),true);
    assert.equal(h.deferred[id].kind,'server-refused');
    assert.equal(h.c.api.summary().count,1);
    assert.deepEqual(Array.from(h.c.api.summary().types),['dispo']);
    h.c.api.retry();
    assert.ok(h.timers[0]>=23*60*60*1000);
    assert.ok(h.timers[0]<=24*60*60*1000+1000);
    assert.ok(h.deferred[id].until>=before+24*60*60*1000);
    h.c.api.clear([id]);
    assert.equal(h.c.api.summary().count,0);
    h.c.api.retry();
    assert.equal(h.timers[1],2500);
  });
  test(label+' : une panne temporaire reste retentée après cinq minutes',()=>{
    const h=harness(source);
    h.c.api.defer({row:{id:'CIS05__dispo__2026-44__alice',type:'dispo'},status:503,detail:'Service indisponible'});
    assert.equal(h.deferred['CIS05__dispo__2026-44__alice'].kind,'temporary');
    assert.equal(h.c.api.summary().count,0);
    h.c.api.retry();
    assert.ok(h.timers[0]>=4*60*1000&&h.timers[0]<=5*60*1000+1000);
  });
  test(label+' : un refus opérationnel ne reçoit pas la quarantaine de 24 heures',()=>{
    const h=harness(source);
    h.c.api.defer({row:{id:'CIS05__dispo__2026-44__alice',type:'iv'},status:400,detail:'AGAI_WRITE_FORBIDDEN'});
    assert.equal(h.deferred['CIS05__dispo__2026-44__alice'].kind,'temporary');
  });
  test(label+' : le badge ne prétend pas que la synchronisation est réussie',()=>{
    const badge={style:{},textContent:'',title:'',onclick:null};
    const alerts=[];
    const c={
      document:{getElementById:()=>badge},
      window:{_agaiSyncHealth:{lastOkAt:null,lastErrorAt:null,lastError:'',state:'loading'}},
      _rcPendingCountInScope:()=>1,_rcPendingDirty:new Set(['CIS05__dispo__2026-44__alice']),
      _rcRejectedSummary:()=>({count:1,types:['dispo']}),_rcLastSyncError:'',
      jbSyncNow:()=>{},alert:message=>alerts.push(message),APP_VERSION:'test',Date
    };
    vm.runInNewContext(between(source,'function _jbSetStatus(state){','function saveData(immediate){')+'\nglobalThis.render=_jbSetStatus;',c);
    c.render('ok');
    assert.match(badge.textContent,/Sync KO/);
    assert.match(badge.textContent,/1 refusée/);
    badge.onclick();
    assert.match(alerts[0],/Type\(s\) : dispo/);
    assert.doesNotMatch(alerts[0],/CIS05__dispo__/);
  });
}
