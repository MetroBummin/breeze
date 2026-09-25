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
const meta={summaryKo:'기사의 내용을 바탕으로 배경과 핵심 질문을 소개합니다. 원문을 읽으며 어떤 이야기가 이어지는지 확인해 보세요.'};
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
      window.__card=entry=>{const card=rssCard(entry);card.hidden=false;document.getElementById('casual-rail').prepend(card);return card;};
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
    await check('first CTA persists once, marks reading and bypasses future Preview',async()=>{
      await page.evaluate(async()=>{const e=window.__fixture('Read only after CTA');await importRssEntry(e,window.__card(e));});
      await waitPrepared();
      await page.evaluate(()=>{document.querySelector('.ap-start').click();document.querySelector('.ap-start').click();});
      await page.waitForFunction(()=>document.querySelector('#v-read').classList.contains('on'));
      assert.equal((await count()).stored,1);assert.equal((await count()).memory,1);
      assert.equal((await count()).positions,1);
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
      assert.match(await page.textContent('.ap-metadata-label'),/한국어 요약을 준비하고 있어요/);
      assert(await page.isVisible('.ap-metadata-spinner'));assert(await page.isEnabled('.ap-start'));
      assert(await page.locator('.ap-summary').count());
      if(process.env.BREEZE_PREVIEW_CAPTURE_DIR){mkdirSync(process.env.BREEZE_PREVIEW_CAPTURE_DIR,{recursive:true});await page.screenshot({path:process.env.BREEZE_PREVIEW_CAPTURE_DIR+'/'+engine.name()+'-loading.png'});}
      const pending=held.splice(0);for(const route of pending)await route.fulfill({contentType:'application/json',body:JSON.stringify(meta)});
      await page.waitForFunction(()=>articlePreviewDialog.dataset.metadata==='ready');mode='ok';
      if(process.env.BREEZE_PREVIEW_CAPTURE_DIR)await page.screenshot({path:process.env.BREEZE_PREVIEW_CAPTURE_DIR+'/'+engine.name()+'-ready.png'});
      await page.evaluate(()=>articlePreviewClose());
    });
    await check('no visible ellipsis overlay; keyboard management is retained',async()=>{
      await page.evaluate(()=>{show('home');renderHome();});
      assert.equal(await page.locator('.home-card-menu').count(),0);
      const action=page.locator('#home-casual-rail .home-card-actions').first();
      const box=await action.boundingBox();assert(box.width<=1&&box.height<=1);
      const card=page.locator('#home-casual-rail [data-local-book]').first();
      await card.focus();await page.keyboard.press('Shift+F10');
      assert(await page.locator('#edit-modal').isVisible());
    });
    assert.deepEqual(errors,[]);await page.close();await browser.close();
  }
}finally{server.close();}
console.log(`${passed} Preview intent checks passed; real app/IDB, controlled HTTP. No production AI calls.`);
