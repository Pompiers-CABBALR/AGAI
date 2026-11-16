const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const marker=html.indexOf('// Le HTML peut s\'afficher');
assert.ok(marker>0,'le contrôle de chargement doit être intégré au HTML');
const start=html.lastIndexOf('<script>',marker)+8;
const end=html.indexOf('</script>',marker);
const guard=html.slice(start,end);
const required=['showT','rAstreintes','rAstrPlanning','rAstrDispo','rAstrPiquets','rAstrEquipes','toggleAdminRole','toggleSuperAdminRole'];

function setup(available){
  const listeners={};
  const elements={};
  const window={addEventListener(name,handler){(listeners[name]??=[]).push(handler);}};
  for(const name of available)window[name]=function(){};
  const document={
    baseURI:'https://example.test/AGAI/',readyState:'complete',
    body:{appendChild(element){elements[element.id]=element;}},
    getElementById(id){return elements[id]||null;},
    createElement(tag){return {tagName:tag.toUpperCase(),style:{},setAttribute(){},textContent:''};}
  };
  vm.runInNewContext(guard,{window,document,URL});
  return {window,document,listeners,elements};
}

test('une interface complète ne montre aucune alerte de chargement',()=>{
  const ctx=setup(required);
  ctx.listeners.load[0]();
  assert.equal(ctx.document.getElementById('agai-boot-error'),null);
  assert.deepEqual(Array.from(ctx.window.__agaiBootHealth.result.missing),[]);
});

test('un module Astreintes absent produit un diagnostic visible sans recharger',()=>{
  const ctx=setup(required.filter(name=>name!=='rAstreintes'));
  ctx.listeners.load[0]();
  const banner=ctx.document.getElementById('agai-boot-error');
  assert.ok(banner);
  assert.match(banner.textContent,/rAstreintes/);
  assert.match(banner.textContent,/ne fermez pas cet onglet/);
});

test('une erreur de module différé reste visible même si ses fonctions existent',()=>{
  const ctx=setup(required);
  ctx.listeners.error[0]({target:{tagName:'SCRIPT',src:'https://example.test/AGAI/modules/16-email-js.js?v=test'}});
  assert.match(ctx.document.getElementById('agai-boot-error').textContent,/16-email-js\.js/);
  assert.equal(ctx.window.__agaiBootHealth.result.failed.length,1);
});

test('une exception dans Astreintes remonte au lieu de laisser un onglet vide',()=>{
  const ctx=setup(required);
  ctx.listeners.error[0]({target:ctx.window,filename:'https://example.test/AGAI/modules/12-astreintes-js.js?v=test'});
  assert.match(ctx.document.getElementById('agai-boot-error').textContent,/erreur JavaScript/);
});
