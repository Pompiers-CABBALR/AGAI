const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../modules/26-piquet-weekly-js.js'),'utf8');
const assembled=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
function functionSource(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const body=source.indexOf('{',start);
  let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error('Unclosed '+name);
}
test('le module et le script assemblé gardent la même préparation VTU',()=>{
  assert.ok(assembled.replace(/\r\n/g,'\n').includes(source.replace(/\r\n/g,'\n').trimEnd()));
});
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
    PIQUETS_VALIDATED:{},PLANNING_ROTATIONS:{week:['forte','faible']},
    CURRENT_CASERNE_ID:'CIS05',astrPiquetWeek:0,
    ASTR_CONFIG:{granularity:60,weekStartHour:0,engins:['VTU-01']},JOURS_FULL:days,
    astrScheduleForWeek:()=>({weekStartHour:context.ASTR_CONFIG.weekStartHour,afternoonStart:12,eveningStart:18,nightStart:24}),
    astrPeriodsForWeek:()=>[
      {key:'m',label:'Matin',from:480,to:720},{key:'a',label:'Après-midi',from:720,to:1080},
      {key:'s',label:'Soir',from:1080,to:1440},{key:'n',label:'Nuit',from:0,to:480}
    ],
    sortVehicleNames:list=>list.slice().sort(),piquetDepartureLabel:engin=>engin,
    getMondayOfWeek:()=>new Date(2026,9,26),weekKey:()=> 'week',
    hasRight:()=>true,isRespEquipe:()=>false,
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
    _encodeRole:role=>role.replace(/[^a-zA-Z0-9]/g,'_'),
    confirmModal:()=>{},logPiquetChange:()=>{},saveData:()=>{},cM:()=>{},rAstrPiquets:()=>{},addPiquet:()=>{}
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return {context,dispos};
}
function preview(context){
  const target={innerHTML:'',querySelector:()=>null};
  context.document.getElementById=id=>id==='pq-suggestions'?target:null;
  context.suggestCreneaux('week','VTU-01');
  return target;
}
test('aperçu VTU : 28 tranches, chef d’agrès de l’astreinte forte prioritaire',()=>{
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
  assert.ok(draft.every(s=>s.chief==='ca-f'),'le chef de l’astreinte forte reste prioritaire quand il est disponible');
  assert.equal(JSON.stringify(context.PIQUETS),before,'aucun piquet n’est enregistré par l’aperçu');
});
test('deux sergents-chefs dans le même VTU : celui de l’astreinte forte est chef même avec plus d’heures',()=>{
  const users=[
    {l:'ca-f',chief:true,grade:'Sergent-chef'},
    {l:'ca-b',chief:true,grade:'Sergent-chef'}
  ];
  const existing=[
    {engin:'VPI',jour:'Samedi',debut:'08:00',fin:'18:00',
      membres:[{role:'Chef d’agrès',login:'ca-f'}]},
    {engin:'VPI',jour:'Dimanche',debut:'08:00',fin:'18:00',
      membres:[{role:'Chef d’agrès',login:'ca-f'}]}
  ];
  const {context}=contextFor(users,{existing});
  const monday=context.pqDraftPlan('week','VTU-01')[0];
  assert.equal(monday.state,'ready');
  assert.equal(monday.chief,'ca-f');
  assert.equal(monday.driver,'ca-b');
});
test('le chef de l’astreinte faible prend le rôle si celui de la forte est indisponible',()=>{
  const {context,dispos}=contextFor([
    {l:'ca-f',chief:true},{l:'ca-b',chief:true},{l:'conducteur-f'}
  ]);
  for(let slot=8;slot<12;slot++)delete dispos['ca-f']['0_'+slot];
  const monday=context.pqDraftPlan('week','VTU-01')[0];
  assert.equal(monday.chief,'ca-b');
  assert.equal(monday.driver,'conducteur-f');
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
  const partialNight=context.pqDraftPlan('week','VTU-01')[3];
  assert.equal(partialNight.state,'ready');
  assert.equal(partialNight.chiefHDebut,'01:00');
  assert.equal(partialNight.coverageGap,true);
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
  preview(context);
  context.document={
    getElementById:id=>controls[id]||null,
    querySelectorAll:selector=>selector==='.pq-agent-sel'?selects:[]
  };
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
test('une semaine avec piquet incomplet demande confirmation avec réserve',()=>{
  const planning=fs.readFileSync(path.join(__dirname,'../modules/12-astreintes-js.js'),'utf8');
  const start=planning.indexOf('function validerPiquets(){');
  const end=planning.indexOf('function exportPiquets(){',start);
  assert.ok(start>=0&&end>start);
  let confirmed=false,warning='';
  const context={
    astrPiquetWeek:0,getMondayOfWeek:()=>new Date(),weekKey:()=> 'week',weekLabel:()=> 'cette semaine',
    PIQUETS:{week:[{chefAgres:'ca-f',conducteur:''}]},
    showToast:message=>{warning=message;},
    confirmModal:message=>{confirmed=true;warning=message;}
  };
  vm.createContext(context);
  vm.runInContext(planning.slice(start,end),context);
  context.validerPiquets();
  assert.equal(confirmed,true);
  assert.match(warning,/départ non garanti/);
});
test('la proposition complète utilise uniquement chef et conducteur, avec priorité forte pour les deux rôles',()=>{
  const {context}=contextFor([
    {l:'ca-f',chief:true},{l:'ca-b',chief:true},
    {l:'conducteur-f'},{l:'conducteur-b'}
  ]);
  const draft=context.pqDraftPlan('week','VTU-01');
  assert.equal(draft.length,28);
  assert.ok(draft.every(slot=>slot.state==='ready'&&!('equipier' in slot)));
  assert.equal(draft[0].chief,'ca-f');
  assert.equal(draft[0].driver,'conducteur-f');
  const html=preview(context).innerHTML;
  assert.match(html,/Enregistrer en groupe les 28 créneaux proposés/);
  assert.doesNotMatch(html,/Équipier/);
});
test('la confirmation enregistre les 28 binômes sans créer de journal avant validation',()=>{
  const {context}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  const calls={confirm:null,saved:[],closed:0,rendered:0};
  context.confirmModal=(message,callback)=>{calls.confirm={message,callback};};
  context.saveData=immediate=>calls.saved.push(immediate);
  context.CU={nom:'Responsable',prenom:'Test'};
  context.CD=()=>null;
  vm.runInContext(functionSource(fs.readFileSync(path.join(__dirname,'../modules/12-astreintes-js.js'),'utf8'),
    'logPiquetChange'),context);
  context.cM=()=>{calls.closed++;};
  context.rAstrPiquets=()=>{calls.rendered++;};
  preview(context);
  assert.equal(context.PIQUETS.week.length,0);
  context.pqWeeklySaveWeek();
  assert.equal(context.PIQUETS.week.length,0,'la prévisualisation et la demande de confirmation ne sauvegardent rien');
  assert.match(calls.confirm.message,/28 créneaux/);
  calls.confirm.callback();
  assert.equal(context.PIQUETS.week.length,28);
  assert.ok(context.PIQUETS.week.every(p=>p.membres.length===2&&p.chefAgres!==p.conducteur));
  assert.equal(context.PIQUETS._log,undefined,'aucune des 28 préparations ne figure au journal');
  assert.equal(JSON.stringify(calls.saved),JSON.stringify([true]));
  assert.equal(calls.closed,1);
  assert.equal(calls.rendered,1);
  assert.equal(context.PIQUETS_VALIDATED.week,undefined);
});
test('les deux agents sont modifiables dans l’aperçu et ne peuvent pas être la même personne',()=>{
  const {context}=contextFor([
    {l:'ca-f',chief:true},{l:'ca-b',chief:true},
    {l:'conducteur-f'},{l:'conducteur-b'}
  ]);
  let callback;
  context.confirmModal=(_message,cb)=>{callback=cb;};
  const target=preview(context);
  context.pqWeeklySetChoice(0,'driver','ca-f');
  assert.match(target.innerHTML,/piquets incomplets/);
  context.pqWeeklySetChoice(0,'chief','ca-b');
  context.pqWeeklySetChoice(0,'driver','conducteur-b');
  context.pqWeeklySaveWeek();
  callback();
  assert.equal(context.PIQUETS.week[0].chefAgres,'ca-b');
  assert.equal(context.PIQUETS.week[0].conducteur,'conducteur-b');
  assert.equal(context.PIQUETS.week[0].membres.length,2);
});
test('un piquet existant complet reste intact et seuls les 27 autres sont ajoutés',()=>{
  const existing={engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'12:00',
    chefAgres:'ca-f',conducteur:'conducteur-f',note:'Conserver'};
  const {context}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}],{existing:[existing]});
  let callback;
  context.confirmModal=(_message,cb)=>{callback=cb;};
  preview(context);
  context.pqWeeklySaveWeek();
  callback();
  assert.equal(context.PIQUETS.week.length,28);
  assert.equal(context.PIQUETS.week[0],existing);
  assert.equal(existing.note,'Conserver');
});
test('si un seul agent est disponible, le piquet partiel est conservé mais la semaine reste non validée',()=>{
  const {context,dispos}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  for(let slot=8;slot<12;slot++)delete dispos['conducteur-f']['0_'+slot];
  let confirmation;
  context.confirmModal=(message,callback)=>{confirmation={message,callback};};
  const html=preview(context).innerHTML;
  assert.match(html,/1 piquets incomplets/);
  context.pqWeeklySaveWeek();
  assert.match(confirmation.message,/empêcheront la validation/);
  confirmation.callback();
  assert.equal(context.PIQUETS.week.length,28);
  assert.equal(context.PIQUETS.week[0].chefAgres,'ca-f');
  assert.equal(context.PIQUETS.week[0].conducteur,'');
  assert.equal(context.PIQUETS.week[0].membres.length,1);
  assert.equal(context.PIQUETS_VALIDATED.week,undefined);
});
test('cinq créneaux vides ne bloquent pas l’enregistrement groupé des vingt-trois autres',()=>{
  const users=[{l:'ca-f',chief:true},{l:'conducteur-f'}];
  const empty=contextFor(users);
  const missing=[[0,8,12],[0,12,18],[0,18,24],[0,0,8],[1,8,12]];
  for(const [day,from,to] of missing)for(let slot=from;slot<to;slot++){
    delete empty.dispos['ca-f'][day+'_'+slot];
    delete empty.dispos['conducteur-f'][day+'_'+slot];
  }
  let callback,saveCount=0;
  empty.context.confirmModal=(message,cb)=>{assert.match(message,/5 autres créneaux seront laissés de côté/);callback=cb;};
  empty.context.saveData=()=>{saveCount++;};
  const html=preview(empty.context).innerHTML;
  assert.match(html,/Enregistrer en groupe les 23 créneaux proposés/);
  assert.match(html,/5 créneau\(x\) laissé\(s\) de côté/);
  assert.equal(empty.context.pqWeeklyWrites().entries.length,23);
  assert.equal(empty.context.pqWeeklyWrites().skipped.length,5);
  empty.context.pqWeeklySaveWeek();
  assert.equal(empty.context.PIQUETS.week.length,0);
  callback();
  assert.equal(empty.context.PIQUETS.week.length,23);
  assert.equal(saveCount,1);
  assert.equal(empty.context.PIQUETS_VALIDATED.week,undefined);
});
test('un piquet déjà partiel reste intact et les autres créneaux peuvent être ajoutés en groupe',()=>{
  const users=[{l:'ca-f',chief:true},{l:'conducteur-f'}];
  const original={
    engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'10:00',
    chefAgres:'ca-f',conducteur:'',note:'À compléter'
  };
  const overlap=contextFor(users,{existing:[{
    ...original
  }]});
  assert.equal(overlap.context.pqDraftPlan('week','VTU-01')[0].state,'existing-partial');
  let callback,saveCount=0;
  overlap.context.confirmModal=(_message,cb)=>{callback=cb;};
  overlap.context.saveData=()=>{saveCount++;};
  assert.match(preview(overlap.context).innerHTML,/Enregistrer en groupe les 28 créneaux proposés/);
  assert.equal(overlap.context.pqWeeklyWrites().skipped.length,1);
  overlap.context.pqWeeklySaveWeek();
  assert.equal(overlap.context.PIQUETS.week.length,1);
  callback();
  assert.equal(overlap.context.PIQUETS.week.length,29);
  assert.equal(JSON.stringify(overlap.context.PIQUETS.week[0]),JSON.stringify(original));
  assert.equal(saveCount,1);
  assert.equal(overlap.context.PIQUETS_VALIDATED.week,undefined);
});
test('un changement d’un créneau laissé de côté annule la confirmation groupée',()=>{
  const users=[{l:'ca-f',chief:true},{l:'conducteur-f'}];
  const {context,dispos}=contextFor(users);
  for(let slot=8;slot<12;slot++){
    delete dispos['ca-f']['0_'+slot];
    delete dispos['conducteur-f']['0_'+slot];
  }
  let callback;
  context.confirmModal=(_message,cb)=>{callback=cb;};
  preview(context);
  context.pqWeeklySaveWeek();
  context.PIQUETS.week.push({engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'12:00',
    chefAgres:'ca-f',conducteur:'conducteur-f'});
  callback();
  assert.equal(context.PIQUETS.week.length,1);
});
test('une modification des piquets ou des disponibilités pendant la confirmation annule tout',()=>{
  const users=[{l:'ca-f',chief:true},{l:'conducteur-f'}];
  const altered=contextFor(users);
  preview(altered.context);
  altered.context.PIQUETS.week.push({engin:'VPI',jour:'Lundi',debut:'08:00',fin:'12:00'});
  assert.match(altered.context.pqWeeklyWrites().error,/piquets ont changé/);
  const unavailable=contextFor(users);
  let callback;
  unavailable.context.confirmModal=(_message,cb)=>{callback=cb;};
  preview(unavailable.context);
  unavailable.context.pqWeeklySaveWeek();
  delete unavailable.dispos['ca-f']['0_8'];
  callback();
  assert.equal(unavailable.context.PIQUETS.week.length,0);
  const changedChoice=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'},{l:'conducteur-b'}]);
  let choiceCallback;
  changedChoice.context.confirmModal=(_message,cb)=>{choiceCallback=cb;};
  preview(changedChoice.context);
  changedChoice.context.pqWeeklySaveWeek();
  changedChoice.context.pqWeeklySetChoice(0,'driver','conducteur-b');
  choiceCallback();
  assert.equal(changedChoice.context.PIQUETS.week.length,0);
});
test('droits ou caserne changés : aucune proposition ne peut être sauvegardée',()=>{
  const {context}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  preview(context);
  context.CURRENT_CASERNE_ID='AUTRE';
  assert.match(context.pqWeeklyWrites().error,/caserne/);
  context.CURRENT_CASERNE_ID='CIS05';
  context.hasRight=()=>false;
  assert.match(context.pqWeeklyWrites().error,/plus disponible/);
});
test('deux départs VTU : 56 créneaux, chefs réservés avant conducteurs et aucun doublon simultané',()=>{
  const {context}=contextFor([
    {l:'ca-f',chief:true},{l:'conducteur-f',chief:true},
    {l:'ca-b'},{l:'conducteur-b'}
  ]);
  context.ASTR_CONFIG.engins=['VTU-02','VTU-01'];
  const draft=context.pqDraftPlan('week',context.pqWeeklyVtuEngins());
  assert.equal(draft.length,56);
  assert.equal(JSON.stringify(draft.slice(0,2).map(s=>s.engin)),JSON.stringify(['VTU-01','VTU-02']));
  assert.ok(draft.every(s=>s.state==='ready'));
  assert.equal(new Set(draft.slice(0,2).flatMap(s=>[s.chief,s.driver])).size,4);
  assert.ok(draft.slice(0,2).every(s=>['ca-f','conducteur-f'].includes(s.chief)));
  assert.ok(draft.slice(0,2).every(s=>['ca-b','conducteur-b'].includes(s.driver)));
  let callback,saveCount=0;
  context.confirmModal=(_message,cb)=>{callback=cb;};
  context.saveData=()=>{saveCount++;};
  const html=preview(context).innerHTML;
  assert.match(html,/2 départ\(s\) VTU/);
  assert.match(html,/Enregistrer en groupe les 56 créneaux proposés/);
  context.pqWeeklySaveWeek();
  callback();
  assert.equal(context.PIQUETS.week.length,56);
  assert.equal(saveCount,1);
  for(let i=0;i<56;i+=2)
    assert.equal(new Set(context.PIQUETS.week.slice(i,i+2).flatMap(p=>[p.chefAgres,p.conducteur])).size,4);
});
test('les deux équipages restent stables du matin à la nuit, sans échange de rang, puis la charge se répartit le lendemain',()=>{
  const users=[
    {l:'ca-1',chief:true},{l:'ca-2',chief:true},{l:'ca-3',chief:true},
    {l:'driver-1'},{l:'driver-2'},{l:'driver-3'},{l:'driver-court'}
  ];
  const {context,dispos}=contextFor(users);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  context.planningEquipeGroups=()=>[{eq:{id:'commune'}}];
  context.getEquipeOfUser=()=>({id:'commune'});
  for(let slot=0;slot<24;slot++)dispos['driver-court']['0_'+slot]=slot===11;
  const draft=context.pqDraftPlan('week',context.pqWeeklyVtuEngins());
  const monday=draft.filter(s=>s.jour==='Lundi');
  assert.equal(monday.length,8,'un binôme par départ et par période, sans rotation horaire');
  for(const engin of ['VTU-01','VTU-02']){
    const assignments=monday.filter(s=>s.engin===engin).map(s=>s.chief+'/'+s.driver);
    assert.equal(new Set(assignments).size,1,'même équipage sur les quatre périodes pour '+engin);
  }
  assert.equal(new Set(monday.slice(0,2).flatMap(s=>[s.chief,s.driver])).size,4);
  assert.ok(monday.every(s=>s.driver!=='driver-court'));
  const tuesday=draft.filter(s=>s.jour==='Mardi'&&s.label==='Matin');
  assert.ok(tuesday.some(s=>s.chief==='ca-3'),'la rotation se fait au changement de jour, pas chaque heure');
});
test('deux chefs seulement : le premier départ est complété avant le deuxième et la fin de disponibilité reste visible',()=>{
  const {context,dispos}=contextFor([
    {l:'nicolas',chief:true},{l:'sebastien',chief:true}
  ]);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  context.ASTR_CONFIG.weekStartHour=7;
  context.astrPeriodsForWeek=()=>[
    {key:'m',label:'Matin',from:420,to:720},
    {key:'a',label:'Après-midi',from:720,to:1080},
    {key:'s',label:'Soir',from:1080,to:1440},
    {key:'n',label:'Nuit',from:1440,to:1860}
  ];
  context.planningEquipeGroups=()=>[{eq:{id:'forte'}},{eq:{id:'autre'}}];
  context.getEquipeOfUser=login=>({id:login==='nicolas'?'forte':'autre'});
  for(let slot=4;slot<24;slot++)delete dispos.sebastien['0_'+slot];
  for(let slot=11;slot<24;slot++)delete dispos.nicolas['0_'+slot];
  const draft=context.pqDraftPlan('week',context.pqWeeklyVtuEngins());
  const first=draft.find(s=>s.jour==='Lundi'&&s.label==='Matin'&&s.engin==='VTU-01'&&s.debut==='07:00');
  const second=draft.find(s=>s.jour==='Lundi'&&s.label==='Matin'&&s.engin==='VTU-02'&&s.debut==='07:00');
  assert.equal(first.fin,'12:00');
  assert.equal(first.state,'ready');
  assert.equal(first.chief,'nicolas');
  assert.equal(first.driver,'sebastien');
  assert.equal(first.driverHFin,'11:00');
  assert.equal(first.coverageGap,true);
  assert.equal(second.state,'empty');
  assert.equal(second.chief,'');
  assert.equal(second.fin,'12:00');
  assert.equal(draft.filter(s=>s.jour==='Lundi'&&s.label==='Matin'&&s.engin==='VTU-01').length,1);
  const html=preview(context).innerHTML;
  assert.match(html,/11:00–12:00 sans conducteur/);
  const entry=context.pqWeeklyWrites().entries.find(p=>p.jour==='Lundi'&&p.engin==='VTU-01');
  assert.equal(entry.debut,'07:00');
  assert.equal(entry.fin,'12:00');
  assert.equal(entry.membres[0].hFin,'12:00');
  assert.equal(entry.membres[1].hFin,'11:00');
  assert.match(entry.note,/11:00–12:00 sans conducteur/);
  let confirmation;
  context.confirmModal=(message,callback)=>{confirmation={message,callback};};
  context.pqWeeklySaveWeek();
  assert.match(confirmation.message,/présence partielle/);
  assert.equal(context.PIQUETS.week.length,0);
  confirmation.callback();
  const saved=context.PIQUETS.week.filter(p=>p.jour==='Lundi'&&p.engin==='VTU-01'&&p.debut==='07:00');
  assert.equal(saved.length,1);
  assert.equal(saved[0].fin,'12:00');
  assert.equal(saved[0].membres[1].hFin,'11:00');
});
test('les horaires individuels partiels valent aussi pour le chef et pour un conducteur arrivant en cours de créneau',()=>{
  const chief=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  for(let slot=11;slot<12;slot++)delete chief.dispos['ca-f']['0_'+slot];
  const first=chief.context.pqDraftPlan('week','VTU-01')[0];
  assert.equal(first.debut,'08:00');
  assert.equal(first.fin,'12:00');
  assert.equal(first.chiefHFin,'11:00');
  assert.equal(first.driverHFin,undefined);
  preview(chief.context);
  const chiefEntry=chief.context.pqWeeklyWrites().entries[0];
  assert.equal(chiefEntry.membres[0].hFin,'11:00');
  assert.equal(chiefEntry.membres[1].hFin,'12:00');
  const driver=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  delete driver.dispos['conducteur-f']['0_8'];
  delete driver.dispos['conducteur-f']['0_9'];
  const later=driver.context.pqDraftPlan('week','VTU-01')[0];
  assert.equal(later.debut,'08:00');
  assert.equal(later.fin,'12:00');
  assert.equal(later.driverHDebut,'10:00');
  preview(driver.context);
  const driverEntry=driver.context.pqWeeklyWrites().entries[0];
  assert.equal(driverEntry.membres[1].hDebut,'10:00');
  assert.match(driverEntry.note,/08:00–10:00 sans conducteur/);
});
test('un piquet existant à présence partielle ne prétend pas couvrir les heures absentes',()=>{
  const {context}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}],{existing:[{
    engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'12:00',
    chefAgres:'ca-f',conducteur:'conducteur-f',membres:[
      {role:'Chef d’agrès',login:'ca-f',hDebut:'08:00',hFin:'12:00'},
      {role:'Conducteur',login:'conducteur-f',hDebut:'08:00',hFin:'11:00'}
    ]
  }]});
  const morning=context.pqDraftPlan('week','VTU-01').filter(s=>s.jour==='Lundi'&&s.label==='Matin');
  assert.equal(morning[0].state,'existing');
  assert.ok(morning.some(s=>s.state==='existing-partial'));
});
test('le nouveau piquet reprend le début de la semaine choisie sans changer un piquet existant',()=>{
  const formSource=fs.readFileSync(path.join(__dirname,'../modules/19-onedrive-sync-js.js'),'utf8');
  const context={
    JOURS_FULL:days,getEnginRoles:()=>[{role:'Chef d’agrès'},{role:'Conducteur'}],
    astrScheduleForWeek:wk=>({weekStartHour:wk==='20261116'?7:8}),
    isVPI:()=>false,PQ_ROLES_VPI:[],PQ_ROLES_VTU:[],PQ_ROLE_COLORS:{},PQ_ROLE_TEXT_COLORS:{},
    _encodeRole:role=>role.replace(/[^a-zA-Z0-9]/g,'_'),pqBuildLine:()=>''
  };
  vm.createContext(context);
  vm.runInContext(functionSource(formSource,'pqBuildForm'),context);
  assert.match(context.pqBuildForm('20261109','VTU-01','Lundi',null),/id="pq-debut" value="08:00"/);
  assert.match(context.pqBuildForm('20261116','VTU-01','Lundi',null),/id="pq-debut" value="07:00"/);
  assert.match(context.pqBuildForm('20261116','VTU-01','Lundi',{
    debut:'09:00',fin:'12:00',membres:[]
  }),/id="pq-debut" value="09:00"/);
});
test('une disponibilité partielle de l’astreinte faible crée des relais réels dans le soir et la nuit',()=>{
  const users=[
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'},
    {l:'marien.matthis'}
  ];
  const {context,dispos}=contextFor(users);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  context.ASTR_CONFIG.weekStartHour=8;
  const originalGetEquipe=context.getEquipeOfUser;
  context.getEquipeOfUser=login=>login==='marien.matthis'?{id:'faible'}:originalGetEquipe(login);
  for(let slot=0;slot<24;slot++)dispos['marien.matthis']['0_'+slot]=slot>=11&&slot<18;
  for(let slot=11;slot<18;slot++)delete dispos['conducteur-b']['0_'+slot];
  const draft=context.pqDraftPlan('week',context.pqWeeklyVtuEngins());
  const matthis=draft.filter(s=>s.jour==='Lundi'&&s.engin==='VTU-02'&&s.driver==='marien.matthis');
  assert.ok(matthis.some(s=>s.label==='Soir'&&s.debut==='19:00'&&s.fin==='00:00'));
  assert.ok(matthis.some(s=>s.label==='Nuit'&&s.debut==='00:00'&&s.fin==='02:00'));
  assert.ok(draft.some(s=>s.jour==='Lundi'&&s.engin==='VTU-02'&&s.label==='Soir'
    &&s.debut==='18:00'&&s.fin==='19:00'&&s.driver==='conducteur-b'));
  assert.ok(draft.every(s=>s.state==='ready'));
  assert.ok(matthis.every(s=>s.chief==='ca-b'));
  assert.ok(draft.length>56);
  let callback,saveCount=0;
  context.confirmModal=(_message,cb)=>{callback=cb;};
  context.saveData=()=>{saveCount++;};
  assert.match(preview(context).innerHTML,/Enregistrer en groupe les \d+ créneaux proposés/);
  assert.equal(context.pqWeeklyWrites().error,undefined);
  context.pqWeeklySaveWeek();
  assert.equal(context.PIQUETS.week.length,0);
  callback();
  assert.equal(context.PIQUETS.week.length,draft.length);
  assert.equal(saveCount,1);
  assert.ok(context.PIQUETS.week.some(p=>p.jour==='Lundi'&&p.engin==='VTU-02'
    &&p.conducteur==='marien.matthis'&&p.debut==='19:00'&&p.fin==='00:00'));
  assert.ok(context.PIQUETS.week.some(p=>p.jour==='Lundi'&&p.engin==='VTU-02'
    &&p.conducteur==='marien.matthis'&&p.debut==='00:00'&&p.fin==='02:00'));
});
test('le piquet actif respecte la relève de nuit, y compris le lundi avant 08 h',()=>{
  const planning=fs.readFileSync(path.join(__dirname,'../modules/12-astreintes-js.js'),'utf8');
  for(const source of [planning,assembled]){
    const monday={jour:'Lundi',debut:'00:00',fin:'02:00',chefAgres:'ca-b',conducteur:'marien.matthis'};
    const sunday={jour:'Dimanche',debut:'00:00',fin:'02:00',chefAgres:'ca-b',conducteur:'marien.matthis'};
    let now=new Date(2026,9,27,1,30);
    const context={
      N:()=>now,PIQUETS:{'20261026':[monday],'20261019':[sunday]},
      ASTR_CONFIG:{weekStartHour:8},JOURS_FULL:days,
      astrScheduleForWeek:()=>({weekStartHour:8,afternoonStart:12,eveningStart:18,nightStart:24}),
      timeToMin:value=>Number(value.slice(0,2))*60+Number(value.slice(3)),
      piquetToAbsRangeIdx:(day,debut,fin)=>{
        const toMin=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
        const a=toMin(debut),b=toMin(fin);
        return [day*1440+a,day*1440+b+(b<=a?1440:0)];
      }
    };
    vm.createContext(context);
    vm.runInContext(functionSource(source,'getPiquetActif'),context);
    assert.equal(context.getPiquetActif('20261026','ca-b'),monday);
    now=new Date(2026,9,27,2,0);
    assert.equal(context.getPiquetActif('20261026','ca-b'),null);
    now=new Date(2026,9,26,1,30);
    assert.equal(context.getPiquetActif('20261019','ca-b'),sunday);
    assert.equal(context.getPiquetActif('20261026','ca-b'),null);
  }
});
test('la reprise affiche des relais sur les piquets existants sans modifier la semaine',()=>{
  const original={engin:'VTU-02',jour:'Lundi',debut:'18:00',fin:'00:00',
    chefAgres:'ca-b',conducteur:'conducteur-b',note:'Piquet validé manuellement'};
  const {context,dispos}=contextFor([
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'},
    {l:'marien.matthis'}
  ],{existing:[original]});
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  context.ASTR_CONFIG.weekStartHour=8;
  const originalGetEquipe=context.getEquipeOfUser;
  context.getEquipeOfUser=login=>login==='marien.matthis'?{id:'faible'}:originalGetEquipe(login);
  for(let slot=0;slot<24;slot++)dispos['marien.matthis']['0_'+slot]=slot>=11&&slot<18;
  for(let slot=11;slot<18;slot++)delete dispos['conducteur-b']['0_'+slot];
  const before=JSON.stringify(context.PIQUETS);
  const html=preview(context).innerHTML;
  assert.match(html,/Aperçu de reprise des piquets déjà enregistrés/);
  assert.match(html,/Lundi Soir 19:00–00:00 · VTU-02/);
  assert.match(html,/marien\.matthis/);
  assert.match(html,/Aucun bouton ne les remplace automatiquement/);
  assert.equal(JSON.stringify(context.PIQUETS),before);
});
test('une disponibilité changée après aperçu annule les relais avant sauvegarde',()=>{
  const {context,dispos}=contextFor([
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'},
    {l:'marien.matthis'}
  ]);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  context.ASTR_CONFIG.weekStartHour=8;
  const originalGetEquipe=context.getEquipeOfUser;
  context.getEquipeOfUser=login=>login==='marien.matthis'?{id:'faible'}:originalGetEquipe(login);
  for(let slot=0;slot<24;slot++)dispos['marien.matthis']['0_'+slot]=slot>=11&&slot<18;
  for(let slot=11;slot<18;slot++)delete dispos['conducteur-b']['0_'+slot];
  let callback,saveCount=0;
  context.confirmModal=(_message,cb)=>{callback=cb;};
  context.saveData=()=>{saveCount++;};
  preview(context);
  context.pqWeeklySaveWeek();
  delete dispos['marien.matthis']['0_11'];
  assert.match(context.pqWeeklyWrites().error,/créneaux ont changé|non enregistrable/);
  callback();
  assert.equal(context.PIQUETS.week.length,0);
  assert.equal(saveCount,0);
});
test('un rang VTU existant est préservé et son équipage n’est pas proposé sur le deuxième rang',()=>{
  const existing={engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'12:00',
    chefAgres:'ca-f',conducteur:'conducteur-f',note:'Maintenir'};
  const users=[
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'}
  ];
  const {context}=contextFor(users,{existing:[existing],
    conflict:(_wk,login,jour,debut,fin)=>jour==='Lundi'
      &&['ca-f','conducteur-f'].includes(login)
      &&Number(debut.slice(0,2))<12&&Number(fin.slice(0,2))>8});
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  const first=context.pqDraftPlan('week',context.pqWeeklyVtuEngins()).slice(0,2);
  assert.equal(first[0].state,'existing');
  assert.equal(first[1].state,'ready');
  assert.equal(first[1].chief,'ca-b');
  assert.equal(first[1].driver,'conducteur-b');
  let callback;
  context.confirmModal=(_message,cb)=>{callback=cb;};
  preview(context);
  context.pqWeeklySaveWeek();
  callback();
  assert.equal(context.PIQUETS.week.length,56);
  assert.equal(context.PIQUETS.week[0],existing);
  assert.equal(existing.note,'Maintenir');
});
test('une correction manuelle ne peut pas affecter un agent aux deux départs du même créneau',()=>{
  const {context}=contextFor([
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'}
  ]);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  const warnings=[];
  context.showToast=message=>warnings.push(message);
  preview(context);
  const before=vm.runInContext('_pqWeeklyDraft[1].driver',context);
  const firstChief=vm.runInContext('_pqWeeklyDraft[0].chief',context);
  context.pqWeeklySetChoice(1,'driver',firstChief);
  assert.equal(vm.runInContext('_pqWeeklyDraft[1].driver',context),before);
  assert.match(warnings[0],/autre départ VTU/);
});
test('enregistrement groupé : une même personne peut relayer deux départs sans chevauchement réel',()=>{
  const {context}=contextFor([
    {l:'ca-f',chief:true},{l:'ca-b',chief:true},{l:'relay'}
  ]);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  preview(context);
  const slots=[
    {wk:'week',engin:'VTU-01',jour:'Lundi',label:'Soir',debut:'18:00',fin:'00:00',
      chief:'ca-f',driver:'relay',chiefEligible:['ca-f','ca-b'],eligible:['relay'],
      partialDriver:'relay',partialDriverHFin:'20:00',driverHFin:'20:00',state:'ready'},
    {wk:'week',engin:'VTU-02',jour:'Lundi',label:'Soir',debut:'18:00',fin:'00:00',
      chief:'ca-b',driver:'relay',chiefEligible:['ca-f','ca-b'],eligible:['relay'],
      partialDriver:'relay',partialDriverHDebut:'20:00',driverHDebut:'20:00',state:'ready'}
  ];
  context.testSlots=slots;
  context.pqDraftPlan=()=>slots.map(slot=>({...slot}));
  vm.runInContext('_pqWeeklyDraft=testSlots',context);
  const checked=context.pqWeeklyWrites();
  assert.equal(checked.error,undefined);
  assert.equal(checked.entries.length,2);
  assert.equal(checked.entries[0].membres[1].hFin,'20:00');
  assert.equal(checked.entries[1].membres[1].hDebut,'20:00');
  const warnings=[];
  context.showToast=message=>warnings.push(message);
  slots[1].driver='';slots[1].state='partial';
  context.pqWeeklySetChoice(1,'driver','relay');
  assert.equal(slots[1].driver,'relay');
  assert.equal(warnings.length,0);
  slots[1].partialDriverHDebut='19:00';
  slots[1].driverHDebut='19:00';
  assert.match(context.pqWeeklyWrites().error,/deux départs VTU simultanés : relay \(Lundi VTU-01 18:00–20:00 et Lundi VTU-02 19:00–00:00\)/);
});
test('la relève à minuit ne crée pas de faux chevauchement entre soir et nuit',()=>{
  const {context}=contextFor([{l:'relay'}]);
  const evening={wk:'week',jour:'Lundi',debut:'18:00',fin:'00:00'};
  const night={wk:'week',jour:'Lundi',debut:'00:00',fin:'08:00'};
  const first=context.pqWeeklyMemberRange(evening,'driver','relay');
  const second=context.pqWeeklyMemberRange(night,'driver','relay');
  assert.equal(context.pqWeeklyRangesOverlap(first,second),false);
});
test('des disponibilités morcelées ne bloquent pas à tort l’enregistrement groupé',()=>{
  const users=[
    {l:'ca-f',chief:true},{l:'ca-b',chief:true},{l:'ca-autre',chief:true},
    {l:'conducteur-f'},{l:'conducteur-b'},{l:'conducteur-autre'}
  ];
  for(let seed=1;seed<=20;seed++){
    const {context,dispos}=contextFor(users);
    context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
    let value=seed;
    for(const user of users)for(let slot=0;slot<24;slot++){
      value=(Math.imul(value,1664525)+1013904223)>>>0;
      if(value%4===0)delete dispos[user.l]['0_'+slot];
    }
    preview(context);
    assert.equal(context.pqWeeklyWrites().error,undefined,'disponibilités morcelées, cas '+seed);
  }
});
test('un troisième départ configuré multiplie les créneaux sans inventer d’agents',()=>{
  const {context}=contextFor([
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'}
  ]);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02','VTU-03'];
  const draft=context.pqDraftPlan('week',context.pqWeeklyVtuEngins());
  assert.equal(draft.length,84);
  assert.equal(draft[2].engin,'VTU-03');
  assert.equal(draft[2].state,'empty');
  const html=preview(context).innerHTML;
  assert.match(html,/Enregistrer en groupe les 56 créneaux proposés/);
  assert.match(html,/28 créneau\(x\) laissé\(s\) de côté/);
});
test('un changement du nombre de VTU pendant la confirmation annule tout',()=>{
  const {context}=contextFor([
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'}
  ]);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  let callback;
  context.confirmModal=(_message,cb)=>{callback=cb;};
  preview(context);
  context.pqWeeklySaveWeek();
  context.ASTR_CONFIG.engins.push('VTU-03');
  callback();
  assert.equal(context.PIQUETS.week.length,0);
});
test('le préremplissage du deuxième rang ouvre le formulaire du VTU correspondant',()=>{
  const {context}=contextFor([
    {l:'ca-f',chief:true},{l:'conducteur-f'},
    {l:'ca-b',chief:true},{l:'conducteur-b'}
  ]);
  context.ASTR_CONFIG.engins=['VTU-01','VTU-02'];
  preview(context);
  const calls=[];
  context.addPiquet=(...args)=>calls.push(args);
  context.document={
    getElementById:id=>({
      'pq-jour':{value:'',dataset:{}},'pq-debut':{value:'',dataset:{}},
      'pq-fin':{value:'',dataset:{}},'pq-suggestions':{innerHTML:''}
    })[id]||null,
    querySelectorAll:()=>[]
  };
  context.applySuggestion(1);
  assert.equal(JSON.stringify(calls),JSON.stringify([['week','VTU-02','Lundi']]));
});
