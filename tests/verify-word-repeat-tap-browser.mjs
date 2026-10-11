/* Real source lookup entry points and UI; provider and OCR boxes are fixtures.
   This does not certify native OCR accuracy or physical-device touch behavior. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
let context;
try{
 context=await engine.launchPersistentContext('',{headless:true,viewport:{width:820,height:1180},serviceWorkers:'block'});
 for(const format of ['text','epub','pdf','ocr']){
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 const pdf=format==='pdf'||format==='ocr';
 await page.locator('#fileinput').setInputFiles(pdf
  ?{name:'retap.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture(['A patient reader meets another patient reader.'])}
  :{name:'retap.txt',mimeType:'text/plain',buffer:Buffer.from('A patient reader meets another patient reader.\n\n'+'A quiet reader reads.\n\n'.repeat(30))});
 await page.waitForFunction(kind=>books.some(b=>b.kind===kind),pdf?'pdf':'txt');
 await page.evaluate(async pdf=>{await openBook(books.find(b=>b.kind===(pdf?'pdf':'txt')));if(pdf)await switchReaderMode('original');},pdf);
 await page.waitForFunction(pdf=>pdf?originalSession?.wordBoxes.get(1)?.length&&!readerPositionPending():document.querySelectorAll('#rtext .w').length>10,pdf);
 await page.evaluate(async format=>{
  window.qaFormat=format;window.qaRequests=[];
  sb={auth:{getSession:async()=>({data:{session:null}})}};sbUser={id:'qa-retap'};
  dictGet=async()=>null;dictPut=async()=>{};fillDictionaryMetadata=async()=>{};
  // Deliberately deliver even after abort: stale completions must not reopen UI.
  dictCall=(payload,signal)=>new Promise(resolve=>qaRequests.push({payload,signal,resolve}));
  if(format==='epub'){
   const frame=document.createElement('iframe');frame.id='retap-epub';frame.style.cssText='position:fixed;left:30px;top:120px;width:280px;height:160px;border:0;z-index:5';
   document.body.append(frame);await new Promise(done=>{frame.onload=done;frame.srcdoc='<p style="font:20px/2 Georgia">A patient reader meets another patient reader.</p>';});
   window.qaDoc=frame.contentDocument;window.qaBlock=qaDoc.querySelector('p');
  }
  if(format==='ocr'){
   // OCR and text-layer boxes intentionally share openPdfWord and source identity.
   const boxes=originalSession.wordBoxes.get(1);
   originalSession.wordBoxes.set(1,boxes.map(b=>({...b,source:'ocr'})));
  }
  window.qaTap=(which=0)=>{
   if(qaFormat==='text'){
    const nodes=[...document.querySelectorAll('#rtext .w')].filter(n=>n.textContent==='patient');
    openWord(keyOf('patient'),nodes[which]);
   }else if(qaFormat==='epub'){
    const text=qaBlock.firstChild,start=which?text.textContent.lastIndexOf('patient'):text.textContent.indexOf('patient');
    const range=qaDoc.createRange();range.setStart(text,start);range.setEnd(text,start+7);
    openOriginalRange(qaDoc,range,'patient',qaBlock,range.getBoundingClientRect());
   }else{
    const boxes=originalSession.wordBoxes.get(1).filter(b=>b.word==='patient');
    openPdfWord(originalSession.pages[0],boxes[which]);
   }
  };
  window.qaReset=phase=>{
   closePanel();words={};dead={};recentWordOpens.clear();
   if(phase==='saved')words.patient={word:'patient',clicked:'patient',forms:['patient'],ko:'참을성 있는',defs:[],example:'A patient reader meets another patient reader.',status:1,addedAt:1,up:1};
   qaTap();window.qaLife=wordLookupLife;
  };
  window.qaResolve=index=>{const r=qaRequests[index];r.resolve({kind:'word',canonical:'patient',members:[r.payload.clickedIndex],ko:'참을성 있는'});};
  window.qaClosed=()=>!wordLookupOpen()&&selKey===null&&!wordLookupAlive(qaLife)&&document.getElementById('word-peek').hidden&&
   !document.querySelector('.breeze-lookup-pending,.original-selection-marker')&&
   !(window.qaDoc?.querySelector('.breeze-lookup-pending,.original-selection-marker'));
 },format);
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
  if(pdf)await page.waitForFunction(()=>!readerPositionPending());
  for(const phase of ['pending','ready','saved','error']){
   const count=await page.evaluate(()=>qaRequests.length);
   await page.evaluate(phase=>qaReset(phase),phase);
   if(phase!=='saved')await page.waitForFunction(n=>qaRequests.length===n+1,count);
   if(phase==='ready'){
    await page.evaluate(index=>qaResolve(index),count);
    await page.waitForFunction(()=>!wordPeekPending()&&!document.getElementById('word-peek').hidden);
   }
   if(phase==='error'){
    await page.evaluate(index=>qaRequests[index].resolve({error:'lookup_failed',httpStatus:400}),count);
    await page.waitForFunction(()=>!wordPeekPending()&&!document.getElementById('word-peek').hidden);
   }
   if(phase==='saved')assert.equal(await page.evaluate(()=>wordPeekPending()),false,'saved meaning unexpectedly waited');
   const before=await page.evaluate(()=>({count:qaRequests.length,scroll:readerScrollTop(),data:JSON.stringify(words.patient)}));
   await page.evaluate(()=>qaTap());
   assert.equal(await page.evaluate(()=>qaClosed()),true,`${format} ${phase} ${width} ${dark}`);
   if(phase!=='saved')assert.equal(await page.evaluate(index=>qaRequests[index].signal.aborted,count),true);
   if(phase==='pending')await page.evaluate(index=>qaResolve(index),count);
   await page.waitForTimeout(320);
   assert.equal(await page.evaluate(()=>qaClosed()),true,'delayed result resurrected lookup');
   assert.equal(await page.evaluate(()=>qaRequests.length),before.count,'repeat tap requested another lookup');
   assert.equal(await page.evaluate(()=>readerScrollTop()),before.scroll,'cancellation moved the reader');
   if(phase==='saved'||phase==='ready')assert.equal(await page.evaluate(()=>JSON.stringify(words.patient)),before.data,'cancel mutated saved meaning');
  }
 }
 // Same spelling at another location must replace the pending request and stay open.
 const count=await page.evaluate(()=>qaRequests.length);
 await page.evaluate(()=>qaReset('pending'));await page.waitForFunction(n=>qaRequests.length===n+1,count);
 await page.evaluate(()=>qaTap(1));await page.waitForFunction(n=>qaRequests.length===n+2,count);
 assert.equal(await page.evaluate(()=>wordLookupOpen()),true);
 assert.equal(await page.evaluate(index=>qaRequests[index].signal.aborted,count),true);
 await page.evaluate(index=>{qaResolve(index);qaResolve(index+1);},count);
 await page.waitForFunction(()=>!wordPeekPending()&&!document.getElementById('word-peek').hidden);
 // Exercise the real pointer/click owner on Text: one physical click closes,
 // its compatibility click must not reopen; another click opens anew.
 if(format==='text'){
  await page.setViewportSize({width:820,height:1180});await page.evaluate(()=>{closePanel();readerScrollTo(0);});
  const node=page.locator('#rtext .w').filter({hasText:/^patient$/}).first();
  await node.click();await page.waitForFunction(()=>wordLookupOpen());
  await node.click();assert.equal(await page.evaluate(()=>wordLookupOpen()),false);
  await node.click();await page.waitForFunction(()=>wordLookupOpen());
  const blank=await node.evaluate(n=>{const r=n.closest('p').getBoundingClientRect();return {x:r.right-2,y:r.top+r.height/2};});
  await page.mouse.click(blank.x,blank.y);assert.equal(await page.evaluate(()=>wordLookupOpen()),false,'blank tap no longer dismisses');
 }
 assert.deepEqual(errors,[],format+' page errors');
 console.log(engine.name(),format,'repeat tap: pending, ready, saved, error, identity, late completion, themes/viewports passed');
 await page.close();
 }
}finally{await context?.close();await new Promise(r=>server.close(r));}
