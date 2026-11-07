const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modules/16-email-js.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
function codeOf(text,name){
  const start=text.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const body=text.indexOf('{',start);let depth=0;
  for(let i=body;i<text.length;i++){
    if(text[i]==='{')depth++;
    if(text[i]==='}'&&!--depth)return text.slice(start,i+1);
  }
  throw Error(name+' incomplet');
}
const ids=['cr-hacquis','cr-numsdis','cr-hdepart','cr-hretour','cr-hsll','cr-hdispo',
  'cr-hopterminee','cr-materiels','cr-consommables','cr-annotations'];
const values=['18:16','SDIS-555','18:20','19:43','18:26','19:05','19:36','LDT','-','Pompe'];
function setup(override={}){
  const fields=Object.fromEntries(ids.map((id,i)=>[id,{value:values[i]}]));
  fields['cr-texte']={value:'Compte rendu opérationnel'};
  const iv={id:'intervention-555',_sdis:true,_hDebut:'18:20',_hFin:'19:43',s:'terminee',agr:'chef',tl:[]};
  let confirmed=false,saved=0,callbacks=[];
  const ctx={document:{getElementById:id=>fields[id]||null},String,Number,Array,Date,
    CU:{l:'chef'},N:()=>new Date('2026-11-07T18:46:00Z'),getHHMM:()=> '19:46',getH:()=> '20261107_1946',
    interventionById:()=>iv,isInterventionReportChef:()=>true,isAdminModeActive:()=>false,
    compteRenduLate:()=>false,_isFrelonIv:()=>false,showToast:()=>{},
    confirmModal:(_message,callback)=>{confirmed=true;callbacks.push(callback);},
    writeCompteRenduDraft:()=>{},saveData:()=>{saved++;},
    refreshOperationalInterventionViews:()=>{},rHist:()=>{},cM:()=>{},oM:()=>{},
    setTimeout:()=>{},pushTL:()=>{},...override};
  vm.createContext(ctx);
  for(const name of ['hhmmToMinutes','_sdisReadFields','_sdisValidateHeures','_sdisSaveFields','validerCompteRendu'])
    vm.runInContext(codeOf(source,name),ctx);
  return {ctx,iv,fields,get confirmed(){return confirmed;},get saved(){return saved;},callbacks};
}
test('confirmation SDIS conserve toutes les heures même quand le formulaire disparaît',()=>{
  const h=setup();h.ctx.validerCompteRendu(h.iv.id);
  assert.equal(h.confirmed,true);
  for(const id of Object.keys(h.fields))delete h.fields[id];
  h.callbacks[0]();
  assert.equal(h.saved,1);assert.equal(h.iv._crValide,true);
  assert.equal(h.iv._hAcquis,'18:16');assert.equal(h.iv._numSDIS,'SDIS-555');
  assert.equal(h.iv._hDebut,'18:20');assert.equal(h.iv._hFin,'19:43');
  assert.equal(h.iv._hSll,'18:26');assert.equal(h.iv._hDispo,'19:05');
  assert.equal(h.iv._hOpTerminee,'19:36');
  assert.equal(h.iv._materiels,'LDT');assert.equal(h.iv._annotations,'Pompe');
});
test('annuler la confirmation ne modifie aucune heure ni validation',()=>{
  const h=setup();h.ctx.validerCompteRendu(h.iv.id);
  assert.equal(h.confirmed,true);assert.equal(h.iv._crValide,undefined);
  assert.equal(h.iv._hAcquis,undefined);assert.equal(h.saved,0);
});
test('une heure essentielle ou un champ du formulaire manquant bloque la validation',()=>{
  let h=setup();h.fields['cr-hopterminee'].value='';h.ctx.validerCompteRendu(h.iv.id);
  assert.equal(h.confirmed,false);assert.equal(h.saved,0);
  h=setup();delete h.fields['cr-hacquis'];h.ctx.validerCompteRendu(h.iv.id);
  assert.equal(h.confirmed,false);assert.equal(h.saved,0);
});
test('les mêmes fonctions de capture sont présentes dans le bundle',()=>{
  for(const name of ['_sdisReadFields','_sdisValidateHeures','_sdisSaveFields',
    '_frelonReadFields','_frelonSaveFields'])assert.equal(codeOf(bundle,name),codeOf(source,name),name);
  assert.match(codeOf(bundle,'validerCompteRendu'),/_sdisSaveFields\(iv,sdisFields\)/);
  assert.match(codeOf(bundle,'validerCompteRendu'),/_frelonSaveFields\(iv,frelonFields\)/);
});
test('la confirmation frelons conserve les champs lus avant la disparition du formulaire',()=>{
  const fieldIds=['frel-destruction','frel-type','frel-haies','frel-arbre','frel-hauteur',
    'frel-eau','frel-env','frel-bois','frel-pop','frel-dim-h','frel-dim-d','frel-moyen','frel-billes'];
  const fields=Object.fromEntries(fieldIds.map(id=>[id,{value:id==='frel-destruction'?'Oui':'saisi'}]));
  const ctx={document:{getElementById:id=>fields[id]||null},window:{_frelonPhotoB64:null}};
  vm.createContext(ctx);
  for(const name of ['_frelonReadFields','_frelonSaveFields'])vm.runInContext(codeOf(source,name),ctx);
  const captured=ctx._frelonReadFields();
  for(const id of fieldIds)delete fields[id];
  const iv={};
  assert.equal(ctx._frelonSaveFields(iv,captured),true);
  assert.equal(iv._frelonDestruction,true);
  assert.equal(iv._frelonData.type,'saisi');
  assert.equal(iv._frelonData.billes,'saisi');
});
