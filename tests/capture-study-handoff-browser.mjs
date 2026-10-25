/* Paired old/current source reproduction. Delay only durable commit; record real
   animation frames without seeking, replacing animation clocks or cloning text. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
const out=process.env.BREEZE_MOTION_OUTPUT||'/tmp/breeze-motion-proof';mkdirSync(out,{recursive:true});
const baseline='f34cef95f4cec5835e60dfc7ca831d7020e75c7f',scratch=mkdtempSync(join(tmpdir(),'breeze-handoff-'));
const oldUI=execFileSync('git',['show',baseline+':scripts/ui/study-sets.js'],{encoding:'utf8'}),oldCSS=execFileSync('git',['show',baseline+':styles/study-sets.css'],{encoding:'utf8'});writeFileSync(join(scratch,'study-sets.js'),oldUI);
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}),report=[];
try{for(const phase of ['before','after']){
 const server=await serveStudyFixture({uiSource:phase==='before'?join(scratch,'study-sets.js'):undefined});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,recordVideo:{dir:out,size:{width:390,height:844}}}),page=await context.newPage();
 try{
 await prepareStudyPage(page,server.url);if(phase==='before'){await page.route('**/styles/study-sets.css*',r=>r.fulfill({contentType:'text/css',body:oldCSS}));await page.reload();await page.evaluate(()=>homeReady);}
 await page.evaluate(async()=>{words={one:{word:'observe',ko:'주의 깊게 관찰하다',example:'We observe the garden in the early morning. Every detail helps us understand how the plants grow through the changing seasons.',book:'Saved',status:1},two:{word:'evidence',ko:'증거',example:'The evidence comes from careful observation.',book:'Saved',status:2},three:{word:'return',ko:'돌아오다',example:'We return to the garden.',book:'Saved',status:3}};show('vocab');const made=BreezeStudySets.create(await loadStudySets(),{name:'Morning notes',bookTitles:['Saved']},words,1);await commitStudySets(made.state);await openStudySets(false,'study',made.set.id,true);await studySetsStart(made.set.id);});
 await page.locator('#study-sets-flashcard').tap();await page.waitForFunction(()=>!studySetsUI.mutating);
 await page.evaluate(()=>{window.qaCommit=commitStudySets;window.qaGate=new Promise(r=>window.qaRelease=r);commitStudySets=async s=>{window.qaPending=true;await qaGate;await qaCommit(s);window.qaPending=false;};window.qaFrames=[];window.qaStart=performance.now();const sample=()=>{const card=document.getElementById('study-sets-flashcard'),r=card?.getBoundingClientRect();qaFrames.push({t:performance.now()-qaStart,x:r?.x,width:r?.width,word:document.getElementById('study-sets-expression')?.textContent,under:document.querySelector('.study-session-next')?.textContent,pending:!!window.qaPending});if(qaFrames.length<80)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 const cdp=await context.newCDPSession(page),bounds=await page.locator('#study-sets-flashcard').boundingBox(),x=180,y=Math.min(640,bounds.y+240);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(const dx of [30,65,100,140]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y,id:1}]});await page.waitForTimeout(20);}await page.screenshot({path:`${out}/handoff-${phase}-drag.png`});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const captures=[];for(const delay of [35,55,100,100]){await page.waitForTimeout(delay);const t=await page.evaluate(()=>performance.now()-qaStart);const file=`handoff-${phase}-${captures.length}.png`;await page.screenshot({path:`${out}/${file}`});captures.push({file,t});}
 await page.waitForFunction(()=>qaPending);await page.waitForTimeout(220);const pending=await page.evaluate(()=>{const r=document.getElementById('study-sets-flashcard').getBoundingClientRect();return {x:r.x,width:r.width,under:document.querySelector('.study-session-next').textContent};});
 await page.screenshot({path:`${out}/handoff-${phase}-pending.png`});
 if(phase==='before'){assert.ok(pending.x<100&&pending.x+pending.width>300,'reproduce old card restored to center while save is pending');assert.equal(pending.under,await page.evaluate(()=>{const v=BreezeStudySets.view(studySetsUI.state,studySetsUI.setId);return v.set.session.queue.find(c=>c.id===v.pendingIds[1]).word;}));}
 else {assert.ok(pending.x>390,'fixed outgoing remains offscreen until commit');assert.equal(pending.under,'');}
 await page.evaluate(()=>{commitStudySets=qaCommit;qaRelease();});await page.waitForFunction(()=>!studySetsUI.mutating);await page.screenshot({path:`${out}/handoff-${phase}-next.png`});report.push({phase,baseline:phase==='before'?baseline:null,pending,captures,frames:await page.evaluate(()=>qaFrames)});
 const path=await page.video().path();await context.close();copyFileSync(path,`${out}/handoff-${phase}.webm`);
 }finally{await context.close();await server.close();}
}writeFileSync(`${out}/handoff-paired.json`,JSON.stringify({input:'trusted Chromium CDP touch; held durable commit; browser evidence, not native',cases:report},null,2));console.log('Shipped center-text return reproduced; current handoff remains offscreen through save');
}finally{await browser.close();rmSync(scratch,{recursive:true,force:true});}
