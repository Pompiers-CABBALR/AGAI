// === MODULE: onedrive_sync.js ===
// ══════════════════════════════════════════════════════
// SYNCHRONISATION DOSSIER PARTAGÉ (OneDrive / réseau)
// ══════════════════════════════════════════════════════
//
// Principe : aucune API, aucun compte développeur.
//
// Le fichier HTML et agai_data.json sont dans le même dossier OneDrive.
// OneDrive Desktop synchronise automatiquement ce dossier sur tous les PC.
//
// L'app utilise l'API File System Access (Chrome/Edge ≥ 86) pour :
//   - Lire agai_data.json depuis le dossier local OneDrive
//   - Écrire les données après chaque modification
//   - Détecter un fichier plus récent au démarrage (sync entrante)
//
// Si File System Access n'est pas disponible → fallback export/import manuel.
//
// MISE EN PLACE (une seule fois) :
//   1. Déposer agai.html ET agai_data.json (vide) dans le même dossier OneDrive
//   2. Dans l'app : ⚙️ → ☁️ OneDrive → "Choisir le dossier OneDrive"
//   3. Autoriser l'accès au dossier quand le navigateur le demande
//   Tous les PC qui font la même opération partagent automatiquement les données.

const OD_FS_KEY = 'agai_od_fsh_v1'; // clé pour stocker le handle de dossier
const OD_FILENAME = 'agai_data.json';
const OD_WRITE_DELAY_MS = 800; // debounce écriture (évite les écritures trop fréquentes)

let _odDirHandle = null;     // FileSystemDirectoryHandle courant
let _odWriteTimer = null;    // timer debounce
let _odLastWriteTs = 0;      // timestamp dernière écriture réussie
let _odLastReadTs = 0;       // timestamp dernière lecture réussie
let _odFsAvailable = (typeof window !== 'undefined' && 'showDirectoryPicker' in window);

// ── Helpers ──
function odGetConfig(){try{return JSON.parse(localStorage.getItem('agai_od_cfg')||'{}');}catch(e){return {};}}
function odSetConfig(obj){localStorage.setItem('agai_od_cfg',JSON.stringify({...odGetConfig(),...obj}));}

// ── Vérifier si File System Access est disponible ──
function odFsAvailable(){ return _odFsAvailable; }

// ── Choisir le dossier (une fois, mémorisé) ──
async function odChooseFolder(){
  if(!odFsAvailable()){
    showToast('Votre navigateur ne supporte pas l\'accès aux fichiers. Utilisez Chrome ou Edge.','warn');
    return false;
  }
  try{
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
      id: 'agai-onedrive',
    });
    _odDirHandle = dirHandle;
    // Persister le handle pour les prochains chargements
    try{
      const db = await _odOpenIDB();
      await _odIDBSet(db, OD_FS_KEY, dirHandle);
    }catch(e){}
    odSetConfig({folderName: dirHandle.name, folderSetAt: Date.now()});
    showToast('Dossier OneDrive configuré : '+dirHandle.name+' ✓','success');
    odRenderStatus();
    // Charger les données existantes si le fichier existe déjà
    await odPullNow();
    return true;
  }catch(e){
    if(e.name !== 'AbortError') showToast('Erreur accès dossier : '+e.message,'error');
    return false;
  }
}

// ── Restaurer le handle depuis IndexedDB au démarrage ──
async function odRestoreHandle(){
  if(!odFsAvailable()) return;
  try{
    const db = await _odOpenIDB();
    const handle = await _odIDBGet(db, OD_FS_KEY);
    if(!handle) return;
    // Vérifier que l'on a toujours la permission
    const perm = await handle.queryPermission({mode:'readwrite'});
    if(perm === 'granted'){
      _odDirHandle = handle;
      odRenderStatus();
      await odPullNow(); // sync silencieuse au démarrage
    } else if(perm === 'prompt'){
      // Afficher un bouton pour re-demander la permission
      _odDirHandle = handle;
      odRenderStatus(); // montrera le bouton "Réautoriser"
    }
  }catch(e){}
}

// ── Demander/renouveler la permission ──
async function odRequestPermission(){
  if(!_odDirHandle) return false;
  try{
    const perm = await _odDirHandle.requestPermission({mode:'readwrite'});
    if(perm === 'granted'){
      odRenderStatus();
      await odPullNow();
      return true;
    }
    return false;
  }catch(e){ return false; }
}

// ── PULL : lire agai_data.json depuis le dossier OneDrive ──
async function odPullNow(){
  if(!_odDirHandle){ showToast('Choisissez d\'abord le dossier OneDrive.','warn'); return; }
  try{
    // Vérifier/demander la permission si nécessaire
    const perm = await _odDirHandle.queryPermission({mode:'readwrite'});
    if(perm !== 'granted'){
      const newPerm = await _odDirHandle.requestPermission({mode:'readwrite'});
      if(newPerm !== 'granted'){ showToast('Permission refusée pour le dossier OneDrive.','warn'); return; }
    }
    let fileHandle;
    try{ fileHandle = await _odDirHandle.getFileHandle(OD_FILENAME); }
    catch(e){
      // Fichier absent → premier lancement, on va l'écrire
      await odSyncNow();
      return;
    }
    const file = await fileHandle.getFile();
    const remoteTs = file.lastModified;
    // Si le fichier distant est plus récent que notre dernière écriture → l'appliquer
    if(remoteTs > _odLastWriteTs + 2000){
      const text = await file.text();
      let data;
      try{
        // Essayer déchiffrement d'abord
        try{ const plain = await _decryptData(text); data = JSON.parse(plain); }
        catch(e){ data = JSON.parse(text); }
      } catch(e){ showToast('Fichier OneDrive corrompu ou illisible.','error'); return; }
      _applyDataObject(data);
      if(CURRENT_CASERNE_ID) syncCaserneContext();
      if(CU){ try{rAccueil();}catch(e){} try{rI();}catch(e){} try{rStatsHeader();}catch(e){} }
      _odLastReadTs = Date.now();
      odSetConfig({lastSync: Date.now(), lastSyncDir: 'pull'});
      odRenderStatus();
      showToast('Données mises à jour depuis OneDrive ✓','success');
    } else {
      odSetConfig({lastSync: Date.now(), lastSyncDir: 'up-to-date'});
      odRenderStatus();
    }
  }catch(e){
    showToast('Erreur lecture OneDrive : '+e.message,'error');
  }
}

// ── PUSH : écrire agai_data.json dans le dossier OneDrive ──
async function odSyncNow(){
  if(!_odDirHandle) return;
  try{
    const perm = await _odDirHandle.queryPermission({mode:'readwrite'});
    if(perm !== 'granted'){
      const newPerm = await _odDirHandle.requestPermission({mode:'readwrite'});
      if(newPerm !== 'granted') return;
    }
    const data = _buildDataObject();
    const json = JSON.stringify(data);
    // Chiffrer si possible
    let content = json;
    if(window.crypto?.subtle){ try{ content = await _encryptData(json); }catch(e){} }
    const fileHandle = await _odDirHandle.getFileHandle(OD_FILENAME, {create:true});
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    _odLastWriteTs = Date.now();
    odSetConfig({lastSync: Date.now(), lastSyncDir: 'push'});
    odRenderStatus();
  }catch(e){
    // Erreur silencieuse (ex: fichier verrouillé par OneDrive pendant la sync)
    // On réessaiera au prochain saveData
  }
}

// ── Debounce : ne pas écrire à chaque frappe, attendre 800ms d'inactivité ──
function odScheduleSync(){
  if(!_odDirHandle) return;
  if(_odWriteTimer) clearTimeout(_odWriteTimer);
  _odWriteTimer = setTimeout(()=>{ odSyncNow(); }, OD_WRITE_DELAY_MS);
}

// ── Déconnecter le dossier ──
function odDisconnect(){
  confirmModal('Dissocier le dossier OneDrive ? Les données locales sont conservées.',()=>{
    _odDirHandle = null;
    try{_odOpenIDB().then(db=>_odIDBDel(db, OD_FS_KEY));}catch(e){}
    odSetConfig({folderName:null, folderSetAt:null, lastSync:null});
    odRenderStatus();
    showToast('Dossier OneDrive dissocié.','info');
  });
}

// ── IndexedDB pour persister le FileSystemDirectoryHandle ──
function _odOpenIDB(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open('agai_od',1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}
function _odIDBSet(db, key, val){
  return new Promise((res,rej)=>{
    const tx = db.transaction('handles','readwrite');
    tx.objectStore('handles').put(val, key);
    tx.oncomplete = ()=>res();
    tx.onerror = e=>rej(e.target.error);
  });
}
function _odIDBGet(db, key){
  return new Promise((res,rej)=>{
    const tx = db.transaction('handles','readonly');
    const req = tx.objectStore('handles').get(key);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}
function _odIDBDel(db, key){
  return new Promise((res,rej)=>{
    const tx = db.transaction('handles','readwrite');
    tx.objectStore('handles').delete(key);
    tx.oncomplete = ()=>res();
    tx.onerror = e=>rej(e.target.error);
  });
}

// ── Export/import manuel (secours si navigateur sans File System Access) ──
async function odExportManuel(){
  const data = _buildDataObject();
  const json = JSON.stringify(data, null, 2);
  let content = json;
  if(window.crypto?.subtle){ try{ content = await _encryptData(json); }catch(e){} }
  const blob = new Blob([content],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'agai_backup_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Fichier exporté ✓','success');
}
async function odImportManuel(input){
  const file = input.files[0]; if(!file) return;
  const text = await file.text();
  confirmModal('Importer ce fichier ? Les données actuelles seront remplacées.',async()=>{
    try{
      let json = text;
      if(!text.trim().startsWith('{')){
        try{ json = await _decryptData(text); }catch(e){ json = text; }
      }
      const data = JSON.parse(json);
      _applyDataObject(data); saveData();
      if(CURRENT_CASERNE_ID) syncCaserneContext();
      if(CU){ try{rAccueil();}catch(e){} try{rI();}catch(e){} }
      showToast('Import réussi ✓','success');
    }catch(e){ showToast('Fichier invalide : '+e.message,'error'); }
  });
  input.value='';
}

// ── Rendu du panneau OneDrive ──
function odRenderStatus(){
  const cfg = odGetConfig();
  const stepChoose = document.getElementById('od-step-choose');
  const stepConnected = document.getElementById('od-step-connected');
  const stepNoFs = document.getElementById('od-step-nofs');
  const banner = document.getElementById('od-status-banner');
  const lastSyncEl = document.getElementById('od-last-sync');
  if(!banner) return;

  if(!odFsAvailable()){
    // Navigateur sans File System Access (Firefox, Safari)
    if(stepChoose) stepChoose.style.display = 'none';
    if(stepConnected) stepConnected.style.display = 'none';
    if(stepNoFs) stepNoFs.style.display = '';
    banner.textContent = '⚠️ Navigateur incompatible — utiliser Chrome ou Edge';
    banner.style.cssText = 'padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:12px;background:#FEF9C3;color:#713F12;border:1px solid #F59E0B;';
    return;
  }

  const connected = !!_odDirHandle;
  if(stepChoose) stepChoose.style.display = connected ? 'none' : '';
  if(stepConnected) stepConnected.style.display = connected ? '' : 'none';
  if(stepNoFs) stepNoFs.style.display = 'none';

  if(connected){
    banner.textContent = '● Dossier connecté : '+(_odDirHandle.name||cfg.folderName||'?');
    banner.style.cssText = 'padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:12px;background:#EAF3DE;color:#3B6D11;border:1px solid #3B6D11;';
    if(lastSyncEl && cfg.lastSync){
      const dir = cfg.lastSyncDir==='push'?'↑ envoyé':'cfg.lastSyncDir==="pull"'?'↓ reçu':'✓';
      lastSyncEl.textContent = 'Dernière sync : '+new Date(cfg.lastSync).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    }
  } else {
    banner.textContent = '● Non connecté — choisissez le dossier OneDrive';
    banner.style.cssText = 'padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:12px;background:#f5f5f7;color:#6c6c70;border:1px solid #e5e5ea;';
  }
}

// ── Init au démarrage ──
setTimeout(()=>{ odRestoreHandle(); }, 500);
// Créer l'indicateur de sync JSONBin
(function(){
  const el=document.createElement('div');
  el.id='jb-status';
  document.body.appendChild(el);
  _jbSetStatus('loading');
})();



loadData();
// P1 : migration des MDP en clair → hachés PBKDF2 (async, transparent)
_migratePasswords();
// Contrôle automatique de version : recharge l'app si une nouvelle version est en ligne
_startVersionCheck();

// ── Fermeture/rechargement de la page ──
// Une fermeture brève de la PWA ou un rechargement de version ne vaut pas
// déconnexion. La session est restaurée tant que le délai d'arrière-plan
// configuré n'est pas dépassé. Seul le bouton de déconnexion ferme la session.
function _prepareSessionForPageExit(){
  if(SESSION_TOKEN){
    const previous=_readStoredSession()||{};
    _persistSessionState({backgroundAt:Number(previous.backgroundAt)||_bgHiddenAt||Date.now()});
    try{
      const data=_buildDataObject();
      localStorage.setItem(JB_CACHE_KEY,JSON.stringify(data));
    }catch(e){}
  }
}
window.addEventListener('pagehide',_prepareSessionForPageExit);
window.addEventListener('beforeunload',_prepareSessionForPageExit);

function tick(){
  document.getElementById('clk').textContent=N().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const hv=document.getElementById('hv');if(hv)hv.textContent=hoA?getH(hoA):getH(N());
}
tick();setInterval(tick,1000);

// ── Édition d'un créneau existant par double-clic ──



function agentsAvecDispos(wk){
  // Retourne tous les agents (toutes équipes + sans équipe) qui ont au moins 1 créneau dispo cette semaine
  return USERS.filter(u=>{
    const d=DISPOS[wk]?.[u.l];
    return d&&Object.values(d).some(v=>v===true);
  });
}
// Grades chef d’agrès
const GRADES_CHEF_AGRES=['Caporal-chef','Sergent','Sergent-chef','Adjudant','Adjudant-chef','Lieutenant','Capitaine','Commandant','Lieutenant-colonel','Colonel'];
function isChefAgresByGrade(u){return GRADES_CHEF_AGRES.includes(u.grade)||u.rights?.includes("Chef d'agrès");}
// Rendu des indicateurs d'un agent : Dispo (barre), puis Répartition + Occupation des piquets
function _renderAgentBars(login,pct,pctColor){
  const rep=getPiquetRepartition(login);
  const occ=getPiquetOccupation(login);
  const bar=function(w,color){return '<div style="flex:1;background:#f0f0f0;border-radius:5px;height:8px;overflow:hidden;"><div style="width:'+Math.min(w,100)+'%;background:'+color+';height:100%;border-radius:5px;"></div></div>';};
  return '<div style="margin-top:4px;">'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">'
      +'<span style="font-size:10px;color:var(--t2);width:42px;">Dispo</span>'
      +bar(pct,pctColor)
      +'<span style="font-size:11px;font-weight:500;width:32px;text-align:right;">'+pct+'%</span>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:10px;">'
      +'<div style="flex:1;display:flex;align-items:center;gap:5px;">'
        +'<span style="font-size:10px;color:var(--t2);width:62px;">R\u00e9partition</span>'
        +bar(rep,'#378ADD')
        +'<span style="font-size:11px;font-weight:500;width:32px;text-align:right;color:#185FA5;">'+rep+'%</span>'
      +'</div>'
      +'<div style="flex:1;display:flex;align-items:center;gap:5px;">'
        +'<span style="font-size:10px;color:var(--t2);width:58px;">Occupation</span>'
        +bar(occ,'#7F77DD')
        +'<span style="font-size:11px;font-weight:500;width:32px;text-align:right;color:#534AB7;">'+occ+'%</span>'
      +'</div>'
    +'</div>'
  +'</div>';
}

function getSollicitation(login){
  // Pourcentage de sollicitation = jours où l'agent est affecté / 7 jours
  const wk=weekKey(getMondayOfWeek(astrPiquetWeek));
  const piquetsSem=PIQUETS[wk]||[];
  if(!piquetsSem.length)return 0;
  // Collecter les jours uniques où l'agent est affecté
  const jours=new Set();
  piquetsSem.forEach(function(p){
    if((p.membres||[]).some(function(m){return m.login===login;})){
      jours.add(p.jour||'');
    }
  });
  return Math.round(jours.size/7*100);
}

// Heures de piquet d'un agent sur la semaine affichée
function getPiquetHeures(login,wk){
  wk=wk||weekKey(getMondayOfWeek(astrPiquetWeek));
  const piquetsSem=PIQUETS[wk]||[];
  let minutes=0;
  piquetsSem.forEach(function(p){
    const membres=p.membres&&p.membres.length?p.membres:[];
    membres.forEach(function(m){
      if(m.login!==login)return;
      const deb=m.hDebut||p.debut;
      const fin=m.hFin||p.fin;
      if(!deb||!fin)return;
      let d=timeToMin(deb),f=timeToMin(fin);
      if(f<=d)f+=1440; // créneau passant minuit
      minutes+=(f-d);
    });
  });
  return minutes/60; // en heures
}

// Total des heures de piquet de toute la caserne (pour la répartition)
function getPiquetHeuresTotal(wk){
  wk=wk||weekKey(getMondayOfWeek(astrPiquetWeek));
  const piquetsSem=PIQUETS[wk]||[];
  let minutes=0;
  piquetsSem.forEach(function(p){
    const membres=p.membres&&p.membres.length?p.membres:[];
    membres.forEach(function(m){
      const deb=m.hDebut||p.debut;
      const fin=m.hFin||p.fin;
      if(!deb||!fin)return;
      let d=timeToMin(deb),f=timeToMin(fin);
      if(f<=d)f+=1440;
      minutes+=(f-d);
    });
  });
  return minutes/60;
}

// Taux de répartition : part de l'agent dans le total des piquets (%)
function getPiquetRepartition(login,wk){
  const total=getPiquetHeuresTotal(wk);
  if(total<=0)return 0;
  return Math.round(getPiquetHeures(login,wk)/total*100);
}

// Taux d'occupation : heures de piquet de l'agent sur 168h (semaine complète) (%)
function getPiquetOccupation(login,wk){
  return Math.round(getPiquetHeures(login,wk)/168*100);
}

function piquetAgentOpts(agents,exclude,includeNone){
  const wk=weekKey(getMondayOfWeek(astrPiquetWeek));
  const gran=ASTR_CONFIG.granularity||60;

  function isDispoSurCreneau(login){
    const jour=document.getElementById('pq-jour')?.value;
    const debut=document.getElementById('pq-debut')?.value;
    const fin=document.getElementById('pq-fin')?.value;
    if(!jour||!debut||!fin)return false;
    const jourIdx=JOURS_FULL.indexOf(jour);
    if(jourIdx<0)return false;
    const startHour=ASTR_CONFIG.weekStartHour||0;
    const dMin=timeToMin(debut);
    const fMin=timeToMin(fin);
    const overnight=fMin<=dMin;
    const d=DISPOS[wk]?.[login];
    if(!d)return false;
    let cur=dMin;
    const endMin=overnight?fMin+1440:fMin;
    while(cur<endMin){
      const minOfDay=cur%1440;
      const dayOff=Math.floor(cur/1440);
      const actualDayIdx=(jourIdx+dayOff)%7;
      const slotMin=((minOfDay-startHour*60)+1440)%1440;
      const slotIdx=Math.floor(slotMin/gran);
      if(!d[actualDayIdx+'_'+slotIdx])return false;
      cur+=gran;
    }
    return true;
  }

  const label=function(u){
    const eq=getEquipeOfUser(u.l);
    const dispo=isDispoSurCreneau(u.l)?'\u2705 ':'';
    const sol=getSollicitation(u.l);
    const solBadge=sol>0?' \uD83D\uDD04'+sol:'';
    return dispo+fullName(u)+' ('+gradeAbbr(u.grade)+(eq?', '+eq.nom:'')+solBadge+')';
  };

  const filtered=agents.filter(function(u){return u.l!==exclude;});

  // Construire une liste plate triée : dispos en premier, puis par équipe puis grade/alpha
  function sortedFlat(list){
    const result=[];
    // D'abord les dispos, puis les non-dispos
    const avecD=list.filter(function(u){return isDispoSurCreneau(u.l);});
    const sansD=list.filter(function(u){return !isDispoSurCreneau(u.l);});

    function addGroup(grpList, prefix){
      // Par équipe dans l'ordre, puis sans équipe
      sortEquipes(EQUIPES).forEach(function(eq){
        const m=sortByGradeThenName(grpList.filter(function(u){
          const ueq=getEquipeOfUser(u.l);return ueq&&ueq.id===eq.id;
        }));
        if(m.length)result.push({sep:prefix+eq.nom, users:m});
      });
      const sansEq=sortByGradeThenName(grpList.filter(function(u){return !getEquipeOfUser(u.l);}));
      if(sansEq.length)result.push({sep:prefix+'Sans \u00e9quipe', users:sansEq});
    }

    if(avecD.length){
      result.push({sep:'\u2705 Disponible sur ce cr\u00e9neau', users:null});
      addGroup(avecD, '\u00a0\u00a0');
    }
    if(sansD.length){
      result.push({sep:'\u2014 Non disponible / sans dispo', users:null});
      addGroup(sansD, '\u00a0\u00a0');
    }
    return result;
  }

  let opts=includeNone?'<option value="">\u2014 Aucun \u2014</option>':'';

  const avecD=filtered.filter(function(u){return isDispoSurCreneau(u.l);});
  const sansD=filtered.filter(function(u){return !isDispoSurCreneau(u.l);});

  function addSection(list, sectionLabel){
    if(!list.length)return;
    // Récupérer l'ordre des équipes selon l'astreinte de la semaine
    const wkPlan=PLANNING_ROTATIONS[wk];
    const planArr=!wkPlan?[]:(typeof wkPlan==='string'?[wkPlan]:(Array.isArray(wkPlan)?wkPlan:[]));
    const eq1Id=planArr[0]||null;
    const eq2Id=planArr[1]||null;

    // Trier les équipes : astreinte forte → 2ème astreinte → autres → sans équipe
    const orderedEquipes=[
      ...EQUIPES.filter(function(e){return e.id===eq1Id;}),
      ...EQUIPES.filter(function(e){return e.id===eq2Id&&e.id!==eq1Id;}),
      ...sortEquipes(EQUIPES.filter(function(e){return e.id!==eq1Id&&e.id!==eq2Id;}))
    ];

    orderedEquipes.forEach(function(eq){
      const m=sortByGradeThenName(list.filter(function(u){
        const ueq=getEquipeOfUser(u.l);return ueq&&ueq.id===eq.id;
      }));
      if(!m.length)return;
      const eqLabel=eq.id===eq1Id?eq.nom+' &#x1F534;':eq.id===eq2Id?eq.nom+' &#x1F7E1;':eq.nom;
      opts+='<optgroup label="'+sectionLabel+' \u2014 '+eqLabel+'">';
      m.forEach(function(u){opts+='<option value="'+u.l+'">'+label(u)+'</option>';});
      opts+='</optgroup>';
    });
    const sansEq=sortByGradeThenName(list.filter(function(u){return !getEquipeOfUser(u.l);}));
    if(sansEq.length){
      opts+='<optgroup label="'+sectionLabel+' \u2014 Sans \u00e9quipe">';
      sansEq.forEach(function(u){opts+='<option value="'+u.l+'">'+label(u)+'</option>';});
      opts+='</optgroup>';
    }
  }

  addSection(avecD, '\u2705 Dispo');
  addSection(sansD, '\u2014 Non dispo');

  return opts;
}

// ── NOUVEAU SYSTÈME PIQUET : plusieurs agents par rôle avec heures individuelles ──

const PQ_ROLES_VTU=['Chef d\u2019agr\u00e8s','Conducteur','\u00c9quipier'];
const PQ_ROLES_VPI=['Chef d\u2019agr\u00e8s','Conducteur','Chef d\u2019\u00e9quipe','\u00c9quipier'];
const PQ_ROLE_COLORS={'Chef d\u2019agr\u00e8s':'#E6F1FB','Conducteur':'#EAF3DE','Chef d\u2019\u00e9quipe':'#F3EAF8','\u00c9quipier':'#FAEEDA'};
const PQ_ROLE_TEXT_COLORS={'Chef d\u2019agr\u00e8s':'var(--blu)','Conducteur':'var(--grn)','Chef d\u2019\u00e9quipe':'#6C3483','\u00c9quipier':'#854F0B'};

// Compteur global pour les IDs de lignes dans le formulaire
let _pqLineId=0;

// ── Mini-grille des disponibilités du jour (aide à la saisie d'un piquet) ──
// Affiche, pour chaque agent, ses créneaux disponibles sur le jour sélectionné.
// La plage du piquet en cours de saisie est encadrée pour comparaison visuelle.
function pqBuildMiniGrille(wk){
  const jour=document.getElementById('pq-jour')?.value;
  const debut=document.getElementById('pq-debut')?.value;
  const fin=document.getElementById('pq-fin')?.value;
  if(!jour)return '<div style="font-size:11px;color:var(--t2);padding:8px;">Sélectionnez un jour pour voir les disponibilités.</div>';
  const jourIdx=JOURS_FULL.indexOf(jour);
  if(jourIdx<0)return '';
  const gran=ASTR_CONFIG.granularity||60;
  const startHour=ASTR_CONFIG.weekStartHour||0;
  const slots=Math.floor(1440/gran);
  const dispoWk=DISPOS[wk]||{};
  const agents=sortByGradeThenName(USERS.filter(function(u){
    const d=dispoWk[u.l];if(!d)return false;
    for(let s=0;s<slots;s++){if(d[jourIdx+'_'+s]===true)return true;}
    return false;
  }));
  if(!agents.length)return '<div style="font-size:11px;color:var(--t2);padding:8px;background:#FEF3C7;border-radius:6px;">⚠️ Aucun agent disponible le '+escHtml(jour)+'.</div>';
  const dMin=debut?timeToMin(debut):null;
  const fMin=fin?timeToMin(fin):null;
  const overnight=(dMin!==null&&fMin!==null&&fMin<=dMin);
  const inPlage=function(slotIdx){
    if(dMin===null||fMin===null)return true;
    const slotStart=(startHour*60+slotIdx*gran)%1440;
    if(overnight)return slotStart>=dMin||slotStart<fMin;
    return slotStart>=dMin&&slotStart<fMin;
  };
  // Nom abrégé : "Canneson E." (nom + initiale du prénom)
  const nomAbrege=function(u){
    const n=(u.nom||'').trim();
    const p=(u.prenom||'').trim();
    return n+(p?' '+p.charAt(0).toUpperCase()+'.':'');
  };
  const _lw=78,_cw=13;
  const _hLabel=function(si){const t=(startHour*60+si*gran)%1440;return pad(Math.floor(t/60))+'h';};
  let h='<div style="background:#fff;border:1px solid var(--brd);border-radius:8px;padding:8px;margin-bottom:12px;">';
  h+='<div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:6px;">📅 Disponibilités du '+escHtml(jour)+' <span style="font-weight:400;">— vert vif = dispo sur la plage du piquet · pâle = hors plage</span></div>';
  h+='<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;">';
  h+='<div style="min-width:'+(_lw+slots*_cw)+'px;">';
  h+='<div style="display:flex;margin-bottom:3px;"><div style="width:'+_lw+'px;flex-shrink:0;"></div>';
  for(let s=0;s<slots;s++){
    const show=(gran>=60)?(s%2===0):(s%(120/gran)===0);
    const dans=inPlage(s);
    h+='<div style="flex:1 0 '+_cw+'px;text-align:left;font-size:8px;color:'+(dans?'var(--t)':'#C7C7CC')+';font-weight:'+(dans?'600':'400')+';overflow:visible;white-space:nowrap;">'+(show?_hLabel(s):'')+'</div>';
  }
  h+='</div>';
  agents.forEach(function(u){
    const d=dispoWk[u.l]||{};
    h+='<div style="display:flex;align-items:center;margin-bottom:3px;">';
    h+='<div style="width:'+_lw+'px;flex-shrink:0;font-size:10px;color:var(--t);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:4px;" title="'+escHtml(fullName(u))+'">'+escHtml(nomAbrege(u))+'</div>';
    for(let s=0;s<slots;s++){
      const ok=d[jourIdx+'_'+s]===true;
      const dans=inPlage(s);
      // Dans la plage : couleurs franches. Hors plage : couleurs atténuées.
      const bg=ok?(dans?'#22C55E':'#BBF0CD'):(dans?'#D1D5DB':'#F1F2F4');
      h+='<div style="flex:1 0 '+_cw+'px;height:16px;background:'+bg+';box-sizing:border-box;border-left:1px solid #fff;"></div>';
    }
    h+='</div>';
  });
  h+='</div></div></div>';
  return h;
}

let _pqCurrentWk=null; // semaine du formulaire piquet en cours (pour la mini-grille)
function pqBuildForm(wk,engin,jourDefaut,existingP){
  _pqCurrentWk=wk;
  // Liste des rôles distincts de l'engin selon la config superadmin
  const cfgRoles=getEnginRoles(engin);
  const _normRole=function(s){return (s||'').toLowerCase().replace(/[\u00e8\u00e9\u00ea]/g,'e').replace(/[^a-z]/g,'');};
  let roles=[];
  cfgRoles.forEach(function(r){
    if(r.role&&!roles.some(function(x){return _normRole(x)===_normRole(r.role);}))roles.push(r.role);
  });
  // S'assurer que le chef d'agrès est présent en tête (sans doublon, quelle que soit l'apostrophe)
  const CA='Chef d\u2019agr\u00e8s';
  if(!roles.some(function(x){return _normRole(x)===_normRole(CA);}))roles.unshift(CA);
  if(!roles.length)roles=isVPI(engin)?PQ_ROLES_VPI:PQ_ROLES_VTU;
  const debutDef=existingP?existingP.debut:'08:00';
  const finDef=existingP?existingP.fin:'20:00';
  _pqLineId=0;

  // En-tête : jour + heures globales
  const jourOpts=JOURS_FULL.map(function(j){return '<option value="'+j+'"'+(j===jourDefaut?' selected':'')+'>'+j+'</option>';}).join('');
  let html='<div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">'
    +'<div class="fg"><div class="fgl">Jour</div><select class="fi" id="pq-jour" onchange="pqRefreshDispos()">'+jourOpts+'</select></div>'
    +'<div class="fg"><div class="fgl">D\u00e9but cr\u00e9neau</div><input class="fi" type="time" id="pq-debut" value="'+debutDef+'" oninput="pqFinHint(this);pqSyncTimes(\'debut\',this.value)"/></div>'
    +'<div class="fg"><div class="fgl">Fin cr\u00e9neau <span id="pq-fin-hint" style="font-size:10px;color:var(--amb);display:none;">+1j</span></div>'
    +'<input class="fi" type="time" id="pq-fin" value="'+finDef+'" oninput="pqFinHint(this);pqSyncTimes(\'fin\',this.value)"/></div>'
    +'</div>';
  // Mini-grille des disponibilités du jour (mise à jour par pqRefreshDispos)
  html+='<div id="pq-mini-grille"></div>';

  // Un bloc par rôle
  roles.forEach(function(role){
    const bg=PQ_ROLE_COLORS[role]||'#f9f9f9';
    const fg=PQ_ROLE_TEXT_COLORS[role]||'var(--t)';
    const existingForRole=existingP?(existingP.membres||[]).filter(function(m){return m.role===role;}):[];
    const initAgents=existingForRole.length?existingForRole:[{login:'',hDebut:debutDef,hFin:finDef}];

    html+='<div style="background:'+bg+';border-radius:8px;padding:8px 10px;margin-bottom:8px;" id="pq-role-block-'+_encodeRole(role)+'">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
      +'<span style="font-size:11px;font-weight:600;color:'+fg+';">'+role+'</span>'
      +'<button type="button" class="btn sm" style="font-size:10px;padding:1px 7px;" onclick="pqAddLine(\''+_encodeRole(role)+'\',\''+debutDef+'\',\''+finDef+'\',\''+wk+'\')">+ Agent</button>'
      +'</div>'
      +'<div id="pq-lines-'+_encodeRole(role)+'">';

    initAgents.forEach(function(a){
      html+=pqBuildLine(_pqLineId++,role,a.login,a.hDebut||debutDef,a.hFin||finDef,wk);
    });
    html+='</div></div>';
  });

  html+='<div class="fg"><div class="fgl">Note</div><input class="fi" type="text" id="pq-note" value="'+(existingP&&existingP.note?existingP.note:'')+'"/></div>'
    +'<div id="pq-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>';
  html+='</div>';
  return html;
}

function _encodeRole(role){
  return role.replace(/[^a-zA-Z0-9]/g,'_');
}

function pqBuildLine(lineId,role,loginVal,hDebut,hFin,wk){
  const opts=piquetAgentOpts(USERS,'',true);
  return '<div style="display:grid;grid-template-columns:1fr 80px 80px 28px;gap:4px;align-items:center;margin-bottom:4px;" id="pq-line-'+lineId+'">'
    +'<select class="fi pq-agent-sel" style="font-size:11px;padding:3px 4px;" data-role="'+_encodeRole(role)+'" id="pq-agent-'+lineId+'">'+opts+'</select>'
    +'<input type="time" class="fi" style="font-size:11px;padding:3px 4px;" id="pq-hdebut-'+lineId+'" value="'+hDebut+'">'
    +'<input type="time" class="fi" style="font-size:11px;padding:3px 4px;" id="pq-hfin-'+lineId+'" value="'+hFin+'">'
    +'<button type="button" style="background:none;border:none;color:#E24B4A;font-size:14px;cursor:pointer;padding:0;" onclick="pqRemoveLine('+lineId+')">&#x2715;</button>'
    +'</div>';
}

function pqAddLine(roleEnc,hDebut,hFin,wk){
  const container=document.getElementById('pq-lines-'+roleEnc);
  if(!container)return;
  const div=document.createElement('div');
  const role=decodeURIComponent(roleEnc.replace(/_/g,' '));
  div.innerHTML=pqBuildLine(_pqLineId,role,'' ,hDebut,hFin,wk);
  container.appendChild(div.firstChild);
  // Pré-remplir le select avec la valeur correcte
  const sel=document.getElementById('pq-agent-'+_pqLineId);
  if(sel)sel.value='';
  _pqLineId++;
}

function pqRemoveLine(lineId){
  const el=document.getElementById('pq-line-'+lineId);
  if(el)el.remove();
}

function pqGetMembres(wk){
  // Lire tous les rôles et leurs agents
  const membres=[];
  const allRoles=[...PQ_ROLES_VTU,...PQ_ROLES_VPI.filter(function(r){return !PQ_ROLES_VTU.includes(r);})];
  allRoles.forEach(function(role){
    const enc=_encodeRole(role);
    const container=document.getElementById('pq-lines-'+enc);
    if(!container)return;
    const lines=container.querySelectorAll('[id^="pq-line-"]');
    lines.forEach(function(line){
      const lid=line.id.replace('pq-line-','');
      const sel=document.getElementById('pq-agent-'+lid);
      const hd=document.getElementById('pq-hdebut-'+lid);
      const hf=document.getElementById('pq-hfin-'+lid);
      if(sel&&sel.value){
        membres.push({role:role,login:sel.value,hDebut:hd?hd.value:'',hFin:hf?hf.value:''});
      }
    });
  });
  return membres;
}

// Pré-remplir les selects après injection du HTML (valeurs existantes)
function pqPrefillSelects(existingP){
  if(!existingP||!existingP.membres)return;
  existingP.membres.forEach(function(m,i){
    const sel=document.getElementById('pq-agent-'+i);
    if(sel&&m.login){
      for(let j=0;j<sel.options.length;j++){
        if(sel.options[j].value===m.login){sel.selectedIndex=j;break;}
      }
    }
  });
}


function addPiquet(wk,engin,jourDefaut){
  document.getElementById('mt').textContent='Nouveau cr\u00e9neau \u2014 '+engin;
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=pqBuildForm(wk,engin,jourDefaut||JOURS_FULL[0],null)
    +'<div id="pq-suggestions" style="margin-bottom:8px;"></div>'
    +'<div class="brow" style="flex-wrap:wrap;gap:6px;">'
    +'<button class="btn pr sm" onclick="confirmAddPiquet(\''+wk+'\',\''+engin+'\')">Valider</button>'
    +'<button class="btn sm" style="background:#059669;color:#fff;border-color:#059669;" onclick="suggestCreneaux(\''+wk+'\')">💡 Suggérer des créneaux</button>'
    +'<button class="btn sm" onclick="cM()">Annuler</button>'
    +'</div>';
  document.getElementById('mo').style.display='flex';
  setTimeout(function(){
    const d=document.getElementById('pq-debut');const f=document.getElementById('pq-fin');
    if(d)d.dataset.prev=d.value;if(f)f.dataset.prev=f.value;
    // Rafraîchir les dispos avec les valeurs par défaut
    pqRefreshDispos();
  },50);
}
function suggestCreneaux(wk){
  const gran=ASTR_CONFIG.granularity||60;
  const startHour=ASTR_CONFIG.weekStartHour||0;
  const slotsPerDay=getSlotsPerDay(gran);
  const _pv=PLANNING_ROTATIONS[wk];
  const planSlots=!_pv?[]:(typeof _pv==='string'?[_pv]:(Array.isArray(_pv)?_pv:[]));
  const eq1=planSlots[0]?getEquipeById(planSlots[0]):null;
  const eq2=planSlots[1]?getEquipeById(planSlots[1]):null;

  // Priorité agents : eq1 → eq2 → reste
  function getPriorite(login){
    if(eq1&&eq1.membres.includes(login))return 1;
    if(eq2&&eq2.membres.includes(login))return 2;
    return 3;
  }

  // Vérifier si un agent est dispo sur un slot précis
  function isAgentDispo(login,dayIdx,slotIdx){
    return DISPOS[wk]?.[login]?.[dayIdx+'_'+slotIdx]===true;
  }

  // Trouver les créneaux continus pour chaque jour
  const suggestions=[];
  JOURS_FULL.forEach(function(jour,dayIdx){
    // Pour chaque slot de départ possible
    let slotIdx=0;
    while(slotIdx<slotsPerDay){
      // Chercher les agents chefs d'agrès et conducteurs dispos sur ce slot
      const chefsDispos=USERS.filter(function(u){
        return (isChefAgresByGrade(u)||u.rights?.includes("Chef d'agrès"))&&isAgentDispo(u.l,dayIdx,slotIdx);
      });
      const conducteursDispos=USERS.filter(function(u){
        return isAgentDispo(u.l,dayIdx,slotIdx)&&!chefsDispos.find(function(c){return c.l===u.l;});
      });

      if(!chefsDispos.length||!conducteursDispos.length){slotIdx++;continue;}

      // Prolonger le créneau tant que chef+conducteur sont dispos
      const chefLogin=chefsDispos.sort((a,b)=>getPriorite(a.l)-getPriorite(b.l)||getSollicitation(a.l)-getSollicitation(b.l))[0].l;
      const condLogin=conducteursDispos.sort((a,b)=>getPriorite(a.l)-getPriorite(b.l)||getSollicitation(a.l)-getSollicitation(b.l))[0].l;
      let endSlot=slotIdx;
      while(endSlot<slotsPerDay&&isAgentDispo(chefLogin,dayIdx,endSlot)&&isAgentDispo(condLogin,dayIdx,endSlot)){
        endSlot++;
      }
      const duree=(endSlot-slotIdx)*gran;
      if(duree>=gran){ // au moins 1 créneau
        const debutMin=((startHour*60+slotIdx*gran)%1440+1440)%1440;
        const finMin=((startHour*60+endSlot*gran)%1440+1440)%1440;
        const fmt=function(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
        // Compter tous les agents dispos sur ce créneau
        const agentsDispo=USERS.filter(function(u){
          for(let s=slotIdx;s<endSlot;s++){if(!isAgentDispo(u.l,dayIdx,s))return false;}
          return true;
        });
        const chefsChef=agentsDispo.filter(u=>isChefAgresByGrade(u)||u.rights?.includes("Chef d'agrès"));
        suggestions.push({jour,dayIdx,slotIdx,endSlot,debut:fmt(debutMin),fin:fmt(finMin),duree,chefsCount:chefsChef.length,agentsCount:agentsDispo.length,chefLogin,condLogin});
      }
      slotIdx=endSlot>slotIdx?endSlot:slotIdx+1;
    }
  });

  if(!suggestions.length){
    document.getElementById('pq-suggestions').innerHTML='<div style="background:#FEF2F2;border-radius:8px;padding:10px;font-size:12px;color:#991B1B;margin-bottom:8px;">⚠️ Aucun créneau trouvé avec un chef d\'agrès et un conducteur disponibles simultanément.</div>';
    return;
  }

  // Afficher les suggestions
  let html='<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:10px;margin-bottom:8px;">';
  html+='<div style="font-size:12px;font-weight:600;color:#166534;margin-bottom:8px;">💡 Créneaux suggérés (chef d\'agrès + conducteur disponibles)</div>';
  html+='<div style="display:flex;flex-wrap:wrap;gap:6px;">';
  suggestions.slice(0,8).forEach(function(s){
    const chefU=USERS.find(u=>u.l===s.chefLogin);
    const condU=USERS.find(u=>u.l===s.condLogin);
    const dureeH=Math.floor(s.duree/60)+'h'+(s.duree%60?String(s.duree%60).padStart(2,'0'):'');
    html+='<button onclick="applySuggestion(\''+s.jour+'\',\''+s.debut+'\',\''+s.fin+'\')" style="background:#fff;border:1px solid #86EFAC;border-radius:8px;padding:6px 10px;cursor:pointer;text-align:left;font-size:11px;">'
      +'<div style="font-weight:600;color:#166534;">'+s.jour+' '+s.debut+'→'+s.fin+' ('+dureeH+')</div>'
      +'<div style="color:#444;">👮 '+(chefU?fullName(chefU):s.chefLogin)+'</div>'
      +'<div style="color:#444;">🚗 '+(condU?fullName(condU):s.condLogin)+'</div>'
      +'<div style="color:#888;font-size:10px;">'+s.agentsCount+' agents dispos</div>'
      +'</button>';
  });
  html+='</div></div>';
  document.getElementById('pq-suggestions').innerHTML=html;
}

function applySuggestion(jour,debut,fin){
  const jourSel=document.getElementById('pq-jour');
  const debutSel=document.getElementById('pq-debut');
  const finSel=document.getElementById('pq-fin');
  if(jourSel)jourSel.value=jour;
  if(debutSel){debutSel.value=debut;debutSel.dataset.prev=debut;}
  if(finSel){finSel.value=fin;finSel.dataset.prev=fin;}
  // Mettre à jour les hints
  pqFinHint(finSel);
  pqSyncTimes('debut',debut);
  pqSyncTimes('fin',fin);
  // Lancer le remplissage avec le créneau sélectionné
  const wk=weekKey(getMondayOfWeek(astrPiquetWeek));
  autoFillPiquet(wk);
  document.getElementById('pq-suggestions').innerHTML='';
}

function autoFillPiquet(wk){
  // Récupérer le planning de rotation pour la semaine
  const _pv=PLANNING_ROTATIONS[wk];
  const planSlots=!_pv?[]:(typeof _pv==='string'?[_pv]:(Array.isArray(_pv)?_pv:[]));
  const eq1=planSlots[0]?getEquipeById(planSlots[0]):null; // Astr. forte
  const eq2=planSlots[1]?getEquipeById(planSlots[1]):null; // 2ème astreinte

  // Construire la liste des agents disponibles sur le créneau, par priorité
  function getDisposEnPriorite(excludeLogins){
    const taken=excludeLogins||[];
    function isDispoPiquet(login){
      const jour=document.getElementById('pq-jour')?.value;
      const debut=document.getElementById('pq-debut')?.value;
      const fin=document.getElementById('pq-fin')?.value;
      if(!jour||!debut||!fin)return false;
      const gran=ASTR_CONFIG.granularity||60;
      const startHour=ASTR_CONFIG.weekStartHour||0;
      const jourIdx=JOURS_FULL.indexOf(jour);
      if(jourIdx<0)return false;
      const d=DISPOS[wk]?.[login];if(!d)return false;
      const dMin=timeToMin(debut),fMin=timeToMin(fin);
      const overnight=fMin<=dMin;
      let cur=dMin;const endMin=overnight?fMin+1440:fMin;
      while(cur<endMin){
        const minOfDay=cur%1440,dayOff=Math.floor(cur/1440);
        const actualDayIdx=(jourIdx+dayOff)%7;
        const slotMin=((minOfDay-startHour*60)+1440)%1440;
        const slotIdx=Math.floor(slotMin/gran);
        if(!d[actualDayIdx+'_'+slotIdx])return false;
        cur+=gran;
      }
      return true;
    }
    // Trier par nombre de sollicitations croissant (moins sollicité en premier)
    function sortBySol(list){return list.sort((a,b)=>getSollicitation(a.l)-getSollicitation(b.l));}
    const eq1Members=eq1?sortBySol(USERS.filter(u=>!taken.includes(u.l)&&eq1.membres.includes(u.l)&&isDispoPiquet(u.l))):[];
    const eq2Members=eq2?sortBySol(USERS.filter(u=>!taken.includes(u.l)&&eq2.membres.includes(u.l)&&!eq1Members.find(x=>x.l===u.l)&&isDispoPiquet(u.l))):[];
    const autresDispo=sortBySol(USERS.filter(u=>!taken.includes(u.l)&&!eq1Members.find(x=>x.l===u.l)&&!eq2Members.find(x=>x.l===u.l)&&isDispoPiquet(u.l)));
    return [...eq1Members,...eq2Members,...autresDispo];
  }

  const taken=[];
  // Vérifier qu'il y a au moins 1 chef d'agrès ET 1 conducteur disponibles
  const tousDispos=getDisposEnPriorite([]);
  const chefsDisposTous=tousDispos.filter(u=>isChefAgresByGrade(u)||u.rights?.includes("Chef d'agrès"));
  if(!chefsDisposTous.length){
    showToast('⚠️ Aucun chef d\'agrès disponible sur ce créneau','warn');return;
  }
  const conduiteursDisposTous=tousDispos.filter(u=>!chefsDisposTous.slice(0,1).find(x=>x.l===u.l));
  if(!conduiteursDisposTous.length){
    showToast('⚠️ Aucun conducteur disponible sur ce créneau','warn');return;
  }

  // Chef d'agrès
  const chef=chefsDisposTous[0];
  const selCA=document.getElementById('pq-ca');
  if(selCA){selCA.value=chef.l;taken.push(chef.l);}

  // Remplir les autres rôles
  const allSels=document.querySelectorAll('.pq-sel');
  allSels.forEach(function(s){
    if(s.id==='pq-ca')return; // déjà rempli
    const disposPour=getDisposEnPriorite(taken);
    if(disposPour.length){
      s.value=disposPour[0].l;
      taken.push(disposPour[0].l);
    }
  });

  showToast('Piquets remplis automatiquement ✓','success');
  refreshPiquetSelects();
}

function pqFinHint(el){var h=document.getElementById("pq-fin-hint");if(h)h.style.display=(el.value&&document.getElementById("pq-debut").value&&el.value<=document.getElementById("pq-debut").value)?"inline":"none";}

// Synchronise les heures des agents qui avaient l'ancienne valeur globale
function pqSyncTimes(type,newVal){
  const inputId=type==='debut'?'pq-debut':'pq-fin';
  const el=document.getElementById(inputId);
  if(!el)return;
  const oldVal=el.dataset.prev||'';
  el.dataset.prev=newVal;
  if(oldVal){
    const agentInputs=document.querySelectorAll(type==='debut'?'[id^="pq-hdebut-"]':'[id^="pq-hfin-"]');
    agentInputs.forEach(function(inp){
      if(inp.value===oldVal)inp.value=newVal;
    });
  }
  // Rafraîchir les dispos et la mini-grille dès que l'heure change
  pqRefreshDispos();
}

function pqRefreshDispos(){
  // Mettre à jour la mini-grille des disponibilités du jour
  const mg=document.getElementById('pq-mini-grille');
  if(mg&&_pqCurrentWk)mg.innerHTML=pqBuildMiniGrille(_pqCurrentWk);
  // Reconstruire toutes les listes déroulantes agents avec les dispos du créneau
  const sels=Array.from(document.querySelectorAll('.pq-agent-sel,.pq-sel'));
  const vals={};sels.forEach(function(s){vals[s.id]=s.value;});
  sels.forEach(function(sel){
    const cur=vals[sel.id]||'';
    const isChef=sel.dataset.role==='Chef_d_agr_s'||sel.id==='pq-ca';
    const taken=sels.filter(function(o){return o.id!==sel.id&&vals[o.id];}).map(function(o){return vals[o.id];});
    const base=isChef?USERS.filter(isChefAgresByGrade):USERS;
    const poolFiltered=base.filter(function(u){return u.l===cur||!taken.includes(u.l);});
    sel.innerHTML=piquetAgentOpts(poolFiltered,'',true);
    if(cur)sel.value=cur;
  });
}
function refreshPiquetSelects(){
  const sels=Array.from(document.querySelectorAll('.pq-sel'));
  const vals={};sels.forEach(function(s){vals[s.id]=s.value;});
  sels.forEach(function(sel){
    const cur=vals[sel.id]||'';
    const isChef=sel.id==='pq-ca';
    const taken=sels.filter(function(o){return o.id!==sel.id&&vals[o.id];}).map(function(o){return vals[o.id];});
    const base=isChef?USERS.filter(isChefAgresByGrade):USERS;
    const poolFiltered=base.filter(function(u){return u.l===cur||!taken.includes(u.l);});
    sel.innerHTML=piquetAgentOpts(poolFiltered,'',true); // toujours optionnel
    if(cur)sel.value=cur;
  });
}

function updateConducteurOpts(){refreshPiquetSelects();}

function confirmAddPiquet(wk,engin){
  const jour=document.getElementById('pq-jour').value;
  const debut=document.getElementById('pq-debut').value;
  const fin=document.getElementById('pq-fin').value;
  const note=document.getElementById('pq-note')?.value.trim()||'';
  const err=document.getElementById('pq-err');err.style.display='none';
  const membres=pqGetMembres(wk);
  const conflits=[];
  membres.forEach(function(m){
    if(hasConflitPiquet(wk,m.login,jour,m.hDebut||debut,m.hFin||fin,-1)){
      const u=USERS.find(function(x){return x.l===m.login;});
      conflits.push((u?u.prenom+' '+u.nom:m.login)+' ('+m.role+')');
    }
  });
  if(conflits.length){err.style.display='block';err.textContent='&#x26A0; Conflit : '+conflits.join(', ');return;}
  if(!PIQUETS[wk])PIQUETS[wk]=[];
  const _nr=function(s){return (s||'').toLowerCase().replace(/[\u00e8\u00e9\u00ea]/g,'e').replace(/[^a-z]/g,'');};
  const ca=membres.find(function(m){return _nr(m.role)===_nr("Chef d'agr\u00e8s");});
  const co=membres.find(function(m){return _nr(m.role)===_nr('Conducteur');});
  const ceq=membres.find(function(m){return _nr(m.role)===_nr("Chef d'\u00e9quipe");});
  const eq=membres.find(function(m){return _nr(m.role)===_nr('\u00c9quipier');});
  const newP={engin,jour,debut,fin,note,membres,
    chefAgres:ca?ca.login:'',conducteur:co?co.login:'',
    chefEquipe:ceq?ceq.login:'',stagiaire:eq?eq.login:''};
  PIQUETS[wk].push(newP);
  if(astrPiquetWeek===0) logPiquetChange(wk,'ajout',newP);
  saveData();cM();rAstrPiquets();
}

// ══════════════════════════════════════════════════════
// ÉQUIPES — gestion admin
// ══════════════════════════════════════════════════════


// ── Échelle de toit ──
// ── Inter. SDIS ──
// ── Heure affichage HH:MM ──

// ── Durée entre deux HH:MM ──

// ── Modale personnel avant départ ──
// ── Détermine si un engin est VPI ──

// ── Récupère le piquet actif pour un login donné ──

// ── Construit le HTML d'un sélecteur d'agent avec rôle ──

// ── Reconstruit toutes les options en excluant les agents déjà pris ──






// ── Correction requérant ──

// ────────────────── RELÈVE DE PERSONNEL ──────────────────



// ────────────────── DEMANDE DE RENFORT UT ──────────────────





// Accepter / refuser un renfort (caserne destinataire)





// Annulation ciblée d'un renfort pour une seule UT (seulement si pas encore répondu)


// ══════════════════════════════════════════════════════
// STATISTIQUES CASERNE
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// ACTIVITÉ DE SERVICE
// ══════════════════════════════════════════════════════
let ACTIVITES = [];

// ── Numérotation ──
function actGetData(){ return (CURRENT_CASERNE_ID&&CASERNE_DATA[CURRENT_CASERNE_ID]) ? (CASERNE_DATA[CURRENT_CASERNE_ID].activites||(CASERNE_DATA[CURRENT_CASERNE_ID].activites=[])) : ACTIVITES; }
function activityIsFraisAdministratifs(a){
  const category=a&&a.categorie?a.categorie:defaultActivityCategory(a&&a.type);
  return isAdminExpenseCategory(category)||defaultActivityCategory(a&&a.type)===ADMIN_EXPENSE_CATEGORY;
}
function activityParticipantLogins(a){
  return Array.from(new Set((Array.isArray(a&&a.participants)?a.participants:[]).map(function(login){return String(login||'').trim();}).filter(Boolean)));
}
function activityVisibleInHistory(a){
  if(hasAdministrativeAccount())return true;
  if(!CU)return false;
  if(activityIsFraisAdministratifs(a)&&!canAccessFraisAdministratifs())return false;
  return Array.isArray(a&&a.participants)&&a.participants.includes(CU.l);
}
function actTypesForCurrentUser(){
  return ACT_TYPES.filter(t=>!isAdminExpenseCategory(t.cat||defaultActivityCategory(t.l))||canAccessFraisAdministratifs());
}
function actNextNums(date){
  const data=actGetData();
  const y=date.slice(0,4),m=date.slice(5,7);
  const numAn=(data.filter(a=>a.date&&a.date.startsWith(y)).map(a=>a.numAnnuel||0).reduce((mx,v)=>Math.max(mx,v),0))+1;
  const numMois=(data.filter(a=>a.date&&a.date.startsWith(y+'-'+m)).map(a=>a.numMensuel||0).reduce((mx,v)=>Math.max(mx,v),0))+1;
  return {numAnnuel:numAn,numMensuel:numMois};
}
function actFmtAn(a){ return a.date.slice(0,4)+'-'+String(a.numAnnuel).padStart(4,'0'); }
function actFmtMois(a){ return a.date.slice(0,4)+'-'+a.date.slice(5,7)+'-'+String(a.numMensuel).padStart(4,'0'); }
function actNumStr(a){ return actFmtAn(a)+' — '+actFmtMois(a); }

// ── Validation date ──
function actDateIsValid(dateStr){
  const now=new Date(); now.setHours(0,0,0,0);
  const d=new Date(dateStr+'T00:00:00');
  const limit7=new Date(now); limit7.setDate(limit7.getDate()-7);
  if(d>now) return 'La date ne peut pas être dans le futur.';
  if(d<limit7) return 'La date ne peut pas être antérieure à 7 jours.';
  return null;
}

// ── Calcul durée ──
function actCalcDuree(){
  const hd=document.getElementById('act-hdebut')?.value;
  const hf=document.getElementById('act-hfin')?.value;
  const el=document.getElementById('act-duree');
  if(!el)return;
  if(hd&&hf){
    const [hh,mm]=hd.split(':').map(Number), [hh2,mm2]=hf.split(':').map(Number);
    let mins=(hh2*60+mm2)-(hh*60+mm);
    if(mins<0)mins+=24*60;
    el.value=dureeMinutesHHMM(mins);
  } else { el.value=''; }
}

// ── Changement de date → aperçu numéro ──
function actDateChange(){
  const d=document.getElementById('act-date')?.value;
  const p=document.getElementById('act-num-preview');
  if(!p)return;
  if(!d){p.textContent='';return;}
  const err=actDateIsValid(d);
  if(err){p.textContent='⚠ '+err;p.style.color='#E24B4A';return;}
  const {numAnnuel,numMensuel}=actNextNums(d);
  p.style.color='var(--t2)';
  p.textContent='→ '+d.slice(0,4)+'-'+String(numAnnuel).padStart(4,'0')+' · '+d.slice(0,4)+'-'+d.slice(5,7)+'-'+String(numMensuel).padStart(4,'0');
}

// ── Participants ──
function actLoadParticipants(){
  const el=document.getElementById('act-participants');
  if(!el)return;
  const agents=[...(USERS||[])].sort((a,b)=>a.nom.localeCompare(b.nom,'fr')||a.prenom.localeCompare(b.prenom,'fr'));
  if(!agents.length){el.innerHTML='<div style="color:var(--t2);">Aucun agent disponible.</div>';return;}
  el.innerHTML=agents.map(u=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd);cursor:pointer;font-size:12px;">
    <input type="checkbox" value="${u.l}" style="width:15px;height:15px;accent-color:var(--red);">
    <span>${u.nom} ${u.prenom}</span>
    <span style="font-size:11px;color:var(--t3);margin-left:auto;">${u.grade||'—'}</span>
  </label>`).join('');
  // Pré-cocher l'agent connecté
  if(CU){ const cb=el.querySelector(`input[value="${CU.l}"]`); if(cb)cb.checked=true; }
}

// ── Initialisation onglet ──
function actToggleForm(){
  const panel=document.getElementById('act-form-panel');
  const btn=document.getElementById('act-new-btn');
  const willOpen=panel.style.display==='none'||panel.style.display==='';
  panel.style.display=willOpen?'block':'none';
  if(btn){btn.style.display=willOpen?'none':'';btn.textContent='+ Nouvelle activité';}
  if(willOpen){
    const now=new Date();
    const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    const dateEl=document.getElementById('act-date');
    if(dateEl){dateEl.value=today;actDateChange();}
    const sel=document.getElementById('act-type');
    if(sel){sel.innerHTML='<option value="">\u2014 Choisir \u2014</option>'+actTypesForCurrentUser().map(a=>`<option value="${a.l.replace(/"/g,'&quot;')}">${a.i} ${a.l}</option>`).join('');}
    actLoadParticipants();
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
}

function rActivite(){
  const panel=document.getElementById('act-form-panel');
  if(panel)panel.style.display='none';
  const btn=document.getElementById('act-new-btn');
  if(btn){btn.style.display='';btn.textContent='+ Nouvelle activit\u00e9';}
  rActiviteList();
}

// ── Contrôle d'accès activité ──
function actCanSeeDetail(a){
  return activityVisibleInHistory(a);
}

// ── Liste ──
function rActiviteList(){
  const list=document.getElementById('act-list');
  if(!list)return;
  const data=actGetData().filter(activityVisibleInHistory);
  const isAdmin=isAdminModeActive();
  const sorted=[...data].sort((a,b)=>b.date.localeCompare(a.date)||b.ts-a.ts);
  if(!sorted.length){list.innerHTML='<div style="text-align:center;padding:20px;color:var(--t2);font-size:13px;">Aucune activité enregistrée.</div>';return;}
  const MO=['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  // Grouper par année → mois
  const grp={};
  sorted.forEach(a=>{
    const y=a.date.slice(0,4),m=a.date.slice(5,7);
    if(!grp[y])grp[y]={};
    if(!grp[y][m])grp[y][m]=[];
    grp[y][m].push(a);
  });
  const ys=Object.keys(grp).sort((a,b)=>b-a);
  list.innerHTML=ys.map(y=>{
    const ms=Object.keys(grp[y]).sort((a,b)=>b-a);
    const tot=ms.reduce((s,m)=>s+grp[y][m].length,0);
    return `<div class="hgrp"><div class="hgh" onclick="tg('acty${y}','aacy${y}')">📅 ${y}<span class="bdg bgr" style="margin-left:auto;">${tot}</span><span id="aacy${y}" style="margin-left:6px;">▼</span></div>
    <div id="acty${y}" class="hgb">${ms.map(m=>{
      const tm=grp[y][m].length;
      return `<div class="hsub" onclick="tg('actm${y}${m}','aacm${y}${m}')">${MO[parseInt(m)]}<span class="bdg bgr" style="margin-left:6px;">${tm}</span><span id="aacm${y}${m}" style="margin-left:auto;">▼</span></div>
      <div id="actm${y}${m}">${grp[y][m].map(a=>{
        const actDef=ACT_TYPES.find(x=>x.l===a.type);
        const ico=actDef?actDef.i:'📋';
        const numStr=a.numAnnuel?actNumStr(a):'—';
        const nbP=(a.participants||[]).length;
        const canSee=actCanSeeDetail(a);
        const printCount=(a.impressions||[]).length;
        const pb=printCount?` 🖨×${printCount}`:'';
        return `<div class="hm" onclick="${canSee?`actVoirDetail('${a.id}')`:''}">
          <span style="font-family:monospace;font-size:10px;color:var(--t3);">${a.date.slice(8,10)}/${m}/${y}</span>
          <span style="flex:1;font-size:12px;color:var(--t);">${ico} ${a.type}</span>
          <span style="font-size:11px;color:var(--t2);">${a.hDebut||''}${a.hFin?' → '+a.hFin:''} ${(a.duree||a.hDebut&&a.hFin)?'· '+dureeFormatHHMM(a.duree,a.hDebut,a.hFin):''} · ${nbP}p${pb}</span>
          ${!canSee?'<span style="font-size:10px;color:var(--t3);">🔒</span>':''}
          ${canSee?`<button class="btn sm" style="background:var(--rd);color:#fff;font-size:10px;padding:1px 5px;margin-left:4px;" onclick="event.stopPropagation();actImprimerRapport('${a.id}')">🖨</button>`:''}
          ${isAdmin?`<button class="btn sm" style="font-size:10px;padding:1px 5px;" onclick="event.stopPropagation();actEditer('${a.id}')">✏️</button>`:''}
          ${isSuperAdmin()?`<button class="btn sm danger" style="font-size:10px;padding:1px 5px;" onclick="event.stopPropagation();deleteActivite('${a.id}')">🗑</button>`:''}
        </div>`;
      }).join('')}</div>`;
    }).join('')}</div></div>`;
  }).join('');
}

// ── Enregistrement ──
function saveActivite(){
  const date=document.getElementById('act-date')?.value;
  const type=document.getElementById('act-type')?.value;
  const hd=document.getElementById('act-hdebut')?.value;
  const hf=document.getElementById('act-hfin')?.value;
  const cr=(document.getElementById('act-cr')?.value||'').trim();
  const err=document.getElementById('act-err');
  err.style.display='none';
  if(!date||!type||!hd||!hf||!cr){err.style.display='block';err.textContent='Date, type, heures et compte rendu sont obligatoires.';return;}
  const dateErr=actDateIsValid(date);
  if(dateErr){err.style.display='block';err.textContent=dateErr;return;}
  if(hf<=hd&&!(hf<hd)){/* ok */}
  const participants=Array.from(document.querySelectorAll('#act-participants input[type=checkbox]:checked')).map(cb=>cb.value);
  const dureeEl=document.getElementById('act-duree')?.value||'';
  const {numAnnuel,numMensuel}=actNextNums(date);
  const id='ACT_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const typeDef=ACT_TYPES.find(t=>t.l===type);
  if(activityIsFraisAdministratifs({type,categorie:typeDef?.cat})&&!canAccessFraisAdministratifs()){err.style.display='block';err.textContent='Acc\u00e8s non autoris\u00e9 aux frais administratifs.';return;}
  const entry={id,date,type,categorie:typeDef?.cat||'Activit\u00e9s de service',hDebut:hd,hFin:hf,duree:dureeEl,cr,participants,
    numAnnuel,numMensuel,
    auteur:CU?CU.l:'',auteurNom:CU?(CU.prenom+' '+CU.nom):'',
    ts:Date.now(), historique:[], impressions:[]};
  actGetData().push(entry);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : sinon l'activité peut être écrasée au prochain pull
  // Reset form
  ['act-date','act-hdebut','act-hfin','act-cr'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('act-duree').value='';
  document.getElementById('act-type').value='';
  document.getElementById('act-num-preview').textContent='';
  document.querySelectorAll('#act-participants input[type=checkbox]').forEach(cb=>cb.checked=false);
  rActiviteList();
  // Fermer le formulaire après sauvegarde
  const fp=document.getElementById('act-form-panel');if(fp)fp.style.display='none';
  const fb=document.getElementById('act-new-btn');if(fb){fb.style.display='';fb.textContent='+ Nouvelle activité';}
  showToast('Activité '+actFmtAn({date,numAnnuel})+' / '+actFmtMois({date,numMensuel})+' enregistrée ✓','success');
}

// ── Voir détail ──
function actVoirDetail(id){
  const data=actGetData();
  const a=data.find(x=>x.id===id);
  if(!a)return;
  if(!actCanSeeDetail(a)){showToast('Accès réservé aux participants de cette activité','warn');return;}
  const canEdit=isAdminModeActive();
  const histHtml=(a.historique&&a.historique.length)?`<div style="background:var(--al);border-radius:8px;padding:10px;margin-top:10px;">
    <div style="font-size:11px;font-weight:700;color:#854F0B;text-transform:uppercase;margin-bottom:6px;">📝 Historique des modifications</div>
    ${a.historique.map(h=>`<div style="font-size:11px;color:var(--t2);border-bottom:1px solid var(--brd);padding:4px 0;">${h.date} par ${h.auteurNom} — ${h.champs}</div>`).join('')}
  </div>`:'';
  const impressions=a.impressions||[];
  const printHtml=impressions.length?`<div style="background:var(--bg);border-radius:8px;padding:8px 10px;margin-top:8px;">
    <div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;margin-bottom:4px;">🖨 Impressions (${impressions.length})</div>
    ${impressions.map(p=>`<div style="font-size:11px;color:var(--t2);padding:2px 0;">${p.date} par ${p.auteurNom}</div>`).join('')}
  </div>`:'<div style="font-size:11px;color:var(--t3);margin-top:4px;">Rapport non encore imprimé.</div>';
  const nbP=(a.participants||[]).length;
  const sortedPart=[...(a.participants||[])].sort((la,lb)=>{
    const ua=USERS.find(x=>x.l===la),ub=USERS.find(x=>x.l===lb);
    return ((ua?ua.nom:la).localeCompare(ub?ub.nom:lb,'fr'));
  });
  const presListe=sortedPart.map(l=>{const u=USERS.find(x=>x.l===l);return u?((u.grade?u.grade+' ':'')+u.nom+' '+u.prenom):l;}).join('<br>');
  document.getElementById('mt').textContent='Activité — '+actNumStr(a);
  document.getElementById('mi').textContent=a.type+' · '+a.date;
  document.getElementById('mb').innerHTML=`<div>
    <div class="mr"><div class="ml">Date</div><div class="mv2">${a.date}</div></div>
    <div class="mr"><div class="ml">Heures</div><div class="mv2">${a.hDebut||'—'} → ${a.hFin||'—'} (${dureeFormatHHMM(a.duree,a.hDebut,a.hFin)||'—'})</div></div>
    <div class="mr"><div class="ml">Type</div><div class="mv2">${a.type}</div></div>
    <div class="mr"><div class="ml">Participants (${nbP})</div><div class="mv2" style="font-size:12px;line-height:1.8;">${presListe||'—'}</div></div>
    <div class="msep"></div>
    <div class="mr"><div class="ml">Compte rendu</div><div class="mv2" style="white-space:pre-wrap;">${a.cr||'—'}</div></div>
    <div class="msep"></div>
    ${printHtml}
    ${histHtml}
    <div class="brow" style="margin-top:12px;">
      <button class="btn sm" style="background:var(--rd);color:#fff;" onclick="actImprimerRapport('${id}')">🖨 Imprimer rapport</button>
      ${canEdit?`<button class="btn sm" onclick="cM();actEditer('${id}')">✏️ Modifier</button>`:''}
      ${isSuperAdmin()?`<button class="btn sm danger" onclick="cM();deleteActivite('${id}')">🗑 Supprimer</button>`:''}
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}

// ── Modifier (admin/superadmin uniquement) ──
function actEditer(id){
  if(!isAdminModeActive()){showToast('Accès réservé aux administrateurs','warn');return;}
  const data=actGetData();
  const a=data.find(x=>x.id===id);
  if(!a)return;
  if(activityIsFraisAdministratifs(a)&&!canAccessFraisAdministratifs()){showToast('Acc\u00e8s r\u00e9serv\u00e9 aux profils autoris\u00e9s.','warn');return;}
  const agentsOpts=[...(USERS||[])].sort((u1,u2)=>u1.nom.localeCompare(u2.nom,'fr')||u1.prenom.localeCompare(u2.prenom,'fr')).map(u=>`<label style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--brd);font-size:12px;">
    <input type="checkbox" value="${u.l}" ${(a.participants||[]).includes(u.l)?'checked':''} style="width:14px;height:14px;accent-color:var(--red);">
    <span>${u.nom} ${u.prenom}</span><span style="font-size:10px;color:var(--t3);margin-left:auto;">${u.grade||''}</span></label>`).join('');
  document.getElementById('mt').textContent='Modifier — '+actNumStr(a);
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`<div>
    <div class="fg"><div class="fgl">Type</div><select class="fi" id="aedit-type">${actTypesForCurrentUser().map(t=>`<option value="${t.l}"${t.l===a.type?' selected':''}>${t.i} ${t.l}</option>`).join('')}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="fg"><div class="fgl">Heure début</div><input class="fi" type="time" id="aedit-hd" value="${a.hDebut||''}" oninput="aeditCalcDuree()"/></div>
      <div class="fg"><div class="fgl">Heure fin</div><input class="fi" type="time" id="aedit-hf" value="${a.hFin||''}" oninput="aeditCalcDuree()"/></div>
    </div>
    <div class="fg"><div class="fgl">Durée calculée</div><input class="fi" type="text" id="aedit-duree" value="${dureeFormatHHMM(a.duree,a.hDebut,a.hFin)}" readonly style="background:#f5f5f7;color:var(--t2);"/></div>
    <div class="fg"><div class="fgl">Participants</div><div style="background:var(--bg);border-radius:10px;padding:8px;border:1px solid var(--brd);max-height:150px;overflow-y:auto;" id="aedit-participants">${agentsOpts}</div></div>
    <div class="fg"><div class="fgl">Compte rendu</div><textarea class="fta" id="aedit-cr" style="min-height:80px;">${a.cr||''}</textarea></div>
    <div class="fg"><div class="fgl">Motif de modification <span class="req">*</span></div><input class="fi" type="text" id="aedit-motif" placeholder="Ex : correction heure de fin..."/></div>
    <div id="aedit-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
    <div class="brow"><button class="btn pr sm" onclick="actSaveEdit('${id}')">💾 Enregistrer</button><button class="btn sm" onclick="cM()">Annuler</button></div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function aeditCalcDuree(){
  const hd=document.getElementById('aedit-hd')?.value,hf=document.getElementById('aedit-hf')?.value;
  const el=document.getElementById('aedit-duree');if(!el)return;
  if(hd&&hf)el.value=dureeHHMM(hd,hf)||'';else el.value='';
}
function actSaveEdit(id){
  const data=actGetData();
  const a=data.find(x=>x.id===id);
  if(!a)return;
  const motif=(document.getElementById('aedit-motif')?.value||'').trim();
  const err=document.getElementById('aedit-err');
  if(!motif){err.style.display='block';err.textContent='Le motif de modification est obligatoire.';return;}
  // Journaliser les changements
  const champs=[];
  const newType=document.getElementById('aedit-type')?.value;
  const selectedType=ACT_TYPES.find(t=>t.l===newType);
  if(activityIsFraisAdministratifs({type:newType,categorie:selectedType?.cat})&&!canAccessFraisAdministratifs()){err.style.display='block';err.textContent='Acc\u00e8s non autoris\u00e9 aux frais administratifs.';return;}
  const newHd=document.getElementById('aedit-hd')?.value;
  const newHf=document.getElementById('aedit-hf')?.value;
  const newDuree=document.getElementById('aedit-duree')?.value;
  const newCr=(document.getElementById('aedit-cr')?.value||'').trim();
  const newPart=Array.from(document.querySelectorAll('#aedit-participants input[type=checkbox]:checked')).map(cb=>cb.value);
  if(newType!==a.type)champs.push('type');
  if(newHd!==a.hDebut)champs.push('heure début');
  if(newHf!==a.hFin)champs.push('heure fin');
  if(newCr!==a.cr)champs.push('compte rendu');
  if(JSON.stringify(newPart.slice().sort())!==JSON.stringify((a.participants||[]).slice().sort()))champs.push('participants');
  if(!a.historique)a.historique=[];
  const now=new Date();
  a.historique.push({date:now.toLocaleDateString('fr-FR')+' '+now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),auteur:CU?CU.l:'',auteurNom:CU?(CU.prenom+' '+CU.nom):'',champs:(champs.length?champs.join(', '):'(aucun champ modifié)')+' — '+motif});
  const newTypeDef=ACT_TYPES.find(t=>t.l===newType);
  a.type=newType;a.categorie=newTypeDef?.cat||'Activit\u00e9s de service';a.hDebut=newHd;a.hFin=newHf;a.duree=newDuree;a.cr=newCr;a.participants=newPart;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);cM();rActiviteList();showToast('Activité modifiée ✓','success'); // push immédiat
}

// ── Impression rapport ──
function actImprimerRapport(id){
  const data=actGetData();
  const a=data.find(x=>x.id===id);
  if(!a){showToast('Activité introuvable','warn');return;}
  if(!actCanSeeDetail(a)){showToast('Accès réservé aux participants de cette activité','warn');return;}
  const html=genRapportActiviteHTML(a);
  // Enregistrer l'impression
  if(!a.impressions)a.impressions=[];
  const now=new Date();
  a.impressions.push({date:now.toLocaleDateString('fr-FR')+' '+now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),auteur:CU?CU.l:'',auteurNom:CU?(CU.prenom+' '+CU.nom):''});
  saveData();
  rActiviteList();
  openIframeModal(html,null);
}

function genRapportActiviteHTML(a){
  const JOURS_FR=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const MOIS_FR=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d=new Date(a.date+'T00:00:00');
  const dateLongue='Le '+JOURS_FR[d.getDay()]+' '+d.getDate()+' '+MOIS_FR[d.getMonth()]+' '+d.getFullYear();
  const numStr=a.numAnnuel?(actFmtAn(a)+' — '+actFmtMois(a)):'—';
  const B='1px solid #000';

  // Présents — triés alphabétiquement
  const participants=[...(a.participants||[])].sort((la,lb)=>{const ua=USERS.find(x=>x.l===la),ub=USERS.find(x=>x.l===lb);return (ua?ua.nom:la).localeCompare(ub?ub.nom:lb,'fr');});
  const PW='90px';
  let presHtml='<div style="display:flex;line-height:1.6;"><span style="min-width:'+PW+';font-weight:bold;">Présents\u00a0:</span>';
  if(participants.length>0){
    const u0=USERS.find(x=>x.l===participants[0]);
    presHtml+='<span>'+(u0?(u0.grade?u0.grade+' ':'')+u0.nom+' '+u0.prenom:participants[0])+'</span>';
  }
  presHtml+='</div>';
  for(let i=1;i<participants.length;i++){
    const u=USERS.find(x=>x.l===participants[i]);
    presHtml+='<div style="display:flex;line-height:1.6;"><span style="min-width:'+PW+';flex-shrink:0;"></span><span>'+(u?(u.grade?u.grade+' ':'')+u.nom+' '+u.prenom:participants[i])+'</span></div>';
  }

  // Lignes tableau
  const rows=[];
  rows.push(['',dateLongue]);
  rows.push(['','Nature de l\u2019activité de service\u00a0: '+a.type]);
  if(a.hDebut)rows.push([a.hDebut,'Début']);
  if(a.hFin)rows.push([a.hFin,'Fin']);
  rows.push(['','<div style="text-align:center;"><u><b>Compte rendu de mission</b></u></div>']);
  rows.push(['','<span style="white-space:pre-wrap;">'+(a.cr||'\u00a0')+'</span>']);
  rows.push(['','\u00a0']);
  rows.push(['',presHtml]);

  const idxH=a.hDebut?2:-1;
  let rowsBefore=idxH>=0?idxH:rows.length;
  if(rowsBefore===0)rowsBefore=1;

  const numCell='<td rowspan="'+rowsBefore+'" style="width:28mm;border-left:'+B+';border-right:'+B+';text-align:center;vertical-align:top;padding:4px 3px;font-size:9pt;">'
    +'Activité de service<br>'+numStr.replace(' — ','<br>')+'</td>';

  let rowsHtml='';
  rows.forEach(function(rd,i){
    const gh=rd[0],tx=rd[1];
    const isLast=(i===rows.length-1);
    const bb=isLast?'border-bottom:'+B+';':'';
    const ghStyle='style="width:28mm;border-left:'+B+';border-right:'+B+';'+bb+'text-align:center;vertical-align:top;padding:1px 3px;font-size:12pt;font-weight:bold;line-height:1.6;"';
    const txStyle='style="border-right:'+B+';'+bb+'vertical-align:top;padding:1px 5px;font-size:12pt;line-height:1.6;"';
    if(i<rowsBefore){
      if(i===0)rowsHtml+='<tr>'+numCell+'<td '+txStyle+'>'+tx+'</td></tr>';
      else rowsHtml+='<tr><td '+txStyle+'>'+tx+'</td></tr>';
    } else {
      rowsHtml+='<tr><td '+ghStyle+'>'+(gh||'')+'</td><td '+txStyle+'>'+tx+'</td></tr>';
    }
  });

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rapport d\u2019activité de service</title>'
    +'<style>@page{size:A4 portrait;margin:0;}*{box-sizing:border-box;margin:0;padding:0;}html{background:#666;}'
    +'body{font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#000;margin:0;padding:15px 0;background:#666;}'
    +'.page{width:210mm;min-height:297mm;margin:0 auto 20px auto;padding:10mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4);}'
    +'table{border-collapse:collapse;width:100%;}p{margin:0;}'
    +'.no-print{position:fixed;top:10px;right:10px;z-index:999;display:flex;gap:6px;background:rgba(255,255,255,.95);padding:6px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);}'
    +'.no-print button{padding:6px 12px;border:none;border-radius:5px;cursor:pointer;font-size:12px;}'
    +'@media print{.no-print{display:none;}html,body{background:none;padding:0;}.page{width:100%;min-height:auto;margin:0;padding:10mm;box-shadow:none;}}'
    +'</style></head><body>'
    +'<div class="no-print"><button onclick="window.print()" style="background:#C0392B;color:#fff;">🖨 Imprimer</button></div>'
    +'<div class="page">'
    +'<table style="border-top:'+B+';border-left:0;border-right:0;">'
    +'<tr><td colspan="2" style="border-left:'+B+';border-right:'+B+';border-bottom:'+B+';text-align:center;font-size:13pt;font-weight:bold;padding:4px;">Rapport d\u2019activité de service</td></tr>'
    +'<tr><td style="width:28mm;border-left:'+B+';border-right:'+B+';border-bottom:'+B+';text-align:center;font-weight:bold;padding:3px;font-size:9.5pt;">GH</td>'
    +'<td style="border-right:'+B+';border-bottom:'+B+';text-align:center;font-weight:bold;padding:3px;font-size:9.5pt;">Texte</td></tr>'
    +rowsHtml
    +'</table></div></body></html>';
}

function deleteActivite(id){
  if(!isSuperAdmin()){showToast('Accès réservé au super-administrateur','warn');return;}
  confirmModal('Supprimer définitivement cette activité de service ?',async function(){
    const data=actGetData();
    const idx=data.findIndex(x=>x.id===id);
    if(idx>=0){
      if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcMarkDeleted==='function'&&CURRENT_CASERNE_ID){
        try{await _rcMarkDeleted(CURRENT_CASERNE_ID,'activite',[id]);}catch(e){}
      }
      data.splice(idx,1);
      if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
      saveData(true);rActiviteList();showToast('Activité supprimée','success');
    }
  });
}

function deleteFmpa(id){
  if(!isSuperAdmin()){showToast('Accès réservé au super-administrateur','warn');return;}
  confirmModal('Supprimer définitivement cette FMPA ?',async function(){
    const data=fmpaGetData();
    const idx=data.findIndex(x=>x.id===id);
    if(idx>=0){
      // Propager la suppression au serveur AVANT de retirer localement, sinon la FMPA revient au prochain pull
      if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcMarkDeleted==='function'&&CURRENT_CASERNE_ID){
        try{await _rcMarkDeleted(CURRENT_CASERNE_ID,'fmpa',[id]);}catch(e){}
      }
      data.splice(idx,1);
      if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
      saveData(true);rFmpaList();showToast('FMPA supprimée','success');
    }
  });
}


