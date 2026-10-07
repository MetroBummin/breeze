import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const slugs=['speckled-band','scandal-in-bohemia','red-headed-league','final-problem','hound-of-the-baskervilles'];
const proof='/tmp/breeze-holmes-integration-proof';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[extname(path)]||'text/plain; charset=utf-8');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BROWSER||e.name()===process.env.BROWSER)){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url);await page.evaluate(()=>homeReady);
  const offeredIds=slugs.map(slug=>'sherlock-holmes-'+slug);
  assert.deepEqual(await page.locator('#shelf .longread').evaluateAll(nodes=>nodes.map(node=>node.dataset.longreadId)),offeredIds,'Home promotes only the five Holmes works');
  await page.evaluate(()=>show('longform'));
  assert.deepEqual(await page.locator('#longform-grid .longread').evaluateAll(nodes=>nodes.map(node=>node.dataset.longreadId)),offeredIds,'Long-form offers the same Holmes collection');
  for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
   await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();show('longform');},dark);
   await page.screenshot({path:`${proof}/${engine.name()}-shelf-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:390,height:844});
  // Real old saved-book fixture: artwork must never rewrite text, position or custom cover.
  const first=readFileSync(resolve(root,'assets/longreads/speckled-band.txt'),'utf8').trim().split('\n\n');
  await page.evaluate(async paras=>{
   const result=await importFile(new File([paras.join('\n\n')+'\n'],'old-copy.txt',{type:'text/plain'}),{title:'My saved Holmes',longReadId:'sherlock-holmes-speckled-band'},{preserveParagraphs:true});
   const book=books.find(b=>b.id===result.bookId);
   const blob=new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],{type:'image/png'});
   await imgPut(book.id+'|custom',blob);book.cover=book.id+'|custom';await bookPut(book);
   positions[book.id]={p:200/(paras.length-1),pi:200,y:0,mode:'text',t:Date.now()};save(LS_POS,positions);
   await restoreMissingLongReadCovers();renderAllBookViews();
  },first);
  for(const slug of slugs){
   const id='sherlock-holmes-'+slug,raw=readFileSync(resolve(root,'assets/longreads/'+slug+'.txt'),'utf8'),paras=raw.trim().split('\n\n');
   const scenes=JSON.parse(readFileSync(resolve(root,'docs/content/'+slug+'/illustration-anchors.json'),'utf8'));
   await page.evaluate(id=>openLongReadPreview(LONG_READS.find(r=>r.id===id)),id);
   assert.equal(await page.locator('#article-preview .story-illustration').count(),0);
   assert.equal(await page.locator('#article-preview img').count(),1);
   assert.equal(await page.evaluate(()=>books.length),slug==='speckled-band'?1:slugs.indexOf(slug));
   await page.locator('#article-preview .ap-start').click();await page.waitForFunction(()=>!articlePreviewDialog.open&&!readerPositionPending());
   assert.deepEqual(await page.evaluate(()=>curBook.paras),paras);
   assert.equal(await page.locator('#rtext [data-pi]').count(),paras.length);
   assert.equal(await page.locator('#rtext .story-illustration').count(),10);
   if(slug==='speckled-band'){
    assert.equal(await page.evaluate(()=>curBook.title),'My saved Holmes');
    assert.match(await page.evaluate(()=>curBook.cover),/\|custom$/);
    assert.ok(Math.abs(await page.evaluate(()=>captureAnchor().pi)-200)<=1);
   }
   for(const scene of scenes){
    const figure=page.locator(`#rtext .story-illustration[data-scene="${scene.id}.webp"]`);
    await figure.scrollIntoViewIfNeeded();await figure.locator('img').evaluate(img=>img.decode());
    const actual=await figure.evaluate(fig=>({pi:Number([...document.querySelectorAll('#rtext [data-pi],#rtext .story-illustration')][[...document.querySelectorAll('#rtext [data-pi],#rtext .story-illustration')].indexOf(fig)+1].dataset.pi),loaded:fig.querySelector('img').naturalWidth>0,ratio:fig.querySelector('img').getBoundingClientRect().width/fig.querySelector('img').getBoundingClientRect().height}));
    assert.equal(actual.pi,scene.verifiedPlacement.afterParagraph1Based);assert.equal(actual.loaded,true);assert.ok(Math.abs(actual.ratio-2)<.01);
   }
   const boundary=slug==='hound-of-the-baskervilles'?1304:Math.floor(paras.length*.8);
   const saved=await page.evaluate(boundary=>{const id=curBook.id,book=curBook;show('home');positions[id]={p:boundary/(book.paras.length-1),pi:boundary,y:0,mode:'text',t:Date.now()};save(LS_POS,positions);return {id,cover:book.cover,title:book.title};},boundary);
   await page.reload();await page.evaluate(()=>homeReady);
   await context.setOffline(true);await page.evaluate(async id=>openBook(books.find(b=>b.id===id)),saved.id);await page.waitForFunction(()=>!readerPositionPending());
   const restored=await page.evaluate(()=>({
    anchor:captureAnchor(),saved:posOf(curBook.id),scrollTop:readerScroller().scrollTop,
    pending:readerPositionPending(),fontStatus:document.fonts.status,
    viewport:{width:innerWidth,height:innerHeight},
    images:[...document.querySelectorAll('#rtext .story-illustration img')].map(img=>({complete:img.complete,width:img.naturalWidth})),
   }));
   if(Math.abs(restored.anchor.pi-boundary)>1){
    await page.screenshot({path:`${proof}/${engine.name()}-${slug}-offline-anchor-failure.png`});
    console.error('Offline anchor diagnostic',JSON.stringify({engine:engine.name(),slug,boundary,restored}));
   }
   assert.ok(Math.abs(restored.anchor.pi-boundary)<=1,'offline saved late paragraph restores: '+JSON.stringify({engine:engine.name(),slug,boundary,anchor:restored.anchor,saved:restored.saved}));
   assert.deepEqual(await page.evaluate(()=>curBook.paras),paras);assert.equal(await page.evaluate(()=>curBook.cover),saved.cover);
   await context.setOffline(false);
   // Inspect each story's first safe interior illustration through the normal renderer.
   await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(async id=>openBook(books.find(b=>b.id===id)),saved.id);await page.waitForFunction(()=>!readerPositionPending());
   for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
    await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
    const figure=page.locator('#rtext .story-illustration').first();await figure.scrollIntoViewIfNeeded();await figure.locator('img').evaluate(img=>img.decode());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${proof}/${engine.name()}-${slug}-${width}x${height}-${dark?'dark':'light'}.png`});
   }
   if(slug==='hound-of-the-baskervilles'){
    const manifest=JSON.parse(readFileSync(resolve(root,'docs/content/'+slug+'/manifest.json'),'utf8'));
    assert.equal(await page.locator('#rtext .holmes-chapter').count(),15);
    assert.equal(await page.locator('#rtext .holmes-contents-line').count(),15);
    assert.equal(await page.locator('#rtitle').isVisible(),false,'source title avoids a duplicate page title');
    for(const c of manifest.chapters){
     const heading=page.locator(`#rtext .holmes-chapter[data-pi="${c.paragraph1Based-1}"]`);
     assert.equal(await heading.textContent(),`Chapter ${c.number}. ${c.title}`);
     assert.equal(await heading.evaluate(h=>h.parentElement.firstElementChild===h),true,'each chapter starts with its heading');
     assert.equal(await heading.evaluate(h=>h.nextElementSibling?.matches('[data-pi]')),true,'no stranded chapter heading');
    }
    for(const [width,height] of [[390,844],[820,1180],[320,568],[844,390]])for(const dark of [false,true])for(const size of [14,26]){
     await page.setViewportSize({width,height});await page.evaluate(({dark,size})=>{darkMode=dark;applyDark();fontSize(size-fs);},{dark,size});
     await page.waitForFunction(()=>!readerPositionPending());
     assert.deepEqual(await page.evaluate(()=>curBook.paras),paras);
     const title=page.locator('#rtext .holmes-title');await title.scrollIntoViewIfNeeded();
     await page.screenshot({path:`${proof}/${engine.name()}-hound-frontmatter-${width}-${dark?'dark':'light'}-font${size}.png`});
     const heading=page.locator('#rtext .holmes-chapter').nth(8);await heading.scrollIntoViewIfNeeded();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     await page.screenshot({path:`${proof}/${engine.name()}-hound-chapter9-${width}-${dark?'dark':'light'}-font${size}.png`});
    }
   }
   await page.evaluate(()=>show('home'));
   console.log(`${engine.name()}: ${slug}: full import, 10 decoded after-passage scenes, real database/offline late anchor and 10 layouts passed`);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
