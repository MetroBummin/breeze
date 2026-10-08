/* Real PDF glyph/cue UI and controlled dictionary transport. Touch lists exercise
   the production pinch owner; physical WebView/Pencil validation stays separate. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=resolve(process.env.BREEZE_QA_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const output=process.env.BREEZE_QA_OUTPUT;
if(output)mkdirSync(output,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const reports=[];
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const context=await engine.launchPersistentContext('',{headless:true,viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block',executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined,...(output?{recordVideo:{dir:output,size:{width:820,height:1180}}}:{})});
 try{
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'pending-pinch.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture(['A patient reader keeps every meaning together.', 'A different word belongs to a different sentence.'])});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForFunction(()=>originalSession?.wordBoxes.get(1)?.length&&!readerPositionPending());
 await page.evaluate(()=>{
  sb={auth:{getSession:async()=>({data:{session:null}})}};sbUser={id:'qa-pinch'};
  window.qaCache=new Map();dictGet=async key=>qaCache.get(key)||null;dictPut=async(key,value)=>qaCache.set(key,value);fillDictionaryMetadata=async()=>{};
  window.qaRequests=[];
  // Match dictCall's production abort contract: an aborted transport returns null.
  // Resolving its delayed gate later still exercises the obsolete completion path.
  dictCall=(payload,signal)=>new Promise(resolve=>{
   const finish=value=>resolve(signal?.aborted?null:value);
   qaRequests.push({payload,signal,resolve:finish});
   signal?.addEventListener('abort',()=>finish(null),{once:true});
  });
  window.qaTouch=(type,ids,spread=100)=>{
   const target=document.querySelector('.pdf-source-page canvas');
   const touch=id=>({identifier:id,touchType:'direct',target,clientX:200+(id===1?-spread:spread)/2,clientY:170});
   const event=new Event(type,{bubbles:true,cancelable:true});
   Object.defineProperties(event,{touches:{value:ids.map(touch)},changedTouches:{value:(type==='touchend'?[1,2]:ids).map(touch)}});target.dispatchEvent(event);
  };
  window.qaOpen=kind=>{
   closePanel();closeSentence();cancelOriginalPinch();setOriginalZoom(1);readerScrollTo(0);
   const paper=originalSession.pages[0],box=originalSession.wordBoxes.get(1).find(b=>b.word==='patient');
   delete words.patient;delete words.different;qaCache.clear();
   if(kind==='word')openPdfWord(paper,box);
   else {
    const r=paper.getBoundingClientRect(),surface=READER_SURFACES.find(s=>s.name==='pdf');
    const found=surface.sentenceAt(r.left+(box.x+box.w/2)*r.width,r.top+(box.y+box.h/2)*r.height);
    found.paint();openSentence(found.sentence,found);
   }
   window.qaLife=kind==='word'?wordLookupLife:sentenceLife;
   window.qaNode=kind==='word'?activeSelectedWordNode:readerSentenceCue.layer;
  };
  window.qaState=kind=>({alive:kind==='word'?wordLookupAlive(qaLife):sentenceAlive(qaLife),
   pending:kind==='word'?wordPeekPending():sentenceWaitingActive(),connected:qaNode.isConnected,
   shimmer:qaNode.classList.contains(kind==='word'?'breeze-lookup-pending':'is-pending'),
   requests:qaRequests.length,aborted:!!qaRequests.at(-1)?.signal?.aborted,
   animation:qaNode.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations===Infinity).map(a=>({state:a.playState,time:a.currentTime})),
   result:kind==='word'?!document.getElementById('word-peek').hidden:!document.getElementById('sentence-modal').hidden});
  window.qaResolve=(index,ko='테스트 뜻')=>{
   const req=qaRequests[index],p=req.payload;
   req.resolve(p.op==='explain'?{ko}:{kind:'word',canonical:p.word,members:[p.clickedIndex],ko});
  };
 });
 const open=async kind=>{
  const count=await page.evaluate(()=>qaRequests.length);
  await page.evaluate(kind=>qaOpen(kind),kind);
  await page.waitForFunction(n=>qaRequests.length===n+1,count);
  await page.waitForFunction(kind=>qaState(kind).shimmer,kind);
  return count;
 };
 for(const [width,height] of (process.env.BREEZE_QA_EXPECT_BROKEN?[[820,1180]]:[[390,844],[820,1180],[1440,900],[844,390]]))for(const dark of (process.env.BREEZE_QA_EXPECT_BROKEN?[false]:[false,true])){
 await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
 for(const kind of ['word','sentence']){
  const request=await open(kind);
  await page.evaluate(()=>qaTouch('touchstart',[1,2]));
  const before=await page.evaluate(kind=>qaState(kind),kind);
  reports.push({engine:engine.name(),width,height,dark,kind,phase:'pinch-start',...before});
  if(process.env.BREEZE_QA_EXPECT_BROKEN){
   assert.equal(before.alive,false);assert.equal(before.shimmer,false);
   await page.evaluate(index=>{qaTouch('touchend',[]);qaResolve(index);},request);continue;
  }
  assert.equal(before.alive,true);assert.equal(before.shimmer,true);assert.equal(before.aborted,false);
  await page.waitForTimeout(100);
  for(const spread of [150,65,170,80]){
   await page.evaluate(spread=>qaTouch('touchmove',[1,2],spread),spread);
   await page.waitForTimeout(100);
   const state=await page.evaluate(kind=>qaState(kind),kind);
   assert.equal(state.connected,true);assert.equal(state.shimmer,true);assert.equal(state.requests,request+1);
   assert.ok(state.animation.length>0&&state.animation.every(a=>a.state==='running'));
   assert.ok(state.animation[0].time>before.animation[0].time,'pending reflection kept advancing');
  }
  await page.evaluate(()=>qaTouch('touchend',[]));
  await page.waitForTimeout(300);
  assert.equal((await page.evaluate(kind=>qaState(kind),kind)).shimmer,true,'commit/repaint lost pending');
  // Completion during a second pinch must save once and wait for release.
  await page.evaluate(()=>qaTouch('touchstart',[1,2]));
  await page.evaluate(index=>qaResolve(index),request);
  await page.waitForFunction(kind=>!qaState(kind).shimmer,kind);
  assert.equal((await page.evaluate(kind=>qaState(kind),kind)).result,false,'answer covered active pinch');
  await page.evaluate(()=>{qaTouch('touchmove',[1,2],130);qaTouch('touchend',[]);});
  await page.waitForFunction(kind=>qaState(kind).result,kind);
  assert.equal((await page.evaluate(kind=>qaState(kind),kind)).requests,request+1);
  if(kind==='word'){
   assert.equal(await page.evaluate(()=>words.patient.ko),'테스트 뜻');
   await page.evaluate(()=>{closePanel();openPdfWord(originalSession.pages[0],originalSession.wordBoxes.get(1).find(b=>b.word==='patient'));});
   await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
   assert.equal(await page.evaluate(()=>qaRequests.length),request+1,'saved reopen called API');
  }
  else {
   await page.evaluate(()=>{const origin=sentenceOrigin,asked=sentAsked;closeSentence();origin.paint();openSentence(asked,origin);});
   await page.waitForFunction(()=>!document.getElementById('sentence-modal').hidden);
   assert.equal(await page.evaluate(()=>qaRequests.length),request+1,'cached sentence reopen called API');
  }
  // Ready surfaces keep their established pinch dismissal.
  await page.evaluate(()=>{qaTouch('touchstart',[1,2]);qaTouch('touchend',[]);});
  assert.equal(await page.evaluate(kind=>kind==='word'?wordLookupOpen():sentenceLookupOpen(),kind),false);
  for(const ending of ['cancel','blur','noncancelable']){
   const held=await open(kind);await page.evaluate(()=>qaTouch('touchstart',[1,2]));
   await page.evaluate(ending=>{
    if(ending==='cancel'){const target=document.querySelector('.pdf-source-page canvas'),e=new Event('touchcancel',{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:[]},changedTouches:{value:[{identifier:1},{identifier:2}]}});target.dispatchEvent(e);}
    else if(ending==='blur')window.dispatchEvent(new Event('blur'));
    else {const target=document.querySelector('.pdf-source-page canvas'),e=new Event('touchmove',{bubbles:true,cancelable:false});Object.defineProperties(e,{touches:{value:[]},changedTouches:{value:[]}});target.dispatchEvent(e);}
   },ending);
   assert.equal(await page.evaluate(()=>originalPinchBusy()),false);
   assert.equal((await page.evaluate(kind=>qaState(kind),kind)).shimmer,true,ending+' lost pending');
   await page.evaluate(index=>qaResolve(index),held);await page.waitForFunction(kind=>qaState(kind).result,kind);
  }
  for(const action of ['close','switch','reopen']){
   const stale=await open(kind);
   await page.evaluate(()=>qaTouch('touchstart',[1,2]));
   await page.evaluate(({kind,action})=>{
    kind==='word'?closePanel():closeSentence();
    if(action==='switch')openPdfWord(originalSession.pages[0],originalSession.wordBoxes.get(1).find(b=>b.word==='different'));
    if(action==='reopen')qaOpen(kind);
   },{kind,action});
   const current=await page.evaluate(()=>({word:wordLookupLife,sentence:sentenceLife,key:selKey}));
   await page.evaluate(index=>{qaResolve(index,'오래된 뜻');qaTouch('touchend',[]);},stale);
   await page.waitForTimeout(300);
   assert.deepEqual(await page.evaluate(()=>({word:wordLookupLife,sentence:sentenceLife,key:selKey})),current);
   const stalePaint=await page.evaluate(()=>({word:document.getElementById('word-peek-meaning').textContent,sentence:document.getElementById('ps-ko').textContent,wordVisible:!document.getElementById('word-peek').hidden,sentenceVisible:!document.getElementById('sentence-modal').hidden}));
   assert.equal(stalePaint.word==='오래된 뜻'||stalePaint.sentence==='오래된 뜻',false,JSON.stringify({width,dark,kind,action,stalePaint}));
   await page.evaluate(()=>{closePanel();closeSentence();});
   assert.equal(await page.locator('.breeze-lookup-pending,.reader-sentence-cue-layer.is-pending').count(),0);
  }
 }
 }
 assert.deepEqual(errors,[]);console.log(engine.name()+': PDF pending pinch '+(process.env.BREEZE_QA_EXPECT_BROKEN?'baseline reproduced':'regressions passed'));
 }finally{await context.close();}
}}finally{server.close();if(output)writeFileSync(resolve(output,'pending-pinch.json'),JSON.stringify(reports,null,2));}
