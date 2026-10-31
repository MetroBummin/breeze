// Home: 추천 (고전 / 웹소설; 기사 is dormant) on top and 내 책 below, both as
// horizontal scrolling carousels. The 내 책 chevron opens the full library,
// which is the 2-column grid on a phone (3 on a tablet, 4 on a wide screen).
// Deterministic: every request outside the local server is aborted.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
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
      assert.deepEqual(frames,classicFrame,'Web-novel covers use the classic cover frame');
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
        [['Cinnamon Bun','','RavensDagger'],['Chasing Sunlight','','InadvisablyCompelled'],['The Unexpected Engagement of the Marvelous Mr. Penn','','R. K. Goff']]);
      const bun=await openPreview(page,'cinnamon-bun');
      assert.equal(bun.kind,'webnovel');
      assert.equal(bun.source,'RavensDagger');
      assert.equal(bun.title,'Cinnamon Bun');
      assert.equal(bun.subtitle,'');
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
        english:document.getElementById('rtitle-en'),
        pill:document.getElementById('readpill-title').textContent,
        text:document.getElementById('rtext').innerText,
        shelf:document.querySelector('#shelf .home-regular-title')&&document.querySelector('#shelf .home-regular-title').textContent,
        shelfEn:document.querySelector('#shelf .home-regular-subtitle'),
      }));
      assert.equal(reader.title,'Cinnamon Bun');
      assert.equal(reader.english,null);
      assert.equal(reader.pill,'Cinnamon Bun');
      assert.match(reader.text,/Chapter One - Like You've Seen a Ghost/);
      assert.doesNotMatch(reader.text,/Stolen from its original source|A note from /i);
      assert.equal(reader.shelf,'Cinnamon Bun');
      assert.equal(reader.shelfEn,null);
      assert.equal(await page.evaluate(()=>books.filter(book=>String(book.id).startsWith('webnovel:cinnamon-bun')).map(book=>book.id).join(',')),'webnovel:cinnamon-bun');
      await page.evaluate(()=>show('home'));
      await page.locator('#casual-rail .webnovel[data-webnovel-id="cinnamon-bun"]').click();
      await page.waitForFunction(()=>document.querySelector('#article-preview').open);
      await page.locator('#article-preview .ap-chapter-row').nth(1).click();
      await page.waitForFunction(()=>document.getElementById('v-read').classList.contains('on')&&document.getElementById('rtext').innerText.includes('Chapter Two'));
      const opened=await page.evaluate(()=>books.filter(book=>String(book.id).startsWith('webnovel:')).map(book=>({id:book.id,chapter:book.webNovelChapter})));
      assert.deepEqual(opened,[{id:'webnovel:cinnamon-bun',chapter:2}],'Chapter 2 updates the same 내 책 entry');
      const chapterButton=page.locator('#pdf-page-button');
      await chapterButton.waitFor({state:'visible'});
      assert.match(await chapterButton.getAttribute('aria-label'),/회차/);
      assert.equal(await chapterButton.getAttribute('aria-expanded'),'false');
      const shots='/opt/cursor/artifacts/webnovel-one-entry';
      mkdirSync(shots,{recursive:true});
      await page.screenshot({path:`${shots}/reader-chapter-button.png`});
      await chapterButton.click();
      await page.waitForFunction(()=>document.getElementById('pdf-page-button').getAttribute('aria-expanded')==='true'&&document.querySelectorAll('#pdf-thumbnail-strip .webnovel-chapter').length===10);
      const sidebar=await page.evaluate(()=>({
        label:document.getElementById('pdf-page-navigation').getAttribute('aria-label'),
        chapters:[...document.querySelectorAll('#pdf-thumbnail-strip .pdf-thumbnail-jump')].map(node=>node.textContent),
        current:document.querySelector('#pdf-thumbnail-strip .pdf-thumbnail-jump[aria-current="true"]').textContent,
        bookmarksHidden:document.getElementById('pdf-bookmarks-only').hidden,
      }));
      assert.equal(sidebar.label,'회차');
      assert.deepEqual(sidebar.chapters,['1화','2화','3화','4화','5화','6화','7화','8화','9화','10화']);
      assert.equal(sidebar.current,'2화');
      assert.equal(sidebar.bookmarksHidden,true,'Chapter sidebar hides PDF bookmark filtering');
      for(const size of [{width:390,height:500},{width:390,height:844},{width:768,height:1024},{width:1280,height:800}]){
        await page.setViewportSize(size);
        const box=await page.locator('#pdf-page-control').boundingBox();
        assert.ok(box&&box.width>40&&box.height>40,`sidebar has a box at ${size.width}x${size.height}: ${JSON.stringify(box)}`);
        assert.ok(box.x>=-16&&box.y>=-2&&box.x+box.width<=size.width+2&&box.y+box.height<=size.height+2,`sidebar stays on screen at ${size.width}x${size.height}: ${JSON.stringify(box)}`);
      }
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>setThemePreference('dark'));
      assert.equal(await page.locator('#pdf-thumbnail-strip .pdf-thumbnail-jump[aria-current="true"]').textContent(),'2화');
      await page.evaluate(()=>setThemePreference('light'));
      await page.screenshot({path:`${shots}/reader-chapter-sidebar.png`});
      await page.evaluate(()=>{closePdfNavigation();show('home');});
      await page.locator('#longform').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>/2화/.test(document.querySelector('#shelf [data-home-key="book:webnovel:cinnamon-bun"] .prog')?.textContent||''));
      const webNovelShelf=await page.evaluate(()=>({
        keys:[...document.querySelectorAll('#shelf [data-home-key^="book:webnovel:"]')].map(node=>node.dataset.homeKey),
        prog:document.querySelector('#shelf [data-home-key="book:webnovel:cinnamon-bun"] .prog')?.textContent||'',
        resume:document.getElementById('home-resume').getAttribute('aria-label'),
        percent:document.getElementById('home-resume-percent').textContent,
        recommend:document.querySelector('#casual-rail .webnovel[data-webnovel-id="cinnamon-bun"] .get')?.textContent||'',
      }));
      assert.deepEqual(webNovelShelf.keys,['book:webnovel:cinnamon-bun']);
      assert.match(webNovelShelf.prog,/2화/);
      assert.match(webNovelShelf.resume,/Cinnamon Bun · 2화 · \d+% · 이어서 읽기/);
      assert.match(webNovelShelf.percent,/^2화 · \d+%$/);
      assert.match(webNovelShelf.recommend,/2화 읽는 중/);
      await page.screenshot({path:`${shots}/my-books-one-entry.png`});
      await page.locator('#longform .sec-head .section-link').click();
      await page.waitForFunction(()=>document.getElementById('v-longform').classList.contains('on'));
      assert.equal(await page.locator('#longform-cnt').textContent(),'1개');
      assert.equal(await page.locator('#longform-grid [data-local-book="webnovel:cinnamon-bun"]').count(),1);
      await page.screenshot({path:`${shots}/my-books-grid-one-entry.png`});
      await page.evaluate(()=>show('home'));
      await page.locator('#home-resume').click();
      await page.waitForFunction(()=>document.getElementById('v-read').classList.contains('on')&&document.getElementById('rtext').innerText.includes('Chapter Two'));
      await page.locator('#pdf-page-button').click();
      await page.waitForFunction(()=>document.getElementById('pdf-page-button').getAttribute('aria-expanded')==='true');
      await page.locator('#pdf-thumbnail-strip .pdf-thumbnail-jump[data-webnovel-chapter="3"]').click();
      await page.waitForFunction(()=>Number(curBook.webNovelChapter)===3&&document.getElementById('rtext').innerText.includes('Chapter Three'));
      assert.equal(await page.evaluate(()=>books.filter(book=>String(book.id).startsWith('webnovel:')).length),1,'Choosing another chapter stays on the same entry');
      await page.evaluate(async()=>{
        await bookDel('webnovel:cinnamon-bun');
        books=books.filter(book=>book.id!=='webnovel:cinnamon-bun');
        delete positions['webnovel:cinnamon-bun'];
        delete localReadTimes['webnovel:cinnamon-bun'];
        show('home');
      });
      await page.locator('#home-recommend-kind [data-kind="webnovels"]').click();
      const sun=await openPreview(page,'chasing-sunlight');
      assert.equal(sun.title,'Chasing Sunlight');
      assert.equal(sun.subtitle,'');
      assert.equal(sun.source,'InadvisablyCompelled');
      assert.deepEqual(sun.links,['원문 보기 · Royal Road','Amazon Kindle']);
      assert.doesNotMatch(sun.text,/vampire|뱀파이어|흡혈/i);
      await page.locator('#article-preview .ap-close').click();
      const penn=await openPreview(page,'mr-penn');
      assert.equal(penn.title,'The Unexpected Engagement of the Marvelous Mr. Penn');
      assert.equal(penn.subtitle,'');
      const pennFitBox=await page.locator('#article-preview').evaluate(dialog=>{
        const title=dialog.querySelector('.ap-title').getBoundingClientRect();
        const box=dialog.getBoundingClientRect();
        return title.left>=box.left-1&&title.right<=box.right+1&&title.height>28;
      });
      assert.equal(pennFitBox,true,'Mr. Penn’s English title wraps inside the sheet');
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
