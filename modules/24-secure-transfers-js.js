// Le circuit historique reste fermé sous Auth. Ce module ne prend le relais
// qu'avec le pilote explicite ou après l'activation de la bascule générale.
const _legacyTransfererIV=transfererIV;
const _legacyConfirmerTransfert=confirmerTransfert;
const _secureTransferInFlight=new Set();

async function _secureTransferRpc(payload){
  const token=_agaiAuthAccessToken();
  if(!SECURE_TRANSFERS_ENABLED||!token||typeof navigator==='undefined'||navigator.onLine===false)
    throw new Error('Connexion en ligne requise pour transférer une intervention.');
  let response;
  try{
    response=await _agaiAuthFetchWithTimeout(SB_URL+'/rest/v1/rpc/agai_transfer_intervention',{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    },15000);
  }catch(_error){throw new Error('Transfert non confirmé : connexion interrompue. Réessayez sans créer de copie.');}
  if(!response.ok){
    let code='';
    try{code=(await response.json()).message||'';}catch(_error){}
    const known={
      AGAI_TRANSFER_SOURCE_FORBIDDEN:'Cette fiche n’est plus transférable. Actualisez les interventions.',
      AGAI_TRANSFER_ROLE_FORBIDDEN:'Ce compte n’a pas le droit de transférer cette fiche.',
      AGAI_TRANSFER_DESTINATION_UNAVAILABLE:'La caserne destinataire n’est pas disponible.',
      AGAI_TRANSFER_ACTIVE_REINFORCEMENT:'Un renfort est encore actif sur cette fiche. Terminez-le ou annulez-le avant le transfert.',
      AGAI_TRANSFER_STALE_SOURCE:'La fiche a changé. Actualisez-la avant de transférer.',
      AGAI_TRANSFER_ALREADY_PROCESSED:'Cette fiche a déjà été transférée.'
    };
    if(known[code])throw new Error(known[code]);
    if(response.status===401||response.status===403)
      throw new Error('Transfert refusé : reconnectez-vous.');
    throw new Error('Transfert non enregistré (HTTP '+response.status+').');
  }
  const result=await response.json();
  if(!result||result.ok!==true||!result.destinationRecordId||!result.apl)
    throw new Error('Réponse de transfert incomplète. Actualisez avant de réessayer.');
  return result;
}

globalThis.transfererIV=function(id){
  if(!SECURE_TRANSFERS_ENABLED)return _legacyTransfererIV(id);
  const iv=IVS.find(function(item){return item&&item.id===id;});
  if(!iv||iv.s!=='en-attente'||iv._isRenfort){
    showToast('Cette fiche ne peut plus être transférée.','warn');return;
  }
  if(!CU||!(isAgres()||isChef()||hasRight('Administration'))){
    showToast('Le transfert est réservé aux chefs d’agrès et aux administrateurs.','warn');return;
  }
  const casOptions=CASERNES.filter(function(c){return c.id!==CURRENT_CASERNE_ID;})
    .map(function(c){return '<option value="'+escHtml(c.id)+'">'+escHtml(c.nom)+'</option>';}).join('');
  document.getElementById('mt').textContent='Transférer l’intervention';
  document.getElementById('mi').textContent=interventionDisplayCallNumber(iv);
  document.getElementById('mb').innerHTML='<div>'
    +'<div style="font-size:12px;color:var(--t2);margin-bottom:10px;">'
    +'Le serveur créera une nouvelle fiche avec un nouvel APL dans la caserne destinataire, puis annulera cette fiche. Les deux resteront liées dans l’historique.</div>'
    +'<div class="fg"><div class="fgl">Caserne destinataire</div><select class="fi" id="tr-dest">'+casOptions+'</select></div>'
    +'<div class="fg"><div class="fgl">Motif du transfert *</div><textarea class="fta" id="tr-motif" maxlength="1000" style="height:70px;"></textarea></div>'
    +'<div class="brow"><button class="btn pr sm" id="secure-transfer-send" onclick="confirmerTransfert(\''+id+'\')">Transférer</button>'
    +'<button class="btn sm" onclick="cM()">Annuler</button></div></div>';
  document.getElementById('mo').style.display='flex';
};

globalThis.confirmerTransfert=async function(id){
  if(!SECURE_TRANSFERS_ENABLED)return _legacyConfirmerTransfert(id);
  if(_secureTransferInFlight.has(id))return;
  const iv=IVS.find(function(item){return item&&item.id===id;});
  const destination=document.getElementById('tr-dest')?.value||'';
  const reason=document.getElementById('tr-motif')?.value.trim()||'';
  if(!iv||iv.s!=='en-attente'||!CASERNES.some(function(c){return c.id===destination;})
     ||destination===CURRENT_CASERNE_ID){
    showToast('Fiche ou caserne destinataire invalide. Actualisez la liste.','warn');return;
  }
  if(reason.length<5){showToast('Précisez le motif du transfert (au moins 5 caractères).','warn');return;}
  const button=document.getElementById('secure-transfer-send');
  if(button)button.disabled=true;
  _secureTransferInFlight.add(id);
  const originCaserne=CURRENT_CASERNE_ID,originLogin=CU&&CU.l;
  try{
    const result=await _secureTransferRpc({
      p_source_record_id:_rcId(originCaserne,'iv',id),
      p_destination_caserne:destination,p_reason:reason,
      p_action_key:aplCreationActionKey('transfert',id),
      p_expected_record_revision:Number(iv._serverRevision)||0
    });
    if(CURRENT_CASERNE_ID!==originCaserne||!CU||CU.l!==originLogin){
      showToast('Transfert enregistré, mais session changée : reconnectez-vous pour le consulter.','warn');return;
    }
    const refreshed=typeof _rcPull==='function'&&await _rcPull(true)===true;
    const source=IVS.find(function(item){return item&&item.id===id;});
    if(!refreshed||!source||source.s!=='annulee'
       ||source._transfertDestRecordId!==result.destinationRecordId){
      showToast('Transfert enregistré sur le serveur ; la fiche locale doit être actualisée. Ne recommencez pas avec une nouvelle demande.','warn');return;
    }
    clearAplCreationActionKey('transfert',id);
    cM();rI();rAccueil();
    showToast('Transfert enregistré vers '+destination+' — '+result.apl,'success');
  }catch(error){showToast(error&&error.message||'Transfert non enregistré.','warn');}
  finally{_secureTransferInFlight.delete(id);if(button)button.disabled=false;}
};
