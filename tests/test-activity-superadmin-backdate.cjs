const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const dateText = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')].join('-');
function dayOffset(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return dateText(date);
}

for (const file of ['modules/19-onedrive-sync-js.js', 'app.js']) {
  test(`${file} réserve le dépassement de 7 jours au superadmin actif`, () => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const start = source.indexOf('function actDateIsValid(dateStr){');
    const end = source.indexOf('function actCalcDuree(){', start);
    assert.ok(start >= 0 && end > start, file);
    const context = {Date, GLOBAL_ROLE: null, window: {_superAdminDisabled: true}};
    vm.runInNewContext("function isSuperAdmin(){return GLOBAL_ROLE==='superadmin'&&!window._superAdminDisabled;}\n"
      + source.slice(start, end) + '\nglobalThis.validate=actDateIsValid;', context);

    const oldActivity = dayOffset(-30);
    const recentActivity = dayOffset(-3);
    const futureActivity = dayOffset(1);
    assert.match(context.validate(oldActivity), /antérieure à 7 jours/);
    assert.equal(context.validate(recentActivity), null);

    context.GLOBAL_ROLE = 'superadmin';
    assert.match(context.validate(oldActivity), /antérieure à 7 jours/, 'pouvoirs désactivés');
    context.window._superAdminDisabled = false;
    assert.equal(context.validate(oldActivity), null, 'pouvoirs activés');
    assert.match(context.validate(futureActivity), /futur/, 'pas de rapport futur');

    context.GLOBAL_ROLE = null;
    assert.match(context.validate(oldActivity), /antérieure à 7 jours/, 'un administrateur reste limité');
    assert.match(source, /const err=actDateIsValid\(d\)/, 'aperçu de la date');
    assert.match(source, /const dateErr=actDateIsValid\(date\)/, 'enregistrement');
  });
}
