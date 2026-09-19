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
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();

try{
  const page=await browser.newPage({viewport:{width:1100,height:800},serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
  await page.route('**/*',route=>{
    const href=route.request().url();
    return href.startsWith(url)||href.startsWith('blob:')?route.continue():route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'word-overlay.txt',mimeType:'text/plain',
    buffer:Buffer.from(('A patient reader keeps resilient words close to their context. '+
      'Another patient reader checks every repeated word carefully.\n\n').repeat(50))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);

  const geometry=()=>page.evaluate(()=>{
    const rect=document.getElementById('readmain').getBoundingClientRect();
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,scroll:readerScrollTop(),zoom:originalZoom()};
  });
  const before=await geometry();
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='patient');
    const key=keyOf('patient');
    words[key]={word:'patient',clicked:'patient',forms:[key],ko:'참을성 있는',phon:'',defs:[],kodict:[],
      example:'A patient reader keeps resilient words close to their context.',book:curBook.title,
      status:1,mark:true,addedAt:1,up:1,ai:{ko:'참을성 있는',done:true}};
    openWord(key,span);
  });
  await page.waitForFunction(()=>wordPeekOpen());
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'참을성 있는','cached meaning did not appear immediately');
  assert.equal(await page.locator('#word-peek').getAttribute('class')||'','',
    'cached meaning unnecessarily showed the loading spinner');
  assert.equal(await page.locator('#panel').isVisible(),false,'cached meaning opened details automatically');
  await page.locator('#word-peek').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const placement=await page.evaluate(()=>{
    const pill=document.getElementById('word-peek').getBoundingClientRect();
    const word=document.querySelector('#rtext .w.sel').getBoundingClientRect();
    return {pill:{left:pill.left,right:pill.right,top:pill.top,bottom:pill.bottom},
      word:{left:word.left,right:word.right,top:word.top,bottom:word.bottom},width:innerWidth};
  });
  assert.ok(placement.pill.left>=15&&placement.pill.right<=placement.width-15,'meaning pill escaped the viewport');
  assert.ok(placement.pill.bottom<=placement.word.top||placement.pill.top>=placement.word.bottom,
    'meaning pill covers the tapped word');
  assert.deepEqual(await geometry(),before,'near-word pill changed Reader geometry or scroll');

  await page.locator('#word-peek-more').click();
  await page.waitForFunction(()=>wordPanelOpen());
  assert.equal(await page.locator('#word-peek').isVisible(),false,'pill remained visible behind details');
  assert.equal(await page.locator('#p-word').textContent(),'patient','existing detail content was not reused');
  assert.equal(await page.locator('#p-close').count(),0,'centered detail popup still exposes an X button');
  await page.locator('#panel').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const centered=await page.locator('#panel').boundingBox();
  assert.ok(centered&&Math.abs(centered.x+centered.width/2-550)<2&&Math.abs(centered.y+centered.height/2-400)<2,
    'wide word detail is not centered');
  assert.deepEqual(await geometry(),before,'opening centered details changed Reader geometry or scroll');
  await page.locator('#word-modal-scrim').click({position:{x:4,y:4}});
  await page.waitForFunction(()=>!wordLookupOpen());

  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='resilient');
    const key=keyOf('resilient');
    window.wordQa={calls:0};
    fetchDict=()=>{wordQa.calls++;words[key].loading=true;renderWordLookup();return new Promise(()=>{});};
    openWord(key,span);
  });
  await page.waitForFunction(()=>wordPeekOpen()&&document.getElementById('word-peek').classList.contains('loading'));
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'뜻 찾는 중','pending copy changed');
  assert.equal(await page.evaluate(()=>wordQa.calls),1,'new word did not start exactly one lookup');
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='resilient');
    openWord(keyOf('resilient'),span);
  });
  assert.equal(await page.evaluate(()=>wordQa.calls),1,'repeated tap on the same word duplicated the lookup');
  await page.locator('#word-peek-more').click();
  await page.waitForFunction(()=>wordPanelOpen());
  assert.equal(await page.evaluate(()=>wordQa.calls),1,'chevron started a second lookup');
  assert.equal(await page.locator('#p-ai').evaluate(node=>node.classList.contains('wait')),true,
    'detail popup did not continue the same pending state');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!wordLookupOpen());

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    fetchDict=()=>Promise.resolve();
    const spans=[...document.querySelectorAll('#rtext .w')];
    const span=spans.find(node=>node.textContent.toLowerCase()==='patient');
    openWord(keyOf('patient'),span);
  });
  await page.waitForFunction(()=>wordPeekOpen());
  await page.locator('#word-peek').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const compactPill=await page.locator('#word-peek').boundingBox();
  assert.ok(compactPill&&compactPill.x>=15&&compactPill.x+compactPill.width<=375,
    'compact edge placement escaped viewport padding');
  await page.locator('#word-peek-more').click();
  await page.locator('#panel').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const compact=await page.locator('#panel').boundingBox();
  assert.ok(compact&&Math.abs(compact.x+compact.width/2-195)<2&&Math.abs(compact.y+compact.height/2-422)<2,
    'compact word detail is not centered');
  assert.ok(compact.x>=15&&compact.x+compact.width<=375,'compact detail escaped viewport padding');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!wordLookupOpen());
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent.toLowerCase()==='another');
    const key=keyOf('another');
    words[key]={word:'another',clicked:'another',forms:[key],ko:'',phon:'',defs:[],kodict:[],
      example:'Another patient reader checks every repeated word carefully.',book:curBook.title,
      status:1,mark:true,addedAt:1,up:1,aiOff:'error'};
    selectWord(key,span,true);
  });
  await page.waitForFunction(()=>wordPeekOpen());
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'뜻을 찾지 못했어요',
    'failed lookup has no stable pill state');
  await page.evaluate(()=>closePanel());
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#sheetbg,#p-close,#p-handle').length),0,
    'removed sidebar or sheet DOM is still reachable');

  console.log('Word near-pill cache/pending placement, same-request detail popup, dismissal, and Reader geometry verified');
  await page.close();
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
