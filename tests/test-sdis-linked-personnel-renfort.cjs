const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const email=read('modules/16-email-js.js');
const interventions=read('modules/08-interventions-js.js');
const stats=read('modules/14-stats-js.js');
const bundle=read('app.js');
const migration=read('supabase/migrations/20261107215000_sdis_linked_personnel_renfort.sql');

function codeOf(source,name){
  const start=source.search(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(start>=0,name+' existe');
  const body=source.indexOf('{',start);let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error(name+' incomplet');
}

test('un renfort reçoit au plus une heure réelle, y compris après minuit',()=>{
  const ctx={};vm.createContext(ctx);
  vm.runInContext(codeOf(email,'hhmmToMinutes')+codeOf(email,'sdisPersonnelRenfortWindow'),ctx);
  const source={_hAcquis:'18:16',_hOpTerminee:'19:36'};
  assert.equal(ctx.sdisPersonnelRenfortWindow(source,'18:26').minutes,60);
  assert.equal(ctx.sdisPersonnelRenfortWindow(source,'19:05').minutes,31);
  assert.equal(ctx.sdisPersonnelRenfortWindow(source,'19:36'),null);
  assert.equal(ctx.sdisPersonnelRenfortWindow(source,'18:15'),null);
  const night=ctx.sdisPersonnelRenfortWindow({_hAcquis:'23:40',_hOpTerminee:'00:30'},'00:10');
  assert.equal(night.dayOffset,1);
  assert.equal(night.minutes,20);
  assert.equal(night.hFin,'00:30');
});

test('le second rapport ne crédite jamais le chef du VPI par simple rattachement',()=>{
  const ctx={};vm.createContext(ctx);
  vm.runInContext(codeOf(interventions,'interventionMainReportCrew'),ctx);
  const report={_isSdisPersonnelRenfort:true,agr:'chef',_equipage1:[
    {login:'renfort1',role:'Renfort hors équipage'},{login:'renfort2',role:'Renfort hors équipage'}]};
  assert.deepEqual(Array.from(ctx.interventionMainReportCrew(report),m=>m.login),['renfort1','renfort2']);
  vm.runInContext(codeOf(stats,'getAgentPresenceOnIV'),ctx);
  report._sdisPersonnelRenfortMembers=[
    {login:'renfort1',hDebut:'18:26',hFin:'19:26',minutes:60},
    {login:'renfort2',hDebut:'19:05',hFin:'19:36',minutes:31}];
  assert.equal(ctx.getAgentPresenceOnIV(report,'chef').length,0);
  assert.equal(ctx.getAgentPresenceOnIV(report,'renfort1')[0].hFin,'19:26');
  assert.equal(ctx.getAgentPresenceOnIV(report,'renfort2')[0].hDebut,'19:05');
});

test('le brouillon ne crédite rien ; seul un rapport distinct validé compte pour le personnel',()=>{
  const auth=read('modules/02-auth-js-partie-1-2-structure-casernes-numerotation.js');
  const ctx={};vm.createContext(ctx);
  vm.runInContext(codeOf(auth,'isInterventionComptabilisee')+codeOf(auth,'isInterventionPersonnelComptabilisee'),ctx);
  const child={s:'terminee',_isRenfort:true,_isSdisPersonnelRenfort:true,_crValide:false};
  assert.equal(ctx.isInterventionComptabilisee(child),false);
  assert.equal(ctx.isInterventionPersonnelComptabilisee(child),false);
  child._crValide=true;
  assert.equal(ctx.isInterventionPersonnelComptabilisee(child),true);
});

test('le rapport lié utilise le barème RENF confirmé et non le barème SDIS',()=>{
  const ctx={reportTypeCode:key=>key.toUpperCase()};vm.createContext(ctx);
  vm.runInContext(codeOf(stats,'adminExportReportType'),ctx);
  assert.equal(ctx.adminExportReportType({_isSdisPersonnelRenfort:true,_isRenfort:true,_sdis:false}),'RENF');
});

test('un renfort à cheval sur deux mois répartit ses minutes par date',()=>{
  const ctx={Date,Number,String,Math,Array,adminExportInterventionStartDate:()=> '20261130'};
  vm.createContext(ctx);
  vm.runInContext(codeOf(stats,'sdisPersonnelRenfortDateKey')
    +codeOf(stats,'sdisPersonnelRenfortSegments'),ctx);
  const segments=ctx.sdisPersonnelRenfortSegments({},
    {login:'renfort1',hDebut:'23:40',minutes:60,dayOffset:0});
  assert.deepEqual(Array.from(segments,s=>[s.dateKey,s.hDebut,s.hFin,s.minutes]),[
    ['20261130','23:40','00:00',20],['20261201','00:00','00:40',40]]);
});

test('l’export mensuel sépare les deux parties du renfort sans doubler le rapport',()=>{
  const child={_isSdisPersonnelRenfort:true,_isRenfort:true,_ivSourceId:'source',
    _sdisPersonnelRenfortMembers:[{login:'renfort1',hDebut:'23:40',minutes:60,dayOffset:0}]};
  const ctx={Date,Number,String,Math,Array,IVS:[{id:'source'}],
    adminExportInterventionStartDate:()=> '20261130',
    adminExportInterventionRates:proxy=>({heures1:proxy._hDebut+'–'+proxy._hFin}),
    adminExportDateCompact:date=>date,adminExportReportType:()=> 'RENF',
    interventionDisplayUTNumber:()=> '555',interventionDisplayCallNumber:()=> '555',
    adminExportUser:value=>value,adminExportPeople:logins=>logins,
    adminExportRegisterRow:(fields,people)=>({fields,people})};
  vm.createContext(ctx);
  vm.runInContext(codeOf(stats,'sdisPersonnelRenfortDateKey')
    +codeOf(stats,'sdisPersonnelRenfortSegments')
    +codeOf(stats,'sdisPersonnelRenfortSegmentProxy')
    +codeOf(stats,'adminExportSdisPersonnelRenfortRows'),ctx);
  const nov=ctx.adminExportSdisPersonnelRenfortRows(child,{prefixCompact:'202611'},[]);
  const dec=ctx.adminExportSdisPersonnelRenfortRows(child,{prefixCompact:'202612'},[]);
  assert.equal(nov.length,1);assert.equal(dec.length,1);
  assert.equal(nov[0].fields[7],'23:40–00:00');
  assert.equal(dec[0].fields[7],'00:00–00:40');
  assert.equal(nov[0].fields[1],'555');assert.equal(dec[0].fields[1],'555');
});

test('un refus serveur ne crée ni rapport fantôme ni modification locale',async()=>{
  const iv={id:'APL_2026_000555',_sdis:true,s:'terminee',agr:'chef',_hAcquis:'18:16',
    _hOpTerminee:'19:36',_serverRevision:4};
  const row={querySelector:key=>({value:key==='[data-sdis-renfort-login]'?'renfort1':'18:26'})};
  const container={querySelectorAll:()=>[row]};
  const button={disabled:false};let writes=0,readOnlyCalls=0;
  const ctx={Set,Array,Number,JSON,Promise,Date,console,
    CU:{l:'admin'},CURRENT_CASERNE_ID:'CIS05',USE_RECORDS:true,SB_URL:'https://example.invalid',SB_KEY:'key',
    navigator:{onLine:true},document:{getElementById:id=>id==='sdis-renfort-rows'?container:button},
    interventionById:()=>iv,sdisPersonnelRenfortCanPrepare:()=>true,
    interventionReportParticipants:()=>[{login:'chef'}],
    _agaiAuthAccessToken:()=> 'token',_rcPendingCountInScope:()=>0,
    _agaiAdminStationEdgeHeaders:headers=>headers,
    _agaiAuthFetchWithTimeout:async()=>({ok:false,status:400,json:async()=>({message:'AGAI_SDIS_RENFORT_HOURS_INVALID'})}),
    _rcReplaceLocalOperationalRecord:()=>{writes++;},_writeLocalCache:()=>{writes++;},
    _buildDataObject:()=>({}),rI:()=>{readOnlyCalls++;},rAccueil:()=>{},oM:()=>{},
    showToast:()=>{},hhmmToMinutes:null};
  vm.createContext(ctx);
  vm.runInContext(codeOf(email,'hhmmToMinutes')+codeOf(email,'sdisPersonnelRenfortWindow')
    +'const _sdisPersonnelRenfortSaving=new Set();'+codeOf(email,'saveSdisPersonnelRenfortReport'),ctx);
  await ctx.saveSdisPersonnelRenfortReport(iv.id);
  assert.equal(writes,0);assert.equal(readOnlyCalls,0);assert.equal(button.disabled,false);
  ctx._agaiAuthFetchWithTimeout=async()=>({ok:true,json:async()=>({ok:true,
    source:{id:iv.id,_sdisPersonnelRenfortId:iv.id+'-RPSDIS'},
    report:{id:iv.id+'-RPSDIS',_ivSourceId:iv.id}})});
  await ctx.saveSdisPersonnelRenfortReport(iv.id);
  assert.equal(writes,3);
  assert.equal(readOnlyCalls,1);
});

test('la validation du renfort attend la confirmation serveur et garde le texte en cas de refus',async()=>{
  const child={id:'APL_2026_000555-RPSDIS',_ivSourceId:'APL_2026_000555',
    _isSdisPersonnelRenfort:true,_crValide:false,agr:'chef',_serverRevision:2};
  const source={id:'APL_2026_000555',_crValide:true};
  let writes=0,drafts=0,reopened=0;
  const ctx={Set,Date,JSON,Number,Promise,console,
    CU:{l:'admin'},CURRENT_CASERNE_ID:'CIS05',USE_RECORDS:true,SB_URL:'https://example.invalid',SB_KEY:'key',
    navigator:{onLine:true},interventionById:id=>id===child.id?child:source,
    isInterventionReportChef:()=>false,isAdminModeActive:()=>true,
    writeCompteRenduDraft:()=>{drafts++;},_agaiAuthAccessToken:()=> 'token',
    _rcPendingCountInScope:()=>0,_agaiAdminStationEdgeHeaders:headers=>headers,
    _agaiAuthFetchWithTimeout:async()=>({ok:false,status:400,json:async()=>({message:'AGAI_SDIS_RENFORT_MAIN_REPORT_REQUIRED'})}),
    _rcReplaceLocalOperationalRecord:()=>{writes++;},_writeLocalCache:()=>{writes++;},
    _buildDataObject:()=>({}),refreshOperationalInterventionViews:()=>{},rHist:()=>{},rAccueil:()=>{},
    oM:()=>{},showCompteRenduModal:()=>{reopened++;},showToast:()=>{}};
  vm.createContext(ctx);
  vm.runInContext('const _sdisPersonnelRenfortFinalizing=new Set();'
    +codeOf(email,'finalizeSdisPersonnelRenfortReport'),ctx);
  await ctx.finalizeSdisPersonnelRenfortReport(child.id,'Texte du renfort');
  assert.equal(writes,0);assert.equal(drafts,1);assert.equal(reopened,1);
  assert.equal(child._crValide,false);
  ctx._agaiAuthFetchWithTimeout=async()=>({ok:true,json:async()=>({ok:true,
    report:{id:child.id,_ivSourceId:source.id,_crValide:true,_crValidePar:'admin'}})});
  await ctx.finalizeSdisPersonnelRenfortReport(child.id,'Texte du renfort');
  assert.equal(writes,2);
  assert.equal(child._crValide,false,'la copie initiale n’est pas validée de façon optimiste');
});

test('le serveur lie atomiquement les deux fiches et conserve la validation réelle',()=>{
  assert.match(migration,/current_access\(\)/);
  assert.match(migration,/least\(60,operation_minutes-start_offset\)/);
  assert.match(migration,/source_result:=public\.agai_atomic_upsert_record/);
  assert.match(migration,/child_result:=public\.agai_atomic_upsert_record/);
  assert.match(migration,/select data into report_data from public\.records where id=report_row\.id/);
  assert.match(migration,/select data into child_data from public\.records where id=child_key/);
  assert.match(migration,/AGAI_SDIS_RENFORT_MAIN_REPORT_REQUIRED/);
  assert.match(migration,/AGAI_SDIS_RENFORT_LOCKED/);
  assert.match(migration,/finalize_sdis_linked_personnel_report/);
  assert.match(migration,/'_crAuteur',source_row\.data->>'agr'/);
  assert.match(migration,/new\.data->protected_key is distinct from old\.data->protected_key|old\.data->protected_key is distinct from new\.data->protected_key/);
  assert.match(migration,/reinforcement\.value->'equipage'/);
  assert.match(migration,/relief\.value->'nouvelEquipage'/);
  assert.match(migration,/'_crDernierEditeur',actor\.login/);
  assert.match(codeOf(email,'validerCompteRendu'),/adminRenfortValidation/);
  assert.match(codeOf(email,'validerCompteRendu'),/sous votre propre nom/);
  assert.match(codeOf(email,'showCompteRenduModal'),/mainSdisReady/);
  assert.match(email,/function sdisPersonnelRenfortSectionHTML/);
  assert.match(interventions,/sdisPersonnelRenfortSectionHTML\(iv\)/);
  assert.match(email,/Renfort de personnel hors équipage lié à l’intervention SDIS/);
});

test('le module et le fichier assemblé gardent les mêmes protections et calculs',()=>{
  for(const [source,name] of [[email,'sdisPersonnelRenfortWindow'],[email,'saveSdisPersonnelRenfortReport'],
    [email,'finalizeSdisPersonnelRenfortReport'],[email,'showCompteRenduModal'],[interventions,'interventionMainReportCrew'],
    [stats,'getAgentPresenceOnIV'],[stats,'sdisPersonnelRenfortSegments'],
    [stats,'sdisPersonnelRenfortSegmentProxy'],[stats,'adminExportSdisPersonnelRenfortRows']]){
    assert.equal(codeOf(source,name),codeOf(bundle,name),name);
  }
});
