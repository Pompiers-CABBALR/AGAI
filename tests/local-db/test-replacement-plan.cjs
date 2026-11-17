const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {PGlite}=require('@electric-sql/pglite');

test('PostgreSQL local : les deux disponibilités et les piquets sont calculés ensemble',async()=>{
  const db=new PGlite();
  try{
    for(const file of ['replacement_projection.sql','replacement_plan.sql'])
      await db.exec(fs.readFileSync(path.join(__dirname,file),'utf8'));
    const piquet={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'chef',
      conducteur:'conducteur',membres:[
        {role:"Chef d'agrès",login:'chef',hDebut:'20:00',hFin:'00:00'},
        {role:'Conducteur',login:'conducteur',hDebut:'20:00',hFin:'00:00'}
      ]};
    const request={kind:'remplacement',statut:'en-attente-responsable',login:'chef',
      replacementLogin:'autre-chef',confirmePar:'autre-chef',
      slots:[{key:'0_14',newVal:'false'}]};
    const plan=(draft,piquets,source,target,sourceGran=60,targetGran=60)=>db.query(
      'select agai_private.plan_replacement($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,7,$5,$6) as result',
      [JSON.stringify(draft),JSON.stringify(piquets),JSON.stringify(source),
        JSON.stringify(target),sourceGran,targetGran]
    );
    const planned=(await plan(request,[piquet],{'0_14':true},{'0_14':false})).rows[0].result;
    assert.equal(planned.sourceSlots['0_14'],false);
    assert.equal(planned.candidateSlots['0_14'],true);
    assert.equal(planned.piquets[0].membres[1].login,'autre-chef');
    assert.equal(planned.piquets[0].membres[0].login,'chef');
    assert.equal(planned.piquets[0].membres[2].login,'chef');
    await assert.rejects(plan(request,[piquet],{'0_14':false},{}),
      /AGAI_REPLACEMENT_SOURCE_CHANGED/);
    await assert.rejects(plan({...request,confirmePar:''},[piquet],{'0_14':true},{}),
      /AGAI_REPLACEMENT_NOT_CONFIRMED/);
    const concurrent={jour:'Lundi',debut:'21:00',fin:'23:00',conducteur:'autre-chef'};
    await assert.rejects(plan(request,[piquet,concurrent],{'0_14':true},{}),
      /AGAI_REPLACEMENT_CANDIDATE_PIQUET_CONFLICT/);
    const candidate30=(await plan(request,[piquet],{'0_14':true},{},60,30)).rows[0].result;
    assert.equal(candidate30.candidateSlots['0_28'],true);
    assert.equal(candidate30.candidateSlots['0_29'],true);
  }finally{await db.close();}
});
