import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=process.env.BREEZE_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
   await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
   await page.goto(url);await page.evaluate(()=>homeReady);
   await page.evaluate(()=>{
    window.resumeQA={transitions:[],opens:0,originalReads:0};
    const nativeTransition=document.startViewTransition.bind(document);
    window.resumeQA.transition=document.startViewTransition=callback=>{
      const result=nativeTransition(callback),entry={ready:false,error:'',finished:false};
      resumeQA.transitions.push(entry);
      result.ready.then(()=>entry.ready=true,error=>entry.error=error.name);
      result.finished.then(()=>entry.finished=true,()=>{});
      return result;
    };
    resumeQA.repair=repairBookLigatures;resumeQA.open=openBook;resumeQA.render=renderOriginalBook;
    originalGetForBook=async book=>{resumeQA.originalReads++;return {kind:book.kind,hash:'fixture'};};
    openBook=(book,options)=>{resumeQA.opens++;return resumeQA.open(book,options);};
    resumeQA.seed=(kind='txt')=>{
      show('home');readerNotices.reset();resumeQA.transitions=[];resumeQA.opens=0;resumeQA.originalReads=0;
      books=[{id:'resume-fixture',title:'Resume fixture',kind,paras:Array.from({length:60},()=>('A gentle breeze makes reading feel easy. ').repeat(8))}];
      positions={'resume-fixture':{t:1,p:.2,y:900,mode:kind==='txt'?'text':'original'}};
      renderHomeResume();
    };
    resumeQA.seed();
   });
   // Normal text: exactly one transition, no live Reader scaling, saved scroll retained.
   await page.locator('#home-resume').click();
   await page.waitForFunction(()=>!homeResumeOpening);
   assert.deepEqual(await page.evaluate(()=>resumeQA.transitions),[{ready:true,error:'',finished:true}]);
   assert.equal(await page.evaluate(()=>readerScrollTop()),900);
   assert.equal(await page.locator('#readmain').evaluate(n=>getComputedStyle(n).transform),'none');
   // Slow preparation exceeds the old timeout but never enters a timed callback.
   await page.evaluate(()=>{resumeQA.seed();repairBookLigatures=()=>new Promise(resolve=>resumeQA.releasePreparation=resolve);});
   await page.locator('#home-resume').click();
   await page.evaluate(()=>{resumeHomeBook(document.getElementById('home-resume'));resumeHomeBook(document.getElementById('home-resume'));});
   await page.waitForTimeout(4500);
   assert.equal(await page.locator('#v-home').isVisible(),true);
   assert.equal(await page.evaluate(()=>resumeQA.transitions.length),0);
   assert.equal(await page.locator('#home-resume').getAttribute('aria-busy'),'true');
   await page.evaluate(()=>resumeQA.releasePreparation());await page.waitForFunction(()=>!homeResumeOpening);
   assert.equal(await page.evaluate(()=>resumeQA.opens),1);
   assert.deepEqual(await page.evaluate(()=>resumeQA.transitions),[{ready:true,error:'',finished:true}]);
   // PDF/EPUB keep their real loading shell while heavy rendering is pending.
   for(const kind of ['pdf','epub']){
    await page.evaluate(kind=>{
      repairBookLigatures=resumeQA.repair;resumeQA.seed(kind);
      renderOriginalBook=()=>{
        document.getElementById('original-content').innerHTML='<div class="original-loading"><i></i><span>원본을 여는 중…</span></div>';
        return new Promise(resolve=>resumeQA.releaseRender=resolve);
      };
    },kind);
    await page.locator('#home-resume').click();
    await page.waitForFunction(()=>resumeQA.transitions[0]?.finished,{},{timeout:2500});
    assert.equal(await page.evaluate(()=>homeResumeOpening),true,'rendering was abandoned');
    assert.equal(await page.locator('#originalwrap').isVisible(),true);
    assert.equal(await page.locator('.original-loading').isVisible(),true);
    await page.waitForTimeout(4500);
    assert.deepEqual(await page.evaluate(()=>resumeQA.transitions),[{ready:true,error:'',finished:true}]);
    assert.equal(await page.evaluate(()=>resumeQA.originalReads),1,'prepared original was loaded twice');
    await page.evaluate(()=>{show('home');resumeQA.releaseRender();});
    await page.waitForFunction(()=>!homeResumeOpening);
    assert.equal(await page.evaluate(()=>activeAppView()),'home','late render reopened Reader');
   }
   // Navigation during preparation cancels without opening or changing progress/history.
   await page.evaluate(()=>{renderOriginalBook=resumeQA.render;resumeQA.seed();repairBookLigatures=()=>new Promise(resolve=>resumeQA.releasePreparation=resolve);});
   await page.locator('#home-resume').click();
   await page.evaluate(()=>show('vocab'));
   const before=await page.evaluate(()=>({history:history.length,positions:JSON.stringify(positions)}));
   await page.evaluate(()=>resumeQA.releasePreparation());await page.waitForFunction(()=>!homeResumeOpening);
   assert.equal(await page.evaluate(()=>resumeQA.opens),0);
   assert.equal(await page.evaluate(()=>activeAppView()),'vocab');
   assert.deepEqual(await page.evaluate(()=>({history:history.length,positions:JSON.stringify(positions)})),before);
   // Failed preparation releases the single-flight lock and supports the next tap.
   await page.evaluate(()=>{resumeQA.seed();repairBookLigatures=async()=>{throw Error('fixture preparation failure');};});
   await page.locator('#home-resume').click();await page.waitForFunction(()=>!homeResumeOpening);
   assert.equal(await page.evaluate(()=>activeAppView()),'home');
   assert.equal(await page.locator('#home-resume').getAttribute('aria-busy'),null);
   await page.evaluate(()=>{repairBookLigatures=resumeQA.repair;readerNotices.reset();});
   await page.locator('#home-resume').click();await page.waitForFunction(()=>!homeResumeOpening);
   assert.equal(await page.evaluate(()=>activeAppView()),'read');
   // Reduced motion and API fallback both keep the same book/position behavior.
   for(const fallback of [false,true]){
    await page.emulateMedia({reducedMotion:fallback?'no-preference':'reduce'});
    await page.evaluate(fallback=>{resumeQA.seed();document.startViewTransition=fallback?undefined:resumeQA.transition;},fallback);
    await page.locator('#home-resume').click();await page.waitForFunction(()=>!homeResumeOpening);
    assert.equal(await page.evaluate(()=>resumeQA.transitions.length),0);
    assert.equal(await page.evaluate(()=>readerScrollTop()),900);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('home-resuming')),false);
   assert.deepEqual(errors,[]);
   console.log(engine.name()+': Home resume normal/slow preparation, PDF/EPUB pending rendering, duplicate taps, navigation cancellation, failure, fallback and scroll passed');
  }finally{await browser.close();}
 }
}finally{await new Promise(done=>server.close(done));}
