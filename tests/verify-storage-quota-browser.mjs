import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';

const server=await serveStudyFixture();
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
let browser;
try{
  browser=await engine.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.__breezeNativeSetItem=Storage.prototype.setItem;});
  await prepareStudyPage(page,server.url);
  await page.evaluate(()=>{
    words.keep={word:'keep',ko:'보존',book:'Fixture',status:1,up:1,addedAt:1};
    if(!saveWords('keep'))throw new Error('word save failed before the quota fill');
  });
  const filled=await page.evaluate(()=>{
    const native=window.__breezeNativeSetItem;
    native.call(localStorage,'breeze.rss-public.v1','{"synthetic":"cache"}');
    let size=262144,writes=0,hit=false;
    for(let i=0;i<400&&size>=1;i++){
      try{native.call(localStorage,'breeze.debug.pad.'+i,'x'.repeat(size));writes++;}
      catch(error){
        if(!(error&&(error.name==='QuotaExceededError'||error.code===22)))throw error;
        if(size===1){hit=true;break;}
        size=Math.max(1,Math.floor(size/2));
      }
    }
    return {writes,hit};
  });
  assert.equal(filled.hit,true,`storage did not reach quota after ${filled.writes} pads`);
  const saved=await page.evaluate(()=>{
    const scope=captureLearningScope();
    studySetTestRun={
      id:'quota-run',setId:'quota-set',startedAt:1,scope,
      questions:[{id:'q',word:'belabor',meanings:['늘어지게 말함']}],
      index:1,
      rows:[{word:'belabor',meanings:['늘어지게 말함'],answer:'nope',status:'incorrect'}]
    };
    studySetTestJobs.set(studySetTestRun.id,studySetTestRun);
    studySetTestPersist(studySetTestRun);
    let pads=0,stored=null;
    for(let i=0;i<localStorage.length;i++){
      const name=localStorage.key(i);
      if(name.startsWith('breeze.debug.pad.'))pads++;
      if(name.endsWith('breeze.word-item.keep'))stored=localStorage.getItem(name);
    }
    const raw=localStorage.getItem(studyTestsKey(scope));
    const record=raw&&JSON.parse(raw).sets['quota-set']&&JSON.parse(raw).sets['quota-set'][0];
    return {pads,rss:localStorage.getItem('breeze.rss-public.v1'),score:record&&record.score,word:words.keep&&words.keep.ko,stored,banner:document.getElementById('bootfail').style.display};
  });
  assert.equal(saved.banner,'none');
  assert.equal(saved.word,'보존');
  assert.match(saved.stored,/보존/);
  assert.equal(saved.rss,null);
  assert.equal(saved.pads,0);
  assert.equal(saved.score,0);
  assert.deepEqual(errors.filter(message=>/QuotaExceededError|quota has been exceeded/i.test(message)),[]);
  console.log('Storage quota regression passed: a full Web Storage origin prunes caches, saves the test summary, and keeps the word.');
}finally{await browser?.close();await server.close();}
