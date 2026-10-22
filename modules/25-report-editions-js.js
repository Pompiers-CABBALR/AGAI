// Suivi des éditions officielles, désactivé côté serveur jusqu'au choix du SA.
// Une émission désigne une édition officielle dans AGAI, pas la certitude
// qu'une feuille physique soit sortie de l'imprimante.
window._agaiReportEditionState=null;
let _reportEditionHomeRequest=null;
let _reportEditionHomeCheckedAt=0;
const _reportEditionBusy=new Set();
let _reportAdminSummaryState=null;
let _reportAdminSummaryRequest=null;
let _reportAdminSummaryCheckedAt=0;
let _reportAdminStationFilter='';

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
      const el=document.getElementById('acc-rapports');
      if(el&&document.getElementById('tab-home')?.classList.contains('active'))
        rAccueilRapports();
      renderHomeAdminReportBanner();
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
      const numero=accueilRapportNumero(iv);
      const row={station:station,stationName:stationName,type:type,id:iv.id,
        recordId:reportEditionRecordId(station,type,iv.id),day:day,
        label:(iv._isRenfort?'Renfort':'Intervention')+' · '+(numero?numero+' · ':'')
          +(iv.n||iv.id)+(iv.com?' — '+iv.com:''),
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
function reportAdminScope(){
  if(isSuperAdmin())return 'superadmin';
  return isAdminModeActive()?'admin':'';
}
function reportAdminSummaryFor(scope){
  return _reportAdminSummaryState&&CU
    &&_reportAdminSummaryState.login===CU.l
    &&_reportAdminSummaryState.station===CURRENT_CASERNE_ID
    &&_reportAdminSummaryState.scope===scope?_reportAdminSummaryState.state:null;
}
function reportAdminEligibleRows(scope,start){
  return reportMonitorRows(scope).editer.filter(function(row){return row.day>=start;});
}
function renderHomeAdminReportBanner(){
  const el=document.getElementById('acc-admin-report-summary');
  if(!el)return;
  const scope=reportAdminScope();
  if(!CU||!scope){el.style.display='none';el.innerHTML='';return;}
  const count=reportMonitorRows(scope).finaliser.length;
  const settings=window._agaiReportEditionState;
  const state=reportAdminSummaryFor(scope);
  let originalText='';
  if(settings&&settings.enabled&&settings.startDate){
    if(state&&state.enabled&&state.startDate===settings.startDate){
      const start=settings.startDate.replace(/-/g,'');
      const eligible=reportAdminEligibleRows(scope,start);
      const missing=eligible.some(function(row){return !state.items[row.recordId];});
      const originals=eligible.filter(function(row){
        return state.items[row.recordId]&&Number(state.items[row.recordId].count)===0;
      }).length;
      originalText=missing?' · Originaux à vérifier':' · '+originals+' originaux à éditer';
    }else originalText=' · Originaux à vérifier';
    reportEditionScheduleAdminSummary();
  }
  el.style.display='';
  el.innerHTML='<button type="button" onclick="openHomeReportMonitor()" '
    +'style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:11px 13px;border-radius:11px;border:1px solid #CBD5E1;background:#EFF6FF;color:#1E3A5F;text-align:left;font:inherit;cursor:pointer;">'
    +'<span>📋 <strong>Rapports à suivre</strong> · '+count+' non validé'+(count===1?'':'s')+originalText+'</span>'
    +'<span aria-hidden="true" style="font-size:18px;">›</span></button>';
}
function reportEditionScheduleAdminSummary(){
  const scope=reportAdminScope(),settings=window._agaiReportEditionState;
  if(!CU||!scope||!settings||!settings.enabled||!settings.startDate
     ||_reportAdminSummaryRequest||Date.now()-_reportAdminSummaryCheckedAt<60000)return;
  const login=CU.l,station=CURRENT_CASERNE_ID;
  _reportAdminSummaryRequest=Promise.resolve().then(function(){
    return reportEditionLoadState(reportAdminEligibleRows(scope,settings.startDate.replace(/-/g,''))
      .map(function(row){return row.recordId;}));
  }).then(function(state){
    if(CU&&CU.l===login&&CURRENT_CASERNE_ID===station&&reportAdminScope()===scope){
      _reportAdminSummaryState={login:login,station:station,scope:scope,state:state};
      _reportAdminSummaryCheckedAt=Date.now();
      renderHomeAdminReportBanner();
      if(document.getElementById('home-report-monitor'))renderReportAdminMonitor(scope);
    }
  }).catch(function(error){
    console.warn('[AGAI] Suivi des originaux :',error.message);
    _reportAdminSummaryCheckedAt=Date.now();
  }).finally(function(){_reportAdminSummaryRequest=null;});
}
function openHomeReportMonitor(){
  const scope=reportAdminScope();
  if(!CU||!scope)return;
  document.getElementById('mt').textContent='Suivi des rapports';
  document.getElementById('mi').textContent=scope==='superadmin'?'Toutes les casernes':'Votre caserne';
  document.getElementById('mb').innerHTML='<div id="home-report-monitor"></div>';
  document.getElementById('mo').style.display='flex';
  renderReportAdminMonitor(scope);
  refreshReportAdminMonitor(scope);
}
function setReportAdminStationFilter(station){
  if(reportAdminScope()!=='superadmin')return;
  _reportAdminStationFilter=station&&CASERNES.some(function(c){return c.id===station;})?station:'';
  renderReportAdminMonitor('superadmin');
}
function openReportAdminMonitorItem(button){
  const scope=reportAdminScope();
  if(!scope||!button||!document.getElementById('home-report-monitor'))return;
  const station=button.dataset.station,type=button.dataset.type,id=button.dataset.id,stage=button.dataset.stage;
  if(scope==='admin'&&station!==CURRENT_CASERNE_ID)return;
  if(scope==='superadmin'&&_reportAdminStationFilter&&station!==_reportAdminStationFilter)return;
  const rows=reportMonitorRows(scope);
  const row=(stage==='finaliser'?rows.finaliser:stage==='editer'?rows.editer:[])
    .find(function(item){return item.station===station&&item.type===type&&item.id===id;});
  if(!row)return;
  if(stage==='editer'){
    const settings=window._agaiReportEditionState,state=reportAdminSummaryFor(scope);
    if(!settings||!settings.enabled||!settings.startDate||row.day<settings.startDate.replace(/-/g,'')
       ||!state||state.enabled!==true||state.startDate!==settings.startDate
       ||!state.items[row.recordId]||Number(state.items[row.recordId].count)!==0)return;
  }
  const data=CASERNE_DATA[station]||{};
  const collection=type==='iv'?data.ivs:type==='pilp'?data.pilpIvs
    :type==='activite'?data.activites:type==='fmpa'?data.fmpas:null;
  const record=Array.isArray(collection)?collection.find(function(item){return item&&item.id===id;}):null;
  if(!record)return;
  // Seul son propre compte rendu, dans la caserne active, rejoint le formulaire.
  // Les autres lignes restent des aperçus sans action d'écriture ou d'édition.
  if(stage==='finaliser'&&(type==='iv'||type==='pilp')&&station===CURRENT_CASERNE_ID
     &&accueilRapportOwner(record,CU.l)){
    showCompteRenduModal(id);
    return;
  }
  const date=/^\d{8}$/.test(row.day)?row.day.slice(6,8)+'/'+row.day.slice(4,6)+'/'+row.day.slice(0,4):row.day;
  const report=type==='iv'||type==='pilp'?record._crTexte||record._compteRendu||''
    :type==='activite'?record.cr||'':'';
  const details=type==='fmpa'?'<div class="mr"><div class="ml">Formation</div><div class="mv2">'
    +escHtml(record.theme||row.label)+'</div></div>'
    :'<div class="mr"><div class="ml">Compte rendu</div><div class="mv2" style="white-space:pre-wrap;overflow-wrap:anywhere;">'
      +escHtml(report||'Aucun texte enregistré pour le moment.')+'</div></div>';
  document.getElementById('mt').textContent=stage==='finaliser'?'Compte rendu à finaliser':'Rapport à éditer';
  document.getElementById('mi').textContent=row.label;
  document.getElementById('mb').innerHTML='<div style="font-size:12px;color:var(--t2);margin-bottom:12px;">'
    +'Consultation uniquement : aucune validation ni édition n’est effectuée.</div>'
    +'<div class="mr"><div class="ml">Caserne</div><div class="mv2">'+escHtml(row.stationName)+'</div></div>'
    +'<div class="mr"><div class="ml">Responsable</div><div class="mv2">'+escHtml(row.owner)+'</div></div>'
    +'<div class="mr"><div class="ml">Date</div><div class="mv2">'+escHtml(date)+'</div></div>'
    +details
    +'<button type="button" class="btn sm" style="margin-top:14px;" onclick="openHomeReportMonitor()">← Retour au suivi</button>';
  openModalAtTop();
}
function renderReportAdminMonitor(scope){
  if(scope!==reportAdminScope())return;
  const el=document.getElementById('home-report-monitor');
  if(!el)return;
  const rows=reportMonitorRows(scope);
  const station=scope==='superadmin'?_reportAdminStationFilter:'';
  const finaliser=station?rows.finaliser.filter(function(row){return row.station===station;}):rows.finaliser;
  const settings=window._agaiReportEditionState;
  const checkedState=reportAdminSummaryFor(scope);
  const state=checkedState&&settings&&checkedState.enabled===true
    &&checkedState.startDate===settings.startDate?checkedState:null;
  const start=settings&&settings.enabled&&settings.startDate?settings.startDate.replace(/-/g,''):'';
  const eligible=start?rows.editer.filter(function(row){return row.day>=start&&(!station||row.station===station);}):[];
  const unverified=eligible.filter(function(row){return !state||!state.items[row.recordId];}).length;
  const toPrint=eligible.filter(function(row){
    return state&&state.items[row.recordId]&&Number(state.items[row.recordId].count)===0;
  });
  const fmt=function(row){
    const date=/^\d{8}$/.test(row.day)?row.day.slice(6,8)+'/'+row.day.slice(4,6)+'/'+row.day.slice(0,4):row.day;
    return '<button type="button" data-station="'+escHtml(row.station)+'" data-type="'+escHtml(row.type)
      +'" data-id="'+escHtml(row.id)+'" data-stage="'+escHtml(row.stage)+'"'
      +' onclick="openReportAdminMonitorItem(this)" style="display:block;width:100%;padding:9px 3px;'
      +'border:0;border-top:1px solid var(--brd);background:transparent;color:inherit;text-align:left;'
      +'font:inherit;font-size:12px;cursor:pointer;white-space:normal;overflow-wrap:anywhere;">'
      +'<strong>'+escHtml(row.label)+'</strong> · '+escHtml(date)+' <span aria-hidden="true">›</span></button>';
  };
  const grouped=function(list,empty,stage){
    if(!list.length)return '<p style="font-size:12px;color:var(--t2);">'+empty+'</p>';
    const groups=new Map();
    list.forEach(function(row){
      const key=row.station+'|'+row.owner;
      if(!groups.has(key))groups.set(key,{owner:row.owner,stationName:row.stationName,rows:[]});
      groups.get(key).rows.push(row);
    });
    return [...groups.values()].sort(function(a,b){return a.owner.localeCompare(b.owner,'fr');})
      .map(function(group){return '<details style="margin-top:7px;padding:7px;border:1px solid var(--brd);border-radius:8px;">'
        +'<summary style="cursor:pointer;font-weight:600;">'+escHtml(group.owner)+' · '+group.rows.length
        +(scope==='superadmin'?' · '+escHtml(group.stationName):'')+'</summary>'
      +group.rows.map(function(row){return fmt(Object.assign({stage:stage},row));}).join('')+'</details>';}).join('');
  };
  const stations=scope==='superadmin'?'<label style="display:block;margin:9px 0;font-size:12px;">Caserne '
    +'<select class="fi" onchange="setReportAdminStationFilter(this.value)">'
    +'<option value="">Toutes les casernes</option>'
    +CASERNES.filter(function(c){return c&&c.id&&c.id!=='EMAJ';}).map(function(c){return '<option value="'+escHtml(c.id)+'"'
      +(station===c.id?' selected':'')+'>'+escHtml(c.nom||c.id)+'</option>';}).join('')
    +'</select></label>':'';
  el.innerHTML='<div style="font-size:12px;margin-bottom:8px;">'
    +'<button class="btn sm" onclick="refreshReportAdminMonitor(\''+scope+'\')">↻ Actualiser le suivi</button>'
    +'<span style="margin-left:8px;color:var(--t2);">'+(settings?settings.enabled?'Originaux suivis depuis le '+escHtml(settings.startDate):'Suivi des originaux non activé':'État des originaux non vérifié')+'</span></div>'
    +stations
    +'<details open><summary style="font-weight:700;cursor:pointer;">Comptes rendus non validés · '+finaliser.length+'</summary>'
    +grouped(finaliser,'Aucun rapport en attente de validation sur la période.','finaliser')+'</details>'
    +(start?'<details style="margin-top:10px;"><summary style="font-weight:700;cursor:pointer;">Originaux non édités · '+toPrint.length
      +(unverified?' · '+unverified+' statut(s) à vérifier':'')+'</summary>'
      +grouped(toPrint,'Aucun original en attente confirmé par le serveur.','editer')+'</details>':'');
}
async function refreshReportAdminMonitor(scope){
  if(scope!==reportAdminScope())return;
  const el=document.getElementById('home-report-monitor');
  if(el)el.textContent='Vérification du registre serveur…';
  try{
    const rows=reportMonitorRows(scope),login=CU.l,station=CURRENT_CASERNE_ID;
    const state=await reportEditionLoadState(rows.editer.map(function(row){return row.recordId;}));
    if(!CU||CU.l!==login||CURRENT_CASERNE_ID!==station||scope!==reportAdminScope())return;
    _reportAdminSummaryState={login:login,station:station,scope:scope,state:state};
    _reportAdminSummaryCheckedAt=Date.now();
    renderHomeAdminReportBanner();
    renderReportAdminMonitor(scope);
  }catch(error){
    renderReportAdminMonitor(scope);
    if(el)el.insertAdjacentHTML('afterbegin','<p style="color:var(--rd);font-size:12px;">'+escHtml(error.message)+' — état des originaux non confirmé.</p>');
  }
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
