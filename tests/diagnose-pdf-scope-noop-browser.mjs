/* Causal counterfactual: the same no-op HTML class removal that the 8-second
 * fail-open boot timer performs must not force a full PDF-paper geometry read.
 * The old and guarded observers are served only inside this isolated fixture.
 */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_SCOPE_PROOF||'/tmp/breeze-pdf-scope-noop';mkdirSync(proof,{recursive:true});
const source=readFileSync(new URL('../scripts/reader/pdf-ink.js',import.meta.url),'utf8');
const needle="      if(!(node instanceof Element)||node.closest('.pdf-ink-layer'))continue;";
const guard="      if(record.type==='attributes'&&record.attributeName&&record.oldValue===node.getAttribute(record.attributeName))continue;";
assert.ok(source.includes(needle),'observer boundary changed');
assert.equal(source.split(guard).length,2,'the exact guarded production observer must be present');
const before=source.replace(guard+'\n','');
const after=source;
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium,reports=[];
try{
 for(const [variant,inkSource] of [['before',before],['after',after]]){
  const context=await engine.launchPersistentContext('',{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>{
    const target=r.request().url();
    if(target.startsWith(url)&&new URL(target).pathname==='/scripts/reader/pdf-ink.js')return r.fulfill({contentType:'text/javascript',body:inkSource});
    return target.startsWith(url)||target.startsWith('blob:')?r.continue():r.abort();
   });
   await page.addInitScript(()=>{window.breezeInkIPad=true;localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
   await page.goto(url);await page.evaluate(()=>homeReady);
   await page.locator('#fileinput').setInputFiles({name:'scope-noop.pdf',mimeType:'application/pdf',buffer:fixturePdf(12)});
   await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
   await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');await document.fonts.ready;});
   await page.waitForFunction(()=>!readerPositionPending()&&!!originalSession&&!originalSession.paintActive&&!originalSession.paintQueue?.size);
   // Deliver existing setup mutations before warming. No test assertion waits
   // for the no-op under investigation: that mutation is forced after warm.
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   for(const mutation of ['none','absent-boot-class','real-root-class']){
    const result=await page.evaluate(async mutation=>{
     let reads=0;const pages=originalSession.pages,rects=pages.map(p=>p.getBoundingClientRect.bind(p));
     pdfPageLayout(originalSession);await Promise.resolve();
     const key=originalSession.pageLayout.key,identity=originalSession.pageLayout;
     pages.forEach((p,i)=>p.getBoundingClientRect=()=>{reads++;return rects[i]();});
     try{
      if(mutation==='absent-boot-class'){
       if(document.documentElement.classList.contains('boot-pending'))throw Error('boot must already be complete');
       document.documentElement.classList.remove('boot-pending');
      }
      if(mutation==='real-root-class')document.documentElement.classList.toggle('qa-scope-real-change');
      for(let i=0;i<6;i++){setReaderChrome(i%2===0);await new Promise(r=>requestAnimationFrame(r));pdfPageLayout(originalSession);}
      await Promise.all(document.getElementById('readchrome').getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));
      await new Promise(r=>requestAnimationFrame(r));pdfPageLayout(originalSession);
      return {reads,pages:pages.length,key,finalKey:originalSession.pageLayout.key,sameCache:identity===originalSession.pageLayout};
     }finally{pages.forEach((p,i)=>p.getBoundingClientRect=rects[i]);}
    },mutation);
    const row={engine:engine.name(),variant,mutation,...result};reports.push(row);console.log('PDF scope causal proof '+JSON.stringify(row));
    writeFileSync(resolve(proof,engine.name()+'.json'),JSON.stringify(reports,null,2));
    const expected=mutation==='real-root-class'||(variant==='before'&&mutation==='absent-boot-class')?12:0;
    assert.equal(result.reads,expected,'no-op counterfactual or real-change positive control differs');
    assert.equal(result.key,result.finalKey,'controlled chrome/root mutation changed PDF layout key');
   }
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
}finally{server.close();}
