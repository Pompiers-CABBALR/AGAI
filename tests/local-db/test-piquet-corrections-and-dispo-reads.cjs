const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {PGlite}=require('@electric-sql/pglite');

test('correction validée et accusé de lecture isolés par responsable',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema agai_private;
      create table public.records(
        id text primary key,caserne text not null,type text not null,
        data jsonb not null,deleted boolean not null default false,
        updated_at timestamptz not null default now(),updated_by text
      );
      create function auth.role() returns text language sql stable as $$
        select 'authenticated'::text $$;
      create function auth.uid() returns uuid language sql stable as $$
        select '00000000-0000-0000-0000-000000000001'::uuid $$;
      create function agai_private.current_access()
      returns table(login text,caserne_id text,can_login boolean,can_operate boolean)
      language sql stable as $$
        select current_setting('agai.test_login',true),
          'TEST'::text,true,true $$;
      create function agai_private.can_write_record(text,text,text,jsonb)
      returns boolean language sql stable as $$ select true $$;
      create function agai_private.team_lead_piquet_scope(text,text)
      returns boolean language sql stable as $$
        select exists(select 1 from public.records e
          where e.caserne=$1 and e.type='equipe' and not e.deleted
            and e.data->>'resp'=current_setting('agai.test_login',true)) $$;
      create function agai_private.team_lead_piquet_update(text,text,text,jsonb)
      returns boolean language sql stable as $$ select false $$;
      create function agai_private.stamp_record_writer() returns trigger
      language plpgsql as $$ declare team_piquet_write boolean:=false;
      begin return new; end; $$;
      create trigger agai_stamp_record_writer before insert or update or delete
      on public.records for each row
      execute function agai_private.stamp_record_writer();`);
    const migrations=path.join(__dirname,'../../supabase/migrations');
    for(const file of [
      '20261117063044_guarded_dispo_replacement_v202611_0042.sql',
      '20261117170006_team_piquet_corrections_and_dispo_reads.sql'
    ])await db.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
    const week=(await db.query(`select to_char(date_trunc('week',
      now() at time zone 'Europe/Paris'),'YYYYMMDD') as week`)).rows[0].week;
    const previous=(await db.query(`select to_char(date_trunc('week',
      now() at time zone 'Europe/Paris')-interval '7 days','YYYYMMDD') as week`)).rows[0].week;
    const piquet={engin:'VTU-01',jour:'Lundi',debut:'07:00',fin:'12:00',
      chefAgres:'chef',conducteur:'driver',membres:[
        {role:"Chef d'agrès",login:'chef',hDebut:'07:00',hFin:'12:00'},
        {role:'Conducteur',login:'driver',hDebut:'07:00',hFin:'12:00'}]};
    const request={id:'dr_test',caserneId:'TEST',wk:week,login:'chef',
      kind:'ajout',statut:'en-attente',dateDemande:'20261117',
      notifiedLogins:['lead','lead2']};
    await db.exec("select set_config('agai.test_login','lead',false)");
    for(const [id,type,data] of [
      ['TEST__config__main','config',{piquets:{[week]:[piquet],[previous]:[piquet]},
        piquetsValidated:{[week]:true,[previous]:true}}],
      ['TEST__equipe__team','equipe',{resp:'lead',membres:['chef','driver']}],
      ['TEST__equipe__team2','equipe',{resp:'lead2',membres:['other']}],
      ['TEST__user__chef','user',{l:'chef'}],
      ['TEST__user__driver','user',{l:'driver'}],
      ['TEST__user__other','user',{l:'other'}],
      ['TEST__dispoRequest__dr_test','dispoRequest',request]
    ])await db.query('insert into public.records(id,caserne,type,data)'
      +' values($1,$2,$3,$4::jsonb)',[id,'TEST',type,JSON.stringify(data)]);
    const notices=(await db.query(
      'select public.agai_dispo_request_notices() as value')).rows[0].value;
    assert.equal(notices.length,1);
    assert.equal(notices[0].readAt,null);
    await db.query('select public.agai_mark_dispo_request_read($1,$2)',
      [notices[0].recordId,notices[0].signature]);
    assert.ok((await db.query(
      'select public.agai_dispo_request_notices() as value')).rows[0].value[0].readAt);
    await db.exec("select set_config('agai.test_login','lead2',false)");
    assert.equal((await db.query(
      'select public.agai_dispo_request_notices() as value')).rows[0].value[0].readAt,null);
    await db.exec("select set_config('agai.test_login','lead',false)");
    const updated={...request,statut:'accepte',reponduPar:'lead'};
    await db.query("update public.records set data=$1::jsonb"
      +" where id='TEST__dispoRequest__dr_test'",[JSON.stringify(updated)]);
    const changed=(await db.query(
      'select public.agai_dispo_request_notices() as value')).rows[0].value[0];
    assert.equal(changed.readAt,null);
    await assert.rejects(db.query('select public.agai_mark_dispo_request_read($1,$2)',
      [changed.recordId,notices[0].signature]),/AGAI_DISPO_NOTICE_CHANGED/);
    const next={...piquet,conducteur:'other',
      membres:[piquet.membres[0],{...piquet.membres[1],login:'other'}]};
    const corrected=(await db.query(
      'select public.agai_correct_validated_piquet($1,$2::jsonb,$3,$4,$5::jsonb,$6) as value',
      [week,JSON.stringify([piquet]),'modification',0,JSON.stringify(next),
        'Correction après disponibilité du conducteur']
    )).rows[0].value;
    assert.equal(corrected.piquets[0].conducteur,'other');
    assert.equal(corrected.revision,1);
    assert.equal(corrected.log.length,1);
    assert.match(corrected.log[0].details,/disponibilité/);
    const tuesday={...piquet,jour:'Mardi'};
    const added=(await db.query(
      'select public.agai_correct_validated_piquet($1,$2::jsonb,$3,$4,$5::jsonb,$6) as value',
      [week,JSON.stringify([next]),'ajout',1,JSON.stringify(tuesday),
        'Ajout du créneau après changement de disponibilité']
    )).rows[0].value;
    assert.equal(added.piquets.length,2);
    assert.equal(added.log.length,2);
    const removed=(await db.query(
      'select public.agai_correct_validated_piquet($1,$2::jsonb,$3,$4,$5::jsonb,$6) as value',
      [week,JSON.stringify(added.piquets),'suppression',1,null,
        'Suppression après vérification de la demande']
    )).rows[0].value;
    assert.equal(removed.piquets.length,1);
    assert.equal(removed.log.length,3);
    await assert.rejects(db.query(
      'select public.agai_correct_validated_piquet($1,$2::jsonb,$3,$4,$5::jsonb,$6)',
      [week,JSON.stringify(removed.piquets),'suppression',0,null,'court']
    ),/AGAI_PIQUET_CORRECTION_ACCESS_DENIED/);
    await assert.rejects(db.query(
      'select public.agai_correct_validated_piquet($1,$2::jsonb,$3,$4,$5::jsonb,$6)',
      [week,JSON.stringify([piquet]),'modification',0,JSON.stringify(next),
        'Correction après disponibilité du conducteur']
    ),/AGAI_PIQUET_REVISION_CONFLICT/);
    await assert.rejects(db.query(
      'select public.agai_correct_validated_piquet($1,$2::jsonb,$3,$4,$5::jsonb,$6)',
      [previous,JSON.stringify([piquet]),'modification',0,JSON.stringify(next),
        'Correction après disponibilité du conducteur']
    ),/AGAI_PIQUET_CORRECTION_ACCESS_DENIED/);
    await db.exec("select set_config('agai.test_login','agent',false)");
    await assert.rejects(db.query(
      'select public.agai_correct_validated_piquet($1,$2::jsonb,$3,$4,$5::jsonb,$6)',
      [week,JSON.stringify([next]),'suppression',0,null,
        'Correction de planning décidée en équipe']
    ),/AGAI_PIQUET_CORRECTION_ACCESS_DENIED/);
    assert.equal((await db.query(
      'select public.agai_dispo_request_notices() as value')).rows[0].value.length,0);
  }finally{await db.close();}
});
