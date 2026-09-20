import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();

try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
  await page.route('**/*',route=>{
    const href=route.request().url();
    if(href.startsWith(origin)||href.startsWith('https://hrtfhojbhqvaoiulspto.supabase.co/functions/v1/dict'))return route.continue();
    return route.abort();
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'jev-lifecycle.txt',mimeType:'text/plain',buffer:Buffer.from(
    ('Please take care of the plants before sunset. Ordinary readers move quickly through the next sentence.\n\n').repeat(24))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
  await page.evaluate(()=>{
    const live=dictCall;
    window.jevLive={calls:[],pending:[]};
    dictCall=async(payload)=>{
      if(payload.op!=='phrase')return live(payload);
      jevLive.calls.push(payload);
      const result=await live(payload); // actual deployed JEV; intentionally outlives UI cancellation
      return new Promise(resolve=>jevLive.pending.push(()=>resolve(result)));
    };
  });
  const start=async()=>{
    const before=await page.evaluate(()=>jevLive.calls.length);
    await page.evaluate(()=>{
      const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='take');
      openWord(keyOf('take'),span);
    });
    await page.waitForFunction(n=>jevLive.calls.length>n,before);
    await page.waitForFunction(()=>jevLive.pending.length>0);
  };
  const release=async()=>{
    await page.evaluate(()=>jevLive.pending.shift()());
    await page.waitForTimeout(80);
  };
  const reset=async()=>page.evaluate(()=>{closePanel();words={};dead={};saveWords();});

  await start();
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='ordinary');
    words.ordinary={word:'ordinary',clicked:'Ordinary',forms:['ordinary'],ko:'평범한',example:'saved',book:'QA',status:1,mark:true,addedAt:1,up:1};
    selectWord('ordinary',span,true);
  });
  await release();
  assert.equal(await page.evaluate(()=>selKey),'ordinary','late JEV response replaced the newer word');
  assert.equal(await page.evaluate(()=>!!words['phrase:take care of']),false,'late JEV response saved a phrase over another lookup');

  await reset(); await start();
  await page.evaluate(()=>closePanel()); await release();
  assert.equal(await page.evaluate(()=>wordLookupOpen()),false,'late JEV response reopened a closed lookup');
  assert.equal(await page.evaluate(()=>Object.keys(words).length),0,'late JEV response saved after close');

  await reset(); await start();
  const scroll=await page.evaluate(()=>{readerScrollTo(360);const y=readerScrollTop();closePanel();return y;});
  await release();
  assert.equal(await page.evaluate(()=>wordLookupOpen()),false,'scroll + close was undone by late JEV');
  assert.ok(Math.abs((await page.evaluate(()=>readerScrollTop()))-scroll)<3,'late JEV moved the Reader after scroll');

  await reset(); await start();
  await page.evaluate(()=>show('home')); await release();
  assert.equal(await page.locator('#v-home').evaluate(node=>node.classList.contains('on')),true,'late JEV changed the active page');
  assert.equal(await page.evaluate(()=>wordLookupOpen()),false,'late JEV opened over another page');

  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
  await reset();
  for(let cycle=0;cycle<8;cycle++){
    await start();
    await page.evaluate(()=>closePanel());
    await release();
  }
  assert.equal(await page.evaluate(()=>wordLookupOpen()),false,'rapid taps left a reopened lookup');
  assert.equal(await page.evaluate(()=>Object.keys(words).length),0,'rapid taps saved a stale phrase or word shell');
  console.log('Live JEV lifecycle verified: newer target, close, scroll, page switch, and 8 rapid cycles');
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
