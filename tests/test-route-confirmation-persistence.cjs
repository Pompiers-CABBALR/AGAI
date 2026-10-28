const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const bundle=process.env.AGAI_TEST_BUNDLE==='1';
const read=p=>fs.readFileSync(path.join(__dirname,'..',bundle?'app.js':p),'utf8');
function extract(source,name){
  const a=source.indexOf('function '+name+'(');assert.ok(a>=0,name);const body=source.indexOf('{',a);let depth=0;
  for(let i=body;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(a,i+1);}throw Error(name);
}
function harness(storage=new Map(),records){
  const events=[],nodes=new Map();
  const iv=(id,extra={})=>({id,s:'selectionne',agr:'chef.test',n:'Nid',addr:'Rue',com:'Commune',_routeOrder:Number(id.slice(-1))||1,_routeBatchId:'route',tl:[{s:'selectionne',h:'20261028_0800'}],...extra});
  const c=vm.createContext({CU:{l:'chef.test',caserneId:'CIS05'},CURRENT_CASERNE_ID:'CIS05',IVS:records||[iv('iv1'),iv('iv2')],PILP_IVS:[],parcConfirmed:new Set(),
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},isSessionValid:()=>true,
    isTireurPILP:()=>true,canOperatePilp:()=>true,sortRouteSelection:rows=>rows.slice().sort((a,b)=>a._routeOrder-b._routeOrder),
    captureRouteViewPosition:()=>({}),restoreRouteViewPosition(){},rEgrid(){},rI:()=>events.push('render'),rPilp:()=>events.push('pilp-render'),
    getH:()=> '20261028_0900',N:()=>new Date(2026,9,28,9),CD:()=>null,saveData:()=>events.push('save'),_jbEditLock:0,
    showToast:(...args)=>events.push(['toast',...args]),escHtml:String,requestAnimationFrame:cb=>cb(),
    document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{style:{},scrollIntoView(){},innerHTML:''});return nodes.get(id);}},
  });
  c.isPilpIntervention=record=>c.PILP_IVS.includes(record);
  const source=read('modules/08-interventions-js.js'),a=source.indexOf('const _routeConfirmationMemory='),b=source.indexOf('function interventionRouteSelectionKey(',a);
  assert.ok(a>=0&&b>a);vm.runInContext(source.slice(a,b),c);
  for(const name of ['interventionRouteSelectionKey','normalizeInterventionRoute','editInterventionRoute'])vm.runInContext(extract(source,name),c);
  for(const name of ['getSelMixte','getSelPilp','persistRouteOrder','persistPilpRouteOrder','rPL','rPLPilp','confirmerSel','confirmerSelPilp'])vm.runInContext(extract(read('modules/09-pilp-js.js'),name),c);
  return {c,iv,events,storage,pending:()=>Array.from(c.getSelMixte(),x=>x.id),confirm:()=>c.confirmerSel(),state:s=>vm.runInContext(s,c),node:id=>nodes.get(id)};
}
test('la première sélection doit être validée puis survit au rechargement du navigateur',()=>{
  const h=harness();assert.deepEqual(h.pending(),['iv1','iv2']);h.confirm();assert.deepEqual(h.pending(),[]);
  const reloaded=harness(h.storage,JSON.parse(JSON.stringify(h.c.IVS)));
  assert.equal(reloaded.c.parcConfirmed.size,0);assert.deepEqual(reloaded.pending(),[]);assert.equal(reloaded.c.parcConfirmed.size,2);
});
for(const status of ['en-attente','annulee','terminee','en-cours'])test(status+' ne demande aucune nouvelle validation des interventions restantes',()=>{
  const h=harness();h.confirm();h.c.IVS[0].s=status;if(status==='en-attente')h.c.IVS[0].agr=null;
  assert.deepEqual(h.pending(),[]);
  assert.deepEqual(harness(h.storage,JSON.parse(JSON.stringify(h.c.IVS))).pending(),[]);
});
test('un ajout redemande une confirmation de toute la sélection restante',()=>{
  const h=harness();h.confirm();h.c.IVS.push(h.iv('iv3'));
  assert.deepEqual(h.pending(),['iv1','iv2','iv3']);h.confirm();assert.deepEqual(h.pending(),[]);
  assert.deepEqual(harness(h.storage,JSON.parse(JSON.stringify(h.c.IVS))).pending(),[]);
});
test('retirer un ajout non confirmé rend la sélection précédemment validée à nouveau utilisable',()=>{
  const h=harness();h.confirm();h.c.IVS.push(h.iv('iv3'));assert.equal(h.pending().length,3);
  h.c.IVS[2].s='en-attente';assert.deepEqual(h.pending(),[]);
});
test('resélectionner une intervention remise en attente constitue bien un nouvel ajout',()=>{
  const h=harness();h.confirm();const iv=h.c.IVS[0];iv.s='en-attente';assert.deepEqual(h.pending(),[]);
  iv.s='selectionne';iv.tl.push({s:'selectionne',h:'20261028_0800'});
  assert.deepEqual(h.pending(),['iv1','iv2']);
});
test('changer l’ordre ou recevoir des fiches actualisées ne supprime pas une validation',()=>{
  const h=harness();h.confirm();h.c.IVS.reverse();h.c.IVS[0]._routeOrder=1;h.c.IVS[1]._routeOrder=2;
  h.c.IVS[0].tl.push({s:'information',h:'20261028_0900'});h.c.IVS[0]._routeSelectedAt=12345;
  assert.deepEqual(h.pending(),[]);
  h.c.IVS=JSON.parse(JSON.stringify(h.c.IVS));assert.deepEqual(h.pending(),[]);
});
test('l’édition explicite d’un ordre validé se ferme sans une nouvelle confirmation',()=>{
  const h=harness();h.confirm();h.c.editInterventionRoute('chef.test','route');
  h.c.rPL(h.c.getSelMixte());
  assert.equal(h.node('route-confirmation-button').textContent,'Fermer');assert.equal(h.pending().length,2);
  const before=JSON.stringify(Array.from(h.storage.entries()));h.confirm();
  assert.deepEqual(h.pending(),[]);assert.equal(JSON.stringify(Array.from(h.storage.entries())),before);
});
test('un autre compte ou une autre caserne ne peut pas réutiliser la validation',()=>{
  const h=harness();h.confirm();h.c.CU.l='autre.agent';h.c.IVS.forEach(iv=>iv.agr='autre.agent');
  assert.deepEqual(h.pending(),['iv1','iv2']);h.c.CU.l='chef.test';h.c.IVS.forEach(iv=>iv.agr='chef.test');h.c.CURRENT_CASERNE_ID='CIS06';
  assert.deepEqual(h.pending(),['iv1','iv2']);
});
test('une session expirée ne peut pas mémoriser de confirmation',()=>{
  const h=harness();h.c.isSessionValid=()=>false;assert.equal(h.c.rememberRouteConfirmation(h.c.IVS),null);assert.equal(h.storage.size,0);
});
test('le cache ne contient que l’identité de la tournée et ses tickets, aucun jeton de session',()=>{
  const h=harness();h.confirm();const saved=JSON.parse(Array.from(h.storage.values())[0]);
  assert.deepEqual(Object.keys(saved).sort(),['caserneId','entries','login','scope','version']);assert.equal(saved.login,'chef.test');
});
test('une indisponibilité du stockage conserve la validation pour l’onglet actif',()=>{
  const h=harness();h.c.localStorage.setItem=()=>{throw Error('stockage bloqué');};h.confirm();assert.deepEqual(h.pending(),[]);
  assert.ok(h.events.some(e=>Array.isArray(e)&&e[1].includes('n’a pas pu mémoriser')));
});
test('un stockage devenu plein ne rétablit pas une ancienne validation après un ajout',()=>{
  const h=harness();h.confirm();h.c.IVS.push(h.iv('iv3'));assert.equal(h.pending().length,3);
  h.c.localStorage.setItem=()=>{throw Error('quota atteint');};h.confirm();assert.deepEqual(h.pending(),[]);
  assert.ok(h.events.some(e=>Array.isArray(e)&&e[1].includes('n’a pas pu mémoriser')));
});
test('la tournée PILP conserve également sa validation après un rechargement',()=>{
  const h=harness();h.c.IVS=[];h.c.PILP_IVS=[h.iv('pilp1'),h.iv('pilp2')];h.c.confirmerSelPilp();assert.equal(h.c.getSelPilp().length,0);
  const reloaded=harness(h.storage,[]);reloaded.c.PILP_IVS=JSON.parse(JSON.stringify(h.c.PILP_IVS));assert.equal(reloaded.c.getSelPilp().length,0);
});
