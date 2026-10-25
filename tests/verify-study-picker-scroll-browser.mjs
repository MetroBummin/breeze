import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage,studySetFixture} from './helpers/study-sets-browser-fixture.mjs';
import {allWordsFixture} from './helpers/all-words-fixture.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium,server=await serveStudyFixture();
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const output=process.env.BREEZE_ALL_WORDS_OUTPUT||'/tmp/breeze-all-words-after';mkdirSync(output,{recursive:true});
const checks=[],errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));await prepareStudyPage(page,server.url);
 await page.evaluate(async({records,sets})=>{words=records;await loadStudySets();await commitStudySets(sets);show('vocab');window.scrollTo(0,450);}, {records:allWordsFixture(),sets:studySetFixture(60,10)});
 const cdp=engine===chromium?await context.newCDPSession(page):null;
 const drag=async(x,y,dy)=>{
  if(!cdp)return;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/8,id:1}]});await page.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
 };
 const background=()=>page.evaluate(()=>({top:document.getElementById('v-vocab').getBoundingClientRect().top,reader:readerScroller()?.scrollTop||0}));
 const closed=async()=>{await page.waitForFunction(()=>!studySetsIsOpen()&&!studySetsUI.pendingClose);assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('study-sets-modal-open')),false);};
 const original=await background();await page.evaluate(()=>openStudySetsDirectory());
 assert.deepEqual(await background(),original,'opening at a deep vocabulary position does not jump the background');
 const locked=await background();
 // Header, backdrop and both boundaries cannot move the underlying document.
 for(const edge of ['top','bottom']){
  await page.evaluate(edge=>{studySetsUI.body.scrollTop=edge==='top'?0:studySetsUI.body.scrollHeight;},edge);
  const header=await page.locator('#study-sets-title').boundingBox();await page.mouse.move(header.x+20,header.y+10);await page.mouse.wheel(0,edge==='top'?-500:500);await page.waitForTimeout(80);
  await drag(195,Math.max(30,header.y+15),180);
  await page.mouse.move(2,2);await page.mouse.wheel(0,400);await page.waitForTimeout(80);
  await page.mouse.move(195,450);await page.mouse.wheel(0,edge==='top'?-600:600);await page.waitForTimeout(80);
  assert.deepEqual(await background(),locked,edge+' overscroll stays owned by the sheet');checks.push(edge+' boundary/header/backdrop');
 }
 await page.evaluate(()=>studySetsUI.body.scrollTop=0);await page.mouse.move(195,450);await page.mouse.wheel(0,400);await page.waitForTimeout(100);
 assert.ok(await page.evaluate(()=>studySetsUI.body.scrollTop)>200,'the long set list still scrolls');assert.deepEqual(await background(),locked);
 await page.evaluate(()=>studySetsGo('create'));await page.waitForFunction(()=>studySetsUI.screen==='create'&&!!document.getElementById('study-sets-create-form'));
 const books=page.locator('#study-sets-create-form>.study-sets-books');const box=await books.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,400);await page.waitForTimeout(100);
 assert.ok(await books.evaluate(n=>n.scrollTop)>100,'nested book choices keep their own scroll');assert.deepEqual(await background(),locked);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>studySetsUI.screen==='directory');assert.deepEqual(await background(),locked);
 await page.keyboard.press('Escape');await closed();assert.equal(await page.evaluate(()=>window.scrollY),450);assert.deepEqual(await background(),original);checks.push('nested books, Escape hierarchy, exact root restoration');
 // Back and full-page transitions release the modal owner; returning reacquires it.
 await page.evaluate(()=>openStudySetsDirectory());await page.evaluate(()=>studySetsGo('all'));assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('study-sets-modal-open')),false);
 await page.evaluate(()=>studySetsBack());await page.waitForFunction(()=>studySetsUI.dialog.open&&studySetsUI.screen==='directory');assert.deepEqual(await background(),original);
 await page.evaluate(()=>history.back());await closed();assert.equal(await page.evaluate(()=>window.scrollY),450);checks.push('full-page/back/forward lifecycle');
 // A queued close event from an earlier instance must not unlock a reopened sheet.
 for(let i=0;i<5;i++){
  await page.evaluate(()=>{openStudySets(false,'list');closeStudySets(true);openStudySets(false,'list');});await page.waitForTimeout(30);
  assert.equal(await page.evaluate(()=>studySetsUI.dialog.open&&document.documentElement.classList.contains('study-sets-modal-open')),true);
  await page.evaluate(()=>closeStudySets(true));await closed();assert.equal(await page.evaluate(()=>window.scrollY),450);
 }
 await page.evaluate(()=>{document.body.classList.add('settings-open');document.body.style.overflow='hidden';openStudySets(false,'list');});await page.evaluate(()=>closeStudySets(true));await closed();
 assert.equal(await page.evaluate(()=>document.body.style.overflow==='hidden'&&document.body.classList.contains('settings-open')),true,'another overlay retains its own lock');
 await page.evaluate(()=>{document.body.classList.remove('settings-open');document.body.style.removeProperty('overflow');openStudySets(false,'list');show('home');});await closed();assert.equal(await page.evaluate(()=>activeAppView()),'home');checks.push('rapid reopen, overlapping owner, navigation');
 await page.locator('#fileinput').setInputFiles({name:'Picker reader.txt',mimeType:'text/plain',buffer:Buffer.from(('A quiet breeze moves through the trees as we read this long book.\n\n').repeat(250))});
 await page.waitForFunction(()=>books.some(b=>b.title==='Picker reader'));
 await page.evaluate(async()=>{await openBook(books.find(b=>b.title==='Picker reader'));readerScrollTo(600);});await page.waitForTimeout(100);
 const readerBefore=await page.evaluate(()=>readerScroller().scrollTop);assert.ok(readerBefore>400);
 await page.evaluate(()=>openStudySets(false,'list'));await page.mouse.move(2,2);await page.mouse.wheel(0,500);await drag(195,40,180);
 assert.equal(await page.evaluate(()=>readerScroller().scrollTop),readerBefore,'the real reader scroller remains stationary behind the modal');
 await page.evaluate(()=>closeStudySets(true));await closed();assert.equal(await page.evaluate(()=>readerScroller().scrollTop),readerBefore);assert.equal(await page.evaluate(()=>activeAppView()),'read');checks.push('long imported book, reader scroll retained');
 for(const [size,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,1000],['short',844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(async dark=>{darkMode=dark;applyDark();show('vocab');window.scrollTo(0,450);await openStudySetsDirectory();},dark);
  const before=await background();await page.mouse.move(2,2);await page.mouse.wheel(0,400);await page.waitForTimeout(60);assert.deepEqual(await background(),before);
  await page.screenshot({path:`${output}/picker-${size}-${dark?'dark':'light'}.png`});await page.evaluate(()=>closeStudySets(true));await closed();assert.equal(await page.evaluate(()=>window.scrollY),450);
 }
 assert.deepEqual(errors,[]);writeFileSync(output+'/picker-checks-'+engine.name()+'.json',JSON.stringify({engine:engine.name(),native:false,input:cdp?'trusted CDP touch plus wheel':'WebKit wheel; physical iOS touch unverified',checks,errors},null,2));await context.close();
}finally{await browser.close();await server.close();}
