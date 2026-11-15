const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../modules/12-astreintes-js.js'),'utf8');
const start=source.indexOf('function astrScheduleHistory(');
const end=source.indexOf('// ── Utilitaires dates semaine',start);
assert.ok(start>=0&&end>start);
function schedule(config,caserne){
  const context={ASTR_CONFIG:config,CURRENT_CASERNE_ID:caserne};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  return context;
}

test('UT Lapugnoy reconnaît sa transition 08 h vers 07 h sans réécrire le passé',()=>{
  const context=schedule({weekStartHour:7},'CIS05');
  assert.equal(context.astrScheduleForWeek('20261109').weekStartHour,8);
  assert.equal(context.astrScheduleForWeek('20261116').weekStartHour,7);
  assert.equal(context.ASTR_CONFIG.scheduleHistory,undefined,'le contrôle reste sans écriture');
});

test('les anciennes semaines conservent 08 h et le 16 novembre passe à 07 h',()=>{
  const context=schedule({weekStartHour:7,scheduleHistory:[
    {effectiveWeek:'00000000',weekStartHour:8,afternoonStart:12,eveningStart:18,nightStart:24},
    {effectiveWeek:'20261116',weekStartHour:7,afternoonStart:12,eveningStart:18,nightStart:24}
  ]});
  assert.equal(context.astrScheduleForWeek('20261109').weekStartHour,8);
  assert.equal(context.astrScheduleForWeek('20261116').weekStartHour,7);
  assert.deepEqual(Array.from(context.astrPeriodsForWeek('20261116'),p=>[p.label,p.from,p.to]),[
    ['Matin',420,720],['Après-midi',720,1080],['Soir',1080,1440],['Nuit',1440,1860]
  ]);
});

test('une future règle 06 h ne change ni les semaines passées ni le stockage minuit historique',()=>{
  const context=schedule({weekStartHour:0,scheduleHistory:[
    {effectiveWeek:'20261130',weekStartHour:6,afternoonStart:12,eveningStart:18,nightStart:24}
  ]});
  assert.equal(context.astrScheduleForWeek('20261123').weekStartHour,0);
  assert.deepEqual(Array.from(context.astrPeriodsForWeek('20261123'),p=>[p.from,p.to]),[
    [480,720],[720,1080],[1080,1440],[0,480]
  ]);
  assert.equal(context.astrScheduleForWeek('20261130').weekStartHour,6);
  assert.equal(context.astrPeriodsForWeek('20261130')[3].to,1800);
});
