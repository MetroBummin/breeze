import assert from 'node:assert/strict';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';

const server=await serveStudyFixture();
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
let browser;
try{
  browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.__breezeNativeSetItem=Storage.prototype.setItem;});
  await prepareStudyPage(page,server.url);
  const planted=await page.evaluate(()=>{
    words.keep={word:'keep',ko:'보존',book:'Fixture',status:1,up:1,addedAt:1};
    if(!saveWords('keep'))throw new Error('guest word save failed before migration');
    const native=window.__breezeNativeSetItem;
    native.call(localStorage,'breeze.words',JSON.stringify({legacy:{word:'legacy',ko:'옛',book:'Fixture',status:1,up:1,addedAt:1}}));
    native.call(localStorage,'breeze.word-item.legacy',JSON.stringify({word:'legacy',ko:'옛 항목',book:'Fixture',status:1,up:2,addedAt:1}));
    const rows=[];
    for(let i=0;i<45;i++)rows.push({id:'s'+i,at:i,count:1,correct:1,score:100,rows:[{pad:'x'.repeat(2000)}]});
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
    let room=false;
    try{native.call(localStorage,'breeze.debug.room','x');}catch{room=true;}
    return {hit,room};
  });
  assert.equal(planted.hit,true,'storage did not reach quota');
  assert.equal(planted.room,true,'a one-byte write was refused once localStorage was full');
  const moved=await page.evaluate(async()=>{
    await migrateDurableLocalStorage();
    await migrateDurableLocalStorage();
    const archived=await readLearningArchive('legacy');
    const merged=await studyTestsReadMerged({id:'legacy',generation:0});
    const hot=JSON.parse(localStorage.getItem('breeze.study-set-tests.v1')||'null');
    let guest=null;
    for(let i=0;i<localStorage.length;i++){
      const name=localStorage.key(i);
      if(name&&name.endsWith('breeze.word-item.keep'))guest=localStorage.getItem(name);
    }
    let accepted=false;
    try{localStorage.setItem('breeze.debug.after','ok');accepted=localStorage.getItem('breeze.debug.after')==='ok';}catch{accepted=false;}
    return {
      banner:document.getElementById('bootfail').style.display,
      legacyBlob:localStorage.getItem('breeze.words'),
      legacyItem:localStorage.getItem('breeze.word-item.legacy'),
      archived:archived&&archived.words&&archived.words.legacy&&archived.words.legacy.ko,
      only:archived&&archived.words&&archived.words.only,
      guest,
      summaries:merged.sets.kept.length,
      pending:merged.sets.kept.some(row=>row.pending&&row.rows&&row.rows.length===1),
      hot:hot&&hot.sets.kept.length,
      accepted
    };
  });
  assert.equal(moved.banner,'none');
  assert.equal(moved.legacyBlob,null);
  assert.equal(moved.legacyItem,null);
  assert.equal(moved.archived,'옛 항목');
  assert.equal(moved.only,undefined);
  assert.match(moved.guest,/보존/);
  assert.equal(moved.summaries,46);
  assert.equal(moved.pending,true);
  assert.equal(moved.hot,41);
  assert.equal(moved.accepted,true);
  assert.deepEqual(errors.filter(message=>/QuotaExceededError|quota has been exceeded/i.test(message)),[]);
  console.log('Storage migration regression passed: a full origin copies, verifies, then drops the local copies.');
}finally{await browser?.close();await server.close();}
