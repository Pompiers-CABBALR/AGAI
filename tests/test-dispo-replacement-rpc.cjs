const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const week='20261116';
for(const filename of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
  const start=source.indexOf('function astrReplacementStrongLead(wk){');
  const end=source.indexOf('function toggleDispoUnlock(wk){',start);
  assert.ok(start>=0&&end>start,filename);
  function setup(stage){
    const request={id:'dr_test',wk:week,caserneId:'CIS05',kind:'remplacement',
      statut:stage,login:'agent',replacementLogin:'sub',
      slots:[{key:'0_14',newVal:'false'}]};
    const originalPiquet={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'agent'};
    const ctx={
      ASTR_REPLACEMENT_ENABLED:true,USE_RECORDS:true,
      CU:{l:stage==='en-attente'?'sub':'chef-fort'},CURRENT_CASERNE_ID:'CIS05',
      PLANNING_ROTATIONS:{[week]:['eq-forte']},
      getEquipeById:id=>id==='eq-forte'?{resp:'chef-fort'}:null,
      _agaiAuthAccessToken:()=> 'token',
      _rcId:(station,type,id)=>station+'__'+type+'__'+id,RC_SEP:'__',
      _rcSaving:false,_rcPulling:false,_rcPendingDirty:new Set(),
      _rcOutboxGetRows:async()=>[],_rcPull:async()=>{ctx.pulls++;return true;},
      _agaiFetchWithTimeout:async(url,options)=>{
        ctx.calls.push({url,body:JSON.parse(options.body)});
        return {ok:true,json:async()=>ctx.rpcResult};
      },
      SB_URL:'https://example.invalid',_sbHeaders:{},
      DISPO_REQUESTS:{[week]:[request]},DISPOS:{[week]:{agent:{'0_14':true}}},
      PIQUETS:{[week]:[originalPiquet]},
      CD:()=>ctx.station,_buildDataObject:()=>({}),_writeLocalCache:()=>{ctx.cached++;},
      rAstrDispo:()=>{},rAstrPiquets:()=>{},
      showToast:(message)=>{ctx.toast=message;},
      calls:[],pulls:0,cached:0,station:{},rpcResult:null
    };
    vm.createContext(ctx);
    vm.runInContext(source.slice(start,end),ctx);
    return {ctx,request,originalPiquet};
  }
  test(filename+' : accord du remplaçant sans écriture locale des piquets',async()=>{
    const {ctx,request,originalPiquet}=setup('en-attente');
    ctx.rpcResult={...request,statut:'en-attente-responsable',confirmePar:'sub'};
    await ctx.astrRespondReplacementRequest(week,request,'accepte');
    assert.match(ctx.calls[0].url,/agai_confirm_dispo_replacement$/);
    assert.equal(ctx.calls[0].body.p_request_id,'CIS05__dispoRequest__dr_test');
    assert.equal(ctx.DISPO_REQUESTS[week][0].statut,'en-attente-responsable');
    assert.equal(ctx.PIQUETS[week][0],originalPiquet);
    assert.equal(ctx.DISPOS[week].agent['0_14'],true);
    assert.equal(ctx.pulls,1);
  });
  test(filename+' : validation du responsable applique uniquement la réponse serveur',async()=>{
    const {ctx,request}=setup('en-attente-responsable');
    const nextPiquet={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'sub'};
    ctx.rpcResult={request:{...request,statut:'accepte'},
      sourceDispo:{wk:week,login:'agent',slots:{'0_14':false,_updatedAt:42}},
      candidateDispo:{wk:week,login:'sub',slots:{'0_14':true,_updatedAt:42}},
      piquets:[nextPiquet],piquetLog:[{apresValidation:true,action:'relève'}],
      piquetRevision:1};
    await ctx.astrRespondReplacementRequest(week,request,'accepte');
    assert.match(ctx.calls[0].url,/agai_resolve_dispo_replacement$/);
    assert.equal(ctx.calls[0].body.p_expected_piquets[0].chefAgres,'agent');
    assert.equal(ctx.DISPOS[week].agent['0_14'],false);
    assert.equal(ctx.DISPOS[week].sub['0_14'],true);
    assert.equal(ctx.PIQUETS[week][0].chefAgres,'sub');
    assert.equal(ctx.PIQUETS._log[week][0].action,'relève');
    assert.equal(ctx.PIQUETS._replacementRevision,1);
    assert.equal(ctx.DISPO_REQUESTS[week][0].statut,'accepte');
    assert.equal(ctx.pulls,1);
  });
  test(filename+' : file locale ou refus serveur ne modifie pas les horaires',async()=>{
    const {ctx,request}=setup('en-attente-responsable');
    ctx._rcPendingDirty.add('CIS05__config__main');
    await ctx.astrRespondReplacementRequest(week,request,'accepte');
    assert.equal(ctx.calls.length,0);
    assert.equal(ctx.DISPOS[week].agent['0_14'],true);
    ctx._rcPendingDirty.clear();
    ctx._agaiFetchWithTimeout=async()=>({ok:false,status:400,
      text:async()=> 'AGAI_REPLACEMENT_SOURCE_CHANGED'});
    await ctx.astrRespondReplacementRequest(week,request,'accepte');
    assert.equal(ctx.DISPOS[week].agent['0_14'],true);
    assert.equal(ctx.DISPO_REQUESTS[week][0].statut,'en-attente-responsable');
    assert.equal(ctx.pulls,1);
  });
}
