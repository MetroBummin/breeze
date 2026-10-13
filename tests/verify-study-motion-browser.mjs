/* Browser motion evidence. Chromium uses trusted CDP touch; WebKit uses
   synthetic PointerEvents for deterministic lifecycle coverage, not native QA. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=process.env.BREEZE_MOTION_OUTPUT||'/tmp/breeze-motion-proof';mkdirSync(out,{recursive:true});
const server=await serveStudyFixture({uiSource:process.env.BREEZE_MOTION_BASELINE});
const browser=await engine.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
const records=Object.fromEntries(Array.from({length:2399},(_,i)=>['w'+i,{word:'word '+(i%2294),root:'w'+(i%2294),ko:'저장된 뜻 '+i,example:('This is the unchanged saved example for word '+(i%2294)+'. ').repeat(i<8||i>2390?5:1),book:'Saved',status:i%3+1,addedAt:i+1}]));
const evidence=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',recordVideo:{dir:out,size:{width:390,height:844}}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await prepareStudyPage(page,server.url);
 await page.evaluate(async records=>{words=records;saveWords();show('vocab');await openStudySetsDirectory();await studySetsGo('all');},records);
 for(const [size,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,1000],['short',844,390],['narrow',320,640]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
  const metrics=await page.locator('#study-all-words-list .vgroup').first().evaluate(node=>{const b=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {count:document.querySelectorAll('#study-all-words-list .vgroup').length,row:b(node.querySelector('.vrow')),word:b(node.querySelector('.vword')),meaning:b(node.querySelector('.vsenses')),chip:b(node.querySelector('.chip')),ordinal:b(node.querySelector('.vordinal')),editable:!!node.querySelector('[contenteditable],button.chip,.rowdel'),grid:getComputedStyle(node.querySelector('.vrow')).display};});
  const shell=await page.evaluate(()=>{const b=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {header:b(document.querySelector('#v-memory-set .study-sets-header')),start:b(document.getElementById('study-all-words-start')),scroll:window.scrollY,inner:studySetsUI.body.scrollTop,viewport:innerHeight};});
  assert.ok(shell.header.top>=0&&shell.header.bottom<=height);assert.ok(shell.start.top>=shell.header.bottom&&shell.start.bottom<=height,'fixed Start stays visible');assert.equal(shell.scroll,0);
  evidence.push({size,dark,metrics,shell});writeFileSync(`${out}/study-layout.json`,JSON.stringify(evidence,null,2));
  await page.screenshot({path:`${out}/all-words-${size}-${dark?'dark':'light'}.png`});
  assert.equal(await page.locator('#study-all-words-list').getAttribute('data-total'),'2294');assert.ok(metrics.count>0&&metrics.count<100);assert.equal(metrics.grid,'grid');assert.ok(metrics.chip.width<80);assert.ok(Math.abs(metrics.word.y+metrics.word.height/2-metrics.meaning.y-metrics.meaning.height/2)<1);assert.ok(metrics.chip.x>metrics.meaning.x);assert.ok(metrics.ordinal.x<metrics.word.x);assert.equal(metrics.editable,false);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{darkMode=false;applyDark();});
 const cdp=engine===chromium&&process.env.BREEZE_MOTION_SYNTHETIC!=='1'?await context.newCDPSession(page):null;let target=null;
 const input=async(type,x,y)=>{if(cdp)return cdp.send('Input.dispatchTouchEvent',{type:({down:'touchStart',move:'touchMove',up:'touchEnd',cancel:'touchCancel'})[type],touchPoints:['up','cancel'].includes(type)?[]:[{x,y,id:1}]});await page.evaluate(({type,x,y})=>{if(type==='down')window.qaPointerTarget=document.elementFromPoint(x,y);window.qaPointerTarget?.dispatchEvent(new PointerEvent('pointer'+type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y}));},{type,x,y});};
 const gesture=async(locator,points,{cancel=false,hold=0}={})=>{const b=await locator.boundingBox(),x=b.x+b.width*.55,y=Math.min(690,b.y+Math.min(80,b.height*.55));await input('down',x,y);for(const [dx,dy,ms=20]of points){await input('move',x+dx,y+dy);await page.waitForTimeout(ms);}if(hold)await page.waitForTimeout(hold);const last=points.at(-1)||[0,0];await input(cancel?'cancel':'up',x+last[0],y+last[1]);};
 await gesture(page.locator('#study-all-words-list .vgroup').first(),[[-60,0],[-150,0]]);assert.equal(await page.locator('#study-all-words-list').getAttribute('data-total'),'2294');assert.equal(await page.locator('#study-all-words-list .study-sets-row-action').count(),0);
 await page.evaluate(async()=>{const made=BreezeStudySets.create(await loadStudySets(),{name:'Motion',bookTitles:['Saved']},Object.fromEntries(Object.entries(words).slice(0,8)),Date.now());await commitStudySets(made.state);await studySetsGo('detail',made.state.sets[0].id);});
 const optics=await page.evaluate(()=>{const b=document.getElementById('study-sets-back'),e=document.getElementById('study-sets-edit'),shell=e.parentElement;const r=e.getBoundingClientRect(),svg=e.querySelector('svg');return {width:r.width,height:r.height,svg:svg.getBoundingClientRect().width,dots:[...svg.querySelectorAll('circle')].map(n=>parseFloat(getComputedStyle(n).r)*2),backPaint:getComputedStyle(b).background,menuPaint:getComputedStyle(shell).background};});
 assert.equal(optics.width,44);assert.equal(optics.height,44);assert.equal(optics.svg,24);assert.deepEqual(optics.dots,[2.3,2.3,2.3]);assert.equal(optics.backPaint,optics.menuPaint);evidence.push({optics});
 const row=()=>page.locator('#study-sets-word-list .study-sets-word-row').first();
 const state=()=>page.evaluate(async()=>BreezeStudySets.view(await loadStudySets(),studySetsUI.setId));
 await gesture(row(),[[-80,0,15],[-210,0,15],[-140,0,15],[-90,0,15]]);await page.waitForTimeout(450);assert.equal(await page.locator('#study-sets-word-list .study-sets-word-row').count(),8,'late reverse cancels removal');
 // Hold/re-grab an actual spring: first frame stays at its live presentation.
 await gesture(row(),[[-30,0]],{cancel:true});await page.waitForTimeout(30);
 await page.evaluate(()=>window.addEventListener('pointerdown',()=>{window.qaGrabBefore=new DOMMatrix(getComputedStyle(document.querySelector('#study-sets-word-list .study-sets-word-surface')).transform).m41;},{capture:true,once:true}));const rb=await row().boundingBox();await input('down',rb.x+rb.width*.55,rb.y+30);const held=await row().locator('.study-sets-word-surface').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41);await page.waitForTimeout(80);const held2=await row().locator('.study-sets-word-surface').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41);assert.ok(Math.abs(held-await page.evaluate(()=>qaGrabBefore))<.1);assert.ok(Math.abs(held2-held)<.1,'held spring does not drift');await input('cancel',0,0);await page.waitForTimeout(350);
 // Two independent releases while first IDB commit is held must both persist.
 await page.evaluate(()=>{window.qaCommit=commitStudySets;window.qaGate=new Promise(r=>window.qaRelease=r);commitStudySets=async s=>{await qaGate;return qaCommit(s);};});
 await gesture(row(),[[-65,0,12],[-130,0,12],[-225,0,12]]);await gesture(page.locator('#study-sets-word-list .study-sets-word-row').nth(1),[[-65,0,12],[-130,0,12],[-225,0,12]]);
 await page.evaluate(()=>{commitStudySets=qaCommit;qaRelease();});await page.waitForFunction(()=>!studySetsUI.mutating&&studySetsUI.state.sets[0].excludedIds.length===2);
 // Durable exclusion precedes two sequential WAAPI presentations. WebKit can
 // keep either animation pending beyond a wall-clock delay; require completion.
 await page.waitForFunction(()=>document.querySelectorAll('#study-sets-word-list .study-sets-word-row').length===6,null,{timeout:3000});assert.equal(await page.locator('#study-sets-word-list .study-sets-word-row').count(),6);
 await page.evaluate(()=>studySetsStart(studySetsUI.setId));
 for(const mode of ['set','all']){
  if(mode==='all')await page.evaluate(async()=>{closeStudySets(true);show('vocab');await openVocabularyReview();});
  const card=()=>page.locator(mode==='set'?'#study-sets-flashcard':'#review-flip');
  const summary=()=>page.evaluate(async mode=>mode==='set'?(()=>{const v=BreezeStudySets.view(studySetsUI.state,studySetsUI.setId);return {passed:v.completed,token:v.token,word:v.card?.word,revealed:v.revealed};})():{passed:ensureSimpleStudySession().passed.length,token:SimpleStudySession.token(ensureSimpleStudySession()),word:words[ensureSimpleStudySession().queue[0]]?.word,revealed:simpleWordCards.flipped},mode);
  await card().tap();await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);const start=await summary();
  await gesture(card(),[[60,0,15],[150,0,15],[95,0,15],[50,0,15]]);await page.waitForTimeout(450);assert.equal((await summary()).token,start.token,'reverse cannot grade');
  await gesture(card(),[[25,0]],{cancel:true});await page.waitForTimeout(25);const cb=await card().boundingBox();await input('down',195,Math.min(690,cb.y+80));const pos=await card().evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41);await page.waitForTimeout(80);assert.ok(Math.abs(await card().evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41)-pos)<.1);await input('cancel',0,0);await page.waitForTimeout(350);
  await page.evaluate(mode=>{window.qaCommit=mode==='set'?commitStudySets:commitSimpleStudySession;window.qaCommitEntered=false;window.qaGate=new Promise(r=>window.qaRelease=r);const wrapped=async s=>{window.qaCommitEntered=true;await qaGate;return qaCommit(s);};if(mode==='set')commitStudySets=wrapped;else commitSimpleStudySession=wrapped;},mode);
  await gesture(card(),[[-50,0,12],[-100,0,12],[-145,0,12]]);await page.waitForTimeout(260);
  console.log(mode+' pending flight at260ms: '+JSON.stringify(await card().evaluate(n=>({visibility:document.visibilityState,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,animations:n.getAnimations().map(a=>({state:a.playState,pending:a.pending,time:a.currentTime,start:a.startTime,duration:a.effect.getTiming().duration})),transform:getComputedStyle(n).transform}))));
  // Linux WebKit may leave a newly created WAAPI flight pending at time zero
  // across this wall-clock delay. Assert its real completion while the durable
  // commit is still held, rather than treating timer time as animation time.
  await card().evaluate(async n=>{
   const animations=n.getAnimations();if(!animations.length)throw Error('No departing-card animation');
   await Promise.race([Promise.all(animations.map(a=>a.finished)),new Promise((_,reject)=>setTimeout(()=>reject(Error('Departing-card animation did not finish')),3000))]);
  });
  const pending=await card().evaluate(n=>({x:n.getBoundingClientRect().x,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,layoutWidth:n.offsetWidth,layoutHeight:n.offsetHeight,transform:getComputedStyle(n).transform,commitEntered:qaCommitEntered,text:n.textContent,under:document.querySelector('.study-session-next,#simple-next-card')?.textContent}));writeFileSync(`${out}/${mode}-durable-handoff.json`,JSON.stringify(pending,null,2));await page.screenshot({path:`${out}/${mode}-durable-handoff.png`});assert.equal(pending.commitEntered,true,mode+' durable commit entered');assert.ok(pending.x+pending.width<0,mode+' outgoing remains outside center during save: '+JSON.stringify(pending));assert.equal(pending.under,'');
  await page.evaluate(mode=>{if(mode==='set')commitStudySets=qaCommit;else commitSimpleStudySession=qaCommit;qaRelease();},mode);await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);assert.equal((await summary()).passed,start.passed,'again moves tail without progress');assert.notEqual((await summary()).word,start.word);
  assert.equal(await card().evaluate(n=>getComputedStyle(n).transform),'none','new card has no inherited exit or return');await page.screenshot({path:`${out}/${mode}-next-front.png`});
  await card().tap();await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);await gesture(card(),[[45,0,10],[85,0,10]]);await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);assert.equal((await summary()).passed,start.passed+1,'intentional short fast flick accepted');
  await card().tap();await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);const current=await summary();await gesture(card(),[[10,30],[18,90],[30,150]]);await page.waitForTimeout(350);assert.equal((await summary()).token,current.token,'diagonal vertical intent never grades');
  const seen=new Set();
  for(let cycle=0;cycle<3;cycle++){
   if(!(await summary()).revealed){await card().tap();await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);}
   const prior=await summary();assert.equal(seen.has(prior.token),false);seen.add(prior.token);
   await gesture(card(),[[-45,0,10],[-95,0,10],[-140,0,10]]);await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);
   const after=await summary();assert.equal(after.passed,prior.passed);assert.notEqual(after.token,prior.token);assert.equal(after.revealed,false);
  }
  await card().tap();await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);const reducedBefore=await summary();
  await page.emulateMedia({reducedMotion:'reduce'});await card().press('ArrowRight');await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);assert.equal((await summary()).passed,reducedBefore.passed+1);await page.emulateMedia({reducedMotion:'no-preference'});
  // Leave while persistence owns the departing card; its late completion must
  // never paint the old answer into the reopened session.
  await card().tap();await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);
  const leaveBefore=await summary();
  await page.evaluate(mode=>{window.qaCommit=mode==='set'?commitStudySets:commitSimpleStudySession;window.qaCommitEntered=false;window.qaGate=new Promise(r=>window.qaRelease=r);const wrapped=async s=>{window.qaCommitEntered=true;await qaGate;return qaCommit(s);};if(mode==='set')commitStudySets=wrapped;else commitSimpleStudySession=wrapped;},mode);
  await gesture(card(),[[50,0,12],[105,0,12],[150,0,12]]);
  await page.waitForFunction(()=>qaCommitEntered);
  await page.evaluate(mode=>{if(mode==='set'){closeStudySets(true);show('vocab');}else closeVocabularyReview();},mode);
  await page.evaluate(mode=>{if(mode==='set')commitStudySets=qaCommit;else commitSimpleStudySession=qaCommit;qaRelease();},mode);
  await page.waitForTimeout(300);
  await page.evaluate(async mode=>{if(mode==='set')await openStudySets(false,'study',studySetsUI.setId,true);else await openVocabularyReview();},mode);
  await page.waitForFunction(()=>!studySetsUI.mutating&&!simpleStudyBusy);
  assert.equal((await summary()).passed,leaveBefore.passed+1,mode+' reopened durable grade');assert.equal((await summary()).revealed,false);assert.equal(await card().evaluate(n=>getComputedStyle(n).transform),'none');
 }
 // A long card can extend beyond the viewport vertically. At the final 12deg
 // angle its height contributes horizontal width; both exits must clear it.
 const tallExits=await page.evaluate(async()=>{
  const results=[];
  for(const direction of [-1,1]){
   const node=document.createElement('div');node.style.cssText='position:fixed;left:20px;top:90px;width:350px;height:1600px';document.body.append(node);
   const motion=studyCardMotion(node,{ready:()=>true,reveal(){},grade(){}});await motion.exit(direction);
   const r=node.getBoundingClientRect();results.push({direction,left:r.left,right:r.right,viewport:innerWidth});motion.reset();node.remove();
  }
  return results;
 });
 for(const r of tallExits)assert.ok(r.direction<0?r.right<0:r.left>r.viewport,'entire rotated long card exits: '+JSON.stringify(r));evidence.push({tallExits});
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>words),records);
 const videoPath=await page.video().path();await context.close();copyFileSync(videoPath,`${out}/study-${engine.name()}.webm`);
 writeFileSync(`${out}/study-motion.json`,JSON.stringify({engine:engine.name(),input:cdp?'trusted CDP touch':'synthetic PointerEvents',native:false,cases:evidence,checks:'readonly 2294/2399 layout; release reversal; spring re-grab; queued row commits; delayed durable handoff; no underlay text; repeat/progress; flick; vertical ownership; reduced motion'},null,2));
 console.log(`${engine.name()} study motion passed`);
}finally{await browser.close();await server.close();}
