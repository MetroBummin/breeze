// Home rows: 이어 읽기 · 추천 (고전 / 웹소설 / 기사) · 내 책.
// Deterministic: every request outside the local server is aborted.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  try{
    const requested=new URL(req.url,'http://localhost').pathname;
    const path=resolve(root,'.'+requested.replace(/^\/$/,'/index.html'));
    if(!path.startsWith(root))throw Error();
    res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');
    res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;

async function openPreview(page,id){
  await page.locator(`#casual-rail .webnovel[data-webnovel-id="${id}"]`).click();
  await page.waitForFunction(()=>document.querySelector('#article-preview').open);
  return page.locator('#article-preview').evaluate(dialog=>({
    kind:dialog.dataset.kind,
    source:dialog.querySelector('.ap-source').textContent,
    rows:[...dialog.querySelectorAll('.ap-chapter-row')].map(row=>[row.querySelector('.ap-chapter-title').textContent,row.querySelector('.ap-chapter-state').textContent]),
    links:[...dialog.querySelectorAll('.ap-links a')].map(link=>link.textContent),
    text:dialog.textContent,
  }));
}

try{
  for(const engine of [chromium,webkit].filter(engine=>!process.env.BROWSER||engine.name()===process.env.BROWSER)){
    const browser=await engine.launch(engine===chromium&&process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
      await page.goto(base);await page.evaluate(()=>homeReady);

      assert.deepEqual(await page.locator('#v-home > section').evaluateAll(nodes=>nodes.map(node=>[node.id,!node.hidden])),
        [['continue',false],['casuals',true],['longform',true]],'A new reader has no 이어 읽기 row');
      assert.equal(await page.locator('#home-recommend-title').textContent(),'추천');
      assert.deepEqual(await page.locator('#home-recommend-kind button').evaluateAll(nodes=>nodes.map(node=>[node.textContent,node.getAttribute('aria-pressed')])),
        [['고전','true'],['웹소설','false'],['기사','false']]);
      assert.ok(await page.locator('#casual-rail [data-longread-id]').count()>0,'고전 is the default tab');

      await page.locator('#home-recommend-kind [data-kind="webnovels"]').click();
      assert.equal(await page.evaluate(()=>load('breeze.home-recommend')),'webnovels');
      await page.waitForFunction(()=>[...document.querySelectorAll('#casual-rail .webnovel img.cover')].filter(image=>image.naturalWidth===768).length===3);
      assert.equal(await page.locator('#casual-rail [data-longread-id],#casual-rail .rss-card').count(),0);
      // Web-novel cards share the classic card frame.
      const frames=await page.evaluate(()=>{
        const size=node=>{const rect=node.getBoundingClientRect();return [Math.round(rect.width),Math.round(rect.height)];};
        return size(document.querySelector('#casual-rail .webnovel .cover'));
      });
      await page.locator('#home-recommend-kind [data-kind="classics"]').click();
      const classicFrame=await page.locator('#casual-rail [data-longread-id] .cover').first().evaluate(node=>{const rect=node.getBoundingClientRect();return [Math.round(rect.width),Math.round(rect.height)];});
      assert.deepEqual(frames,classicFrame,'Web-novel covers use the classic cover frame');
      await page.locator('#home-recommend-kind [data-kind="webnovels"]').click();

      const goff=await openPreview(page,'arkendrithyst');
      assert.equal(goff.kind,'webnovel');
      assert.equal(goff.source,'R. K. Goff');
      assert.equal(goff.rows.length,10,'R. K. Goff: first 10 chapters only');
      assert.deepEqual(goff.rows[0],['1화','곧 공개']);
      assert.ok(goff.rows.every(([,state])=>state==='곧 공개'));
      assert.deepEqual(goff.links,['Royal Road 원문']);
      await page.locator('#article-preview .ap-chapter-row').first().evaluate(row=>row.click());
      assert.equal(await page.locator('#article-preview .ap-status').textContent(),'곧 공개될 회차예요.');
      assert.equal(await page.evaluate(()=>!!document.querySelector('#article-preview').open&&!document.getElementById('v-read').classList.contains('on')),true,'A 곧 공개 chapter does not navigate');
      await page.locator('#article-preview .ap-close').click();
      const bun=await openPreview(page,'cinnamon-bun');
      assert.deepEqual(bun.links,['Royal Road 원문'],'Cinnamon Bun has no monetized link');
      await page.locator('#article-preview .ap-close').click();
      const sun=await openPreview(page,'chasing-sunlight');
      assert.deepEqual(sun.links,['Royal Road 원문','Kindle 판']);
      assert.doesNotMatch(sun.text,/vampire|뱀파이어|흡혈/i);
      await page.locator('#article-preview .ap-close').click();

      await page.locator('#home-recommend-kind [data-kind="articles"]').click();
      assert.equal(await page.evaluate(()=>load('breeze.home-recommend')),'articles');
      assert.equal(await page.locator('#casual-rail .webnovel,#casual-rail [data-longread-id]').count(),0);
      assert.ok(await page.locator('#casual-rail :is(.rss-card,.rss-loading)').count()+await page.locator('#home-feed-empty:not([hidden])').count()>0,
        '기사 asks the RSS recommendations');
      // Arrow keys move along 고전 / 웹소설 / 기사.
      await page.locator('#home-recommend-kind [data-kind="articles"]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(()=>homeRecommendKind()),'classics');

      // 이어 읽기 shows opened, unfinished books, the most recent first.
      await page.evaluate(async()=>{
        const make=(id,title,kind)=>({id,title,kind,author:'Writer',site:'Example',paras:[title,'Body text for '+title+'.'],addedAt:1});
        const list=[make('older','Older book','txt'),make('newer','Newer article','paste'),make('finished','Finished book','txt'),make('fresh','Never opened','txt')];
        for(const book of list)await bookPut(book);
        books=list;
        positions={older:{p:.3,t:1},newer:{p:.2,t:2},finished:{p:1,t:3}};
        rememberLocalReading(list[2]);rememberLocalReading(list[0]);rememberLocalReading(list[1]);
        renderHome();
      });
      assert.equal(await page.locator('#continue').isVisible(),true);
      assert.deepEqual(await page.locator('#continue-rail [data-home-key]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeKey)),
        ['book:newer','book:older']);
      const top=await page.evaluate(()=>[...document.querySelectorAll('#v-home > section:not([hidden])')].map(node=>node.getBoundingClientRect().top));
      assert.ok(top[0]<top[1]&&top[1]<top[2],'이어 읽기 sits above 추천 and 내 책');
      // 내 책 still holds everything, books and notes, behind 전체/책/글.
      assert.equal(await page.locator('#shelf [data-home-key^="book:"]').count(),4);
      await page.locator('#mybooks-filter [data-mybooks="casuals"]').click();
      assert.deepEqual(await page.locator('#shelf [data-home-key^="book:"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeKey)),['book:newer']);
      await page.locator('#mybooks-filter [data-mybooks="all"]').click();
      // The floating resume pill and + stay.
      assert.equal(await page.locator('#home-resume').isVisible(),true);
      assert.equal(await page.locator('#home-add').isVisible(),true);
      assert.equal(await page.locator('#home-resume-title').textContent(),'Newer article');
      await page.close();
    }finally{await browser.close();}
    console.log(`${engine.name()}: home rows, 고전/웹소설/기사 toggle, web-novel chapter sheets, 이어 읽기 and 내 책 passed`);
  }
}finally{server.close();}
