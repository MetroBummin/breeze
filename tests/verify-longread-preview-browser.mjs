import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const storyId='sherlock-holmes-speckled-band';
let requests=0,mode='ok',held;
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  if(path.endsWith('/speckled-band.txt')){
    requests++;
    if(mode==='error'){res.writeHead(503).end();return;}
    if(mode==='truncated'){res.end(readFileSync(path,'utf8').slice(0,4000));return;}
    if(mode==='hold'){held=res;return;}
  }
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'})[extname(path)]||'text/plain; charset=utf-8');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
const expected=readFileSync(resolve(root,'assets/longreads/speckled-band.txt'),'utf8').trim().split('\n\n');
const proof='/tmp/breeze-holmes-proof';mkdirSync(proof,{recursive:true});
try{
  for(const engine of [chromium,webkit].filter(engine=>!process.env.BROWSER||engine.name()===process.env.BROWSER)){
    requests=0;mode='ok';held=null;
    const browser=await engine.launch();
    try{
      const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
      await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      const page=await context.newPage();
      await page.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('blob:')?route.continue():route.abort());
      await page.goto(base);await page.evaluate(()=>homeReady);
      const card=()=>page.locator(`#shelf .longread[data-longread-id="${storyId}"]`);
      const start=()=>page.locator('#article-preview .ap-start');
      for(const id of ['backroom-homeward-bound',storyId]){
        await page.locator(`#shelf .longread[data-longread-id="${id}"]`).click();
        assert.equal(await page.evaluate(()=>books.length),0);
        assert.equal(requests,0,'Preview downloaded story text');
        assert.ok((await page.locator('.ap-summary').textContent()).length>30);
        assert.match(await page.locator('.ap-details').textContent(),/words.*min/);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>articlePreviewDialog.open),false);
        assert.equal(await page.evaluate(()=>books.length),0);
      }
      // Geometry and readable text in all prescribed viewports/themes.
      for(const [width,height] of [[320,568],[390,844],[820,1024],[1440,900],[844,390]]){
        await page.setViewportSize({width,height});
        for(const dark of [false,true]){
          await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
          await card().click();
          const box=await start().boundingBox();
          assert.ok(box&&box.y>=0&&box.y+box.height<=height&&box.height>=44);
          assert.ok(await page.locator('.ap-title').isVisible());
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
          await page.screenshot({animations:'disabled',path:`${proof}/${engine.name()}-preview-${width}x${height}-${dark?'dark':'light'}.png`});
          await page.locator('.ap-close').click();
        }
      }
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>document.body.classList.remove('dark'));
      for(const failure of ['error','truncated']){
        mode=failure;await card().click();await start().click();
        await page.waitForFunction(()=>!articlePreviewOpening);
        assert.equal(await page.evaluate(()=>books.length),0,'Failed download created a book');
        assert.match(await page.locator('.ap-status').textContent(),/다시/);
        assert.equal(await start().isEnabled(),true);
        await page.locator('.ap-close').click();
      }
      mode='hold';await card().click();await start().click();
      await page.waitForTimeout(100);assert.ok(held);
      await page.locator('.ap-close').click();held.end(expected.join('\n\n')+'\n');held=null;
      await page.waitForFunction(()=>!longReadBusy);
      assert.equal(await page.evaluate(()=>books.length),0,'Cancelled fetch created a book');
      // A real persistence failure must leave the same preview retryable.
      mode='ok';await card().click();
      await page.evaluate(()=>{window.__bookPut=bookPut;bookPut=async()=>{throw new Error('fixture storage failure');};});
      await start().click();await page.waitForFunction(()=>!articlePreviewOpening);
      assert.equal(await page.evaluate(()=>books.length),0);
      assert.equal(await start().isEnabled(),true);
      await page.evaluate(()=>{bookPut=window.__bookPut;delete window.__bookPut;});
      await page.locator('.ap-close').click();
      mode='ok';await card().click();
      await page.evaluate(()=>{document.querySelector('.ap-start').click();document.querySelector('.ap-start').click();});
      await page.waitForFunction(()=>!articlePreviewDialog.open&&curBook?.longReadId==='sherlock-holmes-speckled-band');
      assert.deepEqual(await page.evaluate(()=>curBook.paras),expected);
      assert.equal(await page.evaluate(()=>books.length),1);
      assert.equal(await page.locator('#rtext [data-pi]').count(),251);
      assert.equal(await page.locator('#rtext .story-illustration').count(),0);
      await page.locator('#r-attribution summary').click();
      assert.match(await page.locator('#r-attribution').innerText(),/not Doyle’s verbatim text/);
      await page.evaluate(()=>{readerScrollTo((readerContentHeight()-readerViewHeight())*.5);updatePfill(true);});
      await page.waitForTimeout(950);
      const progress=await page.evaluate(()=>({id:curBook.id,p:positions[curBook.id].p}));assert.ok(progress.p>.1);
      await page.reload();await page.evaluate(()=>homeReady);
      await card().click();assert.equal(await start().textContent(),'이어서 읽기');
      const downloads=requests;
      await context.setOffline(true);await start().click();
      await page.waitForFunction(()=>!articlePreviewDialog.open);
      assert.equal(await page.evaluate(()=>books.length),1);
      assert.equal(await page.evaluate(()=>curBook.paras.length),251);
      assert.equal(requests,downloads,'Saved book was downloaded again');
      assert.ok(await page.evaluate(()=>positions[curBook.id].p>.1));
      await context.setOffline(false);await context.close();
      // A separate real service-worker context proves a cold offline relaunch,
      // not just opening already-rendered text after toggling offline.
      // Playwright supports service-worker control only in Chromium:
      // https://playwright.dev/docs/service-workers
      if(engine===chromium){
        const cachedContext=await browser.newContext({viewport:{width:390,height:844}});
        await cachedContext.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
        const cachedPage=await cachedContext.newPage();
        await cachedPage.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('blob:')?route.continue():route.abort());
        await cachedPage.goto(base);await cachedPage.evaluate(()=>homeReady);
        await cachedPage.evaluate(()=>navigator.serviceWorker.ready);
        await cachedPage.reload();await cachedPage.evaluate(()=>homeReady);
        await cachedPage.locator(`#shelf .longread[data-longread-id="${storyId}"]`).click();
        mode='truncated';
        await cachedPage.locator('.ap-start').click();
        await cachedPage.waitForFunction(()=>!articlePreviewOpening);
        assert.equal(await cachedPage.evaluate(()=>books.length),0);
        assert.equal(await cachedPage.evaluate(async()=>{
          const read=LONG_READS.find(item=>item.id==='sherlock-holmes-speckled-band');
          return !!await caches.match(new URL(read.file+'?v='+read.sha256.slice(0,8),location.href).href);
        }),false,'Worker cached an incomplete story');
        mode='ok';
        await cachedPage.locator('.ap-start').click();
        await cachedPage.waitForFunction(()=>!articlePreviewDialog.open&&curBook?.longReadId==='sherlock-holmes-speckled-band');
        assert.ok(await cachedPage.evaluate(async()=>{
          const read=LONG_READS.find(item=>item.id==='sherlock-holmes-speckled-band');
          return !!await caches.match(new URL(read.file+'?v='+read.sha256.slice(0,8),location.href).href);
        }));
        const hasCover=await cachedPage.evaluate(()=>!!curBook.cover);
        await cachedContext.setOffline(true);await cachedPage.reload();await cachedPage.evaluate(()=>homeReady);
        await cachedPage.locator(`#shelf .longread[data-longread-id="${storyId}"]`).click();
        if(hasCover){
          await cachedPage.waitForFunction(()=>document.querySelector('.ap-hero img').src.startsWith('blob:'));
          await cachedPage.locator('.ap-hero img').evaluate(image=>image.decode());
        }
        await cachedPage.locator('.ap-start').click();
        await cachedPage.waitForFunction(()=>!articlePreviewDialog.open&&curBook?.paras.length===251);
        await cachedContext.close();
      }else console.log('webkit: cold service-worker offline reload requires device verification (unsupported Playwright control)');
      console.log(engine.name()+': both previews, 10 viewport/theme states, failure/retry/truncation/cancel, duplicate taps, full import and offline progress passed');
    }finally{await browser.close();}
  }
}finally{held?.end();await new Promise(done=>server.close(done));}
