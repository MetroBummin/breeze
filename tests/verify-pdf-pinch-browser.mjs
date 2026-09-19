/* Real PDF.js and browser layout. Chromium uses trusted CDP touch input;
   WebKit uses synthetic DOM touch events because Playwright exposes no multitouch driver.
   Run: npx playwright install chromium webkit && npm run test:pdf-pinch
   Optional: BREEZE_QA_PDF=/absolute/file.pdf to exercise a local source PDF. */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
function fixturePdf(count=120){
  const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids=[];
  for(let n=0;n<count;n++){
    const page=objects.length+1, stream=page+1; kids.push(`${page} 0 R`);
    const landscape=n%7===6;
    const lines=Array.from({length:26},(_,i)=>`1 0 0 1 50 ${landscape?560-i*18:740-i*24} Tm (Page ${n+1} line ${i+1}. Stable reading keeps every word in place.) Tj`).join('\n');
    const content=`BT /F1 13 Tf\n${lines}\nET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${landscape?'792 612':'612 792'}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]=`<< /Type /Pages /Count ${count} /Kids [${kids.join(' ')}] >>`;
  let pdf='%PDF-1.4\n', offsets=[0];
  for(let i=0;i<objects.length;i++){ offsets.push(pdf.length); pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('');
  pdf+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const pdf=process.env.BREEZE_QA_PDF?readFileSync(process.env.BREEZE_QA_PDF):fixturePdf();
const reports=[];
try{
 for(const [engine,width,height] of [[chromium,390,844],[chromium,768,1024],[chromium,1180,900],[webkit,390,844]].filter(([engine])=>!process.env.BREEZE_QA_ENGINE||engine.name()===process.env.BREEZE_QA_ENGINE)){
  const profile=mkdtempSync(resolve(tmpdir(),'breeze-pinch-'));
  const browser=await engine.launchPersistentContext(profile,{headless:true,viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block'});
  try{
   const page=await browser.newPage();
   const errors=[]; page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
   // Slow deferred pinch loading must not let ResizeObserver call it too early.
   await page.route('**/scripts/reader/pdf-pinch.js*',async route=>{await new Promise(resolve=>setTimeout(resolve,250));await route.continue();});
   await page.goto(url);
   await page.locator('#fileinput').setInputFiles({name:'pinch-regression.pdf',mimeType:'application/pdf',buffer:pdf});
   await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'),null,{timeout:120000});
   await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
   try{await page.waitForFunction(()=>originalSession?.settled.size>0);}catch(e){console.log('LOAD_FAILURE',errors,await page.evaluate(()=>({mode:currentReaderMode,session:originalSession&&{kind:originalSession.kind,rendering:[...originalSession.rendering.keys()]},text:document.getElementById('original-content').innerText})));throw e;}
   await page.waitForTimeout(500);
   await page.evaluate(()=>{window.qaWordActions=0;const dispatch=dispatchWord;dispatchWord=(...args)=>{window.qaWordActions++;return dispatch(...args)};window.qaScrollWrites=[];const d=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');Object.defineProperty(readerScroller(),'scrollTop',{get(){return d.get.call(this)},set(v){window.qaScrollWrites.push({v,stack:new Error().stack});d.set.call(this,v);}});window.qaEvents=[]; for(const type of ['touchstart','touchmove','touchend','touchcancel']) document.addEventListener(type,e=>window.qaEvents.push({type,ids:Array.from(e.touches).map(t=>t.identifier),owned:originalPinchTouches}),{capture:true});});
   const cdp=engine===chromium?await page.context().newCDPSession(page):null;
   let previousPoints=[];
   const touch=async(type,points)=>{
    if(cdp){
      const sent=type==='touchEnd'?previousPoints.filter(p=>!points.some(q=>q.id===p.id)):points;
      await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:sent});
      previousPoints=points;
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      return;
    }
    await page.evaluate(({type,points})=>{
      window.qaTouchTargets ||= {};
      const touches=points.map(p=>{
        const target=window.qaTouchTargets[p.id] ||= document.elementFromPoint(p.x,p.y);
        return {identifier:p.id,target,clientX:p.x,clientY:p.y,pageX:p.x,pageY:p.y};
      });
      const target=Object.values(window.qaTouchTargets)[0]||readerScroller();
      const event=new Event(type.toLowerCase(),{bubbles:true,cancelable:true});
      Object.defineProperties(event,{touches:{value:touches},targetTouches:{value:touches},changedTouches:{value:touches}});
      target.dispatchEvent(event);
      if(!points.length) window.qaTouchTargets={};
    },{type,points});
    await page.waitForTimeout(17);
   };
   const snapshot=()=>page.evaluate(()=>({
     zoom:originalZoom(),left:readerScroller().scrollLeft,top:readerScrollTop(),
     rect:originalZoomLayer().getBoundingClientRect().toJSON(),
     chrome:document.getElementById('readpill').getBoundingClientRect().toJSON(),
     chromeHidden:document.body.classList.contains('chrome-hidden'),
     busy:originalPinchBusy(),owned:originalPinchTouches,
     panel:wordPanelOpen(),sentence:sentenceModalOpen(),viewport:visualViewport.scale,wordActions:window.qaWordActions,
   }));
   const center={x:width/2,y:height*.48};
   const points=(spread,dx=0,dy=0)=>[{id:1,x:center.x-spread/2+dx,y:center.y+dy},{id:2,x:center.x+spread/2+dx,y:center.y+dy}];
   const pinch=async(from,to,{dx=0,dy=0,split=false,third=false,hold=false,delayed=false}={})=>{
     const before=await snapshot();
     if(delayed){await touch('touchStart',[points(from)[0]]);await page.waitForTimeout(400);}
     await touch('touchStart',points(from));
     for(let i=1;i<=10;i++) await touch('touchMove',points(from+(to-from)*i/10,dx*i/10,dy*i/10));
     await page.evaluate(()=>new Promise(requestAnimationFrame));
     const preview=await snapshot();
     assert.equal(preview.busy,true,'pinch did not acquire touch');
     if(preview.top!==before.top) console.log('SCROLL_DRIFT',{from,to,before,preview},await page.evaluate(()=>({pinch:originalPinch&&{top:originalPinch.top,position:originalPinch.position},writes:window.qaScrollWrites.slice(-5),events:window.qaEvents.slice(-15)})));
     assert.equal(preview.top,before.top,'preview changed native scrollTop');
     assert.equal(preview.left,before.left,'preview changed native scrollLeft');
     if(third){
       await touch('touchStart',[...points(to,dx,dy),{id:3,x:width-30,y:30}]);
       await touch('touchEnd',[points(to,dx,dy)[0],{id:3,x:width-30,y:30}]);
       await touch('touchEnd',[{id:3,x:width-30,y:30}]);
       await touch('touchEnd',[]);
     }else if(split){
       await touch('touchEnd',[points(to,dx,dy)[0]]);
       const partial=await snapshot();
       assert.equal(partial.owned,true);
       if(hold) await page.waitForTimeout(900);
       await touch('touchMove',[{...points(to,dx,dy)[0],y:center.y+dy+20}]);
       await touch('touchEnd',[]);
     }else await touch('touchEnd',[]);
     const after=await snapshot();
     assert.ok(Math.abs(after.zoom-Math.max(1,Math.min(4,before.zoom*to/from)))<.002);
     assert.ok(Math.abs(preview.rect.top-after.rect.top)<1.2,'release jumped vertically');
     assert.ok(Math.abs(preview.rect.left-after.rect.left)<1.2,'release jumped horizontally');
     if(after.busy||after.owned) console.log('UNRELEASED',await page.evaluate(()=>window.qaEvents.slice(-18)));
     assert.equal(after.busy,false);assert.equal(after.owned,false);
     assert.equal(after.panel,before.panel,'pinch changed the dictionary panel state');
     assert.equal(after.sentence,before.sentence,'pinch changed the sentence state');
     assert.equal(after.wordActions,before.wordActions,'pinch also dispatched a word tap');
     assert.equal(after.chromeHidden,before.chromeHidden,'pinch changed toolbar state');
     assert.equal(after.viewport,1,'browser viewport zoomed');
     return after;
   };
   // Repeat complete in/out cycles; moving midpoint and staggered release are real input.
   for(let i=0;i<12;i++){
     await pinch(90,225,{dx:15,dy:-12,split:i%2===0,third:i===3,hold:i===0,delayed:i===1});
     await pinch(225,90,{dx:-10,dy:15,split:i%2===1});
   }
   await pinch(50,300); // upper clamp
   assert.equal((await snapshot()).zoom,4);
   await pinch(100,100,{dx:25,dy:30}); // two-finger pan at max zoom
   await pinch(300,40); // lower clamp
   assert.equal((await snapshot()).zoom,1);
   // Cancellation releases preview and the next gesture still works.
   await touch('touchStart',points(90));await touch('touchMove',points(180));
   await touch('touchCancel',[]);
   assert.equal((await snapshot()).owned,false);
   await pinch(180,90);
   // Native one-finger scroll still works after repeated pinches (Chromium only).
   if(cdp){
     const before=await snapshot();
     await touch('touchStart',[{id:1,x:center.x,y:600}]);
     for(let y=580;y>=260;y-=20) await touch('touchMove',[{id:1,x:center.x,y}]);
     await touch('touchEnd',[]);await page.waitForTimeout(350);
     assert.ok((await snapshot()).top>before.top+100,'native one-finger scroll is stuck');
   }
   if(cdp){
     const before=await snapshot();
     const one={id:1,x:center.x-50,y:550},two={id:2,x:center.x+50,y:450};
     await touch('touchStart',[one]);
     for(let y=530;y>=450;y-=20) await touch('touchMove',[{...one,y}]);
     await touch('touchStart',[{...one,y:450},two]);
     await touch('touchMove',[{...one,x:one.x-30,y:420},{...two,x:two.x+30,y:420}]);
     await page.waitForTimeout(800);await touch('touchEnd',[]);
     const after=await snapshot();
     assert.equal(after.zoom,before.zoom,'late second finger stole a native scroll');
     assert.equal(after.wordActions,before.wordActions);assert.equal(after.sentence,false);
     await page.waitForTimeout(300);
   }
   // Deep page, including landscape pages, exercises lazy rendering and large offsets.
   await page.evaluate(async()=>{
     resetOriginalZoom();
     const n=Math.min(70,originalSession.pages.length);
     await restorePdfAnchor({page:n,y:.25},100);
   });
   await page.waitForTimeout(300);
   await pinch(90,180,{dx:10,dy:-15});await pinch(180,90);
   await pinch(90,225);
   // Real scaled word hit testing remains exact, followed by a genuine tap.
   const word=await page.evaluate(()=>{
     for(const el of originalSession.pages){
       const r=el.getBoundingClientRect();
       for(const w of originalSession.wordBoxes.get(+el.dataset.page)||[]){
         const x=r.left+(w.x+w.w/2)*r.width,y=r.top+(w.y+w.h/2)*r.height;
         if(x>40&&x<innerWidth-40&&y>130&&y<innerHeight-80){
           if(pdfWordAtPoint(el,x,y)?.word!==w.word) continue;
           return {x,y};
         }
       }
     }
   });
   assert.ok(word,'visible PDF has no working word map');
   const tapsBefore=(await snapshot()).wordActions;
   await page.touchscreen.tap(word.x,word.y);
   await page.waitForFunction(()=>wordPanelOpen());
   assert.equal((await snapshot()).wordActions,tapsBefore+1,'tap was dispatched more than once');
   if(width>=1000){
     const panelAnchor=await page.evaluate(()=>{
       const anchor=readerPanelSession&&readerPanelSession.anchor;
       if(!anchor) return null;
       return {...anchor,source:{...anchor.source}};
     });
     assert.ok(panelAnchor,'side-panel pinch stress lost its source anchor');
     await pinch(100,140,{dx:8,dy:-10,split:true});
     await pinch(140,100,{dx:-6,dy:8});
     await pinch(100,125,{dx:5,dy:-4,split:true});
     assert.equal((await snapshot()).panel,true,'side panel closed during pinch stress');
     await page.locator('#p-close').click();
     await page.waitForTimeout(200);
     const afterY=await page.evaluate(anchor=>{
       const page=originalSession.pages[anchor.source.page-1],rect=page.getBoundingClientRect();
       return rect.top+anchor.source.y*rect.height;
     },panelAnchor);
     assert.ok(Math.abs(afterY-panelAnchor.screenY)<3,
       `side-panel pinch close drifted ${afterY-panelAnchor.screenY}px`);
   }else{
     await page.evaluate(()=>closePanel());await page.waitForTimeout(400);
   }
   // A fresh long press after a pinch must still open exactly the sentence modal.
   if(cdp){
     await touch('touchStart',[{id:1,...word}]);
     await page.waitForTimeout(900);
     assert.equal((await snapshot()).sentence,true,'fresh long press was swallowed');
     assert.equal((await snapshot()).panel,false,'long press also opened a word');
     assert.equal((await snapshot()).wordActions,tapsBefore+1);
     await touch('touchEnd',[]);
     await page.evaluate(()=>closeSentence());await page.waitForTimeout(300);
   }
   // Aa is intentionally hidden in the compact toolbar; expand the title
   // pill first, then let Aa own the next touch.
   if(await page.evaluate(()=>document.body.classList.contains('chrome-hidden')))
     await page.locator('#readpill-title').click();
   await page.locator('#aafab').click();
   const blockedZoom=(await snapshot()).zoom;
   await touch('touchStart',points(90));await touch('touchMove',points(180));await touch('touchEnd',[]);
   assert.equal((await snapshot()).zoom,blockedZoom);
   await page.evaluate(()=>closeAa());
   assert.equal(await page.locator('#pdfzoom-out,#pdfzoom-in,#aa-pdfzoom').count(),3);
   await page.evaluate(async()=>{resetOriginalZoom();await restorePdfAnchor({page:1,y:.3},100);});
   await page.waitForTimeout(300);
   await pinch(100,132);
   if(await page.evaluate(()=>document.body.classList.contains('chrome-hidden')))
     await page.locator('#readpill-title').click();
   await page.locator('#aafab').click();
   assert.equal(await page.locator('#aa-pdfzoom-pct').textContent(),'132%');
   await page.locator('#pdfzoom-in').click();
   assert.ok(Math.abs((await snapshot()).zoom-1.82)<.002);
   assert.equal(await page.locator('#aa-pdfzoom-pct').textContent(),'182%');
   await page.locator('#pdfzoom-out').click();
   assert.ok(Math.abs((await snapshot()).zoom-1.32)<.002);
   await page.evaluate(()=>closeAa());
   await pinch(100,150);
   assert.ok(Math.abs((await snapshot()).zoom-1.98)<.002);
   assert.equal(await page.locator('#aa-pdfzoom-pct').textContent(),'198%');
   // Mode change and viewport resize during a gesture clean up all state.
   await touch('touchStart',points(90));await touch('touchMove',points(180));
   await page.evaluate(()=>switchReaderMode('text'));await touch('touchEnd',[]);
   assert.equal((await snapshot()).zoom,1);assert.equal((await snapshot()).busy,false);
   await page.evaluate(()=>switchReaderMode('original'));await page.waitForTimeout(250);
   await touch('touchStart',points(90));await touch('touchMove',points(160));
   await page.setViewportSize({width:width+50,height});await page.waitForTimeout(100);
   await touch('touchEnd',[]);assert.equal((await snapshot()).busy,false);
   await page.setViewportSize({width,height});await page.waitForTimeout(150);
   await pinch(90,180);await pinch(180,90);
   assert.deepEqual(errors,[]);
   const report={engine:engine.name(),width,height,cycles:12,pages:await page.evaluate(()=>originalSession.pages.length),touch:cdp?'trusted CDP':'synthetic DOM touch events',result:'passed'};
   reports.push(report);console.log(JSON.stringify(report));
  }finally{await browser.close();rmSync(profile,{recursive:true,force:true});}
 }
 console.log('PDF pinch browser regressions passed:',JSON.stringify(reports));
}finally{server.close();}
