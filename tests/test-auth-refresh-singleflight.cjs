const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const moduleSource = fs.readFileSync(path.join(root, 'modules/03-security-js.js'), 'utf8');
const bundleSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const segment = source => {
  const start = source.indexOf('let _agaiAuthRefreshInFlight=null;');
  const end = source.indexOf('// La session locale ne suffit plus', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
};

function harness() {
  const oldSession = {
    _agai_link_login: 'pompier.test', access_token: 'old-access',
    refresh_token: 'old-refresh', expires_at: 1,
  };
  let savedSession = oldSession;
  let resolveFetch;
  let fetchCount = 0;
  let storeCount = 0;
  const context = {
    _agaiAuthSession: oldSession,
    AUTH_LINK_SESSION_KEY: 'auth', SB_URL: '/supabase', SB_KEY: 'public',
    _agaiAuthFetchWithTimeout: async () => {
      fetchCount++;
      return await new Promise(resolve => { resolveFetch = resolve; });
    },
    localStorage: { getItem: () => JSON.stringify(savedSession) },
    _agaiStoreAuthSession: session => {
      storeCount++;
      savedSession = session;
      context._agaiAuthSession = session;
    },
  };
  vm.runInNewContext(segment(moduleSource)
    + '\nglobalThis.refreshOnce=_agaiRefreshSessionOnce;', context);
  return {
    context, oldSession,
    reply: (status, body) => resolveFetch({
      ok: status >= 200 && status < 300,
      json: async () => body,
    }),
    get fetchCount() { return fetchCount; },
    get storeCount() { return storeCount; },
    clearSaved: () => { savedSession = null; context._agaiAuthSession = null; },
  };
}

test('un seul renouvellement pour deux contrôles simultanés', async () => {
  const h = harness();
  const first = h.context.refreshOnce('pompier.test', h.oldSession);
  const second = h.context.refreshOnce('pompier.test', h.oldSession);
  assert.equal(h.fetchCount, 1);
  h.reply(200, { access_token: 'new-access', refresh_token: 'new-refresh', expires_at: 2 });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.access_token, 'new-access');
  assert.equal(b.access_token, 'new-access');
  assert.equal(h.storeCount, 1);
});

test('une déconnexion pendant le renouvellement ne réinstalle pas la session', async () => {
  const h = harness();
  const pending = h.context.refreshOnce('pompier.test', h.oldSession);
  h.clearSaved();
  h.reply(200, { access_token: 'new-access', refresh_token: 'new-refresh' });
  assert.equal(await pending, null);
  assert.equal(h.storeCount, 0);
  assert.equal(h.context._agaiAuthSession, null);
});

test('le module et le JavaScript publié gardent le même renouvellement', () => {
  assert.equal(segment(bundleSource), segment(moduleSource));
});
