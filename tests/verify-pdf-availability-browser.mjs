/* Real PDF.js/IndexedDB; native signals are mocked, not hardware acceptance. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const proof='/tmp/breeze-pdf-availability';
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html'};
const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
 const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
 catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const cases=[
 {name:'desktop-web',allowed:false},
 {name:'mobile-web',allowed:false},
 {name:'installed-pwa',platform:'web',allowed:false,pwa:true},
 {name:'native-iphone',native:true,platform:'ios',allowed:false},
 {name:'native-ipad-no-pencil-event',native:true,platform:'ios',ipad:true,allowed:true},
 {name:'native-android-phone-with-pen-adapter',native:true,platform:'android',tablet:false,allowed:false},
 {name:'native-android-tablet-no-pen-event',native:true,platform:'android',tablet:true,allowed:true},
 {name:'native-android-tablet-with-pen-adapter',native:true,platform:'android',tablet:true,allowed:true},
 {name:'native-android-old-wrapper',native:true,platform:'android',pluginMissing:true,allowed:false},
 {name:'native-android-unsafe-input-adapter',native:true,platform:'android',touchPoints:0,allowed:false},
 {name:'missing-native-bridge',allowed:false},
];
try{
 for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  // Match existing PDF suites: WebKit requires persistent IndexedDB Blob storage.
  const profile=mkdtempSync(resolve(tmpdir(),'breeze-availability-'));
  const browser=await engine.launchPersistentContext(profile,{headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'});
  try{
   const context=browser;
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
   await page.addInitScript(()=>{
    const runtime=JSON.parse(localStorage.getItem('__qa_ink_runtime')||'{}');
    window.breezeInkIPad=runtime.ipad===true;
    if(runtime.platform)window.Capacitor={isNativePlatform:()=>runtime.native===true,getPlatform:()=>runtime.platform,
     registerPlugin:()=>{if(runtime.pluginMissing)throw new Error('Plugin unavailable');return {getCapabilities:async()=>({tablet:runtime.tablet===true})};}};
    Object.defineProperty(navigator,'maxTouchPoints',{get:()=>runtime.touchPoints??5});
    if(runtime.pwa)Object.defineProperty(navigator,'standalone',{value:true});
   });
   await page.goto(url);
   await page.locator('#fileinput').setInputFiles({name:'Stored-annotation.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
   const open=async()=>{
    await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
    await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
    await page.evaluate(()=>BreezePdfInk.availability());
    await page.waitForSelector('.pdf-source-page .pdf-ink-layer');
   };
   await open();
   const stored=await page.evaluate(async()=>{
    const value={version:1,strokes:[{color:'#111111',width:1.5,points:[[20,20],[100,60]]}]};
    const key=JSON.stringify([originalSession.hash,1]);
    await new Promise((resolve,reject)=>{
     const request=indexedDB.open('breeze-pdf-ink',1);
     request.onsuccess=()=>{const db=request.result,tx=db.transaction('pages','readwrite');tx.objectStore('pages').put(value,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
     request.onerror=()=>reject(request.error);
    });
    // Simulate persisted last writing tool; it must never reactivate on open.
    localStorage.setItem('__breeze_pdf_ink_tools_v1__',JSON.stringify({tool:'erase'}));
    return {key,value};
   });
   for(const runtime of cases){
    await page.evaluate(runtime=>localStorage.setItem('__qa_ink_runtime',JSON.stringify(runtime)),runtime);
    await page.reload();await open();
    await page.waitForFunction(()=>document.querySelectorAll('.pdf-ink-layer polyline').length===1);
    assert.equal(await page.evaluate(()=>BreezePdfInk.writing()),false,`${runtime.name}: restored read mode`);
    const toggle=page.locator('[data-ink-toggle]');
    assert.equal(await toggle.isVisible(),runtime.allowed,`${runtime.name}: entry`);
    if(runtime.allowed){
     for(const viewport of [{width:320,height:640},{width:1180,height:820},{width:1440,height:900}]){
      await page.setViewportSize(viewport);
      assert.equal(await toggle.isVisible(),true,`${runtime.name}: eligibility survives responsive/orientation changes`);
      assert.equal(await page.evaluate(()=>BreezePdfInk.writing()),false);
     }
     await page.setViewportSize({width:820,height:1180});
     await toggle.click();assert.equal(await page.evaluate(()=>BreezePdfInk.writing()),true);
     // Native capability changes must revoke existing writing immediately.
     await page.evaluate(()=>{window.breezeInkIPad=false;delete window.Capacitor;window.dispatchEvent(new Event('breeze-ink-platform'));});
     assert.equal(await page.evaluate(()=>BreezePdfInk.writing()),false);
     assert.equal(await toggle.isVisible(),false);
    }
    // Attempt every tool through hidden DOM controls, public undo and keyboard.
    await page.evaluate(()=>{
     document.querySelector('[data-ink-toggle]').click();
     for(const tool of ['pen','highlighter','erase'])document.querySelector(`[data-ink-mode="${tool}"]`).click();
     BreezePdfInk.undo();
     for(const key of ['p','e','w','z'])document.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true}));
     const target=originalSession.pages[0].querySelector('canvas');
     for(const type of ['pointerdown','pointermove','pointerup'])target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:7,button:0,clientX:100,clientY:100}));
    });
    assert.equal(await page.evaluate(()=>BreezePdfInk.writing()),false,`${runtime.name}: activation rejected`);
    for(const [name,viewport] of Object.entries({phone:{width:390,height:844},tablet:{width:820,height:1180},desktop:{width:1440,height:900},short:{width:820,height:400},landscape:{width:1180,height:820},narrow:{width:320,height:640}})){
     await page.setViewportSize(viewport);
     for(const dark of [false,true]){
      await page.evaluate(dark=>{document.body.classList.toggle('dark',dark);document.documentElement.classList.toggle('dark',dark);},dark);
      assert.equal(await toggle.isVisible(),false,`${runtime.name}/${name}/${dark}: resize cannot admit`);
      assert.equal(await page.locator('.pdf-ink-layer polyline').count(),1,`${runtime.name}: readback preserved`);
     }
    }
    const value=await page.evaluate(key=>new Promise((resolve,reject)=>{
     const request=indexedDB.open('breeze-pdf-ink',1);
     request.onsuccess=()=>{const db=request.result,tx=db.transaction('pages'),get=tx.objectStore('pages').get(key);tx.oncomplete=()=>{db.close();resolve(get.result);};tx.onerror=()=>reject(tx.error);};
    }),stored.key);
    assert.deepEqual(value,stored.value,`${runtime.name}: stored data unchanged`);
    mkdirSync(proof,{recursive:true});await page.screenshot({path:resolve(proof,`${engine.name()}-${runtime.name}.png`)});
   }
   assert.deepEqual(errors,[]);
   console.log(`${engine.name()}: PASS native tablet-only availability, phone/web/PWA restrictions, native revoke, persisted tool/forced activation, responsive light/dark and real stored ink readback`);
  }finally{await browser.close();rmSync(profile,{recursive:true,force:true});}
 }
}finally{await new Promise(r=>server.close(r));}
