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


  const pill=page.locator('#word-peek');
  const open=async(pending=false)=>{
    await page.evaluate(pending=>{
      closePanel();readerScrollTo(0);
      const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent.toLowerCase()==='patient'&&n.getBoundingClientRect().top>100);
      const key=keyOf('patient');
      words[key]={word:'patient',clicked:'patient',forms:[key],ko:pending?'':'참을성 있는',defs:[],kodict:[],example:sentenceOf(node),book:curBook.title,status:1,addedAt:1,up:1};
      contextView=pending?{key,loading:'checking'}:null;
      selectWord(key,node,true);window.qaNode=node;
    },pending);
  };
  const move=async(delta)=>{
    await page.evaluate(delta=>{readerScroller().scrollTop+=delta;},delta);
    await page.waitForFunction(()=>wordPeekScrollPosition&&wordPeekScrollPosition.top===readerScroller().scrollTop);
  };
  await open(true);
  assert.equal(await pill.isVisible(),false);
  await move(12);
  await page.evaluate(()=>{words[selKey].ko='참을성 있는';contextView=null;saveWords();renderWordLookup();});
  assert.equal(await pill.isVisible(),false,'result during motion flashed');
  for(let i=0;i<3;i++){await page.waitForTimeout(80);await move(6);assert.equal(await pill.isVisible(),false);}
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  await move(8);assert.equal(await pill.isVisible(),false,'brief reveal was not hidden');
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  const gap=await page.evaluate(()=>{
    const p=document.getElementById('word-peek').getBoundingClientRect(),w=qaNode.getBoundingClientRect();
    return Math.min(Math.abs(p.top-w.bottom),Math.abs(w.top-p.bottom));
  });
  assert.ok(gap<12,'reveal used stale word coordinates');
  await page.waitForTimeout(800);await move(5);
  await page.waitForTimeout(350);
  assert.equal(await pill.isVisible(),false,'seen pill resurrected');
  assert.equal(await page.evaluate(()=>wordPeekActive),false);
  await open(false);await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  await move(5);
  assert.equal(await page.evaluate(()=>wordPeekActive),false,'saved result should dismiss on first scroll');
  await page.waitForTimeout(350);assert.equal(await pill.isVisible(),false,'saved result resurrected');
  await open(false);await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  await page.evaluate(()=>openWord('patient',qaNode));
  assert.equal(await page.evaluate(()=>wordPeekActive),false,'saved result should dismiss on same-word retap');
  assert.equal(await page.evaluate(()=>words.patient.ko),'참을성 있는');
  await open(true);
  await page.evaluate(()=>{words[selKey].ko='참을성 있는';contextView=null;renderWordLookup();});
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  await page.waitForTimeout(500);await move(5);
  assert.equal(await page.evaluate(()=>wordPeekActive),true,'waited result lost its 750ms protection');
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  await move(900);await move(-900);await page.waitForTimeout(350);
  assert.equal(await pill.isVisible(),false,'offscreen target resurrected');
  assert.equal(await page.evaluate(()=>words.patient.ko),'참을성 있는');
  await open(true);await move(900);await move(-900);
  await page.evaluate(()=>{words[selKey].ko='참을성 있는';contextView=null;saveWords();renderWordLookup();});
  await page.waitForTimeout(350);assert.equal(await pill.isVisible(),false,'offscreen pending lookup resurrected');
  assert.equal(await page.evaluate(()=>words.patient.ko),'참을성 있는');
  await open(true);await move(10);
  await page.evaluate(()=>{words[selKey].ko='참을성 있는';contextView=null;renderWordLookup();closePanel();});
  await page.waitForTimeout(350);assert.equal(await pill.isVisible(),false,'cancelled timer revealed');
  await open(false);await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  await page.waitForTimeout(800);
  await page.evaluate(()=>readerScrollBy(8));
  await page.waitForFunction(()=>document.getElementById('word-peek').hidden);
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(await page.evaluate(()=>wordPeekActive),true,'programmatic motion dismissed a seen result');
  await open(true);await move(8);
  await page.evaluate(()=>{words[selKey].ko='참을성 있는';contextView=null;renderWordLookup();});
  for(let i=0;i<3;i++){
    await page.waitForTimeout(100);
    await page.evaluate(()=>readerScroller().dispatchEvent(new Event('scroll')));
  }
  assert.equal(await pill.isVisible(),true,'unchanged scroll coordinates reset idle');
  await open(true);await move(8);
  await page.evaluate(()=>{
    words[selKey].ko='참을성 있는';contextView=null;renderWordLookup();
    const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent.toLowerCase()==='reader'&&wordPeekTargetVisible(n));
    words.reader={word:'reader',ko:'독자',defs:[],status:1,example:sentenceOf(node)};
    openWord('reader',node);
  });
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'독자','previous target timer replaced new word');
  await open(false);await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  await page.locator('#word-peek-more').click();
  assert.equal(await page.locator('#panel').isVisible(),true);
  await move(10);assert.equal(await page.locator('#panel').isVisible(),false,'expanded detail scroll dismissal changed');
  // An unsaved occurrence owns one request even after its screen position moves.
  await page.evaluate(()=>{
    closePanel();readerScroller().scrollTop=0;words={};dead={};recentWordOpens.clear();
    window.retapRequests=[];sb=sb||{};dictGet=async()=>null;dictPut=async()=>{};
    dictCall=(payload,signal)=>new Promise(resolve=>{
      const request={payload,resolve,aborted:false};retapRequests.push(request);
      signal?.addEventListener('abort',()=>{request.aborted=true;resolve(null);});
    });
    const nodes=[...document.querySelectorAll('#rtext .w')].filter(n=>n.textContent==='patient'&&n.getBoundingClientRect().top>100);
    window.retapNode=nodes[0];window.otherRetapNode=nodes[1];openWord('patient',retapNode);
  });
  await page.waitForFunction(()=>retapRequests.length===1);
  const retapLife=await page.evaluate(()=>wordLookupLife);
  await move(18);await page.evaluate(()=>openWord('patient',retapNode));
  assert.equal(await page.evaluate(()=>wordLookupLife),retapLife,'same source occurrence lost request ownership after scroll');
  assert.equal(await page.evaluate(()=>retapRequests.length),1);
  assert.equal(await page.evaluate(()=>retapRequests[0].aborted),false);
  assert.equal(await page.locator('.breeze-lookup-pending').count(),1);
  // Same spelling at another occurrence must start cleanly, not reuse a deleted record.
  await page.evaluate(()=>openWord('patient',otherRetapNode));
  await page.waitForFunction(()=>retapRequests.length===2);
  assert.equal(await page.evaluate(()=>retapRequests[0].aborted),true);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.breeze-lookup-pending').count(),1);
  await page.evaluate(()=>{
    const r=retapRequests[1];r.resolve({kind:'word',canonical:'patient',ko:'참을성 있는',members:[r.payload.clickedIndex]});
  });
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'참을성 있는');
  assert.equal(await page.evaluate(()=>activeSelectedWordNode===otherRetapNode),true);
  assert.equal(await page.locator('.breeze-lookup-pending').count(),0);
  console.log('word scroll lifecycle browser: passed');
}finally{
  await browser.close();await new Promise(done=>server.close(done));
}
