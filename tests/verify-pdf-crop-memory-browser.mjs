/* Cropped source fidelity + held-scrollbar page jumps. Browser, not iPad proof. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {pdfCropFixture} from './helpers/pdf-crop-fixture.mjs';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=process.env.BREEZE_QA_ROOT||resolve(new URL('..',import.meta.url).pathname),baseline=!!process.env.BREEZE_QA_BASELINE,reports=[];
const server=createServer((req,res)=>{const p=resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const profile=mkdtempSync(resolve(tmpdir(),'breeze-crop-memory-'));
 const context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:820,height:1180},deviceScaleFactor:2,hasTouch:true,serviceWorkers:'block'});
 try{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1','done');window.breezeInkIPad=true;});
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.goto(url);
 const open=async(name,buffer)=>{
  const oldIds=await page.evaluate(()=>books.map(b=>b.id));
  await page.locator('#fileinput').setInputFiles({name,mimeType:'application/pdf',buffer});
  await page.waitForFunction(ids=>books.some(b=>b.kind==='pdf'&&!ids.includes(b.id)),oldIds,{timeout:120000});
  await page.evaluate(async ids=>{await openBook(books.find(b=>b.kind==='pdf'&&!ids.includes(b.id)));await switchReaderMode('original');},oldIds);
  await page.waitForFunction(()=>originalSession?.wordBoxes.get(1)?.length>0,null,{timeout:60000});
 };
 await open('crop-fixture.pdf',pdfCropFixture());
 const crop=await page.evaluate(()=>{
  const boxes=originalSession.wordBoxes.get(1),paper=originalSession.pages[0],r=paper.getBoundingClientRect();
  words={};for(const word of ['foreignblank','adults','consists','Visible'])words[keyOf(word)]={word,status:1,mark:true};refreshPdfSavedWords(originalSession);
  return {words:boxes.map(b=>b.word),sentences:boxes.map(b=>b.example),markers:[...paper.querySelectorAll('.original-saved-marker')].map(m=>m.textContent),blank:pdfWordAtPoint(paper,r.left+115/612*r.width,r.top+145/792*r.height)?.word||null};
 });
 if(!baseline){assert.deepEqual(crop.words,['Visible','source','belongs','here']);assert.deepEqual(crop.markers,['Visible']);assert.equal(crop.blank,null);assert.ok(crop.sentences.every(s=>!s.includes('foreignblank')&&!s.includes('previous')));}
 await page.evaluate(()=>show('home'));
 await open('memory-120.pdf',fixturePdf());
 const memory=await page.evaluate(async()=>{
  const session=originalSession,scroller=readerScroller(),target=session.pages[0].querySelector('canvas');
  const touch={identifier:37,touchType:'direct',target,clientX:200,clientY:200};
  const send=(type,live)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:live?[touch]:[]},changedTouches:{value:[touch]}});target.dispatchEvent(e);};
  let peak=0,running=true;const measure=()=>{let pixels=0;document.querySelectorAll('.pdf-source-page canvas').forEach(c=>pixels+=c.width*c.height);peak=Math.max(peak,pixels*4);if(running)requestAnimationFrame(measure);};measure();
  send('touchstart',true);const samples=[];
  try{for(const n of [1,6,12,20,30,40,50,60,50,40,30,20,12,6,1]){
   const paper=session.pages[n-1];scroller.scrollTop+=paper.getBoundingClientRect().top-scroller.getBoundingClientRect().top;
   await renderOriginalPdfPage(session,n);await new Promise(r=>setTimeout(r,30));
   const pixels=[...document.querySelectorAll('.pdf-source-page canvas')].reduce((sum,c)=>sum+c.width*c.height,0);
   samples.push({page:n,bytes:pixels*4,settled:session.settled.size,targetAttached:target.isConnected,shown:!!paper.querySelector('canvas')?.width});
   if(pixels*4>450*1024*1024)break;
  }}finally{send('touchend',false);running=false;}
  return {peak,samples,contacts:originalPdfContacts};
 });
 if(!baseline){assert.equal(memory.samples.length,15);assert.ok(memory.samples.every(s=>s.targetAttached&&s.shown));assert.equal(memory.contacts,0);assert.ok(memory.peak<=110*1024*1024,`canvas peak ${memory.peak}`);}
 assert.deepEqual(errors,[]);const report={engine:engine.name(),baseline,crop,memory};reports.push(report);console.log(JSON.stringify(report));
 }finally{await context.close();rmSync(profile,{recursive:true,force:true});}
}}finally{server.close();}
if(process.env.BREEZE_QA_REPORT)writeFileSync(process.env.BREEZE_QA_REPORT,JSON.stringify(reports,null,2));
