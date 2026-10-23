const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

process.env.TZ='Europe/Paris';
const root=path.join(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'modules/21-astreinte-tel-js.js'),'utf8');
const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
const startMarker='function astrTelGetData(){';
const endMarker='function astrTelDeleteDuty(id){';
function section(source){
  const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start);
  return source.slice(start,end);
}
function harness(source=moduleSource){
  const sourceDuty={id:'nicolas',mode:'person',login:'nicolas',targetCaserneId:'',
    start:new Date('2026-10-11T18:00').toISOString(),end:new Date('2026-10-25T18:00').toISOString(),
    _hoursSourceOfTruth:true,createdBy:'admin',_hoursApplied:[]};
  const elements={};
  for(const id of ['astrtel-duty-id','astrtel-duty-mode','astrtel-duty-start','astrtel-duty-end','astrtel-duty-login','astrtel-duty-target','astrtel-duty-save','astrtel-duty-person-wrap','astrtel-duty-forward-wrap'])elements[id]={value:'',style:{},textContent:''};
  Object.assign(elements,{
    'astrtel-duty-id':{value:''},'astrtel-duty-mode':{value:'person'},
    'astrtel-duty-start':{value:'2026-10-23T13:45'},'astrtel-duty-end':{value:'2026-10-23T21:15'},
    'astrtel-duty-login':{value:'valery'},'astrtel-duty-target':{value:''}
  });
  const calls={saved:0,toasts:[],confirmation:null};
  const context={
    CURRENT_CASERNE_ID:'CIS05',CASERNE_DATA:{CIS05:{astrTelData:{},astrTelDuties:[sourceDuty]}},
    USERS:[{l:'nicolas',nom:'Lhernout',prenom:'Nicolas'},{l:'valery',nom:'Leriche',prenom:'Valéry'},{l:'other',nom:'Autre',prenom:'Agent'}],
    CU:{l:'admin'},USE_RECORDS:false,
    initCaserneData(){},hasAdministrativeAccount(){return true;},
    CD(){return context.CASERNE_DATA.CIS05;},
    document:{getElementById(id){return elements[id]||null;}},
    pad(n){return String(n).padStart(2,'0');},
    fullNameAff(user){return user.nom+' '+user.prenom;},
    escHtml(text){return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;');},
    confirmModal(message,callback){calls.confirmation={message,callback};},
    showToast(message){calls.toasts.push(message);},
    saveData(){calls.saved++;},astrTelRenderDutyAdmin(){},astrTelRenderGrid(){},rAccueil(){}
  };
  vm.createContext(context);
  vm.runInContext(section(source),context);
  vm.runInContext('astrTelApplyDutyHours(astrTelGetDuties()[0])',context);
  return {context,elements,calls,sourceDuty};
}
function save(h){vm.runInContext('astrTelSaveDuty()',h.context);}
function duties(h){return h.context.CASERNE_DATA.CIS05.astrTelDuties;}
function data(h){return h.context.CASERNE_DATA.CIS05.astrTelData;}
function activeLogin(h,localTime){
  h.context.checkAt=new Date(localTime).getTime();
  return vm.runInContext('astrTelActiveDuty(checkAt)?.login',h.context);
}

for(const [label,source] of [['module',moduleSource],['application assemblée',appSource]]){
  test(label+' : relève temporaire avec reprise de Nicolas et heures conservées',()=>{
    const h=harness(source),before=JSON.stringify(data(h));
    save(h);
    assert.equal(h.calls.saved,0);
    assert.equal(duties(h).length,1);
    assert.equal(JSON.stringify(data(h)),before);
    assert.match(h.calls.confirmation.message,/reprendra ensuite/);
    assert.match(h.calls.confirmation.message,/Leriche Valéry/);
    h.calls.confirmation.callback();
    assert.equal(h.calls.saved,1);
    assert.equal(duties(h).length,3);
    const original=duties(h).find(d=>d.id==='nicolas');
    const relief=duties(h).find(d=>d.login==='valery');
    const resumed=duties(h).find(d=>d._splitFrom==='nicolas');
    assert.equal(original.end,new Date('2026-10-23T13:45').toISOString());
    assert.equal(relief.start,original.end);
    assert.equal(relief.end,new Date('2026-10-23T21:15').toISOString());
    assert.equal(resumed.start,relief.end);
    assert.equal(resumed.end,new Date('2026-10-25T18:00').toISOString());
    assert.equal(resumed.createdBy,'admin');
    assert.equal(activeLogin(h,'2026-10-23T13:44'),'nicolas');
    assert.equal(activeLogin(h,'2026-10-23T13:45'),'valery');
    assert.equal(activeLogin(h,'2026-10-23T21:15'),'nicolas');
    assert.equal(activeLogin(h,'2026-10-25T18:00'),undefined);
    assert.equal(data(h)['nicolas_2026_9'][23],16.5);
    assert.equal(data(h)['valery_2026_9'][23],7.5);
    assert.equal(data(h)['nicolas_2026_9'][24],24);
    assert.equal(data(h)['nicolas_2026_9'][25],19);
  });
}

test('annulation ou données modifiées pendant la confirmation : aucune écriture',()=>{
  const h=harness(),before=JSON.stringify(data(h));
  save(h);
  assert.equal(h.calls.saved,0);
  assert.equal(JSON.stringify(data(h)),before);
  duties(h)[0].updatedAt=Date.now();
  h.calls.confirmation.callback();
  assert.equal(h.calls.saved,0);
  assert.equal(duties(h).length,1);
  assert.match(h.calls.toasts.at(-1),/ont changé/);
});

test('une nouvelle relève peut être ajoutée dans la période de reprise',()=>{
  const h=harness();
  save(h);h.calls.confirmation.callback();
  h.elements['astrtel-duty-start'].value='2026-10-24T12:00';
  h.elements['astrtel-duty-end'].value='2026-10-24T14:00';
  h.elements['astrtel-duty-login'].value='valery';
  save(h);h.calls.confirmation.callback();
  assert.equal(h.calls.saved,2);
  assert.equal(duties(h).length,5);
  assert.equal(activeLogin(h,'2026-10-24T11:59'),'nicolas');
  assert.equal(activeLogin(h,'2026-10-24T12:00'),'valery');
  assert.equal(activeLogin(h,'2026-10-24T14:00'),'nicolas');
  assert.equal(data(h)['nicolas_2026_9'][24],22);
  assert.equal(data(h)['valery_2026_9'][24],2);
});

test('plusieurs permanences chevauchées : remplacement refusé sans écriture',()=>{
  const h=harness();
  duties(h).push({id:'second',mode:'forward',start:new Date('2026-10-23T17:00').toISOString(),end:new Date('2026-10-23T18:00').toISOString()});
  save(h);
  assert.equal(h.calls.confirmation,null);
  assert.equal(h.calls.saved,0);
  assert.match(h.calls.toasts.at(-1),/chevauche/);
});

test('total journalier invalide : retour intégral à la copie initiale',()=>{
  const h=harness();
  data(h)['other_2026_9']={23:1};
  const beforeData=JSON.stringify(data(h)),beforeDuties=JSON.stringify(duties(h));
  save(h);
  h.calls.confirmation.callback();
  assert.equal(h.calls.saved,0);
  assert.equal(JSON.stringify(data(h)),beforeData);
  assert.equal(JSON.stringify(duties(h)),beforeDuties);
  assert.match(h.calls.toasts.at(-1),/24 heures/);
});
