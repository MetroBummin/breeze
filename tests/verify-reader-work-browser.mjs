import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
 catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launchPersistentContext('',{viewport:{width:390,height:844},serviceWorkers:'block'});try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(process.env.BREEZE_RESIZE_TRACE){
   page.on('console',message=>{if(message.text().startsWith('Resize trace'))console.log(message.text());});
   await page.addInitScript(()=>{
    const RO=ResizeObserver,rows=[];
    window.ResizeObserver=class extends RO{constructor(fn){const stack=new Error().stack;super((entries,self)=>{rows.push({at:performance.now(),stack,ids:entries.map(e=>e.target.id||e.target.className)});if(rows.length>8)rows.shift();fn(entries,self);});}};
    addEventListener('error',event=>{if(event.message.includes('ResizeObserver'))console.log('Resize trace '+JSON.stringify(rows));});
   });
  }
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>{window.breezeInkIPad=true;localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
  await page.goto(url);await page.evaluate(()=>homeReady);
  const text=await page.evaluate(async()=>{
   const book={id:'work-text',title:'Work',kind:'txt',paras:Array.from({length:1000},(_,i)=>`Paragraph ${i} carries a gentle signal through the quiet forest.`)};
   books=[book];await openBook(book);
   let walks=0;const walk=document.createTreeWalker.bind(document);
   document.createTreeWalker=(...args)=>{walks++;return walk(...args);};
   let result;try{result=findTextSentence([book.paras[900]],900);}finally{document.createTreeWalker=walk;}
   return {walks,match:result?.range.toString()};
  });
  assert.equal(text.match,'Paragraph 900 carries a gentle signal through the quiet forest');
  assert.ok(text.walks<=12,'Mapped sentence search must not walk the whole 1000-paragraph book');
  await page.evaluate(async()=>{
   await ensureZipLib();const zip=new JSZip();
   zip.file('mimetype','application/epub+zip');
   zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
   zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="second" href="second.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/><itemref idref="second"/></spine></package>');
   const paras=Array.from({length:120},(_,i)=>`The gentle signal crosses the quiet forest in paragraph ${i}.`);
   zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>'+paras.map(p=>'<p>'+p+'</p>').join('')+'</body></html>');
   zip.file('second.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second chapter</title></head><body><h1>Second chapter</h1>'+('<p>A quiet reader follows the next chapter.</p>'.repeat(40))+'</body></html>');
   const record={kind:'epub',hash:'work-epub',blob:await zip.generateAsync({type:'blob'})};
   const book={id:'work-epub',title:'Work EPUB',kind:'epub',original:{hash:record.hash},paras};
   books=[book];positions[book.id]={mode:'original',p:0,y:0};
   await openBook(book,{prepared:{book,original:record}});
   await Promise.all(originalSession.frameGeometryReady);readerScrollTo(1800);
  });
  await page.waitForTimeout(400);
  const modes=await page.evaluate(async()=>{
   const session=originalSession,first=document.getElementById('original-content').firstChild,top=readerScrollTop();
   const out=switchReaderMode('text'),immediateText=currentReaderMode==='text';await out;
   while(readerPillProgressHeld)await new Promise(r=>requestAnimationFrame(r));
   const read=originalGetForBook;let reads=0;originalGetForBook=async()=>{reads++;throw Error('Unnecessary source read');};
   let immediateTop,firstFrameTop;
   try{
    const back=switchReaderMode('original');immediateTop=readerScrollTop();
    await new Promise(r=>requestAnimationFrame(()=>{firstFrameTop=readerScrollTop();r();}));await back;
   }finally{originalGetForBook=read;}
   return {immediateText,reads,top,immediateTop,firstFrameTop,reused:originalSession===session&&first===document.getElementById('original-content').firstChild};
  });
  assert.equal(modes.immediateText,true,'Switching mode must not wait 600ms before changing surface');
  assert.equal(modes.reads,0,'A live original round trip must not reread the source Blob');
  assert.equal(modes.reused,true);
  assert.ok(Math.abs(modes.immediateTop-modes.top)<2&&modes.firstFrameTop>1000,'Returning EPUB never paints the cover before restoration');
  const stars=await page.evaluate(async()=>{
   const doc=originalSession.frames[0].contentDocument;
   const owner=doc.querySelector('p'),node=owner.firstChild,range=doc.createRange();range.setStart(node,11);range.setEnd(node,17);
   words.signal={word:'signal',ko:'신호',status:1,mark:true};renderEpubSavedWordHighlights(doc);
   let marker;const open=openWord;openWord=(_key,n)=>{marker=n;n.classList.add('sel');};
   try{openOriginalRange(doc,range,'signal',owner,range.getBoundingClientRect());}finally{openWord=open;}
   const fill=doc.defaultView.getComputedStyle(marker).backgroundColor;
   let headChanges=0,walks=0;const observer=new MutationObserver(rows=>headChanges+=rows.length);
   observer.observe(doc.head,{subtree:true,childList:true,characterData:true});
   const walk=doc.createTreeWalker.bind(doc);doc.createTreeWalker=(...args)=>{walks++;return walk(...args);};
   const began=performance.now();
   for(let i=0;i<40;i++)setStarPreference(1,{visible:i%2===0});
   const elapsed=performance.now()-began;await Promise.resolve();observer.disconnect();doc.createTreeWalker=walk;
   return {headChanges,walks,elapsed,selectionUnchanged:fill===doc.defaultView.getComputedStyle(marker).backgroundColor};
  });
  assert.equal(stars.headChanges,0,'Star toggles must not rebuild/reorder EPUB stylesheets');
  assert.equal(stars.walks,0,'Star visibility must not rescan chapter text');
  assert.equal(stars.selectionUnchanged,true,'Selected blue paint must not become saved yellow or transparent');
  await page.evaluate(()=>{closePanel();expandReaderChrome();});
  assert.equal(await page.locator('#pdf-page-button').isVisible(),true,'EPUB original exposes page previews');
  const eagerPreviews=await page.evaluate(()=>{togglePdfNavigation();return document.querySelectorAll('.epub-page-preview').length;});
  assert.equal(eagerPreviews,0,'Opening must present the shared sidebar before creating EPUB documents');
  const epubPages=await page.evaluate(()=>pdfNavigation.pages.length);
  assert.ok(epubPages>2,'Flowing chapters must produce multiple reader-sized page previews');
  await page.waitForFunction(()=>document.querySelectorAll('.epub-page-preview').length>0&&!pdfNavigation.previewRendering&&[...document.querySelectorAll('.epub-page-preview')].every(frame=>frame.contentDocument?.body?.textContent.trim()));
  assert.ok(await page.locator('#pdf-navigation-toggle').evaluate(button=>{const r=button.getBoundingClientRect(),h=button.parentElement.getBoundingClientRect();return Math.abs(r.right-h.right)<1;}),'EPUB collapse control shares the PDF right-hand header position');
  assert.equal(await page.locator('#pdf-bookmarks-only').isVisible(),true);
  assert.equal(await page.locator('#aa-pdf-direction').isVisible(),false);
  const headerButtons=await page.evaluate(()=>['pdf-bookmarks-only','pdf-navigation-toggle'].map(id=>{
    const button=document.getElementById(id),s=getComputedStyle(button),icon=getComputedStyle(button.querySelector('svg'));
    return [s.width,s.height,s.borderRadius,s.backgroundColor,icon.width,icon.height,icon.strokeWidth];
  }));
  assert.deepEqual(headerButtons[0],headerButtons[1],'Sidebar header buttons share geometry, material and icon weight');
  const previewReuse=await page.evaluate(()=>{
    const nav=pdfNavigation,frame=nav.track.querySelector('iframe');closePdfNavigation();togglePdfNavigation();
    return frame.isConnected&&nav.track.contains(frame);
  });
  assert.equal(previewReuse,true,'Reopening the same pages reuses loaded previews');
  await page.evaluate(()=>{pdfNavigation.strip.scrollTop=0;paintEpubThumbnails();});
  await page.locator('.pdf-thumbnail-bookmark[aria-label="2페이지 북마크"]').click();
  await page.waitForFunction(()=>!pdfNavigation?.contact);
  assert.equal(await page.locator('.pdf-thumbnail-bookmark[aria-label="2페이지 북마크"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>readEpubBookmarks(originalSession).length),1);
  await page.locator('#pdf-bookmarks-only').click();
  assert.equal(await page.locator('.pdf-thumbnail').count(),1);
  assert.equal(await page.locator('.pdf-thumbnail-jump').getAttribute('data-epub-page'),'2');
  await page.evaluate(()=>{closePdfNavigation({release:true});togglePdfNavigation();});
  await page.locator('#pdf-bookmarks-only').click();
  assert.equal(await page.locator('.pdf-thumbnail').count(),1,'Stored EPUB bookmarks survive navigation cache release');
  await page.setViewportSize({width:820,height:1180});await page.waitForTimeout(300);
  assert.equal(await page.locator('.pdf-thumbnail').count(),1,'Reflow keeps the bookmarked source location');
  await page.waitForFunction(()=>pdfNavigation?.track.firstElementChild && +pdfNavigation.track.firstElementChild.dataset.pageIndex===epubBookmarkPage(pdfNavigation,readEpubBookmarks(originalSession)[0]));
  assert.equal(await page.evaluate(()=>+pdfNavigation.track.firstElementChild.dataset.pageIndex),await page.evaluate(()=>epubBookmarkPage(pdfNavigation,readEpubBookmarks(originalSession)[0])),'The filtered preview follows the live anchor after reflow');
  assert.ok(await page.evaluate(()=>originalSession.frames.every(frame=>{
    const body=frame.contentDocument.body.getBoundingClientRect();
    return frame.clientHeight-body.bottom<60;
  })),'Wider reflow must shrink chapter frames instead of retaining blank tail pages');
  assert.equal(await page.locator('.pdf-thumbnail-bookmark').getAttribute('aria-pressed'),'true');
  await page.locator('.pdf-thumbnail-bookmark').click();
  await page.waitForFunction(()=>!pdfNavigation?.contact);
  assert.equal(await page.evaluate(()=>readEpubBookmarks(originalSession).length),0);
  await page.waitForFunction(()=>!document.querySelector('.pdf-thumbnail'));
  assert.equal(await page.locator('.pdf-thumbnail').count(),0,'Removing the last filtered bookmark shows an empty list');
  assert.equal(await page.locator('#pdf-navigation-scrollbar').isVisible(),false);
  await page.locator('#pdf-bookmarks-only').click();
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  // Grab the actual shared thumb. Scrolling the sidebar must not scroll the book.
  const readerBeforeDrag=await page.evaluate(()=>readerScrollTop());
  const thumb=await page.locator('#pdf-navigation-scrollbar').boundingBox();
  await page.mouse.move(thumb.x+thumb.width/2,thumb.y+10);await page.mouse.down();
  await page.mouse.move(thumb.x+thumb.width/2,thumb.y+160,{steps:10});await page.mouse.up();
  assert.ok(await page.evaluate(()=>pdfNavigation.strip.scrollTop>100),'Scrollbar dragging moves the EPUB list');
  assert.equal(await page.evaluate(()=>readerScrollTop()),readerBeforeDrag);
  await page.locator('#pdf-navigation-scrollbar').focus();await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>pdfNavigation.strip.scrollTop),0);

  await page.evaluate(()=>{pdfNavigation.strip.scrollTop=0;paintEpubThumbnails();});
  await page.locator('[data-epub-page="2"]').click();
  await page.waitForFunction(()=>{
    const nav=pdfNavigation,page=nav.pages[1],frame=nav.session.frames[page.spine];
    return Math.abs(frame.getBoundingClientRect().top+page.y*originalZoom()-topInset())<3;
  });
  await page.evaluate(()=>{pdfNavigation.strip.scrollTop=pdfNavigation.strip.scrollHeight;paintEpubThumbnails();});
  await page.locator(`[data-epub-page="${epubPages}"]`).click();
  await page.waitForFunction(()=>originalSession.navigationSpine===1);
  assert.ok(await page.evaluate(()=>pdfNavigation.track.querySelectorAll('iframe').length<=Math.ceil(pdfNavigation.strip.clientHeight/pdfNavigation.cellHeight)+3),'Only nearby page previews exist');
  for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
   await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);await page.waitForTimeout(240);
   assert.equal(await page.evaluate(()=>!!pdfNavigation),true,`EPUB reflow keeps navigation open at ${width}x${height}, dark=${dark}`);
   // ResizeObserver replaces the virtualized cells during reflow. Resolve and
   // measure the current paper in one browser turn, rather than measuring a
   // detached locator handle after an arbitrary 240ms delay on a busy runner.
   const previewHandle=await page.waitForFunction(()=>{
     const paper=document.querySelector('.epub-thumbnail-paper');if(!paper)return false;
     const r=paper.getBoundingClientRect(),strip=document.getElementById('pdf-thumbnail-strip').getBoundingClientRect();
     // Connected cells can retain the previous viewport's dimensions until
     // the queued EPUB reflow publishes its new geometry.
     const ready=r.width>0&&r.height>0&&strip.width>0
       &&Math.abs(r.height/r.width-Math.SQRT2)<.02&&r.width/strip.width>.9;
     return ready?{width:r.width,height:r.height,strip:strip.width}:false;
   },null,{timeout:10000});
   const previewSize=await previewHandle.jsonValue();await previewHandle.dispose();
   assert.ok(Math.abs(previewSize.height/previewSize.width-Math.SQRT2)<.02&&previewSize.width/previewSize.strip>.9,`EPUB page proportions at ${width} dark=${dark}: ${JSON.stringify(previewSize)}`);
   assert.ok(await page.evaluate(()=>{
     const thumb=document.getElementById('pdf-navigation-scrollbar');if(thumb.hidden)return true;
     const left=thumb.getBoundingClientRect().left;
     return [...document.querySelectorAll('.pdf-thumbnail-paper,.pdf-thumbnail-bookmark')].every(node=>node.getBoundingClientRect().right<=left);
   }),'Scrollbar grip never overlaps a page or bookmark hit target');
   const box=await page.locator('#pdf-page-navigation').boundingBox();
   assert.ok(box&&box.x>=-.5&&box.y>=-.5&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5,`EPUB page sidebar stays inside the viewport: ${JSON.stringify({width,height,dark,box})}`);
   await page.screenshot({path:`/tmp/breeze209-epub-${engine.name()}-${width}-${dark?'dark':'light'}.png`});
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{darkMode=false;applyDark();closePdfNavigation();});
  await page.locator('#fileinput').setInputFiles({name:'Work.pdf',mimeType:'application/pdf',buffer:fixturePdf(12)});
  await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
  try{await page.waitForSelector('.pdf-source-page canvas');}
  catch(error){console.log(errors,await page.evaluate(()=>({mode:currentReaderMode,kind:originalSession?.kind,preparing:document.getElementById('originalwrap').dataset.readerPreparing,content:document.getElementById('original-content').innerHTML.slice(0,500)})));throw error;}
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.epub-page-preview').count(),0,'Leaving EPUB releases preview frames');
  await page.evaluate(()=>togglePdfNavigation());
  await page.waitForFunction(()=>pdfNavigation&&!pdfNavigation.rendering&&document.querySelectorAll('#pdf-thumbnail-strip canvas').length>0);
  const pdfThumb=await page.locator('#pdf-navigation-scrollbar').boundingBox();
  const pdfTop=await page.evaluate(()=>readerScrollTop());
  assert.ok(await page.evaluate(()=>{const left=document.getElementById('pdf-navigation-scrollbar').getBoundingClientRect().left;return [...document.querySelectorAll('.pdf-thumbnail-paper,.pdf-thumbnail-bookmark')].every(node=>node.getBoundingClientRect().right<=left);}), 'PDF scrollbar grip does not overlap thumbnails or bookmarks');
  await page.mouse.move(pdfThumb.x+pdfThumb.width/2,pdfThumb.y+10);await page.mouse.down();
  await page.mouse.move(pdfThumb.x+pdfThumb.width/2,pdfThumb.y+150,{steps:10});await page.mouse.up();
  assert.ok(await page.evaluate(()=>pdfNavigation.strip.scrollTop>100),'Scrollbar dragging moves the PDF list');
  assert.equal(await page.evaluate(()=>readerScrollTop()),pdfTop);
  await page.locator('#pdf-navigation-scrollbar').focus();await page.keyboard.press('Home');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(()=>pdfNavigation&&!pdfNavigation.rendering);

  const sidebar=await page.evaluate(async()=>{
   const canvases=[...document.querySelectorAll('#pdf-thumbnail-strip canvas')];
   closePdfNavigation();await new Promise(r=>setTimeout(r,260));togglePdfNavigation();
   const reused=canvases.every(c=>c.isConnected&&[...document.querySelectorAll('#pdf-thumbnail-strip canvas')].includes(c));
   closePdfNavigation();
   for(let i=0;i<4;i++){togglePdfNavigation();closePdfNavigation();}
   togglePdfNavigation();await new Promise(r=>setTimeout(r,300));
   const interactive=pdfNavigation!==null&&!document.getElementById('pdf-page-navigation').inert;
   closePdfNavigation({release:true});await new Promise(r=>setTimeout(r,260));
   return {reused,interactive,released:!document.getElementById('pdf-thumbnail-strip').childElementCount&&!originalSession.navigationPreview};
  });
  assert.deepEqual(sidebar,{reused:true,interactive:true,released:true});
  const controls=await page.evaluate(async()=>{
   let reads=0;const originals=originalSession.pages.map(p=>p.getBoundingClientRect.bind(p));
   originalSession.pages.forEach((p,i)=>p.getBoundingClientRect=()=>{reads++;return originals[i]();});
   pdfPageLayout(originalSession);reads=0;
   for(let i=0;i<6;i++){setReaderChrome(i%2===0);await new Promise(r=>requestAnimationFrame(r));pdfPageLayout(originalSession);}
   originalSession.pages.forEach((p,i)=>p.getBoundingClientRect=originals[i]);return reads;
  });
  assert.equal(controls,0,'Chrome-only motion must not invalidate and remeasure PDF paper');
  // A pending PDF sentence owns the center pill, in reading and writing,
  // even with the sidebar open or collapsed chrome at admission.
  for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390]])for(const dark of [false,true])for(const writing of [false,true])for(const hidden of [false,true]){
   await page.setViewportSize({width,height});
   await page.evaluate(d=>{darkMode=d;applyDark();},dark);
   // Viewport restoration closes stale lookup state; admit the new request after it settles.
   await page.waitForTimeout(240);
   await page.evaluate(({writing,hidden})=>{closeSentence();expandReaderChrome();if(document.getElementById('readpill').classList.contains('ink-pill-active')!==writing)document.querySelector('[data-ink-toggle]').click();if(!writing)setReaderChrome(hidden);togglePdfNavigation();beginSentenceWaiting();},{writing,hidden});
   await page.waitForFunction(()=>document.body.classList.contains('sentence-pill-waiting'));
   await page.waitForTimeout(320);
   assert.equal(await page.locator('#sentence-pill-status').isVisible(),true);
   assert.equal(await page.locator('#reader-navigation').isVisible(),false,'Sentence loading must hide the complete back/page surface');
   assert.equal(await page.locator('.ink-pill-toolbar').isVisible(),false);
   const pill=await page.locator('#readpill').boundingBox();
   assert.ok(Math.abs(pill.x+pill.width/2-width/2)<1,'Pending sentence pill is centered');
   assert.ok(pill.width>Math.min(width-60,500),'Pending label has the full center surface');
   assert.equal(await page.locator('#reader-navigation').evaluate(n=>n.inert),true);
   if(!hidden&&!writing)await page.screenshot({path:`/tmp/breeze208-${engine.name()}-${width}-${dark?'dark':'light'}-waiting.png`});
   await page.evaluate(()=>closeSentence());
  }
  await page.evaluate(()=>{if(document.getElementById('readpill').classList.contains('ink-pill-active'))document.querySelector('[data-ink-toggle]').click();});
  await page.screenshot({path:'/tmp/breeze208-reader-'+engine.name()+'.png'});
  assert.deepEqual(errors,[]);
  console.log(engine.name(),JSON.stringify({text,modes,stars,sidebar,paperReadsDuringChrome:controls}));
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}

