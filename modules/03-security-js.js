// === MODULE: security.js ===
// ══════════════════════════════════════════════════════
// SÉCURITÉ — Hachage PBKDF2 (P1), Session (P2), XSS (P4)
// ══════════════════════════════════════════════════════

// ── Helpers binaire/hex ──
function _toHex(buf){return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function _fromHex(hex){return new Uint8Array(hex.match(/.{2}/g).map(b=>parseInt(b,16)));}

// ── P1 : Hachage PBKDF2-SHA256 ──
// Retourne une promesse : "saltHex:hashHex"
async function hashPassword(password){
  const enc=new TextEncoder();
  const km=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},km,256);
  return _toHex(salt)+':'+_toHex(bits);
}

// Retourne une promesse booléenne
async function verifyPassword(password,stored){
  if(!stored||!stored.includes(':'))return false;
  const [saltHex,hashHex]=stored.split(':');
  const salt=_fromHex(saltHex);
  const enc=new TextEncoder();
  const km=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},km,256);
  return _toHex(bits)===hashHex;
}

// Détecte si un MDP est déjà haché (format "32hexChars:64hexChars")
function _isHashed(p){return typeof p==='string'&&/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(p);}

function _agaiReadAuthSession(){
  if(_agaiAuthSession)return _agaiAuthSession;
  try{_agaiAuthSession=JSON.parse(localStorage.getItem(AUTH_LINK_SESSION_KEY)||'null');}catch(error){_agaiAuthSession=null;}
  if(_agaiAuthSession&&!_agaiAuthRefreshTimer)setTimeout(_agaiScheduleAuthRefresh,0);
  return _agaiAuthSession;
}
function _agaiAuthAccessToken(){
  const session=_agaiReadAuthSession();
  if(!session||!session.access_token)return'';
  const expires=Number(session.expires_at)||0;
  if(expires&&expires*1000<Date.now()+30000)return'';
  return String(session.access_token);
}
function _agaiStoreAuthSession(session){
  _agaiAuthSession=session&&session.access_token?session:null;
  try{
    if(_agaiAuthSession)localStorage.setItem(AUTH_LINK_SESSION_KEY,JSON.stringify(_agaiAuthSession));
    else localStorage.removeItem(AUTH_LINK_SESSION_KEY);
  }catch(error){}
  _agaiScheduleAuthRefresh();
}
function _agaiScheduleAuthRefresh(){
  if(_agaiAuthRefreshTimer){clearTimeout(_agaiAuthRefreshTimer);_agaiAuthRefreshTimer=null;}
  const session=_agaiAuthSession;if(!session||!session.refresh_token||!session.expires_at)return;
  const delay=Math.max(5000,Number(session.expires_at)*1000-Date.now()-90000);
  _agaiAuthRefreshTimer=setTimeout(_agaiRefreshAuthSession,delay);
}
async function _agaiRefreshAuthSession(){
  const session=_agaiReadAuthSession();if(!session||!session.refresh_token)return false;
  try{
    const response=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
    const refreshed=await response.json();if(!response.ok||!refreshed.access_token)throw new Error('HTTP '+response.status);
    _agaiStoreAuthSession(refreshed);return true;
  }catch(error){console.warn('[AGAI][AUTH] Renouvellement de session différé :',error);_agaiAuthRefreshTimer=setTimeout(_agaiRefreshAuthSession,30000);return false;}
}
async function _agaiLinkSupabaseAccount(account,password){
  if(!AUTH_LINK_ENABLED||!account||!account.l)return false;
  try{
    const response=await fetch(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','x-device-id':agaiDeviceId()},body:JSON.stringify({mode:'login',login:account.l,password:password})});
    const result=await response.json().catch(function(){return{};});
    if(!response.ok||!result.session||!result.authUserId)throw new Error(result.error||('HTTP '+response.status));
    _agaiStoreAuthSession(result.session);
    account._supabaseAuthId=String(result.authUserId);
    account._supabaseLinkedAt=new Date().toISOString();
    account.caserneId=result.caserneId||account.caserneId;
    account.appRole=result.appRole||account.appRole;
    _agaiAuthBridgeState='active';
    return true;
  }catch(error){
    _agaiAuthBridgeState='error';
    console.warn('[AGAI][AUTH] Liaison Supabase différée :',error);
    return false;
  }
}
async function _agaiLinkedPasswordChange(mode,login,newPassword){
  if(!AUTH_LINK_ENABLED)return true;
  const token=_agaiAuthAccessToken();
  if(!token)return false;
  try{
    const response=await fetch(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','x-device-id':agaiDeviceId()},body:JSON.stringify({mode:mode,login:login,newPassword:newPassword})});
    if(!response.ok){const detail=await response.json().catch(function(){return{};});throw new Error(detail.error||('HTTP '+response.status));}
    return true;
  }catch(error){console.warn('[AGAI][AUTH] Mot de passe non synchronisé :',error);return false;}
}
async function _agaiProvisionLinkedAccount(account,password){
  if(!AUTH_LINK_ENABLED)return true;
  const token=_agaiAuthAccessToken();if(!token)return false;
  try{
    const response=await fetch(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','x-device-id':agaiDeviceId()},body:JSON.stringify({mode:'admin_provision',login:account.l,newPassword:password,caserneId:account.caserneId,appRole:account.appRole||deriveAccountRole(account),firstName:account.prenom||'',lastName:account.nom||''})});
    if(!response.ok){const detail=await response.json().catch(function(){return{};});throw new Error(detail.error||('HTTP '+response.status));}
    return true;
  }catch(error){console.warn('[AGAI][AUTH] Création du compte lié impossible :',error);return false;}
}
async function _agaiSyncLinkedAccount(account){
  if(!AUTH_LINK_ENABLED||!account||!account.l)return true;
  const token=_agaiAuthAccessToken();if(!token)return false;
  try{
    const response=await fetch(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','x-device-id':agaiDeviceId()},body:JSON.stringify({mode:'admin_sync',login:account.l,caserneId:account.caserneId||CURRENT_CASERNE_ID,appRole:account.appRole||deriveAccountRole(account),firstName:account.prenom||'',lastName:account.nom||''})});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return true;
  }catch(error){console.warn('[AGAI][AUTH] Métadonnées du compte à resynchroniser :',error);return false;}
}
async function _agaiDeactivateLinkedAccount(login){
  if(!AUTH_LINK_ENABLED)return true;
  const token=_agaiAuthAccessToken();if(!token)return false;
  try{
    const response=await fetch(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({mode:'admin_deactivate',login:login})});
    return response.ok;
  }catch(error){return false;}
}
async function _agaiCheckAccountLinkServer(force){
  if(!AUTH_LINK_ENABLED){_agaiAuthBridgeState='disabled';return false;}
  try{
    const response=await fetch(SB_REST+'/rpc/agai_account_link_health',{method:'POST',headers:_sbHeaders,body:'{}'});
    _agaiAuthBridgeState=response.ok?'active':response.status===404?'missing':'error';
    _agaiAuthBridgeHealth=response.ok?await response.json():null;
  }catch(error){_agaiAuthBridgeState='error';_agaiAuthBridgeHealth=null;}
  const target=document.getElementById('sa-auth-link-state');
  if(target){
    const health=_agaiAuthBridgeHealth||{},linked=Number(health.linkedAccounts)||0,total=Number(health.eligibleAccounts)||0;
    target.textContent=_agaiAuthBridgeState==='active'?(linked+' / '+total+' compte(s) rattaché(s)'):_agaiAuthBridgeState==='missing'?'Script v239 à installer':_agaiAuthBridgeState==='disabled'?'À activer après installation':'Vérification impossible';
    target.style.color=_agaiAuthBridgeState==='active'&&total&&linked===total?'#047857':_agaiAuthBridgeState==='error'?'#B91C1C':'#B45309';
  }
  return _agaiAuthBridgeState==='active';
}

// ── P2 : Session token + timeout automatique ──
let SESSION_TOKEN=null;
let SESSION_EXPIRY=null;
let _sessionTimer=null;
let _sessionWarnTimer=null;
let _sessionLastPersist=0;
let _loginPresenceLastPush=0;
// SESSION_DURATION_MS est défini dans config.js

function agaiDeviceId(){
  const key='agai_device_id';
  try{
    let value=localStorage.getItem(key);
    if(!value){value=(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'device-'+Date.now()+'-'+Math.random().toString(36).slice(2));localStorage.setItem(key,value);}
    return value;
  }catch(e){return'SESSION-'+String(SESSION_TOKEN||'temp');}
}

function _readStoredSession(){
  try{return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)||'null');}catch(e){return null;}
}
function _persistSessionState(extra){
  if(!SESSION_TOKEN||!CU)return;
  const previous=_readStoredSession()||{};
  const record=Object.assign({},previous,{
    token:SESSION_TOKEN,
    login:CU.l,
    caserneId:CURRENT_CASERNE_ID||CU.caserneId||'',
    globalRole:GLOBAL_ROLE||null,
    expiresAt:SESSION_EXPIRY,
    lastSeenAt:Date.now()
  },extra||{});
  try{localStorage.setItem(SESSION_STORAGE_KEY,JSON.stringify(record));_sessionLastPersist=Date.now();}catch(e){}
}
function _armSessionTimers(){
  if(_sessionTimer)clearTimeout(_sessionTimer);
  if(_sessionWarnTimer)clearTimeout(_sessionWarnTimer);
  const remaining=Math.max(0,(SESSION_EXPIRY||0)-Date.now());
  if(remaining>10*60*1000){
    _sessionWarnTimer=setTimeout(function(){
      showToast('⏱ Session expire dans 10 min — votre travail est sauvegardé.','warn');
    },remaining-10*60*1000);
  }
  _sessionTimer=setTimeout(function(){
    showToast('Session expirée. Reconnexion requise.','warn');
    setTimeout(function(){doLogout();},2000);
  },remaining);
}

function _createSession(){
  SESSION_TOKEN=crypto.randomUUID();
  SESSION_EXPIRY=Date.now()+SESSION_DURATION_MS;
  // Enregistrer la connexion
  if(CU){
    const nowIso=new Date().toISOString();
    // Un compte ne conserve qu'une seule session active. Une nouvelle connexion
    // ferme les anciennes sessions restées ouvertes (onglet fermé brutalement,
    // téléphone éteint ou absence d'événement de déconnexion).
    LOGIN_HISTORY.forEach(function(previous){
      if(previous.login===CU.l&&previous.actif&&!previous.hDeconnexion){
        previous.hDeconnexion=nowIso;
        previous.actif=false;
        previous.fermetureAuto='Remplacée par une nouvelle connexion';
      }
    });
    const ua=String(navigator.userAgent||'');
    const support=/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)?'Tablette':/iPhone|Android.*Mobile|Mobile/i.test(ua)?'Smartphone':'Ordinateur';
    const navigateur=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/CriOS|Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Navigateur';
    const entry={
      id:SESSION_TOKEN,
      login:CU.l,
      prenom:CU.prenom,
      nom:CU.nom,
      caserneId:CURRENT_CASERNE_ID||CU.caserneId||(GLOBAL_ROLE?'EMAJ':''),
      caserne:CC()?.nom||(GLOBAL_ROLE?'État-Major':'Global'),
      hConnexion:nowIso,
      hDeconnexion:null,
      actif:true,
      lastSeenAt:nowIso,
      support:support,
      navigateur:navigateur,
      appVersion:APP_VERSION,
      deviceId:agaiDeviceId()
    };
    LOGIN_HISTORY.unshift(entry);
    _loginPresenceLastPush=Date.now();
    pruneLoginHistoryToRecentLimit(true);
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
  }
  _persistSessionState({backgroundAt:0});
  _armSessionTimers();
}

function _clearSession(){
  SESSION_TOKEN=null;SESSION_EXPIRY=null;
  if(_sessionTimer){clearTimeout(_sessionTimer);_sessionTimer=null;}
  if(_sessionWarnTimer){clearTimeout(_sessionWarnTimer);_sessionWarnTimer=null;}
  try{localStorage.removeItem(SESSION_STORAGE_KEY);}catch(e){}
}

function isSessionValid(){return SESSION_TOKEN!==null&&Date.now()<(SESSION_EXPIRY||0);}

// ── P4 : Échappement XSS ──
function escHtml(s){
  return String(s??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function passwordPolicyError(password){
  if(String(password||'').length<12)return 'Le mot de passe doit contenir au moins 12 caractères.';
  if(!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))return 'Ajoutez au moins une minuscule, une majuscule et un chiffre.';
  return '';
}

// ── Migration P1 : hacher les MDP en clair au premier chargement ──
// Appelé après loadData(), ne bloque pas l'interface
async function _migratePasswords(){
  let changed=false;
  // Comptes globaux
  for(const acc of GLOBAL_ACCOUNTS){
    if(acc.p&&!_isHashed(acc.p)){acc.p=await hashPassword(acc.p);changed=true;}
  }
  // Agents de toutes les casernes
  for(const cid of Object.keys(CASERNE_DATA)){
    for(const u of (CASERNE_DATA[cid].users||[])){
      if(u.p&&!_isHashed(u.p)){u.p=await hashPassword(u.p);changed=true;}
    }
  }
  if(changed){saveData();}
}

