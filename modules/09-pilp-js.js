// === MODULE: pilp.js ===
// ────────────────── PILP FORM ──────────────────
function showPilpForm(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  document.getElementById('mb').innerHTML+=`
    <div id="pilp-form" style="margin-top:12px;border:1.5px solid var(--pilp);border-radius:12px;padding:14px;background:var(--pilpl);">
      <div style="font-size:14px;font-weight:700;color:var(--pilp);margin-bottom:12px;">&#x1F3AF; Créer une intervention PILP</div>
      <div class="fg"><div class="fgl">Adresse confirmée <span class="req">*</span></div><input class="fi" type="text" id="pf-addr" value="${escHtml(iv.addr)}"/></div>
      <div class="fg"><div class="fgl">Commune</div><input class="fi" type="text" id="pf-com" value="${escHtml(iv.com)}" disabled style="background:#f9f9f9;"/></div>
      <div class="fg"><div class="fgl">Requérant <span class="req">*</span></div><input class="fi" type="text" id="pf-req" value="${iv.req}"/></div>
      <div class="fg"><div class="fgl">Téléphone <span class="req">*</span></div><input class="fi" type="tel" id="pf-tel" value="${iv.tel}"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="fg"><div class="fgl">Localisation</div><select class="fi" id="pf-loc"><option>Arbre</option><option>Toiture</option><option>Nichoir à oiseaux</option><option>Haie</option><option>Façade</option><option>Autre</option></select></div>
        <div class="fg"><div class="fgl">Hauteur (m)</div><input class="fi" type="number" id="pf-haut" min="0" placeholder="ex. 8"/></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <label style="display:flex;align-items:center;gap:8px;padding:8px;background:#fff;border-radius:8px;font-size:13px;cursor:pointer;border:1px solid var(--brd);"><input type="checkbox" id="pf-reco" style="width:16px;height:16px;accent-color:var(--pilp);"/>Reconnaissance faite</label>
        <label style="display:flex;align-items:center;gap:8px;padding:8px;background:#fff;border-radius:8px;font-size:13px;cursor:pointer;border:1px solid var(--brd);"><input type="checkbox" id="pf-axe" style="width:16px;height:16px;accent-color:var(--pilp);"/>Axe de tir dispo.</label>
      </div>
      <div class="fg"><div class="fgl">Observations</div><textarea class="fta" id="pf-obs" placeholder="Informations pour le tireur..."></textarea></div>
      <div id="pf-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
      <button class="btn pilp-btn" style="width:100%;" onclick="creerPILP('${ivId}')">&#x1F3AF; Créer la PILP</button>
    </div>`;
}

function creerPILP(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  const addr=document.getElementById('pf-addr').value.trim(),req=document.getElementById('pf-req').value.trim(),tel=document.getElementById('pf-tel').value.trim();
  const err=document.getElementById('pf-err');
  if(!addr||!req||!tel){err.style.display='block';err.textContent='Adresse, requérant et téléphone obligatoires.';return;}
  err.style.display='none';
  const h=getH(N());
  const annee=new Date().getFullYear();
  const localisation=document.getElementById('pf-loc').value;
  const hauteur=parseFloat(document.getElementById('pf-haut').value)||null;
  const reconnaissanceFaite=document.getElementById('pf-reco').checked;
  const axeTir=document.getElementById('pf-axe').checked;
  const observations=document.getElementById('pf-obs').value.trim();
  // La PILP créée reçoit un id temporaire PILP-2026-001
  // Elle n'a PAS encore de numéro INT — ce sera attribué à son passage En cours.
  const pilpId=nextPilpId(annee);
  PILP_IVS.unshift({
    id:pilpId,ivRef:iv.id,_numApl:interventionDisplayCallNumber(iv),
    // Pas de _numCaserne ni _numGlobal ici — attribués au passage En cours
    n:'Nid de frelons asiatiques — PILP',addr,addrComp:iv.addrComp||'',com:iv.com,h,req,tel,tels:Array.isArray(iv.tels)?iv.tels.slice():[tel],
    op:iv.op||iv.agr||CU.l,reqDispo:iv.reqDispo?JSON.parse(JSON.stringify(iv.reqDispo)):null,
    localisation:localisation,hauteur:hauteur,reconnaissanceFaite:reconnaissanceFaite,axeTir:axeTir,obs:observations,det:observations,
    _appelDetails:Object.assign({},iv._appelDetails||{},{'Localisation du nid':localisation,'Hauteur':hauteur?hauteur+' m':'Non renseignée','Reconnaissance':reconnaissanceFaite?'Réalisée':'Non réalisée','Axe de tir':axeTir?'Disponible':'À vérifier'}),
    _nidsAppel:Array.isArray(iv._nidsAppel)?JSON.parse(JSON.stringify(iv._nidsAppel)):undefined,
    s:'en-attente',agr:null,tireur:null,rappels:0,avisIds:[],tl:[mkTL('en-attente',h,CU.l)]
  });
  if(CD())CD().pilpIvs=PILP_IVS;
  // Marquer le lien PILP sans clôturer — le chef d'agrès clôture ensuite normalement
  iv._lienPilp=true;iv._pilpId=pilpId;
  iv.tl.push({s:'en-cours',h,who:CU.l,note:'→ PILP créée: '+pilpId});
  if(CD())CD().ivs=IVS;
  saveData();
  cM();rI();rAccueil();
  showToast('PILP créée ✓ — Clôturez maintenant votre intervention Frelons','success');
}

// ────────────────── PILP LIST ──────────────────
function timelineEntryHHMM(entry){
  const digits=String(entry&&entry.h||'').replace(/\D/g,'');
  return digits.length>=12?digits.slice(8,10)+':'+digits.slice(10,12):'';
}
function agaiRepairLegacyPilpDetails(){
  const repaired=[];
  (PILP_IVS||[]).forEach(function(iv){
    if(!iv||iv._legacyPilpDetailsVersion==='20260827-pilp-details-v1')return;
    const source=(IVS||[]).find(function(candidate){return candidate&&(candidate.id===iv.ivRef||candidate._pilpId===iv.id);})||null;
    let changed=false;
    const copyIfMissing=function(key,value,clone){
      if((iv[key]===undefined||iv[key]===null||iv[key]==='')&&value!==undefined&&value!==null&&value!==''){
        iv[key]=clone?JSON.parse(JSON.stringify(value)):value;changed=true;
      }
    };
    if(source){
      ['op','addrComp','det','reqDispo','_reqInit','_telInit','_natureAppelInitiale'].forEach(function(key){copyIfMissing(key,source[key],key==='reqDispo');});
      ['tels','_nidsAppel'].forEach(function(key){if((!Array.isArray(iv[key])||!iv[key].length)&&Array.isArray(source[key])&&source[key].length){iv[key]=JSON.parse(JSON.stringify(source[key]));changed=true;}});
      if(!iv._appelDetails&&source._appelDetails){iv._appelDetails=JSON.parse(JSON.stringify(source._appelDetails));changed=true;}
      const sameOperationalChef=!!(iv.agr&&(source.agr===iv.agr||source._agr2===iv.agr||(typeof interventionReportParticipants==='function'&&interventionReportParticipants(source).some(function(member){return member.login===iv.agr;}))));
      if(sameOperationalChef){
        ['eng','_engin1','_engin2','_equipage1','_equipage2','_engin1RoleConfig','_engin2RoleConfig'].forEach(function(key){copyIfMissing(key,source[key],true);});
      }
    }
    if(!iv.op){
      const creation=(iv.tl||[])[0];iv.op=source&&source.op||creation&&creation.who||'';if(iv.op)changed=true;
    }
    if(!iv._hDebut){
      const start=(iv.tl||[]).find(function(entry){return entry&&entry.s==='en-cours';});
      const startTime=timelineEntryHHMM(start);if(startTime){iv._hDebut=startTime;iv._hDebutReelle=startTime;iv._hDebutInitiale=startTime;changed=true;}
    }
    if(!iv.det&&iv.obs){iv.det=iv.obs;changed=true;}
    const pilpDetails=Object.assign({},iv._appelDetails||{});
    if(iv.localisation&&!pilpDetails['Localisation du nid'])pilpDetails['Localisation du nid']=iv.localisation;
    if(iv.hauteur&&!pilpDetails['Hauteur'])pilpDetails['Hauteur']=String(iv.hauteur).replace(/\s*m$/i,'')+' m';
    if(iv.reconnaissanceFaite!==undefined&&!pilpDetails['Reconnaissance'])pilpDetails['Reconnaissance']=iv.reconnaissanceFaite?'Réalisée':'Non réalisée';
    if(iv.axeTir!==undefined&&!pilpDetails['Axe de tir'])pilpDetails['Axe de tir']=iv.axeTir?'Disponible':'À vérifier';
    if(JSON.stringify(pilpDetails)!==JSON.stringify(iv._appelDetails||{})){iv._appelDetails=pilpDetails;changed=true;}
    iv._legacyPilpDetailsVersion='20260827-pilp-details-v1';
    if(changed){
      if(!Array.isArray(iv.tl))iv.tl=[];
      iv.tl.push({s:'information',h:getH(N()),who:'Correction automatique AGAI',note:'Ancienne fiche PILP complétée avec les informations opérationnelles disponibles'});
      repaired.push(iv.id);
    }
  });
  return repaired;
}
function sfPilp(f,btn){
  fltPilp=f;
  document.querySelectorAll('#subtab-pilp .fb').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  rPilp();
}

function rPilp(){
  if(!isTireurPILP()){
    const cont=document.getElementById('pilp-list');if(cont)cont.innerHTML='';
    return;
  }
  const legacyPilpRepairs=agaiRepairLegacyPilpDetails();
  if(legacyPilpRepairs.length){
    if(typeof syncCaserneContext==='function')syncCaserneContext();
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
  }
  // Même règle que la liste Interventions : les statuts actifs restent visibles,
  // tandis qu'une terminée disparaît dès le changement de journée.
  const pilpTermineeAujourdhui=function(iv){return iv.s==='terminee'&&iv.tl&&iv.tl.some(function(t){return t.s==='terminee'&&(t.h||'').startsWith(TDP);});};
  const pilpJour=PILP_IVS.filter(function(iv){return isTdy(iv)||['en-attente','selectionne','en-cours'].includes(iv.s)||pilpTermineeAujourdhui(iv);});
  // Compteurs récapitulatifs PILP
  document.getElementById('pilp-nb1').textContent=PILP_IVS.filter(iv=>iv.s==='en-attente').length;
  document.getElementById('pilp-nb2s').textContent=PILP_IVS.filter(iv=>iv.s==='selectionne').length;
  document.getElementById('pilp-nb2').textContent=PILP_IVS.filter(iv=>iv.s==='avis-passage').length;
  document.getElementById('pilp-nb3').textContent=PILP_IVS.filter(iv=>iv.s==='en-cours').length;
  document.getElementById('pilp-nb4').textContent=pilpJour.filter(iv=>iv.s==='terminee').length;
  document.getElementById('pilp-nbtot').textContent=pilpJour.length;
  // Avis de passage PILP (visible tireur/chef uniquement)
  const avisP=PILP_IVS.filter(iv=>iv.s==='avis-passage');
  const pas=document.getElementById('pilp-avsec');
  document.getElementById('pilp-avc').textContent=avisP.length;
  if(avisP.length&&(isTireurPILP()||isChef()||hasRight('Administration'))){
    pas.style.display='block';
    const apExpanded=pas.dataset.expanded==='1';
    document.getElementById('pilp-avl').innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;">
        <span style="font-size:12px;color:var(--pur);font-weight:500;">&#x1F7E3; ${avisP.length} avis de passage PILP</span>
        <button class="btn sm" style="font-size:11px;padding:3px 10px;" onclick="toggleAvisPILP(this)">${apExpanded?'▲ Réduire':'▼ Voir tous'}</button>
      </div>
      <div id="pilp-av-detail" style="display:${apExpanded?'block':'none'};">
        ${avisP.map(iv=>`<div class="ivr avis-passage" style="cursor:pointer;" onclick="oPilp('${iv.id}')">
          <div class="ivrl"><div class="ivrh">&#x1F4C5; ${escHtml(getAvisPassageDateTimeLabel(iv)||'Date non renseignée')}</div><div class="ivrn">&#x1F3AF; ${escHtml(iv.n)}</div><div class="ivrc">&#x1F4CD; ${escHtml(iv.com)}${iv.rappels?' · '+Number(iv.rappels)+' rappel(s)':''}</div></div>
          <div class="ivrr"><span class="bdg bp">Avis PILP</span>${isAdminModeActive()?`<button class="btn sm" style="font-size:10px;padding:3px 8px;background:#6B21A8;color:#fff;border-color:#6B21A8;" onclick="event.stopPropagation();classerAvisPassage('${iv.id}','pilp')">&#x1F5C3;&#xFE0F; Classer</button>`:''}</div></div>`).join('')}
      </div>`;
  } else pas.style.display='none';
  const avisPClasses=isAdminModeActive()?PILP_IVS.filter(iv=>iv._avisPassageClasse===true&&!iv._avisEnAttente&&iv.s!=='annulee'):[];
  const pacs=document.getElementById('pilp-avcsec'),pacc=document.getElementById('pilp-avcc'),pacl=document.getElementById('pilp-avcl');
  if(pacc)pacc.textContent=avisPClasses.length;
  if(pacs&&pacl&&avisPClasses.length){
    pacs.style.display='block';
    const classExpanded=pacs.dataset.expanded==='1';
    pacl.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;">
        <span style="font-size:12px;color:#6B7280;font-weight:500;">🗃️ ${avisPClasses.length} avis PILP classé(s)</span>
        <button class="btn sm" style="font-size:11px;padding:3px 10px;" onclick="toggleAvisClassesPilp(this)">${classExpanded?'▲ Réduire':'▼ Voir'}</button>
      </div>
      <div id="pilp-avc-detail" style="display:${classExpanded?'block':'none'};">
        ${avisPClasses.map(iv=>`<div class="ivr avis-passage" onclick="oPilp('${iv.id}')" style="opacity:.88;">
          <div class="ivrl"><div class="ivrh">📅 ${escHtml(String(iv.h||'').slice(0,8))}</div><div class="ivrn">🎯 ${escHtml(iv.n)}</div><div class="ivrc">📍 ${escHtml(interventionAddressLabel(iv))}</div></div>
          <div class="ivrr"><span class="bdg bgr">Classé</span><button class="btn sm" style="font-size:10px;padding:3px 8px;background:#fff;color:#6B21A8;border-color:#A855F7;" onclick="event.stopPropagation();restaurerAvisPassage('${iv.id}','pilp')">↩ Remettre en attente</button></div></div>`).join('')}
      </div>`;
  }else if(pacs){pacs.style.display='none';if(pacl)pacl.innerHTML='';}
  const pilpSelection=getSelPilp();
  const pilpPanel=document.getElementById('pilp-pap');
  if(pilpPanel&&pilpSelection.length){
    pilpPanel.style.display='block';
    document.getElementById('pilp-pagl').textContent=interventionRouteChefName({agr:CU.l});
    document.getElementById('pilp-pac').textContent=pilpSelection.length;
    rPLPilp(pilpSelection);
  }else if(pilpPanel){pilpPanel.style.display='none';}
  let list;
  if(fltPilp==='all') list=pilpJour.filter(iv=>iv.s!=='avis-passage');
  else if(fltPilp==='mes-sel') list=pilpJour.filter(iv=>(iv.s==='selectionne'||iv.s==='en-cours')&&iv.agr===CU.l);
  else if(fltPilp==='mes-resp') list=pilpJour.filter(iv=>iv.agr===CU.l&&['selectionne','en-cours','terminee'].includes(iv.s));
  else list=pilpJour.filter(iv=>iv.s===fltPilp);
  const cont=document.getElementById('pilp-list');
  if(!list.length){cont.innerHTML='<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucune intervention PILP.</div>';return;}
  const ag=isAgres(),chef=isChef()||hasRight('Administration');
  cont.innerHTML=sortedIVS(list.slice()).map(function(iv){return renderInterventionRow(iv,ag||chef,true);}).join('');
}
function toggleChkPilp(id,el){
  cS(id,el.checked?'selectionne':'en-attente');
}

function oPilp(id){
  if(!isTireurPILP()){showToast('Accès réservé aux tireurs PILP.','warn');return;}
  // La fiche PILP utilise exactement la même interface et les mêmes actions
  // opérationnelles que la fiche Interventions. Seule la collection est filtrée.
  return oM(id);
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  const ag=isAgres(),tireur=isTireurPILP(),chef=isChef()||hasRight('Administration');
  document.getElementById('mt').textContent=iv.n;
    // Numéro affiché : id temporaire PILP ou APL si clôturé
  const pApl=iv._numApl||'';
  const pilpUt=iv._numCaserne?' · UT '+iv._numCaserne:'';
  document.getElementById('mi').textContent=(iv.s==='terminee'?(pApl||iv.id):iv.id)+pilpUt;
  const bm={'en-attente':['br','En attente'],'selectionne':['bsel','Sélectionné'],'en-cours':['ba','En cours'],'terminee':['bg2','Terminée'],'avis-passage':['bp','Avis passage'],'avis-classe':['bp','Avis classé'],'avis-restaure':['binfo','Avis remis en attente']};
  const[bc,bt]=bm[iv.s]||['bgr','—'];
  let actions='';
  if((ag||tireur||chef)){
    if(iv.s==='en-attente'){
      actions=`<div class="brow"><button class="btn sel-btn sm" onclick="cSPilp('${id}','selectionne')">☑ Sélectionner</button>${canUseOperationalStartInterface()?`<button class="btn am sm" onclick="cSPilp('${id}','en-cours')">▶ En cours</button>`:`<button class="btn sm" disabled style="opacity:.65;">📱 Mobile/tablette</button>`}</div>`;
    } else if(iv.s==='selectionne'){
      actions=`<div class="brow">
        ${canUseOperationalStartInterface()?`<button class="btn am sm" onclick="cSPilp('${id}','en-cours')">▶ En cours</button>`:`<button class="btn sm" disabled style="opacity:.65;">📱 En cours : mobile/tablette</button>`}
        <button class="btn sm" onclick="cSPilp('${id}','en-attente')">↩ En attente</button>
      </div>`;
    } else if(iv.s==='en-cours'){
      const ds=getDS(N()),hh=pad(N().getHours()),mm2=pad(N().getMinutes());
      actions=`<div class="clotbox">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Clôturer l'intervention PILP</div>
        <label class="avislbl"><input type="checkbox" id="chk-pilp-avis" style="accent-color:var(--pur);" onchange="toggleAvisPassageHour(this,'pilp-avis-passage-hour','pilp-avis-passage-hour-wrap')"/>&#x1F7E3; Requérant absent — Avis de passage PILP</label>
        <div id="pilp-avis-passage-hour-wrap" style="display:none;background:#FAF5FF;border:1px solid #D8B4FE;border-radius:9px;padding:9px 10px;margin:-2px 0 10px;">
          <label for="pilp-avis-passage-hour" style="display:block;font-size:11px;font-weight:700;color:#6B21A8;margin-bottom:5px;">Heure de dépôt dans la boîte aux lettres *</label>
          <input class="fi" type="time" id="pilp-avis-passage-hour" value="${getHHMM(N())}" style="width:100%;"/>
        </div>
        <button class="btn gn" style="width:100%;" onclick="clotPilp('${id}')">✅ Confirmer la clôture</button>
      </div>
      <div class="brow" style="margin-top:8px;"><button class="btn sm danger" onclick="cSPilp('${id}','en-attente')">↩ En attente</button></div>`;
    } else if(iv.s==='avis-passage'&&(chef||ag)){
      const ds=getDS(N()),hh=pad(N().getHours()),mm2=pad(N().getMinutes());
      if(isAdminModeActive()){
        actions+=`<div class="clotbox" style="margin-top:10px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Classer l'avis de passage PILP</div>
          <button class="btn" style="width:100%;background:#6B21A8;color:#fff;border-color:#6B21A8;" onclick="classerAvisPassage('${id}','pilp')">&#x1F5C3;&#xFE0F; Classer l'avis</button>
        </div>`;
      } else {
        actions+=`<div class="clotbox" style="margin-top:10px;background:var(--rl);border:1px solid var(--rd);">
          <div style="font-size:12px;color:var(--rd);">&#x1F512; Activez les pouvoirs administrateur pour classer cet avis de passage.</div>
        </div>`;
      }
    }
  }
  const sdots={'en-attente':'#E24B4A','en-cours':'var(--amb)','terminee':'var(--grn)','avis-passage':'var(--pur)','avis-classe':'#6B21A8','avis-restaure':'#2563EB'};
  const tlHtml=hasAdministrativeAccount()?(iv.tl||[]).map(t=>`<div class="tl-item"><div class="tl-dot" style="background:${sdots[t.s]||'#aaa'};"></div><div class="tl-info"><span class="tl-status">${bm[t.s]?bm[t.s][1]:t.s}</span> <span class="tl-horo">&#x1F4C5; ${t.h}</span><div class="tl-who">${t.who}</div></div></div>`).join(''):'';
  document.getElementById('mb').innerHTML=`
    <div style="margin-bottom:10px;"><span class="bdg ${bc}">${bt}</span> <span class="bdg bpilp">PILP</span>${iv.rappels?` <span class="bdg bp" style="${isAdminModeActive()?'cursor:pointer;':''}"${isAdminModeActive()?` title="Déjà intervenu ici ?" onclick="showInterventionsLiees('${iv.id}')"`:''}>${iv.rappels} rappel(s)</span>`:''}</div>
    <div class="mr"><div class="ml">Adresse</div><div class="mv2" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">&#x1F4CD; ${escHtml(iv.addr)}, ${escHtml(iv.com)}${iv.addrComp?' · '+escHtml(iv.addrComp):''}${(isAgres()||isChef()||hasRight('Administration'))&&iv.s!=='terminee'?`<button class="btn sm" style="font-size:10px;padding:2px 7px;" onclick="editAdresse('${iv.id}')">✏️ Corriger</button>`:''}</div></div>
    <div class="mr"><div class="ml">Requérant</div><div class="mv2">${escHtml(iv.req)}${iv.tel?' · '+escHtml(iv.tel):''}</div></div>
    <div class="mr"><div class="ml">Localisation</div><div class="mv2">${escHtml(iv.localisation||'—')}${iv.hauteur?' — '+escHtml(String(iv.hauteur))+' m':''}</div></div>
    <div class="mr"><div class="ml">Reconnaissance</div><div class="mv2">${iv.reconnaissanceFaite?'✅ Réalisée':'❌ Non réalisée'}</div></div>
    <div class="mr"><div class="ml">Axe de tir</div><div class="mv2">${iv.axeTir===true?'&#x1F3AF; Disponible':iv.axeTir===false?'⚠️ À vérifier':'— Non renseigné'}</div></div>
    ${iv.obs?`<div class="mr"><div class="ml">Observations</div><div class="mv2">${escHtml(iv.obs)}</div></div>`:''}
    <div class="mr"><div class="ml">Créé par</div><div class="mv2" style="font-family:monospace;">${iv.agr||'—'}</div></div>
    ${iv.tireur?`<div class="mr"><div class="ml">Tireur</div><div class="mv2" style="font-family:monospace;">${iv.tireur}</div></div>`:''}
    ${iv._avisPassage?`<div style="background:#FAF5FF;border:1px solid #D8B4FE;border-radius:10px;padding:10px 12px;margin:8px 0;">
      <div style="font-size:11px;font-weight:700;color:#6B21A8;margin-bottom:8px;">&#x1F4EC; Avis de passage${getAvisPassageDateTimeLabel(iv)?' — déposé le '+escHtml(getAvisPassageDateTimeLabel(iv)):''}${iv._avisPassageClasse?' — classé':''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${canOpenInterventionPdfOnThisDevice()?`<button class="btn sm" style="background:#7E22CE;color:#fff;border-color:#7E22CE;" onclick="viewAvisPassageDocument('${iv.id}')">&#x1F4CB; Voir l'avis de passage</button>`:desktopOnlyInterventionPdfMessageHTML()}${isAdminModeActive()&&(iv._avisEnAttente||iv.s==='avis-passage')?`<button class="btn sm" style="background:#6B21A8;color:#fff;border-color:#6B21A8;" onclick="classerAvisPassage('${iv.id}','pilp')">&#x1F5C3;&#xFE0F; Classer</button>`:''}${isAdminModeActive()&&iv._avisPassageClasse===true&&!iv._avisEnAttente?`<button class="btn sm" style="background:#fff;color:#6B21A8;border-color:#A855F7;" onclick="restaurerAvisPassage('${iv.id}','pilp')">↩ Remettre en attente</button>`:''}</div>
    </div>`:''}
    <div class="msep"></div>
    ${hasAdministrativeAccount()?`<details style="background:var(--bg);border-radius:10px;margin-bottom:8px;">
      <summary style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;">
        Historique des statuts <span style="font-size:10px;background:var(--brd);border-radius:10px;padding:1px 7px;color:var(--t2);font-weight:400;">${(iv.tl||[]).length}</span>
      </summary>
      <div style="padding:0 12px 10px 12px;">${tlHtml||'<div style="font-size:12px;color:var(--t2);">Aucun historique.</div>'}</div>
    </details>`:''}
    ${actions}`;
  document.getElementById('mo').style.display='flex';
}
function cSPilp(id,s,confirmed){
  return cS(id,s,confirmed);
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  if(s==='en-cours'){
    if(confirmed!=='start-authorized'){
      requestOperationalStartAuthorization(iv,function(){cSPilp(id,s,'start-authorized');});return;
    }
    const ec=agresEnCours();
    if(ec&&ec.id!==id){showBlockModal(ec);return;}
    const startAuthorization=takeOperationalStartAuthorization(iv);
    if(!startAuthorization){showToast('Le contrôle de départ a expiré. Appuyez de nouveau sur « En cours ».','warn');return;}
    saveOperationalStartAuthorization(iv,startAuthorization);
  }
  iv.s=s;
  if(s==='selectionne'||s==='en-cours')iv.agr=CU.l;
  if(s==='en-cours')iv.tireur=CU.l;
  if(s==='en-attente'){clearInterventionNumbersForPending(iv);iv.agr=null;iv.tireur=null;}
  if(!iv.tl)iv.tl=[];iv.tl.push(mkTL(s,getH(N()),CU.l));
  if(s==='en-cours')assignInterventionNumbersAtStart(iv);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  rPilp();oPilp(id);
}
function clotPilp(id){
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  const avis=document.getElementById('chk-pilp-avis')&&document.getElementById('chk-pilp-avis').checked;
  const avisHeure=avis&&document.getElementById('pilp-avis-passage-hour')?document.getElementById('pilp-avis-passage-hour').value:'';
  if(avis&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(avisHeure)){
    showToast('Renseignez l’heure à laquelle l’avis de passage a été déposé.','warn');
    const field=document.getElementById('pilp-avis-passage-hour');if(field){field.focus();field.scrollIntoView({behavior:'smooth',block:'center'});}
    return;
  }
  const h=getH(N());
  if(avis){
    iv.s='avis-passage';iv.rappels=(iv.rappels||0)+1;
    iv._avisPassage=true;iv._avisEnAttente=true;
    iv._avisPassageHeure=avisHeure;iv._avisPassageDate=getDS(N());iv._avisPassageAt=h;
    if(!iv.avisIds)iv.avisIds=[];if(!iv.avisIds.includes(iv.id))iv.avisIds.push(iv.id);
    iv.tl.push({s:'avis-passage',h,who:CU.l,note:'Avis déposé à '+avisHeure});
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
    rPilp();oPilp(id);
  } else {
    iv.s='terminee';iv._hFin=getHHMM(N());iv.tl.push({s:'terminee',h,who:CU.l});
    (iv.avisIds||[]).forEach(aid=>{const av=PILP_IVS.find(v=>v.id===aid&&v.s==='avis-passage'&&v.id!==iv.id);if(av){av.s='terminee';av.tl.push({s:'terminee',h,who:CU.l+' (fusion)'});}});
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
    cM();rPilp();rI();rAccueil();
  }
}
function clotAvisPilp(id){
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  const h=getH(N());iv.s='terminee';iv.tl.push({s:'terminee',h,who:CU.l});
  if(iv._numCaserne&&!IVS.some(function(item){return item&&item._lienPilpSourceId===iv.id;})){
    IVS.unshift({id:String(iv.id)+'_historique',_numApl:interventionDisplayCallNumber(iv),_numCaserne:iv._numCaserne,_numGlobal:iv._numGlobal,_numMois:iv._numMois,
      n:iv.n.replace(' — PILP',''),addr:iv.addr,com:iv.com,h:iv.h,op:iv.agr||CU.l,
      s:'terminee',det:iv.obs||'',eng:null,req:iv.req||'',tel:iv.tel||'',obs:'',agr:CU.l,
      rappels:0,avisIds:[],_lienPilp:true,_lienPilpSourceId:iv.id,tl:[...iv.tl],
      _avisPassage:iv._avisPassage===true,_avisEnAttente:iv._avisEnAttente===true,
      _avisPassageHeure:iv._avisPassageHeure||'',_avisPassageDate:iv._avisPassageDate||'',_avisPassageAt:iv._avisPassageAt||'',
      _avisPassageClasse:iv._avisPassageClasse===true,_avisPassageClasseAt:iv._avisPassageClasseAt||'',_avisPassageClassePar:iv._avisPassageClassePar||''});
  }
  (iv.avisIds||[]).forEach(aid=>{const av=PILP_IVS.find(v=>v.id===aid&&v.s==='avis-passage'&&v.id!==iv.id);if(av){av.s='terminee';av.tl.push({s:'terminee',h,who:CU.l+' (fusion)'});}});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  cM();rPilp();rI();rAccueil();
}

// ────────────────── PARCOURS ──────────────────
function getActiveOperationalInterventions(excludeId){
  return [].concat(IVS||[],PILP_IVS||[]).filter(function(iv){
    return iv&&iv.id!==excludeId&&iv.s==='en-cours';
  });
}
function interventionVehicleNames(iv){
  const names=[iv&&iv.eng,iv&&iv._engin1,iv&&iv._engin2].filter(Boolean);
  interventionInternalReinforcements(iv).forEach(function(renfort){if(renfort&&renfort.engin)names.push(renfort.engin);});
  (Array.isArray(iv&&iv._releves)?iv._releves:[]).filter(function(releve){return releve&&releve.isRenfort&&!releve.isRenfortInterne;}).forEach(function(releve){if(releve.enginRenfort)names.push(releve.enginRenfort);});
  return [...new Set(names.map(function(name){return String(name).trim();}).filter(Boolean))];
}
function interventionActivePersonnelLogins(iv){
  if(!iv)return [];
  // Seule une vraie relève remplace l'équipage principal. Les renforts
  // internes et UT restent des équipages supplémentaires de l'intervention.
  const releves=(iv._releves||[]).filter(function(r){
    return r&&!r.isRenfort&&!r.isRenfortInterne&&Array.isArray(r.nouvelEquipage)&&r.nouvelEquipage.length;
  });
  const principal=releves.length?releves[releves.length-1].nouvelEquipage:(iv._equipage1||[]);
  const secondaire=iv._equipage2||[];
  const logins=[];
  const supplements=[];
  interventionInternalReinforcements(iv).forEach(function(renfort){supplements.push.apply(supplements,renfort.equipage||[]);});
  (iv._releves||[]).filter(function(releve){return releve&&releve.isRenfort&&!releve.isRenfortInterne;}).forEach(function(releve){supplements.push.apply(supplements,releve.nouvelEquipage||[]);});
  principal.concat(secondaire,supplements).forEach(function(member){
    if(member&&member.login)logins.push(member.login);
  });
  // Compatibilite avec les anciennes interventions sans equipage structure.
  if(!principal.length&&iv.agr)logins.push(iv.agr);
  if(!secondaire.length&&iv._agr2)logins.push(iv._agr2);
  return [...new Set(logins.filter(Boolean))];
}
function interventionChiefLogins(iv){
  return interventionActivePersonnelLogins(iv).filter(function(login){
    if(login===iv.agr||login===iv._agr2)return true;
    const releves=(iv._releves||[]).filter(function(releve){return releve&&!releve.isRenfort&&!releve.isRenfortInterne;});
    const principal=releves.length?(releves[releves.length-1].nouvelEquipage||[]):(iv._equipage1||[]);
    const supplements=[];
    interventionInternalReinforcements(iv).forEach(function(renfort){supplements.push.apply(supplements,renfort.equipage||[]);});
    return principal.concat(iv._equipage2||[],supplements).some(function(member){
      const role=nm(member&&member.role||'').replace(/[^a-z0-9]+/g,' ').trim();
      return member&&member.login===login&&(role==='ca'||role.includes('chef d agres'));
    });
  });
}
function findActiveVehicleConflict(engin,excludeId){
  const key=nm(engin);
  if(!key)return null;
  return getActiveOperationalInterventions(excludeId).find(function(iv){
    return interventionVehicleNames(iv).some(function(name){return nm(name)===key;});
  })||null;
}
function findActivePersonnelConflict(login,excludeId){
  if(!login)return null;
  return getActiveOperationalInterventions(excludeId).find(function(iv){
    return interventionActivePersonnelLogins(iv).includes(login);
  })||null;
}
function findActiveChiefConflict(login,excludeId){
  return findActivePersonnelConflict(login,excludeId);
}
function operationalConflictLabel(iv){
  if(!iv)return '';
  return interventionDisplayCallNumber(iv)+' — '+(iv.n||'')+(iv.com?' ('+iv.com+')':'');
}
function showOperationalConflict(kind,value,iv){
  const isVehicle=kind==='vehicle';
  const user=!isVehicle&&USERS.find(function(agent){return agent.l===value;});
  const label=isVehicle?value:(user?fullName(user):value);
  const message=isVehicle
    ?'Le véhicule '+label+' est déjà engagé sur '+operationalConflictLabel(iv)+'. Clôturez cette intervention avant de réutiliser ce véhicule.'
    :'L’agent '+label+' est déjà engagé sur '+operationalConflictLabel(iv)+'. Un membre du personnel ne peut pas être affecté à plusieurs véhicules en même temps.';
  showToast(message,'warn');
}
function validateOperationalDeparture(iv,engin1,engin2,personnelLogins){
  const vehicleNames=[engin1,engin2].filter(Boolean);
  if(vehicleNames.length>1&&nm(vehicleNames[0])===nm(vehicleNames[1])){
    return {kind:'vehicle',value:vehicleNames[0],iv:iv,sameDeparture:true};
  }
  for(const engin of vehicleNames){
    const vehicleConflict=findActiveVehicleConflict(engin,iv&&iv.id);
    if(vehicleConflict)return {kind:'vehicle',value:engin,iv:vehicleConflict};
  }
  const personnel=(personnelLogins||[]).filter(Boolean);
  const duplicateLogin=personnel.find(function(login,index){return personnel.indexOf(login)!==index;});
  if(duplicateLogin)return {kind:'personnel',value:duplicateLogin,iv:iv,sameDeparture:true};
  const uniquePersonnel=[...new Set(personnel)];
  for(const login of uniquePersonnel){
    const personnelConflict=findActivePersonnelConflict(login,iv&&iv.id);
    if(personnelConflict)return {kind:'personnel',value:login,iv:personnelConflict};
  }
  return null;
}
function getEnginsOccupes(){
  // Inclut les engins principaux et secondaires encore engagés, y compris
  // lorsque l'intervention a été créée un jour précédent.
  return [...new Set(getActiveOperationalInterventions().flatMap(interventionVehicleNames))];
}
function getPiquetsEngin(engin){
  // Piquets ASTR du jour pour cet engin
  const mon=getMondayOfWeek(0);
  const wk=weekKey(mon);
  const jourAuj=JOURS_FULL[new Date().getDay()?new Date().getDay()-1:6];
  return (PIQUETS[wk]||[]).filter(p=>p.engin===engin&&p.jour===jourAuj);
}
function rEgrid(){
  const eg=document.getElementById('eg');
  if(!eg)return;
  const occupes=getEnginsOccupes();
  eg.innerHTML=ASTR_CONFIG.engins.map(engin=>{
    const occupe=occupes.some(function(name){return nm(name)===nm(engin);});
    const piquets=getPiquetsEngin(engin);
    const agentsPiquet=piquets.map(p=>{
      const ca=USERS.find(u=>u.l===p.chefAgres);
      const co=USERS.find(u=>u.l===p.conducteur);
      return [ca?ca.nom:'?',co?co.nom:'?'].join('/');
    }).join(', ');
    const tooltip=occupe?'Engin en intervention':agentsPiquet?`Piquet: ${agentsPiquet}`:'';
    return `<div class="ec${occupe?' ec-occupe':''}" onclick="sE(this,'${engin}')" title="${tooltip}" ${occupe?'style="opacity:.4;cursor:not-allowed;"':''}>
      ${engin}
      ${agentsPiquet?`<div style="font-size:9px;color:var(--t2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70px;">${agentsPiquet}</div>`:''}
      ${occupe?'<div style="font-size:9px;color:#E24B4A;">⛔ En cours</div>':''}
    </div>`;
  }).join('');
}
let _routeDraggedId='';
let _routeTouchDrag=null;

function sortRouteSelection(sel){
  return (sel||[]).map(function(iv,index){return {iv:iv,index:index};}).sort(function(a,b){
    const ao=Number(a.iv&&a.iv._routeOrder),bo=Number(b.iv&&b.iv._routeOrder);
    const av=Number.isFinite(ao)&&ao>0?ao:999999;
    const bv=Number.isFinite(bo)&&bo>0?bo:999999;
    if(av!==bv)return av-bv;
    // Repli pour les anciennes sélections sans _routeOrder : conserver
    // l'ordre chronologique dans lequel les interventions ont été choisies.
    const as=(a.iv&&a.iv.tl||[]).filter(function(entry){return entry&&entry.s==='selectionne'&&entry.h;}).map(function(entry){return String(entry.h);}).pop()||'';
    const bs=(b.iv&&b.iv.tl||[]).filter(function(entry){return entry&&entry.s==='selectionne'&&entry.h;}).map(function(entry){return String(entry.h);}).pop()||'';
    if(as&&bs&&as!==bs)return as.localeCompare(bs);
    return a.index-b.index;
  }).map(function(item){return item.iv;});
}

function captureRouteViewPosition(){
  const list=document.getElementById('pl2');
  return {listTop:list?list.scrollTop:0,windowX:window.scrollX||0,windowY:window.scrollY||0};
}

function restoreRouteViewPosition(position){
  if(!position)return;
  requestAnimationFrame(function(){
    const list=document.getElementById('pl2');
    if(list)list.scrollTop=position.listTop||0;
    window.scrollTo(position.windowX||0,position.windowY||0);
  });
}

function rPL(sel,position){
  const viewPosition=position||captureRouteViewPosition();
  const ordered=sortRouteSelection(sel);
  rEgrid();
  const list=document.getElementById('pl2');
  if(!list)return;
  list.innerHTML=ordered.map(function(iv,i){
    const pilp=iv._isPilp||String(iv.id||'').startsWith('PILP');
    return `<div class="pi" data-route-id="${escHtml(iv.id)}" ondragover="routeDragOver(event)" ondragleave="routeDragLeave(event)" ondrop="routeDrop(event)">
      <button type="button" class="pdrag" draggable="true" ondragstart="routeDragStart(event)" ondragend="routeDragEnd(event)" onpointerdown="routePointerDown(event)" title="Glisser pour modifier l'ordre" aria-label="Déplacer l'intervention ${i+1}">⠿</button>
      <div class="pnum">${i+1}</div><div class="pinfo"><div class="pn2">${pilp?'&#x1F3AF; ':''} ${escHtml(iv.n)}</div><div class="pa2">${escHtml(iv.addr||iv.com)} — ${escHtml(iv.com)}</div></div>
      <div class="pmv"><button type="button" onclick="mvU(${i})" ${i===0?'disabled':''} title="Monter">▲</button><button type="button" onclick="mvD(${i})" ${i===ordered.length-1?'disabled':''} title="Descendre">▼</button></div></div>`;
  }).join('');
  restoreRouteViewPosition(viewPosition);
}
function getSelMixte(){
  const norm=IVS.filter(iv=>isTdy(iv)&&iv.s==='selectionne'&&iv.agr===CU.l&&!parcConfirmed.has(iv.id)&&!iv._isPilip);
  const pilp=isTireurPILP()?PILP_IVS.filter(iv=>iv.s==='selectionne'&&iv.agr===CU.l&&!parcConfirmed.has(iv.id)):[];
  return sortRouteSelection([...norm,...pilp]);
}

function persistRouteOrder(ordered,position){
  if(!ordered||!ordered.length)return;
  const batch=ordered.map(function(iv){return iv._routeBatchId;}).find(Boolean)||('ROUTE_'+String(Date.now())+'_'+(CU&&CU.l||''));
  const stamp=getH(N());
  ordered.forEach(function(iv,index){
    iv._routeBatchId=batch;
    iv._routeOrder=index+1;
    iv._routeOrderUpdatedAt=stamp;
  });
  if(CD()){
    CD().ivs=IVS;
    CD().pilpIvs=PILP_IVS;
  }
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  rPL(ordered,position||captureRouteViewPosition());
}

function getSelPilp(){
  return sortRouteSelection(PILP_IVS.filter(function(iv){return iv.s==='selectionne'&&iv.agr===CU.l&&!parcConfirmed.has(iv.id);}));
}
function rPLPilp(sel){
  const ordered=sortRouteSelection(sel),list=document.getElementById('pilp-pl2');if(!list)return;
  list.innerHTML=ordered.map(function(iv,index){
    return '<div class="pi" data-route-id="'+escHtml(iv.id)+'" draggable="true" ondragstart="pilpRouteDragStart(event,\''+iv.id+'\')" ondragover="event.preventDefault()" ondrop="pilpRouteDrop(event,\''+iv.id+'\')">'
      +'<button type="button" class="pdrag" title="Glisser pour modifier l\'ordre">⠿</button>'
      +'<div class="pnum">'+(index+1)+'</div><div class="pinfo"><div class="pn2">🎯 '+escHtml(iv.n)+'</div><div class="pa2">'+escHtml(iv.addr||iv.com)+' — '+escHtml(iv.com)+'</div></div>'
      +'<div class="pmv"><button type="button" onclick="mvPilp('+index+','+(index-1)+')" '+(index===0?'disabled':'')+' title="Monter">▲</button><button type="button" onclick="mvPilp('+index+','+(index+1)+')" '+(index===ordered.length-1?'disabled':'')+' title="Descendre">▼</button></div></div>';
  }).join('');
}
function persistPilpRouteOrder(ordered){
  if(!ordered.length)return;
  const batch=ordered.map(function(iv){return iv._routeBatchId;}).find(Boolean)||('PILP_ROUTE_'+Date.now()+'_'+(CU&&CU.l||''));
  const stamp=getH(N());
  ordered.forEach(function(iv,index){iv._routeBatchId=batch;iv._routeOrder=index+1;iv._routeOrderUpdatedAt=stamp;});
  if(CD())CD().pilpIvs=PILP_IVS;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rPLPilp(ordered);rPilp();
}
function mvPilp(sourceIndex,destinationIndex){
  const selected=getSelPilp();
  if(destinationIndex<0||destinationIndex>=selected.length||sourceIndex===destinationIndex)return;
  const moved=selected.splice(sourceIndex,1)[0];selected.splice(destinationIndex,0,moved);persistPilpRouteOrder(selected);
}
let _pilpDraggedRouteId='';
function pilpRouteDragStart(event,id){_pilpDraggedRouteId=id;if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}
function pilpRouteDrop(event,targetId){
  event.preventDefault();
  const selected=getSelPilp(),from=selected.findIndex(function(iv){return iv.id===_pilpDraggedRouteId;}),to=selected.findIndex(function(iv){return iv.id===targetId;});
  _pilpDraggedRouteId='';if(from<0||to<0||from===to)return;
  const moved=selected.splice(from,1)[0];selected.splice(to,0,moved);persistPilpRouteOrder(selected);
}
function confirmerSelPilp(){
  const selected=getSelPilp();if(!selected.length)return;
  persistPilpRouteOrder(selected);selected.forEach(function(iv){parcConfirmed.add(iv.id);});rPilp();
  showToast('Tournée PILP confirmée : l’ordre reste visible sur chaque intervention.','success');
}
function optPilp(){
  const selected=getSelPilp();if(selected.length<=2)return;
  const base=[50.508,2.548];let remaining=selected.slice(),result=[],current=base;
  while(remaining.length){let best=null,distance=Infinity;remaining.forEach(function(iv){const coords=gc(iv.com),value=dst(current,coords);if(value<distance){distance=value;best=iv;}});result.push(best);remaining=remaining.filter(function(iv){return iv.id!==best.id;});current=gc(best.com);}
  persistPilpRouteOrder(result);
}
function vpPilp(){
  PILP_IVS.filter(function(iv){return iv.s==='selectionne'&&iv.agr===CU.l;}).forEach(function(iv){iv.s='en-attente';iv.agr=null;delete iv._routeBatchId;delete iv._routeOrder;pushTL(iv,'en-attente',CU.l);});
  parcConfirmed.clear();saveData(true);rPilp();
}

function mvU(i){
  const s=getSelMixte();if(i<=0||i>=s.length)return;
  const position=captureRouteViewPosition();
  [s[i-1],s[i]]=[s[i],s[i-1]];
  persistRouteOrder(s,position);
}
function mvD(i){
  const s=getSelMixte();if(i<0||i>=s.length-1)return;
  const position=captureRouteViewPosition();
  [s[i],s[i+1]]=[s[i+1],s[i]];
  persistRouteOrder(s,position);
}

function clearRouteDropIndicators(){
  document.querySelectorAll('#pl2 .pi').forEach(function(row){row.classList.remove('route-drop-before','route-drop-after','route-dragging');});
}
function routeDragStart(event){
  const row=event.currentTarget.closest('.pi');
  _routeDraggedId=row&&row.dataset.routeId||'';
  if(!_routeDraggedId){event.preventDefault();return;}
  row.classList.add('route-dragging');
  if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',_routeDraggedId);}
}
function routeDragOver(event){
  if(!_routeDraggedId)return;
  event.preventDefault();
  const row=event.currentTarget;
  if(!row||row.dataset.routeId===_routeDraggedId)return;
  document.querySelectorAll('#pl2 .pi').forEach(function(item){item.classList.remove('route-drop-before','route-drop-after');});
  const after=event.clientY>row.getBoundingClientRect().top+row.offsetHeight/2;
  row.classList.add(after?'route-drop-after':'route-drop-before');
  if(event.dataTransfer)event.dataTransfer.dropEffect='move';
}
function routeDragLeave(event){
  const row=event.currentTarget;
  if(row&&event.relatedTarget&&!row.contains(event.relatedTarget))row.classList.remove('route-drop-before','route-drop-after');
}
function routeDrop(event){
  event.preventDefault();
  const row=event.currentTarget;
  const targetId=row&&row.dataset.routeId||'';
  const after=!!row&&event.clientY>row.getBoundingClientRect().top+row.offsetHeight/2;
  moveRouteIntervention(_routeDraggedId,targetId,after);
  routeDragEnd();
}
function routeDragEnd(){
  _routeDraggedId='';
  clearRouteDropIndicators();
}
function moveRouteIntervention(draggedId,targetId,after){
  if(!draggedId||!targetId||draggedId===targetId)return;
  const ordered=getSelMixte();
  const from=ordered.findIndex(function(iv){return iv.id===draggedId;});
  if(from<0)return;
  const moved=ordered.splice(from,1)[0];
  let target=ordered.findIndex(function(iv){return iv.id===targetId;});
  if(target<0)return;
  if(after)target+=1;
  ordered.splice(target,0,moved);
  persistRouteOrder(ordered,captureRouteViewPosition());
}

function routePointerDown(event){
  if(event.pointerType==='mouse'||event.button!==0)return;
  const row=event.currentTarget.closest('.pi');
  if(!row)return;
  _routeTouchDrag={id:row.dataset.routeId,startY:event.clientY,moved:false,handle:event.currentTarget,pointerId:event.pointerId};
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch(e){}
}
function routePointerMove(event){
  const state=_routeTouchDrag;
  if(!state||event.pointerId!==state.pointerId)return;
  if(!state.moved&&Math.abs(event.clientY-state.startY)<6)return;
  state.moved=true;event.preventDefault();
  const list=document.getElementById('pl2');
  const dragged=list&&[...list.querySelectorAll('.pi')].find(function(row){return row.dataset.routeId===state.id;});
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('#pl2 .pi');
  if(!list||!dragged||!target||target===dragged)return;
  dragged.classList.add('route-dragging');
  const after=event.clientY>target.getBoundingClientRect().top+target.offsetHeight/2;
  list.insertBefore(dragged,after?target.nextSibling:target);
  const bounds=list.getBoundingClientRect();
  if(event.clientY<bounds.top+34)list.scrollTop-=14;
  else if(event.clientY>bounds.bottom-34)list.scrollTop+=14;
}
function routePointerEnd(event){
  const state=_routeTouchDrag;
  if(!state||event.pointerId!==state.pointerId)return;
  _routeTouchDrag=null;
  try{state.handle.releasePointerCapture(state.pointerId);}catch(e){}
  if(!state.moved){clearRouteDropIndicators();return;}
  const current=getSelMixte();
  const byId=new Map(current.map(function(iv){return [iv.id,iv];}));
  const ordered=[...document.querySelectorAll('#pl2 .pi')].map(function(row){return byId.get(row.dataset.routeId);}).filter(Boolean);
  clearRouteDropIndicators();
  if(ordered.length===current.length)persistRouteOrder(ordered,captureRouteViewPosition());
}
document.addEventListener('pointermove',routePointerMove,{passive:false});
document.addEventListener('pointerup',routePointerEnd);
document.addEventListener('pointercancel',routePointerEnd);

function opt(){
  const s=getSelMixte();
  if(s.length<=2)return;
  const base=[50.508,2.548];let rem=[...s],res=[],cur=base;
  while(rem.length){let best=null,bd=Infinity;rem.forEach(iv=>{const c=gc(iv.com),d=dst(cur,c);if(d<bd){bd=d;best=iv;}});res.push(best);rem=rem.filter(v=>v.id!==best.id);cur=gc(best.com);}
  persistRouteOrder(res,captureRouteViewPosition());
}
function confirmerSel(){
  const selected=getSelMixte();
  if(!selected.length)return;
  persistRouteOrder(selected,captureRouteViewPosition());
  selected.forEach(function(iv){parcConfirmed.add(iv.id);});
  rI();
  showToast('Tourn\u00e9e confirm\u00e9e : l\u2019ordre reste visible sur chaque intervention.','success');
}
function sE(el,e){
  if(getEnginsOccupes().includes(e)){
    showBlockModal({id:'engin',n:`L'engin ${e} est déjà en intervention.`,com:''});
    return;
  }
  document.querySelectorAll('#eg .ec').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel');
  selEng=e;
}
function vp(){
  IVS.filter(iv=>isTdy(iv)&&iv.s==='selectionne'&&iv.agr===CU.l).forEach(iv=>{iv.s='en-attente';iv.agr=null;delete iv._routeBatchId;delete iv._routeOrder;pushTL(iv,'en-attente',CU.l);});
  if(isTireurPILP())PILP_IVS.filter(iv=>iv.s==='selectionne'&&iv.agr===CU.l).forEach(iv=>{iv.s='en-attente';iv.agr=null;delete iv._routeBatchId;delete iv._routeOrder;pushTL(iv,'en-attente',CU.l);});
  selEng=null;parcConfirmed.clear();document.querySelectorAll('#eg .ec').forEach(c=>c.classList.remove('sel'));saveData(true);rI();
}

