import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=process.env.BREEZE_QA_ROOT?resolve(process.env.BREEZE_QA_ROOT)+'/':fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_SIDEBAR_BODY_PROOF||'/tmp/breeze-sidebar-body-gestures';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url=`http://127.0.0.1:${server.address().port}/`,reports=[];
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=engine===webkit?null:await engine.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE||undefined});
 try{for(const kind of ['pdf','epub']){
  const options={viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'};
  const context=engine===webkit?await engine.launchPersistentContext('',options):await browser.newContext(options),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));await page.goto(url);await page.evaluate(()=>homeReady);
  if(kind==='pdf'){
   await page.locator('#fileinput').setInputFiles({name:'Sidebar gestures.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
   await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});await page.waitForSelector('.pdf-source-page canvas');
  }else await page.evaluate(async()=>{
   await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
   zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>');
   const paras=Array.from({length:120},(_,i)=>`Paragraph ${i}. The patient reader keeps the book and its notes safe while moving the paper.`);zip.file('a.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Gesture fixture</title></head><body>'+paras.map(p=>'<p>'+p+'</p>').join('')+'</body></html>');
   const book={id:'sidebar-body-epub',title:'Sidebar gestures EPUB',kind:'epub',original:{hash:'sidebar-body-epub'},paras};books=[book];positions[book.id]={mode:'original',p:0,y:0};await openBook(book,{prepared:{book,original:{kind:'epub',hash:book.id,blob:await zip.generateAsync({type:'blob'})}}});await Promise.all(originalSession.frameGeometryReady);
  });
  await page.waitForFunction(()=>!readerPositionPending());await page.waitForTimeout(350);
  await page.evaluate(()=>{
   window.qaBodyCalls={word:0,sentence:0,page:0};openPdfWordAt=()=>{qaBodyCalls.word++;return false;};
   for(const surface of READER_SURFACES){surface.openWordAt=()=>{qaBodyCalls.word++;return false;};surface.sentenceAt=()=>{qaBodyCalls.sentence++;return null;};}
   stepPdfPage=()=>{qaBodyCalls.page++;};
   window.qaBodyPointer=(selector,type,x=280,y=220)=>{const target=selector==='#original-stage'?(document.querySelector('.epub-touch-skin')||document.querySelector(selector)):document.querySelector(selector);target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:701,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,button:0}));};
   window.qaBodyTouch=(type,points,changed=points)=>{const target=document.getElementById('original-stage');const touch=p=>({identifier:p.id,target,touchType:'direct',clientX:p.x,clientY:p.y});const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:points.map(touch)},changedTouches:{value:changed.map(touch)}});target.dispatchEvent(event);};
  });
  const open=async()=>{await page.evaluate(()=>{expandReaderChrome();togglePdfNavigation();});await page.waitForFunction(()=>!!pdfNavigation);await page.evaluate(async()=>{await Promise.allSettled(document.getElementById('pdf-page-control').getAnimations().map(a=>a.finished));});};
  const closed=async()=>{await page.waitForFunction(()=>!pdfNavigation&&!pdfNavigationCloseTimer);assert.deepEqual(await page.evaluate(()=>qaBodyCalls),{word:0,sentence:0,page:0});assert.equal(await page.evaluate(()=>document.getSelection()?.toString()||''),'');};
  await open();
  assert.equal(await page.evaluate(()=>document.elementFromPoint(280,220)?.closest('#originalwrap')!==null),true,'Open sidebar must leave body hit testing and native pan/pinch available');
  await page.setViewportSize({width:390,height:320});await page.waitForTimeout(350);
  const internalBefore=await page.evaluate(()=>({body:readerScroller().scrollTop,strip:document.getElementById('pdf-thumbnail-strip').scrollTop,page:pdfCurrentPage()}));
  await page.mouse.move(70,180);await page.mouse.wheel(0,120);await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>!!pdfNavigation),true,'Trusted internal wheel retains sidebar');assert.equal(await page.evaluate(()=>readerScroller().scrollTop),internalBefore.body,'Internal wheel does not move the body');assert.ok(await page.evaluate(()=>document.getElementById('pdf-thumbnail-strip').scrollTop)>internalBefore.strip,'Internal list actually scrolls');assert.equal(await page.evaluate(()=>pdfCurrentPage()),internalBefore.page,'Internal pan does not select a page');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
  // Internal scroll, pointer motion and stationary cancelled contact retain navigation.
  await page.evaluate(()=>{qaBodyPointer('#pdf-thumbnail-strip','pointerdown',70,260);qaBodyPointer('#pdf-thumbnail-strip','pointermove',70,100);qaBodyPointer('#pdf-thumbnail-strip','pointercancel',70,100);document.getElementById('pdf-thumbnail-strip').dispatchEvent(new Event('scroll'));});assert.equal(await page.evaluate(()=>!!pdfNavigation),true);
  await page.evaluate(()=>{qaBodyPointer('#original-stage','pointerdown');qaBodyPointer('#original-stage','pointercancel');});assert.equal(await page.evaluate(()=>!!pdfNavigation),true);
  // Programmatic position restoration must not dismiss the sidebar.
  await page.evaluate(()=>readerScrollTo(readerScroller().scrollTop+25));await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>!!pdfNavigation),true);
  // A wheel scroll reaches the body on the first attempt.
  const before=await page.evaluate(()=>readerScroller().scrollTop);await page.mouse.move(280,260);await page.mouse.wheel(0,160);await closed();assert.ok(await page.evaluate(()=>readerScroller().scrollTop)>before,'First body wheel moves paper');
  // Keyboard scroll intent uses the existing body listener, not layout scrolls.
  await open();await page.evaluate(()=>readerScroller().dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown',bubbles:true})));await closed();
  // Central pointer movement is the existing body-scroll intent; no late WORD/page.
  await open();await page.evaluate(()=>{qaBodyPointer('#original-stage','pointerdown');qaBodyPointer('#original-stage','pointermove',280,100);qaBodyPointer('#original-stage','pointercancel',280,100);});await closed();
  // Outside taps retain the previous dismiss-only policy. A fresh tap works once.
  await open();await page.touchscreen.tap(280,220);await closed();await page.touchscreen.tap(280,220);assert.equal(await page.evaluate(()=>qaBodyCalls.word),1);await page.evaluate(()=>qaBodyCalls.word=0);
  await open();await page.evaluate(()=>{qaBodyPointer('#original-stage','pointerdown');closePdfNavigation();togglePdfNavigation();qaBodyPointer('#original-stage','pointerup');const target=document.querySelector('.epub-touch-skin')||document.getElementById('original-stage');target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:280,clientY:220}));});await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>!!pdfNavigation),true,'An older outside contact and its click tail cannot close a newer navigator');await page.evaluate(()=>closePdfNavigation());await closed();
  // Opening reversal starts from its current frame and its old timer cannot hide a reopening.
  await page.evaluate(()=>togglePdfNavigation());await page.waitForTimeout(65);await page.evaluate(()=>{qaBodyPointer('#original-stage','pointerdown');qaBodyPointer('#original-stage','pointermove',280,100);qaBodyPointer('#original-stage','pointercancel');togglePdfNavigation();});await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>!!pdfNavigation&&!document.getElementById('pdf-page-navigation').hidden),true);await page.evaluate(()=>closePdfNavigation());await closed();
  if(kind==='pdf'){
   if(engine===chromium){
    const cdp=await context.newCDPSession(page);await open();const top=await page.evaluate(()=>readerScroller().scrollTop);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y:400,id:901}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:280,y:180,id:901}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await closed();assert.ok(await page.evaluate(()=>readerScroller().scrollTop)>top,'First trusted body pan scrolls without a second contact');await page.waitForTimeout(300);
    await open();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:240,y:280,id:911},{x:300,y:320,id:912}]});assert.equal(await page.evaluate(()=>!!originalPinch&&!pdfNavigation),true,'Trusted first pinch owns input and dismisses sidebar');await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y:260,id:911},{x:320,y:340,id:912}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await closed();await page.waitForTimeout(350);await page.evaluate(()=>setOriginalZoom(1));await page.waitForTimeout(350);await cdp.detach();
   }
   await open();await page.evaluate(()=>{qaBodyTouch('touchstart',[{id:801,x:240,y:220},{id:802,x:300,y:260}]);});assert.equal(await page.evaluate(()=>!!originalPinch),true,'Existing pinch owner admits the first body pair');assert.equal(await page.evaluate(()=>!!pdfNavigation),false);
   await page.evaluate(()=>{qaBodyTouch('touchmove',[{id:801,x:220,y:200},{id:802,x:320,y:280}]);qaBodyTouch('touchcancel',[],[{id:801,x:220,y:200},{id:802,x:320,y:280}]);});await closed();await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>!!pdfNavigation),false,'Cancelled pinch never restores sidebar');
   await page.evaluate(()=>setOriginalZoom(1.5));await page.waitForTimeout(350);await page.evaluate(()=>{qaBodyTouch('touchstart',[{id:811,x:12,y:220}]);qaBodyTouch('touchmove',[{id:811,x:115,y:220}]);qaBodyTouch('touchend',[],[{id:811,x:115,y:220}]);});assert.equal(await page.evaluate(()=>!!pdfNavigation),false,'Zoomed edge pan cannot reopen sidebar');await page.evaluate(()=>setOriginalZoom(1));await page.waitForTimeout(350);
  }
  await page.screenshot({path:resolve(proof,engine.name()+'-'+kind+'.png')});assert.deepEqual(errors,[]);reports.push({engine:engine.name(),kind,passed:true,checks:'body hit test, internal gesture retention, cancelled/programmatic motion, first wheel/pan, outside/fresh tap, reversal'+(kind==='pdf'?', pinch cancel and zoomed edge exclusion':'')});await context.close();
 }}finally{await browser?.close();}
}}finally{writeFileSync(resolve(proof,'results.json'),JSON.stringify(reports,null,2));await new Promise(done=>server.close(done));}
console.log('Sidebar body gestures passed:',JSON.stringify(reports));
