import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {VERSION} from '../server/rss-quality/jev.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
let testMode='off';
const server=createServer((req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');const bytes=readFileSync(path);res.end(testMode==='active' && path.endsWith('/scripts/importers/rss.js')?bytes.toString().replace("RSS_QUALITY_MODE = 'off'","RSS_QUALITY_MODE = 'active'"):bytes);}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
let phase='pending',calls=0;
let refreshedEntry=null;
const entry={url:'https://example.com/approved',title:'Why coastal cities sink',source:'Dexerto · Entertainment',feedUrl:'https://www.dexerto.com/feed/category/entertainment/',category:'entertainment',photo:base+'assets/favicon/icon-512.png',
  quality:{status:'approved',version:VERSION,checkedAt:Date.now(),key:'test-key'}};
const engines=process.env.BROWSER==='webkit'?[webkit]:process.env.BROWSER==='chromium'?[chromium]:[chromium,webkit];
try{for(const engine of engines){
  calls=0;phase='pending';
  const browser=await engine.launch(engine===chromium && process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{});
  try{
    const page=await browser.newPage({serviceWorkers:'block'});
    await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
      const original=window.setTimeout;window.setTimeout=(fn,delay,...args)=>original(fn,delay===20000?1000:delay,...args);
    });
    await page.route('**/*',route=>{
      const url=route.request().url();if(url.startsWith(base))return route.continue();
      if(url.includes('/functions/v1/rss-quality?feed=')){
        calls++;if(phase==='outage')return route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*'},body:'{}'});
        const first=new URL(url).searchParams.get('feed')==='0';
        const entries=first && phase==='changed'?[refreshedEntry]:first && phase==='approved'?[entry,{...entry,url:'https://example.com/coupon',quality:{...entry.quality,status:'rejected'}}]:first && phase==='candidate'?[{...entry,quality:{...entry.quality,status:'uncertain',eligibility:'candidate'}}]:[];
        return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({version:VERSION,entries,pending:phase==='pending'})});
      }
      return route.abort();
    });
    testMode='off';await page.goto(base);await page.evaluate(()=>homeReady);await page.waitForFunction(()=>!rssLoading);
    assert.equal(calls,0,'default legacy mode never calls quality endpoint');
    testMode='active';await page.reload();await page.evaluate(()=>homeReady);await page.waitForFunction(()=>!rssLoading);
    assert.equal(await page.locator('#casual-rail .rss-card').count(),0);
    assert.match(await page.locator('#home-feed-empty').textContent(),/확인/);
    // The delayed poll must also repaint Home after its first render unsubscribed.
    phase='approved';
    await page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card:not([hidden])').length===1);
    await page.waitForFunction(()=>document.querySelector('#casual-rail .rss-card:not([hidden]) .thumb.has-cover'));
    assert.equal(await page.locator('#casual-rail .rss-card').getAttribute('data-rss-url'),entry.url);
    const before=await page.locator('#casual-rail .rss-card').evaluate(node=>{node.dataset.testIdentity='retained';return node.querySelector('img').naturalWidth;});assert.ok(before>0);
    phase='outage';await page.evaluate(async()=>{await loadRss(true);refreshFeedRails();});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#casual-rail .rss-card').getAttribute('data-test-identity'),'retained');
    const proof='/tmp/breeze-rss-quality-proof';mkdirSync(proof,{recursive:true});
    for(const [name,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1280,900],['short',844,390]]){
      await page.setViewportSize({width,height});
      for(const dark of [false,true]){
        await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
        assert.equal(await page.locator('#casual-rail .rss-card').count(),1);
        assert.ok(await page.locator('#casual-rail .rss-card').isVisible());
        await page.screenshot({path:`${proof}/${engine.name()}-${name}-${dark?'dark':'light'}.png`});
      }
    }
    // Same discovery URL, new content/import target: the real onclick must use
    // the refreshed entry and its title/accessible name, not the retained closure.
    phase='changed';refreshedEntry={...entry,readUrl:'https://example.com/new-target',title:'Refreshed title',quality:{...entry.quality,key:'new-key'}};
    await page.evaluate(()=>{globalThis.clickedEntry=null;importRssEntry=async entry=>{globalThis.clickedEntry=entry;};});
    await page.evaluate(async()=>{await loadRss(true);refreshFeedRails();});
    await page.waitForFunction(()=>document.querySelector('#casual-rail .rss-card .ct')?.textContent==='Refreshed title');
    await page.locator('#casual-rail .rss-card').click();
    assert.deepEqual(await page.evaluate(()=>({key:globalThis.clickedEntry.quality.key,readUrl:globalThis.clickedEntry.readUrl,title:globalThis.clickedEntry.title})),
      {key:'new-key',readUrl:'https://example.com/new-target',title:'Refreshed title'});
    assert.equal(await page.locator('#casual-rail .rss-card').count(),1);
    assert.equal(await page.locator('#casual-rail .rss-card').getAttribute('data-test-identity'),null);
    // Authoritative revocation removes the changed card; no old fallback returns.
    phase='revoked';await page.evaluate(async()=>{await loadRss(true);refreshFeedRails();});
    await page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card').length===0);
    // Approved but saved articles disappear through the existing local exclusion.
    phase='approved';await page.evaluate(url=>{books.push({id:'quality-saved',format:'txt',sourceUrl:url,title:'Saved',paragraphs:[]});rssLoadedAt=0;},entry.url);
    await page.evaluate(async()=>{await loadRss(true);refreshFeedRails();});
    await page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card').length===0);
    phase='pending';await page.evaluate(async()=>{books=[];rssCands=[];await loadRss(true);refreshFeedRails();});
    await page.waitForFunction(()=>!rssLoading);
    assert.equal(await page.locator('#casual-rail .rss-card').count(),0);
    phase='candidate';await page.evaluate(async()=>{await loadRss(true);refreshFeedRails();});
    await page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card:not([hidden])').length===1);
    assert.equal(await page.evaluate(()=>rssCands.flat()[0].quality.status),'uncertain');
    assert.ok(calls<150,'client polling remains bounded during this scenario');
    await browser.close();console.log(`${engine.name()}: RSS pending/approved/rejected/outage/saved states and eight viewport/theme checks passed`);
  }finally{await browser.close();}
}}finally{server.close();}

