import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launchPersistentContext('',{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const out='/tmp/breeze-sentence-help-proof';mkdirSync(out,{recursive:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 const sentence='Although it was late, she kept reading.';
 await page.locator('#fileinput').setInputFiles({name:'sentence-help.txt',mimeType:'text/plain',buffer:Buffer.from('The room was quiet.\n\n'+sentence+'\n\n'+('She wanted to finish the book.\n\n').repeat(80))});
 await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));await page.evaluate(()=>openBook(books.find(b=>b.kind==='txt')));
 await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
 await page.evaluate(()=>{
  setSentenceEasyCapability(true);window.qaCalls=[];window.qaPending=[];window.qaWrites=[];
  dictGet=async()=>({ko:'늦은 시간이었지만 그녀는 계속 읽었다.'});dictPut=async(key,value)=>qaWrites.push({key,value});
  dictCall=(body,signal)=>new Promise(resolve=>{qaCalls.push(body);qaPending.push({resolve,signal});});
  window.qaOrigin={pi:1,start:0};window.qaWords=JSON.stringify(words);
 });
 const open=()=>page.evaluate(sentence=>openSentence(sentence,qaOrigin),sentence);
 const closed=async()=>assert.equal(await page.evaluate(()=>!sentenceLookupOpen()&&document.getElementById('sentence-modal').hidden),true);
 await open();await page.evaluate(()=>setSentenceEasyCapability(false));
 assert.equal(await page.locator('#ps-easy').isVisible(),false,'undeployed capability is advertised');
 const unsupportedCalls=await page.evaluate(()=>qaCalls.length);await page.evaluate(()=>requestSentenceEasyExplanation());
 assert.equal(await page.evaluate(()=>qaCalls.length),unsupportedCalls);await page.evaluate(()=>setSentenceEasyCapability(true));
 assert.equal(await page.locator('#ps-source').isVisible(),false);
 assert.equal(await page.locator('#ps-en').textContent(),'');assert.equal(await page.locator('#p-sentence').getAttribute('aria-modal'),'false');
 assert.equal(await page.evaluate(()=>qaCalls.length),0,'help prefetched');
 await page.locator('#ps-easy-button').click();await page.evaluate(()=>requestSentenceEasyExplanation());
 assert.equal(await page.evaluate(()=>qaCalls.length),1,'duplicate explicit request');
 assert.deepEqual(await page.evaluate(()=>qaCalls[0].before),['The room was quiet.']);
 assert.equal(await page.locator('#ps-easy-skeleton').isVisible(),true);
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
  // Crossing the existing sheet/modal boundary ends the lifetime. Reopen and
  // explicitly request the same pending state to verify each real layout.
  if(await page.evaluate(()=>!sentenceLookupOpen())){await open();await page.locator('#ps-easy-button').click();}
  await page.locator('#ps-easy-card').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#p-sentence').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  const box=await page.locator('#p-sentence').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1);
  await page.screenshot({path:`${out}/${engine.name()}-loading-${width}x${height}-${dark?'dark':'light'}.png`});
 }
 await page.evaluate(()=>qaPending.at(-1).resolve({explanation:'늦은 시간과 계속 읽는 행동을 대비해요. Although 뒤는 배경이고 she kept reading이 중심 행동이에요.'}));
 await page.waitForFunction(()=>!sentenceEasyState.loading);assert.equal(await page.locator('#ps-easy-button').isVisible(),false);
 assert.equal(await page.locator('#ps-easy-retry').isVisible(),false);
 const calls=await page.evaluate(()=>qaCalls.length);await page.evaluate(()=>closeSentence());await open();
 assert.equal(await page.locator('#ps-easy-card').isVisible(),true);assert.equal(await page.evaluate(()=>qaCalls.length),calls);
 // Duplicate and programmatic scroll do not dismiss; actual user displacement does.
 await page.evaluate(()=>scrollGesture());assert.equal(await page.evaluate(()=>sentenceLookupOpen()),true);
 await page.evaluate(()=>{readerScrollTo(readerScrollTop()+20);scrollGesture();});assert.equal(await page.evaluate(()=>sentenceLookupOpen()),true);
 await page.evaluate(()=>{readerScroller().scrollTop+=30;scrollGesture();sentenceGestureReleased();});await closed();
 // Delayed translations may cache, never reopen; release cannot resurrect either.
 await page.evaluate(sentence=>{dictGet=async()=>null;window.qaOpening=openSentence(sentence+' Slow',qaOrigin);},sentence);
 await page.waitForFunction(()=>qaCalls.at(-1)?.op==='explain');
 await page.evaluate(()=>{readerScroller().scrollTop+=30;scrollGesture();qaPending.at(-1).resolve({ko:'오래 걸린 번역'});sentenceGestureReleased();});
 await page.evaluate(()=>qaOpening);await closed();assert.equal(await page.evaluate(()=>qaWrites.at(-1).value.ko),'오래 걸린 번역');
 await page.evaluate(()=>{dictGet=async()=>({ko:'번역'});sentenceEasyCache.clear();});
 // Failure/retry, offline, unsupported deployment and bounded cache, literal text.
 await open();await page.locator('#ps-easy-button').click();await page.evaluate(()=>qaPending.at(-1).resolve({error:'explanation_failed'}));
 await page.waitForFunction(()=>!sentenceEasyState.loading);assert.equal(await page.locator('#ps-easy-retry').isVisible(),true);
 await page.locator('#ps-easy-retry').click();await page.evaluate(()=>qaPending.at(-1).resolve({explanation:'<b>늦은 시간에도 읽기를 이어갔다는 뜻입니다.</b>'}));
 await page.waitForFunction(()=>!sentenceEasyState.loading);assert.equal(await page.locator('#ps-easy-text b').count(),0);
 for(const change of ['close','account','document','scroll']){
  await page.evaluate(()=>{closeSentence();sentenceEasyCache.clear();});await open();await page.locator('#ps-easy-button').click();
  await page.evaluate(change=>{
   window.qaOld=qaPending.at(-1);window.qaBook=curBook;
   if(change==='close')closeSentence();
   if(change==='account'){resetSyncSession();sbUser={id:'different'};}
   if(change==='document')show('home');
   if(change==='scroll'){readerScroller().scrollTop+=20;scrollGesture();}
   qaOld.resolve({explanation:'이 오래된 설명은 닫힌 화면을 다시 열면 안 됩니다.'});sentenceGestureReleased();
  },change);
  await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>qaOld.signal.aborted),true);await closed();
  assert.equal(await page.evaluate(()=>sentenceEasyCache.size),0);
  await page.evaluate(async()=>{sbUser=null;if(activeAppView()!=='read')await openBook(qaBook);});
 }
 await open();await page.locator('#ps-easy-button').click();await page.evaluate(()=>qaPending.at(-1).resolve({error:'bad_op'}));
 await page.waitForFunction(()=>!sentenceEasyState.loading);assert.match(await page.locator('#ps-easy-text').innerText(),/준비 중/);assert.equal(await page.locator('#ps-easy-retry').isVisible(),false);
 await page.evaluate(()=>{closeSentence();sentenceEasyCache.clear();});await browser.setOffline(true);await open();
 const offlineCalls=await page.evaluate(()=>qaCalls.length);await page.locator('#ps-easy-button').click();assert.equal(await page.evaluate(()=>qaCalls.length),offlineCalls);assert.match(await page.locator('#ps-easy-text').innerText(),/오프라인/);await browser.setOffline(false);
 await page.evaluate(async()=>{closeSentence();for(let i=0;i<18;i++){await openSentence('Sentence '+i,qaOrigin);const request=requestSentenceEasyExplanation();qaPending.at(-1).resolve({explanation:'현재 문장의 의미와 연결 구조를 짧게 설명합니다.'});await request;}closeSentence();});
 assert.equal(await page.evaluate(()=>sentenceEasyCache.size),16);
 await page.evaluate(sentence=>openSentence(sentence),sentence);assert.equal(await page.locator('#ps-source').isVisible(),true);assert.equal(await page.locator('#p-sentence').getAttribute('aria-modal'),'true');
 await page.evaluate(()=>{readerScroller().scrollTop+=20;scrollGesture();});assert.equal(await page.evaluate(()=>sentenceLookupOpen()),true,'source-free modal dismissed as anchored');
 assert.equal(await page.evaluate(()=>JSON.stringify(words)),await page.evaluate(()=>qaWords));
 // PDF's existing pinch owner dismisses pending/result/help; endings cannot revive UI.
 await page.evaluate(()=>closeSentence());await page.locator('#fileinput').setInputFiles({name:'sentence-pinch.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForSelector('.pdf-source-page canvas');await page.waitForFunction(()=>!readerPositionPending());
 await page.evaluate(()=>{window.qaTouch=(type,ids,spread=100,cancelable=true,changed=ids)=>{
  const target=document.querySelector('.pdf-source-page canvas');const touch=id=>({identifier:id,touchType:'direct',target,clientX:200+(id===1?-spread:spread)/2,clientY:180});
  const event=new Event(type,{bubbles:true,cancelable});Object.defineProperties(event,{touches:{value:ids.map(touch)},changedTouches:{value:changed.map(touch)}});target.dispatchEvent(event);
 };});
 for(const mode of ['pending','result','help'])for(const ending of ['release','cancel','blur','noncancelable']){
  await page.evaluate(({mode,ending})=>{closeSentence();cancelOriginalPinch();dictGet=mode==='pending'?async()=>null:async()=>({ko:'PDF 번역'});window.qaOpening=openSentence('A PDF sentence '+mode+ending,qaOrigin);},{mode,ending});
  if(mode==='pending')await page.waitForFunction(()=>qaCalls.at(-1)?.op==='explain');
  else {await page.evaluate(()=>qaOpening);if(mode==='help')await page.locator('#ps-easy-button').click();}
  await page.evaluate(()=>qaTouch('touchstart',[1,2]));assert.equal(await page.evaluate(()=>originalPinchBusy()),true);await closed();
  await page.evaluate(ending=>{
   if(ending==='release'){qaTouch('touchmove',[1,2],150);qaTouch('touchend',[2],150,true,[1]);qaTouch('touchend',[],150,true,[2]);}
   if(ending==='cancel'){qaTouch('touchcancel',[],100,true,[1,2]);}
   if(ending==='blur')window.dispatchEvent(new Event('blur'));
   if(ending==='noncancelable')qaTouch('touchmove',[1,2],150,false);
   qaPending.at(-1)?.resolve({ko:'늦은 번역',explanation:'늦은 설명은 닫힌 화면을 다시 열 수 없습니다.'});sentenceGestureReleased();
  },ending);await page.waitForTimeout(30);await closed();
 }
 // Text and EPUB leave PDF pinch ownership alone, while real scroll dismisses.
 for(const format of ['text','epub']){
  await page.evaluate(async format=>{
   if(format==='text')await switchReaderMode('text');
   else {
    await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');zip.file('book.opf','<package><metadata/><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>');const paras=Array(80).fill('A patient reader keeps reading.');zip.file('a.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><body>'+paras.map(p=>'<p>'+p+'</p>').join('')+'</body></html>');const book={id:'sentence-epub',title:'Sentence EPUB',kind:'epub',original:{hash:'sentence-epub'},paras};await openBook(book,{prepared:{book,original:{kind:'epub',hash:'sentence-epub',blob:await zip.generateAsync({type:'blob'})}}});await switchReaderMode('original');await Promise.all(originalSession.frameGeometryReady);
   }
  },format);await page.waitForFunction(()=>!readerPositionPending());await page.evaluate(()=>{dictGet=async()=>({ko:'번역'});return openSentence('A patient reader keeps reading.',qaOrigin);});
  await page.evaluate(()=>{const target=document.getElementById(currentReaderMode==='text'?'rtext':'original-stage');const touch=id=>({identifier:id,touchType:'direct',target,clientX:100*id,clientY:150});const event=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:[touch(1),touch(2)]},changedTouches:{value:[touch(2)]}});target.dispatchEvent(event);});
  assert.equal(await page.evaluate(()=>originalPinchBusy()),false);assert.equal(await page.evaluate(()=>sentenceLookupOpen()),true);
  await page.evaluate(()=>{readerScroller().scrollTop+=30;scrollGesture();});await closed();
 }
 assert.deepEqual(errors,[]);console.log(engine.name()+': sentence help, source distinction, bounded cache, stale/scroll/pinch dismissal and non-PDF controls passed');
}finally{await browser.close();server.close();}
