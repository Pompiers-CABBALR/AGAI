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

// ── P2 : Session token + timeout automatique ──
let SESSION_TOKEN=null;
let SESSION_EXPIRY=null;
let _sessionTimer=null;
let _sessionWarnTimer=null;
// SESSION_DURATION_MS est défini dans config.js

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
    const entry={
      id:SESSION_TOKEN,
      login:CU.l,
      prenom:CU.prenom,
      nom:CU.nom,
      caserneId:CURRENT_CASERNE_ID||'',
      caserne:CC()?.nom||'Global',
      hConnexion:nowIso,
      hDeconnexion:null,
      actif:true
    };
    LOGIN_HISTORY.unshift(entry);
    if(LOGIN_HISTORY.length>500)LOGIN_HISTORY=LOGIN_HISTORY.slice(0,500);
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
  }
  if(_sessionTimer)clearTimeout(_sessionTimer);
  if(_sessionWarnTimer)clearTimeout(_sessionWarnTimer);
  // Avertissement 10 min avant expiration
  _sessionWarnTimer=setTimeout(()=>{
    showToast('⏱ Session expire dans 10 min — votre travail est sauvegardé.','warn');
  },SESSION_DURATION_MS-10*60*1000);
  // Déconnexion automatique
  _sessionTimer=setTimeout(()=>{
    showToast('Session expirée. Reconnexion requise.','warn');
    setTimeout(()=>doLogout(),2000);
  },SESSION_DURATION_MS);
}

function _clearSession(){
  SESSION_TOKEN=null;SESSION_EXPIRY=null;
  if(_sessionTimer){clearTimeout(_sessionTimer);_sessionTimer=null;}
  if(_sessionWarnTimer){clearTimeout(_sessionWarnTimer);_sessionWarnTimer=null;}
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

