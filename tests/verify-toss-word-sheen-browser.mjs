/* Toss paints the word sheen on a block overlay. The inline background does not
   move in the iOS webview, while the sentence cue (already a block) does.
   The overlay must not change line breaks: no padding, margin, or
   box-decoration-break. */
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
const tossCss = readFileSync(resolve(root, 'styles/toss.css'), 'utf8');
const tossRules = tossCss.replace(/\/\*[\s\S]*?\*\//g, '');
assert.doesNotMatch(tossRules, /box-decoration-break|padding:\s*0\s+1px|inline-block/);

const engines = [
  ['chromium', ()=>chromium.launch({executablePath: process.env.BREEZE_BROWSER_EXECUTABLE || '/usr/bin/google-chrome', headless:true})],
  ['webkit', ()=>webkit.launch({headless:true})],
];

try{
  for(const [name, launch] of engines){
    const browser = await launch();
    const page = await browser.newPage({viewport:{width:390, height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true});
    await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done')));
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof wordSpans==='function' && typeof wordLookupFeedback==='object');
    await page.addStyleTag({content:tossCss});
    const report = await page.evaluate(async ()=>{
      document.documentElement.dataset.breezeTarget = 'toss';
      document.documentElement.classList.add('reading');
      document.body.classList.add('reading');
      document.getElementById('v-read').classList.add('on');
      const rtext = document.getElementById('rtext');
      rtext.className = 'holmes-story';
      rtext.innerHTML = '<section class="page" id="probe"><h3 class="holmes-chapter" id="ch"></h3><p id="para"></p></section>';
      const probe = document.getElementById('probe');
      probe.style.padding = '0';
      probe.style.border = '0';
      probe.style.boxShadow = 'none';
      probe.style.margin = '0';
      const chapter = document.getElementById('ch');
      chapter.innerHTML = wordSpans('Chapter 1. The Science of Deduction', new Map(), true);
      const lineCount = el=>{
        const tops = [];
        for(const node of el.querySelectorAll('.w')){
          const top = node.getClientRects()[0]?.top;
          if(top==null) continue;
          if(!tops.some(item=>Math.abs(item-top)<2)) tops.push(top);
        }
        return tops.length;
      };
      let fit = 0;
      for(let width=120; width<=1400; width++){
        probe.style.width = width+'px';
        if(lineCount(chapter)===1){fit = width; break;}
      }
      const before = lineCount(chapter);
      const target = [...chapter.querySelectorAll('.w')].find(node=>node.textContent==='Deduction');
      const beforeTop = target.getClientRects()[0].top;
      wordLookupFeedback.start(1, 'text');
      wordLookupFeedback.present(1, target, {loading:true, text:''}, false);
      const after = lineCount(chapter);
      const afterTop = target.getClientRects()[0].top;
      const word = target;
      const pseudo = getComputedStyle(word, '::after');
      const box = word.getBoundingClientRect();
      const anims = word.getAnimations({subtree:true}).filter(animation=>animation.animationName==='breeze-word-sheen');
      for(const animation of anims){animation.pause(); animation.currentTime = 120;}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {
        fit, before, after, moved: Math.abs(afterTop-beforeTop)>1,
        image: getComputedStyle(word).backgroundImage,
        pseudo: {
          content: pseudo.content,
          position: pseudo.position,
          animation: pseudo.animationName,
          width: pseudo.width,
          height: pseudo.height,
          image: pseudo.backgroundImage.slice(0, 24),
        },
        box: {width: box.width, height: box.height},
        anims: anims.length,
      };
    });
    assert.equal(report.before, 1, `${name}: heading did not fit one line`);
    assert.equal(report.after, report.before, `${name}: Deduction wrapped when the sheen overlay was added`);
    assert.equal(report.moved, false, `${name}: Deduction changed lines`);
    assert.equal(report.image, 'none', `${name}: inline sheen image still paints under the overlay`);
    assert.equal(report.pseudo.content, '""');
    assert.equal(report.pseudo.position, 'absolute');
    assert.equal(report.pseudo.animation, 'breeze-word-sheen');
    assert.ok(report.anims>=1, `${name}: sheen animation is not running`);
    const early = await page.screenshot({clip: await page.locator('#ch .w', {hasText:'Deduction'}).boundingBox()});
    await page.evaluate(()=>{
      const word = [...document.querySelectorAll('#ch .w')].find(node=>node.textContent==='Deduction');
      for(const animation of word.getAnimations({subtree:true})){
        if(animation.animationName==='breeze-word-sheen') animation.currentTime = 825;
      }
    });
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const mid = await page.screenshot({clip: await page.locator('#ch .w', {hasText:'Deduction'}).boundingBox()});
    assert.ok(!early.equals(mid), `${name}: word overlay did not move between sheen frames`);
    await browser.close();
    console.log(`${name}: toss word sheen overlay moves and Deduction stays at ${report.fit}px`);
  }
}finally{
  await new Promise(done=>server.close(done));
}
