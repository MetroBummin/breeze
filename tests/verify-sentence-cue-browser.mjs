/* Confirmed mobile long-press -> source cue -> translation -> shared dismissal.
   Chromium uses trusted touch; WebKit uses synthetic pointer events. */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const output=process.env.BREEZE_QA_OUTPUT;if(output)mkdirSync(output,{recursive:true});
const sentence='A patient reader keeps every word and every meaning together while the sentence continues onto the next line.';
const pdf=pdfGeometryFixture(['A patient reader keeps every word and every meaning',
 'together while the sentence continues onto the next line.',
 'A patient reader keeps every word and every meaning',
 'together while the sentence continues onto the next line.',
 'A different sentence stays outside the blue highlight.']);
const JSZip=createRequire(import.meta.url)('../assets/lib/jszip-3.10.1.min.js'),zip=new JSZip();
zip.file('mimetype','application/epub+zip');
zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">cue-test</dc:identifier><dc:title>Sentence cues</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cues</title><style>body{margin:24px;font:20px/1.8 Georgia}p{margin:0 0 30px}</style></head><body>'+('<p>'+sentence+' A different sentence stays outside the blue highlight.</p>').repeat(20)+'</body></html>');
const epub=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
const reports=[];
try{
 for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  for(const width of [390,768]){
   const profile=mkdtempSync(resolve(tmpdir(),'breeze-sentence-cue-'));
   const context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width,height:width===390?844:1024},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});
   try{
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>{if(!e.message.startsWith('ResizeObserver loop'))errors.push(e.message);});
    await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
    await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
    await page.goto(url+'index.html');
    const cdp=engine===chromium?await context.newCDPSession(page):null;
    const inputs=[['txt',{name:'cue.txt',mimeType:'text/plain',buffer:Buffer.from((sentence+' A different sentence stays outside the blue highlight.\n\n').repeat(30))}],
     ['pdf',{name:'cue.pdf',mimeType:'application/pdf',buffer:pdf}],['epub',{name:'cue.epub',mimeType:'application/epub+zip',buffer:epub}]];
    for(const [kind,input] of inputs){
     console.log('Checking',engine.name(),width,kind);
     const oldCount=await page.evaluate(()=>books.length);await page.locator('#fileinput').setInputFiles(input);
     await page.waitForFunction(n=>books.length>n,oldCount,{timeout:120000});
     await page.evaluate(async kind=>{await openBook(books.find(b=>b.kind===kind));if(kind!=='txt')await switchReaderMode('original');},kind);
     await page.waitForFunction(kind=>kind==='txt'?document.querySelectorAll('#rtext .w').length>20:
      kind==='pdf'?originalSession?.wordBoxes.get(1)?.length>0:originalSession?.frames.some(f=>f?.contentDocument?.querySelector('p')),kind);
     if(kind==='epub'){
      await page.evaluate(()=>{
       const frame=originalSession.frames.find(f=>f?.contentDocument?.querySelector('p'));
       const block=[...frame.contentDocument.querySelectorAll('p')].find(p=>p.textContent.length>100);
       if(block){const frameRect=frame.getBoundingClientRect(),rect=block.getBoundingClientRect();readerScrollTo(readerScrollTop()+frameRect.top+rect.top-160);}
      });
     }else await page.evaluate(()=>readerScrollTo(0));
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     // Find an actual reader-owned word whose selected sentence wraps.
     const point=await page.evaluate(kind=>{
      const surface=READER_SURFACES.find(s=>s.name===(kind==='txt'?'text':kind));
      if(kind==='pdf'){
       const p=originalSession.pages[0],r=p.getBoundingClientRect(),b=originalSession.wordBoxes.get(1).find(b=>b.word==='patient');
       return {x:r.left+(b.x+b.w/2)*r.width,y:r.top+(b.y+b.h/2)*r.height};
      }
      for(let y=140;y<Math.min(innerHeight-220,580);y+=9)for(let x=30;x<Math.min(innerWidth-30,600);x+=11){
       const found=surface.sentenceAt(x,y);if(found&&found.sentence.length>100)return {x,y};
      }
      throw new Error('No visible sentence for '+kind);
     },kind);
     await page.evaluate(()=>{
      window.qaWait={};dictGet=()=>new Promise(r=>qaWait.resolve=r);dictPut=()=>Promise.resolve();
      window.qaRangeReads=0;window.qaRangeOriginals ||= new Map();
      const views=[window,...(originalSession?.kind==='epub'?originalSession.frames.filter(Boolean).map(f=>f.contentWindow):[])];
      for(const view of views){
       const proto=view.Range.prototype;
       if(!qaRangeOriginals.has(proto))qaRangeOriginals.set(proto,proto.getClientRects);
       proto.getClientRects=function(){qaRangeReads++;window.qaRangeForCue=this.cloneRange();return qaRangeOriginals.get(proto).call(this);};
      }
     });
     if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
     else await page.evaluate(p=>{
      window.qaTouchTarget=document.elementFromPoint(p.x,p.y);
      qaTouchTarget.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:71,pointerType:'touch',isPrimary:true,clientX:p.x,clientY:p.y}));
     },point);
     await page.waitForFunction(()=>sentenceWaitingActive()&&readerSentenceCue?.layer.childElementCount>0,null,{timeout:5000});
     if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     else await page.evaluate(p=>qaTouchTarget.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:71,pointerType:'touch',isPrimary:true,clientX:p.x,clientY:p.y})),point);
     await page.evaluate(()=>Promise.all(readerSentenceCue.layer.getAnimations({subtree:true}).map(a=>a.finished)));
     const cue=await page.evaluate(()=>{
      const layer=readerSentenceCue.layer;return {sentence:sentAsked,count:layer.childElementCount,
       opacity:getComputedStyle(layer.firstElementChild).opacity,radius:getComputedStyle(layer.firstElementChild).borderRadius,
       animation:getComputedStyle(layer.firstElementChild).animationName,blend:getComputedStyle(layer).mixBlendMode};
     });
     assert.ok(cue.count>=2,`${kind} ${width}: sentence did not wrap into line cues`);
     assert.equal(cue.opacity,'1');assert.equal(cue.radius,'8px');assert.equal(cue.animation,'breeze-sentence-cue-in');
     assert.equal(await page.locator('#sentence-modal').isVisible(),false);
     if(kind==='pdf'){
      assert.equal(cue.sentence,sentence);assert.equal(cue.count,2,'identical second occurrence was highlighted too');
      await page.waitForTimeout(6250);
      assert.equal(await page.evaluate(()=>getComputedStyle(readerSentenceCue.layer.firstElementChild).opacity),'1','pending PDF cue expired');
     }
     if(kind==='pdf'){
      const exact=await page.evaluate(p=>{
       const page=originalSession.pages[0],r=page.getBoundingClientRect(),hit=pdfWordAtPoint(page,p.x,p.y);
       const boxes=originalSession.wordBoxes.get(1).filter(b=>b.sentenceStart===hit.sentenceStart);
       const expectedTop=r.top+Math.min(...boxes.map(b=>b.y))*r.height;
       const expectedBottom=r.top+Math.max(...boxes.map(b=>b.y+b.h))*r.height;
       const cues=[...readerSentenceCue.layer.children].map(n=>n.getBoundingClientRect());
       return Math.max(Math.abs(Math.min(...cues.map(r=>r.top))-expectedTop),
        Math.abs(Math.max(...cues.map(r=>r.bottom))-expectedBottom));
      },point);
      assert.ok(exact<.1,'blue cue diverged from the pressed PDF occurrence');
     }
     // Programmatic scroll retains the source marker without range reads.
     const reads=await page.evaluate(()=>qaRangeReads);
     await page.evaluate(()=>readerScrollTo(readerScrollTop()+25));
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     assert.equal(await page.evaluate(()=>qaRangeReads),reads,'scroll remeasured sentence ranges');
     await page.evaluate(()=>qaWait.resolve({ko:'참을성 있는 독자는 다음 줄까지 이어지는 문장의 모든 단어와 의미를 함께 읽습니다.',points:['표현 설명은 표시되면 안 됩니다.']}));
     await page.waitForFunction(()=>!document.getElementById('sentence-modal').hidden);
     console.log('Result visible',engine.name(),width,kind);
     await page.locator('#p-sentence').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished)));
     assert.equal(await page.locator('#ps-extra,#ps-points').count(),0);assert.equal(await page.locator('#ps-foot').isVisible(),false);
     assert.equal(await page.locator('#ps-en').textContent(),cue.sentence);
     assert.ok(await page.evaluate(()=>readerSentenceCue?.layer.isConnected));
     if(output)await page.screenshot({path:resolve(output,`${engine.name()}-${width}-${kind}.png`)});
     if(kind!=='pdf'){
      const reflow=await page.evaluate(async()=>{
       const range=qaRangeForCue.cloneRange(),node=range.commonAncestorContainer;
       const block=node.nodeType===1?node:node.parentElement,old=block.style.width;
       const count=qaRangeReads;block.style.width=(block.clientWidth*.82)+'px';
       await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
       const reread=qaRangeReads>count,layer=readerSentenceCue.layer;
       await Promise.all(layer.getAnimations({subtree:true}).map(a=>a.finished));
       const marks=[...layer.children].map(n=>n.getBoundingClientRect());
       const covered=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).every(r=>marks.some(m=>
        m.left<=r.left+.1&&m.right>=r.right-.1&&m.top<=r.top+.1&&m.bottom>=r.bottom-.1));
       block.style.width=old;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
       return {reread,covered};
      });
      assert.ok(reflow.reread,'sentence layout change did not invalidate geometry');
      assert.ok(reflow.covered,'reflowed source range escaped its blue cue');
     }
     console.log('Reflow verified',engine.name(),width,kind);
     // Close fades just this selection, including its EPUB document layer.
     await page.evaluate(()=>{window.qaLeaving=readerSentenceCue.layer;closeSentence();});
     assert.equal(await page.evaluate(()=>readerSentenceCue),null);
     await page.waitForFunction(()=>!qaLeaving.isConnected);
     // Reduced motion: same selection, no scaling or timed movement; immediate cleanup.
     await page.emulateMedia({reducedMotion:'reduce'});
     const reduced=await page.evaluate(({point,kind})=>{
      const surface=READER_SURFACES.find(s=>s.name===(kind==='txt'?'text':kind));
      document.documentElement.classList.add('dark');document.body.classList.add('dark');
      const found=surface.sentenceAt(point.x,point.y-25);found.paint();
      const layer=readerSentenceCue.layer,animation=getComputedStyle(layer.firstElementChild).animationName;
      const blend=getComputedStyle(layer).mixBlendMode;clearReaderSentenceCue();
      document.documentElement.classList.remove('dark');document.body.classList.remove('dark');
      return {animation,removed:!layer.isConnected,blend};
     },{point,kind});
     assert.equal(reduced.animation,'none');assert.ok(reduced.removed);assert.equal(reduced.blend,kind==='pdf'?'multiply':'screen');
     await page.emulateMedia({reducedMotion:'no-preference'});
     reports.push({engine:engine.name(),width,kind,...cue});
     await page.evaluate(()=>show('home'));
    }
    assert.deepEqual(errors,[]);
   }finally{await context.close();rmSync(profile,{recursive:true,force:true});}
  }
 }
 console.log(JSON.stringify(reports,null,2));if(output)writeFileSync(resolve(output,'report.json'),JSON.stringify(reports,null,2));
}finally{await new Promise(r=>server.close(r));}
