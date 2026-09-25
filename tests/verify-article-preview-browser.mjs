import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
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
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      for(const [width,height] of [[320,568],[390,844],[820,1024],[1280,800]]){
        const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
        await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
        let calls=0;
        await page.route('**/*',route=>{
          const url=route.request().url();
          if(url.startsWith(base))return route.continue();
          if(url.includes('/functions/v1/article-preview')){
            calls++;
            const body=JSON.parse(route.request().postData());
            return body.title==='Second article' ? route.abort() : route.fulfill({contentType:'application/json',body:JSON.stringify({hookTitle:'이 글이 궁금한 이유',translatedTitle:'첫 번째 기사',teaser:'첫 문단의 핵심을 소개합니다. 읽을 만한 이유를 차분히 짚습니다.'})});
          }
          return route.abort();
        });
        await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await page.evaluate(()=>homeReady);
        await page.evaluate(()=>{
          const paras=title=>[title,...Array.from({length:6},(_,i)=>`This is paragraph ${i+1} of ${title}. It has enough detail to preview the article without copying all of the content. The rest remains in Reader.`)];
          books=[{id:'preview-one',title:'First article',kind:'article',site:'Example',sourceUrl:'https://example.com/one',paras:paras('First article'),addedAt:2},
            {id:'preview-two',title:'Second article',kind:'article',site:'Example',sourceUrl:'https://example.com/two',paras:paras('Second article'),addedAt:1}];
          positions={};renderHome();renderCasualLibrary();show('casuals');
        });
        await page.locator('#casual-grid .casual').filter({hasText:'First article'}).first().click();
        await page.waitForFunction(()=>document.querySelector('#article-preview').open);
        await page.waitForFunction(()=>!document.querySelector('#ap-hook').hidden);
        await page.locator('#article-preview').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
        assert.equal(await page.locator('.ap-excerpt p').count(),1);
        const box=await page.locator('#article-preview').boundingBox();
        assert(box.x>=-1 && box.x+box.width<=width+1 && box.height<=height,'preview fits viewport');
        assert(Math.abs(box.x+(box.width/2)-width/2)<2 && Math.abs(box.y+(box.height/2)-height/2)<2,`preview is centered at ${width}x${height}: ${JSON.stringify(box)}`);
        assert.equal(await page.locator('.ap-scroll').evaluate(node=>node.scrollHeight<=node.clientHeight+2),true,'preview has no inner scroll');
        assert.equal(calls,1);
        await page.locator('.ap-close').click();
        await page.locator('#casual-grid .casual').filter({hasText:'First article'}).first().click();
        await page.waitForFunction(()=>!document.querySelector('#ap-hook').hidden);
        assert.equal(calls,1,'cached metadata avoids another AI request');
        await page.locator('.ap-start').click();
        await page.waitForFunction(()=>document.querySelector('#v-read').classList.contains('on'));
        assert((await page.evaluate(()=>positions['preview-one']?.t))>0);
        await page.evaluate(()=>{renderHome();show('home');});
        await page.locator('#home-casual-rail .casual').filter({hasText:'First article'}).first().click();
        assert.equal(await page.locator('#article-preview').evaluate(node=>node.open),false,'started article skips preview');
        assert.equal(await page.locator('#v-read').isVisible(),true);
        await page.evaluate(()=>show('casuals'));
        await page.locator('#casual-grid .casual').filter({hasText:'Second article'}).first().click();
        await page.waitForFunction(()=>document.querySelector('#article-preview').open);
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#ap-hook').isVisible(),false,'network failure retains source-only preview');
        assert.equal(await page.locator('.ap-title').textContent(),'Second article');
        await page.locator('.ap-start').click();
        await page.waitForFunction(()=>document.querySelector('#v-read').classList.contains('on'));
        assert.equal(await page.locator('#rtitle').textContent(),'Second article');
        if(width===390){
          await page.evaluate(()=>{
            show('home');
            const url='https://example.com/new-from-feed';
            const blocks=[{r:'p',t:'A fresh article has enough source text to introduce the subject and let readers decide whether to continue. It has several more paragraphs in the original article.'}];
            rssPreparedArticles.set(articleUrlKey(url),{title:'New from feed',site:'Example',url,cover:'',blocks,...articleAssemble('New from feed',blocks)});
            const card=rssCard({title:'New from feed',source:'Example',url,photo:''});card.hidden=false;
            document.getElementById('casual-rail').prepend(card);
            card.click();
          });
          await page.waitForFunction(()=>document.querySelector('#article-preview').open);
          assert.equal(await page.locator('.ap-title').textContent(),'New from feed');
          assert.equal(await page.locator('#v-read').isVisible(),false,'new feed selection stays in Preview');
          const latest=await page.evaluate(async()=>{
            articlePreviewClose();
            const prepare=(name)=>{
              const url=`https://example.com/${name}`;
              const blocks=[{r:'p',t:`${name} has enough original English text for a readable article preview and a durable saved copy. Readers can continue in the full Reader.`}];
              return {url,options:{preview:true,preparedArticle:{title:name,site:'Example',url,cover:'',blocks,...articleAssemble(name,blocks)}}};
            };
            const first=prepare('Race first'),second=prepare('Race second');
            const result=await Promise.race([
              Promise.all([ingestArticle(first.url,first.options),ingestArticle(second.url,second.options)]).then(()=>'done'),
              new Promise(resolve=>setTimeout(()=>resolve('timeout'),10000))
            ]);
            return {result,selected:articlePreviewBook?.title,saved:books.filter(book=>book.title.startsWith('Race ')).length};
          });
          assert.deepEqual(latest,{result:'done',selected:'Race second',saved:2},'concurrent imports persist both articles and show only the latest selection');
        }
        await page.close();
      }
      console.log(engine.name(),'article preview, cache, fallback, Reader and four sizes passed');
    }finally{await browser.close();}
  }
}finally{server.close();}
