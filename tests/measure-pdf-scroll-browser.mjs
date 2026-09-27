/* Deterministic browser workload; not native iPad inertia/latency proof. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=resolve(new URL('..',import.meta.url).pathname),reports=[];
const server=createServer((req,res)=>{const p=resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launch({headless:true});try{
 const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>console.error('PAGE_ERROR',e.stack));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>{window.breezeInkIPad=true;window.webkit={messageHandlers:{breezeInkScope:{postMessage:s=>{window.qaScope=s;}}}};});
 await page.goto(url);await page.locator('#fileinput').setInputFiles({name:'scroll-120.pdf',mimeType:'application/pdf',buffer:fixturePdf()});
 await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'),null,{timeout:120000});
 for(const mode of ['read','pen'])for(const zoom of [1,2]){
 await page.evaluate(async()=>{show('home');releaseRetainedReader();await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
 await page.waitForFunction(()=>originalSession?.settled.size>0,null,{timeout:60000}).catch(async error=>{console.error('LOAD',await page.evaluate(()=>({mode:currentReaderMode,book:curBook?.id,token:originalLoadToken,session:originalSession&&{book:originalSession.bookId,token:originalSession.loadToken,pending:originalSession.paintQueue?.size,active:originalSession.paintActive?.pageNumber,rendering:[...originalSession.rendering.keys()]},text:document.getElementById('original-content').textContent.slice(0,150)})));throw error;});await page.evaluate(z=>setOriginalZoom(z),zoom);await page.waitForTimeout(1000);
 if(mode==='pen'){await page.evaluate(()=>expandReaderChrome());await page.locator('[data-ink-toggle]').click();await page.waitForTimeout(500);}
 const result=await page.evaluate(async()=>{
 const session=originalSession,scroller=readerScroller(),nativeRect=Element.prototype.getBoundingClientRect;let reads=0,frames=[],longTasks=[],last=performance.now();
 const observer=typeof PerformanceObserver==='function'&&PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration))):null;observer?.observe({type:'longtask'});
 Element.prototype.getBoundingClientRect=function(){if(this.classList.contains('pdf-source-page'))reads++;return nativeRect.call(this);};
 const run=async(fresh)=>{const before=reads,t=performance.now(),f0=frames.length;for(let i=0;i<30;i++){
 const paper=session.pages[fresh?8:0],target=paper.querySelector('canvas')||paper,rect=nativeRect.call(paper),touch={identifier:7,touchType:'direct',target,clientX:rect.x+40,clientY:rect.y+40};
 const send=(type,live)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:live?[touch]:[]},changedTouches:{value:[touch]}});target.dispatchEvent(e);};
 send('touchstart',true);scroller.scrollTop=fresh?8000+i*130:i*3;await new Promise(requestAnimationFrame);send('touchend',false);
 await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-last);last=now;
 }return {pageBoundsReads:reads-before,elapsedMs:performance.now()-t,maxFrameMs:Math.max(...frames.slice(f0)),rendered:session.settled.size};};
 try{return {drawn:await run(false),newPages:await run(true),longTasks};}finally{Element.prototype.getBoundingClientRect=nativeRect;observer?.disconnect();}
 });reports.push({engine:engine.name(),mode,zoom,...result});console.log(JSON.stringify(reports.at(-1)));
 }
 }finally{await browser.close();}
}}finally{server.close();}
if(process.env.BREEZE_QA_REPORT)writeFileSync(process.env.BREEZE_QA_REPORT,JSON.stringify(reports,null,2)+'\n');
