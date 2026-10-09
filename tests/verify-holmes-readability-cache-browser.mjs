/* A real previous-main shell upgrades only after its Reader closes, then the new
   paragraph presentation opens cold offline with the same five IDB books/anchors.
   WebKit service-worker lifecycle automation is unsupported by Playwright. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),baseline=process.env.BREEZE_HOLMES_BASELINE;
if(!baseline){console.log('SKIP previous-main cache migration: set BREEZE_HOLMES_BASELINE to a clean e7b61d5 checkout (whole-story offline tests run separately).');process.exit(0);}
let next=false;
const server=createServer((req,res)=>{
 const base=next?root:baseline,path=resolve(base,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(base))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp'})[extname(path)]||'text/plain; charset=utf-8');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();
try{
 const context=await browser.newContext({serviceWorkers:'allow',viewport:{width:390,height:844}}),page=await context.newPage();
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);await page.evaluate(async()=>navigator.serviceWorker.ready);
 await page.reload();await page.evaluate(()=>homeReady);assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true);
 const audit=JSON.parse(readFileSync(resolve(root,'docs/content/holmes-readability/boundaries.json'))),saved=[];
 for(const slug of Object.keys(audit)){
  const pi=audit[slug].at(-1).pi;
  saved.push(await page.evaluate(async({slug,pi})=>{
   const read=LONG_READS.find(r=>r.id==='sherlock-holmes-'+slug),book=await importLongRead(read);
   await openBook(book);await Promise.all(HOLMES_ILLUSTRATIONS[read.id].map(image=>fetch(image.file)));show('home');
   positions[book.id]={p:pi/(book.paras.length-1),pi,y:0,mode:'text',t:Date.now()};save(LS_POS,positions);
   return{id:book.id,pi,paras:book.paras,fingerprint:book.fingerprint,cover:book.cover};
  },{slug,pi}));
 }
 await page.evaluate(async id=>{await openBook(books.find(b=>b.id===id));window.oldController=navigator.serviceWorker.controller;},saved.at(-1).id);
 next=true;
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();});
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller===window.oldController),true);
 assert.equal(await page.evaluate(()=>typeof holmesParagraphParts),'undefined','active old Reader keeps its original code generation');
 await page.close();
 const version=readFileSync(resolve(root,'sw.js'),'utf8').match(/const VERSION = '([^']+)'/)[1];
 let active=false;
 for(let i=0;i<200&&!active;i++){
  for(const worker of context.serviceWorkers())active=await worker.evaluate(async version=>{const cache=await caches.open('breeze-'+version),html=await cache.match('index.html');return VERSION===version&&!self.registration.installing&&!self.registration.waiting&&self.registration.active?.state==='activated'&&!!(await cache.match('__shell_complete__'))&&!!html&&(await html.text()).includes('holmes-layout');},version).catch(()=>false)||active;
  if(!active)await new Promise(r=>setTimeout(r,50));
 }
 assert.ok(active,'new complete shell activates after old client closes');
 await context.setOffline(true);const cold=await context.newPage();await cold.goto(url);await cold.evaluate(()=>homeReady);

 assert.equal(await cold.evaluate(()=>typeof holmesParagraphParts),'function','new presentation module is in cold-offline shell');
 for(const book of saved){
  await cold.evaluate(async id=>openBook(books.find(b=>b.id===id)),book.id);await cold.waitForFunction(()=>!readerPositionPending());
  assert.deepEqual(await cold.evaluate(()=>curBook.paras),book.paras);assert.equal(await cold.evaluate(()=>curBook.fingerprint),book.fingerprint);assert.equal(await cold.evaluate(()=>curBook.cover),book.cover);
  assert.ok(Math.abs(await cold.evaluate(()=>captureAnchor().pi)-book.pi)<=1);
  assert.ok(await cold.locator(`#rtext [data-pi="${book.pi}"] > .holmes-paragraph-part`).count()>1);
  await cold.evaluate(()=>show('home'));
 }
 console.log('chromium: real e7b61d5 -> current shell migration, old active Reader retained, new module cold offline, all five unchanged books/covers/fingerprints and late anchors passed');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
