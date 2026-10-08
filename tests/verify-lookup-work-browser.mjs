import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage({viewport:{width:768,height:1024},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
  await page.route('**/scripts/main.js*',r=>r.fulfill({contentType:'text/javascript',body:
   'window.auditHomeRenders=0;const auditHome=renderHome;renderHome=(...args)=>{auditHomeRenders++;return auditHome(...args);};\n'+readFileSync(resolve(root,'scripts/main.js'),'utf8')}));
  await page.goto(url);await page.evaluate(()=>homeReady);
  assert.equal(await page.evaluate(()=>!!onboardingSession),true);
  assert.equal(await page.evaluate(()=>auditHomeRenders),0,'startup built hidden Home');
  await page.evaluate(()=>endOnboarding(true));
  assert.equal(await page.evaluate(()=>activeAppView()),'home');
  assert.ok(await page.evaluate(()=>auditHomeRenders>0));
  await page.evaluate(()=>{
   words=Object.fromEntries(Array.from({length:2100},(_,i)=>['word'+i,{word:'word'+i,ko:'뜻 '+i,status:1,addedAt:2100-i,book:'Fixture',example:'Example '+i}]));
   show('vocab');window.auditRows=[...document.querySelectorAll('.vgroup')];
   window.auditVocabRenders=0;const render=renderVocab;
   renderVocab=(...args)=>{auditVocabRenders++;return render(...args);};
   window.auditBeforeUnrelated=localStorage.getItem('breeze.word-item.word1');
  });
  const first=page.locator('.vword').first();
  await first.click();assert.equal(await first.getAttribute('aria-expanded'),'true');
  await first.press('Enter');assert.equal(await first.getAttribute('aria-expanded'),'false');
  await first.press('Space');assert.equal(await first.getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>auditVocabRenders),0,'row toggle rebuilt the list');
  assert.equal(await page.evaluate(()=>auditRows.every((row,i)=>row===document.querySelectorAll('.vgroup')[i])),true,'row identities changed');
  await page.locator('.vgroup.open .vko').fill('수정한 뜻');await page.locator('#vsearch').focus();
  assert.equal(await page.evaluate(()=>words.word0.ko),'수정한 뜻');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('breeze.word-item.word0')).ko),'수정한 뜻');
  assert.equal(await page.evaluate(()=>localStorage.getItem('breeze.word-item.word1')===auditBeforeUnrelated),true,'edit rewrote unrelated word');
  await page.locator('.vgroup.open .rowdel').click();
  assert.equal(await page.evaluate(()=>!!words.word0),false);assert.equal(await page.locator('.vgroup').count(),2099);
  assert.deepEqual(errors,[]);
  console.log(engine.name()+': empty-session visible-only boot; 2100-word mouse/keyboard row identity, edit persistence and deletion passed');
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
