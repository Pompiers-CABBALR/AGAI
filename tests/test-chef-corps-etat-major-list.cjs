const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'modules/11-admin-js-partie-2-2-gestion-utilisateurs.js'),'utf8');
const bundleSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
function sourceOf(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' absent');
  const body=source.indexOf('{',start);let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error(name+' incomplet');
}
function renderWith(station,editable,users){
  const tbody={innerHTML:''};
  const chef={l:'chef.corps',nom:'Chef',prenom:'Corps',grade:'Colonel',matricule:'123',
    fonction:'Chef de corps',rightsCC:['Interventions','Formation'],fonctionsFormateur:['FMPA']};
  const context={
    CURRENT_CASERNE_ID:station,USERS:users||[],PERSONNEL_ONLINE_GATE:false,
    GLOBAL_ROLE:editable?'superadmin':'chef_corps',GRADES:[],FONCTIONS:[],CU:{l:'test'},
    document:{getElementById:id=>id==='admin-tbody'?tbody:null},
    getChefCorpsAccount:()=>chef,isSuperAdmin:()=>editable,
    sortByName:list=>list,getCaserneAdmins:()=>[],
    escHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  };
  vm.createContext(context);
  vm.runInContext(sourceOf(moduleSource,'renderChefCorpsPersonnelRow'),context);
  vm.runInContext(sourceOf(moduleSource,'rAdm'),context);
  context.rAdm();
  return tbody.innerHTML;
}

test('le chef de corps global apparaît dans l’État-major du superadmin sans fiche locale',()=>{
  const html=renderWith('EMAJ',true,[]);
  assert.match(html,/Chef de corps · compte global/);
  assert.match(html,/chef\.corps/);
  assert.match(html,/ccEditMesInfos\(\)/);
  assert.equal((html.match(/<td\b/g)||[]).length,17);
  assert.equal((html.match(/<input type="checkbox"/g)||[]).length,7);
});

test('la ligne globale ne se duplique pas et reste non modifiable hors superadmin actif',()=>{
  const duplicate={l:'chef.corps',nom:'Chef',prenom:'Corps',rights:[]};
  const html=renderWith('EMAJ',false,[duplicate]);
  assert.equal((html.match(/chef\.corps/g)||[]).length,1);
  assert.doesNotMatch(html,/ccEditMesInfos\(\)/);
  assert.equal(renderWith('CIS05',true,[]),'');
});

test('le module et le bundle gardent la même ligne chef de corps',()=>{
  assert.equal(sourceOf(moduleSource,'renderChefCorpsPersonnelRow'),sourceOf(bundleSource,'renderChefCorpsPersonnelRow'));
  assert.ok(sourceOf(moduleSource,'rAdm').includes("CURRENT_CASERNE_ID==='EMAJ'?getChefCorpsAccount():null"));
  assert.ok(sourceOf(bundleSource,'rAdm').includes('renderChefCorpsPersonnelRow(cc,RIGHTS_SHORT,isSuperAdmin())'));
});
