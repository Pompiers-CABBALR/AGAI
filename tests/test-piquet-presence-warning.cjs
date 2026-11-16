const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

for(const filename of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
  const start=source.indexOf('function piquetPresenceWarning(p){');
  const end=source.indexOf('function rAstrPiquets(){',start);
  assert.ok(start>=0&&end>start,filename);
  const context={timeToMin:value=>{const [h,m]=value.split(':').map(Number);return h*60+m;},
    pad:value=>String(value).padStart(2,'0')};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  test(filename+' : un CA ajouté de 22 h à minuit réduit le manque à 21 h–22 h',()=>{
    const p={debut:'20:00',fin:'00:00',note:'Présence partielle : 21:00–00:00 sans chef',membres:[
      {role:'Chef d’agrès',login:'carre',hDebut:'20:00',hFin:'21:00'},
      {role:'Chef d’agrès',login:'dacheville',hDebut:'22:00',hFin:'00:00'},
      {role:'Conducteur',login:'marien',hDebut:'20:00',hFin:'00:00'}
    ]};
    assert.equal(context.piquetPresenceWarning(p),'Présence partielle : 21:00–22:00 sans chef');
  });
  test(filename+' : la relève continue d’un chef supprime l’ancien avertissement',()=>{
    const p={debut:'20:00',fin:'00:00',membres:[
      {role:'Chef d’agrès',login:'carre',hDebut:'20:00',hFin:'21:00'},
      {role:'Chef d’agrès',login:'dacheville',hDebut:'21:00',hFin:'00:00'},
      {role:'Conducteur',login:'marien',hDebut:'20:00',hFin:'00:00'}
    ]};
    assert.equal(context.piquetPresenceWarning(p),'');
  });
  test(filename+' : une absence de chef après minuit garde la bonne heure',()=>{
    const p={debut:'00:00',fin:'02:00',membres:[
      {role:'Chef d’agrès',login:'nicolas',hDebut:'01:00',hFin:'02:00'},
      {role:'Conducteur',login:'mathis',hDebut:'00:00',hFin:'02:00'}
    ]};
    assert.equal(context.piquetPresenceWarning(p),'Présence partielle : 00:00–01:00 sans chef');
  });
}
