// Word flashcards play the English word through the lookup panel's speak()
// path: Web Speech in browsers, the breezeSpeech bridge in the iOS shell.
// The speaker never flips or swipes the card, a replay cancels the previous
// utterance, and moving to the next card stops the audio.
import assert from 'node:assert/strict';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
import {studyAction} from './helpers/study-actions.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const server=await serveStudyFixture(),browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const data={
 quiet:{word:'quiet',ko:'조용한',book:'Speech book',addedAt:1,status:1},
 resilient:{word:'resilient',ko:'회복력이 있는',book:'Speech book',addedAt:2,status:1},
 observe:{word:'observe',ko:'관찰하다',book:'Speech book',addedAt:3,status:1}
};

// Records every speech call. `mode` picks the platform the page believes it is on.
function speechStub(mode){
 window.qaSpeech=[];
 if(mode==='native'){
  window.webkit={messageHandlers:{breezeSpeech:{postMessage(message){
   window.qaSpeech.push({native:message.command,text:message.text,generation:message.generation});
   if(message.command==='speak')setTimeout(()=>window.dispatchEvent(new CustomEvent('breezeNativeSpeech',{detail:{generation:message.generation,state:'start'}})),0);
  }}}};
 }
 if(mode==='native'||mode==='none'){
  for(const name of ['speechSynthesis','SpeechSynthesisUtterance'])Object.defineProperty(window,name,{value:undefined,configurable:true,writable:true});
  return;
 }
 const synth={speaking:false,getVoices:()=>[{lang:'en-US',name:'qa'}],
  cancel(){window.qaSpeech.push({cancel:true});const u=this.current;this.current=null;if(u)u.onerror?.({error:'interrupted'});},
  speak(u){window.qaSpeech.push({speak:u.text,lang:u.lang});this.current=u;setTimeout(()=>{if(this.current===u)u.onstart?.();},0);}};
 class Utterance{constructor(text){this.text=text;}}
 Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
 Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true});
}

async function openScope(page,scope,setId){
 await page.evaluate(()=>{show('vocab');openStudySetsDirectory();});
 await page.waitForSelector('#study-sets-dialog[open]');
 await studyAction(page.locator(scope==='all'?'#study-sets-all':`.study-sets-home-card[data-set-id="${setId}"]`).click(),page);
 await studyAction(page.locator(scope==='all'?'#study-all-words-start':'#study-sets-start').click(),page);
}
const ids=scope=>scope==='all'?{card:'#review-flip',speak:'#review-speak',word:'#review-expression',answer:'#review-meaning',back:'#review-close'}:{card:'#study-sets-flashcard',speak:'#study-sets-speak',word:'#study-sets-expression',answer:'#study-sets-answer',back:'#study-sets-back'};

async function run(mode){
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce',hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(speechStub,mode);
 try{
  await prepareStudyPage(page,server.url);
  const setId=await page.evaluate(async data=>{
   words=data;saveWords();
   const state=await loadStudySets(),made=BreezeStudySets.create(state,{name:'Speech set',bookTitles:['Speech book']},words,100);
   await commitStudySets(made.state);return made.state.sets[0].id;
  },data);
  for(const scope of ['set','all']){
   const id=ids(scope);
   await openScope(page,scope,setId);
   const speaker=page.locator(id.speak);await page.locator(id.word).waitFor();
   const first=(await page.locator(id.word).innerText()).trim();
   assert.equal(await speaker.getAttribute('aria-label'),`${first} 발음 듣기`,`${mode}/${scope}: speaker names the word`);
   if(mode==='none'){
    assert.equal(await speaker.isHidden(),true,`${scope}: no speech engine hides the speaker`);
    await studyAction(page.locator(id.word).click(),page);
    assert.equal(await page.locator(id.answer).isVisible(),true,`${scope}: card still flips without speech`);
    await studyAction(page.locator(id.back).click(),page);continue;
   }
   assert.equal(await speaker.isVisible(),true);
   await page.evaluate(()=>{window.qaSpeech.length=0;});
   // Tap (touch) and click both play without revealing the answer.
   await speaker.tap();await page.waitForFunction(sel=>document.querySelector(sel)?.classList.contains('playing'),id.speak);
   assert.equal(await page.locator(id.answer).isVisible(),false,`${mode}/${scope}: speaker tap does not flip`);
   await speaker.click();
   const calls=await page.evaluate(()=>window.qaSpeech);
   if(mode==='native'){
    assert.deepEqual(calls.filter(c=>c.native==='speak').map(c=>c.text),[first,first],`${scope}: native bridge speaks and replays`);
   }else{
    assert.deepEqual(calls.filter(c=>c.speak).map(c=>c.speak),[first,first],`${scope}: Web Speech speaks and replays`);
    assert.ok(calls.findIndex(c=>c.cancel)>=0&&calls.findLastIndex(c=>c.cancel)<calls.findLastIndex(c=>c.speak),`${scope}: replay cancels before speaking again`);
    assert.equal(calls.find(c=>c.speak).lang,'en-US');
   }
   assert.equal(await page.locator(id.answer).isVisible(),false,`${mode}/${scope}: replay does not flip`);
   // Enter on the focused speaker replays and does not flip.
   await speaker.focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator(id.answer).isVisible(),false,`${mode}/${scope}: Enter on speaker does not flip`);
   // Flipping keeps the English side's speaker and the current audio.
   await page.evaluate(()=>{window.qaSpeech.length=0;});
   await studyAction(page.locator(id.word).click(),page);
   assert.equal(await page.locator(id.answer).isVisible(),true);
   assert.equal(await page.locator(id.speak).isVisible(),true,`${scope}: speaker stays on the flipped card`);
   assert.deepEqual(await page.evaluate(()=>window.qaSpeech),[],`${scope}: flipping does not stop or restart audio`);
   // Grading moves to the next card and stops the previous word at once.
   await studyAction(page.keyboard.press('ArrowRight'),page);
   const stopped=await page.evaluate(()=>window.qaSpeech);
   assert.ok(stopped.some(c=>mode==='native'?c.native==='cancel':c.cancel),`${mode}/${scope}: next card stops audio`);
   assert.equal(stopped.some(c=>c.speak||c.native==='speak'),false,`${scope}: next card does not auto-play`);
   const second=(await page.locator(id.word).innerText()).trim();
   assert.notEqual(second,first);
   assert.equal(await page.locator(id.speak).getAttribute('aria-label'),`${second} 발음 듣기`);
   assert.equal(await page.locator(id.speak).evaluate(node=>node.classList.contains('playing')),false,`${scope}: next card starts idle`);
   // A late start event for the cancelled word cannot mark the new card.
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('breezeNativeSpeech',{detail:{generation:-1,state:'start'}})));
   assert.equal(await page.locator(id.speak).evaluate(node=>node.classList.contains('playing')),false);
   // A drag that starts on the speaker swipes the card and does not play.
   await studyAction(page.locator(id.card).click(),page);
   await page.evaluate(()=>{window.qaSpeech.length=0;});
   const box=await page.locator(id.speak).boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+260,box.y+box.height/2,{steps:8});await page.mouse.up();
   await studyAction(Promise.resolve(),page);
   assert.notEqual((await page.locator(id.word).innerText()).trim(),second,`${scope}: drag from speaker grades the card`);
   assert.equal((await page.evaluate(()=>window.qaSpeech)).some(c=>c.speak||c.native==='speak'),false,`${scope}: drag from speaker does not play`);
   // Leaving the study screen stops a playing word.
   await speaker.click();await page.evaluate(()=>{window.qaSpeech.length=0;});
   await studyAction(page.locator(id.back).click(),page);
   assert.ok((await page.evaluate(()=>window.qaSpeech)).some(c=>mode==='native'?c.native==='cancel':c.cancel),`${mode}/${scope}: leaving stops audio`);
  }
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
}
try{
 for(const mode of ['web','native','none'])await run(mode);
 console.log(`${engine.name()}: flashcard pronunciation (web speech, native bridge, unavailable) passed`);
}finally{await browser.close();await server.close();}
