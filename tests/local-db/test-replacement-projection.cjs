const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');

const sql=fs.readFileSync(path.join(__dirname,'replacement_projection.sql'),'utf8');
const base={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'carre',
  conducteur:'marien',note:'',membres:[
    {role:"Chef d'agrès",login:'carre',hDebut:'20:00',hFin:'00:00'},
    {role:'Conducteur',login:'marien',hDebut:'20:00',hFin:'00:00'}
  ]};
const second={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'nicolas',
  conducteur:'valery',membres:[
    {role:"Chef d'agrès",login:'nicolas',hDebut:'20:00',hFin:'00:00'},
    {role:'Conducteur',login:'valery',hDebut:'20:00',hFin:'00:00'}
  ]};

test('PostgreSQL local : la relève 21 h–22 h ne change pas les autres heures ou départs',async()=>{
  const db=new PGlite();
  try{
    await db.exec(sql);
    const request={login:'carre',replacementLogin:'sebastien',
      slots:[{key:'0_14',newVal:'false'}]};
    const result=await db.query(
      'select agai_private.project_replacement_week($1::jsonb,$2::jsonb,7,60) as piquets',
      [JSON.stringify([base,second]),JSON.stringify(request)]
    );
    const piquets=result.rows[0].piquets;
    assert.deepEqual(piquets[0].membres.slice(0,3).map(m=>[m.login,m.hDebut,m.hFin]),[
      ['carre','20:00','21:00'],['sebastien','21:00','22:00'],['carre','22:00','00:00']]);
    assert.equal(piquets[0].chefAgres,'carre');
    assert.deepEqual(piquets[1],second);
    const full=await db.query(
      'select agai_private.project_replacement_week($1::jsonb,$2::jsonb,7,60) as piquets',
      [JSON.stringify([base]),JSON.stringify({...request,slots:[13,14,15,16]
        .map(index=>({key:'0_'+index,newVal:'false'}))})]
    );
    assert.equal(full.rows[0].piquets[0].chefAgres,'sebastien');
    assert.deepEqual(full.rows[0].piquets[0].membres.slice(0,1)
      .map(m=>[m.login,m.hDebut,m.hFin]),[['sebastien','20:00','00:00']]);
    const night={jour:'Lundi',debut:'00:00',fin:'07:00',chefAgres:'carre',
      conducteur:'marien',note:'Présence partielle : ancien avertissement',
      membres:[{role:"Chef d'agrès",login:'carre',hDebut:'00:00',hFin:'07:00'},
        {role:'Conducteur',login:'marien',hDebut:'00:00',hFin:'07:00'}]};
    const nightResult=await db.query(
      'select agai_private.project_replacement_week($1::jsonb,$2::jsonb,7,60) as piquets',
      [JSON.stringify([night]),JSON.stringify({...request,slots:[{key:'0_18',newVal:'false'}]})]
    );
    assert.deepEqual(nightResult.rows[0].piquets[0].membres.slice(0,3)
      .map(m=>[m.login,m.hDebut,m.hFin]),[
        ['carre','00:00','01:00'],['sebastien','01:00','02:00'],['carre','02:00','07:00']]);
    assert.equal(nightResult.rows[0].piquets[0].note,'');
    const legacy={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'carre',
      conducteur:'marien'};
    const legacyResult=await db.query(
      'select agai_private.project_replacement_week($1::jsonb,$2::jsonb,7,60) as piquets',
      [JSON.stringify([legacy]),JSON.stringify(request)]
    );
    assert.equal(legacyResult.rows[0].piquets[0].membres.length,4);
    assert.ok(legacyResult.rows[0].piquets[0].membres.every(m=>m&&m.login));
    const appSource=fs.readFileSync(path.join(__dirname,'..','..','modules','12-astreintes-js.js'),'utf8');
    const appStart=appSource.indexOf('function astrProjectReplacementPiquets(');
    const appEnd=appSource.indexOf('function astrReplacementCandidateKeys(',appStart);
    assert.ok(appStart>=0&&appEnd>appStart);
    for(const [original,indices,granularity] of [
      [base,[13,14,15,16],60],[base,[13,15],60],[base,[14,15],60],
      [night,[17,18,19],60],[legacy,[13,14],60]
    ]){
      const draft={...request,slots:indices.map(index=>({key:'0_'+index,newVal:'false'}))};
      const context={PIQUETS:{20261116:[original]},JOURS_FULL:['Lundi','Mardi','Mercredi',
        'Jeudi','Vendredi','Samedi','Dimanche'],dispoGranularityFor:()=>granularity,
      astrScheduleForWeek:()=>({weekStartHour:7}),
      timeToMin:value=>{const [h,m]=value.split(':').map(Number);return h*60+m;},
      piquetToAbsRangeIdx:(day,begin,end)=>{
        const minutes=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
        return [day*1440+minutes(begin),day*1440+minutes(end)
          +(minutes(end)<=minutes(begin)?1440:0)];
      },pad:value=>String(value).padStart(2,'0')};
      vm.createContext(context);
      vm.runInContext(appSource.slice(appStart,appEnd),context);
      const appProjection=context.astrProjectReplacementPiquets('20261116',draft).piquets;
      const sqlProjection=(await db.query(
        'select agai_private.project_replacement_week($1::jsonb,$2::jsonb,7,$3) as piquets',
        [JSON.stringify([original]),JSON.stringify(draft),granularity]
      )).rows[0].piquets;
      assert.deepEqual(sqlProjection,JSON.parse(JSON.stringify(appProjection)));
    }
    const candidateKeys=await db.query(
      'select agai_private.replacement_candidate_keys($1::jsonb,60,30) as keys',
      [JSON.stringify(request)]
    );
    assert.deepEqual(candidateKeys.rows[0].keys,['0_28','0_29']);
    await assert.rejects(db.query(
      'select agai_private.replacement_candidate_keys($1::jsonb,30,60)',
      [JSON.stringify({...request,slots:[{key:'0_28',newVal:'false'}]})]
    ),/AGAI_REPLACEMENT_GRANULARITY_CONFLICT/);
    await assert.rejects(db.query(
      'select agai_private.project_replacement_week($1::jsonb,$2::jsonb,7,60)',
      [JSON.stringify([base]),JSON.stringify({...request,slots:[request.slots[0],request.slots[0]]})]
    ),/AGAI_REPLACEMENT_DUPLICATE_SLOT/);
    await assert.rejects(db.query(
      'select agai_private.project_replacement_week($1::jsonb,$2::jsonb,7,60)',
      [JSON.stringify([base]),JSON.stringify({...request,slots:[{key:'0_24',newVal:'false'}]})]
    ),/AGAI_REPLACEMENT_INVALID_SLOT/);
  }finally{await db.close();}
});
