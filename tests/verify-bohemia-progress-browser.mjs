/* Actual bundled text-only Bohemia: distinguish animated fill from persisted
   progress, including asset preparation and real Home/reopen navigation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=process.env.BREEZE_PROGRESS_ROOT?resolve(process.env.BREEZE_PROGRESS_ROOT)+sep:fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp'})[extname(path)]||'text/plain; charset=utf-8');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_CHROMIUM_PATH:undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let releaseFonts,releaseScene;const fonts=new Promise(r=>releaseFonts=r),scene=new Promise(r=>releaseScene=r);
  await page.route('**/*',async r=>{
   if(!r.request().url().startsWith(url)){await r.abort();return;}
   if(r.request().url().includes('.woff2'))await fonts;
   if(r.request().url().includes('scandal-in-bohemia-03.webp'))await scene;
   await r.continue();
  });
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
  await page.evaluate(()=>openLongReadPreview(LONG_READS.find(r=>r.id==='sherlock-holmes-scandal-in-bohemia')));
  await page.locator('#article-preview .ap-start').click();await page.waitForFunction(()=>!!curBook&&!articlePreviewDialog.open&&!readerPositionPending());
  const id=await page.evaluate(()=>curBook.id),paras=readFileSync(resolve(root,'assets/longreads/scandal-in-bohemia.txt'),'utf8').trim().split('\n\n');
  assert.deepEqual(await page.evaluate(()=>curBook.paras),paras);
  assert.equal(paras.length,261);assert.equal(await page.evaluate(()=>curBook.original),null);
  assert.equal(await page.evaluate(()=>!!curBook.sourceMap),false);assert.equal(await page.evaluate(()=>currentReaderMode),'text');
  assert.equal(await page.locator('#rtext .story-illustration').count(),10);
  assert.equal(await page.evaluate(()=>visibleReaderProgress()),0);
  await page.mouse.move(200,400);
  // Observe the first scroll paint, rather than assuming a timing window from
  // the host's speed. The app's scroll listener schedules its target before us.
  await page.evaluate(()=>{
   window.bohemiaFirstPaint=new Promise(resolve=>readerScroller().addEventListener('scroll',()=>requestAnimationFrame(()=>resolve({raw:readerPillRawProgress,visual:readerPillVisualProgress,fill:document.querySelector('#readpill-progress').style.transform,saved:posOf(curBook.id).p})),{once:true}));
  });
  const target=await page.evaluate(()=>{const el=document.querySelector('#rtext [data-pi="45"]');return readerScrollTop()+el.getBoundingClientRect().top-topInset()-5;});
  await page.mouse.wheel(0,target);
  const first=await page.evaluate(()=>window.bohemiaFirstPaint);
  assert.ok(first.raw>0);assert.ok(first.visual<first.raw,'Reader starts an animation toward the canonical target');
  // Returning before the 800ms writer must still commit the actual position.
  const prepared=await page.evaluate(()=>({p:visibleReaderProgress(),pi:captureAnchor().pi}));
  await page.evaluate(()=>show('home'));
  const early=await page.evaluate(id=>({...posOf(id),home:document.querySelector('#home-resume-percent').textContent}),id);
  assert.equal(early.p,prepared.p);assert.equal(early.pi,prepared.pi);
  assert.equal(early.home,Math.floor(early.p*100)+'%');
  releaseFonts();releaseScene();await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(async id=>openBook(books.find(b=>b.id===id)),id);
  await page.locator('img[src$="scandal-in-bohemia-03.webp"]').evaluate(img=>img.decode());
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>captureAnchor().pi),early.pi);
  console.log(`${engine.name()}: initial paint ${JSON.stringify(first)}; immediate Home ${early.home}; text-only paragraph ${early.pi} reopened`);
  for(const delta of [1600,5000,14000,-7000,100000,-800]){
   const oldTop=await page.evaluate(()=>readerScrollTop());
   await page.mouse.move(200,400);await page.mouse.wheel(0,delta);
   await page.waitForFunction(old=>readerScrollTop()!==old,oldTop);
   await page.waitForFunction(()=>Math.abs(readerPillVisualProgress-readerPillRawProgress)<.001&&readerPillRawProgress===visibleReaderProgress());
   const before=await page.evaluate(()=>({p:visibleReaderProgress(),pi:captureAnchor().pi,dy:captureAnchor().dy,raw:readerPillRawProgress}));
   await page.evaluate(()=>showReaderChrome());await page.locator('#readback').click();await page.waitForFunction(()=>activeAppView()==='home');
   const saved=await page.evaluate(id=>({...posOf(id),home:document.querySelector('#home-resume-percent').textContent}),id);
   assert.equal(saved.p,before.p);assert.equal(saved.pi,before.pi);assert.ok(Math.abs(saved.dy-before.dy)<=1);
   assert.equal(saved.home,Math.floor(saved.p*100)+'%');
   await page.waitForTimeout(900);assert.equal(await page.locator('#home-resume-percent').textContent(),saved.home,'Home is already fresh; waiting does not change it');
   await page.evaluate(async id=>openBook(books.find(b=>b.id===id)),id);await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>captureAnchor().pi),saved.pi);
   assert.ok(Math.abs(await page.evaluate(()=>captureAnchor().dy)-saved.dy)<=1);
   assert.equal(await page.evaluate(()=>visibleReaderProgress()),saved.p);
   console.log(`${engine.name()}: delta ${delta}, canonical/Reader/Home ${saved.home}, paragraph ${saved.pi}, dy ${saved.dy}; ${delta<0?'backwards reading accepted':'position preserved'}`);
  }
  // Local durability must not wait for cloud sign-in or the 800ms scroll timer.
  for(const event of process.env.BREEZE_QA_CASE==='layout'?[]:['visibilitychange','pagehide']){
   await page.mouse.move(200,400);
   await page.evaluate(()=>{window.backgroundScroll=new Promise(resolve=>readerScroller().addEventListener('scroll',()=>requestAnimationFrame(resolve),{once:true}));});
   await page.mouse.wheel(0,-1800);await page.evaluate(()=>window.backgroundScroll);
   const latest=await page.evaluate(()=>({p:readerProgressAtEnd(textProgressForBook(curBook,captureAnchor())),...captureAnchor()}));
   const prior=await page.evaluate(id=>posOf(id).p,id);assert.notEqual(latest.p,prior);
   const committed=await page.evaluate(event=>{
    if(event==='visibilitychange'){Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event(event));delete document.hidden;}
    else window.dispatchEvent(new Event(event));
    return {memory:{...posOf(curBook.id)},durable:JSON.parse(localStorage.getItem(LS_POS))[curBook.id]};
   },event);
   assert.equal(committed.memory.p,latest.p,`${event} must synchronously commit local reading before timer suspension`);
   assert.equal(committed.memory.pi,latest.pi);assert.equal(committed.memory.dy,latest.dy);
   assert.deepEqual(committed.durable,committed.memory);
   console.log(`${engine.name()}: signed-out ${event} immediately persisted ${(prior*100).toFixed(2)}% -> ${(latest.p*100).toFixed(2)}%, paragraph ${latest.pi}`);
  }
  const saved=await page.evaluate(()=>{show('home');return {...posOf(homeResumeBook().id)};});
  await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(async id=>openBook(books.find(b=>b.id===id)),id);
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>captureAnchor().pi),saved.pi);
  await page.evaluate(()=>fontSize(7));await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>captureAnchor().pi),saved.pi);
  await page.evaluate(()=>show('home'));assert.equal(await page.locator('#home-resume-percent').textContent(),Math.floor(saved.p*100)+'%');
  // A real lazy illustration can grow beneath the visible fold without any
  // scroll event. Its next paragraph is the anchor; save must measure its new dy.
  const layoutPage=await context.newPage();let releaseLayout;
  const layoutGate=new Promise(r=>releaseLayout=r);
  await layoutPage.route('**/*',async r=>{if(!r.request().url().startsWith(url)){await r.abort();return;}if(r.request().url().includes('scandal-in-bohemia-03.webp'))await layoutGate;await r.continue();});
  await layoutPage.goto(url);await layoutPage.evaluate(()=>homeReady);await layoutPage.evaluate(()=>{fs=19;document.documentElement.style.setProperty('--fs','19px');});
  await layoutPage.evaluate(async id=>{show('home');positions[id]={p:0,pi:0,dy:257,y:0,t:Date.now(),mode:'text'};await openBook(books.find(b=>b.id===id));},id);
  await layoutPage.evaluate(()=>readerScrollTo(0));
  await layoutPage.mouse.move(200,400);
  await layoutPage.mouse.wheel(0,14000);await layoutPage.waitForFunction(()=>readerScrollTop()>=14000);
  await layoutPage.waitForTimeout(100);
  const beforeImage=await layoutPage.evaluate(()=>({anchor:captureAnchor(),cached:readerFrameAnchor(),top:readerScrollTop()}));
  releaseLayout();await layoutPage.locator('img[src$="scandal-in-bohemia-03.webp"]').evaluate(img=>img.decode());
  await layoutPage.waitForTimeout(100);
  const layout=await layoutPage.evaluate(()=>{const actual=captureAnchor(),cached=readerFrameAnchor();saveReadingState();return {actual,cached,stored:{...posOf(curBook.id)},top:readerScrollTop()};});
  assert.equal(layout.stored.pi,layout.actual.pi);
  assert.equal(layout.stored.dy,layout.actual.dy,'saving after delayed image layout must use the current offset');
  await layoutPage.evaluate(()=>show('home'));await layoutPage.evaluate(async()=>openBook(homeResumeBook()));await layoutPage.waitForTimeout(150);
  assert.deepEqual(await layoutPage.evaluate(()=>captureAnchor()),layout.actual,'Home/reopen must preserve the actual pre-exit paragraph and offset');
  console.log(`${engine.name()}: delayed actual illustration: ${JSON.stringify({beforeImage,...layout})}; actual anchor preserved on Home/reopen`);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
