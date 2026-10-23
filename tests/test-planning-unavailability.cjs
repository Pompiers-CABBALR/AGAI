const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const bundleMode=process.env.AGAI_TEST_BUNDLE==='1';
const planning=read(bundleMode?'app.js':'modules/12-astreintes-js.js');
function load(c,source,name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const next=source.indexOf('\nfunction ',start+1);
  vm.runInContext(source.slice(start,next<0?undefined:next),c);
}
function harness(){
  const users=[{l:'alice',nom:'Alice',prenom:'Test',grade:'Sap'},{l:'bob',nom:'Bob',prenom:'Test',grade:'Sap'}];
  const data={users,formStag:[],formForm:[],fmpas:[],activites:[]};
  const wk='20261019',dispos={};
  for(const user of users){dispos[user.l]={};for(let d=0;d<7;d++)for(let s=0;s<24;s++)dispos[user.l][d+'_'+s]=true;}
  const elements=new Map(),events=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{style:{},clientWidth:1000});return elements.get(id);};
  const eq={id:'eq',nom:'Équipe',color:'#225588',granularity:60,membres:users.map(u=>u.l)};
  const c=vm.createContext({
    USERS:users,CASERNE_DATA:{CIS05:data},CU:{l:'alice'},PERSONNEL_ONLINE_GATE:true,
    ASTR_CONFIG:{weekStartHour:0},EQUIPES:[eq],DISPOS:{[wk]:dispos},DISPOS_UNLOCKED:{},DISPO_REQUESTS:{},DISPOS_VALIDATED:{},
    PIQUETS:{},PLANNING_ROTATIONS:{},JOURS:['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'],JOURS_FULL:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
    TODAY:new Date(2026,9,23,12),astrPlanningWeek:0,astrPlanningNowTimer:null,astrPlanningFilter:new Set(['all']),
    document:{getElementById:element},window:{matchMedia:()=>({matches:false})},
    setTimeout:()=>1,clearTimeout(){},isDispoValidated:()=>false,isRespEqForte:()=>true,isRespEquipe:()=>false,
    isSuperAdmin:()=>true,hasRight:()=>true,getDeadlineDate:()=>new Date(2026,9,28),getWeekOffset:()=>1,
    getMondayOfWeek:()=>new Date(2026,9,19),weekLabel:()=> 'Semaine',getEquipeById:()=>eq,getEquipeOfUser:()=>eq,
    sortEquipes:x=>x,sortByGradeThenName:x=>x,gradeAbbr:String,fullName:u=>u.nom+' '+u.prenom,
    getDS:d=>d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'),
    pad:x=>String(x).padStart(2,'0'),escHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    showToast:(...args)=>events.push(['toast',...args]),saveData:()=>events.push(['save']),markDispoSlotsChanged:()=>events.push(['dirty']),
    rAstrDispo:()=>events.push(['refresh']),_jbEditLock:0,
  });
  const auth=read(bundleMode?'app.js':'modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js');
  for(const name of ['personnelLocalDate','personnelIsoDate','personnelCanOperateForPeriod','personnelCurrentRecord'])load(c,auth,name);
  load(c,read(bundleMode?'app.js':'modules/16-email-js.js'),'hhmmToMinutes');
  load(c,read(bundleMode?'app.js':'modules/14-stats-js.js'),'getJoursFeries');
  const schedule=read(bundleMode?'app.js':'modules/09-pilp-js.js');
  for(const name of ['personnelScheduleDay','personnelScheduleRecords','formationCalendarDays','formationTrainingDays','formationUnavailableWindow','personnelScheduleWindows','personnelScheduleLogins','findPersonnelScheduleConflict'])load(c,schedule,name);
  for(const name of ['weekKey','validDispoGranularity','dispoGranularityFor','getSlotsPerDay','getSlotsForDay','jourLabel','slotToLabelDay','dispoDayLabel','personnelPlanningSlotRange','personnelPlanningWeekContext','personnelPlanningSlotState','personnelPlanningLegendHTML','personnelPlanningCheckContext','personnelDispoSlotAllowed','renderDispoAgentBlock','rAstrPlanning','setAllDispoFor'])load(c,planning,name);
  c.timeToMin=c.hhmmToMinutes;
  const context=()=>c.personnelPlanningWeekContext(wk);
  const state=(login,day,minute,duration=60,ctx=context())=>{const r=c.personnelPlanningSlotRange(wk,day,minute,duration);return c.personnelPlanningSlotState(login,r.start,r.end,ctx);};
  const form=(extra={})=>({id:'formation',titre:'Formation test',ddebut:'2026-10-19',dfin:'2026-10-19',hmatind:'09:00',hmatinf:'12:00',hapremd:'14:00',hapremf:'17:00',participants:['bob'],...extra});
  return {c,users,data,wk,dispos,events,element,context,state,form};
}
for(const kind of ['arret','disponibilite','suspension'])test(kind+' : dates inclusives, période ouverte et retour à la disponibilité',()=>{
  const h=harness();h.users[0]._personnelPeriods=[{kind,start:'2026-10-20',end:'2026-10-21'}];
  assert.equal(h.state('alice',0,600),null);
  assert.equal(h.state('alice',1,600).kind,'absence');assert.equal(h.state('alice',2,1380).kind,'absence');
  assert.equal(h.state('alice',3,0),null);
  h.users[0]._personnelPeriods[0].end='';assert.equal(h.state('alice',6,600).kind,'absence');
  h.users[0]._personnelPeriods[0].cancelledFrom='2026-10-22';assert.equal(h.state('alice',3,600),null);
});
test('formation : participants indisponibles du début à la fin, y compris la pause de midi',()=>{
  const h=harness();h.data.formStag.push(h.form());
  assert.equal(h.state('alice',0,600),null);assert.equal(h.state('bob',0,480),null);
  assert.equal(h.state('bob',0,540).code,'FOR');assert.equal(h.state('bob',0,720).code,'FOR');
  assert.equal(h.state('bob',0,840).kind,'formation');assert.equal(h.state('bob',0,1020),null);
  assert.equal(h.state('bob',1,600),null);
});
test('FMPA : participants et formateurs restent disponibles, même sur un créneau de nuit',()=>{
  const h=harness();h.data.fmpas.push({id:'f',date:'2026-10-19',theme:'FMPA nuit',hDebut:'22:30',hFin:'01:00',participants:['bob'],formateurs:['alice']});
  assert.equal(h.state('bob',0,1320,15),null);assert.equal(h.state('alice',0,1335,60),null);
  assert.equal(h.state('bob',1,0),null);assert.equal(h.state('bob',1,60),null);
  assert.equal(h.c.personnelDispoSlotAllowed(h.wk,'bob',0,23,60),true);
  assert.equal(h.c.personnelDispoSlotAllowed(h.wk,'alice',0,23,60),true);
  const start=new Date(2026,9,19,22,45).getTime(),end=new Date(2026,9,19,23).getTime();
  assert.equal(h.c.findPersonnelScheduleConflict(['alice','bob'],start,end),null);
  h.data.formStag.push(h.form({hmatind:'22:00',hmatinf:'23:00',hapremd:'',hapremf:''}));
  assert.equal(h.c.findPersonnelScheduleConflict(['bob'],start,end).kind,'Formation');
  assert.doesNotMatch(h.c.personnelPlanningLegendHTML(),/FMPA/);
});
test('formations de formateurs sur plusieurs jours et anciens horaires incomplets',()=>{
  const h=harness();h.data.formForm.push(h.form({dfin:'2026-10-21'}));
  assert.equal(h.state('bob',2,600).kind,'formation');assert.equal(h.state('bob',3,600),null);
  h.data.formForm[0].hmatind='';assert.equal(h.state('bob',1,720).kind,'formation');
});
test('une activité de service ne reçoit pas le code FOR et une absence reste prioritaire',()=>{
  const h=harness();h.data.activites.push({date:'2026-10-19',hDebut:'09:00',hFin:'12:00',participants:['bob']});
  assert.equal(h.state('bob',0,600),null);
  h.data.formStag.push(h.form());h.users[1]._personnelPeriods=[{kind:'arret',start:'2026-10-19'}];
  assert.equal(h.state('bob',0,600).kind,'absence');
});
test('les formations connues dans une autre caserne sont également prises en compte',()=>{
  const h=harness();h.c.CASERNE_DATA.CIS02={formStag:[h.form()]};assert.equal(h.state('bob',0,600).code,'FOR');
});
test('la nuit du dimanche consulte les dates réelles du lundi suivant',()=>{
  const h=harness();h.data.formStag.push(h.form({ddebut:'2026-10-26',dfin:'2026-10-26',hmatind:'02:00',hmatinf:'06:00',hapremd:'',hapremf:''}));
  assert.equal(h.state('bob',6,1440+120).code,'FOR');assert.equal(h.state('bob',0,120),null);
  h.users[0]._personnelPeriods=[{kind:'suspension',start:'2026-10-26'}];
  assert.equal(h.state('alice',6,1380),null);assert.equal(h.state('alice',6,1440).kind,'absence');
});
test('le changement d’heure conserve les heures locales des formations',()=>{
  const h=harness();h.data.formStag.push(h.form({ddebut:'2026-10-25',dfin:'2026-10-25',joursFormation:['2026-10-25'],hmatind:'09:00',hmatinf:'12:00',hapremd:'',hapremf:''}));
  assert.equal(h.state('bob',6,480),null);assert.equal(h.state('bob',6,540).code,'FOR');
  assert.equal(h.state('bob',6,660).code,'FOR');assert.equal(h.state('bob',6,720),null);
});
test('grille de disponibilités : cellules FOR verrouillées, saisies antérieures conservées',async()=>{
  const h=harness();h.data.formStag.push(h.form());const before=JSON.stringify(h.dispos);
  const html=h.c.renderDispoAgentBlock('bob',h.wk,false,true,false,1,null);
  const cell=html.match(/<div class="dispo-cell astr-formation"[^>]+>FOR<\/div>/);
  assert.ok(cell);assert.match(cell[0],/data-can-edit="false"/);assert.doesNotMatch(cell[0],/onclick=/);
  assert.equal(h.c.personnelDispoSlotAllowed(h.wk,'bob',0,10,60),false);
  assert.equal(JSON.stringify(h.dispos),before);
  h.data.formStag=[];await Promise.resolve();assert.equal(h.c.personnelDispoSlotAllowed(h.wk,'bob',0,10,60),true);
});
test('planning : lignes grisées, FOR et exclusion des comptes de disponibilités et piquets',()=>{
  const h=harness();h.users[0]._personnelPeriods=[{kind:'arret',start:'2026-10-19'}];h.data.formStag.push(h.form());
  h.c.PIQUETS[h.wk]=[{jour:'Lundi',debut:'09:00',fin:'12:00',membres:[{login:'alice'},{login:'bob'}]}];
  const before=JSON.stringify(h.dispos);h.c.rAstrPlanning();const html=h.element('astr-planning-grid').innerHTML;
  assert.match(html,/<tr class="astr-personnel-unavailable-row">/);assert.match(html,/class="astr-formation[^>]+>FOR<\/td>/);
  const firstDay=html.slice(html.indexOf('<tbody>'),html.indexOf('</tbody>'));
  const counts=[...firstDay.matchAll(/<tr style="background:var\(--bg\);">([\s\S]*?)<\/tr>/g)].at(-1)[1];
  const cells=[...counts.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].slice(2);
  assert.match(cells[1][1],/color:#e5e7eb/); // 09h : aucun agent disponible ni comptabilisé en piquet.
  assert.match(cells[9][1],/>1<\/span>/); // 17h : Bob disponible à nouveau.
  assert.equal(JSON.stringify(h.dispos),before);assert.equal(h.events.some(e=>e[0]==='save'),false);
});
test('les commandes de masse préservent les créneaux couverts par une absence ou une formation',()=>{
  const h=harness();h.data.formStag.push(h.form());h.c.setAllDispoFor(h.wk,'bob',false,'#888');
  assert.equal(h.dispos.bob['0_10'],true);assert.equal(h.dispos.bob['0_17'],false);
  h.users[0]._personnelPeriods=[{kind:'disponibilite',start:'2026-10-19'}];
  const before=JSON.stringify(h.dispos.alice);h.c.setAllDispoFor(h.wk,'alice',null,'#888',true);
  assert.equal(JSON.stringify(h.dispos.alice),before);
});
test('une formation du 21 au 30 reste indisponible la nuit et le week-end intermédiaire',()=>{
  const h=harness();h.data.formStag.push(h.form({ddebut:'2026-10-21',dfin:'2026-10-30'}));
  assert.equal(h.state('bob',2,480),null);assert.equal(h.state('bob',2,540).code,'FOR');
  assert.equal(h.state('bob',2,1380).code,'FOR');assert.equal(h.state('bob',5,720).code,'FOR');
  assert.equal(h.state('bob',6,720).code,'FOR');assert.equal(h.state('bob',11,960).code,'FOR');
  assert.equal(h.state('bob',11,1020),null);
});
