/* DOM/geometry regression, not proof of UIKit momentum or missing paint tiles. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch();
try{
  const page=await browser.newPage({viewport:{width:1180,height:820},hasTouch:true,serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof openBook==='function');
  await page.evaluate(async()=>{
    readMargin='narrow';applyReadMargin();
    const paras=Array.from({length:36},(_,i)=>`Section ${i}. `+('A patient reader follows the story and considers the evidence before making a decision. ').repeat(4));
    const blocks=paras.map((t,f)=>({r:f%8===0?'h2':'p',t,f,marks:f%3===0?[{kind:'strong',start:0,end:50}]:[]}));
    await imgPut('scroll-fixture-image',new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#889999"/></svg>'],{type:'image/svg+xml'}));
    for(const at of [24,8])blocks.splice(at,0,{r:'img',t:IMG_MARK+'scroll-fixture-image',f:paras.length+at});
    words.patient={word:'patient',ko:'참을성 있는',status:1,addedAt:1,up:1};
    window.articleFixture={id:'stable-article',kind:'article',title:'Reading without interruption',paras,formatting:{blocks}};
    await openBook(articleFixture);
  });
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>10&&!readerPositionPending());
  await page.waitForFunction(()=>[...document.querySelectorAll('#rtext img')].every(img=>img.complete&&img.naturalWidth));
  await page.waitForTimeout(300);
  await page.evaluate(()=>{
    window.scrollAudit={mutations:0,nodes:[...document.querySelectorAll('#rtext .w')],height:readerContentHeight()};
    window.scrollObserver=new MutationObserver(records=>scrollAudit.mutations+=records.length);
    scrollObserver.observe(document.getElementById('rtext'),{subtree:true,childList:true});
  });
  await page.mouse.move(590,400);
  for(const direction of [1,-1])for(let i=0;i<24;i++){
    await page.mouse.wheel(0,300*direction);await page.waitForTimeout(40);
  }
  await page.waitForTimeout(150);
  const result=await page.evaluate(()=>{
    scrollObserver.disconnect();
    return {mutations:scrollAudit.mutations,connected:scrollAudit.nodes.every(n=>n.isConnected),
      heightBefore:scrollAudit.height,heightAfter:readerContentHeight(),
      total:document.querySelectorAll('#rtext [data-pi]:not(figure)').length,hydrated:document.querySelectorAll('#rtext [data-word-spans="1"]').length};
  });
  assert.equal(result.mutations,0,'Scrolling a bounded document replaced its text nodes');
  assert.equal(result.connected,true,'Scrolling detached a lookup/touch target');
  assert.equal(result.heightAfter,result.heightBefore,'Scrolling changed document geometry');
  assert.equal(result.hydrated,result.total,'Short document leaves unprepared words');
  await page.evaluate(()=>{
    const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent==='patient');
    window.retainedToken=node;selectWord('patient',node,true);
  });
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'참을성 있는');
  await page.evaluate(()=>{closePanel();words.patient.status=2;refreshReaderWords();});
  assert.equal(await page.evaluate(()=>retainedToken.isConnected&&retainedToken.classList.contains('s2')),true);
  // Bounded eager preparation must never turn a long book into an all-word DOM.
  const long=await page.evaluate(async()=>{
    const paras=Array.from({length:500},()=>('The patient reader enjoys another chapter. ').repeat(8));
    await openBook({id:'long-scroll',kind:'txt',title:'Long book',paras});
    await new Promise(r=>setTimeout(r,150));
    return {total:readerParagraphs().length,hydrated:document.querySelectorAll('#rtext [data-word-spans="1"]').length};
  });
  assert.ok(long.hydrated>0&&long.hydrated<long.total/2,'Long document lost bounded lazy rendering');
  await page.evaluate(()=>openBook(articleFixture));
  assert.equal(await page.evaluate(()=>wordSpanObserver===null),true,'Previous long book observer survived short-document open');
  console.log(engine.name(),{short:result,long});
}finally{await browser.close();await new Promise(done=>server.close(done));}
