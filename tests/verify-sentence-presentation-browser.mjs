import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png',
  '.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){ res.writeHead(403).end(); return; }
  try{ res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream'); res.end(readFileSync(path)); }
  catch{ res.writeHead(404).end(); }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();

try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
    serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
  await page.route('**/*',route=>{
    const href=route.request().url();
    return href.startsWith(url)||href.startsWith('blob:') ? route.continue() : route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'sentence-presentation.txt',mimeType:'text/plain',
    buffer:Buffer.from(('A patient reader keeps the sentence and its meaning together. '+
      'Another sentence keeps the page long enough to scroll.\n\n').repeat(80))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
  await page.evaluate(()=>readerScrollTo(700));

  const geometry=()=>page.evaluate(()=>{
    const rect=document.getElementById('readmain').getBoundingClientRect();
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,scroll:readerScrollTop(),zoom:originalZoom()};
  });
  const before=await geometry();
  await page.evaluate(()=>{
    window.qaSentence={};
    dictGet=()=>new Promise(resolve=>{ qaSentence.resolve=resolve; });
    dictPut=()=>Promise.resolve();
    openSentence('A patient reader keeps the sentence and its meaning together.');
  });
  await page.waitForFunction(()=>document.body.classList.contains('sentence-pill-waiting'));
  assert.equal(await page.locator('#sentence-modal').isVisible(),false,'compact pending opened a modal');
  assert.equal(await page.locator('#sentence-pill-status').isVisible(),true,'compact pending missed the pill');
  assert.equal(await page.locator('#sentence-pill-cancel').count(),0,'pending pill still exposes an X button');
  assert.equal(await page.locator('#readback').evaluate(node=>node.inert),true,'hidden side control stayed interactive');
  await page.locator('#readpill').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const compactPillBox=await page.locator('#readpill').boundingBox();
  assert.ok(compactPillBox && compactPillBox.width>340,'pending pill shrank back to a text-sized capsule');
  const lightPill=await page.locator('#readpill').evaluate(node=>{
    const style=getComputedStyle(node);
    return {background:style.backgroundColor,color:style.color,blur:style.backdropFilter||style.webkitBackdropFilter};
  });
  assert.match(lightPill.background,/rgba?\(/,'pending pill has no readable glass fallback');
  assert.doesNotMatch(lightPill.background,/77, 174, 214|38, 127, 168/,'pending pill still uses Breeze Blue fill');
  assert.match(lightPill.blur,/blur\(/,'pending pill lost its restrained glass blur');
  await page.evaluate(()=>qaSentence.resolve({ko:'참을성 있는 독자는 문장과 그 의미를 함께 둔다.',points:['주어와 동사가 이어지는 기본 구조']}));
  await page.waitForFunction(()=>document.body.classList.contains('sentence-compact'));
  assert.equal(await page.locator('#sentence-modal').isVisible(),true,'compact result did not open');
  const sheet=await page.locator('#p-sentence').boundingBox();
  assert.ok(sheet && sheet.y+sheet.height>760,'compact result is not anchored to the lower viewport');
  assert.equal(await page.locator('#ps-close').count(),0,'compact result still exposes an X button');
  assert.equal(await page.locator('#ps-cap').count(),0,'compact result still shows the redundant sentence title');
  assert.equal(await page.locator('#ps-grabber').isVisible(),true,'compact result has no swipe grabber');
  const compactEnglish=await page.locator('#ps-en').boundingBox();
  const compactKorean=await page.locator('#ps-ko').boundingBox();
  assert.ok(compactEnglish && compactKorean && compactEnglish.y<compactKorean.y,
    'compact result does not place English above Korean');
  assert.ok(await page.locator('#ps-en').evaluate(node=>node.scrollHeight===node.clientHeight),
    'compact English sentence is clipped or folded');
  assert.equal(await page.locator('#ps-extra').getAttribute('open'),null,
    'compact structure details should start collapsed');
  assert.deepEqual(await geometry(),before,'sentence overlay changed Reader geometry, scroll, or PDF zoom');
  const grabber=await page.locator('#ps-grabber').boundingBox();
  assert.ok(grabber,'compact grabber has no geometry');
  await page.evaluate(()=>{
    const handle=document.getElementById('ps-grabber');
    const rect=handle.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:91,pointerType:'touch',
      isPrimary:true,clientX:x,clientY:y}));
    document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:91,pointerType:'touch',
      isPrimary:true,clientX:x,clientY:y+120}));
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:91,pointerType:'touch',
      isPrimary:true,clientX:x,clientY:y+120}));
  });
  await page.waitForFunction(()=>!sentenceLookupOpen());
  assert.equal(await page.locator('#sentence-modal').isVisible(),false,'downward swipe did not dismiss the sheet');
  assert.deepEqual(await geometry(),before,'closing the sentence result moved the Reader');

  await page.setViewportSize({width:1100,height:800});
  await page.waitForFunction(()=>sentenceViewport().width>=640 && sentenceViewport().height>=500
    && sentenceLastCompact===false);
  await page.evaluate(()=>{
    dictGet=()=>new Promise(resolve=>{ qaSentence.resolve=resolve; });
    openSentence('A wide screen still waits in the same bottom pill.');
  });
  await page.waitForFunction(()=>document.body.classList.contains('sentence-pill-waiting'));
  assert.equal(await page.locator('#sentence-modal').isVisible(),false,'wide pending used the old centered waiter');
  assert.equal(await page.locator('#sentence-pill-status').isVisible(),true,'wide pending did not use the bottom pill');
  await page.locator('#readpill').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  const widePillBox=await page.locator('#readpill').boundingBox();
  assert.ok(widePillBox && Math.abs(widePillBox.width-520)<2,'wide pending pill no longer keeps its large size');
  await page.evaluate(()=>qaSentence.resolve({ko:'넓은 화면도 같은 하단 필에서 기다린다.',points:[]}));
  await page.waitForFunction(()=>document.getElementById('sentence-modal').hidden===false);
  await page.locator('#p-sentence').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
  assert.equal(await page.evaluate(()=>document.body.classList.contains('sentence-compact')),false,
    'wide result incorrectly became a bottom sheet');
  const centered=await page.locator('#p-sentence').boundingBox();
  assert.ok(centered && Math.abs(centered.x+centered.width/2-550)<2
    && Math.abs(centered.y+centered.height/2-400)<2,'wide result is not the existing centered modal');
  assert.equal(await page.locator('#ps-grabber').isVisible(),false,'wide modal incorrectly shows a sheet grabber');
  const wideEnglish=await page.locator('#ps-en').boundingBox();
  const wideKorean=await page.locator('#ps-ko').boundingBox();
  assert.ok(wideEnglish && wideKorean && wideEnglish.y<wideKorean.y,
    'wide modal does not place English above Korean');
  assert.ok(await page.locator('#ps-en').evaluate(node=>node.scrollHeight===node.clientHeight),
    'wide English sentence is clipped or folded');
  assert.equal(await page.locator('#ps-extra').getAttribute('open'),null,
    'wide structure details should start collapsed');
  await page.evaluate(()=>{
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
  });
  const darkSurface=await page.locator('#p-sentence').evaluate(node=>{
    const style=getComputedStyle(node);
    return {background:style.backgroundColor,color:style.color,blur:style.backdropFilter||style.webkitBackdropFilter};
  });
  assert.match(darkSurface.background,/rgba?\(/,'dark modal has no smoky glass surface');
  assert.doesNotMatch(darkSurface.background,/28, 46, 57|24, 39, 49/,'dark modal still uses blue AI fill');
  assert.match(darkSurface.blur,/blur\(/,'dark modal lost its glass blur');
  await page.locator('#sentence-scrim').click({position:{x:4,y:4}});
  await page.waitForFunction(()=>!sentenceLookupOpen());
  assert.equal(await page.locator('#sentence-modal').isVisible(),false,'outside tap did not dismiss the modal');

  /* Crossing the one result-presentation boundary ends the lookup. Its late answer stays stale. */
  await page.evaluate(()=>{
    dictGet=()=>new Promise(resolve=>{ qaSentence.resolve=resolve; });
    openSentence('Resize cancels this request.');
  });
  await page.waitForFunction(()=>document.body.classList.contains('sentence-pill-waiting'));
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!sentenceLookupOpen());
  await page.evaluate(()=>qaSentence.resolve({ko:'늦은 결과',points:[]}));
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#sentence-modal').isVisible(),false,'late resize response reopened the result');

  console.log('Sentence neutral glass pill, swipe sheet, centered modal, themes, and Reader invariants verified');
  await page.close();
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
