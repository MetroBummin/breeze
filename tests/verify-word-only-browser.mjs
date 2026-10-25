// Shipping UI policy is independent of whether the retained example algorithm passes.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
import {studyAction} from './helpers/study-actions.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out='/tmp/breeze-word-only-proof';mkdirSync(out,{recursive:true});
const server=await serveStudyFixture(),browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const example='The quiet room had a blue window.';
const data={quiet:{word:'quiet',ko:'조용한',example,book:'Original Reading',addedAt:1,status:2,defs:[{pos:'adjective',def:'making little noise'}]}};
const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[],layouts=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await prepareStudyPage(page,server.url);
 const id=await page.evaluate(async data=>{
  words=data;saveWords();show('vocab');
  const state=await loadStudySets(),made=BreezeStudySets.create(state,{name:'Words only',bookTitles:['Original Reading']},words,100);
  await commitStudySets(made.state);return made.state.sets[0].id;
 },data);
 let before=await page.evaluate(()=>JSON.stringify(words));
 const setsBefore=await page.evaluate(()=>readStudyStorage(STUDY_SETS_STORAGE,BreezeStudySets.decode));
 assert.equal(await page.evaluate(()=>BreezeVocabularyTest.prompt(words.quiet).text),example,'valid algorithm output does not enable display');
 const memory=page.locator('#v-vocab .vgroup').first();await memory.locator('.vrow').click();
 assert.equal(await memory.locator('.vex').count(),0);assert.match(await memory.locator('.vmeta').innerText(),/Original Reading/);
 await page.evaluate(()=>selectWord('quiet',null));
 assert.equal(await page.locator('#p-ex-fold').isVisible(),false);assert.equal(await page.locator('#p-ex').textContent(),'');
 // Selecting a saved word legitimately updates pickedAt; compare its retained fields first.
 await page.waitForFunction(()=>Number.isFinite(words.quiet.pickedAt));
 assert.deepEqual(await page.evaluate(()=>{const {pickedAt,...stored}=words.quiet;return stored;}),data.quiet);
 before=await page.evaluate(()=>JSON.stringify(words));
 await page.evaluate(async ()=>{closePanel();window.qaExport='';deliverVocabularyCsv=async csv=>{window.qaExport=csv;return false;};await openStudySetsAllWords();await studySetsShareVisible();});
 const csv=await page.evaluate(()=>window.qaExport);assert.ok(csv.includes(example));assert.ok(csv.includes('Original Reading'));assert.ok(csv.includes('조용한'));
 for(const scope of ['all','set']){
  await page.evaluate(()=>{show('vocab');openStudySetsDirectory();});
  await page.waitForSelector('#study-sets-dialog[open]');
  await studyAction(page.locator(scope==='all'?'#study-sets-all':`.study-sets-home-card[data-set-id="${id}"]`).click(),page);
  const list=page.locator(scope==='all'?'#study-all-words-list':'#study-sets-word-list');
  await list.locator('.vrow').first().click();
  assert.equal(await list.locator('.vex').count(),0);assert.match(await list.locator('.vmeta').first().innerText(),/Original Reading/);
  assert.equal(await page.evaluate(()=>readStudyStorage(STUDY_SETS_STORAGE,BreezeStudySets.decode)),setsBefore,'viewing lists leaves captured source data intact');
  await studyAction(page.locator(scope==='all'?'#study-all-words-start':'#study-sets-start').click(),page);
  const card=page.locator(scope==='all'?'#review-flip':'#study-sets-flashcard');await card.waitFor();
  for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
   await page.setViewportSize({width,height});await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
   assert.ok(!(await card.innerText()).includes(example));assert.ok(!(await card.getAttribute('aria-label')||'').includes(example));
   assert.equal(await page.locator('.study-sets-card-example').count(),0);assert.equal(await page.locator('#review-sentence').isVisible(),false);
   await page.screenshot({path:`${out}/${engine.name()}-${scope}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});layouts.push({scope,width,height,dark});
  }
  await studyAction(card.click(),page);assert.match(await card.innerText(),/조용한/);assert.ok(!(await card.innerText()).includes(example));
  await studyAction(page.locator(scope==='all'?'#review-close':'#study-sets-back').click(),page);
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(words)),before);
 await page.reload();await page.evaluate(()=>homeReady);assert.equal(await page.evaluate(()=>JSON.stringify(words)),before,'source examples survive relaunch');
 assert.equal(await page.evaluate(()=>BreezeVocabularyTest.ENABLED),false);assert.deepEqual(errors,[]);
 writeFileSync(`${out}/${engine.name()}.json`,JSON.stringify({engine:engine.name(),native:false,layouts,examplesRetained:true,csvRetained:true,algorithmCannotEnableDisplay:true},null,2));
 console.log(`${engine.name()}: word-only UI, source metadata, stored examples, CSV and 20 layouts passed`);
}finally{await browser.close();await server.close();}
