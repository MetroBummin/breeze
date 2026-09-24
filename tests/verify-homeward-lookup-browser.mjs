import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'text/plain; charset=utf-8');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      const page=await browser.newPage({viewport:{width:320,height:568},hasTouch:true,isMobile:true,serviceWorkers:'block'});
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      const remote=[];
      await page.route('**/*',route=>{
        const href=route.request().url();
        if(href.startsWith(url)||href.startsWith('blob:'))return route.continue();
        remote.push(href);return route.abort();
      });
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
      await page.evaluate(()=>homeReady);
      await page.locator('#shelf .longread[data-longread-id="backroom-homeward-bound"]').click();
      await page.waitForFunction(()=>books.some(book=>book.longReadId==='backroom-homeward-bound'));
      await page.locator('#shelf .bookcard.longread[data-longread-id="backroom-homeward-bound"]').click();
      await page.waitForFunction(()=>curBook?.longReadId==='backroom-homeward-bound');

      const audit=await page.evaluate(()=>{
        const data=HOMEWARD_LOOKUP_DATA;
        let total=0,word=0,phrase=0;
        for(const chapter of data.chapters){
          if(!homewardLookupChapter(chapter.start))throw Error('chapter source mismatch');
          for(let offset=0;offset<chapter.paragraphs.length;offset++){
            const pi=chapter.start+offset,source=chapter.paragraphs[offset];
            const parts=homewardSentenceParts(pi,source)||[];
            if(parts.length!==chapter.sentences[offset].length)throw Error('sentence count mismatch '+pi);
            for(const part of parts){
              if(!homewardSentenceAnswer(part.text))throw Error('missing translation '+pi);
              total++;
            }
          }
          for(const entry of chapter.words){
            const block=document.querySelector(`#rtext [data-pi="${entry.pi}"]`);
            const input={sentence:entry.sentence,clickedIndex:entry.members[0]};
            if(homewardWordAnswer(input,block)!==entry)throw Error('word fixture mismatch '+entry.canonical);
            if(entry.members.length>1)phrase++;else word++;
          }
        }
        const original=curBook.paras[2];
        curBook.paras[2]=original+' changed';
        const rejected=!homewardLookupChapter(0)&&!homewardSentenceAnswer('I snapped out of my reverie.');
        const wordRejected=!homewardWordAnswer({sentence:'I snapped out of my reverie.',clickedIndex:6},
          document.querySelector('#rtext [data-pi="2"]'));
        curBook.paras[2]=original;
        return {total,word,phrase,rejected,wordRejected};
      });
      assert.deepEqual(audit,{total:314,word:43,phrase:34,rejected:true,wordRejected:true});

      await page.evaluate(()=>hydrateWordSpanBatch([document.querySelector('#rtext [data-pi="2"]')]));
      const target=page.locator('#rtext [data-pi="2"] .w').filter({hasText:/^reverie$/i}).first();
      await target.scrollIntoViewIfNeeded();
      const began=Date.now();await target.click();
      await page.waitForFunction(()=>wordPeekOpen());
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#word-peek').evaluate(node=>node.classList.contains('loading')),true);
      await page.waitForFunction(()=>document.getElementById('word-peek-meaning').textContent.includes('상념'));
      const wordElapsed=Date.now()-began;
      assert.ok(wordElapsed>=850&&wordElapsed<3000,`word presentation timing ${wordElapsed}`);
      assert.equal(remote.filter(href=>href.includes('/functions/v1/dict')).length,0,'local hit made an AI request');
      const retry=await page.evaluate(async()=>{
        const original=fetchLook;let called=0,options=null;
        fetchLook=async(_key,input)=>{called++;options={retry:input.retry,hold:input.hold};
          return {ko:'AI 재조회 뜻',kind:'word',pos:'noun'};};
        try{await retryWordPeek();return {called,options};}
        finally{fetchLook=original;}
      });
      assert.deepEqual(retry,{called:1,options:{retry:true,hold:true}},'Retry did not enter the existing AI lookup path');
      await page.evaluate(()=>closePanel());

      await page.evaluate(()=>hydrateWordSpanBatch([document.querySelector('#rtext [data-pi="0"]')]));
      const phrase=page.locator('#rtext [data-pi="0"] .w').filter({hasText:/^ripped$/i}).first();
      await phrase.scrollIntoViewIfNeeded();
      await phrase.click();
      await page.waitForFunction(()=>document.getElementById('word-peek-meaning').textContent.includes('샅샅이'));
      assert.equal(await page.evaluate(()=>words[selKey]?.word),'ripped apart','phrase span was not saved as one expression');
      await page.evaluate(()=>closePanel());

      const rapid=await page.evaluate(async()=>{
        const blocks=[3,10].map(pi=>document.querySelector(`#rtext [data-pi="${pi}"]`));
        hydrateWordSpanBatch(blocks);
        const first=[...blocks[1].querySelectorAll('.w')].find(node=>node.textContent==='painstakingly');
        const second=[...blocks[0].querySelectorAll('.w')].find(node=>node.textContent==='disbelief');
        if(!first||!second)throw Error('rapid lookup fixture words missing');
        openWord(first.dataset.w,first);
        await new Promise(resolve=>setTimeout(resolve,120));
        openWord(second.dataset.w,second);
        await new Promise(resolve=>setTimeout(resolve,1150));
        return {selected:selKey,meaning:document.getElementById('word-peek-meaning').textContent,
          firstSaved:!!words[first.dataset.w]};
      });
      assert.equal(rapid.meaning,'믿기지 않아','older local word result replaced the newer lookup');
      assert.notEqual(rapid.selected,'painstakingly');
      await page.evaluate(()=>closePanel());

      const sentence='I snapped out of my reverie.';
      const first=page.evaluate(()=>openSentence('He had no face.'));
      await page.waitForTimeout(130);
      const sentenceStarted=Date.now();
      const second=page.evaluate(text=>openSentence(text),sentence);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>sentenceWaitingActive()),true,'sentence loading vanished too early');
      await Promise.all([first,second]);
      assert.ok(Date.now()-sentenceStarted>=850,'sentence result appeared before the loading interval');
      assert.equal(await page.locator('#ps-en').textContent(),sentence,'old sentence replaced the new selection');
      assert.equal(await page.locator('#ps-ko').textContent(),'나는 상념에서 깨어났다.');
      assert.equal(remote.filter(href=>href.includes('/functions/v1/dict')).length,0,'sentence hit made an AI request');
      await page.evaluate(()=>closeSentence());

      const fallback=await page.evaluate(async()=>{
        const before=curBook.paras[2];curBook.paras[2]+=' changed';
        const answer=homewardSentenceAnswer('I snapped out of my reverie.');
        const general=homewardLookupChapter(0);
        const originalGet=dictGet;let calls=0;
        dictGet=async()=>{calls++;return {ko:'기존 조회 경로'};};
        await openSentence('I snapped out of my reverie.');
        const shown=document.getElementById('ps-ko').textContent;
        closeSentence();dictGet=originalGet;
        curBook.paras[2]=before;
        return {answer,general,calls,shown};
      });
      assert.deepEqual(fallback,{answer:null,general:null,calls:1,shown:'기존 조회 경로'});
      console.log(`${engine.name()}: ${audit.total} sentences, ${audit.word} words, ${audit.phrase} phrases, ${wordElapsed}ms word load, no AI requests`);
      await page.close();
    }finally{await browser.close();}
  }
}finally{server.close();}
