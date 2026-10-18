const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const id = 'CIS05__config__main';
const loginId = 'CIS05__login__old';
const signed = {profile:{login:'dumoulin.sebastien', caserneId:'CIS05'}, session:{access_token:'test-token'}};

function scenario(source, {durable = false, failBackup = false, remoteOk = true, login = 'dumoulin.sebastien'} = {}) {
  const values = new Map([
    ['agai_rc_pending_dirty', JSON.stringify([id, loginId])],
    ['agai_jb_cache', JSON.stringify({CASERNE_DATA:{CIS05:{piquets:{local:1}}}})]
  ]);
  const localStorage = {getItem:key => values.get(key) ?? null,
    setItem:(key,value) => values.set(key,String(value))};
  const outbox = new Map(durable ? [[id,{id,row:{id,caserne:'CIS05',type:'config',deleted:false,data:{piquets:{local:1}}}}]] : []);
  const stores = {'agai-sync-outbox':outbox};
  const makeDb = name => ({
    objectStoreNames:{contains:key => key === 'records' && !!stores[name]},
    createObjectStore() {stores[name] = new Map();}, close() {},
    transaction(_name,mode) {
      const tx = {objectStore() {return {
        get(key) {
          const read = {};
          queueMicrotask(() => {read.result = stores[name].get(key); read.onsuccess?.();});
          return read;
        },
        put(value) {
          assert.equal(mode,'readwrite');
          if (failBackup) throw new Error('backup unavailable');
          stores[name].set(value.id, structuredClone(value));
          queueMicrotask(() => tx.oncomplete?.());
        }
      };}};
      return tx;
    }
  });
  const indexedDB = {
    databases:async () => Object.keys(stores).map(name => ({name})),
    open(name,version) {
      assert.equal(version,1);
      const opened = {};
      const created = !stores[name];
      const db = makeDb(name);
      queueMicrotask(() => {
        opened.result = db;
        if (created) opened.onupgradeneeded?.();
        opened.onsuccess?.();
      });
      return opened;
    }
  };
  const pending = new Set([id,loginId]);
  const context = {
    window:{indexedDB}, indexedDB, localStorage, crypto:{randomUUID:() => '00000000-0000-4000-8000-000000000001'},
    Date, JSON, console:{warn(){}}, queueMicrotask,
    RC_SEP:'__', RC_OUTBOX_DB_NAME:'agai-sync-outbox', RC_OUTBOX_STORE:'records',
    RC_PENDING_DIRTY_KEY:'agai_rc_pending_dirty', RC_PENDING_SINCE_KEY:'agai_rc_pending_since',
    RC_DEFERRED_DIRTY_KEY:'agai_rc_deferred_dirty', JB_CACHE_KEY:'agai_jb_cache',
    _rcPendingDirty:pending, _rcSaving:false, _rcPulling:false,
    _rcOpenOutboxDb:async () => makeDb('agai-sync-outbox'),
    _rcClearDeferred:() => {},
    _rcPersistPendingDirty:() => localStorage.setItem('agai_rc_pending_dirty',JSON.stringify([...pending])),
    _rcCanonicalSyncValue:value => value,
    SB_REST:'https://example.supabase.co/rest/v1', SB_KEY:'public-key',
    _agaiAuthFetchWithTimeout:async () => ({ok:remoteOk, json:async () => [{
      id,caserne:'CIS05',type:'config',deleted:false,data:{piquets:{server:1}},updated_at:'2026-10-18T18:00:00Z'
    }]})
  };
  const start = source.indexOf('async function _agaiClearOrphanCis05ConfigPending(');
  const end = source.indexOf('async function _agaiOnlinePrepareLogin(',start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start,end) + '\nglobalThis.clearOrphan=_agaiClearOrphanCis05ConfigPending;',context);
  return {context, pending, stores, values, clear:() => context.clearOrphan({...signed,profile:{...signed.profile,login}},
    durable ? [{id,caserne:'CIS05',type:'config',deleted:false,data:{}}] : [])};
}

for (const file of ['modules/03-security-js.js','app.js']) {
  const source = fs.readFileSync(path.join(root,file),'utf8');
  test(file + ': marqueur orphelin sauvegardé puis libéré pour le compte concerné', async () => {
    const state = scenario(source);
    await state.clear();
    assert.equal(state.pending.has(id),false);
    assert.equal(state.stores['agai-sync-outbox'].has(id),false);
    assert.equal(state.stores['agai-sync-recovery-backups'].size,1);
    assert.deepEqual(JSON.parse(state.values.get('agai_rc_pending_dirty')),[loginId]);
    assert.match(state.values.get('agai_jb_cache'),/local/);
  });
  test(file + ': ligne durable, autre compte ou sauvegarde impossible restent bloqués', async () => {
    for (const options of [{durable:true},{login:'autre.agent'},{failBackup:true},{remoteOk:false}]) {
      const state = scenario(source,options);
      await state.clear();
      assert.equal(state.pending.has(id),true);
      assert.deepEqual(JSON.parse(state.values.get('agai_rc_pending_dirty')),[id,loginId]);
    }
  });
  test(file + ': la connexion appelle la reprise avant la barrière de file', () => {
    const prepare = source.slice(source.indexOf('async function _agaiOnlinePrepareLogin('));
    assert.match(prepare, /_agaiClearOrphanCis05ConfigPending\(signed,/);
  });
}
