import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const image=readFileSync(resolve(root,'assets/favicon/icon-512.png'));
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
try{
  for(const engine of [chromium,webkit].filter(engine=>!process.env.BROWSER||engine.name()===process.env.BROWSER)){
    const browser=await engine.launch(engine===chromium && process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.route('**/*',route=>{
        const url=route.request().url();
        if(url.startsWith(base))return route.continue();
        if(url==='https://images.test/rss-cover.png')return route.fulfill({
          headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/png',body:image});
        return route.abort();
      });
      await page.goto(base);await page.evaluate(()=>homeReady);
      const state=await page.evaluate(async()=>{
        const rail=document.getElementById('casual-rail');
        rssRenderIds.set(rail,1);
        const noPhoto=await rssFeedCards([{title:'No cover',url:'https://example.com/no-cover',source:'Example'}],1,rail);
        const entry={title:'A story with a photo',url:'https://example.com/with-cover',source:'Example',
          photo:'https://images.test/rss-cover.png'};
        const qaRail=document.createElement('div');qaRail.id='qa-rail';document.body.append(qaRail);
        const card=rssCard(entry);qaRail.append(card);
        window.rssCoverReady=rssCardPhoto(card,entry);
        return {noPhotoCount:noPhoto.length,pendingUntilPhoto:card.classList.contains('rss-pending'),hidden:card.hidden};
      });
      assert.equal(state.noPhotoCount,0);
      assert.equal(state.pendingUntilPhoto,true);
      assert.equal(state.hidden,false);
      assert.equal(await page.evaluate(()=>window.rssCoverReady),true);
      const coverState=await page.locator('#qa-rail .rss-card').evaluate(card=>({hidden:card.hidden,loaded:card.querySelector('.cover').naturalWidth}));
      assert.equal(coverState.hidden,false);
      assert(coverState.loaded>=60);
      const skeletonStates=await page.evaluate(async()=>{
        if(rssLoading)await rssLoading;
        const rail=document.getElementById('casual-rail');
        const results=[];
        for(const dark of [false,true]){
          document.body.classList.toggle('dark',dark);
          const entry={title:'A longer headline across multiple lines',url:'https://example.com/geometry',source:'Example',photo:'https://images.test/rss-cover.png'};
          const card=rssCard(entry);rail.append(card);
          const bounds=()=>{const r=card.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
          const before=bounds();
          const material=getComputedStyle(card.querySelector('.rss-skeleton')).backgroundImage;
          await rssCardPhoto(card,entry);
          results.push({before,after:bounds(),material,pending:card.classList.contains('rss-pending')});
          card.remove();
        }
        document.body.classList.remove('dark');
        return results;
      });
      for(const state of skeletonStates){assert.deepEqual(state.before,state.after);assert.equal(state.pending,false);}
      assert.notEqual(skeletonStates[0].material,skeletonStates[1].material);
      await page.evaluate(()=>{
        window.rssOpenCount=0;
        importRssEntry=()=>{window.rssOpenCount++;};
      });
      const card=page.locator('#qa-rail .rss-card');
      const box=await card.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();
      assert.equal(await page.evaluate(()=>window.rssOpenCount),0);
      await card.click();
      assert.equal(await page.evaluate(()=>window.rssOpenCount),1);
      await page.evaluate(async()=>{
        if(rssLoading)await rssLoading;
        rssCands=rssSources().map((feed,index)=>[{title:`Story ${index}`,url:`https://example.com/story-${index}`,
          source:feed.name,feedSourceUrl:feed.url,photo:'https://images.test/rss-cover.png'}]);
        rssLoadedAt=Date.now();
        refreshFeedRails();
      });
      await page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card:not([hidden])').length>=6);
      const homeScroll=await page.evaluate(()=>{
        const rail=document.getElementById('casual-rail');rail.scrollLeft=rail.scrollWidth;
        return rail.scrollLeft;
      });
      assert(homeScroll>100,'Home rail did not reach later cards');
      // Refresh must reset a later card, including after DOM replacement/snap.
      await page.evaluate(async()=>{
        loadBooks=async()=>{};
        loadRss=async()=>rssCands;
        await refreshLibrary();
      });
      await page.waitForTimeout(150);
      assert.equal(await page.locator('#casual-rail').evaluate(rail=>rail.scrollLeft),0,'Refresh retained a horizontal offset');
      for(let repeat=0;repeat<3;repeat++){
        await page.evaluate(async()=>{
          rssCands=rssCands.map((entries,index)=>entries.map(entry=>({...entry,url:entry.url+'-next',title:entry.title+' next'})));
          await renderRssCards(document.getElementById('casual-rail'),true,document.getElementById('home-feed-empty'));
        });
        await page.waitForTimeout(150);
        assert.equal(await page.locator('#casual-rail').evaluate(rail=>rail.scrollLeft),0,'Replacement shifted the first card');
      }
      await page.evaluate(()=>show('casuals'));
      assert.equal(await page.locator('#v-casuals .rss-card,#v-casuals .feed-categories').count(),0);
      console.log(engine.name(),'RSS cover/tap behavior and Home-only discovery passed');
    }finally{await browser.close();}
  }
}finally{server.close();}
