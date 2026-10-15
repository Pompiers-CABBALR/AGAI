const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const activities=read('modules/19-onedrive-sync-js.js');
const auth=read('modules/04-auth-js-partie-2-2-login-session-droits.js');
const navigation=read('modules/06-ui-js-accueil-js.js');
const preamble=read('modules/00-preambule.js');

function functionSource(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const body=source.indexOf('{',start);
  let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error('Unclosed '+name);
}

let blurred=false,viewportSynced=false;
const focus={tagName:'INPUT',blur(){blurred=true;}};
const keyboard={document:{activeElement:focus},requestAnimationFrame:callback=>callback(),syncViewportMetrics:()=>{viewportSynced=true;}};
vm.createContext(keyboard);
vm.runInContext(functionSource(preamble,'dismissAppKeyboard'),keyboard);
keyboard.dismissAppKeyboard();
assert.equal(blurred,true);
assert.equal(viewportSynced,true);
assert.match(auth,/dismissAppKeyboard\(\);\s*document\.getElementById\('lp'\)\.value='';/);
assert.match(navigation,/function showT\([\s\S]*?dismissAppKeyboard\(\);/);
assert.match(activities,/if\(!willOpen\)dismissAppKeyboard\(\)/);

const activity={id:'test',impressions:[]};
let dataRead=false,saved=false,opened=false,toast='';
const report={
  canOpenInterventionPdfOnThisDevice:()=>false,
  actGetData:()=>{dataRead=true;return [activity];},
  showToast:message=>{toast=message;},
  actCanSeeDetail:()=>true,
  genRapportActiviteHTML:()=>'<html></html>',
  CU:{l:'test',prenom:'Test',nom:'Agent'},
  saveData:()=>{saved=true;},rActiviteList:()=>{},openIframeModal:()=>{opened=true;}
};
vm.createContext(report);
vm.runInContext(functionSource(activities,'actImprimerRapport'),report);
report.actImprimerRapport('test');
assert.match(toast,/uniquement sur ordinateur/);
assert.equal(dataRead,false);
assert.equal(saved,false);
assert.equal(opened,false);
assert.equal(activity.impressions.length,0);
report.canOpenInterventionPdfOnThisDevice=()=>true;
report.actImprimerRapport('test');
assert.equal(saved,true);
assert.equal(opened,true);
assert.equal(activity.impressions.length,1);
assert.match(activities,/canSee&&canOpenInterventionPdfOnThisDevice\(\)/);
assert.match(activities,/\$\{canOpenInterventionPdfOnThisDevice\(\)\?`<button/);
console.log('Mobile activity report restriction and keyboard dismissal: OK');
