const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'modules/05-admin-js-partie-1-2-vues-globales-superadmin.js'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/agai-account-link/index.ts'),'utf8');
const block=ui.slice(ui.indexOf('function superAdminAdminOverview(){'),ui.indexOf('function renderSuperAdmin(){'));

test('l’inventaire superadmin regroupe les administrateurs par compte, sans changer leur caserne',()=>{
  const ctx={
    CASERNES:[{id:'CIS01',nom:'Caserne 1'},{id:'CIS02',nom:'Caserne 2'}],
    CASERNE_DATA:{CIS01:{users:[]},CIS02:{users:[]}},
    OP_CASERNES:()=>ctx.CASERNES,
    getCaserneAdmins:id=>[{l:'test.admin',prenom:'Test',nom:'Admin',caserneId:'CIS01'}],
    LOGIN_HISTORY:[],APP_VERSION:'V202611_0011',
    escHtml:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'),
    Map,Set,Date,Intl,
  };
  vm.runInNewContext(block,ctx);
  const rows=ctx.superAdminAdminOverview();
  assert.equal(rows.length,1);
  assert.deepEqual(Array.from(rows[0].stations),['CIS01','CIS02']);
  assert.equal(rows[0].home,'CIS01');
  assert.equal(ctx.CASERNE_DATA.CIS02.users.length,0,'aucun doublon opérationnel créé');
});

test('les versions restent propres à chaque appareil et à la dernière activité',()=>{
  const ctx={CASERNES:[],OP_CASERNES:()=>[],getCaserneAdmins:()=>[],
    LOGIN_HISTORY:[
      {login:'agent',deviceId:'phone',appVersion:'V1',lastSeenAt:'2026-11-01T10:00:00Z'},
      {login:'agent',deviceId:'phone',appVersion:'V2',lastSeenAt:'2026-11-02T10:00:00Z'},
      {login:'agent',deviceId:'pc',appVersion:'V1',lastSeenAt:'2026-11-03T10:00:00Z'},
    ],APP_VERSION:'V2',escHtml:String,Map,Set,Date,Intl};
  vm.runInNewContext(block,ctx);
  const rows=ctx.superAdminLatestDeviceVersions();
  assert.equal(rows.length,2);
  assert.equal(rows.find(row=>row.deviceId==='phone').appVersion,'V2');
  assert.equal(rows.find(row=>row.deviceId==='pc').appVersion,'V1');
  assert.match(ctx.renderSuperAdminDeviceVersions([{login:'sans.session'}]),/sans\.session[\s\S]*Version inconnue/);
});

test('les fiches locales sans compte actif et les casernes divergentes ressortent',()=>{
  const ctx={CASERNES:[{id:'CIS01'},{id:'CIS02'}],
    CASERNE_DATA:{CIS01:{users:[{l:'agent.1',prenom:'Agent',nom:'Un'},{l:'agent.2'}]},CIS02:{users:[]}},
    OP_CASERNES:()=>ctx.CASERNES,getCaserneAdmins:()=>[],LOGIN_HISTORY:[],APP_VERSION:'V1',
    escHtml:String,Map,Set,Date,Intl};
  vm.runInNewContext(block,ctx);
  const issues=ctx.superAdminLocalAccountIssues([{login:'agent.1',caserneId:'CIS02'}]);
  assert.equal(issues.length,2);
  assert.equal(issues[0].issue,'caserne locale différente du compte serveur');
  assert.equal(issues[1].issue,'aucun compte serveur actif');
});

test('le contrôle serveur ne divulgue aucun secret et refuse les autres rôles',()=>{
  const audit=edge.slice(edge.indexOf("if (mode === 'admin_access_audit')"),edge.indexOf("if (mode === 'admin_personnel_status')"));
  assert.match(audit,/callerRole !== 'superadmin'/);
  assert.match(audit,/select\('login,caserne_id,app_role,active,first_name,last_name'\)/);
  assert.doesNotMatch(audit,/password_hash|access_token|refresh_token/);
  assert.match(ui,/Aucun compte ni droit n’a été modifié/);
});
