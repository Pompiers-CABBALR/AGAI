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
  // L'intervention parente (frelons) reçoit son numéro INT à la clôture
  if(!iv._numCaserne){
    const nums=nextIntNum(annee,iv);
    iv._numCaserne=nums.numCas;iv._numGlobal=nums.numGlobal;
    iv.id=nums.idCas;
  }
  // La PILP créée reçoit un id temporaire PILP-2026-001
  // Elle n'a PAS encore de numéro INT — ce sera attribué à la clôture
  const pilpId=nextPilpId(annee);
  PILP_IVS.unshift({
    id:pilpId,ivRef:iv.id,_numApl:iv._numApl||iv.id,
    // Pas de _numCaserne ni _numGlobal ici — attribués à la clôture
    n:'Nid de frelons asiatiques — PILP',addr,com:iv.com,h,req,tel,
    localisation:document.getElementById('pf-loc').value,
    hauteur:parseFloat(document.getElementById('pf-haut').value)||null,
    reconnaissanceFaite:document.getElementById('pf-reco').checked,
    axeTir:document.getElementById('pf-axe').checked,
    obs:document.getElementById('pf-obs').value.trim(),
    s:'en-attente',agr:CU.l,tireur:null,rappels:0,avisIds:[],tl:[mkTL('en-attente',h,CU.l)]
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
  // Compteurs récapitulatifs PILP
  document.getElementById('pilp-nb1').textContent=PILP_IVS.filter(iv=>iv.s==='en-attente').length;
  document.getElementById('pilp-nb2s').textContent=PILP_IVS.filter(iv=>iv.s==='selectionne').length;
  document.getElementById('pilp-nb2').textContent=PILP_IVS.filter(iv=>iv.s==='avis-passage').length;
  document.getElementById('pilp-nb3').textContent=PILP_IVS.filter(iv=>iv.s==='en-cours').length;
  document.getElementById('pilp-nb4').textContent=PILP_IVS.filter(iv=>iv.s==='terminee').length;
  document.getElementById('pilp-nbtot').textContent=PILP_IVS.length;
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
          <div class="ivrl"><div class="ivrh">&#x1F4C5; ${escHtml(iv.h.slice(0,8))}</div><div class="ivrn">&#x1F3AF; ${escHtml(iv.n)}</div><div class="ivrc">&#x1F4CD; ${escHtml(iv.com)}${iv.rappels?' · '+Number(iv.rappels)+' rappel(s)':''}</div></div>
          <div class="ivrr"><span class="bdg bp">Avis PILP</span></div></div>`).join('')}
      </div>`;
  } else pas.style.display='none';
  let list;
  if(fltPilp==='all') list=PILP_IVS.filter(iv=>iv.s!=='avis-passage');
  else if(fltPilp==='mes-sel') list=PILP_IVS.filter(iv=>(iv.s==='selectionne'||iv.s==='en-cours')&&iv.agr===CU.l);
  else if(fltPilp==='mes-resp') list=PILP_IVS.filter(iv=>iv.agr===CU.l&&['selectionne','en-cours','terminee'].includes(iv.s));
  else list=PILP_IVS.filter(iv=>iv.s===fltPilp);
  const cont=document.getElementById('pilp-list');
  if(!list.length){cont.innerHTML='<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucune intervention PILP.</div>';return;}
  const bm={'en-attente':['br','En attente'],'selectionne':['bsel','Sélect.'],'en-cours':['ba','En cours'],'terminee':['bg2','Terminée'],'avis-passage':['bp','Avis passage'],'annulee':['bgr','Annulée']};
  const ag=isAgres(),chef=isChef()||hasRight('Administration');
  cont.innerHTML=list.map(iv=>{
    const[bc,bt]=bm[iv.s]||['bgr','—'];
    const chkShow=(ag||isTireurPILP()||chef)&&(iv.s==='en-attente'||(iv.s==='selectionne'&&iv.agr===CU.l));
    const checked=iv.s==='selectionne'&&iv.agr===CU.l;
    return `<div class="ivr pilp ${iv.s}">
      ${chkShow?`<div class="ivr-chk"><input type="checkbox" ${checked?'checked':''} onchange="toggleChkPilp('${iv.id}',this)"/></div>`:''}
      <div class="ivrl" style="cursor:pointer;" onclick="oPilp('${iv.id}')">
        <div class="ivrh">&#x1F4C5; ${iv.h.slice(0,8)} — Réf: ${iv.ivRef}</div>
        <div class="ivrn">&#x1F3AF; ${escHtml(iv.n)}</div>
        <div class="ivrc">&#x1F4CD; ${escHtml(iv.addr)} — ${escHtml(iv.com)}</div>
        <div style="font-size:11px;color:var(--t2);margin-top:2px;">${iv.localisation||'—'}${iv.hauteur?' · '+iv.hauteur+'m':''} ${iv.reconnaissanceFaite?'· ✅ Reco':'· ❌ Reco'} ${iv.axeTir?'· &#x1F3AF; Axe OK':'· ⚠️ Axe ?'}</div>
      </div>
      <div class="ivrr" style="cursor:pointer;" onclick="oPilp('${iv.id}')">
        <span class="bdg ${bc}">${bt}</span>
        ${iv.rappels?`<span class="bdg bp" style="font-size:10px;">${iv.rappels}×</span>`:''}
      </div>
    </div>`;
  }).join('');
}
function toggleChkPilp(id,el){
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  if(el.checked){iv.s='selectionne';iv.agr=CU.l;pushTL(iv,'selectionne',CU.l);}
  else{iv.s='en-attente';iv.agr=null;pushTL(iv,'en-attente',CU.l);}
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rPilp(); // push immédiat : changement de statut partagé
}

function oPilp(id){
  if(!isTireurPILP()){showToast('Accès réservé aux tireurs PILP.','warn');return;}
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  const ag=isAgres(),tireur=isTireurPILP(),chef=isChef()||hasRight('Administration');
  document.getElementById('mt').textContent=iv.n;
    // Numéro affiché : id temporaire PILP ou APL si clôturé
  const pApl=iv._numApl||'';
  document.getElementById('mi').textContent=iv.s==='terminee'?(pApl||iv.id):iv.id;
  const bm={'en-attente':['br','En attente'],'selectionne':['bsel','Sélectionné'],'en-cours':['ba','En cours'],'terminee':['bg2','Terminée'],'avis-passage':['bp','Avis passage']};
  const[bc,bt]=bm[iv.s]||['bgr','—'];
  let actions='';
  if((ag||tireur||chef)){
    if(iv.s==='en-attente'){
      actions=`<div class="brow"><button class="btn sel-btn sm" onclick="cSPilp('${id}','selectionne')">☑ Sélectionner</button><button class="btn am sm" onclick="cSPilp('${id}','en-cours')">▶ En cours</button></div>`;
    } else if(iv.s==='selectionne'){
      actions=`<div class="brow">
        <button class="btn am sm" onclick="cSPilp('${id}','en-cours')">▶ En cours</button>
        <button class="btn sm" onclick="cSPilp('${id}','en-attente')">↩ En attente</button>
      </div>`;
    } else if(iv.s==='en-cours'){
      const ds=getDS(N()),hh=pad(N().getHours()),mm2=pad(N().getMinutes());
      actions=`<div class="clotbox">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Clôturer l'intervention PILP</div>
        <label class="avislbl"><input type="checkbox" id="chk-pilp-avis" style="accent-color:var(--pur);"/>&#x1F7E3; Requérant absent — Avis de passage PILP</label>
        <button class="btn gn" style="width:100%;" onclick="clotPilp('${id}')">✅ Confirmer la clôture</button>
      </div>
      <div class="brow" style="margin-top:8px;"><button class="btn sm danger" onclick="cSPilp('${id}','en-attente')">↩ En attente</button></div>`;
    } else if(iv.s==='avis-passage'&&(chef||ag)){
      const canCloseAvis=isChefCentre()||hasRight('Administration');
      const ds=getDS(N()),hh=pad(N().getHours()),mm2=pad(N().getMinutes());
      if(canCloseAvis){
        actions+=`<div class="clotbox" style="margin-top:10px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Clôturer l'avis de passage PILP</div>
          <button class="btn gn" style="width:100%;" onclick="clotAvisPilp('${id}')">✅ Clôturer définitivement</button>
        </div>`;
      } else {
        actions+=`<div class="clotbox" style="margin-top:10px;background:var(--rl);border:1px solid var(--rd);">
          <div style="font-size:12px;color:var(--rd);">&#x1F512; La clôture des avis de passage est réservée au chef de centre.</div>
        </div>`;
      }
    }
  }
  const sdots={'en-attente':'#E24B4A','en-cours':'var(--amb)','terminee':'var(--grn)','avis-passage':'var(--pur)'};
  const tlHtml=(iv.tl||[]).map(t=>`<div class="tl-item"><div class="tl-dot" style="background:${sdots[t.s]||'#aaa'};"></div><div class="tl-info"><span class="tl-status">${bm[t.s]?bm[t.s][1]:t.s}</span> <span class="tl-horo">&#x1F4C5; ${t.h}</span><div class="tl-who">${t.who}</div></div></div>`).join('');
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
    <div class="msep"></div>
    <details style="background:var(--bg);border-radius:10px;margin-bottom:8px;">
      <summary style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;">
        Historique <span style="font-size:10px;background:var(--brd);border-radius:10px;padding:1px 7px;color:var(--t2);font-weight:400;">${(iv.tl||[]).length}</span>
      </summary>
      <div style="padding:0 12px 10px 12px;">${tlHtml||'<div style="font-size:12px;color:var(--t2);">Aucun historique.</div>'}</div>
    </details>
    ${actions}`;
  document.getElementById('mo').style.display='flex';
}
function cSPilp(id,s){
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  if(s==='en-cours'){
    const ec=agresEnCours();
    if(ec&&ec.id!==id){showBlockModal(ec);return;}
  }
  iv.s=s;
  if(s==='selectionne'||s==='en-cours')iv.agr=CU.l;
  if(s==='en-cours')iv.tireur=CU.l;
  if(s==='en-attente'){iv.agr=null;iv.tireur=null;}
  if(!iv.tl)iv.tl=[];iv.tl.push(mkTL(s,getH(N()),CU.l));
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  rPilp();oPilp(id);
}
function clotPilp(id){
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  const avis=document.getElementById('chk-pilp-avis')&&document.getElementById('chk-pilp-avis').checked;
  const h=getH(N());
  if(avis){
    iv.s='avis-passage';iv.rappels=(iv.rappels||0)+1;
    if(!iv.avisIds)iv.avisIds=[];if(!iv.avisIds.includes(iv.id))iv.avisIds.push(iv.id);
    iv.tl.push({s:'avis-passage',h,who:CU.l});
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
    rPilp();oPilp(id);
  } else {
    iv.s='terminee';iv._hFin=getHHMM(N());iv.tl.push({s:'terminee',h,who:CU.l});
    // Attribuer numéros INT
    if(!iv._numGlobal||!iv._numCaserne||!iv._numMois){
      const nums=nextIntNum(new Date().getFullYear(),iv);
      if(!iv._numGlobal)  iv._numGlobal=nums.numGlobal;
      if(!iv._numCaserne) iv._numCaserne=nums.numCas;
      if(!iv._numMois)    iv._numMois=nums.numMois;
    }
    (iv.avisIds||[]).forEach(aid=>{const av=PILP_IVS.find(v=>v.id===aid&&v.s==='avis-passage'&&v.id!==iv.id);if(av){av.s='terminee';av.tl.push({s:'terminee',h,who:CU.l+' (fusion)'});}});
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
    cM();rPilp();rI();rAccueil();
  }
}
function clotAvisPilp(id){
  const iv=PILP_IVS.find(v=>v.id===id);if(!iv)return;
  const h=getH(N());iv.s='terminee';iv.tl.push({s:'terminee',h,who:CU.l});
  if(!iv._numCaserne){
    const annee=new Date().getFullYear();
    const nums=nextIntNum(annee,iv);
    iv._numCaserne=nums.numCas;iv._numGlobal=nums.numGlobal;
    IVS.unshift({id:nums.idCas,_numApl:iv._numApl||iv.id,_numCaserne:nums.numCas,_numGlobal:nums.numGlobal,
      n:iv.n.replace(' — PILP',''),addr:iv.addr,com:iv.com,h:iv.h,op:iv.agr||CU.l,
      s:'terminee',det:iv.obs||'',eng:null,req:iv.req||'',tel:iv.tel||'',obs:'',agr:CU.l,
      rappels:0,avisIds:[],_lienPilp:true,tl:[...iv.tl]});
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
  return [...new Set(names.map(function(name){return String(name).trim();}).filter(Boolean))];
}
function interventionActivePersonnelLogins(iv){
  if(!iv)return [];
  // La derniere releve contient la photographie complete de l'equipage
  // principal actif, y compris apres l'ajout d'un renfort interne.
  const releves=(iv._releves||[]).filter(function(r){
    return r&&Array.isArray(r.nouvelEquipage)&&r.nouvelEquipage.length;
  });
  const principal=releves.length?releves[releves.length-1].nouvelEquipage:(iv._equipage1||[]);
  const secondaire=iv._equipage2||[];
  const logins=[];
  principal.concat(secondaire).forEach(function(member){
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
    const releves=iv._releves||[];
    const principal=releves.length?(releves[releves.length-1].nouvelEquipage||[]):(iv._equipage1||[]);
    return principal.concat(iv._equipage2||[]).some(function(member){
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
  return (iv._numApl||iv.id||'Intervention')+' — '+(iv.n||'')+(iv.com?' ('+iv.com+')':'');
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
  IVS.filter(iv=>isTdy(iv)&&iv.s==='selectionne'&&iv.agr===CU.l).forEach(iv=>parcConfirmed.add(iv.id));
  if(isTireurPILP())PILP_IVS.filter(iv=>iv.s==='selectionne'&&iv.agr===CU.l).forEach(iv=>parcConfirmed.add(iv.id));
  rI();
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
  IVS.filter(iv=>isTdy(iv)&&iv.s==='selectionne'&&iv.agr===CU.l).forEach(iv=>{iv.s='en-attente';iv.agr=null;pushTL(iv,'en-attente',CU.l);});
  if(isTireurPILP())PILP_IVS.filter(iv=>iv.s==='selectionne'&&iv.agr===CU.l).forEach(iv=>{iv.s='en-attente';iv.agr=null;pushTL(iv,'en-attente',CU.l);});
  selEng=null;parcConfirmed.clear();document.querySelectorAll('#eg .ec').forEach(c=>c.classList.remove('sel'));rI();
}

