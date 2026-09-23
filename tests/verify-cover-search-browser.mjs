import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const cover=readFileSync(resolve(root,'assets/favicon/icon-512.png'));
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
const openverse={results:[
  {title:'Allowed landscape',url:'https://images.test/allowed.jpg',thumbnail:'https://thumbs.test/allowed.jpg',
    foreign_landing_url:'https://flickr.com/allowed',license:'cc0',provider:'flickr',width:1200,height:800},
  {title:'Attribution required',url:'https://images.test/by.jpg',thumbnail:'https://thumbs.test/by.jpg',
    foreign_landing_url:'https://example.com/by',license:'by',provider:'flickr',width:1200,height:800},
  {title:'Wikimedia art',url:'https://images.test/wikimedia.jpg',thumbnail:'https://thumbs.test/wikimedia.jpg',
    foreign_landing_url:'https://commons.wikimedia.org/wiki/File:Art',license:'pdm',provider:'wikimedia',width:1200,height:800},
  {title:'Second Flickr image',url:'https://images.test/second.jpg',thumbnail:'https://thumbs.test/second.jpg',
    foreign_landing_url:'https://flickr.com/second',license:'cc0',provider:'flickr',width:1200,height:800},
]};
try{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.route('**/*',route=>{
        const url=route.request().url();
        if(url.startsWith(base))return route.continue();
        if(url.startsWith('https://api.openverse.org/v1/images/')){
          const requestUrl=new URL(url);
          assert.equal(requestUrl.searchParams.get('page_size'),'20');
          assert.equal(requestUrl.searchParams.get('license'),'cc0,pdm');
          return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(openverse)});
        }
        if(url.startsWith('https://thumbs.test/') || url.startsWith('https://images.test/'))return route.fulfill({
          headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/png',body:cover});
        return route.abort();
      });
      await page.goto(base);await page.evaluate(()=>homeReady);
      await page.evaluate(async()=>{
        const book={id:'cover-qa',kind:'article',title:'A gentle reading journey',site:'Breeze',
          paras:['A gentle reading journey','English reading grows through attention. '.repeat(30)]};
        await bookPut(book);books=[book];show('home');renderHome();openEditSheet(book);
      });
      await page.locator('#ed-search-cover').click();
      await page.waitForFunction(()=>document.querySelectorAll('.ed-search-result').length===3);
      assert.equal(await page.locator('.ed-search-result').count(),3);
      assert.deepEqual(await page.locator('.ed-search-result span').allTextContents(),[
        'Allowed landscape · flickr','Wikimedia art · wikimedia','Second Flickr image · flickr']);
      await page.locator('.ed-search-result').first().click();
      assert.equal(await page.locator('#ed-covers .ed-search-pick').count(),1);
      await page.locator('#ed-card [data-step="edit"] .sm-btn.primary').click();
      await page.waitForFunction(()=>!document.getElementById('edit-modal').classList.contains('on'));
      const result=await page.evaluate(async()=>{
        const book=(await bookAll()).find(item=>item.id==='cover-qa');
        const blob=await imgGet(book.cover);
        return {cover:book.cover,hasBlob:!!blob?.size,url:book.imgSrc?.[book.cover],source:book.coverSourcePage};
      });
      assert(result.cover.startsWith('cover-qa|cover|'));
      assert.equal(result.hasBlob,true);
      assert.equal(result.url,'https://images.test/allowed.jpg');
      assert.equal(result.source,'https://flickr.com/allowed');
      assert.equal(await page.evaluate(async()=>{
        const book=books.find(item=>item.id==='cover-qa');
        const original=bookPut, previous=book.cover;
        openEditSheet(book);
        selectCoverPhoto({imageUrl:'https://images.test/allowed.jpg',thumbUrl:'https://thumbs.test/allowed.jpg',pageUrl:'https://flickr.com/allowed'});
        document.getElementById('ed-title').value='A title that should not persist';
        try{
          bookPut=async()=>{throw Error('Storage unavailable');};
          await saveEditSheet();
          return book.cover===previous && book.title==='A gentle reading journey' &&
            document.getElementById('edit-modal').classList.contains('on');
        }finally{bookPut=original;closeEditSheet();}
      }),true);
      await page.evaluate(()=>{
        window.coverQaOpens=0;
        importRssEntry=()=>{window.coverQaOpens++;};
        const card=rssCard({title:'A discovery article',url:'https://example.com/new',source:'Source',summary:'A quiet essay'});
        document.getElementById('casual-rail').prepend(card);
      });
      const card=page.locator('#casual-rail .rss-card').first();
      const box=await card.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();
      assert.equal(await page.evaluate(()=>window.coverQaOpens),0);
      await card.click();
      assert.equal(await page.evaluate(()=>window.coverQaOpens),1);
      console.log(engine.name(),'cover search, durable selection and discovery long press passed');
    }finally{await browser.close();}
  }
}finally{server.close();}
