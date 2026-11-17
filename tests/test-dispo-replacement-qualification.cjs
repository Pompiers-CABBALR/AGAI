const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

for(const filename of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
  const start=source.indexOf('function astrRequestAffectedPiquets(');
  const end=source.indexOf('function envoyerDispoRequest(',start);
  assert.ok(start>=0&&end>start,filename);
  const piquet={jour:'Lundi',debut:'20:00',fin:'00:00',membres:[
    {role:"Chef d'agrès",login:'ca',hDebut:'20:00',hFin:'00:00'},
    {role:'Conducteur',login:'conducteur',hDebut:'20:00',hFin:'00:00'}
  ]};
  const context={PIQUETS:{20261116:[piquet]},USERS:[{l:'ca',fonction:'Chef d’agrès 1 équipe'},
    {l:'conducteur',fonction:'Chef d’agrès 1 équipe'}, {l:'equipier',fonction:'Équipier'},
    {l:'stagiaire',fonction:'Stagiaire'}, {l:'sergent',fonction:'Équipier',grade:'Sergent'}],
    JOURS_FULL:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
    astrScheduleForWeek:()=>({weekStartHour:7}),
    timeToMin:value=>{const [h,m]=value.split(':').map(Number);return h*60+m;},
    piquetToAbsRangeIdx:(day,start,end)=>{
      const mins=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
      const a=day*1440+mins(start),b=day*1440+mins(end)+(mins(end)<=mins(start)?1440:0);
      return [a,b];
    },
    isChefAgresByGrade:user=>user.grade==='Sergent'
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const slots=[{key:'0_13',newVal:'false'}];
  test(filename+' : remplacer un CA exige un autre CA',()=>{
    assert.equal(context.astrReplacementCandidateAllowed(context.USERS[3],'20261116','ca',slots,60),false);
    assert.equal(context.astrReplacementCandidateAllowed(context.USERS[4],'20261116','ca',slots,60),true);
  });
  test(filename+' : un conducteur VTU peut être remplacé par un équipier',()=>{
    assert.equal(context.astrReplacementCandidateAllowed(context.USERS[2],'20261116','conducteur',slots,60),true);
    assert.equal(context.astrReplacementCandidateAllowed(context.USERS[3],'20261116','conducteur',slots,60),false);
  });
}
