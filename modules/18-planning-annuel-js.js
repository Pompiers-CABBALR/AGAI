// === MODULE: planning_annuel.js ===
// ══════════════════════════════════════════════════════
// PLANNING ANNUEL DES ÉQUIPES DE GARDE
// ══════════════════════════════════════════════════════
let gardeAnnee=new Date().getFullYear();

function rAstrGarde(){
  const body=document.getElementById('astr-garde-body');
  if(!body)return;

  /* ── Construire les semaines de l'année ── */
  const semaines=[];
  const jan1=new Date(gardeAnnee,0,1);
  const dow=jan1.getDay(); // 0=dim,1=lun
  const firstMon=new Date(jan1);
  firstMon.setDate(firstMon.getDate()+(dow===0?1:dow===1?0:8-dow));
  // inclure la semaine avant jan1 si jan1 est milieu de semaine
  const start0=new Date(firstMon);
  if(jan1.getDay()!==1&&jan1.getDay()!==0){
    start0.setDate(start0.getDate()-7);
    if(start0.getFullYear()<gardeAnnee)start0.setDate(start0.getDate()+7);
  }
  let d=new Date(start0);
  for(let n=0;n<60;n++){
    if(d.getFullYear()>gardeAnnee)break;
    const wk=weekKey(d);
    const lbl=weekLabel(d);
    const sun=new Date(d);sun.setDate(sun.getDate()+6);
    if(d.getFullYear()<gardeAnnee&&sun.getFullYear()<gardeAnnee){d.setDate(d.getDate()+7);continue;}
    semaines.push({d:new Date(d),wk,lbl,num:n+1});
    d.setDate(d.getDate()+7);
  }

  const isAdmin=hasRight('Administration')||isRespEquipe();

  /* ── Barre de navigation ── */
  let nav='<div style="background:#fff;border-radius:12px;padding:10px 14px;border:1px solid var(--brd);margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
    +'<button onclick="gardeAnnee--;rAstrGarde()" style="background:var(--bg);border:1px solid var(--brd);border-radius:8px;padding:4px 12px;cursor:pointer;font-size:14px;">&larr;</button>'
    +'<span style="font-size:16px;font-weight:700;">'+gardeAnnee+'</span>'
    +'<button onclick="gardeAnnee++;rAstrGarde()" style="background:var(--bg);border:1px solid var(--brd);border-radius:8px;padding:4px 12px;cursor:pointer;font-size:14px;">&rarr;</button>'
    +'<span style="font-size:12px;color:var(--t2);">'+semaines.length+' sem.</span>'
    +(isAdmin?'<button class="btn pr sm" style="margin-left:auto;" onclick="remplirGardeAuto()">&#x1F504; Remplissage auto</button>'+'<button class="btn sm" style="color:#E24B4A;border-color:#E24B4A;" onclick="effacerPlanningAnnee()">&#x1F5D1;️ Effacer</button>':'')
    +'</div>';

  /* ── Légende équipes ── */
  if(EQUIPES.length){
    nav+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">'
      +sortEquipes(EQUIPES).map(e=>'<span style="background:'+e.color+';color:#fff;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;">'+e.nom+'</span>').join('')
      +'</div>';
  }

  /* ── Tableau ── */
  // En-tête : colonnes dynamiques selon nb équipes (max 3 : slot1, slot2, slot3)
  const colCount=Math.max(2, EQUIPES.length);
  // Slots : on stocke jusqu'à N équipes par semaine
  // PLANNING_ROTATIONS[wk] peut être string (1 équipe) ou objet {e1,e2,...}

  function getSlots(wk){
    const v=PLANNING_ROTATIONS[wk];
    if(!v)return [];
    if(typeof v==='string')return v?[v]:[];
    if(Array.isArray(v))return v;
    return [];
  }
  function setSlot(wk,idx,eqId){
    let arr=getSlots(wk).slice();
    while(arr.length<=idx)arr.push('');
    arr[idx]=eqId||'';
    // Nettoyer les vides en fin
    while(arr.length&&!arr[arr.length-1])arr.pop();
    PLANNING_ROTATIONS[wk]=arr.length===1?arr[0]:(arr.length?arr:[]);
    if(CD())CD().planningRotations=PLANNING_ROTATIONS;
    saveData();
    rAstrGarde();
  }

  const slotLabels=['Astr. Forte','Astreinte'];
  const today=new Date();

  let thSlots='';
  for(let s=0;s<2;s++)thSlots+='<th style="padding:6px 10px;text-align:left;font-size:11px;min-width:120px;">'+slotLabels[s]+'</th>';

  let rows='';
  semaines.forEach(function(s){
    const isCurrent=s.d<=today&&today<new Date(s.d.getTime()+7*24*3600000);
    const isPast=new Date(s.d.getTime()+7*24*3600000)<today;
    const slots=getSlots(s.wk);

    let slotCells='';
    for(let si=0;si<2;si++){
      const eqId=slots[si]||'';
      const eq=eqId?getEquipeById(eqId):null;
      if(isAdmin){
                slotCells+='<td style="padding:4px 8px;">'
          +'<select onchange="setGardeSlot(\''+s.wk+'\','+si+',this.value)" '
          +'style="padding:3px 7px;border-radius:8px;border:1px solid var(--brd);font-size:11px;width:100%;background:'+(eq?eq.color+'22':'')+';" data-wk="'+s.wk+'" data-si="'+si+'">'
          +'<option value="">—</option>'
          +sortEquipes(EQUIPES).map(function(e){return '<option value="'+e.id+'"'+(eqId===e.id?' selected':'')+'>'+e.nom+'</option>';}).join('')
          +'</select></td>';
      } else {
        slotCells+='<td style="padding:4px 8px;">'
          +(eq?'<span style="background:'+eq.color+';color:#fff;padding:2px 9px;border-radius:10px;font-size:11px;">'+eq.nom+'</span>':'<span style="color:var(--t2);font-size:11px;">—</span>')
          +'</td>';
      }
    }

    rows+='<tr style="border-bottom:1px solid #f5f5f5;'+(isCurrent?'background:#FFF8E1;':'')+(isPast?'opacity:.5;':'')+'\">'
      +'<td style="padding:6px 10px;font-size:12px;white-space:nowrap;font-weight:'+(isCurrent?'700':'400')+';">'+(isCurrent?'&#x1F4CD; ':'')+'S'+s.num+' &mdash; '+s.lbl+'</td>'
      +slotCells
      +'</tr>';
  });

  body.innerHTML=nav
    +'<div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid var(--brd);">'
    +'<table style="width:100%;border-collapse:collapse;">'
    +'<thead><tr style="background:#f5f5f5;">'
    +'<th style="padding:6px 10px;text-align:left;font-size:11px;min-width:140px;">Semaine</th>'
    +thSlots
    +'</tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'</table></div>';
}

function setGardeSlot(wk,si,eqId){
  const v=PLANNING_ROTATIONS[wk];
  let arr=Array.isArray(v)?v.slice():(v?[v]:[]);
  while(arr.length<=si)arr.push('');
  arr[si]=eqId||'';
  while(arr.length&&!arr[arr.length-1])arr.pop();
  if(arr.length)PLANNING_ROTATIONS[wk]=arr.length===1?arr[0]:arr;
  else delete PLANNING_ROTATIONS[wk];
  // Synchroniser dans CASERNE_DATA
  const d=CD();
  if(d){d.planningRotations=PLANNING_ROTATIONS;}
  saveData();
  rAstrGarde();
}
function setEquipeSemaine(wk,eqId){
  if(!PLANNING_ROTATIONS)window.PLANNING_ROTATIONS={};
  if(eqId)PLANNING_ROTATIONS[wk]=eqId;
  else delete PLANNING_ROTATIONS[wk];
  // Synchroniser dans les données caserne
  if(CD())CD().planningRotations=PLANNING_ROTATIONS;
  saveData();
}

function remplirGardeAuto(){
  if(!EQUIPES.length){showToast('Créez d\'abord des équipes.','warn');return;}

  // Lire les 3 premières semaines pour déduire le pattern (slot 0 et slot 1)
  const jan1=new Date(gardeAnnee,0,1);
  const dow=jan1.getDay();
  const firstMon=new Date(jan1);
  firstMon.setDate(firstMon.getDate()+(dow===0?1:dow===1?0:8-dow));

  // Collecter les semaines de l'année (même logique que rAstrGarde)
  const allWks=[];
  let d=new Date(firstMon);
  for(let n=0;n<60;n++){
    if(d.getFullYear()>gardeAnnee)break;
    const wk=weekKey(d);
    const sun=new Date(d);sun.setDate(sun.getDate()+6);
    if(d.getFullYear()<gardeAnnee&&sun.getFullYear()<gardeAnnee){d.setDate(d.getDate()+7);continue;}
    allWks.push(wk);
    d.setDate(d.getDate()+7);
    if(d.getFullYear()>gardeAnnee&&d.getMonth()>0)break;
  }

  if(allWks.length<3){showToast('Pas assez de semaines pour détecter un pattern.','warn');return;}

  // Lire le pattern des 3 premières semaines remplies
  function getSlot(wk,si){
    const v=PLANNING_ROTATIONS[wk];
    if(!v)return '';
    const arr=Array.isArray(v)?v:(typeof v==='string'?[v]:[]);
    return arr[si]||'';
  }

  // Vérifier que les 3 premières semaines ont au moins le slot 0 rempli
  const p0=[getSlot(allWks[0],0),getSlot(allWks[1],0),getSlot(allWks[2],0)];
  const p1=[getSlot(allWks[0],1),getSlot(allWks[1],1),getSlot(allWks[2],1)];

  if(!p0[0]&&!p0[1]&&!p0[2]){
    showToast('Remplissez les 3 premières semaines avant de lancer le remplissage automatique.','warn');
    return;
  }

  confirmModal('Remplir toutes les semaines non définies en suivant le pattern des 3 premières semaines ?',function(){

  const period=3; // cycle de 3 semaines
  allWks.forEach(function(wk,i){
    const patIdx=i%period;
    const cur0=getSlot(wk,0);
    const cur1=getSlot(wk,1);
    const new0=p0[patIdx]||'';
    const new1=p1[patIdx]||'';
    // Ne remplir que les semaines non définies
    if(!cur0&&!cur1){
      const arr=[];
      if(new0)arr[0]=new0;
      if(new1)arr[1]=new1;
      if(arr.length){
        PLANNING_ROTATIONS[wk]=arr.length===1&&!arr[1]?arr[0]:arr;
      }
    }
  });

  if(CD())CD().planningRotations=PLANNING_ROTATIONS;
  saveData();
  rAstrGarde();
  });
}

function effacerPlanningAnnee(){
  confirmModal('Effacer tout le planning '+gardeAnnee+' ? Cette action est irréversible.',function(){
  // Construire la liste des semaines de l'année (même logique)
  const jan1=new Date(gardeAnnee,0,1);
  const dow=jan1.getDay();
  const firstMon=new Date(jan1);
  firstMon.setDate(firstMon.getDate()+(dow===0?1:dow===1?0:8-dow));
  let d=new Date(firstMon);
  for(let n=0;n<60;n++){
    if(d.getFullYear()>gardeAnnee)break;
    const wk=weekKey(d);
    delete PLANNING_ROTATIONS[wk];
    d.setDate(d.getDate()+7);
    if(d.getFullYear()>gardeAnnee&&d.getMonth()>0)break;
  }
  if(CD())CD().planningRotations=PLANNING_ROTATIONS;
  saveData();
  rAstrGarde();
  });
}
