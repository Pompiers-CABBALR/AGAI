// === MODULE: stats.js ===
// ══════════════════════════════════════════════════════
// STATISTIQUES CASERNE
// ══════════════════════════════════════════════════════
let stAnnee=new Date().getFullYear();
let stMois=0;
let stVue='annuel';
const ST_MOIS=['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];

function getStIvs(){
  const annStr=String(stAnnee);
  const prefix=stMois>0?annStr+String(stMois).padStart(2,'0'):annStr;
  return IVS.filter(function(iv){return !iv._isPilip&&iv.s==='terminee'&&(iv.h||'').startsWith(prefix);});
}

function rStats(){
  // Nav fixée en haut
  const nav=document.getElementById('stats-nav');
  if(nav){
    const showPersonnel=hasRight('Administration')||isSuperAdmin();
    const vues=[['annuel','Annuel'],['nat-mois','Nature/mois'],['com-mois','Commune/mois'],['nat-com','Commune\u00d7Nature']].concat(showPersonnel?[['pers-ivs','Personnel'],['pers-heures','Personnel/Heures'],['pers-act','Activités serv.'],['pers-form','Formations'],['pers-dispos','Dispos/Semaine']]:[]);
    const btnHtml=vues.map(function(vl){
      const v=vl[0],l=vl[1],actif=stVue===v;
      return '<button onclick="stVue=\''+v+'\';rStatsContent()" style="padding:5px 10px;border-radius:8px;border:1px solid #ccc;cursor:pointer;font-size:11px;font-weight:'+(actif?'700':'400')+';background:'+(actif?'#C0392B':'#f5f5f5')+';color:'+(actif?'#fff':'#333')+';">'+l+'</button>';
    }).join('');
    const moisOpts='<option value="0">Toute l\u2019ann\u00e9e</option>'+ST_MOIS.map(function(m,i){
      return '<option value="'+(i+1)+'"'+(stMois===i+1?' selected':'')+'>'+m+'</option>';
    }).join('');
    nav.innerHTML='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      +'<button onclick="stAnnee--;stMois=0;rStats()" style="background:#f5f5f5;border:1px solid #ccc;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:14px;">&larr;</button>'
      +'<span style="font-size:16px;font-weight:700;min-width:44px;text-align:center;">'+stAnnee+'</span>'
      +'<button onclick="stAnnee++;stMois=0;rStats()" style="background:#f5f5f5;border:1px solid #ccc;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:14px;">&rarr;</button>'
      +'<select onchange="stMois=parseInt(this.value);rStatsContent()" style="padding:4px 8px;border-radius:8px;border:1px solid #ccc;font-size:12px;">'+moisOpts+'</select>'
      +'<div style="display:flex;gap:3px;flex-wrap:wrap;">'+btnHtml+'</div>'
      +'</div>';
  }
  rStatsContent();
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
      const nb=IVS.filter(function(iv){return !iv._isPilip&&iv.s==='terminee'&&(iv.h||'').startsWith(mStr);}).length;
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
        const nb=ivs.filter(function(iv){return iv.n===n.l&&(iv.h||'').startsWith(mStr);}).length;
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
    const allComs=COM.map(function(x){return typeof x==='string'?x:x.nom;});
    let rowsCM='';
    allComs.forEach(function(com){
      let cols='';
      moisActifs.forEach(function(mi){
        const mStr=String(stAnnee)+String(mi).padStart(2,'0');
        const nb=ivs.filter(function(iv){return iv.com===com&&(iv.h||'').startsWith(mStr);}).length;
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
    const allComs=COM.map(function(x){return typeof x==='string'?x:x.nom;});
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
    if(!hasRight('Administration')&&!isSuperAdmin()){body.innerHTML='<div style="padding:24px;text-align:center;color:var(--t2);">Accès restreint.</div>';return;}
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
  if(CURRENT_CASERNE_ID&&CASERNE_DATA[CURRENT_CASERNE_ID]&&CASERNE_DATA[CURRENT_CASERNE_ID].statsTaux)
    return CASERNE_DATA[CURRENT_CASERNE_ID].statsTaux;
  return {actSvc:75,fmpaStag:75,fmpaForm:100,formStag:100,formForm:100};
}
function saveStatsTaux(t){
  if(!CURRENT_CASERNE_ID||!CASERNE_DATA[CURRENT_CASERNE_ID])return;
  CASERNE_DATA[CURRENT_CASERNE_ID].statsTaux=t;saveData();
}
function showStatsTauxParams(){
  const t=getStatsTaux();
  const row=(label,id,val,desc)=>`<div class="fg">
    <div class="fgl">${label}</div>
    <div style="display:flex;align-items:center;gap:10px;">
      <input class="fi" type="number" id="taux-${id}" value="${val}" min="0" max="200" step="5" style="max-width:90px;"/>
      <span style="font-size:11px;color:var(--t2);">${desc}</span>
    </div>
  </div>`;
  document.getElementById('mt').textContent='📊 Taux de pondération des statistiques';
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`<div>
    <div style="font-size:12px;color:var(--t2);margin-bottom:12px;">Ces taux s'appliquent au calcul des heures pondérées dans les statistiques Personnel.</div>
    ${row('Activités de service','actSvc',t.actSvc||75,'% des heures réelles')}
    ${row('FMPA — participants (stagiaires)','fmpaStag',t.fmpaStag||75,'% des heures réelles')}
    ${row('FMPA — formateurs','fmpaForm',t.fmpaForm||100,'% des heures réelles')}
    ${row('Formations — stagiaires','formStag',t.formStag||100,'% des heures réelles')}
    ${row('Formations — formateurs','formForm',t.formForm||100,'% des heures réelles')}
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
  saveStatsTaux({actSvc:get('actSvc'),fmpaStag:get('fmpaStag'),fmpaForm:get('fmpaForm'),formStag:get('formStag'),formForm:get('formForm')});
  cM();
  showToast('Taux enregistrés ✓','success');
}

// ── Stats activités de service ──
function rStatsActivites(){
  const annStr=String(stAnnee);
  const agents=[...USERS].sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  const allData=actGetData();
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
      const items=data.filter(a=>a.date.startsWith(mStr)&&((a.participants||[]).includes(u.l)||a.auteur===u.l));
      let mins=0;
      items.forEach(a=>{
        if(a.hDebut&&a.hFin){
          const [h,m]=a.hDebut.split(':').map(Number),[h2,m2]=a.hFin.split(':').map(Number);
          let d=(h2*60+m2)-(h*60+m);if(d<0)d+=1440;mins+=d;
        } else if(a.duree){
          const pt=a.duree.match(/(\d+)h(\d*)/);if(pt)mins+=parseInt(pt[1])*60+(parseInt(pt[2])||0);
        }
      });
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
    +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Heures d\'activités de service par agent — '+stAnnee+(stMois>0?' — '+ST_MOIS_COURT[stMois-1]:'')+'</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:11px;">'
    +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:120px;">Agent</th><th style="padding:5px 5px;font-size:10px;">Grade</th>'
    +thMois
    +'<th style="padding:4px 6px;text-align:center;border-left:2px solid #ccc;font-size:10px;">Total</th>'
    +'</tr></thead><tbody>'+rows+'</tbody>'
    +'<tfoot>'+footer+'</tfoot></table></div>';
}

// ── Stats formations ──
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

  function fmpaMinsPour(f){
    if(!f.hDebut||!f.hFin)return 0;
    const [h,m]=f.hDebut.split(':').map(Number),[h2,m2]=f.hFin.split(':').map(Number);
    let d=(h2*60+m2)-(h*60+m);return d>0?d:0;
  }
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
        const m=fmpaMinsPour(f);
        if((f.participants||[]).includes(u.l)){mins+=m;totFmpaStag+=m;}
        if((f.formateurs||[]).includes(u.l)){mins+=m;totFmpaForm+=m;}
      });
      stag.forEach(f=>{if((f.participants||[]).includes(u.l)){const m=formMinsTotal(f);mins+=m;totStag+=m;}});
      form.forEach(f=>{if((f.participants||[]).includes(u.l)){const m=formMinsTotal(f);mins+=m;totForm+=m;}});
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
    +'<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Heures de formations par agent — '+stAnnee+(stMois>0?' — '+ST_MOIS_COURT[stMois-1]:'')+'</div>'
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
function calcTauxIntervention(iv){
  if(!iv._hDebut||!iv._hFin||!iv.h)return null;
  // Récupérer la date de l'intervention depuis iv.h (format YYYYMMDD_HHMM)
  const dateStr=iv.h.slice(0,8); // YYYYMMDD
  const yr=parseInt(dateStr.slice(0,4)),mo=parseInt(dateStr.slice(4,6))-1,da=parseInt(dateStr.slice(6,8));
  const feries=getJoursFeries(yr);
  const isoDate=yr+'-'+pad(mo+1)+'-'+pad(da);
  const dateObj=new Date(yr,mo,da);
  const dow=dateObj.getDay(); // 0=dim, 6=sam

  const [dh,dm]=iv._hDebut.split(':').map(Number);
  const [fh,fm]=iv._hFin.split(':').map(Number);
  let startMin=dh*60+dm;
  let endMin=fh*60+fm;
  if(endMin<=startMin)endMin+=1440; // overnight

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
    const curDow=curDate.getDay();
    const curIso=curDate.getFullYear()+'-'+pad(curDate.getMonth()+1)+'-'+pad(curDate.getDate());
    const ferie=feries.has(curIso)||getJoursFeries(curDate.getFullYear()).has(curIso);

    let taux;
    if(hOfDay<7||hOfDay>=22){
      taux=200;
    } else if(curDow===0||ferie){ // dimanche ou férié, 07h-22h
      taux=150;
    } else { // lun-sam 07h-22h
      taux=100;
    }

    if(taux===100)t100++;
    else if(taux===150)t150++;
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
  if(!iv.h)return null;
  const periodes=getAgentPresenceOnIV(iv,login);
  if(!periodes.length)return null;
  const dateStr=iv.h.slice(0,8);
  const yr=parseInt(dateStr.slice(0,4)),mo=parseInt(dateStr.slice(4,6))-1,da=parseInt(dateStr.slice(6,8));
  const feries=getJoursFeries(yr);
  let t100=0,t150=0,t200=0;
  periodes.forEach(function(p){
    const [dh,dm]=p.hDebut.split(':').map(Number);
    const [fh,fm]=p.hFin.split(':').map(Number);
    let startMin=dh*60+dm;
    let endMin=fh*60+fm;
    if(endMin<=startMin)endMin+=1440;
    let cur=startMin;
    while(cur<endMin){
      const dayOff=Math.floor(cur/1440);
      const minOfDay=cur%1440;
      const hOfDay=Math.floor(minOfDay/60);
      const curDate=new Date(yr,mo,da+dayOff);
      const curDow=curDate.getDay();
      const curIso=curDate.getFullYear()+'-'+pad(curDate.getMonth()+1)+'-'+pad(curDate.getDate());
      const ferie=feries.has(curIso)||getJoursFeries(curDate.getFullYear()).has(curIso);
      let taux;
      if(hOfDay<7||hOfDay>=22)taux=200;
      else if(curDow===0||ferie)taux=150;
      else taux=100;
      if(taux===100)t100++;else if(taux===150)t150++;else t200++;
      cur++;
    }
  });
  return {t100,t150,t200};
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
  const ivsFiltres=IVS.filter(function(iv){return !iv._isPilip&&iv.s!=='annulee'&&(iv.h||'').startsWith(prefix);});

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
        const nb=ivAgent.filter(function(iv){return (iv.h||'').startsWith(mStr);}).length;
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

    const legende='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">'
      +'<span style="background:#EAF3DE;border-radius:6px;padding:2px 8px;font-size:11px;">100% — Lun–Sam 07h–22h</span>'
      +'<span style="background:#FEF9C3;border-radius:6px;padding:2px 8px;font-size:11px;">150% — Dim &amp; Fériés 07h–22h</span>'
      +'<span style="background:#FAEEDA;border-radius:6px;padding:2px 8px;font-size:11px;">200% — Nuit 22h–07h</span>'
      +'</div>';

    let thHtml='<th style="padding:5px 8px;text-align:left;min-width:120px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>';
    moisActifs.forEach(function(mi){
      thHtml+='<th colspan="3" style="padding:4px 5px;text-align:center;font-size:10px;border-left:2px solid #e0e0e0;">'+ST_MOIS[mi-1].slice(0,3)+'</th>';
    });
    thHtml+='<th colspan="4" style="padding:4px 5px;text-align:center;font-size:10px;background:#f0f0f0;border-left:2px solid #ccc;">Total année</th>';

    let thSub='<th></th><th></th>';
    moisActifs.forEach(function(){
      thSub+='<th style="padding:2px 3px;text-align:center;font-size:9px;color:#3B6D11;border-left:2px solid #e0e0e0;">100%</th>'
        +'<th style="padding:2px 3px;text-align:center;font-size:9px;color:#854F0B;">150%</th>'
        +'<th style="padding:2px 3px;text-align:center;font-size:9px;color:#E24B4A;">200%</th>';
    });
    thSub+='<th style="padding:2px 3px;text-align:center;font-size:9px;color:#3B6D11;border-left:2px solid #ccc;">100%</th>'
      +'<th style="padding:2px 3px;text-align:center;font-size:9px;color:#854F0B;">150%</th>'
      +'<th style="padding:2px 3px;text-align:center;font-size:9px;color:#E24B4A;">200%</th>'
      +'<th style="padding:2px 3px;text-align:center;font-size:9px;font-weight:700;color:var(--t);">Total</th>';

    let rows='';
    let grand100=0,grand150=0,grand200=0;
    agents.forEach(function(u){
      const ivAgent=ivsFiltres.filter(function(iv){
        return iv.agr===u.l
          ||(iv._equipage1&&iv._equipage1.some(function(e){return e.login===u.l;}))
          ||(iv._equipage2&&iv._equipage2.some(function(e){return e.login===u.l;}));
      });
      let tot100=0,tot150=0,tot200=0,hasDonnes=false;
      const cols=moisActifs.map(function(mi){
        const mStr=annStr+String(mi).padStart(2,'0');
        const ivMois=ivAgent.filter(function(iv){return (iv.h||'').startsWith(mStr)&&iv._hDebut&&iv._hFin;});
        let m100=0,m150=0,m200=0;
        ivMois.forEach(function(iv){
          const t=calcTauxAgentIV(iv,u.l);
          if(!t)return;
          m100+=t.t100;m150+=t.t150;m200+=t.t200;
        });
        tot100+=m100;tot150+=m150;tot200+=m200;
        if(m100||m150||m200)hasDonnes=true;
        return '<td style="padding:3px 4px;text-align:center;font-size:10px;border-left:2px solid #e0e0e0;'+(m100?'background:#EAF3DE;font-weight:600;':'')+'">'+(m100?minToHHMM(m100):'—')+'</td>'
          +'<td style="padding:3px 4px;text-align:center;font-size:10px;'+(m150?'background:#FEF9C3;font-weight:600;':'')+'">'+(m150?minToHHMM(m150):'—')+'</td>'
          +'<td style="padding:3px 4px;text-align:center;font-size:10px;'+(m200?'background:#FAEEDA;font-weight:600;':'')+'">'+(m200?minToHHMM(m200):'—')+'</td>';
      }).join('');
      grand100+=tot100;grand150+=tot150;grand200+=tot200;
      const totGen=tot100+tot150+tot200;
      rows+='<tr style="border-bottom:1px solid #f5f5f5;'+(hasDonnes?'':'opacity:.4;')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+fullName(u)+'</td>'
        +'<td style="padding:5px 5px;font-size:10px;color:var(--t2);">'+gradeAbbr(u.grade)+'</td>'
        +cols
        +'<td style="padding:3px 5px;text-align:center;font-size:10px;font-weight:700;background:#EAF3DE;border-left:2px solid #ccc;">'+(tot100?minToHHMM(tot100):'—')+'</td>'
        +'<td style="padding:3px 5px;text-align:center;font-size:10px;font-weight:700;background:#FEF9C3;">'+(tot150?minToHHMM(tot150):'—')+'</td>'
        +'<td style="padding:3px 5px;text-align:center;font-size:10px;font-weight:700;background:#FAEEDA;">'+(tot200?minToHHMM(tot200):'—')+'</td>'
        +'<td style="padding:3px 5px;text-align:center;font-size:10px;font-weight:700;background:#f0f0f0;">'+(totGen?minToHHMM(totGen):'—')+'</td>'
        +'</tr>';
    });
    const grandGen=grand100+grand150+grand200;
    const footCols=moisActifs.map(function(){return '<td colspan="3" style="border-left:2px solid #666;"></td>';}).join('');
    const footer='<tr style="background:var(--t);color:#fff;font-weight:700;">'
      +'<td style="padding:6px 8px;font-size:11px;">TOTAL GÉNÉRAL</td><td></td>'
      +footCols
      +'<td style="padding:4px 5px;text-align:center;border-left:2px solid #999;">'+(grand100?minToHHMM(grand100):'—')+'</td>'
      +'<td style="padding:4px 5px;text-align:center;">'+(grand150?minToHHMM(grand150):'—')+'</td>'
      +'<td style="padding:4px 5px;text-align:center;">'+(grand200?minToHHMM(grand200):'—')+'</td>'
      +'<td style="padding:4px 5px;text-align:center;">'+(grandGen?minToHHMM(grandGen):'—')+'</td>'
      +'</tr>';

    return '<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:4px;">Heures d’interventions par agent et par taux</div>'
      +'<div style="font-size:11px;color:var(--t2);margin-bottom:8px;">Heures réelles ventilées par tranche tarifaire.</div>'
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
    const gran=ASTR_CONFIG.granularity||60;
    const minParSlot=gran;

    // Collecter toutes les semaines de l'année
    const semaines=Object.keys(DISPOS).filter(function(wk){return wk.startsWith(annStr);});

    function minDispoAgent(login,filtre){
      let total=0;
      // Utiliser la granularité de l'équipe de l'agent (comme lors de la saisie)
      const eq=getEquipeOfUser(login);
      const agentGran=eq?eq.granularity:gran;
      const slotsParJour=Math.floor(1440/agentGran);
      semaines.forEach(function(wk){
        const d=DISPOS[wk]?.[login];if(!d)return;
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
          if(filtre&&filtre.type==='jour'&&di!==filtre.val)return;
          if(filtre&&filtre.type==='mois'){
            const yr=parseInt(wk.slice(0,4)),mo=parseInt(wk.slice(4,6)),da=parseInt(wk.slice(6,8));
            const dt=new Date(yr,mo-1,da);dt.setDate(dt.getDate()+di);
            if(dt.getMonth()+1!==filtre.val)return;
          }
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
      const allWks=Object.keys(PIQUETS).filter(function(wk){return wk.startsWith(annStr);});
      allWks.forEach(function(wk){
        if(filtre&&filtre.type==='mois'){
          const yr=parseInt(wk.slice(0,4)),mo=parseInt(wk.slice(4,6));
          if(mo!==filtre.val)return;
        }
        (PIQUETS[wk]||[]).forEach(function(p){
          const membres=p.membres&&p.membres.length?p.membres:[
            p.chefAgres?{login:p.chefAgres,hDebut:p.debut,hFin:p.fin}:null,
            p.conducteur?{login:p.conducteur,hDebut:p.debut,hFin:p.fin}:null,
            p.chefEquipe?{login:p.chefEquipe,hDebut:p.debut,hFin:p.fin}:null,
            p.stagiaire?{login:p.stagiaire,hDebut:p.debut,hFin:p.fin}:null,
          ].filter(Boolean);
          membres.forEach(function(m){
            if(m.login!==login)return;
            if(filtre&&filtre.type==='jour'){
              const jIdx=JOURS_FULL.indexOf(p.jour);if(jIdx!==filtre.val)return;
            }
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

    return '<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;margin-bottom:12px;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Disponibilit\u00e9s par jour de semaine ('+stAnnee+')</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:130px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>'
      +thJours+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Total</th></tr></thead>'
      +'<tbody>'+rowsJour+'</tbody></table></div>'
      +'<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;margin-bottom:12px;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Disponibilit\u00e9s par mois ('+stAnnee+')</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:130px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>'
      +thMois2+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Total</th></tr></thead>'
      +'<tbody>'+rowsMois+'</tbody></table></div>'
      +'<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;margin-bottom:12px;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">&#x1F4CC; Heures de piquet par jour de semaine ('+stAnnee+')</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#FEF0E7;"><th style="padding:5px 8px;text-align:left;min-width:130px;font-size:11px;">Agent</th>'
      +'<th style="padding:5px 5px;font-size:10px;">Grade</th>'
      +thJours+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Total</th></tr></thead>'
      +'<tbody>'+rowsPiqJour+'</tbody></table></div>'
      +'<div style="background:#fff;border-radius:12px;padding:12px;overflow-x:auto;">'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:8px;">&#x1F4CC; Heures de piquet par mois ('+stAnnee+')</div>'
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
  const ivStats=IVS.filter(iv=>!iv._isPilip&&iv.s!=='annulee');
  const nbJour=ivStats.filter(iv=>(iv.h||'').startsWith(todayStr)).length;
  const nbMois=ivStats.filter(iv=>(iv.h||'').startsWith(moisStr)).length;
  const nbAnnee=ivStats.filter(iv=>(iv.h||'').startsWith(annee)).length;
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

