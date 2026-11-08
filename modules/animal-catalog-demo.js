// Catalogue d'essai : les valeurs restent du texte libre dans les fiches existantes.
// Les photos CC0 sont des exemples illustratifs, jamais une preuve de race.
const PEC_TYPES = [
  ['Chiens et chats', ['Chien','Chat']],
  ['Animaux d’élevage', ['Bovin','Ovin','Caprin','Porcin']],
  ['Équidés', ['Cheval','Âne']],
  ['NAC', ['Lapin','Furet','Cobaye','Hamster','Oiseau','Reptile']],
  ['Autre', ['Autre']]
];
const PEC_RACE_CATALOG = {
  Chien: ['Akita Inu','American Staffordshire Terrier','Beagle','Berger allemand','Berger australien','Berger belge Malinois','Bichon frisé','Border Collie','Bouledogue français','Boxer','Braque allemand','Briard','Cane Corso','Caniche','Cavalier King Charles','Chihuahua','Cocker Spaniel anglais','Dalmatien','Épagneul breton','Golden Retriever','Husky sibérien','Jack Russell Terrier','Labrador','Rottweiler','Saint-Bernard','Shih Tzu','Spitz allemand','Teckel','Terre-Neuve','Yorkshire Terrier','Croisé / type apparent','Non déterminé'],
  Chat: ['Abyssin','Bengal','British Shorthair','Chartreux','Européen','Maine Coon','Norvégien','Persan','Ragdoll','Sacré de Birmanie','Siamois','Sphynx','Croisé / type apparent','Non déterminé'],
  Bovin: ['Aubrac','Blonde d’Aquitaine','Charolaise','Holstein','Limousine','Montbéliarde','Normande','Salers','Simmental française','Croisé / type apparent','Non déterminé'],
  Ovin: ['Berrichon du Cher','Île-de-France','Lacaune','Mérinos d’Arles','Suffolk','Croisé / type apparent','Non déterminé'],
  Caprin: ['Alpine','Anglo-nubienne','Poitevine','Saanen','Croisé / type apparent','Non déterminé'],
  Porcin: ['Duroc','Large White','Landrace français','Piétrain','Croisé / type apparent','Non déterminé'],
  Cheval: ['Arabe','Camargue','Connemara','Frison','Haflinger','Percheron','Pur-sang','Selle français','Shetland','Trotteur français','Croisé / type apparent','Non déterminé'],
  Âne: ['Âne de Provence','Âne du Cotentin','Baudet du Poitou','Grand noir du Berry','Croisé / type apparent','Non déterminé'],
  Lapin: ['Bélier','Fauve de Bourgogne','Géant des Flandres','Nain de couleur','Rex','Croisé / type apparent','Non déterminé'],
  Furet: ['Furet domestique','Non déterminé'],
  Cobaye: ['Abyssinien','Péruvien','Rex','Rosette','Shelty','Non déterminé'],
  Hamster: ['Doré / syrien','Nain de Campbell','Nain russe','Roborovski','Non déterminé'],
  Oiseau: ['Canari','Inséparable','Perruche ondulée','Perroquet gris du Gabon','Non déterminé'],
  Reptile: ['Agame barbu','Gecko léopard','Python royal','Tortue d’Hermann','Non déterminé'],
  Autre: ['Non déterminé']
};
const PEC_ROBE_CATALOG = {
  Chien: ['Noir','Blanc','Fauve','Sable','Brun / chocolat','Gris','Roux','Bringé','Merle','Bicolore','Tricolore'],
  Chat: ['Noir','Blanc','Bleu / gris','Roux','Crème','Tigré / tabby','Écaille de tortue','Bicolore','Tricolore'],
  Bovin: ['Noir','Blanc','Rouge','Fauve','Froment','Pie noire','Pie rouge','Bringé'],
  Ovin: ['Blanc','Noir','Brun','Gris','Pie'],
  Caprin: ['Blanc','Noir','Brun','Chamoisé','Pie'],
  Porcin: ['Blanc','Noir','Roux','Pie'],
  Cheval: ['Bai','Alezan','Noir','Gris','Isabelle','Palomino','Pie','Rouan'],
  Âne: ['Gris','Bai','Noir','Brun','Pie'],
  Lapin: ['Blanc','Noir','Gris','Fauve','Chamois','Havane','Pie'],
  Furet: ['Albinos','Putoisé','Sable','Champagne','Noir','Blanc'],
  Cobaye: ['Blanc','Noir','Fauve','Roux','Tricolore','Agouti'],
  Hamster: ['Doré','Blanc','Gris','Noir','Bicolore'],
  Oiseau: ['Vert','Bleu','Jaune','Blanc','Gris','Multicolore'],
  Reptile: ['Vert','Brun','Gris','Jaune','Noir','Tacheté'],
  Autre: ['Noir','Blanc','Gris','Brun','Roux','Multicolore']
};
const PEC_ROBES_PAR_RACE = {
  'Chien|Labrador': ['Noir','Jaune / sable','Chocolat'],
  'Chien|Golden Retriever': ['Doré','Crème'],
  'Chien|Berger belge Malinois': ['Fauve charbonné'],
  'Chat|Chartreux': ['Bleu / gris'],
  'Chat|Maine Coon': ['Roux tigré','Noir','Bleu / gris','Bicolore'],
  'Bovin|Limousine': ['Froment'],
  'Bovin|Holstein': ['Pie noire','Pie rouge'],
  'Cheval|Frison': ['Noir'],
  'Cheval|Haflinger': ['Alezan crins lavés']
};
const PEC_PHOTOS_CC0 = {
  'race|Chien|Labrador': ['Labrador kutya.jpg','Hári Zalán','labrador-jaune.jpg'],
  'race|Chien|Golden Retriever': ['Golden Retriever adult.jpg','Johan Spaedtke','golden-retriever.jpg'],
  'race|Chat|Chartreux': ['Safira Chartreux cat.jpg','Bobkovka','chartreux.jpg'],
  'race|Chat|Maine Coon': ['Cat MaineCoon.jpg','Dartuchi','maine-coon.jpg'],
  'race|Bovin|Limousine': ['Chamborand (Creuse, Fr), vaches limousines.JPG','Henk van Gaal','bovin-limousin.jpg'],
  'race|Cheval|Shetland': ['Shetland Pony at Avon Valley.jpg','Rodw','poney-shetland.jpg'],
  'race|Lapin|Bélier': ['Lopeared rabbit in Artis themepark, South Korea.jpg','Drcbrothephotographer','lapin-belier.jpg'],
  'couleur|Chien|Labrador|Noir': ['Labrador.retriever.jpg','C.cantile','labrador-noir.jpg'],
  'couleur|Chien|Labrador|Jaune / sable': ['Labrador kutya.jpg','Hári Zalán','labrador-jaune.jpg'],
  'couleur|Chat|Chartreux|Bleu / gris': ['Safira Chartreux cat.jpg','Bobkovka','chartreux.jpg'],
  'couleur|Chat|Maine Coon|Roux tigré': ['Cat MaineCoon.jpg','Dartuchi','maine-coon.jpg'],
  'couleur|Bovin|Limousine|Froment': ['Chamborand (Creuse, Fr), vaches limousines.JPG','Henk van Gaal','bovin-limousin.jpg']
};

function pecSpeciesOptions(selected) {
  const values=PEC_TYPES.flatMap(function(group){return group[1];});
  let html=PEC_TYPES.map(function(group){
    return '<optgroup label="'+escHtml(group[0])+'">'+group[1].map(function(value){
      return '<option value="'+escHtml(value)+'"'+(value===selected?' selected':'')+'>'+escHtml(value)+'</option>';
    }).join('')+'</optgroup>';
  }).join('');
  if(selected&&!values.includes(selected)) html+='<option value="'+escHtml(selected)+'" selected>'+escHtml(selected)+'</option>';
  return html;
}
function pecCatalogPanel(type) {
  const label=type==='race'?'une race':'une couleur ou robe';
  return '<div class="pec-catalog" id="pec-'+type+'-catalog" hidden>'
    +'<label class="fgl" for="pec-'+type+'-search">Rechercher '+label+'</label>'
    +'<input class="fi" id="pec-'+type+'-search" type="search" autocomplete="off" oninput="pecRenderCatalog(\''+type+'\')"/>'
    +'<div class="pec-catalog-layout"><div class="pec-catalog-list" id="pec-'+type+'-list"></div>'
    +'<div class="pec-catalog-preview" id="pec-'+type+'-preview" aria-live="polite">Survolez un nom ou touchez « Photo ».</div></div>'
    +'<div class="pec-catalog-note">Photo illustrative, identification à confirmer. La saisie libre reste possible.</div></div>';
}
function pecCatalogSpecies() {
  return (document.getElementById('pec-espece')||{}).value||'Chien';
}
function pecCatalogEntries(type) {
  const species=pecCatalogSpecies();
  if(type==='race') return PEC_RACE_CATALOG[species]||PEC_RACE_CATALOG.Autre;
  const race=(document.getElementById('pec-race')||{}).value||'';
  const key=Object.keys(PEC_ROBES_PAR_RACE).find(function(item){return item.toLocaleLowerCase('fr')===(species+'|'+race.trim()).toLocaleLowerCase('fr');});
  return Array.from(new Set([...(PEC_ROBES_PAR_RACE[key]||[]),...(PEC_ROBE_CATALOG[species]||PEC_ROBE_CATALOG.Autre)]));
}
function pecToggleCatalog(type) {
  const panel=document.getElementById('pec-'+type+'-catalog');
  if(!panel)return;
  const opening=panel.hidden;
  ['race','couleur'].forEach(function(other){const el=document.getElementById('pec-'+other+'-catalog');if(el)el.hidden=true;});
  panel.hidden=!opening;
  if(opening){
    pecRenderCatalog(type);
    const search=document.getElementById('pec-'+type+'-search');
    if(search&&typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches)search.focus();
  }
}
function pecRenderCatalog(type) {
  const list=document.getElementById('pec-'+type+'-list');
  if(!list)return;
  const query=((document.getElementById('pec-'+type+'-search')||{}).value||'').toLocaleLowerCase('fr');
  const names=pecCatalogEntries(type).filter(function(name){return name.toLocaleLowerCase('fr').includes(query);});
  list.replaceChildren();
  if(!names.length){list.textContent='Aucun résultat. Saisissez directement le nom dans le champ.';return;}
  names.forEach(function(name){
    const row=document.createElement('div');row.className='pec-catalog-row';
    const select=document.createElement('button');select.type='button';select.className='pec-catalog-name';select.textContent=name;
    select.addEventListener('mouseenter',function(){pecPreviewCatalog(type,name);});
    select.addEventListener('focus',function(){pecPreviewCatalog(type,name);});
    select.addEventListener('click',function(){pecChooseCatalog(type,name);});
    const photo=document.createElement('button');photo.type='button';photo.className='pec-catalog-photo';photo.textContent='Photo';
    photo.setAttribute('aria-label','Aperçu de '+name);
    photo.addEventListener('click',function(){pecPreviewCatalog(type,name);});
    row.append(select,photo);list.appendChild(row);
  });
}
function pecPreviewCatalog(type,name) {
  const preview=document.getElementById('pec-'+type+'-preview');if(!preview)return;
  const species=pecCatalogSpecies();
  const race=((document.getElementById('pec-race')||{}).value||'').trim();
  const key=type==='race'?'race|'+species+'|'+name:'couleur|'+species+'|'+race+'|'+name;
  const photo=PEC_PHOTOS_CC0[key];
  preview.replaceChildren();
  const title=document.createElement('strong');title.textContent=name;preview.appendChild(title);
  if(!photo){const note=document.createElement('p');note.textContent='Photo de référence à compléter pour cette entrée.';preview.appendChild(note);return;}
  const fileUrl='https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(photo[0]).replace(/%20/g,'_');
  const img=document.createElement('img');img.alt='Exemple illustratif : '+name;img.loading='lazy';img.referrerPolicy='no-referrer';
  img.onerror=function(){this.replaceWith(document.createTextNode('Photo indisponible hors connexion.'));};
  img.src='assets/animal/'+photo[2];
  preview.appendChild(img);
  const credit=document.createElement('a');credit.href=fileUrl;credit.target='_blank';credit.rel='noopener noreferrer';
  credit.textContent='Photo : '+photo[1]+' · Wikimedia Commons · CC0';preview.appendChild(credit);
}
function pecChooseCatalog(type,name) {
  const input=document.getElementById('pec-'+type);if(input)input.value=name;
  const panel=document.getElementById('pec-'+type+'-catalog');if(panel)panel.hidden=true;
  if(type==='race')pecRaceChanged();
}
function pecRaceChanged() {
  const panel=document.getElementById('pec-couleur-catalog');
  if(panel&&!panel.hidden)pecRenderCatalog('couleur');
}
function pecSpeciesChanged() {
  ['race','couleur'].forEach(function(type){
    const panel=document.getElementById('pec-'+type+'-catalog');
    if(panel&&!panel.hidden)pecRenderCatalog(type);
  });
}
