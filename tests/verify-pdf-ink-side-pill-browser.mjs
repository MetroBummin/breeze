/* Lookup-pill placement with the writing dock (필기 바) parked on every edge.
 * On a real device the mini word pill drifted off the tapped word and the
 * expanded pill rendered clipped when the toolbar was docked LEFT or RIGHT,
 * because the shared placement math treated #readchrome as a bottom strip.
 * This regression docks the toolbar on each edge and asserts the mini pill
 * stays anchored to the word and the expanded surface stays inside the viewport.
 *
 * Chromium-only in-sandbox (WebKit binary unavailable offline); CI runs both
 * engines via BREEZE_QA_ENGINE. Synthetic touch is not Pencil proof.
 */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {extname,resolve} from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.BREEZE_SIDE_PILL_PROOF||'/tmp/breeze-pdf-side-pill';
const baseline=process.env.BREEZE_SIDE_PILL_BASELINE==='1';
mkdirSync(output,{recursive:true});

// "Before" proof is produced against the pre-fix placement without touching the
// working tree: when BREEZE_SIDE_PILL_BASELINE=1 the server serves the HEAD
// (pre-FEAT-002) copy of the two placement sources instead of the files on
// disk. The working tree keeps the fix at all times.
const baselineSources=baseline?{
  '/scripts/dictionary/dictionary.js':gitShow('scripts/dictionary/dictionary.js'),
  '/scripts/dictionary/sentence.js':gitShow('scripts/dictionary/sentence.js'),
}:{};
function gitShow(path){
  return execFileSync('git',['show',`HEAD:${path}`],{cwd:root,maxBuffer:8*1024*1024});
}

const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/$/,'/index.html');
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{
    res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');
    res.end(baselineSources[pathname]||readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}`;

const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;

// A tight matrix: iPhone + iPad, portrait + landscape, light + dark. Only the
// side docks (left/right) are asserted for anchoring/clip, since bottom/top are
// the already-correct baseline. Screenshots are captured for all four edges.
const viewports=[
  {name:'390x844',width:390,height:844},
  {name:'844x390',width:844,height:390},
  {name:'820x1180',width:820,height:1180},
  {name:'1180x820',width:1180,height:820},
];
const edges=['left','right','top','bottom'];
const sideEdges=new Set(['left','right']);

let checks=0,baselineBugHits=0;
try{
  for(const viewport of viewports){
    for(const dark of [false,true]){
      const tone=dark?'dark':'light';
      const profile=mkdtempSync(resolve(tmpdir(),'breeze-side-pill-'));
      const context=await engine.launchPersistentContext(profile,{
        headless:true,
        executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,
        viewport:{width:viewport.width,height:viewport.height},
        hasTouch:true,
        isMobile:true,
        deviceScaleFactor:1,
        serviceWorkers:'block'
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      try{
        // Native iPad impersonation unlocks the ink toolbar + dock move switch,
        // exactly as the dock gesture regression does.
        await page.addInitScript(()=>{
          window.breezeInkIPad=true;
          window.webkit={messageHandlers:{breezeInkScope:{postMessage:payload=>{window.qaInkScope=payload;}}}};
          localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
        });
        await page.goto(url);
        await page.locator('#fileinput').setInputFiles({name:'English-exam.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
        await page.waitForFunction(()=>books.some(book=>book.kind==='pdf'));
        await page.evaluate(async dark=>{
          darkMode=dark;applyDark();
          await openBook(books.find(book=>book.kind==='pdf'));
          await switchReaderMode('original');
        },dark);
        await page.waitForSelector('.pdf-source-page .pdf-ink-layer');
        await page.waitForFunction(()=>!readerPositionPending());
        await page.waitForTimeout(600);
        // Make sure page 1 word boxes exist so we can tap a known fixture word.
        await page.evaluate(async()=>{await renderOriginalPdfPage(originalSession,1);await prepareOriginalPdfPage(originalSession,1);});
        await page.waitForFunction(()=>originalSession.wordBoxes.get(1)?.length>0);

        // Enter writing mode and turn on the dock move switch so applyEdge()
        // honours a stored edge (writing() && moveEnabled()).
        await page.locator('[data-ink-toggle]').click();
        await page.waitForFunction(()=>document.querySelector('[data-ink-toggle]')?.getAttribute('aria-pressed')==='true'&&document.body.dataset.inkDock==='bottom');
        await page.locator('#aafab').click();
        await page.locator('#aa-ink-dock-move').click();
        await page.waitForFunction(()=>document.querySelector('#aa-ink-dock-move')?.getAttribute('aria-pressed')==='true');
        await page.evaluate(()=>closeAa());

        for(const edge of edges){
          // Deterministic dock: write the edge key and re-sync the dock. This is
          // the smallest reliable path and leaves body.dataset.inkDock set to the
          // target edge (verified below) before any assertion runs.
          await page.evaluate(target=>{
            localStorage.setItem('breeze.pdfInk.dock',target);
            syncInkDock();
          },edge);
          await page.waitForFunction(target=>document.body.dataset.inkDock===target,edge);

          // Tap a known fixture word and wait for the mini pill.
          const tap=await page.evaluate(()=>{
            const paper=originalSession.pages[0],rect=paper.getBoundingClientRect();
            const box=originalSession.wordBoxes.get(1).find(b=>b.word.toLowerCase()==='minimum');
            if(!box)throw Error('Missing fixture word');
            const key=keyOf(box.word);
            words[key]={word:key,clicked:box.word,forms:[key],ko:'최소',phon:'',defs:[{pos:'noun',sense:'최소'}],
              example:box.example||'',book:curBook.title,status:1,mark:true,addedAt:Date.now(),up:Date.now()};
            return {
              x:rect.left+(box.x+box.w/2)*rect.width,
              y:rect.top+(box.y+box.h/2)*rect.height,
              wordCenterX:rect.left+(box.x+box.w/2)*rect.width
            };
          });
          await page.touchscreen.tap(tap.x,tap.y);
          await page.waitForFunction(()=>!document.querySelector('#word-peek').hidden);

          const name=`${engine.name()}-${edge}-${viewport.name}-${tone}-${baseline?'before':'after'}`;
          await page.screenshot({path:resolve(output,`${name}.png`)});

          const geom=await page.evaluate(()=>{
            const vw=window.visualViewport?window.visualViewport.width:innerWidth;
            const vh=window.visualViewport?window.visualViewport.height:innerHeight;
            const peek=document.getElementById('word-peek').getBoundingClientRect();
            const chrome=document.getElementById('readchrome').getBoundingClientRect();
            return {
              vw,vh,
              peek:{left:peek.left,top:peek.top,right:peek.right,bottom:peek.bottom,width:peek.width,cx:peek.left+peek.width/2},
              chrome:{left:chrome.left,top:chrome.top,right:chrome.right,bottom:chrome.bottom,width:chrome.width,height:chrome.height}
            };
          });

          // The mini pill must be fully inside the visual viewport on every edge.
          // In baseline (pre-fix) mode the placement is left as the product
          // produced it and only recorded, so the "before" screenshots show the
          // bug; the assertions below run only against the fixed build.
          if(!baseline)assert.ok(geom.peek.left>=-1&&geom.peek.top>=-1&&geom.peek.right<=geom.vw+1&&geom.peek.bottom<=geom.vh+1,
            `${name}: mini pill inside viewport ${JSON.stringify(geom.peek)} vw=${geom.vw} vh=${geom.vh}`);

          // Record how the baseline differs from the fix so the bug is provable
          // from the run log, not only from the screenshots.
          if(baseline){
            const sideDrift=sideEdges.has(edge)&&(edge==='left'?geom.peek.left<geom.chrome.right-1:geom.peek.right>geom.chrome.left+1);
            const outside=geom.peek.left<-1||geom.peek.top<-1||geom.peek.right>geom.vw+1||geom.peek.bottom>geom.vh+1;
            if(sideDrift||outside)baselineBugHits++;
            console.log('BEFORE',name,'mini',JSON.stringify(geom.peek),'chrome',JSON.stringify(geom.chrome),sideDrift?'BUG:behind-bar':outside?'BUG:clipped':'');
          }

          if(!baseline){
            // The usable horizontal band excludes a side toolbar. The pill either
            // centers on the word (within a few px) or, when the word sits so
            // close to the docked edge that a centered pill would not fit, clamps
            // flush against the band. Either way it must never hide behind the bar.
            // The placement clamps the pill into the usable band: the viewport
            // inset (16px) on a free edge, or just past the toolbar on a docked
            // edge. Mirror that clamp (with a small gap allowance) to derive the
            // position the pill should land on for the tapped word.
            const inset=16,gap=8,half=geom.peek.width/2;
            const regionLeft=edge==='left'?geom.chrome.right+gap:inset;
            const regionRight=edge==='right'?geom.chrome.left-gap:geom.vw-inset;
            const idealCx=Math.max(regionLeft+half,Math.min(tap.wordCenterX,regionRight-half));
            assert.ok(Math.abs(geom.peek.cx-idealCx)<=8,
              `${name}: mini pill center ${geom.peek.cx.toFixed(1)} tracks the word within the usable band (ideal ${idealCx.toFixed(1)}, word ${tap.wordCenterX.toFixed(1)})`);
            if(sideEdges.has(edge)){
              if(edge==='left')assert.ok(geom.peek.left>=geom.chrome.right-1,`${name}: mini pill clears the left toolbar band (${geom.peek.left.toFixed(1)} >= ${geom.chrome.right.toFixed(1)})`);
              else assert.ok(geom.peek.right<=geom.chrome.left+1,`${name}: mini pill clears the right toolbar band (${geom.peek.right.toFixed(1)} <= ${geom.chrome.left.toFixed(1)})`);
              checks++;
            }
          }

          // Open the expanded word detail surface and assert it is unclipped.
          await page.evaluate(()=>expandWordDetail());
          await page.waitForFunction(()=>document.getElementById('panel').classList.contains('on'));
          await page.waitForTimeout(80);
          const panel=await page.evaluate(()=>{
            const vw=window.visualViewport?window.visualViewport.width:innerWidth;
            const vh=window.visualViewport?window.visualViewport.height:innerHeight;
            const r=document.getElementById('panel').getBoundingClientRect();
            const chrome=document.getElementById('readchrome').getBoundingClientRect();
            return {vw,vh,r:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
              chrome:{left:chrome.left,right:chrome.right,top:chrome.top,bottom:chrome.bottom,width:chrome.width,height:chrome.height}};
          });
          await page.screenshot({path:resolve(output,`${name}-expanded.png`)});

          if(baseline){
            const clipped=panel.r.left<-1||panel.r.top<-1||panel.r.right>panel.vw+1||panel.r.bottom>panel.vh+1;
            const behind=sideEdges.has(edge)&&(edge==='left'?panel.r.left<panel.chrome.right-1:panel.r.right>panel.chrome.left+1);
            if(clipped||behind)baselineBugHits++;
            console.log('BEFORE',name,'expanded',JSON.stringify(panel.r),clipped?'BUG:clipped':behind?'BUG:behind-bar':'');
          }
          if(!baseline)assert.ok(panel.r.left>=-1&&panel.r.top>=-1&&panel.r.right<=panel.vw+1&&panel.r.bottom<=panel.vh+1,
            `${name}: expanded panel inside viewport ${JSON.stringify(panel.r)} vw=${panel.vw} vh=${panel.vh}`);
          if(!baseline&&sideEdges.has(edge)){
            // Expanded surface must not overlap the side toolbar band.
            if(edge==='left')assert.ok(panel.r.left>=panel.chrome.right-1,`${name}: expanded panel clears the left toolbar band`);
            else assert.ok(panel.r.right<=panel.chrome.left+1,`${name}: expanded panel clears the right toolbar band`);
            checks++;
          }

          await page.evaluate(()=>closePanel());
          await page.waitForFunction(()=>document.querySelector('#word-peek').hidden);
        }
        assert.deepEqual(errors.filter(message=>!message.includes('ResizeObserver loop')),[],`${viewport.name}-${tone}: page errors`);
        console.log('PASS',`${engine.name()} ${viewport.name} ${tone} ${baseline?'before':'after'}`);
      }catch(error){
        const failure={viewport:viewport.name,tone,error:error.message,errors};
        console.error(JSON.stringify(failure));
        throw error;
      }finally{await context.close();rmSync(profile,{recursive:true,force:true});}
    }
  }
  if(!baseline)assert.ok(checks>0,'side-dock anchoring/clip assertions ran');
  // The "before" run has to actually reproduce the bug, otherwise the baseline
  // screenshots prove nothing. Fail if the pre-fix build placed everything well.
  if(baseline)assert.ok(baselineBugHits>0,'baseline (pre-fix) run must reproduce the side-dock offset/clip bug');
  console.log(`${engine.name()}: side-dock lookup pill placement ${baseline?`baseline captured (${baselineBugHits} bug reproductions)`:`passed (${checks} side-dock checks)`}`);
  if(engine===chromium)console.log('WebKit not executed in-sandbox (binary unavailable offline); CI runs it via BREEZE_QA_ENGINE=webkit.');
}finally{server.close();}
