/* Chromium owns worker lifecycle automation. The parser/reader behavior is also
   covered in WebKit by verify-deferred-resources-browser.mjs. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=readFileSync(resolve(root,'assets/longreads/homewardbound.txt'),'utf8');
const server=createServer((req,res)=>{try{
 const file=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!file.startsWith(root))throw Error();
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(readFileSync(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
try{for(const mode of ['first-uncontrolled','old-shell-upgrade']){
 const context=await browser.newContext({serviceWorkers:'allow'});
 await context.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await context.addInitScript(()=>{
  localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
  const register=navigator.serviceWorker.register.bind(navigator.serviceWorker);
  window.installFixtureWorker=()=>register('sw.js',{updateViaCache:'none'});
  navigator.serviceWorker.register=()=>Promise.resolve(null); // Install after fixture cache is seeded.
 });
 try{
  const page=await context.newPage();await page.goto(url);await page.evaluate(()=>homeReady);
  await page.evaluate(async raw=>{const book={id:'offline-homeward',title:'Homeward',kind:'txt',longReadId:'backroom-homeward-bound',paras:parseTXT(raw,{preserveParagraphs:true}),addedAt:1};books.push(book);await bookPut(book);},source);
  if(mode==='first-uncontrolled')await page.evaluate(()=>Promise.all([ensureReadabilityLib(),ensureHomewardLookupData()]));
  else await page.evaluate(async()=>{
   const old=await caches.open('breeze-deadbeef');
   for(const path of [LAZY_LIBS.readability,LAZY_LIBS.homeward])await old.put(path,await fetch(path));
   await old.put('scripts/reader/reader.js?v=00000000',new Response('obsolete app code'));
  });
  assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),false);
  await page.evaluate(async()=>{await window.installFixtureWorker();await navigator.serviceWorker.ready;});
  await page.close();await context.setOffline(true);
  const cold=await context.newPage();await cold.goto(url);await cold.evaluate(()=>homeReady);
  assert.equal(await cold.evaluate(()=>!!navigator.serviceWorker.controller),true);
  await cold.evaluate(async()=>{await openBook(books.find(b=>b.id==='offline-homeward'));await ensureReadabilityLib();});
  assert.equal(await cold.evaluate(()=>homewardSentenceAnswer('I snapped out of my reverie.',2)),'나는 상념에서 깨어났다.');
  assert.equal(await cold.evaluate(()=>typeof Readability),'function');
  if(mode==='old-shell-upgrade'){
   assert.equal(await cold.evaluate(async()=>{const name=(await caches.keys()).find(n=>/^breeze-[a-f0-9]{8}$/.test(n)&&n!=='breeze-deadbeef'),cache=await caches.open(name);return !!await cache.match('scripts/reader/reader.js?v=00000000');}),false,'old app code must not carry forward');
  }
  console.log('chromium: offline deferred parser/local lookup passed '+mode);
 }finally{await context.close();}
}}finally{await browser.close();server.close();}
