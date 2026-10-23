const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const availability=fs.readFileSync(path.join(root,'modules/12-astreintes-js.js'),'utf8');
const authorization=fs.readFileSync(path.join(root,'modules/13-autorisation-js.js'),'utf8');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');

function functionSource(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const body=source.indexOf('{',start);
  let depth=0;
  for(let i=body;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&!--depth)return source.slice(start,i+1);
  }
  throw Error('Unclosed '+name);
}

const names=['validDispoGranularity','dispoGranularityFor','getSlotsPerDay','getSlotsForDay','renderDispoAgentBlock'];
const context={
  ASTR_CONFIG:{granularity:undefined,weekStartHour:8},
  EQUIPES:[],USERS:[{l:'agent.sans.equipe',prenom:'Agent',nom:'Sans équipe'}],
  CU:{l:'admin'},DISPOS:{},DISPOS_UNLOCKED:{},DISPO_REQUESTS:{},
  window:{matchMedia:()=>({matches:false})},
  document:{getElementById:()=>({clientWidth:1000})},
  getEquipeOfUser:()=>undefined,
  isSuperAdmin:()=>true,isDispoValidated:()=>false,
  personnelDispoSlotAllowed:()=>true,
  personnelPlanningWeekContext:()=>({}),personnelPlanningSlotState:()=>null,
  personnelPlanningSlotRange:()=>({start:0,end:1}),personnelPlanningLegendHTML:()=>'',escHtml:String,
  dispoDayLabel:(_,day)=>'jour '+day,
  slotToLabelDay:(_,slot)=>'heure '+slot,
  fullName:user=>user.prenom+' '+user.nom,
  pad:value=>String(value).padStart(2,'0')
};
vm.createContext(context);
for(const name of names)vm.runInContext(functionSource(availability,name),context);
assert.equal(context.dispoGranularityFor('agent.sans.equipe'),60);
assert.equal(context.getSlotsForDay(0,undefined),24);
const html=context.renderDispoAgentBlock('agent.sans.equipe','20261019',false,true,false,1,null);
assert.equal((html.match(/class="dispo-cell"/g)||[]).length,168);
assert.equal((html.match(/data-can-edit="true"/g)||[]).length,168);
assert.match(html,/class="dispo-grid-inner"/);
assert.equal((html.match(/grid-template-columns:78px repeat\(24,minmax\(0,1fr\)\)/g)||[]).length,9);
assert.doesNotMatch(html,/flex:0 0 \d+(?:\.\d+)?px/);
assert.match(css,/\.dispo-grid-inner\{width:100%;min-width:var\(--dispo-min-width\)/);
assert.match(css,/\.dispo-scroll\{max-width:100%;overflow-x:auto/);
context.ASTR_CONFIG.granularity=30;
const halfHour=context.renderDispoAgentBlock('agent.sans.equipe','20261019',false,true,false,1,null);
assert.equal((halfHour.match(/class="dispo-cell"/g)||[]).length,336);
assert.match(halfHour,/grid-template-columns:78px repeat\(48,minmax\(0,1fr\)\)/);
assert.match(halfHour,/--dispo-min-width:846px;--dispo-touch-min-width:1230px/);
context.ASTR_CONFIG.granularity=undefined;
context.isDispoValidated=()=>true;
const locked=context.renderDispoAgentBlock('agent.sans.equipe','20261019',false,true,false,1,null);
assert.equal((locked.match(/data-can-edit="false"/g)||[]).length,168);
assert.match(availability,/if\(el\.dataset\.canEdit!=='true'\)return;/);

assert.match(authorization,/function openLargeSignature\(/);
assert.match(authorization,/requestFullscreen\(\)/);
assert.match(authorization,/orientation\.lock\('landscape'\)/);
assert.match(authorization,/saveAutorisationData\(_sigCurrentIvId\)/);
assert.match(css,/\.mov\.autorisation-modal-overlay/);
assert.match(css,/\.aut-large-signature-pad canvas\{[^}]*touch-action:none/);
console.log('Availability without a team and mobile signature controls: OK');

