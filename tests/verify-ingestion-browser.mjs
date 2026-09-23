import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
const para='Reading brings people into contact with different ideas. A thoughtful reader can follow an argument, compare the evidence, and discover a different way to understand the world. This ordinary paragraph provides enough meaningful prose to identify the main content of a public article. ';
const html=`<!doctype html><html><head><title>Reading together</title><meta name="author" content="A Writer"><meta property="article:published_time" content="2026-09-22"><style>body{color:red}</style></head><body><nav>Subscribe navigation</nav><article><h1>Reading together</h1><p>${para}<strong>Important words</strong> and <em>gentle emphasis</em>. Read <a href="/reference">the reference</a>.</p><h2>A smaller section</h2><p>${para}</p><ul><li>Short first item</li><li>Short second item</li></ul><blockquote><p>${para}</p></blockquote><figure><img src="https://content.example/photo.png" alt="A book" width="640" height="480"><figcaption>A quiet reading room.</figcaption></figure><pre>const answer = 42;</pre><table><tr><th>Day</th><th>Pages</th></tr><tr><td>Monday</td><td>12</td></tr></table><p>${para}</p><script>window.injected=true</script><a href="javascript:alert(1)">Unsafe</a></article></body></html>`;
const xml=`<rss version="2.0"><channel><title>Public essays</title><item><title>Reading together</title><link>https://content.example/article</link><description><![CDATA[<p>A useful essay.</p>]]></description></item><item><title>Bad URL</title><link>javascript:alert(1)</link></item></channel></rss>`;
try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch();try{
   const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
   await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
   await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(base) || url.startsWith('blob:')) return route.continue();
    if(url==='https://content.example/article')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/html',body:html});
    if(url==='https://content.example/reddit-article')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/html',body:html.replaceAll('Reading together','A Reddit discovery').replaceAll('thoughtful reader','curious reader')});
    if(url==='https://content.example/feed')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/rss+xml',body:xml});
    if(url==='https://www.reddit.com/r/books/.rss')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/atom+xml',body:redditSelf});
    if(url==='https://feeds.example/x.xml')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/rss+xml',body:xFeed});
    if(url==='https://content.example/')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/html',body:'<html><head><link rel="alternate" type="application/rss+xml" href="/feed"></head><body>Feed discovery</body></html>'});
    if(url==='https://content.example/photo.png')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/png',body:readFileSync(resolve(root,'assets/favicon/icon-512.png'))});
    return route.abort();
   });
   await page.goto(base);await page.evaluate(()=>homeReady);

   const parsed=await page.evaluate(html=>parseArticleHtml(html,'https://content.example/article'),html);
   assert(parsed);assert.equal(parsed.author,'A Writer');
   assert(parsed.blocks.some(b=>b.list));assert(parsed.blocks.some(b=>b.caption));assert(parsed.blocks.some(b=>b.r==='code'));assert(parsed.blocks.some(b=>b.table));assert(parsed.blocks.some(b=>b.r==='quote'));
   assert(!JSON.stringify(parsed).includes('javascript:'));
   assert.equal(await page.evaluate(h=>parseArticleHtml(h,'https://x.com/person/status/1'),html),null);
   assert.equal(await page.evaluate(h=>parseArticleHtml(h.replace('<head>','<head><script type="application/ld+json">{"isAccessibleForFree":false}</script>'),'https://content.example/paid'),html),null);
   assert.equal(await page.evaluate(()=>parseArticleHtml('<h1>Sign in</h1>','https://content.example/login')),null);
   assert.equal(await page.evaluate(x=>parseRss(x,{url:'https://content.example/feed',name:'Essays'}).length,xml),1);
   assert.equal(await page.evaluate(async()=> (await discoverFeed('https://content.example/')).url),'https://content.example/feed');
   const atom='<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>A post</title><link rel="alternate" href="https://content.example/article"/><summary>Plain summary</summary></entry></feed>';
   assert.equal(await page.evaluate(x=>parseRss(x,{url:'https://content.example/feed',name:'Atom'})[0].url,atom),'https://content.example/article');
   const redditLink=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A research article</title><link href="https://www.reddit.com/r/science/comments/abc/research/"/><content type="html"><![CDATA[<table><tr><td>submitted by /u/example <a href="https://content.example/reddit-article">[link]</a> <a href="https://www.reddit.com/r/science/comments/abc/research/">[comments]</a></td></tr></table>]]></content></entry></feed>`;
   const redditSelf=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A thoughtful community discussion</title><link href="https://www.reddit.com/r/books/comments/xyz/discussion/"/><content type="html"><![CDATA[<table><tr><td>submitted by /u/example <a href="https://www.reddit.com/r/books/comments/xyz/discussion/">[comments]</a></td></tr></table><div><p>Reading together helped me notice how an author develops a claim over several chapters, and I would like to hear how other readers followed that idea.</p></div>]]></content></entry></feed>`;
   const xFeed=`<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>A note on reading</title><link>https://x.com/example/status/123</link><content:encoded><![CDATA[<p>Reading a long essay with friends helped me understand its main argument. <strong>Careful attention</strong> made the difference.</p><script>window.feedInjected=true</script>]]></content:encoded></item></channel></rss>`;
   const redditLinkEntry=await page.evaluate(xml=>parseRss(xml,{url:'https://www.reddit.com/r/science/.rss',name:'r/science'})[0],redditLink);
   assert.equal(redditLinkEntry.readUrl,'https://content.example/reddit-article');
   const redditSelfEntry=await page.evaluate(xml=>parseRss(xml,{url:'https://www.reddit.com/r/books/.rss',name:'r/books'})[0],redditSelf);
   assert.equal(redditSelfEntry.readUrl,'');
   const xEntry=await page.evaluate(xml=>parseRss(xml,{url:'https://feeds.example/x.xml',name:'X posts'})[0],xFeed);
   assert.equal(xEntry.kind,'x');
   assert.equal(await page.evaluate(async()=> (await discoverFeed('https://www.reddit.com/r/books/')).url),'https://www.reddit.com/r/books/.rss');
   assert.equal(await page.evaluate(async()=> (await discoverFeed('https://feeds.example/x.xml')).url),'https://feeds.example/x.xml');
   assert.equal(await page.evaluate(async()=>{try{await discoverFeed('https://x.com/example');return false;}catch(error){return /RSS/.test(error.message);}}),true);
   assert.equal(await page.evaluate(entry=>parseFeedPost(entry)?.blocks.some(block=>block.marks?.some(mark=>mark.kind==='strong')),xEntry),true);
   assert.equal(await page.evaluate(()=>{try{parseRss('<rss><broken>',{url:'https://a.example',name:'bad'});return false;}catch{return true;}}),true);
   await page.evaluate(async xml=>{
    if(rssLoading)await rssLoading;
    const original=fetchArticleHtml;
    try{fetchArticleHtml=async url=>url.includes('propublica') ? xml : Promise.reject(new Error('broken feed'));
      rssLoadedAt=0; await loadRss(true);
      if(rssCands.length!==RSS_FEEDS.length || rssCands[0].length!==0 || rssCands[1].length!==1) throw new Error('Feed failure was not isolated');
    }finally{fetchArticleHtml=original;}
   },xml);

   await page.evaluate(()=>{window.readShare=[];window.breezeShareInbox={markRead:id=>window.readShare.push(id)};receiveSharedLinks([{id:'shared-id',url:'https://content.example/article',savedAt:'2026-09-23'}]);});
   await page.evaluate(()=>{window.ingestionBookPut=bookPut;bookPut=async()=>{throw new Error('Simulated storage quota failure');};});
   await page.locator('#casual-rail .shared-card').click();
   await page.waitForSelector('.shared-original');
   assert.equal(await page.evaluate(()=>window.readShare.length),0);
   assert.equal(await page.evaluate(()=>sharedLinks.length),1);
   await page.evaluate(()=>{bookPut=window.ingestionBookPut;});
   await page.locator('#casual-rail .shared-card').click();
   await page.waitForFunction(()=>curBook?.sourceUrl==='https://content.example/article');
   await page.waitForFunction(()=>window.readShare.includes('shared-id'));
   assert.equal(await page.evaluate(()=>!!books.find(b=>b.sourceUrl==='https://content.example/article')),true);
   await page.waitForFunction(()=>[...document.querySelectorAll('#rtext img')].some(img=>img.naturalWidth>0));
   assert.equal(await page.locator('#rtext script,#rtext style,#rtext iframe').count(),0);
   assert.equal(await page.locator('#rtext .article-links a').first().getAttribute('href'),'https://content.example/reference');
   assert(await page.locator('#rtext .w[style*="font-weight"]').count()>0);
   const before=await page.evaluate(()=>books.length);await page.evaluate(()=>ingestArticle('https://content.example/article?utm_source=test#fragment'));assert.equal(await page.evaluate(()=>books.length),before);
   await page.locator('#rtext .w').first().click();
   await page.waitForTimeout(200);
   assert(await page.locator('#word-peek').isVisible());
   await page.evaluate(()=>{closePanel();readerScrollTo(0);});
   const point=await page.evaluate(()=>{
    const word=[...document.querySelectorAll('#rtext .w')].find(el=>el.textContent==='thoughtful');
    const r=word.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
   });
   await page.evaluate(p=>{
    window.ingestionTouch=document.elementFromPoint(p.x,p.y);
    ingestionTouch.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:93,pointerType:'touch',isPrimary:true,clientX:p.x,clientY:p.y}));
   },point);
   await page.waitForFunction(()=>sentenceWaitingActive() || sentenceModalOpen());
   await page.evaluate(p=>ingestionTouch.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:93,pointerType:'touch',isPrimary:true,clientX:p.x,clientY:p.y})),point);
   await page.evaluate(()=>{closeSentence();readerScrollTo(500);});
   assert(await page.evaluate(()=>readerScrollTop())>100);
   for(const dark of [false,true]){
    await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.BREEZE_QA_OUTPUT){mkdirSync(process.env.BREEZE_QA_OUTPUT,{recursive:true});await page.screenshot({path:process.env.BREEZE_QA_OUTPUT+'/'+engine.name()+'-article-'+(dark?'dark':'light')+'.png'});}
   }
   await page.evaluate(()=>{show('home');receiveSharedLinks([{id:'failure',url:'https://x.com/a/status/2',savedAt:'2026-09-23'}]);});
   await page.locator('#casual-rail .shared-card').click();
   await page.waitForSelector('.shared-original');assert(!await page.evaluate(()=>window.readShare.includes('failure')));
   assert.equal(await page.locator('.shared-original').getAttribute('href'),'https://x.com/a/status/2');
   await page.evaluate(()=>show('casuals'));
   await page.locator('.feed-discovery summary').click();
   await page.locator('#feed-url').fill('https://content.example/');
   await page.locator('#feed-category').selectOption('culture');
   await page.locator('#feed-add').click();
   await page.waitForFunction(()=>document.getElementById('feed-status').textContent==='추가했어요');
   assert.equal(await page.evaluate(()=>rssSources().length-RSS_FEEDS.length),1);
   assert.equal(await page.evaluate(()=>rssSources().at(-1).category),'culture');
   await page.locator('#feed-sources select').last().selectOption('science');
   assert.equal(await page.evaluate(()=>rssSources().at(-1).category),'science');
   await page.locator('#feed-sources button').click();
   assert.equal(await page.evaluate(()=>rssSources().length-RSS_FEEDS.length),0);
   await page.evaluate(async entry=>importRssEntry(entry,rssCard(entry)),redditLinkEntry);
   await page.waitForFunction(()=>curBook?.sourceUrl==='https://content.example/reddit-article');
   assert.equal(await page.locator('#rdiscovery').getAttribute('href'),redditLinkEntry.url);
   await page.evaluate(async entry=>importRssEntry(entry,rssCard(entry)),redditSelfEntry);
   await page.waitForFunction(url=>curBook?.sourceUrl===url,redditSelfEntry.url);
   assert.equal(await page.evaluate(()=>curBook.contentType),'post');
   assert.equal(await page.locator('#rtext').evaluate(node=>node.textContent.includes('submitted by')),false);
   await page.evaluate(async entry=>importRssEntry(entry,rssCard(entry)),xEntry);
   await page.waitForFunction(url=>curBook?.sourceUrl===url,xEntry.url);
   assert.equal(await page.evaluate(()=>curBook.contentType),'post');
   assert(await page.locator('#rtext .w').count()>10);
   assert.equal(await page.evaluate(()=>window.feedInjected===true),false);
   if(existsSync('/tmp/breeze-ingestion-live/ordinary.txt')){
    const live=readFileSync('/tmp/breeze-ingestion-live/ordinary.txt','utf8');
    const result=await page.evaluate(h=>parseArticleHtml(h,'https://www.paulgraham.com/read.html'),live);
    assert(result);console.log(engine.name(),'live ordinary:',result.title,result.paras.length);
   }
   if(existsSync('/tmp/breeze-ingestion-live/articles.json')){
    for(const row of JSON.parse(readFileSync('/tmp/breeze-ingestion-live/articles.json','utf8'))){
      const file='/tmp/breeze-ingestion-live/'+row.name+'-article.txt'; if(!existsSync(file))continue;
      const result=await page.evaluate(({html,url})=>parseArticleHtml(html,url),{html:readFileSync(file,'utf8'),url:row.url});
      console.log(engine.name(),row.name,'live article:',result ? {title:result.title,paras:result.paras.length,images:result.blocks.filter(b=>b.r==='img').length} : 'safe fallback');
    }
   }
   for(const name of ['medium','substack','reddit','ordinary']){
    const file=`/tmp/breeze-ingestion-live/${name}-feed.txt`;if(!existsSync(file))continue;
    const entries=await page.evaluate(({xml,name})=>parseRss(xml,{url:'https://example.com/feed',name}),{xml:readFileSync(file,'utf8'),name});
    assert(entries.length>0);console.log(engine.name(),name,'live feed entries:',entries.length);
   }
   if(process.env.BREEZE_LIVE_INGESTION && engine.name()==='chromium'){
    await page.unroute('**/*');
    const urls=['https://www.paulgraham.com/read.html','https://www.oneusefulthing.org/p/the-overhang','https://medium.com/blog/updating-our-rules-june-2023-62edea66ffa4'];
    for(const url of urls){
      const result=await page.evaluate(async url=>{try{const book=await ingestArticle(url);return {url,title:book.title,paragraphs:book.paras.length,reader:curBook?.id===book.id};}catch(error){return {url,fallback:true,message:error.message};}},url);
      console.log('LIVE NETWORK',JSON.stringify(result));
    }
   }
   await page.evaluate(async()=>{
    if(rssLoading)await rssLoading;
    rssCands=[[{title:'Science story',source:'Science',category:'science',url:'https://category.example/science',summary:'Science reading'}],
      [{title:'Culture story',source:'Culture',category:'culture',url:'https://category.example/culture',summary:'Culture reading'}]];
    rssLoadedAt=Date.now();show('home');
   });
   assert.equal(await page.evaluate(()=>rssSources().filter(feed=>feed.category==='science'&&/medium.com|reddit.com/.test(feed.url)).length),2);
   const chips=page.locator('#casuals .feed-categories');
   await chips.locator('[data-category="science"]').click();
   await page.waitForFunction(()=>document.querySelectorAll('#casual-rail .rss-card').length===1);
   assert.equal(await page.locator('#casual-rail .rss-card .ct').textContent(),'Science story');
   assert.equal(await chips.locator('[data-category="science"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>document.querySelector('#casual-rail .shared-card')!==null),true);
   await chips.locator('[data-category="business"]').click();
   await page.waitForFunction(()=>!document.getElementById('home-feed-empty').hidden);
   assert.equal(await page.locator('#casual-rail .rss-card').count(),0);
   await page.evaluate(()=>{
    document.querySelector('#casuals [data-category="science"]').click();
    document.querySelector('#casuals [data-category="culture"]').click();
   });
   await page.waitForFunction(()=>document.querySelector('#casual-rail .rss-card .ct')?.textContent==='Culture story');
   assert.equal(await page.locator('#casual-rail .rss-card').count(),1);
   for(const dark of [false,true]){
    await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.BREEZE_QA_OUTPUT)await page.screenshot({path:process.env.BREEZE_QA_OUTPUT+'/'+engine.name()+'-categories-'+(dark?'dark':'light')+'.png'});
   }
   await page.reload();await page.evaluate(()=>homeReady);
   assert.equal(await page.locator('#casuals [data-category="culture"]').getAttribute('aria-pressed'),'true');
   console.log(engine.name(),'ingestion, category filtering/persistence, persisted share handoff, dedupe, fallback, semantics and mobile Reader passed');
  }finally{await browser.close();}
 }
}finally{server.close();}
