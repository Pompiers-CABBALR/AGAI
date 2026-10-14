const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

for (const file of ['modules/17-animal-js.js', 'app.js']) {
  test(`${file}: accusé de réception de la configuration globale protégée`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const start = source.indexOf('function _rcSentSignatureAfterProtectedPush(');
    const end = source.indexOf('function _rcTrackChangedRecords(', start);
    assert.ok(start >= 0 && end > start);
    assert.match(source, /sourceSignatures\[row\.id\]=_rcSyncSignature\(row\)/);
    assert.match(source, /sentSignatures\[row\.id\]=_rcSentSignatureAfterProtectedPush\(row,sourceSignatures\)/);

    const context = { _rcSyncSignature: row => JSON.stringify(row.data) };
    vm.runInNewContext(source.slice(start, end)
      + '\nglobalThis.ack=_rcSentSignatureAfterProtectedPush;', context);
    const original = { id: '_GLOBAL__global__main', caserne: '_GLOBAL', type: 'global',
      data: { GLOBAL_ACCOUNTS: [{ l: 'admin' }], LOGIN_HISTORY: [{ id: 'local' }] } };
    const baseline = context._rcSyncSignature(original);
    const protectedRow = { ...original, data: { GLOBAL_ACCOUNTS: [{ l: 'admin', p: 'server-hash' }],
      LOGIN_HISTORY: [{ id: 'local' }, { id: 'remote' }] } };
    assert.equal(context.ack(protectedRow, { [original.id]: baseline }), baseline);
    assert.notEqual(context._rcSyncSignature(protectedRow), baseline);
    assert.notEqual(context.ack(protectedRow, { [original.id]: baseline }),
      context._rcSyncSignature({ ...original, data: { ...original.data, NEW_SETTING: true } }));

    const operational = { id: 'CIS05__iv__test', caserne: 'CIS05', type: 'iv', data: { s: 'terminee' } };
    assert.equal(context.ack(operational, { [operational.id]: 'old' }),
      context._rcSyncSignature(operational));
  });
}
