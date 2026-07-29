// === MODULE: interventions.js ===
// ────────────────── INTERVENTIONS ──────────────────
function rIPostUpdate(){rStatsHeader();}
function sf(f,btn){flt=f;document.querySelectorAll('#tab-interv .fb').forEach(b=>b.classList.remove('active'));btn.classList.add('active');rI();}
function pushTL(iv,s,who,note){
  if(!iv.tl)iv.tl=[];
  const entry=mkTL(s,getH(N()),who);
  if(note)entry.note=note;
  iv.tl.push(entry);
}

// Les administrateurs doivent voir les corrections horaires même lorsque leur
// mode d'administration est désactivé. On contrôle donc ici le rôle du compte,
// et non l'état temporaire du bouton "pouvoir administrateur".
function hasAdministrativeAccount(){
  if(!CU)return false;
  return GLOBAL_ROLE==='superadmin'||CU.role==='superadmin'||CU._isSA===true||
    (Array.isArray(CU.rights)&&CU.rights.includes('Administration'));
}

function assignInterventionRoute(iv,login){
  if(!iv||!login)return;
  const active=IVS.filter(function(x){
    return x.id!==iv.id&&x.agr===login&&['selectionne','en-cours'].includes(x.s);
  });
  let batch=active.map(function(x){return x._routeBatchId;}).find(Boolean);
  if(!batch)batch='ROUTE_'+String(Date.now())+'_'+login;
  const sameBatch=IVS.filter(function(x){return x._routeBatchId===batch;});
  const maxOrder=sameBatch.reduce(function(max,x){return Math.max(max,Number(x._routeOrder)||0);},0);
  iv._routeBatchId=batch;
  if(!iv._routeOrder)iv._routeOrder=maxOrder+1;
}

function prepareInterventionRoute(iv){
  if(!iv)return;
  assignInterventionRoute(iv,iv.agr||CU.l);
  const login=iv.agr||CU.l;
  const active=IVS.filter(function(x){
    return x.agr===login&&['selectionne','en-cours'].includes(x.s);
  });
  active.forEach(function(x){assignInterventionRoute(x,login);});
}

function isFirstInterventionOfRoute(iv){
  if(!iv||!iv._routeBatchId)return true;
  const route=IVS.filter(function(x){return x._routeBatchId===iv._routeBatchId;});
  if(route.length<2)return true;
  const first=route.slice().sort(function(a,b){
    return (Number(a._routeOrder)||9999)-(Number(b._routeOrder)||9999);
  })[0];
  return !!first&&first.id===iv.id;
}

function interventionCrewSignature(iv,equipage1,equipage2){
  const members=[].concat(equipage1||iv&&iv._equipage1||[],equipage2||iv&&iv._equipage2||[])
    .map(function(member){return member&&member.login||'';}).filter(Boolean);
  if(iv&&iv.agr)members.push(iv.agr);
  if(iv&&iv._agr2)members.push(iv._agr2);
  return [...new Set(members)].sort().join('|');
}

function canEditInterventionStart(iv){
  if(!iv||!CU)return false;
  if(hasAdministrativeAccount())return true;
  if(iv._startLockedByChain===true)return false;
  const own=isInterventionReportChef(iv,CU.l);
  return own&&!iv._crValide&&isFirstInterventionOfRoute(iv);
}

function interventionAddressLabel(iv){
  return [iv&&iv.addr,iv&&iv.com].filter(Boolean).join(', ');
}

function isInterventionReportChef(iv,login){
  if(!iv||!login)return false;
  if(iv.agr===login||iv._agr2===login)return true;
  return [iv._equipage1,iv._equipage2].some(function(equipage){
    return Array.isArray(equipage)&&equipage.some(function(member){
      if(!member||member.login!==login)return false;
      const role=String(member.role||'').toLowerCase();
      return role==='ca'||role.includes('chef d')&&role.includes('agr');
    });
  });
}

const _pendingNextInterventionStarts={};

// === P8 : Fonction de rendu dédiée (évite XSS + facilite les tests) ===
/**
 * Génère le HTML d'une ligne d'intervention pour la liste.
 * Toutes les données utilisateur passent par escHtml().
 * @param {object} iv - Objet intervention
 * @param {boolean} ag - L'utilisateur est chef d'agrès
 * @param {boolean} tireur - L'utilisateur est tireur PILP
 * @returns {string} HTML de la ligne
 */
function renderInterventionRow(iv, ag, tireur) {
  const STATUS_BADGE = {
    'en-attente':['br','En attente'],
    'selectionne':['bsel','Sélect.'],
    'en-cours':['ba','En cours'],
    'terminee':['bg2','Terminée'],
  };
  const [bc, bt] = STATUS_BADGE[iv.s] || ['bgr', '—'];
  const isPilp = iv.id.startsWith('PILP');
  const isRenfortUT = iv._isRenfort === true;
  const chkShow = (ag || tireur) && !isRenfortUT && (iv.s === 'en-attente' || (iv.s === 'selectionne' && iv.agr === CU.l));
  const checked = iv.s === 'selectionne' && iv.agr === CU.l;
  const onchg = isPilp ? `toggleChkPilp('${iv.id}',this)` : `toggleChk('${iv.id}',this)`;
  const onclick = isPilp ? `oPilp('${iv.id}')` : `oM('${iv.id}')`;

  const numBadges = iv.s === 'terminee' ? (
    iv._isRenfort
      ? (iv._numGlobal || iv._numRenfort
          ? ` · ${iv._numGlobal ? `<span style="color:#1A6B1A;font-weight:600;font-size:10px;">C:${escHtml(String(iv._numGlobal))}</span> ` : ''}${iv._numRenfort ? `<span style="color:#7C3AED;font-weight:600;font-size:10px;">Renfort:${escHtml(String(iv._numRenfort))}</span>` : ''}` : '')
      : (iv._numGlobal || iv._numCaserne || iv._numMois
          ? ` · <span style="font-size:10px;">${iv._numGlobal ? `<span style="color:#1A6B1A;font-weight:600;">C:${escHtml(String(iv._numGlobal))}</span> ` : ''}${iv._numCaserne ? `<span style="color:#6A0DAD;font-weight:600;">UT:${escHtml(String(iv._numCaserne))}</span> ` : ''}${iv._numMois ? `<span style="color:#C0392B;font-weight:600;">M:${escHtml(String(iv._numMois))}</span>` : ''}${iv._numSDIS ? ` <span style="color:#003399;font-weight:600;">S:${escHtml(String(iv._numSDIS))}</span>` : ''}</span>` : '')
  ) : '';

  return `<div class="ivr ${iv.s}${isPilp ? ' pilp' : ''}${isRenfortUT ? ' renfort-ut' : ''}${iv._urgence ? ' urgence' : ''}">
    ${chkShow ? `<div class="ivr-chk"><input type="checkbox" ${checked ? 'checked' : ''} onchange="${onchg}"/></div>` : ''}
    <div class="ivrl" onclick="${onclick}">
      <div class="ivrh">&#x1F4C5; ${(iv.h || '').slice(0, 8)}${isRenfortUT ? ' <span style="background:#7C3AED;color:#fff;border-radius:4px;padding:0 5px;font-size:9px;font-weight:700;margin-left:4px;">RENFORT UT</span>' : ''}</div>
      <div class="ivrn">${isPilp ? '&#x1F3AF; ' : ''}${escHtml(iv.n)}${isRenfortUT ? ` <span style="font-size:10px;color:#7C3AED;font-weight:400;">— ${escHtml(iv._caserneSourceNom || '')}</span>` : ''}${iv._avisPassage ? ' <span style="background:#9B59B6;color:#fff;border-radius:4px;padding:0 5px;font-size:9px;font-weight:700;margin-left:4px;">🟣 Avis passage</span>' : ''}</div>
      <div class="ivrc">&#x1F4CD; ${escHtml(interventionAddressLabel(iv))}${iv.eng ? ' · ' + escHtml(iv.eng) : ''}${isRenfortUT && iv._hDebut ? ' · depuis ' + escHtml(iv._hDebut) : ''}${numBadges}</div>
    </div>
    <div class="ivrr" onclick="${onclick}">
      <span class="bdg ${bc}">${bt}</span>
      ${isPilp ? '<span class="bdg bpilp" style="font-size:10px;">PILP</span>' : ''}
      ${isRenfortUT ? '<span class="bdg" style="background:#7C3AED;color:#fff;font-size:10px;">Renfort UT</span>' : ''}
      ${iv._urgence ? '<span class="bdg" style="background:#B91C1C;color:#fff;font-size:10px;font-weight:700;">🚨 URGENCE ERP</span>' : ''}
      ${iv._sdis ? '<span class="bdg" style="background:#1D4ED8;color:#fff;font-size:10px;font-weight:700;">SDIS</span>' : ''}
      ${iv._heureDebutModifiee&&hasAdministrativeAccount() ? '<span class="bdg" title="Heure de début corrigée — consulter la traçabilité" style="background:#FFF7ED;color:#9A3412;border:1px solid #FDBA74;font-size:10px;font-weight:700;">&#x23F1; Heure corrigée</span>' : ''}
      ${iv._echelleToiture ? '<span class="bdg" style="background:#F59E0B;color:#fff;font-size:10px;">Echelle de toit</span>' : ''}
      ${iv._epa ? '<span class="bdg" style="background:#8E44AD;color:#fff;font-size:10px;">EPA</span>' : ''}
      ${iv.rappels ? `<span class="bdg bp" style="font-size:10px;${isAdminModeActive()?'cursor:pointer;':''}"${isAdminModeActive()?` title="Déjà intervenu ici ?" onclick="event.stopPropagation();showInterventionsLiees('${iv.id}')"`:''}>${iv.rappels}×</span>` : ''}
      ${iv.s === 'terminee' && iv._crValide ? '<span title="Compte rendu validé" style="font-size:12px;">📋✔</span>' : iv.s === 'terminee' && (iv._crTexte || iv._compteRendu) ? '<span title="Compte rendu rédigé" style="font-size:12px;opacity:.6;">📋</span>' : ''}
      ${iv._mailsEnvoyes && iv._mailsEnvoyes.length ? `<span title="Envoyé par mail (${iv._mailsEnvoyes.length}x)" style="font-size:12px;">✉️</span>` : ''}
      ${iv._impressions && iv._impressions.length ? `<span title="Rapport imprimé (${iv._impressions.length}x)" style="font-size:12px;">🖨</span>` : ''}
    </div>
  </div>`;
}

// Tri : en-attente par date asc, autres par dernière action desc
function interventionTerminationSortKey(iv){
  if(!iv)return '';
  const terminaisons=(iv.tl||[]).filter(function(entry){return entry&&entry.s==='terminee'&&entry.h;});
  if(terminaisons.length)return terminaisons.map(function(entry){return entry.h;}).sort()[0];
  const day=String(iv.h||'').slice(0,8);
  const end=String(iv._hFin||'').replace(':','');
  return day+(end?'_'+end:String(iv.h||'').slice(8));
}

function sortedIVS(list){
  return list.sort((a,b)=>{
    // Une urgence ERP n'est prioritaire que tant qu'elle est active.
    // Une fois terminée, elle rejoint le groupe des interventions terminées.
    const urgenceActiveA=!!a._urgence&&a.s!=='terminee';
    const urgenceActiveB=!!b._urgence&&b.s!=='terminee';
    if(urgenceActiveA!==urgenceActiveB)return urgenceActiveA?-1:1;
    const ORDER={'en-attente':0,'selectionne':1,'en-cours':2,'terminee':3,'avis-passage':4};
    const oa=ORDER[a.s]??5,ob=ORDER[b.s]??5;
    if(oa!==ob)return oa-ob;
    if(a.s==='en-attente')return a.h.localeCompare(b.h); // asc
    // Pour les autres : date du dernier changement de statut desc
    const la=a.tl&&a.tl.length?a.tl[a.tl.length-1].h:a.h;
    const lb=b.tl&&b.tl.length?b.tl[b.tl.length-1].h:b.h;
    // Dans le groupe « Terminées », conserver l'ordre chronologique :
    // la dernière intervention clôturée vient s'ajouter en bas du groupe.
    if(a.s==='terminee')return interventionTerminationSortKey(a).localeCompare(interventionTerminationSortKey(b));
    return lb.localeCompare(la); // desc
  });
}

function getRenfortsEnAttente(){
  if(!CURRENT_CASERNE_ID)return[];
  // Lire directement depuis CASERNE_DATA (pas de proxy, toujours à jour)
  const d=CASERNE_DATA[CURRENT_CASERNE_ID];
  return(d&&d.renforts||[]).filter(function(r){return r.statut==='en-attente';});
}
function updateRenfortBadge(){
  const nb=getRenfortsEnAttente().length;
  const badge=document.getElementById('renfort-badge');
  if(badge){badge.textContent=nb;badge.style.display=nb>0?'inline-flex':'none';}
}
function rI(){
  updateRenfortBadge();
  // Afficher les renforts reçus en attente
  const renforts=getRenfortsEnAttente();
  const rz=document.getElementById('renfort-zone');
  if(rz){
    if(renforts.length){
      rz.innerHTML='<div style="background:#F5F3FF;border-radius:12px;padding:12px;margin-bottom:12px;border:2px solid #DDD6FE;">'
        +'<div style="font-size:13px;font-weight:700;color:#7C3AED;margin-bottom:8px;">&#x1F4E2; Demandes de renfort reçues ('+renforts.length+')</div>'
        +renforts.map(function(r){
          const src=CASERNES.find(function(c){return c.id===r.caserneSource;});
          return '<div style="background:#fff;border-radius:8px;padding:10px;margin-bottom:6px;border:1px solid #DDD6FE;">'
            +'<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:4px;">'
            +'<span style="font-size:12px;font-weight:600;color:#7C3AED;">'+(r.type==='complet'?'&#x1F692; Renfort complet':'&#x1F465; Renfort personnel')+'</span>'
            +'<span style="font-size:11px;background:var(--bg);border-radius:6px;padding:2px 8px;">De : <strong>'+(src?src.nom:r.caserneSource)+'</strong></span>'
            +'<span style="font-size:10px;color:var(--t2);">'+r.hDemande+'</span>'
            +'</div>'
            +'<div style="font-size:12px;margin-bottom:4px;">'+r.ivNature+' — <strong>'+r.ivCommune+'</strong>'+(r.ivAdresse?' · '+r.ivAdresse:'')+'</div>'
            +(r.note?'<div style="font-size:11px;color:var(--t2);margin-bottom:6px;">'+r.note+'</div>':'')
            +'<div style="display:flex;gap:6px;">'
            +'<button class="btn sm" style="background:#3B6D11;color:#fff;" onclick="repondreRenfort(\''+CURRENT_CASERNE_ID+'\',\''+r.id+'\',\'accepte\')">✅ Accepter</button>'
            +'<button class="btn sm" style="color:#E24B4A;" onclick="repondreRenfort(\''+CURRENT_CASERNE_ID+'\',\''+r.id+'\',\'refuse\')">❌ Refuser</button>'
            +'</div></div>';
        }).join('')+'</div>';
    } else {
      rz.innerHTML='';
    }
  }
  const ag=isAgres(),chef=isChef()||hasRight('Administration');
  const ti=IVS.filter(iv=>isTdy(iv)&&!iv._isPilip);
  document.getElementById('nb1').textContent=ti.filter(iv=>iv.s==='en-attente').length;
  document.getElementById('nb2s').textContent=ti.filter(iv=>iv.s==='selectionne').length;
  document.getElementById('nb2').textContent=IVS.filter(iv=>iv._avisEnAttente&&!iv._isPilip&&iv.s!=='annulee').length;
  document.getElementById('nb3').textContent=ti.filter(iv=>iv.s==='en-cours').length;
  const isTermAuj=iv=>iv.s==='terminee'&&iv.tl&&iv.tl.some(t=>t.s==='terminee'&&(t.h||'').startsWith(TDP));
  document.getElementById('nb4').textContent=IVS.filter(iv=>!iv._isPilip&&(isTdy(iv)?iv.s==='terminee':isTermAuj(iv))).length;

  // Avis de passage EN ATTENTE DE RAPPEL — interventions terminées où l'équipe a
  // laissé un avis (requérant absent). Reste affiché jusqu'au rappel du requérant.
  const avis=IVS.filter(iv=>!iv._isPilip&&iv._avisEnAttente&&iv.s!=='annulee');
  const as=document.getElementById('avsec');document.getElementById('avc').textContent=avis.length;
  if(avis.length){
    as.style.display='block';
    const avExpanded=as.dataset.expanded==='1';
    document.getElementById('avl').innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;">
        <span style="font-size:12px;color:var(--pur);font-weight:500;">&#x1F7E3; ${avis.length} avis de passage — cliquer pour développer</span>
        <button class="btn sm" style="font-size:11px;padding:3px 10px;" onclick="toggleAvisIVS(this)">${avExpanded?'▲ Réduire':'▼ Voir tous'}</button>
      </div>
      <div id="av-detail" style="display:${avExpanded?'block':'none'};">
        ${avis.map(iv=>`<div class="ivr avis-passage" onclick="oM('${iv.id}')">
          <div class="ivrl"><div class="ivrh">&#x1F4C5; ${escHtml(iv.h.slice(0,8))}</div><div class="ivrn">${escHtml(iv.n)}</div><div class="ivrc">&#x1F4CD; ${escHtml(interventionAddressLabel(iv))}${iv.rappels?' · '+Number(iv.rappels)+' rappel(s)':''}</div></div>
          <div class="ivrr"><span class="bdg bp">Avis passage</span></div></div>`).join('')}
      </div>`;
  } else as.style.display='none';
  // Panneau tournée
  const tireurP=isTireurPILP();
  const selNonConf=IVS.filter(iv=>isTdy(iv)&&iv.s==='selectionne'&&iv.agr===CU.l&&!parcConfirmed.has(iv.id)&&!iv._isPilip);
  const selPilpNonConf=tireurP?PILP_IVS.filter(iv=>iv.s==='selectionne'&&iv.agr===CU.l&&!parcConfirmed.has(iv.id)):[];
  const selMixte=[...selNonConf,...selPilpNonConf];
  const pp=document.getElementById('pap');
  if((ag||tireurP)&&selMixte.length>0){pp.style.display='block';document.getElementById('pagl').textContent=CU.l;document.getElementById('pac').textContent=selMixte.length;rPL(selMixte);}
  else{pp.style.display='none';rEgrid();}
  // Liste
  const tireur=isTireurPILP();
  // Une intervention est visible si : créée aujourd'hui OU statut actif (quelle que soit la date) OU clôturée aujourd'hui
  const isTermineeAujourdhui=iv=>iv.s==='terminee'&&iv.tl&&iv.tl.some(t=>t.s==='terminee'&&(t.h||'').startsWith(TDP));
  let list=IVS.filter(iv=>(isTdy(iv)||['en-attente','selectionne','en-cours'].includes(iv.s)||isTermineeAujourdhui(iv))&&iv.s!=='avis-passage'&&!iv._isPilip&&iv.s!=='annulee');
  // Si tireur PILP et filtre sélect. ou mes-sel : ajouter aussi les PILP sélectionnées
  let listPilpSel=tireur?PILP_IVS.filter(iv=>iv.s==='selectionne'&&iv.agr===CU.l):[];
  if(flt==='all'){
    // en mode "Tout", on n'ajoute pas les PILP (elles sont dans leur propre menu)
    listPilpSel=[];
  } else if(flt==='mes-sel'){
    list=list.filter(iv=>(iv.s==='selectionne'||iv.s==='en-cours')&&iv.agr===CU.l);
    // listPilpSel : inclure aussi les en-cours PILP
    listPilpSel=tireur?PILP_IVS.filter(iv=>(iv.s==='selectionne'||iv.s==='en-cours')&&iv.agr===CU.l):[];
  } else if(flt==='mes-resp'){
    // Interventions que j'ai sélectionnées, mises en cours ou clôturées (pas juste prise d'appel)
    list=list.filter(iv=>iv.agr===CU.l&&['selectionne','en-cours','terminee'].includes(iv.s)&&!iv._lienPilp);
    listPilpSel=tireur?PILP_IVS.filter(iv=>iv.agr===CU.l&&['selectionne','en-cours','terminee'].includes(iv.s)):[];
  } else if(flt==='selectionne'){
    list=list.filter(iv=>iv.s==='selectionne');
    // on affiche aussi les PILP sélectionnées par le tireur
  } else {
    list=list.filter(iv=>iv.s===flt);
    listPilpSel=[];
  }
  list=sortedIVS(list);
  const combined=[...list,...listPilpSel];
  const cont=document.getElementById('ivl');
  if(!combined.length){cont.innerHTML='<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucune intervention.</div>';return;}
  // P8 : délégation au helper renderInterventionRow (logique + XSS centralisés)
  cont.innerHTML=combined.map(iv=>renderInterventionRow(iv,ag,tireur)).join('');
}

function toggleChk(id,el){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  if(el.checked){
    iv.s='selectionne';iv.agr=CU.l;
    assignInterventionRoute(iv,CU.l);
    pushTL(iv,'selectionne',CU.l,'Ordre de tournée : '+iv._routeOrder);
  }
  else{
    iv.s='en-attente';iv.agr=null;
    delete iv._routeBatchId;delete iv._routeOrder;
    pushTL(iv,'en-attente',CU.l);
  }
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rI(); // push immédiat : changement de statut partagé, sinon la sélection est écrasée au prochain pull
}
function toggleAvisIVS(btn){
  const as=document.getElementById('avsec');
  const expanded=as.dataset.expanded==='1';
  as.dataset.expanded=expanded?'0':'1';
  const detail=document.getElementById('av-detail');
  if(detail)detail.style.display=expanded?'none':'block';
  btn.textContent=expanded?'▼ Voir tous':'▲ Réduire';
}
function toggleAvisPILP(btn){
  const pas=document.getElementById('pilp-avsec');
  const expanded=pas.dataset.expanded==='1';
  pas.dataset.expanded=expanded?'0':'1';
  const detail=document.getElementById('pilp-av-detail');
  if(detail)detail.style.display=expanded?'none':'block';
  btn.textContent=expanded?'▼ Voir tous':'▲ Réduire';
}

// ────────────────── MODAL ──────────────────
function oM(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const ag=isAgres(),chef=isChef()||hasRight('Administration');
  // _showAutoBtn défini globalement pour toute la fonction oM
  const _isOwnAgres_=(iv.agr===CU.l||iv._agr2===CU.l);
  // Autorisation disponible pour toutes les interventions (sauf renforts)
  const _showAutoBtn=(_isOwnAgres_||chef||isAdminModeActive())&&!iv._isRenfort;
  document.getElementById('mt').textContent=iv.n;
    // Seul le numéro APL est affiché (numérotation INT désactivée)
  const dispApl=iv._numApl||iv.id;
  const dispTransfert=iv._transfertDe?` ↩ transféré de ${CASERNES.find(cas=>cas.id===iv._transfertDe)?.nom||iv._transfertDe}`:'';
  document.getElementById('mi').textContent=dispApl+dispTransfert;
  const bm={'en-attente':['br','En attente'],'selectionne':['bsel','Sélectionné'],'en-cours':['ba','En cours'],'terminee':['bg2','Terminée'],'avis-passage':['bp','Avis de passage'],'modif':['bgr','Modification'],'modif-adresse':['bgr','Adresse corrigée'],'modif-heure':['binfo','Heure de début corrigée'],'reclasse':['bgr','Reclasé'],'releve':['binfo','Relève'],'info-compl':['binfo','ℹ️ Complément d\u2019info']};
  const[bc,bt]=bm[iv.s]||['bgr','—'];
  const sdots={'en-attente':'#E24B4A','selectionne':'var(--sel)','en-cours':'var(--amb)','terminee':'var(--grn)','avis-passage':'var(--pur)','modif':'#888','modif-adresse':'#888','modif-heure':'#C2410C','reclasse':'#888','releve':'#0369A1','info-compl':'#0369A1'};
  const tlHtml=(iv.tl||[]).map(t=>`<div class="tl-item"><div class="tl-dot" style="background:${sdots[t.s]||'#aaa'};"></div><div class="tl-info"><span class="tl-status">${bm[t.s]?bm[t.s][1]:t.s}${t.note?` — ${t.note}`:''}</span> <span class="tl-horo">&#x1F4C5; ${t.h}</span><div class="tl-who">${t.who}</div></div></div>`).join('');
  const reclassHtml=(ag&&iv.s==='en-cours')?`<div class="reclass-box">
    <div class="reclass-title">Reclasser la nature</div>
    <select class="fi" id="reclass-sel" style="margin-bottom:8px;">${NAT.map(n=>`<option value="${n.l}"${n.l===iv.n?' selected':''}>${n.l}</option>`).join('')}</select>
    <button class="btn sm" onclick="reclasser('${iv.id}')">✏️ Appliquer</button>
  </div>`:'';
  let actions='';
  if(ag||chef){
    if(iv.s==='en-attente'){
      const dejaPris=iv.agr&&iv.agr!==CU.l;
      const autreAgr=dejaPris?USERS.find(u=>u.l===iv.agr):null;
      const nomAutre=autreAgr?fullName(autreAgr):(iv.agr||'');
      actions=`<div class="brow">
        ${dejaPris
          ?`<button class="btn sel-btn sm" disabled style="opacity:0.5;cursor:not-allowed;">⏳ Sélectionné par ${nomAutre}</button>`
          :`<button class="btn sel-btn sm" onclick="cS('${iv.id}','selectionne')">☑ Sélectionner</button>`
        }
        ${(ag||chef||hasRight('Interventions'))?`<button class="btn sm" style="background:#7C3AED;color:#fff;border-color:#7C3AED;" onclick="showRenfortModal('${iv.id}')">&#x1F4E2; Renfort UT</button>`:''}
        ${chef?`<button class="btn sm" style="color:#E67E22;border-color:#E67E22;" onclick="transfererIV('${iv.id}')">&#x1F500; Transférer</button>`:''}
        ${chef&&iv.n&&(iv.n.toLowerCase().includes('animal')||iv.n.toLowerCase().includes('animaux'))?`<button class="btn sm" style="color:#27AE60;border-color:#27AE60;" onclick="refugeAnimalier('${iv.id}')">&#x1F43E; Refuge animalier</button>`:''}
        ${chef?`<button class="btn sm" style="color:#888;border-color:#ccc;" onclick="annulerIV('${iv.id}')">✕ Annuler</button>`:''}
      </div>`;
    } else if(iv.s==='selectionne'){
      const enCours=agresEnCours();
      const blocage=enCours&&enCours.id!==iv.id;
      // Blocage si l'intervention appartient à un autre chef d'agrès
      const autreAgres=iv.agr&&iv.agr!==CU.l&&!(iv._agr2===CU.l)&&!isAdminModeActive();
      // Sélecteur 2ème chef pour interventions échelle
      const chefPool=sortByGradeThenName(USERS.filter(u=>isChefAgresByGrade(u)&&u.l!==CU.l));
      const agr2Sel=iv._agr2||'';
      const agr2Html=iv._echelleToiture?`
        <div style="margin-top:8px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:10px;">
          <div style="font-size:12px;font-weight:600;color:#92400E;margin-bottom:6px;">&#x1FA9C; 2ème chef d'agrès (optionnel)</div>
          <select class="fi" style="width:100%;" onchange="setAgr2('${iv.id}',this.value)">
            <option value="">— Aucun —</option>
            ${chefPool.map(u=>`<option value="${u.l}"${u.l===agr2Sel?' selected':''}>${fullName(u)} (${gradeAbbr(u.grade)})</option>`).join('')}
          </select>
        </div>`:''
      ;
      actions=`<div class="brow">
        ${autreAgres?`<div style="padding:6px 8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;font-size:12px;color:#991B1B;">🔒 Sélectionnée par ${iv.agr}</div>`:
        `<button class="btn am sm" onclick="cS('${iv.id}','en-cours')"${blocage?' style="opacity:.4;pointer-events:none;" title="Cl&#244;turez d&#39;abord '+enCours.id+'"':''}>▶ En cours</button>
        <button class="btn sm" onclick="cS('${iv.id}','en-attente')">↩ En attente</button>`}
      </div>
      ${agr2Html}
      ${blocage?`<div style="margin-top:8px;padding:8px 10px;background:var(--rl);border:1px solid var(--rd);border-radius:8px;font-size:12px;color:var(--rd);">
        ⛔ Clôturez d'abord <strong>${enCours.id}</strong>
        <button class="btn sm" style="margin-top:6px;background:var(--red);color:#fff;border-color:var(--red);width:100%;" onclick="cM();oM('${enCours.id}')">&#x1F449; Aller clôturer</button>
      </div>`:''}`;
    } else if(iv.s==='en-cours'&&(iv.agr===CU.l||iv._agr2===CU.l||chef)){
      const ds=getDS(N()),hh=pad(N().getHours()),mm2=pad(N().getMinutes());
      const pilpBtn=iv.n==='Nid de frelons asiatiques'?`<button class="btn pilp-btn sm" onclick="showPilpForm('${iv.id}')">&#x1F3AF; PILP</button>`:'';
      const natsEchelle=['Nid de guêpes et frelons','Nid de frelons asiatiques',"Essaim d'abeilles"];
      const echelleBtn=natsEchelle.includes(iv.n)&&!iv._echelleToiture?`<button class="btn sm" style="background:#D35400;color:#fff;border-color:#D35400;" onclick="demandeEchelleToiture('${iv.id}')">&#x1FA9C; Échelle</button>`:'';
      const sdisBtn2=chef&&!iv._sdis?`<button class="btn sm" style="background:#1D4ED8;color:#fff;border-color:#1D4ED8;" onclick="demandeSDIS('${iv.id}')">&#x1F691; SDIS</button>`:'';
      const epaBtn=chef&&!iv._epa?`<button class="btn sm" style="background:#8E44AD;color:#fff;border-color:#8E44AD;" onclick="demandeEPA('${iv.id}')">&#x1F9F0; EPA</button>`:'';
      // Bouton clôture renfort si c'est une IV de renfort UT
      const renfortCloBtn=iv._isRenfort?`<div style="background:#EDE9FE;border-radius:10px;padding:12px;margin-bottom:10px;border:2px solid #7C3AED;">
        <div style="font-size:12px;font-weight:600;color:#7C3AED;margin-bottom:6px;">&#x1F692; Renfort UT — ${iv._caserneSourceNom||''}</div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:8px;">Clôturez votre partie quand votre équipage rentre à la caserne. L'intervention principale reste ouverte chez la caserne demandeuse.</div>
        <button class="btn gn" style="width:100%;" onclick="cloturerRenfort('${CURRENT_CASERNE_ID}','${iv._renfortId}')">&#x2705; Clôturer ma partie renfort</button>
      </div>`:'';
      const _natExclus=["Sauvetage et capture d'animaux","Sauvetage de personne"];
      const _isOwnAgres=(iv.agr===CU.l||iv._agr2===CU.l);
      const _canSeeAuto=_isOwnAgres||chef||isAdminModeActive();
      const autorisationBtn=_showAutoBtn
        ?`<button class="btn sm" style="width:100%;margin-bottom:10px;background:#8E44AD;color:#fff;border-color:#8E44AD;" onclick="showAutorisationModal('${iv.id}')">&#x1F4DD; Autorisation &amp; Attestation</button>`
        :'';
      // Bouton prise en charge animal (sauvetage/capture uniquement)
      const _isAnimal=iv.n&&iv.n.toLowerCase().includes('sauvetage et capture d');
      const _showAnimalBtn=_isAnimal&&(_isOwnAgres||chef||isAdminModeActive())&&!iv._isRenfort;
      const _animalCount=Array.isArray(iv._prisesEnCharge)?iv._prisesEnCharge.length:Array.isArray(iv._animauxAppel)&&iv._animauxAppel.length?iv._animauxAppel.length:(iv._priseEnCharge?1:0);
      const animalBtn=_showAnimalBtn
        ?`<button class="btn sm" style="width:100%;margin-bottom:10px;background:#E67E22;color:#fff;border-color:#E67E22;" onclick="showPriseEnChargeModal('${iv.id}')">&#x1F43E; Prises en charge animaux${_animalCount?' ('+_animalCount+')':''}</button>`
        :'';
      actions=`<div class="clotbox">
        ${renfortCloBtn}
        ${iv._isRenfort?'':`${animalBtn}${autorisationBtn}
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Clôturer l'intervention</div>
        <label class="avislbl"><input type="checkbox" id="chk-av" style="accent-color:var(--pur);"/>&#x1F7E3; Requérant absent — Avis de passage</label>
        ${(iv.agr===CU.l||iv._agr2===CU.l||chef||isAdminModeActive())?`<button class="btn gn" style="width:100%;margin-bottom:10px;" onclick="clot('${iv.id}')">✅ Confirmer la clôture</button>`:`<div style="font-size:12px;color:#991B1B;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px;margin-bottom:10px;">🔒 Clôture réservée au chef d'agrès assigné ou à un administrateur.</div>`}
        <div style="border-top:1px solid var(--brd);padding-top:10px;margin-bottom:6px;">
          <div style="font-size:10px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Gestion de l'équipage</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:5px;">
            <button class="btn sm" style="background:#0369A1;color:#fff;border-color:#0369A1;" onclick="showReleveModal('${iv.id}')">&#x1F504; Relève</button>
            <button class="btn sm" style="background:#0369A1;color:#fff;border-color:#0369A1;" onclick="showRenfortInterneModal('${iv.id}')">&#x1F3E0; Renfort interne</button>
            <button class="btn sm" style="background:#7C3AED;color:#fff;border-color:#7C3AED;" onclick="showRenfortModal('${iv.id}')">&#x1F4E2; Renfort UT</button>
          </div>
        </div>
        ${pilpBtn||echelleBtn||sdisBtn2||epaBtn?`<div style="border-top:1px solid var(--brd);padding-top:10px;margin-top:4px;">
          <div style="font-size:10px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Intervention / Renfort SDIS</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:5px;">
            ${pilpBtn}${echelleBtn}${sdisBtn2}${epaBtn}
          </div>
        </div>`:''}`}
      </div>
      <div class="brow" style="margin-top:8px;">${iv._isRenfort?'':`<button class="btn sm danger" onclick="cS('${iv.id}','en-attente')">↩ Remettre en attente</button>`}</div>`;
    }
  }
  if((chef||isAgres())&&iv.s==='avis-passage'){
    const canCloseAvis=isChefCentre()||hasRight('Administration');
    const ds=getDS(N()),hh=pad(N().getHours()),mm2=pad(N().getMinutes());
    // Bouton reprendre — visible pour le chef d'agrès qui avait l'intervention
    if(iv.agr===CU.l||isAgres()||chef){
      actions+=`<div class="clotbox" style="margin-top:10px;background:#EFF6FF;border:1px solid #BFDBFE;">
        <div style="font-size:12px;font-weight:600;color:#1D4ED8;margin-bottom:8px;">🔄 Reprendre cette intervention</div>
        <button class="btn bl" style="width:100%;" onclick="cS('${iv.id}','en-cours')">▶ Remettre en cours</button>
      </div>`;
    }
    if(canCloseAvis){
      actions+=`<div class="clotbox" style="margin-top:10px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Clôturer l'avis de passage</div>
        <button class="btn gn" style="width:100%;" onclick="clotAvis('${iv.id}')">✅ Clôturer définitivement</button>
      </div>`;
    } else {
      actions+=`<div class="clotbox" style="margin-top:10px;background:var(--rl);border:1px solid var(--rd);">
        <div style="font-size:12px;color:var(--rd);">&#x1F512; La clôture définitive des avis de passage est réservée au chef de centre.</div>
      </div>`;
    }
  }
  document.getElementById('mb').innerHTML=`
    <div style="margin-bottom:8px;"><span class="bdg ${bc}">${bt}</span>${iv.rappels?` <span class="bdg bp" style="${isAdminModeActive()?'cursor:pointer;':''}"${isAdminModeActive()?` title="Déjà intervenu ici ?" onclick="showInterventionsLiees('${iv.id}')"`:''}>${iv.rappels} rappel(s)</span>`:''}</div>
    ${iv._urgence?'<div style="background:#FEE2E2;border:2px solid #B91C1C;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:800;color:#991B1B;margin-bottom:10px;text-align:center;">🚨 URGENCE — ÉTABLISSEMENT RECEVANT DU PUBLIC (ERP)</div>':''}
    ${iv._sdis?'<div style="background:#DBEAFE;border:1px solid #93C5FD;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;color:#1D4ED8;margin-bottom:10px;text-align:center;">&#x1F691; INTERVENTION SDIS</div>':''}
    ${iv._avisPassage?'<div style="background:#F3EAF8;border:2px solid #9B59B6;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;color:#6C3483;margin-bottom:10px;text-align:center;">🟣 Un avis de passage a été laissé pour cette intervention</div>':''}
    ${iv._echelleToiture?'<div style="background:#FEF3C7;border:2px solid #F59E0B;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:700;color:#92400E;margin-bottom:10px;text-align:center;">&#x26A0;&#xFE0F; INTERVENTION À FAIRE AVEC ÉCHELLE DE TOIT</div>':''}
    ${iv._epa?'<div style="background:#F3EAF8;border:2px solid #8E44AD;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:700;color:#6C3483;margin-bottom:10px;text-align:center;">&#x1F9F0; INTERVENTION À FAIRE AVEC EPA</div>':''}
    <div class="mr"><div class="ml">Adresse</div><div class="mv2" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">&#x1F4CD; ${escHtml(iv.addr)}, ${escHtml(iv.com)}${iv.addrComp?' · '+escHtml(iv.addrComp):''}${(isAgres()||isChef()||hasRight('Administration'))&&iv.s!=='terminee'?`<button class="btn sm" style="font-size:10px;padding:2px 7px;" onclick="editAdresse('${iv.id}')">✏️ Corriger</button>`:''}<button class="btn sm" style="font-size:10px;padding:2px 7px;background:#4285F4;color:#fff;border-color:#4285F4;" onclick="openMaps('${iv.id}')">🗺️ Maps</button></div></div>
    <div class="mr"><div class="ml">Requérant</div><div class="mv2" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span>${escHtml(iv.req||'—')}${getInterventionPhones(iv).length?' · '+getInterventionPhones(iv).map(escHtml).join(' · '):''}</span>
      ${getInterventionPhones(iv).map((phone,index)=>`<button class="btn sm" style="font-size:10px;padding:2px 7px;background:#16A34A;color:#fff;border-color:#16A34A;" onclick="callRequerantMasque('${iv.id}',${index})" title="Appeler ${escHtml(phone)} en numéro masqué (non garanti selon téléphone)">📞 ${escHtml(phone)}</button>`).join('')}
      ${(iv._reqInit||iv._telInit)?`<span style="font-size:10px;color:var(--t2);font-style:italic;">(initial : ${escHtml(iv._reqInit||'')}${iv._telInit?' · '+escHtml(iv._telInit):''})</span>`:''}
      ${(isAgres()&&iv.agr===CU.l||hasRight('Administration'))&&iv.s!=='terminee'?`<button class="btn sm" style="font-size:10px;padding:2px 7px;" onclick="editRequerant('${iv.id}')">✏️ Corriger</button>`:''}
    </div></div>
    <div class="mr" style="padding:4px 0;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;">
        ${iv.op?`<span style="color:var(--t2);">&#x260E;&#xFE0F; Op.&nbsp;<span style="font-family:monospace;font-weight:600;color:var(--tx);">${iv.op}</span></span>`:''}
        ${iv.agr?`<span style="color:var(--t2);">&#x1F3AF; Chef&nbsp;<span style="font-family:monospace;font-weight:600;color:var(--tx);">${iv.agr}</span></span>`:''}
        ${iv._agr2?`<span style="color:var(--t2);">&#x1F3AF; 2e&nbsp;<span style="font-family:monospace;font-weight:600;color:var(--tx);">${iv._agr2}</span></span>`:''}
      </div>
    </div>
    ${(()=>{
      const na=nm(iv.addr),nn=nm(iv.n);
      const autres=[].concat(IVS||[],PILP_IVS||[]).filter(x=>x.id!==iv.id&&nm(x.addr)===na&&nm(x.n)===nn&&x.s!=='annulee');
      if(!autres.length)return '';
      const avisN=autres.filter(x=>x._avisEnAttente).length;
      const cliquable=isAdminModeActive();
      const detail=avisN?` · <strong>${avisN}</strong> avis de passage en attente`:'';
      const lien=cliquable?' — <u>voir</u>':'';
      const onclick=cliquable?` onclick="showInterventionsLiees('${iv.id}')" style="cursor:pointer;"`:'';
      return `<div${onclick} style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#92400E;${cliquable?'cursor:pointer;':''}">&#x26A0;&#xFE0F; <strong>${autres.length}</strong> autre${autres.length>1?'s':''} intervention${autres.length>1?'s':''} à cette adresse pour ce type${detail}${lien}</div>`;
    })()}
    ${iv._appelDetails&&Object.keys(iv._appelDetails).length?`<div class="mr"><div class="ml">Informations de l'appel</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:3px;">${Object.keys(iv._appelDetails).map(k=>`<span style="font-size:13px;"><span style="color:var(--t2);">${escHtml(k)} :</span> <strong>${escHtml(String(iv._appelDetails[k]))}</strong></span>`).join('')}</div></div></div>`:''}
    ${(()=>{const compls=(iv.tl||[]).filter(t=>t.s==='info-compl');return compls.length?`<div class="mr"><div class="ml" style="color:#0369A1;">&#x2139;&#xFE0F; Compléments d'information</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${compls.map(t=>`<div style="background:#EFF6FF;border-left:3px solid #0369A1;border-radius:6px;padding:6px 10px;font-size:13px;"><div>${escHtml(t.note||'')}</div><div style="font-size:10px;color:var(--t2);margin-top:2px;">&#x1F4C5; ${escHtml(t.h||'')} · ${escHtml(t.who||'')}</div></div>`).join('')}</div></div></div>`:'';})()}
    ${iv._transfertDe?`<div class="mr"><div class="ml">Transfert reçu de</div><div class="mv2" style="color:var(--amb);font-weight:500;">&#x1F500; ${CASERNES.find(c=>c.id===iv._transfertDe)?.nom||iv._transfertDe}</div></div>`:''}
    ${iv._transfertVers?`<div class="mr"><div class="ml">Transféré vers</div><div class="mv2" style="color:#888;">&#x1F500; ${CASERNES.find(c=>c.id===iv._transfertVers)?.nom||iv._transfertVers}</div></div>`:''}
    ${iv._refugeAnimalier?`<div class="mr"><div class="ml">Refuge animalier</div><div class="mv2" style="color:var(--grn);">&#x1F43E; Transmis au refuge — ${iv._refugeAnimalier}</div></div>`:''}

    ${(iv.eng||iv._hDebut||iv._hFin)?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:8px;margin:6px 0;">'+(iv.eng?'<div style="background:var(--bg);border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Engin</div><span class="bdg bb">'+iv.eng+'</span></div>':'')+(iv._hDebut?'<div style="background:#FEF9EC;border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--amb);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">&#x23F1; Début</div><div style="font-weight:700;color:var(--amb);font-size:15px;">'+iv._hDebut+'</div></div>':'')+(iv._hFin?'<div style="background:#F0FAF0;border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--grn);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">&#x2705; Fin</div><div style="font-weight:700;color:var(--grn);font-size:15px;">'+iv._hFin+'</div></div>':'')+(iv._hDebut&&iv._hFin?'<div style="background:#F0F4FF;border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--pur);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">&#x23F3; Durée</div><div style="font-weight:700;color:var(--pur);font-size:15px;">'+dureeHHMM(iv._hDebut,iv._hFin)+'</div></div>':'')+'</div>':''}
    ${iv._equipage1?`<div class="mr"><div class="ml">&#x1F692; ${iv._engin1||'Engin 1'}</div><div class="mv2"><div style="display:flex;flex-wrap:wrap;gap:4px;">${iv._equipage1.map(e=>{const u=USERS.find(x=>x.l===e.login);const nom=u?fullName(u):((e.prenom||e.nom)?((e.prenom||'')+' '+(e.nom||'')).trim():e.login);return'<span style="background:'+(e.renfort?'#F5F3FF':'#EEF2FF')+';color:'+(e.renfort?'#6D28D9':'#3730A3')+';border-radius:6px;padding:2px 8px;font-size:11px;">'+(e.renfort?'&#x1F692; ':'')+'<span style="font-size:9px;opacity:.7;">'+e.role+'</span> '+nom+(e.renfort&&e.caserneNom?' <span style="font-size:9px;opacity:.7;">('+e.caserneNom+')</span>':'')+'</span>';}).join('')}</div></div></div>`:''}
    ${iv._equipage2?`<div class="mr"><div class="ml">&#x1F692; ${iv._engin2||'Engin 2'}</div><div class="mv2"><div style="display:flex;flex-wrap:wrap;gap:4px;">${iv._equipage2.map(e=>{const u=USERS.find(x=>x.l===e.login);const nom=u?fullName(u):((e.prenom||e.nom)?((e.prenom||'')+' '+(e.nom||'')).trim():e.login);return'<span style="background:'+(e.renfort?'#F5F3FF':'#F0FDF4')+';color:'+(e.renfort?'#6D28D9':'#166534')+';border-radius:6px;padding:2px 8px;font-size:11px;">'+(e.renfort?'&#x1F692; ':'')+'<span style="font-size:9px;opacity:.7;">'+e.role+'</span> '+nom+(e.renfort&&e.caserneNom?' <span style="font-size:9px;opacity:.7;">('+e.caserneNom+')</span>':'')+'</span>';}).join('')}</div></div></div>`:''}
    ${(iv._releves&&iv._releves.filter(r=>!r.isRenfort).length)?`<div class="mr"><div class="ml" style="color:#0369A1;">&#x1F504; Relèves</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${iv._releves.filter(r=>!r.isRenfort).map((r,ri)=>{
      const enAttenteRetour=r.ancienEquipage.filter(e=>!e.hRetour);
      const rentres=r.ancienEquipage.filter(e=>e.hRetour);
      return'<div style="background:#F0F9FF;border-radius:8px;padding:8px 10px;border:1px solid #BAE6FD;">'
        +'<div style="font-size:10px;font-weight:600;color:#0369A1;margin-bottom:4px;">Relève n°'+(ri+1)+' — '+r.hReleve+'</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">'
        +r.nouvelEquipage.map(e=>{const u=USERS.find(x=>x.l===e.login);return'<span style="background:#DBEAFE;color:#1D4ED8;border-radius:5px;padding:2px 7px;font-size:10px;"><span style="opacity:.7;">'+e.role+'</span> '+(u?fullName(u):e.login)+'</span>';}).join('')
        +'</div>'
        +(enAttenteRetour.length?'<div style="font-size:10px;color:#854F0B;margin-top:4px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">En route retour : <span>'+enAttenteRetour.map(e=>{const u=USERS.find(x=>x.l===e.login);return u?fullName(u):e.login;}).join(', ')+'</span>'+(iv.agr===CU.l||iv._agr2===CU.l||enAttenteRetour.some(e=>e.login===CU.l)?'<button class="btn sm" style="font-size:9px;padding:1px 6px;background:#0369A1;color:#fff;" onclick="confirmerRetour(\''+iv.id+'\','+ri+',\'\')">&#x2705; Retour caserne (tous)</button>':'')+'</div>':'')
        +(rentres.length?'<div style="font-size:10px;color:#3B6D11;margin-top:2px;">Rentrés : '+rentres.map(e=>{const u=USERS.find(x=>x.l===e.login);return(u?fullName(u):e.login)+' ('+e.hRetour+')';}).join(', ')+'</div>':'')
        +'</div>';
    }).join('')}</div></div></div>`:''}
    ${(iv._releves&&iv._releves.filter(r=>r.isRenfort).length)?`<div class="mr"><div class="ml" style="color:#7C3AED;">&#x1F692; Renforts UT présents</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${iv._releves.filter(r=>r.isRenfort).map(r=>{
      const cas=CASERNES.find(x=>x.id===r.caserneRenfort);
      const casNom=cas?cas.nom:r.caserneRenfort;
      return'<div style="background:#F5F3FF;border-radius:8px;padding:8px 10px;border:1px solid #DDD6FE;">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
        +(r.enginRenfort?'<span class="bdg bb">'+r.enginRenfort+'</span>':'')
        +'<span style="font-size:11px;font-weight:600;color:#7C3AED;">'+casNom+'</span>'
        +'<span style="font-size:10px;color:var(--t2);margin-left:auto;">depuis '+r.hReleve+'</span>'
        +'</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:3px;">'
        +r.nouvelEquipage.map(e=>{const u=USERS.find(x=>x.l===e.login);return'<span style="background:#EDE9FE;color:#5B21B6;border-radius:5px;padding:2px 7px;font-size:10px;"><span style="opacity:.7;">'+e.role+'</span> '+(u?fullName(u):e.login)+'</span>';}).join('')
        +'</div></div>';
    }).join('')}</div></div></div>`:''}

    ${(iv._renforts&&iv._renforts.length)?`<div class="mr"><div class="ml" style="color:#7C3AED;">&#x1F4E2; Renforts UT demandés</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${iv._renforts.map(r=>{
      const canCancel=r.statut!=='annule'&&r.statut!=='termine';
      // Récupérer le statut réel depuis chaque caserne destinataire
      const destDetails=r.destinataires.map(function(cid){
        const c=CASERNES.find(function(x){return x.id===cid;});
        const rDest=(CASERNE_DATA[cid]?.renforts||[]).find(function(x){return x.id===r.id;});
        const statDest=rDest?rDest.statut:r.statut;
        const reponduPar=rDest?.reponduPar||'';
        const hReponse=rDest?.hReponse||'';
        const statColors={'en-attente':'#854F0B','accepte':'#3B6D11','en-cours':'#185FA5','termine':'#3B6D11','refuse':'#E24B4A','annule':'#888'};
        const statLabels={'en-attente':'Demande en cours','accepte':'Accept\u00e9','en-cours':'En cours','termine':'Termin\u00e9','refuse':'Refus\u00e9','annule':'Annul\u00e9'};
        const canCancelDest=statDest==='en-attente'; // annulation seulement si pas encore répondu
        const statDisplay=statDest==='en-attente'?'Demande en cours':statLabels[statDest]||statDest;
        return'<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:5px 8px;background:#fff;border-radius:6px;border:1px solid #E9D5FF;">'
          +'<span style="font-size:12px;font-weight:500;flex:1;">'+(c?c.nom:cid)+'</span>'
          +'<span style="font-size:10px;font-weight:600;background:'+(statColors[statDest]||'#666')+';color:#fff;border-radius:5px;padding:1px 7px;">'+statDisplay+'</span>'
          +(reponduPar?'<span style="font-size:10px;color:var(--t2);">par '+reponduPar+(hReponse?' à '+hReponse:'')+'</span>':'')
          +(canCancelDest?'<button class="btn sm" style="font-size:9px;padding:1px 6px;color:#E24B4A;border-color:#E24B4A;" onclick="annulerRenfortUT(\''+iv.id+'\',\''+r.id+'\',\''+cid+'\')">✕</button>':'')
          +'</div>';
      }).join('');
      return'<div style="background:#F5F3FF;border-radius:8px;padding:8px 10px;border:1px solid #DDD6FE;">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        +'<span style="font-size:11px;font-weight:600;color:#7C3AED;">'+(r.type==='complet'?'&#x1F692; Renfort complet':'&#x1F465; Renfort personnel')+'</span>'
        +'<span style="font-size:10px;color:var(--t2);">'+r.hDemande+'</span>'
        +(canCancel?'<button class="btn sm" style="font-size:9px;padding:1px 8px;color:#E24B4A;border-color:#E24B4A;margin-left:auto;" onclick="annulerRenfort(\''+iv.id+'\',\''+r.id+'\')">✕ Annuler tout</button>':'<span style="font-size:10px;color:#888;margin-left:auto;">Annulé</span>')
        +'</div>'
        +(r.note?'<div style="font-size:10px;color:var(--t2);margin-bottom:5px;">'+r.note+'</div>':'')
        +destDetails
        +'</div>';
    }).join('')}</div></div></div>`:''}
    ${iv._isRenfort?`<div class="mr"><div class="ml" style="color:#7C3AED;">&#x1F692; Mode Renfort UT</div><div class="mv2" style="font-size:12px;background:#F5F3FF;border-radius:8px;padding:8px 12px;border:1px solid #DDD6FE;"><span style="font-weight:600;color:#7C3AED;">Renfort pour ${iv._caserneSourceNom||iv._caserneSource||''}</span><br><span style="font-size:11px;color:var(--t2);">Votre caserne est intervenue en renfort sur cette intervention.</span></div></div>`:''}
    ${iv.det?`<div class="mr"><div class="ml">Détails</div><div class="mv2">${escHtml(iv.det)}</div></div>`:''}
    ${iv.s==='terminee'&&(iv._crTexte||iv._compteRendu)&&(isInterventionReportChef(iv,CU.l)||(iv._equipage1||[]).some(function(e){return e.login===CU.l;})||(iv._equipage2||[]).some(function(e){return e.login===CU.l;})||hasAdministrativeAccount())?`<div class="mr"><div class="ml" style="color:#0F766E;">&#x1F4CB; Compte rendu${iv._crValide?' &#x1F512;':''}</div><div class="mv2" style="white-space:pre-wrap;font-size:12px;background:#F0FDFA;border-radius:8px;padding:8px 10px;border:1px solid #99F6E4;">${iv._crTexte||iv._compteRendu}</div></div>`:''}
    ${iv.s==='terminee'&&(isInterventionReportChef(iv,CU.l)||hasAdministrativeAccount())?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 2px 0;">
      <button class="btn sm" style="background:#0F766E;color:#fff;border-color:#0F766E;" onclick="showCompteRenduModal('${iv.id}')">${iv._crValide?'&#x1F512; Voir':iv._crTexte||iv._compteRendu?'&#x270F;&#xFE0F; Modifier':'&#x1F4CB; Rédiger le compte rendu'}</button>
      <button class="btn sm" style="background:#C0392B;color:#fff;" onclick="voirRapportIntervention('${iv.id}')">&#x1F5A8; Rapport PDF</button>
    </div>`:``}    <div class="msep"></div>
    ${(iv._pdfAutorisation||iv._pdfAttestation||iv._autorisationData)&&_showAutoBtn&&(iv.agr===CU.l||iv._agr2===CU.l||isAdminModeActive())?`<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:10px 12px;margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:#6B3AA0;margin-bottom:8px;">&#x1F4DD; Documents autorisation / attestation</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${(iv._pdfAutorisation||iv._autorisationData)?`<button class="btn sm" style="background:#185FA5;color:#fff;" onclick="viewPdfDocument('${iv.id}','autorisation')">&#x1F4CB; Autorisation</button>`:''}
        ${(iv._pdfAttestation||iv._autorisationData)?`<button class="btn sm" style="background:#3B6D11;color:#fff;" onclick="viewPdfDocument('${iv.id}','attestation')">&#x1F4CB; Attestation</button>`:''}
        ${!iv._pdfAutorisation&&iv._autorisationData?`<span style="font-size:10px;color:var(--t2);align-self:center;">&#x26A0;&#xFE0F; Générés à la volée</span>`:'<span style="font-size:10px;color:var(--grn);align-self:center;">&#x2705; Sauvegardés</span>'}
      </div>
    </div>`:''}    ${(['en-attente','selectionne','en-cours'].includes(iv.s)&&(hasRight('Interventions')||isAgres()||isChef()||isAdminModeActive()))?`<button class="btn sm" style="width:100%;margin-bottom:8px;background:#0369A1;color:#fff;border-color:#0369A1;" onclick="showComplementModal('${iv.id}')">&#x2139;&#xFE0F; Ajouter un complément d'information</button>`:''}
    <details style="background:var(--bg);border-radius:10px;margin-bottom:8px;" id="tl-details-${iv.id}">
      <summary style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;">
        Historique des statuts <span style="font-size:10px;background:var(--brd);border-radius:10px;padding:1px 7px;color:var(--t2);font-weight:400;">${(iv.tl||[]).length}</span>
      </summary>
      <div style="padding:0 12px 10px 12px;">${tlHtml||'<div style="font-size:12px;color:var(--t2);">Aucun historique.</div>'}</div>
    </details>
    ${reclassHtml}${actions}`;
  document.getElementById('mo').style.display='flex';
}
function setAgr2(ivId,login){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  const old2=iv._agr2;
  iv._agr2=login||null;
  // Tracer dans la timeline
  if(login&&login!==old2){
    const u2=USERS.find(u=>u.l===login);
    const nom2=u2?fullName(u2):login;
    pushTL(iv,'selectionne',CU.l+' + '+nom2+' (2\u00e8me chef)');
  }
  rI();oM(ivId);
}
let _modalLocked = false;
function cM(){
  if(_modalLocked)return;
  const mo=document.getElementById('mo'),panel=mo&&mo.querySelector('.mod');
  if(mo)mo.style.display='none';
  if(mo)mo.classList.remove('cr-modal-overlay');
  if(panel)panel.scrollTop=0;
}
function openModalAtTop(focusId){
  const mo=document.getElementById('mo'),panel=mo&&mo.querySelector('.mod');
  if(!mo)return;
  mo.style.display='flex';
  const reset=function(){
    if(panel)panel.scrollTop=0;
    const body=document.getElementById('mb');if(body)body.scrollTop=0;
  };
  reset();
  requestAnimationFrame(function(){
    reset();
    if(focusId){
      const field=document.getElementById(focusId);
      if(field){try{field.focus({preventScroll:true});}catch(err){field.focus();}reset();}
    }
  });
}

let _modalScrollY=0;
function syncModalBackgroundLock(){
  const mo=document.getElementById('mo'),iframeModal=document.getElementById('iframe-modal');
  const isOpen=(mo&&getComputedStyle(mo).display!=='none')||(iframeModal&&getComputedStyle(iframeModal).display!=='none');
  const root=document.documentElement,body=document.body;
  if(isOpen&&!root.classList.contains('modal-scroll-locked')){
    _modalScrollY=window.scrollY||window.pageYOffset||0;
    root.classList.add('modal-scroll-locked');
    body.style.top=(-_modalScrollY)+'px';
  }else if(!isOpen&&root.classList.contains('modal-scroll-locked')){
    root.classList.remove('modal-scroll-locked');
    body.style.removeProperty('top');
    window.scrollTo(0,_modalScrollY);
  }
}
requestAnimationFrame(function(){
  ['mo','iframe-modal'].forEach(function(id){
    const el=document.getElementById(id);
    if(el)new MutationObserver(syncModalBackgroundLock).observe(el,{attributes:true,attributeFilter:['style','class']});
  });
  syncModalBackgroundLock();
});

function agresEnCours(){
  // La règle 1 seul en-cours s'applique dès que l'utilisateur est chef d'agrès OU tireur PILP,
  // quels que soient ses autres droits (chef, admin...).
  if(!isAgres()&&!isTireurPILP())return null;
  const ivNorm=IVS.find(v=>v.s==='en-cours'&&v.agr===CU.l&&!v._isPilip);
  if(ivNorm)return ivNorm;
  const ivPilp=PILP_IVS.find(v=>v.s==='en-cours'&&v.agr===CU.l);
  return ivPilp||null;
}
function showBlockModal(enCours){
  document.getElementById('mt').textContent='Action bloquée';
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`
    <div style="padding:14px;background:var(--rl);border:1.5px solid var(--rd);border-radius:12px;">
      <div style="font-size:14px;font-weight:700;color:var(--rd);margin-bottom:8px;">⛔ Intervention déjà en cours</div>
      <div style="font-size:13px;color:var(--rd);margin-bottom:12px;">
        Vous avez déjà une intervention en cours.<br>
        Vous devez la clôturer avant d'en commencer une nouvelle.
      </div>
      <div style="background:#fff;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;border:1px solid var(--brd);">
        <strong>${enCours.id}</strong> — ${enCours.n}<br>
        <span style="color:var(--t2);">&#x1F4CD; ${enCours.com}</span>
      </div>
      <button class="btn sm" style="background:var(--red);color:#fff;border-color:var(--red);width:100%;margin-bottom:8px;" onclick="cM();oM('${enCours.id}')">&#x1F449; Clôturer ${enCours.id}</button>
      <button class="mclose" onclick="cM()">Annuler</button>
    </div>`;
  document.getElementById('mo').style.display='flex';
}
function cS(id,s){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  if(s==='en-cours'){
    const ec=agresEnCours();
    if(ec&&ec.id!==id){showBlockModal(ec);return;}
    showPersonnelModal(id);
    return;
  }
  // Bloquer si déjà sélectionné par quelqu'un d'autre
  if(s==='selectionne'&&iv.s==='en-attente'){
    if(iv.agr&&iv.agr!==CU.l){
      const autreAgr=USERS.find(u=>u.l===iv.agr);
      const nom=autreAgr?fullName(autreAgr):iv.agr;
      showToast('⚠️ Déjà sélectionné par '+nom,'warn');
      return;
    }
  }
  if(!iv.tl)iv.tl=[];
  iv.s=s;
  if(s==='selectionne'||s==='en-cours'){ if(isAgres()||isChef()||isAdminModeActive()) iv.agr=CU.l; }
  if(s==='selectionne')assignInterventionRoute(iv,iv.agr||CU.l);
  if(s==='en-attente'){
    iv.agr=null;
    delete iv._routeBatchId;delete iv._routeOrder;
  }
  const agr2Label=iv._agr2?(()=>{const u=USERS.find(u=>u.l===iv._agr2);return u?' + '+fullName(u)+' (2\u00e8me)':' + '+iv._agr2;})():'';
  pushTL(iv,s,CU.l+agr2Label,s==='selectionne'?'Ordre de tournée : '+iv._routeOrder:'');
  if(CD())CD().ivs=IVS;
  // Push immédiat pour les sélections (sans debounce)
  if(s==='selectionne'||s==='en-attente'){
    const data=_buildDataObject();
    localStorage.setItem(JB_CACHE_KEY,JSON.stringify(data));
    _jbPush(data); // push immédiat
  } else {
    saveData();
  }
  cM();rI();
  if(s==='terminee')rAccueil();
  rStatsHeader();
}

function getNextSelectedInterventions(closedIv){
  if(!closedIv)return[];
  return IVS.filter(function(candidate){
    if(candidate.id===closedIv.id||candidate.s!=='selectionne'||candidate.agr!==closedIv.agr)return false;
    if(closedIv._routeBatchId)return candidate._routeBatchId===closedIv._routeBatchId;
    return true;
  }).sort(function(a,b){
    return (Number(a._routeOrder)||9999)-(Number(b._routeOrder)||9999);
  });
}

function chooseNextSelectedIntervention(nextId,previousId){
  const next=IVS.find(function(x){return x.id===nextId;});
  const previous=IVS.find(function(x){return x.id===previousId;});
  if(!next||!previous)return;
  _pendingNextInterventionStarts[nextId]=previous._hFin||getHHMM(N());
  next._chainPreviousInterventionId=previous.id;
  cM();
  showPersonnelModal(nextId);
}

function showNextSelectedInterventionModal(closedIv){
  if(!closedIv||closedIv.agr!==CU.l)return;
  const nextItems=getNextSelectedInterventions(closedIv);
  if(!nextItems.length)return;
  document.getElementById('mt').textContent='Intervention suivante';
  document.getElementById('mi').textContent='Départ proposé à '+(closedIv._hFin||getHHMM(N()));
  document.getElementById('mb').innerHTML=
    '<div style="background:#EEF2FF;border:1px solid #C7D2FE;border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#3730A3;">'
    +'Sélectionnez l’intervention à enchaîner. Son heure de début reprendra automatiquement l’heure de fin de l’intervention que vous venez de clôturer.</div>'
    +nextItems.map(function(next){
      return '<button class="btn" style="width:100%;text-align:left;justify-content:flex-start;margin-bottom:8px;padding:10px 12px;" onclick="chooseNextSelectedIntervention(\''+next.id+'\',\''+closedIv.id+'\')">'
        +'<span><strong>'+escHtml(next.n)+'</strong><br><span style="font-size:11px;color:var(--t2);">&#x1F4CD; '+escHtml(interventionAddressLabel(next))+'</span></span></button>';
    }).join('')
    +'<button class="mclose" onclick="cM()">Plus tard</button>';
  document.getElementById('mo').style.display='flex';
}

function clot(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  // Ne pas re-clôturer une intervention déjà liée à une PILP
  if(iv._lienPilp&&iv.s==='terminee'){showToast('Cette intervention est déjà clôturée (liée à une PILP).','warn');cM();return;}
  const avis=document.getElementById('chk-av')&&document.getElementById('chk-av').checked;
  const h=getH(N());
  const agr2Lbl=iv._agr2?(()=>{const u=USERS.find(u=>u.l===iv._agr2);return u?' + '+fullName(u)+' (2\u00e8me)':' + '+iv._agr2;})():'';
  if(avis){
    // Avis de passage : le requérant était absent. L'intervention de CETTE équipe
    // est TERMINÉE (avec compte rendu), mais on garde le marqueur _avisPassage pour
    // signaler qu'un avis a été laissé et qu'on attend le rappel du requérant.
    iv._avisPassage=true;
    iv._avisEnAttente=true; // indicateur "en attente de rappel" (levé quand le requérant rappelle)
    iv.tl.push({s:'avis-passage',h,who:CU.l});
    // On NE retourne PAS : on laisse le flux de clôture normale terminer l'intervention.
  }
  // Clôture normale
  iv.s='terminee';iv._hFin=getHHMM(N());iv.tl.push({s:'terminee',h,who:CU.l+agr2Lbl});
  (iv.avisIds||[]).forEach(aid=>{const av=IVS.find(v=>v.id===aid&&v.s==='avis-passage'&&v.id!==iv.id);if(av){av.s='terminee';av.tl.push({s:'terminee',h,who:CU.l+' (fusion)'});}});
  // Attribution des numéros si pas encore attribués
  if(!iv._numGlobal||!iv._numCaserne||!iv._numMois){
    const annee=parseInt((iv.h||getH(N())).slice(0,4));
    if(iv._isRenfort){
      if(!iv._numGlobal){
        const ivSrc=IVS.find(function(x){return x.id===iv._ivSourceId;})||
          Object.values(CASERNE_DATA).flatMap(function(cd){return cd.ivs||[];}).find(function(x){return x.id===iv._ivSourceId;});
        iv._numGlobal=ivSrc&&ivSrc._numGlobal?ivSrc._numGlobal:nextIntNum(annee).numGlobal;
      }
      if(!iv._numRenfort) iv._numRenfort=nextRenfortNum(annee);
      iv._numCaserne=null; iv._numMois=null;
    } else {
      const nums=nextIntNum(annee);
      if(!iv._numGlobal&&cabbalrActif())  iv._numGlobal=nums.numGlobal;
      if(!iv._numCaserne) iv._numCaserne=nums.numCas;
      if(!iv._numMois)    iv._numMois=nums.numMois;
    }
  }
  if(iv._autorisationData&&iv._autorisationData.nom){
    iv._pdfAutorisation=_buildAutorisationHTML(id,'autorisation');
    iv._pdfAttestation=_buildAutorisationHTML(id,'attestation');
  }
  if(!iv.eng&&selEng)iv.eng=selEng;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);cM();rI();rAccueil();rStatsHeader(); // push immédiat : clôture d'intervention
  setTimeout(function(){showNextSelectedInterventionModal(iv);},80);
}
function clotAvis(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const h=getH(N());
  iv.s='terminee';iv.tl.push({s:'terminee',h,who:CU.l});
  (iv.avisIds||[]).forEach(aid=>{const av=IVS.find(v=>v.id===aid&&v.s==='avis-passage'&&v.id!==iv.id);if(av){av.s='terminee';av.tl.push({s:'terminee',h,who:CU.l+' (fusion)'});}});
  cM();rI();
}
function reclasser(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const sel=document.getElementById('reclass-sel');if(!sel)return;
  const oldN=iv.n;iv.n=sel.value;
  iv.tl.push({s:'reclasse',h:getH(N()),who:CU.l,note:`${oldN} → ${iv.n}`});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : sinon le changement de nature est écrasé au prochain pull
  cM();rI();
  // Reopen modal with fresh data
  setTimeout(()=>oM(id),50);
}

