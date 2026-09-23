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
        rssCardPhoto=async()=>true;
        const home=document.getElementById('casual-rail');
        const discover=document.getElementById('casual-discover-rail');
        await Promise.all([renderRssCards(home,false),renderRssCards(discover,false,document.getElementById('casual-discover-empty'))]);
      });
      assert.equal(await page.locator('#casual-rail .rss-card').count(),1,`${engine.name()} Home RSS missing`);
      assert.equal(await page.locator('#casual-discover-rail .rss-card').count(),1,`${engine.name()} Discover RSS missing`);
      assert.equal(await page.locator('#casual-discover-empty').isVisible(),false);
      await page.evaluate(()=>renderRssCards(document.getElementById('casual-discover-rail'),false,document.getElementById('casual-discover-empty')));
      assert.equal(await page.locator('#casual-discover-empty').isVisible(),false,'Cached rail showed empty message');
      await page.evaluate(()=>show('casuals'));
      const widths=await page.locator('#casual-discover-rail .rss-card').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().width));
      assert.equal(widths.length,1);
      assert.ok(widths[0]>=130&&widths[0]<=160,`Discover card width ${widths[0]}`);
    }finally{await browser.close();}
  }
}finally{server.close();}
console.log('Casual Home and Discover rails verified in Chromium and WebKit');
