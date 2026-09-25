import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');
    res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
      await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.goto(url);
      await page.evaluate(()=>homeReady);
      await page.evaluate(async()=>{
        books=[];
        loadRss=async()=>[[{source:'Fixture',title:'Fresh article',url:'https://example.com/article',summary:'Sample',photo:'fixture',date:''}]];
        rssCardPhoto=async card=>{card.hidden=false;return true;};
        const home=document.getElementById('casual-rail');
        await renderRssCards(home,false);
      });
      assert.equal(await page.locator('#casual-rail .rss-card').count(),1,`${engine.name()} Home RSS missing`);
      assert.deepEqual(await page.locator('#casual-rail .rss-card').evaluate(card=>({
        title:getComputedStyle(card.querySelector('.ct')).position,
        source:getComputedStyle(card.querySelector('.src')).position,
        meta:getComputedStyle(card.querySelector('.cm')).display,
      })),{title:'absolute',source:'absolute',meta:'none'},'Recommendation copy left the image');
      assert.equal(await page.locator('#v-casuals #casual-discover-rail,#v-casuals .feed-categories').count(),0);
      assert.equal(await page.locator('#casual-rail .casual.add,#casual-rail .casual.refresh').count(),0,
        'Recommendation should contain only external discovery cards');
      await page.evaluate(()=>{
        books=[
          {id:'saved-short',kind:'paste',title:'Saved story',paras:['Saved story','Readable body'],addedAt:2},
          {id:'saved-long',kind:'txt',title:'Saved book',author:'Author',paras:['Saved book','Readable body'],addedAt:1},
        ];
        positions={'saved-short':{t:10,p:.2},'saved-long':{t:20,p:.4}};
        renderHome();
      });
      assert.deepEqual(await page.locator('#v-home > section').evaluateAll(nodes=>nodes.map(node=>node.id)),
        ['casuals','longform','home-casuals'],'Home section order changed');
      assert.equal(await page.locator('#casual-rail [data-home-key^="book:"]').count(),0,'Saved book entered recommendation');
      assert.equal(await page.locator('#shelf [data-home-key="book:saved-long"]').count(),1);
      assert.equal(await page.locator('#home-casual-rail [data-home-key="book:saved-short"]').count(),1);
      assert.equal(await page.locator('#home-casual-rail .bar,#home-casual-rail .now-ring,#shelf .now-ring').count(),0);
      const footprints=await page.evaluate(()=>{
        const book=document.querySelector('#shelf [data-home-key="book:saved-long"]').getBoundingClientRect();
        const light=document.querySelector('#home-casual-rail [data-home-key="book:saved-short"]').getBoundingClientRect();
        return [Math.round(book.width),Math.round(book.height),Math.round(light.width),Math.round(light.height)];
      });
      assert.deepEqual(footprints.slice(0,2),footprints.slice(2),'Regular Home cards should share a footprint');
      const covers=await page.evaluate(()=>[
        document.querySelector('#shelf [data-home-key="book:saved-long"] .bookcard').getBoundingClientRect(),
        document.querySelector('#home-casual-rail [data-home-key="book:saved-short"] .thumb').getBoundingClientRect(),
      ].map(rect=>[Math.round(rect.width),Math.round(rect.height)]));
      assert.deepEqual(covers[0],covers[1],'Long and light image areas should match exactly');
      for(const width of [390,768,1180]){
        await page.setViewportSize({width,height:844});
        const dimensions=await page.evaluate(()=>{
          const measure=selector=>{
            const rect=document.querySelector(selector).getBoundingClientRect();
            return [Math.round(rect.width),Math.round(rect.height)];
          };
          return [
            measure('#shelf [data-home-key="book:saved-long"]'),
            measure('#home-casual-rail [data-home-key="book:saved-short"]'),
            measure('#shelf [data-home-key="book:saved-long"] .bookcard'),
            measure('#home-casual-rail [data-home-key="book:saved-short"] .thumb'),
          ];
        });
        assert.deepEqual(dimensions[0],dimensions[1],`${engine.name()} ${width}px tile mismatch`);
        assert.deepEqual(dimensions[2],dimensions[3],`${engine.name()} ${width}px cover mismatch`);
      }
      assert.equal(await page.locator('#shelf .home-regular-title').filter({hasText:'Saved book'}).count(),1);
      assert.equal(await page.locator('#home-casual-rail .home-regular-title').filter({hasText:'Saved story'}).count(),1);
      assert.equal(await page.locator('#shelf .home-cover-meta').filter({hasText:'Author'}).count(),1);
      assert.equal(await page.locator('#home-casual-rail .home-cover-meta').count(),1);
      assert.equal(await page.locator('#shelf .home-regular-meta,#home-casual-rail .home-regular-meta').count(),0);
      const addSizes=await page.evaluate(()=>[
        ...['#shelf .home-add-tile','#home-casual-rail .home-add-tile'].map(selector=>{
          const tile=document.querySelector(selector),cover=tile.querySelector('.bookcard,.thumb');
          return [Math.round(tile.getBoundingClientRect().width),Math.round(cover.getBoundingClientRect().height)];
        }),
      ]);
      assert.deepEqual(addSizes[0],addSizes[1],'The two add cards should align');
      assert.equal(await page.locator('#home-casual-empty').count(),0);
      assert.equal(await page.locator('.home-add-tile .home-regular-title:visible').count(),0);
      const crops=await page.evaluate(()=>[
        homeCropPosition([{x:4,y:25,width:24,height:24}],160,120,3/4),
        homeCropPosition([{x:132,y:25,width:24,height:24}],160,120,3/4),
        homeCropPosition([{x:4,y:25,width:24,height:24},{x:132,y:25,width:24,height:24}],160,120,3/4),
      ]);
      assert.equal(crops[0].x,0,'Left edge face should stay visible');
      assert.equal(crops[1].x,1,'Right edge face should stay visible');
      assert.equal(crops[2].fit,'contain','Unfittable multiple faces should remain visible');
      await page.evaluate(()=>show('casuals'));
      await page.locator('#v-casuals').waitFor({state:'visible'});
      assert.equal(await page.locator('#v-casuals .rss-card').count(),0);
      assert.equal(await page.locator('#casual-grid .casual').count(),1);
      await page.evaluate(()=>document.querySelector('#casual-grid').appendChild(
        document.querySelector('#casual-grid .home-regular-tile').cloneNode(true)));
      const libraryLight=[];
      for(const width of [390,768,1180]){
        await page.setViewportSize({width,height:844});
        if(width===390){
          const gutters=await page.evaluate(()=>{
            const view=document.querySelector('#v-casuals').getBoundingClientRect();
            const tiles=[...document.querySelectorAll('#casual-grid .home-regular-tile')].map(tile=>tile.getBoundingClientRect());
            return [tiles[0].left-view.left,view.right-tiles[1].right,tiles[0].top,tiles[1].top];
          });
          assert.equal(gutters[2],gutters[3],'Casuals cards should share a row');
          assert.ok(Math.abs(gutters[0]-gutters[1])<1,`${engine.name()} Casuals grid is not centered: ${gutters}`);
        }
        libraryLight.push(await page.evaluate(()=>{
          const tile=document.querySelector('#casual-grid .home-regular-tile');
          const thumb=tile.querySelector('.thumb');
          return [Math.round(tile.getBoundingClientRect().width),Math.round(thumb.getBoundingClientRect().height),
            getComputedStyle(thumb).borderTopWidth];
        }));
      }
      await page.evaluate(()=>show('longform'));
      await page.evaluate(()=>document.querySelector('#longform-grid').appendChild(
        document.querySelector('#longform-grid .home-regular-tile').cloneNode(true)));
      const libraryLong=[];
      for(const width of [390,768,1180]){
        await page.setViewportSize({width,height:844});
        if(width===390){
          const gutters=await page.evaluate(()=>{
            const view=document.querySelector('#v-longform').getBoundingClientRect();
            const tiles=[...document.querySelectorAll('#longform-grid .home-regular-tile')].map(tile=>tile.getBoundingClientRect());
            return [tiles[0].left-view.left,view.right-tiles[1].right,tiles[0].top,tiles[1].top];
          });
          assert.equal(gutters[2],gutters[3],'Longform cards should share a row');
          assert.ok(Math.abs(gutters[0]-gutters[1])<1,`${engine.name()} Longform grid is not centered: ${gutters}`);
        }
        libraryLong.push(await page.evaluate(()=>{
          const tile=document.querySelector('#longform-grid .home-regular-tile');
          const cover=tile.querySelector('.bookcard');
          return [Math.round(tile.getBoundingClientRect().width),Math.round(cover.getBoundingClientRect().height),
            getComputedStyle(cover).borderTopWidth];
        }));
      }
      assert.deepEqual(libraryLight,libraryLong,'Library cover sizes or borders differ between long and light');
      assert.deepEqual(libraryLight.map(item=>item[2]),['0px','0px','0px']);
      assert.deepEqual(libraryLight.map(item=>item[0]),[171,190,190],
        'Library cards should be slightly larger than Home cards at phone, tablet, and desktop widths');
    }finally{await browser.close();}
  }
}finally{server.close();}
console.log('Recommendation and saved Casuals rails verified in Chromium and WebKit');
