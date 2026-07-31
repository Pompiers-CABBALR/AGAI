// === MODULE: historique.js ===
// ────────────────── HISTORIQUE ──────────────────
function rHistLegacy(){
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
      ${iv._isRenfort?(iv._numRenfort?`<span style="color:#7C3AED;">Renfort:${iv._numRenfort}</span>`:''):(iv._numCaserne?`<span class="hist-num-ut" style="color:#6A0DAD;">UT:${iv._numCaserne}</span> `:'')}
      ${!iv._isRenfort&&iv._numMois?`<span class="hist-num-m" style="color:#C0392B;">M:${iv._numMois}</span>`:''}
      ${iv._numSDIS?`<span style="color:#003399;"> S:${iv._numSDIS}</span>`:''}
    </span>`:''}
  </span>
  <span style="font-size:11px;color:var(--t2);text-align:right;">${iv.addr?escHtml(iv.addr)+', ':''}${escHtml(iv.com||'')}${(iv._hDebut||iv._hFin)?`<br><span style="font-size:10px;color:var(--t3);">${iv._hDebut?'🕐 '+escHtml(iv._hDebut):''}${iv._hDebut&&iv._hFin?' → ':''}${iv._hFin?escHtml(iv._hFin):''}</span>`:''}</span>
  <span class="bdg ${iv.s==='terminee'?'bg2':iv.s==='avis-passage'?'bp':iv.s==='annulee'?'bgr':'ba'}" style="font-size:10px;">${iv.s==='terminee'?'✓':iv.s==='avis-passage'?'&#x1F7E3;':iv.s==='annulee'?'✕':'↻'}</span>
  ${iv._mailsEnvoyes&&iv._mailsEnvoyes.length?'<span title="Envoyé par mail ('+iv._mailsEnvoyes.length+'x)" style="font-size:11px;margin-left:3px;">✉️</span>':''}
  <span class="hist-report-flags">
    ${iv._heureDebutModifiee&&hasAdministrativeAccount()?'<span class="hist-report-badge pending" style="background:#FFF7ED;color:#9A3412;border-color:#FDBA74;" title="L’heure réelle est conservée dans la traçabilité">&#x23F1; Heure corrigée</span>':''}
    ${iv.s==='terminee'&&iv._crValide?'<span class="hist-report-badge validated" title="Le compte rendu est validé">✅ Rapport validé</span>':iv.s==='terminee'&&(iv._crTexte||iv._compteRendu)?'<span class="hist-report-badge pending" title="Compte rendu en attente de validation">📋 Non validé</span>':''}
    ${iv._impressions&&iv._impressions.length?'<span class="hist-report-badge printed" title="Rapport imprimé '+iv._impressions.length+' fois">🖨️ Rapport imprimé'+(iv._impressions.length>1?' ×'+iv._impressions.length:'')+'</span>':''}
  </span>
</div>`).join('')}`;}).join('')}</div>`;
    }).join('')}</div></div>`;
  }).join('');
}
function tgLegacy(id,aid){const el=document.getElementById(id);if(!el)return;const v=el.style.display!=='none';el.style.display=v?'none':'';const a=document.getElementById(aid);if(a)a.textContent=v?'▶':'▼';}

// ────────────────── PROFIL ──────────────────
let HIST_SEARCH='';
const HIST_GROUP_STATE={};
function historyGroupOpen(id,defaultOpen){
  return Object.prototype.hasOwnProperty.call(HIST_GROUP_STATE,id)?HIST_GROUP_STATE[id]:!!defaultOpen;
}
function historyNormalizeSearch(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function historyIsoWeekInfo(dateKey){
  const y=Number(String(dateKey).slice(0,4)),m=Number(String(dateKey).slice(4,6)),d=Number(String(dateKey).slice(6,8));
  const date=new Date(Date.UTC(y,m-1,d));
  const day=date.getUTCDay()||7;
  const thursday=new Date(date);thursday.setUTCDate(date.getUTCDate()+4-day);
  const weekYear=thursday.getUTCFullYear();
  const yearStart=new Date(Date.UTC(weekYear,0,1));
  const week=Math.ceil((((thursday-yearStart)/86400000)+1)/7);
  const monday=new Date(date);monday.setUTCDate(date.getUTCDate()-(day-1));
  const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);
  const short=function(dt){return String(dt.getUTCDate()).padStart(2,'0')+'/'+String(dt.getUTCMonth()+1).padStart(2,'0');};
  return {key:String(weekYear)+'W'+String(week).padStart(2,'0'),week:week,label:'Semaine '+week+' \u2014 du '+short(monday)+' au '+short(sunday)};
}
function historySearchBlob(iv){
  const crew=[];
  [iv._equipage1,iv._equipage2].forEach(function(list){
    (Array.isArray(list)?list:[]).forEach(function(member){if(member&&member.login)crew.push(interventionTeammateName(member.login));});
  });
  [iv.agr,iv._agr2].forEach(function(login){if(login)crew.push(interventionTeammateName(login));});
  return historyNormalizeSearch([
    iv.id,iv.n,iv.addr,iv.com,iv.req,iv.tel,iv.s,iv._numCaserne,iv._numGlobal,iv._numMois,iv._numRenfort,iv._numSDIS,
    iv._hDebut,iv._hFin,iv._crTexte,iv._compteRendu,crew.join(' ')
  ].join(' '));
}
function historyRowHTML(iv){
  const click=iv._isPilp?"oPilp('"+escHtml(iv.id)+"')":"oM('"+escHtml(iv.id)+"')";
  return `<div class="hm hist-entry${iv._crValide&&iv._impressions&&iv._impressions.length?' report-complete':''}" data-hsearch="${escHtml(historySearchBlob(iv))}" onclick="${click}">
  <span style="font-family:monospace;font-size:10px;color:var(--t3);">${escHtml(iv._numCaserne||iv.id)}</span>
  <span style="flex:1;font-size:12px;color:var(--t);${iv.s==='annulee'?'text-decoration:line-through;color:#999;':''}">
    ${escHtml(iv.n||'Intervention')}
    ${iv._numGlobal||iv._numCaserne||iv._numMois||iv._numRenfort?`<span style="font-size:10px;font-weight:600;margin-left:6px;">
      ${iv._numGlobal?`<span style="color:#1A6B1A;">C:${escHtml(iv._numGlobal)}</span> `:''}
      ${iv._isRenfort?(iv._numRenfort?`<span style="color:#7C3AED;">Renfort:${escHtml(iv._numRenfort)}</span>`:''):(iv._numCaserne?`<span class="hist-num-ut" style="color:#6A0DAD;">UT:${escHtml(iv._numCaserne)}</span> `:'')}
      ${!iv._isRenfort&&iv._numMois?`<span class="hist-num-m" style="color:#C0392B;">M:${escHtml(iv._numMois)}</span>`:''}
      ${iv._numSDIS?`<span style="color:#003399;"> S:${escHtml(iv._numSDIS)}</span>`:''}
    </span>`:''}
  </span>
  <span style="font-size:11px;color:var(--t2);text-align:right;">${iv.addr?escHtml(iv.addr)+', ':''}${escHtml(iv.com||'')}${(iv._hDebut||iv._hFin)?`<br><span style="font-size:10px;color:var(--t3);">${iv._hDebut?'\ud83d\udd50 '+escHtml(iv._hDebut):''}${iv._hDebut&&iv._hFin?' \u2192 ':''}${iv._hFin?escHtml(iv._hFin):''}</span>`:''}</span>
  <span class="bdg ${iv.s==='terminee'?'bg2':iv.s==='avis-passage'?'bp':iv.s==='annulee'?'bgr':'ba'}" style="font-size:10px;">${iv.s==='terminee'?'\u2713':iv.s==='avis-passage'?'\ud83d\udfe3':iv.s==='annulee'?'\u2715':'\u21bb'}</span>
  ${iv._mailsEnvoyes&&iv._mailsEnvoyes.length?'<span title="Envoy\u00e9 par mail ('+iv._mailsEnvoyes.length+'x)" style="font-size:11px;margin-left:3px;">\u2709\ufe0f</span>':''}
  <span class="hist-report-flags">
    ${iv._heureDebutModifiee&&hasAdministrativeAccount()?'<span class="hist-report-badge pending" style="background:#FFF7ED;color:#9A3412;border-color:#FDBA74;" title="L\u2019heure r\u00e9elle est conserv\u00e9e dans la tra\u00e7abilit\u00e9">\u23f1 Heure corrig\u00e9e</span>':''}
    ${iv.s==='terminee'&&iv._crValide?'<span class="hist-report-badge validated" title="Le compte rendu est valid\u00e9">\u2705 Rapport valid\u00e9</span>':iv.s==='terminee'&&(iv._crTexte||iv._compteRendu)?'<span class="hist-report-badge pending" title="Compte rendu en attente de validation">\ud83d\udccb Non valid\u00e9</span>':''}
    ${iv._impressions&&iv._impressions.length?'<span class="hist-report-badge printed" title="Rapport imprim\u00e9 '+iv._impressions.length+' fois">\ud83d\udda8\ufe0f Rapport imprim\u00e9'+(iv._impressions.length>1?' \u00d7'+iv._impressions.length:'')+'</span>':''}
  </span>
</div>`;
}
function filterHistoryRows(value){
  HIST_SEARCH=historyNormalizeSearch(value);
  const root=document.getElementById('hc');if(!root)return;
  root.querySelectorAll('.hist-entry').forEach(function(row){
    row.style.display=!HIST_SEARCH||String(row.dataset.hsearch||'').includes(HIST_SEARCH)?'':'none';
  });
  ['hist-day-block','hist-week-block','hist-month-block','hist-year-block'].forEach(function(cls){
    root.querySelectorAll('.'+cls).forEach(function(block){
      const visible=Array.from(block.querySelectorAll('.hist-entry')).some(function(row){return row.style.display!=='none';});
      block.style.display=visible?'':'none';
      if(visible&&HIST_SEARCH){
        block.querySelectorAll(':scope > .hist-group-content').forEach(function(content){content.style.display='';});
      }
    });
  });
  const any=Array.from(root.querySelectorAll('.hist-entry')).some(function(row){return row.style.display!=='none';});
  const empty=document.getElementById('hist-no-results');if(empty)empty.style.display=any?'none':'block';
}
function clearHistorySearch(){HIST_SEARCH='';rHist();const input=document.getElementById('hist-search');if(input)input.focus();}
function rHist(){
  const cA=isChef()||hasRight('Administration');
  const normalIvs=cA?IVS.filter(function(iv){return !['en-attente','selectionne','en-cours'].includes(iv.s)&&!iv._isPilip;}):IVS.filter(function(iv){return (isTdy(iv)||iv.s==='annulee')&&!iv._isPilip;});
  const pilpIvsH=canSeePILP()?(cA?PILP_IVS:PILP_IVS.filter(function(iv){return isTdy(iv);})) : [];
  const pilpMapped=pilpIvsH.map(function(p){return Object.assign({},p,{n:'[PILP] '+p.n,tl:p.tl,_isPilp:true});});
  const dateKey=function(value){const digits=String(value||'').replace(/\D/g,'');return digits.length>=8?digits.slice(0,8):'';};
  const dayKey=function(iv){
    const timeline=Array.isArray(iv.tl)?iv.tl:[];
    const starts=timeline.filter(function(entry){return entry&&entry.s==='en-cours'&&dateKey(entry.h);});
    if(starts.length)return dateKey(starts[starts.length-1].h);
    const ends=timeline.filter(function(entry){return entry&&entry.s==='terminee'&&dateKey(entry.h);});
    if(ends.length)return dateKey(ends[ends.length-1].h);
    return dateKey(iv.h)||'00000000';
  };
  const startTime=function(iv){const hd=String(iv._hDebut||'').replace(/[^0-9]/g,'');return hd?hd.padStart(4,'0').slice(0,4):'0000';};
  const numberOrder=function(iv){
    const values=[iv._numCaserne,iv._numGlobal,iv._numMois,iv._numRenfort,iv.id];
    for(const value of values){const matches=String(value||'').match(/\d+/g);if(matches&&matches.length)return parseInt(matches[matches.length-1],10)||0;}
    return 0;
  };
  const ivs=normalIvs.concat(pilpMapped).sort(function(a,b){
    const dateSort=(dayKey(b)+startTime(b)).localeCompare(dayKey(a)+startTime(a));
    if(dateSort)return dateSort;
    return numberOrder(b)-numberOrder(a)||String(b.id||'').localeCompare(String(a.id||''),'fr',{numeric:true});
  });
  const groups={};
  ivs.forEach(function(iv){
    const day=dayKey(iv),year=day.slice(0,4),month=day.slice(4,6),week=historyIsoWeekInfo(day);
    if(!groups[year])groups[year]={};if(!groups[year][month])groups[year][month]={};if(!groups[year][month][week.key])groups[year][month][week.key]={info:week,days:{}};
    if(!groups[year][month][week.key].days[day])groups[year][month][week.key].days[day]=[];
    groups[year][month][week.key].days[day].push(iv);
  });
  const months=['','Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];
  const years=Object.keys(groups).sort(function(a,b){return b-a;});
  const c=document.getElementById('hc');
  const tools='<div class="hist-tools"><div><strong>\ud83d\udd0e Rechercher dans l\u2019historique</strong><div>Nature, adresse, commune, num\u00e9ro, agent, statut ou compte rendu</div></div><div class="hist-search-wrap"><input id="hist-search" type="search" value="'+escHtml(HIST_SEARCH)+'" placeholder="Rechercher une intervention\u2026" oninput="filterHistoryRows(this.value)"><button type="button" onclick="clearHistorySearch()">\u2715 Effacer</button></div></div>';
  if(!years.length){c.innerHTML=tools+'<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucun historique.</div>';return;}
  const yearHtml=years.map(function(year,yearIndex){
    const monthKeys=Object.keys(groups[year]).sort(function(a,b){return b-a;});
    const yearTotal=monthKeys.reduce(function(total,month){return total+Object.values(groups[year][month]).reduce(function(sum,week){return sum+Object.values(week.days).reduce(function(s,list){return s+list.length;},0);},0);},0);
    const yearId='hist-year-'+year,yearOpen=historyGroupOpen(yearId,true);
    return '<div class="hgrp hist-year-block"><div class="hgh" onclick="tg(\''+yearId+'\',\'arr-'+yearId+'\')">\ud83d\udcc5 '+year+'<span class="bdg bgr" style="margin-left:auto;">'+yearTotal+'</span><span id="arr-'+yearId+'">'+(yearOpen?'\u25bc':'\u25b6')+'</span></div><div id="'+yearId+'" class="hgb hist-group-content hist-year-content" style="display:'+(yearOpen?'':'none')+';">'
      +monthKeys.map(function(month,monthIndex){
        const weeks=groups[year][month],weekKeys=Object.keys(weeks).sort().reverse();
        const monthTotal=weekKeys.reduce(function(total,key){return total+Object.values(weeks[key].days).reduce(function(s,list){return s+list.length;},0);},0);
        const monthId='hist-month-'+year+'-'+month,monthOpen=historyGroupOpen(monthId,true);
        return '<div class="hist-month-block"><div class="hsub" onclick="tg(\''+monthId+'\',\'arr-'+monthId+'\')">'+months[Number(month)]+'<span class="bdg bgr">'+monthTotal+'</span><span id="arr-'+monthId+'" style="margin-left:auto;">'+(monthOpen?'\u25bc':'\u25b6')+'</span></div><div id="'+monthId+'" class="hist-group-content hist-month-content" style="display:'+(monthOpen?'':'none')+';">'
          +weekKeys.map(function(weekKey,weekIndex){
            const week=weeks[weekKey],days=Object.keys(week.days).sort().reverse();
            const weekTotal=days.reduce(function(sum,day){return sum+week.days[day].length;},0);
            const weekId='hist-week-'+year+'-'+month+'-'+weekKey,open=historyGroupOpen(weekId,yearIndex===0&&monthIndex===0&&weekIndex===0);
            return '<div class="hist-week-block"><div class="hist-week-header" onclick="tg(\''+weekId+'\',\'arr-'+weekId+'\')"><span>\ud83d\uddd3\ufe0f '+week.info.label+'</span><span class="bdg bgr">'+weekTotal+'</span><span id="arr-'+weekId+'" style="margin-left:auto;">'+(open?'\u25bc':'\u25b6')+'</span></div><div id="'+weekId+'" class="hist-group-content hist-week-content" style="display:'+(open?'':'none')+';">'
              +days.map(function(day){
                const list=week.days[day],dayId='hist-day-'+day+'-'+weekKey,dayOpen=historyGroupOpen(dayId,true);
                const dt=new Date(Number(day.slice(0,4)),Number(day.slice(4,6))-1,Number(day.slice(6,8))),dayName=dt.toLocaleDateString('fr-FR',{weekday:'long'});
                return '<div class="hist-day-block"><div class="hist-day-header" onclick="tg(\''+dayId+'\',\'arr-'+dayId+'\')"><span>'+dayName.charAt(0).toUpperCase()+dayName.slice(1)+' '+day.slice(6,8)+'/'+day.slice(4,6)+'/'+day.slice(0,4)+'</span><span class="bdg bgr">'+list.length+'</span><span id="arr-'+dayId+'" style="margin-left:auto;">'+(dayOpen?'\u25bc':'\u25b6')+'</span></div><div id="'+dayId+'" class="hist-group-content hist-day-content" style="display:'+(dayOpen?'':'none')+';">'+list.map(historyRowHTML).join('')+'</div></div>';
              }).join('')+'</div></div>';
          }).join('')+'</div></div>';
      }).join('')+'</div></div>';
  }).join('');
  c.innerHTML=tools+'<div id="hist-no-results" style="display:none;padding:18px;text-align:center;color:var(--t2);">Aucune intervention ne correspond \u00e0 cette recherche.</div>'+yearHtml;
  if(HIST_SEARCH)filterHistoryRows(HIST_SEARCH);
}

function tg(id,aid){
  const el=document.getElementById(id);if(!el)return;
  const isOpen=el.style.display!=='none';
  const nextOpen=!isOpen;
  el.style.display=nextOpen?'':'none';
  if(String(id).startsWith('hist-'))HIST_GROUP_STATE[id]=nextOpen;
  const arrow=document.getElementById(aid);if(arrow)arrow.textContent=nextOpen?'\u25bc':'\u25b6';
}

function rProfil(){
  if(!CU)return;
  const ini=(CU.prenom||'?')[0].toUpperCase()+(CU.nom||'?')[0].toUpperCase();
  document.getElementById('prof-avatar').textContent=ini;
  document.getElementById('prof-name').textContent=(CU.prenom||'')+' '+(CU.nom||'');
  document.getElementById('prof-grade-lbl').textContent='Grade : '+(CU.grade||'—')+(isResponsableFormation(CU)?' · Responsable formation':'');
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

