// === MODULE: admin.js (partie 1/2 — vues globales superadmin) ===
// ══════════════════════════════════════════════════════
// VUES GLOBALES — Superadmin & Chef de corps
// ══════════════════════════════════════════════════════
function showGlobalView(role){
  document.getElementById('app').style.display='none';
  const gv=document.getElementById('global-view');
  gv.style.display='block';
  document.getElementById('gv-title').textContent=role==='superadmin'?'Super Administrateur — Toutes casernes':'Chef de Corps — Tableau de bord';
  document.getElementById('gv-role').textContent=role==='superadmin'?'Gestion globale':'Statistiques consolidées';
  // Bouton retour caserne pour superadmin
  const gvNav=document.getElementById('gv-nav-extra');
  if(gvNav){
    if(role==='superadmin'&&CC()){
      gvNav.innerHTML=`<button onclick="retourCaserne()" style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;margin-right:8px;">← ${CC().nom}</button>`;
    } else if(role==='chef_corps'){
      gvNav.innerHTML='<button onclick="ccEditMesInfos()" style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;margin-right:8px;">&#x1F464; Mes informations</button>'
        +'<button onclick="ccAccederEspaceSaisie()" style="background:rgba(255,255,255,.25);border:none;color:#fff;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">✏️ Mon espace de saisie</button>';
    } else {
      gvNav.innerHTML='';
    }
  }
  if(role==='superadmin')renderSuperAdmin();
  else renderChefCorps();
}
function retourCaserne(){
  document.getElementById('global-view').style.display='none';
  document.getElementById('app').style.display='flex';
}

// ══════════════════════════════════════════════════════
// CONFIGURATION DES TYPES D'ENGINS (superadmin)
// ══════════════════════════════════════════════════════

function _trimLoginHistoryDeleted(){
  const entries=Object.entries(LOGIN_HISTORY_DELETED||{}).sort(function(a,b){return String(b[1]).localeCompare(String(a[1]));}).slice(0,2000);
  LOGIN_HISTORY_DELETED=Object.fromEntries(entries);
}
function deleteLoginHistoryEntries(ids){
  if(!isSuperAdmin()){showToast('Accès réservé au super-administrateur','warn');return;}
  const unique=[...new Set((ids||[]).filter(Boolean))];
  if(!unique.length){showToast('Aucune connexion sélectionnée','warn');return;}
  const deletedAt=new Date().toISOString();
  unique.forEach(function(id){LOGIN_HISTORY_DELETED[id]=deletedAt;});
  _trimLoginHistoryDeleted();
  const before=LOGIN_HISTORY.length;
  LOGIN_HISTORY=LOGIN_HISTORY.filter(function(entry){return!LOGIN_HISTORY_DELETED[entry.id];});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  showToast((before-LOGIN_HISTORY.length)+' connexion(s) supprimée(s)','success');
  renderSuperAdmin();
}
function deleteAllLoginHistory(){
  if(!isSuperAdmin()){showToast('Accès réservé au super-administrateur','warn');return;}
  if(!LOGIN_HISTORY.length){showToast('L’historique est déjà vide','info');return;}
  confirmModal('Effacer définitivement la totalité de l’historique des connexions ?',function(){
    deleteLoginHistoryEntries(LOGIN_HISTORY.map(function(entry){return entry.id;}));
  });
}
function updateLoginHistorySelectionCount(){
  const selected=[...document.querySelectorAll('.login-history-check:checked')];
  const btn=document.getElementById('login-history-delete-selected');
  if(btn){btn.disabled=!selected.length;btn.textContent='🗑️ Supprimer la sélection'+(selected.length?' ('+selected.length+')':'');}
  document.querySelectorAll('.login-history-group-all').forEach(function(all){
    const checks=[...all.closest('table').querySelectorAll('.login-history-check')];
    const selectedGroup=checks.filter(function(box){return box.checked;});
    all.checked=!!checks.length&&selectedGroup.length===checks.length;
    all.indeterminate=selectedGroup.length>0&&selectedGroup.length<checks.length;
  });
}
function toggleLoginHistoryGroupSelection(master){
  master.closest('table').querySelectorAll('.login-history-check').forEach(function(box){box.checked=master.checked;});
  updateLoginHistorySelectionCount();
}
function deleteSelectedLoginHistory(){
  if(!isSuperAdmin()){showToast('Accès réservé au super-administrateur','warn');return;}
  const ids=[...document.querySelectorAll('.login-history-check:checked')].map(function(box){return box.dataset.sessionId;}).filter(Boolean);
  if(!ids.length){showToast('Sélectionnez au moins une connexion','warn');return;}
  confirmModal('Supprimer définitivement les '+ids.length+' connexion(s) sélectionnée(s) ?',function(){deleteLoginHistoryEntries(ids);});
}

function normalizeLoginHistorySessions(){
  let changed=false;
  const now=Date.now();
  const byLogin={};
  LOGIN_HISTORY.forEach(function(entry){
    if(!entry)return;
    if(entry.hDeconnexion&&entry.actif){entry.actif=false;changed=true;}
    const key=entry.login||'';
    if(!byLogin[key])byLogin[key]=[];
    byLogin[key].push(entry);
  });
  Object.values(byLogin).forEach(function(entries){
    entries.sort(function(a,b){return String(b.hConnexion||'').localeCompare(String(a.hConnexion||''));});
    entries.forEach(function(entry,index){
      if(!entry.actif||entry.hDeconnexion)return;
      const started=new Date(entry.hConnexion||0).getTime();
      if(index>0){
        entry.actif=false;
        entry.hDeconnexion=entries[0].hConnexion||new Date().toISOString();
        entry.fermetureAuto='Remplacée par une connexion plus récente';
        changed=true;
      }else if(!Number.isFinite(started)||now-started>=SESSION_DURATION_MS){
        entry.actif=false;
        entry.hDeconnexion=Number.isFinite(started)?new Date(started+SESSION_DURATION_MS).toISOString():new Date().toISOString();
        entry.fermetureAuto='Session expirée automatiquement';
        changed=true;
      }
    });
  });
  return changed;
}

function isLoginHistorySessionActive(entry){
  if(!entry||!entry.actif||entry.hDeconnexion)return false;
  const started=new Date(entry.hConnexion||0).getTime();
  return Number.isFinite(started)&&Date.now()-started<SESSION_DURATION_MS;
}

function renderLoginHistoryAccount(group,colour){
  group.entries.sort(function(a,b){return String(b.hConnexion||'').localeCompare(String(a.hConnexion||''));});
  const fmt=function(value){
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('fr-FR')+' '+date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  };
  const latest=group.entries[0];
  const active=isLoginHistorySessionActive(latest);
  return '<div style="border:1px solid #eee;border-radius:10px;margin:8px 10px;overflow:hidden;background:#fff;">'
    +'<div style="background:#fafafa;padding:9px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">'
    +'<div style="flex:1;"><span style="font-weight:600;font-size:13px;">'+escHtml(group.prenom||'')+' '+escHtml(group.nom||'')+'</span>'
    +'<span style="font-family:monospace;font-size:11px;color:#999;margin-left:8px;">'+escHtml(group.login||'')+'</span></div>'
    +(active?'<span style="background:#ECFDF5;color:#065F46;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">🟢 Connecté</span>':'<span style="background:#F3F4F6;color:#6B7280;padding:2px 8px;border-radius:10px;font-size:11px;">Déconnecté</span>')
    +'<span style="font-size:11px;color:#999;">'+group.entries.length+' connexion(s)</span><span style="color:#aaa;">▼</span></div>'
    +'<div style="display:none;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;">'
    +'<thead><tr style="background:#f5f5f7;"><th style="padding:6px;width:34px;text-align:center;"><input type="checkbox" class="login-history-group-all" onchange="toggleLoginHistoryGroupSelection(this)" aria-label="Sélectionner toutes les connexions de ce compte"/></th>'
    +'<th style="padding:6px 12px;font-weight:600;text-align:left;">Connexion</th><th style="padding:6px 12px;font-weight:600;text-align:left;">Déconnexion</th><th style="padding:6px 12px;font-weight:600;text-align:left;">Statut</th></tr></thead><tbody>'
    +group.entries.map(function(entry){
      const online=isLoginHistorySessionActive(entry);
      const closure=entry.fermetureAuto?' title="'+escHtml(entry.fermetureAuto)+'"':'';
      return '<tr style="border-top:1px solid #f0f0f0;"><td style="padding:6px;text-align:center;"><input type="checkbox" class="login-history-check" data-session-id="'+escHtml(entry.id)+'" onchange="updateLoginHistorySelectionCount()" aria-label="Sélectionner cette connexion"/></td>'
        +'<td style="padding:6px 12px;color:#444;">'+fmt(entry.hConnexion)+'</td><td style="padding:6px 12px;color:#444;"'+closure+'>'+(entry.hDeconnexion?fmt(entry.hDeconnexion):'—')+'</td>'
        +'<td style="padding:6px 12px;">'+(online?'<span style="color:#065F46;font-weight:600;">🟢 En ligne</span>':'<span style="color:#9CA3AF;">Déconnecté</span>')+'</td></tr>';
    }).join('')
    +'</tbody></table></div></div>';
}

function renderLoginHistoryByCaserne(){
  if(!LOGIN_HISTORY.length)return '<div style="font-size:12px;color:#999;text-align:center;padding:20px;">Aucune connexion enregistrée</div>';
  const normalized=normalizeLoginHistorySessions();
  if(normalized)window.setTimeout(function(){saveData();},0);
  const caserneGroups={};
  LOGIN_HISTORY.forEach(function(entry){
    const caserneId=entry.caserneId||'_GLOBAL';
    if(!caserneGroups[caserneId]){
      const known=CASERNES.find(function(c){return c.id===caserneId;});
      caserneGroups[caserneId]={
        id:caserneId,
        name:entry.caserne||(known&&known.nom)||(caserneId==='_GLOBAL'?'Comptes globaux':'Caserne non renseignée'),
        colour:(known&&known.couleur)||'#64748B',
        entries:[],
        accounts:{}
      };
    }
    const caserne=caserneGroups[caserneId];
    caserne.entries.push(entry);
    const login=entry.login||'Compte inconnu';
    if(!caserne.accounts[login])caserne.accounts[login]={login:login,prenom:entry.prenom,nom:entry.nom,entries:[]};
    caserne.accounts[login].entries.push(entry);
  });
  return Object.values(caserneGroups).sort(function(a,b){return a.name.localeCompare(b.name,'fr');}).map(function(caserne){
    const accounts=Object.values(caserne.accounts).sort(function(a,b){
      return ((a.nom||'')+' '+(a.prenom||'')).localeCompare((b.nom||'')+' '+(b.prenom||''),'fr');
    });
    const activeCount=accounts.filter(function(account){
      account.entries.sort(function(a,b){return String(b.hConnexion||'').localeCompare(String(a.hConnexion||''));});
      return isLoginHistorySessionActive(account.entries[0]);
    }).length;
    return '<div style="border:1px solid '+caserne.colour+'55;border-radius:12px;margin-bottom:12px;overflow:hidden;">'
      +'<div style="background:'+caserne.colour+'12;padding:11px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">'
      +'<span style="width:10px;height:10px;border-radius:50%;background:'+caserne.colour+';"></span><strong style="font-size:13px;color:'+caserne.colour+';">'+escHtml(caserne.name)+'</strong>'
      +'<span style="font-size:11px;color:#64748B;">'+accounts.length+' compte(s) · '+caserne.entries.length+' connexion(s)</span>'
      +(activeCount?'<span style="margin-left:auto;background:#ECFDF5;color:#065F46;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">🟢 '+activeCount+' en ligne</span>':'<span style="margin-left:auto;font-size:11px;color:#94A3B8;">Aucune session en ligne</span>')
      +'<span style="color:#94A3B8;">▼</span></div><div>'
      +accounts.map(function(account){return renderLoginHistoryAccount(account,caserne.colour);}).join('')
      +'</div></div>';
  }).join('');
}

function renderSuperAdmin(){
  const repairedChefCorps=repairKnownChefCorpsAssignment();
  if(repairedChefCorps){
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    window.setTimeout(function(){saveData(true);showToast('Affectation du chef de corps restaur\u00e9e : Vincent Fabre.','success');},0);
  }
  const body=document.getElementById('gv-body');
  // Section gestion des comptes (admins casernes + chef de corps)
  const sa=getSuperAdminAccount();
  const cc=getChefCorpsAccount();
  const chefCorpsCandidates=getChefCorpsCandidates();
  const comptesHtml=`
    <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #eee;">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">&#x1F511; Gestion des accès
        <span style="font-size:11px;color:#999;font-weight:400;">Comptes spéciaux et administrateurs de casernes</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
        <!-- Compte superadmin -->
        <div style="background:#FEF2F2;border-radius:10px;padding:12px;border:1px solid #FECACA;">
          <div style="font-size:11px;font-weight:700;color:#C0392B;margin-bottom:6px;text-transform:uppercase;">⚡ Super Administrateur</div>
          <div style="font-size:13px;font-weight:600;">${sa.prenom} ${sa.nom}</div>
          <div style="font-size:11px;color:#666;font-family:monospace;margin:3px 0;">${sa.l}</div>
          <div style="font-size:11px;color:#666;">Caserne : ${CASERNES.find(c=>c.id===sa.caserneId)?.nom||'—'}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn sm" style="font-size:11px;" onclick="editCompteSpecial('superadmin')">✏️ Modifier</button>
            <select class="fi" style="font-size:11px;padding:3px 6px;flex:1;" onchange="changeSACaserne(this.value)">
              ${CASERNES.map(c=>`<option value="${c.id}"${c.id===sa.caserneId?' selected':''}>${c.nom}</option>`).join('')}
            </select>
          </div>
        </div>
        <!-- Compte chef de corps -->
        <div style="background:#EFF6FF;border-radius:10px;padding:12px;border:1px solid #BFDBFE;">
          <div style="font-size:11px;font-weight:700;color:#1D4ED8;margin-bottom:6px;text-transform:uppercase;">&#x1F396;️ Chef de Corps</div>
           <div style="font-size:13px;font-weight:600;">${cc.prenom} ${cc.nom}</div>
           <div style="font-size:11px;color:#666;font-family:monospace;margin:3px 0;">${cc.l}</div>
           <div style="font-size:11px;color:#999;">Espace : État-Major · Statistiques consolidées</div>
           <select class="fi" style="font-size:11px;padding:4px 6px;width:100%;margin-top:7px;" onchange="setChefCorpsAccount(this.value)">
             <option value="">— Désigner le chef de corps —</option>
             ${chefCorpsCandidates.map(u=>`<option value="${escHtml(u.l)}"${cc&&cc.l===u.l?' selected':''}>${escHtml((u.nom||'')+' '+(u.prenom||''))} · ${escHtml(u._sourceCaserneNom||'État-Major')}</option>`).join('')}
           </select>
           <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
             <button class="btn sm" style="font-size:11px;" onclick="editCompteSpecial('chef_corps')">&#x1F511; Modifier le mot de passe</button>
           </div>
           <div style="font-size:10px;color:#777;margin-top:4px;">Désignation unique, modifiable uniquement par le superadmin. Les identifiants actuels sont conservés.</div>
         </div>
        <!-- Admins casernes -->
        ${OP_CASERNES().map(c=>{
          const d=CASERNE_DATA[c.id]||{users:[]};
          const admin=getCaserneAdmin(c.id);
          const responsableFormation=d.users?.find(u=>u.responsableFormation===true);
          return `<div style="background:${c.couleur}11;border-radius:10px;padding:12px;border:1px solid ${c.couleur}33;">
            <div style="font-size:11px;font-weight:700;color:${c.couleur};margin-bottom:6px;text-transform:uppercase;">&#x1F6E1;️ Admin ${c.nom}</div>
            ${admin?`<div style="font-size:13px;font-weight:600;">${admin.prenom} ${admin.nom}</div>
              <div style="font-size:11px;color:#666;font-family:monospace;margin:3px 0;">${admin.l}</div>
              <button class="btn sm" style="font-size:11px;margin-top:6px;" onclick="editAdminCaserne('${c.id}')">&#x1F511; Modifier mot de passe</button>`
            :`<div style="font-size:12px;color:#999;">Aucun admin défini</div>`}
            <select class="fi" style="font-size:11px;padding:4px 6px;width:100%;margin-top:7px;" onchange="setCaserneAdmin('${c.id}',this.value)">
              <option value="">— Désigner l'administrateur —</option>
              ${[...(d.users||[])].filter(u=>!u._isSA).sort((a,b)=>(a.nom+' '+a.prenom).localeCompare(b.nom+' '+b.prenom,'fr')).map(u=>`<option value="${u.l}"${admin&&admin.l===u.l?' selected':''}>${u.nom} ${u.prenom}</option>`).join('')}
            </select>
            <div style="font-size:10px;color:#777;margin-top:4px;">Désignation unique, modifiable uniquement par le superadmin.</div>
            <div style="border-top:1px solid ${c.couleur}33;margin-top:10px;padding-top:9px;">
              <div style="font-size:10px;font-weight:700;color:#6D28D9;text-transform:uppercase;margin-bottom:5px;">🎓 Responsable formation</div>
              <select class="fi" style="font-size:11px;padding:4px 6px;width:100%;" onchange="setResponsableFormation('${c.id}',this.value)">
                <option value="">— Aucun responsable —</option>
                ${[...(d.users||[])].filter(u=>!u._isSA).sort((a,b)=>(a.nom+' '+a.prenom).localeCompare(b.nom+' '+b.prenom,'fr')).map(u=>`<option value="${u.l}"${responsableFormation&&responsableFormation.l===u.l?' selected':''}>${u.nom} ${u.prenom}</option>`).join('')}
              </select>
              <div style="font-size:10px;color:#777;margin-top:4px;">Profil rattaché à ${c.nom}, modifiable uniquement ici.</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  const casHtml=OP_CASERNES().map(c=>{
    const d=CASERNE_DATA[c.id]||{users:[],ivs:[],pilpIvs:[]};
    const nbUsers=d.users?.length||0;
    const nbIv=(d.ivs||[]).filter(isInterventionComptabilisee).length;
    return `<div style="background:#fff;border-radius:14px;padding:16px;border-left:4px solid ${c.couleur};">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="background:${c.couleur};color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${c.code}</span>
        <span style="font-size:15px;font-weight:700;">${c.nom}</span>
        <button class="btn sm" style="margin-left:auto;font-size:11px;background:${c.couleur};color:#fff;border-color:${c.couleur};" onclick="saAccederCaserne('${c.id}')">▶ Accéder</button>
        <button class="btn pr sm" style="font-size:11px;" onclick="editCaserne('${c.id}')">✏️</button>
        <button class="btn sm" style="font-size:11px;color:#E24B4A;" onclick="delCaserne('${c.id}')">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;">
        <div style="background:#f5f5f5;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:${c.couleur};">${nbUsers}</div>
          <div style="color:#666;">Pompiers</div>
        </div>
        <div style="background:#f5f5f5;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;">${nbIv}</div>
          <div style="color:#666;">Interventions</div>
        </div>
        <div style="background:#f5f5f5;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;">${(d.equipes||[]).length}</div>
          <div style="color:#666;">Équipes</div>
        </div>
      </div>
      <div style="margin-top:10px;">
        <div style="font-size:11px;font-weight:600;color:#666;margin-bottom:6px;">AGENTS</div>
        ${[...(d.users||[])].sort((a,b)=>(a.nom+' '+a.prenom).localeCompare(b.nom+' '+b.prenom,'fr')).slice(0,5).map(u=>`<div style="font-size:11px;padding:3px 0;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;"><span style="font-weight:500;">${u.nom} ${u.prenom}</span><span style="color:#999;">${u.grade||''}</span></div>`).join('')}
        ${nbUsers>5?`<div style="font-size:11px;color:#999;margin-top:4px;">+ ${nbUsers-5} autres</div>`:''}
      </div>
      <div style="margin-top:10px;border-top:1px solid #f0f0f0;padding-top:10px;">
        <div style="font-size:11px;font-weight:600;color:#666;margin-bottom:6px;">&#x2709;&#xFE0F; E-MAIL GÉNÉRIQUE</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <input class="fi" type="email" id="email-${c.id}" value="${c.email||''}" placeholder="caserne@exemple.fr" style="flex:1;font-size:11px;padding:4px 8px;"/>
          <button class="btn sm" style="font-size:11px;" onclick="saSaveEmail('${c.id}')">&#x1F4BE; OK</button>
        </div>
      </div>
    </div>`;
  }).join('');
  const etatMajor=CASERNES.find(c=>c.id==='EMAJ')||{id:'EMAJ',nom:'État-Major',couleur:'#1D4ED8'};
  const etatMajorData=CASERNE_DATA.EMAJ||{ivs:[],activites:[],formations:[]};
  const etatMajorHtml=`<div style="background:#EFF6FF;border-radius:14px;padding:16px;border-left:4px solid ${etatMajor.couleur};border-top:1px solid #BFDBFE;border-right:1px solid #BFDBFE;border-bottom:1px solid #BFDBFE;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
      <span style="background:${etatMajor.couleur};color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">ÉTAT-MAJOR</span>
      <span style="font-size:15px;font-weight:700;">Espace du chef de corps</span>
      <button class="btn sm" style="margin-left:auto;font-size:11px;background:${etatMajor.couleur};color:#fff;border-color:${etatMajor.couleur};" onclick="saAccederEtatMajor()">▶ Accéder à l'espace</button>
    </div>
    <div style="background:#fff;border:1px solid #DBEAFE;border-radius:10px;padding:10px;margin-bottom:10px;">
      <div style="font-size:10px;font-weight:700;color:#1D4ED8;text-transform:uppercase;margin-bottom:4px;">Chef de corps désigné</div>
      <div style="font-size:13px;font-weight:600;">${cc?escHtml(fullName(cc)):'Aucun chef de corps désigné'}</div>
      ${cc?`<div style="font-size:11px;color:#64748B;font-family:monospace;margin-top:2px;">${escHtml(cc.l||'')}</div>`:''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;">
      <div style="background:#fff;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:22px;font-weight:700;color:${etatMajor.couleur};">${(etatMajorData.ivs||[]).filter(isInterventionComptabilisee).length}</div><div style="color:#666;">Interventions</div></div>
      <div style="background:#fff;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:22px;font-weight:700;">${(etatMajorData.activites||[]).length}</div><div style="color:#666;">Activités</div></div>
      <div style="background:#fff;border-radius:8px;padding:8px;text-align:center;"><div style="font-size:22px;font-weight:700;">${(etatMajorData.formations||[]).length}</div><div style="color:#666;">Formations</div></div>
    </div>
    <div style="margin-top:10px;border-top:1px solid #BFDBFE;padding-top:10px;">
      <div style="font-size:11px;font-weight:600;color:#1D4ED8;margin-bottom:6px;">&#x2709;&#xFE0F; E-MAIL GÉNÉRIQUE</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input class="fi" type="email" id="email-EMAJ" value="${escHtml(etatMajor.email||'')}" placeholder="etat-major@exemple.fr" style="flex:1;font-size:11px;padding:6px 8px;min-width:0;"/>
        <button class="btn sm" style="font-size:11px;background:${etatMajor.couleur};color:#fff;border-color:${etatMajor.couleur};" onclick="saSaveEmail('EMAJ')">&#x1F4BE; Enregistrer</button>
      </div>
    </div>
    <div style="font-size:10px;color:#64748B;margin-top:9px;">Cet espace est distinct des casernes opérationnelles et ne possède pas d'administrateur de caserne.</div>
  </div>`;
  body.innerHTML=`
    ${comptesHtml}
    <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #eee;">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">⚙️ Paramètres globaux de numérotation
        <span style="font-size:11px;color:#999;font-weight:400;">Transition et démarrage en cours d'année</span>
      </div>
      <!-- Toggle CABBALR -->
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:12px;margin-bottom:12px;display:flex;align-items:center;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:#15803D;">🔢 Numérotation Inter CABBALR</div>
          <div style="font-size:11px;color:#666;margin-top:2px;">Désactiver pendant la période où toutes les casernes ne sont pas encore sur AGAI.</div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="sa-cabbalr-toggle" ${CASERNE_DATA._cabbalrActif!==false?'checked':''} onchange="saToggleCabbalr(this.checked)" style="width:18px;height:18px;accent-color:#15803D;">
          <span style="font-size:12px;font-weight:600;" id="sa-cabbalr-lbl">${CASERNE_DATA._cabbalrActif!==false?'Activé':'Désactivé'}</span>
        </label>
      </div>
      <!-- Valeur de départ CABBALR (globale) -->
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:12px;margin-bottom:12px;display:flex;align-items:center;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:600;color:#15803D;">Valeur de départ Inter CABBALR (globale)</div>
          <div style="font-size:11px;color:#666;">Numéro à partir duquel les nouvelles interventions s'incrémentent (toutes casernes).</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <input class="fi" type="number" min="0" id="init-cabbalr-global" value="${CASERNE_DATA._initCabbalr||0}" style="width:90px;font-size:13px;padding:4px 8px;font-weight:700;">
          <button class="btn sm" style="background:#15803D;color:#fff;border-color:#15803D;font-size:11px;" onclick="saSaveCabbalrGlobal()">💾 OK</button>
        </div>
      </div>
      <!-- Init par caserne : UT, mois, stats -->
      <div style="font-size:12px;font-weight:600;color:#666;margin-bottom:8px;">📋 Initialisation par caserne (démarrage en cours d'année)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px;">
        ${OP_CASERNES().map(c=>{
          const d=CASERNE_DATA[c.id]||{};
          const init=d._initCompteurs||{};
          const ivsInit=init.ivsParNature||[];
          return `<div style="background:#F8F9FA;border-radius:10px;padding:12px;border:1px solid #E5E7EB;">
            <div style="font-size:12px;font-weight:700;color:${c.couleur};margin-bottom:8px;">📍 ${c.nom}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
              <div>
                <div style="font-size:10px;color:#666;margin-bottom:2px;">Inter UT (départ année)</div>
                <input class="fi" type="number" min="0" id="init-ut-${c.id}" value="${init.ut||0}" style="font-size:11px;padding:3px 6px;">
              </div>
              <div>
                <div style="font-size:10px;color:#666;margin-bottom:2px;">Inter mois (départ mois)</div>
                <input class="fi" type="number" min="0" id="init-mois-${c.id}" value="${init.mois||0}" style="font-size:11px;padding:3px 6px;">
              </div>
              <div>
                <div style="font-size:10px;color:#666;margin-bottom:2px;">Activités service (heures)</div>
                <input class="fi" type="number" min="0" id="init-act-${c.id}" value="${init.actHeures||0}" style="font-size:11px;padding:3px 6px;">
              </div>
              <div>
                <div style="font-size:10px;color:#666;margin-bottom:2px;">Formations (heures)</div>
                <input class="fi" type="number" min="0" id="init-form-${c.id}" value="${init.formHeures||0}" style="font-size:11px;padding:3px 6px;">
              </div>
            </div>
            <!-- Interventions par commune / nature -->
            <div style="font-size:11px;font-weight:600;color:#555;margin-bottom:6px;border-top:1px solid #E5E7EB;padding-top:8px;">
              🗺️ Interventions passées par commune / nature
              <button class="btn sm" style="font-size:10px;margin-left:6px;" onclick="saAddIvInit('${c.id}')">+ Ajouter</button>
            </div>
            <div id="iv-init-list-${c.id}">
              ${ivsInit.map((r,i)=>`<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;" id="iv-init-row-${c.id}-${i}">
                <select class="fi" style="flex:2;font-size:10px;padding:2px 4px;" id="iv-init-com-${c.id}-${i}">
                  <option value="">-- Commune --</option>
                  ${COM.map(cc=>`<option value="${cc.nom}"${cc.nom===r.commune?' selected':''}>${cc.nom}</option>`).join('')}
                </select>
                <select class="fi" style="flex:2;font-size:10px;padding:2px 4px;" id="iv-init-nat-${c.id}-${i}">
                  <option value="">-- Nature --</option>
                  ${NAT.map(n=>`<option value="${n.l}"${n.l===r.nature?' selected':''}>${n.i} ${n.l}</option>`).join('')}
                </select>
                <input class="fi" type="number" min="1" style="width:52px;font-size:10px;padding:2px 4px;" value="${r.nb||1}" id="iv-init-nb-${c.id}-${i}">
                <button class="btn sm danger" style="font-size:10px;padding:1px 5px;" onclick="saRemIvInit('${c.id}',${i})">✕</button>
              </div>`).join('')}
            </div>
            <button class="btn sm" style="font-size:11px;width:100%;margin-top:6px;background:${c.couleur};color:#fff;border-color:${c.couleur};" onclick="saSaveInitCompteurs('${c.id}')">💾 Enregistrer</button>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #eee;">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:8px;">&#x1F510; Déconnexion automatique</div>
      <div style="font-size:12px;color:#666;margin-bottom:12px;">Délai d'inactivité en arrière-plan (app quittée, écran verrouillé) avant déconnexion. 0 = désactivé.</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" id="sa-bglogout" min="0" max="480" value="15" style="width:90px;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px;text-align:center;"/>
        <span style="font-size:13px;color:#444;">minutes</span>
        <button class="btn pr sm" style="margin-left:auto;" onclick="saSaveBgLogout()">💾 Enregistrer</button>
      </div>
    </div>
    <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #eee;">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:8px;">&#x1F50E; Diagnostic d'affichage</div>
      <div style="font-size:12px;color:#666;margin-bottom:12px;">Surligne en rouge les éléments qui dépassent la largeur de l'écran. Utile pour signaler précisément un problème d'affichage sur un appareil.</div>
      <button id="sa-diag-btn" class="btn pr sm" onclick="toggleDiagAffichage()">🔎 Diagnostiquer l'affichage</button>
    </div>
    <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #eee;">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:8px;">&#x1F692; Types d'engins</div>
      <div style="font-size:12px;color:#666;margin-bottom:12px;">Définissez le nombre de places et les rôles de chaque type d'engin (VTU, VPI, VL…). Appliqué à tous les engins de ce type.</div>
      <div id="sa-engin-types"></div>
    </div>
    <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #eee;">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">&#x1F4C5; Jours fériés
        <span style="font-size:11px;color:#999;font-weight:400;">Calendrier français — calculé dynamiquement</span>
        <select id="sa-feries-annee" style="margin-left:auto;padding:3px 8px;border-radius:6px;border:1px solid #ccc;font-size:12px;" onchange="renderJoursFeries(this.value)">${
          Array.from({length:5},function(_,i){const y=new Date().getFullYear()-1+i;return'<option value="'+y+'"'+(y===new Date().getFullYear()?' selected':'')+'>'+y+'</option>';}).join('')
        }</select>
      </div>
      <div id="sa-feries-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;"></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <h2 style="font-size:18px;font-weight:700;">Casernes</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" style="font-size:12px;" onclick="saAccederChefCorps()">&#x1F396;️ Vue chef de corps</button>
        <button class="btn" style="font-size:12px;" onclick="showReferentiel()">&#x1F4CB; Référentiel</button>
        <button class="btn" style="font-size:12px;" onclick="showAstrTelParams()">📞 Paramètres astreinte tél.</button>
        <button class="btn" style="font-size:12px;" onclick="showReferentiel('taux')">📊 Référentiels rapports et taux</button>
        <button class="btn pr" onclick="addCaserne()">+ Nouvelle caserne</button>
        <button class="btn pr" onclick="addSuperAdmin()">+ Super Admin</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;">${etatMajorHtml}${casHtml}</div>
    <div style="margin-top:20px;background:#fff;border-radius:14px;padding:16px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;">Statistiques globales</h3>
      ${renderGlobalStats()}
    </div>
    <div style="margin-top:20px;background:#fff;border-radius:14px;padding:16px;border:1px solid #eee;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:4px;">&#x1F5BC;&#xFE0F; Logo des documents (Autorisation / Attestation)</h3>
      <div style="font-size:12px;color:#666;margin-bottom:12px;">Ce logo apparaît en haut à gauche de l'autorisation et de l'attestation d'intervention. Taille recommandée : 1,5 cm de haut × 6 cm de large.</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="border:1px solid #eee;border-radius:8px;padding:8px;background:#f9f9f9;min-width:80px;min-height:40px;display:flex;align-items:center;justify-content:center;">
          <img id="sa-logo-preview" src="" style="height:42px;max-width:170px;object-fit:contain;display:none;">
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <label class="btn sm" style="cursor:pointer;background:#185FA5;color:#fff;border-color:#185FA5;">
            &#x1F4C2; Choisir un nouveau logo
            <input type="file" id="sa-logo-input" accept="image/*" style="display:none;" onchange="saUploadLogo(this)">
          </label>
          <div style="font-size:11px;color:#888;">PNG, JPG, SVG acceptés — max 500 Ko</div>
        </div>
      </div>
      <div id="sa-logo-status" style="margin-top:8px;font-size:12px;"></div>
    </div>
    <div style="margin-top:20px;background:#fff;border-radius:14px;padding:16px;border:1px solid #eee;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:4px;">&#x1F43E; Email fourrière (prise en charge animal)</h3>
      <div style="font-size:12px;color:#666;margin-bottom:10px;">Adresse email de la fourrière pour l'envoi automatique des attestations de prise en charge.</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input class="fi" type="email" id="sa-fourriere-email" placeholder="fourriere@exemple.fr" style="flex:1;" value="${(CASERNE_DATA._global&&CASERNE_DATA._global._emailFourriere)||''}"/>
        <button class="btn sm" onclick="saSaveFourriereEmail()">&#x1F4BE; Sauvegarder</button>
      </div>
    </div>
    <div style="margin-top:20px;background:#fff;border-radius:14px;padding:16px;border:1px solid #eee;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <h3 style="font-size:15px;font-weight:700;margin:0;">🔐 Historique des connexions</h3>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button class="btn sm danger" id="login-history-delete-selected" onclick="deleteSelectedLoginHistory()" disabled>🗑️ Supprimer la sélection</button>
          <button class="btn sm danger" onclick="deleteAllLoginHistory()">🧹 Tout effacer</button>
        </div>
      </div>
      ${renderLoginHistoryByCaserne()}
    </div>
    <div style="margin-top:20px;background:#FEF2F2;border-radius:14px;padding:16px;border:1px solid #FECACA;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:4px;color:#C0392B;">⚠️ Zone dangereuse — Gestion des interventions</h3>
      <div style="font-size:12px;color:#666;margin-bottom:12px;">Ces actions sont irr\u00e9versibles. \u00c0 utiliser avec pr\u00e9caution.</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${CASERNES.map(c=>`
          <div style="background:#fff;border-radius:10px;padding:12px;border:1px solid #FECACA;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-size:13px;font-weight:600;">${c.nom}</div>
              <div style="font-size:11px;color:#666;">${(CASERNE_DATA[c.id]?.ivs||[]).length} intervention(s) enregistr\u00e9e(s)</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn sm" style="background:#fff;border:1px solid #E24B4A;color:#E24B4A;font-size:11px;" onclick="saDeleteIvModal('${c.id}')">&#x1F5D1;️ Supprimer des interventions</button>
              <button class="btn sm" style="background:#E24B4A;color:#fff;font-size:11px;" onclick="saResetIvs('${c.id}')">⚠️ Remettre à zéro toutes les interventions</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  // Initialise la prévisualisation du logo
  const _lprev=document.getElementById('sa-logo-preview');
  if(_lprev){_lprev.src=_getLogoSrc();_lprev.style.display='block';}
  // Rendu de la configuration des types d'engins
  try{renderEnginTypes();}catch(e){}
  try{
    const _bg=document.getElementById('sa-bglogout');
    if(_bg)_bg.value=(ASTR_CONFIG&&typeof ASTR_CONFIG.bgLogoutMin==='number')?ASTR_CONFIG.bgLogoutMin:15;
  }catch(e){}
}


function saUploadLogo(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 512000) {
    document.getElementById('sa-logo-status').innerHTML = '<span style="color:#C0392B;">&#x274C; Fichier trop lourd (max 500 Ko)</span>';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    // Extract base64 and mime type
    const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return;
    // Store in CASERNE_DATA global config
    if (!CASERNE_DATA._global) CASERNE_DATA._global = {};
    CASERNE_DATA._global.logoB64 = m[2];
    CASERNE_DATA._global.logoMime = m[1];
    // Update runtime constant
    window._LOGO_OVERRIDE = dataUrl;
    // Update preview
    const prev = document.getElementById('sa-logo-preview');
    if (prev) { prev.src = dataUrl; prev.style.display = 'block'; }
    saveData();
    document.getElementById('sa-logo-status').innerHTML = '<span style="color:#27AE60;">&#x2705; Logo mis à jour et sauvegardé</span>';
  };
  reader.readAsDataURL(file);
}

function _getLogoSrc() {
  // Returns the current logo dataURL (custom override or built-in)
  if (window._LOGO_OVERRIDE) return window._LOGO_OVERRIDE;
  if (CASERNE_DATA._global && CASERNE_DATA._global.logoB64) {
    return 'data:' + (CASERNE_DATA._global.logoMime || 'image/jpeg') + ';base64,' + CASERNE_DATA._global.logoB64;
  }
  return 'data:image/jpeg;base64,' + LOGO_IMG_B64;
}


function saToggleCabbalr(val){
  CASERNE_DATA._cabbalrActif=val;
  const lbl=document.getElementById('sa-cabbalr-lbl');
  if(lbl)lbl.textContent=val?'Activé':'Désactivé';
  saveData();
  showToast('Inter CABBALR '+(val?'activée':'désactivée'),'success');
}
function saSaveCabbalrGlobal(){
  const val=parseInt(document.getElementById('init-cabbalr-global')?.value)||0;
  CASERNE_DATA._initCabbalr=val;
  saveData();
  showToast('Valeur de départ CABBALR enregistrée : '+val,'success');
}
function saSaveInitCompteurs(cid){
  if(!CASERNE_DATA[cid])CASERNE_DATA[cid]={};
  // Récupérer les lignes commune/nature
  const list=CASERNE_DATA[cid]._initCompteurs?.ivsParNature||[];
  const ivsParNature=list.map(function(_,i){
    const com=(document.getElementById('iv-init-com-'+cid+'-'+i)||{}).value||'';
    const nat=(document.getElementById('iv-init-nat-'+cid+'-'+i)||{}).value||'';
    const nb=parseInt((document.getElementById('iv-init-nb-'+cid+'-'+i)||{}).value)||1;
    return {commune:com,nature:nat,nb:nb};
  }).filter(function(r){return r.commune||r.nature;});
  CASERNE_DATA[cid]._initCompteurs={
    ut:parseInt(document.getElementById('init-ut-'+cid)?.value)||0,
    mois:parseInt(document.getElementById('init-mois-'+cid)?.value)||0,
    actHeures:parseInt(document.getElementById('init-act-'+cid)?.value)||0,
    formHeures:parseInt(document.getElementById('init-form-'+cid)?.value)||0,
    ivsParNature:ivsParNature,
  };
  saveData();
  showToast('Initialisations enregistrées pour '+cid,'success');
}
function saAddIvInit(cid){
  if(!CASERNE_DATA[cid])CASERNE_DATA[cid]={};
  if(!CASERNE_DATA[cid]._initCompteurs)CASERNE_DATA[cid]._initCompteurs={};
  if(!CASERNE_DATA[cid]._initCompteurs.ivsParNature)CASERNE_DATA[cid]._initCompteurs.ivsParNature=[];
  // Sauvegarder l'état actuel avant d'ajouter
  saSaveInitCompteurs(cid);
  CASERNE_DATA[cid]._initCompteurs.ivsParNature.push({commune:'',nature:'',nb:1});
  saveData();
  renderSuperAdmin();
}
function saRemIvInit(cid,idx){
  saSaveInitCompteurs(cid);
  CASERNE_DATA[cid]._initCompteurs.ivsParNature.splice(idx,1);
  saveData();
  renderSuperAdmin();
}
function cabbalrActif(){return CASERNE_DATA._cabbalrActif!==false;}

function saSaveEmail(cid) {
  const input = document.getElementById('email-' + cid);
  if (!input) return;
  const email = input.value.trim();
  const cas = CASERNES.find(function(c){return c.id===cid;});
  if (!cas) return;
  cas.email = email;
  saveData();
  showToast('E-mail sauvegardé pour ' + cas.nom, 'success');
}


function saSaveFourriereEmail(){
  const email=(document.getElementById('sa-fourriere-email')||{}).value||'';
  if(!CASERNE_DATA._global)CASERNE_DATA._global={};
  CASERNE_DATA._global._emailFourriere=email;
  saveData();
  showToast('Email fourrière sauvegardé','success');
}

function saResetIvs(cid){
  if(!window.confirm('⚠️ Supprimer TOUTES les interventions de cette caserne ? Cette action est irréversible.')){return;}
  const d=CASERNE_DATA[cid];if(!d)return;
  const allIvIds=(d.ivs||[]).map(function(iv){return iv.id;});
  const allPilpIds=(d.pilpIvs||[]).map(function(iv){return iv.id;});
  d.ivs=[];d.pilpIvs=[];
  if(cid===CURRENT_CASERNE_ID){IVS=[];PILP_IVS=[];}
  if(USE_RECORDS){_rcMarkDeleted(cid,'iv',allIvIds);_rcMarkDeleted(cid,'pilp',allPilpIds);}
  saveData();cM();
  saPostDeleteRefresh(cid);
  showToast('Toutes les interventions ont été supprimées','success');
}

function saPostDeleteRefresh(cid){
  // Recharger les variables globales si la caserne supprimée est la caserne active
  if(CURRENT_CASERNE_ID===cid)syncCaserneContext();
  // Mettre à jour tous les affichages concernés
  renderSuperAdmin();
  rAccueil();
  rStatsHeader();
  // Réinitialiser les stats si on y est
  if(stVue)try{rStats();}catch(e){}
  // Réinitialiser la liste des interventions
  try{rI();}catch(e){}
}

function saDeleteIvModal(cid){
  const d=CASERNE_DATA[cid];if(!d)return;
  const cas=CASERNES.find(c=>c.id===cid);
  const ivs=[...(d.ivs||[]),...(d.pilpIvs||[])].sort(function(a,b){return (b.h||'').localeCompare(a.h||'');});
  if(!ivs.length){showToast('Aucune intervention pour cette caserne.','warn');return;}
  document.getElementById('mt').textContent='Supprimer des interventions — '+(cas?cas.nom:cid);
  document.getElementById('mi').textContent='';
  const listHtml=ivs.slice(0,100).map(function(iv){
    const date=iv.h?iv.h.slice(0,4)+'-'+iv.h.slice(4,6)+'-'+iv.h.slice(6,8):'?';
    const heure=iv.h&&iv.h.length>9?iv.h.slice(9,11)+':'+iv.h.slice(11,13):'';
    return '<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-bottom:1px solid #f5f5f5;cursor:pointer;">'
      +'<input type="checkbox" class="sa-iv-chk" value="'+iv.id+'" style="accent-color:#E24B4A;"/>'
      +'<span style="font-size:11px;flex:1;"><strong>'+date+(heure?' '+heure:'')+'</strong> '+(iv.id.startsWith('PILP')?'🎯 ':'')+(iv.n||'')+(iv.com?' — '+iv.com:'')+'</span>'
      +'<span style="font-size:10px;color:#999;">'+iv.s+'</span>'
      +'</label>';
  }).join('');
  document.getElementById('mb').innerHTML=
    '<div>'
    +(ivs.length>100?'<div style="font-size:11px;color:var(--amb);margin-bottom:6px;">Affichage limité aux 100 dernières. Utilisez "Remettre à zéro" pour tout supprimer.</div>':'')
    +'<div style="display:flex;gap:8px;margin-bottom:8px;">'
    +'<button class="btn sm" onclick="document.querySelectorAll(\'.sa-iv-chk\').forEach(c=>c.checked=true)">Tout sélectionner</button>'
    +'<button class="btn sm" onclick="document.querySelectorAll(\'.sa-iv-chk\').forEach(c=>c.checked=false)">Tout décocher</button>'
    +'</div>'
    +'<div style="max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:8px;">'+listHtml+'</div>'
    +'<div class="brow" style="margin-top:10px;">'
    +'<button class="btn sm" style="background:#E24B4A;color:#fff;" onclick="saConfirmDeleteIvs(\''+cid+'\')">&#x1F5D1;️ Supprimer la sélection</button>'
    +'<button class="btn sm" onclick="cM()">Annuler</button>'
    +'</div></div>';
  document.getElementById('mo').style.display='flex';
}

function saConfirmDeleteIvs(cid){
  const checked=Array.from(document.querySelectorAll('.sa-iv-chk:checked')).map(function(c){return c.value;});
  if(!checked.length){showToast('Aucune intervention sélectionnée.','warn');return;}
  const d=CASERNE_DATA[cid];if(!d)return;
  if(!window.confirm('Supprimer '+checked.length+' intervention(s) ? Cette action est irréversible.')){return;}
  // Séparer ivs et pilpIvs supprimées pour marquer deleted dans records
  const delIvs=(d.ivs||[]).filter(function(iv){return checked.includes(iv.id);}).map(function(iv){return iv.id;});
  const delPilp=(d.pilpIvs||[]).filter(function(iv){return checked.includes(iv.id);}).map(function(iv){return iv.id;});
  d.ivs=(d.ivs||[]).filter(function(iv){return !checked.includes(iv.id);});
  d.pilpIvs=(d.pilpIvs||[]).filter(function(iv){return !checked.includes(iv.id);});
  if(cid===CURRENT_CASERNE_ID){IVS=d.ivs;PILP_IVS=d.pilpIvs;}
  if(USE_RECORDS){_rcMarkDeleted(cid,'iv',delIvs);_rcMarkDeleted(cid,'pilp',delPilp);}
  saveData();cM();saPostDeleteRefresh(cid);
  showToast(checked.length+' intervention(s) supprimée(s)','success');
}

function renderGlobalStats(){
  const annee=new Date().getFullYear();
  const mois=new Date().getMonth()+1;
  const moisStr=annee+'-'+String(mois).padStart(2,'0');
  const globalCasernes=OP_CASERNES();
  const rows=globalCasernes.map(c=>{
    const d=CASERNE_DATA[c.id]||{ivs:[]};
    const ivs=(d.ivs||[]).filter(iv=>!iv._isPilip&&isInterventionComptabilisee(iv));
    const nbAnn=ivs.filter(iv=>statsInterventionInPeriod(iv,String(annee))).length;
    const nbMois=ivs.filter(iv=>statsInterventionInPeriod(iv,moisStr.replace('-',''))).length;
    const nbJour=ivs.filter(iv=>statsInterventionInPeriod(iv,String(annee)+String(mois).padStart(2,'0')+String(new Date().getDate()).padStart(2,'0'))).length;
    return `<tr>
      <td style="padding:8px;font-weight:500;"><span style="background:${c.couleur};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">${c.code}</span> ${c.nom}</td>
      <td style="padding:8px;text-align:center;font-weight:700;">${nbJour}</td>
      <td style="padding:8px;text-align:center;font-weight:700;">${nbMois}</td>
      <td style="padding:8px;text-align:center;font-weight:700;">${nbAnn}</td>
    </tr>`;
  }).join('');
  const totD=globalCasernes.reduce((s,c)=>{const d=CASERNE_DATA[c.id]||{ivs:[]};return s+(d.ivs||[]).filter(iv=>!iv._isPilip&&isInterventionComptabilisee(iv)&&statsInterventionInPeriod(iv,String(annee)+String(mois).padStart(2,'0')+String(new Date().getDate()).padStart(2,'0'))).length;},0);
  const totM=globalCasernes.reduce((s,c)=>{const d=CASERNE_DATA[c.id]||{ivs:[]};return s+(d.ivs||[]).filter(iv=>!iv._isPilip&&isInterventionComptabilisee(iv)&&statsInterventionInPeriod(iv,moisStr.replace('-',''))).length;},0);
  const totA=globalCasernes.reduce((s,c)=>{const d=CASERNE_DATA[c.id]||{ivs:[]};return s+(d.ivs||[]).filter(iv=>!iv._isPilip&&isInterventionComptabilisee(iv)&&statsInterventionInPeriod(iv,String(annee))).length;},0);
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#f5f5f5;">
      <th style="padding:8px;text-align:left;">Caserne</th>
      <th style="padding:8px;text-align:center;">Aujourd'hui</th>
      <th style="padding:8px;text-align:center;">Ce mois</th>
      <th style="padding:8px;text-align:center;">Cette année</th>
    </tr></thead>
    <tbody>${rows}
    <tr style="background:#1c1c1e;color:#fff;font-weight:700;">
      <td style="padding:8px;">TOTAL</td>
      <td style="padding:8px;text-align:center;">${totD}</td>
      <td style="padding:8px;text-align:center;">${totM}</td>
      <td style="padding:8px;text-align:center;">${totA}</td>
    </tr></tbody>
  </table>`;
}

let ccAnnee=new Date().getFullYear();
let ccMois=0;
let ccVue='annuel';
let ccCaserne='all';

const MOIS_NOMS=['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];

function renderChefCorps(){
  const body=document.getElementById('gv-body');
  if(!body)return;
  body.innerHTML='<div id="cc-nav"></div><div id="cc-body"></div>';
  renderChefCorpsBody();
}

function getIvsForCC(){
  const annStr=String(ccAnnee);
  const prefix=ccMois>0?annStr+String(ccMois).padStart(2,'0'):annStr;
  const cas=ccCaserne==='all'?OP_CASERNES():OP_CASERNES().filter(function(c){return c.id===ccCaserne;});
  const all=[];
  cas.forEach(function(c){
    const d=CASERNE_DATA[c.id]||{ivs:[]};
    (d.ivs||[]).filter(function(iv){return !iv._isPilip&&isInterventionComptabilisee(iv)&&statsInterventionInPeriod(iv,prefix);})
      .forEach(function(iv){all.push(Object.assign({},iv,{_casId:c.id,_casNom:c.nom,_casCouleur:c.couleur}));});
  });
  return all;
}

function renderChefCorpsBody(){
  // Reconstruire la nav avec l'état courant des boutons
  const nav=document.getElementById('cc-nav');
  if(nav){
    const vues=[['annuel','Annuel'],['nat-mois','Nature/mois'],['com-mois','Commune/mois'],['nat-com','Nature\u00d7Commune']];
    const btnHtml=vues.map(function(vl){
      const v=vl[0],l=vl[1],actif=ccVue===v;
      return '<button onclick="ccVue=\''+v+'\';if(ccVue===\'annuel\')ccMois=0;renderChefCorpsBody()" style="padding:5px 11px;border-radius:8px;border:1px solid #ccc;cursor:pointer;font-size:11px;font-weight:'+(actif?'700':'400')+';background:'+(actif?'#C0392B':'#f5f5f5')+';color:'+(actif?'#fff':'#333')+';">'+l+'</button>';
    }).join('');
    const moisOpts='<option value="0">Toute l\u2019ann\u00e9e</option>'+MOIS_NOMS.map(function(m,i){
      return '<option value="'+(i+1)+'"'+(ccMois===i+1?' selected':'')+'>'+m+'</option>';
    }).join('');
    const casOpts='<option value="all">Toutes les casernes</option>'+OP_CASERNES().map(function(c){
      return '<option value="'+c.id+'"'+(ccCaserne===c.id?' selected':'')+'>'+c.nom+'</option>';
    }).join('');
    nav.innerHTML='<div style="background:#fff;border-radius:12px;padding:10px 14px;border:1px solid #ddd;margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      +'<button onclick="ccAnnee--;ccMois=0;renderChefCorpsBody()" style="background:#f5f5f5;border:1px solid #ddd;border-radius:8px;padding:5px 12px;cursor:pointer;">&larr;</button>'
      +'<span style="font-size:16px;font-weight:700;min-width:50px;text-align:center;">'+ccAnnee+'</span>'
      +'<button onclick="ccAnnee++;ccMois=0;renderChefCorpsBody()" style="background:#f5f5f5;border:1px solid #ddd;border-radius:8px;padding:5px 12px;cursor:pointer;">&rarr;</button>'
      +'<select onchange="ccMois=parseInt(this.value);if(ccVue===\'annuel\'&&ccMois>0)ccVue=\'nat-mois\';renderChefCorpsBody()" style="padding:5px 10px;border-radius:8px;border:1px solid #ddd;font-size:12px;">'+moisOpts+'</select>'
      +'<div style="display:flex;gap:3px;flex-wrap:wrap;">'+btnHtml+'</div>'
      +'<select onchange="ccCaserne=this.value;renderChefCorpsBody()" style="padding:5px 10px;border-radius:8px;border:1px solid #ddd;font-size:12px;">'+casOpts+'</select>'
      +'</div>';
  }
  const body=document.getElementById('cc-body');if(!body)return;
  const ivs=getIvsForCC();
  const total=ivs.length;
  const cas=ccCaserne==='all'?OP_CASERNES():OP_CASERNES().filter(function(c){return c.id===ccCaserne;});
  const periodeLabel=ccMois>0?MOIS_NOMS[ccMois-1]+' '+ccAnnee:String(ccAnnee);

  // Carte total + cartes par caserne
  let cartes='<div style="background:var(--t);color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">'
    +'<div style="font-size:12px;opacity:.8;">'+periodeLabel+'</div>'
    +'<div style="font-size:32px;font-weight:700;">'+total+'</div>'
    +'<div style="font-size:11px;opacity:.7;">intervention'+(total>1?'s':'')+'</div></div>';
  cartes+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px;">'
    +cas.map(function(c){const nb=ivs.filter(function(iv){return iv._casId===c.id;}).length;
      return '<div style="background:#fff;border-radius:10px;padding:10px;text-align:center;border-left:4px solid '+c.couleur+';">'
        +'<div style="font-size:22px;font-weight:700;color:'+c.couleur+';">'+nb+'</div>'
        +'<div style="font-size:10px;color:var(--t2);margin-top:2px;">'+c.nom+'</div></div>';}).join('')+'</div>';

  let html='';

  if(ccVue==='annuel'){
    // Tableau mois × casernes — clic sur un mois → nat-mois
    let rows='';
    MOIS_NOMS.forEach(function(nom,mi){
      const mStr=String(ccAnnee)+String(mi+1).padStart(2,'0');
      const nbTot=ivs.filter(function(iv){return statsInterventionInPeriod(iv,mStr);}).length;
      const cols=cas.map(function(c){const nb=ivs.filter(function(iv){return iv._casId===c.id&&statsInterventionInPeriod(iv,mStr);}).length;return '<td style="padding:6px 8px;text-align:center;">'+(nb||'—')+'</td>';}).join('');
      rows+='<tr style="border-bottom:1px solid #f5f5f5;cursor:pointer;" onclick="ccMois='+(mi+1)+';ccVue=\'nat-mois\';renderChefCorpsBody()">'
        +'<td style="padding:6px 10px;font-size:12px;font-weight:500;">'+nom+'</td>'+cols
        +'<td style="padding:6px 8px;text-align:center;font-weight:700;">'+(nbTot||'—')+'</td></tr>';
    });
    const ths=cas.map(function(c){return '<th style="padding:5px 8px;text-align:center;font-size:10px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+c.couleur+';margin-right:3px;"></span>'+c.code+'</th>';}).join('');
    html='<p style="font-size:11px;color:var(--t2);margin:0 0 8px;">Cliquez sur un mois pour le d\u00e9tail par nature.</p>'
      +'<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:6px 10px;text-align:left;">Mois</th>'+ths+'<th style="padding:6px 8px;text-align:center;">Total</th></tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'<tfoot><tr style="background:var(--t);color:#fff;font-weight:700;"><td style="padding:6px 10px;">TOTAL</td>'
      +cas.map(function(c){return '<td style="padding:6px 8px;text-align:center;">'+ivs.filter(function(iv){return iv._casId===c.id;}).length+'</td>';}).join('')
      +'<td style="padding:6px 8px;text-align:center;">'+total+'</td></tr></tfoot></table></div>';

  } else if(ccVue==='nat-mois'){
    // Toutes les natures × mois (même les 0)
    const moisActifs=ccMois>0?[ccMois]:Array.from({length:12},function(_,i){return i+1;});
    const thMois=moisActifs.map(function(mi){return '<th style="padding:4px 5px;text-align:center;font-size:10px;min-width:28px;">'+MOIS_NOMS[mi-1].slice(0,3)+'</th>';}).join('');
    let rowsNM='';
    NAT.forEach(function(n){
      let cols='';
      moisActifs.forEach(function(mi){
        const mStr=String(ccAnnee)+String(mi).padStart(2,'0');
        const nb=ivs.filter(function(iv){return iv.n===n.l&&statsInterventionInPeriod(iv,mStr);}).length;
        cols+='<td style="padding:4px 5px;text-align:center;font-size:11px;'+(nb?'font-weight:700;background:#EAF3DE;':'')+'">'+(nb||'—')+'</td>';
      });
      const tot=ivs.filter(function(iv){return iv.n===n.l;}).length;
      rowsNM+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.4;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;">'+n.i+' '+n.l+'</td>'+cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;">'+(tot||'—')+'</td></tr>';
    });
    html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:150px;font-size:11px;">Nature</th>'+thMois+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Tot.</th></tr></thead>'
      +'<tbody>'+rowsNM+'</tbody></table></div>';

  } else if(ccVue==='com-mois'){
    // Toutes les communes × mois (même les 0)
    const moisActifs=ccMois>0?[ccMois]:Array.from({length:12},function(_,i){return i+1;});
    const thMois=moisActifs.map(function(mi){return '<th style="padding:4px 5px;text-align:center;font-size:10px;min-width:28px;">'+MOIS_NOMS[mi-1].slice(0,3)+'</th>';}).join('');
    const allComs=statsCommunesIntervenuesEnPremier(ivs);
    let rowsCM='';
    allComs.forEach(function(com){
      let cols='';
      moisActifs.forEach(function(mi){
        const mStr=String(ccAnnee)+String(mi).padStart(2,'0');
        const nb=ivs.filter(function(iv){return iv.com===com&&statsInterventionInPeriod(iv,mStr);}).length;
        cols+='<td style="padding:4px 5px;text-align:center;font-size:11px;'+(nb?'font-weight:700;background:#EAF3DE;':'')+'">'+(nb||'—')+'</td>';
      });
      const tot=ivs.filter(function(iv){return iv.com===com;}).length;
      rowsCM+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.35;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;">'+com+'</td>'+cols
        +'<td style="padding:4px 6px;text-align:center;font-weight:700;background:#f9f9f9;">'+(tot||'—')+'</td></tr>';
    });
    html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:140px;font-size:11px;">Commune</th>'+thMois+'<th style="padding:4px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Tot.</th></tr></thead>'
      +'<tbody>'+rowsCM+'</tbody></table></div>';

  } else if(ccVue==='nat-com'){
    // Communes en lignes, natures en colonnes
    const allComsCC=statsCommunesIntervenuesEnPremier(ivs);
    const thNatCC=NAT.map(function(n){return '<th style="padding:3px 4px;text-align:center;font-size:9px;writing-mode:vertical-lr;transform:rotate(180deg);height:64px;max-width:20px;white-space:nowrap;">'+n.i+' '+n.l+'</th>';}).join('');
    let rowsCN='';
    allComsCC.forEach(function(com){
      const tot=ivs.filter(function(iv){return iv.com===com;}).length;
      const cols=NAT.map(function(n){
        const nb=ivs.filter(function(iv){return iv.com===com&&iv.n===n.l;}).length;
        return '<td style="padding:3px 4px;text-align:center;font-size:11px;'+(nb?'font-weight:700;background:#EAF3DE;':'')+'">'+(nb||'—')+'</td>';
      }).join('');
      rowsCN+='<tr style="border-bottom:1px solid #f5f5f5;'+(tot===0?'opacity:.35;':'')+'">'
        +'<td style="padding:5px 8px;font-size:11px;white-space:nowrap;">'+com+'</td>'+cols
        +'<td style="padding:3px 6px;text-align:center;font-weight:700;background:#f9f9f9;">'+(tot||'—')+'</td></tr>';
    });
    html=rowsCN?'<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:#f5f5f5;"><th style="padding:5px 8px;text-align:left;min-width:140px;font-size:11px;">Commune</th>'+thNatCC+'<th style="padding:3px 6px;text-align:center;font-size:11px;background:#f0f0f0;">Tot.</th></tr></thead>'
      +'<tbody>'+rowsCN+'</tbody></table></div>'
      :'<div style="padding:24px;text-align:center;color:var(--t2);">Aucune intervention pour cette période.</div>';
  }

  const wrapper='<div style="background:#fff;border-radius:12px;padding:12px;">'+(total===0&&ccVue!=='annuel'?'<div style="padding:24px;text-align:center;color:var(--t2);">Aucune intervention pour cette p\u00e9riode.</div>':html)+'</div>';
  body.innerHTML=cartes+wrapper;
}


// Gestion comptes spéciaux
function setChefCorpsAccount(login){
  if(!isSuperAdmin()){showToast('Seul le super-administrateur peut d\u00e9signer le chef de corps.','warn');return;}
  if(!login){showToast('Le chef de corps ne peut pas \u00eatre retir\u00e9 sans rempla\u00e7ant.','warn');renderSuperAdmin();return;}
  const selected=getChefCorpsCandidates().find(function(user){return user&&user.l===login;});
  if(!selected){showToast('Compte introuvable.','warn');renderSuperAdmin();return;}
  let account=getChefCorpsAccount();
  if(!account){account={};GLOBAL_ACCOUNTS.push(account);}
  const rightsCC=Array.isArray(account.rightsCC)?account.rightsCC.slice():["Interventions","Formation","Chef d'agrès","Historique complet"];
  ['l','p','prenom','nom','grade','fonction','fonction2','matricule','fonctionsFormateur'].forEach(function(key){
    if(selected[key]!==undefined)account[key]=Array.isArray(selected[key])?selected[key].slice():selected[key];
  });
  account.role='chef_corps';account.appRole='chef_corps';account.caserneId='EMAJ';
  account.homeCaserneId=selected._sourceCaserneId||selected.homeCaserneId||'EMAJ';
  account.homeCaserneNom=selected._sourceCaserneNom||selected.homeCaserneNom||'État-Major';
  account.rightsCC=rightsCC;account._assignmentProtectedV85=true;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);renderSuperAdmin();
  showToast('Chef de corps enregistr\u00e9 : '+fullName(account),'success');
}
function setCaserneAdmin(caserneId,login){
  if(!isSuperAdmin()){showToast('Seul le super-administrateur peut d\u00e9signer un administrateur de caserne.','warn');return;}
  const data=CASERNE_DATA[caserneId];
  if(!data||!Array.isArray(data.users))return;
  const selected=login&&data.users.find(function(user){return user&&user.l===login&&!user._isSA;});
  if(login&&!selected){showToast('Compte introuvable dans cette caserne.','warn');renderSuperAdmin();return;}
  data.adminLogin=selected?selected.l:'';
  data.users.forEach(function(user){
    user.rights=Array.isArray(user.rights)?user.rights:[];
    if(selected&&user.l===selected.l){if(!user.rights.includes('Administration'))user.rights.push('Administration');}
    else user.rights=user.rights.filter(function(right){return right!=='Administration';});
    user.caserneId=caserneId;user.appRole=deriveAccountRole(user);
  });
  if(CURRENT_CASERNE_ID===caserneId)syncCaserneContext();
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);renderSuperAdmin();
  showToast(selected?'Administrateur de caserne enregistr\u00e9 : '+fullName(selected):'Administrateur de caserne retir\u00e9','success');
}
function setResponsableFormation(caserneId,login){
  if(!isSuperAdmin()){showToast('Seul le super-administrateur peut d\u00e9finir le responsable formation.','warn');return;}
  const data=CASERNE_DATA[caserneId];
  if(!data||!Array.isArray(data.users))return;
  data.users.forEach(u=>{u.responsableFormation=false;u.appRole=deriveAccountRole(u);});
  if(login){
    const selected=data.users.find(u=>u.l===login);
    if(!selected){showToast('Compte introuvable dans cette caserne.','warn');renderSuperAdmin();return;}
    selected.responsableFormation=true;
    selected.caserneId=caserneId;
    selected.rights=Array.isArray(selected.rights)?selected.rights:[];
    if(!selected.rights.includes('Formation'))selected.rights.push('Formation');
    selected.appRole=deriveAccountRole(selected);
  }
  if(CURRENT_CASERNE_ID===caserneId)syncCaserneContext();
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);renderSuperAdmin();
  showToast(login?'Responsable formation enregistr\u00e9 \u2713':'Responsable formation retir\u00e9','success');
}
function changeSACaserne(cid){
  const sa=getSuperAdminAccount();
  if(sa){sa.caserneId=cid;sa.appRole='superadmin';}
  if(isSuperAdmin()&&CU){
    CURRENT_CASERNE_ID=cid;
    initCaserneData(cid);
    syncCaserneContext();
    const c=CC();
    if(c){
      document.getElementById('t2u').textContent=CU.l+' — '+c.nom;
      document.getElementById('t2r').textContent='Super Admin · '+c.code;
    }
  }
  renderSuperAdmin();
}
// Superadmin accède directement à une caserne depuis la vue globale
function saAccederCaserne(cid){
  const c=CASERNES.find(x=>x.id===cid);
  if(!c)return;
  CURRENT_CASERNE_ID=cid;
  initCaserneData(cid);
  syncCaserneContext();
  // Mettre à jour la barre de titre avec la nouvelle caserne
  document.getElementById('t2u').textContent=CU.l+' — '+c.nom;
  document.getElementById('t2r').textContent='Super Admin · '+c.code;
  // Revenir à l'app et rafraîchir
  document.getElementById('global-view').style.display='none';
  const ap=document.getElementById('app');ap.style.display='flex';
  GRADES.forEach(g=>{['prof-grade-sel','nu-grade'].forEach(id=>{const el=document.getElementById(id);if(el&&![...el.options].find(o=>o.textContent===g)){const o=document.createElement('option');o.textContent=g;el.appendChild(o);}});});
  // Rafraîchir toutes les vues pour refléter la nouvelle caserne
  applyNavRights();
  rAccueil();rI();
  if(hasRight('Administration'))rAdm();
  rProfil();
  // Réinitialiser les sous-onglets actifs
  const stStd=document.getElementById('subtab-btn-std');
  const stPilp=document.getElementById('subtab-btn-pilp');
  if(stStd){stStd.classList.add('active');if(stPilp)stPilp.classList.remove('active');}
  document.getElementById('subtab-std').style.display='';
  document.getElementById('subtab-pilp').style.display='none';
  document.getElementById('subtab-hist').style.display='none';
  // Aller à l'accueil
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-home').classList.add('active');
  const navHome=document.getElementById('nav-home');
  if(navHome)navHome.classList.add('active');
  // Afficher le bonjour avec le prénom
  const elBonj=document.getElementById('acc-bonjour');
  if(elBonj&&CU){const hh=new Date().getHours();const salut=hh>=18?'Bonsoir':hh>=12?'Bon apr\u00e8s-midi':'Bonjour';elBonj.textContent=salut+', '+(CU.prenom||CU.l)+'\u00a0!';}
}
// Superadmin accède à l'espace chef de corps
function saAccederChefCorps(){
  renderChefCorps();
  document.getElementById('gv-title').textContent='Chef de Corps — Tableau de bord';
  document.getElementById('gv-role').textContent='Statistiques consolidées (vue superadmin)';
  const gvNav=document.getElementById('gv-nav-extra');
  if(gvNav){
    const rc2=CC()?'<button onclick="retourCaserne()" style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;">← '+CC().nom+'</button>':'';
    gvNav.innerHTML=rc2+'<button onclick="showGlobalView(\'superadmin\')" style="background:rgba(255,255,255,.25);border:none;color:#fff;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">&#x1F310; Vue globale</button>';
  }
}

// Superadmin accède directement à l'espace de saisie État-Major
function saAccederEtatMajor(){
  if(!isSuperAdmin())return;
  ccAccederEspaceSaisie();
  const backBtn=document.getElementById('cc-back-dash');
  if(backBtn){backBtn.innerHTML='🌐 Gestion globale';backBtn.onclick=saRetourEtatMajor;}
}
function saRetourEtatMajor(){
  CURRENT_CASERNE_ID=null;
  const backBtn=document.getElementById('cc-back-dash');
  if(backBtn)backBtn.classList.add('hidden');
  showGlobalView('superadmin');
}

// ── Chef de corps : accès à son espace de saisie (caserne État-Major) ──
function ccAccederEspaceSaisie(){
  if(GLOBAL_ROLE!=='chef_corps'&&!isSuperAdmin())return;
  CURRENT_CASERNE_ID='EMAJ';
  initCaserneData('EMAJ');
  // Donner au chef de corps les droits de saisie dans cet espace
  if(CU){
    const acc=GLOBAL_ACCOUNTS.find(function(a){return a.role==='chef_corps';});
    CU.rights=(acc&&Array.isArray(acc.rightsCC))?acc.rightsCC.slice():["Interventions","Formation","Chef d'agrès","Historique complet"];
  }
  syncCaserneContext();
  const c=CASERNES.find(x=>x.id==='EMAJ');
  const t2u=document.getElementById('t2u'),t2r=document.getElementById('t2r');
  if(t2u)t2u.textContent=(CU?CU.l:'')+' — '+(c?c.nom:'État-Major');
  if(t2r)t2r.textContent='Chef de Corps · '+(c?c.nom:'État-Major');
  // Basculer de la vue globale vers l'app
  document.getElementById('global-view').style.display='none';
  const ap=document.getElementById('app');ap.style.display='flex';
  GRADES.forEach(g=>{['prof-grade-sel','nu-grade'].forEach(id=>{const el=document.getElementById(id);if(el&&![...el.options].find(o=>o.textContent===g)){const o=document.createElement('option');o.textContent=g;el.appendChild(o);}});});
  applyNavRights();
  // Afficher le bouton de retour au tableau de bord dans la barre de l'app
  let backBtn=document.getElementById('cc-back-dash');
  if(!backBtn){
    const nav=document.getElementById('nav-global');
    if(nav&&nav.parentNode){
      backBtn=document.createElement('button');
      backBtn.id='cc-back-dash';
      backBtn.className='nb';
      backBtn.style.cssText='background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;';
      backBtn.innerHTML='📊 Tableau de bord';
      backBtn.onclick=ccRetourTableauBord;
      nav.parentNode.insertBefore(backBtn,nav);
    }
  }
  if(backBtn)backBtn.classList.remove('hidden');
  rAccueil();rI();
  rProfil();
  const stStd=document.getElementById('subtab-btn-std');
  const stPilp=document.getElementById('subtab-btn-pilp');
  if(stStd){stStd.classList.add('active');if(stPilp)stPilp.classList.remove('active');}
  const ssStd=document.getElementById('subtab-std');if(ssStd)ssStd.style.display='';
  const ssPilp=document.getElementById('subtab-pilp');if(ssPilp)ssPilp.style.display='none';
  const ssHist=document.getElementById('subtab-hist');if(ssHist)ssHist.style.display='none';
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('active'));
  const th=document.getElementById('tab-home');if(th)th.classList.add('active');
  const navHome=document.getElementById('nav-home');if(navHome)navHome.classList.add('active');
  const elBonj=document.getElementById('acc-bonjour');
  if(elBonj&&CU){const hh=new Date().getHours();const salut=hh>=18?'Bonsoir':hh>=12?'Bon apr\u00e8s-midi':'Bonjour';elBonj.textContent=salut+', '+(CU.prenom||CU.l)+'\u00a0!';}
}

// ── Chef de corps : retour à son tableau de bord ──
function ccRetourTableauBord(){
  CURRENT_CASERNE_ID=null;
  if(CU)CU.rights=[];
  const backBtn=document.getElementById('cc-back-dash');
  if(backBtn)backBtn.classList.add('hidden');
  showGlobalView('chef_corps');
}

// ── Chef de corps : éditer ses propres informations (compte global) ──
function ccEditMesInfos(){
  if(!isSuperAdmin()){showToast('Le compte du chef de corps est g\u00e9r\u00e9 uniquement par le super-administrateur.','warn');return;}
  const acc=GLOBAL_ACCOUNTS.find(a=>a.role==='chef_corps');
  if(!acc)return;
  const ff=acc.fonctionsFormateur||[];
  const ffGroup=(label,items)=>`<div style="margin-bottom:6px;"><div style="font-size:11px;color:var(--t2);font-weight:600;margin-bottom:3px;">${label}</div>`+
    items.map(f=>`<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:13px;cursor:pointer;"><input type="checkbox" class="cc-ff" value="${f}"${ff.includes(f)?' checked':''}/> ${f}</label>`).join('')+`</div>`;
  document.getElementById('mt').textContent='Mes informations';
  document.getElementById('mi').textContent='Chef de Corps';
  document.getElementById('mb').innerHTML=`<div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="fg"><div class="fgl">Prénom</div><input class="fi" type="text" id="cc-prenom" value="${escHtml(acc.prenom||'')}"/></div>
      <div class="fg"><div class="fgl">Nom</div><input class="fi" type="text" id="cc-nom" value="${escHtml(acc.nom||'')}"/></div>
    </div>
    <div class="fg"><div class="fgl">Grade</div><select class="fi" id="cc-grade">${GRADES.map(g=>`<option${g===acc.grade?' selected':''}>${g}</option>`).join('')}</select></div>
    <div class="fg"><div class="fgl">Fonction</div><select class="fi" id="cc-fonction">${FONCTIONS.map(f=>`<option${f===acc.fonction?' selected':''}>${f}</option>`).join('')}</select></div>
    <div class="fg"><div class="fgl">Matricule</div><input class="fi" type="text" id="cc-matricule" value="${escHtml(acc.matricule||'')}"/></div>
    <div class="fg"><div class="fgl">Fonctions formateur</div>
      <div style="background:#F8F9FA;border:1px solid var(--brd);border-radius:8px;padding:8px;">
        ${ffGroup('🏃 Sport',FONCTIONS_FORMATEUR_SPORT)}
        ${ffGroup('📚 Formation',FONCTIONS_FORMATEUR_FORM)}
        ${ffGroup('🚑 Secours à la personne',FONCTIONS_FORMATEUR_SAP)}
      </div>
    </div>
    <div id="cc-infos-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
    <div class="brow">
      <button class="btn pr sm" onclick="ccSaveMesInfos()">&#x1F4BE; Enregistrer</button>
      <button class="btn sm" onclick="cM()">Annuler</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}

function ccSaveMesInfos(){
  if(!isSuperAdmin()){showToast('Le compte du chef de corps est g\u00e9r\u00e9 uniquement par le super-administrateur.','warn');return;}
  const acc=GLOBAL_ACCOUNTS.find(a=>a.role==='chef_corps');
  if(!acc)return;
  const prenom=document.getElementById('cc-prenom').value.trim();
  const nom=document.getElementById('cc-nom').value.trim();
  const grade=document.getElementById('cc-grade').value;
  const fonction=document.getElementById('cc-fonction').value;
  const matricule=document.getElementById('cc-matricule').value.trim();
  const err=document.getElementById('cc-infos-err');
  if(!prenom||!nom){err.style.display='block';err.textContent='Le prénom et le nom sont obligatoires.';return;}
  const ff=[...document.querySelectorAll('.cc-ff:checked')].map(c=>c.value);
  // Écriture dans le compte GLOBAL (source de vérité pour le chef de corps)
  acc.prenom=prenom;acc.nom=nom;acc.grade=grade;acc.fonction=fonction;acc.matricule=matricule;acc.fonctionsFormateur=ff;
  // Répercuter sur la session courante
  if(CU){CU.prenom=prenom;CU.nom=nom;CU.grade=grade;CU.fonction=fonction;CU.matricule=matricule;CU.fonctionsFormateur=ff;}
  saveData();cM();
  showToast('Informations enregistrées ✓','success');
  // Rafraîchir l'affichage selon le contexte (tableau de bord ou espace de saisie)
  if(CURRENT_CASERNE_ID==='EMAJ'){try{rProfil();}catch(e){}}
  else{try{showGlobalView('chef_corps');}catch(e){}}
}

function editCompteSpecial(role){
  if(!isSuperAdmin()){showToast('Modification r\u00e9serv\u00e9e au super-administrateur.','warn');return;}
  const acc=GLOBAL_ACCOUNTS.find(a=>a.role===role);
  if(!acc)return;
  const label=role==='superadmin'?'Super Administrateur':'Chef de Corps';
  document.getElementById('mt').textContent='Modifier — '+label;
  document.getElementById('mi').textContent='';
  // Section droits, uniquement pour le chef de corps
  const curRights=acc.rightsCC||["Interventions","Formation","Chef d'agrès","Historique complet"];
  const rightsSection=(role==='chef_corps')?`
    <div class="fg"><div class="fgl">Fonctions dans l'espace de saisie</div>
      <div style="background:#F8F9FA;border:1px solid var(--brd);border-radius:8px;padding:8px;">
        ${ALL_RIGHTS.map(r=>`<label style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:13px;cursor:pointer;"><input type="checkbox" class="ec-cc-right" value="${r.replace(/"/g,'&quot;')}"${curRights.includes(r)?' checked':''}/> ${r}</label>`).join('')}
      </div>
      <div style="font-size:10px;color:var(--t2);margin-top:4px;">Détermine ce que le chef de corps peut faire dans son espace de saisie (État-Major).</div>
    </div>`:'';
  document.getElementById('mb').innerHTML=`<div>
    <div class="fg"><div class="fgl">Prénom</div><input class="fi" type="text" id="ec-prenom" value="${acc.prenom}" oninput="prevEcLogin()"/></div>
    <div class="fg"><div class="fgl">Nom</div><input class="fi" type="text" id="ec-nom" value="${acc.nom}" oninput="prevEcLogin()"/></div>
    <div class="fg"><div class="fgl">Grade</div><select class="fi" id="ec-grade">${GRADES.map(g=>`<option${g===acc.grade?' selected':''}>${g}</option>`).join('')}</select></div>
    <div class="fg"><div class="fgl">Identifiant (auto)</div><input class="fi" type="text" id="ec-login" value="${acc.l}" style="font-family:monospace;font-size:12px;"/></div>
    <div class="fg"><div class="fgl">Nouveau mot de passe</div><input class="fi" type="password" id="ec-mdp" placeholder="Laisser vide pour ne pas changer"/></div>
    ${rightsSection}
    <div id="ec-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
    <div class="brow">
      <button class="btn pr sm" onclick="saveCompteSpecial('${role}')">&#x1F4BE; Enregistrer</button>
      <button class="btn sm" onclick="cM()">Annuler</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function prevEcLogin(){
  const p=nm(document.getElementById('ec-prenom')?.value.trim()||'');
  const n=nm(document.getElementById('ec-nom')?.value.trim()||'');
  const el=document.getElementById('ec-login');
  if(p&&n&&el)el.value=n+'.'+p;
}
async function saveCompteSpecial(role){
  if(!isSuperAdmin()){showToast('Modification r\u00e9serv\u00e9e au super-administrateur.','warn');return;}
  const acc=GLOBAL_ACCOUNTS.find(a=>a.role===role);
  if(!acc)return;
  const prenom=document.getElementById('ec-prenom').value.trim();
  const nom=document.getElementById('ec-nom').value.trim();
  const grade=document.getElementById('ec-grade').value;
  const login=document.getElementById('ec-login').value.trim().toLowerCase();
  const mdp=document.getElementById('ec-mdp').value;
  const err=document.getElementById('ec-err');
  if(!prenom||!nom||!login){err.style.display='block';err.textContent='Champs obligatoires.';return;}
  const pwdErr=mdp?passwordPolicyError(mdp):'';
  if(pwdErr){err.style.display='block';err.textContent=pwdErr;return;}
  const oldLogin=acc.l;
  acc.prenom=prenom;acc.nom=nom;acc.l=login;acc.grade=grade;
  if(mdp){acc.p=await hashPassword(mdp);} // P1
  // Droits du chef de corps (définis par le superadmin)
  if(role==='chef_corps'){
    const checked=[...document.querySelectorAll('.ec-cc-right:checked')].map(function(c){return c.value;});
    acc.rightsCC=checked;
  }
  if(CU&&(CU.l===oldLogin||CU.l===login)){CU.prenom=prenom;CU.nom=nom;CU.l=login;
    const t2u=document.getElementById('t2u');
    if(t2u)t2u.textContent=login+(CC()?' \u2014 '+CC().nom:'');
  }
  saveData();cM();renderSuperAdmin();
}
function editAdminCaserne(cid){
  const d=CASERNE_DATA[cid]||{users:[]};
  const admin=getCaserneAdmin(cid);
  const cas=CASERNES.find(c=>c.id===cid);
  if(!admin||!cas)return;
  document.getElementById('mt').textContent='Admin — '+cas.nom;
  document.getElementById('mi').textContent=cid;
  document.getElementById('mb').innerHTML=`<div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="fg"><div class="fgl">Prénom</div><input class="fi" type="text" id="adm-prenom" value="${admin.prenom||''}"/></div>
      <div class="fg"><div class="fgl">Nom</div><input class="fi" type="text" id="adm-nom" value="${admin.nom||''}"/></div>
    </div>
    <div class="fg"><div class="fgl">Grade</div>
      <select class="fi" id="adm-grade">${GRADES.map(g=>`<option${g===admin.grade?' selected':''}>${g}</option>`).join('')}</select>
    </div>
    <div class="fg"><div class="fgl">Identifiant (généré auto)</div>
      <input class="fi" type="text" id="adm-login" value="${admin.l}" style="font-family:monospace;font-size:12px;"/>
    </div>
    <div class="fg"><div class="fgl">Nouveau mot de passe</div>
      <input class="fi" type="password" id="adm-mdp" placeholder="Laisser vide pour ne pas changer"/>
    </div>
    <div class="fg"><div class="fgl">Couleur de l'UT</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="color" id="adm-couleur" value="${cas.couleur}" style="width:40px;height:32px;border:1px solid var(--brd);border-radius:6px;cursor:pointer;"/>
        <span style="font-size:11px;color:var(--t2);">Couleur affichée dans l'application pour tous les agents de ${cas.nom}</span>
      </div>
    </div>
    <div id="adm-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
    <div class="brow">
      <button class="btn pr sm" onclick="saveAdminCaserne('${cid}')">&#x1F4BE; Enregistrer</button>
      <button class="btn sm" onclick="cM()">Annuler</button>
    </div>
  </div>`;
  // Régénérer login si prenom/nom change
  document.getElementById('adm-prenom').oninput=document.getElementById('adm-nom').oninput=function(){
    const p=nm(document.getElementById('adm-prenom').value.trim());
    const n=nm(document.getElementById('adm-nom').value.trim());
    if(p&&n)document.getElementById('adm-login').value=n+'.'+p;
  };
  document.getElementById('mo').style.display='flex';
}
async function saveAdminCaserne(cid){
  const d=CASERNE_DATA[cid]||{users:[]};
  const admin=getCaserneAdmin(cid);
  const cas=CASERNES.find(c=>c.id===cid);
  if(!admin||!cas)return;
  const prenom=document.getElementById('adm-prenom').value.trim();
  const nom=document.getElementById('adm-nom').value.trim();
  const grade=document.getElementById('adm-grade').value;
  const login=document.getElementById('adm-login').value.trim().toLowerCase();
  const mdp=document.getElementById('adm-mdp').value;
  const couleur=document.getElementById('adm-couleur').value;
  const err=document.getElementById('adm-err');
  if(!prenom||!nom||!login){err.style.display='block';err.textContent='Prénom, nom et identifiant sont obligatoires.';return;}
  const pwdErr=mdp?passwordPolicyError(mdp):'';
  if(pwdErr){err.style.display='block';err.textContent=pwdErr;return;}
  const oldLogin=admin.l;
  admin.prenom=prenom;admin.nom=nom;admin.grade=grade;admin.l=login;
  d.adminLogin=login;
  if(mdp){admin.p=await hashPassword(mdp);} // P1
  cas.couleur=couleur;
  if(oldLogin!==login){
    CASERNE_DATA[cid].equipes?.forEach(eq=>{
      if(eq.resp===oldLogin)eq.resp=login;
      eq.membres=eq.membres.map(m=>m===oldLogin?login:m);
    });
  }
  saveData();cM();renderSuperAdmin();
}
// ── Référentiel Communes + Natures ──
function showReferentiel(initialTab){
  const body=document.getElementById('gv-body');
  body.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn sm" onclick="renderSuperAdmin()">← Retour</button>
      <h2 style="font-size:16px;font-weight:700;">&#x1F4CB; Référentiel</h2>
      <div style="display:flex;gap:6px;margin-left:auto;flex-wrap:wrap;">
        <button id="ref-btn-communes" class="btn pr" onclick="showRefTab('communes',this)">&#x1F5FA;️ Communes</button>
        <button id="ref-btn-natures" class="btn" onclick="showRefTab('natures',this)">&#x1F3F7;️ Natures</button>
        <button id="ref-btn-activites" class="btn" onclick="showRefTab('activites',this)">📋 Activités de service</button>
        <button id="ref-btn-rapports" class="btn" onclick="showRefTab('rapports',this)">📄 Rapports</button>
        <button id="ref-btn-taux" class="btn" onclick="showRefTab('taux',this)">📊 Taux</button>
      </div>
    </div>
    <div id="ref-body"></div>`;
  const tab=initialTab||'communes';
  showRefTab(tab,document.getElementById('ref-btn-'+tab));
}
function showRefTab(tab,btn){
  document.querySelectorAll('[id^="ref-btn-"]').forEach(b=>{b.className='btn';});
  btn.className='btn pr';
  if(tab==='communes')renderRefCommunes();
  else if(tab==='natures')renderRefNatures();
  else if(tab==='activites')renderRefActivites();
  else if(tab==='rapports')renderRefRapports();
  else if(tab==='taux')renderRefTaux();
}
function renderRefCommunes(){
  const coms=COM.map(c=>typeof c==='string'?{nom:c,secteur:''}:c);
  const secs=['Tous',...new Set(coms.map(c=>c.secteur).filter(Boolean))].sort((a,b)=>a==='Tous'?-1:a.localeCompare(b,'fr'));
  const fs=window._rfcf||'Tous';
  const vis=fs==='Tous'?coms:coms.filter(c=>c.secteur===fs);
  function secSel(ri,cur){return '<select style="width:100%;padding:3px 7px;border:1px solid var(--brd);border-radius:5px;font-size:12px;" onchange="updateComSecteur('+ri+',this.value)"><option value="">— Secteur —</option>'+CASERNES.map(c=>{const v='UT '+c.nom.replace('UT ','');return '<option value="'+v+'"'+(v===cur?' selected':'')+'>'+c.nom+'</option>';}).join('')+'</select>';}
  const rows=vis.map(c=>{const ri=coms.indexOf(c);return `<tr style="border-bottom:1px solid #f0f0f0;">
    <td style="padding:5px 8px;"><input type="text" value="${c.nom.replace(/"/g,'&quot;')}" style="width:100%;padding:3px 7px;border:1px solid var(--brd);border-radius:5px;font-size:12px;font-weight:500;" onchange="updateComNom(${ri},this.value)"/></td>
    <td style="padding:5px 8px;">${secSel(ri,c.secteur||'')} </td>
    <td style="padding:5px 6px;text-align:center;"><button class="btn sm" style="font-size:10px;color:#E24B4A;" onclick="delCommune(${ri})">&#x2715;</button></td>
  </tr>`;}).join('');
  const sOpts=secs.map(s=>`<option value="${s}"${s===fs?' selected':''}>  ${s==='Tous'?'Tous les secteurs':s}</option>`).join('');
  const newSecOpts='<option value="">— Secteur —</option>'+CASERNES.map(c=>{const v='UT '+c.nom.replace('UT ','');return `<option value="${v}">${c.nom}</option>`;}).join('');
  document.getElementById('ref-body').innerHTML=`
    <div style="background:#fff;border-radius:12px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:13px;font-weight:600;">${coms.length} communes <span style="font-size:11px;color:var(--t2);font-weight:400;">&#x2014; modifiables directement</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <select class="fi" style="width:180px;" onchange="window._rfcf=this.value;renderRefCommunes()">${sOpts}</select>
          <input type="text" id="new-com-nom" placeholder="Nom de la commune" class="fi" style="width:150px;"/>
          <select id="new-com-sec" class="fi" style="width:160px;">${newSecOpts}</select>
          <button class="btn pr sm" onclick="addCommune()">+ Ajouter</button>
        </div>
      </div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f5f5f5;">
          <th style="padding:6px 10px;text-align:left;min-width:140px;">Commune</th>
          <th style="padding:6px 10px;text-align:left;min-width:180px;">Secteur d'intervention</th>
          <th style="padding:6px 10px;width:36px;"></th>
        </tr></thead><tbody>${rows}</tbody>
      </table></div>
      ${vis.length<coms.length?`<div style="font-size:11px;color:var(--t2);margin-top:8px;">${vis.length}/${coms.length} communes aff.</div>`:''}
    </div>`;
}
function updateComNom(i,v){v=v.trim();if(!v)return;if(typeof COM[i]==='string')COM[i]=v;else COM[i].nom=v;}
function updateComSecteur(i,v){if(typeof COM[i]==='string')COM[i]={nom:COM[i],secteur:v};else COM[i].secteur=v;}
function addCommune(){
  const nom=document.getElementById('new-com-nom').value.trim();
  const sec=document.getElementById('new-com-sec').value;
  if(!nom)return;
  if(!COM.find(c=>(typeof c==='string'?c:c.nom)===nom)){COM.push({nom,secteur:sec});COM.sort((a,b)=>(typeof a==='string'?a:a.nom).localeCompare(typeof b==='string'?b:b.nom,'fr'));}
  document.getElementById('new-com-nom').value='';
  renderRefCommunes();
}
function delCommune(i){confirmModal('Supprimer cette commune ?',function(){COM.splice(i,1);renderRefCommunes();});}
function renderRefNatures(){
  const grps=['⭐ Prioritaires','Secours','Feux','Risques','Opérations diverses'];
  const fg=window._rfnf||'Tous';
  const vis=fg==='Tous'?NAT:NAT.filter(n=>n.g===fg);
  const rows=vis.map(n=>{const ri=NAT.indexOf(n);return `<tr style="border-bottom:1px solid #f0f0f0;">
    <td style="padding:5px 8px;text-align:center;"><input type="text" value="${n.i}" style="width:44px;padding:3px 5px;border:1px solid var(--brd);border-radius:5px;font-size:15px;text-align:center;" onchange="NAT[${ri}].i=this.value"/></td>
    <td style="padding:5px 8px;"><input type="text" value="${n.l.replace(/"/g,'&quot;')}" style="width:100%;padding:3px 7px;border:1px solid var(--brd);border-radius:5px;font-size:12px;font-weight:500;" onchange="NAT[${ri}].l=this.value.trim()||NAT[${ri}].l"/></td>
    <td style="padding:5px 8px;"><select style="padding:3px 6px;border:1px solid var(--brd);border-radius:5px;font-size:11px;width:100%;" onchange="NAT[${ri}].g=this.value">${grps.map(g=>`<option value="${g}"${g===n.g?' selected':''}>  ${g}</option>`).join('')}</select></td>
    <td style="padding:5px 6px;text-align:center;"><button class="btn sm" style="font-size:10px;color:#E24B4A;" onclick="delNature(${ri})">&#x2715;</button></td>
  </tr>`;}).join('');
  const gOpts=['Tous',...grps].map(g=>`<option value="${g}"${g===fg?' selected':''}>  ${g==='Tous'?'Tous les groupes':g}</option>`).join('');
  document.getElementById('ref-body').innerHTML=`
    <div style="background:#fff;border-radius:12px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:13px;font-weight:600;">${NAT.length} natures <span style="font-size:11px;color:var(--t2);font-weight:400;">&#x2014; modifiables directement</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <select class="fi" style="width:165px;" onchange="window._rfnf=this.value;renderRefNatures()">${gOpts}</select>
          <input type="text" id="new-nat-ico" placeholder="&#128293;" class="fi" style="width:52px;text-align:center;"/>
          <input type="text" id="new-nat-nom" placeholder="Libellé de la nature" class="fi" style="width:200px;"/>
          <select id="new-nat-grp" class="fi" style="width:155px;">${grps.map(g=>`<option>${g}</option>`).join('')}</select>
          <button class="btn pr sm" onclick="addNature()">+ Ajouter</button>
        </div>
      </div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f5f5f5;">
          <th style="padding:6px 10px;width:52px;text-align:center;">Icône</th>
          <th style="padding:6px 10px;text-align:left;">Libellé</th>
          <th style="padding:6px 10px;text-align:left;min-width:155px;">Groupe</th>
          <th style="padding:6px 10px;width:36px;"></th>
        </tr></thead><tbody>${rows}</tbody>
      </table></div>
    </div>`;
}
function addNature(){
  const l=document.getElementById('new-nat-nom').value.trim();
  const i=document.getElementById('new-nat-ico').value.trim()||'&#128203;';
  const g=document.getElementById('new-nat-grp').value;
  if(!l)return;if(!NAT.find(n=>n.l===l))NAT.push({l,i,g});
  document.getElementById('new-nat-nom').value='';document.getElementById('new-nat-ico').value='';
  renderRefNatures();
}
function delNature(i){confirmModal('Supprimer cette nature ?',function(){NAT.splice(i,1);renderRefNatures();});}

// ── Référentiel Activités de service ──
function actIconOptions(selected){
  const icons=ACT_ICON_LIBRARY.slice();
  if(selected&&!icons.some(x=>x.i===selected))icons.unshift({i:selected,l:'Ic\u00f4ne personnalis\u00e9e'});
  return icons.map(x=>`<option value="${escHtml(x.i)}"${x.i===selected?' selected':''}>${x.i} ${escHtml(x.l)}</option>`).join('');
}
function actCategoryOptions(selected){
  const value=selected||'Activit\u00e9s de service';
  return ACT_CATEGORIES.map(cat=>`<option value="${escHtml(cat)}"${cat===value?' selected':''}>${escHtml(cat)}</option>`).join('');
}
function renderRefActivites(){
  const rows=ACT_TYPES.map((a,i)=>`<tr style="border-bottom:1px solid #f0f0f0;">
    <td style="padding:5px 8px;"><select class="fi" style="width:190px;font-size:12px;" onchange="updateActType(${i},'i',this.value)">${actIconOptions(a.i)}</select></td>
    <td style="padding:5px 8px;"><input type="text" value="${a.l.replace(/"/g,'&quot;')}" style="width:100%;padding:3px 7px;border:1px solid var(--brd);border-radius:5px;font-size:12px;font-weight:500;" onchange="updateActType(${i},'l',this.value)"/></td>
    <td style="padding:5px 8px;"><select class="fi" style="width:190px;font-size:12px;" onchange="updateActType(${i},'cat',this.value)">${actCategoryOptions(a.cat)}</select></td>
    <td style="padding:5px 6px;text-align:center;"><button class="btn sm" style="font-size:10px;color:#E24B4A;" onclick="delActType(${i})">&#x2715;</button></td>
  </tr>`).join('');
  document.getElementById('ref-body').innerHTML=`
    <div style="background:#fff;border-radius:12px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:13px;font-weight:600;">${ACT_TYPES.length} activit\u00e9s <span style="font-size:11px;color:var(--t2);font-weight:400;">&#x2014; modifiables directement</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <select id="new-act-ico" class="fi" style="width:190px;">${actIconOptions('\uD83D\uDCCB')}</select>
          <input type="text" id="new-act-nom" placeholder="Libell\u00e9 de l\u2019activit\u00e9" class="fi" style="width:240px;"/>
          <select id="new-act-cat" class="fi" style="width:190px;">${actCategoryOptions('Activit\u00e9s de service')}</select>
          <button class="btn pr sm" onclick="addActType()">+ Ajouter</button>
        </div>
      </div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f5f5f5;">
          <th style="padding:6px 10px;width:190px;text-align:left;">Ic\u00f4ne</th>
          <th style="padding:6px 10px;text-align:left;">Libell\u00e9</th>
          <th style="padding:6px 10px;width:190px;text-align:left;">Cat\u00e9gorie</th>
          <th style="padding:6px 10px;width:36px;"></th>
        </tr></thead><tbody>${rows}</tbody>
      </table></div>
    </div>`;
}
function updateActType(index,field,value){
  const item=ACT_TYPES[index];if(!item)return;
  const next=String(value||'').trim();
  if(field==='l'){if(!next){renderRefActivites();return;}item.l=next;}
  else if(field==='i')item.i=next||'\uD83D\uDCCB';
  else if(field==='cat')item.cat=ACT_CATEGORIES.includes(next)?next:'Activit\u00e9s de service';
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
}
function addActType(){
  const l=document.getElementById('new-act-nom').value.trim();
  const i=document.getElementById('new-act-ico').value||'\uD83D\uDCCB';
  const cat=document.getElementById('new-act-cat').value||'Activit\u00e9s de service';
  if(!l)return;
  if(ACT_TYPES.find(a=>a.l.toLocaleLowerCase('fr')===l.toLocaleLowerCase('fr'))){showToast('Cette activit\u00e9 existe d\u00e9j\u00e0.','info');return;}
  ACT_TYPES.push({l,i,cat});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  document.getElementById('new-act-nom').value='';
  renderRefActivites();
  showToast('Activit\u00e9 ajout\u00e9e \u2713','success');
}
function delActType(i){confirmModal('Supprimer cette activit\u00e9 ?',function(){
  ACT_TYPES.splice(i,1);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);renderRefActivites();
});}

function reportTypeCode(key){
  const item=REPORT_TYPES.find(r=>r.k===key);
  return item?item.code:String(key||'').toUpperCase();
}
function renderRefRapports(){
  const rows=REPORT_TYPES.map((r,i)=>`<tr style="border-bottom:1px solid #f0f0f0;">
    <td style="padding:7px 8px;"><input class="fi" value="${escHtml(r.l)}" onchange="updateReportTypeLabel(${i},this.value)" style="width:100%;"/></td>
    <td style="padding:7px 8px;width:150px;"><span style="display:inline-block;min-width:70px;text-align:center;font-family:monospace;font-weight:700;background:#F3F4F6;border:1px solid var(--brd);border-radius:7px;padding:6px 10px;">${escHtml(r.code)}</span></td>
  </tr>`).join('');
  document.getElementById('ref-body').innerHTML=`<div style="background:#fff;border-radius:12px;padding:16px;">
    <div style="font-size:13px;font-weight:700;margin-bottom:4px;">R\u00e9f\u00e9rentiel des rapports</div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:12px;">Les libell\u00e9s sont modifiables. Les codes restent fixes afin de garantir la coh\u00e9rence des exports.</div>
    <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#f5f5f5;"><th style="padding:7px 8px;text-align:left;">Rapports</th><th style="padding:7px 8px;text-align:left;width:150px;">Types_Rapports</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}
function updateReportTypeLabel(index,value){
  const item=REPORT_TYPES[index],next=String(value||'').trim();
  if(!item||!next){renderRefRapports();return;}
  item.l=next;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
}
function reportRateDefinitions(){
  return [
    {label:'Taux de base',id:'sdisJour',code:'SDIS',def:100},
    {label:'Heures de nuits',id:'sdisNuit',code:'SDIS',def:200},
    {label:'Dimanches/jours f\u00e9ri\u00e9s',id:'sdisDimFerie',code:'SDIS',def:150},
    {label:'Taux de base',id:'interJour',code:'INTER',def:100},
    {label:'Heures de nuits',id:'interNuit',code:'INTER',def:200},
    {label:'Dimanches/jours f\u00e9ri\u00e9s',id:'interDimFerie',code:'INTER',def:150},
    {label:'Taux de base',id:'renfJour',code:'RENF',def:100},
    {label:'Heures de nuits',id:'renfNuit',code:'RENF',def:200},
    {label:'Dimanches/jours f\u00e9ri\u00e9s',id:'renfDimFerie',code:'RENF',def:150},
    {label:'Activit\u00e9s de service',id:'actSvc',code:'AC',def:75},
    {label:'Formateurs',id:'formRate',code:'FORM',def:100},
    {label:'Formations',id:'formStag',code:'FOR',def:100},
    {label:'Frais administratifs',id:'fraisAdmin',code:'FA',def:100},
    {label:'Astreintes t\u00e9l\u00e9phoniques',id:'astrTel',code:'AST',def:5}
  ];
}
function renderRefTaux(){
  const t=getStatsTaux();
  const rows=reportRateDefinitions().map(r=>`<tr style="border-bottom:1px solid #f0f0f0;">
    <td style="padding:6px 8px;">${escHtml(r.label)}</td>
    <td style="padding:6px 8px;width:130px;"><div style="display:flex;align-items:center;gap:5px;"><input class="fi" type="number" id="ref-rate-${r.id}" value="${t[r.id]??r.def}" min="0" max="200" step="1" style="width:80px;"/><span>%</span></div></td>
    <td style="padding:6px 8px;width:150px;font-family:monospace;font-weight:700;">${escHtml(r.code)}</td>
  </tr>`).join('');
  document.getElementById('ref-body').innerHTML=`<div style="background:#fff;border-radius:12px;padding:16px;">
    <div style="font-size:13px;font-weight:700;margin-bottom:4px;">R\u00e9f\u00e9rentiel des taux</div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:12px;">Les taux enregistr\u00e9s s\u2019appliquent \u00e0 toutes les casernes et aux exports mensuels.</div>
    <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#f5f5f5;"><th style="padding:7px 8px;text-align:left;">D\u00e9signation</th><th style="padding:7px 8px;text-align:left;width:130px;">Taux</th><th style="padding:7px 8px;text-align:left;width:150px;">Types_Rapports</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <label style="display:flex;align-items:flex-start;gap:10px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:9px;padding:10px 12px;margin:14px 0 8px;cursor:pointer;">
      <input type="checkbox" id="ref-export-admins" ${t.exportAdmins===true?'checked':''} style="width:18px;height:18px;accent-color:#166534;margin-top:1px;"/>
      <span><strong style="font-size:12px;color:#166534;">Autoriser l\u2019export mensuel aux administrateurs</strong></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:10px;background:#EFF6FF;border:1px solid #93C5FD;border-radius:9px;padding:10px 12px;margin:8px 0 14px;cursor:pointer;">
      <input type="checkbox" id="ref-export-round" ${t.exportRoundQuarter!==false?'checked':''} style="width:18px;height:18px;accent-color:#1D4ED8;margin-top:1px;"/>
      <span><strong style="font-size:12px;color:#1D4ED8;">Arrondir les interventions non SDIS au quart d\u2019heure sup\u00e9rieur</strong></span>
    </label>
    <button class="btn pr" onclick="saveReportRatesFromRef()">\uD83D\uDCBE Enregistrer les taux</button>
  </div>`;
}
function saveReportRatesFromRef(){
  const current=getStatsTaux(),next=Object.assign({},current);
  reportRateDefinitions().forEach(r=>{
    const value=parseInt(document.getElementById('ref-rate-'+r.id)?.value,10);
    next[r.id]=Math.max(0,Math.min(200,Number.isFinite(value)?value:r.def));
  });
  next.fmpaStag=next.actSvc;
  next.fmpaForm=next.formRate;
  next.formForm=next.formRate;
  next.exportAdmins=document.getElementById('ref-export-admins')?.checked===true;
  next.exportRoundQuarter=document.getElementById('ref-export-round')?.checked!==false;
  saveStatsTaux(next);
  renderRefTaux();showToast('R\u00e9f\u00e9rentiel des taux enregistr\u00e9 \u2713','success');
}

// Ajouter un autre superadmin
function addSuperAdmin(){
  document.getElementById('mt').textContent='Ajouter un Super Administrateur';
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`<div>
    <div style="font-size:12px;color:#666;background:#FEF3C7;border-radius:8px;padding:8px;margin-bottom:10px;">
      ⚠️ Un superadmin a accès à toutes les casernes et peut tout modifier. Utilisez avec précaution.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="fg"><div class="fgl">Prénom</div><input class="fi" type="text" id="nsa-prenom" oninput="prevSALogin()"/></div>
      <div class="fg"><div class="fgl">Nom</div><input class="fi" type="text" id="nsa-nom" oninput="prevSALogin()"/></div>
    </div>
    <div class="fg"><div class="fgl">Grade</div>
      <select class="fi" id="nsa-grade">${GRADES.map(g=>`<option>${g}</option>`).join('')}</select>
    </div>
    <div class="fg"><div class="fgl">Caserne de rattachement</div>
      <select class="fi" id="nsa-caserne">${CASERNES.map(c=>`<option value="${c.id}">${c.nom}</option>`).join('')}</select>
    </div>
    <div class="fg"><div class="fgl">Identifiant (auto)</div>
      <input class="fi" type="text" id="nsa-login" style="font-family:monospace;font-size:12px;"/>
    </div>
    <div class="fg"><div class="fgl">Mot de passe</div><input class="fi" type="password" id="nsa-mdp"/></div>
    <div id="nsa-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
    <div class="brow">
      <button class="btn pr sm" onclick="confirmAddSuperAdmin()">Créer</button>
      <button class="btn sm" onclick="cM()">Annuler</button>
    </div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function prevSALogin(){
  const p=nm(document.getElementById('nsa-prenom').value.trim());
  const n=nm(document.getElementById('nsa-nom').value.trim());
  if(p&&n)document.getElementById('nsa-login').value=n+'.'+p;
}
async function confirmAddSuperAdmin(){
  const prenom=document.getElementById('nsa-prenom').value.trim();
  const nom=document.getElementById('nsa-nom').value.trim();
  const grade=document.getElementById('nsa-grade').value;
  const caserneId=document.getElementById('nsa-caserne').value;
  const login=document.getElementById('nsa-login').value.trim().toLowerCase();
  const mdp=document.getElementById('nsa-mdp').value.trim();
  const err=document.getElementById('nsa-err');
  if(!prenom||!nom||!login||!mdp){err.style.display='block';err.textContent='Tous les champs sont obligatoires.';return;}
  const pwdErr=passwordPolicyError(mdp);
  if(pwdErr){err.style.display='block';err.textContent=pwdErr;return;}
  GLOBAL_ACCOUNTS.push({l:login,p:await hashPassword(mdp),role:'superadmin',appRole:'superadmin',prenom,nom,grade,caserneId});
  saveData();cM();renderSuperAdmin();
}
// Gestion casernes (superadmin)
function addCaserne(){
  const colors=['#C0392B','#2980B9','#1ABC9C','#8E44AD','#E67E22','#16A085','#D35400','#2C3E50'];
  const mb=document.getElementById('mb'),mt=document.getElementById('mt'),mo=document.getElementById('mo');
  mt.textContent='Nouvelle caserne';
  document.getElementById('mi').textContent='';
  mb.innerHTML=`<div>
    <div class="fg"><div class="fgl">Nom</div><input class="fi" type="text" id="nc-nom" placeholder="ex. CIS Saint-Venant"/></div>
    <div class="fg"><div class="fgl">Code (3 lettres)</div><input class="fi" type="text" id="nc-code" placeholder="ex. STV" maxlength="5"/></div>
    <div class="fg"><div class="fgl">Couleur</div><div style="display:flex;gap:8px;flex-wrap:wrap;">${colors.map(col=>`<div onclick="this.parentElement.querySelectorAll('div').forEach(d=>d.style.outline='none');this.style.outline='3px solid #333';document.getElementById('nc-color').value='${col}';" style="width:28px;height:28px;border-radius:50%;background:${col};cursor:pointer;"></div>`).join('')}<input type="hidden" id="nc-color" value="${colors[0]}"/></div></div>
    <div class="fg"><div class="fgl">Mot de passe admin caserne</div><input class="fi" type="password" id="nc-pwd" placeholder="Mot de passe"/></div>
    <div id="nc-err" style="font-size:12px;color:#E24B4A;display:none;margin-bottom:8px;"></div>
    <div class="brow"><button class="btn pr sm" onclick="confirmAddCaserne()">Créer</button><button class="btn sm" onclick="cM()">Annuler</button></div>
  </div>`;
  mo.style.display='flex';
}
function confirmAddCaserne(){
  const nom=document.getElementById('nc-nom').value.trim();
  const code=document.getElementById('nc-code').value.trim().toUpperCase();
  const couleur=document.getElementById('nc-color').value;
  const pwd=document.getElementById('nc-pwd').value.trim();
  const err=document.getElementById('nc-err');
  if(!nom||!code||!pwd){err.style.display='block';err.textContent='Tous les champs sont obligatoires.';return;}
  const id='CIS'+String(CASERNES.length+1).padStart(2,'0');
  CASERNES.push({id,nom,code,couleur});
  initCaserneData(id);
  CASERNE_DATA[id].users[0].p=pwd;
  saveData();cM();renderSuperAdmin();
}
function editCaserne(id){
  const c=CASERNES.find(x=>x.id===id);if(!c)return;
  document.getElementById('mt').textContent='Modifier '+c.nom;
  document.getElementById('mi').textContent=id;
  document.getElementById('mb').innerHTML=`<div>
    <div class="fg"><div class="fgl">Nom</div><input class="fi" type="text" id="ec-nom" value="${c.nom}"/></div>
    <div class="fg"><div class="fgl">Code</div><input class="fi" type="text" id="ec-code" value="${c.code}" maxlength="5"/></div>
    <div class="fg"><div class="fgl">Couleur</div><input class="fi" type="color" id="ec-col" value="${c.couleur}"/></div>
    <div class="brow"><button class="btn pr sm" onclick="confirmEditCaserne('${id}')">&#x1F4BE; Enregistrer</button><button class="btn sm" onclick="cM()">Annuler</button></div>
  </div>`;
  document.getElementById('mo').style.display='flex';
}
function confirmEditCaserne(id){
  const c=CASERNES.find(x=>x.id===id);if(!c)return;
  c.nom=document.getElementById('ec-nom').value.trim()||c.nom;
  c.code=document.getElementById('ec-code').value.trim().toUpperCase()||c.code;
  c.couleur=document.getElementById('ec-col').value;
  saveData();cM();renderSuperAdmin();
}
function delCaserne(id){
  // Interdire la suppression de la caserne d'un superadmin
  const saBlocked=GLOBAL_ACCOUNTS.filter(a=>a.role==='superadmin'&&a.caserneId===id);
  if(saBlocked.length){
    showToast('Impossible de supprimer cette caserne : rattachée à un superadmin. Changez sa caserne d\'abord.','error');
    return;
  }
  confirmModal('Supprimer cette caserne et toutes ses données ?',function(){CASERNES=CASERNES.filter(c=>c.id!==id);delete CASERNE_DATA[id];saveData();renderSuperAdmin();});
}

function _restoreSessionAfterLoad(){
  if(CU&&isSessionValid())return true;
  const stored=_readStoredSession();
  if(!stored||!stored.token||!stored.login||!Number.isFinite(Number(stored.expiresAt)))return false;
  const now=Date.now();
  if(now>=Number(stored.expiresAt)){
    try{localStorage.removeItem(SESSION_STORAGE_KEY);}catch(e){}
    const expiredEntry=LOGIN_HISTORY.find(function(entry){return entry.id===stored.token;});
    if(expiredEntry&&!expiredEntry.hDeconnexion){
      expiredEntry.hDeconnexion=new Date(Number(stored.expiresAt)).toISOString();
      expiredEntry.actif=false;
      expiredEntry.fermetureAuto='Session arrivée à expiration';
    }
    return false;
  }

  let restoredUser=null;
  if(stored.globalRole){
    const account=GLOBAL_ACCOUNTS.find(function(item){return item.l===stored.login&&item.role===stored.globalRole;});
    if(!account)return false;
    GLOBAL_ROLE=account.role;
    if(account.role==='superadmin'&&account.caserneId){
      CURRENT_CASERNE_ID=account.caserneId;
      initCaserneData(account.caserneId);syncCaserneContext();
      restoredUser={l:account.l,prenom:account.prenom,nom:account.nom,grade:account.grade,
        rights:["Prise d'appel","Interventions","Historique complet","Chef d'agrès","Tireur PILP","Administration"],
        rl:'Super Administrateur',fonction:'Chef de centre',caserneId:account.caserneId,appRole:'superadmin'};
    }else{
      CURRENT_CASERNE_ID=null;syncCaserneContext();
      restoredUser={l:account.l,prenom:account.prenom,nom:account.nom,grade:account.grade,rights:[],rl:'Chef de Corps',caserneId:'EMAJ',appRole:'chef_corps'};
    }
  }else{
    const caserneId=stored.caserneId;
    if(!caserneId||!CASERNE_DATA[caserneId])return false;
    GLOBAL_ROLE=null;CURRENT_CASERNE_ID=caserneId;syncCaserneContext();
    restoredUser=USERS.find(function(user){return user.l===stored.login;})||null;
    if(!restoredUser){CURRENT_CASERNE_ID=null;syncCaserneContext();return false;}
    restoredUser.caserneId=caserneId;
    restoredUser.appRole=deriveAccountRole(restoredUser);
  }

  const backgroundLimit=_getBgLogoutMs();
  const backgroundAt=Number(stored.backgroundAt)||0;
  if(backgroundLimit>0&&backgroundAt&&now-backgroundAt>=backgroundLimit){
    const entry=LOGIN_HISTORY.find(function(item){return item.id===stored.token;});
    if(entry&&!entry.hDeconnexion){
      entry.hDeconnexion=new Date(backgroundAt+backgroundLimit).toISOString();
      entry.actif=false;
      entry.fermetureAuto='Inactivité en arrière-plan';
    }
    try{localStorage.removeItem(SESSION_STORAGE_KEY);}catch(e){}
    CU=null;GLOBAL_ROLE=null;CURRENT_CASERNE_ID=null;syncCaserneContext();
    saveData(true);
    return false;
  }

  CU=restoredUser;
  SESSION_TOKEN=stored.token;
  SESSION_EXPIRY=Number(stored.expiresAt);
  const cas=CC();if(cas)setCaserneTheme(cas.couleur);
  document.getElementById('lw').style.display='none';
  const app=document.getElementById('app');app.style.display='flex';app.style.flexDirection='column';
  document.getElementById('t2u').textContent=CU.l+(cas?' — '+cas.nom:'');
  document.getElementById('t2r').textContent=CU.rl||'';
  const hop=document.getElementById('hop');if(hop)hop.textContent='Opérateur : '+CU.l;
  GRADES.forEach(function(grade){
    ['prof-grade-sel','nu-grade'].forEach(function(id){
      const select=document.getElementById(id);
      if(select&&![...select.options].some(function(option){return option.textContent===grade;})){
        const option=document.createElement('option');option.textContent=grade;select.appendChild(option);
      }
    });
  });
  _persistSessionState({backgroundAt:0});
  _armSessionTimers();
  doLoginSuccess();
  return true;
}

function doLoginSuccess(){
  // Synchroniser fonctionsFormateur sur CU depuis USERS (au cas où CU est une copie)
  if(CU){
    const u=USERS.find(x=>x.l===CU.l);
    if(u){
      if(!CU.fonctionsFormateur&&u.fonctionsFormateur)CU.fonctionsFormateur=u.fonctionsFormateur;
      if(!CU.rights&&u.rights)CU.rights=u.rights;
    }
    // Migrer les anciens libellés sur CU directement
    const MFF={'EAP 1 (Op\u00e9rateur des Activit\u00e9s Physiques)':'EAP 1','EAP 2 (\u00c9ducateur des Activit\u00e9s Physiques)':'EAP 2','EAP 3 (Conseiller des Activit\u00e9s Physiques)':'EAP 3','ACCPRO (Accompagnateur de Proximit\u00e9)':'ACCPRO','FOR ACC (Formateur Accompagnateur)':'FOR ACC','FPS (Formateur Premier Secours)':'FPS','FFPS (Formateur de formateur de premiers secours)':'FFPS'};
    if(CU.fonctionsFormateur)CU.fonctionsFormateur=[...new Set(CU.fonctionsFormateur.map(f=>MFF[f]||f))];
  }
  try{applyNavRights();}catch(e){}
  if(GLOBAL_ROLE==='chef_corps'){showGlobalView('chef_corps');return;}
  try{rNatures(NAT);}catch(e){}
  try{rAdm();}catch(e){}
  try{rProfil();}catch(e){}
  try{rAccueil();}catch(e){}
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-home').classList.add('active');
  document.getElementById('nav-home').classList.add('active');
  const stStd=document.getElementById('subtab-btn-std');
  const stPilp=document.getElementById('subtab-btn-pilp');
  if(stStd){stStd.classList.add('active');if(stPilp)stPilp.classList.remove('active');}
  document.getElementById('subtab-std').style.display='';
  document.getElementById('subtab-pilp').style.display='none';
  document.getElementById('subtab-hist').style.display='none';
  const pbProfil=document.getElementById('params-btn-profil');
  if(pbProfil){pbProfil.classList.add('active');document.getElementById('params-btn-admin').classList.remove('active');}
  document.getElementById('params-profil').style.display='';
  document.getElementById('params-admin').style.display='none';
  // Sur mobile, scroller vers le haut pour voir l'accueil
  if(window.innerWidth<=480){window.scrollTo(0,0);}
}
function doLogout(){
  // Marquer la déconnexion dans l'historique
  if(SESSION_TOKEN){
    const entry=LOGIN_HISTORY.find(e=>e.id===SESSION_TOKEN);
    if(entry){entry.hDeconnexion=new Date().toISOString();entry.actif=false;}
    saveData(true); // push immédiat : l'historique de connexion est partagé
  }
  _clearSession(); // P2 : invalider la session
  CU=null;GLOBAL_ROLE=null;CURRENT_CASERNE_ID=null;syncCaserneContext();
  // Masquer la vue globale si visible
  const gv=document.getElementById('global-view');if(gv)gv.style.display='none';
  document.getElementById('lw').style.display='flex';
  document.getElementById('app').style.display='none';
  document.getElementById('lu').value='';document.getElementById('lp').value='';
  document.getElementById('lerr').style.display='none';
  // Reset grade selects
  ['prof-grade-sel','nu-grade'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='';});
  rF();selEng=null;parcConfirmed.clear();
}

