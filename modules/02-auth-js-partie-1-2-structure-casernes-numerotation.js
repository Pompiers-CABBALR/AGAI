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
function isInterventionComptabilisee(iv){
  // Une mission de renfort possède son propre rapport mais ne doit pas
  // augmenter le nombre d'interventions opérationnelles.
  return !!(iv&&iv.s==='terminee'&&!iv._refugeAnimalier&&!iv._isRenfort);
}
function isInterventionPersonnelComptabilisee(iv){
  // Les renforts restent pris en compte pour les agents, leurs heures et
  // leurs indemnités, même s'ils sont exclus des autres statistiques.
  return !!(iv&&iv.s==='terminee'&&!iv._refugeAnimalier);
}
function statsCommunesIntervenuesEnPremier(interventions){
  const actives=new Set((interventions||[]).map(function(iv){return String(iv&&iv.com||'').trim();}).filter(Boolean));
  return COM.map(function(commune){return typeof commune==='string'?commune:commune.nom;}).sort(function(a,b){
    const activeA=actives.has(a)?1:0,activeB=actives.has(b)?1:0;
    return activeB-activeA||String(a).localeCompare(String(b),'fr',{sensitivity:'base'});
  });
}
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
function getChefCorpsCandidates(){
  const candidates=[];const seen={};
  OP_CASERNES().forEach(function(caserne){
    const data=CASERNE_DATA[caserne.id];
    (data&&Array.isArray(data.users)?data.users:[]).forEach(function(user){
      if(!user||!user.l||user._isSA||seen[user.l])return;
      seen[user.l]=true;
      candidates.push(Object.assign({},user,{_sourceCaserneId:caserne.id,_sourceCaserneNom:caserne.nom}));
    });
  });
  const current=getChefCorpsAccount();
  if(current&&current.l&&!seen[current.l]){
    candidates.push(Object.assign({},current,{_sourceCaserneId:current.homeCaserneId||'EMAJ',_sourceCaserneNom:current.homeCaserneNom||'État-Major'}));
  }
  return candidates.sort(function(a,b){return String(a.nom||'').localeCompare(String(b.nom||''),'fr')||String(a.prenom||'').localeCompare(String(b.prenom||''),'fr');});
}
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
function getCaserneAdmins(caserneId){
  const data=CASERNE_DATA[caserneId];
  if(!data||!Array.isArray(data.users))return [];
  const declared=[];
  (Array.isArray(data.adminLogins)?data.adminLogins:[]).forEach(function(login){
    if(login&&!declared.includes(login))declared.push(login);
  });
  // Compatibilité avec les anciennes sauvegardes qui ne contenaient qu'un adminLogin.
  if(data.adminLogin&&!declared.includes(data.adminLogin))declared.push(data.adminLogin);
  data.users.forEach(function(user){
    if(user&&!user._isSA&&Array.isArray(user.rights)&&user.rights.includes('Administration')&&!declared.includes(user.l))declared.push(user.l);
  });
  // Migration corrective connue : Pascal Douvrin reste administrateur de Lapugnoy.
  if(!declared.length&&caserneId==='CIS05'){
    const pascal=data.users.find(function(user){return accountNameKey(user)==='pascaldouvrin';});
    if(pascal)declared.push(pascal.l);
  }
  const admins=declared.map(function(login){
    return data.users.find(function(user){return user&&user.l===login&&!user._isSA;});
  }).filter(Boolean);
  data.adminLogins=admins.map(function(admin){return admin.l;});
  data.adminLogin=data.adminLogins[0]||'';
  return admins;
}
function getCaserneAdmin(caserneId){return getCaserneAdmins(caserneId)[0]||null;}
function normalizeCaserneAdminAssignments(){
  OP_CASERNES().forEach(function(caserne){
    const data=CASERNE_DATA[caserne.id];if(!data||!Array.isArray(data.users))return;
    const admins=getCaserneAdmins(caserne.id);
    const adminLogins=new Set(admins.map(function(admin){return admin.l;}));
    data.adminLogins=[...adminLogins];
    data.adminLogin=data.adminLogins[0]||'';
    data.users.forEach(function(user){
      user.rights=Array.isArray(user.rights)?user.rights:[];
      if(user._isSA){
        ["Prise d'appel","Interventions","Historique complet","Chef d'agrès","Tireur PILP","Administration"].forEach(function(right){if(!user.rights.includes(right))user.rights.push(right);});
      } else if(adminLogins.has(user.l)){if(!user.rights.includes('Administration'))user.rights.push('Administration');}
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
  {id:'CIS01',nom:'UT Cuinchy',                   code:'CUI',couleur:'#C0392B',email:'',astreintePhone:'',adresse:'',latitude:null,longitude:null},
  {id:'CIS02',nom:'UT Divion',                    code:'DIV',couleur:'#2980B9',email:'',astreintePhone:'',adresse:'',latitude:null,longitude:null},
  {id:'CIS03',nom:'UT Hersin-Coupigny',           code:'HER',couleur:'#1ABC9C',email:'',astreintePhone:'',adresse:'',latitude:null,longitude:null},
  {id:'CIS04',nom:'UT Isbergues',                 code:'ISB',couleur:'#8E44AD',email:'',astreintePhone:'',adresse:'',latitude:null,longitude:null},
  {id:'CIS05',nom:'UT Lapugnoy',                  code:'LAP',couleur:'#E67E22',email:'',astreintePhone:'06 32 13 28 53',adresse:'',latitude:null,longitude:null},
  {id:'CIS06',nom:'UT Noyelles-lès-Vermelles',code:'NOY',couleur:'#16A085',email:'',astreintePhone:'',adresse:'',latitude:null,longitude:null},
  {id:'CIS07',nom:'UT Sailly-Labourse',           code:'SAI',couleur:'#D35400',email:'',astreintePhone:'',adresse:'',latitude:null,longitude:null},
  {id:'EMAJ',nom:'État-Major',                     code:'EMA',couleur:'#1D4ED8',email:'',astreintePhone:'',adresse:'',latitude:null,longitude:null,_emaj:true},
];
const CASERNE_DATA={};
function initCaserneData(cid){
  if(CASERNE_DATA[cid])return;
  const c=CASERNES.find(x=>x.id===cid);
  // L'État-Major est l'espace de saisie du chef de corps : pas de compte admin dédié
  // Aucun administrateur avec un mot de passe connu n'est créé automatiquement.
  const defaultUsers=[];
  CASERNE_DATA[cid]={
    users:defaultUsers,adminLogins:[],adminLogin:'',
    ivs:[],pilpIvs:[],equipes:[],dispos:{},piquets:{},planningRotations:{},disposValidated:{},piquetsValidated:{},renforts:[],
    astrConfig:{granularity:60,engins:['VTU-01','VTU-02','VTU-03','VPI'],deadline:{dayOfWeek:5,hour:23,minute:59},deadlinePiquet:{dayOfWeek:0,hour:18,minute:0},weekStartDay:1,weekStartHour:0},
    _stationLocation:null,_operationalStartGeolocationEnabled:undefined,
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
function getCaserneStationLocation(caserneId){
  const id=caserneId||CURRENT_CASERNE_ID;
  const caserne=CASERNES.find(function(item){return item.id===id;})||{};
  const data=CASERNE_DATA[id]||{};
  const stored=data._stationLocation&&typeof data._stationLocation==='object'?data._stationLocation:{};
  const latitude=parseCaserneCoordinate(stored.latitude!=null?stored.latitude:caserne.latitude);
  const longitude=parseCaserneCoordinate(stored.longitude!=null?stored.longitude:caserne.longitude);
  return {latitude:latitude,longitude:longitude,address:String(stored.address||caserne.adresse||'')};
}
function setCaserneStationLocation(caserneId,position){
  const caserne=CASERNES.find(function(item){return item.id===caserneId;});if(!caserne||!position)return;
  initCaserneData(caserneId);
  const location={latitude:Number(position.latitude),longitude:Number(position.longitude),address:String(position.label||position.address||'')};
  caserne.latitude=location.latitude;caserne.longitude=location.longitude;caserne.adresse=location.address;
  CASERNE_DATA[caserneId]._stationLocation=location;
}
// Proxies
let USERS=[];let IVS=[];let PILP_IVS=[];let EQUIPES=[];let DISPOS={};let PIQUETS={};let DISPOS_VALIDATED={};let PIQUETS_VALIDATED={};let PLANNING_ROTATIONS={};let DISPOS_UNLOCKED={};let DISPO_REQUESTS={};let ASTR_CONFIG={granularity:60,engins:[],deadline:{dayOfWeek:5,hour:23,minute:59},deadlinePiquet:{dayOfWeek:0,hour:18,minute:0},weekStartDay:1,weekStartHour:0};
let LOGIN_HISTORY=[];
let LOGIN_HISTORY_DELETED={};
const LOGIN_HISTORY_MAX=5000;
const LOGIN_PRESENCE_TIMEOUT_MS=150000;
let _equipeIsolationCleanupTimer=null;
const _equipeIsolationCleanupPending={};
function normalizeEquipesForCaserne(cid,d){
  const result={changed:false,removedIds:[]};
  if(!cid||!d)return result;
  d.users=Array.isArray(d.users)?d.users:[];
  d.equipes=Array.isArray(d.equipes)?d.equipes:[];
  const localLogins=new Set(d.users.filter(Boolean).map(function(user){return user.l;}).filter(Boolean));
  const foreignLogins=new Set();
  Object.keys(CASERNE_DATA).forEach(function(otherCid){
    if(otherCid===cid||otherCid.startsWith('_'))return;
    const other=CASERNE_DATA[otherCid];
    (other&&Array.isArray(other.users)?other.users:[]).forEach(function(user){
      if(user&&user.l&&!localLogins.has(user.l))foreignLogins.add(user.l);
    });
  });
  GLOBAL_ACCOUNTS.forEach(function(account){
    if(account&&account.l&&account.caserneId&&account.caserneId!==cid&&!localLogins.has(account.l))foreignLogins.add(account.l);
  });
  const kept=[];
  d.equipes.forEach(function(eq){
    if(!eq||!eq.id){result.changed=true;return;}
    const members=Array.isArray(eq.membres)?eq.membres.filter(Boolean):[];
    const refs=Array.from(new Set([eq.resp].concat(members).filter(Boolean)));
    const localCount=refs.filter(function(login){return localLogins.has(login);}).length;
    const foreignCount=refs.filter(function(login){return foreignLogins.has(login)&&!localLogins.has(login);}).length;
    const explicitlyForeign=!!(eq.caserneId&&eq.caserneId!==cid);
    const copiedLegacyTeam=!eq.caserneId&&refs.length>0&&localCount===0&&foreignCount===refs.length;
    if(explicitlyForeign||copiedLegacyTeam){
      result.changed=true;result.removedIds.push(eq.id);return;
    }
    if(eq.caserneId!==cid){eq.caserneId=cid;result.changed=true;}
    const scopedMembers=members.filter(function(login){return localLogins.has(login)||!foreignLogins.has(login);});
    if(scopedMembers.length!==members.length){eq.membres=scopedMembers;result.changed=true;}
    else if(!Array.isArray(eq.membres)){eq.membres=scopedMembers;result.changed=true;}
    if(eq.resp&&foreignLogins.has(eq.resp)&&!localLogins.has(eq.resp)){eq.resp='';result.changed=true;}
    kept.push(eq);
  });
  if(kept.length!==d.equipes.length){d.equipes=kept;result.changed=true;}
  if(result.removedIds.length&&d.planningRotations){
    const removed=new Set(result.removedIds);
    Object.keys(d.planningRotations).forEach(function(wk){
      const value=d.planningRotations[wk];
      if(Array.isArray(value)){
        const next=value.map(function(id){return removed.has(id)?'':id;});
        while(next.length&&!next[next.length-1])next.pop();
        if(next.length)d.planningRotations[wk]=next.length===1?next[0]:next;
        else delete d.planningRotations[wk];
      }else if(removed.has(value))delete d.planningRotations[wk];
    });
  }
  return result;
}
function scheduleEquipeIsolationCleanup(cid,result){
  if(!result||!result.changed||!cid)return;
  if(!_equipeIsolationCleanupPending[cid])_equipeIsolationCleanupPending[cid]=new Set();
  (result.removedIds||[]).forEach(function(id){_equipeIsolationCleanupPending[cid].add(id);});
  if(_equipeIsolationCleanupTimer)return;
  _equipeIsolationCleanupTimer=window.setTimeout(async function(){
    _equipeIsolationCleanupTimer=null;
    const pending=Object.keys(_equipeIsolationCleanupPending).map(function(caserneId){
      const ids=Array.from(_equipeIsolationCleanupPending[caserneId]||[]);
      delete _equipeIsolationCleanupPending[caserneId];
      return {caserneId:caserneId,ids:ids};
    });
    if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcMarkDeleted==='function'){
      for(const item of pending){if(item.ids.length)await _rcMarkDeleted(item.caserneId,'equipe',item.ids);}
    }
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
  },0);
}
function syncCaserneContext(){
  const d=CD();
  if(!d){USERS=[];IVS=[];PILP_IVS=[];EQUIPES=[];DISPOS={};PIQUETS={};return;}
  // Chaque proxy est toujours relié uniquement aux données de la caserne active.
  // Ne jamais recopier le contexte précédent dans une caserne vide.
  const equipeScope=normalizeEquipesForCaserne(CURRENT_CASERNE_ID,d);
  scheduleEquipeIsolationCleanup(CURRENT_CASERNE_ID,equipeScope);
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
      existing.rights=Array.isArray(existing.rights)?existing.rights:[];
      ["Prise d'appel","Interventions","Historique complet","Chef d'agrès","Tireur PILP","Administration"].forEach(function(right){if(!existing.rights.includes(right))existing.rights.push(right);});
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
  let max=Number(APL_COUNTER[y])||0;
  const prefix='APL_'+y+'_';
  Object.keys(CASERNE_DATA||{}).forEach(function(cid){
    const d=CASERNE_DATA[cid]||{};
    [].concat(d.ivs||[],d.pilpIvs||[]).forEach(function(iv){
      const visible=String(iv&&(iv._numApl||iv.id)||'');
      if(visible.indexOf(prefix)!==0)return;
      const n=parseInt(visible.slice(prefix.length),10);
      if(Number.isFinite(n)&&n>max)max=n;
    });
  });
  APL_COUNTER[y]=max+1;
  return 'APL_'+y+'_'+String(APL_COUNTER[y]).padStart(APL_NUM_DIGITS,'0');
}

// Le numero APL reste lisible par les utilisateurs, mais ne sert plus de cle
// technique : deux appareils peuvent calculer le meme APL avant synchronisation.
function makeInterventionRecordId(displayNum){
  let random='';
  try{
    random=crypto.randomUUID().replace(/-/g,'').slice(0,10);
  }catch(e){
    random=Math.random().toString(36).slice(2,12);
  }
  return String(displayNum||'APL')+'-R'+Date.now().toString(36)+'-'+random;
}

// Numero lisible affiche aux utilisateurs. Les anciens enregistrements peuvent
// ne pas avoir _numApl et conserver uniquement l identifiant technique unique.
function interventionDisplayCallNumber(iv){
  const stored=String(iv&&iv._numApl||'').trim();
  if(stored)return stored;
  const technical=String(iv&&iv.id||'').trim();
  const match=technical.match(/^(APL_\d{4}_\d+)/);
  return match?match[1]:(technical||'\u2014');
}

// Compteur Inter Renfort : par caserne, depuis début d'année
function nextRenfortNum(annee){
  const y=String(annee);
  const cid=CURRENT_CASERNE_ID;
  const ivsCas=[...(CASERNE_DATA[cid]&&CASERNE_DATA[cid].ivs||[])];
  let maxR=0;
  ivsCas.forEach(function(iv){
    if(iv._isRenfort&&['en-cours','terminee'].includes(iv.s)&&interventionNumberingDateKey(iv).startsWith(y)&&iv._numRenfort){
      const n=parseInt(iv._numRenfort)||0;if(n>maxR)maxR=n;
    }
  });
  return maxR+1;
}

function interventionNumberingDateKey(reference,annee){
  if(reference&&typeof reference==='object'&&/^\d{8}/.test(String(reference._numberedAtStart||''))){
    return String(reference._numberedAtStart).replace(/\D/g,'').slice(0,8);
  }
  if(reference&&typeof reference==='object'&&typeof adminExportInterventionStartDate==='function'){
    const actual=adminExportInterventionStartDate(reference);
    if(/^\d{8}$/.test(actual))return actual;
  }
  const raw=typeof reference==='string'?reference:String(reference&&reference.h||'');
  const digits=raw.replace(/\D/g,'');
  if(digits.length>=8)return digits.slice(0,8);
  const now=N();
  const year=String(annee||now.getFullYear());
  return year+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
}

// Numérotation INT — 4 compteurs attribués à la clôture
// numGlobal  : Intercommunale (toutes casernes, début d'année)
// numCas     : UT (caserne courante, début d'année)
// numMois    : Du mois (caserne courante, repart à 0 chaque mois)
// _numSDIS   : saisi manuellement dans le CR SDIS
function nextIntNum(annee,reference){
  const referenceDate=interventionNumberingDateKey(reference,annee);
  const y=referenceDate.slice(0,4)||String(annee);
  const ymo=referenceDate.slice(0,6);
  const cid=CURRENT_CASERNE_ID;
  const initGlobal=CASERNE_DATA._initCabbalr||0;
  const initCas=(CASERNE_DATA[cid]&&CASERNE_DATA[cid]._initCompteurs&&CASERNE_DATA[cid]._initCompteurs.ut)||0;
  const initMois=(CASERNE_DATA[cid]&&CASERNE_DATA[cid]._initCompteurs&&CASERNE_DATA[cid]._initCompteurs.mois)||0;
  // Intercommunal : max toutes casernes (ou valeur init si supérieure)
  let maxGlobal=initGlobal;
  Object.values(CASERNE_DATA).forEach(function(cd){
    [...(cd.ivs||[]),...(cd.pilpIvs||[])].forEach(function(iv){
      if(['en-cours','terminee'].includes(iv.s)&&interventionNumberingDateKey(iv).startsWith(y)&&iv._numGlobal){
        const n=parseInt(iv._numGlobal)||0;if(n>maxGlobal)maxGlobal=n;
      }
    });
  });
  // UT : max caserne courante (ou valeur init si supérieure)
  const ivsCas=[...(CASERNE_DATA[cid]&&CASERNE_DATA[cid].ivs||[]),...(CASERNE_DATA[cid]&&CASERNE_DATA[cid].pilpIvs||[])];
  let maxCas=initCas,maxMois=initMois;
  ivsCas.forEach(function(iv){
    if(['en-cours','terminee'].includes(iv.s)&&!iv._isRenfort&&interventionNumberingDateKey(iv).startsWith(y)&&iv._numCaserne){const n=parseInt(iv._numCaserne)||0;if(n>maxCas)maxCas=n;}
    if(['en-cours','terminee'].includes(iv.s)&&!iv._isRenfort&&interventionNumberingDateKey(iv).startsWith(ymo)&&iv._numMois){const n=parseInt(iv._numMois)||0;if(n>maxMois)maxMois=n;}
  });
  return {numGlobal:maxGlobal+1,numCas:maxCas+1,numMois:maxMois+1};
}

function interventionNumberingStartStamp(iv){
  const starts=(Array.isArray(iv&&iv.tl)?iv.tl:[]).filter(function(entry){
    return entry&&entry.s==='en-cours'&&/^\d{8}_?\d{4}/.test(String(entry.h||''));
  });
  if(starts.length)return String(starts[starts.length-1].h).replace(/\D/g,'').slice(0,12);
  const date=interventionNumberingDateKey(iv);
  const time=String(iv&&iv._hDebut||'').replace(/\D/g,'').padStart(4,'0').slice(0,4);
  return date+(time||'0000');
}
function assignInterventionNumbersAtStart(iv){
  if(!iv)return;
  const stamp=interventionNumberingStartStamp(iv)||getH(N()).replace(/\D/g,'').slice(0,12);
  const year=parseInt(stamp.slice(0,4),10)||N().getFullYear();
  if(iv._isRenfort){
    if(!iv._numGlobal){
      const source=Object.values(CASERNE_DATA).flatMap(function(cd){return cd&&cd.ivs||[];}).find(function(item){return item&&item.id===iv._ivSourceId;});
      if(source&&source._numGlobal)iv._numGlobal=source._numGlobal;
    }
    if(!iv._numRenfort)iv._numRenfort=nextRenfortNum(year);
    iv._numCaserne=null;iv._numMois=null;iv._numberedAtStart=stamp;
    return;
  }
  if(!iv._numGlobal||!iv._numCaserne||!iv._numMois){
    const nums=nextIntNum(year,stamp);
    if(!iv._numGlobal&&cabbalrActif())iv._numGlobal=nums.numGlobal;
    if(!iv._numCaserne)iv._numCaserne=nums.numCas;
    if(!iv._numMois)iv._numMois=nums.numMois;
  }
  iv._numberedAtStart=stamp;
}
function clearInterventionNumbersForPending(iv){
  if(!iv)return;
  iv._numGlobal=null;
  iv._numCaserne=null;
  iv._numMois=null;
  if(iv._isRenfort)iv._numRenfort=null;
  delete iv._numberedAtStart;
}
function clearInterventionDepartureForPending(iv,who){
  if(!iv)return;
  const oldStart=iv._hDebut||iv._hDebutReelle||iv._hDebutInitiale||'';
  const oldDate=iv._dateDebut||statsInterventionDateKey(iv)||'';
  if(oldStart){
    if(!Array.isArray(iv._departuresInterrupted))iv._departuresInterrupted=[];
    iv._departuresInterrupted.push({heure:oldStart,date:oldDate,retourAttente:getH(N()),auteur:who||CU&&CU.l||''});
    // L’équipage est déjà parti : si une autre intervention prioritaire est
    // engagée juste après, elle doit reprendre ce départ réel.
    iv._departureHandoff={heure:oldStart,date:String(oldDate||'').replace(/\D/g,'').slice(0,8),chef:iv.agr||who||CU&&CU.l||'',sourceId:iv.id,createdAt:getH(N()),available:true};
  }
  delete iv._hDebut;delete iv._hDebutReelle;delete iv._hDebutInitiale;delete iv._dateDebut;
  delete iv._hFin;delete iv._duree;delete iv._startLockedByChain;delete iv._chainedFromInterventionId;
  delete iv._chainPreviousInterventionId;delete _pendingNextInterventionStarts[iv.id];
}
function interventionStampMillis(stamp){
  const d=String(stamp||'').replace(/\D/g,'');if(d.length<12)return 0;
  const date=new Date(Number(d.slice(0,4)),Number(d.slice(4,6))-1,Number(d.slice(6,8)),Number(d.slice(8,10)),Number(d.slice(10,12)));
  return Number.isFinite(date.getTime())?date.getTime():0;
}
function findInterruptedDepartureHandoff(chefLogin,targetId){
  const now=Date.now();
  return (IVS||[]).map(function(source){return {source:source,handoff:source&&source._departureHandoff};}).filter(function(item){
    const h=item.handoff,source=item.source;if(!h||h.available!==true||source.id===targetId||source.s!=='en-attente'||h.chef!==chefLogin)return false;
    const created=interventionStampMillis(h.createdAt);return created>0&&now-created>=0&&now-created<=6*60*60*1000;
  }).sort(function(a,b){return String(b.handoff.createdAt||'').localeCompare(String(a.handoff.createdAt||''));})[0]||null;
}

function agaiRepairNumberingByStartOrder(){
  const cid=CURRENT_CASERNE_ID;
  const data=cid&&CASERNE_DATA[cid];
  const version='20260811-start-order-v1';
  if(!data||data._numberingStartOrderVersion===version)return {applied:false,changes:[]};
  const records=[];
  const seen=new Set();
  [...(data.ivs||[]),...(data.pilpIvs||[])].forEach(function(iv){
    if(!iv||iv._isRenfort||iv._refugeAnimalier)return;
    if(iv.s==='en-attente'||iv.s==='selectionne'){
      if(iv._numGlobal||iv._numCaserne||iv._numMois)clearInterventionNumbersForPending(iv);
      return;
    }
    if(iv.s!=='en-cours'&&iv.s!=='terminee')return;
    const identity=String(iv.id||'');
    if(!identity||seen.has(identity))return;
    seen.add(identity);records.push(iv);
  });
  const changes=[];
  const sortByStart=function(a,b){
    return interventionNumberingStartStamp(a).localeCompare(interventionNumberingStartStamp(b))||String(a.id||'').localeCompare(String(b.id||''),'fr',{numeric:true});
  };
  const renumber=function(list,field,scope){
    if(!list.length)return;
    const existing=list.map(function(iv){return parseInt(iv[field],10)||0;}).filter(function(value){return value>0;});
    const first=existing.length?Math.min.apply(Math,existing):1;
    list.sort(sortByStart).forEach(function(iv,index){
      const next=first+index;
      if(parseInt(iv[field],10)===next)return;
      changes.push({id:iv.id,champ:field,avant:iv[field]||null,apres:next,periode:scope});
      iv[field]=next;
    });
  };
  const years={},months={};
  records.forEach(function(iv){
    const stamp=interventionNumberingStartStamp(iv),year=stamp.slice(0,4),month=stamp.slice(0,6);
    if(!years[year])years[year]=[];years[year].push(iv);
    if(!months[month])months[month]=[];months[month].push(iv);
    iv._numberedAtStart=stamp;
  });
  Object.keys(years).forEach(function(year){renumber(years[year],'_numCaserne',year);});
  Object.keys(months).forEach(function(month){renumber(months[month],'_numMois',month);});
  data._numberingStartOrderVersion=version;
  return {applied:true,changes:changes};
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
      const numberingDate=interventionNumberingDateKey(iv);
      const year=numberingDate.slice(0,4);
      const month=numberingDate.slice(0,6);
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
function agaiRepairMonthlyNumberingConflicts(){
  const cid=CURRENT_CASERNE_ID;
  const data=cid&&CASERNE_DATA[cid];
  if(!data)return [];
  const groups={};
  const seen=new Set();
  [...(data.ivs||[]),...(data.pilpIvs||[])].forEach(function(iv){
    if(!iv||iv._isRenfort||iv.s!=='terminee'||!iv._numMois)return;
    const identity=String(iv.id||'');if(!identity||seen.has(identity))return;seen.add(identity);
    const month=interventionNumberingDateKey(iv).slice(0,6);if(month.length!==6)return;
    if(!groups[month])groups[month]=[];groups[month].push(iv);
  });
  const changes=[];
  Object.keys(groups).forEach(function(month){
    const records=groups[month];
    const numbers=records.map(function(iv){return parseInt(iv._numMois,10)||0;}).filter(function(value){return value>0;});
    if(new Set(numbers).size===numbers.length)return;
    const firstNumber=Math.min.apply(Math,numbers);
    records.sort(function(a,b){
      const aTime=String(a._hDebut||'').replace(/\D/g,'').padStart(4,'0').slice(0,4);
      const bTime=String(b._hDebut||'').replace(/\D/g,'').padStart(4,'0').slice(0,4);
      const dateOrder=(interventionNumberingDateKey(a)+aTime).localeCompare(interventionNumberingDateKey(b)+bTime);
      if(dateOrder)return dateOrder;
      return String(a.id||'').localeCompare(String(b.id||''),'fr',{numeric:true});
    });
    records.forEach(function(iv,index){
      const next=firstNumber+index;
      if(parseInt(iv._numMois,10)===next)return;
      changes.push({id:iv.id,avant:iv._numMois,apres:next,mois:month});
      iv._numMois=next;
    });
  });
  return changes;
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
// Comparaison tolérante des adresses saisies manuellement : « 12 bis »,
// « 12bis », « 12 BIS » et « 12 Bis » désignent la même adresse.
// Les autres éléments de l'adresse restent obligatoires afin de ne pas
// confondre deux rues ou deux communes différentes.
function normalizeInterventionAddressForMatch(value){
  return nm(String(value||''))
    .replace(/[’']/g,' ')
    .replace(/[\-‐‑‒–—―,.;:()]/g,' ')
    .replace(/\b(\d+)\s*b(?:is)?\b/g,'$1bis')
    .replace(/\b(\d+)\s*t(?:er)?\b/g,'$1ter')
    .replace(/\b(\d+)\s*q(?:uater)?\b/g,'$1quater')
    .replace(/\s+/g,' ')
    .trim();
}
function sameInterventionAddress(first,second){
  const a=normalizeInterventionAddressForMatch(first),b=normalizeInterventionAddressForMatch(second);
  return !!a&&a===b;
}
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

