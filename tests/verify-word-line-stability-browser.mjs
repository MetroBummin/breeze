/* A full line must keep its breaks when words become tappable spans and when
   one of those words is selected. Sign of the Four chapter 1 ends a tight
   heading on "Deduction"; side padding on `.w` used to drop that word. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, webkit} from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.png':'image/png'};
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
const pendingCss = readFileSync(resolve(root, 'scripts/dictionary/lookup-feedback.js'), 'utf8')
  .match(/const styles=`([\s\S]*?)`;/)[1];

const samples = [
  {name:'chapter heading', selector:'h3', className:'holmes-chapter', text:'Chapter 1. The Science of Deduction', word:'Deduction'},
  {name:'body sentence', selector:'p', className:'', text:'So much is observation. The rest is deduction.', word:'deduction'},
];

function launch(){
  if(process.env.BROWSER==='webkit') return webkit.launch({headless:true});
  return chromium.launch({
    executablePath: process.env.BREEZE_BROWSER_EXECUTABLE || '/usr/bin/google-chrome',
    headless: true,
  });
}

const browser = await launch();
try{
  for(const deviceScaleFactor of [1, 2]){
    const page = await browser.newPage({viewport:{width:900, height:800}, deviceScaleFactor});
    await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done')));
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof wordSpans==='function');
    await page.addStyleTag({content:pendingCss});
    const report = await page.evaluate(async samples=>{
      document.getElementById('v-read').classList.add('on');
      const wrap = document.getElementById('readwrap');
      wrap.style.maxWidth = 'none';
      wrap.style.padding = '0';
      const rtext = document.getElementById('rtext');
      rtext.className = 'holmes-story';
      rtext.innerHTML = '<section class="page" id="probe"></section>';
      const probe = document.getElementById('probe');
      probe.style.padding = '0';
      probe.style.border = '0';
      probe.style.boxShadow = 'none';
      probe.style.margin = '0';
      probe.style.width = '400px';
      const wordLine = (el, word)=>{
        const spans = [...el.querySelectorAll('.w')].filter(node=>node.textContent===word);
        if(spans.length){
          const tops = [];
          for(const node of el.querySelectorAll('.w')){
            const top = node.getClientRects()[0]?.top;
            if(top==null) continue;
            if(!tops.some(item=>Math.abs(item-top)<2)) tops.push(top);
          }
          tops.sort((a,b)=>a-b);
          const top = spans[0].getClientRects()[0].top;
          return tops.findIndex(item=>Math.abs(item-top)<2);
        }
        const node = [...el.childNodes].find(item=>item.nodeType===3);
        const at = node.textContent.lastIndexOf(word);
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at+word.length);
        const all = document.createRange();
        all.selectNodeContents(el);
        const tops = [];
        for(const rect of all.getClientRects()){
          if(rect.width<=0||rect.height<=0) continue;
          if(!tops.some(item=>Math.abs(item-rect.top)<2)) tops.push(rect.top);
        }
        tops.sort((a,b)=>a-b);
        const top = range.getBoundingClientRect().top;
        return tops.findIndex(item=>Math.abs(item-top)<2);
      };
      const lineCount = el=>{
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = [];
        for(const rect of range.getClientRects()){
          if(rect.width<=0||rect.height<=0) continue;
          if(!tops.some(item=>Math.abs(item-rect.top)<2)) tops.push(rect.top);
        }
        return tops.length;
      };
      const results = [];
      for(const sample of samples){
        probe.replaceChildren();
        const el = document.createElement(sample.selector);
        if(sample.className) el.className = sample.className;
        el.textContent = sample.text;
        probe.appendChild(el);
        let fit = 0;
        for(let width=120; width<=1400; width++){
          probe.style.width = width+'px';
          if(lineCount(el)===1){fit = width; break;}
        }
        if(!fit){results.push({...sample, error:'plain text never fits one line'}); continue;}
        const plainLine = wordLine(el, sample.word);
        const plainCount = lineCount(el);
        el.innerHTML = wordSpans(sample.text, new Map(), true);
        const spanCount = lineCount(el);
        const spanLine = wordLine(el, sample.word);
        const target = [...el.querySelectorAll('.w')].find(node=>node.textContent===sample.word);
        target.classList.add('sel', 'breeze-lookup-pending', 's1');
        const selectedCount = lineCount(el);
        const selectedLine = wordLine(el, sample.word);
        results.push({
          name:sample.name, fit, plainCount, plainLine, spanCount, spanLine, selectedCount, selectedLine,
          dpr:devicePixelRatio,
        });
      }
      return results;
    }, samples);
    for(const item of report){
      assert.equal(item.error||'', '', `${item.name} @${deviceScaleFactor}x: ${item.error||''}`);
      assert.equal(item.spanCount, item.plainCount, `${item.name} wrapped when words became spans at ${item.fit}px`);
      assert.equal(item.spanLine, item.plainLine, `${item.name} moved lines when words became spans`);
      assert.equal(item.selectedCount, item.plainCount, `${item.name} wrapped when the word was tapped`);
      assert.equal(item.selectedLine, item.plainLine, `${item.name}: the tapped word changed lines`);
    }
    await page.close();
  }

  /* Phone chapter heading. text-wrap:balance keeps "Science of Deduction"
     together; greedy wrap puts Deduction on the next line. WebKit drops
     balance while an inline word has box-decoration-break:clone, which the
     lookup sheen used to set until the answer arrived. */
  assert.doesNotMatch(pendingCss, /box-decoration-break\s*:/, 'lookup cue must not set box-decoration-break');
  const phone = await browser.newPage({viewport:{width:390, height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true});
  await phone.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done')));
  await phone.goto(url, {waitUntil:'domcontentloaded'});
  await phone.waitForFunction(()=>typeof wordSpans==='function');
  await phone.addStyleTag({content:pendingCss});
  const fitted = await phone.evaluate(()=>{
    document.documentElement.classList.add('reading');
    document.body.classList.add('reading');
    document.getElementById('v-read').classList.add('on');
    const rtext = document.getElementById('rtext');
    rtext.className = 'holmes-story';
    rtext.innerHTML = '<section class="page" id="probe"><h2 class="holmes-chapter" id="ch"></h2></section>';
    const probe = document.getElementById('probe');
    const el = document.getElementById('ch');
    el.innerHTML = wordSpans('Chapter 1. The Science of Deduction', new Map(), true);
    const signature = ()=>{
      const tops = [];
      for(const node of el.querySelectorAll('.w')){
        const top = node.getClientRects()[0].top;
        if(!tops.some(item=>Math.abs(item-top)<1)) tops.push(top);
      }
      tops.sort((a,b)=>a-b);
      return [...el.querySelectorAll('.w')].map(node=>{
        const rect = node.getClientRects()[0];
        return {t:node.textContent, line:tops.findIndex(item=>Math.abs(item-rect.top)<1), top:Math.round(rect.top)};
      });
    };
    const candidates = [];
    const natural = probe.getBoundingClientRect().width;
    for(const width of [natural, ...Array.from({length:91}, (_,i)=>220+i*2)]){
      probe.style.width = width+'px';
      const rest = signature();
      el.style.textWrap = 'wrap';
      const greedy = signature();
      el.style.textWrap = '';
      const moved = JSON.stringify(rest)!==JSON.stringify(greedy);
      const ded = name=>rest.find(word=>word.t===name);
      if(moved && ded('Deduction') && ded('of') && ded('Deduction').line===ded('of').line){
        candidates.push({width, rest, greedy});
        break;
      }
    }
    if(!candidates.length) return {error:'no phone width where balance keeps Deduction with "of" and greedy does not'};
    const chosen = candidates[0];
    probe.style.width = chosen.width+'px';
    el.style.textWrap = '';
    return chosen;
  });
  assert.equal(fitted.error||'', '', fitted.error||'');
  const dedLine = fitted.rest.find(word=>word.t==='Deduction').line;
  const greedyDed = fitted.greedy.find(word=>word.t==='Deduction').line;
  assert.ok(greedyDed!==dedLine || fitted.greedy.find(word=>word.t==='of').line!==fitted.rest.find(word=>word.t==='of').line,
    'greedy layout no longer moves the full line that ends on Deduction');

  await phone.evaluate(()=>{
    const word = [...document.querySelectorAll('#ch .w')].find(node=>node.textContent==='Deduction');
    const scroller = document.getElementById('reader-scroll');
    const rect = word.getBoundingClientRect();
    const origin = scroller.getBoundingClientRect().top;
    scroller.scrollTop += rect.top - origin - scroller.clientHeight / 2;
  });
  await phone.evaluate(()=>{
    window.__frames = [];
    const el = document.getElementById('ch');
    const sample = phase=>{
      const tops = [];
      const words = [...el.querySelectorAll('.w')].map(node=>{
        const rect = node.getClientRects()[0];
        if(!tops.some(item=>Math.abs(item-rect.top)<1)) tops.push(rect.top);
        return {t:node.textContent, top:rect.top, node};
      });
      tops.sort((a,b)=>a-b);
      window.__frames.push({
        phase,
        words:words.map(word=>({t:word.t, line:tops.findIndex(item=>Math.abs(item-word.top)<1), top:Math.round(word.top)})),
        active:words.some(word=>word.node.matches(':active')),
        classes:words.find(word=>word.t==='Deduction').node.className,
        peek:!document.getElementById('word-peek').hidden,
      });
    };
    window.__sample = sample;
    const loop = ()=>{ sample('raf'); window.__raf = requestAnimationFrame(loop); };
    window.__raf = requestAnimationFrame(loop);
  });
  const box = await phone.locator('#ch .w', {hasText:'Deduction'}).boundingBox();
  await phone.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await phone.mouse.down();
  await phone.evaluate(()=>window.__sample('pointerdown'));
  await phone.waitForTimeout(80);
  await phone.mouse.up();
  await phone.evaluate(()=>window.__sample('pointerup'));
  await phone.evaluate(async ()=>{
    const wait = ()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const el = document.getElementById('ch');
    const target = [...el.querySelectorAll('.w')].find(node=>node.textContent==='Deduction');
    const peek = document.getElementById('word-peek');
    target.classList.add('sel');
    window.__sample('selected');
    await wait();
    target.classList.add('breeze-lookup-pending');
    target.setAttribute('aria-busy','true');
    window.__sample('lookup');
    await wait();
    peek.hidden = false;
    window.__sample('popup');
    await wait();
    peek.hidden = true;
    target.classList.remove('breeze-lookup-pending','sel');
    target.removeAttribute('aria-busy');
    window.__sample('closed');
    await wait();
  });
  const frames = await phone.evaluate(()=>{ cancelAnimationFrame(window.__raf); return window.__frames; });
  const base = frames.find(frame=>frame.phase==='raf') || frames[0];
  const moved = frames.filter(frame=>JSON.stringify(frame.words)!==JSON.stringify(base.words));
  assert.equal(moved.length, 0, `line boxes moved during tap: ${JSON.stringify(moved.slice(0,4))}`);
  assert.ok(frames.some(frame=>frame.phase==='pointerdown' && frame.active), 'pointerdown did not reach the word :active state');
  assert.ok(frames.some(frame=>frame.phase==='lookup' && frame.classes.includes('breeze-lookup-pending') && frame.classes.includes('sel')),
    'lookup marker was not applied with the selection');
  assert.ok(frames.some(frame=>frame.phase==='popup' && frame.peek), 'lookup popup did not open');
  assert.ok(frames.some(frame=>frame.phase==='closed' && !frame.peek && frame.classes==='w'), 'lookup did not close cleanly');
  const phases = [...new Set(frames.map(frame=>frame.phase))];
  assert.ok(['raf','pointerdown','pointerup','selected','lookup','popup','closed'].every(phase=>phases.includes(phase)),
    `tap sequence missed a phase: ${phases.join(',')}`);
  await phone.close();
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
