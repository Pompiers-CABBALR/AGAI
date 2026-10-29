const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

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

const bundle=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
for(const [file,names] of [
  ['modules/06-ui-js-accueil-js.js',['showToast']],
  ['modules/08-interventions-js.js',['openOperationalStartDialog','addOperationalStartDialogButton','canCurrentUserUseDegradedStart','showOperationalDegradedStartConfirmation','showOperationalStartLocationFailure','operationalStartOffsiteEvidence','requestOperationalStartAuthorization','saveOperationalStartAuthorization']],
  ['modules/12-astreintes-js.js',['showOperationalDepartureFormError','confirmerDepart']]
]){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  for(const name of names)assert.equal(functionSource(source,name),functionSource(bundle,name),name+' matches the deployed bundle');
}

for(const relativePath of ['modules/08-interventions-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',relativePath),'utf8');
  const notices=[],toasts=[];
  let approved=0,positionAllowed=false,invalidPosition=false,distance=0,positionTick=0,chief=true;
  const context={
    CURRENT_CASERNE_ID:'CIS05',
    CU:{l:'chef.test'},
    PERSONNEL_ONLINE_GATE:true,
    isAgres:()=>chief,
    isPilpIntervention:()=>false,
    canCurrentUserStartIntervention:()=>true,
    _agaiAuthAccessToken:()=> 'test-token',
    hasSuperAdminOperationalStartOverride:()=>false,
    canUseOperationalStartDevice:()=>true,
    operationalStartGeolocationEnabled:()=>true,
    operationalStartGeoExemption:()=>null,
    CC:()=>({id:'CIS05'}),
    getCaserneStationLocation:()=>({latitude:50,longitude:2}),
    validCaserneCoordinates:()=>true,
    operationalDistanceMeters:()=>distance,
    operationalStartMeasurementScore:()=>0,
    operationalStartPositionAccepted:value=>value<2000,
    _operationalStartAuthorizations:{},
    _operationalStartLocationPending:new Set(),
    _operationalStartDegradedEligibility:{},
    showToast:(message,type,duration)=>toasts.push({message,type,duration}),
    canCurrentUserUseDegradedStart:()=>true,
    showOperationalDegradedStartConfirmation:()=>{},
    showOperationalStartLocationFailure:(message,onRetry,onDegraded)=>notices.push({message,onRetry,onDegraded}),
    navigator:{geolocation:{getCurrentPosition(onSuccess,onError){
      if(positionAllowed)onSuccess({timestamp:Date.now()-1000+100*(++positionTick),coords:{latitude:invalidPosition?NaN:50,longitude:2,accuracy:20}});
      else onError({code:1});
    }}},
    window:{setTimeout:fn=>fn()}
  };
  vm.createContext(context);
  vm.runInContext('const OPERATIONAL_START_STATION_PROXIMITY_METERS=500; const OPERATIONAL_START_OFFSITE_MAX_ACCURACY_METERS=250; const OPERATIONAL_START_MAX_GPS_UNCERTAINTY_METERS=500;',context);
  vm.runInContext(functionSource(source,'operationalStartOffsiteEvidence'),context);
  vm.runInContext(functionSource(source,'requestOperationalStartAuthorization'),context);
  context.requestOperationalStartAuthorization({id:'iv-test'},()=>{approved++;});
  assert.equal(approved,0,relativePath+' refuses departure when location denied');
  assert.equal(notices.length,1);
  assert.match(notices[0].message,/navigateur.*position/);
  assert.equal(typeof notices[0].onRetry,'function');
  assert.equal(typeof notices[0].onDegraded,'function');
  assert.match(toasts[0].message,/Vérification.*1\/4/);
  assert.equal(toasts[0].duration,24000);

  positionAllowed=true;
  notices[0].onRetry();
  assert.equal(approved,1,relativePath+' lets the chief retry without an administrator');
  assert.equal(context._operationalStartAuthorizations['iv-test'].exempt,false);

  distance=4000;
  context.requestOperationalStartAuthorization({id:'iv-outside'},()=>{approved++;});
  assert.equal(approved,2,relativePath+' accepts two fresh, precise offsite positions without an extra dialog');
  assert.equal(context._operationalStartAuthorizations['iv-outside'].offsite,true);
  assert.equal(notices.length,1,'an offsite departure does not display a new warning');
  distance=1100;
  context.requestOperationalStartAuthorization({id:'iv-garage'},()=>{approved++;});
  assert.equal(approved,3,relativePath+' flags a garage less than two kilometres away');
  assert.equal(context._operationalStartAuthorizations['iv-garage'].offsite,true);
  chief=false;distance=4000;
  context.requestOperationalStartAuthorization({id:'iv-not-chief'},()=>{approved++;});
  assert.equal(approved,3,relativePath+' keeps the offsite exception restricted to a chief');
  assert.equal(context._operationalStartAuthorizations['iv-not-chief'],undefined);
  chief=true;

  distance=0;invalidPosition=true;
  context.requestOperationalStartAuthorization({id:'iv-invalid'},()=>{approved++;});
  assert.equal(approved,3,relativePath+' cannot accept invalid coordinates as a station position');
  assert.equal(typeof notices.at(-1).onDegraded,'function');

  const saved={tl:[]};
  vm.runInContext(functionSource(source,'saveOperationalStartAuthorization'),context);
  context.getH=()=> '2026-10-26 12:00';
  context.N=()=>new Date();
  context.saveOperationalStartAuthorization(saved,{degraded:true,exempt:false,actor:'chef.test',reason:'position indisponible',caserneId:'CIS05'});
  assert.equal(saved._departGeoControle.degrade,true);
  assert.equal(saved._departGeoControle.exonere,false);
  assert.match(saved.tl[0].note,/contrôle après coup requis/);
  const offsite={tl:[]};
  context.saveOperationalStartAuthorization(offsite,{offsite:true,exempt:false,actor:'chef.test',reason:'hors périmètre',caserneId:'CIS05',distanceMeters:4000,accuracyMeters:20,latitude:50.1,longitude:2.1,measuredAt:'2026-10-29T08:00:00Z'});
  assert.equal(offsite._departGeoControle.horsCaserne,true);
  assert.equal(offsite._departGeoControle.latitude,50.1);
  assert.match(offsite.tl[0].note,/Départ hors caserne à contrôler/);

  let confirmed=0,accessToken='test-token',isChief=true;
  const checkbox={checked:false,style:{}};
  const button={disabled:false,onclick:null};
  const dialog={panel:{insertBefore(){}},actions:{appendChild(){}},close(){}};
  const confirmationContext={
    CU:{l:'chef.test'},CURRENT_CASERNE_ID:'CIS05',PERSONNEL_ONLINE_GATE:true,
    isAgres:()=>isChief,isPilpIntervention:()=>false,
    canCurrentUserStartIntervention:()=>true,canUseOperationalStartDevice:()=>true,
    _agaiAuthAccessToken:()=>accessToken,_operationalStartAuthorizations:{},
    _operationalStartDegradedEligibility:{'iv-degraded':{at:Date.now(),reason:'position indisponible'},'iv-expired':{at:Date.now(),reason:'position indisponible'},'iv-unchecked':{at:Date.now(),reason:'position indisponible'}},
    showToast:()=>{},
    openOperationalStartDialog:()=>dialog,
    addOperationalStartDialogButton:(target,label,onClick)=>{
      if(label==='Confirmer le départ dégradé'){
        button.onclick=()=>{target.close();onClick();};return button;
      }
      return {disabled:false};
    },
    document:{
      createElement:tag=>tag==='input'?checkbox:{style:{},append(){},textContent:''}
    }
  };
  vm.createContext(confirmationContext);
  vm.runInContext(functionSource(source,'canCurrentUserUseDegradedStart'),confirmationContext);
  vm.runInContext(functionSource(source,'showOperationalDegradedStartConfirmation'),confirmationContext);
  confirmationContext.showOperationalDegradedStartConfirmation({id:'iv-degraded'},()=>{confirmed++;});
  assert.equal(button.disabled,true,'degraded departure requires an explicit checkbox');
  checkbox.checked=true;
  checkbox.onchange();
  assert.equal(button.disabled,false);
  button.onclick();
  assert.equal(confirmed,1);
  assert.equal(confirmationContext._operationalStartAuthorizations['iv-degraded'].degraded,true);
  assert.equal(confirmationContext._operationalStartDegradedEligibility['iv-degraded'],undefined);
  checkbox.checked=false;
  confirmationContext.showOperationalDegradedStartConfirmation({id:'iv-unchecked'},()=>{confirmed++;});
  button.onclick();
  assert.equal(confirmed,1,'unchecked attestation cannot authorize departure');
  assert.equal(confirmationContext._operationalStartAuthorizations['iv-unchecked'],undefined);
  accessToken='test-token';isChief=true;
  confirmationContext.showOperationalDegradedStartConfirmation({id:'iv-expired'},()=>{confirmed++;});
  checkbox.checked=true;checkbox.onchange();
  accessToken='';
  button.onclick();
  assert.equal(confirmed,1,'an expired session cannot confirm a pending degraded departure');
  assert.equal(confirmationContext._operationalStartAuthorizations['iv-expired'],undefined);
  accessToken='';
  assert.equal(confirmationContext.canCurrentUserUseDegradedStart({id:'iv-degraded'}),false,'expired session cannot authorize degraded departure');
  accessToken='test-token';isChief=false;
  assert.equal(confirmationContext.canCurrentUserUseDegradedStart({id:'iv-degraded'}),false,'non-chief cannot authorize degraded departure');

  let closed=0,degradedOffered=0,degradedButton=null,retryButton=null;
  const progress={style:{},_timer:1};
  const failureDialog={close(){closed++;}};
  const failureContext={
    clearTimeout:()=>{},
    openOperationalStartDialog:()=>failureDialog,
    addOperationalStartDialogButton:(target,label,onClick)=>{
      const button={textContent:label,onclick(){target.close();if(onClick)onClick();}};
      if(label==='Réessayer la position')retryButton=button;
      if(label==='Départ dégradé')degradedButton=button;
      return button;
    },
    document:{
      getElementById:id=>id==='app-toast'?progress:null
    }
  };
  vm.createContext(failureContext);
  vm.runInContext(functionSource(source,'showOperationalStartLocationFailure'),failureContext);
  failureContext.showOperationalStartLocationFailure('Position indisponible',()=>{},()=>{degradedOffered++;});
  assert.equal(progress.style.opacity,'0');
  assert.equal(retryButton.textContent,'Réessayer la position');
  assert.equal(degradedButton.textContent,'Départ dégradé');
  degradedButton.onclick();
  assert.equal(closed,1);
  assert.equal(degradedOffered,1);
}

console.log('Départ mobile : GPS visible, relance autonome et départ dégradé tracé et réservé au chef.');
