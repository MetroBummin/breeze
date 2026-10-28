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
// Every cover in view, centre and peeking, keeps the art's 2:3 shape. The
// images are scaled uniformly, so the on-screen rect ratio is the box ratio.
const coverShapes=page=>page.evaluate(()=>{
  const card=document.querySelector('.onboard-card[data-card="2"]').getBoundingClientRect();
  return [...document.querySelectorAll('#onboard-fan img')].filter(img=>{
    const r=img.getBoundingClientRect(),s=getComputedStyle(img.parentElement);
    return s.visibility!=='hidden'&&Number(s.opacity)>0&&r.width>0&&r.right>card.left&&r.left<card.right;
  }).map(img=>{const r=img.getBoundingClientRect();return {alt:img.alt,w:Math.round(r.width),h:Math.round(r.height),ratio:+(r.width/r.height).toFixed(3)};});
});
// Geometry of the strip, printed when the count is wrong.
const fanState=page=>page.evaluate(()=>{
  const fan=document.getElementById('onboard-fan'),box=fan.getBoundingClientRect();
  const centre=box.left+fan.clientLeft+fan.clientWidth/2;
  return {fan:[fan.clientWidth,fan.clientHeight,fan.scrollLeft],vars:fan.style.cssText,
    slots:[...fan.children].map(el=>{const r=el.getBoundingClientRect();return [+(r.left+r.width/2-centre).toFixed(2),+r.width.toFixed(2),el.style.visibility||'v',el.style.opacity];}).filter(x=>x[2]!=='hidden')};
});
// Covers decode asynchronously; screenshots wait for the ones in view.
const decodeCovers=page=>page.evaluate(()=>Promise.all([...document.querySelectorAll('#onboard-fan img')].filter(img=>getComputedStyle(img.parentElement).visibility!=='hidden').map(img=>img.decode().catch(()=>{}))));
// Five covers at rest: every tested size has room for the outer pair.
const assertCoverShapes=async(page,label)=>{
  const shapes=await coverShapes(page);
  if(shapes.length!==5)assert.fail(label+' covers at rest are not five '+JSON.stringify({shapes,state:await fanState(page)}));
  for(const s of shapes)assert.ok(Math.abs(s.ratio-2/3)<0.02,label+' cover is not 2:3 '+JSON.stringify(s));
  return shapes;
};
const waitDots=(page,index)=>page.waitForFunction(index=>[...document.querySelectorAll('#onboarding .onboard-dots')].every(d=>[...d.children].findIndex(el=>el.classList.contains('on'))===index),index);
const dotsActive=page=>page.evaluate(()=>[...document.querySelectorAll('#onboarding .onboard-dots')].map(d=>[...d.children].findIndex(el=>el.classList.contains('on'))));
// Cards 1 and 2 are animated WebP <img> elements; no video, no playback code.
const mediaState=page=>page.evaluate(()=>[...document.querySelectorAll('#onboarding .onboard-card .onboard-media')].map(img=>({src:img.currentSrc.split('/').pop(),loaded:img.complete&&img.naturalWidth>0,w:img.naturalWidth,h:img.naturalHeight})));
const waitMedia=(page,index)=>page.waitForFunction(index=>{const img=document.querySelectorAll('#onboarding .onboard-card .onboard-media')[index];return img.complete&&img.naturalWidth>0;},index);
// The files themselves: animated, infinite loop, 60fps, same size as the
// former 60fps clips (9:16 1080x1920 on phones, 4:3 1440x1080 wide).
function webpAnimation(file){
  const b=readFileSync(resolve(root,'assets/onboarding-carousel',file));
  assert.equal(b.toString('ascii',0,4)+b.toString('ascii',8,12),'RIFFWEBP',file+' is not WebP');
  let loop=null,width=0,height=0;const durations=[];
  for(let o=12;o+8<=b.length;){
    const id=b.toString('ascii',o,o+4),size=b.readUInt32LE(o+4),d=o+8;
    if(id==='VP8X'){width=1+b.readUIntLE(d+4,3);height=1+b.readUIntLE(d+7,3);}
    if(id==='ANIM')loop=b.readUInt16LE(d+4);
    if(id==='ANMF')durations.push(b.readUIntLE(d+12,3));
    o=d+size+(size&1);
  }
  // The encoder merges identical consecutive frames into one longer frame,
  // so playback is 60fps where anything moves. Every frame boundary must
  // still land on the 60fps grid (whole milliseconds, so within 1ms).
  let t=0,offGrid=0;
  for(const x of durations){t+=x;offGrid=Math.max(offGrid,Math.abs(t-Math.round(t*60/1000)*1000/60));}
  return {width,height,loop,frames:durations.length,ms:t,minFrame:Math.min(...durations),offGrid:+offGrid.toFixed(2)};
}
// Durations of the former 60fps H264 masters (450, 451, 510, 538 frames).
for(const [file,w,h,ms] of [['card1.webp',1080,1920,7500],['card2.webp',1080,1920,8500],['card1-wide.webp',1440,1080,7517],['card2-wide.webp',1440,1080,8967]]){
  const a=webpAnimation(file);
  console.log(file,JSON.stringify(a));
  assert.deepEqual([a.width,a.height],[w,h],file+' size');
  assert.equal(a.loop,0,file+' must loop forever');
  assert.ok(a.frames>60,file+' is not animated');
  assert.ok(a.minFrame>=16&&a.minFrame<=17&&a.offGrid<=1&&Math.abs(a.ms-ms)<=17,file+' is not 60fps '+JSON.stringify(a));
}
try{
 // Structure, copy, dots, media switching.
 // WebKit uses the iPhone 13 profile (390 CSS px, mobile Safari UA).
 {
  const {context,page}=await setup({iphone:true});
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
  assert.equal(await page.locator('#onboarding video').count(),0,'onboarding has no video');
  assert.equal(await page.locator('#onboarding .onboard-card .onboard-media').count(),2);
  await waitMedia(page,0);
  assert.deepEqual((await mediaState(page))[0],{src:'card1.webp',loaded:true,w:1080,h:1920},'phone shows the 9:16 animation');
  assert.deepEqual(await dotsActive(page),[0,0,0]);
  // Review evidence at iPhone size (iPhone 13 profile on WebKit): card 2
  // animating after the swipe, and the card 3 cover fan.
  await goCard(page,1);
  await waitMedia(page,1);
  assert.equal((await mediaState(page))[1].src,'card2.webp');
  await wait(300);
  await page.screenshot({path:resolve(out,`iphone-${process.env.BROWSER||'chromium'}-card2-playing.png`)});
  await goCard(page,2);
  await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");
  await wait(400);
  // The three cards are one box size (CSS and visual viewport), including
  // on the iPhone profile, so card 3 cannot sit shorter or taller.
  const cardHeights=await page.evaluate(()=>[...document.querySelectorAll('.onboard-card')].map(c=>+c.getBoundingClientRect().height.toFixed(2)));
  console.log('iphone card heights',JSON.stringify(cardHeights));
  assert.equal(new Set(cardHeights).size,1,'onboarding cards differ in height '+JSON.stringify(cardHeights));
  const iphoneCovers=await assertCoverShapes(page,'iPhone');
  console.log('iphone card 3 covers',JSON.stringify(iphoneCovers));
  await decodeCovers(page);
  // The test jumps to card 3 instantly; give async cover decode time to paint.
  await wait(1500);
  await page.screenshot({path:resolve(out,`iphone-${process.env.BROWSER||'chromium'}-card3.png`)});
  await context.close();
 }
 // Dots follow scroll; arrow keys move between cards like a swipe.
 {
  const {context,page}=await setup();await page.goto(url);await page.evaluate(()=>homeReady);
  await goCard(page,1);
  assert.deepEqual(await dotsActive(page),[1,1,1]);
  assert.equal(await page.locator('#onboard-status').textContent(),'2 / 3 · 단어장 학습');
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
 // Reduced motion: the <picture> picks the still JPEG; no animation is
 // fetched, and the fan still works.
 {
  const {context,page}=await setup({reducedMotion:'reduce'});
  const mediaRequests=[];page.on('request',r=>{if(/onboarding-carousel\/.*\.webp/.test(r.url()))mediaRequests.push(r.url());});
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#onboarding').waitFor({state:'visible'});
  await waitMedia(page,0);
  assert.equal((await mediaState(page))[0].src,'card1.jpg','reduced motion shows the still at phone width');
  await goCard(page,1);
  await waitMedia(page,1);
  assert.equal((await mediaState(page))[1].src,'card2.jpg','reduced motion shows the still at phone width');
  assert.deepEqual(mediaRequests,[],'reduced motion fetched an animation');
  await goCard(page,2);
  await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");
  assert.equal(await page.locator('#onboard-book-title').textContent(),"Alice's Adventures in Wonderland");
  await context.close();
 }
 // A tap or a swipe up on card 1's animation advances.
 {
  const {context,page}=await setup();
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.locator('#onboarding').waitFor({state:'visible'});
  await page.evaluate(()=>{
    const media=document.querySelector('.onboard-card[data-card="0"] .onboard-media');
    const r=media.getBoundingClientRect();
    const x=r.left+r.width/2,y=r.top+r.height*0.55;
    const fire=(type,py)=>media.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',button:0,clientX:x,clientY:py}));
    fire('pointerdown',y);fire('pointermove',y-90);fire('pointerup',y-180);
  });
  await waitDots(page,1);
  await page.locator('.onboard-card[data-card="1"] .t1').click();
  await waitDots(page,2);
  assert.equal(await cardIndex(page),2,'tap reaches the book card');
  await context.close();
 }
 // Every card is the same box at every size, with the animations loaded
 // (their intrinsic size arrives with the data) and after landing on card 3.
 for(const [width,height] of [[390,844],[768,1024],[1440,900],[1920,1080],[1920,1113],[844,430]]){
  const {context,page}=await setup({viewport:{width,height}});await page.goto(url);await page.evaluate(()=>homeReady);
  await waitMedia(page,0);
  const boxes=()=>page.evaluate(()=>[...document.querySelectorAll('.onboard-card')].map(c=>{const r=c.getBoundingClientRect();
    return {h:+r.height.toFixed(2),top:+r.top.toFixed(2),parts:[...c.children].map(x=>+x.getBoundingClientRect().height.toFixed(1))};}));
  const atOpen=await boxes();
  await goCard(page,1);
  await waitMedia(page,1);
  await goCard(page,2);await wait(300);
  const atBooks=await boxes();
  // Small covers (a short landscape card) once rounded far enough to let a
  // seventh cover in at rest.
  await assertCoverShapes(page,`${width}x${height}`);
  console.log(`card boxes ${width}x${height}`,JSON.stringify({atOpen,atBooks}));
  for(const set of [atOpen,atBooks]){
    assert.ok(set.every(b=>Math.abs(b.h-set[0].h)<0.5&&Math.abs(b.top-set[0].top)<0.5),`onboarding cards differ at ${width}x${height} `+JSON.stringify(set));
  }
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
    assert.equal(surface.bg,'rgb(255, 255, 255)','phone card is the white of the animation frames');
    assert.equal(surface.radius,'0px','phone has no rounded card');
    assert.equal(surface.shadow,'none','phone has no card shadow');
    assert.ok(surface.left<=1&&surface.top<=1&&surface.right>=width-1&&surface.bottom>=height-1,'phone is not edge to edge '+JSON.stringify(surface));
  }else{
    assert.equal(surface.bg,'rgb(255, 255, 255)','tablet and desktop keep the white card');
    assert.ok(surface.radius.startsWith('24px'),'desktop card radius '+surface.radius);
    assert.ok(surface.left>12,'desktop card should stay inset '+JSON.stringify(surface));
  }
  // No seam between the media and the dots/copy under it, in either theme:
  // the media area, the dots and the copy all show the card's own surface,
  // and the frames' bottom edge (the still is a frame) is that same colour.
  const seam=await page.evaluate(async()=>Promise.all([...document.querySelectorAll('.onboard-card .onboard-media')].map(async v=>{
    const card=getComputedStyle(v.closest('.onboard-card')).backgroundColor;
    const own=[v,...v.closest('.onboard-card').querySelectorAll('.onboard-dots,.onboard-copy')].map(n=>getComputedStyle(n).backgroundColor);
    const img=new Image();img.src=v.currentSrc||v.src;await img.decode();
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
    const g=c.getContext('2d');g.drawImage(img,0,0);
    const [r,gr,b]=g.getImageData(c.width>>1,c.height-2,1,1).data;
    return {card,own,frameEdge:`rgb(${r}, ${gr}, ${b})`};
  })));
  for(const s of seam){
    assert.ok(s.own.every(bg=>bg===s.card||bg==='rgba(0, 0, 0, 0)'),'media/copy surface differs from the card '+JSON.stringify(s));
    assert.equal(s.frameEdge,s.card,'media frame edge does not match the card surface '+JSON.stringify(s));
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
  // The still (reduced motion) and the animation follow the same 768px
  // breakpoint in the <picture>.
  await waitMedia(page,1);
  assert.equal((await mediaState(page))[1].src,width>=768?'card2-wide.jpg':'card2.jpg','media render follows viewport width');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.onboard-card[data-card="1"] picture source')].map(s=>[s.media,s.srcset.split('/').pop()])),[
    ['(min-width: 768px) and (prefers-reduced-motion: reduce)','card2-wide.jpg'],['(prefers-reduced-motion: reduce)','card2.jpg'],['(min-width: 768px)','card2-wide.webp']]);
  await page.screenshot({path:resolve(out,`${width}-${height}-${dark?'dark':'light'}-card2.png`)});
  await goCard(page,2);
  await page.waitForFunction(()=>document.getElementById('onboard-book-title').textContent!=="");
  await assertCoverShapes(page,`${width}x${height}`);
  await decodeCovers(page);
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
 console.log('Carousel onboarding verified: cards/dots/copy, swipe and arrow keys, cover fan, read/file/browse/skip/Escape, import interruption, Reader isolation, reduced motion, 60fps looping WebP media, responsive light/dark layouts.');
}catch(error){
 writeFileSync(resolve(out,'carousel-failure.json'),JSON.stringify({error:String(error),stack:error.stack},null,2));throw error;
}finally{await browser.close();server.close();}
