const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('une connexion normale ne réécrit plus le mot de passe Auth', () => {
  const edge = read('supabase/functions/agai-account-link/index.ts');
  const start = edge.indexOf("if (mode === 'login' || mode === 'pilot_link' || mode === 'pilot_login')");
  const end = edge.indexOf('const authorization = req.headers.get', start);
  const login = edge.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(login.indexOf('let signed = await publicClient.auth.signInWithPassword') < login.indexOf('admin.auth.admin.updateUserById'));
  assert.match(login, /repairPassword = !createOnly && signed\.error\?\.code === 'invalid_credentials'/);
  assert.match(login, /if \(repairPassword \|\| repairMetadata\) \{[\s\S]*?\.\.\.\(repairPassword \? \{ password \} : \{\}\)/);
  assert.match(login, /signed = await publicClient\.auth\.signInWithPassword\(\{ email, password \}\)/);
});

test('les lectures indépendantes de vérification sont parallèles et les erreurs restent bloquantes', () => {
  const edge = read('supabase/functions/agai-account-link/index.ts');
  const login = edge.slice(edge.indexOf("if (mode === 'login' || mode === 'pilot_link' || mode === 'pilot_login')"),
    edge.indexOf('const authorization = req.headers.get'));
  assert.match(login, /await Promise\.all\(\[\s*admin\.from\('agai_auth_attempts'\)[\s\S]*?admin\.from\('agai_identity_credentials'\)/);
  assert.match(login, /if \(attemptError \|\| credentialError\) return json\(\{ error: 'authentication_unavailable' \}, 503\)/);
});

test('l’actualisation affiche une reprise de session et non le formulaire de connexion', () => {
  const html = read('index.html');
  const css = read('style.css');
  const restore = read('modules/17-animal-js.js');
  const bundle = read('app.js');
  assert.match(html, /savedSession\.token&&savedSession\.login&&Number\(savedSession\.expiresAt\)>Date\.now\(\)/);
  assert.match(html, /classList\.add\('agai-restoring-session'\)/);
  assert.match(html, /id="session-restore-screen" role="status"/);
  assert.match(css, /\.agai-restoring-session \.lw\{display:none!important;\}/);
  assert.match(css, /\.agai-restoring-session #session-restore-screen\{display:flex;\}/);
  const release = /\.finally\(function\(\)\{\s*document\.documentElement\.classList\.remove\('agai-restoring-session'\);\s*_agaiSessionRestorePromise=null;/;
  assert.match(restore, release);
  assert.match(bundle, release);
});
