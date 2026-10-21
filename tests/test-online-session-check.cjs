const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const security = fs.readFileSync(path.join(root, 'modules/03-security-js.js'), 'utf8');
const restore = fs.readFileSync(path.join(root, 'modules/05-admin-js-partie-1-2-vues-globales-superadmin.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const start = security.indexOf('async function _agaiOnlineCheckSavedSession(');
const end = security.indexOf('async function _agaiSetPersonnelStatusServer(', start);
assert.ok(start >= 0 && end > start, 'contrôle de session introuvable');
const checkSource = security.slice(start, end);

function harness() {
  const listeners = {};
  const error = { style: { display: 'none' }, textContent: '' };
  const session = {
    _agai_link_login: 'pompier.test', access_token: 'access',
    refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const state = { online: true, response: null, logoutCount: 0, fetchCount: 0, stores: [] };
  const context = {
    PERSONNEL_ONLINE_GATE: true, PERSONNEL_SECURE_CIS05_PILOT: false,
    AUTH_LINK_SESSION_KEY: 'auth', AUTH_LINK_ENDPOINT: '/account-status', SB_URL: '/supabase', SB_KEY: 'public',
    CU: { l: 'pompier.test', caserneId: 'CIS05' }, SESSION_TOKEN: 'session-1',
    _agaiAuthSession: session, _agaiOnlineAccessInFlight: false, _agaiOnlineAccessTimer: null,
    _agaiOnlineAccessReady: () => state.online,
    _agaiAuthFetchWithTimeout: async () => { state.fetchCount++; return state.response; },
    _agaiStoreAuthSession: value => { state.stores.push(value); context._agaiAuthSession = value; },
    localStorage: { getItem: () => JSON.stringify(session) },
    document: {
      hidden: false, addEventListener: (name, callback) => { listeners[name] = callback; },
      getElementById: () => error,
    },
    window: { addEventListener: (name, callback) => { listeners[name] = callback; } },
    doLogout: () => { state.logoutCount++; context.CU = null; },
    setInterval, clearInterval, console: { warn: () => {} },
  };
  vm.runInNewContext(checkSource + '\nglobalThis.checkSession=_agaiOnlineCheckSavedSession;globalThis.checkCurrent=_agaiOnlineCheckCurrent;', context);
  return { context, error, listeners, session, state };
}

function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('une coupure signalée par le téléphone conserve la session et ne lance aucune requête', async () => {
  const h = harness();
  h.state.online = false;
  await h.context.checkCurrent();
  assert.equal(h.state.logoutCount, 0);
  assert.equal(h.state.fetchCount, 0);
  assert.equal(h.context.CU.l, 'pompier.test');
  assert.doesNotMatch(security, /window\.addEventListener\('offline'/);
  assert.match(security, /window\.addEventListener\('online'[\s\S]*?_agaiOnlineCheckCurrent\(\)/);
});

test('un échec réseau, HTTP 503 ou HTTP 401 conserve la session', async () => {
  for (const failed of [
    () => { throw new Error('réseau'); },
    () => response(503, { error: 'temporarily_unavailable' }),
    () => response(401, { error: 'authentication_required' }),
  ]) {
    const h = harness();
    h.context._agaiAuthFetchWithTimeout = async () => failed();
    await h.context.checkCurrent();
    assert.equal(h.state.logoutCount, 0);
    assert.equal(h.context.CU.l, 'pompier.test');
  }
});

test('un HTTP 403 sans refus métier confirmé ne déconnecte pas le collègue', async () => {
  for (const failed of [response(403, {}), response(403, { error: 'identity_link_unavailable' })]) {
    const h = harness();
    h.state.response = failed;
    await h.context.checkCurrent();
    assert.equal(h.state.logoutCount, 0);
    assert.equal(h.context.CU.l, 'pompier.test');
  }
});

test('un refus explicite du serveur ferme la session', async () => {
  for (const denied of [
    response(403, { error: 'account_unavailable' }),
    response(403, { error: 'identity_link_invalid' }),
    response(200, { personnelEnforcementEnabled: true, canLogin: false, login: 'pompier.test', caserneId: 'CIS05' }),
  ]) {
    const h = harness();
    h.state.response = denied;
    await h.context.checkCurrent();
    assert.equal(h.state.logoutCount, 1);
    assert.match(h.error.textContent, /refusé par le serveur/);
  }
});

test('une réponse incomplète ne vaut pas refus confirmé', async () => {
  const h = harness();
  h.state.response = response(200, {});
  await h.context.checkCurrent();
  assert.equal(h.state.logoutCount, 0);
});

test('une réponse valide maintient la session sans remplacer un jeton renouvelé entre-temps', async () => {
  const h = harness();
  h.state.response = response(200, {
    personnelEnforcementEnabled: true, canLogin: true, login: 'pompier.test', caserneId: 'CIS05',
  });
  const newer = { ...h.session, access_token: 'new-access' };
  h.context._agaiAuthFetchWithTimeout = async () => {
    h.context._agaiAuthSession = newer;
    return h.state.response;
  };
  await h.context.checkCurrent();
  assert.equal(h.state.logoutCount, 0);
  assert.equal(h.context._agaiAuthSession.access_token, 'new-access');
  assert.equal(h.state.stores.length, 0);
});

test('un contrôle arrivé après la déconnexion ne réinstalle pas le jeton', async () => {
  const h = harness();
  let release;
  h.context._agaiAuthSession = null;
  h.context._agaiAuthFetchWithTimeout = () => new Promise(resolve => { release = resolve; });
  const pending = h.context.checkSession('pompier.test', 'CIS05');
  h.context.localStorage.getItem = () => null;
  release(response(200, {
    personnelEnforcementEnabled: true, canLogin: true, login: 'pompier.test', caserneId: 'CIS05',
  }));
  await pending;
  assert.equal(h.context._agaiAuthSession, null);
  assert.equal(h.state.stores.length, 0);
});

test('la restauration garde les indicateurs locaux si le serveur est momentanément indisponible', () => {
  assert.match(restore, /if\(restoredAccess==='denied'\)\{\s*try\{localStorage\.removeItem\(SESSION_STORAGE_KEY\)/);
  assert.match(restore, /Votre session locale est conservée/);
});

test('le point d’entrée de référence conserve la même protection de session', () => {
  const bundleStart = bundle.indexOf('async function _agaiOnlineCheckSavedSession(');
  const bundleEnd = bundle.indexOf('async function _agaiSetPersonnelStatusServer(', bundleStart);
  assert.equal(bundle.slice(bundleStart, bundleEnd), checkSource);
  const restoreStart = restore.indexOf('async function _restoreSessionAfterLoad(');
  const restoreEnd = restore.indexOf('function doLoginSuccess(', restoreStart);
  const bundleRestoreStart = bundle.indexOf('async function _restoreSessionAfterLoad(');
  const bundleRestoreEnd = bundle.indexOf('function doLoginSuccess(', bundleRestoreStart);
  assert.equal(bundle.slice(bundleRestoreStart, bundleRestoreEnd), restore.slice(restoreStart, restoreEnd));
});
