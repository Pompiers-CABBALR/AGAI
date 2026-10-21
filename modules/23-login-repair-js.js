// Diagnostic local de connexion. Il n'envoie rien au serveur et ne lit aucun
// contenu d'intervention : seuls les nombres d'actions en attente sont affichés.
let _agaiLoginRepairBusy=false;

function _agaiLoginRepairReasonLabel(){
  const labels={
    offline:'Internet ou contrôle en ligne indisponible',
    input:'Identifiant ou mot de passe manquant',
    refused:'Connexion refusée par le service',
    service:'Réponse du service incomplète ou indisponible',
    network:'Le service ne répond pas',
    configuration:'Configuration de synchronisation indisponible',
    pending:'Actions locales de la caserne à transmettre',
    busy:'Synchronisation déjà en cours',
    storage:'Vérification du stockage local impossible',
    data:'Identité vérifiée, chargement des données impossible'
  };
  return labels[typeof _agaiLoginFailureReason==='string'?_agaiLoginFailureReason:'']||'Aucun échec de connexion récent sur cette page';
}

function _agaiLoginRepairOutboxCount(databaseName){
  return new Promise(function(resolve,reject){
    if(!window.indexedDB){reject(new Error('Stockage durable indisponible'));return;}
    let request,db=null,absent=false,done=false;
    const timer=setTimeout(function(){finish(new Error('Lecture du stockage trop longue'));},8000);
    function finish(error,count){
      if(done)return;
      done=true;clearTimeout(timer);
      if(db)try{db.close();}catch(_error){}
      if(error)reject(error);else resolve(count);
    }
    try{
      request=indexedDB.open(databaseName||RC_OUTBOX_DB_NAME,1);
      request.onupgradeneeded=function(event){
        // Ne pas créer une base lors d'un contrôle en lecture seule.
        absent=event.oldVersion===0;
        request.transaction.abort();
      };
      request.onerror=function(){
        if(absent)finish(null,0);
        else finish(new Error('Lecture de la file durable impossible'));
      };
      request.onblocked=function(){finish(new Error('File durable utilisée par une autre page'));};
      request.onsuccess=function(){
        db=request.result;
        if(done){db.close();return;}
        if(!db.objectStoreNames.contains(RC_OUTBOX_STORE)){
          finish(new Error('File durable non reconnue'));return;
        }
        try{
          const tx=db.transaction(RC_OUTBOX_STORE,'readonly');
          const countRequest=tx.objectStore(RC_OUTBOX_STORE).count();
          tx.oncomplete=function(){finish(null,Number(countRequest.result)||0);};
          tx.onerror=function(){finish(new Error('Lecture de la file durable impossible'));};
          tx.onabort=function(){finish(new Error('Lecture de la file durable interrompue'));};
        }catch(_error){finish(new Error('Lecture de la file durable impossible'));}
      };
    }catch(_error){finish(new Error('Stockage durable indisponible'));}
  });
}

async function _agaiInspectLoginRepair(){
  // Si une source est illisible, refuser la réparation au lieu de supposer zéro.
  const raw=localStorage.getItem(RC_PENDING_DIRTY_KEY);
  const saved=raw===null?[]:JSON.parse(raw);
  if(!Array.isArray(saved)||saved.some(function(id){return typeof id!=='string'||!id;}))
    throw new Error('Liste des actions locales illisible');
  if(typeof _rcPendingDirty==='undefined'||!(_rcPendingDirty instanceof Set))
    throw new Error('État des actions locales indisponible');
  const pending=new Set(saved.concat(Array.from(_rcPendingDirty)));
  const durable=await _agaiLoginRepairOutboxCount();
  return {pending:pending.size,durable:durable,
    busy:typeof _rcSaving!=='undefined'&&_rcSaving||typeof _rcPulling!=='undefined'&&_rcPulling,
    online:typeof navigator!=='undefined'&&navigator.onLine!==false};
}

function _agaiLoginRepairPanel(message,allowReset){
  const panel=document.getElementById('login-repair-panel');
  if(!panel)return;
  panel.hidden=false;
  panel.replaceChildren();
  const info=document.createElement('p');
  info.textContent=message;
  panel.appendChild(info);
  if(allowReset){
    const button=document.createElement('button');
    button.type='button';
    button.className='login-repair-confirm';
    button.textContent='Réinitialiser ma connexion';
    button.onclick=agaiResetLoginAfterCheck;
    panel.appendChild(button);
  }
  if(!allowReset){
    const link=document.createElement('a');
    link.href='securite-file-locale-lecture-seule.html?version=ce4be86';
    link.textContent='Voir le détail des actions en lecture seule';
    link.className='login-repair-start';
    panel.appendChild(link);
  }
}

async function agaiOpenLoginRepair(){
  if(_agaiLoginRepairBusy)return;
  _agaiLoginRepairBusy=true;
  _agaiLoginRepairPanel('Vérification des actions de ce navigateur…',false);
  try{
    const state=await _agaiInspectLoginRepair();
    const counts='Actions signalées : '+state.pending+' ; file durable : '+state.durable+'.';
    const cause='Dernier essai : '+_agaiLoginRepairReasonLabel()+'.';
    if(state.pending||state.durable){
      _agaiLoginRepairPanel(cause+' '+counts+' Aucune donnée ne sera effacée. Contactez votre administrateur avec ces nombres.',false);
    }else if(state.busy){
      _agaiLoginRepairPanel(cause+' '+counts+' Une synchronisation est en cours : réessayez dans un instant.',false);
    }else if(!state.online){
      _agaiLoginRepairPanel(cause+' '+counts+' Reconnectez Internet avant toute réparation.',false);
    }else{
      _agaiLoginRepairPanel(cause+' '+counts+' Aucune action en attente détectée ici. La réparation effacera uniquement la session et l’état de connexion de ce navigateur, puis rechargera AGAI. Elle ne supprimera aucune intervention.',true);
    }
  }catch(_error){
    _agaiLoginRepairPanel('Stockage local impossible à vérifier. Rien n’a été effacé. Contactez votre administrateur.',false);
  }finally{_agaiLoginRepairBusy=false;}
}

async function agaiResetLoginAfterCheck(){
  if(_agaiLoginRepairBusy)return;
  _agaiLoginRepairBusy=true;
  _agaiLoginRepairPanel('Nouvelle vérification avant la réparation…',false);
  try{
    const state=await _agaiInspectLoginRepair();
    if(state.pending||state.durable||state.busy||!state.online){
      _agaiLoginRepairPanel('La situation a changé ou Internet est indisponible. Rien n’a été effacé. Relancez le diagnostic.',false);
      return;
    }
    // Ne toucher ni à la file durable, ni aux indicateurs d'actions, ni aux
    // données métier en cache. Seul l'état de connexion est remis à zéro.
    _agaiStoreAuthSession(null);
    localStorage.removeItem(AUTH_LINK_SESSION_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(AGAI_SERVER_CIRCUIT_KEY);
    _agaiServerFailureCount=0;
    _agaiServerCircuitOpenUntil=0;
    _agaiServerProbeInFlight=false;
    _agaiLoginFailureReason='';
    _agaiLoginRepairPanel('Connexion réinitialisée sans supprimer les données. AGAI va se recharger ; reconnectez-vous ensuite.',false);
    window.setTimeout(function(){location.reload();},800);
  }catch(_error){
    _agaiLoginRepairPanel('La réparation n’a pas pu être terminée. La file d’actions n’a pas été effacée. Contactez votre administrateur.',false);
  }finally{_agaiLoginRepairBusy=false;}
}

function agaiShowLegacyPending(){
  if(!CU)return;
  document.getElementById('mt').textContent='Saisies précédentes conservées';
  document.getElementById('mi').textContent='Vous pouvez continuer à utiliser AGAI.';
  const body=document.getElementById('mb');body.replaceChildren();
  const info=document.createElement('p');
  info.textContent='Des saisies de l’ancienne connexion sont conservées sur cet appareil. Leur titulaire doit être vérifié avant de les transmettre. Elles ne bloquent ni votre connexion ni vos nouvelles interventions.';
  body.appendChild(info);
  const link=document.createElement('a');
  link.href='securite-file-locale-lecture-seule.html?version=ce4be86';
  link.target='_blank';link.rel='noopener';link.textContent='Consulter les anciennes saisies en lecture seule';
  body.appendChild(link);
  if(typeof isSuperAdmin==='function'&&isSuperAdmin()){
    const button=document.createElement('button');button.className='btn';
    button.textContent='Sauvegarder les anciennes saisies pour récupération';
    button.onclick=agaiExportLegacyPending;body.appendChild(button);
  }
  document.getElementById('mo').style.display='flex';
}
async function agaiExportLegacyPending(){
  if(!CU||typeof isSuperAdmin!=='function'||!isSuperAdmin())return;
  try{
    const entries=await new Promise(function(resolve,reject){
      const request=indexedDB.open('agai-sync-outbox',1);let absent=false,db=null;
      const timer=setTimeout(function(){reject(new Error('Lecture trop longue'));},8000);
      request.onupgradeneeded=function(event){absent=event.oldVersion===0;request.transaction.abort();};
      request.onerror=function(){clearTimeout(timer);if(absent)resolve([]);else reject(new Error('Lecture impossible'));};
      request.onblocked=function(){clearTimeout(timer);reject(new Error('Stockage occupé'));};
      request.onsuccess=function(){
        db=request.result;
        try{
          const tx=db.transaction('records','readonly'),read=tx.objectStore('records').getAll();
          tx.oncomplete=function(){clearTimeout(timer);db.close();resolve(read.result||[]);};
          tx.onerror=tx.onabort=function(){clearTimeout(timer);db.close();reject(new Error('Lecture interrompue'));};
        }catch(error){clearTimeout(timer);db.close();reject(error);}
      };
    });
    // Le fichier contient uniquement les anciennes données métier et leurs
    // marqueurs, jamais les mots de passe saisis ni les jetons de session.
    const backup={format:'agai-legacy-pending-v1',createdAt:new Date().toISOString(),
      entries:entries,pending:localStorage.getItem('agai_rc_pending_dirty'),
      cache:localStorage.getItem('agai_jb_cache')};
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='AGAI-saisies-precedentes.json';
    link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
    showToast('Sauvegarde téléchargée. Les saisies restent conservées sur cet appareil.','success');
  }catch(error){showToast('Sauvegarde indisponible. Les anciennes saisies restent conservées.','warn');}
}
const _agaiLoginRepairStart=document.getElementById('login-repair-start');
if(_agaiLoginRepairStart){
  if(typeof PERSONNEL_ONLINE_GATE!=='undefined'&&!PERSONNEL_ONLINE_GATE)_agaiLoginRepairStart.hidden=true;
  else _agaiLoginRepairStart.disabled=false;
}

