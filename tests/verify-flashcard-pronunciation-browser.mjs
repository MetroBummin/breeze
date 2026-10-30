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
 // A saved word card with an English word.
 await page.evaluate(async ()=>{show('vocab');words={one:{word:'thunderhead',ko:'소나기구름',book:'Book',status:2}};saveWords();renderVocab();await openVocabularyReview();});
 assert.equal(await page.locator('#review-progress').innerText(),'0 / 1');

 // (a) The speaker button is present on the English side with the right labels.
 const speak=page.locator('#review-speak');
 assert.equal(await speak.isVisible(),true,'speaker button missing on the card front');
 assert.equal(await speak.getAttribute('aria-label'),'발음 듣기');
 assert.equal(await speak.getAttribute('title'),'발음 듣기');
 const box=await speak.boundingBox();
 assert.ok(box.width>=44&&box.height>=44,'speaker button is smaller than the 44px touch target');

 // (b) Clicking speaks the card's English word; (c) clicking does not flip the card.
 await speak.click();
 assert.deepEqual(await page.evaluate(()=>window.qaSpoken),['thunderhead'],'first tap did not speak the English word');
 assert.equal(await page.evaluate(()=>simpleWordCards.flipped),false,'speaker tap flipped the card');
 assert.equal(await page.locator('#review-front').isVisible(),true);
 assert.equal(await page.locator('#review-progress').innerText(),'0 / 1','speaker tap advanced progress');
 assert.equal(await page.evaluate(()=>document.getElementById('review-speak').classList.contains('playing')),true,'playing state not reflected on the card button');

 // Clicking again replays (a second call to the shared speak path).
 await speak.click();
 assert.deepEqual(await page.evaluate(()=>window.qaSpoken),['thunderhead','thunderhead'],'second tap did not replay');

 // (d) Advancing to the next card cancels in-flight speech. Add a second card so
 // a grade actually advances rather than completing.
 // New keys so the simple session restarts with a two-card queue (added words do
 // not expand a started session; a removed key forces a fresh one).
 await page.evaluate(async ()=>{closeVocabularyReview();words={a1:{word:'thunderhead',ko:'소나기구름',book:'Book',status:2},a2:{word:'breeze',ko:'산들바람',book:'Book',status:2}};saveWords();renderVocab();await openVocabularyReview();});
 assert.equal(await page.locator('#review-progress').innerText(),'0 / 2','two-card session did not start');
 const firstWord=await page.locator('#review-expression').innerText();
 await page.locator('#review-speak').click();
 const cancelsBefore=await page.evaluate(()=>window.qaCancels);
 await studyAction(page.locator('#review-flip').press('Enter'),page);
 assert.equal(await page.locator('#review-meaning').isVisible(),true);
 await studyAction(page.keyboard.press('ArrowRight'),page);await page.waitForTimeout(240);
 assert.equal(await page.evaluate(()=>window.qaCancels)>cancelsBefore,true,'advancing the card did not cancel in-flight speech');
 assert.notEqual(await page.locator('#review-expression').innerText(),firstWord,'card did not advance on grade');
 assert.equal(await page.evaluate(()=>document.getElementById('review-speak').classList.contains('playing')),false,'playing state stuck after advancing');

 // (e) With speechSynthesis unavailable, the button must not throw and the card still flips/advances.
 await page.evaluate(()=>{delete window.speechSynthesis;Object.defineProperty(window,'speechSynthesis',{configurable:true,get:()=>undefined});});
 const errorsBefore=errors.length;
 await page.locator('#review-speak').click();
 await page.waitForTimeout(50);
 assert.equal(errors.length,errorsBefore,'no-audio speaker tap raised a pageerror: '+errors.slice(errorsBefore).join(', '));
 assert.equal(await page.evaluate(()=>simpleWordCards.flipped),false,'no-audio speaker tap flipped the card');
 await studyAction(page.locator('#review-flip').press('Enter'),page);
 assert.equal(await page.locator('#review-meaning').isVisible(),true,'card did not flip with no audio available');
 await studyAction(page.keyboard.press('ArrowRight'),page);await page.waitForTimeout(240);
 // Grading advances or completes the session; either way it must not throw.
 assert.equal(errors.length,errorsBefore,'grading with no audio raised a pageerror');

 // Restore the stub and reopen for the before/after screenshots.
 await page.evaluate(()=>{
  const synth={speaking:false,pending:false,paused:false,getVoices:()=>[{lang:'en-US',name:'Test English',voiceURI:'test',default:true,localService:true}],speak(u){window.qaSpoken.push(u.text);if(typeof u.onstart==='function')u.onstart({});},cancel(){window.qaCancels++;},pause(){},resume(){},addEventListener(){},removeEventListener(){}};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,get:()=>synth});
 });
 await page.evaluate(async ()=>{closeVocabularyReview();words={one:{word:'thunderhead',ko:'소나기구름',book:'Book',status:2}};saveWords();renderVocab();await openVocabularyReview();});
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});
  await page.evaluate(value=>{darkMode=value;applyDark();},dark);
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#review-speak').isVisible(),true);
  assert.equal(await page.locator('#v-study').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,`#v-study overflows at ${width}x${height}`);
  await page.screenshot({path:`${proof}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log(`${engine.name()}: speaker button present, speaks on tap, replays, no flip on tap, cancel on advance, no-audio no-throw, and 8 layouts with no overflow passed`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
