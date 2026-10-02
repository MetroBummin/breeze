import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const proof=resolve(tmpdir(),'breeze-reader-chrome-motion');mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;

// Sample the actual transition, rather than only checking its settled endpoints.
async function transition(page,hidden,reverse=false){
  return page.evaluate(async({hidden,reverse})=>{
    const pill=document.getElementById('readpill'),entry=pill.querySelector('.ink-pill-entry');
    const sample=()=>{const r=pill.getBoundingClientRect();return {center:r.x+r.width/2,width:r.width,height:r.height,entry:entry.getBoundingClientRect().width,inert:entry.inert,display:getComputedStyle(entry).display};};
    const start=sample(),rows=[];
    setReaderChrome(hidden);
    const immediate=sample(),began=performance.now();let reversed=false,jump=0;
    await new Promise(done=>{
      const frame=now=>{
        rows.push({...sample(),time:now-began});
        if(reverse&&!reversed&&now-began>=80){
          const before=sample();setReaderChrome(!hidden);const after=sample();
          jump=Math.max(Math.abs(after.center-before.center),Math.abs(after.width-before.width));reversed=true;
        }
        if(now-began<450)requestAnimationFrame(frame);else done();
      };requestAnimationFrame(frame);
    });
    return {start,immediate,rows,end:sample(),jump};
  },{hidden,reverse});
}
function checkTrajectory(result,offset){
  assert.ok(Math.abs(result.immediate.center-result.start.center)<.5,'Changing state must not jump the center');
  assert.ok(Math.abs(result.immediate.width-result.start.width)<.5,'Changing state must not jump the width');
  assert.notEqual(result.immediate.display,'none','Ink entry keeps its layout slot while fading');
  const {start,end,rows}=result;
  let previous=start.center;
  for(const row of rows){
    assert.ok((row.center-previous)*Math.sign(end.center-start.center)>=-.5,'Center must not reverse direction before reaching its target');
    previous=row.center;
    for(const key of ['center','width','height','entry']){
      assert.ok(row[key]>=Math.min(start[key],end[key])-.5&&row[key]<=Math.max(start[key],end[key])+.5,`${key} must not overshoot`);
    }
    const shape=(row.height-start.height)/(end.height-start.height);
    if(offset){const position=(row.center-start.center)/(end.center-start.center);assert.ok(Math.abs(shape-position)<.035,`Translation and height follow the same easing: ${JSON.stringify({row,start,end,shape,position})}`);}
    if(Math.abs(end.width-start.width)>1){const width=(row.width-start.width)/(end.width-start.width);assert.ok(Math.abs(shape-width)<.035,'Width must start shrinking with height, without a max-width plateau');}
    if(row.time>300){assert.ok(Math.abs(row.width-end.width)<.5&&Math.abs(row.center-end.center)<.5,'Geometry must settle together');}
  }
  assert.ok(rows.some(row=>row.height>34.5&&row.height<43.5),'Capture an intermediate shape');
}

try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  const browser=await engine.launchPersistentContext('',{viewport:{width:820,height:1180},hasTouch:true,serviceWorkers:'block'});
  try{
    const page=await browser.newPage(),errors=[];await page.bringToFront();
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
    await page.addInitScript(()=>{window.breezeInkIPad=true;localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
    await page.goto(url);await page.evaluate(()=>homeReady);
    await page.locator('#fileinput').setInputFiles({name:'Motion.pdf',mimeType:'application/pdf',buffer:fixturePdf(12)});
    await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
    await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
    try{await page.waitForSelector('.pdf-source-page canvas');}
    catch(error){console.log('PDF motion setup failed',errors,await page.evaluate(()=>({body:document.body.className,html:document.getElementById('original-content').innerHTML.slice(0,1000)})));throw error;}
    await page.waitForSelector('#readpill.ink-pill-ready .ink-pill-entry');
    for(const [width,height] of [[320,740],[390,844],[507,900],[650,900],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
      await page.setViewportSize({width,height});
      await page.evaluate(d=>{darkMode=d;applyDark();readerNotices.reset();pinReaderChrome(true,'motion-test');expandReaderChrome();},dark);
      await page.waitForTimeout(400);
      const offset=width<=650?22:0;
      await page.waitForFunction(center=>{const r=document.getElementById('readpill').getBoundingClientRect();return Math.abs(r.x+r.width/2-center)<.5;},width/2+offset);
      const collapse=await transition(page,true);
      assert.ok(Math.abs(collapse.start.center-width/2-offset)<.5,`Expanded PDF offset at ${width}: ${JSON.stringify(collapse.start)}`);
      assert.ok(Math.abs(collapse.end.center-width/2)<.5,'Collapsed PDF center');
      assert.equal(collapse.immediate.inert,true,'Entry cannot receive input during collapse');
      checkTrajectory(collapse,offset);
      const expand=await transition(page,false);checkTrajectory(expand,offset);
      assert.equal(expand.end.inert,false,'Entry is usable after expansion');
      assert.ok(Math.abs(expand.end.center-width/2-offset)<.5);
      const reverse=await transition(page,true,true);
      assert.ok(reverse.jump<.5,'Reversing motion starts at the current presentation');
      assert.ok(Math.abs(reverse.end.center-width/2-offset)<.5,'Reversal finishes expanded');
      if(width===390){
        const repeated=await page.evaluate(async()=>{
          const pill=document.getElementById('readpill'),box=readerScroller(),rows=[];
          // Keep paper/progress updating while repeatedly interrupting geometry.
          for(const hidden of [true,false,true,false,true,false]){
            setReaderChrome(hidden);
            const began=performance.now();
            await new Promise(done=>{
              const frame=now=>{
                readerScrollTo(box.scrollTop+(hidden?3:-3));
                const r=pill.getBoundingClientRect();
                rows.push(r.x+r.width/2);
                if(now-began<90)requestAnimationFrame(frame);else done();
              };requestAnimationFrame(frame);
            });
          }
          return rows;
        });
        assert.ok(repeated.every(center=>center>=width/2-.5&&center<=width/2+offset+.5),'Repeated interrupted motion while scrolling stays between the two anchors');
        await page.waitForTimeout(350);
      }
      await page.screenshot({path:resolve(proof,`${engine.name()}-${width}-${dark?'dark':'light'}.png`)});
    }
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
    await page.locator('.ink-pill-entry').click();await page.waitForTimeout(350);
    await page.evaluate(()=>setReaderChrome(true));
    assert.equal(await page.evaluate(()=>document.body.classList.contains('chrome-hidden')),false,'Writing stays expanded');
    await page.locator('.ink-pill-entry').click();await page.waitForTimeout(350);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion:reduce)').matches&&getComputedStyle(document.getElementById('readpill')).getPropertyValue('--reader-chrome-duration').trim()==='0s');
    await page.evaluate(async()=>{setReaderChrome(true);await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});
    assert.ok(Math.abs((await page.locator('#readpill').boundingBox()).width-140.4)<.6);
    assert.equal(await page.locator('.ink-pill-entry').evaluate(e=>getComputedStyle(e).visibility),'hidden');
    await page.evaluate(()=>expandReaderChrome());await page.waitForTimeout(40);
    const expanded=await page.locator('#readpill').boundingBox();
    assert.ok(Math.abs(expanded.x+expanded.width/2-217)<.5,'Reduced motion reaches 22px immediately');
    assert.deepEqual(errors,[]);
    console.log(`${engine.name()}: synchronized collapse/expand, reversal, writing and reduced motion passed`);
  }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
