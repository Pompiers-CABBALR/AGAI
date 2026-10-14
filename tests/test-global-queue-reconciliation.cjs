const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

for (const file of ['modules/17-animal-js.js', 'app.js']) {
  test(`${file}: fusion sécurisée de la configuration globale en attente`, async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const mergeStart = source.indexOf('function _mergeLoginHistory(');
    const keepaliveStart = source.indexOf('function _rcPushGlobalRowKeepalive(', mergeStart);
    const protectStart = source.indexOf('async function _rcProtectSensitiveGlobalRow(');
    const nextStart = source.indexOf('async function _rcSendAtomicOperationalRow(', protectStart);
    assert.ok(mergeStart >= 0 && keepaliveStart > mergeStart && protectStart >= 0 && nextStart > protectStart);

    const remote = {
      GLOBAL_ACCOUNTS: [{ l: 'admin', p: 'empreinte-conservee' }],
      CASERNES: [{ id: 'CIS05' }],
      LOGIN_HISTORY: [{ id: 'remote-deleted', hConnexion: '20261014_2200' },
        { id: 'remote-keep', hConnexion: '20261014_2150' }],
      LOGIN_HISTORY_DELETED: { 'older-deleted': true },
    };
    const context = {
      PERSONNEL_SECURE_CIS05_PILOT: false,
      isSuperAdmin: () => true,
      _rcId: (station, type, key) => `${station}__${type}__${key}`,
      RC_REST: 'https://example.invalid/records', _sbHeaders: {},
      _agaiFetchWithTimeout: async () => ({ ok: true, json: async () => [{ data: remote }] }),
      LOGIN_HISTORY_DELETED: {}, LOGIN_HISTORY_MAX: 5000,
      loginHistoryRetentionPartition: entries => ({ kept: entries }),
      console: { warn: () => {} },
    };
    vm.runInNewContext(source.slice(mergeStart, keepaliveStart)
      + source.slice(protectStart, nextStart)
      + '\nglobalThis.protect=_rcProtectSensitiveGlobalRow;', context);

    const row = { id: '_GLOBAL__global__main', caserne: '_GLOBAL', type: 'global', data: {
      GLOBAL_ACCOUNTS: [{ l: 'admin' }],
      CASERNES: [], APL_COUNTER: 577,
      LOGIN_HISTORY: [{ id: 'local-keep', hConnexion: '20261014_2300' }],
      LOGIN_HISTORY_DELETED: { 'remote-deleted': true },
    } };
    const result = await context.protect([row]);
    assert.equal(result.length, 1);
    assert.equal(row.data.GLOBAL_ACCOUNTS[0].p, 'empreinte-conservee');
    assert.equal(row.data.CASERNES[0].id, 'CIS05');
    assert.equal(row.data.APL_COUNTER, 577);
    assert.deepEqual(Array.from(row.data.LOGIN_HISTORY, entry => entry.id).sort(), ['local-keep', 'remote-keep']);
    assert.deepEqual(Object.keys(row.data.LOGIN_HISTORY_DELETED).sort(), ['older-deleted', 'remote-deleted']);

    context.PERSONNEL_SECURE_CIS05_PILOT = true;
    assert.equal((await context.protect([row])).length, 0);
  });
}
