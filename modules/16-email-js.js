// === MODULE: email.js ===
// ═══════════════════════════════════════════════════
// EMAILJS — configuration
// ═══════════════════════════════════════════════════
const EMAILJS_SERVICE_ID  = 'service_sobgp7b';
const EMAILJS_TEMPLATE_ID = 'template_q7mx8jl';
const EMAILJS_PUBLIC_KEY  = 'caUbVGWr3zo-ccQ_j';
const EMAILJS_FROM        = 'interventions_pompiers_cabbalr@bethune-bruay.fr';

function _loadEmailJS(cb) {
  if (window.emailjs) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  s.onload = function() { emailjs.init(EMAILJS_PUBLIC_KEY); cb(); };
  s.onerror = function() { showToast('Impossible de charger EmailJS', 'error'); };
  document.head.appendChild(s);
}

function _loadScript(src, cb) {
  if (document.querySelector('script[src="'+src+'"]')) { cb(); return; }
  const s = document.createElement('script');
  s.src = src; s.onload = cb;
  document.head.appendChild(s);
}

function _loadScript(src, cb) {
  if (document.querySelector('script[src="'+src+'"]')) { cb(); return; }
  const s = document.createElement('script');
  s.src = src; s.onload = cb; s.onerror = function(){ cb(null); };
  document.head.appendChild(s);
}

// Génération PDF haute qualité — A5 paysage
function _genPdfHaute(html, callback) {
  // Détecter format : A4 portrait si "size:A4" dans le HTML, sinon A5 paysage
  const isA4 = html.indexOf('size:A4') !== -1;
  // 96dpi: 1mm = 3.7795px
  // A4 portrait: 210×297mm = 794×1123px
  // A5 paysage:  210×148mm = 794×559px
  const PX_W = 794;
  const PX_H = isA4 ? 1123 : 559;
  const pdfW = 210, pdfH = isA4 ? 297 : 148;
  const orientation = isA4 ? 'portrait' : 'landscape';
  const format = isA4 ? 'a4' : 'a5';

  const htmlPatched = html.replace('</style>',
    '.page{width:'+PX_W+'px!important;min-height:'+PX_H+'px!important;'
    +'padding:'+(isA4?'38px 40px':'38px')+'!important;margin:0!important;box-shadow:none!important;}'
    +'body{width:'+PX_W+'px!important;background:#fff!important;margin:0!important;}'
    +'</style>');

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:'+PX_W+'px;height:'+(isA4?PX_H*2:PX_H)+'px;border:none;visibility:hidden;';
  document.body.appendChild(iframe);

  iframe.onload = function() {
    _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', function() {
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', function() {
        setTimeout(function() {
          const body = iframe.contentDocument.body;
          // Utiliser .page si disponible, sinon body entier
          let pages = Array.from(iframe.contentDocument.querySelectorAll('.page'));
          if(!pages || pages.length === 0) pages = [body];
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF({ orientation:orientation, unit:'mm', format:format, compress:true });
          let pageIdx = 0;
          function processPage() {
            if(pageIdx >= pages.length){ 
              const b64 = pdf.output('datauristring').split(',')[1];
              document.body.removeChild(iframe);
              callback(b64);
              return;
            }
            const target = pages[pageIdx];
            html2canvas(target, {
              scale: 3, useCORS: true, allowTaint: false, logging: false,
              width: PX_W, windowWidth: PX_W, backgroundColor: '#ffffff',
              imageTimeout: 0, removeContainer: true
            }).then(function(canvas) {
              const imgData = canvas.toDataURL('image/jpeg', 0.92);
              if(pageIdx > 0) pdf.addPage([pdfW, pdfH], orientation);
              pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, '', 'FAST');
              pageIdx++;
              processPage();
            }).catch(function(err) {
              console.error('html2canvas page '+pageIdx, err);
              // Fallback : essayer avec body entier
              if(target !== body){
                html2canvas(body, {
                  scale:2, useCORS:true, allowTaint:false, logging:false,
                  width:PX_W, windowWidth:PX_W, backgroundColor:'#ffffff'
                }).then(function(canvas2){
                  const imgData2 = canvas2.toDataURL('image/jpeg', 0.90);
                  if(pageIdx > 0) pdf.addPage([pdfW, pdfH], orientation);
                  pdf.addImage(imgData2, 'JPEG', 0, 0, pdfW, pdfH, '', 'FAST');
                  const b64 = pdf.output('datauristring').split(',')[1];
                  document.body.removeChild(iframe);
                  callback(b64);
                }).catch(function(err2){
                  console.error('fallback failed', err2);
                  document.body.removeChild(iframe);
                  callback(null);
                });
              } else {
                document.body.removeChild(iframe);
                callback(null);
              }
            });
          }
          processPage();
        }, 800);
      });
    });
  };

  iframe.contentDocument.open();
  iframe.contentDocument.write(htmlPatched);
  iframe.contentDocument.close();
}

function envoyerAttestationMail(ivId) {
  saveAutorisationData(ivId);
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const cas = CC();
  const emailCaserne = cas && cas.email ? cas.email : '';
  const saved = _autorisationData[ivId] || iv._autorisationData || {};
  const nomComplet = ((saved.prenom||'')+' '+(saved.nom||'')).trim();
  const dateFr = saved.date ? saved.date.split('-').reverse().join('/') : '';
  const commune = saved.commune || iv.com || '';
  const htmlAttest = _buildAutorisationHTML(ivId, 'attestation');
  if (!htmlAttest) { showToast('Remplissez d\u2019abord le formulaire', 'warn'); return; }

  document.getElementById('mt').textContent = 'Envoyer l\u2019attestation par mail';
  document.getElementById('mi').textContent = iv.n + ' \u2014 ' + dateFr;
  document.getElementById('mb').innerHTML =
    '<div style="padding:4px 0;">'
    + (emailCaserne ? ''
      : '<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#854F0B;">'
        + '\u26A0\uFE0F Aucun e-mail configuré pour cette caserne. Allez dans la vue \uD83C\uDF10 Global.'
        + '</div>')
    + '<div class="fg"><div class="fgl">Destinataire (adresse du requérant)</div>'
    + '<input class="fi" id="mail-to" type="email" placeholder="prenom.nom@exemple.fr"/></div>'
    + '<div class="fg"><div class="fgl">Sujet</div>'
    + '<input class="fi" id="mail-subj" type="text"/></div>'

    + '<div id="mail-status" style="margin-bottom:8px;font-size:12px;min-height:18px;"></div>'
    + '<div class="brow" style="flex-wrap:wrap;gap:6px;">'
    + '<button class="btn sm" style="background:#E67E22;color:#fff;" id="btn-send-mail" onclick="confirmerEnvoiMail(\'' + ivId + '\')">'
    + '\u2709\uFE0F Envoyer</button>'
    + '<button class="btn sm" onclick="_modalLocked=false;oM(\''+ivId+'\')">Retour</button>'
    + '</div></div>';

  document.getElementById('mo').style.display = 'flex';
  setTimeout(function() {
    const sj = document.getElementById('mail-subj');
    if (sj) sj.value = 'Intervention des sapeurs-pompiers de l\u2019' + (cas ? cas.nom : '') + ' en date du ' + dateFr;
  }, 80);
}

// ═══════════════════════════════════════════════════
// BREVO — envoi mail avec pièce jointe PDF
// ═══════════════════════════════════════════════════
const AGAI_MAIL_ENDPOINT = AGAI_RUNTIME_CONFIG.mailEndpoint||'';
const BREVO_FROM_EMAIL = 'pompierscabbalr@gmail.com';
const BREVO_FROM_NAME  = 'Sapeurs-pompiers CABBALR';

function _sendMailSecure(payload) {
  if (!AGAI_MAIL_ENDPOINT) {
    return Promise.reject(new Error('Envoi désactivé : aucune passerelle mail sécurisée n’est configurée.'));
  }
  return fetch(AGAI_MAIL_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    credentials: 'omit',
    body: JSON.stringify(payload)
  });
}

function confirmerEnvoiMail(ivId) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const cas = CC();
  const saved = _autorisationData[ivId] || iv._autorisationData || {};
  const nomComplet = ((saved.prenom||'')+' '+(saved.nom||'')).trim();
  const dateFr = saved.date ? saved.date.split('-').reverse().join('/') : '';
  const adresse = saved.adresse||''; const commune = saved.commune||'';
  const objet = saved.objet||iv.n||'';

  const to   = (document.getElementById('mail-to')||{}).value||'';
  const subj = (document.getElementById('mail-subj')||{}).value||'';
  if (!to) { showToast('Saisissez l\u2019adresse du destinataire','warn'); return; }

  const htmlAttest = _buildAutorisationHTML(ivId, 'attestation');
  if (!htmlAttest) { showToast('Document non disponible','error'); return; }

  const statusEl = document.getElementById('mail-status');
  const sendBtn  = document.getElementById('btn-send-mail');
  if (statusEl) statusEl.innerHTML = '<span style="color:#888;">&#x23F3; Génération du PDF...</span>';
  if (sendBtn)  sendBtn.disabled = true;

  const utNom = cas ? cas.nom : 'les sapeurs-pompiers';
  const corps = 'Madame, Monsieur ' + nomComplet + ',\n\n'
    + 'Veuillez trouver en pièce jointe votre attestation d\u2019intervention du ' + dateFr
    + ' au ' + adresse + (commune ? ' (' + commune + ')' : '') + '.\n'
    + 'Objet\u00a0: ' + objet + '\n\n'
    + 'Cordialement,\n'
    + 'Les sapeurs-pompiers de l\u2019' + utNom;

  const _dateFrPdf = saved.date ? saved.date.split('-').reverse().join('-') : 'attestation';
  const pdfName = 'Attestation_' + _dateFrPdf + '.pdf';
  _modalLocked = true;
  _genPdfHaute(htmlAttest, function(pdfB64) {
    if (!pdfB64) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#C0392B;">&#x274C; Erreur génération PDF</span>';
      if (sendBtn)  sendBtn.disabled = false;
      _modalLocked = false;
      return;
    }
    if (statusEl) statusEl.innerHTML = '<span style="color:#888;">&#x23F3; Envoi en cours...</span>';

    const payload = {
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: to, name: nomComplet||to }],
      subject: subj,
      textContent: corps,
      attachment: [{ content: pdfB64, name: pdfName }]
    };

    _sendMailSecure(payload)
    .then(function(r) {
      if (!r.ok) return r.text().then(function(txt){
        let e; try { e = JSON.parse(txt); } catch(_){ e = {message: txt}; }
        throw e;
      });
      return r.json();
    })
    .then(function() {
      if (statusEl) statusEl.innerHTML = '<span style="color:#27AE60;">&#x2705; Attestation envoyée à ' + to + '</span>';
      if (sendBtn)  sendBtn.disabled = false;
      showToast('Attestation envoyée \u2714', 'success');
      _modalLocked = false;
      if (!iv._mailsEnvoyes) iv._mailsEnvoyes = [];
      iv._mailsEnvoyes.push({ to:to, date:new Date().toISOString(), subj:subj });
      saveData();rI();rHist();
    })
    .catch(function(err) {
      console.error('Brevo error', err);
      let msg = '';
      if (err && err.message) msg = err.message;
      else if (err && err.code) msg = 'Code ' + err.code + (err.message ? ' — ' + err.message : '');
      else { try { msg = JSON.stringify(err); } catch(e) { msg = String(err); } }
      if (statusEl) statusEl.innerHTML = '<span style="color:#C0392B;">&#x274C; Échec\u00a0: ' + msg + '</span>';
      if (sendBtn)  sendBtn.disabled = false;
      _modalLocked = false;
      showToast('Erreur — voir détail dans la modale', 'error');
    });
  });
}

function telechargerAttestationPdf(ivId) {
  const statusEl = document.getElementById('mail-status');
  if (statusEl) statusEl.innerHTML = '<span style="color:#888;">&#x23F3; Génération du PDF...</span>';
  const htmlAttest = _buildAutorisationHTML(ivId, 'attestation');
  if (!htmlAttest) { showToast('Document non disponible', 'error'); return; }
  _htmlToPdfBase64(htmlAttest, function(pdfB64) {
    if (!pdfB64) { showToast('Erreur génération PDF', 'error'); return; }
    const iv = IVS.find(function(v){return v.id===ivId;});
    const saved = (iv && iv._autorisationData) || {};
    const dateFr = saved.date ? saved.date.split('-').reverse().join('-') : 'attestation';
    const a = document.createElement('a');
    a.href = 'data:application/pdf;base64,' + pdfB64;
    a.download = 'Attestation_' + dateFr + '.pdf';
    a.click();
    if (statusEl) statusEl.innerHTML = '<span style="color:#27AE60;">&#x2705; PDF téléchargé — joignez-le au mail</span>';
  });
}


// ── Helpers Compte Rendu Frelons Asiatiques ──
function _isFrelonIv(iv){
  return iv&&(iv.n==='Nid de frelons asiatiques'||iv.n==='Nid de frelons asiatiques — PILP');
}
function _frelonDetailFormHTML(iv,ro){
  const fd=iv._frelonData||{};
  const roAttr=ro?' disabled':'';
  const bg=ro?'background:#f5f5f5;':'';
  function sel(id,val,opts){
    let s='<select class="fi" id="'+id+'"'+roAttr+' style="font-size:12px;padding:4px 6px;'+bg+'">';
    opts.forEach(function(o){s+='<option value="'+o+'"'+(val===o?' selected':'')+'>'+o+'</option>';});
    return s+'</select>';
  }
  function oui_non(id,val){return sel(id,val||'Non',['Oui','Non']);}
  function num(id,val,ph){return '<input class="fi" id="'+id+'" type="number" min="0"'+roAttr+' value="'+(val||'')+'" placeholder="'+ph+'" style="font-size:12px;padding:4px 6px;'+bg+'">';}
  return '<div style="background:#FFF7ED;border:1.5px solid #EF9F27;border-radius:10px;padding:12px;margin-bottom:12px;">'
    +'<div style="font-size:12px;font-weight:700;color:#854F0B;margin-bottom:10px;">🐝 Compte rendu — Nid de frelons asiatiques</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    // Type de nid
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Type de nid</div>'+sel('frel-type',fd.type||'Secondaire',['Primaire','Secondaire'])+'</div>'
    // Nid dans les haies
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Nid dans les haies</div>'+oui_non('frel-haies',fd.haies)+'</div>'
    // Nid dans un arbre
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Nid dans un arbre</div>'+oui_non('frel-arbre',fd.arbre)+'</div>'
    // Hauteur estimée
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Hauteur estimée (m)</div>'+num('frel-hauteur',fd.hauteur,'ex: 8')+'</div>'
    // Près d'un point d'eau
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Près d\'un point d\'eau</div>'+oui_non('frel-eau',fd.eau)+'</div>'
    // Ville ou campagne
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Environnement</div>'+sel('frel-env',fd.env||'Ville',['Ville','Campagne'])+'</div>'
    // Nid dans un bois
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Nid dans un bois</div>'+oui_non('frel-bois',fd.bois)+'</div>'
    // Population importante
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Population importante</div>'+oui_non('frel-pop',fd.pop)+'</div>'
    // Dimensions : hauteur nid
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Hauteur du nid (cm)</div>'+num('frel-dim-h',fd.dimH,'ex: 35')+'</div>'
    // Dimensions : diamètre nid
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Diamètre du nid (cm)</div>'+num('frel-dim-d',fd.dimD,'ex: 30')+'</div>'
    // Moyen de destruction
    +'<div class="fg" style="grid-column:1/-1;margin:0;"><div class="fgl" style="font-size:11px;">Moyen de destruction</div>'+sel('frel-moyen',fd.moyen||'À la perche',['À la perche','Au PILP','Autre'])+'</div>'
    // Estimation billes PILP (conditionnel)
    +'<div class="fg" style="grid-column:1/-1;margin:0;" id="frel-pilp-wrap" style="display:'+(( fd.moyen==='Au PILP')?'':'none')+'">'
    +'<div class="fgl" style="font-size:11px;">Estimation nombre de billes PILP</div>'+num('frel-billes',fd.billes,'ex: 4')+'</div>'
    +'</div>'
    // Photo du nid
    +(ro&&fd.photo?'<div style="margin-top:10px;"><div class="fgl" style="font-size:11px;margin-bottom:4px;">📷 Photo du nid</div><img src="'+fd.photo+'" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid #EF9F27;"></div>'
      :!ro?'<div style="margin-top:10px;"><div class="fgl" style="font-size:11px;margin-bottom:4px;">📷 Photo du nid</div>'
        +(fd.photo?'<img id="frel-photo-preview" src="'+fd.photo+'" style="max-width:100%;max-height:150px;border-radius:8px;border:1px solid #EF9F27;display:block;margin-bottom:6px;">'
          :'<img id="frel-photo-preview" style="display:none;max-width:100%;max-height:150px;border-radius:8px;border:1px solid #EF9F27;margin-bottom:6px;">')
        +'<label style="display:inline-block;cursor:pointer;background:#FEF3C7;border:1px solid #EF9F27;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:600;color:#854F0B;">'
        +'📷 '+(fd.photo?'Changer la photo':'Ajouter une photo')
        +'<input type="file" accept="image/*" style="display:none;" onchange="frelonPhotoChange(this)">'
        +'</label>'
        +(fd.photo?'<button onclick="frelonPhotoSuppr()" style="margin-left:6px;background:none;border:none;color:#C0392B;font-size:11px;cursor:pointer;">✕ Supprimer</button>':'')
        +'</div>':'')
    +'</div>';
}
function _frelonHasDestruction(iv){
  if(!iv)return false;
  if(iv._frelonDestruction===true)return true;
  if(iv._frelonDestruction===false)return false;
  return !!iv._frelonData;
}
function toggleFrelonDestructionForm(){
  const select=document.getElementById('frel-destruction');
  const details=document.getElementById('frelon-detail-wrap');
  if(details)details.style.display=select&&select.value==='Oui'?'':'none';
}
function _frelonFormHTML(iv,ro){
  const destruction=_frelonHasDestruction(iv);
  const choice=ro
    ?'<div style="font-size:13px;font-weight:700;color:'+(destruction?'#166534':'#6B7280')+';">'+(destruction?'Oui':'Non')+'</div>'
    :'<select class="fi" id="frel-destruction" onchange="toggleFrelonDestructionForm()" style="font-size:12px;padding:6px 8px;"><option value="Non"'+(!destruction?' selected':'')+'>Non</option><option value="Oui"'+(destruction?' selected':'')+'>Oui</option></select>';
  return '<div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Destruction d\u2019un nid réalisée ?</div>'+choice+'</div></div>'
    +'<div id="frelon-detail-wrap" style="display:'+(destruction?'':'none')+';">'+_frelonDetailFormHTML(iv,ro)+'</div>';
}
function frelonPhotoChange(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    window._frelonPhotoB64=e.target.result;
    const preview=document.getElementById('frel-photo-preview');
    if(preview){preview.src=e.target.result;preview.style.display='block';}
  };
  reader.readAsDataURL(file);
}
function frelonPhotoSuppr(){
  window._frelonPhotoB64='__suppr__';
  const preview=document.getElementById('frel-photo-preview');
  if(preview){preview.src='';preview.style.display='none';}
}

function _frelonSaveFields(iv){
  function v(id){return (document.getElementById(id)||{}).value||'';}
  const destruction=v('frel-destruction')==='Oui';
  iv._frelonDestruction=destruction;
  if(!destruction){
    iv._frelonData=null;
    window._frelonPhotoB64=null;
    return;
  }
  const oldPhoto=iv._frelonData&&iv._frelonData.photo||'';
  const newPhoto=window._frelonPhotoB64;
  const photo=newPhoto==='__suppr__'?'':newPhoto||oldPhoto;
  window._frelonPhotoB64=null;
  iv._frelonData={
    type:   v('frel-type'),
    haies:  v('frel-haies'),
    arbre:  v('frel-arbre'),
    hauteur:v('frel-hauteur'),
    eau:    v('frel-eau'),
    env:    v('frel-env'),
    bois:   v('frel-bois'),
    pop:    v('frel-pop'),
    dimH:   v('frel-dim-h'),
    dimD:   v('frel-dim-d'),
    moyen:  v('frel-moyen'),
    billes: v('frel-billes'),
    photo:  photo
  };
}
function _frelonSummaryLine(iv){
  if(iv&&iv._frelonDestruction===false)return '';
  const fd=iv._frelonData;if(!fd)return '';
  const parts=[];
  parts.push('Nid '+fd.type);
  parts.push('Haies: '+fd.haies);
  parts.push('Arbre: '+fd.arbre);
  if(fd.hauteur)parts.push('Hauteur: '+fd.hauteur+' m');
  parts.push('Point d\'eau: '+fd.eau);
  parts.push(fd.env);
  parts.push('Bois: '+fd.bois);
  parts.push('Pop. importante: '+fd.pop);
  const dims=[];
  if(fd.dimH)dims.push('H '+fd.dimH+' cm');
  if(fd.dimD)dims.push('Ø '+fd.dimD+' cm');
  if(dims.length)parts.push('Dimensions nid: '+dims.join(' / '));
  parts.push('Destruction: '+fd.moyen);
  if(fd.moyen==='Au PILP'&&fd.billes)parts.push('Billes PILP: '+fd.billes);
  return parts.join(' | ');
}

function hhmmToMinutes(value){
  const match=String(value||'').match(/^(\d{2}):(\d{2})$/);
  if(!match)return null;
  const hours=Number(match[1]),minutes=Number(match[2]);
  if(hours>23||minutes>59)return null;
  return hours*60+minutes;
}

function interventionClockMillis(iv,value,status,latest){
  const time=String(value||'').match(/^(\d{2}):(\d{2})$/);
  let stamp=interventionTimelineStamp(iv,status,latest);
  let stampDigits=String(stamp||iv&&iv.h||'').replace(/\D/g,'');
  if(status==='en-cours'){
    const inherited=String(iv&&iv._departureInheritedDate||iv&&iv._dateDebut||'').replace(/\D/g,'').slice(0,8);
    if(inherited.length===8)stampDigits=inherited+stampDigits.slice(8);
  }
  if(stampDigits.length<8)return NaN;
  const hours=time?Number(time[1]):Number(stampDigits.slice(8,10));
  const minutes=time?Number(time[2]):Number(stampDigits.slice(10,12));
  if(!Number.isFinite(hours)||!Number.isFinite(minutes))return NaN;
  return new Date(Number(stampDigits.slice(0,4)),Number(stampDigits.slice(4,6))-1,Number(stampDigits.slice(6,8)),hours,minutes).getTime();
}

function interventionOperationalBounds(iv){
  if(!iv)return {start:NaN,end:NaN};
  const start=interventionClockMillis(iv,iv._hDebut||iv._hDebutReelle||iv._hDebutInitiale||'','en-cours',false);
  let end=interventionClockMillis(iv,iv._hFin||iv._hFinReelle||iv._hFinInitiale||'','terminee',true);
  if(!Number.isFinite(end)&&Number.isFinite(start)&&(iv._hFin||iv._hFinReelle||iv._hFinInitiale)){
    end=interventionClockMillis(iv,iv._hFin||iv._hFinReelle||iv._hFinInitiale||'','en-cours',false);
    if(Number.isFinite(end)&&end<start)end+=24*60*60*1000;
  }
  return {start:start,end:end};
}

function interventionHistoricalPersonnelLogins(iv){
  const logins=[];
  interventionActivePersonnelLogins(iv).forEach(function(login){if(login)logins.push(login);});
  interventionReportParticipants(iv).forEach(function(member){if(member&&member.login)logins.push(member.login);});
  return [...new Set(logins)];
}

function proposedInterventionStartMillis(iv,next,real){
  const actual=interventionClockMillis(iv,real,'en-cours',false);
  if(!Number.isFinite(actual))return NaN;
  const base=new Date(actual);
  const nextMinutes=hhmmToMinutes(next),realMinutes=hhmmToMinutes(real);
  if(nextMinutes===null||realMinutes===null)return NaN;
  base.setHours(Math.floor(nextMinutes/60),nextMinutes%60,0,0);
  // Une correction juste avant minuit depuis un départ réel juste après minuit
  // appartient à la veille, et non au soir suivant.
  const backward=(realMinutes-nextMinutes+1440)%1440;
  if(nextMinutes>realMinutes&&backward<=12*60)base.setDate(base.getDate()-1);
  return base.getTime();
}

function findStartCorrectionOperationalConflict(iv,next,real){
  const proposedStart=proposedInterventionStartMillis(iv,next,real);
  const actualStart=interventionClockMillis(iv,real,'en-cours',false);
  if(!Number.isFinite(proposedStart)||!Number.isFinite(actualStart))return null;
  const vehicles=interventionVehicleNames(iv).map(nm).filter(Boolean);
  const personnel=interventionHistoricalPersonnelLogins(iv);
  const candidates=[].concat(IVS||[],PILP_IVS||[]).filter(function(other){
    return other&&other.id!==iv.id&&['en-cours','terminee'].includes(other.s);
  });
  for(const other of candidates){
    const bounds=interventionOperationalBounds(other);
    // Seule une intervention antérieure peut borner l'heure de départ corrigée.
    if(!Number.isFinite(bounds.start)||!Number.isFinite(bounds.end)||bounds.start>actualStart||proposedStart>=bounds.end)continue;
    const vehicle=interventionVehicleNames(other).find(function(name){return vehicles.includes(nm(name));});
    if(vehicle)return {kind:'vehicle',value:vehicle,iv:other,end:bounds.end};
    const otherPersonnel=interventionHistoricalPersonnelLogins(other);
    const login=personnel.find(function(item){return otherPersonnel.includes(item);});
    if(login)return {kind:'personnel',value:login,iv:other,end:bounds.end};
  }
  return null;
}

function showStartCorrectionOperationalConflict(conflict){
  if(!conflict)return;
  const user=conflict.kind==='personnel'&&USERS.find(function(agent){return agent.l===conflict.value;});
  const resource=conflict.kind==='vehicle'?'Le véhicule '+conflict.value:'L’agent '+(user?fullName(user):conflict.value);
  const end=new Date(conflict.end);
  showToast(resource+' est engagé sur '+operationalConflictLabel(conflict.iv)+' jusqu’à '+pad(end.getHours())+':'+pad(end.getMinutes())+'. L’heure de départ ne peut pas être antérieure à cette fin.','warn');
}

function saveInterventionStartCorrection(ivId){
  const iv=IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  if(!canEditInterventionStart(iv)){
    showToast('Cette heure ne peut pas être modifiée par ce compte.','warn');return;
  }
  const field=document.getElementById('cr-start-correction');
  const next=field?field.value:'';
  const nextMinutes=hhmmToMinutes(next);
  if(nextMinutes===null){showToast('Saisissez une heure valide au format HH:MM.','warn');return;}
  const endField=document.getElementById('cr-end-correction');
  const nextEnd=endField?endField.value:(iv._hFin||'');
  if(endField&&!nextEnd&&iv._hFin){showToast('L’heure de retour ne peut pas être effacée.','warn');return;}
  if(endField&&nextEnd&&hhmmToMinutes(nextEnd)===null){showToast('Saisissez une heure de retour valide au format HH:MM.','warn');return;}
  const old=iv._hDebut||'';
  const oldEnd=iv._hFin||'';
  const real=iv._hDebutReelle||iv._hDebutInitiale||old;
  if(!real){showToast('L’heure réelle de départ est introuvable.','warn');return;}
  if(!isAdminModeActive()){
    const realMinutes=hhmmToMinutes(real);
    const backward=(realMinutes-nextMinutes+1440)%1440;
    if(backward>15){
      showToast('Le chef d’agrès peut avancer l’heure de départ de 15 minutes maximum.','warn');return;
    }
  }
  if(next!==old){
    const conflict=findStartCorrectionOperationalConflict(iv,next,real);
    if(conflict){showStartCorrectionOperationalConflict(conflict);return;}
  }
  if(next===old&&nextEnd===oldEnd){showToast('Les heures de l’intervention sont inchangées.','info');return;}
  const notes=[];
  if(next!==old){
    if(!iv._hDebutReelle)iv._hDebutReelle=real;
    if(!iv._hDebutInitiale)iv._hDebutInitiale=real;
    iv._hDebut=next;
    iv._heureDebutModifiee=true;
    if(!Array.isArray(iv._heureDebutModifs))iv._heureDebutModifs=[];
    iv._heureDebutModifs.push({ancienne:old,nouvelle:next,reelle:real,auteur:CU.l,horodatage:getH(N()),administrateur:isAdminModeActive()});
    notes.push('Départ '+old+' → '+next+' (heure réelle conservée : '+real+')');
  }
  if(nextEnd!==oldEnd&&isAdminModeActive()){
    const realEnd=iv._hFinReelle||iv._hFinInitiale||oldEnd;
    if(!iv._hFinReelle)iv._hFinReelle=realEnd;
    if(!iv._hFinInitiale)iv._hFinInitiale=realEnd;
    iv._hFin=nextEnd;
    iv._heureFinModifiee=true;
    if(!Array.isArray(iv._heureFinModifs))iv._heureFinModifs=[];
    iv._heureFinModifs.push({ancienne:oldEnd,nouvelle:nextEnd,reelle:realEnd,auteur:CU.l,horodatage:getH(N()),administrateur:true});
    notes.push('Retour '+oldEnd+' → '+nextEnd+' (heure réelle conservée : '+realEnd+')');
  }
  pushTL(iv,'modif-heure',CU.l,notes.join(' · '));
  saveData(true);rI();rHist();
  showToast('Horaires corrigés et ajoutés à l’historique.','success');
  showCompteRenduModal(ivId);
}

function interventionStartCorrectionHTML(iv){
  if(iv&&iv._sdis)return '';
  const following=isFollowingInterventionInSeries(iv);
  const canEdit=canEditInterventionStart(iv);
  const adminMode=isAdminModeActive();
  const admin=hasAdministrativeAccount();
  const own=isInterventionReportChef(iv,CU.l);
  const first=isFirstInterventionOfRoute(iv);
  const chainedLocked=iv._startLockedByChain===true;
  const real=iv._hDebutReelle||iv._hDebutInitiale||iv._hDebut||'';
  const realEnd=iv._hFinReelle||iv._hFinInitiale||iv._hFin||'';
  const changes=Array.isArray(iv._heureDebutModifs)?iv._heureDebutModifs:[];
  const endChanges=Array.isArray(iv._heureFinModifs)?iv._heureFinModifs:[];
  if(!iv._hDebut&&!real)return '';
  if(following){
    if(!adminMode){
      const traceFollowing=changes.length
        ?'<div style="font-size:10px;color:#7C2D12;margin-top:6px;">Derni\u00e8re modification : '+escHtml(changes[changes.length-1].ancienne)+' \u2192 '+escHtml(changes[changes.length-1].nouvelle)+' par '+escHtml(changes[changes.length-1].auteur)+' \u00b7 '+escHtml(changes[changes.length-1].horodatage)+'</div>'
        :'';
      return '<div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;padding:10px 12px;margin-bottom:10px;">'
        +'<div style="font-size:12px;font-weight:700;color:#334155;">&#x23F1; Heure de d\u00e9but : '+escHtml(iv._hDebut||real)+'</div>'
        +'<div style="font-size:11px;color:#92400E;margin-top:5px;">Intervention encha\u00een\u00e9e avec le m\u00eame \u00e9quipage : l\u2019heure est automatique et ne peut pas \u00eatre modifi\u00e9e.</div>'
        +traceFollowing+'</div>';
    }
  }
  const notice=!canEdit&&own&&!adminMode&&chainedLocked
    ?'<div style="font-size:11px;color:#92400E;margin-top:6px;">Cette intervention est enchaînée avec le même équipage après l’intervention précédente. Son heure de départ est automatique et ne peut pas être modifiée par le chef d’agrès.</div>'
    :!canEdit&&own&&!adminMode&&!first
      ?'<div style="font-size:11px;color:#92400E;margin-top:6px;">Dans une tournée de plusieurs interventions, seule la première autorise une correction manuelle par le chef d’agrès. Les suivantes sont enchaînées automatiquement.</div>'
      :'';
  const lastStart=changes.length?changes[changes.length-1]:null;
  const lastEnd=endChanges.length?endChanges[endChanges.length-1]:null;
  const traces=[];
  if(lastStart)traces.push('Départ : '+escHtml(lastStart.ancienne)+' → '+escHtml(lastStart.nouvelle)+' par '+escHtml(lastStart.auteur)+' · '+escHtml(lastStart.horodatage));
  if(lastEnd)traces.push('Retour : '+escHtml(lastEnd.ancienne)+' → '+escHtml(lastEnd.nouvelle)+' par '+escHtml(lastEnd.auteur)+' · '+escHtml(lastEnd.horodatage));
  const trace=traces.length?'<div style="font-size:10px;color:#7C2D12;margin-top:6px;">'+traces.join('<br>')+'</div>':'';
  const anyChanged=iv._heureDebutModifiee||iv._heureFinModifiee;
  return '<div style="background:'+(anyChanged?'#FFF7ED':'#F8FAFC')+';border:1px solid '+(anyChanged?'#FDBA74':'#CBD5E1')+';border-radius:8px;padding:10px 12px;margin-bottom:10px;">'
    +'<div style="font-size:12px;font-weight:700;color:'+(anyChanged?'#9A3412':'#334155')+';margin-bottom:7px;">&#x23F1; '+(adminMode?'Horaires de l’intervention':'Heure de début')+(anyChanged?(adminMode?' — corrigés':' — corrigée'):'')+'</div>'
    +'<div style="display:flex;align-items:end;gap:8px;flex-wrap:wrap;">'
    +'<div class="fg" style="margin:0;min-width:140px;flex:1;"><div class="fgl" style="font-size:11px;">Heure de départ</div>'
    +'<input class="fi" id="cr-start-correction" type="time" value="'+escHtml(iv._hDebut||real)+'"'+(canEdit?'':' readonly')+' style="font-size:12px;padding:6px 8px;'+(!canEdit?'background:#f5f5f5;':'')+'"></div>'
    +(adminMode?'<div class="fg" style="margin:0;min-width:140px;flex:1;"><div class="fgl" style="font-size:11px;">Heure de retour</div><input class="fi" id="cr-end-correction" type="time" value="'+escHtml(iv._hFin||'')+'" style="font-size:12px;padding:6px 8px;"></div>':'')
    +'<div style="font-size:11px;color:var(--t2);padding-bottom:7px;">'+(adminMode?'Heures réelles : <strong>'+escHtml(real||'—')+' / '+escHtml(realEnd||'—')+'</strong>':'Heure réelle : <strong>'+escHtml(real)+'</strong>')+'</div>'
    +(canEdit?'<button class="btn sm" style="background:#C2410C;color:#fff;margin-bottom:1px;" onclick="saveInterventionStartCorrection(\''+iv.id+'\')">Enregistrer '+(adminMode?'les heures':'l’heure')+'</button>':'')
    +'</div>'
    +(canEdit&&!adminMode?'<div style="font-size:10px;color:var(--t2);margin-top:6px;">Correction autorisée jusqu’à 15 minutes avant l’heure réelle, uniquement avant validation du rapport.</div>':'')
    +notice+trace+'</div>';
}

function keepCompteRenduFieldVisible(){
  const field=document.getElementById('cr-texte');
  const overlay=document.getElementById('mo');
  if(!field||!overlay||!overlay.classList.contains('cr-modal-overlay'))return;
  try{field.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});}catch(e){field.scrollIntoView();}
}

const COMPTE_RENDU_DRAFT_PREFIX='agai_cr_draft_';
function compteRenduDraftKey(ivId){
  return COMPTE_RENDU_DRAFT_PREFIX+[CURRENT_CASERNE_ID||'sans-caserne',CU&&CU.l||'sans-compte',ivId].map(encodeURIComponent).join('_');
}
function readCompteRenduDraft(ivId){
  try{
    const raw=localStorage.getItem(compteRenduDraftKey(ivId));
    if(!raw)return null;
    const draft=JSON.parse(raw);
    if(!draft||typeof draft.text!=='string'||Date.now()-Number(draft.updatedAt||0)>7*24*60*60*1000){
      localStorage.removeItem(compteRenduDraftKey(ivId));return null;
    }
    return draft;
  }catch(e){return null;}
}
function writeCompteRenduDraft(ivId,text,updatedAt){
  const draft={text:String(text||''),updatedAt:Number(updatedAt)||Date.now()};
  try{localStorage.setItem(compteRenduDraftKey(ivId),JSON.stringify(draft));}catch(e){}
  window._activeReportDraftIvId=ivId;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  return draft;
}
function onCompteRenduDraftInput(field){
  if(!field)return;
  writeCompteRenduDraft(field.dataset.ivId||'',field.value);
}

function showCompteRenduModal(ivId) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const isOwn       = isInterventionReportChef(iv,CU.l);
  const isSuperAdmin= isAdminModeActive();
  const isValidated = !!iv._crValide;
  const canWrite    = (!isValidated && (isOwn||hasRight('Administration'))) || isSuperAdmin;
  const enCours     = iv.s==='en-cours';

  let infoBanner = '';
  if(isValidated && !isSuperAdmin){
    infoBanner='<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#854F0B;">'
      +'\uD83D\uDD12 Compte rendu verrouill\u00e9 \u2014 valid\u00e9 le '+iv._crDateValidation+'.</div>';
  } else if(isValidated){
    infoBanner='<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#854F0B;">'
      +'\uD83D\uDD13 Compte rendu verrouill\u00e9 \u2014 modification possible (admin).</div>';
  } else {
    infoBanner='<div style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#0F766E;">'
      +'\uD83D\uDCCB Saisissez votre compte rendu. Une fois valid\u00e9, il sera verrouill\u00e9 et ne pourra plus \u00eatre modifi\u00e9.</div>';
  }

  let btns = '';
  if(canWrite){
    if(!isValidated){
      btns += '<button class="btn sm" style="background:#0F766E;color:#fff;" onclick="saveCompteRendu(\'' + ivId + '\',false)">&#x1F4BE; Sauvegarder</button>';
      btns += '<button class="btn sm" style="background:#2563EB;color:#fff;" onclick="validerCompteRendu(\'' + ivId + '\')">&#x1F512; Valider d\u00e9finitivement</button>';
      if(enCours && isOwn){
        btns += '<button class="btn sm" style="background:var(--grn);color:#fff;" onclick="saveCompteRendu(\'' + ivId + '\',true)">\u2705 Sauvegarder et cl\u00f4turer</button>';
      }
    } else {
      btns += '<button class="btn sm" style="background:#0F766E;color:#fff;" onclick="saveCompteRendu(\'' + ivId + '\',false)">&#x1F4BE; Modifier (admin)</button>';
      btns += '<button class="btn sm" style="background:#C0392B;color:#fff;" onclick="voirRapportIntervention(\'' + ivId + '\')">&#x1F5A8; Rapport</button>';
    }
  } else {
    if(iv._crTexte||iv._compteRendu){
      btns += '<button class="btn sm" style="background:#C0392B;color:#fff;" onclick="voirRapportIntervention(\'' + ivId + '\')">&#x1F5A8; Rapport PDF</button>';
    }
  }

  document.getElementById('mt').textContent = 'Compte rendu d\u2019intervention';
  document.getElementById('mi').textContent = iv.n + ' \u2014 ' + iv.com;
  const teammateFields=interventionTeammateEditorHTML(iv)+interventionSupplementaryCrewsEditorHTML(iv);
  const startCorrectionFields=interventionStartCorrectionHTML(iv);
  const storedReportText=iv._crTexte||iv._compteRendu||'';
  const localDraft=readCompteRenduDraft(ivId);
  const reportText=localDraft&&localDraft.text!==storedReportText&&Number(localDraft.updatedAt||0)>Number(iv._crLocalSavedAt||0)
    ?localDraft.text:storedReportText;

  // Champs supplémentaires SDIS
  const sdisFields = iv._sdis ? (function(){
    const hDep=iv._hDebut||'';
    const hRet=iv._hFin||'';
    const hNow=getHHMM(N()).slice(0,5);
    const ro=canWrite?'':' readonly';
    return '<div style="background:#DBEAFE;border:1px solid #93C5FD;border-radius:8px;padding:10px 12px;margin-bottom:10px;">'
      +'<div style="font-size:12px;font-weight:700;color:#1D4ED8;margin-bottom:8px;">🚑 Champs spécifiques SDIS</div>'
      // Ligne 1 : Acquis présence + Départ + Retour (modifiables avant validation)
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">'
      +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Acquis présence</div>'
      +'<input class="fi" id="cr-hacquis" type="time"'+ro+' value="'+(iv._hAcquis||'')+'" style="font-size:12px;padding:4px 6px;"></div>'
      +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">N° intervention SDIS</div>'
      +'<input class="fi" id="cr-numsdis"'+ro+' value="'+(iv._numSDIS||'')+'" placeholder="ex: 112057-1" style="font-size:12px;padding:4px 6px;"></div>'
      +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">⬆️ Départ engin</div>'
      +'<input class="fi" id="cr-hdepart" type="time"'+ro+' value="'+hDep+'" onchange="sdisUpdateMinMax()" style="font-size:12px;padding:4px 6px;"></div>'
      +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">⬇️ Retour engin</div>'
      +'<input class="fi" id="cr-hretour" type="time"'+ro+' value="'+hRet+'" onchange="sdisUpdateMinMax()" style="font-size:12px;padding:4px 6px;"></div>'
      +'</div>'
      // Ligne 2 : SLL + Dispo + Op. terminée
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">'
      +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;" id="lbl-hsll">Heure SLL'+(hDep?'<span style="font-size:10px;color:var(--t2);"> (≥ '+hDep+')</span>':'')+' </div>'
      +'<input class="fi" id="cr-hsll" type="time"'+ro+(hDep?' min="'+hDep+'"':'')+(hRet?' max="'+hRet+'"':'')+' value="'+(iv._hSll||'')+'" style="font-size:12px;padding:4px 6px;"></div>'
      +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;" id="lbl-hdispo">Heure disponible'+(hRet?'<span style="font-size:10px;color:var(--t2);"> (≤ '+hRet+')</span>':'')+' </div>'
      +'<input class="fi" id="cr-hdispo" type="time"'+ro+(hDep?' min="'+hDep+'"':'')+(hRet?' max="'+hRet+'"':'')+' value="'+(iv._hDispo||'')+'" style="font-size:12px;padding:4px 6px;"></div>'
      +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;" id="lbl-hopt">Op. terminée'+(hRet?'<span style="font-size:10px;color:var(--t2);"> (≥ '+hRet+')</span>':'')+' </div>'
      +'<input class="fi" id="cr-hopterminee" type="time"'+ro+(hRet?' min="'+hRet+'"':'')+(hNow?' max="'+hNow+'"':'')+' value="'+(iv._hOpTerminee||'')+'" style="font-size:12px;padding:4px 6px;"></div>'
      +'</div>'
      +'<div class="fg" style="margin-bottom:8px;"><div class="fgl" style="font-size:11px;">Matériel(s) utilisé(s)</div>'
      +'<input class="fi" id="cr-materiels"'+ro+' value="'+(iv._materiels||'')+'" placeholder="-" style="font-size:12px;padding:4px 6px;"></div>'
      +'<div class="fg" style="margin-bottom:8px;"><div class="fgl" style="font-size:11px;">Consommable(s) utilisé(s)</div>'
      +'<input class="fi" id="cr-consommables"'+ro+' value="'+(iv._consommables||'')+'" placeholder="-" style="font-size:12px;padding:4px 6px;"></div>'
      +'<div class="fg" style="margin-bottom:4px;"><div class="fgl" style="font-size:11px;">Annotation(s) particulière(s)</div>'
      +'<input class="fi" id="cr-annotations"'+ro+' value="'+(iv._annotations||'')+'" placeholder="-" style="font-size:12px;padding:4px 6px;"></div>'
      +'</div>';
  })() : '';

  // Champs Frelons asiatiques
  const frelonFields = _isFrelonIv(iv) ? _frelonFormHTML(iv, !canWrite) : '';

  document.getElementById('mb').innerHTML =
    '<div style="padding:4px 0;">'
    + infoBanner
    + teammateFields
    + startCorrectionFields
    + sdisFields
    + frelonFields
    + '<div class="fg"><div class="fgl">Compte rendu du chef d\'agrès</div>'
    + '<textarea class="fi" id="cr-texte" data-iv-id="'+escHtml(ivId)+'" rows="7" style="resize:vertical;" oninput="onCompteRenduDraftInput(this)" onfocus="setTimeout(keepCompteRenduFieldVisible,120)"'
    + (canWrite?' placeholder="Ex : Nid de guepes sous toiture..."':' readonly')
    + '>' + escHtml(reportText) + '</textarea></div>'
    + '<div id="cr-save-status" style="display:none;background:#ECFDF5;border:1px solid #86EFAC;color:#166534;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;font-weight:600;"></div>'
    + '<div class="brow" style="flex-wrap:wrap;gap:6px;margin-top:12px;">' + btns + '</div>'
    + '</div>';
  const reportOverlay=document.getElementById('mo');
  window._activeReportDraftIvId=ivId;
  reportOverlay.classList.add('cr-modal-overlay');
  openModalAtTop();
  // Toggle PILP billes
  const moyenEl=document.getElementById('frel-moyen');
  const pilpWrap=document.getElementById('frel-pilp-wrap');
  if(moyenEl&&pilpWrap){
    pilpWrap.style.display=moyenEl.value==='Au PILP'?'':'none';
    moyenEl.addEventListener('change',function(){pilpWrap.style.display=moyenEl.value==='Au PILP'?'':'none';});
  }
}

// Met à jour les min/max des champs SLL/dispo/op.terminée quand départ ou retour change
function sdisUpdateMinMax(){
  const hDep=(document.getElementById('cr-hdepart')||{}).value||'';
  const hRet=(document.getElementById('cr-hretour')||{}).value||'';
  const hNow=getHHMM(N()).slice(0,5);
  const sll=document.getElementById('cr-hsll');
  const dispo=document.getElementById('cr-hdispo');
  const opt=document.getElementById('cr-hopterminee');
  const lblSll=document.getElementById('lbl-hsll');
  const lblDispo=document.getElementById('lbl-hdispo');
  const lblOpt=document.getElementById('lbl-hopt');
  if(sll){if(hDep)sll.min=hDep;else sll.removeAttribute('min');if(hRet)sll.max=hRet;else sll.removeAttribute('max');}
  if(dispo){if(hDep)dispo.min=hDep;else dispo.removeAttribute('min');if(hRet)dispo.max=hRet;else dispo.removeAttribute('max');}
  if(opt){if(hRet)opt.min=hRet;else opt.removeAttribute('min');opt.max=hNow;}
  if(lblSll)lblSll.innerHTML='Heure SLL'+(hDep?'<span style="font-size:10px;color:var(--t2);"> (≥ '+hDep+')</span>':'');
  if(lblDispo)lblDispo.innerHTML='Heure disponible'+(hRet?'<span style="font-size:10px;color:var(--t2);"> (≤ '+hRet+')</span>':'');
  if(lblOpt)lblOpt.innerHTML='Op. terminée'+(hRet?'<span style="font-size:10px;color:var(--t2);"> (≥ '+hRet+')</span>':'');
}

function _sdisValidateHeures(iv){
  const hDep=(document.getElementById('cr-hdepart')||{}).value||iv._hDebut||'';
  const hRet=(document.getElementById('cr-hretour')||{}).value||iv._hFin||'';
  const hNow=getHHMM(N()).slice(0,5);
  const v=id=>(document.getElementById(id)||{}).value||'';
  const hSll=v('cr-hsll'), hDispo=v('cr-hdispo'), hOpt=v('cr-hopterminee');
  const elapsed=function(from,to){
    const fromMinutes=hhmmToMinutes(from),toMinutes=hhmmToMinutes(to);
    if(fromMinutes===null||toMinutes===null)return null;
    return (toMinutes-fromMinutes+1440)%1440;
  };
  if((hDep&&hhmmToMinutes(hDep)===null)||(hRet&&hhmmToMinutes(hRet)===null)){
    showToast('Les heures de départ et de retour doivent être au format HH:MM.','warn');return false;
  }
  // Une durée nulle est autorisée. Une heure de retour plus petite que l'heure
  // de départ signifie que l'intervention s'est terminée après minuit.
  const duration=hDep&&hRet?elapsed(hDep,hRet):null;
  const checkInside=function(value,label){
    if(!value||!hDep||!hRet)return true;
    const offset=elapsed(hDep,value);
    const inside=duration===0?offset===0:offset<=duration;
    if(!inside)showToast(label+' doit être comprise entre le départ ('+hDep+') et le retour ('+hRet+').','warn');
    return inside;
  };
  if(!checkInside(hSll,'Heure SLL'))return false;
  if(!checkInside(hDispo,'Heure disponible'))return false;
  // L'opération terminée peut elle aussi se situer après minuit.
  if(hOpt&&hRet){
    const afterReturn=elapsed(hRet,hOpt);
    const untilNow=elapsed(hRet,hNow);
    if(afterReturn>untilNow){
      showToast('L’heure d’opération terminée doit être comprise entre le retour ('+hRet+') et maintenant ('+hNow+').','warn');return false;
    }
  }
  return true;
}
function _sdisSaveFields(iv){
  const v=id=>(document.getElementById(id)||{}).value||'';
  const oldDeparture=iv._hDebut||'',oldReturn=iv._hFin||'';
  const nextDeparture=v('cr-hdepart'),nextReturn=v('cr-hretour');
  iv._hAcquis     = v('cr-hacquis');
  iv._numSDIS     = v('cr-numsdis');
  iv._hDebut      = nextDeparture;
  iv._hFin        = nextReturn;
  iv._hSll        = v('cr-hsll');
  iv._hDispo      = v('cr-hdispo');
  iv._materiels   = v('cr-materiels');
  iv._consommables= v('cr-consommables');
  iv._annotations = v('cr-annotations');
  iv._hOpTerminee = v('cr-hopterminee');
  if(isAdminModeActive()){
    const notes=[];
    if(oldDeparture&&nextDeparture&&oldDeparture!==nextDeparture){
      if(!iv._hDebutReelle)iv._hDebutReelle=oldDeparture;
      if(!iv._hDebutInitiale)iv._hDebutInitiale=oldDeparture;
      iv._heureDebutModifiee=true;
      if(!Array.isArray(iv._heureDebutModifs))iv._heureDebutModifs=[];
      iv._heureDebutModifs.push({ancienne:oldDeparture,nouvelle:nextDeparture,reelle:iv._hDebutReelle,auteur:CU.l,horodatage:getH(N()),administrateur:true});
      notes.push('Départ '+oldDeparture+' → '+nextDeparture);
    }
    if(oldReturn&&nextReturn&&oldReturn!==nextReturn){
      if(!iv._hFinReelle)iv._hFinReelle=oldReturn;
      if(!iv._hFinInitiale)iv._hFinInitiale=oldReturn;
      iv._heureFinModifiee=true;
      if(!Array.isArray(iv._heureFinModifs))iv._heureFinModifs=[];
      iv._heureFinModifs.push({ancienne:oldReturn,nouvelle:nextReturn,reelle:iv._hFinReelle,auteur:CU.l,horodatage:getH(N()),administrateur:true});
      notes.push('Retour '+oldReturn+' → '+nextReturn);
    }
    if(notes.length)pushTL(iv,'modif-heure',CU.l,'Correction SDIS : '+notes.join(' · '));
  }
}
function validerCompteRendu(ivId) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  if(!isInterventionReportChef(iv,CU.l)&&!hasAdministrativeAccount()){
    showToast('Validation réservée au chef d’agrès de l’intervention ou à un administrateur.','warn');return;
  }
  const texte = (document.getElementById('cr-texte')||{}).value||'';
  if(!texte.trim()){showToast('Saisissez un compte rendu avant de valider','warn');return;}
  if(iv._sdis&&!_sdisValidateHeures(iv))return;
  confirmModal('Valider d\u00e9finitivement le compte rendu\u00a0? Il ne pourra plus \u00eatre modifi\u00e9.',function(){
    const savedAt=Date.now();
    writeCompteRenduDraft(ivId,texte,savedAt);
    iv._crTexte          = texte;
    iv._compteRendu      = texte;
    iv._crLocalSavedAt   = savedAt;
    iv._crAuteur         = CU.l;
    iv._crDate           = getHHMM(N());
    iv._crValide         = true;
    iv._crDateValidation = getHHMM(N());
    if(iv._sdis) _sdisSaveFields(iv);
    if(_isFrelonIv(iv)) _frelonSaveFields(iv);
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);rI();rHist();
    cM();
    setTimeout(function(){oM(ivId);},80);
  });
}

function saveCompteRendu(ivId, andClot) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const isOwn       = isInterventionReportChef(iv,CU.l);
  const isSuperAdmin= isAdminModeActive();
  if(iv._crValide && !isSuperAdmin){showToast('Compte rendu verrouill\u00e9','warn');return;}
  if(!isOwn&&!isSuperAdmin){showToast('Non autoris\u00e9','warn');return;}
  if(iv._sdis&&!_sdisValidateHeures(iv))return;
  const reportText=(document.getElementById('cr-texte')||{}).value||'';
  const savedAt=Date.now();
  writeCompteRenduDraft(ivId,reportText,savedAt);
  iv._crTexte     = reportText;
  iv._compteRendu = iv._crTexte;
  iv._crLocalSavedAt=savedAt;
  iv._crAuteur    = CU.l;
  iv._crDate      = getHHMM(N());
  if(iv._sdis) _sdisSaveFields(iv);
  if(_isFrelonIv(iv)) _frelonSaveFields(iv);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rI();rHist();
  if(andClot){cM();clot(ivId);}
  else{
    const status=document.getElementById('cr-save-status');
    if(status){status.textContent='✅ Compte rendu sauvegardé à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});status.style.display='block';}
    showToast('Compte rendu sauvegardé — la fenêtre reste ouverte','success');
  }
}



function genRapportInterventionHTML(ivId) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return null;
  const JOURS_FR=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const MOIS_FR=['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];
  let dateLongue='';
  if(iv.h&&iv.h.length>=8){
    const y=parseInt(iv.h.slice(0,4)),mo=parseInt(iv.h.slice(4,6))-1,d=parseInt(iv.h.slice(6,8));
    dateLongue='Le '+JOURS_FR[new Date(y,mo,d).getDay()]+' '+d+' '+MOIS_FR[mo]+' '+y;
  }
  const numCas=iv._numCaserne?String(iv._numCaserne):'';
  const engin=interventionVehicleNames(iv).join(' + ');
  const hDebut=iv._hDebut||'';
  const hFin=iv._hFin||'';
  const avisPassageHeure=getAvisPassageHour(iv);
  const cr=iv._crTexte||iv._compteRendu||'';

  // Pr\u00e9sents
  const seen={},agents=[];
  function addA(login,role){
    if(!login||seen[login])return;seen[login]=true;
    const u=USERS.find(function(x){return x.l===login;});
    agents.push({role:role,grade:u?(u.grade||''):'',nom:u?(u.nom+' '+u.prenom):login});
  }
  interventionReportParticipants(iv).forEach(function(member){addA(member.login,member.role);});

  // HTML pr\u00e9sents : "Pr\u00e9sents :" + 1er agent sur m\u00eame ligne, suivants indent\u00e9s
  const PW='90px', RW='130px';
  let presHtml='<div style="display:flex;line-height:1.6;"><span style="min-width:'+PW+';font-weight:bold;">Pr\u00e9sents\u00a0:</span>';
  if(agents.length>0)presHtml+='<span style="min-width:'+RW+';flex-shrink:0;">'+agents[0].role+'</span><span>'+(agents[0].grade?agents[0].grade+' ':'')+agents[0].nom+'</span>';
  presHtml+='</div>';
  for(var ai=1;ai<agents.length;ai++){
    presHtml+='<div style="display:flex;line-height:1.6;"><span style="min-width:'+PW+';flex-shrink:0;"></span><span style="min-width:'+RW+';flex-shrink:0;">'+agents[ai].role+'</span><span>'+(agents[ai].grade?agents[ai].grade+' ':'')+agents[ai].nom+'</span></div>';
  }

  // Construction des lignes : tableau avec rowspan sur la cellule num\u00e9ro
  // Chaque ligne = [gh_text, tx_html]
  // gh_text = '' sauf pour D\u00e9part/Retour
  const rows_data=[];
  rows_data.push(['',dateLongue]);
  if(iv._isRenfort){
    // Modèle dédié "Rapport d'intervention - Renfort"
    const casSrc=iv._caserneSourceNom||iv._caserneSource||'';
    rows_data.push(['\u00a0','Demande de renfort de l\u2019unit\u00e9 territoriale de '+casSrc+' pour '+(iv.n||'')+' \u00e0 l\u2019adresse suivante\u00a0: '+(iv.addr||'')+' dans la commune de '+(iv.com||'')]);
    if(iv.req||iv.tel)rows_data.push(['',(iv.req?'Nom du requ\u00e9rant\u00a0: '+iv.req:'')+(iv.req&&iv.tel?' \u2014 ':'')+(iv.tel?'T\u00e9l\u00a0: '+iv.tel:'')]);
    if(hDebut)rows_data.push([hDebut,'D\u00e9but']);
    if(hFin)rows_data.push([hFin,'Fin']);
    rows_data.push(['','<div style="text-align:center;"><u><b>Compte rendu de mission</b></u></div>']);
    if(_isFrelonIv(iv)&&iv._frelonData){
      const frelLine=_frelonSummaryLine(iv);
      if(frelLine)rows_data.push(['','<span style="font-size:11pt;">'+frelLine+'</span>']);
      if(iv._frelonData&&iv._frelonData.photo){
        rows_data.push(['','<div style="margin-top:6px;"><div style="font-size:10pt;font-weight:bold;margin-bottom:4px;">📷 Photo du nid :</div><img src="'+iv._frelonData.photo+'" style="max-width:300px;max-height:200px;border:1px solid #ccc;border-radius:4px;"></div>']);
      }
    }
    rows_data.push(['','<span style="white-space:pre-wrap;">'+(cr||'\u00a0')+'</span>']);
    rows_data.push(['','\u00a0']);
    rows_data.push(['',presHtml]);
  } else {
  if(iv._sdis){
    rows_data.push([iv._hAcquis||'','Acquis pr\u00e9sence pour '+(iv.n||'')+' \u00e0 l\u2019adresse suivante\u00a0: '+(iv.addr||'')+' dans la commune de '+(iv.com||'')]);
  } else {
    rows_data.push(['\u00a0','Appel du CTA/CODIS 62 pour '+(iv.n||'')+' \u00e0 l\u2019adresse suivante\u00a0: '+(iv.addr||'')+' dans la commune de '+(iv.com||'')]);
  }
  if(iv.req||iv.tel)rows_data.push(['',(iv.req?'Nom du requ\u00e9rant\u00a0: '+iv.req:'')+(iv.req&&iv.tel?' \u2014 ':'')+(iv.tel?'T\u00e9l\u00a0: '+iv.tel:'')]);
  const idxDepart=hDebut?rows_data.length:-1;if(hDebut)rows_data.push([hDebut,'D\u00e9part '+(engin||'')]);
  if(iv._sdis){
    if(iv._hSll)rows_data.push([iv._hSll,(engin||'') + ' SLL']);
    if(iv._hDispo)rows_data.push([iv._hDispo,(engin||'') + ' dispo']);
  }
  const idxRetour=hFin?rows_data.length:-1;if(hFin)rows_data.push([hFin,'Retour '+(engin||'')]);
  if(iv._avisPassage&&avisPassageHeure)rows_data.push([avisPassageHeure,'Avis de passage déposé dans la boîte aux lettres']);
  if(iv._sdis){
    rows_data.push(['','Mat\u00e9riel(s) utilis\u00e9(s)\u00a0: '+(iv._materiels||'-')]);
    rows_data.push(['','Consommable(s) utilis\u00e9(s)\u00a0: '+(iv._consommables||'-')]);
  }
  rows_data.push(['','<div style="text-align:center;"><u><b>Compte rendu de mission</b></u></div>']);
  // Ligne récapitulatif frelons (si applicable)
  if(_isFrelonIv(iv)&&iv._frelonData){
    const frelLine=_frelonSummaryLine(iv);
    if(frelLine)rows_data.push(['','<span style="font-size:11pt;">'+frelLine+'</span>']);
    if(iv._frelonData&&iv._frelonData.photo){
      rows_data.push(['','<div style="margin-top:6px;"><div style="font-size:10pt;font-weight:bold;margin-bottom:4px;">📷 Photo du nid :</div><img src="'+iv._frelonData.photo+'" style="max-width:300px;max-height:200px;border:1px solid #ccc;border-radius:4px;"></div>']);
    }
  }
  rows_data.push(['','<span style="white-space:pre-wrap;">'+(cr||'\u00a0')+'</span>']);
  rows_data.push(['','\u00a0']);
  if(iv._sdis){
    rows_data.push(['','Annotation(s) particuli\u00e8re(s)\u00a0: '+(iv._annotations||'-')]);
    rows_data.push(['','\u00a0']);
  }
  rows_data.push(['',presHtml]);
  if(iv._sdis&&iv._hOpTerminee){
    rows_data.push([iv._hOpTerminee,'Op\u00e9ration termin\u00e9e']);
  }
  }

  const B='1px solid #000';
  const _numRf=iv._numRenfort?String(iv._numRenfort):'';
  const numInterco=iv._isRenfort?_numRf:(iv._numGlobal?String(iv._numGlobal):'');
  const numUT=iv._isRenfort?_numRf:(iv._numCaserne?String(iv._numCaserne):'');
  const numSDIS=iv._isRenfort?'':(iv._numSDIS||'');
  const numMois=iv._isRenfort?_numRf:(iv._numMois?String(iv._numMois):'');

  // Index des lignes cibles pour chaque numéro
  const idxRequerant=(iv.req||iv.tel)?2:-1; // ligne requérant si présente
  // Inter CABBALR : label ET numéro sur la ligne requérant
  // (la ligne commune/appel s'étale visuellement sur 2 lignes)
  const idxIntercoLabel=1; // ligne Appel/Acquis/Renfort (index 1) — la 2ème ligne visuelle du texte long
  const _idxDebutLigne=rows_data.findIndex(function(r){return r[1]==='D\u00e9but'||(typeof r[1]==='string'&&r[1].indexOf('D\u00e9part')===0);});
  const idxIntercoVal=idxRequerant>=0?idxRequerant:(_idxDebutLigne>=0?_idxDebutLigne:2); // ligne requérant
  // UT
  const idxCRtitle=rows_data.findIndex(r=>r[1]&&r[1].includes('Compte rendu de mission'));
  const idxCRtext=idxCRtitle>=0?idxCRtitle+1:-1;
  // Du mois : label sur présents, numéro sur ligne suivante (ou même ligne si dernière)
  const idxPresents=rows_data.findIndex(r=>r[1]&&r[1].includes('Pr\u00e9sents'));
  // Pour SDIS : inter mois sur la ligne avant "Opération terminée" (avant-dernière)
  // Pour non-SDIS : inter mois sur la ligne suivant les présents
  const idxOpTerminee=rows_data.findIndex(r=>r[1]&&r[1].includes('Op\u00e9ration termin'));
  const idxMoisVal=iv._sdis&&idxOpTerminee>=0
    ?(idxOpTerminee>0?idxOpTerminee-1:idxOpTerminee)
    :(idxPresents>=0?(idxPresents<rows_data.length-1?idxPresents+1:idxPresents):-1);
  // SDIS : label sur matériels, numéro sur consommables
  const idxMateriels=rows_data.findIndex(r=>r[1]&&r[1].includes('Mat\u00e9riel'));
  const idxConso=rows_data.findIndex(r=>r[1]&&r[1].includes('Consommable'));

  // ghLabel : juste le libellé (sans numéro)
  // ghVal   : juste le numéro en gras
  function ghLabel(label,color){
    return '<div style="font-size:12pt;color:'+color+';margin-top:3px;font-weight:600;">'+label+'</div>';
  }
  function ghVal(val,color){
    return val?'<div style="font-size:14pt;font-weight:bold;color:'+color+';">'+val+'</div>':'';
  }

  let rows_html='';
  rows_data.forEach(function(rd,i){
    const gh=rd[0],tx=rd[1];
    const isLast=(i===rows_data.length-1);
    const bb=isLast?'border-bottom:'+B+';':'';
    const ghStyle='style="width:28mm;border-left:'+B+';border-right:'+B+';'+bb+'text-align:center;vertical-align:top;padding:1px 3px;font-size:12pt;font-weight:bold;line-height:1.6;"';
    const txStyle='style="border-right:'+B+';'+bb+'vertical-align:top;padding:1px 5px;font-size:12pt;line-height:1.6;"';
    let ghExtra='';
    const _lblP=iv._isRenfort?'Renfort':'Inter';
    // Inter CABBALR : label + numéro sur la même ligne (requérant)
    if(i===idxIntercoLabel&&numInterco)  ghExtra+=ghLabel(_lblP+' CABBALR','#1A6B1A');
    if(i===idxIntercoVal&&numInterco)    ghExtra+=ghVal(numInterco,'#1A6B1A');
    // UT
    if(i===idxCRtitle&&numUT)           ghExtra+=ghLabel(_lblP+' UT','#6A0DAD');
    if(i===idxCRtext&&numUT)            ghExtra+=ghVal(numUT,'#6A0DAD');
    // Du mois : label sur présents, numéro sur ligne suivante (ou même ligne si dernière)
    if(i===idxPresents&&numMois)        ghExtra+=ghLabel(_lblP+' mois','#C0392B');
    if(i===idxMoisVal&&numMois)         ghExtra+=ghVal(numMois,'#C0392B');
    // SDIS
    if(i===idxMateriels&&numSDIS)       ghExtra+=ghLabel('Inter SDIS','#003399');
    if(i===idxConso&&numSDIS)           ghExtra+=ghVal(numSDIS,'#003399');
    rows_html+='<tr><td '+ghStyle+'>'+(gh||'')+ghExtra+'</td><td '+txStyle+'>'+tx+'</td></tr>';
  });

  // Autorisation
  let autBody='';
  const autorisationList=Array.isArray(iv._autorisationNids)?iv._autorisationNids:(iv._autorisationData?[iv._autorisationData]:[]);
  if(!iv._isRenfort)autorisationList.forEach(function(data,index){
    if(!data)return;
    const autoFull=_buildAutorisationHTML(ivId,'autorisation',index);
    if(!autoFull)return;
    const bS=autoFull.indexOf('<body>'),bE=autoFull.lastIndexOf('</body>');
    if(bS>0&&bE>0){
      let ab=autoFull.slice(bS+6,bE).trim();
      ab=ab.replace(/^<div[^>]*class="page"[^>]*>/,'').replace(/<\/div>\s*$/,'');
      autBody+='<div class="aut-nid-doc"'+(index?' style="page-break-before:always;break-before:page;padding-top:5mm;"':'')+'><div style="font-size:10pt;font-weight:700;color:#6B3AA0;margin-bottom:3mm;">Nid '+(index+1)+' sur '+autorisationList.length+'</div>'+ab+'</div>';
    }
  });
  const avisBody=iv._isRenfort?'':_buildAvisPassageBody(iv);

  // Prises en charge animales : joindre la page sapeurs-pompiers de chaque
  // fiche enregistrée au compte rendu, dans l'ordre des animaux.
  let pecPagesHtml='';
  const isAnimalIv=!iv._isRenfort&&iv.n&&iv.n.toLowerCase().includes('sauvetage et capture d');
  const pecRecords=Array.isArray(iv._prisesEnCharge)?iv._prisesEnCharge:(iv._priseEnCharge?[iv._priseEnCharge]:[]);
  if(isAnimalIv&&pecRecords.length){
    pecRecords.forEach(function(record,index){
      const filled=record&&(record.espece||record.commune||record.requerant||record.telephone||record.race||record.identification||record.etat);
      if(!filled)return;
      const _pecFull=_buildPriseEnChargeHTML(ivId,index);
      if(!_pecFull)return;
      // La première div.page correspond à la partie remplie par les sapeurs-pompiers.
      const _s=_pecFull.indexOf('<div class="page">');
      const _e=_pecFull.indexOf('<div class="page">',_s+1);
      if(_s>=0){
        pecPagesHtml+=_e>0?_pecFull.slice(_s,_e):_pecFull.slice(_s,_pecFull.lastIndexOf('</body>'));
      }
    });
  }

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rapport d\u2019intervention</title>'
    +'<style>'
    +'@page{size:A4 portrait;margin:0;}'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'html{background:#666;}'
    +'body{font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#000;margin:0;padding:15px 0;background:#666;}'
    +'.page{width:210mm;min-height:297mm;margin:0 auto 20px auto;padding:10mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4);}'
    +'.pec-page{width:210mm;min-height:297mm;margin:0 auto 20px auto;padding:10mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4);font-family:Calibri,Arial,sans-serif;font-size:12pt;}'
    +'table{border-collapse:collapse;width:100%;}'
    +'.aut-wrap{margin-top:5mm;padding-top:3mm;border-top:1px dashed #bbb;}'
    +'.aut-wrap .hdr{position:relative;display:flex;align-items:center;margin-bottom:4px;min-height:35px;}'
    +'.aut-wrap .hdr img{position:absolute;left:0;top:0;height:12mm;max-width:50mm;width:auto;object-fit:contain;}'
    +'.aut-wrap .hdr-r{width:100%;text-align:center;}'
    +'.aut-wrap .hdr-r .ut-sub{font-size:10pt;}'
    +'.aut-wrap .hdr-r .utn{font-size:12pt;font-weight:bold;}'
    +'.aut-wrap h2{text-align:center;font-size:11pt;font-weight:bold;text-decoration:underline;margin:3px 0 4px;}'
    +'.aut-wrap p{margin:2px 0;line-height:1.4;font-size:9.5pt;}'
    +'.aut-wrap .sig-t{width:100%;border-collapse:collapse;margin-top:4px;}'
    +'.aut-wrap .sig-t td{border:1px solid #000;padding:4px 5px;vertical-align:top;width:50%;font-size:9.5pt;}'
    +'.avis-wrap{margin-top:5mm;padding-top:3mm;border-top:1px dashed #bbb;}'
    +'.avis-wrap .avis-document{font-size:9.5pt!important;}'
    +'.avis-wrap .avis-document h2{font-size:12pt!important;margin:1mm 0 3mm!important;}'
    +'.avis-wrap .avis-document table{margin-bottom:4mm!important;}'
    +'.avis-wrap .avis-document td{padding:1.8mm 2.5mm!important;font-size:9pt;}'
    +'.avis-wrap .avis-document p{font-size:9.5pt!important;line-height:1.35!important;}'
    +'.no-print{position:fixed;top:10px;right:10px;z-index:999;display:flex;gap:6px;background:rgba(255,255,255,.95);padding:6px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);}'
    +'.no-print button{padding:6px 12px;border:none;border-radius:5px;cursor:pointer;font-size:12px;}'
    +'p{margin:0;}'
    +'@media print{.no-print{display:none;}html,body{background:none;padding:0;}.page,.pec-page{width:100%;min-height:auto;margin:0;padding:10mm;box-shadow:none;page-break-after:always;}.page:last-child,.pec-page:last-child{page-break-after:auto;}}'
    +'</style></head><body>'
    +'<div class="no-print">'
    +'<button onclick="window.print()" style="background:#C0392B;color:#fff;">\uD83D\uDDA8 Imprimer recto-verso</button>'

    +'</div>'
    // Page 1 : rapport + documents associés
    +'<div class="page">'
    +'<table style="border-top:'+B+';border-left:0;border-right:0;">'
    +'<tr><td colspan="2" style="border-left:'+B+';border-right:'+B+';border-bottom:'+B+';text-align:center;font-size:13pt;font-weight:bold;padding:4px;">Rapport d\u2019intervention'+(iv._isRenfort?' \u2014 Renfort':'')+'</td></tr>'
    +'<tr>'
    +'<td style="width:28mm;border-left:'+B+';border-right:'+B+';border-bottom:'+B+';text-align:center;font-weight:bold;padding:3px;font-size:9.5pt;">GH</td>'
    +'<td style="border-right:'+B+';border-bottom:'+B+';text-align:center;font-weight:bold;padding:3px;font-size:9.5pt;">Texte</td>'
    +'</tr>'
    +rows_html
    +'</table>'
    +(autBody?'<div class="aut-wrap">'+autBody+'</div>':'')
    +(avisBody?'<div class="avis-wrap">'+avisBody+'</div>':'')
    +(pecPagesHtml&&(autBody||avisBody)?'<div style="min-height:60mm;page-break-after:always;break-after:page;"></div>':'')
    +'</div>'
    // Pages suivantes : une prise en charge sapeurs-pompiers par animal.
    +(pecPagesHtml?pecPagesHtml.replace(/<div class="page">/g,'<div class="pec-page">').replace(/<style>[\s\S]*?<\/style>/g,''):'')
    +'</body></html>';
}
function voirRapportIntervention(ivId) {
  const html = genRapportInterventionHTML(ivId);
  if(!html){ showToast('Données insuffisantes','warn'); return; }
  openIframeModal(html, ivId);
}


function _reloadActiveView(){
  try{applyNavRights();}catch(e){}
  const active=document.querySelector('.sec.active');
  if(!active)return;
  const id=active.id;
  try{
    if(id==='tab-interv'){rI();rPilp();}
    else if(id==='tab-home'){rAccueil();}
    else if(id==='tab-stats'){rStats();}
    else if(id==='tab-activite'){rActivite();}
    else if(id==='tab-formation'){rFormation();}
    else if(id==='tab-astreintes'){
      // Vérifier si le sous-onglet actif reste accessible
      rAstreintes();
      // Rafraîchir l'onglet astreinte tel si visible
      const telEl=document.getElementById('astr-tel');
      if(telEl&&telEl.style.display!=='none')rAstrTel();
    }
    else if(id==='tab-params'){
      if(hasRight('Administration'))rAdm();
      else rProfil();
    }
  }catch(e){console.error('_reloadActiveView',e);}
}
function toggleSuperAdminRole(){
  window._superAdminDisabled=!window._superAdminDisabled;
  const isNow=!window._superAdminDisabled;
  const btn=document.getElementById('nav-superadmin-toggle');
  if(btn){
    btn.style.background=isNow?'rgba(39,174,96,.9)':'rgba(192,57,43,.8)';
    btn.title=isNow?'Super-Admin actif':'Super-Admin désactivé';
  }
  showToast(isNow?'Super-admin activ\u00e9':'Mode normal activ\u00e9',isNow?'success':'info');
  syncCaserneContext();
  _reloadActiveView();
}

function toggleAdminRole(){
  window._adminRoleDisabled=!window._adminRoleDisabled;
  const isNow=!window._adminRoleDisabled;
  const btn=document.getElementById('nav-role-toggle');
  if(btn){
    btn.style.background=isNow?'rgba(39,174,96,.9)':'rgba(192,57,43,.8)';
    btn.title=isNow?'Admin actif':'Admin désactivé';
  }
  showToast(isNow?'R\u00f4le admin activ\u00e9':'Mode normal activ\u00e9',isNow?'success':'info');
  syncCaserneContext();
  _reloadActiveView();
}

