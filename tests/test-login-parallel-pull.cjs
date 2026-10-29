const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function reader(file, fetchRows) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf('async function _rcFetchAllActiveRows(');
  const end = source.indexOf('function _rcRenderViewsAfterPull(', start);
  assert.ok(start >= 0 && end > start, file);
  const context = {
    RC_PULL_PAGE_SIZE: 500,
    RC_REST: 'https://example.test/records',
    _sbHeaders: {},
    PERSONNEL_SECURE_CIS05_PILOT: false,
    _rcPullScopeFilter: () => '&caserne=in.(_GLOBAL,CIS05)',
    _rcUniqueRowsById: rows => [...new Map(rows.map(row => [row.id, row])).values()],
    _agaiFetchWithTimeout: fetchRows,
  };
  vm.runInNewContext(source.slice(start, end)
    + '\nglobalThis.readRows=_rcFetchAllActiveRows;', context);
  return context.readRows;
}

for (const file of ['modules/17-animal-js.js', 'app.js']) {
  test(`${file} lit toutes les lignes en deux flux parallèles à la connexion`, async () => {
    const serverRows = [
      ...Array.from({length: 800}, (_, i) => ({id: `CIS05|login|${String(i).padStart(4, '0')}`, type: 'login'})),
      ...Array.from({length: 751}, (_, i) => ({id: `CIS05|iv|${String(i).padStart(4, '0')}`, type: 'iv'})),
    ].sort((a, b) => a.id.localeCompare(b.id));
    const calls = [];
    const readRows = reader(file, async url => {
      const params = new URL(url).searchParams;
      const type = params.get('type');
      const after = params.get('id')?.slice(3) || '';
      calls.push(type);
      const batch = serverRows.filter(row => row.id > after
        && (type === 'eq.login' ? row.type === 'login' : row.type !== 'login'))
        .slice(0, Math.min(Number(params.get('limit')), 500));
      return {ok: true, json: async () => batch};
    });
    const pending = readRows('', true);
    assert.deepEqual(calls, ['eq.login', 'neq.login'], 'les premiers appels démarrent ensemble');
    const result = await pending;
    assert.deepEqual(Array.from(result, row => row.id), serverRows.map(row => row.id));
    assert.equal(calls.filter(type => type === 'eq.login').length, 3);
    assert.equal(calls.filter(type => type === 'neq.login').length, 3);
  });

  test(`${file} refuse une lecture incomplète d'un des deux flux`, async () => {
    const readRows = reader(file, async url => ({
      ok: !String(url).includes('type=eq.login'),
      status: 503,
      json: async () => [],
    }));
    await assert.rejects(readRows('', true), /records GET HTTP 503/);
  });
}
