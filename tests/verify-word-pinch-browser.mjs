/* Real lookup/morph cleanup through the existing touch owner. Synthetic touches
   exercise DOM policy; native iPad recognizer and Pencil proof remain manual. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 // Match the existing PDF suites: WebKit needs persistent IndexedDB Blob storage.
 const browser=await engine.launchPersistentContext('',{headless:true,viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block',executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
 try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'lookup-pinch.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 try{await page.waitForSelector('.pdf-source-page canvas');}catch(error){
  console.log('PDF startup',engine.name(),errors,await page.evaluate(()=>({mode:currentReaderMode,session:originalSession&&{kind:originalSession.kind,hash:originalSession.hash},pages:document.querySelectorAll('.pdf-source-page').length})));throw error;
 }await page.waitForFunction(()=>!readerPositionPending());
 await page.evaluate(()=>{
  // Use a source marker as in other original-format presentation fixtures.
  window.qaOpen=async kind=>{
   closePanel();cancelOriginalPinch();setOriginalZoom(2);readerScrollTo(0);
   await new Promise(r=>setTimeout(r,300));
   const marker=document.createElement('span');marker.className='original-selection-marker';
   marker.style.cssText='position:fixed;left:200px;top:160px;width:50px;height:22px';
   document.getElementById('v-read').append(marker);
   words.minimum={word:'minimum',clicked:'minimum',ko:'최소',status:1,addedAt:1,
    example:'A minimum value.',defs:[],kodict:[]};
   selectWord('minimum',marker,true);window.qaLife=wordLookupLife;
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   if(kind!=='mini'){expandWordDetail();if(kind==='detail')await new Promise(r=>setTimeout(r,350));}
  };
  window.qaTouch=(type,ids,spread=100,cancelable=true,changed=ids)=>{
   const target=document.querySelector('.pdf-source-page canvas');
   const touch=id=>({identifier:id,touchType:'direct',target,clientX:400+(id===1?-spread:spread)/2,clientY:550});
   const event=new Event(type,{bubbles:true,cancelable});
   Object.defineProperties(event,{touches:{value:ids.map(touch)},changedTouches:{value:changed.map(touch)}});
   target.dispatchEvent(event);
  };
  window.qaClosed=()=>!wordSurfaceAnchored()&&!wordLookupOpen()&&selKey===null&&
   document.getElementById('word-peek').hidden&&!document.getElementById('panel').classList.contains('on')&&
   !wordMorphAnimation&&!wordLookupAlive(qaLife);
 });
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
  for(const kind of ['mini','detail','morph'])for(const spread of [60,160]){
   await page.evaluate(kind=>qaOpen(kind),kind);
   assert.equal(await page.evaluate(()=>wordSurfaceAnchored()),true);
   await page.evaluate(()=>qaTouch('touchstart',[1,2]));
   assert.equal(await page.evaluate(()=>originalPinchBusy()&&qaClosed()),true,'acquisition must dismiss '+kind);
   await page.evaluate(spread=>qaTouch('touchmove',[1,2],spread),spread);
   await page.evaluate(()=>{qaTouch('touchend',[2],100,true,[1]);qaTouch('touchend',[],100,true,[2]);});
   await page.waitForTimeout(300);
   assert.equal(await page.evaluate(()=>qaClosed()&&!originalPinchBusy()),true,'release resurrected '+kind);
   assert.equal(await page.evaluate(()=>words.minimum.ko),'최소');
   assert.ok(Math.abs(await page.evaluate(()=>originalZoom())-2*spread/100)<0.01,'zoom changed');
  }
 }
 for(const ending of ['cancel','noncancelable','blur','lost-end']){
  await page.evaluate(()=>qaOpen('morph'));
  await page.evaluate(()=>qaTouch('touchstart',[1,2]));
  await page.evaluate(ending=>{
   if(ending==='cancel'){qaTouch('touchcancel',[2],100,true,[1]);qaTouch('touchcancel',[],100,true,[2]);}
   if(ending==='noncancelable')qaTouch('touchmove',[1,2],160,false);
   if(ending==='blur')window.dispatchEvent(new Event('blur'));
   if(ending==='lost-end'){qaTouch('touchstart',[3]);qaTouch('touchend',[],100,true,[3]);}
  },ending);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>qaClosed()&&!originalPinchBusy()),true,ending);
  // A compatibility click belongs to the pinch, not a new word lookup.
  await page.evaluate(()=>document.querySelector('.pdf-source-page canvas').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:400,clientY:550})));
  assert.equal(await page.evaluate(()=>qaClosed()),true);
 }
 // A legitimate new word lookup can present and expand again.
 await page.evaluate(()=>qaOpen('detail'));
 assert.equal(await page.evaluate(()=>wordDetailAnchored&&wordLookupOpen()),true);
 // Modal vocabulary detail blocks pinch rather than being dismissed by it.
 await page.evaluate(()=>{closePanel();selectWord('minimum',null);qaTouch('touchstart',[1,2]);});
 assert.equal(await page.evaluate(()=>!originalPinchBusy()&&wordLookupOpen()),true);
 await page.evaluate(()=>{qaTouch('touchend',[],100,true,[1,2]);closePanel();});
 // Text and EPUB do not support original PDF zoom. Unowned multitouch must not
 // dismiss their detail; actual user scrolling still does through scrollGesture.
 for(const surface of ['text','epub']){
  await page.evaluate(async surface=>{
   if(surface==='text')await switchReaderMode('text');
   else {
    await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');
    zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
    zip.file('book.opf','<package><metadata/><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>');
    const paras=Array(80).fill('A minimum value helps a patient reader.');
    zip.file('a.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><body>'+paras.map(p=>'<p>'+p+'</p>').join('')+'</body></html>');
    const book={id:'pinch-epub',title:'Pinch EPUB',kind:'epub',original:{hash:'pinch-epub'},paras};
    await openBook(book,{prepared:{book,original:{kind:'epub',hash:'pinch-epub',blob:await zip.generateAsync({type:'blob'})}}});
    await switchReaderMode('original');await Promise.all(originalSession.frameGeometryReady);
   }
  },surface);
  await page.waitForFunction(()=>!readerPositionPending());await page.waitForTimeout(400);
  await page.evaluate(async()=>{
   const marker=document.createElement('span');marker.style.cssText='position:fixed;left:200px;top:160px;width:50px;height:22px';document.getElementById('v-read').append(marker);
   selectWord('minimum',marker,true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));expandWordDetail();
   const target=document.getElementById(currentReaderMode==='text'?'rtext':'original-stage');
   const touch=id=>({identifier:id,touchType:'direct',target,clientX:200+100*id,clientY:500});
   const event=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:[touch(1),touch(2)]},changedTouches:{value:[touch(2)]}});target.dispatchEvent(event);
  });
  assert.equal(await page.evaluate(()=>!originalPinchBusy()&&wordDetailAnchored),true,surface+' acquired PDF zoom');
  await page.evaluate(()=>readerScroller().scrollTop+=30);await page.waitForFunction(()=>!wordLookupOpen());
 }
 assert.deepEqual(errors,[]);console.log(engine.name()+': word pinch dismissal, transitions, interruptions, PDF/text/EPUB passed');
 }finally{await browser.close();}
}}finally{server.close();}
