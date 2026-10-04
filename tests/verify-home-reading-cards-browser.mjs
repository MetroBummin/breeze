/* Actual bundled Bohemia: retained Home progress and started-story routing. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=process.env.BREEZE_PROGRESS_ROOT?resolve(process.env.BREEZE_PROGRESS_ROOT)+'/':fileURLToPath(new URL('../',import.meta.url));
const story='sherlock-holmes-scandal-in-bohemia',proof=process.env.BREEZE_HOME_READING_PROOF||'/tmp/breeze-home-reading-cards-proof';mkdirSync(proof,{recursive:true});
let downloads=0;
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 if(path.endsWith('/scandal-in-bohemia.txt'))downloads++;
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
async function readerReady(page){
 await page.waitForFunction(()=>curBook&&!readerPositionPending()&&!articlePreviewDialog.open);
 await page.evaluate(()=>document.fonts.ready);
}
async function wheelTo(page,pi){
 const {top,target}=await page.evaluate(pi=>({top:readerScrollTop(),target:Math.round(readerScrollTop()+document.querySelector(`#rtext [data-pi="${pi}"]`).getBoundingClientRect().top-30)}),pi);
 await page.mouse.move(200,400);await page.mouse.wheel(0,target-top);
 await page.waitForFunction(pi=>captureAnchor().pi===pi&&readerPillRawProgress===visibleReaderProgress(),pi);
}
async function homeState(page,id){
 return page.evaluate(id=>({saved:{...posOf(id)},durable:JSON.parse(localStorage.getItem(LS_POS))[id],
  capsule:document.querySelector('#home-resume-percent').textContent,
  label:document.querySelector(`#shelf [data-local-book="${id}"] .prog`)?.textContent,
  sameTile:window.readingCard===document.querySelector(`#shelf [data-local-book="${id}"]`).parentElement,
  sameCover:window.readingCover===document.querySelector(`#shelf [data-local-book="${id}"] img.cover`)}),id);
}
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_CHROMIUM_PATH:undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let releaseScene;const scene=new Promise(resolve=>releaseScene=resolve);
  await page.route('**/*',async route=>{
   const href=route.request().url();if(!href.startsWith(url)&&!href.startsWith('blob:'))return route.abort();
   if(href.includes('scandal-in-bohemia-05.webp'))await scene;
   return route.continue();
  });
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url);await page.evaluate(()=>homeReady);const before=downloads;
  if(process.env.BREEZE_QA_CASE!=='pdf'){
  // Home and Explore unread previews and browser Back/Forward do not commit.
  await page.locator(`#shelf [data-longread-id="${story}"]`).click();await page.keyboard.press('Escape');
  await page.evaluate(()=>show('longform'));
  await page.locator(`#longform-grid [data-longread-id="${story}"]`).click();await page.keyboard.press('Escape');
  await page.goBack();await page.waitForFunction(()=>activeAppView()==='home');
  await page.goForward();await page.waitForFunction(()=>activeAppView()==='longform');
  assert.equal(await page.evaluate(()=>articlePreviewDialog.open),false);
  assert.equal(await page.evaluate(async()=>(await bookAll()).length),0);assert.equal(downloads,before);
  await page.locator(`#longform-grid [data-longread-id="${story}"]`).click();await page.locator('.ap-start').click();await readerReady(page);
  const id=await page.evaluate(()=>curBook.id);assert.equal(await page.evaluate(async()=>(await bookAll()).length),1);
  // Cold launch builds a real 66% tile, then actual wheel reading reaches 68%.
  await page.evaluate(()=>{restoreAnchor({pi:173,dy:30});show('home');});
  await page.reload();await page.evaluate(()=>homeReady);
  await page.evaluate(id=>{window.readingCard=document.querySelector(`#shelf [data-local-book="${id}"]`).parentElement;window.readingCover=readingCard.querySelector('img.cover');},id);
  assert.equal((await homeState(page,id)).label,'66% 읽음');
  await page.locator('#home-resume').click();await page.waitForFunction(()=>!homeResumeOpening);await readerReady(page);
  await wheelTo(page,177);
  const reading=await page.evaluate(()=>({p:visibleReaderProgress(),anchor:captureAnchor(),prior:{...posOf(curBook.id)}}));
  assert.equal(Math.floor(reading.p*100),68);assert.equal(reading.anchor.pi,177);
  await page.evaluate(()=>returnHomeFromReader());
  const fresh=await homeState(page,id);
  assert.equal(fresh.saved.p,reading.p);assert.equal(fresh.saved.pi,reading.anchor.pi);assert.deepEqual(fresh.durable,fresh.saved);
  assert.equal(fresh.capsule,'68%');assert.equal(fresh.label,'68% 읽음');assert.equal(fresh.sameTile,true);assert.equal(fresh.sameCover,true);
  console.log(`${engine.name()}: actual 66→68 Reader/Home ${JSON.stringify({reading,home:fresh})}`);
  // Both routes resume without dialog, download or another stored copy.
  const startedDownloads=downloads;
  for(const view of ['home','longform']){
   await page.evaluate(view=>show(view),view);
   await page.locator(`${view==='home'?'#shelf':'#longform-grid'} [data-local-book="${id}"]`).click();await readerReady(page);
   assert.equal(await page.evaluate(()=>curBook.id),id);assert.equal(downloads,startedDownloads);
   assert.equal(await page.evaluate(async()=>(await bookAll()).length),1);
   await page.goBack();await page.waitForFunction(view=>activeAppView()===view,view);
   assert.equal(await page.evaluate(()=>articlePreviewDialog.open),false);
  }
  await page.evaluate(()=>show('home'));
  // Same retained cover must also reflect deliberately backward reading.
  await page.locator(`#shelf [data-local-book="${id}"]`).click();await readerReady(page);await wheelTo(page,173);
  await page.evaluate(()=>returnHomeFromReader());const backward=await homeState(page,id);
  assert.equal(backward.capsule,'66%');assert.equal(backward.label,'66% 읽음');assert.equal(backward.saved.pi,173);
  releaseScene();
  // Across mobile/tablet/desktop themes, immediate exit remains consistent.
  for(const [width,height] of [[390,844],[320,568],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
   await page.setViewportSize({width,height});await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
   await page.locator(`#shelf [data-local-book="${id}"]`).click();await readerReady(page);
   await page.locator('img[src$="scandal-in-bohemia-05.webp"]').evaluate(img=>img.decode());
   await page.evaluate(()=>{fontSize(1);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   await wheelTo(page,177);const actual=await page.evaluate(()=>({p:visibleReaderProgress(),anchor:captureAnchor()}));
   await page.evaluate(()=>returnHomeFromReader());const home=await homeState(page,id);
   assert.equal(home.saved.p,actual.p);assert.equal(home.saved.pi,actual.anchor.pi);assert.equal(home.saved.dy,actual.anchor.dy);
   assert.equal(home.capsule,Math.floor(actual.p*100)+'%');assert.equal(home.label,home.capsule+' 읽음');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({animations:'disabled',path:`${proof}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`});
  }
  // The stable catalog id survives title changes, object replacement and disk reload.
  await page.evaluate(async id=>{const book={...books.find(book=>book.id===id),title:'My saved Holmes copy'};await bookPut(book);books=books.map(item=>item.id===id?book:item);renderHome();},id);
  await page.reload();await page.evaluate(()=>homeReady);
  await page.locator(`#shelf [data-local-book="${id}"]`).click();await readerReady(page);
  assert.equal(await page.evaluate(()=>curBook.title),'My saved Holmes copy');assert.equal(await page.evaluate(()=>curBook.id),id);
  // Interrupted disk preparation cannot reopen after navigation or change progress.
  await page.evaluate(()=>show('longform'));
  await page.evaluate(()=>{releaseRetainedReader();window.nativeRepair=repairBookLigatures;repairBookLigatures=async book=>{await new Promise(resolve=>window.releaseRepair=resolve);return nativeRepair(book);};});
  await page.locator(`#longform-grid [data-local-book="${id}"]`).click();await page.waitForFunction(()=>window.releaseRepair);
  const pending=await page.evaluate(()=>JSON.stringify(positions));
  await page.evaluate(()=>show('home'));await page.evaluate(()=>{releaseRepair();repairBookLigatures=nativeRepair;});
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>activeAppView()),'home');assert.equal(await page.evaluate(()=>JSON.stringify(positions)),pending);
  // Deletion returns the offer to preview; Read is again the import boundary.
  assert.equal(await page.evaluate(async id=>deleteBook(books.find(book=>book.id===id)),id),true);
  assert.equal(await page.evaluate(async()=>(await bookAll()).length),0);
  await page.locator(`#shelf [data-longread-id="${story}"]`).click();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(async()=>(await bookAll()).length),0);
  await page.locator(`#shelf [data-longread-id="${story}"]`).click();await page.locator('.ap-start').click();await readerReady(page);
  assert.equal(await page.evaluate(async()=>(await bookAll()).length),1);assert.equal(await page.evaluate(()=>curBook.longReadId),story);
  assert.equal(await page.evaluate(()=>visibleReaderProgress()),0);
  await page.evaluate(()=>show('home'));await page.locator(`#shelf [data-longread-id="${story}"]`).click();await readerReady(page);
  }
  releaseScene();
  // Same real PDF: completion → 50% → 19%, then compare fresh shelf and Home.
  await page.evaluate(()=>show('home'));await page.setViewportSize({width:390,height:844});
  await page.locator('#fileinput').setInputFiles({name:'Shared Home progress.pdf',mimeType:'application/pdf',buffer:fixturePdf(10)});
  await page.waitForFunction(()=>books.some(book=>book.kind==='pdf'));
  const pdfId=await page.evaluate(()=>books.find(book=>book.kind==='pdf').id);
  for(const percent of [100,50,19]){
   await page.locator(`#shelf [data-local-book="${pdfId}"]`).click();await readerReady(page);
   await page.waitForFunction(()=>currentReaderMode==='original'&&originalSession?.presented===true);
   await page.evaluate(async percent=>{
    if(percent===100)readerScrollTo(readerContentHeight());
    else await restoreOriginalAnchor({kind:'pdf',page:percent===50?6:2,y:percent===50?.05:.95});
    invalidateReaderMeasurements();updatePfill(true);
   },percent);
   const actual=await page.evaluate(()=>({p:visibleReaderProgress(),anchor:captureOriginalAnchor()}));
   assert.equal(Math.floor(actual.p*100),percent);
   await page.evaluate(()=>returnHomeFromReader());const home=await homeState(page,pdfId);
   await page.screenshot({animations:'disabled',path:`${proof}/${engine.name()}-pdf-${percent}.png`});
   await page.evaluate(()=>show('longform'));
   const shelfLabel=await page.locator(`#longform-grid [data-local-book="${pdfId}"] .prog`).textContent();
   await page.evaluate(()=>show('home'));
   console.log(`${engine.name()}: same PDF ${percent}% ${JSON.stringify({actual,home,shelfLabel})}`);
   assert.equal(home.saved.p,actual.p);assert.deepEqual(home.saved.original,actual.anchor);assert.deepEqual(home.durable,home.saved);
   assert.equal(home.capsule,percent+'%');assert.equal(home.label,percent+'% 읽음');
   assert.equal(await page.locator('#home-resume .completion-badge').isVisible(),percent===100);
   if(percent===50)await page.evaluate(id=>{window.readingCard=document.querySelector(`#shelf [data-local-book="${id}"]`).parentElement;window.readingCover=readingCard.querySelector('img.cover');},pdfId);
   if(percent===19){assert.equal(home.sameTile,true);assert.equal(home.sameCover,true);}
   assert.equal(shelfLabel,home.label);
  }
  assert.deepEqual(errors,[]);
  console.log(`${engine.name()}: unread/cancel/Read, Home/Explore direct resume, backward/immediate progress, 10 layouts, font/image loading, current identity, interrupted open and deletion/reimport passed`);
 }finally{await browser.close();}
}}finally{await new Promise(resolve=>server.close(resolve));}
