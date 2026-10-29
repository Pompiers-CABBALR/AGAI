const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function versionReader(file, fetch) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf('async function _fetchRemoteVersion(){');
  const end = source.indexOf('function _versionInfo(', start);
  assert.ok(start >= 0 && end > start, file);
  const context = {
    URL, Date, Number, Promise,
    document: {baseURI: 'https://example.test/AGAI/index.html'},
    window: {location: {href: 'https://example.test/AGAI/index.html'}},
    fetch,
    _compareVersions: (left, right) => left.localeCompare(right),
  };
  vm.runInNewContext(source.slice(start, end)
    + '\nglobalThis.readVersion=_fetchRemoteVersion;', context);
  return context.readVersion;
}

for (const file of ['modules/15-storage-js.js', 'app.js']) {
  test(`${file} vérifie le manifeste et la page en parallèle`, async () => {
    const requests = [];
    const readVersion = versionReader(file, (url) => new Promise((resolve) => {
      requests.push({url, resolve});
    }));
    const pending = readVersion();
    assert.equal(requests.length, 2, 'les deux requêtes démarrent sans attendre la première');
    requests[0].resolve({ok: true, json: async () => ({version: 'V202610_0086'})});
    requests[1].resolve({ok: true, text: async () =>
      '<link rel="stylesheet" href="style.css?v=V202610_0087"/>'});
    assert.equal(await pending, 'V202610_0087', 'la page plus récente reste prioritaire');
  });

  test(`${file} garde le contrôle HTML si le manifeste échoue`, async () => {
    const readVersion = versionReader(file, async (url) => {
      if (String(url).includes('version.json')) throw new Error('réseau');
      return {ok: true, text: async () => "<script>const APP_VERSION='V202610_0086';</script>"};
    });
    assert.equal(await readVersion(), 'V202610_0086');
  });
}
