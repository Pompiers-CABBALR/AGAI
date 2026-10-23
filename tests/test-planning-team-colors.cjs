const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

for(const file of ['modules/12-astreintes-js.js','app.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  test(`${file} : forte, faible, autres puis sans équipe`,()=>{
    const start=source.indexOf('function equipeBelongsToCurrentCaserne(');
    const end=source.indexOf('// ── Planning rotation',start);
    assert.ok(start>=0&&end>start);
    const context={
      CURRENT_CASERNE_ID:'CIS05',
      PLANNING_ROTATIONS:{week:['C','A']},
      EQUIPES:[
        {id:'B',nom:'Bravo',membres:[]},
        {id:'A',nom:'Alpha',membres:[]},
        {id:'D',nom:'Delta',membres:[]},
        {id:'C',nom:'Charlie',membres:[]},
        {id:'X',nom:'Étrangère',caserneId:'CIS06',membres:[]}
      ]
    };
    vm.createContext(context);
    vm.runInContext(source.slice(start,end),context);
    const order=context.planningEquipeGroups('week').map(group=>`${group.tone}:${group.eq.id}`);
    assert.deepEqual(Array.from(order),['forte:C','faible:A','autre:B','autre:D']);
    context.PLANNING_ROTATIONS.week=['C','C'];
    assert.deepEqual(Array.from(context.planningEquipeGroups('week').map(group=>group.eq.id)),['C','A','B','D']);
    const planning=source.slice(source.indexOf('function rAstrPlanning('),source.indexOf('function oAstrCellDetailSansEq('));
    assert.ok(planning.indexOf('equipeGroups.forEach(function(group){')
      <planning.indexOf("if(showAll||astrPlanningFilter.has('sans-equipe')){"));
  });

  test(`${file} : repères de priorité distincts des indisponibilités et des couleurs d'équipe`,()=>{
    const planning=source.slice(source.indexOf('function rAstrPlanning('),source.indexOf('function oAstrCellDetailSansEq('));
    assert.match(planning,/forte'\?\{bg:'#FCE7F3',fg:'#9D174D',line:'#DB2777'\}/);
    assert.match(planning,/faible'\?\{bg:'#FEF3C7',fg:'#92400E',line:'#D97706'\}/);
    assert.match(planning,/background:#EF4444/);
    assert.match(planning,/background:\$\{group\.eq\.color\}/);
  });

  test(`${file} : modifier une couleur d'équipe l'enregistre sans toucher aux autres champs sur erreur`,()=>{
    const start=source.indexOf('function saveEditEquipe(id){');
    const end=source.indexOf('function addMembre(',start);
    assert.ok(start>=0&&end>start);
    const original={id:'A',nom:'Alpha',granularity:60,color:'#3498DB',resp:'agent',caserneId:'CIS05'};
    const values={'edit-eq-nom':'Alpha bis','edit-eq-gran':'30','edit-eq-color':'#8e44ad','edit-eq-resp':'agent'};
    let saves=0,closes=0,renders=0;
    const context={
      CURRENT_CASERNE_ID:'CIS05',USERS:[{l:'agent'}],
      getEquipeById:id=>id==='A'?original:null,
      document:{getElementById:id=>({value:values[id]})},
      showToast:()=>assert.fail('validation inattendue'),
      cM:()=>closes++,saveData:()=>saves++,rAstrEquipes:()=>renders++,applyNavRights:()=>{}
    };
    vm.createContext(context);
    vm.runInContext(source.slice(start,end),context);
    context.saveEditEquipe('A');
    assert.equal(original.color,'#8e44ad');
    assert.equal(original.nom,'Alpha bis');
    assert.equal(original.granularity,30);
    assert.equal(saves,1);
    assert.equal(closes,1);
    assert.equal(renders,1);
    context.showToast=()=>{};
    values['edit-eq-color']='red';
    values['edit-eq-nom']='Ne doit pas passer';
    context.saveEditEquipe('A');
    assert.equal(original.nom,'Alpha bis');
    assert.equal(original.color,'#8e44ad');
    assert.equal(saves,1);
    assert.match(source.slice(source.indexOf('function editEquipe(id){'),start),/type="color" id="edit-eq-color"/);
  });
}
