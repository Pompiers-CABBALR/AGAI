const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const animal = read('modules/17-animal-js.js');
const admin = read('modules/05-admin-js-partie-1-2-vues-globales-superadmin.js');
const auth = read('modules/04-auth-js-partie-2-2-login-session-droits.js');
const bundle = read('app.js');
const between = (source, start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `${start} introuvable`);
  return source.slice(a, b);
};

test('au rechargement sous contrôle en ligne, la reprise attend les scripts et ne lit pas le cache', () => {
  const source = between(animal, 'function loadData(){', 'function _loadClear(){');
  const events = [];
  const context = {
    PERSONNEL_ONLINE_GATE: true,
    document: { readyState: 'loading', addEventListener: (name, cb) => events.push([name, cb]) },
    localStorage: { getItem: () => { throw new Error('lecture cache avant auth'); } },
    _agaiQueueSessionRestore: () => events.push(['restored']),
  };
  vm.runInNewContext(source + '\nloadData();', context);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'DOMContentLoaded');
  events[0][1]();
  assert.equal(events[1][0], 'restored');
});

test('le chargement de reprise lit le serveur sous la bonne identité sans envoyer la file locale', async () => {
  const source = between(animal, 'async function _agaiLoadSavedSessionData(', 'let _agaiSessionRestorePromise=');
  const events = [];
  const context = {
    CU: null, GLOBAL_ROLE: null, CURRENT_CASERNE_ID: null,
    _rcSelectAuthenticatedQueue: async () => {},
    _rcOutboxGetRows: async () => [
      { id: 'ours', type: 'login', data: { login: 'pompier.test' } },
      { id: 'foreign', type: 'login', data: { login: 'autre.compte' } },
    ],
    _rcPull: async (...args) => {
      events.push([context.CU.l, context.CURRENT_CASERNE_ID, ...args]);
      return true;
    },
    syncCaserneContext: () => events.push(['reset']),
    Set,
  };
  vm.runInNewContext(source + '\nglobalThis.loadSaved=_agaiLoadSavedSessionData;', context);
  const ok = await context.loadSaved({ login: 'pompier.test', caserneId: 'CIS05', globalRole: null });
  assert.equal(ok, true);
  assert.deepEqual(events[0], ['pompier.test', 'CIS05', false, true, true]);
  assert.equal(context._rcForeignLoginPendingIds.has('foreign'), true);
  assert.equal(context._rcForeignLoginPendingIds.has('ours'), false);
  assert.equal(context.CU, null);
  assert.equal(events[1][0], 'reset');
  assert.match(animal, /_rcHasActivePending\(\)&&!skipPendingPush/);
  assert.match(animal, /_rcPendingDirty\.size&&!skipPendingPush/);
});

function restoreHarness(access = 'allowed', loaded = true) {
  const token = 'session-1';
  const stored = { token, login: 'pompier.test', caserneId: 'CIS05', globalRole: 'superadmin', expiresAt: Date.now() + 60000 };
  const events = [];
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, textContent: '', options: [], appendChild: () => {} });
    return elements.get(id);
  };
  const context = {
    CU: null, GLOBAL_ROLE: null, CURRENT_CASERNE_ID: null,
    PERSONNEL_ONLINE_GATE: true, SESSION_STORAGE_KEY: 'session',
    SESSION_TOKEN: null, SESSION_EXPIRY: 0, APP_VERSION: 'test',
    LOGIN_HISTORY: [{ id: token, login: 'pompier.test', hDeconnexion: null }],
    GLOBAL_ACCOUNTS: [], GRADES: [], _jbEditLock: 0,
    _rcPendingDirty: new Set(),
    _readStoredSession: () => stored,
    _getBgLogoutMs: () => 0,
    _agaiOnlineCheckSavedSession: async () => { events.push('access'); return access; },
    _agaiLoadSavedSessionData: async () => {
      events.push('pull');
      if (loaded) context.GLOBAL_ACCOUNTS.push({ l: stored.login, role: 'superadmin', caserneId: 'CIS05' });
      return loaded;
    },
    initCaserneData: () => {}, syncCaserneContext: () => {},
    isSessionValid: () => false, CC: () => ({ nom: 'CIS05', couleur: '#fff' }),
    setCaserneTheme: () => {}, agaiDeviceId: () => 'device',
    _persistSessionState: () => events.push('persist'), _armSessionTimers: () => {},
    _agaiScheduleAuthRefresh: () => events.push('refresh-scheduled'),
    _agaiOnlineArmChecks: () => {},
    doLoginSuccess: () => events.push('ui'),
    _rcStartRealtime: () => events.push('realtime'), _rcStartPolling: () => events.push('polling'),
    _rcScheduleRetry: () => events.push('retry'),
    saveData: () => { throw new Error('saveData inattendu'); },
    localStorage: { removeItem: () => events.push('clear') },
    _agaiStoreAuthSession: () => events.push('clearAuth'),
    document: { getElementById: element, createElement: () => ({ textContent: '' }) },
    navigator: { userAgent: 'test' },
    window: { setTimeout: () => {}, innerWidth: 1024 },
    console: { warn: () => {} },
    Date, Number,
  };
  const source = between(admin, 'async function _restoreSessionAfterLoad(){', 'function doLoginSuccess(){');
  vm.runInNewContext(source + '\nglobalThis.restore=_restoreSessionAfterLoad;', context);
  return { context, events, element, token, stored };
}

test('une actualisation vérifie, charge, puis rouvre la même session', async () => {
  const h = restoreHarness();
  assert.equal(await h.context.restore(), true);
  assert.deepEqual(h.events.slice(0, 3), ['access', 'pull', 'persist']);
  assert.ok(h.events.includes('refresh-scheduled'));
  assert.ok(h.events.indexOf('pull') < h.events.indexOf('ui'));
  assert.ok(h.events.indexOf('ui') < h.events.indexOf('polling'));
  assert.equal(h.context.SESSION_TOKEN, h.token);
  assert.equal(h.context.CU.l, 'pompier.test');
  assert.equal(h.element('lw').style.display, 'none');
  assert.equal(h.element('app').style.display, 'flex');
  assert.equal(h.events.includes('clear'), false);
});

test('panne réseau ou chargement incomplet : aucune session locale effacée ni interface ouverte', async () => {
  for (const [access, loaded] of [['unavailable', true], ['allowed', false]]) {
    const h = restoreHarness(access, loaded);
    assert.equal(await h.context.restore(), false);
    assert.equal(h.events.includes('clear'), false);
    assert.equal(h.events.includes('ui'), false);
    assert.equal(h.context.CU, null);
  }
});

test('le refus explicite du serveur demeure bloquant', async () => {
  const h = restoreHarness('denied');
  assert.equal(await h.context.restore(), false);
  assert.deepEqual(h.events, ['access', 'clear', 'clearAuth']);
});
test('le délai de 40 minutes de la caserne est chargé avant de juger une absence de 20 minutes', async () => {
  const h=restoreHarness();h.stored.backgroundAt=Date.now()-20*60000;
  h.context._getBgLogoutMs=()=>h.events.includes('pull')?40*60000:15*60000;
  assert.equal(await h.context.restore(),true);assert.equal(h.events.includes('clearAuth'),false);
});
test('un délai réellement dépassé et une session expirée pendant le chargement restent bloquants', async () => {
  const background=restoreHarness();background.stored.backgroundAt=Date.now()-45*60000;
  background.context._getBgLogoutMs=()=>40*60000;
  background.context.saveData=()=>background.events.push('expiry-audit');
  assert.equal(await background.context.restore(),false);assert.ok(background.events.includes('clearAuth'));assert.equal(background.events.includes('ui'),false);
  const expired=restoreHarness();const load=expired.context._agaiLoadSavedSessionData;
  expired.context._agaiLoadSavedSessionData=async stored=>{await load(stored);expired.stored.expiresAt=Date.now()-1;return true;};
  assert.equal(await expired.context.restore(),false);assert.equal(expired.events.includes('ui'),false);
});
test('une ancienne vérification ne peut pas effacer une session ouverte entre-temps', async () => {
  const h=restoreHarness('denied');
  h.context._agaiOnlineCheckSavedSession=async()=>{h.context._readStoredSession=()=>({...h.stored,token:'nouvelle-session'});return 'denied';};
  assert.equal(await h.context.restore(),false);assert.equal(h.events.includes('clear'),false);assert.equal(h.events.includes('clearAuth'),false);
});
test('un téléphone reverrouillé pendant le chargement attend le prochain retour au premier plan', async () => {
  const h=restoreHarness();const load=h.context._agaiLoadSavedSessionData;
  h.context._agaiLoadSavedSessionData=async stored=>{const ok=await load(stored);h.context.document.hidden=true;return ok;};
  assert.equal(await h.context.restore(),false);assert.equal(h.events.includes('ui'),false);assert.equal(h.events.includes('clear'),false);
  h.context.document.hidden=false;h.context._agaiLoadSavedSessionData=load;
  assert.equal(await h.context.restore(),true);
});

test('les modules chargés et le point d’entrée de référence ont exactement les mêmes protections', () => {
  for (const [source, start, end] of [
    [admin, 'async function _restoreSessionAfterLoad(){', 'function doLoginSuccess(){'],
    [animal, 'function loadData(){', 'function jbSyncNow(){'],
    [animal, 'async function _rcPull(silent,deferViewsUntilLogin,skipPendingPush){', 'function _rcStopPolling(){'],
  ]) {
    assert.equal(between(bundle, start, end), between(source, start, end), `${start} diffère dans app.js`);
  }
  const raceGuard = /if\(PERSONNEL_ONLINE_GATE&&_agaiSessionRestorePromise\)\{\s*await _agaiSessionRestorePromise;\s*if\(CU&&isSessionValid\(\)\)return;\s*\}/;
  assert.match(auth, raceGuard);
  assert.match(bundle, raceGuard);
});
