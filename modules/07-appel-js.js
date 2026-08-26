// === MODULE: appel.js ===
// ────────────────── ÉTAPES APPEL ──────────────────
function gS(n){
  document.getElementById('e1').style.display=n===1?'':'none';
  document.getElementById('e2').style.display=n===2?'':'none';
  document.getElementById('sa1').style.background=n>=1?'var(--red)':'var(--brd)';
  document.getElementById('sa2').style.background=n>=2?'var(--red)':'var(--brd)';
  document.getElementById('slbl').innerHTML=n===1?'<span style="color:var(--red);font-weight:600;">Étape 1</span> — Nature':'<span style="color:var(--red);font-weight:600;">Étape 2</span> — Localisation &amp; détails';
  if(n===2){const h=hoA?getH(hoA):'—';document.getElementById('nr').textContent=selNat;document.getElementById('hr').innerHTML='&#x1F4C5; '+escHtml(h);showSM(selNat);}
  requestAnimationFrame(syncAppelNatureViewport);
}
function syncAppelNatureViewport(){
  const root=document.documentElement,tab=document.getElementById('tab-appel'),step=document.getElementById('e1');
  if(!tab||!step)return;
  const active=tab.classList.contains('active')&&step.style.display!=='none';
  root.classList.toggle('appel-nature-locked',active);
  if(!active){step.style.removeProperty('height');step.style.removeProperty('max-height');return;}
  const viewport=window.visualViewport;
  const viewportHeight=Math.round(viewport&&viewport.height?viewport.height:window.innerHeight);
  const top=Math.max(0,Math.round(step.getBoundingClientRect().top));
  const available=Math.max(150,viewportHeight-top-2);
  root.style.setProperty('--appel-nature-height',available+'px');
  step.style.height=available+'px';step.style.maxHeight=available+'px';
}
function showSM(nat){
  ['g','f','a','n','e'].forEach(k=>document.getElementById('sm-'+k).style.display='none');
  if(nat==='Nid de guêpes et frelons')document.getElementById('sm-g').style.display='';
  else if(nat==='Nid de frelons asiatiques')document.getElementById('sm-f').style.display='';
  else if(nat==="Essaim d'abeilles")document.getElementById('sm-a').style.display='';
  else if(nat==="Sauvetage et capture d'animaux")document.getElementById('sm-n').style.display='';
  else if(nat==='Épuisement et assèchement')document.getElementById('sm-e').style.display='';
}
function sr(g,el,v){
  document.querySelectorAll('#'+g+' .smopt').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');
  el.dataset.val=v; // stocke la valeur propre (sans emoji) pour la capture des détails
  if(g==='lg'){
    document.getElementById('hgb').style.display=(v==='Toiture'||v==='Arbre/Haie'||v==='Mur')?'':'none';
    document.getElementById('lgab').style.display=v==='Autre'?'':'none';
  }
  if(g==='lf'){document.getElementById('lfab').style.display=v==='Autre'?'':'none';document.getElementById('hfb').style.display='';}
  if(g==='la'){document.getElementById('laab').style.display=v==='Autre'?'':'none';document.getElementById('hab').style.display=(v==='Arbre'||v==='Haie'||v==='Mur'||v==='Toiture')?'':'none';}
  if(g==='ta'){document.getElementById('tapb').style.display=(v==='NAC'||v==='Autre')?'':'none';}
}
function sz(el,v){document.querySelectorAll('.szo').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');nidSize=v;}

function findHistoricalAccountByLogin(login){
  if(!login)return null;
  const current=(USERS||[]).find(function(user){return user.l===login;});
  if(current)return current;
  const global=(GLOBAL_ACCOUNTS||[]).find(function(user){return user.l===login;});
  if(global)return global;
  for(const data of Object.values(CASERNE_DATA||{})){
    const found=data&&Array.isArray(data.users)?data.users.find(function(user){return user.l===login;}):null;
    if(found)return found;
  }
  return null;
}

function getHistoricalInterventionChiefs(iv){
  const chiefs=[];
  const seen=new Set();
  const add=function(login,embedded){
    if(!login||seen.has(login))return;
    seen.add(login);
    const account=findHistoricalAccountByLogin(login);
    const name=account?fullName(account):embedded&&((embedded.nom||'')+' '+(embedded.prenom||'')).trim();
    chiefs.push(name||login);
  };
  add(iv&&iv.agr,null);
  add(iv&&iv._agr2,null);
  [iv&&iv._equipage1,iv&&iv._equipage2].forEach(function(equipage){
    (Array.isArray(equipage)?equipage:[]).forEach(function(member){
      const role=String(member&&member.role||'').toLowerCase();
      if(role==='ca'||role.includes('chef d')&&role.includes('agr'))add(member.login,member);
    });
  });
  return chiefs;
}

function getHistoricalInterventionWhen(iv){
  const timeline=Array.isArray(iv&&iv.tl)?iv.tl:[];
  const departure=timeline.find(function(entry){return entry&&entry.s==='en-cours'&&entry.h;});
  const stamp=String(departure&&departure.h||iv&&iv.h||'');
  const digits=stamp.replace(/\D/g,'');
  let date='Date non renseignée';
  let stampTime='';
  if(digits.length>=8)date=digits.slice(6,8)+'/'+digits.slice(4,6)+'/'+digits.slice(0,4);
  if(digits.length>=12)stampTime=digits.slice(8,10)+':'+digits.slice(10,12);
  const start=iv&&iv._hDebut||stampTime;
  const end=iv&&iv._hFin||'';
  return date+(start?' · '+start+(end?' → '+end:''):'');
}

function renderPreviousInterventionDetails(interventions){
  const statusLabels={'en-attente':'En attente','selectionne':'Sélectionnée','en-cours':'En cours','terminee':'Terminée','avis-passage':'Avis de passage'};
  return interventions.slice().sort(function(a,b){
    return String(b.h||'').localeCompare(String(a.h||''));
  }).map(function(iv){
    const chiefs=getHistoricalInterventionChiefs(iv);
    return '<div style="background:rgba(255,255,255,.72);border:1px solid #FCD34D;border-radius:7px;padding:7px 9px;margin-top:6px;">'
      +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
      +'<strong style="font-size:11px;">&#x1F4C5; '+escHtml(getHistoricalInterventionWhen(iv))+'</strong>'
      +'<span style="font-size:10px;background:#FFF7ED;color:#9A3412;border-radius:8px;padding:1px 6px;">'+escHtml(statusLabels[iv.s]||iv.s||'—')+'</span></div>'
      +'<div style="font-size:11px;margin-top:3px;">&#x1F9D1;&#x200D;&#x1F692; Chef'+(chiefs.length>1?'s':'')+' d’agrès : <strong>'+escHtml(chiefs.length?chiefs.join(' · '):'Non renseigné')+'</strong></div>'
      +'</div>';
  }).join('');
}

// ── Détection : déjà une intervention (surtout avis de passage) à cette adresse pour le même type ──
function checkDejaIntervenu(){
  const box=document.getElementById('deja-intervenu-alert');if(!box)return;
  const addr=(document.getElementById('fa')?.value||'').trim();
  const nat=selNat||'';
  if(!selC2||!addr||addr.length<4||!nat){box.innerHTML='';box.style.display='none';return;}
  const nn=nm(nat), nc=nm(selC2);
  const memes=[].concat(IVS||[],PILP_IVS||[]).filter(function(x){
    return sameInterventionAddress(x.addr,addr) && nm(x.com)===nc && nm(x.n)===nn && x.s!=='annulee';
  });
  if(!memes.length){box.innerHTML='';box.style.display='none';return;}
  const avisAttente=memes.filter(function(x){return x._avisEnAttente;});
  let msg;
  if(avisAttente.length){
    // Cas prioritaire : un avis de passage a été laissé ici, on attend le rappel.
    msg='&#x1F7E3; <strong>Avis de passage en attente</strong> à cette adresse pour «&nbsp;'+escHtml(nat)+'&nbsp;». Il s\u2019agit probablement du rappel du requérant.';
  } else {
    msg='&#x26A0;&#xFE0F; <strong>'+memes.length+' intervention'+(memes.length>1?'s':'')+'</strong> d\u00e9j\u00e0 enregistr\u00e9e'+(memes.length>1?'s':'')+' \u00e0 cette adresse pour «&nbsp;'+escHtml(nat)+'&nbsp;».';
  }
  box.innerHTML=msg+'<div style="max-height:190px;overflow-y:auto;margin-top:6px;padding-right:2px;">'+renderPreviousInterventionDetails(memes)+'</div>';
  box.style.display='block';
}
function cv(){
  const h=parseFloat(document.getElementById('he').value),s=parseFloat(document.getElementById('se').value);
  const b=document.getElementById('vb3');
  if(!isNaN(h)&&!isNaN(s)&&h>0&&s>0){b.style.display='';document.getElementById('vv').textContent=(h*s).toFixed(1)+' m³';}else b.style.display='none';
}

function sortInterventionsForOwnRoute(interventions){
  return (interventions||[]).slice().sort(function(a,b){
    const ao=Number(a._routeOrder)||9999,bo=Number(b._routeOrder)||9999;
    if(ao!==bo)return ao-bo;
    const as=String(a._selectedAt||a.h||''),bs=String(b._selectedAt||b.h||'');
    return as.localeCompare(bs);
  });
}
// L'itinéraire ne reprend que les interventions sélectionnées par le chef
// d'agrès connecté. Aucune intervention en attente ou sélectionnée par un autre
// équipage ne doit être ajoutée automatiquement.
function lancerItineraireTournee(){
  const base=sortInterventionsForOwnRoute(IVS.filter(function(iv){
    return iv.s==='selectionne'&&iv.agr===CU.l&&!iv._isPilip&&iv.addr;
  }));
  if(!base.length){showToast('Sélectionnez d\u2019abord vos interventions avant de créer l\u2019itinéraire.','warn');return;}
  if(base.length>1)showToast('Itinéraire de votre sélection ('+base.length+') ouvert dans Google Maps.','info');
  openMapsItineraire(base.map(iv=>iv.id));
}
function lancerItinerairePilp(){
  const base=sortInterventionsForOwnRoute(PILP_IVS.filter(function(iv){
    return iv.s==='selectionne'&&iv.agr===CU.l&&iv.addr;
  }));
  if(!base.length){showToast('Sélectionnez d\u2019abord vos interventions PILP avant de créer l\u2019itinéraire.','warn');return;}
  if(base.length>1)showToast('Itinéraire de votre sélection PILP ('+base.length+') ouvert dans Google Maps.','info');
  openMapsItineraire(base.map(iv=>iv.id));
}

// ────────────────── OUTILS MOBILES : GOOGLE MAPS & APPEL MASQUÉ ──────────────────
// Ouvre une adresse dans Google Maps (navigation vers ce point).
function openMaps(id){
  const iv=IVS.find(v=>v.id===id)||PILP_IVS.find(v=>v.id===id);
  if(!iv){showToast('Intervention introuvable.','warn');return;}
  const dest=encodeURIComponent(((iv.addr||'')+', '+(iv.com||'')).trim());
  if(!dest||dest===', '){showToast('Adresse manquante.','warn');return;}
  window.open('https://www.google.com/maps/dir/?api=1&destination='+dest,'_blank');
}
// Construit un itinéraire multi-points avec les interventions actives sélectionnées.
function openMapsItineraire(ids){
  const cibles=(ids||[]).map(id=>IVS.find(v=>v.id===id)||PILP_IVS.find(v=>v.id===id)).filter(Boolean);
  const points=cibles.map(iv=>((iv.addr||'')+', '+(iv.com||'')).trim()).filter(p=>p&&p!==', ');
  if(!points.length){showToast('Aucune adresse à ajouter à l\u2019itinéraire.','warn');return;}
  // Google Maps : destination = dernier point, waypoints = points intermédiaires.
  const destination=encodeURIComponent(points[points.length-1]);
  let url='https://www.google.com/maps/dir/?api=1&destination='+destination;
  if(points.length>1){
    const waypoints=points.slice(0,-1).map(p=>encodeURIComponent(p)).join('%7C'); // %7C = |
    url+='&waypoints='+waypoints;
  }
  window.open(url,'_blank');
}
// Appel du requérant en tentant de masquer le numéro (préfixe #31# en France).
// Le masquage n'est PAS garanti : il dépend de l'opérateur et du téléphone.
function callRequerantMasque(id,index){
  const iv=IVS.find(v=>v.id===id)||PILP_IVS.find(v=>v.id===id);
  if(!iv){showToast('Intervention introuvable.','warn');return;}
  const phones=getInterventionPhones(iv);
  const num=(phones[Number(index)||0]||'').replace(/\s/g,'');
  if(!num){showToast('Numéro manquant.','warn');return;}
  // #31# masque le numéro pour cet appel (France). Encodé pour le lien tel:.
  showToast('Appel avec masquage du numéro (#31#). Si le masquage ne fonctionne pas, activez-le dans les réglages de votre téléphone.','info');
  setTimeout(function(){window.location.href='tel:'+encodeURIComponent('#31#')+num;},400);
}

// ────────────────── AUTOCOMPLÉTION ADRESSE (Nominatim) ──────────────────
let addrTimer=null,addrRequest=null;
let addrSelected=false,addrSelectedValue='';
function extractNumero(q){const m=q.match(/^(\d+\s*(?:bis|ter|quater)?\s*)/i);return m?m[1]:'';}
const ADDRESS_COMPLETION_URL='https://data.geopf.fr/geocodage/completion/';
const ADDRESS_SEARCH_URL='https://data.geopf.fr/geocodage/search';
const ADDRESS_REVERSE_URL='https://data.geopf.fr/geocodage/reverse';
const addressSearchCache=new Map();
function addrNorm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[-'’]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}
function addrEsc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function addrCityMatches(city,fulltext,commune){
  const expected=addrNorm(commune),actual=addrNorm(city);
  if(actual)return actual===expected;
  return addrNorm(fulltext).includes(expected);
}
function addrCandidate(raw,kind,commune,numero){
  let street='',city='',fulltext='';
  if(kind==='completion'){
    street=raw.street||((raw.names||[])[0])||'';
    city=raw.city||raw.municipality||'';
    fulltext=raw.fulltext||raw.label||'';
  }else if(kind==='search'){
    const p=(raw&&raw.properties)||{};
    street=p.street||((p.type==='street'||p.type==='locality')?p.name:'')||'';
    city=p.city||p.municipality||'';
    fulltext=p.label||p.name||'';
  }else{
    const a=(raw&&raw.address)||{};
    street=a.road||a.pedestrian||a.footway||a.street||a.place||'';
    city=a.city||a.town||a.village||a.municipality||'';
    fulltext=raw.display_name||'';
  }
  street=String(street||'').replace(/^\d+\s*(?:bis|ter|quater)?\s*/i,'').trim();
  if(!street||!addrCityMatches(city,fulltext,commune))return null;
  return {address:(numero+street).trim(),detail:fulltext||((numero+street).trim()+', '+commune)};
}
function addrCollect(target,seen,items,kind,commune,numero){
  (items||[]).forEach(function(raw){
    const candidate=addrCandidate(raw,kind,commune,numero);
    if(!candidate)return;
    const key=addrNorm(candidate.address);
    if(!key||seen.has(key))return;
    seen.add(key);target.push(candidate);
  });
}
async function addressSuggestions(q,commune,signal){
  const clean=String(q||'').trim(),cacheKey=addrNorm(commune)+'|'+addrNorm(clean);
  if(addressSearchCache.has(cacheKey))return addressSearchCache.get(cacheKey);
  const numero=extractNumero(clean),text=clean+', '+commune;
  const completionParams=new URLSearchParams({text:text,type:'StreetAddress',maximumResponses:'15'});
  const searchParams=new URLSearchParams({q:text,index:'address',limit:'30',autocomplete:'true'});
  const requests=[
    fetch(ADDRESS_COMPLETION_URL+'?'+completionParams.toString(),{signal:signal,headers:{'Accept-Language':'fr'}}).then(function(r){if(!r.ok)throw new Error('completion '+r.status);return r.json();}),
    fetch(ADDRESS_SEARCH_URL+'?'+searchParams.toString(),{signal:signal,headers:{'Accept-Language':'fr'}}).then(function(r){if(!r.ok)throw new Error('search '+r.status);return r.json();})
  ];
  const settled=await Promise.allSettled(requests),results=[],seen=new Set();
  if(settled[0].status==='fulfilled')addrCollect(results,seen,settled[0].value.results,'completion',commune,numero);
  if(settled[1].status==='fulfilled')addrCollect(results,seen,settled[1].value.features,'search',commune,numero);
  if(!results.length&&!signal.aborted){
    try{
      const fallbackParams=new URLSearchParams({q:text+', France',format:'json',addressdetails:'1',limit:'20',countrycodes:'fr'});
      const response=await fetch('https://nominatim.openstreetmap.org/search?'+fallbackParams.toString(),{signal:signal,headers:{'Accept-Language':'fr'}});
      if(response.ok)addrCollect(results,seen,await response.json(),'nominatim',commune,numero);
    }catch(fallbackError){if(fallbackError&&fallbackError.name==='AbortError')throw fallbackError;}
  }
  const finalResults=results.slice(0,30);
  addressSearchCache.set(cacheKey,finalResults);
  if(addressSearchCache.size>120)addressSearchCache.delete(addressSearchCache.keys().next().value);
  return finalResults;
}
function addrOptionsHtml(results,commune,attribute){
  if(!results.length)return '<div class="addr-opt"><div class="addr-sub">Aucune rue trouvée — vous pouvez conserver une saisie manuelle</div></div>';
  const attr=attribute||'data-addr';
  const rows=results.map(function(r){return `<div class="addr-opt" ${attr}="${addrEsc(r.address)}" style="cursor:pointer;padding:10px 12px;border-bottom:1px solid var(--brd);"><div style="font-weight:500;font-size:13px;">${addrEsc(r.address)}</div><div style="font-size:10px;color:var(--t2);margin-top:2px;">${addrEsc(r.detail)}</div></div>`;});
  rows.push(`<div class="addr-sub" style="padding:8px 12px;">${results.length} proposition${results.length>1?'s':''} dans ${addrEsc(commune)} — continuez à saisir pour affiner</div>`);
  return rows.join('');
}
function addrAutocompleteLegacy(q){
  const dd=document.getElementById('fa-dd');
  const spinner=document.getElementById('fa-spinner');
  const fa=document.getElementById('fa');
  if(!selC2){fa.placeholder='S\u00e9lectionnez d\u2019abord une commune\u2026';dd.style.display='none';return;}
  fa.placeholder='ex. 12 rue des Lilas';
  if(!q||q.trim().length<3){dd.style.display='none';addrSelected=false;return;}
  if(addrSelected){return;}
  clearTimeout(addrTimer);
  addrTimer=setTimeout(async()=>{
    spinner.style.display='inline';
    try{
      const query=encodeURIComponent(q+', '+selC2+', France');
      const url=`https://nominatim.openstreetmap.org/search?q=${query}&format=json&addressdetails=1&limit=6&countrycodes=fr`;
      const resp=await fetch(url,{headers:{'Accept-Language':'fr','User-Agent':'AGAI-pompiers/1.0'}});
      const data=await resp.json();
      if(!data.length){dd.innerHTML='<div class="addr-opt"><div class="addr-sub">Aucun r\u00e9sultat \u2014 saisie manuelle possible</div></div>';dd.style.display='block';spinner.style.display='none';return;}
      const numSaisi=extractNumero(q);
      const rulesVues=new Set();
      const opts=[];
      data.forEach(r=>{
        const a=r.address||{};
        const road=a.road||a.pedestrian||a.footway||a.street||'';
        if(!road||rulesVues.has(road))return;
        rulesVues.add(road);
        const suggestion=numSaisi+road;
        opts.push(`<div class="addr-opt" data-addr="${suggestion.replace(/"/g,'&quot;')}" style="cursor:pointer;padding:10px 12px;border-bottom:1px solid var(--brd);"><div style="font-weight:500;font-size:13px;">${suggestion}</div><div style="font-size:10px;color:var(--t2);margin-top:2px;">${r.display_name}</div></div>`);
      });
      dd.innerHTML=opts.length?opts.join(''):'<div class="addr-opt"><div class="addr-sub">Aucun r\u00e9sultat \u2014 saisie manuelle possible</div></div>';
      dd.style.display='block';
    }catch(e){dd.innerHTML='<div class="addr-opt"><div class="addr-sub">\u26a0\ufe0f Service indisponible \u2014 saisie manuelle</div></div>';dd.style.display='block';}
    spinner.style.display='none';
  },400);
}
function addrAutocomplete(q){
  const dd=document.getElementById('fa-dd');
  const spinner=document.getElementById('fa-spinner');
  const fa=document.getElementById('fa');
  if(!selC2){fa.placeholder='Sélectionnez d’abord une commune…';dd.style.display='none';return;}
  fa.placeholder='ex. 12 rue des Lilas';
  if(addrSelected&&q.trim()===addrSelectedValue)return;
  addrSelected=false;addrSelectedValue='';
  if(!q||q.trim().length<2){dd.style.display='none';return;}
  clearTimeout(addrTimer);
  if(addrRequest)addrRequest.abort();
  addrTimer=setTimeout(async function(){
    const searched=q.trim(),commune=selC2;
    addrRequest=new AbortController();
    spinner.style.display='inline';
    try{
      const results=await addressSuggestions(searched,commune,addrRequest.signal);
      if(fa.value.trim()!==searched||selC2!==commune)return;
      dd.innerHTML=addrOptionsHtml(results,commune,'data-addr');
      dd.style.display='block';
    }catch(e){
      if(!e||e.name!=='AbortError'){
        dd.innerHTML='<div class="addr-opt"><div class="addr-sub">⚠️ Service indisponible — saisie manuelle possible</div></div>';
        dd.style.display='block';
      }
    }finally{
      if(fa.value.trim()===searched)spinner.style.display='none';
    }
  },350);
}
function selectAddr(addr){
  const fa=document.getElementById('fa');
  fa.value=addr;
  document.getElementById('fa-dd').style.display='none';
  addrSelected=true;
  addrSelectedValue=addr;
  ce('a');
  // Placer le curseur en fin de texte pour pouvoir compléter
  setTimeout(()=>{fa.focus();fa.setSelectionRange(fa.value.length,fa.value.length);},50);
}
// Gestion du dropdown adresse — délégation sur le conteneur
document.addEventListener('DOMContentLoaded',function(){
  const dd=document.getElementById('fa-dd');
  if(dd){
    // Sélection par clic ou touch sur n'importe quel enfant
    function pickAddr(e){
      const opt=e.target.closest('[data-addr]');
      if(opt){
        e.preventDefault();
        e.stopPropagation();
        selectAddr(opt.dataset.addr);
      }
    }
    dd.addEventListener('pointerdown',pickAddr);
  }
});

// ── Déconnexion automatique après inactivité en arrière-plan ──
// Si l'app reste en arrière-plan (quittée, autre app, écran verrouillé) plus
// longtemps que le délai configuré, l'utilisateur est déconnecté à son retour.
// Un retour rapide (réponse à un appel, photo…) ne déconnecte pas.
let _bgTimer=null,_bgHiddenAt=0;
function _getBgLogoutMs(){
  // Délai configurable (minutes) via ASTR_CONFIG.bgLogoutMin, défaut 15 min. 0 = désactivé.
  const min=(typeof ASTR_CONFIG!=='undefined'&&ASTR_CONFIG&&typeof ASTR_CONFIG.bgLogoutMin==='number')?ASTR_CONFIG.bgLogoutMin:15;
  return min>0?min*60*1000:0;
}
document.addEventListener('visibilitychange',function(){
  const ms=_getBgLogoutMs();
  if(document.hidden){
    // L'app passe en arrière-plan : mémoriser l'heure et armer le minuteur
    _bgHiddenAt=Date.now();
    _persistSessionState({backgroundAt:_bgHiddenAt});
    if(ms>0 && CU && isSessionValid()){
      if(_bgTimer)clearTimeout(_bgTimer);
      _bgTimer=setTimeout(function(){
        if(CU){try{doLogout();}catch(e){}}
      },ms);
    }
  } else {
    // L'app revient au premier plan : annuler le minuteur en attente
    if(_bgTimer){clearTimeout(_bgTimer);_bgTimer=null;}
    // Ceinture-bretelles : sur iOS le minuteur peut être suspendu en arrière-plan.
    // On vérifie le temps réellement écoulé et on déconnecte si le délai est dépassé.
    if(ms>0 && _bgHiddenAt && CU && (Date.now()-_bgHiddenAt)>=ms){
      try{doLogout();}catch(e){}
      _bgHiddenAt=0;
      return;
    }
    _bgHiddenAt=0;
    _persistSessionState({backgroundAt:0});
  }
});
function _touchSessionActivity(){
  if(!CU||!isSessionValid()||document.hidden)return;
  if(Date.now()-_sessionLastPersist<30000)return;
  _persistSessionState({backgroundAt:0});
  const now=Date.now();
  const entry=LOGIN_HISTORY.find(function(item){return item&&item.id===SESSION_TOKEN;});
  if(entry){
    entry.lastSeenAt=new Date(now).toISOString();
    entry.actif=true;
    entry.hDeconnexion=null;
    if(now-_loginPresenceLastPush>=45000){
      _loginPresenceLastPush=now;
      if(typeof _jbEditLock!=='undefined')_jbEditLock=now;
      saveData(true);
    }
  }
}
['pointerdown','keydown','touchstart'].forEach(function(eventName){
  document.addEventListener(eventName,_touchSessionActivity,{passive:true});
});
window.setInterval(_touchSessionActivity,60000);
// Fermer le dropdown quand on clique ailleurs
document.addEventListener('click',function(e){
  const dd=document.getElementById('fa-dd');
  if(dd&&dd.style.display!=='none'&&!e.target.closest('#fa')&&!e.target.closest('#fa-dd')){
    dd.style.display='none';
  }
});

// ────────────────── COMMUNE ──────────────────
function comNom(c){return typeof c==='string'?c:c.nom;}
function comSec(c){return typeof c==='string'?'':c.secteur||'';}
function filtC(q){
  const dd=document.getElementById('cdd');const nq=nm(q);
  let list=q.trim()?COM.filter(c=>nm(comNom(c)).startsWith(nq)):[];
  if(!list.length&&q.trim())list=COM.filter(c=>nm(comNom(c)).includes(nq));
  if(!q.trim())list=COM.slice(0,30);
  if(!list.length){dd.style.display='none';return;}
  dd.innerHTML=list.slice(0,20).map(c=>{
    const nom=comNom(c);const sec=comSec(c);
    let d=nom;
    if(q.trim()&&nm(nom).startsWith(nq))d='<strong>'+nom.slice(0,q.length)+'</strong>'+nom.slice(q.length);
    const safe=nom.replace(/'/g,"&apos;");
    return '<div class="co" data-v="'+nom+'" onmousedown="sC(this.dataset.v,event)">'+d+(sec?'<span style="font-size:10px;color:var(--t2);margin-left:6px;">'+sec+'</span>':'')+'</div>';
  }).join('');
  dd.style.display='block';cddi=-1;chkR(q);
}
function sC(v,e){if(e)e.preventDefault();selC2=v;document.getElementById('ci').value=v;document.getElementById('cdd').style.display='none';document.getElementById('ciw').style.display='none';document.getElementById('cs').style.display='flex';document.getElementById('cst').textContent=v;ce('c');chkR(v);}
function chkR(c){
  const exIv=IVS.filter(iv=>iv.s==='avis-passage'&&!iv._isPilip&&nm(iv.com)===nm(c));
  const exPilp=PILP_IVS.filter(iv=>iv.s==='avis-passage'&&nm(iv.com)===nm(c));
  const b=document.getElementById('rcb');
  const total=exIv.length+exPilp.length;
  if(total>0){b.style.display='flex';document.getElementById('rct').textContent=exIv.length+' avis de passage + '+exPilp.length+' avis PILP sur '+c;}
  else b.style.display='none';
}
function rc(){
  selC2=null;addrSelected=false;addrSelectedValue='';
  document.getElementById('ci').value='';
  document.getElementById('ciw').style.display='';
  document.getElementById('cs').style.display='none';
  document.getElementById('rcb').style.display='none';
  document.getElementById('fa').value='';
  document.getElementById('fa').placeholder='Sélectionnez d\'abord une commune…';
  document.getElementById('fa-dd').style.display='none';
  const deja=document.getElementById('deja-intervenu-alert');
  if(deja){deja.innerHTML='';deja.style.display='none';}
}
document.addEventListener('click',e=>{if(!e.target.closest('#cwr'))document.getElementById('cdd').style.display='none';});
document.addEventListener('keydown',e=>{
  const dd=document.getElementById('cdd');if(dd.style.display!=='block')return;
  const ops=dd.querySelectorAll('[data-v]');
  if(e.key==='ArrowDown'){cddi=Math.min(cddi+1,ops.length-1);ops.forEach((o,i)=>o.style.background=i===cddi?'var(--rl)':'');e.preventDefault();}
  else if(e.key==='ArrowUp'){cddi=Math.max(cddi-1,0);ops.forEach((o,i)=>o.style.background=i===cddi?'var(--rl)':'');e.preventDefault();}
  else if(e.key==='Enter'&&cddi>=0){sC(ops[cddi].getAttribute('data-v'),null);e.preventDefault();}
  else if(e.key==='Escape')dd.style.display='none';
});
function ce(f){const m={'a':'fa','r':'fr','t':'ft','c':'ci'};const el=document.getElementById(m[f]||f);if(el)el.classList.remove('err');const er=document.getElementById('e'+f);if(er)er.style.display='none';document.getElementById('vb2').style.display='none';}
function addAppelPhone(){
  const box=document.getElementById('appel-phones');if(!box)return;
  const row=document.createElement('div');row.className='appel-phone-row';
  const input=document.createElement('input');input.className='fi';input.type='tel';input.placeholder='Autre numéro';input.setAttribute('data-appel-phone','');input.addEventListener('input',()=>ce('t'));
  const remove=document.createElement('button');remove.type='button';remove.className='appel-phone-remove';remove.textContent='−';remove.title='Supprimer ce numéro';remove.setAttribute('aria-label','Supprimer ce numéro');remove.onclick=()=>row.remove();
  row.append(input,remove);box.appendChild(row);input.focus();
}
function getAppelPhones(){
  const seen=new Set();
  return [...document.querySelectorAll('#appel-phones [data-appel-phone]')].map(e=>e.value.trim()).filter(v=>v&&!seen.has(v)&&seen.add(v));
}
function resetAppelPhones(){
  const box=document.getElementById('appel-phones');if(!box)return;
  box.querySelectorAll('.appel-phone-row').forEach((row,i)=>{if(i>0)row.remove();});
  const first=document.getElementById('ft');if(first)first.value='';
}
function clearAppelAnimalsError(){const err=document.getElementById('appel-animals-error');if(err)err.style.display='none';}
function selectAppelAnimalOption(el,field,value){
  const row=el&&el.closest('.appel-animal-row');if(!row)return;
  row.querySelectorAll('[data-animal-field="'+field+'"]').forEach(function(option){option.classList.remove('sel');});
  el.classList.add('sel');
  if(field==='type')row.dataset.animalType=value;
  else row.dataset.animalSituation=value;
  toggleAppelAnimalPrecision(row);
  clearAppelAnimalsError();
}
function toggleAppelAnimalPrecision(source){
  const row=source&&source.classList&&source.classList.contains('appel-animal-row')?source:source&&source.closest('.appel-animal-row');
  const precision=row&&row.querySelector('[data-appel-animal-precision]');
  if(precision)precision.style.display=(row.dataset.animalType==='NAC'||row.dataset.animalType==='Autre')?'':'none';
}
function appelAnimalChoicesHtml(){
  return '<div class="appel-animal-section"><div class="smtit">Type d’animal</div><div class="appel-animal-options">'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="type" onclick="selectAppelAnimalOption(this,\'type\',\'Chien\')">🐕 Chien</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="type" onclick="selectAppelAnimalOption(this,\'type\',\'Chat\')">🐈 Chat</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="type" onclick="selectAppelAnimalOption(this,\'type\',\'Équidé\')">🐴 Équidé</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="type" onclick="selectAppelAnimalOption(this,\'type\',\'Bovin\')">🐄 Bovin</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="type" onclick="selectAppelAnimalOption(this,\'type\',\'NAC\')">🦎 NAC</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="type" onclick="selectAppelAnimalOption(this,\'type\',\'Autre\')">🐾 Autre</button>'
    +'</div></div><input class="fi" data-appel-animal-precision type="text" placeholder="Préciser le type d’animal…" style="display:none;margin-top:6px;"/>'
    +'<div class="appel-animal-section"><div class="smtit">Situation de l’animal</div><div class="appel-animal-options">'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="situation" onclick="selectAppelAnimalOption(this,\'situation\',\'Blessé\')">🩹 Blessé</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="situation" onclick="selectAppelAnimalOption(this,\'situation\',\'Piégé\')">🪤 Piégé</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="situation" onclick="selectAppelAnimalOption(this,\'situation\',\'Agressif\')">⚠️ Agressif</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="situation" onclick="selectAppelAnimalOption(this,\'situation\',\'Divagant VP\')">🛣️ Divagant VP</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="situation" onclick="selectAppelAnimalOption(this,\'situation\',\'Errant attrapé\')">🏠 Errant attrapé</button>'
    +'<button type="button" class="smopt appel-animal-choice" data-animal-field="situation" onclick="selectAppelAnimalOption(this,\'situation\',\'Autre\')">📋 Autre</button>'
    +'</div></div>';
}
function renumberAppelAnimals(){
  document.querySelectorAll('#appel-animals .appel-animal-row').forEach(function(row,index){
    const title=row.querySelector('.appel-animal-title');if(title)title.textContent='Animal '+(index+1);
    const remove=row.querySelector('.appel-animal-remove');if(remove)remove.style.display=index===0&&document.querySelectorAll('#appel-animals .appel-animal-row').length===1?'none':'';
  });
}
function addAppelAnimal(){
  const box=document.getElementById('appel-animals');if(!box)return;
  const row=document.createElement('div');row.className='appel-animal-row';
  row.innerHTML='<button type="button" class="appel-animal-remove" aria-label="Supprimer cet animal" title="Supprimer cet animal">×</button>'
    +'<div class="appel-animal-title"></div>'+appelAnimalChoicesHtml();
  row.querySelector('.appel-animal-remove').onclick=function(){row.remove();renumberAppelAnimals();};
  box.appendChild(row);renumberAppelAnimals();
  const firstChoice=row.querySelector('[data-animal-field="type"]');if(firstChoice)firstChoice.focus();
}
function getAppelAnimals(){
  return [...document.querySelectorAll('#appel-animals .appel-animal-row')].map(function(row){
    const type=row.dataset.animalType||'';
    const precision=row.querySelector('[data-appel-animal-precision]')?.value.trim()||'';
    const situation=row.dataset.animalSituation||'';
    return{type:type,precision:precision,situation:situation};
  }).filter(a=>a.type||a.precision||a.situation);
}
function validateAppelAnimals(){
  const isAnimal=selNat&&selNat.toLowerCase().includes('sauvetage et capture d');
  if(!isAnimal){clearAppelAnimalsError();return true;}
  const rows=[...document.querySelectorAll('#appel-animals .appel-animal-row')];
  const ok=rows.length>0&&rows.every(row=>!!row.dataset.animalType);
  const err=document.getElementById('appel-animals-error');if(err)err.style.display=ok?'none':'block';
  return ok;
}
function resetAppelAnimals(){
  const box=document.getElementById('appel-animals');if(!box)return;
  box.querySelectorAll('.appel-animal-row').forEach((row,index)=>{if(index>0)row.remove();});
  const row=box.querySelector('.appel-animal-row');
  if(row){delete row.dataset.animalType;delete row.dataset.animalSituation;row.querySelectorAll('.appel-animal-choice.sel').forEach(el=>el.classList.remove('sel'));const precision=row.querySelector('[data-appel-animal-precision]');if(precision){precision.value='';precision.style.display='none';}}
  clearAppelAnimalsError();renumberAppelAnimals();
}
function addAppelExtraNid(host){
  const box=document.getElementById('extra-nids-'+host);if(!box)return;
  const row=document.createElement('div');row.className='appel-extra-nid-row';
  row.style.cssText='background:#FFF7ED;border:1px solid #FDBA74;border-radius:9px;padding:9px;margin-top:8px;';
  row.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;"><strong style="font-size:12px;color:#9A3412;">Nid supplémentaire</strong><button type="button" class="appel-phone-remove" title="Supprimer ce nid">−</button></div>'
    +'<div class="fgl">Nature *</div><div class="appel-extra-nid-options" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">'
    +'<button type="button" class="smopt" data-extra-nid-nature-choice onclick="selectExtraNidOption(this,\'nature\',\'Guêpes\')">🐝 Guêpes</button>'
    +'<button type="button" class="smopt" data-extra-nid-nature-choice onclick="selectExtraNidOption(this,\'nature\',\'Frelons européens\')">🐝 Frelons européens</button>'
    +'<button type="button" class="smopt" data-extra-nid-nature-choice onclick="selectExtraNidOption(this,\'nature\',\'Frelons asiatiques\')">🐝 Frelons asiatiques</button>'
    +'<button type="button" class="smopt" data-extra-nid-nature-choice onclick="selectExtraNidOption(this,\'nature\',\'Abeilles\')">🐝 Abeilles</button></div>'
    +'<div class="fgl">Localisation *</div><div class="appel-extra-nid-options" data-extra-nid-location-options style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"><span style="font-size:11px;color:var(--t2);">Choisissez d’abord la nature.</span></div>'
    +'<div data-extra-nid-other-wrap style="display:none;margin-bottom:8px;"><input class="fi" data-extra-nid-other placeholder="Préciser la localisation…"></div>'
    +'<div data-extra-nid-height-wrap style="display:none;margin-bottom:8px;"><div class="fgl">Hauteur estimée</div><div class="urow"><input type="number" min="0" data-extra-nid-height placeholder="ex. 5"><span class="ul2">m</span></div></div>'
    +'<div data-extra-nid-size-wrap style="display:none;"><div class="fgl">Taille du nid (facultatif)</div><div style="display:flex;flex-wrap:wrap;gap:6px;">'
    +'<button type="button" class="smopt" data-extra-nid-size-choice onclick="selectExtraNidOption(this,\'size\',\'Petit\')">Petit</button><button type="button" class="smopt" data-extra-nid-size-choice onclick="selectExtraNidOption(this,\'size\',\'Moyen\')">Moyen</button><button type="button" class="smopt" data-extra-nid-size-choice onclick="selectExtraNidOption(this,\'size\',\'Gros\')">Gros</button><button type="button" class="smopt" data-extra-nid-size-choice onclick="selectExtraNidOption(this,\'size\',\'Inconnu\')">Inconnu</button></div>'
    +'</div><div class="ferr" data-extra-nid-error style="margin-top:5px;">Choisissez la nature et la localisation de ce nid.</div>';
  row.querySelector('button').onclick=function(){row.remove();};
  box.appendChild(row);
}
function selectExtraNidOption(button,field,value){
  const row=button.closest('.appel-extra-nid-row');if(!row)return;
  row.dataset[field]=value;
  row.querySelectorAll('[data-extra-nid-'+field+'-choice]').forEach(function(choice){choice.classList.toggle('sel',choice===button);});
  if(field==='nature')renderExtraNidLocationOptions(row,value);
  if(field==='location'){
    const other=row.querySelector('[data-extra-nid-other-wrap]');if(other)other.style.display=value==='Autre'?'':'none';
    const height=row.querySelector('[data-extra-nid-height-wrap]');if(height)height.style.display=extraNidNeedsHeight(row.dataset.nature,value)?'':'none';
  }
  const err=row.querySelector('[data-extra-nid-error]');if(err)err.style.display='none';
}
function extraNidLocationChoices(nature){
  if(nature==='Frelons asiatiques')return[['🌳','Arbre'],['🏠','Toiture'],['🧱','Mur'],['🐦','Nichoir'],['📋','Autre']];
  if(nature==='Abeilles')return[['🌳','Arbre'],['🌿','Haie'],['🧱','Mur'],['🏠','Toiture'],['📋','Autre']];
  return[['🌍','Sous terre'],['🏠','Toiture'],['🌳','Arbre/Haie'],['🧱','Mur'],['📋','Autre']];
}
function extraNidNeedsHeight(nature,location){
  if(nature==='Frelons asiatiques')return !!location;
  if(nature==='Abeilles')return ['Arbre','Haie','Mur','Toiture'].includes(location);
  return ['Toiture','Arbre/Haie','Mur'].includes(location);
}
function renderExtraNidLocationOptions(row,nature){
  row.dataset.location='';row.dataset.size='';
  const box=row.querySelector('[data-extra-nid-location-options]');
  if(box)box.innerHTML=extraNidLocationChoices(nature).map(function(choice){return '<button type="button" class="smopt" data-extra-nid-location-choice onclick="selectExtraNidOption(this,\'location\',\''+choice[1]+'\')">'+choice[0]+' '+choice[1]+'</button>';}).join('');
  const other=row.querySelector('[data-extra-nid-other-wrap]');if(other)other.style.display='none';
  const height=row.querySelector('[data-extra-nid-height-wrap]');if(height)height.style.display='none';
  const size=row.querySelector('[data-extra-nid-size-wrap]');if(size)size.style.display=nature==='Frelons asiatiques'?'':'none';
  row.querySelectorAll('[data-extra-nid-size-choice]').forEach(function(choice){choice.classList.remove('sel');});
}
function resetAppelNids(){
  ['g','f','a'].forEach(function(host){const box=document.getElementById('extra-nids-'+host);if(box)box.innerHTML='';});
}
function getAppelNids(){
  const result=[];
  const host=document.getElementById('sm-g')&&document.getElementById('sm-g').offsetParent!==null?'g':document.getElementById('sm-f')&&document.getElementById('sm-f').offsetParent!==null?'f':document.getElementById('sm-a')&&document.getElementById('sm-a').offsetParent!==null?'a':'';
  if(!host)return result;
  const group=document.getElementById(host==='g'?'lg':host==='f'?'lf':'la');
  const selected=group&&group.querySelector('.smopt.sel');
  if(selected){
    let localisation=selected.dataset.val||selected.textContent.trim();
    if(localisation==='Autre')localisation=((document.getElementById(host==='g'?'lg-autre-txt':host==='f'?'lf-autre-txt':'la-autre-txt')||{}).value||'Autre').trim();
    const nature=((document.getElementById('primary-nid-type-'+host)||{}).dataset||{}).nidNature||selNat||'Nature inconnue';
    const hauteur=((document.getElementById(host==='g'?'hg-val':host==='f'?'hf-val':'ha-val')||{}).value||'').trim();
    result.push({id:'nid-1',nature,localisation,hauteur:hauteur?hauteur+' m':'',taille:host==='f'?(nidSize||''):''});
  }
  document.querySelectorAll('#extra-nids-'+host+' .appel-extra-nid-row').forEach(function(row){
    const nature=row.dataset.nature||'';
    let localisation=row.dataset.location||'';
    if(localisation==='Autre')localisation=((row.querySelector('[data-extra-nid-other]')||{}).value||'Autre').trim();
    const hauteur=((row.querySelector('[data-extra-nid-height]')||{}).value||'').trim();
    const taille=row.dataset.size||'';
    result.push({id:'nid-'+(result.length+1),nature,localisation,hauteur:hauteur?hauteur+' m':'',taille});
  });
  return result;
}
function validateAppelNids(){
  let valid=true;
  document.querySelectorAll('.appel-extra-nid-row').forEach(function(row){
    const nature=row.dataset.nature||'';
    let location=row.dataset.location||'';
    if(location==='Autre')location=((row.querySelector('[data-extra-nid-other]')||{}).value||'').trim();
    const err=row.querySelector('[data-extra-nid-error]');
    if(err)err.style.display=nature&&location?'none':'block';
    if(!nature||!location)valid=false;
  });
  return valid;
}
function appelNaturePrioritaire(nids){
  return (nids||[]).some(function(nid){return /frelons? asiatiques?/i.test(String(nid&&nid.nature||''));})?'Nid de frelons asiatiques':selNat;
}
function nidAppelLabel(nid,index){
  if(!nid)return'Nid '+(index+1);
  return 'Nid '+(index+1)+' — '+[nid.nature,nid.localisation,nid.hauteur,nid.taille].filter(Boolean).join(' · ');
}
function clearReqAvailabilityError(){const err=document.getElementById('req-dispo-error');if(err)err.style.display='none';}
function reqAvailabilityPeriodRows(){return[...document.querySelectorAll('#req-dispo-periods [data-req-dispo-period]')];}
function addReqAvailabilityPeriod(){
  const box=document.getElementById('req-dispo-periods');if(!box)return;
  const row=document.createElement('div');row.className='appel-dispo-period';row.setAttribute('data-req-dispo-period','');
  row.innerHTML='<div class="appel-dispo-period-grid"><div><div class="fgl">État</div><select class="fi" data-req-dispo-state onchange="toggleReqAvailability(this)"><option value="">Non précisé</option><option value="disponible">Disponible</option><option value="indisponible">Indisponible</option></select></div>'
    +'<div><div class="fgl">Jour concerné <span class="req">*</span></div><div class="appel-day-row"><input class="fi" type="date" data-req-dispo-day onchange="clearReqAvailabilityError()"/><button type="button" class="appel-phone-remove" data-req-dispo-remove aria-label="Supprimer cette disponibilité" title="Supprimer cette disponibilité">−</button></div></div></div>'
    +'<div class="appel-dispo-period-grid appel-dispo-time-grid"><div><div class="fgl">Précision horaire</div><select class="fi" data-req-dispo-mode onchange="toggleReqAvailability(this)" disabled><option value="journee">Toute la journée</option><option value="avant">Avant une heure</option><option value="entre">Entre deux heures</option><option value="apres">Après une heure</option></select></div>'
    +'<div data-req-dispo-hours style="display:none;"><div class="fgl" data-req-dispo-h1-label>Horaire</div><div class="appel-dispo-hours-row"><input class="fi" type="time" data-req-dispo-h1 onchange="clearReqAvailabilityError()"/><div data-req-dispo-h2-wrap style="display:none;"><input class="fi" type="time" data-req-dispo-h2 aria-label="Heure de fin" onchange="clearReqAvailabilityError()"/></div></div></div></div>';
  row.querySelector('[data-req-dispo-remove]').addEventListener('click',function(){row.remove();clearReqAvailabilityError();});
  box.appendChild(row);row.querySelector('[data-req-dispo-state]').focus();clearReqAvailabilityError();
}
function addReqAvailabilityDay(){addReqAvailabilityPeriod();}
function getReqAvailabilityDays(){return reqAvailabilityPeriodRows().map(row=>row.querySelector('[data-req-dispo-day]')?.value||'').filter(Boolean);}
function formatReqAvailabilityDay(value){
  if(!value)return'';
  const d=new Date(value+'T12:00:00');
  return isNaN(d.getTime())?value:d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function resetReqAvailability(){
  const rows=reqAvailabilityPeriodRows();rows.slice(1).forEach(row=>row.remove());
  const first=rows[0];if(first){
    const state=first.querySelector('[data-req-dispo-state]'),day=first.querySelector('[data-req-dispo-day]'),mode=first.querySelector('[data-req-dispo-mode]'),h1=first.querySelector('[data-req-dispo-h1]'),h2=first.querySelector('[data-req-dispo-h2]');
    if(state)state.value='';if(day)day.value='';if(mode)mode.value='journee';if(h1)h1.value='';if(h2)h2.value='';toggleReqAvailability(first);
  }
  clearReqAvailabilityError();
}
function toggleReqAvailability(source){
  const row=source?.closest?.('[data-req-dispo-period]')||source||reqAvailabilityPeriodRows()[0];if(!row)return;
  const state=row.querySelector('[data-req-dispo-state]')?.value||'';
  const mode=row.querySelector('[data-req-dispo-mode]')?.value||'journee';
  const hours=row.querySelector('[data-req-dispo-hours]'),second=row.querySelector('[data-req-dispo-h2-wrap]'),label=row.querySelector('[data-req-dispo-h1-label]'),modeSelect=row.querySelector('[data-req-dispo-mode]');
  if(modeSelect)modeSelect.disabled=!state;
  if(hours)hours.style.display=state&&['avant','entre','apres'].includes(mode)?'block':'none';
  if(second)second.style.display=mode==='entre'?'':'none';
  const hoursRow=row.querySelector('.appel-dispo-hours-row');if(hoursRow)hoursRow.classList.toggle('single',mode!=='entre');
  if(label)label.textContent=mode==='avant'?'Avant':mode==='apres'?'Après':'À partir de';
  clearReqAvailabilityError();
}
function readReqAvailabilityPeriods(){
  return reqAvailabilityPeriodRows().map(function(row){return{
    state:row.querySelector('[data-req-dispo-state]')?.value||'',day:row.querySelector('[data-req-dispo-day]')?.value||'',mode:row.querySelector('[data-req-dispo-mode]')?.value||'journee',
    h1:row.querySelector('[data-req-dispo-h1]')?.value||'',h2:row.querySelector('[data-req-dispo-h2]')?.value||''
  };});
}
function reqAvailabilityPeriodLabel(period){
  const horaire=period.mode==='avant'?' avant '+period.h1:period.mode==='entre'?' entre '+period.h1+' et '+period.h2:period.mode==='apres'?' après '+period.h1:' toute la journée';
  return(period.state==='indisponible'?'Indisponible':'Disponible')+' le '+formatReqAvailabilityDay(period.day)+horaire;
}
function getReqAvailability(){
  const periods=readReqAvailabilityPeriods().filter(p=>p.state&&p.day);if(!periods.length)return null;
  const states=[...new Set(periods.map(p=>p.state))],first=periods[0];
  return{state:states.length===1?states[0]:'mixte',days:periods.map(p=>p.day),mode:first.mode,h1:first.h1,h2:first.h2,periods,label:periods.map(reqAvailabilityPeriodLabel).join(' ; ')};
}
function validateReqAvailability(){
  const periods=readReqAvailabilityPeriods(),started=periods.filter(p=>p.state||p.day||p.h1||p.h2);let message='';
  for(let i=0;i<started.length&&!message;i++){
    const p=started[i],prefix=started.length>1?'Disponibilité '+(i+1)+' : ':'';
    if(!p.state)message=prefix+'préciser si le requérant est disponible ou indisponible.';
    else if(!p.day)message=prefix+'renseigner le jour concerné.';
    else if(['avant','entre','apres'].includes(p.mode)&&!p.h1)message=prefix+"renseigner l'horaire.";
    else if(p.mode==='entre'&&!p.h2)message=prefix+"renseigner l'heure de fin.";
    else if(p.mode==='entre'&&p.h2<=p.h1)message=prefix+"l'heure de fin doit être après l'heure de début.";
  }
  const err=document.getElementById('req-dispo-error');if(err){err.textContent=message;err.style.display=message?'block':'none';}
  return!message;
}
function toggleErpUrgence(){
  const checked=!!document.getElementById('chk-erp')?.checked;
  const msg=document.getElementById('erp-urgence-msg');if(msg)msg.style.display=checked?'block':'none';
}
function getInterventionPhones(iv){
  const vals=Array.isArray(iv&&iv.tels)?iv.tels:iv&&iv.tel?[iv.tel]:[];
  return [...new Set(vals.map(v=>String(v||'').trim()).filter(Boolean))];
}
function vF(){let ok=true;[['a','ea'],['r','er'],['t','et']].forEach(([id,eid])=>{const el=document.getElementById('f'+id);if(!el.value.trim()){ok=false;el.classList.add('err');document.getElementById(eid).style.display='block';}});if(!selC2){ok=false;document.getElementById('ci').classList.add('err');document.getElementById('ec').style.display='block';}if(!validateReqAvailability())ok=false;if(!validateAppelAnimals())ok=false;if(!validateAppelNids())ok=false;if(!ok)document.getElementById('vb2').style.display='block';return ok;}

// ────────────────── ENREGISTRER APPEL ──────────────────
// Capture les détails contextuels saisis dans les sous-menus de la prise d'appel.
// Lit uniquement les sous-menus visibles et les sélections actives, sans rien casser.
function _captureAppelDetails(){
  const d={};
  const txt=(id)=>{const e=document.getElementById(id);return e&&e.value?e.value.trim():'';};
  const selOf=(grpId)=>{const g=document.getElementById(grpId);if(!g)return'';const s=g.querySelector('.smopt.sel');if(!s)return'';return (s.dataset.val!==undefined&&s.dataset.val!=='')?s.dataset.val:s.textContent.replace(/^[^\w\u00C0-\u017F]+/,'').trim();};
  const vis=(id)=>{const e=document.getElementById(id);return e&&e.offsetParent!==null;};
  // Guêpes (sm-g) : localisation + hauteur
  if(vis('sm-g')){
    const loc=selOf('lg');if(loc)d['Localisation du nid']=loc==='Autre'?(txt('lg-autre-txt')||'Autre'):loc;
    const hg=txt('hg-val');if(hg)d['Hauteur']=hg+' m';
  }
  // Frelons (sm-f) : localisation + hauteur + taille
  if(vis('sm-f')){
    const loc=selOf('lf');if(loc)d['Localisation du nid']=loc==='Autre'?(txt('lf-autre-txt')||'Autre'):loc;
    const hf=txt('hf-val');if(hf)d['Hauteur']=hf+' m';
    if(nidSize)d['Taille du nid']=nidSize;
  }
  const nids=getAppelNids();
  if(nids.length)d['Nids à traiter']=nids.map(function(nid,index){return nidAppelLabel(nid,index);}).join(' ; ');
  // Essaim abeilles (sm-a) : localisation
  if(vis('sm-a')){
    const loc=selOf('la');if(loc)d['Localisation de l\u2019essaim']=loc==='Autre'?(txt('la-autre-txt')||'Autre'):loc;
  }
  // Animaux (sm-n) : type + situation
  if(vis('sm-n')){
    const animals=getAppelAnimals();
    if(animals.length)d['Animaux à prendre en charge']=animals.map(function(a,index){
      const type=(a.type==='Autre'||a.type==='NAC')&&a.precision?a.type+' ('+a.precision+')':a.type;
      return(index+1)+'. '+type+(a.situation?' — '+a.situation:'');
    }).join(' ; ');
  }
  // Inondation (sm-e) : hauteur + surface + volume
  if(vis('sm-e')){
    const he=txt('he'),se=txt('se');
    if(he)d['Hauteur d\u2019eau']=he+' m';
    if(se)d['Surface']=se+' m\u00b2';
    if(he&&se&&!isNaN(parseFloat(he))&&!isNaN(parseFloat(se)))d['Volume estim\u00e9']=(parseFloat(he)*parseFloat(se)).toFixed(1)+' m\u00b3';
  }
  const reqDispo=getReqAvailability();
  if(reqDispo)d['Disponibilité du requérant']=reqDispo.label;
  if(document.getElementById('chk-erp')?.checked)d['Établissement recevant du public']='Oui — urgence';
  return Object.keys(d).length?d:null;
}

function enr(){
  if(!vF())return;
  const h=hoA?getH(hoA):getH(N());
  const annee=new Date().getFullYear();
  const addrBase=document.getElementById('fa').value.trim(),addrComp=document.getElementById('fa2').value.trim(),addr=addrComp?addrBase+' — '+addrComp:addrBase,com=selC2;
  const pilpDirect=document.getElementById('chk-pilp-direct')&&document.getElementById('chk-pilp-direct').checked;
  // Avis en attente de rappel pour CETTE adresse et CE type : le requérant rappelle.
  const _adr=document.getElementById('fa')?document.getElementById('fa').value.trim():'';
  const nidsAppel=getAppelNids();
  const natureAppel=appelNaturePrioritaire(nidsAppel);
  const exIv=IVS.filter(iv=>iv._avisEnAttente&&!iv._isPilip&&sameInterventionAddress(iv.addr,_adr)&&nm(iv.n)===nm(natureAppel));
  const exPilp=PILP_IVS.filter(iv=>iv._avisEnAttente&&sameInterventionAddress(iv.addr,_adr)&&nm(iv.n)===nm(natureAppel));
  // Lever l'indicateur "en attente" sur ces interventions (le requérant a rappelé).
  exIv.concat(exPilp).forEach(iv=>{iv._avisEnAttente=false;iv._avisRappele=true;});
  exPilp.forEach(iv=>iv.rappels=(iv.rappels||0)+1);
  // Seul l'appel reçoit son numéro ici. Les numéros d'intervention sont attribués au passage En cours.
  const numApl=nextAplNum(annee);
  let det=document.getElementById('fo').value.trim();
  const appelDetails=_captureAppelDetails();
  const tels=getAppelPhones();
  const reqDispo=getReqAvailability();
  const erp=!!document.getElementById('chk-erp')?.checked;
  const animauxAppel=getAppelAnimals();
  // Incrémenter compteur appels
  incCallCounter();

  if(pilpDirect&&natureAppel==='Nid de frelons asiatiques'){
    PILP_IVS.unshift({
      id:nextPilpId(annee),ivRef:null,_numApl:numApl,
      // Aucun numéro d'intervention tant que la PILP reste en attente.
      n:'Nid de frelons asiatiques — PILP',addr,com,h,
      req:document.getElementById('fr').value.trim(),tel:tels[0]||'',tels,reqDispo,_nidsAppel:nidsAppel,_erp:erp,_urgence:erp,
      localisation:null,hauteur:null,reconnaissanceFaite:false,axeTir:null,obs:det,
      s:'en-attente',agr:CU.l,tireur:null,rappels:exPilp.length,
      avisIds:exPilp.map(iv=>iv.id),tl:[mkTL('en-attente',h,CU.l)]
    });
    if(CD())CD().pilpIvs=PILP_IVS;
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    const cm=document.getElementById('cm');cm.style.display='block';
    cm.innerHTML='&#x1F3AF; PILP créée — <strong>'+numsInt.numCas+'</strong><br><span style="font-family:monospace;font-size:11px;">'+numApl+'</span>';
    saveData(true);
    rF();rI();rAccueil();gS(1);
    setTimeout(()=>{cm.style.display='none';},5000);
    return;
  }
  // Enregistrement normal — id = numéro APL, numéro INT attribué à la clôture
  const newIv={id:makeInterventionRecordId(numApl),_numApl:numApl,
    n:natureAppel,_natureAppelInitiale:selNat,addr,com,h,op:CU.l,s:'en-attente',det,eng:null,_sdis:document.getElementById('chk-sdis')?.checked||false,_erp:erp,_urgence:erp,_animauxAppel:animauxAppel,_nidsAppel:nidsAppel,
    req:document.getElementById('fr').value.trim(),tel:tels[0]||'',tels,reqDispo,
    obs:'',agr:null,rappels:exIv.length,avisIds:exIv.map(iv=>iv.id),_appelDetails:appelDetails,
    tl:[mkTL('en-attente',h,CU.l)]};
  IVS.unshift(newIv);
  if(CD())CD().ivs=IVS;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : sinon un pull peut écraser le nouvel appel avant sauvegarde
  const cm=document.getElementById('cm');cm.style.display='block';
  cm.innerHTML=`✅ Appel enregistré — <strong>${numApl}</strong>
    <br><span style="font-family:monospace;font-size:11px;">&#x1F4C5; ${h} | ${CU.l}</span>
    <br><button class="btn sm" style="margin-top:6px;font-size:11px;color:#E24B4A;" onclick="annulerAppel('${newIv.id}')">✕ Annuler cet appel</button>`;
  // Réinitialiser immédiatement le formulaire pour prendre un nouvel appel
  rF();rI();rAccueil();
  gS(1);
  // Masquer le bandeau de confirmation après 5s
  setTimeout(()=>{cm.style.display='none';},5000);
}
function annulerAppel(ivId){
  const iv=IVS.find(v=>v.id===ivId);
  if(!iv||iv.s!=='en-attente')return;
  document.getElementById('mt').textContent='Annuler l’appel';
  document.getElementById('mi').textContent=iv._numApl||ivId;
  document.getElementById('mb').innerHTML=`<div>
    <div style="font-size:13px;margin-bottom:10px;">Motif d’annulation <span style="color:#E24B4A;">*</span></div>
    <textarea class="fta" id="cancel-appel-motif" placeholder="ex. Faux appel, requérant a raccroché, doublon…" style="height:70px;"></textarea>
    <div style="font-size:11px;color:var(--t2);margin:8px 0 12px;">ℹ️ L’appel sera archivé et rester dans l’historique.</div>
    <div class="brow">
      <button class="btn sm" style="background:#888;color:#fff;border-color:#888;" onclick="confirmerAnnulationAppel('${ivId}')">Confirmer l’annulation</button>
      <button class="btn pr sm" onclick="cM()">Conserver</button>
    </div>
  </div>`;
  document.getElementById('cm').style.display='none';
  openModalAtTop('cancel-appel-motif');
}
function confirmerAnnulationAppel(ivId){
  const iv=IVS.find(v=>v.id===ivId);
  if(!iv)return;
  const motif=document.getElementById('cancel-appel-motif')?.value.trim();
  if(!motif){document.getElementById('cancel-appel-motif').style.borderColor='#E24B4A';return;}
  iv.s='annulee';
  iv._annuleAppel=true; // marquer comme annulation au stade appel
  pushTL(iv,'annulee',CU.l);
  iv.tl[iv.tl.length-1].note='Appel annulé : '+motif;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : changement de statut partagé, sinon l'annulation est écrasée au prochain pull
  cM();rF();gS(1);rI();rAccueil();
}
function rF(){
  selNat=null;selC2=null;hoA=null;nidSize=null;addrSelected=false;addrSelectedValue='';
  _natureLastTapLabel='';_natureLastTapAt=0;
  document.getElementById('bn').disabled=true;
  document.getElementById('sn').value='';
  ['fa','fa2','fr','fo'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  resetAppelPhones();
  resetReqAvailability();
  resetAppelAnimals();
  resetAppelNids();
  document.getElementById('fa').placeholder='Sélectionnez d’abord une commune…';
  document.getElementById('fa-dd').style.display='none';
  ['sm-g','sm-f','sm-a','sm-n','sm-e'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  ['hg-val','hf-val','lf-autre-txt','lg-autre-txt','he','se'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  ['hgb','hfb','lfab','lgab','laab','tapb','vb3'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  document.querySelectorAll('.smopt.sel,.szo.sel').forEach(o=>o.classList.remove('sel'));
  rc();rNatures(NAT);
  document.getElementById('rcb').style.display='none';
  document.getElementById('pilp-appel-chk').style.display='none';
  const pc=document.getElementById('chk-pilp-direct');if(pc)pc.checked=false;
  const cm=document.getElementById('cm');if(cm)cm.style.display='none';
  const sdis=document.getElementById('chk-sdis');if(sdis)sdis.checked=false;
  const erp=document.getElementById('chk-erp');if(erp)erp.checked=false;
  toggleErpUrgence();
}
function updateH(){document.getElementById('hv').textContent=hoA?getH(hoA):getH(N());}
function cpH(){const v=document.getElementById('hv').textContent;if(navigator.clipboard)navigator.clipboard.writeText(v).catch(()=>{});const b=document.querySelector('.cpbtn');if(b){b.textContent='✅';setTimeout(()=>b.textContent='&#x1F4CB; Copier',1500);}}

