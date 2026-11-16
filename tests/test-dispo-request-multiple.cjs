const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
for(const filename of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(root,filename),'utf8');
  const start=source.indexOf('function envoyerDispoRequest(wk,login){');
  const end=source.indexOf('function repondreDispoRequest(wk,reqId,reponse){',start);
  assert.ok(start>=0&&end>start,filename);
  function setup(){
    let selected='0_0';
    const requests={};
    const teams=[{id:'eq-personne',resp:'chef-personne',membres:['agent']},
      {id:'eq-forte',resp:'chef-forte',membres:['fort']}];
    const context={
      document:{getElementById:id=>({value:id==='dispo-req-motif'?'motif':id==='val_'+selected?'true':''}),
        querySelectorAll:()=>[{value:selected}]},
      DISPO_REQUESTS:requests,USERS:[{l:'agent'},{l:'fort'}],PIQUETS:{},
      CURRENT_CASERNE_ID:'CIS05',PLANNING_ROTATIONS:{20261116:['eq-forte','eq-personne']},
      getEquipeOfUser:login=>teams.find(team=>team.membres.includes(login)),
      getEquipeById:id=>teams.find(team=>team.id===id),
      ASTR_REPLACEMENT_ENABLED:false,dispoGranularityFor:()=>60,
      astrScheduleForWeek:()=>({weekStartHour:7}),personnelDispoKeyAllowed:()=>true,
      JOURS_FULL:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
      pad:value=>String(value).padStart(2,'0'),N:()=>new Date('2026-11-16T08:00:00'),
      getHHMM:()=> '08:00',getDS:()=> '16/11/2026',saveData:()=>{},cM:()=>{},rAstrDispo:()=>{},
      showToast:message=>{context.lastToast=message;},
      isAdminModeActive:()=>false,isRespEquipe:()=>true,CU:{l:'chef-forte'}
    };
    vm.createContext(context);
    vm.runInContext(source.slice(start,end),context);
    return {context,requests,select:key=>{selected=key;}};
  }
  test(filename+' : deux demandes distinctes restent ouvertes et arrivent aux deux responsables',()=>{
    const {context,requests,select}=setup();
    context.envoyerDispoRequest('20261116','agent');
    select('0_1');
    context.envoyerDispoRequest('20261116','agent');
    assert.equal(requests['20261116'].length,2);
    assert.ok(requests['20261116'].every(request=>request.statut==='en-attente'));
    assert.deepEqual(Array.from(requests['20261116'][0].notifiedLogins),['chef-personne','chef-forte']);
    assert.equal(context.dispoRequestVisibleTo(requests['20261116'][1],'20261116','chef-forte'),true);
    assert.equal(context.dispoRequestVisibleTo(requests['20261116'][1],'20261116','chef-personne'),true);
    assert.equal(context.dispoRequestVisibleTo(requests['20261116'][1],'20261116','autre-chef'),false);
  });
  test(filename+' : un même créneau ne peut pas être demandé deux fois en attente',()=>{
    const {context,requests}=setup();
    context.envoyerDispoRequest('20261116','agent');
    context.envoyerDispoRequest('20261116','agent');
    assert.equal(requests['20261116'].length,1);
    assert.match(context.lastToast,/déjà l’objet d’une demande/);
  });
}
