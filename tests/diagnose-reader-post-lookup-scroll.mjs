/* Diagnostic only: compare identical scroll paths before/after sentence help.
 * Native iPad asynchronous scrolling/compositing is NOT emulated by this test.
 * Canvas payload loss, DOM cleanup and source geometry are separately reported.
 */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.BREEZE_SCROLL_PROOF||'/tmp/breeze-post-lookup-scroll';
const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;
mkdirSync(output,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const sentence='A patient reader keeps every word and every meaning together.';
function pdfFixture(){
 const objects=['','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],kids=[];
 for(let n=1;n<=12;n++){
  const page=objects.length+1,stream=page+1;kids.push(`${page} 0 R`);
  const rows=Array.from({length:30},(_,i)=>`1 0 0 1 42 ${750-i*23} Tm (${i===0?'Page '+n:sentence}) Tj`).join('\n');
  const content=`BT /F1 12 Tf\n${rows}\nET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
 }
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Count 12 /Kids [${kids.join(' ')}] >>`;
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf);
}
const zip=new (createRequire(import.meta.url)('../assets/lib/jszip-3.10.1.min.js'))();
zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
zip.file('book.opf','<package><metadata/><manifest>'+[0,1,2].map(i=>`<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')+'</manifest><spine>'+[0,1,2].map(i=>`<itemref idref="c${i}"/>`).join('')+'</spine></package>');
for(let i=0;i<3;i++)zip.file(`c${i}.xhtml`,'<html xmlns="http://www.w3.org/1999/xhtml"><head><style>body{margin:24px;font:20px/1.8 Georgia}p{margin:0 0 24px}</style></head><body>'+Array.from({length:70},()=>'<p>'+sentence+'</p>').join('')+'</body></html>');
const inputs={pdf:{name:'scroll-diagnostic.pdf',mimeType:'application/pdf',buffer:pdfFixture()},epub:{name:'scroll-diagnostic.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer'})}};
const reports=[],failures=[];const browser=await engine.launch({headless:true,executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
try{
 for(const kind of ['pdf','epub'])for(const dark of [false,true])for(const condition of ['baseline','translation','help-ready','help-pending']){
  const name=`${engine.name()}-${kind}-${dark?'dark':'light'}-${condition}`;
  const context=await browser.newContext({viewport:{width:820,height:1180},deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{if(!e.message.startsWith('ResizeObserver loop'))errors.push(e.message);});
  try{
   await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
   await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
   await page.goto(url);await page.evaluate(()=>homeReady);
   await page.locator('#fileinput').setInputFiles(inputs[kind]);
   await page.waitForFunction(kind=>books.some(b=>b.kind===kind),kind,{timeout:120000});
   await page.evaluate(async({kind,dark})=>{darkMode=dark;applyDark();await openBook(books.find(b=>b.kind===kind));await switchReaderMode('original');}, {kind,dark});
   await page.waitForFunction(()=>!readerPositionPending(),{timeout:30000});
   if(kind==='pdf'){
    await page.evaluate(async()=>{await renderOriginalPdfPage(originalSession,4);const p=originalSession.pages[3];readerScrollTo(readerScrollTop()+p.getBoundingClientRect().top-120);});
    await page.waitForFunction(()=>pdfPagesInView(originalSession).every(n=>originalSession.settled.has(n)),{timeout:30000});
    await page.evaluate(async()=>{for(const n of pdfPagesInView(originalSession))await renderOriginalPdfPage(originalSession,n);});
   }else{
    await page.evaluate(()=>Promise.all(originalSession.frameGeometryReady));
    await page.evaluate(()=>readerScrollTo(2400));
   }
   await page.waitForTimeout(700);
   await page.evaluate(()=>{
    window.qaEvents=[];window.qaSamples=[];window.qaPhase='before';window.qaPending=null;
    for(const name of ['releaseOriginalPdfPage','paintOriginalPdfPage','closeSentence','clearReaderSentenceCue']){
     const original=window[name];window[name]=function(...args){
      const n=typeof args[1]==='number'?args[1]:null;
      qaEvents.push({t:performance.now(),phase:qaPhase,name,page:n,visible:n==null?null:pdfPagesInView(originalSession).includes(n),options:args[2]});
      return original.apply(this,args);
     };
    }
    window.qaSnapshot=()=>{
     const docs=[document,...(originalSession?.kind==='epub'?originalSession.frames.filter(Boolean).map(f=>f.contentDocument):[])];
     const box=readerScroller(),r=document.getElementById('readmain').getBoundingClientRect();
     return {sentenceOpen:sentenceLookupOpen(),modalHidden:document.getElementById('sentence-modal').hidden,
      easyAlive:!!sentenceEasyState,cues:docs.reduce((n,d)=>n+d.querySelectorAll('.reader-sentence-cue-layer').length,0),
      bodyClasses:[...document.body.classList].sort(),activeElement:document.activeElement?.id||document.activeElement?.tagName,
      scroll:[box.scrollTop,box.scrollLeft,box.scrollWidth,box.scrollHeight],readerSize:[r.width,r.height],
      pages:originalSession.kind==='pdf'?originalSession.pages.map(p=>{const c=p.querySelector('canvas'),r=p.getBoundingClientRect();return {page:+p.dataset.page,rect:[r.top+box.scrollTop,r.height],bitmap:c?[c.width,c.height]:null,settled:originalSession.settled.has(+p.dataset.page)};}):null,
      frames:originalSession.kind==='epub'?originalSession.frames.filter(Boolean).map(f=>[f.clientWidth,f.clientHeight]):null};
    };
    dictGet=async()=>({ko:'차분한 독자는 모든 단어와 의미를 함께 읽습니다.'});dictPut=async()=>{};setSentenceEasyCapability(true);
   });
   const before=await page.evaluate(()=>qaSnapshot());
   if(condition!=='baseline'){
    await page.evaluate(async({kind,condition})=>{
     const surface=READER_SURFACES.find(s=>s.name===kind);let found=null;
     if(kind==='pdf'){
      const p=originalSession.pages[3],b=originalSession.wordBoxes.get(4).find(b=>b.word==='patient'),r=p.getBoundingClientRect();
      found=surface.sentenceAt(r.left+(b.x+b.w/2)*r.width,r.top+(b.y+b.h/2)*r.height);
     }else for(let y=160;y<700&&!found;y+=20)for(let x=60;x<680&&!found;x+=30)found=surface.sentenceAt(x,y);
     if(!found)throw Error('No source sentence');found.paint();await openSentence(found.sentence,found);
     dictCall=()=>condition==='help-pending'?new Promise(resolve=>qaPending=resolve):Promise.resolve({explanation:'이 문장은 독자가 단어를 따로 떼어 보기보다 문장 안에서 의미를 연결하며 읽는다는 뜻이에요. 주어는 독자이고 중심 행동은 의미를 함께 이해하는 것입니다.'});
    },{kind,condition});
    await page.waitForFunction(()=>!document.getElementById('sentence-modal').hidden);
    if(condition.startsWith('help')){await page.locator('#ps-easy-button').click();if(condition==='help-ready')await page.waitForFunction(()=>!!sentenceEasyState?.text);}
   }
   await page.waitForTimeout(300);
   const open=await page.evaluate(()=>qaSnapshot());
   await page.screenshot({path:resolve(output,name+'-before-scroll.png')});
   // Identical physical-coordinate displacements. These cause genuine scroll
   // events, but do not claim to reproduce iOS's native finger/momentum path.
   await page.evaluate(async()=>{
    qaPhase='scroll';const box=readerScroller(),start=box.scrollTop;
    const offsets=[...Array.from({length:18},(_,i)=>(i+1)*80),...Array.from({length:36},(_,i)=>1440-(i+1)*80),...Array.from({length:18},(_,i)=>-1440+(i+1)*80)];
    for(const offset of offsets){box.scrollTop=start+offset;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     const visible=originalSession.kind==='pdf'?pdfPagesInView(originalSession):[];
     qaSamples.push({t:performance.now(),y:box.scrollTop,visible,empty:visible.filter(n=>{const c=originalSession.pages[n-1].querySelector('canvas');return !c||!c.width||!c.height;}),sentenceOpen:sentenceLookupOpen()});
    }qaPhase='settle';if(qaPending)qaPending({explanation:'늦은 응답은 닫힌 창을 다시 열면 안 됩니다.'});
   });
   await page.waitForTimeout(1000);
   if(kind==='pdf')await page.waitForFunction(()=>pdfPagesInView(originalSession).every(n=>originalSession.settled.has(n)),{timeout:30000});
   const after=await page.evaluate(()=>qaSnapshot()),events=await page.evaluate(()=>qaEvents),samples=await page.evaluate(()=>qaSamples);
   const row={name,engine:engine.name(),kind,dark,condition,before,open,after,events,samples,errors,
    summary:{emptyVisibleSamples:samples.filter(s=>s.empty.length).length,releaseVisible:events.filter(e=>e.name==='releaseOriginalPdfPage'&&e.visible).length,
     paints:events.filter(e=>e.name==='paintOriginalPdfPage').length,releases:events.filter(e=>e.name==='releaseOriginalPdfPage').length,
     maxCueLayers:Math.max(before.cues,open.cues,after.cues),closeCalls:events.filter(e=>e.name==='closeSentence').length}};
   reports.push(row);writeFileSync(resolve(output,name+'.json'),JSON.stringify(row,null,2));
   await page.screenshot({path:resolve(output,name+'-after-scroll.png')});
   assert.equal(after.sentenceOpen,false,'lookup reopened');assert.equal(after.modalHidden,true);assert.equal(after.easyAlive,false);assert.equal(after.cues,0,'outgoing sentence layer leaked');
   assert.deepEqual(after.readerSize,before.readerSize,'lookup changed reader dimensions');assert.deepEqual(after.scroll,before.scroll,'closed lookup changed final scroll geometry');
   assert.equal(row.summary.releaseVisible,0,'cache eviction cleared visible paper');
   if(kind==='epub')assert.deepEqual(after.frames,before.frames,'lookup changed EPUB frame geometry');
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({name,...row.summary}));
  }catch(error){await page.screenshot({path:resolve(output,name+'-failure.png')}).catch(()=>{});writeFileSync(resolve(output,name+'-failure.txt'),error.stack);failures.push({name,error:error.stack});console.error(name+': '+error.message);}
  finally{await context.close();writeFileSync(resolve(output,'report.json'),JSON.stringify({physicalIpadValidated:false,nativeMomentumEmulated:false,failures,reports},null,2));}
 }
 assert.deepEqual(failures,[],'diagnostic scenarios failed; inspect all preserved reports');
}finally{await browser.close();server.close();}
