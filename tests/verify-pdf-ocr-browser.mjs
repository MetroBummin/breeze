/* Real PDF.js, raster/IndexedDB, hit-test and lookup; native recognition is a
   controlled bridge double. Does not measure Vision/ML Kit accuracy or latency. */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {scanPdf} from './helpers/pdf-scan-fixture.mjs';
import {stressPdfOcrBrowser} from './helpers/pdf-ocr-browser-stress.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`,engine=process.env.BROWSER==='webkit'?webkit:chromium;
const profile=mkdtempSync(resolve(tmpdir(),'breeze-ocr-')),errors=[],external=[];
let browser,lookupAllowed=false;const prematureLookups=[];
const waitForMeaning=page=>page.waitForFunction(()=>{
 const node=document.getElementById('word-peek'),meaning=document.getElementById('word-peek-meaning');
 if(!node||!meaning)return false;
 const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
 return wordPeekOpen()&&!wordPeekPending()&&!node.hidden&&style.visibility!=='hidden'&&style.display!=='none'
  &&rect.width>0&&rect.height>0&&meaning.textContent.trim()==='밝은';
});
try{
 browser=await engine.launchPersistentContext(profile,{headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,viewport:{width:820,height:1180},serviceWorkers:'block'});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(/pdf|worker/i.test(message.text()))console.log('PDF browser diagnostic:',message.text());});
 page.on('requestfailed',request=>{if(request.url().includes('pdf-3.11.174.worker'))console.log('Bundled worker request failed:',request.failure());});
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
 // WebKit routes blob: reads as well. Only intercept network protocols so
 // offline emulation does not turn local IndexedDB Blob reads into requests.
 // https://github.com/microsoft/playwright/issues/42727
 await page.route(/^https?:\/\//,route=>{const u=route.request().url();
  if(u.startsWith(url))return route.continue();
  if(/functions\/v1\/dict(?:[?\/]|$)/.test(u)){
   const input=route.request().postDataJSON()||{};
   if(input.op==='warm')return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
   if(!lookupAllowed)prematureLookups.push(u);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'word',canonical:'bright',lemma:'bright',members:[input.clickedIndex],ko:'밝은',left:10,lookupId:input.lookupId})});
  }
  external.push(u);return route.abort();
 });
 await page.goto(url+'index.html');
 await page.evaluate(()=>{
  // Isolate reader scheduling here; full book scheduling has its own real
  // import/cache/UI/browser test rather than changing this controlled bridge.
  BreezePdfOcrLibrary.track=()=>null;BreezePdfOcrLibrary.restore=()=>{};
  BreezePdfOcrLibrary.mount=()=>{};
  window.qaOcrCalls=[];window.qaOcrStatus=[];window.qaOcrResult=[{word:'Bright',line:0,x:.1,y:.12,w:.12,h:.03,confidence:.99},{word:'world',line:0,x:.24,y:.12,w:.1,h:.03,confidence:.99}];
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',isPluginAvailable:name=>name==='BreezePdfOcr',
   registerPlugin:()=>({recognize:({image,requestId})=>new Promise((resolve,reject)=>qaOcrCalls.push({image,requestId,resolve,reject})),
    getStatus:({requestId})=>new Promise(resolve=>qaOcrStatus.push({requestId,resolve}))})};
 });
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,600,800);g.font='24px sans-serif';g.fillStyle='black';g.fillText('Bright world',60,116);return c.toDataURL('image/jpeg',.98).split(',')[1];});
 await page.locator('#fileinput').setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:scanPdf(jpeg)});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'),null,{timeout:30000});
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForFunction(()=>qaOcrCalls.length===1,null,{timeout:30000});
 assert.equal(await page.evaluate(()=>originalSession.wordBoxes.get(1).length),0,'fixture has no text layer');
 // Decode the actual page raster independently: no ink overlay, correct dimensions.
 assert.deepEqual(await page.evaluate(async()=>{const i=new Image();i.src='data:image/png;base64,'+qaOcrCalls[0].image;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);const p=g.getImageData(110,180,190,65).data;let dark=0;for(let j=0;j<p.length;j+=4)if(p[j]<100)dark++;return {width:i.width,height:i.height,hasText:dark>100};}),{width:1200,height:1600,hasText:true});
 for(let i=0;i<4;i++)await page.evaluate(async()=>{const r=originalSession.pages[0].getBoundingClientRect();await openPdfWordAt(r.left+r.width*.15,r.top+r.height*.135);});
 assert.equal(await page.evaluate(()=>qaOcrCalls.length),1,'pending repeated taps do not enqueue OCR');
 await page.evaluate(()=>qaOcrCalls[0].resolve({words:qaOcrResult}));
 await page.waitForFunction(()=>originalSession.pages[0].dataset.ocr==='ready');
 await page.evaluate(()=>{
  words={bright:{word:'Bright',clicked:'Bright',forms:['bright'],status:1,mark:true,ko:'밝은',defs:[],kodict:[],ai:{ko:'밝은',done:true},addedAt:1,up:1}};
  window.qaOcrBoxes=originalSession.wordBoxes.get(1);refreshPdfSavedWords(originalSession);
 });
 for(const size of [{width:390,height:844},{width:820,height:1180},{width:1440,height:1000},{width:844,height:390},{width:320,height:568}]){
  await page.setViewportSize(size);
  for(const dark of [false,true]){
   await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
   for(const zoom of [1,1.5,2.5]){
    const check=await page.evaluate(z=>{
     originalZoomLevel=z;applyOriginalZoomTransform();readerScrollTo(0);
     const p=originalSession.pages[0],r=p.getBoundingClientRect(),b=originalSession.wordBoxes.get(1)[0];
     const marker=p.querySelector('.original-saved-marker').getBoundingClientRect();
     return {word:pdfWordAtPoint(p,r.left+(b.x+b.w/2)*r.width,r.top+(b.y+b.h/2)*r.height)?.word,
      error:Math.max(Math.abs(marker.left-(r.left+b.x*r.width)),Math.abs(marker.top-(r.top+b.y*r.height))),same:qaOcrBoxes===originalSession.wordBoxes.get(1)};
    },zoom);
    assert.equal(check.word,'Bright');assert.ok(check.same);assert.ok(check.error<.2,JSON.stringify({size,dark,zoom,check}));
    if(zoom===1){
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     await page.waitForFunction(()=>!readerPositionPending()&&!originalPdfPaintPaused()&&!pdfScrollBusy(originalSession));
     await page.evaluate(()=>openPdfWord(originalSession.pages[0],originalSession.wordBoxes.get(1)[0]));
     await waitForMeaning(page);
     assert.equal(await page.locator('.pdf-ocr-confirm').count(),0,'OCR uses the existing one-tap meaning surface');
     const geometry=await page.locator('#word-peek').evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,dark:document.body.classList.contains('dark')};});
     assert.equal(geometry.dark,dark);assert.ok(geometry.left>=0&&geometry.top>=0&&geometry.right<=geometry.width&&geometry.bottom<=geometry.height,JSON.stringify(geometry));
     const proof='/tmp/breeze-ocr-confirm';mkdirSync(proof,{recursive:true});
     await page.screenshot({path:`${proof}/${engine.name()}-${size.width}x${size.height}-${dark?'dark':'light'}.png`});
     await page.evaluate(()=>closePanel());
    }
   }
  }
 }
 await page.setViewportSize({width:820,height:1180});
 await page.evaluate(()=>{originalZoomLevel=1;applyOriginalZoomTransform();readerScrollTo(0);});
 for(let i=0;i<3;i++){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(()=>!readerPositionPending()&&!originalPdfPaintPaused()&&!pdfScrollBusy(originalSession));
  lookupAllowed=true;
  await page.evaluate(async()=>{const p=originalSession.pages[0],r=p.getBoundingClientRect(),b=originalSession.wordBoxes.get(1)[0];await openPdfWordAt(r.left+(b.x+b.w/2)*r.width,r.top+(b.y+b.h/2)*r.height);});
  assert.equal(await page.locator('.pdf-ocr-confirm').count(),0,'first and repeated taps need no spelling confirmation');
  await waitForMeaning(page);await page.evaluate(()=>closePanel());
 }
 lookupAllowed=true;
 for(let i=0;i<2;i++){
  await page.evaluate(()=>openPdfWord(originalSession.pages[0],originalSession.wordBoxes.get(1)[1]));
  await waitForMeaning(page);
  assert.equal(await page.locator('.pdf-ocr-confirm').count(),0,'another occurrence also opens directly');
  await page.evaluate(()=>closePanel());
 }
 await page.evaluate(()=>{
  originalSession.wordBoxes.set(1,originalSession.wordBoxes.get(1).map(b=>({...b})));
  openPdfWord(originalSession.pages[0],originalSession.wordBoxes.get(1)[0]);
 });
 await waitForMeaning(page);
 assert.equal(await page.locator('.pdf-ocr-confirm').count(),0,'current replacement boxes open directly');
 await page.evaluate(()=>closePanel());
 // Reopen consumes durable results; eviction consumes cache without native rerun.
 await page.evaluate(async()=>{const b=curBook;leaveOriginalReader();await renderOriginalBook(b,await originalGetForBook(b));});
 await page.waitForFunction(()=>originalSession?.wordBoxes.get(1)?.length===2);
 assert.equal(await page.evaluate(()=>qaOcrCalls.length),1);
 await page.evaluate(()=>openPdfWord(originalSession.pages[0],originalSession.wordBoxes.get(1)[0]));
 await waitForMeaning(page);
 assert.equal(await page.locator('.pdf-ocr-confirm').count(),0,'cache reopen uses one-tap lookup');
 await page.evaluate(()=>closePanel());
 await page.evaluate(async()=>{releaseOriginalPdfPage(originalSession,1);await renderOriginalPdfPage(originalSession,1);});
 await page.waitForFunction(()=>originalSession?.wordBoxes.get(1)?.length===2);
 assert.equal(await page.evaluate(()=>qaOcrCalls.length),1);
 // Local cache is deleted with the document assets.
 await page.evaluate(async()=>BreezePdfOcr.forget(curBook));
 assert.equal(await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('breeze-pdf-ocr',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});return await new Promise(resolve=>{const rq=db.transaction('pages').objectStore('pages').count();rq.onsuccess=()=>{resolve(rq.result);db.close();};});}),0);
 // Intrinsic /Rotate is baked into the raster once. Native top-left boxes
 // must not receive a second rotation in the lookup map.
 const rotated=scanPdf(jpeg,{rotation:90}).toString('base64');
 const openFixture=async(id,pdf)=>page.evaluate(async({id,pdf})=>{
  const blob=new Blob([Uint8Array.from(atob(pdf),c=>c.charCodeAt(0))],{type:'application/pdf'});
  curBook={...curBook,id,original:{hash:id},sourceHash:id};
  await renderOriginalBook(curBook,{kind:'pdf',hash:id,blob});
 },{id,pdf});
 await openFixture('rotated-scan',rotated);
 await page.waitForFunction(()=>qaOcrCalls.length===2);
 assert.deepEqual(await page.evaluate(async()=>{const i=new Image();i.src='data:image/png;base64,'+qaOcrCalls[1].image;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);const p=g.getImageData(1350,110,70,300).data;let dark=0;for(let j=0;j<p.length;j+=4)if(p[j]<100)dark++;return {width:i.width,height:i.height,hasText:dark>100};}),{width:1600,height:1200,hasText:true});
 await page.evaluate(()=>qaOcrCalls[1].resolve({words:qaOcrResult.map(w=>({...w,x:1-w.y-w.h,y:w.x,w:w.h,h:w.w}))}));
 await page.waitForFunction(()=>originalSession.wordBoxes.get(1)?.length===2);
 assert.equal(await page.evaluate(()=>{const p=originalSession.pages[0],r=p.getBoundingClientRect(),b=originalSession.wordBoxes.get(1)[0];return pdfWordAtPoint(p,r.left+(b.x+b.w/2)*r.width,r.top+(b.y+b.h/2)*r.height)?.word;}),'Bright');
 // Close/reopen while a native request is pending: keep the global lane and
 // discard its late result, even though both documents have page number 1.
 await openFixture('interrupted-scan',rotated);
 await page.waitForFunction(()=>qaOcrCalls.length===3);
 await page.evaluate(()=>{window.qaOldOcrSession=originalSession;leaveOriginalReader();});
 await openFixture('new-scan',rotated);
 assert.equal(await page.evaluate(()=>qaOcrCalls.length),3);
 await page.evaluate(()=>qaOcrCalls[2].resolve({words:[{...qaOcrResult[0],word:'Stale'}]}));
 await page.waitForFunction(()=>qaOcrCalls.length===4);
 assert.equal(await page.evaluate(()=>originalSession.wordBoxes.get(1).length),0);
 assert.equal(await page.evaluate(()=>qaOldOcrSession.wordBoxes.get(1).length),0);
 await page.evaluate(()=>qaOcrCalls[3].resolve({words:[{...qaOcrResult[0],word:'Current'}]}));
 await page.waitForFunction(()=>originalSession.wordBoxes.get(1)?.[0]?.word==='Current');
 // A lost native response uses the real configured deadline. It must not trap
 // cached documents, or permit another recognizer without completion evidence.
 await openFixture('hung-native-scan',rotated);
 await page.waitForFunction(()=>qaOcrCalls.length===5);
 await page.waitForFunction(()=>originalSession.pages[0].dataset.ocr==='failed',null,{timeout:35000});
 await openFixture('new-scan',rotated);
 await page.waitForFunction(()=>originalSession.wordBoxes.get(1)?.[0]?.word==='Current');
 assert.equal(await page.evaluate(()=>qaOcrCalls.length),5,'cached words work while native response remains pending');
 await openFixture('blocked-native-scan',rotated);
 await page.waitForFunction(()=>originalSession.pages[0].dataset.ocr==='blocked');
 await page.waitForFunction(()=>!originalPdfPaintPaused()&&!pdfScrollBusy(originalSession));
 await page.evaluate(()=>{for(let i=0;i<8;i++)BreezePdfOcr.tap(originalSession,1);});
 assert.equal(await page.evaluate(()=>qaOcrStatus.length),1);
 assert.equal(await page.evaluate(()=>qaOcrStatus[0].requestId===qaOcrCalls[4].requestId),true);
 await page.evaluate(()=>qaOcrStatus[0].resolve({finished:false}));
 for(const size of [{width:390,height:844},{width:820,height:1180},{width:1440,height:1000},{width:844,height:390},{width:320,height:568}]){
  await page.setViewportSize(size);
  for(const dark of [false,true]){
   await page.waitForFunction(()=>!originalPdfPaintPaused()&&!pdfScrollBusy(originalSession));
   await page.evaluate(dark=>{darkMode=dark;applyDark();readerNotices.reset();BreezePdfOcr.tap(originalSession,1);},dark);
   await page.evaluate(()=>qaOcrStatus.at(-1).resolve({finished:false}));
   await page.locator('#reader-notice').filter({hasText:'앱 완전 종료 후 다시 열기'}).waitFor({state:'visible'});
   const notice=await page.locator('#reader-notice').evaluate(n=>({height:n.clientHeight,scroll:n.scrollHeight,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,width:innerWidth}));
   assert.ok(notice.scroll<=notice.height+1&&notice.left>=0&&notice.right<=notice.width,JSON.stringify({size,dark,notice}));
   await page.screenshot({path:`/tmp/breeze-ocr-confirm/${engine.name()}-recovery-${size.width}x${size.height}-${dark?'dark':'light'}.png`});
  }
 }
 assert.equal(await page.evaluate(()=>qaOcrCalls.length),5,'uncertain native completion never releases admission');
 await page.evaluate(()=>{readerNotices.reset();BreezePdfOcr.tap(originalSession,1);});
 await page.evaluate(()=>qaOcrStatus.at(-1).resolve({finished:true}));
 await page.waitForFunction(()=>qaOcrCalls.length===6);
 await page.evaluate(()=>qaOcrCalls[4].resolve({words:[{...qaOcrResult[0],word:'Expired'}]}));
 assert.equal(await page.evaluate(()=>originalSession.wordBoxes.get(1).length),0);
 await page.evaluate(()=>qaOcrCalls[5].resolve({words:[{...qaOcrResult[0],word:'Recovered'}]}));
 await page.waitForFunction(()=>originalSession.wordBoxes.get(1)?.[0]?.word==='Recovered');
 const recovery={deadline:true,cachedReopenDuringPending:true,noOverlapWithoutReceipt:true,matchingReceiptRetry:true,expiredResponseDiscarded:true,noticeViewportThemes:10,native:'controlled responses'};
 const recoveryOut=process.env.BREEZE_OCR_STRESS_OUTPUT||'/tmp/breeze-ocr-browser-stress';mkdirSync(recoveryOut,{recursive:true});
 writeFileSync(`${recoveryOut}/${engine.name()}-recovery.json`,JSON.stringify(recovery,null,2)+'\n');
 console.log('OCR response recovery passed:',JSON.stringify(recovery));
 lookupAllowed=false;
 const stress=await stressPdfOcrBrowser({page,context:browser,engine:engine.name(),jpeg,openFixture,scanPdf});
 assert.deepEqual(errors,[]);
 assert.deepEqual(prematureLookups,[],'OCR must not itself request lookup');
 console.log(JSON.stringify({engine:engine.name(),passed:true,geometryCases:30,stress,native:'mocked',network:'external requests blocked',unverified:'Vision/ML Kit accuracy and physical gestures'}));
}finally{await browser?.close();rmSync(profile,{recursive:true,force:true});await new Promise(r=>server.close(r));}
