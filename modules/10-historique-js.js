// === MODULE: historique.js ===
// ────────────────── HISTORIQUE ──────────────────
function rHist(){
  const cA=isChef()||hasRight('Administration');
  const normalIvs=cA?IVS.filter(iv=>!['en-attente','selectionne','en-cours'].includes(iv.s)&&!iv._isPilip):IVS.filter(iv=>(isTdy(iv)||iv.s==='annulee')&&!iv._isPilip);
  const pilpIvsH=canSeePILP()?(cA?PILP_IVS:PILP_IVS.filter(iv=>isTdy(iv))):[];
  const pilpMapped=pilpIvsH.map(p=>({...p,n:'[PILP] '+p.n,tl:p.tl,_isPilp:true}));
  // Tri décroissant par jour puis par heure de DÉBUT d'intervention affichée.
  // Les interventions sans heure de début (ex. annulées) sont classées en fin de
  // journée (clé 0000), pour ne pas s'intercaler selon leur heure de création.
  const _dateKey=value=>{
    const digits=String(value||'').replace(/\D/g,'');
    return digits.length>=8?digits.slice(0,8):'';
  };
  const _jour=iv=>{
    const timeline=Array.isArray(iv.tl)?iv.tl:[];
    const passages=timeline.filter(function(entry){return entry&&entry.s==='en-cours'&&_dateKey(entry.h);});
    if(passages.length)return _dateKey(passages[passages.length-1].h);
    const clotures=timeline.filter(function(entry){return entry&&entry.s==='terminee'&&_dateKey(entry.h);});
    if(clotures.length)return _dateKey(clotures[clotures.length-1].h);
    return _dateKey(iv.h)||'00000000';
  };
  const _heureDeb=iv=>{
    const hd=(iv._hDebut||'').replace(/[^0-9]/g,'');
    return hd?hd.padStart(4,'0').slice(0,4):'0000';
  };
  const _numeroOrdre=iv=>{
    const values=[iv._numCaserne,iv._numGlobal,iv._numMois,iv._numRenfort,iv.id];
    for(const value of values){
      const matches=String(value||'').match(/\d+/g);
      if(matches&&matches.length)return parseInt(matches[matches.length-1],10)||0;
    }
    return 0;
  };
  const _sortKey=iv=>_jour(iv)+_heureDeb(iv);
  const ivs=[...normalIvs,...pilpMapped].sort((a,b)=>{
    const byDateAndTime=_sortKey(b).localeCompare(_sortKey(a));
    if(byDateAndTime!==0)return byDateAndTime;
    const byNumber=_numeroOrdre(b)-_numeroOrdre(a);
    if(byNumber!==0)return byNumber;
    return String(b.id||'').localeCompare(String(a.id||''),'fr',{numeric:true});
  });
  const grp={};
  ivs.forEach(iv=>{const h=_jour(iv),y=h.slice(0,4),m=h.slice(4,6),d=h.slice(6,8);if(!grp[y])grp[y]={};if(!grp[y][m])grp[y][m]={};if(!grp[y][m][d])grp[y][m][d]=[];grp[y][m][d].push(iv);});
  const MO=['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const ys=Object.keys(grp).sort((a,b)=>b-a);
  const c=document.getElementById('hc');
  if(!ys.length){c.innerHTML='<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucun historique.</div>';return;}
  c.innerHTML=ys.map(y=>{
    const ms=Object.keys(grp[y]).sort((a,b)=>b-a);
    const tot=ms.reduce((s,m)=>s+Object.values(grp[y][m]).reduce((s2,d)=>s2+d.length,0),0);
    return `<div class="hgrp"><div class="hgh" onclick="tg('hy${y}','ay${y}')">&#x1F4C5; ${y}<span class="bdg bgr" style="margin-left:auto;">${tot}</span><span id="ay${y}" style="margin-left:6px;">▼</span></div>
    <div id="hy${y}" class="hgb">${ms.map(m=>{
      const ds=Object.keys(grp[y][m]).sort((a,b)=>b-a);
      const tm=Object.values(grp[y][m]).reduce((s,d)=>s+d.length,0);
      return `<div class="hsub" onclick="tg('hm${y}${m}','am${y}${m}')">${MO[parseInt(m)]}<span class="bdg bgr" style="margin-left:6px;">${tm}</span><span id="am${y}${m}" style="margin-left:auto;">▼</span></div>
      <div id="hm${y}${m}">${ds.map(d=>{const ivd=grp[y][m][d];return `<div class="hdl">${d}/${m}/${y} — ${ivd.length} intervention(s)</div>${ivd.map(iv=>`<div class="hm${iv._crValide&&iv._impressions&&iv._impressions.length?' report-complete':''}" onclick="${iv._isPilp?`oPilp('${iv.id}')`:`oM('${iv.id}')`}">
  <span style="font-family:monospace;font-size:10px;color:var(--t3);">${iv._numCaserne||iv.id}</span>
  <span style="flex:1;font-size:12px;color:var(--t);${iv.s==='annulee'?'text-decoration:line-through;color:#999;':''}">
    ${iv.n}
    ${iv._numGlobal||iv._numCaserne||iv._numMois||iv._numRenfort?`<span style="font-size:10px;font-weight:600;margin-left:6px;">
      ${iv._numGlobal?`<span style="color:#1A6B1A;">C:${iv._numGlobal}</span> `:''}
      ${iv._isRenfort?(iv._numRenfort?`<span style="color:#7C3AED;">Renfort:${iv._numRenfort}</span>`:''):(iv._numCaserne?`<span style="color:#6A0DAD;">UT:${iv._numCaserne}</span> `:'')}
      ${!iv._isRenfort&&iv._numMois?`<span style="color:#C0392B;">M:${iv._numMois}</span>`:''}
      ${iv._numSDIS?`<span style="color:#003399;"> S:${iv._numSDIS}</span>`:''}
    </span>`:''}
  </span>
  <span style="font-size:11px;color:var(--t2);text-align:right;">${iv.addr?escHtml(iv.addr)+', ':''}${escHtml(iv.com||'')}${(iv._hDebut||iv._hFin)?`<br><span style="font-size:10px;color:var(--t3);">${iv._hDebut?'🕐 '+escHtml(iv._hDebut):''}${iv._hDebut&&iv._hFin?' → ':''}${iv._hFin?escHtml(iv._hFin):''}</span>`:''}</span>
  <span class="bdg ${iv.s==='terminee'?'bg2':iv.s==='avis-passage'?'bp':iv.s==='annulee'?'bgr':'ba'}" style="font-size:10px;">${iv.s==='terminee'?'✓':iv.s==='avis-passage'?'&#x1F7E3;':iv.s==='annulee'?'✕':'↻'}</span>
  ${iv._mailsEnvoyes&&iv._mailsEnvoyes.length?'<span title="Envoyé par mail ('+iv._mailsEnvoyes.length+'x)" style="font-size:11px;margin-left:3px;">✉️</span>':''}
  <span class="hist-report-flags">
    ${iv.s==='terminee'&&iv._crValide?'<span class="hist-report-badge validated" title="Le compte rendu est validé">✅ Rapport validé</span>':iv.s==='terminee'&&(iv._crTexte||iv._compteRendu)?'<span class="hist-report-badge pending" title="Compte rendu en attente de validation">📋 Non validé</span>':''}
    ${iv._impressions&&iv._impressions.length?'<span class="hist-report-badge printed" title="Rapport imprimé '+iv._impressions.length+' fois">🖨️ Rapport imprimé'+(iv._impressions.length>1?' ×'+iv._impressions.length:'')+'</span>':''}
  </span>
</div>`).join('')}`;}).join('')}</div>`;
    }).join('')}</div></div>`;
  }).join('');
}
function tg(id,aid){const el=document.getElementById(id);if(!el)return;const v=el.style.display!=='none';el.style.display=v?'none':'';const a=document.getElementById(aid);if(a)a.textContent=v?'▶':'▼';}

// ────────────────── PROFIL ──────────────────
function rProfil(){
  if(!CU)return;
  const ini=(CU.prenom||'?')[0].toUpperCase()+(CU.nom||'?')[0].toUpperCase();
  document.getElementById('prof-avatar').textContent=ini;
  document.getElementById('prof-name').textContent=(CU.prenom||'')+' '+(CU.nom||'');
  document.getElementById('prof-grade-lbl').textContent='Grade : '+(CU.grade||'—');
  // Champs affichés en lecture seule
  const prenomInp=document.getElementById('prof-prenom');
  if(prenomInp)prenomInp.value=CU.prenom||'';
  const nomInp=document.getElementById('prof-nom');
  if(nomInp)nomInp.value=CU.nom||'';
  const gradeInp=document.getElementById('prof-grade-ro');
  if(gradeInp)gradeInp.value=CU.grade||'—';
  // Matricule : chercher dans USERS si absent sur CU (cas superadmin ou objet partiel)
  const uFull=USERS.find(x=>x.l===CU.l);
  const mat=(CU.matricule||uFull?.matricule||'').toString().trim();
  // Synchroniser sur CU pour les prochains accès
  if(mat&&!CU.matricule)CU.matricule=mat;
  const matLbl=document.getElementById('prof-matricule-lbl');
  if(matLbl)matLbl.textContent=mat?'Matricule : '+mat:'';
  const matInp=document.getElementById('prof-matricule');
  if(matInp)matInp.value=mat||'—';
  document.getElementById('prof-login').value=CU.l;
  // Fonctions formateur
  const ffEl=document.getElementById('prof-formateur');
  if(ffEl){
    const ff=(CU.fonctionsFormateur||uFull?.fonctionsFormateur||[]);
    ffEl.innerHTML=ff.length?ff.map(f=>`<span class="bdg bg2" style="margin:2px;">${escHtml(f)}</span>`).join(''):'<span style="color:var(--t2);font-size:12px;">Aucune</span>';
    ffEl.parentElement.style.display='';
  }
  // Bouton d'édition réservé au chef de corps (il modifie son compte global lui-même)
  const ccBtn=document.getElementById('prof-cc-edit-btn');
  if(ccBtn)ccBtn.style.display=(GLOBAL_ROLE==='chef_corps')?'':'none';
}
async function saveProfil(){
  const mdp=document.getElementById('prof-mdp').value;
  const mdp2=document.getElementById('prof-mdp2').value;
  const err=document.getElementById('prof-err');
  if(mdp&&mdp!==mdp2){err.style.display='block';err.textContent='Les mots de passe ne correspondent pas.';return;}
  err.style.display='none';
  if(mdp){
    const hashed=await hashPassword(mdp);
    const u=USERS.find(x=>x.l===CU.l);
    if(u)u.p=hashed;
    CU.p=hashed;
    // Si l'utilisateur connecté a le rôle superadmin (que le mode SA soit affiché
    // ou non), mettre aussi à jour son compte global GLOBAL_ACCOUNTS — sinon le
    // nouveau mot de passe ne s'appliquerait pas à la connexion superadmin.
    if(GLOBAL_ROLE==='superadmin'){
      const ga=GLOBAL_ACCOUNTS.find(a=>a.role==='superadmin'&&a.l===CU.l)||GLOBAL_ACCOUNTS.find(a=>a.role==='superadmin');
      if(ga)ga.p=hashed;
    }
  }
  document.getElementById('prof-mdp').value='';document.getElementById('prof-mdp2').value='';
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rProfil();showToast('Mot de passe enregistré !','success'); // push immédiat
}

