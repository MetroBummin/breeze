/* Complementary characterization. Does not replace or modify setOffline tests.
   navigator.onLine remains true. Native recognition is controlled, not measured. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
const label=process.argv[2];
assert.ok(['baseline','candidate'].includes(label));
const root=resolve(process.env.GITHUB_WORKSPACE||process.cwd(),'subjects',label);
const out=join(process.env.BREEZE_BLOB_PROOF||'/tmp/breeze-offline-blob-proof',label,'http-denied-reopen');mkdirSync(out,{recursive:true});
const {webkit}=createRequire(join(root,'package.json'))('playwright');
const {scanPdf}=await import(pathToFileURL(join(root,'tests/helpers/pdf-scan-fixture.mjs')));
const report={subject:label,sha:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),claim:'HTTP(S)-denied cached PDF reopen; not offline state or iOS airplane mode',passed:false,native:'controlled bridge responses',onlineStateOverridden:false,blocked:[],serverProbes:[],externalFixture:[],errors:[]};
const save=()=>writeFileSync(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://local');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/qa-network-probe'){report.serverProbes.push(url.search);res.setHeader('Content-Type','text/plain');res.end('HTTP transport alive');return;}
 const path=resolve(root,'.'+url.pathname);
 if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const external='https://network-control.breeze.invalid/qa-network-probe';
const profile=mkdtempSync(join(tmpdir(),'breeze-http-denied-'));
let context,page,denyInstalled=false,phase='setup';
const pattern=/^https?:\/\//;
const deny=route=>{const url=route.request().url();report.blocked.push({phase,url,method:route.request().method()});return route.abort('internetdisconnected');};
try{
 context=await webkit.launchPersistentContext(profile,{headless:true,viewport:{width:820,height:1180},serviceWorkers:'block'});
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 // Earlier handler owns normal local assets and explicit external fixtures.
 // The later denial handler must preempt this, not share or rewrite its state.
 await page.route(pattern,route=>{
  const url=route.request().url();
  if(url.startsWith(origin+'/'))return route.continue();
  if(url.startsWith(external)){report.externalFixture.push({phase,url});return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'text/plain',body:'HTTPS fixture alive'});}
  if(/functions\/v1\/dict(?:[?\/]|$)/.test(url))return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
  return route.abort();
 });
 await page.goto(origin+'/index.html');await page.evaluate(()=>homeReady);
 await page.evaluate(()=>{
  BreezePdfOcrLibrary.track=()=>null;BreezePdfOcrLibrary.restore=()=>{};BreezePdfOcrLibrary.mount=()=>{};
  window.qaReopen={calls:0,denyNative:false,onlineEvents:[],words:[{word:'Bright',line:0,x:.1,y:.12,w:.12,h:.03,confidence:.99},{word:'world',line:0,x:.24,y:.12,w:.1,h:.03,confidence:.99}]};
  addEventListener('online',()=>qaReopen.onlineEvents.push('online'));addEventListener('offline',()=>qaReopen.onlineEvents.push('offline'));
  const bridge={async recognize(){qaReopen.calls++;if(qaReopen.denyNative)throw Error('Diagnostic forbids new recognition during cached reopen');return {words:qaReopen.words};}};
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios',isPluginAvailable:name=>name==='BreezePdfOcr',Plugins:{BreezePdfOcr:bridge}};
 });
 const jpeg=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;const g=canvas.getContext('2d');g.fillStyle='white';g.fillRect(0,0,600,800);g.fillStyle='black';g.font='24px sans-serif';g.fillText('Bright world',60,116);return canvas.toDataURL('image/jpeg',.98).split(',')[1];});
 await page.locator('#fileinput').setInputFiles({name:'HTTP-denied-sixty-page-scan.pdf',mimeType:'application/pdf',buffer:scanPdf(jpeg,{pages:60})});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForFunction(()=>!readerPositionPending()&&!originalPdfPaintPaused());
 await page.evaluate(()=>setPdfReadDirection('horizontal'));
 for(const n of [1,56]){await page.evaluate(n=>goPdfPage(n),n);await page.waitForFunction(n=>originalSession.wordBoxes.get(n)?.length===2,n);}
 const snapshot=()=>page.evaluate(async()=>{
  const record=await originalGetForBook(curBook),bytes=await record.blob.arrayBuffer();
  const cache=await BreezePdfOcr.completed(curBook),page=originalSession.pages[55],canvas=page.querySelector('canvas');
  const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let dark=0,opaque=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3])opaque++;if(data[i+3]&&data[i]<100&&data[i+1]<100&&data[i+2]<100)dark++;}
  return {online:navigator.onLine,sourceBytes:bytes.byteLength,storedSize:record.blob.size,freshBytes:(await new Blob(['local control']).arrayBuffer()).byteLength,bookId:curBook.id,hash:record.hash,pages:originalSession.pdf.numPages,visible:pdfPagesInView(originalSession),words:originalSession.wordBoxes.get(56).map(w=>w.word),cachedPages:[...cache].sort((a,b)=>a-b),nativeCalls:qaReopen.calls,canvas:{width:canvas.width,height:canvas.height,dark,opaque},readerError:document.querySelector('#original-content .original-empty')?.textContent||null,onlineEvents:qaReopen.onlineEvents};
 });
 await page.waitForFunction(()=>originalSession.settled.has(56)&&!readerPositionPending());
 report.before=await snapshot();assert.equal(report.before.online,true);assert.ok(report.before.cachedPages.includes(56));
 const probe=async mark=>page.evaluate(async({http,https})=>{
  const read=async url=>{try{const response=await fetch(url,{cache:'no-store'});return {ok:response.ok,text:await response.text()};}catch(error){return {error:error.name,message:error.message};}};
  return {http:await read(http),https:await read(https),online:navigator.onLine};
 },{http:origin+'/qa-network-probe?'+mark,https:external+'?'+mark});
 phase='before';report.transportBefore=await probe('before');assert.equal(report.transportBefore.http.text,'HTTP transport alive');assert.equal(report.transportBefore.https.text,'HTTPS fixture alive');
 // Prepare real bundled worker before denial, matching the original test's
 // network-independent workerPort setup. No parser or local Blob is mocked.
 await page.evaluate(async source=>{
  window.qaHttpWorkerUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));window.qaHttpWorker=new Worker(qaHttpWorkerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Bundled worker failed to start')),10000);const ready=e=>{if(e.data?.action==='ready'){clearTimeout(timer);qaHttpWorker.removeEventListener('message',ready);resolve();}};qaHttpWorker.addEventListener('message',ready);qaHttpWorker.addEventListener('error',e=>{clearTimeout(timer);reject(Error(e.message));},{once:true});});
  pdfjsLib.GlobalWorkerOptions.workerPort=qaHttpWorker;
 },readFileSync(join(root,'assets/lib/pdf-3.11.174.worker.min.js'),'utf8'));
 await page.route(pattern,deny);denyInstalled=true;phase='denied';
 try{
  report.transportDenied=await probe('denied');
  assert.equal(report.transportDenied.online,true,'Network denial must not impersonate navigator offline');
  assert.ok(report.transportDenied.http.error&&report.transportDenied.https.error,'Both real page fetch calls must reject');
  assert.ok(report.blocked.some(r=>r.url===origin+'/qa-network-probe?denied'));
  assert.ok(report.blocked.some(r=>r.url===external+'?denied'));
  assert.ok(!report.serverProbes.includes('?denied'),'Denied HTTP request must not reach server');
  assert.ok(!report.externalFixture.some(r=>r.url===external+'?denied'),'Denial must preempt earlier route fulfillment');
  await page.evaluate(()=>{qaReopen.denyNative=true;window.qaBeforeSession=originalSession;});
  report.localDuringDenial=await page.evaluate(async()=>{const record=await originalGetForBook(curBook);return {online:navigator.onLine,sourceBytes:(await record.blob.arrayBuffer()).byteLength,freshBytes:(await new Blob(['local control']).arrayBuffer()).byteLength};});
  assert.equal(report.localDuringDenial.sourceBytes,report.before.storedSize);assert.equal(report.localDuringDenial.freshBytes,13);
  await page.evaluate(async()=>{const book=curBook;leaveOriginalReader();await openBook(book);await switchReaderMode('original');});
  await page.waitForFunction(()=>!readerPositionPending()&&!originalPdfPaintPaused());
  await page.evaluate(()=>goPdfPage(56));
  await page.waitForFunction(()=>originalSession.wordBoxes.get(56)?.length===2);
  await page.waitForFunction(()=>originalSession.settled.has(56)&&!readerPositionPending());
  report.after=await snapshot();report.newSession=await page.evaluate(()=>originalSession!==qaBeforeSession);
  assert.equal(report.newSession,true);assert.equal(report.after.online,true);
  assert.equal(report.after.sourceBytes,report.before.sourceBytes);assert.equal(report.after.hash,report.before.hash);assert.equal(report.after.bookId,report.before.bookId);
  assert.equal(report.after.pages,60);assert.deepEqual(report.after.words,['Bright','world']);assert.ok(report.after.visible.includes(56));
  assert.deepEqual(report.after.cachedPages,report.before.cachedPages);assert.equal(report.after.nativeCalls,report.before.nativeCalls);
  assert.ok(report.after.canvas.dark>100&&report.after.canvas.opaque>1000,'Real PDF raster must be visible');assert.equal(report.after.readerError,null);
  assert.deepEqual(report.after.onlineEvents,[]);
  await page.screenshot({path:join(out,'network-denied-page-56.png')});
 }finally{
  await page.unroute(pattern,deny);denyInstalled=false;phase='restored';report.denialRemoved=true;
 }
 report.transportRestored=await probe('restored');
 assert.equal(report.transportRestored.http.text,'HTTP transport alive');assert.equal(report.transportRestored.https.text,'HTTPS fixture alive');
 assert.equal(report.transportRestored.online,true);assert.ok(report.serverProbes.includes('?restored'));
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure={name:error.name,message:error.message,stack:error.stack};throw error;}
finally{
 if(denyInstalled){try{await page.unroute(pattern,deny);report.denialRemoved=true;}catch(error){report.cleanupError=error.message;}}
 save();console.log(JSON.stringify(report));await context?.close();rmSync(profile,{recursive:true,force:true});await new Promise(r=>server.close(r));
}
