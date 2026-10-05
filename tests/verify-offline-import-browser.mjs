import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=process.env.BREEZE_IMPORT_ROOT||fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_IMPORT_PROOF||'/tmp/breeze-offline-import-proof';mkdirSync(proof,{recursive:true});
let nextGeneration=false;
const server=createServer((req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(resolve(root)+'/'))throw Error();
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(nextGeneration&&path.endsWith('/sw.js')?readFileSync(path,'utf8').replace(/const VERSION = '[a-f0-9]{8}'/,"const VERSION = 'a18a18a1'"):readFileSync(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const epubFile={name:'QA Alice.epub',mimeType:'application/epub+zip',buffer:readFileSync(resolve(root,'assets/classics/alice-in-wonderland.epub'))};
// Playwright's worker enumeration/lifecycle automation is Chromium-only:
// https://playwright.dev/docs/api/class-browsercontext#browser-context-service-workers
// Keep WebKit's real IndexedDB/import/cover matrix in verify-import-commit-browser.
console.log('NOT RUN WebKit cold-offline shell/worker lifecycle: unsupported Playwright service-worker automation; WebKit import/cover tests remain enabled.');
try{for(const engine of [chromium].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
 try{for(const controlled of [false,true]){
 nextGeneration=false;
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
 await context.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 const page=await context.newPage();page.setDefaultTimeout(20000);
 try{await page.goto(url);await page.evaluate(()=>homeReady);

  console.log('OFFLINE phase: install shell');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  if(controlled){await page.reload();await page.evaluate(()=>homeReady);}
  const firstControlled=await page.evaluate(()=>!!navigator.serviceWorker.controller);
  await page.locator('#fileinput').setInputFiles({name:'Offline.txt',mimeType:'text/plain',buffer:Buffer.from(('An offline reader keeps the local text.\n\n').repeat(100))});
  await page.waitForFunction(()=>books.some(b=>b.title==='Offline'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.title==='Offline'));});await page.waitForTimeout(300);
  await page.evaluate(()=>{readerScrollTo(1200);saveReadingState();show('home');});
  await page.locator('#fileinput').setInputFiles(epubFile);await page.waitForFunction(()=>books.some(b=>b.kind==='epub'));
  console.log('OFFLINE phase: epub original online');
  const epubOnline=await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='epub'));await switchReaderMode('original');const loaded=originalSession?.kind;show('home');return loaded;});
  const {fixturePdf}=await import('./helpers/pdf-scroll-fixture.mjs');
  await page.locator('#fileinput').setInputFiles({name:'Offline.pdf',mimeType:'application/pdf',buffer:fixturePdf(4)});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  console.log('OFFLINE phase: pdf original online');
  const pdfOnline=await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');const loaded=originalSession?.kind;show('home');return loaded;});
  await page.waitForTimeout(500);const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(LS_POS)));
  const cacheRuntimeLibs=await page.evaluate(async()=>{const all=[];for(const name of await caches.keys()){const cache=await caches.open(name);for(const request of await cache.keys())if(new URL(request.url).pathname.includes('/assets/lib/'))all.push(new URL(request.url).pathname);}return all;});
  await page.close();await context.setOffline(true);const cold=await context.newPage();cold.setDefaultTimeout(20000);await cold.goto(url);await cold.evaluate(()=>homeReady);
  console.log('OFFLINE phase: cold shell loaded');
  const result=[];
  for(const kind of ['txt','epub','pdf']){
   console.log('OFFLINE phase: cold '+kind);
   await cold.evaluate(async kind=>{show('home');releaseRetainedReader();await openBook(books.find(b=>b.kind===kind));if(kind!=='txt')await switchReaderMode('original');},kind);
   if(kind==='epub')await cold.waitForFunction(()=>document.querySelector('.original-empty')||originalSession?.frames.some(f=>f.contentDocument?.body?.textContent.trim()));
   if(kind==='pdf')await cold.waitForFunction(()=>document.querySelector('.original-empty')||document.querySelector('.pdf-source-page canvas'));
   result.push(await cold.evaluate(async kind=>({kind,view:activeAppView(),mode:currentReaderMode,session:originalSession?.kind||null,textTop:readerScrollTop(),progress:visibleReaderProgress(),error:document.querySelector('.original-empty')?.textContent||null,durableOriginalBytes:(await originalGet(curBook.id))?.blob?.size||null}),kind));
   await cold.screenshot({path:proof+'/'+engine.name()+'-'+controlled+'-offline-'+kind+'.png',fullPage:true});
  }
  const observations={firstControlled,epubOnline,pdfOnline,cacheRuntimeLibs,saved,result};
  writeFileSync(proof+'/'+engine.name()+'-'+controlled+'.json',JSON.stringify(observations,null,2));
  assert.equal(firstControlled,controlled);assert.equal(epubOnline,'epub');assert.equal(pdfOnline,'pdf');
  for(const item of result){assert.equal(item.error,null,JSON.stringify(item));if(item.kind!=='txt'){assert.equal(item.session,item.kind);assert.ok(item.durableOriginalBytes>0);}else assert.ok(item.progress>0);}
  assert.equal(await cold.evaluate(()=>!!navigator.serviceWorker.controller),true);
 if(!controlled){
  await context.setOffline(false);
  const before=await cold.evaluate(()=>{window.offlineController=navigator.serviceWorker.controller;return {id:curBook.id,mode:currentReaderMode};});
  nextGeneration=true;
  await cold.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();});
  await cold.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.deepEqual(await cold.evaluate(()=>({id:curBook.id,mode:currentReaderMode})),before,'waiting shell must not interrupt current Reader');
  const ownership=await cold.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {waiting:!!r.waiting,same:navigator.serviceWorker.controller===window.offlineController,state:navigator.serviceWorker.controller?.state,old:window.offlineController?.state};});
  assert.equal(ownership.same,true);assert.equal(ownership.state,'activated');
  await cold.close();
  let active=false;
  for(let i=0;i<100&&!active;i++){
   for(const worker of context.serviceWorkers()){
    active=await worker.evaluate(()=>VERSION==='a18a18a1'&&!self.registration.waiting&&self.registration.active?.state==='activated').catch(()=>false);
    if(active)break;
   }
   if(!active)await new Promise(r=>setTimeout(r,50));
  }
  assert.equal(active,true,'new generation activates only after old document closes');
  await context.setOffline(true);const updated=await context.newPage();await updated.goto(url);await updated.evaluate(()=>homeReady);
  for(const kind of ['epub','pdf']){
   await updated.evaluate(async kind=>{show('home');releaseRetainedReader();await openBook(books.find(b=>b.kind===kind));await switchReaderMode('original');},kind);
   assert.equal(await updated.evaluate(()=>originalSession?.kind),kind,'runtime library survives shell generation change');
   assert.equal(await updated.locator('.original-empty').count(),0);
  }
 }
 console.log(engine.name()+': offline imported TXT/EPUB/PDF passed; initially controlled='+controlled);
 }finally{await context.close();}
 }}finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
