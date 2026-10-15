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

function _agaiLoginRepairOutboxCount(){
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
      request=indexedDB.open(RC_OUTBOX_DB_NAME,1);
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

const _agaiLoginRepairStart=document.getElementById('login-repair-start');
if(_agaiLoginRepairStart){
  if(typeof PERSONNEL_ONLINE_GATE!=='undefined'&&!PERSONNEL_ONLINE_GATE)_agaiLoginRepairStart.hidden=true;
  else _agaiLoginRepairStart.disabled=false;
}
