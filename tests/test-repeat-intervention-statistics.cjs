const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const bundle=process.env.AGAI_TEST_BUNDLE==='1';
const read=file=>fs.readFileSync(path.join(__dirname,'..',bundle?'app.js':file),'utf8');
function extract(source,name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const body=source.indexOf('{',start);let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error(name);
}
function harness(role='admin'){
  const nodes=new Map();let writes=0;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',style:{},querySelectorAll:()=>[]});return nodes.get(id);};
  const c=vm.createContext({
    CU:role==='none'?null:{l:'operator',rights:role==='admin'?['Administration']:['Interventions']},GLOBAL_ROLE:role==='superadmin'?'superadmin':role==='chef'?'chef_corps':null,
    window:{},document:{getElementById:element},IVS:[],PILP_IVS:[],
    N:()=>new Date('2026-10-28T11:00:00Z'),canUseMonthlyExport:()=>true,
    escHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    interventionDisplayCallNumber:iv=>String(iv.id),saveData:()=>writes++,
    interventionById:id=>[].concat(c.IVS,c.PILP_IVS).find(iv=>iv.id===id),oM:id=>nodes.set('opened',id),showToast:()=>{},
  });
  vm.runInContext("let stAnnee=2026,stMois=10,stVue='reinterventions',stRepeatDate=null; const ST_MOIS=Array(12).fill('Mois');",c);
  const load=(file,name)=>vm.runInContext(extract(read(file),name),c);
  for(const name of ['nm','formatInterventionStreetAddress','normalizeInterventionAddressForMatch','interventionBaseAddressForDuplicate','interventionNatureForDuplicate','personnelLocalDate','isSuperAdmin','hasRight','isAdminModeActive'])load('modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js',name);
  load('modules/08-interventions-js.js','hasAdministrativeAccount');
  for(const name of ['adminExportTimeCompact','adminExportInterventionStartDate','statsInterventionDateKey','canViewDetailedStatistics','canViewIndemnitesStatistics','canViewRepeatStatistics','statsRepeatToday','statsRepeatValidDate','statsRepeatNormalize','statsRepeatVisitDate','statsRepeatSummary','setStatsRepeatDate','openStatsRepeatIntervention','rStatsReinterventions','rStats','rStatsContent'])load('modules/14-stats-js.js',name);
  const iv=(id,date,extra={})=>({id,s:'terminee',h:date.replace(/-/g,'')+'_1000',addr:'12 bis Rue de la Paix',com:'Lillers',req:'Mme Martin',n:'Nid de guêpes et frelons',...extra});
  const summary=(ivs,since='2026-10-01')=>c.statsRepeatSummary(ivs,since,'2026-10-28');
  return {c,iv,summary,element,writes:()=>writes,opened:()=>nodes.get('opened'),state:expr=>vm.runInContext(expr,c)};
}
test('premier passage compris : quatre passages donnent trois réinterventions',()=>{
  const h=harness(),data=['02','04','06','08'].map((d,i)=>h.iv('iv'+i,'2026-10-'+d));
  const before=JSON.stringify(data),s=h.summary(data);
  assert.equal(s.addresses,1);assert.equal(s.passages,4);assert.equal(s.reinterventions,3);
  assert.equal(s.rows[0].first,'2026-10-02');assert.equal(JSON.stringify(data),before);assert.equal(h.writes(),0);
});
test('un premier passage en septembre qualifie un retour unique en octobre',()=>{
  const h=harness(),s=h.summary([h.iv('first','2026-09-20'),h.iv('return','2026-10-10')]);
  assert.equal(s.addresses,1);assert.equal(s.passages,1);assert.equal(s.reinterventions,1);assert.equal(s.rows[0].first,'2026-09-20');
});
test('changer la date de début conserve la recherche du premier passage antérieur',()=>{
  const h=harness(),s=h.summary([h.iv('a','2026-10-01'),h.iv('b','2026-10-10'),h.iv('c','2026-10-20')],'2026-10-15');
  assert.equal(s.passages,1);assert.equal(s.reinterventions,1);assert.equal(s.rows[0].first,'2026-10-01');
});
test('les dates de début et de fin sont incluses ; les passages futurs sont exclus',()=>{
  const h=harness(),s=h.summary([h.iv('a','2026-09-01'),h.iv('b','2026-10-01'),h.iv('c','2026-10-28'),h.iv('d','2026-10-29')]);
  assert.equal(s.passages,2);assert.equal(s.reinterventions,2);
});
test('les adresses ne sont pas revisitées si elles ne comptent qu’un passage connu',()=>{
  const h=harness(),s=h.summary([h.iv('a','2026-10-10'),h.iv('b','2026-10-10',{addr:'99 Rue autre'})]);
  assert.equal(s.addresses,0);assert.equal(s.reinterventions,0);assert.equal(s.passages,0);
});
test('même adresse mais motif différent : aucun rapprochement ; requérant différent : rapprochement conservé',()=>{
  const h=harness(),data=[h.iv('a','2026-10-01'),h.iv('b','2026-10-03',{req:'M. Durand',n:'Essaim d’abeilles'})];
  assert.equal(h.summary(data).reinterventions,0);
  data.push(h.iv('c','2026-10-05',{req:'M. Durand'}));
  assert.equal(h.summary(data).reinterventions,1);
});
test('deux motifs répétés à une adresse produisent deux lignes, sans doubler le nombre d’adresses',()=>{
  const h=harness(),data=[h.iv('a','2026-10-01'),h.iv('b','2026-10-02'),h.iv('c','2026-10-03',{n:'Essaim d’abeilles'}),h.iv('d','2026-10-04',{n:'Essaim d’abeilles'})];
  const s=h.summary(data);assert.equal(s.rows.length,2);assert.equal(s.addresses,1);assert.equal(s.reinterventions,2);assert.equal(s.passages,4);
});
test('normalisation du bis, de la ponctuation et des communes ; numéros distincts conservés',()=>{
  const h=harness(),data=[h.iv('a','2026-10-01'),h.iv('b','2026-10-03',{addr:'12BIS RUE DE LA PAIX',com:'LILLERS'}),h.iv('c','2026-10-04',{addr:'12 Rue de la Paix'}),h.iv('d','2026-10-04',{com:'Autre commune'})];
  assert.equal(h.summary(data).reinterventions,1);
});
test('les appartements distincts ne sont pas regroupés ; ancien complément en ligne reconnu',()=>{
  const h=harness(),data=[h.iv('a','2026-10-01',{addr:'12 Rue de la Paix — Appartement 1'}),h.iv('b','2026-10-02',{addr:'12 Rue de la Paix',_addrBase:'12 Rue de la Paix',addrComp:'Appartement 1'}),h.iv('c','2026-10-03',{addr:'12 Rue de la Paix',addrComp:'Appartement 2'})];
  assert.equal(h.summary(data).reinterventions,1);assert.equal(h.summary(data).rows[0].period.length,2);
});
test('appels en attente, en cours, annulés, renforts et refuges ne sont pas des passages comptés',()=>{
  const h=harness(),data=[h.iv('a','2026-09-01')];
  for(const s of ['en-attente','selectionne','en-cours','annulee'])data.push(h.iv(s,'2026-10-10',{s}));
  for(const [id,extra] of [['renfort',{_isRenfort:true}],['interne',{_isRenfortInterneMission:true}],['refuge',{_refugeAnimalier:true}],['deleted',{deleted:true}]])data.push(h.iv(id,'2026-10-10',extra));
  assert.equal(h.summary(data).reinterventions,0);
});
test('les avis de passage sont exclus ; les PILP terminés restent inclus sans doublon de fiche',()=>{
  const h=harness(),first=h.iv('first','2026-09-01',{n:'Nid de frelons asiatiques'}),avis=h.iv('avis','2026-10-01',{s:'avis-passage',n:'Nid de frelons asiatiques'}),pilp=h.iv('pilp','2026-10-02',{n:'Nid de frelons asiatiques — PILP'});
  const s=h.summary([first,avis,pilp,{...pilp}]);assert.equal(s.passages,1);assert.equal(s.reinterventions,1);
});
test('un avis antérieur ne peut pas transformer un premier vrai passage en réintervention',()=>{
  const h=harness();
  for(const flag of ['_avisPassage','_avisEnAttente','_avisPassageClasse']){
    const before=h.iv('avis','2026-09-01',{[flag]:true}),real=h.iv('real','2026-10-10');
    assert.equal(h.summary([before,real]).reinterventions,0);
  }
});
test('un passage avant puis un dans la période sont explicitement présentés comme deux passages connus',()=>{
  const h=harness();h.c.IVS=[h.iv('before','2026-09-01'),h.iv('current','2026-10-10')];
  const row=h.summary(h.c.IVS).rows[0];assert.equal(row.before,1);assert.equal(row.period.length,1);assert.equal(row.total,2);assert.equal(row.repeats,1);
  const html=h.c.rStatsReinterventions();assert.match(html,/Total connu/);assert.match(html,/Avant la période/);
  assert.match(html,/data-repeat-intervention-id="before"/);assert.match(html,/data-repeat-intervention-id="current"/);
  h.c.openStatsRepeatIntervention('before');assert.equal(h.opened(),'before');
});
test('l’ouverture des fiches depuis le bilan reste réservée aux administrateurs',()=>{
  const h=harness('agent');h.c.IVS=[h.iv('private','2026-10-10')];h.c.openStatsRepeatIntervention('private');assert.equal(h.opened(),undefined);
});
test('date de départ réelle et correction explicite priment sur la date de l’appel',()=>{
  const h=harness(),s=h.summary([h.iv('a','2026-09-01'),h.iv('b','2026-09-30',{tl:[{s:'en-cours',h:'20261002_1030'}]}),h.iv('c','2026-09-29',{_dateDebut:'2026-10-03'})]);
  assert.equal(s.reinterventions,2);assert.deepEqual(Array.from(s.rows[0].period,v=>v.date),['2026-10-02','2026-10-03']);
});
test('les fiches inexploitables ne sont pas regroupées sous une fausse adresse commune',()=>{
  const h=harness(),data=[h.iv('a','2026-10-01',{addr:''}),h.iv('b','2026-10-03',{addr:'Non renseignée'}),h.iv('c','2026-10-04',{com:''}),h.iv('d','2026-10-05',{id:''})];
  const s=h.summary(data);assert.equal(s.addresses,0);assert.equal(s.ignored,4);
});
test('les résultats sont triés par nombre de réinterventions décroissant',()=>{
  const h=harness(),data=[h.iv('a','2026-10-01'),h.iv('b','2026-10-02')];
  for(let i=1;i<=4;i++)data.push(h.iv('second'+i,'2026-10-0'+i,{addr:'45 Rue seconde'}));
  const s=h.summary(data);assert.equal(s.rows[0].repeats,3);assert.equal(s.rows[1].repeats,1);assert.equal(s.reinterventions,4);
});
for(const date of ['','2026-02-30','2026-10-29','<img src=x>'])test('date invalide ou future refusée : '+date,()=>{
  const h=harness();assert.ok(h.summary([h.iv('a','2026-10-02')],date).error);
});
for(const role of ['agent','chef','none'])test(role+' : menu, calcul et accès direct refusés',()=>{
  const h=harness(role);assert.equal(h.c.canViewRepeatStatistics(),false);
  assert.equal(h.summary(new Proxy([],{get(){throw Error('Lecture privée interdite');}})),null);
  h.c.IVS=[h.iv('a','2026-10-01',{req:'Nom confidentiel'}),h.iv('b','2026-10-02')];
  h.c.rStatsContent();assert.match(h.element('stats-body').innerHTML,/Accès réservé/);assert.doesNotMatch(h.element('stats-body').innerHTML,/Nom confidentiel/);
  const renderer=h.c.rStatsContent;h.c.rStatsContent=()=>{};h.c.rStats();h.c.rStatsContent=renderer;
  assert.doesNotMatch(h.element('stats-nav').innerHTML,/Réinterventions/);
  h.c.setStatsRepeatDate('2026-10-20');assert.equal(h.state('stRepeatDate'),null);
});
for(const role of ['admin','superadmin'])test(role+' : bilan accessible avec pouvoirs temporairement désactivés',()=>{
  const h=harness(role);h.c.window._adminRoleDisabled=true;h.c.window._superAdminDisabled=true;
  assert.equal(h.c.canViewRepeatStatistics(),true);
  h.c.IVS=[h.iv('a','2026-09-01')];h.c.PILP_IVS=[h.iv('b','2026-10-02')];
  h.c.rStatsContent();const html=h.element('stats-body').innerHTML;
  assert.match(html,/Réinterventions chez les requérants/);assert.match(html,/value="2026-10-01"/);assert.match(html,/28\/10\/2026/);
  const renderer=h.c.rStatsContent;h.c.rStatsContent=()=>{};h.c.rStats();h.c.rStatsContent=renderer;
  assert.match(h.element('stats-nav').innerHTML,/Réinterventions/);assert.doesNotMatch(h.element('stats-nav').innerHTML,/admin-monthly-export-btn/);
});
test('changer de date recalcule le bilan sans modifier les interventions',()=>{
  const h=harness();h.c.IVS=[h.iv('a','2026-09-01'),h.iv('b','2026-10-02'),h.iv('c','2026-10-20')];
  const before=JSON.stringify(h.c.IVS);h.c.setStatsRepeatDate('2026-10-10');
  assert.equal(h.state('stRepeatDate'),'2026-10-10');
  assert.match(h.element('stats-body').innerHTML,/10\/10\/2026/);assert.equal(JSON.stringify(h.c.IVS),before);assert.equal(h.writes(),0);
});
test('le rendu échappe les données du requérant et ne mélange pas les filtres mensuels',()=>{
  const h=harness(),req='<img src=x onerror=alert(1)>';
  h.c.IVS=[h.iv('a','2026-09-01',{req}),h.iv('b','2026-10-02',{req})];
  h.state('stAnnee=2025;stMois=2');const html=h.c.rStatsReinterventions();
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/Premier passage connu/);
  assert.match(html,/02\/10\/2026/);assert.equal(h.state('stAnnee'),2025);assert.equal(h.state('stMois'),2);
});
test('la borne « aujourd’hui » et le premier jour du mois suivent l’heure française',()=>{
  const h=harness();h.c.N=()=>new Date('2026-12-31T23:30:00Z');
  assert.equal(h.c.statsRepeatToday(),'2027-01-01');
  assert.match(h.c.rStatsReinterventions(),/max="2027-01-01" value="2027-01-01"/);
});
test('le retrait du rôle admin bloque aussi un bilan déjà ouvert',()=>{
  const h=harness();h.c.IVS=[h.iv('a','2026-09-01'),h.iv('b','2026-10-02')];
  h.c.rStatsContent();assert.match(h.element('stats-body').innerHTML,/Mme Martin/);
  const before=h.state('stRepeatDate');h.c.CU.rights=[];h.c.rStatsContent();
  assert.match(h.element('stats-body').innerHTML,/Accès réservé/);assert.doesNotMatch(h.element('stats-body').innerHTML,/Mme Martin/);
  h.c.setStatsRepeatDate('2026-10-15');assert.equal(h.state('stRepeatDate'),before);
});
