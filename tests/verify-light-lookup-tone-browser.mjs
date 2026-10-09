/* Actual imported Reader text and production word/sentence paint owners.
 * The before control pins the exact original production palette. Motion is paused
 * at the same animation time for pixel comparisons; no mockup/CSS cue replica.
 * Run: BREEZE_QA_ENGINE=chromium|webkit BREEZE_LOOKUP_TONE_PROOF=/tmp/tone node tests/verify-light-lookup-tone-browser.mjs
 * This browser proof is not physical iOS/WebView sign-off.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.env.BREEZE_LOOKUP_TONE_PROOF||'/tmp/breeze-light-lookup-tone');
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
let browser,page;
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{
  browser=await engine.launch({headless:true,executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
  page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>{if(!error.message.startsWith('ResizeObserver loop'))errors.push(error.message);});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
  await page.locator('#fileinput').setInputFiles({name:'Lookup color comparison.txt',mimeType:'text/plain',
    buffer:Buffer.from((phrase+' Another sentence stays outside the selected source.\n\n').repeat(30))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(async()=>{await openBook(books.find(book=>book.kind==='txt'));setReaderChrome(false);});
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20&&!readerPositionPending()&&!readerAnchorHeld());
  await page.evaluate(()=>{
    window.qaTone={};
    qaTone.close=()=>{
      wordLookupFeedback.end(900);qaTone.node?.classList.remove('sel');clearReaderSentenceCue(true);
    };
    qaTone.start=kind=>{
      qaTone.close();
      const node=[...document.querySelectorAll('#rtext .w')].find(node=>{
        const r=node.getBoundingClientRect();return node.textContent==='patient'&&r.top>=0&&r.bottom<innerHeight-100;
      });
      if(!node)throw new Error('Actual visible word occurrence is missing');
      qaTone.node=node;
      const r=node.getBoundingClientRect();
      const surface=READER_SURFACES.find(surface=>surface.name==='text');
      const found=surface.sentenceAt(r.left+r.width/2,r.top+r.height/2);
      if(!found?.paint)throw new Error('Actual sentence occurrence is missing');
      if(kind==='word'){
        node.classList.add('sel');wordLookupFeedback.start(900,'text');
        wordLookupFeedback.present(900,node,{loading:true,text:''},false);qaTone.nodes=[node];
      }else{
        found.paint();setReaderSentencePending(true);qaTone.nodes=[...readerSentenceCue.layer.children];
      }
    };
    qaTone.inspect=()=>{
      const shape=node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*1000)/1000);};
      return {source:[...document.querySelectorAll('#rtext .w')].slice(0,60).map(shape),
        scroll:readerScrollTop(),paper:getComputedStyle(document.body).getPropertyValue('--paper').trim(),
        ink:getComputedStyle(qaTone.node).color,
        cues:qaTone.nodes.map(node=>{
          const css=getComputedStyle(node);
          return {box:shape(node),background:css.backgroundColor,image:css.backgroundImage,
            animation:css.animationName,duration:css.animationDuration,timing:css.animationTimingFunction,
            size:css.backgroundSize,repeat:css.backgroundRepeat,radius:css.borderRadius,
            opacity:css.opacity,transform:css.transform,
            blend:getComputedStyle(node.closest('.reader-sentence-cue-layer')||node).mixBlendMode,
            wash:css.getPropertyValue('--breeze-lookup-wash').trim(),sheen:css.getPropertyValue('--breeze-lookup-sheen').trim()};
        })};
    };
  });
  const profiles=[[390,844],[820,1180],[1440,900],[320,568],[844,390],[390,360]];
  for(const [width,height] of profiles)for(const dark of [false,true])for(const reduced of [false,true]){
    await page.setViewportSize({width,height});
    await page.emulateMedia({colorScheme:dark?'dark':'light',reducedMotion:reduced?'reduce':'no-preference'});
    await page.evaluate(dark=>{qaTone.close();darkMode=dark;applyDark();readerScrollTo(0);setReaderChrome(false);},dark);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>!readerPositionPending()&&!readerAnchorHeld());
    const key=`${engineName}-${width}x${height}-${dark?'dark':'light'}-${reduced?'reduced':'motion'}`;
    console.log(`Checking original appearance ${key}`);
    const pair={key};reports.push(pair);
    for(const kind of ['word','sentence']){
      pair[kind]={};
      let beforePixels;
      for(const baseline of [true,false]){
        const state=baseline?'before':'after';
        await page.evaluate(({baseline,dark,oldSheen,kind})=>{
          qaTone.close();
          for(const owner of [document.documentElement,document.body]){
            if(baseline){
              owner.style.setProperty('--word-lookup-wash',dark?'rgba(102,170,239,.24)':'rgba(74,151,235,.22)');
              owner.style.setProperty('--word-lookup-sheen',oldSheen);
            }else{
              owner.style.removeProperty('--word-lookup-wash');owner.style.removeProperty('--word-lookup-sheen');
            }
          }
          qaTone.start(kind);
        },{baseline,dark,oldSheen,kind});
        // The word's existing 120ms background transition must finish before
        // comparing stable material values at a fixed shimmer phase.
        await page.waitForFunction(()=>{
          const probe=document.createElement('span');probe.style.backgroundColor=getComputedStyle(document.body).getPropertyValue('--word-lookup-wash');document.body.appendChild(probe);
          const expected=getComputedStyle(probe).backgroundColor;probe.remove();
          return qaTone.nodes.every(node=>getComputedStyle(node).backgroundColor===expected);
        });
        await page.evaluate(async()=>{
          // Whole-viewport screenshots also contain finite Reader chrome/theme
          // transitions. Wait for their terminal state, never the infinite sheen.
          await new Promise(requestAnimationFrame);
          await Promise.all(document.getAnimations().filter(animation=>
            animation.playState==='running'&&Number.isFinite(animation.effect?.getComputedTiming().endTime))
            .map(animation=>animation.finished.catch(()=>{})));
          await new Promise(requestAnimationFrame);
          for(const node of qaTone.nodes)for(const animation of node.getAnimations()){
            if(animation.animationName==='breeze-word-sheen'){animation.pause();animation.currentTime=825;}
          }
          await new Promise(requestAnimationFrame);
        });
        const snapshot=await page.evaluate(()=>qaTone.inspect());
        pair[kind][state]=snapshot;
        for(const cue of snapshot.cues){
          assert.equal(cue.animation,reduced?'none':'breeze-word-sheen',`${key}/${kind}/${state}: animation`);
          if(!reduced){assert.equal(cue.duration,'1.65s');assert.equal(cue.timing,'ease-in-out');}
          assert.equal(cue.radius,kind==='word'?'5px':'8px');
          assert.equal(cue.size,'240% 100%');assert.equal(cue.repeat,'no-repeat');
          assert.equal(cue.opacity,'1');assert.equal(cue.transform,'none');
          assert.equal(cue.blend,'normal','Text sentence wash must paint beneath source ink like word backgrounds');
          assert.equal(cue.image==='none',reduced);
        }
        console.log(`Capturing ${key}/${kind}/${state}`);
        const pixels=await page.screenshot({path:resolve(output,`${key}-${kind}-${state}.png`),animations:'allow'});
        if(baseline)beforePixels=pixels;
        else {
          // Never feed PNG Buffers to strict.deepEqual: formatting a large pixel
          // mismatch can exhaust the runner before it reports the real failure.
          const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
          assert.ok(pixels.equals(beforePixels),`${key}/${kind}: original production screenshot bytes changed; before=${digest(beforePixels)} (${beforePixels.length}), after=${digest(pixels)} (${pixels.length})`);
        }
      }
      const {before,after}=pair[kind];
      for(const field of ['source','scroll','paper','ink'])assert.deepEqual(after[field],before[field],`${key}/${kind}: ${field} changed`);
      assert.deepEqual(after.cues.map(c=>c.box),before.cues.map(c=>c.box),`${key}/${kind}: source geometry changed`);
      assert.deepEqual(after,before,`${key}/${kind}: original production rendering properties changed`);
    }
    for(const state of ['before','after'])for(const field of ['background','image','animation','duration','timing','size','repeat','wash','sheen']){
      for(const cue of pair.sentence[state].cues)assert.equal(cue[field],pair.word[state].cues[0][field],`${key}/${state}: word/sentence ${field} diverged`);
    }
    console.log(`${key}: actual word/sentence original palette, shared geometry and reduced motion passed`);
  }
  await page.evaluate(()=>qaTone.close());
  assert.equal(await page.locator('.breeze-lookup-pending,.reader-sentence-cue-layer').count(),0,'paint remains after close');
  assert.deepEqual(errors,[]);
} catch(error){
  if(page)await page.screenshot({path:resolve(output,`${engineName}-failure.png`)}).catch(()=>{});
  throw error;
} finally{
  writeFileSync(resolve(output,`${engineName}-computed-styles.json`),JSON.stringify(reports,null,2)+'\n');
  if(browser)await browser.close();
  await new Promise(done=>server.close(done));
}
