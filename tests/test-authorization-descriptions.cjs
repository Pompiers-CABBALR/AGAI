const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function loadFunction(context,file,name){
  const source=read(file),start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name);
  const next=source.indexOf('\nfunction ',start+1);
  vm.runInContext(source.slice(start,next<0?undefined:next),context);
}
function harness(){
  const iv={id:'iv-503',n:'Nid de guêpes et frelons',com:'Isbergues',addr:'Rue de la Piscine',h:'20261020_1037',_hDebut:'10:37',_hFin:'11:11',_numMois:89};
  const elements=new Map(),events=[];
  function element(id){
    if(!elements.has(id))elements.set(id,{value:'',style:{},innerHTML:'',textContent:'',classList:{add(){}},setAttribute(key,value){this[key]=value;},focus(){events.push(['focus',id]);}});
    return elements.get(id);
  }
  const c=vm.createContext({
    document:{getElementById:element,querySelectorAll:()=>[]},
    interventionById:id=>id===iv.id?iv:null,
    requireCurrentUserOperationalManager:()=>true,
    interventionNids:()=>[{nature:iv.n,localisation:'Toiture'}],
    showToast:(...args)=>events.push(['toast',...args]),saveData:()=>events.push(['save']),
    escHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    pad:n=>String(n).padStart(2,'0'),setTimeout(){},registerMobileModalFields(){},openModalAtTop(){},
    canOpenInterventionPdfOnThisDevice:()=>true,requireInterventionPdfDesktop:()=>true,
    getAvisPassageCaserne:()=>({nom:'UT Lapugnoy'}),_getLogoSrc:()=>'',
    interventionDisplayUTNumber:()=>503,interventionVehicleNames:()=>['VTU-01'],
    interventionReportParticipants:()=>[],getAvisPassageHour:()=>'',_isFrelonIv:()=>false,
    _buildAvisPassageBody:()=>'',USERS:[],Date,console,
  });
  vm.runInContext(read('modules/13-autorisation-js.js'),c);
  loadFunction(c,'modules/15-storage-js.js','_buildAutorisationHTML');
  loadFunction(c,'modules/16-email-js.js','genRapportInterventionHTML');
  const fill=(objet,nature)=>{
    element('aut-nom').value='Demandeur';element('aut-adresse').value=iv.addr;
    element('aut-objet').value=objet;element('aut-nature').value=nature;
  };
  return {c,iv,element,events,fill,open:index=>c.showAutorisationModal(iv.id,index),save:()=>c.saveAutorisationData(iv.id)};
}
test('un nouveau formulaire affiche deux champs vides avec exemples, sans copie de l’appel',()=>{
  const h=harness();h.open();
  const html=h.element('mb').innerHTML;
  assert.match(html,/id="aut-objet"[^>]*required[^>]*placeholder="Ex\.[^"]+" value=""/);
  assert.match(html,/id="aut-nature"[^>]*required[^>]*placeholder="Ex\.[^"]+"[^>]*><\/textarea>/);
  assert.match(html,/Le chef d’agrès doit compléter/);
  assert.match(html,/role="alert"/);
  assert.equal(h.events.some(e=>e[0]==='save'),false);
});
test('un document existant conserve ses textes saisis et les échappe à la réouverture',()=>{
  const h=harness();h.iv._autorisationData={nom:'Demandeur',objet:'Objet "précis"',nature:'Travaux <réalisés>'};
  h.open();const html=h.element('mb').innerHTML;
  assert.match(html,/value="Objet &quot;précis&quot;"/);
  assert.match(html,/Travaux &lt;réalisés&gt;<\/textarea>/);
  assert.equal(h.iv._autorisationData.nature,'Travaux <réalisés>');
});
test('un nouveau nid reprend le demandeur et la signature, sans copier les deux descriptions',()=>{
  const h=harness();const first={nom:'Demandeur commun',objet:'Objet premier nid',nature:'Travaux premier nid',signature:'signature'};
  h.iv._autorisationNids=[first];h.c.interventionNids=()=>[{nature:'Guêpes'},{nature:'Frelons'}];
  h.open(1);const html=h.element('mb').innerHTML;
  assert.match(html,/value="Demandeur commun"/);
  assert.match(html,/id="aut-objet"[^>]*value=""/);
  assert.match(html,/id="aut-nature"[^>]*><\/textarea>/);
  assert.doesNotMatch(html,/Objet premier nid|Travaux premier nid/);
  assert.equal(h.iv._autorisationNids[0],first);
  assert.equal(h.iv._autorisationNids.length,1);
});
test('chaque nid conserve ses propres descriptions à la réouverture',()=>{
  const h=harness();h.iv._autorisationNids=[{nom:'Commun',objet:'Premier',nature:'Travaux premier'},{nom:'Commun',objet:'Deuxième',nature:'Travaux deuxième'}];
  h.c.interventionNids=()=>[{nature:'Guêpes'},{nature:'Frelons'}];h.open(1);
  const html=h.element('mb').innerHTML;
  assert.match(html,/value="Deuxième"/);assert.match(html,/Travaux deuxième<\/textarea>/);
  assert.doesNotMatch(html,/value="Premier"/);
});
for(const [label,objet,nature,first] of [['deux champs absents','','','objet'],['objet blanc','  \n ','Travaux décrits','objet'],['réalisation blanche','Objet décrit','  \t ','nature']]){
  test(label+' : refus explicite sans modifier les données ni les documents existants',()=>{
    const h=harness();h.iv._autorisationData={nom:'Ancien',objet:'Objet conservé',nature:'Travaux conservés'};h.iv._pdfAutorisation='archive';
    h.open();h.fill(objet,nature);const before=JSON.stringify(h.iv);
    assert.equal(h.save(),false);assert.equal(JSON.stringify(h.iv),before);
    assert.equal(h.events.some(e=>e[0]==='save'),false);
    assert.match(h.element('aut-form-error').textContent,/Le chef d’agrès doit compléter correctement/);
    assert.equal(h.element('aut-form-error').style.display,'block');
    assert.equal(h.element('aut-'+first)['aria-invalid'],'true');
    assert.ok(h.events.some(e=>e[0]==='focus'&&e[1]==='aut-'+first));
  });
}
test('une saisie corrigée enregistre les deux textes et renouvelle les documents périmés',()=>{
  const h=harness();h.open();h.fill('','');assert.equal(h.save(),false);
  h.iv._pdfAutorisation='ancienne copie';h.iv._pdfAttestations=['ancienne copie'];
  h.fill('  Destruction du nid sous toiture  ','  Traitement à la poudre avec une perche  ');
  assert.equal(h.save(),true);
  assert.equal(h.iv._autorisationData.objet,'Destruction du nid sous toiture');
  assert.equal(h.iv._autorisationData.nature,'Traitement à la poudre avec une perche');
  assert.equal(h.element('aut-form-error').style.display,'none');
  assert.equal(h.element('aut-nature')['aria-invalid'],'false');
  assert.equal(h.events.filter(e=>e[0]==='save').length,1);
  assert.equal(h.iv._pdfAutorisation,undefined);assert.equal(h.iv._pdfAttestations,undefined);
  const html=h.c._buildAutorisationHTML(h.iv.id,'autorisation');
  assert.match(html,/Destruction du nid sous toiture/);assert.match(html,/Traitement à la poudre avec une perche/);
});
test('le refus des droits empêche toute sauvegarde',()=>{
  const h=harness();h.fill('Objet','Travaux');h.c.requireCurrentUserOperationalManager=()=>false;
  assert.equal(h.save(),false);assert.equal(h.iv._autorisationData,undefined);
  assert.equal(h.events.some(e=>e[0]==='save'),false);
});
for(const [file,name,args] of [
  ['modules/13-autorisation-js.js','previewAutorisationPDF',['iv','autorisation']],
  ['modules/13-autorisation-js.js','genAutorisationDocx',['iv']],
  ['modules/15-storage-js.js','savePdfDocuments',['iv']],
  ['modules/16-email-js.js','envoyerAttestationMail',['iv']],
])test(name+' s’arrête si la validation du formulaire échoue',()=>{
  let attempts=0;
  const c=vm.createContext({AGAI_RUNTIME_CONFIG:{},saveAutorisationData:()=>{attempts++;return false;},requireInterventionPdfDesktop:()=>true,
    interventionById:()=>{throw Error('Traitement poursuivi après refus');}});
  loadFunction(c,file,name);c[name](...args);assert.equal(attempts,1);
});
test('aucune autorisation ni attestation vide n’est générée depuis une ancienne fiche incomplète',()=>{
  const h=harness();h.iv._autorisationData={nom:'Demandeur',objet:'   ',nature:'Travaux'};
  for(const type of ['autorisation','attestation'])assert.equal(h.c._buildAutorisationHTML(h.iv.id,type),'');
  assert.equal(h.c.genRapportInterventionHTML(h.iv.id),null);
  assert.ok(h.events.some(e=>e[0]==='toast'&&e[1].includes('chaque autorisation')));
});
for(const count of [1,2])test('rapport avec '+count+' autorisation(s) : contenu conservé, aucun libellé « Nid x sur y »',()=>{
  const h=harness();h.iv._autorisationNids=Array.from({length:count},(_,index)=>({nom:'Demandeur',objet:'Objet saisi '+index,nature:'Travaux réels '+index}));
  const before=JSON.stringify(h.iv),html=h.c.genRapportInterventionHTML(h.iv.id);
  assert.equal((html.match(/AUTORISATION D’INTERVENTION/g)||[]).length,count);
  assert.doesNotMatch(html,/Nid \d+ sur \d+/);
  for(let index=0;index<count;index++){assert.ok(html.includes('Objet saisi '+index));assert.ok(html.includes('Travaux réels '+index));}
  if(count>1)assert.match(html,/class="aut-nid-doc" style="page-break-before:always/);
  assert.equal(JSON.stringify(h.iv),before);
});
test('une intervention sans autorisation garde son rapport normal',()=>{
  const h=harness();assert.match(h.c.genRapportInterventionHTML(h.iv.id),/Rapport d’intervention/);
});
