const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const pilp=read('modules/09-pilp-js.js');
const bundle=read('app.js');
const appel=read('modules/07-appel-js.js');
const accueil=read('modules/06-ui-js-accueil-js.js');
const intervention=read('modules/08-interventions-js.js');
const migration=read('supabase/migrations/20261102163153_requalify_pending_asian_hornet_as_pilp.sql');
function sourceOf(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' absent');
  const declarationStart=source.slice(start-6,start)==='async '?start-6:start;
  const body=source.indexOf('{',start);let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(declarationStart,i+1);
  }
  throw Error(name+' incomplet');
}
function contextForAction(response){
  const iv={id:'APL_2026_000641-Rabc',_numApl:'APL_2026_000641',
    n:'Nid de frelons asiatiques',s:'en-attente',op:'appel.operateur',_serverRevision:3,
    _nidsAppel:[{hauteur:'8 m'}]};
  const fields={'pilp-requal-height':{value:'8'},'pilp-requal-send':{disabled:false}};
  const calls=[],toasts=[];
  const context={
    IVS:[iv],PILP_IVS:[],USERS:[{l:'appel.operateur',nom:'Opérateur',prenom:'Appel'}],
    CU:{l:'admin.test'},CURRENT_CASERNE_ID:'CIS05',USE_RECORDS:true,
    navigator:{onLine:true},SB_URL:'https://example.supabase.co',SB_KEY:'test',
    document:{getElementById:id=>fields[id]||null},
    isAdminModeActive:()=>true,
    pilpHeightNumber:value=>Number(String(value).replace(/\s*m$/,'')),
    _agaiAuthAccessToken:()=> 'token',_rcPendingCountInScope:()=>0,
    _rcId:(station,type,id)=>station+'__'+type+'__'+id,
    aplCreationActionKey:()=> '11111111-1111-4111-8111-111111111111',
    clearAplCreationActionKey:()=>calls.push('clear-key'),
    _agaiAuthFetchWithTimeout:async(url,options)=>{calls.push({url,options});return response;},
    _rcPull:async()=>{context.PILP_IVS.push({id:'PILP-APL_2026_000641-Rabc'});return true;},
    cM:()=>calls.push('close'),openAccueilInterventionFilter:(scope,status)=>calls.push([scope,status]),
    showToast:(message,level)=>toasts.push([message,level]),
    escHtml:value=>String(value),fullName:user=>user.prenom+' '+user.nom,
    interventionDisplayCallNumber:row=>row._numApl,
    pilpHeightInputValue:()=> '8'
  };
  vm.createContext(context);
  vm.runInContext('const _pendingPilpRequalificationInFlight=new Set();',context);
  for(const name of ['showPendingPilpRequalification','confirmPendingPilpRequalification'])
    vm.runInContext(sourceOf(pilp,name),context);
  return {context,iv,fields,calls,toasts};
}

test('l’appel direct garde l’opérateur et sépare hauteur déclarée et reconnaissance',()=>{
  assert.match(accueil,/label==='Nid de frelons asiatiques'\?'':'none'/);
  assert.match(appel,/op:CU\.l,localisation:primaryNid\.localisation\|\|null/);
  assert.match(appel,/reconnaissanceFaite:false/);
  assert.match(appel,/'Hauteur déclarée':Number\.isFinite\(primaryHeight\)/);
  assert.match(appel,/if\(document\.getElementById\('chk-pilp-direct'\)\?\.checked/);
  assert.match(pilp,/function pilpReconnaissanceAConfirmer\(iv\)\{return !!\(iv&&iv\.reconnaissanceFaite==null&&!iv\.ivRef\);\}/);
});

test('seul un admin voit la requalification sur un appel asiatique en attente',()=>{
  assert.match(intervention,/iv\.s==='en-attente'&&!pilpScope&&!iv\._isRenfort&&!iv\._sdis&&!iv\._lienPilp&&!iv\._pilpId&&!iv\._isPilip/);
  assert.match(intervention,/iv\.n==='Nid de frelons asiatiques'&&isAdminModeActive\(\)/);
  assert.match(intervention,/showPendingPilpRequalification/);
});

test('la confirmation demande au serveur une requalification sans changer localement la fiche avant succès',async()=>{
  const env=contextForAction({ok:true,json:async()=>({ok:true,pilpId:'PILP-APL_2026_000641-Rabc'})});
  const work=env.context.confirmPendingPilpRequalification(env.iv.id);
  assert.equal(env.iv.s,'en-attente');
  await work;
  const payload=JSON.parse(env.calls[0].options.body);
  assert.equal(payload.p_source_record_id,'CIS05__iv__APL_2026_000641-Rabc');
  assert.equal(payload.p_operator_login,'appel.operateur');
  assert.equal(payload.p_declared_height,8);
  assert.equal(payload.p_expected_record_revision,3);
  assert.deepEqual(env.calls.at(-1),['pilp','en-attente']);
  assert.equal(env.toasts.at(-1)[1],'success');
});

test('un refus du serveur conserve la fiche normale en attente',async()=>{
  const env=contextForAction({ok:false,status:409,json:async()=>({message:'AGAI_PILP_REQUAL_STALE_SOURCE'})});
  await env.context.confirmPendingPilpRequalification(env.iv.id);
  assert.equal(env.iv.s,'en-attente');
  assert.equal(env.context.PILP_IVS.length,0);
  assert.match(env.toasts.at(-1)[0],/fiche a changé/);
});

test('la migration réserve la requalification aux admins et conserve l’APL en une transaction',()=>{
  assert.match(migration,/actor\.app_role not in \('superadmin','administrateur_caserne'\)/);
  assert.match(migration,/source_row\.data->>'s' is distinct from 'en-attente'/);
  assert.match(migration,/source_row\.data->>'op'<>operator_login/);
  assert.match(migration,/pilp_id:='PILP-'\|\|\(source_row\.data->>'id'\)/);
  assert.match(migration,/'_numApl',source_row\.data->>'_numApl'/);
  assert.match(migration,/'ivRef',source_row\.data->>'id'/);
  assert.match(migration,/'_pilpId',pilp_id/);
  assert.match(migration,/'reconnaissanceFaite',false/);
  assert.match(migration,/'_isPilip',true/);
  assert.equal((migration.match(/perform public\.agai_atomic_upsert_record\(/g)||[]).length,2);
  assert.match(migration,/grant execute on function public\.agai_requalify_pending_pilp[\s\S]+to authenticated;/);
});

test('module et bundle gardent les mêmes fonctions de requalification',()=>{
  for(const name of ['showPendingPilpRequalification','confirmPendingPilpRequalification'])
    assert.equal(sourceOf(pilp,name),sourceOf(bundle,name),name);
  assert.equal(sourceOf(accueil,'sN'),sourceOf(bundle,'sN'));
  assert.ok(sourceOf(bundle,'oM').includes('requalPilpHtml'));
});
