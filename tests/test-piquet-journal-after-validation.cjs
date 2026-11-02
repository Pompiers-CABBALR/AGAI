const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'modules/12-astreintes-js.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'app.js'),'utf8');
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
function harness(validated){
  const piquets={week:[
    {engin:'VTU-01',jour:'Lundi',debut:'08:00',fin:'12:00',chefAgres:'ca',conducteur:'cond',membres:[{login:'ca',role:'Chef d’agrès'}]},
    {engin:'VTU-01',jour:'Mardi',debut:'12:00',fin:'18:00',chefAgres:'ca',conducteur:'cond',membres:[]}
  ],_log:{week:[{action:'ajout',piquet:'ancien brouillon'}]}};
  const calls={saved:0,rendered:0};
  const context={PIQUETS:piquets,PIQUETS_VALIDATED:{week:validated},
    USERS:[{l:'ca',nom:'Chef',prenom:'Test'}],CU:{nom:'Responsable',prenom:'Test'},
    CD:()=>({piquets}),piquetDepartureLabel:value=>value,
    astrPiquetWeek:0,getMondayOfWeek:()=>new Date(2026,10,2),weekKey:()=> 'week',weekLabel:()=> 'semaine',
    confirmModal:(_message,callback)=>callback(),saveData:()=>{calls.saved++;},
    rAstrPiquets:()=>{calls.rendered++;},showToast:()=>{}
  };
  vm.createContext(context);
  for(const name of ['piquetVisibleChangeLog','logPiquetChange','clearPiquetsSemaine'])
    vm.runInContext(sourceOf(moduleSource,name),context);
  return {context,calls};
}

test('le brouillon n’ajoute aucune ligne ; la validation ouvre le journal sans reprendre les anciens brouillons',()=>{
  const {context}=harness(false);
  const before=JSON.stringify(context.PIQUETS._log);
  assert.equal(context.logPiquetChange('week','modification',context.PIQUETS.week[0]),false);
  assert.equal(JSON.stringify(context.PIQUETS._log),before);
  context.PIQUETS_VALIDATED.week=true;
  assert.equal(context.piquetVisibleChangeLog('week').length,0);
  assert.equal(context.logPiquetChange('week','modification',context.PIQUETS.week[0]),true);
  const visible=context.piquetVisibleChangeLog('week');
  assert.equal(visible.length,1);
  assert.equal(visible[0].apresValidation,true);
  assert.equal(visible[0].action,'modification');
  assert.equal(context.PIQUETS._log.week.length,2,'ancien journal conservé sans être présenté comme post-validation');
});

test('effacer une semaine validée trace chaque suppression, mais pas une semaine en préparation',()=>{
  for(const validated of [false,true]){
    const {context,calls}=harness(validated);
    context.clearPiquetsSemaine();
    assert.equal(context.PIQUETS.week.length,0);
    assert.equal(context.piquetVisibleChangeLog('week').length,validated?2:0);
    assert.equal(calls.saved,1);
    assert.equal(calls.rendered,1);
  }
});

test('les chemins de saisie et le bundle utilisent le même garde-fou',()=>{
  for(const name of ['piquetVisibleChangeLog','logPiquetChange','clearPiquetsSemaine'])
    assert.equal(sourceOf(moduleSource,name),sourceOf(bundle,name),name);
  assert.match(moduleSource,/if\(piquetsValidated&&\(isAdmin\|\|isResp\)\)/);
  assert.match(moduleSource,/if\(JSON\.stringify\(p\)!==original\)logPiquetChange\(wk,'modification',p,'Déplacé depuis /);
  assert.match(moduleSource,/if\(JSON\.stringify\(p\)!==original\)logPiquetChange\(wk,'modification',p\);/);
  const add=fs.readFileSync(path.join(root,'modules/19-onedrive-sync-js.js'),'utf8');
  assert.match(add,/PIQUETS\[wk\]\.push\(newP\);\s+logPiquetChange\(wk,'ajout',newP\);/);
});
