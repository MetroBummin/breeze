import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium,webkit} from 'playwright';
import {textRotationSource} from './helpers/text-rotation-source.mjs';

const source=textRotationSource(),css=readFileSync(new URL('../styles/reader.css',import.meta.url),'utf8');
const html=`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
*{box-sizing:border-box}body{margin:0;--serif:Georgia,serif;--ink-body:#222;--page:#faf8f2;--readw:1000px}
#reader-scroll{overflow-anchor:none}#v-read{display:block}#readmain{flex:none}
</style></head><body class="reading"><div id="v-read" class="on"><div id="readmain"><div id="reader-scroll"><div id="readwrap"><h1 id="rtitle">Synthetic rotation fixture</h1><div id="rtext"></div></div></div></div></div>
<script>
let curBook={id:'synthetic'},lastAnchor=null,positions={},LS_POS='positions';
function updatePfill(){readerFrameAnchor()}function followScrollDirection(){}function whileRestoringChrome(fn){return fn()}
function posOf(id){return positions[id]||{}}function textProgressForBook(book,a){return a.pi/600}
function readerProgressAtEnd(p){return p}function sameProgressLocation(){return false}function save(){}
</script><script>${source}</script><script>
const rt=document.getElementById('rtext');
for(let j=0;j<120;j++){
 const section=document.createElement('section');section.className='page';
 for(let k=0;k<5;k++){
  const p=document.createElement('p');p.dataset.pi=j*5+k;
  p.textContent='Paragraph '+(j*5+k)+'. '+
   'The quiet river curled past the garden, where every leaf carried a silver drop of rain. We walked slowly along the old path and watched the changing light. '.repeat(3);
  section.append(p);
 }
 rt.append(section);
 const no=document.createElement('div');no.className='pageno';no.textContent='— '+(j+1)+' —';rt.append(no);
}
window.qa={sample(){return {anchor:captureAnchor(),remembered:lastAnchor,top:readerScrollTop(),width:document.getElementById('readmain').getBoundingClientRect().width}},
 setup(){readerScrollPauseUntil=0;readerAnchorHoldUntil=0;restoreAnchor({pi:250,dy:-70});lastAnchor=captureAnchor();return this.sample()}};
</script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
let browser;const rows=[];
const proof=`/tmp/breeze-text-rotation-${engine.name()}`;mkdirSync(proof,{recursive:true});
try{
 browser=await engine.launch();
 const page=await browser.newPage({viewport:{width:1180,height:820},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForTimeout(100);
 const check=async(before,label)=>{
  const after=await page.evaluate(()=>qa.sample());rows.push({label,before,after});
  assert.equal(after.anchor.pi,before.anchor.pi,`${label}: source paragraph moved`);
  assert.ok(Math.abs(after.anchor.dy-before.anchor.dy)<=1,`${label}: source offset drifted`);
  return after;
 };
 // Reproduce the problematic ordering with actual browser layout: a queued
 // progress rAF forces the changed width before ResizeObserver delivery.
 await page.evaluate(()=>qa.setup());await page.waitForTimeout(50);
 const beforeRace=await page.evaluate(()=>qa.sample());
 await page.evaluate(()=>new Promise(resolve=>{
  requestAnimationFrame(()=>{document.getElementById('readmain').style.width='820px';});
  scheduleProgressUpdate();
  requestAnimationFrame(()=>requestAnimationFrame(resolve));
 }));
 await check(beforeRace,'queued-progress-before-observer');
 if(process.env.BREEZE_ROTATION_CASE!=='race'){
  await page.evaluate(()=>document.getElementById('readmain').style.width='');
  for(const maxWidth of [700,1000])for(const start of [820,1180])for(const count of [1,3,5])for(const delay of [80,700]){
   await page.setViewportSize({width:start,height:start===820?1180:820});
   await page.evaluate(w=>document.body.style.setProperty('--readw',w+'px'),maxWidth);
   await page.waitForTimeout(80);await page.evaluate(()=>qa.setup());await page.waitForTimeout(40);
   const before=await page.evaluate(()=>qa.sample());
   for(let i=0;i<count;i++){
    const width=i%2===0?(start===820?1180:820):start;
    await page.evaluate(()=>scheduleProgressUpdate());
    await page.setViewportSize({width,height:width===820?1180:820});await page.waitForTimeout(delay);
    await check(before,`max${maxWidth}/start${start}/${count}/${delay}/rotation${i+1}`);
   }
  }
  // An exit/visibility save can occur in the same task as a forced layout.
  await page.setViewportSize({width:1180,height:820});await page.waitForTimeout(80);
  await page.evaluate(()=>qa.setup());const beforeSave=await page.evaluate(()=>qa.sample());
  const saved=await page.evaluate(()=>{
   document.getElementById('readmain').style.width='820px';saveReadingState();return posOf(curBook.id);
  });
  assert.equal(saved.pi,beforeSave.anchor.pi,'exit save captured reflow');
  await check(beforeSave,'save-before-observer');
  // Genuine reading immediately after resize must not be discarded by a hold.
  await page.evaluate(()=>{readerScroller().scrollTop+=650;readerScroller().dispatchEvent(new Event('scroll'));});
  await page.waitForTimeout(50);const afterScroll=await page.evaluate(()=>qa.sample());
  assert.notEqual(afterScroll.anchor.pi,beforeSave.anchor.pi);
  assert.deepEqual(afterScroll.remembered,afterScroll.anchor);
  await page.evaluate(()=>document.getElementById('readmain').style.width='1180px');await page.waitForTimeout(50);
  await check(afterScroll,'scroll-between-rapid-reversals');
  // Existing font and reopen behavior continues to use the exact saved dy.
  await page.evaluate(()=>keepPlace(()=>document.body.style.setProperty('--fs','23px')));await page.waitForTimeout(100);
  await check(afterScroll,'font-change');
  await page.evaluate(()=>{saveReadingState();readerScrollTo(0);restoreAnchor(posOf(curBook.id));});
  await check(afterScroll,'saved-anchor-reopen');
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:`${proof}/final.png`});
 console.log(`${engine.name()}: ${rows.length} real-layout rotation/restore assertions passed`);
}finally{
 writeFileSync(`${proof}/results.json`,JSON.stringify({engine:engine.name(),rows},null,2));
 await browser?.close();await new Promise(done=>server.close(done));
}
