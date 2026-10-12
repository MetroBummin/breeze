import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
import {allWordsFixture} from './helpers/all-words-fixture.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium,server=await serveStudyFixture();
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const output=process.env.BREEZE_ALL_WORDS_OUTPUT||'/tmp/breeze-all-words-after';mkdirSync(output,{recursive:true});
const errors=[],layouts=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('renderer crash'));await prepareStudyPage(page,server.url);
 await page.evaluate(async records=>{words=records;saveWords();window.qaWords=JSON.stringify(words);window.qaStorage=Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));show('vocab');await openStudySetsDirectory();await studySetsGo('all');},allWordsFixture());
 const total=2294,list=page.locator('#study-all-words-list'),rows=()=>list.locator('.study-all-words-row');
 assert.equal(await list.getAttribute('data-total'),String(total));
 assert.match(await page.locator('.study-sets-caption').last().textContent(),/2294단어 · 2399개/);
 assert.ok(await rows().count()<100,'DOM contains a viewport, not every stored word');
 assert.equal(await list.locator('[contenteditable],button.chip,.rowdel,.study-sets-row-action').count(),0);
 for(const [size,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,1000],['short',844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();studySetsUI.body.scrollTop=0;},dark);await page.waitForTimeout(80);
  const layout=await rows().first().evaluate(row=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};return {row:rect(row),chip:rect(row.querySelector('.chip')),word:rect(row.querySelector('.vword')),start:rect(document.getElementById('study-all-words-start')),header:rect(document.querySelector('#v-memory-set .study-sets-header')),scroll:window.scrollY,rows:document.querySelectorAll('.study-all-words-row').length};});
  assert.ok(layout.chip.width<=44.1&&layout.chip.width>=43);assert.ok(layout.chip.x>layout.word.x);assert.ok(layout.start.bottom<=height+1);assert.ok(layout.header.y>=0);assert.equal(layout.scroll,0);assert.ok(layout.rows<100);
  layouts.push({size,dark,...layout});await page.screenshot({path:`${output}/all-words-${size}-${dark?'dark':'light'}.png`});
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{studySetsUI.body.scrollTop=0;});await page.waitForTimeout(80);
 const first=rows().first();await first.locator('.vword').click();await page.waitForTimeout(80);
 assert.equal(await first.locator('.vsense').count(),2,'all meanings in a grouped word remain available');assert.equal(await first.locator('.vmore').count(),2);
 const firstKey=await first.locator('.vgroup').getAttribute('data-g');
 const originalHeight=await first.evaluate(n=>n.getBoundingClientRect().height);assert.ok(originalHeight>500,'long examples expand without clipping');
 // Keyboard traversal crosses several mounted windows, preserving logical order.
 await first.locator('.vword').focus();
 for(let i=1;i<=110;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Number(document.activeElement.closest('.study-all-words-row')?.dataset.index)),i);}
 assert.ok(await rows().count()<100);
 // Arbitrary large jumps reach the entire list, including its final numbered row.
 for(const portion of [.25,.5,.75,1]){
  await page.evaluate(portion=>{studySetsUI.title.focus({preventScroll:true});studySetsUI.body.scrollTop=studySetsUI.body.scrollHeight*portion;},portion);await page.waitForTimeout(120);
  assert.ok(await rows().count()<100);
 }
 assert.equal(await rows().last().getAttribute('aria-posinset'),String(total));assert.equal(await rows().last().locator('.vordinal').textContent(),String(total));
 await page.evaluate(()=>studySetsUI.body.scrollTop=0);await page.waitForTimeout(120);
 assert.equal(await rows().first().locator('.vgroup').getAttribute('data-g'),firstKey);assert.equal(await rows().first().locator('.vmore').count(),2,'expansion survives unmount/remount');
 await rows().first().locator('.vword').click();await page.waitForTimeout(80);assert.equal(await rows().first().locator('.vmore').count(),0);
 // Save a deep scroll, enter the complete queue, then return to the same row.
 await page.evaluate(()=>studySetsUI.body.scrollTop=28000);await page.waitForTimeout(120);
 const anchor=await page.evaluate(()=>{const b=studySetsUI.body.getBoundingClientRect();const row=[...document.querySelectorAll('.study-all-words-row')].find(r=>r.getBoundingClientRect().bottom>b.top);return {index:row.dataset.index,y:row.getBoundingClientRect().top-b.top,scroll:studySetsUI.body.scrollTop};});
 await page.locator('#study-all-words-start').click();await page.waitForFunction(()=>activeAppView()==='study'&&!simpleStudyBusy);
 assert.equal(await rows().count(),0,'large list is released during study');assert.equal(await page.evaluate(()=>ensureSimpleStudySession().initial.length),2399);
 await page.locator('#review-flip').click();await page.evaluate(()=>gradeSimpleWordCard('again'));
 await page.locator('#review-flip').click();await page.evaluate(()=>gradeSimpleWordCard('remember'));
 const saved=await page.evaluate(()=>JSON.stringify(ensureSimpleStudySession()));assert.equal(JSON.parse(saved).passed.length,1);
 await page.evaluate(()=>closeVocabularyReview());await page.waitForFunction(()=>activeAppView()==='memory-set'&&studySetsUI.screen==='all');await page.waitForTimeout(120);
 const restored=await page.evaluate(index=>{const row=document.querySelector('.study-all-words-row[data-index="'+index+'"]');return {y:row?.getBoundingClientRect().top-studySetsUI.body.getBoundingClientRect().top,scroll:studySetsUI.body.scrollTop};},anchor.index);
 assert.ok(Math.abs(restored.y-anchor.y)<2,'deep scroll restored '+JSON.stringify({anchor,restored}));
 assert.equal(await page.evaluate(()=>JSON.stringify(words)===qaWords),true);
 assert.equal(await page.evaluate(()=>Object.entries(qaStorage).every(([k,v])=>localStorage.getItem(k)===v)),true,'original vocabulary and legacy storage stay byte-identical');
 await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>openVocabularyReview());await page.waitForFunction(()=>activeAppView()==='study'&&!simpleStudyBusy);
 assert.equal(await page.evaluate(()=>JSON.stringify(ensureSimpleStudySession())),saved,'durable queue/history survive reload');
 assert.deepEqual(errors,[]);writeFileSync(output+'/window-'+engine.name()+'.json',JSON.stringify({engine:engine.name(),native:false,totalWords:2294,totalMeanings:2399,layouts,anchor,restored,checks:'bounded DOM; all ordinals through final row; multi-meaning expansion/remount; 110 keyboard rows; deep-scroll return; complete queue/again/remember/reload; immutable vocabulary and legacy storage',errors},null,2));
 await context.close();
}finally{await browser.close();await server.close();}
