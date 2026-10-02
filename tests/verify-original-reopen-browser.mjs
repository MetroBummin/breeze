import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';

const root=process.env.BREEZE_REOPEN_ROOT||fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
 catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launchPersistentContext('',{viewport:{width:390,height:844},serviceWorkers:'block'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url);await page.evaluate(()=>homeReady);
  const pdf=[...fixturePdf(6)];
  await page.evaluate(async bytes=>{
   window.reopenQA={records:{},restore:restoreOriginalAnchor};
   reopenQA.records.pdf={kind:'pdf',hash:'reopen-pdf',blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'})};
   await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');
   zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
   zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
   zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>'+Array.from({length:100},(_,i)=>'<p>Paragraph '+i+' carries a quiet memory through the forest.</p>').join('')+'</body></html>');
   reopenQA.records.epub={kind:'epub',hash:'reopen-epub',blob:await zip.generateAsync({type:'blob'})};
   reopenQA.other={id:'other',title:'Other book',kind:'txt',paras:['Another book.']};
   reopenQA.start=async(kind,progress)=>{
    restoreOriginalAnchor=reopenQA.restore;show('home');await openBook(reopenQA.other);show('home');
    const book={id:'reopen-'+kind,title:'Reopen '+kind,kind,original:{hash:reopenQA.records[kind].hash},paras:Array.from({length:100},(_,i)=>'Paragraph '+i+' carries a quiet memory through the forest.')};
    books=[book,reopenQA.other];reopenQA.book=book;
    const original=kind==='pdf'?{kind,page:progress===1?6:4,y:.8}:{kind,spine:0,href:'chapter.xhtml',element:progress===1?99:60};
    positions[book.id]={p:progress,t:12345,mode:'original',original};save(LS_POS,positions);
    reopenQA.saved=JSON.stringify(positions[book.id]);reopenQA.waiting=false;
    restoreOriginalAnchor=async(...args)=>{reopenQA.waiting=true;await new Promise(resolve=>reopenQA.release=resolve);return reopenQA.restore(...args);};
    reopenQA.opening=openBook(book,{prepared:{book,original:reopenQA.records[kind]}});
   };
  },pdf);
  for(const kind of ['pdf','epub'])for(const progress of [1,.65]){
   await page.evaluate(({kind,progress})=>reopenQA.start(kind,progress),{kind,progress});
   await page.waitForFunction(()=>reopenQA.waiting).catch(async error=>{console.log(await page.evaluate(()=>({kind:reopenQA.book.kind,mode:currentReaderMode,waiting:reopenQA.waiting,token:readerModeChangeToken,session:originalSession?.kind,job:!!originalOpenJob,error:document.querySelector('.original-empty')?.textContent,queue:originalSession?.paintQueue?.size,active:!!originalSession?.paintActive})));throw error;});
   const token=await page.evaluate(()=>readerModeChangeToken);
   if(kind==='pdf'&&progress===1&&!process.env.BREEZE_REOPEN_ROOT){
    for(const [width,height] of [[820,1180],[1440,900],[844,390],[320,360],[390,844]]){
     await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    }
   }
   const preparing=await page.locator('#originalwrap').getAttribute('aria-busy');
   const visibility=await page.locator('#original-stage').evaluate(n=>getComputedStyle(n).visibility);
   await page.evaluate(()=>{
    const box=readerScroller(),target=document.getElementById('original-stage');
    const event=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[{identifier:1,target,clientX:100,clientY:200}]});target.dispatchEvent(event);
    const wheel=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:400});box.dispatchEvent(wheel);
    reopenQA.wheelBlocked=wheel.defaultPrevented;
    box.scrollTop=50;box.dispatchEvent(new Event('scroll'));saveReadingState();
   });
   await page.waitForTimeout(2350); // Exceed the former timer and scroll-save debounce.
   assert.equal(await page.evaluate(()=>JSON.stringify(posOf(reopenQA.book.id))),await page.evaluate(()=>reopenQA.saved),'temporary cover must not overwrite saved progress');
   assert.equal(await page.evaluate(()=>readerModeChangeToken),token,'input must not cancel the initial restoration');
   assert.equal(preparing,'true');assert.equal(visibility,'hidden','cover cannot flash before landing');
   assert.equal(await page.evaluate(()=>reopenQA.wheelBlocked),true);
   assert.equal(await page.evaluate(()=>JSON.stringify(load(LS_POS,{})[reopenQA.book.id])),await page.evaluate(()=>reopenQA.saved));
   await page.evaluate(async()=>{reopenQA.release();await reopenQA.opening;restoreOriginalAnchor=reopenQA.restore;});
   assert.equal(await page.locator('#original-stage').evaluate(n=>getComputedStyle(n).visibility),'visible');
   assert.ok(await page.evaluate(()=>readerScrollTop())>200,'lands at the saved position');
   assert.equal(await page.evaluate(()=>readerPositionPending()),false);
   await page.waitForTimeout(1100);
   await page.evaluate(()=>{readerScrollTo(0);saveReadingState();});
   assert.ok(await page.evaluate(()=>posOf(reopenQA.book.id).p)<.2,'intentional reading back at the start is still saved');
  }
  // Leaving while restoration is pending preserves A and cannot land over B.
  await page.evaluate(()=>reopenQA.start('pdf',1));await page.waitForFunction(()=>reopenQA.waiting);
  const saved=await page.evaluate(()=>reopenQA.saved);
  await page.evaluate(async()=>{show('home');await openBook(reopenQA.other);reopenQA.release();await reopenQA.opening;});
  assert.equal(await page.evaluate(()=>curBook.id),'other');
  assert.equal(await page.evaluate(()=>JSON.stringify(posOf('reopen-pdf'))),saved);
  assert.equal(await page.evaluate(()=>readerPositionPending()),false);
  // A failed landing is not a successful presentation and cannot save the cover.
  await page.evaluate(()=>reopenQA.start('epub',1));await page.waitForFunction(()=>reopenQA.waiting);
  await page.evaluate(async()=>{const restore=reopenQA.restore;reopenQA.restore=async()=>false;reopenQA.release();await reopenQA.opening;reopenQA.restore=restore;saveReadingState();});
  assert.equal(await page.locator('.original-empty').isVisible(),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(posOf(reopenQA.book.id))),await page.evaluate(()=>reopenQA.saved));
  await page.evaluate(()=>show('home'));
  assert.equal(await page.evaluate(()=>JSON.stringify(posOf(reopenQA.book.id))),await page.evaluate(()=>reopenQA.saved));
  assert.deepEqual(errors,[]);console.log(engine.name()+': slow PDF/EPUB reopen, early input, completed/partial progress, real backward reading and stale completion passed');
 }finally{await browser.close();}
}}finally{server.close();}
