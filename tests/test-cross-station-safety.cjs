const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const actions = [
  'transfererIV',
  'confirmerTransfert',
  'showRenfortModal',
  'envoyerRenfort',
  'repondreRenfort',
  'showRenfortEquipageModal',
  'confirmerRenfortEquipage',
  'cloturerRenfort',
  'annulerRenfortUT',
];

for (const file of ['app.js', 'modules/12-astreintes-js.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const gate = source.match(/function requireSecureCrossStationWorkflow\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(gate, `${file}: verrou inter-casernes absent`);
  assert.match(gate[1], /PERSONNEL_ONLINE_GATE/);
  assert.match(gate[1], /return false;/);

  for (const action of actions) {
    const opening = new RegExp(`function ${action}\\([^)]*\\)\\s*\\{\\s*if\\(!requireSecureCrossStationWorkflow\\(\\)\\)return;`);
    assert.match(source, opening, `${file}: ${action} doit rester bloquée avant toute modification`);
  }

  let warnings = 0;
  const context = { PERSONNEL_ONLINE_GATE: true, showToast: () => { warnings++; } };
  vm.runInNewContext(gate[0] + '\nglobalThis.check = requireSecureCrossStationWorkflow;', context);
  assert.equal(context.check(), false, `${file}: le mode Auth doit bloquer l'ancien parcours`);
  assert.equal(warnings, 1);
  context.PERSONNEL_ONLINE_GATE = false;
  assert.equal(context.check(), true, `${file}: le contrôle ne change pas le mode historique`);
}

console.log('Transferts et renforts : les neuf entrées de l’ancien circuit restent verrouillées en mode Auth.');
