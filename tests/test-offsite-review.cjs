const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modules/28-offsite-review-js.js'),'utf8');
const syncSource=fs.readFileSync(path.join(root,'modules/17-animal-js.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261120140000_review_offsite_departures.sql'),'utf8');
function sourceOf(name,text=source){
  const start=text.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' absent');
  const body=text.indexOf('{',start);let depth=0;
  for(let i=body;i<text.length;i++){
    if(text[i]==='{')depth++;
    if(text[i]==='}'&&!--depth)return text.slice(start,i+1);
  }
  throw Error('Fonction incomplète : '+name);
}

test('la décision ne vaut que pour la mesure GPS correspondante',()=>{
  const context={String,Number,Array,operationalStartOffsiteConfirmed:control=>control.horsCaserne===true};
  vm.createContext(context);
  for(const name of ['offsiteReviewFor','offsiteReviewPending'])vm.runInContext(sourceOf(name),context);
  const iv={_departGeoControle:{horsCaserne:true,date:'20261120_1435'}};
  assert.equal(context.offsiteReviewPending(iv),true);
  iv._departGeoReview={status:'refuse',sourceDate:'20261120_1435'};
  assert.equal(context.offsiteReviewPending(iv),false);
  iv._departGeoControle.date='20261121_0920';
  assert.equal(context.offsiteReviewPending(iv),true);
});

test('le RPC reçoit la clé complète de la fiche, et non le seul numéro APL',()=>{
  const context={String,isPilpIntervention:iv=>iv.pilp===true};vm.createContext(context);
  vm.runInContext(sourceOf('offsiteReviewRecordId'),context);
  const apl='APL_2026_000671-Rmwnqzkd5-272190f902';
  assert.equal(context.offsiteReviewRecordId({id:apl},'CIS05'),'CIS05__iv__'+apl);
  assert.equal(context.offsiteReviewRecordId({id:'CIS05__iv__'+apl},'CIS05'),'CIS05__iv__'+apl);
  assert.equal(context.offsiteReviewRecordId({id:apl,pilp:true},'CIS05'),'CIS05__pilp__'+apl);
  assert.match(source,/p_record_id:recordId/);
});

test('une ancienne copie ne retire pas la décision administrative lors de la fusion',()=>{
  const context={Number,JSON,Object,Array};vm.createContext(context);
  vm.runInContext(sourceOf('_rcMergeOffsiteReviewFields',syncSource),context);
  const remote={_serverRevision:7,_hDebut:'14:45',_departGeoReview:{status:'refuse',actionId:'ok'},
    _departGeoReviewHistory:[{actionId:'ok'}]};
  const oldCopy={_serverRevision:6,_hDebut:'14:35'};
  const merged={...oldCopy};
  assert.equal(context._rcMergeOffsiteReviewFields(remote,oldCopy,merged),true);
  assert.equal(merged._hDebut,'14:45');
  assert.equal(merged._departGeoReview.actionId,'ok');
});

test('le trajet arrondit vers le haut et garde l’heure GPS originale',()=>{
  const context={String,Number,Math};vm.createContext(context);
  for(const name of ['offsiteReviewRecordedTime','offsiteReviewAddMinutes'])vm.runInContext(sourceOf(name),context);
  assert.equal(context.offsiteReviewRecordedTime({date:'20261120_1435'}),'14:35');
  assert.equal(context.offsiteReviewAddMinutes('14:35',Math.ceil(541/60)),'14:45');
  assert.equal(context.offsiteReviewAddMinutes('bad',8),'');
});

test('un conflit de révision explique le refus sans masquer la saisie',()=>{
  const context={String};vm.createContext(context);
  vm.runInContext(sourceOf('offsiteReviewFailureMessage'),context);
  assert.match(context.offsiteReviewFailureMessage('AGAI_OFFSITE_REVIEW_STALE_SOURCE',400),/fiche a changé/);
  assert.match(context.offsiteReviewFailureMessage('AGAI_OFFSITE_REVIEW_AFTER_END',400),/aucune heure modifiée/);
});

test('la validation utilise un RPC administratif avec révision, motif et trace conservée',()=>{
  assert.match(source,/rpc\/agai_review_offsite_departure/);
  assert.match(source,/p_expected_record_revision:Number\(iv\._serverRevision\)\|\|0/);
  assert.match(source,/reason\.length<10/);
  assert.match(migration,/actor\.app_role not in \('superadmin','administrateur_caserne'\)/);
  assert.match(migration,/AGAI_OFFSITE_REVIEW_STALE_SOURCE/);
  assert.match(migration,/_departGeoReviewHistory/);
  assert.match(migration,/AGAI_OFFSITE_REVIEW_RPC_REQUIRED/);
  assert.match(migration,/AGAI_OFFSITE_REVIEW_AFTER_END/);
});
