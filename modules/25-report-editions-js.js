// Suivi des éditions officielles, désactivé côté serveur jusqu'au choix du SA.
// Une émission désigne une édition officielle dans AGAI, pas la certitude
// qu'une feuille physique soit sortie de l'imprimante.
window._agaiReportEditionState=null;
let _reportEditionHomeRequest=null;
let _reportEditionHomeCheckedAt=0;
const _reportEditionBusy=new Set();

async function reportEditionRpc(name,payload){
  const token=_agaiAuthAccessToken();
  if(!token||!navigator.onLine)throw new Error('Connexion au serveur requise pour le suivi des éditions.');
  let response;
  try{
    response=await _agaiAuthFetchWithTimeout(SB_URL+'/rest/v1/rpc/'+name,{
      method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    },12000);
  }catch(_error){throw new Error(name==='agai_issue_report_edition'
    ?'Réponse du serveur indisponible : une édition a peut-être été enregistrée. Ne réessayez pas avant de vérifier le suivi des originaux.'
    :'Contrôle serveur indisponible. Aucune donnée locale n’a été modifiée.');}
  if(!response.ok){
    let code='';
    try{code=(await response.json()).message||'';}catch(_error){}
    const messages={
      AGAI_REPORT_NOT_ACTIVATED:'L’édition officielle n’est pas activée.',
      AGAI_REPORT_NOT_FINAL:'Le rapport n’est pas encore validé.',
      AGAI_REPORT_BEFORE_START:'Ce rapport précède la date de début du suivi.',
      AGAI_REPORT_CHANGED:'Le rapport a changé. Actualisez les données avant de recommencer.',
      AGAI_REPORT_EDITION_CONFLICT:'Un autre appareil a déjà émis cette édition. Actualisez le suivi.',
      AGAI_REPORT_OWNER_REQUIRED:'Seul le responsable de ce rapport peut émettre l’original.',
      AGAI_REPORT_ADMIN_REQUIRED:'Seul un administrateur peut émettre un duplicata.',
      AGAI_REPORT_SUPERADMIN_REQUIRED:'Activation réservée au superadministrateur.',
      AGAI_REPORT_ACCESS_DENIED:'Ce compte ne peut pas émettre de rapport.'
    };
    throw new Error(messages[code]||('Contrôle serveur refusé (HTTP '+response.status+'). Aucune édition locale ne sera créée.'));
  }
  return response.json();
}

async function reportEditionLoadState(ids){
  const unique=[...new Set((ids||[]).filter(Boolean))],chunks=[];
  for(let i=0;i<unique.length;i+=200)chunks.push(unique.slice(i,i+200));
  if(!chunks.length)chunks.push([]);
  const result={enabled:false,startDate:null,items:{}};
  for(const batch of chunks){
    const page=await reportEditionRpc('agai_report_edition_state',{p_ids:batch});
    if(typeof page?.enabled!=='boolean'||!page.items||typeof page.items!=='object')
      throw new Error('Réponse incomplète du registre des éditions.');
    if(result.startDate!==null&&(result.enabled!==page.enabled||result.startDate!==page.startDate))
      throw new Error('Le réglage a changé pendant le contrôle. Réessayez.');
    result.enabled=page.enabled;result.startDate=page.startDate||null;
    Object.assign(result.items,page.items);
  }
  window._agaiReportEditionState=result;
  return result;
}
function reportEditionRecordId(caserne,type,id){return _rcId(caserne,type,id);}
function reportEditionHomeIds(){
  if(!CU||!CURRENT_CASERNE_ID)return [];
  const ids=[];
  [].concat(IVS||[],PILP_IVS||[]).forEach(function(iv){
    if(iv&&iv.id&&iv.s==='terminee'&&iv._crValide&&accueilRapportOwner(iv,CU.l))
      ids.push(reportEditionRecordId(CURRENT_CASERNE_ID,isPilpIntervention(iv)?'pilp':'iv',iv.id));
  });
  (actGetData()||[]).forEach(function(a){
    if(a&&a.id&&a.auteur===CU.l&&a.cr)ids.push(reportEditionRecordId(CURRENT_CASERNE_ID,'activite',a.id));
  });
  (fmpaGetData()||[]).forEach(function(f){
    if(f&&f.id&&f.auteur===CU.l)ids.push(reportEditionRecordId(CURRENT_CASERNE_ID,'fmpa',f.id));
  });
  return ids;
}
function reportEditionScheduleHomeStatus(){
  if(!CU||_reportEditionHomeRequest||Date.now()-_reportEditionHomeCheckedAt<60000)return;
  const login=CU.l,station=CURRENT_CASERNE_ID;
  _reportEditionHomeRequest=Promise.resolve().then(async function(){
    const settings=await reportEditionLoadState([]);
    if(settings.enabled)await reportEditionLoadState(reportEditionHomeIds());
  }).then(function(){
    _reportEditionHomeCheckedAt=Date.now();
    if(CU&&CU.l===login&&CURRENT_CASERNE_ID===station){
      const start=rapportsEditionDebut();
      const el=document.getElementById('acc-rapports');
      if(el&&document.getElementById('tab-home')?.classList.contains('active'))
        rAccueilRapports();
    }
  }).catch(function(error){
    console.warn('[AGAI] Éditions officielles :',error.message);
    _reportEditionHomeCheckedAt=Date.now();
  }).finally(function(){_reportEditionHomeRequest=null;});
}

function renderReportEditionSettings(){
  const state=window._agaiReportEditionState,el=document.getElementById('sa-report-edition-state');
  if(el)el.textContent=state?(state.enabled?'Active depuis le '+state.startDate:'Désactivée'):'État à vérifier';
  const input=document.getElementById('sa-report-edition-start');
  if(input&&state&&document.activeElement!==input)input.value=state.startDate||'';
}
async function checkReportEditionSettings(){
  if(!isSuperAdmin())return;
  const el=document.getElementById('sa-report-edition-state');
  if(el)el.textContent='Vérification…';
  try{await reportEditionLoadState([]);renderReportEditionSettings();}
  catch(error){if(el)el.textContent=error.message;}
}
function saveReportEditionSettings(enabled){
  if(!isSuperAdmin()){showToast('Activez les pouvoirs superadministrateur.','warn');return;}
  const start=document.getElementById('sa-report-edition-start')?.value||'';
  if(enabled&&!/^\d{4}-\d{2}-\d{2}$/.test(start)){
    showToast('Choisissez d’abord la date de début des originaux.','warn');return;
  }
  const message=enabled
    ?'Activer l’édition officielle à partir du '+start+' ? Vérifiez d’abord que tous les appareils utilisent la version V202610_0053 ou suivante. Un seul original sera émis par rapport ; toute réédition exigera les pouvoirs administrateur.'
    :'Conserver l’édition officielle désactivée ? Les rapports restent utilisables selon le fonctionnement actuel.';
  confirmModal(message,async function(){
    try{
      if(!isSuperAdmin())throw new Error('Les pouvoirs superadministrateur ne sont plus actifs.');
      await reportEditionRpc('agai_set_report_edition_settings',{
        p_enabled:enabled,p_start_date:start||null
      });
      await reportEditionLoadState([]);
      renderReportEditionSettings();
      _reportEditionHomeCheckedAt=0;
      showToast(enabled?'Édition officielle activée.':'Édition officielle désactivée.','success');
    }catch(error){showToast(error.message,'warn');}
  });
}

function reportMonitorRows(scope){
  const stations=scope==='superadmin'
    ?CASERNES.filter(function(c){return c&&c.id&&c.id!=='EMAJ';}).map(function(c){return c.id;})
    :[CURRENT_CASERNE_ID];
  const finaliser=[],editer=[],start=rapportsFinalisationDebut();
  const ownerName=function(data,login){
    const user=(data.users||[]).find(function(item){return item&&item.l===login;})
      ||(USERS||[]).find(function(item){return item&&item.l===login;});
    return user?((user.prenom||'')+' '+(user.nom||'')).trim()||login:login||'Non désigné';
  };
  stations.forEach(function(station){
    const data=CASERNE_DATA[station]||{};
    const stationName=CASERNES.find(function(c){return c.id===station;})?.nom||station;
    [].concat(data.ivs||[],data.pilpIvs||[]).forEach(function(iv){
      if(!iv||!iv.id||iv._lienPilpSourceId||iv._isPilip||iv.s!=='terminee')return;
      const day=accueilRapportDate(iv);
      const type=(data.pilpIvs||[]).includes(iv)?'pilp':'iv';
      const row={station:station,stationName:stationName,type:type,id:iv.id,
        recordId:reportEditionRecordId(station,type,iv.id),day:day,
        label:(iv._isRenfort?'Renfort':'Intervention')+' · '+(iv.n||iv.id),
        owner:[...new Set([iv.agr,iv._agr2].filter(Boolean))]
          .map(function(login){return ownerName(data,login);}).join(' / ')||'Non désigné'};
      if(day>=start&&!iv._crValide)finaliser.push(row);
      if(iv._crValide)editer.push(row);
    });
    (data.activites||[]).forEach(function(a){
      if(a&&a.id&&a.cr)editer.push({station:station,stationName:stationName,type:'activite',
        id:a.id,recordId:reportEditionRecordId(station,'activite',a.id),
        day:String(a.date||'').replace(/-/g,''),label:'Activité · '+(a.type||a.id),
        owner:ownerName(data,a.auteur)});
    });
    (data.fmpas||[]).forEach(function(a){
      if(a&&a.id)editer.push({station:station,stationName:stationName,type:'fmpa',
        id:a.id,recordId:reportEditionRecordId(station,'fmpa',a.id),
        day:String(a.date||'').replace(/-/g,''),label:'Formation · '+(a.theme||a.id),
        owner:ownerName(data,a.auteur)});
    });
  });
  return {finaliser:finaliser,editer:editer};
}
function renderReportAdminMonitor(scope){
  if(scope==='superadmin'&&!isSuperAdmin())return;
  if(scope==='admin'&&!isAdminModeActive())return;
  const el=document.getElementById(scope==='superadmin'?'sa-report-monitor':'admin-report-monitor');
  if(!el)return;
  const rows=reportMonitorRows(scope);
  const state=window._agaiReportEditionState;
  const start=state&&state.enabled&&state.startDate?state.startDate.replace(/-/g,''):'';
  const eligible=start?rows.editer.filter(function(row){return row.day>=start;}):[];
  const unverified=eligible.filter(function(row){return !state.items||!state.items[row.recordId];}).length;
  const toPrint=start?rows.editer.filter(function(row){
    return row.day>=start&&state.items&&state.items[row.recordId]
      &&Number(state.items[row.recordId].count)===0;
  }):[];
  const fmt=function(row){
    const date=/^\d{8}$/.test(row.day)?row.day.slice(6,8)+'/'+row.day.slice(4,6)+'/'+row.day.slice(0,4):row.day;
    return '<div style="padding:7px 0;border-top:1px solid var(--brd);font-size:12px;">'
      +'<strong>'+escHtml(row.label)+'</strong> · '+escHtml(row.stationName)
      +' · Responsable : '+escHtml(row.owner)+' · '+escHtml(date)+'</div>';
  };
  const byOwner={};
  rows.finaliser.forEach(function(row){const key=row.station+'|'+row.owner;byOwner[key]=(byOwner[key]||0)+1;});
  const ownerSummary=Object.entries(byOwner).map(function(entry){
    return escHtml(entry[0].split('|')[1])+' ('+entry[1]+')';
  }).join(' · ');
  el.innerHTML='<div style="font-size:12px;margin-bottom:8px;">'
    +'<button class="btn sm" onclick="refreshReportAdminMonitor(\''+scope+'\')">↻ Actualiser le suivi</button>'
    +'<span style="margin-left:8px;color:var(--t2);">'+(state?state.enabled?'Originaux suivis depuis le '+escHtml(state.startDate):'Suivi des originaux non activé':'État des originaux non vérifié')+'</span></div>'
    +'<details open><summary style="font-weight:700;cursor:pointer;">Comptes rendus non validés · '+rows.finaliser.length+'</summary>'
    +(ownerSummary?'<div style="font-size:11px;color:var(--t2);padding:5px 0;">Par responsable : '+ownerSummary+'</div>':'')
    +(rows.finaliser.length?rows.finaliser.map(fmt).join(''):'<p style="font-size:12px;">Aucun rapport en attente de validation sur la période.</p>')+'</details>'
    +(start?'<details style="margin-top:10px;"><summary style="font-weight:700;cursor:pointer;">Originaux non édités · '+toPrint.length+(unverified?' · '+unverified+' statut(s) à vérifier':'')+'</summary>'
      +(toPrint.length?toPrint.map(fmt).join(''):'<p style="font-size:12px;">Aucun original en attente confirmé par le serveur.</p>')+'</details>':'');
}
async function refreshReportAdminMonitor(scope){
  if(scope==='superadmin'&&!isSuperAdmin()||scope==='admin'&&!isAdminModeActive())return;
  const rows=reportMonitorRows(scope),el=document.getElementById(scope==='superadmin'?'sa-report-monitor':'admin-report-monitor');
  if(el)el.textContent='Vérification du registre serveur…';
  try{await reportEditionLoadState(rows.editer.map(function(row){return row.recordId;}));renderReportAdminMonitor(scope);}
  catch(error){renderReportAdminMonitor(scope);if(el)el.insertAdjacentHTML('afterbegin','<p style="color:var(--rd);font-size:12px;">'+escHtml(error.message)+' — état des originaux non confirmé.</p>');}
}

const _reportEditionLegacyIntervention=voirRapportIntervention;
const _reportEditionLegacyActivity=actImprimerRapport;
const _reportEditionLegacyFmpa=fmpaImprimerRapport;
const _reportEditionLegacyOpenIframe=openIframeModal;
const _reportEditionLegacyPrint=_onIframePrint;
globalThis.openIframeModal=function(html,id){
  const button=document.getElementById('iframe-print-btn');
  if(button){delete button.dataset.reportEditionType;delete button.dataset.reportEditionId;button.disabled=false;}
  return _reportEditionLegacyOpenIframe(html,id);
};
function reportEditionOlderThanStart(kind,record,start){
  const day=kind==='iv'?accueilRapportDate(record):String(record.date||'').replace(/-/g,'');
  return day<start.replace(/-/g,'');
}
function reportEditionOwns(kind,record){
  if(!CU||!record)return false;
  return kind==='iv'?accueilRapportOwner(record,CU.l):record.auteur===CU.l;
}
function reportEditionCanonical(value){
  if(Array.isArray(value))return value.map(reportEditionCanonical);
  if(value&&typeof value==='object'){
    const sorted={};
    Object.keys(value).sort().forEach(function(key){
      if(value[key]!==undefined)sorted[key]=reportEditionCanonical(value[key]);
    });
    return sorted;
  }
  return value;
}
async function reportEditionVerifyServerCopy(recordId,record,updatedAt){
  const token=_agaiAuthAccessToken();
  if(!token||!navigator.onLine)throw new Error('Connexion au serveur requise pour vérifier le rapport.');
  const url=SB_URL+'/rest/v1/records?id=eq.'+encodeURIComponent(recordId)
    +'&select=id,data,updated_at,deleted&limit=1';
  let response;
  try{
    response=await _agaiAuthFetchWithTimeout(url,{
      headers:{apikey:SB_KEY,Authorization:'Bearer '+token}
    },12000);
  }catch(_error){throw new Error('Copie serveur du rapport indisponible. Aucune édition émise.');}
  if(!response.ok)throw new Error('Copie serveur du rapport non accessible (HTTP '+response.status+').');
  const rows=await response.json(),server=Array.isArray(rows)?rows[0]:null;
  if(!server||server.deleted||server.id!==recordId
     ||Date.parse(server.updated_at)!==Date.parse(updatedAt)
     ||JSON.stringify(reportEditionCanonical(server.data))!==JSON.stringify(reportEditionCanonical(record)))
    throw new Error('La fiche locale ne correspond pas à la copie du serveur. Attendez la synchronisation, puis actualisez avant toute édition.');
}
function reportEditionStamp(html,result){
  const label=result.kind==='original'?'ORIGINAL':'DUPLICATA';
  const stamp='<div style="font:700 12pt Arial,sans-serif;text-align:right;color:#111;padding:4px 10mm;background:white;">'
    +label+' N° '+Number(result.number)+' · '+escHtml(String(result.issuedAt||''))+'</div>';
  return String(html).replace(/<button\b[^>]*onclick=["']window\.print\(\)["'][^>]*>[\s\S]*?<\/button>/gi,'')
    .replace(/<body([^>]*)>/i,'<body$1>'+stamp);
}
async function reportEditionOpen(kind,id){
  if(_reportEditionBusy.has(kind+id))return;
  const record=kind==='iv'?interventionById(id)
    :kind==='activite'?actGetData().find(function(a){return a.id===id;})
    :fmpaGetData().find(function(a){return a.id===id;});
  if(!record){showToast('Rapport introuvable.','warn');return;}
  if(!canOpenInterventionPdfOnThisDevice()){
    showToast('Édition disponible uniquement sur ordinateur.','warn');return;
  }
  const station=CURRENT_CASERNE_ID,login=CU&&CU.l,
    type=kind==='iv'?(isPilpIntervention(record)?'pilp':'iv'):kind,
    recordId=reportEditionRecordId(station,type,id);
  _reportEditionBusy.add(kind+id);
  try{
    const state=await reportEditionLoadState([recordId]);
    if(!CU||CU.l!==login||CURRENT_CASERNE_ID!==station)
      throw new Error('La session a changé pendant le contrôle. Recommencez après reconnexion.');
    const legacy=kind==='iv'?_reportEditionLegacyIntervention
      :kind==='activite'?_reportEditionLegacyActivity:_reportEditionLegacyFmpa;
    if(!state.enabled||reportEditionOlderThanStart(kind,record,state.startDate)){
      legacy(id);return;
    }
    const status=state.items[recordId];
    if(!status||!status.updatedAt)throw new Error('Rapport non confirmé sur le serveur. Vérifiez la synchronisation.');
    const count=Number(status.count);
    if(!Number.isInteger(count)||count<0)throw new Error('État des éditions invalide.');
    if(count===0&&!reportEditionOwns(kind,record))
      throw new Error('L’original est réservé au responsable qui a créé le rapport.');
    if(count>0&&!isAdminModeActive())
      throw new Error('Pour un duplicata, activez vos pouvoirs administrateur.');
    await reportEditionVerifyServerCopy(recordId,record,status.updatedAt);
    const html=kind==='iv'?genRapportInterventionHTML(id)
      :kind==='activite'?genRapportActiviteHTML(record):genRapportFmpaHTML(record);
    if(!html)throw new Error('Données du rapport insuffisantes.');
    const expected=count,updatedAt=status.updatedAt;
    const actionKey=crypto.randomUUID();
    confirmModal((count?'Émettre un duplicata n° '+(count+1):'Émettre l’unique original')
      +' de ce rapport ? L’édition sera comptabilisée dès cette confirmation, même si la fenêtre d’impression est ensuite annulée.',
      async function(){
        try{
          if(count>0&&!isAdminModeActive())
            throw new Error('Les pouvoirs administrateur ne sont plus actifs.');
          const result=await reportEditionRpc('agai_issue_report_edition',{
            p_id:recordId,p_expected_count:expected,
            p_expected_updated_at:updatedAt,p_action_key:actionKey
          });
          if(!result||!Number.isInteger(Number(result.number))
             ||!['original','duplicata'].includes(result.kind))
            throw new Error('Édition peut-être enregistrée, mais réponse incomplète. Vérifiez le suivi avant de réessayer.');
          if(!CU||CU.l!==login||CURRENT_CASERNE_ID!==station)
            throw new Error('Édition enregistrée, mais session changée. Contactez un administrateur avant de réessayer.');
          openIframeModal(reportEditionStamp(html,result),kind==='iv'?id:null);
          const button=document.getElementById('iframe-print-btn');
          if(button){
            button.dataset.reportEditionType=kind;
            button.dataset.reportEditionId=id;
            button.style.display='inline-block';
            button.textContent='🖨 Imprimer '+(result.kind==='original'?'l’original':'le duplicata');
          }
          _reportEditionHomeCheckedAt=0;
          reportEditionScheduleHomeStatus();
        }catch(error){showToast(error.message,'warn');}
      });
  }catch(error){showToast(error.message,'warn');}
  finally{_reportEditionBusy.delete(kind+id);}
}
globalThis.voirRapportIntervention=function(id){return reportEditionOpen('iv',id);};
globalThis.actImprimerRapport=function(id){return reportEditionOpen('activite',id);};
globalThis.fmpaImprimerRapport=function(id){return reportEditionOpen('fmpa',id);};
globalThis._onIframePrint=function(){
  const button=document.getElementById('iframe-print-btn');
  if(!button?.dataset.reportEditionType)return _reportEditionLegacyPrint();
  if(button.disabled)return;
  button.disabled=true;
  document.getElementById('iframe-content')?.contentWindow?.print();
};
