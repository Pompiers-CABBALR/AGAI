const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la version publiée et les deux points d’entrée correspondent', () => {
  const version = JSON.parse(read('version.json')).version;
  for (const file of ['modules/15-storage-js.js', 'app.js']) {
    const match = read(file).match(/const APP_VERSION='([^']+)'/);
    assert.ok(match, `${file}: version absente`);
    assert.equal(match[1], version, `${file}: version différente`);
  }
  const assetVersions = Array.from(read('index.html').matchAll(/[?&]v=(V\d{6}_\d+)/g), match => match[1]);
  assert.ok(assetVersions.length >= 20, 'les modules ne sont pas tous versionnés');
  assert.ok(assetVersions.every(value => value === version), 'une ressource charge une ancienne version');
});
