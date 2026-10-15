const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase',
  'renfort-server-vehicle-catalog-review.sql'), 'utf8');
assert.match(sql, /configuration\.id=request_row\.destination_caserne\|\|'__config__main'/);
assert.match(sql, /configuration\.caserne=request_row\.destination_caserne/);
assert.match(sql, /configuration\.type='config' and not configuration\.deleted/);
assert.match(sql, /lower\(btrim\(configured\.name\)\)=lower\(clean_vehicle\)/);
assert.match(sql, /AGAI_RENFORT_VEHICLE_UNKNOWN/);
assert.doesNotMatch(sql, /grant execute/i);
console.log('Renforts : véhicule contrôlé côté serveur dans le catalogue de la caserne.');
