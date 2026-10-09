/* Synthetic local-only resource, parser and lookup regression. No account, real
   article provider or paid dictionary call is used. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {unavailableRemote} from './helpers/unavailable-remote.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=readFileSync(resolve(root,'assets/longreads/homewardbound.txt'),'utf8');
let failReadability=false,failHomeward=false;
const server=createServer((req,res)=>{try{
 const pathname=new URL(req.url,'http://local').pathname;
 if((failReadability&&pathname.includes('readability-'))||(failHomeward&&pathname.endsWith('homeward-lookup-data.js'))){res.writeHead(503).end();return;}
 const file=resolve(root,'.'+pathname.replace(/^\/$/,'/index.html'));if(!file.startsWith(root))throw Error();
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');
 res.setHeader('Cache-Control','no-store');res.end(readFileSync(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const html='<html><head><title>A synthetic public article</title></head><body><article><h1>A synthetic public article</h1>'+Array.from({length:8},(_,i)=>'<p>The quiet reader follows the evidence and enjoys a complete article about the changing seasons. Paragraph '+i+' explains how public text remains readable.</p>').join('')+'</article></body></html>';
const results=[];
async function fresh({native=false}={}){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 const requests=[],remote=[],errors=[];
 await context.route('**/*',r=>{const href=r.request().url();if(href.startsWith(url)||href.startsWith('blob:')){requests.push(href);return r.continue();}remote.push(href);return unavailableRemote(r);});
 await context.addInitScript(native=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));if(native)window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};},native);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await page.evaluate(()=>homeReady);
 return {context,page,requests,remote,errors};
}
try{
 {
  const {context,page,requests,errors}=await fresh({native:true});
  try{
   assert.equal(requests.filter(href=>/readability-|homeward-lookup-data|frame-trace|ts-fsrs|core\/vocabulary-review|brand\/review\//.test(href)).length,0);
   assert.deepEqual(await page.evaluate(()=>({parser:typeof Readability,data:typeof HOMEWARD_LOOKUP_DATA,frames:typeof window.breezeFrameSummary,fsrs:typeof BreezeReview,mascot:document.getElementById('review-stage-mascot').getAttribute('src')})),{parser:'undefined',data:'undefined',frames:'undefined',fsrs:'undefined',mascot:null});
   failReadability=true;
   assert.equal(await page.evaluate(()=>ensureReadabilityLib().then(()=>false,()=>true)),true,'failed parser load must reject');
   failReadability=false;const before=requests.length;
   assert.equal(await page.evaluate(async()=>{const a=ensureReadabilityLib(),b=ensureReadabilityLib();const shared=a===b;await Promise.all([a,b]);return shared;}),true);
   assert.equal(requests.slice(before).filter(href=>href.includes('readability-')).length,1,'concurrent native requests must share one load');
   const parsed=await page.evaluate(html=>parseArticleHtml(html,'https://public.example/story'),html);
   assert.ok(parsed.paras.length>=8,'deferred parser must preserve paragraphs');
   assert.equal(await page.locator('script[src*="readability-"]').count(),1,'failed script must not remain');
   await page.reload();await page.evaluate(()=>homeReady);
   // Preview and commit own asynchronous parser readiness; plain text needs none.
   await page.evaluate(()=>{document.getElementById('am-text').value='A short plain text article.';return updatePastePreview();});
   assert.equal(await page.evaluate(()=>typeof Readability),'undefined');
   await page.evaluate(async html=>{document.getElementById('am-text').value=html;await updatePastePreview();await importPastedText();},html);
   assert.ok(await page.evaluate(()=>books.some(book=>book.paras.some(p=>p.includes('Paragraph 7')))),'HTML paste saved full parsed body');
   assert.deepEqual(errors,[]);results.push('OFF boot, shared parser load, failure retry, plain text and HTML import');
  }finally{await context.close();}
 }
 {
  const {context,page,requests,errors}=await fresh();
  try{
   // These reloads exercise debug persistence, not RSS cancellation. Let the
   // intercepted Home feed work finish before replacing its WebKit document.
   const settledHome=()=>page.evaluate(async()=>{await homeReady;await rssLoading;});
   await settledHome();
   await page.goto(url+'?frames=1');await page.waitForFunction(()=>typeof window.breezeFrameSummary==='function');
   assert.ok(requests.some(href=>/frame-trace\.js\?v=[a-f0-9]{8}$/.test(href)));
   await settledHome();
   await page.goto(url);await page.waitForFunction(()=>typeof window.breezeFrameSummary==='function');
   await settledHome();
   await page.goto(url+'?frames=0');await page.evaluate(()=>homeReady);
   await settledHome();
   assert.equal(await page.evaluate(()=>typeof window.breezeFrameSummary),'undefined');
   assert.deepEqual(errors,[]);results.push('debug opt-in, persisted opt-in and explicit opt-out');
  }finally{await context.close();}
 }
 {
  failHomeward=true;
  const {context,page,requests,remote,errors}=await fresh({native:true});
  try{
   await page.evaluate(async raw=>{const book={id:'deferred-homeward',title:'Local Homeward',kind:'txt',longReadId:'backroom-homeward-bound',paras:parseTXT(raw,{preserveParagraphs:true}),addedAt:1};books.push(book);await bookPut(book);await openBook(book);},source);
   assert.equal(await page.evaluate(()=>activeAppView()),'read','optional lookup failure must keep local reading');
   await page.evaluate(async()=>{await document.fonts.ready;document.querySelector('#rtext [data-pi="2"]').scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   await page.evaluate(()=>{const block=document.querySelector('#rtext [data-pi="2"]');hydrateWordSpanBatch([block]);const node=[...block.querySelectorAll('.w')].find(n=>n.textContent==='reverie');openWord(node.dataset.w,node);});
   await page.waitForFunction(()=>words[selKey]?.aiOff==='error');
   await page.evaluate(async()=>{await fillDictionaryMetadata(selKey,wordLookupLife,true);await fetchLook(selKey,{life:wordLookupLife});closePanel();await openSentence('I snapped out of my reverie.',{pi:2});});
   assert.equal(remote.filter(href=>/functions\/v1\/dict|freedictionaryapi/.test(href)).length,0,'missing local data must not trigger AI or metadata fallback');
   // Exercise a visible tap target: offscreen peek cleanup correctly cancels
   // metadata work, which is a different contract from cached-answer reuse.
   await page.evaluate(async()=>{document.querySelector('#rtext [data-pi="2"]').scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const beforeCache=requests.filter(href=>href.includes('homeward-lookup-data')).length;
   const cached=await page.evaluate(async()=>{
    closeSentence();
    const node=[...document.querySelectorAll('#rtext [data-pi="2"] .w')].find(n=>n.textContent==='reverie');
    const input=lookupRequestFor(words[node.dataset.w]||{word:node.dataset.w},node,false);
    await dictPut(lookKey(node.dataset.w,input.sentence,input.clickedIndex),{ko:'저장된 단어 풀이',pos:'noun'});
    await dictPut('en:v2:reverie',{defs:[{pos:'noun',def:'A stored dreamlike state.'}],expires:Date.now()+60000});
    openWord(node.dataset.w,node);
    const k=selKey;
    await loadCachedLook(k,Date.now(),wordLookupLife,node);
    await fillDictionaryMetadata(k,wordLookupLife);
    const word=words[k].ko,english=words[k].defs[0]?.def;
    closePanel();
    await dictPut(sentKey('I snapped out of my reverie.'),{ko:'저장된 문장 풀이'});
    await openSentence('I snapped out of my reverie.',{pi:2});
    return {word,english,sentence:document.getElementById('ps-ko').textContent};
   });
   assert.deepEqual(cached,{word:'저장된 단어 풀이',english:'A stored dreamlike state.',sentence:'저장된 문장 풀이'});
   assert.equal(await page.evaluate(async()=>{
    const original=dictGet,book=curBook;let release;
    dictGet=()=>new Promise(resolve=>{release=resolve;});
    try{const job=fetchEnMetadata('uncachedfixture');curBook=null;release(null);return await job;}
    finally{dictGet=original;curBook=book;}
   }),null,'leaving Homeward during cache read must not start a metadata request');
   assert.equal(requests.filter(href=>href.includes('homeward-lookup-data')).length,beforeCache,'cached answers must not wait for an optional download');
   assert.equal(remote.filter(href=>/functions\/v1\/dict|freedictionaryapi/.test(href)).length,0);
   failHomeward=false;
   await page.evaluate(async()=>{closeSentence();await ensureHomewardLookupData();await openSentence('I snapped out of my reverie.',{pi:2});});
   assert.equal(await page.locator('#ps-ko').textContent(),'나는 상념에서 깨어났다.');
   assert.equal(await page.evaluate(()=>{curBook.paras=curBook.paras.slice(0,61);return !!homewardLookupChapter(2)&&!!homewardSentenceAnswer('I snapped out of my reverie.',2);}),true,'unchanged legacy chapter keeps local answers');
   assert.deepEqual(errors,[]);results.push('missing Homeward data retains reading and cached word/sentence/English answers, prevents paid fallback, retries and serves exact legacy chapter');
  }finally{failHomeward=false;await context.close();}
 }
 console.log(JSON.stringify({engine:engine.name(),version:browser.version(),results}));
}finally{await browser.close();server.close();}
