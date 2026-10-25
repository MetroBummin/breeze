/* Synthetic PDF + delayed real worker transactions. No device/process-kill claim. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium} from './helpers/bounded-playwright.mjs';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=resolve(new URL('..',import.meta.url).pathname);
const server=createServer((req,res)=>{const p=resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
try{
 const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.breezeInkIPad=true;window.breezePdfStateDebug=true;});
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.goto(url);await page.locator('#fileinput').setInputFiles({name:'Synthetic-save-lifecycle.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
 const open=async()=>{
  await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
  await page.waitForSelector('[data-page="1"] .pdf-ink-layer');await page.waitForTimeout(500);
  await page.evaluate(()=>expandReaderChrome());if(await page.locator('[data-ink-toggle]').getAttribute('aria-pressed')!=='true')await page.locator('[data-ink-toggle]').click();
 };
 const saved=()=>page.waitForFunction(()=>document.querySelector('#pdf-ink-status [role=status]')?.textContent==='저장됨');
 const count=()=>page.locator('[data-page="1"] .pdf-ink-layer polyline').count();
 const stroke=()=>page.evaluate(()=>{
  const paper=originalSession.pages[0],target=paper.querySelector('canvas'),r=paper.getBoundingClientRect();
  const t={identifier:77,touchType:'stylus',target,clientX:r.left+r.width*.2,clientY:r.top+r.height*.2};
  const send=(type,live)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:live?[t]:[]},changedTouches:{value:[t]}});target.dispatchEvent(e);};
  send('touchstart',true);t.clientX+=50;send('touchmove',true);send('touchend',false);
 });
 await open();await stroke();await saved();assert.equal(await count(),1);
 let worker=page.workers().find(w=>w.url().includes('pdf-ink-store.js'));assert.ok(worker);
 await worker.evaluate(()=>{
  self.qaTransaction=IDBDatabase.prototype.transaction;self.qaDelay=300;
  IDBDatabase.prototype.transaction=function(...args){const tx=self.qaTransaction.apply(this,args);Object.defineProperty(tx,'oncomplete',{set(fn){tx.addEventListener('complete',e=>setTimeout(()=>fn(e),self.qaDelay));}});return tx;};
 });
 await stroke();assert.equal(await page.locator('#pdf-ink-status [role=status]').textContent(),'저장 중…');
 await page.evaluate(()=>show('home'));await open();assert.equal(await count(),2,'close/reopen retains pending edit');
 await stroke();assert.equal(await count(),3,JSON.stringify(await page.evaluate(()=>BreezePdfInk.diagnosticState())));await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 await saved();assert.equal(await count(),3);
 await page.reload();await open();assert.equal(await count(),3,'both writes survived reopen and background');
 worker=page.workers().find(w=>w.url().includes('pdf-ink-store.js'));
 await worker.evaluate(()=>{self.qaPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('synthetic quota','QuotaExceededError');};});
 await stroke();await page.waitForSelector('.ink-save-failed');await page.evaluate(()=>show('home'));await open();assert.equal(await count(),4,'failed edit remains in memory across close');
 await worker.evaluate(()=>{IDBObjectStore.prototype.put=self.qaPut;});await page.locator('.pdf-ink-retry').click();await saved();
 await page.reload();await open();assert.equal(await count(),4,'latest failed edit becomes durable after retry');
 // Old and new document owners waiting on the SAME read: the obsolete mount
 // must not evict the current owner's state or leave visible but uneditable ink.
 worker=page.workers().find(w=>w.url().includes('pdf-ink-store.js'));
 await worker.evaluate(()=>{self.qaTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=self.qaTransaction.apply(this,args);Object.defineProperty(tx,'oncomplete',{set(fn){tx.addEventListener('complete',e=>setTimeout(()=>fn(e),100));}});return tx;};});
 await page.evaluate(async()=>{
  const old=originalSession,base=(await old.pdf.getPage(1)).getViewport({scale:1});BreezePdfInk.release(old,1);
  const oldMount=BreezePdfInk.mount(old,1,base);BreezePdfInk.close(old);
  originalSession={...old};BreezePdfInk.open(originalSession);
  await Promise.all([oldMount,BreezePdfInk.mount(originalSession,1,base)]);
 });
 await page.evaluate(()=>expandReaderChrome());await page.locator('[data-ink-toggle]').click();await stroke();await saved();
 assert.equal(await count(),5,'new owner can edit after obsolete asynchronous mount');
 // Fault injection only: omit a native-route Touch terminal event, then prove
 // the old contact is absent with the next event's live Touch list.
 await page.evaluate(()=>{
  const target=originalSession.pages[0].querySelector('canvas'),r=target.getBoundingClientRect();
  const touch=(id,x)=>({identifier:id,touchType:'stylus',target,clientX:r.left+x,clientY:r.top+100});
  const send=(type,live,changed)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:live},changedTouches:{value:changed}});target.dispatchEvent(e);};
  const a=touch(901,50),b=touch(902,150);
  send('touchstart',[a],[a]);a.clientX+=40;send('touchmove',[a],[a]);
  send('touchstart',[b],[b]);b.clientX+=40;send('touchend',[],[b]);
 });
 await saved();assert.equal(await count(),6,'next live contact recovers without switching tools or timing out the old stroke');
 assert.equal(await page.evaluate(()=>BreezePdfInk.busy()),false);
 assert.deepEqual(errors,[]);
 console.log('PASS pending-write close/reopen/background, failed-write close/retry/reload, overlapping old/new mount ownership, fault-injected missing Touch end recovery');
}finally{await browser.close();server.close();}
