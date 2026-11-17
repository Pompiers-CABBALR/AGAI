const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {PGlite}=require('@electric-sql/pglite');

test('migration réelle : relève atomique et copie admin obsolète refusée',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema agai_private;
      create table public.records(
        id text primary key,caserne text not null,type text not null,
        data jsonb not null,deleted boolean not null default false,
        updated_at timestamptz,updated_by text
      );
      create function auth.role() returns text language sql stable as $$
        select 'authenticated'::text $$;
      create function auth.uid() returns uuid language sql stable as $$
        select '00000000-0000-0000-0000-000000000001'::uuid $$;
      create function agai_private.current_access()
      returns table(login text,caserne_id text,can_login boolean,can_operate boolean)
      language sql stable as $$
        select current_setting('agai.test_login',true),
          'CIS05'::text,true,true $$;
      create function agai_private.can_write_record(text,text,text,jsonb)
      returns boolean language sql stable as $$ select true $$;
      create function agai_private.team_lead_piquet_update(text,text,text,jsonb)
      returns boolean language sql stable as $$ select false $$;
      create function agai_private.stamp_record_writer() returns trigger
      language plpgsql as $$ declare team_piquet_write boolean:=false;
      begin return new; end; $$;
      create trigger agai_stamp_record_writer before insert or update or delete
      on public.records for each row
      execute function agai_private.stamp_record_writer();`);
    const file=path.join(__dirname,'../../supabase/migrations',
      '20261117063044_guarded_dispo_replacement_v202611_0042.sql');
    await db.exec(fs.readFileSync(file,'utf8'));
    const week='20261116';
    const piquet={jour:'Lundi',debut:'20:00',fin:'00:00',
      chefAgres:'chef',conducteur:'conducteur',
      membres:[
        {role:"Chef d'agrès",login:'chef',hDebut:'20:00',hFin:'00:00'},
        {role:'Conducteur',login:'conducteur',hDebut:'20:00',hFin:'00:00'}
      ]};
    const request={id:'dr_1',caserneId:'CIS05',kind:'remplacement',
      statut:'en-attente',wk:week,login:'chef',
      replacementLogin:'autre-chef',
      slots:[{key:'0_14',newVal:'false'}],historique:[]};
    const rows=[
      ['CIS05__config__main','config',{
        planningRotations:{[week]:['eq_forte']},
        astrConfig:{granularity:60,weekStartHour:7},
        piquets:{[week]:[piquet]},piquetsValidated:{[week]:true}}],
      ['CIS05__equipe__eq_forte','equipe',{resp:'chef-fort'}],
      ['CIS05__equipe__eq_autre','equipe',
        {resp:'chef-autre',membres:['autre-chef'],granularity:30}],
      ['CIS05__user__chef','user',{l:'chef',fonction:"Chef d'agrès"}],
      ['CIS05__user__autre-chef','user',{l:'autre-chef',fonction:"Chef d'agrès"}],
      ['CIS05__dispoRequest__dr_1','dispoRequest',request],
      ['CIS05__dispo__20261116__chef','dispo',
        {wk:week,login:'chef',slots:{'0_14':true}}]
    ];
    await db.exec("select set_config('agai.test_login','chef-fort',false)");
    for(const [id,type,data] of rows)
      await db.query('insert into public.records(id,caserne,type,data)'
        +' values($1,$2,$3,$4::jsonb)',
        [id,'CIS05',type,JSON.stringify(data)]);
    await db.exec("select set_config('agai.test_login','autre-chef',false)");
    await db.query("select public.agai_confirm_dispo_replacement("
      +"'CIS05__dispoRequest__dr_1','accepte')");
    await db.exec("select set_config('agai.test_login','chef-fort',false)");
    const result=(await db.query(
      "select public.agai_resolve_dispo_replacement($1,$2::jsonb,'accepte') as value",
      ['CIS05__dispoRequest__dr_1',JSON.stringify([piquet])]
    )).rows[0].value;
    assert.equal(result.request.statut,'accepte');
    assert.equal(result.piquetRevision,1);
    assert.equal(result.piquets[0].membres[1].login,'autre-chef');
    const read=async id=>(await db.query(
      'select data from public.records where id=$1',[id])).rows[0].data;
    const current=await read('CIS05__config__main');
    assert.equal(current.piquets._replacementRevision,1);
    assert.equal(current.piquets._log[week].length,1);
    await db.exec("select set_config('agai.test_login','admin',false)");
    const stale={...current,piquets:{...current.piquets,[week]:[piquet]}};
    delete stale.piquets._replacementRevision;
    await assert.rejects(db.query(
      "update public.records set data=$1::jsonb where id='CIS05__config__main'",
      [JSON.stringify(stale)]),/AGAI_PIQUET_STALE_REPLACEMENT/);
    assert.equal((await read('CIS05__config__main')).piquets[week][0].membres[1].login,
      'autre-chef');
    await assert.rejects(db.query("update public.records set data=jsonb_set(data,"
      + "'{statut}','\"en-attente\"'::jsonb)"
      + " where id='CIS05__dispoRequest__dr_1'"),
      /AGAI_REPLACEMENT_REQUIRES_RPC/);
    await db.query("update public.records set data=jsonb_set(data,"
      +"'{unrelated}','true'::jsonb) where id='CIS05__config__main'");
    assert.equal((await read('CIS05__config__main')).unrelated,true);
  }finally{await db.close();}
});
