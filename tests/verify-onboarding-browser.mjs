import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,copyFileSync} from 'node:fs';
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
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch(process.env.BREEZE_CHROMIUM?{executablePath:process.env.BREEZE_CHROMIUM}:{});
const artifact='/tmp/breeze-onboarding-review'+(process.env.BROWSER==='webkit'?'-webkit':'');mkdirSync(artifact,{recursive:true});
async function ready(page){
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>homeReady);
 await page.waitForFunction(()=>onboardingSession && document.querySelectorAll('#rtext .w').length===5);
 await page.evaluate(()=>{window.demoCalls=0;dictCall=async()=>{window.demoCalls++;throw Error('Demo used network');};});
}
async function wordInteraction(page,capture=false){
 await page.locator('#rtext .onboard-focus-word').click();
 await page.waitForFunction(()=>document.getElementById('word-peek-meaning').textContent==='산들바람');
 if(capture)await page.waitForTimeout(400);
 if(capture)await page.screenshot({path:`${artifact}/web-word-mini.png`});
 assert.equal(await page.evaluate(()=>onboardingSession.wordExpanded),false);
 await page.locator('#word-peek-more').click();
 await page.waitForFunction(()=>onboardingSession.wordExpanded);
 if(capture)await page.waitForTimeout(400);
 if(capture)await page.screenshot({path:`${artifact}/web-word-expanded.png`});
 await page.locator('#onboard-return').click();
 assert.equal(await page.locator('#onboarding').getAttribute('data-stage'),'2');
}
try{
 for(const native of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',recordVideo:native?undefined:{dir:artifact,size:{width:390,height:844}}});
  if(native)await context.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios'};});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await ready(page);
  assert.equal(await page.locator('#onboard-prompt').textContent(),'브리즈에 오신 걸 환영해요');
  assert.equal(await page.locator('#onboarding button:visible').count(),1);
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-welcome.png`});
  await page.locator('#onboard-next').click();
  assert.equal(await page.locator('#rtext .w:visible').count(),1);
  assert.equal(await page.locator('#onboard-next').isDisabled(),true);
  const snapshot=()=>page.evaluate(()=>({words:JSON.stringify(words),dead:JSON.stringify(dead),positions:JSON.stringify(positions),books:JSON.stringify(books),stored:Object.fromEntries(Object.entries(localStorage).filter(([key])=>!key.startsWith('breeze.onboarding')))}));
  const before=await snapshot();
  await page.waitForTimeout(650);
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-word.png`});
  await context.setOffline(true);
  await wordInteraction(page,!native);
  await page.waitForFunction(()=>[...document.querySelectorAll('#rtext .w')].filter(node=>getComputedStyle(node).visibility==='visible').length===4);
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#rtext .w:visible').count(),4);
  // Interrupt and reopen: prepared completion survives, no history/book survives.
  await context.setOffline(false);
  await page.reload();await page.evaluate(()=>homeReady);
  await page.locator('#onboarding[data-stage="2"]').waitFor();
  await page.evaluate(()=>{window.demoCalls=0;dictCall=async()=>{window.demoCalls++;throw Error('Demo used network');};});
  await page.locator('#onboard-back').click();
  assert.equal(await page.locator('#onboard-next').isEnabled(),true);
  await page.locator('#onboard-next').click();
  await context.setOffline(true);
  const word=page.locator('#rtext p:last-child .w').first(),rect=await word.boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();await page.waitForTimeout(820);
  assert.equal(await page.locator('#sentence-modal').isVisible(),false,'long press must wait for release');
  await page.mouse.up();
  await page.locator('#ps-ko').waitFor({state:'visible'});
  assert.equal(await page.locator('#ps-ko').textContent(),'자연스럽게 읽어 나가세요.');
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-translation.png`});
  assert.equal(await page.evaluate(()=>onboardingSession.easySeen),false);
  await page.locator('#ps-easy-button').click();
  await page.waitForFunction(()=>onboardingSession.easySeen);
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-easy.png`});
  await page.locator('#onboard-return').click();
  assert.equal(await page.locator('#onboard-next').isDisabled(),true);
  const initialFont=await page.locator('#rtext p:last-child').evaluate(n=>getComputedStyle(n).fontSize);
  await page.locator('#onboard-font-larger').click();
  await page.waitForTimeout(650);
  assert.notEqual(await page.locator('#rtext p:last-child').evaluate(n=>getComputedStyle(n).fontSize),initialFont);
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-settings.png`});
  await page.locator('#onboard-next').click();
  assert.equal(await page.locator('#onboard-next').textContent(),'책 추가하기');
  assert.equal(await page.locator('#onboard-finish').textContent(),'나중에');
  assert.equal(await page.locator('#onboarding button:visible').count(),2);
  assert.doesNotMatch(await page.locator('#onboarding').innerText(),/로그인|Apple/);
  await page.screenshot({path:`${artifact}/${native?'native':'web'}-finish.png`});
  assert.equal(await page.evaluate(()=>window.demoCalls),0);
  await page.locator('#onboard-finish').click();
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.deepEqual(await snapshot(),before,'demo changed durable library/vocabulary/preferences');
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>localStorage.getItem(ONBOARD_PROGRESS_KEY)),null);
  await context.setOffline(false);
  await page.reload();await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').isVisible(),false,'completed guide reopened');
  // Replay cancellation invalidates both word and easy-explanation replies.
  await page.evaluate(()=>startOnboarding(true));await page.locator('#onboard-next').click();
  await page.locator('#rtext .onboard-focus-word').click();
  await page.locator('#onboard-return').click();await page.locator('#onboard-skip').click();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator('#word-peek').isVisible(),false);
  await page.evaluate(()=>startOnboarding(true));await page.locator('#onboard-next').click();
  await wordInteraction(page);
  // Keyboard-accessible alternative invokes the same Reader sentence adapter.
  await page.locator('#onboard-sentence').focus();await page.keyboard.press('Enter');
  await page.locator('#ps-easy-button').waitFor({state:'visible'});await page.locator('#ps-easy-button').click();
  await page.evaluate(()=>endOnboarding(true));await page.waitForTimeout(1100);
  assert.equal(await page.locator('#sentence-modal').isVisible(),false);
  assert.equal(await page.evaluate(()=>sentenceEasyState),null);
  assert.deepEqual(errors,[]);
  const video=page.video();await context.close();
  if(video)copyFileSync(await video.path(),`${artifact}/guided-onboarding.webm`);
 }
 // Review every stage in light/dark, phone, tablet, desktop and short/narrow viewports.
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 await context.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
 await ready(page);
 for(const dark of [false,true])for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]]){
  await page.setViewportSize({width,height});
  await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
  for(let stage=0;stage<5;stage++){
   await page.evaluate(stage=>{onboardingSession.stage=stage;drawOnboarding();},stage);
   await page.waitForTimeout(650);
   const bounds=await page.locator('#onboard-coach').boundingBox();
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,`coach overflow ${width}x${height} stage ${stage}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${artifact}/${dark?'dark':'light'}-${width}x${height}-stage-${stage}.png`});
  }
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{onboardingSession.stage=1;drawOnboarding();});
 assert.equal(await page.locator('#rtext .onboard-focus-word').evaluate(n=>getComputedStyle(n).animationName),'none');
 await page.locator('#rtext .onboard-focus-word').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.activeElement===document.getElementById('word-peek-more'));
 await page.keyboard.press('Enter');await page.waitForFunction(()=>onboardingSession.wordExpanded);
 await page.locator('#onboard-return').focus();await page.keyboard.press('Enter');

 await page.evaluate(()=>{onboardingSession.stage=4;drawOnboarding();});
 await page.locator('#onboard-next').click();
 assert.equal(await page.locator('#add-modal').evaluate(n=>n.open),true,'existing book import route missing');
 await page.evaluate(()=>{closeAddModal();openSyncModal();});
 assert.equal(await page.locator('#sm-apple-login').isEnabled(),true,'web Apple handler missing');
 await page.evaluate(()=>{
   window.appleProviderReads=0;const realFetch=window.fetch;
   window.fetch=(...args)=>{
     if(String(args[0]).endsWith('/auth/v1/settings')){window.appleProviderReads++;return Promise.resolve(new Response(JSON.stringify({external:{apple:false}}),{status:200,headers:{'Content-Type':'application/json'}}));}
     return realFetch(...args);
   };
 });
 await page.locator('#sm-apple-login').click();
 await page.waitForFunction(()=>document.getElementById('sm-status').textContent.includes('아직 설정되지'));
 assert.equal(await page.locator('#sm-apple-login').isEnabled(),true,'provider error left login stuck');
 assert.equal(await page.evaluate(()=>window.appleProviderReads),1);
 assert.equal(await page.locator('#sm-password-login').evaluate(n=>n.getBoundingClientRect().height>=44),true);
 await page.locator('#sm-password-login').click();
 assert.equal(await page.locator('#sm-password').isVisible(),true,'existing password route missing');
 await page.evaluate(()=>closePasswordLogin());
 await page.locator('#sm-email-login summary').click();
 assert.equal(await page.locator('#sm-email').isVisible(),true,'existing email route missing');
 await page.evaluate(()=>closeSettings());
 // Existing local data suppresses first-time onboarding without deleting it.
 await page.evaluate(()=>{localStorage.removeItem(ONBOARD_KEY);words.kept={word:'kept',ko:'보관한',status:1};save(LS_WORDS,words);});
 await page.reload();await page.evaluate(()=>homeReady);
 assert.equal(await page.locator('#onboarding').isVisible(),false);
 assert.equal(await page.evaluate(()=>words.kept.ko),'보관한');
 await page.evaluate(()=>{words={};save(LS_WORDS,words);});
 // Signed-out UI is the current renderer, including legacy cached data and blocked contexts.
 await page.evaluate(()=>openBook({id:'signedout-ui',title:'Signed-out reader',kind:'txt',paras:['This is a demo.']}));
 await page.waitForFunction(()=>document.querySelector('#rtext .w'));
 // A replay returns to the original Reader and restores normal Back navigation.
 await page.evaluate(()=>startOnboarding(true));
 await page.locator('#onboard-next').click();
 await page.locator('#onboard-skip').click();
 await page.waitForFunction(()=>curBook && curBook.id==='signedout-ui');
 assert.equal(await page.locator('#readback').isEnabled(),true);
 await page.evaluate(()=>returnHomeFromReader());
 await page.locator('#v-home').waitFor({state:'visible'});
 await page.evaluate(()=>openBook({id:'signedout-ui',title:'Signed-out reader',kind:'txt',paras:['This is a demo.']}));
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
 await context.close();
 console.log('Guided onboarding: word/sentence, font preview, book import and Settings login, reopening, back, skip, completion, keyboard alternative, cancellation, storage isolation and responsive themes passed');
}finally{await browser.close();await new Promise(done=>server.close(done));}
