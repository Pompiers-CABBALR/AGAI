const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'modules/23-login-repair-js.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /onclick="agaiOpenLoginRepair\(\)"/);
assert.match(html, /modules\/23-login-repair-js\.js/);
assert.doesNotMatch(source, /\bfetch\s*\(|localStorage\.clear\s*\(|indexedDB\.deleteDatabase\s*\(/);

function browserCase({pending = '[]', memory = [], durable = 0, unavailable = false, dbMode = 'present', busy = false, online = true} = {}) {
  const values = new Map([
    ['agai_rc_pending_dirty', pending],
    ['agai_supabase_auth_v239', 'token'],
    ['agai_session_v2', 'session'],
    ['agai_server_circuit_v1', 'circuit'],
    ['agai_jb_cache', 'important cached data'],
    ['agai_data', 'important legacy data'],
  ]);
  const removed = [];
  let reloads = 0;
  const indexedDB = unavailable ? null : {
    open() {
      const request = {};
      queueMicrotask(() => {
        if (dbMode === 'error') { request.onerror(); return; }
        if (dbMode === 'absent') {
          request.transaction = {abort: () => queueMicrotask(() => request.onerror())};
          request.onupgradeneeded({oldVersion: 0});
          return;
        }
        const db = {
          objectStoreNames: {contains: name => name === 'records'},
          close() {},
          transaction() {
            const tx = {
              objectStore() {
                return {count() {
                  const countRequest = {result: durable};
                  queueMicrotask(() => tx.oncomplete());
                  return countRequest;
                }};
              },
            };
            return tx;
          },
        };
        request.result = db;
        request.onsuccess();
      });
      return request;
    },
  };
  const context = {
    Set,
    window: {indexedDB, setTimeout: callback => callback()},
    indexedDB,
    navigator: {onLine: online},
    document: {getElementById: () => null},
    location: {reload: () => reloads++},
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      removeItem: key => { removed.push(key); values.delete(key); },
    },
    RC_PENDING_DIRTY_KEY: 'agai_rc_pending_dirty',
    RC_OUTBOX_DB_NAME: 'agai-sync-outbox',
    RC_OUTBOX_STORE: 'records',
    AUTH_LINK_SESSION_KEY: 'agai_supabase_auth_v239',
    SESSION_STORAGE_KEY: 'agai_session_v2',
    AGAI_SERVER_CIRCUIT_KEY: 'agai_server_circuit_v1',
    _rcPendingDirty: new Set(memory),
    _rcSaving: busy,
    _rcPulling: false,
    _agaiStoreAuthSession: () => {},
    _agaiServerFailureCount: 2,
    _agaiServerCircuitOpenUntil: Date.now() + 10000,
    _agaiServerProbeInFlight: false,
    _agaiLoginFailureReason: '',
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source + '\nglobalThis.repairApi={inspect:_agaiInspectLoginRepair,reset:agaiResetLoginAfterCheck};', context);
  return {context, values, removed, get reloads() {return reloads;}};
}

(async () => {
  const empty = browserCase();
  assert.equal((await empty.context.repairApi.inspect()).pending, 0);
  await empty.context.repairApi.reset();
  assert.deepEqual(empty.removed.sort(), [
    'agai_server_circuit_v1', 'agai_session_v2', 'agai_supabase_auth_v239',
  ].sort());
  assert.equal(empty.values.get('agai_jb_cache'), 'important cached data');
  assert.equal(empty.values.get('agai_data'), 'important legacy data');
  assert.equal(empty.values.get('agai_rc_pending_dirty'), '[]');
  assert.equal(empty.reloads, 1);

  const absentDatabase = browserCase({dbMode: 'absent'});
  assert.equal((await absentDatabase.context.repairApi.inspect()).durable, 0);
  await absentDatabase.context.repairApi.reset();
  assert.equal(absentDatabase.reloads, 1);

  for (const options of [
    {pending: '["CIS05|iv|123"]'},
    {memory: ['CIS05|iv|123']},
    {durable: 1},
    {pending: '{bad json'},
    {unavailable: true},
    {dbMode: 'error'},
    {busy: true},
    {online: false},
  ]) {
    const blocked = browserCase(options);
    await blocked.context.repairApi.reset();
    assert.deepEqual(blocked.removed, [], `aucune suppression attendue : ${JSON.stringify(options)}`);
    assert.equal(blocked.reloads, 0);
  }
  console.log('Diagnostic de connexion : réparation ciblée seulement avec deux files lisibles et vides.');
})().catch(error => {console.error(error); process.exitCode = 1;});
