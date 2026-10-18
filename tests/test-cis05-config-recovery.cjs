const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'securite-cis05-config-reprise.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'securite-cis05-config-reprise.js'), 'utf8');
assert.match(html, /securite-cis05-config-reprise\.js/);
assert.doesNotMatch(source, /deleteDatabase\s*\(|localStorage\.clear\s*\(|\.clear\s*\(/);
assert.doesNotMatch(source, /\/rest\/v1\/records[^\n]*method\s*:\s*['"](?:POST|PATCH|DELETE)/);

function scenario({changeRemoteOnSecondRead = false, failBackup = false} = {}) {
  const id = 'CIS05__config__main';
  const loginId = 'CIS05__login__old';
  const entry = {id, row:{id, caserne:'CIS05', type:'config', deleted:false, data:{piquets:{local:1}}}, queuedAt:100};
  const stores = {'agai-sync-outbox':new Map([[id, entry]])};
  const values = new Map([
    ['agai_rc_pending_dirty', JSON.stringify([id, loginId])],
    ['agai_jb_cache', JSON.stringify({CASERNE_DATA:{CIS05:{piquets:{local:1}}}})],
    ['agai_rc_pending_since', JSON.stringify({[id]:100})]
  ]);
  const localStorage = {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => values.set(key, String(value))
  };
  const indexedDB = {
    databases:async () => Object.keys(stores).map(name => ({name})),
    open(name, version) {
      assert.equal(version, 1);
      const request = {};
      const created = !stores[name];
      const db = {
        objectStoreNames:{contains:store => store === 'records' && !!stores[name]},
        createObjectStore(store) { assert.equal(store, 'records'); stores[name] = new Map(); },
        close() {},
        transaction(_store, mode) {
          const tx = {
            aborted:false,
            abort() { this.aborted = true; queueMicrotask(() => this.onabort?.()); },
            objectStore() {
              return {
                get(key) {
                  const read = {};
                  queueMicrotask(() => {
                    read.result = stores[name].get(key);
                    read.onsuccess?.();
                  });
                  return read;
                },
                put(value) {
                  assert.equal(mode, 'readwrite');
                  if (failBackup && name === 'agai-sync-recovery-backups') throw new Error('backup failure');
                  stores[name].set(value.id, structuredClone(value));
                  queueMicrotask(() => { if (!tx.aborted) tx.oncomplete?.(); });
                },
                delete(key) {
                  assert.equal(mode, 'readwrite');
                  stores[name].delete(key);
                  queueMicrotask(() => { if (!tx.aborted) tx.oncomplete?.(); });
                }
              };
            }
          };
          return tx;
        }
      };
      queueMicrotask(() => {
        request.result = db;
        if (created) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
  const elements = {};
  for (const key of ['check-form','check-button','recovery-button','confirm-area','no-edit','login','password','result']) {
    elements[key] = {disabled:false, hidden:key === 'confirm-area', checked:false, value:'', textContent:'',
      addEventListener(_event, fn) { this.listener = fn; }};
  }
  elements.login.value = 'dumoulin.sebastien';
  elements.password.value = 'test-secret';
  let remoteReads = 0;
  const fetch = async (url, options) => {
    if (url.endsWith('/functions/v1/agai-account-link')) {
      const mode = JSON.parse(options.body).mode;
      if (mode === 'login') return {ok:true, json:async () => ({
        personnelEnforcementEnabled:true, login:'dumoulin.sebastien', caserneId:'CIS05',
        profile:{login:'dumoulin.sebastien', caserneId:'CIS05'}, session:{access_token:'test-token'}
      })};
      assert.equal(mode, 'account_status');
      return {ok:true, json:async () => ({canLogin:true, login:'dumoulin.sebastien', caserneId:'CIS05'})};
    }
    assert.equal(options.method, 'GET');
    assert.match(url, /\/rest\/v1\/records\?id=eq\.CIS05__config__main/);
    remoteReads++;
    return {ok:true, json:async () => [{id, caserne:'CIS05', type:'config', deleted:false,
      data:{piquets:{server:changeRemoteOnSecondRead && remoteReads > 1 ? 3 : 2}},
      updated_at:changeRemoteOnSecondRead && remoteReads > 1 ? '2026-10-18T20:00:00Z' : '2026-10-18T06:42:57Z'}]};
  };
  vm.runInNewContext(source, {
    window:{AGAI_CONFIG:{supabaseUrl:'https://example.supabase.co', supabasePublishableKey:'public-key'}, indexedDB},
    document:{getElementById:key => elements[key]}, indexedDB, localStorage, fetch,
    crypto:{randomUUID:() => '00000000-0000-4000-8000-000000000001'},
    AbortController, setTimeout, clearTimeout, Date, queueMicrotask
  });
  return {
    elements, stores, values,
    check:() => elements['check-form'].listener({preventDefault(){}}),
    recover:() => {
      elements['no-edit'].checked = true;
      elements['no-edit'].listener();
      elements.password.value = 'test-secret';
      return elements['recovery-button'].listener();
    }
  };
}

(async () => {
  const success = scenario();
  await success.check();
  assert.equal(success.elements['confirm-area'].hidden, false);
  await success.recover();
  assert.match(success.elements.result.textContent, /sauvegardée et libérée/);
  assert.equal(success.stores['agai-sync-outbox'].has('CIS05__config__main'), false);
  assert.equal(success.stores['agai-sync-recovery-backups'].size, 1);
  assert.deepEqual(JSON.parse(success.values.get('agai_rc_pending_dirty')), ['CIS05__login__old']);
  assert.match(success.values.get('agai_jb_cache'), /local/);
  assert.equal(success.elements.password.value, '');

  const changedServer = scenario({changeRemoteOnSecondRead:true});
  await changedServer.check();
  await changedServer.recover();
  assert.match(changedServer.elements.result.textContent, /serveur a changé/);
  assert.equal(changedServer.stores['agai-sync-outbox'].has('CIS05__config__main'), true);
  assert.equal(changedServer.stores['agai-sync-recovery-backups'], undefined);

  const failedBackup = scenario({failBackup:true});
  await failedBackup.check();
  await failedBackup.recover();
  assert.match(failedBackup.elements.result.textContent, /Reprise non terminée/);
  assert.equal(failedBackup.stores['agai-sync-outbox'].has('CIS05__config__main'), true);
  assert.deepEqual(JSON.parse(failedBackup.values.get('agai_rc_pending_dirty')),
    ['CIS05__config__main','CIS05__login__old']);

  const changedLocal = scenario();
  await changedLocal.check();
  changedLocal.stores['agai-sync-outbox'].set('CIS05__config__main', {
    id:'CIS05__config__main', queuedAt:101,
    row:{id:'CIS05__config__main', caserne:'CIS05', type:'config', deleted:false,
      data:{piquets:{newLocal:1}}}
  });
  await changedLocal.recover();
  assert.match(changedLocal.elements.result.textContent, /copie locale a changé/);
  assert.equal(changedLocal.stores['agai-sync-outbox'].has('CIS05__config__main'), true);
  assert.equal(changedLocal.stores['agai-sync-recovery-backups'], undefined);

  const otherAccount = scenario();
  otherAccount.elements.login.value = 'autre.agent';
  await otherAccount.check();
  assert.match(otherAccount.elements.result.textContent, /réservé au compte concerné/);
  assert.equal(otherAccount.stores['agai-sync-recovery-backups'], undefined);
  assert.equal(otherAccount.stores['agai-sync-outbox'].has('CIS05__config__main'), true);
  console.log('Reprise CIS05 : sauvegarde vérifiée, suppression ciblée, arrêt si le serveur change.');
})().catch(error => {console.error(error); process.exitCode = 1;});
