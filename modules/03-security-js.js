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
  // Le pilote ne conserve aucun jeton : la liaison ne sert pas encore aux données.
  if(AUTH_LINK_MODE==='canary')return null;
  if(_agaiAuthSession)return _agaiAuthSession;
  if(!CU||!_agaiAuthLinkEligible(CU))return null;
  try{
    const saved=JSON.parse(localStorage.getItem(AUTH_LINK_SESSION_KEY)||'null');
    _agaiAuthSession=saved&&saved._agai_link_login===CU.l?saved:null;
  }catch(error){_agaiAuthSession=null;}
  if(_agaiAuthSession&&!_agaiAuthRefreshTimer)setTimeout(_agaiScheduleAuthRefresh,0);
  return _agaiAuthSession;
}
function _agaiAuthAccessToken(){
  const session=_agaiReadAuthSession();
  if(!CU||!_agaiAuthLinkEligible(CU)||!session||session._agai_link_login!==CU.l||!session.access_token)return'';
  const expires=Number(session.expires_at)||0;
  if(expires&&expires*1000<Date.now()+30000)return'';
  return String(session.access_token);
}
function _agaiStoreAuthSession(session){
  _agaiAuthSession=session&&session.access_token?session:null;
  if(!_agaiAuthSession)_agaiAuthRefreshFailureCount=0;
  try{
    if(_agaiAuthSession)localStorage.setItem(AUTH_LINK_SESSION_KEY,JSON.stringify(_agaiAuthSession));
    else localStorage.removeItem(AUTH_LINK_SESSION_KEY);
  }catch(error){}
  _agaiScheduleAuthRefresh();
}
function _agaiScheduleAuthRefresh(){
  if(_agaiAuthRefreshTimer){clearTimeout(_agaiAuthRefreshTimer);_agaiAuthRefreshTimer=null;}
  const session=_agaiAuthSession;if(!CU||!_agaiAuthLinkEligible(CU)||!session||session._agai_link_login!==CU.l||!session.refresh_token||!session.expires_at)return;
  const delay=Math.max(5000,Number(session.expires_at)*1000-Date.now()-90000);
  _agaiAuthRefreshTimer=setTimeout(_agaiRefreshAuthSession,delay);
}
async function _agaiAuthFetchWithTimeout(url,options,timeoutMs){
  // L'authentification auxiliaire ne touche jamais au coupe-circuit de la
  // synchronisation opérationnelle, même si la fonction Edge est indisponible.
  const controller=new AbortController();
  const timer=setTimeout(function(){controller.abort();},Math.max(1000,Number(timeoutMs)||6000));
  try{return await fetch(url,Object.assign({},options||{},{signal:controller.signal}));}
  finally{clearTimeout(timer);}
}
async function _agaiRefreshAuthSession(){
  const session=_agaiReadAuthSession();if(!CU||!_agaiAuthLinkEligible(CU)||!session||session._agai_link_login!==CU.l||!session.refresh_token)return false;
  try{
    const response=await _agaiAuthFetchWithTimeout(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})},6000);
    const refreshed=await response.json();if(!response.ok||!refreshed.access_token)throw new Error('HTTP '+response.status);
    if(_agaiAuthSession!==session)return false;
    _agaiAuthRefreshFailureCount=0;_agaiStoreAuthSession(Object.assign(refreshed,{_agai_link_login:session._agai_link_login}));return true;
  }catch(error){
    if(_agaiAuthSession!==session)return false;
    _agaiAuthRefreshFailureCount=Math.min(6,_agaiAuthRefreshFailureCount+1);
    const wait=Math.min(15*60*1000,30000*Math.pow(2,_agaiAuthRefreshFailureCount-1));
    console.warn('[AGAI][AUTH] Renouvellement de session différé :',error);
    _agaiAuthRefreshTimer=setTimeout(_agaiRefreshAuthSession,wait);
    return false;
  }
}
function _agaiAuthLinkLoginEligible(login){
  if(!AUTH_LINK_ENABLED||!login)return false;
  return AUTH_LINK_MODE==='on'||AUTH_LINK_CANARY_LOGINS.has(String(login).trim().toLowerCase());
}
function _agaiAuthLinkEligible(account){
  return !!(account&&_agaiAuthLinkLoginEligible(account.l));
}
function _agaiAuthOperationalReady(){
  const health=window._agaiSyncHealth||{};
  return health.state==='ok'&&Number(health.lastPullOkAt)>Date.now()-15*60*1000
    &&typeof _rcPendingDirty!=='undefined'&&_rcPendingDirty.size===0
    &&typeof _agaiServerCircuitOpenUntil==='number'&&_agaiServerCircuitOpenUntil<=Date.now()
    &&typeof _rcSaving!=='undefined'&&!_rcSaving&&typeof _rcPulling!=='undefined'&&!_rcPulling
    &&typeof navigator!=='undefined'&&navigator.onLine!==false;
}
function _agaiAuthPilotReady(){
  return AUTH_LINK_MODE==='canary'&&!!CU&&_agaiAuthLinkEligible(CU)&&!_agaiAuthPilotInFlight
    &&_agaiAuthBridgeState==='active'&&_agaiAuthOperationalReady();
}
async function _agaiLinkSupabaseAccount(account,password,loginSessionToken){
  if(AUTH_LINK_MODE!=='on'||!_agaiAuthLinkEligible(account)||Date.now()<_agaiAuthLinkRetryAfter)return false;
  if(_agaiAuthPilotInFlight)return false;
  _agaiAuthPilotInFlight=true;
  try{
    const response=await _agaiAuthFetchWithTimeout(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','x-device-id':agaiDeviceId()},body:JSON.stringify({mode:'login',login:account.l,password:password})},6000);
    const result=await response.json().catch(function(){return{};});
    if(!response.ok||!result.session||!result.authUserId)throw new Error(result.error||('HTTP '+response.status));
    if(String(result.login||'').trim().toLowerCase()!==String(account.l).trim().toLowerCase()
       ||(account.caserneId&&result.caserneId&&result.caserneId!==account.caserneId))throw new Error('Identité liée incohérente');
    // Une déconnexion pendant l'appel réseau ne doit pas recréer une session Auth.
    if(!loginSessionToken||SESSION_TOKEN!==loginSessionToken||!CU||CU.l!==account.l)return false;
    _agaiStoreAuthSession(Object.assign({},result.session,{_agai_link_login:account.l}));
    _agaiAuthLinkRetryAfter=0;
    _agaiAuthBridgeState='active';
    _agaiAuthBridgeCheckedAt=0;
    return true;
  }catch(error){
    _agaiAuthBridgeState='error';
    _agaiAuthLinkRetryAfter=Date.now()+5*60*1000;
    console.warn('[AGAI][AUTH] Liaison Supabase différée :',error);
    return false;
  }finally{_agaiAuthPilotInFlight=false;}
}
function _agaiTechnicalAuthEmail(account){
  const login=String(account&&account.l||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9._-]/g,'-').slice(0,60);
  const station=String(account&&account.caserneId||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,30);
  return login&&station?login+'.'+station+'@auth.agai-app.fr':'';
}
async function _agaiVerifyExistingAuthAccount(account,password,loginSessionToken){
  if(!_agaiAuthPilotReady()||Date.now()<_agaiAuthLinkRetryAfter||!loginSessionToken||!account||!CU||account.l!==CU.l||account.caserneId!==CU.caserneId)return false;
  const email=_agaiTechnicalAuthEmail(account);if(!email)return false;
  _agaiAuthPilotInFlight=true;
  let accessToken='',verified=false,cleanupOk=true;
  try{
    const response=await _agaiAuthFetchWithTimeout(SB_URL+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email:email,password:password})
    },6000);
    const result=await response.json().catch(function(){return{};});
    if(!response.ok||!result.access_token||!result.user)throw new Error('Connexion Auth refusée (HTTP '+response.status+')');
    accessToken=result.access_token;
    const metadata=result.user.app_metadata||{};
    if(String(metadata.agai_login||'').trim().toLowerCase()!==String(account.l||'').trim().toLowerCase()
      ||String(metadata.caserne_id||'')!==String(account.caserneId||''))throw new Error('Identité Auth incohérente');
    if(CU&&CU.l===account.l&&SESSION_TOKEN===loginSessionToken)verified=true;
  }catch(error){
    _agaiAuthLinkRetryAfter=Date.now()+5*60*1000;
    console.warn('[AGAI][AUTH] Vérification du compte existant différée :',error);
  }finally{
    if(accessToken){
      try{
        const logout=await _agaiAuthFetchWithTimeout(SB_URL+'/auth/v1/logout?scope=local',{
          method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+accessToken}
        },6000);
        if(!logout.ok)throw new Error('HTTP '+logout.status);
      }catch(error){cleanupOk=false;console.warn('[AGAI][AUTH] Session de test non révoquée :',error);}
    }
    _agaiAuthPilotInFlight=false;
  }
  if(!cleanupOk)_agaiAuthLinkRetryAfter=Date.now()+5*60*1000;
  return verified&&cleanupOk;
}
async function _agaiLinkedPasswordChange(mode,login,newPassword){
  if(AUTH_LINK_MODE==='canary')return true; // Aucune opération courante ne dépend du pilote.
  if(!_agaiAuthLinkLoginEligible(login))return true;
  const token=_agaiAuthAccessToken();
  if(!token)return false;
  try{
    const response=await _agaiAuthFetchWithTimeout(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','x-device-id':agaiDeviceId()},body:JSON.stringify({mode:mode,login:login,newPassword:newPassword})},6000);
    if(!response.ok){const detail=await response.json().catch(function(){return{};});throw new Error(detail.error||('HTTP '+response.status));}
    return true;
  }catch(error){console.warn('[AGAI][AUTH] Mot de passe non synchronisé :',error);return false;}
}
async function _agaiProvisionLinkedAccount(account,password){
  if(AUTH_LINK_MODE==='canary')return true;
  if(!_agaiAuthLinkEligible(account))return true;
  const token=_agaiAuthAccessToken();if(!token)return false;
  try{
    const response=await _agaiAuthFetchWithTimeout(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','x-device-id':agaiDeviceId()},body:JSON.stringify({mode:'admin_provision',login:account.l,newPassword:password,caserneId:account.caserneId,appRole:account.appRole||deriveAccountRole(account),firstName:account.prenom||'',lastName:account.nom||''})},6000);
    if(!response.ok){const detail=await response.json().catch(function(){return{};});throw new Error(detail.error||('HTTP '+response.status));}
    return true;
  }catch(error){console.warn('[AGAI][AUTH] Création du compte lié impossible :',error);return false;}
}
async function _agaiSyncLinkedAccount(account){
  if(AUTH_LINK_MODE==='canary')return true;
  if(!_agaiAuthLinkEligible(account))return true;
  const token=_agaiAuthAccessToken();if(!token)return false;
  try{
    const response=await _agaiAuthFetchWithTimeout(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','x-device-id':agaiDeviceId()},body:JSON.stringify({mode:'admin_sync',login:account.l,caserneId:account.caserneId||CURRENT_CASERNE_ID,appRole:account.appRole||deriveAccountRole(account),firstName:account.prenom||'',lastName:account.nom||''})},6000);
    if(!response.ok)throw new Error('HTTP '+response.status);
    return true;
  }catch(error){console.warn('[AGAI][AUTH] Métadonnées du compte à resynchroniser :',error);return false;}
}
async function _agaiDeactivateLinkedAccount(login){
  if(AUTH_LINK_MODE==='canary')return true;
  if(!_agaiAuthLinkLoginEligible(login))return true;
  const token=_agaiAuthAccessToken();if(!token)return false;
  try{
    const response=await _agaiAuthFetchWithTimeout(AUTH_LINK_ENDPOINT,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({mode:'admin_deactivate',login:login})},6000);
    return response.ok;
  }catch(error){return false;}
}
async function _agaiCheckAccountLinkServer(force){
  if(!AUTH_LINK_ENABLED){_agaiAuthBridgeState='disabled';return false;}
  const target=document.getElementById('sa-auth-link-state');
  const pilotButton=document.getElementById('agai-auth-pilot-launch');
  if(AUTH_LINK_MODE==='canary'&&!_agaiAuthOperationalReady()){
    _agaiAuthBridgeState='deferred';_agaiAuthBridgeHealth=null;
    if(target){target.textContent='En attente de Sync OK';target.style.color='#B45309';}
    if(pilotButton)pilotButton.disabled=true;
    return false;
  }
  if(_agaiAuthBridgeCheckedAt&&Date.now()-_agaiAuthBridgeCheckedAt<60000){
    if(target){
      const health=_agaiAuthBridgeHealth||{},linked=Number(health.linkedAccounts)||0,total=Number(health.eligibleAccounts)||0;
      target.textContent=_agaiAuthBridgeState==='active'?(linked+' / '+total+' compte(s) rattaché(s)'):_agaiAuthBridgeState==='missing'?'Script v239 à installer':'Vérification impossible';
      target.style.color=_agaiAuthBridgeState==='active'&&total&&linked===total?'#047857':_agaiAuthBridgeState==='error'?'#B91C1C':'#B45309';
    }
    if(pilotButton)pilotButton.disabled=!_agaiAuthPilotReady();
    return _agaiAuthBridgeState==='active';
  }
  _agaiAuthBridgeCheckedAt=Date.now();
  try{
    const response=await _agaiAuthFetchWithTimeout(SB_REST+'/rpc/agai_account_link_health',{method:'POST',headers:_sbHeaders,body:'{}'},6000);
    _agaiAuthBridgeState=response.ok?'active':response.status===404?'missing':'error';
    _agaiAuthBridgeHealth=response.ok?await response.json():null;
  }catch(error){_agaiAuthBridgeState='error';_agaiAuthBridgeHealth=null;}
  if(target){
    const health=_agaiAuthBridgeHealth||{},linked=Number(health.linkedAccounts)||0,total=Number(health.eligibleAccounts)||0;
    target.textContent=_agaiAuthBridgeState==='active'?(linked+' / '+total+' compte(s) rattaché(s)'):_agaiAuthBridgeState==='missing'?'Script v239 à installer':_agaiAuthBridgeState==='disabled'?'Suspendue pour stabilité':'Vérification impossible';
    target.style.color=_agaiAuthBridgeState==='active'&&total&&linked===total?'#047857':_agaiAuthBridgeState==='error'?'#B91C1C':'#B45309';
  }
  if(pilotButton)pilotButton.disabled=!_agaiAuthPilotReady();
  return _agaiAuthBridgeState==='active';
}
function startManualAccountLinkPilot(){
  if(!_agaiAuthPilotReady()){
    showToast('Pilote indisponible : attendre Sync OK, une réception récente et une file vide.','warn');
    return;
  }
  const source=(GLOBAL_ACCOUNTS||[]).find(function(account){return account&&account.l===CU.l;})
    ||(CASERNE_DATA[CURRENT_CASERNE_ID]&&CASERNE_DATA[CURRENT_CASERNE_ID].users||[]).find(function(account){return account&&account.l===CU.l;});
  if(!source||!source.p){showToast('Compte pilote introuvable sur cet appareil.','error');return;}
  const pilotAccount=CU,pilotSessionToken=SESSION_TOKEN;
  const title=document.getElementById('mt'),info=document.getElementById('mi'),body=document.getElementById('mb'),modal=document.getElementById('mo');
  if(!title||!info||!body||!modal)return;
  title.textContent='Identité technique AGAI — cet appareil uniquement';
  info.textContent='Le compte technique AGAI dans Supabase Auth est distinct de votre accès au tableau de bord Supabase. Cette vérification ne crée ni ne modifie de compte et ne change pas la synchronisation.';
  body.innerHTML='<div style="padding:8px 0;"><label for="agai-auth-pilot-password" style="display:block;font-size:12px;margin-bottom:6px;">Mot de passe AGAI (jamais celui du tableau de bord Supabase)</label>'
    +'<input class="fi" type="password" id="agai-auth-pilot-password" autocomplete="current-password" style="width:100%;margin-bottom:12px;">'
    +'<div class="brow"><button type="button" class="btn pr sm" id="agai-auth-pilot-confirm">Vérifier mon compte existant</button>'
    +'<button type="button" class="btn sm" onclick="cM()">Annuler</button></div></div>';
  modal.style.display='flex';
  const field=document.getElementById('agai-auth-pilot-password');
  const button=document.getElementById('agai-auth-pilot-confirm');
  button.onclick=async function(){
    const password=field.value;field.value='';button.disabled=true;
    if(!password||!await verifyPassword(password,source.p)){
      cM();showToast('Mot de passe AGAI incorrect : aucun appel Supabase envoyé.','warn');return;
    }
    cM();
    if(!CU||SESSION_TOKEN!==pilotSessionToken||CU.l!==pilotAccount.l)return;
    const linked=await _agaiVerifyExistingAuthAccount(pilotAccount,password,pilotSessionToken);
    if(!CU||SESSION_TOKEN!==pilotSessionToken)return;
    showToast(linked?'Compte Supabase existant vérifié. La synchronisation reste inchangée.':'Vérification différée. L’application reste utilisable.',linked?'success':'warn');
    refreshOperationalHealthPanel();
  };
  field.focus();
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

