const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'securite-cis05-config-comparaison.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'securite-cis05-config-comparaison.js'), 'utf8');
assert.match(html, /runtime-config\.js/);
assert.match(html, /securite-cis05-config-comparaison\.js/);
assert.doesNotMatch(source, /localStorage\.|\.put\s*\(|\.delete\s*\(|\.clear\s*\(|deleteDatabase\s*\(/);

function scenario({local, remote, signedStation = 'CIS05', missingLocal = false, remoteStatus = 200} = {}) {
  const elements = {
    'check-form': {addEventListener(_event, listener) {this.submit = listener;}},
    'check-button': {disabled: false},
    result: {textContent: ''},
    login: {value: 'lericque.brian'},
    password: {value: 'secret-test'},
  };
  const requests = [];
  const database = {
    objectStoreNames: {contains: name => name === 'records'},
    close() {},
    transaction(_name, mode) {
      assert.equal(mode, 'readonly');
      return {objectStore() {return {get(id) {
        assert.equal(id, 'CIS05__config__main');
        const request = {};
        queueMicrotask(() => {
          request.result = missingLocal ? undefined : {
            id, row: {id, caserne: 'CIS05', type: 'config', deleted: false, data: local},
          };
          request.onsuccess();
        });
        return request;
      }};}};
    },
  };
  const indexedDB = {
    databases: async () => [{name: 'agai-sync-outbox'}],
    open(name, version) {
      assert.equal(name, 'agai-sync-outbox');
      assert.equal(version, 1);
      const request = {};
      queueMicrotask(() => {request.result = database; request.onsuccess();});
      return request;
    },
  };
  const fetch = async (url, options) => {
    requests.push({url, method: options.method || 'GET', headers: options.headers});
    if (url.endsWith('/functions/v1/agai-account-link')) {
      const mode = JSON.parse(options.body).mode;
      if (mode === 'login') return {ok: true, json: async () => ({
        personnelEnforcementEnabled: true, login: 'lericque.brian', caserneId: signedStation,
        profile: {login: 'lericque.brian', caserneId: signedStation},
        session: {access_token: 'token-test'},
      })};
      assert.equal(mode, 'account_status');
      return {ok: true, json: async () => ({canLogin: true, login: 'lericque.brian', caserneId: signedStation})};
    }
    assert.match(url, /\/rest\/v1\/records\?id=eq\.CIS05__config__main/);
    return {ok: remoteStatus === 200, json: async () => [{
      id: 'CIS05__config__main', caserne: 'CIS05', type: 'config', deleted: false, data: remote,
    }]};
  };
  const context = {
    window: {AGAI_CONFIG: {supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'public-key'}, indexedDB},
    document: {getElementById: id => elements[id]}, indexedDB, fetch, AbortController,
    setTimeout, clearTimeout, queueMicrotask,
  };
  vm.runInNewContext(source, context);
  return {
    elements, requests,
    submit: async () => elements['check-form'].submit({preventDefault() {}}),
  };
}

(async () => {
  const same = scenario({local: {astrTelData: {telephone: 'secret'}, piquets: {a: 1}},
    remote: {piquets: {a: 1}, astrTelData: {telephone: 'secret'}}});
  await same.submit();
  assert.match(same.elements.result.textContent, /copie locale identique/);
  assert.equal(same.elements.password.value, '');
  assert.deepEqual(same.requests.map(item => item.method), ['POST', 'POST', 'GET']);
  assert.equal(same.requests[2].headers.Authorization, 'Bearer token-test');
  assert.doesNotMatch(same.elements.result.textContent, /secret|token-test/);

  const different = scenario({local: {astrTelData: {telephone: 'secret-local'}, piquets: {a: 1}},
    remote: {astrTelData: {telephone: 'secret-remote'}, piquets: {a: 1}}});
  await different.submit();
  assert.match(different.elements.result.textContent, /copies différentes/);
  assert.match(different.elements.result.textContent, /astreintes téléphoniques/);
  assert.doesNotMatch(different.elements.result.textContent, /secret-local|secret-remote/);

  const foreign = scenario({local: {piquets: {}}, remote: {piquets: {}}, signedStation: 'CIS03'});
  await foreign.submit();
  assert.match(foreign.elements.result.textContent, /Identité CIS05 non confirmée/);
  assert.equal(foreign.requests.length, 1);

  const absent = scenario({missingLocal: true});
  await absent.submit();
  assert.match(absent.elements.result.textContent, /Contrôle indisponible/);
  assert.equal(absent.requests.length, 0);

  const unavailable = scenario({local: {piquets: {}}, remote: {piquets: {}}, remoteStatus: 403});
  await unavailable.submit();
  assert.match(unavailable.elements.result.textContent, /Fiche serveur CIS05 inaccessible/);
  console.log('Comparaison CIS05 : lecture seule, identité contrôlée, aucune valeur sensible affichée.');
})().catch(error => {console.error(error); process.exitCode = 1;});
