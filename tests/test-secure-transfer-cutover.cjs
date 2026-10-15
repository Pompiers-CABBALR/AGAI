const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('runtime-config.js');
const numbering = read('modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js');
const client = read('modules/24-secure-transfers-js.js');
const transferSql = read('supabase/migrations/20261015230500_secure_transfers_closed.sql');
const guardSql = read('supabase/migrations/20261015231500_enforce_secure_apl_assignment.sql');
const allocatorSql = read('supabase/migrations/20261015230000_secure_apl_allocation.sql');

assert.match(config, /secureAplNumberingEnabled:\s*true/);
assert.match(config, /secureTransfersEnabled:\s*false/);
assert.match(numbering, /get\('secureTransferPilot'\)==='1'/);
assert.match(numbering, /SECURE_TRANSFERS_ENABLED=PERSONNEL_ONLINE_GATE&&SECURE_APL_ENABLED/);
assert.match(read('index.html'), /modules\/24-secure-transfers-js\.js/);
assert.match(client, /if\(!SECURE_TRANSFERS_ENABLED\)return _legacyTransfererIV\(id\)/);
assert.match(client, /agai_transfer_intervention/);
assert.match(client, /p_expected_record_revision:Number\(iv\._serverRevision\)\|\|0/);
assert.match(client, /source\._transfertDestRecordId!==result\.destinationRecordId/);
assert.doesNotMatch(client.replace(/^\s*\/\/.*$/gm, ''), /\bsaveData\s*\(|\b_rcPushRecords\s*\(/);
assert.match(read('modules/08-interventions-js.js'), /!iv\._isRenfort&&\(chef\|\|isAgres\(\)\)/);

for (const purpose of ['appel', 'suite', 'echelle', 'epa', 'sdis', 'transfert']) {
  assert.match(allocatorSql, new RegExp(`'${purpose}'`));
}
assert.match(allocatorSql, /pg_advisory_xact_lock\(hashtext\('agai-apl:/);
assert.match(allocatorSql, /unique \(year, number\)/);
assert.match(allocatorSql, /existing\.auth_user_id<>\(select auth\.uid\(\)\)/);
assert.match(transferSql, /person_row\.data->'rights'\) \? 'Chef d''agrès'/);
assert.match(transferSql, /source_row\.data->>'s' is distinct from 'en-attente'/);
assert.match(transferSql, /AGAI_TRANSFER_ACTIVE_REINFORCEMENT/);
assert.match(transferSql, /assigned:=agai_private\.reserve_apl\(p_action_key,'transfert'\)/);
assert.match(transferSql, /perform public\.agai_atomic_upsert_record\([\s\S]*?destination_record_id[\s\S]*?perform public\.agai_atomic_upsert_record\([\s\S]*?p_source_record_id/);
assert.match(guardSql, /AGAI_APL_RESERVATION_REQUIRED/);
assert.match(guardSql, /reservation\.auth_user_id is distinct from \(select auth\.uid\(\)\)/);
assert.match(guardSql, /tg_op='UPDATE' and not old\.deleted/);
assert.match(guardSql, /before insert or update of data,deleted,type,caserne/);

const start = numbering.indexOf('function aplCreationActionKey(');
const end = numbering.indexOf('// Le numero APL reste lisible', start);
assert.ok(start >= 0 && end > start);

(async () => {
  const storage = new Map();
  const calls = [];
  const sandbox = {
    SECURE_APL_ENABLED: true,
    nextAplNum: () => { throw new Error('Numéro local interdit pendant le pilote'); },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000001'},
    navigator: {onLine: true},
    _agaiAuthAccessToken: () => 'auth-token',
    SB_URL: 'https://example.supabase.co',
    SB_KEY: 'publishable',
    _agaiAuthFetchWithTimeout: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return {ok: true, json: async () => ({
        apl: 'APL_2026_000584', actionKey: calls.at(-1).p_action_key,
      })};
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(numbering.slice(start, end), sandbox);
  const first = await sandbox.allocateNewApl('appel', 'appel-CIS05');
  const retry = await sandbox.allocateNewApl('appel', 'appel-CIS05');
  assert.equal(first.apl, 'APL_2026_000584');
  assert.equal(first.actionKey, retry.actionKey, 'même clé après une réponse perdue');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].p_action_key, calls[1].p_action_key);
  sandbox.clearAplCreationActionKey('appel', 'appel-CIS05');
  assert.equal(storage.size, 0);
  sandbox.navigator.onLine = false;
  await assert.rejects(sandbox.allocateNewApl('appel', 'appel-CIS05'), /Connexion requise/);
  assert.equal(calls.length, 2, 'hors ligne : aucune numérotation locale ni requête');

  const legacy = {SECURE_TRANSFERS_ENABLED: false, transfererIV: id => 'ancien-'+id,
    confirmerTransfert: id => 'ancien-'+id};
  vm.createContext(legacy);
  vm.runInContext(client, legacy);
  assert.equal(legacy.transfererIV('fiche'), 'ancien-fiche');
  assert.equal(await legacy.confirmerTransfert('fiche'), 'ancien-fiche');

  const source = {id: 'source', s: 'en-attente', _serverRevision: 7};
  const notices = [];
  const button = {disabled: false};
  let keyCleared = false;
  const active = {
    SECURE_TRANSFERS_ENABLED: true,
    transfererIV: () => {}, confirmerTransfert: () => {},
    IVS: [source], CURRENT_CASERNE_ID: 'CIS05', CU: {l: 'chef.test'},
    CASERNES: [{id: 'CIS05'}, {id: 'CIS03'}],
    document: {getElementById: id => ({
      'tr-dest': {value: 'CIS03'}, 'tr-motif': {value: 'Zone géographique'},
      'secure-transfer-send': button,
    })[id]},
    showToast: (message, kind) => notices.push({message, kind}),
    _agaiAuthAccessToken: () => 'auth-token',
    navigator: {onLine: true}, SB_URL: 'https://example.supabase.co', SB_KEY: 'publishable',
    _agaiAuthFetchWithTimeout: async (_url, options) => {
      const payload = JSON.parse(options.body);
      assert.equal(payload.p_source_record_id, 'CIS05__iv__source');
      assert.equal(payload.p_destination_caserne, 'CIS03');
      assert.equal(payload.p_expected_record_revision, 7);
      return {ok: true, json: async () => ({ok: true, apl: 'APL_2026_000584',
        destinationRecordId: 'CIS03__iv__destination'})};
    },
    _rcId: (caserne, type, id) => `${caserne}__${type}__${id}`,
    aplCreationActionKey: () => '00000000-0000-4000-8000-000000000001',
    clearAplCreationActionKey: () => { keyCleared = true; },
    _rcPull: async () => {source.s = 'annulee';
      source._transfertDestRecordId = 'CIS03__iv__destination'; return true;},
    cM: () => {}, rI: () => {}, rAccueil: () => {},
  };
  vm.createContext(active);
  vm.runInContext(client, active);
  await active.confirmerTransfert('source');
  assert.equal(keyCleared, true, 'clé conservée jusqu’à confirmation serveur et relecture');
  assert.equal(button.disabled, false);
  assert.equal(notices.at(-1).kind, 'success');
  console.log('Transferts : droits de chef, APL serveur, reprise idempotente et bascule fermée.');
})().catch(error => { console.error(error); process.exitCode = 1; });
