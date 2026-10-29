const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('Gestion Utilisateur est un menu de premier niveau, après Statistiques',()=>{
  const html=read('index.html');
  assert.ok(html.indexOf('id="nav-stats"')<html.indexOf('id="nav-users"'));
  assert.ok(html.includes('id="nav-users" onclick="showT(\'users\',this)"'));
  assert.ok(html.includes('id="tab-users"'));
  assert.ok(!html.includes('id="params-btn-admin"'));
});

for(const file of ['modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js','app.js']){
  test(file+' : le pouvoir A ou SA actif ouvre la gestion',()=>{
    const source=read(file);
    const rights=source.slice(source.indexOf('function hasRight(r){'),source.indexOf('function isAgres(){'));
    const menu=source.slice(source.indexOf('function canManageUsersNow(){'),source.indexOf('function applyNavRights(){'));
    const ctx={window:{_adminRoleDisabled:true,_superAdminDisabled:true},
      CU:{rights:['Administration']},GLOBAL_ROLE:null,
      isSuperAdmin:()=>ctx.GLOBAL_ROLE==='superadmin'&&!ctx.window._superAdminDisabled};
    vm.runInNewContext(rights+menu,ctx);
    assert.equal(ctx.canManageUsersNow(),false);
    ctx.window._adminRoleDisabled=false;
    assert.equal(ctx.canManageUsersNow(),true);
    ctx.GLOBAL_ROLE='superadmin';
    assert.equal(ctx.canManageUsersNow(),true,'Le bouton A reste valable pour un compte superadmin');
    ctx.window._adminRoleDisabled=true;
    assert.equal(ctx.canManageUsersNow(),false);
    ctx.window._superAdminDisabled=false;
    assert.equal(ctx.canManageUsersNow(),true);
    ctx.GLOBAL_ROLE=null;ctx.window._superAdminDisabled=true;ctx.window._adminRoleDisabled=false;
    ctx.CU={rights:['Interventions']};
    assert.equal(ctx.canManageUsersNow(),false,'Un agent ne voit pas ce menu');
    const ui=read(file==='app.js'?'app.js':'modules/06-ui-js-accueil-js.js');
    assert.match(ui,/if\(id==='users'&&!canManageUsersNow\(\)\)/);
  });
}

for(const file of ['modules/11-admin-js-partie-2-2-gestion-utilisateurs.js','app.js']){
  test(file+' : journal serveur lisible sans mot de passe et échappé',async()=>{
    const source=read(file);
    const start=source.indexOf('const PERSONNEL_AUDIT_FIELDS=');
    const end=source.indexOf('function rAdm(){',start);
    assert.ok(start>0&&end>start);
    const state={textContent:''},list={innerHTML:''};
    const ctx={
      document:{getElementById:id=>id==='admin-audit-state'?state:id==='admin-audit-list'?list:null},
      canManageUsersNow:()=>true,_agaiAuthAccessToken:()=> 'test-token',CURRENT_CASERNE_ID:'CIS05',
      SB_REST:'https://example.invalid/rest/v1',SB_KEY:'public',
      _agaiAuthFetchWithTimeout:async()=>({ok:true,json:async()=>[{
        occurred_at:'2026-10-29T08:00:00Z',actor_login:'admin',target_login:'agent<script>',
        action:'update',changes:{fonction:{avant:'Équipier',apres:'Conducteur'},p:{changed:true}}
      }]}),
      escHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
      Intl,Date,encodeURIComponent
    };
    vm.runInNewContext(source.slice(start,end),ctx);
    await ctx.loadPersonnelAudit();
    assert.match(list.innerHTML,/agent&lt;script&gt;/);
    assert.match(list.innerHTML,/fonction : Équipier → Conducteur/);
    assert.match(list.innerHTML,/mot de passe réinitialisé/);
    assert.doesNotMatch(list.innerHTML,/<script>/);
    assert.match(state.textContent,/1 action/);
  });
}

test('le journal est protégé et ne stocke pas les secrets',()=>{
  const sql=read('supabase/migrations/20261029081106_personnel_management_audit.sql');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/grant select on public\.agai_personnel_audit to authenticated/);
  assert.match(sql,/access\.app_role in \('superadmin', 'administrateur_caserne'\)/);
  assert.match(sql,/after insert or update on public\.records/);
  assert.match(sql,/after insert on public\.agai_personnel_access_history/);
  assert.match(sql,/\{"p":\{"changed":true\}\}/);
  assert.doesNotMatch(sql,/jsonb_build_object\([^\n]*'p'\s*,\s*(old|new)\.data/);
});
