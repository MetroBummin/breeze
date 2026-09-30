import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
mkdirSync('/private/tmp/breeze16-qa',{recursive:true});
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launchPersistentContext('',{viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.text().includes('Original file storage failed'))console.log(message.text());});
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>{window.breezeInkIPad=true;localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#fileinput').setInputFiles({name:'Study.pdf',mimeType:'application/pdf',buffer:fixturePdf(120)});
  await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
  try{await page.waitForSelector('.pdf-source-page canvas');}catch(error){console.log('OPEN FAILED',errors,await page.evaluate(()=>({body:document.body.className,session:originalSession&&{kind:originalSession.kind,settled:[...originalSession.settled]},html:document.getElementById('original-content').innerHTML.slice(0,1000)})));throw error;}
  await page.evaluate(()=>goPdfPage(60));
  await page.locator('#pdf-page-button').click();
  await page.waitForSelector('.pdf-thumbnail canvas');
  assert.equal(await page.evaluate(()=>pdfCurrentPage()),60);
  assert.ok(await page.locator('.pdf-thumbnail').count()<16,'bounded thumbnail DOM');
  assert.equal(await page.locator('.pdf-thumbnail-jump[aria-current=true]').getAttribute('aria-label'),'60페이지로 이동');
  await page.locator('.pdf-thumbnail-bookmark[aria-label="60페이지 북마크"]').click();
  await page.locator('#pdf-bookmarks-only').click();
  assert.equal(await page.locator('.pdf-thumbnail').count(),1);
  await page.locator('.pdf-thumbnail-bookmark').click();
  assert.match(await page.locator('#pdf-thumbnail-strip').innerText(),/북마크한 페이지가 없어요/);
  await page.evaluate(()=>togglePdfBookmark(originalSession,60));
  await page.evaluate(()=>closePdfNavigation());
  await page.locator('[data-ink-toggle]').click();
  await page.evaluate(()=>{
   const target=originalSession.pages[59],r=target.getBoundingClientRect();
   const touch=x=>({identifier:801,target,touchType:'stylus',clientX:r.left+r.width*x,clientY:r.top+r.height*.3});
   const send=(type,touches,changed)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:changed},targetTouches:{value:touches}});target.dispatchEvent(event);};
   const a=touch(.2),b=touch(.4);send('touchstart',[a],[a]);send('touchmove',[b],[b]);send('touchend',[],[b]);
  });
  await page.waitForSelector('[data-page="60"] .pdf-ink-layer polyline',{state:'attached'});
  const inkPath=await page.locator('[data-page="60"] .pdf-ink-layer polyline').getAttribute('points');
  await page.locator('[data-ink-toggle]').click();
  await page.evaluate(()=>setPdfReadDirection('horizontal'));
  assert.equal(await page.locator('[data-page="60"] .pdf-ink-layer polyline').getAttribute('points'),inkPath);
  assert.equal(await page.evaluate(()=>pdfCurrentPage()),60);
  assert.equal(await page.locator('.pdf-source-page:visible').count(),1);
  await page.setViewportSize({width:320,height:900});await page.evaluate(()=>expandReaderChrome());await page.waitForTimeout(400);
  const readButtons=await page.evaluate(()=>[...document.querySelectorAll('#readpill button')].filter(n=>n.getClientRects().length&&!n.closest('[inert]')&&getComputedStyle(n).opacity!=='0').map(n=>({id:n.id,x:n.getBoundingClientRect().left,r:n.getBoundingClientRect().right})));
  for(const r of readButtons)assert.ok(r.x>=12&&r.r<=308,JSON.stringify(r));
  await page.setViewportSize({width:820,height:1180});
  assert.ok(await page.evaluate(()=>{readerScrollTo(readerScroller().scrollHeight);saveReadingState();return posOf(curBook.id).p<.6;}),'page bottom must not complete a horizontal document');
  await page.locator('#pdf-page-next').click();
  assert.equal(await page.evaluate(()=>pdfCurrentPage()),61);
  const swipe=async(type,cancel=false)=>page.evaluate(({type,cancel})=>{
   const target=originalSession.pages[pdfCurrentPage()-1],r=target.getBoundingClientRect();
   const touch=x=>({identifier:802,target,touchType:type,clientX:r.left+r.width*x,clientY:r.top+100});
   const send=(name,touches,changed)=>{const event=new Event(name,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:changed},targetTouches:{value:touches}});target.dispatchEvent(event);};
   const a=touch(.7),b=touch(.3);send('touchstart',[a],[a]);send('touchmove',[b],[b]);send(cancel?'touchcancel':'touchend',[],[b]);
  },{type,cancel});
  await swipe('stylus');assert.equal(await page.evaluate(()=>pdfCurrentPage()),61,'Pencil never pages');
  await swipe('direct',true);assert.equal(await page.evaluate(()=>pdfCurrentPage()),61,'cancel never pages');
  await swipe('direct');await page.waitForFunction(()=>pdfCurrentPage()===62);
  await page.evaluate(()=>goPdfPage(61));
  await page.evaluate(()=>setPdfReadDirection('vertical'));
  assert.equal(await page.evaluate(()=>pdfCurrentPage()),61);
  // Narrow actual Reader containers, including the writing tools and open strip.
  await page.locator('[data-ink-toggle]').click();
  for(const width of [320,390,507,650,820,1180]){
   await page.setViewportSize({width,height:900});await page.evaluate(()=>expandReaderChrome());
   await page.waitForTimeout(420);
   const rects=await page.evaluate(()=>[...document.querySelectorAll('#readback,#aafab,#pdf-page-button,.ink-pill-entry,.ink-pill-control')].filter(n=>n.getClientRects().length).map(n=>({id:n.id||n.getAttribute('aria-label'),x:n.getBoundingClientRect().x,r:n.getBoundingClientRect().right,w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,y:n.getBoundingClientRect().top,b:n.getBoundingClientRect().bottom})));
   for(const r of rects){assert.ok(r.x>=0&&r.r<=width+1&&r.y>=0&&r.b<=900,`${width}: ${JSON.stringify(r)}`);assert.ok(r.w>=34&&r.h>=34,JSON.stringify(r));}
   await page.locator('#pdf-page-button').click();await page.waitForSelector('.pdf-thumbnail');
   await page.waitForFunction(()=>[...document.querySelectorAll('.pdf-thumbnail')].every(cell=>cell.querySelector('canvas')));
   await page.screenshot({path:`/private/tmp/breeze16-qa/${engine.name()}-${width}.png`});
   await page.evaluate(()=>closePdfNavigation());
  }
  await page.locator('[data-ink-toggle]').click();
  const before=await page.evaluate(()=>({words:JSON.stringify(words),text:curBook.paras.join('\n')}));
  assert.match(before.text,/Page 61 line/);
  assert.equal(await page.evaluate(()=>deletePdfPage(originalSession,61)),true);
  assert.equal(await page.locator('.pdf-source-page[data-page="61"]:visible').count(),0);
  assert.equal(await page.evaluate(()=>curBook.paras.join('\n').includes('Page 61 line')),false);
  assert.equal(await page.evaluate(()=>curBook.paras.join('\n').includes('Page 62 line')),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(words)),before.words);
  await page.evaluate(()=>switchReaderMode('text'));
  assert.equal(await page.locator('#rtext').innerText().then(t=>t.includes('Page 61 line')),false);
  await page.evaluate(()=>switchReaderMode('original'));
  assert.equal(await page.locator('.pdf-source-page[data-page="61"]:visible').count(),0);
  const saved=await page.evaluate(()=>{
   words.sample={word:'sample',ko:'예시',status:1,mark:true};const before=JSON.stringify(words);
   setStarPreference(1,{visible:false,color:'#123456'});
   return {same:before===JSON.stringify(words),color:studyPrefs.stars[0].color,fill:starFill(1)};
  });assert.deepEqual(saved,{same:true,color:'#123456',fill:'transparent'});
  const folder=await page.evaluate(()=>{
   createLibraryFolder('School');const id=activeLibraryFolder;assignLibraryFolder(books[0].id,id);
   renameLibraryFolder(id,'학교');return {id,bookId:books[0].id};
  });
  await page.reload();await page.evaluate(()=>homeReady);
  assert.equal(await page.evaluate(()=>studyPrefs.stars[0].visible),false);
  assert.equal(await page.evaluate(({id,bookId})=>libraryFolders.assignments[bookId]===id,folder),true);
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
  assert.equal(await page.locator('.pdf-source-page[data-page="61"]:visible').count(),0);
  assert.ok(await page.evaluate(()=>readPdfBookmarks(originalSession).includes(60)));
  assert.equal(await page.evaluate(({id,bookId})=>{const text=books.find(b=>b.id===bookId).paras.join();deleteLibraryFolder(id);return !libraryFolders.assignments[bookId]&&books.find(b=>b.id===bookId).paras.join()===text;},folder),true);
  const failedWrite=await page.evaluate(async()=>{
   const previous=JSON.stringify(curBook),put=bookPut;
   bookPut=async()=>{throw Error('QA storage full');};
   let result;try{result=await deletePdfPage(originalSession,62);}finally{bookPut=put;}
   return {result,unchanged:JSON.stringify(curBook)===previous,visible:!originalSession.deletedPages.has(62)};
  });assert.deepEqual(failedWrite,{result:false,unchanged:true,visible:true});
  await page.evaluate(()=>returnHomeFromReader());
  await page.locator('#fileinput').setInputFiles({name:'Alice.epub',mimeType:'application/epub+zip',buffer:readFileSync(resolve(root,'assets/classics/alice-in-wonderland.epub'))});
  await page.waitForFunction(()=>books.some(b=>b.kind==='epub'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='epub'));await switchReaderMode('original');});
  await page.waitForFunction(()=>originalSession?.kind==='epub'&&originalSession.frames.some(frame=>frame.contentDocument?.getElementById('breeze-saved-mark-style')));
  assert.equal(await page.locator('#modefab').isVisible(),true,'EPUB bottom mode toggle');
  for(const width of [320,820,1180]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(200);
   const metrics=await page.evaluate(()=>{
    const frame=originalSession.frames.find(f=>f.contentDocument?.getElementById('breeze-saved-mark-style')),doc=frame.contentDocument,style=frame.contentWindow.getComputedStyle(doc.body);
    setStarPreference(1,{visible:true,color:'#123456'});
    return {padding:parseFloat(style.paddingLeft),body:doc.body.getBoundingClientRect().width,frame:frame.clientWidth,star:doc.getElementById('breeze-star-preferences').textContent};
   });assert.ok(metrics.padding>=16&&metrics.padding<=48,JSON.stringify(metrics));assert.ok(metrics.body<=metrics.frame+1,JSON.stringify(metrics));assert.match(metrics.star,/#12345666/);
  }
  await page.evaluate(()=>switchReaderMode('text'));
  await page.waitForFunction(()=>!readerPillProgressHeld);
  const size=await page.evaluate(()=>{const before=fs;fontSize(1);return {before,after:fs};});assert.equal(size.after,size.before+1);
  await page.evaluate(()=>{positions[curBook.id]={...posOf(curBook.id),p:1};returnHomeFromReader();renderHome();});
  assert.ok(await page.locator('#v-home .library-completion').count()>0,'completed card badge');
  assert.deepEqual(errors,[]);
  console.log(engine.name()+': Breeze 1.6 page navigation/bookmarks/deletion/directions/responsive tools/settings/folders passed');
 }finally{await browser.close();}
}}finally{server.close();}
