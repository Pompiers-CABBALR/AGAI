const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/renfort-server-availability-review.sql'),
  'utf8'
);
const client = fs.readFileSync(
  path.join(__dirname, '../modules/22-renforts-auth-js.js'),
  'utf8'
);

assert.match(sql, /renfort_active_member_logins\(p_data jsonb\)/);
assert.match(sql, /renfort_active_vehicle_names\(p_data jsonb\)/);
assert.match(sql, /perform pg_advisory_xact_lock\(hashtext\(/);
assert.match(sql, /active\.data->>'s'='en-cours'/);
assert.match(sql, /renfort_active_member_logins\(active\.data\) && p_members/);
assert.match(sql, /renfort_active_vehicle_names\(active\.data\)/);
assert.match(sql, /AGAI_RENFORT_RESOURCES_BUSY/);
assert.match(sql, /revoke execute on function agai_private\.renfort_active_member_logins\(jsonb\)/);
assert.doesNotMatch(sql, /grant execute on function public\.agai_renfort_/i);
assert.match(client, /function secureStartRenfort\(id,authorized\)\{[\s\S]*?canUseOperationalStartInterface\(\)/);

console.log('Renfort : disponibilité vérifiée côté serveur, départ limité aux appareils autorisés.');
