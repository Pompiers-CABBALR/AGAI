const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('correction validée : aucun changement local avant la confirmation du serveur',async()=>{
  const source=read('modules/12-astreintes-js.js');
  const start=source.indexOf('function piquetTeamCorrectionRequired(wk){');
  const end=source.indexOf('function confirmEditPiquet(wk,globalIdx){',start);
  assert.ok(start>=0&&end>start);
  const original={engin:'VTU-01',jour:'Lundi',debut:'07:00',fin:'12:00'};
  const next={...original,fin:'11:00'};
  let answer,requests=0,closed=0;
  const data={piquets:{week:[original]}};
  const context={
    PIQUETS_VALIDATED:{week:true},PIQUETS:data.piquets,
    isRespEquipe:()=>true,isAdminModeActive:()=>false,getWeekOffset:()=>0,
    USE_RECORDS:true,PERSONNEL_ONLINE_GATE:true,
    _agaiAuthAccessToken:()=> 'test',CURRENT_CASERNE_ID:'TEST',
    _rcId:()=> 'TEST__config__main',_rcSaving:false,_rcPulling:false,
    _rcPendingDirty:new Set(),_rcOutboxGetRows:async()=>[],
    document:{getElementById:()=>({value:'Disponibilité du conducteur modifiée'})},
    SB_URL:'http://localhost',_sbHeaders:{},
    _agaiFetchWithTimeout:async()=>{requests++;return await new Promise(resolve=>{answer=resolve;});},
    CD:()=>data,cM:()=>{closed++;},rAstrPiquets:()=>{},
    _rcRequestRealtimePull:()=>{},showToast:()=>{}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const pending=context.correctValidatedPiquet('week','modification',0,next);
  for(let n=0;n<8&&!answer;n++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(requests,1);
  assert.equal(data.piquets.week[0].fin,'12:00');
  assert.equal(closed,0);
  answer({ok:true,json:async()=>({piquets:[next],log:[],revision:1})});
  assert.equal(await pending,true);
  assert.equal(data.piquets.week[0].fin,'11:00');
  assert.equal(closed,1);
  context.getWeekOffset=()=>-1;
  assert.equal(await context.correctValidatedPiquet('week','modification',0,original),false);
  assert.equal(requests,1);
});

test('accueil : la case Lu envoie seulement la signature de la demande affichée',async()=>{
  const source=read('modules/06-ui-js-accueil-js.js');
  const start=source.indexOf('const _accDispoNoticeState=');
  const end=source.indexOf('function rAccueilDepartsHorsCaserne(){',start);
  assert.ok(start>=0&&end>start);
  const panel={innerHTML:''};
  const calls=[];
  const context={
    CU:{l:'lead'},CURRENT_CASERNE_ID:'TEST',USERS:[{l:'agent',nom:'Agent',prenom:'A'}],
    isRespEquipe:()=>true,_agaiAuthAccessToken:()=> 'test',
    document:{getElementById:()=>panel},
    fullName:()=> 'Agent A',escHtml:s=>String(s),
    SB_URL:'http://localhost',_sbHeaders:{},
    _agaiFetchWithTimeout:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      if(url.endsWith('agai_dispo_request_notices'))return {ok:true,json:async()=>[{
        recordId:'TEST__dispoRequest__dr1',week:'20261116',login:'agent',
        kind:'ajout',statut:'en-attente',signature:'sig1',readAt:null
      }]};
      return {ok:true,json:async()=>({signature:'sig1',readAt:'2026-11-17T12:00:00Z'})};
    },showToast:()=>{},console
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  await context.rAccueilDispoNotices();
  assert.match(panel.innerHTML,/type="checkbox"/);
  assert.match(panel.innerHTML,/Agent A/);
  await context.markAccueilDispoNoticeRead(0);
  assert.equal(calls[1].body.p_request_id,'TEST__dispoRequest__dr1');
  assert.equal(calls[1].body.p_signature,'sig1');
  assert.equal(panel.innerHTML,'');
});
