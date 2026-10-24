/* Home must keep scrolling after reader and vocabulary round-trips.
   The reader shell and word-study cards freeze the document. Leaving them
   has to drop that lock, including an inline lock left by the AI notice. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, webkit} from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const tossCss = readFileSync(resolve(root, 'styles/toss.css'), 'utf8');
assert.match(tossCss, /#v-home :is\(#casual-rail,#shelf,#home-casual-rail\)\{[^}]*overflow-y:\s*hidden/);
assert.match(readFileSync(resolve(root, 'scripts/core/state.js'), 'utf8'), /function releaseHomeDocumentScroll/);
assert.match(readFileSync(resolve(root, 'scripts/ui/vocabulary-review.js'), 'utf8'), /classList\.remove\('simple-word-cards'\)/);

const mime = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp'};
const server = createServer((req, res)=>{
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const path = resolve(root, '.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end(); return;}
  try{
    res.setHeader('Content-Type', mime[extname(path)]||'text/plain; charset=utf-8');
    res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

const probe = ()=>{
  const home=document.getElementById('v-home');
  home.style.minHeight='1800px';
  const scroller=document.scrollingElement||document.documentElement;
  const max=scroller.scrollHeight-scroller.clientHeight;
  scroller.scrollTop=max;
  const top=scroller.scrollTop;
  scroller.scrollTop=0;
  const app=getComputedStyle(document.getElementById('app'));
  const rail=document.getElementById('casual-rail');
  const railStyle=rail?getComputedStyle(rail):null;
  return {
    view:activeAppView(),
    max, top,
    reading:document.body.classList.contains('reading')||document.documentElement.classList.contains('reading'),
    cards:document.body.classList.contains('simple-word-cards'),
    settings:document.body.classList.contains('settings-open'),
    study:document.documentElement.classList.contains('study-sets-modal-open'),
    inline:(document.documentElement.style.overflow||'')+(document.body.style.overflow||'')+(document.documentElement.style.overflowY||'')+(document.body.style.overflowY||''),
    app:app.position,
    htmlOverflow:getComputedStyle(document.documentElement).overflowY,
    bodyOverflow:getComputedStyle(document.body).overflowY,
    notice:!!document.getElementById('toss-ai-notice')?.open,
    railY:railStyle?railStyle.overflowY:'',
    railTouch:railStyle?railStyle.touchAction:'',
  };
};
function assertScrollable(state, label){
  assert.equal(state.view, 'home', label+' view');
  assert.equal(state.reading, false, label+' reading lock');
  assert.equal(state.cards, false, label+' word-card lock');
  assert.equal(state.settings, false, label+' settings lock');
  assert.equal(state.study, false, label+' study-set lock');
  assert.equal(state.inline, '', label+' inline overflow');
  assert.notEqual(state.app, 'fixed', label+' app shell');
  assert.notEqual(state.htmlOverflow, 'hidden', label+' html overflow');
  assert.notEqual(state.bodyOverflow, 'hidden', label+' body overflow');
  assert.equal(state.notice, false, label+' notice');
  assert.ok(state.max>200, label+' scroll room '+state.max);
  assert.ok(state.top>200, label+' scrollTop '+state.top);
  assert.equal(state.railY, 'hidden', label+' shelf captures vertical pan');
  assert.match(state.railTouch, /pan-y/);
}

try{
  for(const [name, launch] of [
    ['chromium', ()=>chromium.launch({executablePath: process.env.BREEZE_BROWSER_EXECUTABLE || '/usr/bin/google-chrome', headless:true})],
    ['webkit', ()=>webkit.launch({headless:true})],
  ]){
    const browser = await launch();
    const page = await browser.newPage({viewport:{width:390, height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true});
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.addInitScript(()=>{
      window.BREEZE_TARGET='toss';
      localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done'));
      localStorage.setItem('breeze.toss.ai-notice', 'seen');
    });
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof homeReady!=='undefined' && typeof show==='function');
    await page.evaluate(()=>homeReady);
    await page.addStyleTag({content:tossCss});
    await page.evaluate(()=>{ document.documentElement.dataset.breezeTarget='toss'; });

    assertScrollable(await page.evaluate(probe), name+' initial');

    await page.evaluate(async ()=>{
      const book={id:'scroll-probe', title:'Scroll probe', kind:'txt',
        paras:Array.from({length:30}, ()=>'A paragraph long enough to open the reader shell. ')};
      books.push(book);
      await openBook(book);
    });
    const locked=await page.evaluate(()=>({
      reading:document.body.classList.contains('reading')&&document.documentElement.classList.contains('reading'),
      app:getComputedStyle(document.getElementById('app')).position,
      overflow:getComputedStyle(document.documentElement).overflowY,
    }));
    assert.equal(locked.reading, true, name+' reader lock class');
    assert.equal(locked.app, 'fixed', name+' reader shell');
    assert.equal(locked.overflow, 'hidden', name+' reader overflow');

    await page.evaluate(()=>{
      document.documentElement.style.overflow='hidden';
      document.body.style.overflow='hidden';
      localStorage.removeItem('breeze.toss.ai-notice');
      tossEnsureAiNotice();
    });
    assert.equal(await page.evaluate(()=>document.getElementById('toss-ai-notice').open), true, name+' notice over reader');
    await page.evaluate(()=>document.querySelector('#toss-ai-notice button').click());
    const afterNotice=await page.evaluate(()=>({
      open:!!document.getElementById('toss-ai-notice')?.open,
      reading:document.body.classList.contains('reading'),
      overflow:getComputedStyle(document.documentElement).overflowY,
      inline:document.documentElement.style.overflow+document.body.style.overflow,
    }));
    assert.equal(afterNotice.open, false, name+' notice closed');
    assert.equal(afterNotice.reading, true, name+' reader stays locked');
    assert.equal(afterNotice.overflow, 'hidden', name+' reader overflow after confirm');
    assert.equal(afterNotice.inline, '', name+' notice inline lock');
    await page.evaluate(()=>returnHomeFromReader());
    assertScrollable(await page.evaluate(probe), name+' reader return');

    await page.evaluate(async ()=>{
      document.documentElement.classList.add('reading');
      document.body.classList.add('reading');
      document.documentElement.style.overflow='hidden';
      document.body.classList.add('simple-word-cards');
      show('home');
    });
    assertScrollable(await page.evaluate(probe), name+' direct home');

    await page.evaluate(async ()=>{
      show('study');
      await simpleStudyResumeJob;
    });
    assert.equal(await page.evaluate(()=>document.body.classList.contains('simple-word-cards')), true, name+' study locks');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflowY), 'hidden', name+' study overflow');
    await page.evaluate(()=>show('vocab'));
    assert.equal(await page.evaluate(()=>document.body.classList.contains('simple-word-cards')), false, name+' vocab dropped the card lock');
    await page.evaluate(()=>show('home'));
    assertScrollable(await page.evaluate(probe), name+' vocab return');

    await page.evaluate(()=>{
      localStorage.removeItem('breeze.toss.ai-notice');
      document.documentElement.style.overflow='hidden';
      document.body.style.overflow='hidden';
      const dialog=document.getElementById('toss-ai-notice');
      if(dialog) dialog.remove();
      tossEnsureAiNotice();
    });
    assert.equal(await page.evaluate(()=>document.getElementById('toss-ai-notice').open), true, name+' notice opened');
    await page.evaluate(()=>document.querySelector('#toss-ai-notice button').click());
    assertScrollable(await page.evaluate(probe), name+' notice confirm');

    assert.deepEqual(errors, [], name+' page errors');
    await browser.close();
    console.log(name+': home stays scrollable after reader, vocabulary, and notice round-trips');
  }
}finally{
  await new Promise(done=>server.close(done));
}
