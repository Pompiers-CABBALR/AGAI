const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function extract(source,name){
  const a=source.indexOf('function '+name+'('),body=source.indexOf('{',a);let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(a,i+1);
  }
  throw Error('Fonction absente : '+name);
}
function harness(role='admin',type='stag'){
  const entry={id:'training-1',titre:'Ancien titre',ref:'REF',lieu:'Caserne',ddebut:'2026-10-19',dfin:'2026-10-19',hmatind:'08:00',hmatinf:'12:00',hapremd:'',hapremf:'',participants:['trainer'],auteur:'creator',ts:100};
  const fmpa={id:'fmpa-1',date:'2026-10-19',theme:'Secours',hDebut:'08:00',hFin:'12:00',participants:['trainer'],formateurs:[],numAnnuel:1};
  const elements=new Map(),events=[];let selected=['trainer'];
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',style:{},innerHTML:'',textContent:''});return elements.get(id);};
  const c={CURRENT_CASERNE_ID:'CIS05',CASERNE_DATA:{CIS05:{formStag:type==='stag'?[entry]:[],formForm:type==='form'?[entry]:[],fmpas:[fmpa]}},
    CU:{l:'editor',prenom:'Admin',nom:'Test',rights:role==='admin'?['Administration']:[]},GLOBAL_ROLE:role==='superadmin'?'superadmin':null,
    USERS:[{l:'trainer',nom:'Formateur',prenom:'Actuel',fonctionsFormateur:['EAP 1']},{l:'regular',nom:'Agent',prenom:'Ordinaire'}],
    window:{},document:{getElementById:element,querySelectorAll:selector=>selector.includes('fedit-participants')?selected.map(value=>({value})):[]},
    escHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    personnelUnavailableForPeriod:()=>null,personnelScheduleName:x=>x,findInterventionConflictForSchedule:()=>null,
    personnelScheduleConflictMessage:()=> 'Conflit opérationnel',showToast:(...args)=>events.push(['toast',...args]),
    saveData:immediate=>events.push(['save',immediate]),cM:()=>events.push(['close']),
    dureeFormatHHMM:x=>x||'',pad:x=>String(x).padStart(2,'0'),_jbEditLock:0,console,Date,Set,JSON,
  };
  for(const [file,name] of [['modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js','hasRight'],['modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js','isSuperAdmin'],['modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js','isAdminModeActive'],['modules/16-email-js.js','hhmmToMinutes'],['modules/12-astreintes-js.js','dureeMinutesHHMM'],['modules/09-pilp-js.js','personnelFormationHoursError']])vm.runInNewContext(extract(read(file),name),c);
  c.dureeHHMM=(a,b)=>c.dureeMinutesHHMM((c.hhmmToMinutes(b)-c.hhmmToMinutes(a)+1440)%1440);
  for(const [file,name] of [['modules/14-stats-js.js','getJoursFeries'],['modules/09-pilp-js.js','formationCalendarDays'],['modules/09-pilp-js.js','formationTrainingDays']])vm.runInNewContext(extract(read(file),name),c);
  vm.runInNewContext(read('modules/20-formations-js.js'),c);
  for(const name of ['rFormStagList','rFormStagRecap','rFormFormList','rFormFormRecap','rFmpaList'])c[name]=()=>events.push([name]);
  function open(){c.formEditEntry(type,entry.id);fill();}
  function fill(changes={}){
    const fields={'fedit-titre':'Nouveau titre','fedit-ref':'REF','fedit-lieu':'Caserne','fedit-ddebut':'2026-10-19','fedit-dfin':'2026-10-19','fedit-hmatin-d':'08:00','fedit-hmatin-f':'12:00','fedit-haprem-d':'','fedit-haprem-f':'','fedit-motif':'Correction demandée'};
    for(const [id,value] of Object.entries({...fields,...changes}))element(id).value=value;
  }
  return {c,entry,fmpa,events,element,open,fill,select:value=>selected=value,save:()=>c.formSaveEdit(type,entry.id)};
}
for(const role of ['admin','superadmin'])for(const type of ['stag','form']){
  test(role+' peut corriger '+type+' en conservant identité, auteur initial et historique',()=>{
    const h=harness(role,type);h.open();h.save();
    assert.equal(h.entry.id,'training-1');assert.equal(h.entry.auteur,'creator');assert.equal(h.entry.ts,100);
    assert.equal(h.entry.titre,'Nouveau titre');assert.equal(h.entry.htotal,'04:00');
    assert.equal(h.entry.historique.length,1);assert.equal(h.entry.historique[0].auteur,'editor');
    assert.equal(h.entry.historique[0].avant.titre,'Ancien titre');assert.equal(h.entry.historique[0].apres.titre,'Nouveau titre');
    assert.deepEqual(h.events.filter(e=>e[0]==='save'),[['save',true]]);
  });
}
test('un agent ordinaire ne peut pas ouvrir ni enregistrer une correction',()=>{
  const h=harness('agent');h.open();h.save();h.c.fmpaSaveEdit(h.fmpa.id);
  assert.equal(h.events.some(e=>e[0]==='save'),false);assert.equal(h.entry.titre,'Ancien titre');assert.equal(h.fmpa.theme,'Secours');
});
test('la désactivation des pouvoirs entre ouverture et enregistrement bloque la correction',()=>{
  const h=harness();h.open();h.c.window._adminRoleDisabled=true;h.save();
  assert.equal(h.entry.titre,'Ancien titre');assert.equal(h.entry.historique,undefined);
});
for(const [name,changes] of [['motif absent',{'fedit-motif':''}],['période inversée',{'fedit-dfin':'2026-10-18'}],['date inexistante',{'fedit-ddebut':'2026-02-30'}],['créneaux superposés',{'fedit-haprem-d':'11:00','fedit-haprem-f':'15:00'}]]){
  test(name+' : aucune donnée modifiée',()=>{
    const h=harness();h.open();h.fill(changes);h.save();
    assert.equal(h.entry.titre,'Ancien titre');assert.equal(h.events.some(e=>e[0]==='save'),false);assert.equal(h.element('fedit-err').style.display,'block');
  });
}
test('un chevauchement avec une intervention continue à bloquer la correction',()=>{
  const h=harness();h.open();h.c.findInterventionConflictForSchedule=()=>({login:'trainer'});h.save();
  assert.equal(h.entry.titre,'Ancien titre');assert.equal(h.element('fedit-err').textContent,'Conflit opérationnel');
});
test('un changement de caserne ou une fiche actualisée ne peut pas être écrasé depuis une ancienne fenêtre',()=>{
  const station=harness();station.open();station.c.CURRENT_CASERNE_ID='CIS04';station.save();assert.equal(station.entry.titre,'Ancien titre');
  const stale=harness();stale.open();stale.entry.ref='Autre correction';stale.save();assert.equal(stale.entry.titre,'Ancien titre');assert.equal(stale.entry.ref,'Autre correction');
});
test('les anciens participants sont conservés, sans ajouter un nouveau formateur non déclaré',()=>{
  const h=harness('admin','form');h.entry.participants.push('ancien');h.open();h.select(['trainer','ancien']);h.save();
  assert.deepEqual(Array.from(h.entry.participants),['trainer','ancien']);
  const blocked=harness('admin','form');blocked.open();blocked.select(['trainer','regular']);blocked.save();assert.equal(blocked.entry.titre,'Ancien titre');
});
test('deux journées de formation recalculent le total et actualisent le récapitulatif',()=>{
  const h=harness();h.open();h.fill({'fedit-dfin':'2026-10-20'});h.save();
  assert.equal(h.entry.htotal,'08:00');assert.equal(h.events.some(e=>e[0]==='rFormStagRecap'),true);
});
test('aucun changement : pas d’écriture ni de nouvelle entrée d’historique',()=>{
  const h=harness();h.open();h.fill({'fedit-titre':'Ancien titre'});h.save();
  assert.equal(h.entry.historique,undefined);assert.equal(h.events.some(e=>e[0]==='save'),false);
});
test('les modifications FMPA restent accessibles au superadmin et à l’admin actif',()=>{
  for(const role of ['admin','superadmin']){
    const h=harness(role);h.c.fmpaEditer(h.fmpa.id);
    for(const [id,value] of Object.entries({'fmedit-motif':'Correction horaires','fmedit-theme':'Secours corrigé','fmedit-hd':'08:00','fmedit-hf':'11:00'}))h.element(id).value=value;
    h.c.fmpaSaveEdit(h.fmpa.id);
    assert.equal(h.fmpa.theme,'Secours corrigé');assert.equal(h.fmpa.duree,'03:00');assert.equal(h.fmpa.historique.length,1);
  }
});
test('une correction peut ajouter un samedi et conserve ce choix à la réouverture',()=>{
  const h=harness();h.open();h.fill({'fedit-dfin':'2026-10-24'});
  h.c.formChooseTrainingDay('edit','2026-10-24',true);h.save();
  assert.equal(h.entry.htotal,'24:00');assert.ok(h.entry.joursFormation.includes('2026-10-24'));
  assert.ok(h.entry.historique[0].champs.includes('jours de formation'));
  h.c.formEditEntry('stag',h.entry.id);
  assert.match(h.element('fedit-days').innerHTML,/data-formation-day="2026-10-24" checked/);
});
