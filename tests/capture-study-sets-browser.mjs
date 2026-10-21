import {studyAction} from './helpers/study-actions.mjs';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const proof='/tmp/breeze-study-sets-proof';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
let browser;
try{
 browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const geometry=async group=>group.evaluate(node=>Object.fromEntries([':scope','.vrow','.vword','.vko','.chip'].map(selector=>{const r=(selector===':scope'?node:node.querySelector(selector)).getBoundingClientRect();return [selector,{x:r.x,width:r.width,height:r.height}];})));

 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.evaluate(async ()=>{
  const fixtures=[['observe','관찰하다','She stopped to observe the room.'],['evidence','증거','There was no evidence of a struggle.'],['remarkable','놀라운','It was a remarkable discovery.'],['peculiar','특이한','He had a peculiar habit.'],['hesitate','망설이다','Do not hesitate to ask.'],['sufficient','충분한','We have sufficient time.'],['sensible','분별 있는','That seems a sensible choice.'],['deduce','추론하다','What can you deduce from this?'],['reliable','신뢰할 수 있는','We need a reliable source.'],['emerge','나타나다','A new idea began to emerge.'],['maintain','유지하다','They maintain a close relationship.'],['perspective','관점','Consider a different perspective.']];
  words=Object.fromEntries(fixtures.map(([word,ko,example],i)=>[word,{word,ko,example,book:i<8?'The Adventures of Sherlock Holmes':'이번 주 읽은 기사',status:1,addedAt:i+1}]));saveWords();
  let state=(await loadStudySets());state=BreezeStudySets.create(state,{name:'중간고사 · 1–3과',bookTitles:['The Adventures of Sherlock Holmes']},words,100).state;
  state=BreezeStudySets.create(state,{name:'이번 주 읽은 글',bookTitles:['이번 주 읽은 기사']},words,101).state;await commitStudySets(state);show('vocab');renderVocab();darkMode=false;applyDark();
 });

 await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0);
 const capture=async name=>page.screenshot({path:`${proof}/ui-set-${name}-${engine.name()}-phone-light.png`,fullPage:false});
 const originalGeometry=await geometry(page.locator('#v-vocab .vgroup').filter({has:page.locator('.vword',{hasText:'remarkable'})}));
 await capture('entry');
 await studyAction(page.evaluate(()=>openStudySetsDirectory()),page);await page.waitForFunction(()=>activeAppView()==='vocab'&&studySetsUI.screen==='directory'&&document.getElementById('study-sets-dialog').open);
 assert.equal(await page.locator('dialog[open]').count(),1);
 await page.evaluate(()=>{window.qaCaptureSheet=studySetsUI.sheet;window.qaCaptureDialog=studySetsUI.dialog;window.qaCaptureCloseEvents=0;studySetsUI.dialog.addEventListener('close',()=>{window.qaCaptureCloseEvents++;});});
 await capture('home');
 await studyAction(page.locator('#study-sets-home-create').click(),page);
 await page.locator('#study-sets-name').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>activeAppView()==='vocab'&&window.qaCaptureSheet===studySetsUI.sheet&&window.qaCaptureDialog===studySetsUI.dialog),true,'creation remains inside the same directory sheet');assert.equal(await page.locator('dialog[open]').count(),1);
 await capture('create-empty');
 await page.locator('#study-sets-name').fill('이번 주 복습');
 for(const checkbox of await page.locator('.study-sets-books input[type=checkbox]').all())await checkbox.check();
 assert.match(await page.locator('#study-sets-selection-count').innerText(),/12개/);
 assert.equal(await page.locator('#study-sets-save').isEnabled(),true);
 await studyAction(page.locator('.study-sets-books legend').click(),page);await page.mouse.move(0,0);
 await capture('create-selected');
 await studyAction(page.locator('#study-sets-back').click(),page);
 await page.waitForFunction(()=>studySetsUI.screen==='directory'&&document.getElementById('study-sets-dialog').open);
 assert.equal(await page.evaluate(()=>window.qaCaptureCloseEvents),0,'list and creation stay in one continuously open sheet');
 await studyAction(page.locator('.study-sets-home-card[data-set-id]').first().click(),page);
 await page.waitForFunction(()=>activeAppView()==='memory-set');
 assert.equal(await page.locator('dialog[open]').count(),0);
 assert.equal(await page.locator('#study-sets-word-list .vordinal').count(),8);
 await capture('detail');
 const setGeometry=await geometry(page.locator('#study-sets-word-list .vgroup').filter({has:page.locator('.vword',{hasText:'remarkable'})}));
 writeFileSync(`${proof}/ui-set-row-metrics-${engine.name()}.json`,JSON.stringify({engine:engine.name(),viewport:page.viewportSize(),original:originalGeometry,set:setGeometry},null,2));
 for(const selector of [':scope','.vrow','.vword','.vko','.chip'])for(const key of ['x','width'])assert.ok(Math.abs(setGeometry[selector][key]-originalGeometry[selector][key])<=1,`${selector}.${key} differs from original: ${setGeometry[selector][key]} vs ${originalGeometry[selector][key]}`);
 assert.ok(Math.abs(setGeometry['.vword'].height-originalGeometry['.vword'].height)<=1,'word wrapping differs from original');
 const row=page.locator('#study-sets-word-list > li').first();
 const point=await row.locator('.vko').evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.right-4,y:r.y+r.height/2};});
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x-68,point.y,{steps:10});
 // This frame documents the parked action, not a velocity-triggered flick.
 // Release at rest after the measured velocity window has expired.
 await page.waitForTimeout(100);await page.mouse.up();
 await row.locator('.study-sets-word-surface').evaluate(async n=>{for(let i=0;i<60;i++){const t=getComputedStyle(n).transform;if(t!=='none'&&Math.abs(new DOMMatrixReadOnly(t).m41+72)<1)return;await new Promise(requestAnimationFrame);}throw Error('Reveal did not settle');});
 assert.equal(await page.locator('#study-sets-word-list > li').count(),8,'parked preview must retain every row');
 await capture('swipe-circle');
 assert.deepEqual(errors,[]);
 console.log('Real application review captures saved; full interaction QA runs separately.');
}finally{await browser?.close();server.close();}
