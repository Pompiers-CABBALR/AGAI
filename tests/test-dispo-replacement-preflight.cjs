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
  const chief={role:"Chef d'agrès",login:'ca',hDebut:'20:00',hFin:'00:00'};
  const driver={role:'Conducteur',login:'driver',hDebut:'20:00',hFin:'00:00'};
  const piquet={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'ca',conducteur:'driver',
    membres:[chief,driver]};
  const times=value=>{const [hours,minutes]=value.split(':').map(Number);return hours*60+minutes;};
  const context={
    USERS:[{l:'ca',fonction:'Chef d’agrès'},{l:'candidate',fonction:'Chef d’agrès'},
      {l:'driver',fonction:'Équipier'}],
    DISPOS:{20261116:{ca:{'0_14':true}}},PIQUETS:{20261116:[piquet]},
    JOURS_FULL:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
    dispoGranularityFor:()=>60,astrScheduleForWeek:()=>({weekStartHour:7}),
    personnelDispoKeyAllowed:()=>true,timeToMin:times,
    piquetToAbsRangeIdx:(day,begin,end)=>[day*1440+times(begin),day*1440+times(end)
      +(times(end)<=times(begin)?1440:0)],
    pad:value=>String(value).padStart(2,'0'),isChefAgresByGrade:()=>false
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const request=()=>({login:'ca',replacementLogin:'candidate',slots:[{key:'0_14',newVal:'false'}]});
  test(filename+' : relève partielle valide, même si le remplaçant n’avait pas déclaré sa disponibilité',()=>{
    assert.equal(context.astrReplacementDraftError('20261116',request()),'');
  });
  test(filename+' : refuse formation ou absence du remplaçant',()=>{
    context.personnelDispoKeyAllowed=()=>false;
    assert.match(context.astrReplacementDraftError('20261116',request()),/absent ou en formation/);
    context.personnelDispoKeyAllowed=()=>true;
  });
  test(filename+' : refuse une relève si la disponibilité du demandeur a changé',()=>{
    context.DISPOS['20261116'].ca['0_14']=false;
    assert.match(context.astrReplacementDraftError('20261116',request()),/plus disponibles/);
    context.DISPOS['20261116'].ca['0_14']=true;
  });
  test(filename+' : refuse le chevauchement entre 1er et 2e départ',()=>{
    context.PIQUETS['20261116'].push({jour:'Lundi',debut:'21:00',fin:'23:00',
      conducteur:'candidate',membres:[{role:'Conducteur',login:'candidate',hDebut:'21:00',hFin:'23:00'}]});
    assert.match(context.astrReplacementDraftError('20261116',request()),/autre départ/);
    context.PIQUETS['20261116'].pop();
  });
  test(filename+' : refuse deux fois la même heure dans une demande',()=>{
    const duplicate=request();duplicate.slots.push(duplicate.slots[0]);
    assert.match(context.astrReplacementDraftError('20261116',duplicate),/valides et distinctes/);
  });
  test(filename+' : convertit exactement 1 h en deux cases de 30 minutes pour le remplaçant',()=>{
    context.dispoGranularityFor=login=>login==='candidate'?30:60;
    assert.deepEqual(Array.from(context.astrReplacementCandidateKeys(request())),['0_28','0_29']);
    context.dispoGranularityFor=()=>60;
  });
  test(filename+' : refuse 30 minutes isolées dans la grille horaire du remplaçant',()=>{
    context.dispoGranularityFor=login=>login==='ca'?30:60;
    assert.equal(context.astrReplacementCandidateKeys({
      login:'ca',replacementLogin:'candidate',slots:[{key:'0_28',newVal:'false'}]
    }),null);
    context.dispoGranularityFor=()=>60;
  });
}
