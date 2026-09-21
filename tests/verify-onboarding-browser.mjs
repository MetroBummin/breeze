import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch();
const artifact='/tmp/breeze-onboarding-review'+(process.env.BROWSER==='webkit'?'-webkit':'');mkdirSync(artifact,{recursive:true});
try{
 for(const native of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  if(native) await context.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true};});
  const page=await context.newPage(),requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const href=route.request().url();
    if(href.startsWith(url)||href.startsWith('blob:'))return route.continue();
    requests.push(href);return route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('#onboarding').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
  assert.equal(await page.locator('#v-read').isVisible(),true);
  assert.equal(await page.locator('#readpill-title').textContent(),'Welcome to Breeze');
  assert.equal(await page.locator('#modefab').isVisible(),false);
  assert.equal(await page.locator('#onboard-chrome').count(),0);
  assert.equal(await page.locator('#onboard-word-peek').count(),0);
  const snapshot=()=>page.evaluate(()=>({words:JSON.stringify(words),dead:JSON.stringify(dead),positions:JSON.stringify(positions),books:JSON.stringify(books),stored:Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=='breeze.onboarding.v1')),history:history.length}));
  const before=await snapshot();
  assert.deepEqual(await page.evaluate(()=>[...new Set([...document.querySelectorAll('#rtext .w')].map(n=>n.textContent.toLowerCase()))].filter(word=>!ONBOARD_WORDS[word])),[]);
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-start.png`});
  const word=page.locator('#rtext .w').filter({hasText:/^curiosity$/}).first();
  const start=Date.now();await word.tap();
  await page.waitForTimeout(180);
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'뜻 찾는 중');
  await page.waitForFunction(()=>document.getElementById('word-peek-meaning').textContent==='호기심');
  assert.ok(Date.now()-start>=450,'prepared answer skipped its first lookup delay');
  await page.locator('#word-peek-more').tap();
  assert.equal(await page.locator('#p-ai-ko').textContent(),'호기심');
  assert.equal(await page.locator('#p-ai-saved').isVisible(),false);
  assert.equal(await page.locator('#p-word-tools').isVisible(),false);
  assert.doesNotMatch(await page.locator('#panel').innerText(),/이 문장에서는|무료 체험|로그인|옛 설명/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#onboarding').isVisible(),true,'detail Escape ended tutorial');
  await page.locator('#onboarding[data-stage="1"]').waitFor();
  await word.tap();
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'호기심','repeat lookup was not immediate');
  await page.keyboard.press('Escape');
  const sentence=page.locator('#rtext .w').filter({hasText:/^Tap$/}).first();
  const rect=await sentence.boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();await page.waitForTimeout(820);
  assert.equal(await page.locator('#sentence-pill-status').isVisible(),true);
  await page.mouse.up();
  await page.locator('#sentence-modal').waitFor({state:'visible'});
  assert.equal(await page.locator('#ps-ko').textContent(),'단어를 탭해 뜻을 알아보세요.');
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-sentence.png`});
  await page.keyboard.press('Escape');
  await page.locator('#onboarding[data-stage="2"]').waitFor();
  await page.locator('#aafab').tap();
  await page.evaluate(()=>{fontSize(1);toggleDark();setReadMargin('wide');});
  assert.equal(await page.evaluate(()=>fs),20);
  assert.equal(await page.evaluate(()=>darkMode),true);
  await page.evaluate(()=>closeAa());
  await page.locator('#onboarding[data-stage="3"]').waitFor();
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-finish.png`});
  assert.deepEqual(await snapshot(),before,'tutorial changed storage, history or library');
  await page.locator('#onboard-next').tap();
  assert.equal(await page.locator('#add-modal').evaluate(el=>el.classList.contains('on')),true);
  assert.deepEqual(await page.evaluate(()=>({fs,darkMode,readMargin,curBook,previewWordCard})),{fs:19,darkMode:false,readMargin:'normal',curBook:null,previewWordCard:null});
  assert.deepEqual(await snapshot(),before,'completion leaked tutorial data');
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(1000);
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  // Replay works on both platforms and preserves an existing vocabulary/tombstone.
  await page.evaluate(()=>{words.curiosity={word:'curiosity',ko:'기존 뜻',status:2,mark:true,addedAt:1,up:1};words['phrase:little curiosity']={word:'little curiosity',ko:'기존 표현',status:2,mark:true,phraseParts:['little','curiosity'],addedAt:1,up:1};dead.unfamiliar=42;saveWords();save(LS_DEAD,dead);});
  const replayBefore=await snapshot();
  await page.evaluate(()=>startOnboarding(true));
  await page.waitForFunction(()=>document.querySelector('#rtext .w'));
  assert.equal(await page.locator('#rtext .phrase,#rtext .s2').count(),0,'personal highlights leaked into the tutorial');
  await page.locator('#rtext .w').first().tap();
  await page.evaluate(()=>endOnboarding(true));
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#word-peek').isVisible(),false,'late word reopened after exit');
  assert.deepEqual(await snapshot(),replayBefore,'replay modified personal data');
  await page.evaluate(()=>startOnboarding(true));
  await page.evaluate(()=>openSentence(ONBOARD_PASSAGES[0][0]));
  // Awaiting openSentence finishes the prepared answer; a second pending lookup is cancelled on Back.
  await page.evaluate(()=>{closeSentence();openSentence(ONBOARD_PASSAGES[1][0]);show('home');});
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#sentence-modal').isVisible(),false,'late sentence reopened after Back');
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>positions['breeze-onboarding']),undefined);
  assert.equal(requests.filter(href=>/functions\/v1\/dict|dictionaryapi|translate\.googleapis/.test(href)).length,0,'tutorial made a dictionary request');
  assert.deepEqual(errors,[]);
  await context.close();
 }
 // Existing data skips first run on web; this has no dependency on arbitrary storage keys.
 const page=await browser.newPage({viewport:{width:1100,height:800},serviceWorkers:'block'});
 await page.addInitScript(()=>localStorage.setItem('breeze.pos',JSON.stringify({existing:{p:.4,t:1}})));
 await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(1100);
 assert.equal(await page.locator('#onboarding').isVisible(),false);
 await page.evaluate(()=>startOnboarding(true));
 await page.screenshot({path:`artifact-desktop.png`.replace('artifact',artifact+'/web')});
 await page.locator('#onboard-skip').click();
 assert.equal(await page.locator('#onboarding').isVisible(),false);
 // Signed-out UI is the current renderer, including legacy cached data and blocked contexts.
 await page.evaluate(()=>openBook({id:'signedout-ui',title:'Signed-out reader',kind:'txt',paras:['This is a demo.']}));
 await page.waitForFunction(()=>document.querySelector('#rtext .w'));
 await page.evaluate(()=>{
   sbUser=null;anonLooksLeft=1;
   words.demo={word:'demo',clicked:'demo',ko:'체험',example:'This is a demo.',status:1,mark:true,
     ai:{ko:'체험',pos:'noun',done:true,note:'이 문장에서는 옛 설명',gloss:'retired AI gloss'},defs:[]};
   selectWord('demo',null,false);
 });
 assert.equal(await page.locator('#p-ai-ko').textContent(),'체험');
 assert.equal(await page.locator('#p-aihint').isVisible(),false,'successful anonymous lookup still nags about remaining trials');
 assert.doesNotMatch(await page.locator('#panel').innerText(),/이 문장에서는|retired AI gloss|무료 체험|로그인/);
 await page.evaluate(()=>{
   words.demo.ko='';words.demo.ai.ko='';words.demo.aiLoading=true;
   document.getElementById('p-ai-note').textContent='이 문장에서는 옛 설명';
   renderPanel();
 });
 assert.equal(await page.locator('#p-ai-ko').textContent(),'');
 assert.equal(await page.locator('#p-ai-pos').textContent(),'');
 assert.equal(await page.locator('#p-ai-note').textContent(),'');
 await page.evaluate(()=>{
   words.demo.aiLoading=false;words.demo.aiOff='trial';renderPanel();
 });
 assert.equal(await page.locator('#p-aibtn-t').textContent(),'로그인하고 계속 쓰기');
 assert.equal(await page.locator('#p-aihint').isVisible(),false,'exhaustion message is duplicated');
 assert.equal(await page.locator('#p-ai-note').textContent(),'무료 체험을 다 썼어요');
 await page.evaluate(()=>{
   closePanel();words.demo.ko='체험';words.demo.ai.ko='체험';delete words.demo.aiOff;
   contextView={key:'demo',sentence:'Another demo.',error:'login'};
   selectWord('demo',document.querySelector('#rtext .w'),true);
   window.onboardingTestDictCalls=0;
   dictCall=async()=>{window.onboardingTestDictCalls++;return {error:'login_required'};};
 });
 assert.equal(await page.locator('#word-peek-meaning').textContent(),'로그인하고 뜻 보기','blocked reused meaning produced an empty pill');
 await page.locator('#word-peek-retry').click();
 assert.equal(await page.locator('#settings-modal').evaluate(node=>node.classList.contains('on')),true);
 assert.equal(await page.evaluate(()=>window.onboardingTestDictCalls),0,'login action sent a doomed dictionary request');
 console.log('Web/native real Reader onboarding: delay, real gestures, detail, Aa, replay, cancellation and storage isolation verified');
}finally{await browser.close();await new Promise(done=>server.close(done));}
