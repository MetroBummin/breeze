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
const failures=[];
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
    failures.push(error);console.error(`${engine.name()}: ${name} failed`,error);
  }finally{await context.close();}
}
async function openReview(page){
  await page.locator('#wordbook-review').click();
  assert.equal(await page.evaluate(()=>activeAppView()),'study');
  assert.equal(await page.locator('dialog:modal').count(),0,'Study is a page, not a modal');
  assert.equal(await page.locator('#vtablewrap').isVisible(),false,'Background Memory meanings cannot leak through the glass');
  assert.equal(await page.locator('#vocabulary-review-page').evaluate(element=>element.contains(document.activeElement)),true,'Focus enters the review dialog');
}
async function continueMilestone(page){
  if(await page.locator('#review-stage-mascot').isVisible())await page.locator('#review-more').click();
}
async function assertHiddenAnswer(page){
  await continueMilestone(page);
  assert.equal(await page.locator('#review-meaning').isVisible(),false,'Saved meaning stays hidden before recall');
  assert.equal(await page.locator('#review-reveal').isVisible(),true);
  for(const id of ['review-remember','review-confused','review-uncertain','review-easy']){
    assert.ok(!await page.locator('#'+id).isVisible()||await page.locator('#'+id).isDisabled(),`${id} cannot be used before reveal`);
  }
}
async function reveal(page){
  await continueMilestone(page);
  await page.locator('#review-reveal').click();
  assert.equal(await page.locator('#review-meaning').isVisible(),true);
  assert.ok((await page.locator('#review-meaning').innerText()).trim(),'Reveal shows a saved answer');
  assert.equal(await page.locator('#review-remember').isVisible(),true);
  assert.equal(await page.locator('#review-confused').isVisible(),true);
}
async function persistedWords(page){
  // LocalStorage enumeration order is unspecified after reload. Compare a deep
  // record snapshot, not JSON object-key order, while retaining exact item bytes.
  return page.evaluate(()=>({words:JSON.parse(JSON.stringify(words)),storage:Object.fromEntries(Object.keys(localStorage).filter(key=>key==='breeze.words'||key==='breeze.dead'||key.startsWith('breeze.word-item.')||key==='breeze.word-write.pending').sort().map(key=>[key,localStorage.getItem(key)]))}));
}
async function reviewState(page){return page.evaluate(key=>localStorage.getItem(key),REVIEW_KEY);}
async function progress(page){return (await page.locator('#review-progress').textContent()).match(/\d+/g)?.map(Number)||[];}
async function assertDone(page){
  assert.equal(await page.locator('#review-status').isVisible(),true,'End/empty state provides visible explanatory copy');
  assert.ok((await page.locator('#review-status').innerText()).trim());
  assert.equal(await page.locator('#review-reveal').isVisible(),false,'End state cannot reveal a stale answer');
  assert.equal(await page.locator('#review-meaning').isVisible(),false,'End state cannot leak a stale answer');
}
async function closeReview(page,keyboard=false){
  if(keyboard)await page.keyboard.press('Escape');else await page.locator('#review-close').click();
  await page.waitForFunction(()=>activeAppView()==='vocab');
  assert.equal(await page.locator('dialog:modal').count(),0,'Dismissal releases the native top layer');
  assert.equal(await page.locator('#vtablewrap').isVisible(),true,'Dismissal restores the unchanged Memory list');
  assert.equal(await page.locator('#wordbook-review').evaluate(element=>element===document.activeElement),true,'Dismissal restores initiating control focus');
}

try{
  await scenario('stage flow, hidden answers, durable progress and no mutation',uniqueWords(7),async page=>{
    const before=await persistedWords(page);
    assert.equal((await page.locator('#wordbook-review').innerText()).trim(),'학습 시작');
    await openReview(page);await assertHiddenAnswer(page);
    assert.equal((await progress(page)).at(-1),7,'The daily journey retains the whole goal');
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
    await continueMilestone(page);
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
    assert.equal((await progress(page)).at(-1),7,'Continuing a stage retains the original queue');
    for(let i=0;i<2;i++){
      await continueMilestone(page);
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

  await scenario('Again waits one minute while Good stays in learning',{
    confused:fixture('confused',1),remembered:fixture('remembered',2)
  },async page=>{
    const before=await persistedWords(page);
    await openReview(page);
    for(let i=0;i<2;i++){
      await continueMilestone(page);
      const word=await page.locator('#review-expression').innerText();await reveal(page);
      await page.locator(word==='confused'?'#review-confused':'#review-remember').click();
    }
    await assertDone(page);await closeReview(page);await openReview(page);await assertDone(page);await closeReview(page);
    await page.clock.setFixedTime(NOW+59000);
    await openReview(page);await assertDone(page);await closeReview(page);
    await page.clock.setFixedTime(NOW+61000);
    await openReview(page);await assertHiddenAnswer(page);
    assert.equal(await page.locator('#review-expression').innerText(),'confused');
    assert.equal((await progress(page)).at(-1),1,'Good is not due again after one minute');
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
    while(true){
      await continueMilestone(page);
      if(!await page.locator('#review-reveal').isVisible())break;
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

  await scenario('keyboard, Escape, Back and Forward navigate study without losing progress',uniqueWords(3),async page=>{
    await page.locator('#wordbook-review').focus();await page.keyboard.press('Enter');
    await assertHiddenAnswer(page);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#v-vocab').isVisible(),false);
    await page.locator('#review-reveal').focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('#review-meaning').isVisible(),true);
    await page.locator('#review-remember').focus();await page.keyboard.press('Enter');await assertHiddenAnswer(page);
    const current=await page.locator('#review-expression').innerText();
    await closeReview(page,true);await openReview(page);
    assert.equal(await page.locator('#review-expression').innerText(),current);await assertHiddenAnswer(page);
    await page.evaluate(()=>show('home'));
    assert.equal(await page.locator('#v-study').isVisible(),false,'Leaving Study changes the page');
    assert.equal(await page.locator('dialog:modal').count(),0);
    await page.locator('#nav-vocab').click();await openReview(page);await assertHiddenAnswer(page);
    await page.goBack();
    await page.waitForFunction(()=>activeAppView()==='vocab');
    assert.equal(await page.locator('dialog:modal').count(),0);
    await page.goForward();await page.waitForFunction(()=>activeAppView()==='study');await assertHiddenAnswer(page);
    await page.evaluate(()=>show('vocab'));await openReview(page);
    assert.equal(await page.locator('#review-expression').innerText(),current,'Navigation preserves unfinished session progress');
    await assertHiddenAnswer(page);await closeReview(page);
    await page.locator('#wordbook-home').click();
    assert.equal(await page.evaluate(()=>activeAppView()),'home');
  });

  await scenario('book filters and checkboxes target individual meanings',{
    bank:fixture('bank',1,{book:'Book A',ko:'은행',status:2}),
    river:fixture('bank',2,{root:'bank',sense:true,book:'Book B',ko:'강둑'}),
    tree:fixture('tree',3,{book:'Book B',ko:'나무',status:1})
  },async page=>{
    const dock=await page.locator('#wordbook-controls button').evaluateAll(nodes=>nodes.map(n=>n.id));
    assert.deepEqual(dock,['wordbook-home','wordbook-review','btn-export']);
    await page.locator('#vbooks summary').click();
    await page.locator('#vbook-options label').filter({hasText:'Book B'}).locator('input').check();
    await page.locator('#vbooks summary').click();
    assert.deepEqual(await page.locator('.vsense').evaluateAll(nodes=>nodes.map(n=>n.dataset.k).sort()),['river','tree']);
    await page.locator('#review-select-toggle').click();
    assert.equal(await page.locator('#wordbook-review').isDisabled(),true);
    await page.locator('#review-select-all').check();
    assert.equal(await page.locator('.review-pick input:checked').count(),2);
    await page.locator('.vsense[data-k="tree"] .review-pick input').uncheck();
    assert.equal(await page.locator('#review-select-all').evaluate(node=>node.indeterminate),true);
    await openReview(page);
    assert.equal(await page.locator('#review-source').innerText(),'Book B');
    await page.locator('#review-reveal').click();assert.equal(await page.locator('#review-meaning').innerText(),'강둑');
    await closeReview(page);
    await page.locator('#review-use-daily').click();
    assert.equal(await page.evaluate(()=>activeAppView()),'study');
    assert.equal(await page.locator('#review-title').count(),0);
    assert.equal(await page.locator('#review-card #review-progress').count(),1);
  });

  await scenario('flashcard front/back and four FSRS grades',uniqueWords(1),async page=>{
    await openReview(page);
    await page.locator('#review-flip').click();
    assert.equal(await page.locator('#review-front').isVisible(),false);
    assert.equal(await page.locator('#review-meaning').isVisible(),true);
    assert.equal(await page.locator('#review-confused-interval').textContent(),'1분');
    assert.equal(await page.locator('#review-uncertain-interval').textContent(),'6분');
    assert.equal(await page.locator('#review-remember-interval').textContent(),'10분');
    await page.locator('#review-flip').focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('#review-front').isVisible(),true);
    await page.locator('#review-uncertain').click();await assertDone(page);
    const stored=JSON.parse(await reviewState(page));
    assert.equal(stored.session.uncertain,1);
    assert.equal(await page.locator('#review-celebration').isVisible(),true);
    assert.equal(Object.values(stored.progress)[0].dueAt,NOW+360000);
    await closeReview(page);await page.clock.setFixedTime(NOW+360000-1);await openReview(page);await assertDone(page);
    await closeReview(page);await page.clock.setFixedTime(NOW+360000);await openReview(page);await assertHiddenAnswer(page);
  });

  await scenario('responsive light and dark layouts',{
    'take care of':fixture('take care of',1,{ko:'문맥에 맞는 아주 긴 저장된 한국어 뜻과 설명을 확인해요. '.repeat(8),example:'Please take care of '+('this long saved sentence with real reading context, ').repeat(14),book:'A very long saved book title / 아주 긴 원문 책 제목 '.repeat(5)})
  },async page=>{
    for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390],[320,360]])for(const dark of [false,true]){
      await page.setViewportSize({width,height});
      await page.evaluate(value=>{darkMode=value;applyDark();},dark);
      await openReview(page);await assertHiddenAnswer(page);await reveal(page);
      const layout=await page.locator('#vocabulary-review-page').evaluate(dialog=>{
        const rect=dialog.getBoundingClientRect(),style=getComputedStyle(dialog);
        return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,color:style.color,background:style.backgroundColor,documentWidth:document.documentElement.scrollWidth};
      });
      const label=`${width}x${height} ${dark?'dark':'light'}`;
      assert.ok(layout.x>=-1&&layout.right<=width+1,`${label}: study page fits the viewport width ${JSON.stringify(layout)}`);
      assert.ok(layout.scrollWidth<=layout.clientWidth+1,`${label}: no horizontal study overflow`);
      assert.ok(layout.documentWidth<=width+1,`${label}: no horizontal page overflow`);
      assert.notEqual(layout.color,layout.background,`${label}: text and surface colors differ`);
      for(const id of ['review-close','review-remember','review-confused','review-uncertain','review-easy']){
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
  await scenario('completion fits all screen sizes and returns to Memory',uniqueWords(1),async page=>{
    assert.equal(await page.locator('#wordbook-review-entry').isVisible(),false);
    await openReview(page);
    assert.equal((await page.locator('#review-close').innerText()).trim(),'');
    await reveal(page);await page.locator('#review-remember').click();
    for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390],[320,360]])for(const dark of [false,true]){
      await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();},dark);
      assert.equal(await page.locator('#review-celebration').isVisible(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('#review-close').scrollIntoViewIfNeeded();
      const box=await page.locator('#review-close').boundingBox();
      assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height+1);
      await page.locator('#review-more').scrollIntoViewIfNeeded();
      const cta=await page.locator('#review-more').boundingBox();
      assert.ok(cta.height>=44&&cta.x>=0&&cta.x+cta.width<=width&&cta.y>=0&&cta.y+cta.height<=height+1);
      await page.locator('#review-close').scrollIntoViewIfNeeded();
      await page.screenshot({path:`${out}/${engine.name()}-complete-${width}x${height}-${dark?'dark':'light'}.png`});
    }
    await page.locator('#review-close').click();assert.equal(await page.evaluate(()=>activeAppView()),'vocab');
  });

  await scenario('selection done preserves checks and empty scopes never expand',uniqueWords(8),async page=>{
    await page.locator('#review-select-toggle').click();
    await page.locator('.review-pick input').first().check();
    await page.locator('.review-pick input').nth(1).check();
    await page.locator('#review-select-toggle').click();
    assert.equal(await page.locator('#review-selection-count').textContent(),'2개 선택');
    assert.equal(await page.locator('.review-pick').count(),0);
    await openReview(page);
    assert.equal((await progress(page)).at(-1),2);
    assert.equal(await page.locator('#review-mode').textContent(),'연습 · 복습 일정에 영향 없음');
    await reveal(page);await page.locator('#review-remember').click();
    let saved=JSON.parse(await reviewState(page));
    assert.deepEqual(saved.progress,{});assert.equal(saved.history[0].kind,'practice');
    await closeReview(page);
    await page.locator('#review-select-toggle').click();
    assert.equal(await page.locator('.review-pick input:checked').count(),2);
    await page.locator('#review-select-all').check();
    await page.locator('#review-select-all').uncheck();
    await page.locator('#review-select-toggle').click();
    assert.equal(await page.locator('#wordbook-review').isDisabled(),true);
    await page.locator('#review-select-cancel').click();
    assert.equal(await page.locator('#review-selection-count').textContent(),'');
    await page.locator('#vsearch').fill('no such saved meaning');
    assert.equal(await page.locator('#wordbook-review').isDisabled(),true);
    await page.locator('#vsearch').fill('');
    await page.locator('#review-select-toggle').click();
    assert.equal(await page.locator('.review-pick input:checked').count(),0);
  });

  await scenario('setup limits, explicit extra and response counts survive failed saves',uniqueWords(12),async page=>{
    await page.evaluate(()=>openSettings());
    await page.locator('#review-daily-limit').fill('0');
    await page.locator('#set-close').click();
    assert.equal(JSON.parse(await reviewState(page)).settings.dailyLimit,0);
    assert.equal(await page.locator('#review-setup-extra').isVisible(),true);
    await openReview(page);
    assert.equal(await page.locator('#review-card').isVisible(),false);
    await closeReview(page);
    await page.locator('#review-setup-extra').click();
    assert.equal((await progress(page)).at(-1),12);
    await reveal(page);await page.locator('#review-confused').click();
    for(let i=1;i<5;i++){await reveal(page);await page.locator('#review-remember').click();}
    assert.equal(await page.locator('#review-reveal').isVisible(),true);
    assert.equal(await page.locator('#review-pending').isVisible(),false);
    assert.match(await page.locator('#review-pending').textContent(),/1분 뒤부터 학습·재학습 5개/);
    await page.clock.setFixedTime(NOW+60001);
    await closeReview(page);await page.locator('#review-setup-extra').click();
    assert.equal((await progress(page)).at(-1),1);
    await reveal(page);await page.locator('#review-remember').click();
    const saved=JSON.parse(await reviewState(page)),today=Object.values(saved.daily)[0];
    assert.equal(today.new.length,5);assert.equal(today.review.length,0);assert.equal(today.responses,6);
    assert.equal(saved.history.length,6);
  });

  await scenario('practice continues without five-card stops and resumes after reload',uniqueWords(8),async page=>{
    await page.locator('#review-select-toggle').click();await page.locator('#review-select-all').check();
    await page.locator('#review-select-toggle').click();await openReview(page);
    for(let i=0;i<5;i++){await reveal(page);await page.locator('#review-remember').click();}
    assert.equal(await page.locator('#review-reveal').isVisible(),true);
    assert.equal(await page.locator('#review-result').isVisible(),false);
    await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);await page.evaluate(()=>show('study'));
    assert.equal((await progress(page)).at(-1),8);
    for(let i=0;i<3;i++){await reveal(page);await page.locator('#review-remember').click();}
    const saved=JSON.parse(await reviewState(page));
    assert.deepEqual(saved.progress,{});assert.equal(saved.history.length,8);
    assert.equal(Object.values(saved.daily)[0].practice,8);
  });

  await scenario('v1 migration backup preserves unfinished queue and source edits',uniqueWords(3),async page=>{
    await page.evaluate(({key,at})=>{
      const refs=Object.entries(words).map(([key,w])=>({key,identity:JSON.stringify([key,w.word,w.ko,w.example,w.book,w.addedAt])}));
      const legacy={version:1,sequence:4,progress:{[refs[0].key]:{identity:refs[0].identity,streak:2,dueAt:at+86400000,lastReviewedAt:at}},session:{id:'old',startedAt:at,queue:refs,index:1,remembered:1,confused:0}};
      localStorage.setItem(key,JSON.stringify(legacy));
      words[refs[0].key].book='Renamed source';words[refs[1].key].example='Edited saved sentence';saveWords();
    },{key:REVIEW_KEY,at:NOW});
    await openReview(page);
    assert.deepEqual(await progress(page),[2,3]);
    const saved=JSON.parse(await reviewState(page));
    assert.equal(saved.version,3);assert.equal(Object.values(saved.progress)[0].streak,2);
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key+'.backup')).version,REVIEW_KEY),1);
    await reveal(page);await page.locator('#review-remember').click();
    assert.equal(JSON.parse(await reviewState(page)).history.length,1);
  });

  await scenario('single daily cap, no slider, persistence and responsive themes',uniqueWords(20),async page=>{
    assert.equal(await page.locator('#review-batch-range').count(),0);
    assert.equal(await page.locator('#review-new-limit').count(),0);
    assert.equal(await page.locator('dialog:modal').count(),0);
    await page.evaluate(()=>openSettings());
    await page.locator('[data-review-limit="200"]').click();
    assert.equal(JSON.parse(await reviewState(page)).settings.dailyLimit,200);
    await page.locator('#review-daily-limit').fill('8');await page.locator('#review-daily-limit').press('Tab');
    await page.locator('#set-close').click();
    await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);await page.evaluate(()=>show('vocab'));
    assert.equal(JSON.parse(await reviewState(page)).settings.dailyLimit,8);
    for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390],[320,360]])for(const dark of [false,true]){
      await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();},dark);
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:`${out}/${engine.name()}-inline-${width}x${height}-${dark?'dark':'light'}.png`});
      assert.match(await page.locator('#wordbook-review').innerText(),/학습 시작/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.evaluate(()=>openSettings());
      const input=page.locator('#review-daily-limit');await input.scrollIntoViewIfNeeded();const r=await input.boundingBox();
      assert.ok(r.width>=44&&r.height>=44&&r.x>=0&&r.x+r.width<=width+1&&r.y>=0&&r.y+r.height<=height+1);
      await page.screenshot({path:`${out}/${engine.name()}-app-settings-${width}x${height}-${dark?'dark':'light'}.png`});
      await page.locator('#set-close').click();
    }
    const original=await reviewState(page);
    await page.evaluate(key=>{window.originalReviewSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new Error('full');return window.originalReviewSet.call(this,k,v);};},REVIEW_KEY);
    await page.evaluate(()=>openSettings());await page.locator('#review-daily-limit').fill('10');await page.locator('#review-daily-limit').press('Tab');
    assert.equal(await page.locator('#review-limit-error').isVisible(),true);assert.equal(await reviewState(page),original);
    await page.locator('#set-close').click();await page.locator('#wordbook-review').click();
    assert.equal(await page.evaluate(()=>activeAppView()),'vocab');assert.equal(await reviewState(page),original);
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalReviewSet;});
    await openReview(page);await assertHiddenAnswer(page);assert.equal((await progress(page)).at(-1),8);
  });
  await scenario('progressive five stages, real assets and durable achievements',uniqueWords(100),async page=>{
    await page.evaluate(({key,at})=>{
      const state=BreezeReview.configure(null,{newLimit:0,reviewLimit:100,batchSize:5});
      for(const [id,w] of Object.entries(words))state.progress[id]={identity:JSON.stringify([id,w.word,w.ko,w.addedAt]),streak:1,dueAt:at-1,lastReviewedAt:at-86400000};
      localStorage.setItem(key,JSON.stringify(state));restoreReviewControls();refreshVocabularyReviewEntry();
    },{key:REVIEW_KEY,at:NOW});
    await openReview(page);
    const boundaries=[5,15,35,65,100];
    for(let answered=1;answered<=100;answered++){
      if(!await page.locator('#review-reveal').isVisible())await page.locator('#review-more').click();
      await page.locator('#review-reveal').click();
      await page.locator(answered===1?'#review-confused':'#review-remember').click();
      if(!boundaries.includes(answered))assert.equal(await page.locator('#review-reveal').isVisible(),true,'No intermediate five-card stop');
      if(boundaries.includes(answered)){
        const stage=boundaries.indexOf(answered)+1,mascot=page.locator('#review-stage-mascot');
        assert.equal(await mascot.isVisible(),true);
        assert.equal(await mascot.getAttribute('data-stage'),String(stage));
        assert.match(await mascot.getAttribute('src'),new RegExp(`thunderhead-stage-${stage}\\.png$`));
        await mascot.evaluate(img=>img.decode());
        assert.ok(await mascot.evaluate(img=>img.naturalWidth>0));
        assert.equal(await page.locator('#review-day-count').innerText(),`${answered}/100개`);
        assert.ok((await mascot.boundingBox()).width>=200);
        const aura=await page.locator('#review-mascot-scene').evaluate(node=>Number(getComputedStyle(node,'::before').opacity));
        assert.ok(Math.abs(aura-(.12+stage*.1))<.001);
        assert.equal(await mascot.evaluate(node=>getComputedStyle(node).animationName),'none');
        assert.equal(await page.locator('#review-mascot-scene').evaluate(node=>getComputedStyle(node,'::before').animationName),'none');
        assert.equal(await page.locator('#review-finish').count(),0);
        if(stage<5)assert.equal(await page.locator('#review-more').innerText(),'다음 단계 도전');
        {
          for(const dark of [false,true]){
            await page.evaluate(value=>{darkMode=value;applyDark();},dark);
            await page.screenshot({path:`${out}/${engine.name()}-stage-${stage}-${dark?'dark':'light'}.png`});
          }
        }
        if(stage===1){
          await page.locator('#review-close').click();await page.reload({waitUntil:'domcontentloaded'});
          await page.evaluate(()=>homeReady);await page.evaluate(()=>show('study'));
          assert.equal(await mascot.getAttribute('data-stage'),'1');
          assert.equal(await page.locator('#review-day-count').innerText(),'5/100개');
        }
      }
    }
    assert.equal(await page.locator('#review-result-title').innerText(),'오늘 목표 달성');
    assert.match(await page.locator('#review-pending').innerText(),/재학습/);
    const state=JSON.parse(await reviewState(page));
    assert.equal(state.history.length,100);assert.equal(state.daily[Object.keys(state.daily)[0]].studied.length,100);
    await page.evaluate(at=>{
      words.extra= {word:'extra',ko:'추가',addedAt:at,example:'Extra context'};saveWords();
    },NOW);
    await page.locator('#review-more').click();
    assert.equal(await page.locator('#review-reveal').isVisible(),true,'explicit final extra bypasses the zero new cap');
    assert.equal(await page.locator('#review-expression').innerText(),'extra');
    assert.equal(JSON.parse(await reviewState(page)).settings.dailyLimit,100);
  });
  for(const damaged of ['{broken','null','[]','42','"unexpected"','legacy','partial']){
    await scenario(`recovery ${damaged}`,uniqueWords(8),async page=>{
      const before=await persistedWords(page);
      const original=await page.evaluate(({key,damaged,at})=>{
        let raw=damaged;
        if(damaged==='legacy'||damaged==='partial'){
          const first=BreezeReview.start(null,words,at);
          const state=BreezeReview.grade(first.state,words,first.token,'easy',at).state;
          state.version=2;
          for(const progress of Object.values(state.progress))delete progress.fsrs;
          if(damaged==='partial'){state.progress.broken=null;state.history.push(null);state.session=null;}
          raw=JSON.stringify(state);
        }
        localStorage.setItem(key,raw);restoreReviewControls();refreshVocabularyReviewEntry();return raw;
      },{key:REVIEW_KEY,damaged,at:NOW});
      await openReview(page);
      await closeReview(page);
      await page.evaluate(()=>{openSettings();});
      await page.locator('#review-daily-limit').fill('12');
      await page.locator('#review-daily-limit').dispatchEvent('change');
      assert.equal(await page.locator('#review-limit-error').isVisible(),false);
      await page.evaluate(()=>{closeSettings();show('vocab');});
      await openReview(page);await reveal(page);await page.locator('#review-easy').click();
      await continueMilestone(page);
      const saved=JSON.parse(await reviewState(page));
      assert.equal(saved.settings.dailyLimit,12);
      assert.ok(saved.recovery?.backupKey);
      assert.equal(await page.locator('#review-recovery').isVisible(),true);
      assert.equal(saved.history.length,['legacy','partial'].includes(damaged)?2:1);
      assert.ok(await page.evaluate(({key,raw})=>Object.keys(localStorage).some(k=>k.startsWith(key+'.backup')&&localStorage.getItem(k)===raw),{key:REVIEW_KEY,raw:original}));
      const next=await page.locator('#review-expression').textContent();
      await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);await page.evaluate(()=>show('vocab'));
      await openReview(page);await assertHiddenAnswer(page);
      assert.equal(await page.locator('#review-expression').textContent(),next);
      assert.equal(JSON.parse(await reviewState(page)).history.length,saved.history.length);
      assert.deepEqual(await persistedWords(page),before);
    });
  }
  await scenario('recovery backup failure and future schema preserve original',uniqueWords(3),async page=>{
    for(const original of ['null','{"version":99,"progress":{"keep":"untouched"}}']){
      await page.evaluate(({key,raw})=>{localStorage.setItem(key,raw);window.reviewOriginalSet=Storage.prototype.setItem;
        Storage.prototype.setItem=function(k,v){if(k.startsWith(key+'.backup'))throw new DOMException('quota','QuotaExceededError');return window.reviewOriginalSet.call(this,k,v);};
      },{key:REVIEW_KEY,raw:original});
      await page.evaluate(()=>openVocabularyReview());
      assert.equal(await reviewState(page),original);
      assert.equal(await page.locator('#review-setup-error').isVisible(),true);
      await page.evaluate(()=>{Storage.prototype.setItem=window.reviewOriginalSet;});
    }
  });
  await scenario('four grades visual proof and exact displayed intervals',uniqueWords(5),async page=>{
    await openReview(page);await reveal(page);
    for(const dark of [false,true]){
      await page.evaluate(value=>{darkMode=value;applyDark();},dark);
      assert.deepEqual(await page.locator('#review-grade button span').allTextContents(),['다시','어려움','알겠음','쉬움']);
      assert.equal(await page.locator('#review-easy-interval').textContent(),'8일');
      await page.screenshot({path:`${out}/${engine.name()}-four-grades-${dark?'dark':'light'}.png`,fullPage:true});
    }
    const before=await page.evaluate(()=>vocabularyReviewView.intervals.easy);
    await page.locator('#review-easy').click();
    const event=JSON.parse(await reviewState(page)).history.at(-1);
    assert.equal(Date.parse(event.schedule.after.due)-event.at,before);
    assert.equal(event.schedule.rating,4);
  });
  if(failures.length)throw new AggregateError(failures,`${engine.name()}: ${failures.length} review scenarios failed`);
  console.log(`Vocabulary review browser regression passed (${engine.name()}); screenshots: ${out}`);
}finally{await browser.close();await new Promise(done=>server.close(done));}
