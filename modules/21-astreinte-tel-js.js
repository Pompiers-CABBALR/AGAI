// === MODULE: astreinte_tel.js ===
// ASTREINTE TÉLÉPHONIQUE — tableau mensuel type Excel
// ══════════════════════════════════════════════════════
const ASTRTEL_JOURS_SEMAINE=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const ASTRTEL_MOIS_NOMS=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
let astrTelAnnee=new Date().getFullYear();
let astrTelMois=new Date().getMonth(); // 0-11
let astrTelSub='tableau';

function astrTelGetData(){
  if(!CURRENT_CASERNE_ID||!CASERNE_DATA[CURRENT_CASERNE_ID])return{};
  if(!CASERNE_DATA[CURRENT_CASERNE_ID].astrTelData)CASERNE_DATA[CURRENT_CASERNE_ID].astrTelData={};
  return CASERNE_DATA[CURRENT_CASERNE_ID].astrTelData;
}
function astrTelGetParams(){
  if(!CURRENT_CASERNE_ID||!CASERNE_DATA[CURRENT_CASERNE_ID])return{quota:QUOTA_ASTREINTE_TEL_H};
  if(!CASERNE_DATA[CURRENT_CASERNE_ID].astrTelParams)CASERNE_DATA[CURRENT_CASERNE_ID].astrTelParams={quota:QUOTA_ASTREINTE_TEL_H};
  return CASERNE_DATA[CURRENT_CASERNE_ID].astrTelParams;
}

// Clé de stockage : "login_YYYY_M" → objet {jour: heures} ex: {1:24, 3:12}
function astrTelKey(login,y,m){return login+'_'+y+'_'+m;}
function astrTelGetMonth(login,y,m){
  const d=astrTelGetData();
  return d[astrTelKey(login,y,m)]||{};
}
function astrTelTotalJour(y,m,day,excludeLogin){
  return (USERS||[]).reduce(function(total,u){
    if(!u||!u.l||u.l===excludeLogin)return total;
    return total+(parseFloat(astrTelGetMonth(u.l,y,m)[day])||0);
  },0);
}
function astrTelFormatHeures(value){
  const n=Math.round((parseFloat(value)||0)*100)/100;
  return Number.isInteger(n)?String(n):String(n).replace('.',',');
}
function astrTelSetHeure(login,y,m,day,val){
  // Vérifier verrouillage
  const today=new Date();
  const todayY=today.getFullYear(),todayM=today.getMonth(),todayD=today.getDate();
  const isMoisPasse=(y<todayY)||(y===todayY&&m<todayM);
  const isMoisSuivant=(y===todayY&&m===todayM-1)||(y===todayY-1&&m===11&&todayM===0);
  const moisVerrouille=isMoisPasse&&!(isMoisSuivant&&todayD<5);
  if(moisVerrouille&&!isSuperAdmin()){showToast('Ce mois est verrouillé — modification impossible','warn');return null;}
  const d=astrTelGetData();
  const k=astrTelKey(login,y,m);
  if(!d[k])d[k]={};
  let h=parseFloat(String(val||'').replace(',','.'))||0;
  h=Math.round(h*100)/100;
  if(h<0)h=0;
  const autres=astrTelTotalJour(y,m,day,login);
  const disponible=Math.max(0,Math.round((24-autres)*100)/100);
  if(h>disponible){
    h=disponible;
    showToast('Le total de la journée ne peut pas dépasser 24 h ('+astrTelFormatHeures(autres)+' h déjà attribuées)','warn');
  }
  if(h>0)d[k][day]=h;
  else delete d[k][day];
  _jbEditLock=Date.now();
  if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcPendingDirty!=='undefined'&&typeof _rcId==='function'){
    _rcPendingDirty.add(_rcId(CURRENT_CASERNE_ID,'config','main'));
  }
  saveData();
  return h;
}
function astrTelCommitInput(el){
  if(!el)return;
  const h=astrTelSetHeure(el.dataset.login,astrTelAnnee,astrTelMois,parseInt(el.dataset.day,10),el.value);
  if(h===null){el.value=el.defaultValue;return;}
  el.value=h>0?astrTelFormatHeures(h):'';
  el.defaultValue=el.value;
  const cell=el.parentElement;
  if(cell){
    cell.style.background=h>0?'var(--bl)':'#fff';
    cell.style.borderColor=h>0?'var(--blu)':'var(--brd)';
    el.style.fontWeight=h>0?'700':'400';
    el.style.color=h>0?'#1e3a5f':'var(--t2)';
  }
  const totalEl=Array.from(document.querySelectorAll('[data-astrtel-total]')).find(function(node){
    return node.dataset.astrtelTotal===el.dataset.login;
  });
  if(totalEl)totalEl.textContent=astrTelFormatHeures(astrTelTotalMois(el.dataset.login,astrTelAnnee,astrTelMois))+'h';
}
// Total heures d'un agent pour un mois
function astrTelTotalMois(login,y,m){
  return Object.values(astrTelGetMonth(login,y,m)).reduce((s,v)=>s+(parseFloat(v)||0),0);
}
// Total heures d'un agent pour une année
function astrTelTotalAnnee(login,y){
  let t=0;for(let m=0;m<12;m++)t+=astrTelTotalMois(login,y,m);return t;
}
// Nb de jours dans un mois
function astrTelNbJours(y,m){return new Date(y,m+1,0).getDate();}

function rAstrTel(){
  if(!isChefOuAdjoint()){
    const el=document.getElementById('astr-tel');
    if(el)el.innerHTML='<div style="text-align:center;padding:30px;color:var(--t2);font-size:13px;">🔒 Accès réservé au Chef de centre et à l\'Adjoint au chef de centre.</div>';
    return;
  }
  document.getElementById('astrtel-mois-label').textContent=ASTRTEL_MOIS_NOMS[astrTelMois]+' '+astrTelAnnee;
  document.getElementById('astrtel-annee-label').textContent=astrTelAnnee;
  const p=astrTelGetParams();
  const qi=document.getElementById('astrtel-quota-input');
  if(qi)qi.value=p.quota||QUOTA_ASTREINTE_TEL_H;
  astrTelShowSub(astrTelSub, document.getElementById('astrtel-btn-'+astrTelSub));
}

function astrTelShowSub(sub,btn){
  astrTelSub=sub;
  ['tableau','recap'].forEach(s=>{
    const el=document.getElementById('astrtel-sub-'+s);
    if(el)el.style.display=s===sub?'':'none';
  });
  document.querySelectorAll('[id^="astrtel-btn-"]').forEach(b=>b.classList.remove('pr'));
  if(btn)btn.classList.add('pr');
  const nav=document.getElementById('astrtel-nav');
  if(nav)nav.style.display=sub==='tableau'?'flex':'none';
  if(sub==='tableau')astrTelRenderGrid();
  else if(sub==='recap')astrTelRenderRecap();
}

function astrTelNavMois(dir){
  astrTelMois+=dir;
  if(astrTelMois>11){astrTelMois=0;astrTelAnnee++;}
  else if(astrTelMois<0){astrTelMois=11;astrTelAnnee--;}
  document.getElementById('astrtel-mois-label').textContent=ASTRTEL_MOIS_NOMS[astrTelMois]+' '+astrTelAnnee;
  astrTelRenderGrid();
}

function astrTelNavKey(e, el, agentIdx, day, nbJours, nbAgents){
  // Navigation : flèches + Tab + Entrée
  let nextAgent=agentIdx, nextDay=day;
  if(e.key==='ArrowRight'||e.key==='Tab'&&!e.shiftKey){
    if(day<nbJours){nextDay=day+1;}
    else{nextDay=1;nextAgent=(agentIdx+1)%nbAgents;}
    e.preventDefault();
  } else if(e.key==='ArrowLeft'||e.key==='Tab'&&e.shiftKey){
    if(day>1){nextDay=day-1;}
    else{nextDay=nbJours;nextAgent=(agentIdx-1+nbAgents)%nbAgents;}
    e.preventDefault();
  } else if(e.key==='ArrowDown'||e.key==='Enter'){
    nextAgent=(agentIdx+1)%nbAgents;
    e.preventDefault();
  } else if(e.key==='ArrowUp'){
    nextAgent=(agentIdx-1+nbAgents)%nbAgents;
    e.preventDefault();
  } else {
    return; // laisser les autres touches (chiffres, etc.)
  }
  // Sauvegarder sans reconstruire toute la grille, pour conserver le focus.
  astrTelCommitInput(el);
  // Trouver et focuser le prochain input
  const next=document.querySelector(`input[data-agent="${nextAgent}"][data-day="${nextDay}"]`);
  if(next){
    window.requestAnimationFrame(function(){
      next.focus({preventScroll:true});
      next.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
      next.select();
    });
  }
}

function astrTelRenderGrid(){
  const grid=document.getElementById('astrtel-grid');
  if(!grid)return;
  const y=astrTelAnnee,m=astrTelMois;
  const nbJ=astrTelNbJours(y,m);
  const agents=[...(USERS||[])].sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  const today=new Date();
  const todayY=today.getFullYear(),todayM=today.getMonth(),todayD=today.getDate();

  // Calcul du verrouillage :
  // - Mois en cours ou futur → éditable
  // - Mois passé ET on est encore avant le 5 du mois suivant → éditable (délai de saisie)
  // - Mois passé ET on est le 5 ou après → verrouillé
  const isMoisPasse=(y<todayY)||(y===todayY&&m<todayM);
  const isMoisSuivant=(y===todayY&&m===todayM-1)||(y===todayY-1&&m===11&&todayM===0);
  const graceEnd5 = isMoisSuivant && todayD < 5; // encore dans les 5 premiers jours
  const moisVerrouille = isMoisPasse && !graceEnd5;
  // Superadmin peut toujours modifier
  const canEdit=(isChefOuAdjoint()||isAdminModeActive())&&(!moisVerrouille||isSuperAdmin());
  const colW=36;

  // En-tête jours
  let hdr=`<div style="display:grid;grid-template-columns:160px 50px repeat(${nbJ},${colW}px);gap:1px;font-size:10px;font-weight:700;color:var(--t2);margin-bottom:2px;align-items:end;">`;
  hdr+='<div style="padding:2px 4px;">Agent</div><div style="text-align:center;padding:2px;">Total</div>';
  for(let d=1;d<=nbJ;d++){
    const dow=new Date(y,m,d).getDay();
    const isWE=dow===0||dow===6;
    const isToday=y===todayY&&m===todayM&&d===todayD;
    hdr+=`<div style="text-align:center;padding:1px 0;${isWE?'color:var(--red);':''}${isToday?'font-weight:900;text-decoration:underline;':''}">${d}<br><span style="font-weight:400;">${ASTRTEL_JOURS_SEMAINE[dow][0]}</span></div>`;
  }
  hdr+='</div>';

  // Bandeau verrouillage
  let lockBanner='';
  if(moisVerrouille){
    lockBanner=`<div style="background:#FEF9C3;border:1px solid #D4A017;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#854F0B;">
      🔒 Ce mois est verrouillé — la saisie n'est possible que jusqu'au 5 du mois suivant.${isSuperAdmin()?' (Superadmin : modification autorisée)':''}
    </div>`;
  } else if(isMoisPasse&&!moisVerrouille){
    lockBanner=`<div style="background:#EAF3DE;border:1px solid #3B6D11;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#3B6D11;">
      ✏️ Saisie possible jusqu'au 5 du mois en cours inclus.
    </div>`;
  }

  // Lignes agents
  let rows='';
  agents.forEach(u=>{
    const moisData=astrTelGetMonth(u.l,y,m);
    const total=astrTelTotalMois(u.l,y,m);
    const totalAn=astrTelTotalAnnee(u.l,y);
    const quota=astrTelGetParams().quota||QUOTA_ASTREINTE_TEL_H;
    const overQuota=totalAn>quota;
    rows+=`<div style="display:grid;grid-template-columns:160px 50px repeat(${nbJ},${colW}px);gap:1px;margin-bottom:1px;align-items:center;">`;
    rows+=`<div style="font-size:11px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${u.nom} ${u.prenom}">${u.nom} ${u.prenom}</div>`;
    rows+=`<div data-astrtel-total="${u.l}" style="text-align:center;font-size:11px;font-weight:700;color:${overQuota?'#E24B4A':'var(--t)'};" title="Total annuel : ${totalAn}h">${astrTelFormatHeures(total)}h</div>`;
    for(let d=1;d<=nbJ;d++){
      const h=moisData[d]||0;
      const dow=new Date(y,m,d).getDay();
      const isWE=dow===0||dow===6;
      const bg=h>0?'var(--bl)':isWE?'#fdf0f0':'#fff';
      const color=h>0?'#1e3a5f':'var(--t2)';
      if(canEdit){
        rows+=`<div style="background:${bg};border:1px solid ${h>0?'var(--blu)':'var(--brd)'};border-radius:3px;">
          <input type="text" inputmode="decimal" pattern="[0-9.,]*" maxlength="5" value="${h?astrTelFormatHeures(h):''}"
            data-login="${u.l}" data-day="${d}" data-agent="${agents.indexOf(u)}"
            onchange="astrTelCommitInput(this)"
            onfocus="this.select();"
            onkeydown="astrTelNavKey(event,this,${agents.indexOf(u)},${d},${nbJ},${agents.length})"
            placeholder="${isWE?'·':''}"
            aria-label="${u.nom} ${u.prenom}, ${d} ${ASTRTEL_MOIS_NOMS[m]} : nombre d'heures"
            style="width:100%;border:none;background:transparent;text-align:center;font-size:10px;font-weight:${h>0?'700':'400'};color:${color};padding:3px 1px;outline:none;">
        </div>`;
      } else {
        rows+=`<div style="background:${bg};border:1px solid ${h>0?'var(--blu)':'var(--brd)'};border-radius:3px;text-align:center;font-size:10px;font-weight:${h>0?'700':'400'};color:${color};padding:4px 1px;">${h>0?h:''}</div>`;
      }
    }
    rows+='</div>';
  });

  if(!agents.length)rows='<div style="text-align:center;padding:20px;color:var(--t2);font-size:13px;">Aucun agent disponible.</div>';
  grid.innerHTML=lockBanner+hdr+rows;
}

function astrTelRenderRecap(){
  const el=document.getElementById('astrtel-recap-body');
  if(!el)return;
  const y=astrTelAnnee;
  const quota=astrTelGetParams().quota||QUOTA_ASTREINTE_TEL_H;
  const tauxAstrTel=getStatsTaux().astrTel;
  const agents=[...(USERS||[])].sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  if(!agents.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--t2);">Aucun agent.</div>';return;}

  // En-tête quota
  let html=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:10px;background:var(--bg);border-radius:8px;">
    <div style="font-size:13px;">Quota annuel : <strong>${quota}h</strong></div>
    <div style="font-size:11px;color:var(--t2);">1 jour = 24h · ${Math.round(quota/24)} jours max · Taux pondéré : <strong>${tauxAstrTel} %</strong></div>
  </div>`;

  // Tableau récap
  html+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html+='<thead><tr style="background:#f5f5f7;"><th style="padding:6px 8px;text-align:left;">Agent</th>';
  ASTRTEL_MOIS_NOMS.forEach(n=>html+=`<th style="padding:4px 6px;text-align:center;">${n.slice(0,3)}</th>`);
  html+='<th style="padding:6px 8px;text-align:center;">Total</th><th style="padding:6px 8px;text-align:center;">Pondéré</th><th style="padding:6px 8px;text-align:center;">Restant</th><th style="padding:6px;min-width:80px;">Quota</th></tr></thead><tbody>';

  agents.forEach((u,i)=>{
    const bg=i%2===0?'#fff':'#fafafa';
    const totalAn=astrTelTotalAnnee(u.l,y);
    const restant=Math.max(0,quota-totalAn);
    const pct=Math.min(100,Math.round(totalAn/quota*100));
    const overQuota=totalAn>quota;
    const pondere=dureeMinutesHHMM(Math.round(totalAn*60*tauxAstrTel/100));
    html+=`<tr style="background:${bg};border-bottom:1px solid var(--brd);">`;
    html+=`<td style="padding:5px 8px;white-space:nowrap;">${u.nom} ${u.prenom}</td>`;
    for(let m=0;m<12;m++){
      const t=astrTelTotalMois(u.l,y,m);
      html+=`<td style="padding:4px 6px;text-align:center;color:${t>0?'var(--blu)':'var(--t3)'};">${t>0?t+'h':'-'}</td>`;
    }
    html+=`<td style="padding:5px 8px;text-align:center;font-weight:700;color:${overQuota?'#E24B4A':'var(--t)'};">${totalAn}h</td>`;
    html+=`<td style="padding:5px 8px;text-align:center;font-weight:700;color:var(--blu);">${pondere}</td>`;
    html+=`<td style="padding:5px 8px;text-align:center;color:var(--t2);">${restant}h</td>`;
    html+=`<td style="padding:5px 8px;"><div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;"><div style="width:${pct}%;background:${overQuota?'#E24B4A':'var(--blu)'};height:100%;border-radius:4px;transition:width .3s;"></div></div><div style="font-size:9px;text-align:center;color:var(--t2);margin-top:1px;">${pct}%</div></td>`;
    html+='</tr>';
  });
  html+='</tbody></table></div>';
  el.innerHTML=html;
}

function astrTelSaveParams(){
  const val=parseInt(document.getElementById('astrtel-quota-input').value)||QUOTA_ASTREINTE_TEL_H;
  // Appliquer à toutes les casernes
  if(CASERNES){
    CASERNES.forEach(cas=>{
      if(!CASERNE_DATA[cas.id])CASERNE_DATA[cas.id]={};
      if(!CASERNE_DATA[cas.id].astrTelParams)CASERNE_DATA[cas.id].astrTelParams={};
      CASERNE_DATA[cas.id].astrTelParams.quota=val;
    });
  }
  saveData();
  showToast('Quota astreinte téléphonique mis à jour : '+val+'h ✓','success');
  cM();
}

function showAstrTelParams(){
  // Lire quota actuel (depuis la 1ère caserne dispo ou valeur globale)
  let currentQuota=QUOTA_ASTREINTE_TEL_H;
  if(CASERNES&&CASERNES.length){
    const cd=CASERNE_DATA[CASERNES[0].id];
    if(cd&&cd.astrTelParams&&cd.astrTelParams.quota)currentQuota=cd.astrTelParams.quota;
  }
  document.getElementById('mt').textContent='📞 Paramètres astreinte téléphonique';
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`<div>
    <div class="fg">
      <div class="fgl">Nombre d'heures maximum annuel par agent</div>
      <input class="fi" type="number" id="astrtel-quota-input" style="max-width:140px;" min="0" step="24" value="${currentQuota}"/>
      <div style="font-size:11px;color:var(--t2);margin-top:4px;">Par défaut : 3 024 heures (18 semaines × 7 jours × 24h)</div>
    </div>
    <div class="fg">
      <div class="fgl">Ce quota s'applique à toutes les casernes.</div>
    </div>
    <div class="brow">
      <button class="btn pr" onclick="astrTelSaveParams()">💾 Enregistrer</button>
      <button class="btn" onclick="cM()">Annuler</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}


