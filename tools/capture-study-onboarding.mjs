/* Fresh production learning UI, isolated authored demo data, no lookup requests.
   Stepped 60fps rendering: a controlled JS clock advances the real study UI by
   1/60s per frame (the same method as capture-onboarding-60fps.mjs), replacing
   the old real-time 30fps screen recording. One newly rendered PNG per frame. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from '../tests/helpers/study-sets-browser-fixture.mjs';
const out=resolve(process.env.BREEZE_STUDY_MEDIA_PROOF||'/tmp/breeze-study-media-60fps');mkdirSync(out,{recursive:true});
const server=await serveStudyFixture(),browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
const receipts=[];
const FRAMES=457; // ≈7.6s at 60fps: front, flip, drag left (repeat), front, flip, drag right (remembered)
try{for(const dark of [false,true]){
 const theme=dark?'dark':'light',context=await browser.newContext({viewport:{width:390,height:640},deviceScaleFactor:2,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await prepareStudyPage(page,server.url);
 await page.evaluate(async d=>{darkMode=d;applyDark();words={observe:{word:'observe',ko:'관찰하다',example:'Take a moment to observe the breeze.',clickedIndex:4,book:'예제',addedAt:1,status:1},breeze:{word:'breeze',ko:'산들바람',example:'A gentle breeze moves the leaves.',clickedIndex:2,book:'예제',addedAt:2,status:1}};saveWords();show('vocab');await openVocabularyReview();},dark);
 await page.evaluate(()=>document.fonts.ready);await page.mouse.click(380,80);await page.waitForTimeout(250);
 assert.equal(await page.locator('#review-expression').innerText(),'observe');
 const card=await page.locator('#review-flip').boundingBox();assert.ok(card,'review card missing');
 const cx=card.x+card.width/2,cy=card.y+card.height/2;
 await page.addStyleTag({content:'#qa-demo-touch{position:fixed;z-index:999;pointer-events:none;width:28px;height:28px;border:2px solid rgba(85,135,175,.8);border-radius:50%;background:rgba(105,155,185,.15);transform:translate(-50%,-50%);opacity:0}'});
 await page.evaluate(()=>{const n=document.createElement('div');n.id='qa-demo-touch';document.body.append(n);});
 // Controlled clock, paused at real now so Date.now() guards stay consistent
 // with the timestamps the setup phase just recorded.
 await page.clock.install({time:new Date()});await page.clock.pauseAt(new Date());
 await page.evaluate(()=>{window.captureTime=0;window.captureAnimations=new Map();
  const original=Element.prototype.animate;Element.prototype.animate=function(...args){const a=original.apply(this,args);a.pause();a.currentTime=0;captureAnimations.set(a,{start:captureTime,finished:false});return a;};
  for(const a of document.getAnimations()){const d=a.effect.getComputedTiming().endTime;if(Number.isFinite(d))a.finish();else{a.pause();a.currentTime=0;captureAnimations.set(a,{start:0,finished:false});}}
 });
 const stepAnimations=t=>page.evaluate(t=>{
  for(const a of document.getAnimations())if(!captureAnimations.has(a)){a.pause();a.currentTime=0;captureAnimations.set(a,{start:t,finished:false});}
  for(const [a,info] of captureAnimations){if(info.finished)continue;if(a.playState==='idle'){info.finished=true;continue;}const duration=a.effect.getComputedTiming().endTime,elapsed=t-info.start;
   if(elapsed>=duration){a.finish();info.finished=true;}else a.currentTime=elapsed;}
 },t);
 const setTouch=(x,y,visible)=>page.evaluate(({x,y,visible})=>{const n=document.getElementById('qa-demo-touch');n.style.left=x+'px';n.style.top=y+'px';n.style.opacity=visible?'1':'0';},{x,y,visible});
 const framesDir=resolve(out,`study-${theme}-frames`);mkdirSync(framesDir,{recursive:true});
 for(let n=0;n<FRAMES;n++){
  const t=n*1000/60;if(n)await page.clock.runFor(Math.round(t)-Math.round((n-1)*1000/60));await page.evaluate(t=>window.captureTime=t,t);
  // Scripted gestures on the virtual timeline.
  if(n===72||n===271){await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.up();}
  if(n===166){await page.mouse.move(cx,cy);await page.mouse.down();}
  if(n>=167&&n<=184)await page.mouse.move(cx-140*(n-166)/18,cy);
  if(n===185)await page.mouse.up();
  if(n===365){await page.mouse.move(cx,cy);await page.mouse.down();}
  if(n>=366&&n<=383)await page.mouse.move(cx+140*(n-365)/18,cy);
  if(n===384)await page.mouse.up();
  // Touch circle: visible around taps and while dragging.
  const touchX=(n>=167&&n<=185)?cx-140*Math.min(1,(n-166)/18):(n>=366&&n<=384)?cx+140*Math.min(1,(n-365)/18):cx;
  const touchVisible=(n>=68&&n<=90)||(n>=166&&n<=190)||(n>=267&&n<=289)||(n>=365&&n<=389);
  await setTouch(touchX,cy,touchVisible);
  await stepAnimations(t);
  if(n===230){assert.equal(await page.locator('#review-expression').innerText(),'breeze','second card did not arrive');assert.equal(await page.locator('#review-progress').innerText(),'0 / 2','left drag did not grade repeat');}
  if(n===430)assert.equal(await page.locator('#review-progress').innerText(),'1 / 2','right drag did not grade remembered');
  const file=resolve(framesDir,String(n).padStart(5,'0')+'.png');
  await page.screenshot({path:file});
  if(n===0)await page.screenshot({path:resolve(`assets/onboarding/study-${theme}.jpg`),type:'jpeg',quality:95});
 }
 assert.deepEqual(errors,[]);
 const target=resolve(`assets/onboarding/study-${theme}.mp4`);
 const encode=spawnSync('ffmpeg',['-y','-loglevel','error','-framerate','60','-i',resolve(framesDir,'%05d.png'),'-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-crf','20','-g','60','-keyint_min','60','-sc_threshold','0','-movflags','+faststart',target],{encoding:'utf8'});
 assert.equal(encode.status,0,encode.stderr);
 if(!process.env.BREEZE_KEEP_FRAMES)rmSync(framesDir,{recursive:true,force:true});
 receipts.push({theme,engine:'Chromium',viewport:{width:390,height:640},deviceScaleFactor:2,fps:60,frameCount:FRAMES,source:'fresh production UI with isolated authored words and saved examples',steps:['front','tap reveal','left repeat 0/2','tap reveal','right remember 1/2'],externalLookupRequests:0,errors});
 await context.close();console.log('Captured study-'+theme,'780x1280',FRAMES,'frames at 60fps');
}}
finally{await browser.close();await server.close();}
writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipts,null,2)+'\n');console.log('Created light/dark study clips at 60fps from stepped production UI.');
