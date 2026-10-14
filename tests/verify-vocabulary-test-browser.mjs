import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const proof=process.env.BREEZE_TEST_PROOF||'/tmp/breeze-vocabulary-test-proof';mkdirSync(proof,{recursive:true});
// The prototype remains tested explicitly; it is disabled in the shipping page.
// verify-study-completion-browser.mjs separately asserts ordinary release exclusion.
const server=await serveStudyFixture({vocabularyTestPrototype:true}),browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const metrics=[];
const words={
 bank:{word:'bank',ko:'은행',example:'The bank opens at nine.',book:'Reading',addedAt:1,status:1},
 bankRiver:{word:'bank',ko:'강둑',example:'We sat on the river bank.',book:'Reading',root:'bank',addedAt:2,status:1},
 quiet:{word:'quiet',ko:'조용한',example:'The quiet room helped us think.',book:'Reading',addedAt:3,status:2},
 brave:{word:'brave',ko:'용감한',example:'He made a brave decision today.',book:'Reading',addedAt:4,status:1},
 dirty:{word:'gentle',ko:'부드러운',example:'gentle은 부드러운 뜻입니다.',book:'Reading',addedAt:5,status:1},
 instruction:{word:'bright',ko:'밝은',example:'Choose the correct answer for bright.',book:'Reading',addedAt:6,status:1},
 calm:{word:'calm',ko:'차분한',example:'The calm sea reflected the moon.',book:'Reading',addedAt:7,status:1},
 careful:{word:'careful',ko:'조심스러운',example:'A careful reader noticed the detail.',book:'Reading',addedAt:8,status:1},
 promise:{word:'promise',ko:'약속',example:'She kept her promise to return.',book:'Reading',addedAt:9,status:1},
 gather:{word:'gather',ko:'모이다',example:'People gather near the old bridge.',book:'Reading',addedAt:10,status:1},
 distant:{word:'distant',ko:'먼',example:'We could see a distant mountain.',book:'Reading',addedAt:11,status:1},
 simple:{word:'simple',ko:'간단한',example:'The simple plan worked very well.',book:'Reading',addedAt:12,status:1}
};
async function scenario(name,run){
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],egress=[];
 page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/functions\/v1\/dict|openrouter|typesafe/.test(r.url()))egress.push(r.url());});
 try{await prepareStudyPage(page,server.url);await run(page);assert.deepEqual(errors,[],name+' browser errors');assert.deepEqual(egress,[],name+' external inference');console.log(engine.name()+': '+name+' passed');}
 catch(error){await page.screenshot({path:proof+'/'+engine.name()+'-failure-'+name.replace(/\W+/g,'-')+'.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await page.close();}
}
async function seed(page,data=words){await page.evaluate(data=>{words=data;saveWords();show('vocab');renderVocab();},data);}
async function open(page){await page.locator('#wordbook-test').click();await page.waitForFunction(()=>activeAppView()==='vocabulary-test'&&!vocabularyTestUI.loading);}
async function start(page,count){if(count!==undefined)await page.locator('#vocabulary-test-count').fill(String(count));await page.locator('#vocabulary-test-start').click();if(await page.locator('#vocabulary-test-replace').count())await page.locator('#vocabulary-test-replace').click();await page.locator('#vocabulary-test-answer').waitFor();}
async function answer(page,text='모르겠어요'){
 const before=await page.evaluate(()=>vocabularyTestUI.session.meta.index);
 await page.locator('#vocabulary-test-answer').fill(text);await page.locator('#vocabulary-test-next').click();
 await page.waitForFunction(i=>!vocabularyTestUI.busy&&vocabularyTestUI.session.meta.index===i+1,before);
}
async function snapshot(page){return page.evaluate(async()=>({words:words,local:Object.fromEntries(Object.keys(localStorage).filter(k=>/word|review|simple-study|study-sets/.test(k)).sort().map(k=>[k,localStorage.getItem(k)])),sets:await readStudyStorage(STUDY_SETS_STORAGE,BreezeStudySets.decode)}));}
try{
 await scenario('empty scope and count bounds',async page=>{
  await page.evaluate(()=>show('vocab'));await open(page);assert.equal(await page.locator('#vocabulary-test-start').count(),0);
  await page.locator('#vocabulary-test-close').click();await seed(page);await open(page);
  assert.equal(await page.locator('#vocabulary-test-count').getAttribute('max'),'11');
  for(const n of ['0','12','1.5']){await page.locator('#vocabulary-test-count').fill(n);await page.locator('#vocabulary-test-start').click();assert.equal(await page.locator('#vocabulary-test-answer').count(),0);}
  await start(page,1);await answer(page,'');assert.match(await page.locator('#vocabulary-test-summary').innerText(),/확인 필요 1/);
  assert.equal(await page.locator('[data-batch="0"]').getAttribute('data-status'),'waiting');
 });
 await scenario('typed draft resumes, safe prompts, storage failure and isolated results',async page=>{
  await seed(page);const before=await snapshot(page);await open(page);await start(page,11);
  const order=await page.evaluate(()=>vocabularyTestUI.session.manifest.cards.map(c=>c.word));assert.equal(new Set(order).size,11);
  await page.locator('#vocabulary-test-answer').fill('입력하던 뜻');await page.waitForFunction(()=>!vocabularyTestUI.saveJob);
  await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>show('vocab'));await open(page);await page.locator('#vocabulary-test-resume').click();
  assert.equal(await page.locator('#vocabulary-test-answer').inputValue(),'입력하던 뜻');assert.deepEqual(await page.evaluate(()=>vocabularyTestUI.session.manifest.cards.map(c=>c.word)),order);
  await page.evaluate(()=>{window.testPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name==='breeze-vocabulary-test')throw new DOMException('Synthetic storage full','QuotaExceededError');return window.testPut.apply(this,args);};});
  await page.locator('#vocabulary-test-answer').fill('보존해야 할 답');await page.locator('#vocabulary-test-error').waitFor();await page.locator('#vocabulary-test-next').click();
  assert.equal(await page.evaluate(()=>vocabularyTestUI.session.meta.index),0);assert.equal(await page.locator('#vocabulary-test-answer').inputValue(),'보존해야 할 답');
  await page.waitForFunction(()=>!vocabularyTestUI.busy&&!vocabularyTestUI.saveJob);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.testPut;});await page.locator('#vocabulary-test-retry').click();await page.waitForFunction(()=>!vocabularyTestUI.saveJob);
  for(let i=0;i<11;i++){
   const word=order[i],prompt=await page.locator('#vocabulary-test-prompt').innerText();
   for(const ko of Object.values(words).map(w=>w.ko))assert.ok(!prompt.includes(ko),'prompt leaks '+ko);
   assert.equal(await page.locator('#vocabulary-test-sentence').count(),0,'all examples stay hidden, including algorithm-approved sentences');
   await answer(page,i===0?'고요한':'');
  }
  assert.equal(await page.locator('.vocabulary-test-result').count(),11);assert.match(await page.locator('#vocabulary-test-ai-note').innerText(),/아직 연결되지/);
  const bank=page.locator('.vocabulary-test-result').filter({has:page.getByRole('heading',{name:'bank',exact:true})});assert.match(await bank.locator('.vocabulary-test-expected').innerText(),/1\. 은행\n2\. 강둑/);
  assert.deepEqual(await snapshot(page),before);
  await page.screenshot({path:proof+'/'+engine.name()+'-phone-results-light.png',fullPage:true});
 });
 await scenario('ten answer batches continue, late results and tail are isolated',async page=>{
  await seed(page);await page.evaluate(()=>{window.testBatches=[];window.testResponses=[];window.BreezeVocabularyTestGrader=createVocabularyTestGrader(payload=>{window.testBatches.push(payload);return new Promise(resolve=>window.testResponses.push(()=>resolve({model:'typesafe/jev-1.13',results:payload.items.map((_,i)=>({id:'q'+i,status:i===0?'correct':i===1?'incorrect':'uncertain'}))})));});});
  await open(page);await start(page,11);
  for(let i=0;i<10;i++)await answer(page,'테스트 답');
  await page.waitForFunction(()=>window.testBatches.length===1);assert.match(await page.locator('#vocabulary-test-progress').innerText(),/11 \/ 11/);
  assert.equal(await page.locator('[data-batch="0"]').getAttribute('data-status'),'grading');
  await page.evaluate(()=>{queueVocabularyTestBatches();queueVocabularyTestBatches();});assert.equal(await page.evaluate(()=>window.testBatches.length),1);
  await page.locator('#vocabulary-test-answer').fill('계속 입력');await page.evaluate(()=>window.testResponses[0]());await page.waitForFunction(()=>vocabularyTestUI.session.batches.get(0).status==='complete');
  assert.equal(await page.locator('#vocabulary-test-answer').inputValue(),'계속 입력');await page.locator('[data-batch="0"] summary').click();await page.locator('.vocabulary-test-batch-answer').first().waitFor();assert.equal(await page.locator('.vocabulary-test-batch-answer').count(),10);
  await page.screenshot({path:proof+'/'+engine.name()+'-phone-previous-batch.png',fullPage:true});
  await answer(page,'마지막');await page.waitForFunction(()=>window.testBatches.length===2);
  assert.deepEqual(await page.evaluate(()=>window.testBatches.map(b=>b.items.length)),[10,1]);
  assert.equal(await page.evaluate(()=>window.testBatches.every(b=>b.items.every(item=>item.example===''))),true,'grading inputs remain word/meaning only');
  await page.evaluate(()=>window.testResponses[1]());await page.waitForFunction(()=>vocabularyTestUI.session.batches.get(10).status==='complete');
  const ids=await page.evaluate(()=>window.testBatches.map(b=>b.batchId));assert.equal(new Set(ids).size,2);
  await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>show('vocab'));await open(page);await page.locator('#vocabulary-test-resume').click();assert.equal(await page.locator('[data-batch="10"]').getAttribute('data-status'),'complete');
 });
 await scenario('real user set uses captured meanings after source deletion',async page=>{
  await seed(page);await page.evaluate(async()=>{const created=BreezeStudySets.create(await loadStudySets(),{name:'문맥 테스트',bookTitles:['Reading']},words,100);await commitStudySets(created.state);words={};saveWords();renderVocab();});
  await page.locator('#wordbook-review').click();await page.locator('.study-sets-home-card[data-set-id]').first().click();await page.locator('#study-sets-test').click();await page.waitForFunction(()=>!vocabularyTestUI.loading);
  assert.ok(Number(await page.locator('#vocabulary-test-count').getAttribute('max'))>=10);await start(page,3);for(let i=0;i<3;i++)await answer(page,'뜻');
  await page.locator('#vocabulary-test-close').click();await page.waitForFunction(()=>activeAppView()==='memory-set');assert.equal(await page.locator('#study-sets-title').innerText(),'문맥 테스트');
 });
 await scenario('large scopes, frozen random sample and bounded DOM',async page=>{
  for(const size of [2000,12000]){
   await page.evaluate(async size=>{words=Object.fromEntries(Array.from({length:size},(_,i)=>['w'+i,{word:'word'+i,ko:'뜻 '+i,example:'This saved sentence includes word'+i+'.',addedAt:i+1,status:1}]));show('vocab');await openVocabularyTest({kind:'all'});},size);
   await page.waitForFunction(()=>!vocabularyTestUI.loading);await page.locator('#vocabulary-test-count').fill('100');const began=performance.now();await start(page,100);
   const stats=await page.evaluate(()=>({count:vocabularyTestUI.session.manifest.cards.length,unique:new Set(vocabularyTestUI.session.manifest.cards.map(c=>c.word)).size,nodes:document.querySelectorAll('#v-vocabulary-test *').length,order:vocabularyTestUI.session.manifest.cards.map(c=>c.word)}));
   assert.equal(stats.count,100);assert.equal(stats.unique,100);assert.ok(stats.nodes<100);assert.notDeepEqual(stats.order,Array.from({length:100},(_,i)=>'word'+i));metrics.push({size,sample:100,startMs:Math.round(performance.now()-began),nodes:stats.nodes});
   await page.locator('#vocabulary-test-close').click();await page.waitForFunction(()=>activeAppView()!=='vocabulary-test');
  }
  await page.evaluate(()=>openVocabularyTest({kind:'all'}));await page.waitForFunction(()=>!vocabularyTestUI.loading);const began=performance.now();await start(page,12000);
  const stats=await page.evaluate(async()=>({count:(await readVocabularyTest()).manifest.cards.length,nodes:document.querySelectorAll('#v-vocabulary-test *').length}));assert.equal(stats.count,12000);assert.ok(stats.nodes<100);metrics.push({size:12000,sample:12000,startMs:Math.round(performance.now()-began),nodes:stats.nodes});
  await answer(page,'답');
 });
 await scenario('responsive light dark keyboard and accessible zoom contracts',async page=>{
  await seed(page,{quiet:words.quiet});await open(page);
  for(const [width,height] of [[390,844],[820,1180]])for(const dark of [false,true]){await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);await page.screenshot({path:`${proof}/${engine.name()}-setup-${width}-${dark?'dark':'light'}.png`,fullPage:true});}
  await start(page,1);
  assert.doesNotMatch(await page.locator('meta[name=viewport]').getAttribute('content'),/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[.,\s]|$)/);
  for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390],[390,380]])for(const dark of [false,true]){
   await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
   const input=page.locator('#vocabulary-test-answer');assert.ok(await input.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))>=16);
   await input.focus();assert.equal(await page.evaluate(()=>document.activeElement.id),'vocabulary-test-answer');assert.equal(await page.evaluate(()=>visualViewport.scale),1);
   await input.fill('고요한');await input.press('Enter');assert.equal(await page.evaluate(()=>vocabularyTestUI.session.meta.index),0,'Enter/newline must not submit IME composition');
   assert.equal(await page.locator('#v-vocabulary-test').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,'horizontal fit');
   await page.locator('#vocabulary-test-next').scrollIntoViewIfNeeded();const b=await page.locator('#vocabulary-test-next').boundingBox();assert.ok(b.height>=44&&b.x>=0&&b.x+b.width<=width+1);
   await input.blur();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${proof}/${engine.name()}-question-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{darkMode=false;applyDark();});await answer(page,'고요한');
  for(const [width,height] of [[390,844],[820,1180]])for(const dark of [false,true]){await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);await page.screenshot({path:`${proof}/${engine.name()}-results-${width}-${dark?'dark':'light'}.png`,fullPage:true});}
 });
 writeFileSync(proof+'/'+engine.name()+'-metrics.json',JSON.stringify({engine:engine.name(),scope:'Synthetic local browser data. No native iOS keyboard or VoiceOver validation; no live AI calls.',metrics},null,2));
}finally{await browser.close();await server.close();}
