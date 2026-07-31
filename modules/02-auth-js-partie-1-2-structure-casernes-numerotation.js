// === MODULE: auth.js (partie 1/2 — structure casernes + numérotation) ===
// ══════════════════════════════════════════════════════
// ARCHITECTURE MULTI-CASERNES
// ══════════════════════════════════════════════════════
// GLOBAL_ACCOUNTS : comptes spéciaux hors casernes ordinaires
// superadmin.caserneId = la caserne dont il fait partie (accès normal + accès global)
// Aucun compte privilégié ne doit être livré dans le code source.
// Les comptes existants sont chargés depuis le stockage configuré.
const GLOBAL_ACCOUNTS=[];
// Helpers
function isSuperAdmin(){return GLOBAL_ROLE==='superadmin'&&!window._superAdminDisabled;}
function isChefCorps(){return GLOBAL_ROLE==='chef_corps';}
function isResponsableFormation(user){
  const account=user||CU;
  if(!account)return false;
  if(account.responsableFormation===true)return true;
  const stored=(USERS||[]).find(u=>u.l===account.l);
  return !!(stored&&stored.responsableFormation===true);
}
function canAccessFraisAdministratifs(){
  if(isSuperAdmin()||isChefCorps())return true;
  if(!CU)return false;
  return CU.fonction==='Chef de centre'||CU.fonction==='Adjoint au chef de centre'||isResponsableFormation(CU);
}
function getSuperAdminAccount(){return GLOBAL_ACCOUNTS.find(a=>a.role==='superadmin');}
function getChefCorpsAccount(){return GLOBAL_ACCOUNTS.find(a=>a.role==='chef_corps');}
function repairKnownChefCorpsAssignment(){
  const account=getChefCorpsAccount();
  if(!account||account._assignmentProtectedV85===true)return false;
  account.prenom='Vincent';account.nom='Fabre';
  const desiredLogin='fabre.vincent';
  const collision=GLOBAL_ACCOUNTS.some(function(other){return other!==account&&other.l===desiredLogin;});
  if(!collision)account.l=desiredLogin;
  account.role='chef_corps';account.appRole='chef_corps';account.caserneId='EMAJ';account._assignmentProtectedV85=true;
  return true;
}
function accountNameKey(account){
  return String((account&&account.prenom||'')+' '+(account&&account.nom||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
}
function getCaserneAdmin(caserneId){
  const data=CASERNE_DATA[caserneId];
  if(!data||!Array.isArray(data.users))return null;
  let admin=data.adminLogin&&data.users.find(function(user){return user&&user.l===data.adminLogin&&!user._isSA;});
  // Migration corrective connue : l'administrateur désigné de Lapugnoy est Pascal Douvrin.
  if(!admin&&caserneId==='CIS05')admin=data.users.find(function(user){return accountNameKey(user)==='pascaldouvrin';});
  if(!admin){
    const candidates=data.users.filter(function(user){return user&&!user._isSA&&Array.isArray(user.rights)&&user.rights.includes('Administration');});
    candidates.sort(function(a,b){return String(a.nom||'').localeCompare(String(b.nom||''),'fr')||String(a.prenom||'').localeCompare(String(b.prenom||''),'fr');});
    admin=candidates[0]||null;
  }
  if(admin)data.adminLogin=admin.l;
  return admin;
}
function normalizeCaserneAdminAssignments(){
  OP_CASERNES().forEach(function(caserne){
    const data=CASERNE_DATA[caserne.id];if(!data||!Array.isArray(data.users))return;
    const admin=getCaserneAdmin(caserne.id);if(!admin)return;
    data.adminLogin=admin.l;
    data.users.forEach(function(user){
      user.rights=Array.isArray(user.rights)?user.rights:[];
      if(user.l===admin.l){if(!user.rights.includes('Administration'))user.rights.push('Administration');}
      else user.rights=user.rights.filter(function(right){return right!=='Administration';});
      user.appRole=deriveAccountRole(user);
    });
  });
}

function deriveAccountRole(account){
  if(!account)return 'agent';
  if(account.role==='superadmin'||account._isSA)return 'superadmin';
  if(account.role==='chef_corps')return 'chef_corps';
  if(Array.isArray(account.rights)&&account.rights.includes('Administration'))return 'administrateur_caserne';
  if(account.responsableFormation===true)return 'responsable_formation';
  if(account.fonction==='Chef de centre')return 'chef_centre';
  if(account.fonction==='Adjoint au chef de centre')return 'adjoint_chef_centre';
  return 'agent';
}

function normalizeAllAccountMetadata(){
  GLOBAL_ACCOUNTS.forEach(function(account){
    account.appRole=deriveAccountRole(account);
    if(!account.caserneId&&account.role==='chef_corps')account.caserneId='EMAJ';
  });
  Object.keys(CASERNE_DATA).forEach(function(cid){
    if(cid.startsWith('_'))return;
    const data=CASERNE_DATA[cid];
    (data&&Array.isArray(data.users)?data.users:[]).forEach(function(user){
      user.caserneId=cid;
      user.appRole=deriveAccountRole(user);
    });
  });
  normalizeCaserneAdminAssignments();
}

function getCurrentAccessScope(){
  if(!CU)return null;
  return {
    login:CU.l,
    caserneId:CU.caserneId||CURRENT_CASERNE_ID||'',
    appRole:CU.appRole||deriveAccountRole(CU)
  };
}
let CASERNES=[
  {id:'CIS01',nom:'UT Cuinchy',                   code:'CUI',couleur:'#C0392B',email:''},
  {id:'CIS02',nom:'UT Divion',                    code:'DIV',couleur:'#2980B9',email:''},
  {id:'CIS03',nom:'UT Hersin-Coupigny',           code:'HER',couleur:'#1ABC9C',email:''},
  {id:'CIS04',nom:'UT Isbergues',                 code:'ISB',couleur:'#8E44AD',email:''},
  {id:'CIS05',nom:'UT Lapugnoy',                  code:'LAP',couleur:'#E67E22',email:''},
  {id:'CIS06',nom:'UT Noyelles-lès-Vermelles',code:'NOY',couleur:'#16A085',email:''},
  {id:'CIS07',nom:'UT Sailly-Labourse',           code:'SAI',couleur:'#D35400',email:''},
  {id:'EMAJ',nom:'État-Major',                     code:'EMA',couleur:'#1D4ED8',email:'',_emaj:true},
];
const CASERNE_DATA={};
function initCaserneData(cid){
  if(CASERNE_DATA[cid])return;
  const c=CASERNES.find(x=>x.id===cid);
  // L'État-Major est l'espace de saisie du chef de corps : pas de compte admin dédié
  // Aucun administrateur avec un mot de passe connu n'est créé automatiquement.
  const defaultUsers=[];
  CASERNE_DATA[cid]={
    users:defaultUsers,
    ivs:[],pilpIvs:[],equipes:[],dispos:{},piquets:{},planningRotations:{},disposValidated:{},piquetsValidated:{},renforts:[],
    astrConfig:{granularity:60,engins:['VTU-01','VTU-02','VTU-03','VPI'],deadline:{dayOfWeek:5,hour:23,minute:59},deadlinePiquet:{dayOfWeek:0,hour:18,minute:0},weekStartDay:1,weekStartHour:0},
  };
}
CASERNES.forEach(c=>initCaserneData(c.id));
// Casernes opérationnelles (exclut l'État-Major, qui est l'espace de saisie du chef de corps)
function OP_CASERNES(){return CASERNES.filter(c=>c.id!=='EMAJ');}
let CURRENT_CASERNE_ID=null;
// Configuration globale des types d'engins (nombre de places + rôles), partagée entre casernes.
// Chaque rôle : {role:'...', n:nombre}. Modifiable par le superadmin.
let ENGIN_TYPES=[
  {type:'VTU',roles:[{role:"Chef d\u2019agrès",n:1},{role:'Conducteur',n:1},{role:'Équipier',n:1}]},
  {type:'VPI',roles:[{role:"Chef d\u2019agrès",n:1},{role:'Conducteur',n:1},{role:"Chef d\u2019équipe",n:1},{role:'Équipier',n:1}]},
  {type:'VL', roles:[{role:"Chef d\u2019agrès",n:1}]},
];
const ENGIN_ROLES_DISPONIBLES=["Chef d\u2019agrès","Conducteur","Chef d\u2019équipe","Équipier"];
// ── Configuration Supabase (bascule prudente) ──
// USE_SUPABASE : false = JSONBin (comportement actuel), true = Supabase temps réel.
// Bascule toute la synchro d'un seul mot. Tant que false, RIEN ne change.
const USE_SUPABASE = true;
const USE_RECORDS = true;
const AGAI_RUNTIME_CONFIG=Object.freeze(window.AGAI_CONFIG||{});
const SB_URL  = AGAI_RUNTIME_CONFIG.supabaseUrl||'https://lpzblzqxmoiwghvkhqnt.supabase.co';
const SB_KEY  = AGAI_RUNTIME_CONFIG.supabasePublishableKey||'sb_publishable_PehrBg34OLpPTmv9GtuIQg_KMFtUcQX';
const SB_REST = SB_URL + '/rest/v1';
const SB_GLOBAL_ROW = '_GLOBAL';
function CC(){return CASERNES.find(c=>c.id===CURRENT_CASERNE_ID)||null;}
function CD(){if(!CURRENT_CASERNE_ID)return null;initCaserneData(CURRENT_CASERNE_ID);return CASERNE_DATA[CURRENT_CASERNE_ID];}
// Proxies
let USERS=[];let IVS=[];let PILP_IVS=[];let EQUIPES=[];let DISPOS={};let PIQUETS={};let DISPOS_VALIDATED={};let PIQUETS_VALIDATED={};let PLANNING_ROTATIONS={};let DISPOS_UNLOCKED={};let DISPO_REQUESTS={};let ASTR_CONFIG={granularity:60,engins:[],deadline:{dayOfWeek:5,hour:23,minute:59},deadlinePiquet:{dayOfWeek:0,hour:18,minute:0},weekStartDay:1,weekStartHour:0};
let LOGIN_HISTORY=[];
let LOGIN_HISTORY_DELETED={};
function syncCaserneContext(){
  const d=CD();
  if(!d){USERS=[];IVS=[];PILP_IVS=[];EQUIPES=[];DISPOS={};PIQUETS={};return;}
  // Si les variables globales ont été modifiées indépendamment de d.*, synchroniser d'abord
  if(EQUIPES!==d.equipes&&EQUIPES.length>0&&d.equipes.length===0){d.equipes=EQUIPES;}
  if(IVS!==d.ivs&&IVS.length>0&&d.ivs.length===0){d.ivs=IVS;}
  if(PILP_IVS!==d.pilpIvs&&PILP_IVS.length>0&&(d.pilpIvs||[]).length===0){d.pilpIvs=PILP_IVS;}
  if(DISPOS!==d.dispos&&Object.keys(DISPOS).length>0&&Object.keys(d.dispos||{}).length===0){d.dispos=DISPOS;}
  if(PIQUETS!==d.piquets&&Object.keys(PIQUETS).length>0&&Object.keys(d.piquets||{}).length===0){d.piquets=PIQUETS;}
  USERS=d.users;IVS=d.ivs;PILP_IVS=d.pilpIvs||[];EQUIPES=d.equipes;DISPOS=d.dispos;PIQUETS=d.piquets;ASTR_CONFIG=d.astrConfig;DISPOS_VALIDATED=d.disposValidated||{};PIQUETS_VALIDATED=d.piquetsValidated||{};
  USERS.forEach(function(user){user.caserneId=CURRENT_CASERNE_ID;user.appRole=deriveAccountRole(user);});
  // Recharger PLANNING_ROTATIONS depuis les données caserne
  PLANNING_ROTATIONS=d.planningRotations||{};
  // Injecter le superadmin dans USERS s'il est rattaché à cette caserne
  GLOBAL_ACCOUNTS.filter(a=>a.role==='superadmin'&&a.caserneId===CURRENT_CASERNE_ID).forEach(sa=>{
    const existing=USERS.find(u=>u.l===sa.l);
    if(!existing){
      USERS.push({l:sa.l,prenom:sa.prenom,nom:sa.nom,grade:sa.grade||'Lieutenant',
        fonction:sa.fonction||'Chef de centre',fonction2:sa.fonction2||'',matricule:sa.matricule||'',
        p:sa.p, // le compte injecté partage le mot de passe du compte superadmin
        rights:["Prise d'appel","Interventions","Historique complet","Chef d'agrès","Tireur PILP","Administration"],
        _isSA:true,caserneId:CURRENT_CASERNE_ID,appRole:'superadmin'});
    } else {
      // Resynchroniser les champs modifiables depuis GLOBAL_ACCOUNTS
      existing.fonction=sa.fonction||'Chef de centre';
      existing.fonction2=sa.fonction2||'';
      existing.grade=sa.grade||existing.grade;
      existing.prenom=sa.prenom||existing.prenom;
      existing.nom=sa.nom||existing.nom;
      existing.matricule=sa.matricule||'';
      existing.caserneId=CURRENT_CASERNE_ID;
      existing.appRole='superadmin';
      // Le mot de passe reste toujours aligné sur celui du compte superadmin,
      // pour qu'un seul et même mot de passe donne l'accès superadmin ET l'accès
      // utilisateur normal (évite toute divergence entre les deux).
      if(sa.p)existing.p=sa.p;
    }
  });
}
// ══════════════════════════════════════════════════════
// NUMÉROTATION — 3 compteurs atomiques indépendants
// ══════════════════════════════════════════════════════
// APL  : global toutes casernes → APL_2026_000001  (6 digits)
// INT global : global toutes casernes → INT_2026_00001  (5 digits, superadmin seul)
// INT caserne : par caserne → LAP_2026_0001  (3 lettres + année + 4 digits)

let APL_COUNTER={};          // {annee: N}
let INT_GLOBAL_COUNTER={};   // {annee: N}
let INT_CAS_COUNTER={};      // {cid_annee: N}
let PILP_COUNTER={};         // {annee: N} — num temporaire PILP avant cloture
let GLOBAL_CALL_COUNTERS={total:0};

function incCallCounter(){
  GLOBAL_CALL_COUNTERS.total=(GLOBAL_CALL_COUNTERS.total||0)+1;
  if(CURRENT_CASERNE_ID)GLOBAL_CALL_COUNTERS[CURRENT_CASERNE_ID]=(GLOBAL_CALL_COUNTERS[CURRENT_CASERNE_ID]||0)+1;
}
function getCallCount(cid){return cid?GLOBAL_CALL_COUNTERS[cid]||0:GLOBAL_CALL_COUNTERS.total||0;}

// PILP-2026-001 — numéro temporaire PILP (avant clôture)
function nextPilpId(annee){
  const y=String(annee);
  if(!PILP_COUNTER[y])PILP_COUNTER[y]=0;
  PILP_COUNTER[y]++;
  return 'PILP-'+y+'-'+String(PILP_COUNTER[y]).padStart(PILP_NUM_DIGITS,'0');
}
// APL_2026_000001 — numéro d'appel global
function nextAplNum(annee){
  const y=String(annee);
  if(!APL_COUNTER[y])APL_COUNTER[y]=0;
  APL_COUNTER[y]++;
  return 'APL_'+y+'_'+String(APL_COUNTER[y]).padStart(APL_NUM_DIGITS,'0');
}

// Compteur Inter Renfort : par caserne, depuis début d'année
function nextRenfortNum(annee){
  const y=String(annee);
  const cid=CURRENT_CASERNE_ID;
  const ivsCas=[...(CASERNE_DATA[cid]&&CASERNE_DATA[cid].ivs||[])];
  let maxR=0;
  ivsCas.forEach(function(iv){
    if(iv._isRenfort&&iv.s==='terminee'&&(iv.h||'').startsWith(y)&&iv._numRenfort){
      const n=parseInt(iv._numRenfort)||0;if(n>maxR)maxR=n;
    }
  });
  return maxR+1;
}

// Numérotation INT — 4 compteurs attribués à la clôture
// numGlobal  : Intercommunale (toutes casernes, début d'année)
// numCas     : UT (caserne courante, début d'année)
// numMois    : Du mois (caserne courante, repart à 0 chaque mois)
// _numSDIS   : saisi manuellement dans le CR SDIS
function nextIntNum(annee){
  const y=String(annee);
  const mo=String(new Date().getMonth()+1).padStart(2,'0');
  const ymo=y+mo;
  const cid=CURRENT_CASERNE_ID;
  const initGlobal=CASERNE_DATA._initCabbalr||0;
  const initCas=(CASERNE_DATA[cid]&&CASERNE_DATA[cid]._initCompteurs&&CASERNE_DATA[cid]._initCompteurs.ut)||0;
  const initMois=(CASERNE_DATA[cid]&&CASERNE_DATA[cid]._initCompteurs&&CASERNE_DATA[cid]._initCompteurs.mois)||0;
  // Intercommunal : max toutes casernes (ou valeur init si supérieure)
  let maxGlobal=initGlobal;
  Object.values(CASERNE_DATA).forEach(function(cd){
    [...(cd.ivs||[]),...(cd.pilpIvs||[])].forEach(function(iv){
      if(iv.s==='terminee'&&(iv.h||'').startsWith(y)&&iv._numGlobal){
        const n=parseInt(iv._numGlobal)||0;if(n>maxGlobal)maxGlobal=n;
      }
    });
  });
  // UT : max caserne courante (ou valeur init si supérieure)
  const ivsCas=[...(CASERNE_DATA[cid]&&CASERNE_DATA[cid].ivs||[]),...(CASERNE_DATA[cid]&&CASERNE_DATA[cid].pilpIvs||[])];
  let maxCas=initCas,maxMois=initMois;
  ivsCas.forEach(function(iv){
    if(iv.s==='terminee'&&!iv._isRenfort&&(iv.h||'').startsWith(y)&&iv._numCaserne){const n=parseInt(iv._numCaserne)||0;if(n>maxCas)maxCas=n;}
    if(iv.s==='terminee'&&!iv._isRenfort&&(iv.h||'').startsWith(ymo)&&iv._numMois){const n=parseInt(iv._numMois)||0;if(n>maxMois)maxMois=n;}
  });
  return {numGlobal:maxGlobal+1,numCas:maxCas+1,numMois:maxMois+1};
}

function agaiCheckNumberingConflicts(notify){
  const indexes={global:new Map(),caserne:new Map(),mois:new Map()};
  const conflicts=[];
  const seenRecords=new Set();
  function add(index,key,label,record){
    if(!key)return;
    if(index.has(key)){
      const previous=index.get(key);
      if(previous.identity!==record.identity)conflicts.push({type:label,key:key,first:previous,second:record});
    }else index.set(key,record);
  }
  Object.keys(CASERNE_DATA).forEach(function(cid){
    if(cid.startsWith('_'))return;
    const data=CASERNE_DATA[cid]||{};
    [...(data.ivs||[]),...(data.pilpIvs||[])].forEach(function(iv){
      if(!iv||iv._isRenfort)return;
      const identity=cid+'|'+String(iv.id||'');
      if(seenRecords.has(identity))return;
      seenRecords.add(identity);
      const year=String(iv.h||'').slice(0,4);
      const month=String(iv.h||'').slice(0,6);
      const record={identity:identity,caserneId:cid,id:String(iv.id||''),nature:String(iv.n||'')};
      if(iv._numGlobal)add(indexes.global,year+'|'+String(iv._numGlobal),'CABBALR',record);
      if(iv._numCaserne)add(indexes.caserne,cid+'|'+year+'|'+String(iv._numCaserne),'UT',record);
      if(iv._numMois)add(indexes.mois,cid+'|'+month+'|'+String(iv._numMois),'Mois',record);
    });
  });
  window.AGAI_NUMBERING_CONFLICTS=conflicts;
  if(notify){
    if(!conflicts.length){
      showToast('Aucun doublon de numérotation détecté ✓','success');
    }else{
      const details=conflicts.slice(0,20).map(function(c){return c.type+' '+c.key+' : '+c.first.id+' / '+c.second.id;}).join('\n');
      alert(conflicts.length+' conflit(s) de numérotation détecté(s).\n\n'+details+(conflicts.length>20?'\n…':''));
    }
  }
  return conflicts;
}
// setCaserneTheme désactivé — couleur bandeau fixe (--red original)
function setCaserneTheme(couleur){/* no-op : couleur bandeau fixe */}
let GLOBAL_ROLE=null;
window._adminRoleDisabled=true;  // admin inactif par defaut (mode normal)
window._superAdminDisabled=true; // superadmin inactif par defaut (mode normal)
let CU=null,selNat=null,selC2=null,hoA=null,cddi=-1,selEng=null,flt='all',fltPilp='all',parcConfirmed=new Set(),nidSize=null;

function pad(n){return String(n).padStart(2,'0');}
function getH(d){return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;}
function getDS(d){return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;}
function N(){return new Date();}
const TODAY=N(),TDP=getDS(TODAY);
function isTdy(iv){return (iv.h||'').startsWith(TDP);}
function hO(h){const d=new Date(TODAY);d.setHours(d.getHours()-h);return getH(d);}
function nm(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function mkTL(s,h,who){return {s,h,who};}
function hasFormationRight(){
  if(!CU)return false;
  if(isAdminModeActive()||isSuperAdmin())return true;
  if(CU.rights&&CU.rights.includes('Formation'))return true;
  // Vérifier aussi dans USERS (cas où CU est une référence directe)
  const u=USERS.find(x=>x.l===CU.l);
  if(u&&u.rights&&u.rights.includes('Formation'))return true;
  if(CU.fonctionsFormateur&&CU.fonctionsFormateur.length>0)return true;
  if(u&&u.fonctionsFormateur&&u.fonctionsFormateur.length>0)return true;
  return false;
}
function hasRight(r){
  if(r==='Administration'&&window._adminRoleDisabled)return false;
  return CU&&CU.rights.includes(r);
}
// isAdminModeActive : vrai si l'utilisateur a le droit admin ET que le mode admin est actif
function isAdminModeActive(){return hasRight('Administration')||isSuperAdmin();}
function isAgres(){return hasRight('Chef d\'agrès');}
function isChef(){return hasRight('Historique complet');}
function isTireurPILP(){return hasRight('Tireur PILP');}
function canSeePILP(){return isTireurPILP();}

function isRespEquipe(){
  if(!CU)return false;
  // Uniquement le responsable d'une équipe peut modifier les piquets
  return EQUIPES.some(function(e){return e.resp===CU.l;});
}
function isDispoValidated(wk){return DISPOS_VALIDATED[wk]===true;}
function isRespEqForte(wk){
  // Responsable de l'équipe astreinte forte (slot 0 du planning)
  const v=PLANNING_ROTATIONS[wk];
  const eqId=Array.isArray(v)?v[0]:(typeof v==='string'?v:null);
  if(!eqId)return isRespEquipe(); // fallback
  const eq=getEquipeById(eqId);
  return CU&&eq&&eq.resp===CU.l;
}
function validerDispos(wk){
  DISPOS_VALIDATED[wk]=true;
  if(CD())CD().disposValidated=DISPOS_VALIDATED;
  saveData();
  rAstrPlanning();
  rAstrDispo();
}
function devaliderDispos(wk){
  delete DISPOS_VALIDATED[wk];
  if(CD())CD().disposValidated=DISPOS_VALIDATED;
  saveData();
  rAstrPlanning();
}
function applyNavRights(){
  document.getElementById('nav-appel').classList.toggle('hidden',!hasRight('Prise d\'appel'));
  document.getElementById('nav-interv').classList.toggle('hidden',!hasRight('Interventions'));
  const pilpTab=document.getElementById('subtab-btn-pilp');
  if(pilpTab)pilpTab.style.display=canSeePILP()?'':'none';
  if(pilpTab&&!canSeePILP()&&pilpTab.classList.contains('active')){
    showSubtab('std',document.getElementById('subtab-btn-std'));
  }
  const adminTab=document.getElementById('params-btn-admin');
  if(adminTab)adminTab.style.display=hasRight('Administration')?'':'none';
  const syncTab=document.getElementById('params-btn-onedrive');
  if(syncTab)syncTab.style.display=isSuperAdmin()?'':'none';
  document.getElementById('fb-mes-sel').style.display=(isAgres()||isTireurPILP())?'':'none';
  const fbResp=document.getElementById('fb-mes-resp');
  if(fbResp)fbResp.style.display=(isChef()||isAgres()||hasRight('Administration'))?'':'none';
  const isAdminActive=hasRight('Administration');
  const isAdminAccount=hasAdministrativeAccount();
  const isResp=isRespEquipe();
  const piquetsBtn=document.getElementById('astr-btn-piquets');
  const equipesBtn=document.getElementById('astr-btn-equipes');
  if(piquetsBtn)piquetsBtn.style.display=''; // visible pour tous
  if(equipesBtn)equipesBtn.style.display=isAdminAccount?'':'none';
  const gardeBtn=document.getElementById('astr-btn-garde');
  if(gardeBtn)gardeBtn.style.display=isAdminActive?'':'none';
  const navGlobal=document.getElementById('nav-global');
  if(navGlobal)navGlobal.classList.toggle('hidden',!isSuperAdmin());
  const navFormation=document.getElementById('nav-formation');
  if(navFormation)navFormation.classList.toggle('hidden',!hasFormationRight());
  const roleToggle=document.getElementById('nav-role-toggle');
  if(roleToggle){
    const hasAdm=CU&&CU.rights.includes('Administration');
    roleToggle.classList.toggle('hidden',!hasAdm);
    if(hasAdm){
      const active=!window._adminRoleDisabled;
      roleToggle.style.background=active?'rgba(39,174,96,.9)':'rgba(192,57,43,.8)';
      roleToggle.style.color='#fff';
      roleToggle.title=active?'Admin actif':'Admin désactivé';
    }
  }
  const saToggle=document.getElementById('nav-superadmin-toggle');
  if(saToggle){
    const hasSA=GLOBAL_ROLE==='superadmin';
    saToggle.classList.toggle('hidden',!hasSA);
    if(hasSA){
      const saActive=!window._superAdminDisabled;
      saToggle.style.background=saActive?'rgba(39,174,96,.9)':'rgba(192,57,43,.8)';
      saToggle.style.color='#fff';
      saToggle.title=saActive?'Super-Admin actif':'Super-Admin désactivé';
    }
  }
}
function showSubtab(sub,btn){
  if(sub==='pilp'&&!isTireurPILP()){
    sub='std';
    btn=document.getElementById('subtab-btn-std');
  }
  document.querySelectorAll('#interv-subtabs .subtab-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  document.getElementById('subtab-std').style.display=sub==='std'?'':'none';
  document.getElementById('subtab-pilp').style.display=sub==='pilp'?'':'none';
  document.getElementById('subtab-hist').style.display=sub==='hist'?'':'none';
  if(sub==='pilp'){rPilp();}
  else if(sub==='hist'){rHist();}
  else{rI();}
}
function showParamsTab(sub,btn){
  document.querySelectorAll('#tab-params .subtab-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  document.getElementById('params-profil').style.display=sub==='profil'?'':'none';
  document.getElementById('params-admin').style.display=sub==='admin'?'':'none';
  document.getElementById('params-onedrive').style.display=sub==='onedrive'?'':'none';
  if(sub==='onedrive'){var _sml=document.getElementById('sync-mode-label');if(_sml)_sml.textContent=(typeof USE_RECORDS!=='undefined'&&USE_RECORDS)?'Records (multi-utilisateurs temps réel)':((typeof USE_SUPABASE!=='undefined'&&USE_SUPABASE)?'Supabase (temps réel)':'JSONBin');}
  if(sub==='profil')rProfil();
  else if(sub==='admin')rAdm();
  else if(sub==='onedrive')odRenderStatus();
}

