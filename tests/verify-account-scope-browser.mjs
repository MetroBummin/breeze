import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';

// Local synthetic fixtures only: every non-fixture network request is blocked.
const server=await serveStudyFixture();
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await prepareStudyPage(page,server.url);
  const initial=await page.evaluate(async()=>{
    for(let i=0;i<50;i++)words['guest'+i]={word:'synthetic '+i,ko:'합성 뜻 '+i,book:'Absent fixture book',up:100,addedAt:100,status:1};
    saveWords();
    const made=BreezeStudySets.create(await loadStudySets(),{name:'Synthetic 50',bookTitles:['Absent fixture book']},words,100);
    const excluded=BreezeStudySets.exclude(made.state,made.set.id,made.set.cards[0].id,200).state;
    await commitStudySets(excluded);
    const saved=BreezeStudySetTest.save(null,made.set.id,{id:'synthetic-summary',at:300,count:10,correct:8,score:80});
    localStorage.setItem(learningStorageKey(BreezeStudySetTest.KEY),saved.raw);
    await switchLearningAccount('synthetic-A');
    show('vocab');renderVocab();
    return {scope:captureLearningScope(),wordCount:Object.keys(words).length,learning:await exportLearningStorage()};
  });
  assert.equal(initial.wordCount,50);assert.equal(initial.learning.sets.sets.length,1);
  await page.evaluate(async()=>openStudySet((await loadStudySets()).sets[0].id));
  await page.waitForFunction(()=>studySetsUI.pageOpen&&!studySetsUI.mutating&&document.querySelectorAll('#study-sets-word-list>li').length===49);
  await page.evaluate(async()=>{await switchLearningAccount('synthetic-B');words.b={word:'B private',ko:'B 계정',up:500,status:1};saveWords('b');});
  assert.deepEqual(await page.evaluate(()=>Object.keys(words)),['b']);
  assert.equal(await page.evaluate(async()=>(await loadStudySets()).sets.length),0);
  assert.equal(await page.locator('#study-sets-word-list>li').count(),0,'old set rows cleared on account change');
  await page.evaluate(async()=>{await switchLearningAccount('synthetic-A');show('vocab');renderVocab();});
  assert.equal(await page.evaluate(()=>Object.keys(words).length),50);
  assert.equal(await page.evaluate(()=>words.b),undefined);
  const returned=await page.evaluate(()=>exportLearningStorage());
  assert.deepEqual(returned.tests,initial.learning.tests);assert.deepEqual(returned.sets,initial.learning.sets);

  const remote=await browser.newContext({viewport:{width:820,height:1180},serviceWorkers:'block'});
  const other=await remote.newPage();other.on('pageerror',error=>errors.push(error.message));await prepareStudyPage(other,server.url);
  await other.evaluate(async learning=>{await switchLearningAccount('synthetic-A');await mergeLearningStorage(learning);show('vocab');openStudySet((await loadStudySets()).sets[0].id);},initial.learning);
  await other.waitForFunction(()=>document.querySelectorAll('#study-sets-word-list>li').length===49);
  assert.equal(await other.evaluate(()=>Object.keys(words).length),0,'learning payload arrived before vocabulary');
  assert.equal(await other.evaluate(()=>books.some(book=>book.title==='Absent fixture book')),false);
  const availability=await other.evaluate(()=>{
    const state=readStudySets(),set=state.sets[0],started=BreezeStudySets.start(state,set.id,1000,{words,deletedKeys:dead});
    return {listed:BreezeStudySets.listedCards(set,words,false,{deletedKeys:dead}).length,queued:started.state.sets[0].session.queue.length,excluded:set.excludedIds.length};
  });
  assert.deepEqual(availability,{listed:49,queued:49,excluded:1});
  const proof='/tmp/breeze-account-scope-proof';mkdirSync(proof,{recursive:true});
  await page.evaluate(()=>{localStorage.setItem('breeze.words',JSON.stringify({legacy:{word:'legacy synthetic',ko:'귀속 확인',up:100}}));void confirmLegacyLearningImport();});
  await page.locator('#task-dialog[open]').waitFor();
  const layouts=[];
  for(const viewport of [{width:390,height:844},{width:820,height:1180},{width:1440,height:900},{width:320,height:568},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    for(const dark of [false,true]){
      await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
      const metrics=await page.locator('#task-dialog').evaluate(node=>{
        const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,text:node.innerText};
      });
      assert.ok(metrics.x>=0&&metrics.y>=0&&metrics.right<=viewport.width&&metrics.bottom<=viewport.height,'ownership confirmation fits viewport');
      assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,'confirmation has no horizontal overflow');
      assert.match(metrics.text,/원본은 이 기기에 그대로 보관/);
      const name=`${viewport.width}x${viewport.height}-${dark?'dark':'light'}`;
      await page.screenshot({path:`${proof}/legacy-${name}.png`});layouts.push({name,...metrics});
    }
  }
  await page.locator('#task-dialog .task-actions [data-task-cancel]').click();
  await page.waitForFunction(()=>localStorage.getItem('breeze.learning.legacy-decision.v1')==='retained');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('breeze.words')).legacy.ko),'귀속 확인');
  writeFileSync(`${proof}/layouts.json`,JSON.stringify(layouts,null,2));
  assert.deepEqual(errors,[]);
  console.log(`Account browser regression passed: guest50, A/B/A with open set, exact summary retention, set-before-words and missing book on second device; legacy confirmation ${layouts.length} layouts (${proof}).`);
}finally{await browser?.close();await server.close();}
