const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations',
  '20261031125525_authorize_atomic_transfer_destination.sql'), 'utf8');

const writer = sql.split('create or replace function agai_private.transfer_intervention(')[0];
const transfer = sql.split('create or replace function agai_private.transfer_intervention(')[1];
assert.ok(writer && transfer);

// A cross-station exception requires a private event bound to this one new
// destination row, source station, authenticated actor, APL and action key.
assert.match(writer, /if p_caserne<>actor\.caserne_id then[\s\S]*?return false;[\s\S]*?end if;/);
assert.match(writer, /if p_type='iv'/);
assert.match(writer, /not exists \(select 1 from public\.records existing where existing\.id=p_id\)/);
for (const field of [
  'destination_record_id=p_id',
  'destination_caserne=p_caserne',
  'source_caserne=actor.caserne_id',
  "source_caserne=p_data->>'_transfertDe'",
  'actor_login=actor.login',
  "actor_login=p_data->>'op'",
  "source_record_id=p_data->>'_transfertSourceRecordId'",
  "apl=p_data->>'_numApl'",
  "reason=p_data->>'_transfertMotif'",
  "action_key::text=p_data->>'_aplReservationKey'",
  "p_data->>'s'='en-attente'",
]) assert.ok(writer.includes(field), `missing event binding: ${field}`);

const eventInsert = transfer.indexOf('insert into agai_private.transfer_events (');
const createDestination = transfer.indexOf('perform public.agai_atomic_upsert_record(\n    destination_record_id');
const closeSource = transfer.indexOf('perform public.agai_atomic_upsert_record(\n    p_source_record_id');
assert.ok(eventInsert > 0 && eventInsert < createDestination);
assert.ok(createDestination < closeSource);
assert.equal(transfer.indexOf('insert into agai_private.transfer_events (', eventInsert + 1), -1);
assert.match(transfer, /source_row\.data->>'s' is distinct from 'en-attente'/);
assert.match(transfer, /source_row\.caserne<>actor\.caserne_id/);
assert.match(transfer, /source_revision<>p_expected_record_revision/);
assert.match(sql, /revoke execute on function agai_private\.transfer_intervention\(/);
assert.doesNotMatch(sql, /grant execute on function agai_private\.transfer_intervention/);

console.log('Transfer destination: private one-time event precedes both atomic writes; ordinary cross-station writes remain blocked.');
