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

    interventionAddressLabel:record=>record.addr,interventionDisplayUTNumber:record=>String(record._numCaserne),
    interventionRainSummary:()=>'',interventionRouteBadgeHTML:()=>'',hasAdministrativeAccount:()=>true,operationalStartOffsiteConfirmed:()=>false,
    USERS:[],USE_RECORDS:true,_rcPendingDirty:new Set(),_rcDirtyGeneration:0,
    _rcId:(station,type,id)=>station+':'+type+':'+id,_rcPersistPendingDirty(){},
    isAgres:()=>true,hasRight:()=>true,isAdminModeActive:()=>true,
    isPilpReadOnlyForCurrentUser:()=>false,canCurrentUserSelectIntervention:()=>true,
    beginOperationalAction:()=>true,requireCurrentUserOperationalManager:()=>true,
    syncInternalReinforcementSource(){},refreshOperationalInterventionViews(){},rStatsHeader(){},rAccueil(){},cM(){},
    clearInterventionOperationalAssignmentForPending(){},clearInterventionNumbersForPending(){},
    interventionById:id=>c.IVS.concat(c.PILP_IVS).find(record=>record.id===id),
    pushTL:(record,status,who,note,h)=>{if(!record.tl)record.tl=[];record.tl.push({s:status,h:h||'20261105_0900',who,note});},
    confirmModal:(message,callback)=>{events.push(['confirmation',message]);c.pendingConfirmation=callback;},
    window:{scrollX:0,scrollY:200,scrollTo:(x,y)=>events.push(['scroll',x,y])},

    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},isSessionValid:()=>true,
    isTireurPILP:()=>true,canOperatePilp:()=>true,sortRouteSelection:rows=>rows.slice().sort((a,b)=>a._routeOrder-b._routeOrder),
    captureRouteViewPosition:()=>({}),restoreRouteViewPosition(){},rEgrid(){},rI:()=>events.push('render'),rPilp:()=>events.push('pilp-render'),
    getH:()=> '20261105_0900',N:()=>new Date(2026,9,28,9),CD:()=>null,saveData:()=>events.push('save'),_jbEditLock:0,
    showToast:(...args)=>events.push(['toast',...args]),escHtml:String,requestAnimationFrame:cb=>cb(),
    document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{style:{},scrollIntoView(){},innerHTML:''});return nodes.get(id);}},
  });
  c.isPilpIntervention=record=>c.PILP_IVS.includes(record);
  const source=read('modules/08-interventions-js.js'),a=source.indexOf('const _routeConfirmationMemory='),b=source.indexOf('function interventionRouteSelectionKey(',a);
  assert.ok(a>=0&&b>a);vm.runInContext(source.slice(a,b),c);
  for(const name of ['interventionRouteSelectionKey','normalizeInterventionRoute','assignInterventionRoute','editInterventionRoute','renderInterventionRow','cS','toggleChk','avisPassageCancellationTarget','canCancelAvisPassage','avisPassageCancellationFingerprint','avisPassageCancellationButtonHTML','annulerAvisPassage'])vm.runInContext(extract(source,name),c);
  for(const name of ['getSelMixte','getSelPilp','persistRouteOrder','persistPilpRouteOrder','rPL','rPLPilp','confirmerSel','confirmerSelPilp'])vm.runInContext(extract(read('modules/09-pilp-js.js'),name),c);
  for(const name of ['getAvisPassageTimelineEntry','getAvisPassageHour'])vm.runInContext(extract(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),name),c);
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

test('trois cases successives, puis un ordre et une seule confirmation pour toute la tournée',()=>{
  const h=harness(new Map(),[]);
  for(let i=1;i<=3;i++)h.c.IVS.push(h.iv('batch'+i,{s:'en-attente',agr:null,tl:[]}));
  h.c.IVS.forEach(record=>h.c.toggleChk(record.id,{checked:true}));
  assert.equal(h.storage.size,0);assert.equal(h.c.routeSelectionReviewIsOpen('standard'),false);
  assert.deepEqual(h.pending(),['batch1','batch2','batch3']);
  h.c.openRouteSelectionReview('standard');assert.equal(h.c.routeSelectionReviewIsOpen('standard'),true);
  h.c.persistRouteOrder([h.c.IVS[2],h.c.IVS[0],h.c.IVS[1]]);
  h.confirm();assert.deepEqual(h.pending(),[]);assert.equal(h.c.routeSelectionReviewIsOpen('standard'),false);
  const reloaded=harness(h.storage,JSON.parse(JSON.stringify(h.c.IVS)));
  assert.deepEqual(reloaded.pending(),[]);assert.equal(reloaded.c.IVS[2]._routeOrder,1);
});
test('un nouvel ajout ferme le panneau d’ordre pour pouvoir continuer à cocher',()=>{
  const h=harness();h.c.openRouteSelectionReview('standard');
  h.c.IVS.push(h.iv('iv3',{s:'en-attente',agr:null,tl:[]}));h.c.toggleChk('iv3',{checked:true});
  assert.equal(h.c.routeSelectionReviewIsOpen('standard'),false);assert.equal(h.pending().length,3);assert.equal(h.storage.size,0);
  h.c.renderRouteSelectionControls('standard',h.c.getSelMixte());
  assert.match(h.node('route-selection-zone').innerHTML,/3 intervention/);
  assert.match(h.node('route-selection-zone').innerHTML,/Organiser et confirmer/);
});
test('continuer la sélection ne valide pas la tournée',()=>{
  const h=harness();h.c.openRouteSelectionReview('standard');h.c.continueRouteSelection('standard');
  assert.equal(h.c.routeSelectionReviewIsOpen('standard'),false);assert.equal(h.pending().length,2);assert.equal(h.storage.size,0);
});
test('cocher plusieurs PILP ne demande aucune confirmation intermédiaire',()=>{
  const h=harness(new Map(),[]);h.c.PILP_IVS=[h.iv('pilp1',{s:'en-attente',agr:null,tl:[]}),h.iv('pilp2',{s:'en-attente',agr:null,tl:[]})];
  h.c.PILP_IVS.forEach(record=>h.c.toggleChk(record.id,{checked:true}));
  assert.equal(h.storage.size,0);assert.equal(h.c.routeSelectionReviewIsOpen('pilp'),false);
  h.c.openRouteSelectionReview('pilp');assert.equal(h.c.routeSelectionReviewIsOpen('pilp'),true);
  h.c.confirmerSelPilp();assert.equal(h.c.getSelPilp().length,0);
});
test('une tournée mixte présente aussi ses interventions déjà validées après un ajout PILP',()=>{
  const h=harness();h.confirm();h.c.PILP_IVS=[h.iv('pilp1')];
  assert.deepEqual(h.pending(),['iv1','pilp1','iv2']);h.confirm();assert.deepEqual(h.pending(),[]);
});
test('une notification de case répétée ne crée ni nouveau ticket ni nouvelle confirmation',()=>{
  const h=harness();h.confirm();const before=JSON.stringify(h.c.IVS[0]);
  h.c.toggleChk('iv1',{checked:true});assert.equal(JSON.stringify(h.c.IVS[0]),before);assert.deepEqual(h.pending(),[]);
});
test('une sélection interdite reste refusée depuis les cases de la liste',()=>{
  const h=harness(new Map(),[]);h.c.IVS=[h.iv('blocked',{s:'en-attente',agr:null})];h.c.canCurrentUserSelectIntervention=()=>false;
  const checkbox={checked:true};h.c.toggleChk('blocked',checkbox);
  assert.equal(h.c.IVS[0].s,'en-attente');assert.equal(checkbox.checked,false);
});
test('une confirmation expirée ne modifie pas non plus les ordres enregistrés',()=>{
  const h=harness();h.c.isSessionValid=()=>false;h.confirm();
  assert.equal(h.events.filter(e=>e==='save').length,0);assert.equal(h.storage.size,0);
});
test('le panneau d’ordre ne s’ouvre plus automatiquement après chaque sélection, dans les deux vues',()=>{
  const standard=read('modules/08-interventions-js.js'),pilp=read('modules/09-pilp-js.js');
  assert.match(extract(standard,'rI'),/selNonConf.length>0&&routeSelectionReviewIsOpen\('standard'\)/);
  assert.match(extract(pilp,'rPilp'),/pilpSelection.length&&routeSelectionReviewIsOpen\('pilp'\)/);
});
function withAvis(extra={}){
  const h=harness(new Map(),[]);h.c.IVS=[h.iv('avis',{s:'terminee',_avisPassage:true,_avisEnAttente:true,_avisPassageAt:'20261104_1500',_avisPassageDate:'20261104',_avisPassageHeure:'15:00',
    _hDebut:'14:00',_hFin:'15:10',_numCaserne:501,_crTexte:'Compte rendu conservé',eng:'VTU-01',avisIds:['avis','other'],tl:[{s:'avis-passage',h:'20261104_1500',who:'chef.test'},{s:'terminee',h:'20261104_1510',who:'chef.test'}],...extra})];return h;
}
test('annuler l’avis attend la confirmation puis conserve la clôture, les heures, le numéro et le rapport',()=>{
  const h=withAvis(),record=h.c.IVS[0];h.c.annulerAvisPassage('avis','standard');
  assert.equal(record._avisPassage,true);assert.equal(h.events.includes('save'),false);
  h.c.pendingConfirmation();
  assert.equal(record.s,'terminee');assert.equal(record._avisPassage,false);assert.equal(record._avisEnAttente,false);assert.equal(record._avisPassageClasse,false);
  assert.equal(record._hDebut,'14:00');assert.equal(record._hFin,'15:10');assert.equal(record._numCaserne,501);assert.equal(record.eng,'VTU-01');assert.equal(record._crTexte,'Compte rendu conservé');
  assert.equal(record._avisPassageAnnulations[0].avisAt,'20261104_1500');assert.equal(record._avisPassageAnnulePar,'chef.test');
  assert.equal(record.tl.at(-1).s,'avis-annule');assert.deepEqual(Array.from(record.avisIds),['other']);
  assert.ok(h.c._rcPendingDirty.has('CIS05:iv:avis'));assert.equal(h.events.filter(e=>e==='save').length,1);
});
for(const condition of ['droits','expiration'])test('annulation refusée sans '+condition,()=>{
  const h=withAvis();if(condition==='droits')h.c.isAdminModeActive=()=>false;else h.c.isSessionValid=()=>false;
  h.c.annulerAvisPassage('avis','standard');assert.equal(h.c.pendingConfirmation,undefined);assert.equal(h.c.IVS[0]._avisPassage,true);
  assert.equal(h.c.avisPassageCancellationButtonHTML(h.c.IVS[0],'standard'),'');
});
for(const change of ['droits','expiration','compte','caserne','avis'])test('confirmation périmée refusée après changement de '+change,()=>{
  const h=withAvis();h.c.annulerAvisPassage('avis','standard');
  if(change==='droits')h.c.isAdminModeActive=()=>false;
  if(change==='expiration')h.c.isSessionValid=()=>false;
  if(change==='compte')h.c.CU.l='autre.agent';
  if(change==='caserne')h.c.CURRENT_CASERNE_ID='CIS06';
  if(change==='avis')h.c.IVS[0]._avisPassageAt='20261105_0800';
  h.c.pendingConfirmation();assert.equal(h.c.IVS[0]._avisPassage,true);assert.equal(h.events.includes('save'),false);
});
test('un avis PILP annulé garde la clôture à la date initiale et corrige sa copie historique',()=>{
  const h=withAvis({s:'avis-passage'}),record=h.c.IVS.shift();record.id='pilp1';delete record._hFin;record.avisIds=['pilp1'];
  record.tl=[{s:'avis-passage',h:'20261104_1500',who:'chef.test'}];h.c.PILP_IVS=[record];
  h.c.IVS=[{...JSON.parse(JSON.stringify(record)),id:'mirror',s:'terminee',_lienPilpSourceId:'pilp1',_hFin:'15:00'}];
  h.c.annulerAvisPassage('mirror','standard');h.c.pendingConfirmation();
  assert.equal(record.s,'terminee');assert.equal(record._hFin,'15:00');assert.equal(record.tl.find(e=>e.s==='terminee').h,'20261104_1500');
  assert.equal(h.c.IVS[0]._avisPassage,false);assert.equal(h.c.IVS[0]._hFin,'15:00');
  assert.ok(h.c._rcPendingDirty.has('CIS05:pilp:pilp1'));assert.ok(h.c._rcPendingDirty.has('CIS05:iv:mirror'));
});
test('un avis déjà classé peut être annulé et une annulation ne peut pas être répétée',()=>{
  const h=withAvis({_avisEnAttente:false,_avisPassageClasse:true});h.c.annulerAvisPassage('avis','standard');h.c.pendingConfirmation();
  h.c.pendingConfirmation=undefined;h.c.annulerAvisPassage('avis','standard');
  assert.equal(h.c.pendingConfirmation,undefined);assert.equal(h.c.IVS[0]._avisPassageAnnulations.length,1);
});
test('un avis d’une intervention encore active ne peut pas être annulé par cette correction de clôture',()=>{
  const h=withAvis({s:'en-cours'});h.c.annulerAvisPassage('avis','standard');assert.equal(h.c.pendingConfirmation,undefined);
});

test('la pastille et le document d’avis disparaissent après annulation, sans retirer le statut terminé',()=>{
  const h=withAvis(),record=h.c.IVS[0];
  assert.match(h.c.renderInterventionRow(record,true,false),/Avis passage/);
  h.c.annulerAvisPassage('avis','standard');h.c.pendingConfirmation();
  const html=h.c.renderInterventionRow(record,true,false);assert.doesNotMatch(html,/Avis passage/);assert.match(html,/Terminée/);
  vm.runInContext(extract(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),'_buildAvisPassageBody'),h.c);
  assert.equal(h.c._buildAvisPassageBody(record),'');assert.equal(h.c.avisPassageCancellationButtonHTML(record,'standard'),'');
});
