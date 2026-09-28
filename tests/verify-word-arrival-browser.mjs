import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

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
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});

try{
  const page=await browser.newPage({viewport:{width:1100,height:800},serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>{
    const href=route.request().url();
    return href.startsWith(url)||href.startsWith('blob:')?route.continue():route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'word-overlay.txt',mimeType:'text/plain',
    buffer:Buffer.from(('A patient reader keeps resilient words close to their context. '+
      'Another patient reader checks every repeated word carefully. '+
      'The patient waited calmly for the doctor.\n\n').repeat(50))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);



  const pill=page.locator('#word-peek'),requests=[];
  let fail=true;
  await page.route(url+'functions/v1/dict',async route=>{
    const payload=route.request().postDataJSON();requests.push(payload);
    if(fail){fail=false;return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'lookup_failed'})});}
    return route.fulfill({contentType:'application/json',body:JSON.stringify({kind:'word',canonical:'patient',members:[payload.clickedIndex],ko:'참을성 있는',left:299,lookupId:payload.lookupId})});
  });
  await page.evaluate(url=>{
    sb={auth:{getSession:async()=>({data:{session:null}})}};sbUser={id:'qa-user'};SB_URL=url;SB_KEY='qa';
    dictGet=async()=>null;fillDictionaryMetadata=async()=>{};
    const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent.toLowerCase()==='patient'&&n.getBoundingClientRect().top>100);
    const key=keyOf('patient');
    words[key]={word:'patient',clicked:'patient',forms:[key],ko:'',defs:[],kodict:[],example:sentenceOf(node),book:curBook.title,status:1,addedAt:1,up:1};
    const input=lookupRequestFor(words[key],node,true);contextView={key,...input,loading:'checking'};
    selectWord(key,node,true);window.qaNode=node;
    window.qaPromise=resolveCurrentLookup(key,input,wordLookupLife,node);
  },url);
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(requests.length,2);assert.equal(requests[0].op,'look_v2');
  assert.equal(requests[0].lookupId,requests[1].lookupId);
  assert.equal(await page.evaluate(()=>words[selKey].ko),'참을성 있는');
  assert.equal(await pill.evaluate(n=>n.classList.contains('result-accent')),true);
  const rect=await pill.boundingBox();
  await page.waitForTimeout(250);
  assert.equal(await pill.evaluate(n=>getComputedStyle(n,'::after').opacity),'0','accent did not return to neutral');
  assert.deepEqual(await pill.boundingBox(),rect,'accent moved the pill');
  // Under 750ms of continuous visibility remains unseen and can reveal again.
  await page.evaluate(()=>readerScroller().scrollTop+=8);
  await page.waitForFunction(()=>document.getElementById('word-peek').hidden);
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(await pill.evaluate(n=>n.classList.contains('result-accent')),false,'reveal repeated arrival bloom');
  // Explicit retry after a usable answer is a new logical lookup.
  await page.evaluate(()=>retryWordPeek());
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden&&!wordPeekPending());
  assert.equal(requests.length,3);assert.notEqual(requests[2].lookupId,requests[0].lookupId);
  assert.equal(requests[2].retry,true);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await pill.evaluate(n=>getComputedStyle(n,'::after').animationName),'none');
  // Saved/cache opening has no arrival accent and makes no AI call.
  await page.evaluate(()=>{const node=qaNode;closePanel();openWord('patient',node);});
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(requests.length,3);assert.equal(await pill.evaluate(n=>n.classList.contains('result-accent')),false);
  console.log('word recovery + arrival accent browser: passed');
}finally{await browser.close();await new Promise(done=>server.close(done));}
