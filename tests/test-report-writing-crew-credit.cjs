const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');

const root=path.join(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'modules/14-stats-js.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
function sourceOf(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' absent');
  const body=source.indexOf('{',start);let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error(name+' incomplet');
}
const functions=[
  'reportWritingCreditIsoMs','reportWritingCreditHasFollowingIntervention',
  'reportWritingCreditWindow','reportWritingCreditPresentAtClose',
  'forEachReportWritingCreditMinute','getAgentPresenceOnIV',
  'calcTauxAgentIV','calcExportTauxAgentIV','adminExportInterventionRates'
];
function harness(){
  const context={
    IVS:[],PILP_IVS:[],Date,Math,Number,String,
    N:()=>new Date('2026-11-02T18:00:00Z'),
    getHHMM:date=>new Intl.DateTimeFormat('fr-FR',{
      timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).format(date),
    interventionInternalReinforcements:()=>[],
    isInterventionReportChef:(iv,login)=>login===iv.agr,
    statsInterventionDateKey:()=> '20261102',
    adminExportInterventionStartDate:()=> '20261102',
    adminExportInterventionDurationBounds:iv=>({start:iv._hDebut,end:iv._hFin}),
    adminExportReportType:()=> 'INTER',
    getInterventionTauxConfigFor:()=>({categorie:'jour',valeur:100}),
    getStatsTaux:()=>({exportRoundQuarter:false}),
    adminExportRoundMinutesQuarter:value=>Math.ceil(value/15)*15,
    agentInIV:(iv,login)=>[].concat(iv._equipage1||[],iv._releves?.flatMap(r=>r.nouvelEquipage||[])||[]).some(member=>member.login===login),
    adminExportDuration:(ignored,start,end)=>start&&end?'01:00':'',
    adminExportRoundDurationQuarter:value=>value,
    adminExportFormatInterventionMinutes:value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0')
  };
  vm.createContext(context);
  vm.runInContext("const REPORT_WRITING_CREDIT_START_AT='2026-11-01T00:00:00Z'; const REPORT_WRITING_CREDIT_MAX_MINUTES=10;",context);
  for(const name of functions)vm.runInContext(sourceOf(moduleSource,name),context);
  const iv={id:'iv1',s:'terminee',agr:'chef',h:'20261102_1700',_hDebut:'17:00',_hFin:'18:00',
    _equipage1:[{login:'chef'},{login:'conducteur'},{login:'releve'}],
    _releves:[{hReleve:'17:40',ancienEquipage:[{login:'releve'}],nouvelEquipage:[{login:'remplaçant'}]}],
    _crValide:true,_crValidePar:'chef',_closeClientAtIso:'2026-11-02T17:00:00Z',
    _crClientValideAt:'2026-11-02T17:07:00Z',_crValideAt:'2026-11-02T17:30:00+00:00'};
  context.IVS=[iv];
  return {context,iv};
}

test('sept minutes de rédaction vont au chef et aux équipiers encore présents, même après une sync tardive',()=>{
  const {context,iv}=harness();
  assert.equal(context.reportWritingCreditWindow(iv).minutes,7);
  assert.equal(context.calcTauxAgentIV(iv,'chef').t100,67);
  assert.equal(context.calcTauxAgentIV(iv,'conducteur').t100,67);
  assert.equal(context.calcTauxAgentIV(iv,'remplaçant').t100,27);
  assert.equal(context.calcTauxAgentIV(iv,'releve').t100,40);
  assert.equal(context.calcExportTauxAgentIV(iv,'chef').t100,67);
  assert.equal(context.calcExportTauxAgentIV(iv,'releve').t100,60,'un agent relevé ne reçoit pas le supplément');
  assert.equal(context.adminExportInterventionRates(iv,[iv]).heures1,'01:07');
  assert.equal(iv._hFin,'18:00','la clôture officielle ne change pas');
});

test('validation tardive, absente, administrative, SDIS ou antérieure au lancement : aucun supplément',()=>{
  const {context,iv}=harness();
  for(const changed of [
    {_crClientValideAt:'2026-11-02T17:10:01Z'},
    {_crValide:false},
    {_crValidePar:'admin'},
    {_sdis:true},
    {_closeClientAtIso:'2026-10-31T17:00:00Z'},
    {_closeClientAtIso:'2026-11-02T16:50:00Z'},
    {_crValideAt:undefined},
    {_heureFinModifiee:true}
  ]){
    const copy={...iv,...changed};
    assert.equal(context.reportWritingCreditWindow(copy),null,JSON.stringify(changed));
  }
});

test('dix minutes exactement sont admises, mais pas une seconde de plus',()=>{
  const {context,iv}=harness();
  assert.equal(context.reportWritingCreditWindow({...iv,_crClientValideAt:'2026-11-02T17:10:00Z'}).minutes,10);
  assert.equal(context.reportWritingCreditWindow({...iv,_crClientValideAt:'2026-11-02T17:10:01Z'}),null);
  assert.equal(context.reportWritingCreditWindow({...iv,_crClientValideAt:'2026-11-02T17:00:30Z'}),null,
    'moins d’une minute entière ne donne aucun supplément');
});

test('seule la dernière intervention d’une série reçoit le temps du rapport',()=>{
  const {context,iv}=harness();
  const next={...iv,id:'iv2',_chainedFromInterventionId:iv.id,_hDebut:'18:00',_hFin:'19:00',
    _closeClientAtIso:'2026-11-02T18:00:00Z',
    _crClientValideAt:'2026-11-02T18:06:00Z',_crValideAt:'2026-11-02T18:07:00Z'};
  context.IVS=[iv,next];
  assert.equal(context.reportWritingCreditWindow(iv),null);
  assert.equal(context.reportWritingCreditWindow(next).minutes,6);
  assert.equal(context.adminExportInterventionRates(iv,[iv,next]).heures1,'01:00');
  assert.equal(context.adminExportInterventionRates(iv,[iv]).heures1,'01:00',
    'une suite hors de la période exportée exclut aussi le supplément');
});

test('le module, le bundle et les captures d’horodatage restent cohérents',()=>{
  for(const name of functions)assert.equal(sourceOf(moduleSource,name),sourceOf(bundle,name),name);
  for(const [file,pattern] of [
    ['modules/08-interventions-js.js',/_closeClientAtIso=opts\._closeIso/],
    ['modules/16-email-js.js',/_crClientValideAt = validatedAt\.toISOString\(\)/]
  ])assert.match(fs.readFileSync(path.join(root,file),'utf8'),pattern);
  assert.match(moduleSource,/REPORT_WRITING_CREDIT_START_AT='2026-11-01T20:48:13Z'/,
    'le calcul commence à la publication, sans rétroactivité');
});
