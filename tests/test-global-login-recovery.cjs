const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'securite-global-comparaison.js');
const source = fs.readFileSync(file, 'utf8').replace(
  '  const request = async (url, options) => {',
  '  globalThis.testLoginConflictDecision = loginConflictDecision;\n  const request = async (url, options) => {'
).replace('  const authenticate = async login => {',
  '  globalThis.testCompare = compare;\n  const authenticate = async login => {');
assert.notEqual(source, fs.readFileSync(file, 'utf8'), 'test hook must be installed');
const context = {
  window: { AGAI_CONFIG: { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'public' } },
  document: { getElementById: () => ({ addEventListener() {} }) },
  AbortController, setTimeout, clearTimeout,
  fetch: async url => ({ ok: true, json: async () => url.includes('session-test')
    ? [row({ ...local, hDeconnexion: '2026-10-17T13:30:00.000Z' })]
    : url.includes('other-account') ? [{ id: 'CIS05__login__other-account', caserne: 'CIS05',
      type: 'login', deleted: false, data: { ...local, id: 'other-account',
        login: 'autre.compte', hConnexion: '2026-10-17T14:00:00.000Z',
        hDeconnexion: '2026-10-17T15:00:00.000Z' } }]
    : url.includes('ancienne-session') ? [{ id: 'CIS05__login__ancienne-session',
      caserne: 'CIS05', type: 'login', deleted: false,
      data: { id: 'ancienne-session', login: 'autre.compte', actif: false,
        hDeconnexion: '2026-10-17T10:00:00.000Z' } }] : [] }),
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
const otherStation = { ...local, id: 'session-cis03', caserneId: 'CIS03' };
assert.equal(choose(otherStation, { id: 'CIS03__login__session-cis03', caserne: 'CIS03',
  type: 'login', deleted: false,
  data: { ...otherStation, hDeconnexion: '2026-10-17T13:30:00.000Z' } }), 'remote');
(async () => {
  const second = { ...local, id: 'session-absent', hConnexion: '2026-10-17T14:00:00.000Z' };
  const localGlobal = { LOGIN_HISTORY: [local, second],
    LOGIN_HISTORY_DELETED: { 'ancienne-session': '2026-10-17T14:00:00.000Z' } };
  const remoteGlobal = { LOGIN_HISTORY: [
    { id: 'ancienne-session', login: local.login, caserneId: 'CIS05' }
  ], LOGIN_HISTORY_DELETED: {} };
  const checked = await context.testCompare(localGlobal, remoteGlobal, 'token', local.login);
  assert.match(checked.text, /Suppressions locales absentes du serveur : 1/);
  assert.match(checked.text, /connexion du compte saisi encore dans l’historique serveur : 1/);
  assert.match(checked.text, /Traces séparées absentes du serveur : 1/);
  assert.match(checked.text, /Marqueur : trace séparée présente \/ déjà supprimée \/ non visible : 1 \/ 0 \/ 0/);
  assert.match(checked.text, /Marqueur : compte saisi \/ autre compte : 0 \/ 1/);
  assert.match(checked.text, /Marqueur : session clôturée \/ ouverte ou incertaine : 1 \/ 0/);
  assert.match(checked.text, /non établie pour l’ensemble des traces/);
  assert.equal(checked.recoverable, false);
  const other = { ...second, id: 'other-account', login: 'autre.compte' };
  const another = await context.testCompare(
    { LOGIN_HISTORY: [local, other], LOGIN_HISTORY_DELETED: {} },
    { LOGIN_HISTORY: [{ ...other, hDeconnexion: '2026-10-17T15:00:00.000Z' }],
      LOGIN_HISTORY_DELETED: {} }, 'token', local.login);
  assert.match(another.text, /Autre trace : même compte dans une autre caserne \/ autre compte : 0 \/ 1/);
  assert.match(another.text, /Autre trace déjà présente dans l’historique global serveur : 1/);
  assert.match(another.text, /Autre trace séparée identique \/ différente \/ non visible : 0 \/ 1 \/ 0/);
  assert.match(another.text, /Autre trace différente : copie locale plus récente \/ serveur au moins aussi récent \/ chronologie incertaine : 0 \/ 1 \/ 0/);
  assert.equal(another.recoverable, false);
  console.log('Reprise de connexion : deux traces et une suppression restent en lecture seule.');
})().catch(error => { console.error(error); process.exitCode = 1; });
