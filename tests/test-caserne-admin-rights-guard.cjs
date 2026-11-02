const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ui=read('modules/11-admin-js-partie-2-2-gestion-utilisateurs.js');
const setter=read('modules/05-admin-js-partie-1-2-vues-globales-superadmin.js');
const edge=read('supabase/functions/agai-account-link/index.ts');
const sql=read('supabase/migrations/20261102165340_guard_caserne_admin_assignments.sql');

test('la case Administration et sa fonction restent réservées au superadmin',()=>{
  assert.match(ui,/const adminDisabled=isSA\|\|GLOBAL_ROLE!=='superadmin'/);
  assert.match(setter,/function setCaserneAdmin\(caserneId,login,enabled\)\{\s*if\(GLOBAL_ROLE!=='superadmin'\)/);
});

test('le service de comptes refuse qu’un admin promeuve un autre compte',()=>{
  assert.match(edge,/mode === 'admin_provision'[\s\S]*?callerRole !== 'superadmin' && \(targetStation !== callerStation \|\| targetRole !== 'agent'\)/);
  assert.match(edge,/mode === 'admin_sync'[\s\S]*?callerRole !== 'superadmin' && \(targetStation !== callerStation \|\| targetRole !== 'agent'\)/);
  assert.match(edge,/currentTarget\.app_role !== 'agent'/);
});

test('la synchronisation protège les administrateurs de la configuration et des fiches',()=>{
  assert.match(sql,/incoming := incoming - 'adminLogins' - 'adminLogin'/);
  assert.match(sql,/previous->'adminLogins'/);
  assert.match(sql,/previous->'adminLogin'/);
  assert.match(sql,/previous->'rights' @> '\["Administration"\]'::jsonb/);
  assert.match(sql,/incoming->'rights' @> '\["Administration"\]'::jsonb/);
  assert.match(sql,/\('superadmin', 'chef_corps', 'administrateur_caserne'\)/);
  assert.match(sql,/incoming := incoming - '_isSA'/);
  assert.match(sql,/actor_role is distinct from 'administrateur_caserne'/);
  assert.match(sql,/new\.deleted := old\.deleted/);
  assert.match(sql,/before insert or update of data, type, deleted on public\.records/);
  assert.doesNotMatch(sql,/\bupdate public\.records\b/i);
  assert.doesNotMatch(sql,/\bdelete from public\.records\b/i);
});
