import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium,webkit,devices} from './helpers/bounded-playwright.mjs';
const root=resolve('.'),out=process.env.BREEZE_ONBOARD_PROOF||'/tmp/breeze-onboarding-carousel';mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.txt':'text/plain','.mp4':'video/mp4','.woff2':'font/woff2'};
const server=createServer((req,res)=>{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));try{const data=readFileSync(p);res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');const range=req.headers.range;if(range){const match=/bytes=(\d*)-(\d*)/.exec(String(range));const start=match&&match[1]?Number(match[1]):0;let end=match&&match[2]?Number(match[2]):data.length-1;if(!match||start>end||start>=data.length){res.writeHead(416).end();return;}end=Math.min(end,data.length-1);res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':String(end-start+1)});res.end(data.subarray(start,end+1));return;}res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];const receipts=[];
async function setup(options={}){
 const {iphone,...rest}=options;
 const device=iphone&&process.env.BROWSER==='webkit'?devices['iPhone 13']:{};
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',...device,...rest});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 return {context,page};
}
const dataSnapshot=page=>page.evaluate(()=>JSON.stringify({words,dead,positions,books,curBook,fs,darkMode,readMargin,history:history.length,storage:Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('breeze.onboarding.')))}));
const cardIndex=page=>page.evaluate(()=>onboardingCardIndex());
async function goCard(page,index){
 await page.evaluate(index=>{
  const wrap=document.getElementById('onboard-wrap');
  const card=wrap.querySelector('.onboard-card');
  wrap.scrollTo({left:(card.offsetWidth+20)*index,behavior:'instant'});
 },index);
 await page.waitForFunction(index=>onboardingCardIndex()===index,index);
 await waitDots(page,index);
}
const waitDots=(page,index)=>page.waitForFunction(index=>[...document.querySelectorAll('#onboarding .onboard-dots')].every(d=>[...d.children].findIndex(el=>el.classList.contains('on'))===index),index);
const dotsActive=page=>page.evaluate(()=>[...document.querySelectorAll('#onboarding .onboard-dots')].map(d=>[...d.children].findIndex(el=>el.classList.contains('on'))));
const videoState=page=>page.evaluate(()=>[...document.querySelectorAll('#onboarding .onboard-card video')].map(v=>({src:v.currentSrc.split('/').pop(),ready:v.readyState,paused:v.paused})));
try{
 // Structure, copy, dots, video switching and play-only-the-visible-card.
 // WebKit uses the iPhone 13 profile (390 CSS px, mobile Safari UA).
 {
  const {context,page}=await setup({iphone:true});
  const mediaRequests=[];page.on('request',r=>{if(/\.mp4/.test(r.url()))mediaRequests.push(r.url());});
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#onboarding').waitFor({state:'visible'});
  if(process.env.BROWSER==='webkit')assert.match(await page.evaluate(()=>navigator.userAgent),/iPhone/);
  assert.equal(await page.locator('.onboard-card').count(),3);
  assert.equal(await page.locator('#onboarding .onboard-dots').count(),3);
  assert.equal(await page.locator('#onboarding .onboard-dots i').count(),9);
  assert.equal(await page.locator('.onboard-card[data-card="0"] .t1').textContent(),'단어를 탭해보세요');
  assert.equal(await page.locator('.onboard-card[data-card="0"] .t2').textContent(),'단어에 딱 맞는 뜻이 나옵니다');
  assert.equal(await page.locator('.onboard-card[data-card="1"] .t1').textContent(),'홈에서 북마크를 탭해보세요');
  assert.equal(await page.locator('.onboard-card[data-card="1"] .t2').textContent(),'단어장에서 학습이 가능합니다');
  assert.equal(await page.locator('#onboard-next').count(),0,'prev/next buttons must not exist');
  assert.equal(await page.locator('#onboard-back').count(),0,'prev/next buttons must not exist');
  assert.equal(await page.locator('#onboard-welcome').count(),0,'welcome stage must not exist');
  assert.equal(await page.locator('#onboard-skip').isVisible(),true);
  assert.equal(await page.locator('#onboard-skip').textContent(),'건너뛰기');
  assert.equal(await page.locator('#onboard-status').textContent(),'1 / 3 · 단어 뜻 보기');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('onboard-wrap')).scrollSnapType),'x mandatory');
  const openedAt=Date.now();
  await page.waitForFunction(()=>{
    const v=document.querySelectorAll('#onboarding .onboard-card video')[0];
    return v.muted&&v.loop&&v.playsInline&&v.hasAttribute('playsinline')&&v.preload==='auto'&&v.hasAttribute('autoplay')&&!v.hasAttribute('src');
  });
  assert.equal(await page.evaluate(()=>{
    const v=document.querySelectorAll('#onboarding .onboard-card video')[1];
    return v.preload==='none'&&!v.hasAttribute('autoplay')&&!v.hasAttribute('src');
  }),true,'card 2 stays unloaded until it is shown');
  await page.waitForFunction(()=>{const v=document.querySelectorAll('#onboarding .onboard-card video')[0];return v.readyState>=2&&!v.paused&&v.currentTime>0;});
  const t0=await page.evaluate(()=>document.querySelectorAll('#onboarding .onboard-card video')[0].currentTime);
  await page.waitForFunction(start=>{const v=document.querySelectorAll('#onboarding .onboard-card video')[0];return v.currentTime>start+0.04;},t0);
  assert.ok(Date.now()-openedAt<1500,'card 1 currentTime did not advance within 1.5s of open');
  assert.equal((await videoState(page))[0].src,'card1.mp4','phone plays the 9:16 render');
  assert.equal((await videoState(page))[1].paused,true,'off-screen card stays paused');
  if(process.env.BROWSER==='webkit'){
    // WebKit probes each <source> at selection time even with preload="none";
    // the off-screen video must still hold no data and never play.
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#onboarding .onboard-card video')].map(v=>({ready:v.readyState,buffered:v.buffered.length,paused:v.paused}))[1]),{ready:0,buffered:0,paused:true},'off-screen card loaded data');
  }else{
    assert.deepEqual(mediaRequests.map(u=>u.split('/').pop()),['card1.mp4'],'the second video was fetched before its card');
  }
  assert.deepEqual(await dotsActive(page),[0,0,0]);
  await context.close();
 }
 // Dots follow scroll; arrow keys move between cards like a swipe.
 {
  const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
  await goCard(page,1);
  assert.deepEqual(await dotsActive(page),[1,1,1]);
  assert.equal(await page.locator('#onboard-status').textContent(),'2 / 3 · 단어장 학습');
  await page.waitForFunction(()=>{const v=document.querySelectorAll('#onboarding .onboard-card video')[1];return v.readyState>=2&&!v.paused;});
  assert.equal((await videoState(page))[0].paused,true,'leaving a card pauses it');
  await page.keyboard.press('ArrowRight');
  await waitDots(page,2);
  await page.keyboard.press('ArrowLeft');
  await waitDots(page,1);
  const box=await page.locator('#onboard-wrap').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.wheel(600,0);
  await waitDots(page,2);
  await context.close();
 }
 // Card 3 fan: five covers at rest, graded sizes, tap-to-centre follows meta.
 {
  const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
  await goCard(page,2);
  await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");
  const fan=await page.evaluate(()=>{
   const card=document.querySelector('.onboard-card[data-card="2"]'),cr=card.getBoundingClientRect();
   const visible=[...document.querySelectorAll('#onboard-fan img')].filter(img=>{
    const r=img.getBoundingClientRect(),s=getComputedStyle(img.parentElement);
    return s.visibility!=='hidden'&&Number(s.opacity)>0&&r.width>0&&r.left>=cr.left-1&&r.right<=cr.right+1;
   }).sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
   return {count:visible.length,widths:visible.map(img=>Math.round(img.getBoundingClientRect().width)),titles:visible.map(img=>img.alt)};
  });
  assert.equal(fan.count,5,'five covers at rest');
  assert.ok(fan.widths[2]>fan.widths[1]&&fan.widths[1]>fan.widths[0]&&fan.widths[2]>fan.widths[3]&&fan.widths[3]>fan.widths[4],'covers grade 1 / 0.82 / 0.66 from the centre');
  assert.equal(await page.locator('#onboard-book-title').textContent(),"Alice's Adventures in Wonderland");
  assert.equal(await page.locator('#onboard-book-author').textContent(),'Lewis Carroll');
  assert.equal(await page.locator('#onboard-read').textContent(),'앨리스 바로 읽기');
  const sliver=await page.evaluate(()=>{
   const card=document.querySelector('.onboard-card[data-card="2"]'),cr=card.getBoundingClientRect();
   const visible=[...document.querySelectorAll('#onboard-fan img')].filter(img=>{
    const r=img.getBoundingClientRect(),s=getComputedStyle(img.parentElement);
    return s.visibility!=='hidden'&&Number(s.opacity)>0&&r.width>0&&r.left>=cr.left-1&&r.right<=cr.right+1;
   }).sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
   const r=visible[3].getBoundingClientRect();
   return {x:r.right-4,y:r.top+r.height/2};
  });
  await page.mouse.click(sliver.x,sliver.y);
  await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent==='The Adventure of the Speckled Band');
  assert.equal(await page.locator('#onboard-read').textContent(),'얼룩무늬 띠 바로 읽기');
  await context.close();
 }
 // Read opens the centred book in the Reader; Skip/Browse/Escape paths.
 {
  const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
  await goCard(page,2);
  await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");
  await page.locator('#onboard-read').click();
  await page.waitForFunction(()=>!onboardingSession);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>books.length),1);
  assert.equal(await page.evaluate(()=>books[0].longReadId),'alice-in-wonderland');
  assert.equal(await page.evaluate(()=>activeAppView()),'read');
  await page.reload();await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  await context.close();
 }
 {
  const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#onboard-skip').click();
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>books.length),0,'skip created a book');
  await page.reload();await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  await page.locator('#nav-settings').click();
  await page.getByRole('button',{name:'튜토리얼 다시보기'}).click();
  await page.locator('#onboarding').waitFor({state:'visible'});
  assert.equal(await cardIndex(page),0,'replay starts on the first card');
  await goCard(page,2);
  await page.locator('#onboard-browse').click();
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>activeAppView()),'home');
  await page.evaluate(()=>{localStorage.removeItem(ONBOARD_KEY);startOnboarding(false);});
  await page.locator('#onboarding').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done','Escape recorded completion');
  await page.evaluate(()=>startOnboarding(true));
  await page.locator('#onboarding').waitFor({state:'visible'});
  assert.equal(await cardIndex(page),0);
  await page.keyboard.press('Escape');
  await context.close();
 }
 // File choice shares the production importer. Cancel/failure stay retryable;
 // a successful durable import alone records completion.
 {
  const {context,page}=await setup({reducedMotion:'reduce'});await page.goto(url);await page.evaluate(()=>homeReady);
  await goCard(page,2);
  const before=await dataSnapshot(page);
  const chooser=page.waitForEvent('filechooser');await page.locator('#onboard-file').click();await chooser;
  await page.locator('#onboard-fileinput').dispatchEvent('cancel');
  assert.equal(await dataSnapshot(page),before,'picker cancel mutated data');
  assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.locator('#onboarding').isVisible(),true);
  await page.locator('#onboard-fileinput').setInputFiles({name:'Broken.epub',mimeType:'application/epub+zip',buffer:Buffer.from('invalid archive')});
  await page.waitForFunction(()=>!document.getElementById('onboard-file').disabled);
  await page.waitForFunction(()=>document.getElementById('onboard-choice-note').textContent.includes('다시 골라주세요'));
  assert.equal(await dataSnapshot(page),before,'failed import mutated data');
  assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await page.locator('#onboard-fileinput').setInputFiles({name:'First Book.txt',mimeType:'text/plain',buffer:Buffer.from('A first book.\n\nReading should feel easy.')});
  await page.waitForFunction(()=>!onboardingSession);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>books.filter(b=>b.title==='First Book').length),1);
  await page.reload();await page.evaluate(()=>homeReady);
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  assert.equal(await page.evaluate(()=>books.filter(b=>b.title==='First Book').length),1,'book was not durable');
  await context.close();
 }
 // Interrupt a real import before preparation/commit and release its stale result.
 for(const action of ['skip','escape','navigation','replay']){
  const {context,page}=await setup({reducedMotion:'reduce'});await page.goto(url);await page.evaluate(()=>homeReady);
  await goCard(page,2);
  await page.evaluate(()=>{
   const prepare=prepareImportedFile;
   prepareImportedFile=async(...args)=>{await new Promise(resolve=>Reflect.set(window,'qaImportRelease',resolve));return prepare(...args);};
  });
  await page.locator('#onboard-fileinput').setInputFiles({name:'Interrupted.txt',mimeType:'text/plain',buffer:Buffer.from('This import must be cancelled.')});
  await page.waitForFunction(()=>typeof Reflect.get(window,'qaImportRelease')==='function');
  assert.equal(await page.locator('#onboard-file').isDisabled(),true);
  if(action==='skip')await page.locator('#onboard-skip').click();
  if(action==='escape')await page.keyboard.press('Escape');
  if(action==='navigation')await page.evaluate(()=>show('longform'));
  if(action==='replay')await page.evaluate(()=>startOnboarding(true));
  await page.evaluate(()=>Reflect.get(window,'qaImportRelease')());await wait(150);
  assert.equal(await page.evaluate(()=>books.length),0,'stale import committed after '+action);
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')==='done'),action==='skip','stale result changed completion after '+action);
  if(action==='replay')assert.equal(await cardIndex(page),0,'replay did not restart on the first card');
  else assert.equal(await page.locator('#onboarding').isVisible(),false);
  await context.close();
 }
 // Existing Reader survives replay, including scroll, appearance and data.
 {
  const {context,page}=await setup();await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#fileinput').setInputFiles({name:'Existing Reading.txt',mimeType:'text/plain',buffer:Buffer.from('Reading should feel easy.\n\n'.repeat(60))});
  await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));await page.evaluate(()=>openBook(books.find(b=>b.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
  await page.evaluate(()=>{readerScroller().scrollTop=100;});
  await page.waitForFunction(()=>positions[curBook.id]&&positions[curBook.id].y===100);
  const before=await dataSnapshot(page),scroll=await page.evaluate(()=>readerScrollTop());
  await page.evaluate(()=>startOnboarding(true));await goCard(page,2);await page.locator('#onboard-skip').click();
  assert.equal(await page.evaluate(()=>activeAppView()),'read');assert.equal(await dataSnapshot(page),before);assert.equal(await page.evaluate(()=>readerScrollTop()),scroll);
  assert.equal(await page.locator('#v-read').getAttribute('inert'),null);
  await page.locator('#rtext .w').first().tap();await page.waitForFunction(()=>wordLookupOpen());
  await page.evaluate(()=>startOnboarding(true));await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>wordLookupOpen()),true,'guide Escape closed the existing Reader lookup');
  await page.evaluate(()=>closePanel());
  await page.evaluate(()=>{startOnboarding(true);show('home');});
  await page.waitForFunction(()=>!onboardingSession);assert.equal(await page.locator('#v-home').getAttribute('inert'),null);
  await context.close();
 }
 // Viewing alone changes nothing; interrupted runs reopen on the first card.
 {
  const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
  const before=await dataSnapshot(page);
  await goCard(page,2);await page.keyboard.press('Escape');
  assert.equal(await dataSnapshot(page),before,'guide mutated app data/preferences/history');
  assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await page.evaluate(()=>startOnboarding(false));
  assert.equal(await cardIndex(page),0);
  await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:{breeze:true,view:'home'}})));
  assert.equal(await page.locator('#onboarding').isVisible(),false);assert.notEqual(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  await context.close();
 }
 // Reduced motion: videos stay paused and fetch nothing; the fan still works.
 {
  const {context,page}=await setup({reducedMotion:'reduce'});
  const mediaRequests=[];page.on('request',r=>{if(/\.mp4/.test(r.url()))mediaRequests.push(r.url());});
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#onboarding').waitFor({state:'visible'});
  assert.deepEqual(await videoState(page).then(s=>s.map(v=>v.paused)),[true,true]);
  if(process.env.BROWSER==='webkit'){
    // WebKit's <source> probe (see above) still fires; nothing may be loaded.
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#onboarding .onboard-card video')].map(v=>({ready:v.readyState,buffered:v.buffered.length}))),[{ready:0,buffered:0},{ready:0,buffered:0}],'reduced motion loaded video data');
  }else{
    assert.deepEqual(mediaRequests,[],'reduced motion fetched video');
  }
  // The still is a poster frame extracted from each video, swapped at the
  // same 768px breakpoint as the <source> switch; no video is fetched.
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#onboarding .onboard-card video')].map(v=>v.getAttribute('poster').split('/').pop())),
    ['card1.jpg','card2.jpg'],'poster is the tall render at phone width');
  await goCard(page,2);
  await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");
  assert.equal(await page.locator('#onboard-book-title').textContent(),"Alice's Adventures in Wonderland");
  await context.close();
 }
 // Visibility interruption pauses and resumes the visible video.
 {
  const {context,page}=await setup();await page.addInitScript(()=>{window.qaHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.qaHidden});});
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.waitForFunction(()=>{const v=document.querySelectorAll('#onboarding .onboard-card video')[0];return v.readyState>=2&&!v.paused;});
  await page.evaluate(()=>{qaHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.locator('#onboarding .onboard-card video').first().evaluate(v=>v.paused),true);
  await page.evaluate(()=>{qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.querySelectorAll('#onboarding .onboard-card video')[0].paused);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.locator('#onboarding .onboard-card video').first().evaluate(v=>v.paused),true);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await page.waitForFunction(()=>!document.querySelectorAll('#onboarding .onboard-card video')[0].paused);
  await context.close();
 }
 // iOS Low Power Mode rejects play() until the first touch. Card 1 stays
 // paused with no gesture, then currentTime advances after that touch.
 {
  const {context,page}=await setup({iphone:true});
  await page.addInitScript(()=>{
    const orig=HTMLMediaElement.prototype.play;
    let gesture=false;
    const arm=()=>{gesture=true;};
    document.addEventListener('pointerdown',arm,{capture:true});
    document.addEventListener('touchstart',arm,{capture:true});
    HTMLMediaElement.prototype.play=function(){
      if(!gesture)return Promise.reject(new DOMException('Low Power Mode','NotAllowedError'));
      return orig.apply(this, arguments);
    };
    // The autoplay attribute starts playback without calling play(). Low Power
    // Mode blocks that path too, so a gesture-less start is paused again.
    document.addEventListener('play',event=>{
      if(!gesture&&event.target instanceof HTMLMediaElement)event.target.pause();
    },true);
  });
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#onboarding').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#onboarding .onboard-card video').dataset.onboardRejected==='1');
  const before=await page.evaluate(()=>{const v=document.querySelector('#onboarding .onboard-card video');return {t:v.currentTime,paused:v.paused};});
  await wait(300);
  const after=await page.evaluate(()=>{const v=document.querySelector('#onboarding .onboard-card video');return {t:v.currentTime,paused:v.paused};});
  assert.equal(after.paused,true,'card 1 played before a gesture');
  assert.ok(after.t-before.t<0.05,'card 1 advanced before a gesture '+JSON.stringify({before,after}));
  await page.evaluate(()=>{
    const video=document.querySelector('#onboarding .onboard-card video');
    video.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',button:0,clientX:30,clientY:120}));
  });
  await page.waitForFunction(()=>{const v=document.querySelector('#onboarding .onboard-card video');return !v.paused&&v.currentTime>0.04;});
  await context.close();
 }
 // Card 1 still advances when play() rejects: tap and swipe-up, no video event.
 {
  const {context,page}=await setup();
  await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('blocked','NotAllowedError'));};});
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#onboarding').waitFor({state:'visible'});
  await page.evaluate(()=>{
    const video=document.querySelector('.onboard-card[data-card="0"] video');
    const r=video.getBoundingClientRect();
    const x=r.left+r.width/2,y=r.top+r.height*0.55;
    const fire=(type,py)=>video.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',button:0,clientX:x,clientY:py}));
    fire('pointerdown',y);fire('pointermove',y-90);fire('pointerup',y-180);
  });
  await waitDots(page,1);
  await page.locator('.onboard-card[data-card="1"] .t1').click();
  await waitDots(page,2);
  assert.equal(await cardIndex(page),2,'tap reaches the book card without a playing video');
  await context.close();
 }
 // Layout and fallback at phone/tablet/desktop/short sizes, both themes.
 // The dialog surface stays light in dark mode.
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
  const {context,page}=await setup({viewport:{width,height},reducedMotion:'reduce'});await page.goto(url);await page.evaluate(()=>homeReady);
  await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('onboarding')).backgroundColor),'rgb(242, 242, 247)','dialog surface must stay light in dark mode');
  const phone=width<768;
  const surface=await page.evaluate(()=>{
    const card=document.querySelector('.onboard-card');
    const s=getComputedStyle(card),r=card.getBoundingClientRect();
    return {bg:s.backgroundColor,radius:s.borderRadius,shadow:s.boxShadow,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};
  });
  if(phone){
    assert.equal(surface.bg,'rgb(242, 242, 247)','phone screen matches the Home background');
    assert.equal(surface.radius,'0px','phone has no rounded card');
    assert.equal(surface.shadow,'none','phone has no card shadow');
    assert.ok(surface.left<=1&&surface.top<=1&&surface.right>=width-1&&surface.bottom>=height-1,'phone is not edge to edge '+JSON.stringify(surface));
  }else{
    assert.equal(surface.bg,'rgb(255, 255, 255)','tablet and desktop keep the white card');
    assert.ok(surface.radius.startsWith('24px'),'desktop card radius '+surface.radius);
    assert.ok(surface.left>12,'desktop card should stay inset '+JSON.stringify(surface));
  }
  assert.equal(await page.evaluate(()=>document.getElementById('onboarding').scrollWidth>innerWidth),false,'horizontal overflow');
  const skipBox=await page.locator('#onboard-skip').boundingBox();
  assert.ok(skipBox.width>=44&&skipBox.height>=44,'skip touch target');
  assert.ok(skipBox.x>=0&&skipBox.x+skipBox.width<=width&&skipBox.y>=0&&skipBox.y+skipBox.height<=height,'skip outside viewport');
  const fit=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('.onboard-card')].map(node=>node.getBoundingClientRect());
    const skip=document.getElementById('onboard-skip').getBoundingClientRect();
    const card=cards[0],stage=document.querySelector('.onboard-stage'),root=document.getElementById('onboarding');
    document.scrollingElement.scrollTop=400;
    return {
      tops:cards.map(r=>Math.round(r.top)),heights:cards.map(r=>Math.round(r.height)),
      skipTop:Math.round(skip.top-card.top),skipRight:Math.round(card.right-skip.right),
      skipInCard:skip.left>=card.left-0.5&&skip.right<=card.right+0.5&&skip.top>=card.top-0.5&&skip.bottom<=card.bottom+0.5,
      cardInView:card.top>=-1&&card.bottom<=innerHeight+1,
      stageScroll:stage.scrollHeight<=stage.clientHeight+1,
      rootScroll:root.scrollHeight<=root.clientHeight+1,
      docLocked:document.scrollingElement.scrollTop===0,
    };
  });
  assert.ok(Math.max(...fit.heights)-Math.min(...fit.heights)<=1,'cards share a height '+JSON.stringify(fit));
  assert.ok(Math.max(...fit.tops)-Math.min(...fit.tops)<=1,'cards share a vertical position '+JSON.stringify(fit));
  assert.ok(fit.skipInCard&&fit.skipTop>=14&&fit.skipTop<=22&&fit.skipRight>=14&&fit.skipRight<=22,'skip inset '+JSON.stringify(fit));
  assert.ok(fit.cardInView&&fit.stageScroll&&fit.rootScroll&&fit.docLocked,'onboarding scrolls '+JSON.stringify(fit));
  await page.screenshot({path:resolve(out,`${width}-${height}-${dark?'dark':'light'}-card1.png`)});
  await goCard(page,1);
  // Reduced motion never plays, so check the selected <source> structurally:
  // the wide render is selected exactly at/above 768px, without fetching.
  assert.equal(await page.evaluate(()=>{
   const v=document.querySelectorAll('#onboarding .onboard-card video')[1];
   const sources=[...v.querySelectorAll('source')];
   const wide=sources.find(s=>s.media==='(min-width: 768px)');
   const chosen=matchMedia('(min-width: 768px)').matches?wide:sources[sources.length-1];
   return chosen.src.split('/').pop();
  }),width>=768?'card2-wide.mp4':'card2.mp4','video render follows viewport width');
  await page.screenshot({path:resolve(out,`${width}-${height}-${dark?'dark':'light'}-card2.png`)});
  await goCard(page,2);
  await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");
  const skipOnCard3=await page.evaluate(()=>{
    const wrap=document.getElementById('onboard-wrap').getBoundingClientRect();
    const card=[...document.querySelectorAll('.onboard-card')].map(node=>node.getBoundingClientRect()).find(rect=>Math.abs(rect.left-wrap.left)<2);
    const skip=document.getElementById('onboard-skip').getBoundingClientRect();
    return {top:Math.round(skip.top-card.top),right:Math.round(card.right-skip.right),in:skip.top>=card.top&&skip.right<=card.right&&skip.bottom<=card.bottom};
  });
  assert.ok(skipOnCard3.in&&skipOnCard3.top>=14&&skipOnCard3.top<=22&&skipOnCard3.right>=14&&skipOnCard3.right<=22,'skip on card 3 '+JSON.stringify(skipOnCard3));
  for(const id of ['onboard-read','onboard-file','onboard-browse']){
   const box=await page.locator('#'+id).boundingBox();assert.ok(box.width>=44&&box.height>=44,id+' touch target');
   assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height,JSON.stringify({id,width,height,box})+' outside viewport');
  }
  await page.screenshot({path:resolve(out,`${width}-${height}-${dark?'dark':'light'}-card3.png`)});
  receipts.push({width,height,dark});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,'test-receipt.json'),JSON.stringify(receipts,null,2));
 console.log('Carousel onboarding verified: cards/dots/copy, swipe and arrow keys, cover fan, read/file/browse/skip/Escape, import interruption, Reader isolation, reduced motion, visibility, responsive light/dark layouts.');
}catch(error){
 writeFileSync(resolve(out,'carousel-failure.json'),JSON.stringify({error:String(error),stack:error.stack},null,2));throw error;
}finally{await browser.close();server.close();}
