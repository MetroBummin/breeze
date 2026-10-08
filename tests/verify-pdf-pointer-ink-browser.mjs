/* Real PDF.js and IndexedDB with synthetic Pointer/Touch input. This is not
   Android hardware palm-rejection, latency or native inertia acceptance. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_POINTER_INK_PROOF||'/tmp/breeze-pdf-pointer-ink';
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
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 await page.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.goto(url);
 assert.equal(await page.evaluate(()=>Reflect.get(window,'breezeInkIPad')),undefined,'no native flag injected');
 await page.locator('#fileinput').setInputFiles({name:'Android-pen-fixture.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
 const open=async()=>{
  await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
  await page.waitForSelector('.pdf-source-page .pdf-ink-layer');
  await page.waitForFunction(()=>document.querySelector('[data-ink-toggle]')?.getAttribute('aria-pressed')==='false');
  await page.waitForTimeout(500);
 };
 await open();
 const count=()=>page.locator('[data-page="1"] .pdf-ink-layer polyline').count();
 const saved=()=>page.waitForFunction(()=>document.querySelector('#pdf-ink-status [role=status]').textContent==='저장됨');
 const stroke=async(points,{pointerType='pen',cancel=false,palm=false}={})=>page.evaluate(({points,pointerType,cancel,palm})=>{
  const paper=originalSession.pages[0],target=paper.querySelector('canvas'),r=paper.getBoundingClientRect();
  const xy=p=>({clientX:r.left+p[0]*r.width,clientY:r.top+p[1]*r.height});
  const send=(type,p,id=7,kind=pointerType)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:kind,button:0,buttons:type==='pointerup'?0:1,isPrimary:true,...xy(p)}));
  const touch=(p,id=107)=>({identifier:id,target,...xy(p)}); // Android need not expose touchType.
  const sendTouch=(type,touches,changed)=>{
   const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:changed}});
   target.dispatchEvent(event);return event.defaultPrevented;
  };
  send('pointerdown',points[0]);let contact=touch(points[0]);const prevented=sendTouch('touchstart',[contact],[contact]);
  const palmContact=touch([.8,.8],108);
  if(palm){send('pointerdown',[.8,.8],8,'touch');sendTouch('touchstart',[contact,palmContact],[palmContact]);}
  for(const p of points.slice(1)){send('pointermove',p);contact=touch(p);sendTouch('touchmove',palm?[contact,palmContact]:[contact],[contact]);}
  send(cancel?'pointercancel':'pointerup',points.at(-1));sendTouch(cancel?'touchcancel':'touchend',palm?[palmContact]:[],[contact]);
  if(palm){send('pointerup',[.8,.8],8,'touch');sendTouch('touchend',[],[palmContact]);}
  target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
  return prevented;
 },{points,pointerType,cancel,palm});
 const mode=async value=>{
  await page.evaluate(()=>expandReaderChrome());
  const on=await page.locator('[data-ink-toggle]').getAttribute('aria-pressed')==='true';
  if(value==='read'){if(on)await page.locator('[data-ink-toggle]').click();return;}
  if(!on)await page.locator('[data-ink-toggle]').click();
  const button=page.locator(`[data-ink-mode="${value}"]`);
  if(await button.getAttribute('aria-pressed')!=='true')await button.click();
 };
 await stroke([[.1,.15],[.4,.15]]);assert.equal(await count(),0,'entry is read-only');
 await mode('pen');
 await page.evaluate(()=>{window.qaPenLookup=0;const original=dispatchWord;dispatchWord=(...args)=>{window.qaPenLookup++;return original(...args);};});
 assert.equal(await stroke([[.1,.15],[.2,.18],[.4,.15]],{palm:true}),true);await saved();assert.equal(await count(),1);
 assert.equal(await page.evaluate(()=>window.qaPenLookup),0,'pen/palm never reach Lookup');
 const first=await page.locator('[data-page="1"] .pdf-ink-layer polyline').getAttribute('points');
 await stroke([[.1,.3],[.4,.3]],{cancel:true});assert.equal(await count(),1,'cancel discards unfinished pen');
 await stroke([[.1,.3],[.4,.3]],{pointerType:'touch'});assert.equal(await count(),1,'finger never writes');
 // Browser-dispatched touch transport checks native finger scrolling separately
 // from the synthetic pen contract. It does not emulate a hardware stylus.
 const cdp=await context.newCDPSession(page),before=await page.evaluate(()=>readerScroller().scrollTop);
 const rect=await page.locator('[data-page="1"] canvas').boundingBox();
 const x=rect.x+rect.width*.7,y=Math.min(700,rect.y+rect.height*.6);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*45}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(top=>readerScroller().scrollTop>top+20,before);
 assert.equal(await count(),1,'finger scroll retained ink');
 await page.evaluate(()=>{readerScroller().scrollTo({top:0,behavior:'instant'});});await page.waitForTimeout(700);
 // Real browser touch transport must still acquire and finish the existing
 // PDF pinch while writing is armed. A late pen cannot steal it.
 const zoomBefore=await page.evaluate(()=>originalZoom());
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:300,y:350},{id:2,x:500,y:350}]});
 await page.waitForFunction(()=>!!originalPinch);
 await page.evaluate(()=>{
  const target=originalSession.pages[0].querySelector('canvas');
  for(const type of ['pointerdown','pointermove','pointerup'])target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:17,button:0,buttons:type==='pointerup'?0:1,clientX:400,clientY:400}));
 });
 assert.equal(await count(),1,'late pen cannot start during the finger pinch');
 for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:300-i*12,y:350},{id:2,x:500+i*12,y:350}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(level=>originalZoom()>level+0.1&&!originalPinch,zoomBefore);
 assert.equal(await count(),1,'pinch preserves completed ink');
 await page.evaluate(()=>{setOriginalZoom(1);readerScroller().scrollTo({top:0,left:0,behavior:'instant'});});await page.waitForTimeout(700);
 await mode('highlighter');await stroke([[.1,.35],[.5,.35]]);await saved();
 assert.equal(await page.locator('[data-page="1"] .pdf-ink-layer [data-ink-tool="highlighter"] polyline').count(),1);
 await mode('erase');await stroke([[.3,.1],[.3,.4]]);await saved();
 const erased=await count();assert.ok(erased>2,'partial eraser retains stroke fragments');
 await page.locator('[data-ink-undo]').click();await saved();assert.equal(await count(),2);
 await page.locator('[data-ink-redo]').click();await saved();assert.equal(await count(),erased);
 await page.reload();await open();assert.equal(await count(),erased,'reload restores committed redo');
 await mode('pen');
 // Page lifecycle: mounted SVG may be discarded, persisted records remain.
 await page.evaluate(async()=>{const s=originalSession,p=await s.pdf.getPage(1);BreezePdfInk.release(s,1);await BreezePdfInk.mount(s,1,p.getViewport({scale:1}));});
 assert.equal(await count(),erased,'page eviction/remount restores ink');
 await page.evaluate(async()=>{show('vocab');});await open();assert.equal(await count(),erased,'document close/reopen restores ink');
 await mode('pen');await context.setOffline(true);await stroke([[.55,.2],[.75,.22]]);await saved();await context.setOffline(false);
 assert.equal(await count(),erased+1,'offline fixture-only route supports further edits');
 mkdirSync(proof,{recursive:true});
 for(const [label,viewport] of Object.entries({phone:{width:390,height:844},tablet:{width:820,height:1180},desktop:{width:1280,height:900},short:{width:820,height:600}})){
  await page.setViewportSize(viewport);
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>{darkMode=theme==='dark';applyDark();expandReaderChrome();},theme);
   await page.waitForTimeout(180);
   const toggle=page.locator('[data-ink-toggle]');assert.equal(await toggle.isVisible(),true,`${label}/${theme} writing control visible`);
   const bounds=await toggle.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,`${label}/${theme} toggle inside viewport`);
   await page.screenshot({path:resolve(proof,`${label}-${theme}.png`)});
  }
 }
 assert.ok(first.length>0);assert.deepEqual(errors.filter(x=>!x.includes('ResizeObserver loop')),[]);
 console.log('PASS capability gate without iPad flag, read lock, pen-only geometry, companion Touch suppression, palm isolation, native finger scroll/pinch, cancellation, partial erase, highlighter, undo/redo, real IndexedDB reload, page eviction, document reopen, offline-local fixture, viewport proof');
 console.log('NOT VERIFIED: Android device pen/palm ordering, WebView inertia interruption, physical latency, process-kill persistence');
 await context.close();
}finally{await browser?.close();server.close();}
