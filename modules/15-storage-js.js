// === MODULE: storage.js ===
// ══════════════════════════════════════════════════════
// PERSISTANCE localStorage
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// CONTRÔLE DE VERSION — bandeau + rechargement si inactif
// ══════════════════════════════════════════════════════
// À INCRÉMENTER À CHAQUE DÉPLOIEMENT D'UNE NOUVELLE VERSION.
// Fonctionnement :
//   1. L'app vérifie périodiquement si une version plus récente est en ligne.
//   2. Si oui → un bandeau invite l'utilisateur à recharger (il garde la main).
//   3. En plus, si l'utilisateur est INACTIF depuis 2 min ET qu'aucune saisie
//      n'est en cours, l'app se recharge d'elle-même.
// Un appel ou une saisie en cours ne peut donc jamais être interrompu.
const APP_VERSION='20260820-itineraire-selection-personnelle-145';
const _VER_CHECK_MS=2*60*1000;      // contrôle toutes les 2 minutes
const _VER_IDLE_MS=2*60*1000;       // inactivité requise pour un rechargement auto
let _verNouvelle=null;              // version détectée en ligne
let _verReloading=false;
let _verLastActivity=Date.now();

// Toute action de l'utilisateur repousse le rechargement automatique
['mousedown','keydown','touchstart','scroll'].forEach(function(evt){
  document.addEventListener(evt,function(){_verLastActivity=Date.now();},{passive:true,capture:true});
});

// Une saisie est-elle en cours ? (protection contre la perte de données)
function _saisieEnCours(){
  const mo=document.getElementById('mo');
  if(mo&&mo.style.display==='flex')return true;
  const fa=document.getElementById('fa');
  if(fa&&fa.value&&fa.value.trim())return true;
  const panels=['act-form-panel','fmpa-form-panel','formstag-form-panel','formform-form-panel'];
  for(const id of panels){
    const p=document.getElementById(id);
    if(p&&p.style.display!=='none')return true;
  }
  const ae=document.activeElement;
  if(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA')&&ae.value&&ae.value.trim())return true;
  // Une étape de prise d'appel est-elle engagée ?
  if(typeof selNat!=='undefined'&&selNat)return true;
  return false;
}

async function _verReload(){
  if(_verReloading)return;
  if(_saisieEnCours()&&!window.confirm('Une saisie est en cours. Actualiser quand même pour charger la dernière version ?'))return;
  _verReloading=true;
  const button=document.getElementById('ver-reload-button');
  if(button){button.disabled=true;button.textContent='Actualisation…';}
  try{
    if('serviceWorker' in navigator){
      const registration=await navigator.serviceWorker.getRegistration();
      if(registration)await registration.update();
    }
  }catch(e){/* la mise à jour continue même sans service worker */}
  const url=new URL(window.location.href);
  url.searchParams.set('appVersion',_verNouvelle||APP_VERSION);
  url.searchParams.set('_refresh',Date.now());
  window.location.replace(url.toString());
}

function _showVersionBanner(){
  if(document.getElementById('ver-banner'))return;
  const b=document.createElement('div');
  b.id='ver-banner';
  b.setAttribute('role','status');
  b.setAttribute('aria-live','polite');
  b.style.cssText='position:fixed;left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));'
    +'bottom:max(10px,env(safe-area-inset-bottom));z-index:99998;background:#0369A1;color:#fff;border-radius:12px;'
    +'padding:11px 14px;font-size:13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;'
    +'justify-content:center;box-shadow:0 4px 18px rgba(0,0,0,.3);';
  b.innerHTML='<span><strong>&#x1F504; Nouvelle version disponible.</strong> Actualisez pour profiter des dernières corrections.</span>'
    +'<button id="ver-reload-button" type="button" onclick="_verReload()" style="background:#fff;color:#0369A1;border:none;border-radius:8px;'
    +'padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;">Actualiser maintenant</button>'
    +'<button onclick="document.getElementById(\'ver-banner\').remove()" style="background:transparent;'
    +'color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:8px;padding:7px 10px;font-size:12px;cursor:pointer;">Plus tard</button>';
  document.body.appendChild(b);
}

async function _fetchRemoteVersion(){
  let manifestVersion=null;
  // La version modulaire publie ce petit manifeste à côté d'index.html.
  try{
    const manifestUrl=new URL('version.json',document.baseURI);
    manifestUrl.searchParams.set('_',Date.now());
    const response=await fetch(manifestUrl.toString(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
    if(response.ok){
      const manifest=await response.json();
      if(manifest&&typeof manifest.version==='string')manifestVersion=manifest.version.trim();
    }
  }catch(e){/* le contrôle du fichier HTML continue ci-dessous */}

  // Toujours contrôler aussi le fichier HTML autonome. Ainsi, un ancien
  // version.json resté sur le serveur ne masque pas une nouvelle page chargée.
  try{
    const pageUrl=new URL(window.location.href);
    pageUrl.searchParams.set('_versionCheck',Date.now());
    const response=await fetch(pageUrl.toString(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
    if(response.ok){
      const source=await response.text();
      const match=source.match(/const APP_VERSION='([^']+)'/);
      if(match&&match[1])return match[1].trim();
    }
  }catch(e){/* la version du manifeste reste utilisable */}
  return manifestVersion;
}

async function _checkVersion(){
  if(_verReloading)return;
  try{
    const distante=await _fetchRemoteVersion();
    if(distante&&distante!==APP_VERSION){
      _verNouvelle=distante;
      _showVersionBanner();          // 1. prévenir tout de suite
      _tryAutoReloadIfIdle();        // 2. recharger seul si inactif
    }
  }catch(e){/* hors ligne : on réessaiera */}
}

// Recharge automatiquement SI : nouvelle version détectée, aucune saisie en cours,
// et utilisateur inactif depuis _VER_IDLE_MS.
function _tryAutoReloadIfIdle(){
  if(!_verNouvelle||_verReloading)return;
  const inactif=(Date.now()-_verLastActivity)>=_VER_IDLE_MS;
  if(inactif&&!_saisieEnCours())_verReload();
}

function _startVersionCheck(){
  setInterval(_checkVersion,_VER_CHECK_MS);
  // Tant qu'une nouvelle version est en attente, retenter le rechargement auto
  setInterval(_tryAutoReloadIfIdle,30000);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){_verLastActivity=Date.now();_checkVersion();}
  });
  window.addEventListener('online',_checkVersion);
  setTimeout(_checkVersion,3000);
}


const STORAGE_KEY='agai_data' // clé partagée entre toutes les versions;


function savePdfDocuments(ivId) {
  // Sauvegarde les documents HTML dans l'IV pour consultation ultérieure
  saveAutorisationData(ivId);
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const dataList=Array.isArray(iv._autorisationNids)?iv._autorisationNids.filter(Boolean):(iv._autorisationData?[iv._autorisationData]:[]);
  if(!dataList.length)return;
  iv._pdfAutorisations=[];iv._pdfAttestations=[];
  dataList.forEach(function(data,index){
    if(!data)return;
    iv._pdfAutorisations[index]=_buildAutorisationHTML(ivId,'autorisation',index);
    iv._pdfAttestations[index]=_buildAutorisationHTML(ivId,'attestation',index);
  });
  iv._pdfAutorisation=iv._pdfAutorisations[0]||'';
  iv._pdfAttestation=iv._pdfAttestations[0]||'';
  saveData();
}

function _buildAutorisationHTML(ivId, docType, nidIndex) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return '';
  const activeIndex=Number.isInteger(nidIndex)?nidIndex:(Number.isInteger(_autorisationActiveNid[ivId])?_autorisationActiveNid[ivId]:0);
  const saved = autorisationDataForNid(iv,activeIndex);
  if(!saved||(!saved.nom&&!saved.prenom&&!saved.adresse))return '';
  const cas = getAvisPassageCaserne(iv);
  let utNom = cas ? cas.nom : ''; utNom = utNom.replace(/^UT\s+/i,'').trim();
  const caserneNom = cas ? cas.nom : '';
  const type = saved.demandeurType || 'Propri\u00e9taire';
  const autreTexte = saved.autreTexte || '';
  const nomComplet = ((saved.prenom||'')+' '+(saved.nom||'')).trim();
  const adresse = saved.adresse||''; const commune = saved.commune||'';
  const dateFr = saved.date ? saved.date.split('-').reverse().join('/') : '';
  const sigDateFr = saved.sigDate ? saved.sigDate.split('-').reverse().join('/') : dateFr;
  const sigLieu = saved.sigLieu||commune;
  const objet = saved.objet||''; const nature = saved.nature||'';
  const travaux = saved.travaux||[];
  const travauxAutreChk = saved.travauxAutreChk||false;
  const travauxAutreTxt = saved.travauxAutreTxt||'';
  const sigDataUrl = saved.signature||null;

  const TFORM=['D\u00e9pose d\u2019une antenne','D\u00e9montage de t\u00f4les','D\u00e9pose de tuiles','D\u00e9coupe d\u2019un panneau','R\u00e9alisation d\u2019une trou\u00e9e dans un mur ou une chemin\u00e9e'];
  const TLBL=['La d\u00e9pose d\u2019une antenne','Le d\u00e9montage de t\u00f4les','La d\u00e9pose de tuiles','La d\u00e9coupe d\u2019un panneau','La r\u00e9alisation d\u2019une trou\u00e9e dans un mur ou une chemin\u00e9e'];

  function st(txt,strike){return strike?'<span style="text-decoration:line-through;color:#aaa;">'+txt+'</span>':txt;}

  const allItems=TLBL.slice();
  if(travauxAutreChk&&travauxAutreTxt)allItems.push('Autre\u00a0: '+travauxAutreTxt);
  const pc=Math.ceil(allItems.length/3);
  const cols=[allItems.slice(0,pc),allItems.slice(pc,pc*2),allItems.slice(pc*2)];
  const trHtml='<table style="width:100%;border:none;margin:4px 0;"><tr>'+cols.map(function(col){
    return '<td style="width:33%;vertical-align:top;border:none;padding:0 4px 0 0;"><ul style="margin:0;padding-left:12px;">'+col.map(function(lbl){
      const fi=TLBL.indexOf(lbl);
      const ok=fi>=0?travaux.includes(TFORM[fi]):(travauxAutreChk&&!!travauxAutreTxt);
      return '<li style="margin:2px 0;font-size:9.5pt;'+(ok?'':'text-decoration:line-through;color:#999;')+'">'+lbl+'</li>';
    }).join('')+'</ul></td>';
  }).join('')+'</tr></table>';

  const trCoches=TLBL.filter(function(l,i){return travaux.includes(TFORM[i]);});
  if(travauxAutreChk&&travauxAutreTxt)trCoches.push('Autre\u00a0: '+travauxAutreTxt);

  const prop17='La remise en \u00e9tat des \u00e9l\u00e9ments d\u00e9plac\u00e9s ou endommag\u00e9s reste \u00e0 la charge du '
    +'<strong>'+st('PROPRI\u00c9TAIRE',type!=='Propri\u00e9taire')+'</strong> ou du '
    +'<strong>'+st('LOCATAIRE.',type!=='Locataire')+'</strong>';

  const sigImg=sigDataUrl
    ?'<img src="'+sigDataUrl+'" style="height:45px;max-width:180px;display:block;margin-top:4px;">'
    :'<div style="height:45px;border-bottom:1px solid #000;width:180px;margin-top:4px;"></div>';

  const logoSrc=_getLogoSrc();

  const css='<style>@page{size:210mm 148mm;margin:0;}*{box-sizing:border-box;}'
    +'html,body{min-height:100%;}'
    +'html{background:#666;}'
    +'body{font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#000;'
    +'width:210mm;min-height:148mm;margin:15px auto;padding:10mm;'
    +'background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.5);}'
    +'.hdr{position:relative;display:flex;align-items:center;margin-bottom:6px;min-height:42px;}'
    +'.hdr img{position:absolute;left:0;top:0;height:15mm;max-width:60mm;width:auto;object-fit:contain;}'
    +'.hdr-r{width:100%;text-align:center;}'
    +'.hdr-r .ut-sub{font-size:12pt;}'
    +'.hdr-r .utn{font-size:14pt;font-weight:bold;}'
    +'h2{text-align:center;font-size:14pt;font-weight:bold;text-decoration:underline;margin:4px 0 6px 0;}'
    +'p{margin:0;line-height:1.5;font-size:10pt;}'
    +'.sig-t{width:100%;border-collapse:collapse;margin-top:6px;}'
    +'.sig-t td{border:1px solid #000;padding:5px 6px;vertical-align:top;width:50%;font-size:10pt;}'
    +'@media print{html{background:none;}body{margin:0;box-shadow:none;width:100%;min-height:auto;}}</style>';

  const hdr='<div class="hdr"><img src="'+logoSrc+'" alt="Logo">'
    +'<div class="hdr-r"><div class="ut-sub">Unit\u00e9 territoriale de</div>'
    +'<div class="utn">'+utNom+'</div></div></div>';

  const dLine='A la demande de (Nom du '
    +st('propri\u00e9taire',type!=='Propri\u00e9taire')+', '
    +st('du locataire',type!=='Locataire')+', '
    +st('autre',type!=='Autre')
    +')\u00a0: <strong>'+nomComplet+(type==='Autre'?' ('+autreTexte+')':'')+'</strong>';

  const sigTbl='<table class="sig-t"><tr>'
    +'<td><strong>Noms des intervenants</strong><br><br>'+caserneNom+'</td>'
    +'<td><strong>ACCORD DU PROPRI\u00c9TAIRE OU LOCATAIRE</strong><br><br>'
    +'Fait le\u00a0: <strong>'+sigDateFr+'</strong>'+(sigLieu?'\u00a0\u00e0\u00a0<strong>'+sigLieu+'</strong>':'')
    +'<br><br>Signature\u00a0:<br>'+sigImg+'</td></tr></table>';

  const pAuto='<div>'+hdr
    +'<h2>AUTORISATION D\u2019INTERVENTION</h2>'
    +'<p>'+dLine+'</p>'
    +'<p>Les sapeurs-pompiers se sont pr\u00e9sent\u00e9s au\u00a0<em>(adresse)</em>\u00a0: <strong>'+adresse+'</strong></p>'
    +'<p>Commune\u00a0<strong>'+commune+'</strong>, \u00e0 la date du\u00a0: <strong>'+dateFr+'</strong></p>'
    +'<p>Pour\u00a0<em>(objet de l\u2019intervention)</em>\u00a0: <strong>'+objet+'</strong></p>'
    +'<p>Lors de cette intervention a \u00e9t\u00e9 r\u00e9alis\u00e9\u00a0<em>(nature)</em>\u00a0: <strong>'+nature+'</strong></p>'
    +'<p><strong>Avant le d\u00e9but</strong>, le propri\u00e9taire/locataire/autre a \u00e9t\u00e9 inform\u00e9 que la r\u00e9alisation n\u00e9cessite<sup>(1)</sup>\u00a0:</p>'
    +trHtml
    +'<p>'+prop17+'</p>'
    +sigTbl
    +'<p style="font-size:8pt;color:#888;margin-top:4px;"><sup>(1)</sup> Rayer les mentions inutiles</p>'
    +'</div>';

  const trCochTxt=trCoches.length?'<br>Travaux r\u00e9alis\u00e9s\u00a0: <strong>'+trCoches.join(', ')+'</strong>.':'';
  const pAttest='<div>'+hdr
    +'<h2>ATTESTATION D\u2019INTERVENTION</h2>'
    +'<p>Suite \u00e0 la demande du '
    +st('propri\u00e9taire',type!=='Propri\u00e9taire')+', du '
    +st('locataire',type!=='Locataire')+', '+st('autre',type!=='Autre')+'\u00a0: '
    +'<strong>'+nomComplet+(type==='Autre'?' ('+autreTexte+')':'')+'</strong></p>'
    +'<p>Nous soussign\u00e9s, la Communaut\u00e9 d\u2019Agglom\u00e9ration B\u00e9thune-Bruay, Artois Lys Romane, certifions que l\u2019unit\u00e9 territoriale de <strong>'+utNom+'</strong>, est intervenue au\u00a0: <strong>'+adresse+'</strong></p>'
    +'<p>Commune\u00a0<strong>'+commune+'</strong>, \u00e0 la date du\u00a0: <strong>'+dateFr+'</strong></p>'
    +'<p>Pour\u00a0<em>(objet)</em>\u00a0: <strong>'+objet+'</strong></p>'
    +'<p>Nature\u00a0: <strong>'+nature+'</strong>'+trCochTxt+'</p>'
    +'<p>'+prop17+'</p>'
    +sigTbl
    +'<p style="font-size:8pt;color:#888;margin-top:4px;"><sup>(1)</sup> Rayer les mentions inutiles</p>'
    +'</div>';

  const page = docType==='autorisation' ? pAuto : pAttest;
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'+css+'</head><body>'+page+'</body></html>';
}

function viewPdfDocument(ivId, docType, nidIndex) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const index=Number.isInteger(nidIndex)?nidIndex:0;
  let html=docType==='autorisation'
    ?(Array.isArray(iv._pdfAutorisations)?iv._pdfAutorisations[index]:index===0?iv._pdfAutorisation:'')
    :(Array.isArray(iv._pdfAttestations)?iv._pdfAttestations[index]:index===0?iv._pdfAttestation:'');
  if(!html) {
    // Régénérer à la volée si pas encore sauvegardé
    html = _buildAutorisationHTML(ivId, docType,index);
  }
  if(!html){showToast('Document non disponible','warn');return;}
  openIframeModal(html);
  // Ajouter bouton imprimer — dans l'iframe via srcdoc
  // Ajouter bouton imprimer
}

function getAvisPassageTimelineEntry(iv){
  const entries=(iv&&Array.isArray(iv.tl)?iv.tl:[]).filter(function(entry){return entry&&entry.s==='avis-passage'&&entry.h;});
  return entries.length?entries[entries.length-1]:null;
}

function getAvisPassageHour(iv){
  if(!iv)return '';
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(String(iv._avisPassageHeure||'')))return iv._avisPassageHeure;
  const raw=String(iv._avisPassageAt||(getAvisPassageTimelineEntry(iv)||{}).h||'');
  return /^\d{8}_\d{4}/.test(raw)?raw.slice(9,11)+':'+raw.slice(11,13):'';
}

function getAvisPassageDateFr(iv){
  if(!iv)return '';
  let raw=String(iv._avisPassageDate||iv._avisPassageAt||(getAvisPassageTimelineEntry(iv)||{}).h||iv.h||'').replace(/\D/g,'').slice(0,8);
  if(raw.length!==8)return '';
  return raw.slice(6,8)+'/'+raw.slice(4,6)+'/'+raw.slice(0,4);
}

function getAvisPassageCaserne(iv){
  const cid=(iv&&(iv.caserneId||iv._caserneId))||(typeof CURRENT_CASERNE_ID!=='undefined'?CURRENT_CASERNE_ID:'');
  if(typeof CASERNES!=='undefined'&&Array.isArray(CASERNES)){
    const found=CASERNES.find(function(item){return item&&item.id===cid;});
    if(found)return found;
  }
  if(typeof CC==='function')return CC();
  return null;
}
function getAvisPassageAstreintePhone(iv){
  const caserne=getAvisPassageCaserne(iv);
  return formatCaserneAstreintePhone(caserne&&(caserne.astreintePhone||caserne.telAstreinte)||'')||'—';
}
function avisPassageIntervenantName(iv,login){
  if(!login)return '';
  if(typeof USERS!=='undefined'&&Array.isArray(USERS)){
    const user=USERS.find(function(item){return item&&item.l===login;});
    if(user)return typeof fullName==='function'?fullName(user):((user.nom||'')+' '+(user.prenom||'')).trim();
  }
  const snapshots=[];
  if(iv){
    if(Array.isArray(iv._equipage1))snapshots.push.apply(snapshots,iv._equipage1);
    if(Array.isArray(iv._equipage2))snapshots.push.apply(snapshots,iv._equipage2);
    (Array.isArray(iv._releves)?iv._releves:[]).forEach(function(releve){
      if(releve&&Array.isArray(releve.nouvelEquipage))snapshots.push.apply(snapshots,releve.nouvelEquipage);
    });
  }
  const snapshot=snapshots.find(function(item){return item&&item.login===login;});
  return snapshot&&((snapshot.nom||'')+' '+(snapshot.prenom||'')).trim()||login;
}
function getAvisPassageIntervenants(iv){
  if(!iv)return[];
  const logins=[],seen=new Set();
  const add=function(login){if(login&&!seen.has(login)){seen.add(login);logins.push(login);}};
  if(typeof interventionMainReportCrew==='function')interventionMainReportCrew(iv).forEach(function(member){add(member&&member.login);});
  else add(iv.agr);
  (Array.isArray(iv._equipage1)?iv._equipage1:[]).forEach(function(member){add(member&&member.login);});
  add(iv._agr2);
  (Array.isArray(iv._equipage2)?iv._equipage2:[]).forEach(function(member){add(member&&member.login);});
  (Array.isArray(iv._releves)?iv._releves:[]).forEach(function(releve){
    (releve&&Array.isArray(releve.nouvelEquipage)?releve.nouvelEquipage:[]).forEach(function(member){add(member&&member.login);});
  });
  return logins.map(function(login){return avisPassageIntervenantName(iv,login);}).filter(Boolean);
}

function _buildAvisPassageBody(iv){
  if(!iv||!iv._avisPassage)return '';
  const logoSrc=_getLogoSrc();
  const caserne=getAvisPassageCaserne(iv);
  const unite=escHtml(String(caserne&&caserne.nom||'').replace(/^UT\s+/i,'').trim()||'—');
  const caserneNom=escHtml(String(caserne&&caserne.nom||'—'));
  const astreintePhone=escHtml(getAvisPassageAstreintePhone(iv));
  const dateFr=getAvisPassageDateFr(iv)||'—';
  const heure=getAvisPassageHour(iv)||'—';
  const nom=escHtml(iv.req||'—');
  const objet=escHtml(iv.n||'—');
  const adresse=escHtml([iv.addr||'',iv.addrComp||'',iv.com||''].filter(Boolean).join(', ')||'—');
  return '<div class="avis-document" style="font-family:Calibri,Arial,sans-serif;color:#000;font-size:11pt;">'
    +'<div style="height:18mm;position:relative;display:flex;align-items:flex-start;margin-bottom:1mm;"><img src="'+logoSrc+'" alt="Logo" style="position:absolute;left:0;top:0;width:62mm;height:15mm;object-fit:contain;object-position:left top;"><div style="width:100%;text-align:center;font-size:12pt;line-height:1.25;padding-top:1mm;">Unité territoriale de<br><strong style="font-size:14pt;">'+unite+'</strong></div></div>'
    +'<h2 style="text-align:center;font-size:16pt;font-weight:700;text-decoration:underline;margin:1mm 0 5mm;">AVIS DE PASSAGE</h2>'
    +'<table class="avis-main-table" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 5mm;page-break-inside:avoid;">'
    +'<tr><td style="width:42%;border:1px solid #000;padding:3mm 3.5mm;font-weight:600;">Date du passage :</td><td style="border:1px solid #000;padding:3mm 3.5mm;text-align:center;font-weight:700;">'+dateFr+'</td></tr>'
    +'<tr><td style="border:1px solid #000;padding:3mm 3.5mm;font-weight:600;">Objet de l’intervention</td><td style="border:1px solid #000;padding:3mm 3.5mm;text-align:center;">'+objet+'</td></tr>'
    +'<tr><td style="border:1px solid #000;padding:3mm 3.5mm;font-weight:600;">Nom du propriétaire ou du locataire</td><td style="border:1px solid #000;padding:3mm 3.5mm;text-align:center;">'+nom+'</td></tr>'
    +'<tr><td style="border:1px solid #000;padding:3mm 3.5mm;font-weight:600;">Adresse :</td><td style="border:1px solid #000;padding:3mm 3.5mm;text-align:center;">'+adresse+'</td></tr>'
    +'</table>'
    +'<p style="font-size:12pt;line-height:1.4;text-align:justify;margin:0 0 5mm;">Suite à votre appel téléphonique, les sapeurs-pompiers se sont présentés à votre domicile à <strong>'+heure.replace(':',' h ')+' min</strong> pour intervenir.</p>'
    +'<table class="avis-followup-table" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;page-break-inside:avoid;">'
    +'<tr><td style="width:46%;border:1px solid #000;padding:3mm 3.5mm;vertical-align:top;"><strong>Noms des intervenants</strong><div style="margin-top:2.5mm;line-height:1.35;">'+caserneNom+'</div></td>'
    +'<td style="border:1px solid #000;padding:3mm 3.5mm;vertical-align:middle;line-height:1.4;">Merci de rappeler au <strong>'+astreintePhone+'</strong> afin de confirmer votre demande d’intervention et reprendre rendez-vous.</td></tr>'
    +'</table>'
    +'</div>';
}

function _buildAvisPassageHTML(ivId){
  const iv=IVS.find(function(item){return item.id===ivId;})||PILP_IVS.find(function(item){return item.id===ivId;});
  const body=_buildAvisPassageBody(iv);if(!body)return '';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Avis de passage</title><style>'
    +'@page{size:210mm 148mm;margin:0;}*{box-sizing:border-box;}html{background:#666;}body{width:210mm;min-height:148mm;margin:15px auto;padding:10mm;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.5);}'
    +'.no-print{position:fixed;top:10px;right:10px;z-index:10;padding:7px 12px;border:0;border-radius:6px;background:#7E22CE;color:#fff;cursor:pointer;}@media print{html{background:none;}body{margin:0;box-shadow:none;}.no-print{display:none;}}'
    +'</style></head><body><button class="no-print" onclick="window.print()">Imprimer / PDF</button>'+body+'</body></html>';
}

function viewAvisPassageDocument(ivId){
  const html=_buildAvisPassageHTML(ivId);
  if(!html){showToast('Avis de passage non disponible.','warn');return;}
  openIframeModal(html,ivId);
}



