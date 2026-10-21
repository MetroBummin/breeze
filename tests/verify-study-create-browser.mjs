import {studyAction} from './helpers/study-actions.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
const server=await serveStudyFixture(),engine=process.env.BROWSER==='webkit'?webkit:chromium,out='/tmp/breeze-study-create-proof';mkdirSync(out,{recursive:true});
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined}),rows=[];
try{for(const [device,width,height] of [['phone',390,844],['ipad',820,1180],['desktop',1440,900],['short',844,390],['keyboard',390,430]])for(const dark of [false,true]){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();await prepareStudyPage(page,server.url);
 await page.evaluate(d=>{darkMode=d;applyDark();words={};for(let b=0;b<45;b++)for(let w=0;w<1+b%4;w++)words['b'+b+'w'+w]={word:'book'+b+' word'+w,ko:'뜻 '+b+' '+w,book:'Book '+b,status:2};openStudySets(false,'create');},dark);
 const save=page.locator('#study-sets-save'),choices=page.locator('.study-sets-books'),checkbox=choices.locator('input').first();assert.equal(await save.isEnabled(),false);await page.locator('#study-sets-name').fill('Test');await checkbox.check();assert.equal(await save.isEnabled(),true);await checkbox.uncheck();assert.equal(await save.isEnabled(),false);await checkbox.check();
 const geometry=()=>save.boundingBox(),before=await geometry();await choices.evaluate(n=>n.scrollTop=n.scrollHeight);const after=await geometry();assert.equal(before.y,after.y,'button remains fixed while books scroll');assert.ok(after.y>=0&&after.y+after.height<=height,'button inside visible viewport');
 const counts=await choices.locator('.study-sets-book>.study-sets-caption').allTextContents();assert.ok(counts.every((v,i)=>!i||parseInt(counts[i-1])>=parseInt(v)));await page.screenshot({path:`${out}/${device}-${dark?'dark':'light'}.png`});
 await page.evaluate(()=>{window.qaWrite=IDBObjectStore.prototype.put;window.qaQuotaAttempts=0;IDBObjectStore.prototype.put=function(value,key){if(this.name==='records'&&key===learningStorageKey('breeze.study-sets.v1')){qaQuotaAttempts++;throw new DOMException('Synthetic quota','QuotaExceededError');}return qaWrite.call(this,value,key);};});await studyAction(save.click(),page);await page.waitForFunction(()=>!studySetsUI.mutating);assert.equal(await page.evaluate(()=>qaQuotaAttempts),1,'fault injection reached the real Storage API');assert.equal(await page.locator('#study-sets-error').isVisible(),true);assert.equal(await page.evaluate(()=>studySetsUI.lastError.name),'QuotaExceededError');assert.equal(await page.evaluate(()=>localStorage.getItem(learningStorageKey('breeze.study-sets.v1'))),null);await page.evaluate(()=>IDBObjectStore.prototype.put=qaWrite);await studyAction(page.locator('#study-sets-error button').click(),page);await page.waitForFunction(()=>!studySetsUI.mutating);assert.equal(await page.evaluate(()=>readStudySets().sets.length),1);await studyAction(page.locator('#study-sets-start').click(),page);assert.equal(await page.locator('#study-sets-progress').innerText(),'0 / 4');rows.push({device,dark,fixedCreate:true,quotaRetry:true});await context.close();
}
 const addContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'reduce'}),addPage=await addContext.newPage();
 await prepareStudyPage(addPage,server.url);
 await addPage.evaluate(async()=>{
  words={};
  const add=(title,n)=>{for(let i=0;i<n;i++)words[title+' '+i]={word:title+' '+i,ko:'뜻 '+title+' '+i,book:title,status:1,addedAt:i};};
  add('In set',2);add('Alpha',1);add('Zebra',8);for(let b=0;b<36;b++)add('Book '+String(b).padStart(2,'0'),1+(b%3));
  const created=BreezeStudySets.create(await loadStudySets(),{name:'기존 세트',bookTitles:['In set']},words,1);
  await commitStudySets(created.state);show('memory');openStudySet(created.set.id);await studySetsReadAndRender();
 });
 await addPage.locator('#study-sets-edit').click();
 await addPage.getByRole('menuitem',{name:'책 추가',exact:true}).click();
 await addPage.waitForSelector('#study-sets-add-books-form .study-sets-book');
 const choices=addPage.locator('#study-sets-add-books-form>.study-sets-books'),save=addPage.locator('#study-sets-add-books');
 const fixed=await save.boundingBox();
 await choices.evaluate(n=>{n.scrollTop=400;});
 assert.ok(await choices.evaluate(n=>n.scrollTop)>100,'책 추가 list owns the scroll');
 const parked=await save.boundingBox();assert.equal(parked.y,fixed.y,'add action stays put while books scroll');
 await choices.evaluate(n=>{n.scrollTop=n.scrollHeight;});
 const reached=await choices.evaluate(n=>{
  const rows=[...n.querySelectorAll('.study-sets-book')],last=rows[rows.length-1],host=n.getBoundingClientRect(),row=last.getBoundingClientRect();
  return {rows:rows.length,scroll:n.scrollTop,client:n.clientHeight,scrollHeight:n.scrollHeight,inView:row.bottom<=host.bottom+1&&row.top>=host.top-1,first:rows[0].querySelector('.study-sets-book-name').textContent,captions:rows.map(r=>parseInt(r.querySelector('.study-sets-caption').textContent,10))};
 });
 assert.equal(reached.rows,38);assert.equal(reached.first,'Zebra');assert.ok(reached.scrollHeight>reached.client);assert.ok(reached.inView,'last book stays inside the scrolling list');
 assert.ok(reached.captions.every((v,i)=>!i||reached.captions[i-1]>=v));
 rows.push({device:'phone',dark:false,addBooks:reached.rows,addBooksScroll:true});
 await addContext.close();
 writeFileSync(`${out}/receipt-${engine.name()}.json`,JSON.stringify({engine:engine.name(),rows,keyboard:'reduced visible viewport browser fixture; actual iOS keyboard still needs native QA'},null,2));console.log('Creation: 45 books, stable descending counts, fixed actions, 0→1→0 selection, quota retry and start passed10 layouts; 책 추가 scrolls every remaining book');}finally{await browser.close();await server.close();}
