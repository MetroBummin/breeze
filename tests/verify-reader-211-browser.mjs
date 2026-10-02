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


try { for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)) {
 const browser=await engine.launchPersistentContext('',{viewport:{width:390,height:844},serviceWorkers:'block'});const page=await browser.newPage();
 try {
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'Progress.pdf',mimeType:'application/pdf',buffer:fixturePdf(12)});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForTimeout(500);
 await page.evaluate(()=>setPdfReadDirection('horizontal'));
 assert.equal(await page.evaluate(()=>pdfHorizontal()),true);
 for(const viewport of [{width:390,height:844},{width:1180,height:820}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(500);
  for(const n of [1,6,11,12]){
   await page.evaluate(n=>goPdfPage(n),n);
   await page.evaluate(()=>{readerScrollTo(readerContentHeight());updatePfill(true);saveReadingState();});
   const p=await page.evaluate(()=>({visible:visibleReaderProgress(),saved:posOf(curBook.id).p}));
   assert.ok(Math.abs(p.visible-n/12)<.002,`${engine.name()} page ${n}: ${JSON.stringify(p)}`);
   assert.equal(p.saved,p.visible);
  }
 }
 // Deleted source pages do not leave holes in the progress denominator.
 await page.evaluate(async()=>{originalSession.deletedPages=new Set([2,3]);originalSession.availablePages=null;await goPdfPage(6);readerScrollTo(readerContentHeight());});
 assert.ok(Math.abs(await page.evaluate(()=>visibleReaderProgress())-.4)<.002);
 // Tall papers progress within one page, including at enlarged zoom.
 await page.evaluate(async()=>{await goPdfPage(6);setOriginalZoom(2);});await page.waitForTimeout(300);
 const progress=await page.evaluate(()=>{
  const r=pdfPageLayout().rects[5],start=Math.max(0,r[1]-topInset()),end=r[1]+r[3]-readerViewHeight();
  return [start,(start+end)/2,end].map(y=>{readerScrollTo(y);return visibleReaderProgress();});
 });
 assert.ok(Math.abs(progress[0]-.3)<.002&&Math.abs(progress[1]-.35)<.002&&Math.abs(progress[2]-.4)<.002,JSON.stringify(progress));
 await page.evaluate(async()=>{
  show('home');await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');
  zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
  const paras=Array.from({length:1000},(_,i)=>`Paragraph ${i}: the reader follows a long continuous chapter.`);
  zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><style>body{margin:0}p{height:64px;margin:0;background:#b4d6ee}p:nth-child(even){background:#f3d5ac}</style></head><body>'+paras.map((p,i)=>'<p id="p'+i+'">'+p+'</p>').join('')+'</body></html>');
  const record={kind:'epub',hash:'211-long-epub',blob:await zip.generateAsync({type:'blob'})};
  const book={id:'211-long-epub',title:'Long chapter',kind:'epub',original:{hash:record.hash},paras};
  books.push(book);positions[book.id]={mode:'original',p:0,t:1};await openBook(book,{prepared:{book,original:record}});await Promise.all(originalSession.frameGeometryReady);togglePdfNavigation();
 });
 await page.waitForFunction(()=>pdfNavigation?.pages.length>45);
 for(const n of [43,44,45]){
  await page.evaluate(n=>{pdfNavigation.strip.scrollTop=(n-1)*pdfNavigation.cellHeight;paintEpubThumbnails();},n);
  const frame=page.locator(`[data-epub-page="${n}"] iframe`);
  await frame.waitFor();await page.waitForFunction(n=>document.querySelector(`[data-epub-page="${n}"] iframe`)?.dataset.ready==='true',n);
  const geometry=await frame.evaluate((frame,n)=>{
   const page=pdfNavigation.pages[n-1],doc=frame.contentDocument;
   const sample=doc.elementFromPoint(frame.clientWidth/2,frame.clientHeight/2);
   return {height:frame.clientHeight,slice:pdfNavigation.pageHeights[page.spine],scroll:frame.contentWindow.scrollY,expected:page.y,text:sample?.textContent||''};
  },n);
  assert.ok(geometry.height<=geometry.slice+1,'Preview viewport must be one page, not the entire chapter');
  assert.ok(Math.abs(geometry.scroll-geometry.expected)<1,JSON.stringify(geometry));
  assert.match(geometry.text,/Paragraph/);
  const screenshot=await page.locator(`[data-epub-page="${n}"] .epub-thumbnail-paper`).screenshot();
  const painted=await page.evaluate(async data=>{
   const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}));
   const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let colored=0;
   for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20)colored++;
   return colored/(pixels.length/4);
  },screenshot.toString('base64'));
  assert.ok(painted>.4,`Page ${n} is blank: colored area ${painted}`);
 }
 console.log(engine.name()+': horizontal progress, deleted pages, zoom and painted EPUB pages 43/44/45 passed');
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
