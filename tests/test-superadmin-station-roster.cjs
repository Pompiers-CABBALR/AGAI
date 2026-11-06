const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'modules/05-admin-js-partie-1-2-vues-globales-superadmin.js'),'utf8');
const storage=fs.readFileSync(path.join(root,'modules/17-animal-js.js'),'utf8');
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('la vue attend le chargement complet avant d’afficher les effectifs',()=>{
  const source=between(admin,'function renderSuperAdminStationRoster(station){','function renderSuperAdminAdminOverview(){');
  const station={id:'CIS01',nom:'Une',couleur:'#C0392B'};
  const nodes={'sa-station-roster-CIS01':{innerHTML:''},mo:{style:{display:''}}};
  const rendered=[];
  const ctx={SUPERADMIN_ALL_STATIONS_LOADED:false,CASERNE_DATA:{CIS01:{users:[{nom:'Martin',prenom:'Anne'}],ivs:[{id:1}],equipes:[]}},
    OP_CASERNES:()=>[station],isInterventionComptabilisee:()=>true,
    escHtml:value=>String(value),refreshSuperAdminStationAdmins:()=>{},renderSuperAdmin:()=>rendered.push(true),
    document:{getElementById:id=>nodes[id]||null,activeElement:{tagName:'BODY'}}};
  vm.runInNewContext(source+'\nglobalThis.renderRoster=renderSuperAdminStationRoster;globalThis.refreshRoster=refreshSuperAdminStationRoster;',ctx);
  assert.match(ctx.renderRoster(station),/Chargement des effectifs/);
  assert.doesNotMatch(ctx.renderRoster(station),/>0<\/div><div style="color:#666;">Pompiers/);
  ctx.refreshRoster();
  assert.equal(rendered.length,1);
  ctx.refreshRoster();
  assert.match(nodes['sa-station-roster-CIS01'].innerHTML,/>1<\/div><div style="color:#666;">Pompiers/);
  assert.match(nodes['sa-station-roster-CIS01'].innerHTML,/Martin Anne/);
});

test('le chargement global rafraîchit la vue, sans toucher aux pulls ciblés',()=>{
  const pull=between(storage,'async function _rcPull(silent,deferViewsUntilLogin,skipPendingPush){','// ── Temps réel records ──');
  assert.match(pull,/requestedScope===''&&GLOBAL_ROLE==='superadmin'[\s\S]*?refreshSuperAdminStationRoster\(\)/);
  assert.match(pull,/requestedScope===''&&GLOBAL_ROLE==='superadmin'[\s\S]*?superAdminStationRosterLoadFailed\(\)/);
  assert.match(admin,/onclick="saOpenChefCorpsManagement\(\)"/);
  assert.match(admin,/function saOpenChefCorpsManagement\(\)/);
});
