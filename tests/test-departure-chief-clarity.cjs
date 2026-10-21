const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'modules/12-astreintes-js.js'),'utf8');
const bundleSource=fs.readFileSync(path.join(root,'app.js'),'utf8');

function functionSource(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const body=source.indexOf('{',start);
  let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error('Unclosed '+name);
}

for(const source of [moduleSource,bundleSource]){
  const messages=[];
  let focused=false,scrolled=false;
  const fields={
    'pers-engin':{value:'VTU-01'},
    'pers-engin2':{value:'VPI-01'},
    'eq2-ca':{value:'',focus(){focused=true;},scrollIntoView(){scrolled=true;}}
  };
  const context={
    CU:{l:'chef.test'},USERS:[],window:{_piqData:{ivId:'iv-test',agr2:''}},
    document:{getElementById:id=>fields[id]||null},
    _pendingNextInterventionStarts:{},
    interventionById:()=>({id:'iv-test',s:'selectionne',_agr2:''}),
    operationalActionInProgress:()=>false,
    canCurrentUserStartIntervention:()=>true,
    findInterruptedDepartureHandoff:()=>null,
    getHHMM:()=> '12:00',N:()=>new Date(),
    hasActiveOutgoingPersonnelReinforcementRequest:()=>false,
    showToast:message=>messages.push(message)
  };
  vm.createContext(context);
  vm.runInContext(functionSource(source,'confirmerDepart'),context);
  context.confirmerDepart('iv-test');
  assert.match(messages[0],/premier véhicule.*deuxième véhicule/);
  assert.equal(focused,true);
  assert.equal(scrolled,true);

  fields['pers-engin2'].value='';
  context.readDepartureCrewFields=(vehicle,prefix,chief)=>[{role:'CA',login:chief}];
  context.interventionRoleKey=role=>role==='CA'?'chefdagres':role;
  messages.length=0;
  context.confirmerDepart('iv-test');
  assert.match(messages[0],/conducteur/);
  assert.doesNotMatch(messages[0],/chef d’agrès/);
}
console.log('Départ : chef principal distinct du chef du deuxième véhicule.');
