import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='https://breeze.test/';
const post='https://x.com/writer/status/123456789';
const threads='https://www.threads.com/@writer/post/AbC_123';
const body='A quiet reading session.\nA second line with a new thought.\nThe final sentence belongs to this post.';
const ld=(url,text=body,extra={})=>'<link rel="canonical" href="'+url+'"><script type="application/ld+json">'+JSON.stringify({'@type':'SocialMediaPosting',url,articleBody:text,author:{name:'Writer'},datePublished:'2026-09-24',...extra})+'</script>';
const embed=(id='123456789',text='A useful short post.<br>A second line. <a href="https://example.com/essay">A source</a>.')=>({url:`https://twitter.com/writer/status/${id}`,html:`<blockquote class="twitter-tweet"><p lang="en">${text}</p>— Writer <a href="https://twitter.com/writer/status/${id}">September 24, 2026</a></blockquote><script>window.evil=true</script>`,author_name:'Writer'});
let passed=0;
for(const engine of (process.env.BREEZE_TEST_BROWSER==='chromium'?[chromium]:[chromium,webkit])){
 const browser=await engine.launch(engine===chromium&&process.env.BREEZE_CHROMIUM_PATH?{executablePath:process.env.BREEZE_CHROMIUM_PATH,args:['--no-sandbox']}:{});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1024},serviceWorkers:'block'});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  const counts=new Map();let behavior='embed';let delay=0;
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin==='https://breeze.test'){
    const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    const path=resolve(root,name);
    if(!path.startsWith(root)||name.startsWith('.')||name.includes('node_modules'))return route.abort();
    try{return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream',body:readFileSync(path)});}catch{return route.fulfill({status:404});}
   }
   if(url.pathname==='/functions/v1/article'){
    const source=url.searchParams.get('url'),mode=url.searchParams.get('as');counts.set(mode||'html',(counts.get(mode||'html')||0)+1);
    if(delay)await new Promise(r=>setTimeout(r,delay));
    if(mode==='image')return route.abort();
    if(behavior==='429')return route.fulfill({status:429,body:'{}'});
    if(behavior==='403')return route.fulfill({status:403,body:'{}'});
    if(behavior==='broken')return route.fulfill({contentType:'application/json',body:'not json'});
    if(behavior==='no-body')return route.fulfill({contentType:'application/json',body:JSON.stringify({url:source,html:'<h1>Sign in</h1>'})});
    if(mode==='x-oembed')return route.fulfill({contentType:'application/json',body:JSON.stringify(embed(new URL(source).pathname.match(/status\/(\d+)/)?.[1]))});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({url:source,html:ld(source)})});
   }
   return route.abort();
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});await page.evaluate(async()=>{await homeReady;if(rssLoading)await rssLoading;});
  async function check(name,fn){await fn();passed++;console.log('PASS',engine.name(),name);}
  const parse=(html,url)=>page.evaluate(({html,url})=>{try{return {parsed:parseSocialHtml(html,url)};}catch(e){return {code:e.code};}},{html,url});
  await check('canonical X aliases/suffixes/tracking share one identity',async()=>{
   const keys=await page.evaluate(()=>['https://x.com/a/status/123456789?s=20','https://mobile.twitter.com/b/status/123456789/photo/1','https://x.com/i/web/status/123456789'].map(articleUrlKey));assert.equal(new Set(keys).size,1);
  });
  await check('Threads .net and .com identity aliases',async()=>{assert.equal(await page.evaluate(()=>articleUrlKey('https://www.threads.net/@a/post/AbC_123?xmt=A')===articleUrlKey('https://threads.com/@a/post/AbC_123')),true);});
  await check('exact social hostname/credentials/profile classification',async()=>{
   const result=await page.evaluate(()=>['https://x.com.evil.test/a/status/1','https://evil.x.com/a/status/1','https://x.com/author','https://user:pw@x.com/a/status/1','https://x.com:8443/a/status/1'].map(v=>socialUrlInfo(v)?.kind||'generic'));
   assert.deepEqual(result,['generic','generic','unsupported','unsupported','unsupported']);
  });
  for(const url of [post,threads])await check('short social body and newline order '+url,async()=>{const r=await parse(ld(url),url);assert.equal(r.parsed.blocks.length,3);assert.equal(r.parsed.blocks[1].t,'A second line with a new thought.');assert.equal(r.parsed.social.scope,'single-post');});
  await check('unrelated replies and recommendations never become root post',async()=>{
   const html=ld(threads,body,{comment:{'@type':'SocialMediaPosting',url:threads+'/reply',articleBody:'Unrelated reply'},sharedContent:{text:'Quoted post'},hasPart:[{text:'Unverified continuation'}]});
   const r=await parse(html,threads);assert(!JSON.stringify(r).includes('Unrelated reply'));assert(!JSON.stringify(r).includes('Unverified continuation'));
  });
  await check('mismatched canonical rejected',async()=>{assert.equal((await parse(ld(post),threads)).code,'social_unavailable');});
  await check('matching ID but no body rejects OG description',async()=>{assert.equal((await parse(ld(post,undefined).replace('articleBody','description'),post)).code,'social_unavailable');});
  await check('paywall declaration rejected',async()=>{assert.equal((await parse(ld(post,body,{isAccessibleForFree:false}),post)).code,'social_restricted');});
  for(const text of ['A post that stops here…','A long beginning. Show more','A beginning... https://t.co/ABC'])await check('truncation not saved '+text,async()=>{assert.equal((await parse(ld(post,text),post)).code,'social_incomplete');});
  await check('JSON-LD graph exact target selected, no feed text',async()=>{
   const r=await parse('<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'SocialMediaPosting',url:'https://x.com/other/status/4',articleBody:'Not ours'},{'@type':'SocialMediaPosting',url:post,text:body}]})+'</script>',post);assert.equal(r.parsed.blocks[0].t,'A quiet reading session.');
  });
  await check('malformed and excessive HTML fail safely',async()=>{assert.equal((await parse('<script type="application/ld+json">{bad}</script>',post)).code,'social_unavailable');assert.equal((await parse('x'.repeat(3000001),post)).code,'social_oversized');});
  await check('long X Article requires actual articleBody and retains newlines',async()=>{
   const url='https://x.com/i/article/9999';const r=await parse(ld(url,body.repeat(8),{'@type':'Article',headline:'The article'}),url);assert.equal(r.parsed.social.scope,'article');assert.equal((await parse(ld(url,'Tiny excerpt',{'@type':'Article'}),url)).code,'social_incomplete');
  });
  await check('structured media URLs safe and image order retained',async()=>{
   const r=await parse(ld(threads,body,{image:['https://cdn.example/one.jpg','javascript:alert(1)','https://cdn.example/two.jpg']}),threads);assert.deepEqual(r.parsed.blocks.filter(b=>b.r==='img').map(b=>b.t),['https://cdn.example/one.jpg','https://cdn.example/two.jpg']);
  });
  await check('X oEmbed keeps line breaks/link offsets and discards script',async()=>{
   const r=await page.evaluate(({data,url})=>parseSocialOembed(data,url),{data:embed(),url:post});assert.equal(r.blocks.length,2);assert(r.blocks[1].marks.some(m=>m.href==='https://example.com/essay'));assert(!JSON.stringify(r).includes('window.evil'));assert.equal(await page.evaluate(()=>window.evil),undefined);
  });
  await check('nested quote does not join requested text',async()=>{
   const data=embed('123456789','Main post.<blockquote class="twitter-tweet"><p>Other person</p></blockquote>');
   const r=await page.evaluate(({data,url})=>{try{return parseSocialOembed(data,url);}catch(e){return {code:e.code};}},{data,url:post});assert(!JSON.stringify(r).includes('Other person'));
  });
  await check('oEmbed target mismatch rejected',async()=>{assert.equal(await page.evaluate(({data,url})=>{try{parseSocialOembed(data,url);return '';}catch(e){return e.code;}},{data:embed('44'),url:post}),'social_unavailable');});
  await check('native DOM post permalink scopes body not comments',async()=>{
   const html=`<article data-testid="tweet"><a href="${post}"><time datetime="2026-09-24">date</time></a><div data-testid="tweetText">First line<br>Second <strong>important</strong> line.</div><div data-testid="tweetText">Other user reply</div></article>`;
   const r=await parse(html,post);assert.equal(r.parsed.blocks.length,2);assert(!JSON.stringify(r).includes('Other user reply'));
  });
  await check('nested quoted permalink cannot misattribute outer body',async()=>{
 const html=`<article><div data-testid="tweetText">Not the requested author's post.</div><article><a href="${post}"><time datetime="2026-09-24">date</time></a><div data-testid="tweetText">Requested post only.</div></article></article>`;
 const r=await parse(html,post);assert.equal(r.parsed.blocks[0].t,'Requested post only.');assert(!JSON.stringify(r).includes('Not the requested'));
});
  await check('80 concurrent alias imports: one fetch, one persisted book, latest opens',async()=>{
   counts.clear();delay=60;
   const result=await page.evaluate(async()=>{
    const urls=Array.from({length:80},(_,i)=>i%2?'https://mobile.twitter.com/writer/status/88888/photo/1':'https://x.com/writer/status/88888?s=20');
    const items=await Promise.all(urls.map(url=>ingestArticle(url)));
    return {ids:new Set(items.map(b=>b.id)).size,count:books.filter(b=>b.social?.id==='88888').length,persistent:(await bookAll()).filter(b=>b.social?.id==='88888').length,reader:curBook.social.id,jobs:articleJobs.size};
   });delay=0;assert.deepEqual(result,{ids:1,count:1,persistent:1,reader:'88888',jobs:0});assert.equal(counts.get('x-oembed'),1);
  });
  await check('social Preview saves only after Read is pressed',async()=>{
   const url='https://x.com/writer/status/76666';
   const before=await page.evaluate(async()=>({memory:books.length,stored:(await bookAll()).length}));
   await page.evaluate(async url=>{const draft=await ingestArticle(url,{preview:true,deferSave:true,present:false});openCasualPreviewOrReader(draft);},url);
   assert.equal(await page.locator('#article-preview').evaluate(dialog=>dialog.open),true);
   assert.deepEqual(await page.evaluate(async()=>({memory:books.length,stored:(await bookAll()).length})),before);
   await page.keyboard.press('Escape');
   assert.deepEqual(await page.evaluate(async()=>({memory:books.length,stored:(await bookAll()).length})),before);
   await page.evaluate(async url=>{const draft=await ingestArticle(url,{preview:true,deferSave:true,present:false});openCasualPreviewOrReader(draft);},url);
   await page.click('.ap-start');
   await page.waitForFunction(()=>curBook?.social?.id==='76666'&&!articlePreviewDialog.open);
   assert.deepEqual(await page.evaluate(async()=>({memory:books.length,stored:(await bookAll()).length})),{memory:before.memory+1,stored:before.stored+1});
  });
  for(const mode of ['429','403','broken','no-body'])await check('no bad book persisted / retry allowed: '+mode,async()=>{
   behavior=mode;counts.clear();
   const result=await page.evaluate(async()=>{const before=books.length;let code;try{await ingestArticle('https://x.com/writer/status/77777');}catch(e){code=e.code;}return {code,delta:books.length-before,jobs:articleJobs.size};});
   assert.equal(result.delta,0);assert.equal(result.jobs,0);assert(result.code.startsWith('social_'));if(mode==='429'||mode==='403')assert.equal(counts.get('html')||0,0);
  });
  behavior='embed';
  await check('retry after failure succeeds through real IndexedDB and Reader',async()=>{const r=await page.evaluate(async()=>{const b=await ingestArticle('https://x.com/writer/status/77777');return {saved:!!(await bookAll()).find(x=>x.id===b.id),source:b.social.platform};});assert.deepEqual(r,{saved:true,source:'x'});});
  await check('Threads HTML relay → local post → Reader',async()=>{const r=await page.evaluate(async url=>{const b=await ingestArticle(url);return {scope:b.social.scope,platform:b.social.platform,lines:b.paras.length};},threads);assert.deepEqual(r,{scope:'single-post',platform:'threads',lines:4});});
  await check('read URL alias reuses saved record after reload',async()=>{
   await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(async()=>{await homeReady;if(rssLoading)await rssLoading;});counts.clear();
   const id=await page.evaluate(async()=>{const b=await ingestArticle('https://twitter.com/writer/status/88888?s=46');return b.social.id;});assert.equal(id,'88888');assert.equal(counts.get('x-oembed')||0,0);
  });
  await check('distinct post concurrency capped with deterministic busy and no stale navigation',async()=>{
   delay=80;
   const result=await page.evaluate(async()=>{const output=await Promise.all(Array.from({length:30},(_,i)=>ingestArticle('https://x.com/writer/status/'+(90000+i)).then(()=>true,e=>e.code)));return {ok:output.filter(v=>v===true).length,busy:output.filter(v=>v==='social_busy').length,jobs:articleJobs.size,active:socialImportsActive};});
   delay=0;assert.equal(result.ok,4);assert.equal(result.busy,26);assert.equal(result.jobs,0);assert.equal(result.active,0);
  });
  await check('bounded body stream cancels without reading remaining bytes',async()=>{
   const r=await page.evaluate(async()=>{let cancelled=false,count=0;const stream=new ReadableStream({pull(c){count++;c.enqueue(new Uint8Array(100));},cancel(){cancelled=true;}});try{await socialResponseText(new Response(stream),new AbortController().signal,150);}catch(e){return {code:e.code,cancelled,count};}});assert.equal(r.code,'social_oversized');assert.equal(r.cancelled,true);assert(r.count<5);
  });
  await check('body wait cancelled by deadline',async()=>{assert.equal(await page.evaluate(async()=>{const c=new AbortController();const r=new Response(new ReadableStream({start(){}}));setTimeout(()=>c.abort(),20);try{await socialResponseText(r,c.signal);}catch(e){return e.code;}}),'social_timeout');});
  await check('500 mixed malformed/valid/unsafe payloads remain isolated',async()=>{
   const r=await page.evaluate(({html,url})=>{let valid=0,rejected=0;for(let i=0;i<500;i++){
    try{const result=parseSocialHtml(i%2?html:'<meta property="og:description" content="not body">',url);if(result.blocks.length===3)valid++;}catch{rejected++;}
   }return {valid,rejected,jobs:articleJobs.size,active:socialImportsActive};},{html:ld(threads),url:threads});assert.deepEqual(r,{valid:250,rejected:250,jobs:0,active:0});
  });
  let live;try{live=JSON.parse(readFileSync('/tmp/social-live.json','utf8'));}catch{}
  if(live?.status===200)await check('single live official X response parses as requested post',async()=>{
   const r=await page.evaluate(({data,url})=>parseSocialOembed(data,url),{data:live.body,url:live.url});
   assert.equal(r.social.id,'463440424141459456');assert.equal(r.social.scope,'single-post');assert(r.blocks.length>0);
  });
  await check('no unexpected page errors',async()=>{assert.deepEqual(pageErrors,[]);});
 }finally{await browser.close();}
}
console.log(`Social import: ${passed} browser checks passed. HTTP responses are fixtures; no live X/Threads success claim.`);
