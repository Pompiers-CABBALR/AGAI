const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const candidates=process.platform==='win32'
  ?[process.env.AGAI_BROWSER_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
  :[process.env.AGAI_BROWSER_PATH,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
const browser=candidates.find(candidate=>candidate&&fs.existsSync(candidate));

const smokeScript=`<script>
window.addEventListener('load',function(){
  const errors=[];
  const health=window.__agaiBootHealth&&window.__agaiBootHealth.check();
  if(!health||health.failed.length||health.missing.length)errors.push('modules:'+JSON.stringify(health));
  try{
    window._adminRoleDisabled=true;
    toggleAdminRole();
    if(window._adminRoleDisabled!==false)errors.push('admin-inactif');
    toggleAdminRole();
    window._superAdminDisabled=true;
    toggleSuperAdminRole();
    if(window._superAdminDisabled!==false)errors.push('superadmin-inactif');
    toggleSuperAdminRole();
  }catch(error){errors.push('pouvoirs:'+String(error&&error.message||error));}
  try{
    showAstrTab('planning',document.getElementById('astr-btn-planning'));
    if(document.getElementById('astr-planning').style.display==='none')errors.push('planning-masque');
  }catch(error){errors.push('astreintes:'+String(error&&error.message||error));}
  document.body.setAttribute('data-agai-smoke',errors.length?'FAIL':'PASS');
  document.body.setAttribute('data-agai-smoke-details',errors.join(' | '));
});
</script>`;

function runChrome(url,profile){
  return new Promise((resolve,reject)=>{
    const args=['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--no-sandbox','--user-data-dir='+profile,'--dump-dom',url];
    const child=spawn(browser,args,{windowsHide:true});
    let stdout='',stderr='';
    const timer=setTimeout(()=>{child.kill();reject(new Error('Le navigateur n’a pas terminé en 25 secondes.'));},25000);
    child.stdout.on('data',chunk=>{stdout+=chunk;});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{
      clearTimeout(timer);
      if(code!==0)return reject(new Error('Chrome a quitté avec le code '+code+': '+stderr.slice(-700)));
      resolve(stdout);
    });
  });
}

test('le navigateur charge Astreintes et active les pouvoirs A/SA', {timeout:35000}, async()=>{
  assert.ok(browser,'Chrome/Chromium est requis pour ce test navigateur.');
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname==='/runtime-config.js'){
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
      res.end('window.AGAI_CONFIG=Object.freeze({supabaseUrl:"http://127.0.0.1:1",supabasePublishableKey:"smoke",personnelOnlineGateEnabled:false});');
      return;
    }
    const file=pathname==='/smoke'?path.join(root,'index.html'):path.resolve(root,'.'+pathname);
    if(file!==path.join(root,'index.html')&&!file.startsWith(root+path.sep)){
      res.writeHead(403);res.end();return;
    }
    try{
      let body=fs.readFileSync(file);
      if(pathname==='/smoke')body=Buffer.from(body.toString().replace('</body>',smokeScript+'</body>'));
      const ext=path.extname(file);
      res.writeHead(200,{'Content-Type':ext==='.js'?'text/javascript; charset=utf-8':ext==='.css'?'text/css; charset=utf-8':ext==='.json'?'application/json; charset=utf-8':'text/html; charset=utf-8'});
      res.end(body);
    }catch(_error){res.writeHead(404);res.end();}
  });
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'agai-browser-smoke-'));
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/smoke';
    const html=await runChrome(url,profile);
    const result=html.match(/data-agai-smoke="([^"]+)"/);
    const details=html.match(/data-agai-smoke-details="([^"]*)"/);
    assert.equal(result&&result[1],'PASS',details&&details[1]||'Aucun résultat du test navigateur.');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(profile,{recursive:true,force:true});
  }
});
