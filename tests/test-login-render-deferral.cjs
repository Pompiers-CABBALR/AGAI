const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

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

for (const [file, authFile] of [
  ['modules/17-animal-js.js', 'modules/03-security-js.js'],
  ['app.js', 'app.js']
]) {
  test(`${file}: la connexion diffère uniquement le rendu des onglets masqués`, () => {
    const source = read(file);
    assert.match(read(authFile), /if\(await _rcPull\(false,true\)\)/);
    assert.match(source, /async function _rcPull\(silent,deferViewsUntilLogin\)/);
    assert.match(source, /const rows = await _rcFetchAllActiveRows\(requestedScope\)/);
    assert.match(source, /_writeLocalCache\(data\);\s*_rcRenderViewsAfterPull\(deferViewsUntilLogin\);/);

    const calls = [];
    const context = { document: { getElementById: id => id === 'admin-add' ? { style: { display: 'none' } } : null } };
    for (const name of ['rI', 'rPilp', 'rAccueil', 'rHist', 'rAstrDispo', 'rAstrEquipes', 'rAdm']) {
      context[name] = () => calls.push(name);
    }
    vm.runInNewContext(functionSource(source, '_rcRenderViewsAfterPull')
      + '\nglobalThis.render = _rcRenderViewsAfterPull;', context);

    context.render(true);
    assert.deepEqual(calls, []);
    context.render(false);
    assert.deepEqual(calls, ['rI', 'rPilp', 'rAccueil', 'rHist', 'rAstrDispo', 'rAstrEquipes', 'rAdm']);
  });
}

test('les écrans différés sont rendus à leur ouverture', () => {
  const navigation = read('modules/06-ui-js-accueil-js.js');
  const subtabs = read('modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js');
  const astreintes = read('modules/12-astreintes-js.js');
  const loginSuccess = read('modules/05-admin-js-partie-1-2-vues-globales-superadmin.js');
  assert.match(loginSuccess, /function doLoginSuccess\(\)[\s\S]*?rAccueil\(\)/);
  assert.match(navigation, /if\(id==='interv'\)[\s\S]*?rPilp\(\);else if\(sub==='hist'\)rHist\(\);else rI\(\)/);
  assert.match(subtabs, /function showSubtab\(sub,btn\)[\s\S]*?if\(sub==='pilp'\)\{rPilp\(\);\}/);
  assert.match(astreintes, /function showAstrTab\(sub,btn\)[\s\S]*?if\(sub==='dispo'\)rAstrDispo\(\)/);
  assert.match(astreintes, /function showAstrTab\(sub,btn\)[\s\S]*?if\(sub==='equipes'\)rAstrEquipes\(\)/);
});
