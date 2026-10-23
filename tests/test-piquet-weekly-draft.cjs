const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../modules/26-piquet-weekly-js.js'),'utf8');
const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
function contextFor(users,options={}){
  const dispos={};
  for(const user of users){
    dispos[user.l]={};
    for(let day=0;day<7;day++)for(let slot=0;slot<24;slot++)
      dispos[user.l][day+'_'+slot]=true;
  }
  const teams=[
    {id:'forte',membres:['ca-f','conducteur-f']},
    {id:'faible',membres:['ca-b','conducteur-b']}
  ];
  const context={
    USERS:users,DISPOS:{week:dispos},PIQUETS:{week:options.existing||[]},
    ASTR_CONFIG:{granularity:60,weekStartHour:0},JOURS_FULL:days,
    getSlotsPerDay:()=>24,planningEquipeGroups:()=>teams.map((eq,i)=>({eq,tone:i?'faible':'forte'})),
    getEquipeOfUser:login=>teams.find(eq=>eq.membres.includes(login)),
    isChefAgresByGrade:user=>user.chief===true,
    personnelDispoSlotAllowed:()=>true,
    hasConflitPiquet:options.conflict||(()=>false),
    piquetToAbsRangeIdx:(day,debut,fin)=>{
      const toMin=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
      const a=toMin(debut),b=toMin(fin);
      return [day*1440+a,day*1440+b+(b<=a?1440:0)];
    },
    timeToMin:value=>Number(value.slice(0,2))*60+Number(value.slice(3)),
    isVPI:()=>false,escHtml:value=>String(value),
    fullName:user=>user.l,showToast:()=>{},
    document:{getElementById:()=>null,querySelectorAll:()=>[]},
    pqSyncTimes:()=>{},pqFinHint:()=>{},pqRefreshDispos:()=>{},
    _encodeRole:role=>role.replace(/[^a-zA-Z0-9]/g,'_')
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return {context,dispos};
}
test('aperçu VTU : 28 tranches, priorité forte initiale puis répartition sur la semaine',()=>{
  const users=[
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'},
    {l:'sans'}
  ];
  const {context}=contextFor(users);
  const before=JSON.stringify(context.PIQUETS);
  const draft=context.pqDraftPlan('week','VTU-01');
  assert.equal(draft.length,28);
  assert.equal(draft.slice(0,4).map(s=>s.label).join(','),'Matin,Après-midi,Soir,Nuit');
  assert.equal(draft[0].chief,'ca-f');
  assert.equal(draft[0].driver,'conducteur-f');
  assert.ok(draft.some(s=>s.chief==='ca-b'),'la faible doit être sollicitée pour équilibrer la semaine');
  assert.equal(JSON.stringify(context.PIQUETS),before,'aucun piquet n’est enregistré par l’aperçu');
});
test('chef seul ou conducteur seul : créneau incomplet, jamais prêt au départ',()=>{
  const chief=contextFor([{l:'ca-f',chief:true}]);
  const onlyChief=chief.context.pqDraftPlan('week','VTU-01')[0];
  assert.equal(onlyChief.state,'partial');
  assert.equal(onlyChief.chief,'ca-f');
  assert.equal(onlyChief.driver,'');
  const driver=contextFor([{l:'conducteur-f'}]);
  const onlyDriver=driver.context.pqDraftPlan('week','VTU-01')[0];
  assert.equal(onlyDriver.state,'partial');
  assert.equal(onlyDriver.chief,'');
  assert.equal(onlyDriver.driver,'conducteur-f');
});
test('les heures restent alignées sur le planning même si la journée de disponibilité commence à 08 h',()=>{
  const {context,dispos}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  context.ASTR_CONFIG.weekStartHour=8;
  const draft=context.pqDraftPlan('week','VTU-01');
  assert.equal(draft[0].debut,'08:00');
  assert.equal(draft[0].fin,'12:00');
  assert.equal(draft[3].debut,'00:00');
  assert.equal(draft[3].fin,'08:00');
  assert.equal(draft[3].state,'ready');
  delete dispos['ca-f']['0_16'];
  assert.equal(context.pqDraftPlan('week','VTU-01')[3].state,'partial');
});
test('aucune proposition si la disponibilité, un conflit ou un piquet existant couvre la tranche',()=>{
  const users=[{l:'ca-f',chief:true},{l:'conducteur-f'}];
  const {context,dispos}=contextFor(users);
  for(let slot=8;slot<12;slot++)delete dispos['ca-f']['0_'+slot];
  assert.equal(context.pqDraftPlan('week','VTU-01')[0].state,'partial');
  const blocked=contextFor(users,{conflict:(_wk,login)=>login==='conducteur-f'});
  assert.equal(blocked.context.pqDraftPlan('week','VTU-01')[0].state,'partial');
  const existing=contextFor(users,{existing:[{
    engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'12:00',
    chefAgres:'ca-f',conducteur:'conducteur-f'
  }]});
  assert.equal(existing.context.pqDraftPlan('week','VTU-01')[0].state,'existing');
  const incomplete=contextFor(users,{existing:[{
    engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'12:00',
    chefAgres:'ca-f',conducteur:''
  }]});
  assert.equal(incomplete.context.pqDraftPlan('week','VTU-01')[0].state,'existing-partial');
});
test('préremplissage : la proposition est revérifiée et ne sauvegarde rien',()=>{
  const {context}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  const controls={
    'pq-jour':{value:'',dataset:{}},'pq-debut':{value:'',dataset:{}},
    'pq-fin':{value:'',dataset:{}},'pq-suggestions':{innerHTML:''}
  };
  const roles=['Chef d’agrès','Conducteur','Équipier'];
  const selects=roles.map(role=>({value:'',dataset:{role:context._encodeRole(role)}}));
  context.document={
    getElementById:id=>controls[id]||null,
    querySelectorAll:selector=>selector==='.pq-agent-sel'?selects:[]
  };
  vm.runInContext('_pqWeeklyDraft=pqDraftPlan("week","VTU-01")',context);
  context.applySuggestion(0);
  assert.equal(controls['pq-jour'].value,'Lundi');
  assert.equal(controls['pq-debut'].value,'08:00');
  assert.equal(controls['pq-fin'].value,'12:00');
  assert.equal(selects[0].value,'ca-f');
  assert.equal(selects[1].value,'conducteur-f');
  assert.match(controls['pq-suggestions'].innerHTML,/non enregistré/);
  assert.equal(context.PIQUETS.week.length,0);
});
test('le raccourci de la page piquets ouvre la proposition VTU sans enregistrer',()=>{
  const {context}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  context.ASTR_CONFIG.engins=['VPI','VTU-01'];
  const calls=[];
  context.addPiquet=(...args)=>calls.push(['form',...args]);
  context.suggestCreneaux=(...args)=>calls.push(['draft',...args]);
  context.openPiquetWeekly('week');
  assert.equal(JSON.stringify(calls),JSON.stringify([
    ['form','week','VTU-01','Lundi'],['draft','week','VTU-01']
  ]));
  assert.equal(context.PIQUETS.week.length,0);
});
test('une semaine avec piquet incomplet ne peut pas être marquée validée',()=>{
  const planning=fs.readFileSync(path.join(__dirname,'../modules/12-astreintes-js.js'),'utf8');
  const start=planning.indexOf('function validerPiquets(){');
  const end=planning.indexOf('function exportPiquets(){',start);
  assert.ok(start>=0&&end>start);
  let confirmed=false,warning='';
  const context={
    astrPiquetWeek:0,getMondayOfWeek:()=>new Date(),weekKey:()=> 'week',
    PIQUETS:{week:[{chefAgres:'ca-f',conducteur:''}]},
    showToast:message=>{warning=message;},
    confirmModal:()=>{confirmed=true;}
  };
  vm.createContext(context);
  vm.runInContext(planning.slice(start,end),context);
  context.validerPiquets();
  assert.equal(confirmed,false);
  assert.match(warning,/chef et conducteur requis/);
});
