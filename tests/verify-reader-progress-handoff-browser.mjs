import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';

const root=process.env.BREEZE_PROGRESS_ROOT||fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
 catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launch({...(engine===chromium&&process.env.BREEZE_CHROMIUM_PATH?{executablePath:process.env.BREEZE_CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.evaluate(async bytes=>{
   window.handoffQA={records:{pdf:{kind:'pdf',hash:'handoff-pdf',blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'})}}};
   await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');
   zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
   zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
   zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>'+Array.from({length:100},(_,i)=>'<p>Paragraph '+i+' carries a quiet memory through the forest.</p>').join('')+'</body></html>');
   handoffQA.records.epub={kind:'epub',hash:'handoff-epub',blob:await zip.generateAsync({type:'blob'})};
  },[...fixturePdf(6)]);
  for(const kind of ['pdf','epub'].filter(kind=>!process.env.BREEZE_QA_KIND||kind===process.env.BREEZE_QA_KIND)){
   await page.evaluate(async kind=>{
    show('home');
    const book={id:'handoff-'+kind,title:'Handoff '+kind,kind,original:{hash:handoffQA.records[kind].hash},paras:Array.from({length:100},(_,i)=>'Paragraph '+i+' carries a quiet memory through the forest.'),sourceMap:Array.from({length:100},(_,i)=>kind==='pdf'?{page:Math.floor(i/20)+1,y:(i%20)/20}:{spine:0,href:'chapter.xhtml',element:i})};
    books=[book];handoffQA.book=book;
    positions[book.id]={p:.65,t:12345,mode:'original',original:kind==='pdf'?{kind,page:4,y:.5}:{kind,spine:0,href:'chapter.xhtml',element:60}};
    await openBook(book,{prepared:{book,original:handoffQA.records[kind]}});
   },kind);
   await page.waitForTimeout(1100);
   const result=await page.evaluate(()=>{
    updatePfill(true);saveReadingState();
    const before=posOf(curBook.id).p,reader=readerPillRawProgress;
    // Exit before the two-frame text landing. This is also the lifecycle-save
    // window when the app backgrounds immediately after the mode button.
    switchReaderMode('text');
    const pending=readerPositionPending();
    saveReadingState();
    const during=posOf(curBook.id).p;
    show('home');
    return {before,reader,pending,during,after:posOf(handoffQA.book.id).p,mode:posOf(handoffQA.book.id).mode,original:posOf(handoffQA.book.id).original,home:document.getElementById('home-resume-percent').textContent,stored:load(LS_POS,{})[handoffQA.book.id].p};
   });
   console.log(engine.name(),kind,result);
   assert.equal(result.reader,result.before,'Reader and saved source agree before mode change');
   assert.equal(result.during,result.before,'unrestored text must not overwrite source progress');
   assert.equal(result.after,result.before,'Home exit must retain the last presented position');
   assert.equal(result.stored,result.before,'durable progress must survive the handoff');
   assert.equal(result.mode,'original','an unlanded destination cannot become the resume mode');
   assert.equal(result.home,`${Math.floor(result.before*100)}%`);
   assert.equal(result.pending,true,'text landing owns restoration until presented');
   await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>posOf(handoffQA.book.id).p),result.before,'late callbacks cannot rewrite an exited book');
   await page.evaluate(async()=>{const book=handoffQA.book;await openBook(book,{prepared:{book,original:handoffQA.records[book.kind]}});});
   assert.equal(await page.evaluate(()=>currentReaderMode),'original','reopen uses the last presented surface and source anchor');
   const reopenedOriginal=await page.evaluate(()=>captureOriginalAnchor());
   if(kind==='pdf'){
    assert.equal(reopenedOriginal.page,result.original.page);
    assert.ok(Math.abs(reopenedOriginal.y-result.original.y)<.01,'PDF reopen preserves source fraction');
   }else{
    assert.equal(reopenedOriginal.spine,result.original.spine);
    assert.equal(reopenedOriginal.element,result.original.element,'EPUB reopen preserves source element');
   }
   await page.evaluate(()=>switchReaderMode('text'));
   await page.waitForFunction(()=>!readerPillProgressHeld);
   assert.equal(await page.evaluate(()=>posOf(curBook.id).mode),'text','a successful landing commits its mode');
   const landed=await page.evaluate(()=>({position:{...posOf(curBook.id)},anchor:captureAnchor(),progress:readerPillRawProgress}));
   assert.equal(landed.position.p,landed.progress,'successful landing commits the displayed logical progress');
   assert.equal(landed.position.pi,landed.anchor.pi,'successful landing commits the actual displayed paragraph');
   assert.equal(landed.position.dy,landed.anchor.dy,'successful landing commits the actual displayed offset');
   await page.evaluate(async()=>{show('home');const book=handoffQA.book;await openBook(book,{prepared:{book,original:handoffQA.records[book.kind]}});});
   const reopened=await page.evaluate(()=>({anchor:captureAnchor(),mode:currentReaderMode,progress:readerPillRawProgress}));
   assert.equal(reopened.mode,'text');
   assert.equal(reopened.anchor.pi,landed.anchor.pi,'text reopen returns to the committed paragraph');
   assert.ok(Math.abs(reopened.anchor.dy-landed.anchor.dy)<=1,'text reopen returns to the committed offset');
   assert.equal(reopened.progress,landed.progress);

   // Read away from the original-mode anchor, then cancel an unfinished mode
   // request. The requested shell must not become the source of the next one.
   const rapidText=await page.evaluate(async()=>{
    readerScrollTo((readerContentHeight()-readerViewHeight())*.2);saveReadingState();updatePfill(true);
    const before=captureAnchor(),original={...posOf(curBook.id).original};
    const first=switchReaderMode('original',{record:handoffQA.records[handoffQA.book.kind]});
    const second=switchReaderMode('text');await Promise.all([first,second]);
    const after=captureAnchor(),expectedSource=sourceAnchorForParagraph(curBook,before.pi);
    await switchReaderMode('original',{record:handoffQA.records[handoffQA.book.kind]});
    const nextSource=captureOriginalAnchor();await switchReaderMode('text');
    return {before,after,original,expectedSource,nextSource};
   });
   assert.equal(rapidText.after.pi,rapidText.before.pi,'cancelling original preparation retains the actual text paragraph');
   assert.ok(Math.abs(rapidText.after.dy-rapidText.before.dy)<=1,'cancelling original preparation retains the text offset');
   if(kind==='pdf')assert.equal(rapidText.nextSource.page,rapidText.expectedSource.page,'the next request starts from committed text, not cancelled mode history');
   else assert.equal(rapidText.nextSource.element,rapidText.expectedSource.element,'the next request starts from committed text, not cancelled mode history');
   await page.evaluate(anchor=>{restoreAnchor(anchor);saveReadingState();updatePfill(true);},landed.anchor);

   // A failed original restore on an already-presented, reused session must
   // not commit an error surface as a source reading location.
   const failed=await page.evaluate(async()=>{
    const before=JSON.stringify(posOf(curBook.id)),restore=restoreOriginalAnchor;
    restoreOriginalAnchor=async()=>false;
    await switchReaderMode('original',{record:handoffQA.records[handoffQA.book.kind]});restoreOriginalAnchor=restore;
    const pending=readerPositionPending();saveReadingState();show('home');
    return {before,after:JSON.stringify(posOf(handoffQA.book.id)),pending};
   });
   assert.equal(failed.after,failed.before,'failed original restore retains the entire committed record');
   assert.equal(failed.pending,true,'failed original surface has no authoritative location');
   await page.evaluate(async()=>{const book=handoffQA.book;await openBook(book,{prepared:{book,original:handoffQA.records[book.kind]}});});
   assert.equal(await page.evaluate(()=>captureAnchor().pi),landed.anchor.pi);

   // Only the newest request may publish. Awaiting switchReaderMode now means
   // its anchor actually landed, rather than merely changing the shell's mode.
   const rapid=await page.evaluate(async()=>{
    const first=switchReaderMode('original',{record:handoffQA.records[handoffQA.book.kind]}),second=switchReaderMode('text'),third=switchReaderMode('original',{record:handoffQA.records[handoffQA.book.kind]});
    const outcomes=await Promise.all([first,second,third]);
    return {outcomes,mode:currentReaderMode,saved:posOf(curBook.id).mode,pending:readerPositionPending(),p:posOf(curBook.id).p,visual:readerPillRawProgress};
   });
   assert.deepEqual(rapid.outcomes,[false,false,true]);
   assert.equal(rapid.mode,'original');assert.equal(rapid.saved,'original');
   assert.equal(rapid.pending,false);assert.equal(rapid.p,rapid.visual);
   const rapidOriginal=await page.evaluate(async kind=>{
    const anchor=kind==='pdf'?{kind,page:5,y:.4}:{kind,spine:0,href:'chapter.xhtml',element:80};
    await restoreOriginalAnchor(anchor,++readerModeChangeToken);saveReadingState();updatePfill(true);
    const before=captureOriginalAnchor();
    const first=switchReaderMode('text'),second=switchReaderMode('original',{record:handoffQA.records[kind]});
    await Promise.all([first,second]);return {before,after:captureOriginalAnchor()};
   },kind);
   if(kind==='pdf'){
    assert.equal(rapidOriginal.after.page,rapidOriginal.before.page);
    assert.ok(Math.abs(rapidOriginal.after.y-rapidOriginal.before.y)<.01,'cancelling text preparation retains the original source fraction');
   }else{
    assert.equal(rapidOriginal.after.spine,rapidOriginal.before.spine);
    assert.equal(rapidOriginal.after.element,rapidOriginal.before.element,'cancelling text preparation retains the original source element');
   }

   const failedText=await page.evaluate(async()=>{
    const before=JSON.stringify(posOf(curBook.id)),bridge=originalSentenceBridge,restore=restoreTextSentence;
    originalSentenceBridge=()=>({candidates:[handoffQA.book.paras[60]],paragraph:60});
    restoreTextSentence=async()=>{throw Error('Controlled text restoration failure');};
    const outcome=await switchReaderMode('text');
    originalSentenceBridge=bridge;restoreTextSentence=restore;
    const pending=readerPositionPending();saveReadingState();show('home');
    return {outcome,before,after:JSON.stringify(posOf(handoffQA.book.id)),pending};
   });
   assert.equal(failedText.outcome,false);assert.equal(failedText.pending,true);
   assert.equal(failedText.after,failedText.before,'failed text restore retains the entire committed record');
   await page.evaluate(async()=>{const book=handoffQA.book;await openBook(book,{prepared:{book,original:handoffQA.records[book.kind]}});});

   // Pause sentence restoration after the two RAFs so real input and lifecycle
   // events run during an outstanding text operation, then finish normally.
   await page.evaluate(()=>{
    handoffQA.bridge=originalSentenceBridge;handoffQA.restore=restoreTextSentence;
    originalSentenceBridge=()=>({candidates:[handoffQA.book.paras[60]],paragraph:60});
    restoreTextSentence=async()=>{handoffQA.waiting=true;await new Promise(r=>handoffQA.release=r);return false;};
    handoffQA.waiting=false;handoffQA.switching=switchReaderMode('text');handoffQA.before=JSON.stringify(posOf(curBook.id));
   });
   await page.waitForFunction(()=>handoffQA.waiting);
   const heldTop=await page.evaluate(()=>readerScrollTop());
   await page.mouse.move(180,220);await page.mouse.wheel(0,300);
   await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>readerScrollTop()),heldTop,'trusted scrolling cannot interrupt an unlanded anchor');
   const pendingInput=await page.evaluate(()=>{
    const wheel=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:400});readerScroller().dispatchEvent(wheel);
    window.dispatchEvent(new Event('beforeunload'));window.dispatchEvent(new Event('pagehide'));
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;
    return {blocked:wheel.defaultPrevented,record:JSON.stringify(posOf(curBook.id))};
   });
   assert.equal(pendingInput.blocked,true,'restoration owns position before ordinary reading input');
   assert.equal(pendingInput.record,await page.evaluate(()=>handoffQA.before),'lifecycle cannot sample a requested surface');
   await page.evaluate(async()=>{handoffQA.release();await handoffQA.switching;originalSentenceBridge=handoffQA.bridge;restoreTextSentence=handoffQA.restore;});
   assert.equal(await page.evaluate(()=>readerPositionPending()),false);
   assert.equal(await page.evaluate(()=>posOf(curBook.id).p),await page.evaluate(()=>readerPillRawProgress));

   // A superseded callback resumes after another book owns the Reader. It must
   // not apply its fallback scroll, capture that book or commit its mode.
   await page.evaluate(async()=>{
    await switchReaderMode('original',{record:handoffQA.records[handoffQA.book.kind]});
    originalSentenceBridge=()=>({candidates:[handoffQA.book.paras[60]],paragraph:60});
    restoreTextSentence=async()=>{handoffQA.waiting=true;await new Promise(r=>handoffQA.release=r);return false;};
    handoffQA.waiting=false;handoffQA.switching=switchReaderMode('text');handoffQA.before=JSON.stringify(posOf(curBook.id));
   });
   await page.waitForFunction(()=>handoffQA.waiting);
   const superseded=await page.evaluate(async()=>{
    show('home');await openBook({id:'other-'+handoffQA.book.kind,title:'Other',kind:'txt',paras:['Another quiet book.']});
    const before=JSON.stringify(posOf(curBook.id)),top=readerScrollTop();handoffQA.release();
    const outcome=await handoffQA.switching;
    originalSentenceBridge=handoffQA.bridge;restoreTextSentence=handoffQA.restore;
    return {outcome,before,after:JSON.stringify(posOf(curBook.id)),top,afterTop:readerScrollTop(),old:JSON.stringify(posOf(handoffQA.book.id)),expected:handoffQA.before};
   });
   assert.equal(superseded.outcome,false);assert.equal(superseded.after,superseded.before);
   assert.equal(superseded.afterTop,superseded.top);assert.equal(superseded.old,superseded.expected);
   await page.evaluate(async()=>{show('home');const book=handoffQA.book;await openBook(book,{prepared:{book,original:handoffQA.records[book.kind]}});await switchReaderMode('text');});
   await page.evaluate(()=>{readerScrollTo(readerContentHeight());updatePfill(true);saveReadingState();show('home');});
   assert.equal(await page.locator('#home-resume-percent').textContent(),'100%','ordinary reading and completion still save');
   console.log(engine.name(),kind,'landed anchors, rapid cancellation in both directions, failures, lifecycle, input and stale callbacks passed');
  }
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
