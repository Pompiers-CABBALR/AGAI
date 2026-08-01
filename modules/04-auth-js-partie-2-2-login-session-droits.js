// === MODULE: auth.js (partie 2/2 — login, session, droits) ===
// ────────────────── LOGIN ──────────────────
// Compteur tentatives de connexion
let _loginAttempts=0,_loginLocked=false,_loginLockTimer=null;
// Délais de blocage exponentiels (en ms) : 0 × 4, puis 30s, 1min, 2min, 5min
const _LOCKOUT_DELAYS=[0,0,0,0,0,30000,60000,120000,300000];
function _lockoutDuration(n){return _LOCKOUT_DELAYS[Math.min(n,_LOCKOUT_DELAYS.length-1)];}
function loginImportJSON(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=JSON.parse(e.target.result);
      _applyDataObject(data);_postLoadInit();
      localStorage.setItem(JB_CACHE_KEY,JSON.stringify(data));
      _jbPush(data).then(function(){
        showToast('Données importées et synchronisées ✓','success');
        _jbStartPolling();
      });
      alert('Données importées ! Connectez-vous maintenant.');
    }catch(err){alert('Fichier JSON invalide : '+err.message);}
  };
  reader.readAsText(file);
}

async function doLogin(){
  const lerr=document.getElementById('lerr');
  const btn=document.querySelector('.lbtn');

  // ── P5 : Protection brute-force avec délai exponentiel ──
  if(_loginLocked){
    lerr.style.display='block';
    const secs=Math.round(_lockoutDuration(_loginAttempts)/1000);
    lerr.textContent='Trop de tentatives. Réessayez dans '+secs+' secondes.';
    return;
  }

  const l=document.getElementById('lu').value.trim().toLowerCase();
  const p=document.getElementById('lp').value;
  if(!l||!p){lerr.style.display='block';lerr.textContent='Identifiant et mot de passe requis.';return;}

  // Désactiver le bouton pendant la vérification async
  if(btn){btn.disabled=true;btn.textContent='Vérification…';}
  lerr.style.display='none';

  try{
    // ── 1. Vérifier comptes globaux (P1 : verifyPassword async) ──
    let gaFound=null;
    for(const x of GLOBAL_ACCOUNTS){
      if(x.l===l&&await verifyPassword(p,x.p)){gaFound=x;break;}
    }
    if(gaFound){
      const ga=gaFound;
      GLOBAL_ROLE=ga.role;
      _loginAttempts=0;_loginLocked=false;
      if(_loginLockTimer){clearTimeout(_loginLockTimer);_loginLockTimer=null;}
      if(ga.role==='superadmin'&&ga.caserneId){
        CURRENT_CASERNE_ID=ga.caserneId;
        initCaserneData(ga.caserneId);
        syncCaserneContext();
        const saC=CASERNES.find(c=>c.id===ga.caserneId);
        if(saC)setCaserneTheme(saC.couleur);
        CU={l:ga.l,prenom:ga.prenom,nom:ga.nom,grade:ga.grade,
            rights:["Prise d'appel","Interventions","Historique complet","Chef d'agrès","Tireur PILP","Administration"],
            rl:'Super Administrateur',fonction:'Chef de centre',caserneId:ga.caserneId,appRole:'superadmin'};
      } else {
        CURRENT_CASERNE_ID=null;
        syncCaserneContext();
        CU={l:ga.l,prenom:ga.prenom,nom:ga.nom,grade:ga.grade,rights:[],rl:'Chef de Corps',caserneId:'EMAJ',appRole:'chef_corps'};
      }
      document.getElementById('lw').style.display='none';
      const ap=document.getElementById('app');ap.style.display='flex';ap.style.flexDirection='column';
      const cas=CC();
      document.getElementById('t2u').textContent=CU.l+(cas?' — '+cas.nom:'');
      document.getElementById('t2r').textContent=CU.rl;
      GRADES.forEach(g=>{['prof-grade-sel','nu-grade'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.querySelector(`option[value="${g}"]`)&&![...el.options].find(o=>o.textContent===g)){const o=document.createElement('option');o.textContent=g;el.appendChild(o);}});});
      _createSession(); // P2
      if(ga.role==='chef_corps'){showGlobalView('chef_corps');return;}
      const hopEl=document.getElementById('hop');if(hopEl)hopEl.textContent='Opérateur : '+CU.l;
      doLoginSuccess();
      return;
    }

    // ── 2. Chercher dans toutes les casernes (P1 : verifyPassword async) ──
    let foundUser=null,foundCasId=null;
    for(const c of CASERNES){
      initCaserneData(c.id);
      const users=CASERNE_DATA[c.id].users||[];
      for(const u of users){
        if(u.l===l&&await verifyPassword(p,u.p)){foundUser=u;foundCasId=c.id;break;}
      }
      if(foundUser)break;
    }

    if(!foundUser){
      _loginAttempts++;
      const delay=_lockoutDuration(_loginAttempts);
      lerr.style.display='block';
      if(delay>0){
        _loginLocked=true;
        const secs=Math.round(delay/1000);
        lerr.textContent='Trop de tentatives. Compte bloqué '+secs+' secondes.';
        if(btn){btn.disabled=true;}
        _loginLockTimer=setTimeout(()=>{
          _loginLocked=false;
          lerr.style.display='none';
          if(btn){btn.disabled=false;btn.textContent='Se connecter';}
        },delay);
      } else {
        lerr.textContent='Identifiant ou mot de passe incorrect.';
      }
      return;
    }

    // ── Connexion réussie ──
    _loginAttempts=0;_loginLocked=false;
    if(_loginLockTimer){clearTimeout(_loginLockTimer);_loginLockTimer=null;}
    lerr.style.display='none';
    GLOBAL_ROLE=null;CURRENT_CASERNE_ID=foundCasId;syncCaserneContext();
    CU=foundUser;
    CU.caserneId=foundCasId;
    CU.appRole=deriveAccountRole(CU);
    const cas=CC();
    if(cas)setCaserneTheme(cas.couleur);
    document.getElementById('lw').style.display='none';
    const ap=document.getElementById('app');ap.style.display='flex';ap.style.flexDirection='column';
    document.getElementById('t2u').textContent=CU.l+(cas?' — '+cas.nom:'');
    document.getElementById('t2r').textContent=CU.rl||'';
    const hopEl2=document.getElementById('hop');if(hopEl2)hopEl2.textContent='Opérateur : '+CU.l;
    GRADES.forEach(g=>{['prof-grade-sel','nu-grade'].forEach(id=>{const el=document.getElementById(id);if(el&&![...el.options].find(o=>o.textContent===g)){const o=document.createElement('option');o.textContent=g;el.appendChild(o);}});});
    _createSession(); // P2
    doLoginSuccess();

  } finally {
    // Restaurer le bouton dans tous les cas (sauf si bloqué)
    if(btn&&!_loginLocked){btn.disabled=false;btn.textContent='Se connecter';}
  }
}
