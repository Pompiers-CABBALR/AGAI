const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');

const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261028194602_permit_team_lead_station_dispo.sql'),'utf8');

for(const filename of ['modules/17-animal-js.js','app.js']){
  const source=fs.readFileSync(path.join(root,filename),'utf8');
  const start=source.indexOf('function _rcSplitAll(data){');
  const end=source.indexOf('async function _rcPushRecords(records){',start);
  assert.ok(start>=0&&end>start,filename+' : découpe records introuvable');
  const context={RC_SEP:'__',PERSONNEL_ONLINE_GATE:false,
    _rcId:(cid,type,key)=>[cid,type,key].join('__'),_rcSplitCaserne:()=>[]};
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.split=_rcSplitAll;',context);

  test(filename+' : chaque demande devient une ligne propre à sa caserne',()=>{
    const request={id:'dr_123_ab12cd',login:'alice',statut:'en-attente',slots:[]};
    const data={DISPO_REQUESTS:{20261026:[request]},CASERNE_DATA:{CIS05:{users:[{l:'alice'}]}}};
    const rows=context.split(data);
    const row=rows.find(item=>item.type==='dispoRequest');
    assert.ok(row);
    assert.equal(row.id,'CIS05__dispoRequest__dr_123_ab12cd');
    assert.equal(row.data.wk,'20261026');
    assert.equal(row.data.caserneId,'CIS05');
    assert.equal(request.caserneId,undefined);
  });
  test(filename+' : une caserne incertaine ne provoque aucun envoi',()=>{
    const request={id:'dr_123',login:'alice',statut:'en-attente',slots:[]};
    const data={DISPO_REQUESTS:{20261026:[request]},CASERNE_DATA:{CIS05:{users:[{l:'alice'}]},CIS06:{users:[{l:'alice'}]}}};
    assert.equal(context.split(data).filter(item=>item.type==='dispoRequest').length,0);
  });
  test(filename+' : la lecture reçoit les demandes par ligne et conserve l’ancienne ligne globale',()=>{
    assert.match(source,/if\(r\.type==='dispoRequest'\)\{/);
    assert.match(source,/dispoRequestRows\.forEach\(function\(row\)\{/);
    assert.match(source,/if\(index>=0\)items\[index\]=request;else items\.push\(request\)/);
  });
}

test('un agent ne peut écrire que ses demandes ouvertes, un responsable celles de la caserne',()=>{
  assert.match(sql,/if p_type='dispoRequest' then/);
  assert.match(sql,/p_id<>p_caserne\|\|'__dispoRequest__'/);
  assert.match(sql,/p_data->>'login'=actor\.login then[\s\S]*?statut' in \('en-attente','annulee'\)/);
  assert.match(sql,/team\.caserne=p_caserne and team\.type='equipe' and not team\.deleted/);
  assert.match(sql,/team\.data->>'resp'=actor\.login/);
});
