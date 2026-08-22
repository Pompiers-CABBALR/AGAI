// === MODULE: stats.js ===
// ══════════════════════════════════════════════════════
// STATISTIQUES CASERNE
// ══════════════════════════════════════════════════════
let stAnnee=new Date().getFullYear();
let stMois=0;
let stVue='annuel';
let stAppelsDate='';
const ST_MOIS=['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];

function statsInterventionDateKey(iv){
  const actual=typeof adminExportInterventionStartDate==='function'?adminExportInterventionStartDate(iv):'';
  if(actual)return actual;
  const raw=String(iv&&iv.h||'');
  return /^\d{8}/.test(raw)?raw.slice(0,8):'';
}
function statsInterventionInPeriod(iv,prefix){
  return statsInterventionDateKey(iv).startsWith(String(prefix||''));
}

function statsAppelDateKey(iv){
  const digits=String(iv&&iv.h||'').replace(/\D/g,'');
  return digits.length>=8?digits.slice(0,8):'';
}
function statsAppelsEnregistres(interventions){
  const seen=new Set();
  return (interventions||[]).filter(function(iv){
    if(!iv||iv._transfertDe||!statsAppelDateKey(iv))return false;
    const apl=String(iv._numApl||(/^APL_/.test(String(iv.id||''))?iv.id:'')||iv.id||'');
    if(!apl||seen.has(apl))return false;
    seen.add(apl);
    return true;
  });
}

function getStIvs(){
  const annStr=String(stAnnee);
  const prefix=stMois>0?annStr+String(stMois).padStart(2,'0'):annStr;
  return IVS.filter(function(iv){return !iv._isPilip&&isInterventionComptabilisee(iv)&&statsInterventionInPeriod(iv,prefix);});
}

function canViewDetailedStatistics(){
  return isAdminModeActive();
}
function canViewIndemnitesStatistics(){
  if(!isAdminModeActive())return false;
  if(isSuperAdmin())return true;
  const data=typeof CD==='function'?CD():null;
  return !!(data&&data._indemnitesAdmins===true);
}

function rStats(){
  // Nav fixée en haut
  const nav=document.getElementById('stats-nav');
  if(nav){
    const showPersonnel=canViewDetailedStatistics();
    const vues=[['annuel','Annuel'],['nat-mois','Nature/mois'],['com-mois','Commune/mois'],['nat-com','Commune\u00d7Nature']]
      .concat(showPersonnel?[['appels','Appels'],['pers-ivs','Personnel'],['pers-heures','Personnel/Heures'],['pers-act','Activités serv.'],['pers-form','Formations'],['pers-dispos','Dispos/Semaine']]:[])
      .concat(canViewIndemnitesStatistics()?[['indemnites','Indemnités']]:[]);
    const btnHtml=vues.map(function(vl){
      const v=vl[0],l=vl[1],actif=stVue===v;
      return '<button onclick="stVue=\''+v+'\';if(stVue===\'annuel\')stMois=0;rStats()" style="padding:5px 10px;border-radius:8px;border:1px solid #ccc;cursor:pointer;font-size:11px;font-weight:'+(actif?'700':'400')+';background:'+(actif?'#C0392B':'#f5f5f5')+';color:'+(actif?'#fff':'#333')+';">'+l+'</button>';
    }).join('');
    const moisOpts='<option value="0">Toute l\u2019ann\u00e9e</option>'+ST_MOIS.map(function(m,i){
      return '<option value="'+(i+1)+'"'+(stMois===i+1?' selected':'')+'>'+m+'</option>';
    }).join('');
    const exportBtn=canUseMonthlyExport()?'<button id="admin-monthly-export-btn" onclick="openAdminMonthlyExport()" style="margin-left:auto;background:#166534;color:#fff;border:1px solid #166534;border-radius:8px;padding:6px 11px;cursor:pointer;font-size:11px;">&#x1F4E5; Export mensuel Excel</button>':'';
    nav.innerHTML='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      +'<button onclick="stAnnee--;stMois=0;rStats()" style="background:#f5f5f5;border:1px solid #ccc;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:14px;">&larr;</button>'
      +'<span style="font-size:16px;font-weight:700;min-width:44px;text-align:center;">'+stAnnee+'</span>'
      +'<button onclick="stAnnee++;stMois=0;rStats()" style="background:#f5f5f5;border:1px solid #ccc;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:14px;">&rarr;</button>'
      +'<select onchange="stMois=parseInt(this.value);if(stVue===\'annuel\'&&stMois>0)stVue=\'nat-mois\';rStats()" style="padding:4px 8px;border-radius:8px;border:1px solid #ccc;font-size:12px;">'+moisOpts+'</select>'
      +'<div style="display:flex;gap:3px;flex-wrap:wrap;">'+btnHtml+'</div>'
      +exportBtn
      +'</div>';
  }
  rStatsContent();
}

function rStatsAppels(){
  const yearKey=String(stAnnee);
  const calls=statsAppelsEnregistres(IVS);
  const operators=new Map();
  (USERS||[]).filter(function(user){return user&&user.l&&!user._isSA;}).forEach(function(user){
    operators.set(user.l,{login:user.l,label:fullName(user)||user.l});
  });
  calls.forEach(function(call){
    const login=String(call.op||'').trim()||'__non_renseigne__';
    if(!operators.has(login)){
      const historical=login==='__non_renseigne__'?null:findHistoricalAccountByLogin(login);
      const historicalName=historical?fullName(historical):'';
      operators.set(login,{login:login,label:historicalName||(login==='__non_renseigne__'?'Opérateur non renseigné':login)});
    }
  });
  function countFor(login,prefix){
    return calls.filter(function(call){
      const operator=String(call.op||'').trim()||'__non_renseigne__';
      return operator===login&&statsAppelDateKey(call).startsWith(prefix);
    }).length;
  }
  const rows=Array.from(operators.values()).map(function(operator){
    const months=ST_MOIS.map(function(_,index){return countFor(operator.login,yearKey+String(index+1).padStart(2,'0'));});
    return {login:operator.login,label:operator.label,months:months,year:months.reduce(function(sum,value){return sum+value;},0)};
  }).sort(function(a,b){
    if(b.year!==a.year)return b.year-a.year;
    return a.label.localeCompare(b.label,'fr',{sensitivity:'base'});
  });
  const totalYear=calls.filter(function(call){return statsAppelDateKey(call).startsWith(yearKey);}).length;
  const monthTotals=ST_MOIS.map(function(_,index){
    const prefix=yearKey+String(index+1).padStart(2,'0');
    return calls.filter(function(call){return statsAppelDateKey(call).startsWith(prefix);}).length;
  });
  const monthHeaders=ST_MOIS.map(function(month){return '<th style="padding:8px 5px;text-align:center;min-width:48px;">'+month.slice(0,3)+'</th>';}).join('');
  const tableRows=rows.map(function(row){
    const monthCells=row.months.map(function(value){return '<td style="padding:8px 5px;text-align:center;font-weight:'+(value?'700':'400')+';">'+value+'</td>';}).join('');
    return '<tr style="border-bottom:1px solid #eee;">'
      +'<td style="padding:8px 10px;font-weight:600;">'+escHtml(row.label)+'</td>'
      +monthCells
      +'<td style="padding:8px;text-align:center;font-weight:700;background:#f5f5f5;">'+row.year+'</td></tr>';
  }).join('');
  const totalCells=monthTotals.map(function(value){return '<td style="padding:8px 5px;text-align:center;">'+value+'</td>';}).join('');
  return '<div style="background:#fff;border-radius:12px;padding:14px;">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">'
      +'<div><div style="font-size:16px;font-weight:700;">☎️ Appels enregistrés par utilisateur</div>'
      +'<div style="font-size:11px;color:var(--t2);margin-top:3px;">Les appels annulés sont inclus. Les copies reçues lors d’un transfert ne sont pas recomptées.</div></div>'
      +'<div style="background:#EAF3DE;border:1px solid #A9D18E;border-radius:10px;padding:8px 18px;text-align:center;"><div style="font-size:25px;font-weight:700;color:#166534;">'+totalYear+'</div><div style="font-size:11px;color:#166534;">Total annuel '+yearKey+'</div></div>'
    +'</div>'
    +'<div style="overflow-x:auto;border:1px solid var(--brd);border-radius:10px;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:980px;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:8px 10px;text-align:left;min-width:170px;">Utilisateur</th>'+monthHeaders+'<th style="padding:8px;text-align:center;background:#e9e9e9;min-width:60px;">Année</th></tr></thead>'
      +'<tbody>'+tableRows+'</tbody>'
      +'<tfoot><tr style="background:var(--t);color:#fff;font-weight:700;"><td style="padding:8px 10px;">TOTAL</td>'+totalCells+'<td style="padding:8px;text-align:center;">'+totalYear+'</td></tr></tfoot>'
    +'</table></div></div>';
}

let statsIndemnitySelectedLogin='';
let statsIndemnityDailyDetails={};
function selectIndemnityAgent(login){
  statsIndemnitySelectedLogin=String(login||'');
  document.querySelectorAll('.indem-row[data-agent-login]').forEach(function(row){
    const selected=row.getAttribute('data-agent-login')===statsIndemnitySelectedLogin;
    row.classList.toggle('is-selected',selected);
    row.setAttribute('aria-selected',selected?'true':'false');
  });
  const panel=document.getElementById('indem-agent-daily-detail');
  if(panel)panel.innerHTML=indemnityAgentDailyDetailHTML(statsIndemnitySelectedLogin);
}
function indemnityAgentDailyDetailHTML(login){
  const detail=statsIndemnityDailyDetails[String(login||'')];
  if(!detail)return '';
  const rows=(detail.days||[]).map(function(day){
    const parts=(day.categories||[]).map(function(category){return '<span style="display:inline-block;background:#F1F5F9;border-radius:6px;padding:2px 6px;margin:1px 3px 1px 0;white-space:nowrap;">'+escHtml(category.label)+' : '+adminExportMinutesHHMM(Math.round(category.minutes))+' · '+indemnityEuro(category.amount)+'</span>';}).join('');
    return '<tr><td style="padding:7px 8px;white-space:nowrap;">'+escHtml(day.label)+'</td><td style="padding:7px 8px;text-align:center;font-weight:700;">'+adminExportMinutesHHMM(Math.round(day.minutes))+'</td><td style="padding:7px 8px;text-align:right;font-weight:700;color:#166534;white-space:nowrap;">'+indemnityEuro(day.amount)+'</td><td style="padding:5px 8px;font-size:10px;">'+parts+'</td></tr>';
  }).join('');
  return '<div style="margin-top:12px;border:2px solid #111;border-radius:10px;overflow:hidden;"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;background:#F8FAFC;padding:9px 11px;border-bottom:2px solid #111;"><strong>Détail journalier — '+escHtml(detail.label)+'</strong><span style="font-size:11px;color:#475569;">'+detail.days.length+' jour'+(detail.days.length>1?'s':'')+'</span></div>'+(rows?'<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#fff;border-bottom:1px solid #CBD5E1;"><th style="padding:6px 8px;text-align:left;">Date</th><th style="padding:6px 8px;text-align:center;">Heures</th><th style="padding:6px 8px;text-align:right;">Montant</th><th style="padding:6px 8px;text-align:left;">Répartition</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div style="padding:14px;text-align:center;color:#64748B;">Aucune heure indemnisable sur cette période.</div>')+'</div>';
}

function rStatsIndemnites(){
  const categories=[
    {key:'ast',label:'Astreintes téléphoniques',short:'Astr. tél.'},
    {key:'ac',label:'Activités de service',short:'Act. serv.'},
    {key:'fa',label:'Frais administratifs',short:'Frais adm.'},
    {key:'inter100',label:'Intercommunales à 100 %',short:'INTER 100',hint:'INTER + RENF'},
    {key:'inter150',label:'Intercommunales à 150 %',short:'INTER 150',hint:'INTER + RENF'},
    {key:'inter200',label:'Intercommunales à 200 %',short:'INTER 200',hint:'INTER + RENF'},
    {key:'sdis100',label:'SDIS à 100 %',short:'SDIS 100'},
    {key:'sdis150',label:'SDIS à 150 %',short:'SDIS 150'},
    {key:'sdis200',label:'SDIS à 200 %',short:'SDIS 200'},
    {key:'formateur',label:'Formateurs',short:'Formateur',hint:'FORM'},
    {key:'formation',label:'Formations',short:'Formation',hint:'FOR'}
  ];
  const subtotalDefs=[
    {key:'subtotalInter',label:'Sous-total Intercommunales',short:'S/T Interco.',keys:['ast','ac','fa','inter100','inter150','inter200']},
    {key:'subtotalSdis',label:'Sous-total SDIS',short:'S/T SDIS',keys:['sdis100','sdis150','sdis200']},
    {key:'subtotalForm',label:'Sous-total Formations',short:'S/T Form.',keys:['formateur','formation']}
  ];
  // Un superadministrateur rattaché à la caserne reste un agent opérationnel :
  // son statut d’administration ne doit pas l’exclure de ses indemnités.
  const agents=[...(USERS||[])].filter(function(u){return u&&u.l;}).sort(function(a,b){return fullName(a).localeCompare(fullName(b),'fr');});
  const rates=getStatsTaux();
  function emptyValue(){return {minutes:0,amount:0};}
  function emptyRow(user){const values={};categories.forEach(function(c){values[c.key]=emptyValue();});return {user:user,values:values,daily:{},unknownGrade:false};}
  const rowsByLogin={};agents.forEach(function(user){rowsByLogin[user.l]=emptyRow(user);});
  function dateInPeriod(dateIso){
    const prefix=String(stAnnee)+(stMois>0?'-'+String(stMois).padStart(2,'0'):'');
    return String(dateIso||'').startsWith(prefix);
  }
  function add(login,key,minutes,dateIso,percentage){
    const row=rowsByLogin[login],mins=Math.max(0,Number(minutes)||0);if(!row||!mins||!dateInPeriod(dateIso))return;
    const scale=indemnityScaleForDate(dateIso);if(!scale)return;
    const daily=row.daily[dateIso]||(row.daily[dateIso]={}),dailyValue=daily[key]||(daily[key]=emptyValue());
    const group=indemnityGradeGroup(row.user.grade),base=group?Number(scale.rates&&scale.rates[group]):0;
    row.values[key].minutes+=mins;
    dailyValue.minutes+=mins;
    if(!group||!Number.isFinite(base)){row.unknownGrade=true;return;}
    const amount=(mins/60)*base*(Number(percentage)||0)/100;
    row.values[key].amount+=amount;dailyValue.amount+=amount;
  }
  function interventionIsoDate(iv){const key=statsInterventionDateKey(iv);return key&&key.length>=8?key.slice(0,4)+'-'+key.slice(4,6)+'-'+key.slice(6,8):'';}
  (IVS||[]).filter(function(iv){return iv&&!iv._isPilip&&isInterventionComptabilisee(iv);}).forEach(function(iv){
    const dateIso=interventionIsoDate(iv);if(!dateInPeriod(dateIso)||!indemnityScaleForDate(dateIso))return;
    const report=String(adminExportReportType(iv)||'INTER').toUpperCase();
    agents.forEach(function(user){
      // Reprendre les heures indemnisables de l’export : arrondi au quart
      // d’heure pour INTER/RENF si activé, sans arrondi pour le SDIS.
      const split=calcExportTauxAgentIV(iv,user.l);if(!split)return;
      const isSdis=report==='SDIS',prefix=isSdis?'sdis':'inter';
      const p100=isSdis?rates.sdisJour:(report==='RENF'?rates.renfJour:rates.interJour);
      const p150=isSdis?rates.sdisDimFerie:(report==='RENF'?rates.renfDimFerie:rates.interDimFerie);
      const p200=isSdis?rates.sdisNuit:(report==='RENF'?rates.renfNuit:rates.interNuit);
      add(user.l,prefix+'100',split.t100,dateIso,p100);add(user.l,prefix+'150',split.t150,dateIso,p150);add(user.l,prefix+'200',split.t200,dateIso,p200);
    });
  });
  (actGetData()||[]).forEach(function(activity){
    const date=String(activity.date||'').slice(0,10);if(!dateInPeriod(date))return;
    const key=activityIsFraisAdministratifs(activity)?'fa':'ac',percentage=key==='fa'?rates.fraisAdmin:rates.actSvc,minutes=statsActivityRecordedMinutes(activity);
    activityParticipantLogins(activity).forEach(function(login){add(login,key,minutes,date,percentage);});
  });
  (fmpaGetData()||[]).forEach(function(f){
    const date=String(f.date||'').slice(0,10),minutes=statsFmpaRecordedMinutes(f);if(!dateInPeriod(date))return;
    (f.participants||[]).forEach(function(login){add(login,'ac',minutes,date,rates.fmpaStag);});
    (f.formateurs||[]).forEach(function(login){add(login,'formateur',minutes,date,rates.fmpaForm);});
  });
  function addFormationDays(list,key,percentage){
    (list||[]).forEach(function(f){
      if(!f.ddebut||!f.dfin)return;
      const dayMinutes=formSlotMins(f.hmatind,f.hmatinf)+formSlotMins(f.hapremd,f.hapremf);if(!dayMinutes)return;
      const start=new Date(f.ddebut+'T12:00:00'),end=new Date(f.dfin+'T12:00:00');
      for(let day=new Date(start);day<=end;day.setDate(day.getDate()+1)){
        const date=day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0');
        (f.participants||[]).forEach(function(login){add(login,key,dayMinutes,date,percentage);});
      }
    });
  }
  addFormationDays(formStagGetData(),'formation',rates.formStag);
  addFormationDays(formFormGetData(),'formateur',rates.formRate);
  const months=stMois>0?[stMois]:Array.from({length:12},function(_,i){return i+1;});
  agents.forEach(function(user){
    months.forEach(function(month){
      const data=astrTelGetMonth(user.l,stAnnee,month-1)||{};
      Object.keys(data).forEach(function(day){
        const date=String(stAnnee)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        add(user.l,'ast',(Number(data[day])||0)*60,date,rates.astrTel);
      });
    });
  });
  function sumValues(row,keys){return keys.reduce(function(sum,key){const value=row.values[key]||emptyValue();sum.minutes+=value.minutes;sum.amount+=value.amount;return sum;},emptyValue());}
  function cell(value,background,extraClass){
    const hasValue=value.minutes>0,forceBackground=background==='#222';
    return '<td class="indem-value-col '+(extraClass||'')+'" style="'+(hasValue||forceBackground?'background:'+background+';':'')+'"><div class="indem-hours">'+(hasValue?adminExportMinutesHHMM(Math.round(value.minutes)):'—')+'</div><div class="indem-amount">'+(hasValue?indemnityEuro(value.amount):'&nbsp;')+'</div></td>';
  }
  function totalsForRow(row){
    subtotalDefs.forEach(function(def){row.values[def.key]=sumValues(row,def.keys);});
    row.values.total=sumValues(row,categories.map(function(c){return c.key;}));
  }
  const rows=Object.keys(rowsByLogin).map(function(login){const row=rowsByLogin[login];totalsForRow(row);return row;});
  statsIndemnityDailyDetails={};
  rows.forEach(function(row){
    const days=Object.keys(row.daily).sort().map(function(date){
      const values=row.daily[date],active=categories.filter(function(category){return values[category.key]&&values[category.key].minutes>0;}).map(function(category){return {label:category.short||category.label,minutes:values[category.key].minutes,amount:values[category.key].amount};});
      const total=active.reduce(function(sum,value){sum.minutes+=value.minutes;sum.amount+=value.amount;return sum;},emptyValue());
      const parts=date.split('-');
      return {date:date,label:parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:date,minutes:total.minutes,amount:total.amount,categories:active};
    });
    statsIndemnityDailyDetails[row.user.l]={label:fullName(row.user),days:days};
  });
  const grand={values:{}};categories.concat(subtotalDefs).concat([{key:'total'}]).forEach(function(c){grand.values[c.key]=emptyValue();});
  rows.forEach(function(row){Object.keys(grand.values).forEach(function(key){grand.values[key].minutes+=row.values[key].minutes;grand.values[key].amount+=row.values[key].amount;});});
  function rateLabel(value){const n=Number(value);return (Number.isFinite(n)?n.toLocaleString('fr-FR',{maximumFractionDigits:2}):'0')+'%';}
  const categoryHeaderLabels={
    ast:rateLabel(rates.astrTel),ac:rateLabel(rates.actSvc),fa:'FA',
    inter100:'100%',inter150:'150%',inter200:'200%',
    sdis100:'100%',sdis150:'150%',sdis200:'200%',
    formateur:'Formateur',formation:'Formation'
  };
  function categoryCellClass(category){return category.key==='sdis100'||category.key==='formateur'?'indem-group-start':'';}
  const groupedHeaders='<tr class="indem-group-head"><th class="indem-agent-col" rowspan="2">Agent</th>'
    +'<th colspan="6">Indemnités intercommunales</th>'
    +'<th colspan="3">Indemnités en complémentarité du SDIS</th>'
    +'<th colspan="2">Indemnités formations</th>'
    +'<th colspan="4">'+(stMois>0?'Total mensuel':'Total annuel')+'</th></tr>';
  const headers='<tr class="indem-subhead">'+categories.map(function(c){return '<th class="indem-value-col '+categoryCellClass(c)+'" title="'+escHtml(c.label)+'"><span class="indem-head-label">'+escHtml(categoryHeaderLabels[c.key]||c.short||c.label)+'</span></th>';}).join('')
    +'<th class="indem-value-col indem-subtotal-col indem-total-group-start" title="Sous-total Intercommunales"><span class="indem-head-label">CABBALR</span></th>'
    +'<th class="indem-value-col indem-subtotal-col" title="Sous-total SDIS"><span class="indem-head-label">SDIS</span></th>'
    +'<th class="indem-value-col indem-subtotal-col" title="Sous-total Formations"><span class="indem-head-label">Formations</span></th>'
    +'<th class="indem-value-col indem-total-col"><span class="indem-head-label">Total</span></th></tr>';
  const bodyRows=rows.map(function(row){
    const login=String(row.user.l||''),encodedLogin=encodeURIComponent(login),selected=login===statsIndemnitySelectedLogin;
    return '<tr class="indem-row'+(selected?' is-selected':'')+'" data-agent-login="'+escHtml(login)+'" tabindex="0" aria-selected="'+(selected?'true':'false')+'" onclick="selectIndemnityAgent(decodeURIComponent(\''+encodedLogin+'\'))" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();selectIndemnityAgent(decodeURIComponent(\''+encodedLogin+'\'));}"><td class="indem-agent-col"><strong>'+escHtml(fullName(row.user))+'</strong><div class="indem-grade" style="font-size:10px;color:#666;">'+escHtml(row.user.grade||'—')+(row.unknownGrade?' · <span style="color:#B45309;">grade non classé</span>':'')+'</div></td>'
      +categories.map(function(c){return cell(row.values[c.key],'#F8FAFC',categoryCellClass(c));}).join('')+subtotalDefs.map(function(c,index){return cell(row.values[c.key],'#EEF2FF','indem-subtotal-col'+(index===0?' indem-total-group-start':''));}).join('')+cell(row.values.total,'#EAF3DE','indem-total-col')+'</tr>';
  }).join('');
  const footer='<tr style="background:#222;color:#fff;font-weight:700;"><td class="indem-agent-col" style="background:#222;">TOTAL</td>'+categories.map(function(c){return cell(grand.values[c.key],'#222',categoryCellClass(c));}).join('')+subtotalDefs.map(function(c,index){return cell(grand.values[c.key],'#222','indem-subtotal-col'+(index===0?' indem-total-group-start':''));}).join('')+cell(grand.values.total,'#222','indem-total-col')+'</tr>';
  const period=stMois>0?ST_MOIS[stMois-1]+' '+stAnnee:'Année '+stAnnee;
  return '<div style="background:#fff;border-radius:12px;padding:14px;"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;"><div style="font-size:16px;font-weight:700;">💶 Indemnités par agent — '+period+'</div><div style="font-size:11px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:9px;padding:7px 10px;">Calcul actif depuis le 01/12/2025</div></div>'
    +'<div class="indem-table-container"><table class="indem-table"><thead>'+groupedHeaders+headers+'</thead><tbody>'+bodyRows+'</tbody><tfoot>'+footer+'</tfoot></table></div><div id="indem-agent-daily-detail">'+indemnityAgentDailyDetailHTML(statsIndemnitySelectedLogin)+'</div></div>';
}

function rStatsContent(){
  const body=document.getElementById('stats-body');
  if(!body)return;
  // Mettre à jour les boutons de vue
  const nav=document.getElementById('stats-nav');
  if(nav){
    nav.querySelectorAll('button[onclick*="stVue"]').forEach(function(btn){
      const actif=btn.getAttribute('onclick').includes("'"+stVue+"'");
      btn.style.background=actif?'#C0392B':'#f5f5f5';
      btn.style.color=actif?'#fff':'#333';
      btn.style.fontWeight=actif?'700':'400';
    });
  }
  if(stVue==='appels'){
    if(!canViewDetailedStatistics()){body.innerHTML='<div style="padding:24px;text-align:center;color:var(--t2);">Accès restreint.</div>';return;}
    body.innerHTML=rStatsAppels();
    return;
  }
  if(stVue==='indemnites'){
    if(!canViewIndemnitesStatistics()){body.innerHTML='<div style="padding:24px;text-align:center;color:var(--t2);">Accès restreint.</div>';return;}
    body.innerHTML=rStatsIndemnites();return;
  }
  const ivs=getStIvs();
  const total=ivs.length;
  const periodeLabel=stMois>0?ST_MOIS[stMois-1]+' '+stAnnee:String(stAnnee);

  // ── Carte totale (style chef de corps) ──
  const carteTotal='<div style="background:var(--t);color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">'
    +'<div style="font-size:12px;opacity:.8;">'+periodeLabel+'</div>'
    +'<div style="font-size:32px;font-weight:700;">'+total+'</div>'
    +'<div style="font-size:11px;opacity:.7;">intervention'+(total>1?'s':'')+'</div></div>';

  let html='';

  if(stVue==='annuel'){
    // Top natures
    const topNats=NAT.map(function(n){return {l:n.l,i:n.i,nb:ivs.filter(function(iv){return iv.n===n.l;}).length};}).filter(function(n){return n.nb>0;}).sort(function(a,b){return b.nb-a.nb;}).slice(0,6);
    const topHtml=topNats.length?'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">'+topNats.map(function(n){return '<span style="background:#FEF0E7;color:#C0392B;border-radius:8px;padding:3px 9px;font-size:11px;">'+n.i+' '+n.l+' <strong>'+n.nb+'</strong></span>';}).join('')+'</div>':'';
    let rows='';
    ST_MOIS.forEach(function(nom,mi){
      const mStr=String(stAnnee)+String(mi+1).padStart(2,'0');
      const nb=ivs.filter(function(iv){return statsInterventionInPeriod(iv,mStr);}).length;
      const pct=total>0?Math.round(nb/total*100):0;
      rows+='<tr style="border-bottom:1px solid #f5f5f5;cursor:pointer;" onclick="stMois='+(mi+1)+';stVue=\'nat-mois\';rStats()">'
        +'<td style="padding:6px 10px;font-size:12px;font-weight:500;">'+nom+'</td>'
        +'<td style="padding:6px 8px;text-align:center;font-weight:700;">'+(nb||'—')+'</td>'
        +'<td style="padding:6px 8px;text-align:center;font-size:11px;color:#666;">'+(nb?pct+'%':'')+'</td>'
        +'<td style="padding:6px 10px;min-width:80px;"><div style="background:#f0f0f0;border-radius:4px;height:7px;"><div style="width:'+pct+'%;background:#C0392B;height:100%;border-radius:4px;"></div></div></td></tr>';
    });
    html=topHtml
      +'<p style="font-size:11px;color:var(--t2);margin:0 0 8px;">Cliquez sur un mois pour le d\u00e9tail par nature.</p>'
      +'<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:6px 10px;text-align:left;">Mois</th>'
      +'<th style="padding:6px 8px;text-align:center;">Nb</th>'
      +'<th style="padding:6px 8px;text-align:center;">%</th>'
      +'<th style="padding:6px 10px;">R\u00e9partition</th></tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'<tfoot><tr style="background:var(--t);color:#fff;font-weight:700;">'
      +'<td style="padding:6px 10px;">TOTAL</td>'
      +'<td style="padding:6px 8px;text-align:center;">'+total+'</td>'
      +'<td colspan="2"></td></tr></tfoot>'
      +'</table></div>';

  } else if(stVue==='nat-mois'){
    const moisActifs=stMois>0?[stMois]:Array.from({length:12},function(_,i){return i+1;});
    const thMois=moisActifs.map(function(mi){return '<th style="padding:4px 5px;text-align:center;font-size:10px;min-width:28px;">'+ST_MOIS[mi-1].slice(0,3)+'</th>';}).join('');
    let rowsNM='';
    NAT.forEach(function(n){
      let cols='';
      moisActifs.forEach(function(mi){
        const mStr=String(stAnnee)+String(mi).padStart(2,'0');
        const nb=ivs.filter(function(iv){return iv.n===n.l&&statsInterventionInPeriod(iv,mStr);}).length;
        cols+='<td style="padding:4px 5px;text-align:center;font-size:11px;'+(nb?'font-weight:700;background:#EAF3DE;':'')+'">'+(nb||'—')+'</td>';
      });
      const tot=ivs.filter(function(iv){return iv.n===n.l;}).length;
      rowsNM+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.4;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;">'+n.i+' '+n.l+'</td>'+cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;">'+(tot||'—')+'</td></tr>';
    });
    html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:150px;font-size:11px;">Nature</th>'+thMois+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Tot.</th></tr></thead>'
      +'<tbody>'+rowsNM+'</tbody></table></div>';

  } else if(stVue==='com-mois'){
    const moisActifs=stMois>0?[stMois]:Array.from({length:12},function(_,i){return i+1;});
    const thMois=moisActifs.map(function(mi){return '<th style="padding:4px 5px;text-align:center;font-size:10px;min-width:28px;">'+ST_MOIS[mi-1].slice(0,3)+'</th>';}).join('');
    const allComs=statsCommunesIntervenuesEnPremier(ivs);
    let rowsCM='';
    allComs.forEach(function(com){
      let cols='';
      moisActifs.forEach(function(mi){
        const mStr=String(stAnnee)+String(mi).padStart(2,'0');
        const nb=ivs.filter(function(iv){return iv.com===com&&statsInterventionInPeriod(iv,mStr);}).length;
        cols+='<td style="padding:4px 5px;text-align:center;font-size:11px;'+(nb?'font-weight:700;background:#EAF3DE;':'')+'">'+(nb||'—')+'</td>';
      });
      const tot=ivs.filter(function(iv){return iv.com===com;}).length;
      rowsCM+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.35;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;">'+com+'</td>'+cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;">'+(tot||'—')+'</td></tr>';
    });
    html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:140px;font-size:11px;">Commune</th>'+thMois+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Tot.</th></tr></thead>'
      +'<tbody>'+rowsCM+'</tbody></table></div>';

  } else if(stVue==='nat-com'){
    // Communes en lignes, natures en colonnes
    const allComs=statsCommunesIntervenuesEnPremier(ivs);
    const thNat=NAT.map(function(n){return '<th style="padding:3px 4px;text-align:center;font-size:9px;writing-mode:vertical-lr;transform:rotate(180deg);height:64px;max-width:20px;white-space:nowrap;">'+n.i+' '+n.l+'</th>';}).join('');
    let rowsCN='';
    allComs.forEach(function(com){
      const tot=ivs.filter(function(iv){return iv.com===com;}).length;
      const cols=NAT.map(function(n){
        const nb=ivs.filter(function(iv){return iv.com===com&&iv.n===n.l;}).length;
        return '<td style="padding:3px 4px;text-align:center;font-size:11px;'+(nb?'font-weight:700;background:#EAF3DE;':'')+'">'+(nb||'\u2014')+'</td>';
      }).join('');
      rowsCN+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.35;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+com+'</td>'+cols
        +'<td style="padding:3px 6px;text-align:center;font-weight:700;background:#f9f9f9;">'+(tot||'\u2014')+'</td></tr>';
    });
    if(!rowsCN){html='<div style="padding:24px;text-align:center;color:#666;">Aucune intervention pour cette p\u00e9riode.</div>';}
    else{
      html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">'
        +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:140px;font-size:11px;">Commune</th>'+thNat+'<th style="padding:3px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Tot.</th></tr></thead>'
        +'<tbody>'+rowsCN+'</tbody></table></div>';
    }
  }

  // Vues personnel (admin only)
  if(stVue==='pers-ivs'||stVue==='pers-heures'||stVue==='pers-dispos'||stVue==='pers-act'||stVue==='pers-form'){
    if(!canViewDetailedStatistics()){body.innerHTML='<div style="padding:24px;text-align:center;color:var(--t2);">Accès restreint.</div>';return;}
    body.innerHTML=rStatsPersonnel(stVue);
    return;
  }
  body.innerHTML=carteTotal+'<div style="background:#fff;border-radius:12px;padding:12px;">'+html+'</div>';
}

// ────────────────── STATS HEADER ──────────────────
// ══════════════════════════════════════════════════════
// STATISTIQUES PERSONNEL (admin uniquement)
// ══════════════════════════════════════════════════════

// ── Helper taux ──
function getStatsTaux(){
  const defaults={interJour:100,interDimFerie:150,interNuit:200,sdisJour:100,sdisDimFerie:150,sdisNuit:200,renfJour:100,renfDimFerie:150,renfNuit:200,actSvc:75,fmpaStag:75,fmpaForm:100,formRate:100,formStag:100,formForm:100,fraisAdmin:100,astrTel:5,exportAdmins:false,exportRoundQuarter:true,rateSchemaVersion:2};
  const saved=CURRENT_CASERNE_ID&&CASERNE_DATA[CURRENT_CASERNE_ID]&&CASERNE_DATA[CURRENT_CASERNE_ID].statsTaux;
  const out=Object.assign({},defaults,saved||{});
  if(saved){
    if(saved.sdisJour===undefined){out.sdisJour=out.interJour;out.sdisDimFerie=out.interDimFerie;out.sdisNuit=out.interNuit;}
    if(saved.renfJour===undefined){out.renfJour=out.interJour;out.renfDimFerie=out.interDimFerie;out.renfNuit=out.interNuit;}
    if(saved.formRate===undefined)out.formRate=saved.formForm??saved.fmpaForm??100;
    if(saved.fraisAdmin===undefined)out.fraisAdmin=100;
    if(saved.rateSchemaVersion!==2)out.astrTel=5;
  }
  return out;
}
function saveStatsTaux(t){
  (CASERNES||[]).forEach(function(c){
    if(!CASERNE_DATA[c.id])initCaserneData(c.id);
    CASERNE_DATA[c.id].statsTaux=Object.assign({},t);
  });
  saveData();
}
function showStatsTauxParams(){
  if(!isSuperAdmin()){showToast('Accès réservé au super-administrateur','warn');return;}
  const t=getStatsTaux();
  const row=(label,id,val,desc)=>`<div class="fg">
    <div class="fgl">${label}</div>
    <div style="display:flex;align-items:center;gap:10px;">
      <input class="fi" type="number" id="taux-${id}" value="${val}" min="0" max="200" step="1" style="max-width:90px;"/>
      <span style="font-size:11px;color:var(--t2);">${desc}</span>
    </div>
  </div>`;
  document.getElementById('mt').textContent='📊 Paramètres des taux et de l’export';
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`<div>
    <div style="font-size:12px;color:var(--t2);margin-bottom:12px;">Ces taux sont utilisés pour l’export administratif. Les statistiques des activités et des formations conservent les heures exactes enregistrées sur les feuilles.</div>
    <div style="font-size:12px;font-weight:700;color:var(--red);margin:4px 0 8px;">🚒 Interventions</div>
    ${row('Interventions — journée (07h–22h)','interJour',t.interJour??100,'% des heures réelles')}
    ${row('Interventions — dimanche et jour férié (07h–22h)','interDimFerie',t.interDimFerie??150,'% des heures réelles')}
    ${row('Interventions — nuit (22h–07h)','interNuit',t.interNuit??200,'% des heures réelles')}
    <div style="font-size:12px;font-weight:700;color:var(--blu);margin:14px 0 8px;">📋 Activités, formations et astreinte</div>
    ${row('Activités de service','actSvc',t.actSvc??75,'% des heures réelles')}
    ${row('FMPA — participants (stagiaires)','fmpaStag',t.fmpaStag??75,'% des heures réelles')}
    ${row('FMPA — formateurs','fmpaForm',t.fmpaForm??100,'% des heures réelles')}
    ${row('Formations — stagiaires','formStag',t.formStag??100,'% des heures réelles')}
    ${row('Formations — formateurs','formForm',t.formForm??100,'% des heures réelles')}
    ${row('Astreinte téléphonique','astrTel',t.astrTel??5,'% des heures réelles')}
    <label style="display:flex;align-items:flex-start;gap:10px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:9px;padding:10px 12px;margin:12px 0;cursor:pointer;">
      <input type="checkbox" id="export-admins-visible" ${t.exportAdmins===true?'checked':''} style="width:18px;height:18px;accent-color:#166534;margin-top:1px;"/>
      <span><strong style="font-size:12px;color:#166534;">Autoriser l’export mensuel aux administrateurs</strong><br><span style="font-size:11px;color:var(--t2);">Désactivé : seul le superadmin voit et utilise le bouton d’export.</span></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:10px;background:#EFF6FF;border:1px solid #93C5FD;border-radius:9px;padding:10px 12px;margin:12px 0;cursor:pointer;">
      <input type="checkbox" id="export-round-quarter" ${t.exportRoundQuarter!==false?'checked':''} style="width:18px;height:18px;accent-color:#1D4ED8;margin-top:1px;"/>
      <span><strong style="font-size:12px;color:#1D4ED8;">Arrondir les heures d’intervention au quart d’heure supérieur</strong><br><span style="font-size:11px;color:var(--t2);">Appliqué aux colonnes HEURES et HEURES_2 : 00, 15, 30 ou 45 minutes. Les interventions SDIS conservent toujours leur durée exacte.</span></span>
    </label>
    <div id="taux-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
    <div class="brow">
      <button class="btn pr" onclick="applyStatsTaux()">💾 Enregistrer</button>
      <button class="btn" onclick="cM()">Annuler</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function applyStatsTaux(){
  const get=(id)=>Math.max(0,Math.min(200,parseInt(document.getElementById('taux-'+id)?.value)||0));
  const next=Object.assign({},getStatsTaux(),{interJour:get('interJour'),interDimFerie:get('interDimFerie'),interNuit:get('interNuit'),actSvc:get('actSvc'),fmpaStag:get('fmpaStag'),fmpaForm:get('fmpaForm'),formStag:get('formStag'),formForm:get('formForm'),formRate:get('formForm'),astrTel:get('astrTel'),exportAdmins:document.getElementById('export-admins-visible')?.checked===true,exportRoundQuarter:document.getElementById('export-round-quarter')?.checked!==false,rateSchemaVersion:2});
  saveStatsTaux(next);
  cM();
  showToast('Taux enregistrés ✓','success');
}

// ── Stats activités de service ──
// La vue statistique reprend la durée exacte de la feuille. Le taux AC reste
// appliqué uniquement dans l'export administratif.
function statsActivityRecordedMinutes(activity){
  if(!activity)return 0;
  if(activity.hDebut&&activity.hFin){
    const debut=String(activity.hDebut).split(':').map(Number),fin=String(activity.hFin).split(':').map(Number);
    if(!debut.some(Number.isNaN)&&!fin.some(Number.isNaN)){
      let minutes=(fin[0]*60+fin[1])-(debut[0]*60+debut[1]);
      if(minutes<0)minutes+=1440;
      return minutes;
    }
  }
  return activity.duree?dureeValeurMinutes(activity.duree):0;
}
function rStatsActivites(){
  const annStr=String(stAnnee);
  const agents=[...USERS].sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  const allData=actGetData().filter(a=>!activityIsFraisAdministratifs(a)||canAccessFraisAdministratifs());
  const data=allData.filter(a=>a.date&&a.date.startsWith(annStr));
  function minToHHMM(m){return pad(Math.floor(m/60))+':'+pad(m%60);}

  const ST_MOIS_COURT=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const moisActifs=stMois>0?[stMois]:Array.from({length:12},(_,i)=>i+1);

  let thMois=moisActifs.map(m=>'<th style="padding:4px 5px;text-align:center;font-size:10px;min-width:42px;border-left:1px solid #e0e0e0;">'+ST_MOIS_COURT[m-1]+'</th>').join('');
  let rows=''; let grandBrut=0;

  agents.forEach(u=>{
    let totBrut=0;
    const cols=moisActifs.map(mi=>{
      const mStr=annStr+'-'+String(mi).padStart(2,'0');
      const items=data.filter(a=>a.date.startsWith(mStr)&&activityParticipantLogins(a).includes(u.l));
      let mins=0;
      items.forEach(a=>{mins+=statsActivityRecordedMinutes(a);});
      totBrut+=mins;
      return '<td style="padding:3px 5px;text-align:center;font-size:10px;border-left:1px solid #e0e0e0;'+(mins?'font-weight:700;background:#EAF3DE;':'')+'">'+(mins?minToHHMM(mins):'—')+'</td>';
    }).join('');
    grandBrut+=totBrut;
    // Afficher TOUS les agents (même à 0), comme Personnel/Heures
    rows+='<tr style="border-bottom:1px solid #f5f5f5;">'
      +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+'</td>'
      +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
      +cols
      +'<td style="padding:3px 5px;text-align:center;font-size:10px;font-weight:700;background:#f5f5f5;border-left:2px solid #ccc;">'+(totBrut?minToHHMM(totBrut):'—')+'</td>'
      +'</tr>';
  });

  const footer='<tr style="background:var(--t);color:#fff;font-weight:700;">'
    +'<td style="padding:6px 8px;font-size:11px;">TOTAL</td><td></td>'
    +moisActifs.map(()=>'<td style="border-left:1px solid #666;"></td>').join('')
    +'<td style="padding:4px 5px;text-align:center;border-left:2px solid #999;">'+(grandBrut?minToHHMM(grandBrut):'—')+'</td>'
    +'</tr>';

  return '<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;">'
    +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Heures enregistrées d\'activités de service par agent — '+stAnnee+(stMois>0?' — '+ST_MOIS_COURT[stMois-1]:'')+'</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:11px;">'
    +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:120px;">Agent</th><th style="padding:5px 5px;font-size:10px;">Grade</th>'
    +thMois
    +'<th style="padding:4px 6px;text-align:center;border-left:2px solid #ccc;font-size:10px;">Total</th>'
    +'</tr></thead><tbody>'+rows+'</tbody>'
    +'<tfoot>'+footer+'</tfoot></table></div>';
}

// ── Stats formations ──
// Les statistiques affichent le temps réellement enregistré sur la feuille.
// Les taux (75 %, 100 %, etc.) restent réservés à l'export administratif.
function statsFmpaRecordedMinutes(f){
  if(!f||!f.hDebut||!f.hFin)return 0;
  const debut=f.hDebut.split(':').map(Number),fin=f.hFin.split(':').map(Number);
  if(debut.some(Number.isNaN)||fin.some(Number.isNaN))return 0;
  let minutes=(fin[0]*60+fin[1])-(debut[0]*60+debut[1]);
  if(minutes<0)minutes+=1440;
  return minutes;
}
function statsFormationRecordedMinutes(f){
  return f?formMinsTotal(f):0;
}
function rStatsFormations(){
  const annStr=String(stAnnee);
  const agents=[...USERS].sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  function minToHHMM(m){return pad(Math.floor(m/60))+':'+pad(m%60);}

  const ST_MOIS_COURT=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const moisActifs=stMois>0?[stMois]:Array.from({length:12},(_,i)=>i+1);
  const nbCols=moisActifs.length+3; // Agent + Grade + mois... + Total

  const fmpasAll=fmpaGetData().filter(f=>f.date&&f.date.startsWith(annStr));
  const stagAll=formStagGetData().filter(f=>f.ddebut&&f.ddebut.startsWith(annStr));
  const formAll=formFormGetData().filter(f=>f.ddebut&&f.ddebut.startsWith(annStr));

  function filtMois(arr,mi,dateField){
    const mStr=annStr+'-'+String(mi).padStart(2,'0');
    return arr.filter(f=>(f[dateField]||'').startsWith(mStr));
  }

  let rows=''; let grandBrut=0;
  const uid=()=>Math.random().toString(36).slice(2,7);

  agents.forEach(u=>{
    let totBrut=0;
    // Totaux par type sur toute l'année (ou le mois sélectionné)
    let totFmpaStag=0,totFmpaForm=0,totStag=0,totForm=0;

    const cols=moisActifs.map(mi=>{
      const fmpas=filtMois(fmpasAll,mi,'date');
      const stag=filtMois(stagAll,mi,'ddebut');
      const form=filtMois(formAll,mi,'ddebut');
      let mins=0;
      fmpas.forEach(f=>{
        const m=statsFmpaRecordedMinutes(f);
        if((f.participants||[]).includes(u.l)){mins+=m;totFmpaStag+=m;}
        if((f.formateurs||[]).includes(u.l)){mins+=m;totFmpaForm+=m;}
      });
      stag.forEach(f=>{if((f.participants||[]).includes(u.l)){const m=statsFormationRecordedMinutes(f);mins+=m;totStag+=m;}});
      form.forEach(f=>{if((f.participants||[]).includes(u.l)){const m=statsFormationRecordedMinutes(f);mins+=m;totForm+=m;}});
      totBrut+=mins;
      return '<td style="padding:3px 5px;text-align:center;font-size:10px;border-left:1px solid #e0e0e0;'+(mins?'font-weight:700;background:#EAF3DE;':'')+'">'+(mins?minToHHMM(mins):'—')+'</td>';
    }).join('');
    grandBrut+=totBrut;

    const rowId='frow_'+uid();
    // Ligne principale agent
    rows+='<tr style="border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="tg(\''+rowId+'\',null)">'
      +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+' <span style="font-size:10px;color:var(--t2);">▸</span></td>'
      +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
      +cols
      +'<td style="padding:3px 5px;text-align:center;font-size:10px;font-weight:700;background:#f5f5f5;border-left:2px solid #ccc;">'+(totBrut?minToHHMM(totBrut):'—')+'</td>'
      +'</tr>';
    // Ligne détail par type (masquée par défaut)
    const detail=[]
    if(totFmpaStag)detail.push('<span style="background:#FEF9C3;border-radius:4px;padding:1px 6px;font-size:10px;">🚒 FMPA stag. '+minToHHMM(totFmpaStag)+'</span>');
    if(totFmpaForm)detail.push('<span style="background:#FAEEDA;border-radius:4px;padding:1px 6px;font-size:10px;">🚒 FMPA form. '+minToHHMM(totFmpaForm)+'</span>');
    if(totStag)detail.push('<span style="background:#EAF3DE;border-radius:4px;padding:1px 6px;font-size:10px;">👨‍🎓 Form. stag. '+minToHHMM(totStag)+'</span>');
    if(totForm)detail.push('<span style="background:#E8F5E9;border-radius:4px;padding:1px 6px;font-size:10px;">👨‍🏫 Form. form. '+minToHHMM(totForm)+'</span>');
    rows+='<tr id="'+rowId+'" style="display:none;background:#fafafa;"><td colspan="'+nbCols+'" style="padding:4px 12px 6px;border-bottom:1px solid #e0e0e0;">'
      +(detail.length?detail.join(' '):'<span style="font-size:10px;color:var(--t2);">—</span>')
      +'</td></tr>';
  });

  const thMois=moisActifs.map(m=>'<th style="padding:4px 5px;text-align:center;font-size:10px;min-width:42px;border-left:1px solid #e0e0e0;">'+ST_MOIS_COURT[m-1]+'</th>').join('');
  const footer='<tr style="background:var(--t);color:#fff;font-weight:700;">'
    +'<td style="padding:6px 8px;font-size:11px;">TOTAL</td><td></td>'
    +moisActifs.map(()=>'<td style="border-left:1px solid #666;"></td>').join('')
    +'<td style="padding:4px 5px;text-align:center;border-left:2px solid #999;">'+(grandBrut?minToHHMM(grandBrut):'—')+'</td>'
    +'</tr>';

  const legende='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:10px;">'
    +'<span style="background:#FEF9C3;border-radius:4px;padding:1px 7px;">🚒 FMPA stagiaire</span>'
    +'<span style="background:#FAEEDA;border-radius:4px;padding:1px 7px;">🚒 FMPA formateur</span>'
    +'<span style="background:#EAF3DE;border-radius:4px;padding:1px 7px;">👨‍🎓 Formation stagiaire</span>'
    +'<span style="background:#E8F5E9;border-radius:4px;padding:1px 7px;">👨‍🏫 Formation formateur</span>'
    +'<span style="font-size:10px;color:var(--t2);margin-left:4px;">· Cliquer sur un agent pour voir le détail</span>'
    +'</div>';

  return '<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;">'
    +'<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Heures enregistrées de formations par agent — '+stAnnee+(stMois>0?' — '+ST_MOIS_COURT[stMois-1]:'')+'</div>'
    +legende
    +'<table style="width:100%;border-collapse:collapse;font-size:11px;">'
    +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:120px;">Agent</th><th style="padding:5px 5px;font-size:10px;">Grade</th>'
    +thMois
    +'<th style="padding:4px 6px;text-align:center;border-left:2px solid #ccc;font-size:10px;">Total</th>'
    +'</tr></thead><tbody>'+rows+'</tbody>'
    +'<tfoot>'+footer+'</tfoot></table></div>';
}

// ── Jours fériés français ──
function getJoursFeries(annee){
  // Calcul de Pâques (algorithme de Meeus/Jones/Butcher)
  const a=annee%19,b=Math.floor(annee/100),c=annee%100;
  const d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  const paques=new Date(annee,month-1,day);
  const lundi=new Date(paques);lundi.setDate(paques.getDate()+1);
  const ascension=new Date(paques);ascension.setDate(paques.getDate()+39);
  const pentecote=new Date(paques);pentecote.setDate(paques.getDate()+50);
  const fmt=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
  return new Set([
    annee+'-01-01', // Jour de l'an
    fmt(lundi),     // Lundi de Pâques
    annee+'-05-01', // Fête du Travail
    annee+'-05-08', // Victoire 1945
    fmt(ascension), // Ascension
    fmt(pentecote), // Lundi de Pentecôte
    annee+'-07-14', // Fête Nationale
    annee+'-08-15', // Assomption
    annee+'-11-01', // Toussaint
    annee+'-11-11', // Armistice
    annee+'-12-25', // Noël
  ]);
}

// ── Calcule les minutes par taux pour une intervention ──
// Retourne {t100, t150, t200} en minutes
function getInterventionTauxConfigFor(currentDate,hour,reportType){
  const t=getStatsTaux();
  const prefix=reportType==='SDIS'?'sdis':reportType==='RENF'?'renf':'inter';
  if(hour<7||hour>=22)return {categorie:'nuit',valeur:t[prefix+'Nuit']};
  const iso=currentDate.getFullYear()+'-'+pad(currentDate.getMonth()+1)+'-'+pad(currentDate.getDate());
  if(currentDate.getDay()===0||getJoursFeries(currentDate.getFullYear()).has(iso))
    return {categorie:'dimFerie',valeur:t[prefix+'DimFerie']};
  return {categorie:'jour',valeur:t[prefix+'Jour']};
}
function calcTauxIntervention(iv){
  if(!iv._hDebut||!iv._hFin)return null;
  const dateStr=statsInterventionDateKey(iv);
  if(dateStr.length<8)return null;
  const yr=parseInt(dateStr.slice(0,4)),mo=parseInt(dateStr.slice(4,6))-1,da=parseInt(dateStr.slice(6,8));

  const [dh,dm]=iv._hDebut.split(':').map(Number);
  const [fh,fm]=iv._hFin.split(':').map(Number);
  let startMin=dh*60+dm;
  let endMin=fh*60+fm;
  if(endMin<startMin)endMin+=1440; // passage à minuit ; égalité = 0 minute

  let t100=0,t150=0,t200=0;

  // Parcourir minute par minute (par tranches) sur 2 jours max
  let cur=startMin;
  while(cur<endMin){
    const next=Math.min(cur+1,endMin);
    const dayOff=Math.floor(cur/1440);
    const minOfDay=cur%1440;
    const hOfDay=Math.floor(minOfDay/60);

    // Calculer la date réelle de cette minute
    const curDate=new Date(yr,mo,da+dayOff);
    const taux=getInterventionTauxConfigFor(curDate,hOfDay,adminExportReportType(iv));
    if(taux.categorie==='jour')t100++;
    else if(taux.categorie==='dimFerie')t150++;
    else t200++;

    cur=next;
  }
  return {t100,t150,t200};
}
// ── Calcule les tranches de présence d'un agent sur une intervention (avec relèves) ──
function getAgentPresenceOnIV(iv,login){
  // Retourne une liste de {hDebut, hFin} pour cet agent sur cette intervention
  if(!iv._hDebut)return [];
  const periodes=[];
  const hFin=iv._hFin||getHHMM(N()); // si pas terminée, maintenant

  // Est-il dans l'équipage initial ?
  const inEq1=iv._equipage1&&iv._equipage1.some(function(e){return e.login===login;});
  const inEq2=iv._equipage2&&iv._equipage2.some(function(e){return e.login===login;});

  if(!iv._releves||!iv._releves.length){
    // Pas de relève : toute la durée
    if(inEq1||inEq2||iv.agr===login)periodes.push({hDebut:iv._hDebut,hFin});
    return periodes;
  }

  // Avec relèves : calculer les périodes de présence
  // Équipage initial → jusqu'à la 1ère relève qui le remplace
  if(inEq1||inEq2||iv.agr===login){
    const premiereReleve=iv._releves.find(function(r){
      return r.ancienEquipage.some(function(e){return e.login===login;});
    });
    if(premiereReleve){
      // Remplacé à hReleve, retour à hRetour
      const anc=premiereReleve.ancienEquipage.find(function(e){return e.login===login;});
      periodes.push({hDebut:iv._hDebut,hFin:premiereReleve.hReleve});
      // Temps de route retour (hReleve → hRetour)
      // Non compté comme intervention (en route)
    } else {
      // Jamais remplacé : toute la durée
      periodes.push({hDebut:iv._hDebut,hFin});
    }
  }

  // Dans les relèves en tant que remplaçant
  iv._releves.forEach(function(r){
    const membre=r.nouvelEquipage.find(function(e){return e.login===login;});
    if(!membre)return;
    const hDebut=membre.hDebut||r.hReleve;
    // Jusqu'à la relève suivante qui le remplace, ou fin de l'intervention
    const releveIdx=iv._releves.indexOf(r);
    const releveSuivante=iv._releves.slice(releveIdx+1).find(function(r2){
      return r2.ancienEquipage.some(function(e){return e.login===login;});
    });
    const hFinMembre=releveSuivante?releveSuivante.hReleve:hFin;
    periodes.push({hDebut,hFin:hFinMembre});
  });

  return periodes;
}

// ── Calcule les taux pour un agent sur une intervention (en tenant compte des relèves) ──
function calcTauxAgentIV(iv,login){
  const periodes=getAgentPresenceOnIV(iv,login);
  if(!periodes.length)return null;
  const dateStr=statsInterventionDateKey(iv);
  if(dateStr.length<8)return null;
  const yr=parseInt(dateStr.slice(0,4)),mo=parseInt(dateStr.slice(4,6))-1,da=parseInt(dateStr.slice(6,8));
  let t100=0,t150=0,t200=0;
  periodes.forEach(function(p){
    const [dh,dm]=p.hDebut.split(':').map(Number);
    const [fh,fm]=p.hFin.split(':').map(Number);
    let startMin=dh*60+dm;
    let endMin=fh*60+fm;
    if(endMin<startMin)endMin+=1440;
    let cur=startMin;
    while(cur<endMin){
      const dayOff=Math.floor(cur/1440);
      const minOfDay=cur%1440;
      const hOfDay=Math.floor(minOfDay/60);
      const curDate=new Date(yr,mo,da+dayOff);
      const taux=getInterventionTauxConfigFor(curDate,hOfDay,adminExportReportType(iv));
      if(taux.categorie==='jour')t100++;else if(taux.categorie==='dimFerie')t150++;else t200++;
      cur++;
    }
  });
  return {t100,t150,t200};
}

function calcExportTauxAgentIV(iv,login){
  if(!agentInIV(iv,login))return null;
  const bounds=adminExportInterventionDurationBounds(iv);
  const dateStr=adminExportInterventionStartDate(iv);
  if(!bounds.start||!bounds.end||dateStr.length<8)return null;
  const yr=parseInt(dateStr.slice(0,4),10),mo=parseInt(dateStr.slice(4,6),10)-1,da=parseInt(dateStr.slice(6,8),10);
  const startParts=String(bounds.start).split(':').map(Number),endParts=String(bounds.end).split(':').map(Number);
  if([yr,mo,da,startParts[0],startParts[1],endParts[0],endParts[1]].some(function(n){return !Number.isFinite(n);}))return null;
  let startMin=startParts[0]*60+startParts[1],endMin=endParts[0]*60+endParts[1];
  if(endMin<startMin)endMin+=1440;
  const totals={t100:0,t150:0,t200:0};
  for(let cur=startMin;cur<endMin;cur++){
    const dayOff=Math.floor(cur/1440),minOfDay=cur%1440,hour=Math.floor(minOfDay/60);
    const currentDate=new Date(yr,mo,da+dayOff);
    const category=getInterventionTauxConfigFor(currentDate,hour,adminExportReportType(iv)).categorie;
    if(category==='jour')totals.t100++;else if(category==='dimFerie')totals.t150++;else totals.t200++;
  }
  const shouldRound=getStatsTaux().exportRoundQuarter!==false&&adminExportReportType(iv)!=='SDIS';
  return {
    t100:shouldRound?adminExportRoundMinutesQuarter(totals.t100):totals.t100,
    t150:shouldRound?adminExportRoundMinutesQuarter(totals.t150):totals.t150,
    t200:shouldRound?adminExportRoundMinutesQuarter(totals.t200):totals.t200
  };
}

function statsPersonnelHoursShowReal(){
  const data=typeof CD==='function'?CD():null;
  return !!(data&&data._statsPersonnelHoursReal===true);
}
function statsHoursRealExportCell(realMinutes,exportMinutes,background,borderLeft,showReal){
  const minutes=showReal?realMinutes:exportMinutes;
  const hasValue=minutes>0;
  return '<td style="padding:3px 4px;text-align:center;font-size:10px;'+(borderLeft?'border-left:2px solid '+borderLeft+';':'')+(hasValue?'background:'+background+';':'')+'">'
    +(hasValue?'<strong style="white-space:nowrap;">'+adminExportMinutesHHMM(minutes)+'</strong>':'—')
    +'</td>';
}

function agentInIV(iv,login){
  if(iv.agr===login)return true;
  if(iv._equipage1&&iv._equipage1.some(function(e){return e.login===login;}))return true;
  if(iv._equipage2&&iv._equipage2.some(function(e){return e.login===login;}))return true;
  if(iv._releves&&iv._releves.some(function(r){
    return r.nouvelEquipage.some(function(e){return e.login===login;});
  }))return true;
  return false;
}
function rStatsPersonnel(vue){
  const annStr=String(stAnnee);
  const prefix=stMois>0?annStr+String(stMois).padStart(2,'0'):annStr;
  const ivsFiltres=IVS.filter(function(iv){return !iv._isPilip&&isInterventionComptabilisee(iv)&&statsInterventionInPeriod(iv,prefix);});

  // Tous les agents connus
  const agents=USERS.slice().sort(function(a,b){
    const na=(a.nom||'').toLowerCase()+(a.prenom||'').toLowerCase();
    const nb=(b.nom||'').toLowerCase()+(b.prenom||'').toLowerCase();
    return na.localeCompare(nb,'fr');
  });

  if(vue==='pers-ivs'){
    // ── Interventions par agent × mois/commune/nature ──
    const moisActifs=stMois>0?[stMois]:Array.from({length:12},function(_,i){return i+1;});
    const thMois=moisActifs.map(function(mi){return '<th style="padding:4px 5px;text-align:center;font-size:10px;min-width:28px;">'+ST_MOIS[mi-1].slice(0,3)+'</th>';}).join('');
    let rows='';
    agents.forEach(function(u){
      const ivAgent=ivsFiltres.filter(function(iv){return agentInIV(iv,u.l);});
      const tot=ivAgent.length;
      const cols=moisActifs.map(function(mi){
        const mStr=annStr+String(mi).padStart(2,'0');
        const nb=ivAgent.filter(function(iv){return statsInterventionInPeriod(iv,mStr);}).length;
        return '<td style="padding:4px 5px;text-align:center;font-size:11px;'+(nb?'font-weight:700;background:#EAF3DE;':'')+'">'+(nb||'\u2014')+'</td>';
      }).join('');
      rows+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.4;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+'</td>'
        +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
        +cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;">'+(tot||'\u2014')+'</td></tr>';
    });
    return '<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Interventions par agent</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:130px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>'
      +thMois+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Tot.</th></tr></thead>'
      +'<tbody>'+rows+'</tbody></table></div>';

  } else if(vue==='pers-heures'){
    function minToHHMM(m){return pad(Math.floor(m/60))+':'+pad(m%60);}
    const moisActifs=stMois>0?[stMois]:Array.from({length:12},function(_,i){return i+1;});
    const showRealHours=statsPersonnelHoursShowReal();
    const configuredRates=getStatsTaux();
    const rateBadge=function(code,jour,dim,nuit){
      return '<span style="background:#F8FAFC;border:1px solid var(--brd);border-radius:6px;padding:3px 8px;font-size:10px;"><strong>'+code+'</strong> : jour '+jour+' % · dim./férié '+dim+' % · nuit '+nuit+' %</span>';
    };
    const legende='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px;">'
      +'<span style="background:#EAF3DE;border-radius:6px;padding:2px 8px;font-size:11px;">Jour — Lun–Sam 07h–22h</span>'
      +'<span style="background:#FEF9C3;border-radius:6px;padding:2px 8px;font-size:11px;">Dim./férié — 07h–22h</span>'
      +'<span style="background:#FAEEDA;border-radius:6px;padding:2px 8px;font-size:11px;">Nuit — 22h–07h</span>'
      +'</div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;">'
      +rateBadge('INTER',configuredRates.interJour,configuredRates.interDimFerie,configuredRates.interNuit)
      +rateBadge('SDIS',configuredRates.sdisJour,configuredRates.sdisDimFerie,configuredRates.sdisNuit)
      +rateBadge('RENF',configuredRates.renfJour,configuredRates.renfDimFerie,configuredRates.renfNuit)
      +'</div>';

    let thHtml='<th style="padding:5px 8px;text-align:left;min-width:120px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>';
    moisActifs.forEach(function(mi){
      thHtml+='<th colspan="3" style="padding:4px 5px;text-align:center;font-size:10px;border-left:2px solid #e0e0e0;">'+ST_MOIS[mi-1].slice(0,3)+'</th>';
    });
    thHtml+='<th colspan="4" style="padding:4px 5px;text-align:center;font-size:10px;background:#f0f0f0;border-left:2px solid #ccc;">'+(stMois>0?'Total '+ST_MOIS[stMois-1]:'Total année')+'</th>';

    let thSub='<th></th><th></th>';
    moisActifs.forEach(function(){
      thSub+='<th style="padding:2px 3px;text-align:center;font-size:9px;color:#3B6D11;border-left:2px solid #e0e0e0;">Jour</th>'
        +'<th style="padding:2px 3px;text-align:center;font-size:9px;color:#854F0B;">Dim./férié</th>'
        +'<th style="padding:2px 3px;text-align:center;font-size:9px;color:#E24B4A;">Nuit</th>';
    });
    thSub+='<th style="padding:2px 3px;text-align:center;font-size:9px;color:#3B6D11;border-left:2px solid #ccc;">Jour</th>'
      +'<th style="padding:2px 3px;text-align:center;font-size:9px;color:#854F0B;">Dim./férié</th>'
      +'<th style="padding:2px 3px;text-align:center;font-size:9px;color:#E24B4A;">Nuit</th>'
      +'<th style="padding:2px 3px;text-align:center;font-size:9px;font-weight:700;color:var(--t);">Total</th>';

    let rows='';
    let grand100=0,grand150=0,grand200=0;
    let grandExport100=0,grandExport150=0,grandExport200=0;
    agents.forEach(function(u){
      const ivAgent=ivsFiltres.filter(function(iv){
        return agentInIV(iv,u.l);
      });
      let tot100=0,tot150=0,tot200=0,hasDonnes=false;
      let totExport100=0,totExport150=0,totExport200=0;
      const cols=moisActifs.map(function(mi){
        const mStr=annStr+String(mi).padStart(2,'0');
        const ivMois=ivAgent.filter(function(iv){
          const bounds=adminExportInterventionDurationBounds(iv);
          return statsInterventionInPeriod(iv,mStr)&&bounds.start&&bounds.end;
        });
        let m100=0,m150=0,m200=0;
        let mExport100=0,mExport150=0,mExport200=0;
        ivMois.forEach(function(iv){
          const t=calcTauxAgentIV(iv,u.l);
          if(!t)return;
          m100+=t.t100;m150+=t.t150;m200+=t.t200;
          const exportT=calcExportTauxAgentIV(iv,u.l);
          if(exportT){mExport100+=exportT.t100;mExport150+=exportT.t150;mExport200+=exportT.t200;}
        });
        tot100+=m100;tot150+=m150;tot200+=m200;
        totExport100+=mExport100;totExport150+=mExport150;totExport200+=mExport200;
        if(m100||m150||m200||mExport100||mExport150||mExport200)hasDonnes=true;
        return statsHoursRealExportCell(m100,mExport100,'#EAF3DE','#e0e0e0',showRealHours)
          +statsHoursRealExportCell(m150,mExport150,'#FEF9C3','',showRealHours)
          +statsHoursRealExportCell(m200,mExport200,'#FAEEDA','',showRealHours);
      }).join('');
      grand100+=tot100;grand150+=tot150;grand200+=tot200;
      grandExport100+=totExport100;grandExport150+=totExport150;grandExport200+=totExport200;
      const totGen=tot100+tot150+tot200;
      const totExportGen=totExport100+totExport150+totExport200;
      rows+='<tr style="border-bottom:1px solid #f5f5f5;'+(hasDonnes?'':'opacity:.4;')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+'</td>'
        +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
        +cols
        +statsHoursRealExportCell(tot100,totExport100,'#EAF3DE','#ccc',showRealHours)
        +statsHoursRealExportCell(tot150,totExport150,'#FEF9C3','',showRealHours)
        +statsHoursRealExportCell(tot200,totExport200,'#FAEEDA','',showRealHours)
        +statsHoursRealExportCell(totGen,totExportGen,'#F1F5F9','',showRealHours)
        +'</tr>';
    });
    const grandGen=grand100+grand150+grand200;
    const grandExportGen=grandExport100+grandExport150+grandExport200;
    const footCols=moisActifs.map(function(){return '<td colspan="3" style="border-left:2px solid #666;"></td>';}).join('');
    const footer='<tr style="background:var(--t);color:#fff;font-weight:700;">'
      +'<td style="padding:6px 8px;font-size:11px;">TOTAL GÉNÉRAL</td><td></td>'
      +footCols
      +'<td style="padding:4px 5px;text-align:center;border-left:2px solid #999;">'+minToHHMM(showRealHours?grand100:grandExport100)+'</td>'
      +'<td style="padding:4px 5px;text-align:center;">'+minToHHMM(showRealHours?grand150:grandExport150)+'</td>'
      +'<td style="padding:4px 5px;text-align:center;">'+minToHHMM(showRealHours?grand200:grandExport200)+'</td>'
      +'<td style="padding:4px 5px;text-align:center;">'+minToHHMM(showRealHours?grandGen:grandExportGen)+'</td>'
      +'</tr>';

    return '<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Heures d’interventions par agent et par tranche tarifaire — '+(showRealHours?'heures réelles':'heures utilisées pour l’export')+'</div>'
      +legende
      +'<table style="width:100%;border-collapse:collapse;font-size:11px;">'
      +'<thead>'
      +'<tr style="background:#f5f5f5;">'+thHtml+'</tr>'
      +'<tr style="background:#fafafa;border-bottom:2px solid #e0e0e0;">'+thSub+'</tr>'
      +'</thead><tbody>'+rows+'</tbody>'
      +'<tfoot>'+footer+'</tfoot>'
      +'</table></div>';

  } else if(vue==='pers-dispos'){
    // ── Heures de disponibilités par agent × jour de semaine et par mois ──
    const JOURS_COURTS=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const dispoStore=DISPOS&&typeof DISPOS==='object'?DISPOS:{};
    const piquetStore=PIQUETS&&typeof PIQUETS==='object'?PIQUETS:{};
    const gran=Math.max(1,parseInt(ASTR_CONFIG&&ASTR_CONFIG.granularity,10)||60);
    const minParSlot=gran;

    // Une semaine peut commencer dans l'année précédente ou suivante :
    // chaque journée est donc rattachée à sa date civile réelle.
    const semaines=Object.keys(dispoStore);

    function minDispoAgent(login,filtre){
      let total=0;
      // Utiliser la granularité de l'équipe de l'agent (comme lors de la saisie)
      const eq=getEquipeOfUser(login);
      const agentGran=Math.max(1,parseInt(eq&&eq.granularity,10)||gran);
      const slotsParJour=Math.floor(1440/agentGran);
      semaines.forEach(function(wk){
        const weekData=dispoStore[wk]&&typeof dispoStore[wk]==='object'?dispoStore[wk]:{};
        const d=weekData[login]&&typeof weekData[login]==='object'?weekData[login]:null;if(!d)return;
        const parJour={};
        Object.keys(d).forEach(function(key){
          if(!d[key])return;
          const parts=key.split('_');
          const dayIdx=parseInt(parts[0]);
          const slotIdx=parseInt(parts[1]);
          if(slotIdx>=slotsParJour)return;
          if(!parJour[dayIdx])parJour[dayIdx]=new Set();
          parJour[dayIdx].add(slotIdx);
        });
        Object.keys(parJour).forEach(function(dayIdx){
          const di=parseInt(dayIdx);
          const yr=parseInt(wk.slice(0,4)),mo=parseInt(wk.slice(4,6)),da=parseInt(wk.slice(6,8));
          const dt=new Date(yr,mo-1,da);dt.setDate(dt.getDate()+di);
          if(dt.getFullYear()!==stAnnee)return;
          const actualDayIndex=dt.getDay()===0?6:dt.getDay()-1;
          if(filtre&&filtre.type==='jour'&&actualDayIndex!==filtre.val)return;
          const targetMonth=filtre&&filtre.type==='mois'?filtre.val:stMois;
          if(targetMonth>0&&dt.getMonth()+1!==targetMonth)return;
          const slotsCochés=Math.min(parJour[dayIdx].size,slotsParJour);
          total+=slotsCochés*agentGran;
        });
      });
      return total;
    }
    function minToHHMM(m){return pad(Math.floor(m/60))+':'+pad(m%60);}

    // Tableau par jour de semaine
    let rowsJour='';
    agents.forEach(function(u){
      const cols=JOURS_COURTS.map(function(j,di){
        const mins=minDispoAgent(u.l,{type:'jour',val:di});
        return '<td style="padding:4px 5px;text-align:center;font-size:10px;'+(mins?'background:#EAF3DE;font-weight:600;':'')+'">'+(mins?minToHHMM(mins):'\u2014')+'</td>';
      }).join('');
      const tot=minDispoAgent(u.l,null);
      rowsJour+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.4;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+'</td>'
        +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
        +cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;font-size:10px;">'+(tot?minToHHMM(tot):'\u2014')+'</td></tr>';
    });
    const thJours=JOURS_COURTS.map(function(j){return '<th style="padding:4px 5px;text-align:center;font-size:10px;">'+j+'</th>';}).join('');

    // Tableau par mois
    const moisActifs=stMois>0?[stMois]:Array.from({length:12},function(_,i){return i+1;});
    const thMois2=moisActifs.map(function(mi){return '<th style="padding:4px 5px;text-align:center;font-size:10px;min-width:36px;">'+ST_MOIS[mi-1].slice(0,3)+'</th>';}).join('');
    let rowsMois='';
    agents.forEach(function(u){
      const cols=moisActifs.map(function(mi){
        const mins=minDispoAgent(u.l,{type:'mois',val:mi});
        return '<td style="padding:4px 5px;text-align:center;font-size:10px;'+(mins?'background:#EAF3DE;font-weight:600;':'')+'">'+(mins?minToHHMM(mins):'\u2014')+'</td>';
      }).join('');
      const tot=minDispoAgent(u.l,null);
      rowsMois+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.4;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+'</td>'
        +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
        +cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;font-size:10px;">'+(tot?minToHHMM(tot):'\u2014')+'</td></tr>';
    });

    // ── Heures de piquet par agent × semaine ──
    function minPiquetAgent(login,filtre){
      let total=0;
      const allWks=Object.keys(piquetStore);
      allWks.forEach(function(wk){
        const weekPiquets=Array.isArray(piquetStore[wk])?piquetStore[wk]:[];
        weekPiquets.forEach(function(p){
          const jourIndex=JOURS_FULL.indexOf(p.jour);
          if(jourIndex<0)return;
          let offset=-1;
          for(let oi=0;oi<7;oi++){if(jourLabel(oi,true)===p.jour){offset=oi;break;}}
          if(offset<0)return;
          const yr=parseInt(wk.slice(0,4)),mo=parseInt(wk.slice(4,6)),da=parseInt(wk.slice(6,8));
          const piquetDate=new Date(yr,mo-1,da);piquetDate.setDate(piquetDate.getDate()+offset);
          if(piquetDate.getFullYear()!==stAnnee)return;
          if(filtre&&filtre.type==='jour'&&jourIndex!==filtre.val)return;
          const targetMonth=filtre&&filtre.type==='mois'?filtre.val:stMois;
          if(targetMonth>0&&piquetDate.getMonth()+1!==targetMonth)return;
          const membres=Array.isArray(p.membres)&&p.membres.length?p.membres:[
            p.chefAgres?{login:p.chefAgres,hDebut:p.debut,hFin:p.fin}:null,
            p.conducteur?{login:p.conducteur,hDebut:p.debut,hFin:p.fin}:null,
            p.chefEquipe?{login:p.chefEquipe,hDebut:p.debut,hFin:p.fin}:null,
            p.stagiaire?{login:p.stagiaire,hDebut:p.debut,hFin:p.fin}:null,
          ].filter(Boolean);
          membres.forEach(function(m){
            if(m.login!==login)return;
            const dMin=timeToMin(m.hDebut||p.debut);
            const fMin=timeToMin(m.hFin||p.fin);
            const dur=fMin<=dMin?1440-dMin+fMin:fMin-dMin;
            total+=dur;
          });
        });
      });
      return total;
    }

    // Tableau piquets par jour de semaine
    let rowsPiqJour='';
    agents.forEach(function(u){
      const cols=JOURS_COURTS.map(function(j,di){
        const mins=minPiquetAgent(u.l,{type:'jour',val:di});
        return '<td style="padding:4px 5px;text-align:center;font-size:10px;'+(mins?'background:#FEF0E7;font-weight:600;':'')+'">'+(mins?minToHHMM(mins):'\u2014')+'</td>';
      }).join('');
      const tot=minPiquetAgent(u.l,null);
      rowsPiqJour+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.4;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+'</td>'
        +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
        +cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;font-size:10px;">'+(tot?minToHHMM(tot):'\u2014')+'</td></tr>';
    });

    // Tableau piquets par mois
    let rowsPiqMois='';
    agents.forEach(function(u){
      const cols=moisActifs.map(function(mi){
        const mins=minPiquetAgent(u.l,{type:'mois',val:mi});
        return '<td style="padding:4px 5px;text-align:center;font-size:10px;'+(mins?'background:#FEF0E7;font-weight:600;':'')+'">'+(mins?minToHHMM(mins):'\u2014')+'</td>';
      }).join('');
      const tot=minPiquetAgent(u.l,null);
      rowsPiqMois+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.4;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+'</td>'
        +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
        +cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;font-size:10px;">'+(tot?minToHHMM(tot):'\u2014')+'</td></tr>';
    });

    const dispoPeriodLabel=stMois>0?ST_MOIS[stMois-1]+' '+stAnnee:String(stAnnee);
    return '<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;margin-bottom:12px;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Disponibilit\u00e9s par jour de semaine ('+dispoPeriodLabel+')</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:130px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>'
      +thJours+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Total</th></tr></thead>'
      +'<tbody>'+rowsJour+'</tbody></table></div>'
      +'<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;margin-bottom:12px;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Disponibilit\u00e9s par mois ('+dispoPeriodLabel+')</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:130px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>'
      +thMois2+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Total</th></tr></thead>'
      +'<tbody>'+rowsMois+'</tbody></table></div>'
      +'<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;margin-bottom:12px;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">&#x1F4CC; Heures de piquet par jour de semaine ('+dispoPeriodLabel+')</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#FEF0E7;"><th style="padding:5px 8px;text-align:left;min-width:130px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>'
      +thJours+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Total</th></tr></thead>'
      +'<tbody>'+rowsPiqJour+'</tbody></table></div>'
      +'<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">&#x1F4CC; Heures de piquet par mois ('+dispoPeriodLabel+')</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#FEF0E7;"><th style="padding:5px 8px;text-align:left;min-width:130px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>'
      +thMois2+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Total</th></tr></thead>'
      +'<tbody>'+rowsPiqMois+'</tbody></table></div>';
  }
  if(vue==='pers-act') return rStatsActivites();
  if(vue==='pers-form') return rStatsFormations();
  return '';
}

function rStatsHeader(){
  if(!CU)return;
  updateRenfortBadge();
  const el=document.getElementById('stats-header-inner');
  if(!el)return;
  const d=N();
  const annee=String(d.getFullYear());
  const moisStr=annee+String(d.getMonth()+1).padStart(2,'0');
  const todayStr=moisStr+String(d.getDate()).padStart(2,'0');
  const ivStats=IVS.filter(iv=>!iv._isPilip&&iv.s!=='annulee'&&!iv._refugeAnimalier);
  const nbJour=ivStats.filter(iv=>statsInterventionInPeriod(iv,todayStr)).length;
  const nbMois=ivStats.filter(iv=>statsInterventionInPeriod(iv,moisStr)).length;
  const nbAnnee=ivStats.filter(iv=>statsInterventionInPeriod(iv,annee)).length;
  const nbAttente=ivStats.filter(iv=>iv.s==='en-attente').length;
  const nbEnCours=ivStats.filter(iv=>iv.s==='en-cours').length;
  const items=[
    {lbl:'En attente',val:nbAttente,col:'var(--amb)'},
    {lbl:'En cours',val:nbEnCours,col:'var(--grn)'},
    {lbl:"Aujourd'hui",val:nbJour,col:'var(--red)'},
    {lbl:'Ce mois',val:nbMois,col:'var(--blu)'},
    {lbl:String(d.getFullYear()),val:nbAnnee,col:'var(--t)'},
  ];
  el.innerHTML=items.map(it=>'<div style="display:flex;align-items:center;gap:6px;padding:4px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--brd);">'
    +'<span style="font-size:15px;font-weight:700;color:'+it.col+';">'+it.val+'</span>'
    +'<span style="font-size:11px;color:var(--t2);">'+it.lbl+'</span></div>').join('');
}

// ── Export mensuel administrateur : interventions, activités, formations et astreintes tél. ──
function canUseMonthlyExport(){
  return isSuperAdmin()||(hasRight('Administration')&&getStatsTaux().exportAdmins===true);
}
function openAdminMonthlyExport(){
  if(!canUseMonthlyExport()){showToast('Export réservé au super-administrateur','warn');return;}
  const now=N();
  const selectedMonth=stMois>0?stMois:now.getMonth()+1;
  const selectedYear=stAnnee||now.getFullYear();
  const moisOptions=ST_MOIS.map(function(m,i){
    return '<option value="'+(i+1)+'"'+(selectedMonth===i+1?' selected':'')+'>'+m+'</option>';
  }).join('');
  document.getElementById('mt').textContent='Exporter les registres mensuels';
  document.getElementById('mi').textContent='Interventions terminées, activités de service, formations et astreintes téléphoniques';
  document.getElementById('mb').innerHTML='<div>'
    +'<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:9px;padding:9px 11px;margin-bottom:12px;font-size:12px;color:#1E40AF;">'
    +'Le fichier Excel contiendra un seul onglet « Registre » réunissant les interventions, activités de service, formations et astreintes téléphoniques dans les 63 colonnes du modèle fourni.</div>'
    +'<div class="fg-duo">'
    +'<div class="fg"><div class="fgl">Mois</div><select class="fi" id="admin-export-month">'+moisOptions+'</select></div>'
    +'<div class="fg"><div class="fgl">Année</div><input class="fi" id="admin-export-year" type="number" min="2000" max="2100" value="'+selectedYear+'"/></div>'
    +'</div>'
    +'<div id="admin-export-summary" style="font-size:12px;color:var(--t2);margin:4px 0 12px;"></div>'
    +'<div class="brow"><button class="btn pr" onclick="exportAdminMonthlyExcel()">&#x1F4E5; Exporter le fichier Excel</button>'
    +'<button class="btn" onclick="cM()">Annuler</button></div></div>';
  openModalAtTop('admin-export-month');
  adminMonthlyExportSummary();
  ['admin-export-month','admin-export-year'].forEach(function(id){
    const el=document.getElementById(id);if(el)el.addEventListener('change',adminMonthlyExportSummary);
  });
}

function adminMonthlyPeriod(){
  const month=parseInt(document.getElementById('admin-export-month')?.value||'0',10);
  const year=parseInt(document.getElementById('admin-export-year')?.value||'0',10);
  if(month<1||month>12||year<2000||year>2100)return null;
  const mm=String(month).padStart(2,'0');
  const prefixDate=year+'-'+mm;
  const prefixCompact=String(year)+mm;
  const lastDay=new Date(year,month,0).getDate();
  return {month,year,mm,prefixDate,prefixCompact,start:prefixDate+'-01',end:prefixDate+'-'+String(lastDay).padStart(2,'0')};
}

function adminMonthlyData(period){
  const overlaps=function(start,end){
    if(!start)return false;
    const realEnd=end||start;
    return start<=period.end&&realEnd>=period.start;
  };
  const interventions=[].concat(IVS||[],PILP_IVS||[])
    .filter(function(iv){return isInterventionComptabilisee(iv)&&adminExportInterventionStartDate(iv).startsWith(period.prefixCompact);});
  const activites=(actGetData()||[]).filter(function(a){return (a.date||'').startsWith(period.prefixDate)&&(!activityIsFraisAdministratifs(a)||canAccessFraisAdministratifs());});
  const fmpas=(fmpaGetData()||[]).filter(function(f){return (f.date||'').startsWith(period.prefixDate);});
  const stag=(formStagGetData()||[]).filter(function(f){return overlaps(f.ddebut,f.dfin);});
  const form=(formFormGetData()||[]).filter(function(f){return overlaps(f.ddebut,f.dfin);});
  const astreintesTel=(USERS||[]).map(function(u){
    return {login:u.l,heures:astrTelTotalMois(u.l,period.year,period.month-1)};
  }).filter(function(a){return a.login&&a.heures>0;});
  return {interventions,activites,fmpas,stag,form,astreintesTel};
}

function adminMonthlyExportSummary(){
  const period=adminMonthlyPeriod(),el=document.getElementById('admin-export-summary');
  if(!period||!el)return;
  const d=adminMonthlyData(period);
  el.innerHTML='<strong>'+d.interventions.length+'</strong> intervention(s) terminée(s) · '
    +'<strong>'+d.activites.length+'</strong> activité(s) · '
    +'<strong>'+(d.fmpas.length+d.stag.length+d.form.length)+'</strong> formation(s) · '
    +'<strong>'+d.astreintesTel.length+'</strong> agent(s) en astreinte téléphonique';
}

function adminExportDateCompact(h){
  if(!h||h.length<8)return '';
  return h.slice(6,8)+'/'+h.slice(4,6)+'/'+h.slice(0,4);
}
function adminExportTimeCompact(h){
  if(!h||h.length<13)return '';
  return h.slice(9,11)+':'+h.slice(11,13);
}
function adminExportInterventionStartDate(iv){
  const inherited=String(iv&&iv._departureInheritedDate||'').replace(/\D/g,'').slice(0,8);
  if(/^\d{8}$/.test(inherited))return inherited;
  const timeline=Array.isArray(iv&&iv.tl)?iv.tl:[];
  const departure=timeline.find(function(entry){
    return entry&&entry.s==='en-cours'&&/^\d{8}/.test(String(entry.h||''));
  });
  const referenceStamp=String(departure&&departure.h||iv&&iv.h||'');
  if(!/^\d{8}/.test(referenceStamp))return '';
  const compact=referenceStamp.slice(0,8);
  const startTime=String(iv&&(
    (iv._sdis&&iv._hAcquis)||iv._hDebut||iv._hDebutReelle||iv._hDebutInitiale||''
  )||'');
  const startMatch=startTime.match(/^(\d{1,2}):(\d{2})$/);
  const referenceTime=adminExportTimeCompact(referenceStamp);
  const referenceMatch=referenceTime.match(/^(\d{2}):(\d{2})$/);
  if(!startMatch||!referenceMatch)return compact;
  const year=parseInt(compact.slice(0,4),10);
  const month=parseInt(compact.slice(4,6),10)-1;
  const day=parseInt(compact.slice(6,8),10);
  const startMinutes=parseInt(startMatch[1],10)*60+parseInt(startMatch[2],10);
  const referenceMinutes=parseInt(referenceMatch[1],10)*60+parseInt(referenceMatch[2],10);
  if(startMinutes<0||startMinutes>=1440||referenceMinutes<0||referenceMinutes>=1440)return compact;
  const date=new Date(year,month,day);
  if(!departure&&referenceMinutes-startMinutes>720){
    date.setDate(date.getDate()+1);
  }else if(startMinutes>referenceMinutes&&referenceMinutes+1440-startMinutes<=15){
    date.setDate(date.getDate()-1);
  }
  return String(date.getFullYear())
    +String(date.getMonth()+1).padStart(2,'0')
    +String(date.getDate()).padStart(2,'0');
}
function adminExportUser(login){
  if(!login)return '';
  const u=USERS.find(function(x){return x.l===login;});
  return u?[u.nom||'',u.prenom||''].filter(Boolean).join(' '):login;
}
function adminExportInterventionChef(iv){
  if(!iv)return '';
  let login=iv.agr||'';
  if(!login){
    const member=[].concat(iv._equipage1||[],iv._equipage2||[]).find(function(item){
      return item&&item.login&&interventionRoleKey(item.role)==='chefdagres';
    });
    login=(member&&member.login)||iv._agr2||'';
  }
  return adminExportUser(login);
}
function adminExportDuration(value,hd,hf){
  if(value)return dureeFormatHHMM(value,hd,hf)||value;
  return hd&&hf?dureeHHMM(hd,hf):'';
}
function adminExportReportType(iv){
  if(iv&&iv._isRenfort)return reportTypeCode('renf');
  if(iv&&iv._sdis)return reportTypeCode('sdis');
  return reportTypeCode('inter');
}
function adminExportMinutesHHMM(minutes){
  const total=Math.max(0,parseInt(minutes,10)||0);
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function adminExportRoundMinutesQuarter(minutes){
  const total=Math.max(0,parseInt(minutes,10)||0);
  if(total===0)return 0;
  return Math.ceil(total/15)*15;
}
function adminExportFormatInterventionMinutes(minutes,iv){
  const enabled=getStatsTaux().exportRoundQuarter!==false&&adminExportReportType(iv)!=='SDIS';
  return adminExportMinutesHHMM(enabled?adminExportRoundMinutesQuarter(minutes):minutes);
}
function adminExportRoundDurationQuarter(value,iv){
  if(getStatsTaux().exportRoundQuarter===false||adminExportReportType(iv)==='SDIS'||!value)return value||'';
  const match=String(value).match(/^(\d+):(\d{2})$/);
  if(!match)return value;
  return adminExportMinutesHHMM(adminExportRoundMinutesQuarter(Number(match[1])*60+Number(match[2])));
}
function adminExportInterventionDurationBounds(iv){
  if(!iv)return {start:'',end:''};
  if(adminExportReportType(iv)==='SDIS'){
    return {
      start:iv._hAcquis||iv._hDebut||'',
      end:iv._hOpTerminee||iv._hFin||''
    };
  }
  return {start:iv._hDebut||'',end:iv._hFin||''};
}
function adminExportInterventionRates(iv){
  const bounds=adminExportInterventionDurationBounds(iv);
  const fallbackDuration=adminExportDuration('',bounds.start,bounds.end);
  const fallback={taux1:'',heures1:adminExportRoundDurationQuarter(fallbackDuration,iv),taux2:'',heures2:''};
  const dateStr=adminExportInterventionStartDate(iv);
  if(!iv||!bounds.start||!bounds.end||dateStr.length<8)return fallback;
  const yr=parseInt(dateStr.slice(0,4),10),mo=parseInt(dateStr.slice(4,6),10)-1,da=parseInt(dateStr.slice(6,8),10);
  const debut=String(bounds.start).split(':').map(Number),fin=String(bounds.end).split(':').map(Number);
  if([yr,mo,da,debut[0],debut[1],fin[0],fin[1]].some(function(n){return !Number.isFinite(n);}))return fallback;
  let startMin=debut[0]*60+debut[1],endMin=fin[0]*60+fin[1];
  if(endMin===startMin){
    const tauxZero=getInterventionTauxConfigFor(new Date(yr,mo,da),debut[0],adminExportReportType(iv)).valeur;
    return {taux1:tauxZero+'%',heures1:'00:00',taux2:'',heures2:''};
  }
  if(endMin<startMin)endMin+=1440;
  const totals={},ordre=[];
  for(let cur=startMin;cur<endMin;cur++){
    const dayOff=Math.floor(cur/1440),minOfDay=cur%1440,hour=Math.floor(minOfDay/60);
    const currentDate=new Date(yr,mo,da+dayOff);
    const taux=getInterventionTauxConfigFor(currentDate,hour,adminExportReportType(iv)).valeur;
    totals[taux]=(totals[taux]||0)+1;
    if(!ordre.includes(taux))ordre.push(taux);
  }
  const parts=ordre.filter(function(taux){return totals[taux]>0;}).map(function(taux){
    return {taux:taux+'%',heures:adminExportFormatInterventionMinutes(totals[taux],iv)};
  });
  if(!parts.length)return fallback;
  if(parts.length===1)return {taux1:parts[0].taux,heures1:parts[0].heures,taux2:'',heures2:''};
  if(parts.length===2)return {taux1:parts[0].taux,heures1:parts[0].heures,taux2:parts[1].taux,heures2:parts[1].heures};
  return {
    taux1:parts[0].taux,
    heures1:parts[0].heures,
    taux2:parts.slice(1).map(function(p){return p.taux;}).join(' + '),
    heures2:parts.slice(1).map(function(p){return p.heures;}).join(' + ')
  };
}
function adminExportInterventionPresents(iv){
  const seen={},out=[];
  function add(login){
    if(!login||seen[login]||out.length>=31)return;
    seen[login]=true;
    out.push(adminExportUser(login));
  }
  add(iv.agr,"Chef d'agrès");add(iv._agr2,"Chef d'agrès");
  (iv._equipage1||[]).forEach(function(e){add(e.login,e.role);});
  (iv._equipage2||[]).forEach(function(e){add(e.login,e.role);});
  (iv._releves||[]).forEach(function(r){(r.nouvelEquipage||[]).forEach(function(e){add(e.login,e.role);});});
  return out;
}
function adminExportPeople(logins){
  return (logins||[]).slice(0,31).map(function(login){return adminExportUser(login);});
}
function adminExportPad31(values){
  const out=(values||[]).slice(0,31);
  while(out.length<31)out.push('');
  return out;
}
function adminExportDateIso(value){
  const text=String(value||'');
  const m=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?m[3]+'/'+m[2]+'/'+m[1]:text;
}
function adminExportRegisterRow(values,presents){
  const row=Array(32).fill('');
  Object.keys(values||{}).forEach(function(index){row[parseInt(index,10)]=values[index];});
  return row.concat(adminExportPad31(presents));
}
function adminExportRegisterDateKey(row){
  const text=String((row||[])[4]||'');
  const m=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m?m[3]+m[2]+m[1]:text;
}
function adminExportActivityCategory(a){
  if(a&&a.categorie)return a.categorie;
  const def=ACT_TYPES.find(t=>t.l===String(a&&a.type||''));
  if(def&&def.cat)return def.cat;
  return defaultActivityCategory(a&&a.type);
}
function adminExportActivityReportType(a){
  const category=adminExportActivityCategory(a);
  if(isAdminExpenseCategory(category))return reportTypeCode('fa');
  if(category==='D\u00e9placements')return reportTypeCode('depl');
  return reportTypeCode('ac');
}
function adminExportActivityRegisterRow(a,exportRates){
  const agents=activityParticipantLogins(a);
  const reportType=adminExportActivityReportType(a);
  const rate=reportType===reportTypeCode('fa')?exportRates.fraisAdmin:reportType===reportTypeCode('depl')?'':exportRates.actSvc;
  return adminExportRegisterRow({
    4:adminExportDateIso(a.date),5:reportType,6:rate===''?'':rate+'%',
    7:adminExportDuration(a.duree,a.hDebut,a.hFin),11:a.type||'',
    16:a.hDebut||'',19:a.hFin||''
  },adminExportPeople(agents));
}
function adminExportFmpaRegisterRows(f,exportRates){
  const rows=[];
  const stagiaires=adminExportPeople(f.participants);
  const formateurs=adminExportPeople(f.formateurs);
  const push=function(nature,rapport,taux,personnes){
    rows.push(adminExportRegisterRow({
      4:adminExportDateIso(f.date),5:rapport,6:taux+'%',
      7:adminExportDuration(f.duree,f.hDebut,f.hFin),11:nature,
      16:f.hDebut||'',19:f.hFin||''
    },personnes));
  };
  if(stagiaires.length)push('Manoeuvre mensuel',reportTypeCode('ac'),exportRates.actSvc,stagiaires);
  if(formateurs.length)push('Formateur',reportTypeCode('form'),exportRates.formRate,formateurs);
  if(!stagiaires.length&&!formateurs.length)push('Manoeuvre mensuel',reportTypeCode('ac'),exportRates.actSvc,[]);
  return rows;
}
function adminExportFormationRegisterRow(f,nature,rapport,taux){
  const debut=f.hmatind||f.hapremd||'',fin=f.hapremf||f.hmatinf||'';
  return adminExportRegisterRow({
    4:adminExportDateIso(f.ddebut),5:rapport,6:taux+'%',
    7:adminExportDuration(f.htotal,'',''),11:nature,
    13:f.lieu||'',16:debut,19:fin
  },adminExportPeople(f.participants));
}
function adminExportAstrTelRegisterRow(a,period,exportRates){
  return adminExportRegisterRow({
    4:adminExportDateIso(period.end),5:reportTypeCode('ast'),6:exportRates.astrTel+'%',
    7:astrTelFormatHeures(a.heures)
  },adminExportPeople([a.login]));
}
function adminExportVehicles(iv){
  const engins=[iv.eng,iv._engin1,iv._engin2].filter(Boolean);
  const norm=function(v){return String(v).toUpperCase().replace(/[^A-Z0-9]/g,'');};
  const is=function(pattern){return engins.some(function(e){return pattern.test(norm(e));});};
  const autres=engins.filter(function(e){return !/^(VTU0?1|VTU0?2|VPI)$/.test(norm(e));});
  return {
    vtu1:is(/^VTU0?1$/)?'X':'',
    vtu2:is(/^VTU0?2$/)?'X':'',
    vpi:is(/^VPI$/)?'X':'',
    autres:autres.length?'X':'',
    precision:autres.join(', '),
    complement:iv._isRenfort?(iv._caserneSourceNom||iv._caserneSource||'Renfort'):(iv._engin2||'')
  };
}
function adminExportExcelDurationValue(value){
  if(value===''||value===null||value===undefined)return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  const parts=String(value).split(/\s*\+\s*/);
  let totalMinutes=0;
  for(let i=0;i<parts.length;i++){
    const match=parts[i].match(/^(\d+):([0-5]\d)$/);
    if(!match)return value;
    totalMinutes+=parseInt(match[1],10)*60+parseInt(match[2],10);
  }
  return totalMinutes/1440;
}
function adminExportSheet(XLSX,headers,rows,widths){
  const ws=XLSX.utils.aoa_to_sheet([headers].concat(rows));
  const lastCol=XLSX.utils.encode_col(headers.length-1);
  const lastRow=Math.max(1,rows.length+1);
  const durationColumns=headers.reduce(function(out,header,index){
    if(header==='Heures'||header==='Heures_2')out.push(index);
    return out;
  },[]);
  for(let r=1;r<lastRow;r++){
    durationColumns.forEach(function(c){
      const addr=XLSX.utils.encode_cell({r,c}),cell=ws[addr];
      if(!cell)return;
      const value=adminExportExcelDurationValue(cell.v);
      if(typeof value==='number'&&Number.isFinite(value)){
        cell.v=value;
        cell.t='n';
        cell.z='[h]:mm';
      }
    });
  }
  ws['!autofilter']={ref:'A1:'+lastCol+lastRow};
  ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
  ws['!rows']=[{hpt:42}].concat(rows.map(function(){return {hpt:30};}));
  ws['!cols']=headers.map(function(_,i){return {wch:(widths&&widths[i])||16};});
  const border={top:{style:'thin',color:{rgb:'000000'}},bottom:{style:'thin',color:{rgb:'000000'}},left:{style:'thin',color:{rgb:'000000'}},right:{style:'thin',color:{rgb:'000000'}}};
  for(let r=0;r<lastRow;r++){
    for(let c=0;c<headers.length;c++){
      const addr=XLSX.utils.encode_cell({r,c}),cell=ws[addr];
      if(!cell)continue;
      cell.s={
        font:{name:'Calibri',sz:12,bold:r===0},
        alignment:{horizontal:r===0?'center':'left',vertical:'center',wrapText:true},
        border:border
      };
    }
  }
  return ws;
}

function exportAdminMonthlyExcel(){
  if(!canUseMonthlyExport()){showToast('Export réservé au super-administrateur','warn');return;}
  const period=adminMonthlyPeriod();
  if(!period){showToast('Sélectionnez un mois et une année valides','warn');return;}
  const data=adminMonthlyData(period);
  const total=data.interventions.length+data.activites.length+data.fmpas.length+data.stag.length+data.form.length+data.astreintesTel.length;
  if(!total){showToast('Aucune donnée à exporter pour cette période','warn');return;}

  function doExport(){
    const XLSX=window.XLSX,wb=XLSX.utils.book_new();
    const exportRates=getStatsTaux();
    const presents=Array.from({length:31},function(_,i){return 'Présent '+(i+1);});
    const ivHeaders=[
      'Num mois','Num intervention','Numéro SDIS','Numéro CABBALR','Date','Rapport',
      'Taux','Heures','Taux_2','Heures_2','KM','Nature','Nom du requérant','Adresse',
      'Commune','Acquis','Départ','SLL','Dispo','Retour','Fin','Matériels','Consommables',
      'En complémentarité','V.T.U.1','V.T.U.2','V.P.I','Autres','Autres à préciser',
      'Compte rendu de mission','Annotation','Rapport établi'
    ].concat(presents);
    const ivRows=[...data.interventions].sort(function(a,b){
      const aKey=adminExportInterventionStartDate(a)+'_'+String(a._hDebut||adminExportTimeCompact(a.h));
      const bKey=adminExportInterventionStartDate(b)+'_'+String(b._hDebut||adminExportTimeCompact(b.h));
      return aKey.localeCompare(bKey);
    }).map(function(iv){
      const veh=adminExportVehicles(iv);
      const rates=adminExportInterventionRates(iv);
      const rapportAuteur=adminExportInterventionChef(iv);
      const isSdis=adminExportReportType(iv)==='SDIS';
      return [
        iv._numMois||'',iv._numCaserne||iv._numApl||iv.id||'',iv._numSDIS||'',iv._numGlobal||'',
        adminExportDateCompact(adminExportInterventionStartDate(iv)),adminExportReportType(iv),
        rates.taux1,rates.heures1,rates.taux2,rates.heures2,iv._km||'',
        iv.n||'',iv.req||'',[(iv.addr||''),(iv.addrComp||'')].filter(Boolean).join(' — '),iv.com||'',
        isSdis?(iv._hAcquis||adminExportTimeCompact(iv.h)):'',iv._hDebut||'',isSdis?(iv._hSll||''):'',isSdis?(iv._hDispo||''):'',iv._hFin||'',isSdis?(iv._hOpTerminee||''):'',
        isSdis?(iv._materiels||''):'',isSdis?(iv._consommables||''):'',isSdis?veh.complement:'',isSdis?veh.vtu1:'',isSdis?veh.vtu2:'',isSdis?veh.vpi:'',isSdis?veh.autres:'',isSdis?veh.precision:'',
        isSdis?(iv._crTexte||iv._compteRendu||''):'',isSdis?(iv._annotations||''):'',isSdis?rapportAuteur:''
      ].concat(adminExportPad31(adminExportInterventionPresents(iv)));
    });
    const ivWidths=ivHeaders.map(function(h,i){
      if(i>=32)return 24;
      if([11,12,13,29,30].includes(i))return i===29?55:28;
      if([0,1,2,3].includes(i))return 16;
      return 13;
    });
    const actRows=[...data.activites].sort(function(a,b){return (a.date||'').localeCompare(b.date||'');}).map(function(a){
      return adminExportActivityRegisterRow(a,exportRates);
    });
    const formRows=[];
    data.fmpas.forEach(function(f){
      formRows.push.apply(formRows,adminExportFmpaRegisterRows(f,exportRates));
    });
    data.stag.forEach(function(f){
      formRows.push(adminExportFormationRegisterRow(f,'Formation',reportTypeCode('for'),exportRates.formStag));
    });
    data.form.forEach(function(f){
      formRows.push(adminExportFormationRegisterRow(f,'Formateur',reportTypeCode('form'),exportRates.formRate));
    });
    const astrTelRows=data.astreintesTel.map(function(a){
      return adminExportAstrTelRegisterRow(a,period,exportRates);
    });
    const registreRows=ivRows.concat(actRows,formRows,astrTelRows).sort(function(a,b){
      const byDate=adminExportRegisterDateKey(a).localeCompare(adminExportRegisterDateKey(b));
      if(byDate)return byDate;
      return String(a[16]||'').localeCompare(String(b[16]||''));
    });
    XLSX.utils.book_append_sheet(wb,adminExportSheet(XLSX,ivHeaders,registreRows,ivWidths),'Registre');

    const caserne=((CC()&&CC().nom)||CURRENT_CASERNE_ID||'Caserne').replace(/[\\/:*?"<>|]+/g,'-');
    const fileName='Registre_AGAI_'+caserne+'_'+period.year+'-'+period.mm+'.xlsx';
    XLSX.writeFile(wb,fileName,{cellStyles:true});
    cM();
    showToast('Export mensuel téléchargé : '+fileName,'success');
  }

  if(window.XLSX){doExport();}
  else{
    showToast('Chargement du module Excel...','info');
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=doExport;
    s.onerror=function(){showToast('Impossible de charger le module Excel. Vérifiez votre connexion.','error');};
    document.head.appendChild(s);
  }
}

