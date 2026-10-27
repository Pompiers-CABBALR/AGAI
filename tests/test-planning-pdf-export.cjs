const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

for(const file of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const start=source.indexOf('function canExportAstrPlanningPDF(){');
  const end=source.indexOf('function astrWeekNav(',start);
  test(`${file} : export limité aux responsables et administrateurs`,()=>{
    assert.ok(start>=0&&end>start);
    const context={CU:{l:'agent'},isRespEquipe:()=>false,isAdminModeActive:()=>false};
    vm.createContext(context);
    vm.runInContext(source.slice(start,end),context);
    assert.equal(context.canExportAstrPlanningPDF(),false);
    context.isRespEquipe=()=>true;
    assert.equal(context.canExportAstrPlanningPDF(),true);
    context.isRespEquipe=()=>false;
    context.isAdminModeActive=()=>true;
    assert.equal(context.canExportAstrPlanningPDF(),true);
    context.CU=null;
    assert.equal(context.canExportAstrPlanningPDF(),false);
  });

}

for(const file of ['modules/27-planning-pdf-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const exportStart=source.indexOf('async function exportAstrPlanningPDF(){');
  const exportEnd=file==='app.js'?source.indexOf('\nfunction showAstrTelParams(',exportStart):source.length;
  test(`${file} : téléchargement direct de sept pages A4 paysage`,()=>{
    assert.ok(exportStart>=0&&exportEnd>exportStart);
    const body=source.slice(exportStart,exportEnd);
    assert.match(body,/days\.length!==7/);
    assert.match(body,/pdf\.addPage\(\[841\.89,595\.28\]\)/);
    assert.match(body,/const margin=0\.5\*72\/25\.4/);
    assert.match(body,/pdf\.getPageCount\(\)!==7/);
    assert.match(body,/const bytes=await pdf\.save\(\)/);
    assert.match(body,/URL\.createObjectURL\(blob\)/);
    assert.match(body,/link\.download=/);
    assert.match(body,/link\.click\(\)/);
    assert.doesNotMatch(body,/window\.print\(|window\.open\(|saveData\(|_rcPush\(|fetch\(/);
    const toasts=[];
    const context={
      canExportAstrPlanningPDF:()=>true,astrPlanningPdfBusy:false,
      document:{getElementById:()=>({querySelectorAll:()=>Array(6).fill({})})},
      showToast:(message,type)=>toasts.push({message,type})
    };
    vm.createContext(context);
    vm.runInContext(body,context);
    return context.exportAstrPlanningPDF().then(()=>{
      assert.equal(toasts.length,1);
      assert.equal(toasts[0].type,'error');
    });
  });
}

test('le bouton est masqué avant contrôle des droits',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/<button id="astr-planning-export"[^>]*style="display:none;"[^>]*onclick="exportAstrPlanningPDF\(\)"/);
  assert.match(html,/modules\/27-planning-pdf-js\.js/);
});
