const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('style.css');

function functionSource(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' absent');
  const body = source.indexOf('{', start);
  let depth = 0;
  for (let index = body; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && !--depth) return source.slice(start, index + 1);
  }
  throw new Error('Fonction incomplète : ' + name);
}

test('la fiche animal couvre l’écran tandis que sa liste reste compacte', () => {
  assert.match(css, /\.mov\.pec-modal-overlay\s*\{[^}]*top:0;/);
  assert.match(css, /\.mov\.pec-modal-overlay:not\(\.pec-form-active\)\s*\{[^}]*align-items:flex-end;/);
  assert.match(css, /\.mov\.pec-modal-overlay:not\(\.pec-form-active\) \.mod\s*\{[^}]*height:auto;/);
  assert.match(css, /\.mov\.pec-modal-overlay\.pec-form-active #mb\{overflow:hidden;\}/);
});

for (const file of ['modules/08-interventions-js.js', 'app.js']) {
  test(`${file}: le champ animal reste visible au-dessus du clavier`, () => {
    const source = read(file);
    const scrollHost = { scrollTop: 0, getBoundingClientRect: () => ({ top: 100, bottom: 900 }) };
    const field = {
      closest: () => scrollHost,
      getBoundingClientRect: () => ({ top: 570, bottom: 650 })
    };
    const overlay = { classList: { contains: name => name === 'keyboard-aware-modal' } };
    const context = {
      window: { _activeMobileModalFieldId: 'pec-etat', innerHeight: 900,
        visualViewport: { offsetTop: 0, height: 600 } },
      document: { getElementById: id => id === 'mo' ? overlay : field }
    };
    vm.runInNewContext(functionSource(source, 'keepMobileModalFieldVisible')
      + '\nglobalThis.keep=keepMobileModalFieldVisible;', context);
    context.keep();
    assert.equal(scrollHost.scrollTop, 66);
    assert.match(source, /setTimeout\(keepMobileModalFieldVisible,350\)/);
  });
}
