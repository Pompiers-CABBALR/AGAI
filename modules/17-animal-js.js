// === MODULE: animal.js ===
// ═══════════════════════════════════════════════════════════
// PRISE EN CHARGE ANIMAL — Formulaire + PDF + Mail
// ═══════════════════════════════════════════════════════════

function getPrisesEnChargeAnimal(iv){
  if(!iv)return[];
  if(Array.isArray(iv._prisesEnCharge))return iv._prisesEnCharge;
  if(iv._priseEnCharge&&Object.keys(iv._priseEnCharge).length){
    iv._prisesEnCharge=[iv._priseEnCharge];
    return iv._prisesEnCharge;
  }
  const animaux=Array.isArray(iv._animauxAppel)?iv._animauxAppel:[];
  iv._prisesEnCharge=animaux.map(function(animal,index){
    const type=animal.type||'';
    return{ficheId:'AN-'+(index+1),espece:type==='Chien'||type==='Chat'?type:'Autre',race:type&&type!=='Chien'&&type!=='Chat'?(animal.precision||type):'',etat:animal.situation||'',_brouillon:true};
  });
  if(!iv._prisesEnCharge.length)iv._prisesEnCharge=[{ficheId:'AN-1',_brouillon:true}];
  return iv._prisesEnCharge;
}
function showPrisesEnChargeManager(ivId){
  const iv=IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const fiches=getPrisesEnChargeAnimal(iv);
  document.getElementById('mt').textContent='Prises en charge des animaux';
  document.getElementById('mi').textContent=iv.n+' — '+iv.com;
  document.getElementById('mb').innerHTML='<div style="font-size:12px;color:var(--t2);margin-bottom:10px;">Une fiche distincte doit être complétée pour chaque animal.</div>'
    +'<div style="display:flex;flex-direction:column;gap:8px;">'
    +fiches.map(function(f,index){
      const titre=(f.espece||f.race||'Animal')+(f.race&&f.espece!=='Autre'?' — '+f.race:'');
      return'<div style="border:1px solid var(--brd);border-radius:10px;padding:10px;background:#fff;display:flex;align-items:center;gap:8px;">'
        +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;">Fiche '+(index+1)+' — '+escHtml(titre)+'</div>'
        +'<div style="font-size:11px;color:var(--t2);">'+(f._brouillon?'À compléter':'Enregistrée')+(f.telephone?' · '+escHtml(f.telephone):'')+'</div></div>'
        +'<button class="btn sm" onclick="showPriseEnChargeModal(\''+ivId+'\','+index+')">✏️ Ouvrir</button>'
        +(fiches.length>1?'<button class="btn sm danger" onclick="deletePriseEnChargeAnimal(\''+ivId+'\','+index+')">🗑️</button>':'')
        +'</div>';
    }).join('')
    +'</div><button class="btn sm" style="width:100%;margin-top:10px;color:#E67E22;border-color:#E67E22;" onclick="addPriseEnChargeAnimal(\''+ivId+'\')">＋ Nouvelle fiche animal</button>';
  prepareAnimalModal(false);
  openModalAtTop();
}
function addPriseEnChargeAnimal(ivId){
  const iv=IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const fiches=getPrisesEnChargeAnimal(iv),index=fiches.length;
  fiches.push({ficheId:'AN-'+(index+1),_brouillon:true});saveData();
  showPriseEnChargeModal(ivId,index);
}
function deletePriseEnChargeAnimal(ivId,index){
  const iv=IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  confirmModal('Supprimer cette fiche de prise en charge ?',function(){
    const fiches=getPrisesEnChargeAnimal(iv);fiches.splice(index,1);saveData();showPrisesEnChargeManager(ivId);
  });
}
function showPriseEnChargeModal(ivId,ficheIndex) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  if(ficheIndex===undefined||ficheIndex===null){showPrisesEnChargeManager(ivId);return;}
  const fiches=getPrisesEnChargeAnimal(iv);
  ficheIndex=Math.max(0,Number(ficheIndex)||0);
  const cas = CC();
  const saved = fiches[ficheIndex] || {};
  const today = new Date();
  const dateDefault = today.getFullYear()+'-'+pad(today.getMonth()+1)+'-'+pad(today.getDate());
  const heureDefault = pad(today.getHours())+':'+pad(today.getMinutes());
  // Mémoriser la première heure d'ouverture si pas encore renseigné
  if(!saved.heureOuverture) {
    saved.heureOuverture = heureDefault;
    fiches[ficheIndex]=saved;
    saveData();
  }
  const heureInit = saved.heureOuverture || heureDefault;

  document.getElementById('mt').textContent = 'Prise en charge animal — fiche '+(ficheIndex+1);
  document.getElementById('mi').textContent = iv.n + ' \u2014 ' + iv.com;
  document.getElementById('mb').innerHTML =
    '<div class="pec-form-scroll">'
    // Renseignements administratifs
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);margin-bottom:8px;letter-spacing:.04em;">Renseignements administratifs</div>'
    + '<div class="pec-form-grid">'
    + '<div class="fg"><div class="fgl">Date intervention</div><input class="fi" id="pec-date" type="date" value="'+(saved.date||dateDefault)+'"/></div>'
    + '<div class="fg"><div class="fgl">Heure</div><input class="fi" id="pec-heure" type="time" value="'+(saved.heure||heureInit)+'"/></div>'
    + '</div>'
    + '<div class="pec-two-col" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    + '<div class="fg"><div class="fgl">Nom du requérant</div><input class="fi" id="pec-requerant" type="text" value="'+escHtml(saved.requerant||iv.req||'')+'" placeholder="Nom"/></div>'
    + '<div class="fg"><div class="fgl">Numéro de téléphone</div><input class="fi" id="pec-telephone" type="tel" value="'+escHtml(saved.telephone||iv.tel||'')+'" placeholder="06 XX XX XX XX"/></div>'
    + '</div>'
    + '<div class="fg"><div class="fgl">Adresse intervention</div><input class="fi" id="pec-adresse" type="text" value="'+(saved.adresse||iv.addr||iv.adr||'')+'"/></div>'
    + '<div class="fg"><div class="fgl">Commune</div><input class="fi" id="pec-commune" type="text" value="'+(saved.commune||iv.com||'')+'"/></div>'

    // Description animal
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);margin:10px 0 8px;letter-spacing:.04em;">Description de l\'animal</div>'
    + '<div class="pec-form-grid">'
    + '<div class="fg"><div class="fgl">Espèce</div>'
    + '<div class="pec-choice-row" style="margin-top:4px;">'
    + '<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;"><input type="radio" name="pec-espece" value="Chien" '+((!saved.espece||saved.espece==='Chien')?'checked':'')+' style="accent-color:var(--red);"> Chien</label>'
    + '<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;"><input type="radio" name="pec-espece" value="Chat" '+(saved.espece==='Chat'?'checked':'')+' style="accent-color:var(--red);"> Chat</label>'
    + '<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;"><input type="radio" name="pec-espece" value="Autre" '+(saved.espece==='Autre'?'checked':'')+' style="accent-color:var(--red);"> Autre</label>'
    + '</div></div>'
    + '<div class="fg"><div class="fgl">Sexe</div>'
    + '<div class="pec-choice-row" style="margin-top:4px;">'
    + '<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;"><input type="radio" name="pec-sexe" value="M" '+(saved.sexe==='M'?'checked':'')+' style="accent-color:var(--red);"> Mâle</label>'
    + '<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;"><input type="radio" name="pec-sexe" value="F" '+(saved.sexe==='F'?'checked':'')+' style="accent-color:var(--red);"> Femelle</label>'
    + '<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;"><input type="radio" name="pec-sexe" value="Inconnu" '+(saved.sexe==='Inconnu'||!saved.sexe?'checked':'')+' style="accent-color:var(--red);"> Inconnu</label>'
    + '</div></div>'
    + '</div>'
    + '<div class="pec-form-grid">'
    + '<div class="fg"><div class="fgl">Race <span id="pec-race-aide-btn" onclick="togglePecAide(\'race\')" style="cursor:pointer;font-size:10px;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:4px;padding:1px 6px;margin-left:4px;">❓ Aide</span> <span onclick="ouvrirGaleriePec(\'race\')" style="cursor:pointer;font-size:10px;background:#F0FDF4;color:#166534;border:1px solid #86EFAC;border-radius:4px;padding:1px 6px;margin-left:2px;">🖼 Galerie</span></div>'
    + '<input class="fi" id="pec-race" type="text" value="'+(saved.race||'')+'" placeholder="Ex: Labrador, croisé..."/>'
    + '<div id="pec-race-aide" style="display:none;margin-top:4px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:8px;font-size:11px;">'
    + '<div style="font-weight:600;margin-bottom:4px;color:#1D4ED8;">Races fréquentes :</div>'
    + '<div id="pec-race-chips" style="display:flex;flex-wrap:wrap;gap:4px;"></div>'
    + '</div></div>'
    + '<div class="fg"><div class="fgl">Couleur <span id="pec-couleur-aide-btn" onclick="togglePecAide(\'couleur\')" style="cursor:pointer;font-size:10px;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:4px;padding:1px 6px;margin-left:4px;">❓ Aide</span> <span onclick="ouvrirGaleriePec(\'couleur\')" style="cursor:pointer;font-size:10px;background:#F0FDF4;color:#166534;border:1px solid #86EFAC;border-radius:4px;padding:1px 6px;margin-left:2px;">🖼 Galerie</span></div>'
    + '<input class="fi" id="pec-couleur" type="text" value="'+(saved.couleur||'')+'" placeholder="Ex: Noir, fauve et blanc..."/>'
    + '<div id="pec-couleur-aide" style="display:none;margin-top:4px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:8px;font-size:11px;">'
    + '<div style="font-weight:600;margin-bottom:4px;color:#1D4ED8;">Couleurs fréquentes :</div>'
    + '<div id="pec-couleur-chips" style="display:flex;flex-wrap:wrap;gap:4px;"></div>'
    + '</div></div>'
    + '</div>'
    + '<div class="fg"><div class="fgl">N° identification (puce/tatouage)</div><input class="fi" id="pec-identification" type="text" value="'+(saved.identification||'')+'"/></div>'

    // Statut animal
    + '<div class="fg"><div class="fgl" style="margin-bottom:6px;">Statut de l\'animal</div>'
    + '<div style="display:flex;flex-direction:column;gap:4px;">'
    + ['Errant','Gravement blessé','Décédé','Dangereux (sauf chiens de 1ère catégorie)','Gardes sociales'].map(function(s){
        const chk = saved.statuts && saved.statuts.includes(s);
        return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">'
          +'<input type="checkbox" name="pec-statut" value="'+s+'" '+(chk?'checked':'')+' style="accent-color:var(--red);width:15px;height:15px;"> '+s+'</label>';
      }).join('')
    + '<div id="pec-proprio-bloc" style="'+(saved.statuts&&saved.statuts.includes('Gardes sociales')?'':'display:none;')+'">'
    + '<input class="fi" id="pec-proprio" type="text" placeholder="Nom du propriétaire" value="'+(saved.proprietaire||'')+'"/></div>'
    + '</div></div>'

    // État sanitaire
    + '<div class="fg"><div class="fgl">État sanitaire et comportement</div>'
    + '<textarea class="fi" id="pec-etat" rows="2" style="resize:vertical;">'+(saved.etat||'')+'</textarea></div>'

    // Destination
    + '<div class="fg"><div class="fgl" style="margin-bottom:6px;">Animal déposé</div>'
    + '<div class="pec-choice-row" style="gap:16px;">'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="checkbox" id="pec-fourriere" '+(saved.fourriere?'checked':'')+' style="accent-color:var(--red);width:15px;height:15px;"> À la fourrière</label>'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="checkbox" id="pec-veterinaire" '+(saved.veterinaire?'checked':'')+' style="accent-color:var(--red);width:15px;height:15px;"> Chez le vétérinaire</label>'
    + '</div></div>'

    // Mail vétérinaire si coché
    + '<div id="pec-vet-email-bloc" style="'+(saved.veterinaire?'':'display:none;')+'">'
    + '<div class="fg"><div class="fgl">Email du vétérinaire</div><input class="fi" id="pec-vet-email" type="email" placeholder="veterinaire@exemple.fr" value="'+(saved.vetEmail||'')+'"/></div>'
    + '</div>'

    // Boutons
    + '<div class="brow" style="margin-top:12px;flex-wrap:wrap;gap:6px;">'
    + '<button class="btn sm" style="background:#185FA5;color:#fff;" onclick="previewPriseEnCharge(\''+ivId+'\','+ficheIndex+')">&#x1F5A8; Aperçu PDF</button>'
    + '<button class="btn sm" style="background:#E67E22;color:#fff;" onclick="envoyerPriseEnCharge(\''+ivId+'\','+ficheIndex+')">&#x2709;&#xFE0F; Envoyer</button>'
    + '<button class="btn sm" onclick="savePriseEnCharge(\''+ivId+'\','+ficheIndex+')">&#x1F4BE; Sauvegarder</button>'
    + '<button class="btn sm" onclick="showPrisesEnChargeManager(\''+ivId+'\')">← Toutes les fiches</button>'
    + '</div></div>';

  prepareAnimalModal(true);
  openModalAtTop();
  registerMobileModalFields(document.querySelector('#mb .pec-form-scroll'));

  // Listeners dynamiques
  setTimeout(function(){
    document.querySelectorAll('input[name="pec-statut"]').forEach(function(cb){
      cb.addEventListener('change', function(){
        const pecProprio = document.getElementById('pec-proprio-bloc');
        const gardesSociales = document.querySelector('input[name="pec-statut"][value="Gardes sociales"]');
        if(pecProprio && gardesSociales) pecProprio.style.display = gardesSociales.checked ? '' : 'none';
      });
    });
    const cbVet = document.getElementById('pec-veterinaire');
    if(cbVet) cbVet.addEventListener('change', function(){
      const bloc = document.getElementById('pec-vet-email-bloc');
      if(bloc) bloc.style.display = cbVet.checked ? '' : 'none';
    });
  }, 100);
}


// Données d'aide prise en charge animal
const PEC_RACES = {
  'Chien': ['Berger Allemand','Berger Belge','Border Collie','Bouledogue Français','Boxer','Briard','Caniche','Cavalier King Charles','Chihuahua','Cocker Spaniel','Dalmatien','Golden Retriever','Husky Sibérien','Jack Russell','Labrador','Malinois','Pitbull','Rottweiler','Shih Tzu','Yorkshire','Croisé / Sans race'],
  'Chat':  ['Bengal','Birman','British Shorthair','Chartreux','Européen','Maine Coon','Persan','Ragdoll','Siamois','Sphynx','Croisé / Sans race'],
  'Autre': ['Non identifié']
};
const PEC_COULEURS = {
  'Chien': ['Noir','Blanc','Fauve','Brun / Marron','Gris','Beige / Crème','Roux','Bicolore noir et blanc','Bicolore fauve et noir','Tricolore','Arlequin','Merle','Tigré'],
  'Chat':  ['Noir','Blanc','Gris / Bleu','Roux / Orange','Crème','Tabby (rayé)','Bicolore noir et blanc','Bicolore roux et blanc','Tricolore (calico)','Écaille de tortue'],
  'Autre': ['Noir','Blanc','Gris','Brun','Roux','Beige','Multicolore']
};

function ouvrirGaleriePec(type) {
  const especeEl = document.querySelector('input[name="pec-espece"]:checked');
  const espece = especeEl ? especeEl.value : 'Chien';
  const inputId = type==='race' ? 'pec-race' : 'pec-couleur';
  const titre = type==='race' ? 'Races — '+espece : 'Couleurs — '+espece;

  const RACES = {
    'Chien': ['Berger Allemand','Berger Belge Malinois','Border Collie','Bouledogue Français','Boxer','Caniche','Chihuahua','Cocker Spaniel','Golden Retriever','Husky Sibérien','Jack Russell','Labrador','Rottweiler','Yorkshire Terrier','Croisé'],
    'Chat':  ['Bengal','British Shorthair','Chartreux','Européen commun','Maine Coon','Persan','Ragdoll','Siamois','Croisé'],
    'Autre': ['Inconnu']
  };
  const COULEURS = {
    'Chien': ['Chien noir','Chien blanc','Chien fauve','Chien brun marron','Chien gris','Chien beige crème','Chien roux','Chien bicolore noir blanc','Chien bicolore fauve noir','Chien tricolore','Chien tigré bringé'],
    'Chat':  ['Chat noir','Chat blanc','Chat gris bleu','Chat roux orange','Chat crème beige','Chat tabby rayé','Chat bicolore noir blanc','Chat tricolore calico','Chat écaille tortue'],
    'Autre': ['Animal noir','Animal blanc','Animal gris','Animal brun','Animal roux','Animal multicolore']
  };
  const NOMS_COULEURS = {
    'Chien': ['Noir','Blanc','Fauve','Brun / Marron','Gris','Beige / Crème','Roux','Bicolore noir et blanc','Bicolore fauve et noir','Tricolore','Tigré / Bringé'],
    'Chat':  ['Noir','Blanc','Gris / Bleu','Roux / Orange','Crème / Beige','Tabby rayé','Bicolore noir et blanc','Tricolore calico','Écaille de tortue'],
    'Autre': ['Noir','Blanc','Gris','Brun','Roux','Multicolore']
  };

  const searchTerms = type==='race' ? (RACES[espece]||RACES['Chien']) : (COULEURS[espece]||COULEURS['Chien']);
  const noms = type==='race' ? searchTerms : (NOMS_COULEURS[espece]||NOMS_COULEURS['Chien']);

  let cards = '';
  searchTerms.forEach(function(q, i){
    const nom = noms[i] || q;
    const url = 'https://www.google.com/search?tbm=isch&q='+encodeURIComponent(q+' animal domestique');
    cards += '<div class="card">'
      +'<a href="'+url+'" target="_blank" class="card-img-link">'
      +'<div class="card-img">'
      +'<div style="font-size:11px;color:#555;text-align:center;padding:8px;">🔍<br>Voir photos<br><em style=\"font-size:10px;color:#888;\">'+q+'</em></div>'
      +'</div></a>'
      +'<div class="card-label">'+nom+'</div>'
      +'<button class="card-btn" data-nom="'+nom+'">✓ Choisir</button>'
      +'</div>';
  });

  const html = '<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>'+titre+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:Calibri,Arial,sans-serif;background:#f4f4f4;padding:14px;}'
    +'h2{font-size:15px;font-weight:700;color:#222;margin-bottom:4px;}'
    +'.sub{font-size:11px;color:#666;margin-bottom:10px;}'
    +'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;}'
    +'.card{background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;}'
    +'.card-img-link{text-decoration:none;}'
    +'.card-img{height:80px;background:#EFF6FF;border-bottom:1px solid #BFDBFE;display:flex;align-items:center;justify-content:center;}'
    +'.card-img:hover{background:#DBEAFE;}'
    +'.card-label{padding:5px 6px;font-size:11px;font-weight:600;text-align:center;flex:1;display:flex;align-items:center;justify-content:center;line-height:1.3;}'
    +'.card-btn{background:#C0392B;color:#fff;border:none;padding:6px;font-size:11px;font-weight:700;cursor:pointer;width:100%;}'
    +'.card-btn:hover{background:#922B21;}'
    +'</style>'
    +'<base target=\"_blank\">'
    +'</head><body>'
    +'<h2>'+titre+'</h2>'
    +'<div class="sub">🔍 Clic sur la carte = voir photos Google Images. ✓ Choisir = remplir le champ.</div>'
    +'<div class="grid">'+cards+'</div>'
    +'<script>'
    +'document.querySelectorAll(".card-btn").forEach(function(btn){'
    +'  btn.addEventListener("click",function(){'
    +'    var val=this.getAttribute("data-nom");'
    +'    try{window.parent.document.getElementById("'+inputId+'").value=val;'
    +'    window.parent.closeIframeModal();}catch(e){alert("Sélectionné: "+val);}'
    +'  });'
    +'});'
    +'<\/script>'
    +'</body></html>';

  openIframeModal(html);
}

function togglePecAide(type) {
  const div = document.getElementById('pec-'+type+'-aide');
  if(!div) return;
  const visible = div.style.display !== 'none';
  if(visible) { div.style.display='none'; return; }
  // Récupérer l'espèce sélectionnée
  const especeEl = document.querySelector('input[name="pec-espece"]:checked');
  const espece = especeEl ? especeEl.value : 'Chien';
  const data = type==='race' ? (PEC_RACES[espece]||PEC_RACES['Chien']) : (PEC_COULEURS[espece]||PEC_COULEURS['Chien']);
  const chips = document.getElementById('pec-'+type+'-chips');
  if(chips) {
    chips.innerHTML = data.map(function(v) {
      return '<span onclick="pecChipClick(\''+type+'\',\''+v.replace(/'/g,"\\'")+'\')" style="cursor:pointer;background:#fff;border:1px solid #93C5FD;border-radius:12px;padding:2px 8px;font-size:10px;color:#1E40AF;white-space:nowrap;">'+v+'</span>';
    }).join('');
  }
  div.style.display = 'block';
}
function pecChipClick(type, val) {
  const el = document.getElementById('pec-'+type);
  if(el) el.value = val;
  const div = document.getElementById('pec-'+type+'-aide');
  if(div) div.style.display='none';
}

function savePriseEnCharge(ivId,ficheIndex) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const fiches=getPrisesEnChargeAnimal(iv);
  ficheIndex=Math.max(0,Number(ficheIndex)||0);
  const statuts = Array.from(document.querySelectorAll('input[name="pec-statut"]:checked')).map(function(c){return c.value;});
  const especeEl = document.querySelector('input[name="pec-espece"]:checked');
  const sexeEl   = document.querySelector('input[name="pec-sexe"]:checked');
  const savedBefore=fiches[ficheIndex]||{};
  const fiche = {
    ficheId:        savedBefore.ficheId||('AN-'+(ficheIndex+1)),
    date:           (document.getElementById('pec-date')||{}).value||'',
    heure:          (document.getElementById('pec-heure')||{}).value||'',
    heureOuverture: savedBefore.heureOuverture||'',
    requerant:      (document.getElementById('pec-requerant')||{}).value||'',
    telephone:      (document.getElementById('pec-telephone')||{}).value||'',
    adresse:        (document.getElementById('pec-adresse')||{}).value||'',
    commune:        (document.getElementById('pec-commune')||{}).value||'',
    espece:         especeEl ? especeEl.value : 'Chien',
    sexe:           sexeEl ? sexeEl.value : 'M',
    race:           (document.getElementById('pec-race')||{}).value||'',
    couleur:        (document.getElementById('pec-couleur')||{}).value||'',
    identification: (document.getElementById('pec-identification')||{}).value||'',
    statuts:        statuts,
    proprietaire:   (document.getElementById('pec-proprio')||{}).value||'',
    etat:           (document.getElementById('pec-etat')||{}).value||'',
    fourriere:      !!(document.getElementById('pec-fourriere')||{}).checked,
    veterinaire:    !!(document.getElementById('pec-veterinaire')||{}).checked,
    vetEmail:       (document.getElementById('pec-vet-email')||{}).value||'',
    _brouillon:     false
  };
  fiches[ficheIndex]=fiche;
  iv._prisesEnCharge=fiches;
  iv._priseEnCharge=fiche; // compatibilité avec les anciennes éditions et rapports
  saveData();
  showToast('Fiche animal '+(ficheIndex+1)+' sauvegardée','success');
}


function _buildPriseEnChargeHTML(ivId,ficheIndex) {
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return '';
  const cas = CC();
  const utNom = cas ? cas.nom.replace(/^UT\s+/i,'').trim() : '';
  const fiches=getPrisesEnChargeAnimal(iv);
  ficheIndex=Math.max(0,Number(ficheIndex)||0);
  const d = fiches[ficheIndex] || iv._priseEnCharge || {};
  const dateFr = d.date ? d.date.split('-').reverse().join('/') : '';
  const logo = _getLogoSrc();

  // Case à cocher : carré avec ✓ gras si coché
  function cb(v) {
    return v
      ? '<span style="display:inline-block;width:13px;height:13px;border:1.5px solid #000;vertical-align:middle;margin-right:3px;text-align:center;line-height:13px;font-size:11px;font-weight:bold;">&#x2718;</span>'
      : '<span style="display:inline-block;width:13px;height:13px;border:1.5px solid #000;vertical-align:middle;margin-right:3px;"></span>';
  }
  function cbv(v,arr){return cb((arr||[]).includes(v));}

  // CSS global
  const css = '<style>'
    +'@page{size:A4 portrait;margin:0;}'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#000;background:#666;padding:15px 0;}'
    +'.page{width:210mm;min-height:297mm;margin:0 auto 20px auto;padding:10mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4);}'
    +'table{border-collapse:collapse;width:100%;}'
    +'p{margin:0;}'
    +'.no-print{position:fixed;top:10px;right:10px;z-index:999;background:rgba(255,255,255,.95);padding:6px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);}'
    +'.no-print button{padding:6px 14px;border:none;border-radius:5px;cursor:pointer;font-size:12px;background:#C0392B;color:#fff;font-weight:700;}'
    +'@media print{.no-print{display:none !important;}body{background:none;padding:0;}.page{width:210mm;margin:0;padding:10mm;box-shadow:none;page-break-after:always;}.page:last-child{page-break-after:auto;}}'
    +'</style>';

  // ══ EN-TÊTE (identique pages 1 et 2) ══
  function hdr() {
    return '<div style="position:relative;min-height:19mm;margin-bottom:1mm;">'
      +'<img src="'+logo+'" style="position:absolute;left:0;top:0;width:83.1mm;height:20mm;object-fit:contain;">'
      +'<div style="margin-left:90mm;">'
      +'<div style="font-size:18pt;font-weight:bold;text-decoration:underline;text-align:center;font-family:Calibri,Arial,sans-serif;">Prise en charge</div>'
      +'<div style="font-size:14pt;text-align:justify;font-family:Calibri,Arial,sans-serif;">d\'un animal domestique en <strong>URGENCE</strong> pour la fourrière de la Communauté d\'Agglomération Béthune-Bruay, Artois Lys Romane</div>'
      +'</div></div>'
      // Fiche encadrée
      +'<div style="border:1.5pt solid #000;text-align:center;padding:2px 5px;margin-bottom:1mm;">'
      +'<span style="font-size:20pt;font-weight:bold;font-style:italic;text-decoration:underline;font-family:Calibri,Arial,sans-serif;">Fiche de renseignements et de transfert</span>'
      +'</div>'
      // 2 phrases intro
      +'<p style="font-size:14pt;font-family:Calibri,Arial,sans-serif;text-align:center;margin-top:0.5mm;margin-bottom:0;">Pour tout dépôt d\'un animal domestique à la fourrière animale ou chez le vétérinaire <sup>(1)</sup></p>'
      +'<p style="font-size:14pt;font-weight:bold;font-family:Calibri,Arial,sans-serif;text-align:center;margin-top:0;margin-bottom:1.5mm;">Cette fiche doit <u>obligatoirement</u> être donnée en même temps que le dépôt de l\'animal.</p>';
  }

  // Styles cellules
  const H0 = 'background:#D9D9D9;font-size:16pt;font-weight:bold;font-style:italic;font-family:Calibri,Arial,sans-serif;text-align:center;padding:3px 5px;border:1pt solid #000;';
  const H1 = 'background:#D9D9D9;font-size:14pt;font-weight:bold;font-style:italic;font-family:Calibri,Arial,sans-serif;text-align:center;padding:2px 5px;border:1pt solid #000;';
  const LB = 'font-size:12pt;font-style:italic;font-family:Calibri,Arial,sans-serif;padding:2px 5px;border:1pt solid #000;vertical-align:top;';
  const LM = 'font-size:12pt;font-style:italic;font-family:Calibri,Arial,sans-serif;padding:2px 5px;border:1pt solid #000;vertical-align:middle;';
  const CE = 'padding:2px 5px;border:1pt solid #000;vertical-align:top;overflow:hidden;';
  const VAL = 'font-size:14pt;font-weight:bold;font-style:normal;font-family:Calibri,Arial,sans-serif;';

  // ══ PAGE 1 — TABLE SAPEURS-POMPIERS ══
  const t1 = '<table style="width:100%;table-layout:fixed;">'
    +'<colgroup><col style="width:95mm;"><col style="width:95mm;"></colgroup>'
    // R0 titre
    +'<tr><td colspan="2" style="'+H0+'">Partie à remplir par les sapeurs-pompiers volontaires</td></tr>'
    // R1 en-têtes
    +'<tr><td style="'+H1+'">Renseignements administratifs</td><td style="'+H1+'">Description de l\'animal</td></tr>'
    // R2 UT / Espèce
    +'<tr style="height:16mm;">'
    +'<td style="'+LB+'">Unité territoriale de :<br><div style="text-align:center;margin-top:2mm;"><span style="font-size:18pt;font-weight:bold;font-style:normal;">'+utNom+'</span></div></td>'
    +'<td style="'+LB+'">Espèce :<br><table style="width:100%;border:none;margin-top:2mm;"><tr>'
    +'<td style="border:none;width:50%;"><span style="'+VAL+'">'+cb(d.espece==='Chien')+'</span> <span style="font-size:11pt;">Chien</span></td>'
    +'<td style="border:none;width:50%;"><span style="'+VAL+'">'+cb(d.espece==='Chat')+'</span> <span style="font-size:11pt;">Chat</span></td>'
    +'</tr></table></td>'
    +'</tr>'
    // R3 Nom/Tel / Sexe
    +'<tr style="height:14mm;">'
    +'<td style="'+LB+'">Nom de la personne / Numéro de téléphone :'+((d.requerant||d.telephone)?'<br><span style="'+VAL+'">'+(d.requerant||'')+(d.telephone?' — '+d.telephone:'')+'</span>':'')+'</td>'
    +'<td style="'+LB+'">Sexe :<br><table style="width:100%;border:none;margin-top:2mm;"><tr>'
    +'<td style="border:none;width:50%;"><span style="'+VAL+'">'+cb(d.sexe==='M')+'</span> <span style="font-size:11pt;">Mâle</span></td>'
    +'<td style="border:none;width:50%;"><span style="'+VAL+'">'+cb(d.sexe==='F')+'</span> <span style="font-size:11pt;">Femelle</span></td>'
    +'</tr></table></td>'
    +'</tr>'
    // R4 Date / Race
    +'<tr style="height:14mm;">'
    +'<td style="'+LB+'">Date et heure de prise en charge de l\'animal :'+(dateFr?'<br><span style="'+VAL+'">'+dateFr+(d.heure?' à '+d.heure:'')+'</span>':'')+'</td>'
    +'<td style="'+LB+'">Race :'+(d.race?'<br><span style="'+VAL+'">'+d.race+'</span>':'')+'</td>'
    +'</tr>'
    // R5 Statut / Couleur+N°id
    +'<tr style="height:32mm;">'
    +'<td style="'+LB+'">Statut de l\'animal :<br>'
    +'<table style="width:100%;border:none;margin-top:2mm;"><tr>'
    +'<td style="border:none;width:50%;padding:1px 0;">'+cb(d.statuts&&d.statuts.includes('Errant'))+' <span style="font-size:11pt;">Errant</span></td>'
    +'<td style="border:none;width:50%;padding:1px 0;">'+cb(d.statuts&&d.statuts.includes('Gravement blessé'))+' <span style="font-size:11pt;">Gravement blessé</span></td>'
    +'</tr><tr>'
    +'<td style="border:none;padding:1px 0;">'+cb(d.statuts&&d.statuts.includes('Décédé'))+' <span style="font-size:11pt;">Décédé</span></td>'
    +'<td style="border:none;padding:1px 0;">'+cb(d.statuts&&d.statuts.includes('Dangereux (sauf chiens de 1ère catégorie)'))+' <span style="font-size:11pt;">Dangereux</span> <em style="font-size:9pt;">(sauf chiens de 1<sup>ère</sup> catégorie)</em></td>'
    +'</tr><tr>'
    +'<td colspan="2" style="border:none;padding:1px 0;">'+cb(d.statuts&&d.statuts.includes('Gardes sociales'))+' <span style="font-size:11pt;">Gardes sociales*</span></td>'
    +'</tr></table>'
    +'<div style="font-size:9pt;font-style:italic;margin-top:3mm;">* Nom du propriétaire : <span style="font-style:normal;border-bottom:1pt solid #000;display:inline-block;width:150px;">'+(d.proprietaire||'')+'</span></div>'
    +'</td>'
    +'<td style="'+LB+'vertical-align:top;">Couleur :'+(d.couleur?'<br><span style="'+VAL+'">'+d.couleur+'</span>':'')
    +'<div style="border-top:0.5pt solid #000;margin:4mm 0 2mm;"></div>'
    +'N° identification :'+(d.identification?'<br><span style="'+VAL+'">'+d.identification+'</span>':'')+'</td>'
    +'</tr>'
    // R6 Commune / État sanitaire (rowspan 2)
    +'<tr style="height:14mm;">'
    +'<td style="'+LB+'">Dans la commune de :'+(d.commune?'<br><span style="'+VAL+'">'+d.commune+'</span>':'')+'</td>'
    +'<td style="'+LB+'" rowspan="2">État sanitaire et comportement de l\'animal :'+(d.etat?'<br><span style="'+VAL+'">'+d.etat+'</span>':'')+'</td>'
    +'</tr>'
    // R7 Adresse / (état continue)
    +'<tr style="height:20mm;">'
    +'<td style="'+LB+'">Adresse de l\'intervention :'+(d.adresse?'<br><span style="'+VAL+'">'+d.adresse+'</span>':'')+'</td>'
    +'</tr>'
    // R8 Animal déposé
    +'<tr style="height:9mm;">'
    +'<td colspan="2" style="'+LM+'"><em style="font-size:10pt;">Animal déposé :</em>'
    +'&emsp;&emsp;'+cb(d.fourriere)+' <span style="font-size:11pt;">À la fourrière</span>'
    +'&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;'
    +cb(d.veterinaire)+' Chez le vétérinaire <sup>(1)</sup>'
    +'</td></tr>'
    +'</table>';

  // Communes 6 colonnes (comme dans le PDF)
  const comLst=['Allouagne','Ames','Amettes','Annequin','Annezin','Auchel','Auchy-au-bois','Auchy-les-Mines','Bajus','Barlin','Béthune','Beugin','Beuvry','Billy-Berclau','Blessy','Bourecq','Bruay-la-Buissière','Burbure','Busnes','Calonne-Ricouart','Calonne-sur-la-Lys','Camblain-Châtelain','Cambrin','Cauchy-à-la-Tour','Caucourt','Chocques','Cuinchy','Diéval','Divion','Douvrin','Drouvin-le-Marais','Ecquedecques','Essars','Estrée-Blanche','Estrée-Cauchy','Ferfay','Festubert','Fouquereuil','Fouquières-lès-Béthune','Fresnicourt-le-Dolmen','Gauchin-Légal','Givenchy-lès-la-Bassée','Gonnehem','Gosnay','Guarbecque','Haillicourt','Haisnes','Ham-en-Artois','Hermin','Hersin-Coupigny','Hesdigneul-lès-Béthune','Hinges','Houchin','Houdain','Isbergues','La Comté','La Couture','Labeuvrière','Labourse','Lambres','Lapugnoy','Lespesses','Lières','Liettres','Ligny-lès-Aire','Lillers','Linghem','Locon','Lorgies','Lozinghem','Maisnil-lès-Ruitz','Marles-les-Mines','Mazinghem','Mont-Bernanchon','Neuve-Chapelle','Nœux-les-Mines','Norrent-Fontes','Noyelles-lès-Vermelles','Oblinghem','Ourton','Quernes','Rebreuve-Ranchicourt','Rely','Richebourg','Robecq','Rombly','Ruitz','Sailly-Labourse','Saint-Floris','Saint-Hiliaire-Cottes','Saint-Venant','Vaudricourt','Vendin-lès-Béthune','Vermelles','Verquigneul','Verquin','Vieille-Chapelle','Violaines','Westrehem','Witterness'];
  const NB_COLS = 6;
  const comCols = [];
  for(var i=0;i<NB_COLS;i++) comCols.push([]);
  comLst.forEach(function(c,i){comCols[i%NB_COLS].push(c);});
  const maxR = Math.max.apply(null,comCols.map(function(c){return c.length;}));
  let comRows='';
  for(var ri=0;ri<maxR;ri++){
    comRows+='<tr>';
    for(var ci=0;ci<NB_COLS;ci++){
      comRows+='<td style="font-size:8pt;padding:0 1mm;line-height:1.5;">'+(comCols[ci][ri]||'')+'</td>';
    }
    comRows+='</tr>';
  }
  const comHtml = '<p style="font-size:10pt;font-weight:bold;font-style:italic;text-decoration:underline;font-family:Calibri,Arial,sans-serif;text-align:center;margin:1mm 0 0.5mm;">Liste des communes de la Communauté d\'Agglomération Béthune-Bruay, Artois Lys Romane :</p>'
    +'<table style="width:100%;border-collapse:collapse;">'+comRows+'</table>'
    +'<p style="font-size:8pt;font-style:italic;margin-top:0.5mm;"><sup>(1)</sup> Animal blessé uniquement</p>';

  // ══ PAGE 2 — TABLE VÉTÉRINAIRE ══
  const t2 = '<table style="width:100%;table-layout:fixed;">'
    +'<colgroup><col style="width:95mm;"><col style="width:95mm;"></colgroup>'
    +'<tr><td colspan="2" style="'+H0+'">Partie à remplir par le vétérinaire</td></tr>'
    +'<tr><td style="'+H1+'">Description de l\'animal</td><td style="'+H1+'">Soins réalisés</td></tr>'
    // R Espèce | Soins rowspan=3
    +'<tr style="height:12mm;">'
    +'<td style="'+LB+'">Espèce :<br><table style="width:100%;border:none;margin-top:1mm;"><tr>'
    +'<td style="border:none;width:50%;">'+cb(false)+' <span style="font-size:11pt;">Chien</span></td>'
    +'<td style="border:none;width:50%;">'+cb(false)+' <span style="font-size:11pt;">Chat</span></td>'
    +'</tr></table></td>'
    +'<td style="border:1pt solid #000;padding:2px 5px;vertical-align:top;" rowspan="3"></td>'
    +'</tr>'
    // R Sexe
    +'<tr style="height:12mm;">'
    +'<td style="'+LB+'">Sexe :<br><table style="width:100%;border:none;margin-top:1mm;"><tr>'
    +'<td style="border:none;width:50%;">'+cb(false)+' <span style="font-size:11pt;">Mâle</span></td>'
    +'<td style="border:none;width:50%;">'+cb(false)+' <span style="font-size:11pt;">Femelle</span></td>'
    +'</tr></table></td>'
    +'</tr>'
    // R Race — fin rowspan soins
    +'<tr style="height:10mm;"><td style="'+LB+'">Race :</td></tr>'
    // R Couleur | Montant des actes
    +'<tr style="height:28mm;">'
    +'<td style="'+LB+'vertical-align:top;">Couleur :</td>'
    +'<td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;">'
    +'<div style="font-size:12pt;font-weight:bold;font-style:italic;font-family:Calibri,Arial,sans-serif;text-align:center;margin-bottom:2mm;">Montant des actes</div>'
    +'<div style="font-size:8.5pt;font-family:Calibri,Arial,sans-serif;text-align:center;margin-bottom:3mm;">(Frais conservatoires de 100 € HT et au-delà sur accord du responsable de la fourrière)</div>'
    +'<div style="font-size:11pt;font-family:Calibri,Arial,sans-serif;text-align:center;margin-bottom:4mm;">__________ <span style="font-size:14pt;">€</span> __________ (Euros HT)</div>'
    +'<div style="font-size:11pt;font-style:italic;font-family:Calibri,Arial,sans-serif;">Date :</div>'
    +'<div style="font-size:11pt;font-style:italic;font-family:Calibri,Arial,sans-serif;margin-top:2mm;">Cachet et signature :</div>'
    +'</td>'
    +'</tr>'
    // R N° identification | vide (suite colonne droite vide)
    +'<tr style="height:10mm;">'
    +'<td style="'+LB+'">N° identification :</td>'
    +'<td style="border-left:1pt solid #000;border-right:1pt solid #000;border-bottom:none;border-top:none;"></td>'
    +'</tr>'
    // R Statut | (colonne droite vide continue)
    +'<tr style="height:36mm;">'
    +'<td style="'+LB+'vertical-align:top;">Statut de l\'animal :<br>'
    +'<table style="width:100%;border:none;margin-top:1mm;"><tr>'
    +'<td style="border:none;width:50%;padding:1px 0;">'+cb(false)+' <span style="font-size:11pt;">Errant</span></td>'
    +'<td style="border:none;width:50%;padding:1px 0;">'+cb(false)+' <span style="font-size:11pt;">Gravement blessé</span></td>'
    +'</tr><tr>'
    +'<td style="border:none;padding:1px 0;">'+cb(false)+' <span style="font-size:11pt;">Décédé</span></td>'
    +'<td style="border:none;padding:1px 0;">'+cb(false)+' <strong style="font-size:11pt;">Dangereux</strong> <em style="font-size:9pt;">(sauf chiens de 1<sup>ère</sup> catégorie)</em></td>'
    +'</tr><tr>'
    +'<td colspan="2" style="border:none;padding:1px 0;">'+cb(false)+' <span style="font-size:11pt;">Gardes sociales*</span></td>'
    +'</tr></table>'
    +'<div style="font-size:9pt;font-style:italic;font-family:Calibri,Arial,sans-serif;margin-top:2mm;">* Nom du propriétaire : <span style="border-bottom:1pt solid #000;display:inline-block;width:140px;"></span></div>'
    +'</td>'
    +'<td style="border-left:1pt solid #000;border-right:1pt solid #000;border-bottom:1pt solid #000;border-top:none;overflow:hidden;"></td>'
    +'</tr>'
    // R État sanitaire | Téléphone fourrière
    +'<tr style="height:20mm;">'
    +'<td style="'+LB+'vertical-align:top;">État sanitaire et comportement de l\'animal :</td>'
    +'<td style="'+LB+'vertical-align:top;">Téléphoné à la fourrière le :<br>'
    +'<div style="margin-top:2mm;">'+cb(false)+' <span style="font-size:11pt;">Pour reprise de l\'animal</span></div>'
    +'<div style="margin-top:1mm;">'+cb(false)+' <span style="font-size:11pt;">Pour reprise de cadavre</span></div>'
    +'</td>'
    +'</tr>'
    // R État (suite vide) | Adresse facturation
    +'<tr style="height:36mm;">'
    +'<td style="border:1pt solid #000;padding:2px 5px;overflow:hidden;"></td>'
    +'<td style="border:1pt solid #000;padding:4px 6px;font-family:Calibri,Arial,sans-serif;font-size:10pt;text-align:center;vertical-align:top;">'
    +'<strong style="font-style:italic;">Adresse de facturation :</strong><br>'
    +'<span style="font-size:8.5pt;">Le montant des frais conservatoires est communiqué par le groupe SACPA.<br>'
    +'Aucun règlement ne pourra être effectué sans l\'attestation de prise en charge, un RIB et la facture libellée à :</span><br>'
    +'<strong>GROUPE SACPA<br>À l\'attention de M. SABIT<br>Avenue Washington<br>62400 BÉTHUNE</strong><br>'
    +'<span style="font-size:8.5pt;">Courriel : bethune@sacpa.fr</span>'
    +'</td>'
    +'</tr>'
    // Footer
    +'<tr><td colspan="2" style="border:1pt solid #000;padding:3px 5px;font-family:Calibri,Arial,sans-serif;font-size:9pt;text-align:center;">'
    +'Ouverture de la fourrière animale de BÉTHUNE gérée par le groupe SACPA<br>'
    +'Du lundi au samedi : 9 h – 12 h / 14 h – 18 h (hors jours fériés)'
    +'</td></tr>'
    +'</table>'
    +'<p style="font-size:8pt;font-style:italic;font-family:Calibri,Arial,sans-serif;margin-top:1mm;"><sup>(1)</sup> Animal blessé uniquement</p>';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Prise en charge animal</title>'+css+'</head><body>'
    +''
    +'<div class="page">'+hdr()+t1+comHtml+'</div>'
    +'<div class="page">'+hdr()+t2+'</div>'
    +'</body></html>';
}


function previewPriseEnCharge(ivId,ficheIndex) {
  savePriseEnCharge(ivId,ficheIndex);
  const html = _buildPriseEnChargeHTML(ivId,ficheIndex);
  if(!html){showToast('Remplissez le formulaire','warn');return;}
  openIframeModal(html);
}

function envoyerPriseEnCharge(ivId,ficheIndex) {
  savePriseEnCharge(ivId,ficheIndex);
  const iv = IVS.find(function(v){return v.id===ivId;});if(!iv)return;
  const d = getPrisesEnChargeAnimal(iv)[Math.max(0,Number(ficheIndex)||0)] || {};
  const cas = CC();
  const casData = cas ? (CASERNE_DATA[cas.id]||{}) : {};

  // Déterminer destinataires
  const emailFourriere = (casData._emailFourriere) || ((CASERNE_DATA._global||{})._emailFourriere) || '';
  const emailVet = d.vetEmail || '';

  if(!d.fourriere && !d.veterinaire){
    showToast('Cochez fourrière et/ou vétérinaire','warn'); return;
  }
  if(d.fourriere && !emailFourriere){
    showToast('Aucun email fourrière configuré — allez dans la vue \uD83C\uDF10 Global','warn'); return;
  }
  if(d.veterinaire && !emailVet){
    showToast('Saisissez l\'email du vétérinaire dans le formulaire','warn'); return;
  }

  // Construire liste destinataires
  const tos = [];
  if(d.fourriere && emailFourriere) tos.push({email: emailFourriere, label: 'la fourrière'});
  if(d.veterinaire && emailVet)     tos.push({email: emailVet,       label: 'le vétérinaire'});

  const html = _buildPriseEnChargeHTML(ivId,ficheIndex);
  const dateFr = d.date ? d.date.split('-').reverse().join('-') : 'document';
  const subj = 'Attestation de prise en charge animal — ' + (d.commune||iv.com||'') + ' — ' + (d.date?d.date.split('-').reverse().join('/'):'-');

  const statusEl = document.createElement('div');
  statusEl.id = 'pec-send-status';
  statusEl.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:#1a1a2e;color:#fff;padding:12px 16px;border-radius:10px;font-size:13px;min-width:260px;';
  statusEl.textContent = '\u23F3 Génération du PDF...';
  document.body.appendChild(statusEl);

  _modalLocked = true;
  _genPdfHaute(html, function(pdfB64) {
    if(!pdfB64){
      statusEl.textContent = '\u274C Erreur génération PDF';
      setTimeout(function(){document.body.removeChild(statusEl);}, 3000);
      _modalLocked = false; return;
    }

    let sent = 0;
    const total = tos.length;
    tos.forEach(function(to) {
      statusEl.textContent = '\u23F3 Envoi à '+to.label+'...';
      const corps = 'Madame, Monsieur,\n\nVeuillez trouver en pièce jointe l\'attestation de prise en charge d\'un animal.\n'
        + (d.espece||'Animal') + ' — ' + (d.commune||iv.com||'') + ' — ' + (d.date?d.date.split('-').reverse().join('/'):'-') + '\n\n'
        + 'Cordialement,\n' + (cas ? cas.nom : 'Les sapeurs-pompiers');

      _sendMailSecure({
          sender: {name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL},
          to: [{email: to.email}],
          subject: subj,
          textContent: corps,
          attachment: [{content: pdfB64, name: 'PriseEnCharge_Animal'+(Number(ficheIndex)+1)+'_'+dateFr+'.pdf'}]
      })
      .then(function(r){return r.ok?r.json():r.text().then(function(t){throw new Error(t);});})
      .then(function(){
        sent++;
        statusEl.textContent = '\u2705 Envoyé à '+to.label + (sent<total?' — en attente...':'');
        if(sent===total){
          showToast('Document envoyé \u2714','success');
          _modalLocked = false;
          const _iv2=IVS.find(function(v){return v.id===ivId;});
          if(_iv2){if(!_iv2._mailsEnvoyes)_iv2._mailsEnvoyes=[];_iv2._mailsEnvoyes.push({date:new Date().toISOString(),type:'prise-en-charge'});saveData();rI();rHist();}
          setTimeout(function(){if(statusEl.parentNode)document.body.removeChild(statusEl);},3000);
        }
      })
      .catch(function(err){
        statusEl.textContent = '\u274C Erreur envoi '+to.label+': '+err.message;
        _modalLocked = false;
        setTimeout(function(){if(statusEl.parentNode)document.body.removeChild(statusEl);},5000);
      });
    });
  });
}


function isReportPrintingAllowed(){
  const ua=String(navigator.userAgent||'');
  const mobile=/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua);
  const ipadDesktop=/Macintosh/i.test(ua)&&Number(navigator.maxTouchPoints||0)>1;
  let finePointer=true;
  try{finePointer=window.matchMedia?window.matchMedia('(hover:hover) and (pointer:fine)').matches:true;}catch(e){}
  return !mobile&&!ipadDesktop&&finePointer;
}
function disableIframePrintButtons(html){
  const notice='<span style="display:inline-flex;align-items:center;padding:7px 10px;border-radius:6px;background:#FFF7ED;color:#9A3412;font:600 12px Arial,sans-serif;">\ud83d\udcf1 Impression disponible uniquement sur ordinateur</span>';
  return String(html||'').replace(/<button\b[^>]*onclick=["']window\.print\(\)["'][^>]*>[\s\S]*?<\/button>/gi,notice);
}
function _onIframePrint() {
  if(!isReportPrintingAllowed()){
    showToast('L\u2019impression des rapports est autoris\u00e9e uniquement sur un ordinateur.','warn');
    return;
  }
  document.getElementById('iframe-content').contentWindow.print();
  const btn = document.getElementById('iframe-print-btn');
  const ivId = btn ? btn.getAttribute('data-ivid') : '';
  const type = btn ? btn.getAttribute('data-type') : '';
  if(ivId && type === 'rapport') {
    const iv = IVS.find(function(v){return v.id===ivId;});
    if(iv){
      if(!iv._impressions) iv._impressions = [];
      iv._impressions.push({date: new Date().toISOString(), type: 'rapport'});
      saveData();
      rI();rHist();
    }
  }
}

function openIframeModal(html, ivId) {
  const modal = document.getElementById('iframe-modal');
  const iframe = document.getElementById('iframe-content');
  const printAllowed=isReportPrintingAllowed();
  modal.style.display = 'flex';
  iframe.srcdoc = printAllowed?html:disableIframePrintButtons(html);
  // Afficher bouton imprimer pour les PDFs (contient @page)
  const printBtn = document.getElementById('iframe-print-btn');
  if(printBtn){
    printBtn.style.display = printAllowed&&html.includes('@page') ? 'inline-block' : 'none';
    printBtn.setAttribute('data-ivid', ivId||'');
    printBtn.setAttribute('data-type', html.includes('Rapport d') ? 'rapport' : 'other');
  }
}
function closeIframeModal() {
  const modal = document.getElementById('iframe-modal');
  const iframe = document.getElementById('iframe-content');
  modal.style.display = 'none';
  iframe.srcdoc = 'about:blank';
}

// ── P3 : Chiffrement AES-GCM du localStorage ──
// Clé dérivée d'une passphrase fixe par origine (protège contre lecture directe du LS)
// Pour un niveau supérieur, dériver depuis SESSION_TOKEN après connexion.
const _STORAGE_PASSPHRASE='agai-local-enc-v1';
const _ENC_STORAGE_KEY=STORAGE_KEY+'_enc';

async function _getStorageKey(){
  const enc=new TextEncoder();
  const km=await crypto.subtle.importKey('raw',enc.encode(_STORAGE_PASSPHRASE),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:enc.encode('agai-storage-salt'),iterations:10000,hash:'SHA-256'},
    km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
  );
}

async function _encryptData(plaintext){
  const key=await _getStorageKey();
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const enc=new TextEncoder();
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(plaintext));
  return _toHex(iv)+':'+_toHex(ct);
}

async function _decryptData(stored){
  const idx=stored.indexOf(':');
  if(idx<0)throw new Error('Format chiffrement invalide');
  const iv=_fromHex(stored.slice(0,idx));
  const ct=_fromHex(stored.slice(idx+1));
  const key=await _getStorageKey();
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);
  return new TextDecoder().decode(plain);
}

function _buildDataObject(){
  normalizeAllAccountMetadata();
  const data={
    v:18,
    CASERNES:JSON.parse(JSON.stringify(CASERNES)),
    GLOBAL_ACCOUNTS:GLOBAL_ACCOUNTS.map(a=>({...a})),
    CASERNE_DATA:{},
    NAT:JSON.parse(JSON.stringify(NAT)),
    ACT_TYPES:JSON.parse(JSON.stringify(ACT_TYPES)),
    REPORT_TYPES:JSON.parse(JSON.stringify(REPORT_TYPES)),
    COM:JSON.parse(JSON.stringify(COM)),
    ENGIN_TYPES:JSON.parse(JSON.stringify(ENGIN_TYPES)),
    APL_COUNTER:{...APL_COUNTER},
    INT_GLOBAL_COUNTER:{...INT_GLOBAL_COUNTER},
    INT_CAS_COUNTER:{...INT_CAS_COUNTER},
    PILP_COUNTER:{...PILP_COUNTER},
    DISPOS_UNLOCKED:{...DISPOS_UNLOCKED},
    DISPO_REQUESTS:{...DISPO_REQUESTS},
    LOGIN_HISTORY:[...LOGIN_HISTORY],
    LOGIN_HISTORY_DELETED:{...LOGIN_HISTORY_DELETED},
  };
  Object.keys(CASERNE_DATA).forEach(cid=>{
    const d=CASERNE_DATA[cid];
    // Clés globales (non liées à une caserne)
    if(cid==='_cabbalrActif'||cid==='_initCabbalr'){
      data.CASERNE_DATA[cid]=d;
      return;
    }
    data.CASERNE_DATA[cid]={
      users:(d.users||[]).map(u=>({...u})),
      ivs:(d.ivs||[]).map(iv=>({...iv})),
      pilpIvs:(d.pilpIvs||[]).map(iv=>({...iv})),
      equipes:(d.equipes||[]).map(e=>({...e})),
      dispos:{...(d.dispos||{})},
      piquets:{...(d.piquets||{})},
      planningRotations:{...(d.planningRotations||{})},
      astrConfig:{...(d.astrConfig||{})},
      disposValidated:{...(d.disposValidated||{})},
      piquetsValidated:{...(d.piquetsValidated||{})},
      renforts:[...(d.renforts||[])],
      activites:JSON.parse(JSON.stringify(d.activites||[])),
      fmpas:JSON.parse(JSON.stringify(d.fmpas||[])),
      formStag:JSON.parse(JSON.stringify(d.formStag||[])),
      formForm:JSON.parse(JSON.stringify(d.formForm||[])),
      astrTelData:JSON.parse(JSON.stringify(d.astrTelData||{})),
      astrTelParams:{...(d.astrTelParams||{})},
      statsTaux:{...(d.statsTaux||{})},
      adminLogin:d.adminLogin||'',
      formations:JSON.parse(JSON.stringify(d.formations||[])),
    };
  });
  return data;
}

function _applyDataObject(data){
  const activeReportId=typeof window!=='undefined'?window._activeReportDraftIvId:null;
  const activeReportCaserne=activeReportId&&CURRENT_CASERNE_ID?CASERNE_DATA[CURRENT_CASERNE_ID]:null;
  const activeReportSnapshot=activeReportCaserne&&Array.isArray(activeReportCaserne.ivs)
    ?activeReportCaserne.ivs.find(function(iv){return iv&&iv.id===activeReportId;}):null;
  if(data.CASERNES&&data.CASERNES.length){CASERNES.length=0;data.CASERNES.forEach(c=>CASERNES.push(c));}
  // Garantir la présence de la caserne État-Major (espace de saisie du chef de corps)
  if(!CASERNES.find(c=>c.id==='EMAJ')){
    CASERNES.push({id:'EMAJ',nom:'État-Major',code:'EMA',couleur:'#1D4ED8',email:'',_emaj:true});
  }
  initCaserneData('EMAJ');
  // Nettoyer un éventuel compte admin auto-créé pour l'État-Major (ne doit pas exister)
  if(data.CASERNE_DATA&&data.CASERNE_DATA.EMAJ&&Array.isArray(data.CASERNE_DATA.EMAJ.users)){
    data.CASERNE_DATA.EMAJ.users=data.CASERNE_DATA.EMAJ.users.filter(u=>u&&u.l!=='emaj.admin');
  }
  if(data.GLOBAL_ACCOUNTS&&data.GLOBAL_ACCOUNTS.length){GLOBAL_ACCOUNTS.length=0;data.GLOBAL_ACCOUNTS.forEach(a=>GLOBAL_ACCOUNTS.push(a));}
  if(data.CASERNE_DATA){
    Object.keys(data.CASERNE_DATA).forEach(cid=>{
      // Clés globales — ne pas traiter comme des casernes
      if(cid==='_cabbalrActif'||cid==='_initCabbalr'||cid==='_global'){
        CASERNE_DATA[cid]=data.CASERNE_DATA[cid];
        return;
      }
      const src=data.CASERNE_DATA[cid];
      if(!src||typeof src!=='object'){CASERNE_DATA[cid]=src;return;}
      // Mettre à jour en place si l'objet existe déjà (préserve les références)
      if(!CASERNE_DATA[cid]||typeof CASERNE_DATA[cid]!=='object'){
        CASERNE_DATA[cid]=src;
      } else {
        // Mettre à jour chaque propriété en place pour préserver les références
        const dst=CASERNE_DATA[cid];
        // Tableaux : vider et repeupler pour préserver la référence
        if(src.users){dst.users=dst.users||[];dst.users.length=0;src.users.forEach(u=>dst.users.push(u));}
        if(src.ivs){dst.ivs=dst.ivs||[];dst.ivs.length=0;src.ivs.filter(iv=>iv&&iv.id).forEach(iv=>dst.ivs.push(iv));}
        if(src.pilpIvs){dst.pilpIvs=dst.pilpIvs||[];dst.pilpIvs.length=0;src.pilpIvs.forEach(iv=>dst.pilpIvs.push(iv));}
        if(src.equipes){dst.equipes=dst.equipes||[];dst.equipes.length=0;src.equipes.forEach(e=>dst.equipes.push(e));}
        if(src.renforts){dst.renforts=dst.renforts||[];dst.renforts.length=0;src.renforts.forEach(r=>dst.renforts.push(r));}
        if(src.activites){dst.activites=dst.activites||[];dst.activites.length=0;src.activites.forEach(a=>dst.activites.push(a));}
        if(src.fmpas){dst.fmpas=dst.fmpas||[];dst.fmpas.length=0;src.fmpas.forEach(f=>dst.fmpas.push(f));}
        if(src.formStag){dst.formStag=dst.formStag||[];dst.formStag.length=0;src.formStag.forEach(f=>dst.formStag.push(f));}
        if(src.formForm){dst.formForm=dst.formForm||[];dst.formForm.length=0;src.formForm.forEach(f=>dst.formForm.push(f));}
        if(src.formations){dst.formations=dst.formations||[];dst.formations.length=0;src.formations.forEach(f=>dst.formations.push(f));}
        // Objets : ne pas écraser les dispos/piquets si une édition est en cours
        const dispoLocked = Date.now()-_jbEditLock < 15000;
        if(src.dispos && !dispoLocked){
          dst.dispos=src.dispos;
        }
        if(src.piquets && !dispoLocked){
          dst.piquets=src.piquets;
        }
        if(src.planningRotations)dst.planningRotations=src.planningRotations;
        if(src.astrConfig)dst.astrConfig=src.astrConfig;
        if(src.disposValidated)dst.disposValidated=src.disposValidated;
        if(src.piquetsValidated)dst.piquetsValidated=src.piquetsValidated;
        if(src.astrTelData&&!dispoLocked)dst.astrTelData=src.astrTelData;
        if(src.astrTelParams)dst.astrTelParams=src.astrTelParams;
        if(src.statsTaux)dst.statsTaux=src.statsTaux;
        if(src.adminLogin!==undefined)dst.adminLogin=src.adminLogin;
        if(src._initCompteurs!==undefined)dst._initCompteurs=src._initCompteurs;
      }
    });
  }
  if(activeReportSnapshot&&Date.now()-_jbEditLock<15000&&CASERNE_DATA[CURRENT_CASERNE_ID]){
    const target=CASERNE_DATA[CURRENT_CASERNE_ID].ivs||(CASERNE_DATA[CURRENT_CASERNE_ID].ivs=[]);
    const index=target.findIndex(function(iv){return iv&&iv.id===activeReportId;});
    if(index>=0)target[index]=activeReportSnapshot;else target.push(activeReportSnapshot);
  }
  if(data.NAT&&data.NAT.length){NAT.length=0;data.NAT.forEach(n=>NAT.push(n));}
  if(data.ACT_TYPES&&data.ACT_TYPES.length){ACT_TYPES.length=0;data.ACT_TYPES.forEach(a=>ACT_TYPES.push(a));}
  const normalizedActTypes=[],normalizedActLabels=new Set();
  ACT_TYPES.forEach(a=>{
    a.l=normalizeAdminExpenseType(a.l);
    a.cat=isAdminExpenseCategory(a.cat)||defaultActivityCategory(a.l)===ADMIN_EXPENSE_CATEGORY?ADMIN_EXPENSE_CATEGORY:(a.cat||defaultActivityCategory(a.l));
    const key=a.l.toLocaleLowerCase('fr');
    if(!normalizedActLabels.has(key)){normalizedActLabels.add(key);normalizedActTypes.push(a);}
  });
  ACT_TYPES.length=0;normalizedActTypes.forEach(a=>ACT_TYPES.push(a));
  Object.values(CASERNE_DATA).forEach(cd=>{
    (cd&&Array.isArray(cd.activites)?cd.activites:[]).forEach(a=>{
      const normalizedType=normalizeAdminExpenseType(a.type);
      if(normalizedType!==a.type||isAdminExpenseCategory(a.categorie)||defaultActivityCategory(normalizedType)===ADMIN_EXPENSE_CATEGORY){
        a.type=normalizedType;a.categorie=ADMIN_EXPENSE_CATEGORY;
      }
    });
  });
  if(data.REPORT_TYPES&&data.REPORT_TYPES.length){REPORT_TYPES.length=0;data.REPORT_TYPES.forEach(r=>REPORT_TYPES.push(r));}
  if(data.ENGIN_TYPES&&data.ENGIN_TYPES.length){ENGIN_TYPES.length=0;data.ENGIN_TYPES.forEach(t=>ENGIN_TYPES.push(t));}
  if(data.COM&&data.COM.length){COM.length=0;data.COM.forEach(c=>COM.push(c));}
  if(data.APL_COUNTER)Object.assign(APL_COUNTER,data.APL_COUNTER);
  if(data.INT_GLOBAL_COUNTER)Object.assign(INT_GLOBAL_COUNTER,data.INT_GLOBAL_COUNTER);
  if(data.INT_CAS_COUNTER)Object.assign(INT_CAS_COUNTER,data.INT_CAS_COUNTER);
  if(data.PILP_COUNTER)Object.assign(PILP_COUNTER,data.PILP_COUNTER);
  if(data.DISPOS_UNLOCKED)Object.assign(DISPOS_UNLOCKED,data.DISPOS_UNLOCKED);
  if(data.DISPO_REQUESTS)Object.assign(DISPO_REQUESTS,data.DISPO_REQUESTS);
  if(data.LOGIN_HISTORY_DELETED)LOGIN_HISTORY_DELETED={...data.LOGIN_HISTORY_DELETED};
  if(data.LOGIN_HISTORY)LOGIN_HISTORY=data.LOGIN_HISTORY.filter(function(entry){return!LOGIN_HISTORY_DELETED[entry.id];});
  // Migration fonctions formateur
  const MFF={'EAP 1 (Op\u00e9rateur des Activit\u00e9s Physiques)':'EAP 1','EAP 2 (\u00c9ducateur des Activit\u00e9s Physiques)':'EAP 2','EAP 3 (Conseiller des Activit\u00e9s Physiques)':'EAP 3','ACCPRO (Accompagnateur de Proximit\u00e9)':'ACCPRO','FOR ACC (Formateur Accompagnateur)':'FOR ACC','FPS (Formateur Premier Secours)':'FPS','FFPS (Formateur de formateur de premiers secours)':'FFPS'};
  function migrateUser(u){if(u.fonctionsFormateur&&u.fonctionsFormateur.length){const m=u.fonctionsFormateur.map(f=>MFF[f]||f);u.fonctionsFormateur=[...new Set(m)];}}
  CASERNES.forEach(cas=>(cas.users||[]).forEach(migrateUser));
  Object.values(CASERNE_DATA).forEach(cd=>{if(cd&&typeof cd==='object'&&cd.users)(cd.users||[]).forEach(migrateUser);});
  Object.keys(CASERNE_DATA).forEach(cid=>{
    const cd=CASERNE_DATA[cid];if(!cd||!Array.isArray(cd.users))return;
    let responsableTrouve=false;
    cd.users.forEach(u=>{
      if(u.responsableFormation===true&&!responsableTrouve){
        responsableTrouve=true;u.caserneId=cid;u.rights=Array.isArray(u.rights)?u.rights:[];
        if(!u.rights.includes('Formation'))u.rights.push('Formation');
      }else if(u.responsableFormation===true)u.responsableFormation=false;
    });
  });
  // Réhydrater les photos (exclues du push JSONBin) depuis localStorage local
  try{
    Object.keys(CASERNE_DATA).forEach(function(cid){
      const cas=CASERNE_DATA[cid];
      if(!cas||typeof cas!=='object')return;
      ['ivs','pilpIvs'].forEach(function(coll){
        if(Array.isArray(cas[coll]))cas[coll].forEach(_rehydratePhoto);
      });
    });
  }catch(e){console.warn('[AGAI] rehydrate photo error:',e);}
  normalizeAllAccountMetadata();
  // Resynchroniser les variables globales si une caserne est active
  if(CURRENT_CASERNE_ID&&typeof syncCaserneContext==='function')syncCaserneContext();
}
// ══════════════════════════════════════════════════════
// Ancien connecteur conservé uniquement pour permettre une migration explicite.
// Les identifiants privés ne sont jamais intégrés au fichier distribué.
const JSONBIN_ID  = AGAI_RUNTIME_CONFIG.jsonbinId||'';
const JSONBIN_KEY = '';
const JSONBIN_URL = JSONBIN_ID ? 'https://api.jsonbin.io/v3/b/' + JSONBIN_ID : '';
const JB_CACHE_KEY = 'agai_jb_cache';
let _jbSaveTimer  = null;
let _jbSaving     = false;
let _jbPollTimer  = null;
let _jbLastPush   = 0;
let _jbEditLock   = 0; // timestamp de la dernière modification — bloque le pull pendant 15s

function _jbSetStatus(state){
  let el=document.getElementById('jb-status');
  if(!el){el=document.createElement('div');el.id='jb-status';document.body.appendChild(el);}
  const cfg={ok:{txt:'☁️ Sync OK',bg:'#ECFDF5',color:'#065F46'},saving:{txt:'⏳ Sync...',bg:'#FFF7ED',color:'#92400E'},pending:{txt:'⏳ Sync en attente',bg:'#FFF7ED',color:'#92400E'},error:{txt:'⚠️ Sync KO',bg:'#FEF2F2',color:'#991B1B'},loading:{txt:'⏳ Chargement',bg:'#EFF6FF',color:'#1D4ED8'}};
  const c=cfg[state]||cfg.ok;
  const queued=typeof _rcPendingDirty!=='undefined'?_rcPendingDirty.size:0;
  el.textContent=c.txt+((state==='pending'||state==='error')&&queued?' ('+queued+' en attente)':'');
  el.style.cssText='position:fixed;bottom:8px;right:8px;z-index:9999;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:'+c.bg+';color:'+c.color+';box-shadow:0 1px 4px rgba(0,0,0,.15);cursor:pointer;';
  const syncError=typeof _rcLastSyncError!=='undefined'?_rcLastSyncError:'';
  el.title=state==='error'&&syncError?syncError:'Cliquer pour synchroniser maintenant';
  el.onclick=function(){
    if(state==='error'&&syncError)showToast('Synchronisation : '+syncError,'error');
    jbSyncNow();
  };
}

function saveData(immediate){
  try{
    // Forcer la resynchronisation des variables globales avant sauvegarde
    if(CURRENT_CASERNE_ID&&typeof syncCaserneContext==='function')syncCaserneContext();
    // Reparer avant la mise en cache un ancien doublon d'id qui ferait fusionner
    // deux interventions distinctes lors de la synchronisation Supabase.
    if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcRepairDuplicateLocalRecordIds==='function'){
      _rcRepairDuplicateLocalRecordIds();
    }
    const data=_buildDataObject();
    if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcTrackChangedRecords==='function'){
      let previous=null;
      try{const raw=localStorage.getItem(JB_CACHE_KEY);if(raw)previous=JSON.parse(raw);}catch(e){}
      _rcTrackChangedRecords(previous,data);
    }
    localStorage.setItem(JB_CACHE_KEY,JSON.stringify(data));
    if(_jbSaveTimer)clearTimeout(_jbSaveTimer);
    // Push immédiat pour les opérations critiques (changements de statut, etc.)
    if(immediate===true){
      _jbSaveTimer=null;
      if(USE_RECORDS){_rcPush(false);}else if(USE_SUPABASE){_sbPush(data);}else{_jbPush(data);}
      return;
    }
    _jbSaveTimer=window.setTimeout(function(){
      _jbSaveTimer=null;
      // Reconstruire les données fraîches au moment du push (évite d'écraser avec une version périmée si d'autres actions ont eu lieu depuis)
      if(CURRENT_CASERNE_ID&&typeof syncCaserneContext==='function')syncCaserneContext();
      const freshData=_buildDataObject();
      localStorage.setItem(JB_CACHE_KEY,JSON.stringify(freshData));
      if(USE_RECORDS){_rcPush(false);}else if(USE_SUPABASE){_sbPush(freshData);}else{_jbPush(freshData);}
    },2000);
  }catch(e){console.warn('[AGAI] saveData error:',e);}
}

// ── PUSH : écrit uniquement la caserne active ──
async function _jbPush(data){
  if(_jbSaving){window.setTimeout(function(){_jbPush(data);},1000);return;}
  _jbSaving=true;_jbSetStatus('saving');
  try{
    // Lire d'abord les données actuelles du Bin
    const getResp=await fetch(JSONBIN_URL+'?meta=false',{headers:{'X-Master-Key':JSONBIN_KEY,'X-Access-Key':JSONBIN_KEY}});
    if(!getResp.ok)throw new Error('GET HTTP '+getResp.status);
    const current=await getResp.json();
    // Fusionner : garder les données des autres casernes, merger intelligemment la nôtre
    const merged=Object.assign({},current,data);
    merged.CASERNE_DATA=Object.assign({},current.CASERNE_DATA||{});
    Object.keys(data.CASERNE_DATA||{}).forEach(cid=>{
      const remCas=current.CASERNE_DATA&&current.CASERNE_DATA[cid];
      const myCas=data.CASERNE_DATA[cid];
      if(!remCas||typeof remCas!=='object'){
        merged.CASERNE_DATA[cid]=myCas;
        return;
      }
      // Fusion au niveau des enregistrements pour la même caserne
      const mergeById=(loc,rem)=>{
        const map={};
        (rem||[]).forEach(x=>{if(x&&x.id)map[x.id]=x;});
        (loc||[]).forEach(x=>{if(x&&x.id)map[x.id]=x;});
        return Object.values(map).sort((a,b)=>(b.h||'').localeCompare(a.h||''));
      };
      merged.CASERNE_DATA[cid]=Object.assign({},remCas,myCas);
      merged.CASERNE_DATA[cid].ivs=mergeById(myCas.ivs,remCas.ivs);
      merged.CASERNE_DATA[cid].pilpIvs=mergeById(myCas.pilpIvs,remCas.pilpIvs);
      merged.CASERNE_DATA[cid].equipes=mergeById(myCas.equipes,remCas.equipes);
      merged.CASERNE_DATA[cid].activites=mergeById(myCas.activites,remCas.activites);
      merged.CASERNE_DATA[cid].fmpas=mergeById(myCas.fmpas,remCas.fmpas);
      merged.CASERNE_DATA[cid].formStag=mergeById(myCas.formStag,remCas.formStag);
      merged.CASERNE_DATA[cid].formForm=mergeById(myCas.formForm,remCas.formForm);
      // Dispos : fusionner par semaine et par login
      const remDispos=remCas.dispos||{};
      const myDispos=myCas.dispos||{};
      const mergedDispos=Object.assign({},remDispos);
      Object.keys(myDispos).forEach(wk=>{
        mergedDispos[wk]=Object.assign({},remDispos[wk]||{},myDispos[wk]);
      });
      merged.CASERNE_DATA[cid].dispos=mergedDispos;
      // Users : la version locale prime (seul l'admin modifie les users)
      merged.CASERNE_DATA[cid].users=myCas.users||remCas.users;
    });
    // Fusionner les données globales
    // Pendant une édition locale récente (ex. changement de mot de passe superadmin),
    // conserver la version locale pour ne pas l'écraser avec la version distante.
    if(typeof _jbEditLock!=='undefined' && (Date.now()-_jbEditLock < 15000) && typeof GLOBAL_ACCOUNTS!=='undefined' && GLOBAL_ACCOUNTS.length){
      merged.GLOBAL_ACCOUNTS=GLOBAL_ACCOUNTS.map(a=>({...a}));
    } else {
      merged.GLOBAL_ACCOUNTS=data.GLOBAL_ACCOUNTS;
    }
    merged.NAT=data.NAT;
    merged.ACT_TYPES=data.ACT_TYPES;
    merged.REPORT_TYPES=data.REPORT_TYPES;
    merged.COM=data.COM;
    merged.APL_COUNTER=Object.assign({},current.APL_COUNTER||{},data.APL_COUNTER||{});
    merged.INT_GLOBAL_COUNTER=Object.assign({},current.INT_GLOBAL_COUNTER||{},data.INT_GLOBAL_COUNTER||{});
    merged.INT_CAS_COUNTER=Object.assign({},current.INT_CAS_COUNTER||{},data.INT_CAS_COUNTER||{});
    merged.PILP_COUNTER=Object.assign({},current.PILP_COUNTER||{},data.PILP_COUNTER||{});
    merged.DISPO_REQUESTS=Object.assign({},current.DISPO_REQUESTS||{},data.DISPO_REQUESTS||{});
    merged.DISPOS_UNLOCKED=Object.assign({},current.DISPOS_UNLOCKED||{},data.DISPOS_UNLOCKED||{});
    merged.LOGIN_HISTORY_DELETED=Object.assign({},current.LOGIN_HISTORY_DELETED||{},data.LOGIN_HISTORY_DELETED||{});
    merged.LOGIN_HISTORY=(data.LOGIN_HISTORY||current.LOGIN_HISTORY||[]).filter(function(entry){return!merged.LOGIN_HISTORY_DELETED[entry.id];});
    merged.v=data.v;
    // Sauvegarder le merge — version allégée pour le PUT (réduit le payload sous
    // la limite JSONBin). On ne touche PAS à `merged` : le cache local garde tout.
    const lite=_stripHeavyForPush(merged);
    const putResp=await fetch(JSONBIN_URL,{method:'PUT',headers:{'Content-Type':'application/json','X-Master-Key':JSONBIN_KEY,'X-Access-Key':JSONBIN_KEY,'X-Bin-Versioning':'false'},body:JSON.stringify(lite)});
    if(!putResp.ok)throw new Error('PUT HTTP '+putResp.status);
    // Mettre à jour le cache local avec la version mergée COMPLÈTE (avec photos)
    localStorage.setItem(JB_CACHE_KEY,JSON.stringify(merged));
    _jbLastPush=Date.now();
    _jbSetStatus('ok');
  }catch(e){console.warn('[AGAI] Push error:',e);_jbSetStatus('error');}
  finally{_jbSaving=false;}
}

// ── Allègement du payload pour le PUT JSONBin ──
// Retire UNIQUEMENT des champs de cache régénérables et les photos base64.
// WHITELIST INVERSÉE STRICTE : ne JAMAIS toucher _autorisationData, logoB64,
// ni aucune donnée structurée. Ces champs sont les seuls supprimés :
//   - iv._pdfAutorisation / iv._pdfAttestation : HTML régénérable par
//     _buildAutorisationHTML() à partir de iv._autorisationData (conservé).
//   - iv._frelonData.photo : image base64, conservée en localStorage local
//     (clé agai_photo_<ivId>) et donc consultable sur l'appareil d'origine.
const _PHOTO_LS_PREFIX='agai_photo_';
function _stripHeavyForPush(src){
  // Clone profond pour ne jamais altérer la source.
  const out=JSON.parse(JSON.stringify(src));
  if(out.CASERNE_DATA){
    Object.keys(out.CASERNE_DATA).forEach(function(cid){
      const cas=out.CASERNE_DATA[cid];
      if(!cas||typeof cas!=='object')return;
      ['ivs','pilpIvs'].forEach(function(coll){
        if(!Array.isArray(cas[coll]))return;
        cas[coll].forEach(function(iv){
          if(!iv||typeof iv!=='object')return;
          // Cache PDF régénérable
          delete iv._pdfAutorisation;
          delete iv._pdfAttestation;
          // Photo frelon : conserver en localStorage local, retirer du push
          if(iv._frelonData&&iv._frelonData.photo&&iv.id){
            try{localStorage.setItem(_PHOTO_LS_PREFIX+iv.id,iv._frelonData.photo);}catch(e){}
            iv._frelonData=Object.assign({},iv._frelonData);
            delete iv._frelonData.photo;
          }
        });
      });
    });
  }
  return out;
}

// Réhydrate une photo depuis localStorage si absente après un pull.
function _rehydratePhoto(iv){
  if(!iv||!iv.id)return;
  if(iv._frelonData&&!iv._frelonData.photo){
    try{
      const p=localStorage.getItem(_PHOTO_LS_PREFIX+iv.id);
      if(p)iv._frelonData.photo=p;
    }catch(e){}
  }
}


// ── PULL : met à jour uniquement les casernes des autres utilisateurs ──
async function _jbPull(silent){
  if(_jbSaving||_jbSaveTimer)return true;
  try{
    if(!silent)_jbSetStatus('loading');
    const resp=await fetch(JSONBIN_URL+'?meta=false',{headers:{'X-Master-Key':JSONBIN_KEY,'X-Access-Key':JSONBIN_KEY}});
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    const remote=await resp.json();
    if(!remote||typeof remote!=='object')throw new Error('Données invalides');
    // Fusionner intelligemment : ne pas écraser la caserne active
    const activeCid=CURRENT_CASERNE_ID;
    if(remote.CASERNE_DATA&&activeCid){
      // Sauvegarder les données locales de la caserne active
      const myData=JSON.parse(JSON.stringify(CASERNE_DATA[activeCid]||{}));
      // Appliquer toutes les données distantes
      _applyDataObject(remote);
      const remoteData=CASERNE_DATA[activeCid]||{};
      // Fusion au niveau des enregistrements individuels
      // IVS : garder toutes les interventions des deux, la version locale prime
      const mergeById=(local,remote)=>{
        const map={};
        (remote||[]).forEach(x=>{if(x&&x.id)map[x.id]=x;});
        (local||[]).forEach(x=>{if(x&&x.id)map[x.id]=x;}); // local écrase remote
        return Object.values(map).sort((a,b)=>(b.h||'').localeCompare(a.h||''));
      };
      CASERNE_DATA[activeCid].ivs=mergeById(myData.ivs,remoteData.ivs);
      CASERNE_DATA[activeCid].pilpIvs=mergeById(myData.pilpIvs,remoteData.pilpIvs);
      CASERNE_DATA[activeCid].equipes=mergeById(myData.equipes,remoteData.equipes);
      CASERNE_DATA[activeCid].activites=mergeById(myData.activites,remoteData.activites);
      CASERNE_DATA[activeCid].fmpas=mergeById(myData.fmpas,remoteData.fmpas);
      CASERNE_DATA[activeCid].formStag=mergeById(myData.formStag,remoteData.formStag);
      CASERNE_DATA[activeCid].formForm=mergeById(myData.formForm,remoteData.formForm);
      // Dispos : fusionner par semaine et par login
      const myDispos=myData.dispos||{};
      const remDispos=remoteData.dispos||{};
      const mergedDispos=Object.assign({},remDispos);
      Object.keys(myDispos).forEach(wk=>{
        mergedDispos[wk]=Object.assign({},remDispos[wk]||{},myDispos[wk]);
      });
      // Si édition en cours, garder les dispos locales
      if(Date.now()-_jbEditLock < 15000){
        CASERNE_DATA[activeCid].dispos=myDispos;
      } else {
        CASERNE_DATA[activeCid].dispos=mergedDispos;
      }
      // Users : garder la version locale (seul l'admin modifie les users)
      if(myData.users&&myData.users.length>0){
        CASERNE_DATA[activeCid].users=myData.users;
      }
    } else {
      _applyDataObject(remote);
    }
    _postLoadInit();
    if(activeCid)syncCaserneContext();
    // Mettre à jour le cache avec la version fusionnée
    const merged=JSON.parse(JSON.stringify(remote));
    if(activeCid&&CASERNE_DATA[activeCid])merged.CASERNE_DATA[activeCid]=CASERNE_DATA[activeCid];
    localStorage.setItem(JB_CACHE_KEY,JSON.stringify(merged));
    try{rI();}catch(e){}try{rAccueil();}catch(e){}try{rHist();}catch(e){}try{rAstrDispo();}catch(e){}try{rAstrEquipes();}catch(e){}
    const isTyping=document.getElementById('admin-add')&&document.getElementById('admin-add').style.display!=='none'
      &&(document.getElementById('nu-prenom')?.value||document.getElementById('nu-nom')?.value||document.getElementById('nu-mdp')?.value);
    if(!isTyping){try{rAdm();}catch(e){}}
    _jbSetStatus('ok');return true;
  }catch(e){console.warn('[AGAI] Pull error:',e);_jbSetStatus('error');return false;}
}

// ── Polling toutes les 15s ──
function _jbStartPolling(){
  if(_jbPollTimer)clearInterval(_jbPollTimer);
  _jbPollTimer=window.setInterval(function(){
    if(_jbSaving||_jbSaveTimer)return;
    if(Date.now()-_jbLastPush < 10000)return;
    if(Date.now()-_jbEditLock < 15000)return;
    _jbPull(true);
  },15000);
}

function loadData(){
  const cache=localStorage.getItem(JB_CACHE_KEY);
  if(cache){
    try{
      const data=JSON.parse(cache);
      _applyDataObject(data);_postLoadInit();
      if(CURRENT_CASERNE_ID)syncCaserneContext();
    }catch(e){}
  }
  if(USE_RECORDS){
    _rcPull(false).then(function(){_rcStartRealtime();_rcStartPolling();});
  }else if(USE_SUPABASE){
    _sbPull(false).then(function(){_sbStartRealtime();_sbStartPolling();});
  }else{
    _jbPull(false).then(function(){_jbStartPolling();});
  }
}

function _loadClear(){
  try{
    let raw=localStorage.getItem(STORAGE_KEY);
    if(!raw){const oldKeys=['agai_v14','agai_v13'];for(const k of oldKeys){const r=localStorage.getItem(k);if(r){raw=r;break;}}}
    if(raw){const data=JSON.parse(raw);_applyDataObject(data);_postLoadInit();saveData();showToast('Données migrées ✓','success');}
  }catch(e){console.warn('[AGAI] Chargement impossible:',e);}
  if(USE_RECORDS){
    _rcPull(false).then(function(){_rcStartRealtime();_rcStartPolling();});
  }else if(USE_SUPABASE){
    _sbPull(false).then(function(){_sbStartRealtime();_sbStartPolling();});
  }else{
    _jbPull(false).then(function(){_jbStartPolling();});
  }
}

function _postLoadInit(){
  if(CASERNE_DATA._global&&CASERNE_DATA._global.logoB64){
    window._LOGO_OVERRIDE='data:'+(CASERNE_DATA._global.logoMime||'image/jpeg')+';base64,'+CASERNE_DATA._global.logoB64;
  }
  if(!CU)try{_restoreSessionAfterLoad();}catch(e){console.warn('[AGAI] Restauration de session impossible:',e);}
}

function jbSyncNow(){
  if(USE_RECORDS&&typeof _rcPendingDirty!=='undefined'&&_rcPendingDirty.size){
    _rcPush(false);
    showToast('Synchronisation des actions en attente relancÃ©e','info');
    return;
  }
  const puller = USE_RECORDS ? _rcPull : (USE_SUPABASE ? _sbPull : _jbPull);
  puller(false).then(function(ok){
    if(ok)showToast('Données synchronisées ✓','success');
    else showToast('Erreur de synchronisation','error');
  });
}

function _agaiCanManageBackups(){
  return isSuperAdmin()||hasRight('Administration');
}

function agaiExportBackup(){
  if(!_agaiCanManageBackups()){showToast('Accès refusé','error');return;}
  const envelope={
    format:'AGAI_BACKUP',
    version:1,
    exportedAt:new Date().toISOString(),
    exportedBy:CU&&CU.l?CU.l:'',
    data:_buildDataObject()
  };
  const blob=new Blob([JSON.stringify(envelope,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='AGAI_sauvegarde_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Sauvegarde exportée ✓','success');
}

function agaiImportBackup(input){
  if(!_agaiCanManageBackups()){showToast('Accès refusé','error');input.value='';return;}
  const file=input.files&&input.files[0];
  if(!file)return;
  if(file.size>25*1024*1024){showToast('Sauvegarde trop volumineuse (25 Mo maximum)','error');input.value='';return;}
  const reader=new FileReader();
  reader.onload=function(){
    try{
      const envelope=JSON.parse(String(reader.result||''));
      if(!envelope||envelope.format!=='AGAI_BACKUP'||envelope.version!==1||!envelope.data)throw new Error('Format de sauvegarde non reconnu');
      if(!Array.isArray(envelope.data.CASERNES)||!envelope.data.CASERNE_DATA||typeof envelope.data.CASERNE_DATA!=='object')throw new Error('Contenu incomplet');
      confirmModal('Restaurer cette sauvegarde ? Les données locales actuelles seront remplacées.',function(){
        _applyDataObject(envelope.data);
        _postLoadInit();
        localStorage.setItem(JB_CACHE_KEY,JSON.stringify(envelope.data));
        saveData(true);
        if(CURRENT_CASERNE_ID)syncCaserneContext();
        showToast('Sauvegarde restaurée ✓','success');
        cM();
      });
    }catch(e){
      showToast('Restauration impossible : '+e.message,'error');
    }finally{
      input.value='';
    }
  };
  reader.onerror=function(){showToast('Lecture de la sauvegarde impossible','error');input.value='';};
  reader.readAsText(file);
}

// ══════════════════════════════════════════════════════
// MODULE SUPABASE (bascule prudente)
// ══════════════════════════════════════════════════════
// Le drapeau USE_SUPABASE et les constantes SB_* sont déclarés plus haut
// (près des variables globales) pour éviter tout risque de zone morte temporelle.

let _sbSaving    = false;
let _sbSaveTimer = null;
let _sbRealtime  = null;
let _sbPollTimer = null;

const _sbHeaders = {
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json'
};

// ── Découpe l'objet global en lignes par caserne + 1 ligne _GLOBAL ──
function _sbSplitRows(data){
  const rows = [];
  // Ligne globale : tout ce qui n'est pas dans CASERNE_DATA
  const globalPayload = {
    v: data.v,
    CASERNES: data.CASERNES,
    GLOBAL_ACCOUNTS: data.GLOBAL_ACCOUNTS,
    NAT: data.NAT,
    ACT_TYPES: data.ACT_TYPES,
    REPORT_TYPES: data.REPORT_TYPES,
    COM: data.COM,
    ENGIN_TYPES: data.ENGIN_TYPES,
    APL_COUNTER: data.APL_COUNTER,
    INT_GLOBAL_COUNTER: data.INT_GLOBAL_COUNTER,
    INT_CAS_COUNTER: data.INT_CAS_COUNTER,
    PILP_COUNTER: data.PILP_COUNTER,
    DISPOS_UNLOCKED: data.DISPOS_UNLOCKED,
    DISPO_REQUESTS: data.DISPO_REQUESTS,
    LOGIN_HISTORY: data.LOGIN_HISTORY,
    LOGIN_HISTORY_DELETED: data.LOGIN_HISTORY_DELETED
  };
  rows.push({ caserne: SB_GLOBAL_ROW, data: globalPayload });
  // Clés globales rangées dans CASERNE_DATA (ex. _cabbalrActif, _global)
  const globalCdKeys = {};
  Object.keys(data.CASERNE_DATA || {}).forEach(cid => {
    if (cid === '_cabbalrActif' || cid === '_initCabbalr' || cid === '_global') {
      globalCdKeys[cid] = data.CASERNE_DATA[cid];
    } else {
      rows.push({ caserne: cid, data: data.CASERNE_DATA[cid] });
    }
  });
  // Stocker les clés globales de CASERNE_DATA dans la ligne _GLOBAL
  if (Object.keys(globalCdKeys).length) {
    globalPayload._CD_GLOBAL = globalCdKeys;
  }
  return rows;
}

// ── Reconstruit l'objet global à partir des lignes Supabase ──
function _sbAssembleRows(rows){
  const data = { CASERNE_DATA: {} };
  rows.forEach(r => {
    if (r.caserne === SB_GLOBAL_ROW) {
      const g = r.data || {};
      Object.assign(data, {
        v: g.v, CASERNES: g.CASERNES, GLOBAL_ACCOUNTS: g.GLOBAL_ACCOUNTS,
        NAT: g.NAT, ACT_TYPES: g.ACT_TYPES, REPORT_TYPES: g.REPORT_TYPES, COM: g.COM, ENGIN_TYPES: g.ENGIN_TYPES, APL_COUNTER: g.APL_COUNTER,
        INT_GLOBAL_COUNTER: g.INT_GLOBAL_COUNTER, INT_CAS_COUNTER: g.INT_CAS_COUNTER,
        PILP_COUNTER: g.PILP_COUNTER, DISPOS_UNLOCKED: g.DISPOS_UNLOCKED,
        DISPO_REQUESTS: g.DISPO_REQUESTS, LOGIN_HISTORY: g.LOGIN_HISTORY,
        LOGIN_HISTORY_DELETED: g.LOGIN_HISTORY_DELETED
      });
      if (g._CD_GLOBAL) Object.keys(g._CD_GLOBAL).forEach(k => { data.CASERNE_DATA[k] = g._CD_GLOBAL[k]; });
    } else {
      data.CASERNE_DATA[r.caserne] = r.data;
    }
  });
  return data;
}

// ── PUSH Supabase : upsert ligne par ligne ──
async function _sbPush(data){
  if (_sbSaving) { window.setTimeout(function(){ _sbPush(data); }, 1000); return; }
  _sbSaving = true; _jbSetStatus('saving');
  try {
    // Allègement identique à JSONBin (photos + PDF régénérables)
    const lite = _stripHeavyForPush(data);
    let rows = _sbSplitRows(lite);
    // ── SÉCURITÉ MULTI-UTILISATEURS ──
    // Un utilisateur ne pousse QUE les lignes qu'il a le droit de modifier :
    // sa caserne active + la ligne globale. Sinon il écraserait les casernes
    // des autres avec sa copie locale (potentiellement périmée).
    // Le superadmin (qui édite légitimement plusieurs casernes) pousse tout.
    if (!(typeof isSuperAdmin === 'function' && isSuperAdmin())) {
      const allowed = new Set([SB_GLOBAL_ROW]);
      if (CURRENT_CASERNE_ID) allowed.add(CURRENT_CASERNE_ID);
      rows = rows.filter(function(r){ return allowed.has(r.caserne); });
    }
    const currentUser = (typeof CU !== 'undefined' && CU) ? (CU.l || '') : '';
    const payload = rows.map(r => ({
      caserne: r.caserne,
      data: r.data,
      updated_by: currentUser
    }));
    const resp = await fetch(SB_REST + '/caserne_data', {
      method: 'POST',
      headers: Object.assign({}, _sbHeaders, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('Supabase POST HTTP ' + resp.status);
    // Cache local complet (avec photos)
    if(_rcDirtyGeneration===generationAtStart){
      localStorage.setItem(JB_CACHE_KEY, JSON.stringify(data));
    }
    _jbLastPush = Date.now();
    _jbSetStatus('ok');
  } catch(e) {
    console.warn('[AGAI][SB] Push error:', e); _jbSetStatus('error');
  } finally {
    _sbSaving = false;
  }
}

// ── PULL Supabase : lit toutes les lignes et fusionne ──
async function _sbPull(silent){
  if (_sbSaving) return true;
  try {
    if (!silent) _jbSetStatus('loading');
    const resp = await fetch(SB_REST + '/caserne_data?select=caserne,data', { headers: _sbHeaders });
    if (!resp.ok) throw new Error('Supabase GET HTTP ' + resp.status);
    const rows = await resp.json();
    if (!Array.isArray(rows)) throw new Error('Données invalides');
    const remote = _sbAssembleRows(rows);
    // Réutilise EXACTEMENT la même logique de fusion que JSONBin
    const activeCid = CURRENT_CASERNE_ID;
    if (remote.CASERNE_DATA && activeCid) {
      const myData = JSON.parse(JSON.stringify(CASERNE_DATA[activeCid] || {}));
      _applyDataObject(remote);
      const remoteData = CASERNE_DATA[activeCid] || {};
      const mergeById = (local, rem) => {
        const map = {};
        (rem || []).forEach(x => { if (x && x.id) map[x.id] = x; });
        (local || []).forEach(x => { if (x && x.id) map[x.id] = x; });
        return Object.values(map).sort((a,b) => (b.h||'').localeCompare(a.h||''));
      };
      CASERNE_DATA[activeCid].ivs      = mergeById(myData.ivs, remoteData.ivs);
      CASERNE_DATA[activeCid].pilpIvs  = mergeById(myData.pilpIvs, remoteData.pilpIvs);
      CASERNE_DATA[activeCid].equipes  = mergeById(myData.equipes, remoteData.equipes);
      CASERNE_DATA[activeCid].activites= mergeById(myData.activites, remoteData.activites);
      CASERNE_DATA[activeCid].fmpas    = mergeById(myData.fmpas, remoteData.fmpas);
      CASERNE_DATA[activeCid].formStag = mergeById(myData.formStag, remoteData.formStag);
      CASERNE_DATA[activeCid].formForm = mergeById(myData.formForm, remoteData.formForm);
      const myDispos = myData.dispos || {};
      const remDispos = remoteData.dispos || {};
      const mergedDispos = Object.assign({}, remDispos);
      Object.keys(myDispos).forEach(wk => {
        mergedDispos[wk] = Object.assign({}, remDispos[wk] || {}, myDispos[wk]);
      });
      if (Date.now() - _jbEditLock < 15000) {
        CASERNE_DATA[activeCid].dispos = myDispos;
      } else {
        CASERNE_DATA[activeCid].dispos = mergedDispos;
      }
      if (myData.users && myData.users.length > 0) {
        CASERNE_DATA[activeCid].users = myData.users;
      }
    } else {
      _applyDataObject(remote);
    }
    _postLoadInit();
    if (activeCid) syncCaserneContext();
    const merged = JSON.parse(JSON.stringify(remote));
    if (activeCid && CASERNE_DATA[activeCid]) merged.CASERNE_DATA[activeCid] = CASERNE_DATA[activeCid];
    localStorage.setItem(JB_CACHE_KEY, JSON.stringify(merged));
    try{rI();}catch(e){}try{rAccueil();}catch(e){}try{rHist();}catch(e){}try{rAstrDispo();}catch(e){}try{rAstrEquipes();}catch(e){}
    const isTyping = document.getElementById('admin-add') && document.getElementById('admin-add').style.display !== 'none'
      && (document.getElementById('nu-prenom')?.value || document.getElementById('nu-nom')?.value || document.getElementById('nu-mdp')?.value);
    if (!isTyping) { try{rAdm();}catch(e){} }
    _jbSetStatus('ok'); return true;
  } catch(e) {
    console.warn('[AGAI][SB] Pull error:', e); _jbSetStatus('error'); return false;
  }
}

// ── Temps réel Supabase via WebSocket ──
function _sbStartRealtime(){
  try {
    if (_sbRealtime) { try{ _sbRealtime.close(); }catch(e){} _sbRealtime = null; }
    const wsUrl = SB_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SB_KEY + '&vsn=1.0.0';
    const ws = new WebSocket(wsUrl);
    _sbRealtime = ws;
    ws.onopen = function(){
      // S'abonner aux changements de la table caserne_data
      ws.send(JSON.stringify({
        topic: 'realtime:public:caserne_data',
        event: 'phx_join',
        payload: { config: { postgres_changes: [{ event: '*', schema: 'public', table: 'caserne_data' }] } },
        ref: '1'
      }));
      // Heartbeat toutes les 25s pour garder la connexion vivante
      ws._hb = setInterval(function(){
        try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' })); } catch(e){}
      }, 25000);
    };
    ws.onmessage = function(msg){
      try {
        const m = JSON.parse(msg.data);
        if (m.event === 'postgres_changes') {
          // Un autre utilisateur a modifié quelque chose → on tire les données
          if (_sbSaving) return;
          if (Date.now() - _jbLastPush < 3000) return; // ignorer notre propre écho
          if (Date.now() - _jbEditLock < 15000) return; // édition en cours
          _sbPull(true);
        }
      } catch(e){}
    };
    ws.onclose = function(){
      if (ws._hb) clearInterval(ws._hb);
      // Reconnexion auto après 5s si Supabase toujours actif
      if (USE_SUPABASE) window.setTimeout(_sbStartRealtime, 5000);
    };
    ws.onerror = function(){ try{ ws.close(); }catch(e){} };
  } catch(e) {
    console.warn('[AGAI][SB] Realtime error:', e);
    // Repli sur polling si le temps réel échoue
    _sbStartPolling();
  }
}

// ── Polling de secours (si WebSocket indisponible) ──
function _sbStartPolling(){
  if (_sbPollTimer) clearInterval(_sbPollTimer);
  _sbPollTimer = window.setInterval(function(){
    if (_sbSaving) return;
    if (Date.now() - _jbLastPush < 10000) return;
    if (Date.now() - _jbEditLock < 15000) return;
    _sbPull(true);
  }, 30000); // 30s : filet de sécurité, le temps réel fait le gros du travail
}


// ── MIGRATION : copie le bin JSONBin complet vers Supabase ──
async function _sbMigrateFromJsonbin(){
  if(!confirm('Migrer toutes les données JSONBin vers Supabase ?\n\nCela COPIE les données (rien n\'est supprimé côté JSONBin).\nÀ faire une seule fois, avant de basculer en mode Supabase.'))return;
  _jbSetStatus('saving');
  try{
    // 1) Lire le bin JSONBin complet
    const getResp=await fetch(JSONBIN_URL+'?meta=false',{headers:{'X-Master-Key':JSONBIN_KEY,'X-Access-Key':JSONBIN_KEY}});
    if(!getResp.ok)throw new Error('Lecture JSONBin HTTP '+getResp.status);
    const full=await getResp.json();
    if(!full||typeof full!=='object')throw new Error('Données JSONBin invalides');
    // 2) Découper en lignes (sans allègement : on migre tout ce que JSONBin contient)
    const rows=_sbSplitRows(full);
    const payload=rows.map(r=>({caserne:r.caserne,data:r.data,updated_by:'migration'}));
    // 3) Upsert vers Supabase
    const resp=await fetch(SB_REST+'/caserne_data',{
      method:'POST',
      headers:Object.assign({},_sbHeaders,{'Prefer':'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify(payload)
    });
    if(!resp.ok)throw new Error('Écriture Supabase HTTP '+resp.status);
    _jbSetStatus('ok');
    showToast('Migration réussie ✓ ('+rows.length+' lignes)','success');
    alert('Migration terminée avec succès !\n\n'+rows.length+' lignes copiées vers Supabase.\n\nVous pouvez maintenant vérifier dans Supabase, puis basculer USE_SUPABASE sur true quand vous êtes prêt.');
  }catch(e){
    console.warn('[AGAI][SB] Migration error:',e);
    _jbSetStatus('error');
    showToast('Erreur de migration','error');
    alert('Erreur lors de la migration :\n'+e.message);
  }
}

// ══════════════════════════════════════════════════════
// MODULE RECORDS (Option 3 : une ligne par enregistrement)
// Drapeau USE_RECORDS déclaré près des globales.
// ══════════════════════════════════════════════════════

const RC_SEP = '__'; // séparateur d'id : CIS02__iv__APL_2026_000009
const RC_REST = SB_URL + '/rest/v1/records';
let _rcSaving = false;
let _rcRealtime = null;
let _rcPollTimer = null;
let _rcLastPush = 0;
let _rcRetryTimer = null;
let _rcRetryDelay = 2500;
let _rcDirtyGeneration = 0;
let _rcLastSyncError = '';
let _rcRealtimeReady = false;
let _rcRealtimePullTimer = null;
let _rcRealtimePullPending = false;
let _rcRealtimeReconnectTimer = null;
let _rcRealtimeJoinSequence = 0;
const RC_PENDING_DIRTY_KEY = 'agai_rc_pending_dirty';
function _rcLoadPendingDirty(){
  try{
    const saved=JSON.parse(localStorage.getItem(RC_PENDING_DIRTY_KEY)||'[]');
    return Array.isArray(saved)?saved.filter(Boolean):[];
  }catch(e){return [];}
}
const _rcPendingDirty = new Set(_rcLoadPendingDirty());
function _rcPersistPendingDirty(){
  try{localStorage.setItem(RC_PENDING_DIRTY_KEY,JSON.stringify(Array.from(_rcPendingDirty)));}catch(e){}
}
function _rcRowWritableHere(row){
  if(!row)return false;
  if(typeof isSuperAdmin==='function'&&isSuperAdmin())return true;
  // La politique Supabase réserve _GLOBAL au superadmin. Un utilisateur de caserne
  // ne doit jamais laisser cette ligne bloquer l'envoi de ses interventions.
  return !!(CURRENT_CASERNE_ID&&row.caserne===CURRENT_CASERNE_ID);
}
function _rcPrunePendingDirty(candidateRows){
  const validIds=new Set((candidateRows||[]).map(function(row){return row&&row.id;}).filter(Boolean));
  let changed=false;
  Array.from(_rcPendingDirty).forEach(function(id){
    if(!validIds.has(id)){_rcPendingDirty.delete(id);changed=true;}
  });
  if(changed)_rcPersistPendingDirty();
  return changed;
}
function _rcUniqueRowsById(rows){
  const unique=new Map();
  (rows||[]).forEach(function(row){
    if(row&&row.id)unique.set(row.id,row);
  });
  return Array.from(unique.values());
}

// Migration locale pour les appels crees avant les identifiants techniques
// uniques. L'intervention la plus ancienne conserve l'ancien id ; chaque
// doublon plus recent recoit une nouvelle cle avant tout envoi a Supabase.
function _rcRepairDuplicateLocalRecordIds(){
  const cid=CURRENT_CASERNE_ID;
  const d=cid&&CASERNE_DATA&&CASERNE_DATA[cid];
  if(!cid||!d)return [];
  const repairs=[];
  const listTypes={ivs:'iv',pilpIvs:'pilp'};
  Object.keys(listTypes).forEach(function(listKey){
    const list=Array.isArray(d[listKey])?d[listKey]:[];
    const groups={};
    list.forEach(function(item,index){
      if(!item||!item.id)return;
      (groups[item.id]||(groups[item.id]=[])).push({item:item,index:index});
    });
    Object.keys(groups).forEach(function(oldId){
      const group=groups[oldId];
      if(group.length<2)return;
      group.sort(function(a,b){
        const ah=String(a.item.h||'');
        const bh=String(b.item.h||'');
        if(ah!==bh)return ah.localeCompare(bh);
        // Les nouveaux appels sont ajoutes au debut de la liste.
        return b.index-a.index;
      });
      group.slice(1).forEach(function(entry){
        const item=entry.item;
        if(!item._numApl&&String(oldId).indexOf('APL_')===0)item._numApl=oldId;
        const newId=makeInterventionRecordId(item._numApl||oldId);
        item.id=newId;
        repairs.push({type:listTypes[listKey],oldId:oldId,newId:newId});
      });
    });
  });
  if(!repairs.length)return repairs;
  repairs.forEach(function(repair){
    const oldRowId=_rcId(cid,repair.type,repair.oldId);
    const newRowId=_rcId(cid,repair.type,repair.newId);
    _rcPendingDirty.delete(oldRowId);
    _rcPendingDirty.add(newRowId);
  });
  _rcDirtyGeneration++;
  _rcPersistPendingDirty();
  console.warn('[AGAI][RC] Identifiants d interventions dupliques repares :',repairs.length);
  return repairs;
}
function _rcScheduleRetry(delay){
  if(!USE_RECORDS||!_rcPendingDirty.size)return;
  if(_rcRetryTimer)clearTimeout(_rcRetryTimer);
  const wait=typeof delay==='number'?Math.max(0,delay):_rcRetryDelay;
  _rcRetryTimer=window.setTimeout(function(){
    _rcRetryTimer=null;
    if(!_rcSaving)_rcPush(false);
  },wait);
}
function _rcTrackChangedRecords(previousData,nextData){
  if(!USE_RECORDS||!nextData)return;
  const previousRows=previousData?_rcSplitAll(previousData):[];
  const previousMap={};
  previousRows.forEach(function(row){
    previousMap[row.id]=JSON.stringify({data:row.data,deleted:!!row.deleted});
  });
  let changed=false;
  _rcSplitAll(nextData).filter(_rcRowWritableHere).forEach(function(row){
    const serialized=JSON.stringify({data:row.data,deleted:!!row.deleted});
    if(previousMap[row.id]!==serialized){_rcPendingDirty.add(row.id);changed=true;}
  });
  if(changed)_rcDirtyGeneration++;
  _rcPersistPendingDirty();
}
function _rcOverlayPendingLocalRows(rows){
  if(!Array.isArray(rows)||!_rcPendingDirty.size)return rows;
  const localRows=_rcSplitAll(_buildDataObject()).filter(function(row){return row.caserne!=='_GLOBAL'&&_rcPendingDirty.has(row.id);});
  if(!localRows.length)return rows;
  const indexes={};
  rows.forEach(function(row,index){if(row&&row.id)indexes[row.id]=index;});
  localRows.forEach(function(localRow){
    if(Object.prototype.hasOwnProperty.call(indexes,localRow.id))rows[indexes[localRow.id]]=localRow;
    else{indexes[localRow.id]=rows.length;rows.push(localRow);}
  });
  return rows;
}
function _rcRenderRealtimeViews(){
  try{rI();}catch(e){}
  try{rAccueil();}catch(e){}
  try{rHist();}catch(e){}
  try{rPilp();}catch(e){}
}
function _rcRequestRealtimePull(delay){
  _rcRealtimePullPending=true;
  if(_rcRealtimePullTimer)clearTimeout(_rcRealtimePullTimer);
  const wait=typeof delay==='number'?Math.max(0,delay):0;
  _rcRealtimePullTimer=window.setTimeout(function attemptRealtimePull(){
    _rcRealtimePullTimer=null;
    if(!_rcRealtimePullPending)return;
    const lockRemaining=Math.max(0,12000-(Date.now()-_jbEditLock));
    if(_rcSaving||_rcPendingDirty.size||lockRemaining>0){
      if(_rcPendingDirty.size)_rcScheduleRetry(0);
      const retryIn=lockRemaining>0?Math.min(1200,Math.max(250,lockRemaining+30)):600;
      _rcRealtimePullTimer=window.setTimeout(attemptRealtimePull,retryIn);
      return;
    }
    _rcRealtimePullPending=false;
    Promise.resolve(_rcPull(true)).then(function(ok){
      if(ok===false)_rcRequestRealtimePull(1500);
    });
  },wait);
}
function _rcRealtimeRecordFromMessage(message){
  const change=message&&message.payload&&message.payload.data;
  return change&&change.record?change.record:null;
}
function _rcApplyRealtimeInterventionRecord(record){
  if(!record||!record.caserne||!record.type)return false;
  if(record.caserne!==CURRENT_CASERNE_ID)return false;
  const listKey=record.type==='iv'?'ivs':(record.type==='pilp'?'pilpIvs':'');
  if(!listKey)return false;
  if(_rcPendingDirty.has(record.id))return false;
  let incoming=record.data;
  if(typeof incoming==='string'){
    try{incoming=JSON.parse(incoming);}catch(e){return false;}
  }
  if(!incoming||!incoming.id)return false;
  if(window._activeReportDraftIvId===incoming.id)return false;
  initCaserneData(record.caserne);
  const list=CASERNE_DATA[record.caserne][listKey]||(CASERNE_DATA[record.caserne][listKey]=[]);
  const index=list.findIndex(function(item){return item&&item.id===incoming.id;});
  if(record.deleted===true){
    if(index>=0)list.splice(index,1);
  }else{
    const current=index>=0?list[index]:null;
    const next=Object.assign({},incoming);
    if(current&&current.frelonPhotos&&!next.frelonPhotos)next.frelonPhotos=current.frelonPhotos;
    if(current&&current._pdfCache&&!next._pdfCache)next._pdfCache=current._pdfCache;
    if(index>=0)list[index]=next;else list.push(next);
  }
  syncCaserneContext();
  try{localStorage.setItem(JB_CACHE_KEY,JSON.stringify(_buildDataObject()));}catch(e){}
  _rcRenderRealtimeViews();
  _jbSetStatus('ok');
  return true;
}
window.addEventListener('online',function(){
  if(!USE_RECORDS)return;
  if(_rcPendingDirty.size)_rcScheduleRetry(0);
  _rcRequestRealtimePull(0);
  if(!_rcRealtime||_rcRealtime.readyState!==WebSocket.OPEN)_rcStartRealtime();
});
document.addEventListener('visibilitychange',function(){
  if(!USE_RECORDS||document.visibilityState!=='visible')return;
  _rcRequestRealtimePull(0);
  if(!_rcRealtime||_rcRealtime.readyState!==WebSocket.OPEN)_rcStartRealtime();
});

// Construit un id global unique
function _rcId(caserne, type, key){ return caserne + RC_SEP + type + RC_SEP + key; }

// ── Découpe une caserne en lignes records ──
// Renvoie un tableau {id,caserne,type,data,deleted}
function _rcSplitCaserne(cid, d){
  const rows = [];
  if(!d) return rows;
  const listTypes = {ivs:'iv', pilpIvs:'pilp', equipes:'equipe', fmpas:'fmpa', formStag:'formStag', formForm:'formForm', renforts:'renfort', activites:'activite'};
  Object.keys(listTypes).forEach(function(listKey){
    const type = listTypes[listKey];
    (d[listKey]||[]).forEach(function(item){
      if(!item || !item.id) return;
      rows.push({ id:_rcId(cid,type,item.id), caserne:cid, type:type, data:item, deleted:!!item._deleted });
    });
  });
  // Users : une ligne par login
  (d.users||[]).forEach(function(u){
    if(!u || !u.l) return;
    rows.push({ id:_rcId(cid,'user',u.l), caserne:cid, type:'user', data:u, deleted:!!u._deleted });
  });
  // Dispos : une ligne par (semaine, login)
  const dispos = d.dispos||{};
  Object.keys(dispos).forEach(function(wk){
    const week = dispos[wk]||{};
    Object.keys(week).forEach(function(login){
      rows.push({ id:_rcId(cid,'dispo',wk+RC_SEP+login), caserne:cid, type:'dispo', data:{wk:wk, login:login, slots:week[login]}, deleted:false });
    });
  });
  // Config caserne : tout le reste (structures non-listes) dans une ligne unique
  const cfg = {
    piquets: d.piquets||{},
    planningRotations: d.planningRotations||{},
    disposValidated: d.disposValidated||{},
    piquetsValidated: d.piquetsValidated||{},
    astrConfig: d.astrConfig||{},
    astrTelData: JSON.parse(JSON.stringify(d.astrTelData||{})),
    astrTelParams: Object.assign({},d.astrTelParams||{}),
    statsTaux: Object.assign({},d.statsTaux||{}),
    adminLogin: d.adminLogin||''
  };
  rows.push({ id:_rcId(cid,'config','main'), caserne:cid, type:'config', data:cfg, deleted:false });
  return rows;
}

// ── Reconstruit l'objet CASERNE_DATA[cid] à partir de lignes records ──
function _rcAssembleCaserne(rows){
  const out = { users:[], ivs:[], pilpIvs:[], equipes:[], fmpas:[], formStag:[], formForm:[], renforts:[], activites:[],
                dispos:{}, piquets:{}, planningRotations:{}, disposValidated:{}, piquetsValidated:{}, astrConfig:{},
                astrTelData:{}, astrTelParams:{}, statsTaux:{} };
  const listMap = {iv:'ivs', pilp:'pilpIvs', equipe:'equipes', fmpa:'fmpas', formStag:'formStag', formForm:'formForm', renfort:'renforts', activite:'activites'};
  rows.forEach(function(r){
    if(r.deleted) return; // on ignore les enregistrements supprimés à la reconstruction
    if(listMap[r.type]){
      out[listMap[r.type]].push(r.data);
    } else if(r.type==='user'){
      out.users.push(r.data);
    } else if(r.type==='dispo'){
      const dd = r.data||{};
      if(dd.wk && dd.login){ if(!out.dispos[dd.wk]) out.dispos[dd.wk]={}; out.dispos[dd.wk][dd.login]=dd.slots; }
    } else if(r.type==='config'){
      const c = r.data||{};
      out.piquets=c.piquets||{}; out.planningRotations=c.planningRotations||{};
      out.disposValidated=c.disposValidated||{}; out.piquetsValidated=c.piquetsValidated||{};
      out.astrConfig=c.astrConfig||{};
      out.astrTelData=c.astrTelData||{};
      out.astrTelParams=c.astrTelParams||{};
      out.statsTaux=c.statsTaux||{};
      out.adminLogin=c.adminLogin||'';
    }
  });
  return out;
}

// ── Découpe TOUTES les casernes + global en lignes records ──
function _rcSplitAll(data){
  let rows = [];
  // Ligne globale unique (compteurs, comptes, NAT/COM, etc.) — type 'global'
  rows.push({ id:'_GLOBAL'+RC_SEP+'global'+RC_SEP+'main', caserne:'_GLOBAL', type:'global', data:{
    v:data.v, CASERNES:data.CASERNES, GLOBAL_ACCOUNTS:data.GLOBAL_ACCOUNTS, NAT:data.NAT, ACT_TYPES:data.ACT_TYPES, REPORT_TYPES:data.REPORT_TYPES, COM:data.COM, ENGIN_TYPES:data.ENGIN_TYPES,
    APL_COUNTER:data.APL_COUNTER, INT_GLOBAL_COUNTER:data.INT_GLOBAL_COUNTER, INT_CAS_COUNTER:data.INT_CAS_COUNTER,
    PILP_COUNTER:data.PILP_COUNTER, DISPOS_UNLOCKED:data.DISPOS_UNLOCKED, DISPO_REQUESTS:data.DISPO_REQUESTS,
    LOGIN_HISTORY:data.LOGIN_HISTORY,
    LOGIN_HISTORY_DELETED:data.LOGIN_HISTORY_DELETED,
    _cabbalrActif:(data.CASERNE_DATA&&data.CASERNE_DATA._cabbalrActif),
    _initCabbalr:(data.CASERNE_DATA&&data.CASERNE_DATA._initCabbalr)
  }, deleted:false });
  Object.keys(data.CASERNE_DATA||{}).forEach(function(cid){
    if(cid==='_cabbalrActif'||cid==='_initCabbalr'||cid==='_global') return;
    rows = rows.concat(_rcSplitCaserne(cid, data.CASERNE_DATA[cid]));
  });
  return rows;
}

// ── Pousse une liste d'enregistrements précis vers Supabase ──
// Utilisé quand on écrit dans une caserne autre que la caserne active
// (ex. demande de renfort distribuée à plusieurs casernes destinataires).
async function _rcPushRecords(records){
  if(!USE_RECORDS) return;
  if(!records || !records.length) return;
  try {
    records=_rcUniqueRowsById(records);
    const currentUser = (typeof CU!=='undefined' && CU) ? (CU.l||'') : '';
    const payload = records.map(function(r){
      return { id:r.id, caserne:r.caserne, type:r.type, data:r.data, deleted:!!r.deleted, updated_by:currentUser };
    });
    const resp = await fetch(RC_REST, {
      method:'POST',
      headers:Object.assign({}, _sbHeaders, { 'Prefer':'resolution=merge-duplicates,return=minimal' }),
      body:JSON.stringify(payload)
    });
    if(!resp.ok) throw new Error('records push HTTP '+resp.status);
    _rcLastPush = Date.now();
  } catch(e){
    console.warn('[AGAI][RC] PushRecords error:', e);
    showToast('Erreur d\'envoi (sync)','error');
  }
}

// ── Marque des enregistrements comme supprimés (suppression douce) ──
// Envoie deleted=true à Supabase pour chaque id. À appeler AVANT de retirer
// les éléments des listes locales, sinon la suppression ne se propage pas.
async function _rcMarkDeleted(caserne, type, recordIds){
  if(!USE_RECORDS) return; // en mode normal, rien à faire
  if(!recordIds || !recordIds.length) return;
  try {
    const currentUser = (typeof CU!=='undefined' && CU) ? (CU.l||'') : '';
    const payload = recordIds.map(function(rid){
      return { id:_rcId(caserne,type,rid), caserne:caserne, type:type, data:{id:rid,_deleted:true}, deleted:true, updated_by:currentUser };
    });
    const resp = await fetch(RC_REST, {
      method:'POST',
      headers:Object.assign({}, _sbHeaders, { 'Prefer':'resolution=merge-duplicates,return=minimal' }),
      body:JSON.stringify(payload)
    });
    if(!resp.ok) throw new Error('records delete HTTP '+resp.status);
    _rcLastPush = Date.now();
  } catch(e){
    console.warn('[AGAI][RC] MarkDeleted error:', e);
    showToast('Erreur lors de la suppression (sync)','error');
  }
}

// ── En-têtes Supabase (réutilise _sbHeaders défini dans le module Supabase) ──

// ── PUSH : envoie uniquement les enregistrements modifiés (dirty) ──
// Si fullPush=true, envoie tout (utilisé pour la migration et le 1er chargement).
// ── Fusionne deux historiques de connexion par id de session ──
// Garde l'entrée la plus complète : une déconnexion renseignée prime sur "actif".
function _mergeLoginHistory(localArr, remoteArr, deletedMap){
  const deleted=deletedMap||LOGIN_HISTORY_DELETED||{};
  const map={};
  const add=function(e){
    if(!e||!e.id||deleted[e.id])return;
    const ex=map[e.id];
    if(!ex){map[e.id]=e;return;}
    // Priorité à l'entrée qui a une heure de déconnexion
    const exHas=!!ex.hDeconnexion, eHas=!!e.hDeconnexion;
    if(eHas&&!exHas){map[e.id]=e;}
    else if(eHas&&exHas){ if((e.hDeconnexion||'')>(ex.hDeconnexion||''))map[e.id]=e; }
    // sinon on garde l'existant
  };
  (remoteArr||[]).forEach(add);
  (localArr||[]).forEach(add);
  // Trier par heure de connexion décroissante (plus récent d'abord), limiter à 500
  const out=Object.keys(map).map(function(k){return map[k];});
  out.sort(function(a,b){return (b.hConnexion||'').localeCompare(a.hConnexion||'');});
  return out.slice(0,500);
}

// ── Pousse uniquement la ligne globale (LOGIN_HISTORY, etc.) avec keepalive ──
// Utilisé à la fermeture de page pour enregistrer la déconnexion de façon fiable,
// sans écraser le reste (on n'envoie QUE la ligne globale).
function _rcPushGlobalRowKeepalive(){
  if(!USE_RECORDS)return;
  try{
    const data=_buildDataObject();
    const rows=_rcSplitAll(data).filter(function(r){return r.type==='global';});
    if(!rows.length)return;
    const currentUser=(typeof CU!=='undefined'&&CU)?(CU.l||''):'';
    const payload=rows.map(function(r){return {id:r.id,caserne:r.caserne,type:r.type,data:r.data,deleted:!!r.deleted,updated_by:currentUser};});
    fetch(RC_REST,{
      method:'POST',
      headers:Object.assign({},_sbHeaders,{'Prefer':'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify(payload),
      keepalive:true
    }).catch(function(){});
  }catch(e){}
}

async function _rcProtectSensitiveGlobalRow(rows){
  if(typeof isSuperAdmin==='function'&&isSuperAdmin())return rows;
  const globalRow=(rows||[]).find(function(row){return row&&row.type==='global'&&row.caserne==='_GLOBAL';});
  if(!globalRow)return rows;
  try{
    const globalId=_rcId('_GLOBAL','global','main');
    const resp=await fetch(RC_REST+'?id=eq.'+encodeURIComponent(globalId)+'&select=data&limit=1',{headers:_sbHeaders});
    if(!resp.ok)throw new Error('global GET HTTP '+resp.status);
    const records=await resp.json();
    const remote=Array.isArray(records)&&records[0]&&records[0].data||null;
    if(!remote||!Array.isArray(remote.GLOBAL_ACCOUNTS))throw new Error('comptes globaux distants absents');
    const protectedKeys=['GLOBAL_ACCOUNTS','CASERNES','NAT','ACT_TYPES','REPORT_TYPES','COM','ENGIN_TYPES','_cabbalrActif','_initCabbalr'];
    protectedKeys.forEach(function(key){if(remote[key]!==undefined)globalRow.data[key]=remote[key];});
    globalRow.data.LOGIN_HISTORY_DELETED=Object.assign({},remote.LOGIN_HISTORY_DELETED||{},globalRow.data.LOGIN_HISTORY_DELETED||{});
    globalRow.data.LOGIN_HISTORY=_mergeLoginHistory(globalRow.data.LOGIN_HISTORY||[],remote.LOGIN_HISTORY||[],globalRow.data.LOGIN_HISTORY_DELETED);
    return rows;
  }catch(error){
    console.warn('[AGAI][RC] Protection comptes privil\u00e9gi\u00e9s : ligne globale non envoy\u00e9e',error);
    return (rows||[]).filter(function(row){return !(row&&row.type==='global'&&row.caserne==='_GLOBAL');});
  }
}

async function _rcPush(fullPush){
  if(_rcSaving){ _rcScheduleRetry(800); return; }
  _rcSaving = true; _jbSetStatus('saving');
  let generationAtStart=_rcDirtyGeneration;
  try {
    _rcRepairDuplicateLocalRecordIds();
    generationAtStart=_rcDirtyGeneration;
    const data = _buildDataObject();
    let rows;
    const allRows=_rcSplitAll(data);
    const candidate=fullPush?allRows:allRows.filter(_rcRowWritableHere);
    const pendingBeforePrune=_rcPendingDirty.size;
    _rcPrunePendingDirty(candidate);
    if(!fullPush&&pendingBeforePrune>0&&!_rcPendingDirty.size){
      _jbSetStatus('ok');
      return;
    }
    if(fullPush){
      rows = candidate;
    } else {
      // Ne pousser que la caserne active + les enregistrements marqués dirty
      // Si des ids dirty sont connus, envoyer uniquement ces lignes. Ajouter la
      // configuration à chaque appel rendait tout le lot vulnérable à une erreur annexe.
      if(_rcPendingDirty.size>0){
        rows = candidate.filter(function(r){ return _rcPendingDirty.has(r.id); });
      } else {
        rows = candidate;
      }
    }
    if(!rows.length){
      _jbSetStatus(_rcPendingDirty.size?'pending':'ok');
      if(_rcPendingDirty.size)_rcScheduleRetry();
      return;
    }
    // Allègement : retirer photos lourdes des interventions (réutilise la logique existante)
    rows = rows.map(function(r){
      if(r.type==='iv' && r.data){ const lite=Object.assign({},r.data); delete lite.frelonPhotos; delete lite._pdfCache; return Object.assign({},r,{data:lite}); }
      return r;
    });
    const hadGlobalRow=rows.some(function(row){return row&&row.type==='global'&&row.caserne==='_GLOBAL';});
    rows=await _rcProtectSensitiveGlobalRow(rows);
    if(hadGlobalRow&&!rows.some(function(row){return row&&row.type==='global'&&row.caserne==='_GLOBAL';}))throw new Error('protection de la ligne globale indisponible');
    rows=_rcUniqueRowsById(rows);
    if(!rows.length){_jbSetStatus(_rcPendingDirty.size?'pending':'ok');return;}
    const currentUser = (typeof CU!=='undefined' && CU) ? (CU.l||'') : '';
    const payload = rows.map(function(r){ return { id:r.id, caserne:r.caserne, type:r.type, data:r.data, deleted:r.deleted, updated_by:currentUser }; });
    const resp = await fetch(RC_REST, {
      method:'POST',
      headers:Object.assign({}, _sbHeaders, { 'Prefer':'resolution=merge-duplicates,return=minimal' }),
      body:JSON.stringify(payload)
    });
    if(!resp.ok){
      let detail='';try{detail=String(await resp.text()||'').replace(/\s+/g,' ').slice(0,180);}catch(readError){}
      throw new Error('HTTP '+resp.status+(detail?' — '+detail:''));
    }
    localStorage.setItem(JB_CACHE_KEY, JSON.stringify(data));
    _rcLastPush = Date.now();
    if(_rcDirtyGeneration===generationAtStart){
      rows.forEach(function(row){_rcPendingDirty.delete(row.id);});
    }
    _rcPersistPendingDirty();
    _rcLastSyncError='';
    _rcRetryDelay=2500;
    if(_rcRetryTimer){clearTimeout(_rcRetryTimer);_rcRetryTimer=null;}
    _jbSetStatus(_rcPendingDirty.size?'pending':'ok');
    if(_rcPendingDirty.size)_rcScheduleRetry();
  } catch(e){
    console.warn('[AGAI][RC] Push error:', e);
    _rcLastSyncError=String(e&&e.message||e||'Erreur inconnue');
    _rcPersistPendingDirty();
    _jbSetStatus('error');
    _rcRetryDelay=Math.min(30000,Math.max(2500,_rcRetryDelay*2));
    _rcScheduleRetry();
  } finally {
    _rcSaving = false;
  }
}

// ── PULL : lit tous les enregistrements et reconstruit l'état ──
async function _rcPull(silent){
  if(_rcSaving) return true;
  if(_rcPendingDirty.size){
    _jbSetStatus('pending');
    _rcScheduleRetry(0);
    return true;
  }
  try {
    if(!silent) _jbSetStatus('loading');
    const resp = await fetch(RC_REST + '?select=id,caserne,type,data,deleted', { headers:_sbHeaders });
    if(!resp.ok) throw new Error('records GET HTTP '+resp.status);
    const rows = await resp.json();
    if(!Array.isArray(rows)) throw new Error('Données records invalides');
    // Un pull peut avoir commencé juste avant une clôture. Les lignes locales
    // marquées en attente d'envoi restent prioritaires sur ce résultat distant.
    _rcOverlayPendingLocalRows(rows);
    // Reconstruire l'objet complet
    const data = { CASERNE_DATA:{} };
    const byCaserne = {};
    rows.forEach(function(r){
      if(r.caserne==='_GLOBAL'){
        if(r.type==='global' && !r.deleted){
          const g=r.data||{};
          Object.assign(data, {v:g.v, CASERNES:g.CASERNES, GLOBAL_ACCOUNTS:g.GLOBAL_ACCOUNTS, NAT:g.NAT, ACT_TYPES:g.ACT_TYPES, REPORT_TYPES:g.REPORT_TYPES, COM:g.COM, ENGIN_TYPES:g.ENGIN_TYPES,
            APL_COUNTER:g.APL_COUNTER, INT_GLOBAL_COUNTER:g.INT_GLOBAL_COUNTER, INT_CAS_COUNTER:g.INT_CAS_COUNTER,
            PILP_COUNTER:g.PILP_COUNTER, DISPOS_UNLOCKED:g.DISPOS_UNLOCKED, DISPO_REQUESTS:g.DISPO_REQUESTS, LOGIN_HISTORY:g.LOGIN_HISTORY,
            LOGIN_HISTORY_DELETED:g.LOGIN_HISTORY_DELETED});
          // Si une modification locale récente est en cours (ex. changement de mot de
          // passe superadmin), on conserve la version locale de GLOBAL_ACCOUNTS pour
          // ne pas l'écraser avec la version distante avant que le push soit confirmé.
          if(typeof _jbEditLock!=='undefined' && (Date.now()-_jbEditLock < 15000) && typeof GLOBAL_ACCOUNTS!=='undefined' && GLOBAL_ACCOUNTS.length){
            data.GLOBAL_ACCOUNTS=GLOBAL_ACCOUNTS.map(a=>({...a}));
          }
          // Fusion de l'historique de connexion : on combine remote et local par id
          // de session, en gardant l'entrée la plus complète (déconnexion renseignée
          // l'emporte). Évite qu'une connexion d'un autre poste efface une déconnexion.
          data.LOGIN_HISTORY_DELETED=Object.assign({},g.LOGIN_HISTORY_DELETED||{},typeof LOGIN_HISTORY_DELETED!=='undefined'?LOGIN_HISTORY_DELETED:{});
          data.LOGIN_HISTORY=_mergeLoginHistory(typeof LOGIN_HISTORY!=='undefined'?LOGIN_HISTORY:[], g.LOGIN_HISTORY||[],data.LOGIN_HISTORY_DELETED);
          // Clés globales rangées dans CASERNE_DATA (réglages superadmin partagés)
          if(!data.CASERNE_DATA)data.CASERNE_DATA={};
          if(g._cabbalrActif!==undefined)data.CASERNE_DATA._cabbalrActif=g._cabbalrActif;
          if(g._initCabbalr!==undefined)data.CASERNE_DATA._initCabbalr=g._initCabbalr;
        }
        return;
      }
      if(!byCaserne[r.caserne]) byCaserne[r.caserne]=[];
      byCaserne[r.caserne].push(r);
    });
    Object.keys(byCaserne).forEach(function(cid){
      data.CASERNE_DATA[cid] = _rcAssembleCaserne(byCaserne[cid]);
    });
    // Protéger les modifications locales en cours et récupérer les anciennes
    // heures locales si elles étaient absentes de l'ancien format "records".
    const activeCid = CURRENT_CASERNE_ID;
    if(activeCid && CASERNE_DATA[activeCid]){
      const localTel=JSON.parse(JSON.stringify(CASERNE_DATA[activeCid].astrTelData||{}));
      const remoteTel=(data.CASERNE_DATA[activeCid]&&data.CASERNE_DATA[activeCid].astrTelData)||{};
      if((Date.now()-_jbEditLock < 15000)||(!Object.keys(remoteTel).length&&Object.keys(localTel).length)){
        if(!data.CASERNE_DATA[activeCid])data.CASERNE_DATA[activeCid]={};
        data.CASERNE_DATA[activeCid].astrTelData=localTel;
        data.CASERNE_DATA[activeCid].astrTelParams=Object.assign({},CASERNE_DATA[activeCid].astrTelParams||{});
        _rcPendingDirty.add(_rcId(activeCid,'config','main'));
      }
    }
    if(activeCid && Date.now()-_jbEditLock < 15000 && CASERNE_DATA[activeCid]){
      // Fusionner les dispos : on garde le remote comme base, et on réapplique
      // les dispos locales par-dessus (priorité au local en cours d'édition).
      // Ainsi on ne perd ni mes dispos, ni celles qu'un autre agent vient d'enregistrer.
      if(data.CASERNE_DATA[activeCid]){
        const remoteDispos = data.CASERNE_DATA[activeCid].dispos || {};
        const localDispos = CASERNE_DATA[activeCid].dispos || {};
        const merged = JSON.parse(JSON.stringify(remoteDispos));
        Object.keys(localDispos).forEach(function(wk){
          merged[wk] = Object.assign({}, remoteDispos[wk]||{}, localDispos[wk]||{});
        });
        data.CASERNE_DATA[activeCid].dispos = merged;
      }
    }
    _applyDataObject(data);
    _postLoadInit();
    if(activeCid) syncCaserneContext();
    localStorage.setItem(JB_CACHE_KEY, JSON.stringify(data));
    try{rI();}catch(e){}try{rAccueil();}catch(e){}try{rHist();}catch(e){}try{rAstrDispo();}catch(e){}try{rAstrEquipes();}catch(e){}
    const isTyping = document.getElementById('admin-add') && document.getElementById('admin-add').style.display!=='none'
      && (document.getElementById('nu-prenom')?.value || document.getElementById('nu-nom')?.value || document.getElementById('nu-mdp')?.value);
    if(!isTyping){ try{rAdm();}catch(e){} }
    _jbSetStatus('ok'); return true;
  } catch(e){
    console.warn('[AGAI][RC] Pull error:', e); _jbSetStatus('error'); return false;
  }
}

// ── Temps réel records ──
function _rcStartRealtime(){
  try {
    if(_rcRealtimeReconnectTimer){clearTimeout(_rcRealtimeReconnectTimer);_rcRealtimeReconnectTimer=null;}
    if(_rcRealtime){
      _rcRealtime._agaiManualClose=true;
      try{_rcRealtime.close();}catch(e){}
      _rcRealtime=null;
    }
    _rcRealtimeReady=false;
    const wsUrl = SB_URL.replace('https://','wss://') + '/realtime/v1/websocket?apikey=' + SB_KEY + '&vsn=1.0.0';
    const ws = new WebSocket(wsUrl);
    _rcRealtime = ws;
    ws.onopen = function(){
      const joinRef=String(++_rcRealtimeJoinSequence);
      ws._agaiJoinRef=joinRef;
      ws.send(JSON.stringify({ topic:'realtime:public:records', event:'phx_join',
        payload:{ config:{ postgres_changes:[{ event:'*', schema:'public', table:'records' }] }, access_token:SB_KEY },
        ref:joinRef, join_ref:joinRef }));
      ws._agaiJoinTimer=window.setTimeout(function(){
        if(!_rcRealtimeReady&&ws.readyState===WebSocket.OPEN)try{ws.close();}catch(e){}
      },8000);
      ws._hb=setInterval(function(){
        try{ws.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:'hb-'+Date.now()}));}catch(e){}
      },25000);
    };
    ws.onmessage = function(msg){
      try {
        const m = JSON.parse(msg.data);
        if(m.event==='phx_reply'&&m.ref===ws._agaiJoinRef){
          if(ws._agaiJoinTimer){clearTimeout(ws._agaiJoinTimer);ws._agaiJoinTimer=null;}
          const subscriptions=m.payload&&m.payload.response&&m.payload.response.postgres_changes;
          if(m.payload&&m.payload.status==='ok'&&Array.isArray(subscriptions)&&subscriptions.length){
            ws._agaiSubscriptionIds=subscriptions.map(function(subscription){return subscription.id;});
            _rcRealtimeReady=true;
            _rcRequestRealtimePull(0);
          }else{
            ws._agaiJoinRejected=true;
            try{ws.close();}catch(e){}
          }
          return;
        }
        if(m.event==='postgres_changes'){
          if(Array.isArray(m.payload&&m.payload.ids)&&Array.isArray(ws._agaiSubscriptionIds)
            &&!m.payload.ids.some(function(id){return ws._agaiSubscriptionIds.includes(id);})){
            try{ws.close();}catch(e){}
            return;
          }
          if(Date.now()-_rcLastPush < 2000) return; // ignorer notre propre écho
          const applied=_rcApplyRealtimeInterventionRecord(_rcRealtimeRecordFromMessage(m));
          if(!applied)_rcRequestRealtimePull(0);
        }else if(m.event==='system'&&m.payload&&m.payload.status==='error'){
          try{ws.close();}catch(e){}
        }
      } catch(e){}
    };
    ws.onclose = function(){
      if(ws._hb)clearInterval(ws._hb);
      if(ws._agaiJoinTimer)clearTimeout(ws._agaiJoinTimer);
      if(_rcRealtime===ws)_rcRealtime=null;
      _rcRealtimeReady=false;
      if(USE_RECORDS&&!ws._agaiManualClose){
        _rcRequestRealtimePull(0);
        if(_rcRealtimeReconnectTimer)clearTimeout(_rcRealtimeReconnectTimer);
        _rcRealtimeReconnectTimer=window.setTimeout(_rcStartRealtime,ws._agaiJoinRejected?15000:3000);
      }
    };
    ws.onerror = function(){ try{ws.close();}catch(e){} };
  } catch(e){
    console.warn('[AGAI][RC] Realtime error:', e); _rcStartPolling();
  }
}

function _rcStartPolling(){
  if(_rcPollTimer) clearInterval(_rcPollTimer);
  _rcPollTimer = window.setInterval(function(){
    if(_rcSaving) return;
    if(Date.now()-_rcLastPush < 10000) return;
    if(Date.now()-_jbEditLock < 12000) return;
    _rcPull(true);
  }, 10000);
}

// ── Migration : copie les données actuelles (cache local) vers la table records ──
async function _rcMigrate(){
  if(!confirm('Migrer toutes les données actuelles vers le nouveau système (records) ?\n\nCela COPIE les données, rien n\'est supprimé.\nÀ faire une seule fois avant de basculer USE_RECORDS.')) return;
  _jbSetStatus('saving');
  try {
    const data = _buildDataObject();
    const rows = _rcSplitAll(data);
    const currentUser = 'migration';
    // Envoyer par paquets de 200 lignes pour éviter une requête trop grosse
    let sent = 0;
    for(let i=0;i<rows.length;i+=200){
      const chunk = rows.slice(i,i+200).map(function(r){ return {id:r.id,caserne:r.caserne,type:r.type,data:r.data,deleted:r.deleted,updated_by:currentUser}; });
      const resp = await fetch(RC_REST, { method:'POST', headers:Object.assign({},_sbHeaders,{'Prefer':'resolution=merge-duplicates,return=minimal'}), body:JSON.stringify(chunk) });
      if(!resp.ok) throw new Error('records POST HTTP '+resp.status);
      sent += chunk.length;
    }
    _jbSetStatus('ok');
    showToast('Migration records réussie ✓ ('+sent+' lignes)','success');
    alert('Migration terminée !\n\n'+sent+' enregistrements copiés vers la table records.\n\nVous pouvez vérifier dans Supabase, puis basculer USE_RECORDS sur true.');
  } catch(e){
    console.warn('[AGAI][RC] Migration error:', e); _jbSetStatus('error');
    showToast('Erreur migration records','error');
    alert('Erreur lors de la migration records :\n'+e.message);
  }
}


function saveAndRefresh(){saveData();}
function _odSyncAfterSave(){if(typeof odScheduleSync==='function')odScheduleSync();}


