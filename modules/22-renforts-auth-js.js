// Nouveau circuit Auth : demandes et transitions vérifiées côté serveur.
let _secureRenfortRows=[];
let _secureRenfortFetchedAt=0;
let _secureRenfortFetchPromise=null;
let _secureRenfortStation='';
let _secureLegacyRenderInterventions=null;

function secureRenfortById(id){
  return _secureRenfortRows.find(function(row){return row.id===id;})||null;
}
function secureRenfortPending(){
  return _secureRenfortRows.filter(function(row){
    return row.destination_caserne===CURRENT_CASERNE_ID&&row.status==='en-attente';
  });
}
async function secureRenfortRequest(path,method,payload){
  const token=_agaiAuthAccessToken();
  if(!SECURE_RENFORTS_ENABLED||!token||!navigator.onLine){
    throw new Error('Connexion en ligne requise pour les renforts.');
  }
  const response=await _agaiAuthFetchWithTimeout(SB_REST+path,{
    method:method,
    headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body:payload===undefined?undefined:JSON.stringify(payload)
  },12000);
  if(!response.ok){
    let serverCode='';
    try{serverCode=(await response.json()).message||'';}catch(_error){}
    const knownErrors={
      AGAI_RENFORT_RESOURCES_BUSY:'Un agent ou un véhicule est déjà engagé. Actualisez les interventions avant de repartir.',
      AGAI_RENFORT_VEHICLE_UNKNOWN:'Ce véhicule ne figure plus dans les engins de la caserne. Actualisez la page.',
      AGAI_RENFORT_PERSONNEL_UNAVAILABLE:'Un membre de l’équipage n’est plus disponible pour ce départ.',
      AGAI_RENFORT_SOURCE_CLOSED:'L’intervention demandeuse n’est plus ouverte.',
      AGAI_RENFORT_ALREADY_PROCESSED:'Cette demande a déjà changé de statut. Actualisez les renforts.'
    };
    if(knownErrors[serverCode])throw new Error(knownErrors[serverCode]);
    if(response.status===401||response.status===403)throw new Error('Accès au renfort refusé. Reconnectez-vous.');
    if(response.status===409)throw new Error('Cette demande a changé. Actualisez les renforts.');
    throw new Error('Renfort non enregistré (HTTP '+response.status+').');
  }
  return response.json();
}
async function secureRenfortRpc(name,payload){
  return secureRenfortRequest('/rpc/'+name,'POST',payload);
}
async function securePullRenfortRecord(){
  try{return typeof _rcPull==='function'&&await _rcPull(true)===true;}
  catch(error){console.warn('[AGAI][renforts] Fiche locale non actualisée',error);return false;}
}
async function secureRefreshRenforts(force){
  if(!SECURE_RENFORTS_ENABLED||!CURRENT_CASERNE_ID||!CU)return false;
  if(_secureRenfortFetchPromise)return _secureRenfortFetchPromise;
  if(!force&&_secureRenfortStation===CURRENT_CASERNE_ID
      &&Date.now()-_secureRenfortFetchedAt<15000)return true;
  const station=CURRENT_CASERNE_ID;
  const login=CU.l;
  _secureRenfortFetchPromise=(async function(){try{
    const rows=await secureRenfortRequest(
      '/agai_renfort_requests?select=id,request_key,source_record_id,source_caserne,destination_caserne,kind,note,source_snapshot,status,requested_by,requested_at,responded_by,responded_at,local_record_id,crew,vehicle,started_at,finished_at&order=requested_at.desc&limit=300',
      'GET');
    if(!Array.isArray(rows))throw new Error('Réponse des renforts invalide.');
    if(!CU||CU.l!==login||CURRENT_CASERNE_ID!==station)return false;
    rows.forEach(function(row){
      const sourceId=row.source_snapshot&&row.source_snapshot.ivId;
      if(row.source_caserne!==station||!sourceId||!row.request_key)return;
      const storageKey='agai_renfort_action_send_'+sourceId;
      try{
        if(localStorage.getItem(storageKey)===row.request_key)
          localStorage.removeItem(storageKey);
      }catch(_error){}
    });
    _secureRenfortRows=rows;
    _secureRenfortStation=station;
    _secureRenfortFetchedAt=Date.now();
    if(typeof _secureLegacyRenderInterventions==='function')_secureLegacyRenderInterventions();
    secureRenderRenfortInbox();
    updateRenfortBadge();
    return true;
  }catch(error){
    console.warn('[AGAI][renforts] Synchronisation impossible',error);
    return false;
  }finally{_secureRenfortFetchPromise=null;}})();
  return _secureRenfortFetchPromise;
}
function secureRenfortActionKey(id,action){
  const storageKey='agai_renfort_action_'+action+'_'+id;
  try{
    let key=localStorage.getItem(storageKey);
    if(!key){key=crypto.randomUUID();localStorage.setItem(storageKey,key);}
    return key;
  }catch(_error){return crypto.randomUUID();}
}
function secureClearRenfortActionKey(id,action){
  try{localStorage.removeItem('agai_renfort_action_'+action+'_'+id);}catch(_error){}
}
function secureRenfortSummary(row){
  const source=row.source_snapshot||{};
  return escHtml(source.ivNature||'Intervention')+' — '+escHtml(source.ivCommune||'')
    +(source.ivAdresse?' · '+escHtml(source.ivAdresse):'');
}
function secureRenderRenfortInbox(){
  if(!SECURE_RENFORTS_ENABLED)return;
  const zone=document.getElementById('renfort-zone');if(!zone)return;
  const rows=_secureRenfortRows.filter(function(row){
    return row.destination_caserne===CURRENT_CASERNE_ID
      &&['en-attente','accepte','en-cours'].includes(row.status);
  });
  if(!rows.length){zone.innerHTML='';return;}
  zone.innerHTML='<div style="background:#F5F3FF;border:2px solid #DDD6FE;border-radius:12px;padding:12px;margin-bottom:12px;">'
    +'<div style="font-size:13px;font-weight:700;color:#7C3AED;margin-bottom:8px;">📢 Renforts reçus ('+rows.length+')</div>'
    +rows.map(function(row){
      const station=CASERNES.find(function(c){return c.id===row.source_caserne;});
      const id=escHtml(row.id);
      const actions=row.status==='en-attente'
        ?'<button class="btn sm gn" onclick="secureAnswerRenfort(\''+id+'\',\'accepte\')">Accepter</button> '
          +'<button class="btn sm" onclick="secureAnswerRenfort(\''+id+'\',\'refuse\')">Refuser</button>'
        :row.status==='accepte'
          ?'<button class="btn sm pr" onclick="secureShowRenfortCrew(\''+id+'\')">Composer et partir</button>'
          :'<span style="font-size:11px;color:#5B21B6;">Équipage en route</span>';
      return '<div style="background:#fff;border:1px solid #DDD6FE;border-radius:8px;padding:10px;margin-bottom:6px;">'
        +'<div style="font-size:12px;font-weight:700;">'+(row.kind==='complet'?'🚒 Renfort complet':'👥 Renfort personnel')
        +' · '+escHtml(station?station.nom:row.source_caserne)+'</div>'
        +'<div style="font-size:12px;margin:5px 0;">'+secureRenfortSummary(row)+'</div>'
        +(row.note?'<div style="font-size:11px;color:var(--t2);">'+escHtml(row.note)+'</div>':'')
        +'<div style="display:flex;gap:6px;margin-top:7px;">'+actions+'</div></div>';
    }).join('')+'</div>';
}
function secureRenfortSourceRows(iv){
  return _secureRenfortRows.filter(function(row){
    return row.source_caserne===CURRENT_CASERNE_ID
      &&row.source_snapshot&&row.source_snapshot.ivId===iv.id;
  });
}
function secureRenfortSourceHtml(iv){
  const rows=secureRenfortSourceRows(iv);
  if(!rows.length)return '';
  return '<div style="margin-top:10px;padding:10px;border:1px solid #DDD6FE;border-radius:9px;background:#F5F3FF;">'
    +'<div style="font-weight:700;font-size:12px;margin-bottom:5px;">Renforts demandés</div>'
    +rows.map(function(row){
      const station=CASERNES.find(function(c){return c.id===row.destination_caserne;});
      return '<div style="font-size:12px;margin:5px 0;">'
        +escHtml(station?station.nom:row.destination_caserne)+' · '+escHtml(row.status)
        +(row.status==='en-attente'
          ?' <button class="btn sm" onclick="secureCancelRenfort(\''+escHtml(row.id)+'\')">Annuler</button>':'')
        +'</div>';
    }).join('')+'</div>';
}
function secureAppendRenfortSource(ivId){
  const iv=interventionById(ivId);if(!iv)return;
  const body=document.getElementById('mb');if(!body)return;
  const html=secureRenfortSourceHtml(iv);
  if(html)body.insertAdjacentHTML('beforeend',html);
}
function secureShowRenfortModal(ivId,forcePersonnel){
  const iv=interventionById(ivId);if(!iv)return;
  if(!requireCurrentUserOperationalManager(iv,'La demande de renfort'))return;
  if(!['selectionne','en-cours'].includes(iv.s)){
    showToast('Cette intervention ne peut plus demander de renfort.','warn');return;
  }
  const stations=CASERNES.filter(function(c){return c.id!==CURRENT_CASERNE_ID;});
  if(!stations.length){showToast('Aucune caserne destinataire disponible.','warn');return;}
  document.getElementById('mt').textContent='Demande de renfort';
  document.getElementById('mi').textContent=iv.n+' — '+iv.com;
  document.getElementById('mb').innerHTML=
    '<div class="fg"><div class="fgl">Type</div><select class="fi" id="secure-renfort-kind">'
    +(forcePersonnel?'<option value="personnel">Renfort personnel</option>'
      :'<option value="complet">Camion et équipage</option><option value="personnel">Personnel seulement</option>')
    +'</select></div>'
    +'<div class="fgl">Caserne(s) destinataire(s)</div>'
    +stations.map(function(station){return '<label style="display:block;margin:7px 0;font-size:12px;">'
      +'<input type="checkbox" class="secure-renfort-dest" value="'+escHtml(station.id)+'"> '
      +escHtml(station.nom)+'</label>';}).join('')
    +'<div class="fg"><div class="fgl">Précision facultative</div>'
    +'<textarea class="fi" id="secure-renfort-note" maxlength="1000" rows="2"></textarea></div>'
    +'<div class="brow"><button class="btn pr" id="secure-renfort-send" onclick="secureSendRenfort(\''+escHtml(ivId)+'\')">Envoyer</button>'
    +'<button class="btn" onclick="cM()">Annuler</button></div>'
    +secureRenfortSourceHtml(iv);
  document.getElementById('mo').style.display='flex';
  void secureRefreshRenforts(false);
}
async function secureSendRenfort(ivId){
  const iv=interventionById(ivId);if(!iv)return;
  if(!requireCurrentUserOperationalManager(iv,'La demande de renfort'))return;
  const destinations=Array.from(document.querySelectorAll('.secure-renfort-dest:checked'))
    .map(function(input){return input.value;});
  if(!destinations.length){showToast('Choisissez au moins une caserne.','warn');return;}
  const button=document.getElementById('secure-renfort-send');
  if(button&&button.disabled)return;
  if(button)button.disabled=true;
  try{
    await secureRenfortRpc('agai_renfort_send',{
      p_source_record_id:_rcId(CURRENT_CASERNE_ID,'iv',iv.id),
      p_destinations:destinations,
      p_kind:document.getElementById('secure-renfort-kind').value,
      p_note:document.getElementById('secure-renfort-note').value.trim(),
      p_request_key:secureRenfortActionKey(iv.id,'send')
    });
    const refreshed=await secureRefreshRenforts(true);
    cM();
    if(refreshed){
      secureClearRenfortActionKey(iv.id,'send');
      showToast('Demande de renfort enregistrée.','success');
    }else{
      showToast('Demande enregistrée sur le serveur, mais affichage à actualiser.','warn');
    }
  }catch(error){showToast(error.message,'warn');}
  finally{if(button)button.disabled=false;}
}
async function secureAnswerRenfort(id,answer){
  try{
    await secureRenfortRpc('agai_renfort_answer',{p_id:id,p_answer:answer});
    if(!await secureRefreshRenforts(true)){
      showToast('Réponse enregistrée sur le serveur, mais affichage à actualiser.','warn');return;
    }
    showToast(answer==='accepte'?'Renfort accepté.':'Renfort refusé.','success');
    if(answer==='accepte')secureShowRenfortCrew(id);
  }catch(error){showToast(error.message,'warn');}
}
async function secureCancelRenfort(id){
  try{
    await secureRenfortRpc('agai_renfort_cancel',{p_id:id});
    cM();
    if(!await secureRefreshRenforts(true)){
      showToast('Annulation enregistrée sur le serveur, mais affichage à actualiser.','warn');return;
    }
    showToast('Demande de renfort annulée.','success');
  }catch(error){showToast(error.message,'warn');}
}
function secureShowRenfortCrew(id){
  const row=secureRenfortById(id);if(!row||row.status!=='accepte')return;
  if(!canUseOperationalStartInterface()){
    showToast('Le départ du renfort est réservé au mobile ou à la tablette.','warn');return;
  }
  const vehicles=availableCaserneVehicleNames('');
  const users=sortByGradeThenName(USERS);
  const crewSelect=function(index,label){
    return '<div class="fg"><div class="fgl">'+label+'</div><select class="fi secure-renfort-member" id="secure-renfort-member-'+index+'">'
      +'<option value="">— Aucun —</option>'
      +users.map(function(user){return '<option value="'+escHtml(user.l)+'">'
        +escHtml(fullName(user))+'</option>';}).join('')+'</select></div>';
  };
  document.getElementById('mt').textContent='Départ du renfort';
  document.getElementById('mi').textContent=(row.source_snapshot&&row.source_snapshot.ivNature||'Intervention')
    +' — '+(row.source_snapshot&&row.source_snapshot.ivCommune||'');
  document.getElementById('mb').innerHTML='<div style="font-size:12px;margin-bottom:9px;">Caserne demandeuse : '
    +escHtml(row.source_caserne)+'</div>'
    +(row.kind==='complet'?'<div class="fg"><div class="fgl">Véhicule</div><select class="fi" id="secure-renfort-vehicle">'
      +'<option value="">— Sélectionner —</option>'
      +vehicles.map(function(vehicle){return '<option value="'+escHtml(vehicle)+'">'+escHtml(vehicle)+'</option>';}).join('')
      +'</select></div>':'')
    +crewSelect(0,'Chef d’agrès / premier agent')
    +crewSelect(1,'Conducteur / deuxième agent')
    +crewSelect(2,'Équipier')
    +crewSelect(3,'Équipier 2')
    +'<div class="brow"><button class="btn pr" onclick="secureStartRenfort(\''+escHtml(id)+'\')">Vérifier et partir</button>'
    +'<button class="btn" onclick="cM()">Annuler</button></div>';
  document.getElementById('mo').style.display='flex';
}
function secureStartRenfort(id,authorized){
  const row=secureRenfortById(id);if(!row||row.status!=='accepte')return;
  if(!canUseOperationalStartInterface()){
    showToast('Le départ du renfort est réservé au mobile ou à la tablette.','warn');return;
  }
  const target={id:'RENFORT_'+id,n:row.source_snapshot&&row.source_snapshot.ivNature||'',
    com:row.source_snapshot&&row.source_snapshot.ivCommune||''};
  if(!authorized){
    requestOperationalStartAuthorization(target,function(){secureStartRenfort(id,true);},{skipChaining:true});
    return;
  }
  const members=Array.from(document.querySelectorAll('.secure-renfort-member'))
    .map(function(input){return input.value;}).filter(Boolean);
  const vehicle=document.getElementById('secure-renfort-vehicle')?.value||'';
  if(!members.length||new Set(members).size!==members.length){
    showToast('Choisissez un équipage sans doublon.','warn');return;
  }
  if(row.kind==='complet'&&!vehicle){showToast('Choisissez le véhicule.','warn');return;}
  if(vehicle){
    const conflict=findActiveVehicleConflict(vehicle,null);
    if(conflict){showOperationalConflict('vehicle',vehicle,conflict);return;}
  }
  for(const login of members){
    const conflict=findActivePersonnelConflict(login,null);
    if(conflict){showOperationalConflict('personnel',login,conflict);return;}
  }
  if(!takeOperationalStartAuthorization(target)){
    showToast(OPERATIONAL_START_DENIED_MESSAGE,'warn');return;
  }
  void secureStartRenfortCommit(id,members,vehicle);
}
async function secureStartRenfortCommit(id,members,vehicle){
  try{
    await secureRenfortRpc('agai_renfort_start',{
      p_id:id,p_members:members,p_vehicle:vehicle,
      p_action_key:secureRenfortActionKey(id,'start')
    });
    const refreshed=await secureRefreshRenforts(true);
    const pulled=await securePullRenfortRecord();
    cM();rI();
    if(refreshed&&pulled){
      secureClearRenfortActionKey(id,'start');
      showToast('Renfort en cours.','success');
    }else{
      showToast('Départ enregistré sur le serveur, mais affichage à actualiser.','warn');
    }
  }catch(error){showToast(error.message,'warn');}
}
function secureCloseRenfort(_cid,id,confirmed){
  const row=secureRenfortById(id);
  const local=(IVS||[]).find(function(iv){return iv._renfortId===id;});
  if(!row||row.status!=='en-cours'||!local){
    showToast('Fiche de renfort à actualiser avant clôture.','warn');return;
  }
  if(!confirmed){
    requestOperationalCloseConfirmation(local,'Renfort · Retour : '+getHHMM(N()),
      function(snapshot){secureCloseRenfort(_cid,id,snapshot);});
    return;
  }
  if(confirmed!==operationalCloseSnapshot(local)){
    showToast('La fiche a changé : rouvrez-la avant de clôturer.','warn');return;
  }
  void secureCloseRenfortCommit(id,Number(local._serverRevision)||0);
}
async function secureCloseRenfortCommit(id,revision){
  try{
    await secureRenfortRpc('agai_renfort_finish',{
      p_id:id,p_action_key:secureRenfortActionKey(id,'finish'),
      p_expected_record_revision:revision
    });
    const refreshed=await secureRefreshRenforts(true);
    const pulled=await securePullRenfortRecord();
    cM();rI();
    if(refreshed&&pulled){
      secureClearRenfortActionKey(id,'finish');
      showToast('Renfort clôturé.','success');
    }else{
      showToast('Clôture enregistrée sur le serveur, mais affichage à actualiser.','warn');
    }
  }catch(error){showToast(error.message,'warn');}
}

if(SECURE_RENFORTS_ENABLED){
  // L'ancien circuit conserve ses verrous. Ces seules entrées sont redirigées
  // vers les opérations Auth, sans aucun saveData() inter-casernes.
  showRenfortModal=secureShowRenfortModal;
  envoyerRenfort=secureSendRenfort;
  repondreRenfort=function(_cid,id,answer){return secureAnswerRenfort(id,answer);};
  showRenfortEquipageModal=function(_cid,id){return secureShowRenfortCrew(id);};
  confirmerRenfortEquipage=function(_cid,id){return secureStartRenfort(id);};
  cloturerRenfort=secureCloseRenfort;
  annulerRenfortUT=function(_ivId,id){return secureCancelRenfort(id);};
  // L'ancien panneau attend un autre format de données. Le laisser vide :
  // secureRenderRenfortInbox affiche seul les demandes du nouveau circuit.
  getRenfortsEnAttente=function(){return [];};
  updateRenfortBadge=function(){
    const badge=document.getElementById('renfort-badge');
    if(!badge)return;
    const count=secureRenfortPending().length;
    badge.textContent=count;
    badge.style.display=count>0?'inline-flex':'none';
  };
  _secureLegacyRenderInterventions=rI;
  rI=function(){
    _secureLegacyRenderInterventions();
    secureRenderRenfortInbox();
    void secureRefreshRenforts(false);
  };
  const _secureLegacyOpenIntervention=oM;
  oM=function(id){
    _secureLegacyOpenIntervention(id);
    secureAppendRenfortSource(id);
  };
  window.setInterval(function(){void secureRefreshRenforts(false);},30000);
}
