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
 await open('ocr-fixture.pdf',pdfCropFixture({ocr:true}));
 const ocr=await page.evaluate(()=>{
  const paper=originalSession.pages[0],box=originalSession.wordBoxes.get(1).find(b=>b.word==='Visible'),r=paper.getBoundingClientRect();
  return box&&pdfWordAtPoint(paper,r.left+(box.x+box.w/2)*r.width,r.top+(box.y+box.h/2)*r.height)?.word;
 });
 assert.equal(ocr,'Visible','invisible OCR text inside the crop remains selectable');
 let supplied=null;
 if(process.env.BREEZE_QA_PDF){
  await page.evaluate(()=>show('home'));await open('supplied-29-39.pdf',readFileSync(process.env.BREEZE_QA_PDF));
  supplied=await page.evaluate(async()=>{
   const session=originalSession;
   if(session.hash!=='d76805f846feb32cae9458588f6fcd90bf3255a2b254a2e820c66f4c9f660153')throw Error('Expected the supplied 13-page regression PDF');
   const inspect=async n=>{const paper=session.pages[n-1],scroll=readerScroller();scroll.scrollTop+=paper.getBoundingClientRect().top-scroll.getBoundingClientRect().top;await renderOriginalPdfPage(session,n);return {paper,boxes:session.wordBoxes.get(n)};};
   const p9=await inspect(9),r=p9.paper.getBoundingClientRect();
   const hit=pdfWordAtPoint(p9.paper,r.left+91/595*r.width,r.top+515/842*r.height)?.word;
   const higher=p9.boxes.filter(b=>b.word==='higher').map(b=>b.y);
   const p13=await inspect(13),bewildered=p13.boxes.filter(b=>b.word==='bewildered').length;
   const p4=await inspect(4),choice135=p4.boxes.find(b=>b.word==='Metal')?.example||'';
   const p5=await inspect(5),choice157=p5.boxes.find(b=>b.word==='unparalleled')?.example||'';
   return {hit,higher,bewildered,choice135,choice157};
  });
  assert.equal(supplied.hit,'perceptible');assert.equal(supplied.higher.length,1);
  assert.ok(supplied.higher[0]<.4,'only the genuinely visible higher remains');
  assert.equal(supplied.bewildered,0);
  assert.ok(supplied.choice135.includes('Metal foils')&&!supplied.choice135.includes('What makes paper'));
  // #2 remains explicitly excluded. Record its real source reproduction; this
  // is not an acceptance assertion that the unpunctuated choices are fixed.
 }
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
   peak=Math.max(peak,pixels*4);
   samples.push({page:n,bytes:pixels*4,settled:session.settled.size,targetAttached:target.isConnected,shown:!!paper.querySelector('canvas')?.width});
   if(pixels*4>450*1024*1024)break;
  }}finally{send('touchend',false);running=false;}
  return {peak,samples,contacts:originalPdfContacts};
 });
 if(!baseline){assert.equal(memory.samples.length,15);assert.ok(memory.samples.every(s=>s.targetAttached&&s.shown));assert.equal(memory.contacts,0);assert.ok(memory.peak<=110*1024*1024,`canvas peak ${memory.peak}`);}
 assert.deepEqual(errors,[]);const report={engine:engine.name(),baseline,crop,ocr,supplied,memory};reports.push(report);console.log(JSON.stringify(report));
 }finally{await context.close();rmSync(profile,{recursive:true,force:true});}
}}finally{server.close();}
if(process.env.BREEZE_QA_REPORT)writeFileSync(process.env.BREEZE_QA_REPORT,JSON.stringify(reports,null,2));
