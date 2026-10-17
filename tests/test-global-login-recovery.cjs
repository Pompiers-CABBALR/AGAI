const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'securite-global-comparaison.js');
const source = fs.readFileSync(file, 'utf8').replace(
  '  const request = async (url, options) => {',
  '  globalThis.testLoginConflictDecision = loginConflictDecision;\n  const request = async (url, options) => {'
);
assert.notEqual(source, fs.readFileSync(file, 'utf8'), 'test hook must be installed');
const context = {
  window: { AGAI_CONFIG: {} },
  document: { getElementById: () => ({ addEventListener() {} }) },
};
vm.runInNewContext(source, context, { filename: file });
const choose = context.testLoginConflictDecision;
assert.equal(typeof choose, 'function');

const local = {
  id: 'session-test', login: 'dacheville.thibaut', caserneId: 'CIS05', actif: false,
  hConnexion: '2026-10-17T12:00:00.000Z',
  hDeconnexion: '2026-10-17T13:00:00.000Z',
  lastSeenAt: '2026-10-17T13:00:00.000Z', fermetureAuto: 'Session expirée automatiquement'
};
const row = data => ({ id: 'CIS05__login__session-test', caserne: 'CIS05',
  type: 'login', deleted: false, data });
assert.equal(choose(local, row({ ...local, hDeconnexion: '2026-10-17T12:30:00.000Z' })), 'local');
assert.equal(choose(local, row({ ...local, hDeconnexion: '2026-10-17T13:30:00.000Z' })), 'remote');
assert.equal(choose(local, row({ ...local, fermetureAuto: 'Autre fermeture' })), 'remote');
assert.equal(choose(local, row({ ...local, nom: 'Autre identité' })), '');
assert.equal(choose(local, row({ ...local, login: 'autre.compte' })), '');
assert.equal(choose(local, { ...row(local), deleted: true }), '');
assert.equal(choose({ ...local, actif: true }, row({ ...local, actif: true })), '');
assert.equal(choose(local, row({ ...local, hDeconnexion: 'date invalide' })), '');
console.log('Reprise de connexion : seules les heures de déconnexion cohérentes sont arbitrées.');
