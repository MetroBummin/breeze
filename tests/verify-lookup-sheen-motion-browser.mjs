/* Real app motion evidence, with exact old-palette controls. No provider calls,
 * generated animation, substituted cue DOM, or changes to production timing.
 * Each raw video ends with >4 seconds of uninterrupted real shimmer; consumers
 * may trim the last 3.3 seconds to exclude fixture setup and fixed-phase frames.
 * BREEZE_QA_ENGINE=chromium|webkit BREEZE_LOOKUP_MOTION_PROOF=/tmp/sheen-motion
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.env.BREEZE_LOOKUP_MOTION_PROOF||'/tmp/breeze-lookup-sheen-motion');
mkdirSync(output,{recursive:true});
const engineName=process.env.BREEZE_QA_ENGINE||process.env.BROWSER||'chromium';
assert.ok(['chromium','webkit'].includes(engineName));
const engine=engineName==='webkit'?webkit:chromium;
const server=createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
const oldSheen='linear-gradient(108deg,transparent 28%,rgba(171,216,255,.42) 40%,rgba(255,255,255,.68) 49%,rgba(171,216,255,.42) 58%,transparent 70%)';
const phrase='A patient reader keeps every word and every meaning together while the sentence continues onto the next line.';
const reports=[];
let browser;
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{
  browser=await engine.launch({headless:true});
  for(const dark of [false,true])for(const kind of ['word','sentence'])for(const before of dark?[false]:[true,false]){
    const key=`${engineName}-${dark?'dark':'light'}-${kind}-${before?'before':'after'}`;
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
      serviceWorkers:'block',reducedMotion:'no-preference',recordVideo:{dir:resolve(output,'raw'),size:{width:390,height:844}}});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>{if(!error.message.startsWith('ResizeObserver loop'))errors.push(error.message);});
    await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
    await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
    await page.locator('#fileinput').setInputFiles({name:'Lookup motion comparison.txt',mimeType:'text/plain',
      buffer:Buffer.from((phrase+' Another sentence stays outside the selected source.\n\n').repeat(30))});
    await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
    await page.evaluate(async dark=>{
      darkMode=dark;applyDark();await openBook(books.find(book=>book.kind==='txt'));setReaderChrome(false);
    },dark);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20&&!readerPositionPending()&&!readerAnchorHeld());
    await page.evaluate(({before,dark,oldSheen,kind})=>{
      if(before)for(const owner of [document.documentElement,document.body]){
        owner.style.setProperty('--word-lookup-wash',dark?'rgba(102,170,239,.24)':'rgba(74,151,235,.22)');
        owner.style.setProperty('--word-lookup-sheen',oldSheen);
      }
      const node=[...document.querySelectorAll('#rtext .w')].find(node=>{
        const r=node.getBoundingClientRect();return node.textContent==='patient'&&r.top>=0&&r.bottom<innerHeight-100;
      });
      if(!node)throw new Error('Actual visible word is missing');
      if(kind==='word'){
        node.classList.add('sel');wordLookupFeedback.start(900,'text');
        wordLookupFeedback.present(900,node,{loading:true,text:''},false);window.qaMotionNodes=[node];
      }else{
        const r=node.getBoundingClientRect(),surface=READER_SURFACES.find(surface=>surface.name==='text');
        const found=surface.sentenceAt(r.left+r.width/2,r.top+r.height/2);
        if(!found?.paint)throw new Error('Actual sentence occurrence is missing');
        found.paint();setReaderSentencePending(true);window.qaMotionNodes=[...readerSentenceCue.layer.children];
      }
    },{before,dark,oldSheen,kind});
    // Wall time can advance while a busy WebKit recorder defers paint ticks.
    // Observe the existing background transition's real terminal value instead.
    const settledWash=await page.evaluate(()=>{
      const probe=document.createElement('i');
      probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none';
      probe.style.backgroundColor=getComputedStyle(document.body).getPropertyValue('--word-lookup-wash');
      document.body.append(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;
    });
    await page.waitForFunction(expected=>qaMotionNodes.every(node=>getComputedStyle(node).backgroundColor===expected),settledWash);
    const frames=[];
    for(const phase of [0,330,660,825,990,1320,1650]){
      const state=await page.evaluate(async phase=>{
        for(const node of qaMotionNodes)for(const animation of node.getAnimations()){
          if(animation.animationName==='breeze-word-sheen'){animation.pause();animation.currentTime=phase;}
        }
        await new Promise(requestAnimationFrame);
        return qaMotionNodes.map(node=>{
          const style=getComputedStyle(node),r=node.getBoundingClientRect();
          return {rect:[r.x,r.y,r.width,r.height],wash:style.backgroundColor,sheen:style.backgroundImage,
            position:style.backgroundPosition,animation:style.animationName,duration:style.animationDuration};
        });
      },phase);
      for(const node of state){assert.equal(node.animation,'breeze-word-sheen');assert.equal(node.duration,'1.65s');}
      const file=`${key}-${phase}ms.png`;
      await page.screenshot({path:resolve(output,file),animations:'allow'});
      frames.push({phase,file,state});
    }
    const start=await page.evaluate(()=>{
      const animations=qaMotionNodes.flatMap(node=>node.getAnimations()).filter(a=>a.animationName==='breeze-word-sheen');
      for(const animation of animations){animation.currentTime=0;animation.play();}
      return animations.map(a=>a.currentTime);
    });
    // Keep the last four seconds of each actual browser recording uninterrupted.
    await page.waitForTimeout(4200);
    const finish=await page.evaluate(()=>qaMotionNodes.flatMap(node=>node.getAnimations()).filter(a=>a.animationName==='breeze-word-sheen')
      .map(a=>({time:a.currentTime,state:a.playState})));
    assert.equal(finish.length,start.length);assert.ok(finish.length>0);
    for(const animation of finish){assert.equal(animation.state,'running');assert.ok(animation.time>=3900,'real shimmer did not advance');}
    assert.deepEqual(errors,[]);
    const video=page.video();await context.close();
    renameSync(await video.path(),resolve(output,`${key}.webm`));
    reports.push({key,frames,actualMotionMs:finish.map(a=>a.time),video:`${key}.webm`});
    console.log(`${key}: real production shimmer advances; fixed-phase frames and browser video saved`);
  }
}finally{
  writeFileSync(resolve(output,`${engineName}-motion-report.json`),JSON.stringify(reports,null,2)+'\n');
  if(browser)await browser.close();await new Promise(done=>server.close(done));
}
