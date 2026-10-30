import {studyAction} from './helpers/study-actions.mjs';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const proof='/tmp/breeze-flashcard-pronunciation-proof';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 // Stub Web Speech before any app script runs so the shared speak() path is
 // deterministic without real audio. Record spoken words and cancellations, and
 // drive onstart/onend synchronously so the playing state is observable.
 await page.addInitScript(()=>{
  localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
  window.qaSpoken=[];window.qaCancels=0;
  const synth={
   speaking:false,pending:false,paused:false,
   getVoices:()=>[{lang:'en-US',name:'Test English',voiceURI:'test',default:true,localService:true}],
   speak(u){window.qaSpoken.push(u.text);synth.speaking=true;if(typeof u.onstart==='function')u.onstart({});},
   cancel(){window.qaCancels++;synth.speaking=false;},
   pause(){},resume(){},addEventListener(){},removeEventListener(){}
  };
  Object.defineProperty(window,'speechSynthesis',{configurable:true,get:()=>synth});
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;this.lang='';this.rate=1;this.voice=null;this.onstart=null;this.onend=null;this.onerror=null;}};
 });
 await page.goto(url);await page.evaluate(()=>homeReady);
 const speak=page.locator('#review-speak');
 const spoken=()=>page.evaluate(()=>window.qaSpoken);
 const state=()=>speak.evaluate(n=>({muted:n.classList.contains('muted'),label:n.getAttribute('aria-label'),title:n.title,
  on:getComputedStyle(n.querySelector('.review-speak-on')).display!=='none',off:getComputedStyle(n.querySelector('.review-speak-off')).display!=='none'}));
 const ON={muted:false,label:'발음 켜짐',title:'발음 켜짐',on:true,off:false},OFF={muted:true,label:'발음 꺼짐',title:'발음 꺼짐',on:false,off:true};
 const open=async keys=>page.evaluate(async keys=>{if(activeAppView()==='study')closeVocabularyReview();window.qaSpoken=[];words=Object.fromEntries(keys.map(([k,w])=>[k,{word:w,ko:'뜻 '+w,book:'Book',status:2}]));saveWords();renderVocab();await openVocabularyReview();},keys);

 // (1) Default ON: opening a one-card session pronounces the English side exactly once.
 assert.equal(await page.evaluate(()=>localStorage.getItem('breeze.cardSpeech')),null,'preference should start unset');
 await open([['one','thunderhead']]);
 assert.equal(await page.locator('#review-progress').innerText(),'0 / 1');
 assert.equal(await speak.isVisible(),true,'speaker button missing on the card front');
 assert.deepEqual(await state(),ON);
 const box=await speak.boundingBox();
 assert.ok(box.width>=44&&box.height>=44,'speaker button is smaller than the 44px touch target');
 assert.deepEqual(await spoken(),['thunderhead'],'default did not auto-play the English side once');
 // Re-rendering the same front must not replay.
 await page.evaluate(()=>{renderSimpleWordCards();renderSimpleWordCards();});
 assert.deepEqual(await spoken(),['thunderhead'],'re-render replayed the word');
 await page.screenshot({path:`${proof}/on-390x844-light.png`});

 // Flip, then "again" brings the same single card back to the English side: it plays once more.
 await studyAction(page.locator('#review-flip').press('Enter'),page);
 assert.equal(await page.locator('#review-meaning').isVisible(),true);
 assert.deepEqual(await spoken(),['thunderhead'],'flipping to the meaning side replayed');
 await studyAction(page.keyboard.press('ArrowLeft'),page);await page.waitForTimeout(240);
 assert.equal(await page.evaluate(()=>simpleWordCards.flipped),false);
 assert.deepEqual(await spoken(),['thunderhead','thunderhead'],'returning to the English side did not auto-play once');

 // (2) Toggle OFF: stops audio, mutes the icon, never flips/advances, no auto-play on later cards.
 await open([['a1','thunderhead'],['a2','breeze'],['a3','gale']]);
 assert.deepEqual(await spoken(),['thunderhead']);
 const cancelsBefore=await page.evaluate(()=>window.qaCancels);
 await speak.click();
 assert.equal(await page.evaluate(()=>window.qaCancels)>cancelsBefore,true,'toggle off did not stop current audio');
 assert.deepEqual(await state(),OFF);
 assert.equal(await speak.evaluate(n=>n.classList.contains('playing')),false,'playing state stuck after muting');
 assert.equal(await page.evaluate(()=>simpleWordCards.flipped),false,'speaker tap flipped the card');
 assert.equal(await page.locator('#review-progress').innerText(),'0 / 3','speaker tap advanced progress');
 assert.equal(await page.evaluate(()=>localStorage.getItem('breeze.cardSpeech')),'false','off choice was not persisted');
 await page.screenshot({path:`${proof}/off-390x844-light.png`});
 await page.evaluate(()=>{darkMode=true;applyDark();});await page.waitForTimeout(30);
 await page.screenshot({path:`${proof}/off-390x844-dark.png`});
 await page.evaluate(()=>{darkMode=false;applyDark();});
 await studyAction(page.locator('#review-flip').press('Enter'),page);
 await studyAction(page.keyboard.press('ArrowRight'),page);await page.waitForTimeout(240);
 assert.equal(await page.locator('#review-progress').innerText(),'1 / 3','card did not advance on grade');
 assert.deepEqual(await spoken(),['thunderhead'],'muted card auto-played');

 // Persist: reload the app; still muted, still no auto-play.
 await page.reload();await page.evaluate(()=>homeReady);
 await page.evaluate(async ()=>{window.qaSpoken=[];show('vocab');await openVocabularyReview();});
 assert.equal(await speak.isVisible(),true);
 assert.deepEqual(await state(),OFF,'muted state not restored after reload');
 assert.deepEqual(await spoken(),[],'auto-played after reload while muted');

 // (3) Toggle ON: icon/label switch back, the current card speaks once, later cards auto-play.
 const current=await page.locator('#review-expression').innerText();
 await speak.press('Enter');
 assert.deepEqual(await state(),ON);
 assert.equal(await page.evaluate(()=>simpleWordCards.flipped),false,'speaker key flipped the card');
 assert.equal(await page.evaluate(()=>localStorage.getItem('breeze.cardSpeech')),'true');
 assert.deepEqual(await spoken(),[current],'re-enabling did not speak the current card once');
 await page.evaluate(()=>renderSimpleWordCards());
 assert.deepEqual(await spoken(),[current],'re-enabling then re-render spoke twice');
 const cancelsAdvance=await page.evaluate(()=>window.qaCancels);
 await studyAction(page.locator('#review-flip').press('Enter'),page);
 await studyAction(page.keyboard.press('ArrowRight'),page);await page.waitForTimeout(240);
 const next=await page.locator('#review-expression').innerText();
 assert.notEqual(next,current,'card did not advance');
 assert.equal(await page.evaluate(()=>window.qaCancels)>cancelsAdvance,true,'advancing did not cancel in-flight speech');
 assert.deepEqual(await spoken(),[current,next],'next card did not auto-play once after re-enabling');

 // Completion screen: no button, no auto-play.
 await studyAction(page.locator('#review-flip').press('Enter'),page);
 await studyAction(page.keyboard.press('ArrowRight'),page);await page.waitForTimeout(240);
 assert.equal(await page.locator('#simple-study-completion').isVisible(),true,'session did not complete');
 assert.equal(await speak.isVisible(),false,'speaker button visible on the completion screen');
 assert.deepEqual(await spoken(),[current,next],'completion screen spoke');
 // Empty screen: no words, no button, no auto-play.
 await open([]);
 assert.equal(await speak.isVisible(),false,'speaker button visible on the empty screen');
 assert.deepEqual(await spoken(),[],'empty screen spoke');

 // (4) No audio: auto-play and toggling never throw, and the card still flips/advances.
 await page.evaluate(()=>{Object.defineProperty(window,'speechSynthesis',{configurable:true,get:()=>undefined});});
 const errorsBefore=errors.length;
 await open([['n1','thunderhead'],['n2','breeze']]);
 await speak.click();await speak.click();await page.waitForTimeout(50);
 assert.deepEqual(await state(),ON);
 assert.equal(await page.evaluate(()=>simpleWordCards.flipped),false,'no-audio speaker tap flipped the card');
 await studyAction(page.locator('#review-flip').press('Enter'),page);
 assert.equal(await page.locator('#review-meaning').isVisible(),true,'card did not flip with no audio available');
 await studyAction(page.keyboard.press('ArrowRight'),page);await page.waitForTimeout(240);
 assert.equal(await page.locator('#review-progress').innerText(),'1 / 2');
 assert.equal(errors.length,errorsBefore,'no-audio path raised a pageerror: '+errors.slice(errorsBefore).join(', '));

 // Restore the stub; ON/OFF screenshots and overflow checks across layouts.
 await page.evaluate(()=>{
  const synth={speaking:false,pending:false,paused:false,getVoices:()=>[{lang:'en-US',name:'Test English',voiceURI:'test',default:true,localService:true}],speak(u){window.qaSpoken.push(u.text);},cancel(){window.qaCancels++;},pause(){},resume(){},addEventListener(){},removeEventListener(){}};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,get:()=>synth});
 });
 await open([['one','thunderhead']]);
 // Let the earlier no-audio toast expire so it does not cover the captures.
 await page.waitForTimeout(2800);
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[844,390]])for(const dark of [false,true])for(const muted of [false,true]){
  await page.setViewportSize({width,height});
  await page.evaluate(value=>{darkMode=value;applyDark();},dark);
  if((await state()).muted!==muted)await speak.click();
  // Clean captures: clear the playing flash, an earlier no-audio toast and focus rings.
  await page.evaluate(()=>{document.getElementById('review-speak').classList.remove('playing');document.getElementById('toast').classList.remove('on');document.activeElement?.blur();});
  await page.mouse.move(1,1);
  await page.waitForTimeout(400);
  assert.equal(await speak.isVisible(),true);
  assert.equal(await page.locator('#v-study').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,`#v-study overflows at ${width}x${height}`);
  await page.screenshot({path:`${proof}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}-${muted?'off':'on'}.png`});
 }
 assert.deepEqual(errors,[]);
 console.log(`${engine.name()}: default auto-play once, no replay on re-render, toggle off mutes+persists across reload, toggle on resumes, no audio on completion/empty, no-audio no-throw, 16 layouts with no overflow passed`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
