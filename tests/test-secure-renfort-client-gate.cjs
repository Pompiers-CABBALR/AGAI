const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'runtime-config.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'modules/22-renforts-auth-js.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js'), 'utf8');
const pause = fs.readFileSync(path.join(root, 'supabase/migrations/20261014232000_renfort_rpc_paused.sql'), 'utf8');
const lockOrder = fs.readFileSync(path.join(root, 'supabase/renfort-consistent-lock-order-APPLIED.sql'), 'utf8');

assert.match(config, /secureRenfortsEnabled:\s*false/);
assert.match(auth, /get\('secureRenfortPilot'\)==='1'/);
assert.match(index, /modules\/22-renforts-auth-js\.js/);
assert.match(pause, /revoke execute on function public\.agai_renfort_send/i);
assert.match(pause, /revoke execute on function public\.agai_renfort_start/i);
assert.match(lockOrder, /request_row\.source_record_id is distinct from source_row\.id/);
assert.match(lockOrder, /request_row\.destination_caserne<>actor\.caserne_id[\s\S]*?request_row\.source_record_id is distinct from source_row\.id/);
assert.match(lockOrder, /request_row\.source_record_id is distinct from source_row\.id[\s\S]*?select \* into source_row from public\.records\s+where id=request_row\.source_record_id for update/);
assert.match(client, /if\(SECURE_RENFORTS_ENABLED\)\s*\{/);
assert.match(client, /secureRenfortRpc\('agai_renfort_send'/);
assert.match(client, /secureRenfortRpc\('agai_renfort_answer'/);
assert.match(client, /secureRenfortRpc\('agai_renfort_start'/);
assert.match(client, /secureRenfortRpc\('agai_renfort_finish'/);
assert.match(client, /secureRenfortRpc\('agai_renfort_cancel'/);
assert.match(client, /function secureShowRenfortCrew\(id\)\{[\s\S]*?canUseOperationalStartInterface\(\)/);
assert.match(client, /function secureStartRenfort\(id,authorized\)\{[\s\S]*?canUseOperationalStartInterface\(\)/);
assert.match(client, /if\(_secureRenfortFetchPromise\)return _secureRenfortFetchPromise/);
assert.match(client, /localStorage\.setItem\(storageKey,key\)/);
assert.match(client, /const refreshed=await secureRefreshRenforts\(true\);\s*cM\(\);\s*if\(refreshed\)\{\s*secureClearRenfortActionKey\(iv\.id,'send'\)/);
assert.match(client, /Départ enregistré sur le serveur, mais affichage à actualiser/);
assert.match(client, /getRenfortsEnAttente=function\(\)\{return \[\];\}/);
assert.match(client, /const count=secureRenfortPending\(\)\.length/);
assert.match(client, /AGAI_RENFORT_RESOURCES_BUSY:'Un agent ou un véhicule est déjà engagé/);
assert.match(client, /AGAI_RENFORT_VEHICLE_UNKNOWN:'Ce véhicule ne figure plus/);
assert.doesNotMatch(client.replace(/^\s*\/\/.*$/gm,''),
  /\bsaveData\s*\(|\b_rcPushRecords\s*\(/);

const oldShow = () => 'ancien';
const sandbox = {SECURE_RENFORTS_ENABLED:false,showRenfortModal:oldShow};
vm.runInNewContext(client,sandbox);
assert.equal(sandbox.showRenfortModal,oldShow);

const badge = {textContent: '', style: {display: ''}};
const active = {
  SECURE_RENFORTS_ENABLED: true,
  CURRENT_CASERNE_ID: 'CIS05',
  showRenfortModal: oldShow,
  envoyerRenfort: () => {}, repondreRenfort: () => {},
  showRenfortEquipageModal: () => {}, confirmerRenfortEquipage: () => {},
  cloturerRenfort: () => {}, annulerRenfortUT: () => {},
  getRenfortsEnAttente: () => [{id: 'legacy'}],
  updateRenfortBadge: () => {}, rI: () => {}, oM: () => {},
  document: {getElementById: () => badge},
  window: {setInterval: () => {}}
};
vm.createContext(active);
vm.runInContext(client,active);
vm.runInContext("_secureRenfortRows=[{id:'new',destination_caserne:'CIS05',status:'en-attente'}]",active);
assert.equal(active.getRenfortsEnAttente().length,0,'ancien panneau désactivé');
active.updateRenfortBadge();
assert.equal(badge.textContent,1,'badge issu du nouveau circuit');

console.log('Renforts : interface nouvelle disponible en pilote, désactivée par défaut ; ancien parcours fermé.');
