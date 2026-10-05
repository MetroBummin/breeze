/* Real feed parser/cache/card/Preview, with synthetic publisher transports.
   No live publisher, service mutation or AI request leaves the browser. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const photo=readFileSync(resolve(root,'assets/samples/starship-1.jpg'));
const rssSource=readFileSync(resolve(root,'scripts/importers/rss.js'),'utf8');
const feeds=[...rssSource.matchAll(/name:'([^']+)', url:'([^']+)', category:'([^']+)'/g)]
  .map(([,name,url,category])=>({name,url,category}));
const prose='The story explains how people learn about the world by reading evidence and comparing ideas. ';
const cases=[
  {name:'description-photo',fields:`<content:encoded><![CDATA[<p>${prose.repeat(8)}</p>]]></content:encoded><description><![CDATA[<p>${prose}</p><img src="https://images.test/description.jpg" width="640" height="480">]]></description>`,expected:'https://images.test/description.jpg'},
  {name:'summary-photo',atom:true,fields:`<content type="html">${prose.repeat(8)}</content><summary type="html"><![CDATA[<p>${prose}</p><img data-src="https://images.test/summary.jpg" width="640" height="480">]]></summary>`,expected:'https://images.test/summary.jpg'},
  {name:'video-before-thumbnail',fields:`<description>${prose}</description><media:content medium="video" url="https://images.test/clip.mp4"/><media:thumbnail type="IMAGE/JPEG" url="https://images.test/thumbnail.jpg" width="640" height="480"/>`,expected:'https://images.test/thumbnail.jpg'},
  {name:'enclosure-mime-case',fields:`<description>${prose}</description><enclosure type="IMAGE/JPEG" url="https://images.test/enclosure.jpg"/>`,expected:'https://images.test/enclosure.jpg'},
  {name:'responsive-summary',fields:`<content:encoded><![CDATA[<p>${prose.repeat(8)}</p>]]></content:encoded><summary><![CDATA[<img src="https://images.test/small.jpg" srcset="https://images.test/small.jpg 400w, https://images.test/responsive.jpg 1200w, https://images.test/large.jpg 2400w">]]></summary>`,expected:'https://images.test/responsive.jpg'},
  {name:'ordinary-photo',fields:`<description>${prose}</description><enclosure type="image/jpeg" url="https://images.test/ordinary.jpg"/>`,expected:'https://images.test/ordinary.jpg'},
  {name:'no-publisher-photo',fields:`<description>${prose}</description>`,expected:''},
  {name:'broken-image',fields:`<description>${prose}</description><enclosure type="image/jpeg" url="https://images.test/broken.jpg"/>`,expected:'https://images.test/broken.jpg'},
  {name:'hotlink-recovery',fields:`<description>${prose}</description><enclosure type="image/jpeg" url="https://images.test/hotlink.jpg"/>`,expected:'https://images.test/hotlink.jpg'},
  {name:'invalid-and-tracker',fields:`<description><![CDATA[<p>${prose}</p><img src="javascript:alert(1)"><img src="https://images.test/count.gif" width="1" height="1"><img src="https://images.test/valid.jpg" width="640" height="480">]]></description>`,expected:'https://images.test/valid.jpg'},
];
function fixture(index){
  const row=cases[index%cases.length],url=`https://stories.test/article-${index}`;
  const title=`The ${row.name.replaceAll('-',' ')} story`;
  return row.atom
    ? `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>${title}</title><link href="${url}"/>${row.fields}</entry></feed>`
    : `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>${title}</title><link>${url}</link>${row.fields}</item></channel></rss>`;
}
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
const artifacts=process.env.BREEZE_RSS_COVER_PROOF||process.env.BREEZE_RSS_COVER_ARTIFACT_DIR||'/tmp/breeze-rss-cover-qa';
mkdirSync(artifacts,{recursive:true});
try{
  for(const engine of [chromium,webkit].filter(engine=>!process.env.BREEZE_QA_ENGINE||engine.name()===process.env.BREEZE_QA_ENGINE)){
    const executable=process.env.BREEZE_BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE_PATH;
    const browser=await engine.launch(engine===chromium&&executable?{executablePath:executable}:{});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
      const requests=[];
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.route('**/*',async route=>{
        const url=route.request().url(),parsed=new URL(url);
        if(url.startsWith(base)){
          if(process.env.BREEZE_RSS_COVER_SOURCE&&parsed.pathname==='/scripts/importers/rss.js')
            return route.fulfill({contentType:'text/javascript',body:readFileSync(process.env.BREEZE_RSS_COVER_SOURCE,'utf8')});
          return route.continue();
        }
        if(parsed.hostname==='stories.test'){
          requests.push({kind:'article',url});
          return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/html',
            body:`<!doctype html><title>The selected story</title><article><h1>The selected story</h1><p>${prose.repeat(18)}</p></article>`});
        }
        const index=feeds.findIndex(feed=>feed.url===url);
        if(index>=0){requests.push({kind:'feed',url});return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/xml',body:fixture(index)});}
        if(parsed.hostname==='images.test'){
          requests.push({kind:'image',url});
          if(parsed.pathname==='/broken.jpg')return route.fulfill({contentType:'text/html',body:'Challenge page'});
          if(parsed.pathname==='/hotlink.jpg')return route.abort();
          return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/jpeg',body:photo});
        }
        if(parsed.pathname==='/functions/v1/article'&&parsed.searchParams.get('as')==='image'){
          requests.push({kind:'image-relay',url:parsed.searchParams.get('url')});
          return parsed.searchParams.get('url')==='https://images.test/hotlink.jpg'
            ? route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/jpeg',body:photo})
            : route.fulfill({status:404,headers:{'Access-Control-Allow-Origin':'*'}});
        }
        requests.push({kind:'blocked',url});return route.abort();
      });
      await page.goto(base);await page.evaluate(()=>homeReady);
      await page.evaluate(async()=>{if(rssLoading)await rssLoading;refreshFeedRails();});
      await page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card').length===13&&
        !document.querySelector('#casual-rail .rss-pending'),{},{timeout:20000});
      const state=await page.evaluate(()=>({
        entries:rssCands.map(group=>group[0]),catalog:rssCatalogEnabled(),
        cards:[...document.querySelectorAll('#casual-rail .rss-card')].map(card=>({url:card.dataset.rssUrl,
          photo:card.querySelector('.thumb').classList.contains('has-cover'),hidden:card.hidden,
          title:card.querySelector('.ct').textContent,source:card.querySelector('.src').textContent,
          artwork:!!card.querySelector('.cover-art'),ready:!card.classList.contains('rss-pending'),tabIndex:card.tabIndex})),
        cache:JSON.parse(localStorage.getItem(RSS_PUBLIC_CACHE_KEY)),books:books.length,
      }));
      console.log(engine.name(),'RSS cover metadata:',JSON.stringify(state.entries.map(entry=>entry.photo)));
      await page.locator('#casual-rail').screenshot({path:resolve(artifacts,`${engine.name()}-phone-light.png`)});
      for(let index=0;index<feeds.length;index++){
        assert.equal(state.entries[index].photo,cases[index%cases.length].expected,`Supplied feed photo lost: ${cases[index%cases.length].name}`);
        assert.equal(state.entries[index].contentHtml,'','Discovery must not retain a body');
        assert.equal(state.entries[index].bodyProvided,false);
        assert.equal(state.entries[index].source,feeds[index].name);
        assert.equal(state.entries[index].category,feeds[index].category);
        assert.equal(state.cache[feeds[index].url].entries[0].photo,state.entries[index].photo,'Cache lost the parsed photo');
      }
      assert.equal(state.catalog,false,'Optional catalog unexpectedly activated');
      assert.equal(state.books,0,'Discovery persisted a personal book');
      for(const card of state.cards){
        const index=Number(card.url.split('-').at(-1));
        assert.equal(card.photo,!['no-publisher-photo','broken-image'].includes(cases[index%cases.length].name));
        assert.equal(card.hidden,false);assert.equal(card.ready,true);assert.equal(card.tabIndex,0);
        assert(card.artwork&&card.title&&card.source,'Missing/failed photo must preserve readable artwork and metadata');
      }
      assert(requests.some(request=>request.kind==='image-relay'&&request.url.endsWith('/hotlink.jpg')),'Hotlink was not recovered through the existing image transport');
      assert.equal(requests.filter(request=>request.kind==='article').length,0,'Article body fetched before selection');
      assert.equal(requests.filter(request=>request.kind==='blocked'&&request.url.includes('rss-catalog')).length,0);
      const filtering=await page.evaluate(xml=>{
        const feed=RSS_FEEDS[0],parsed=parseRss(xml,feed);
        const original=books;books=[{id:'already-saved',kind:'article',sourceUrl:parsed[0].url}];
        try{return {accepted:parsed.length,ranked:rssRankRecommendations([parsed.map(rssDiscoveryEntry)],{library:books,positions:{},sources:[feed],now:Date.now()}).flat().length};}
        finally{books=original;}
      },fixture(0).replace('</channel>','<item><title>今日は読書の時間です</title><link>https://stories.test/non-english</link><description>新しい本を読みながらゆっくりと過ごします。</description><enclosure type="image/jpeg" url="https://images.test/other.jpg"/></item><item><title>Coupon codes for a limited deal</title><link>https://stories.test/promo</link><description>Use this code at checkout and save 20% off. Verified codes expire today, shop now.</description><enclosure type="image/jpeg" url="https://images.test/promo.jpg"/></item></channel>'));
      assert.equal(filtering.accepted,1,'Photos must not bypass English/promotion filters');
      assert.equal(filtering.ranked,0,'Saved source must stay outside discovery');
      const geometry=[];
      for(const [name,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,900],['narrow',320,568],['short',844,390]]){
        await page.setViewportSize({width,height});
        for(const dark of [false,true]){
          await page.evaluate(dark=>{document.body.classList.toggle('dark',dark);document.getElementById('casual-rail').scrollLeft=0;},dark);
          const values=await page.locator('#casual-rail .rss-card').evaluateAll(cards=>cards.map(card=>{
            const rect=card.querySelector('.thumb').getBoundingClientRect();return [rect.width,rect.height];}));
          values.forEach(([w,h])=>assert(Math.abs(w/h-.75)<.01,'Photo/fallback changed the shared card footprint'));
          geometry.push({name,dark,values});
          await page.locator('#casual-rail').screenshot({path:resolve(artifacts,`${engine.name()}-${name}-${dark?'dark':'light'}.png`)});
        }
      }
      // The very first selected article resolves its body only now. Preview
      // dismissal continues to save nothing; optional introduction calls abort.
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>{document.body.classList.remove('dark');document.getElementById('casual-rail').scrollLeft=0;});
      await page.locator('#casual-rail .rss-card[data-rss-url="https://stories.test/article-5"]').click();
      await page.waitForFunction(()=>document.getElementById('article-preview').open&&
        document.getElementById('article-preview').dataset.preparing!=='true');
      assert.equal(requests.filter(request=>request.kind==='article').length,1);
      assert.equal(await page.evaluate(()=>books.length),0,'Preview committed before Read');
      await page.evaluate(()=>articlePreviewClose());
      assert.equal(await page.evaluate(()=>books.length),0,'Dismissal persisted the draft');
      writeFileSync(resolve(artifacts,`${engine.name()}-results.json`),JSON.stringify({state,filtering,geometry,requests},null,2));
      console.log(engine.name(),'RSS supplied-photo mapping, cache, failure/artwork, hotlink, filtering and selected-only body regressions passed');
    }finally{await browser.close();}
  }
}finally{server.close();}
