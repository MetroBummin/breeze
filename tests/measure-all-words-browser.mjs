/* Identical before/after workload. Browser timings/heap are not native jetsam evidence. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
import {allWordsFixture} from './helpers/all-words-fixture.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=process.env.BREEZE_ALL_WORDS_OUTPUT||'/tmp/breeze-all-words-after';mkdirSync(out,{recursive:true});
const server=await serveStudyFixture(),browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const cases=[],errors=[];
try{
 for(const count of [2399,6000,12000]){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('renderer crash'));
  await prepareStudyPage(page,server.url);
  const cdp=engine===chromium?await context.newCDPSession(page):null;
  if(cdp)await cdp.send('Performance.enable');
  await page.evaluate(async records=>{words=records;show('vocab');await openStudySetsDirectory();window.qaTasks=[];if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>qaTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask'});},allWordsFixture(count));
  const sample=await page.evaluate(async()=>{
   const start=performance.now();await studySetsGo('all');const rendered=performance.now();
   const nodes=document.querySelectorAll('#study-all-words-list *').length;
   const height=studySetsUI.body.scrollHeight,laidOut=performance.now();
   await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   return {start,renderMs:rendered-start,layoutMs:laidOut-rendered,nextPaintMs:performance.now()-start,nodes,height,rows:document.querySelectorAll('#study-all-words-list .vgroup').length};
  });
  await page.waitForTimeout(80);
  const metrics=cdp?Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','Nodes','LayoutCount','RecalcStyleCount'].includes(m.name)).map(m=>[m.name,m.value])):null;
  const session=await page.evaluate(async()=>{
   const samples=[];
   simpleStudySession=SimpleStudySession.start(Object.keys(words));
   const raw=JSON.stringify(simpleStudySession);
   for(let i=0;i<5;i++){
    let t=performance.now();ensureSimpleStudySession();const ensureMs=performance.now()-t;
    t=performance.now();SimpleStudySession.restore(raw);samples.push({ensureMs,restoreMs:performance.now()-t});
   }
   const t=performance.now();await startStudySetsAllWords();const openMs=performance.now()-t;
   const f=performance.now();flipSimpleWordCard();const revealMs=performance.now()-f;
   const g=performance.now();await gradeSimpleWordCard('again');const againMs=performance.now()-g;
   return {samples,openMs,revealMs,againMs,retainedAllRows:document.querySelectorAll('#study-all-words-list .vgroup').length,queue:simpleStudySession.queue.length};
  });
  const tasks=await page.evaluate(()=>qaTasks);
  cases.push({count,...sample,metrics,session,longTasks:tasks.filter(t=>t.start+t.duration>=sample.start)});
  console.log(JSON.stringify(cases.at(-1)));await context.close();
 }
 writeFileSync(out+'/'+engine.name()+'.json',JSON.stringify({engine:engine.name(),version:browser.version(),platform:'Linux browser; no CPU throttle; long examples and multiple meanings; heap is browser JS heap, not native RSS; native termination unverified',cases,errors},null,2)+'\n');
}finally{await browser.close();await server.close();}
