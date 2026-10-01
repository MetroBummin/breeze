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
   zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
   const paras=Array.from({length:120},(_,i)=>`The gentle signal crosses the quiet forest in paragraph ${i}.`);
   zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>'+paras.map(p=>'<p>'+p+'</p>').join('')+'</body></html>');
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
  await page.locator('#fileinput').setInputFiles({name:'Work.pdf',mimeType:'application/pdf',buffer:fixturePdf(12)});
  await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
  try{await page.waitForSelector('.pdf-source-page canvas');}
  catch(error){console.log(errors,await page.evaluate(()=>({mode:currentReaderMode,kind:originalSession?.kind,preparing:document.getElementById('originalwrap').dataset.readerPreparing,content:document.getElementById('original-content').innerHTML.slice(0,500)})));throw error;}
  await page.waitForTimeout(600);
  await page.evaluate(()=>togglePdfNavigation());
  await page.waitForFunction(()=>pdfNavigation&&!pdfNavigation.rendering&&document.querySelectorAll('#pdf-thumbnail-strip canvas').length>0);
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
  assert.deepEqual(errors,[]);
  console.log(engine.name(),JSON.stringify({text,modes,stars,sidebar,paperReadsDuringChrome:controls}));
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
