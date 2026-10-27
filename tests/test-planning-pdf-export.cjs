const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

for(const file of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const start=source.indexOf('function canExportAstrPlanningPDF(){');
  const end=source.indexOf('function astrWeekNav(',start);
  const exportStart=source.indexOf('function exportAstrPlanningPDF(){');
  const exportEnd=source.indexOf('function oAstrCellDetailSansEq(',exportStart);
  test(`${file} : export limité aux responsables et administrateurs`,()=>{
    assert.ok(start>=0&&end>start&&exportStart>=0&&exportEnd>exportStart);
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

  test(`${file} : export de sept journées, A4 paysage et marge 0,5 mm`,()=>{
    const body=source.slice(exportStart,exportEnd);
    assert.match(body,/days\.length!==7/);
    assert.match(body,/@page\{size:A4 landscape;margin:0\.5mm;\}/);
    assert.match(body,/break-after:page/);
    assert.match(body,/print-color-adjust:exact/);
    assert.match(body,/printDoc\.importNode\(day,true\)/);
    assert.doesNotMatch(body,/saveData\(|_rcPush\(|fetch\(/);
    const toasts=[];
    const context={
      canExportAstrPlanningPDF:()=>true,
      document:{getElementById:()=>({querySelectorAll:()=>Array(6).fill({})})},
      showToast:(message,type)=>toasts.push({message,type}),
      window:{open:()=>assert.fail('aucune page ne doit être ouverte sans sept journées')}
    };
    vm.createContext(context);
    vm.runInContext(body,context);
    context.exportAstrPlanningPDF();
    assert.equal(toasts.length,1);
    assert.equal(toasts[0].type,'error');
  });
}

test('le bouton est masqué avant contrôle des droits',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/<button id="astr-planning-export"[^>]*style="display:none;"[^>]*onclick="exportAstrPlanningPDF\(\)"/);
});
