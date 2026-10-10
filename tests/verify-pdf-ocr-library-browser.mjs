/* Real PDF import, durable OCR cache and bookshelf UI; native recognition is a
   controlled bridge double, not an accuracy or battery benchmark. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {scanPdf} from './helpers/pdf-scan-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),engine=process.env.BROWSER==='webkit'?webkit:chromium;
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;let browser,lookups=0;
const profile=mkdtempSync(resolve(tmpdir(),'breeze-ocr-library-'));
try{
 // Match the persistent IndexedDB Blob environment used by the PDF import suite.
 browser=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});const context=browser;
 await context.addInitScript(()=>{
  localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
  window.qaLibraryOcr={calls:[],active:0,peak:0,auto:false};
  const bridge={recognize:()=>new Promise(resolve=>{
   const q=qaLibraryOcr;q.active++;q.peak=Math.max(q.peak,q.active);
   const row={resolve:()=>{q.active--;resolve({words:[{word:'Bright',line:0,x:.1,y:.12,w:.12,h:.03,confidence:.99}]});}};
   q.calls.push(row);if(q.auto)row.resolve();
  })};
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',isPluginAvailable:n=>n==='BreezePdfOcr',Plugins:{BreezePdfOcr:bridge}};
 });
 await context.route(/^https?:\/\//,route=>{
  const u=route.request().url();if(u.startsWith(url))return route.continue();
  if(/functions\/v1\/dict/.test(u)){const input=route.request().postDataJSON()||{};
   if(input.op==='warm')return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
   lookups++;
   return route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'word',canonical:'bright',lemma:'bright',members:[input.clickedIndex],ko:'밝은',left:10,lookupId:input.lookupId})});}
  return route.abort();
 });
 const page=await context.newPage();await page.goto(url);await page.evaluate(()=>homeReady);
 await page.waitForFunction(()=>document.getElementById('onboarding')?.hidden===true);
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,600,800);g.fillStyle='black';g.font='24px sans-serif';g.fillText('Bright world',60,116);return c.toDataURL('image/jpeg').split(',')[1];});
 await page.locator('#fileinput').setInputFiles({name:'수능 영어 스캔본.pdf',mimeType:'application/pdf',buffer:scanPdf(jpeg,{pages:80})});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'),null,{timeout:60000});
 await page.waitForFunction(()=>qaLibraryOcr.calls.length===1,null,{timeout:30000});
 for(let i=0;i<12;i++){
  await page.evaluate(i=>qaLibraryOcr.calls[i].resolve(),i);
  await page.waitForFunction(n=>qaLibraryOcr.calls.length===n,i+2);
 }
 assert.equal(lookups,0,'background recognition never sends meaning requests');
 const slot=page.locator('#v-home [data-ocr-book]').first();
 await page.waitForFunction(()=>document.querySelector('#v-home [data-ocr-book] span')?.textContent.includes('12/80쪽'));
 const proof='/tmp/breeze-ocr-library';mkdirSync(proof,{recursive:true});
 const heldAt=Date.now();
 for(const size of [{width:390,height:844},{width:820,height:1180},{width:1440,height:1000},{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(size);
  for(const dark of [false,true]){
   await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
   assert.equal(await page.locator('#onboarding').isVisible(),false,'onboarding must not cover the bookshelf');
   const rect=await slot.evaluate(n=>{const r=n.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {x:r.left,w:r.width,h:r.height,viewport:innerWidth,uncovered:!!top&&(n===top||n.contains(top))};});
   assert.ok(rect.uncovered,'OCR progress must be the visible topmost content');
   assert.ok(rect.w>0&&rect.h>0&&rect.x>=0&&rect.x+rect.w<=rect.viewport,JSON.stringify(rect));
   await page.screenshot({animations:'disabled',timeout:5000,path:`${proof}/${engine.name()}-${size.width}x${size.height}-${dark?'dark':'light'}.png`});
  }
 }
 assert.ok(Date.now()-heldAt<20000,'viewport capture must leave headroom before the real30s native deadline');
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForFunction(()=>originalSession?.wordBoxes.get(1)?.length===1);
 assert.equal(await page.evaluate(()=>qaLibraryOcr.calls.length),13,'reading prepared page reuses durable OCR');
 await page.evaluate(()=>show('home'));
 await page.evaluate(()=>{qaLibraryOcr.auto=true;qaLibraryOcr.calls[12].resolve();});
 await page.waitForFunction(()=>document.querySelector('#v-home [data-ocr-book]')?.hidden===true,null,{timeout:120000});
 assert.equal(await page.evaluate(()=>qaLibraryOcr.peak),1);
 assert.equal(await page.evaluate(()=>qaLibraryOcr.calls.length),80);
 assert.equal(lookups,0);
 await page.reload();await page.evaluate(()=>homeReady);
 await page.waitForFunction(()=>document.querySelector('#v-home [data-ocr-book]')?.hidden===true,null,{timeout:30000});
 assert.equal(await page.evaluate(()=>qaLibraryOcr.calls.length),0,'restart reuses all80 durable records');
 console.log('80-page bookshelf progress, nonblocking reading, one lane, cache/restart and viewport checks passed');
}finally{await browser?.close();rmSync(profile,{recursive:true,force:true});server.close();}
