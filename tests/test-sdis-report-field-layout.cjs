const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const root=path.join(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'modules/16-email-js.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
const fieldIds=['cr-numsdis','cr-hacquis','cr-hdepart','cr-hsll','cr-hdispo','cr-hretour','cr-hopterminee'];

function sdisForm(source){
  const start=source.indexOf('const sdisFields = iv._sdis ?');
  const end=source.indexOf('// Champs Frelons asiatiques',start);
  assert.ok(start>=0&&end>start,'formulaire SDIS présent');
  return source.slice(start,end);
}

test('le numéro SDIS précède les six heures dans les deux versions du formulaire',()=>{
  const moduleForm=sdisForm(moduleSource),bundleForm=sdisForm(bundle);
  assert.equal(bundleForm,moduleForm,'le bundle et le module doivent rester identiques');
  let previous=-1;
  for(const id of fieldIds){
    const position=moduleForm.indexOf(id);
    assert.ok(position>previous,id+' dans le bon ordre');
    assert.equal(moduleForm.indexOf(id,position+id.length),-1,id+' unique');
    previous=position;
  }
  assert.match(moduleForm,/class="sdis-hours-grid"/);
});

test('les heures tiennent sur une ligne large et se replient sur écran étroit',()=>{
  assert.match(css,/\.sdis-hours-grid\s*\{[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:900px\),\(pointer:coarse\)\{\.sdis-hours-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:540px\)\{\.sdis-hours-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
