const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('les mesures locales ne contiennent ni identité ni données métier', () => {
  for (const file of ['modules/03-security-js.js', 'app.js']) {
    const source = read(file);
    const start = source.indexOf("const AGAI_LOGIN_TIMING_KEY='agai_login_timing_v1';");
    const end = source.indexOf('function _agaiOnlineAccessReady(){', start);
    assert.ok(start >= 0 && end > start, file);
    let clock = 0;
    const saved = new Map();
    const context = {
      Date,
      Number,
      JSON,
      performance: { now: () => clock },
      localStorage: { setItem: (key, value) => saved.set(key, value) },
    };
    vm.runInNewContext(source.slice(start, end)
      + '\nglobalThis.measure={begin:_agaiLoginTimingBegin,verified:_agaiLoginTimingVerified,fetchBegin:_agaiLoginTimingFetchBegin,fetchEnd:_agaiLoginTimingFetchEnd,finish:_agaiLoginTimingFinish};', context);
    context.measure.begin();
    clock = 800; context.measure.verified();
    clock = 1000; context.measure.fetchBegin();
    clock = 2500; context.measure.fetchEnd();
    clock = 3000; context.measure.finish();
    const result = JSON.parse(saved.get('agai_login_timing_v1'));
    assert.deepEqual(Object.keys(result).sort(), ['at', 'chargementMs', 'receptionMs', 'verificationMs']);
    assert.equal(result.verificationMs, 800);
    assert.equal(result.chargementMs, 2200);
    assert.equal(result.receptionMs, 1500);
  }
});

test('les durées sont reliées aux phases visibles et à la réception', () => {
  for (const [auth, pull] of [
    ['modules/04-auth-js-partie-2-2-login-session-droits.js', 'modules/17-animal-js.js'],
    ['app.js', 'app.js'],
  ]) {
    const login = read(auth);
    const records = read(pull);
    assert.match(login, /if\(PERSONNEL_ONLINE_GATE\)_agaiLoginTimingBegin\(\);/);
    assert.match(login, /_agaiLoginTimingVerified\(\);\s*if\(btn\)btn\.textContent='Chargement…'/);
    assert.match(login, /finally \{\s*if\(PERSONNEL_ONLINE_GATE\)_agaiLoginTimingFinish\(\);/);
    assert.match(records, /_agaiLoginTimingFetchBegin\(\);\s*const rows = await _rcFetchAllActiveRows\(requestedScope\);\s*if\(deferViewsUntilLogin\)_agaiLoginTimingFetchEnd\(\);/);
  }
});

test('le diagnostic affiche uniquement les durées du dernier essai', () => {
  const source = read('modules/23-login-repair-js.js');
  const start = source.indexOf('function _agaiLoginRepairTimingLabel(){');
  const end = source.indexOf('function _agaiLoginRepairOutboxCount(', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    AGAI_LOGIN_TIMING_KEY: 'agai_login_timing_v1', Date, Number, JSON,
    localStorage: { getItem: () => JSON.stringify({
      at: Date.now(), verificationMs: 800, chargementMs: 2200, receptionMs: 1500,
    }) },
  };
  vm.runInNewContext(source.slice(start, end)
    + '\nglobalThis.label=_agaiLoginRepairTimingLabel;', context);
  assert.match(context.label(), /vérification 0\.8 s ; chargement 2\.2 s \(dont réception des données 1\.5 s\)/);
  assert.match(source, /_agaiLoginRepairReasonLabel\(\)\+'\.'\+_agaiLoginRepairTimingLabel\(\)/);
});
