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
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
let browser;
try{
 browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
 await page.goto(url);await page.evaluate(()=>homeReady);await page.locator('#nav-vocab').click();
 assert.equal(await page.evaluate(()=>activeAppView()),'memory');
 await page.locator('#study-sets-all').click();assert.equal(await page.evaluate(()=>activeAppView()),'vocab');
 await page.locator('#wordbook-sets-back').click();assert.equal(await page.evaluate(()=>activeAppView()),'memory');
 await page.locator('#study-sets-home-create').click();
 assert.equal(await page.locator('#study-sets-save').isDisabled(),true);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('study-sets-dialog').open);
 await page.waitForFunction(()=>!studySetsUI.pendingClose);
 await page.evaluate(()=>{
  words={a:{word:'wind',ko:'바람',book:'A',example:'A cold wind blew.',addedAt:1,status:1},
   duplicate:{word:'wind',ko:'바람',book:'B',example:'The wind rose.',addedAt:2,status:3},
   sense:{word:'wind',ko:'감다',book:'B',example:'Wind the clock.',addedAt:3,status:2},
   q:{word:'quiet',ko:'조용한',book:'A',example:'A quiet room.',addedAt:4,status:1},
   manual:{word:'manual',ko:'수동의',book:'',addedAt:5,status:1},pending:{word:'pending',ko:'',book:'A'}};
  saveWords();renderVocab();
 });
 const sourceBefore=await page.evaluate(()=>JSON.stringify(words));
 await page.locator('#study-sets-home-create').click();
 await page.locator('#study-sets-name').fill('이번 시험 <safe>');
 await page.locator('.study-sets-book input[value="A"]').check();await page.locator('.study-sets-book input[value="B"]').check();
 assert.match(await page.locator('#study-sets-selection-count').innerText(),/3개/);
 await page.locator('#study-sets-save').click();assert.equal(await page.locator('#study-sets-word-list li').count(),3);
 assert.equal(await page.evaluate(()=>JSON.stringify(words)),sourceBefore);
 assert.equal(await page.locator('#study-sets-title').innerText(),'이번 시험 <safe>');
 await page.getByRole('button',{name:'quiet 세트에서 제외',exact:true}).click();assert.equal(await page.locator('#study-sets-word-list li').count(),2);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await page.locator('#study-sets-word-list li').count(),3);
 const swipeRow=page.locator('#study-sets-word-list li').filter({hasText:'quiet'}),box=await swipeRow.boundingBox();
 await page.mouse.move(box.x+box.width*.65,box.y+20);await page.mouse.down();await page.mouse.move(box.x+10,box.y+20,{steps:8});await page.mouse.up();
 assert.equal(await page.locator('#study-sets-word-list li').count(),2,'left swipe excludes only this set');
 await page.evaluate(()=>{words.q2={word:'quiet',ko:'조용한',book:'B',addedAt:10};words.swift={word:'swift',ko:'빠른',book:'A',addedAt:11};words.other={word:'wind',ko:'바람의 기운',book:'B',addedAt:12};studySetsReadAndRender();});
 assert.match(await page.locator('#study-sets-import').innerText(),/2개/);await page.locator('#study-sets-import').click();
 assert.equal(await page.locator('#study-sets-word-list li').count(),4);
 await page.getByRole('button',{name:'제외한 단어 1개',exact:true}).click();assert.equal(await page.locator('#study-sets-excluded-list li').count(),1);
 await page.getByRole('button',{name:'quiet 다시 담기',exact:true}).click();await page.locator('#study-sets-back').click();
 assert.equal(await page.locator('#study-sets-word-list li').count(),5);
 await page.getByRole('button',{name:'이름 변경',exact:true}).click();await page.locator('#study-sets-rename-input').fill('중간고사 단어');await page.getByRole('button',{name:'이름 저장',exact:true}).click();
 await page.getByRole('button',{name:'세트 삭제',exact:true}).click();await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.locator('#study-sets-title').innerText(),'중간고사 단어');
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
 await page.locator('#study-sets-close').click();await page.waitForFunction(()=>!studySetsUI.pendingClose);
 await page.reload();await page.evaluate(()=>homeReady);await page.evaluate(()=>show('memory'));await page.locator('.study-sets-home-card[data-set-id]').click();
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
 await page.evaluate(()=>{const state=readStudySets(),result=BreezeStudySets.rename(state,state.sets[0].id,'아주 긴 시험 범위 이름과 저장된 단어를 확인하는 학습 세트 '.repeat(3),Date.now());commitStudySets(result.state);studySetsReadAndRender();});
 const layouts=[];
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();},dark);
  const bounds=await page.locator('#study-sets-dialog').evaluate(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,width:node.clientWidth,scrollWidth:node.scrollWidth,height:node.getBoundingClientRect().height}));
  assert.ok(bounds.left>=-1&&bounds.right<=width+1&&bounds.scrollWidth<=bounds.width+1&&bounds.height<=height+1,JSON.stringify({width,height,dark,bounds}));
  for(const selector of ['.study-sets-sheet','#study-sets-content'])assert.equal(await page.locator(selector).evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,`${selector} overflows at ${width}x${height}`);
  for(const selector of ['#study-sets-close','#study-sets-reveal']){
   await page.locator(selector).scrollIntoViewIfNeeded();const control=await page.locator(selector).boundingBox();
   assert.ok(control.x>=0&&control.y>=0&&control.x+control.width<=width+1&&control.y+control.height<=height+1,JSON.stringify({selector,width,height,control}));
   assert.ok(control.width>=44&&control.height>=44,`${selector} touch target`);
  }
  await page.screenshot({path:`${proof}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}-study.png`,fullPage:true});layouts.push({width,height,dark,bounds});
 }
 await page.locator('#study-sets-back').click();await page.screenshot({path:`${proof}/${engine.name()}-detail.png`,fullPage:true});
 await page.goBack();await page.waitForFunction(()=>!document.getElementById('study-sets-dialog').open);assert.equal(await page.evaluate(()=>activeAppView()),'memory');
 await page.goForward();await page.waitForFunction(()=>document.getElementById('study-sets-dialog').open);
 await page.locator('#study-sets-close').click();await page.waitForFunction(()=>!studySetsUI.pendingClose);
 await page.evaluate(()=>{show('home');show('memory');openStudySet(readStudySets().sets[0].id);});
 await page.evaluate(()=>history.go(-2));await page.waitForFunction(()=>activeAppView()==='home'&&!document.getElementById('study-sets-dialog').open);
 await page.evaluate(()=>history.go(2));await page.waitForFunction(()=>activeAppView()==='memory'&&document.getElementById('study-sets-dialog').open);
 assert.equal(await page.locator('#study-sets-word-list').isVisible(),true);
 await page.getByRole('button',{name:'세트 삭제',exact:true}).click();await page.getByRole('button',{name:'세트 삭제',exact:true}).click();
 assert.equal(await page.locator('[data-set-id]').count(),0);
 assert.equal(await page.evaluate(()=>words.late.ko),'나중에','set deletion preserves source word');
 await page.waitForFunction(()=>!studySetsUI.pendingClose);await page.locator('#study-sets-home-create').click();await page.locator('#study-sets-name').fill('취소할 입력');await page.keyboard.press('Escape');await page.waitForFunction(()=>!studySetsUI.pendingClose);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'study-sets-home-create');
 // Review images use synthetic sample vocabulary in the actual shipped app.
 // They are screenshots of this source, never image-generated mockups.
 await page.evaluate(()=>{
  const fixtures=[['observe','관찰하다','She stopped to observe the room.'],['evidence','증거','There was no evidence of a struggle.'],['remarkable','놀라운','It was a remarkable discovery.'],['peculiar','특이한','He had a peculiar habit.'],['hesitate','망설이다','Do not hesitate to ask.'],['sufficient','충분한','We have sufficient time.'],['sensible','분별 있는','That seems a sensible choice.'],['deduce','추론하다','What can you deduce from this?'],['reliable','신뢰할 수 있는','We need a reliable source.'],['emerge','나타나다','A new idea began to emerge.'],['maintain','유지하다','They maintain a close relationship.'],['perspective','관점','Consider a different perspective.']];
  words=Object.fromEntries(fixtures.map(([word,ko,example],i)=>[word,{word,ko,example,book:i<8?'The Adventures of Sherlock Holmes':'이번 주 읽은 기사',status:1,addedAt:i+1}]));saveWords();
  let state=readStudySets();state=BreezeStudySets.create(state,{name:'중간고사 · 1–3과',bookTitles:['The Adventures of Sherlock Holmes']},words,100).state;
  state=BreezeStudySets.create(state,{name:'이번 주 읽은 글',bookTitles:['이번 주 읽은 기사']},words,101).state;commitStudySets(state);show('memory');darkMode=false;applyDark();
 });
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`${proof}/ui-set-home-${engine.name()}-phone-light.png`,fullPage:true});
 await page.locator('.study-sets-home-card[data-set-id]').first().click();
 await page.screenshot({path:`${proof}/ui-set-detail-${engine.name()}-phone-light.png`,fullPage:true});
 await page.locator('#study-sets-close').click();await page.waitForFunction(()=>!studySetsUI.pendingClose);
 await page.setViewportSize({width:820,height:1180});
 await page.screenshot({path:`${proof}/ui-set-home-${engine.name()}-tablet-light.png`,fullPage:true});
 await page.locator('.study-sets-home-card[data-set-id]').first().click();
 await page.screenshot({path:`${proof}/ui-set-detail-${engine.name()}-tablet-light.png`,fullPage:true});
 await page.locator('#study-sets-close').click();await page.waitForFunction(()=>!studySetsUI.pendingClose);
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.evaluate(value=>{darkMode=value;applyDark();window.scrollTo(0,0);},dark);
  assert.equal(await page.locator('#v-memory').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,`Memory home overflow ${width}x${height}`);
  for(const card of await page.locator('.study-sets-home-card').all()){
   const bounds=await card.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.height>=44,JSON.stringify({width,height,bounds}));
  }
  await page.screenshot({path:`${proof}/home-${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});
  await page.locator('.study-sets-home-card[data-set-id]').first().click();
  for(const selector of ['.study-sets-sheet','#study-sets-content'])assert.equal(await page.locator(selector).evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,`Detail overflow ${selector} ${width}x${height}`);
  for(const selector of ['#study-sets-close','#study-sets-start','#study-sets-word-list .study-sets-row-action']){
   const control=page.locator(selector).first();await control.scrollIntoViewIfNeeded();const bounds=await control.boundingBox();
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1&&bounds.width>=44&&bounds.height>=44,JSON.stringify({selector,width,height,bounds}));
  }
  await page.screenshot({path:`${proof}/detail-${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`,fullPage:true});
  await page.locator('#study-sets-close').click();await page.waitForFunction(()=>!studySetsUI.pendingClose);
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
   await cold.evaluate(()=>show('memory'));await cold.locator('.study-sets-home-card[data-set-id]').click();await cold.locator('#study-sets-start').click();await cold.locator('#study-sets-reveal').click();
   assert.equal(await cold.locator('#study-sets-answer').innerText(),'회복력이 있는');await cold.locator('#study-sets-grade-remembered').click();
   await cold.reload();await cold.evaluate(()=>homeReady);await cold.evaluate(()=>show('memory'));await cold.locator('.study-sets-home-card[data-set-id]').click();await cold.locator('#study-sets-start').click();
   assert.match(await cold.locator('.study-sets-result').innerText(),/기억나요 1개/);
   await cold.screenshot({path:`${proof}/chromium-cold-offline.png`,fullPage:true});
  }finally{await offline.close();}
 }
 writeFileSync(`${proof}/${engine.name()}.json`,JSON.stringify({engine:engine.name(),checks:'create/dedup/swipe/undo/restore/import/exclusions/source-deletion/reload/offline/rounds/quota/history/delete/accessibility/layout',layouts,errors},null,2));
 console.log(`${engine.name()}: study sets lifecycle, offline snapshots, failure recovery, history, 10 light/dark layouts passed`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
