const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

for(const filename of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
  const start=source.indexOf('function getPiquetActif(wk,login){');
  const end=source.indexOf('// La tournée garde',start);
  assert.ok(start>=0&&end>start,filename);
  const p={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'carre',conducteur:'mathis',membres:[
    {role:"Chef d'agrès",login:'carre',hDebut:'20:00',hFin:'21:00'},
    {role:"Chef d'agrès",login:'nicolas',hDebut:'21:00',hFin:'00:00'},
    {role:'Conducteur',login:'mathis',hDebut:'20:00',hFin:'22:00'},
    {role:'Conducteur',login:'enzo',hDebut:'22:00',hFin:'00:00'}
  ]};
  let current=new Date('2026-11-16T20:30:00');
  const mins=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
  const context={PIQUETS:{20261116:[p]},N:()=>current,astrScheduleForWeek:()=>({weekStartHour:7}),
    JOURS_FULL:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
    timeToMin:mins,piquetToAbsRangeIdx:(day,from,to)=>[day*1440+mins(from),day*1440+mins(to)+(mins(to)<=mins(from)?1440:0)]};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  test(filename+' : le CA et le conducteur suivent leurs heures individuelles',()=>{
    assert.equal(context.getPiquetActif('20261116','carre'),p);
    assert.equal(context.getPiquetActif('20261116','nicolas'),null);
    assert.equal(context.getPiquetEquipage(p,'20261116').conducteur,'mathis');
    current=new Date('2026-11-16T22:30:00');
    assert.equal(context.getPiquetActif('20261116','carre'),null);
    assert.equal(context.getPiquetActif('20261116','nicolas'),p);
    assert.equal(context.getPiquetEquipage(p,'20261116').conducteur,'enzo');
  });
}
