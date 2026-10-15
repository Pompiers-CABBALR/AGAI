const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'supabase');
const first = fs.readFileSync(path.join(root,
  'renfort-superadmin-destination-review.sql'), 'utf8');
const locked = fs.readFileSync(path.join(root,
  'renfort-superadmin-locked-source-review.sql'), 'utf8');

assert.match(first, /start_renfort\(uuid,text\[\],text,uuid\)/);
assert.match(first, /finish_renfort\(uuid,uuid,bigint\)/);
assert.match(first, /request_row\.destination_caserne<>actor\.caserne_id\s+and actor\.app_role<>'superadmin'/);
assert.match(locked, /request_row\.source_record_id is distinct from source_row\.id/);
assert.match(locked, /request_row\.destination_caserne<>actor\.caserne_id\s+and actor\.app_role<>'superadmin'/);
assert.doesNotMatch(first + locked, /grant execute/i);
console.log('Renforts : dérogation superadmin cohérente après verrouillage, comptes ordinaires limités.');
