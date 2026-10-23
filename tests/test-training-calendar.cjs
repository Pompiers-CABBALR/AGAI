const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const bundle=process.env.AGAI_TEST_BUNDLE==='1';
function extract(source,name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const body=source.indexOf('{',start);let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error(name);
}
function harness(){
  const elements=new Map(),events=[],saved=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',style:{},innerHTML:'',textContent:''});return elements.get(id);};
  const c=vm.createContext({
    document:{getElementById:element,querySelectorAll:()=>[{value:'bob'}]},CU:{l:'admin'},
    pad:x=>String(x).padStart(2,'0'),escHtml:String,
    personnelUnavailableForPeriod:()=>null,findInterventionConflictForSchedule:()=>null,declaredFormateurUsers:()=>[{l:'bob'}],
    showToast:(...args)=>events.push(['toast',...args]),saveData:x=>events.push(['save',x]),
    adminExportDateIso:x=>x,adminExportRegisterRow:x=>x,adminExportDuration:x=>x,adminExportPeople:x=>x,
  });
  vm.runInContext('let _formationDayChoices={};',c);
  const sources={schedule:read(bundle?'app.js':'modules/09-pilp-js.js'),stats:read(bundle?'app.js':'modules/14-stats-js.js'),forms:read(bundle?'app.js':'modules/20-formations-js.js')};
  function load(source,name){vm.runInContext(extract(source,name),c);}
  load(read(bundle?'app.js':'modules/16-email-js.js'),'hhmmToMinutes');
  load(read(bundle?'app.js':'modules/12-astreintes-js.js'),'dureeMinutesHHMM');
  load(sources.stats,'getJoursFeries');
  for(const name of ['formationCalendarDays','formationTrainingDays','formationUnavailableWindow','personnelScheduleWindows','personnelFormationHoursError'])load(sources.schedule,name);
  for(const name of ['formSlotMins','formMinsToStr','formMinsToHStr','formResetTrainingDays','formSelectedTrainingDays','formChooseTrainingDay','formRenderTrainingDays','formCalcDuree','formMinsTotal','_saveFormEntry'])load(sources.forms,name);
  load(sources.stats,'adminExportFormationRegisterRow');
  const record=extra=>({ddebut:'2026-10-21',dfin:'2026-10-30',hmatind:'08:00',hmatinf:'12:00',hapremd:'13:00',hapremf:'16:00',participants:['bob'],...extra});
  function fill(pfx='stag',extra={}){
    const r=record(extra);c.formResetTrainingDays(pfx);
    for(const [key,val] of Object.entries({titre:'Formation',ddebut:r.ddebut,dfin:r.dfin,'hmatin-d':r.hmatind,'hmatin-f':r.hmatinf,'haprem-d':r.hapremd,'haprem-f':r.hapremf}))element('f'+pfx+'-'+key).value=val;
    c.formCalcDuree(pfx);return r;
  }
  function save(pfx='stag'){c._saveFormEntry('f'+pfx,'TEST',()=>saved,()=>{},()=>{},()=>{});}
  return {c,element,events,saved,record,fill,save,sources};
}
test('Brian du 21 au 30 octobre : huit jours ouvrés, 56 heures pour 7 heures par jour',()=>{
  const h=harness(),r=h.record();assert.equal(h.c.formationTrainingDays(r).length,8);assert.equal(h.c.formMinsTotal(r),56*60);
  assert.ok(!h.c.formationTrainingDays(r).includes('2026-10-24'));assert.ok(!h.c.formationTrainingDays(r).includes('2026-10-25'));
});
test('Thinaël du 7 au 16 octobre : huit jours ouvrés sur une seule formation',()=>{
  const h=harness(),r=h.record({ddebut:'2026-10-07',dfin:'2026-10-16'});
  assert.equal(h.c.formationTrainingDays(r).length,8);assert.equal(h.c.formMinsTotal(r),56*60);
});
for(const [start,end,count] of [['2026-11-09','2026-11-13',4],['2026-04-03','2026-04-07',2],['2026-05-11','2026-05-15',4],['2026-05-22','2026-05-26',2],['2026-12-24','2027-01-04',6]]){
  test('jours fériés fixes et mobiles exclus sur '+start+' → '+end,()=>{
    const h=harness();assert.equal(h.c.formationTrainingDays(h.record({ddebut:start,dfin:end})).length,count);
  });
}
test('un samedi ou un jour férié explicitement coché est comptabilisé et une journée décochée est exclue',()=>{
  const h=harness(),r=h.record();r.joursFormation=Array.from(h.c.formationTrainingDays(r)).concat('2026-10-24');
  assert.equal(h.c.formMinsTotal(r),63*60);
  const holiday=h.record({ddebut:'2026-11-11',dfin:'2026-11-11'});assert.equal(h.c.formMinsTotal(holiday),0);
  holiday.joursFormation=['2026-11-11'];assert.equal(h.c.formMinsTotal(holiday),7*60);
  r.joursFormation=r.joursFormation.filter(d=>d!=='2026-10-22');assert.equal(h.c.formMinsTotal(r),56*60);
});
test('les dates invalides, inversées ou une sélection vide ne produisent pas d’heures',()=>{
  const h=harness();for(const extra of [{ddebut:'2026-02-30'},{dfin:'2026-10-01'},{joursFormation:[]}])assert.equal(h.c.formMinsTotal(h.record(extra)),0);
});
test('la fenêtre d’indisponibilité est continue, du début réel à la fin réelle de la formation',()=>{
  const h=harness(),r=h.record(),windows=h.c.personnelScheduleWindows('Formation',r);
  assert.equal(windows.length,1);assert.equal(windows[0].start,new Date(2026,9,21,8).getTime());
  assert.equal(windows[0].end,new Date(2026,9,30,16).getTime());
  for(const instant of [new Date(2026,9,21,12,30),new Date(2026,9,22,2),new Date(2026,9,24,12),new Date(2026,9,25,12)])assert.ok(windows[0].start<=instant.getTime()&&instant.getTime()<windows[0].end);
});
test('les bornes retiennent les premiers et derniers jours cochés, sans prolonger une fin de semaine',()=>{
  const h=harness(),r=h.record({ddebut:'2026-10-24',dfin:'2026-11-01'}),w=h.c.formationUnavailableWindow(r);
  assert.equal(w.start,new Date(2026,9,26,8).getTime());assert.equal(w.end,new Date(2026,9,30,16).getTime());
});
for(const pfx of ['stag','form'])test(pfx+' : choix du samedi, total recalculé et jours persistés à la création',()=>{
  const h=harness();h.fill(pfx);assert.match(h.element('f'+pfx+'-htotal').value,/8j .*56:00/);
  assert.match(h.element('f'+pfx+'-days').innerHTML,/data-formation-day="2026-10-24" onchange/);
  h.c.formChooseTrainingDay(pfx,'2026-10-24',true);assert.match(h.element('f'+pfx+'-htotal').value,/9j .*63:00/);
  h.element('f'+pfx+'-htotal').value='total obsolète';h.save(pfx);
  assert.equal(h.saved.length,1);assert.equal(h.saved[0].htotal,'63:00');assert.ok(h.saved[0].joursFormation.includes('2026-10-24'));
  h.c.formResetTrainingDays(pfx);assert.equal(h.c.formSelectedTrainingDays(pfx,h.record()).length,8);
});
test('une formation sur un samedi seul exige la confirmation de cette journée exceptionnelle',()=>{
  const h=harness();h.fill('stag',{ddebut:'2026-10-24',dfin:'2026-10-24'});h.save();
  assert.equal(h.saved.length,0);assert.match(h.element('fstag-err').textContent,/Cochez au moins une journée/);
  h.c.formChooseTrainingDay('stag','2026-10-24',true);h.save();assert.equal(h.saved[0].htotal,'07:00');
});
test('les totaux d’export sont recalculés même si l’ancien total enregistré incluait le week-end',()=>{
  const h=harness(),r=h.record({htotal:'70:00'}),row=h.c.adminExportFormationRegisterRow(r,'Formation','FOR',100);
  assert.equal(row[7],'56:00');assert.equal(r.htotal,'70:00');
});
test('les indemnités journalières utilisent les mêmes journées ouvrées que le total d’heures',()=>{
  const h=harness(),calls=[],source=h.sources.stats;
  h.c.formStagGetData=()=>[h.record()];h.c.formFormGetData=()=>[];h.c.rates={formStag:100,formRate:100};
  h.c.add=(login,key,mins,date)=>calls.push({login,key,mins,date});
  const a=source.indexOf('  function addFormationDays('),b=source.indexOf('  const months=',a);assert.ok(a>=0&&b>a);
  vm.runInContext(source.slice(a,b),h.c);
  assert.equal(calls.length,8);assert.equal(calls.reduce((n,row)=>n+row.mins,0),56*60);
  assert.ok(!calls.some(row=>['2026-10-24','2026-10-25'].includes(row.date)));
});
