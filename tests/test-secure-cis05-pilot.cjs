const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
}

console.log('Pilote CIS05 : mode normal inchangé, connexion sécurisée sur URL explicite.');
