const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

for(const filename of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
  const start=source.indexOf('function astrProjectReplacementPiquets(');
  const end=source.indexOf('function envoyerDispoRequest(',start);
  assert.ok(start>=0&&end>start,filename);
  const first={engin:'VTU-01',jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'carre',conducteur:'marien',note:'',membres:[
    {role:"Chef d'agrès",login:'carre',hDebut:'20:00',hFin:'00:00'},
    {role:'Conducteur',login:'marien',hDebut:'20:00',hFin:'00:00'}
  ]};
  const second={engin:'VTU-02',jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'nicolas',conducteur:'valery',note:'',membres:[
    {role:"Chef d'agrès",login:'nicolas',hDebut:'20:00',hFin:'00:00'},
    {role:'Conducteur',login:'valery',hDebut:'20:00',hFin:'00:00'}
  ]};
  const context={PIQUETS:{20261116:[first,second]},JOURS_FULL:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
    dispoGranularityFor:()=>60,astrScheduleForWeek:()=>({weekStartHour:7}),
    timeToMin:value=>{const [h,m]=value.split(':').map(Number);return h*60+m;},
    piquetToAbsRangeIdx:(day,start,end)=>{
      const mins=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
      return [day*1440+mins(start),day*1440+mins(end)+(mins(end)<=mins(start)?1440:0)];
    },
    pad:value=>String(value).padStart(2,'0')
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  test(filename+' : la relève 21 h–22 h conserve le CA avant et après',()=>{
    const request={login:'carre',replacementLogin:'sebastien',slots:[{key:'0_14',newVal:'false'}]};
    const result=context.astrProjectReplacementPiquets('20261116',request);
    assert.equal(result.changed,1);
    assert.deepEqual(Array.from(result.piquets[0].membres.slice(0,3),m=>[m.login,m.hDebut,m.hFin]),[
      ['carre','20:00','21:00'],['sebastien','21:00','22:00'],['carre','22:00','00:00']]);
    assert.equal(result.piquets[0].membres[3].login,'marien');
    assert.equal(result.piquets[1].chefAgres,'nicolas');
    assert.equal(first.membres.length,2);
  });
  test(filename+' : une relève complète change aussi le raccourci du CA',()=>{
    const request={login:'carre',replacementLogin:'sebastien',slots:[13,14,15,16]
      .map(index=>({key:'0_'+index,newVal:'false'}))};
    const result=context.astrProjectReplacementPiquets('20261116',request);
    assert.equal(result.changed,1);
    assert.equal(result.piquets[0].chefAgres,'sebastien');
    assert.deepEqual(Array.from(result.piquets[0].membres.slice(0,1),m=>[m.login,m.hDebut,m.hFin]),
      [['sebastien','20:00','00:00']]);
  });
}
