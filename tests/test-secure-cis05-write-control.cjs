const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'securite-cis05-ecriture-encadree.html'), 'utf8');
const inlineScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(inlineScript, 'Script du contrôle introuvable');
new vm.Script(inlineScript);

const testId = 'CIS05__iv__auth-write-dry-run-fixed-uuid';
const response = (body, { status = 200, applied = false } = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: name => name === 'Preference-Applied' && applied ? 'tx=rollback' : null },
  json: async () => body,
});

async function scenario({ preflightApplied, rpcApplied = true, persisted = false }) {
  let submit;
  const calls = [];
  const elements = {
    'check-form': { addEventListener: (_name, callback) => { submit = callback; } },
    'check-button': { disabled: false },
    result: { textContent: '' },
    login: { value: 'dacheville.thibaut' },
    password: { value: 'non-secret-test' },
  };
  const context = {
    window: { AGAI_CONFIG: { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'public-key' } },
    document: { getElementById: id => elements[id] },
    crypto: { randomUUID: () => 'fixed-uuid' },
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/functions/v1/agai-account-link')) {
        const mode = JSON.parse(options.body).mode;
        return mode === 'pilot_login'
          ? response({ personnelEnforcementEnabled: true, login: 'dacheville.thibaut',
            caserneId: 'CIS05', session: { access_token: 'test-token' } })
          : response({ login: 'dacheville.thibaut', caserneId: 'CIS05',
            canLogin: true, canOperate: true });
      }
      if (url.includes('/rpc/agai_atomic_upsert_record_auth')) {
        return response({ ok: true, id: testId, status: 'en-attente' }, { applied: rpcApplied });
      }
      if (url.includes('id=eq.')) return response(persisted ? [{ id: testId }] : []);
      return response([{ id: 'sample' }], { applied: preflightApplied });
    },
  };
  vm.runInNewContext(inlineScript, context);
  await submit({ preventDefault() {} });
  assert.equal(elements.password.value, '', 'Le mot de passe ne doit pas rester dans le formulaire');
  return { calls, message: elements.result.textContent };
}

async function main() {
  const refused = await scenario({ preflightApplied: false });
  assert.equal(refused.calls.some(call => call.url.includes('/rpc/')), false,
    'Sans confirmation du rollback, le RPC ne doit jamais être appelé');
  assert.match(refused.message, /Annulation transactionnelle non confirmée/);

  const successful = await scenario({ preflightApplied: true });
  const rpc = successful.calls.find(call => call.url.includes('/rpc/'));
  assert.ok(rpc, 'Le RPC doit être appelé après précontrôle réussi');
  assert.equal(rpc.options.headers.Prefer, 'tx=rollback');
  const payload = JSON.parse(rpc.options.body);
  assert.equal(payload.p_id, testId);
  assert.equal(payload.p_deleted, true);
  assert.equal(payload.p_data.s, 'en-attente');
  assert.equal(Object.hasOwn(payload.p_data, '_numCaserne'), false);
  assert.equal(Object.hasOwn(payload.p_data, '_numMois'), false);
  assert.match(successful.message, /Transaction annulée et fiche technique absente : OK/);

  const missingConfirmation = await scenario({ preflightApplied: true, rpcApplied: false });
  assert.match(missingConfirmation.message, /Écriture atomique non concluante/);
  const persisted = await scenario({ preflightApplied: true, persisted: true });
  assert.match(persisted.message, /fiche technique semble persister/);
  console.log('Contrôle CIS05 : aucune écriture si rollback non confirmé, fiche masquée et absence vérifiées.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
