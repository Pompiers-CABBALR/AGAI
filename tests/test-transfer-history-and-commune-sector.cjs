const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('app.js');
const history = read('modules/10-historique-js.js');
const call = read('modules/07-appel-js.js');
const snippet = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} must precede ${end}`);
  return source.slice(from, to);
};
assert.equal(snippet(app, 'function historyDateKey', 'function tg(id,aid)'),
  snippet(history, 'function historyDateKey', 'function tg(id,aid)'));
assert.equal(snippet(app, 'function comNom', 'function chkR'),
  snippet(call, 'function comNom', 'function chkR'));
assert.match(read('index.html'), /id="csec" class="commune-sector-badge"/);
assert.match(read('style.css'), /\.hist-transfer-badge\{/);
assert.match(read('style.css'), /\.commune-sector-badge\{/);
for (const file of ['modules/08-interventions-js.js', 'app.js']) {
  assert.match(read(file), /const transferDestApl=String\(iv\._transfertDestId\|\|''\)\.match/);
  assert.match(read(file), /iv\.s==='annulee'&&iv\._transfertVers\?\['binfo','Transférée'\]/);
  assert.match(read(file), /Transférée vers<\/div><div class="mv2"/);
}

const transferred = {
  id: 'old-call', n: 'Intervention transférée', com: 'Auchel', s: 'annulee',
  h: '20261030_1330', _numApl: 'APL_2026_000641',
  _transfertVers: 'CIS02', _transfertDestId: 'APL_2026_000644-Rtest',
  tl: [{s: 'en-attente', h: '20261030_1330'}, {s: 'annulee', h: '20261031_1434'}],
};
const ordinaryCancellation = {
  id: 'ordinary-cancel', n: 'Annulation ordinaire', s: 'annulee',
  h: '20261030_1330', tl: [{s: 'annulee', h: '20261031_1434'}],
};
const container = {innerHTML: ''};
const context = {
  CASERNES: [{id: 'CIS02', nom: 'UT Divion'}], IVS: [transferred], PILP_IVS: [],
  document: {getElementById: id => id === 'hc' ? container : null},
  isChef: () => true, hasRight: () => false, canSeePILP: () => false,
  isInterventionComptabilisee: () => false,
  interventionIsClosureTimelineEntry: entry => entry.s === 'terminee',
  interventionReportParticipants: () => [], interventionVehicleNames: () => [],
  interventionDisplayUTNumber: () => '641',
  interventionDisplayCallNumber: iv => iv._numApl || '',
  escHtml: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
};
vm.createContext(context);
vm.runInContext(history, context);
assert.equal(context.historyInterventionDayKey(transferred), '20261031');
assert.equal(context.historyInterventionDayKey(ordinaryCancellation), '20261030');
assert.match(context.historySearchBlob(transferred), /apl_2026_000644/);
const row = context.historyRowHTML(transferred);
assert.match(row, /Transférée vers UT Divion · nouvel APL_2026_000644/);
assert.match(row, /data-hdate="20261031"/);
assert.doesNotMatch(row, /text-decoration:line-through/);
assert.match(context.historyRowHTML(ordinaryCancellation), /text-decoration:line-through/);
context.rHist();
assert.match(container.innerHTML, /31\/10\/2026/);
assert.match(container.innerHTML, /↪ 1 transfert/);
assert.match(container.innerHTML, /Transférée vers UT Divion/);

const elements = Object.fromEntries(['cdd', 'ci', 'ciw', 'cs', 'cst', 'csec']
  .map(id => [id, {style: {}, value: '', textContent: '', innerHTML: ''}]));
const callContext = {
  COM: [{nom: 'Auchel', secteur: 'UT Lapugnoy'}, {nom: 'A&B', secteur: 'UT <test>'}],
  document: {getElementById: id => elements[id]},
  nm: value => String(value || '').toLowerCase(),
  escHtml: context.escHtml, chkR: () => {}, ce: () => {}, cddi: 0, selC2: null,
};
vm.createContext(callContext);
vm.runInContext(snippet(call, 'function comNom', 'function chkR'), callContext);
callContext.filtC('A');
assert.match(elements.cdd.innerHTML, /Secteur : UT Lapugnoy/);
assert.match(elements.cdd.innerHTML, /A&amp;B/);
assert.match(elements.cdd.innerHTML, /UT &lt;test&gt;/);
callContext.sC('Auchel');
assert.equal(elements.csec.textContent, 'Secteur : UT Lapugnoy');
assert.equal(elements.csec.style.display, 'inline-flex');
callContext.sC('Commune inconnue');
assert.equal(elements.csec.style.display, 'none');

console.log('Historique : transfert visible au jour réel, sans gonfler les interventions ; secteur de commune lisible dès la sélection.');
