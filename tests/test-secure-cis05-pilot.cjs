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
    ['CIS05__iv__own', true],
    ['CIS05__login__foreign', true],
    ['CIS05__login__own', true],
  ]) {
    let pulls = 0;
    const context = {
      _agaiOnlineBootstrapLogin: async () => ({
        profile: { login: 'pilote', caserneId: 'CIS05', appRole: 'admin' },
        session: { access_token: 'test-token' },
      }),
      USE_RECORDS: true, RC_SEP: '__', _rcPendingDirty: new Set([pendingId]),
      _rcSaving: false, _rcPulling: false,
      _rcSelectAuthenticatedQueue: async () => {},
      _rcOutboxGetRows: async () => [{ id: pendingId, caserne: pendingId.slice(0, 5),
        type: pendingId.includes('__login__') ? 'login' : 'iv',
        data: { login: pendingId.endsWith('__own') ? 'pilote' : 'autre' } }],
      _rcDiscardPilotLoginTombstones: async rows => rows,
      _agaiClearCoveredGlobalPending: async (signed, rows) => rows,
      _agaiClearCoveredCis05ConfigPending: async (signed, rows) => rows,
      _agaiClearOrphanCis05ConfigPending: async (signed, rows) => rows,
      _agaiRecoverCedricConfigDuringLogin: async (signed, rows) => rows,
      _rcPull: async () => { pulls++; return true; },
      CU: null, GLOBAL_ROLE: null, CURRENT_CASERNE_ID: null,
      CASERNE_DATA: {}, GLOBAL_ACCOUNTS: [],
      syncCaserneContext: () => {}, _agaiStoreAuthSession: () => {},
      _rcForeignLoginPendingIds: new Set(),
      PERSONNEL_SECURE_CIS05_PILOT: true, console: { warn: () => {} },
    };
    vm.runInNewContext(prepareSource, context);
    // Les actions restent conservées et ne bloquent plus la connexion.
    const result = context.prepare('pilote', 'test-password');
    assert.equal(typeof result.then, 'function');
    context.result = result;
    context.expected = shouldOpen;
    context.pulls = () => pulls;
    testCases.push(context);
  }
}

for (const file of ['modules/17-animal-js.js', 'app.js']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  for (const functionName of ['_rcRequestRealtimePull', '_rcPush', '_rcPull']) {
    const start = source.indexOf(`function ${functionName}(`);
    const asyncStart = source.indexOf(`async function ${functionName}(`);
    const body = source.slice(Math.max(start, asyncStart), Math.max(start, asyncStart) + 300);
    assert.match(body, /PERSONNEL_ONLINE_GATE&&!_agaiAuthAccessToken\(\)/,
      `${file}: ${functionName} doit attendre la session Auth`);
  }
  const start = source.indexOf('function _rcRowWritableHere(');
  const end = source.indexOf('function _rcPendingIdInScope(', start);
  assert.ok(start >= 0 && end > start, `${file}: filtre d'écriture introuvable`);
  const context = {
    _rcSyncScopeCaserne: () => 'CIS05', PERSONNEL_ONLINE_GATE: true,
    PERSONNEL_SECURE_CIS05_PILOT: true,
    CU: { l: 'pilote', caserneId: 'CIS05' }, isSuperAdmin: () => true,
  };
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.writable=_rcRowWritableHere;', context);
  assert.equal(context.writable({ caserne: 'CIS05', type: 'login', data: { login: 'pilote' } }), true);
  assert.equal(context.writable({ caserne: 'CIS05', type: 'login', data: { login: 'autre' } }), false);
  assert.equal(context.writable({ caserne: '_GLOBAL', type: 'global', data: {} }), false);
  assert.equal(context.writable({ caserne: 'CIS05', type: 'user', data: {} }), false);
  assert.equal(context.writable({ caserne: 'CIS05', type: 'login', deleted: true, data: { login: 'pilote' } }), false);
  assert.equal(context.writable({ caserne: 'CIS05', type: 'iv', data: {} }), true);
  const scopeStart = source.indexOf('function _rcPendingIdInScope(', end);
  const scopeEnd = source.indexOf('function _rcPrunePendingDirty(', scopeStart);
  assert.ok(scopeStart >= 0 && scopeEnd > scopeStart, `${file}: filtre de file introuvable`);
  Object.assign(context, { RC_SEP: '__',
    _rcForeignLoginPendingIds: new Set(['CIS05__login__foreign']) });
  vm.runInNewContext(source.slice(scopeStart, scopeEnd) + '\nglobalThis.inScope=_rcPendingIdInScope;', context);
  assert.equal(context.inScope('CIS05__login__foreign'), false);
  assert.equal(context.inScope('CIS05__login__own'), true);
  assert.match(source, /loginRetention\.removed\.length&&GLOBAL_ROLE==='superadmin'&&!PERSONNEL_ONLINE_GATE/);
  const protectStart = source.indexOf('async function _rcProtectSensitiveGlobalRow(');
  const protectEnd = source.indexOf('async function _rcSendAtomicOperationalRow(', protectStart);
  const protectContext = { PERSONNEL_SECURE_CIS05_PILOT: true };
  vm.runInNewContext(source.slice(protectStart, protectEnd)
    + '\nglobalThis.protect=_rcProtectSensitiveGlobalRow;', protectContext);
  testCases.push({ result: protectContext.protect([
    { id: 'global', type: 'global', caserne: '_GLOBAL', data: { GLOBAL_ACCOUNTS: [] } },
    { id: 'inter', type: 'iv', caserne: 'CIS05', data: {} },
  ]).then(rows => {
    assert.deepEqual(Array.from(rows, row => row.id), ['inter']);
    return true;
  }), expected: true, pulls: () => 1 });
  const cleanupStart = source.indexOf('async function _rcDiscardPilotLoginTombstones(');
  const cleanupEnd = source.indexOf('async function _rcReconcileOutboxWithRemote(', cleanupStart);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart, `${file}: nettoyage ciblé introuvable`);
  const removed = [], pending = new Set(['old-login', 'inter']);
  const cleanupContext = {
    PERSONNEL_SECURE_CIS05_PILOT: true,
    _rcOutboxDelete: async ids => { removed.push(...ids); return true; },
    _rcPendingDirty: pending, _rcPersistPendingDirty: () => {},
  };
  vm.runInNewContext(source.slice(cleanupStart, cleanupEnd)
    + '\nglobalThis.cleanup=_rcDiscardPilotLoginTombstones;', cleanupContext);
  testCases.push({ result: cleanupContext.cleanup([
    { id: 'old-login', type: 'login', deleted: true },
    { id: 'inter', type: 'iv', deleted: false },
  ]).then(rows => {
    assert.deepEqual(removed, ['old-login']);
    assert.deepEqual(Array.from(rows, row => row.id), ['inter']);
    assert.equal(pending.has('old-login'), false);
    assert.equal(pending.has('inter'), true);
    return true;
  }), expected: true, pulls: () => 1 });
}

Promise.all(testCases.map(async ({ result, expected, pulls }) => {
  assert.equal(!!(await result), expected);
  assert.equal(pulls(), expected ? 1 : 0);
})).then(() => {
  console.log('Pilote CIS05 : mode normal inchangé, files étrangères préservées.');
}).catch(error => { console.error(error); process.exitCode = 1; });

