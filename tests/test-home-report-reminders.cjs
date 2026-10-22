const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modules/06-ui-js-accueil-js.js'),'utf8');
const section=source.slice(source.indexOf('const RAPPORTS_SUIVI_DEBUT='),source.indexOf('// ────────────────── MESSAGES ASTREINTE ACCUEIL'));
assert.ok(section.includes('function collectAccueilReportReminders'));

function setup(overrides={}){
  const context={
    CASERNE_DATA:{_global:{}},
    IVS:[],PILP_IVS:[],
    actGetData:()=>[],fmpaGetData:()=>[],
    CURRENT_CASERNE_ID:'CIS05',
    _rcId:(station,type,id)=>[station,type,id].join('|'),
    isPilpIntervention:()=>false,
    interventionDisplayCallNumber:iv=>iv._numApl||String(iv.id||'').match(/^APL_\d{4}_\d+/)?.[0]||iv.id,
    interventionDisplayUTNumber:iv=>String(iv._numCaserne||''),
    isInterventionReportChef:(iv,login)=>iv.agr===login,
    statsInterventionDateKey:iv=>String(iv.h||'').slice(0,8),
    console,
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(section,context);
  return context;
}

test('les interventions terminées depuis octobre sont rappelées à leur chef uniquement',()=>{
  const ctx=setup({IVS:[
    {id:'before',h:'20260930',s:'terminee',agr:'alice'},
    {id:'todo',h:'20261002',s:'terminee',agr:'alice'},
    {id:'other',h:'20261003',s:'terminee',agr:'bob'},
    {id:'done',h:'20261004',s:'terminee',agr:'alice',_crValide:true}
  ]});
  assert.deepEqual(Array.from(ctx.collectAccueilReportReminders('alice','').finaliser,x=>x.id),['todo']);
  assert.equal(ctx.collectAccueilReportReminders('alice','').editer.length,0);
});
test('les rappels affichent les numéros UT et APL avant la nature et la commune',()=>{
  const ctx=setup({IVS:[{id:'APL_2026_000588-Rabc',_numApl:'APL_2026_000588',
    _numCaserne:494,n:'Sauvetage et capture d’animaux',com:'Marles-les-Mines',
    h:'20261021',s:'terminee',agr:'alice'}]});
  const [row]=ctx.collectAccueilReportReminders('alice','').finaliser;
  assert.equal(row.label,'Intervention · UT 494 · APL_2026_000588 · Sauvetage et capture d’animaux — Marles-les-Mines');
});
test('un numéro UT non confirmé n’est pas présenté comme définitif',()=>{
  const ctx=setup({IVS:[{id:'APL_2026_000589-Rabc',_numApl:'APL_2026_000589',
    _numCaserne:495,_numberingScheme:'dual-v1',_numberFinalized:false,
    n:'Nid de frelons',h:'20261021',s:'terminee',agr:'alice'}]});
  const [row]=ctx.collectAccueilReportReminders('alice','').finaliser;
  assert.equal(row.label,'Intervention · APL_2026_000589 · Nid de frelons');
});

test('le premier agent désigné au départ porte le rappel du renfort',()=>{
  const ctx=setup({IVS:[{id:'renfort',h:'20261010',s:'terminee',_isRenfort:true,agr:'equipier',_equipage1:[{login:'autre'}]}]});
  assert.deepEqual(Array.from(ctx.collectAccueilReportReminders('equipier','').finaliser,x=>x.id),['renfort']);
  assert.equal(ctx.collectAccueilReportReminders('autre','').finaliser.length,0);
});

test('la date de début de finalisation est paramétrable par le superadmin',()=>{
  const ctx=setup({CASERNE_DATA:{_global:{reportFinalizeReminderStartDate:'2026-10-15'}},
    IVS:[{id:'ancien',h:'20261014',s:'terminee',agr:'alice'},
      {id:'nouveau',h:'20261015',s:'terminee',agr:'alice'}]});
  assert.deepEqual(Array.from(ctx.collectAccueilReportReminders('alice','').finaliser,x=>x.id),['nouveau']);
});

test('le suivi d’édition ne commence qu’à la date du superadmin et suit le créateur',()=>{
  const ctx=setup({
    _agaiReportEditionState:{enabled:true,startDate:'2026-10-15',items:{
      'CIS05|iv|validated':{count:0},'CIS05|activite|a2':{count:0},
      'CIS05|fmpa|f1':{count:0},'CIS05|fmpa|f2':{count:1}
    }},
    IVS:[{id:'validated',h:'20261016',s:'terminee',agr:'alice',_crValide:true}],
    actGetData:()=>[
      {id:'a1',date:'2026-10-14',auteur:'alice',cr:'texte'},
      {id:'a2',date:'2026-10-17',auteur:'alice',cr:'texte',participants:['bob']},
      {id:'a3',date:'2026-10-18',auteur:'bob',cr:'texte',participants:['alice']}
    ],
    fmpaGetData:()=>[
      {id:'f1',date:'2026-10-18',auteur:'alice',participants:['bob']},
      {id:'f2',date:'2026-10-19',auteur:'alice',impressions:[{date:'2026-10-19'}]}
    ]
  });
  assert.equal(ctx.rapportsEditionDebut(),'20261015');
  assert.deepEqual(Array.from(ctx.collectAccueilReportReminders('alice','20261015').editer,x=>x.id),['validated','a2','f1']);
});

test('les originaux restent masqués avant activation serveur',()=>{
  const ctx=setup({_agaiReportEditionState:{enabled:false,startDate:'2026-10-15',items:{}}});
  assert.equal(ctx.rapportsEditionDebut(),'');
  assert.equal(vm.runInContext('RAPPORT_EDITION_SUIVI_SECURISÉ',ctx),true);
  assert.match(source,/RAPPORT_EDITION_SUIVI_SECURISÉ&&start\?/);
});

test('l’auteur peut ouvrir une activité et une FMPA sans être participant',()=>{
  const activities=fs.readFileSync(path.join(root,'modules/19-onedrive-sync-js.js'),'utf8');
  const training=fs.readFileSync(path.join(root,'modules/20-formations-js.js'),'utf8');
  assert.match(activities,/a&&a\.auteur===CU\.l/);
  assert.match(training,/f\.auteur===CU\.l/);
});

test('le module sécurisé est chargé et le réglage reste réservé au superadmin',()=>{
  const edition=fs.readFileSync(path.join(root,'modules/25-report-editions-js.js'),'utf8');
  const admin=fs.readFileSync(path.join(root,'modules/05-admin-js-partie-1-2-vues-globales-superadmin.js'),'utf8');
  assert.match(admin,/function saSaveReportReminderDates\(/);
  assert.match(admin,/onclick="saveReportEditionSettings\(true\)"/);
  assert.match(edition,/AGAI_REPORT_EDITION_CONFLICT/);
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/modules\/25-report-editions-js\.js/);
});

test('sur l’accueil, Mes rapports et le suivi admin précèdent les compteurs pour tous',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const home=html.slice(html.indexOf('id="tab-home"'),html.indexOf('<!-- APPEL -->'));
  assert.ok(home.indexOf('id="acc-rapports"')<home.indexOf('id="acc-stats"'));
  assert.ok(home.indexOf('id="acc-admin-report-summary"')<home.indexOf('id="acc-stats"'));
  assert.doesNotMatch(html,/id="admin-report-monitor"|id="sa-report-monitor"/);
});
