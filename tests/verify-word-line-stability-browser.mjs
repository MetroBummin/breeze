/* A full line must keep its breaks when words become tappable spans and when
   one of those words is selected. Sign of the Four chapter 1 ends a tight
   heading on "Deduction"; side padding on `.w` used to drop that word. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

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
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
