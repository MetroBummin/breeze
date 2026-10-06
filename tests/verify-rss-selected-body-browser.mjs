/* Actual Readability, RSS parsing and Preview retry UI; every remote request is
   blocked. Supplied public feed fixtures only, with no AI or persistence. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const server=createServer((req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/config.js'){res.setHeader('Content-Type','text/javascript');return res.end("window.BREEZE_CONFIG={RSS_CATALOG:false,SB_URL:'https://relay.fixture',SB_KEY:'synthetic-public-key'};");}
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+'/'))throw Error();
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
const prose='<p>'+('Reading lets people compare evidence and discover different ways to understand their world. A thoughtful reader follows the argument and checks its conclusions. '.repeat(12))+'</p>';
try{
  for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
    const browser=await engine.launch(engine===chromium&&process.env.BREEZE_QA_CHROMIUM_EXECUTABLE?{executablePath:process.env.BREEZE_QA_CHROMIUM_EXECUTABLE}:{});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.route('**/*',r=>r.request().url().startsWith(base)||r.request().url().startsWith('blob:')?r.continue():r.abort());
      await page.goto(base);await page.evaluate(async()=>{await homeReady;if(rssLoading)await rssLoading;});
      const result=await page.evaluate(async prose=>{
        const feed={name:'Public publisher',url:'https://publisher.example/feed',category:'general'};
        const url='https://publisher.example/article';
        const xml=`<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>A public reading article</title><link>${url}</link><content:encoded><![CDATA[${prose}]]></content:encoded></item></channel></rss>`;
        const original=fetchArticleHtml;let requests=0;
        try{
          fetchArticleHtml=async target=>{requests++;if(target!==feed.url)throw Error('Original unavailable');return xml;};
          const [{contentHtml,...metadata}]=(await rssFeedEntries(feed,true)).entries;
          const selected=await rssResolveSelectedEntry({...metadata,contentHtml});
          const before=books.length;
          const book=await ingestArticle(url,{...selected,preview:true,present:false,deferSave:true});
          return {metadataBody:contentHtml,selectedBody:!!selected.contentHtml,paras:book.paras.length,requests,persisted:books.length-before};
        }finally{fetchArticleHtml=original;}
      },prose);
      assert.equal(result.metadataBody,'');assert.equal(result.selectedBody,true);assert(result.paras>1);assert.equal(result.requests,1);assert.equal(result.persisted,0);
      for(const theme of ['light','dark']){
        await page.evaluate(async({prose,theme})=>{
          darkMode=theme==='dark';applyDark();
          if(document.body.classList.contains('dark')!==(theme==='dark'))throw new Error('Reader theme did not apply');
          rssPublicFeedJobs.clear();
          articlePreviewMetadata=async()=>({meta:null,reason:'source'});
          const url='https://medium.com/@writer/public-012345abcdef';
          const entry={title:'A public reading article',source:'Medium · Business',url,feedSourceUrl:'https://medium.com/feed/tag/business',feedUrl:'https://medium.com/feed/tag/business',photo:'/assets/favicon/icon-512.png',bodyProvided:false,contentHtml:''};
          window.selectedBodyOwnerCalls=0;
          fetchArticleHtml=async target=>{
            if(target==='https://medium.com/feed/@writer'){
              window.selectedBodyOwnerCalls++;
              if(window.selectedBodyOwnerCalls===1)throw Error('Transient owner transport failure');
              return `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>A public reading article</title><link>${url}</link><content:encoded><![CDATA[${prose}]]></content:encoded></item></channel></rss>`;
            }
            throw Error('Original unavailable');
          };
          const card=document.createElement('article');card.className='rss-card';card.dataset.rssUrl=url;
          await importRssEntry(entry,card);
        },{prose,theme});
        assert.equal(await page.locator('#article-preview').getAttribute('data-metadata-reason'),'preparing_failed');
        assert.equal(await page.locator('#article-preview .ap-start').innerText(),'다시 시도');
        await page.locator('#article-preview .ap-start').click();
        await page.waitForFunction(()=>articlePreviewDialog.dataset.preparing==='false'&&articlePreviewBook.paras.length>1);
        assert.equal(await page.evaluate(()=>window.selectedBodyOwnerCalls),2);
        assert.equal(await page.locator('#article-preview .ap-start').innerText(),'읽기 시작');
        await page.evaluate(()=>articlePreviewClose());
      }
      const restricted=await page.evaluate(prose=>parseFeedArticle({title:'Restricted preview',url:'https://publisher.example/restricted',bodyProvided:true,contentHtml:prose+'<p>Subscribe to read</p>'}),prose);
      assert.equal(restricted,null);
      console.log(engine.name()+': supplied-body Readability recovery, no save, real Preview retry in light/dark, restricted preview refusal passed');
    }finally{await browser.close();}
  }
}finally{await new Promise(done=>server.close(done));}
