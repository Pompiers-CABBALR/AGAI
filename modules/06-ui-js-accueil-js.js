// === MODULE: ui.js + accueil.js ===
// ────────────────── ACCUEIL ──────────────────
function rAccueil(){
  if(!CU)return;
  const h=N().getHours();
  const salut=h>=18?'Bonsoir':h>=12?'Bon après-midi':'Bonjour';
  const prenomAff=CU.prenom||(CU.nom||CU.l);
  const elBonj=document.getElementById('acc-bonjour');
  if(elBonj)elBonj.textContent=salut+', '+prenomAff+' !';
  const jours=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const mois=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d=N();
  document.getElementById('acc-date').textContent=`${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`;
  const annee=String(d.getFullYear());
  const moisStr=annee+String(d.getMonth()+1).padStart(2,'0');
  const jourStr=moisStr+String(d.getDate()).padStart(2,'0');
  // Exclure les interventions annulées, PILIP et non-terminées des stats
  const ivStats=IVS.filter(iv=>!iv._isPilip&&isInterventionComptabilisee(iv));
  const pilpStats=isTireurPILP()?PILP_IVS.filter(isInterventionComptabilisee):[];
  const nbAnnee=ivStats.filter(iv=>statsInterventionInPeriod(iv,annee)).length+pilpStats.filter(iv=>statsInterventionInPeriod(iv,annee)).length;
  const nbMois=ivStats.filter(iv=>statsInterventionInPeriod(iv,moisStr)).length+pilpStats.filter(iv=>statsInterventionInPeriod(iv,moisStr)).length;
  const nbJour=ivStats.filter(iv=>statsInterventionInPeriod(iv,jourStr)).length+pilpStats.filter(iv=>statsInterventionInPeriod(iv,jourStr)).length;
  const nbAttente=IVS.filter(iv=>!iv._isPilip&&iv.s==='en-attente').length;
  const nbPilpAtt=PILP_IVS.filter(iv=>iv.s==='en-attente').length;
  let statsHtml=`
    <div class="acc-stat"><div class="acc-stat-val">${nbAttente}</div><div class="acc-stat-lbl">En attente</div></div>
    <div class="acc-stat"><div class="acc-stat-val">${nbMois}</div><div class="acc-stat-lbl">Ce mois de ${['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][d.getMonth()]}</div></div>
    <div class="acc-stat"><div class="acc-stat-val">${nbAnnee}</div><div class="acc-stat-lbl">Depuis le début de l'année ${annee}</div></div>
    <div class="acc-stat"><div class="acc-stat-val" style="color:var(--blu);">${nbJour}</div><div class="acc-stat-lbl">Interventions aujourd'hui</div></div>`;
  if(canSeePILP()){
    statsHtml+=`<div class="acc-stat pilp" style="grid-column:1/-1;"><div class="acc-stat-val">${nbPilpAtt}</div><div class="acc-stat-lbl">Interventions PILP en attente</div></div>`;
  }
  document.getElementById('acc-stats').innerHTML=statsHtml;
  // ── Messages astreinte ──
  try{rAccueilAstreinte();}catch(e){}
  try{rStatsHeader();}catch(e){}
}

// ────────────────── MESSAGES ASTREINTE ACCUEIL ──────────────────
function rAccueilAstreinte(){
  const el=document.getElementById('acc-astreinte-msg');
  if(!el||!CU)return;
  // Pas de messages pour le chef de corps (pas d'astreintes)
  if(GLOBAL_ROLE==='chef_corps'){el.innerHTML='';return;}

  const now=N();
  const wk=weekKey(getMondayOfWeek(0));
  const gran=ASTR_CONFIG.granularity||60;
  const slotsParJour=Math.floor(1440/gran);
  const nowMin=now.getHours()*60+now.getMinutes();
  const dowJS=now.getDay(); // 0=dim
  const jourActuel=JOURS_FULL[dowJS===0?6:dowJS-1]; // 0=lun..6=dim
  const jourActuelIdx=dowJS===0?6:dowJS-1;

  const msgs=[];

  // ── 1. DISPONIBILITÉS ──────────────────────────────────────
  const dispoSemaine=DISPOS[wk]?.[CU.l]||{};
  const aNDispos=Object.values(dispoSemaine).some(function(v){return v===true;});

  if(!aNDispos){
    msgs.push({
      type:'warn',
      scope:'dispo',
      text:'Vous n\u2019avez pas mis de disponibilit\u00e9 pour la semaine en cours.'
    });
  }

  // Trouver le créneau dispo actuel ou prochain
  // Chercher le prochain bloc contigu de dispos (en partant de maintenant)
  function slotToMinOfDay(s){return (((ASTR_CONFIG.weekStartHour||0)*60)+s*gran)%1440;}
  function slotAbsMin(dayIdx,slotIdx){
    // Minutes absolues depuis lundi 00h00
    // Sans %1440 pour garder les slots après minuit dans le bon jour
    const startHour=ASTR_CONFIG.weekStartHour||0;
    const rawMin=startHour*60+slotIdx*gran;
    const dayOffset=Math.floor(rawMin/1440);
    return (dayIdx+dayOffset)*1440+(rawMin%1440);
  }
  // nowAbsMin : minutes absolues depuis le lundi 00h00
  const nowAbsMin=jourActuelIdx*1440+nowMin;

  // Construire liste de tous les slots dispos triés par temps absolu
  const slotsDispos=[];
  for(let d=0;d<7;d++){
    for(let s=0;s<slotsParJour;s++){
      if(dispoSemaine[`${d}_${s}`]===true){
        slotsDispos.push({d,s,abs:slotAbsMin(d,s)});
      }
    }
  }
  slotsDispos.sort(function(a,b){return a.abs-b.abs;});

  // Trouver le bloc contigu qui contient maintenant ou le prochain
  function formatSlotTime(d,s){
    const startHour=ASTR_CONFIG.weekStartHour||0;
    const totalMin=(startHour*60+s*gran)%1440;
    return pad(Math.floor(totalMin/60))+'h'+((totalMin%60)?pad(totalMin%60):'');
  }
  function jourLabel2(d){
    const dowIdx=(((ASTR_CONFIG.weekStartDay||1)+d)%7);
    return JOURS_FULL[dowIdx===0?6:dowIdx-1];
  }

  // Grouper les slots en blocs contigus
  function grouperBlocs(slots){
    if(!slots.length)return [];
    const blocs=[];
    let debut=slots[0],fin=slots[0];
    for(let i=1;i<slots.length;i++){
      const prev=slots[i-1],cur=slots[i];
      // Contigu si la différence = gran minutes
      if(cur.abs-prev.abs<=gran){
        fin=cur;
      } else {
        blocs.push({debut,fin});
        debut=cur;fin=cur;
      }
    }
    blocs.push({debut,fin});
    return blocs;
  }

  const blocs=grouperBlocs(slotsDispos);

  // Bloc actuel = bloc dont debut.abs <= nowAbsMin <= fin.abs+gran
  const blocActuel=blocs.find(function(b){
    return b.debut.abs<=nowAbsMin&&nowAbsMin<b.fin.abs+gran;
  });
  const blocProchain=!blocActuel?blocs.find(function(b){return b.debut.abs>nowAbsMin;}):null;

  function formatBlocMsg(b,prefixe){
    const startHour=ASTR_CONFIG.weekStartHour||0;
    const startDay=ASTR_CONFIG.weekStartDay||1;
    const mon=getMondayOfWeek(0); // date du début de semaine

    // Heure du début d'un slot
    function slotHeure(s){
      const totalMin=(startHour*60+s*gran)%1440;
      return pad(Math.floor(totalMin/60))+'h'+(totalMin%60?pad(totalMin%60):'');
    }
    // Heure de fin = début du slot suivant
    function slotHeureFin(s){
      const totalMin=startHour*60+(s+1)*gran;
      const h=Math.floor((totalMin%1440)/60);
      const m=totalMin%60;
      return pad(h)+'h'+(m?pad(m):'');
    }
    // Date de fin : déborde sur le jour suivant si totalMin > 1440 (pas exactement 1440)
    // Avec startHour=8 : dernier slot finit à 1920min → 1920%1440=480=08h, jour+1 = correct
    // Avec startHour=0 : dernier slot finit à 1440min → 1440%1440=0=00h, même jour = correct
    function dateFinIdx(dayIdx,s){
      const totalMin=startHour*60+(s+1)*gran;
      return totalMin>1440?dayIdx+1:dayIdx;
    }

    const MOIS_FR=['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];
    const JOURS_FR=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

    function formatDate(dt){
      return JOURS_FR[dt.getDay()]+' '+dt.getDate()+' '+MOIS_FR[dt.getMonth()]+' '+dt.getFullYear();
    }
    function formatDateHeure(dt,heure){
      return formatDate(dt)+' \u00e0 '+heure;
    }

    // Date réelle du jour de début (en tenant compte du weekStartDay)
    function jourDate(dayIdx){
      const mon=getMondayOfWeek(0);
      const dt=new Date(mon);
      // weekStartDay: 1=lundi. Si startDay=1 (lundi), dayIdx=0=lundi, dayIdx=6=dimanche
      const startDayOffset=(ASTR_CONFIG.weekStartDay||1)-1; // 0 pour lundi
      dt.setDate(dt.getDate()+startDayOffset+dayIdx);
      return dt;
    }
    const dtDebut=jourDate(b.debut.d);
    const hDebut=slotHeure(b.debut.s);
    const hFin=slotHeureFin(b.fin.s);
    const finDayIdx=dateFinIdx(b.fin.d,b.fin.s);
    const dtFin=jourDate(finDayIdx);

    // Cas semaine complète : même heure début et fin, jours différents
    const memeHeure=hDebut===hFin;
    const memeJour=dtDebut.toDateString()===dtFin.toDateString();

    const debutStr=formatDateHeure(dtDebut,hDebut);
    const finStr=memeJour&&!memeHeure?'\u00e0 '+hFin:formatDateHeure(dtFin,hFin);

    if(prefixe==='actuel'){
      return 'Votre disponibilit\u00e9 en cours a commenc\u00e9 le '+debutStr+' et se termine le '+finStr+'.';
    } else {
      return 'Votre prochaine disponibilit\u00e9 commence le '+debutStr+' et se termine le '+finStr+'.';
    }
  }

  if(blocActuel){
    msgs.push({type:'info',scope:'dispo',text:formatBlocMsg(blocActuel,'actuel')});
  } else if(blocProchain&&aNDispos){
    msgs.push({type:'info',scope:'dispo',text:formatBlocMsg(blocProchain,'prochain')});
  }

  // ── 2. PIQUETS ─────────────────────────────────────────────
  const piquetsSemaine=PIQUETS[wk]||[];

  // Helper : est-ce que l'agent est dans ce piquet, et quel est son rôle et ses heures ?
  function agentDansPiquet(p,login){
    if(p.membres&&p.membres.length){
      const m=p.membres.find(function(x){return x.login===login;});
      if(m)return {role:m.role,hDebut:m.hDebut||p.debut,hFin:m.hFin||p.fin};
      return null;
    }
    // Fallback ancien format
    if(p.chefAgres===login)return {role:"Chef d'agr\u00e8s",hDebut:p.debut,hFin:p.fin};
    if(p.conducteur===login)return {role:'Conducteur',hDebut:p.debut,hFin:p.fin};
    if(p.chefEquipe===login)return {role:"Chef d'\u00e9quipe",hDebut:p.debut,hFin:p.fin};
    if(p.stagiaire===login)return {role:'\u00c9quipier',hDebut:p.debut,hFin:p.fin};
    return null;
  }

  const piquetsAgent=piquetsSemaine.filter(function(p){return agentDansPiquet(p,CU.l)!==null;});

  // Piquet(s) actuel(s) — basé sur les heures individuelles de l'agent
  const piquetsActuels=piquetsAgent.filter(function(p){
    const jourIdx=JOURS_FULL.indexOf(p.jour);
    if(jourIdx<0)return false;
    const m=agentDansPiquet(p,CU.l);
    const dMin=timeToMin(m.hDebut),fMin=timeToMin(m.hFin);
    const overnight=fMin<=dMin;
    const startH=(ASTR_CONFIG.weekStartHour??8)*60;
    // Si hDebut < startHour → appartient au jour suivant dans le planning
    const effectifJourIdx=dMin<startH?jourIdx+1:jourIdx;
    if(overnight){
      if(effectifJourIdx===jourActuelIdx&&nowMin>=dMin)return true;
      if((effectifJourIdx+1)%7===jourActuelIdx&&nowMin<fMin)return true;
    } else {
      if(effectifJourIdx===jourActuelIdx&&nowMin>=dMin&&nowMin<fMin)return true;
    }
    return false;
  });

  piquetsActuels.forEach(function(p){
    const m=agentDansPiquet(p,CU.l);
    const overnight=timeToMin(m.hFin)<=timeToMin(m.hDebut);
    msgs.push({
      type:'success',
      scope:'piquet',
      text:'Piquet en cours : '+p.engin+' ('+m.role+')'
        +' de '+m.hDebut+' jusqu\u2019\u00e0 '+(overnight?'demain \u00e0 ':'')+m.hFin+'.'
    });
  });

  // Piquet(s) prochain(s) (dans les 48h)
  const piquetsProchains=piquetsAgent.filter(function(p){
    if(piquetsActuels.includes(p))return false;
    const jourIdx=JOURS_FULL.indexOf(p.jour);if(jourIdx<0)return false;
    const m=agentDansPiquet(p,CU.l);
    const startH=(ASTR_CONFIG.weekStartHour??8)*60;
    const dMin=timeToMin(m.hDebut);
    const effectifJourIdx=dMin<startH?jourIdx+1:jourIdx;
    const pAbsMin=effectifJourIdx*1440+dMin;
    return pAbsMin>nowAbsMin&&pAbsMin-nowAbsMin<=2880;
  }).sort(function(a,b){
    const ma=agentDansPiquet(a,CU.l),mb=agentDansPiquet(b,CU.l);
    const startH=(ASTR_CONFIG.weekStartHour??8)*60;
    const ia=(JOURS_FULL.indexOf(a.jour)+(timeToMin(ma.hDebut)<startH?1:0))*1440+timeToMin(ma.hDebut);
    const ib=(JOURS_FULL.indexOf(b.jour)+(timeToMin(mb.hDebut)<startH?1:0))*1440+timeToMin(mb.hDebut);
    return ia-ib;
  });

  piquetsProchains.forEach(function(p){
    const m=agentDansPiquet(p,CU.l);
    const overnight=timeToMin(m.hFin)<=timeToMin(m.hDebut);
    const jourIdx=JOURS_FULL.indexOf(p.jour);
    const startH=(ASTR_CONFIG.weekStartHour??8)*60;
    const effectifJour=JOURS_FULL[(jourIdx+(timeToMin(m.hDebut)<startH?1:0))%7];
    // Calcul du jour de fin
    const finJourLabel=overnight?JOURS_FULL[(jourIdx+1+(timeToMin(m.hDebut)<startH?1:0))%7].toLowerCase()+' \u00e0 ':'';
    msgs.push({
      type:'next',
      scope:'piquet',
      text:'Prochain piquet : '+p.engin+' ('+m.role+')'
        +' le '+effectifJour.toLowerCase()+' \u00e0 '+m.hDebut
        +' jusqu\u2019\u00e0 '+finJourLabel+m.hFin+'.'
    });
  });

  // ── Rendu compact : une carte Disponibilité + une carte Piquet.
  // Le détail reste accessible en touchant la carte, sans repousser les
  // informations d'intervention vers le bas de l'écran d'accueil.
  const colors={
    warn:{bg:'#FEF9C3',border:'#F59E0B',icon:'&#x26A0;&#xFE0F;',color:'#713F12'},
    info:{bg:'#EFF6FF',border:'#3B82F6',icon:'&#x1F4C5;',color:'#1E3A5F'},
    success:{bg:'#F0FDF4',border:'#22C55E',icon:'&#x2705;',color:'#14532D'},
    next:{bg:'#F3EAF8',border:'#A855F7',icon:'&#x1F51C;',color:'#4A1D6D'},
  };
  function renderAgendaCard(scope,title,emptyText,defaultType){
    const items=msgs.filter(function(m){return m.scope===scope;});
    const first=items[0]||{type:defaultType,text:emptyText};
    const c=colors[first.type]||colors[defaultType]||colors.info;
    const details=items.length?items:[first];
    return '<details class="acc-agenda-card" style="--agenda-bg:'+c.bg+';--agenda-color:'+c.border+';--agenda-text:'+c.color+';">'
      +'<summary title="'+escHtml(first.text)+'"><span class="acc-agenda-icon">'+c.icon+'</span>'
      +'<span class="acc-agenda-main"><div class="acc-agenda-title">'+title+'</div>'
      +'<div class="acc-agenda-summary">'+escHtml(first.text)+'</div></span>'
      +'<span class="acc-agenda-more">▼</span></summary>'
      +'<div class="acc-agenda-details">'+details.map(function(m){
        const mc=colors[m.type]||c;
        return '<div class="acc-agenda-detail"><span style="margin-right:4px;">'+mc.icon+'</span>'+escHtml(m.text)+'</div>';
      }).join('')+'</div></details>';
  }
  el.innerHTML='<div class="acc-agenda-grid">'
    +renderAgendaCard('dispo','Disponibilité','Aucune prochaine disponibilité renseignée.','warn')
    +renderAgendaCard('piquet','Piquet','Aucun piquet prévu dans les prochaines 48 heures.','next')
    +'</div>';
}

// ── Toast notification (remplace alert() natif) ──
function showToast(msg, type){
  type=type||'info';
  const colors={info:'#3B82F6',success:'#22C55E',warn:'#F59E0B',error:'#E24B4A'};
  const icons={info:'&#x2139;&#xFE0F;',success:'&#x2705;',warn:'&#x26A0;&#xFE0F;',error:'&#x274C;'};
  let t=document.getElementById('app-toast');
  if(!t){t=document.createElement('div');t.id='app-toast';
    t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:#1c1c1e;color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:transform .3s,opacity .3s;opacity:0;max-width:90vw;text-align:center;border-left:4px solid '+colors[type]+';';
    document.body.appendChild(t);}
  t.style.borderLeftColor=colors[type];
  t.innerHTML=icons[type]+' '+msg;
  t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(t._timer);
  t._timer=setTimeout(function(){t.style.opacity='0';t.style.transform='translateX(-50%) translateY(80px)';},3000);
}

// ── Modale de confirmation (remplace confirm() natif) ──
function confirmModal(msg, onOk, onCancel){
  document.getElementById('mt').textContent='Confirmation';
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=
    '<div style="padding:8px 0;">'
    +'<div style="font-size:13px;color:var(--t);margin-bottom:16px;line-height:1.5;">'+msg+'</div>'
    +'<div class="brow">'
    +'<button class="btn pr sm" id="confirm-ok-btn">Confirmer</button>'
    +'<button class="btn sm" onclick="cM()">Annuler</button>'
    +'</div></div>';
  document.getElementById('mo').style.display='flex';
  document.getElementById('confirm-ok-btn').onclick=function(){cM();if(onOk)onOk();};
}

// ────────────────── TABS ──────────────────
function showT(id,btn){
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  if(window.innerWidth<=480)window.scrollTo(0,0);
  if(id==='appel'){rF();gS(1);}
  if(id==='interv'){
    const activeSubtab=document.querySelector('#interv-subtabs .subtab-btn.active');
    const sub=activeSubtab&&activeSubtab.id==='subtab-btn-pilp'?'pilp':activeSubtab&&activeSubtab.id==='subtab-btn-hist'?'hist':'std';
    if(sub==='pilp')rPilp();else if(sub==='hist')rHist();else rI();
  }
  if(id==='astreintes')rAstreintes();
  if(id==='params'){rProfil();rAdm();}
  if(id==='stats'){rStats();window.scrollTo(0,0);}
  if(id==='home')rAccueil();
  if(id==='activite'){rActivite();}
  if(id==='formation'){rFormation();}
  // Bandeau stats : visible sur tous les onglets sauf accueil
  rStatsHeader();
  requestAnimationFrame(syncAppelNatureViewport);
}

// ────────────────── NATURES ──────────────────
let _natureLastTapLabel='',_natureLastTapAt=0;
function rNatures(list){
  const c=document.getElementById('nl');
  if(!list.length){c.innerHTML='<div style="padding:12px;text-align:center;font-size:13px;color:var(--t2);">Aucun résultat</div>';return;}
  const g={};list.forEach(n=>{if(!g[n.g])g[n.g]=[];g[n.g].push(n);});
  const ord=["⭐ Prioritaires","Secours","Feux","Risques","Opérations diverses"];
  let h='';
  ord.forEach(gr=>{
    if(!g[gr])return;
    const P=gr==="⭐ Prioritaires";
    h+=`<div style="font-size:10px;font-weight:600;color:${P?'var(--rd)':'var(--t2)'};text-transform:uppercase;letter-spacing:.05em;padding:6px 8px 2px;">${gr}</div>`;
    g[gr].forEach(n=>{
      const sel=selNat===n.l;
      h+=`<div class="nature-option" style="padding:7px 10px;border-radius:7px;font-size:13px;cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px;color:${sel?'var(--rd)':'var(--t)'};background:${sel?'var(--rl)':''};font-weight:${sel?'500':''};${P?'border-left:2px solid var(--red);padding-left:8px;':''}" onclick="sN('${n.l.replace(/'/g,"\\'")}',this)"><span style="font-size:15px;width:20px;text-align:center;flex-shrink:0;">${n.i}</span>${n.l}${P?'<span style="font-size:10px;background:var(--rl);color:var(--rd);padding:1px 6px;border-radius:10px;margin-left:auto;">Prioritaire</span>':''}</div>`;
    });
  });
  c.innerHTML=h;
}
function filtN(q){rNatures(q?NAT.filter(n=>n.l.toLowerCase().includes(q.toLowerCase())):NAT);}
function sN(label,el){
  const now=Date.now();
  const doubleTap=_natureLastTapLabel===label&&(now-_natureLastTapAt)<500;
  _natureLastTapLabel=label;_natureLastTapAt=now;
  if(!hoA)hoA=new Date();selNat=label;
  document.querySelectorAll('#nl [onclick]').forEach(i=>{i.style.background='';i.style.color='var(--t)';i.style.fontWeight='';});
  el.style.background='var(--rl)';el.style.color='var(--rd)';el.style.fontWeight='500';
  document.getElementById('bn').disabled=false;
  document.getElementById('pilp-appel-chk').style.display='none'; // PILP direct désactivé
  // Deux clics ou deux appuis rapprochés : fonctionne aussi sur iPhone et Android.
  if(doubleTap){_natureLastTapLabel='';_natureLastTapAt=0;gS(2);}
}

