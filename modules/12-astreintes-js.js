// === MODULE: astreintes.js ===
// ══════════════════════════════════════════════════════
// ASTREINTES — Données
// ══════════════════════════════════════════════════════
// PLANNING_ROTATIONS est global (déclaré plus haut avec les proxies)
let selEqColor_ = '#3498DB';
let astrPlanningWeek = 0; // offset semaines depuis aujourd'hui
let astrDispoWeek = 1;    // par défaut = semaine prochaine
let astrPiquetWeek = 0;

// ── Utilitaires dates semaine ──
function getWeekOffset(wk){
  // Retourne l'offset en semaines par rapport à la semaine courante
  const thisMon=getMondayOfWeek(0);
  const yr=parseInt(wk.slice(0,4)),mo=parseInt(wk.slice(4,6))-1,da=parseInt(wk.slice(6,8));
  const wkMon=new Date(yr,mo,da);
  return Math.round((wkMon-thisMon)/(7*24*3600*1000));
}
function getMondayOfWeek(offsetWeeks){
  // Retourne le début de la semaine d'astreinte selon ASTR_CONFIG.weekStartDay/Hour
  const startDay=ASTR_CONFIG.weekStartDay??1; // 0=dim,1=lun,...,6=sam
  const startHour=ASTR_CONFIG.weekStartHour??0;
  const d=new Date(TODAY);
  // Trouver le dernier "startDay" <= aujourd'hui
  let dow=d.getDay(); // 0=dim
  let diff=((dow-startDay)+7)%7;
  d.setDate(d.getDate()-diff+offsetWeeks*7);
  d.setHours(startHour,0,0,0);
  return d;
}
function weekKey(startDate){
  return `${startDate.getFullYear()}${pad(startDate.getMonth()+1)}${pad(startDate.getDate())}`;
}
function weekLabel(startDate){
  const end=new Date(startDate);end.setDate(end.getDate()+6);
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  const wn=getWeekNumber(startDate);
  return `Semaine ${wn} — du ${fmt(startDate)} au ${fmt(end)}`;
}
// Retourne les N jours de la semaine d'astreinte (peut être 8 si heure != 00:00)
function getWeekDays(startDate){
  const startHour=ASTR_CONFIG.weekStartHour??0;
  // Si heure de début != 0, on a 8 demi-journées : jour1 startHour→minuit, puis 6 jours complets, puis jour8 minuit→startHour
  // Pour simplicité : on affiche toujours 7 jours (du startDay au startDay+6)
  // mais le premier et dernier jour sont partiels si startHour != 0
  const days=[];
  for(let i=0;i<7;i++){
    const d=new Date(startDate);
    d.setDate(d.getDate()+i);
    days.push(d);
  }
  return days;
}
// Retourne le nombre de slots du 1er jour (de startHour à minuit) et du dernier (de minuit à startHour)
function getSlotsFirstDay(gran){
  const startHour=ASTR_CONFIG.weekStartHour??0;
  if(startHour===0)return Math.floor(1440/gran);
  return Math.floor((1440-startHour*60)/gran);
}
function getSlotsLastDay(gran){
  const startHour=ASTR_CONFIG.weekStartHour??0;
  if(startHour===0)return 0; // pas de jour partiel
  return Math.floor((startHour*60)/gran);
}
function getWeekNumber(d){
  const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
  const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date-yearStart)/86400000)+1)/7);
}
const JOURS=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const JOURS_FULL=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
// Retourne le libellé du jour d (0-6) relatif au début de semaine d'astreinte
function jourLabel(d,full){
  const startDay=ASTR_CONFIG.weekStartDay??1; // 0=dim
  // js: 0=dim,1=lun. JOURS[0]=Lun => index js 1
  // JOURS/JOURS_FULL sont indexés 0=Lun..6=Dim
  // js day for JOURS[i]: (i+1)%7
  const jsDay=(startDay+d)%7; // js day index
  const idx=jsDay===0?6:jsDay-1; // convert to JOURS index (0=Lun)
  return full?JOURS_FULL[idx]:JOURS[idx];
}
function jourDate(startDate,d){
  const dd=new Date(startDate);dd.setDate(dd.getDate()+d);return dd;
}

function getSlotsPerDay(granularity){return Math.floor(1440/granularity);}
function slotToLabel(slotIdx,granularity){
  const totalMin=slotIdx*granularity;
  const h=Math.floor(totalMin/60),m=totalMin%60;
  return `${pad(h)}:${pad(m)}`;
}
// Retourne le label d'un slot : chaque jour commence à startHour
function slotToLabelDay(dayIdx,slotIdx,granularity){
  const startHour=ASTR_CONFIG.weekStartHour??0;
  const totalMin=(startHour*60+slotIdx*granularity)%1440;
  const h=Math.floor(totalMin/60),m=totalMin%60;
  return `${pad(h)}h${m>0?pad(m):''}`;
}
// Retourne le nb de slots pour un jour donné
function getSlotsForDay(dayIdx,granularity){
  // Chaque jour affiché = 24h complets démarrant à startHour
  return Math.floor(1440/granularity);
}
function equipeBelongsToCurrentCaserne(e){return !!(e&&(!e.caserneId||e.caserneId===CURRENT_CASERNE_ID));}
function getEquipeOfUser(login){return EQUIPES.find(e=>equipeBelongsToCurrentCaserne(e)&&Array.isArray(e.membres)&&e.membres.includes(login));}
function getEquipeById(id){return EQUIPES.find(e=>equipeBelongsToCurrentCaserne(e)&&e.id===id);}
function sortEquipes(list){
  return [...(list||[])].filter(equipeBelongsToCurrentCaserne).sort(function(a,b){
    return String(a&&a.nom||a&&a.id||'').localeCompare(String(b&&b.nom||b&&b.id||''),'fr',{numeric:true,sensitivity:'base'});
  });
}

// ── Planning rotation : assigner équipe par semaine ──
function getEquipeSemaine(wKey){
  if(PLANNING_ROTATIONS[wKey])return getEquipeById(PLANNING_ROTATIONS[wKey]);
  // Auto-rotation basée sur numéro de semaine
  const d=new Date(wKey.slice(0,4)+'-'+wKey.slice(4,6)+'-'+wKey.slice(6,8));
  const wn=getWeekNumber(d);
  const idx=wn%EQUIPES.length;
  return EQUIPES[idx]||EQUIPES[0];
}

// ══════════════════════════════════════════════════════
// ASTREINTES — Navigation onglets
// ══════════════════════════════════════════════════════
function isChefOuAdjoint(){
  if(!CU)return false;
  if(hasAdministrativeAccount())return true;
  return CU.fonction==='Chef de centre'||CU.fonction==='Adjoint au chef de centre';
}
function isAstreinteTelephoneDesktopAllowed(){
  // Même détection stricte que l'impression des rapports : les smartphones
  // et tablettes restent bloqués, y compris en paysage ou avec un UA iPad desktop.
  return typeof isReportPrintingAllowed==='function'&&isReportPrintingAllowed();
}
function rAstreintes(){
  applyNavRights();
  const btnTel=document.getElementById('astr-btn-tel');
  if(btnTel)btnTel.style.display=isChefOuAdjoint()&&isAstreinteTelephoneDesktopAllowed()?'':'none';
  let activeBtn=document.querySelector('#astr-subtabs .subtab-btn.active');
  let sub='planning';
  if(activeBtn){const m=activeBtn.getAttribute('onclick').match(/'([^']+)'/);if(m)sub=m[1];}
  if(sub==='tel'&&(!isChefOuAdjoint()||!isAstreinteTelephoneDesktopAllowed())){
    sub='planning';
    activeBtn=document.getElementById('astr-btn-planning');
  }
  showAstrTab(sub,activeBtn||document.getElementById('astr-btn-planning'));
}
function showAstrTab(sub,btn){
  // Les comptes administrateurs y accèdent sans activer leurs pouvoirs.
  if(sub==='tel'&&!isAstreinteTelephoneDesktopAllowed()){
    showToast('L\u2019astreinte t\u00e9l\u00e9phonique est disponible uniquement sur un ordinateur.','warn');
    sub='planning';
    btn=document.getElementById('astr-btn-planning');
  } else if(sub==='tel'&&!isChefOuAdjoint()){
    sub='planning';
    btn=document.getElementById('astr-btn-planning');
  }
  document.querySelectorAll('#astr-subtabs .subtab-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  ['planning','dispo','piquets','equipes','garde','tel'].forEach(s=>{
    const el=document.getElementById('astr-'+s);
    if(el)el.style.display=s===sub?'':'none';
  });
  if(sub==='planning')rAstrPlanning();
  if(sub==='dispo')rAstrDispo();
  if(sub==='piquets'){astrPiquetWeek=0;rAstrPiquets();}
  if(sub==='equipes')rAstrEquipes();
  if(sub==='garde')rAstrGarde();
  if(sub==='tel')rAstrTel();
}

// ══════════════════════════════════════════════════════
// PLANNING — vue hebdomadaire par équipe
// ══════════════════════════════════════════════════════
let astrPlanningFilter=new Set(['all']);
let astrPlanningNowTimer=null;
function astrWeekNav(dir){astrPlanningWeek+=dir;rAstrPlanning();}
function setAstrFilter(f,btn){
  if(f==='all'){
    astrPlanningFilter=new Set(['all']);
  } else {
    astrPlanningFilter.delete('all');
    if(astrPlanningFilter.has(f))astrPlanningFilter.delete(f);
    else astrPlanningFilter.add(f);
    if(astrPlanningFilter.size===0)astrPlanningFilter=new Set(['all']);
  }
  rAstrPlanning();
}
function rAstrPlanning(){
  if(astrPlanningNowTimer){clearTimeout(astrPlanningNowTimer);astrPlanningNowTimer=null;}
  const mon=getMondayOfWeek(astrPlanningWeek);
  const wk=weekKey(mon);
  document.getElementById('astr-week-label').textContent=weekLabel(mon);
  const now=new Date();
  const todayStr=getDS(now);
  const gran=EQUIPES.reduce((mn,e)=>Math.min(mn,e.granularity),60)||ASTR_CONFIG.granularity;

  // Équipes de garde
  const _pv=PLANNING_ROTATIONS[wk];
  const planSlots=!_pv?[]:(typeof _pv==='string'?[_pv]:(Array.isArray(_pv)?_pv:[]));
  const eq1=planSlots[0]?getEquipeById(planSlots[0]):null;
  const eq2=planSlots[1]?getEquipeById(planSlots[1]):null;

  // Filtres équipes
  const sansEqAll=USERS.filter(u=>!EQUIPES.some(e=>e.membres.includes(u.l)));
  const filterDiv=document.getElementById('astr-planning-filter');
  if(filterDiv){
    filterDiv.innerHTML=`<button class="fb${astrPlanningFilter.has('all')?' active':''}" onclick="setAstrFilter('all',this)">Toutes</button>`
      +(sansEqAll.length?`<button class="fb${astrPlanningFilter.has('sans-equipe')?' active':''}" onclick="setAstrFilter('sans-equipe',this)">Sans équipe</button>`:'')
      +sortEquipes(EQUIPES).map(e=>`<button class="fb${astrPlanningFilter.has(e.id)?' active':''}" style="border-left:3px solid ${e.color};" onclick="setAstrFilter('${e.id}',this)">${e.nom}</button>`).join('');
  }

  // Agents à afficher selon les filtres sélectionnés
  const showAll=astrPlanningFilter.has('all');
  let allRows=[];
  if(showAll||astrPlanningFilter.has('sans-equipe'))
    sortByGradeThenName(sansEqAll).forEach(u=>allRows.push({u,eqColor:'#888',eqNom:'Sans équipe'}));
  sortEquipes(EQUIPES).forEach(function(eq){
    if(showAll||astrPlanningFilter.has(eq.id)){
      sortByGradeThenName(eq.membres.map(l=>USERS.find(x=>x.l===l)).filter(Boolean))
        .forEach(u=>allRows.push({u,eqColor:eq.color,eqNom:eq.nom}));
    }
  });

  // Validation / deadline
  const badge1=eq1?`<span class="eq-badge" style="background:${eq1.color};font-size:11px;">${eq1.nom}</span>`:'<span style="color:var(--t2);">—</span>';
  const badge2=eq2?`<span class="eq-badge" style="background:${eq2.color};font-size:11px;">${eq2.nom}</span>`:'<span style="color:var(--t2);">—</span>';
  const validated=isDispoValidated(wk);
  const isPastWeek=astrPlanningWeek<0;
  const dlPassed=TODAY>getDeadlineDate(astrPlanningWeek);
  const canValid=(isRespEqForte(wk)||isRespEquipe()||hasRight('Administration'))&&!isPastWeek;
  const isSAPlanning=isSuperAdmin();

  // Auto-verrouiller les semaines passées si pas encore validées
  if(isPastWeek&&!validated){
    DISPOS_VALIDATED[wk]=true;
    if(CD())CD().disposValidated=DISPOS_VALIDATED;
    saveData();
  }
  const effectivelyValidated=isPastWeek?true:validated;

  let validBadge='';
  if(isPastWeek){
    validBadge=`<span style="background:#F3F4F6;color:#6B7280;border-radius:8px;padding:2px 9px;font-size:11px;font-weight:600;margin-left:8px;">&#x1F512; Semaine pass\u00e9e \u2014 lecture seule</span>`;
    if(isSAPlanning)validBadge+=`<button class="btn sm" style="font-size:10px;margin-left:6px;color:#854F0B;" onclick="toggleDispoUnlock('${wk}')">&#x1F513; D\u00e9verrouiller (SA)</button>`;
  } else if(effectivelyValidated){
    validBadge=`<span style="background:#EAF3DE;color:#3B6D11;border-radius:8px;padding:2px 9px;font-size:11px;font-weight:600;margin-left:8px;">&#x2705; Dispos valid\u00e9es</span>`;
    if(canValid)validBadge+=`<button class="btn sm" style="font-size:10px;margin-left:6px;color:#E24B4A;" onclick="devaliderDispos('${wk}')">Annuler validation</button>`;
  } else if(dlPassed){
    validBadge=`<span style="background:#FAEEDA;color:#854F0B;border-radius:8px;padding:2px 9px;font-size:11px;font-weight:600;margin-left:8px;">&#x23F3; En attente de validation</span>`;
    if(canValid)validBadge+=`<button class="btn pr sm" style="font-size:10px;margin-left:6px;" onclick="validerDispos('${wk}')">&#x2705; Valider</button>`;
  }

  let html=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--brd);flex-wrap:wrap;">
    <span style="font-size:11px;color:var(--t2);">&#x1F534; Astr. forte :</span> ${badge1}
    <span style="font-size:11px;color:var(--t2);margin-left:8px;">&#x1F7E1; 2\u00e8me astreinte :</span> ${badge2}
    ${validBadge}
  </div>`;

  if(dlPassed&&!validated&&!canValid&&!isRespEquipe()){
    html+='<div style="padding:24px;text-align:center;font-size:13px;color:#854F0B;background:#FAEEDA;border-radius:10px;">&#x23F3; Les disponibilit\u00e9s sont en attente de validation.</div>';
    document.getElementById('astr-planning-grid').innerHTML=html;return;
  }
  if(!allRows.length){
    html+='<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucun agent \u00e0 afficher.</div>';
    document.getElementById('astr-planning-grid').innerHTML=html;return;
  }

  // Rôles à comptabiliser (selon fonction)
  const ROLE_KEYS=['INC2','CA1Eq','CE','Eq'];
  const ROLE_LABELS={'INC2':'INC2','CA1Eq':'CA1Eq','CE':'CE','Eq':'\u00c9q'};
  function fonctionToRole(f){
    if(!f)return 'Eq';
    if(f==='Chef de centre'||f==='Adjoint au chef de centre'){
      // Utiliser la fonction2 si définie, sinon INC2 par défaut
      return 'INC2';
    }
    if(f.includes('tout engin'))return 'INC2';
    if(f.includes('1 équipe')||f.includes('1 equipe'))return 'CA1Eq';
    if(f.includes('équipe')||f.includes('equipe'))return 'CE';
    if(f==='Stagiaire')return 'Eq';
    return 'Eq';
  }
  function getRoleKey(u){
    // Pour Chef de centre et Adjoint, utiliser fonction2 si définie
    const f=u.fonction||'';
    if((f==='Chef de centre'||f==='Adjoint au chef de centre')&&u.fonction2){
      return fonctionToRole(u.fonction2);
    }
    return fonctionToRole(f);
  }

  // Créneaux horaires : de 08h à 08h (24 colonnes de 1h) ou selon gran
  const startHour=8; // colonnes du planning commencent à 08h
  const dispoStartHour=ASTR_CONFIG.weekStartHour??0; // base stockage dispos
  const nbSlots=Math.floor(1440/gran);

  // Créneaux piquets de la semaine
  const piquetsSemaine=PIQUETS[wk]||[];

  // Un bloc par jour
  JOURS_FULL.forEach(function(jour,di){
    const jourDate2=new Date(mon);jourDate2.setDate(jourDate2.getDate()+di);
    const isToday=getDS(jourDate2)===todayStr;
    const MOIS_FR=['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];
    const dateStr=jourDate2.getDate()+' '+MOIS_FR[jourDate2.getMonth()]+' '+jourDate2.getFullYear();
    const jourBgs=['#EEF2FF','#FFF7ED','#ECFDF5','#FFF1F2','#F0F9FF','#FFFBEB','#F5F3FF'];
    const jourFgs=['#4338CA','#C2410C','#065F46','#BE123C','#0369A1','#92400E','#6D28D9'];
    const bg=isToday?'#E6F1FB':jourBgs[di];
    const fg=isToday?'#185FA5':jourFgs[di];
    const planningDayStart=new Date(jourDate2);
    planningDayStart.setHours(startHour,0,0,0);
    const planningDayEnd=new Date(planningDayStart.getTime()+24*60*60*1000);
    const currentSlotIndex=now>=planningDayStart&&now<planningDayEnd
      ?Math.floor((now-planningDayStart)/(gran*60*1000))
      :-1;

    // En-tête du tableau
    html+='<div style="margin-bottom:16px;border:1.5px solid var(--brd);border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05);">';
    html+=`<div style="padding:8px 14px;background:${bg};border-bottom:1.5px solid var(--brd);display:flex;align-items:center;gap:8px;">
      <span style="font-size:14px;font-weight:700;color:${fg};">${jour} ${dateStr}</span>
      ${isToday?'<span style="background:#185FA5;color:#fff;border-radius:10px;padding:1px 8px;font-size:10px;margin-left:4px;">Aujourd\'hui</span>':''}
    </div>`;
    html+='<div style="overflow-x:auto;"><table style="width:max-content;min-width:100%;border-collapse:collapse;font-size:11px;">';

    // En-tête colonnes horaires
    // Générer les labels d'heure
    const heureLabels=[];
    for(let s=0;s<nbSlots;s++){
      const totalMin=(startHour*60+s*gran)%1440;
      const hh2=Math.floor(totalMin/60);
      const mm3=totalMin%60;
      heureLabels.push(pad(hh2)+'h'+(mm3?pad(mm3):''));
    }
    // En-tête ligne 1 : heures début
    html+='<thead><tr>';
    html+='<th style="padding:4px 8px;background:var(--bg);border-right:1px solid var(--brd);border-bottom:1px solid var(--brd);white-space:nowrap;position:sticky;left:0;z-index:2;min-width:130px;">Grade Nom Pr\u00e9nom</th>';
    html+='<th class="astr-fct-col" title="Fonction" style="padding:4px 3px;background:var(--bg);border-right:1px solid var(--brd);border-bottom:1px solid var(--brd);font-size:9px;white-space:nowrap;">Fct</th>';
    for(let s=0;s<nbSlots;s++){
      const isHourMark=gran<=60||(s%(60/gran)===0);
      const currentClass=s===currentSlotIndex?' astr-current-slot astr-current-slot-top':'';
      html+=`<th class="astr-slot-col${currentClass}"${s===currentSlotIndex?' title="Créneau horaire actuel"':''} style="--astr-slot-width:${gran>=60?30:18}px;padding:3px 2px;background:var(--bg);border-right:0.5px solid #e5e7eb;border-bottom:1px solid var(--brd);text-align:center;font-size:9px;font-weight:400;color:var(--t2);">${heureLabels[s]}</th>`;
    }
    html+='</tr>';
    // Ligne 2 : heures fin (décalées)
    html+='<tr>';
    html+='<th style="padding:2px 8px;background:var(--bg);border-right:1px solid var(--brd);border-bottom:1px solid var(--brd);position:sticky;left:0;z-index:2;"></th>';
    html+='<th class="astr-fct-col" style="background:var(--bg);border-right:1px solid var(--brd);border-bottom:1px solid var(--brd);"></th>';
    for(let s=0;s<nbSlots;s++){
      const totalMin=(startHour*60+(s+1)*gran)%1440;
      const hh2=Math.floor(totalMin/60);const mm3=totalMin%60;
      const currentClass=s===currentSlotIndex?' astr-current-slot':'';
      html+=`<th class="astr-slot-col${currentClass}" style="--astr-slot-width:${gran>=60?30:18}px;padding:2px 2px;background:var(--bg);border-right:0.5px solid #e5e7eb;border-bottom:1px solid var(--brd);text-align:center;font-size:9px;font-weight:400;color:#aaa;">${pad(hh2)}h${mm3?pad(mm3):''}</th>`;
    }
    html+='</tr></thead><tbody>';

    // Comptes par rôle
    const roleCounts={};
    ROLE_KEYS.forEach(function(r){roleCounts[r]=new Array(nbSlots).fill(0);});

    // Lignes agents
    allRows.forEach(function({u,eqColor}){
      const login=u.l;
      const uEq=getEquipeOfUser(login);
      const uGran=uEq?uEq.granularity:ASTR_CONFIG.granularity;
      const roleKey=getRoleKey(u);

      html+=`<tr>`;
      html+=`<td style="padding:3px 8px;border-bottom:0.5px solid #f0f0f0;border-right:1px solid var(--brd);position:sticky;left:0;background:#fff;white-space:nowrap;border-left:3px solid ${eqColor};font-size:11px;font-weight:500;">${gradeAbbr(u.grade)} ${u.nom} ${u.prenom}</td>`;
      const displayFonction=(u.fonction==='Chef de centre'||u.fonction==='Adjoint au chef de centre')&&u.fonction2?ROLE_LABELS[fonctionToRole(u.fonction2)]||u.fonction2:ROLE_LABELS[roleKey]||roleKey;
      html+=`<td class="astr-fct-col" title="${escHtml(displayFonction)}" style="padding:3px 3px;border-bottom:0.5px solid #f0f0f0;border-right:1px solid var(--brd);font-size:9px;color:var(--t2);white-space:nowrap;text-align:center;">${displayFonction}</td>`;

      for(let s=0;s<nbSlots;s++){
        const currentCellClass=s===currentSlotIndex?' class="astr-current-slot"':'';
        // Minutes du slot dans la journée (avec gestion passage minuit)
        const slotRawMin=startHour*60+s*gran;
        const slotAbsMin=slotRawMin%1440; // heure réelle dans la journée
        const slotDayOff=Math.floor(slotRawMin/1440); // 1 si slot passe minuit
        // Trouver le slot de dispo correspondant pour cet agent
        const uSlotsDay=getSlotsPerDay(uGran);
        const uStartMin=dispoStartHour*60; // même base que le stockage des dispos
        // Calculer index dispo : tout est ramené aux minutes absolues écoulées
        // depuis lundi à dispoStartHour (la base réelle du stockage des dispos),
        // indépendamment de l'heure d'affichage startHour. Évite le décalage de
        // jour quand dispoStartHour !== startHour.
        const absFromStore=((di+slotDayOff)*1440+slotAbsMin-uStartMin+1440*7)%(1440*7);
        const dispoDay=Math.floor(absFromStore/1440)%7;
        const dispoIdx=Math.floor((absFromStore%1440)/uGran);
        const dispoKey=dispoDay+'_'+dispoIdx;
        const isDispo=DISPOS[wk]?.[login]?.[dispoKey]===true;

        // Piquet sur ce créneau ? — minutes absolues depuis lundi 00h00
        const slotAbsWeekMin=(di+slotDayOff)*1440+slotAbsMin;
        const hasPiquet=piquetsSemaine.some(function(p){
          const membres=p.membres&&p.membres.length?p.membres:[
            p.chefAgres?{login:p.chefAgres,hDebut:p.debut,hFin:p.fin}:null,
            p.conducteur?{login:p.conducteur,hDebut:p.debut,hFin:p.fin}:null,
            p.chefEquipe?{login:p.chefEquipe,hDebut:p.debut,hFin:p.fin}:null,
            p.stagiaire?{login:p.stagiaire,hDebut:p.debut,hFin:p.fin}:null,
          ].filter(Boolean);
          const hasLogin=membres.some(function(m){return m.login===login;});
          if(!hasLogin)return false;
          const pJourIdx=JOURS_FULL.indexOf(p.jour);
          if(pJourIdx<0)return false;
          return membres.filter(function(m){return m.login===login;}).some(function(m){
            const pDeb=timeToMin(m.hDebut||p.debut),pFin=timeToMin(m.hFin||p.fin);
            const isON=pFin<=pDeb;
            // Si le créneau commence avant startHour, il appartient au lendemain dans le planning
            const pDebPlanDay=pDeb<startHour*60?pJourIdx+1:pJourIdx;
            const pDebAbs=pDebPlanDay*1440+pDeb;
            const pFinAbs=isON?pDebPlanDay*1440+pFin+1440:pDebPlanDay*1440+pFin;
            return slotAbsWeekMin>=pDebAbs&&slotAbsWeekMin<pFinAbs;
          });
        });

        if(isDispo){
          roleCounts[roleKey][s]++;
          if(hasPiquet){
            // Disponible ET en piquet : fond vert clair + croix couleur équipe
            html+=`<td${currentCellClass} style="padding:0;border-bottom:0.5px solid #f0f0f0;border-right:0.5px solid #e5e7eb;text-align:center;background:#DCFCE7;"><span style="font-size:11px;font-weight:700;color:${eqColor};">X</span></td>`;
          } else {
            // Disponible : vert
            html+=`<td${currentCellClass} style="padding:0;border-bottom:0.5px solid #f0f0f0;border-right:0.5px solid #e5e7eb;background:#22C55E;"></td>`;
          }
        } else if(hasPiquet){
          // En piquet sans dispo renseignée : fond blanc + croix couleur équipe (ne compte pas dans y)
          html+=`<td${currentCellClass} style="padding:0;border-bottom:0.5px solid #f0f0f0;border-right:0.5px solid #e5e7eb;text-align:center;background:#fff;"><span style="font-size:11px;font-weight:700;color:${eqColor};">X</span></td>`;
        } else if(DISPOS[wk]?.[login]?.[dispoDay+'_'+dispoIdx]===false){
          // Indisponible : rouge
          html+=`<td${currentCellClass} style="padding:0;border-bottom:0.5px solid #f0f0f0;border-right:0.5px solid #e5e7eb;background:#EF4444;"></td>`;
        } else {
          // Non renseigné : blanc
          html+=`<td${currentCellClass} style="padding:0;border-bottom:0.5px solid #f0f0f0;border-right:0.5px solid #e5e7eb;background:#fff;"></td>`;
        }
      }
      html+='</tr>';
    });

    // Lignes de comptage par rôle — piquets (X) et dispos (D) séparés
    const roleCountsX={};
    ROLE_KEYS.forEach(function(r){roleCountsX[r]=new Array(nbSlots).fill(0);});
    // Recalculer piquets indépendamment des dispos
    allRows.forEach(function({u}){
      const login=u.l;
      const roleKey=getRoleKey(u);
      for(let s=0;s<nbSlots;s++){
        const slotRawMinX=startHour*60+s*gran;
        const slotAbsMinX=slotRawMinX%1440;
        const slotDayOffX=Math.floor(slotRawMinX/1440);
        const slotAbsWeekMinX=(di+slotDayOffX)*1440+slotAbsMinX;
        const hasPiquetX=piquetsSemaine.some(function(p){
          const membresX=p.membres&&p.membres.length?p.membres:[
            p.chefAgres?{login:p.chefAgres,hDebut:p.debut,hFin:p.fin}:null,
            p.conducteur?{login:p.conducteur,hDebut:p.debut,hFin:p.fin}:null,
            p.chefEquipe?{login:p.chefEquipe,hDebut:p.debut,hFin:p.fin}:null,
            p.stagiaire?{login:p.stagiaire,hDebut:p.debut,hFin:p.fin}:null,
          ].filter(Boolean);
          if(!membresX.some(function(m){return m.login===login;}))return false;
          const pJourIdx=JOURS_FULL.indexOf(p.jour);if(pJourIdx<0)return false;
          return membresX.filter(function(m){return m.login===login;}).some(function(m){
            const pDeb=timeToMin(m.hDebut||p.debut),pFin=timeToMin(m.hFin||p.fin);
            const isON=pFin<=pDeb;
            const pDebPlanDay=pDeb<startHour*60?pJourIdx+1:pJourIdx;
            const pDebAbs=pDebPlanDay*1440+pDeb;
            const pFinAbs=isON?pDebPlanDay*1440+pFin+1440:pDebPlanDay*1440+pFin;
            return slotAbsWeekMinX>=pDebAbs&&slotAbsWeekMinX<pFinAbs;
          });
        });
        if(hasPiquetX)roleCountsX[roleKey][s]++;
      }
    });

    // Séparateur avant les lignes de comptage
    html+=`<tr><td colspan="${nbSlots+2}" style="background:var(--brd);height:1.5px;padding:0;"></td></tr>`;

    // Une seule ligne par rôle : X / D
    ROLE_KEYS.forEach(function(rk){
      const isLastRole=rk===ROLE_KEYS[ROLE_KEYS.length-1];
      html+=`<tr style="background:var(--bg);">`;
      html+=`<td style="padding:3px 8px;border-right:1px solid var(--brd);border-bottom:0.5px solid #e5e7eb;position:sticky;left:0;background:var(--bg);font-size:10px;font-weight:600;color:var(--t2);white-space:nowrap;">${ROLE_LABELS[rk]}</td>`;
      html+=`<td class="astr-fct-col" style="border-right:1px solid var(--brd);border-bottom:0.5px solid #e5e7eb;background:var(--bg);"></td>`;
      for(let s=0;s<nbSlots;s++){
        const x=roleCountsX[rk][s];
        const d=roleCounts[rk][s];
        const hasAny=x>0||d>0;
        const currentCellClass=s===currentSlotIndex?` class="astr-current-slot${isLastRole?' astr-current-slot-bottom':''}"`:'';
        html+=`<td${currentCellClass} style="padding:1px 2px;border-right:0.5px solid #e5e7eb;border-bottom:0.5px solid #e5e7eb;text-align:center;font-size:9px;white-space:nowrap;">`
          +(hasAny
            ?`<span style="color:#854F0B;font-weight:700;">${x||'0'}</span><span style="color:#aaa;">/</span><span style="color:#0369A1;font-weight:700;">${d||'0'}</span>`
            :`<span style="color:#e5e7eb;">—</span>`)
          +`</td>`;
      }
      html+='</tr>';
    });

    html+='</tbody></table></div></div>';
  });

  document.getElementById('astr-planning-grid').innerHTML=html;

  // Le repère change automatiquement au prochain début de créneau tant que
  // le planning reste affiché.
  const granMs=gran*60*1000;
  const minuteOfDay=now.getHours()*60+now.getMinutes();
  const elapsedInSlot=(minuteOfDay%gran)*60*1000+now.getSeconds()*1000+now.getMilliseconds();
  astrPlanningNowTimer=setTimeout(function(){
    const planning=document.getElementById('astr-planning');
    if(planning&&planning.style.display!=='none')rAstrPlanning();
  },Math.max(1000,granMs-elapsedInSlot+100));

  // Légende
  const sansEqLeg=USERS.filter(u=>!EQUIPES.some(e=>e.membres.includes(u.l)));
  document.getElementById('astr-legende').innerHTML=
    '<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><div style="width:20px;height:12px;border-radius:2px;background:#22C55E;border:1px solid #16A34A;"></div>Disponible</div>'
    +'<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><div style="width:20px;height:12px;border-radius:2px;background:#DCFCE7;border:1px solid #16A34A;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#166534;">X</div>Dispo + piquet</div>'
    +'<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><div style="width:20px;height:12px;border-radius:2px;background:#EF4444;border:1px solid #DC2626;"></div>Indisponible</div>'
    +'<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><div style="width:20px;height:12px;border-radius:2px;background:#fff;border:1px solid #e5e7eb;"></div>Non renseign\u00e9</div>'
    +'<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><div style="width:20px;height:12px;border-radius:2px;background:#DBEAFE;border:2px solid #2563EB;box-sizing:border-box;"></div>Cr\u00e9neau actuel</div>'
    +'<div style="font-size:11px;color:var(--t2);margin-left:8px;"><span style="color:#854F0B;font-weight:700;">x</span> = piquets &nbsp;/&nbsp; <span style="color:#0369A1;font-weight:700;">y</span> = dispos</div>'
    +sortEquipes(EQUIPES).map(e=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><div style="width:20px;height:12px;border-radius:2px;background:${e.color};"></div>${e.nom}</div>`).join('');
}

function oAstrCellDetailSansEq(wk,dayIdx,slotIdx){
  const sansEq=USERS.filter(u=>!EQUIPES.some(e=>e.membres.includes(u.l)));
  const mon=new Date(wk.slice(0,4)+'-'+wk.slice(4,6)+'-'+wk.slice(6,8));
  const dd=new Date(mon);dd.setDate(dd.getDate()+dayIdx);
  const gran=ASTR_CONFIG.granularity;
  const label=`${jourLabel(dayIdx,true)} ${dd.getDate()}/${dd.getMonth()+1} — ${slotToLabelDay(dayIdx,slotIdx,gran)}`;
  const agents=sansEq.map(u=>{
    const dispo=DISPOS[wk]?.[u.l]?.[`${dayIdx}_${slotIdx}`]===true;
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd);font-size:12px;">
      <div style="flex:1;font-weight:500;">${u.prenom} ${u.nom}</div>
      <span class="astr-status-badge ${dispo?'valide':'attente'}">${dispo?'Dispo':'Indispo'}</span>
    </div>`;
  }).join('');
  document.getElementById('mt').textContent=label;
  document.getElementById('mi').textContent='Agents sans équipe';
  document.getElementById('mb').innerHTML=`<div>${agents}</div><button class="btn sm" style="width:100%;margin-top:10px;" onclick="cM()">Fermer</button>`;
  document.getElementById('mo').style.display='flex';
}

function hexAlpha(hex,alpha){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function changerEquipeSemaine(wk){
  const opts=sortEquipes(EQUIPES).map(e=>`<option value="${e.id}">${e.nom}</option>`).join('');
  const cur=getEquipeSemaine(wk);
  document.getElementById('mt').textContent='Équipe de garde';
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`
    <div style="padding:4px 0;">
      <div class="fg"><div class="fgl">Équipe assignée à cette semaine</div>
        <select class="fi" id="chg-eq-sel">${opts}</select>
      </div>
      <div class="brow">
        <button class="btn pr sm" onclick="confirmerChangerEq('${wk}')">✅ Confirmer</button>
        <button class="btn sm" onclick="cM()">Annuler</button>
      </div>
    </div>`;
  document.getElementById('chg-eq-sel').value=cur?.id||'';
  document.getElementById('mo').style.display='flex';
}
function confirmerChangerEq(wk){
  PLANNING_ROTATIONS[wk]=document.getElementById('chg-eq-sel').value;
  cM();rAstrPlanning();
}

function oAstrCellDetail(wk,dayIdx,slotIdx,eqId){
  const eq=eqId?getEquipeById(eqId):getEquipeSemaine(wk);
  if(!eq)return;
  const mon=new Date(wk.slice(0,4)+'-'+wk.slice(4,6)+'-'+wk.slice(6,8));
  const dd=new Date(mon);dd.setDate(dd.getDate()+dayIdx);
  const label=`${jourLabel(dayIdx,true)} ${dd.getDate()}/${dd.getMonth()+1} — ${slotToLabelDay(dayIdx,slotIdx,eq.granularity)}`;
  const agents=eq.membres.map(login=>{
    const u=USERS.find(x=>x.l===login);
    const dispo=DISPOS[wk]?.[login]?.[`${dayIdx}_${slotIdx}`]===true;
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd);font-size:12px;">
      <div style="flex:1;font-weight:500;">${u?fullName(u):login}</div>
      <span class="astr-status-badge ${dispo?'valide':'attente'}">${dispo?'Dispo':'Indispo'}</span>
    </div>`;
  }).join('');
  document.getElementById('mt').textContent=label;
  document.getElementById('mi').textContent=eq.nom;
  document.getElementById('mb').innerHTML=`<div>${agents||'<div style="color:var(--t2);font-size:12px;">Aucun membre</div>'}</div>
    <button class="btn sm" style="width:100%;margin-top:10px;" onclick="cM()">Fermer</button>`;
  document.getElementById('mo').style.display='flex';
}

// ══════════════════════════════════════════════════════
// DISPONIBILITÉS — saisie agent
// ══════════════════════════════════════════════════════
let dispoSubMode='mes'; // 'mes' | 'equipe' | 'autres'
function astrDispoWeekNav(dir){astrDispoWeek+=dir;rAstrDispo();}
function showDispoSub(sub,btn){
  dispoSubMode=sub;
  document.querySelectorAll('#dispo-subnav .subtab-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  rAstrDispo();
}
// ── Demandes de modification de dispos ──
function showDispoRequestModal(wk,login){
  const u=USERS.find(x=>x.l===login);
  const eq=getEquipeOfUser(login);
  const gran=eq?eq.granularity:ASTR_CONFIG.granularity;
  const mon=new Date(wk.slice(0,4)+'-'+wk.slice(4,6)+'-'+wk.slice(6,8));
  const MOIS_FR=['janv.','f\u00e9vr.','mars','avr.','mai','juin','juil.','ao\u00fbt','sept.','oct.','nov.','d\u00e9c.'];
  const startHour=ASTR_CONFIG.weekStartHour||0;

  function slotLabel(s){
    const totalMin=(startHour*60+s*gran)%1440;
    return pad(Math.floor(totalMin/60))+'h'+(totalMin%60?pad(totalMin%60):'');
  }
  function valSelect(keyPrefix,curVal){
    // Sélecteur de valeur pour un créneau
    const opts=[
      {v:'true',label:'Dispo',color:'#22C55E'},
      {v:'false',label:'Indispo',color:'#EF4444'}
    ];
    return '<select id="val_'+keyPrefix+'" style="font-size:10px;padding:1px 3px;border:1px solid var(--brd);border-radius:4px;margin-left:4px;" onchange="reqApplyGlobal(this,\''+keyPrefix+'\')">'
      +opts.map(function(o){return '<option value="'+o.v+'"'+(String(curVal)===o.v?' selected':'')+' style="background:'+o.color+';color:#fff;">'+o.label+'</option>';}).join('')
      +'</select>';
  }

  // Construire le sélecteur de créneaux jour par jour
  let creneauxHtml='<div style="max-height:360px;overflow-y:auto;margin-bottom:10px;">';
  JOURS_FULL.forEach(function(jour,di){
    const jourDate=new Date(mon);jourDate.setDate(jourDate.getDate()+di);
    const dateStr=jourDate.getDate()+' '+MOIS_FR[jourDate.getMonth()];
    const nbSlots=getSlotsPerDay(gran);

    let slotsHtml='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">';
    for(let s=0;s<nbSlots;s++){
      const key=di+'_'+s;
      const curVal=DISPOS[wk]?.[login]?.[key];
      const curBg=curVal===true?'#22C55E':curVal===false?'#EF4444':'#E5E7EB';
      const curColor=curVal===true||curVal===false?'#fff':'#555';
      slotsHtml+='<div style="display:flex;align-items:center;background:#f9f9f9;border:1px solid #e5e7eb;border-radius:6px;padding:2px 5px;gap:3px;" id="slot-block-'+key+'">'
        +'<input type="checkbox" id="slot_'+di+'_'+s+'" name="req-slots" value="'+key+'" style="accent-color:#7C3AED;width:13px;height:13px;" onchange="reqToggleVal(this,\''+key+'\')">'
        +'<span style="font-size:10px;font-weight:500;padding:1px 4px;border-radius:3px;background:'+curBg+';color:'+curColor+';">'+slotLabel(s)+'</span>'
        +'<span id="valsel_'+key+'" style="display:none;">'+valSelect(key,String(curVal))+'</span>'
        +'</div>';
    }
    slotsHtml+='</div>';

    creneauxHtml+='<div style="margin-bottom:8px;padding:6px 8px;background:var(--bg);border-radius:8px;border:1px solid var(--brd);">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">'
      +'<span style="font-size:11px;font-weight:600;">'+jour+' <span style="font-weight:400;color:var(--t2);">'+dateStr+'</span></span>'
      +'<div style="display:flex;gap:3px;">'
      +'<button type="button" class="btn sm" style="font-size:9px;padding:1px 5px;" onclick="reqSelectDay('+di+','+nbSlots+',true)">Tout</button>'
      +'<button type="button" class="btn sm" style="font-size:9px;padding:1px 5px;" onclick="reqSelectDay('+di+','+nbSlots+',false)">Aucun</button>'
      +'</div></div>'
      +slotsHtml+'</div>';
  });
  creneauxHtml+='</div>';

  document.getElementById('mt').textContent='Demande de modification de disponibilit\u00e9s';
  document.getElementById('mi').textContent=(u?fullName(u):login)+' \u2014 '+weekLabel(mon);
  document.getElementById('mb').innerHTML=
    '<div>'
    +'<div style="background:#EDE9FE;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#5B21B6;">'
    +'Cochez les cr\u00e9neaux \u00e0 modifier puis indiquez la nouvelle valeur souhait\u00e9e.</div>'
    // Valeur globale
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:#F5F3FF;border-radius:8px;border:1px solid #DDD6FE;">'
    +'<span style="font-size:11px;font-weight:600;color:#5B21B6;">Appliquer \u00e0 tous les cr\u00e9neaux coch\u00e9s :</span>'
    +'<button type="button" class="btn sm" style="font-size:10px;background:#22C55E;color:#fff;border-color:#22C55E;" onclick="reqApplyAllVal(\'true\')">Dispo</button>'
    +'<button type="button" class="btn sm" style="font-size:10px;background:#EF4444;color:#fff;border-color:#EF4444;" onclick="reqApplyAllVal(\'false\')">Indispo</button>'
    +'<button type="button" class="btn sm" style="font-size:10px;margin-left:auto;" onclick="reqSelectAll(true)">Tout s\u00e9lectionner</button>'
    +'</div>'
    +creneauxHtml
    +'<div class="fg"><div class="fgl">Motif <span style="font-size:10px;color:var(--t2);font-weight:400;">(optionnel)</span></div>'
    +'<textarea class="fi" id="dispo-req-motif" rows="2" placeholder="Ex: Contrainte professionnelle..." style="resize:vertical;"></textarea></div>'
    +'<div class="brow" style="margin-top:10px;">'
    +'<button class="btn sm" style="background:#7C3AED;color:#fff;" onclick="envoyerDispoRequest(\''+wk+'\',\''+login+'\')">&#x1F4E8; Envoyer la demande</button>'
    +'<button class="btn sm" onclick="cM()">Annuler</button></div></div>';
  document.getElementById('mo').style.display='flex';
}

function reqToggleVal(cb,key){
  const sel=document.getElementById('valsel_'+key);
  if(sel)sel.style.display=cb.checked?'inline':'none';
}
function reqApplyAllVal(val){
  document.querySelectorAll('input[name="req-slots"]:checked').forEach(function(cb){
    const key=cb.value;
    const sel=document.getElementById('val_'+key);
    if(sel)sel.value=val;
  });
}
function reqSelectDay(di,nbSlots,checked){
  for(let s=0;s<nbSlots;s++){
    const cb=document.getElementById('slot_'+di+'_'+s);
    if(cb){cb.checked=checked;reqToggleVal(cb,di+'_'+s);}
  }
}
function reqSelectAll(checked){
  document.querySelectorAll('input[name="req-slots"]').forEach(function(cb){
    cb.checked=checked;reqToggleVal(cb,cb.value);
  });
}

function envoyerDispoRequest(wk,login){
  const motif=document.getElementById('dispo-req-motif')?.value.trim()||'';
  const checkedSlots=Array.from(document.querySelectorAll('input[name="req-slots"]:checked'));
  if(!checkedSlots.length){showToast('S\u00e9lectionnez au moins un cr\u00e9neau.','warn');return;}

  const gran=(function(){const eq=getEquipeOfUser(login);return eq?eq.granularity:ASTR_CONFIG.granularity;})();
  const startHour=ASTR_CONFIG.weekStartHour||0;
  const mon=new Date(wk.slice(0,4)+'-'+wk.slice(4,6)+'-'+wk.slice(6,8));
  const MOIS_FR=['janv.','f\u00e9vr.','mars','avr.','mai','juin','juil.','ao\u00fbt','sept.','oct.','nov.','d\u00e9c.'];

  // Récupérer les slots avec leur valeur souhaitée
  const slots=checkedSlots.map(function(cb){
    const key=cb.value;
    const sel=document.getElementById('val_'+key);
    const newVal=sel?sel.value:'true';
    return {key:key,newVal:newVal};
  });

  // Grouper par jour pour affichage
  const slotsByDay={};
  slots.forEach(function(s){
    const parts=s.key.split('_');
    const di=parseInt(parts[0]),si=parseInt(parts[1]);
    if(!slotsByDay[di])slotsByDay[di]=[];
    slotsByDay[di].push({s:si,newVal:s.newVal});
  });
  const slotsDetail=Object.keys(slotsByDay).map(function(d){
    const jourDate=new Date(mon);jourDate.setDate(jourDate.getDate()+parseInt(d));
    const dateStr=JOURS_FULL[d]+' '+jourDate.getDate()+' '+MOIS_FR[jourDate.getMonth()];
    const valLabels={'true':'Dispo','false':'Indispo'};
    const heures=slotsByDay[d].map(function(x){
      const totalMin=(startHour*60+x.s*gran)%1440;
      const h=pad(Math.floor(totalMin/60))+'h'+(totalMin%60?pad(totalMin%60):'');
      return h+' \u2192 '+valLabels[x.newVal];
    }).join(', ');
    return {jour:dateStr,heures:heures,slots:slotsByDay[d]};
  });

  if(!DISPO_REQUESTS[wk])DISPO_REQUESTS[wk]=[];
  DISPO_REQUESTS[wk]=DISPO_REQUESTS[wk].filter(function(r){return !(r.login===login&&r.statut==='en-attente');});
  DISPO_REQUESTS[wk].push({
    id:'dr_'+Date.now(),
    login:login,wk:wk,motif:motif,
    slots:slots,slotsDetail:slotsDetail,
    hDemande:getHHMM(N()),dateDemande:getDS(N()),
    statut:'en-attente',reponduPar:null,hReponse:null
  });
  saveData();cM();rAstrDispo();
  showToast('Demande envoy\u00e9e ('+slots.length+' cr\u00e9neau(x))','success');
}

function getDispoRequestsBadge(wk){
  if(!DISPO_REQUESTS[wk])return 0;
  const myEq=getEquipeOfUser(CU.l);
  if(!myEq&&!hasRight('Administration'))return 0;
  return DISPO_REQUESTS[wk].filter(function(r){
    if(r.statut!=='en-attente')return false;
    if(hasRight('Administration'))return true;
    return myEq&&myEq.membres.includes(r.login);
  }).length;
}

function repondreDispoRequest(wk,reqId,reponse){
  if(!DISPO_REQUESTS[wk])return;
  const req=DISPO_REQUESTS[wk].find(function(r){return r.id===reqId;});
  if(!req)return;
  req.statut=reponse;
  req.reponduPar=CU.l;
  req.hReponse=getHHMM(N());
  // Si accepté → appliquer les valeurs demandées
  if(reponse==='accepte'){
    if(!DISPOS[wk])DISPOS[wk]={};
    if(!DISPOS[wk][req.login])DISPOS[wk][req.login]={};
    (req.slots||[]).forEach(function(s){
      const key=typeof s==='string'?s:s.key;
      const newVal=typeof s==='object'?s.newVal:'true';
      if(newVal==='true'||newVal==='false')DISPOS[wk][req.login][key]=newVal==='true';
    });
    // Sauvegarder les dispos dans la caserne
    if(CD())CD().dispos=DISPOS;
  }
  saveData();rAstrDispo();
  showToast('Demande '+(reponse==='accepte'?'accept\u00e9e \u2014 l\'agent peut modifier ses dispos':'refus\u00e9e'),'success');
}

function toggleDispoUnlock(wk){
  if(!isSuperAdmin())return;
  const wasLocked=!DISPOS_UNLOCKED[wk];
  if(DISPOS_UNLOCKED[wk])delete DISPOS_UNLOCKED[wk];
  else DISPOS_UNLOCKED[wk]=true;
  saveData();
  // Rafraîchir les deux vues
  try{rAstrDispo();}catch(e){}
  try{rAstrPlanning();}catch(e){}
  showToast(wasLocked?'Semaine d\u00e9verrouill\u00e9e pour modification':'Semaine reverrouillee','success');
}

function getDeadlineDate(weekOffset,customDl){
  // La deadline est le jour dl.dayOfWeek de la SEMAINE PRÉCÉDANT la semaine concernée
  const dl=customDl||ASTR_CONFIG.deadline;
  const weekStart=getMondayOfWeek(weekOffset); // début de la semaine concernée
  // Semaine précédente = weekStart - 7 jours
  const prevWeekStart=new Date(weekStart);prevWeekStart.setDate(prevWeekStart.getDate()-7);
  // Trouver le jour dl.dayOfWeek dans cette semaine précédente
  const startDay=ASTR_CONFIG.weekStartDay??1;
  let dayOffset=((dl.dayOfWeek-startDay)+7)%7;
  const dlDate=new Date(prevWeekStart);
  dlDate.setDate(dlDate.getDate()+dayOffset);
  dlDate.setHours(dl.hour,dl.minute,59,0);
  return dlDate;
}
function dispoDayLabel(wk,dayIdx,full){
  const value=String(wk||'');
  const start=new Date(Number(value.slice(0,4)),Number(value.slice(4,6))-1,Number(value.slice(6,8)));
  start.setDate(start.getDate()+Number(dayIdx||0));
  return jourLabel(dayIdx,!!full)+' '+pad(start.getDate())+'/'+pad(start.getMonth()+1);
}
function renderDispoAgentBlock(login,wk,isResp,isAdmin,pastDeadline,astrDispoWeek,myEq){
  const u=USERS.find(x=>x.l===login)||{prenom:login,nom:''};
  const eq=getEquipeOfUser(login)||(myEq&&myEq.membres&&myEq.membres.includes(login)?myEq:null);
  const agGran=eq?eq.granularity:ASTR_CONFIG.granularity;
  const isMe=login===CU.l;
  const isFuture=astrDispoWeek>=1;
  const isCurrent=astrDispoWeek===0;
  const isPast=astrDispoWeek<0;
  const isSA=isSuperAdmin();
  const isUnlocked=DISPOS_UNLOCKED[wk]===true;
  // Règles :
  // Passées : seul superadmin avec déverrouillage explicite
  // Courante : resp/admin/SA uniquement
  // Futures : tout le monde si deadline non dépassée
  const isValidated=isDispoValidated(wk);
  const isAgentUnlocked=isMe&&(DISPOS_UNLOCKED[wk+'_agents']||[]).includes(login);
  // Si semaine validée → seul superadmin ou agent déverrouillé par resp peut modifier
  const canEdit=isValidated
    ? (isSA&&isUnlocked)||isAgentUnlocked
    : isPast
      ? (isSA&&isUnlocked)||isAgentUnlocked
      : isCurrent
        ? (isResp||isAdmin||isSA)
        : (isMe?(isFuture&&!pastDeadline):(isResp||isAdmin||isSA));
  if(!DISPOS[wk])DISPOS[wk]={};
  if(!DISPOS[wk][login])DISPOS[wk][login]={};
  let h='';
  h+='<div style="margin-bottom:16px;padding:10px;background:#fff;border-radius:10px;border:1px solid var(--brd);box-sizing:border-box;max-width:100%;">';
  // En-tête bloc agent
  const pendingReq=isMe&&(DISPO_REQUESTS[wk]||[]).find(function(r){return r.login===login&&r.statut==='en-attente';});
  h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">'
    +'<div style="font-size:12px;font-weight:600;">'+(isMe?'Mes disponibilit\u00e9s':fullName(u))+'</div>'
    +(eq?'<span class="eq-badge" style="background:'+eq.color+';font-size:10px;padding:2px 7px;">'+eq.nom+'</span>':'')
    +(!canEdit&&isMe&&isValidated?'<span style="background:#FAEEDA;color:#854F0B;border-radius:6px;padding:2px 8px;font-size:10px;">&#x1F512; Semaine valid\u00e9e</span>':'')
    +(!canEdit&&(isCurrent||isPast)&&isMe&&!isValidated?'<span style="background:#FAEEDA;color:#854F0B;border-radius:6px;padding:2px 8px;font-size:10px;">&#x1F512; Semaine verrouill\u00e9e</span>':'')
    // Bouton demande de modif pour l'agent (semaine validée ou courante verrouillée)
    +(!canEdit&&isMe&&(isValidated||isCurrent||isPast)&&!isSA
      ?(pendingReq
        ?'<span style="background:#EFF6FF;color:#1D4ED8;border-radius:6px;padding:2px 8px;font-size:10px;margin-left:auto;">&#x23F3; Demande en attente</span>'
        :'<button class="btn sm" style="font-size:10px;background:#7C3AED;color:#fff;border-color:#7C3AED;margin-left:auto;" onclick="showDispoRequestModal(\''+wk+'\',\''+login+'\')">&#x270F; Demande de modification</button>')
      :'')
    +((canEdit&&!isMe)?'<div style="margin-left:auto;display:flex;gap:4px;">'
      +'<button class="btn sm" style="font-size:10px;padding:2px 7px;" onclick="setAllDispoFor(\''+wk+'\',\''+login+'\',true,\''+(eq?eq.color:'#22C55E')+'\')">&#x2705; Tout</button>'
      +'<button class="btn sm" style="font-size:10px;padding:2px 7px;" onclick="setAllDispoFor(\''+wk+'\',\''+login+'\',false,\''+(eq?eq.color:'#22C55E')+'\')">&#x274C; Rien</button>'
      +'<button class="btn sm" title="Tout effacer" style="font-size:10px;padding:2px 7px;color:#E24B4A;" onclick="clearAllDispoFor(\''+wk+'\',\''+login+'\',\''+(eq?eq.color:'#888')+'\')">&#x1F5D1;</button>'
      +'</div>':'')
    +'</div>';
  // Grille alignée : largeur de case FIXE (aligne en-tête et cases, évite tout décalage).
  // Enveloppée dans un conteneur à défilement horizontal, comme le planning.
  const slotsDay0=getSlotsForDay(0,agGran);
  const _lw=78;        // largeur du libellé "Lun 27/07" (px)
  const _gridHost=document.getElementById('astr-dispo-grid');
  const _blockInset=22;
  const _availableW=Math.max(0,(_gridHost&&_gridHost.clientWidth?_gridHost.clientWidth:0)-_blockInset-_lw-1);
  // En paysage, répartir exactement les 24 créneaux sur la largeur disponible.
  // Sur un écran plus étroit ou avec une granularité fine, conserver 24 px et
  // permettre le défilement horizontal.
  const _desktopFit=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const _cw=_desktopFit?Math.max(1,_availableW/slotsDay0):Math.max(24,Math.floor(_availableW/slotsDay0));
  const _totalW=_lw+slotsDay0*_cw;
  // Largeur explicite : évite les arrondis Flexbox de Safari qui coupaient le
  // dernier créneau 07h–08h en orientation paysage.
  h+='<div class="dispo-scroll" style="overflow-x:'+(_desktopFit?'hidden':'auto')+';-webkit-overflow-scrolling:touch;max-width:100%;">';
  h+='<div style="min-width:'+_totalW+'px;width:'+_totalW+'px;">';
  // En-tête des heures — même présentation que le planning :
  // ligne 1 = heures de début, ligne 2 = heures de fin (décalées, grisées).
  const _startH=ASTR_CONFIG.weekStartHour??0;
  const _hLabel=function(slotIdx){
    const totalMin=(_startH*60+slotIdx*agGran)%1440;
    const hh=Math.floor(totalMin/60),mm=totalMin%60;
    return pad(hh)+'h'+(mm>0?pad(mm):'');
  };
  // Ligne 1 : heures de début
  h+='<div style="display:flex;">'+'<div style="width:'+_lw+'px;flex-shrink:0;"></div>';
  for(let s=0;s<slotsDay0;s++){
    const showLbl=(agGran>=60)||(s%(60/agGran)===0);
    h+='<div style="flex:0 0 '+_cw+'px;width:'+_cw+'px;text-align:center;font-size:10px;font-weight:500;color:var(--t2);white-space:nowrap;overflow:hidden;">'+(showLbl?_hLabel(s):'')+'</div>';
  }
  h+='</div>';
  // Ligne 2 : heures de fin (créneau suivant)
  h+='<div style="display:flex;margin-bottom:2px;">'+'<div style="width:'+_lw+'px;flex-shrink:0;"></div>';
  for(let s=0;s<slotsDay0;s++){
    const showLbl=(agGran>=60)||(s%(60/agGran)===0);
    h+='<div style="flex:0 0 '+_cw+'px;width:'+_cw+'px;text-align:center;font-size:9px;font-weight:400;color:var(--t3,#9CA3AF);white-space:nowrap;overflow:hidden;">'+(showLbl?_hLabel(s+1):'')+'</div>';
  }
  h+='</div>';
  for(let d=0;d<7;d++){
    const slotsD=getSlotsForDay(d,agGran);
    h+='<div style="display:flex;align-items:center;margin-bottom:3px;"><div style="width:'+_lw+'px;flex-shrink:0;font-size:11px;font-weight:600;color:var(--t);white-space:nowrap;">'+dispoDayLabel(wk,d,false)+'</div>';
    for(let s=0;s<slotsD;s++){
      const key=d+'_'+s;
      const val=DISPOS[wk][login][key];
      const isDispo=val===true,isIndispo=val===false;
      const bg=isDispo?'#22C55E':isIndispo?'#EF4444':'#E5E7EB';
      const cursor=canEdit?'pointer':'default';
      const oc=canEdit?'toggleDispoCell(\''+wk+'\',\''+login+'\','+d+','+s+',this,\''+(eq?eq.color:'#22C55E')+'\')':'';
      const dragVal=isDispo?'true':isIndispo?'false':'null';
      h+='<div class="dispo-cell" style="flex:0 0 '+_cw+'px;width:'+_cw+'px;box-sizing:border-box;height:28px;background:'+bg+';cursor:'+cursor+';transition:background .1s;border-radius:3px;border:1px solid #fff;user-select:none;"'
        +' title="'+dispoDayLabel(wk,d,true)+' '+slotToLabelDay(d,s,agGran)+'"'
        +' data-wk="'+wk+'" data-login="'+login+'" data-d="'+d+'" data-s="'+s+'" data-val="'+dragVal+'"'
        +(oc?' onclick="'+oc+'"':'')+'></div>';
    }
    h+='</div>';
  }
  // Fermer : conteneur interne (min-width), conteneur de défilement (.dispo-scroll),
  // puis le bloc agent lui-même. Sans cette 3e fermeture, les blocs agents
  // s'imbriquent en cascade les uns dans les autres.
  h+='</div></div></div>';
  return h;
}

// Échelle progressive de couleur pour un pourcentage de disponibilité :
//   ≤ 25 %  → rouge franc
//   25→50 % → rouge vers orange
//   50→75 % → orange vers vert-jaune
//   ≥ 75 %  → vert franc
// Le dégradé est continu (interpolation), pas par paliers.
function pctDispoColor(pct){
  const p=Math.max(0,Math.min(100,pct||0));
  const rouge=[226,75,74];    // #E24B4A
  const orange=[245,158,11];  // #F59E0B
  const vert=[34,197,94];     // #22C55E
  const mix=function(a,b,t){
    return 'rgb('+Math.round(a[0]+(b[0]-a[0])*t)+','
                 +Math.round(a[1]+(b[1]-a[1])*t)+','
                 +Math.round(a[2]+(b[2]-a[2])*t)+')';
  };
  if(p<=25)return 'rgb(226,75,74)';           // rouge franc
  if(p>=75)return 'rgb(34,197,94)';           // vert franc
  if(p<=50)return mix(rouge,orange,(p-25)/25); // 25→50 : rouge → orange
  return mix(orange,vert,(p-50)/25);           // 50→75 : orange → vert
}

function rAstrDispo(){
  const mon=getMondayOfWeek(astrDispoWeek);
  const wk=weekKey(mon);
  document.getElementById('astr-dispo-week-label').textContent=weekLabel(mon);
  const myEq=getEquipeOfUser(CU.l);
  const isResp=isRespEquipe();
  const isAdmin=hasRight('Administration');

  // Afficher/cacher sous-onglets selon droits
  const dispoEquipeBtn=document.getElementById('dispo-btn-equipe');
  const dispoAutresBtn=document.getElementById('dispo-btn-autres');
  if(dispoEquipeBtn)dispoEquipeBtn.style.display=(isResp||isAdmin)?'':'none';
  if(dispoAutresBtn)dispoAutresBtn.style.display=(isResp||isAdmin)?'':'none';

  // Deadline
  const dlDate=getDeadlineDate(astrDispoWeek);
  const isNextWeek=astrDispoWeek===1;
  const pastDeadline=isNextWeek&&TODAY>dlDate;
  const JOURS_DL=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const dl=ASTR_CONFIG.deadline;
  const dlLabel=`${JOURS_DL[dl.dayOfWeek]} ${pad(dl.hour)}:${pad(dl.minute)}`;
  const infoEl=document.getElementById('astr-dispo-info');
  const isSADispo=isSuperAdmin();
  const isUnlockedDispo=DISPOS_UNLOCKED[wk]===true;
  if(astrDispoWeek<0){
    const unlockBtn=isSADispo
      ?' <button class="btn sm" style="font-size:11px;background:'+(isUnlockedDispo?'#E24B4A':'#854F0B')+';color:#fff;" onclick="toggleDispoUnlock(\''+wk+'\')">'+(isUnlockedDispo?'&#x1F512; Reverrouiller':'&#x1F513; D\u00e9verrouiller')+'</button>'
      :'';
    infoEl.innerHTML=(isUnlockedDispo
      ?'<span style="color:#854F0B;font-weight:600;">&#x1F513; Semaine d\u00e9verrouill\u00e9e par le superadmin.</span>'
      :'<span style="color:#888;">&#x1F512; Semaine pass\u00e9e \u2014 modifications bloqu\u00e9es.</span>')
      +unlockBtn;
  } else if(isDispoValidated(wk)){
    const unlockBtn=isSADispo
      ?' <button class="btn sm" style="font-size:11px;background:'+(isUnlockedDispo?'#E24B4A':'#854F0B')+';color:#fff;" onclick="toggleDispoUnlock(\''+wk+'\')">'+(isUnlockedDispo?'&#x1F512; Reverrouiller':'&#x1F513; D\u00e9verrouiller')+'</button>'
      :'';
    infoEl.innerHTML='<span style="color:#3B6D11;font-weight:600;">&#x2705; Semaine valid\u00e9e.</span>'
      +(isSADispo?' '+unlockBtn:'');
  } else if(astrDispoWeek===0&&!(isResp||isAdmin||isSADispo)){
    infoEl.innerHTML='<span style="color:#888;">&#x1F512; Semaine en cours \u2014 modification impossible.</span>';
  } else if(astrDispoWeek===0&&(isResp||isAdmin||isSADispo)){
    infoEl.innerHTML='<span style="color:var(--amb);">Semaine en cours \u2014 vous pouvez modifier les disponibilit\u00e9s des agents.</span>';
  } else if(pastDeadline&&isNextWeek){
    infoEl.innerHTML='<span style="color:#E24B4A;">&#x26A0; Deadline ('+dlLabel+') d\u00e9pass\u00e9e.'+(isResp||isAdmin?' Vous pouvez toujours modifier.':' Contactez votre responsable.')+'</span>';
  } else {
    infoEl.innerHTML='Non renseignés = gris. Après sélection : disponible = vert, indisponible = rouge. Le gris revient uniquement avec « Tout effacer ». <strong>Deadline\u00a0: '+dlLabel+'.</strong>';
  }

  // Panneau demandes de modification en attente (resp/admin seulement)
  const reqPanel=document.getElementById('dispo-req-panel');
  if(reqPanel){
    const myEq2=getEquipeOfUser(CU.l);
    const pendingReqs=(DISPO_REQUESTS[wk]||[]).filter(function(r){
      if(r.statut!=='en-attente')return false;
      if(isAdmin||isSuperAdmin())return true;
      return myEq2&&myEq2.membres.includes(r.login);
    });
    if(pendingReqs.length&&(isResp||isAdmin||isSuperAdmin())){
      reqPanel.innerHTML='<div style="background:#F5F3FF;border-radius:10px;padding:10px;margin-bottom:10px;border:2px solid #DDD6FE;">'
        +'<div style="font-size:13px;font-weight:700;color:#7C3AED;margin-bottom:8px;">&#x270F; Demandes de modification ('+pendingReqs.length+')</div>'
        +pendingReqs.map(function(r){
          const u=USERS.find(function(x){return x.l===r.login;});
          return '<div style="background:#fff;border-radius:8px;padding:8px 10px;margin-bottom:6px;border:1px solid #DDD6FE;">'
            +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
            +'<span style="font-size:12px;font-weight:600;">'+(u?fullName(u):r.login)+'</span>'
            +'<span style="font-size:10px;color:var(--t2);">'+r.dateDemande+' \u00e0 '+r.hDemande+'</span></div>'
            +(r.motif?'<div style="font-size:11px;color:var(--t2);margin-bottom:6px;font-style:italic;">'+r.motif+'</div>':'')
            +(r.slotsDetail&&r.slotsDetail.length?'<div style="margin-bottom:6px;">'
              +r.slotsDetail.map(function(d){
                return '<div style="font-size:11px;margin-bottom:2px;"><span style="font-weight:600;color:var(--t);">'+d.jour+'</span> : <span style="color:#7C3AED;">'+d.heures+'</span></div>';
              }).join('')+'</div>':'')
            +'<div style="display:flex;gap:6px;">'
            +'<button class="btn sm" style="background:#3B6D11;color:#fff;" onclick="repondreDispoRequest(\''+wk+'\',\''+r.id+'\',\'accepte\')">&#x2705; Accepter</button>'
            +'<button class="btn sm" style="color:#E24B4A;" onclick="repondreDispoRequest(\''+wk+'\',\''+r.id+'\',\'refuse\')">&#x274C; Refuser</button>'
            +'</div></div>';
        }).join('')+'</div>';
    } else {
      reqPanel.innerHTML='';
    }
  }

  // Déterminer quels agents afficher selon le sous-mode
  let loginsList=[];
  if(dispoSubMode==='mes'){
    loginsList=[CU.l];
  } else if(dispoSubMode==='equipe'){
    loginsList=myEq?myEq.membres.filter(l=>l!==CU.l):[];
  } else if(dispoSubMode==='autres'){
    // Rendu direct avec séparateurs : sans équipe puis autres équipes
    const myEqId=myEq?myEq.id:null;
    const autresEqs=EQUIPES.filter(e=>e.id!==myEqId);
    const sansEqLogins=sortByGradeThenName(USERS.filter(u=>!EQUIPES.some(e=>e.membres.includes(u.l))&&u.l!==CU.l)).map(u=>u.l);

    let html='';
    if(sansEqLogins.length){
      html+='<div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin:4px 0 8px;padding:4px 8px;background:#f5f5f5;border-radius:6px;">Sans \u00e9quipe ('+sansEqLogins.length+')</div>';
      sansEqLogins.forEach(function(login){html+=renderDispoAgentBlock(login,wk,isResp,isAdmin,pastDeadline,astrDispoWeek,myEq);});
    }
    autresEqs.forEach(function(eq){
      const membres=sortByGradeThenName(eq.membres.map(l=>USERS.find(u=>u.l===l)).filter(Boolean));
      if(!membres.length)return;
      html+='<div style="font-size:11px;font-weight:700;color:'+eq.color+';text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px;padding:4px 8px;border-left:3px solid '+eq.color+';background:'+eq.color+'18;border-radius:0 6px 6px 0;">'+eq.nom+' ('+membres.length+')</div>';
      membres.forEach(function(u){html+=renderDispoAgentBlock(u.l,wk,isResp,isAdmin,pastDeadline,astrDispoWeek,myEq);});
    });
    if(!html)html='<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucun agent \u00e0 afficher.</div>';
    document.getElementById('astr-dispo-grid').innerHTML=html;
    // Boutons actions — toujours afficher Enregistrer en mode autres
    const btnDiv=document.getElementById('dispo-action-btns');
    if(btnDiv){
      btnDiv.style.display='flex';
      const btnSave=btnDiv.querySelector('button[onclick="saveDispo()"]');
      if(btnSave)btnSave.disabled=false;
      // Masquer les commandes globales qui n'ont pas de sens en mode autres
      btnDiv.querySelectorAll('button[onclick^="setAllDispo"],button[onclick="clearDispo()"]').forEach(b=>b.style.display='none');
    }
    const validBannerEl=document.getElementById('dispo-valid-banner');
    if(validBannerEl)validBannerEl.style.display='none';
    return;
  }

  // Modes mes / equipe
  const loginsKnown=loginsList.filter(l=>USERS.find(u=>u.l===l));
  const loginsUnknown=loginsList.filter(l=>!USERS.find(u=>u.l===l));
  const loginsListFinal=[...loginsUnknown,...sortByGradeThenName(loginsKnown.map(l=>USERS.find(u=>u.l===l))).map(u=>u.l)];
  let html='';
  loginsListFinal.forEach(function(login){
    html+=renderDispoAgentBlock(login,wk,isResp,isAdmin,pastDeadline,astrDispoWeek,myEq);
  });

  if(!loginsList.length) html='<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucun agent à afficher.</div>';
  document.getElementById('astr-dispo-grid').innerHTML=html;

  // Boutons actions (uniquement pour ses propres dispos)
  const btnDiv=document.getElementById('dispo-action-btns');
  // Bannière de validation pour resp équipe forte
  const validBannerEl=document.getElementById('dispo-valid-banner');
  if(validBannerEl){
    const wkD=weekKey(getMondayOfWeek(astrDispoWeek));
    const dlPassedD=TODAY>getDeadlineDate(astrDispoWeek);
    const canValidD=isRespEqForte(wkD)||hasRight('Administration');
    const validatedD=isDispoValidated(wkD);
    if(canValidD&&dlPassedD){
      if(validatedD){
        validBannerEl.style.display='block';
        validBannerEl.innerHTML=`<div style="background:#EAF3DE;border-radius:10px;padding:10px 14px;font-size:12px;color:#3B6D11;display:flex;align-items:center;gap:10px;">&#x2705; Disponibilités validées pour cette semaine.</div>`;
      } else {
        validBannerEl.style.display='block';
        validBannerEl.innerHTML=`<div style="background:#FAEEDA;border-radius:10px;padding:10px 14px;font-size:12px;color:#854F0B;display:flex;align-items:center;gap:10px;">&#x23F3; Deadline passée — la validation se fait dans le Planning.</div>`;
      }
    } else {
      validBannerEl.style.display='none';
    }
  }
  if(btnDiv){
    const canEdit=dispoSubMode==='mes'||(isAdmin||isResp||isSuperAdmin());
    btnDiv.style.display=canEdit?'flex':'none';
    const btnSave=btnDiv.querySelector('button[onclick="saveDispo()"]');
    const btnsAll=btnDiv.querySelectorAll('button[onclick^="setAllDispo"],button[onclick="clearDispo()"]');
    const locked=pastDeadline&&!isAdmin&&!isResp;
    if(btnSave)btnSave.disabled=locked;
    // Réafficher les commandes globales en mode mes/equipe
    btnsAll.forEach(b=>{b.style.display='';b.disabled=locked;});
  }
}

function toggleDispoCell(wk,login,d,s,el,eqColor){
  // Ignore le click synthétique généré juste après un geste tactile (évite le double-toggle)
  if(_dispoTouchHandled && (Date.now()-_dispoTouchHandled)<600){return;}
  _jbEditLock=Date.now();
  if(!DISPOS[wk])DISPOS[wk]={};
  if(!DISPOS[wk][login])DISPOS[wk][login]={};
  const key=`${d}_${s}`;
  const cur=DISPOS[wk][login][key];
  const next=cur===true?false:true;
  DISPOS[wk][login][key]=next;
  el.style.background=next?'#22C55E':'#EF4444';
  el.dataset.val=String(next);
}
// ── Appui simple et glisser pour la saisie des disponibilités ──
let _dragActive=false,_dragTargetVal=true,_dispoTouchHandled=0;
let _dispoGestureCell=null,_dispoGestureX=0,_dispoGestureY=0,_dispoGestureMoved=false;
function startDispoDrag(el){
  _jbEditLock=Date.now();
  _dragActive=true;
  // Gris (jamais renseigné) devient vert ; ensuite alternance vert ↔ rouge.
  const cur=el.dataset.val==='true'?true:el.dataset.val==='false'?false:null;
  _dragTargetVal=cur===true?false:true;
  applyDispoDrag(el);
}
function continueDispoDrag(el){
  if(!_dragActive)return;
  applyDispoDrag(el);
}
function applyDispoDrag(el){
  const wk=el.dataset.wk,login=el.dataset.login,d=parseInt(el.dataset.d),s=parseInt(el.dataset.s);
  if(!DISPOS[wk])DISPOS[wk]={};
  if(!DISPOS[wk][login])DISPOS[wk][login]={};
  const key=`${d}_${s}`;
  DISPOS[wk][login][key]=_dragTargetVal;
  const bg=_dragTargetVal===true?'#22C55E':'#EF4444';
  el.style.background=bg;
  el.dataset.val=String(_dragTargetVal);
}

// ── Support tactile du glisser pour les disponibilités (iPhone + Android) ──
function _dispoCellAtPoint(x,y){
  const el=document.elementFromPoint(x,y);
  const cell=el&&el.closest?el.closest('.dispo-cell'):null;
  if(cell&&cell.dataset&&cell.dataset.wk&&cell.dataset.login&&cell.dataset.d!==undefined&&cell.dataset.s!==undefined)return cell;
  return null;
}
function _beginDispoGesture(cell,x,y){
  _dispoGestureCell=cell;
  _dispoGestureX=x;
  _dispoGestureY=y;
  _dispoGestureMoved=false;
  _dragActive=false;
  _dispoTouchHandled=Date.now();
}
function _moveDispoGesture(x,y){
  if(!_dispoGestureCell)return;
  if(!_dispoGestureMoved&&Math.hypot(x-_dispoGestureX,y-_dispoGestureY)>=7){
    _dispoGestureMoved=true;
    startDispoDrag(_dispoGestureCell);
  }
  if(_dispoGestureMoved){
    const cell=_dispoCellAtPoint(x,y);
    if(cell)continueDispoDrag(cell);
  }
}
function _finishDispoGesture(cancelled){
  // Un appui sans déplacement modifie exactement le créneau touché.
  if(_dispoGestureCell&&!_dispoGestureMoved&&!cancelled)startDispoDrag(_dispoGestureCell);
  _dragActive=false;
  _dispoTouchHandled=Date.now();
  _dispoGestureCell=null;
  _dispoGestureMoved=false;
}

// Pointer Events : comportement commun aux versions récentes de Safari,
// Chrome Android, Samsung Internet, Firefox Android et aux ordinateurs.
if(window.PointerEvent){
  document.addEventListener('pointerdown',function(e){
    const cell=e.target&&e.target.closest?e.target.closest('.dispo-cell'):null;
    if(!cell)return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();
    try{cell.setPointerCapture(e.pointerId);}catch(err){}
    _beginDispoGesture(cell,e.clientX,e.clientY);
  },{passive:false});
  document.addEventListener('pointermove',function(e){
    if(!_dispoGestureCell)return;
    e.preventDefault();
    _moveDispoGesture(e.clientX,e.clientY);
  },{passive:false});
  document.addEventListener('pointerup',function(){_finishDispoGesture(false);},{passive:true});
  document.addEventListener('pointercancel',function(){_finishDispoGesture(true);},{passive:true});
}else{
  // Repli pour les anciens appareils ne prenant pas en charge Pointer Events.
  document.addEventListener('touchstart',function(e){
    const t=e.touches[0];if(!t)return;
    const cell=_dispoCellAtPoint(t.clientX,t.clientY);
    if(!cell)return;
    e.preventDefault();
    _beginDispoGesture(cell,t.clientX,t.clientY);
  },{passive:false});
  document.addEventListener('touchmove',function(e){
    if(!_dispoGestureCell)return;
    const t=e.touches[0];if(!t)return;
    e.preventDefault();
    _moveDispoGesture(t.clientX,t.clientY);
  },{passive:false});
  document.addEventListener('touchend',function(){_finishDispoGesture(false);},{passive:true});
  document.addEventListener('touchcancel',function(){_finishDispoGesture(true);},{passive:true});
}
function setAllDispoFor(wk,login,val,eqColor,allowClear){
  _jbEditLock=Date.now();
  if(val!==true&&val!==false&&!(val===null&&allowClear===true)){showToast('Choisissez disponible ou indisponible.','warn');return;}
  // Vérifier les droits avant toute modification
  const isResp=isRespEquipe();
  const isAdmin=hasRight('Administration');
  const isSA=isSuperAdmin();
  const isMe=login===CU.l;
  const weekOffset=getWeekOffset(wk);
  const isPast=weekOffset<0;
  const isCurrent=weekOffset===0;
  const isValidated=isDispoValidated(wk);
  const isUnlocked=DISPOS_UNLOCKED[wk]===true;
  const isAgentUnlocked=isMe&&(DISPOS_UNLOCKED[wk+'_agents']||[]).includes(login);
  const canEdit=isValidated
    ?(isSA&&isUnlocked)||isAgentUnlocked
    :isPast
      ?(isSA&&isUnlocked)||isAgentUnlocked
      :isCurrent
        ?(isResp||isAdmin||isSA)
        :(isMe||(isResp||isAdmin||isSA));
  if(!canEdit){showToast('Modification non autoris\u00e9e pour cette semaine.','warn');return;}
  if(!DISPOS[wk])DISPOS[wk]={};
  if(!DISPOS[wk][login])DISPOS[wk][login]={};
  const eq=getEquipeOfUser(login);
  const gran=eq?eq.granularity:ASTR_CONFIG.granularity;
  const slots=getSlotsPerDay(gran);
  for(let d=0;d<7;d++)for(let s=0;s<slots;s++){
    if(val===null)delete DISPOS[wk][login][`${d}_${s}`];
    else DISPOS[wk][login][`${d}_${s}`]=val;
  }
  saveData();rAstrDispo();
}
function clearAllDispoFor(wk,login,eqColor){
  confirmModal('Tout effacer et remettre tous les créneaux en gris ?',function(){
    setAllDispoFor(wk,login,null,eqColor,true);
  });
}
function clearDispo(){
  const mon=getMondayOfWeek(astrDispoWeek);
  const wk=weekKey(mon);
  const eq=getEquipeOfUser(CU.l);
  clearAllDispoFor(wk,CU.l,eq?eq.color:'#888');
}
function saveDispo(){
  // Marquer l'édition AVANT le push pour protéger les dispos locales pendant la propagation
  _jbEditLock=Date.now();
  saveData(true); // push immédiat : les disponibilités sont critiques
  const msg=document.getElementById('astr-dispo-msg');
  if(msg){msg.style.display='block';msg.style.color='var(--grn)';msg.textContent='✅ Disponibilités enregistrées !';setTimeout(()=>msg.style.display='none',3000);}
}
function setAllDispo(val){
  const mon=getMondayOfWeek(astrDispoWeek);
  const wk=weekKey(mon);
  const eq=getEquipeOfUser(CU.l);
  setAllDispoFor(wk,CU.l,val,eq?eq.color:'#22C55E');
}

// ══════════════════════════════════════════════════════
// PIQUETS — responsable / admin
// ══════════════════════════════════════════════════════
function astrPiquetWeekNav(dir){astrPiquetWeek+=dir;rAstrPiquets();}

// Vérifie si un agent a déjà un piquet sur le même créneau (même jour, horaires qui se chevauchent)
function timeToMin(t){const[h,m]=t.split(':').map(Number);return h*60+m;}
function piquetToAbsRange(jour,debut,fin){
  // Convertit un piquet en plage absolue en minutes depuis lundi 00h00
  const jourIdx=JOURS_FULL.indexOf(jour); // 0=Lundi..6=Dimanche
  const startMin=jourIdx*1440+timeToMin(debut);
  const finMin=timeToMin(fin);
  // Si fin <= debut, le créneau passe minuit : +1440
  const endMin=jourIdx*1440+(fin<=debut?finMin+1440:finMin);
  return [startMin,endMin];
}
function hasConflitPiquet(wk,login,jour,debut,fin,excludeIdx){
  const startH=(ASTR_CONFIG.weekStartHour??8)*60;
  // Si debut < startHour, le créneau appartient au jour suivant dans le planning
  const jourIdx=JOURS_FULL.indexOf(jour);
  const debutMin=timeToMin(debut);
  const effectiveJourIdx=debutMin<startH?jourIdx+1:jourIdx;
  const [ns,ne]=piquetToAbsRangeIdx(effectiveJourIdx,debut,fin);

  return (PIQUETS[wk]||[]).some(function(p,i){
    if(i===excludeIdx)return false;
    const membres=p.membres&&p.membres.length?p.membres:[
      p.chefAgres?{login:p.chefAgres,hDebut:p.debut,hFin:p.fin}:null,
      p.conducteur?{login:p.conducteur,hDebut:p.debut,hFin:p.fin}:null,
      p.chefEquipe?{login:p.chefEquipe,hDebut:p.debut,hFin:p.fin}:null,
      p.stagiaire?{login:p.stagiaire,hDebut:p.debut,hFin:p.fin}:null,
    ].filter(Boolean);
    const pJourIdx=JOURS_FULL.indexOf(p.jour);
    if(pJourIdx<0)return false;
    return membres.some(function(m){
      if(m.login!==login)return false;
      const mDeb=timeToMin(m.hDebut||p.debut);
      const effectivePJourIdx=mDeb<startH?pJourIdx+1:pJourIdx;
      const [ps,pe]=piquetToAbsRangeIdx(effectivePJourIdx,m.hDebut||p.debut,m.hFin||p.fin);
      return ns<pe&&ps<ne;
    });
  });
}

function piquetToAbsRangeIdx(jourIdx,debut,fin){
  const d=timeToMin(debut),f=timeToMin(fin);
  const s=jourIdx*1440+d;
  const e=f<=d?jourIdx*1440+f+1440:jourIdx*1440+f;
  return [s,e];
}

function rAstrPiquets(){
  const mon=getMondayOfWeek(astrPiquetWeek);
  const wk=weekKey(mon);
  document.getElementById('astr-piquet-week-label').textContent=weekLabel(mon);
  if(!PIQUETS[wk])PIQUETS[wk]=[];

  const _pv=PLANNING_ROTATIONS[wk];
  const planSlots=!_pv?[]:(typeof _pv==='string'?[_pv]:(Array.isArray(_pv)?_pv:[]));
  const eq1=planSlots[0]?getEquipeById(planSlots[0]):null;
  const eq2=planSlots[1]?getEquipeById(planSlots[1]):null;
  const badge1=eq1?'<span class="eq-badge" style="background:'+eq1.color+';font-size:11px;">'+eq1.nom+'</span>':'<span style="color:var(--t2);font-size:11px;">&mdash;</span>';
  const badge2=eq2?'<span class="eq-badge" style="background:'+eq2.color+';font-size:11px;">'+eq2.nom+'</span>':'<span style="color:var(--t2);font-size:11px;">&mdash;</span>';

  const isAdmin=hasRight('Administration');
  const isPastPiquet=astrPiquetWeek<0;
  const dlp=ASTR_CONFIG.deadlinePiquet||{dayOfWeek:0,hour:18,minute:0};
  // Deadline = dimanche (ou jour configuré) de la SEMAINE PRÉCÉDENTE
  // Ex: semaine du 25-31 mai → deadline = dimanche 24 mai
  const dlpMonday=getMondayOfWeek(astrPiquetWeek);
  const dlpDate=new Date(dlpMonday);
  // Reculer au dimanche précédent = lundi - 1 jour
  dlpDate.setDate(dlpDate.getDate()-1);
  // Si le jour configuré n'est pas dimanche, ajuster
  const dlpJsDay=dlp.dayOfWeek; // 0=dim, 1=lun...
  const daysBack = (dlpDate.getDay()-dlpJsDay+7)%7;
  dlpDate.setDate(dlpDate.getDate()-daysBack);
  dlpDate.setHours(dlp.hour,dlp.minute,59,0);
  const pastDeadlinePiquet=astrPiquetWeek===0&&TODAY>dlpDate;
  const JOURS_DL=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const isResp=isRespEquipe();
  // Peut modifier : admin ou resp/membre équipe, semaine courante ou future seulement
  const piquetsValidated = PIQUETS_VALIDATED[wk]===true;
  // Après validation : lecture seule pour chefs d'équipe (admin peut toujours modifier)
  const canAdd = !isPastPiquet && (isAdmin || (isResp && !piquetsValidated));
  const canAction = !isPastPiquet && (isAdmin || (isResp && !piquetsValidated));
  ['validerPiquets','exportPiquets','clearPiquetsSemaine'].forEach(function(fn){
    const btns=document.querySelectorAll('[onclick="'+fn+'()"]');
    btns.forEach(function(b){b.style.display=canAction?'':'none';});
  });

  let html='<div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;padding:8px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--brd);">'
    +'<span style="font-size:12px;color:var(--t2);">&#x1F534; Astr. forte :</span> '+badge1
    +'<span style="font-size:12px;color:var(--t2);margin-left:6px;">&#x1F7E1; 2&egrave;me astreinte :</span> '+badge2
    +(piquetsValidated?'<span style="background:#22C55E;color:#fff;border-radius:10px;padding:2px 10px;font-size:11px;font-weight:600;">&#x2705; Validé</span>':'')
    +'</div>';
  if(piquetsValidated&&!isAdmin){
    html+='<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#166534;">&#x2705; Piquets et disponibilités validés pour cette semaine. Contactez un administrateur pour toute modification.</div>';
  }

  // Afficher avertissement si deadline piquet passee
  if(pastDeadlinePiquet&&!isAdmin){
    html+='<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#854F0B;">';
    const dlpLabel=JOURS_DL[dlp.dayOfWeek]+' '+pad(dlp.hour)+':'+pad(dlp.minute);
    html+='\u26A0\uFE0F D\u00e9lai de validation d\u00e9pass\u00e9 ('+dlpLabel+'). Contactez un administrateur pour toute modification.</div>';
  } else if(astrPiquetWeek===0&&!pastDeadlinePiquet&&isRespEquipe()&&!isAdmin){
    const dlpDateStr=dlpDate.getDate()+'/'+(dlpDate.getMonth()+1)+'/'+dlpDate.getFullYear();
    const dlpLabel=JOURS_DL[dlp.dayOfWeek]+' '+dlpDateStr+' \u00e0 '+pad(dlp.hour)+'h'+pad(dlp.minute);
    html+='<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:#1D4ED8;">\u23F0 D\u00e9lai de validation\u00a0: '+dlpLabel+'</div>';
  }
  html+='<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px;font-size:11px;color:var(--t2);">'
    +'<span><span style="display:inline-block;width:10px;height:10px;background:#B5D4F4;border-radius:2px;margin-right:4px;"></span>Matin 08:00&ndash;12:00</span>'
    +'<span><span style="display:inline-block;width:10px;height:10px;background:#C0DD97;border-radius:2px;margin-right:4px;"></span>Apr&egrave;s-midi 12:00&ndash;18:00</span>'
    +'<span><span style="display:inline-block;width:10px;height:10px;background:#CECBF6;border-radius:2px;margin-right:4px;"></span>Soir 18:00&ndash;00:00</span>'
    +'<span><span style="display:inline-block;width:10px;height:10px;background:#FAC775;border-radius:2px;margin-right:4px;"></span>Nuit 00:00&ndash;08:00</span>'
    +'</div>';

  function getTranche(p){
    const d=timeToMin(p.debut);
    if(d<8*60)return 'n';
    if(d<12*60)return 'm';
    if(d<18*60)return 'a';
    return 's';
  }

  JOURS_FULL.forEach(function(jour,di){
    const jourDate=new Date(mon);jourDate.setDate(jourDate.getDate()+di);
    const isToday=getDS(jourDate)===getDS(N());
    const MOIS_PIQUET=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const JOUR_BG=['#EEF2FF','#FFF7ED','#ECFDF5','#FFF1F2','#F0F9FF','#FFFBEB','#F5F3FF'];
    const JOUR_FG=['#4338CA','#C2410C','#065F46','#BE123C','#0369A1','#92400E','#6D28D9'];
    const dateFullStr=jourDate.getDate()+' '+MOIS_PIQUET[jourDate.getMonth()]+' '+jourDate.getFullYear();
    const bg=isToday?'#E6F1FB':JOUR_BG[di];
    const fg=isToday?'#185FA5':JOUR_FG[di];

    html+='<div style="margin-bottom:14px;border:1.5px solid var(--brd);border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">';
    html+='<div style="display:flex;align-items:center;gap:8px;padding:9px 14px;background:'+bg+';border-bottom:1.5px solid var(--brd);">'
      +'<span style="font-size:14px;font-weight:700;color:'+fg+';">'+jour+' '+dateFullStr+'</span>'
      +(isToday?'<span style="background:#185FA5;color:#fff;border-radius:10px;padding:1px 8px;font-size:10px;margin-left:4px;">Aujourd&rsquo;hui</span>':'')
      +'</div>';

    html+='<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'
      +'<colgroup>'
      +'<col style="width:80px"/>'
      +'<col style="width:calc((100% - 80px - 100px)/4)"/>'
      +'<col style="width:calc((100% - 80px - 100px)/4)"/>'
      +'<col style="width:calc((100% - 80px - 100px)/4)"/>'
      +'<col style="width:calc((100% - 80px - 100px)/4)"/>'
      +'<col style="width:100px"/>'
      +'</colgroup>'
      +'<thead><tr style="background:var(--bg);">'
      +'<th style="padding:5px 8px;font-size:10px;font-weight:500;color:var(--t2);border-right:0.5px solid var(--brd);border-bottom:0.5px solid var(--brd);text-align:center;">Engin</th>'
      +'<th style="padding:5px 8px;font-size:10px;font-weight:500;color:var(--t2);border-right:0.5px solid var(--brd);border-bottom:0.5px solid var(--brd);">Matin</th>'
      +'<th style="padding:5px 8px;font-size:10px;font-weight:500;color:var(--t2);border-right:0.5px solid var(--brd);border-bottom:0.5px solid var(--brd);">Apr&egrave;s-midi</th>'
      +'<th style="padding:5px 8px;font-size:10px;font-weight:500;color:var(--t2);border-right:0.5px solid var(--brd);border-bottom:0.5px solid var(--brd);">Soir</th>'
      +'<th style="padding:5px 8px;font-size:10px;font-weight:500;color:var(--t2);border-bottom:0.5px solid var(--brd);border-right:0.5px solid var(--brd);">Nuit</th>'
      +'<th style="padding:5px 8px;font-size:10px;border-bottom:0.5px solid var(--brd);text-align:right;"></th>'
      +'</tr></thead><tbody>';

    ASTR_CONFIG.engins.forEach(function(engin){
      const pJour=PIQUETS[wk].filter(function(p){return p.engin===engin&&p.jour===jour;});
      const tranches={m:[],a:[],s:[],n:[]};
      pJour.forEach(function(p){tranches[getTranche(p)].push(p);});

      function cellHtml(list,bg,fg){
        if(!list.length)return '<span style="font-size:11px;color:var(--t2);">&mdash;</span>';
        return list.map(function(p){
          const globalIdx=PIQUETS[wk].indexOf(p);
          // Migrer ancien format
          if(!p.membres){
            p.membres=[];
            if(p.chefAgres)p.membres.push({role:"Chef d'agr\u00e8s",login:p.chefAgres,hDebut:p.debut,hFin:p.fin});
            if(p.conducteur)p.membres.push({role:'Conducteur',login:p.conducteur,hDebut:p.debut,hFin:p.fin});
            if(p.chefEquipe)p.membres.push({role:"Chef d'\u00e9quipe",login:p.chefEquipe,hDebut:p.debut,hFin:p.fin});
            if(p.stagiaire)p.membres.push({role:'\u00c9quipier',login:p.stagiaire,hDebut:p.debut,hFin:p.fin});
          }
          // Grouper par rôle
          const roles=['Chef d\u2019agr\u00e8s','Conducteur','Chef d\u2019\u00e9quipe','\u00c9quipier'];
          const roleAbbr={'Chef d\u2019agr\u00e8s':'CA','Conducteur':'Cond.','Chef d\u2019\u00e9quipe':'CE','\u00c9quipier':'\u00c9q.'};
          let crew='';
          roles.forEach(function(role){
            const ms=(p.membres||[]).filter(function(m){return m.role===role;});
            if(!ms.length)return;
            crew+='<div style="font-size:9px;opacity:.7;margin-top:2px;">'+roleAbbr[role]+'</div>';
            ms.forEach(function(m){
              const u=USERS.find(function(x){return x.l===m.login;});
              const heures=(m.hDebut&&m.hFin&&(m.hDebut!==p.debut||m.hFin!==p.fin))
                ?'<span style="font-size:9px;opacity:.7;margin-left:3px;">'+m.hDebut+'&ndash;'+m.hFin+'</span>':'';
              const sol=getSollicitation(m.login);
              const solBadge='';
              crew+='<div style="font-weight:500;font-size:11px;">'+(u?fullName(u):m.login)+heures+solBadge+'</div>';
            });
          });
          const del=canAdd?'<button class="btn sm" style="font-size:10px;padding:1px 5px;color:#E24B4A;margin-top:2px;" onclick="delPiquet(\''+wk+'\','+globalIdx+')">&times;</button>':'';
          const edit=canAdd?'<button class="btn sm" style="font-size:10px;padding:1px 5px;margin-top:2px;margin-right:2px;" onclick="editPiquet(\''+wk+'\','+globalIdx+')">&#x270F;</button>':'';
          const dragAttrs=canAdd?' draggable="true" ondragstart="piquetDragStart(event,\''+wk+'\','+globalIdx+')" style="background:'+bg+';color:'+fg+';border-radius:5px;padding:4px 7px;margin-bottom:3px;cursor:grab;"':' style="background:'+bg+';color:'+fg+';border-radius:5px;padding:4px 7px;margin-bottom:3px;"';
          return '<div'+dragAttrs+'>'
            +'<div style="font-size:10px;font-weight:500;opacity:.8;margin-bottom:2px;">'+p.debut+'&ndash;'+p.fin+'</div>'
            +crew+'<div>'+edit+del+'</div></div>';
        }).join('');
      }

      const addBtn=canAdd?'<button class="btn pr sm" style="font-size:10px;padding:2px 7px;white-space:nowrap;" onclick="addPiquet(\''+wk+'\',\''+engin+'\',\''+jour+'\')">+ Cr&eacute;neau</button>':'';

      html+='<tr style="border-bottom:0.5px solid var(--brd);">'
        +'<td style="padding:6px 8px;font-size:11px;font-weight:500;text-align:center;background:var(--bg);border-right:0.5px solid var(--brd);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">&#x1F692; '+engin+'</td>'
        +'<td class="pq-drop-cell" data-wk="'+wk+'" data-jour="'+jour+'" data-tr="m" data-engin="'+engin+'" style="padding:6px 8px;border-right:0.5px solid var(--brd);">'+cellHtml(tranches.m,'#E6F1FB','#185FA5','m')+'</td>'
        +'<td class="pq-drop-cell" data-wk="'+wk+'" data-jour="'+jour+'" data-tr="a" data-engin="'+engin+'" style="padding:6px 8px;border-right:0.5px solid var(--brd);">'+cellHtml(tranches.a,'#EAF3DE','#3B6D11','a')+'</td>'
        +'<td class="pq-drop-cell" data-wk="'+wk+'" data-jour="'+jour+'" data-tr="s" data-engin="'+engin+'" style="padding:6px 8px;border-right:0.5px solid var(--brd);">'+cellHtml(tranches.s,'#EEEDFE','#534AB7','s')+'</td>'
        +'<td class="pq-drop-cell" data-wk="'+wk+'" data-jour="'+jour+'" data-tr="n" data-engin="'+engin+'" style="padding:6px 8px;border-right:0.5px solid var(--brd);">'+cellHtml(tranches.n,'#FAEEDA','#854F0B','n')+'</td>'
        +'<td style="padding:4px 6px;text-align:right;vertical-align:middle;white-space:nowrap;">'+addBtn+'</td>'
        +'</tr>';
    });

    html+='</tbody></table></div>';
  });

  // Synthese dispos - toutes les équipes
  const sansEqPiquet=USERS.filter(function(u){return !EQUIPES.some(function(e){return e.membres.includes(u.l);});});
  html+='<div style="font-size:12px;font-weight:600;margin-top:12px;margin-bottom:6px;">Disponibilit&eacute;s</div>';
  html+='<div style="background:var(--bg);border:1px solid var(--brd);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:10.5px;color:var(--t2);line-height:1.5;">'
    +'<div style="font-weight:600;color:var(--t1);margin-bottom:3px;">L&eacute;gende des indicateurs</div>'
    +'<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;flex-wrap:wrap;"><span style="display:inline-block;width:44px;height:8px;border-radius:3px;background:linear-gradient(to right,rgb(226,75,74),rgb(245,158,11),rgb(34,197,94));flex-shrink:0;"></span><b>Dispo</b>&nbsp;: part des heures o&ugrave; l\'agent s\'est d&eacute;clar&eacute; disponible dans la semaine <span style="color:var(--t2);">(rouge &le;&nbsp;25&nbsp;% &rarr; vert &ge;&nbsp;75&nbsp;%)</span>.</div>'
    +'<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;"><span style="display:inline-block;width:11px;height:8px;border-radius:3px;background:#378ADD;flex-shrink:0;"></span><b>R&eacute;partition</b>&nbsp;: part des heures de piquet de l\'agent sur le total des heures de piquet de la caserne (&eacute;quilibre entre agents).</div>'
    +'<div style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:11px;height:8px;border-radius:3px;background:#7F77DD;flex-shrink:0;"></span><b>Occupation</b>&nbsp;: part des heures de piquet de l\'agent sur les 168&nbsp;h de la semaine.</div>'
    +'</div>';
  const dispoPlanSlots=!PLANNING_ROTATIONS[wk]?[]:(typeof PLANNING_ROTATIONS[wk]==='string'?[PLANNING_ROTATIONS[wk]]:(Array.isArray(PLANNING_ROTATIONS[wk])?PLANNING_ROTATIONS[wk]:[]));
  sortEquipes(EQUIPES).forEach(function(eq){
    if(!eq.membres.length)return;
    const isEq1=dispoPlanSlots[0]===eq.id,isEq2=dispoPlanSlots[1]===eq.id;
    const labelSuffix=isEq1?' <span style="background:#E24B4A;color:#fff;border-radius:4px;padding:1px 5px;font-size:9px;">Astr. forte</span>':isEq2?' <span style="background:#F59E0B;color:#fff;border-radius:4px;padding:1px 5px;font-size:9px;">2&egrave;me astr.</span>':'';
    html+='<div class="panel" style="padding:8px;margin-bottom:6px;">'
      +'<div style="font-size:11px;font-weight:600;color:'+eq.color+';margin-bottom:6px;">'+eq.nom+labelSuffix+'</div>';
    sortByGradeThenName(eq.membres.map(function(l){return USERS.find(function(x){return x.l===l;});}).filter(Boolean)).forEach(function(u){
      const dispos=DISPOS[wk]?.[u.l]||{};
      const nb=Object.values(dispos).filter(function(v){return v===true;}).length;
      const total=getSlotsPerDay(eq.granularity)*7;
      const pct=total>0?Math.round(nb/total*100):0;
      const pctColor=pctDispoColor(pct); // échelle progressive : rouge ≤25%, vert ≥75%
      // Nombre de piquets affectés à cet agent cette semaine
      const piquetsSem=PIQUETS[wk]||[];
      const nbPiquet=piquetsSem.filter(function(p){
        const membres=p.membres&&p.membres.length?p.membres:[
          p.chefAgres?{login:p.chefAgres}:null,
          p.conducteur?{login:p.conducteur}:null,
          p.chefEquipe?{login:p.chefEquipe}:null,
          p.stagiaire?{login:p.stagiaire}:null,
        ].filter(Boolean);
        return membres.some(function(m){return m.login===u.l;});
      }).length;
      const sol=getSollicitation(u.l);
      html+='<div class="eq-member-row" style="display:block;">'
        +'<div style="font-weight:500;font-size:12px;">'+fullName(u)+'</div>'
        +_renderAgentBars(u.l,pct,pctColor)
        +'</div>';
    });
    html+='</div>';
  });
  if(sansEqPiquet.length){
    html+='<div class="panel" style="padding:8px;margin-bottom:6px;"><div style="font-size:11px;font-weight:600;color:#888;margin-bottom:6px;">Sans &eacute;quipe</div>';
    sortByGradeThenName(sansEqPiquet).forEach(function(u){
      const dispos=DISPOS[wk]?.[u.l]||{};
      const nb=Object.values(dispos).filter(function(v){return v===true;}).length;
      const total=getSlotsPerDay(ASTR_CONFIG.granularity)*7;
      const pct=total>0?Math.round(nb/total*100):0;
      const pctColor=pctDispoColor(pct); // échelle progressive : rouge ≤25%, vert ≥75%
      const nbPiquet=(PIQUETS[wk]||[]).filter(function(p){
        const membres=p.membres&&p.membres.length?p.membres:[
          p.chefAgres?{login:p.chefAgres}:null,
          p.conducteur?{login:p.conducteur}:null,
        ].filter(Boolean);
        return membres.some(function(m){return m.login===u.l;});
      }).length;
      const solSE=getSollicitation(u.l);
      html+='<div class="eq-member-row" style="display:block;">'
        +'<div style="font-weight:500;font-size:12px;">'+fullName(u)+'</div>'
        +_renderAgentBars(u.l,pct,pctColor)
        +'</div>';
    });
    html+='</div>';
  }

  // Journal des modifications (semaine en cours, visible admin/resp)
  if(astrPiquetWeek===0&&canAction){
    const log=PIQUETS._log&&PIQUETS._log[wk]?PIQUETS._log[wk]:[];
    if(log.length){
      html+='<details style="margin-top:12px;background:var(--bg);border-radius:10px;">'
        +'<summary style="padding:10px 12px;cursor:pointer;font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;justify-content:space-between;">'
        +'&#x1F4DD; Journal des modifications'
        +' <span style="font-size:10px;background:var(--brd);border-radius:10px;padding:1px 7px;font-weight:400;">'+log.length+'</span></summary>'
        +'<div style="padding:0 12px 10px;">';
      log.slice().reverse().forEach(function(e){
        html+='<div style="padding:6px 0;border-bottom:1px solid var(--brd);font-size:11px;">'
          +'<span style="font-weight:600;">'+e.auteur+'</span>'
          +' <span style="color:var(--t2);">'+e.date+'</span>'
          +' — <span style="text-transform:uppercase;font-size:10px;background:'+(e.action==='suppression'?'#FEE2E2':e.action==='ajout'?'#DCFCE7':'#FEF9C3')+';padding:1px 6px;border-radius:4px;">'+e.action+'</span>'
          +' <span>'+e.piquet+'</span>'
          +(e.membres&&e.membres!=='-'?'<br><span style="color:var(--t2);padding-left:8px;">Membres : '+e.membres+'</span>':'')
          +(e.details?'<br><span style="color:var(--t2);padding-left:8px;">'+e.details+'</span>':'')
          +'</div>';
      });
      html+='</div></details>';
    }
  }
  document.getElementById('astr-piquet-content').innerHTML=html;
}

// ── Drag & drop des piquets entre tranches et engins ──
let _piquetDragData=null;
function piquetDragStart(event,wk,globalIdx){
  _piquetDragData={wk,globalIdx};
  event.dataTransfer.effectAllowed='move';
}
document.addEventListener('dragover',function(e){
  const cell=e.target.closest('.pq-drop-cell');
  if(cell){e.preventDefault();cell.style.outline='2px dashed #C0392B';cell.style.background='rgba(192,57,43,.06)';}
});
document.addEventListener('dragleave',function(e){
  const cell=e.target.closest('.pq-drop-cell');
  if(cell&&!cell.contains(e.relatedTarget)){cell.style.outline='';cell.style.background='';}
});
document.addEventListener('drop',function(e){
  const cell=e.target.closest('.pq-drop-cell');
  if(cell){cell.style.outline='';cell.style.background='';}
  if(!cell||!_piquetDragData)return;
  e.preventDefault();
  const wk=cell.dataset.wk;
  const jour=cell.dataset.jour;
  const tranche=cell.dataset.tr;
  const newEngin=cell.dataset.engin;
  if(_piquetDragData.wk!==wk)return;
  const p=PIQUETS[wk][_piquetDragData.globalIdx];
  if(!p)return;
  // Changer de tranche applique les horaires de référence de cette période.
  const tranchesHoraires={m:['08:00','12:00'],a:['12:00','18:00'],s:['18:00','00:00'],n:['00:00','08:00']};
  const anciennesHeures=[p.debut,p.fin];
  const nouvellesHeures=tranchesHoraires[tranche];
  if(nouvellesHeures){
    p.debut=nouvellesHeures[0];p.fin=nouvellesHeures[1];
    (p.membres||[]).forEach(function(m){
      if(m.hDebut===anciennesHeures[0])m.hDebut=p.debut;
      if(m.hFin===anciennesHeures[1])m.hFin=p.fin;
    });
  }
  delete p._tranche;
  p.jour=jour;
  if(newEngin&&newEngin!==p.engin)p.engin=newEngin;
  _piquetDragData=null;
  saveData();rAstrPiquets();
});

// ── Édition d'un créneau existant par double-clic ──
function editPiquet(wk,globalIdx){
  const p=PIQUETS[wk]?.[globalIdx];if(!p)return;
  document.getElementById('mt').textContent='Modifier le cr\u00e9neau';
  document.getElementById('mi').textContent=p.engin+' \u2014 '+p.jour;
  document.getElementById('mb').innerHTML=pqBuildForm(wk,p.engin,p.jour,p)
    +'<div id="pq-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>'
    +'<div class="brow">'
    +'<button class="btn pr sm" onclick="confirmEditPiquet(\'' + wk + '\',' + globalIdx + ')">&#x2714; Enregistrer</button>'
    +'<button class="btn sm danger" onclick="delPiquet(\'' + wk + '\',' + globalIdx + ')">&#x1F5D1; Supprimer</button>'
    +'<button class="btn sm" onclick="cM()">Annuler</button></div>';
  document.getElementById('mo').style.display='flex';
  setTimeout(function(){
    pqPrefillSelects(p);
    pqFinHint(document.getElementById('pq-fin'));
    const d=document.getElementById('pq-debut'),f=document.getElementById('pq-fin');
    if(d)d.dataset.prev=d.value;if(f)f.dataset.prev=f.value;
    pqRefreshDispos();
  },50);
}

function confirmEditPiquet(wk,globalIdx){
  const p=PIQUETS[wk]?.[globalIdx];if(!p)return;
  const enginEl=document.getElementById('pq-engin');
  const jour=document.getElementById('pq-jour').value;
  const debut=document.getElementById('pq-debut').value;
  const fin=document.getElementById('pq-fin').value;
  const note=document.getElementById('pq-note')?.value.trim()||'';
  const membres=pqGetMembres(wk);
  const err=document.getElementById('pq-err');err.style.display='none';
  const conflits=[];
  membres.forEach(function(m){
    if(hasConflitPiquet(wk,m.login,jour,m.hDebut||debut,m.hFin||fin,globalIdx)){
      const u=USERS.find(function(x){return x.l===m.login;});
      conflits.push((u?u.prenom+' '+u.nom:m.login)+' ('+m.role+')');
    }
  });
  if(conflits.length){err.style.display='block';err.textContent='&#x26A0; Conflit : '+conflits.join(', ');return;}
  if(enginEl)p.engin=enginEl.value;
  p.jour=jour;p.debut=debut;p.fin=fin;p.note=note;p.membres=membres;
  // Rétrocompatibilité
  const _nr=function(s){return (s||'').toLowerCase().replace(/[èéê]/g,'e').replace(/[^a-z]/g,'');};
  const ca=membres.find(function(m){return _nr(m.role)===_nr("Chef d'agrès");});
  const co=membres.find(function(m){return _nr(m.role)===_nr('Conducteur');});
  const ceq=membres.find(function(m){return _nr(m.role)===_nr("Chef d'équipe");});
  const eq=membres.find(function(m){return _nr(m.role)===_nr('Équipier');});
  p.chefAgres=ca?ca.login:'';p.conducteur=co?co.login:'';
  p.chefEquipe=ceq?ceq.login:'';p.stagiaire=eq?eq.login:'';
  delete p._tranche;
  if(astrPiquetWeek===0) logPiquetChange(wk,'modification',p);
  saveData();cM();rAstrPiquets();
}



function logPiquetChange(wk, action, piquet, details) {
  if(!PIQUETS._log) PIQUETS._log = {};
  if(!PIQUETS._log[wk]) PIQUETS._log[wk] = [];
  const membres = (piquet.membres||[]).map(function(m){
    const u = USERS.find(function(x){return x.l===m.login;});
    return (u ? u.nom+' '+u.prenom : m.login) + ' ('+m.role+')';
  }).join(', ');
  PIQUETS._log[wk].push({
    date: new Date().toLocaleString('fr-FR'),
    auteur: CU ? CU.nom+' '+CU.prenom : '?',
    action: action,
    piquet: piquet.engin+' '+piquet.jour+' '+piquet.debut+'-'+piquet.fin,
    membres: membres||'-',
    details: details||''
  });
  if(CD()) CD().piquets = PIQUETS;
}

function delPiquet(wk,globalIdx){
  if(astrPiquetWeek<0){showToast('Semaine passée — lecture seule','warn');return;}
  const p=PIQUETS[wk][globalIdx];
  confirmModal('Supprimer ce créneau ?',function(){
    logPiquetChange(wk,'suppression',p);
    PIQUETS[wk].splice(globalIdx,1);
    saveData();rAstrPiquets();
  });
}
function clearPiquetsSemaine(){
  const mon=getMondayOfWeek(astrPiquetWeek);
  const wk=weekKey(mon);
  confirmModal('Supprimer tous les créneaux de la semaine '+weekLabel(mon)+' ?',function(){
    PIQUETS[wk]=[];
    if(CD())CD().piquets=PIQUETS;
    saveData();rAstrPiquets();
    showToast('Tous les créneaux supprimés','success');
  });
}
function validerPiquets(){
  if(astrPiquetWeek<0){showToast('Impossible de modifier une semaine passée','warn');return;}
  const mon=getMondayOfWeek(astrPiquetWeek);
  const wk=weekKey(mon);
  confirmModal(
    'Valider les piquets ET les disponibilités de la semaine '+weekLabel(mon)+'. Après validation, les chefs d\'équipe ne pourront plus modifier.',
    function(){
      // Valider piquets
      PIQUETS_VALIDATED[wk]=true;
      if(CD())CD().piquetsValidated=PIQUETS_VALIDATED;
      // Valider dispos en même temps
      DISPOS_VALIDATED[wk]=true;
      if(CD())CD().disposValidated=DISPOS_VALIDATED;
      saveData();
      showToast('Piquets et disponibilités validés ✔','success');
      rAstrPiquets();
    }
  );
}

function exportPiquets(){
  const mon=getMondayOfWeek(astrPiquetWeek);
  const wk=weekKey(mon);
  const piquetsSem=PIQUETS[wk]||[];
  const MOIS_FR=['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];

  function getTranche(p){
    const d=timeToMin(p.debut);
    if(d<8*60)return 'nuit';
    if(d<12*60)return 'matin';
    if(d<18*60)return 'am';
    return 'soir';
  }

  function getMembresExport(p){
    return p.membres&&p.membres.length?p.membres:[
      p.chefAgres?{role:'CA',login:p.chefAgres,hDebut:p.debut,hFin:p.fin}:null,
      p.conducteur?{role:'Cond.',login:p.conducteur,hDebut:p.debut,hFin:p.fin}:null,
      p.chefEquipe?{role:'CE',login:p.chefEquipe,hDebut:p.debut,hFin:p.fin}:null,
      p.stagiaire?{role:'\u00c9q.',login:p.stagiaire,hDebut:p.debut,hFin:p.fin}:null,
    ].filter(Boolean);
  }

  function membresNoms(p){
    const membres=getMembresExport(p);
    return membres.map(function(m){
      const u=USERS.find(function(x){return x.l===m.login;});
      const role=m.role?m.role+' : ':'';
      const hInfo=(m.hDebut&&m.hFin&&(m.hDebut!==p.debut||m.hFin!==p.fin))?' ('+m.hDebut+'-'+m.hFin+')':'';
      if(!u)return role+(m.login||'')+hInfo;
      return role+u.nom+' '+u.prenom.charAt(0)+'.'+hInfo;
    }).join('\n');
  }

  function trancheData(pJour,tranche){
    const list=pJour.filter(function(p){return getTranche(p)===tranche;});
    if(!list.length)return['',''];
    const noms=list.map(function(p,i){
      const prefix=list.length>1?'Cr\u00e9neau '+(i+1)+'\n':'';
      const membres=membresNoms(p)||'Aucun agent affect\u00e9';
      return prefix+membres+(p.note?'\nNote : '+p.note:'');
    }).join('\n\n');
    const horaires=list.map(function(p,i){
      return (list.length>1?'#'+(i+1)+' ':'')+p.debut+'-'+p.fin;
    }).join('\n');
    return[noms,horaires];
  }

  function doExport(){
    const XLSX=window.XLSX;
    const wb=XLSX.utils.book_new();
    const engins=ASTR_CONFIG.engins||[];

    // Feuille r\u00e9cap semaine (1 tableau par jour, tous les engins)
    const recapData=[];
    recapData.push(['Fiche des piquets \u00e0 la semaine - '+weekLabel(mon),'','','','','','','','']);
    recapData.push(['Engin','Matin','Cr\u00e9neau','Apr\u00e8s-midi','Cr\u00e9neau','Soir','Cr\u00e9neau','Nuit','Cr\u00e9neau']);

    JOURS_FULL.forEach(function(jour,di){
      const jourDate=new Date(mon);jourDate.setDate(jourDate.getDate()+di);
      const dateStr=jour+' '+jourDate.getDate()+' '+MOIS_FR[jourDate.getMonth()]+' '+jourDate.getFullYear();
      recapData.push([dateStr,'','','','','','','','']);
      engins.forEach(function(engin){
        const pJour=piquetsSem.filter(function(p){return p.engin===engin&&p.jour===jour;});
        const [mN,mC]=trancheData(pJour,'matin');
        const [aN,aC]=trancheData(pJour,'am');
        const [sN,sC]=trancheData(pJour,'soir');
        const [nN,nC]=trancheData(pJour,'nuit');
        recapData.push([engin,mN,mC,aN,aC,sN,sC,nN,nC]);
      });
      recapData.push(['','','','','','','','','']);
    });

    const wsRecap=XLSX.utils.aoa_to_sheet(recapData);
    wsRecap['!cols']=[{wch:14},{wch:25},{wch:12},{wch:25},{wch:12},{wch:25},{wch:12},{wch:25},{wch:12}];
    // Wrapping pour les cellules multi-agents
    for(const key in wsRecap){
      if(key[0]==='!')continue;
      if(!wsRecap[key].s)wsRecap[key].s={};
      wsRecap[key].s.alignment={wrapText:true,vertical:'top'};
    }
    XLSX.utils.book_append_sheet(wb,wsRecap,'Semaine');

    // Données exhaustives : une ligne par agent affecté, sans perdre les
    // créneaux multiples, les rôles, les horaires individuels ni les notes.
    const detailData=[[
      'Caserne','Semaine','Date','Jour','Engin','P\u00e9riode',
      'D\u00e9but piquet','Fin piquet','R\u00f4le','Identifiant',
      'Agent','D\u00e9but agent','Fin agent','Note'
    ]];
    const trancheLabels={matin:'Matin',am:'Apr\u00e8s-midi',soir:'Soir',nuit:'Nuit'};
    const caserneNom=(CC()&&CC().nom)||CURRENT_CASERNE_ID||'';
    JOURS_FULL.forEach(function(jour,di){
      const jourDate=new Date(mon);jourDate.setDate(jourDate.getDate()+di);
      const dateIso=jourDate.getFullYear()+'-'+pad(jourDate.getMonth()+1)+'-'+pad(jourDate.getDate());
      piquetsSem.filter(function(p){return p.jour===jour;}).forEach(function(p){
        const membres=getMembresExport(p);
        const base=[
          caserneNom,wk,dateIso,jour,p.engin||'',trancheLabels[getTranche(p)]||'',
          p.debut||'',p.fin||''
        ];
        if(!membres.length){
          detailData.push(base.concat(['','','','','',p.note||'']));
          return;
        }
        membres.forEach(function(m){
          const u=USERS.find(function(x){return x.l===m.login;});
          detailData.push(base.concat([
            m.role||'',m.login||'',u?fullName(u):m.login||'',
            m.hDebut||p.debut||'',m.hFin||p.fin||'',p.note||''
          ]));
        });
      });
    });
    const wsDetail=XLSX.utils.aoa_to_sheet(detailData);
    wsDetail['!cols']=[
      {wch:24},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:12},
      {wch:12},{wch:22},{wch:22},{wch:28},{wch:12},{wch:12},{wch:35}
    ];
    for(const key in wsDetail){
      if(key[0]==='!')continue;
      if(!wsDetail[key].s)wsDetail[key].s={};
      wsDetail[key].s.alignment={wrapText:true,vertical:'top'};
    }
    XLSX.utils.book_append_sheet(wb,wsDetail,'Donn\u00e9es compl\u00e8tes');

    // Un onglet par jour
    JOURS_FULL.forEach(function(jour,di){
      const jourDate=new Date(mon);jourDate.setDate(jourDate.getDate()+di);
      const dateStr=jour+' '+jourDate.getDate()+'/'+pad(jourDate.getMonth()+1);
      const wsData=[];
      wsData.push([dateStr,'','','','','','','','']);
      wsData.push(['Engin','Matin','Cr\u00e9neau','Apr\u00e8s-midi','Cr\u00e9neau','Soir','Cr\u00e9neau','Nuit','Cr\u00e9neau']);
      engins.forEach(function(engin){
        const pJour=piquetsSem.filter(function(p){return p.engin===engin&&p.jour===jour;});
        const [mN,mC]=trancheData(pJour,'matin');
        const [aN,aC]=trancheData(pJour,'am');
        const [sN,sC]=trancheData(pJour,'soir');
        const [nN,nC]=trancheData(pJour,'nuit');
        wsData.push([engin,mN,mC,aN,aC,sN,sC,nN,nC]);
      });
      const ws=XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols']=[{wch:14},{wch:25},{wch:12},{wch:25},{wch:12},{wch:25},{wch:12},{wch:25},{wch:12}];
      XLSX.utils.book_append_sheet(wb,ws,jour.slice(0,3)+'.');
    });

    const fileName='Piquets_'+wk+'.xlsx';
    XLSX.writeFile(wb,fileName);
    showToast('Export t\u00e9l\u00e9charg\u00e9 : '+fileName,'success');
  }

  if(window.XLSX){doExport();}
  else{
    showToast('Chargement de SheetJS...','info');
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=doExport;
    s.onerror=function(){showToast('Impossible de charger SheetJS. V\u00e9rifiez votre connexion.','error');};
    document.head.appendChild(s);
  }
}


// ══════════════════════════════════════════════════════
// ÉQUIPES — gestion admin
// ══════════════════════════════════════════════════════
function saveDeadline(){
  const day=parseInt(document.getElementById('dl-day').value);
  const time=document.getElementById('dl-time').value||'23:59';
  const [h,m]=time.split(':').map(Number);
  ASTR_CONFIG.deadline={dayOfWeek:day,hour:h,minute:m};
  if(CD())CD().astrConfig=ASTR_CONFIG;saveData();
  const saved=document.getElementById('dl-saved');
  saved.style.display='inline';
  setTimeout(()=>saved.style.display='none',2000);
}
function saveDeadlinePiquet(){
  const day=parseInt(document.getElementById('dlp-day').value);
  const time=document.getElementById('dlp-time').value||'18:00';
  const [h,m]=time.split(':').map(Number);
  if(!ASTR_CONFIG.deadlinePiquet)ASTR_CONFIG.deadlinePiquet={};
  ASTR_CONFIG.deadlinePiquet={dayOfWeek:day,hour:h,minute:m};
  if(CD())CD().astrConfig=ASTR_CONFIG;saveData();
  const saved=document.getElementById('dlp-saved');
  if(saved){saved.style.display='inline';setTimeout(()=>saved.style.display='none',2000);}
}
function saveWeekStart(){
  const day=parseInt(document.getElementById('ws-day').value);
  const time=document.getElementById('ws-hour').value||'00:00';
  const [h]=time.split(':').map(Number);
  ASTR_CONFIG.weekStartDay=day;
  ASTR_CONFIG.weekStartHour=h;
  if(CD())CD().astrConfig=ASTR_CONFIG;saveData();
  const saved=document.getElementById('ws-saved');
  saved.style.display='inline';
  setTimeout(()=>saved.style.display='none',2000);
  rAstrPlanning();rAstrDispo();
}
function rAstrEquipes(){
  // Initialiser les champs deadline
  const dlDay=document.getElementById('dl-day');
  const dlTime=document.getElementById('dl-time');
  if(dlDay)dlDay.value=String(ASTR_CONFIG.deadline.dayOfWeek);
  if(dlTime)dlTime.value=`${pad(ASTR_CONFIG.deadline.hour)}:${pad(ASTR_CONFIG.deadline.minute)}`;
  const dlpDay=document.getElementById('dlp-day');
  const dlpTime=document.getElementById('dlp-time');
  const dlp=ASTR_CONFIG.deadlinePiquet||{dayOfWeek:0,hour:18,minute:0};
  if(dlpDay)dlpDay.value=String(dlp.dayOfWeek);
  if(dlpTime)dlpTime.value=`${pad(dlp.hour)}:${pad(dlp.minute)}`;
  const wsDay=document.getElementById('ws-day');
  const wsHour=document.getElementById('ws-hour');
  if(wsDay)wsDay.value=String(ASTR_CONFIG.weekStartDay??1);
  if(wsHour)wsHour.value=pad(ASTR_CONFIG.weekStartHour??0)+':00';
  // Remplir select responsable
  const respSel=document.getElementById('eq-resp');
  // USERS contient déjà le superadmin via syncCaserneContext — tri alphabétique nom prénom
  const respSorted=sortByName(USERS);
  if(respSel)respSel.innerHTML=respSorted.map(u=>`<option value="${u.l}">${fullNameAff(u)}</option>`).join('');
  // Remplir engins
  const enginsList=document.getElementById('engins-list');
  if(enginsList)enginsList.innerHTML=ASTR_CONFIG.engins.map((e,i)=>
    `<span style="background:var(--bg);border:1px solid var(--brd);border-radius:20px;padding:3px 10px;font-size:12px;display:flex;align-items:center;gap:5px;">${e} <span style="font-size:10px;color:var(--t2);">(${getEnginType(e)})</span>
      <button style="background:none;border:none;color:#E24B4A;cursor:pointer;font-size:12px;" onclick="delEngin(${i})">✕</button>
    </span>`).join('');
  // Remplir le select de types pour la création d'engin
  const typeSel=document.getElementById('new-engin-type');
  if(typeSel)typeSel.innerHTML=ENGIN_TYPES.map(function(t){return '<option value="'+escHtml(t.type)+'">'+escHtml(t.type)+'</option>';}).join('');
  // Liste équipes
  const list=document.getElementById('astr-equipes-list');
  if(!list)return;
  list.innerHTML=sortEquipes(EQUIPES).map(eq=>`
    <div style="background:${eq.color}18;border:1.5px solid ${eq.color}44;border-radius:12px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="eq-badge" style="background:${eq.color};">${eq.nom}</span>
        <span style="font-size:11px;color:var(--t2);">Créneau ${eq.granularity}min</span>
        <span style="font-size:11px;color:var(--t2);">Resp. : ${(u=>u?fullNameAff(u):eq.resp)(USERS.find(u=>u.l===eq.resp)||GLOBAL_ACCOUNTS.find(a=>a.l===eq.resp))}</span>
        <button class="btn sm" style="margin-left:auto;font-size:10px;" onclick="editEquipe('${eq.id}')">✏️ Modifier</button>
        <button class="btn sm" style="font-size:10px;color:#E24B4A;" onclick="delEquipe('${eq.id}')">✕</button>
      </div>
      <div style="font-size:11px;color:var(--t2);margin-bottom:6px;">${eq.membres.length} membre(s)</div>
      <div id="eq-members-${eq.id}">
        ${sortByGradeThenName(eq.membres.map(l=>USERS.find(u=>u.l===l)).filter(Boolean)).map(u=>`<div class="eq-member-row">
          <div style="flex:1;font-weight:500;">${fullName(u)}</div>
          <div style="font-size:10px;color:var(--t2);">${u.grade||''}</div>
          <button class="btn sm" style="font-size:10px;padding:2px 6px;color:#E24B4A;" onclick="removeMembre('${eq.id}','${u.l}')">✕</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <select class="fi" id="add-membre-sel-${eq.id}" style="flex:1;font-size:12px;padding:5px 8px;">
          ${(()=>{const libres=USERS.filter(u=>{if(eq.membres.includes(u.l))return false;return !EQUIPES.some(e=>e.id!==eq.id&&e.membres.includes(u.l));});return libres.length?sortByGradeThenName(libres).map(u=>`<option value="${u.l}">${fullName(u)}</option>`).join(''):'<option disabled value="">Tous les agents sont dans une équipe</option>';})()}
        </select>
        <button class="btn pr sm" onclick="addMembre('${eq.id}')">+ Ajouter</button>
      </div>
    </div>`).join('');
}
function showAddEquipe(){
  document.getElementById('astr-equipe-add').style.display=document.getElementById('astr-equipe-add').style.display==='none'?'block':'none';
}
let selEqColorVal='#3498DB';
function selEqColor(el,color){
  selEqColorVal=color;
  document.querySelectorAll('.eq-color-opt').forEach(e=>e.style.borderColor='transparent');
  el.style.borderColor='#333';
}
function addEquipe(){
  const nom=document.getElementById('eq-nom').value.trim();
  const err=document.getElementById('eq-err');
  if(!nom){err.style.display='block';err.textContent='Nom obligatoire.';return;}
  err.style.display='none';
  const id='eq'+Date.now();
  const granularity=parseInt(document.getElementById('eq-granularity').value);
  const resp=document.getElementById('eq-resp').value;
  if(resp&&!USERS.some(function(user){return user.l===resp;})){err.style.display='block';err.textContent='Le responsable doit appartenir à cette caserne.';return;}
  EQUIPES.push({id,caserneId:CURRENT_CASERNE_ID,nom,color:selEqColorVal,granularity,resp,membres:resp?[resp]:[]});
  if(CD())CD().equipes=EQUIPES;
  document.getElementById('eq-nom').value='';
  document.getElementById('astr-equipe-add').style.display='none';
  saveData();rAstrEquipes();applyNavRights();
}
function delEquipe(id){
  confirmModal('Supprimer cette équipe ?',async function(){
    const index=EQUIPES.findIndex(function(eq){return equipeBelongsToCurrentCaserne(eq)&&eq.id===id;});
    if(index<0)return;
    if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcMarkDeleted==='function'&&CURRENT_CASERNE_ID){
      try{await _rcMarkDeleted(CURRENT_CASERNE_ID,'equipe',[id]);}catch(e){}
    }
    EQUIPES.splice(index,1);
    if(CD())CD().equipes=EQUIPES;
    saveData(true);rAstrEquipes();applyNavRights();
  });
}
function editEquipe(id){
  const eq=getEquipeById(id);if(!eq)return;
  const respOpts=sortByName(USERS).map(u=>`<option value="${u.l}"${u.l===eq.resp?' selected':''}>${fullNameAff(u)}</option>`).join('');
  document.getElementById('mt').textContent='Modifier '+eq.nom;
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`
    <div>
      <div class="fg"><div class="fgl">Nom</div><input class="fi" type="text" id="edit-eq-nom" value="${eq.nom}"/></div>
      <div class="fg"><div class="fgl">Granularité</div>
        <select class="fi" id="edit-eq-gran">
          <option value="60"${eq.granularity===60?' selected':''}>1 heure</option>
          <option value="30"${eq.granularity===30?' selected':''}>30 minutes</option>
          <option value="15"${eq.granularity===15?' selected':''}>15 minutes</option>
        </select>
      </div>
      <div class="fg"><div class="fgl">Responsable</div><select class="fi" id="edit-eq-resp">${respOpts}</select></div>
      <div class="brow">
        <button class="btn pr sm" onclick="saveEditEquipe('${id}')">&#x1F4BE; Enregistrer</button>
        <button class="btn sm" onclick="cM()">Annuler</button>
      </div>
    </div>`;
  document.getElementById('mo').style.display='flex';
}
function saveEditEquipe(id){
  const eq=getEquipeById(id);if(!eq)return;
  eq.nom=document.getElementById('edit-eq-nom').value.trim()||eq.nom;
  eq.granularity=parseInt(document.getElementById('edit-eq-gran').value);
  const resp=document.getElementById('edit-eq-resp').value;
  if(resp&&!USERS.some(function(user){return user.l===resp;})){showToast('Le responsable doit appartenir à cette caserne.','warn');return;}
  eq.resp=resp;eq.caserneId=CURRENT_CASERNE_ID;
  cM();saveData();rAstrEquipes();applyNavRights();
}
function addMembre(eqId){
  const eq=getEquipeById(eqId);if(!eq)return;
  const sel=document.getElementById('add-membre-sel-'+eqId);
  if(!sel||!sel.value)return;
  const login=sel.value;
  if(!USERS.some(function(user){return user.l===login;})){showToast('Cet agent n’appartient pas à cette caserne.','warn');return;}
  const autreEq=EQUIPES.find(e=>e.id!==eqId&&e.membres.includes(login));
  if(autreEq){showToast((USERS.find(u=>u.l===login)?.prenom||login)+' est déjà dans '+autreEq.nom+'.','warn');return;}
  if(!eq.membres.includes(login))eq.membres.push(login);
  saveData();rAstrEquipes();
}
function removeMembre(eqId,login){
  const eq=getEquipeById(eqId);if(!eq)return;
  eq.membres=eq.membres.filter(l=>l!==login);
  saveData();rAstrEquipes();
}
function addEngin(){
  const inp=document.getElementById('new-engin');
  const val=inp.value.trim().toUpperCase();
  if(!val)return;
  if(!ASTR_CONFIG.engins.includes(val))ASTR_CONFIG.engins.push(val);
  // Associer le type choisi (sinon déduction par préfixe via getEnginType)
  const typeSel=document.getElementById('new-engin-type');
  if(typeSel&&typeSel.value){
    if(!ASTR_CONFIG.enginTypes)ASTR_CONFIG.enginTypes={};
    ASTR_CONFIG.enginTypes[val]=typeSel.value;
  }
  inp.value='';
  if(CD())CD().astrConfig=ASTR_CONFIG;
  saveData();rAstrEquipes();
}
function delEngin(idx){
  ASTR_CONFIG.engins.splice(idx,1);
  if(CD())CD().astrConfig=ASTR_CONFIG;
  saveData();rAstrEquipes();
}

function transfererIV(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const casOptions=CASERNES.filter(c=>c.id!==CURRENT_CASERNE_ID)
    .map(c=>`<option value="${c.id}">${c.nom}</option>`).join('');
  document.getElementById('mt').textContent='Transférer l’intervention';
  document.getElementById('mi').textContent=id;
  document.getElementById('mb').innerHTML=`<div>
    <div style="font-size:12px;color:var(--t2);margin-bottom:10px;">
      L’intervention sera copiée dans la caserne destinataire. Un historique de transfert sera conservé ici.
    </div>
    <div class="fg"><div class="fgl">Caserne destinataire</div>
      <select class="fi" id="tr-dest">${casOptions}</select>
    </div>
    <div class="fg"><div class="fgl">Motif du transfert</div>
      <textarea class="fta" id="tr-motif" placeholder="ex. Zone géographique, spécialité..." style="height:60px;"></textarea>
    </div>
    <div class="brow">
      <button class="btn pr sm" onclick="confirmerTransfert('${id}')">&#x1F500; Transférer</button>
      <button class="btn sm" onclick="cM()">Annuler</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function confirmerTransfert(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const destId=document.getElementById('tr-dest').value;
  const motif=document.getElementById('tr-motif').value.trim();
  const destCas=CASERNES.find(c=>c.id===destId);if(!destCas)return;
  supprimerDemandesRenfortSansReponse(iv,CURRENT_CASERNE_ID);
  initCaserneData(destId);
  const h=getH(N());
  // Créer une copie dans la caserne destinataire
  const ivCopie={...iv,
    _transfertDe:CURRENT_CASERNE_ID,
    _origId:id,
    s:'en-attente',
    tl:[...( iv.tl||[]),{s:'transfert-reçu',h,who:CU.l,note:`Transfert de ${CC()?.nom||CURRENT_CASERNE_ID}${motif?' : '+motif:''}`}]
  };
  // Nouveau numéro APL pour la caserne destinataire
  const annee=new Date().getFullYear();
  const anneeT=new Date().getFullYear();
  ivCopie._numApl=nextAplNum(anneeT); // Compteur atomique global
  ivCopie.id=makeInterventionRecordId(ivCopie._numApl);
  CASERNE_DATA[destId].ivs.unshift(ivCopie);
  // Marquer l'original comme transféré
  iv._transfertVers=destId;
  iv.s='annulee';
  pushTL(iv,'annulee',CU.l);
  iv.tl[iv.tl.length-1].note='Transféré vers '+destCas.nom+(motif?' : '+motif:'');
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : annulation de l'original (caserne active)
  // Pousser explicitement la copie vers la caserne destinataire (mode records)
  try{
    if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcPushRecords==='function'){
      _rcPushRecords([{id:_rcId(destId,'iv',ivCopie.id),caserne:destId,type:'iv',data:ivCopie,deleted:false}]);
    }
  }catch(e){}
  cM();rI();rAccueil();
  // Confirmation
  setTimeout(()=>{
    const cm=document.getElementById('cm');
    cm.style.display='block';
    cm.innerHTML=`&#x1F500; Intervention transférée vers <strong>${destCas.nom}</strong>`;
    setTimeout(()=>cm.style.display='none',4000);
  },100);
}
function refugeAnimalier(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  document.getElementById('mt').textContent='&#x1F43E; Refuge animalier';
  document.getElementById('mi').textContent=interventionDisplayCallNumber(iv);
  document.getElementById('mb').innerHTML=`<div>
    <div style="background:#EAF3DE;border:1px solid #A9D18E;border-radius:10px;padding:12px;margin-bottom:12px;font-size:13px;color:#1E6B1E;text-align:center;">
      &#x1F43E; L'intervention sera transmise au refuge animalier et archivée.
    </div>
    <div style="font-size:12px;margin-bottom:8px;"><strong>Nature :</strong> ${escHtml(iv.n)}</div>
    <div style="font-size:12px;margin-bottom:12px;"><strong>Adresse :</strong> ${escHtml(iv.addr)}${iv.com?' — '+escHtml(iv.com):''}</div>
    <div class="brow">
      <button class="btn sm" style="background:#27AE60;color:#fff;border-color:#27AE60;" onclick="confirmerRefuge('${id}')">
        &#x1F43E; Confirmer la transmission
      </button>
      <button class="btn sm" onclick="cM()">Annuler</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function confirmerRefuge(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const h=getH(N());
  iv._refugeAnimalier='Refuge animalier';
  iv.s='annulee';
  supprimerDemandesRenfortSansReponse(iv,CURRENT_CASERNE_ID);
  pushTL(iv,'annulee',CU.l);
  iv.tl[iv.tl.length-1].note='Transmis au refuge animalier';
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : sinon écrasé au prochain pull
  cM();rI();rAccueil();
}

function annulerIV(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  document.getElementById('mt').textContent='Annuler l’intervention';
  document.getElementById('mi').textContent=id;
  document.getElementById('mb').innerHTML=`
    <div>
      <div style="font-size:13px;color:var(--t);margin-bottom:12px;">
        Motif de l'annulation (optionnel)
      </div>
      <textarea class="fta" id="cancel-motif" placeholder="ex. Faux appel, requérant a rappelé pour annuler…" style="height:70px;"></textarea>
      <div style="font-size:11px;color:var(--t2);margin:8px 0 12px;">
        ℹ️ L’intervention sera marquée comme annulée et ne sera plus comptabilisée dans les statistiques. Elle restera dans l’historique.
      </div>
      <div class="brow">
        <button class="btn sm" style="background:#888;color:#fff;border-color:#888;" onclick="confirmerAnnulation('${id}')">Confirmer l’annulation</button>
        <button class="btn pr sm" onclick="cM()">Conserver</button>
      </div>
    </div>`;
  openModalAtTop('cancel-motif');
}
function confirmerAnnulation(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const motif=document.getElementById('cancel-motif')?.value.trim()||'';
  iv.s='annulee';
  supprimerDemandesRenfortSansReponse(iv,CURRENT_CASERNE_ID);
  pushTL(iv,'annulee',CU.l);
  if(motif)iv.tl[iv.tl.length-1].note=motif;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : sinon l'annulation est écrasée au prochain pull
  cM();rI();rAccueil();
}
// ── Échelle de toit ──
function demandeEchelleToiture(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  document.getElementById('mt').textContent='\U0001FA9C \u00c9chelle de toit requise';
  document.getElementById('mi').textContent=interventionDisplayCallNumber(iv);
  document.getElementById('mb').innerHTML=`<div>
    <div style="background:#FEF3C7;border:2px solid #F59E0B;border-radius:10px;padding:12px;margin-bottom:12px;font-size:14px;font-weight:700;color:#92400E;text-align:center;">
      &#x26A0;&#xFE0F; INTERVENTION \u00c0 FAIRE AVEC \u00c9CHELLE DE TOIT
    </div>
    <div class="fg"><div class="fgl">Observations</div><textarea class="fta" id="et-obs" style="height:80px;"></textarea></div>
    <div class="brow">
      <button class="btn pr sm" onclick="confirmerEchelleToiture('${ivId}')">Cr\u00e9er la demande</button>
      <button class="btn sm" onclick="oM('${ivId}')" >Retour</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function confirmerEchelleToiture(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  const obs=document.getElementById('et-obs').value.trim();
  const h=getH(N());const annee=new Date().getFullYear();
  const numApl=nextAplNum(annee);
  incCallCounter();
  const newIv={id:makeInterventionRecordId(numApl),_numApl:numApl,n:iv.n,addr:iv.addr,addrComp:iv.addrComp||'',com:iv.com,
    h,op:CU.l,s:'en-attente',det:obs,eng:null,req:iv.req,tel:iv.tel,obs:'',agr:null,
    rappels:0,avisIds:[],_echelleToiture:true,tl:[mkTL('en-attente',h,CU.l)]};
  IVS.unshift(newIv);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  showToast('Demande avec \u00e9chelle enregistr\u00e9e \u2713','success');
  cM();rI();rAccueil();
}
// ── Inter. SDIS ──
function demandeEPA(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  document.getElementById('mt').textContent='&#x1F9F0; EPA requis';
  document.getElementById('mi').textContent=interventionDisplayCallNumber(iv);
  document.getElementById('mb').innerHTML='<div>'
    +'<div style="background:#F3EAF8;border:2px solid #8E44AD;border-radius:10px;padding:12px;margin-bottom:12px;font-size:14px;font-weight:700;color:#6C3483;text-align:center;">'
    +'&#x1F9F0; INTERVENTION À FAIRE AVEC EPA</div>'
    +'<div class="fg"><div class="fgl">Observations</div><textarea class="fta" id="epa-obs" style="height:80px;"></textarea></div>'
    +'<div class="brow">'
    +'<button class="btn pr sm" onclick="confirmerEPA(\''+ivId+'\')" style="background:#8E44AD;border-color:#8E44AD;">Créer la demande</button>'
    +'<button class="btn sm" onclick="oM(\''+ivId+'\')" >Retour</button>'
    +'</div></div>';
  document.getElementById('mo').style.display='flex';
}
function confirmerEPA(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  const obs=document.getElementById('epa-obs').value.trim();
  const h=getH(N());const annee=new Date().getFullYear();
  const numApl=nextAplNum(annee);
  incCallCounter();
  const newIv={id:makeInterventionRecordId(numApl),_numApl:numApl,n:iv.n,addr:iv.addr,addrComp:iv.addrComp||'',com:iv.com,
    h,op:CU.l,s:'en-attente',det:obs,eng:null,req:iv.req,tel:iv.tel,obs:'',agr:null,
    rappels:0,avisIds:[],_epa:true,tl:[mkTL('en-attente',h,CU.l)]};
  IVS.unshift(newIv);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  showToast('Demande EPA enregistr\u00e9e \u2713','success');
  cM();rI();rAccueil();
}
function demandeSDIS(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  document.getElementById('mt').textContent='&#x1F691; Inter. SDIS';
  document.getElementById('mi').textContent=interventionDisplayCallNumber(iv);
  document.getElementById('mb').innerHTML=`<div>
    <div style="background:#DBEAFE;border:1px solid #93C5FD;border-radius:10px;padding:12px;margin-bottom:12px;font-size:13px;color:#1D4ED8;text-align:center;">
      &#x1F691; L'intervention actuelle sera clôturée et recréée en cours avec la mention SDIS.
    </div>
    <div style="font-size:12px;margin-bottom:4px;"><strong>Nature :</strong> ${escHtml(iv.n)}</div>
    <div style="font-size:12px;margin-bottom:12px;"><strong>Adresse :</strong> ${escHtml(iv.addr)}${iv.com?' — '+escHtml(iv.com):''}</div>
    <div class="brow">
      <button class="btn sm" style="background:#1D4ED8;color:#fff;border-color:#1D4ED8;" onclick="confirmerSDIS('${ivId}')">
        &#x1F691; Confirmer Inter. SDIS
      </button>
      <button class="btn sm" onclick="oM('${ivId}')" >Retour</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function confirmerSDIS(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  const h=getH(N());const annee=new Date().getFullYear();
  iv.s='terminee';
  supprimerDemandesRenfortSansReponse(iv,CURRENT_CASERNE_ID);
  iv.tl.push({s:'terminee',h,who:CU.l,note:'Recréée en inter. SDIS'});
  const numApl=nextAplNum(annee);
  incCallCounter();
  const newIv={
    id:makeInterventionRecordId(numApl),_numApl:numApl,n:iv.n,addr:iv.addr,addrComp:iv.addrComp||'',com:iv.com,
    h,op:CU.l,s:'en-cours',det:iv.det,eng:iv.eng,req:iv.req,tel:iv.tel,obs:'',
    agr:iv.agr||CU.l,rappels:0,avisIds:[],_sdis:true,_refOrig:iv.id,
    tl:[mkTL('en-attente',h,CU.l),mkTL('en-cours',h,CU.l+' (SDIS)')]
  };
  IVS.unshift(newIv);
  assignInterventionNumbersAtStart(newIv);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  cM();rI();rAccueil();
  // Ouvrir directement la nouvelle intervention
  setTimeout(()=>oM(newIv.id),100);
}
// ── Heure affichage HH:MM ──
function getHHMM(d){return pad(d.getHours())+':'+pad(d.getMinutes());}

// ── Durée entre deux HH:MM ──
function dureeHHMM(debut,fin){
  if(!debut||!fin)return null;
  const [dh,dm]=debut.split(':').map(Number);
  const [fh,fm]=fin.split(':').map(Number);
  let diff=(fh*60+fm)-(dh*60+dm);
  if(diff<0)diff+=1440;
  return pad(Math.floor(diff/60))+':'+pad(diff%60);
}

// Format de durée unique dans AGAI, identique à celui des interventions.
// Accepte également les anciennes valeurs "4h30" pour préserver l'historique.
function dureeMinutesHHMM(minutes){
  const total=Math.max(0,Math.round(Number(minutes)||0));
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function dureeValeurMinutes(value){
  if(typeof value==='number'&&Number.isFinite(value))return Math.max(0,value);
  const text=String(value||'').trim();
  let match=text.match(/^(\d+):(\d{1,2})$/);
  if(match)return Number(match[1])*60+Number(match[2]);
  match=text.match(/^(\d+)\s*h\s*(\d{0,2})$/i);
  if(match)return Number(match[1])*60+Number(match[2]||0);
  return 0;
}
function dureeFormatHHMM(value,debut,fin){
  const calculee=dureeHHMM(debut,fin);
  if(calculee!==null)return calculee;
  return value?dureeMinutesHHMM(dureeValeurMinutes(value)):'';
}

// ── Modale personnel avant départ ──
// ── Détermine si un engin est VPI ──
function isVPI(engin){return engin&&engin.toUpperCase().startsWith('VPI');}

// Détecte le type d'un engin (VTU, VPI, VL...).
// Priorité : association explicite (ASTR_CONFIG.enginTypes), sinon préfixe avant le tiret.
function getEnginType(nom){
  if(!nom)return '';
  const map=(ASTR_CONFIG&&ASTR_CONFIG.enginTypes)||{};
  if(map[nom])return map[nom];
  // Déduire par préfixe : "VTU-01" -> "VTU", "VPI" -> "VPI"
  const base=nom.toUpperCase().split('-')[0].trim();
  const found=ENGIN_TYPES.find(function(t){return t.type.toUpperCase()===base;});
  return found?found.type:base;
}

// Renvoie la composition (rôles + nombre) d'un engin selon son type.
function getEnginRoles(nom){
  const type=getEnginType(nom);
  const t=ENGIN_TYPES.find(function(x){return x.type.toUpperCase()===type.toUpperCase();});
  if(t&&Array.isArray(t.roles))return t.roles;
  // Repli si type inconnu : comportement historique (VPI=4, autres=3)
  if(isVPI(nom))return [{role:"Chef d\u2019agrès",n:1},{role:'Conducteur',n:1},{role:"Chef d\u2019équipe",n:1},{role:'Équipier',n:1}];
  return [{role:"Chef d\u2019agrès",n:1},{role:'Conducteur',n:1},{role:'Équipier',n:1}];
}

// Nombre total de places d'un engin
function getEnginNbPlaces(nom){
  return getEnginRoles(nom).reduce(function(s,r){return s+(r.n||0);},0);
}

// Déplie le référentiel du superadmin en une place par agent. La première
// place de chef d'agrès est occupée par le chef ayant pris le départ.
function configuredCrewSlotsFromRoles(roleDefinitions){
  const counters={},slots=[];
  let fixedChiefUsed=false;
  (Array.isArray(roleDefinitions)?roleDefinitions:[]).forEach(function(definition){
    const role=definition&&definition.role||'Agent';
    const key=interventionRoleKey(role)||'agent';
    const count=Math.max(0,parseInt(definition&&definition.n,10)||0);
    for(let index=0;index<count;index++){
      if(key==='chefdagres'&&!fixedChiefUsed){fixedChiefUsed=true;continue;}
      counters[key]=(counters[key]||0)+1;
      slots.push({role:role,key:key,ordinal:counters[key]});
    }
  });
  const totals={};
  slots.forEach(function(slot){totals[slot.key]=(totals[slot.key]||0)+1;});
  slots.forEach(function(slot){slot.total=totals[slot.key]||1;});
  return slots;
}
function configuredCrewSlotsForVehicle(nom){
  return configuredCrewSlotsFromRoles(getEnginRoles(nom));
}
function interventionConfiguredCrewSlots(iv){
  const saved=Array.isArray(iv&&iv._engin1RoleConfig)&&iv._engin1RoleConfig.length?iv._engin1RoleConfig:null;
  return configuredCrewSlotsFromRoles(saved||getEnginRoles(iv&&((iv._engin1||iv.eng))||''));
}
function interventionConfiguredCrewPlaceCount(iv){
  const saved=Array.isArray(iv&&iv._engin1RoleConfig)&&iv._engin1RoleConfig.length?iv._engin1RoleConfig:null;
  return (saved||getEnginRoles(iv&&((iv._engin1||iv.eng))||'')).reduce(function(total,role){return total+(parseInt(role&&role.n,10)||0);},0);
}

function departureCrewSlotId(prefix,slot){
  if(prefix==='eq1'&&slot.key==='conducteur'&&slot.ordinal===1)return 'eq-conducteur';
  if(prefix==='eq1'&&slot.key==='chefdequipe'&&slot.ordinal===1)return 'eq-chef-equipe';
  if(prefix==='eq1'&&slot.key==='equipier'&&slot.ordinal===1)return 'eq-equipier1';
  if(prefix==='eq2'&&slot.key==='conducteur'&&slot.ordinal===1)return 'eq-cond2';
  if(prefix==='eq2'&&slot.key==='chefdequipe'&&slot.ordinal===1)return 'eq-chef-equipe2';
  if(prefix==='eq2'&&slot.key==='equipier'&&slot.ordinal===1)return 'eq-equipier2';
  return prefix+'-'+slot.key+'-'+slot.ordinal;
}

function buildDepartureCrewFields(engin,prefix,suggestions,excludeLogins){
  suggestions=suggestions||{};
  return configuredCrewSlotsForVehicle(engin).map(function(slot){
    const label=slot.role+(slot.total>1?' '+slot.ordinal:'');
    const suggested=slot.ordinal===1?(suggestions[slot.key]||''):'';
    return agentSelectHtml(label,departureCrewSlotId(prefix,slot),suggested,!!suggested,slot.key==='conducteur',excludeLogins||[]);
  }).join('');
}

function readDepartureCrewFields(engin,prefix,chiefLogin){
  const crew=chiefLogin?[{role:'CA',login:chiefLogin}]:[];
  configuredCrewSlotsForVehicle(engin).forEach(function(slot){
    const field=document.getElementById(departureCrewSlotId(prefix,slot));
    const login=field&&field.value||'';
    if(login)crew.push({role:slot.role,login:login});
  });
  return crew;
}

// Compte, pour un engin, combien de chaque rôle standard la config prévoit.
// Renvoie {conducteur:N, chefEquipe:N, equipier:N}. Le chef d'agrès est implicite.
function _enginRoleCount(nom){
  const roles=getEnginRoles(nom);
  const norm=function(s){return (s||'').toLowerCase().replace(/[\u00e8\u00e9\u00ea]/g,'e').replace(/[^a-z]/g,'');};
  let conducteur=0,chefEquipe=0,equipier=0;
  roles.forEach(function(r){
    const k=norm(r.role);const n=r.n||0;
    if(k==='conducteur')conducteur+=n;
    else if(k==='chefdequipe')chefEquipe+=n;
    else if(k==='equipier')equipier+=n;
  });
  return {conducteur:conducteur,chefEquipe:chefEquipe,equipier:equipier};
}

// ── Récupère le piquet actif pour un login donné ──
function getPiquetActif(wk,login){
  const now=N();
  const nowMin=now.getHours()*60+now.getMinutes();
  const dowJS=now.getDay();
  const jourActuel=JOURS_FULL[dowJS===0?6:dowJS-1];
  const jourPrec=JOURS_FULL[(dowJS===0?6:dowJS-1+6)%7];
  return (PIQUETS[wk]||[]).find(function(p){
    // chef d'agrès : raccourci p.chefAgres, ou repli sur les membres (insensible apostrophe)
    let caLogin=p.chefAgres;
    if(!caLogin&&p.membres&&p.membres.length){
      const _nr=function(s){return (s||'').toLowerCase().replace(/[\u00e8\u00e9\u00ea]/g,'e').replace(/[^a-z]/g,'');};
      const caM=p.membres.find(function(m){return _nr(m.role)===_nr("Chef d'agr\u00e8s");});
      if(caM)caLogin=caM.login;
    }
    if(caLogin!==login)return false;
    const dMin=timeToMin(p.debut),fMin=timeToMin(p.fin);
    const overnight=p.fin<=p.debut;
    if(overnight){
      if(p.jour===jourActuel&&nowMin>=dMin)return true;
      if(p.jour===jourPrec&&nowMin<fMin)return true;
    } else {
      if(p.jour===jourActuel&&nowMin>=dMin&&nowMin<fMin)return true;
    }
    return false;
  })||null;
}

// ── Extrait l'équipage d'un piquet (robuste : lit les membres, repli sur les raccourcis) ──
function getPiquetEquipage(piq){
  const res={conducteur:'',chefEquipe:'',equipier:''};
  if(!piq)return res;
  const _nr=function(s){return (s||'').toLowerCase().replace(/[\u00e8\u00e9\u00ea]/g,'e').replace(/[^a-z]/g,'');};
  if(piq.membres&&piq.membres.length){
    piq.membres.forEach(function(m){
      const k=_nr(m.role);
      if(k===_nr('Conducteur')&&!res.conducteur)res.conducteur=m.login;
      else if(k===_nr("Chef d'\u00e9quipe")&&!res.chefEquipe)res.chefEquipe=m.login;
      else if(k===_nr('\u00c9quipier')&&!res.equipier)res.equipier=m.login;
    });
  }
  // Repli sur les raccourcis si membres absents/incomplets
  if(!res.conducteur&&piq.conducteur)res.conducteur=piq.conducteur;
  if(!res.chefEquipe&&piq.chefEquipe)res.chefEquipe=piq.chefEquipe;
  if(!res.equipier&&piq.stagiaire)res.equipier=piq.stagiaire;
  return res;
}

// ── Construit le HTML d'un sélecteur d'agent avec rôle ──
// Renvoie la liste des agents venus en renfort sur l'intervention en cours d'édition.
// IMPORTANT : on lit l'équipage depuis les demandes de renfort stockées dans la
// caserne qui aide (caserneDest), car ces données se synchronisent correctement.
// (Modifier _equipage1 de l'intervention source ne survit pas à la fusion par ID.)
function _getRenfortPersonnel(){
  const d=window._piqData||{};
  if(!d.ivId)return [];
  const out=[];
  // Parcourir toutes les casernes à la recherche de demandes de renfort
  // acceptées pour cette intervention, avec un équipage composé.
  Object.keys(CASERNE_DATA).forEach(function(destCid){
    if(destCid==='_cabbalrActif'||destCid==='_initCabbalr'||destCid==='_global')return;
    const dd=CASERNE_DATA[destCid];
    if(!dd||!Array.isArray(dd.renforts))return;
    dd.renforts.forEach(function(r){
      if(r.ivId!==d.ivId)return;
      if(r.caserneSource!==CURRENT_CASERNE_ID)return; // c'est bien une demande émise par MA caserne
      if(!Array.isArray(r.equipageRenfort)||!r.equipageRenfort.length)return;
      if(r.statut==='refuse'||r.statut==='annule')return;
      const cas=CASERNES.find(function(c){return c.id===destCid;});
      r.equipageRenfort.forEach(function(e){
        if(e&&e.login&&!out.find(function(x){return x.login===e.login;})){
          out.push({login:e.login,nom:e.nom||'',prenom:e.prenom||'',grade:e.grade||'',role:e.role||'',caserneNom:cas?cas.nom:(destCid||'Renfort')});
        }
      });
    });
  });
  return out;
}

function agentSelectHtml(role,idSel,suggestedLogin,piqLabel,required,excludeLogins){
  const reqBadge=required?'<span style="color:#E24B4A;">*</span>':'<span style="font-size:10px;color:var(--t2);font-weight:400;">(optionnel)</span>';
  const piqBadge=suggestedLogin?'<span style="font-size:9px;background:#EAF3DE;color:#3B6D11;border-radius:4px;padding:1px 5px;margin-left:4px;">piquet</span>':'';
  // Les options sont recalculées dynamiquement via refreshEquipageSelects
  // On stocke les données dans data-attributes pour pouvoir les reconstruire
  return '<div style="margin-bottom:8px;" data-role-block="1">'
    +'<div style="font-size:11px;font-weight:600;color:var(--t);margin-bottom:3px;">'+role+' '+reqBadge+piqBadge+'</div>'
    +'<select class="fi eq-sel" id="'+idSel+'"'
    +' data-suggested="'+suggestedLogin+'"'
    +' data-exclude="'+excludeLogins.join(',')+'"'
    +' onchange="refreshEquipageSelects()"></select></div>';
}

// ── Reconstruit toutes les options en excluant les agents déjà pris ──
function refreshEquipageSelects(){
  const sels=Array.from(document.querySelectorAll('.eq-sel'));
  const currentIvId=window._piqData&&window._piqData.ivId;
  const vals={};
  sels.forEach(function(s){
    // La suggestion du piquet ne s'applique QU'À LA PREMIÈRE initialisation du champ.
    // Ensuite, on respecte le choix de l'utilisateur — y compris "— Aucun —" (valeur vide).
    if(s.dataset.init==='1'){
      vals[s.id]=s.value||'';
    } else {
      vals[s.id]=s.value||s.dataset.suggested||'';
      s.dataset.init='1';
    }
  });
  sels.forEach(function(sel){
    const currentVal=vals[sel.id]||'';
    const baseExclude=(sel.dataset.exclude||'').split(',').filter(Boolean);
    const takenByOthers=sels.filter(function(o){return o.id!==sel.id&&vals[o.id];}).map(function(o){return vals[o.id];});
    const allExclude=baseExclude.concat(takenByOthers);
    const users=USERS.filter(function(u){
      return (u.l===currentVal||!allExclude.includes(u.l))&&!findActivePersonnelConflict(u.l,currentIvId);
    }).sort(function(a,b){return (a.nom+' '+a.prenom).localeCompare(b.nom+' '+b.prenom,'fr');});
    const suggested=sel.dataset.suggested||'';
    // Personnel renfort (autre caserne) — affiché en tête de liste
    const renforts=_getRenfortPersonnel().filter(function(r){
      return (r.login===currentVal||!allExclude.includes(r.login))&&!findActivePersonnelConflict(r.login,currentIvId);
    });
    const renfortOpts=renforts.map(function(r){
      const nom=(r.prenom||r.nom)?((r.prenom||'')+' '+(r.nom||'')).trim():r.login;
      return '<option value="'+r.login+'"'+(r.login===currentVal?' selected':'')+'>&#x1F692; '+nom+(r.grade?' ('+gradeAbbr(r.grade)+')':'')+' — '+r.caserneNom+'</option>';
    }).join('');
    const renfortLogins=renforts.map(function(r){return r.login;});
    const usersFiltered=users.filter(function(u){return !renfortLogins.includes(u.l);});
    sel.innerHTML='<option value="">— Aucun —</option>'
      +(renfortOpts?'<optgroup label="Renfort UT">'+renfortOpts+'</optgroup><optgroup label="Ma caserne">':'')
      +usersFiltered.map(function(u){
      return '<option value="'+u.l+'"'+(u.l===currentVal?' selected':'')+'>'+fullName(u)+' ('+gradeAbbr(u.grade)+')'+(u.l===suggested?' ★':'')+'</option>';
    }).join('')+(renfortOpts?'</optgroup>':'');
  });
  renderSuperAdmin._lastCall=Date.now();
  setTimeout(function(){renderJoursFeries(new Date().getFullYear());},0);
}

function renderEnginTypes(){
  const cont=document.getElementById('sa-engin-types');if(!cont)return;
  let html='<div style="display:flex;flex-direction:column;gap:10px;">';
  ENGIN_TYPES.forEach(function(t,ti){
    const nbPlaces=t.roles.reduce(function(s,r){return s+(r.n||0);},0);
    html+='<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;background:#fafafa;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        +'<input type="text" value="'+escHtml(t.type)+'" onchange="etRenameType('+ti+',this.value)" style="font-weight:700;font-size:13px;width:90px;padding:4px 8px;border:1px solid #ccc;border-radius:6px;text-transform:uppercase;"/>'
        +'<span style="font-size:11px;color:#666;">'+nbPlaces+' place'+(nbPlaces>1?'s':'')+'</span>'
        +'<button onclick="etDelType('+ti+')" style="margin-left:auto;background:none;border:none;color:#E24B4A;cursor:pointer;font-size:13px;" title="Supprimer ce type">&times;</button>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:5px;">';
    t.roles.forEach(function(r,ri){
      html+='<div style="display:flex;align-items:center;gap:6px;">'
        +'<select onchange="etSetRole('+ti+','+ri+',this.value)" style="flex:1;padding:4px 6px;border:1px solid #ccc;border-radius:6px;font-size:12px;">'
        +ENGIN_ROLES_DISPONIBLES.map(function(ro){return '<option'+(ro===r.role?' selected':'')+'>'+escHtml(ro)+'</option>';}).join('')
        +(ENGIN_ROLES_DISPONIBLES.includes(r.role)?'':'<option selected>'+escHtml(r.role)+'</option>')
        +'</select>'
        +'<input type="number" min="1" max="20" value="'+(r.n||1)+'" onchange="etSetRoleN('+ti+','+ri+',this.value)" style="width:54px;padding:4px 6px;border:1px solid #ccc;border-radius:6px;font-size:12px;text-align:center;"/>'
        +'<button onclick="etDelRole('+ti+','+ri+')" style="background:none;border:none;color:#E24B4A;cursor:pointer;font-size:13px;" title="Retirer ce rôle">&times;</button>'
      +'</div>';
    });
    html+='<div style="display:flex;gap:6px;margin-top:4px;">'
      +'<button class="btn sm" style="font-size:11px;" onclick="etAddRole('+ti+')">+ Ajouter un rôle</button>'
      +'<input type="text" id="et-newrole-'+ti+'" placeholder="Nouveau rôle personnalisé" style="flex:1;padding:4px 8px;border:1px solid #ccc;border-radius:6px;font-size:11px;"/>'
      +'<button class="btn sm" style="font-size:11px;" onclick="etAddCustomRole('+ti+')">+ Perso</button>'
      +'</div>';
    html+='</div></div>';
  });
  html+='</div>';
  html+='<div style="display:flex;gap:6px;margin-top:10px;">'
    +'<input type="text" id="et-newtype" placeholder="Nouveau type (ex: VSAV)" style="flex:1;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:12px;text-transform:uppercase;"/>'
    +'<button class="btn pr sm" onclick="etAddType()">+ Ajouter un type</button>'
    +'</div>';
  cont.innerHTML=html;
}
function _etSave(){if(typeof saveData==='function')saveData();renderEnginTypes();}
function etRenameType(ti,val){val=(val||'').trim().toUpperCase();if(!val)return;ENGIN_TYPES[ti].type=val;_etSave();}
function etDelType(ti){if(!confirm('Supprimer le type "'+ENGIN_TYPES[ti].type+'" ?'))return;ENGIN_TYPES.splice(ti,1);_etSave();}
function etAddType(){const inp=document.getElementById('et-newtype');const val=(inp.value||'').trim().toUpperCase();if(!val)return;if(ENGIN_TYPES.find(function(t){return t.type.toUpperCase()===val;})){showToast('Ce type existe déjà','warn');return;}ENGIN_TYPES.push({type:val,roles:[{role:"Chef d'agrès",n:1}]});inp.value='';_etSave();}
function etSetRole(ti,ri,val){ENGIN_TYPES[ti].roles[ri].role=val;_etSave();}
function etSetRoleN(ti,ri,val){const n=Math.max(1,Math.min(20,parseInt(val)||1));ENGIN_TYPES[ti].roles[ri].n=n;_etSave();}
function etDelRole(ti,ri){ENGIN_TYPES[ti].roles.splice(ri,1);_etSave();}
function etAddRole(ti){ENGIN_TYPES[ti].roles.push({role:ENGIN_ROLES_DISPONIBLES[0],n:1});_etSave();}
function etAddCustomRole(ti){const inp=document.getElementById('et-newrole-'+ti);const val=(inp.value||'').trim();if(!val)return;ENGIN_TYPES[ti].roles.push({role:val,n:1});inp.value='';_etSave();}

function saSaveBgLogout(){
  const inp=document.getElementById('sa-bglogout');if(!inp)return;
  let v=parseInt(inp.value);
  if(isNaN(v)||v<0)v=0;
  if(v>480)v=480;
  ASTR_CONFIG.bgLogoutMin=v;
  if(typeof CD==='function'&&CD())CD().astrConfig=ASTR_CONFIG;
  if(typeof saveData==='function')saveData();
  showToast(v>0?('Déconnexion auto réglée sur '+v+' min'):'Déconnexion auto désactivée','success');
}

// ── Outil de diagnostic d'affichage (superadmin) ──
// Surligne en rouge tout élément qui dépasse la largeur de l'écran, pour
// identifier précisément la cause d'un débordement horizontal sur un appareil.
let _diagAffichageActif=false;
function toggleDiagAffichage(){
  if(!isSuperAdmin())return;
  _diagAffichageActif=!_diagAffichageActif;
  const btn=document.getElementById('sa-diag-btn');
  if(_diagAffichageActif){
    _runDiagAffichage();
    if(btn){btn.textContent='🛑 Arrêter le diagnostic';btn.style.background='#7C2D2D';}
  } else {
    _clearDiagAffichage();
    if(btn){btn.textContent='🔎 Diagnostiquer l\u2019affichage';btn.style.background='';}
  }
}
function _clearDiagAffichage(){
  document.querySelectorAll('[data-diag-overflow]').forEach(function(el){
    el.style.outline='';el.removeAttribute('data-diag-overflow');
  });
  const banner=document.getElementById('diag-affichage-banner');
  if(banner)banner.remove();
}
function _runDiagAffichage(){
  _clearDiagAffichage();
  const docW=document.documentElement.clientWidth;
  const coupables=[];
  document.querySelectorAll('body *').forEach(function(el){
    const r=el.getBoundingClientRect();
    // On ignore les éléments volontairement défilables (leur débordement est maîtrisé)
    const st=window.getComputedStyle(el);
    if(st.overflowX==='auto'||st.overflowX==='scroll'||st.overflowX==='clip'||st.overflowX==='hidden')return;
    // Élément qui dépasse à droite ou commence hors écran à gauche
    if(r.right>docW+1||r.left<-1){
      el.style.outline='2px solid #E24B4A';
      el.setAttribute('data-diag-overflow','1');
      const id=el.id?('#'+el.id):'';
      const cls=(typeof el.className==='string'&&el.className)?('.'+el.className.trim().split(/\s+/).join('.')):'';
      coupables.push((el.tagName.toLowerCase()+id+cls).slice(0,60)+' ('+Math.round(r.right)+'px)');
    }
  });
  const banner=document.createElement('div');
  banner.id='diag-affichage-banner';
  banner.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1a1a1a;color:#fff;font-size:11px;padding:8px 12px;max-height:35vh;overflow-y:auto;font-family:monospace;box-shadow:0 -2px 12px rgba(0,0,0,.4);';
  if(coupables.length){
    banner.innerHTML='<b>Largeur écran : '+docW+'px — '+coupables.length+' élément(s) qui débordent :</b><br>'
      +coupables.map(function(c){return '• '+c;}).join('<br>');
  } else {
    banner.innerHTML='<b>Largeur écran : '+docW+'px — ✅ Aucun débordement détecté sur cet écran.</b>';
  }
  document.body.appendChild(banner);
}

function renderJoursFeries(annee){
  const grid=document.getElementById('sa-feries-grid');if(!grid)return;
  annee=parseInt(annee);
  const feries=getJoursFeries(annee);
  const NOMS_FERIES={
    [annee+'-01-01']:'Jour de l\u2019an',
    [annee+'-05-01']:'F\u00eate du Travail',
    [annee+'-05-08']:'Victoire 1945',
    [annee+'-07-14']:'F\u00eate Nationale',
    [annee+'-08-15']:'Assomption',
    [annee+'-11-01']:'Toussaint',
    [annee+'-11-11']:'Armistice',
    [annee+'-12-25']:'No\u00ebl',
  };
  // Ajouter les fériés calculés (Pâques, Ascension, Pentecôte, Lundi de Pâques)
  const allFeries=[...feries].sort();
  const JFULL=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MFULL=['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];
  // Calcul Pâques pour nommage
  const a=annee%19,b=Math.floor(annee/100),c=annee%100;
  const d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const ii=Math.floor(c/4),k=c%4,l=(32+2*e+2*ii-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const pmonth=Math.floor((h+l-7*m+114)/31),pday=((h+l-7*m+114)%31)+1;
  const paques=new Date(annee,pmonth-1,pday);
  const fmtIso=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
  const lundi=new Date(paques);lundi.setDate(paques.getDate()+1);
  const ascension=new Date(paques);ascension.setDate(paques.getDate()+39);
  const pentecote=new Date(paques);pentecote.setDate(paques.getDate()+50);
  NOMS_FERIES[fmtIso(paques)]='P\u00e2ques';
  NOMS_FERIES[fmtIso(lundi)]='Lundi de P\u00e2ques';
  NOMS_FERIES[fmtIso(ascension)]='Ascension';
  NOMS_FERIES[fmtIso(pentecote)]='Lundi de Pent\u00e9c\u00f4te';
  grid.innerHTML=allFeries.map(function(iso){
    const dt=new Date(iso);
    const nom=NOMS_FERIES[iso]||'F\u00e9ri\u00e9';
    const jourNom=JFULL[dt.getDay()];
    const moisNom=MFULL[dt.getMonth()];
    return '<div style="background:#FEF9C3;border-radius:8px;padding:8px 12px;display:flex;flex-direction:column;gap:2px;">'
      +'<div style="font-size:12px;font-weight:700;">'+nom+'</div>'
      +'<div style="font-size:11px;color:#666;">'+jourNom+' '+dt.getDate()+' '+moisNom+' '+annee+'</div>'
      +'</div>';
  }).join('');
}
function updateEquipageExclusions(){refreshEquipageSelects();}

function showPersonnelModal(id){
  const iv=IVS.find(function(v){return v.id===id;});if(!iv)return;
  const interruptedHandoff=findInterruptedDepartureHandoff(CU.l,id);
  const heure=interruptedHandoff?interruptedHandoff.handoff.heure:(_pendingNextInterventionStarts[id]||getHHMM(N()));
  const chained=!interruptedHandoff&&!!_pendingNextInterventionStarts[id];
  const wk=weekKey(getMondayOfWeek(0));

  // Piquet du CA principal
  const piq1=getPiquetActif(wk,CU.l);
  const _eq1=getPiquetEquipage(piq1);
  const engin1Sugg=piq1?piq1.engin:'';
  const cond1Sugg=_eq1.conducteur;
  const chefEq1Sugg=_eq1.chefEquipe;
  const eq1Sugg=_eq1.equipier;

  // Piquet du 2ème chef d'agrès (si présent)
  const agr2=iv._agr2||'';
  const piq2=agr2?getPiquetActif(wk,agr2):null;
  const _eq2=getPiquetEquipage(piq2);
  const engin2Sugg=piq2?piq2.engin:'';
  const cond2Sugg=_eq2.conducteur;
  const chefEq2Sugg=_eq2.chefEquipe;
  const eq2Sugg=_eq2.equipier;

  const enginOpts=function(sugg){
    return [''].concat(ASTR_CONFIG.engins||[]).map(function(e){
      const conflict=e?findActiveVehicleConflict(e,id):null;
      return '<option value="'+e+'"'+(e===sugg?' selected':'')+(conflict?' disabled':'')+'>'+(e||'\u2014 Aucun \u2014')+(conflict?' \u2014 D\u00e9j\u00e0 en intervention':'')+'</option>';
    }).join('');
  };

  // ── Équipage engin 1 ──
  function buildEquipage1(enginVal){
    const caHtml='<div style="margin-bottom:8px;background:#EEF2FF;border-radius:8px;padding:8px 10px;">'
      +'<div style="font-size:11px;font-weight:600;color:#3730A3;margin-bottom:2px;">Chef d\u2019agr\u00e8s</div>'
      +'<div style="font-size:12px;font-weight:700;">'+fullName(USERS.find(function(u){return u.l===CU.l;})||{prenom:CU.l,nom:''})+' <span style="font-size:10px;color:var(--t2);">(vous)</span></div>'
      +'</div>';
    return caHtml+buildDepartureCrewFields(enginVal,'eq1',{
      conducteur:cond1Sugg,chefdequipe:chefEq1Sugg,equipier:eq1Sugg
    },[CU.l]);
  }

  const u2=agr2?USERS.find(function(u){return u.l===agr2;}):null;

  // ── Équipage engin 2 (si 2ème chef) ──
  function buildEquipage2(enginVal){
    if(!agr2)return '';
    const ca2Html='<div style="margin-bottom:8px;background:#EEF2FF;border-radius:8px;padding:8px 10px;">'
      +'<div style="font-size:11px;font-weight:600;color:#3730A3;margin-bottom:2px;">Chef d\u2019agr\u00e8s</div>'
      +'<div style="font-size:12px;font-weight:700;">'+(u2?fullName(u2):agr2)+'</div>'
      +'</div>';
    return ca2Html+buildDepartureCrewFields(enginVal,'eq2',{
      conducteur:cond2Sugg,chefdequipe:chefEq2Sugg,equipier:eq2Sugg
    },[CU.l,agr2]);
  }

  const eq1Html=buildEquipage1(engin1Sugg);
  const eq2Html=buildEquipage2(engin2Sugg);

  const engin2Block=agr2?
    '<div style="margin-top:14px;border-top:2px solid var(--brd);padding-top:12px;">'
    +'<div style="font-size:12px;font-weight:700;color:var(--t);margin-bottom:8px;">&#x1F692; Engin 2 \u2014 '+(u2?fullName(u2):agr2)+'</div>'
    +'<div class="fg" style="margin-bottom:8px;"><div class="fgl">Engin engag\u00e9</div>'
    +'<select class="fi" id="pers-engin2" onchange="document.getElementById(\'eq2-body\').innerHTML=buildEquipage2Dyn(this.value);refreshEquipageSelects()">'+enginOpts(engin2Sugg)+'</select></div>'
    +'<div id="eq2-body">'+eq2Html+'</div></div>'
    :'';

  document.getElementById('mt').textContent='D\u00e9part en intervention';
  document.getElementById('mi').textContent=iv.n+' \u2014 '+iv.com;
  document.getElementById('mb').innerHTML=
    '<div>'
    +'<div style="background:#FEF0E7;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#854F0B;">'
    +'\u23F1\uFE0F Heure de d\u00e9part : <strong>'+heure+'</strong>'
    +(interruptedHandoff?' <span style="font-size:10px;font-weight:600;color:#B45309;">(départ repris de '+escHtml(interruptedHandoff.source.id)+')</span>':'')
    +(chained?' <span style="font-size:10px;font-weight:600;color:#7C3AED;">(enchaînée après l’intervention précédente)</span>':'')+'</div>'
    +'<div style="font-size:12px;font-weight:700;color:var(--t);margin-bottom:8px;">&#x1F692; Engin 1 \u2014 '+fullName(USERS.find(function(u){return u.l===CU.l;})||{prenom:CU.l,nom:''})+'</div>'
    +'<div class="fg" style="margin-bottom:8px;"><div class="fgl">Engin engag\u00e9</div>'
    +'<select class="fi" id="pers-engin" onchange="document.getElementById(\'eq1-body\').innerHTML=buildEquipage1Dyn(this.value);refreshEquipageSelects()">'+enginOpts(engin1Sugg)+'</select></div>'
    +'<div id="eq1-body">'+eq1Html+'</div>'
    +engin2Block
    +'<div class="brow" style="margin-top:12px;">'
    +'<button class="btn am sm" onclick="confirmerDepart(\''+id+'\')">&#x25B6; Confirmer le d\u00e9part</button>'
    +'<button class="btn sm" onclick="cM()">Annuler</button></div></div>';
  document.getElementById('mo').style.display='flex';
  // Initialiser les options après insertion du HTML
  setTimeout(function(){refreshEquipageSelects();},0);
  // Exposer buildEquipage1Dyn/2Dyn pour le onchange
  window._piqData={cond1Sugg,chefEq1Sugg,eq1Sugg,cond2Sugg,chefEq2Sugg,eq2Sugg,agr2,u2,CUl:CU.l,ivId:id};
}

function buildEquipage1Dyn(enginVal){
  const d=window._piqData||{};
  const caHtml='<div style="margin-bottom:8px;background:#EEF2FF;border-radius:8px;padding:8px 10px;">'
    +'<div style="font-size:11px;font-weight:600;color:#3730A3;margin-bottom:2px;">Chef d\u2019agr\u00e8s</div>'
    +'<div style="font-size:12px;font-weight:700;">'+fullName(USERS.find(function(u){return u.l===d.CUl;})||{prenom:d.CUl,nom:''})+' <span style="font-size:10px;color:var(--t2);">(vous)</span></div>'
    +'</div>';
  return caHtml+buildDepartureCrewFields(enginVal,'eq1',{
    conducteur:d.cond1Sugg,chefdequipe:d.chefEq1Sugg,equipier:d.eq1Sugg
  },[d.CUl]);
}

function buildEquipage2Dyn(enginVal){
  const d=window._piqData||{};
  if(!d.agr2)return '';
  const ca2Html='<div style="margin-bottom:8px;background:#EEF2FF;border-radius:8px;padding:8px 10px;">'
    +'<div style="font-size:11px;font-weight:600;color:#3730A3;margin-bottom:2px;">Chef d\u2019agr\u00e8s</div>'
    +'<div style="font-size:12px;font-weight:700;">'+(d.u2?fullName(d.u2):d.agr2)+'</div></div>';
  return ca2Html+buildDepartureCrewFields(enginVal,'eq2',{
    conducteur:d.cond2Sugg,chefdequipe:d.chefEq2Sugg,equipier:d.eq2Sugg
  },[d.CUl,d.agr2]);
}

function confirmerDepart(id){
  const iv=IVS.find(function(v){return v.id===id;});if(!iv)return;
  const interruptedHandoff=findInterruptedDepartureHandoff(CU.l,id);
  const chained=!interruptedHandoff&&!!_pendingNextInterventionStarts[id];
  const restartedAfterPending=iv._retourAttenteDepuis==='en-cours';
  const chainedPreviousId=iv._chainPreviousInterventionId||'';
  const heure=interruptedHandoff?interruptedHandoff.handoff.heure:(_pendingNextInterventionStarts[id]||getHHMM(N()));
  const engin1=document.getElementById('pers-engin')?.value||'';
  const engin2=document.getElementById('pers-engin2')?.value||'';
  const agr2=iv._agr2||'';
  // Tous les membres des deux equipages sont controles juste avant le depart.
  const eq1=readDepartureCrewFields(engin1,'eq1',CU.l);
  const eq2=agr2?readDepartureCrewFields(engin2,'eq2',agr2):[];
  const personnelLogins=eq1.concat(eq2).map(function(member){return member&&member.login;}).filter(Boolean);
  const conflict=validateOperationalDeparture(iv,engin1,engin2,personnelLogins);
  if(conflict){
    if(conflict.sameDeparture&&conflict.kind==='vehicle'){
      showToast('Le même véhicule ne peut pas être engagé deux fois sur la même intervention.','warn');
    }else if(conflict.sameDeparture){
      showToast('Le même agent ne peut pas occuper plusieurs places ou plusieurs véhicules sur le même départ.','warn');
    }else{
      showOperationalConflict(conflict.kind,conflict.value,conflict.iv);
    }
    return;
  }
  prepareInterventionRoute(iv);
  delete _pendingNextInterventionStarts[id];
  if(!iv.tl)iv.tl=[];
  iv.s='en-cours';iv.agr=CU.l;
  iv._hDebut=heure;
  if(!iv._hDebutReelle)iv._hDebutReelle=heure;
  if(!iv._hDebutInitiale)iv._hDebutInitiale=heure;
  if(interruptedHandoff){
    const source=interruptedHandoff.source,handoff=interruptedHandoff.handoff;
    iv._departureInheritedFromInterventionId=source.id;
    iv._departureInheritedDate=handoff.date||'';
    handoff.available=false;handoff.consumedBy=iv.id;handoff.consumedAt=getH(N());
  }
  // Compléter les infos des agents renfort (absents de USERS) pour l'affichage et le PDF
  const _renfortList=_getRenfortPersonnel();
  const _enrich=function(arr){arr.forEach(function(e){if(e&&e.login&&!USERS.find(function(u){return u.l===e.login;})){const rf=_renfortList.find(function(r){return r.login===e.login;});if(rf){e.renfort=true;e.nom=rf.nom;e.prenom=rf.prenom;e.grade=rf.grade;e.caserneNom=rf.caserneNom;}}});};
  _enrich(eq1);_enrich(eq2);
  const previous=chainedPreviousId?IVS.find(function(candidate){return candidate.id===chainedPreviousId;}):null;
  const sameCrew=!!(chained&&previous&&interventionCrewSignature(previous)&&interventionCrewSignature(previous)===interventionCrewSignature(iv,eq1,eq2));
  if(sameCrew){
    iv._startLockedByChain=true;
    iv._chainedFromInterventionId=previous.id;
  }else{
    delete iv._startLockedByChain;
    delete iv._chainedFromInterventionId;
  }
  delete iv._chainPreviousInterventionId;
  iv._equipage1=eq1;
  iv._engin1=engin1;
  iv._engin1RoleConfig=JSON.parse(JSON.stringify(getEnginRoles(engin1)));
  iv._equipage2=eq2.length?eq2:null;
  iv._engin2=engin2||null;
  iv._engin2RoleConfig=engin2?JSON.parse(JSON.stringify(getEnginRoles(engin2))):null;
  if(engin1)iv.eng=engin1;
  const agr2Label=agr2?(function(){const u=USERS.find(function(u){return u.l===agr2;});return u?' + '+fullName(u)+' (2\u00e8me)':' + '+agr2;})():'';
  const persLabel=' ['+eq1.concat(eq2).map(function(e){const u=USERS.find(function(x){return x.l===e.login;});return e.role+': '+(u?fullName(u):e.login);}).join(', ')+']';
  pushTL(iv,'en-cours',CU.l+agr2Label+persLabel,
    interruptedHandoff?'Départ à '+heure+' repris de l’intervention '+interruptedHandoff.source.id:(restartedAfterPending?'Nouveau départ à '+heure+' après retour en attente':(chained?'Début enchaîné à '+heure+' après l’intervention précédente':'Départ réel à '+heure)));
  delete iv._retourAttenteDepuis;
  assignInterventionNumbersAtStart(iv);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);cM();rI();rStatsHeader(); // push immédiat : changement de statut partagé
  setTimeout(function(){oM(id);},80);
}

// ── Correction requérant ──
function editRequerant(id){
  const iv=IVS.find(function(v){return v.id===id;});if(!iv)return;
  document.getElementById('mt').textContent='Corriger le requ\u00e9rant';
  document.getElementById('mi').textContent=interventionDisplayCallNumber(iv);
  const initBanner=iv._reqInit
    ?'<div style="background:#FEF9C3;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:#713F12;">'
      +'Informations initiales conserv\u00e9es : <strong>'+iv._reqInit+'</strong>'+(iv._telInit?' \u00b7 '+iv._telInit:'')+'</div>'
    :'';
  document.getElementById('mb').innerHTML=
    '<div>'+initBanner
    +'<div class="fg"><div class="fgl">Nom du requ\u00e9rant</div>'
    +'<input class="fi" type="text" id="edit-req" value="'+(iv.req||'')+'"/></div>'
    +'<div class="fg"><div class="fgl">T\u00e9l\u00e9phone</div>'
    +'<input class="fi" type="tel" id="edit-tel" value="'+(iv.tel||'')+'"/></div>'
    +'<div class="brow">'
    +'<button class="btn pr sm" onclick="saveRequerant(\''+id+'\')">&#x1F4BE; Enregistrer</button>'
    +'<button class="btn sm" onclick="cM()">Annuler</button></div></div>';
  document.getElementById('mo').style.display='flex';
}
function saveRequerant(id){
  const iv=IVS.find(function(v){return v.id===id;});if(!iv)return;
  const newReq=document.getElementById('edit-req').value.trim();
  const newTel=document.getElementById('edit-tel').value.trim();
  if(!newReq){showToast('Le nom du requérant est obligatoire.','warn');return;}
  const notes=[];
  if((iv.req||'')!==newReq)notes.push('Requérant : '+(iv.req||'—')+' → '+newReq);
  if((iv.tel||'')!==newTel)notes.push('Téléphone : '+(iv.tel||'—')+' → '+(newTel||'—'));
  if(!iv._reqInit){iv._reqInit=iv.req;iv._telInit=iv.tel||'';}
  iv.req=newReq;iv.tel=newTel;
  if(Array.isArray(iv.tels)){if(iv.tels.length)iv.tels[0]=newTel;else if(newTel)iv.tels=[newTel];}
  iv.tl.push({s:'modif',h:getH(N()),who:CU.l,note:notes.length?notes.join(' ; '):'Requérant corrigé'});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);cM(); // push immédiat : sinon la correction est écrasée au prochain pull
  setTimeout(function(){oM(id);},80);
}

// ────────────────── INTERVENTIONS PASSÉES AU MÊME LIEU ──────────────────
// Affiche les interventions déjà enregistrées à la MÊME ADRESSE EXACTE et du
// MÊME TYPE, pour savoir si on est déjà intervenu ici pour la même chose.
// Réservé aux administrateurs.
function showInterventionsLiees(id){
  if(!isAdminModeActive()){showToast('Consultation réservée aux administrateurs.','warn');return;}
  const iv=IVS.find(function(v){return v.id===id;})||PILP_IVS.find(function(v){return v.id===id;});
  if(!iv)return;
  const adrRef=normalizeInterventionAddressForMatch(iv.addr), natRef=nm(iv.n), communeRef=nm(iv.com);
  // Même adresse exacte ET même nature d'intervention (hors celle consultée).
  const toutes=[].concat(IVS||[],PILP_IVS||[]).filter(function(x){return x.id!==id;});
  const memeLieuType=toutes.filter(function(x){return adrRef&&sameInterventionAddress(x.addr,iv.addr)&&nm(x.com)===communeRef&&nm(x.n)===natRef;});
  const fmtLigne=function(x){
    const stLbl={'en-attente':'En attente','selectionne':'Sélectionné','en-cours':'En cours','terminee':'Terminée','avis-passage':'Avis de passage','annulee':'Annulée'}[x.s]||x.s;
    return '<div style="background:#fff;border:1px solid var(--brd);border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer;" onclick="oM(\''+x.id+'\')">'
      +'<div style="font-weight:600;font-size:13px;">'+escHtml(x.n||'')+' <span style="font-size:10px;color:var(--t2);font-weight:400;">('+escHtml(stLbl)+')</span></div>'
      +'<div style="font-size:12px;color:var(--t2);">&#x1F4C5; '+escHtml((x.h||'').slice(0,10))+' &#x00B7; &#x1F4CD; '+escHtml(x.addr||'')+', '+escHtml(x.com||'')+'</div>'
      +(x.req?'<div style="font-size:11px;color:var(--t2);">Requérant : '+escHtml(x.req)+'</div>':'')
      +'</div>';
  };
  let html='<div>';
  if(!memeLieuType.length){
    html+='<div style="font-size:13px;color:var(--t2);padding:12px 0;">Aucune autre intervention du même type à cette adresse.</div>';
  } else {
    html+='<div style="font-size:12px;font-weight:700;color:#0369A1;margin:4px 0 8px;">&#x1F4CD; Même adresse et même type ('+memeLieuType.length+')</div>';
    html+=memeLieuType.map(fmtLigne).join('');
  }
  html+='<div class="brow" style="margin-top:10px;"><button class="btn sm" onclick="oM(\''+id+'\')">Retour</button></div></div>';
  document.getElementById('mt').textContent='Déjà intervenu ici ?';
  document.getElementById('mi').textContent=(iv.n||'')+' — '+(iv.addr||'')+', '+(iv.com||'');
  document.getElementById('mb').innerHTML=html;
  document.getElementById('mo').style.display='flex';
}

// ────────────────── COMPLÉMENT D'INFORMATION ──────────────────
// Permet d'ajouter un commentaire, des telephones et les disponibilites du
// requerant apres l'enregistrement initial de l'appel.
function readComplementPhones(){
  const seen=new Set();
  return Array.from(document.querySelectorAll('#compl-phone-list [data-compl-phone]')).map(function(input){return String(input.value||'').trim();}).filter(function(phone){if(!phone||seen.has(phone))return false;seen.add(phone);return true;});
}
function renderComplementPhones(phones){
  const box=document.getElementById('compl-phone-list');if(!box)return;
  const values=Array.isArray(phones)&&phones.length?phones:[''];
  box.innerHTML=values.map(function(phone,index){
    const action=index===0
      ?'<button type="button" class="appel-phone-add" onclick="addComplementPhone()" aria-label="Ajouter un numéro" title="Ajouter un numéro">+</button>'
      :'<button type="button" class="appel-phone-remove" onclick="removeComplementPhone('+index+')" aria-label="Supprimer ce numéro" title="Supprimer ce numéro">−</button>';
    return '<div class="appel-phone-row"><input class="fi" id="compl-phone-'+index+'" type="tel" data-compl-phone value="'+escHtml(phone)+'" placeholder="06 XX XX XX XX">'+action+'</div>';
  }).join('');
  registerMobileModalFields(box);
}
function addComplementPhone(){
  const values=Array.from(document.querySelectorAll('#compl-phone-list [data-compl-phone]')).map(function(input){return input.value||'';});
  values.push('');renderComplementPhones(values);
  const field=document.getElementById('compl-phone-'+(values.length-1));if(field)field.focus();
}
function removeComplementPhone(index){
  const values=Array.from(document.querySelectorAll('#compl-phone-list [data-compl-phone]')).map(function(input){return input.value||'';});
  values.splice(index,1);renderComplementPhones(values);
}
function complementAvailabilityPeriods(iv){
  const dispo=iv&&iv.reqDispo;
  if(dispo&&Array.isArray(dispo.periods)&&dispo.periods.length)return dispo.periods.map(function(period){return Object.assign({},period);});
  if(dispo&&Array.isArray(dispo.days)&&dispo.days.length)return dispo.days.map(function(day){return{state:dispo.state==='mixte'?'disponible':dispo.state,day:day,mode:dispo.mode||'journee',h1:dispo.h1||'',h2:dispo.h2||''};});
  return[{state:'',day:'',mode:'journee',h1:'',h2:''}];
}
function complementAvailabilityPeriodHTML(period,index){
  period=period||{};
  const selected=function(value,current){return value===current?' selected':'';};
  const action=index===0
    ?'<button type="button" class="appel-phone-add" onclick="addComplementAvailabilityPeriod()" aria-label="Ajouter une disponibilité" title="Ajouter une disponibilité">+</button>'
    :'<button type="button" class="appel-phone-remove" onclick="removeComplementAvailabilityPeriod('+index+')" aria-label="Supprimer cette disponibilité" title="Supprimer cette disponibilité">−</button>';
  return '<div class="appel-dispo-period" data-compl-dispo-period>'
    +'<div class="appel-dispo-period-grid"><div><div class="fgl">État</div><select class="fi" id="compl-dispo-state-'+index+'" data-compl-dispo-state onchange="toggleComplementAvailability(this)"><option value=""'+selected('',period.state||'')+'>Non précisé</option><option value="disponible"'+selected('disponible',period.state)+'>Disponible</option><option value="indisponible"'+selected('indisponible',period.state)+'>Indisponible</option></select></div>'
    +'<div><div class="fgl">Jour concerné</div><div class="appel-day-row"><input class="fi" id="compl-dispo-day-'+index+'" type="date" data-compl-dispo-day value="'+escHtml(period.day||'')+'">'+action+'</div></div></div>'
    +'<div class="appel-dispo-period-grid appel-dispo-time-grid"><div><div class="fgl">Précision horaire</div><select class="fi" id="compl-dispo-mode-'+index+'" data-compl-dispo-mode onchange="toggleComplementAvailability(this)"><option value="journee"'+selected('journee',period.mode||'journee')+'>Toute la journée</option><option value="avant"'+selected('avant',period.mode)+'>Avant une heure</option><option value="entre"'+selected('entre',period.mode)+'>Entre deux heures</option><option value="apres"'+selected('apres',period.mode)+'>Après une heure</option></select></div>'
    +'<div data-compl-dispo-hours><div class="fgl" data-compl-dispo-h1-label>Horaire</div><div class="appel-dispo-hours-row"><input class="fi" id="compl-dispo-h1-'+index+'" type="time" data-compl-dispo-h1 value="'+escHtml(period.h1||'')+'"><div data-compl-dispo-h2-wrap><input class="fi" id="compl-dispo-h2-'+index+'" type="time" data-compl-dispo-h2 value="'+escHtml(period.h2||'')+'" aria-label="Heure de fin"></div></div></div></div></div>';
}
function renderComplementAvailabilityPeriods(periods){
  const box=document.getElementById('compl-dispo-list');if(!box)return;
  const values=Array.isArray(periods)&&periods.length?periods:[{state:'',day:'',mode:'journee',h1:'',h2:''}];
  box.innerHTML=values.map(complementAvailabilityPeriodHTML).join('');
  box.querySelectorAll('[data-compl-dispo-period]').forEach(toggleComplementAvailability);
  registerMobileModalFields(box);
}
function readComplementAvailabilityPeriods(){
  return Array.from(document.querySelectorAll('#compl-dispo-list [data-compl-dispo-period]')).map(function(row){return{
    state:row.querySelector('[data-compl-dispo-state]')?.value||'',day:row.querySelector('[data-compl-dispo-day]')?.value||'',mode:row.querySelector('[data-compl-dispo-mode]')?.value||'journee',
    h1:row.querySelector('[data-compl-dispo-h1]')?.value||'',h2:row.querySelector('[data-compl-dispo-h2]')?.value||''
  };});
}
function addComplementAvailabilityPeriod(){
  const periods=readComplementAvailabilityPeriods();periods.push({state:'',day:'',mode:'journee',h1:'',h2:''});renderComplementAvailabilityPeriods(periods);
  const field=document.getElementById('compl-dispo-state-'+(periods.length-1));if(field)field.focus();
}
function removeComplementAvailabilityPeriod(index){const periods=readComplementAvailabilityPeriods();periods.splice(index,1);renderComplementAvailabilityPeriods(periods);}
function toggleComplementAvailability(source){
  const row=source&&source.closest?source.closest('[data-compl-dispo-period]'):source;if(!row)return;
  const state=row.querySelector('[data-compl-dispo-state]')?.value||'',mode=row.querySelector('[data-compl-dispo-mode]')?.value||'journee';
  const modeSelect=row.querySelector('[data-compl-dispo-mode]'),hours=row.querySelector('[data-compl-dispo-hours]'),second=row.querySelector('[data-compl-dispo-h2-wrap]'),label=row.querySelector('[data-compl-dispo-h1-label]'),hoursRow=row.querySelector('.appel-dispo-hours-row');
  if(modeSelect)modeSelect.disabled=!state;
  if(hours)hours.style.display=state&&['avant','entre','apres'].includes(mode)?'block':'none';
  if(second)second.style.display=mode==='entre'?'':'none';
  if(hoursRow)hoursRow.classList.toggle('single',mode!=='entre');
  if(label)label.textContent=mode==='avant'?'Avant':mode==='apres'?'Après':'À partir de';
}
function validateComplementAvailability(periods){
  const started=periods.filter(function(period){return period.state||period.day||period.h1||period.h2;});
  for(let index=0;index<started.length;index++){
    const period=started[index],prefix=started.length>1?'Disponibilité '+(index+1)+' : ':'';
    if(!period.state)return prefix+'précisez si le requérant est disponible ou indisponible.';
    if(!period.day)return prefix+'renseignez le jour concerné.';
    if(['avant','entre','apres'].includes(period.mode)&&!period.h1)return prefix+"renseignez l'horaire.";
    if(period.mode==='entre'&&!period.h2)return prefix+"renseignez l'heure de fin.";
    if(period.mode==='entre'&&period.h2<=period.h1)return prefix+"l'heure de fin doit être après l'heure de début.";
  }
  return'';
}
function reqAvailabilityFromPeriods(periods){
  const filled=periods.filter(function(period){return period.state&&period.day;});if(!filled.length)return null;
  const states=Array.from(new Set(filled.map(function(period){return period.state;}))),first=filled[0];
  return{state:states.length===1?states[0]:'mixte',days:filled.map(function(period){return period.day;}),mode:first.mode,h1:first.h1,h2:first.h2,periods:filled,label:filled.map(reqAvailabilityPeriodLabel).join(' ; ')};
}
function showComplementModal(id){
  const iv=IVS.find(function(v){return v.id===id;});if(!iv)return;
  if(!(hasRight('Interventions')||isAgres()||isChef()||isAdminModeActive())){showToast('Action réservée aux personnes ayant le droit Interventions.','warn');return;}
  document.getElementById('mt').textContent='Complément d\u2019information';
  document.getElementById('mi').textContent=iv.n+' — '+(iv.com||'');
  document.getElementById('mb').innerHTML=
    '<div>'
    +'<div style="font-size:12px;color:var(--t2);margin-bottom:10px;">Mettez à jour les informations transmises après l\u2019enregistrement de l\u2019appel. Les changements seront horodatés.</div>'
    +'<div class="fg"><div class="fgl">Téléphone(s)</div><div id="compl-phone-list"></div></div>'
    +'<div class="fg"><div class="fgl">Disponibilité du requérant <span style="font-size:10px;color:var(--t2);">(optionnel)</span></div><div id="compl-dispo-list"></div></div>'
    +'<div class="fg"><div class="fgl">Information complémentaire <span style="font-size:10px;color:var(--t2);">(optionnel)</span></div>'
    +'<textarea class="fi" id="compl-info-val" rows="4" placeholder="ex. Le requérant signale que le nid est en hauteur, prévoir une échelle."></textarea></div>'
    +'<div id="compl-info-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>'
    +'<div class="brow">'
    +'<button class="btn pr sm" onclick="saveComplementInfo(\''+id+'\')">&#x1F4BE; Enregistrer les informations</button>'
    +'<button class="btn sm" onclick="deactivateMobileModalField();oM(\''+id+'\')">Retour</button></div></div>';
  renderComplementPhones(getInterventionPhones(iv));
  renderComplementAvailabilityPeriods(complementAvailabilityPeriods(iv));
  openModalAtTop('compl-info-val');
  activateMobileModalField('compl-info-val');
  registerMobileModalFields(document.getElementById('mb'));
}
function saveComplementInfo(id){
  const iv=IVS.find(function(v){return v.id===id;});if(!iv)return;
  const txt=(document.getElementById('compl-info-val').value||'').trim();
  const err=document.getElementById('compl-info-err');
  const phones=readComplementPhones();
  if(!phones.length){err.style.display='block';err.textContent='Conservez au moins un numéro de téléphone.';return;}
  const periods=readComplementAvailabilityPeriods(),availabilityError=validateComplementAvailability(periods);
  if(availabilityError){err.style.display='block';err.textContent=availabilityError;return;}
  const reqDispo=reqAvailabilityFromPeriods(periods),oldPhones=getInterventionPhones(iv),oldLabel=iv.reqDispo&&iv.reqDispo.label||'',newLabel=reqDispo&&reqDispo.label||'';
  const phonesChanged=JSON.stringify(oldPhones)!==JSON.stringify(phones),availabilityChanged=oldLabel!==newLabel;
  if(!txt&&!phonesChanged&&!availabilityChanged){err.style.display='block';err.textContent='Aucune nouvelle information à enregistrer.';return;}
  const notes=[];
  if(txt)notes.push(txt);
  if(phonesChanged)notes.push('Téléphone(s) mis à jour : '+phones.join(' · '));
  if(availabilityChanged)notes.push(reqDispo?'Disponibilité du requérant : '+reqDispo.label:'Disponibilité du requérant supprimée');
  iv.tel=phones[0]||'';iv.tels=phones;iv.reqDispo=reqDispo;
  if(!iv._appelDetails||typeof iv._appelDetails!=='object')iv._appelDetails={};
  if(reqDispo)iv._appelDetails['Disponibilité du requérant']=reqDispo.label;else delete iv._appelDetails['Disponibilité du requérant'];
  if(!Array.isArray(iv.tl))iv.tl=[];
  iv.tl.push({s:'info-compl',h:getH(N()),who:CU.l,note:notes.join(' ; ')});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  cM();rI();
  setTimeout(function(){oM(id);},80);
}

// ────────────────── RELÈVE DE PERSONNEL ──────────────────
function showReleveModal(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const heure=getHHMM(N());
  // Équipage actuel (dernier équipage actif)
  const releves=iv._releves||[];
  const equipActuel=releves.length?releves[releves.length-1].nouvelEquipage:(iv._equipage1||[]);

  document.getElementById('mt').textContent='Relève de personnel';
  document.getElementById('mi').textContent=iv.n+' — '+iv.com;

  // Construire les sélecteurs par rôle pour les remplaçants
  function agentOpts(excludeLogins){
    return '<option value="">\u2014 Inchangé \u2014</option>'
      +sortByGradeThenName(USERS.filter(function(u){
        return !excludeLogins.includes(u.l)&&!findActivePersonnelConflict(u.l,id);
      })).map(function(u){
        const eq=getEquipeOfUser(u.l);
        return '<option value="'+u.l+'">'+fullName(u)+' ('+gradeAbbr(u.grade)+(eq?', '+eq.nom:'')+')' +'</option>';
      }).join('');
  }

  const currentLogins=equipActuel.map(e=>e.login);
  const rolesHtml=equipActuel.map(function(e,i){
    const u=USERS.find(x=>x.l===e.login);
    const uName=u?fullName(u):e.login;
    return '<div style="margin-bottom:10px;background:var(--bg);border-radius:8px;padding:8px 10px;">'
      +'<div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px;">'+e.role+'</div>'
      +'<div style="font-size:12px;margin-bottom:4px;">Actuel : <strong>'+uName+'</strong></div>'
      +'<select class="fi" id="releve-role-'+i+'" style="font-size:12px;">'
      +agentOpts(currentLogins.filter((_,j)=>j!==i))
      +'</select></div>';
  }).join('');

  document.getElementById('mb').innerHTML=
    '<div>'
    +'<div style="background:#DBEAFE;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#1D4ED8;">'
    +'&#x1F504; Heure de relève enregistrée automatiquement : <strong>'+heure+'</strong></div>'
    +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Sélectionner les remplaçants :</div>'
    +rolesHtml
    +'<div class="brow" style="margin-top:10px;">'
    +'<button class="btn sm" style="background:#0369A1;color:#fff;" onclick="validerReleve(\''+id+'\')">&#x1F504; Valider la relève</button>'
    +'<button class="btn sm" onclick="oM(\''+id+'\')" >Retour</button>'
    +'</div></div>';
  document.getElementById('mo').style.display='flex';
}

function validerReleve(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const heure=getHHMM(N());
  const releves=iv._releves||[];
  const equipActuel=releves.length?releves[releves.length-1].nouvelEquipage:(iv._equipage1||[]);

  const ancienEquipage=[];
  const nouvelEquipage=[];
  let hasChange=false;

  equipActuel.forEach(function(e,i){
    const sel=document.getElementById('releve-role-'+i);
    const newLogin=sel?sel.value:'';
    if(newLogin&&newLogin!==e.login){
      // Ce rôle est remplacé
      ancienEquipage.push({role:e.role,login:e.login,hDepart:heure,hRetour:null});
      nouvelEquipage.push({role:e.role,login:newLogin,hDebut:heure});
      hasChange=true;
    } else {
      // Inchangé — reste dans le nouvel équipage
      nouvelEquipage.push({role:e.role,login:e.login,hDebut:e.hDebut||iv._hDebut});
    }
  });

  if(!hasChange){showToast('Aucun remplacement sélectionné.','warn');return;}

  const newLogins=nouvelEquipage.map(function(member){return member.login;}).filter(Boolean);
  const duplicateLogin=newLogins.find(function(login,index){return newLogins.indexOf(login)!==index;});
  if(duplicateLogin){
    showToast('Le même agent ne peut pas occuper plusieurs places dans le véhicule.','warn');
    return;
  }
  for(const login of newLogins){
    const conflict=findActivePersonnelConflict(login,id);
    if(conflict){showOperationalConflict('personnel',login,conflict);return;}
  }

  if(!iv._releves)iv._releves=[];
  iv._releves.push({hReleve:heure,ancienEquipage,nouvelEquipage});
  iv.tl.push({s:'releve',h:getH(N()),who:CU.l,
    note:'Relève : '+ancienEquipage.map(function(e){
      const ua=USERS.find(x=>x.l===e.login);
      const nb=nouvelEquipage.find(x=>x.role===e.role&&x.login!==e.login);
      const un=nb?USERS.find(x=>x.l===nb.login):null;
      return e.role+' : '+(ua?fullName(ua):e.login)+' → '+(un?fullName(un):nb?nb.login:'?');
    }).join(', ')});

  saveData();cM();
  setTimeout(function(){oM(id);},80);
  showToast('Relève enregistrée à '+heure,'success');
}

function confirmerRetour(ivId,releveIdx,login){
  const iv=IVS.find(v=>v.id===ivId);if(!iv||!iv._releves)return;
  const releve=iv._releves[releveIdx];if(!releve)return;
  const heure=getHHMM(N());
  // Enregistrer le retour pour TOUS les membres sans hRetour de cette relève
  const enAttente=releve.ancienEquipage.filter(e=>!e.hRetour);
  enAttente.forEach(function(membre){membre.hRetour=heure;});
  const noms=enAttente.map(function(e){const u=USERS.find(x=>x.l===e.login);return u?fullName(u):e.login;}).join(', ');
  iv.tl.push({s:'releve',h:getH(N()),who:CU.l,
    note:'Retour caserne : '+noms+' à '+heure});
  saveData();
  setTimeout(function(){oM(ivId);},80);
  showToast('Retour caserne enregistré à '+heure+' pour '+enAttente.length+' personne'+(enAttente.length>1?'s':''),'success');
}

// ────────────────── DEMANDE DE RENFORT UT ──────────────────
function showRenfortInterneModal(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  const heure=getHHMM(N());

  // Agents déjà engagés sur cette intervention (équipage actuel + relèves actives)
  const dejaPris=new Set();
  if(iv._equipage1)iv._equipage1.forEach(function(e){dejaPris.add(e.login);});
  if(iv._equipage2)iv._equipage2.forEach(function(e){dejaPris.add(e.login);});
  if(iv._releves){
    const derniereReleve=iv._releves[iv._releves.length-1];
    if(derniereReleve)derniereReleve.nouvelEquipage.forEach(function(e){dejaPris.add(e.login);});
  }
  if(iv.agr)dejaPris.add(iv.agr);

  // Agents disponibles (non engagés)
  const disponibles=sortByGradeThenName(USERS.filter(function(u){
    return !dejaPris.has(u.l)&&!findActivePersonnelConflict(u.l,ivId);
  }));

  if(!disponibles.length){showToast('Aucun agent disponible dans la caserne.','warn');return;}

  const agentsHtml=disponibles.map(function(u){
    const eq=getEquipeOfUser(u.l);
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px;border:1px solid var(--brd);border-radius:8px;cursor:pointer;margin-bottom:4px;">'
      +'<input type="checkbox" class="renfort-int-chk" value="'+u.l+'" style="accent-color:#0369A1;width:16px;height:16px;"/>'
      +'<span style="flex:1;font-size:12px;font-weight:500;">'+fullName(u)+'</span>'
      +'<span style="font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+(eq?' · '+eq.nom:'')+'</span>'
      +'</label>';
  }).join('');

  document.getElementById('mt').textContent='Renfort interne — Caserne';
  document.getElementById('mi').textContent=iv.n+' \u2014 '+iv.com;
  document.getElementById('mb').innerHTML=
    '<div>'
    +'<div style="background:#EFF6FF;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#1D4ED8;">'
    +'&#x23F1;\uFE0F Heure de renfort : <strong>'+heure+'</strong></div>'
    +'<div style="display:flex;gap:8px;margin-bottom:10px;">'
    +'<button class="btn sm" style="font-size:11px;" onclick="document.querySelectorAll(\'.renfort-int-chk\').forEach(c=>c.checked=true)">Tout sélectionner</button>'
    +'<button class="btn sm" style="font-size:11px;" onclick="document.querySelectorAll(\'.renfort-int-chk\').forEach(c=>c.checked=false)">Tout décocher</button>'
    +'</div>'
    +'<div style="max-height:280px;overflow-y:auto;">'+agentsHtml+'</div>'
    +'<div class="brow" style="margin-top:10px;">'
    +'<button class="btn sm" style="background:#0369A1;color:#fff;" onclick="confirmerRenfortInterne(\''+ivId+'\')">&#x1F465; Ajouter au renfort</button>'
    +'<button class="btn sm" onclick="oM(\''+ivId+'\')" >Retour</button>'
    +'</div></div>';
  document.getElementById('mo').style.display='flex';
}

function confirmerRenfortInterne(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  const heure=getHHMM(N());
  const checked=Array.from(document.querySelectorAll('.renfort-int-chk:checked')).map(function(c){return c.value;});
  if(!checked.length){showToast('Aucun agent sélectionné.','warn');return;}
  for(const login of checked){
    const conflict=findActivePersonnelConflict(login,ivId);
    if(conflict){showOperationalConflict('personnel',login,conflict);return;}
  }

  // Ajouter comme relève interne
  if(!iv._releves)iv._releves=[];
  const releves=iv._releves;
  const equipActuel=releves.length?releves[releves.length-1].nouvelEquipage:(iv._equipage1||[]);

  // Déterminer les rôles pour les renforts (à partir du rôle libre suivant)
  const rolesVtu=['Chef d\u2019agr\u00e8s','Conducteur','\u00c9quipier'];
  const rolesDejaOccupes=equipActuel.map(function(e){return e.role;});
  const nouveaux=checked.map(function(login,i){
    const roleLibre=rolesVtu.find(function(r){return !rolesDejaOccupes.includes(r);})||'\u00c9quipier '+(i+2);
    rolesDejaOccupes.push(roleLibre);
    return {role:roleLibre,login:login,hDebut:heure,renfortInterne:true};
  });

  iv._releves.push({
    hReleve:heure,
    isRenfortInterne:true,
    ancienEquipage:[],
    nouvelEquipage:[...equipActuel,...nouveaux]
  });

  iv.tl.push({s:'releve',h:getH(N()),who:CU.l,
    note:'Renfort interne : '+checked.map(function(l){const u=USERS.find(x=>x.l===l);return u?fullName(u):l;}).join(', ')});

  saveData();cM();
  setTimeout(function(){oM(ivId);},80);
  showToast('Renfort interne ajout\u00e9 \u00e0 '+heure,'success');
}

function showRenfortModal(ivId,forcePersonnel){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  // Si l'utilisateur n'est pas chef d'agrès, il ne peut demander qu'un renfort personnel
  if(forcePersonnel===undefined)forcePersonnel=!(isAgres()||isChef()||hasRight('Administration'));
  const autresCasernes=CASERNES.filter(function(c){return c.id!==CURRENT_CASERNE_ID;});
  if(!autresCasernes.length){showToast('Aucune autre caserne disponible.','warn');return;}

  const caseCheckboxes=autresCasernes.map(function(c){
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px;border:1px solid var(--brd);border-radius:8px;cursor:pointer;margin-bottom:4px;">'
      +'<input type="checkbox" class="renfort-cas-chk" value="'+c.id+'" style="accent-color:#7C3AED;width:16px;height:16px;"/>'
      +'<span style="font-size:12px;font-weight:500;">'+c.nom+'</span>'
      +'</label>';
  }).join('');

  document.getElementById('mt').textContent='Demande de Renfort UT';
  document.getElementById('mi').textContent=iv.n+' \u2014 '+iv.com;
  document.getElementById('mb').innerHTML=
    '<div>'
    +(forcePersonnel
      ?'<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#5B21B6;">&#x1F465; <strong>Renfort personnel</strong> \u2014 Personnel uniquement.<div style="font-size:10px;color:var(--t2);margin-top:2px;">Le renfort complet (camion + \u00e9quipage) est r\u00e9serv\u00e9 au chef d\u2019agr\u00e8s.</div><input type="hidden" name="renfort-type" value="personnel"/></div>'
      :'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">'
    +'<label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid #7C3AED;border-radius:10px;cursor:pointer;background:#F5F3FF;" id="lbl-renfort-complet">'
    +'<input type="radio" name="renfort-type" value="complet" style="accent-color:#7C3AED;" onchange="updateRenfortType()" checked/>'
    +'<span><div style="font-size:12px;font-weight:600;color:#7C3AED;">&#x1F692; Renfort complet</div><div style="font-size:10px;color:var(--t2);">Camion + \u00e9quipage</div></span>'
    +'</label>'
    +'<label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--brd);border-radius:10px;cursor:pointer;" id="lbl-renfort-personnel">'
    +'<input type="radio" name="renfort-type" value="personnel" style="accent-color:#7C3AED;" onchange="updateRenfortType()"/>'
    +'<span><div style="font-size:12px;font-weight:600;color:var(--t);">&#x1F465; Renfort personnel</div><div style="font-size:10px;color:var(--t2);">Personnel uniquement</div></span>'
    +'</label>'
    +'</div>')
    +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Caserne(s) destinataire(s) :</div>'
    +'<div id="renfort-cas-list">'+caseCheckboxes+'</div>'
    +'<div id="renfort-note-block" style="margin-top:10px;">'
    +'<div class="fgl">Message / précision <span style="font-size:10px;color:var(--t2);font-weight:400;">(optionnel)</span></div>'
    +'<textarea class="fi" id="renfort-note" rows="2" placeholder="Ex: besoin d\u2019un conducteur, demande urgente..." style="resize:vertical;"></textarea>'
    +'</div>'
    +'<div class="brow" style="margin-top:12px;">'
    +'<button class="btn sm" style="background:#7C3AED;color:#fff;" onclick="envoyerRenfort(\''+ivId+'\')">&#x1F4E2; Envoyer la demande</button>'
    +'<button class="btn sm" onclick="oM(\''+ivId+'\')" >Retour</button>'
    +'</div></div>';
  document.getElementById('mo').style.display='flex';
}

function updateRenfortType(){
  const type=document.querySelector('input[name="renfort-type"]:checked')?.value;
  const lblC=document.getElementById('lbl-renfort-complet');
  const lblP=document.getElementById('lbl-renfort-personnel');
  if(lblC)lblC.style.borderColor=type==='complet'?'#7C3AED':'var(--brd)';
  if(lblC)lblC.style.background=type==='complet'?'#F5F3FF':'';
  if(lblP)lblP.style.borderColor=type==='personnel'?'#7C3AED':'var(--brd)';
  if(lblP)lblP.style.background=type==='personnel'?'#F5F3FF':'';
}

function envoyerRenfort(ivId){
  const iv=IVS.find(v=>v.id===ivId);if(!iv)return;
  const checkedType=document.querySelector('input[name="renfort-type"]:checked')?.value;
  const hiddenType=document.querySelector('input[type="hidden"][name="renfort-type"]')?.value;
  const type=checkedType||hiddenType||'complet';
  const note=document.getElementById('renfort-note')?.value.trim()||'';
  const destinataires=Array.from(document.querySelectorAll('.renfort-cas-chk:checked')).map(function(c){return c.value;});
  if(!destinataires.length){showToast('S\u00e9lectionne au moins une caserne.','warn');return;}
  const heure=getHHMM(N());
  const caserneSource=CC();
  const renfortId='renfort_'+Date.now();
  const renfort={
    id:renfortId,
    ivId:ivId,
    ivNature:iv.n,
    ivCommune:iv.com,
    ivAdresse:iv.adr||'',
    type:type,
    hDemande:heure,
    hDebut:null,
    hFin:null,
    caserneSource:CURRENT_CASERNE_ID,
    caserneSourceNom:caserneSource?caserneSource.nom:'',
    note:note,
    statut:'en-attente', // en-attente | accepte | en-cours | termine | refuse
    equipageRendort:null,
  };
  // Envoyer à chaque caserne destinataire
  const _renfortRecords=[];
  destinataires.forEach(function(cid){
    if(!CASERNE_DATA[cid])initCaserneData(cid);
    if(!CASERNE_DATA[cid].renforts)CASERNE_DATA[cid].renforts=[];
    const renfortDest={...renfort,caserneDest:cid};
    CASERNE_DATA[cid].renforts.push(renfortDest);
    // En mode records : préparer l'enregistrement à pousser vers la caserne destinataire
    if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcId==='function'){
      _renfortRecords.push({id:_rcId(cid,'renfort',renfortDest.id),caserne:cid,type:'renfort',data:renfortDest,deleted:false});
    }
  });
  // Pousser explicitement ces demandes vers Supabase (sinon elles ne partent pas,
  // car la synchro ne pousse normalement que la caserne active de l'émetteur)
  if(_renfortRecords.length&&typeof _rcPushRecords==='function'){_rcPushRecords(_renfortRecords);}
  // Garder trace dans l'intervention
  if(!iv._renforts)iv._renforts=[];
  iv._renforts.push({id:renfortId,type,destinataires,hDemande:heure,note,statut:'en-attente'});
  iv.tl.push({s:'renfort',h:getH(N()),who:CU.l,
    note:'Demande de renfort '+( type==='complet'?'complet (camion+\u00e9quipage)':'personnel')
      +' vers : '+destinataires.map(function(cid){const c=CASERNES.find(x=>x.id===cid);return c?c.nom:cid;}).join(', ')});
  saveData();cM();
  setTimeout(function(){oM(ivId);},80);
  showToast('Demande de renfort envoy\u00e9e \u00e0 '+destinataires.length+' caserne(s)','success');
}

// Accepter / refuser un renfort (caserne destinataire)
// Supprime uniquement les branches d'une demande auxquelles la caserne
// destinataire n'a pas encore répondu lorsque l'intervention source se termine.
function nettoyerDemandesRenfortSansReponse(iv,caserneSourceId){
  const result={changed:false,deletions:[],casernes:[]};
  if(!iv||!Array.isArray(iv._renforts)||!iv._renforts.length)return result;
  const keptRequests=[];
  const casernesSupprimees=new Set();
  iv._renforts.forEach(function(request){
    if(!request||!request.id){result.changed=true;return;}
    const destinations=Array.isArray(request.destinataires)?request.destinataires.slice():[];
    const keptDestinations=[];
    destinations.forEach(function(cid){
      const destData=CASERNE_DATA[cid];
      const destList=destData&&Array.isArray(destData.renforts)?destData.renforts:null;
      const index=destList?destList.findIndex(function(item){
        return item&&item.id===request.id&&(!item.ivId||item.ivId===iv.id)&&(!item.caserneSource||item.caserneSource===caserneSourceId);
      }):-1;
      const destination=index>=0?destList[index]:null;
      if(!destination||destination.statut==='en-attente'){
        if(index>=0)destList.splice(index,1);
        result.changed=true;
        result.deletions.push({caserneId:cid,id:request.id});
        casernesSupprimees.add(cid);
      }else keptDestinations.push(cid);
    });
    if(keptDestinations.length){
      if(keptDestinations.length!==destinations.length){request.destinataires=keptDestinations;result.changed=true;}
      keptRequests.push(request);
    }else result.changed=true;
  });
  if(keptRequests.length!==iv._renforts.length||result.changed)iv._renforts=keptRequests;
  result.casernes=Array.from(casernesSupprimees);
  if(result.casernes.length){
    if(!Array.isArray(iv.tl))iv.tl=[];
    const labels=result.casernes.map(function(cid){const cas=CASERNES.find(function(item){return item.id===cid;});return cas?cas.nom:cid;});
    iv.tl.push({s:'renfort',h:getH(N()),who:CU?CU.l:'',note:'Demande de renfort supprimée automatiquement à la clôture — aucune réponse de '+labels.join(', ')});
  }
  return result;
}
function supprimerDemandesRenfortSansReponse(iv,caserneSourceId){
  const result=nettoyerDemandesRenfortSansReponse(iv,caserneSourceId);
  if(!result.deletions.length)return result;
  if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcMarkDeleted==='function'){
    const grouped={};
    result.deletions.forEach(function(item){if(!grouped[item.caserneId])grouped[item.caserneId]=[];grouped[item.caserneId].push(item.id);});
    Object.keys(grouped).forEach(function(cid){_rcMarkDeleted(cid,'renfort',Array.from(new Set(grouped[cid])));});
  }
  return result;
}

function repondreRenfort(cid,renfortId,reponse){
  const d=CASERNE_DATA[cid];if(!d)return;
  const r=d.renforts.find(function(x){return x.id===renfortId;});if(!r)return;
  r.statut=reponse;
  r.hReponse=getHHMM(N());
  r.reponduPar=CU?CU.l:'';
  // Mettre à jour le statut dans l'intervention source
  const dSource=CASERNE_DATA[r.caserneSource];
  if(dSource){
    const ivSrc=(dSource.ivs||[]).find(function(iv){return iv.id===r.ivId;});
    if(ivSrc&&ivSrc._renforts){
      const rSrc=ivSrc._renforts.find(function(x){return x.id===renfortId;});
      if(rSrc){
        rSrc.statut=reponse;
        const cas=CASERNES.find(function(c){return c.id===cid;});
        if(!ivSrc.tl)ivSrc.tl=[];
        ivSrc.tl.push({s:'renfort',h:getH(N()),who:CU?CU.l:'',
          note:'Renfort '+(reponse==='accepte'?'accept\u00e9':'refus\u00e9')+' par '+(cas?cas.nom:cid)});
      }
    }
  }
  saveData(true); // push immédiat : réponse renfort partagée entre casernes
  rI();
  showToast('Renfort '+(reponse==='accepte'?'accept\u00e9 \u2014 l\u00e9quipage va d\u00e9partir':'refus\u00e9'),'success');
  // Si accepté, ouvrir la modale d'équipage renfort
  if(reponse==='accepte')setTimeout(function(){showRenfortEquipageModal(cid,renfortId);},200);
}

function showRenfortEquipageModal(cid,renfortId){
  const r=CASERNE_DATA[cid]?.renforts?.find(function(x){return x.id===renfortId;});if(!r)return;
  const heure=getHHMM(N());
  r.hDebut=heure;
  // Construire sélecteurs selon le type
  const isComplet=r.type==='complet';
  const enginOpts=[''].concat(ASTR_CONFIG.engins||[]).map(function(e){return '<option value="'+e+'">'+(e||'\u2014 Aucun \u2014')+'</option>';}).join('');
  const enginBlock=isComplet?'<div class="fg"><div class="fgl">Engin engag\u00e9</div><select class="fi" id="renfort-engin">'+enginOpts+'</select></div>':'';

  document.getElementById('mt').textContent='Composition de l\u2019\u00e9quipage de renfort';
  document.getElementById('mi').textContent=r.ivNature+' \u2014 '+r.ivCommune+' ('+(isComplet?'Renfort complet':'Renfort personnel')+')';
  document.getElementById('mb').innerHTML=
    '<div>'
    +'<div style="background:#EDE9FE;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#5B21B6;">'
    +'Caserne demandeuse : <strong>'+r.caserneSourceNom+'</strong> \u2014 D\u00e9part : <strong>'+heure+'</strong></div>'
    +enginBlock
    +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">\u00c9quipage :</div>'
    +'<div id="renfort-equip-rows">'
    +buildRenfortEquipRow(0,null,'Chef d\u2019agr\u00e8s')
    +buildRenfortEquipRow(1,null,'Conducteur')
    +(isComplet?buildRenfortEquipRow(2,null,'\u00c9quipier'):'')
    +'</div>'
    +'<div class="brow" style="margin-top:10px;">'
    +'<button class="btn sm" style="background:#7C3AED;color:#fff;" onclick="confirmerRenfortEquipage(\''+cid+'\',\''+renfortId+'\')">&#x1F692; Confirmer le d\u00e9part</button>'
    +'<button class="btn sm" onclick="cM()">Retour</button>'
    +'</div></div>';
  document.getElementById('mo').style.display='flex';
}

function buildRenfortEquipRow(idx,login,role){
  const opts='<option value="">\u2014 Aucun \u2014</option>'
    +sortByGradeThenName(USERS).map(function(u){
      return '<option value="'+u.l+'"'+(u.l===login?' selected':'')+'>'+fullName(u)+' ('+gradeAbbr(u.grade)+')</option>';
    }).join('');
  return '<div style="margin-bottom:6px;display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;">'
    +'<span style="font-size:11px;font-weight:600;color:var(--t2);">'+role+'</span>'
    +'<select class="fi" id="renfort-eq-'+idx+'">'+opts+'</select></div>';
}

function confirmerRenfortEquipage(cid,renfortId){
  const r=CASERNE_DATA[cid]?.renforts?.find(function(x){return x.id===renfortId;});if(!r)return;
  const engin=document.getElementById('renfort-engin')?.value||'';
  const equip=[];
  [0,1,2,3].forEach(function(i){
    const sel=document.getElementById('renfort-eq-'+i);
    const roles=['Chef d\u2019agr\u00e8s','Conducteur','\u00c9quipier','\u00c9quipier 2'];
    if(sel&&sel.value){
      const u=USERS.find(function(x){return x.l===sel.value;})||{};
      equip.push({role:roles[i],login:sel.value,hDebut:getHHMM(N()),nom:u.nom||'',prenom:u.prenom||'',grade:u.grade||''});
    }
  });
  r.equipageRenfort=equip;
  r.enginRenfort=engin;
  r.statut='en-cours';
  r.hDebut=getHHMM(N());

  // ── Créer l'IV locale dans la caserne renforcée ──
  const dSrc=CASERNE_DATA[r.caserneSource];
  const ivSrc=dSrc?(dSrc.ivs||[]).find(function(iv){return iv.id===r.ivId;}):null;
  const casSrc=CASERNES.find(function(c){return c.id===r.caserneSource;});
  if(!CASERNE_DATA[cid].ivs)CASERNE_DATA[cid].ivs=[];
  // Éviter les doublons
  const ivId=r.ivId+'_renfort_'+cid;
  if(!CASERNE_DATA[cid].ivs.find(function(iv){return iv.id===ivId;})){
    const renfortIv={
      id:ivId,
      _isRenfort:true,
      _renfortId:renfortId,
      _caserneSource:r.caserneSource,
      _caserneSourceNom:casSrc?casSrc.nom:r.caserneSource,
      _ivSourceId:r.ivId,
      h:ivSrc?ivSrc.h:getH(N()),
      n:r.ivNature,
      com:r.ivCommune,
      adr:r.ivAdresse||'',
      addr:r.ivAdresse||r.ivCommune||'',
      s:'en-cours',
      agr:equip.length?equip[0].login:(CU?CU.l:''),
      _hDebut:r.hDebut,
      _hFin:null,
      _equipage1:equip,
      _personnel:equip.map(function(e){return e.login;}),
      eng:engin,
      tl:[{s:'en-cours',h:getH(N()),who:CU?CU.l:'',note:'Renfort depuis '+(casSrc?casSrc.nom:r.caserneSource)}],
      req:ivSrc?ivSrc.req:'',
      tel:ivSrc?ivSrc.tel:'',
      op:CU?CU.l:'',
    };
    CASERNE_DATA[cid].ivs.push(renfortIv);
    assignInterventionNumbersAtStart(renfortIv);
  }

  // Intégrer dans l'intervention source
  if(ivSrc){
    if(r.type==='personnel'){
      if(!ivSrc._equipage1)ivSrc._equipage1=[];
      equip.forEach(function(e){ivSrc._equipage1.push({...e,renfort:true,caserneRenfort:cid});});
    } else {
      if(!ivSrc._releves)ivSrc._releves=[];
      ivSrc._releves.push({
        hReleve:r.hDebut,isRenfort:true,caserneRenfort:cid,enginRenfort:engin,
        ancienEquipage:[],
        nouvelEquipage:equip.map(function(e){return{...e,hDebut:r.hDebut};})
      });
    }
    if(!ivSrc.tl)ivSrc.tl=[];
    const cas=CASERNES.find(function(c){return c.id===cid;});
    ivSrc.tl.push({s:'renfort',h:getH(N()),who:CU?CU.l:'',
      note:'Renfort '+(r.type==='complet'?'complet':'personnel')+' de '+(cas?cas.nom:cid)+' en route'});
  }

  saveData(true); // push immédiat : état renfort partagé entre casernes
  // Recharger le contexte si on est sur la caserne renforcée
  if(CURRENT_CASERNE_ID===cid){syncCaserneContext();}
  cM();rI();
  showToast('\u00c9quipage de renfort en route !','success');
}

function cloturerRenfort(cid,renfortId){
  const r=CASERNE_DATA[cid]?.renforts?.find(function(x){return x.id===renfortId;});if(!r)return;
  r.statut='termine';
  r.hFin=getHHMM(N());
  // Clôturer aussi l'IV de renfort locale (sinon elle reste affichée "en-cours")
  const ivLocale=(CASERNE_DATA[cid]?.ivs||[]).find(function(iv){return iv._renfortId===renfortId;});
  if(ivLocale){
    ivLocale.s='terminee';
    ivLocale._hFin=r.hFin;
    if(!ivLocale.tl)ivLocale.tl=[];
    ivLocale.tl.push({s:'terminee',h:getH(N()),who:CU?CU.l:'',note:'Clôture renfort'});
  }
  saveData(true);cM();rI(); // push immédiat : changement de statut partagé ; fermeture du modal
  showToast('Renfort cl\u00f4tur\u00e9 \u00e0 '+r.hFin,'success');
}

// Annulation ciblée d'un renfort pour une seule UT (seulement si pas encore répondu)
function annulerRenfortUT(ivId,renfortId,cid){
  const ivSrc=IVS.find(function(iv){return iv.id===ivId;});if(!ivSrc)return;
  const rSrc=ivSrc._renforts?.find(function(x){return x.id===renfortId;});if(!rSrc)return;
  // Vérifier que l'UT n'a pas encore répondu
  const rDest=(CASERNE_DATA[cid]?.renforts||[]).find(function(x){return x.id===renfortId;});
  if(rDest&&rDest.statut!=='en-attente'){
    showToast('Cette UT a d\u00e9j\u00e0 r\u00e9pondu \u2014 annulation impossible.','warn');return;
  }
  // Annuler pour cette caserne
  if(rDest)rDest.statut='annule';
  // Supprimer l'IV locale renfort si elle existe
  if(CASERNE_DATA[cid]?.ivs){
    CASERNE_DATA[cid].ivs=CASERNE_DATA[cid].ivs.filter(function(iv){return iv._renfortId!==renfortId;});
  }
  // Si toutes les casernes sont annulées/terminées/refusées → marquer la demande globale
  const toutesTerminees=rSrc.destinataires.every(function(destCid){
    const rd=(CASERNE_DATA[destCid]?.renforts||[]).find(function(x){return x.id===renfortId;});
    return !rd||['annule','termine','refuse'].includes(rd.statut);
  });
  if(toutesTerminees)rSrc.statut='annule';
  const cas=CASERNES.find(function(c){return c.id===cid;});
  ivSrc.tl.push({s:'renfort',h:getH(N()),who:CU?CU.l:'',note:'Annulation renfort pour '+(cas?cas.nom:cid)});
  saveData(true);setTimeout(function(){oM(ivId);},80); // push immédiat
  showToast('Demande annul\u00e9e pour '+(cas?cas.nom:cid),'success');
}


