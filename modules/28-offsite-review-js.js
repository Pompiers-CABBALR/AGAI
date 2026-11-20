// Contrôle a posteriori des départs hors caserne. L'heure GPS initiale reste
// intacte ; seule l'heure retenue après décision administrative peut changer.
const OFFSITE_IGN_ROUTE_URL='https://data.geopf.fr/navigation/itineraire';
const _offsiteReviewRoutes=new Map();
const _offsiteReviewActions=new Map();
const _offsiteReviewSaving=new Set();

function offsiteReviewRecordedTime(control){
  const stamp=String(control&&control.date||'');
  return /^\d{8}_\d{4}$/.test(stamp)?stamp.slice(9,11)+':'+stamp.slice(11,13):'';
}
function offsiteReviewAddMinutes(time,minutes){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time||''))||!Number.isInteger(minutes)||minutes<0)return '';
  const value=(Number(time.slice(0,2))*60+Number(time.slice(3,5))+minutes)%1440;
  return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
}
function offsiteReviewFor(iv){
  const review=iv&&iv._departGeoReview,control=iv&&iv._departGeoControle;
  return review&&control&&review.sourceDate===control.date&&['justifie','refuse'].includes(review.status)?review:null;
}
function offsiteReviewPending(iv){
  return !!(iv&&operationalStartOffsiteConfirmed(iv._departGeoControle)&&!offsiteReviewFor(iv));
}
function offsiteReviewRecordId(iv,station){
  if(!iv||!iv.id||!station)return '';
  const prefix=station+'__'+(isPilpIntervention(iv)?'pilp':'iv')+'__';
  return String(iv.id).startsWith(prefix)?String(iv.id):prefix+iv.id;
}
function offsiteReviewFailureMessage(detail,status){
  const source=String(detail||'');
  if(/AGAI_OFFSITE_REVIEW_NOT_FOUND/.test(source))return 'La fiche n’a pas été retrouvée sur le serveur. Aucune heure modifiée ; contactez un administrateur.';
  if(/AGAI_OFFSITE_REVIEW_STALE_SOURCE/.test(source))return 'La fiche a changé depuis son ouverture. Attendez Sync OK, puis rouvrez-la avant de décider.';
  if(/AGAI_OFFSITE_REVIEW_AFTER_END/.test(source))return 'Le trajet proposé dépasse la fin de l’intervention : aucune heure modifiée.';
  if(/AGAI_OFFSITE_REVIEW_CROSSES_MIDNIGHT/.test(source))return 'Le trajet passe minuit : ce cas nécessite un contrôle horaire spécifique.';
  if(/AGAI_OFFSITE_REVIEW_GPS_UNCONFIRMED/.test(source))return 'Le point GPS est trop imprécis pour ce contrôle automatique.';
  if(/AGAI_OFFSITE_REVIEW_ROUTE_INVALID/.test(source))return 'Le trajet proposé a été refusé par le contrôle serveur. Aucune heure modifiée.';
  if(/AGAI_OFFSITE_REVIEW_ROLE_FORBIDDEN|AGAI_OFFSITE_REVIEW_STATION_FORBIDDEN/.test(source))return 'Droits insuffisants pour contrôler cette caserne.';
  return 'Contrôle non enregistré (HTTP '+status+'). Aucune heure n’a été modifiée ; réessayez ou contactez un administrateur.';
}
function offsiteReviewPanelHTML(iv){
  if(!iv||!operationalStartOffsiteConfirmed(iv._departGeoControle)||!hasAdministrativeAccount())return '';
  const review=offsiteReviewFor(iv),history=Array.isArray(iv._departGeoReviewHistory)?iv._departGeoReviewHistory:[];
  const original=offsiteReviewRecordedTime(iv._departGeoControle)||iv._hDebutReelle||iv._hDebutInitiale||iv._hDebut||'—';
  const summary=review?'<div style="color:#166534;margin-bottom:5px;"><strong>Contrôle terminé : '+(review.status==='justifie'?'départ justifié':(iv._sdis?'localisation refusée':'heure initiale refusée'))+'</strong></div>'
    +'<div>Heure GPS : '+escHtml(review.originalStart||original)+' · '+(iv._sdis?'SDIS : acquis présence inchangé':'heure retenue : '+escHtml(review.retainedStart||iv._hDebut||'—'))
    +(review.routeMinutes?' · trajet estimé : '+escHtml(String(review.routeMinutes))+' min':'')+'</div>'
    +'<div>Décision par '+escHtml(review.reviewedBy||'—')+' · '+escHtml(review.reviewedAt||'—')+' · '+escHtml(review.reason||'')+'</div>':'';
  const buttons=isAdminModeActive()&&iv.s==='terminee'
    ?'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;">'
      +'<button class="btn sm" type="button" data-id="'+escHtml(iv.id)+'" onclick="offsiteReviewOpen(this.dataset.id,\'justifie\')">✓ Départ justifié</button>'
      +'<button class="btn sm" type="button" data-id="'+escHtml(iv.id)+'" onclick="offsiteReviewOpen(this.dataset.id,\'refuse\')">⚠ '+(iv._sdis?'Départ non justifié':'Refuser l’heure initiale')+'</button>'
      +'</div>'
    :(!review?'<div style="margin-top:5px;">Activez les pouvoirs administrateur pour contrôler ce départ une fois l’intervention terminée.</div>':'');
  const past=history.length>1?'<details style="margin-top:7px;"><summary>Décisions précédentes ('+(history.length-1)+')</summary>'
    +history.slice(0,-1).map(function(item){return '<div style="margin-top:4px;">'+escHtml(item.reviewedAt||'')+' · '+escHtml(item.status==='justifie'?'justifié':'heure refusée')+' · '+escHtml(item.reviewedBy||'')+' · '+escHtml(item.reason||'')+'</div>';}).join('')+'</details>':'';
  return '<div style="background:'+(review?'#F0FDF4':'#FFF7ED')+';border:1px solid '+(review?'#86EFAC':'#FDBA74')+';border-radius:8px;padding:9px 12px;margin-bottom:10px;font-size:12px;line-height:1.5;">'
    +(review?summary:'<strong>Départ hors caserne à contrôler</strong> · heure GPS '+escHtml(original))
    +buttons+'<div id="offsite-review-form"></div>'+past+'</div>';
}
function offsiteReviewOpen(ivId,status){
  const iv=interventionById(ivId),host=document.getElementById('offsite-review-form');
  if(!iv||!host||!isAdminModeActive()||iv.s!=='terminee'
    ||(!offsiteReviewPending(iv)&&!offsiteReviewFor(iv)))return;
  if(status!=='justifie'&&status!=='refuse')return;
  const original=offsiteReviewRecordedTime(iv._departGeoControle);
  if(!original){showToast('Heure GPS initiale absente : contrôle impossible sans vérification manuelle.','warn');return;}
  host.dataset.mode=status;host.dataset.id=ivId;
  host.innerHTML='<div style="border-top:1px solid #FDBA74;margin-top:8px;padding-top:8px;">'
    +'<div><strong>'+(status==='justifie'?'Justifier le départ à '+escHtml(original):(iv._sdis?'Signaler le départ hors caserne non justifié (heures SDIS inchangées)':'Refuser '+escHtml(original)+' et calculer le trajet vers la caserne'))+'</strong></div>'
    +(status==='refuse'&&!iv._sdis?'<div id="offsite-route-result" style="margin:6px 0;">Le calcul enverra la position GPS enregistrée au service d’itinéraire de l’IGN. Il ne tient pas compte du trafic passé.</div>'
      +'<button class="btn sm" type="button" data-id="'+escHtml(ivId)+'" onclick="offsiteReviewLoadRoute(this.dataset.id)">Calculer le trajet vers la caserne</button>':'')
    +'<label for="offsite-review-reason" style="display:block;margin:6px 0 3px;">Motif obligatoire</label>'
    +'<textarea id="offsite-review-reason" class="fi" rows="2" maxlength="500" placeholder="Lieu réel, contexte et justificatif du contrôle"></textarea>'
    +'<div style="display:flex;gap:6px;align-items:center;margin-top:7px;">'
    +'<button id="offsite-review-confirm" class="btn sm" type="button" data-id="'+escHtml(ivId)+'" onclick="offsiteReviewSubmit(this.dataset.id)"'+(status==='refuse'&&!iv._sdis?' disabled':'')+'>Confirmer la décision</button>'
    +'<button class="btn sm" type="button" onclick="document.getElementById(\'offsite-review-form\').innerHTML=\'\'">Annuler</button>'
    +'</div></div>';
}
async function offsiteReviewLoadRoute(ivId){
  const iv=interventionById(ivId),control=iv&&iv._departGeoControle||{};
  const result=document.getElementById('offsite-route-result');
  if(!iv||!result)return;
  const station=getCaserneStationLocation(control.caserneId||CURRENT_CASERNE_ID);
  const latitude=Number(control.latitude),longitude=Number(control.longitude);
  if(control.latitude==null||control.longitude==null||!validCaserneCoordinates(latitude,longitude)
    ||!station||!validCaserneCoordinates(station.latitude,station.longitude)
    ||!Number.isFinite(Number(control.precisionMetres))||Number(control.precisionMetres)>250){
    result.textContent='Position GPS ou position de caserne insuffisante : aucun horaire calculé.';return;
  }
  const params=new URLSearchParams({resource:'bdtopo-osrm',start:longitude+','+latitude,
    end:station.longitude+','+station.latitude,profile:'car',optimization:'fastest',
    distanceUnit:'meter',timeUnit:'second',getSteps:'false',getBbox:'false'});
  const controller=new AbortController(),timer=setTimeout(function(){controller.abort();},12000);
  try{
    const response=await fetch(OFFSITE_IGN_ROUTE_URL+'?'+params.toString(),{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('itinéraire HTTP '+response.status);
    const route=await response.json(),seconds=Number(route&&route.duration),distance=Number(route&&route.distance);
    if(!Number.isFinite(seconds)||seconds<=0||seconds>10800||!Number.isFinite(distance)||distance<0)throw new Error('itinéraire inexploitable');
    const minutes=Math.ceil(seconds/60),original=offsiteReviewRecordedTime(control),retained=offsiteReviewAddMinutes(original,minutes);
    if(!retained)throw new Error('heure initiale invalide');
    if(Number(retained.slice(0,2))*60+Number(retained.slice(3,5))
      <Number(original.slice(0,2))*60+Number(original.slice(3,5)))
      throw new Error('trajet passant minuit : contrôle horaire manuel nécessaire');
    const host=document.getElementById('offsite-review-form');
    if(!host||host.dataset.id!==ivId||host.dataset.mode!=='refuse')return;
    _offsiteReviewRoutes.set(ivId,{sourceDate:control.date,seconds:seconds,distance:distance,
      resourceVersion:String(route.resourceVersion||''),calculatedAt:new Date().toISOString(),retained:retained});
    result.textContent='Trajet théorique IGN : '+minutes+' min · '+(distance/1000).toFixed(1)+' km. Heure proposée pour tout l’équipage : '+original+' + '+minutes+' min = '+retained+'. À confirmer par un administrateur.';
    document.getElementById('offsite-review-confirm').disabled=false;
  }catch(error){result.textContent='Trajet indisponible ('+String(error&&error.message||error)+'). Aucun horaire n’est proposé ; réessayez plus tard.';}
  finally{clearTimeout(timer);}
}
async function offsiteReviewSubmit(ivId){
  const iv=interventionById(ivId),host=document.getElementById('offsite-review-form');
  if(!iv||!host||host.dataset.id!==ivId||!isAdminModeActive()||_offsiteReviewSaving.has(ivId))return;
  const status=host.dataset.mode,reason=String((document.getElementById('offsite-review-reason')||{}).value||'').trim();
  const route=status==='refuse'&&!iv._sdis?_offsiteReviewRoutes.get(ivId):null;
  const recordId=offsiteReviewRecordId(iv,CURRENT_CASERNE_ID);
  if(!recordId){showToast('Identifiant de fiche indisponible ; contrôle non envoyé.','warn');return;}
  if(reason.length<10){showToast('Précisez le motif du contrôle (10 caractères minimum).','warn');return;}
  if(status==='refuse'&&!iv._sdis&&(!route||route.sourceDate!==iv._departGeoControle.date)){
    showToast('Calculez d’abord le trajet depuis la position GPS enregistrée.','warn');return;
  }
  if(typeof _agaiAuthAccessToken!=='function'||!_agaiAuthAccessToken()||navigator.onLine===false){showToast('Connexion requise pour confirmer le contrôle.','warn');return;}
  const actionKey=ivId+'|'+iv._departGeoControle.date+'|'+status+'|'+reason;
  if(!_offsiteReviewActions.has(actionKey))_offsiteReviewActions.set(actionKey,crypto.randomUUID());
  const button=document.getElementById('offsite-review-confirm');
  _offsiteReviewSaving.add(ivId);if(button)button.disabled=true;
  try{
    if(typeof agaiApplyAdminStationHeader==='function')agaiApplyAdminStationHeader();
    const response=await _agaiFetchWithTimeout(SB_URL+'/rest/v1/rpc/agai_review_offsite_departure',{
      method:'POST',headers:_sbHeaders,body:JSON.stringify({p_record_id:recordId,p_status:status,p_reason:reason,
        p_source_date:iv._departGeoControle.date,p_expected_record_revision:Number(iv._serverRevision)||0,
        p_route_seconds:route&&route.seconds||null,
        p_route_distance_meters:route&&route.distance||null,p_route_resource_version:route&&route.resourceVersion||'',
        p_action_id:_offsiteReviewActions.get(actionKey)})
    },20000);
    if(!response.ok){const detail=String(await response.text()||'').slice(0,500);throw new Error(offsiteReviewFailureMessage(detail,response.status));}
    const result=await response.json();
    if(!result||result.ok!==true||!result.data||result.data.id!==ivId)throw new Error('Réponse serveur incomplète ; contrôle non confirmé.');
    _rcReplaceLocalOperationalRecord(CURRENT_CASERNE_ID,isPilpIntervention(iv)?'pilp':'iv',result.data);
    _writeLocalCache(_buildDataObject());
    _offsiteReviewActions.delete(actionKey);_offsiteReviewRoutes.delete(ivId);
    rI();rHist();rAccueil();oM(ivId);
    showToast('Contrôle du départ enregistré et tracé.','success');
  }catch(error){showToast(error&&error.message||'Contrôle non confirmé ; aucune heure modifiée localement.','warn');}
  finally{_offsiteReviewSaving.delete(ivId);if(button)button.disabled=false;}
}
