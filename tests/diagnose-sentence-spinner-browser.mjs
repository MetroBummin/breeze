/* Observe request state, pointer gate, animation clock, main-thread cadence and
 * painted snapshots independently. Linux WebKit is NOT physical iPad WKWebView.
 * Only fixture text and mocked answers are used; all external traffic is denied. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.BREEZE_SPINNER_PROOF||'/tmp/breeze-sentence-spinner';mkdirSync(out,{recursive:true});
const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const sentence='A patient reader keeps every word and every meaning together while the sentence continues onto the next line.';
const reports=[],failures=[];
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' exceeded '+ms+' ms')),ms);})]);}finally{clearTimeout(timer);}}
const cases=['txt','pdf'].flatMap(kind=>[false,true].flatMap(reduced=>[false,true].map(dark=>({kind,reduced,dark,intervention:'none'}))));
// Diagnostic-only counterfactuals. They do not change the production stylesheet.
for(let round=0;round<3;round++){
 const controls=['none','no-pill-geometry-transition','no-pill-backdrop','passive-probe'];
 for(const intervention of [...controls.slice(round),...controls.slice(0,round)])cases.push({kind:'txt',reduced:false,dark:false,intervention,round});
}
try{
 for(const {kind,reduced,dark,intervention,round} of cases){
  const name=`${engine.name()}-${kind}-${dark?'dark':'light'}-${reduced?'reduced':'normal'}${intervention==='none'?'':'-'+intervention}${round==null?'':'-round'+round}`;
  const context=await engine.launchPersistentContext('',{headless:true,viewport:{width:820,height:1180},hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{if(!e.message.startsWith('ResizeObserver loop'))errors.push(e.message);});
  console.log('Starting '+name);
  const row={name,kind,reduced,dark,intervention,round,lastPhase:'setup',physicalIpadValidated:false,nativeMomentumEmulated:false,phases:[]};
  try{
   await bounded((async()=>{
   await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
   await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
   await page.goto(url);await page.evaluate(()=>homeReady);
   if(intervention==='no-pill-geometry-transition')await page.addStyleTag({content:'body.sentence-pill-waiting #readpill {transition-property:box-shadow!important}'});
   if(intervention==='no-pill-backdrop')await page.addStyleTag({content:'#readpill {backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'});
   row.lastPhase='import';await page.locator('#fileinput').setInputFiles(kind==='txt'?{name:'spinner.txt',mimeType:'text/plain',buffer:Buffer.from((sentence+'\n\n').repeat(60))}:{name:'spinner.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture(['A patient reader keeps every word and every meaning','together while the sentence continues onto the next line.'])});
   await page.waitForFunction(kind=>books.some(b=>b.kind===kind),kind,{timeout:30000});
   row.lastPhase='open-reader';await page.evaluate(async({kind,dark})=>{darkMode=dark;applyDark();await openBook(books.find(b=>b.kind===kind));if(kind==='pdf')await switchReaderMode('original');},{kind,dark});
   await page.waitForFunction(kind=>!readerPositionPending()&&(kind==='txt'?document.querySelectorAll('#rtext .w').length>20:originalSession?.wordBoxes.get(1)?.length>0),kind);
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
   await page.evaluate(()=>{
    window.qaCalls=[];window.qaResolve=null;window.qaSignal=null;window.qaFrameId=0;
    dictGet=async()=>null;dictPut=async()=>{};
    dictCall=(body,signal)=>{qaCalls.push(body);qaSignal=signal;return new Promise(resolve=>qaResolve=resolve);};
    window.qaSnapshot=()=>{
     const readStart=performance.now(),el=document.querySelector('.sentence-spinner'),a=el.getAnimations()[0],style=getComputedStyle(el),transform=style.transform,rect=el.getBoundingClientRect();
     return {t:performance.now(),probeReadMs:performance.now()-readStart,view:sentenceView,waiting:sentenceWaitingActive(),statusHidden:document.getElementById('sentence-pill-status').hidden,
      statusVisible:rect.width>0,bodyWaiting:document.body.classList.contains('sentence-pill-waiting'),held:sentenceGestureStillPressed(),pendingPaint:!!sentencePendingPaint,
      animationName:style.animationName,playState:a?.playState||null,currentTime:typeof a?.currentTime==='number'?a.currentTime:null,
      duration:style.animationDuration,transform,signalAborted:qaSignal?.aborted??null,calls:qaCalls.length};
    };
    window.qaSample=async({block=false,passive=false})=>{
     const samples=window.qaSamples=[qaSnapshot()],start=performance.now();let blocked=false;
     while(performance.now()-start<1400){await new Promise(r=>requestAnimationFrame(r));samples.push(passive?{t:performance.now(),probeReadMs:0}:qaSnapshot());
      if(block&&!blocked&&performance.now()-start>150){blocked=true;const until=performance.now()+350;while(performance.now()<until){/* Instrumentation positive control only. */}}
     }if(passive)samples.push(qaSnapshot());return samples;
    };
   });
   const point=await page.evaluate(kind=>{
    const surface=READER_SURFACES.find(s=>s.name===(kind==='txt'?'text':kind));
    if(kind==='pdf'){const p=originalSession.pages[0],r=p.getBoundingClientRect(),b=originalSession.wordBoxes.get(1).find(b=>b.word==='patient');return{x:r.left+(b.x+b.w/2)*r.width,y:r.top+(b.y+b.h/2)*r.height};}
    for(let y=140;y<580;y+=9)for(let x=30;x<600;x+=11)if(surface.sentenceAt(x,y)?.sentence.length>100)return{x,y};
    throw Error('No visible sentence');
   },kind);
   const cdp=engine===chromium?await context.newCDPSession(page):null;
   row.input=cdp?'trusted Chromium touch':'synthetic WebKit pointer';
   const press=async()=>{if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});else await page.evaluate(p=>{window.qaTouchTarget=document.elementFromPoint(p.x,p.y);qaTouchTarget.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:71,pointerType:'touch',isPrimary:true,clientX:p.x,clientY:p.y}));},point);};
   const release=async()=>{if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.evaluate(p=>qaTouchTarget.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:71,pointerType:'touch',isPrimary:true,clientX:p.x,clientY:p.y})),point);};
   const sample=async(phase,block=false)=>{
    row.lastPhase=phase;
    const samples=await bounded(page.evaluate(options=>qaSample(options),{block,passive:intervention==='passive-probe'}),6000,name+': '+phase+' frame sampling'),first=samples[0],last=samples.at(-1),fullSamples=samples.filter(s=>s.view);
    const gaps=samples.slice(1).map((s,i)=>s.t-samples[i].t),summary={frames:samples.length,maxFrameGapMs:Math.max(...gaps),over100Ms:gaps.filter(g=>g>100).length,
     elapsedMs:last.t-first.t,firstFrameDelayMs:samples[1]?.t-first.t,maxProbeReadMs:Math.max(...samples.map(s=>s.probeReadMs)),animationAdvanceMs:last.currentTime-first.currentTime,distinctTransforms:new Set(fullSamples.map(s=>s.transform)).size};
    row.phases.push({phase,summary,samples});
    assert.ok(fullSamples.every(s=>s.waiting&&!s.statusHidden&&s.statusVisible&&s.bodyWaiting&&s.playState==='running'),phase+': visible waiting animation did not remain running');
    assert.ok(summary.animationAdvanceMs>=summary.elapsedMs*.7,phase+': animation clock did not track the sampled wall-time window');assert.ok(summary.distinctTransforms>(intervention==='passive-probe'?1:10),phase+': transform samples did not change');
    if(block)assert.ok(summary.maxFrameGapMs>250,'positive control did not detect the injected stall');
    return summary;
   };
   row.lastPhase='long-press';await press();await page.waitForFunction(()=>sentenceWaitingActive()&&qaCalls.length===1&&sentenceGestureStillPressed());
   await sample('network-pending-finger-held');
   // Real completed response remains gated until the opening pointer is released.
   await page.evaluate(()=>qaResolve({ko:'차분한 독자는 단어와 의미를 함께 읽습니다.'}));
   await page.waitForFunction(()=>!!sentencePendingPaint);await sample('response-ready-finger-held');
   assert.equal(await page.locator('#sentence-modal').isVisible(),false);
   await release();await page.waitForFunction(()=>!sentenceWaitingActive()&&!document.getElementById('sentence-modal').hidden);
   assert.equal(await page.locator('#ps-ko').innerText(),'차분한 독자는 단어와 의미를 함께 읽습니다.');
   await page.evaluate(()=>closeSentence());
   // Same DOM spinner reused across repeated interrupted and completed lifetimes.
   for(let repeat=0;repeat<3;repeat++){
    await page.evaluate(sentence=>{qaSignal=null;qaResolve=null;window.qaOpening=openSentence(sentence,{pi:0});},sentence);
    await page.waitForFunction(()=>sentenceWaitingActive()&&qaSignal&&!qaSignal.aborted&&qaCalls.at(-1)?.op==='explain');
    await sample('repeat-'+repeat+'-released');
    if(repeat===0){await page.evaluate(()=>{closeSentence();qaResolve({ko:'Stale answer'});});await page.evaluate(()=>qaOpening);assert.equal(await page.locator('#sentence-modal').isVisible(),false);}
    else {await page.evaluate(()=>qaResolve({ko:'Repeated completed answer'}));await page.evaluate(()=>qaOpening);assert.equal(await page.locator('#sentence-modal').isVisible(),true);await page.evaluate(()=>closeSentence());}
   }
   // Exercise the separately reported preceding easy-explanation lifecycle, without
   // assuming it causes this symptom. Its response is a local mocked fixture.
   await page.evaluate(async sentence=>{dictGet=async()=>({ko:'A fixture translation'});await openSentence(sentence,{pi:0});setSentenceEasyCapability(true);},sentence);
   await page.locator('#ps-easy-button').click();await page.waitForFunction(()=>sentenceEasyState?.loading);
   await page.evaluate(()=>qaResolve({explanation:'이 문장은 독자가 단어와 문장의 의미를 함께 살펴보며 읽는다는 뜻입니다.'}));
   await page.waitForFunction(()=>!!sentenceEasyState?.text);await page.waitForTimeout(350);
   await page.evaluate(sentence=>{closeSentence();dictGet=async()=>null;qaSignal=null;qaResolve=null;window.qaOpening=openSentence(sentence,{pi:0});},sentence);
   await page.waitForFunction(()=>sentenceWaitingActive()&&qaSignal&&!qaSignal.aborted&&qaCalls.at(-1)?.op==='explain');
   await sample('pending-after-easy-explanation');
   const hashes=[],box=await page.locator('.sentence-spinner').boundingBox();assert.ok(box,'spinner missing before painted sampling');
   const clip={x:box.x+box.width/2-14,y:box.y+box.height/2-14,width:28,height:28};
   for(let i=0;i<4;i++){const bytes=await page.screenshot({path:resolve(out,name+`-paint-${i}.png`),clip,animations:'allow',timeout:3000});hashes.push(createHash('sha256').update(bytes).digest('hex'));await page.waitForTimeout(137);}
   row.distinctPaintedSnapshots=new Set(hashes).size;assert.ok(row.distinctPaintedSnapshots>1,'painted loading indicator snapshots are identical');
   if(kind==='txt'&&!dark&&!reduced&&intervention==='none'&&round==null)await sample('injected-350ms-main-thread-block-positive-control',true);
   await page.evaluate(()=>{closeSentence();qaResolve({ko:'Late answer'});});await page.evaluate(()=>qaOpening);
   assert.equal(await page.locator('#sentence-pill-status').isVisible(),false);assert.equal(await page.locator('#sentence-modal').isVisible(),false);
   assert.deepEqual(errors,[]);row.lastPhase='complete';console.log(JSON.stringify({name,input:row.input,distinctPaintedSnapshots:row.distinctPaintedSnapshots,phases:row.phases.map(p=>({phase:p.phase,...p.summary}))}));
   })(),45000,name+' case');
  }catch(error){row.failure=error.stack;failures.push({name,error:error.stack});row.partialSamples=await bounded(page.evaluate(()=>window.qaSamples||[]),2000,name+' partial samples').catch(()=>[]);await page.screenshot({path:resolve(out,name+'-failure.png'),timeout:3000}).catch(()=>{});console.error(name,error.stack);}
  finally{row.errors=errors;reports.push(row);writeFileSync(resolve(out,name+'.json'),JSON.stringify(row,null,2));writeFileSync(resolve(out,'report.json'),JSON.stringify({physicalIpadValidated:false,failures,reports},null,2));await context.close();}
 }
 assert.deepEqual(failures,[],'spinner diagnostics failed; inspect preserved phase and screen evidence');
}finally{server.close();}
