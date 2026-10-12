import {studyAction} from './helpers/study-actions.mjs';
/* Trusted Chromium touchscreen gestures; web preview, not native iOS QA. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=process.env.BREEZE_STUDY_ROOT?resolve(process.env.BREEZE_STUDY_ROOT)+'/':fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_STUDY_TOUCH_PROOF||'/tmp/breeze-study-touch-preview';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
let browser,page,actionSnapshot;
let stage='setup';const actionDiagnostics=[];
try{
 browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','"done"'));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.evaluate(async ()=>{
  const data=[['observe','관찰하다','She stopped to observe the room.'],['evidence','증거','There was no evidence of a struggle.'],['remarkable','놀라운','It was a remarkable discovery.'],['peculiar','특이한','He had a peculiar habit.'],['hesitate','망설이다','Do not hesitate to ask.'],['sufficient','충분한','We have sufficient time.'],['sensible','분별 있는','That seems a sensible choice.'],['deduce','추론하다','What can you deduce from this?'],['reliable','믿을 수 있는','We need a reliable source.'],['emerge','나타나다','A new idea began to emerge.'],['maintain','유지하다','They maintain a close relationship.'],['perspective','관점','Consider a different perspective.'],['subtle','미묘한','A subtle change.'],['patient','참을성 있는','Be patient.'],['curious','호기심 많은','She was curious.'],['calm','차분한','Stay calm.'],['careful','신중한','Be careful.'],['precise','정확한','A precise answer.']];
  words=Object.fromEntries(data.map(([word,ko,example],i)=>[word,{word,ko,example,book:'The Adventures of Sherlock Holmes',status:1,addedAt:i+1}]));
  words.same={...words.observe,book:'이번 주 읽은 기사'};
  words.newArticle={word:'insight',ko:'통찰',book:'이번 주 읽은 기사',example:'A fresh insight.',status:2,addedAt:30};
  words.unrelated={word:'unrelated',ko:'관련 없는',book:'별도 책',status:3,addedAt:40};saveWords();
  const state=BreezeStudySets.create((await loadStudySets()),{name:'이번 주 읽은 글',bookTitles:['The Adventures of Sherlock Holmes']},words,100).state;
  words.pending={word:'method',ko:'방법',book:'The Adventures of Sherlock Holmes',example:'His method was simple.',status:1,addedAt:50};saveWords();
  await commitStudySets(state);show('vocab');renderVocab();openStudySetsDirectory();
  window.undoTouchTrace=[];for(const type of ['pointerdown','pointerup','click'])window.addEventListener(type,e=>{if(e.target.closest?.('.study-sets-undo button'))undoTouchTrace.push({type,trusted:e.isTrusted,pointerType:e.pointerType,exiting:!!document.querySelector('.study-sets-exiting')});},true);window.touchTrace=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>{if(e.target.closest?.('.study-sets-word-row'))touchTrace.push({type,target:e.target.className,pointerType:e.pointerType,trusted:e.isTrusted});},true);
 });
 await page.evaluate(()=>{
  window.studyActionTrace=[];
  for(const type of ['pointerdown','pointerup','pointercancel','click'])for(const capture of [true,false])document.addEventListener(type,e=>{
   if(!e.target.closest?.('.study-sets-word-row'))return;
   const target=e.target,hit=document.elementFromPoint(e.clientX,e.clientY);
   studyActionTrace.push({type,phase:capture?'capture':'bubble',target:target.tagName+'.'+(target.getAttribute('class')||''),hit:hit?.tagName+'.'+(hit?.getAttribute('class')||''),trusted:e.isTrusted,pointerType:e.pointerType,pointerId:e.pointerId,x:e.clientX,y:e.clientY,defaultPrevented:e.defaultPrevented,releaseClickId:studySetsUI.releaseClickId,time:performance.now()});
  },capture);
 });
 actionSnapshot=()=>page.evaluate(async ()=>{
  const row=document.querySelector('#study-sets-word-list>li'),action=row?.querySelector('.study-sets-row-action'),r=action?.getBoundingClientRect(),p=r&&{x:r.x+r.width/2,y:r.y+r.height/2},hit=p&&document.elementFromPoint(p.x,p.y);
  return {cardId:row?.dataset.cardId,action:r?.toJSON(),point:p,hit:hit?.outerHTML.slice(0,500),hitOwned:!!action&&(action===hit||action.contains(hit)),row:row?.getBoundingClientRect().toJSON(),offset:row&&getComputedStyle(row.querySelector('.study-sets-word-surface')).transform,excludedIds:(await loadStudySets()).sets[0]?.excludedIds,count:document.querySelectorAll('#study-sets-word-list>li').length,scroll:document.getElementById('study-sets-content').scrollTop,releaseClickId:studySetsUI.releaseClickId,trace:studyActionTrace.slice(-100),pointerTrace:touchTrace.slice(-60),userAgent:navigator.userAgent};
 });
 await page.evaluate(()=>document.fonts.ready);
 const cdp=await context.newCDPSession(page);
 const send=async(type,x=0,y=0)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y,id:1,force:1,radiusX:4,radiusY:4}]});await page.waitForTimeout(35);};
 const point=async locator=>{const r=await locator.boundingBox();assert.ok(r);return {x:r.x+r.width/2,y:r.y+r.height/2};};
 const tap=async locator=>{const p=await point(locator);await send('touchStart',p.x,p.y);await send('touchEnd');await page.waitForTimeout(400);};
 const capture=async name=>{
  await page.evaluate(()=>document.fonts.ready);
  if(process.env.BREEZE_STUDY_HEADER_ONLY){
   if(!/^phone-edit-closed-(light|dark)$/.test(name))return;
   const header=await page.locator('#v-memory-set .study-sets-header').boundingBox();
   await page.screenshot({path:`${proof}/web-preview-phone-header-${name.endsWith('dark')?'dark':'light'}.png`,clip:{x:header.x,y:header.y,width:header.width,height:header.height+12}});return;
  }
  await page.screenshot({path:`${proof}/web-preview-${name}.png`,fullPage:false});
 };
 const directory=()=>page.waitForFunction(()=>studySetsUI.screen==='directory'&&studySetsUI.dialog.open);
 const back=async()=>{for(let i=0;i<4&&await page.evaluate(()=>studySetsUI.screen!=='directory');i++)await tap(page.locator('#study-sets-back'));await directory();};
 const row=()=>page.locator('#study-sets-word-list>li').first();
 const offset=()=>row().locator('.study-sets-word-surface').evaluate(n=>{const t=getComputedStyle(n).transform;return t==='none'?0:new DOMMatrixReadOnly(t).m41;});
 const settled=async expected=>{await page.waitForFunction(x=>{const n=document.querySelector('.study-sets-word-surface');if(!n)return false;const t=getComputedStyle(n).transform;return Math.abs((t==='none'?0:new DOMMatrixReadOnly(t).m41)-x)<1;},expected);};
 const openSet=async()=>{await tap(page.locator('.study-sets-home-card[data-set-id]').first());await page.waitForFunction(()=>activeAppView()==='memory-set');};
 const menu=async(midName='')=>{
  if(await page.evaluate(()=>studySetsUI.screen==='directory'))await openSet();
  if(midName){const p=await point(page.locator('#study-sets-edit'));await send('touchStart',p.x,p.y);await send('touchEnd');const shell=await page.locator('#study-sets-edit-surface').boundingBox();assert.ok(shell.width>44&&shell.width<236,'the shared surface grows continuously');await capture(midName);}
  else await tap(page.locator('#study-sets-edit'));
  await page.waitForFunction(()=>studySetsUI.editOpen&&!studySetsUI.editAnimation&&Number(getComputedStyle(studySetsUI.editMenu).opacity)>.99);
  assert.equal(await page.locator('#study-sets-edit').evaluate(n=>getComputedStyle(n).opacity),'0','no duplicate ellipsis remains visible');
  await page.getByRole('menuitem',{name:'책 추가',exact:true}).waitFor();
 };

 const swipe=async(amount,cancel=false)=>{const r=await row().boundingBox();const x=r.x+r.width-65,y=r.y+r.height/2;await send('touchStart',x,y);for(let i=1;i<=6;i++)await send('touchMove',x-amount*i/6,y);await send(cancel?'touchCancel':'touchEnd');};
 const materialSamples=[];
 const checkMaterial=async(dark,frames=1)=>{
  const samples=await page.evaluate(async({dark,frames})=>{
   darkMode=dark;applyDark();const samples=[];
   for(let i=0;i<frames;i++){
    const surface=document.querySelector('#study-sets-edit-surface'),back=document.querySelector('#study-sets-back');
    const a=getComputedStyle(surface),b=getComputedStyle(back),r=back.getBoundingClientRect(),shell=surface.getBoundingClientRect();
    samples.push({dark,background:a.backgroundImage,ink:a.color,backBackground:b.backgroundImage,backInk:b.color,backLine:b.borderColor,line:a.borderColor,backShadow:b.boxShadow,shadow:a.boxShadow,backWidth:r.width,backHeight:r.height,aligned:Math.abs(r.top-shell.top)<1,backRadius:b.borderRadius});
    await new Promise(requestAnimationFrame);
   }return samples;
  },{dark,frames});
  for(const s of samples){const rgb=s.background.match(/rgba?\((\d+), (\d+), (\d+)/).slice(1).map(Number),ink=s.ink.match(/\d+/g).slice(0,3).map(Number);assert.ok(dark?rgb.every(x=>x<120)&&ink.every(x=>x>200):rgb.every(x=>x>230)&&ink.every(x=>x<80),'material and readable ink follow theme without a dark flash');assert.equal(s.backBackground,s.background);assert.equal(s.backInk,s.ink);assert.equal(s.backLine,s.line);assert.equal(s.backShadow,s.shadow);assert.equal(s.backWidth,44);assert.equal(s.backHeight,44);assert.equal(s.backRadius,'22px');assert.ok(s.aligned);}
  materialSamples.push(...samples);
 };
 const checkHeaderIcons=async()=>{
  const icons=await page.evaluate(()=>['study-sets-back','study-sets-edit'].map(id=>{
   const button=document.getElementById(id),svg=button.querySelector('svg'),b=button.getBoundingClientRect(),r=svg.getBoundingClientRect(),s=getComputedStyle(svg);
   return {id,width:r.width,height:r.height,stroke:s.strokeWidth,cap:s.strokeLinecap,join:s.strokeLinejoin,centerX:r.x+r.width/2-b.x-b.width/2,centerY:r.y+r.height/2-b.y-b.height/2,ink:s.color};
  }));
  assert.equal(icons[0].width,32);assert.equal(icons[0].height,32);assert.equal(icons[0].stroke,'1.5px','back roles share optical chevron weight');assert.equal(icons[1].width,20);assert.equal(icons[1].height,20);assert.equal(icons[1].stroke,'2.4px','ellipsis retains its own silhouette');assert.equal(icons[0].cap,'round');assert.equal(icons[0].join,'round');assert.equal(icons[0].ink,icons[1].ink);for(const icon of icons){assert.ok(Math.abs(icon.centerX)<.1&&Math.abs(icon.centerY)<.1,'header icons centered inside circle');}
  return icons;
 };
 const headerIcons=[];
 const inventory=await page.evaluate(()=>words);
 const gaps=await page.locator('.study-sets-home-card').evaluateAll(nodes=>{const r=nodes.map(n=>n.getBoundingClientRect());return r.slice(1).map((n,i)=>n.top-r[i].bottom);});
 assert.ok(gaps.every(g=>Math.abs(g-8)<1),'all/custom/add have equal gaps');
 assert.equal(await page.locator('#study-sets-close').evaluate(n=>getComputedStyle(n).borderRadius),'50%');
 await capture('phone-list-light');
 let p=await point(page.locator('.study-sets-home-card[data-set-id]'));
 await send('touchStart',p.x,p.y);await send('touchMove',p.x,p.y-20);await send('touchCancel');await page.waitForTimeout(550);await directory();
 p=await point(page.locator('.study-sets-home-card[data-set-id]'));await send('touchStart',p.x,p.y);await page.waitForTimeout(550);await send('touchEnd');assert.equal(await page.evaluate(()=>studySetsUI.editOpen),false);if(await page.evaluate(()=>studySetsUI.screen==='detail'))await back();await directory();

 await openSet();assert.equal(await page.locator('.study-sets-home-menu-trigger').count(),0);
 await capture('phone-edit-closed-light');await menu('phone-edit-mid-light');assert.equal(await page.getByRole('menuitem').count(),3);assert.equal(await page.locator('.study-sets-edit-menu #study-sets-import').count(),0);await capture('phone-edit-open-light');
 // Theme changes must affect the shared shell and Back immediately, even mid-morph.
 await checkMaterial(false);await checkMaterial(true);await checkMaterial(false);
 await tap(page.locator('#study-sets-edit'));await checkMaterial(false);
 p=await point(page.locator('#study-sets-edit'));await send('touchStart',p.x,p.y);await send('touchEnd');
 assert.ok(await page.evaluate(()=>!!studySetsUI.editAnimation));await checkMaterial(true,3);await checkMaterial(false,12);
 await page.waitForFunction(()=>studySetsUI.editOpen&&!studySetsUI.editAnimation);
 await send('touchStart',p.x,p.y);await send('touchEnd');await checkMaterial(true,3);await checkMaterial(false,12);
 await page.waitForFunction(()=>studySetsUI.editMenu.hidden);await menu();
 // Interrupt a morph in either direction; stale completion cannot reopen it.
 p=await point(page.locator('#study-sets-edit'));await send('touchStart',p.x,p.y);await send('touchEnd');await send('touchStart',p.x,p.y);await send('touchEnd');
 await page.waitForFunction(()=>studySetsUI.editOpen&&!studySetsUI.editAnimation);
 await tap(page.locator('#study-sets-back'));await page.waitForFunction(()=>!studySetsUI.editOpen&&studySetsUI.editMenu.hidden);assert.equal(await page.evaluate(()=>studySetsUI.screen),'detail');
 await menu();await tap(row().locator('.vword'));await page.waitForFunction(()=>studySetsUI.editMenu.hidden);assert.equal(await row().locator('.vmore').count(),0,'outside tap closes without opening example');
 // Keyboard focus follows the anchored menu and returns on Escape.
 await page.locator('#study-sets-edit').focus();await studyAction(page.keyboard.press('Enter'),page);await page.waitForFunction(()=>!studySetsUI.editAnimation);
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('role')),'menuitem');await studyAction(page.keyboard.press('ArrowDown'),page);assert.equal(await page.evaluate(()=>document.activeElement.textContent),'책 추가');await studyAction(page.keyboard.press('Escape'),page);await page.waitForFunction(()=>studySetsUI.editMenu.hidden);assert.equal(await page.evaluate(()=>document.activeElement.id),'study-sets-edit');
 assert.equal(await page.locator('dialog[open]').count(),0);
 const count=await page.locator('#study-sets-word-list>li').count();
 p=await point(row().locator('.vko'));await send('touchStart',p.x,p.y);await send('touchMove',p.x-18,p.y);const first=await offset();await send('touchMove',p.x-60,p.y);const second=await offset();
 assert.ok(first< -10&&second<first-25,'trusted touch follows finger after implicit capture transfer');
 await send('touchMove',p.x-90,p.y);await capture('phone-swipe-moving-light');await send('touchCancel');await settled(0);
 assert.equal(await page.locator('#study-sets-word-list>li').count(),count);assert.equal(await row().locator('.vmore').count(),0);
 await swipe(90);await settled(-72);await capture('phone-swipe-parked-light');await tap(page.locator('#study-sets-title'));await settled(0);
 // Undo is available while the exit is still running, without a settle delay.
 await swipe(270);assert.equal(await page.evaluate(async ()=>(await loadStudySets()).sets[0].excludedIds.length),1);
 assert.ok(await page.locator('.study-sets-exiting').count()>0,'touch Undo during removal');
 assert.deepEqual(await page.evaluate(()=>words),inventory);
 const undo=page.getByRole('button',{name:'실행 취소',exact:true});assert.equal(await undo.count(),1,'Undo exists before exit finishes');p=await point(undo);
 await send('touchStart',p.x,p.y);await send('touchEnd');
 await page.waitForFunction(n=>document.querySelectorAll('#study-sets-word-list>li').length===n&&readStudySets().sets[0].excludedIds.length===0,count);
 await page.waitForTimeout(400);
 // A finger held through collapse keeps the same Undo target as it finishes.
 await swipe(270);const undoTarget=await undo.elementHandle();p=await point(undo);await send('touchStart',p.x,p.y);
 await page.waitForFunction(()=>!document.querySelector('.study-sets-exiting'));
 assert.equal(await undoTarget.evaluate(n=>n.isConnected),true);await send('touchEnd');
 await page.waitForFunction(n=>document.querySelectorAll('#study-sets-word-list>li').length===n&&readStudySets().sets[0].excludedIds.length===0,count);
 await page.waitForTimeout(400);
 // Capture the same steady excluded state for the review screenshots.
 await swipe(270);await page.waitForFunction(n=>document.querySelectorAll('#study-sets-word-list>li').length===n,count-1);await capture('phone-exclusion-undo-light');
 p=await point(undo);await send('touchStart',p.x,p.y);await send('touchCancel');assert.equal(await page.evaluate(async ()=>(await loadStudySets()).sets[0].excludedIds.length),1);
 await send('touchStart',p.x,p.y);await send('touchMove',p.x-18,p.y);await send('touchEnd');assert.equal(await page.evaluate(async ()=>(await loadStudySets()).sets[0].excludedIds.length),1);
 await tap(undo);await page.waitForFunction(n=>document.querySelectorAll('#study-sets-word-list>li').length===n,count);
 await tap(row().locator('.vword'));assert.equal(await row().locator('.vmore').count(),1);await tap(row().locator('.vword'));assert.equal(await row().locator('.vmore').count(),0);
 stage='parked exclusion action';await swipe(90);await settled(-72);
 actionDiagnostics.push({stage:'before action',...await actionSnapshot()});
 await tap(row().locator('.study-sets-row-action'));
 actionDiagnostics.push({stage:'after action',...await actionSnapshot()});
 await page.waitForFunction(n=>document.querySelectorAll('#study-sets-word-list>li').length===n,count-1);stage='remaining lifecycle';
 const excluded=await page.evaluate(async ()=>(await loadStudySets()).sets[0].excludedIds.slice());await back();await menu();
 await tap(page.getByRole('menuitem',{name:'이름 변경',exact:true}));await page.locator('#study-sets-rename-input').fill('Holmes · 이번 주');await tap(page.getByRole('button',{name:'이름 저장',exact:true}));
 await menu();await tap(page.getByRole('menuitem',{name:'책 추가',exact:true}));
 await tap(page.locator('.study-sets-books').getByRole('checkbox',{name:/이번 주 읽은 기사/}));assert.equal(await page.locator('.study-sets-books input:checked').evaluate(n=>getComputedStyle(n).borderRadius),'50%');await capture('phone-add-books-light');await tap(page.locator('#study-sets-add-books'));
 await page.waitForFunction(()=>studySetsUI.screen==='detail');await back();
 const trace=await page.evaluate(()=>touchTrace),undoTrace=await page.evaluate(()=>undoTouchTrace);
 assert.ok(undoTrace.some(e=>e.type==='pointerup'&&e.exiting&&e.trusted),'trusted release restores during exit');
 assert.ok(undoTrace.some(e=>e.type==='pointerdown'&&e.exiting&&e.trusted),'Undo touch starts during exit');
 assert.ok(undoTrace.every(e=>e.trusted&&e.pointerType==='touch'));
 await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>{show('vocab');openStudySetsDirectory();});await directory();
 const durable=await page.evaluate(async ()=>(await loadStudySets()).sets[0]);assert.equal(durable.name,'Holmes · 이번 주');assert.deepEqual(durable.excludedIds,excluded);
 assert.equal(durable.cards.length,count+1);assert.equal(new Set(durable.cards.map(c=>c.id)).size,durable.cards.length);
 assert.ok(!durable.cards.some(c=>c.word==='unrelated'));assert.deepEqual(await page.evaluate(()=>words),inventory);
 await menu();await tap(page.getByRole('menuitem',{name:'책 추가',exact:true}));assert.equal(await page.locator('.study-sets-books').getByRole('checkbox',{name:/이번 주 읽은 기사/}).count(),0,'added source cannot be added twice');await back();
 await page.evaluate(()=>openStudySetsDirectory());await directory();
 // The immutable default exposes no management trigger or delete menu.
 await page.locator('#study-sets-all').dispatchEvent('contextmenu');await directory();assert.equal(await page.locator('#study-sets-edit').isVisible(),false);
 const layouts=[];
 for(const [width,height] of [[390,844],[820,1180],[1440,1000],[320,568],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(dark=>{darkMode=dark;applyDark();},dark);
  await directory();const sheet=await page.locator('.study-sets-sheet').boundingBox();assert.ok(sheet.width<=width&&sheet.height<=height);
  assert.equal(await page.locator('#study-sets-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  if(width===390||width===820)await capture(`${width===390?'phone':'tablet'}-list-${dark?'dark':'light'}`);
  if(width===390||width===820){
   const device=width===390?'phone':'tablet',theme=dark?'dark':'light';await openSet();headerIcons.push({device,theme,icons:await checkHeaderIcons()});await capture(`${device}-edit-closed-${theme}`);await menu(`${device}-edit-mid-${theme}`);await capture(`${device}-edit-open-${theme}`);
   await tap(page.getByRole('menuitem',{name:'책 추가',exact:true}));await tap(page.locator('.study-sets-books input').first());await capture(`${device}-add-books-${theme}`);
   await back();
  }
  await openSet();assert.equal(await page.locator('#study-sets-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  if(width===390||width===820)await capture(`${width===390?'phone':'tablet'}-detail-${dark?'dark':'light'}`);
  await back();layouts.push({width,height,dark});
 }
 await page.setViewportSize({width:390,height:844});await openSet();await menu();const firstRow=await row().elementHandle();await page.locator('#study-sets-content').evaluate(n=>n.scrollTop=80);await page.waitForFunction(()=>studySetsUI.editMenu.hidden);assert.equal(await firstRow.evaluate(n=>n.isConnected),true);await back();
 await page.emulateMedia({reducedMotion:'reduce'});await openSet();await menu();assert.equal(await page.evaluate(()=>studySetsUI.editAnimation),null);await tap(page.locator('#study-sets-edit'));assert.equal(await page.evaluate(()=>studySetsUI.editMenu.hidden),true);await back();await page.emulateMedia({reducedMotion:'no-preference'});
 // Direct detail import is idempotent even if a detached button fires again.
 await openSet();const pending=page.locator('#study-sets-import');assert.match(await pending.innerText(),/새 단어 가져오기 · 1개/);
 const stale=await pending.elementHandle(),beforeImport=await page.evaluate(async ()=>(await loadStudySets()).sets[0]);await tap(pending);
 await stale.evaluate(n=>n.click());const imported=await page.evaluate(async ()=>(await loadStudySets()).sets[0]);
 assert.equal(imported.cards.length,beforeImport.cards.length+1);assert.deepEqual(imported.excludedIds,excluded);
 assert.equal(new Set(imported.cards.map(c=>c.id)).size,imported.cards.length);assert.equal(await pending.count(),0);assert.deepEqual(await page.evaluate(()=>words),inventory);
 await back();
 // Isolate native scrolling and its inertia from the following tap checks.
 await openSet();await menu();const scrollCount=await page.locator('#study-sets-word-list>li').count();
 p=await point(page.locator('#study-sets-word-list>li').nth(4).locator('.vko'));assert.equal(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('.study-sets-word-row'),p),true);await send('touchStart',p.x,p.y);
 for(let i=1;i<=5;i++)await send('touchMove',p.x,p.y-i*12);await send('touchEnd');await page.waitForTimeout(160);
 assert.ok(await page.locator('#study-sets-content').evaluate(n=>n.scrollTop)>10,'real vertical touch scrolls');assert.equal(await page.evaluate(()=>studySetsUI.editMenu.hidden),true,'outside native scrolling dismisses menu');
 assert.equal(await page.locator('#study-sets-word-list>li').count(),scrollCount);assert.equal(await offset(),0);
 assert.deepEqual(errors,[]);assert.ok(trace.some(e=>e.type==='lostpointercapture'&&e.target==='vko'));assert.ok(trace.every(e=>e.trusted&&e.pointerType==='touch'));
 writeFileSync(`${proof}/touch-verification.json`,JSON.stringify({platform:'Chromium web touchscreen emulation, not native iOS',checks:'finger-follow/implicit-capture/vertical-scroll/cancel/park/outside-dismiss/deep-swipe/action/immediate-undo/stable-undo-through-collapse/examples/theme-material/no-light-dark-flash/matching-circular-back/shared-surface-growth/dot-content-crossfade/no-visible-duplicate/detail-ellipsis/morph-interruption/outside-dismiss/back/keyboard-focus/longpress-remnants/menu-dismiss/rename/reload/add-books/direct-import/repeated-import/hidden-exclusion-count/circular-checks/menu-dividers/dedup/exclusions/global-vocabulary/all-words-immutable',layouts,headerIcons,materialSamples,trace,undoTrace,actionDiagnostics,errors},null,2));
 console.log('Trusted touchscreen, persistence and responsive screenshot checks passed: '+proof);
}catch(error){
 if(page){
  const current=await actionSnapshot?.().catch(()=>null);
  writeFileSync(`${proof}/touch-failure.json`,JSON.stringify({stage,error:String(error),actionDiagnostics,current},null,2));
  await page.screenshot({path:`${proof}/touch-failure.png`}).catch(()=>{});
  console.error('Trusted touch failure evidence: '+proof+'/touch-failure.json');
 }
 throw error;
}finally{await browser?.close();server.close();}
