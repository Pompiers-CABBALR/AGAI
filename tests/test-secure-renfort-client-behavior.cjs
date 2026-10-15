const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../modules/22-renforts-auth-js.js'), 'utf8');
const saved = new Map();
const toasts = [];
let fetchCount = 0;
let finishFetch;
const sandbox = {
  SECURE_RENFORTS_ENABLED: false,
  CURRENT_CASERNE_ID: 'CIS05',
  CU: {l: 'test.admin'},
  navigator: {onLine: true},
  SB_REST: 'https://example.invalid/rest/v1',
  SB_KEY: 'public-test-key',
  _agaiAuthAccessToken: () => 'test-token',
  _agaiAuthFetchWithTimeout: () => {
    fetchCount++;
    return new Promise(resolve => {finishFetch = resolve;});
  },
  document: {
    getElementById: id => id === 'secure-renfort-send' ? {disabled: false}
      : id === 'secure-renfort-kind' ? {value: 'personnel'}
      : id === 'secure-renfort-note' ? {value: ''} : null,
    querySelectorAll: () => [{value: 'CIS03'}]
  },
  localStorage: {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: key => saved.delete(key)
  },
  crypto: {randomUUID: () => 'client-retry-key'},
  interventionById: () => ({id: 'APL_TEST', s: 'en-cours'}),
  requireCurrentUserOperationalManager: () => true,
  _rcId: () => 'CIS05__iv__APL_TEST',
  showToast: (message, level) => toasts.push({message, level}),
  cM: () => {},
  updateRenfortBadge: () => {},
  console: {warn: () => {}},
  Date, JSON, Array, Promise, Set
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
sandbox.SECURE_RENFORTS_ENABLED = true;

(async () => {
  const first = sandbox.secureRefreshRenforts(true);
  const second = sandbox.secureRefreshRenforts(true);
  assert.equal(fetchCount, 1, 'deux actualisations attendent la même lecture');
  finishFetch({ok: true, json: async () => []});
  assert.equal(await first, true);
  assert.equal(await second, true);

  const originalRefresh = sandbox.secureRefreshRenforts;
  sandbox.secureRenfortRpc = async (_name, payload) => {
    assert.equal(payload.p_request_key, 'client-retry-key');
    return {ok: true};
  };
  sandbox.secureRefreshRenforts = async () => false;
  await sandbox.secureSendRenfort('APL_TEST');
  assert.equal(saved.get('agai_renfort_action_send_APL_TEST'), 'client-retry-key');
  assert.match(toasts.at(-1).message, /enregistrée sur le serveur/);

  sandbox.secureRefreshRenforts = async () => true;
  await sandbox.secureSendRenfort('APL_TEST');
  assert.equal(saved.has('agai_renfort_action_send_APL_TEST'), false);
  assert.equal(toasts.at(-1).level, 'success');

  saved.set('agai_renfort_action_send_APL_DELAYED', 'delayed-key');
  sandbox._agaiAuthFetchWithTimeout = async () => ({ok: true, json: async () => [
    {source_caserne: 'CIS05', request_key: 'delayed-key',
      source_snapshot: {ivId: 'APL_DELAYED'}, destination_caserne: 'CIS03', status: 'en-attente'}
  ]});
  sandbox.secureRefreshRenforts = originalRefresh;
  assert.equal(await sandbox.secureRefreshRenforts(true), true);
  assert.equal(saved.has('agai_renfort_action_send_APL_DELAYED'), false);
  console.log('Renforts : lecture partagée, échec de rafraîchissement signalé, clé de reprise conservée.');
})().catch(error => {console.error(error); process.exitCode = 1;});
