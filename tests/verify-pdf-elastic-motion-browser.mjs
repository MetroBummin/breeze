/* Real browser compositor measurements, including deterministic direct-owner
   interruption probes. Chromium pinch input is trusted CDP; WebKit uses
   synthetic TouchEvents. Neither establishes physical WKWebView performance. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium,out=process.env.BREEZE_MOTION_OUTPUT||'/tmp/breeze-motion-proof';mkdirSync(out,{recursive:true});
const server=await serveStudyFixture(),profile=mkdtempSync(join(tmpdir(),'breeze-elastic-'));
const context=await engine.launchPersistentContext(profile,{executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,viewport:{width:820,height:1180},hasTouch:true,isMobile:true,serviceWorkers:'block',recordVideo:{dir:out,size:{width:820,height:1180}}});
try{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await prepareStudyPage(page,server.url);
 await page.locator('#fileinput').setInputFiles({name:'Elastic.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});await page.waitForSelector('.pdf-source-page canvas');await page.waitForTimeout(1000);
 const cdp=engine===chromium?await context.newCDPSession(page):null;
 const touch=async(type,distance=0,center={x:410,y:470})=>{
  const pts=distance?[{x:center.x-distance/2,y:center.y,id:1},{x:center.x+distance/2,y:center.y,id:2}]:[];
  if(cdp)return cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  await page.evaluate(({type,pts})=>{const target=document.querySelector('.pdf-source-page canvas'),points=pts.map(p=>({identifier:p.id,target,clientX:p.x,clientY:p.y,touchType:'direct'}));const event=new Event(type.toLowerCase(),{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:points},changedTouches:{value:points.length?points:window.qaTouches||[]}});target.dispatchEvent(event);window.qaTouches=points;},{type,pts});
 };
 await page.evaluate(()=>{setOriginalZoom(1);readerScroller().scrollTop=120;});
 await page.screenshot({path:`${out}/pinch-before.png`});await touch('touchStart',280);for(const d of [240,200,160,120,80]){await touch('touchMove',d);await page.waitForTimeout(20);}await page.screenshot({path:`${out}/pinch-under-min.png`});
 const under=await page.evaluate(()=>({committed:originalZoom(),visual:new DOMMatrix(getComputedStyle(originalZoomLayer()).transform).a,scroll:readerScroller().scrollTop,paper:originalPinch.paper,center:originalPinch.center}));assert.equal(under.committed,1);assert.ok(under.visual<.94&&under.visual>.85);
 await page.evaluate(()=>{window.qaFrames=[];const sample=()=>{const m=new DOMMatrix(getComputedStyle(originalZoomLayer()).transform);qaFrames.push({t:performance.now(),a:m.a,e:m.e,f:m.f,zoom:originalZoom(),scroll:readerScroller().scrollTop,busy:originalPinchBusy()});if(qaFrames.length<45)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 await touch('touchEnd');await page.waitForTimeout(100);await page.screenshot({path:`${out}/pinch-return.png`});await page.waitForFunction(()=>!originalPinchBusy());await page.screenshot({path:`${out}/pinch-settled.png`});const frames=await page.evaluate(()=>qaFrames);assert.equal(await page.evaluate(()=>originalZoom()),1);assert.ok(frames.some(f=>f.a>1&&f.a<1.01),'restrained overshoot');assert.ok(frames.every(f=>f.zoom===1),'return never changes logical zoom');assert.ok(Math.max(...frames.map(f=>f.scroll))-Math.min(...frames.map(f=>f.scroll))<=1,'return never scrolls');
 // Direct owner probes isolate matrix continuity with a different re-grab
 // midpoint, both under minimum and during the tiny overshoot.
 const regrabs=[];
 for(const phase of [45,270]){
  const result=await page.evaluate(async phase=>{
   cancelOriginalPinch();setOriginalZoom(1);readerScroller().scrollTop=120;
   const center={x:390,y:400};beginOriginalPinch(center,240,[101,102]);moveOriginalPinch(.35,center);previewOriginalPinch();finishOriginalPinch();originalPinchTouches=false;
   await new Promise(r=>setTimeout(r,phase));
   const old=originalPinchReturn,layer=originalZoomLayer(),matrix=()=>{const m=new DOMMatrix(getComputedStyle(layer).transform);return {a:m.a,e:m.e,f:m.f};};
   const before=matrix(),newCenter={x:465,y:550};beginOriginalPinch(newCenter,200,[103,104]);const after=matrix(),paper={...originalPinch.paper};
   await new Promise(r=>setTimeout(r,70));const held=matrix();
   moveOriginalPinch(originalPinch.level,newCenter);previewOriginalPinch();const same=matrix();
   old?.onfinish?.();const stale=!!originalPinch;
   cancelOriginalPinch();return {phase,before,after,held,same,paper,stale,zoom:originalZoom(),busy:originalPinchBusy()};
  },phase);regrabs.push(result);
  for(const key of ['a','e','f'])for(const name of ['after','held','same'])assert.ok(Math.abs(result.before[key]-result[name][key])<.015,`${phase} ${name} ${key}: ${JSON.stringify(result)}`);
  assert.equal(result.stale,true);assert.equal(result.zoom,1);assert.equal(result.busy,false);
 }
 // Interrupted returns and rapid repeated gestures have only one live owner.
 for(let i=0;i<5;i++){await touch('touchStart',220,{x:410,y:450});await touch('touchMove',90,{x:410,y:450});await touch(i%2?'touchCancel':'touchEnd');await page.waitForTimeout(25);}
 await page.waitForFunction(()=>!originalPinchBusy());assert.equal(await page.evaluate(()=>originalZoom()),1);
 // A genuine viewport change cancels a preview; subsequent input still works.
 await page.evaluate(async()=>{await restorePdfAnchor({kind:'pdf',page:2,y:.3},topInset(),++readerModeChangeToken);});await page.waitForTimeout(150);
 const rotationBefore=await page.evaluate(()=>capturePdfAnchor(topInset()));
 await touch('touchStart',200);await touch('touchMove',110);await page.setViewportSize({width:1180,height:820});await touch('touchCancel');await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>originalPinchBusy()),false);assert.equal(await page.evaluate(()=>originalZoom()),1);
 const rotationAfter=await page.evaluate(()=>({anchor:capturePdfAnchor(topInset()),height:pdfPageLayout().rects[1][3]}));
 assert.equal(rotationAfter.anchor.page,rotationBefore.page);assert.ok(Math.abs(rotationAfter.anchor.y-rotationBefore.y)*rotationAfter.height<=1.5,'rotation preserves source point within scroll rounding');
 await page.setViewportSize({width:820,height:1180});await page.waitForTimeout(500);
 const rotationRestored=await page.evaluate(()=>({anchor:capturePdfAnchor(topInset()),height:pdfPageLayout().rects[1][3]}));
 assert.equal(rotationRestored.anchor.page,rotationBefore.page);assert.ok(Math.abs(rotationRestored.anchor.y-rotationBefore.y)*rotationRestored.height<=1.5,'return rotation preserves source point');await page.emulateMedia({reducedMotion:'reduce'});await touch('touchStart',220);await touch('touchMove',80);await touch('touchEnd');assert.equal(await page.evaluate(()=>originalPinchReturn),null);assert.equal(await page.evaluate(()=>originalZoom()),1);
 await page.emulateMedia({reducedMotion:'no-preference'});
 // A new one-finger native scroll must release return presentation before ink
 // or lookup geometry is sampled. Controlled scroll isolates the same handler.
 const scroll=await page.evaluate(async()=>{beginOriginalPinch({x:410,y:400},220,[201,202]);moveOriginalPinch(.4,{x:410,y:400});previewOriginalPinch();finishOriginalPinch();originalPinchTouches=false;originalPdfContacts=1;readerScroller().scrollTop+=40;readerScroller().dispatchEvent(new Event('scroll'));const result={busy:originalPinchBusy(),zoom:originalZoom(),transform:originalZoomLayer().style.transform};originalPdfContacts=0;return result;});assert.equal(scroll.busy,false);assert.equal(scroll.zoom,1);
 assert.deepEqual(errors,[]);const videoPath=await page.video().path();await context.close();copyFileSync(videoPath,`${out}/pinch-${engine.name()}.webm`);
 writeFileSync(`${out}/pinch-motion.json`,JSON.stringify({engine:engine.name(),input:cdp?'trusted CDP touch + direct owner probes':'synthetic TouchEvents + direct owner probes',native:false,under,frames,regrabs,scroll,rotation:{before:rotationBefore,after:rotationAfter,restored:rotationRestored},checks:'soft clamp; spring/overshoot; fixed logical anchor; changed-midpoint re-grab; held preview; stale return completion; repeat/cancel; rotation; reduced motion; scroll interruption'},null,2));console.log(`${engine.name()} PDF elastic motion passed`);
}finally{await context.close();await server.close();rmSync(profile,{recursive:true,force:true});}
