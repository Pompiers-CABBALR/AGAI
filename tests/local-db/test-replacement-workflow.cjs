const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {PGlite}=require('@electric-sql/pglite');

test('PostgreSQL local : remplaçant puis responsable fort, avec historique et refus des autres',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create schema agai_private');
    await db.exec(fs.readFileSync(path.join(__dirname,'replacement_workflow.sql'),'utf8'));
    const initial={id:'dr_test',kind:'remplacement',login:'demandeur',
      replacementLogin:'remplacant',statut:'en-attente',historique:[]};
    const transition=(current,actor,decision)=>db.query(
      'select agai_private.next_replacement_request($1::jsonb,$2,$3,$4) as request',
      [JSON.stringify(current),actor,'chef-fort',decision]
    );
    await assert.rejects(transition(initial,'chef-fort','accepte'),/AGAI_REPLACEMENT_CANDIDATE_REQUIRED/);
    const agreed=(await transition(initial,'remplacant','accepte')).rows[0].request;
    assert.equal(agreed.statut,'en-attente-responsable');
    assert.equal(agreed.confirmePar,'remplacant');
    assert.equal(agreed.historique[0].action,'accord-remplacant');
    await assert.rejects(transition(agreed,'chef-autre','accepte'),/AGAI_REPLACEMENT_STRONG_LEAD_REQUIRED/);
    const approved=(await transition(agreed,'chef-fort','accepte')).rows[0].request;
    assert.equal(approved.statut,'accepte');
    assert.equal(approved.reponduPar,'chef-fort');
    assert.equal(approved.historique.length,2);
    assert.equal(approved.confirmeAt,agreed.confirmeAt);
    await assert.rejects(transition(approved,'chef-fort','accepte'),/AGAI_REPLACEMENT_ALREADY_RESOLVED/);
    const refused=(await transition(initial,'remplacant','refuse')).rows[0].request;
    assert.equal(refused.statut,'refuse');
    assert.equal(refused.historique[0].action,'refus-remplacant');
  }finally{await db.close();}
});
