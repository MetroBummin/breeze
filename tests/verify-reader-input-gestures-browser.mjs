/* Synthetic Touch/Pointer delivery with real PDF.js/IndexedDB, never Pencil hardware proof. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),proof='/tmp/breeze-input-gestures';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
 try{
 const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>{window.breezeInkIPad=true;localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
 await page.goto(url);await page.locator('#fileinput').setInputFiles({name:'Gesture.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
 const open=async()=>{await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});await page.waitForSelector('.pdf-ink-layer');await page.waitForFunction(()=>!readerPositionPending());await page.waitForTimeout(500);};
 await open();
 const install=async()=>page.evaluate(()=>{
  window.qaInkLookup=0;const dispatch=dispatchWord;dispatchWord=(...args)=>{window.qaInkLookup++;return dispatch(...args);};
  let contact=null,seq=400;
  const send=(name,touches,changed)=>{const e=new Event(name,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed}});changed[0].target.dispatchEvent(e);return e.defaultPrevented;};
  const pointer=(name,t)=>t.target.dispatchEvent(new PointerEvent(name,{bubbles:true,cancelable:true,pointerId:t.identifier,pointerType:t.touchType==='stylus'?'pen':'touch',isPrimary:true,buttons:name==='pointerup'?0:1,clientX:t.clientX,clientY:t.clientY}));
  window.qaInput={
   start(x,y,type='stylus',edge=false){const element=originalSession.pages[0],r=element.getBoundingClientRect();contact={identifier:++seq,target:edge?document.getElementById('original-stage'):element.querySelector('canvas'),touchType:type,clientX:edge?x:r.left+x,clientY:edge?y:r.top+y};pointer('pointerdown',contact);send('touchstart',[contact],[contact]);},
   move(x,y,edge=false){const r=originalSession.pages[0].getBoundingClientRect();contact={...contact,clientX:edge?x:r.left+x,clientY:edge?y:r.top+y};pointer('pointermove',contact);return send('touchmove',[contact],[contact]);},
   end(cancel=false){pointer(cancel?'pointercancel':'pointerup',contact);send(cancel?'touchcancel':'touchend',[],[contact]);contact.target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));contact=null;},
   cancelPointer(kind){pointer(kind,contact);send('touchcancel',[],[contact]);contact=null;}
  };
 });
 await install();
 const count=()=>page.locator('.pdf-source-page[data-page="1"] .pdf-ink-layer polyline').count();
 const saved=()=>page.waitForFunction(()=>document.querySelector('#pdf-ink-status [role=status]').textContent==='저장됨');
 const pen=page.locator('[data-ink-mode="pen"]');
 await page.locator('[data-ink-toggle]').click();await pen.click();
 const toggle=page.locator('[data-ink-scribble]');assert.equal(await toggle.getAttribute('aria-pressed'),'false');await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>{qaInput.start(100,200);qaInput.move(250,200);qaInput.end();});await saved();assert.equal(await count(),1);
 const scribble=async(turns=5,type='stylus')=>page.evaluate(async({turns,type})=>{
  qaInput.start(190,200,type);
  for(let i=1;i<=turns*24;i++){qaInput.move(170+20*Math.cos(i*Math.PI/12),200+20*Math.sin(i*Math.PI/12));await new Promise(r=>setTimeout(r,5));}
 },{turns,type});
 await scribble();await page.waitForSelector('#pdf-ink-scribble-cue:not([hidden])');
 assert.equal(await count(),2,'original and live preview remain until release');
 await page.screenshot({path:resolve(proof,engine.name()+'-confirm.png')});
 await page.evaluate(()=>qaInput.end());await saved();assert.equal(await count(),0);
 await page.locator('[data-ink-undo]').click();await saved();assert.equal(await count(),1);
 await page.locator('[data-ink-redo]').click();await saved();assert.equal(await count(),0);
 await page.reload();await open();assert.equal(await count(),0,'deletion survives real database reopen');await install();
 await page.locator('[data-ink-toggle]').click();await pen.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true','setting survives reload');await pen.click();
 await page.evaluate(()=>{qaInput.start(100,200);qaInput.move(250,200);qaInput.end();});await saved();
 await scribble(1);await page.waitForTimeout(480);assert.equal(await page.locator('#pdf-ink-scribble-cue').isVisible(),false);await page.evaluate(()=>qaInput.end());await saved();assert.equal(await count(),2,'circle remains ink');
 await page.locator('[data-ink-undo]').click();await saved();
 for(const kind of ['pointercancel','lostpointercapture']){await scribble();await page.waitForSelector('#pdf-ink-scribble-cue:not([hidden])');await page.evaluate(kind=>qaInput.cancelPointer(kind),kind);assert.equal(await count(),1,kind);}
 await scribble();await page.waitForSelector('#pdf-ink-scribble-cue:not([hidden])');await page.evaluate(()=>{qaInput.move(225,245);qaInput.end();});await saved();assert.equal(await count(),2,'moving after confirm cancels deletion');await page.locator('[data-ink-undo]').click();await saved();
 await scribble(5,'direct');await page.waitForTimeout(480);await page.evaluate(()=>qaInput.end());assert.equal(await count(),1,'finger does not scribble');
 await page.evaluate(()=>closePanel());assert.equal(await page.evaluate(()=>window.qaInkLookup),0,'scribble never looks up');
 // Writing-mode navigation respects the same finger policy; pen mode alone is not busy.
 const edge=async({cancel=false,x=100,y=170}={})=>page.evaluate(({cancel,x,y})=>{qaInput.start(12,170,'direct',true);const prevented=qaInput.move(x,y,true);qaInput.end(cancel);return prevented;},{cancel,x,y});
 await page.evaluate(()=>setPdfReadDirection('horizontal'));await page.waitForTimeout(400);
 const n=await page.evaluate(()=>pdfCurrentPage());assert.equal(await edge(),true);await page.waitForFunction(()=>!!pdfNavigation);
 assert.equal(await page.evaluate(()=>pdfCurrentPage()),n,'edge and paging cannot both win');assert.equal(await page.evaluate(()=>window.qaInkLookup),0);
 await page.evaluate(()=>closePdfNavigation());await edge({cancel:true});assert.equal(await page.evaluate(()=>!!pdfNavigation),false);
 assert.equal(await edge({y:280}),false,'vertical movement stays native');assert.equal(await page.evaluate(()=>!!pdfNavigation),false);
 await page.evaluate(()=>setOriginalZoom(1.5));await page.waitForTimeout(200);await edge();assert.equal(await page.evaluate(()=>!!pdfNavigation),false,'zoom pan excluded');await page.evaluate(()=>setOriginalZoom(1));await page.waitForTimeout(250);
 await page.evaluate(()=>toggleAa());await edge();assert.equal(await page.evaluate(()=>!!pdfNavigation),false,'Aa owns input');await page.evaluate(()=>closeAa());
 await page.locator('#pdf-page-button').click();await page.waitForFunction(()=>!!pdfNavigation);await page.evaluate(()=>closePdfNavigation());
 await page.evaluate(()=>setPdfReadDirection('vertical'));await page.waitForTimeout(250);
 // Actual settings/control rectangles and both themes, including short split view.
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme});
  await page.evaluate(theme=>{darkMode=theme==='dark';applyDark();expandReaderChrome();},theme);
  if(await pen.getAttribute('aria-expanded')!=='true')await pen.click();
  await page.waitForTimeout(250);
  const rect=await toggle.boundingBox();assert.ok(rect&&rect.width>=44&&rect.height>=44&&rect.x>=0&&rect.x+rect.width<=width&&rect.y>=0&&rect.y+rect.height<=height,JSON.stringify({width,height,theme,rect}));
  await page.screenshot({path:resolve(proof,`${engine.name()}-${width}-${height}-${theme}.png`)});await pen.click();
 }
 await page.setViewportSize({width:820,height:1180});await page.waitForTimeout(450);
 await scribble();await page.waitForSelector('#pdf-ink-scribble-cue:not([hidden])');
 await page.evaluate(async()=>{
  await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');
  zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
  zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>');
  const paras=Array.from({length:80},(_,i)=>`Paragraph ${i}. A reader follows this chapter without losing their place.`);
  zip.file('a.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Edge</title></head><body>'+paras.map(p=>'<p>'+p+'</p>').join('')+'</body></html>');
  const record={kind:'epub',hash:'edge-epub',blob:await zip.generateAsync({type:'blob'})},book={id:'edge-epub',title:'Edge EPUB',kind:'epub',original:{hash:'edge-epub'},paras};
  books.push(book);positions[book.id]={mode:'original',p:0,y:0};await openBook(book,{prepared:{book,original:record}});await Promise.all(originalSession.frameGeometryReady);
 });
 await page.waitForFunction(()=>!readerPositionPending());await page.waitForTimeout(500);
 assert.equal(await page.locator('#pdf-ink-scribble-cue').isVisible(),false,'new book cancels held confirmation');
 await page.evaluate(()=>{
  const target=document.getElementById('original-stage');
  const t=x=>({identifier:910,target,touchType:'direct',clientX:x,clientY:170});
  const send=(name,touches,changed)=>{const e=new Event(name,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed}});target.dispatchEvent(e);};
  target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:910,clientX:12,clientY:170}));
  send('touchstart',[t(12)],[t(12)]);send('touchmove',[t(110)],[t(110)]);send('touchend',[],[t(110)]);
 });
 await page.waitForFunction(()=>pdfNavigation?.session.kind==='epub');await page.screenshot({path:resolve(proof,engine.name()+'-epub-edge.png')});
 await page.evaluate(()=>closePdfNavigation());await open();assert.equal(await count(),1,'new book never commits tentative deletion');
 assert.deepEqual(errors,[]);console.log(engine.name()+': scribble lifecycle, real IDB reopen, edge ownership and 10 responsive settings states passed');
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
