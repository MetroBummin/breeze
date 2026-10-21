import {studyAction} from './helpers/study-actions.mjs';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const proof='/tmp/breeze-simple-word-cards-proof';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const rawReview='{"version":3,"cards":{"saved":{"due":9999999999999}},"session":{"preserved":true}}';
try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(raw=>{
  localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
  localStorage.setItem('breeze.vocabulary-review.v1',raw);
  window.qaReviewAccess=[];
  window.qaNativeGet=Storage.prototype.getItem;
  for(const name of ['getItem','setItem','removeItem']){const native=Storage.prototype[name];Storage.prototype[name]=function(key,...rest){if(key.startsWith('breeze.vocabulary-review'))qaReviewAccess.push(name);return native.call(this,key,...rest);};}
 },rawReview);
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.evaluate(async ()=>{show('vocab');await openVocabularyReview();});
 assert.equal(await page.locator('#review-status').innerText(),'저장된 단어가 없어요. 읽다가 뜻을 저장하거나 Memory에서 단어를 추가해 보세요.');
 assert.equal(await page.locator('#simple-word-next').isDisabled(),true);
 await page.evaluate(async ()=>{show('vocab');words={one:{word:'quiet',ko:'조용한',example:'The room is quiet.',book:'Book',status:2}};saveWords();renderVocab();await openVocabularyReview();});
 assert.equal(await page.locator('#review-progress').innerText(),'0 / 1',JSON.stringify(await page.evaluate(()=>({view:activeAppView(),error:String(vocabularyReviewLastError),state:simpleStudySession,word:words})))) ;assert.equal(await page.locator('#review-sentence').isVisible(),false);assert.equal(await page.locator('#review-sentence').textContent(),'');assert.equal(await page.locator('#review-meaning').isVisible(),false);
 await studyAction(page.locator('#review-flip').press('ArrowRight'),page);assert.equal(await page.locator('#review-progress').innerText(),'0 / 1');
 await studyAction(page.locator('#review-flip').press('Enter'),page);assert.equal(await page.locator('#review-meaning').innerText(),'조용한');
 await studyAction(page.locator('#review-flip').press('Enter'),page);assert.equal(await page.locator('#review-meaning').isVisible(),true,'tap is one-way reveal');
 await studyAction(page.keyboard.press('ArrowLeft'),page);await page.waitForTimeout(220);assert.equal(await page.locator('#review-progress').innerText(),'0 / 1');assert.equal(await page.locator('#review-front').isVisible(),true);
 await studyAction(page.locator('#review-flip').press('Enter'),page);await studyAction(page.keyboard.press('ArrowRight'),page);await page.waitForTimeout(220);assert.equal(await page.locator('#review-status').innerText(),'이번 세션 1 / 1 완료');
 assert.equal(await page.locator('#simple-word-previous').isVisible(),false);
 await page.evaluate(async ()=>{closeVocabularyReview();words=Object.fromEntries(Array.from({length:2400},(_,i)=>['k'+i,{word:'word'+i,ko:'뜻 '+i,example:('The reader observes the evidence, takes notes, and considers the surrounding context. ').repeat(4)+'A saved example with word'+i+'.',book:'Saved',status:i%3+1,addedAt:i}]));saveWords();renderVocab();document.getElementById('vsearch').value='word99';renderVocab();await openVocabularyReview();});
 assert.equal(await page.locator('#review-progress').innerText(),'0 / 2400');const wordsBefore=await page.evaluate(()=>JSON.stringify(words));
 await studyAction(page.locator('#review-flip').click(),page);await studyAction(page.keyboard.press('ArrowRight'),page);await studyAction(page.keyboard.press('ArrowRight'),page);await page.waitForTimeout(220);assert.equal(await page.locator('#review-expression').innerText(),'word1');assert.equal(await page.locator('#review-progress').innerText(),'1 / 2400');
 await studyAction(page.locator('#review-close').click(),page);await studyAction(page.evaluate(()=>openStudySetsDirectory()),page);await studyAction(page.locator('#study-sets-all').click(),page);await studyAction(page.locator('#study-all-words-start').click(),page);
 // Opening reads IDB before entering study. The old hidden progress label can
 // already contain1/2400 while navigation/resume is still in flight; Back at
 // that point cancels the opening rather than returning from the study page.
 await page.waitForFunction(()=>activeAppView()==='study'&&!simpleStudyBusy&&history.state?.studySetsAllWords);
 assert.equal(await page.locator('#review-progress').innerText(),'1 / 2400');
 await page.goBack();await page.waitForFunction(()=>activeAppView()==='memory-set'&&studySetsUI.screen==='all');
 await page.goForward();await page.waitForFunction(()=>activeAppView()==='study');assert.equal(await page.locator('#review-progress').innerText(),'1 / 2400');
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();},dark);await studyAction(page.locator('#review-flip').click(),page);
  assert.equal(await page.locator('#v-study').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  await page.screenshot({path:`${proof}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(words)),wordsBefore);
 assert.deepEqual(await page.evaluate(()=>qaReviewAccess),[]);assert.equal(await page.evaluate(()=>qaNativeGet.call(localStorage,'breeze.vocabulary-review.v1')),rawReview);
 await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(async ()=>{show('vocab');await openVocabularyReview();});
 assert.equal(await page.locator('#review-progress').innerText(),'1 / 2400');assert.equal(await page.locator('#review-meaning').isVisible(),false);
 assert.deepEqual(await page.evaluate(()=>qaReviewAccess),[]);assert.deepEqual(errors,[]);
 console.log(`${engine.name()}: empty/one/2400, filters, reveal/grade/undo/reopen/history, dormant review/settings, session persistence and10 layouts passed`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
