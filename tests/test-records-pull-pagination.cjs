const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function extractFunction(source, name) {
  const start = source.indexOf('async function ' + name + '(');
  assert.ok(start >= 0, name + ' absent');
  const body = source.indexOf('{', start);
  let depth = 0;
  for (let index = body; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && !--depth) return source.slice(start, index + 1);
  }
  throw new Error('Fonction incomplète : ' + name);
}

async function readWithServerCap(file, serverCap, totalRows) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const pageSize = Number(source.match(/const RC_PULL_PAGE_SIZE = (\d+);/)[1]);
  assert.equal(pageSize, 500);
  const serverRows = Array.from({ length: totalRows }, (_, index) => ({
    id: 'CIS05|iv|' + String(index).padStart(6, '0')
  }));
  const requested = [];
  const context = {
    RC_PULL_PAGE_SIZE: pageSize,
    RC_REST: 'https://example.invalid/records',
    _sbHeaders: {},
    PERSONNEL_SECURE_CIS05_PILOT: false,
    _rcPullScopeFilter: () => '&caserne=in.(_GLOBAL,CIS05)',
    _rcUniqueRowsById: rows => rows,
    _agaiFetchWithTimeout: async url => {
      const query = new URL(url).searchParams;
      const limit = Number(query.get('limit'));
      const after = query.get('id')?.slice(3) || '';
      requested.push({ limit, after });
      const batch = serverRows.filter(row => row.id > after).slice(0, Math.min(limit, serverCap));
      return { ok: true, json: async () => batch };
    }
  };
  vm.runInNewContext(extractFunction(source, '_rcFetchAllActiveRows')
    + '\nglobalThis.readRows = _rcFetchAllActiveRows;', context);
  const result = await context.readRows();
  assert.equal(result.length, totalRows);
  assert.deepEqual(Array.from(result, row => row.id), serverRows.map(row => row.id));
  assert.ok(requested.every(call => call.limit === 500));
  assert.equal(requested.at(-1).after, serverRows.at(-1)?.id || '');
  return requested.length;
}

for (const file of ['modules/17-animal-js.js', 'app.js']) {
  test(`${file}: CIS05 est lu en cinq pages au lieu de dix-sept`, async () => {
    assert.equal(await readWithServerCap(file, 500, 1551), 5);
  });

  test(`${file}: aucune ligne perdue si le serveur plafonne à 100`, async () => {
    assert.equal(await readWithServerCap(file, 100, 1551), 17);
  });

  test(`${file}: même une petite caserne attend une page vide`, async () => {
    assert.equal(await readWithServerCap(file, 500, 9), 2);
  });
}
