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
 const rows=()=>page.locator('#study-sets-word-list > li');
 const rowMetrics=[];
 const recordRowMetrics=record=>{rowMetrics.push(record);writeFileSync(`${proof}/row-metrics-${engine.name()}.json`,JSON.stringify(rowMetrics,null,2));};
 const vocabularyGeometry=async group=>group.evaluate(node=>Object.fromEntries([':scope','.vrow','.vword','.vko','.chip'].map(selector=>{const r=(selector===':scope'?node:node.querySelector(selector)).getBoundingClientRect();return [selector,{x:r.x,width:r.width,height:r.height}];})));
 const assertGeometry=(actual,expected,label)=>{for(const selector of [':scope','.vrow','.vword','.vko','.chip'])for(const key of ['x','width'])assert.ok(Math.abs(actual[selector][key]-expected[selector][key])<=1,`${label} ${selector}.${key}: ${actual[selector][key]} vs original ${expected[selector][key]}`);assert.ok(Math.abs(actual['.vword'].height-expected['.vword'].height)<=1,`${label} word wrapping differs from original`);};
 const vocabularyStyle=async group=>group.evaluate(node=>Object.fromEntries(['.vword','.vko','.chip'].map(selector=>{const style=getComputedStyle(node.querySelector(selector));return [selector,Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderRadius'].map(key=>[key,style[key]]))];})));
 const originalVocabularyStyle=async({captureEntry=false}={})=>{
  await dismissDirectory();
  const group=page.locator('#v-vocab .vgroup').filter({has:page.locator('.vword',{hasText:'remarkable'})});
  const style=await vocabularyStyle(group),geometry=await vocabularyGeometry(group);
  if(captureEntry){await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(0,0);await page.screenshot({path:`${proof}/ui-set-entry-${engine.name()}-phone-light.png`,fullPage:false});}
  await page.locator('#wordbook-review').click();return {style,geometry};
 };
 const assertNumbers=async()=>{const count=await rows().count();assert.deepEqual(await page.locator('#study-sets-word-list .vordinal').allTextContents(),Array.from({length:count},(_,i)=>String(i+1)),'row numbers follow current active order');};
 const waitRows=async count=>{await page.waitForFunction(expected=>document.querySelectorAll('#study-sets-word-list > li').length===expected,count);await assertNumbers();};
 const waitTranslation=(row,x)=>row.locator('.study-sets-word-surface').evaluate(async(node,target)=>{for(let i=0;i<60;i++){const t=getComputedStyle(node).transform,actual=t==='none'?0:new DOMMatrixReadOnly(t).m41;if(Math.abs(actual-target)<1)return;await new Promise(resolve=>requestAnimationFrame(resolve));}throw Error('row translation did not settle at '+target);},x);
 const wordRow=word=>rows().filter({has:page.locator('.vword',{hasText:new RegExp(`${word}$`)})});
 const assertDirectory=async()=>{
  await page.waitForFunction(()=>activeAppView()==='vocab'&&studySetsUI.screen==='directory'&&document.getElementById('study-sets-dialog')?.open);
  assert.equal(await page.locator('dialog[open]').count(),1,'one directory sheet over the original vocabulary');
  assert.equal(await page.locator('#v-vocab').isVisible(),true);
  assert.equal(await page.locator('#study-sets-all').isVisible(),true);
 };
 const dismissDirectory=async()=>{
  await page.evaluate(()=>{window.qaStudyClosed=false;document.getElementById('study-sets-dialog').addEventListener('close',()=>{window.qaStudyClosed=true;},{once:true});});
  await page.locator('#study-sets-close').click();
  await page.waitForFunction(()=>window.qaStudyClosed&&!document.getElementById('study-sets-dialog').open&&!studySetsUI.pendingClose&&activeAppView()==='vocab');
 };
 const assertSetPage=async()=>{
  await page.waitForFunction(()=>activeAppView()==='memory-set');
  assert.equal(await page.locator('#v-memory-set').isVisible(),true);
  assert.equal(await page.locator('dialog[open]').count(),0,'set detail/study is a real page, not a modal');
  assert.equal(await page.locator('#study-sets-close').isVisible(),false,'set page has Back instead of an X');
 };
 // Return from a page or sheet sub-screen to its single directory sheet.
 const closeSheet=async()=>{
  for(let i=0;i<5&&await page.evaluate(()=>studySetsUI.screen!=='directory');i++){
   const before=await page.evaluate(()=>({screen:studySetsUI.screen,depth:studySetsUI.directoryDepth,edit:studySetsUI.editOpen}));
   await page.locator('#study-sets-back').click();await page.waitForFunction(old=>studySetsUI.screen!==old.screen||studySetsUI.directoryDepth!==old.depth||studySetsUI.editOpen!==old.edit,before);
  }
  await assertDirectory();
 };
 const openHomeMenu=async(method='touch')=>{
  if(await page.evaluate(()=>studySetsUI.screen!=='detail')){await closeSheet();await page.locator('.study-sets-home-card[data-set-id]').first().click();await assertSetPage();}
  if(method==='keyboard'){await page.locator('#study-sets-edit').focus();await page.keyboard.press('Enter');}
  else await page.locator('#study-sets-edit').click();
  await page.getByRole('menuitem',{name:'이름 변경',exact:true}).waitFor();await page.waitForFunction(()=>!studySetsUI.editAnimation);
 };
 const gesturePoint=async row=>{
  await row.scrollIntoViewIfNeeded();
  return row.evaluate(node=>{const r=node.getBoundingClientRect(),meaning=node.querySelector('.vko').getBoundingClientRect(),x=meaning.right-4,y=meaning.y+meaning.height/2,target=document.elementFromPoint(x,y);if(!target||!node.contains(target)||target.closest('.chip,.study-sets-row-action'))throw Error('swipe anchor must hit vocabulary content: '+target?.outerHTML.slice(0,200));return {x,y,width:r.width};});
 };
 const dragRow=async(row,dx,dy=0,{cancel=false,inspect=false,inspectAction=false,capture=''}={})=>{
  const {x,y}=await gesturePoint(row);
  await row.evaluate(node=>{node.dataset.qaPointerTrace='[]';if(!node.dataset.qaPointerInstrumented){node.dataset.qaPointerInstrumented='true';for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])node.addEventListener(type,event=>{const trace=JSON.parse(node.dataset.qaPointerTrace);trace.push({type,id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target.className});node.dataset.qaPointerTrace=JSON.stringify(trace.slice(-24));});}node.addEventListener('pointerdown',event=>{node.dataset.testPointerId=String(event.pointerId);},{once:true});});
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+dx/2,y+dy/2,{steps:4});
  const translation=()=>row.locator('.study-sets-word-surface').evaluate(node=>{const t=getComputedStyle(node).transform;return t==='none'?0:new DOMMatrixReadOnly(t).m41;});
  const middle=inspect?await translation():0;
  const actionMiddle=inspectAction?await row.locator('.study-sets-row-action').boundingBox():null;
  await page.mouse.move(x+dx,y+dy,{steps:4});
  if(inspect){const end=await translation();assert.ok(middle< -5&&end<middle-5,`row follows finger: ${middle} -> ${end}; trace=${await row.getAttribute('data-qa-pointer-trace')}; hit=${await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML.slice(0,300),{x,y})}`);}
  if(inspectAction){const actionEnd=await row.locator('.study-sets-row-action').boundingBox();assert.ok(actionEnd.width>actionMiddle.width+8&&Math.abs(actionEnd.height-actionMiddle.height)<1,'single action expands horizontally into capsule');const radius=await row.locator('.study-sets-word-surface').evaluate(node=>parseFloat(getComputedStyle(node).borderTopRightRadius));assert.ok(radius>=12,'translated row keeps rounded trailing edge');}
  if(capture)await page.screenshot({path:capture,fullPage:true});
  if(cancel)await row.evaluate(node=>node.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:Number(node.dataset.testPointerId),pointerType:'mouse'})));
  await page.mouse.up();
 };

 const fullSwipe=async(row,options={})=>{const r=await row.boundingBox();await dragRow(row,-Math.max(144,r.width*.62)-20,0,options);};

 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
 await page.goto(url);await page.evaluate(()=>homeReady);await page.locator('#nav-vocab').click();
 assert.equal(await page.evaluate(()=>activeAppView()),'vocab','Memory dock preserves the original vocabulary entry');
 await page.evaluate(()=>{
  words={a:{word:'wind',ko:'바람',book:'A',example:'A cold wind blew.',addedAt:1,status:1},
   duplicate:{word:'wind',ko:'바람',book:'B',example:'The wind rose.',addedAt:2,status:3},
   sense:{word:'wind',ko:'감다',book:'B',example:'Wind the clock.',addedAt:3,status:2},
   q:{word:'quiet',ko:'조용한',book:'A',example:'A quiet room.',addedAt:4,status:1},
   manual:{word:'manual',ko:'수동의',book:'',addedAt:5,status:1},pending:{word:'pending',ko:'',book:'A'}};
  saveWords();renderVocab();
 });
 // The shared renderer must preserve original Memory editing and star writes.
 const originalQuiet=page.locator('#v-vocab .vgroup').filter({has:page.locator('.vword',{hasText:/^quiet$/})});
 await originalQuiet.locator('.vword').click();
 assert.equal(await originalQuiet.locator('.vword').getAttribute('aria-expanded'),'true');
 assert.equal(await originalQuiet.locator('.vko').getAttribute('contenteditable'),'true');
 assert.equal(await originalQuiet.locator('.vex').isVisible(),true);
 await originalQuiet.locator('.vko').fill('조용하고 차분한');await page.locator('#vcnt').click();
 assert.equal(await page.evaluate(()=>words.q.ko),'조용하고 차분한','original wordbook meaning blur persists editing');
 await originalQuiet.locator('.vko').fill('조용한');await page.locator('#vcnt').click();
 assert.equal(await page.evaluate(()=>words.q.ko),'조용한','restore original fixture meaning');
 for(const expected of [2,3,1]){await originalQuiet.locator('.chip').click();assert.equal(await page.evaluate(()=>words.q.status),expected,'original star control updates source status');assert.equal(await originalQuiet.locator('.chip').innerText(),'★'.repeat(expected));}
 await originalQuiet.locator('.vword').click();assert.equal(await originalQuiet.locator('.vword').getAttribute('aria-expanded'),'false');
 const entry=page.locator('#wordbook-review');assert.equal(await entry.innerText(),'학습하기');
 assert.equal(await page.locator('#wordbook-study-sets-entry,#wordbook-sets-back').count(),0,'default vocabulary adds no top row or breadcrumb');
 await entry.click();await assertDirectory();
 await page.locator('#study-sets-all').click();await page.waitForFunction(()=>activeAppView()==='study');
 assert.equal(await page.locator('#vocabulary-review-page').isVisible(),true,'default all card opens the original all-word study directly');
 assert.equal(await page.locator('#v-vocab').isVisible(),false,'all-card entry does not loop to vocabulary');
 assert.equal(await page.locator('dialog[open]').count(),0);
 await page.locator('#review-reveal').click();assert.equal(await page.locator('#review-meaning').isVisible(),true);
 await page.goBack();await assertDirectory();
 await page.goForward();await page.waitForFunction(()=>activeAppView()==='study');
 await page.locator('#review-close').click();await assertDirectory();
 assert.equal(await page.evaluate(()=>document.activeElement.id),'study-sets-all','all-word study returns focus to the directory card');
 await dismissDirectory();
 await entry.focus();await page.keyboard.press('Enter');await assertDirectory();
 await page.evaluate(()=>{window.qaDirectoryDialog=document.getElementById('study-sets-dialog');window.qaDirectorySheet=studySetsUI.sheet;window.qaDirectoryVocabScroll=window.scrollY;window.qaDirectoryCloseEvents=0;window.qaDirectoryDialog.addEventListener('close',()=>{window.qaDirectoryCloseEvents++;});});
 await page.locator('#study-sets-home-create').click();assert.equal(await page.locator('#study-sets-save').isDisabled(),true);
 assert.equal(await page.locator('dialog[open]').count(),1);
 assert.equal(await page.evaluate(()=>activeAppView()==='vocab'&&window.qaDirectoryDialog===document.getElementById('study-sets-dialog')&&window.qaDirectorySheet===studySetsUI.sheet&&window.scrollY===window.qaDirectoryVocabScroll),true,'create replaces content in the same sheet');
 await page.locator('#study-sets-back').click();await assertDirectory();
 await page.locator('#study-sets-home-create').click();await page.goBack();await assertDirectory();
 await page.goForward();await page.waitForFunction(()=>studySetsUI.screen==='create'&&document.getElementById('study-sets-dialog').open);
 assert.equal(await page.locator('dialog[open]').count(),1);await page.locator('#study-sets-back').click();await assertDirectory();
 const sourceBefore=await page.evaluate(()=>JSON.stringify(words));
 await page.locator('#study-sets-home-create').click();
 await page.locator('#study-sets-name').fill('이번 시험 <safe>');
 await page.locator('.study-sets-book input[value="A"]').check();await page.locator('.study-sets-book input[value="B"]').check();
 assert.match(await page.locator('#study-sets-selection-count').innerText(),/3개/);
 await page.locator('#study-sets-save').click();await assertDirectory();
 assert.equal(await page.evaluate(()=>window.qaDirectoryDialog===document.getElementById('study-sets-dialog')),true);assert.equal(await page.locator('.study-sets-home-card[data-set-id]').count(),1,'saving returns to the list containing the new set');
 assert.equal(await page.evaluate(()=>window.qaDirectoryCloseEvents),0,'internal create/back/forward/save never closes or reopens the sheet');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.setId),await page.locator('.study-sets-home-card[data-set-id]').first().getAttribute('data-set-id'),'newly created set is focused in the directory');
 await page.locator('.study-sets-home-card[data-set-id]').first().click();await assertSetPage();assert.equal(await page.locator('#study-sets-word-list li').count(),3);await assertNumbers();
 assert.equal(await page.evaluate(()=>JSON.stringify(words)),sourceBefore);
 assert.equal(await page.locator('#study-sets-title').innerText(),'이번 시험 <safe>');
 // Rendering unchanged navigation must not consume WebKit's history quota.
 // Count real calls; never suppress exceptions or stub the browser's writer.
 const renderHistoryWrites=await page.evaluate(()=>{
  const native=history.replaceState;let writes=0;
  history.replaceState=function(...args){writes++;return native.apply(this,args);};
  try{for(let i=0;i<120;i++)studySetsReadAndRender(false);return writes;}
  finally{history.replaceState=native;}
 });
 assert.equal(renderHistoryWrites,0,'unchanged render cannot rewrite browser history');await assertSetPage();
 // Minimal rows show saved meaning immediately, and reveal examples only on tap.
 assert.equal(await page.locator('#study-sets-word-list .vex:visible').count(),0);
 const quiet=()=>wordRow('quiet');
 assert.equal(await quiet().locator('.study-sets-row-action').evaluate(node=>getComputedStyle(node).opacity),'0','per-row exclusion control is hidden until keyboard focus');
 assert.equal(await page.locator('#study-sets-import').count(),0,'management actions stay out of detail list');
 const starBefore=await page.evaluate(()=>JSON.stringify(words));
 for(const expected of [2,3,1]){await quiet().locator('.chip').click();assert.equal(await quiet().locator('.chip').innerText(),'★'.repeat(expected));assert.equal(await page.evaluate(()=>JSON.stringify(words)),starBefore,'set star cycle cannot mutate source vocabulary');assert.equal(await quiet().locator('.vword').getAttribute('aria-expanded'),'false','star click does not expand example');}
 await assertNumbers();
 const chipBefore=await quiet().locator('.chip').innerText(),chipBounds=await quiet().locator('.chip').boundingBox();
 await page.mouse.move(chipBounds.x+chipBounds.width/2,chipBounds.y+chipBounds.height/2);await page.mouse.down();
 await page.mouse.move(chipBounds.x+chipBounds.width/2-100,chipBounds.y+chipBounds.height/2,{steps:8});await page.mouse.up();
 assert.equal(await quiet().locator('.chip').innerText(),chipBefore,'drag beginning on star cannot change its rating');
 assert.equal(await rows().count(),3,'drag beginning on star cannot exclude the row');await waitTranslation(quiet(),0);
 assert.equal(await quiet().locator('.vword').getAttribute('aria-expanded'),'false','star drag does not expand the word');
 await quiet().locator('.vword').click();assert.equal(await quiet().locator('.vex').isVisible(),true);
 await quiet().locator('.vword').click();assert.equal(await quiet().locator('.vex').isVisible(),false);
 // A pre-existing selected meaning must remain a row gesture, never initiate
 // the unrelated library's native drag/drop overlay (trusted mouse events).
 await quiet().locator('.vko').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
 await dragRow(quiet(),-24,0,{inspect:true});await waitTranslation(quiet(),0);
 assert.equal(await page.locator('#drop-overlay').evaluate(node=>node.classList.contains('on')),false,'selected-text row drag cannot open library drop overlay');
 assert.equal(await rows().count(),3);
 await page.evaluate(()=>getSelection()?.removeAllRanges());
 // Short horizontal drags follow the finger but neither exclude nor become taps.
 await dragRow(quiet(),-24,0,{inspect:true});assert.equal(await rows().count(),3);
 assert.equal(await quiet().locator('.vword').getAttribute('aria-expanded'),'false','drag release must not reveal example');
 await dragRow(quiet(),-105,0,{cancel:true,inspect:true});assert.equal(await rows().count(),3,'pointer cancellation preserves membership');
 await quiet().locator('.study-sets-word-surface').evaluate(async node=>{await new Promise(resolve=>setTimeout(resolve,300));const t=getComputedStyle(node).transform;if(t!=='none'&&Math.abs(new DOMMatrixReadOnly(t).m41)>1)throw Error('cancel did not restore row');});
 // Once a vertical intent wins, later horizontal movement cannot steal scrolling.
 const vertical=await gesturePoint(quiet());const vx=vertical.x,vy=vertical.y;
 await page.mouse.move(vx,vy);await page.mouse.down();await page.mouse.move(vx-2,vy+25,{steps:4});await page.mouse.move(vx-115,vy+26,{steps:6});await page.mouse.up();
 assert.equal(await rows().count(),3,'vertical-first drag is permanently axis-locked');
 assert.equal(await quiet().locator('.vword').getAttribute('aria-expanded'),'false');
 // Synthetic touch PointerEvents supplement the trusted mouse path above.
 // They verify handlers and axis ownership, not native device scrolling physics.
 await quiet().evaluate(node=>{
  const target=node.querySelector('.vword');
  const send=(type,x,y,id)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y}));
  send('pointerdown',200,30,91);send('pointermove',198,55,91);send('pointermove',80,56,91);send('pointerup',80,56,91);
  if(!node.isConnected)throw Error('touch vertical gesture excluded the row');
  send('pointerdown',200,30,92);send('pointermove',100,31,92);send('pointercancel',100,31,92);send('pointerup',100,31,92);
 });
 assert.equal(await rows().count(),3,'touch vertical lock and cancellation preserve membership');
 await waitTranslation(quiet(),0);await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await dragRow(quiet(),-24,0,{inspect:true});
 const motion=await quiet().locator('.study-sets-word-surface').evaluate(node=>({transition:getComputedStyle(node).transitionDuration,animation:getComputedStyle(node).animationDuration}));
 for(const duration of [motion.transition,motion.animation])assert.ok(duration.split(',').every(value=>parseFloat(value)<=0.01),`reduced motion duration ${duration}`);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await quiet().locator('.vword').focus();await page.keyboard.press('Enter');
 assert.equal(await quiet().locator('.vex').isVisible(),true,'keyboard opens example');
 await page.keyboard.press('Space');assert.equal(await quiet().locator('.vex').isVisible(),false,'keyboard closes example');
 const hiddenAction=quiet().getByRole('button',{name:'quiet 세트에서 제외',exact:true});await hiddenAction.focus();
 await page.keyboard.press('Enter');await waitRows(2);assert.equal(await rows().count(),2,'keyboard fallback excludes without swipe');
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await rows().count(),3);
 await dragRow(quiet(),70);assert.equal(await rows().count(),3,'right swipe does not exclude');
 // Partial swipe parks a single circular action; the user can tap or dismiss it.
 await dragRow(quiet(),-68,0,{inspect:true});await waitTranslation(quiet(),-72);
 assert.equal(await rows().count(),3,'partial reveal does not mutate membership');
 assert.equal(await quiet().locator('.study-sets-row-action').count(),1,'exactly one swipe action');
 const parkedAction=await quiet().locator('.study-sets-row-action').boundingBox();
 assert.ok(parkedAction.width>=44&&Math.abs(parkedAction.width-parkedAction.height)<2,'parked action is a touch-sized circle');
 assert.equal(await quiet().locator('.vword').getAttribute('aria-expanded'),'false','partial swipe is not a tap');

 await quiet().getByRole('button',{name:'quiet 세트에서 제외',exact:true}).click();await waitRows(2);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();await waitRows(3);
 await dragRow(quiet(),-68);await waitTranslation(quiet(),-72);
 await rows().first().locator('.vword').click();await waitTranslation(quiet(),0);
 await rows().first().locator('.vword').click();
 await dragRow(quiet(),-68);await waitTranslation(quiet(),-72);
 await page.locator('#study-sets-title').click();await waitTranslation(quiet(),0);
 assert.equal(await rows().count(),3,'outside touch dismisses action without excluding');
 // A failed durable write never starts the exit/collapse or loses the row.
 const beforeSwipeFailure=await page.evaluate(()=>localStorage.getItem(STUDY_SETS_STORAGE));
 await page.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===STUDY_SETS_STORAGE)throw Error('Synthetic swipe quota');return window.qaSetItem.call(this,key,value);};});
 await fullSwipe(quiet(),{inspect:true,inspectAction:true});
 assert.equal(await page.locator('#study-sets-error').isVisible(),true);assert.equal(await quiet().isVisible(),true);
 assert.equal(await rows().count(),3);assert.equal(await page.evaluate(()=>localStorage.getItem(STUDY_SETS_STORAGE)),beforeSwipeFailure);
 await page.evaluate(()=>{Storage.prototype.setItem=window.qaSetItem;});
 await page.locator('#study-sets-error').getByRole('button',{name:'다시 시도'}).click();await waitRows(2);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();await waitRows(3);
 await fullSwipe(quiet(),{inspect:true,inspectAction:true});await waitRows(2);
 assert.equal(await page.locator('#study-sets-word-list .vex:visible').count(),0,'completed swipe does not tap another row');
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();await waitRows(3);
 // Start B during A's exit, then hold past A's collapse. Finalizing A must
 // preserve B's original DOM node and real pointer capture throughout the drag.
 const continuousRow=rows().first();
 const continuousBox=await gesturePoint(continuousRow),continuousX=continuousBox.x,continuousY=continuousBox.y;
 const continuousDistance=Math.max(144,continuousBox.width*.62)+20;
 await quiet().evaluate(node=>node.addEventListener('pointerup',()=>{window.qaFirstSwipeUp=performance.now();},{once:true}));
 await continuousRow.evaluate(node=>{window.qaContinuousRow=node;node.addEventListener('pointerdown',event=>{window.qaSecondSwipeDown=performance.now();window.qaSecondPointerId=event.pointerId;},{once:true});});
 await fullSwipe(quiet());
 await page.mouse.move(continuousX,continuousY);await page.mouse.down();
 const overlapDelay=await page.evaluate(()=>window.qaSecondSwipeDown-window.qaFirstSwipeUp);
 assert.ok(overlapDelay>=0&&overlapDelay<140,`second pointer must start during first exit, got ${overlapDelay}ms`);
 await page.mouse.move(continuousX-continuousDistance/2,continuousY,{steps:3});
 await page.mouse.move(continuousX-continuousDistance,continuousY,{steps:3});
 await page.waitForTimeout(400);
 const held=await page.evaluate(()=>({connected:window.qaContinuousRow.isConnected,captured:window.qaContinuousRow.hasPointerCapture(window.qaSecondPointerId),rows:document.querySelectorAll('#study-sets-word-list > li').length}));
 assert.deepEqual(held,{connected:true,captured:true,rows:2},'first exit must not replace or cancel the second held gesture');
 await page.mouse.up();await waitRows(1);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();await waitRows(2);
 assert.equal(await quiet().count(),0,'undo of second swipe does not silently restore first');
 assert.equal(await page.evaluate(()=>JSON.stringify(words)),sourceBefore,'all gesture and undo paths preserve source vocabulary');
 await page.evaluate(()=>{words.q2={word:'quiet',ko:'조용한',book:'B',addedAt:10};words.swift={word:'swift',ko:'빠른',book:'A',addedAt:11};words.other={word:'wind',ko:'바람의 기운',book:'B',addedAt:12};studySetsReadAndRender();});
 assert.match(await page.locator('#study-sets-import').innerText(),/2개/);await page.locator('#study-sets-import').click();
 assert.equal(await page.locator('#study-sets-word-list li').count(),4);
 await openHomeMenu('keyboard');
 await page.evaluate(()=>{studySetsCloseEditMenu(false,true);studySetsGo('excluded');});assert.equal(await page.locator('#study-sets-excluded-list li').count(),1);
 await page.getByRole('button',{name:'quiet 다시 담기',exact:true}).click();await closeSheet();await page.locator('.study-sets-home-card[data-set-id]').first().click();
 assert.equal(await page.locator('#study-sets-word-list li').count(),5);
 await openHomeMenu();await page.getByRole('menuitem',{name:'이름 변경',exact:true}).click();await page.locator('#study-sets-rename-input').fill('중간고사 단어');await page.getByRole('button',{name:'이름 저장',exact:true}).click();
 await openHomeMenu('keyboard');await page.getByRole('menuitem',{name:'세트 삭제',exact:true}).click();await page.getByRole('button',{name:'취소',exact:true}).click();
 await closeSheet();await page.locator('.study-sets-home-card[data-set-id]').first().click();assert.equal(await page.locator('#study-sets-title').innerText(),'중간고사 단어');
 await page.evaluate(()=>{words={};saveWords();renderVocab();});
 assert.equal(await page.locator('#study-sets-word-list li').count(),5,'source deletion preserves captured content');
 await page.locator('#study-sets-start').click();assert.equal(await page.locator('#study-sets-progress').innerText(),'1 / 5');
 assert.equal(await page.locator('#study-sets-answer').isVisible(),false);
 await page.locator('#study-sets-reveal').click();assert.equal(await page.locator('#study-sets-answer').innerText(),'바람');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'study-sets-answer');
 // Failure must leave the revealed answer and the exact durable value retryable.
 const rawBefore=await page.evaluate(()=>localStorage.getItem(STUDY_SETS_STORAGE));
 await page.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===STUDY_SETS_STORAGE)throw Error('Synthetic quota');return window.qaSetItem.call(this,key,value);};});
 await page.locator('#study-sets-grade-repeat').click();assert.equal(await page.locator('#study-sets-error').isVisible(),true);assert.equal(await page.locator('#study-sets-answer').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem(STUDY_SETS_STORAGE)),rawBefore);
 await page.evaluate(()=>{Storage.prototype.setItem=window.qaSetItem;});await page.locator('#study-sets-error').getByRole('button',{name:'다시 시도'}).click();
 assert.equal(await page.locator('#study-sets-progress').innerText(),'2 / 5');
 await closeSheet();
 await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>{show('vocab');openStudySetsDirectory();});await page.locator('.study-sets-home-card[data-set-id]').click();
 await page.evaluate(()=>{words.late={word:'later',ko:'나중에',book:'A',addedAt:20};saveWords();studySetsReadAndRender();});
 assert.match(await page.locator('#study-sets-import').innerText(),/1개/);await page.locator('#study-sets-import').click();
 await page.locator('#study-sets-start').click();assert.equal(await page.locator('#study-sets-progress').innerText(),'2 / 5');
 await context.setOffline(true);
 for(let i=0;i<4;i++){await page.locator('#study-sets-reveal').click();await page.locator('#study-sets-grade-remembered').click();}
 assert.match(await page.locator('.study-sets-result').innerText(),/5개 중 기억나요 4개/);
 await page.locator('#study-sets-repeat-round').click();assert.equal(await page.locator('#study-sets-progress').innerText(),'1 / 1');
 await page.locator('#study-sets-reveal').click();await page.locator('#study-sets-grade-remembered').click();
 await page.getByRole('button',{name:'전체 새로 학습',exact:true}).click();assert.equal(await page.locator('#study-sets-progress').innerText(),'1 / 6');
 await context.setOffline(false);
 await page.evaluate(()=>{const state=readStudySets(),result=BreezeStudySets.rename(state,state.sets[0].id,'아주 긴 시험 범위 이름과 저장된 단어를 확인하는 학습 세트 '.repeat(3).slice(0,100),Date.now());commitStudySets(result.state);studySetsReadAndRender();});
 const layouts=[];
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();},dark);
  await assertSetPage();
  const bounds=await page.locator('#v-memory-set').evaluate(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,width:node.clientWidth,scrollWidth:node.scrollWidth,height:node.getBoundingClientRect().height}));
  assert.ok(bounds.left>=-1&&bounds.right<=width+1&&bounds.scrollWidth<=bounds.width+1&&bounds.height<=height+1,JSON.stringify({width,height,dark,bounds}));
  for(const selector of ['.study-sets-sheet','#study-sets-content'])assert.equal(await page.locator(selector).evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,`${selector} overflows at ${width}x${height}`);
  for(const selector of ['#study-sets-back','#study-sets-reveal']){
   await page.locator(selector).scrollIntoViewIfNeeded();const control=await page.locator(selector).boundingBox();
   assert.ok(control.x>=0&&control.y>=0&&control.x+control.width<=width+1&&control.y+control.height<=height+1,JSON.stringify({selector,width,height,control}));
   assert.ok(control.width>=44&&control.height>=44,`${selector} touch target`);
  }
  await page.screenshot({path:`${proof}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}-study.png`,fullPage:true});layouts.push({width,height,dark,bounds});
 }
 await page.locator('#study-sets-back').click();await page.screenshot({path:`${proof}/${engine.name()}-detail.png`,fullPage:true});
 await page.goBack();await assertDirectory();
 await page.goForward();await assertSetPage();
 await closeSheet();
 await dismissDirectory();await page.evaluate(()=>{show('home');show('vocab');openStudySetsDirectory();openStudySet(readStudySets().sets[0].id);});
 await page.evaluate(()=>history.go(-3));await page.waitForFunction(()=>activeAppView()==='home'&&!document.querySelector('dialog[open]'));
 await page.evaluate(()=>history.go(3));await page.waitForFunction(()=>activeAppView()==='memory-set'&&!document.querySelector('dialog[open]'));
 assert.equal(await page.locator('#study-sets-word-list').isVisible(),true);
 // Very long captured expressions must not grow Undo over the short-screen CTA.
 const longExpression='a deliberately long captured expression '.repeat(80).trim();
 await page.evaluate(expression=>{words.longPhrase={word:expression,ko:'긴 표현',book:'A',addedAt:30};saveWords();studySetsReadAndRender();},longExpression);
 assert.match(await page.locator('#study-sets-import').innerText(),/1개/);await page.locator('#study-sets-import').click();
 const countWithPhrase=await rows().count();
 await page.setViewportSize({width:844,height:390});
 await page.getByRole('button',{name:longExpression+' 세트에서 제외',exact:true}).focus();await page.keyboard.press('Enter');await waitRows(countWithPhrase-1);
 assert.equal(await rows().count(),countWithPhrase-1);
 const undoLayout=await page.locator('.study-sets-undo > span').evaluate(node=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node);return {height:r.height,width:r.width,scrollWidth:node.scrollWidth,lineHeight:parseFloat(style.lineHeight),overflow:style.overflow,textOverflow:style.textOverflow};});
 assert.ok(undoLayout.height<=undoLayout.lineHeight+1&&undoLayout.scrollWidth>undoLayout.width,JSON.stringify(undoLayout));
 assert.equal(undoLayout.textOverflow,'ellipsis');
 const shortCTA=await page.locator('#study-sets-start').boundingBox();
 assert.ok(shortCTA.x>=0&&shortCTA.y>=0&&shortCTA.x+shortCTA.width<=845&&shortCTA.y+shortCTA.height<=391,JSON.stringify(shortCTA));
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await rows().count(),countWithPhrase,'long expression Undo restores membership');
 await openHomeMenu();await page.getByRole('menuitem',{name:'세트 삭제',exact:true}).click();await page.getByRole('button',{name:'세트 삭제',exact:true}).click();
 assert.equal(await page.locator('.study-sets-home-card[data-set-id]').count(),0);
 assert.equal(await page.evaluate(()=>words.late.ko),'나중에','set deletion preserves source word');
 await assertDirectory();await page.locator('#study-sets-home-create').click();await page.locator('#study-sets-name').fill('취소할 입력');await page.locator('#study-sets-back').click();await assertDirectory();
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('study-sets-dialog').open&&!studySetsUI.pendingClose);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'wordbook-review','closing the one sheet restores its vocabulary opener');
 // Review images use synthetic sample vocabulary in the actual shipped app.
 // They are screenshots of this source, never image-generated mockups.
 await page.evaluate(()=>{
  const fixtures=[['observe','관찰하다','She stopped to observe the room.'],['evidence','증거','There was no evidence of a struggle.'],['remarkable','놀라운','It was a remarkable discovery.'],['peculiar','특이한','He had a peculiar habit.'],['hesitate','망설이다','Do not hesitate to ask.'],['sufficient','충분한','We have sufficient time.'],['sensible','분별 있는','That seems a sensible choice.'],['deduce','추론하다','What can you deduce from this?'],['reliable','신뢰할 수 있는','We need a reliable source.'],['emerge','나타나다','A new idea began to emerge.'],['maintain','유지하다','They maintain a close relationship.'],['perspective','관점','Consider a different perspective.']];
  words=Object.fromEntries(fixtures.map(([word,ko,example],i)=>[word,{word,ko,example,book:i<8?'The Adventures of Sherlock Holmes':'이번 주 읽은 기사',status:1,addedAt:i+1}]));saveWords();
  let state=readStudySets();state=BreezeStudySets.create(state,{name:'중간고사 · 1–3과',bookTitles:['The Adventures of Sherlock Holmes']},words,100).state;
  state=BreezeStudySets.create(state,{name:'이번 주 읽은 글',bookTitles:['이번 주 읽은 기사']},words,101).state;commitStudySets(state);show('vocab');openStudySetsDirectory();darkMode=false;applyDark();
 });
 // Populate an actual scrollable directory to verify page Back restores its
 // prior position. Remove only this synthetic fixture before review captures.
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{window.qaBeforeScrollSets=readStudySets();let state=window.qaBeforeScrollSets;for(let i=0;i<18;i++)state=BreezeStudySets.create(state,{name:'스크롤 확인 '+(i+1),bookTitles:['The Adventures of Sherlock Holmes']},words,200+i).state;commitStudySets(state);renderStudySetsHome();});
 await page.locator('.study-sets-home-card[data-set-id]').last().scrollIntoViewIfNeeded();
 const vocabularyScroll=await page.evaluate(()=>window.scrollY);
 const homeScroll=await page.locator('#study-sets-content').evaluate(node=>node.scrollTop);assert.ok(homeScroll>100,'directory fixture must really scroll');
 await page.locator('.study-sets-home-card[data-set-id]').last().click();await assertSetPage();
 await closeSheet();await page.waitForFunction(expected=>Math.abs(document.getElementById('study-sets-content').scrollTop-expected)<2,homeScroll);assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-vocabularyScroll)<2,'sheet return preserves underlying vocabulary scroll');
 await page.evaluate(()=>{readStudySets();commitStudySets(window.qaBeforeScrollSets);delete window.qaBeforeScrollSets;renderStudySetsHome();studySetsUI.body.scrollTop=0;});
 await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0);
 assert.match(await page.locator('#study-sets-home-create').innerText(),/세트 추가/);
 assert.equal(await page.locator('#study-sets-home-create').evaluate(node=>getComputedStyle(node).borderTopStyle),'dashed');
 const addCardBounds=await page.locator('#study-sets-home-create').boundingBox(),setCardBounds=await page.locator('.study-sets-home-card[data-set-id]').first().boundingBox();
 assert.ok(Math.abs(addCardBounds.height-setCardBounds.height)<2,'add card matches set card size');
 const defaultStyle=await originalVocabularyStyle({captureEntry:true});await page.mouse.move(0,0);
 await page.screenshot({path:`${proof}/ui-set-home-${engine.name()}-phone-light.png`,fullPage:false});
 await page.locator('.study-sets-home-card[data-set-id]').first().click();await assertSetPage();
 const setGroup=page.locator('#study-sets-word-list .vgroup').filter({has:page.locator('.vword',{hasText:'remarkable'})});
 assert.deepEqual(await vocabularyStyle(setGroup),defaultStyle.style,'set words, meanings and stars reuse actual default vocabulary styles');
 const setGeometry=await vocabularyGeometry(setGroup);recordRowMetrics({viewport:page.viewportSize(),dark:false,original:defaultStyle.geometry,set:setGeometry});assertGeometry(setGeometry,defaultStyle.geometry,'phone capture');
 // The original renderer owns wrapping; the ordinal is its only added gutter.
 await page.mouse.move(0,0);await page.screenshot({path:`${proof}/ui-set-detail-${engine.name()}-phone-light.png`,fullPage:true});
 // Gesture references use trusted pointer input; cancel preserves fixture data.
 await dragRow(rows().first(),-68);await waitTranslation(rows().first(),-72);
 await page.screenshot({path:`${proof}/ui-set-swipe-circle-${engine.name()}-phone-light.png`,fullPage:true});
 await page.locator('#study-sets-title').click();await waitTranslation(rows().first(),0);
 await fullSwipe(rows().first(),{cancel:true,inspect:true,inspectAction:true,capture:`${proof}/ui-set-swipe-capsule-${engine.name()}-phone-light.png`});
 await waitTranslation(rows().first(),0);assert.equal(await rows().count(),8,'capture cancellation preserves sample set');
 await page.locator('#study-sets-word-list .vword').first().click();
 await page.screenshot({path:`${proof}/ui-set-example-${engine.name()}-phone-light.png`,fullPage:true});
 await closeSheet();
 await page.setViewportSize({width:820,height:1180});
 await page.screenshot({path:`${proof}/ui-set-home-${engine.name()}-tablet-light.png`,fullPage:false});
 await page.locator('.study-sets-home-card[data-set-id]').first().click();
 await page.screenshot({path:`${proof}/ui-set-detail-${engine.name()}-tablet-light.png`,fullPage:true});
 await closeSheet();
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();window.scrollTo(0,0);},dark);
  assert.equal(await page.locator('#study-sets-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,`Memory home overflow ${width}x${height}`);
  await page.locator('#study-sets-dialog').waitFor({state:'visible'});
  const matrixDefaultStyle=await originalVocabularyStyle();
  // Read one layout snapshot; dialog's native close event may refresh the home
  // between separate element-handle measurements without changing its layout.
  const homeBounds=await page.locator('#study-sets-dialog').evaluate(node=>Array.from(node.querySelectorAll('.study-sets-home-card'),card=>{const r=card.getBoundingClientRect();return {x:r.x,width:r.width,height:r.height};}));
  assert.equal(homeBounds.length,4);
  for(const bounds of homeBounds)assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.height>=44,JSON.stringify({width,height,bounds}));
  await page.locator('#study-sets-home-create').scrollIntoViewIfNeeded();
  const add=await page.locator('#study-sets-home-create').boundingBox(),scrollArea=await page.locator('#study-sets-content').boundingBox();
  assert.ok(add.y>=scrollArea.y-1&&add.y+add.height<=scrollArea.y+scrollArea.height+1,'last directory action scrolls fully inside same sheet');
  await page.locator('#study-sets-content').evaluate(node=>{node.scrollTop=0;});
  await page.screenshot({path:`${proof}/home-${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:false});
  await page.locator('.study-sets-home-card[data-set-id]').first().click();await assertSetPage();await assertNumbers();
  const matrixSetGroup=page.locator('#study-sets-word-list .vgroup').filter({has:page.locator('.vword',{hasText:'remarkable'})});assert.deepEqual(await vocabularyStyle(matrixSetGroup),matrixDefaultStyle.style,`actual vocabulary style parity ${width}x${height} ${dark}`);
  const matrixGeometry=await vocabularyGeometry(matrixSetGroup);recordRowMetrics({width,height,dark,original:matrixDefaultStyle.geometry,set:matrixGeometry});assertGeometry(matrixGeometry,matrixDefaultStyle.geometry,`${width}x${height} dark=${dark}`);
  for(const selector of ['.study-sets-sheet','#study-sets-content'])assert.equal(await page.locator(selector).evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,`Detail overflow ${selector} ${width}x${height}`);
  const opaque=await page.locator('.study-sets-sheet').evaluate(node=>{const color=getComputedStyle(node).backgroundColor;return color.startsWith('rgb(')||color.startsWith('color(')&&/\/\s*1\s*\)$/.test(color)||color.startsWith('rgba(')&&/[,/]\s*1\s*\)$/.test(color);});
  assert.equal(opaque,true,'set page must have an opaque background');
  for(const selector of ['#study-sets-back','#study-sets-start','#study-sets-word-list .vgroup']){
   const control=page.locator(selector).first();await control.scrollIntoViewIfNeeded();const bounds=await control.boundingBox();
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1&&bounds.width>=44&&bounds.height>=44,JSON.stringify({selector,width,height,bounds}));
  }
  const noOverlap=await page.evaluate(()=>{const body=document.getElementById('study-sets-content').getBoundingClientRect(),footer=document.querySelector('.study-sets-footer').getBoundingClientRect();return body.bottom<=footer.top+1;});
  assert.equal(noOverlap,true,`bottom action overlaps scrolling content ${width}x${height}`);
  await page.locator('#study-sets-word-list .vgroup').last().scrollIntoViewIfNeeded();
  const last=await page.locator('#study-sets-word-list .vgroup').last().boundingBox(),start=await page.locator('#study-sets-start').boundingBox();
  assert.ok(last.y+last.height<=start.y+1,`last word is obscured by bottom action ${width}x${height}`);
  await page.locator('#study-sets-content').evaluate(node=>{node.scrollTop=0;});
  await page.screenshot({path:`${proof}/detail-${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});
  await closeSheet();
 }
 // Real snapshot rows, not modified ordinal text: check 999 and 1000 in the
 // original row gutter while preserving the default long-word wrapping geometry.
 const largeSetId=await page.evaluate(()=>{
  const word='pneumonoultramicroscopicsilicovolcanoconiosis';
  words={layoutReference:{word,ko:'뜻 1000',book:'Layout',status:1}};saveWords();
  const source=Object.fromEntries(Array.from({length:1001},(_,i)=>['layout'+i,{word,ko:'뜻 '+(i+1),book:'Layout',status:1,addedAt:i}]));
  const result=BreezeStudySets.create(readStudySets(),{name:'숫자 너비 확인',bookTitles:['Layout']},source,500);commitStudySets(result.state);show('vocab');return result.set.id;
 });
 for(const width of [390,320,820]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>{show('vocab');window.scrollTo(0,0);});
  const original=await vocabularyGeometry(page.locator('#v-vocab .vgroup').first());
  await page.locator('#wordbook-review').click();
  await page.locator('.study-sets-home-card[data-set-id]').filter({hasText:'숫자 너비 확인'}).click();await assertSetPage();
  assert.equal(await page.evaluate(()=>studySetsUI.setId),largeSetId);assert.equal(await rows().count(),1001);await assertNumbers();
  for(const ordinal of [999,1000]){
   const row=rows().nth(ordinal-1);await row.scrollIntoViewIfNeeded();
   const bounds=await row.evaluate(node=>{const number=node.querySelector('.vordinal').getBoundingClientRect(),word=node.querySelector('.vword').getBoundingClientRect();return {number:{left:number.left,right:number.right,width:number.width},word:{left:word.left,right:word.right}};});
   assert.ok(bounds.number.left>=0&&bounds.number.right<=bounds.word.left-1,JSON.stringify({width,ordinal,bounds}));
   assert.equal(await row.locator('.vordinal').innerText(),String(ordinal));
   const geometry=await vocabularyGeometry(row.locator('.vgroup'));recordRowMetrics({width,ordinal,original,set:geometry,bounds});assertGeometry(geometry,original,`${width}px ordinal ${ordinal}`);
  }
  await closeSheet();
 }
 assert.deepEqual(errors,[]);
 // Chromium supports automated service-worker cold launches. Native bundles
 // independently include these same files; WebKit above verifies offline study.
 if(engine===chromium){
  const offline=await browser.newContext({serviceWorkers:'allow'});
  try{
   await offline.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
   await offline.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
   const warm=await offline.newPage();await warm.goto(url);await warm.evaluate(()=>homeReady);
   await warm.evaluate(async()=>{
    const result=BreezeStudySets.create(readStudySets(),{name:'오프라인 세트',bookTitles:['Offline']},{cached:{word:'resilient',ko:'회복력이 있는',book:'Offline',example:'A resilient reader.'}},100);
    commitStudySets(result.state);words={};saveWords();
    await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;
   });
   await warm.close();await offline.setOffline(true);
   const cold=await offline.newPage();await cold.goto(url);await cold.evaluate(()=>homeReady);
   await cold.evaluate(()=>{show('vocab');openStudySetsDirectory();});await cold.locator('.study-sets-home-card[data-set-id]').click();await cold.locator('#study-sets-start').click();await cold.locator('#study-sets-reveal').click();
   assert.equal(await cold.locator('#study-sets-answer').innerText(),'회복력이 있는');await cold.locator('#study-sets-grade-remembered').click();
   await cold.reload();await cold.evaluate(()=>homeReady);await cold.evaluate(()=>{show('vocab');openStudySetsDirectory();});await cold.locator('.study-sets-home-card[data-set-id]').click();await cold.locator('#study-sets-start').click();
   assert.match(await cold.locator('.study-sets-result').innerText(),/기억나요 1개/);
   await cold.screenshot({path:`${proof}/chromium-cold-offline.png`,fullPage:true});
  }finally{await offline.close();}
 }
 writeFileSync(`${proof}/${engine.name()}.json`,JSON.stringify({engine:engine.name(),checks:'create/dedup/finger-follow/circle-capsule/partial-reveal/action-tap/outside-dismiss/swipe-quota/axis-lock/cancel/swipe-click-suppression/repeated-undo/tap-examples/detail-ellipsis/keyboard-menu/restore/import/exclusions/source-deletion/reload/offline/rounds/quota/history/delete/reduced-motion/snapshot-stars/style-parity/bottom-action-layout/page-navigation/home-scroll/row-numbering',layouts,rowMetrics,errors},null,2));
 console.log(`${engine.name()}: study sets lifecycle, offline snapshots, failure recovery, history, 10 light/dark layouts passed`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
