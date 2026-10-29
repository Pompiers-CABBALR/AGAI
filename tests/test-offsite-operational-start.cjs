const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');

const root=path.join(__dirname,'..');
const moduleStart=fs.readFileSync(path.join(root,'modules/08-interventions-js.js'),'utf8');
const moduleHome=fs.readFileSync(path.join(root,'modules/06-ui-js-accueil-js.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
function sourceOf(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' absent');
  const body=source.indexOf('{',start);
  let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error('Fonction incomplète : '+name);
}

test('la preuve GPS hors caserne exige une position précise et récente',()=>{
  const context={Date,Number,Math};
  vm.createContext(context);
  vm.runInContext('const OPERATIONAL_START_STATION_PROXIMITY_METERS=500; const OPERATIONAL_START_OFFSITE_MAX_ACCURACY_METERS=250;',context);
  vm.runInContext(sourceOf(moduleStart,'operationalStartOffsiteEvidence'),context);
  const fresh={timestamp:Date.now()-1000,coords:{latitude:50.5,longitude:2.5}};
  assert.equal(context.operationalStartOffsiteEvidence(fresh,5000,30),true);
  assert.equal(context.operationalStartOffsiteEvidence({...fresh,timestamp:Date.now()-60000},5000,30),false);
  assert.equal(context.operationalStartOffsiteEvidence(fresh,5000,800),false);
  assert.equal(context.operationalStartOffsiteEvidence(fresh,1100,50),true,'un garage proche mais hors caserne est signalé');
  assert.equal(context.operationalStartOffsiteEvidence(fresh,600,150),false);
  assert.equal(context.operationalStartOffsiteEvidence({...fresh,coords:{latitude:NaN,longitude:2.5}},5000,30),false);
});

test('une précision kilométrique ne prouve plus une présence à la caserne',()=>{
  const context={Number,Math};
  vm.createContext(context);
  vm.runInContext('const OPERATIONAL_START_RADIUS_METERS=2000; const OPERATIONAL_START_MAX_GPS_UNCERTAINTY_METERS=500;',context);
  vm.runInContext(sourceOf(moduleStart,'operationalStartPositionAccepted'),context);
  assert.equal(context.operationalStartPositionAccepted(1900,1500),true,'un point central dans la caserne reste accepté');
  assert.equal(context.operationalStartPositionAccepted(2600,300),false,'une mesure précise hors rayon reste refusée');
  assert.equal(context.operationalStartPositionAccepted(4500,4000),false,'une très forte incertitude ne vaut plus preuve de présence');
});

test('seuls les comptes administratifs voient les départs hors caserne récents',()=>{
  const element={style:{display:'none'},innerHTML:''};
  let admin=false;
  const context={
    document:{getElementById:id=>id==='acc-offsite-departures'?element:null},
    hasAdministrativeAccount:()=>admin,
    getH:date=>date.toISOString().replace(/[-:TZ.]/g,'').slice(0,12),
    IVS:[{id:'iv1',n:'Départ garage',_departGeoControle:{horsCaserne:true,date:'999999999999',distanceMetres:4200}}],
    PILP_IVS:[],Set,Date,String,
    escHtml:value=>String(value).replaceAll('<','&lt;'),
    interventionDisplayCallNumber:()=> 'APL_1'
  };
  vm.createContext(context);
  vm.runInContext(sourceOf(moduleHome,'rAccueilDepartsHorsCaserne'),context);
  context.rAccueilDepartsHorsCaserne();
  assert.equal(element.style.display,'none');
  assert.equal(element.innerHTML,'');
  admin=true;
  context.rAccueilDepartsHorsCaserne();
  assert.equal(element.style.display,'block');
  assert.match(element.innerHTML,/Départs pris hors caserne/);
  assert.match(element.innerHTML,/Départ garage/);
});

test('les fonctions du départ hors caserne restent identiques dans les deux points d’entrée',()=>{
  for(const name of ['operationalStartOffsiteEvidence','requestOperationalStartAuthorization','saveOperationalStartAuthorization','hasAdministrativeAccount']){
    assert.equal(sourceOf(moduleStart,name),sourceOf(bundle,name),name);
  }
  assert.equal(sourceOf(moduleHome,'rAccueilDepartsHorsCaserne'),sourceOf(bundle,'rAccueilDepartsHorsCaserne'));
  assert.match(moduleStart,/hasAdministrativeAccount\(\)&&iv\._departGeoControle&&iv\._departGeoControle\.horsCaserne===true/);
});
