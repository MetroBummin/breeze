import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg',
  '.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'text/plain; charset=utf-8');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const definitions=[
  {id:'backroom-homeward-bound',title:'Backroom - Homeward Bound',file:'homewardbound.txt',paras:107,first:'I sat stunned',last:'It was another flickering wall.'},
];
const expectedOrder=definitions.map(read=>read.title);
const reports=[];

try{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      const page=await browser.newPage({viewport:{width:320,height:568},hasTouch:true,isMobile:true,
        serviceWorkers:'block'});
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.route('**/*',route=>{
        const href=route.request().url();
        return href.startsWith(url)||href.startsWith('blob:')?route.continue():route.abort();
      });
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>homeReady);
      assert.equal(await page.evaluate(()=>innerWidth),320,`${engine.name()} did not use the small viewport`);
      assert.deepEqual(await page.locator('#shelf .longread').evaluateAll(nodes=>nodes.map(node=>node.querySelector('.bt').textContent)),
        expectedOrder,`${engine.name()} Home default Long Reads order is wrong`);
      assert.equal(await page.locator('#shelf .longread img.cover').count(),expectedOrder.length,'Home is missing a bundled cover');
      assert.deepEqual(await page.locator('#shelf .longread img.cover').evaluateAll(nodes=>nodes.map(node=>({
        loaded:node.complete&&node.naturalWidth===512&&node.naturalHeight===1024,
        titleVisible:getComputedStyle(node).objectPosition,
      }))),Array(expectedOrder.length).fill({loaded:true,titleVisible:'50% 0%'}),`${engine.name()} cover crop or title alignment changed`);
      const results=[];

      for(let index=0;index<definitions.length;index++){
        const definition=definitions[index];
        const original=readFileSync(resolve(root,'assets/longreads',definition.file),'utf8');
        const expected=original.replace(/\r/g,'').split(/\n\s*\n+/)
          .map(block=>block.split('\n').map(line=>line.trim()).join(' ').trim()).filter(Boolean);
        assert.equal(expected.length,definition.paras,`${definition.id} source paragraph count changed`);
        await page.locator(`#shelf .longread[data-longread-id="${definition.id}"]`).click();
        await page.waitForFunction(id=>books.some(book=>book.longReadId===id),definition.id);
        const saved=await page.evaluate(id=>{
          const book=books.find(item=>item.longReadId===id);
          return {title:book.title,kind:book.kind,paras:book.paras,author:book.author,
            sourceUrl:book.sourceUrl,site:book.site,originalTitle:book.originalTitle,
            license:book.attribution&&book.attribution.license,cover:book.cover,
            originalKind:book.original&&book.original.kind};
        },definition.id);
        assert.equal(saved.title,definition.title);
        assert.equal(saved.kind,'txt');
        assert.equal(saved.originalKind,null,'TXT should follow the normal saved-text path without an EPUB/PDF original session');
        const savedCard=page.locator(`#shelf .bookcard.longread[data-longread-id="${definition.id}"]`);
        await savedCard.waitFor({state:'visible'});
        await savedCard.waitFor({state:'attached'});
        await page.waitForFunction(id=>document.querySelector(`#shelf .bookcard.longread[data-longread-id="${id}"]`)?.classList.contains('has-cover'),definition.id);
        assert.equal(await savedCard.locator('.bt').evaluate(node=>getComputedStyle(node).position),'absolute',
          `${definition.id} saved-card title overlaps the supplied cover title`);
        assert.equal(saved.paras.length,definition.paras);
        assert.deepEqual(saved.paras,expected,`${definition.id} changed in Breeze TXT import`);
        assert.ok(saved.paras[0].startsWith(definition.first));
        assert.ok(saved.paras.at(-1).endsWith(definition.last));
        assert.equal(saved.site,'Backrooms Wiki');
        assert.equal(saved.license,'CC BY-SA 3.0');
        assert.ok(saved.sourceUrl.startsWith('https://backrooms-wiki.wikidot.com/'));
        assert.doesNotMatch(saved.paras.join('\n'),/rating:\s*[+-]|Licensing \/ Citation|For more information about on-wiki content/i);
        await page.locator('#shelf .bookcard').filter({hasText:definition.title}).first().click();
        await page.waitForFunction(()=>document.getElementById('v-read').classList.contains('on'));
        await page.waitForFunction(()=>document.querySelectorAll('#rtext [data-pi]').length>0);
        assert.equal(await page.locator('#rtitle').textContent(),definition.title);
        assert.equal(await page.locator('#rtext [data-pi]').count(),definition.paras,
          `${definition.id} attribution changed story progress/paragraph count`);
        assert.equal(await page.locator('#rtext .story-illustration').count(),10,'story scene images are missing');
        assert.equal(await page.locator('#rtext .story-scene-break').count(),4,'chapter 2 viewpoint breaks are missing');
        assert.equal(await page.locator('#rtext h3').filter({hasText:'Chapter 2'}).count(),1,'chapter 2 heading is missing');
        for(const illustration of await page.locator('#rtext .story-illustration').all()){
          await illustration.scrollIntoViewIfNeeded();
          await illustration.locator('img').evaluate(image=>image.decode());
        }
        assert.equal(await page.locator('#rtext .story-illustration').evaluateAll(nodes=>nodes.every(node=>{
          const next=node.nextElementSibling;
          return next&&next.matches('[data-pi]')&&node.querySelector('img').complete&&node.querySelector('img').naturalWidth>0;
        })),true,'scene image is not immediately above its text or did not load');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'story widened the small viewport');
        assert.equal(await page.locator('#r-attribution').isVisible(),true,'story attribution is missing');
        await page.locator('#r-attribution summary').click();
        const credits=await page.locator('#r-attribution').innerText();
        assert.ok(credits.includes(saved.originalTitle)&&credits.includes(saved.author)&&credits.includes('Backrooms Wiki'));
        assert.ok(await page.locator('#r-attribution a[href="'+saved.sourceUrl+'"]').count());
        assert.ok(await page.locator('#r-attribution a[href="https://backrooms-wiki.wikidot.com/homewardbound-ch-2"]').count());
        assert.ok(await page.locator('#r-attribution a[href="https://creativecommons.org/licenses/by-sa/3.0/"]').count());

        // Exercise the actual Text Mode word tap with an existing saved meaning.
        const wordIndex=await page.locator('#rtext .w').evaluateAll(nodes=>nodes.findIndex(node=>/^[A-Za-z]{4,}$/.test(node.textContent)));
        assert.ok(wordIndex>=0,'Story has no lookup-compatible word span');
        await page.locator('#rtext .w').nth(wordIndex).click();
        await page.waitForFunction(()=>wordPeekOpen());
        await page.evaluate(()=>{
          const selected=words[selKey],key=selected&&(selected.root||selKey),span=document.querySelector('#rtext .w.sel');
          const word=span?span.textContent.toLowerCase():selKey;
          words[key]={word,clicked:word,forms:[key],ko:'검증 뜻',phon:'',defs:[],kodict:[],
            example:span&&span.closest('[data-pi]')?span.closest('[data-pi]').textContent:'',book:curBook.title,status:1,mark:false,
            addedAt:Date.now(),up:Date.now()};
          renderWordLookup();
        });
        await page.waitForFunction(()=>document.getElementById('word-peek-meaning').textContent==='검증 뜻');
        const lookup=await page.evaluate(()=>({text:document.getElementById('word-peek-meaning').textContent,key:selKey,word:words[selKey]}));
        assert.equal(lookup.text,'검증 뜻',`${definition.id} lookup did not use the seeded Text result: ${JSON.stringify(lookup)}`);
        assert.ok(await page.evaluate(()=>wordLookupOpen()),'Text Mode word lookup did not open');
        const highlighted=await page.evaluate(()=>{
          words[selKey].mark=true;words[selKey].status=1;saveWords(selKey);paintWord(selKey);
          return !!document.querySelector(`.w[data-w="${CSS.escape(selKey)}"]`)?.classList.contains('s1');
        });
        assert.ok(highlighted,`${definition.id} saved Text highlight did not paint its word`);
        await page.evaluate(()=>closePanel());

        // Sentence lookup is served from its ordinary cached result path.
        const sentence=saved.paras.find(text=>/[.!?]$/.test(text))||saved.paras[1];
        await page.evaluate(text=>{
          const answer={ko:'검증 문장 해석',points:[]};
          dictGet=async()=>answer;dictPut=async()=>true;
          closePanel();openSentence(text);
        },sentence);
        await page.waitForFunction(()=>sentenceLookupOpen());
        assert.equal((await page.locator('#ps-en').textContent()).replace(/\s+/g,' ').trim(),sentence.replace(/\s+/g,' ').trim());
        assert.equal(await page.locator('#ps-ko').textContent(),'검증 문장 해석');
        await page.evaluate(()=>closeSentence());

        // Light/Dark both preserve the Text Reader, then progress survives a relaunch.
        const lightColor=await page.locator('#rtext').evaluate(node=>getComputedStyle(node).color);
        await page.evaluate(()=>toggleDark());
        assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('dark')),true);
        const darkColor=await page.locator('#rtext').evaluate(node=>getComputedStyle(node).color);
        assert.notEqual(darkColor,lightColor,'Light and Dark Text Reader colors did not change');
        await page.evaluate(()=>toggleDark());
        await page.evaluate(()=>{
          const max=Math.max(0,readerContentHeight()-readerViewHeight());
          readerScrollTo(Math.max(150,Math.round(max*.55)));
          updatePfill(true);
        });
        await page.waitForTimeout(950);
        const beforeReload=await page.evaluate(()=>({p:positions[curBook.id].p,id:curBook.id,top:readerScrollTop(),content:readerContentHeight(),view:readerViewHeight(),mode:currentReaderMode}));
        assert.ok(beforeReload.p>0.1,`${definition.id} progress did not advance: ${JSON.stringify(beforeReload)}`);
        await page.reload({waitUntil:'domcontentloaded'});
        await page.evaluate(()=>homeReady);
        const restored=await page.evaluate(id=>{
          const book=books.find(item=>item.longReadId===id);
          const pos=positions[book.id];
          return {title:book.title,kind:book.kind,cover:book.cover,p:pos.p,attribution:book.attribution};
        },definition.id);
        assert.equal(restored.title,definition.title);
        assert.equal(restored.kind,'txt');
        assert.ok(restored.cover&&restored.p>0.1,'saved text, cover, or progress did not survive reload');
        assert.equal(restored.attribution.author,saved.author);
        await page.evaluate(async id=>{
          const book=books.find(item=>item.longReadId===id);
          book.paras=book.paras.slice(0,61);
          book.originalTitle='Homeward Bound: Chapter 1';
          book.attribution.sources=undefined;
          book.fingerprint=bookContentFingerprint(book.paras);
          positions[book.id]={pi:30,dy:0,p:.5,t:Date.now(),mode:'text'};
          save(LS_POS,positions);
          await bookPut(book);
        },definition.id);
        await page.reload({waitUntil:'domcontentloaded'});
        await page.evaluate(()=>homeReady);
        const migrated=await page.evaluate(id=>{
          const book=books.find(item=>item.longReadId===id);
          return {paras:book.paras.length,pos:positions[book.id],sources:book.attribution.sources.length};
        },definition.id);
        assert.equal(migrated.paras,107,'existing Chapter 1 book did not become one combined Text book');
        assert.equal(migrated.pos.pi,30,'existing Chapter 1 reading anchor moved');
        assert.ok(Math.abs(migrated.pos.p-30/106)<.001,'existing progress was not scaled to the combined book');
        assert.equal(migrated.sources,2,'existing book did not receive both source credits');
        results.push({title:definition.title,paras:saved.paras.length,kind:saved.kind,
          lookup:true,sentence:true,highlight:true,lightDark:true,progressRestored:true});
      }
      assert.equal(await page.evaluate(()=>pendingLongReads().length),0,'Imported Long Reads reappeared as recommendations');
      reports.push({engine:engine.name(),viewport:'320×568',stories:results});
      await page.close();
    }finally{await browser.close();}
  }
  console.log(JSON.stringify(reports,null,2));
}finally{server.close();}
