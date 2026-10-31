const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');

for(const file of ['modules/12-astreintes-js.js','app.js']){
  test(file+' : CATE et CA1E sont des libellés, sans changer les catégories',()=>{
    const source=fs.readFileSync(path.join(root,file),'utf8');
    const keys=source.match(/const ROLE_KEYS=(\[[^;]+\]);/);
    const labels=source.match(/const ROLE_LABELS=(\{[^;]+\});/);
    assert.ok(keys&&labels);
    const categories=vm.runInNewContext(keys[1]);
    const displayed=vm.runInNewContext('('+labels[1]+')');
    assert.deepEqual([...categories],['INC2','CA1Eq','CE','Eq']);
    assert.equal(displayed.INC2,'CATE');
    assert.equal(displayed.CA1Eq,'CA1E');
    assert.match(source,/ROLE_LABELS\[roleKey\]/);
    assert.match(source,/ROLE_LABELS\[rk\]/);
  });
}
