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
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.evaluate(async()=>{
   books=[{id:'refinement',title:'Quiet reading',kind:'txt',paras:Array.from({length:150},()=>('We take the time to read. A patient reader keeps reading every day. ').repeat(4))}];
   await openBook(books[0]);
  });
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  for(const fraction of [.1,.5,.95]){
   await page.evaluate(f=>readerScrollTo((readerContentHeight()-readerViewHeight())*f),fraction);
   await page.waitForFunction(()=>[...document.querySelectorAll('#rtext .w')].some(n=>n.textContent==='take'&&n.getBoundingClientRect().top>100&&n.getBoundingClientRect().bottom<600));
   const result=await page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('#rtext [data-word-spans="1"] .w')];
    const target=nodes.find(n=>n.textContent==='take'&&n.getBoundingClientRect().top>100&&n.getBoundingClientRect().bottom<600);
    const paragraph=target.closest('[data-pi]'),text=target.firstChild,top=target.getBoundingClientRect().top,scroll=readerScrollTop();
    words['take time']={word:'take time',ko:'시간을 들이다',phraseParts:['take','time'],phraseGaps:[1],status:2,addedAt:1,up:1};
    refreshReaderWords();
    const promoted=target.dataset.w;
    delete words['take time'];refreshReaderWords();
    return {promoted,demoted:target.dataset.w,same:target.isConnected&&target.firstChild===text&&target.closest('[data-pi]')===paragraph,delta:target.getBoundingClientRect().top-top,scrollDelta:readerScrollTop()-scroll};
   });
   assert.deepEqual(result,{promoted:'take time',demoted:'take',same:true,delta:0,scrollDelta:0});
  }
  // Expansion room determines the side, including toolbar and short landscape bounds.
  for(const [width,height] of [[390,844],[844,390],[320,568]]){
   await page.setViewportSize({width,height});
   for(const [y,expected] of [[70,'below'],[height-150,'above']]){
    const geometry=await page.evaluate(y=>{
     words.test={word:'test',ko:'시험',status:1,addedAt:1};selKey='test';wordPeekActive=true;
     wordPeekAnchor={left:40,right:90,top:y,bottom:y+22,width:50,height:22,direction:null};
     renderWordPeek();placeWordPeek();
     const r=document.getElementById('word-peek').getBoundingClientRect();
     return {direction:wordPeekAnchor.direction,top:r.top,bottom:r.bottom,left:r.left,right:r.right};
    },y);
    assert.equal(geometry.direction,expected);assert.ok(geometry.top>=15&&geometry.bottom<=height-15&&geometry.left>=15&&geometry.right<=width-15);
    await page.evaluate(()=>closePanel());
   }
  }
  await page.setViewportSize({width:390,height:844});
  // Let the real resize observer finish preserving its old anchor before moving.
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  // Reverse transition resolves, saves position, and forward resume restores it.
  await page.evaluate(()=>readerScrollTo(1200));
  await page.evaluate(()=>returnHomeFromReader());
  assert.equal(await page.evaluate(()=>activeAppView()),'home');
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('home-returning')),false);
  await page.evaluate(()=>resumeHomeBook(document.getElementById('home-resume')));
  assert.ok(Math.abs(await page.evaluate(()=>readerScrollTop())-1200)<2);
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>returnHomeFromReader());
  for(const p of [.429,.999,1]){
   const labels=await page.evaluate(p=>{
    positions.refinement={p,t:Date.now()};renderHome();
    return {pill:document.getElementById('home-resume-percent').textContent,card:nowReadingLabel(books[0],'refinement')};
   },p);
   const percent=p===1?'100%':`${Math.floor(p*100)}%`;
   assert.equal(labels.pill,percent);assert.ok(labels.card.includes(percent+' 읽음'));
  }
  // Native export sends actual CSV and owns the button until completion/cancel.
  await page.evaluate(()=>{
   words={test:{word:'test',ko:'시험, 검사',status:2,addedAt:1,example:'A "test".'}};show('vocab');
   window.exportRequests=[];window.webkit={messageHandlers:{breezeVocabularyExport:{postMessage:request=>exportRequests.push(request)}}};
  });
  await page.locator('#btn-export').click();
  assert.equal(await page.locator('#btn-export').isDisabled(),true);
  const csv=await page.evaluate(()=>exportRequests[0].csv);
  assert.equal(csv.charCodeAt(0),0xfeff);assert.ok(csv.includes('"시험, 검사"'));assert.ok(csv.includes('"A ""test""."'));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('breeze-vocabulary-export',{detail:{id:exportRequests[0].id,error:''}})));
  await page.waitForFunction(()=>!document.getElementById('btn-export').disabled);
  await page.evaluate(()=>{delete window.webkit;Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError')}});document.getElementById('toast').classList.remove('on');});
  await page.locator('#btn-export').click();await page.waitForFunction(()=>!document.getElementById('btn-export').disabled);
  assert.equal(await page.locator('#toast').evaluate(n=>n.classList.contains('on')),false,'Cancelling export showed an error');
  await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});});
  const download=page.waitForEvent('download');await page.locator('#btn-export').click();
  assert.equal((await download).suggestedFilename(),'breeze_vocab.csv');
  assert.deepEqual(errors,[]);
  console.log(`${engine.name()}: stable expression tokens at 3 depths, expandable pill bounds, reverse/resume, fractional progress, native CSV, cancellation and download passed`);
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
