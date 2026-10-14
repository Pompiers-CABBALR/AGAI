const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const testCases = [];

for (const file of ['modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js', 'app.js']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const start = source.indexOf('const AGAI_RUNTIME_CONFIG=');
  const end = source.indexOf('const AUTH_LINK_ENDPOINT =', start);
  assert.ok(start >= 0 && end > start, `${file}: configuration introuvable`);
  const block = source.slice(start, end)
    + '\nglobalThis.result={mode:AUTH_LINK_MODE,gate:PERSONNEL_ONLINE_GATE,pilot:PERSONNEL_SECURE_CIS05_PILOT};';
  for (const [search, expected] of [
    ['', { mode: 'canary', gate: false, pilot: false }],
    ['?secureCis05Pilot=1', { mode: 'on', gate: true, pilot: true }],
  ]) {
    const context = {
      window: { AGAI_CONFIG: { accountLinkMode: 'canary', personnelOnlineGateEnabled: false } },
      location: { search }, URLSearchParams,
    };
    vm.runInNewContext(block, context);
    assert.equal(JSON.stringify(context.result), JSON.stringify(expected), `${file}: ${search || 'normal'}`);
  }
}

for (const file of ['modules/03-security-js.js', 'app.js']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.match(source, /PERSONNEL_SECURE_CIS05_PILOT\?'pilot_login':'login'/);
  assert.match(source, /PERSONNEL_SECURE_CIS05_PILOT\?'pilot_account_status':'account_status'/);
  const start = source.indexOf('async function _agaiOnlinePrepareLogin(');
  const end = source.indexOf('function _agaiOnlineDiscardPreparedLogin(', start);
  assert.ok(start >= 0 && end > start, `${file}: préparation de connexion introuvable`);
  const prepareSource = source.slice(start, end) + '\nglobalThis.prepare=_agaiOnlinePrepareLogin;';
  for (const [pendingId, shouldOpen] of [
    ['CIS03__iv__foreign', true],
    ['CIS05__iv__own', false],
  ]) {
    let pulls = 0;
    const context = {
      _agaiOnlineBootstrapLogin: async () => ({
        profile: { login: 'pilote', caserneId: 'CIS05', appRole: 'admin' },
        session: { access_token: 'test-token' },
      }),
      USE_RECORDS: true, RC_SEP: '__', _rcPendingDirty: new Set([pendingId]),
      _rcSaving: false, _rcPulling: false,
      _rcOutboxGetRows: async () => [{ id: pendingId, caserne: pendingId.slice(0, 5) }],
      _rcPull: async () => { pulls++; return true; },
      CU: null, GLOBAL_ROLE: null, CURRENT_CASERNE_ID: null,
      CASERNE_DATA: {}, GLOBAL_ACCOUNTS: [],
      syncCaserneContext: () => {}, _agaiStoreAuthSession: () => {},
      PERSONNEL_SECURE_CIS05_PILOT: true, console: { warn: () => {} },
    };
    vm.runInNewContext(prepareSource, context);
    // Une action étrangère reste conservée, une action CIS05 bloque la bascule.
    const result = context.prepare('pilote', 'test-password');
    assert.equal(typeof result.then, 'function');
    context.result = result;
    context.expected = shouldOpen;
    context.pulls = () => pulls;
    testCases.push(context);
  }
}

Promise.all(testCases.map(async ({ result, expected, pulls }) => {
  assert.equal(!!(await result), expected);
  assert.equal(pulls(), expected ? 1 : 0);
})).then(() => {
  console.log('Pilote CIS05 : mode normal inchangé, files étrangères préservées.');
}).catch(error => { console.error(error); process.exitCode = 1; });
