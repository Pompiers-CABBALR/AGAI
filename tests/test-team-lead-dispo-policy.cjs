const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20261028194602_permit_team_lead_station_dispo.sql'),'utf8');

test('le droit du responsable est limité aux disponibilités de sa caserne',()=>{
  assert.match(sql,/if p_caserne<>actor\.caserne_id then return false/);
  assert.match(sql,/if p_type='dispo' then[\s\S]*?team\.caserne=p_caserne and team\.type='equipe' and not team\.deleted/);
  assert.match(sql,/team\.data->>'resp'=actor\.login/);
  assert.match(sql,/personnel\.id=p_caserne\|\|'__user__'\|\|\(p_data->>'login'\)/);
  assert.match(sql,/p_id=p_caserne\|\|'__dispo__'\|\|\(p_data->>'wk'\)\|\|'__'\|\|\(p_data->>'login'\)/);
});

test('les réglages et les comptes conservent leurs protections distinctes',()=>{
  assert.match(sql,/if p_type='global' then[\s\S]*?actor\.app_role<>'superadmin'/);
  assert.match(sql,/if p_type in \('user','config','equipe','astrTelDuty'\) then[\s\S]*?actor\.app_role='administrateur_caserne'/);
  assert.match(sql,/p_data \?\| array\['p','password_hash','passwordHash'\]/);
});
