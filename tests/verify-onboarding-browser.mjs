/* First-run onboarding v2: local word demo, real vocabulary save, book choice,
   and the one-time reader long-press tip. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
const root=resolve('.'),out=process.env.BREEZE_ONBOARD_PROOF||'/tmp/breeze-onboarding-v2';
mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.txt':'text/plain'};
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
 catch{res.writeHead(404).end();}
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const fast={idle:40,burst:50,hold:20,suck:40,pill:40,toast:30,choice:40};
const story='Alice looked at the rabbit.\n\nShe decided to follow it across the field.\n\nThe hedge hid a large hole.\n';
const version=detail=>detail&&detail.onboarding_version==='v2';
async function openPage(options={}){
 const context=await browser.newContext({viewport:options.viewport||{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:options.reducedMotion});
 if(options.timing||options.track||options.seed){
  await context.addInitScript(({timing,track,seed})=>{
   if(timing)window.__ONBOARD_TIMING__=timing;
   if(track){window.__onboardEvents=[];window.breezeTrack=(name,detail)=>window.__onboardEvents.push({name,detail});}
   if(seed)for(const [key,value] of Object.entries(seed))localStorage.setItem(key,value);
  },{timing:options.timing||null,track:!!options.track,seed:options.seed||null});
 }
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
 await page.goto(url);
 await page.evaluate(()=>homeReady);
 return {context,page,errors};
}
try{
 {
  const {context,page,errors}=await openPage();
  assert.equal(await page.evaluate(()=>onboardTiming().idle),3000);
  assert.equal(await page.locator('#onboarding').isVisible(),true);
  assert.equal(await page.locator('#onboard-welcome,.breeze-wordmark').count(),0);
  assert.equal(await page.locator('#onboard-skip').innerText(),'건너뛰기');
  assert.equal(await page.evaluate(()=>onboardingOwnsReader()),false);
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:{...fast,toast:700,choice:500},track:true});
  await page.waitForFunction(()=>document.querySelectorAll('.onboard-meaning.show').length>=10);
  assert.equal(await page.locator('#onboard-burst svg,.speed-line,[class*=speed]').count(),0);
  await page.screenshot({path:`${out}/burst.png`});
  await page.waitForFunction(()=>document.getElementById('onboarding').dataset.scene==='pill'||document.getElementById('onboarding').dataset.scene==='save');
  const copy=await page.evaluate(()=>({pill:document.getElementById('onboard-pill').textContent.replace(/\s+/g,' ').trim(),sentence:document.getElementById('onboard-sentence-stage').textContent}));
  assert.match(copy.pill,/맡다 · \(일자리를\) 받아들이다/);
  assert.match(copy.pill,/문맥에 맞는 뜻/);
  assert.match(copy.sentence,/She decided to take the job in London/);
  await page.screenshot({path:`${out}/pill.png`});
  await page.waitForFunction(()=>document.getElementById('onboarding').dataset.scene==='choice');
  await page.screenshot({path:`${out}/choice.png`});
  const saved=await page.evaluate(()=>({ko:words.take&&words.take.ko,example:words.take&&words.take.example,sample:!!(words.take&&words.take.onboardingSample),events:window.__onboardEvents}));
  assert.equal(saved.ko,'맡다 · (일자리를) 받아들이다');
  assert.equal(saved.example,'She decided to take the job in London.');
  assert.equal(saved.sample,true);
  assert.ok(saved.events.some(event=>event.name==='onboarding_start'&&version(event.detail)));
  assert.ok(saved.events.some(event=>event.name==='onboarding_step_complete'&&event.detail.step==='word'&&version(event.detail)));
  assert.ok(saved.events.some(event=>event.name==='onboarding_step_complete'&&event.detail.step==='burst'&&version(event.detail)));
  assert.ok(saved.events.some(event=>event.name==='first_lookup_success'&&event.detail.source==='canned'&&version(event.detail)));
  assert.ok(saved.events.some(event=>event.name==='vocab_save'&&event.detail.word==='take'&&version(event.detail)));
  assert.equal(saved.events.some(event=>event.name==='first_word_tap'),false);
  assert.equal(await page.locator('#onboard-read').innerText(),'앨리스 바로 읽기');
  assert.equal(await page.locator('#onboard-skip').isVisible(),false);
  const last=page.locator('.onboard-cover').last();
  const lastId=await last.getAttribute('data-book');
  await last.click();
  assert.equal(await page.locator('#onboard-read').getAttribute('data-book'),lastId);
  assert.match(await page.locator('#onboard-read').innerText(),/바로 읽기$/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await page.reload();
  await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').getAttribute('data-scene'),'choice');
  await page.evaluate(()=>localStorage.removeItem(ONBOARD_PROGRESS_KEY));
  await page.reload();
  await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').isVisible(),true,'sample take counted as an existing library');
  assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await page.evaluate(()=>goOnboardingPage(1));
  await page.locator('#onboard-browse').click();
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>activeAppView()),'home');
  const choice=await page.evaluate(()=>window.__onboardEvents.filter(event=>event.name==='onboarding_choice').pop());
  assert.equal(choice.detail.choice,'browse');
  assert.equal(choice.detail.onboarding_version,'v2');
  await page.reload();
  await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:{...fast,idle:60000},track:true});
  await page.locator('#onboard-take').click();
  await page.waitForFunction(()=>document.querySelectorAll('.onboard-meaning').length>=10);
  const tapped=await page.evaluate(()=>window.__onboardEvents.find(event=>event.name==='first_word_tap'));
  assert.ok(tapped&&version(tapped.detail));
  await page.locator('#onboard-skip').click();
  assert.equal(await page.locator('#onboarding').getAttribute('data-scene'),'choice');
  assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>words.take&&words.take.onboardingSample),true);
  const skipped=await page.evaluate(()=>window.__onboardEvents.find(event=>event.name==='onboarding_step_skip'));
  assert.ok(['word','burst','sentence','pill','save'].includes(skipped.detail.step));
  assert.equal(skipped.detail.onboarding_version,'v2');
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:fast,reducedMotion:'reduce',track:true});
  await page.waitForFunction(()=>document.getElementById('onboarding').dataset.scene==='choice');
  assert.equal(await page.locator('.onboard-meaning').count(),0);
  assert.equal(await page.evaluate(()=>words.take.ko),'맡다 · (일자리를) 받아들이다');
  assert.ok(await page.evaluate(()=>window.__onboardEvents.some(event=>event.name==='first_lookup_success'&&event.detail.source==='canned')));
  await page.screenshot({path:`${out}/reduced-choice.png`});
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({seed:{
   'breeze.learning.guest.v1':'guest:onboard-test',
   ['breeze.account.v1.'+encodeURIComponent('guest:onboard-test')+'.breeze.word-item.quiet']:JSON.stringify({word:'quiet',ko:'조용한',status:2,addedAt:1}),
  }});
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({seed:{'breeze.pos':JSON.stringify({shelf:{t:1,p:0}})}});
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:{...fast,idle:60000}});
  await page.evaluate(()=>goOnboardingPage(1));
  await page.locator('#onboard-fileinput').setInputFiles({name:'Rabbit.txt',mimeType:'text/plain',buffer:Buffer.from(story)});
  await page.waitForFunction(()=>load(ONBOARD_KEY,'')==='done'&&books.length===1);
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>books[0].kind),'txt');
  const before=await page.evaluate(()=>books.map(book=>book.id));
  await page.evaluate(()=>startOnboarding(true));
  assert.equal(await page.locator('#onboarding').getAttribute('data-scene'),'word');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>books.map(book=>book.id)),before);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:{...fast,idle:60000}});
  await page.evaluate(()=>goOnboardingPage(1));
  await page.locator('#onboard-fileinput').setInputFiles({name:'broken.epub',mimeType:'application/epub+zip',buffer:Buffer.from('not an epub')});
  await page.waitForFunction(()=>document.getElementById('onboard-file-status').textContent.includes('다시 골라'));
  assert.equal(await page.locator('#onboarding').getAttribute('data-scene'),'choice');
  assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.locator('#onboard-file').isEnabled(),true);
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:{...fast,idle:60000},track:true});
  await page.evaluate(()=>goOnboardingPage(1));
  await page.locator('#onboard-read').click();
  await page.waitForFunction(()=>{void homeReady;return activeAppView()==='read'&&!!document.querySelector('#rtext .w');});
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>curBook&&curBook.longReadId),'alice-in-wonderland');
  const choice=await page.evaluate(()=>window.__onboardEvents.find(event=>event.name==='onboarding_choice'));
  assert.equal(choice.detail.choice,'alice-in-wonderland');
  assert.equal(choice.detail.onboarding_version,'v2');
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:{...fast,idle:60000},track:true,viewport:{width:390,height:844}});
  await page.evaluate(()=>goOnboardingPage(1));
  await page.locator('#onboard-fileinput').setInputFiles({name:'Hedge.txt',mimeType:'text/plain',buffer:Buffer.from(story)});
  await page.waitForFunction(()=>books.length===1&&load(ONBOARD_KEY,'')==='done');
  await page.evaluate(async()=>{await openBook(books[0]);});
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>=3);
  const words=page.locator('#rtext .w');
  await words.nth(0).click();
  await words.nth(1).click();
  assert.equal(await page.locator('#longpress-tip').count(),0);
  await words.nth(2).click();
  await page.locator('#longpress-tip').waitFor();
  const placed=await page.evaluate(()=>{
   placeLongpressTip();
   const tip=document.getElementById('longpress-tip').getBoundingClientRect();
   const column=document.getElementById('readwrap').getBoundingClientRect();
   return {tip:{left:tip.left,right:tip.right,top:tip.top,bottom:tip.bottom},column:{left:column.left,right:column.right,top:column.top,bottom:column.bottom},text:document.getElementById('longpress-tip').innerText,mark:!!document.querySelector('.longpress-tip-mark')||!!(CSS.highlights&&CSS.highlights.has('breeze-longpress-tip'))};
  });
  assert.match(placed.text,/문장을 꾹 눌러보세요/);
  assert.match(placed.text,/문장 전체 해석을 볼 수 있어요/);
  assert.ok(placed.tip.left>=placed.column.left-1&&placed.tip.right<=placed.column.right+1,JSON.stringify(placed));
  assert.equal(placed.mark,true);
  await page.screenshot({path:`${out}/longpress-tip.png`});
  const shown=await page.evaluate(()=>window.__onboardEvents.find(event=>event.name==='longpress_tip_shown'));
  assert.ok(shown&&version(shown.detail));
  await page.locator('#longpress-tip button').click();
  assert.equal(await page.locator('#longpress-tip').count(),0);
  assert.equal(await page.evaluate(()=>load(LONGPRESS_TIP_KEY,'')),'dismissed');
  const dismissed=await page.evaluate(()=>window.__onboardEvents.find(event=>event.name==='longpress_tip_dismissed'));
  assert.equal(dismissed.detail.reason,'close');
  await page.reload();
  await page.evaluate(()=>homeReady);
  await page.evaluate(async()=>{await openBook(books[0]);});
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>=3);
  await page.locator('#rtext .w').nth(0).click();
  await page.locator('#rtext .w').nth(1).click();
  await page.locator('#rtext .w').nth(2).click();
  assert.equal(await page.locator('#longpress-tip').count(),0);
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:{...fast,idle:60000}});
  await page.evaluate(()=>goOnboardingPage(1));
  await page.locator('#onboard-fileinput').setInputFiles({name:'Field.txt',mimeType:'text/plain',buffer:Buffer.from(story)});
  await page.waitForFunction(()=>books.length===1);
  await page.evaluate(async()=>{await openBook(books[0]);});
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>=3);
  const box=await page.locator('#rtext .w').nth(3).boundingBox();
  await page.mouse.move(box.x+2,box.y+2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  assert.equal(await page.evaluate(()=>load(LONGPRESS_TIP_KEY,'')),'dismissed');
  assert.equal(await page.locator('#longpress-tip').count(),0);
  await page.locator('#rtext .w').nth(0).click();
  await page.locator('#rtext .w').nth(1).click();
  await page.locator('#rtext .w').nth(2).click();
  assert.equal(await page.locator('#longpress-tip').count(),0);
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({timing:fast,viewport:{width:320,height:568}});
  await page.waitForFunction(()=>document.getElementById('onboarding').dataset.scene==='choice');
  for(const selector of ['#onboard-coverflow','#onboard-read','#onboard-file','#onboard-browse']){
   const box=await page.locator(selector).boundingBox();
   assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=321&&box.y+box.height<=569,`${selector} ${JSON.stringify(box)}`);
  }
  assert.equal(await page.locator('.onboard-file-tag').innerText(),'PDF · EPUB');
  await page.screenshot({path:`${out}/choice-short.png`});
  await page.evaluate(async()=>{
   localStorage.removeItem(ONBOARD_KEY);
   await bookPut({id:'owned-shelf',title:'Owned',kind:'txt',paras:['Hello from the shelf.'],addedAt:5});
  });
  await page.reload();
  await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await context.close();
  assert.deepEqual(errors,[]);
 }
 {
  const {context,page,errors}=await openPage({reducedMotion:'reduce'});
  await page.evaluate(()=>{localStorage.setItem(ONBOARD_PROGRESS_KEY,JSON.stringify({page:7}));startOnboarding(false);});
  assert.equal(await page.locator('#onboarding').getAttribute('data-scene'),'choice');
  assert.match(await page.locator('#onboard-read').innerText(),/바로 읽기$/);
  await context.close();
  assert.deepEqual(errors,[]);
 }
 console.log('Onboarding v2: word burst, canned pill, vocabulary save, choice, file, reader tip, and first-run detection passed');
}finally{await browser.close();await new Promise(resolveClose=>server.close(resolveClose));}
