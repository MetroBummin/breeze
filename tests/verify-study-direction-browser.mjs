import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const proof=process.env.BREEZE_DIRECTION_PROOF||'/tmp/breeze-study-direction-proof';mkdirSync(proof,{recursive:true});
const record=process.env.BREEZE_RECORD_VIDEO==='1';
const server=await serveStudyFixture(),browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'no-preference',...(record?{recordVideo:{dir:proof,size:{width:390,height:844}}}:{})});
const page=await context.newPage(),errors=[],events=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
const pause=()=>page.waitForTimeout(record?850:50);
const source={bank:{word:'bank',ko:'강둑',book:'Reading',example:'We sat on the river bank.',status:1,addedAt:1},bankMoney:{root:'bank',word:'bank',ko:'은행',book:'Reading',example:'The bank opens at nine.',status:1,addedAt:2},quiet:{word:'quiet',ko:'조용한',book:'Reading',example:'The quiet room helped us think.',status:1,addedAt:3}};
async function drag(card,dx,{check=false}={}){
 const r=await card.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y,{steps:12});
 if(check){const cue=await card.evaluate(n=>{const s=getComputedStyle(n,'::after');return {text:s.content,opacity:Number(s.opacity),size:parseFloat(s.fontSize)};});assert.match(cue.text,dx<0?/다시 보기/:/알아요/);assert.ok(cue.opacity>.6&&cue.size>=20,'direction is readable before commitment');}
 // Stop movement before release: a subthreshold drag must cancel without velocity grading.
 await page.waitForTimeout(record?700:150);await page.mouse.up();await pause();
}
try{
 await prepareStudyPage(page,server.url);await page.evaluate(data=>{words=data;saveWords();show('vocab');renderVocab();},source);
 const before=await page.evaluate(()=>JSON.stringify(words));
 for(const mode of ['all','set']){
  if(mode==='all'){
   await page.evaluate(()=>openStudySetsDirectory());await page.locator('#study-sets-all').click();await page.locator('#study-all-words-start').click();await page.waitForFunction(()=>activeAppView()==='study'&&!simpleStudyBusy);
  }else{
   await page.evaluate(async()=>{show('vocab');const made=BreezeStudySets.create(await loadStudySets(),{name:'읽던 단어',bookTitles:['Reading']},words,100);await commitStudySets(made.state);});
   await page.evaluate(()=>openStudySetsDirectory());await page.locator('.study-sets-home-card[data-set-id]').first().click();await page.locator('#study-sets-word-list >li').first().waitFor();assert.equal(await page.locator('#study-sets-word-list >li').count(),2,'one row per word with all original senses');await page.locator('#study-sets-start').click();
  }
  const ids=mode==='all'?{card:'#review-flip',answer:'#review-meaning',word:'#review-expression',progress:'#review-progress',repeat:'#simple-word-again',known:'#simple-word-next'}:{card:'#study-sets-flashcard',answer:'#study-sets-answer',word:'#study-sets-expression',progress:'#study-sets-progress',repeat:'#study-sets-grade-repeat',known:'#study-sets-grade-remembered'};
  const card=page.locator(ids.card),progress=()=>page.locator(ids.progress).innerText();
  await card.waitFor();assert.equal(await progress(),'0 / 2');assert.equal(await page.locator(ids.answer).isVisible(),false);assert.equal(await page.locator(ids.repeat).isVisible(),false);
  await card.press('ArrowRight');assert.equal(await progress(),'0 / 2');await pause();
  await page.screenshot({path:`${proof}/${engine.name()}-${mode}-front.png`});
  await card.click();await page.locator(ids.answer).waitFor();assert.match(await page.locator(ids.answer).innerText(),/1\. 강둑\n2\. 은행/);assert.equal(await page.locator(ids.repeat).innerText(),'← 다시 보기');assert.equal(await page.locator(ids.known).innerText(),'알아요 →');
  for(const id of [ids.repeat,ids.known])assert.ok((await page.locator(id).boundingBox()).height>=44);
  await pause();await page.screenshot({path:`${proof}/${engine.name()}-${mode}-revealed.png`});
  await drag(card,32,{check:true});assert.equal(await progress(),'0 / 2');assert.equal(await page.locator(ids.word).innerText(),'bank');assert.equal(await page.locator(ids.answer).isVisible(),true);events.push(mode+': below-threshold canceled');
  await drag(card,-125,{check:true});await page.waitForFunction(({selector})=>document.querySelector(selector)?.textContent==='quiet',{selector:ids.word});assert.equal(await progress(),'0 / 2');events.push(mode+': left repeated without progress');
  await card.click();await page.locator(ids.answer).waitFor();await pause();await drag(card,125,{check:true});await page.waitForFunction(({selector})=>document.querySelector(selector)?.textContent==='bank',{selector:ids.word});assert.equal(await progress(),'1 / 2');events.push(mode+': right known, repeated bank returns');
  await card.click();await page.locator(ids.answer).waitFor();await pause();await page.locator(ids.repeat).click();await page.waitForFunction(selector=>document.querySelector(selector)?.hidden,ids.answer);assert.equal(await progress(),'1 / 2');events.push(mode+': visible repeat label tapped');
  await card.click();await page.locator(ids.answer).waitFor();
  for(const [width,height] of [[820,1180],[390,844]])for(const dark of [true,false]){await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);assert.ok(await page.locator(ids.known).isVisible());await page.screenshot({path:`${proof}/${engine.name()}-${mode}-${width}-${dark?'dark':'light'}.png`});}
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator(ids.known).focus();await pause();await page.keyboard.press('Enter');await page.waitForFunction(mode=>mode==='all'?simpleStudySession.queue.length===0:BreezeStudySets.view(studySetsUI.state,studySetsUI.setId).status==='complete',mode);events.push(mode+': keyboard label and reduced motion completed');await pause();await page.emulateMedia({reducedMotion:'no-preference'});
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(words)),before);assert.deepEqual(errors,[]);
 console.log(engine.name()+': grouped cards, reveal gate, large direction cues, cancellation, both swipes, tappable labels, repeated return, keyboard and reduced motion passed');
 writeFileSync(proof+'/'+engine.name()+'-events.json',JSON.stringify({kind:'Actual Playwright browser interaction; synthetic local words; no generated frames',events},null,2));
}catch(error){await page.screenshot({path:proof+'/'+engine.name()+'-failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{const video=page.video();await context.close();if(video){copyFileSync(await video.path(),proof+'/breeze-study-direction-'+engine.name()+'.webm');}await browser.close();await server.close();}
