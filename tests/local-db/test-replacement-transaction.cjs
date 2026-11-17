const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {PGlite}=require('@electric-sql/pglite');

test('PostgreSQL local : accord, validation et écriture atomique de la relève',async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon; create role authenticated;"
      +"create schema auth; create schema agai_private;"
      +"create function auth.role() returns text language sql stable as $$"
      +" select 'authenticated'::text $$;"
      +"create function auth.uid() returns uuid language sql stable as $$"
      +" select case when current_setting('agai.test_login',true) is not null"
      +" then '00000000-0000-0000-0000-000000000001'::uuid else null end $$;"
      +"create function agai_private.current_access()"
      +" returns table(login text,caserne_id text,can_operate boolean)"
      +" language sql stable as $$"
      +" select current_setting('agai.test_login',true), 'CIS05'::text, true $$;");
    for(const file of ['replacement_projection.sql','replacement_workflow.sql',
      'replacement_plan.sql','replacement_transaction.sql'])
      await db.exec(fs.readFileSync(path.join(__dirname,file),'utf8'));
    const piquet={jour:'Lundi',debut:'20:00',fin:'00:00',chefAgres:'chef',
      conducteur:'conducteur',membres:[
        {role:"Chef d'agrès",login:'chef',hDebut:'20:00',hFin:'00:00'},
        {role:'Conducteur',login:'conducteur',hDebut:'20:00',hFin:'00:00'}
      ]};
    const request={id:'dr_1',caserneId:'CIS05',kind:'remplacement',statut:'en-attente',
      wk:'20261116',login:'chef',replacementLogin:'autre-chef',
      slots:[{key:'0_14',newVal:'false'}],historique:[]};
    const rows=[
      ['CIS05__config__main','config',{planningRotations:{20261116:['eq_forte']},
        astrConfig:{granularity:60,weekStartHour:7},piquets:{20261116:[piquet]},
        piquetsValidated:{20261116:false}}],
      ['CIS05__equipe__eq_forte','equipe',{resp:'chef-fort'}],
      ['CIS05__equipe__eq_autre','equipe',
        {resp:'chef-autre',membres:['autre-chef'],granularity:30}],
      ['CIS05__user__chef','user',{l:'chef',fonction:"Chef d'agrès"}],
      ['CIS05__user__autre-chef','user',{l:'autre-chef',fonction:"Chef d'agrès"}],
      ['CIS05__dispoRequest__dr_1','dispoRequest',request],
      ['CIS05__dispo__20261116__chef','dispo',{wk:'20261116',login:'chef',slots:{'0_14':true}}]
    ];
    for(const [id,type,data] of rows)
      await db.query('insert into public.records(id,caserne,type,data) values($1,$2,$3,$4::jsonb)',
        [id,'CIS05',type,JSON.stringify(data)]);
    await db.exec(fs.readFileSync(path.join(__dirname,'replacement_permit.sql'),'utf8'));
    const setActor=login=>db.query("select set_config('agai.test_login',$1,false)",[login]);
    const mutateFixture=async(query,params)=>{
      await db.exec('alter table public.records disable trigger test_replacement_write_guard');
      try{return await db.query(query,params);}finally{
        await db.exec('alter table public.records enable trigger test_replacement_write_guard');
      }
    };
    const read=id=>db.query('select data from public.records where id=$1',[id])
      .then(result=>result.rows[0].data);
    const exists=id=>db.query('select 1 from public.records where id=$1',[id])
      .then(result=>result.rows.length>0);
    await setActor('chef-fort');
    await assert.rejects(db.query("update public.records set data=jsonb_set(data,'{statut}',"
      +"'\"accepte\"'::jsonb) where id='CIS05__dispoRequest__dr_1'"),
    /AGAI_WRITE_FORBIDDEN/);
    await assert.rejects(db.query(
      "select public.agai_confirm_dispo_replacement('CIS05__dispoRequest__dr_1','accepte')"
    ),/AGAI_REPLACEMENT_CANDIDATE_REQUIRED/);
    await setActor('autre-chef');
    const confirmed=(await db.query(
      "select public.agai_confirm_dispo_replacement('CIS05__dispoRequest__dr_1','accepte') as request"
    )).rows[0].request;
    assert.equal(confirmed.statut,'en-attente-responsable');
    assert.equal((await db.query('select count(*)::integer as n'
      +' from agai_private.replacement_write_permits')).rows[0].n,0);
    await setActor('chef-fort');
    await assert.rejects(db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte')",
      ['CIS05__dispoRequest__dr_1',JSON.stringify([])]
    ),/AGAI_REPLACEMENT_PIQUET_REVISION_CONFLICT/);
    assert.equal((await read('CIS05__dispo__20261116__chef')).slots['0_14'],true);
    assert.equal((await read('CIS05__dispoRequest__dr_1')).statut,'en-attente-responsable');
    assert.equal(await exists('CIS05__dispo__20261116__autre-chef'),false);
    await mutateFixture("update public.records set data=jsonb_set(data,'{slots,0_14}','false'::jsonb)"
      +" where id='CIS05__dispo__20261116__chef'");
    await assert.rejects(db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte')",
      ['CIS05__dispoRequest__dr_1',JSON.stringify([piquet])]
    ),/AGAI_REPLACEMENT_SOURCE_CHANGED/);
    assert.equal(await exists('CIS05__dispo__20261116__autre-chef'),false);
    assert.equal((await read('CIS05__config__main')).piquets['20261116'][0].chefAgres,'chef');
    assert.equal((await read('CIS05__dispoRequest__dr_1')).statut,'en-attente-responsable');
    await mutateFixture("update public.records set data=jsonb_set(data,'{slots,0_14}','true'::jsonb)"
      +" where id='CIS05__dispo__20261116__chef'");
    await mutateFixture("update public.records set data=jsonb_set(data,'{fonction}',$1::jsonb)"
      +" where id='CIS05__user__autre-chef'",[JSON.stringify('Équipier')]);
    await assert.rejects(db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte')",
      ['CIS05__dispoRequest__dr_1',JSON.stringify([piquet])]
    ),/AGAI_REPLACEMENT_QUALIFICATION_INSUFFICIENT/);
    await mutateFixture("update public.records set data=jsonb_set(data,'{fonction}',$1::jsonb)"
      +" where id='CIS05__user__autre-chef'",[JSON.stringify("Chef d'agrès")]);
    await mutateFixture("update public.records set data=jsonb_set(data,'{_personnelPeriods}',$1::jsonb)"
      +" where id='CIS05__user__autre-chef'",
      [JSON.stringify([{kind:'arret',start:'2026-11-16',end:'2026-11-16'}])]);
    await assert.rejects(db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte')",
      ['CIS05__dispoRequest__dr_1',JSON.stringify([piquet])]
    ),/AGAI_REPLACEMENT_PERSONNEL_UNAVAILABLE/);
    await mutateFixture("update public.records set data=data-'_personnelPeriods'"
      +" where id='CIS05__user__autre-chef'");
    await mutateFixture("update public.records set data=jsonb_set(data,'{_personnelExits}',$1::jsonb)"
      +" where id='CIS05__user__autre-chef'",
      [JSON.stringify([{kind:'retraite',start:'2026-11-16'}])]);
    await assert.rejects(db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte')",
      ['CIS05__dispoRequest__dr_1',JSON.stringify([piquet])]
    ),/AGAI_REPLACEMENT_PERSONNEL_UNAVAILABLE/);
    await mutateFixture("update public.records set data=data-'_personnelExits'"
      +" where id='CIS05__user__autre-chef'");
    await mutateFixture('insert into public.records(id,caserne,type,data) values($1,$2,$3,$4::jsonb)',
      ['CIS05__formStag__test','CIS05','formStag',
        JSON.stringify({participants:['autre-chef'],ddebut:'2026-11-16',
          dfin:'2026-11-16',joursFormation:['2026-11-16'],
          hmatind:'20:30',hmatinf:'21:30'})]);
    await assert.rejects(db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte')",
      ['CIS05__dispoRequest__dr_1',JSON.stringify([piquet])]
    ),/AGAI_REPLACEMENT_TRAINING_CONFLICT/);
    await mutateFixture("update public.records set data=jsonb_set(data,'{hmatind}','\"08:00\"'::jsonb)"
      +" where id='CIS05__formStag__test'");
    await mutateFixture("update public.records set data=jsonb_set(data,'{hmatinf}','\"10:00\"'::jsonb)"
      +" where id='CIS05__formStag__test'");
    const nonOverlappingTraining=await db.query(
      "select agai_private.replacement_training_overlaps(data,'autre-chef',"
        +"'2026-11-16 21:00'::timestamp,'2026-11-16 22:00'::timestamp) as blocked"
        +" from public.records where id='CIS05__formStag__test'");
    assert.equal(nonOverlappingTraining.rows[0].blocked,false);
    await mutateFixture("delete from public.records where id='CIS05__formStag__test'");
    const approved=(await db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte') as result",
      ['CIS05__dispoRequest__dr_1',JSON.stringify([piquet])]
    )).rows[0].result;
    assert.equal(approved.request.statut,'accepte');
    assert.equal(approved.request.historique.length,2);
    const sourceSlots=(await read('CIS05__dispo__20261116__chef')).slots;
    const candidateSlots=(await read('CIS05__dispo__20261116__autre-chef')).slots;
    assert.equal(sourceSlots['0_14'],false);
    assert.equal(candidateSlots['0_28'],true);
    assert.equal(candidateSlots['0_29'],true);
    assert.ok(sourceSlots._slotUpdatedAt['0_14']>0);
    assert.ok(candidateSlots._slotUpdatedAt['0_28']>0);
    assert.equal(candidateSlots._slotUpdatedAt['0_28'],candidateSlots._slotUpdatedAt['0_29']);
    assert.equal(sourceSlots._updatedBy,'chef-fort');
    assert.equal((await db.query('select count(*)::integer as n'
      +' from agai_private.replacement_write_permits')).rows[0].n,0);
    await assert.rejects(db.query("update public.records set data='{}'::jsonb"
      +" where id='CIS05__config__main'"),/AGAI_PIQUET_STALE_REPLACEMENT/);
    const config=await read('CIS05__config__main');
    assert.equal(config.piquets['20261116'][0].membres[1].login,'autre-chef');
    assert.equal(config.piquets._replacementRevision,1);
    assert.equal(approved.piquetRevision,1);
    assert.equal(config.piquets._log?.['20261116']?.length||0,0);
    await setActor('admin');
    await db.exec("select set_config('agai.test_admin','true',false)");
    const staleConfig={...config,piquets:{...config.piquets}};
    delete staleConfig.piquets._replacementRevision;
    staleConfig.piquets['20261116']=[piquet];
    await assert.rejects(db.query(
      "update public.records set data=$1::jsonb where id='CIS05__config__main'",
      [JSON.stringify(staleConfig)]),/AGAI_PIQUET_STALE_REPLACEMENT/);
    assert.equal((await read('CIS05__config__main')).piquets['20261116'][0].membres[1].login,
      'autre-chef');
    await db.query("update public.records set data=jsonb_set(data,'{unrelated}',"
      +"'true'::jsonb) where id='CIS05__config__main'");
    assert.equal((await read('CIS05__config__main')).unrelated,true);
    await db.exec("select set_config('agai.test_admin','false',false)");
    const secondRequest={...request,id:'dr_2'};
    await mutateFixture('insert into public.records(id,caserne,type,data)'
      +' values($1,$2,$3,$4::jsonb)',
    ['CIS05__dispoRequest__dr_2','CIS05','dispoRequest',JSON.stringify(secondRequest)]);
    await mutateFixture("update public.records set data=jsonb_set(data,'{piquets,20261116}',"
      +"$1::jsonb) where id='CIS05__config__main'",[JSON.stringify([piquet])]);
    await mutateFixture("update public.records set data=jsonb_set(data,"
      +"'{piquetsValidated,20261116}','true'::jsonb)"
      +" where id='CIS05__config__main'");
    await mutateFixture("update public.records set data=jsonb_set(data,'{slots,0_14}',"
      +"'true'::jsonb) where id='CIS05__dispo__20261116__chef'");
    await setActor('autre-chef');
    await db.query("select public.agai_confirm_dispo_replacement("
      +"'CIS05__dispoRequest__dr_2','accepte')");
    await setActor('chef-fort');
    const secondApproved=(await db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte') as result",
      ['CIS05__dispoRequest__dr_2',JSON.stringify([piquet])]
    )).rows[0].result;
    assert.equal(secondApproved.request.statut,'accepte');
    assert.equal(secondApproved.piquetRevision,2);
    assert.equal((await read('CIS05__config__main')).piquets._log['20261116'].length,1);
    const invalidRequest={...request,id:'dr_bad',replacementLogin:'chef'};
    await mutateFixture('insert into public.records(id,caserne,type,data)'
      +' values($1,$2,$3,$4::jsonb)',
    ['CIS05__dispoRequest__dr_bad','CIS05','dispoRequest',JSON.stringify(invalidRequest)]);
    await setActor('chef');
    await assert.rejects(db.query(
      "select public.agai_confirm_dispo_replacement("
        +"'CIS05__dispoRequest__dr_bad','accepte')"
    ),/AGAI_REPLACEMENT_INVALID_REQUEST/);
    assert.equal((await read('CIS05__dispoRequest__dr_bad')).statut,'en-attente');
  }finally{await db.close();}
});
