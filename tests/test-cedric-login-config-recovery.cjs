const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const configId = 'CIS05__config__main';
const loginId = 'CIS05__login__cedric';
const configRow = {id:configId, caserne:'CIS05', type:'config', deleted:false,
  data:{piquets:{local:'ancienne copie'}}};
const loginRow = {id:loginId, caserne:'CIS05', type:'login', deleted:false,
  data:{login:'carre.cedric'}};
const signed = {profile:{login:'carre.cedric', caserneId:'CIS05', appRole:'agent'},
  session:{access_token:'test-token'}};

function scenario(source, options = {}) {
  const entries = new Map([
    [configId, {id:configId, row:structuredClone(configRow), queuedAt:100}],
    [loginId, {id:loginId, row:{...structuredClone(loginRow),
      data:{login:options.foreignLogin ? 'autre.agent' : 'carre.cedric'}}, queuedAt:100}]
  ]);
  const stores = {'agai-sync-outbox':entries};
  const values = new Map([
    ['agai_rc_pending_dirty', JSON.stringify([configId, loginId])],
    ['agai_jb_cache', JSON.stringify({CASERNE_DATA:{CIS05:{piquets:{local:1}}}})],
    ['agai_rc_pending_since', JSON.stringify({[configId]:100})]
  ]);
  const localStorage = {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key,value) => values.set(key,String(value))
  };
  const indexedDB = {
    databases:async () => Object.keys(stores).map(name => ({name})),
    open(name,version) {
      assert.equal(version,1);
      const request = {};
      const created = !stores[name];
      const db = makeDb(name);
      queueMicrotask(() => {
        request.result = db;
        if (created) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
  function makeDb(name) {
    return {
      objectStoreNames:{contains:key => key === 'records' && !!stores[name]},
      createObjectStore() {stores[name] = new Map();}, close() {},
      transaction(_store,mode) {
        const tx = {
          aborted:false,
          abort() {this.aborted=true; queueMicrotask(() => this.onabort?.());},
          objectStore() {return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = stores[name].get(key);
                request.onsuccess?.();
              });
              return request;
            },
            put(value) {
              assert.equal(mode,'readwrite');
              if(options.failBackup && name === 'agai-sync-recovery-backups')
                throw new Error('sauvegarde impossible');
              stores[name].set(value.id,structuredClone(value));
              if(options.changeEntryAfterBackup && name === 'agai-sync-recovery-backups')
                entries.get(configId).queuedAt=101;
              queueMicrotask(() => {if(!tx.aborted)tx.oncomplete?.();});
            },
            delete(key) {
              assert.equal(mode,'readwrite');
              stores[name].delete(key);
              queueMicrotask(() => {if(!tx.aborted)tx.oncomplete?.();});
            }
          };}
        };
        return tx;
      }
    };
  }
  const pending = new Set([configId,loginId]);
  const context = {
    window:{indexedDB}, indexedDB, localStorage,
    crypto:{randomUUID:() => '00000000-0000-4000-8000-000000000001'},
    console:{warn(){}}, Date, JSON, queueMicrotask,
    RC_SEP:'__', RC_OUTBOX_DB_NAME:'agai-sync-outbox', RC_OUTBOX_STORE:'records',
    RC_PENDING_DIRTY_KEY:'agai_rc_pending_dirty', RC_PENDING_SINCE_KEY:'agai_rc_pending_since',
    RC_DEFERRED_DIRTY_KEY:'agai_rc_deferred_dirty', JB_CACHE_KEY:'agai_jb_cache',
    _rcPendingDirty:pending, _rcSaving:false, _rcPulling:false,
    _rcOpenOutboxDb:async () => makeDb('agai-sync-outbox'),
    _rcOutboxGetRows:async () => [...entries.values()].map(entry => entry.row),
    _rcClearDeferred:() => {},
    _rcPersistPendingDirty:() => localStorage.setItem('agai_rc_pending_dirty',JSON.stringify([...pending])),
    _rcCanonicalSyncValue:value => value,
    SB_REST:'https://example.supabase.co/rest/v1', SB_KEY:'public-key',
    _agaiAuthFetchWithTimeout:async () => {
      if(options.changeCacheOnRead)values.set('agai_jb_cache','nouvelle copie');
      return {ok:!options.remoteUnavailable,json:async () => [{id:configId, caserne:'CIS05',
        type:'config', deleted:false, data:{piquets:{server:'nouvelle copie'}},
        updated_at:'2026-10-19T18:49:46Z'}]};
    }
  };
  const start=source.indexOf('async function _agaiRecoverCedricConfigDuringLogin(');
  const end=source.indexOf('async function _agaiOnlinePrepareLogin(',start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start,end)
    +'\nglobalThis.recover=_agaiRecoverCedricConfigDuringLogin;',context);
  const rows=[structuredClone(configRow),{...structuredClone(loginRow),
    data:{login:options.foreignLogin ? 'autre.agent' : 'carre.cedric'}}];
  if(options.otherDurableRow)rows.push({id:'CIS05__iv__active',type:'iv',caserne:'CIS05'});
  return {context,stores,values,pending,
    recover:(profile=signed.profile) => context.recover({...signed,profile},rows)};
}

for(const file of ['modules/03-security-js.js','app.js']) {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  test(file+': connexion de Cédric sauvegarde puis retire seulement sa configuration',async () => {
    const state=scenario(source);
    const remaining=await state.recover();
    assert.equal(state.stores['agai-sync-outbox'].has(configId),false);
    assert.equal(state.stores['agai-sync-outbox'].has(loginId),true);
    assert.equal(state.stores['agai-sync-recovery-backups'].size,1);
    assert.deepEqual(JSON.parse(state.values.get('agai_rc_pending_dirty')),[loginId]);
    assert.deepEqual(Array.from(remaining,row=>row.id),[loginId]);
    const backup=[...state.stores['agai-sync-recovery-backups'].values()][0];
    assert.equal(backup.entry.row.data.piquets.local,'ancienne copie');
    assert.match(backup.cache,/local/);
  });
  test(file+': compte, rôle, sauvegarde, serveur et état local incertains restent bloqués',async () => {
    for(const options of [{failBackup:true},{remoteUnavailable:true},
      {changeCacheOnRead:true},{changeEntryAfterBackup:true},{otherDurableRow:true},
      {foreignLogin:true}]) {
      const state=scenario(source,options);
      await state.recover();
      assert.equal(state.stores['agai-sync-outbox'].has(configId),true);
      assert.equal(state.pending.has(configId),true);
    }
    for(const profile of [{...signed.profile,login:'autre.agent'},
      {...signed.profile,appRole:'administrateur_caserne'}]) {
      const state=scenario(source);
      await state.recover(profile);
      assert.equal(state.stores['agai-sync-outbox'].has(configId),true);
    }
  });
  test(file+': la connexion isole les anciennes saisies sans reprise automatique',() => {
    const prepare=source.slice(source.indexOf('async function _agaiOnlinePrepareLogin('));
    assert.match(prepare,/_rcSelectAuthenticatedQueue\(signed.profile\)/);
  });
}

for(const file of ['modules/17-animal-js.js','app.js']) {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const start=source.indexOf('function _rcCanWriteStationConfig(');
  const end=source.indexOf('function _rcRowWritableHere(',start);
  assert.ok(start>=0&&end>start);
  test(file+': un agent ne recrée pas une configuration interdite par le serveur',() => {
    for(const [role,allowed] of [['agent',false],['administrateur_caserne',true],['superadmin',true]]) {
      const context={PERSONNEL_ONLINE_GATE:true,CU:{appRole:role}};
      vm.runInNewContext(source.slice(start,end)+'\nglobalThis.allowed=_rcCanWriteStationConfig();',context);
      assert.equal(context.allowed,allowed);
    }
    assert.match(source,/if\(row\.type==='config'&&!_rcCanWriteStationConfig\(\)\)return false/);
    assert.match(source,/cid===CURRENT_CASERNE_ID&&_rcCanWriteStationConfig\(\)/);
    assert.match(source,/if\(_rcCanWriteStationConfig\(\)\s*&&\(\(Date\.now\(\)-_jbEditLock/);
  });
}

