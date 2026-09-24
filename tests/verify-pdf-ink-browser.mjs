/* Real PDF.js / IndexedDB; synthetic WebKit stylus events are NOT device proof. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
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
   await page.waitForFunction(()=>window.qaInkScope?.enabled && window.qaInkScope.pages.length>0);
   assert.ok(await page.evaluate(()=>window.qaInkScope.scrollHeight>=readerScroller().clientHeight));
   await page.evaluate(()=>{
    window.qaLookup=0;const dispatch=dispatchWord;
    dispatchWord=(...args)=>{window.qaLookup++;return dispatch(...args);};
   });
   const count=()=>page.locator('.pdf-source-page[data-page="1"] .pdf-ink-layer polyline').count();
   const mode=async m=>{if(!await page.locator(`[data-ink-mode="${m}"]`).isVisible())await page.locator('[data-ink-toggle]').click();await page.locator(`[data-ink-mode="${m}"]`).click();};
   const stroke=async(points,{pageNumber=1,type='stylus',cancel=false,noncancel=false,palm=false}={})=>page.evaluate(({points,pageNumber,type,cancel,noncancel,palm})=>{
    const element=originalSession.pages[pageNumber-1],rect=element.getBoundingClientRect();
    const target=element.querySelector('canvas');
    const touch=(p,id=1,t=type)=>({identifier:id,target,clientX:rect.left+p[0]*rect.width,clientY:rect.top+p[1]*rect.height,touchType:t});
    const send=(name,touches,changed,cancelable=true)=>{
     const event=new Event(name,{bubbles:true,cancelable});
     Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:changed}});target.dispatchEvent(event);return event.defaultPrevented;
    };
    target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:type==='stylus'?'pen':'touch',isPrimary:true,clientX:rect.left+points[0][0]*rect.width,clientY:rect.top+points[0][1]*rect.height}));
    let pen=touch(points[0]);const prevented=send('touchstart',[pen],[pen]);
    if(palm)send('touchstart',[pen,touch([.8,.8],2,'direct')],[touch([.8,.8],2,'direct')]);
    for(const p of points.slice(1)){pen=touch(p);send('touchmove',[pen],[pen],!noncancel);}
    send(cancel?'touchcancel':'touchend',[],[pen]);
    target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:type==='stylus'?'pen':'touch',isPrimary:true}));
    target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
    return prevented;
   },{points,pageNumber,type,cancel,noncancel,palm});
   assert.equal(await page.locator('[data-ink-mode="pen"]').getAttribute('aria-pressed'),'true');
   await context.setOffline(true);
   assert.equal(await page.locator('[data-ink-mode="read"]').count(),0);
   assert.equal(await stroke([[.2,.2],[.3,.22],[.4,.2]],{palm:true}),true);
   await page.waitForFunction(()=>document.querySelector('#pdf-ink-tools [role=status]').textContent==='저장됨');
   assert.equal(await count(),1);
   const traceRoutes=await page.evaluate(()=>window.qaInkTrace.map(row=>row.route));
   if(process.env.BREEZE_QA_INK_TRACE==='1'){assert.ok(traceRoutes.includes('stroke/start'));assert.ok(traceRoutes.includes('dispatch/finished'));}
   else assert.equal(traceRoutes.length,0,'diagnostics disabled by default');
   const points=await page.locator('.pdf-ink-layer polyline').first().getAttribute('points');
   assert.equal(await page.evaluate(()=>window.qaLookup),0);
   assert.equal(await stroke([[.1,.3],[.2,.35]],{type:'direct'}),false);
   await page.evaluate(()=>{closePanel();window.qaLookup=0;});
   assert.equal(await count(),1);
   await stroke([[.1,.3],[.2,.35]],{cancel:true});assert.equal(await count(),1);
   await stroke([[.1,.3],[.2,.35]],{noncancel:true});assert.equal(await count(),1);
   assert.equal(await page.evaluate(()=>window.qaLookup),0);
   for(const zoom of [1,1.5,2.5,1]){
    await page.evaluate(z=>setOriginalZoom(z),zoom);
    assert.equal(await page.locator('.pdf-ink-layer polyline').first().getAttribute('points'),points);
    const delta=await page.evaluate(()=>{
     const p=originalSession.pages[0].getBoundingClientRect(),s=originalSession.pages[0].querySelector('svg.pdf-ink-layer').getBoundingClientRect();
     return Math.max(Math.abs(p.x-s.x),Math.abs(p.y-s.y),Math.abs(p.width-s.width),Math.abs(p.height-s.height));
    });assert.ok(delta<1,`alignment ${delta}`);
   }
   await page.setViewportSize({width:1180,height:820});
   assert.equal(await page.locator('.pdf-ink-layer polyline').first().getAttribute('points'),points);
   await page.evaluate(async()=>{releaseOriginalPdfPage(originalSession,1);await renderOriginalPdfPage(originalSession,1);});
   assert.equal(await count(),1);
   // Intrinsic rotated PDF page uses its own PDF.js viewport coordinates.
   await page.evaluate(async()=>{await renderOriginalPdfPage(originalSession,2);});
   await stroke([[.2,.2],[.3,.3]],{pageNumber:2});
   assert.equal(await page.locator('[data-page="2"] .pdf-ink-layer').getAttribute('viewBox'),'0 0 792 612');
   await page.waitForFunction(()=>document.querySelector('#pdf-ink-tools [role=status]').textContent==='저장됨');
   await context.setOffline(false);
   await page.reload();await open();assert.equal(await count(),1);
   assert.equal(await page.locator('[data-ink-mode="pen"]').getAttribute('aria-pressed'),'true');
   await mode('pen');assert.equal(await page.locator('[data-ink-undo]').isDisabled(),true);
   for(const c of ['#111111','#c43d3d','#2864c5'])for(const w of ['0.75','1.5','3']){
    await page.locator('[data-ink-setting="color"]').selectOption(c);
    await page.locator('[data-ink-setting="width"]').selectOption(w);
    await stroke([[.5,.5],[.51,.52],[.54,.49]]);
    const last=page.locator('[data-page="1"] .pdf-ink-layer polyline').last();
    assert.equal(await last.getAttribute('stroke'),c);assert.equal(await last.getAttribute('stroke-width'),w);
   }
   assert.equal(await count(),10);
   if(process.env.BREEZE_QA_OUTPUT){mkdirSync(process.env.BREEZE_QA_OUTPUT,{recursive:true});await page.screenshot({path:resolve(process.env.BREEZE_QA_OUTPUT,`ink-tools-${engine.name()}.png`)});}
   for(let i=0;i<9;i++)await page.locator('[data-ink-undo]').click();assert.equal(await count(),1);
   for(let i=0;i<9;i++)await page.locator('[data-ink-redo]').click();assert.equal(await count(),10);
   for(let i=0;i<9;i++)await page.locator('[data-ink-undo]').click();assert.equal(await count(),1);
   await stroke([[.6,.6],[.7,.6]]);assert.equal(await page.locator('[data-ink-redo]').isDisabled(),true);
   await page.locator('[data-ink-undo]').click();assert.equal(await count(),1);
   // History can edit a released page without keeping its SVG/canvas alive.
   await page.locator('[data-ink-redo]').click();assert.equal(await count(),2);
   await page.waitForFunction(()=>document.querySelector('#pdf-ink-tools [role=status]').textContent==='저장됨');
   await page.evaluate(()=>releaseOriginalPdfPage(originalSession,1));
   await page.locator('[data-ink-undo]').click();
   await page.waitForFunction(()=>document.querySelector('#pdf-ink-tools [role=status]').textContent==='저장됨');
   await page.evaluate(()=>renderOriginalPdfPage(originalSession,1));assert.equal(await count(),1);
   await page.locator('[data-ink-setting="color"]').selectOption('#111111');
   await page.locator('[data-ink-setting="width"]').selectOption('1.5');
   await mode('erase');await stroke([[.1,.2],[.5,.2]]);assert.equal(await count(),0);
   await page.locator('[data-ink-undo]').click();assert.equal(await count(),1);
   await page.locator('[data-ink-redo]').click();assert.equal(await count(),0);
   await page.waitForFunction(()=>document.querySelector('#pdf-ink-tools [role=status]').textContent==='저장됨');
   await page.reload();await open();assert.equal(await count(),0);
   // Failure retains latest ink, makes failure visible, and explicit retry persists it.
   await page.evaluate(()=>{window.qaPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='pages')throw new DOMException('test quota','QuotaExceededError');return window.qaPut.apply(this,args);};});
   await mode('pen');await stroke([[.2,.2],[.3,.22]]);await stroke([[.4,.4],[.5,.5]]);
   await page.waitForSelector('.ink-save-failed');assert.equal(await count(),2);
   await page.evaluate(()=>{IDBObjectStore.prototype.put=window.qaPut;});
   await page.locator('.pdf-ink-retry').click();
   await page.waitForFunction(()=>document.querySelector('#pdf-ink-tools [role=status]').textContent==='저장됨');
   await page.reload();await open();assert.equal(await count(),2);
   // Same title, different bytes: no annotations can leak across PDF hashes.
   await page.evaluate(async()=>{
    window.qaOriginal=originalSession.hash;
    const s=originalSession;BreezePdfInk.close(s);s.hash='different-file-same-title';BreezePdfInk.open(s);
    await BreezePdfInk.mount(s,1,(await s.pdf.getPage(1)).getViewport({scale:1}));
   });assert.equal(await count(),0);
   await page.evaluate(async()=>{const s=originalSession;BreezePdfInk.close(s);s.hash=window.qaOriginal;BreezePdfInk.open(s);await BreezePdfInk.mount(s,1,(await s.pdf.getPage(1)).getViewport({scale:1}));});
   assert.equal(await count(),2);
   // Default pen tool has no transparent blocker and still dispatches Lookup.
   const wordPoint=()=>page.evaluate(()=>{
    const element=originalSession.pages[0],rect=element.getBoundingClientRect();
    for(const b of originalSession.wordBoxes.get(1)){
     const x=rect.left+(b.x+b.w/2)*rect.width,y=rect.top+(b.y+b.h/2)*rect.height;
     if(y>100&&y<innerHeight-100&&x>40&&x<innerWidth-40&&pdfWordAtPoint(element,x,y)?.word===b.word)return{x,y};
    }
   });
   const word=await wordPoint();assert.ok(word);await page.touchscreen.tap(word.x,word.y);await page.waitForFunction(()=>wordPeekOpen());
   await page.evaluate(()=>closePanel());
   if(process.env.BREEZE_QA_OUTPUT){mkdirSync(process.env.BREEZE_QA_OUTPUT,{recursive:true});await page.screenshot({path:resolve(process.env.BREEZE_QA_OUTPUT,`ink-${engine.name()}.png`)});}
   await page.locator('[data-ink-toggle]').click();
   const collapsedCount=await count();await stroke([[.7,.7],[.75,.7]]);assert.equal(await count(),collapsedCount+1);
   await page.locator('[data-ink-toggle]').click();
   await page.evaluate(()=>{
    window.qaInputActions={word:0,sentence:0,requests:0};
    const dw=dispatchWord,os=openSentence,fetcher=window.fetch;
    dispatchWord=(...a)=>{window.qaInputActions.word++;return dw(...a);};
    openSentence=(...a)=>{window.qaInputActions.sentence++;return os(...a);};
    window.fetch=(...a)=>{if(!String(a[0]?.url||a[0]).startsWith(location.origin))window.qaInputActions.requests++;return fetcher(...a);};
   });
   // No mode switch: Pencil -> genuine finger Lookup -> Pencil, also in eraser.
   for(const tool of ['pen','erase']){
    await mode(tool);
    const before=await count();
    const actions=await page.evaluate(()=>({...window.qaInputActions}));
    await stroke([[.2,.2],[.3,.22]]);
    assert.deepEqual(await page.evaluate(()=>window.qaInputActions),actions,'Pencil must not dispatch Lookup or fetch');
    const edited=await count();
    await page.touchscreen.tap(word.x,word.y);await page.waitForFunction(()=>wordPeekOpen());
    assert.equal(await count(),edited,'finger Lookup edited ink');
    await page.evaluate(()=>closePanel());
    assert.equal(await page.locator(`[data-ink-mode="${tool}"]`).getAttribute('aria-pressed'),'true');
    await stroke([[.4,.4],[.5,.5]]);
    assert.ok(tool==='pen'?(await count())===before+2:(await count())<=before);
   }
   // Chromium browser-generated multitouch: native scroll and pinch in BOTH tools.
   if(engine===chromium){
    const cdp=await context.newCDPSession(page);
    await page.evaluate(()=>{window.qaTouchTrace=[];for(const type of ['touchstart','touchmove','touchend','touchcancel'])document.addEventListener(type,e=>qaTouchTrace.push({type,cancelable:e.cancelable,pan:originalPinchPan,pinch:!!originalPinch,points:Array.from(e.touches,t=>({id:t.identifier,type:t.touchType,target:originalPinchTarget(t.target)}))}),true);});
    for(const tool of ['pen','erase']){
     await mode(tool);await page.evaluate(()=>{closePanel();setOriginalZoom(1);readerScroller().scrollTop=0;});
     await page.waitForTimeout(100);
     const inkBefore=await count(),top=await page.evaluate(()=>readerScrollTop());
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:450,y:600}]});
     for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:450,y:600-i*20}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await page.waitForTimeout(1500); // Let Chromium native inertial scrolling finish before a new pinch.
     assert.ok(await page.evaluate(()=>readerScrollTop())>top,'native finger scroll');
     await page.evaluate(()=>{readerScroller().scrollTop=0;});await page.waitForTimeout(100);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:350,y:450},{id:2,x:550,y:450}]});
     for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:350-i*6,y:450},{id:2,x:550+i*6,y:450}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await page.waitForTimeout(100);
     const pinchState=await page.evaluate(()=>({zoom:originalZoom(),pan:originalPinchPan,owned:originalPinchTouches,contacts:originalPdfContacts,inkBusy:BreezePdfInk.busy(),target:document.elementFromPoint(450,450)?.outerHTML.slice(0,150),trace:window.qaTouchTrace.slice(-25),rect:originalSession.pages[0].getBoundingClientRect().toJSON()}));
     assert.ok(pinchState.zoom>1.3,`finger pinch with selected tool ${tool}: ${JSON.stringify(pinchState)}`);
     assert.equal(await count(),inkBefore,'scroll/pinch edited ink');
     await page.evaluate(()=>{setOriginalZoom(1);readerScroller().scrollTop=0;});
    }
    await cdp.detach();
   }
   // Existing sentence hold receives finger input while either Pencil tool is selected.
   for(const tool of ['pen','erase']){
    await mode(tool);const inkBefore=await count();
    const held=await page.evaluate(async({x,y})=>{
     const target=document.elementFromPoint(x,y),before=gestureSeq;
     target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:701,pointerType:'touch',isPrimary:true,clientX:x,clientY:y}));
     await new Promise(r=>setTimeout(r,800));
     const decision=lastGesture?.decision;
     target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:701,pointerType:'touch',isPrimary:true,clientX:x,clientY:y}));
     const debug={target:target?.tagName,active:activeGesture?.owner,last:lastGesture?.decision};
     closeSentence();closePanel();return{decision,expected:GESTURE_SENTENCE,newGesture:gestureSeq>before,debug};
    },await wordPoint());
    assert.equal(held.decision,held.expected,JSON.stringify(held));assert.ok(held.newGesture);assert.equal(await count(),inkBefore);
   }
   await mode('pen');
   const collision=await page.evaluate(()=>{
    const target=originalSession.pages[0].querySelector('canvas'),rect=target.getBoundingClientRect();
    const t=(id,type,x=.3)=>({identifier:id,touchType:type,target,clientX:rect.left+x*rect.width,clientY:rect.top+.3*rect.height});
    const send=(type,all,changed)=>{
     const e=new Event(type,{bubbles:true,cancelable:true});
     Object.defineProperties(e,{touches:{value:all},changedTouches:{value:changed}});target.dispatchEvent(e);return e.defaultPrevented;
    };
    const n=()=>originalSession.pages[0].querySelectorAll('.pdf-ink-layer polyline').length;
    const start=n(),pen=t(91,'stylus'),palm=t(92,'direct'),fresh=t(93,'direct');
    // Pencil first. Palm release must not finish the stroke or add a point.
    send('touchstart',[pen],[pen]);send('touchstart',[palm,pen],[palm]);
    send('touchend',[pen],[palm]);
    const during=BreezePdfInk.busy();send('touchmove',[t(91,'stylus',.4)],[t(91,'stylus',.4)]);
    send('touchend',[],[pen]);const after=n();
    // Palm remains after pen; new finger is eligible immediately, old palm isn't.
    send('touchstart',[pen],[pen]);send('touchstart',[pen,palm],[palm]);
    send('touchend',[palm],[pen]);
    const oldBlocked=!BreezePdfInk.finger(palm);
    const palmCount=n();
    send('touchstart',[palm,pen],[pen]);
    send('touchmove',[palm,t(91,'stylus',.45)],[t(91,'stylus',.45)]);
    send('touchend',[palm],[pen]);
    const palmDoesNotBlock=n()===palmCount+1;
    const freshAllowed=!send('touchstart',[palm,fresh],[fresh]) && BreezePdfInk.finger(fresh);
    send('touchend',[fresh],[palm]);send('touchend',[],[fresh]);
    const beforeLate=n();
    // Finger first: reject late pen, do not turn it into the second pinch finger.
    send('touchstart',[fresh],[fresh]);send('touchstart',[fresh,pen],[pen]);
    const noMixedPinch=!originalPinchBusy();
    send('touchmove',[fresh,t(91,'stylus',.8)],[t(91,'stylus',.8)]);
    send('touchend',[fresh],[pen]);send('touchend',[],[fresh]);
    send('touchstart',[fresh],[fresh]);send('touchstart',[fresh,pen],[pen]);
    send('touchend',[pen],[fresh]);
    send('touchmove',[t(91,'stylus',.7)],[t(91,'stylus',.7)]);
    send('touchend',[],[pen]);
    const lateUnchanged=n()===beforeLate;
    // A genuine finger pinch stays owned when a late Pencil arrives.
    const f1=t(101,'direct',.25),f2=t(102,'direct',.6);
    const zoom=originalZoom();send('touchstart',[f1],[f1]);send('touchstart',[f1,f2],[f2]);
    const acquired=originalPinchBusy();send('touchstart',[f1,pen,f2],[pen]);
    const survived=originalPinchBusy();
    send('touchmove',[t(101,'direct',.2),pen,t(102,'direct',.7)],[t(101,'direct',.2),t(102,'direct',.7)]);
    send('touchend',[f1,f2],[pen]);send('touchend',[],[f1,f2]);
    const zoomed=originalZoom()>zoom;
    setOriginalZoom(1);
    send('touchstart',[pen],[pen]);send('touchcancel',[],[pen]);
    const cancelled=!BreezePdfInk.busy();
    send('touchstart',[pen],[pen]);window.dispatchEvent(new Event('blur'));
    send('touchend',[],[pen]);const unlocked=!BreezePdfInk.busy();
    return{during,one:after===start+1,oldBlocked,palmDoesNotBlock,freshAllowed,noMixedPinch,lateUnchanged,acquired,survived,zoomed,cancelled,unlocked};
   });
   for(const [key,value] of Object.entries(collision))assert.equal(value,true,`collision: ${key}`);
   const finalWord=await wordPoint();assert.ok(finalWord);
   await page.touchscreen.tap(finalWord.x,finalWord.y);await page.waitForFunction(()=>wordPeekOpen());await page.evaluate(()=>closePanel());
   await page.evaluate(()=>{window.breezeInkIPad=false;document.body.classList.toggle('qa-platform');});
   await page.waitForFunction(()=>document.getElementById('pdf-ink-tools').hidden && window.qaInkScope?.enabled===false);
   assert.deepEqual(errors.filter(x=>!x.includes('ResizeObserver loop')),[]);
   console.log(`${engine.name()}: PASS 3 colors/3 widths, undo/redo including evicted pages and durable redo, black ink, stylus/finger separation (synthetic), no-mode-switch word/sentence Lookup, collision IDs, late Pencil during pinch, cancellations, zoom/resize/rotated page, release/reload, durable erase, failed save/retry, document isolation, platform gate`);
   await context.close();
  }finally{await browser.close();rmSync(profile,{recursive:true,force:true});}
 }
}finally{server.close();}
