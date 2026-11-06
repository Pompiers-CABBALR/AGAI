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
function render(nowText,departure='VTU-01'){
  const el={innerHTML:''};
  const now=new Date(nowText);
  const duty={start:'2026-11-09T09:00:00',end:'2026-11-10T18:00:00',mode:'person',login:'valery'};
  const context={
    document:{getElementById:id=>id==='acc-astreinte-msg'?el:null},
    GLOBAL_ROLE:'agent',CU:{l:'agent'},N:()=>now,
    getMondayOfWeek:()=>new Date('2026-11-09T00:00:00'),weekKey:()=> '20261109',
    ASTR_CONFIG:{granularity:60,weekStartDay:1,weekStartHour:8},
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
  vm.createContext(context);
  vm.runInContext(agendaFunction(source),context);
  context.rAccueilAstreinte();
  return el.innerHTML;
}
function summaries(html){
  return [...html.matchAll(/<div class="acc-agenda-summary">([^<]*)<\/div>/g)].map(match=>match[1]);
}

test('l’astreinte téléphonique affiche le titulaire et les deux bornes',()=>{
  const [phone]=summaries(render('2026-11-09T10:00:00'));
  assert.match(phone,/Leriche Valéry/);
  assert.match(phone,/lun\. 9\/11 09h/);
  assert.match(phone,/mar\. 10\/11 18h/);
  assert.doesNotMatch(phone,/Astreinte téléphonique :|jusqu’au/);
});

test('disponibilité et piquet sont courts, avec le rang du départ sans le rôle',()=>{
  const [,dispo,piquet]=summaries(render('2026-11-09T10:00:00'));
  assert.equal(dispo,'Prochaine · lun. 9/11 12h–14h');
  assert.equal(piquet,'VTU — 1er départ · lundi 12:00–18:00');
  assert.doesNotMatch(piquet,/Chef d'agrès/);
  const [, ,second]=summaries(render('2026-11-09T10:00:00','VTU-02'));
  assert.match(second,/2e départ/);
});

test('le volet développé conserve les explications complètes',()=>{
  const html=render('2026-11-09T12:30:00');
  const [,dispo,piquet]=summaries(html);
  assert.equal(dispo,'En cours · jusqu’à 14h');
  assert.match(piquet,/VTU — 1er départ · en cours jusqu’à 18:00/);
  assert.match(html,/Votre disponibilité en cours a commencé/);
  assert.match(html,/Piquet en cours : VTU — 1er départ \(Chef d'agrès\)/);
  assert.match(html,/Leriche Valéry : du/);
});

test('le module et le fichier assemblé présentent les mêmes cartes',()=>{
  assert.equal(agendaFunction(bundle),agendaFunction(source));
});
