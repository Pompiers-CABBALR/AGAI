const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const bundle=process.env.AGAI_TEST_BUNDLE==='1';
const read=p=>fs.readFileSync(path.join(__dirname,'..',bundle?'app.js':p),'utf8');
function between(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function scheduler(){
  let stored={token:'session',login:'chef.test',expiresAt:Date.now()+3600000},calls=0,willRestore=false;
  const jobs=new Map(),handlers={},events=[];let sequence=0;
  const c=vm.createContext({CU:null,PERSONNEL_ONLINE_GATE:true,navigator:{onLine:true},
    document:{hidden:false,documentElement:{classList:{remove(){}}},addEventListener:(name,fn)=>{handlers['doc:'+name]=fn;}},
    window:{addEventListener:(name,fn)=>{handlers['win:'+name]=fn;}},
    _readStoredSession:()=>stored,_restoreSessionAfterLoad:async()=>{calls++;if(willRestore)c.CU={l:stored.login};return willRestore;},
    setTimeout:(fn,ms)=>{const id=++sequence;jobs.set(id,{fn,ms});return id;},clearTimeout:id=>jobs.delete(id),console:{warn:(...x)=>events.push(x)},
  });
  vm.runInContext(between(read('modules/17-animal-js.js'),'let _agaiSessionRestorePromise=null;','function _postLoadInit(){'),c);
  const fire=async()=>{const [id,job]=jobs.entries().next().value;jobs.delete(id);job.fn();await vm.runInContext('_agaiSessionRestorePromise',c);};
  return {c,jobs,handlers,events,fire,calls:()=>calls,restoreNext:()=>willRestore=true,clear:()=>stored=null,expire:()=>stored.expiresAt=Date.now()-1};
}
test('une panne de réseau momentanée réessaie automatiquement puis rouvre la session existante',async()=>{
  const h=scheduler();await h.c._agaiQueueSessionRestore();assert.equal(h.calls(),1);assert.equal(h.jobs.values().next().value.ms,1000);
  h.restoreNext();await h.fire();assert.equal(h.calls(),2);assert.equal(h.c.CU.l,'chef.test');assert.equal(h.jobs.size,0);
});
test('les reprises pageshow et déverrouillage ne déclenchent pas de vérifications concurrentes',async()=>{
  const h=scheduler();let finish;h.c._restoreSessionAfterLoad=()=>new Promise(resolve=>{finish=resolve;});
  const pending=h.c._agaiQueueSessionRestore();await Promise.resolve();h.handlers['doc:visibilitychange']();h.handlers['win:pageshow']();
  finish(false);await pending;assert.equal(h.jobs.size,1);
});
test('refus, déconnexion explicite ou délai de session dépassé empêchent la reprise automatique',async()=>{
  for(const action of ['clear','expire']){const h=scheduler();await h.c._agaiQueueSessionRestore();h[action]();await h.fire();assert.equal(h.calls(),1);assert.equal(h.jobs.size,0);}
});
test('les réessais attendent le premier plan et le retour du réseau',async()=>{
  const h=scheduler();h.c.document.hidden=true;await h.c._agaiQueueSessionRestore();assert.equal(h.jobs.size,0);
  h.c.document.hidden=false;h.c.navigator.onLine=false;assert.equal(h.c._agaiCanRetrySessionRestore(),false);
  h.c.navigator.onLine=true;h.restoreNext();h.handlers['win:online']();await vm.runInContext('_agaiSessionRestorePromise',h.c);
  assert.equal(h.c.CU.l,'chef.test');
});
test('la temporisation des réessais augmente puis reste plafonnée et peut être annulée',async()=>{
  const h=scheduler();await h.c._agaiQueueSessionRestore();
  for(const ms of [1000,3000,5000,10000,30000,30000]){assert.equal(h.jobs.values().next().value.ms,ms);await h.fire();}
  h.c._agaiStopSessionRestoreRetry();assert.equal(h.jobs.size,0);
});
function background(){
  let now=1000000;class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const jobs=[],handlers={},events=[];
  const c=vm.createContext({Date:Clock,CU:{l:'chef.test'},SESSION_TOKEN:'session',ASTR_CONFIG:{bgLogoutMin:40},
    document:{hidden:false,addEventListener:(name,fn)=>handlers[name]=fn},
    setTimeout:(fn,ms)=>{jobs.push({fn,ms});return jobs.length;},clearTimeout(){},
    _persistSessionState(){},isSessionValid:()=>true,doLogout:()=>{events.push('logout');c.CU=null;},
  });
  vm.runInContext(between(read('modules/07-appel-js.js'),'let _bgTimer=null,_bgHiddenAt=0;','function _touchSessionActivity(){'),c);
  return {c,jobs,events,advance:ms=>now+=ms,visibility:hidden=>{c.document.hidden=hidden;handlers.visibilitychange();}};
}
test('un ancien minuteur déjà en file ne déconnecte pas après un retour rapide au premier plan',()=>{
  const h=background();h.visibility(true);const old=h.jobs[0];h.advance(5000);h.visibility(false);old.fn();assert.equal(h.events.length,0);
  h.visibility(true);h.advance(60000);old.fn();assert.equal(h.events.length,0);
});
test('un nouveau passage caché ne prolonge pas le délai et une absence de 40 minutes reste bloquante',()=>{
  const h=background();h.visibility(true);h.advance(5*60000);h.visibility(true);assert.equal(h.jobs[1].ms,35*60000);
  h.advance(35*60000);h.visibility(false);assert.deepEqual(h.events,['logout']);
});
function expiryTimer(){
  let now=1000000;class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const jobs=[],events=[];
  const c=vm.createContext({Date:Clock,SESSION_TOKEN:'session',SESSION_EXPIRY:now+3600000,_sessionTimer:null,_sessionWarnTimer:null,
    setTimeout:(fn,ms)=>{jobs.push({fn,ms});return jobs.length;},clearTimeout(){},showToast:()=>events.push('toast'),doLogout:()=>events.push('logout')});
  vm.runInContext(between(read('modules/03-security-js.js'),'function _armSessionTimers(){','function _createSession(){'),c);
  c._armSessionTimers();return {c,jobs,events,advance:ms=>now+=ms};
}
test('un ancien minuteur d’expiration ne ferme pas une nouvelle session',()=>{
  const h=expiryTimer(),expire=h.jobs[1];expire.fn();assert.equal(h.events.length,0);
  h.advance(3600000);expire.fn();const logout=h.jobs.at(-1);h.c.SESSION_TOKEN='nouvelle-session';h.c.SESSION_EXPIRY+=3600000;
  logout.fn();assert.equal(h.events.includes('logout'),false);
});
test('une expiration réelle reste appliquée sans prolonger la durée autorisée',()=>{
  const h=expiryTimer();h.advance(3600000);h.jobs[1].fn();h.advance(2000);h.jobs.at(-1).fn();
  assert.ok(h.events.includes('logout'));
});
