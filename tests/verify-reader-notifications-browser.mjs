import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'Notices.txt',mimeType:'text/plain',buffer:Buffer.from(('A gentle breeze moves through the trees. Reading can feel this easy.\n\n').repeat(80))});
 await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='txt'));readerNotices.reset();});
 const notice=page.locator('#reader-notice');
 const original=await page.locator('#readpill-title').textContent();
 const geometry=()=>page.locator('#reader-scroll').evaluate(e=>({width:e.clientWidth,top:e.scrollTop}));
 const before=await geometry();
 await page.evaluate(()=>{beginSentenceWaiting();toast('First saved');toast('First saved');miniToast('Second saved');});
 await page.waitForTimeout(800);assert.equal(await notice.isVisible(),false);
 assert.equal(await page.locator('#toast').evaluate(e=>e.classList.contains('on')),false);
 await page.evaluate(()=>closeSentence());
 await notice.waitFor({state:'visible'});assert.equal(await notice.textContent(),'First saved');
 assert.equal(await page.locator('#readpill-title').textContent(),original);
 assert.deepEqual(await geometry(),before);
 // An asynchronous lookup interrupts an already-visible notice before paint.
 await page.evaluate(()=>beginSentenceWaiting());
 await notice.waitFor({state:'hidden'});
 await page.evaluate(()=>{sentenceView='sheet';sentenceWaitingControls(false);document.getElementById('sentence-modal').hidden=false;});
 await page.waitForTimeout(800);assert.equal(await notice.isVisible(),false);
 await page.evaluate(()=>closeSentence());
 await notice.waitFor({state:'visible'});assert.equal(await notice.textContent(),'First saved');
 await page.waitForFunction(()=>document.getElementById('reader-notice').textContent==='Second saved');
 // Aa user input preempts without stealing the action or leaving a stale title.
 await page.locator('#aafab').click();assert.equal(await notice.isVisible(),false);
 await page.waitForTimeout(800);assert.equal(await notice.isVisible(),false);
 await page.evaluate(()=>closeAa());await notice.waitFor({state:'visible'});
 assert.equal(await notice.textContent(),'Second saved');
 await page.evaluate(()=>{readerNotices.reset();document.getElementById('panel').classList.add('on');toast('Word wait');});
 await page.waitForTimeout(800);assert.equal(await notice.isVisible(),false);
 await page.evaluate(()=>document.getElementById('panel').classList.remove('on'));await notice.waitFor({state:'visible'});
 await page.evaluate(()=>{readerNotices.reset();pinReaderChrome(true,'restore');toast('Restoring');});
 await page.waitForTimeout(800);assert.equal(await notice.isVisible(),false);
 await page.evaluate(()=>pinReaderChrome(false,'restore'));await notice.waitFor({state:'visible'});
 // Compact pill remains clickable and no notification moves the reading surface.
 await page.evaluate(()=>{readerNotices.reset();chromeHoldUntil=0;setReaderChrome(true);toast('스크롤 중 저장했어요');});
 await notice.waitFor({state:'visible'});await page.waitForTimeout(400);
 const box=await page.locator('#readpill').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
 await page.locator('#readpill-title').click();
 assert.equal(await page.evaluate(()=>document.body.classList.contains('chrome-hidden')),false);
 await page.evaluate(()=>{readerNotices.reset();toast('Scroll keeps this');document.getElementById('reader-scroll').scrollTop=600;});
 await notice.waitFor({state:'visible'});assert.equal(await notice.textContent(),'Scroll keeps this');
 await page.evaluate(()=>{toast('Old session');show('home');});assert.equal(await notice.isVisible(),false);
 await page.evaluate(()=>toast('Home notice'));assert.equal(await page.locator('#toast').textContent(),'Home notice');
 await page.evaluate(async()=>openBook(books.find(b=>b.kind==='txt')));
 await page.waitForTimeout(800);assert.equal(await notice.isVisible(),false);
 assert.equal(await page.locator('#toast').evaluate(e=>e.classList.contains('on')),false);
 // Queue bounds, deduplication, expiry and background suppression under a fake wall clock.
 await page.evaluate(()=>{readerNotices.reset();window.noticeRealNow=Date.now;window.noticeNow=Date.now();Date.now=()=>window.noticeNow;beginSentenceWaiting();for(let i=0;i<25;i++)toast('Queued '+i);closeSentence();});
 await notice.waitFor({state:'visible'});assert.equal(await notice.textContent(),'Queued 5');
 await page.evaluate(()=>{window.noticeNow+=61000;});await notice.waitFor({state:'hidden'});
 await page.evaluate(()=>{Date.now=window.noticeRealNow;readerNotices.reset();Object.defineProperty(document,'hidden',{configurable:true,value:true});toast('Background');});
 await page.waitForTimeout(800);assert.equal(await notice.isVisible(),false);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await notice.waitFor({state:'visible'});
 await page.evaluate(()=>{readerNotices.reset();toast('<img src=x onerror=alert(1)>');});
 await notice.waitFor({state:'visible'});assert.equal(await notice.locator('img').count(),0);
 assert.deepEqual(errors,[]);
 console.log(engine.name()+': Reader notice FIFO, interruption/resume, lookup/dialog/restore priority, scroll, compact controls, exit, bounds, expiry and visibility passed.');
 }finally{await browser.close();}
}
await new Promise(done=>server.close(done));
