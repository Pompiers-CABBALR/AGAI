// === MODULE: interventions.js ===
// ────────────────── INTERVENTIONS ──────────────────
function rIPostUpdate(){rStatsHeader();}
function sf(f,btn){flt=f;document.querySelectorAll('#tab-interv .fb').forEach(b=>b.classList.remove('active'));btn.classList.add('active');rI();}
function pushTL(iv,s,who,note){
  if(!iv.tl)iv.tl=[];
  const entry=mkTL(s,getH(N()),who);
  if(note)entry.note=note;
  iv.tl.push(entry);
}

// Les administrateurs doivent voir les corrections horaires même lorsque leur
// mode d'administration est désactivé. On contrôle donc ici le rôle du compte,
// et non l'état temporaire du bouton "pouvoir administrateur".
function hasAdministrativeAccount(){
  if(!CU)return false;
  return GLOBAL_ROLE==='superadmin'||CU.role==='superadmin'||CU._isSA===true||
    (Array.isArray(CU.rights)&&CU.rights.includes('Administration'));
}

function assignInterventionRoute(iv,login){
  if(!iv||!login)return;
  const allInterventions=[].concat(IVS||[],PILP_IVS||[]);
  const active=allInterventions.filter(function(x){
    return x.id!==iv.id&&x.agr===login&&['selectionne','en-cours'].includes(x.s);
  });
  let batch=active.map(function(x){return x._routeBatchId;}).find(Boolean);
  if(!batch)batch='ROUTE_'+String(Date.now())+'_'+login;
  const sameBatch=allInterventions.filter(function(x){return x._routeBatchId===batch;});
  const maxOrder=sameBatch.reduce(function(max,x){return Math.max(max,Number(x._routeOrder)||0);},0);
  iv._routeBatchId=batch;
  if(!iv._routeOrder)iv._routeOrder=maxOrder+1;
}

function interventionRouteChefName(iv){
  const login=iv&&iv.agr||'';
  const user=USERS.find(function(item){return item.l===login;});
  return user?fullName(user):(login||'Chef non renseign\u00e9');
}

function interventionRouteBadgeHTML(iv){
  if(!iv||!['selectionne','en-cours'].includes(iv.s))return '';
  const order=Number(iv._routeOrder)||0;
  if(!order||!iv.agr)return '';
  const chef=interventionRouteChefName(iv);
  const label='Tourn\u00e9e '+order+' \u00b7 '+chef;
  const canEdit=iv.s==='selectionne'&&CU&&iv.agr===CU.l;
  if(canEdit){
    return `<button type="button" class="bdg route-order-badge" title="Modifier l'ordre de cette tourn\u00e9e" onclick="event.stopPropagation();editInterventionRoute('${escHtml(iv.agr)}','${escHtml(iv._routeBatchId||'')}')"><span class="route-order-number">n\u00b0${order}</span><span class="route-order-chef">${escHtml(chef)}</span></button>`;
  }
  return `<span class="bdg route-order-badge" title="${escHtml(label)}"><span class="route-order-number">n\u00b0${order}</span><span class="route-order-chef">${escHtml(chef)}</span></span>`;
}

function editInterventionRoute(chefLogin,batchId){
  if(!CU||chefLogin!==CU.l){showToast('Seul le chef d\u2019agr\u00e8s concern\u00e9 peut modifier cette tourn\u00e9e.','warn');return;}
  const route=[].concat(IVS||[],PILP_IVS||[]).filter(function(iv){
    return iv.s==='selectionne'&&iv.agr===chefLogin&&(!batchId||iv._routeBatchId===batchId);
  });
  if(!route.length){showToast('Aucune intervention s\u00e9lectionn\u00e9e \u00e0 r\u00e9organiser.','info');return;}
  route.forEach(function(iv){parcConfirmed.delete(iv.id);});
  rI();
  requestAnimationFrame(function(){
    const panel=document.getElementById('pap');
    if(panel)panel.scrollIntoView({behavior:'smooth',block:'start'});
  });
  showToast('Vous pouvez modifier l\u2019ordre puis confirmer de nouveau la tourn\u00e9e.','info');
}

function prepareInterventionRoute(iv){
  if(!iv)return;
  assignInterventionRoute(iv,iv.agr||CU.l);
  const login=iv.agr||CU.l;
  const active=IVS.filter(function(x){
    return x.agr===login&&['selectionne','en-cours'].includes(x.s);
  });
  active.forEach(function(x){assignInterventionRoute(x,login);});
}

function isFirstInterventionOfRoute(iv){
  if(!iv||!iv._routeBatchId)return true;
  const route=IVS.filter(function(x){return x._routeBatchId===iv._routeBatchId;});
  if(route.length<2)return true;
  const first=route.slice().sort(function(a,b){
    return (Number(a._routeOrder)||9999)-(Number(b._routeOrder)||9999);
  })[0];
  return !!first&&first.id===iv.id;
}

function interventionCrewSignature(iv,equipage1,equipage2){
  const members=[].concat(equipage1||iv&&iv._equipage1||[],equipage2||iv&&iv._equipage2||[])
    .map(function(member){return member&&member.login||'';}).filter(Boolean);
  if(iv&&iv.agr)members.push(iv.agr);
  if(iv&&iv._agr2)members.push(iv._agr2);
  return [...new Set(members)].sort().join('|');
}

function interventionTimelineStamp(iv,status,latest){
  const entries=(Array.isArray(iv&&iv.tl)?iv.tl:[]).filter(function(entry){
    return entry&&entry.s===status&&/^\d{8}/.test(String(entry.h||''));
  });
  if(!entries.length)return '';
  return String(entries[latest?entries.length-1:0].h||'');
}

function interventionCompactStampMillis(value){
  const digits=String(value||'').replace(/\D/g,'');
  if(digits.length<12)return NaN;
  return new Date(
    parseInt(digits.slice(0,4),10),
    parseInt(digits.slice(4,6),10)-1,
    parseInt(digits.slice(6,8),10),
    parseInt(digits.slice(8,10),10),
    parseInt(digits.slice(10,12),10)
  ).getTime();
}

function isFollowingInterventionInSeries(iv){
  if(!iv)return false;
  if(iv._startLockedByChain===true||iv._chainedFromInterventionId)return true;
  if(iv._routeBatchId&&!isFirstInterventionOfRoute(iv))return true;
  const signature=interventionCrewSignature(iv);
  const startStamp=interventionTimelineStamp(iv,'en-cours',false);
  const startMillis=interventionCompactStampMillis(startStamp);
  if(!signature||!Number.isFinite(startMillis)||!iv._hDebut)return false;
  return IVS.some(function(previous){
    if(!previous||previous.id===iv.id||previous.s!=='terminee')return false;
    if(interventionCrewSignature(previous)!==signature)return false;
    if(!previous._hFin||previous._hFin!==iv._hDebut)return false;
    const endMillis=interventionCompactStampMillis(interventionTimelineStamp(previous,'terminee',true));
    const delay=startMillis-endMillis;
    return Number.isFinite(endMillis)&&delay>=0&&delay<=12*60*60*1000;
  });
}

function canEditInterventionStart(iv){
  if(!iv||!CU)return false;
  if(typeof isAdminModeActive==='function'&&isAdminModeActive())return true;
  if(isFollowingInterventionInSeries(iv))return false;
  const own=isInterventionReportChef(iv,CU.l);
  return own&&!iv._crValide&&isFirstInterventionOfRoute(iv);
}

function interventionAddressLabel(iv){
  return [iv&&iv.addr,iv&&iv.com].filter(Boolean).join(', ');
}

function isInterventionReportChef(iv,login){
  if(!iv||!login)return false;
  if(iv.agr===login||iv._agr2===login)return true;
  const crews=[iv._equipage1,iv._equipage2];
  interventionInternalReinforcements(iv).forEach(function(renfort){crews.push(renfort.equipage||[]);});
  return crews.some(function(equipage){
    return Array.isArray(equipage)&&equipage.some(function(member){
      if(!member||member.login!==login)return false;
      const role=String(member.role||'').toLowerCase();
      return role==='ca'||role.includes('chef d')&&role.includes('agr');
    });
  });
}

function interventionRoleKey(role){
  const key=String(role||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
  if(key==='ca'||key.startsWith('chefdagres'))return 'chefdagres';
  if(key==='cond'||key==='conductrice'||key.startsWith('conducteur'))return 'conducteur';
  if(key==='chefeq'||key.startsWith('chefdequipe'))return 'chefdequipe';
  if(key==='eq'||key==='equ'||key==='equipiere'||key.startsWith('equipier'))return 'equipier';
  return key;
}
function interventionMainReportCrew(iv){
  if(!iv)return[];
  const crew=[],seen=new Set();
  const add=function(login,role){
    if(!login||seen.has(login))return;
    seen.add(login);crew.push({login:login,role:role||'Agent'});
  };
  add(iv.agr,"Chef d'agrès");
  const vehicle=iv._engin1||iv.eng||'';
  if(vehicle){
    interventionConfiguredCrewSlots(iv).forEach(function(slot){
      const member=interventionConfiguredCrewMember(iv,slot);
      if(member)add(member.login,slot.role);
    });
  }else{
    (Array.isArray(iv._equipage1)?iv._equipage1:[]).forEach(function(member){
      if(member)add(member.login,member.role);
    });
  }
  return crew;
}
function allConfiguredCrewSlotsForVehicle(vehicle,roleConfig){
  const counters={},slots=[];
  const definitions=Array.isArray(roleConfig)&&roleConfig.length?roleConfig:getEnginRoles(vehicle);
  (Array.isArray(definitions)?definitions:[]).forEach(function(definition){
    const role=definition&&definition.role||'Agent';
    const key=interventionRoleKey(role)||'agent';
    const count=Math.max(0,parseInt(definition&&definition.n,10)||0);
    for(let index=0;index<count;index++){
      counters[key]=(counters[key]||0)+1;
      slots.push({role:role,key:key,ordinal:counters[key]});
    }
  });
  const totals={};
  slots.forEach(function(slot){totals[slot.key]=(totals[slot.key]||0)+1;});
  slots.forEach(function(slot){slot.total=totals[slot.key]||1;});
  return slots;
}
function interventionInternalReinforcements(iv){
  if(!iv)return [];
  const modern=(Array.isArray(iv._renfortsInternes)?iv._renfortsInternes:[]).filter(function(item){return item&&!item.missionLiee;}).map(function(item,index){
    if(!item.id)item.id='ri-'+String(index+1)+'-'+String(item.hDebut||'').replace(/\D/g,'');
    return item;
  });
  const legacy=[];
  (Array.isArray(iv._releves)?iv._releves:[]).forEach(function(releve,index){
    if(!releve||!releve.isRenfortInterne||releve._migratedInternal)return;
    legacy.push({
      id:'legacy-ri-'+index,
      hDebut:releve.hReleve||iv._hDebut||'',
      engin:releve.enginRenfort||releve.engin||'',
      equipage:(Array.isArray(releve.nouvelEquipage)?releve.nouvelEquipage:[]).filter(function(member){return member&&member.renfortInterne;}),
      roleConfig:Array.isArray(releve.roleConfig)?releve.roleConfig:null,
      _legacyReleveIndex:index
    });
  });
  return modern.concat(legacy);
}
function linkedInternalReinforcementsHTML(iv){
  const links=(Array.isArray(iv&&iv._renfortsInternes)?iv._renfortsInternes:[]).filter(function(item){return item&&item.missionLiee;});
  if(!links.length)return '';
  const labels={'en-attente':'En attente','selectionne':'Sélectionné','en-cours':'En cours','terminee':'Terminé'};
  const rows=links.map(function(link,index){
    const mission=IVS.find(function(item){return item&&item.id===(link.ivRenfortId||link.id);});
    const status=mission&&mission.s||link.statut||'en-attente';
    const chef=mission&&mission.agr||link.chefAgres||'';
    const vehicle=mission&&(mission._engin1||mission.eng)||link.engin||'';
    return '<button class="btn sm" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border-color:#A7F3D0;color:#065F46;margin-top:5px;text-align:left;" onclick="oM(\''+escHtml(link.ivRenfortId||link.id)+'\')"><span><strong>Renfort '+(index+1)+'</strong>'+(chef?' · '+escHtml(interventionTeammateName(chef)):'')+(vehicle?' · '+escHtml(vehicle):'')+'</span><span class="bdg" style="background:#D1FAE5;color:#047857;">'+escHtml(labels[status]||status)+'</span></button>';
  }).join('');
  return '<div class="mr"><div class="ml" style="color:#047857;">🏠 Missions de renfort interne</div><div class="mv2" style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:8px 10px;">'+rows+'</div></div>';
}
function interventionReportParticipants(iv){
  if(!iv)return [];
  const participants=[],seen=new Set();
  const add=function(member,fallbackRole){
    if(!member)return;
    const login=String(member.login||'').trim();
    if(!login||seen.has(login))return;
    seen.add(login);
    participants.push(Object.assign({},member,{login:login,role:member.role||fallbackRole||'Agent'}));
  };
  interventionMainReportCrew(iv).forEach(function(member){add(member,member&&member.role);});
  (Array.isArray(iv._equipage2)?iv._equipage2:[]).forEach(function(member){add(member,member&&member.role);});
  if(iv._agr2)add({login:iv._agr2,role:"Chef d'agrès"});

  // Les anciennes relèves internes migrées ne sont que des traces techniques.
  // Leur équipage corrigé est désormais lu dans _renfortsInternes.
  (Array.isArray(iv._releves)?iv._releves:[]).filter(function(releve){
    return releve&&!releve.isRenfortInterne&&!releve._migratedInternal;
  }).forEach(function(releve){
    (Array.isArray(releve.nouvelEquipage)?releve.nouvelEquipage:[]).forEach(function(member){add(member,member&&member.role);});
  });
  interventionInternalReinforcements(iv).forEach(function(renfort){
    (Array.isArray(renfort&&renfort.equipage)?renfort.equipage:[]).forEach(function(member){add(member,member&&member.role);});
  });
  return participants;
}
function interventionSupplementaryCrewRecords(iv){
  const records=[];
  if(iv&&(iv._engin2||(Array.isArray(iv._equipage2)&&iv._equipage2.length))){
    records.push({id:'secondary',kind:'secondary',label:'Deuxième véhicule',engin:iv._engin2||'',equipage:Array.isArray(iv._equipage2)?iv._equipage2:[],roleConfig:iv._engin2RoleConfig||null,hDebut:iv._hDebut||''});
  }
  interventionInternalReinforcements(iv).forEach(function(item,index){
    records.push(Object.assign({kind:'internal',label:'Renfort interne '+(index+1)},item));
  });
  return records;
}
function interventionCrewBadgesHTML(crew,color){
  const members=Array.isArray(crew)?crew:[];
  if(!members.length)return '<span style="font-size:11px;color:#64748B;">Aucun agent renseigné.</span>';
  return members.map(function(member){
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid '+color+';border-radius:7px;padding:3px 7px;font-size:11px;">'
      +'<span style="font-weight:700;color:#1D4ED8;">'+escHtml(member.role||'Agent')+'</span> '+escHtml(interventionTeammateName(member.login))+'</span>';
  }).join('');
}
function interventionSupplementaryCrewOptions(iv,recordId,currentLogin){
  const occupied=new Set();
  interventionMainReportCrew(iv).forEach(function(member){if(member&&member.login)occupied.add(member.login);});
  interventionSupplementaryCrewRecords(iv).forEach(function(record){
    if(record.id===recordId)return;
    (record.equipage||[]).forEach(function(member){if(member&&member.login)occupied.add(member.login);});
  });
  (Array.isArray(iv&&iv._releves)?iv._releves:[]).filter(function(releve){return releve&&releve.isRenfort&&!releve.isRenfortInterne;}).forEach(function(releve){
    (releve.nouvelEquipage||[]).forEach(function(member){if(member&&member.login)occupied.add(member.login);});
  });
  if(currentLogin)occupied.delete(currentLogin);
  const candidates=(USERS||[]).filter(function(user){return user&&user.l&&(user.l===currentLogin||!occupied.has(user.l));}).slice().sort(function(a,b){return fullName(a).localeCompare(fullName(b),'fr');});
  let html='<option value="">— Aucun agent —</option>';
  html+=candidates.map(function(user){return '<option value="'+escHtml(user.l)+'"'+(user.l===currentLogin?' selected':'')+'>'+escHtml(fullName(user))+'</option>';}).join('');
  if(currentLogin&&!candidates.some(function(user){return user.l===currentLogin;}))html+='<option value="'+escHtml(currentLogin)+'" selected>'+escHtml(interventionTeammateName(currentLogin))+'</option>';
  return html;
}
function supplementaryCrewDomKey(recordId){return String(recordId||'crew').replace(/[^a-zA-Z0-9_-]/g,'-');}
function interventionSupplementaryCrewFieldsHTML(iv,record,vehicle){
  const key=supplementaryCrewDomKey(record.id);
  const slots=allConfiguredCrewSlotsForVehicle(vehicle,record.roleConfig);
  const currentCrew=Array.isArray(record.equipage)?record.equipage:[];
  const used=new Set();
  return slots.map(function(slot){
    const matches=currentCrew.filter(function(member){return member&&interventionRoleKey(member.role)===slot.key&&!used.has(member.login);});
    let current=matches[slot.ordinal-1]||matches[0]||null;
    if(!current)current=currentCrew.find(function(member){return member&&!used.has(member.login);})||null;
    if(current)used.add(current.login);
    const label=slot.role+(slot.total>1?' '+slot.ordinal:'');
    return '<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">'+escHtml(label)+'</div><select class="fi" data-supplementary-slot="1" data-record-id="'+escHtml(record.id)+'" data-role-label="'+escHtml(slot.role)+'" data-role-key="'+escHtml(slot.key)+'" data-role-ordinal="'+slot.ordinal+'" id="cr-supp-'+key+'-'+slot.key+'-'+slot.ordinal+'">'+interventionSupplementaryCrewOptions(iv,record.id,current&&current.login||'')+'</select></div>';
  }).join('');
}
function interventionSupplementaryVehicleOptions(iv,record){
  const current=record&&record.engin||'';
  const vehicles=[current].concat(ASTR_CONFIG&&Array.isArray(ASTR_CONFIG.engins)?ASTR_CONFIG.engins:[]).filter(Boolean);
  const unique=[];
  vehicles.forEach(function(vehicle){if(!unique.some(function(existing){return nm(existing)===nm(vehicle);}))unique.push(vehicle);});
  return unique.map(function(vehicle){return '<option value="'+escHtml(vehicle)+'"'+(nm(vehicle)===nm(current)?' selected':'')+'>'+escHtml(vehicle)+'</option>';}).join('');
}
function interventionSupplementaryCrewsEditorHTML(iv){
  if(!iv||!CU)return '';
  const records=interventionSupplementaryCrewRecords(iv);
  if(!records.length)return '';
  const canManage=isInterventionReportChef(iv,CU.l)||hasAdministrativeAccount();
  return records.map(function(record,index){
    const key=supplementaryCrewDomKey(record.id);
    const title=record.kind==='internal'?'🏠 '+record.label:'🚒 '+record.label;
    const summary='<div style="display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 9px;">'+interventionCrewBadgesHTML(record.equipage,'#A7F3D0')+'</div>';
    if(!canManage)return '<div style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:10px;padding:10px 12px;margin-bottom:10px;"><div style="font-size:12px;font-weight:700;color:#0F766E;">'+title+' · '+escHtml(record.engin||'Véhicule non renseigné')+'</div>'+summary+'</div>';
    const fields=interventionSupplementaryCrewFieldsHTML(iv,record,record.engin||'');
    return '<div style="background:#F0FDFA;border:1px solid #5EEAD4;border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
      +'<div style="font-size:12px;font-weight:700;color:#0F766E;margin-bottom:7px;">'+title+'</div>'+summary
      +'<div class="fg" style="margin:0 0 9px;"><div class="fgl" style="font-size:11px;">Corriger le véhicule</div><select class="fi" id="cr-supp-vehicle-'+key+'" onchange="refreshSupplementaryCrewForVehicle(\''+escHtml(iv.id)+'\',\''+escHtml(record.id)+'\',this.value)">'+interventionSupplementaryVehicleOptions(iv,record)+'</select></div>'
      +'<div class="cr-teammate-grid" id="cr-supp-fields-'+key+'">'+(fields||'<div style="font-size:11px;color:#64748B;">Sélectionnez un véhicule.</div>')
      +'<button class="btn sm" style="background:#0F766E;color:#fff;white-space:nowrap;" onclick="saveSupplementaryInterventionCrew(\''+escHtml(iv.id)+'\',\''+escHtml(record.id)+'\')">💾 Enregistrer ce véhicule et son équipage</button></div></div>';
  }).join('');
}
function refreshSupplementaryCrewForVehicle(ivId,recordId,vehicle){
  const iv=IVS.find(function(item){return item.id===ivId;});if(!iv)return;
  let record=interventionSupplementaryCrewRecords(iv).find(function(item){return item.id===recordId;});
  const container=document.getElementById('cr-supp-fields-'+supplementaryCrewDomKey(recordId));
  if(!record||!container)return;
  record=Object.assign({},record,{roleConfig:null,engin:vehicle});
  container.innerHTML=interventionSupplementaryCrewFieldsHTML(iv,record,vehicle)
    +'<button class="btn sm" style="background:#0F766E;color:#fff;white-space:nowrap;" onclick="saveSupplementaryInterventionCrew(\''+escHtml(ivId)+'\',\''+escHtml(recordId)+'\')">💾 Enregistrer ce véhicule et son équipage</button>';
}
function mutableInternalReinforcement(iv,recordId){
  if(!Array.isArray(iv._renfortsInternes))iv._renfortsInternes=[];
  let target=iv._renfortsInternes.find(function(item){return item&&item.id===recordId;});
  if(target)return target;
  const legacy=interventionInternalReinforcements(iv).find(function(item){return item.id===recordId&&Number.isInteger(item._legacyReleveIndex);});
  if(!legacy)return null;
  target={id:'ri-'+Date.now(),hDebut:legacy.hDebut||iv._hDebut||'',engin:legacy.engin||'',equipage:(legacy.equipage||[]).map(function(member){return Object.assign({},member);}),roleConfig:legacy.roleConfig||null};
  iv._renfortsInternes.push(target);
  if(iv._releves&&iv._releves[legacy._legacyReleveIndex])iv._releves[legacy._legacyReleveIndex]._migratedInternal=true;
  return target;
}
function saveSupplementaryInterventionCrew(ivId,recordId){
  const iv=IVS.find(function(item){return item.id===ivId;});if(!iv||!CU)return;
  if(!isInterventionReportChef(iv,CU.l)&&!hasAdministrativeAccount()){showToast('Modification réservée au chef d’agrès ou à un administrateur.','warn');return;}
  const key=supplementaryCrewDomKey(recordId);
  const vehicleField=document.getElementById('cr-supp-vehicle-'+key);
  const vehicle=vehicleField&&vehicleField.value||'';
  if(!vehicle){showToast('Sélectionnez le véhicule de cet équipage.','warn');return;}
  const fields=Array.from(document.querySelectorAll('[data-supplementary-slot="1"][data-record-id="'+recordId+'"]'));
  const crew=fields.map(function(field){return {role:field.dataset.roleLabel||'Agent',login:field.value||''};}).filter(function(member){return member.login;});
  const logins=crew.map(function(member){return member.login;});
  if(new Set(logins).size!==logins.length){showToast('Un agent ne peut pas occuper deux places dans le même véhicule.','warn');return;}
  if(!crew.some(function(member){return interventionRoleKey(member.role)==='chefdagres';})){showToast('Renseignez le chef d’agrès de ce véhicule.','warn');return;}
  const otherVehicles=interventionVehicleNames(iv).filter(function(name){
    const current=interventionSupplementaryCrewRecords(iv).find(function(record){return record.id===recordId;});
    return !current||nm(name)!==nm(current.engin||'');
  });
  if(otherVehicles.some(function(name){return nm(name)===nm(vehicle);})){showToast('Ce véhicule est déjà engagé sur cette intervention.','warn');return;}
  const occupied=new Set();
  interventionMainReportCrew(iv).forEach(function(member){if(member&&member.login)occupied.add(member.login);});
  interventionSupplementaryCrewRecords(iv).forEach(function(record){if(record.id!==recordId)(record.equipage||[]).forEach(function(member){if(member&&member.login)occupied.add(member.login);});});
  const duplicate=logins.find(function(login){return occupied.has(login);});
  if(duplicate){showToast(interventionTeammateName(duplicate)+' est déjà affecté à un autre véhicule de cette intervention.','warn');return;}
  for(const login of logins){const conflict=findActivePersonnelConflict(login,iv.id);if(conflict){showOperationalConflict('personnel',login,conflict);return;}}
  const vehicleConflict=findActiveVehicleConflict(vehicle,iv.id);if(vehicleConflict){showOperationalConflict('vehicle',vehicle,vehicleConflict);return;}
  const reportField=document.getElementById('cr-texte');if(reportField)writeCompteRenduDraft(ivId,reportField.value);
  let target;
  if(recordId==='secondary'){
    iv._engin2=vehicle;iv._equipage2=crew;iv._engin2RoleConfig=JSON.parse(JSON.stringify(getEnginRoles(vehicle)));target={kind:'secondary'};
  }else{
    target=mutableInternalReinforcement(iv,recordId);if(!target)return;
    target.engin=vehicle;target.equipage=crew;target.roleConfig=JSON.parse(JSON.stringify(getEnginRoles(vehicle)));
  }
  pushTL(iv,'modif-equipage',CU.l,(recordId==='secondary'?'Deuxième véhicule':'Renfort interne')+' corrigé : '+vehicle+' · '+crew.map(function(member){return member.role+' '+interventionTeammateName(member.login);}).join(', '));
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rI();rHist();showCompteRenduModal(ivId);showToast('Véhicule et équipage enregistrés dans le rapport.','success');
}
function interventionMainCrewRoleMember(iv,roleKey){
  const crew=Array.isArray(iv&&iv._equipage1)?iv._equipage1:[];
  return crew.find(function(member){return member&&interventionRoleKey(member.role)===roleKey;})||null;
}
function interventionMainDriver(iv){
  return interventionMainCrewRoleMember(iv,'conducteur');
}
function interventionMainTeammate(iv){
  return interventionMainCrewRoleMember(iv,'equipier');
}
function interventionTeammateName(login){
  if(!login)return 'Aucun';
  const user=USERS.find(function(item){return item.l===login;});
  return user?fullName(user):login;
}
function interventionConfiguredCrewMember(iv,slot){
  const matches=(Array.isArray(iv&&iv._equipage1)?iv._equipage1:[]).filter(function(member){
    return member&&member.login!==iv.agr&&interventionRoleKey(member.role)===slot.key;
  });
  return matches[slot.ordinal-1]||null;
}
function interventionTeammateEditorHTMLLegacy(iv){
  if(!iv||!CU)return '';
  const current=interventionMainTeammate(iv);
  const reportCrew=interventionMainReportCrew(iv);
  const canManage=isInterventionReportChef(iv,CU.l)||hasAdministrativeAccount();
  const currentLogin=current&&current.login||'';
  const crewSummary=reportCrew.length?reportCrew.map(function(member){
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid #BFDBFE;border-radius:7px;padding:3px 7px;font-size:11px;">'
      +'<span style="color:#1D4ED8;font-weight:700;">'+escHtml(member.role||'Agent')+'</span> '
      +escHtml(interventionTeammateName(member.login))+'</span>';
  }).join(''):'<span style="font-size:12px;color:#64748B;">Aucun agent renseigné.</span>';
  const crewHeader='<div style="font-size:12px;font-weight:700;color:#1D4ED8;margin-bottom:7px;">🚒 Équipage repris dans le rapport</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:'+(canManage?'10':'0')+'px;">'+crewSummary+'</div>';
  if(!canManage){
    return '<div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
      +crewHeader+'</div>';
  }
  const occupied=new Set();
  [iv._equipage1,iv._equipage2].forEach(function(crew){
    (Array.isArray(crew)?crew:[]).forEach(function(member){
      if(member&&member.login&&member.login!==currentLogin)occupied.add(member.login);
    });
  });
  if(iv.agr)occupied.add(iv.agr);
  if(iv._agr2)occupied.add(iv._agr2);
  const candidates=USERS.filter(function(user){return user&&user.l&&!occupied.has(user.l);}).slice().sort(function(a,b){
    return fullName(a).localeCompare(fullName(b),'fr');
  });
  if(currentLogin&&!candidates.some(function(user){return user.l===currentLogin;})){
    const currentUser=USERS.find(function(user){return user.l===currentLogin;});
    if(currentUser)candidates.unshift(currentUser);
  }
  let options='<option value="">\u2014 Aucun équipier supplémentaire \u2014</option>';
  options+=candidates.map(function(user){
    return '<option value="'+escHtml(user.l)+'"'+(user.l===currentLogin?' selected':'')+'>'+escHtml(fullName(user))+'</option>';
  }).join('');
  if(currentLogin&&!USERS.some(function(user){return user.l===currentLogin;})){
    options+='<option value="'+escHtml(currentLogin)+'" selected>'+escHtml(currentLogin)+'</option>';
  }
  return '<div style="background:#EFF6FF;border:1px solid #93C5FD;border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
    +crewHeader
    +'<div class="cr-teammate-grid">'
    +'<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Ajouter ou corriger un équipier</div><select class="fi" id="cr-equipier" style="min-width:0;">'+options+'</select></div>'
    +'<button class="btn sm" style="background:#2563EB;color:#fff;white-space:nowrap;" onclick="saveInterventionTeammate(\''+escHtml(iv.id)+'\')">\ud83d\udcbe Enregistrer</button>'
    +'</div><div style="font-size:10px;color:#64748B;margin-top:6px;">Le conducteur affecté est repris automatiquement. Toute correction d’un équipier est ajoutée à l’historique, au rapport et aux exports.</div></div>';
}
function saveInterventionTeammateLegacy(ivId){
  const iv=IVS.find(function(item){return item.id===ivId;});if(!iv||!CU)return;
  if(!isInterventionReportChef(iv,CU.l)&&!hasAdministrativeAccount()){
    showToast('Modification r\u00e9serv\u00e9e au chef d\u2019agr\u00e8s de l\u2019intervention ou \u00e0 un administrateur.','warn');return;
  }
  const field=document.getElementById('cr-equipier');if(!field)return;
  const before=interventionMainTeammate(iv);
  const beforeLogin=before&&before.login||'';
  const afterLogin=field.value||'';
  if(beforeLogin===afterLogin){showToast('L\u2019\u00e9quipier est d\u00e9j\u00e0 enregistr\u00e9.','info');return;}
  const duplicate=[iv._equipage1,iv._equipage2].some(function(crew){
    return (Array.isArray(crew)?crew:[]).some(function(member){
      return member&&member.login===afterLogin&&interventionRoleKey(member.role)!=='equipier';
    });
  });
  if(afterLogin&&duplicate){showToast('Cet agent est d\u00e9j\u00e0 enregistr\u00e9 avec une autre fonction dans l\u2019\u00e9quipage.','warn');return;}
  const reportField=document.getElementById('cr-texte');
  if(reportField)writeCompteRenduDraft(ivId,reportField.value);
  const crew=(Array.isArray(iv._equipage1)?iv._equipage1:[]).filter(function(member){
    return !member||interventionRoleKey(member.role)!=='equipier';
  });
  if(afterLogin)crew.push({role:'\u00c9quipier',login:afterLogin});
  iv._equipage1=crew;
  if(!Array.isArray(iv._equipierModifications))iv._equipierModifications=[];
  iv._equipierModifications.push({date:getH(N()),auteur:CU.l,avant:beforeLogin||null,apres:afterLogin||null});
  let note='\u00c9quipier retir\u00e9 : '+interventionTeammateName(beforeLogin);
  if(!beforeLogin&&afterLogin)note='\u00c9quipier ajout\u00e9 : '+interventionTeammateName(afterLogin);
  else if(beforeLogin&&afterLogin)note='\u00c9quipier modifi\u00e9 : '+interventionTeammateName(beforeLogin)+' \u2192 '+interventionTeammateName(afterLogin);
  pushTL(iv,'modif-equipier',CU.l,note);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rI();rHist();
  showCompteRenduModal(ivId);
  showToast('Composition de l\u2019\u00e9quipage enregistr\u00e9e.','success');
}

function interventionCrewRoleOptions(iv,roleKey,currentLogin,emptyLabel,allowMainCrewReassignment){
  const occupied=new Set();
  [iv._equipage1,iv._equipage2].forEach(function(crew){
    (Array.isArray(crew)?crew:[]).forEach(function(member){
      if(member&&member.login&&interventionRoleKey(member.role)!==roleKey){
        const isMainCrew=Array.isArray(iv._equipage1)&&iv._equipage1.includes(member);
        if(!allowMainCrewReassignment||!isMainCrew)occupied.add(member.login);
      }
    });
  });
  interventionInternalReinforcements(iv).forEach(function(renfort){
    (renfort.equipage||[]).forEach(function(member){if(member&&member.login&&member.login!==currentLogin)occupied.add(member.login);});
  });
  if(iv.agr)occupied.add(iv.agr);
  if(iv._agr2)occupied.add(iv._agr2);
  const candidates=USERS.filter(function(user){return user&&user.l&&!occupied.has(user.l);}).slice().sort(function(a,b){
    return fullName(a).localeCompare(fullName(b),'fr');
  });
  if(currentLogin&&!candidates.some(function(user){return user.l===currentLogin;})){
    const currentUser=USERS.find(function(user){return user.l===currentLogin;});
    if(currentUser)candidates.unshift(currentUser);
  }
  let options='<option value="">\u2014 '+emptyLabel+' \u2014</option>';
  options+=candidates.map(function(user){
    return '<option value="'+escHtml(user.l)+'"'+(user.l===currentLogin?' selected':'')+'>'+escHtml(fullName(user))+'</option>';
  }).join('');
  if(currentLogin&&!USERS.some(function(user){return user.l===currentLogin;})){
    options+='<option value="'+escHtml(currentLogin)+'" selected>'+escHtml(currentLogin)+'</option>';
  }
  return options;
}
function interventionReportCrewSlotId(slot){
  if(slot.key==='conducteur'&&slot.ordinal===1)return 'cr-conducteur';
  if(slot.key==='equipier'&&slot.ordinal===1)return 'cr-equipier';
  if(slot.key==='chefdequipe'&&slot.ordinal===1)return 'cr-chef-equipe';
  return 'cr-crew-'+slot.key+'-'+slot.ordinal;
}
function interventionReportCrewFieldHTML(iv,slot,currentLogin){
  const options=interventionCrewRoleOptions(iv,slot.key,currentLogin,'Aucun agent',true);
  const label='Ajouter ou corriger '+slot.role.toLowerCase()+(slot.total>1?' '+slot.ordinal:'');
  const attrs=' data-report-crew-slot="1" data-role-key="'+escHtml(slot.key)+'" data-role-label="'+escHtml(slot.role)+'" data-role-ordinal="'+slot.ordinal+'"';
  if(slot.key==='conducteur'&&slot.ordinal===1){
    return '<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Ajouter ou corriger le conducteur</div><select class="fi" id="cr-conducteur"'+attrs+' style="min-width:0;">'+options+'</select></div>';
  }
  if(slot.key==='equipier'&&slot.ordinal===1){
    return '<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">Ajouter ou corriger l’équipier</div><select class="fi" id="cr-equipier"'+attrs+' style="min-width:0;">'+options+'</select></div>';
  }
  return '<div class="fg" style="margin:0;"><div class="fgl" style="font-size:11px;">'+escHtml(label)+'</div><select class="fi" id="'+escHtml(interventionReportCrewSlotId(slot))+'"'+attrs+' style="min-width:0;">'+options+'</select></div>';
}
function interventionReportVehicleOptions(iv){
  const current=iv&&((iv._engin1||iv.eng))||'';
  const vehicles=[current].concat(ASTR_CONFIG&&Array.isArray(ASTR_CONFIG.engins)?ASTR_CONFIG.engins:[]).filter(Boolean);
  const unique=[];
  vehicles.forEach(function(vehicle){
    if(!unique.some(function(existing){return nm(existing)===nm(vehicle);}))unique.push(vehicle);
  });
  return unique.map(function(vehicle){
    return '<option value="'+escHtml(vehicle)+'"'+(nm(vehicle)===nm(current)?' selected':'')+'>'+escHtml(vehicle)+'</option>';
  }).join('');
}
function interventionReportCrewFieldsHTML(iv,vehicle){
  const slots=configuredCrewSlotsForVehicle(vehicle);
  const currentCrew=(Array.isArray(iv&&iv._equipage1)?iv._equipage1:[]).filter(function(member){
    return member&&member.login&&member.login!==iv.agr;
  });
  const used=new Set();
  return slots.map(function(slot){
    const sameRole=currentCrew.filter(function(member){
      return interventionRoleKey(member.role)===slot.key&&!used.has(member.login);
    });
    let current=sameRole[slot.ordinal-1]||sameRole[0]||null;
    if(!current)current=currentCrew.find(function(member){return !used.has(member.login);})||null;
    if(current)used.add(current.login);
    return interventionReportCrewFieldHTML(iv,slot,current&&current.login||'');
  }).join('');
}
function refreshInterventionReportCrewForVehicle(ivId,vehicle){
  const iv=IVS.find(function(item){return item.id===ivId;});
  const container=document.getElementById('cr-crew-fields');
  if(!iv||!container)return;
  const fields=interventionReportCrewFieldsHTML(iv,vehicle);
  container.innerHTML=(fields||'<div style="font-size:11px;color:#64748B;">Aucune place suppl&eacute;mentaire d&eacute;finie pour ce type d&rsquo;engin.</div>')
    +'<button class="btn sm" style="background:#2563EB;color:#fff;white-space:nowrap;" onclick="saveInterventionTeammate(\''+escHtml(iv.id)+'\')">&#128190; Enregistrer le v&eacute;hicule et l&rsquo;&eacute;quipage</button>';
  const places=getEnginNbPlaces(vehicle);
  const info=document.getElementById('cr-vehicle-place-info');
  if(info)info.textContent=places+' place'+(places>1?'s':'')+' d&eacute;finie'+(places>1?'s':'')+' pour cet engin';
}
function interventionTeammateEditorHTML(iv){
  if(!iv||!CU)return '';
  const vehicle=iv._engin1||iv.eng||'';
  const configuredSlots=interventionConfiguredCrewSlots(iv);
  const reportCrew=interventionMainReportCrew(iv);
  const canManage=isInterventionReportChef(iv,CU.l)||hasAdministrativeAccount();
  const crewSummary=reportCrew.length?reportCrew.map(function(member){
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid #BFDBFE;border-radius:7px;padding:3px 7px;font-size:11px;">'
      +'<span style="color:#1D4ED8;font-weight:700;">'+escHtml(member.role||'Agent')+'</span> '
      +escHtml(interventionTeammateName(member.login))+'</span>';
  }).join(''):'<span style="font-size:12px;color:#64748B;">Aucun agent renseign\u00e9.</span>';
  const configuredPlaces=interventionConfiguredCrewPlaceCount(iv);
  const vehicleInfo=vehicle?'<span style="font-size:10px;font-weight:500;color:#475569;margin-left:6px;">'+escHtml(vehicle)+' · '+configuredPlaces+' place'+(configuredPlaces>1?'s':'')+' définie'+(configuredPlaces>1?'s':'')+' au départ</span>':'';
  const crewHeader='<div style="font-size:12px;font-weight:700;color:#1D4ED8;margin-bottom:7px;">\ud83d\ude92 \u00c9quipage repris dans le rapport'+vehicleInfo+'</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:'+(canManage?'10':'0')+'px;">'+crewSummary+'</div>';
  if(!canManage){
    return '<div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
      +crewHeader+'</div>';
  }
  const configuredFields=interventionReportCrewFieldsHTML(iv,vehicle);
  return '<div style="background:#EFF6FF;border:1px solid #93C5FD;border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
    +crewHeader
    +'<div class="fg" style="margin:0 0 9px 0;"><div class="fgl" style="font-size:11px;">Corriger le v&eacute;hicule principal</div>'
    +'<select class="fi" id="cr-vehicle" style="min-width:0;" onchange="refreshInterventionReportCrewForVehicle(\''+escHtml(iv.id)+'\',this.value)">'+interventionReportVehicleOptions(iv)+'</select>'
    +'<div id="cr-vehicle-place-info" style="font-size:10px;color:#64748B;margin-top:3px;">'+configuredPlaces+' place'+(configuredPlaces>1?'s':'')+' d&eacute;finie'+(configuredPlaces>1?'s':'')+' pour cet engin</div></div>'
    +'<div class="cr-teammate-grid" id="cr-crew-fields">'
    +(configuredFields||'<div style="font-size:11px;color:#64748B;">Aucune place supplémentaire définie pour ce type d’engin.</div>')
    +'<button class="btn sm" style="background:#2563EB;color:#fff;white-space:nowrap;" onclick="saveInterventionTeammate(\''+escHtml(iv.id)+'\')">\ud83d\udcbe Enregistrer le v&eacute;hicule et l\u2019\u00e9quipage</button>'
    +'</div><div style="font-size:10px;color:#64748B;margin-top:6px;">Les places correspondent au type d’engin configuré par le superadmin. Toute correction est ajoutée à l’historique, au rapport et aux exports.</div></div>';
}
function saveInterventionTeammate(ivId){
  const iv=IVS.find(function(item){return item.id===ivId;});if(!iv||!CU)return;
  if(!isInterventionReportChef(iv,CU.l)&&!hasAdministrativeAccount()){
    showToast('Modification r\u00e9serv\u00e9e au chef d\u2019agr\u00e8s de l\u2019intervention ou \u00e0 un administrateur.','warn');return;
  }
  const vehicleField=document.getElementById('cr-vehicle');
  const selectedVehicle=vehicleField?vehicleField.value||'':(iv._engin1||iv.eng||'');
  const configuredFields=document.querySelectorAll?Array.from(document.querySelectorAll('[data-report-crew-slot="1"]')):[];
  if(configuredFields.length||vehicleField){saveInterventionConfiguredCrew(iv,configuredFields,selectedVehicle);return;}
  const driverField=document.getElementById('cr-conducteur');
  const teammateField=document.getElementById('cr-equipier');
  if(!driverField&&!teammateField)return;
  const beforeDriver=interventionMainDriver(iv);
  const beforeTeammate=interventionMainTeammate(iv);
  const beforeDriverLogin=beforeDriver&&beforeDriver.login||'';
  const beforeTeammateLogin=beforeTeammate&&beforeTeammate.login||'';
  const afterDriverLogin=driverField?driverField.value||'':beforeDriverLogin;
  const afterTeammateLogin=teammateField?teammateField.value||'':beforeTeammateLogin;
  if(beforeDriverLogin===afterDriverLogin&&beforeTeammateLogin===afterTeammateLogin){showToast('L\u2019\u00e9quipage est d\u00e9j\u00e0 enregistr\u00e9.','info');return;}
  if(afterDriverLogin&&afterDriverLogin===afterTeammateLogin){showToast('Le conducteur et l\u2019\u00e9quipier doivent \u00eatre deux agents diff\u00e9rents.','warn');return;}
  const duplicate=[iv._equipage1,iv._equipage2].some(function(crew){
    return (Array.isArray(crew)?crew:[]).some(function(member){
      const role=member&&interventionRoleKey(member.role);
      if(role==='conducteur'||role==='equipier')return false;
      return member&&(member.login===afterDriverLogin||member.login===afterTeammateLogin);
    });
  });
  const chiefs=[iv.agr,iv._agr2].filter(Boolean);
  if(duplicate||chiefs.includes(afterDriverLogin)||chiefs.includes(afterTeammateLogin)){
    showToast('Cet agent est d\u00e9j\u00e0 enregistr\u00e9 avec une autre fonction dans l\u2019\u00e9quipage.','warn');return;
  }
  const reportField=document.getElementById('cr-texte');
  if(reportField)writeCompteRenduDraft(ivId,reportField.value);
  const crew=(Array.isArray(iv._equipage1)?iv._equipage1:[]).filter(function(member){
    const role=member&&interventionRoleKey(member.role);
    return role!=='conducteur'&&role!=='equipier';
  });
  if(afterDriverLogin)crew.push({role:'Conducteur',login:afterDriverLogin});
  if(afterTeammateLogin)crew.push({role:'\u00c9quipier',login:afterTeammateLogin});
  iv._equipage1=crew;
  if(!Array.isArray(iv._equipierModifications))iv._equipierModifications=[];
  const notes=[];
  const traceRole=function(roleLabel,roleKey,beforeLogin,afterLogin){
    if(beforeLogin===afterLogin)return;
    iv._equipierModifications.push({date:getH(N()),auteur:CU.l,role:roleKey,avant:beforeLogin||null,apres:afterLogin||null});
    if(!beforeLogin&&afterLogin)notes.push(roleLabel+' ajout\u00e9 : '+interventionTeammateName(afterLogin));
    else if(beforeLogin&&!afterLogin)notes.push(roleLabel+' retir\u00e9 : '+interventionTeammateName(beforeLogin));
    else notes.push(roleLabel+' modifi\u00e9 : '+interventionTeammateName(beforeLogin)+' \u2192 '+interventionTeammateName(afterLogin));
  };
  traceRole('Conducteur','conducteur',beforeDriverLogin,afterDriverLogin);
  traceRole('\u00c9quipier','equipier',beforeTeammateLogin,afterTeammateLogin);
  pushTL(iv,'modif-equipier',CU.l,notes.join(' \u00b7 '));
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rI();rHist();
  showCompteRenduModal(ivId);
  showToast('Composition de l\u2019\u00e9quipage enregistr\u00e9e.','success');
}

function saveInterventionConfiguredCrew(iv,fields,selectedVehicle){
  const beforeVehicle=iv._engin1||iv.eng||'';
  const afterVehicle=selectedVehicle||beforeVehicle;
  const vehicleChanged=nm(beforeVehicle)!==nm(afterVehicle);
  if(!afterVehicle){showToast('Sélectionnez un véhicule pour le rapport.','warn');return;}
  if(iv._engin2&&nm(afterVehicle)===nm(iv._engin2)){
    showToast('Le même véhicule ne peut pas être affecté aux deux engins de l’intervention.','warn');return;
  }
  if(iv.s==='en-cours'){
    const vehicleConflict=findActiveVehicleConflict(afterVehicle,iv.id);
    if(vehicleConflict){showOperationalConflict('vehicle',afterVehicle,vehicleConflict);return;}
  }
  const selected=fields.map(function(field){
    return {login:field.value||'',role:field.dataset.roleLabel||'Agent',key:field.dataset.roleKey||interventionRoleKey(field.dataset.roleLabel),ordinal:parseInt(field.dataset.roleOrdinal,10)||1};
  });
  const logins=selected.map(function(item){return item.login;}).filter(Boolean);
  const occupiedOutside=[iv._agr2].concat((Array.isArray(iv._equipage2)?iv._equipage2:[]).map(function(member){return member&&member.login;})).filter(Boolean);
  interventionInternalReinforcements(iv).forEach(function(renfort){(renfort.equipage||[]).forEach(function(member){if(member&&member.login)occupiedOutside.push(member.login);});});
  if(new Set(logins).size!==logins.length||logins.includes(iv.agr)||logins.some(function(login){return occupiedOutside.includes(login);})){
    showToast('Chaque place de l’équipage doit être occupée par un agent différent.','warn');return;
  }
  if(iv.s==='en-cours'){
    const personnelConflict=logins.map(function(login){
      return {login:login,iv:findActivePersonnelConflict(login,iv.id)};
    }).find(function(item){return item.iv;});
    if(personnelConflict){showOperationalConflict('personnel',personnelConflict.login,personnelConflict.iv);return;}
  }
  const beforeCrew=Array.isArray(iv._equipage1)?iv._equipage1.slice():[];
  const previousBySlot={};
  interventionConfiguredCrewSlots(iv).forEach(function(slot){
    const member=interventionConfiguredCrewMember(iv,slot);
    previousBySlot[slot.key+'-'+slot.ordinal]=member&&member.login||'';
  });
  const chiefExisting=beforeCrew.find(function(member){return member&&member.login===iv.agr;});
  const nextCrew=iv.agr?[Object.assign({},chiefExisting||{},{role:'CA',login:iv.agr})]:[];
  selected.forEach(function(item){
    if(!item.login)return;
    const existing=beforeCrew.find(function(member){return member&&member.login===item.login;});
    nextCrew.push(Object.assign({},existing||{},{role:item.role,login:item.login}));
  });
  const changes=[];
  selected.forEach(function(item){
    const before=previousBySlot[item.key+'-'+item.ordinal]||'';
    if(before===item.login)return;
    const place=item.role+(fields.filter(function(field){return field.dataset.roleKey===item.key;}).length>1?' '+item.ordinal:'');
    if(!before&&item.login)changes.push(place+' ajouté : '+interventionTeammateName(item.login));
    else if(before&&!item.login)changes.push(place+' retiré : '+interventionTeammateName(before));
    else changes.push(place+' modifié : '+interventionTeammateName(before)+' → '+interventionTeammateName(item.login));
  });
  if(!changes.length&&!vehicleChanged){showToast('Le véhicule et l’équipage sont déjà enregistrés.','info');return;}
  const reportField=document.getElementById('cr-texte');
  if(reportField)writeCompteRenduDraft(iv.id,reportField.value);
  if(vehicleChanged){
    iv._engin1=afterVehicle;
    iv.eng=afterVehicle;
    iv._engin1RoleConfig=JSON.parse(JSON.stringify(getEnginRoles(afterVehicle)));
    if(!Array.isArray(iv._enginModifications))iv._enginModifications=[];
    iv._enginModifications.push({date:getH(N()),auteur:CU.l,avant:beforeVehicle||null,apres:afterVehicle});
  }
  iv._equipage1=nextCrew;
  if(changes.length){
    if(!Array.isArray(iv._equipierModifications))iv._equipierModifications=[];
    iv._equipierModifications.push({date:getH(N()),auteur:CU.l,role:'equipage-configure',details:changes.slice()});
  }
  const notes=[];
  if(vehicleChanged)notes.push('Véhicule modifié : '+(beforeVehicle||'Aucun')+' → '+afterVehicle);
  if(changes.length)notes.push(changes.join(' · '));
  pushTL(iv,vehicleChanged?'modif-engin':'modif-equipier',CU.l,notes.join(' · '));
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rI();rHist();
  showCompteRenduModal(iv.id);
  showToast('Véhicule et composition de l’équipage enregistrés dans le rapport.','success');
}

const _pendingNextInterventionStarts={};

function interventionById(id){
  return (IVS||[]).find(function(iv){return iv&&iv.id===id;})||(PILP_IVS||[]).find(function(iv){return iv&&iv.id===id;})||null;
}
function interventionCollection(iv){
  return iv&&(PILP_IVS||[]).includes(iv)?PILP_IVS:IVS;
}
function isPilpIntervention(iv){
  return !!(iv&&(PILP_IVS||[]).includes(iv));
}
function refreshOperationalInterventionViews(){
  rI();rPilp();
}
function markOperationalInterventionDirty(iv){
  if(!iv)return;
  if(CD()){CD().ivs=IVS;CD().pilpIvs=PILP_IVS;}
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcPendingDirty!=='undefined'&&typeof _rcId==='function'&&CURRENT_CASERNE_ID){
    _rcPendingDirty.add(_rcId(CURRENT_CASERNE_ID,isPilpIntervention(iv)?'pilp':'iv',iv.id));
    if(typeof _rcDirtyGeneration!=='undefined')_rcDirtyGeneration++;
    if(typeof _rcPersistPendingDirty==='function')_rcPersistPendingDirty();
  }
}

function reqAvailabilityBadgeHTML(iv){
  const dispo=iv&&iv.reqDispo;
  if(!dispo||!dispo.label)return'';
  const unavailable=dispo.state==='indisponible';
  const mixed=dispo.state==='mixte';
  const color=mixed?'#854D0E':unavailable?'#991B1B':'#166534';
  const bg=mixed?'#FEF9C3':unavailable?'#FEE2E2':'#DCFCE7';
  const icon=mixed?'&#x1F4C5;':unavailable?'&#x274C;':'&#x2705;';
  return '<div class="iv-req-dispo" title="'+escHtml(dispo.label)+'" style="margin-top:3px;display:flex;align-items:flex-start;gap:4px;font-size:10px;font-weight:600;color:'+color+';">'
    +'<span style="flex:0 0 auto;background:'+bg+';border-radius:5px;padding:1px 5px;">'+icon+' Requérant</span>'
    +'<span style="min-width:0;white-space:normal;line-height:1.25;">'+escHtml(dispo.label)+'</span></div>';
}

// === P8 : Fonction de rendu dédiée (évite XSS + facilite les tests) ===
/**
 * Génère le HTML d'une ligne d'intervention pour la liste.
 * Toutes les données utilisateur passent par escHtml().
 * @param {object} iv - Objet intervention
 * @param {boolean} ag - L'utilisateur est chef d'agrès
 * @param {boolean} tireur - L'utilisateur est tireur PILP
 * @returns {string} HTML de la ligne
 */
function renderInterventionRow(iv, ag, tireur) {
  const STATUS_BADGE = {
    'en-attente':['br','En attente'],
    'selectionne':['bsel','Sélect.'],
    'en-cours':['ba','En cours'],
    'terminee':['bg2','Terminée'],
  };
  const [bc, bt] = STATUS_BADGE[iv.s] || ['bgr', '—'];
  const isPilp = iv.id.startsWith('PILP');
  const isRenfortInternal = iv._isRenfortInterneMission === true;
  const isRenfortUT = iv._isRenfort === true && !isRenfortInternal;
  const chkShow = (ag || tireur) && !isRenfortUT && (iv.s === 'en-attente' || (iv.s === 'selectionne' && iv.agr === CU.l));
  const checked = iv.s === 'selectionne' && iv.agr === CU.l;
  const onchg = isPilp ? `toggleChkPilp('${iv.id}',this)` : `toggleChk('${iv.id}',this)`;
  const onclick = isPilp ? `oPilp('${iv.id}')` : `oM('${iv.id}')`;

  const numBadges = iv.s === 'terminee' ? (
    iv._isRenfort
      ? (iv._numGlobal || iv._numRenfort
          ? ` · ${iv._numGlobal ? `<span style="color:#1A6B1A;font-weight:600;font-size:10px;">C:${escHtml(String(iv._numGlobal))}</span> ` : ''}${iv._numRenfort ? `<span style="color:#7C3AED;font-weight:600;font-size:10px;">Renfort:${escHtml(String(iv._numRenfort))}</span>` : ''}` : '')
      : (iv._numGlobal || iv._numCaserne || iv._numMois
          ? ` · <span style="font-size:10px;">${iv._numGlobal ? `<span style="color:#1A6B1A;font-weight:600;">C:${escHtml(String(iv._numGlobal))}</span> ` : ''}${iv._numCaserne ? `<span style="color:#6A0DAD;font-weight:600;">UT:${escHtml(String(iv._numCaserne))}</span> ` : ''}${iv._numMois ? `<span style="color:#C0392B;font-weight:600;">M:${escHtml(String(iv._numMois))}</span>` : ''}${iv._numSDIS ? ` <span style="color:#003399;font-weight:600;">S:${escHtml(String(iv._numSDIS))}</span>` : ''}</span>` : '')
  ) : '';

  return `<div class="ivr ${iv.s}${isPilp ? ' pilp' : ''}${iv._isRenfort ? ' renfort-ut' : ''}${iv._urgence ? ' urgence' : ''}">
    ${chkShow ? `<div class="ivr-chk"><input type="checkbox" ${checked ? 'checked' : ''} onchange="${onchg}"/></div>` : ''}
    <div class="ivrl" onclick="${onclick}">
      <div class="ivrh">&#x1F4C5; ${(iv.h || '').slice(0, 8)}${isRenfortUT ? ' <span style="background:#7C3AED;color:#fff;border-radius:4px;padding:0 5px;font-size:9px;font-weight:700;margin-left:4px;">RENFORT UT</span>' : isRenfortInternal ? ' <span style="background:#047857;color:#fff;border-radius:4px;padding:0 5px;font-size:9px;font-weight:700;margin-left:4px;">RENFORT INTERNE</span>' : ''}</div>
      <div class="ivrn">${isPilp ? '&#x1F3AF; ' : ''}${escHtml(iv.n)}${isRenfortUT ? ` <span style="font-size:10px;color:#7C3AED;font-weight:400;">— ${escHtml(iv._caserneSourceNom || '')}</span>` : isRenfortInternal ? ` <span style="font-size:10px;color:#047857;font-weight:400;">— pour ${escHtml(iv._sourceInterventionNumber || iv._ivSourceId || '')}</span>` : ''}${iv._avisPassage ? ' <span style="background:#9B59B6;color:#fff;border-radius:4px;padding:0 5px;font-size:9px;font-weight:700;margin-left:4px;">🟣 Avis passage</span>' : ''}</div>
      <div class="ivrc">&#x1F4CD; ${escHtml(interventionAddressLabel(iv))}${iv.eng ? ' · ' + escHtml(iv.eng) : ''}${isRenfortUT && iv._hDebut ? ' · depuis ' + escHtml(iv._hDebut) : ''}${numBadges}</div>
      ${iv.s==='en-attente'?reqAvailabilityBadgeHTML(iv):''}
    </div>
    <div class="ivrr" onclick="${onclick}">
      ${interventionRouteBadgeHTML(iv)}
      <span class="bdg ${bc}">${bt}</span>
      ${isPilp ? '<span class="bdg bpilp" style="font-size:10px;">PILP</span>' : ''}
      ${isRenfortUT ? '<span class="bdg" style="background:#7C3AED;color:#fff;font-size:10px;">Renfort UT</span>' : isRenfortInternal ? '<span class="bdg" style="background:#047857;color:#fff;font-size:10px;">Renfort interne</span>' : ''}
      ${iv._urgence ? '<span class="bdg" style="background:#B91C1C;color:#fff;font-size:10px;font-weight:700;">🚨 URGENCE ERP</span>' : ''}
      ${iv._sdis ? '<span class="bdg" style="background:#1D4ED8;color:#fff;font-size:10px;font-weight:700;">SDIS</span>' : ''}
      ${(iv._heureDebutModifiee&&hasAdministrativeAccount()||iv._heureFinModifiee&&hasAdministrativeAccount())&&!iv._sdis ? '<span class="bdg" title="Horaire corrigé — consulter la traçabilité" style="background:#FFF7ED;color:#9A3412;border:1px solid #FDBA74;font-size:10px;font-weight:700;">&#x23F1; Horaire corrigé</span>' : ''}
      ${iv._echelleToiture ? '<span class="bdg" style="background:#F59E0B;color:#fff;font-size:10px;">Echelle de toit</span>' : ''}
      ${iv._epa ? '<span class="bdg" style="background:#8E44AD;color:#fff;font-size:10px;">EPA</span>' : ''}
      ${iv.rappels ? `<span class="bdg bp" style="font-size:10px;${isAdminModeActive()?'cursor:pointer;':''}"${isAdminModeActive()?` title="Déjà intervenu ici ?" onclick="event.stopPropagation();showInterventionsLiees('${iv.id}')"`:''}>${iv.rappels}×</span>` : ''}
      ${iv.s === 'terminee' && iv._crValide ? '<span title="Compte rendu validé" style="font-size:12px;">📋✔</span>' : iv.s === 'terminee' && (iv._crTexte || iv._compteRendu) ? '<span title="Compte rendu rédigé" style="font-size:12px;opacity:.6;">📋</span>' : ''}
      ${iv._mailsEnvoyes && iv._mailsEnvoyes.length ? `<span title="Envoyé par mail (${iv._mailsEnvoyes.length}x)" style="font-size:12px;">✉️</span>` : ''}
      ${iv._impressions && iv._impressions.length ? `<span title="Rapport imprimé (${iv._impressions.length}x)" style="font-size:12px;">🖨</span>` : ''}
    </div>
  </div>`;
}

// Tri : en-attente par date asc, autres par dernière action desc
function interventionTerminationSortKey(iv){
  if(!iv)return '';
  const terminaisons=(iv.tl||[]).filter(function(entry){return entry&&entry.s==='terminee'&&entry.h;});
  if(terminaisons.length)return terminaisons.map(function(entry){return entry.h;}).sort()[0];
  const day=String(iv.h||'').slice(0,8);
  const end=String(iv._hFin||'').replace(':','');
  return day+(end?'_'+end:String(iv.h||'').slice(8));
}

function sortedIVS(list){
  return list.sort((a,b)=>{
    // Une urgence ERP n'est prioritaire que tant qu'elle est active.
    // Une fois terminée, elle rejoint le groupe des interventions terminées.
    const urgenceActiveA=!!a._urgence&&a.s!=='terminee';
    const urgenceActiveB=!!b._urgence&&b.s!=='terminee';
    if(urgenceActiveA!==urgenceActiveB)return urgenceActiveA?-1:1;
    const ORDER={'en-attente':0,'selectionne':1,'en-cours':2,'terminee':3,'avis-passage':4};
    const oa=ORDER[a.s]??5,ob=ORDER[b.s]??5;
    if(oa!==ob)return oa-ob;
    if(a.s==='en-attente')return a.h.localeCompare(b.h); // asc
    // Pour les autres : date du dernier changement de statut desc
    const la=a.tl&&a.tl.length?a.tl[a.tl.length-1].h:a.h;
    const lb=b.tl&&b.tl.length?b.tl[b.tl.length-1].h:b.h;
    // Dans le groupe « Terminées », conserver l'ordre chronologique :
    // la dernière intervention clôturée vient s'ajouter en bas du groupe.
    if(a.s==='terminee')return interventionTerminationSortKey(a).localeCompare(interventionTerminationSortKey(b));
    return lb.localeCompare(la); // desc
  });
}

function getRenfortsEnAttente(){
  if(!CURRENT_CASERNE_ID)return[];
  // Lire directement depuis CASERNE_DATA (pas de proxy, toujours à jour)
  const d=CASERNE_DATA[CURRENT_CASERNE_ID];
  return(d&&d.renforts||[]).filter(function(r){return r.statut==='en-attente';});
}
function updateRenfortBadge(){
  const nb=getRenfortsEnAttente().length;
  const badge=document.getElementById('renfort-badge');
  if(badge){badge.textContent=nb;badge.style.display=nb>0?'inline-flex':'none';}
}
function rI(){
  const pendingAssignmentRepairs=agaiRepairPendingOperationalAssignments();
  if(pendingAssignmentRepairs.length){
    if(typeof syncCaserneContext==='function')syncCaserneContext();
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
    if(pendingAssignmentRepairs.some(function(id){const iv=interventionById(id);return iv&&iv._numApl==='APL_2026_000259';}))showToast('APL_2026_000259 : véhicule et équipage retirés de la file d’attente.','success');
  }
  const ut188Repair=agaiRepairIntervention188ChainedStart();
  if(ut188Repair.applied){
    if(typeof syncCaserneContext==='function')syncCaserneContext();
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    saveData(true);
    if(ut188Repair.changed)showToast('Intervention UT 188 : heure de départ corrigée à 16:11.','success');
  }
  updateRenfortBadge();
  // Afficher les renforts reçus en attente
  const renforts=getRenfortsEnAttente();
  const rz=document.getElementById('renfort-zone');
  if(rz){
    if(renforts.length){
      rz.innerHTML='<div style="background:#F5F3FF;border-radius:12px;padding:12px;margin-bottom:12px;border:2px solid #DDD6FE;">'
        +'<div style="font-size:13px;font-weight:700;color:#7C3AED;margin-bottom:8px;">&#x1F4E2; Demandes de renfort reçues ('+renforts.length+')</div>'
        +renforts.map(function(r){
          const src=CASERNES.find(function(c){return c.id===r.caserneSource;});
          return '<div style="background:#fff;border-radius:8px;padding:10px;margin-bottom:6px;border:1px solid #DDD6FE;">'
            +'<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:4px;">'
            +'<span style="font-size:12px;font-weight:600;color:#7C3AED;">'+(r.type==='complet'?'&#x1F692; Renfort complet':'&#x1F465; Renfort personnel')+'</span>'
            +'<span style="font-size:11px;background:var(--bg);border-radius:6px;padding:2px 8px;">De : <strong>'+(src?src.nom:r.caserneSource)+'</strong></span>'
            +'<span style="font-size:10px;color:var(--t2);">'+r.hDemande+'</span>'
            +'</div>'
            +'<div style="font-size:12px;margin-bottom:4px;">'+r.ivNature+' — <strong>'+r.ivCommune+'</strong>'+(r.ivAdresse?' · '+r.ivAdresse:'')+'</div>'
            +(r.note?'<div style="font-size:11px;color:var(--t2);margin-bottom:6px;">'+r.note+'</div>':'')
            +'<div style="display:flex;gap:6px;">'
            +'<button class="btn sm" style="background:#3B6D11;color:#fff;" onclick="repondreRenfort(\''+CURRENT_CASERNE_ID+'\',\''+r.id+'\',\'accepte\')">✅ Accepter</button>'
            +'<button class="btn sm" style="color:#E24B4A;" onclick="repondreRenfort(\''+CURRENT_CASERNE_ID+'\',\''+r.id+'\',\'refuse\')">❌ Refuser</button>'
            +'</div></div>';
        }).join('')+'</div>';
    } else {
      rz.innerHTML='';
    }
  }
  const ag=isAgres(),chef=isChef()||hasRight('Administration');
  // Les statuts actifs restent comptés après minuit tant qu'ils ne sont pas traités.
  const ti=IVS.filter(iv=>!iv._isPilip&&['en-attente','selectionne','en-cours'].includes(iv.s));
  document.getElementById('nb1').textContent=ti.filter(iv=>iv.s==='en-attente').length;
  document.getElementById('nb2s').textContent=ti.filter(iv=>iv.s==='selectionne').length;
  document.getElementById('nb2').textContent=IVS.filter(iv=>iv._avisEnAttente&&!iv._isPilip&&iv.s!=='annulee').length;
  document.getElementById('nb3').textContent=ti.filter(iv=>iv.s==='en-cours').length;
  const isTermAuj=iv=>iv.s==='terminee'&&iv.tl&&iv.tl.some(t=>t.s==='terminee'&&(t.h||'').startsWith(TDP));
  document.getElementById('nb4').textContent=IVS.filter(iv=>!iv._isPilip&&(isTdy(iv)?iv.s==='terminee':isTermAuj(iv))).length;

  // Avis de passage EN ATTENTE DE RAPPEL — interventions terminées où l'équipe a
  // laissé un avis (requérant absent). Reste affiché jusqu'au rappel du requérant.
  const avis=IVS.filter(iv=>!iv._isPilip&&iv._avisEnAttente&&iv.s!=='annulee');
  const as=document.getElementById('avsec');document.getElementById('avc').textContent=avis.length;
  if(avis.length){
    as.style.display='block';
    const avExpanded=as.dataset.expanded==='1';
    document.getElementById('avl').innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;">
        <span style="font-size:12px;color:var(--pur);font-weight:500;">&#x1F7E3; ${avis.length} avis de passage — cliquer pour développer</span>
        <button class="btn sm" style="font-size:11px;padding:3px 10px;" onclick="toggleAvisIVS(this)">${avExpanded?'▲ Réduire':'▼ Voir tous'}</button>
      </div>
      <div id="av-detail" style="display:${avExpanded?'block':'none'};">
        ${avis.map(iv=>`<div class="ivr avis-passage" onclick="oM('${iv.id}')">
          <div class="ivrl"><div class="ivrh">&#x1F4C5; ${escHtml(iv.h.slice(0,8))}</div><div class="ivrn">${escHtml(iv.n)}</div><div class="ivrc">&#x1F4CD; ${escHtml(interventionAddressLabel(iv))}${iv.rappels?' · '+Number(iv.rappels)+' rappel(s)':''}</div></div>
          <div class="ivrr"><span class="bdg bp">Avis passage</span>${isAdminModeActive()?`<button class="btn sm" style="font-size:10px;padding:3px 8px;background:#6B21A8;color:#fff;border-color:#6B21A8;" onclick="event.stopPropagation();classerAvisPassage('${iv.id}','standard')">&#x1F5C3;&#xFE0F; Classer</button>`:''}</div></div>`).join('')}
      </div>`;
  } else as.style.display='none';
  // Les avis classés restent accessibles aux administrateurs afin qu'un
  // classement involontaire puisse être annulé sans perdre le document.
  const avisClasses=isAdminModeActive()?IVS.filter(iv=>!iv._isPilip&&iv._avisPassageClasse===true&&!iv._avisEnAttente&&iv.s!=='annulee'):[];
  const acs=document.getElementById('avcsec'),acc=document.getElementById('avcc'),acl=document.getElementById('avcl');
  if(acc)acc.textContent=avisClasses.length;
  if(acs&&acl&&avisClasses.length){
    acs.style.display='block';
    const classExpanded=acs.dataset.expanded==='1';
    acl.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;">
        <span style="font-size:12px;color:#6B7280;font-weight:500;">🗃️ ${avisClasses.length} avis classé(s)</span>
        <button class="btn sm" style="font-size:11px;padding:3px 10px;" onclick="toggleAvisClasses(this)">${classExpanded?'▲ Réduire':'▼ Voir'}</button>
      </div>
      <div id="avc-detail" style="display:${classExpanded?'block':'none'};">
        ${avisClasses.map(iv=>`<div class="ivr avis-passage" onclick="oM('${iv.id}')" style="opacity:.88;">
          <div class="ivrl"><div class="ivrh">📅 ${escHtml(String(iv.h||'').slice(0,8))}</div><div class="ivrn">${escHtml(iv.n)}</div><div class="ivrc">📍 ${escHtml(interventionAddressLabel(iv))}</div></div>
          <div class="ivrr"><span class="bdg bgr">Classé</span><button class="btn sm" style="font-size:10px;padding:3px 8px;background:#fff;color:#6B21A8;border-color:#A855F7;" onclick="event.stopPropagation();restaurerAvisPassage('${iv.id}','standard')">↩ Remettre en attente</button></div></div>`).join('')}
      </div>`;
  }else if(acs){acs.style.display='none';if(acl)acl.innerHTML='';}
  // Panneau tournée
  const selNonConf=IVS.filter(iv=>isTdy(iv)&&iv.s==='selectionne'&&iv.agr===CU.l&&!parcConfirmed.has(iv.id)&&!iv._isPilip);
  const pp=document.getElementById('pap');
  if(ag&&selNonConf.length>0){pp.style.display='block';document.getElementById('pagl').textContent=interventionRouteChefName({agr:CU.l});document.getElementById('pac').textContent=selNonConf.length;rPL(selNonConf);}
  else{pp.style.display='none';rEgrid();}
  // Liste
  const tireur=isTireurPILP();
  // Une intervention est visible si : créée aujourd'hui OU statut actif (quelle que soit la date) OU clôturée aujourd'hui
  const isTermineeAujourdhui=iv=>iv.s==='terminee'&&iv.tl&&iv.tl.some(t=>t.s==='terminee'&&(t.h||'').startsWith(TDP));
  let list=IVS.filter(iv=>(isTdy(iv)||['en-attente','selectionne','en-cours'].includes(iv.s)||isTermineeAujourdhui(iv))&&iv.s!=='avis-passage'&&!iv._isPilip&&iv.s!=='annulee');
  // Si tireur PILP et filtre sélect. ou mes-sel : ajouter aussi les PILP sélectionnées
  let listPilpSel=tireur?PILP_IVS.filter(iv=>iv.s==='selectionne'&&iv.agr===CU.l):[];
  if(flt==='all'){
    // en mode "Tout", on n'ajoute pas les PILP (elles sont dans leur propre menu)
    listPilpSel=[];
  } else if(flt==='mes-sel'){
    list=list.filter(iv=>(iv.s==='selectionne'||iv.s==='en-cours')&&iv.agr===CU.l);
    // listPilpSel : inclure aussi les en-cours PILP
    listPilpSel=tireur?PILP_IVS.filter(iv=>(iv.s==='selectionne'||iv.s==='en-cours')&&iv.agr===CU.l):[];
  } else if(flt==='mes-resp'){
    // Interventions que j'ai sélectionnées, mises en cours ou clôturées (pas juste prise d'appel)
    list=list.filter(iv=>iv.agr===CU.l&&['selectionne','en-cours','terminee'].includes(iv.s)&&!iv._lienPilp);
    listPilpSel=tireur?PILP_IVS.filter(iv=>iv.agr===CU.l&&['selectionne','en-cours','terminee'].includes(iv.s)):[];
  } else if(flt==='selectionne'){
    list=list.filter(iv=>iv.s==='selectionne');
    // on affiche aussi les PILP sélectionnées par le tireur
  } else {
    list=list.filter(iv=>iv.s===flt);
    listPilpSel=[];
  }
  list=sortedIVS(list);
  const combined=[...list,...listPilpSel];
  const cont=document.getElementById('ivl');
  if(!combined.length){cont.innerHTML='<div style="padding:20px;text-align:center;font-size:13px;color:var(--t2);">Aucune intervention.</div>';return;}
  // P8 : délégation au helper renderInterventionRow (logique + XSS centralisés)
  cont.innerHTML=combined.map(iv=>renderInterventionRow(iv,ag,tireur)).join('');
}

function toggleChk(id,el){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  if(el.checked){
    iv.s='selectionne';iv.agr=CU.l;
    parcConfirmed.delete(iv.id);
    assignInterventionRoute(iv,CU.l);
    pushTL(iv,'selectionne',CU.l,'Ordre de tournée : '+iv._routeOrder);
  }
  else{
    iv.s='en-attente';iv.agr=null;
    parcConfirmed.delete(iv.id);
    delete iv._routeBatchId;delete iv._routeOrder;
    pushTL(iv,'en-attente',CU.l);
  }
  syncInternalReinforcementSource(iv);
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);rI(); // push immédiat : changement de statut partagé, sinon la sélection est écrasée au prochain pull
}
function toggleAvisIVS(btn){
  const as=document.getElementById('avsec');
  const expanded=as.dataset.expanded==='1';
  as.dataset.expanded=expanded?'0':'1';
  const detail=document.getElementById('av-detail');
  if(detail)detail.style.display=expanded?'none':'block';
  btn.textContent=expanded?'▼ Voir tous':'▲ Réduire';
}
function toggleAvisPILP(btn){
  const pas=document.getElementById('pilp-avsec');
  const expanded=pas.dataset.expanded==='1';
  pas.dataset.expanded=expanded?'0':'1';
  const detail=document.getElementById('pilp-av-detail');
  if(detail)detail.style.display=expanded?'none':'block';
  btn.textContent=expanded?'▼ Voir tous':'▲ Réduire';
}

function toggleAvisPassageHour(checkbox,timeId,wrapId){
  const wrap=document.getElementById(wrapId);
  const input=document.getElementById(timeId);
  const checked=!!(checkbox&&checkbox.checked);
  if(wrap)wrap.style.display=checked?'block':'none';
  if(input){
    input.required=checked;
    if(checked&&!input.value)input.value=getHHMM(N());
  }
}
function toggleAvisClasses(btn){
  const section=document.getElementById('avcsec');if(!section)return;
  const expanded=section.dataset.expanded==='1';
  section.dataset.expanded=expanded?'0':'1';
  const detail=document.getElementById('avc-detail');if(detail)detail.style.display=expanded?'none':'block';
  if(btn)btn.textContent=expanded?'▼ Voir':'▲ Réduire';
}
function toggleAvisClassesPilp(btn){
  const section=document.getElementById('pilp-avcsec');if(!section)return;
  const expanded=section.dataset.expanded==='1';
  section.dataset.expanded=expanded?'0':'1';
  const detail=document.getElementById('pilp-avc-detail');if(detail)detail.style.display=expanded?'none':'block';
  if(btn)btn.textContent=expanded?'▼ Voir':'▲ Réduire';
}
function restaurerAvisPassage(id,scope){
  if(!isAdminModeActive()){
    showToast('Activez vos pouvoirs administrateur pour remettre un avis en attente.','warn');
    return;
  }
  const isPilp=scope==='pilp';
  const iv=(isPilp?PILP_IVS:IVS).find(function(item){return item&&item.id===id&&item._avisPassageClasse===true;});
  if(!iv){showToast('Avis classé introuvable.','warn');return;}
  confirmModal('Remettre cet avis de passage dans la liste des avis en attente ?',function(){
    const h=getH(N());
    iv._avisEnAttente=true;
    iv._avisPassageClasse=false;
    if(isPilp)iv.s='avis-passage';
    iv._avisPassageRestaureAt=h;
    iv._avisPassageRestaurePar=CU.l;
    if(!Array.isArray(iv.tl))iv.tl=[];
    iv.tl.push({s:'avis-restaure',h:h,who:CU.l,note:'Avis de passage remis en attente'});
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcPendingDirty!=='undefined'&&typeof _rcId==='function'&&CURRENT_CASERNE_ID){
      _rcPendingDirty.add(_rcId(CURRENT_CASERNE_ID,isPilp?'pilp':'iv',iv.id));
      if(typeof _rcDirtyGeneration!=='undefined')_rcDirtyGeneration++;
      if(typeof _rcPersistPendingDirty==='function')_rcPersistPendingDirty();
    }
    cM();rI();rPilp();rAccueil();rStatsHeader();
    saveData(true);
    showToast('Avis de passage remis en attente.','success');
  });
}
function classerAvisPassage(id,scope){
  if(!isAdminModeActive()){
    showToast('Activez vos pouvoirs administrateur pour classer un avis de passage.','warn');
    return;
  }
  const isPilp=scope==='pilp';
  const iv=(isPilp?PILP_IVS:IVS).find(function(item){return item&&item.id===id;});
  if(!iv||(!iv._avisPassage&&iv.s!=='avis-passage')){
    showToast('Avis de passage introuvable.','warn');
    return;
  }
  if(iv._avisPassageClasse===true&&!iv._avisEnAttente&&iv.s!=='avis-passage'){
    showToast('Cet avis de passage est déjà classé.','info');
    return;
  }
  confirmModal('Classer cet avis de passage ? Il disparaîtra de la liste des avis en attente, mais restera conservé dans la fiche, le rapport et la traçabilité de l’intervention.',function(){
    const h=getH(N());
    const heure=getAvisPassageHour(iv);
    iv._avisEnAttente=false;
    iv._avisPassageClasse=true;
    iv._avisPassageClasseAt=h;
    iv._avisPassageClassePar=CU.l;
    if(!Array.isArray(iv.tl))iv.tl=[];
    iv.tl.push({s:'avis-classe',h:h,who:CU.l,note:'Avis de passage classé'+(heure?' (déposé à '+heure+')':'')});
    // La ligne de l'intervention est explicitement prioritaire jusqu'à la fin
    // de son envoi. Un rafraîchissement temps réel ne peut ainsi pas rétablir
    // l'avis dans la liste d'attente avec une ancienne version distante.
    if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
    if(typeof USE_RECORDS!=='undefined'&&USE_RECORDS&&typeof _rcPendingDirty!=='undefined'&&typeof _rcId==='function'&&CURRENT_CASERNE_ID){
      _rcPendingDirty.add(_rcId(CURRENT_CASERNE_ID,isPilp?'pilp':'iv',iv.id));
      if(typeof _rcDirtyGeneration!=='undefined')_rcDirtyGeneration++;
      if(typeof _rcPersistPendingDirty==='function')_rcPersistPendingDirty();
    }
    if(iv.s==='avis-passage'){
      if(isPilp){
        clotAvisPilp(id);
        return;
      }
      iv.s='terminee';
      iv.tl.push({s:'terminee',h:h,who:CU.l,note:'Avis classé'});
    }
    // Retirer immédiatement l'avis de la liste avant le lancement de l'envoi.
    // Le document reste dans l'intervention et dans son historique.
    cM();rI();rPilp();rAccueil();rStatsHeader();
    saveData(true);
    showToast('Avis de passage classé.','success');
  });
}
function autorisationDocumentsHTML(iv){
  if(!iv)return'';
  const list=Array.isArray(iv._autorisationNids)?iv._autorisationNids:(iv._autorisationData?[iv._autorisationData]:[]);
  const rows=list.map(function(data,index){
    if(!data)return'';
    const nid=interventionNids(iv)[index];
    const label=nid?[nid.nature,nid.localisation].filter(Boolean).join(' · '):iv.n;
    return '<div style="background:#fff;border:1px solid #DDD6FE;border-radius:8px;padding:8px;margin-top:6px;">'
      +'<div style="font-size:11px;font-weight:700;color:#6B3AA0;margin-bottom:6px;">Nid '+(index+1)+(label?' — '+escHtml(label):'')+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn sm" style="background:#185FA5;color:#fff;" onclick="viewPdfDocument(\''+iv.id+'\',\'autorisation\','+index+')">&#x1F4CB; Autorisation</button>'
      +'<button class="btn sm" style="background:#3B6D11;color:#fff;" onclick="viewPdfDocument(\''+iv.id+'\',\'attestation\','+index+')">&#x1F4CB; Attestation</button></div></div>';
  }).join('');
  return rows;
}

// ────────────────── MODAL ──────────────────
function interventionAppelDetailValue(iv,key,value){
  const text=String(value??'');
  if(key!=='Animaux à prendre en charge')return text;
  const animalCount=Array.isArray(iv&&iv._animauxAppel)?iv._animauxAppel.length:0;
  const isSingleAnimal=animalCount===1||(!animalCount&&!text.includes(' ; '));
  return isSingleAnimal?text.replace(/^\s*1\.\s*/,''):text;
}
function oM(id){
  const iv=interventionById(id);if(!iv)return;
  const pilpScope=isPilpIntervention(iv);
  if(pilpScope&&!isTireurPILP()){showToast('Accès réservé aux tireurs PILP.','warn');return;}
  const isInternalReinforcement=iv._isRenfortInterneMission===true;
  // Pour un départ SDIS, la synthèse opérationnelle commence à l'acquis
  // présence et se termine à l'opération terminée. Les heures de départ et
  // de retour de l'engin restent conservées séparément pour le rapport.
  const detailStart=iv._sdis?(iv._hAcquis||iv._hDebut||''):(iv._hDebut||'');
  const detailEnd=iv._sdis?(iv._hOpTerminee||iv._hFin||''):(iv._hFin||'');
  const ag=isAgres(),chef=isChef()||hasRight('Administration');
  const operationalActor=ag||chef||(pilpScope&&isTireurPILP());
  // _showAutoBtn défini globalement pour toute la fonction oM
  const _isOwnAgres_=(iv.agr===CU.l||iv._agr2===CU.l);
  // Autorisation disponible pour toutes les interventions (sauf renforts)
  const _showAutoBtn=(_isOwnAgres_||chef||isAdminModeActive())&&!iv._isRenfort;
  document.getElementById('mt').textContent=iv.n;
    // Seul le numéro APL est affiché (numérotation INT désactivée)
  const dispApl=interventionDisplayCallNumber(iv);
  const dispTransfert=iv._transfertDe?` ↩ transféré de ${CASERNES.find(cas=>cas.id===iv._transfertDe)?.nom||iv._transfertDe}`:'';
  const dispUt=iv._numCaserne?' · UT '+iv._numCaserne:'';
  document.getElementById('mi').textContent=dispApl+dispUt+dispTransfert;
   const bm={'en-attente':['br','En attente'],'selectionne':['bsel','Sélectionné'],'en-cours':['ba','En cours'],'terminee':['bg2','Terminée'],'avis-passage':['bp','Avis de passage'],'avis-classe':['bp','Avis classé'],'avis-restaure':['binfo','Avis remis en attente'],'modif':['bgr','Modification'],'modif-adresse':['bgr','Adresse corrigée'],'modif-heure':['binfo','Horaire corrigé'],'modif-equipier':['binfo','Équipage corrigé'],'modif-engin':['binfo','Véhicule corrigé'],'reclasse':['bgr','Reclasé'],'releve':['binfo','Relève'],'info-compl':['binfo','ℹ️ Complément d\u2019info']};
  const[bc,bt]=bm[iv.s]||['bgr','—'];
  const sdots={'en-attente':'#E24B4A','selectionne':'var(--sel)','en-cours':'var(--amb)','terminee':'var(--grn)','avis-passage':'var(--pur)','avis-classe':'#6B21A8','avis-restaure':'#2563EB','modif':'#888','modif-adresse':'#888','modif-heure':'#C2410C','modif-equipier':'#2563EB','modif-engin':'#0F766E','reclasse':'#888','releve':'#0369A1','info-compl':'#0369A1'};
  const tlHtml=(iv.tl||[]).map(t=>`<div class="tl-item"><div class="tl-dot" style="background:${sdots[t.s]||'#aaa'};"></div><div class="tl-info"><span class="tl-status">${bm[t.s]?bm[t.s][1]:t.s}${t.note?` — ${t.note}`:''}</span> <span class="tl-horo">&#x1F4C5; ${t.h}</span><div class="tl-who">${t.who}</div></div></div>`).join('');
  const appelDetailEntries=iv._appelDetails&&typeof iv._appelDetails==='object'
    ?Object.entries(iv._appelDetails).filter(([key])=>(key!=='Nids à traiter'||!Array.isArray(iv._nidsAppel)||iv._nidsAppel.length!==1)&&key!=='Disponibilité du requérant')
    :[];
  const reclassHtml=(operationalActor&&iv.s==='en-cours')?`<div class="reclass-box">
    <div class="reclass-title">Reclasser la nature</div>
    <select class="fi" id="reclass-sel" style="margin-bottom:8px;">${NAT.map(n=>`<option value="${n.l}"${n.l===iv.n?' selected':''}>${n.l}</option>`).join('')}</select>
    <button class="btn sm" onclick="reclasser('${iv.id}')">✏️ Appliquer</button>
  </div>`:'';
  let actions='';
  if(operationalActor){
    if(iv.s==='en-attente'){
      const dejaPris=iv.agr&&iv.agr!==CU.l;
      const autreAgr=dejaPris?USERS.find(u=>u.l===iv.agr):null;
      const nomAutre=autreAgr?fullName(autreAgr):(iv.agr||'');
      actions=`<div class="brow">
        ${dejaPris
          ?`<button class="btn sel-btn sm" disabled style="opacity:0.5;cursor:not-allowed;">⏳ Sélectionné par ${nomAutre}</button>`
          :`<button class="btn sel-btn sm" onclick="cS('${iv.id}','selectionne')">☑ Sélectionner</button>`
        }
        ${!iv._isRenfort&&(ag||chef||hasRight('Interventions'))?`<button class="btn sm" style="background:#7C3AED;color:#fff;border-color:#7C3AED;" onclick="showRenfortModal('${iv.id}')">&#x1F4E2; Renfort UT</button>`:''}
        ${!iv._isRenfort&&chef?`<button class="btn sm" style="color:#E67E22;border-color:#E67E22;" onclick="transfererIV('${iv.id}')">&#x1F500; Transférer</button>`:''}
        ${!iv._isRenfort&&chef&&iv.n&&(iv.n.toLowerCase().includes('animal')||iv.n.toLowerCase().includes('animaux'))?`<button class="btn sm" style="color:#27AE60;border-color:#27AE60;" onclick="refugeAnimalier('${iv.id}')">&#x1F43E; Refuge animalier</button>`:''}
        ${!iv._isRenfort&&chef?`<button class="btn sm" style="color:#888;border-color:#ccc;" onclick="annulerIV('${iv.id}')">✕ Annuler</button>`:''}
      </div>`;
    } else if(iv.s==='selectionne'){
      const enCours=agresEnCours();
      const blocage=enCours&&enCours.id!==iv.id;
      // Blocage si l'intervention appartient à un autre chef d'agrès
      const autreAgres=iv.agr&&iv.agr!==CU.l&&!(iv._agr2===CU.l)&&!isAdminModeActive();
      // Sélecteur 2ème chef pour interventions échelle
      const chefPool=sortByGradeThenName(USERS.filter(u=>isChefAgresByGrade(u)&&u.l!==CU.l));
      const agr2Sel=iv._agr2||'';
      const agr2Html=iv._echelleToiture?`
        <div style="margin-top:8px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:10px;">
          <div style="font-size:12px;font-weight:600;color:#92400E;margin-bottom:6px;">&#x1FA9C; 2ème chef d'agrès (optionnel)</div>
          <select class="fi" style="width:100%;" onchange="setAgr2('${iv.id}',this.value)">
            <option value="">— Aucun —</option>
            ${chefPool.map(u=>`<option value="${u.l}"${u.l===agr2Sel?' selected':''}>${fullName(u)} (${gradeAbbr(u.grade)})</option>`).join('')}
          </select>
        </div>`:''
      ;
      actions=`<div class="brow">
        ${autreAgres?`<div style="padding:6px 8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;font-size:12px;color:#991B1B;">🔒 Sélectionnée par ${iv.agr}</div>`:
        `${canUseOperationalStartInterface()
          ?`<button class="btn am sm" onclick="cS('${iv.id}','en-cours')"${blocage?' style="opacity:.4;pointer-events:none;" title="Cl&#244;turez d&#39;abord '+enCours.id+'"':''}>▶ En cours</button>`
          :`<button class="btn sm" disabled title="Le départ est réservé aux mobiles et tablettes" style="opacity:.65;">📱 En cours : mobile/tablette</button>`}
        <button class="btn sm" onclick="cS('${iv.id}','en-attente')">↩ En attente</button>`}
      </div>
      ${agr2Html}
      ${blocage?`<div style="margin-top:8px;padding:8px 10px;background:var(--rl);border:1px solid var(--rd);border-radius:8px;font-size:12px;color:var(--rd);">
        ⛔ Clôturez d'abord <strong>${enCours.id}</strong>
        <button class="btn sm" style="margin-top:6px;background:var(--red);color:#fff;border-color:var(--red);width:100%;" onclick="cM();oM('${enCours.id}')">&#x1F449; Aller clôturer</button>
      </div>`:''}`;
    } else if(iv.s==='en-cours'&&(iv.agr===CU.l||iv._agr2===CU.l||chef)){
      const ds=getDS(N()),hh=pad(N().getHours()),mm2=pad(N().getMinutes());
      const pilpBtn=!iv._isRenfort&&iv.n==='Nid de frelons asiatiques'?`<button class="btn pilp-btn sm" onclick="showPilpForm('${iv.id}')">&#x1F3AF; PILP</button>`:'';
      const natsEchelle=['Nid de guêpes et frelons','Nid de frelons asiatiques',"Essaim d'abeilles"];
      const echelleBtn=!iv._isRenfort&&natsEchelle.includes(iv.n)&&!iv._echelleToiture?`<button class="btn sm" style="background:#D35400;color:#fff;border-color:#D35400;" onclick="demandeEchelleToiture('${iv.id}')">&#x1FA9C; Échelle</button>`:'';
      const sdisBtn2=!iv._isRenfort&&chef&&!iv._sdis?(canUseOperationalStartInterface()?`<button class="btn sm" style="background:#1D4ED8;color:#fff;border-color:#1D4ED8;" onclick="demandeSDIS('${iv.id}')">&#x1F691; SDIS</button>`:`<button class="btn sm" disabled title="Conversion SDIS réservée au mobile ou à la tablette" style="opacity:.65;">📱 SDIS</button>`):'';
      const epaBtn=!iv._isRenfort&&chef&&!iv._epa?`<button class="btn sm" style="background:#8E44AD;color:#fff;border-color:#8E44AD;" onclick="demandeEPA('${iv.id}')">&#x1F9F0; EPA</button>`:'';
      // Bouton clôture renfort si c'est une IV de renfort UT
      const renfortCloBtn=iv._isRenfort&&!isInternalReinforcement?`<div style="background:#EDE9FE;border-radius:10px;padding:12px;margin-bottom:10px;border:2px solid #7C3AED;">
        <div style="font-size:12px;font-weight:600;color:#7C3AED;margin-bottom:6px;">&#x1F692; Renfort UT — ${iv._caserneSourceNom||''}</div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:8px;">Clôturez votre partie quand votre équipage rentre à la caserne. L'intervention principale reste ouverte chez la caserne demandeuse.</div>
        <button class="btn gn" style="width:100%;" onclick="cloturerRenfort('${CURRENT_CASERNE_ID}','${iv._renfortId}')">&#x2705; Clôturer ma partie renfort</button>
      </div>`:'';
      const _natExclus=["Sauvetage et capture d'animaux","Sauvetage de personne"];
      const _isOwnAgres=(iv.agr===CU.l||iv._agr2===CU.l);
      const _canSeeAuto=_isOwnAgres||chef||isAdminModeActive();
      const autorisationBtn=_showAutoBtn
        ?`<button class="btn sm" style="width:100%;margin-bottom:10px;background:#8E44AD;color:#fff;border-color:#8E44AD;" onclick="showAutorisationModal('${iv.id}')">&#x1F4DD; Autorisation &amp; Attestation</button>`
        :'';
      const addNidBtn=_showAutoBtn&&natsEchelle.includes(iv.n)
        ?`<button class="btn sm" style="width:100%;margin-bottom:8px;background:#FFF7ED;color:#9A3412;border:1px dashed #F97316;font-weight:700;" onclick="showAddRecognizedNidModal('${iv.id}')">➕ Ajouter un nid découvert sur place</button>`
        :'';
      // Bouton prise en charge animal (sauvetage/capture uniquement)
      const _isAnimal=iv.n&&iv.n.toLowerCase().includes('sauvetage et capture d');
      const _showAnimalBtn=_isAnimal&&(_isOwnAgres||chef||isAdminModeActive())&&!iv._isRenfort;
      const _animalCount=Array.isArray(iv._prisesEnCharge)?iv._prisesEnCharge.length:Array.isArray(iv._animauxAppel)&&iv._animauxAppel.length?iv._animauxAppel.length:(iv._priseEnCharge?1:0);
      const animalBtn=_showAnimalBtn
        ?`<button class="btn sm" style="width:100%;margin-bottom:10px;background:#E67E22;color:#fff;border-color:#E67E22;" onclick="showPriseEnChargeModal('${iv.id}')">&#x1F43E; Prises en charge animaux${_animalCount?' ('+_animalCount+')':''}</button>`
        :'';
      actions=`<div class="clotbox">
        ${renfortCloBtn}
        ${iv._isRenfort&&!isInternalReinforcement?'':`${animalBtn}${addNidBtn}${autorisationBtn}
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;">${isInternalReinforcement?'Clôturer le renfort':'Clôturer l’intervention'}</div>
        ${isInternalReinforcement?'':`<label class="avislbl"><input type="checkbox" id="chk-av" style="accent-color:var(--pur);" onchange="toggleAvisPassageHour(this,'avis-passage-hour','avis-passage-hour-wrap')"/>&#x1F7E3; Requérant absent — Avis de passage</label>
        <div id="avis-passage-hour-wrap" style="display:none;background:#FAF5FF;border:1px solid #D8B4FE;border-radius:9px;padding:9px 10px;margin:-2px 0 10px;">
          <label for="avis-passage-hour" style="display:block;font-size:11px;font-weight:700;color:#6B21A8;margin-bottom:5px;">Heure de dépôt dans la boîte aux lettres *</label>
          <input class="fi" type="time" id="avis-passage-hour" value="${getHHMM(N())}" style="width:100%;"/>
        </div>`}
        ${(iv.agr===CU.l||iv._agr2===CU.l||chef||isAdminModeActive())?`<button class="btn gn" style="width:100%;margin-bottom:10px;" onclick="clot('${iv.id}')">✅ Confirmer la clôture</button>`:`<div style="font-size:12px;color:#991B1B;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px;margin-bottom:10px;">🔒 Clôture réservée au chef d'agrès assigné ou à un administrateur.</div>`}
        <div style="border-top:1px solid var(--brd);padding-top:10px;margin-bottom:6px;">
          <div style="font-size:10px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Gestion de l'équipage</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:5px;">
            <button class="btn sm" style="background:#0369A1;color:#fff;border-color:#0369A1;" onclick="showReleveModal('${iv.id}')">&#x1F504; Relève</button>
            ${iv._isRenfort?'':`<button class="btn sm" style="background:#0369A1;color:#fff;border-color:#0369A1;" onclick="showRenfortInterneModal('${iv.id}')">&#x1F3E0; Renfort interne</button>
            <button class="btn sm" style="background:#7C3AED;color:#fff;border-color:#7C3AED;" onclick="showRenfortModal('${iv.id}')">&#x1F4E2; Renfort UT</button>`}
          </div>
        </div>
        ${pilpBtn||echelleBtn||sdisBtn2||epaBtn?`<div style="border-top:1px solid var(--brd);padding-top:10px;margin-top:4px;">
          <div style="font-size:10px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Intervention / Renfort SDIS</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:5px;">
            ${pilpBtn}${echelleBtn}${sdisBtn2}${epaBtn}
          </div>
        </div>`:''}`}
      </div>
      <div class="brow" style="margin-top:8px;">${iv._isRenfort&&!isInternalReinforcement?'':`<button class="btn sm danger" onclick="cS('${iv.id}','en-attente')">↩ Remettre en attente</button>`}</div>`;
    }
  }
  if((chef||operationalActor)&&iv.s==='avis-passage'){
    const ds=getDS(N()),hh=pad(N().getHours()),mm2=pad(N().getMinutes());
    // Bouton reprendre — visible pour le chef d'agrès qui avait l'intervention
    if(iv.agr===CU.l||isAgres()||chef){
      actions+=`<div class="clotbox" style="margin-top:10px;background:#EFF6FF;border:1px solid #BFDBFE;">
        <div style="font-size:12px;font-weight:600;color:#1D4ED8;margin-bottom:8px;">🔄 Reprendre cette intervention</div>
        ${canUseOperationalStartInterface()
          ?`<button class="btn bl" style="width:100%;" onclick="cS('${iv.id}','en-cours')">▶ Remettre en cours</button>`
          :`<button class="btn" disabled style="width:100%;opacity:.65;">📱 Reprise réservée au mobile ou à la tablette</button>`}
      </div>`;
    }
    if(isAdminModeActive()){
      actions+=`<div class="clotbox" style="margin-top:10px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Classer l'avis de passage</div>
        <button class="btn" style="width:100%;background:#6B21A8;color:#fff;border-color:#6B21A8;" onclick="classerAvisPassage('${iv.id}','standard')">&#x1F5C3;&#xFE0F; Classer l'avis</button>
      </div>`;
    } else {
      actions+=`<div class="clotbox" style="margin-top:10px;background:var(--rl);border:1px solid var(--rd);">
        <div style="font-size:12px;color:var(--rd);">&#x1F512; Activez les pouvoirs administrateur pour classer cet avis de passage.</div>
      </div>`;
    }
  }
  document.getElementById('mb').innerHTML=`
    <div style="margin-bottom:8px;"><span class="bdg ${bc}">${bt}</span>${pilpScope?' <span class="bdg bpilp">PILP</span>':''}${iv.rappels?` <span class="bdg bp" style="${isAdminModeActive()?'cursor:pointer;':''}"${isAdminModeActive()?` title="Déjà intervenu ici ?" onclick="showInterventionsLiees('${iv.id}')"`:''}>${iv.rappels} rappel(s)</span>`:''}</div>
    ${iv._urgence?'<div style="background:#FEE2E2;border:2px solid #B91C1C;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:800;color:#991B1B;margin-bottom:10px;text-align:center;">🚨 URGENCE — ÉTABLISSEMENT RECEVANT DU PUBLIC (ERP)</div>':''}
    ${iv._sdis?'<div style="background:#DBEAFE;border:1px solid #93C5FD;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;color:#1D4ED8;margin-bottom:10px;text-align:center;">&#x1F691; INTERVENTION SDIS</div>':''}
    ${iv._avisPassage?'<div style="background:#F3EAF8;border:2px solid #9B59B6;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;color:#6C3483;margin-bottom:10px;text-align:center;">🟣 Un avis de passage a été laissé'+(getAvisPassageHour(iv)?' à '+escHtml(getAvisPassageHour(iv)):'')+(iv._avisPassageClasse?' — classé':'')+' pour cette intervention</div>':''}
    ${iv._echelleToiture?'<div style="background:#FEF3C7;border:2px solid #F59E0B;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:700;color:#92400E;margin-bottom:10px;text-align:center;">&#x26A0;&#xFE0F; INTERVENTION À FAIRE AVEC ÉCHELLE DE TOIT</div>':''}
    ${iv._epa?'<div style="background:#F3EAF8;border:2px solid #8E44AD;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:700;color:#6C3483;margin-bottom:10px;text-align:center;">&#x1F9F0; INTERVENTION À FAIRE AVEC EPA</div>':''}
    <div class="mr"><div class="ml">Adresse</div><div class="mv2" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">&#x1F4CD; ${escHtml(iv.addr)}, ${escHtml(iv.com)}${iv.addrComp?' · '+escHtml(iv.addrComp):''}${(isAgres()||isChef()||hasRight('Administration'))&&iv.s!=='terminee'?`<button class="btn sm" style="font-size:10px;padding:2px 7px;" onclick="editAdresse('${iv.id}')">✏️ Corriger</button>`:''}<button class="btn sm" style="font-size:10px;padding:2px 7px;background:#4285F4;color:#fff;border-color:#4285F4;" onclick="openMaps('${iv.id}')">🗺️ Maps</button></div></div>
    <div class="mr"><div class="ml">Requérant</div><div class="mv2" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span>${escHtml(iv.req||'—')}${getInterventionPhones(iv).length?' · '+getInterventionPhones(iv).map(escHtml).join(' · '):''}</span>
      ${getInterventionPhones(iv).map((phone,index)=>`<button class="btn sm" style="font-size:10px;padding:2px 7px;background:#16A34A;color:#fff;border-color:#16A34A;" onclick="callRequerantMasque('${iv.id}',${index})" title="Appeler ${escHtml(phone)} en numéro masqué (non garanti selon téléphone)">📞 ${escHtml(phone)}</button>`).join('')}
      ${(iv._reqInit||iv._telInit)?`<span style="font-size:10px;color:var(--t2);font-style:italic;">(initial : ${escHtml(iv._reqInit||'')}${iv._telInit?' · '+escHtml(iv._telInit):''})</span>`:''}
      ${(isAgres()&&iv.agr===CU.l||hasRight('Administration'))&&iv.s!=='terminee'?`<button class="btn sm" style="font-size:10px;padding:2px 7px;" onclick="editRequerant('${iv.id}')">✏️ Corriger</button>`:''}
    </div></div>
    ${iv.reqDispo&&iv.reqDispo.label?`<div class="mr"><div class="ml">Disponibilité du requérant</div><div class="mv2">${reqAvailabilityBadgeHTML(iv)}</div></div>`:''}
    <div class="mr" style="padding:4px 0;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;">
        ${iv.op?`<span style="color:var(--t2);">&#x260E;&#xFE0F; Op.&nbsp;<span style="font-family:monospace;font-weight:600;color:var(--tx);">${iv.op}</span></span>`:''}
        ${iv.agr?`<span style="color:var(--t2);">&#x1F3AF; Chef&nbsp;<span style="font-family:monospace;font-weight:600;color:var(--tx);">${iv.agr}</span></span>`:''}
        ${iv._agr2?`<span style="color:var(--t2);">&#x1F3AF; 2e&nbsp;<span style="font-family:monospace;font-weight:600;color:var(--tx);">${iv._agr2}</span></span>`:''}
      </div>
    </div>
    ${(()=>{
      const nn=nm(iv.n);
      const autres=[].concat(IVS||[],PILP_IVS||[]).filter(x=>x.id!==iv.id&&sameInterventionAddress(x.addr,iv.addr)&&nm(x.com)===nm(iv.com)&&nm(x.n)===nn&&x.s!=='annulee');
      if(!autres.length)return '';
      const avisN=autres.filter(x=>x._avisEnAttente).length;
      const cliquable=isAdminModeActive();
      const detail=avisN?` · <strong>${avisN}</strong> avis de passage en attente`:'';
      const lien=cliquable?' — <u>voir</u>':'';
      const onclick=cliquable?` onclick="showInterventionsLiees('${iv.id}')" style="cursor:pointer;"`:'';
      return `<div${onclick} style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#92400E;${cliquable?'cursor:pointer;':''}">&#x26A0;&#xFE0F; <strong>${autres.length}</strong> autre${autres.length>1?'s':''} intervention${autres.length>1?'s':''} à cette adresse pour ce type${detail}${lien}</div>`;
    })()}
    ${appelDetailEntries.length?`<div class="mr"><div class="ml">Informations de l'appel</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:3px;">${appelDetailEntries.map(([key,value])=>`<span style="font-size:13px;"><span style="color:var(--t2);">${escHtml(key)} :</span> <strong>${escHtml(interventionAppelDetailValue(iv,key,value))}</strong></span>`).join('')}</div></div></div>`:''}
    ${(()=>{const compls=(iv.tl||[]).filter(t=>t.s==='info-compl');return compls.length?`<div class="mr"><div class="ml" style="color:#0369A1;">&#x2139;&#xFE0F; Compléments d'information</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${compls.map(t=>`<div style="background:#EFF6FF;border-left:3px solid #0369A1;border-radius:6px;padding:6px 10px;font-size:13px;"><div>${escHtml(t.note||'')}</div><div style="font-size:10px;color:var(--t2);margin-top:2px;">&#x1F4C5; ${escHtml(t.h||'')} · ${escHtml(t.who||'')}</div></div>`).join('')}</div></div></div>`:'';})()}
    ${iv._transfertDe?`<div class="mr"><div class="ml">Transfert reçu de</div><div class="mv2" style="color:var(--amb);font-weight:500;">&#x1F500; ${CASERNES.find(c=>c.id===iv._transfertDe)?.nom||iv._transfertDe}</div></div>`:''}
    ${iv._transfertVers?`<div class="mr"><div class="ml">Transféré vers</div><div class="mv2" style="color:#888;">&#x1F500; ${CASERNES.find(c=>c.id===iv._transfertVers)?.nom||iv._transfertVers}</div></div>`:''}
    ${iv._refugeAnimalier?`<div class="mr"><div class="ml">Refuge animalier</div><div class="mv2" style="color:var(--grn);">&#x1F43E; Transmis au refuge — ${iv._refugeAnimalier}</div></div>`:''}

    ${(iv.eng||detailStart||detailEnd||pilpScope)?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:8px;margin:6px 0;">'+(iv.eng?'<div style="background:var(--bg);border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Engin</div><span class="bdg bb">'+iv.eng+'</span></div>':pilpScope?'<div style="background:var(--bg);border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Engin</div><span style="font-size:11px;color:var(--t2);">Non renseigné</span></div>':'')+(detailStart?'<div style="background:#FEF9EC;border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--amb);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">&#x23F1; Début</div><div style="font-weight:700;color:var(--amb);font-size:15px;">'+detailStart+'</div></div>':'')+(detailEnd?'<div style="background:#F0FAF0;border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--grn);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">&#x2705; Fin</div><div style="font-weight:700;color:var(--grn);font-size:15px;">'+detailEnd+'</div></div>':'')+(detailStart&&detailEnd?'<div style="background:#F0F4FF;border-radius:8px;padding:8px 10px;"><div style="font-size:10px;font-weight:600;color:var(--pur);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">&#x23F3; Durée</div><div style="font-weight:700;color:var(--pur);font-size:15px;">'+dureeHHMM(detailStart,detailEnd)+'</div></div>':'')+'</div>':''}
    ${iv._equipage1?`<div class="mr"><div class="ml">&#x1F692; ${iv._engin1||'Engin 1'}</div><div class="mv2"><div style="display:flex;flex-wrap:wrap;gap:4px;">${iv._equipage1.map(e=>{const u=USERS.find(x=>x.l===e.login);const nom=u?fullName(u):((e.prenom||e.nom)?((e.prenom||'')+' '+(e.nom||'')).trim():e.login);return'<span style="background:'+(e.renfort?'#F5F3FF':'#EEF2FF')+';color:'+(e.renfort?'#6D28D9':'#3730A3')+';border-radius:6px;padding:2px 8px;font-size:11px;">'+(e.renfort?'&#x1F692; ':'')+'<span style="font-size:9px;opacity:.7;">'+e.role+'</span> '+nom+(e.renfort&&e.caserneNom?' <span style="font-size:9px;opacity:.7;">('+e.caserneNom+')</span>':'')+'</span>';}).join('')}</div></div></div>`:''}
    ${iv._equipage2?`<div class="mr"><div class="ml">&#x1F692; ${iv._engin2||'Engin 2'}</div><div class="mv2"><div style="display:flex;flex-wrap:wrap;gap:4px;">${iv._equipage2.map(e=>{const u=USERS.find(x=>x.l===e.login);const nom=u?fullName(u):((e.prenom||e.nom)?((e.prenom||'')+' '+(e.nom||'')).trim():e.login);return'<span style="background:'+(e.renfort?'#F5F3FF':'#F0FDF4')+';color:'+(e.renfort?'#6D28D9':'#166534')+';border-radius:6px;padding:2px 8px;font-size:11px;">'+(e.renfort?'&#x1F692; ':'')+'<span style="font-size:9px;opacity:.7;">'+e.role+'</span> '+nom+(e.renfort&&e.caserneNom?' <span style="font-size:9px;opacity:.7;">('+e.caserneNom+')</span>':'')+'</span>';}).join('')}</div></div></div>`:''}
    ${pilpScope&&iv.s==='terminee'&&!iv._equipage1?'<div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;padding:8px 10px;margin:6px 0;font-size:11px;color:#9A3412;">Ancienne fiche PILP : l’équipage n’avait pas été enregistré par la version utilisée lors du départ.</div>':''}
    ${linkedInternalReinforcementsHTML(iv)}
    ${interventionInternalReinforcements(iv).length?`<div class="mr"><div class="ml" style="color:#047857;">🏠 Renforts internes</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${interventionInternalReinforcements(iv).map((renfort,index)=>'<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:8px 10px;"><div style="font-size:11px;font-weight:700;color:#047857;margin-bottom:5px;">Renfort interne '+(index+1)+' · '+(renfort.engin||'Véhicule à corriger')+' · '+(renfort.hDebut||'')+'</div><div style="display:flex;flex-wrap:wrap;gap:4px;">'+(renfort.equipage||[]).map(e=>{const u=USERS.find(x=>x.l===e.login);return'<span style="background:#fff;color:#065F46;border:1px solid #A7F3D0;border-radius:6px;padding:2px 8px;font-size:10px;"><span style="opacity:.75;">'+(e.role||'Agent')+'</span> '+(u?fullName(u):e.login)+'</span>';}).join('')+'</div></div>').join('')}</div></div></div>`:''}
    ${(iv._releves&&iv._releves.filter(r=>!r.isRenfort&&!r.isRenfortInterne).length)?`<div class="mr"><div class="ml" style="color:#0369A1;">&#x1F504; Relèves</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${iv._releves.filter(r=>!r.isRenfort&&!r.isRenfortInterne).map((r,ri)=>{
      const originalReleveIndex=iv._releves.indexOf(r);
      const enAttenteRetour=r.ancienEquipage.filter(e=>!e.hRetour);
      const rentres=r.ancienEquipage.filter(e=>e.hRetour);
      return'<div style="background:#F0F9FF;border-radius:8px;padding:8px 10px;border:1px solid #BAE6FD;">'
        +'<div style="font-size:10px;font-weight:600;color:#0369A1;margin-bottom:4px;">Relève n°'+(ri+1)+' — '+r.hReleve+'</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">'
        +r.nouvelEquipage.map(e=>{const u=USERS.find(x=>x.l===e.login);return'<span style="background:#DBEAFE;color:#1D4ED8;border-radius:5px;padding:2px 7px;font-size:10px;"><span style="opacity:.7;">'+e.role+'</span> '+(u?fullName(u):e.login)+'</span>';}).join('')
        +'</div>'
        +(enAttenteRetour.length?'<div style="font-size:10px;color:#854F0B;margin-top:4px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">En route retour : <span>'+enAttenteRetour.map(e=>{const u=USERS.find(x=>x.l===e.login);return u?fullName(u):e.login;}).join(', ')+'</span>'+(iv.agr===CU.l||iv._agr2===CU.l||enAttenteRetour.some(e=>e.login===CU.l)?'<button class="btn sm" style="font-size:9px;padding:1px 6px;background:#0369A1;color:#fff;" onclick="confirmerRetour(\''+iv.id+'\','+originalReleveIndex+',\'\')">&#x2705; Retour caserne (tous)</button>':'')+'</div>':'')
        +(rentres.length?'<div style="font-size:10px;color:#3B6D11;margin-top:2px;">Rentrés : '+rentres.map(e=>{const u=USERS.find(x=>x.l===e.login);return(u?fullName(u):e.login)+' ('+e.hRetour+')';}).join(', ')+'</div>':'')
        +'</div>';
    }).join('')}</div></div></div>`:''}
    ${(iv._releves&&iv._releves.filter(r=>r.isRenfort&&!r.isRenfortInterne).length)?`<div class="mr"><div class="ml" style="color:#7C3AED;">&#x1F692; Renforts UT présents</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${iv._releves.filter(r=>r.isRenfort&&!r.isRenfortInterne).map(r=>{
      const cas=CASERNES.find(x=>x.id===r.caserneRenfort);
      const casNom=cas?cas.nom:r.caserneRenfort;
      return'<div style="background:#F5F3FF;border-radius:8px;padding:8px 10px;border:1px solid #DDD6FE;">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
        +(r.enginRenfort?'<span class="bdg bb">'+r.enginRenfort+'</span>':'')
        +'<span style="font-size:11px;font-weight:600;color:#7C3AED;">'+casNom+'</span>'
        +'<span style="font-size:10px;color:var(--t2);margin-left:auto;">depuis '+r.hReleve+'</span>'
        +'</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:3px;">'
        +r.nouvelEquipage.map(e=>{const u=USERS.find(x=>x.l===e.login);return'<span style="background:#EDE9FE;color:#5B21B6;border-radius:5px;padding:2px 7px;font-size:10px;"><span style="opacity:.7;">'+e.role+'</span> '+(u?fullName(u):e.login)+'</span>';}).join('')
        +'</div></div>';
    }).join('')}</div></div></div>`:''}

    ${(iv._renforts&&iv._renforts.length)?`<div class="mr"><div class="ml" style="color:#7C3AED;">&#x1F4E2; Renforts UT demandés</div><div class="mv2"><div style="display:flex;flex-direction:column;gap:6px;">${iv._renforts.map(r=>{
      const canCancel=r.statut!=='annule'&&r.statut!=='termine';
      // Récupérer le statut réel depuis chaque caserne destinataire
      const destDetails=r.destinataires.map(function(cid){
        const c=CASERNES.find(function(x){return x.id===cid;});
        const rDest=(CASERNE_DATA[cid]?.renforts||[]).find(function(x){return x.id===r.id;});
        const statDest=rDest?rDest.statut:r.statut;
        const reponduPar=rDest?.reponduPar||'';
        const hReponse=rDest?.hReponse||'';
        const statColors={'en-attente':'#854F0B','accepte':'#3B6D11','en-cours':'#185FA5','termine':'#3B6D11','refuse':'#E24B4A','annule':'#888'};
        const statLabels={'en-attente':'Demande en cours','accepte':'Accept\u00e9','en-cours':'En cours','termine':'Termin\u00e9','refuse':'Refus\u00e9','annule':'Annul\u00e9'};
        const canCancelDest=statDest==='en-attente'; // annulation seulement si pas encore répondu
        const statDisplay=statDest==='en-attente'?'Demande en cours':statLabels[statDest]||statDest;
        return'<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:5px 8px;background:#fff;border-radius:6px;border:1px solid #E9D5FF;">'
          +'<span style="font-size:12px;font-weight:500;flex:1;">'+(c?c.nom:cid)+'</span>'
          +'<span style="font-size:10px;font-weight:600;background:'+(statColors[statDest]||'#666')+';color:#fff;border-radius:5px;padding:1px 7px;">'+statDisplay+'</span>'
          +(reponduPar?'<span style="font-size:10px;color:var(--t2);">par '+reponduPar+(hReponse?' à '+hReponse:'')+'</span>':'')
          +(canCancelDest?'<button class="btn sm" style="font-size:9px;padding:1px 6px;color:#E24B4A;border-color:#E24B4A;" onclick="annulerRenfortUT(\''+iv.id+'\',\''+r.id+'\',\''+cid+'\')">✕</button>':'')
          +'</div>';
      }).join('');
      return'<div style="background:#F5F3FF;border-radius:8px;padding:8px 10px;border:1px solid #DDD6FE;">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        +'<span style="font-size:11px;font-weight:600;color:#7C3AED;">'+(r.type==='complet'?'&#x1F692; Renfort complet':'&#x1F465; Renfort personnel')+'</span>'
        +'<span style="font-size:10px;color:var(--t2);">'+r.hDemande+'</span>'
        +(canCancel?'<button class="btn sm" style="font-size:9px;padding:1px 8px;color:#E24B4A;border-color:#E24B4A;margin-left:auto;" onclick="annulerRenfort(\''+iv.id+'\',\''+r.id+'\')">✕ Annuler tout</button>':'<span style="font-size:10px;color:#888;margin-left:auto;">Annulé</span>')
        +'</div>'
        +(r.note?'<div style="font-size:10px;color:var(--t2);margin-bottom:5px;">'+r.note+'</div>':'')
        +destDetails
        +'</div>';
    }).join('')}</div></div></div>`:''}
    ${iv._isRenfort?`<div class="mr"><div class="ml" style="color:${isInternalReinforcement?'#047857':'#7C3AED'};">&#x1F692; ${isInternalReinforcement?'Renfort interne':'Mode Renfort UT'}</div><div class="mv2" style="font-size:12px;background:${isInternalReinforcement?'#ECFDF5':'#F5F3FF'};border-radius:8px;padding:8px 12px;border:1px solid ${isInternalReinforcement?'#A7F3D0':'#DDD6FE'};"><span style="font-weight:600;color:${isInternalReinforcement?'#047857':'#7C3AED'};">${isInternalReinforcement?'Renfort lié à '+(iv._sourceInterventionNumber||iv._ivSourceId||'l’intervention principale'):'Renfort pour '+(iv._caserneSourceNom||iv._caserneSource||'')}</span><br><span style="font-size:11px;color:var(--t2);">${isInternalReinforcement?'Cette mission dispose de son propre véhicule, de son équipage et de son rapport de renfort.':'Votre caserne est intervenue en renfort sur cette intervention.'}</span></div></div>`:''}
    ${iv.det?`<div class="mr"><div class="ml">Détails</div><div class="mv2">${escHtml(iv.det)}</div></div>`:''}
    ${iv.s==='terminee'&&(iv._crTexte||iv._compteRendu)&&(isInterventionReportChef(iv,CU.l)||agentInIV(iv,CU.l)||hasAdministrativeAccount())?`<div class="mr"><div class="ml" style="color:#0F766E;">&#x1F4CB; Compte rendu${iv._crValide?' &#x1F512;':''}</div><div class="mv2" style="white-space:pre-wrap;font-size:12px;background:#F0FDFA;border-radius:8px;padding:8px 10px;border:1px solid #99F6E4;">${iv._crTexte||iv._compteRendu}</div></div>`:''}
    ${iv.s==='terminee'&&(isInterventionReportChef(iv,CU.l)||hasAdministrativeAccount())?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 2px 0;">
      <button class="btn sm" style="background:#0F766E;color:#fff;border-color:#0F766E;" onclick="showCompteRenduModal('${iv.id}')">${iv._crValide?'&#x1F512; Voir':iv._crTexte||iv._compteRendu?'&#x270F;&#xFE0F; Modifier':'&#x1F4CB; Rédiger le compte rendu'}</button>
      <button class="btn sm" style="background:#C0392B;color:#fff;" onclick="voirRapportIntervention('${iv.id}')">&#x1F5A8; Rapport PDF</button>
    </div>`:``}    <div class="msep"></div>
    ${(iv._pdfAutorisation||iv._pdfAttestation||iv._autorisationData||(Array.isArray(iv._autorisationNids)&&iv._autorisationNids.some(Boolean)))&&_showAutoBtn&&(iv.agr===CU.l||iv._agr2===CU.l||isAdminModeActive())?`<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:10px 12px;margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:#6B3AA0;margin-bottom:8px;">&#x1F4DD; Documents autorisation / attestation</div>
      ${autorisationDocumentsHTML(iv)}
    </div>`:''}
    ${iv._avisPassage&&(iv.agr===CU.l||iv._agr2===CU.l||hasAdministrativeAccount())?`<div style="background:#FAF5FF;border:1px solid #D8B4FE;border-radius:10px;padding:10px 12px;margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:#6B21A8;margin-bottom:8px;">&#x1F4EC; Avis de passage${getAvisPassageHour(iv)?' — déposé à '+escHtml(getAvisPassageHour(iv)):''}${iv._avisPassageClasse?' — classé':''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn sm" style="background:#7E22CE;color:#fff;border-color:#7E22CE;" onclick="viewAvisPassageDocument('${iv.id}')">&#x1F4CB; Voir l'avis de passage</button>${isAdminModeActive()&&iv._avisEnAttente?`<button class="btn sm" style="background:#6B21A8;color:#fff;border-color:#6B21A8;" onclick="classerAvisPassage('${iv.id}','${pilpScope?'pilp':'standard'}')">&#x1F5C3;&#xFE0F; Classer</button>`:''}${isAdminModeActive()&&iv._avisPassageClasse===true&&!iv._avisEnAttente?`<button class="btn sm" style="background:#fff;color:#6B21A8;border-color:#A855F7;" onclick="restaurerAvisPassage('${iv.id}','${pilpScope?'pilp':'standard'}')">↩ Remettre en attente</button>`:''}</div>
    </div>`:''}
    ${(['en-attente','selectionne','en-cours'].includes(iv.s)&&(hasRight('Interventions')||isAgres()||isChef()||isAdminModeActive()))?`<button class="btn sm" style="width:100%;margin-bottom:8px;background:#0369A1;color:#fff;border-color:#0369A1;" onclick="showComplementModal('${iv.id}')">&#x2139;&#xFE0F; Compléter : information, téléphone ou disponibilité</button>`:''}
    <details style="background:var(--bg);border-radius:10px;margin-bottom:8px;" id="tl-details-${iv.id}">
      <summary style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;">
        Historique des statuts <span style="font-size:10px;background:var(--brd);border-radius:10px;padding:1px 7px;color:var(--t2);font-weight:400;">${(iv.tl||[]).length}</span>
      </summary>
      <div style="padding:0 12px 10px 12px;">${tlHtml||'<div style="font-size:12px;color:var(--t2);">Aucun historique.</div>'}</div>
    </details>
    ${reclassHtml}${actions}`;
  document.getElementById('mo').style.display='flex';
}
function setAgr2(ivId,login){
  const iv=interventionById(ivId);if(!iv)return;
  if(login){
    const conflict=findActivePersonnelConflict(login,ivId);
    if(conflict){
      showOperationalConflict('personnel',login,conflict);
      oM(ivId);
      return;
    }
  }
  const old2=iv._agr2;
  iv._agr2=login||null;
  // Tracer dans la timeline
  if(login&&login!==old2){
    const u2=USERS.find(u=>u.l===login);
    const nom2=u2?fullName(u2):login;
    pushTL(iv,'selectionne',CU.l+' + '+nom2+' (2\u00e8me chef)');
  }
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  refreshOperationalInterventionViews();oM(ivId);
}
let _modalLocked = false;
function cM(){
  if(_modalLocked)return;
  const mo=document.getElementById('mo'),panel=mo&&mo.querySelector('.mod');
  if(mo&&mo.classList.contains('cr-modal-overlay'))window._activeReportDraftIvId=null;
  deactivateMobileModalField();
  if(mo)mo.style.display='none';
  if(mo)mo.classList.remove('cr-modal-overlay','pec-modal-overlay','pec-form-active');
  if(mo)mo.classList.remove('address-edit-modal');
  if(panel)panel.scrollTop=0;
}
window._activeMobileModalFieldId='';
function keepMobileModalFieldVisible(){
  const fieldId=window._activeMobileModalFieldId;
  const field=fieldId&&document.getElementById(fieldId);
  const overlay=document.getElementById('mo');
  if(!field||!overlay||!overlay.classList.contains('keyboard-aware-modal'))return;
  const scrollHost=field.closest&&field.closest('.pec-form-scroll');
  if(scrollHost){
    const fieldRect=field.getBoundingClientRect(),hostRect=scrollHost.getBoundingClientRect();
    const margin=16;
    if(fieldRect.bottom>hostRect.bottom-margin){
      scrollHost.scrollTop+=fieldRect.bottom-(hostRect.bottom-margin);
    }else if(fieldRect.top<hostRect.top+margin){
      scrollHost.scrollTop-=hostRect.top+margin-fieldRect.top;
    }
    return;
  }
  try{field.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});}catch(e){field.scrollIntoView();}
}
function activateMobileModalField(fieldId){
  const overlay=document.getElementById('mo');
  const field=document.getElementById(fieldId);
  if(!overlay||!field)return;
  window._activeMobileModalFieldId=fieldId;
  overlay.classList.add('keyboard-aware-modal');
  const keep=function(){setTimeout(keepMobileModalFieldVisible,80);};
  field.addEventListener('focus',keep,{passive:true});
  field.addEventListener('input',keep,{passive:true});
  requestAnimationFrame(keep);
}
function deactivateMobileModalField(){
  const overlay=document.getElementById('mo');
  window._activeMobileModalFieldId='';
  if(overlay)overlay.classList.remove('keyboard-aware-modal');
}
function registerMobileModalFields(root){
  const overlay=document.getElementById('mo');
  if(!overlay||!root)return;
  overlay.classList.add('keyboard-aware-modal');
  root.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]),textarea,select').forEach(function(field){
    if(!field.id)return;
    const keep=function(){
      window._activeMobileModalFieldId=field.id;
      setTimeout(keepMobileModalFieldVisible,80);
    };
    field.addEventListener('focus',keep,{passive:true});
    field.addEventListener('input',keep,{passive:true});
  });
}
function prepareAnimalModal(formActive){
  const overlay=document.getElementById('mo');
  if(!overlay)return;
  deactivateMobileModalField();
  overlay.classList.add('pec-modal-overlay');
  overlay.classList.toggle('pec-form-active',!!formActive);
  if(formActive)overlay.classList.add('keyboard-aware-modal');
}
function openModalAtTop(focusId){
  const mo=document.getElementById('mo'),panel=mo&&mo.querySelector('.mod');
  if(!mo)return;
  mo.style.display='flex';
  const reset=function(){
    if(panel)panel.scrollTop=0;
    const body=document.getElementById('mb');if(body)body.scrollTop=0;
  };
  reset();
  requestAnimationFrame(function(){
    reset();
    if(focusId){
      const field=document.getElementById(focusId);
      if(field){try{field.focus({preventScroll:true});}catch(err){field.focus();}reset();}
    }
  });
}

let _modalScrollY=0;
function syncModalBackgroundLock(){
  const mo=document.getElementById('mo'),iframeModal=document.getElementById('iframe-modal');
  const isOpen=(mo&&getComputedStyle(mo).display!=='none')||(iframeModal&&getComputedStyle(iframeModal).display!=='none');
  const root=document.documentElement,body=document.body;
  if(isOpen&&!root.classList.contains('modal-scroll-locked')){
    _modalScrollY=window.scrollY||window.pageYOffset||0;
    root.classList.add('modal-scroll-locked');
    body.style.top=(-_modalScrollY)+'px';
  }else if(!isOpen&&root.classList.contains('modal-scroll-locked')){
    root.classList.remove('modal-scroll-locked');
    body.style.removeProperty('top');
    window.scrollTo(0,_modalScrollY);
  }
}
requestAnimationFrame(function(){
  ['mo','iframe-modal'].forEach(function(id){
    const el=document.getElementById(id);
    if(el)new MutationObserver(syncModalBackgroundLock).observe(el,{attributes:true,attributeFilter:['style','class']});
  });
  syncModalBackgroundLock();
});

function agresEnCours(){
  // La règle 1 seul en-cours s'applique dès que l'utilisateur est chef d'agrès OU tireur PILP,
  // quels que soient ses autres droits (chef, admin...).
  if(!isAgres()&&!isTireurPILP())return null;
  const ivNorm=IVS.find(v=>v.s==='en-cours'&&(v.agr===CU.l||v._agr2===CU.l)&&!v._isPilip);
  if(ivNorm)return ivNorm;
  const ivPilp=PILP_IVS.find(v=>v.s==='en-cours'&&(v.agr===CU.l||v._agr2===CU.l));
  return ivPilp||null;
}
function showBlockModal(enCours){
  document.getElementById('mt').textContent='Action bloquée';
  document.getElementById('mi').textContent='';
  document.getElementById('mb').innerHTML=`
    <div style="padding:14px;background:var(--rl);border:1.5px solid var(--rd);border-radius:12px;">
      <div style="font-size:14px;font-weight:700;color:var(--rd);margin-bottom:8px;">⛔ Intervention déjà en cours</div>
      <div style="font-size:13px;color:var(--rd);margin-bottom:12px;">
        Vous avez déjà une intervention en cours.<br>
        Vous devez la clôturer avant d'en commencer une nouvelle.
      </div>
      <div style="background:#fff;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;border:1px solid var(--brd);">
        <strong>${enCours.id}</strong> — ${enCours.n}<br>
        <span style="color:var(--t2);">&#x1F4CD; ${enCours.com}</span>
      </div>
      <button class="btn sm" style="background:var(--red);color:#fff;border-color:var(--red);width:100%;margin-bottom:8px;" onclick="cM();oM('${enCours.id}')">&#x1F449; Clôturer ${enCours.id}</button>
      <button class="mclose" onclick="cM()">Annuler</button>
    </div>`;
  document.getElementById('mo').style.display='flex';
}
const OPERATIONAL_START_RADIUS_METERS=2000;
const OPERATIONAL_START_GRACE_MINUTES=15;
const _operationalStartAuthorizations={};
function operationalStartGeolocationEnabled(caserneId){
  if((typeof isChefCorps==='function'&&isChefCorps())||(CU&&CU.appRole==='chef_corps'))return false;
  const id=caserneId||CURRENT_CASERNE_ID;
  const caserne=CASERNES.find(function(item){return item.id===id;});
  const data=CASERNE_DATA[id]||{};
  if(data._operationalStartGeolocationEnabled!==undefined)return data._operationalStartGeolocationEnabled!==false;
  return !(caserne&&caserne._operationalStartGeolocationEnabled===false);
}
function canUseOperationalStartDevice(){
  if(typeof navigator==='undefined')return false;
  if(navigator.userAgentData&&navigator.userAgentData.mobile===true)return true;
  const ua=String(navigator.userAgent||'');
  if(/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua))return true;
  // Depuis iPadOS 13, Safari peut se présenter comme un Mac.
  return /Macintosh/i.test(ua)&&Number(navigator.maxTouchPoints||0)>1;
}
function hasSuperAdminOperationalStartOverride(){
  return GLOBAL_ROLE==='superadmin'&&typeof isSuperAdmin==='function'&&isSuperAdmin();
}
function canUseOperationalStartInterface(){
  return canUseOperationalStartDevice()||hasSuperAdminOperationalStartOverride();
}
function operationalDistanceMeters(lat1,lon1,lat2,lon2){
  const rad=Math.PI/180,dLat=(lat2-lat1)*rad,dLon=(lon2-lon1)*rad;
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function recentFinishedInterventionForChef(login,excludeId){
  const now=N().getTime(),maxDelay=OPERATIONAL_START_GRACE_MINUTES*60*1000;
  return [].concat(IVS||[],PILP_IVS||[]).map(function(item){
    if(!item||item.id===excludeId||item.s!=='terminee')return null;
    const involved=item.agr===login||item._agr2===login||(typeof isInterventionReportChef==='function'&&isInterventionReportChef(item,login));
    if(!involved)return null;
    const bounds=interventionOperationalBounds(item),delay=now-bounds.end;
    return Number.isFinite(bounds.end)&&delay>=0&&delay<=maxDelay?{iv:item,end:bounds.end,delay:delay}:null;
  }).filter(Boolean).sort(function(a,b){return b.end-a.end;})[0]||null;
}
function previousRouteInterventionForStart(iv,login){
  if(!iv||!iv._routeBatchId)return null;
  const order=Number(iv._routeOrder)||0;
  return [].concat(IVS||[],PILP_IVS||[]).filter(function(candidate){
    if(!candidate||candidate.id===iv.id||candidate.s!=='terminee'||candidate._routeBatchId!==iv._routeBatchId)return false;
    if(candidate.agr!==login&&candidate._agr2!==login)return false;
    const candidateOrder=Number(candidate._routeOrder)||0;
    return candidateOrder>0&&(!order||candidateOrder<order)&&!!candidate._hFin;
  }).sort(function(a,b){return (Number(b._routeOrder)||0)-(Number(a._routeOrder)||0);})[0]||null;
}
function prepareRouteChainedOperationalStart(iv){
  const previous=previousRouteInterventionForStart(iv,CU&&CU.l);
  if(!previous)return null;
  _pendingNextInterventionStarts[iv.id]=previous._hFin;
  iv._chainPreviousInterventionId=previous.id;
  return previous;
}
function operationalStartGeoExemption(iv){
  const routePrevious=prepareRouteChainedOperationalStart(iv);
  if(routePrevious)return {reason:'enchaînement de tournée après '+routePrevious.id,sourceId:routePrevious.id};
  if(iv&&_pendingNextInterventionStarts&&_pendingNextInterventionStarts[iv.id])return {reason:'enchaînement de tournée'};
  if(iv&&(IVS||[]).includes(iv)){
    const interrupted=findInterruptedDepartureHandoff(CU.l,iv.id);
    if(interrupted)return {reason:'reprise d’un départ interrompu',sourceId:interrupted.source.id};
  }
  const recent=recentFinishedInterventionForChef(CU&&CU.l,iv&&iv.id);
  if(recent)return {reason:'intervention précédente terminée depuis moins de 15 minutes',sourceId:recent.iv.id};
  return null;
}
function requestOperationalStartAuthorization(iv,onApproved){
  if(hasSuperAdminOperationalStartOverride()){
    _operationalStartAuthorizations[iv.id]={at:Date.now(),exempt:true,reason:'départ autorisé sur ordinateur par le superadmin avec pouvoirs activés'};
    onApproved();return;
  }
  if(!canUseOperationalStartDevice()){
    showToast('Le passage « En cours » est autorisé uniquement sur mobile ou tablette.','warn');return;
  }
  if(!operationalStartGeolocationEnabled()){
    const exemptReason=(typeof isChefCorps==='function'&&isChefCorps())||(CU&&CU.appRole==='chef_corps')?'chef de corps exempté du contrôle de présence':'contrôle de présence désactivé pour cette caserne';
    _operationalStartAuthorizations[iv.id]={at:Date.now(),exempt:true,reason:exemptReason};
    onApproved();return;
  }
  const exemption=operationalStartGeoExemption(iv);
  if(exemption){
    _operationalStartAuthorizations[iv.id]={at:Date.now(),exempt:true,reason:exemption.reason,sourceId:exemption.sourceId||''};
    onApproved();return;
  }
  const caserne=CC(),stationLocation=getCaserneStationLocation(CURRENT_CASERNE_ID);
  const stationLat=stationLocation.latitude,stationLon=stationLocation.longitude;
  if(!caserne||!validCaserneCoordinates(stationLat,stationLon)){
    showToast('La position de la caserne n’est pas configurée. Le superadmin doit enregistrer son adresse avant le premier départ.','warn');return;
  }
  if(!navigator.geolocation){showToast('La géolocalisation n’est pas disponible sur cet appareil.','warn');return;}
  showToast('Vérification de votre présence à la caserne…','info');
  navigator.geolocation.getCurrentPosition(function(position){
    const accuracy=Number(position.coords.accuracy)||0;
    if(accuracy>1000){showToast('Position trop imprécise ('+Math.round(accuracy)+' m). Activez la localisation précise puis réessayez.','warn');return;}
    const distance=operationalDistanceMeters(position.coords.latitude,position.coords.longitude,stationLat,stationLon);
    if(distance>OPERATIONAL_START_RADIUS_METERS){
      showToast('Départ refusé : vous êtes à '+(distance/1000).toFixed(1).replace('.',',')+' km de la caserne. La première mise en cours doit se faire dans un rayon de 2 km.','warn');return;
    }
    _operationalStartAuthorizations[iv.id]={at:Date.now(),exempt:false,distanceMeters:Math.round(distance),accuracyMeters:Math.round(accuracy),caserneId:caserne.id};
    onApproved();
  },function(error){
    const denied=error&&error.code===1;
    showToast(denied?'Autorisez la localisation pour démarrer la première intervention.':'Position introuvable. Activez le GPS puis réessayez.','warn');
  },{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
}
function takeOperationalStartAuthorization(iv){
  const authorization=iv&&_operationalStartAuthorizations[iv.id];
  if(!authorization)return null;
  if(Date.now()-authorization.at>5*60*1000){delete _operationalStartAuthorizations[iv.id];return null;}
  delete _operationalStartAuthorizations[iv.id];
  return authorization;
}
function saveOperationalStartAuthorization(iv,authorization){
  if(!iv||!authorization)return;
  iv._departGeoControle={date:getH(N()),caserneId:authorization.caserneId||CURRENT_CASERNE_ID,exonere:authorization.exempt===true,
    motif:authorization.reason||'',distanceMetres:authorization.distanceMeters==null?null:authorization.distanceMeters,precisionMetres:authorization.accuracyMeters==null?null:authorization.accuracyMeters};
  if(!Array.isArray(iv.tl))iv.tl=[];
  iv.tl.push({s:'controle-depart',h:getH(N()),who:CU.l,note:authorization.exempt?'Contrôle de position non requis — '+authorization.reason:'Présence à la caserne confirmée à '+authorization.distanceMeters+' m (précision '+authorization.accuracyMeters+' m)'});
}
function cS(id,s,confirmed){
  const iv=interventionById(id);if(!iv)return;
  const previousStatus=iv.s;
  if(s==='en-attente'&&previousStatus==='en-cours'&&confirmed!==true){
    const oldStart=iv._hDebut||iv._hDebutReelle||'';
    confirmModal('Remettre cette intervention en attente ?'+(oldStart?' Le départ enregistré à '+oldStart+' sera annulé.':'')+' Le numéro UT sera retiré et l’intervention devra être sélectionnée puis redémarrée.',function(){cS(id,s,true);});
    return;
  }
  if(s==='en-cours'){
    if(confirmed!=='start-authorized'){
      prepareRouteChainedOperationalStart(iv);
      requestOperationalStartAuthorization(iv,function(){cS(id,s,'start-authorized');});return;
    }
    const ec=agresEnCours();
    if(ec&&ec.id!==id){showBlockModal(ec);return;}
    showPersonnelModal(id);
    return;
  }
  // Bloquer si déjà sélectionné par quelqu'un d'autre
  if(s==='selectionne'&&iv.s==='en-attente'){
    if(iv.agr&&iv.agr!==CU.l){
      const autreAgr=USERS.find(u=>u.l===iv.agr);
      const nom=autreAgr?fullName(autreAgr):iv.agr;
      showToast('⚠️ Déjà sélectionné par '+nom,'warn');
      return;
    }
  }
  if(!iv.tl)iv.tl=[];
  iv.s=s;
  if(s==='selectionne'||s==='en-cours'){ if(isAgres()||isChef()||isAdminModeActive()||(isPilpIntervention(iv)&&isTireurPILP())) iv.agr=CU.l; }
  if(isPilpIntervention(iv)&&(s==='selectionne'||s==='en-cours'))iv.tireur=CU.l;
  if(s==='selectionne'){
    parcConfirmed.delete(iv.id);
    assignInterventionRoute(iv,iv.agr||CU.l);
  }
  if(s==='en-attente'){
    if(previousStatus==='en-cours'){
      iv._retourAttenteDepuis='en-cours';
      iv._hDebutAvantRetourAttente=iv._hDebut||iv._hDebutReelle||'';
      iv._dateDebutAvantRetourAttente=iv._dateDebut||'';
      iv._retourAttenteAt=getH(N());
      iv._retourAttentePar=CU.l;
      clearInterventionDepartureForPending(iv,CU.l);
    }
    else clearInterventionOperationalAssignmentForPending(iv,CU.l);
    clearInterventionNumbersForPending(iv);
    parcConfirmed.delete(iv.id);
    iv.agr=null;
    if(isPilpIntervention(iv))iv.tireur=null;
    delete iv._routeBatchId;delete iv._routeOrder;
  }
  const agr2Label=iv._agr2?(()=>{const u=USERS.find(u=>u.l===iv._agr2);return u?' + '+fullName(u)+' (2\u00e8me)':' + '+iv._agr2;})():'';
  const statusNote=s==='selectionne'
    ?'Ordre de tournée : '+iv._routeOrder
    :(s==='en-attente'&&previousStatus==='en-cours'?'Retour en attente confirmé'+(iv._hDebutAvantRetourAttente?' — ancien départ : '+iv._hDebutAvantRetourAttente:''):'');
  pushTL(iv,s,CU.l+agr2Label,statusNote);
  syncInternalReinforcementSource(iv);
  if(CD()){CD().ivs=IVS;CD().pilpIvs=PILP_IVS;}
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);
  cM();refreshOperationalInterventionViews();
  if(s==='terminee')rAccueil();
  rStatsHeader();
}

function getNextSelectedInterventions(closedIv){
  if(!closedIv)return[];
  return sortRouteSelection(interventionCollection(closedIv).filter(function(candidate){
    if(candidate.id===closedIv.id||candidate.s!=='selectionne'||candidate.agr!==closedIv.agr)return false;
    if(closedIv._routeBatchId)return candidate._routeBatchId===closedIv._routeBatchId;
    return true;
  }));
}

function chooseNextSelectedIntervention(nextId,previousId){
  const next=interventionById(nextId);
  const previous=interventionById(previousId);
  if(!next||!previous)return;
  _pendingNextInterventionStarts[nextId]=previous._hFin||getHHMM(N());
  next._chainPreviousInterventionId=previous.id;
  cM();
  cS(nextId,'en-cours');
}

function showNextSelectedInterventionModal(closedIv){
  if(!closedIv||closedIv.agr!==CU.l)return;
  const nextItems=getNextSelectedInterventions(closedIv);
  if(!nextItems.length)return;
  document.getElementById('mt').textContent='Intervention suivante';
  document.getElementById('mi').textContent='Départ proposé à '+(closedIv._hFin||getHHMM(N()));
  document.getElementById('mb').innerHTML=
    '<div style="background:#EEF2FF;border:1px solid #C7D2FE;border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#3730A3;">'
    +'Sélectionnez l’intervention à enchaîner. Son heure de début reprendra automatiquement l’heure de fin de l’intervention que vous venez de clôturer.</div>'
    +nextItems.map(function(next,index){
      return '<button class="btn" style="width:100%;text-align:left;justify-content:flex-start;margin-bottom:8px;padding:10px 12px;" onclick="chooseNextSelectedIntervention(\''+next.id+'\',\''+closedIv.id+'\')">'
        +'<span style="display:inline-flex;width:24px;height:24px;border-radius:50%;align-items:center;justify-content:center;background:#E0E7FF;color:#3730A3;font-weight:700;margin-right:8px;flex:0 0 auto;">'+(index+1)+'</span>'
        +'<span><strong>'+escHtml(next.n)+'</strong><br><span style="font-size:11px;color:var(--t2);">Ordre de tournée '+(Number(next._routeOrder)||index+1)+' · &#x1F4CD; '+escHtml(interventionAddressLabel(next))+'</span></span></button>';
    }).join('')
    +'<button class="mclose" onclick="cM()">Plus tard</button>';
  document.getElementById('mo').style.display='flex';
}

function clot(id){
  const iv=interventionById(id);if(!iv)return;
  const collection=interventionCollection(iv);
  // Ne pas re-clôturer une intervention déjà liée à une PILP
  if(iv._lienPilp&&iv.s==='terminee'){showToast('Cette intervention est déjà clôturée (liée à une PILP).','warn');cM();return;}
  const avis=document.getElementById('chk-av')&&document.getElementById('chk-av').checked;
  const avisHeure=avis&&document.getElementById('avis-passage-hour')?document.getElementById('avis-passage-hour').value:'';
  if(avis&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(avisHeure)){
    showToast('Renseignez l’heure à laquelle l’avis de passage a été déposé.','warn');
    const field=document.getElementById('avis-passage-hour');if(field){field.focus();field.scrollIntoView({behavior:'smooth',block:'center'});}
    return;
  }
  const h=getH(N());
  const agr2Lbl=iv._agr2?(()=>{const u=USERS.find(u=>u.l===iv._agr2);return u?' + '+fullName(u)+' (2\u00e8me)':' + '+iv._agr2;})():'';
  if(avis){
    // Avis de passage : le requérant était absent. L'intervention de CETTE équipe
    // est TERMINÉE (avec compte rendu), mais on garde le marqueur _avisPassage pour
    // signaler qu'un avis a été laissé et qu'on attend le rappel du requérant.
    iv._avisPassage=true;
    iv._avisEnAttente=true; // indicateur "en attente de rappel" (levé quand le requérant rappelle)
    iv._avisPassageHeure=avisHeure;
    iv._avisPassageDate=getDS(N());
    iv._avisPassageAt=h;
    iv.tl.push({s:'avis-passage',h,who:CU.l,note:'Avis déposé à '+avisHeure});
    // On NE retourne PAS : on laisse le flux de clôture normale terminer l'intervention.
  }
  // Clôture normale : verrouiller immédiatement avant toute autre opération afin
  // qu'un pull déjà en cours ne puisse pas restaurer l'ancien statut.
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  iv.s='terminee';iv._hFin=getHHMM(N());iv.tl.push({s:'terminee',h,who:CU.l+agr2Lbl});
  syncInternalReinforcementSource(iv);
  supprimerDemandesRenfortSansReponse(iv,CURRENT_CASERNE_ID);
  (iv.avisIds||[]).forEach(aid=>{const av=collection.find(v=>v.id===aid&&v.s==='avis-passage'&&v.id!==iv.id);if(av){av.s='terminee';av.tl.push({s:'terminee',h,who:CU.l+' (fusion)'});}});
  const autorisationNids=Array.isArray(iv._autorisationNids)?iv._autorisationNids:(iv._autorisationData?[iv._autorisationData]:[]);
  if(autorisationNids.some(function(data){return data&&data.nom;})){
    iv._pdfAutorisations=[];iv._pdfAttestations=[];
    autorisationNids.forEach(function(data,index){
      if(!data||!data.nom)return;
      iv._pdfAutorisations[index]=_buildAutorisationHTML(id,'autorisation',index);
      iv._pdfAttestations[index]=_buildAutorisationHTML(id,'attestation',index);
    });
    iv._pdfAutorisation=iv._pdfAutorisations[0]||'';
    iv._pdfAttestation=iv._pdfAttestations[0]||'';
  }
  if(!iv.eng&&selEng)iv.eng=selEng;
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);cM();refreshOperationalInterventionViews();rAccueil();rStatsHeader(); // push immédiat : clôture d'intervention
  setTimeout(function(){showNextSelectedInterventionModal(iv);},80);
}
function clotAvis(id){
  const iv=IVS.find(v=>v.id===id);if(!iv)return;
  const h=getH(N());
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  iv.s='terminee';iv.tl.push({s:'terminee',h,who:CU.l});
  supprimerDemandesRenfortSansReponse(iv,CURRENT_CASERNE_ID);
  (iv.avisIds||[]).forEach(aid=>{const av=IVS.find(v=>v.id===aid&&v.s==='avis-passage'&&v.id!==iv.id);if(av){av.s='terminee';av.tl.push({s:'terminee',h,who:CU.l+' (fusion)'});}});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true);cM();rI();
}
function reclasser(id){
  const iv=interventionById(id);if(!iv)return;
  const sel=document.getElementById('reclass-sel');if(!sel)return;
  const oldN=iv.n;iv.n=sel.value;
  iv.tl.push({s:'reclasse',h:getH(N()),who:CU.l,note:`${oldN} → ${iv.n}`});
  if(typeof _jbEditLock!=='undefined')_jbEditLock=Date.now();
  saveData(true); // push immédiat : sinon le changement de nature est écrasé au prochain pull
  cM();refreshOperationalInterventionViews();
  // Reopen modal with fresh data
  setTimeout(()=>oM(id),50);
}

