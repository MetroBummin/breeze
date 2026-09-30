import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

// Run with BROWSER=webkit for the Safari-engine regression pass. Fixtures use
// saveWords, not a legacy snapshot, so reload exercises the real item journal.
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.BREEZE_REVIEW_PROOF||'/tmp/breeze-review-proof';
const REVIEW_KEY='breeze.vocabulary-review.v1';
const NOW=Date.parse('2026-09-30T12:00:00Z');
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const executablePath=process.env.BREEZE_BROWSER_EXECUTABLE||(engine===chromium?process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:undefined);
const browser=await engine.launch({executablePath});
const fixture=(word,n=1,extra={})=>({word,clicked:word,forms:[word],ko:`저장된 뜻 ${n}`,example:`The reader remembers ${word} in this saved sentence.`,book:`Saved Book ${n}`,status:1+(n%3),mark:n%2===0,addedAt:NOW-n*1000,up:NOW-n*1000,...extra});
const uniqueWords=number=>Object.fromEntries(Array.from({length:number},(_,i)=>[`word${i+1}`,fixture(`word${i+1}`,i+1)]));

async function scenario(name,records,run){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],aiRequests=[];
  page.setDefaultTimeout(6000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\/functions\/v1\/dict(?:[/?]|$)|\/chat\/completions|generativelanguage|api\.openai\.com/.test(request.url()))aiRequests.push(request.url());});
  await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.clock.install({time:NOW});
  await page.clock.setFixedTime(NOW);
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
    await page.evaluate(saved=>{words=saved;saveWords();show('vocab');},records);
    await run(page);
    assert.deepEqual(aiRequests,[],`${name}: review must never request AI lookup`);
    assert.deepEqual(errors,[],`${name}: uncaught browser errors`);
    console.log(`${engine.name()}: ${name} passed`);
  }catch(error){
    await page.screenshot({path:`${out}/${engine.name()}-failure-${name.replace(/\W+/g,'-')}.png`,fullPage:true}).catch(()=>{});
    throw error;
  }finally{await context.close();}
}
async function openReview(page){
  await page.locator('#wordbook-review').click();
  assert.equal(await page.locator('#vocabulary-review-dialog').evaluate(element=>element.open),true);
  assert.equal(await page.locator('#vocabulary-review-dialog:modal').count(),1,'Review must use native modal semantics');
  assert.equal(await page.locator('#vocabulary-review-dialog').evaluate(element=>element.contains(document.activeElement)),true,'Focus enters the review dialog');
}
async function assertHiddenAnswer(page){
  assert.equal(await page.locator('#review-meaning').isVisible(),false,'Saved meaning stays hidden before recall');
  assert.equal(await page.locator('#review-reveal').isVisible(),true);
  for(const id of ['review-remember','review-confused']){
    assert.ok(!await page.locator('#'+id).isVisible()||await page.locator('#'+id).isDisabled(),`${id} cannot be used before reveal`);
  }
}
async function reveal(page){
  await page.locator('#review-reveal').click();
  assert.equal(await page.locator('#review-meaning').isVisible(),true);
  assert.ok((await page.locator('#review-meaning').innerText()).trim(),'Reveal shows a saved answer');
  assert.equal(await page.locator('#review-remember').isVisible(),true);
  assert.equal(await page.locator('#review-confused').isVisible(),true);
}
async function persistedWords(page){
  return page.evaluate(()=>({words:JSON.stringify(words),storage:Object.fromEntries(Object.keys(localStorage).filter(key=>key==='breeze.words'||key==='breeze.dead'||key.startsWith('breeze.word-item.')||key==='breeze.word-write.pending').sort().map(key=>[key,localStorage.getItem(key)]))}));
}
async function reviewState(page){return page.evaluate(key=>localStorage.getItem(key),REVIEW_KEY);}
async function progress(page){return (await page.locator('#review-progress').innerText()).match(/\d+/g)?.map(Number)||[];}
async function assertDone(page){
  assert.equal(await page.locator('#review-status').isVisible(),true,'End/empty state provides visible explanatory copy');
  assert.ok((await page.locator('#review-status').innerText()).trim());
  assert.equal(await page.locator('#review-reveal').isVisible(),false,'End state cannot reveal a stale answer');
  assert.equal(await page.locator('#review-meaning').isVisible(),false,'End state cannot leak a stale answer');
}
async function closeReview(page,keyboard=false){
  if(keyboard)await page.keyboard.press('Escape');else await page.locator('#review-close').click();
  await page.waitForFunction(()=>!document.getElementById('vocabulary-review-dialog').open);
  assert.equal(await page.locator('dialog:modal').count(),0,'Dismissal releases the native top layer');
  assert.equal(await page.locator('#wordbook-review').evaluate(element=>element===document.activeElement),true,'Dismissal restores initiating control focus');
}

try{
  await scenario('five-item cap, hidden answers, durable progress and no mutation',uniqueWords(7),async page=>{
    const before=await persistedWords(page);
    assert.equal((await page.locator('#wordbook-review').innerText()).trim(),'오늘 5개 복습');
    await openReview(page);await assertHiddenAnswer(page);
    assert.equal((await progress(page)).at(-1),5,'A new session is capped at five cards');
    const first=await page.locator('#review-expression').innerText();
    const firstProgress=await progress(page);
    // Programmatic clicks also must not bypass the reveal gate.
    await page.evaluate(()=>document.getElementById('review-remember').click());
    assert.deepEqual(await progress(page),firstProgress);
    assert.equal(await page.locator('#review-expression').innerText(),first);
    await reveal(page);
    const firstAnswer=await page.locator('#review-meaning').innerText();
    assert.equal(firstAnswer,await page.evaluate(word=>Object.values(words).find(item=>item.word===word).ko,first));
    await closeReview(page);await openReview(page);await assertHiddenAnswer(page);
    assert.equal(await page.locator('#review-expression').innerText(),first,'Closing an ungraded card does not skip it');
    await reveal(page);
    await page.evaluate(()=>{const button=document.getElementById('review-remember');button.click();button.click();});
    const second=await page.locator('#review-expression').innerText();
    assert.notEqual(second,first,'One grade advances one card');
    assert.equal((await progress(page))[0],firstProgress[0]+1,'Duplicate grade cannot skip the next hidden card');
    await assertHiddenAnswer(page);
    const savedAfterGrade=await reviewState(page);
    assert.ok(savedAfterGrade,'Progress is stored under the review-only key');
    await reveal(page);
    await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);await page.evaluate(()=>show('vocab'));
    await openReview(page);await assertHiddenAnswer(page);
    assert.equal(await page.locator('#review-expression').innerText(),second,'Reload resumes the same ungraded card');
    assert.equal(await reviewState(page),savedAfterGrade,'Revealing alone is not a durable grade');
    const seen=[first];
    for(let i=1;i<5;i++){
      await assertHiddenAnswer(page);seen.push(await page.locator('#review-expression').innerText());
      await reveal(page);await page.locator('#review-remember').click();
    }
    assert.equal(new Set(seen).size,5,'No card repeats during the five-card session');
    await assertDone(page);await closeReview(page);
    await openReview(page);await assertHiddenAnswer(page);
    assert.equal((await progress(page)).at(-1),2,'Fewer than five remaining new cards are a complete smaller session');
    for(let i=0;i<2;i++){
      const word=await page.locator('#review-expression').innerText();assert.ok(!seen.includes(word),'Already graded cards do not instantly repeat');seen.push(word);
      await reveal(page);await page.locator('#review-remember').click();
    }
    await assertDone(page);await closeReview(page);await openReview(page);await assertDone(page);
    assert.equal(new Set(seen).size,7);
    assert.deepEqual(await persistedWords(page),before,'Review must preserve every vocabulary field, learning star, mark, tombstone and item record');
  });

  await scenario('empty Memory is actionable and dismissible',{},async page=>{
    await openReview(page);await assertDone(page);await closeReview(page,true);
    await page.locator('#wordbook-add').click();
    assert.equal(await page.locator('#wordbook-add-dialog').evaluate(element=>element.open),true,'The next real Memory control remains usable');
    await page.keyboard.press('Escape');
  });

  await scenario('saved senses and phrase highlighting are independent and HTML-safe',{
    bank:fixture('bank',1,{ko:'은행',example:'The bank is open.',book:'Finance source'}),
    'bank::river':fixture('bank',2,{root:'bank',sense:true,ko:'강둑',example:'We sat on the bank beside the river.',book:'River source'}),
    'take care of':fixture('take care of',3,{ko:'돌보다',example:'Please take care of <img src=x onerror="window.reviewInjected=true"> & keep <b>words</b> literal.',book:'Source <b>literal</b> & text',phrase:true})
  },async page=>{
    const before=await persistedWords(page),seen=[];
    await openReview(page);
    assert.equal((await progress(page)).at(-1),3,'Different saved senses remain separate review cards');
    for(let i=0;i<3;i++){
      await assertHiddenAnswer(page);
      const expression=await page.locator('#review-expression').innerText();
      const sentence=await page.locator('#review-sentence').innerText();
      const marks=await page.locator('#review-sentence mark').allTextContents();
      assert.ok(marks.some(text=>text.toLowerCase()===expression.toLowerCase()),'The saved expression is highlighted inside its original sentence');
      assert.equal(await page.locator('#review-sentence img, #review-sentence b, #review-source b').count(),0,'Saved text is never interpreted as HTML');
      await reveal(page);
      const meaning=await page.locator('#review-meaning').innerText();
      const source=await page.locator('#review-source').innerText();seen.push([expression,meaning]);
      if(expression==='take care of'){
        assert.ok(sentence.includes('<img src=x onerror="window.reviewInjected=true">'));
        assert.ok(sentence.includes('<b>words</b>'));
        assert.ok(source.includes('Source <b>literal</b> & text'));
      }
      assert.equal(await page.evaluate(()=>window.reviewInjected),undefined);
      await page.locator('#review-remember').click();
    }
    assert.deepEqual(seen.sort(),[['bank','은행'],['bank','강둑'],['take care of','돌보다']].sort());
    await assertDone(page);
    assert.deepEqual(await persistedWords(page),before);
  });

  await scenario('confused waits ten minutes and remembered waits days',{
    confused:fixture('confused',1),remembered:fixture('remembered',2)
  },async page=>{
    const before=await persistedWords(page);
    await openReview(page);
    for(let i=0;i<2;i++){
      const word=await page.locator('#review-expression').innerText();await reveal(page);
      await page.locator(word==='confused'?'#review-confused':'#review-remember').click();
    }
    await assertDone(page);await closeReview(page);await openReview(page);await assertDone(page);await closeReview(page);
    await page.clock.setFixedTime(NOW+9*60*1000+59000);
    await openReview(page);await assertDone(page);await closeReview(page);
    await page.clock.setFixedTime(NOW+10*60*1000+1000);
    await openReview(page);await assertHiddenAnswer(page);
    assert.equal(await page.locator('#review-expression').innerText(),'confused');
    assert.equal((await progress(page)).at(-1),1,'A remembered card is not due again after ten minutes');
    await reveal(page);await page.locator('#review-remember').click();await assertDone(page);await closeReview(page);
    await page.clock.setFixedTime(NOW+365*24*60*60*1000);
    await openReview(page);await assertHiddenAnswer(page);
    assert.equal((await progress(page)).at(-1),2,'Remembered cards become due on a later day');
    assert.deepEqual(await persistedWords(page),before);
  });

  await scenario('deleted session cards cannot resurrect',uniqueWords(3),async page=>{
    await openReview(page);
    const deleted=await page.locator('#review-expression').innerText();
    await page.evaluate(word=>{for(const [key,item] of Object.entries(words))if(item.word===word)delete words[key];saveWords();},deleted);
    await page.locator('#review-reveal').click();
    assert.notEqual(await page.locator('#review-expression').innerText(),deleted,'Revealing rechecks that the current Meaning still exists');
    await closeReview(page);await openReview(page);await assertHiddenAnswer(page);
    const seen=[];
    while(await page.locator('#review-reveal').isVisible()){
      seen.push(await page.locator('#review-expression').innerText());assert.ok(seen.length<=2,'Deleted cards do not extend the session');
      await reveal(page);await page.locator('#review-remember').click();
    }
    assert.equal(seen.length,2);assert.ok(!seen.includes(deleted));await assertDone(page);
    await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);await page.evaluate(()=>show('vocab'));
    assert.equal(await page.evaluate(word=>Object.values(words).some(item=>item.word===word),deleted),false,'Review never writes removed vocabulary back');
  });

  await scenario('failed progress storage is retryable without losing or duplicating a grade',uniqueWords(3),async page=>{
    const before=await persistedWords(page);
    await openReview(page);await reveal(page);
    const current=await page.locator('#review-expression').innerText();
    const answer=await page.locator('#review-meaning').innerText();
    const originalProgress=await progress(page),originalState=await reviewState(page);
    await page.evaluate(key=>{
      window.reviewOriginalSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(name,value){
        if(name===key)throw new DOMException('Simulated storage quota exhaustion','QuotaExceededError');
        return window.reviewOriginalSetItem.call(this,name,value);
      };
    },REVIEW_KEY);
    await page.locator('#review-remember').click();
    assert.equal(await page.locator('#review-error').isVisible(),true,'Storage failure is explained instead of silently losing progress');
    assert.ok((await page.locator('#review-error').innerText()).trim());
    assert.equal(await page.locator('#review-expression').innerText(),current,'A failed commit leaves the current card in place');
    assert.equal(await page.locator('#review-meaning').isVisible(),true,'The revealed answer stays visible so the grade can be retried');
    assert.equal(await page.locator('#review-meaning').innerText(),answer);
    assert.deepEqual(await progress(page),originalProgress);
    assert.equal(await reviewState(page),originalState,'Failure does not persist a partial grade');
    await page.evaluate(()=>{Storage.prototype.setItem=window.reviewOriginalSetItem;delete window.reviewOriginalSetItem;});
    await page.locator('#review-remember').click();
    await assertHiddenAnswer(page);
    assert.equal(await page.locator('#review-error').isVisible(),false,'Successful retry clears the error');
    assert.equal((await progress(page))[0],originalProgress[0]+1,'Retry advances exactly one card');
    const next=await page.locator('#review-expression').innerText();
    const persisted=await reviewState(page);assert.notEqual(persisted,originalState);
    await closeReview(page);await openReview(page);await assertHiddenAnswer(page);
    assert.equal(await page.locator('#review-expression').innerText(),next);
    assert.equal((await progress(page))[0],originalProgress[0]+1);
    assert.equal(await reviewState(page),persisted,'Reopening preserves exactly the successful retry');
    assert.deepEqual(await persistedWords(page),before);
  });

  await scenario('editing a revealed meaning rejects its stale grade',uniqueWords(3),async page=>{
    await openReview(page);await reveal(page);
    const edited=await page.locator('#review-expression').innerText();
    const replacement='복습 도중 새로 수정한 저장된 뜻';
    await page.evaluate(({word,ko})=>{
      const [key,item]=Object.entries(words).find(([,item])=>item.word===word);
      item.ko=ko;saveWords(key);
    },{word:edited,ko:replacement});
    const vocabularyAfterEdit=await persistedWords(page);
    await page.locator('#review-remember').click();
    await assertHiddenAnswer(page);
    assert.notEqual(await page.locator('#review-expression').innerText(),edited,'A stale revealed meaning is skipped before any new meaning can be graded');
    assert.deepEqual(await persistedWords(page),vocabularyAfterEdit,'Rejecting a stale grade does not overwrite the user edit');
    for(let i=0;i<2;i++){
      await reveal(page);await page.locator('#review-remember').click();
    }
    await assertDone(page);await closeReview(page);await openReview(page);await assertHiddenAnswer(page);
    assert.equal((await progress(page)).at(-1),1,'The edited meaning remains ungraded and is eligible for a new session');
    assert.equal(await page.locator('#review-expression').innerText(),edited);
    await reveal(page);
    assert.equal(await page.locator('#review-meaning').innerText(),replacement,'A fresh session reveals the newly saved meaning');
    assert.deepEqual(await persistedWords(page),vocabularyAfterEdit);
  });

  await scenario('keyboard, Escape, navigation and Back release modal focus',uniqueWords(3),async page=>{
    await page.locator('#wordbook-review').focus();await page.keyboard.press('Enter');
    await assertHiddenAnswer(page);
    for(let i=0;i<8;i++){
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#vocabulary-review-dialog').evaluate(element=>element.contains(document.activeElement)),true,'Tab remains inside the native modal');
    }
    await page.locator('#review-reveal').focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('#review-meaning').isVisible(),true);
    await page.locator('#review-remember').focus();await page.keyboard.press('Enter');await assertHiddenAnswer(page);
    const current=await page.locator('#review-expression').innerText();
    await closeReview(page,true);await openReview(page);
    assert.equal(await page.locator('#review-expression').innerText(),current);await assertHiddenAnswer(page);
    await page.evaluate(()=>show('home'));
    assert.equal(await page.locator('#vocabulary-review-dialog').evaluate(element=>element.open),false,'Leaving Memory closes the modal');
    assert.equal(await page.locator('dialog:modal').count(),0);
    await page.locator('#nav-vocab').click();await openReview(page);await assertHiddenAnswer(page);
    await page.goBack();
    await page.waitForFunction(()=>!document.getElementById('vocabulary-review-dialog').open);
    assert.equal(await page.locator('dialog:modal').count(),0,'Browser Back releases the review modal');
    await page.evaluate(()=>show('vocab'));await openReview(page);
    assert.equal(await page.locator('#review-expression').innerText(),current,'Navigation preserves unfinished session progress');
    await assertHiddenAnswer(page);await closeReview(page);
    await page.locator('#wordbook-controls .control-pill').click();
    assert.equal(await page.evaluate(()=>activeAppView()),'home');
  });

  await scenario('responsive light and dark layouts',{
    'take care of':fixture('take care of',1,{ko:'문맥에 맞는 아주 긴 저장된 한국어 뜻과 설명을 확인해요. '.repeat(8),example:'Please take care of '+('this long saved sentence with real reading context, ').repeat(14),book:'A very long saved book title / 아주 긴 원문 책 제목 '.repeat(5)})
  },async page=>{
    for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390],[320,360]])for(const dark of [false,true]){
      await page.setViewportSize({width,height});
      await page.evaluate(value=>{darkMode=value;applyDark();},dark);
      await openReview(page);await assertHiddenAnswer(page);await reveal(page);
      const layout=await page.locator('#vocabulary-review-dialog').evaluate(dialog=>{
        const rect=dialog.getBoundingClientRect(),style=getComputedStyle(dialog);
        return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,color:style.color,background:style.backgroundColor,documentWidth:document.documentElement.scrollWidth};
      });
      const label=`${width}x${height} ${dark?'dark':'light'}`;
      assert.ok(layout.x>=-1&&layout.right<=width+1&&layout.y>=-1&&layout.bottom<=height+1,`${label}: modal stays inside the viewport ${JSON.stringify(layout)}`);
      assert.ok(layout.scrollWidth<=layout.clientWidth+1,`${label}: no horizontal modal overflow`);
      assert.ok(layout.documentWidth<=width+1,`${label}: no horizontal page overflow`);
      assert.notEqual(layout.color,layout.background,`${label}: text and surface colors differ`);
      for(const id of ['review-close','review-remember','review-confused']){
        const control=page.locator('#'+id);await control.scrollIntoViewIfNeeded();
        const box=await control.boundingBox();
        assert.ok(box.width>=44&&box.height>=44,`${label}: ${id} maintains a 44px target`);
        assert.ok(box.x>=-1&&box.x+box.width<=width+1&&box.y>=-1&&box.y+box.height<=height+1,`${label}: ${id} can be reached without clipping`);
      }
      await page.locator('#review-close').scrollIntoViewIfNeeded();
      await page.screenshot({path:`${out}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`});
      await closeReview(page,true);
    }
  });
  console.log(`Vocabulary review browser regression passed (${engine.name()}); screenshots: ${out}`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
