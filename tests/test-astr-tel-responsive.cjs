const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');

function renderGrid(source,month){
  const start=source.indexOf('function astrTelRenderGrid(){');
  const end=source.indexOf('function astrTelRenderRecap(){',start);
  assert.ok(start>=0&&end>start);
  const properties={};
  const grid={style:{setProperty(name,value){properties[name]=value;}},innerHTML:''};
  const context={
    document:{getElementById(id){return id==='astrtel-grid'?grid:null;}},
    astrTelAnnee:2026,astrTelMois:month,USERS:[],
    astrTelNbJours(y,m){return new Date(y,m+1,0).getDate();},
    getJoursFeries(){return new Set();},
    isChefOuAdjoint(){return false;},isAdminModeActive(){return false;},isSuperAdmin(){return false;},
    pad(n){return String(n).padStart(2,'0');},
    ASTRTEL_JOURS_SEMAINE:['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  };
  vm.runInNewContext(source.slice(start,end)+'\n astrTelRenderGrid();',context);
  return {grid,properties};
}

test('la grille d’astreinte suit la largeur disponible sans nouveau rendu',()=>{
  assert.match(css,/#astrtel-grid\s*\{[^}]*width:100%;[^}]*min-width:var\(--astrtel-desktop-min-width\)/s);
  assert.match(css,/grid-template-columns:var\(--astrtel-agent-w\) var\(--astrtel-total-w\) repeat\(var\(--astrtel-days\),minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:1024px\)\s*\{\s*#astrtel-grid\s*\{[^}]*min-width:var\(--astrtel-touch-min-width\)/s);
  assert.match(css,/#astrtel-grid-scroll\s*\{[^}]*overflow:auto!important/s);
});

for(const filename of ['modules/21-astreinte-tel-js.js','app.js']){
  test(`${filename} : largeurs minimales adaptées à la durée du mois`,()=>{
    const source=fs.readFileSync(path.join(root,filename),'utf8');
    for(const [month,days] of [[1,28],[9,31]]){
      const {grid,properties}=renderGrid(source,month);
      assert.equal(properties['--astrtel-days'],days);
      assert.equal(properties['--astrtel-desktop-min-width'],`${160+50+days*36+days+1}px`);
      assert.equal(properties['--astrtel-touch-min-width'],`${118+54+days*48+days+1}px`);
      assert.match(grid.innerHTML,/class="astrtel-header-row"/);
      assert.doesNotMatch(grid.innerHTML,/grid-template-columns:/);
    }
  });
}
