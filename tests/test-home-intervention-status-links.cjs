const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'modules/06-ui-js-accueil-js.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
const markup=fs.readFileSync(path.join(root,'index.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'style.css'),'utf8');
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
function classes(){
  const values=new Set();
  return {add:name=>values.add(name),remove:name=>values.delete(name),contains:name=>values.has(name)};
}
function contextForNavigation(access=true){
  const stdPending={classList:classes()},stdOngoing={classList:classes()};
  const pilpPending={classList:classes()};
  const elements={
    'fb-en-attente':stdPending,'fb-en-cours':stdOngoing,
    'pilp-fb-en-attente':pilpPending,
    'subtab-btn-std':{},'subtab-btn-pilp':{},'nav-interv':{},
    'intervention-filter-row':{querySelectorAll:()=>[stdPending,stdOngoing]},
    'pilp-filter-row':{querySelectorAll:()=>[pilpPending]}
  };
  const calls=[];
  const context={CU:{l:'agent'},flt:'all',fltPilp:'all',
    hasRight:()=>access,canSeePILP:()=>true,
    document:{getElementById:id=>elements[id]||null},
    showSubtab:(scope,button,defer)=>calls.push(['subtab',scope,button,defer]),
    showT:(page,button)=>calls.push(['page',page,button])
  };
  vm.createContext(context);
  for(const name of ['accueilInterventionStatCard','openAccueilInterventionFilter'])
    vm.runInContext(sourceOf(moduleSource,name),context);
  return {context,calls,elements};
}

test('les cartes ouvrent la liste normale avec le bon filtre, sans changer les statuts',()=>{
  const {context,calls,elements}=contextForNavigation();
  assert.match(context.accueilInterventionStatCard(2,'En cours','std','en-cours'),
    /openAccueilInterventionFilter\('std','en-cours'\)/);
  context.openAccueilInterventionFilter('std','en-cours');
  assert.equal(context.flt,'en-cours');
  assert.equal(context.fltPilp,'all');
  assert.equal(elements['fb-en-cours'].classList.contains('active'),true);
  assert.equal(calls[0][1],'std');
  assert.equal(calls[0][3],true,'la liste est rendue une seule fois par la navigation');
  assert.equal(calls[1][1],'interv');
});

test('la carte PILP ouvre directement le sous-onglet PILP filtré en attente',()=>{
  const {context,calls,elements}=contextForNavigation();
  assert.match(context.accueilInterventionStatCard(1,'Interventions PILP en attente','pilp','en-attente'),
    /openAccueilInterventionFilter\('pilp','en-attente'\)/);
  context.openAccueilInterventionFilter('pilp','en-attente');
  assert.equal(context.fltPilp,'en-attente');
  assert.equal(context.flt,'all');
  assert.equal(elements['pilp-fb-en-attente'].classList.contains('active'),true);
  assert.equal(calls[0][1],'pilp');
  assert.equal(calls[1][1],'interv');
});

test('une carte reste en lecture seule si le menu Interventions est interdit',()=>{
  const {context,calls}=contextForNavigation(false);
  assert.doesNotMatch(context.accueilInterventionStatCard(1,'En attente','std','en-attente'),/<button/);
  context.openAccueilInterventionFilter('pilp','en-attente');
  assert.equal(calls.length,0);
});

test('l’accueil compte les statuts actifs, même commencés avant aujourd’hui',()=>{
  const {context}=contextForNavigation();
  const nodes={'acc-bonjour':{},'acc-date':{},'acc-stats':{}};
  context.document.getElementById=id=>nodes[id]||null;
  context.N=()=>new Date(2026,10,2,12,0);
  context.IVS=[{s:'en-attente',h:'20261031_1000'},
    {s:'en-cours',h:'20261031_1100'},{s:'en-cours',_isPilip:true}];
  context.PILP_IVS=[{s:'en-attente',h:'20261031_1200'}];
  context.isInterventionComptabilisee=()=>true;
  context.statsInterventionInPeriod=()=>false;
  context.rStatsHeader=()=>{};
  vm.runInContext(sourceOf(moduleSource,'rAccueil'),context);
  context.rAccueil();
  assert.match(nodes['acc-stats'].innerHTML,/<div class="acc-stat-val">1<\/div><div class="acc-stat-lbl">En attente<\/div>/);
  assert.match(nodes['acc-stats'].innerHTML,/<div class="acc-stat-val">1<\/div><div class="acc-stat-lbl">En cours<\/div>/);
  assert.match(nodes['acc-stats'].innerHTML,/Interventions PILP en attente/);
});

test('les cinq compteurs occupent deux lignes sur téléphone et une sur ordinateur',()=>{
  const {context}=contextForNavigation();
  const nodes={'acc-bonjour':{},'acc-date':{},'acc-stats':{}};
  context.document.getElementById=id=>nodes[id]||null;
  context.N=()=>new Date(2026,10,2,12,0);
  context.IVS=[];context.PILP_IVS=[];
  context.isInterventionComptabilisee=()=>true;
  context.statsInterventionInPeriod=()=>false;
  context.rStatsHeader=()=>{};
  vm.runInContext(sourceOf(moduleSource,'rAccueil'),context);
  context.rAccueil();
  const html=nodes['acc-stats'].innerHTML;
  assert.equal((html.match(/acc-stat-status/g)||[]).length,2);
  assert.equal((html.match(/acc-stat-summary/g)||[]).length,3);
  assert.match(html,/acc-stat pilp/);
  assert.match(styles,/\.accueil-stats\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\);gap:10px;\}/);
  assert.match(styles,/\.accueil-stats \.acc-stat-status\{grid-column:span 3;\}/);
  assert.match(styles,/\.accueil-stats \.acc-stat-summary\{grid-column:span 2;\}/);
  assert.match(styles,/@media\(min-width:768px\)\{\s*\.accueil-stats\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\);\}/);
  assert.match(styles,/\.acc-stat\.pilp\{grid-column:1\/-1;\}/);
  assert.equal((styles.match(/\.accueil-stats\{grid-template-columns:/g)||[]).length,1,'aucune règle ultérieure ne doit rétablir quatre colonnes');
  assert.match(styles,/@media\(max-width:767px\)\{\s*\.accueil-stats\{gap:6px;\}/);
  assert.match(styles,/\.accueil-stats \.acc-stat:not\(\.pilp\)\{padding:8px 5px;/);
  assert.match(styles,/\.accueil-stats \.acc-stat-summary \.acc-stat-val\{font-size:clamp\(20px,6\.5vw,26px\);\}/);
});

test('les fonctions du module et du bundle restent identiques',()=>{
  for(const name of ['accueilInterventionStatCard','openAccueilInterventionFilter'])
    assert.equal(sourceOf(moduleSource,name),sourceOf(bundle,name),name);
  for(const fragment of [
    "const nbEnCours=IVS.filter(iv=>!iv._isPilip&&iv.s==='en-cours').length;",
    "accueilInterventionStatCard(nbPilpAtt,'Interventions PILP en attente','pilp','en-attente')"
  ])assert.ok(sourceOf(bundle,'rAccueil').includes(fragment));
  for(const id of ['fb-en-attente','fb-en-cours','pilp-fb-en-attente'])
    assert.match(markup,new RegExp('id="'+id+'"'));
});
