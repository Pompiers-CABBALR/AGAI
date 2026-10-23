// Aide au piquet VTU : aperçu hebdomadaire uniquement, jamais de sauvegarde automatique.
let _pqWeeklyDraft=[];
function openPiquetWeekly(wk){
  const engin=(ASTR_CONFIG.engins||[]).find(function(e){return /^VTU\b/i.test(String(e));});
  if(!engin){showToast('Aucun VTU configuré pour cette caserne.','warn');return;}
  addPiquet(wk,engin,JOURS_FULL[0]);
  suggestCreneaux(wk,engin);
}
function pqDraftClock(minutes){
  const m=((minutes%1440)+1440)%1440;
  return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
}
function pqDraftPlan(wk,engin){
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
  function pick(list,night,driver){
    return list.slice().sort(function(a,b){
      const al=load.get(a.l),bl=load.get(b.l);
      const scoreA=al.minutes+tier(a)*720+(night?al.nights*240:0);
      const scoreB=bl.minutes+tier(b)*720+(night?bl.nights*240:0);
      return scoreA-scoreB
        ||(driver?Number(isChefAgresByGrade(a))-Number(isChefAgresByGrade(b)):0)
        ||tier(a)-tier(b)
        ||String(a.l).localeCompare(String(b.l),'fr');
    })[0]||null;
  }
  function covered(di,debut,fin){
    const effective=di+(timeToMin(debut)<start?1:0);
    const proposed=piquetToAbsRangeIdx(effective,debut,fin);
    return (PIQUETS[wk]||[]).find(function(p){
      if(p.engin!==engin||!p.debut||!p.fin)return false;
      const pdi=JOURS_FULL.indexOf(p.jour);
      if(pdi<0)return false;
      const effectiveExisting=pdi+(timeToMin(p.debut)<start?1:0);
      const range=piquetToAbsRangeIdx(effectiveExisting,p.debut,p.fin);
      return proposed[0]<range[1]&&range[0]<proposed[1];
    });
  }
  const draft=[];
  JOURS_FULL.forEach(function(jour,di){
    periods.forEach(function(period){
      const debut=pqDraftClock(period.from),fin=pqDraftClock(period.to);
      const s={wk,engin,jour,label:period.label,debut,fin,
        chief:'',driver:'',equipier:'',state:'empty'};
      const existing=covered(di,debut,fin);
      if(existing){
        s.state=existing.chefAgres&&existing.conducteur?'existing':'existing-partial';
        draft.push(s);return;
      }
      const duration=period.to-period.from;
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
      const night=period.label==='Nuit';
      const chief=pick(available.filter(isChefAgresByGrade),night,false);
      const driver=pick(available.filter(function(u){return !chief||u.l!==chief.l;}),night,true);
      const equipier=pick(available.filter(function(u){
        return (!chief||u.l!==chief.l)&&(!driver||u.l!==driver.l);
      }),night,false);
      s.chief=chief?.l||'';s.driver=driver?.l||'';s.equipier=equipier?.l||'';
      s.state=chief&&driver?'ready':available.length?'partial':'empty';
      [chief,driver,equipier].forEach(function(u){
        if(!u)return;
        const burden=load.get(u.l);
        burden.minutes+=period.to-period.from;
        if(night)burden.nights++;
      });
      draft.push(s);
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
  _pqWeeklyDraft=pqDraftPlan(wk,engin);
  const ready=_pqWeeklyDraft.filter(function(s){return s.state==='ready';}).length;
  const partial=_pqWeeklyDraft.filter(function(s){return s.state==='partial';}).length;
  let html='<div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;padding:10px;margin-bottom:8px;">'
    +'<div style="font-weight:700;font-size:13px;">Proposition VTU sur toute la semaine</div>'
    +'<div style="font-size:11px;color:#475569;margin:4px 0 8px;">Astreinte forte, faible, autres équipes, puis sans équipe. '
    +'Répartition selon les heures déjà attribuées. '+ready+' créneaux avec chef et conducteur ; '
    +partial+' incomplets. Aucun enregistrement automatique.</div>'
    +'<div style="max-height:50vh;overflow-y:auto;">';
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
        :'Aucun agent disponible';
      const name=function(login){
        const u=USERS.find(function(agent){return agent.l===login;});
        return login?escHtml(u?fullName(u):login):'À compléter';
      };
      html+='<div style="background:'+bg+';border:1px solid '+border+';border-radius:7px;padding:6px;margin:4px 0;font-size:11px;">'
        +'<div style="font-weight:700;">'+escHtml(s.label)+' · '+s.debut+'–'+s.fin+' · '+status+'</div>';
      if(ready||partial){
        html+='<div>Chef : '+name(s.chief)+' · Conducteur : '+name(s.driver)
          +' · Équipier : '+name(s.equipier)+'</div>'
          +'<button type="button" class="btn sm" style="margin-top:5px;" onclick="applySuggestion('+index+')">Préremplir ce créneau</button>';
      }
      html+='</div>';
    });
  });
  target.innerHTML=html+'</div></div>';
}
function applySuggestion(index){
  const previous=_pqWeeklyDraft[index];
  if(!previous)return;
  // Recontrôler les disponibilités et les piquets avant le préremplissage.
  const fresh=pqDraftPlan(previous.wk,previous.engin).find(function(s){
    return s.jour===previous.jour&&s.label===previous.label;
  });
  if(!fresh||(fresh.state!=='ready'&&fresh.state!=='partial')){
    showToast('Ce créneau a changé. Relancez la proposition.','warn');return;
  }
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
    [_encodeRole('Conducteur'),fresh.driver],
    [_encodeRole('Équipier'),fresh.equipier]
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
