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
 await page.evaluate(()=>{show('vocab');openVocabularyReview();});
 assert.equal(await page.locator('#review-status').innerText(),'저장된 단어가 없어요. 읽다가 뜻을 저장하거나 Memory에서 단어를 추가해 보세요.');
 assert.equal(await page.locator('#simple-word-next').isDisabled(),true);
 await page.evaluate(()=>{show('vocab');words={one:{word:'quiet',ko:'조용한',example:'The room is quiet.',book:'Book',status:2}};saveWords();renderVocab();openVocabularyReview();});
 assert.equal(await page.locator('#review-progress').innerText(),'1 / 1');
 assert.equal(await page.locator('#simple-word-previous').isDisabled(),true);assert.equal(await page.locator('#simple-word-next').isDisabled(),true);
 await page.locator('#review-reveal').click();assert.equal(await page.locator('#review-meaning').innerText(),'조용한');
 await page.locator('#review-flip').press('Enter');assert.equal(await page.locator('#review-front').isVisible(),true);
 await page.evaluate(()=>{closeVocabularyReview();words=Object.fromEntries(Array.from({length:2100},(_,i)=>['k'+i,{word:'word'+i,ko:'뜻 '+i,example:'A saved example with word'+i+'.',book:'Saved',status:i%3+1,addedAt:i}]));saveWords();renderVocab();document.getElementById('vsearch').value='word99';renderVocab();openVocabularyReview();});
 assert.equal(await page.locator('#review-progress').innerText(),'1 / 2100');
 const wordsBefore=await page.evaluate(()=>JSON.stringify(words));
 await page.locator('#simple-word-next').click();assert.equal(await page.locator('#review-expression').innerText(),'word1');
 await page.locator('#review-reveal').click();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#review-front').isVisible(),true);
 await page.locator('#simple-word-previous').click();assert.equal(await page.locator('#review-progress').innerText(),'2 / 2100');
 await page.locator('#review-close').click();await page.locator('#wordbook-review').click();assert.equal(await page.locator('#review-progress').innerText(),'2 / 2100');
 await page.goBack();await page.waitForFunction(()=>activeAppView()==='vocab');
 await page.goForward();await page.waitForFunction(()=>activeAppView()==='study');assert.equal(await page.locator('#review-progress').innerText(),'2 / 2100');
 await page.evaluate(()=>{simpleWordCards.index=2099;simpleWordCards.flipped=false;renderSimpleWordCards();});
 assert.equal(await page.locator('#review-progress').innerText(),'2100 / 2100');assert.equal(await page.locator('#simple-word-next').isDisabled(),true);
 await page.evaluate(()=>{gradeVocabularyReview('easy');saveReviewLimits();openVocabularyReview(true,true);document.getElementById('review-limit-form').dispatchEvent(new Event('change'));});
 for(const id of ['review-grade','review-journey','review-celebration','review-more','review-extra'])assert.equal(await page.locator('#'+id).isVisible(),false);
 await page.evaluate(()=>{closeVocabularyReview();openSettings();});
 assert.equal(await page.locator('#review-settings').isVisible(),false);assert.equal(await page.locator('#review-daily-limit').isDisabled(),true);
 await page.evaluate(()=>{closeSettings();show('study',{fromHistory:true});});assert.equal(await page.locator('#review-progress').innerText(),'2100 / 2100');
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();},dark);
  await page.locator('#review-reveal').click();
  assert.equal(await page.locator('#v-study').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,JSON.stringify({width,height,dark,layout:await page.locator('#v-study').evaluate(n=>({client:n.clientWidth,scroll:n.scrollWidth,overflow:[...n.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>n.getBoundingClientRect().right+1).map(e=>[e.id,e.getBoundingClientRect().width,e.getBoundingClientRect().right])}))}));
  const nav=await page.locator('#simple-word-navigation').boundingBox();assert.ok(nav.width<=width);
  await page.screenshot({path:`${proof}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(words)),wordsBefore);
 assert.deepEqual(await page.evaluate(()=>qaReviewAccess),[]);
 assert.equal(await page.evaluate(()=>qaNativeGet.call(localStorage,'breeze.vocabulary-review.v1')),rawReview);
 await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>{show('vocab');openVocabularyReview();});
 assert.equal(await page.locator('#review-progress').innerText(),'1 / 2100');
 assert.deepEqual(await page.evaluate(()=>qaReviewAccess),[]);assert.deepEqual(errors,[]);
 console.log(`${engine.name()}: empty/one/2100, filters, flip/navigation/reopen/history, dormant review/settings, persistence and10 layouts passed`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
