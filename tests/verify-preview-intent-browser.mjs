/* Real app/DOM/IndexedDB. Network and save-failure injection are controlled;
   no production Supabase or paid model requests are made. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
  try{
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
    if(!path.startsWith(root))throw Error();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');
    res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
const meta={promptVersion:5,summaryKo:'기사의 내용을 바탕으로 배경과 핵심 질문을 소개합니다. 원문을 읽으며 어떤 이야기가 이어지는지 확인해 보세요.'};
let passed=0;
try{
  for(const engine of process.env.BREEZE_TEST_BROWSER==='chromium'?[chromium]:[chromium,webkit]){
    const browser=await engine.launch(engine===chromium&&process.env.BREEZE_CHROMIUM_PATH?{executablePath:process.env.BREEZE_CHROMIUM_PATH,args:['--no-sandbox']} : {});
    const page=await browser.newPage({viewport:{width:820,height:1024},serviceWorkers:'block'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let requests=0,mode='ok',held=[];
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base))return route.continue();
      if(url.startsWith('https://preview.fixture/'))return route.fulfill({contentType:'image/png',body:readFileSync(resolve(root,'assets/favicon/icon-512.png'))});
      if(url.includes('/functions/v1/article-preview')){
        requests++;
        if(mode==='hold'){held.push(route);return;}
        return route.fulfill({status:mode==='missing'?404:200,contentType:'application/json',body:JSON.stringify(mode==='missing'?{error:'NOT_FOUND'}:meta)});
      }
      return route.abort();
    });
    await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await page.evaluate(()=>homeReady);
    await page.evaluate(()=>{
      // Do not let optional discovery/network data alter fixtures.
      books=[];positions={};window.__images=0;
      fetchArticleImage=async()=>{window.__images++;return null;};
      window.__fixture=(name)=>{
        const url='https://example.test/'+name;
        const blocks=[{r:'p',t:name+' contains enough original English text to decide whether this article is worth reading. This paragraph belongs only to this specific source and is not a saved reading record.'}];
        const parsed={title:name,site:'Example',url,cover:'https://example.test/photo.jpg',blocks,...articleAssemble(name,blocks)};
        rssPreparedArticles.set(articleUrlKey(url),parsed);
        return {title:name,source:'Example',url,photo:''};
      };
      // Model an already prepared card; cover transport is covered by RSS browser tests.
      window.__card=entry=>{const card=rssCard(entry);card.classList.remove('rss-pending');card.removeAttribute('aria-busy');card.removeAttribute('aria-disabled');card.tabIndex=0;card.hidden=false;document.getElementById('casual-rail').prepend(card);return card;};
      renderHome();show('home');
    });
    const count=()=>page.evaluate(async()=>({memory:books.length,stored:(await bookAll()).length,positions:Object.keys(positions).length,images:window.__images}));
    async function check(name,fn){await fn();passed++;console.log('PASS',engine.name(),name);}
    const waitPrepared=()=>page.waitForFunction(()=>articlePreviewBook&&!articlePreviewDialog.dataset.preparing?.includes('true'));
    await check('dismiss during preparation: no book, image writes or progress',async()=>{
      await page.evaluate(()=>{
        const entry=window.__fixture('cancel-before-ready');
        const parsed=rssPreparedArticles.get(articleUrlKey(entry.url));rssPreparedArticles.delete(articleUrlKey(entry.url));
        const original=fetchArticleHtml;window.__release=null;
        fetchArticleHtml=()=>new Promise(resolve=>window.__release=()=>{fetchArticleHtml=original;resolve('<article></article>');});
        const parser=parseArticleHtml;parseArticleHtml=()=>{parseArticleHtml=parser;return parsed;};
        window.__pending=importRssEntry(entry,window.__card(entry));
        articlePreviewClose();
      });
      await page.waitForFunction(()=>window.__release);
      await page.evaluate(async()=>{window.__release();await window.__pending;});
      assert.deepEqual(await count(),{memory:0,stored:0,positions:0,images:0});
      assert(!await page.locator('#article-preview').evaluate(n=>n.open));
    });
    await page.evaluate(()=>{
      window.__bodyFetch=fetchArticleHtml;window.__bodyParse=parseArticleHtml;
      window.__heldBodies=new Map();window.__parsedBodies=new Map();
      fetchArticleHtml=url=>new Promise((resolve,reject)=>window.__heldBodies.set(url,{resolve,reject}));
      parseArticleHtml=(_html,url)=>window.__parsedBodies.get(url);
      window.__selectHeld=name=>{
        const entry=window.__fixture(name);entry.photo='https://preview.fixture/'+name+'.png';
        window.__parsedBodies.set(entry.url,rssPreparedArticles.get(articleUrlKey(entry.url)));rssPreparedArticles.delete(articleUrlKey(entry.url));
        return importRssEntry(entry,window.__card(entry));
      };
    });
    await check('known title/source/photo render during a held body; only missing intro shimmers',async()=>{
      const before=requests;
      const synchronous=await page.evaluate(()=>{
        window.__pending=window.__selectHeld('known-before-body');
        return {open:articlePreviewDialog.open,title:articlePreviewDialog.querySelector('.ap-title').textContent,
          source:articlePreviewDialog.querySelector('.ap-source').textContent,preparing:articlePreviewDialog.dataset.preparing,
          disabled:articlePreviewDialog.querySelector('.ap-start').disabled};
      });
      assert.deepEqual(synchronous,{open:true,title:'known-before-body',source:'Example',preparing:'true',disabled:true});
      await page.waitForFunction(()=>document.querySelector('.ap-hero img').naturalWidth>0);
      assert(await page.isVisible('.ap-title'));assert(await page.isVisible('.ap-source'));assert(await page.isVisible('.ap-hero img'));
      assert.equal(await page.locator('.ap-summary').evaluate(n=>getComputedStyle(n).animationName),'ap-shimmer');
      assert.equal(await page.locator('.ap-title').evaluate(n=>getComputedStyle(n).animationName),'none');assert.equal(requests,before);
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await page.locator('.ap-summary').evaluate(n=>getComputedStyle(n).animationName),'none');
      await page.emulateMedia({reducedMotion:'no-preference'});
      if(process.env.BREEZE_PREVIEW_CAPTURE_DIR){
        mkdirSync(process.env.BREEZE_PREVIEW_CAPTURE_DIR,{recursive:true});
        for(const [label,width,height] of [['phone',390,844],['small-phone',320,568],['tablet',834,1112],['desktop',1440,900],['short',1024,600]])for(const dark of [false,true]){
          await page.setViewportSize({width,height});await page.evaluate(dark=>{document.body.classList.toggle('dark',dark);document.documentElement.classList.toggle('dark',dark);},dark);
          assert(await page.isVisible('.ap-title'));assert(await page.isVisible('.ap-hero img'));
          await page.screenshot({path:process.env.BREEZE_PREVIEW_CAPTURE_DIR+'/'+engine.name()+'-body-pending-'+label+'-'+(dark?'dark':'light')+'.png'});
        }
        await page.setViewportSize({width:820,height:1024});await page.evaluate(()=>{document.body.classList.remove('dark');document.documentElement.classList.remove('dark');});
      }
      await page.evaluate(()=>{articlePreviewClose();window.__heldBodies.get('https://example.test/known-before-body').resolve('<article/>');});
      await page.evaluate(()=>window.__pending);assert.deepEqual(await count(),{memory:0,stored:0,positions:0,images:0});
    });
    await check('body failure retains metadata; manual retry uses the same open sheet',async()=>{
      await page.evaluate(()=>{window.__pending=window.__selectHeld('body-error');});
      await page.waitForFunction(()=>window.__heldBodies.has('https://example.test/body-error'));
      await page.evaluate(()=>window.__heldBodies.get('https://example.test/body-error').reject(Error('controlled body failure')));
      await page.evaluate(()=>window.__pending);
      assert.equal(await page.textContent('.ap-title'),'body-error');assert.match(await page.textContent('.ap-start'),/다시 시도/);
      assert.equal(await page.locator('.ap-summary').evaluate(n=>getComputedStyle(n).animationName),'none');
      assert.equal(await page.locator('#article-preview').getAttribute('data-metadata-reason'),'preparing_failed');
      await page.evaluate(()=>{window.__retryCloses=0;articlePreviewDialog.addEventListener('close',()=>window.__retryCloses++);});
      await page.click('.ap-start');await page.waitForFunction(()=>articlePreviewDialog.dataset.preparing==='true');
      assert.equal(await page.evaluate(()=>window.__retryCloses),0);assert.equal(await page.textContent('.ap-title'),'body-error');
      assert(await page.isDisabled('.ap-start'));assert(await page.isVisible('.ap-hero img'));
      await page.evaluate(()=>{articlePreviewClose();window.__heldBodies.get('https://example.test/body-error').resolve('<article/>');});
      await page.waitForFunction(()=>!document.querySelector('.rss-card.busy'));assert.deepEqual(await count(),{memory:0,stored:0,positions:0,images:0});
    });
    await check('late old body/error cannot replace another article shell or reopen after dismissal',async()=>{
      await page.evaluate(()=>{window.__pendingA=window.__selectHeld('late-old');});
      await page.waitForFunction(()=>window.__heldBodies.has('https://example.test/late-old'));
      await page.evaluate(()=>{window.__pendingB=window.__selectHeld('latest-shell');});
      await page.waitForFunction(()=>window.__heldBodies.has('https://example.test/latest-shell'));
      await page.waitForFunction(()=>document.querySelector('.ap-hero img').naturalWidth>0);
      assert.equal(await page.textContent('.ap-title'),'latest-shell');assert.match(await page.locator('.ap-hero img').getAttribute('src'),/latest-shell/);
      await page.evaluate(()=>window.__heldBodies.get('https://example.test/late-old').reject(Error('late old failure')));await page.evaluate(()=>window.__pendingA);
      assert.equal(await page.textContent('.ap-title'),'latest-shell');assert.equal(await page.locator('#article-preview').getAttribute('data-metadata'),'loading');
      await page.evaluate(async()=>{
        // dialog.close() queues its event. Finish this fixture's close before
        // the next fixture starts counting modal reopen/close events.
        const closed=new Promise(resolve=>articlePreviewDialog.addEventListener('close',resolve,{once:true}));
        articlePreviewClose();window.__heldBodies.get('https://example.test/latest-shell').resolve('<article/>');
        await closed;
      });await page.evaluate(()=>window.__pendingB);
      assert(!await page.locator('#article-preview').evaluate(n=>n.open));assert.deepEqual(await count(),{memory:0,stored:0,positions:0,images:0});
    });
    await page.evaluate(()=>{fetchArticleHtml=window.__bodyFetch;parseArticleHtml=window.__bodyParse;});
    await check('prepared Preview stays open without modal reopen or persistence',async()=>{
      await page.evaluate(()=>{
        window.__modalCloses=0;articlePreviewDialog.addEventListener('close',()=>window.__modalCloses++);
        const entry=window.__fixture('Read only after CTA');window.__pending=importRssEntry(entry,window.__card(entry));
      });
      await page.evaluate(()=>window.__pending);await waitPrepared();
      await page.waitForFunction(()=>articlePreviewDialog.dataset.metadata==='ready');
      assert.equal(await page.evaluate(()=>window.__modalCloses),0);
      assert.deepEqual(await count(),{memory:0,stored:0,positions:0,images:0});
      await page.keyboard.press('Escape');assert.equal((await count()).stored,0);
    });
    await check('browser Back cancels pending article save and preserves navigation',async()=>{
      await page.evaluate(async()=>{
        show('casuals');
        const e=window.__fixture('Back during image preparation');await importRssEntry(e,window.__card(e));
        const original=fetchArticleImage;window.__releaseImage=null;
        fetchArticleImage=()=>new Promise(resolve=>window.__releaseImage=()=>{fetchArticleImage=original;resolve(new Blob(['fixture'],{type:'image/png'}));});
        window.__imageWrites=0;window.__imgPut=imgPut;
        imgPut=async(...args)=>{window.__imageWrites++;return window.__imgPut(...args);};
      });
      await waitPrepared();await page.click('.ap-start');await page.waitForFunction(()=>window.__releaseImage);
      await page.goBack();await page.waitForFunction(()=>activeAppView()==='home');
      assert(!await page.locator('#article-preview').evaluate(n=>n.open));
      await page.evaluate(()=>window.__releaseImage());
      await page.waitForFunction(()=>articleCommitJobs.size===0);
      assert.deepEqual(await count(),{memory:0,stored:0,positions:0,images:0});
      assert.equal(await page.evaluate(()=>window.__imageWrites),0);
      assert.equal(await page.evaluate(()=>activeAppView()),'home');
      await page.evaluate(()=>{imgPut=window.__imgPut;});
    });
    await check('first CTA persists once, marks reading and bypasses future Preview',async()=>{
      await page.evaluate(async()=>{show('casuals');const e=window.__fixture('Read only after CTA');await importRssEntry(e,window.__card(e));});
      await waitPrepared();
      await page.evaluate(()=>{document.querySelector('.ap-start').click();document.querySelector('.ap-start').click();});
      await page.waitForFunction(()=>document.querySelector('#v-read').classList.contains('on'));
      assert.equal((await count()).stored,1);assert.equal((await count()).memory,1);
      assert.equal((await count()).positions,1);
      await page.goBack();await page.waitForFunction(()=>activeAppView()==='casuals');
      assert(!await page.locator('#article-preview').evaluate(n=>n.open));
      await page.evaluate(()=>{renderHome();show('home');openCasualPreviewOrReader(books[0]);});
      assert(!await page.locator('#article-preview').evaluate(n=>n.open));
      await page.evaluate(()=>show('home'));
    });
    await check('existing saved unread article is preserved when Preview closes',async()=>{
      await page.evaluate(async()=>{
        const entry=window.__fixture('Manually saved');await ingestArticle(entry.url,{preparedArticle:rssPreparedArticles.get(articleUrlKey(entry.url)),present:false});
        const b=books.find(b=>b.title==='Manually saved');openCasualPreviewOrReader(b);articlePreviewClose();
      });
      assert.equal((await count()).stored,2);
    });
    await check('failed save leaves draft retryable, no Reader, then exactly one commit',async()=>{
      await page.evaluate(async()=>{
        const e=window.__fixture('retry-save');await importRssEntry(e,window.__card(e));
        const save=bookPut;bookPut=async()=>{bookPut=save;throw Error('injected IDB failure');};
      });
      await waitPrepared();await page.click('.ap-start');
      await page.waitForFunction(()=>!document.querySelector('.ap-start').disabled);
      assert.equal((await count()).stored,2);assert(await page.locator('#article-preview').evaluate(n=>n.open));
      assert.match(await page.textContent('.ap-status'),/저장|다시/);
      await page.click('.ap-start');await page.waitForFunction(()=>!articlePreviewDialog.open);
      assert.equal((await count()).stored,3);
      await page.evaluate(()=>show('home'));
    });
    await check('short feed post follows the same deferred-save boundary',async()=>{
      const before=await count();
      await page.evaluate(async()=>{
        const e={title:'A short public post',url:'https://example.test/post',kind:'x',source:'Feed',contentHtml:'<p>This short public post is readable without a five-hundred-character minimum.</p>'};
        await importRssEntry(e,window.__card(e));articlePreviewClose();
      });
      assert.deepEqual(await count(),before);
    });
    await check('20 rapid Preview selections: only latest paints, none saves',async()=>{
      const before=await count();
      await page.evaluate(async()=>{await Promise.all(Array.from({length:20},(_,i)=>{const e=window.__fixture('burst-'+i);return importRssEntry(e,window.__card(e));}));});
      assert.equal(await page.textContent('.ap-title'),'burst-19');
      await page.evaluate(()=>articlePreviewClose());assert.deepEqual(await count(),before);
    });
    await check('missing function is an explicit failure, never a fake indefinite loader',async()=>{
      mode='missing';const before=requests;
      await page.evaluate(async()=>{const e=window.__fixture('missing-function');await importRssEntry(e,window.__card(e));});
      await page.waitForFunction(()=>articlePreviewDialog.dataset.metadataReason==='unavailable');
      assert.match(await page.textContent('.ap-metadata-label'),/아직 사용할 수 없/);
      assert(await page.isVisible('.ap-retry'));assert(await page.isEnabled('.ap-start'));
      await page.waitForTimeout(60);assert.equal(requests,before+1,'no automatic paid retry');
      mode='ok';await page.click('.ap-retry');await page.waitForFunction(()=>articlePreviewDialog.dataset.metadata==='ready');
      assert.equal(requests,before+2);assert.match(await page.textContent('.ap-summary'),/[가-힣]/);
      assert.equal(await page.locator('.ap-excerpt').count(),0);
      await page.evaluate(()=>articlePreviewClose());
    });
    await check('visible Korean loading state and image/excerpt remain while AI waits',async()=>{
      mode='hold';
      await page.evaluate(async()=>{const e=window.__fixture('waiting-for-korean');await importRssEntry(e,window.__card(e));});
      await page.waitForFunction(()=>articlePreviewJobs.size>0);
      assert.match(await page.textContent('.ap-metadata-label'),/한국어 소개를 준비하고 있어요/);
      assert(await page.isVisible('.ap-metadata-spinner'));assert(await page.isEnabled('.ap-start'));
      assert(await page.locator('.ap-summary').count());
      if(process.env.BREEZE_PREVIEW_CAPTURE_DIR){mkdirSync(process.env.BREEZE_PREVIEW_CAPTURE_DIR,{recursive:true});await page.screenshot({path:process.env.BREEZE_PREVIEW_CAPTURE_DIR+'/'+engine.name()+'-loading.png'});}
      const pending=held.splice(0);for(const route of pending)await route.fulfill({contentType:'application/json',body:JSON.stringify(meta)});
      await page.waitForFunction(()=>articlePreviewDialog.dataset.metadata==='ready');mode='ok';
      if(process.env.BREEZE_PREVIEW_CAPTURE_DIR)await page.screenshot({path:process.env.BREEZE_PREVIEW_CAPTURE_DIR+'/'+engine.name()+'-ready.png'});
      await page.evaluate(()=>articlePreviewClose());
    });
    await check('Home has no management action; shelf retains keyboard management',async()=>{
      await page.evaluate(()=>{show('home');renderHome();});
      assert.equal(await page.locator('.home-card-menu').count(),0);
      assert.equal(await page.locator('#v-home .home-card-actions,#v-home .library-folder-controls').count(),0);
      await page.evaluate(()=>show('casuals'));
      const action=page.locator('#casual-grid .home-card-actions').first();
      const box=await action.boundingBox();assert(box.width<=1&&box.height<=1);
      const card=page.locator('#casual-grid [data-local-book]').first();
      await card.focus();await page.keyboard.press('Shift+F10');
      assert(await page.locator('#edit-modal').isVisible());
    });
    assert.deepEqual(errors,[]);await page.close();await browser.close();
  }
}finally{server.close();}
console.log(`${passed} Preview intent checks passed; real app/IDB, controlled HTTP. No production AI calls.`);
