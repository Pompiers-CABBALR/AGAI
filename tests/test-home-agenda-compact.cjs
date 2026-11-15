const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modules/06-ui-js-accueil-js.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
function agendaFunction(text){
  const start=text.indexOf('function rAccueilAstreinte(){');
  const end=text.indexOf('// ── Toast notification',start);
  assert.ok(start>=0&&end>start);
  return text.slice(start,end);
}
function render(nowText,departure='VTU-01',overrides={}){
  const el={innerHTML:''};
  const now=new Date(nowText);
  const duty={start:'2026-11-09T09:00:00',end:'2026-11-10T18:00:00',mode:'person',login:'valery'};
  const context={
    document:{getElementById:id=>id==='acc-astreinte-msg'?el:null},
    GLOBAL_ROLE:'agent',CU:{l:'agent'},N:()=>now,
    getMondayOfWeek:()=>new Date('2026-11-09T00:00:00'),weekKey:()=> '20261109',
    ASTR_CONFIG:{granularity:60,weekStartDay:1,weekStartHour:8},
    astrScheduleForWeek:()=>({weekStartHour:8,afternoonStart:12,eveningStart:18,nightStart:24}),
    JOURS_FULL:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
    DISPOS:{20261109:{agent:{'0_4':true,'0_5':true}}},
    PIQUETS:{20261109:[{engin:departure,jour:'Lundi',debut:'12:00',fin:'18:00',
      membres:[{login:'agent',role:"Chef d'agrès",hDebut:'12:00',hFin:'18:00'}]}]},
    pad:value=>String(value).padStart(2,'0'),
    timeToMin:value=>{const [h,m]=value.split(':').map(Number);return h*60+m;},
    piquetDepartureLabel:value=>value==='VTU-02'?'VTU — 2e départ':'VTU — 1er départ',
    astrTelActiveDuty:()=>duty,astrTelDutyOwnerName:()=> 'Leriche Valéry',
    astrTelDutyDateLabel:value=>value,astrTelDutyLabel:()=> 'Aucune astreinte',
    escHtml:value=>String(value)
  };
  Object.assign(context,overrides);
  vm.createContext(context);
  vm.runInContext(agendaFunction(source),context);
  context.rAccueilAstreinte();
  return el.innerHTML;
}
function summaries(html){
  return [...html.matchAll(/<div class="acc-agenda-summary">([^<]*)<\/div>/g)].map(match=>match[1]);
}

test('l’astreinte téléphonique affiche le titulaire et les deux bornes',()=>{
  const html=render('2026-11-09T10:00:00');
  const [phone]=summaries(html);
  assert.match(phone,/Leriche Valéry/);
  assert.match(phone,/lun\. 9\/11 09h/);
  assert.match(phone,/mar\. 10\/11 18h/);
  assert.doesNotMatch(phone,/Astreinte téléphonique :|jusqu’au/);
  assert.match(html,/--agenda-color:#0F766E/);
  assert.match(html,/--agenda-color:#3B82F6/);
});

test('disponibilité et piquet sont courts, avec le rang du départ sans le rôle',()=>{
  const [,dispo,piquet]=summaries(render('2026-11-09T10:00:00'));
  assert.equal(dispo,'Prochaine · lun. 9/11 12h–14h');
  assert.equal(piquet,'VTU — 1er départ · lundi 12:00–18:00');
  assert.doesNotMatch(piquet,/Chef d'agrès/);
  const [, ,second]=summaries(render('2026-11-09T10:00:00','VTU-02'));
  assert.match(second,/2e départ/);
});

test('le volet développé garde les horaires utiles sans longue phrase ni rôle',()=>{
  const html=render('2026-11-09T12:30:00');
  const [,dispo,piquet]=summaries(html);
  assert.equal(dispo,'En cours · jusqu’à 14h');
  assert.match(piquet,/VTU — 1er départ · en cours jusqu’à 18:00/);
  assert.match(html,/acc-agenda-detail.*?<\/span>En cours · lun\. 9\/11 12h–14h/);
  assert.match(html,/acc-agenda-detail.*?<\/span>VTU — 1er départ · lundi 12:00–18:00/);
  assert.doesNotMatch(html,/Votre disponibilité en cours a commencé|Piquet en cours :|Chef d'agrès/);
  assert.match(html,/Leriche Valéry : du/);
});

test('le module et le fichier assemblé présentent les mêmes cartes',()=>{
  assert.equal(agendaFunction(bundle),agendaFunction(source));
});

test('l’astreinte du jour montre seulement les piquets en cours et à venir, par rang',()=>{
  const piquets=[
    {engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'12:00',chefAgres:'agent',conducteur:'valery'},
    {engin:'VTU-01',jour:'Lundi',debut:'12:00',fin:'18:00',chefAgres:'agent',conducteur:'valery'},
    {engin:'VTU-01',jour:'Lundi',debut:'18:00',fin:'23:00',chefAgres:'agent',conducteur:'valery'},
    {engin:'VTU-02',jour:'Lundi',debut:'14:00',fin:'20:00',chefAgres:'agent',conducteur:'valery'},
    {engin:'VTU-02',jour:'Lundi',debut:'20:00',fin:'02:00',chefAgres:'agent',conducteur:'valery'}
  ];
  const html=render('2026-11-09T15:00:00','VTU-01',{
    getMondayOfWeek:offset=>new Date(2026,10,9+7*offset),
    weekKey:date=>String(date.getFullYear())+String(date.getMonth()+1).padStart(2,'0')+String(date.getDate()).padStart(2,'0'),
    PIQUETS:{20261109:piquets},USERS:[{l:'agent',name:'Agent'},{l:'valery',name:'Valéry'}],
    fullNameAff:user=>user.name,
    astrTelActiveDuty:()=>({mode:'person',login:'agent',start:'2026-11-09T08:00:00',end:'2026-11-09T23:00:00'})
  });
  assert.match(html,/Piquets du jour/);
  assert.match(html,/2 en cours · 2 à venir/);
  assert.match(html,/1er départ/);
  assert.match(html,/2e départ/);
  assert.ok(html.indexOf('1er départ')<html.indexOf('2e départ'));
  assert.match(html,/En cours · 12:00–18:00/);
  assert.match(html,/À venir · 18:00–23:00/);
  assert.match(html,/À venir · 20:00–24:00/);
  assert.doesNotMatch(html,/08:00–12:00/);
  assert.match(html,/--agenda-bg:#EEF2FF;--agenda-color:#4F46E5/);
});

test('après le dernier piquet du jour, aucun créneau passé ne reste affiché',()=>{
  const html=render('2026-11-09T23:30:00','VTU-01',{
    getMondayOfWeek:offset=>new Date(2026,10,9+7*offset),
    weekKey:date=>String(date.getFullYear())+String(date.getMonth()+1).padStart(2,'0')+String(date.getDate()).padStart(2,'0'),
    PIQUETS:{20261109:[{engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'23:00',chefAgres:'agent',conducteur:'valery'}]},
    USERS:[],fullNameAff:()=>'',
    astrTelActiveDuty:()=>({mode:'person',login:'agent',start:'2026-11-09T08:00:00',end:'2026-11-09T23:59:00'})
  });
  assert.match(html,/0 en cours · 0 à venir/);
  assert.match(html,/Aucun piquet restant aujourd’hui/);
  assert.doesNotMatch(html,/08:00–23:00/);
});
