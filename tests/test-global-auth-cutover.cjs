const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('runtime-config.js');
const configContext = { window: {} };
vm.runInNewContext(config, configContext);
assert.equal(configContext.window.AGAI_CONFIG.accountLinkMode, 'on');
assert.equal(configContext.window.AGAI_CONFIG.personnelOnlineGateEnabled, true);

for (const file of ['modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js', 'app.js']) {
  const source = read(file);
  const start = source.indexOf('const AGAI_RUNTIME_CONFIG=');
  const end = source.indexOf('const AUTH_LINK_ENDPOINT =', start);
  assert.ok(start >= 0 && end > start, `${file}: configuration introuvable`);
  for (const search of ['', '?secureCis05Pilot=1']) {
    const context = {
      window: configContext.window, location: { search }, URLSearchParams,
    };
    vm.runInNewContext(source.slice(start, end)
      + '\nglobalThis.result={mode:AUTH_LINK_MODE,gate:PERSONNEL_ONLINE_GATE,pilot:PERSONNEL_SECURE_CIS05_PILOT};', context);
    assert.equal(JSON.stringify(context.result), JSON.stringify({ mode: 'on', gate: true, pilot: false }),
      `${file}: configuration ${search || 'principale'}`);
  }
}

const version = JSON.parse(read('version.json')).version;
assert.equal(version, 'V202610_0028');
assert.match(read('modules/15-storage-js.js'), /const APP_VERSION='V202610_0028'/);
assert.match(read('app.js'), /const APP_VERSION='V202610_0028'/);
for (const script of read('index.html').matchAll(/(?:src|href)="[^"]+\?v=(V\d+_\d+)"/g)) {
  assert.equal(script[1], version, `ressource non alignée : ${script[0]}`);
}
assert.match(read('modules/03-security-js.js'), /PERSONNEL_SECURE_CIS05_PILOT\?'pilot_login':'login'/);
assert.match(read('modules/17-animal-js.js'), /PERSONNEL_ONLINE_GATE\?'agai_atomic_upsert_record_auth':'agai_atomic_upsert_record'/);
for (const file of ['modules/17-animal-js.js', 'app.js']) {
  const source = read(file);
  assert.match(source, /if\(!PERSONNEL_SECURE_CIS05_PILOT&&!PERSONNEL_ONLINE_GATE\)return rows;/);
  assert.match(source, /if\(\(PERSONNEL_SECURE_CIS05_PILOT\|\|PERSONNEL_ONLINE_GATE\)&&type==='login'\)return;/);
  assert.doesNotMatch(source, /loginRetention\.removed\.length&&GLOBAL_ROLE==='superadmin'&&!PERSONNEL_SECURE_CIS05_PILOT/);
  const start = source.indexOf('async function _rcDiscardPilotLoginTombstones(');
  const end = source.indexOf('async function _rcReconcileOutboxWithRemote(', start);
  const removed = [];
  const pending = new Set(['old-login', 'intervention']);
  const context = {
    PERSONNEL_SECURE_CIS05_PILOT: false, PERSONNEL_ONLINE_GATE: true,
    _rcOutboxDelete: async ids => { removed.push(...ids); return true; },
    _rcPendingDirty: pending, _rcPersistPendingDirty: () => {},
  };
  vm.runInNewContext(source.slice(start, end)
    + '\nglobalThis.clean=_rcDiscardPilotLoginTombstones;', context);
  context.clean([
    { id: 'old-login', type: 'login', deleted: true },
    { id: 'intervention', type: 'iv', deleted: false },
  ]).then(rows => {
    assert.deepEqual(removed, ['old-login']);
    assert.deepEqual(Array.from(rows, row => row.id), ['intervention']);
    assert.equal(pending.has('old-login'), false);
    assert.equal(pending.has('intervention'), true);
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
assert.match(read('modules/03-security-js.js'), /_rcDiscardPilotLoginTombstones\(await _rcOutboxGetRows\(\)\)/);
assert.match(read('supabase/functions/agai-account-link/index.ts'), /const personnelEnforcement = true/);

const checkPage = read('securite-acces-intercaserne.html');
const inline = checkPage.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
assert.ok(inline, 'script du contrôle inter-casernes introuvable');
new Function(inline[1]);
assert.doesNotMatch(checkPage, /\/rest\/v1\/records\?select=id,updated_by/);
console.log('Bascule Auth : configuration, version, accès et contrôle en lecture seule cohérents.');
