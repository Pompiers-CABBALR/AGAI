const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../modules/17-animal-js.js'),'utf8');
const start=source.indexOf('function _rcDispoSlotKeys(slots){');
const end=source.indexOf('async function _rcProtectDispoRows(rows){',start);
assert.ok(start>=0&&end>start);
const context={};
vm.createContext(context);
vm.runInContext(source.slice(start,end),context);

test('une ancienne copie locale ne rétablit pas les heures changées par la relève',()=>{
  const local={wk:'20261116',login:'agent',slots:{
    '0_14':true,'0_15':true,
    _slotUpdatedAt:{'0_14':100,'0_15':300},_updatedAt:300
  }};
  const server={wk:'20261116',login:'agent',slots:{
    '0_14':false,'0_15':false,
    _slotUpdatedAt:{'0_14':200,'0_15':150},_updatedAt:200
  }};
  const merged=context._rcMergeDispoRows(local,server);
  assert.equal(merged.value.slots['0_14'],false);
  assert.equal(merged.value.slots['0_15'],true);
  assert.equal(merged.keptCurrentData,true);
});
