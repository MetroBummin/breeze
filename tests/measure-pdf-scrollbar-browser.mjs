/* No DOM finger events: models a native scrollbar's jump stream, not UIKit. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=process.env.BREEZE_QA_ROOT||resolve(new URL('..',import.meta.url).pathname),reports=[];
const server=createServer((req,res)=>{const p=resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const profile=mkdtempSync(resolve(tmpdir(),'breeze-scrollbar-')),context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:820,height:1180},deviceScaleFactor:2,hasTouch:true,serviceWorkers:'block'});
 try{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.goto(url);await page.locator('#fileinput').setInputFiles({name:'scrollbar.pdf',mimeType:'application/pdf',buffer:process.env.BREEZE_QA_PDF?readFileSync(process.env.BREEZE_QA_PDF):fixturePdf()});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'),null,{timeout:120000});
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForFunction(()=>originalSession?.wordBoxes.get(1)?.length>0);
 const report=await page.evaluate(async()=>{
  const rows=[],frames=[],writes=[],box=readerScroller(),session=originalSession;
  for(const name of ['pdfOperatorEntries','pdfPageWords','renderPdfSavedWordMarkers','layoutOriginalZoom']){
   const fn=window[name];window[name]=function(...args){const t=performance.now(),busy=t-(session.lastScrollAt||0)<160;const value=fn(...args);rows.push({name,busy,ms:performance.now()-t});return value;};
  }
  const move=readerScrollTo;readerScrollTo=function(y){writes.push(y);return move(y);};
  const samples=[];
  for(const direction of ['down','up']){
   const start=rows.length;let last=performance.now();
   for(let i=0;i<90;i++){
    const ratio=direction==='down'?i/89:1-i/89;box.scrollTop=(box.scrollHeight-box.clientHeight)*ratio;
    await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-last);last=now;
   }
   samples.push({direction,heavyDuringScroll:rows.slice(start).filter(r=>r.busy),settled:session.settled.size});
  }
  await new Promise(r=>setTimeout(r,1000));
  return {samples,frames:{max:Math.max(...frames),over50:frames.filter(x=>x>50).length},programmaticWrites:writes.length,allCosts:rows,visibleReady:pdfPagesInView(session).every(n=>!!session.pages[n-1].querySelector('canvas')?.width),lookupReady:pdfPagesInView(session).every(n=>session.wordBoxes.has(n))};
 });reports.push({engine:engine.name(),...report,errors});console.log(JSON.stringify(reports.at(-1)));
 }finally{await context.close();rmSync(profile,{recursive:true,force:true});}
}}finally{server.close();}
if(process.env.BREEZE_QA_REPORT)writeFileSync(process.env.BREEZE_QA_REPORT,JSON.stringify(reports,null,2));
for(const report of reports){
 assert.deepEqual(report.errors,[]);assert.equal(report.visibleReady,true);assert.equal(report.lookupReady,true);
 assert.equal(report.programmaticWrites,0,'the uniform-page jump stream must not be pulled back by app scroll writes');
 if(!process.env.BREEZE_QA_BASELINE)for(const sample of report.samples)
  assert.equal(sample.heavyDuringScroll.length,0,`${report.engine} ${sample.direction}: automatic maps/markers/layout must wait for quiet`);
}

