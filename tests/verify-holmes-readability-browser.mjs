/* Whole-story actual Reader traversal. Canonical paragraphs remain the storage and
   selection coordinate; display subdivisions survive hydrate/dehydrate/reopen. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_HOLMES_READABILITY_PROOF||'/tmp/breeze-holmes-readability-proof';mkdirSync(proof,{recursive:true});
const audit=JSON.parse(readFileSync(resolve(root,'docs/content/holmes-readability/boundaries.json')));
const slugs=Object.keys(audit),observations=[];
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp'})[extname(path)]||'text/plain; charset=utf-8');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BROWSER||e.name()===process.env.BROWSER)){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url);await page.evaluate(()=>homeReady);
  for(const slug of slugs){
   const id='sherlock-holmes-'+slug,paras=readFileSync(resolve(root,'assets/longreads/'+slug+'.txt'),'utf8').trim().split('\n\n');
   await page.evaluate(async id=>{const book=await importLongRead(LONG_READS.find(r=>r.id===id));await openBook(book);},id);await page.waitForFunction(()=>!readerPositionPending());
   assert.deepEqual(await page.evaluate(()=>curBook.paras),paras);
   const before=await page.evaluate(()=>({id:curBook.id,fingerprint:curBook.fingerprint,updated:curBook.updated}));
   // Visit every saved paragraph, including all final chapters and the ending.
   const sweep=await page.evaluate(async()=>{
    const rows=[];const scroller=readerScroller();
    for(const el of document.querySelectorAll('#rtext [data-pi]')){
     scroller.scrollTop+=el.getBoundingClientRect().top-scroller.getBoundingClientRect().top-35;
     hydrateWordSpanBatch([el]);
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const rect=el.getBoundingClientRect(),parts=[...el.querySelectorAll(':scope > .holmes-paragraph-part')];
     rows.push({pi:Number(el.dataset.pi),text:el.textContent,visible:rect.bottom>0&&rect.top<innerHeight,
      overflow:el.scrollWidth>el.clientWidth+1,parts:parts.length,partText:parts.map(p=>p.textContent),
      gaps:parts.slice(1).map(p=>Number.parseFloat(getComputedStyle(p).marginTop))});
     dehydrateWordSpan(el);hydrateWordSpanBatch([el]);
     if(el.textContent!==rows.at(-1).text)throw Error('lazy word coverage changed at '+el.dataset.pi);
     dehydrateWordSpan(el); // Keep the sweep bounded like the real lazy Reader.
    }
    return rows;
   });
   assert.equal(sweep.length,paras.length);assert.deepEqual(sweep.map(r=>r.text),paras);
   assert.ok(sweep.every(r=>r.visible&&!r.overflow),'every paragraph is reachable without horizontal clipping');
   for(const e of audit[slug]){assert.equal(sweep[e.pi].parts,e.cuts.length+1);assert.equal(sweep[e.pi].partText.join(' '),paras[e.pi]);assert.ok(sweep[e.pi].gaps.every(g=>g>0));}
   // DOM ranges and Breeze selection offsets preserve ordered original words.
   // Native OS selection remains disabled by the existing Reader policy.
   const pi=audit[slug][0].pi;
   await page.locator(`#rtext [data-pi="${pi}"]`).scrollIntoViewIfNeeded();
   const selected=await page.evaluate(pi=>{const el=document.querySelector(`#rtext [data-pi="${pi}"]`);hydrateWordSpanBatch([el]);const range=document.createRange();range.selectNodeContents(el);return range.toString();},pi);
   assert.equal(selected.replace(/\s+/g,' ').trim(),paras[pi]);
   await page.locator(`#rtext [data-pi="${pi}"] .holmes-paragraph-part:last-child`).scrollIntoViewIfNeeded();
   await page.evaluate(pi=>{const span=document.querySelector(`#rtext [data-pi="${pi}"] .holmes-paragraph-part:last-child .w`),key=span.dataset.w;const sentence=textSentencePartAt(span);if(!sentence||!sentence.sentence.includes(span.textContent))throw Error('sentence lookup loses nested display span');window.readabilityLookupKey=key;words[key]={word:span.textContent,clicked:span.textContent,forms:[key],ko:'검증 뜻',defs:[],kodict:[],status:1,mark:true,addedAt:1,up:1,ai:{ko:'검증 뜻',done:true}};openWord(key,span);},pi);
   await page.waitForFunction(()=>wordPeekOpen());assert.equal(await page.locator('#word-peek-meaning').textContent(),'검증 뜻');
   // Same book, same paragraph: representative before/after via display-only toggle.
   await page.evaluate(()=>{delete words[window.readabilityLookupKey];show('home');releaseRetainedReader();});
   await page.evaluate(async id=>openBook(books.find(b=>b.id===id)),before.id);await page.waitForFunction(()=>!readerPositionPending());
   for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
    await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
    for(const phase of ['before','after']){
     await page.evaluate(({phase,pi})=>{
      const el=document.querySelector(`#rtext [data-pi="${pi}"]`),text=curBook.paras[pi];
      el.replaceChildren();const parts=phase==='after'?holmesParagraphParts(curBook,{f:pi,t:text}):null;
      if(parts)parts.forEach((text,i)=>{if(i)el.append(' ');const part=document.createElement('span');part.className='holmes-paragraph-part';part.textContent=text;el.append(part);});else el.textContent=text;
      delete el.dataset.wordSpans;hydrateWordSpanBatch([el]);
      const layout=HOLMES_PARAGRAPH_LAYOUT[curBook.longReadId][pi];
      const at=layout.cuts[0],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      let node,offset=0,range=document.createRange();
      while((node=walker.nextNode())){if(offset+node.textContent.length>at){range.setStart(node,at-offset);range.setEnd(node,Math.min(node.textContent.length,at-offset+1));break;}offset+=node.textContent.length;}
      const scroller=readerScroller();scroller.scrollTop+=range.getBoundingClientRect().top-scroller.getBoundingClientRect().top-Math.min(innerHeight*.4,220);
     },{phase,pi});
     await page.screenshot({path:`${proof}/${engine.name()}-${slug}-${width}x${height}-${dark?'dark':'light'}-${phase}.png`});
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   await page.setViewportSize({width:390,height:844});
   const boundary=audit[slug].at(-1).pi;
   await page.evaluate(({id,boundary})=>{const book=curBook;show('home');positions[id]={p:boundary/(book.paras.length-1),pi:boundary,y:0,mode:'text',t:Date.now()};save(LS_POS,positions);},{id:before.id,boundary});
   await page.reload();await page.evaluate(()=>homeReady);await context.setOffline(true);
   await page.evaluate(async id=>openBook(books.find(b=>b.id===id)),before.id);await page.waitForFunction(()=>!readerPositionPending());
   assert.ok(Math.abs(await page.evaluate(()=>captureAnchor().pi)-boundary)<=1,'offline late subdivided paragraph restores');
   assert.deepEqual(await page.evaluate(()=>curBook.paras),paras);assert.equal(await page.evaluate(()=>curBook.fingerprint),before.fingerprint);
   assert.equal(await page.locator('#rtext [data-pi]').count(),paras.length);
   assert.equal(await page.locator(`#rtext [data-pi="${boundary}"] > .holmes-paragraph-part`).count(),audit[slug].at(-1).cuts.length+1);
   await page.screenshot({path:`${proof}/${engine.name()}-${slug}-late-offline.png`});
   await context.setOffline(false);await page.evaluate(()=>show('home'));
   observations.push({engine:engine.name(),slug,paragraphs:sweep.length,splitBlocks:audit[slug].length,latePi:boundary,fullTextCoverage:true,selection:true,cachedLookup:true,offlineRestore:true});
   console.log(`${engine.name()}: ${slug}: all ${sweep.length} paragraphs traversed; source/editorial divisions, DOM selection, cached lookup, 10 layouts and late offline restore passed`);
  }
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
}}finally{writeFileSync(proof+'/observations.json',JSON.stringify(observations,null,2));await new Promise(r=>server.close(r));}
