// Aide au piquet VTU : aperçu complet avant confirmation, sans écraser l'existant.
let _pqWeeklyDraft=[];
let _pqWeeklySnapshot=null;
function pqWeeklyVtuEngins(){
  return [...new Set(sortVehicleNames((ASTR_CONFIG.engins||[]).filter(function(e){return /^VTU\b/i.test(String(e));})))];
}
function pqWeeklyCanEdit(wk){
  return astrPiquetWeek>=0
    &&wk===weekKey(getMondayOfWeek(astrPiquetWeek))
    &&(hasRight('Administration')||(isRespEquipe()&&PIQUETS_VALIDATED[wk]!==true));
}
function openPiquetWeekly(wk){
  if(!pqWeeklyCanEdit(wk)){showToast('Cette semaine ne peut pas être modifiée.','warn');return;}
  const engin=pqWeeklyVtuEngins()[0];
  if(!engin){showToast('Aucun VTU configuré pour cette caserne.','warn');return;}
  addPiquet(wk,engin,JOURS_FULL[0]);
  suggestCreneaux(wk,engin);
}
function pqDraftClock(minutes){
  const m=((minutes%1440)+1440)%1440;
  return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
}
function pqDraftPlan(wk,engin){
  const engins=Array.isArray(engin)?engin:[engin];
  const gran=ASTR_CONFIG.granularity||60;
  const start=(ASTR_CONFIG.weekStartHour??0)*60;
  const slots=getSlotsPerDay(gran);
  const periods=[
    {label:'Matin',from:480,to:720},
    {label:'Après-midi',from:720,to:1080},
    {label:'Soir',from:1080,to:1440},
    {label:'Nuit',from:0,to:480}
  ];
  const groups=planningEquipeGroups(wk);
  const tiers=new Map(groups.map(function(g,i){return [g.eq.id,i];}));
  const load=new Map();
  USERS.forEach(function(u){
    const existing=(PIQUETS[wk]||[]).filter(function(p){
      return (p.membres||[]).some(function(m){return m.login===u.l;})
        ||[p.chefAgres,p.conducteur,p.chefEquipe,p.stagiaire].includes(u.l);
    });
    const minutes=existing.reduce(function(total,p){
      const member=(p.membres||[]).find(function(m){return m.login===u.l;});
      const begin=member?.hDebut||p.debut,end=member?.hFin||p.fin;
      if(!begin||!end)return total;
      const from=timeToMin(begin),to=timeToMin(end);
      return total+(to<=from?to+1440-from:to-from);
    },0);
    load.set(u.l,{
      minutes,
      nights:existing.filter(function(p){const h=timeToMin(p.debut||'08:00');return h>=1320||h<480;}).length
    });
  });
  function tier(u){
    const eq=getEquipeOfUser(u.l);
    return eq&&tiers.has(eq.id)?tiers.get(eq.id):groups.length;
  }
  function pick(list,night,driver,strictTeamPriority){
    return list.slice().sort(function(a,b){
      const al=load.get(a.l),bl=load.get(b.l);
      const scoreA=al.minutes+tier(a)*720+(night?al.nights*240:0);
      const scoreB=bl.minutes+tier(b)*720+(night?bl.nights*240:0);
      return (strictTeamPriority?tier(a)-tier(b):0)
        ||scoreA-scoreB
        ||(driver?Number(isChefAgresByGrade(a))-Number(isChefAgresByGrade(b)):0)
        ||tier(a)-tier(b)
        ||String(a.l).localeCompare(String(b.l),'fr');
    })[0]||null;
  }
  function coverage(targetEngin,di,debut,fin){
    const effective=di+(timeToMin(debut)<start?1:0);
    const proposed=piquetToAbsRangeIdx(effective,debut,fin);
    const complete=[];
    let overlaps=false;
    (PIQUETS[wk]||[]).forEach(function(p){
      if(p.engin!==targetEngin||!p.debut||!p.fin)return;
      const pdi=JOURS_FULL.indexOf(p.jour);
      if(pdi<0)return;
      const effectiveExisting=pdi+(timeToMin(p.debut)<start?1:0);
      const range=piquetToAbsRangeIdx(effectiveExisting,p.debut,p.fin);
      if(proposed[0]>=range[1]||range[0]>=proposed[1])return;
      overlaps=true;
      if(p.chefAgres&&p.conducteur&&p.chefAgres!==p.conducteur)
        complete.push([Math.max(proposed[0],range[0]),Math.min(proposed[1],range[1])]);
    });
    if(!overlaps)return '';
    complete.sort(function(a,b){return a[0]-b[0];});
    let until=proposed[0];
    complete.forEach(function(range){if(range[0]<=until)until=Math.max(until,range[1]);});
    return until>=proposed[1]?'existing':'existing-partial';
  }
  const draft=[];
  JOURS_FULL.forEach(function(jour,di){
    periods.forEach(function(period){
      const debut=pqDraftClock(period.from),fin=pqDraftClock(period.to);
      const duration=period.to-period.from;
      const slotDrafts=engins.map(function(targetEngin){
        const s={wk,engin:targetEngin,jour,label:period.label,debut,fin,
          chief:'',driver:'',eligible:[],chiefEligible:[],state:'empty'};
        const existing=coverage(targetEngin,di,debut,fin);
        if(existing){s.state=existing;return s;}
        const available=USERS.filter(function(u){
          const dispo=DISPOS[wk]?.[u.l];
          if(!dispo)return false;
          for(let elapsed=0;elapsed<duration;elapsed+=gran){
            const clock=(period.from+elapsed)%1440;
            const slot=Math.floor(((clock-start+1440)%1440)/gran);
            if(slot>=slots||dispo[di+'_'+slot]!==true
              ||!personnelDispoSlotAllowed(wk,u.l,di,slot,gran))return false;
          }
          return !hasConflitPiquet(wk,u.l,jour,debut,fin,-1);
        });
        s.eligible=available.slice().sort(function(a,b){return tier(a)-tier(b)||String(a.l).localeCompare(String(b.l),'fr');}).map(function(u){return u.l;});
        s.chiefEligible=available.filter(isChefAgresByGrade).map(function(u){return u.l;});
        return s;
      });
      const night=period.label==='Nuit';
      const allocated=new Set();
      function assign(s,role,agents){
        const u=pick(agents.filter(function(agent){return !allocated.has(agent.l);}),night,role==='driver',true);
        if(!u)return;
        s[role]=u.l;allocated.add(u.l);
        const burden=load.get(u.l);
        burden.minutes+=duration;
        if(night)burden.nights++;
      }
      // Réserver les chefs de chaque rang avant de choisir les conducteurs.
      slotDrafts.filter(function(s){return !s.state.startsWith('existing');}).forEach(function(s){
        assign(s,'chief',USERS.filter(function(u){return s.chiefEligible.includes(u.l);}));
      });
      slotDrafts.filter(function(s){return !s.state.startsWith('existing');}).forEach(function(s){
        assign(s,'driver',USERS.filter(function(u){return s.eligible.includes(u.l);}));
        s.state=s.chief&&s.driver?'ready':s.chief||s.driver?'partial':'empty';
      });
      draft.push(...slotDrafts);
    });
  });
  return draft;
}
// Remplace l'ancienne suggestion limitée à huit créneaux.
function suggestCreneaux(wk,engin){
  const target=document.getElementById('pq-suggestions');
  if(!target)return;
  if(!/^VTU\b/i.test(String(engin||''))){
    target.innerHTML='<div style="padding:10px;background:#FEF3C7;border-radius:8px;">Cette aide hebdomadaire concerne le VTU. Préparez les autres engins manuellement.</div>';
    return;
  }
  const engins=pqWeeklyVtuEngins();
  if(!engins.length)return;
  _pqWeeklyDraft=pqDraftPlan(wk,engins);
  _pqWeeklySnapshot={wk,engins,caserneId:CURRENT_CASERNE_ID,
    piquets:JSON.stringify(PIQUETS[wk]||[]),rotation:JSON.stringify(PLANNING_ROTATIONS[wk]||null)};
  pqWeeklyRenderDraft();
}
function pqWeeklySetChoice(index,role,login){
  const slot=_pqWeeklyDraft[index];
  if(!slot||!['ready','partial','empty'].includes(slot.state)||!['chief','driver'].includes(role))return;
  const permitted=role==='chief'?slot.chiefEligible:slot.eligible;
  if(login&&!permitted.includes(login))return;
  if(login&&_pqWeeklyDraft.some(function(other){
    return other!==slot&&other.jour===slot.jour&&other.label===slot.label
      &&(other.chief===login||other.driver===login);
  })){
    showToast('Cet agent est déjà proposé sur un autre départ VTU au même horaire.','warn');
    pqWeeklyRenderDraft();return;
  }
  slot[role]=login;
  if(login&&slot.chief&&slot.chief===slot.driver)slot[role==='chief'?'driver':'chief']='';
  slot.state=slot.chief&&slot.driver?'ready':slot.chief||slot.driver?'partial':'empty';
  pqWeeklyRenderDraft();
}
function pqWeeklyRenderDraft(){
  const target=document.getElementById('pq-suggestions');
  if(!target)return;
  const scrollTop=target.querySelector('.pq-weekly-list')?.scrollTop||0;
  const ready=_pqWeeklyDraft.filter(function(s){return s.state==='ready';}).length;
  const partialCount=_pqWeeklyDraft.filter(function(s){return s.state==='partial';}).length;
  const existing=_pqWeeklyDraft.filter(function(s){return s.state==='existing';}).length;
  const blocked=_pqWeeklyDraft.length-ready-partialCount-existing;
  const expected=28*(_pqWeeklySnapshot?.engins.length||0);
  const complete=_pqWeeklyDraft.length===expected&&expected>0&&blocked===0;
  let html='<div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;padding:10px;margin-bottom:8px;">'
    +'<div style="font-weight:700;font-size:13px;">Proposition sur toute la semaine — '+(_pqWeeklySnapshot?.engins.length||0)+' départ(s) VTU, 2 agents par créneau</div>'
    +'<div style="font-size:11px;color:#475569;margin:4px 0 8px;">Chef d’agrès et conducteur distincts. Astreinte forte prioritaire, puis faible, autres équipes et sans équipe. '
    +'Les heures déjà attribuées départagent les agents de même priorité. '+existing+' créneaux déjà couverts ; '
    +ready+' binômes proposés ; '+partialCount+' piquets incomplets ; '+blocked+' créneaux sans proposition enregistrable. Aucun enregistrement automatique.</div>'
    +'<div class="pq-weekly-list" style="max-height:50vh;overflow-y:auto;">';
  JOURS_FULL.forEach(function(jour){
    html+='<div style="font-weight:700;font-size:12px;margin:8px 0 4px;">'+escHtml(jour)+'</div>';
    _pqWeeklyDraft.forEach(function(s,index){
      if(s.jour!==jour)return;
      const ready=s.state==='ready',partial=s.state==='partial';
      const bg=ready?'#F0FDF4':partial?'#FFF7ED':'#F1F5F9';
      const border=ready?'#86EFAC':partial?'#FDBA74':'#CBD5E1';
      const status=ready?'Chef et conducteur proposés'
        :partial?'Incomplet — départ non garanti'
        :s.state==='existing'?'Piquet déjà présent'
        :s.state==='existing-partial'?'Piquet existant incomplet — départ non garanti'
        :s.eligible.length?'Aucun agent libre pour ce départ':'Aucun agent disponible';
      const name=function(login){
        const u=USERS.find(function(agent){return agent.l===login;});
        return login?escHtml(u?fullName(u):login):'À compléter';
      };
      const select=function(role){
        const candidates=role==='chief'?s.chiefEligible:s.eligible;
        const options='<option value="">À compléter</option>'+candidates.map(function(login){
          return '<option value="'+escHtml(login)+'"'+(s[role]===login?' selected':'')+'>'+name(login)+'</option>';
        }).join('');
        return '<label style="display:flex;align-items:center;gap:4px;min-width:0;">'
          +'<span style="white-space:nowrap;">'+(role==='chief'?'Chef':'Conducteur')+' :</span>'
          +'<select class="fi" style="min-width:0;flex:1;font-size:11px;padding:3px 5px;" '
          +'aria-label="'+(role==='chief'?'Chef d’agrès':'Conducteur')+' du '+escHtml(s.jour)+' '+escHtml(s.label)+'" '
          +'onchange="pqWeeklySetChoice('+index+',\''+role+'\',this.value)">'+options+'</select></label>';
      };
      html+='<div style="background:'+bg+';border:1px solid '+border+';border-radius:7px;padding:6px;margin:4px 0;font-size:11px;">'
        +'<div style="font-weight:700;">'+escHtml(piquetDepartureLabel(s.engin))+' · '+escHtml(s.label)+' · '+s.debut+'–'+s.fin+' · '+status+'</div>';
      if(['ready','partial','empty'].includes(s.state)){
        html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:5px;margin-top:5px;">'
          +select('chief')+select('driver')+'</div>'
          +'<button type="button" class="btn sm" style="margin-top:5px;" onclick="applySuggestion('+index+')">Préremplir ce créneau</button>';
      }
      html+='</div>';
    });
  });
  html+='</div>'
    +(complete&&(ready+partialCount)?'<button type="button" class="btn pr sm" style="margin-top:9px;" onclick="pqWeeklySaveWeek()">Enregistrer les '+(ready+partialCount)+' nouveaux créneaux de la semaine'+(partialCount?' ('+partialCount+' à compléter)':'')+'</button>'
      :complete?'<div style="margin-top:8px;color:#166534;font-size:11px;font-weight:600;">La semaine est déjà couverte par les piquets existants.</div>'
      :'<div style="margin-top:8px;color:#9A3412;font-size:11px;font-weight:600;">Enregistrement groupé indisponible : '+blocked+' créneaux sans agent ou déjà partiellement couverts. Corrigez-les manuellement ; les piquets existants restent inchangés.</div>')
    +'</div>';
  target.innerHTML=html;
  const list=target.querySelector('.pq-weekly-list');
  if(list)list.scrollTop=scrollTop;
}
function pqWeeklyWrites(){
  const snapshot=_pqWeeklySnapshot;
  if(!snapshot||!pqWeeklyCanEdit(snapshot.wk)
    ||!snapshot.engins.length||_pqWeeklyDraft.length!==28*snapshot.engins.length)
    return {error:'Cette proposition n’est plus disponible. Rouvrez la préparation de semaine.'};
  if(CURRENT_CASERNE_ID!==snapshot.caserneId
    ||JSON.stringify(pqWeeklyVtuEngins())!==JSON.stringify(snapshot.engins)
    ||JSON.stringify(PLANNING_ROTATIONS[snapshot.wk]||null)!==snapshot.rotation)
    return {error:'La caserne ou les équipes ont changé. Relancez la proposition.'};
  if(JSON.stringify(PIQUETS[snapshot.wk]||[])!==snapshot.piquets)
    return {error:'Les piquets ont changé. Relancez la proposition avant d’enregistrer.'};
  const current=pqDraftPlan(snapshot.wk,snapshot.engins);
  const entries=[],usedByPeriod=new Map();
  for(let i=0;i<_pqWeeklyDraft.length;i++){
    const selected=_pqWeeklyDraft[i],fresh=current[i];
    if(!fresh||selected.engin!==fresh.engin||selected.jour!==fresh.jour
      ||selected.label!==fresh.label||selected.debut!==fresh.debut||selected.fin!==fresh.fin)
      return {error:'Les créneaux ont changé. Relancez la proposition.'};
    if(selected.state==='existing'){
      if(fresh.state!=='existing')return {error:'Un piquet existant a changé. Relancez la proposition.'};
      continue;
    }
    if(!['ready','partial'].includes(selected.state)||fresh.state==='existing'||fresh.state==='existing-partial'
      ||(!selected.chief&&!selected.driver)
      ||(selected.chief&&!fresh.chiefEligible.includes(selected.chief))
      ||(selected.driver&&!fresh.eligible.includes(selected.driver))
      ||(selected.chief&&selected.chief===selected.driver))
      return {error:'La semaine comporte un créneau non enregistrable. Aucun piquet ajouté.'};
    const periodKey=selected.jour+'|'+selected.label;
    if(!usedByPeriod.has(periodKey))usedByPeriod.set(periodKey,new Set());
    const used=usedByPeriod.get(periodKey);
    if((selected.chief&&used.has(selected.chief))||(selected.driver&&used.has(selected.driver)))
      return {error:'Un agent figure sur deux départs VTU simultanés. Aucun piquet ajouté.'};
    if(selected.chief)used.add(selected.chief);
    if(selected.driver)used.add(selected.driver);
    entries.push({engin:selected.engin,jour:selected.jour,debut:selected.debut,fin:selected.fin,note:'',
      membres:[
        selected.chief?{role:'Chef d’agrès',login:selected.chief,hDebut:selected.debut,hFin:selected.fin}:null,
        selected.driver?{role:'Conducteur',login:selected.driver,hDebut:selected.debut,hFin:selected.fin}:null
      ].filter(Boolean),chefAgres:selected.chief,conducteur:selected.driver,chefEquipe:'',stagiaire:''});
  }
  return {entries};
}
function pqWeeklySaveWeek(){
  const checked=pqWeeklyWrites();
  if(checked.error){showToast(checked.error,'warn');return;}
  if(!checked.entries.length){showToast('La semaine est déjà couverte.','warn');return;}
  const snapshot=_pqWeeklySnapshot;
  const entriesAtConfirmation=JSON.stringify(checked.entries);
  const partial=checked.entries.filter(function(p){return !p.chefAgres||!p.conducteur;}).length;
  confirmModal('Ajouter '+checked.entries.length+' créneaux VTU ? '
    +(partial?partial+' resteront incomplets et empêcheront la validation de la semaine. ':'')
    +'Les piquets existants ne seront pas modifiés. Vérifiez ensuite « Sync OK ».',function(){
    const fresh=pqWeeklyWrites();
    if(fresh.error||_pqWeeklySnapshot!==snapshot
      ||JSON.stringify(fresh.entries)!==entriesAtConfirmation){
      showToast(fresh.error||'La proposition a changé. Relancez-la sans rien enregistrer.','warn');return;
    }
    const wk=_pqWeeklySnapshot.wk;
    if(!PIQUETS[wk])PIQUETS[wk]=[];
    fresh.entries.forEach(function(p){
      PIQUETS[wk].push(p);
      logPiquetChange(wk,'ajout',p,'Proposition hebdomadaire VTU');
    });
    saveData(true);
    cM();rAstrPiquets();
    showToast(fresh.entries.length+' créneaux enregistrés localement. Attendez « Sync OK ».','success');
  });
}
function applySuggestion(index){
  const previous=_pqWeeklyDraft[index];
  if(!previous)return;
  if(!pqWeeklyCanEdit(previous.wk)||CURRENT_CASERNE_ID!==_pqWeeklySnapshot?.caserneId
    ||!pqWeeklyVtuEngins().includes(previous.engin)){
    showToast('Cette proposition n’est plus disponible. Relancez la préparation.','warn');return;
  }
  // Recontrôler les disponibilités et les piquets avant le préremplissage.
  const fresh=pqDraftPlan(previous.wk,previous.engin).find(function(s){
    return s.jour===previous.jour&&s.label===previous.label;
  });
  if(!fresh||(fresh.state!=='ready'&&fresh.state!=='partial')
    ||(previous.chief&&!fresh.chiefEligible.includes(previous.chief))
    ||(previous.driver&&!fresh.eligible.includes(previous.driver))){
    showToast('Ce créneau a changé. Relancez la proposition.','warn');return;
  }
  fresh.chief=previous.chief;fresh.driver=previous.driver;
  fresh.state=fresh.chief&&fresh.driver?'ready':'partial';
  // Le formulaire initial peut concerner le premier départ alors que ce
  // créneau appartient à un autre VTU : ouvrir celui du bon rang.
  addPiquet(previous.wk,previous.engin,previous.jour);
  const jour=document.getElementById('pq-jour');
  const debut=document.getElementById('pq-debut');
  const fin=document.getElementById('pq-fin');
  if(!jour||!debut||!fin)return;
  jour.value=fresh.jour;debut.value=fresh.debut;fin.value=fresh.fin;
  pqSyncTimes('debut',fresh.debut);pqSyncTimes('fin',fresh.fin);
  debut.dataset.prev=fresh.debut;fin.dataset.prev=fresh.fin;
  pqFinHint(fin);
  const sels=Array.from(document.querySelectorAll('.pq-agent-sel'));
  sels.forEach(function(sel){sel.value='';});
  pqRefreshDispos();
  [
    [_encodeRole('Chef d’agrès'),fresh.chief],
    [_encodeRole('Conducteur'),fresh.driver]
  ].forEach(function(entry){
    if(!entry[1])return;
    const sel=sels.find(function(candidate){return candidate.dataset.role===entry[0];});
    if(sel)sel.value=entry[1];
  });
  pqRefreshDispos();
  const target=document.getElementById('pq-suggestions');
  if(target)target.innerHTML='<div style="padding:8px;background:#EFF6FF;border-radius:7px;font-size:12px;">'
    +'Créneau prérempli, non enregistré. Vérifiez les rôles et les heures avant « Valider ». '
    +(fresh.state==='partial'?'<strong>Incomplet : départ non garanti.</strong>':'')+'</div>';
}
