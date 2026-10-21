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
      _writeLocalCache(data);
      _jbPush(data).then(function(){
        showToast('Données importées et synchronisées ✓','success');
        _jbStartPolling();
      });
      alert('Données importées ! Connectez-vous maintenant.');
    }catch(err){alert('Fichier JSON invalide : '+err.message);}
  };
  reader.readAsText(file);
}

// La copie locale d'un compte global peut avoir perdu son empreinte pendant
// un essai de bascule. Vérifier l'identité via Auth serveur, sans relire ni
// conserver l'empreinte du mot de passe dans le navigateur.
async function _agaiRecoverLegacyGlobalAccount(login,password){
  if(PERSONNEL_ONLINE_GATE||!USE_RECORDS)return null;
  const local=(GLOBAL_ACCOUNTS||[]).find(function(account){
    return account&&account.l===login&&account.role==='superadmin'&&account.caserneId==='CIS05'&&!account.p;
  });
  if(!local)return null;
  let accessToken='',verified=false;
  try{
    const response=await _agaiAuthFetchWithTimeout(AUTH_LINK_ENDPOINT,{
      method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json','x-device-id':agaiDeviceId()},
      body:JSON.stringify({mode:'pilot_login',login:login,password:password})
    },8000);
    const result=await response.json().catch(function(){return{};});
    accessToken=String(result&&result.session&&result.session.access_token||'');
    verified=response.ok&&result.personnelEnforcementEnabled===true&&accessToken
      &&result.login===login&&result.profile&&result.profile.login===login
      &&result.profile.caserneId===local.caserneId&&result.profile.appRole===local.role
      &&result.caserneId===local.caserneId&&result.appRole===local.role;
  }catch(error){verified=false;}
  if(!accessToken)return null;
  try{
    const logout=await _agaiAuthFetchWithTimeout(SB_URL+'/auth/v1/logout?scope=local',{
      method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+accessToken}
    },6000);
    if(!logout.ok)return null;
  }catch(error){return null;}
  return verified?local:null;
}

async function doLogin(){
  const lerr=document.getElementById('lerr');
  const btn=document.querySelector('.lbtn');

  // Une version ancienne confirmée par le serveur ne peut jamais ouvrir une
  // session et envoyer des données incompatibles vers Supabase.
  if(typeof _ensureLoginVersionReady==='function'&&!await _ensureLoginVersionReady())return;
  // Une actualisation peut déjà être en train de rétablir la session. Ne pas
  // lancer une seconde connexion qui changerait l'identité pendant ce pull.
  if(PERSONNEL_ONLINE_GATE&&_agaiSessionRestorePromise){
    await _agaiSessionRestorePromise;
    if(CU&&isSessionValid())return;
  }

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
  if(PERSONNEL_ONLINE_GATE)_agaiLoginTimingBegin();
  if(btn){btn.disabled=true;btn.textContent='Vérification…';}
  lerr.style.display='none';

  try{
    const onlineBootstrap=PERSONNEL_ONLINE_GATE?await _agaiOnlinePrepareLogin(l,p,function(){
      _agaiLoginTimingVerified();
      if(btn)btn.textContent='Chargement…';
    }):null;
    if(PERSONNEL_ONLINE_GATE&&!onlineBootstrap){
      lerr.style.display='block';
      const reason=typeof _agaiLoginFailureReason==='string'?_agaiLoginFailureReason:'';
      lerr.textContent=reason==='data'
          ?'Votre identité est vérifiée, mais les données ne chargent pas. Touchez « Diagnostiquer ma connexion ».'
          :reason==='busy'
            ?'Une synchronisation est déjà en cours. Patientez puis réessayez.'
            :reason==='storage'
              ?'Le stockage local ne peut pas être vérifié. Touchez « Diagnostiquer ma connexion ».'
              :reason==='refused'
                ?'Connexion refusée. Vérifiez vos identifiants ou contactez un administrateur.'
                :'Connexion en ligne indisponible. Vérifiez Internet puis touchez « Diagnostiquer ma connexion ».';
      return;
    }
    // ── 1. Vérifier comptes globaux (P1 : verifyPassword async) ──
    let gaFound=null;
    for(const x of GLOBAL_ACCOUNTS){
      if(x.l===l&&(!PERSONNEL_ONLINE_GATE||x.caserneId===onlineBootstrap.profile.caserneId)
        &&(PERSONNEL_ONLINE_GATE||await verifyPassword(p,x.p))){gaFound=x;break;}
    }
    if(!gaFound)gaFound=await _agaiRecoverLegacyGlobalAccount(l,p);
    if(gaFound){
      const ga=gaFound;
      if(PERSONNEL_ONLINE_GATE&&deriveAccountRole(ga)!==onlineBootstrap.profile.appRole){
        _agaiOnlineDiscardPreparedLogin();
        lerr.style.display='block';lerr.textContent='Le rôle du compte ne correspond pas aux droits serveur. Contactez un administrateur.';
        return;
      }
      const onlineSession=onlineBootstrap&&onlineBootstrap.session;
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
      dismissAppKeyboard();
      document.getElementById('lp').value='';
      document.getElementById('lw').style.display='none';
      const ap=document.getElementById('app');ap.style.display='flex';ap.style.flexDirection='column';
      const cas=CC();
      document.getElementById('t2u').textContent=CU.l+(cas?' — '+cas.nom:'');
      document.getElementById('t2r').textContent=CU.rl;
      GRADES.forEach(g=>{['prof-grade-sel','nu-grade'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.querySelector(`option[value="${g}"]`)&&![...el.options].find(o=>o.textContent===g)){const o=document.createElement('option');o.textContent=g;el.appendChild(o);}});});
      if(onlineSession)_agaiStoreAuthSession(onlineSession);
      _createSession(); // P2
      _agaiOnlineArmChecks();
      if(PERSONNEL_ONLINE_GATE){_rcStartRealtime();_rcStartPolling();}
      // La liaison technique n'attend jamais avant de rendre l'application utilisable.
      if(AUTH_LINK_MODE==='on'&&!PERSONNEL_ONLINE_GATE)_agaiLinkSupabaseAccount(ga,p,SESSION_TOKEN);
      if(ga.role==='chef_corps'){showGlobalView('chef_corps');return;}
      const hopEl=document.getElementById('hop');if(hopEl)hopEl.textContent='Opérateur : '+CU.l;
      doLoginSuccess();
      return;
    }

    // ── 2. Chercher dans toutes les casernes (P1 : verifyPassword async) ──
    let foundUser=null,foundCasId=null;
    for(const c of CASERNES){
      if(PERSONNEL_ONLINE_GATE&&c.id!==onlineBootstrap.profile.caserneId)continue;
      initCaserneData(c.id);
      const users=CASERNE_DATA[c.id].users||[];
      for(const u of users){
        if(u._personnelTransferredOut&&personnelStatusAt(u)==='mutation')continue;
        if(u.l===l&&(!PERSONNEL_ONLINE_GATE||c.id===onlineBootstrap.profile.caserneId)
          &&(PERSONNEL_ONLINE_GATE||await verifyPassword(p,u.p))){foundUser=u;foundCasId=c.id;break;}
      }
      if(foundUser)break;
    }

    if(!foundUser){
      if(PERSONNEL_ONLINE_GATE)_agaiOnlineDiscardPreparedLogin();
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

    if(PERSONNEL_ONLINE_GATE&&deriveAccountRole(foundUser)!==onlineBootstrap.profile.appRole){
      _agaiOnlineDiscardPreparedLogin();
      lerr.style.display='block';lerr.textContent='Le rôle du compte ne correspond pas aux droits serveur. Contactez un administrateur.';
      return;
    }

    if(!PERSONNEL_ONLINE_GATE&&!personnelCanLogin(foundUser)){
      lerr.style.display='block';
      lerr.textContent=personnelStatusAt(foundUser)==='disponibilite'
        ?'Accès suspendu pendant la mise en disponibilité.'
        :'Ce compte n’a plus accès à l’application. Contactez un administrateur.';
      return;
    }
    const onlineSession=onlineBootstrap&&onlineBootstrap.session;

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
    dismissAppKeyboard();
    document.getElementById('lp').value='';
    document.getElementById('lw').style.display='none';
    const ap=document.getElementById('app');ap.style.display='flex';ap.style.flexDirection='column';
    document.getElementById('t2u').textContent=CU.l+(cas?' — '+cas.nom:'');
    document.getElementById('t2r').textContent=CU.rl||'';
    const hopEl2=document.getElementById('hop');if(hopEl2)hopEl2.textContent='Opérateur : '+CU.l;
    GRADES.forEach(g=>{['prof-grade-sel','nu-grade'].forEach(id=>{const el=document.getElementById(id);if(el&&![...el.options].find(o=>o.textContent===g)){const o=document.createElement('option');o.textContent=g;el.appendChild(o);}});});
    if(onlineSession)_agaiStoreAuthSession(onlineSession);
    _createSession(); // P2
    _agaiOnlineArmChecks();
    if(PERSONNEL_ONLINE_GATE){_rcStartRealtime();_rcStartPolling();}
    if(AUTH_LINK_MODE==='on'&&!PERSONNEL_ONLINE_GATE)_agaiLinkSupabaseAccount(foundUser,p,SESSION_TOKEN);
    doLoginSuccess();

  } catch(error) {
    if(PERSONNEL_ONLINE_GATE)_agaiOnlineDiscardPreparedLogin();
    console.warn('[AGAI] Connexion impossible :',error);
    lerr.style.display='block';lerr.textContent='Connexion impossible. Réessayez lorsque le service est disponible.';
  } finally {
    if(PERSONNEL_ONLINE_GATE)_agaiLoginTimingFinish();
    // Restaurer le bouton dans tous les cas (sauf si bloqué)
    if(btn&&!_loginLocked&&(typeof _loginVersionGateState==='undefined'||_loginVersionGateState!=='blocked')){btn.disabled=false;btn.textContent='Se connecter';}
  }
}

