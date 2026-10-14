const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

for (const file of ['modules/03-security-js.js', 'app.js']) {
  test(`${file}: seule une ligne globale déjà couverte est retirée de la file`, async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const start = source.indexOf('function _agaiGlobalPendingCoveredByRemote(');
    const end = source.indexOf('async function _agaiOnlinePrepareLogin(', start);
    assert.ok(start >= 0 && end > start);
    const id = '_GLOBAL__global__main';
    const local = {
      GLOBAL_ACCOUNTS: [{ l: 'admin', role: 'superadmin' }],
      CASERNES: [{ id: 'CIS05' }],
      LOGIN_HISTORY: [{ id: 'same', hConnexion: '20261014_2200' }],
      LOGIN_HISTORY_DELETED: { old: true },
    };
    const remote = {
      GLOBAL_ACCOUNTS: [{ l: 'admin', role: 'superadmin', p: 'server-secret' }],
      CASERNES: [{ id: 'CIS05' }],
      LOGIN_HISTORY: [{ id: 'same', hConnexion: '20261014_2200' }],
      LOGIN_HISTORY_DELETED: { old: true, other: true },
    };
    const row = { id, caserne: '_GLOBAL', type: 'global', data: local };
    const pending = new Set([id]);
    let durable = [row];
    let cache = JSON.stringify({ marker: 1 });
    let deleted = [];
    const context = {
      RC_SEP: '__', _rcPendingDirty: pending, JB_CACHE_KEY: 'cache',
      SB_REST: 'https://example.invalid/rest/v1', SB_KEY: 'public-key',
      localStorage: { getItem: () => cache },
      _rcCanonicalSyncValue: value => value,
      _rcSyncSignature: value => JSON.stringify(value.data),
      _rcOutboxGetRows: async () => durable,
      _rcOutboxDelete: async ids => { deleted.push(...ids); durable = []; return true; },
      _rcPersistPendingDirty: () => {},
      _agaiAuthFetchWithTimeout: async () => ({ ok: true, json: async () => [{ data: remote }] }),
      _rcSplitAll: () => [row],
    };
    vm.runInNewContext(source.slice(start, end)
      + '\nglobalThis.covered=_agaiGlobalPendingCoveredByRemote;'
      + '\nglobalThis.clear=_agaiClearCoveredGlobalPending;', context);
    assert.equal(context.covered(local, remote), true);
    assert.equal(context.covered({ ...local, CASERNES: [{ id: 'CIS06' }] }, remote), false);
    assert.equal(context.covered({ ...local, LOGIN_HISTORY: [...local.LOGIN_HISTORY, { id: 'unsent' }] }, remote), false);
    assert.equal(context.covered({ ...local, LOGIN_HISTORY_DELETED: { unsent: true } }, remote), false);

    const signed = { session: { access_token: 'test-token' } };
    const result = await context.clear(signed, durable);
    assert.equal(result.length, 0);
    assert.deepEqual(deleted, [id]);
    assert.equal(pending.has(id), false);

    pending.add(id);
    deleted = [];
    durable = [{ ...row, data: { ...local, CASERNES: [{ id: 'CIS06' }] } }];
    const blocked = await context.clear(signed, durable);
    assert.equal(blocked.length, 1);
    assert.deepEqual(deleted, []);
    assert.equal(pending.has(id), true);
  });
}
