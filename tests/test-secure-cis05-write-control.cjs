const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'securite-cis05-ecriture-encadree.html'), 'utf8');
const inlineScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(inlineScript, 'Script du contrôle introuvable');
new vm.Script(inlineScript);

const testId = 'CIS05__iv__auth-write-dry-run-00000000-0000-4000-8000-000000000001';
const response = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body,
});

async function scenario({ rpcOk = true, persisted = false, canOperate = true }) {
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
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/functions/v1/agai-account-link')) {
        const mode = JSON.parse(options.body).mode;
        return mode === 'pilot_login'
          ? response({ personnelEnforcementEnabled: true, login: 'dacheville.thibaut',
            caserneId: 'CIS05', session: { access_token: 'test-token' } })
          : response({ login: 'dacheville.thibaut', caserneId: 'CIS05',
            canLogin: true, canOperate });
      }
      if (url.includes('/rpc/agai_auth_write_probe_cis05')) {
        return response(rpcOk
          ? { ok: true, id: testId, status: 'en-attente', rolledBack: true }
          : { ok: false }, { status: rpcOk ? 200 : 403 });
      }
      if (url.includes('id=eq.')) return response(persisted ? [{ id: testId }] : []);
      throw new Error('Requête inattendue : ' + url);
    },
  };
  vm.runInNewContext(inlineScript, context);
  await submit({ preventDefault() {} });
  assert.equal(elements.password.value, '', 'Le mot de passe ne doit pas rester dans le formulaire');
  return { calls, message: elements.result.textContent };
}

async function main() {
  const refused = await scenario({ canOperate: false });
  assert.equal(refused.calls.some(call => call.url.includes('/rpc/')), false,
    'Sans droit opérationnel, le RPC ne doit jamais être appelé');
  assert.match(refused.message, /Droits du personnel non confirmés/);

  const successful = await scenario({});
  const rpc = successful.calls.find(call => call.url.includes('/rpc/'));
  assert.ok(rpc, 'Le RPC isolé doit être appelé après contrôle des droits');
  assert.equal(rpc.options.body, '{}');
  assert.equal(Object.hasOwn(rpc.options.headers, 'Prefer'), false);
  assert.match(successful.message, /Essai annulé et fiche technique absente : OK/);

  const failedRpc = await scenario({ rpcOk: false });
  assert.match(failedRpc.message, /Contrôle d’écriture non concluant/);
  const persisted = await scenario({ persisted: true });
  assert.match(persisted.message, /fiche technique semble persister/);
  console.log('Contrôle CIS05 : droits vérifiés, RPC isolé et absence de fiche vérifiés.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
