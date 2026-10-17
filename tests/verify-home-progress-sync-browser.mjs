import assert from 'node:assert/strict';
import {mkdirSync, readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_HOME_PROGRESS_PROOF||'/tmp/breeze-home-progress';
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg'};
const hash='ab'.repeat(32);
const userId='11111111-1111-1111-1111-111111111111';
const NOW=Date.parse('2026-10-17T12:00:00Z');
mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const engines=process.env.BROWSER==='webkit'?[['webkit',webkit]]:process.env.BROWSER==='chromium'?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]];
const widths=[['phone',390,844],['ipad',820,1180]];

async function seed(page){
  await page.evaluate(async({hash,userId})=>{
    window.visibilityEvents=0;
    document.addEventListener('visibilitychange',()=>{window.visibilityEvents++;});
    window.positionReads=0;
    window.catalogReads=0;
    window.remotePlace={p:1,t:5000,mode:'text',y:20};
    window.readerMoves=0;
    const book={id:'home-progress',title:'The Sitting Book',author:'Ada',kind:'epub',paras:['One paragraph stays on this device.'],addedAt:1,
      sourceHash:hash,original:{hash,kind:'epub'},bookCloudLink:{on:true,tombstone:''}};
    books=[book];
    await bookPut(book);
    positions={[book.id]:{p:0.76,t:1000,mode:'text',y:4}};
    save(LS_POS,positions);
    rememberLocalReading(book);
    sbUser={id:userId};
    sb={from(table){return {select:async()=>{
      if(table==='positions')window.positionReads++;
      if(table==='book_cloud')window.catalogReads++;
      return table==='positions'?{data:[{book_id:hash,data:{v:1,revision:'rev-home',locator:window.remotePlace}}]}:{data:[]};
    }};}};
    readerScrollTo=()=>{window.readerMoves++;};
    restoreAnchor=()=>{window.readerMoves++;return true;};
    switchReaderMode=()=>{window.readerMoves++;};
    renderHome();
  },{hash,userId});
}

try{
  for(const [engineName,engine] of engines){
    const browser=await engine.launch();
    try{
      for(const [name,width,height] of widths){
        const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:name==='phone',serviceWorkers:'block'});
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>{
          const request=route.request();
          if(!request.url().startsWith(url)&&!request.url().startsWith('blob:')){route.abort();return;}
          if(new URL(request.url()).pathname==='/config.js'){
            const body=readFileSync(resolve(root,'config.js'),'utf8').replace(/SB_URL:\s*'[^']*'/, "SB_URL: ''").replace(/SB_KEY:\s*'[^']*'/, "SB_KEY: ''");
            route.fulfill({contentType:'text/javascript',body});
            return;
          }
          route.continue();
        });
        await page.addInitScript(()=>{
          localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
        });
        await page.clock.install({time:NOW});
        // A paused clock stays on the jumps below. Real time would move the quiet-period deadline.
        await page.clock.pauseAt(NOW);
        await page.goto(url,{waitUntil:'domcontentloaded'});
        await page.evaluate(()=>homeReady);
        await page.clock.fastForward(50);
        await page.waitForFunction(()=>libraryRefreshLaunch===1);
        const railAtArm=await page.evaluate(()=>rssPage);
        await seed(page);
        assert.equal(await page.locator('#v-home.on').count(),1,`${engineName} ${name} left Home`);
        assert.equal(await page.locator('#home-resume-percent').textContent(),'76%',`${engineName} ${name} did not paint the local percent`);
        assert.equal(await page.locator('#shelf .prog').textContent(),'76% 읽음',`${engineName} ${name} shelf did not paint the local percent`);
        await page.screenshot({path:`${proof}/${engineName}-${name}-before.png`});
        const remaining=await page.evaluate(()=>45000-(Date.now()-homePositionAt));
        assert.ok(remaining>1&&remaining<=45000,`${engineName} ${name} quiet period was ${remaining}`);
        await page.clock.fastForward(remaining-1);
        assert.equal(await page.locator('#home-resume-percent').textContent(),'76%',`${engineName} ${name} updated inside the quiet period`);
        assert.equal(await page.evaluate(()=>window.positionReads),0,`${engineName} ${name} read positions early`);
        await page.clock.fastForward(1);
        await page.waitForFunction(()=>document.getElementById('home-resume-percent').textContent==='100%');
        assert.equal(await page.locator('#shelf .prog').textContent(),'100% 읽음',`${engineName} ${name} shelf stayed stale`);
        assert.equal(await page.evaluate(()=>window.positionReads),1,`${engineName} ${name} did not read positions once`);
        assert.equal(await page.evaluate(()=>window.catalogReads),0,`${engineName} ${name} listed the book catalog`);
        assert.equal(await page.evaluate(()=>window.visibilityEvents),0,`${engineName} ${name} needed a visibility change`);
        assert.equal(await page.evaluate(()=>rssPage),railAtArm,`${engineName} ${name} advanced the recommendation rail`);
        assert.equal(await page.evaluate(()=>libraryRefreshRuns),0,`${engineName} ${name} reloaded the shelf`);
        assert.equal(await page.evaluate(()=>activeAppView()),'home',`${engineName} ${name} left Home`);
        assert.equal(await page.evaluate(()=>curBook),null,`${engineName} ${name} opened the book`);
        assert.equal(await page.evaluate(()=>positions['home-progress'].p),1);
        await page.screenshot({path:`${proof}/${engineName}-${name}-after.png`});
        const nextRemaining=await page.evaluate(()=>45000-(Date.now()-homePositionAt));
        await page.clock.fastForward(Math.max(0,nextRemaining-1));
        assert.equal(await page.evaluate(()=>window.positionReads),1,`${engineName} ${name} read again inside the next quiet period`);
        await page.evaluate(()=>{
          curBook=books[0];
          savedPlaceReleased=()=>true;
          window.remotePlace={p:0.4,t:9000,mode:'text',y:80};
        });
        await page.clock.fastForward(1);
        await page.waitForFunction(()=>window.positionReads===2);
        assert.equal(await page.evaluate(()=>positions['home-progress'].p),1,`${engineName} ${name} moved an open book`);
        assert.equal(await page.evaluate(()=>window.readerMoves),0,`${engineName} ${name} scrolled an open book`);
        assert.equal(await page.locator('#home-resume-percent').textContent(),'100%');
        assert.equal(await page.evaluate(()=>activeAppView()),'home');
        assert.deepEqual(errors,[],`${engineName} ${name} page errors`);
        console.log(`${engineName} ${name}: Home percent updated at 45s without opening the book.`);
        await page.close();
      }
    }finally{await browser.close();}
  }
}finally{await new Promise(done=>server.close(done));}
