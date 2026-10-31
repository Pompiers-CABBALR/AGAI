const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');

const root=path.resolve(__dirname,'..');
const astreintes=fs.readFileSync(path.join(root,'modules/12-astreintes-js.js'),'utf8');
const interventions=fs.readFileSync(path.join(root,'modules/08-interventions-js.js'),'utf8');
const superadmin=fs.readFileSync(path.join(root,'modules/05-admin-js-partie-1-2-vues-globales-superadmin.js'),'utf8');

function sourceBetween(source,start,end){
  const first=source.indexOf(start),last=source.indexOf(end,first);
  assert.ok(first>=0&&last>first,start+' present');
  return source.slice(first,last);
}
const rightsSource=sourceBetween(interventions,'function canAdministrativelyClosePastIntervention(){','function canUseOperationalStartInterface(){');
const creationSource=sourceBetween(astreintes,'const _historicalSdisCreationId=', 'function showSuperAdminDirectClosureModal(');
const closureSource=sourceBetween(astreintes,'async function confirmerClotureSuperAdminDirecte(', 'function showOperationalDepartureFormError(');

test('le superadmin choisit par caserne, fermé par défaut et inaccessible à un agent',()=>{
  const context={CASERNES:[{id:'CIS05',nom:'CIS05'}],CURRENT_CASERNE_ID:'CIS05',CU:{l:'admin',appRole:'administrateur_caserne'},
    isAdminModeActive:()=>true,canSuperAdminOperateForAnotherChief:()=>false};
  vm.createContext(context);vm.runInContext(rightsSource,context);
  assert.equal(context.canAdministrativelyClosePastIntervention(),false);
  context.CASERNES[0].retroactiveInterventionsEnabled=true;
  assert.equal(context.canAdministrativelyClosePastIntervention(),true);
  context.CU.appRole='agent';
  assert.equal(context.canAdministrativelyClosePastIntervention(),false);
  context.canSuperAdminOperateForAnotherChief=()=>true;
  assert.equal(context.canAdministrativelyClosePastIntervention(),true);
  assert.match(superadmin,/function setCaserneRetroactiveInterventions\(/);
  assert.match(superadmin,/if\(!isSuperAdmin\(\)\)/);
});

function harness(overrides={}){
  const now=new Date(2026,9,31,12,0),messages=[],records=[],allocations=[],data={ivs:records};
  const context={
    Date,CU:{l:'admin',appRole:'administrateur_caserne'},CURRENT_CASERNE_ID:'CIS05',USERS:[{l:'chef'}],IVS:records,PILP_IVS:[],
    canAdministrativelyClosePastIntervention:()=>true,interventionById:id=>records.find(iv=>iv.id===id)||null,
    operationalActionInProgress:()=>false,showToast:message=>messages.push(message),cM:()=>{},
    isChefAgresByGrade:()=>true,interventionCompactStampMillis:stamp=>{const d=String(stamp).replace(/\D/g,'');return new Date(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6,8),+d.slice(8,10),+d.slice(10,12)).getTime();},
    findManualOperationalIntervalConflict:()=>null,findPersonnelScheduleConflict:()=>null,
    interventionRoleKey:role=>role,allocateNewApl:async(purpose,context)=>{allocations.push({purpose,context});return {apl:'APL_2026_999999',actionKey:'key'};},
    makeInterventionRecordId:()=> 'iv-new',mkTL:(s,h,who)=>({s,h,who}),getH:()=> '20261031_1200',N:()=>now,CD:()=>data,
    clearAplCreationActionKey:()=>{},beginOperationalAction:()=>true,pushTL:(iv,s,who,note,h)=>iv.tl.push({s,who,note,h}),
    getEnginRoles:()=>[],assignInterventionNumbersAtStart:()=>{},syncInternalReinforcementSource:()=>{},
    markOperationalInterventionDirty:()=>{},manualOperationalTimelineStamp:(iv,time,isEnd)=>(isEnd?iv._dateFin:iv._dateDebut)+'_'+time.replace(':',''),
    clot:id=>{records.find(iv=>iv.id===id).s='terminee';},window:{setTimeout:()=>{}},document:{getElementById:()=>null},
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(creationSource+closureSource,context);
  const captured={stationId:'CIS05',actor:'admin',chief:'chef',operationalDate:'20261023',returnDate:'20261023',time:'14:00',endTime:'21:00',
    vehicle:'VTU-01',crew:[{role:'conducteur',login:'agent'}],
    call:{nature:'PCA — tempête',number:'SDIS-123',address:'Garage',commune:'Auchel',callDate:'20261023',callTime:'13:30',reason:'Appel reçu au PCA'}};
  return {context,captured,messages,records,allocations};
}

test('une intervention SDIS absente est créée et clôturée avec ses dates réelles et son audit',async()=>{
  const {context,captured,records,allocations}=harness();
  await context.confirmerClotureSuperAdminDirecte('__historical_sdis__',captured);
  assert.equal(records.length,1);
  assert.equal(records[0].s,'terminee');
  assert.equal(records[0].h,'20261023_1330');
  assert.equal(records[0]._dateDebut,'20261023');
  assert.equal(records[0]._numSDIS,'SDIS-123');
  assert.equal(records[0]._historicalEntry.createdBy,'admin');
  assert.equal(records[0]._historicalEntry.reason,'Appel reçu au PCA');
  assert.equal(allocations.length,1);
  assert.equal(allocations[0].purpose,'appel');
});

test('un numéro SDIS doublon et une autorisation retirée ne créent aucune fiche',async()=>{
  const duplicate=harness();
  duplicate.records.push({_sdis:true,_numSDIS:'SDIS-123',h:'20261020_1000'});
  await duplicate.context.confirmerClotureSuperAdminDirecte('__historical_sdis__',duplicate.captured);
  assert.equal(duplicate.records.length,1);
  assert.match(duplicate.messages.join(' '),/existe déjà/);
  const revoked=harness({canAdministrativelyClosePastIntervention:()=>false});
  await revoked.context.confirmerClotureSuperAdminDirecte('__historical_sdis__',revoked.captured);
  assert.equal(revoked.records.length,0);
});

test('un appel après le départ et une clôture échouée ne laissent aucune fiche',async()=>{
  const reversed=harness();
  reversed.captured.call.callTime='15:00';
  await reversed.context.confirmerClotureSuperAdminDirecte('__historical_sdis__',reversed.captured);
  assert.equal(reversed.records.length,0);
  assert.match(reversed.messages.join(' '),/précéder le départ/);
  const failed=harness({clot:()=>{throw new Error('Clôture indisponible');}});
  await failed.context.confirmerClotureSuperAdminDirecte('__historical_sdis__',failed.captured);
  assert.equal(failed.records.length,0);
  assert.match(failed.messages.join(' '),/Clôture indisponible/);
});
