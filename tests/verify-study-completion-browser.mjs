// Shipping-page contracts. The typed-test prototype opt-in is deliberately OFF.
// Playwright browser interactions are not physical-device acceptance.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
import {studyAction} from './helpers/study-actions.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=process.env.BREEZE_COMPLETION_PROOF||'/tmp/breeze-study-completion-proof';mkdirSync(out,{recursive:true});
const server=await serveStudyFixture(),browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const fixtures={
 bank:{word:'bank',ko:'은행',example:'The bank opens at nine.',book:'Reading',addedAt:1,status:2},
 river:{word:'bank',root:'bank',ko:'강둑',example:'We sat on the river bank.',book:'Reading',addedAt:2,status:1},
 calm:{word:'calm',ko:'차분한',example:'The calm sea reflected the moon.',book:'Reading',addedAt:3,status:3}
};
const results=[];
async function raw(page,scope){return page.evaluate(async scope=>scope==='set'
 ?readStudyStorage(STUDY_SETS_STORAGE,BreezeStudySets.decode):readStudyStorage(SIMPLE_STUDY_STORAGE,decodeSimpleStudySession),scope);}
async function detail(page,scope,id){
 await page.evaluate(()=>{show('vocab');openStudySetsDirectory();});
 await page.waitForSelector('#study-sets-dialog[open]');
 await studyAction(page.locator(scope==='set'?`.study-sets-home-card[data-set-id="${id}"]`:'#study-sets-all').click(),page);
 await page.waitForFunction(scope=>activeAppView()==='memory-set'&&studySetsUI.screen===(scope==='set'?'detail':'all'),scope);
}
async function start(page,scope){
 await studyAction(page.locator(scope==='set'?'#study-sets-start':'#study-all-words-start').click(),page);
 await page.waitForFunction(scope=>scope==='set'?studySetsUI.screen==='study'&&!studySetsUI.mutating:activeAppView()==='study'&&!simpleStudyBusy,scope);
}
async function remember(page,scope){
 await studyAction(page.locator(scope==='set'?'#study-sets-flashcard':'#review-flip').click(),page);
 await studyAction(page.locator(scope==='set'?'#study-sets-grade-remembered':'#simple-word-next').click(),page);
}
async function completion(page,scope){
 const box=page.locator(scope==='set'?'.study-sets-complete':'#simple-study-completion');await box.waitFor({state:'visible'});
 assert.deepEqual(await box.locator('button:visible').allTextContents(),['세트로 돌아가기','다시 시작하기']);
 assert.equal(await page.getByRole('button',{name:'학습 결과 보기',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'다시 시작하기',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'세트로 돌아가기',exact:true}).count(),1);
}
try{
 for(const scope of ['set','all']){
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),errors=[],egress=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/functions\/v1\/dict|openrouter/.test(r.url()))egress.push(r.url());});
  try{
   await prepareStudyPage(page,server.url);
   const id=await page.evaluate(async data=>{
    words=data;saveWords();show('vocab');
    const state=await loadStudySets(),made=BreezeStudySets.create(state,{name:'저장한 단어',bookTitles:['Reading']},words,100);
    await commitStudySets(made.state);
    const manifest=BreezeVocabularyTest.start(BreezeVocabularyTest.cards(Object.entries(words)),'Retained test',1,()=>.5,100);
    const test=await replaceVocabularyTest(manifest,null);
    await writeVocabularyTestAnswer(test,{index:0,text:'남겨 둔 답안',submitted:false,verdict:null,at:100});
    return made.state.sets[0].id;
   },fixtures);
   const savedWords=await page.evaluate(()=>JSON.stringify(words));
   const savedTest=await page.evaluate(async()=>{const s=await readVocabularyTest();return JSON.stringify({...s,answers:[...s.answers],batches:[...s.batches]});});
   assert.equal(await page.evaluate(()=>BreezeVocabularyTest.ENABLED),false);
   assert.equal(await page.locator('#wordbook-test').isVisible(),false);
   await page.evaluate(async()=>{await openVocabularyTest({kind:'all'});await resumeVocabularyTestPage();});
   assert.equal(await page.evaluate(()=>activeAppView()),'vocab','disabled direct entries cannot open a test');
   await page.evaluate(()=>show('vocabulary-test',{fromHistory:true}));
   assert.equal(await page.evaluate(()=>activeAppView()),'vocab','old test history falls back to Memory');
   await detail(page,scope,id);
   assert.equal(await page.locator('#study-sets-test,#study-all-words-test').count(),0);
   await start(page,scope);await remember(page,scope);
   const progress=page.locator(scope==='set'?'#study-sets-progress':'#review-progress');assert.equal(await progress.innerText(),'1 / 2');
   const partial=await raw(page,scope);
   // Interrupted study retains its committed point through leaving and reentry.
   await studyAction(page.locator(scope==='set'?'#study-sets-back':'#review-close').click(),page);
   await detail(page,scope,id);
   await page.waitForFunction(scope=>document.getElementById(scope==='set'?'study-sets-start':'study-all-words-start')?.textContent==='이어서 학습 · 1/2',scope);
   assert.equal(await raw(page,scope),partial,'navigation preserves the incomplete durable session');
   await start(page,scope);assert.equal(await progress.innerText(),'1 / 2');
   await remember(page,scope);await completion(page,scope);
   const complete=await raw(page,scope);
   // Completion actions occur once at the final answer, without a results-entry step.
   await studyAction(page.locator(scope==='set'?'#study-sets-complete-back':'#simple-study-complete-back').click(),page);
   await detail(page,scope,id);
   const entry=page.locator(scope==='set'?'#study-sets-start':'#study-all-words-start');
   assert.equal(await entry.innerText(),'학습 시작하기');
   assert.equal(await raw(page,scope),complete,'reentry preserves completed answers and history');
   await page.reload();await page.evaluate(()=>homeReady);await detail(page,scope,id);
   assert.equal(await entry.innerText(),'학습 시작하기');
   assert.equal(await raw(page,scope),complete,'reload does not clear completed history');
   await start(page,scope);assert.equal(await progress.innerText(),'0 / 2','only explicit start creates the next full session');
   await remember(page,scope);await remember(page,scope);await completion(page,scope);
   const layouts=[];
   for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
    await page.setViewportSize({width,height});await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);await completion(page,scope);
    const bounds=await page.getByRole('button',{name:'다시 시작하기',exact:true}).boundingBox();
    assert.ok(bounds&&bounds.width>=44&&bounds.height>=44&&bounds.x>=-1&&bounds.x+bounds.width<=width+1&&bounds.y>=-1&&bounds.y+bounds.height<=height+1,JSON.stringify({scope,width,height,dark,bounds}));
    await page.screenshot({path:`${out}/${engine.name()}-${scope}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});layouts.push({width,height,dark,bounds});
   }
   // Duplicate and detached terminal buttons cannot create two fresh sessions.
   const restartId=scope==='set'?'study-sets-restart':'simple-study-restart';
   await page.evaluate(({restartId,scope})=>{
    window.qaRestartWrites=0;const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key){if(this.name==='records'&&key===(scope==='set'?STUDY_SETS_STORAGE:SIMPLE_STUDY_STORAGE))qaRestartWrites++;return put.call(this,value,key);};
    window.qaRestartButton=document.getElementById(restartId);qaRestartButton.click();qaRestartButton.click();
   },{restartId,scope});
   await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);
   assert.equal(await progress.innerText(),'0 / 2');assert.equal(await page.evaluate(()=>qaRestartWrites),1);
   const fresh=await raw(page,scope);await page.evaluate(()=>qaRestartButton.click());await page.waitForTimeout(50);
   assert.equal(await raw(page,scope),fresh);assert.equal(await page.evaluate(()=>qaRestartWrites),1);
   assert.equal(await page.evaluate(()=>JSON.stringify(words)),savedWords,'word data and all meanings retained');
   assert.equal(await page.evaluate(async()=>{const s=await readVocabularyTest();return JSON.stringify({...s,answers:[...s.answers],batches:[...s.batches]});}),savedTest,'disabled prototype answers retained');
   assert.deepEqual(errors,[]);assert.deepEqual(egress,[]);results.push({scope,layouts,partialPreserved:true,completePreservedOnReentry:true,restartWrites:1,prototypeDataRetained:true});
   console.log(`${engine.name()} ${scope}: interrupted resume, terminal actions, completed reentry/reload, explicit restart and retained data passed`);
  }catch(error){await page.screenshot({path:`${out}/${engine.name()}-${scope}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await page.close();}
 }
 writeFileSync(`${out}/${engine.name()}.json`,JSON.stringify({engine:engine.name(),native:false,prototypeEnabled:false,results},null,2));
}finally{await browser.close();await server.close();}
