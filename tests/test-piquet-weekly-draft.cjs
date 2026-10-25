const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../modules/26-piquet-weekly-js.js'),'utf8');
const assembled=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
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
    ASTR_CONFIG:{granularity:60,weekStartHour:0},JOURS_FULL:days,
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
    confirmModal:()=>{},logPiquetChange:()=>{},saveData:()=>{},cM:()=>{},rAstrPiquets:()=>{}
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
  assert.match(html,/Enregistrer les 28 nouveaux créneaux/);
  assert.doesNotMatch(html,/Équipier/);
});
test('la confirmation enregistre les 28 binômes en une seule sauvegarde sans valider la semaine',()=>{
  const {context}=contextFor([{l:'ca-f',chief:true},{l:'conducteur-f'}]);
  const calls={confirm:null,saved:[],logs:0,closed:0,rendered:0};
  context.confirmModal=(message,callback)=>{calls.confirm={message,callback};};
  context.saveData=immediate=>calls.saved.push(immediate);
  context.logPiquetChange=()=>{calls.logs++;};
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
  assert.equal(calls.logs,28);
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
test('aucun enregistrement groupé si un créneau est vide ou un piquet existant ne couvre qu’une partie',()=>{
  const users=[{l:'ca-f',chief:true},{l:'conducteur-f'}];
  const empty=contextFor(users);
  for(let slot=8;slot<12;slot++){
    delete empty.dispos['ca-f']['0_'+slot];
    delete empty.dispos['conducteur-f']['0_'+slot];
  }
  assert.match(preview(empty.context).innerHTML,/Enregistrement groupé indisponible/);
  assert.ok(empty.context.pqWeeklyWrites().error);
  const overlap=contextFor(users,{existing:[{
    engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'10:00',
    chefAgres:'ca-f',conducteur:'conducteur-f'
  }]});
  assert.equal(overlap.context.pqDraftPlan('week','VTU-01')[0].state,'existing-partial');
  preview(overlap.context);
  assert.ok(overlap.context.pqWeeklyWrites().error);
  assert.equal(overlap.context.PIQUETS.week.length,1);
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
