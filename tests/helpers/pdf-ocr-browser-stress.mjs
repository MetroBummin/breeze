import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';

// Real PDF.js, DOM, gestures and IndexedDB. All native responses below are
// explicitly controlled; recognition accuracy belongs to the separate CI corpus.
export async function stressPdfOcrBrowser({page,context,engine,jpeg,scanPdf}){
 await page.evaluate(()=>{
  closePanel();cancelOriginalPinch();setOriginalZoom(1);readerScrollTo(0);
  window.breezeInkIPad=true;
  window.qaOldOcrSession=null;window.qaOcrBoxes=null;window.qaOcrCalls=[];
  window.qaStress={calls:[],active:0,peak:0,auto:false,failNext:false};
  const bridge={async recognize({image}){
   qaStress.active++;qaStress.peak=Math.max(qaStress.peak,qaStress.active);
   const page=originalSession.pages.find(p=>p.dataset.ocr==='running');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(image)))].map(x=>x.toString(16).padStart(2,'0')).join('');
   return new Promise((resolve,reject)=>{
    const row={book:originalSession.bookId,page:+page.dataset.page,hash,bytes:image.length,resolve:null};
    const fail=qaStress.failNext;qaStress.failNext=false;
    row.resolve=()=>{row.resolve=null;qaStress.active--;fail?reject(Error('controlled native failure')):resolve({words:qaOcrResult});};
    qaStress.calls.push(row);if(qaStress.auto)setTimeout(()=>row.resolve?.(),30);
   });
  }};
  window.Capacitor.registerPlugin=()=>bridge;
  window.qaTouch=(type,ids,spread=100)=>{
   const target=originalSession.pages.find(p=>pdfPagesInView(originalSession).includes(+p.dataset.page)).querySelector('canvas');
   const r=target.getBoundingClientRect();
   const touch=id=>({identifier:id,touchType:'direct',target,clientX:r.left+r.width*.4+(id===1?-spread:spread)/2,clientY:Math.max(140,r.top+120)});
   const event=new Event(type,{bubbles:true,cancelable:true});
   Object.defineProperties(event,{touches:{value:ids.map(touch)},changedTouches:{value:(type==='touchend'?[1,2]:ids).map(touch)}});target.dispatchEvent(event);
  };
  window.qaCacheCount=async()=>{
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('breeze-pdf-ocr',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
   return await new Promise(resolve=>{const r=db.transaction('pages').objectStore('pages').count();r.onsuccess=()=>{db.close();resolve(r.result);};});
  };
 });
 const oldIds=await page.evaluate(()=>books.map(b=>b.id));
 await page.locator('#fileinput').setInputFiles({name:'scan-stress-sixty.pdf',mimeType:'application/pdf',buffer:scanPdf(jpeg,{pages:60})});
 await page.waitForFunction(ids=>books.some(b=>b.kind==='pdf'&&!ids.includes(b.id)),oldIds);
 await page.evaluate(async ids=>{await openBook(books.find(b=>b.kind==='pdf'&&!ids.includes(b.id)));await switchReaderMode('original');},oldIds);
 await page.waitForFunction(()=>qaStress.calls.length===1);
 await page.waitForFunction(()=>!readerPositionPending());
 await page.evaluate(()=>setPdfReadDirection('horizontal'));
 console.log('OCR browser stress: imported 60-page scan');
 // Repeated taps never open a meaning while OCR is pending.
 await page.evaluate(async()=>{for(let i=0;i<16;i++){const p=originalSession.pages[0],r=p.getBoundingClientRect();await openPdfWordAt(r.left+r.width*.15,r.top+r.height*.135);}});
 assert.equal(await page.evaluate(()=>qaStress.calls.length),1);
 assert.equal(await page.evaluate(()=>wordPeekOpen()),false);
 // Invalidate multiple in-flight navigation intents; only the final visible page
 // can publish. Reading/page movement completes while the native promise is held.
 for(const n of [2,9,4,25,8,60]){
  await page.waitForFunction(()=>!readerPositionPending()&&!originalPinchBusy());
  await page.evaluate(n=>goPdfPage(n),n);
 }
 await page.waitForFunction(()=>pdfPagesInView(originalSession).includes(60));
 assert.equal(await page.evaluate(()=>qaStress.calls.length),1);
 await page.evaluate(()=>qaStress.calls[0].resolve());
 await page.waitForFunction(()=>qaStress.calls.length===2);
 assert.equal(await page.evaluate(()=>qaStress.calls[1].page),60);
 assert.equal(await page.evaluate(()=>originalSession.wordBoxes.get(1)?.length||0),0);
 // Real pinch owner continues to zoom while recognition is pending. Completing
 // OCR during the gesture may cache, but cannot paint or open lookup.
 await page.evaluate(()=>qaTouch('touchstart',[1,2]));
 assert.equal(await page.evaluate(()=>originalPinchBusy()),true);
 await page.evaluate(()=>{qaTouch('touchmove',[1,2],160);qaStress.calls[1].resolve();});
 await page.waitForFunction(()=>qaStress.active===0);
 assert.equal(await page.evaluate(()=>originalSession.wordBoxes.get(60)?.length||0),0);
 assert.equal(await page.evaluate(()=>wordPeekOpen()),false);
 await page.evaluate(()=>{qaTouch('touchend',[]);cancelOriginalPinch();setOriginalZoom(1);});
 await page.evaluate(()=>goPdfPage(60));
 await page.waitForFunction(()=>originalSession.wordBoxes.get(60)?.length===2);
 assert.equal(await page.evaluate(()=>qaStress.calls.length),2);
 console.log('OCR browser stress: pending navigation and pinch passed');
 // Replay the spelling error actually observed in native Vision at confidence 1.
 // Browser response remains a controlled replay, not another accuracy measure.
 await page.evaluate(()=>{
  const boxes=BreezePdfOcr.boxesFromWords([{...qaOcrResult[0],word:'Briaht',confidence:1}]);
  originalSession.wordBoxes.set(60,boxes);
  for(let i=0;i<8;i++)openPdfWord(originalSession.pages[59],boxes[0]);
 });
 assert.equal(await page.locator('.pdf-ocr-confirm strong').textContent(),'Briaht');
 assert.equal(await page.evaluate(()=>wordPeekOpen()),false);
 assert.equal(await page.evaluate(()=>{const p=originalSession.pages[59],r=p.getBoundingClientRect(),b=originalSession.wordBoxes.get(60)[0];return READER_SURFACES.find(s=>s.name==='pdf').sentenceAt(r.left+(b.x+b.w/2)*r.width,r.top+(b.y+b.h/2)*r.height);}),null,'unconfirmed OCR does not enable sentence lookup');
 await page.evaluate(()=>{window.qaRetiredConfirm=document.querySelector('[data-ocr-confirm]');readerModeChangeToken++;qaRetiredConfirm.click();qaRetiredConfirm=null;});
 assert.equal(await page.evaluate(()=>wordPeekOpen()),false,'stale confirmation cannot open lookup');
 await page.evaluate(()=>openPdfWord(originalSession.pages[59],originalSession.wordBoxes.get(60)[0]));
 await page.evaluate(()=>qaTouch('touchstart',[1,2]));
 assert.equal(await page.locator('.pdf-ocr-confirm').count(),0);
 await page.evaluate(()=>{qaTouch('touchend',[]);cancelOriginalPinch();setOriginalZoom(1);});
 await page.evaluate(()=>goPdfPage(60));
 // Draw with the production ink owner, then force only the test OCR cache to
 // miss. The recognizer's image must be byte-identical to the pre-ink raster.
 await page.locator('[data-ink-toggle]').click();
 await page.evaluate(()=>{
  const p=originalSession.pages[59],target=p.querySelector('canvas'),r=p.getBoundingClientRect();
  const touch=x=>({identifier:17,touchType:'stylus',target,clientX:r.left+x*r.width,clientY:r.top+.135*r.height});
  const send=(type,touches,changed)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed}});target.dispatchEvent(e);};
  target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'pen',isPrimary:true,clientX:touch(.1).clientX,clientY:touch(.1).clientY}));
  send('touchstart',[touch(.1)],[touch(.1)]);send('touchmove',[touch(.2)],[touch(.2)]);send('touchmove',[touch(.4)],[touch(.4)]);send('touchend',[],[touch(.4)]);
  target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'pen',isPrimary:true}));
 });
 assert.ok(await page.locator('.pdf-source-page[data-page="60"] .pdf-ink-layer polyline').count()>0);
 await page.locator('[data-ink-toggle]').click();
 await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('breeze-pdf-ocr',1);r.onsuccess=()=>resolve(r.result);});
  await new Promise(resolve=>{const tx=db.transaction('pages','readwrite');tx.objectStore('pages').clear();tx.oncomplete=resolve;});db.close();
  BreezePdfOcr.release(originalSession,60);originalSession.wordBoxes.set(60,[]);BreezePdfOcr.schedule(originalSession);
 });
 await page.waitForFunction(()=>qaStress.calls.length===3);
 assert.equal(await page.evaluate(()=>qaStress.calls[1].hash),await page.evaluate(()=>qaStress.calls[2].hash),'live ink must not enter OCR input');
 console.log('OCR browser stress: misread confirmation and live ink exclusion passed');
 await page.evaluate(()=>{qaStress.calls[2].resolve();qaStress.auto=true;});
 await page.waitForFunction(()=>originalSession.wordBoxes.get(60)?.length===2);
 // A real failure leaves page navigation/zoom available and retries once only
 // when tapped. Subsequent work uses the same global lane.
 await page.evaluate(()=>{qaStress.failNext=true;});await page.evaluate(()=>goPdfPage(59));
 await page.waitForFunction(()=>originalSession.pages[58].dataset.ocr==='failed');
 const failureCount=await page.evaluate(()=>qaStress.calls.length);
 await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>qaStress.calls.length),failureCount);
 await page.evaluate(()=>{setOriginalZoom(1.2);BreezePdfOcr.tap(originalSession,59);});
 await page.waitForFunction(()=>originalSession.wordBoxes.get(59)?.length===2);
 assert.equal(await page.evaluate(()=>qaStress.calls.length),failureCount+1);
 await page.evaluate(()=>setOriginalZoom(1));
 const memory=[];let cdp;
 if(engine==='chromium')cdp=await context.newCDPSession(page);
 const sample=async phase=>{
  const state=await page.evaluate(async()=>({cachePages:await qaCacheCount(),liveWords:[...originalSession.wordBoxes.values()].reduce((n,a)=>n+a.length,0),
   canvasPixels:[...document.querySelectorAll('.pdf-source-page canvas')].reduce((n,c)=>n+c.width*c.height,0),active:qaStress.active}));
  assert.ok(state.cachePages<=48);assert.ok(state.canvasPixels<=30*1024*1024,JSON.stringify(state));
  if(cdp){await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage'),dom=await cdp.send('Memory.getDOMCounters');Object.assign(state,{usedJSHeapBytes:heap.usedSize,...dom});}
  memory.push({phase,...state});
 };
 for(let pass=0;pass<2;pass++){
  for(let n=1;n<=56;n++){
   await page.evaluate(n=>goPdfPage(n),n);
   await page.waitForFunction(n=>originalSession.wordBoxes.get(n)?.length===2,n);
   if(n%14===0)await sample(`pass-${pass+1}-page-${n}`);
  }
  console.log(`OCR browser stress: completed cache pass ${pass+1}`);
 }
 // Browser offline means dictionary/network unavailable, but an already cached
 // page remains tappable. Use the bundled worker bytes through PDF.js's real
 // workerPort API, like Capacitor's network-independent local assets. Playwright
 // offline mode can block HTTP worker loading even when a page route fulfills
 // it (WebKit failed before reader presentation). No PDF parsing is mocked.
 // This is not a web/PWA offline-cache claim.
 const worker=new URL('../../assets/lib/pdf-3.11.174.worker.min.js',import.meta.url);
 await page.evaluate(async source=>{
  window.qaLocalWorkerUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  window.qaLocalWorker=new Worker(qaLocalWorkerUrl);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Bundled PDF worker did not become ready before going offline')),10000);
   const ready=event=>{if(event.data?.action==='ready'){clearTimeout(timer);qaLocalWorker.removeEventListener('message',ready);resolve();}};
   qaLocalWorker.addEventListener('message',ready);
   qaLocalWorker.addEventListener('error',event=>{clearTimeout(timer);reject(Error(event.message||'Bundled PDF worker startup failed'));},{once:true});
  });
  pdfjsLib.GlobalWorkerOptions.workerPort=qaLocalWorker;
 },readFileSync(worker,'utf8'));
 await context.setOffline(true);
 const offlineSource=await page.evaluate(async()=>{
  const record=await originalGetForBook(curBook);
  return {online:navigator.onLine,storedSize:record?.blob?.size,readBytes:(await record.blob.arrayBuffer()).byteLength};
 });
 console.log('Offline source bytes and prepared worker',offlineSource);
 assert.equal(offlineSource.online,false);assert.equal(offlineSource.readBytes,offlineSource.storedSize);
 const beforeOffline=await page.evaluate(()=>qaStress.calls.length);
 await page.evaluate(async()=>{const b=curBook;leaveOriginalReader();await openBook(b);await switchReaderMode('original');});
 try{
  await page.waitForFunction(()=>!readerPositionPending()&&!originalPdfPaintPaused());
  await page.evaluate(()=>goPdfPage(56));
  await page.waitForFunction(()=>originalSession.wordBoxes.get(56)?.length===2);
 }catch(error){console.log('Offline reopen diagnostic',await page.evaluate(async()=>({readerError:document.querySelector('#original-content .original-empty')?.textContent,pending:readerPositionPending(),paused:originalPdfPaintPaused(),mode:currentReaderMode,presented:originalSession?.presented,visible:originalSession?pdfPagesInView(originalSession):[],page:originalSession?.navigationPage,status:originalSession?.pages?.[55]?.dataset.ocr,wordCount:originalSession?.wordBoxes?.get(56)?.length,cache:await qaCacheCount(),calls:qaStress.calls.slice(-3).map(({page,book})=>({page,book})),current:currentPdfSession()})));throw error;}
 assert.equal(await page.evaluate(()=>qaStress.calls.length),beforeOffline);
 await context.setOffline(false);
 for(let i=0;i<8;i++){
  await page.evaluate(async()=>{const b=curBook;leaveOriginalReader();await openBook(b);await switchReaderMode('original');});
  await page.waitForFunction(()=>!readerPositionPending()&&!originalPdfPaintPaused());
  await page.evaluate(()=>goPdfPage(56));
  await page.waitForFunction(()=>originalSession.wordBoxes.get(56)?.length===2);
 }
 await sample('after-eight-reopens');
 // The current document still owns the real worker; browser-context teardown
 // releases it after this test, rather than terminating a live PDF mid-read.
 await page.evaluate(()=>{pdfjsLib.GlobalWorkerOptions.workerPort=null;URL.revokeObjectURL(qaLocalWorkerUrl);});
 assert.equal(await page.evaluate(()=>qaStress.peak),1);
 assert.equal(await page.evaluate(()=>wordPeekOpen()),false);
 const report={native:'controlled bridge responses, not accuracy',pages:60,rapidNavigationIntents:6,cachePasses:2,reopens:9,
  nativeCalls:await page.evaluate(()=>qaStress.calls.length),maximumConcurrentNative:1,liveInkExcluded:true,
  highConfidenceMisreadRequiresExplicitConfirmation:true,memory,
  memoryLimit:'CDP JS heap/DOM only on Chromium, excludes GPU/native memory; bounded samples are not a leak proof'};
 const out=process.env.BREEZE_OCR_STRESS_OUTPUT||'/tmp/breeze-ocr-browser-stress';mkdirSync(out,{recursive:true});writeFileSync(`${out}/${engine}.json`,JSON.stringify(report,null,2)+'\n');
 await cdp?.detach();return report;
}
