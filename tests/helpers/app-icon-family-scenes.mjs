import assert from 'node:assert/strict';

// These contracts describe the base reveal/grade flow only. Progress text and
// swipe mechanics belong to their own tests and can evolve independently.
const studyHidden=['#study-sets-close','#study-sets-reveal','#study-sets-answer','#study-sets-grade-repeat','#study-sets-grade-remembered','.study-sets-complete'];
const folderSummary='#v-longform .library-folder-menu>summary';
const folderActions='#v-longform .library-folder-actions';
export const appFamilyScenes=Object.freeze({
 home:{visible:['#nav-settings','#home-add'],hidden:['#set-close','#am-close']},
 settings:{visible:['#set-close'],hidden:['#am-close']},
 'add-sheet':{visible:['#am-close'],hidden:['#set-close']},
 wordbook:{visible:['#btn-export','#wordbook-add'],hidden:['#wordbook-add-form .task-close']},
 'word-add':{visible:['#wordbook-add-form .task-close'],hidden:['#study-sets-close']},
 'study-directory':{visible:['#study-sets-close','#study-sets-all','#study-sets-home-create'],hidden:['#study-sets-back','#study-sets-edit']},
 'study-create':{visible:['#study-sets-back','#study-sets-close','#study-sets-name'],hidden:['#study-sets-edit','#study-sets-all']},
 'study-detail':{visible:['#study-sets-back','#study-sets-edit','#study-sets-start'],hidden:['#study-sets-close','#study-sets-edit-menu']},
 'study-more':{visible:['#study-sets-back','#study-sets-edit-menu','#study-sets-edit-menu [role="menuitem"]:nth-child(1)','#study-sets-edit-menu [role="menuitem"]:nth-child(2)','#study-sets-edit-menu [role="menuitem"]:nth-child(3)'],hidden:['#study-sets-close']},
 'study-front':{visible:['#study-sets-back','#study-sets-expression','#study-sets-reveal'],hidden:studyHidden.filter(s=>s!=='#study-sets-reveal')},
 'study-revealed':{visible:['#study-sets-back','#study-sets-answer','#study-sets-grade-repeat','#study-sets-grade-remembered'],hidden:['#study-sets-close','#study-sets-reveal','.study-sets-complete']},
 'study-completion':{visible:['#study-sets-back','.study-sets-complete'],hidden:studyHidden.filter(s=>s!=='.study-sets-complete')},
 'book-info':{visible:['#ed-close'],hidden:['#task-form .task-close']},
 'task-sheet':{visible:['#task-form .task-close'],hidden:['#ed-close']},
 'article-preview':{visible:['.ap-close'],hidden:['#task-form .task-close']},
 folders:{visible:['#v-longform .library-folder-add',folderSummary],hidden:[folderActions]},
 'folders-open':{visible:['#v-longform .library-folder-add',folderSummary,folderActions,folderActions+' button:nth-child(1)',folderActions+' button:nth-child(2)'],hidden:['#task-form .task-close']},
});

export async function assertAppFamilyScene(page,scene){
 const expected=appFamilyScenes[scene];assert.ok(expected,'explicit scene contract: '+scene);
 const observed={visible:[],hidden:[]};
 for(const selector of expected.visible){
  assert.equal(await page.locator(selector+':visible').count(),1,scene+' requires exactly one visible '+selector);
  observed.visible.push(selector);
 }
 for(const selector of expected.hidden){
  assert.equal(await page.locator(selector+':visible').count(),0,scene+' requires hidden '+selector);
  observed.hidden.push(selector);
 }
 return observed;
}

export async function createAppFamilyFolder(page){
 await page.evaluate(()=>{show('longform');if(!foldersFor('longform').some(f=>f.name==='Icon review folder'))createLibraryFolder('Icon review folder','longform');const folder=foldersFor('longform').find(f=>f.name==='Icon review folder');assignLibraryFolder(books.find(b=>b.title==='Icon review').id,folder.id);changeLibraryFolder(folder.id,'longform');});
 assert.equal(await page.locator(folderSummary).count(),1,'selected user folder has a management control');
}

export async function captureAppFamilyStudy(page,capture){
 await page.locator('#wordbook-review').tap();await page.waitForFunction(()=>studySetsUI.screen==='directory'&&studySetsUI.dialog.open);
 await page.locator('.study-sets-home-card[data-set-id]').first().tap();
 await page.waitForFunction(()=>studySetsUI.screen==='detail'&&studySetsUI.pageOpen);
 await capture('study-detail',['#study-sets-back','#study-sets-edit'],{'#study-sets-back':{size:32,stroke:'2.3px'},'#study-sets-edit':{size:20,stroke:'2px',dots:'1.6px'}});
 await page.locator('#study-sets-edit').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>studySetsUI.editOpen&&!studySetsUI.editAnimation);
 assert.equal(await page.evaluate(()=>document.activeElement===studySetsUI.editMenu.querySelector('button')),true,'keyboard opens menu on its first action');
 assert.equal(await page.locator('#study-sets-edit').evaluate(n=>getComputedStyle(n).opacity),'0');
 await capture('study-more',['#study-sets-back'],{'#study-sets-back':{size:32,stroke:'2.3px'}});
 await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'세트 삭제');
 await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'이름 변경');
 await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'책 추가');
 await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'이름 변경');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!studySetsUI.editOpen&&!studySetsUI.editAnimation);
 assert.equal(await page.locator('#study-sets-edit').evaluate(n=>n===document.activeElement),true,'Escape returns focus to more');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>studySetsUI.editOpen&&!studySetsUI.editAnimation&&!studySetsUI.editMenu.hidden),true,'reduced motion menu settles without an animation');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>!studySetsUI.editOpen&&!studySetsUI.editAnimation&&studySetsUI.editMenu.hidden),true);
 await page.emulateMedia({reducedMotion:'no-preference'});
 // Restart via the domain action: captures never depend on the progress label
 // contract, future drag thresholds, or the other worker's learning-card UI.
 await page.evaluate(()=>studySetsStart(studySetsUI.setId,true));
 await capture('study-front',['#study-sets-back'],{'#study-sets-back':{size:32,stroke:'2.3px'}});
 assert.equal(await page.locator('#study-sets-reveal').evaluate(n=>n===document.activeElement),true,'front focuses reveal');
 await page.keyboard.press('Enter');
 await capture('study-revealed',['#study-sets-back'],{'#study-sets-back':{size:32,stroke:'2.3px'}});
 assert.equal(await page.locator('#study-sets-answer').evaluate(n=>n===document.activeElement),true,'reveal focuses the answer');
 await page.keyboard.press('Tab');assert.equal(await page.locator('#study-sets-grade-repeat').evaluate(n=>n===document.activeElement),true,'Tab reaches repeat');
 await page.keyboard.press('Tab');assert.equal(await page.locator('#study-sets-grade-remembered').evaluate(n=>n===document.activeElement),true,'Tab reaches remembered');
 await page.keyboard.press('Enter');
 for(let i=0;i<10&&!await page.locator('.study-sets-complete').isVisible();i++){
  await page.locator('#study-sets-reveal').click();await page.locator('#study-sets-grade-remembered').click();
 }
 assert.equal(await page.locator('.study-sets-complete').isVisible(),true,'real actions complete this four-card fixture');
 await capture('study-completion',['#study-sets-back'],{'#study-sets-back':{size:32,stroke:'2.3px'}});
 await page.locator('#study-sets-back').click();await page.waitForFunction(()=>studySetsUI.screen==='detail');
 await page.locator('#study-sets-back').click();await page.waitForFunction(()=>studySetsUI.screen==='directory'&&studySetsUI.dialog.open);
 await page.locator('#study-sets-close').click();await page.waitForFunction(()=>!studySetsIsOpen()&&!studySetsUI.pendingClose);
 return {keyboardMenu:true,keyboardRevealAndGrade:true,reducedMotionMenu:true,fullAccessibilityAudit:false};
}
