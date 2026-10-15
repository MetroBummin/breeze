import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';

// Local synthetic fixtures only: every non-fixture network request is blocked.
const server=await serveStudyFixture();
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
let browser;
try{
  browser=await engine.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
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
  await page.evaluate(()=>{words.aOnly={word:'A private',ko:'A 계정',up:400,status:1};saveWords('aOnly');});
  await page.evaluate(async()=>{await switchLearningAccount('synthetic-B');words.b={word:'B private',ko:'B 계정',up:500,status:1};saveWords('b');});
  const bView=await page.evaluate(async()=>({keys:Object.keys(words),names:Object.values(words).map(item=>item&&item.word),sets:(await loadStudySets()).sets.map(set=>set.name)}));
  assert.equal(bView.keys.includes('aOnly'),false,'A-only word stays off account B');
  assert.equal(bView.names.includes('A private'),false);
  assert.equal(bView.names.includes('B private'),true);
  assert.equal(bView.keys.filter(key=>key.startsWith('guest')).length,50,'device guest words follow the active account');
  assert.deepEqual(bView.sets,['Synthetic 50'],'the device study set is copied into B');
  assert.equal(await page.locator('#study-sets-word-list>li').count(),0,'the open A view is cleared on account change');
  await page.evaluate(async()=>{await switchLearningAccount('synthetic-A');show('vocab');renderVocab();});
  assert.equal(await page.evaluate(()=>Object.keys(words).length),51);
  assert.equal(await page.evaluate(()=>words.b),undefined,'B-only word stays off account A');
  assert.equal(await page.evaluate(()=>words.aOnly.word),'A private');
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
  await page.evaluate(()=>{localStorage.setItem('breeze.words',JSON.stringify({legacy:{word:'legacy synthetic',ko:'귀속 확인',up:100,status:1,addedAt:100}}));localStorage.setItem('breeze.learning.legacy-decision.v1','retained');});
  assert.equal(await page.locator('#task-dialog[open]').count(),0);
  await page.evaluate(()=>confirmLegacyLearningImport());
  await page.waitForFunction(()=>Object.values(words).some(item=>item&&item.ko==='귀속 확인'));
  assert.equal(await page.locator('#task-dialog[open]').count(),0,'legacy data merges without a confirmation dialog');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('breeze.words')).legacy.ko),'귀속 확인');
  const merged=await page.evaluate(()=>Object.values(words).filter(item=>item&&item.ko==='귀속 확인').length);
  assert.equal(merged,1);
  await page.evaluate(()=>switchLearningAccount(null));
  assert.equal(await page.evaluate(()=>Object.values(words).some(item=>item&&item.ko==='귀속 확인')),false,'logout does not keep the account copy in the device view');
  assert.equal(await page.evaluate(()=>Object.values(words).some(item=>item&&(item.word==='A private'||item.word==='B private'))),false,'logout drops both accounts’ private words');
  assert.equal(await page.evaluate(()=>Object.keys(words).filter(key=>key.startsWith('guest')).length),50,'logout keeps the device guest words');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('breeze.words')).legacy.ko),'귀속 확인');
  await page.evaluate(()=>switchLearningAccount('synthetic-B'));
  await page.waitForFunction(()=>Object.values(words).some(item=>item&&item.ko==='귀속 확인'));
  const returnedB=await page.evaluate(()=>({privateB:Object.values(words).filter(item=>item&&item.word==='B private').length,privateA:Object.values(words).filter(item=>item&&item.word==='A private').length,guests:Object.keys(words).filter(key=>key.startsWith('guest')).length,legacy:Object.values(words).filter(item=>item&&item.ko==='귀속 확인').length}));
  assert.equal(returnedB.privateB,1,'B keeps the word saved on B');
  assert.equal(returnedB.privateA,0,'A-only word does not appear after logging into B');
  assert.equal(returnedB.guests,50);
  assert.equal(returnedB.legacy,1);
  assert.deepEqual(errors,[]);
  console.log('Account browser regression passed: device words follow the active account, A-only and B-only words stay put, open set clears, and legacy merge stays silent.');
}finally{await browser?.close();await server.close();}
