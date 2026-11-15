/* Reprise ciblée d'une copie V25 : aucun module AGAI n'est chargé, donc aucun
 * pull ne peut remplacer le cache local avant sa sauvegarde. */
(function(){
  'use strict';
  const station='CIS05',login='canneson.eric',week='20261116';
  const owner=encodeURIComponent(station+'__'+login);
  const cacheKey='agai_jb_cache_v2:'+owner;
  const backupKey='agai_piquet_recovery_v1:'+owner+':'+week;
  const authKey='agai_supabase_auth_v239';
  const state=document.getElementById('state'),button=document.getElementById('send');
  const config=window.AGAI_CONFIG||{};
  const base=String(config.supabaseUrl||'');
  const apikey=String(config.supabasePublishableKey||'');
  let saved=null,busy=false;
  function show(message){state.textContent=message;}
  function normalized(value){
    if(Array.isArray(value))return value.map(normalized);
    if(value&&typeof value==='object'){
      const result={};Object.keys(value).sort().forEach(function(key){result[key]=normalized(value[key]);});return result;
    }
    return value;
  }
  function same(a,b){return JSON.stringify(normalized(a))===JSON.stringify(normalized(b));}
  async function request(url,options){
    const controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000);
    try{return await fetch(url,Object.assign({cache:'no-store'},options||{},{signal:controller.signal}));}
    finally{clearTimeout(timer);}
  }
  function readSession(){
    try{const session=JSON.parse(localStorage.getItem(authKey)||'null');
      return session&&session._agai_link_login===login?session:null;
    }catch(error){return null;}
  }
  async function accessToken(){
    let session=readSession();
    if(!session)throw new Error('La session AGAI d’Éric est absente sur ce navigateur. Rien n’a été modifié.');
    if(session.access_token&&Number(session.expires_at)*1000>Date.now()+30000)return session.access_token;
    if(!session.refresh_token)throw new Error('La session AGAI a expiré. Rien n’a été modifié.');
    const response=await request(base+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{apikey:apikey,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:session.refresh_token})
    });
    const next=await response.json().catch(function(){return null;});
    const current=readSession();
    if(current&&current.refresh_token!==session.refresh_token&&current.access_token){
      return current.access_token;
    }
    if(!response.ok||!next||!next.access_token||!next.refresh_token)
      throw new Error('La session ne peut pas être renouvelée. Rien n’a été modifié.');
    session=Object.assign({},next,{_agai_link_login:login});
    localStorage.setItem(authKey,JSON.stringify(session));
    return session.access_token;
  }
  async function serverPiquets(token){
    const response=await request(base+'/rest/v1/records?id=eq.'+encodeURIComponent(station+'__config__main')+'&select=data,deleted&limit=1',{
      headers:{apikey:apikey,Authorization:'Bearer '+token}
    });
    if(!response.ok)throw new Error('Lecture serveur impossible (HTTP '+response.status+'). Rien n’a été transmis.');
    const rows=await response.json();
    if(!Array.isArray(rows)||rows.length!==1||rows[0].deleted||!rows[0].data)
      throw new Error('Configuration de caserne introuvable. Rien n’a été transmis.');
    const value=rows[0].data.piquets&&rows[0].data.piquets[week];
    if(value!==undefined&&!Array.isArray(value))throw new Error('Format serveur inattendu. Rien n’a été transmis.');
    return {piquets:value===undefined?null:value,validated:rows[0].data.piquetsValidated&&rows[0].data.piquetsValidated[week]===true};
  }
  async function start(){
    try{
      if(!base.startsWith('https://')||!apikey)throw new Error('Configuration réseau indisponible.');
      const raw=localStorage.getItem(cacheKey);
      const cache=raw&&JSON.parse(raw);
      const rows=cache&&cache.CASERNE_DATA&&cache.CASERNE_DATA[station]
        &&cache.CASERNE_DATA[station].piquets&&cache.CASERNE_DATA[station].piquets[week];
      let prior=null;
      try{prior=JSON.parse(localStorage.getItem(backupKey)||'null');}catch(error){}
      if(prior&&(!Array.isArray(prior.piquets)||prior.login!==login||prior.station!==station||prior.week!==week))
        throw new Error('Sauvegarde existante illisible. Rien n’a été transmis.');
      if(prior&&Array.isArray(rows)&&rows.length&&!same(prior.piquets,rows))
        throw new Error('La copie locale a changé depuis la première sauvegarde. Rien n’a été transmis automatiquement.');
      if(prior)saved=prior;
      else{
        if(!Array.isArray(rows)||!rows.length)
          throw new Error('Aucun piquet du 16 novembre n’est présent dans le cache de ce navigateur. Garde AGAI ouvert ; rien n’a été modifié.');
        saved={station:station,login:login,week:week,createdAt:new Date().toISOString(),piquets:rows};
        localStorage.setItem(backupKey,JSON.stringify(saved));
        const checked=JSON.parse(localStorage.getItem(backupKey)||'null');
        if(!checked||!same(checked.piquets,rows))throw new Error('Sauvegarde locale non vérifiée. Rien n’a été transmis.');
      }
      show(saved.piquets.length+' piquets sauvegardés sur ce téléphone. Vérification du serveur…');
      const remote=await serverPiquets(await accessToken());
      if(remote.validated)throw new Error('Cette semaine est déjà validée sur le serveur. Aucune modification.');
      if(same(remote.piquets,saved.piquets)){
        show(saved.piquets.length+' piquets déjà présents sur le serveur. Tu peux actualiser AGAI.');return;
      }
      if(remote.piquets!==null&&remote.piquets.length)
        throw new Error('Le serveur contient déjà des piquets différents pour cette semaine. Aucun écrasement automatique.');
      show(saved.piquets.length+' piquets sauvegardés ; la semaine est vide sur le serveur. Une seule transmission peut maintenant les rendre visibles aux responsables.');
      button.disabled=false;
    }catch(error){show(String(error&&error.message||error));}
  }
  button.addEventListener('click',async function(){
    if(busy||!saved||!Array.isArray(saved.piquets))return;
    busy=true;button.disabled=true;show('Transmission sécurisée en cours…');
    try{
      const token=await accessToken(),remote=await serverPiquets(token);
      if(remote.validated||remote.piquets!==null&&remote.piquets.length&&!same(remote.piquets,saved.piquets))
        throw new Error('La semaine a changé sur le serveur. Rien n’a été écrasé.');
      if(!same(remote.piquets,saved.piquets)){
        const response=await request(base+'/rest/v1/rpc/agai_save_unvalidated_piquet_week',{
          method:'POST',headers:{apikey:apikey,Authorization:'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify({p_week:week,p_expected:remote.piquets,p_next:saved.piquets})
        });
        if(!response.ok)throw new Error('Transmission refusée (HTTP '+response.status+'). La sauvegarde du téléphone est conservée.');
      }
      const confirmed=await serverPiquets(await accessToken());
      if(!same(confirmed.piquets,saved.piquets))throw new Error('Réponse non confirmée par le serveur. Garde AGAI ouvert ; la sauvegarde locale est conservée.');
      show(saved.piquets.length+' piquets confirmés sur le serveur. Les autres responsables peuvent maintenant les voir. Tu peux actualiser AGAI.');
    }catch(error){show(String(error&&error.message||error));button.disabled=false;}
    finally{busy=false;}
  });
  start();
})();
