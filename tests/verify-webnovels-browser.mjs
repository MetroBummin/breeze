// 추천 > 웹소설: each bundled novel opens from its chapter list and reads like a classic.
// Deterministic: every request outside the local server is aborted.
// SCREENSHOT_DIR=<dir> also saves the chapter list and a chapter page per novel.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const server=createServer((req,res)=>{
  try{
    const requested=new URL(req.url,'http://localhost').pathname;
    const path=resolve(root,'.'+requested.replace(/^\/$/,'/index.html'));
    if(!path.startsWith(root))throw Error();
    res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');
    res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
const shots=process.env.SCREENSHOT_DIR||'';
if(shots)mkdirSync(shots,{recursive:true});
// Which chapter each run opens from the list (1-based), so different rows are exercised.
const works=[['mr-penn',1],['cinnamon-bun',3],['chasing-sunlight',2]];

try{
  for(const engine of [chromium,webkit].filter(engine=>!process.env.BROWSER||engine.name()===process.env.BROWSER)){
    const browser=await engine.launch(engine===chromium&&process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{});
    try{
      for(const dark of shots?[false,true]:[false]){
        const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',colorScheme:dark?'dark':'light'});
        await page.addInitScript(dark=>{
          localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
          localStorage.setItem('breeze.home-recommend',JSON.stringify('webnovels'));
          if(dark)localStorage.setItem('breeze.dark',JSON.stringify('dark'));
        },dark);
        await page.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('blob:')?route.continue():route.abort());
        await page.goto(base);await page.evaluate(()=>homeReady);
        const theme=dark?'dark':'light';
        for(const [id,open] of works){
          const work=await page.evaluate(id=>JSON.parse(JSON.stringify(webNovelDefinition(id))),id);
          await page.evaluate(()=>show('home'));
          await page.locator(`#casual-rail .webnovel[data-webnovel-id="${id}"]`).click();
          await page.waitForFunction(()=>document.querySelector('#article-preview').open);
          const rows=await page.locator('#article-preview .ap-chapter-row').evaluateAll(nodes=>nodes.map(row=>[row.querySelector('.ap-chapter-title').textContent,row.querySelector('.ap-chapter-state').textContent]));
          assert.equal(rows.length,10,`${id}: 10 chapters in the list`);
          assert.deepEqual(rows.map(([title])=>title),work.chapters.map(chapter=>chapter.title),`${id}: real chapter titles`);
          assert.ok(rows.every(([,state])=>state==='읽기'));
          assert.doesNotMatch(await page.locator('#article-preview').innerText(),/곧 공개/);
          assert.equal(await page.locator('#article-preview .ap-start').textContent(),'읽기');
          const links=await page.locator('#article-preview .ap-links a').evaluateAll(nodes=>nodes.map(node=>node.href));
          assert.deepEqual(links,[work.royalRoadUrl,...(work.kindleUrl?[work.kindleUrl]:[])]);
          assert.equal(await page.evaluate(id=>books.some(book=>book.longReadId===id),id),false,'Preview alone saves nothing');
          if(shots){
            await page.locator('#article-preview .ap-chapters').scrollIntoViewIfNeeded();
            await page.screenshot({animations:'disabled',path:`${shots}/${id}-chapters-${theme}.png`});
          }

          // Open a chapter from the list: saved to 내 책, Reader at that heading.
          const chapter=work.chapters[open-1];
          await page.locator('#article-preview .ap-chapter-row').nth(open-1).click();
          await page.waitForFunction(()=>document.getElementById('v-read').classList.contains('on')&&!document.querySelector('#article-preview').open);
          await page.waitForFunction(title=>{
            const heading=[...document.querySelectorAll('#rtext [data-pi]')].find(node=>node.textContent===title);
            if(!heading)return false;
            const top=heading.getBoundingClientRect().top;
            return top>=-2&&top<innerHeight*.4;
          },chapter.title);
          const state=await page.evaluate(id=>{
            const book=books.find(item=>item.longReadId===id);
            const heading=document.querySelector(`#rtext [data-pi="${posOf(book.id).pi}"]`);
            return {kind:book.kind,title:book.title,author:book.author,attribution:book.attribution?.sourceName,
              heading:heading?.textContent,tag:heading?.tagName,story:document.getElementById('rtext').classList.contains('holmes-story'),
              source:document.getElementById('rsource').href,rtitle:document.getElementById('rtitle').textContent};
          },id);
          assert.deepEqual(state,{kind:'txt',title:work.title,author:work.credit,attribution:'Royal Road',heading:chapter.title,tag:'H3',story:true,
            source:work.royalRoadUrl,rtitle:work.title});
          // Words are tappable spans, and italics from the source are painted.
          await page.waitForFunction(()=>document.querySelectorAll('#rtext p[data-pi] .w').length>20);
          if(shots)await page.screenshot({animations:'disabled',path:`${shots}/${id}-chapter-${theme}.png`});
          // Source italics are painted on the first emphasised paragraph after the heading.
          const italic=await page.evaluate(id=>{
            const book=books.find(item=>item.longReadId===id),start=posOf(book.id).pi;
            const hit=Object.entries(PUBLIC_DOMAIN_LAYOUT[id]).find(([index,entry])=>+index>start&&entry.ranges?.some(range=>range[2]==='em'));
            document.querySelector(`#rtext [data-pi="${hit[0]}"]`).scrollIntoView({block:'center'});
            return +hit[0];
          },id);
          await page.waitForFunction(pi=>{
            const node=document.querySelector(`#rtext [data-pi="${pi}"]`);
            return node&&node.dataset.wordSpans==='1'&&[...node.querySelectorAll('*')].some(child=>getComputedStyle(child).fontStyle==='italic');
          },italic);
          // To the end: progress reaches 100% and the continue note links the full story.
          await page.evaluate(()=>{const scroller=readerScroller();scroller.scrollTop=scroller.scrollHeight;scroller.dispatchEvent(new Event('scroll'));});
          await page.waitForFunction(()=>Math.abs(visibleReaderProgress()-1)<.001);
          const note=await page.locator('#rtext .webnovel-continue').evaluate(node=>({
            pi:node.closest('[data-pi]')?node.closest('[data-pi]').dataset.pi:null,
            links:[...node.querySelectorAll('a')].map(link=>[link.href,link.target]),text:node.textContent}));
          assert.equal(note.pi,null,'The note is not a text paragraph');
          assert.deepEqual(note.links,[[work.royalRoadUrl,'_blank'],...(work.kindleUrl?[[work.kindleUrl,'_blank']]:[])]);
          assert.match(note.text,new RegExp(work.credit.replace(/\./g,'\\.')));
          assert.doesNotMatch(note.text,/vampire|뱀파이어|흡혈/i);
          if(shots&&id==='chasing-sunlight')await page.screenshot({animations:'disabled',path:`${shots}/${id}-end-${theme}.png`});

          // Back to the chapter heading, then home: the card shows the chapter being read.
          await page.evaluate(()=>show('home'));
          await page.waitForFunction(()=>activeAppView()==='home');
          const label=await page.locator(`#casual-rail .webnovel[data-webnovel-id="${id}"] .get`).textContent();
          assert.equal(label,'10화 읽는 중','The saved place is in the last chapter after reading to the end');
          assert.ok(await page.evaluate(id=>{
            const book=books.find(item=>item.longReadId===id);
            return [...document.querySelectorAll('#shelf [data-home-key]')].some(node=>node.dataset.homeKey==='book:'+book.id);
          },id),'The novel is in 내 책');
          // Reopening the sheet marks the current chapter and the CTA continues.
          await page.locator(`#casual-rail .webnovel[data-webnovel-id="${id}"]`).click();
          await page.waitForFunction(()=>document.querySelector('#article-preview').open);
          assert.equal(await page.locator('#article-preview .ap-chapter-row.is-current .ap-chapter-title').textContent(),work.chapters[9].title);
          assert.equal(await page.locator('#article-preview .ap-start').textContent(),'이어서 읽기');
          await page.locator('#article-preview .ap-close').click();
        }
        assert.equal(await page.evaluate(async()=>(await bookAll()).filter(book=>book.longReadId).length),3,'Three saved text books');
        await page.close();
      }
    }finally{await browser.close();}
    console.log(`webnovels browser ok (${engine.name()})`);
  }
}finally{server.close();}
