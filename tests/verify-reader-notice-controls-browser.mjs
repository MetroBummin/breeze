import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),proof='/tmp/breeze-reader-notice-212';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launchPersistentContext('',{viewport:{width:390,height:844},serviceWorkers:'block',hasTouch:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));await page.goto(url);await page.evaluate(()=>homeReady);
 await page.locator('#fileinput').setInputFiles({name:'A.pdf',mimeType:'application/pdf',buffer:fixturePdf(4)});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');readerNotices.reset();});
 const notice=page.locator('#reader-notice');
 // Exercise the real settings tap, including delayed guidance after the panel closes.
 await page.locator('#aafab').tap();await page.locator('[data-pdf-direction="horizontal"]').tap();await page.waitForFunction(()=>pdfHorizontal());
 await page.evaluate(()=>closeAa());await page.waitForTimeout(1200);
 assert.equal(await notice.isVisible(),false,'Direction selection must not enqueue redundant delayed guidance');
 for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
  for(const mode of ['original','text'])for(const compact of [false,true]){
   await page.evaluate(async({mode,compact})=>{readerNotices.reset();closeAa();await switchReaderMode(mode);chromeHoldUntil=0;readerScrollPauseUntil=0;setReaderChrome(compact);},{mode,compact});
   await page.waitForTimeout(350);await page.waitForFunction(()=>!chromePinned&&!originalPinchBusy()&&Date.now()>readerScrollPauseUntil+300&&Date.now()>chromeHoldUntil);
   await page.evaluate(()=>{readerNotices.reset();chromeHoldUntil=0;readerScrollPauseUntil=0;});
   const sample=()=>page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.x,r.y,r.width,r.height];};return {pill:rect('readpill'),title:rect('readpill-title'),aa:rect('aafab'),mode:rect('modefab')};});
   const before=await sample();
   // Enqueue and inspect the first paint synchronously: no title fade beneath a notice.
   await page.evaluate(()=>{window.firstNoticeOpacity=null;const observer=new MutationObserver(()=>{if(!document.body.classList.contains('reader-notice-visible'))return;window.firstNoticeOpacity=getComputedStyle(document.getElementById('readpill-title')).opacity;observer.disconnect();});observer.observe(document.body,{attributes:true,attributeFilter:['class']});toast('저장을 마쳤어요. 다시 읽어도 이 위치에서 이어져요.');});
   await notice.waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.firstNoticeOpacity),'0','Title must yield before the first notice paint');await page.waitForTimeout(300);assert.deepEqual(await sample(),before,'Notices must not move or resize input targets');
   const bounds=await notice.evaluate(e=>{const r=e.getBoundingClientRect(),title=document.getElementById('readpill-title').getBoundingClientRect(),pill=document.getElementById('readpill').getBoundingClientRect();return {inside:r.left>=title.left-1&&r.right<=title.right+1&&r.top>=pill.top-1&&r.bottom<=pill.bottom+1,pointer:getComputedStyle(e).pointerEvents};});
   assert.equal(bounds.inside,true,JSON.stringify({width,height,dark,mode,compact,bounds,rects:await page.evaluate(()=>['reader-notice','readpill-title','reader-pill-copy','readpill'].map(id=>[id,JSON.stringify(document.getElementById(id).getBoundingClientRect().toJSON())]))}));assert.equal(bounds.pointer,'none');
   if(width===390&&mode==='original')await page.screenshot({path:`${proof}/${engine.name()}-${dark?'dark':'light'}-${compact?'compact':'expanded'}.png`});
   // Trusted touch at the visible notice's edge, not just the invisible title's center.
   if(compact){const r=await notice.boundingBox();await page.touchscreen.tap(r.x+2,r.y+r.height/2);assert.equal(await page.evaluate(()=>document.body.classList.contains('chrome-hidden')),false,'Notice area must still expand Reader controls');await page.waitForTimeout(350);}
   await page.evaluate(()=>{readerNotices.reset();chromeHoldUntil=0;readerScrollPauseUntil=0;toast('설정도 바로 열 수 있어요');});await notice.waitFor({state:'visible'});
   await page.locator('#aafab').tap();assert.equal(await page.locator('#aa-pop').evaluate(e=>e.classList.contains('on')),true);assert.equal(await notice.isVisible(),false);
   await page.evaluate(()=>{closeAa();readerNotices.reset();});
  }
 }
 // A notice must yield to the mode button without intercepting the original/text switch.
 await page.evaluate(async()=>{await switchReaderMode('original');setReaderChrome(false);chromeHoldUntil=0;readerScrollPauseUntil=0;toast('모드 버튼을 가리지 않아요');});await notice.waitFor({state:'visible'});
 await page.locator('#modefab').tap();await page.waitForFunction(()=>currentReaderMode==='text');assert.equal(await notice.isVisible(),false);
 assert.deepEqual(errors,[]);console.log(engine.name()+': direction without stale guidance, immediate title replacement, stable hit targets and trusted Aa/mode/compact taps passed in five viewports and both themes');
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
