import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {vocabulary} from './helpers/study-quota-fixture.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
const server=await serveStudyFixture(),engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const output='/tmp/breeze-study-quota-proof';mkdirSync(output,{recursive:true});const results=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await prepareStudyPage(page,server.url);
 // Seed only real-shaped records, no padding key or monkey-patched quota.
 const fixture=await page.evaluate(data=>{
  words=data;localStorage.setItem('breeze.words',JSON.stringify(data));
  let overlays=0;for(const [i,[key,word]] of Object.entries(data).entries())if(i%2===0){localStorage.setItem('breeze.word-item.'+key,JSON.stringify({...word,status:word.status%3+1,up:word.up+100000}));overlays++;}
  words=loadWordState();window.qaSources=Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));
  let state=BreezeStudySets.normalize(null),attempts=0;const failures=[];
  const add=(count,active)=>{const r=BreezeStudySets.create(state,{name:'Reading review '+(++attempts),bookTitles:Array.from({length:count/100},(_,i)=>'Reading '+(i+1))},words,Date.now()),next=active?BreezeStudySets.start(r.state,r.set.id,Date.now()).state:r.state;
   try{localStorage.setItem(STUDY_SETS_STORAGE,JSON.stringify(next));state=next;return true;}catch(e){failures.push(e.name);return false;}};
  add(100,true);for(let i=0;i<20&&add(1000,true);i++);for(let i=0;i<20&&add(100,false);i++);
  window.qaOriginal=localStorage.getItem(STUDY_SETS_STORAGE);window.qaFirstId=state.sets[0].id;
  return {words:Object.keys(words).length,overlays,sets:state.sets.length,cards:state.sets.reduce((n,s)=>n+s.cards.length,0),queueCopies:state.sets.reduce((n,s)=>n+(s.session?.queue.length||0),0),characters:qaOriginal.length,totalCharacters:Object.keys(localStorage).reduce((n,k)=>n+k.length+localStorage.getItem(k).length,0),failures};
 },vocabulary());
 assert.ok(fixture.failures.includes('QuotaExceededError'));results.push({test:'native quota fixture',...fixture});
 const migration=await page.evaluate(async()=>{
  await loadStudySets();const db=await studyStorageDb(),record=await localTransaction(db,'records','readonly',(tx,done)=>{const r=tx.objectStore('records').get(STUDY_SETS_STORAGE);r.onsuccess=()=>done(r.result);});
  return {exactArchive:record.legacy[STUDY_SETS_STORAGE]===qaOriginal,exactWorking:record.value===qaOriginal,sourceIntact:Object.entries(qaSources).every(([k,v])=>localStorage.getItem(k)===v),legacyReleased:localStorage.getItem(STUDY_SETS_STORAGE)===null,remainingCharacters:Object.keys(localStorage).reduce((n,k)=>n+k.length+localStorage.getItem(k).length,0)};
 });assert.ok(migration.exactArchive&&migration.exactWorking&&migration.sourceIntact&&migration.legacyReleased);results.push({test:'verified migration',...migration});
 await page.evaluate(()=>openStudySet(qaFirstId));await page.locator('#study-sets-start').click();await page.locator('#study-sets-flashcard').click();await page.waitForFunction(()=>!studySetsUI.mutating&&!!document.querySelector('#study-sets-answer')&&!document.querySelector('#study-sets-answer').hidden);await page.locator('#study-sets-flashcard').press('ArrowRight');await page.waitForFunction(()=>document.getElementById('study-sets-progress')?.textContent==='1 / 100');
 await page.evaluate(()=>{closeStudySets(true);show('vocab');openStudySets(false,'create');});await page.locator('#study-sets-name').fill('After quota migration');await page.locator('.study-sets-books input').first().check();await page.locator('#study-sets-save').click();await page.waitForFunction(()=>!studySetsUI.mutating&&studySetsUI.state?.sets.some(s=>s.name==='After quota migration'));
 assert.equal(await page.locator('#study-sets-error').isVisible(),false);results.push({test:'existing answers and new set',sets:await page.evaluate(()=>readStudySets().sets.length)});
 await page.evaluate(()=>{closeStudySets(true);show('vocab');return openVocabularyReview();});await page.waitForFunction(()=>activeAppView()==='study'&&!simpleStudyBusy&&document.getElementById('review-progress').textContent==='0 / 5000');
 await page.locator('#review-flip').click();await page.evaluate(()=>gradeSimpleWordCard('again'));await page.waitForFunction(()=>!simpleStudyBusy&&!simpleWordCards.flipped);
 await page.locator('#review-flip').click();await page.evaluate(()=>gradeSimpleWordCard('remember'));await page.waitForFunction(()=>!simpleStudyBusy&&ensureSimpleStudySession().passed.length===1);
 const before=await page.evaluate(()=>JSON.stringify(ensureSimpleStudySession()));assert.equal(JSON.parse(before).history.length,2);
 // Inject an IDB abort AFTER put success, exercising the transaction-complete boundary.
 await page.locator('#review-flip').click();await page.evaluate(()=>{window.qaPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=qaPut.apply(this,args);if(this.name==='records')r.addEventListener('success',()=>this.transaction.abort());return r;};});
 await page.evaluate(()=>gradeSimpleWordCard('remember'));assert.equal(await page.locator('#review-error').isVisible(),true);assert.equal(await page.evaluate(()=>JSON.stringify(ensureSimpleStudySession())),before);assert.equal(await page.evaluate(()=>simpleWordCards.flipped),true);
 await page.evaluate(()=>IDBObjectStore.prototype.put=qaPut);await page.evaluate(()=>gradeSimpleWordCard('remember'));await page.waitForFunction(()=>!simpleStudyBusy&&ensureSimpleStudySession().passed.length===2);
 const saved=await page.evaluate(()=>JSON.stringify(ensureSimpleStudySession()));await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>{show('vocab');return openVocabularyReview();});await page.waitForFunction(()=>!simpleStudyBusy&&document.getElementById('review-progress').textContent==='2 / 5000');
 assert.equal(await page.evaluate(()=>JSON.stringify(ensureSimpleStudySession())),saved);assert.equal(await page.locator('#review-meaning').isVisible(),false);results.push({test:'All Words history, IDB abort/retry, reload',passed:2,history:JSON.parse(saved).history.length});
 // A pending write must finish durably without pulling the user back from Home.
 await page.locator('#review-flip').click();await page.evaluate(()=>{
  window.qaTransaction=localTransaction;window.qaPuts=0;window.qaPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='records')qaPuts++;return qaPut.apply(this,args);};
  window.qaGate=new Promise(resolve=>window.qaRelease=resolve);
  localTransaction=function(...args){const before=qaPuts;return qaTransaction(...args).then(async value=>{if(args[1]==='records'&&args[2]==='readwrite'&&qaPuts>before){window.qaCommittedPending=true;await qaGate;}return value;});};
  void gradeSimpleWordCard('remember');void gradeSimpleWordCard('remember');
 });await page.waitForFunction(()=>window.qaCommittedPending);await page.evaluate(()=>show('home'));await page.evaluate(()=>qaRelease());await page.waitForFunction(()=>!simpleStudyBusy);assert.equal(await page.evaluate(()=>activeAppView()),'home');
 await page.evaluate(()=>{localTransaction=qaTransaction;IDBObjectStore.prototype.put=qaPut;show('vocab');return openVocabularyReview();});await page.waitForFunction(()=>!simpleStudyBusy&&ensureSimpleStudySession().passed.length===3);assert.equal(await page.locator('#review-progress').innerText(),'3 / 5000');results.push({test:'late commit and duplicate input',passed:3,returnedHome:true});
 // Post-commit render failure must retry display, never duplicate creation.
 await page.evaluate(()=>{show('vocab');openStudySets(false,'create');});await page.locator('#study-sets-name').fill('Committed once');await page.locator('.study-sets-books input').first().check();await page.evaluate(()=>{window.qaRender=renderStudySets;renderStudySets=()=>{throw Error('Injected display failure');};});await page.locator('#study-sets-save').click();await page.waitForFunction(()=>!studySetsUI.mutating&&studySetsUI.diagnostic?.committed);
 const count=await page.evaluate(()=>readStudySets().sets.length);await page.evaluate(()=>renderStudySets=qaRender);await page.locator('#study-sets-error button').click();await page.waitForFunction(()=>document.getElementById('study-sets-error').hidden);assert.equal(await page.evaluate(()=>readStudySets().sets.length),count);results.push({test:'post-commit display retry',sets:count,duplicated:false});
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/'+engine.name()+'-after-migration.png'});await context.close();
 console.log(JSON.stringify({engine:engine.name(),version:browser.version(),results},null,2));writeFileSync(output+'/'+engine.name()+'.json',JSON.stringify({engine:engine.name(),version:browser.version(),results},null,2));
}finally{await browser.close();await server.close();}
