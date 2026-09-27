/* Pinch preview invariant under changing native offsets and missing terminal events.
   Offset injection models the race; it does not prove physical iPad causality. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html'};
const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
 const p=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!p.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}
 catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
try{
 for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  const profile=mkdtempSync(resolve(tmpdir(),'breeze-ink-'));
  const browser=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'});
  try{
   const context=browser;
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
   await page.addInitScript(debug=>{window.breezeInkIPad=true;window.breezeInkDebug=debug;
    window.qaInkTrace=[];window.webkit={messageHandlers:{
     breezeInkTrace:{postMessage:payload=>window.qaInkTrace.push(...payload.rows)},
     breezeInkScope:{postMessage:payload=>{window.qaInkScope=payload;}}}};
   },process.env.BREEZE_QA_INK_TRACE==='1');
   await page.goto(url);
   await page.locator('#fileinput').setInputFiles({name:'English-exam.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
   await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
   const open=async()=>{
    await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
    await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
    try{await page.waitForSelector('.pdf-source-page .pdf-ink-layer');}catch(e){console.log('LOAD',errors,await page.evaluate(()=>({flag:window.breezeInkIPad,session:originalSession&&{hash:originalSession.hash,settled:[...originalSession.settled]},status:document.getElementById('pdf-ink-tools')?.textContent,pages:document.querySelectorAll('.pdf-source-page').length})));throw e;}await page.waitForTimeout(600);
   };
   await open();

   const result=await page.evaluate(async()=>{
    setOriginalZoom(2.5);const box=readerScroller();box.scrollLeft=250;box.scrollTop=300;
    await new Promise(r=>setTimeout(r,50));
    const outer=box.getBoundingClientRect(),center={x:outer.left+box.clientWidth/2,y:outer.top+box.clientHeight/2};
    beginOriginalPinch(center,200,[71,72]);originalPinchTouches=true;
    moveOriginalPinch(2.7,center);previewOriginalPinch();
    const paper=originalPinch.paper;
    const measure=()=>{const rect=originalZoomLayer().getBoundingClientRect();return {x:rect.left+paper.x*2.7-center.x,y:rect.top+paper.y*2.7-center.y};};
    const before=measure();box.scrollLeft+=500;box.scrollTop+=400;
    const actual={x:box.scrollLeft,y:box.scrollTop};
    // Let the real scroll listener refresh the preview without a touchmove.
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const after=measure(),unchanged=box.scrollLeft===actual.x&&box.scrollTop===actual.y;
    const target=originalSession.pages[0].querySelector('canvas');
    const touch=id=>({identifier:id,touchType:'direct',target,clientX:center.x,clientY:center.y});
    const send=touches=>{
     const event=new Event('touchstart',{bubbles:true,cancelable:true});
     Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:[touches.at(-1)]}});
     target.dispatchEvent(event);
    };
    send([touch(71),touch(73)]);const retained=!!originalPinch;
    // Simulate losing both owners' terminal event, then a genuinely new finger.
    send([touch(81)]);
    const recovered={pinch:!!originalPinch,owned:originalPinchTouches,transform:originalZoomLayer().style.transform,
     contacts:originalPdfContacts,clipped:originalZoomStage().classList.contains('pinching')};
    cancelOriginalPinch();setOriginalZoom(1);
    return {before,after,unchanged,retained,recovered};
   });
   assert.ok(Math.abs(result.before.x)<1&&Math.abs(result.before.y)<1,JSON.stringify(result));
   assert.ok(Math.abs(result.after.x)<1&&Math.abs(result.after.y)<1,JSON.stringify(result));
   assert.equal(result.unchanged,true,'preview must not write scrolling');
   assert.equal(result.retained,true,'remaining original finger retains pinch ownership');
   assert.deepEqual(result.recovered,{pinch:false,owned:false,transform:'scale(2.5)',contacts:1,clipped:false});
   assert.deepEqual(errors,[]);console.log(JSON.stringify({engine:engine.name(),result}));
  }finally{await browser.close();rmSync(profile,{recursive:true,force:true});}
 }
}finally{server.close();}
