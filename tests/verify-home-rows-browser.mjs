// Home: 추천 (고전 / 웹소설 / 기사) on top, 내 책 below, both 2-column grids on a phone.
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
    title:dialog.querySelector('.ap-title').textContent,
    subtitle:dialog.querySelector('.ap-subtitle').textContent,
    image:(()=>{const image=dialog.querySelector('.ap-hero img');return [image.naturalWidth,getComputedStyle(image).objectFit];})(),
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
        [['casuals',true],['longform',true]],'추천 on top, 내 책 below, no 이어 읽기 row');
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
      await page.waitForFunction(()=>{const image=document.querySelector('#casual-rail [data-longread-id] img.cover');return image&&!image.hidden&&image.naturalWidth>0;});
      const classicFrame=await page.locator('#casual-rail [data-longread-id] .cover').first().evaluate(node=>{const rect=node.getBoundingClientRect();return [Math.round(rect.width),Math.round(rect.height)];});
      assert.deepEqual(frames,classicFrame,'Web-novel covers use the classic cover frame');
      await page.locator('#home-recommend-kind [data-kind="webnovels"]').click();

      // Two columns on a phone; covers keep their 2:3 shape (nothing cropped).
      const grid=await page.evaluate(()=>{
        const cards=[...document.querySelectorAll('#casual-rail .webnovel')].map(card=>card.getBoundingClientRect());
        const cover=document.querySelector('#casual-rail .webnovel .cover').getBoundingClientRect();
        return {sameRow:Math.round(cards[0].top)===Math.round(cards[1].top),side:cards[1].left>cards[0].right,ratio:cover.height/cover.width,
          columns:getComputedStyle(document.getElementById('casual-rail')).gridTemplateColumns.split(' ').length};
      });
      assert.equal(grid.columns,2);assert.equal(grid.sameRow,true);assert.equal(grid.side,true);
      assert.ok(Math.abs(grid.ratio-1.5)<.02,`cover ratio ${grid.ratio}`);
      assert.deepEqual(await page.locator('#casual-rail .webnovel').evaluateAll(nodes=>nodes.map(node=>[node.querySelector('.bt').textContent,node.querySelector('.ko').textContent,node.querySelector('.author').textContent])),
        [['Cinnamon Bun','시나몬 번','RavensDagger'],['Chasing Sunlight','체이싱 선라이트','InadvisablyCompelled'],['The Unexpected Engagement of the Marvelous Mr. Penn','마블러스 미스터 펜의 뜻밖의 약혼','R. K. Goff']]);
      const bun=await openPreview(page,'cinnamon-bun');
      assert.equal(bun.kind,'webnovel');
      assert.equal(bun.source,'RavensDagger');
      assert.equal(bun.title,'Cinnamon Bun');
      assert.equal(bun.subtitle,'시나몬 번 · 청소와 다정함으로 세상을 구하는 모험');
      assert.deepEqual(bun.image,[768,'contain'],'The sheet shows the whole cover');
      assert.equal(bun.rows.length,10);
      assert.deepEqual(bun.rows[0],['1화','곧 공개']);
      assert.ok(bun.rows.every(([,state])=>state==='곧 공개'));
      assert.deepEqual(bun.links,['Royal Road 원문'],'Cinnamon Bun has no monetized link');
      await page.locator('#article-preview .ap-chapter-row').first().evaluate(row=>row.click());
      assert.equal(await page.locator('#article-preview .ap-status').textContent(),'곧 공개될 회차예요.');
      assert.equal(await page.evaluate(()=>!!document.querySelector('#article-preview').open&&!document.getElementById('v-read').classList.contains('on')),true,'A 곧 공개 chapter does not navigate');
      await page.locator('#article-preview .ap-close').click();
      const sun=await openPreview(page,'chasing-sunlight');
      assert.equal(sun.title,'Chasing Sunlight');
      assert.equal(sun.source,'InadvisablyCompelled');
      assert.deepEqual(sun.links,['Royal Road 원문','Kindle 판']);
      assert.doesNotMatch(sun.text,/vampire|뱀파이어|흡혈/i);
      await page.locator('#article-preview .ap-close').click();
      const penn=await openPreview(page,'mr-penn');
      assert.equal(penn.title,'The Unexpected Engagement of the Marvelous Mr. Penn');
      assert.equal(penn.source,'R. K. Goff');
      assert.equal(penn.rows.length,10,'R. K. Goff: first 10 chapters only');
      assert.deepEqual(penn.links,['Royal Road 원문'],'Mr. Penn has no monetized link');
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

      // 내 책: opened, unfinished items first (most recent first), then the rest.
      await page.evaluate(async()=>{
        const make=(id,title,kind)=>({id,title,kind,author:'Writer',site:'Example',paras:[title,'Body text for '+title+'.'],addedAt:1});
        const list=[make('older','Older book','txt'),make('newer','Newer article','paste'),make('finished','Finished book','txt'),make('fresh','Never opened','txt')];
        for(const book of list)await bookPut(book);
        books=list;
        positions={older:{p:.3,t:1},newer:{p:.2,t:2},finished:{p:1,t:3}};
        rememberLocalReading(list[0]);rememberLocalReading(list[1]);rememberLocalReading(list[2]);
        renderHome();
      });
      assert.equal(await page.locator('#continue,#continue-rail').count(),0);
      assert.deepEqual(await page.locator('#shelf [data-home-key^="book:"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeKey)),
        ['book:newer','book:older','book:finished','book:fresh']);
      const top=await page.evaluate(()=>[...document.querySelectorAll('#v-home > section:not([hidden])')].map(node=>node.getBoundingClientRect().top));
      assert.ok(top[0]<top[1],'추천 sits above 내 책');
      const shelf=await page.evaluate(()=>{
        const tiles=[...document.querySelectorAll('#shelf > .home-regular-tile')].map(tile=>tile.getBoundingClientRect());
        return {columns:getComputedStyle(document.getElementById('shelf')).gridTemplateColumns.split(' ').length,
          sameRow:Math.round(tiles[0].top)===Math.round(tiles[1].top),nextRow:tiles[2].top>tiles[0].bottom};
      });
      assert.deepEqual(shelf,{columns:2,sameRow:true,nextRow:true},'내 책 is a 2-column grid');
      await page.locator('#mybooks-filter [data-mybooks="casuals"]').click();
      assert.deepEqual(await page.locator('#shelf [data-home-key^="book:"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeKey)),['book:newer']);
      await page.locator('#mybooks-filter [data-mybooks="all"]').click();
      // Wider screens use more columns.
      await page.setViewportSize({width:820,height:1180});
      assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('shelf')).gridTemplateColumns.split(' ').length),3);
      await page.setViewportSize({width:1180,height:820});
      assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('shelf')).gridTemplateColumns.split(' ').length),4);
      await page.setViewportSize({width:390,height:844});
      // The floating resume pill and + stay.
      assert.equal(await page.locator('#home-resume').isVisible(),true);
      assert.equal(await page.locator('#home-add').isVisible(),true);
      assert.equal(await page.locator('#home-resume-title').textContent(),'Finished book','The pill opens the last opened book');
      await page.close();
    }finally{await browser.close();}
    console.log(`${engine.name()}: 추천 grid with 고전/웹소설/기사, web-novel sheets, 내 책 grid in recent order passed`);
  }
}finally{server.close();}
