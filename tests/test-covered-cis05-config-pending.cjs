const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const id = 'CIS05__config__main';
const configRow = data => ({id, caserne: 'CIS05', type: 'config', deleted: false, data});

function scenario(file, {local = {piquets: {lundi: 1}}, remote = {piquets: {lundi: 1}},
  station = 'CIS05', cacheData, changeBeforeDelete, serverOk = true, savedPendingStale = false} = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const start = source.indexOf('async function _agaiDeleteIdenticalCis05ConfigOutbox(');
  const end = source.indexOf('async function _agaiOnlinePrepareLogin(', start);
  assert.ok(start >= 0 && end > start, `${file}: correctif absent`);
  assert.match(source.slice(end, end + 1500), /_rcSelectAuthenticatedQueue\(signed.profile\)/);
  let stored = configRow(local);
  const other = {id: 'CIS03__config__main', caserne: 'CIS03', type: 'config', deleted: false, data: {piquets: {}}};
  const pending = new Set([id, other.id]);
  const storage = new Map([
    ['cache', cacheData === undefined ? JSON.stringify({config: local}) : cacheData],
    ['pending', JSON.stringify([...pending])],
  ]);
  const calls = {server: 0, deletes: 0, deferred: []};
  const db = {
    objectStoreNames: {contains: name => name === 'records'},
    transaction(_name, mode) {
      assert.equal(mode, 'readwrite');
      const tx = {
        abort() {queueMicrotask(() => tx.onabort());},
        objectStore() {return {
          get(requestedId) {
            assert.equal(requestedId, id);
            const request = {};
            queueMicrotask(() => {
              if (changeBeforeDelete) stored = configRow(changeBeforeDelete);
              request.result = stored ? {id, row: stored} : undefined;
              request.onsuccess();
            });
            return request;
          },
          delete(requestedId) {
            assert.equal(requestedId, id);
            calls.deletes++;
            stored = null;
            queueMicrotask(() => tx.oncomplete());
          },
        };},
      };
      return tx;
    },
  };
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  };
  const context = {
    RC_SEP: '__', RC_OUTBOX_STORE: 'records', RC_PENDING_DIRTY_KEY: 'pending',
    JB_CACHE_KEY: 'cache', SB_REST: 'https://example.invalid/rest/v1', SB_KEY: 'public-key',
    _rcSaving: false, _rcPulling: false, _rcPendingDirty: pending,
    _rcOpenOutboxDb: async () => db,
    _rcSyncSignature: row => JSON.stringify(canonical({data: row.data, deleted: !!row.deleted})),
    _rcSplitAll: cache => [configRow(cache.config)],
    _rcOutboxGetRows: async () => stored ? [stored, other] : [other],
    _rcClearDeferred: ids => calls.deferred.push(...ids),
    _rcPersistPendingDirty: () => {
      if (!savedPendingStale) storage.set('pending', JSON.stringify([...pending]));
    },
    _agaiAuthFetchWithTimeout: async (_url, options) => {
      calls.server++;
      assert.equal(options.headers.Authorization, 'Bearer token-test');
      assert.equal(options.cache, 'no-store');
      return {ok: serverOk, json: async () => [{...configRow(remote)}]};
    },
    localStorage: {getItem: key => storage.get(key) ?? null},
  };
  vm.runInNewContext(source.slice(start, end)
    + '\nglobalThis.clearCis05=_agaiClearCoveredCis05ConfigPending;', context);
  const signed = {profile: {caserneId: station}, session: {access_token: 'token-test'}};
  return {context, signed, pending, storage, calls, get stored() {return stored;}, original: [stored, other]};
}

for (const file of ['modules/03-security-js.js', 'app.js']) {
  test(`${file}: seul le doublon CIS05 confirmé est retiré`, async () => {
    const s = scenario(file);
    const remaining = await s.context.clearCis05(s.signed, s.original);
    assert.equal(s.stored, null);
    assert.equal(s.pending.has(id), false);
    assert.equal(s.pending.has('CIS03__config__main'), true);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'CIS03__config__main');
    assert.deepEqual(s.calls.deferred, [id]);
    assert.equal(s.calls.deletes, 1);
  });

  test(`${file}: copie serveur différente ou lecture refusée, rien n'est effacé`, async () => {
    for (const options of [{remote: {piquets: {lundi: 2}}}, {serverOk: false}]) {
      const s = scenario(file, options);
      const remaining = await s.context.clearCis05(s.signed, s.original);
      assert.equal(remaining.length, 2);
      assert.equal(s.pending.has(id), true);
      assert.equal(s.calls.deletes, 0);
    }
  });

  test(`${file}: cache plus récent, caserne étrangère ou fiche remplacée, rien n'est effacé`, async () => {
    for (const options of [
      {cacheData: JSON.stringify({config: {piquets: {lundi: 3}}})},
      {station: 'CIS03'},
      {changeBeforeDelete: {piquets: {lundi: 4}}},
    ]) {
      const s = scenario(file, options);
      await s.context.clearCis05(s.signed, s.original);
      assert.notEqual(s.stored, null);
      assert.equal(s.pending.has(id), true);
      assert.equal(s.calls.deletes, 0);
    }
  });

  test(`${file}: si le marqueur persiste, la connexion demeure bloquée`, async () => {
    const s = scenario(file, {savedPendingStale: true});
    await s.context.clearCis05(s.signed, s.original);
    assert.equal(s.calls.deletes, 1);
    assert.equal(s.pending.has(id), true);
  });
}

