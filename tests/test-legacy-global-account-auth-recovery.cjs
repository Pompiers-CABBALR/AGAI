const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

for (const file of ['modules/04-auth-js-partie-2-2-login-session-droits.js', 'app.js']) {
  test(`${file}: récupération SA par Auth serveur uniquement`, async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const start = source.indexOf('async function _agaiRecoverLegacyGlobalAccount(');
    const end = source.indexOf('async function doLogin(', start);
    assert.ok(start >= 0 && end > start);
    assert.match(source.slice(end, end + 4200), /if\(!gaFound\)gaFound=await _agaiRecoverLegacyGlobalAccount\(l,p\)/);
    assert.doesNotMatch(source.slice(start, end), /select=data|GLOBAL_ACCOUNTS.*rest\/v1|password_hash/);

    const account = { l: 'pilote', role: 'superadmin', caserneId: 'CIS05' };
    let responseRole = 'superadmin', logoutOk = true, enforced = true;
    const calls = [];
    const context = {
      PERSONNEL_ONLINE_GATE: false, USE_RECORDS: true, GLOBAL_ACCOUNTS: [account],
      AUTH_LINK_ENDPOINT: 'https://example.invalid/functions/v1/agai-account-link',
      SB_URL: 'https://example.invalid', SB_KEY: 'clé-publique', agaiDeviceId: () => 'appareil-test',
      _agaiAuthFetchWithTimeout: async (url, options) => {
        calls.push({ url, options });
        if(url.includes('/auth/v1/logout'))return { ok: logoutOk };
        return { ok: true, json: async () => ({
          personnelEnforcementEnabled: enforced, login: 'pilote', caserneId: 'CIS05', appRole: responseRole,
          profile: { login: 'pilote', caserneId: 'CIS05', appRole: responseRole },
          session: { access_token: 'jeton-temporaire' },
        }) };
      },
    };
    vm.runInNewContext(source.slice(start, end) + '\nglobalThis.recover=_agaiRecoverLegacyGlobalAccount;', context);
    assert.equal(await context.recover('pilote', 'secret'), account);
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[0].options.body).mode, 'pilot_login');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer jeton-temporaire');
    assert.ok(!calls[0].url.includes('secret'));

    responseRole = 'admin';
    assert.equal(await context.recover('pilote', 'secret'), null);
    assert.equal(calls.length, 4, 'une réponse incohérente doit aussi révoquer le jeton');
    responseRole = 'superadmin';
    enforced = false;
    assert.equal(await context.recover('pilote', 'secret'), null);
    enforced = true;
    logoutOk = false;
    assert.equal(await context.recover('pilote', 'secret'), null);
    context.PERSONNEL_ONLINE_GATE = true;
    assert.equal(await context.recover('pilote', 'secret'), null);
    context.PERSONNEL_ONLINE_GATE = false;
    context.GLOBAL_ACCOUNTS = [{ ...account, p: 'ancienne-empreinte' }];
    assert.equal(await context.recover('pilote', 'secret'), null);
  });
}
