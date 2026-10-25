import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium,firefox,webkit,devices} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';

const engineName=process.env.BROWSER||'chromium';
const mobile=process.env.MOBILE==='1';
const engine=engineName==='firefox'?firefox:engineName==='webkit'?webkit:chromium;
const chrome=process.env.BREEZE_BROWSER_EXECUTABLE||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':'');
const server=await serveStudyFixture();
const browser=await engine.launch(engine===chromium&&chrome?{executablePath:chrome}:{});
const desktop={viewport:{width:1280,height:800},serviceWorkers:'block'};
const phone={...devices['iPhone 13'],serviceWorkers:'block'};
try{
  await assertMigration(await openPage());
  await assertPrivateMode();
  await assertTinyIndexedDb();
  await assertPersistenceRequested();
  await assertTwoTabs();
  console.log(`Web storage migration passed: ${engineName}${mobile?' mobile Safari':' desktop'}.`);
}finally{await browser.close();await server.close();}

async function openPage(init){
  const context=await browser.newContext(mobile?phone:desktop);
  if(init) await context.addInitScript(init);
  await context.addInitScript(()=>{window.__breezeNativeSetItem=Storage.prototype.setItem;});
  await context.addInitScript(()=>{
    const persist=navigator.storage&&navigator.storage.persist?navigator.storage.persist.bind(navigator.storage):null;
    window.__persistCalls=0;
    if(navigator.storage) navigator.storage.persist=function(){window.__persistCalls++;return persist?persist():Promise.resolve(false);};
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await prepareStudyPage(page,server.url);
  return {context,page,errors};
}
function wordBlob(){
  return JSON.stringify({legacy:{word:'legacy',ko:'옛',book:'Fixture',status:1,up:1,addedAt:1},only:{word:'only',ko:'오직',book:'Fixture',status:1,up:1,addedAt:1}});
}
async function assertMigration({context,page,errors}){
  const ua=await page.evaluate(()=>navigator.userAgent);
  if(engineName==='firefox') assert.match(ua,/Firefox/);
  else if(engineName==='webkit') assert.match(ua,/Safari/);
  else assert.match(ua,/Chrome/);
  if(mobile) assert.match(ua,/iPhone/);
  const planted=await page.evaluate(blob=>{
    const native=window.__breezeNativeSetItem;
    native.call(localStorage,'breeze.words',blob);
    native.call(localStorage,'breeze.word-item.legacy',JSON.stringify({word:'legacy',ko:'옛 항목',book:'Fixture',status:1,up:2,addedAt:1}));
    const rows=[];
    for(let i=0;i<45;i++)rows.push({id:'s'+i,at:i,count:1,correct:1,score:100,rows:[{pad:'x'.repeat(1500)}]});
    rows.push({id:'pending',at:46,count:1,correct:0,score:null,pending:true,rows:[{word:'legacy',meanings:['옛'],answer:'',status:'pending'}]});
    native.call(localStorage,'breeze.study-set-tests.v1',JSON.stringify({version:1,sets:{kept:rows}}));
    let size=262144,hit=false;
    for(let i=0;i<400&&size>=1;i++){
      try{native.call(localStorage,'breeze.debug.pad.'+i,'x'.repeat(size));}
      catch(error){
        if(!(error&&(error.name==='QuotaExceededError'||error.code===22)))throw error;
        if(size===1){hit=true;break;}
        size=Math.max(1,Math.floor(size/2));
      }
    }
    return {hit};
  },wordBlob());
  assert.equal(planted.hit,true,'storage did not reach quota');
  const moved=await page.evaluate(async()=>{
    await migrateDurableLocalStorage();
    await migrateDurableLocalStorage();
    const archived=await readLearningArchive('legacy');
    const merged=await studyTestsReadMerged({id:'legacy',generation:0});
    const hot=JSON.parse(localStorage.getItem('breeze.study-set-tests.v1')||'null');
    return {
      banner:document.getElementById('bootfail').style.display,
      pendingBoot:document.documentElement.classList.contains('boot-pending'),
      legacy:localStorage.getItem('breeze.words'),
      archived:archived&&archived.words&&archived.words.legacy&&archived.words.legacy.ko,
      only:archived&&archived.words&&archived.words.only&&archived.words.only.ko,
      summaries:merged.sets.kept.length,
      pending:merged.sets.kept.some(row=>row.pending&&row.rows&&row.rows.length===1),
      hot:hot&&hot.sets.kept.length
    };
  });
  assert.equal(moved.banner,'none');
  assert.equal(moved.pendingBoot,false);
  assert.equal(moved.legacy,null);
  assert.equal(moved.archived,'옛 항목');
  assert.equal(moved.only,'오직');
  assert.equal(moved.summaries,46);
  assert.equal(moved.pending,true);
  assert.equal(moved.hot,41);
  assert.equal(errors.some(message=>/앱을 불러오는 중/.test(message)),false);
  await context.close();
}
async function assertPrivateMode(){
  const {context,page,errors}=await openPage(()=>{
    localStorage.setItem('breeze.words',JSON.stringify({legacy:{word:'legacy',ko:'옛',book:'Fixture',status:1,up:1,addedAt:1}}));
    localStorage.setItem('breeze.word-item.keep',JSON.stringify({word:'keep',ko:'보존',book:'Fixture',status:1,up:1,addedAt:1}));
    indexedDB.open=function(){throw new DOMException('access to the Indexed Database API is denied in this context.','SecurityError');};
  });
  const result=await page.evaluate(async()=>{
    await migrateDurableLocalStorage();
    return {
      banner:document.getElementById('bootfail').style.display,
      pendingBoot:document.documentElement.classList.contains('boot-pending'),
      legacy:localStorage.getItem('breeze.words'),
      keep:localStorage.getItem('breeze.word-item.keep'),
      ready:document.readyState==='complete'
    };
  });
  assert.equal(result.banner,'none');
  assert.equal(result.pendingBoot,false);
  assert.match(result.legacy,/옛/);
  assert.match(result.keep,/보존/);
  assert.equal(result.ready,true);
  assert.equal(errors.some(message=>/bootfail|앱을 불러오는 중/.test(message)),false);
  await context.close();
}
async function assertTinyIndexedDb(){
  const {context,page}=await openPage(()=>{
    localStorage.setItem('breeze.words',JSON.stringify({legacy:{word:'legacy',ko:'옛',book:'Fixture',status:1,up:1,addedAt:1}}));
    const fail=function(){throw new DOMException('The quota has been exceeded.','QuotaExceededError');};
    IDBObjectStore.prototype.put=fail;
    IDBObjectStore.prototype.add=fail;
  });
  const result=await page.evaluate(async()=>{
    await migrateDurableLocalStorage();
    return {banner:document.getElementById('bootfail').style.display,legacy:localStorage.getItem('breeze.words')};
  });
  assert.equal(result.banner,'none');
  assert.match(result.legacy,/옛/);
  await context.close();
}
async function assertPersistenceRequested(){
  const {context,page}=await openPage();
  const before=await page.evaluate(()=>window.__persistCalls);
  assert.equal(before,0);
  const after=await page.evaluate(async blob=>{
    /* WebKit can keep this origin flag after the previous context closes, and
       an init-script assignment of persist can miss the function the page
       calls. Clear the flag and count the call made on this turn. */
    const storage=navigator.storage;
    const native=storage&&typeof storage.persist==='function'?storage.persist.bind(storage):null;
    let calls=0;
    const probe=function(){calls++;return native?native():Promise.resolve(false);};
    if(storage){try{storage.persist=probe;}catch(e){}}
    if(!(storage&&storage.persist===probe)){
      const ask=requestDurableLocalStorage;
      Reflect.set(globalThis,'requestDurableLocalStorage',function(){
        if(navigator.storage&&typeof navigator.storage.persist==='function'&&localStorage.getItem('breeze.storage-persist-asked')!=='true')calls++;
        return ask.apply(this,arguments);
      });
    }
    localStorage.removeItem('breeze.storage-persist-asked');
    localStorage.setItem('breeze.words',blob);
    const present=durableLearningPresent();
    await migrateDurableLocalStorage();
    const once=calls;
    await migrateDurableLocalStorage();
    return {once,twice:calls,asked:localStorage.getItem('breeze.storage-persist-asked'),present};
  },wordBlob());
  assert.equal(after.present,true);
  assert.equal(after.once,1);
  assert.equal(after.twice,1);
  assert.equal(after.asked,'true');
  await context.close();
}
async function assertTwoTabs(){
  const context=await browser.newContext(mobile?phone:desktop);
  const first=await context.newPage(),second=await context.newPage();
  await prepareStudyPage(first,server.url);
  await prepareStudyPage(second,server.url);
  const planted=await first.evaluate(()=>{
    const raw=JSON.stringify(BreezeStudySets.create(null,{name:'Kept',bookTitles:['Book']},{alpha:{word:'alpha',ko:'뜻',book:'Book',status:1,up:1,addedAt:1}},100).state);
    localStorage.setItem(learningStorageKey('breeze.study-sets.v1'),raw);
    localStorage.setItem('breeze.words',JSON.stringify({one:{word:'one',ko:'하나',book:'Book',status:1,up:1,addedAt:1},two:{word:'two',ko:'둘',book:'Book',status:1,up:1,addedAt:1}}));
    return raw;
  });
  await Promise.all([first.evaluate(()=>migrateDurableLocalStorage()),second.evaluate(()=>migrateDurableLocalStorage())]);
  const result=await first.evaluate(async()=>{
    const archived=await readLearningArchive('legacy');
    const state=await loadStudySets();
    return {
      one:archived&&archived.words&&archived.words.one&&archived.words.one.ko,
      two:archived&&archived.words&&archived.words.two&&archived.words.two.ko,
      local:localStorage.getItem('breeze.words'),
      name:state.sets[0]&&state.sets[0].name,
      banner:document.getElementById('bootfail').style.display
    };
  });
  const other=await second.evaluate(async()=>(await loadStudySets()).sets[0].name);
  assert.equal(result.one,'하나');
  assert.equal(result.two,'둘');
  assert.equal(result.local,null);
  assert.equal(result.name,'Kept');
  assert.equal(other,'Kept');
  assert.equal(result.banner,'none');
  assert.equal(await first.evaluate(raw=>{
    return studyStorageDb().then(db=>localTransaction(db,'records','readonly',(tx,done)=>{
      const request=tx.objectStore('records').get(learningStorageKey('breeze.study-sets.v1'));
      request.onsuccess=()=>done(request.result&&request.result.value===raw);
    }));
  },planted),true);
  await context.close();
}
