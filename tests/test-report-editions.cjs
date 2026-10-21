const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modules/25-report-editions-js.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261021194500_report_editions_disabled.sql'),'utf8');

function setup(options={}){
  const calls=[],toasts=[];
  let confirm;
  const button={dataset:{},style:{},disabled:false,textContent:''};
  const iframe={contentWindow:{print:()=>calls.push('print')}};
  const record={id:'r1',h:'20261021_1200',s:'terminee',agr:'alice',_crValide:true};
  const context={
    window:{},navigator:{onLine:true},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},
    CU:{l:options.login||'alice'},CURRENT_CASERNE_ID:'CIS05',
    CASERNES:[{id:'CIS05',nom:'CIS 05'}],CASERNE_DATA:{CIS05:{ivs:[record],pilpIvs:[],activites:[],fmpas:[]}},
    IVS:[record],PILP_IVS:[],_rcId:(c,t,id)=>[c,t,id].join('|'),
    _agaiAuthAccessToken:()=> 'token',_agaiAuthFetchWithTimeout:async(url,req)=>{
      const body=req.body?JSON.parse(req.body):null;calls.push({url,body});
      if(url.includes('/rest/v1/records?'))return {ok:true,json:async()=>([{
        id:'CIS05|iv|r1',data:options.staleCopy?{id:'r1'}:record,
        updated_at:'2026-10-21T12:00:00Z',deleted:false
      }])};
      if(url.endsWith('agai_report_edition_state'))return {ok:true,json:async()=>({
        enabled:options.enabled??false,startDate:'2026-10-21',
        items:Object.fromEntries(body.p_ids.map(id=>[id,{count:options.count??0,updatedAt:'2026-10-21T12:00:00Z'}]))
      })};
      if(url.endsWith('agai_issue_report_edition')&&options.issueTimeout)
        throw Error('timeout after commit');
      if(url.endsWith('agai_issue_report_edition'))return {ok:true,json:async()=>({
        number:(options.count??0)+1,kind:(options.count??0)?'duplicata':'original',
        issuedAt:'2026-10-21T12:01:00Z'
      })};
      throw Error('unexpected RPC');
    },
    SB_URL:'https://example.invalid',SB_KEY:'publishable',
    voirRapportIntervention:id=>calls.push('legacy:'+id),
    actImprimerRapport:id=>calls.push('activity:'+id),
    fmpaImprimerRapport:id=>calls.push('fmpa:'+id),
    openIframeModal:(html,id)=>calls.push({html,id}),
    _onIframePrint:()=>calls.push('legacy-print'),
    interventionById:id=>id==='r1'?record:null,
    actGetData:()=>[],fmpaGetData:()=>[],
    isPilpIntervention:()=>false,accueilRapportOwner:(row,login)=>row.agr===login,
    accueilRapportDate:row=>row.h.slice(0,8),
    rapportsEditionDebut:()=>'',rAccueilRapports:()=>{},
    canOpenInterventionPdfOnThisDevice:()=>true,
    isAdminModeActive:()=>options.admin===true,isSuperAdmin:()=>false,
    genRapportInterventionHTML:()=>'<html><body><button onclick="window.print()">Imprimer</button><div>@page Rapport</div></body></html>',
    genRapportActiviteHTML:()=>'',genRapportFmpaHTML:()=>'',
    document:{getElementById:id=>id==='iframe-print-btn'?button:id==='iframe-content'?iframe:null},
    confirmModal:(_message,callback)=>{confirm=callback;},showToast:(message)=>toasts.push(message),
    saveData:()=>calls.push('save'),reportEditionScheduleHomeStatus:()=>{},
    escHtml:value=>String(value),console
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return {context,calls,toasts,button,record,confirm:()=>confirm};
}

test('désactivé : aucune émission et ancien parcours conservé',async()=>{
  const env=setup({enabled:false});
  await env.context.voirRapportIntervention('r1');
  assert.ok(env.calls.includes('legacy:r1'));
  assert.equal(env.calls.filter(x=>x.url?.endsWith('agai_issue_report_edition')).length,0);
});
test('activé : émission unique avant ouverture, puis un seul bouton d’impression',async()=>{
  const env=setup({enabled:true});
  await env.context.voirRapportIntervention('r1');
  assert.equal(env.calls.filter(x=>x.url?.endsWith('agai_issue_report_edition')).length,0);
  assert.equal(typeof env.confirm(),'function');
  await env.confirm()();
  assert.equal(env.calls.filter(x=>x.url?.endsWith('agai_issue_report_edition')).length,1);
  assert.equal(env.button.dataset.reportEditionType,'iv');
  env.context._onIframePrint();
  env.context._onIframePrint();
  assert.equal(env.calls.filter(x=>x==='print').length,1);
});
test('un second tirage refuse un agent ordinaire',async()=>{
  const env=setup({enabled:true,count:1});
  await env.context.voirRapportIntervention('r1');
  assert.equal(env.confirm(),undefined);
  assert.ok(env.toasts.some(x=>/pouvoirs administrateur/.test(x)));
  assert.equal(env.calls.filter(x=>x.url?.endsWith('agai_issue_report_edition')).length,0);
});
test('une copie locale différente du serveur ne consomme pas l’original',async()=>{
  const env=setup({enabled:true,staleCopy:true});
  await env.context.voirRapportIntervention('r1');
  assert.equal(env.confirm(),undefined);
  assert.ok(env.toasts.some(x=>/fiche locale ne correspond pas/.test(x)));
  assert.equal(env.calls.filter(x=>x.url?.endsWith('agai_issue_report_edition')).length,0);
});
test('un duplicata nécessite les pouvoirs admin et le serveur',async()=>{
  const env=setup({enabled:true,count:1,admin:true});
  await env.context.voirRapportIntervention('r1');
  await env.confirm()();
  assert.equal(env.calls.filter(x=>x.url?.endsWith('agai_issue_report_edition')).length,1);
  assert.match(env.button.textContent,/duplicata/);
});
test('réponse perdue après émission : ne jamais affirmer que rien n’a été émis',async()=>{
  const env=setup({enabled:true,issueTimeout:true});
  await env.context.voirRapportIntervention('r1');
  await env.confirm()();
  assert.ok(env.toasts.some(x=>/peut-être été enregistrée/.test(x)));
  assert.ok(env.toasts.some(x=>/Ne réessayez pas/.test(x)));
  assert.equal(env.calls.filter(x=>x.url?.endsWith('agai_issue_report_edition')).length,1);
});
test('le registre démarre désactivé et contrôle identité, caserne et concurrence',()=>{
  assert.match(sql,/values\(true,false\) on conflict/);
  assert.match(sql,/actor\.app_role<>'superadmin'/);
  assert.match(sql,/actor\.app_role not in \('administrateur_caserne','superadmin'\)/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/issue_count<>p_expected_count/);
  assert.match(sql,/report_row\.updated_at is distinct from p_expected_updated_at/);
  assert.match(sql,/revoke execute on function public\.agai_issue_report_edition/);
  assert.match(sql,/enable row level security/g);
});
