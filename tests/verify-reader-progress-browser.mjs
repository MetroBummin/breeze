import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

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
const browser=await chromium.launch();

try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await page.goto(url);await page.evaluate(()=>homeReady);
 for(const count of [1,5,70]){
  await page.evaluate(()=>{show('home');readerScroller().style.zoom=''});
  await page.locator('#fileinput').setInputFiles({name:`Progress ${count}.txt`,mimeType:'text/plain',buffer:Buffer.from(('The breeze moves through the trees. We take time to read and enjoy this quiet afternoon.\n\n').repeat(count))});
  await page.waitForFunction(n=>books.some(b=>b.title===`Progress ${n}`),count);
  await page.evaluate(async n=>{setReaderPillProgress(.7,true);await openBook(books.find(b=>b.title===`Progress ${n}`));},count);
  await page.waitForTimeout(150);
  const start=await page.evaluate(()=>({p:visibleReaderProgress(),visual:readerPillVisualProgress,extent:readerContentHeight()-readerViewHeight(),top:readerScrollTop()}));
  assert.equal(await page.locator('#readpill .completion-badge').isVisible(),false);
  assert.equal(start.top,0);assert.equal(start.p,0);assert.equal(start.visual,0);
  if(start.extent>0){
   await page.evaluate(()=>{readerScrollTo((readerContentHeight()-readerViewHeight())/2);updatePfill(true)});
   const middle=await page.evaluate(()=>visibleReaderProgress());assert.ok(middle>0 && middle<1);
   // A fractional CSS scale reproduces integer height vs fractional scrollTop rounding.
   for(const zoom of ['1','1.1','1.25']){
    await page.evaluate(z=>{readerScroller().style.zoom=z;readerScrollTo(readerContentHeight()-readerViewHeight()-3);updatePfill(true)},zoom);
    assert.ok(await page.evaluate(()=>readerProgressAtEnd(.5))<1,'End correction completed before its tolerance');
    await page.evaluate(()=>{readerScrollTo(readerContentHeight());updatePfill(true)});
    assert.equal(await page.evaluate(()=>visibleReaderProgress()),1,`End remained incomplete at zoom ${zoom}`);
    assert.equal(await page.locator('#readpill .completion-badge').isVisible(),true);
   }
   assert.equal(await page.evaluate(()=>visibleReaderProgress()),1);
   assert.equal(await page.locator('#readpill .completion-badge').isVisible(),true);
   await page.evaluate(()=>{saveReadingState();show('home')});
   assert.equal(await page.locator('#home-resume-percent').textContent(),'100%');
   assert.equal(await page.locator('#home-resume .completion-badge').isVisible(),true);
   for(const view of ['casuals','longform']){
    await page.evaluate(v=>show(v),view);
    assert.equal(await page.locator('#nav-vocab').isVisible(),false);
    assert.equal(await page.locator('#nav-home').isVisible(),true);
    await page.locator('#nav-home').click();
    assert.equal(await page.evaluate(()=>activeAppView()),'home');
    assert.equal(await page.locator('#nav-vocab').isVisible(),true);
   }
   await page.evaluate(()=>{positions[homeResumeBook().id].p=.42;renderHomeResume()});
   assert.equal(await page.locator('#home-resume-percent').textContent(),'42%');
   assert.equal(await page.locator('#home-resume .completion-badge').isVisible(),false);
   assert.equal(await page.locator('#home-resume-progress').evaluate(e=>e.style.transform),'scaleX(0.42)');
  }
  console.log(`Article ${count} paragraphs: top=0%, extent=${start.extent}, end checked`);
 }
}finally{await browser.close();await new Promise(done=>server.close(done))}
