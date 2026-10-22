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
  const banner={style:{},innerHTML:''};
  const monitor={innerHTML:'',textContent:'',insertAdjacentHTML(_position,html){this.innerHTML=html+this.innerHTML;}};
  const modalTitle={textContent:''},modalInfo={textContent:''},modalBody={innerHTML:'',textContent:''};
  const record={id:'r1',h:'20261021_1200',s:'terminee',agr:'alice',_crValide:true};
  const context={
    window:{},navigator:{onLine:true},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},
    CU:{l:options.login||'alice'},CURRENT_CASERNE_ID:'CIS05',
    CASERNES:[{id:'CIS05',nom:'CIS 05'}],CASERNE_DATA:{CIS05:{ivs:[record],pilpIvs:[],activites:[],fmpas:[]}},
    USERS:[],rapportsFinalisationDebut:()=> '20261001',
    IVS:[record],PILP_IVS:[],_rcId:(c,t,id)=>[c,t,id].join('|'),
    _agaiAuthAccessToken:()=> 'token',_agaiAuthFetchWithTimeout:async(url,req)=>{
      const body=req.body?JSON.parse(req.body):null;calls.push({url,body});
      if(url.includes('/rest/v1/records?')){
        const requested=decodeURIComponent((url.match(/id=eq\.([^&]+)/)||[])[1]||'');
        const [station,type,id]=requested.split('|');
        const data=(context.CASERNE_DATA[station]||{})[type==='pilp'?'pilpIvs':'ivs']||[];
        const found=data.find(item=>item.id===id);
        return {ok:true,json:async()=>(found?[{
          id:requested,caserne:station,type,data:options.staleCopy?{id}:found,
          updated_at:'2026-10-21T12:00:00Z',deleted:false
        }]:[])};
      }
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
      if(url.endsWith('agai_admin_finalize_report'))return {ok:true,json:async()=>({
        data:{id:'r1',_crValide:true,_crValidePar:'alice',_serverRevision:2}
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
    accueilRapportNumero:row=>row._numCaserne?'UT '+row._numCaserne+' · '+(row._numApl||''):(row._numApl||''),
    accueilRapportDate:row=>row.h.slice(0,8),
    rapportsEditionDebut:()=>'',rAccueilRapports:()=>{},
    canOpenInterventionPdfOnThisDevice:()=>true,
    isAdminModeActive:()=>options.admin===true,isSuperAdmin:()=>options.superadmin===true,
    compteRenduLate:()=>options.late===true,compteRenduDeadline:()=> '2026-11-05',
    _rcPendingDirty:new Set(),_rcReplaceLocalOperationalRecord:(...args)=>calls.push(['replace',...args]),
    _writeLocalCache:()=>calls.push('cache'),_buildDataObject:()=>({}),
    refreshOperationalInterventionViews:()=>{},
    genRapportInterventionHTML:()=>'<html><body><button onclick="window.print()">Imprimer</button><div>@page Rapport</div></body></html>',
    genRapportActiviteHTML:()=>'',genRapportFmpaHTML:()=>'',
    document:{getElementById:id=>id==='iframe-print-btn'?button:id==='iframe-content'?iframe
      :id==='acc-admin-report-summary'?banner:id==='home-report-monitor'?monitor
      :id==='mt'?modalTitle:id==='mi'?modalInfo:id==='mb'?modalBody:null},
    confirmModal:(_message,callback)=>{confirm=callback;},showToast:(message)=>toasts.push(message),
    showCompteRenduModal:id=>calls.push('report:'+id),openModalAtTop:()=>calls.push('preview'),
    saveData:()=>calls.push('save'),reportEditionScheduleHomeStatus:()=>{},
    escHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;'),console
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return {context,calls,toasts,button,banner,monitor,modalTitle,modalInfo,modalBody,record,confirm:()=>confirm};
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
test('le bandeau admin montre les non-validés et le détail les regroupe par responsable',()=>{
  const env=setup({admin:true});
  env.record._crValide=false;
  env.context.renderHomeAdminReportBanner();
  assert.match(env.banner.innerHTML,/1 non validé/);
  env.context.renderReportAdminMonitor('admin');
  assert.match(env.monitor.innerHTML,/Comptes rendus non validés · 1/);
  assert.match(env.monitor.innerHTML,/alice · 1/);
  assert.equal(env.banner.style.display,'');
});
test('le suivi admin affiche aussi le numéro de l’intervention et sa nature',()=>{
  const env=setup({admin:true});
  env.record._crValide=false;
  env.record._numApl='APL_2026_000588';
  env.record._numCaserne=494;
  env.record.n='Sauvetage et capture d’animaux';
  env.record.com='Marles-les-Mines';
  env.context.renderReportAdminMonitor('admin');
  assert.match(env.monitor.innerHTML,/Intervention · UT 494 · APL_2026_000588 · Sauvetage et capture d’animaux — Marles-les-Mines/);
});
test('le suivi admin lit la fiche serveur avant de permettre la validation',async()=>{
  const env=setup({admin:true});
  env.record._crValide=false;
  env.context.renderReportAdminMonitor('admin');
  assert.match(env.monitor.innerHTML,/data-stage="finaliser"[^>]*openReportAdminMonitorItem/);
  await env.context.openReportAdminMonitorItem({dataset:{station:'CIS05',type:'iv',id:'r1',stage:'finaliser'}});
  assert.ok(env.calls.some(call=>call.url?.includes('/rest/v1/records?')));
  assert.match(env.modalBody.innerHTML,/admin-cr-text/);
  assert.match(env.modalBody.innerHTML,/Valider le rapport avec traçabilité/);
});
test('un rapport d’autrui est modifiable par l’admin, sans texte HTML actif',async()=>{
  const env=setup({admin:true});
  env.record._crValide=false;
  env.record.agr='bob';
  env.record._crTexte='<img src=x onerror=alert(1)>Rapport';
  await env.context.openReportAdminMonitorItem({dataset:{station:'CIS05',type:'iv',id:'r1',stage:'finaliser'}});
  assert.match(env.modalBody.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;Rapport/);
  assert.doesNotMatch(env.modalBody.innerHTML,/<img/);
  assert.match(env.modalBody.innerHTML,/Valider le rapport avec traçabilité/);
  assert.equal(env.modalTitle.textContent,'Finaliser un compte rendu');
});
test('le superadmin peut finaliser un rapport d’une autre caserne sans changer de caserne',async()=>{
  const env=setup({superadmin:true});
  env.context.CASERNES.push({id:'CIS06',nom:'CIS 06'});
  env.context.CASERNE_DATA.CIS06={ivs:[{id:'r2',h:'20261021_1300',s:'terminee',agr:'bob',_crTexte:'Rapport CIS06'}],
    pilpIvs:[],activites:[],fmpas:[]};
  await env.context.openReportAdminMonitorItem({dataset:{station:'CIS06',type:'iv',id:'r2',stage:'finaliser'}});
  assert.equal(env.context.CURRENT_CASERNE_ID,'CIS05');
  assert.match(env.modalBody.innerHTML,/Rapport CIS06/);
});
test('après le 5, l’admin voit le blocage et le superadmin voit le motif obligatoire',async()=>{
  const admin=setup({admin:true,late:true});admin.record._crValide=false;
  await admin.context.openReportAdminMonitorItem({dataset:{station:'CIS05',type:'iv',id:'r1',stage:'finaliser'}});
  assert.doesNotMatch(admin.modalBody.innerHTML,/id="admin-cr-finalize"/);
  const superadmin=setup({superadmin:true,late:true});superadmin.record._crValide=false;
  await superadmin.context.openReportAdminMonitorItem({dataset:{station:'CIS05',type:'iv',id:'r1',stage:'finaliser'}});
  assert.match(superadmin.modalBody.innerHTML,/id="admin-cr-override"/);
  assert.match(superadmin.modalBody.innerHTML,/id="admin-cr-finalize"/);
});
test('la finalisation admin est confirmée par le serveur et la copie locale remplacée',async()=>{
  const env=setup({admin:true});env.record._crValide=false;
  await env.context.submitReportAdminFinalization({recordId:'CIS05|iv|r1',station:'CIS05',type:'iv',label:'Rapport'},'Texte final',1,null);
  assert.ok(env.calls.some(call=>call.url?.endsWith('agai_admin_finalize_report')
    &&call.body.p_text==='Texte final'&&call.body.p_expected_record_revision===1));
  assert.ok(env.calls.some(call=>Array.isArray(call)&&call[0]==='replace'));
  assert.match(env.modalBody.innerHTML,/Rapport validé sur le serveur/);
});
test('les pouvoirs désactivés ou un rappel périmé ne permettent plus l’ouverture',()=>{
  const options={admin:true},env=setup(options);
  env.record._crValide=false;
  const item={dataset:{station:'CIS05',type:'iv',id:'r1',stage:'finaliser'}};
  options.admin=false;
  env.context.openReportAdminMonitorItem(item);
  assert.equal(env.calls.length,0);
  options.admin=true;
  env.record._crValide=true;
  env.context.openReportAdminMonitorItem(item);
  assert.equal(env.calls.length,0);
});
test('un original à éditer ouvre seulement un aperçu, sans déclencher son émission',()=>{
  const env=setup({admin:true});
  env.context.window._agaiReportEditionState={enabled:true,startDate:'2026-10-21',
    items:{'CIS05|iv|r1':{count:0}}};
  vm.runInContext("_reportAdminSummaryState={login:'alice',station:'CIS05',scope:'admin',state:window._agaiReportEditionState}",env.context);
  env.context.renderReportAdminMonitor('admin');
  assert.match(env.monitor.innerHTML,/data-stage="editer"[^>]*openReportAdminMonitorItem/);
  env.context.openReportAdminMonitorItem({dataset:{station:'CIS05',type:'iv',id:'r1',stage:'editer'}});
  assert.deepEqual(env.calls,['preview']);
  assert.equal(env.modalTitle.textContent,'Rapport à éditer');
  assert.equal(env.calls.filter(x=>x.url?.endsWith('agai_issue_report_edition')).length,0);
});
test('le bandeau collectif est masqué aux agents sans pouvoirs administrateur',()=>{
  const env=setup();
  env.context.renderHomeAdminReportBanner();
  assert.equal(env.banner.style.display,'none');
  assert.equal(env.banner.innerHTML,'');
});
test('le superadmin filtre les comptes rendus par caserne',()=>{
  const env=setup({superadmin:true});
  env.record._crValide=false;
  env.context.CASERNES.push({id:'CIS06',nom:'CIS 06'});
  env.context.CASERNE_DATA.CIS06={ivs:[{id:'r2',h:'20261021_1300',s:'terminee',agr:'bob'}],
    pilpIvs:[],activites:[],fmpas:[]};
  env.context.renderHomeAdminReportBanner();
  assert.match(env.banner.innerHTML,/2 non validés/);
  env.context.renderReportAdminMonitor('superadmin');
  assert.match(env.monitor.innerHTML,/bob · 1/);
  env.context.setReportAdminStationFilter('CIS05');
  assert.match(env.monitor.innerHTML,/Comptes rendus non validés · 1/);
  assert.doesNotMatch(env.monitor.innerHTML,/bob · 1/);
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
