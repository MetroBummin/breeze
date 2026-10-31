// Home: 추천 (고전 / 웹소설; 기사 is dormant) on top and 내 책 below, both as
// horizontal scrolling carousels. The 내 책 chevron opens the full library,
// which is the 2-column grid on a phone (3 on a tablet, 4 on a wide screen).
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
    start:dialog.querySelector('.ap-start').textContent,
    startClass:dialog.querySelector('.ap-start').className,
    summaryHeading:dialog.querySelector('.ap-summary-heading').textContent,
    order:[...dialog.querySelector('.ap-content').children].map(node=>node.className.split(' ')[0]),
  }));
}
async function chapterListFits(page){
  return page.locator('#article-preview').evaluate(dialog=>{
    const scroll=dialog.querySelector('.ap-scroll');
    const button=dialog.querySelector('.ap-start').getBoundingClientRect();
    const scrollRect=scroll.getBoundingClientRect();
    const rows=[...dialog.querySelectorAll('.ap-chapter-row')].slice(0,3).map(row=>row.getBoundingClientRect());
    return {
      scrollTop:scroll.scrollTop,
      visible:rows.length===3&&rows.every(rect=>rect.height>20&&rect.top>=scrollRect.top-1&&rect.bottom<=button.top+1),
      heading:dialog.querySelector('.ap-chapters-heading').innerText.replace(/\s+/g,' ').trim(),
    };
  });
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
      // 기사 is dormant: the button is kept in the markup but hidden.
      assert.deepEqual(await page.locator('#home-recommend-kind button').evaluateAll(nodes=>nodes.filter(node=>node.offsetParent!==null).map(node=>node.textContent)),
        ['고전','웹소설']);
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
      assert.equal(frames[0],classicFrame[0],'Web-novel cards keep the classic cover width');
      assert.ok(frames[1]>200&&frames[1]<classicFrame[1],'The English subtitle sits under the Korean title');
      await page.locator('#home-recommend-kind [data-kind="webnovels"]').click();

      // 추천 is a horizontal carousel: the rail is a flex row that overflows
      // sideways (scrollWidth > clientWidth with the cards side by side), it is
      // NOT a grid, and it scrolls along x only (no vertical hijack).
      const rail=await page.evaluate(()=>{
        const node=document.getElementById('casual-rail');
        const style=getComputedStyle(node);
        const cards=[...node.querySelectorAll('.webnovel')].map(card=>card.getBoundingClientRect());
        return {display:style.display,overflowX:style.overflowX,
          scrollable:node.scrollWidth>node.clientWidth,
          sameRow:Math.round(cards[0].top)===Math.round(cards[1].top),
          side:cards[1].left>cards[0].right};
      });
      assert.equal(rail.display,'flex','추천 rail is a flex carousel, not a grid');
      assert.ok(['auto','scroll'].includes(rail.overflowX),`overflow-x ${rail.overflowX}`);
      assert.equal(rail.scrollable,true,'추천 rail overflows sideways');
      assert.equal(rail.sameRow,true,'추천 cards stay on one row');
      assert.equal(rail.side,true,'추천 cards sit side by side');
      assert.deepEqual(await page.locator('#casual-rail .webnovel').evaluateAll(nodes=>nodes.map(node=>[node.querySelector('.bt').textContent,node.querySelector('.ko').textContent,node.querySelector('.author').textContent])),
        [['시나몬 번','Cinnamon Bun','RavensDagger'],['체이싱 선라이트','Chasing Sunlight','InadvisablyCompelled'],['마블러스 미스터 펜의 뜻밖의 약혼','The Unexpected Engagement of the Marvelous Mr. Penn','R. K. Goff']]);
      const bun=await openPreview(page,'cinnamon-bun');
      assert.equal(bun.kind,'webnovel');
      assert.equal(bun.source,'RavensDagger');
      assert.equal(bun.title,'시나몬 번');
      assert.equal(bun.subtitle,'Cinnamon Bun');
      assert.deepEqual(bun.image,[768,'contain'],'The sheet shows the whole cover');
      assert.equal(bun.rows.length,10);
      assert.deepEqual(bun.rows[0],['1화','읽기']);
      assert.ok(bun.rows.every(([,state])=>state==='읽기'));
      assert.deepEqual(bun.links,['원문 보기 · Royal Road'],'Cinnamon Bun has no monetized link');
      assert.equal(bun.start,'1화 보기');
      assert.equal(bun.startClass,'ap-start','The chapter button keeps the existing start-button class');
      assert.equal(bun.summaryHeading,'짧게 살펴보기');
      assert.deepEqual(bun.order,['ap-source','ap-title','ap-subtitle','ap-links','ap-chapters','ap-summary-card','ap-details']);
      const bunFit=await chapterListFits(page);
      assert.equal(bunFit.scrollTop,0);
      assert.equal(bunFit.visible,true,'The first three chapters fit above the button without scrolling');
      assert.match(bunFit.heading,/회차/);
      assert.match(bunFit.heading,/전체 10화 ›/);
      await page.locator('#article-preview .ap-start').click();
      await page.waitForFunction(()=>document.getElementById('v-read').classList.contains('on')&&!document.querySelector('#article-preview').open&&document.getElementById('rtext').innerText.length>400);
      const reader=await page.evaluate(()=>({
        title:document.getElementById('rtitle').textContent,
        english:document.getElementById('rtitle-en')&&document.getElementById('rtitle-en').textContent,
        pill:document.getElementById('readpill-title').textContent,
        text:document.getElementById('rtext').innerText,
        shelf:document.querySelector('#shelf .home-regular-title')&&document.querySelector('#shelf .home-regular-title').textContent,
        shelfEn:document.querySelector('#shelf .home-regular-subtitle')&&document.querySelector('#shelf .home-regular-subtitle').textContent,
      }));
      assert.equal(reader.title,'시나몬 번');
      assert.equal(reader.english,'Cinnamon Bun');
      assert.equal(reader.pill,'시나몬 번');
      assert.match(reader.text,/Chapter One - Like You've Seen a Ghost/);
      assert.doesNotMatch(reader.text,/Stolen from its original source|A note from /i);
      assert.equal(reader.shelf,'시나몬 번');
      assert.equal(reader.shelfEn,'Cinnamon Bun');
      await page.evaluate(async()=>{
        await bookDel('webnovel:cinnamon-bun:1');
        books=books.filter(book=>book.id!=='webnovel:cinnamon-bun:1');
        delete positions['webnovel:cinnamon-bun:1'];
        show('home');
      });
      await page.locator('#home-recommend-kind [data-kind="webnovels"]').click();
      const sun=await openPreview(page,'chasing-sunlight');
      assert.equal(sun.title,'체이싱 선라이트');
      assert.equal(sun.subtitle,'Chasing Sunlight');
      assert.equal(sun.source,'InadvisablyCompelled');
      assert.deepEqual(sun.links,['원문 보기 · Royal Road','Amazon Kindle']);
      assert.doesNotMatch(sun.text,/vampire|뱀파이어|흡혈/i);
      await page.locator('#article-preview .ap-close').click();
      const penn=await openPreview(page,'mr-penn');
      assert.equal(penn.title,'마블러스 미스터 펜의 뜻밖의 약혼');
      assert.equal(penn.subtitle,'The Unexpected Engagement of the Marvelous Mr. Penn');
      assert.equal(penn.source,'R. K. Goff');
      assert.equal(penn.rows.length,10,'R. K. Goff: first 10 chapters only');
      assert.equal(penn.start,'1화 보기');
      assert.deepEqual(penn.links,['원문 보기 · Royal Road'],'Mr. Penn has no monetized link');
      const pennFit=await chapterListFits(page);
      assert.equal(pennFit.visible,true,'Mr. Penn’s first three chapters fit on an iPhone sheet');
      assert.match(pennFit.heading,/전체 10화 ›/);
      await page.locator('#article-preview .ap-close').click();

      // A stored 기사 choice opens 고전 while 기사 is dormant, and nothing asks RSS.
      await page.evaluate(()=>{save('breeze.home-recommend','articles');setHomeRecommendKind('articles');renderHome();});
      assert.equal(await page.evaluate(()=>homeRecommendKind()),'classics');
      assert.equal(await page.locator('#casual-rail :is(.rss-card,.rss-loading)').count(),0,'Home asked RSS while 기사 is dormant');
      assert.ok(await page.locator('#casual-rail [data-longread-id]').count()>0);
      // Arrow keys move along 고전 / 웹소설 only.
      await page.locator('#home-recommend-kind [data-kind="webnovels"]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(()=>homeRecommendKind()),'classics');

      // 내 책: opened, unfinished items first (most recent first), then the rest.
      await page.evaluate(async()=>{
        const make=(id,title,kind)=>({id,title,kind,author:'Writer',site:'Example',paras:[title,'Body text for '+title+'.'],addedAt:1});
        const list=[make('older','Older book','txt'),{...make('newer','Newer article','article'),sourceUrl:'https://example.com/newer'},make('finished','Finished book','txt'),make('fresh','Never opened','txt')];
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
        const node=document.getElementById('shelf');
        const tiles=[...node.querySelectorAll(':scope > .home-regular-tile')].map(tile=>tile.getBoundingClientRect());
        return {display:getComputedStyle(node).display,scrollable:node.scrollWidth>node.clientWidth,
          oneRow:tiles.every(tile=>Math.round(tile.top)===Math.round(tiles[0].top))};
      });
      assert.deepEqual(shelf,{display:'flex',scrollable:true,oneRow:true},'내 책 on Home is a horizontal carousel');
      // 내 책 has no 전체/책/글 filter: only the title and its chevron to the library.
      assert.equal(await page.locator('#longform .home-kind,#mybooks-filter').count(),0);
      assert.equal(await page.locator('#longform .sec-head .section-link').count(),1);
      // The chevron opens the full library, which is the grid: 2, 3 and 4 columns.
      await page.locator('#longform .sec-head .section-link').click();
      await page.waitForFunction(()=>document.getElementById('v-longform').classList.contains('on'));
      // The library is the full 내 책: the saved article from the Home carousel is
      // there too, in the same order, and the count covers every card.
      const homeOrder=await page.evaluate(()=>[...document.querySelectorAll('#shelf [data-local-book]')].map(node=>node.dataset.localBook));
      assert.deepEqual(await page.locator('#longform-grid [data-local-book]').evaluateAll(nodes=>nodes.map(node=>node.dataset.localBook)),homeOrder,
        'The chevron grid lists the same books and articles as Home 내 책');
      assert.ok(homeOrder.includes('newer'),'The saved article is in Home 내 책');
      assert.equal(await page.locator('#longform-grid .casual[data-local-book="newer"]').count(),1,'The saved article is in the chevron grid');
      assert.equal(await page.locator('#longform-cnt').textContent(),'4개');
      const columns=()=>page.evaluate(()=>getComputedStyle(document.getElementById('longform-grid')).gridTemplateColumns.split(' ').length);
      assert.equal(await columns(),2);
      await page.setViewportSize({width:820,height:1180});
      assert.equal(await columns(),3);
      await page.setViewportSize({width:1180,height:820});
      assert.equal(await columns(),4);
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>show('home'));
      // The floating resume pill and + stay.
      assert.equal(await page.locator('#home-resume').isVisible(),true);
      assert.equal(await page.locator('#home-add').isVisible(),true);
      assert.equal(await page.locator('#home-resume-title').textContent(),'Finished book','The pill opens the last opened book');
      await page.close();
    }finally{await browser.close();}
    console.log(`${engine.name()}: 추천 carousel with 고전/웹소설 (기사 dormant), web-novel sheets, 내 책 carousel in recent order, library grid passed`);
  }
}finally{server.close();}
