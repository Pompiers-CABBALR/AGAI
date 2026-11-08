const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'modules/17-animal-js.js'), 'utf8');
const section = source.slice(source.indexOf('// Catalogue d\'essai'), source.indexOf('function savePriseEnCharge('));
assert.ok(section.startsWith('// Catalogue d\'essai'));

function catalog(species, race) {
  const fields = {
    'pec-espece': { value: species },
    'pec-race': { value: race },
    'pec-couleur': { value: '' }
  };
  const context = {
    document: { getElementById: id => fields[id] },
    escHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  };
  vm.runInNewContext(section + '\nglobalThis.catalogApi={pecSpeciesOptions,pecCatalogEntries,pecChooseCatalog,pecSpeciesChanged,photos:PEC_PHOTOS_CC0};', context);
  return { ...context.catalogApi, fields };
}

test('le choix d’animal distingue élevage, équidés et NAC sans perdre une ancienne valeur', () => {
  const api = catalog('Chien', '');
  const options = api.pecSpeciesOptions('Ancienne espèce');
  assert.match(options, /Chiens et chats/);
  assert.match(options, /Animaux d’élevage/);
  assert.match(options, /Équidés/);
  assert.match(options, /NAC/);
  assert.match(options, /value="Ancienne espèce" selected/);
  assert.ok(api.pecCatalogEntries('race').includes('Labrador'));
  assert.ok(catalog('Bovin', '').pecCatalogEntries('race').includes('Limousine'));
  assert.ok(catalog('Cheval', '').pecCatalogEntries('race').includes('Shetland'));
  assert.ok(catalog('Lapin', '').pecCatalogEntries('race').includes('Bélier'));
});

test('les robes de la race sont proposées en premier sans exclure les autres', () => {
  const dog = catalog('Chien', 'Labrador').pecCatalogEntries('couleur');
  assert.deepEqual(Array.from(dog.slice(0, 3)), ['Noir', 'Jaune / sable', 'Chocolat']);
  assert.ok(dog.includes('Merle'));
  const horse = catalog('Cheval', 'Frison').pecCatalogEntries('couleur');
  assert.equal(horse[0], 'Noir');
  assert.ok(horse.includes('Bai'));
});

test('un changement d’espèce ne supprime pas les données déjà saisies', () => {
  const api = catalog('Chat', 'Labrador');
  api.fields['pec-couleur'].value = 'Sable';
  api.pecSpeciesChanged();
  assert.equal(api.fields['pec-race'].value, 'Labrador');
  assert.equal(api.fields['pec-couleur'].value, 'Sable');
});

test('les photos pilotes sont locales, légères et sourcées', () => {
  const api = catalog('Chien', 'Labrador');
  for (const photo of Object.values(api.photos)) {
    assert.equal(photo.length, 3);
    const bytes = fs.readFileSync(path.join(root, 'assets', 'animal', photo[2]));
    assert.ok(bytes.length > 5_000 && bytes.length < 150_000, photo[2]);
    assert.equal(bytes[0], 0xff, photo[2]);
    assert.equal(bytes[1], 0xd8, photo[2]);
  }
  assert.match(fs.readFileSync(path.join(root, 'assets/animal/SOURCES.md'), 'utf8'), /CC0 1\.0/);
});

test('le formulaire utilise le catalogue sans changer les champs enregistrés', () => {
  const form = source.slice(source.indexOf('function showPriseEnChargeModal('), source.indexOf('// Données d\'aide prise en charge animal'));
  assert.match(form, /pecSpeciesOptions\(saved\.espece\|\|'Chien'\)/);
  assert.match(form, /pecCatalogPanel\('race'\)/);
  assert.match(form, /pecCatalogPanel\('couleur'\)/);
  assert.doesNotMatch(form, /ouvrirGaleriePec\(/);
  assert.match(source, /race:\s*\(document\.getElementById\('pec-race'\)/);
  assert.match(source, /couleur:\s*\(document\.getElementById\('pec-couleur'\)/);
  assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /const PEC_PHOTOS_CC0 =/);
});

test('l’aperçu public est autonome et ne contient aucune action de sauvegarde', () => {
  const demoJs = fs.readFileSync(path.join(root, 'modules/animal-catalog-demo.js'), 'utf8');
  assert.equal(demoJs.trim(), section.trim());
  assert.doesNotThrow(() => vm.runInNewContext(demoJs, { document: {}, window: {} }, { timeout: 1000 }));
  const page = fs.readFileSync(path.join(root, 'catalogue-animal-demo.html'), 'utf8');
  assert.match(page, /modules\/animal-catalog-demo\.js/);
  assert.match(page, /aucun choix n’est enregistré/);
  assert.doesNotMatch(page, /savePriseEnCharge|saveData|supabase|AGAI_WRITE/);
  const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version;
  assert.match(page, new RegExp('style\\.css\\?v=' + version));
  assert.match(page, new RegExp('animal-catalog-demo\\.js\\?v=' + version));
  assert.match(demoJs, /classList\.toggle\('pec-catalog-expanded',opening\)/);
  assert.match(fs.readFileSync(path.join(root, 'style.css'), 'utf8'), /\.pec-form-grid>\.fg\.pec-catalog-expanded\{grid-column:1\/-1;/);
});
