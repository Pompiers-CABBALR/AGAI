// === MODULE: formations.js ===
// ══════════════════════════════════════════════════════
// FORMATION
// ══════════════════════════════════════════════════════
function rFormation() {
  // Conserver le sous-onglet actif si possible, sinon fmpa par défaut
  const activeBtn=document.querySelector('#form-subtabs .btn.pr');
  if(activeBtn){
    const m=activeBtn.getAttribute('onclick').match(/'([^']+)'/);
    if(m)return showFormTab(m[1],activeBtn);
  }
  showFormTab('fmpa', document.getElementById('form-btn-fmpa'));
}

function showFormTab(tab, btn) {
  document.querySelectorAll('#form-subtabs .btn').forEach(b => b.classList.remove('pr'));
  if (btn) btn.classList.add('pr');
  document.getElementById('form-tab-fmpa').style.display = tab === 'fmpa' ? '' : 'none';
  document.getElementById('form-tab-stagiaires').style.display = tab === 'stagiaires' ? '' : 'none';
  document.getElementById('form-tab-formateurs').style.display = tab === 'formateurs' ? '' : 'none';
  if (tab === 'fmpa') rFmpaInit();
  else if (tab === 'stagiaires') rFormStagiaires();
  else if (tab === 'formateurs') rFormFormateurs();
}

// ── Heures stagiaires ──
function fmpaMinutes(f){
  if(!f.hDebut||!f.hFin)return 0;
  const [h,m]=f.hDebut.split(':').map(Number),[h2,m2]=f.hFin.split(':').map(Number);
  let mins=(h2*60+m2)-(h*60+m);if(mins<0)mins+=1440;return mins;
}
function fmpaMinToStr(mins){return Math.floor(mins/60)+'h'+String(mins%60).padStart(2,'0');}

// ══════════════════════════════════════════════════════
// FORMATIONS STAGIAIRES & FORMATEURS
// ══════════════════════════════════════════════════════
function formStagGetData(){
  return (CURRENT_CASERNE_ID&&CASERNE_DATA[CURRENT_CASERNE_ID])
    ?(CASERNE_DATA[CURRENT_CASERNE_ID].formStag||(CASERNE_DATA[CURRENT_CASERNE_ID].formStag=[]))
    :[];
}
function formFormGetData(){
  return (CURRENT_CASERNE_ID&&CASERNE_DATA[CURRENT_CASERNE_ID])
    ?(CASERNE_DATA[CURRENT_CASERNE_ID].formForm||(CASERNE_DATA[CURRENT_CASERNE_ID].formForm=[]))
    :[];
}

// ── Helper ──
function formSlotMins(hd,hf){
  if(!hd||!hf)return 0;
  const [h,m]=hd.split(':').map(Number),[h2,m2]=hf.split(':').map(Number);
  const mins=(h2*60+m2)-(h*60+m);
  return mins>0?mins:0;
}
function formMinsToHStr(mins){return Math.floor(mins/60)+'h'+String(mins%60).padStart(2,'0');}

// ── Calcul durée (matin + après-midi, multi-jours) ──
function formCalcDuree(pfx){
  const dd=document.getElementById('f'+pfx+'-ddebut')?.value;
  const df=document.getElementById('f'+pfx+'-dfin')?.value;
  const hmd=document.getElementById('f'+pfx+'-hmatin-d')?.value;
  const hmf=document.getElementById('f'+pfx+'-hmatin-f')?.value;
  const had=document.getElementById('f'+pfx+'-haprem-d')?.value;
  const haf=document.getElementById('f'+pfx+'-haprem-f')?.value;
  const elJour=document.getElementById('f'+pfx+'-hjour');
  const elTotal=document.getElementById('f'+pfx+'-htotal');
  if(!elJour||!elTotal)return;
  if(!dd||!df){elJour.value='';elTotal.value='';return;}
  const d1=new Date(dd+'T00:00:00'),d2=new Date(df+'T00:00:00');
  if(d2<d1){elJour.value='\u26a0 Dates invalides';elTotal.value='';return;}
  const nbJours=Math.round((d2-d1)/(1000*60*60*24))+1;
  const minsMatin=formSlotMins(hmd,hmf);
  const minsAprem=formSlotMins(had,haf);
  const minsJour=minsMatin+minsAprem;
  const parts=[];
  if(minsMatin>0)parts.push('Matin '+formMinsToHStr(minsMatin));
  if(minsAprem>0)parts.push('AM '+formMinsToHStr(minsAprem));
  elJour.value=minsJour>0?(parts.join(' + ')+' = '+formMinsToHStr(minsJour)+'/j'):'(heures non renseignées)';
  elTotal.value=nbJours+'j × '+formMinsToHStr(minsJour)+' = '+formMinsToHStr(minsJour*nbJours);
}

function formMinsTotal(f){
  if(!f.ddebut||!f.dfin)return 0;
  const d1=new Date(f.ddebut+'T00:00:00'),d2=new Date(f.dfin+'T00:00:00');
  const nbJ=Math.max(1,Math.round((d2-d1)/(1000*60*60*24))+1);
  const minsMatin=formSlotMins(f.hmatind,f.hmatinf);
  const minsAprem=formSlotMins(f.hapremd,f.hapremf);
  return (minsMatin+minsAprem)*nbJ;
}
function formMinsToStr(m){return Math.floor(m/60)+'h'+String(m%60).padStart(2,'0');}

// ── Chargement participants ──
function formLoadAgents(containerId, existingList, accentColor){
  const el=document.getElementById(containerId);
  if(!el)return;
  const agents=[...(USERS||[])].sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  if(!agents.length){el.innerHTML='<div style="color:var(--t2);">Aucun agent disponible.</div>';return;}
  el.innerHTML=agents.map(u=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd);cursor:pointer;font-size:12px;">
    <input type="checkbox" value="${u.l}" ${(existingList||[]).includes(u.l)?'checked':''} style="width:15px;height:15px;accent-color:${accentColor||'var(--red)'};">
    <span>${u.nom} ${u.prenom}</span>
    <span style="font-size:11px;color:var(--t3);margin-left:auto;">${u.grade||'—'}</span>
  </label>`).join('');
}

// ── Toggle formulaire ──
function formStagToggleForm(){
  const panel=document.getElementById('formstag-form-panel');
  const btn=document.getElementById('formstag-new-btn');
  const open=panel.style.display==='none'||!panel.style.display;
  panel.style.display=open?'block':'none';
  if(btn){btn.style.display=open?'none':'';btn.textContent='+ Nouvelle formation';}
  if(open){
    ['fstag-titre','fstag-ref','fstag-lieu','fstag-ddebut','fstag-dfin','fstag-hmatin-d','fstag-hmatin-f','fstag-haprem-d','fstag-haprem-f','fstag-hjour','fstag-htotal'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    formLoadAgents('fstag-participants',[],'var(--blu)');
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
}
function formFormToggleForm(){
  const panel=document.getElementById('formform-form-panel');
  const btn=document.getElementById('formform-new-btn');
  const open=panel.style.display==='none'||!panel.style.display;
  panel.style.display=open?'block':'none';
  if(btn){btn.style.display=open?'none':'';btn.textContent='+ Nouvelle formation';}
  if(open){
    ['fform-titre','fform-ref','fform-lieu','fform-ddebut','fform-dfin','fform-hmatin-d','fform-hmatin-f','fform-haprem-d','fform-haprem-f','fform-hjour','fform-htotal'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    formLoadAgents('fform-participants',[],'var(--grn)');
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
}

// ── Rendu liste + récap ──
function rFormStagiaires(){
  const panel=document.getElementById('formstag-form-panel');
  if(panel)panel.style.display='none';
  const btn=document.getElementById('formstag-new-btn');
  if(btn){btn.style.display='';btn.textContent='+ Nouvelle formation';}
  rFormStagList();
  rFormStagRecap();
}
function rFormFormateurs(){
  const panel=document.getElementById('formform-form-panel');
  if(panel)panel.style.display='none';
  const btn=document.getElementById('formform-new-btn');
  if(btn){btn.style.display='';btn.textContent='+ Nouvelle formation';}
  rFormFormList();
  rFormFormRecap();
}

function rFormStagList(){
  const el=document.getElementById('formstag-list');
  if(!el)return;
  const data=formStagGetData();
  const isAdmin=isAdminModeActive();
  if(!data.length){el.innerHTML='<div style="text-align:center;padding:16px;color:var(--t2);font-size:13px;">Aucune formation enregistrée.</div>';return;}
  const sorted=[...data].sort((a,b)=>b.ddebut.localeCompare(a.ddebut));
  const MO=['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const grp={};
  sorted.forEach(f=>{
    const y=f.ddebut.slice(0,4),m=f.ddebut.slice(5,7);
    if(!grp[y])grp[y]={};
    if(!grp[y][m])grp[y][m]=[];
    grp[y][m].push(f);
  });
  const ys=Object.keys(grp).sort((a,b)=>b-a);
  el.innerHTML=ys.map(y=>{
    const ms=Object.keys(grp[y]).sort((a,b)=>b-a);
    const tot=ms.reduce((s,m)=>s+grp[y][m].length,0);
    return `<div class="hgrp"><div class="hgh" onclick="tg('fstagy${y}','afstagy${y}')">📅 ${y}<span class="bdg bgr" style="margin-left:auto;">${tot}</span><span id="afstagy${y}" style="margin-left:6px;">▼</span></div>
    <div id="fstagy${y}" class="hgb">${ms.map(m=>{
      const tm=grp[y][m].length;
      return `<div class="hsub" onclick="tg('fstm${y}${m}','afstm${y}${m}')">${MO[parseInt(m)]}<span class="bdg bgr" style="margin-left:6px;">${tm}</span><span id="afstm${y}${m}" style="margin-left:auto;">▼</span></div>
      <div id="fstm${y}${m}">${grp[y][m].map(f=>{
        const nbP=(f.participants||[]).length;
        const mins=formMinsTotal(f);
        return `<div class="hm" onclick="formVoirDetail('stag','${f.id}')">
          <span style="font-family:monospace;font-size:10px;color:var(--t3);">${f.ddebut.slice(8,10)}/${m}/${y}${f.dfin!==f.ddebut?' → '+f.dfin.slice(8,10)+'/'+f.dfin.slice(5,7):''}</span>
          <span style="flex:1;font-size:12px;color:var(--t);">👨‍🎓 ${f.titre}${f.ref?' <small style="color:var(--t2);">['+f.ref+']</small>':''}</span>
          <span style="font-size:11px;color:var(--t2);">${formMinsToStr(mins)} · ${nbP}p${f.lieu?' · '+f.lieu:''}</span>
          ${isSuperAdmin()?`<button class="btn sm danger" style="font-size:10px;padding:1px 5px;margin-left:4px;" onclick="event.stopPropagation();deleteFormEntry('stag','${f.id}')">🗑</button>`:''}
        </div>`;
      }).join('')}</div>`;
    }).join('')}</div></div>`;
  }).join('');
}

function rFormFormList(){
  const el=document.getElementById('formform-list');
  if(!el)return;
  const data=formFormGetData();
  const isAdmin=isAdminModeActive();
  if(!data.length){el.innerHTML='<div style="text-align:center;padding:16px;color:var(--t2);font-size:13px;">Aucune formation enregistrée.</div>';return;}
  const sorted=[...data].sort((a,b)=>b.ddebut.localeCompare(a.ddebut));
  const MO=['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const grp={};
  sorted.forEach(f=>{
    const y=f.ddebut.slice(0,4),m=f.ddebut.slice(5,7);
    if(!grp[y])grp[y]={};
    if(!grp[y][m])grp[y][m]=[];
    grp[y][m].push(f);
  });
  const ys=Object.keys(grp).sort((a,b)=>b-a);
  el.innerHTML=ys.map(y=>{
    const ms=Object.keys(grp[y]).sort((a,b)=>b-a);
    const tot=ms.reduce((s,m)=>s+grp[y][m].length,0);
    return `<div class="hgrp"><div class="hgh" onclick="tg('fformy${y}','afformy${y}')">📅 ${y}<span class="bdg bgr" style="margin-left:auto;">${tot}</span><span id="afformy${y}" style="margin-left:6px;">▼</span></div>
    <div id="fformy${y}" class="hgb">${ms.map(m=>{
      const tm=grp[y][m].length;
      return `<div class="hsub" onclick="tg('fform${y}${m}','afform${y}${m}')">${MO[parseInt(m)]}<span class="bdg bgr" style="margin-left:6px;">${tm}</span><span id="afform${y}${m}" style="margin-left:auto;">▼</span></div>
      <div id="fform${y}${m}">${grp[y][m].map(f=>{
        const nbP=(f.participants||[]).length;
        const mins=formMinsTotal(f);
        return `<div class="hm" onclick="formVoirDetail('form','${f.id}')">
          <span style="font-family:monospace;font-size:10px;color:var(--t3);">${f.ddebut.slice(8,10)}/${m}/${y}${f.dfin!==f.ddebut?' → '+f.dfin.slice(8,10)+'/'+f.dfin.slice(5,7):''}</span>
          <span style="flex:1;font-size:12px;color:var(--t);">👨‍🏫 ${f.titre}${f.ref?' <small style="color:var(--t2);">['+f.ref+']</small>':''}</span>
          <span style="font-size:11px;color:var(--t2);">${formMinsToStr(mins)} · ${nbP}f${f.lieu?' · '+f.lieu:''}</span>
          ${isSuperAdmin()?`<button class="btn sm danger" style="font-size:10px;padding:1px 5px;margin-left:4px;" onclick="event.stopPropagation();deleteFormEntry('form','${f.id}')">🗑</button>`:''}
        </div>`;
      }).join('')}</div>`;
    }).join('')}</div></div>`;
  }).join('');
}

function rFormStagRecap(){
  const el=document.getElementById('formstag-recap');
  if(!el)return;
  const data=formStagGetData();
  const byAgent={};
  data.forEach(f=>{
    const mins=formMinsTotal(f);
    (f.participants||[]).forEach(l=>{
      if(!byAgent[l])byAgent[l]={total:0,sessions:[]};
      byAgent[l].total+=mins;
      byAgent[l].sessions.push({titre:f.titre,ddebut:f.ddebut,dfin:f.dfin,duree:formMinsToStr(mins),ref:f.ref});
    });
  });
  const agents=[...(USERS||[])].sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
  const rows=agents.filter(u=>byAgent[u.l]).map(u=>{
    const d=byAgent[u.l];
    return `<div class="ivr" style="border-left-color:var(--blu);">
      <div class="ivrl" onclick="formToggleDetail(this)" style="cursor:pointer;">
        <div class="ivrn"><strong>${u.nom} ${u.prenom}</strong></div>
        <div class="ivrc">${d.sessions.length} formation${d.sessions.length>1?'s':''} · Total : <strong>${formMinsToStr(d.total)}</strong></div>
      </div>
      <span class="bdg bb">${formMinsToStr(d.total)}</span>
      <div class="form-detail" style="display:none;width:100%;margin-top:6px;padding-top:6px;border-top:1px solid var(--brd);">
        ${d.sessions.map(s=>`<div style="font-size:11px;color:var(--t2);padding:2px 0;">${s.ddebut}${s.dfin!==s.ddebut?' → '+s.dfin:''} — ${s.titre}${s.ref?' ['+s.ref+']':''} (${s.duree})</div>`).join('')}
      </div>
    </div>`;
  }).join('');
  el.innerHTML=rows||'<div style="text-align:center;padding:16px;color:var(--t2);font-size:13px;">Aucun stagiaire enregistré.</div>';
}

function rFormFormRecap(){
  const el=document.getElementById('formform-recap');
  if(!el)return;
  const data=formFormGetData();
  const byAgent={};
  data.forEach(f=>{
    const mins=formMinsTotal(f);
    (f.participants||[]).forEach(l=>{
      if(!byAgent[l])byAgent[l]={total:0,sessions:[]};
      byAgent[l].total+=mins;
      byAgent[l].sessions.push({titre:f.titre,ddebut:f.ddebut,dfin:f.dfin,duree:formMinsToStr(mins),ref:f.ref});
    });
  });
  const agents=[...(USERS||[])].sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
  const rows=agents.filter(u=>byAgent[u.l]).map(u=>{
    const d=byAgent[u.l];
    return `<div class="ivr" style="border-left-color:var(--grn);">
      <div class="ivrl" onclick="formToggleDetail(this)" style="cursor:pointer;">
        <div class="ivrn"><strong>${u.nom} ${u.prenom}</strong></div>
        <div class="ivrc">${d.sessions.length} formation${d.sessions.length>1?'s':''} · Total : <strong>${formMinsToStr(d.total)}</strong></div>
      </div>
      <span class="bdg bg2">${formMinsToStr(d.total)}</span>
      <div class="form-detail" style="display:none;width:100%;margin-top:6px;padding-top:6px;border-top:1px solid var(--brd);">
        ${d.sessions.map(s=>`<div style="font-size:11px;color:var(--t2);padding:2px 0;">${s.ddebut}${s.dfin!==s.ddebut?' → '+s.dfin:''} — ${s.titre}${s.ref?' ['+s.ref+']':''} (${s.duree})</div>`).join('')}
      </div>
    </div>`;
  }).join('');
  el.innerHTML=rows||'<div style="text-align:center;padding:16px;color:var(--t2);font-size:13px;">Aucun formateur enregistré.</div>';
}

function formToggleDetail(ivrl){
  const det=ivrl.closest('.ivr').querySelector('.form-detail');
  if(det)det.style.display=det.style.display==='none'?'':'none';
}

// ── Enregistrement ──
// === P9 : Factorisation — saveFormStag et saveFormForm partagent la même logique ===
function _saveFormEntry(pfx,idPrefix,getDataFn,toggleFn,listFn,recapFn){
  const titre=(document.getElementById(pfx+'-titre')?.value||'').trim();
  const ref=(document.getElementById(pfx+'-ref')?.value||'').trim();
  const lieu=(document.getElementById(pfx+'-lieu')?.value||'').trim();
  const ddebut=document.getElementById(pfx+'-ddebut')?.value;
  const dfin=document.getElementById(pfx+'-dfin')?.value;
  const hmatind=document.getElementById(pfx+'-hmatin-d')?.value;
  const hmatinf=document.getElementById(pfx+'-hmatin-f')?.value;
  const hapremd=document.getElementById(pfx+'-haprem-d')?.value;
  const hapremf=document.getElementById(pfx+'-haprem-f')?.value;
  const hjour=document.getElementById(pfx+'-hjour')?.value||'';
  const htotal=document.getElementById(pfx+'-htotal')?.value||'';
  const err=document.getElementById(pfx+'-err');
  err.style.display='none';
  if(!titre||!ddebut||!dfin){err.style.display='block';err.textContent='Intitulé, date début et date fin sont obligatoires.';return;}
  if(dfin<ddebut){err.style.display='block';err.textContent='La date de fin ne peut pas être avant la date de début.';return;}
  const participants=Array.from(document.querySelectorAll('#'+pfx+'-participants input:checked')).map(cb=>cb.value);
  const id=idPrefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  getDataFn().push({id,titre,ref,lieu,ddebut,dfin,hmatind,hmatinf,hapremd,hapremf,hjour,htotal,participants,auteur:CU?CU.l:'',ts:Date.now()});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : sinon risque d'écrasement au prochain pull
  toggleFn();
  listFn();recapFn();
  showToast('Formation enregistrée ✓','success');
}
function saveFormStag(){_saveFormEntry('fstag','FSTAG',formStagGetData,formStagToggleForm,rFormStagList,rFormStagRecap);}
function saveFormForm(){_saveFormEntry('fform','FFORM',formFormGetData,formFormToggleForm,rFormFormList,rFormFormRecap);}

// ── Détail modal ──
function formVoirDetail(type,id){
  const data=type==='stag'?formStagGetData():formFormGetData();
  const f=data.find(x=>x.id===id);
  if(!f)return;
  const sortedP=[...(f.participants||[])].sort((la,lb)=>{const ua=USERS.find(x=>x.l===la),ub=USERS.find(x=>x.l===lb);return (ua?ua.nom:la).localeCompare(ub?ub.nom:lb,'fr');});
  const presListe=sortedP.map(l=>{const u=USERS.find(x=>x.l===l);return u?((u.grade?u.grade+' ':'')+u.nom+' '+u.prenom):l;}).join('<br>');
  const mins=formMinsTotal(f);
  document.getElementById('mt').textContent=(type==='stag'?'👨‍🎓':'👨‍🏫')+' '+f.titre;
  document.getElementById('mi').textContent=f.ddebut+(f.dfin!==f.ddebut?' → '+f.dfin:'')+(f.lieu?' · '+f.lieu:'');
  document.getElementById('mb').innerHTML=`<div>
    ${f.ref?`<div class="mr"><div class="ml">Référence</div><div class="mv2">${f.ref}</div></div>`:''}
    <div class="mr"><div class="ml">Période</div><div class="mv2">${f.ddebut}${f.dfin!==f.ddebut?' → '+f.dfin:''}</div></div>
    ${(f.hmatind||f.hmatinf)?`<div class="mr"><div class="ml">Matin</div><div class="mv2">${f.hmatind||'—'} → ${f.hmatinf||'—'}</div></div>`:''}
    ${(f.hapremd||f.hapremf)?`<div class="mr"><div class="ml">Après-midi</div><div class="mv2">${f.hapremd||'—'} → ${f.hapremf||'—'}</div></div>`:''}
    <div class="mr"><div class="ml">Heures/jour</div><div class="mv2">${f.hjour||'—'}</div></div>
    <div class="mr"><div class="ml">Total créneau</div><div class="mv2"><strong>${formMinsToStr(mins)}</strong></div></div>
    ${f.lieu?`<div class="mr"><div class="ml">Lieu</div><div class="mv2">${f.lieu}</div></div>`:''}
    <div class="msep"></div>
    <div class="mr"><div class="ml">${type==='stag'?'Stagiaires':'Formateurs'} (${sortedP.length})</div><div class="mv2" style="font-size:12px;line-height:1.8;">${presListe||'—'}</div></div>
    <div class="brow" style="margin-top:12px;">
      ${isSuperAdmin()?`<button class="btn sm danger" onclick="cM();deleteFormEntry('${type}','${id}')">🗑 Supprimer</button>`:''}
      <button class="btn sm" onclick="cM()">Fermer</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}

// ── Suppression ──
function deleteFormEntry(type,id){
  if(!isSuperAdmin()){showToast('Accès réservé au super-administrateur','warn');return;}
  const data=type==='stag'?formStagGetData():formFormGetData();
  const idx=data.findIndex(x=>x.id===id);
  if(idx>=0){
    confirmModal('Supprimer définitivement cette formation ?',async function(){
      // Propager la suppression au serveur, sinon la formation revient au prochain pull
      const recType=(type==='stag')?'formStag':'formForm';
      if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcMarkDeleted==='function'&&CURRENT_CASERNE_ID){
        try{await _rcMarkDeleted(CURRENT_CASERNE_ID,recType,[id]);}catch(e){}
      }
      data.splice(idx,1);
      if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
      saveData(true);
      if(type==='stag'){rFormStagList();rFormStagRecap();}
      else{rFormFormList();rFormFormRecap();}
      showToast('Formation supprimée','success');
    });
  }
}

// ══════════════════════════════════════════════════════
// FMPA — Formation de Maintien et de Perfectionnement des Acquis
// ══════════════════════════════════════════════════════
function fmpaGetData(){
  return (CURRENT_CASERNE_ID&&CASERNE_DATA[CURRENT_CASERNE_ID])
    ?(CASERNE_DATA[CURRENT_CASERNE_ID].fmpas||(CASERNE_DATA[CURRENT_CASERNE_ID].fmpas=[]))
    :[];
}

// ── Numérotation ──
function fmpaNextNum(date){
  const data=fmpaGetData();
  const y=date.slice(0,4);
  return (data.filter(f=>f.date&&f.date.startsWith(y)).map(f=>f.numAnnuel||0).reduce((mx,v)=>Math.max(mx,v),0))+1;
}
function fmpaFmtAn(f){ return f.date.slice(0,4)+'-FMPA-'+String(f.numAnnuel).padStart(4,'0'); }
function fmpaNumStr(f){ return fmpaFmtAn(f); }

// ── Calcul durée ──
function fmpaCalcDuree(){
  const hd=document.getElementById('fmpa-hdebut')?.value;
  const hf=document.getElementById('fmpa-hfin')?.value;
  const el=document.getElementById('fmpa-duree');
  if(!el)return;
  if(hd&&hf){
    const [h,m]=hd.split(':').map(Number),[h2,m2]=hf.split(':').map(Number);
    let mins=(h2*60+m2)-(h*60+m);if(mins<0)mins+=1440;
    el.value=Math.floor(mins/60)+'h'+String(mins%60).padStart(2,'0');
  }else el.value='';
}

// ── Aperçu numéro ──
function fmpaDateChange(){
  const d=document.getElementById('fmpa-date')?.value;
  const p=document.getElementById('fmpa-num-preview');
  if(!p)return;
  if(!d){p.textContent='';return;}
  const now=new Date();now.setHours(0,0,0,0);
  const sel=new Date(d+'T00:00:00');
  if(sel>now){p.textContent='\u26a0 La date ne peut pas \u00eatre dans le futur.';p.style.color='#E24B4A';return;}
  const numAnnuel=fmpaNextNum(d);
  p.style.color='var(--t2)';
  p.textContent='\u2192 '+d.slice(0,4)+'-FMPA-'+String(numAnnuel).padStart(4,'0');
}

// ── Chargement participants triés alpha ──
function fmpaAgentCheckboxes(containerId, existingList, accentColor, excludeIds){
  const el=document.getElementById(containerId);
  if(!el)return;
  const excluded=excludeIds||[];
  const agents=[...(USERS||[])].filter(u=>!excluded.includes(u.l))
    .sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  if(!agents.length){el.innerHTML='<div style="color:var(--t2);font-size:12px;">Aucun agent disponible.</div>';return;}
  el.innerHTML=agents.map(u=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd);cursor:pointer;font-size:12px;">
    <input type="checkbox" value="${u.l}" ${(existingList||[]).includes(u.l)?'checked':''} style="width:15px;height:15px;accent-color:${accentColor||'var(--red)'};" onchange="fmpaSyncLists()">
    <span>${u.nom} ${u.prenom}</span>
    <span style="font-size:11px;color:var(--t3);margin-left:auto;">${u.grade||'—'}</span>
  </label>`).join('');
}

function fmpaFormateurCheckboxes(containerId, existingList, excludeIds){
  const el=document.getElementById(containerId);
  if(!el)return;
  const excluded=excludeIds||[];
  const formateurs=[...(USERS||[])].filter(u=>u.fonctionsFormateur&&u.fonctionsFormateur.length>0&&!excluded.includes(u.l))
    .sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  if(!formateurs.length){el.innerHTML='<div style="color:var(--t2);font-size:12px;">Aucun formateur défini.<br><span style="font-size:11px;">Assignez des fonctions formateur dans ⚙️ Paramètres → Admin.</span></div>';return;}
  el.innerHTML=formateurs.map(u=>{
    const fns=(u.fonctionsFormateur||[]).join(', ');
    return `<label style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd);cursor:pointer;font-size:12px;">
      <input type="checkbox" value="${u.l}" ${(existingList||[]).includes(u.l)?'checked':''} style="width:15px;height:15px;accent-color:var(--grn);margin-top:2px;flex-shrink:0;" onchange="fmpaSyncLists()">
      <div style="min-width:0;">
        <div>${u.nom} ${u.prenom} <span style="font-size:11px;color:var(--t3);">${u.grade||''}</span></div>
        <div style="font-size:10px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fns}</div>
      </div>
    </label>`;
  }).join('');
}

// Synchronise les deux listes : un formateur coché disparaît des stagiaires et vice-versa
function fmpaSyncLists(){
  const checkedForm=Array.from(document.querySelectorAll('#fmpa-formateurs input[type=checkbox]:checked')).map(cb=>cb.value);
  const checkedPart=Array.from(document.querySelectorAll('#fmpa-participants input[type=checkbox]:checked')).map(cb=>cb.value);
  fmpaAgentCheckboxes('fmpa-participants', checkedPart, 'var(--red)', checkedForm);
  fmpaFormateurCheckboxes('fmpa-formateurs', checkedForm, checkedPart);
}

// ── Initialisation onglet ──
function fmpaToggleForm(){
  const panel=document.getElementById('fmpa-form-panel');
  const btn=document.getElementById('fmpa-new-btn');
  const willOpen=panel.style.display==='none'||panel.style.display==='';
  panel.style.display=willOpen?'block':'none';
  if(btn){btn.style.display=willOpen?'none':'';btn.textContent='+ Nouvelle FMPA';}
  if(willOpen){
    const now=new Date();
    const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    const dateEl=document.getElementById('fmpa-date');
    if(dateEl){dateEl.value=today;fmpaDateChange();}
    document.getElementById('fmpa-theme').value='';
    document.getElementById('fmpa-hdebut').value='';
    document.getElementById('fmpa-hfin').value='';
    document.getElementById('fmpa-duree').value='';
    fmpaAgentCheckboxes('fmpa-participants',[],'var(--red)');
    fmpaFormateurCheckboxes('fmpa-formateurs',[]);
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
}

function rFmpaInit(){
  const panel=document.getElementById('fmpa-form-panel');
  if(panel)panel.style.display='none';
  const btn=document.getElementById('fmpa-new-btn');
  if(btn){btn.style.display='';btn.textContent='+ Nouvelle FMPA';}
  rFmpaList();
}

// ── Liste ──
function rFmpaList(){
  const list=document.getElementById('fmpa-list');
  if(!list)return;
  const data=fmpaGetData();
  if(!data.length){list.innerHTML='<div style="text-align:center;padding:20px;color:var(--t2);font-size:13px;">Aucune FMPA enregistrée.</div>';return;}
  const sorted=[...data].sort((a,b)=>b.date.localeCompare(a.date)||b.ts-a.ts);
  const isAdmin=isAdminModeActive();
  const MO=['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const grp={};
  sorted.forEach(f=>{
    const y=f.date.slice(0,4),m=f.date.slice(5,7);
    if(!grp[y])grp[y]={};
    if(!grp[y][m])grp[y][m]=[];
    grp[y][m].push(f);
  });
  const ys=Object.keys(grp).sort((a,b)=>b-a);
  list.innerHTML=ys.map(y=>{
    const ms=Object.keys(grp[y]).sort((a,b)=>b-a);
    const tot=ms.reduce((s,m)=>s+grp[y][m].length,0);
    return `<div class="hgrp"><div class="hgh" onclick="tg('fmpay${y}','afmpay${y}')">📅 ${y}<span class="bdg bgr" style="margin-left:auto;">${tot}</span><span id="afmpay${y}" style="margin-left:6px;">▼</span></div>
    <div id="fmpay${y}" class="hgb">${ms.map(m=>{
      const tm=grp[y][m].length;
      return `<div class="hsub" onclick="tg('fmpam${y}${m}','afmpam${y}${m}')">${MO[parseInt(m)]}<span class="bdg bgr" style="margin-left:6px;">${tm}</span><span id="afmpam${y}${m}" style="margin-left:auto;">▼</span></div>
      <div id="fmpam${y}${m}">${grp[y][m].map(f=>{
        const nbP=(f.participants||[]).length;
        const nbF=(f.formateurs||[]).length;
        const numStr=f.numAnnuel?fmpaNumStr(f):'—';
        return `<div class="hm" onclick="fmpaVoirDetail('${f.id}')">
          <span style="font-family:monospace;font-size:10px;color:var(--t3);">${f.date.slice(8,10)}/${m}/${y}</span>
          <span style="flex:1;font-size:12px;color:var(--t);">🚒 ${f.theme}</span>
          <span style="font-size:11px;color:var(--t2);">${f.hDebut||''}${f.hFin?' → '+f.hFin:''} ${f.duree?'· '+f.duree:''} · ${nbP}s/${nbF}f</span>

          ${isAdmin?`<button class="btn sm" style="font-size:10px;padding:1px 5px;" onclick="event.stopPropagation();fmpaEditer('${f.id}')">✏️</button>`:''}
          ${isSuperAdmin()?`<button class="btn sm danger" style="font-size:10px;padding:1px 5px;" onclick="event.stopPropagation();deleteFmpa('${f.id}')">🗑</button>`:''}
        </div>`;
      }).join('')}</div>`;
    }).join('')}</div></div>`;
  }).join('');
}

// ── Enregistrement ──
function saveFmpa(){
  const date=document.getElementById('fmpa-date')?.value;
  const theme=(document.getElementById('fmpa-theme')?.value||'').trim();
  const hd=document.getElementById('fmpa-hdebut')?.value;
  const hf=document.getElementById('fmpa-hfin')?.value;
  const duree=document.getElementById('fmpa-duree')?.value||'';
  const err=document.getElementById('fmpa-err');
  err.style.display='none';
  if(!date||!theme||!hd||!hf){err.style.display='block';err.textContent='Date, thème et heures sont obligatoires.';return;}
  const now=new Date();now.setHours(0,0,0,0);
  if(new Date(date+'T00:00:00')>now){err.style.display='block';err.textContent='La date ne peut pas être dans le futur.';return;}
  const participants=Array.from(document.querySelectorAll('#fmpa-participants input[type=checkbox]:checked')).map(cb=>cb.value);
  const formateurs=Array.from(document.querySelectorAll('#fmpa-formateurs input[type=checkbox]:checked')).map(cb=>cb.value);
  const numAnnuel=fmpaNextNum(date);
  const id='FMPA_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const entry={id,date,theme,hDebut:hd,hFin:hf,duree,participants,formateurs,numAnnuel,
    auteur:CU?CU.l:'',auteurNom:CU?(CU.prenom+' '+CU.nom):'',ts:Date.now(),historique:[],impressions:[]};
  fmpaGetData().push(entry);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat
  // Reset
  ['fmpa-date','fmpa-theme','fmpa-hdebut','fmpa-hfin'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';});
  document.getElementById('fmpa-duree').value='';
  document.getElementById('fmpa-num-preview').textContent='';
  document.querySelectorAll('#fmpa-participants input[type=checkbox]').forEach(cb=>cb.checked=false);
  document.querySelectorAll('#fmpa-formateurs input[type=checkbox]').forEach(cb=>cb.checked=false);
  rFmpaList();
  const fp=document.getElementById('fmpa-form-panel');if(fp)fp.style.display='none';
  const fb=document.getElementById('fmpa-new-btn');if(fb){fb.style.display='';fb.textContent='+ Nouvelle FMPA';}
  showToast('FMPA '+fmpaFmtAn(entry)+' enregistr\u00e9e \u2713','success');
}

// ── Voir détail ──
function fmpaVoirDetail(id){
  const a=fmpaGetData().find(x=>x.id===id);
  if(!a)return;
  const isAdmin=isAdminModeActive();
  const nbP=(a.participants||[]).length;
  const sortedPart=[...(a.participants||[])].sort((la,lb)=>{
    const ua=USERS.find(x=>x.l===la),ub=USERS.find(x=>x.l===lb);
    return (ua?ua.nom:la).localeCompare(ub?ub.nom:lb,'fr');
  });
  const presListe=sortedPart.map(l=>{const u=USERS.find(x=>x.l===l);return u?((u.grade?u.grade+' ':'')+u.nom+' '+u.prenom):l;}).join('<br>');
  const sortedForm=[...(a.formateurs||[])].sort((la,lb)=>{const ua=USERS.find(x=>x.l===la),ub=USERS.find(x=>x.l===lb);return (ua?ua.nom:la).localeCompare(ub?ub.nom:lb,'fr');});
  const formListe=sortedForm.map(l=>{const u=USERS.find(x=>x.l===l);return u?((u.grade?u.grade+' ':'')+u.nom+' '+u.prenom):l;}).join('<br>');
  const nbF=sortedForm.length;
  const histHtml=(a.historique&&a.historique.length)?`<div style="background:var(--al);border-radius:8px;padding:10px;margin-top:8px;">
    <div style="font-size:11px;font-weight:700;color:#854F0B;text-transform:uppercase;margin-bottom:4px;">📝 Modifications</div>
    ${a.historique.map(h=>`<div style="font-size:11px;color:var(--t2);padding:2px 0;border-bottom:1px solid var(--brd);">${h.date} par ${h.auteurNom} — ${h.champs}</div>`).join('')}
  </div>`:'';
  const impressions=a.impressions||[];
  const printHtml=impressions.length?`<div style="background:var(--bg);border-radius:8px;padding:8px 10px;margin-top:8px;">
    <div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;margin-bottom:4px;">🖨 Impressions (${impressions.length})</div>
    ${impressions.map(p=>`<div style="font-size:11px;color:var(--t2);padding:2px 0;">${p.date} par ${p.auteurNom}</div>`).join('')}
  </div>`:'<div style="font-size:11px;color:var(--t3);margin-top:4px;">Rapport non encore imprimé.</div>';
  document.getElementById('mt').textContent='FMPA — '+fmpaNumStr(a);
  document.getElementById('mi').textContent=a.theme+' · '+a.date;
  document.getElementById('mb').innerHTML=`<div>
    <div class="mr"><div class="ml">Date</div><div class="mv2">${a.date}</div></div>
    <div class="mr"><div class="ml">Thème</div><div class="mv2">${a.theme}</div></div>
    <div class="mr"><div class="ml">Heures</div><div class="mv2">${a.hDebut||'—'} → ${a.hFin||'—'} (${a.duree||'—'})</div></div>
    <div class="mr"><div class="ml">Stagiaires (${nbP})</div><div class="mv2" style="font-size:12px;line-height:1.8;">${presListe||'—'}</div></div>
    <div class="mr"><div class="ml">Formateurs (${nbF})</div><div class="mv2" style="font-size:12px;line-height:1.8;">${formListe||'—'}</div></div>
    <div class="msep"></div>
    ${printHtml}
    ${histHtml}
    <div class="brow" style="margin-top:12px;">

      ${isAdmin?`<button class="btn sm" onclick="cM();fmpaEditer('${id}')">✏️ Modifier</button>`:''}
      ${isSuperAdmin()?`<button class="btn sm danger" onclick="cM();deleteFmpa('${id}')">🗑 Supprimer</button>`:''}
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}

// ── Modifier (admin uniquement) ──
function fmpaEditer(id){
  if(!isAdminModeActive()){showToast('Accès réservé aux administrateurs','warn');return;}
  const a=fmpaGetData().find(x=>x.id===id);
  if(!a)return;
  const sortedAgents=[...(USERS||[])].sort((u1,u2)=>u1.nom.localeCompare(u2.nom,'fr')||u1.prenom.localeCompare(u2.prenom,'fr'));
  const mkParticipantsOpts=(existing)=>sortedAgents.map(u=>`<label style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--brd);font-size:12px;">
    <input type="checkbox" value="${u.l}" ${existing.includes(u.l)?'checked':''} style="width:14px;height:14px;accent-color:var(--red);">
    <span>${u.nom} ${u.prenom}</span><span style="font-size:10px;color:var(--t3);margin-left:auto;">${u.grade||''}</span></label>`).join('');
  const formateursPool=sortedAgents.filter(u=>u.fonctionsFormateur&&u.fonctionsFormateur.length>0);
  const mkFormateursOpts=(existing)=>formateursPool.length?formateursPool.map(u=>{
    const fns=(u.fonctionsFormateur||[]).join(', ');
    return `<label style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid var(--brd);font-size:12px;">
      <input type="checkbox" value="${u.l}" ${existing.includes(u.l)?'checked':''} style="width:14px;height:14px;accent-color:var(--grn);margin-top:2px;flex-shrink:0;">
      <div><div>${u.nom} ${u.prenom} <span style="font-size:10px;color:var(--t3);">${u.grade||''}</span></div>
      <div style="font-size:10px;color:var(--t2);">${fns}</div></div></label>`;
  }).join(''):'<div style="color:var(--t2);font-size:11px;">Aucun formateur défini dans l\'admin.</div>';
  document.getElementById('mt').textContent='Modifier FMPA — '+fmpaNumStr(a);
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`<div>
    <div class="fg"><div class="fgl">Thème</div><input class="fi" type="text" id="fmedit-theme" value="${a.theme.replace(/"/g,'&quot;')}"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="fg"><div class="fgl">Heure début</div><input class="fi" type="time" id="fmedit-hd" value="${a.hDebut||''}" oninput="fmeditCalcDuree()"/></div>
      <div class="fg"><div class="fgl">Heure fin</div><input class="fi" type="time" id="fmedit-hf" value="${a.hFin||''}" oninput="fmeditCalcDuree()"/></div>
    </div>
    <div class="fg"><div class="fgl">Durée calculée</div><input class="fi" type="text" id="fmedit-duree" value="${a.duree||''}" readonly style="background:#f5f5f7;color:var(--t2);"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="fg"><div class="fgl">Stagiaires</div><div style="background:var(--bg);border-radius:10px;padding:8px;border:1px solid var(--brd);max-height:160px;overflow-y:auto;" id="fmedit-participants">${mkParticipantsOpts(a.participants||[])}</div></div>
      <div class="fg"><div class="fgl">Formateurs</div><div style="background:var(--bg);border-radius:10px;padding:8px;border:1px solid var(--brd);max-height:160px;overflow-y:auto;" id="fmedit-formateurs">${mkFormateursOpts(a.formateurs||[])}</div></div>
    </div>
    <div class="fg"><div class="fgl">Motif de modification <span class="req">*</span></div><input class="fi" type="text" id="fmedit-motif" placeholder="Ex : correction liste présents..."/></div>
    <div id="fmedit-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
    <div class="brow"><button class="btn pr sm" onclick="fmpaSaveEdit('${id}')">💾 Enregistrer</button><button class="btn sm" onclick="cM()">Annuler</button></div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function fmeditCalcDuree(){
  const hd=document.getElementById('fmedit-hd')?.value,hf=document.getElementById('fmedit-hf')?.value;
  const el=document.getElementById('fmedit-duree');if(!el)return;
  if(hd&&hf){const [h,m]=hd.split(':').map(Number),[h2,m2]=hf.split(':').map(Number);let mins=(h2*60+m2)-(h*60+m);if(mins<0)mins+=1440;el.value=Math.floor(mins/60)+'h'+String(mins%60).padStart(2,'0');}else el.value='';
}
function fmpaSaveEdit(id){
  const a=fmpaGetData().find(x=>x.id===id);
  if(!a)return;
  const motif=(document.getElementById('fmedit-motif')?.value||'').trim();
  const err=document.getElementById('fmedit-err');
  if(!motif){err.style.display='block';err.textContent='Le motif de modification est obligatoire.';return;}
  const newTheme=(document.getElementById('fmedit-theme')?.value||'').trim();
  const newHd=document.getElementById('fmedit-hd')?.value;
  const newHf=document.getElementById('fmedit-hf')?.value;
  const newDuree=document.getElementById('fmedit-duree')?.value;
  const newPart=Array.from(document.querySelectorAll('#fmedit-participants input[type=checkbox]:checked')).map(cb=>cb.value);
  const newForm=Array.from(document.querySelectorAll('#fmedit-formateurs input[type=checkbox]:checked')).map(cb=>cb.value);
  const champs=[];
  if(newTheme!==a.theme)champs.push('thème');
  if(newHd!==a.hDebut)champs.push('heure début');
  if(newHf!==a.hFin)champs.push('heure fin');
  if(JSON.stringify(newPart.slice().sort())!==JSON.stringify((a.participants||[]).slice().sort()))champs.push('stagiaires');
  if(JSON.stringify(newForm.slice().sort())!==JSON.stringify((a.formateurs||[]).slice().sort()))champs.push('formateurs');
  if(!a.historique)a.historique=[];
  const now=new Date();
  a.historique.push({date:now.toLocaleDateString('fr-FR')+' '+now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),auteur:CU?CU.l:'',auteurNom:CU?(CU.prenom+' '+CU.nom):'',champs:(champs.length?champs.join(', '):'(aucun champ modifié)')+' — '+motif});
  a.theme=newTheme;a.hDebut=newHd;a.hFin=newHf;a.duree=newDuree;a.participants=newPart;a.formateurs=newForm;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);cM();rFmpaList();showToast('FMPA modifiée \u2713','success'); // push immédiat
}

// ── Impression rapport FMPA ──
function fmpaImprimerRapport(id){
  const a=fmpaGetData().find(x=>x.id===id);
  if(!a){showToast('FMPA introuvable','warn');return;}
  const html=genRapportFmpaHTML(a);
  if(!a.impressions)a.impressions=[];
  const now=new Date();
  a.impressions.push({date:now.toLocaleDateString('fr-FR')+' '+now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),auteur:CU?CU.l:'',auteurNom:CU?(CU.prenom+' '+CU.nom):''});
  saveData();rFmpaList();
  openIframeModal(html,null);
}

function genRapportFmpaHTML(a){
  const JOURS_FR=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const MOIS_FR=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d=new Date(a.date+'T00:00:00');
  const dateLongue='Le '+JOURS_FR[d.getDay()]+' '+d.getDate()+' '+MOIS_FR[d.getMonth()]+' '+d.getFullYear();
  const numStr=a.numAnnuel?fmpaFmtAn(a):'\u2014';
  const B='1px solid #000';

  // Présents triés alphabétiquement
  const participants=[...(a.participants||[])].sort((la,lb)=>{const ua=USERS.find(x=>x.l===la),ub=USERS.find(x=>x.l===lb);return (ua?ua.nom:la).localeCompare(ub?ub.nom:lb,'fr');});
  const formateurs=[...(a.formateurs||[])].sort((la,lb)=>{const ua=USERS.find(x=>x.l===la),ub=USERS.find(x=>x.l===lb);return (ua?ua.nom:la).localeCompare(ub?ub.nom:lb,'fr');});
  const PW='90px';

  function buildPresHtml(label, list){
    let h='<div style="display:flex;line-height:1.6;"><span style="min-width:'+PW+';font-weight:bold;">'+label+'\u00a0:</span>';
    if(list.length>0){const u0=USERS.find(x=>x.l===list[0]);h+='<span>'+(u0?(u0.grade?u0.grade+' ':'')+u0.nom+' '+u0.prenom:list[0])+'</span>';}
    h+='</div>';
    for(let i=1;i<list.length;i++){const u=USERS.find(x=>x.l===list[i]);h+='<div style="display:flex;line-height:1.6;"><span style="min-width:'+PW+';flex-shrink:0;"></span><span>'+(u?(u.grade?u.grade+' ':'')+u.nom+' '+u.prenom:list[i])+'</span></div>';}
    return h;
  }
  const presHtml=buildPresHtml('Participants',participants);
  const formHtml=formateurs.length?buildPresHtml('Formateurs',formateurs):'';

  const rows=[];
  rows.push(['',dateLongue]);
  rows.push(['','Thème de la manœuvre\u00a0: <strong>'+a.theme+'</strong>']);
  if(a.hDebut)rows.push([a.hDebut,'Début']);
  if(a.hFin)rows.push([a.hFin,'Fin']);
  rows.push(['','\u00a0']);
  rows.push(['',presHtml]);
  if(formHtml)rows.push(['',formHtml]);
  let rowsBefore=idxH>=0?idxH:rows.length;
  if(rowsBefore===0)rowsBefore=1;

  const numCell='<td rowspan="'+rowsBefore+'" style="width:28mm;border-left:'+B+';border-right:'+B+';text-align:center;vertical-align:top;padding:4px 3px;font-size:9pt;">FMPA<br>'+numStr+'</td>';

  let rowsHtml='';
  rows.forEach(function(rd,i){
    const gh=rd[0],tx=rd[1];
    const isLast=(i===rows.length-1);
    const bb=isLast?'border-bottom:'+B+';':'';
    const ghStyle='style="width:28mm;border-left:'+B+';border-right:'+B+';'+bb+'text-align:center;vertical-align:top;padding:1px 3px;font-size:12pt;font-weight:bold;line-height:1.6;"';
    const txStyle='style="border-right:'+B+';'+bb+'vertical-align:top;padding:1px 5px;font-size:12pt;line-height:1.6;"';
    if(i<rowsBefore){
      if(i===0)rowsHtml+='<tr>'+numCell+'<td '+txStyle+'>'+tx+'</td></tr>';
      else rowsHtml+='<tr><td '+txStyle+'>'+tx+'</td></tr>';
    }else{
      rowsHtml+='<tr><td '+ghStyle+'>'+(gh||'')+'</td><td '+txStyle+'>'+tx+'</td></tr>';
    }
  });

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rapport FMPA</title>'
    +'<style>@page{size:A4 portrait;margin:0;}*{box-sizing:border-box;margin:0;padding:0;}html{background:#666;}'
    +'body{font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#000;margin:0;padding:15px 0;background:#666;}'
    +'.page{width:210mm;min-height:297mm;margin:0 auto 20px auto;padding:10mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4);}'
    +'table{border-collapse:collapse;width:100%;}p{margin:0;}'
    +'.no-print{position:fixed;top:10px;right:10px;z-index:999;display:flex;gap:6px;background:rgba(255,255,255,.95);padding:6px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);}'
    +'.no-print button{padding:6px 12px;border:none;border-radius:5px;cursor:pointer;font-size:12px;}'
    +'@media print{.no-print{display:none;}html,body{background:none;padding:0;}.page{width:100%;min-height:auto;margin:0;padding:10mm;box-shadow:none;}}'
    +'</style></head><body>'
    +'<div class="no-print"><button onclick="window.print()" style="background:#C0392B;color:#fff;">🖨 Imprimer</button></div>'
    +'<div class="page">'
    +'<table style="border-top:'+B+';border-left:0;border-right:0;">'
    +'<tr><td colspan="2" style="border-left:'+B+';border-right:'+B+';border-bottom:'+B+';text-align:center;font-size:13pt;font-weight:bold;padding:4px;">Formation de Maintien et de Perfectionnement des Acquis</td></tr>'
    +'<tr><td style="width:28mm;border-left:'+B+';border-right:'+B+';border-bottom:'+B+';text-align:center;font-weight:bold;padding:3px;font-size:9.5pt;">GH</td>'
    +'<td style="border-right:'+B+';border-bottom:'+B+';text-align:center;font-weight:bold;padding:3px;font-size:9.5pt;">Texte</td></tr>'
    +rowsHtml
    +'</table></div></body></html>';
}

// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
