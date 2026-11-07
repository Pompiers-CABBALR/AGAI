const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modules/16-email-js.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
function codeOf(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name);
  const body=source.indexOf('{',start);let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error(name+' incomplet');
}
function validate(values,now='19:46'){
  const fields=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value}]));
  const context={document:{getElementById:id=>fields[id]||null},N:()=>new Date(),
    getHHMM:()=>now,showToast:()=>{},String,Number};
  vm.createContext(context);
  vm.runInContext(codeOf(source,'hhmmToMinutes')+codeOf(source,'_sdisValidateHeures'),context);
  return context._sdisValidateHeures({_hDebut:values['cr-hdepart'],_hFin:values['cr-hretour']});
}
test('19:36 SDIS est accepté avant le retour à 19:43',()=>{
  assert.equal(validate({'cr-hacquis':'18:16','cr-hdepart':'18:20','cr-hsll':'18:26',
    'cr-hdispo':'19:05','cr-hopterminee':'19:36','cr-hretour':'19:43'}),true);
});
test('heure future et champ mal saisi sont refusés, passage à minuit autorisé',()=>{
  assert.equal(validate({'cr-hacquis':'18:16','cr-hdepart':'18:20','cr-hretour':'19:43',
    'cr-hopterminee':'19:50'}),false);
  assert.equal(validate({'cr-hacquis':'18:16','cr-hdepart':'18:20','cr-hretour':'19:43',
    'cr-hopterminee':'19:6'}),false);
  assert.equal(validate({'cr-hacquis':'23:10','cr-hdepart':'23:15','cr-hretour':'00:20',
    'cr-hopterminee':'23:50'},'00:30'),true);
});
test('saisie directe HH:MM avec clavier numérique et bundle cohérent',()=>{
  const context={String,escHtml:value=>value};vm.createContext(context);
  for(const name of ['sdisNormalizeTimeEntry','sdisCompleteTimeEntry','sdisTimeInputHTML']){
    vm.runInContext(codeOf(source,name),context);
    assert.equal(codeOf(bundle,name),codeOf(source,name));
  }
  const input={value:'1936'};context.sdisNormalizeTimeEntry(input);
  assert.equal(input.value,'19:36');
  assert.match(context.sdisTimeInputHTML('cr-hopterminee','19:36',false),/type="text" inputmode="numeric"/);
  assert.match(codeOf(bundle,'showCompteRenduModal'),/sdisTimeInputHTML\('cr-hopterminee'/);
  for(const name of ['sdisUpdateMinMax','_sdisValidateHeures'])
    assert.equal(codeOf(bundle,name),codeOf(source,name));
});
