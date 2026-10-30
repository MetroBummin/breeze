// Screenshots of both word-flashcard surfaces (study set and All Words) for
// review. No assertions, so it also runs on a checkout without the speaker.
// BREEZE_CARD_SPEECH_OUTPUT=dir BREEZE_CARD_SPEECH_LABEL=before|after
import {mkdirSync} from 'node:fs';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
import {studyAction} from './helpers/study-actions.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=process.env.BREEZE_CARD_SPEECH_OUTPUT||'/tmp/breeze-card-speech',label=process.env.BREEZE_CARD_SPEECH_LABEL||'after';
mkdirSync(out,{recursive:true});
const data={resilient:{word:'resilient',ko:'회복력이 있는',book:'Speech book',addedAt:1,status:1},quiet:{word:'quiet',ko:'조용한',book:'Speech book',addedAt:2,status:1}};
const viewports=[['phone',390,844],['tablet',820,1180],['desktop',1440,900],['short',844,390]];
const server=await serveStudyFixture(),browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  // Deterministic: a voice exists even in headless browsers without one.
  const synth={getVoices:()=>[],cancel(){},speak(u){setTimeout(()=>u.onstart?.(),0);}};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
  if(typeof SpeechSynthesisUtterance==='undefined')Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class{constructor(t){this.text=t;}},configurable:true});
 });
 await prepareStudyPage(page,server.url);
 const setId=await page.evaluate(async data=>{
  words=data;saveWords();
  const state=await loadStudySets(),made=BreezeStudySets.create(state,{name:'Speech set',bookTitles:['Speech book']},words,100);
  await commitStudySets(made.state);return made.state.sets[0].id;
 },data);
 for(const scope of ['set','all']){
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{show('vocab');openStudySetsDirectory();});
  await page.waitForSelector('#study-sets-dialog[open]');
  await studyAction(page.locator(scope==='all'?'#study-sets-all':`.study-sets-home-card[data-set-id="${setId}"]`).click(),page);
  await studyAction(page.locator(scope==='all'?'#study-all-words-start':'#study-sets-start').click(),page);
  await page.locator(scope==='all'?'#review-expression':'#study-sets-expression').waitFor();
  for(const [name,width,height] of viewports)for(const dark of [false,true]){
   await page.setViewportSize({width,height});await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
   await page.waitForTimeout(80);
   await page.screenshot({path:`${out}/${engine.name()}-${scope}-${name}-${dark?'dark':'light'}-${label}.png`});
  }
  // The playing state, phone light, after a tap on the speaker.
  const speaker=page.locator(scope==='all'?'#review-speak':'#study-sets-speak');
  if(await speaker.count()&&await speaker.isVisible()){
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{darkMode=false;applyDark();});
   await speaker.click();await page.waitForTimeout(80);
   await page.screenshot({path:`${out}/${engine.name()}-${scope}-phone-light-${label}-playing.png`});
  }
  await studyAction(page.locator(scope==='all'?'#review-close':'#study-sets-back').click(),page);
 }
 console.log(`${engine.name()}: ${label} flashcard screenshots in ${out}`);
}finally{await browser.close();await server.close();}
