/* Synthetic local browser timings, not physical-device speed or allocation profiling. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {studySetFixture,serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
const before=process.env.BREEZE_STUDY_PHASE==='before',engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=process.env.BREEZE_STUDY_LIST_OUTPUT||'/tmp/breeze-study-list-'+(before?'before':'after');mkdirSync(out,{recursive:true});
const server=await serveStudyFixture({uiSource:process.env.BREEZE_STUDY_UI_SOURCE,instrument:true});
let browser;
const cases=[],errors=[];
try{
 browser=await engine.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
 for(const size of [1,10,50]){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await prepareStudyPage(page,server.url);
  const fixture=studySetFixture(size),serialized=JSON.stringify(fixture);
  await page.evaluate(fixture=>{
   words=Object.fromEntries(fixture.sets[0].cards.map(card=>[card.key,{...card}]));
   localStorage.setItem(STUDY_SETS_STORAGE,JSON.stringify(fixture));show('memory');openStudySet('set-1');studySetsGo('study');
   const list=studySetsUI.directoryList,replace=list.replaceChildren.bind(list);
   list.replaceChildren=(...nodes)=>{studyListMetrics.dom++;if(!list.getClientRects().length)studyListMetrics.hiddenDom++;return replace(...nodes);};
  },fixture);
  const measure=async action=>page.evaluate(({serialized,action})=>{
   const samples=[];
   for(let i=0;i<25;i++){
    localStorage.setItem(STUDY_SETS_STORAGE,serialized);studySetsReadAndRender(false);
    Object.assign(studyListMetrics,{normalizes:0,dom:0,hiddenDom:0});
    const t=performance.now();
    if(action==='reveal'){
     const s=studySetsUI.state.sets[0],q=s.session;
     const token=JSON.stringify([s.id,q.id,q.round,q.serial,q.queue[0].id]);
     studySetsMutate(state=>BreezeStudySets.reveal(state,s.id,token));
    }else{show('memory');}
    const sample={durationMs:performance.now()-t,...studyListMetrics};
    if(i>=5)samples.push(sample);
    if(action==='directory')openStudySet('set-1'),studySetsGo('study');
   }
   return samples;
  },{serialized,action});
  const reveal=await measure('reveal'),directory=await measure('directory');
  if(!before){for(const s of reveal){assert.equal(s.normalizes,5,'durable read, mutation, commit decode/normalize, visible study view');assert.equal(s.dom,0);assert.equal(s.hiddenDom,0);}for(const s of directory){assert.equal(s.normalizes,1,'one durable validation for the visible list');assert.equal(s.dom,1);assert.equal(s.hiddenDom,0);}}
  // Cross-document durable updates defer the hidden list, then read current data on entry.
  await page.evaluate(()=>Object.assign(studyListMetrics,{normalizes:0,dom:0,hiddenDom:0}));
  const tab=await context.newPage();await prepareStudyPage(tab,server.url);
  fixture.sets[0].name='Other tab name';await tab.evaluate(value=>localStorage.setItem('breeze.study-sets.v1',value),JSON.stringify(fixture));
  await page.waitForFunction(()=>studySetsUI.state.sets[0].name==='Other tab name');
  if(!before)assert.equal(await page.evaluate(()=>studyListMetrics.hiddenDom),0);
  await page.evaluate(()=>show('memory'));assert.equal(await page.locator('[data-set-id="set-1"] strong').textContent(),'Other tab name');
  await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>show('memory'));
  assert.equal(await page.locator('[data-set-id="set-1"] strong').textContent(),'Other tab name');
  // A failed write keeps the answer retryable even if a storage event arrives.
  await page.evaluate(()=>{openStudySet('set-1');studySetsGo('study');document.getElementById('study-sets-reveal').click();window.savedStudyValue=localStorage.getItem(STUDY_SETS_STORAGE);window.nativeStudySetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===STUDY_SETS_STORAGE)throw Error('Synthetic quota');return nativeStudySetItem.call(this,k,v);};document.getElementById('study-sets-grade-remembered').click();});
  assert.equal(await page.locator('#study-sets-answer').isVisible(),true);
  assert.equal(await page.locator('#study-sets-error').isVisible(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem(STUDY_SETS_STORAGE)===savedStudyValue),true);
  await tab.evaluate(value=>localStorage.setItem('breeze.study-sets.v1',value),JSON.stringify(fixture));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#study-sets-answer').isVisible(),true);
  assert.equal(await page.evaluate(()=>!!studySetsUI.retry),true);
  await page.evaluate(()=>{Storage.prototype.setItem=nativeStudySetItem;document.querySelector('#study-sets-error button').click();});
  assert.equal(await page.locator('#study-sets-error').isVisible(),false);
  assert.equal(await page.evaluate(()=>readStudySets().sets[0].session.index),0,'stale token reloads without grading the other-tab card');
  const stats=samples=>{const times=samples.map(s=>s.durationMs).sort((a,b)=>a-b);return {samples:samples.length,medianMs:times[Math.floor(times.length/2)],p95Ms:times[Math.ceil(times.length*.95)-1],normalizes:[...new Set(samples.map(s=>s.normalizes))],listRebuilds:[...new Set(samples.map(s=>s.dom))],hiddenListRebuilds:[...new Set(samples.map(s=>s.hiddenDom))],raw:samples};};
  cases.push({sets:size,cardsPerSet:100,storedCards:size*100,storedQueueCards:size*100,reveal:stats(reveal),directory:stats(directory)});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 writeFileSync(`${out}/measurements.json`,JSON.stringify({phase:before?'before':'after',engine:engine.name(),browserVersion:browser.version(),platform:'Linux local browser, 390x844 viewport; synthetic 100-card sets; 5 warmups + 20 samples; no CPU throttle; no device-speed or heap-allocation claim',cases,errors},null,2)+'\n');
 console.log(JSON.stringify({phase:before?'before':'after',engine:engine.name(),cases:cases.map(({sets,reveal,directory})=>({sets,reveal:{...reveal,raw:undefined},directory:{...directory,raw:undefined}}))},null,2));
}finally{await browser?.close();await server.close();}
