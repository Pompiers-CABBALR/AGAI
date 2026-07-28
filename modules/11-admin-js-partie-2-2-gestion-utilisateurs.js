// === MODULE: admin.js (partie 2/2 — gestion utilisateurs) ===
// ────────────────── ADMIN ──────────────────
function showResetPwd(login){
  // Toggle the inline password form for this user
  document.querySelectorAll('[id^="pwd-form-"]').forEach(el=>{if(el.id!=='pwd-form-'+login)el.style.display='none';});
  const form=document.getElementById('pwd-form-'+login);
  if(form)form.style.display=form.style.display==='none'||form.style.display===''?'flex':'none';
}
async function resetPwd(login){
  const inp=document.getElementById('pwd-inp-'+login);
  if(!inp||!inp.value.trim()){showToast('Saisir un nouveau mot de passe.','warn');return;}
  const pwdErr=passwordPolicyError(inp.value);
  if(pwdErr){showToast(pwdErr,'warn');return;}
  const u=USERS.find(x=>x.l===login);
  if(!u)return;
  const hashed=await hashPassword(inp.value.trim()); // P1
  u.p=hashed;
  if(CU&&CU.l===login)CU.p=hashed;
  inp.value='';
  saveData();rAdm();
}
function isChefCentre(){return CU&&CU.fonction==='Chef de centre';}

// ── Utilitaires tri ──
function gradeIndex(grade){
  return GRADES.indexOf(grade); // -1 si inconnu → en bas
}
function sortByGradeThenName(list){
  return [...list].sort((a,b)=>{
    const ga=gradeIndex(a.grade),gb=gradeIndex(b.grade);
    if(gb!==ga)return gb-ga; // plus gradé d'abord (index plus élevé)
    const nc=a.nom.localeCompare(b.nom,'fr');
    return nc!==0?nc:a.prenom.localeCompare(b.prenom,'fr');
  });
}
function sortByName(list){
  return [...list].sort((a,b)=>{
    const nc=a.nom.localeCompare(b.nom,'fr');
    return nc!==0?nc:a.prenom.localeCompare(b.prenom,'fr');
  });
}
function fullName(u){return u?u.nom+' '+u.prenom:'';}
function fullNameAff(u){return u?(u.nom+' '+u.prenom).trim():'';}
function shortName(u){return u?u.nom+' '+u.prenom.charAt(0)+'.':'';}
function rAdm(){
  // Reconstruire les selects grade/fonction seulement si le formulaire est fermé
  const addFormOpen = document.getElementById('admin-add')&&document.getElementById('admin-add').style.display!=='none';
  const ng=document.getElementById('nu-grade');
  const nf=document.getElementById('nu-fonction');
  if(!addFormOpen){
    if(ng)ng.innerHTML=GRADES.map(g=>`<option>${g}</option>`).join('');
    if(nf)nf.innerHTML=FONCTIONS.map(f=>`<option>${f}</option>`).join('');
  } else {
    // Formulaire ouvert : reconstruire seulement si vide
    if(ng&&ng.options.length===0)ng.innerHTML=GRADES.map(g=>`<option>${g}</option>`).join('');
    if(nf&&nf.options.length===0)nf.innerHTML=FONCTIONS.map(f=>`<option>${f}</option>`).join('');
  }
  const tbody=document.getElementById('admin-tbody');if(!tbody)return;
  const RIGHTS_SHORT=['Prise d\'appel','Interventions','Historique complet','Chef d\'agrès','Tireur PILP','Administration','Formation'];
  // USERS contient déjà le superadmin via syncCaserneContext
  const sorted=sortByName(USERS);
  tbody.innerHTML=sorted.map(u=>{
    const isSA=u._isSA===true;
    // Le superadmin peut modifier sa propre ligne ; les autres ne peuvent pas toucher au SA
    const saEditable=isSA&&isSuperAdmin()&&u.l===CU.l;
    const roLbl=isSA?'<span style="font-size:10px;background:#FEF2F2;color:#C0392B;padding:2px 7px;border-radius:8px;font-weight:600;">Super Admin</span>':'';
    const rfLbl=u.responsableFormation===true?'<span style="font-size:9px;background:#F3E8FF;color:#6D28D9;padding:2px 6px;border-radius:8px;font-weight:700;white-space:nowrap;">Resp. formation</span>':'';
    const nomCell=(isSA&&!saEditable)?`<td style="font-size:12px;font-weight:500;">${u.nom} ${roLbl} ${rfLbl}</td>`:`<td><input type="text" value="${u.nom}" data-login="${u.l}" data-field="nom" onchange="updateUser(this.dataset.login,this.dataset.field,this.value)" style="width:80px;padding:3px 6px;border:1px solid var(--brd);border-radius:5px;font-size:12px;"/>${saEditable?roLbl:''}${rfLbl}</td>`;
    const prenomCell=(isSA&&!saEditable)?`<td style="font-size:12px;">${u.prenom}</td>`:`<td><input type="text" value="${u.prenom}" data-login="${u.l}" data-field="prenom" onchange="updateUser(this.dataset.login,this.dataset.field,this.value)" style="width:70px;padding:3px 6px;border:1px solid var(--brd);border-radius:5px;font-size:12px;"/></td>`;
    const gradeCell=(isSA&&!saEditable)?`<td style="font-size:12px;color:var(--t2);">${u.grade||''}</td>`:`<td><select data-login="${u.l}" data-field="grade" onchange="updateUser(this.dataset.login,this.dataset.field,this.value)" style="width:110px;padding:3px 5px;border:1px solid var(--brd);border-radius:5px;font-size:11px;">${GRADES.map(g=>`<option${g===u.grade?' selected':''}>${g}</option>`).join('')}</select></td>`;
    const fonctionCell=(isSA&&!saEditable)?`<td style="font-size:12px;color:var(--t2);">${u.fonction||''}</td>`:`<td><select data-login="${u.l}" data-field="fonction" onchange="updateUser(this.dataset.login,this.dataset.field,this.value)" style="width:160px;padding:3px 5px;border:1px solid var(--brd);border-radius:5px;font-size:11px;">${FONCTIONS.map(f=>`<option${f===(u.fonction||'Équipier')?' selected':''}>${f}</option>`).join('')}</select></td>`;
    // Fonction secondaire (pour Chef de centre et Adjoint au chef de centre)
    const showFonct2=u.fonction==='Chef de centre'||u.fonction==='Adjoint au chef de centre';
    const fonct2Opts=["Chef d'agrès tout engin","Chef d'agrès 1 équipe","Chef d'équipe","Équipier"];
    const fonct2Cell=showFonct2?(isSA&&!saEditable)?`<td style="font-size:12px;color:var(--t2);">${u.fonction2||''}</td>`:`<td><select onchange="updateUser('${u.l}','fonction2',this.value)" style="width:160px;padding:3px 5px;border:1px solid var(--brd);border-radius:5px;font-size:11px;"><option value="">— Aucune —</option>${fonct2Opts.map(f=>`<option${f===(u.fonction2||'')?' selected':''}>${f}</option>`).join('')}</select></td>`:`<td style="color:var(--t2);font-size:11px;text-align:center;">—</td>`;
    const pwdCell=(isSA&&!saEditable)?'<td style="color:var(--t2);font-size:11px;">—</td>':`<td style="white-space:nowrap;">
      <button style="background:var(--bg);color:var(--t2);border:1px solid var(--brd);border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;" onclick="showResetPwd('${u.l}')">&#x1F511; Modifier</button>
      <div id="pwd-form-${u.l}" style="display:none;margin-top:4px;gap:4px;align-items:center;">
        <input type="password" id="pwd-inp-${u.l}" placeholder="Nouveau mdp" style="width:90px;padding:3px 6px;border:1px solid var(--brd);border-radius:5px;font-size:11px;"/>
        <button style="background:var(--grn);color:#fff;border:none;border-radius:5px;padding:3px 7px;font-size:10px;cursor:pointer;" onclick="resetPwd('${u.l}')">✓</button>
        <button style="background:none;border:none;color:var(--t2);cursor:pointer;font-size:13px;" onclick="document.getElementById('pwd-form-${u.l}').style.display='none'">✕</button>
      </div>
    </td>`;
    const rightsCell=(isSA&&!saEditable)?RIGHTS_SHORT.map(()=>'<td style="text-align:center;"><input type="checkbox" checked disabled></td>').join('')
      :RIGHTS_SHORT.map(r=>`<td style="text-align:center;"><input type="checkbox" ${u.rights.includes(r)?'checked':''} onchange="updateRight('${u.l}','${r.replace(/'/g,"\\'")}',this.checked)" ${(u.l===CU.l&&r==='Administration')||isSA?'disabled':''}></td>`).join('');
    const delCell=(isSA)?'<td></td>':`<td><button class="del-btn" onclick="delUser('${u.l}')" ${u.l===CU.l?'disabled':''}>✕</button></td>`;
    const matriculeCell=(isSA&&!saEditable)?`<td style="font-size:11px;color:var(--t2);">${u.matricule||'—'}</td>`:`<td><input type="text" value="${u.matricule||''}" data-login="${u.l}" data-field="matricule" onchange="updateUser(this.dataset.login,this.dataset.field,this.value)" placeholder="Matricule" style="width:70px;padding:3px 6px;border:1px solid var(--brd);border-radius:5px;font-size:12px;"/></td>`;
    // Cellule Fonctions formateur
    const ffList=u.fonctionsFormateur||[];
    const ffGroups=[
      {label:'🏃 Sport',items:FONCTIONS_FORMATEUR_SPORT},
      {label:'📚 Formation',items:FONCTIONS_FORMATEUR_FORM},
      {label:'🚑 Secours à la personne',items:FONCTIONS_FORMATEUR_SAP}
    ];
    const colStyle='flex:1;min-width:0;padding:0 4px;';
    const hdrStyle='font-size:9px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;white-space:nowrap;';
    const colsHtml=ffGroups.map(grp=>`<div style="${colStyle}">
      <div style="${hdrStyle}">${grp.label}</div>
      ${grp.items.map(ff=>`<label style="display:flex;align-items:center;gap:4px;font-size:10px;cursor:pointer;padding:1px 0;white-space:nowrap;">
        <input type="checkbox" value="${ff.replace(/"/g,'&quot;')}" ${ffList.includes(ff)?'checked':''} onchange="updateFormateurFn('${u.l}',this.value,this.checked)" style="width:12px;height:12px;flex-shrink:0;accent-color:var(--grn);">
        <span>${ff}</span></label>`).join('')}
    </div>`).join('');
    const formateurCell=`<td style="padding:4px 6px;"><div style="display:flex;gap:0;min-width:240px;">${colsHtml}</div></td>`;
    return `<tr>${matriculeCell}${nomCell}${prenomCell}${gradeCell}${fonctionCell}${fonct2Cell}<td style="font-family:monospace;font-size:11px;color:var(--t2);">${u.l}</td>${pwdCell}${rightsCell}${formateurCell}${delCell}</tr>`;
  }).join('');
  // Dans l'espace État-Major : afficher la ligne du chef de corps (compte global), modifiable via sa modale
  if(CURRENT_CASERNE_ID==='EMAJ'&&GLOBAL_ROLE==='chef_corps'){
    const cc=GLOBAL_ACCOUNTS.find(function(a){return a.role==='chef_corps';});
    if(cc){
      const ff=(cc.fonctionsFormateur||[]).join(', ')||'—';
      const ccRow='<tr style="background:#EFF6FF;">'
        +'<td style="font-size:12px;">'+escHtml(cc.matricule||'—')+'</td>'
        +'<td style="font-size:12px;font-weight:500;">'+escHtml(cc.nom||'')+' <span style="font-size:10px;background:#DBEAFE;color:#1D4ED8;padding:2px 7px;border-radius:8px;font-weight:600;">Chef de Corps</span></td>'
        +'<td style="font-size:12px;">'+escHtml(cc.prenom||'')+'</td>'
        +'<td style="font-size:12px;color:var(--t2);">'+escHtml(cc.grade||'')+'</td>'
        +'<td style="font-size:12px;color:var(--t2);">'+escHtml(cc.fonction||'')+'</td>'
        +'<td style="color:var(--t2);font-size:11px;text-align:center;">—</td>'
        +'<td style="font-family:monospace;font-size:11px;color:var(--t2);">'+escHtml(cc.l||'')+'</td>'
        +'<td style="color:var(--t2);font-size:11px;">—</td>'
        +'<td style="color:var(--t2);font-size:11px;text-align:center;">—</td>'
        +'<td style="font-size:11px;color:var(--t2);">'+escHtml(ff)+'</td>'
        +'<td style="text-align:center;"><button style="background:var(--bg);color:#1D4ED8;border:1px solid #1D4ED8;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;" onclick="ccEditMesInfos()">&#x270F;&#xFE0F; Modifier</button></td>'
        +'</tr>';
      tbody.innerHTML=ccRow+tbody.innerHTML;
    }
  }
}
function genLogin(nom,prenom){
  // Génère un login unique : nom.prenom, puis nom.prenom2, nom.prenom3…
  // Vérifie dans toutes les casernes pour éviter tout doublon global
  const base=nm(nom)+'.'+nm(prenom);
  const allLogins=new Set();
  CASERNES.forEach(c=>{(CASERNE_DATA[c.id]?.users||[]).forEach(u=>allLogins.add(u.l));});
  if(!allLogins.has(base))return base;
  let i=2;
  while(allLogins.has(base+i))i++;
  return base+i;
}
function previewLogin(){
  const p=nm(document.getElementById('nu-prenom').value.trim()),n=nm(document.getElementById('nu-nom').value.trim());
  if(!p||!n){document.getElementById('nu-login-preview').textContent='—';return;}
  const login=genLogin(document.getElementById('nu-nom').value.trim(),document.getElementById('nu-prenom').value.trim());
  const isIncremented=login!==n+'.'+p;
  document.getElementById('nu-login-preview').innerHTML=`<strong>${login}</strong>${isIncremented?` <span style="font-size:10px;color:#E67E22;">⚠️ doublon — incrémenté</span>`:''}`;
}
function showAddUser(){
  const box=document.getElementById('admin-add');
  const isOpen=box.style.display!=='none';
  if(!isOpen){
    // Réinitialiser tous les champs à l'ouverture
    ['nu-matricule','nu-prenom','nu-nom','nu-mdp'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    const gr=document.getElementById('nu-grade');if(gr)gr.selectedIndex=0;
    const fn=document.getElementById('nu-fonction');if(fn)fn.selectedIndex=0;
    const err=document.getElementById('nu-err');if(err)err.style.display='none';
    document.getElementById('nu-login-preview').textContent='—';
  }
  box.style.display=isOpen?'none':'block';
}
async function addUser(){
  const prenom=document.getElementById('nu-prenom').value.trim(),nom=document.getElementById('nu-nom').value.trim(),grade=document.getElementById('nu-grade').value,fonction=document.getElementById('nu-fonction').value,mdp=document.getElementById('nu-mdp').value.trim(),matricule=(document.getElementById('nu-matricule')?.value||'').trim();
  const err=document.getElementById('nu-err');
  if(!prenom||!nom||!mdp){err.style.display='block';err.textContent='Tous les champs sont obligatoires.';return;}
  const pwdErr=passwordPolicyError(mdp);
  if(pwdErr){err.style.display='block';err.textContent=pwdErr;return;}
  const login=genLogin(nom,prenom);
  err.style.display='none';
  const hashed=await hashPassword(mdp);
  USERS.push({l:login,p:hashed,prenom,nom,grade,fonction,matricule,caserneId:CURRENT_CASERNE_ID,appRole:'agent',rights:['Prise d\'appel','Interventions'],rl:'Utilisateur'});
  // Réinitialiser tous les champs du formulaire
  ['nu-matricule','nu-prenom','nu-nom','nu-mdp'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('nu-login-preview').textContent='—';
  saveData();
  document.getElementById('admin-add').style.display='none';
  rAdm();
}
function delUser(login){
  if(GLOBAL_ACCOUNTS.find(a=>a.l===login&&a.role==='superadmin')){showToast('Impossible de supprimer le Super Administrateur.','error');return;}
  confirmModal('Supprimer cet utilisateur ?',function(){USERS=USERS.filter(u=>u.l!==login);saveData();rAdm();});
}
function updateFormateurFn(login,fn,checked){
  const u=USERS.find(x=>x.l===login);if(!u)return;
  if(!u.fonctionsFormateur)u.fonctionsFormateur=[];
  if(checked&&!u.fonctionsFormateur.includes(fn))u.fonctionsFormateur.push(fn);
  else if(!checked)u.fonctionsFormateur=u.fonctionsFormateur.filter(f=>f!==fn);
  // Si au moins une fonction formateur, auto-cocher le droit Formation
  if(u.fonctionsFormateur.length>0&&!u.rights.includes('Formation'))u.rights.push('Formation');
  if(CU&&CU.l===login){CU.fonctionsFormateur=[...u.fonctionsFormateur];CU.rights=[...u.rights];applyNavRights();}
  saveData();
  // Rafraîchir la fiche profil si ouverte
  const profPanel=document.getElementById('params-profil');
  if(profPanel&&profPanel.style.display!=='none'&&CU&&CU.l===login)rProfil();
}
function updateRight(login,right,checked){
  const u=USERS.find(x=>x.l===login);if(!u)return;
  if(checked&&!u.rights.includes(right))u.rights.push(right);
  else if(!checked)u.rights=u.rights.filter(r=>r!==right);
  u.caserneId=CURRENT_CASERNE_ID;
  u.appRole=deriveAccountRole(u);
  if(CU&&CU.l===login){CU.rights=[...u.rights];applyNavRights();}
  saveData();
  rAdm();
}
function updateUser(login,field,val){
  const isSAAccount=GLOBAL_ACCOUNTS.find(a=>a.l===login&&a.role==='superadmin');
  if(isSAAccount&&!isSuperAdmin())return;
  if(isSAAccount&&isSuperAdmin()){
    isSAAccount[field]=val;
    if(CU&&CU.l===login)CU[field]=val;
    const uInUsers=USERS.find(x=>x.l===login);
    if(uInUsers){
      uInUsers[field]=val;
      if(field==='fonction'&&val!=='Chef de centre'&&val!=='Adjoint au chef de centre')uInUsers.fonction2='';
    }
    saveData();
    _updateUserRefresh(login,field);
    return;
  }
  const u=USERS.find(x=>x.l===login);
  if(u){
    u[field]=val;
    if(field==='fonction'&&val!=='Chef de centre'&&val!=='Adjoint au chef de centre')u.fonction2='';
    u.caserneId=CURRENT_CASERNE_ID;
    u.appRole=deriveAccountRole(u);
  }
  if(CU&&CU.l===login){
    CU[field]=val;
    CU.caserneId=CURRENT_CASERNE_ID;
    CU.appRole=deriveAccountRole(CU);
  }
  saveData();
  _updateUserRefresh(login,field);
}

// Rafraîchit tous les affichages concernés après une modification admin
function _updateUserRefresh(login,field){
  // Toujours rafraîchir le tableau admin (la colonne fonction2 dépend de fonction)
  setTimeout(rAdm,50);
  // Si c'est l'agent connecté : mettre à jour le bandeau et la fiche profil
  if(CU&&CU.l===login){
    // Bandeau topbar
    const t2u=document.getElementById('t2u');
    if(t2u){const cas=CC();t2u.textContent=CU.l+(cas?' — '+cas.nom:'');}
    // Grade dans le sous-titre du bandeau
    const t2r=document.getElementById('t2r');
    if(t2r)t2r.textContent=CU.rl||'';
    // Fiche profil si ouverte
    const profPanel=document.getElementById('params-profil');
    if(profPanel&&profPanel.style.display!=='none')rProfil();
  }
}


