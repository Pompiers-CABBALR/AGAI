const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

for(const file of ['modules/19-onedrive-sync-js.js','app.js']){
  test(`${file} : la saisie des créneaux reprend l'ordre et les repères du planning`,()=>{
    const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const gridStart=source.indexOf('function pqBuildMiniGrille(wk){');
    const gridEnd=source.indexOf('let _pqCurrentWk=',gridStart);
    const optionsStart=source.indexOf('function piquetAgentOpts(');
    const optionsEnd=source.indexOf('// ── NOUVEAU SYSTÈME PIQUET',optionsStart);
    assert.ok(gridStart>=0&&gridEnd>gridStart&&optionsStart>=0&&optionsEnd>optionsStart);

    const equipes=[
      {id:'A',nom:'Alpha',color:'#3498DB'},
      {id:'B',nom:'Bravo',color:'#A1B2C3'},
      {id:'C',nom:'Charlie',color:'#1ABC9C'}
    ];
    const users=[
      {l:'alpha',nom:'Alpha',prenom:'Anne',grade:'Eq'},
      {l:'bravo',nom:'Bravo',prenom:'Ben',grade:'Eq'},
      {l:'charlie',nom:'Charlie',prenom:'Camille',grade:'Eq'},
      {l:'sans',nom:'Zulu',prenom:'Zoé',grade:'Eq'},
      {l:'absent',nom:'Absent',prenom:'Alain',grade:'Eq'}
    ];
    const membership={alpha:'A',bravo:'B',charlie:'C'};
    const groups=[
      {eq:equipes[2],tone:'forte'},
      {eq:equipes[0],tone:'faible'},
      {eq:equipes[1],tone:'autre'}
    ];
    const dispos={};
    for(const u of users.slice(0,4)){
      dispos[u.l]={};
      for(let slot=0;slot<24;slot++)dispos[u.l]['0_'+slot]=true;
    }
    const before=JSON.stringify(dispos);
    const controls={'pq-jour':'Lundi','pq-debut':'08:00','pq-fin':'20:00'};
    const context={
      USERS:users,DISPOS:{week:dispos},ASTR_CONFIG:{granularity:60,weekStartHour:0},
      JOURS_FULL:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
      document:{getElementById:id=>({value:controls[id]})},
      planningEquipeGroups:()=>groups,
      getEquipeOfUser:login=>equipes.find(eq=>eq.id===membership[login]),
      sortByGradeThenName:list=>[...list].sort((a,b)=>a.nom.localeCompare(b.nom)),
      personnelDispoSlotAllowed:()=>true,
      timeToMin:value=>{const [h,m]=value.split(':').map(Number);return h*60+m;},
      pad:value=>String(value).padStart(2,'0'),
      escHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
      fullName:user=>user.nom+' '+user.prenom,
      weekKey:()=> 'week',getMondayOfWeek:()=>new Date(),astrPiquetWeek:0,
      getSollicitation:()=>0,gradeAbbr:()=> 'Eq'
    };
    vm.createContext(context);
    vm.runInContext(source.slice(gridStart,gridEnd),context);
    vm.runInContext(source.slice(optionsStart,optionsEnd),context);
    const html=context.pqBuildMiniGrille('week');
    const titles=['Astreinte forte · Charlie','Astreinte faible · Alpha','Autre équipe · Bravo','Sans équipe'];
    let last=-1;
    for(const title of titles){
      const position=html.indexOf(title);
      assert.ok(position>last,`${title} doit suivre le groupe précédent`);
      last=position;
    }
    assert.match(html,/background:#FCE7F3/);
    assert.match(html,/background:#FEF3C7/);
    assert.match(html,/border-left:3px solid #A1B2C3/);
    assert.match(html,/background:#22C55E/);
    assert.match(html,/background:#BBF0CD/);
    assert.doesNotMatch(html,/Absent Alain/);
    assert.equal(JSON.stringify(dispos),before);

    const options=context.piquetAgentOpts(users,'',true);
    last=-1;
    for(const title of titles){
      const position=options.indexOf(title);
      assert.ok(position>last,`${title} doit aussi suivre le groupe précédent dans la liste`);
      last=position;
    }
  });
}
