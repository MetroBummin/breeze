/* Study sets are local snapshots. This surface never writes saved Meanings or
   enters the general word-card deck. Every action starts from durable state. */
const studySetsOpened=new Map();
// Shared row-height cache for 전체 단어 and custom set windows.
const studySetsAllWordsHeights=new Map();
const studySetsWindowLimit=100;
const studySetsQueuedRows=new WeakSet();
let studySetsMutationDone=Promise.resolve();
const studySetsDirectoryPositions=new Map();
const studySetsDirectoryFocus=new Map();
let studySetsReadEpoch=0,studySetsHomeEpoch=0;
const studySetsUI={
  allWordsList:/** @type {{refresh:()=>void,removeId:(id:string)=>(Element|null),dispose:()=>void}|null} */(null),
  dialog:/** @type {HTMLDialogElement|null} */(null),
  sheet:/** @type {HTMLElement|null} */(null),
  body:/** @type {HTMLElement|null} */(null),
  footer:/** @type {HTMLElement|null} */(null),
  error:/** @type {HTMLElement|null} */(null),
  title:/** @type {HTMLElement|null} */(null),
  back:/** @type {HTMLButtonElement|null} */(null),
  returnFocus:/** @type {HTMLElement|null} */(null),
  retry:/** @type {null|(()=>void)} */(null),
  lastError:null,diagnostic:null,mutating:false,
  screen:'list',setId:'',notice:'',undo:null,historyToken:'',pendingClose:false,homeEntry:false,managementEntry:false,
  swipeClose:/** @type {null|(()=>void)} */(null),
  releaseClickId:/** @type {number|null} */(null),
  pageOpen:false,transitioning:false,homeScroll:0,detailEditing:false,detailScroll:0,
  editSlot:/** @type {HTMLElement|null} */(null),editSurface:/** @type {HTMLElement|null} */(null),editOpen:false,editButton:/** @type {HTMLButtonElement|null} */(null),editMenu:/** @type {HTMLElement|null} */(null),editAnimation:/** @type {Animation|null} */(null),editEpoch:0,
  directoryOrigin:false,directoryDepth:0,directoryScroll:0,vocabScroll:0,createdSetId:'',
  directoryList:/** @type {HTMLElement|null} */(null),
  state:null
};
function studySetsNode(tag,className='',text=''){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
}
function studySetsButton(text,action,className=''){
  const button=document.createElement('button');button.type='button';
  button.className='study-sets-button'+(className?' '+className:'');
  button.textContent=text;button.addEventListener('click',action);return button;
}
function studySetsIcon(kind){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  if(kind==='more'){
    for(const x of [5,12,19]){const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('cx',String(x));dot.setAttribute('cy','12');dot.setAttribute('r','1.25');svg.append(dot);}return svg;
  }
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',kind==='close'?'M6 6l12 12M18 6L6 18':kind==='back'?'M15 6l-6 6 6 6':kind==='chevron'?'M9 5l7 7-7 7':kind==='remove'?'M6 12h12':'M12 5v14M5 12h14');
  svg.append(path);return svg;
}
function studySetsIconButton(label,kind,action){
  const button=studySetsButton('',action,'study-sets-icon');
  button.setAttribute('aria-label',label);button.append(studySetsIcon(kind));return button;
}
function ensureStudySetsDialog(){
  if(studySetsUI.dialog)return;
  const dialog=document.createElement('dialog');dialog.id='study-sets-dialog';
  dialog.setAttribute('aria-labelledby','study-sets-title');
  const sheet=studySetsNode('section','study-sets-sheet');
  const header=studySetsNode('header','study-sets-header');
  const back=studySetsIconButton('뒤로','back',studySetsBack);back.id='study-sets-back';
  const title=studySetsNode('h2','','학습 세트');title.id='study-sets-title';title.tabIndex=-1;
  const close=studySetsIconButton('학습 세트 닫기','close',()=>closeStudySets());close.id='study-sets-close';
  const more=studySetsIconButton('세트 편집','more',event=>studySetsToggleEditMenu(event.detail===0));more.id='study-sets-edit';more.hidden=true;more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');
  const editSlot=studySetsNode('span','study-sets-edit-slot');header.append(back,title,editSlot,close);
  const error=studySetsNode('div','study-sets-error');error.id='study-sets-error';error.hidden=true;error.setAttribute('role','alert');
  const body=studySetsNode('div','study-sets-body');body.id='study-sets-content';
  const footer=studySetsNode('footer','study-sets-footer');footer.hidden=true;
  sheet.addEventListener('keydown',event=>{if(studySetsUI.pageOpen)event.stopPropagation();});
  const editMenu=studySetsNode('div','study-sets-edit-menu');editMenu.id='study-sets-edit-menu';editMenu.hidden=true;editMenu.setAttribute('role','menu');editMenu.setAttribute('aria-label','세트 편집');more.setAttribute('aria-controls',editMenu.id);
  for(const [label,screen] of [['이름 변경','rename'],['책 추가','books'],['세트 삭제','delete']]){
    const action=studySetsButton(label,()=>{studySetsCloseEditMenu(false,true);studySetsUI.detailScroll=body.scrollTop;studySetsUI.detailEditing=true;studySetsGo(screen);},screen==='delete'?'study-sets-danger-link':'');action.setAttribute('role','menuitem');action.tabIndex=-1;editMenu.append(action);
  }
  const editSurface=studySetsNode('div','study-sets-edit-surface');editSurface.id='study-sets-edit-surface';editSurface.hidden=true;editSurface.append(more,editMenu);
  sheet.append(header,error,body,footer,editSurface);dialog.append(sheet);document.body.append(dialog);
  Object.assign(studySetsUI,{dialog,sheet,body,footer,error,title,back,editButton:more,editMenu,editSurface,editSlot});
  body.addEventListener('scroll',()=>{studySetsCloseEditMenu(false,true);if(studySetsUI.directoryOrigin&&studySetsUI.screen==='directory'){studySetsUI.directoryScroll=body.scrollTop;studySetsDirectoryPositions.set(studySetsUI.historyToken,body.scrollTop);}});
  let backdropDown=false;
  dialog.addEventListener('pointerdown',event=>{backdropDown=event.target===dialog;});
  dialog.addEventListener('click',event=>{if(event.target===dialog&&backdropDown)closeStudySets();backdropDown=false;});
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(studySetsUI.directoryOrigin&&studySetsUI.screen!=='directory')studySetsBack();else closeStudySets();});
  // Keep app-wide card/reader shortcuts from handling keys owned by this modal.
  dialog.addEventListener('keydown',event=>{event.stopPropagation();});
  dialog.addEventListener('close',()=>{
    if(studySetsUI.transitioning||studySetsUI.pageOpen||studySetsUI.dialog.open)return;
    studySetsUnlockScroll();
    studySetsReturnHomeFocus();
  });
}
let studySetsScrollLock=null;
function studySetsLockScroll(){
  if(studySetsScrollLock)return;
  const root=document.documentElement,x=window.scrollX||0,y=window.scrollY||0;
  const previous=root.style.getPropertyValue('--study-sets-scroll-top');
  studySetsScrollLock={x,y,previous};
  root.style.setProperty('--study-sets-scroll-top',-y+'px');
  root.classList.add('study-sets-modal-open');
}
function studySetsUnlockScroll(restore=true){
  const lock=studySetsScrollLock;if(!lock)return;studySetsScrollLock=null;
  const root=document.documentElement;root.classList.remove('study-sets-modal-open');
  if(lock.previous)root.style.setProperty('--study-sets-scroll-top',lock.previous);else root.style.removeProperty('--study-sets-scroll-top');
  if(restore)window.scrollTo?.(lock.x,lock.y);
}
async function studySetsReturnHomeFocus(){
    const directory=studySetsUI.directoryList;if(directory&&!directory.isConnected)document.getElementById('v-memory')?.append(directory);
    studySetsUI.retry=null;studySetsUI.undo=null;
    await refreshStudySetsEntry();
    if(studySetsIsOpen())return;
    const previous=studySetsUI.returnFocus;
    const target=previous?.isConnected?previous:previous?.dataset.setId?
      [...document.querySelectorAll('.study-sets-home-card[data-set-id]')].find(item=>item.getAttribute('data-set-id')===previous.dataset.setId):
      previous?.id?document.getElementById(previous.id):null;
    if(target instanceof HTMLElement)target.focus({preventScroll:true});
    else if(studySetsUI.homeEntry)document.getElementById('study-sets-home-create')?.focus({preventScroll:true});
}
function studySetsIsOpen(){return studySetsUI.pageOpen||!!studySetsUI.dialog?.open;}
function refreshStudySetsEntry(state=null){
  // Detail/study owns the visible surface. Rebuild its directory only when
  // Memory becomes visible again; entering the directory reads durable state.
  if(document.querySelector('#v-memory.view:not(.on)'))return;
  return renderStudySetsHome(state);
}
// Both list renderers receive decoded or successfully committed state. Counts
// need no card copies, answer scan, or collection-wide view normalization.
function studySetsListSummary(set){
  const active=BreezeStudySets.listedCards(set,typeof words==='undefined'?null:words).length,session=set.session;
  const total=session?.queue.length||0,completed=session?.index||0;
  return {active,total,completed,status:session?(completed<total?'active':'complete'):active?'idle':'empty'};
}
async function renderStudySetsHome(state=null){
  const epoch=++studySetsHomeEpoch;let readError;
  if(!state){try{state=await loadStudySets();}catch(error){readError=error;}}
  if(epoch!==studySetsHomeEpoch)return;
  const container=studySetsUI.directoryList||document.getElementById('study-sets-home-list');if(!container)return;studySetsUI.directoryList=container;
  const focused=document.activeElement instanceof HTMLElement&&container.contains(document.activeElement)?document.activeElement:null;
  const list=studySetsNode('ul','study-sets-home-cards');list.setAttribute('aria-label','Memory 단어장과 학습 세트');
  const card=(title,description,action,kind='chevron')=>{
    const item=studySetsNode('li');const button=studySetsButton('',action,'study-sets-home-card');
    const copy=studySetsNode('span','study-sets-home-copy');
    copy.append(studySetsNode('strong','',title));if(description)copy.append(studySetsNode('span','study-sets-home-caption',description));
    button.append(copy,studySetsIcon(kind));item.append(button);list.append(item);return button;
  };
  // Match the existing wordbook's grouped count; its search/filter state stays
  // with renderVocab and is neither copied nor reset by the directory.
  const count=new Set(Object.entries(words).filter(([,item])=>validWordMeaning(item)).map(([key,item])=>item.root||key)).size;
  const all=card('전체 단어',`${count}개`,openStudySetsAllWords);all.id='study-sets-all';all.classList.add('study-sets-home-default');
  if(readError){
    const notice=studySetsNode('div','study-sets-home-error');notice.setAttribute('role','alert');
    notice.append(studySetsNode('p','','학습 세트를 불러오지 못했어요. 저장된 데이터는 바꾸지 않았어요.'),studySetsButton('다시 시도',()=>renderStudySetsHome()));
    const item=studySetsNode('li');item.append(notice);list.append(item);
  }
  for(const set of state?.sets||[]){
    const view=studySetsListSummary(set),active=view.active;
    const progress=view.status==='active'?` · ${view.completed}/${view.total}`:'';
    const button=card(set.name,`${active}개${progress}`,()=>openStudySet(set.id));
    button.dataset.setId=set.id;
    button.setAttribute('aria-controls','v-memory-set');
  }
  const create=card('세트 추가','',openStudySetsCreate,'add');
  create.id='study-sets-home-create';create.setAttribute('aria-label','새 학습 세트');create.classList.add('study-sets-home-add');create.disabled=!state;
  create.setAttribute('aria-haspopup','dialog');create.setAttribute('aria-controls','study-sets-dialog');
  container.replaceChildren(list);
  if(focused&&!studySetsIsOpen()){
    const replacement=focused.dataset.setId?[...list.querySelectorAll('[data-set-id]')].find(item=>item.dataset.setId===focused.dataset.setId):document.getElementById(focused.id);
    if(replacement instanceof HTMLElement)replacement.focus({preventScroll:true});
  }
}
function studySetsCloseEditMenu(focus=false,immediate=false){
  studySetsSetEditMenu(false,focus,immediate);
}
function studySetsToggleEditMenu(focus=false){studySetsSetEditMenu(!studySetsUI.editOpen,focus);}
function studySetsSetEditMenu(open,focus=false,immediate=false){
  const ui=studySetsUI,panel=ui.editMenu,button=ui.editButton,surface=ui.editSurface;
  if(!panel||!button||!surface||open&&(ui.screen!=='detail'||!ui.pageOpen||button.hidden))return;
  if(!open&&panel.hidden)return;
  const epoch=++ui.editEpoch;
  const current=ui.editAnimation?getComputedStyle(surface):null;
  const from=current?{width:current.width,height:current.height,borderRadius:current.borderRadius}:null;
  ui.editAnimation?.cancel();ui.editAnimation=null;ui.editOpen=open;
  button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'편집 메뉴 닫기':'세트 편집');button.tabIndex=open?-1:0;
  panel.hidden=false;panel.style.pointerEvents='none';panel.style.opacity='0';
  button.style.opacity=open?'0':'1';
  const items=[...panel.querySelectorAll('button')];items.forEach(item=>{item.tabIndex=open?0:-1;});
  const width=Math.min(236,ui.sheet.clientWidth?ui.sheet.clientWidth-32:236);
  panel.style.width=(width-2)+'px';
  const height=panel.offsetHeight?panel.offsetHeight+2:150;
  const circle={width:'44px',height:'44px',borderRadius:'22px'},expanded={width:width+'px',height:height+'px',borderRadius:'20px'};
  const target=open?expanded:circle;
  const finish=()=>{if(epoch!==ui.editEpoch)return;ui.editAnimation?.cancel();ui.editAnimation=null;Object.assign(surface.style,target);panel.hidden=!open;panel.style.pointerEvents=open?'auto':'none';panel.style.opacity=open?'1':'0';if(focus){const targetControl=open?items[0]:button;targetControl?.focus({preventScroll:true});}};
  if(immediate||typeof surface.animate!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return;}
  const animation=surface.animate([from||(open?circle:expanded),target],{duration:open?280:220,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
  ui.editAnimation=animation;animation.finished.then(finish,()=>{});
}
function replaceStudySetsHistory(patch){
  const current=history.state||{};
  if(Object.entries(patch).some(([key,value])=>current[key]!==value))history.replaceState({...current,...patch},'');
}
function syncStudySetsHistoryView(view){
  const ui=studySetsUI;if(history.state?.studySets!==ui.historyToken)return;
  // Route and presentation ownership change together. Content-only updates
  // must not spend browser history writes (WebKit rate-limits these calls).
  replaceStudySetsHistory({view,studySetsScreen:ui.screen,studySetsSetId:ui.setId,
    studySetsHome:ui.homeEntry,studySetsManagement:ui.managementEntry,studySetsHomeScroll:ui.homeScroll,
    studySetsDirectoryOrigin:ui.directoryOrigin,studySetsDirectoryDepth:ui.directoryDepth,studySetsDirectoryScroll:ui.directoryScroll,studySetsVocabScroll:ui.vocabScroll});
}
function openStudySetsDirectory(){
  if(studySetsIsOpen())return;
  const scroll=window.scrollY||0;replaceStudySetsHistory({studySetsVocabScroll:scroll});
  openStudySets(false,'directory','',false);
}
function closeStudySetsDirectory(){closeStudySets();}
function rememberStudySetsDirectory(){
  if(!studySetsUI.directoryOrigin||studySetsUI.screen!=='directory')return;
  studySetsUI.directoryScroll=studySetsUI.body.scrollTop;
  studySetsDirectoryPositions.set(studySetsUI.historyToken,studySetsUI.directoryScroll);
  replaceStudySetsHistory({studySetsDirectoryScroll:studySetsUI.directoryScroll});
}
function openStudySetsAllWords(){
  if(studySetsUI.directoryOrigin&&studySetsUI.screen==='directory'){
    studySetsDirectoryFocus.set(studySetsUI.historyToken,'@all');studySetsGo('all','');return;
  }
  openStudySets(false,'all','',true);
}
async function startStudySetsAllWords(){
  replaceStudySetsHistory({studySetsAllWordsScroll:studySetsUI.body.scrollTop});
  await openVocabularyReview();
  if(typeof activeAppView==='function'&&activeAppView()==='study')replaceStudySetsHistory({studySetsAllWords:true});
}
function openStudySetsCreate(){
  if(studySetsUI.directoryOrigin&&studySetsUI.screen==='directory'){studySetsDirectoryFocus.set(studySetsUI.historyToken,'@create');studySetsGo('create','');return;}
  openStudySets(false,'create','',true);
}
function openStudySet(id){
  if(studySetsUI.directoryOrigin&&studySetsUI.screen==='directory'){studySetsDirectoryFocus.set(studySetsUI.historyToken,id);studySetsGo('detail',id);return;}
  openStudySets(false,'detail',id,true);
}
function studySetsReturnDirectory(){
  if(studySetsUI.directoryDepth>0){studySetsUI.pendingClose=true;history.go(-studySetsUI.directoryDepth);}
}
function studySetsFullPage(screen=studySetsUI.screen){
  return ['detail','study','all','test-setup','test','test-result'].includes(screen)||studySetsUI.detailEditing&&['rename','books','delete','excluded'].includes(screen);
}
function studySetsAttachSurface(){
  const ui=studySetsUI,page=studySetsFullPage();
  const view=page?'memory-set':ui.directoryOrigin?'vocab':(history.state?.studySets===ui.historyToken&&history.state.view!=='memory-set'?history.state.view:ui.homeEntry?'memory':typeof activeAppView==='function'&&activeAppView()!=='memory-set'?activeAppView():'memory');
  ui.transitioning=true;
  if(page){
    let host=document.getElementById('v-memory-set');
    if(!host){host=studySetsNode('section','view');host.id='v-memory-set';host.setAttribute('aria-label','학습 세트');document.body.append(host);}
    if(ui.sheet.parentElement!==host)host.append(ui.sheet);ui.pageOpen=true;
  }else{
    ui.pageOpen=false;if(ui.sheet.parentElement!==ui.dialog)ui.dialog.append(ui.sheet);
  }
  document.getElementById('study-sets-close').hidden=page;
  if(typeof show==='function'&&typeof activeAppView==='function'&&activeAppView()!==view)show(view,{fromHistory:true,studySetsTransition:true});
  // Hide the vocabulary before close() restores dialog focus; otherwise WebKit
  // and Chromium lay out every background word just to hide them immediately.
  if(page){if(ui.dialog.open)ui.dialog.close();studySetsUnlockScroll(false);}
  else if(!ui.dialog.open){studySetsLockScroll();try{ui.dialog.showModal();}catch(error){studySetsUnlockScroll();throw error;}}
  ui.transitioning=false;
  syncStudySetsHistoryView(view);studySetsCreateViewport();
}
// iOS keeps the layout viewport behind its software keyboard. Size this
// creation sheet to the visible viewport without changing Reader overlays.
function studySetsCreateViewport(){
  const dialog=studySetsUI.dialog;if(!dialog)return;
  const viewport=window.visualViewport;
  if(studySetsUI.screen==='create'&&dialog.open&&viewport&&viewport.scale===1){
    dialog.style.height=viewport.height+'px';dialog.style.top=viewport.offsetTop+'px';
  }else{dialog.style.removeProperty('height');dialog.style.removeProperty('top');}
}
window.visualViewport?.addEventListener('resize',studySetsCreateViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',studySetsCreateViewport,{passive:true});
function openStudySets(fromHistory=false,screen='list',setId='',homeEntry=false){
  if(studySetsUI.pendingClose)return;
  ensureStudySetsDialog();
  if(studySetsIsOpen()&&!fromHistory)return;
  if(!fromHistory)studySetsUI.returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(!fromHistory&&typeof activeAppView==='function'&&activeAppView()==='memory'){
    studySetsUI.homeScroll=window.scrollY||0;replaceStudySetsHistory({studySetsDirectoryScroll:studySetsUI.homeScroll});
  }
  if(fromHistory)studySetsUI.homeScroll=Number(history.state?.studySetsHomeScroll)||0;
  studySetsUI.directoryOrigin=fromHistory?!!history.state?.studySetsDirectoryOrigin:screen==='directory';
  studySetsUI.directoryDepth=fromHistory?Number(history.state?.studySetsDirectoryDepth)||0:0;
  studySetsUI.directoryScroll=fromHistory?(studySetsDirectoryPositions.get(history.state?.studySets)??(Number(history.state?.studySetsDirectoryScroll)||0)):0;
  studySetsUI.vocabScroll=fromHistory?Number(history.state?.studySetsVocabScroll)||0:window.scrollY||0;
  studySetsUI.screen=fromHistory?history.state?.studySetsScreen||'list':screen;
  if(fromHistory&&studySetsUI.screen==='menu')studySetsUI.screen='detail';
  studySetsUI.detailEditing=fromHistory?!!history.state?.studySetsDetailEditing:false;
  studySetsUI.setId=fromHistory?history.state?.studySetsSetId||'':setId;
  studySetsUI.homeEntry=fromHistory?!!history.state?.studySetsHome:homeEntry;
  studySetsUI.managementEntry=false;
  studySetsUI.notice='';studySetsUI.undo=null;
  studySetsUI.state=null;studySetsUI.allWordsList?.dispose();studySetsUI.allWordsList=null;studySetsUI.body.replaceChildren();
  studySetsUI.title.textContent=studySetsUI.screen==='create'?'새 학습 세트':'학습 세트';
  studySetsUI.back.hidden=studySetsUI.screen==='list';
  if(!fromHistory){
    studySetsUI.historyToken=String(Date.now())+'-'+String(Math.random()).slice(2);
    history.pushState({breeze:true,view:studySetsFullPage()?'memory-set':typeof activeAppView==='function'?activeAppView():'memory',studySets:studySetsUI.historyToken,studySetsScreen:studySetsUI.screen,studySetsSetId:studySetsUI.setId,studySetsHome:studySetsUI.homeEntry,studySetsManagement:studySetsUI.managementEntry,studySetsHomeScroll:studySetsUI.homeScroll,studySetsDirectoryOrigin:studySetsUI.directoryOrigin,studySetsDirectoryDepth:0,studySetsDirectoryScroll:studySetsUI.directoryScroll,studySetsVocabScroll:studySetsUI.vocabScroll},'');
  }else studySetsUI.historyToken=history.state?.studySets||'';
  studySetsAttachSurface();return studySetsReadAndRender();
}
function closeStudySets(fromHistory=false){
  if(!studySetsIsOpen())return;
  studySetsCloseEditMenu(false,true);
  studySetsUI.swipeClose?.();
  studySetsUI.allWordsList?.dispose();studySetsUI.allWordsList=null;
  if(studySetsUI.screen==='all')studySetsUI.body.replaceChildren();
  studySetsUnlockScroll();
  if(studySetsUI.pageOpen){studySetsUI.pageOpen=false;studySetsReturnHomeFocus();}
  else studySetsUI.dialog.close();
  if(!fromHistory&&history.state?.studySets===studySetsUI.historyToken){
    studySetsUI.pendingClose=true;if(studySetsUI.directoryOrigin)history.go(-(studySetsUI.directoryDepth+1));else history.back();
  }
}
window.addEventListener('popstate',event=>{
  const wasOpen=studySetsIsOpen(),pending=studySetsUI.pendingClose;
  studySetsUI.pendingClose=false;
  const sameSheet=wasOpen&&studySetsUI.dialog?.open&&studySetsUI.directoryOrigin&&event.state?.studySetsDirectoryOrigin&&event.state.studySets===studySetsUI.historyToken&&!studySetsFullPage(event.state.studySetsScreen);
  if(wasOpen&&!sameSheet)closeStudySets(true);
  if(event.state?.studySets){
    event.stopImmediatePropagation();openStudySets(true);return;
  }
  if(wasOpen||pending){
    const target=event.state?.breeze?event.state.view:'home';
    if(typeof show==='function')show(target,{fromHistory:true,studySetsTransition:true});
    if(target==='memory'){window.scrollTo?.(0,studySetsUI.homeScroll);studySetsReturnHomeFocus();}
    event.stopImmediatePropagation();
  }
},true);
function studySetsShowError(error,retry,context={phase:'read',committed:false}){
  // Keep the original exception in memory for diagnosis; never persist word text.
  studySetsUI.lastError=error;
  studySetsUI.diagnostic={operation:context.operation||studySetsUI.screen,phase:context.phase,committed:context.committed,name:String(error?.name||'Error'),message:String(error?.message||''),serializedCharacters:context.serializedCharacters||0,sets:studySetsUI.state?.sets.length||0,cards:studySetsUI.state?.sets.reduce((n,set)=>n+set.cards.length,0)||0,sessions:studySetsUI.state?.sets.filter(set=>set.session).length||0};
  studySetsUI.retry=retry;studySetsUI.error.replaceChildren();studySetsUI.error.hidden=false;
  const message=String(error?.message||'');
  const detail=/newer|version/i.test(message)?'이 앱보다 새로운 형식의 데이터예요. 앱을 업데이트해 주세요. 저장된 데이터는 바꾸지 않았어요.':
    /Invalid study sets data/i.test(message)?'저장된 데이터를 읽을 수 없어요. 원본 데이터는 그대로 보관하고 있어요.':
    /changed/i.test(message)?'다른 창에서 변경되었어요. 다시 시도하면 최신 상태에 반영해요.':
    context.committed?'저장은 완료됐지만 화면을 표시하지 못했어요. 다시 시도하면 저장된 세트를 다시 표시해요.':error?.name==='QuotaExceededError'?'앱 저장소의 한도에 도달했어요. 저장된 데이터는 바꾸지 않았어요.':'저장소 또는 화면 처리 중 오류가 발생했어요. 다시 시도해 주세요.';
  studySetsUI.error.append(studySetsNode('p','',context.committed?'세트는 저장됐지만 화면을 표시하지 못했어요.':'학습 세트를 저장하거나 불러오지 못했어요.'),studySetsNode('p','study-sets-caption',detail));
  studySetsUI.error.append(studySetsButton('다시 시도',()=>studySetsUI.retry?.()));
}
function studySetsClearError(){studySetsUI.retry=null;studySetsUI.error.hidden=true;studySetsUI.error.replaceChildren();}
function studySetsOwner(){
  const {historyToken,screen,setId}=studySetsUI;
  return ()=>studySetsIsOpen()&&studySetsUI.historyToken===historyToken&&studySetsUI.screen===screen&&studySetsUI.setId===setId;
}
let studySetsWriteChain=Promise.resolve();
function enqueueStudySetsWrite(task){
  const run=studySetsWriteChain.then(task,task);
  studySetsWriteChain=run.then(()=>{},()=>{});
  return run;
}
function scheduleStudySetsVocabularySync(){
  return enqueueStudySetsWrite(async()=>{
    let lastError;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const state=await loadStudySets();
        const synced=BreezeStudySets.syncVocabulary(state,words,Date.now());
        if(!synced.accepted)return synced;
        await commitStudySets(synced.state);
        // The open set list follows the save. An in-progress card keeps its
        // starting queue, so that screen is left until the round is left.
        if(studySetsIsOpen()&&!studySetsUI.retry&&!studySetsUI.mutating&&!['create','rename','books','delete','study','all'].includes(studySetsUI.screen)){
          studySetsUI.state=synced.state;renderStudySets(false);
        }
        return synced;
      }catch(error){
        lastError=error;
        if(attempt===2||!/changed|Reopen|retry/i.test(String(error?.message||'')))throw error;
      }
    }
    throw lastError;
  });
}
async function studySetsReadAndRender(focus=true,context={phase:'read',committed:false}){
  const epoch=++studySetsReadEpoch,owns=studySetsOwner();
  if(studySetsUI.screen==='all'){studySetsClearError();renderStudySets(focus);return;}
  studySetsUI.body?.setAttribute('aria-busy','true');
  try{
    await enqueueStudySetsWrite(async()=>{
      if(epoch!==studySetsReadEpoch||!owns())return;
      const state=await loadStudySets();if(epoch!==studySetsReadEpoch||!owns())return;
      const synced=BreezeStudySets.syncVocabulary(state,words,Date.now());
      if(synced.accepted)await commitStudySets(synced.state);
      if(epoch!==studySetsReadEpoch||!owns())return;
      studySetsUI.state=synced.state;studySetsClearError();renderStudySets(focus);
    });
  }
  catch(error){if(epoch===studySetsReadEpoch&&owns())studySetsShowError(error,()=>studySetsReadAndRender(focus,context),context);}
  finally{if(epoch===studySetsReadEpoch)studySetsUI.body?.removeAttribute('aria-busy');}
}
function studySetsMutate(change,success,exitRow=null,handoff=null){
  if(studySetsUI.pendingClose)return;
  if(studySetsUI.mutating){
    if(!exitRow||studySetsQueuedRows.has(exitRow))return;
    const ownsQueued=studySetsOwner();studySetsQueuedRows.add(exitRow);
    return studySetsMutationDone.then(()=>{studySetsQueuedRows.delete(exitRow);if(ownsQueued()&&exitRow.isConnected)return studySetsMutate(change,success,exitRow,handoff);});
  }
  return enqueueStudySetsWrite(()=>studySetsMutateUnlocked(change,success,exitRow,handoff));
}
async function studySetsMutateUnlocked(change,success,exitRow=null,handoff=null){
  if(studySetsUI.pendingClose)return;
  let releaseMutation=()=>{};studySetsMutationDone=new Promise(resolve=>{releaseMutation=()=>resolve(undefined);});
  studySetsUI.mutating=true;if(exitRow)studySetsQueuedRows.add(exitRow);
  ++studySetsReadEpoch;const owns=studySetsOwner();
  studySetsUI.body?.removeAttribute('aria-busy');
  const operation=studySetsUI.screen;
  let result,phase='read',committed=false,serializedCharacters=0;
  const retry=()=>studySetsMutate(change,success,exitRow);
  try{
    const state=await loadStudySets();if(!owns())return;
    result=change(state);
    if(!result.accepted){
      studySetsUI.state=result.state;studySetsClearError();
      studySetsUI.notice='다른 곳에서 변경된 최신 상태를 불러왔어요.';phase='display';renderStudySets();refreshStudySetsEntry(result.state);return;
    }
    phase='commit';serializedCharacters=JSON.stringify(result.state).length;
    await commitStudySets(result.state);committed=true;
    if(handoff)await handoff;
    if(!owns())return;
    studySetsUI.state=result.state;studySetsClearError();
    const previousScreen=studySetsUI.screen;
    phase='navigation';if(success)success(result);
    if(studySetsUI.pendingClose)return;
    const focus=!(['detail','excluded'].includes(previousScreen)&&previousScreen===studySetsUI.screen);
    phase='display';refreshStudySetsEntry(result.state);
    if(exitRow&&studySetsAnimateExit(exitRow))return;
    renderStudySets(focus);
  }catch(error){
    if(!owns()&&!committed){toast('학습 변경을 저장하지 못했어요. 다시 열어 시도해 주세요.');return;}
    if(exitRow)studySetsUI.swipeClose?.();
    // A durable operation must never be repeated because its display failed.
    if(committed){studySetsUI.pendingClose=false;studySetsUI.transitioning=false;}
    studySetsShowError(error,committed?()=>studySetsReadAndRender(true,{phase:'display',committed,serializedCharacters,operation}):retry,{phase,committed,serializedCharacters,operation});
  }finally{if(exitRow)studySetsQueuedRows.delete(exitRow);studySetsUI.mutating=false;releaseMutation();}
}
function studySetsAnimateExit(row){
  if(!row.isConnected||typeof row.animate!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return false;
  const surface=row.querySelector('.study-sets-word-surface'),height=row.getBoundingClientRect().height;
  const width=surface?.getBoundingClientRect().width||row.getBoundingClientRect().width;
  if(!surface||!height)return false;
  const screen=studySetsUI.screen,setId=studySetsUI.setId;
  studySetsUI.swipeClose=null;row.classList.add('study-sets-exiting');row.setAttribute('aria-busy','true');
  const action=row.querySelector('.study-sets-row-action');if(action){action.disabled=true;action.style.width=Math.max(44,width-24)+'px';}
  // Undo owns the committed state immediately, including during row removal.
  // Keep its target stable when the row finishes, even if a finger is down.
  const committed=studySetsUI.state?.sets.find(item=>item.id===setId);
  if(committed)renderStudySetsDetailFooter(committed);
  // Membership is already durable. Animate only the committed visual removal.
  let exit;
  try{exit=surface.animate([{transform:surface.style.transform||'translateX(0)'},{transform:`translateX(${-width}px)`}],{duration:Math.max(100,Math.min(180,(width-Math.abs(Number((surface.style.transform||'').match(/translateX\(([-\d.]+)px\)/)?.[1])||0))/Math.max(2,Number(row.dataset.releaseVelocity)||0))),easing:'cubic-bezier(.18,.65,.35,1)',fill:'forwards'});}catch(_){row.classList.remove('study-sets-exiting');return false;}
  const finish=()=>{
    if(!row.isConnected||!studySetsIsOpen()||studySetsUI.screen!==screen||studySetsUI.setId!==setId)return;
    const set=studySetsUI.state?.sets.find(item=>item.id===setId);if(!set)return;
    const focused=row.contains(document.activeElement),next=row.nextElementSibling||row.previousElementSibling;
    // A windowed set list owns indexes and spacers. Drop this card there so
    // offscreen rows are not rebuilt or renumbered as if every row were mounted.
    if(studySetsUI.allWordsList?.removeId&&row.dataset.cardId&&row.classList.contains('study-sets-word-row')){
      const replacement=studySetsUI.allWordsList.removeId(row.dataset.cardId);
      if(row.isConnected)row.remove();
      if(!studySetsUI.body.querySelector('.study-sets-word-row'))studySetsUI.body.replaceChildren(studySetsEmpty('세트에 학습할 단어가 없어요',''));
      else if(focused){/** @type {HTMLElement} */(replacement?.querySelector('.vword')||studySetsUI.title).focus({preventScroll:true});}
      return;
    }
    row.remove();
    studySetsUI.body.querySelectorAll('.study-sets-number').forEach((node,index)=>{node.textContent=String(index+1);});
    // Keep neighboring rows and their pointer capture alive during consecutive swipes.
    if(!studySetsUI.body.querySelector('.study-sets-word-row'))studySetsUI.body.replaceChildren(studySetsEmpty('세트에 학습할 단어가 없어요',''));
    if(focused){const target=next?.querySelector('.vword')||studySetsUI.title;target.focus({preventScroll:true});}
  };
  exit.finished.then(()=>{
    if(!row.isConnected)return;
    const collapse=row.animate([{height:height+'px',opacity:1},{height:'0px',opacity:0}],{duration:180,easing:'ease-out',fill:'forwards'});
    return collapse.finished;
  }).then(finish,finish);
  return true;
}
function studySetsGo(screen,setId=studySetsUI.setId){
  if(studySetsUI.pendingClose)return;
  studySetsCloseEditMenu(false,true);
  if(screen==='detail'&&studySetsUI.screen==='study'&&history.state?.studySetsScreen==='study'){history.back();return;}
  if(screen==='test-setup'&&studySetsUI.screen==='test'&&history.state?.studySetsScreen==='test'){history.back();return;}
  if(studySetsUI.directoryOrigin&&screen!==studySetsUI.screen){
    rememberStudySetsDirectory();
    studySetsUI.directoryDepth++;if(screen==='menu')studySetsUI.managementEntry=true;
    history.pushState({...history.state,studySetsScreen:screen,studySetsDetailEditing:studySetsUI.detailEditing,studySetsSetId:setId,studySetsDirectoryDepth:studySetsUI.directoryDepth,studySetsManagement:studySetsUI.managementEntry,view:studySetsFullPage(screen)?'memory-set':'vocab'},'');
  }
  studySetsUI.screen=screen;studySetsUI.setId=setId;studySetsUI.notice='';
  if(screen!=='detail')studySetsUI.undo=null;
  // The test field must be focused inside the tap that opened it. A storage
  // reload would return after the gesture and iOS would keep the keyboard down.
  if(studySetsUI.state&&['test-setup','test','test-result'].includes(screen)){renderStudySets(screen!=='test');return;}
  return studySetsReadAndRender();
}
function studySetsBack(){
  if(studySetsUI.editOpen){studySetsCloseEditMenu(true);return;}
  const screen=studySetsUI.screen;
  if(studySetsUI.directoryOrigin){if(screen==='directory')closeStudySets();else history.back();return;}
  if(['detail','all'].includes(screen)&&studySetsUI.pageOpen||screen==='list'||studySetsUI.homeEntry&&['detail','create','menu'].includes(screen)){closeStudySets();return;}
  if(screen==='test'||screen==='test-result'){studySetsGo('test-setup');return;}
  studySetsGo(['study','excluded','rename','books','delete','test-setup'].includes(screen)?'detail':'list');
}
function studySetsMessage(text){
  const message=studySetsNode('p','study-sets-caption',text);return message;
}
function studySetsEmpty(title,description){
  const empty=studySetsNode('div','study-sets-empty');
  empty.append(studySetsNode('h3','',title),studySetsMessage(description));return empty;
}
function renderStudySets(focus=true){
  const ui=studySetsUI;if(!studySetsIsOpen()||!ui.state&&ui.screen!=='all')return;
  studySetsCloseEditMenu(false,true);
  const scrollTop=ui.body.scrollTop;
  const active=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const oldRows=[...ui.body.querySelectorAll('.study-sets-word-row')];
  const focusedRow=active?.closest('.study-sets-word-row');
  const focusedIndex=focusedRow?oldRows.indexOf(focusedRow):-1;
  const focusId=active?.id;
  const set=ui.state?.sets.find(item=>item.id===ui.setId);
  if(ui.screen!=='list'&&ui.screen!=='directory'&&ui.screen!=='create'&&ui.screen!=='all'&&!set){
    if(ui.homeEntry){closeStudySets();return;}
    ui.screen=ui.directoryOrigin?'directory':'list';ui.setId='';ui.notice='이 학습 세트가 삭제되었어요.';
  }
  studySetsAttachSurface();
  ui.sheet.dataset.screen=ui.screen;ui.editButton.hidden=ui.screen!=='detail'||!ui.pageOpen||!set;ui.editSurface.hidden=ui.editButton.hidden;ui.editSlot.hidden=ui.editButton.hidden;
  ui.swipeClose?.();ui.allWordsList?.dispose();ui.allWordsList=null;ui.body.classList.remove('study-session-body','study-set-test-body');ui.body.replaceChildren();ui.footer.replaceChildren();ui.footer.hidden=true;ui.back.hidden=['list','directory'].includes(ui.screen);
  if(typeof studySetTestDismissToast==='function'&&!['test','test-result'].includes(ui.screen))studySetTestDismissToast();
  const titles={all:'전체 단어',directory:'학습하기',list:'학습 세트',create:'새 학습 세트',excluded:'제외한 단어',rename:'이름 변경',books:'책 추가',delete:'학습 세트 삭제','test-setup':'테스트',test:'테스트','test-result':'결과'};
  ui.title.textContent=titles[ui.screen]||set?.name||'학습 세트';
  if(ui.notice){const notice=studySetsNode('p','study-sets-notice',ui.notice);notice.setAttribute('role','status');ui.body.append(notice);}
  if(ui.screen==='directory'){renderStudySetsHome(ui.state);ui.body.append(ui.directoryList);}
  else if(ui.screen==='list')renderStudySetsList();
  else if(ui.screen==='create')renderStudySetsCreate();
  else if(ui.screen==='books')renderStudySetsBooks(set);
  else if(ui.screen==='rename'||ui.screen==='delete')renderStudySetsEdit(set);
  else if(ui.screen==='study')renderStudySetsStudy(set);
  else if(ui.screen==='all')renderStudySetsAllWords();
  else if(ui.screen==='test-setup')renderStudySetTestSetup(set);
  else if(ui.screen==='test')renderStudySetTest(set);
  else if(ui.screen==='test-result')renderStudySetTestResult(set);
  else renderStudySetsDetail(set,ui.screen==='excluded');
  if(focus){
    ui.body.scrollTop=ui.screen==='all'?(Number(history.state?.studySetsAllWordsScroll)||0):ui.screen==='directory'?ui.directoryScroll:ui.screen==='detail'&&ui.detailEditing?ui.detailScroll:0;
    const preferred=ui.body.querySelector('[data-study-sets-focus]');
    if(preferred instanceof HTMLElement)preferred.focus({preventScroll:true});else ui.title.focus({preventScroll:true});
    if(ui.screen==='directory'){
      const key=studySetsDirectoryFocus.get(ui.historyToken);
      const target=key==='@all'?ui.body.querySelector('#study-sets-all'):key==='@create'?ui.body.querySelector('#study-sets-home-create'):[...ui.body.querySelectorAll('[data-set-id]')].find(node=>node.getAttribute('data-set-id')===key);
      if(target instanceof HTMLElement){target.focus({preventScroll:true});if(ui.createdSetId===key)target.scrollIntoView?.({block:'nearest'});}
      ui.createdSetId='';
    }

  }else{
    ui.body.scrollTop=scrollTop;
    const sameControl=focusId?document.getElementById(focusId):null;
    const rows=ui.body.querySelectorAll('.study-sets-word-row');
    const retainedRow=focusedRow?[...rows].find(row=>row.getAttribute('data-card-id')===focusedRow.getAttribute('data-card-id')):null;
    const sameRowControl=retainedRow?.querySelector(active?.closest('.chip')?'.chip':'.vword');
    // The exclusion action precedes the word surface in DOM order and focusing
    // it reveals a swipe. Restore semantic controls, never the first button.
    const nearby=sameRowControl||(focusedIndex>=0?rows[Math.min(focusedIndex,rows.length-1)]?.querySelector('.vword'):null);
    if(sameControl instanceof HTMLElement)sameControl.focus({preventScroll:true});
    else if(nearby instanceof HTMLElement)nearby.focus({preventScroll:true});
    else if(focusedIndex>=0)ui.title.focus({preventScroll:true});
  }
  ui.allWordsList?.refresh();
}
function renderStudySetsList(){
  const body=studySetsUI.body;
  body.append(studySetsMessage('책을 골라 저장한 단어로 나만의 학습 세트를 만들어 보세요. 이 기기에 저장돼요.'));
  const create=studySetsButton('새 학습 세트 만들기',()=>studySetsGo('create'),'study-sets-primary');create.id='study-sets-create';body.append(create);
  const sets=studySetsUI.state.sets;
  if(!sets.length){body.append(studySetsEmpty('아직 학습 세트가 없어요','저장한 단어가 있는 책을 하나 이상 고르면 시작할 수 있어요.'));return;}
  const list=studySetsNode('ul','study-sets-list');
  for(const set of sets){
    const item=studySetsNode('li');
    const button=studySetsButton('',()=>studySetsGo('detail',set.id),'study-sets-list-item');button.dataset.setId=set.id;
    const copy=studySetsNode('span','study-sets-list-copy');
    const view=studySetsListSummary(set),active=view.active;
    let progress='';if(view.status==='active')progress=` · 학습 중 ${view.completed}/${view.total}`;else if(view.status==='complete')progress=' · 한 바퀴 완료';
    copy.append(studySetsNode('strong','',set.name),studySetsNode('span','study-sets-caption',`${set.bookTitles.length}권 · ${active}개${progress}`));
    button.append(copy,studySetsIcon('chevron'));item.append(button);list.append(item);
  }
  body.append(list);
}
function renderStudySetsAllWords(){
  const ui=studySetsUI,entries=Object.entries(words).filter(([,item])=>validWordMeaning(item)&&typeof item.word==='string'&&item.word.trim()).sort((a,b)=>(b[1].addedAt||0)-(a[1].addedAt||0));
  const groups=new Map();for(const entry of entries){const id=entry[1].root||entry[0];if(!groups.has(id))groups.set(id,[]);groups.get(id).push(entry);}
  ui.body.append(studySetsNode('p','study-sets-caption',`${groups.size}단어 · ${entries.length}개 뜻 카드`));
  ui.footer.hidden=false;const start=studySetsButton('학습 시작하기',startStudySetsAllWords,'study-sets-primary');start.id='study-all-words-start';start.disabled=!entries.length;ui.footer.append(start);
  // Reading the saved session changes only the entry label, never its progress.
  if(typeof loadSimpleStudySession==='function')void loadSimpleStudySession().then(session=>{
    if(start.isConnected&&session.queue.length&&session.history.length)start.textContent=`이어서 학습 · ${session.passed.length}/${session.initial.length}`;
  }).catch(error=>{vocabularyReviewLastError=error;});
  if(BreezeVocabularyTest.ENABLED){const test=studySetsButton('단어 테스트',()=>openVocabularyTest({kind:'all'}));test.id='study-all-words-test';test.disabled=!entries.length;ui.footer.append(test);}
  if(!entries.length){ui.body.append(studySetsEmpty('저장된 단어가 없어요','읽다가 뜻을 저장하거나 Memory에서 단어를 추가해 주세요.'));return;}
  const list=studySetsNode('ul','study-sets-word-list vocabulary-rows');list.id='study-all-words-list';
  if(!studySetsOpened.has('@all'))studySetsOpened.set('@all',new Set());
  const values=[...groups.values()];
  list.setAttribute('aria-label',`전체 ${values.length}단어`);list.dataset.total=String(values.length);
  const createRow=index=>{
    const entries=values[index],row=studySetsNode('li','study-all-words-row'),copy=createVocabularyGroup(entries,{ordinal:index+1,opened:studySetsOpened.get('@all')});
    row.dataset.index=String(index);row.setAttribute('aria-posinset',String(index+1));row.setAttribute('aria-setsize',String(values.length));
    // This detail is a projection of saved vocabulary, with no deletion,
    // exclusion gesture or incidental storage write from its rating display.
    const chip=copy.querySelector('.chip');if(chip){const rating=studySetsNode('span',chip.className,chip.textContent);rating.setAttribute('role','img');rating.setAttribute('aria-label',chip.getAttribute('aria-label'));chip.replaceWith(rating);}
    copy.querySelector('.vordinal')?.classList.add('study-sets-number');row.append(copy);return row;
  };
  ui.body.append(list);
  const opened=studySetsOpened.get('@all');
  ui.allWordsList=studySetsMountRows(list,values,createRow,{rowClass:'study-all-words-row',spacerClass:'study-all-words-spacer',tab:'word',key:entries=>entries[0][0],open:entries=>opened.has(entries[0][0])});
}
// 전체 단어 and a saved set share this cutoff. Longer lists mount a viewport.
function studySetsMountRows(list,items,createRow,options){
  list.dataset.total=String(items.length);
  if(items.length<=studySetsWindowLimit){for(let i=0;i<items.length;i++)list.append(createRow(i));return null;}
  return studySetsWindowRows(list,items,createRow,options);
}
// The viewport owns a bounded set of rows. Offscreen heights retain scroll
// geometry; the complete vocabulary and study queue never leave storage.
function studySetsWindowRows(list,items,createRow,options){
  const body=studySetsUI.body,rows=new Map(),rowSelector='.'+options.rowClass;
  let frame=0,disposed=false,width=body.clientWidth;
  const heights=items.map((item,index)=>{
    const cached=studySetsAllWordsHeights.get(options.key(item,index));
    return cached?.width===width&&cached.open===options.open(item,index)?cached.height:64;
  });
  let offsets=new Float64Array(items.length+1);
  const sum=()=>{offsets[0]=0;for(let i=0;i<heights.length;i++)offsets[i+1]=offsets[i]+heights[i];};sum();
  const locate=y=>{let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>1;if(offsets[mid+1]<=y)lo=mid+1;else hi=mid;}return items.length?Math.min(lo,items.length-1):0;};
  const top=()=>list.getBoundingClientRect().top-body.getBoundingClientRect().top+body.scrollTop;
  const spacer=height=>{const node=studySetsNode('li',options.spacerClass);node.setAttribute('aria-hidden','true');node.setAttribute('role','presentation');node.style.height=height+'px';return node;};
  let paintedStart=-1,paintedEnd=-1,paintedFocus=-1,cachedOrigin=0,pendingMeasure=false;
  const schedule=measure=>{
    if(disposed)return;
    if(measure)pendingMeasure=true;
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;const measureNow=pendingMeasure;pendingMeasure=false;refresh(null,measureNow);});
  };
  const observer=new ResizeObserver(()=>schedule(true));
  function refresh(requiredIndex=null,measure=true){
    if(disposed||!list.isConnected)return;
    const resized=width!==body.clientWidth;
    // A scroll that stays inside the mounted window does not change row heights.
    if(!measure&&!resized&&requiredIndex==null){
      const y=Math.max(0,body.scrollTop-cachedOrigin),anchor=locate(y),within=y-offsets[anchor],corrected=offsets[anchor]+within;
      const start=locate(Math.max(0,corrected-body.clientHeight)),end=Math.min(items.length,locate(corrected+body.clientHeight*2)+1);
      const focused=document.activeElement?.closest(rowSelector);
      const focusIndex=focused&&list.contains(focused)?Number(focused.getAttribute('data-index')):-1;
      if(start===paintedStart&&end===paintedEnd&&focusIndex===paintedFocus)return;
    }
    if(!items.length){list.replaceChildren();rows.clear();return;}
    const origin=top(),y=Math.max(0,body.scrollTop-origin),anchor=locate(y),within=y-offsets[anchor];
    width=body.clientWidth;
    if(resized){heights.fill(64);sum();}
    // Read the existing window in one layout pass before writing its replacement.
    let measured=false;
    for(const [index,row] of rows){
      if(row.classList.contains('study-sets-exiting')||row.classList.contains('study-sets-dragging')||index>=items.length)continue;
      const height=row.getBoundingClientRect().height;
      if(height&&height!==heights[index]){heights[index]=height;measured=true;}
      if(height)studySetsAllWordsHeights.set(options.key(items[index],index),{height,width,open:options.open(items[index],index)});
    }
    if(measured)sum();
    const corrected=offsets[anchor]+within;
    const start=locate(Math.max(0,corrected-body.clientHeight)),end=Math.min(items.length,locate(corrected+body.clientHeight*2)+1);
    const indices=new Set(Array.from({length:Math.max(0,end-start)},(_,i)=>start+i));
    if(Number.isInteger(requiredIndex))indices.add(requiredIndex);
    const focused=document.activeElement?.closest(rowSelector);
    const active=document.activeElement;
    if(focused&&list.contains(focused))indices.add(Number(focused.getAttribute('data-index')));
    for(const [index,row] of rows)if(index<items.length&&(row.classList.contains('study-sets-dragging')||row.classList.contains('study-sets-revealed')||row.classList.contains('study-sets-exiting')))indices.add(index);
    for(const [index,row] of rows)if(!indices.has(index)){observer.unobserve(row);row.remove();rows.delete(index);}
    const nodes=[];let cursor=0;
    for(const index of [...indices].sort((a,b)=>a-b)){
      if(index>cursor)nodes.push(spacer(offsets[index]-offsets[cursor]));
      let row=rows.get(index);
      if(!row){row=createRow(index);rows.set(index,row);observer.observe(row);}
      nodes.push(row);cursor=index+1;
    }
    if(cursor<items.length)nodes.push(spacer(offsets[items.length]-offsets[cursor]));
    // Keep focused retained nodes attached through a scroll/resize update.
    let next=list.firstChild;
    for(const node of nodes){if(node===next)next=next.nextSibling;else list.insertBefore(node,next);}
    while(next){const removed=next;next=next.nextSibling;removed.remove();}
    if(focused&&active instanceof HTMLElement&&document.activeElement!==active)active.focus({preventScroll:true});
    if((measured||resized)&&anchor>0)body.scrollTop=origin+corrected;
    paintedStart=start;paintedEnd=end;
    paintedFocus=focused&&list.contains(focused)?Number(focused.getAttribute('data-index')):-1;
    cachedOrigin=origin;
  }
  const focusRow=index=>{
    // Expansion may precede ResizeObserver delivery. Measure first, then mount
    // the requested row even if the browser clamps the old scroll.
    refresh(null,true);body.scrollTop=top()+offsets[index];refresh(index,true);return rows.get(index);
  };
  const keyboard=event=>{
    const row=event.target.closest?.(rowSelector);
    if(event.key!=='Tab'||!row||!list.contains(row))return;
    if(options.tab==='word'){
      if(!event.target.matches('.vword'))return;
      const index=Number(row.dataset.index)+(event.shiftKey?-1:1);
      if(index<0||index>=items.length)return;
      event.preventDefault();focusRow(index)?.querySelector('.vword').focus({preventScroll:true});
      return;
    }
    const focusables=[...row.querySelectorAll('button,.vword')].filter(node=>!node.disabled&&node.tabIndex>=0);
    if(!focusables.length)return;
    const edge=event.shiftKey?focusables[0]:focusables[focusables.length-1];
    if(event.target!==edge)return;
    const index=Number(row.dataset.index)+(event.shiftKey?-1:1);
    if(index<0||index>=items.length||rows.has(index))return;
    event.preventDefault();
    const next=focusRow(index);
    const nextFocusables=next?[...next.querySelectorAll('button,.vword')].filter(node=>!node.disabled&&node.tabIndex>=0):[];
    (event.shiftKey?nextFocusables[nextFocusables.length-1]:nextFocusables[0])?.focus({preventScroll:true});
  };
  // Drop one custom-set card without remounting rows that are still moving.
  function removeId(id){
    const index=items.findIndex(item=>item.id===id);
    if(disposed||index<0)return null;
    items.splice(index,1);heights.splice(index,1);
    const removed=rows.get(index);rows.delete(index);
    if(removed){observer.unobserve(removed);removed.remove();}
    const shifted=[...rows.entries()].filter(([rowIndex])=>rowIndex>index).sort((a,b)=>a[0]-b[0]);
    for(const [rowIndex] of shifted)rows.delete(rowIndex);
    for(const [rowIndex,kept] of shifted){
      const nextIndex=rowIndex-1;
      kept.dataset.index=String(nextIndex);kept.setAttribute('aria-posinset',String(nextIndex+1));kept.setAttribute('aria-setsize',String(items.length));
      const number=kept.querySelector('.study-sets-number');if(number)number.textContent=String(nextIndex+1);
      rows.set(nextIndex,kept);
    }
    for(const [,kept] of rows)kept.setAttribute('aria-setsize',String(items.length));
    offsets=new Float64Array(items.length+1);sum();
    list.dataset.total=String(items.length);
    paintedStart=paintedEnd=paintedFocus=-1;
    if(!items.length){list.replaceChildren();rows.clear();return null;}
    refresh(null,true);
    return rows.get(Math.min(index,items.length-1))||null;
  }
  const onScroll=()=>schedule(false);
  list.style.overflowAnchor='none';
  body.addEventListener('scroll',onScroll,{passive:true});list.addEventListener('keydown',keyboard);
  observer.observe(body);refresh(null,true);
  return {refresh,removeId,dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();body.removeEventListener('scroll',onScroll);list.removeEventListener('keydown',keyboard);rows.clear();}};
}
function renderStudySetsCreate(){
  const body=studySetsUI.body,form=document.createElement('form');form.id='study-sets-create-form';form.className='study-sets-form';
  const label=studySetsNode('label','study-sets-field','세트 이름');
  const input=document.createElement('input');input.id='study-sets-name';input.name='name';input.type='text';input.required=true;input.maxLength=100;input.placeholder='예: 이번 주 읽은 책';input.autocomplete='off';label.append(input);
  const booksField=studySetsNode('fieldset','study-sets-books');booksField.append(studySetsNode('legend','','책 선택'));
  const counts=BreezeStudySets.countsByBook(words);
  const names=[...new Set(Object.values(words).filter(item=>item&&typeof item.word==='string'&&item.word.trim()&&typeof item.ko==='string'&&item.ko.trim()).map(item=>typeof item.book==='string'?item.book:''))].sort((a,b)=>(counts.get(b)||0)-(counts.get(a)||0));
  const selection=new Set(),count=studySetsNode('p','study-sets-selection-count','책을 선택해 주세요.');count.id='study-sets-selection-count';count.setAttribute('aria-live','polite');
  const create=studySetsButton('세트 만들기',()=>{},'study-sets-primary');create.type='submit';create.id='study-sets-save';create.disabled=true;
  for(const title of names){
    const row=studySetsNode('label','study-sets-book');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=title;
    const text=studySetsNode('span','study-sets-book-name',title||'직접 추가');
    const number=studySetsNode('span','study-sets-caption',`${counts.get(title)||0}개`);
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked)selection.add(title);else selection.delete(title);
      const total=selection.size?BreezeStudySets.cards(words,[...selection]).length:0;
      count.textContent=selection.size?`${selection.size}권 · 중복을 뺀 단어·뜻 ${total}개`:'책을 선택해 주세요.';create.disabled=!total;
    });row.append(checkbox,text,number);booksField.append(row);
  }
  if(!names.length)booksField.append(studySetsEmpty('저장된 단어가 없어요','책을 읽다가 뜻을 저장하거나 Memory에서 단어를 추가해 주세요.'));
  form.append(label,booksField);create.setAttribute('form',form.id);studySetsUI.footer.hidden=false;studySetsUI.footer.append(count,create);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!input.value.trim()){input.setCustomValidity('세트 이름을 입력해 주세요.');input.reportValidity();return;}
    const options={name:input.value.trim(),bookTitles:[...selection]};
    if(studySetsUI.screen!=='create'||studySetsUI.retry||!selection.size||!BreezeStudySets.cards(words,[...selection]).length)return;
    studySetsMutate(state=>BreezeStudySets.create(state,options,words,Date.now()),result=>{studySetsUI.setId=result.set.id;studySetsUI.screen='detail';if(studySetsUI.directoryOrigin){studySetsUI.createdSetId=result.set.id;studySetsDirectoryFocus.set(studySetsUI.historyToken,result.set.id);studySetsReturnDirectory();return;}studySetsUI.setId=result.set.id;studySetsUI.screen='detail';studySetsUI.notice='';});
  });input.addEventListener('input',()=>input.setCustomValidity(''));body.append(form);
}
function renderStudySetsEdit(set){
  const body=studySetsUI.body;
  if(studySetsUI.screen==='delete'){
    body.append(studySetsNode('p','',`“${set.name}” 학습 세트를 삭제할까요?`),studySetsMessage('세트와 학습 기록이 삭제돼요. 원본 단어는 남아요.'));
    const actions=studySetsNode('div','study-sets-actions');
    actions.append(studySetsButton('취소',studySetsBack),studySetsButton('세트 삭제',()=>studySetsMutate(state=>BreezeStudySets.remove(state,set.id),()=>{
      if(studySetsUI.directoryOrigin){studySetsReturnDirectory();return;}
      studySetsUI.screen='list';studySetsUI.setId='';studySetsUI.notice='학습 세트를 삭제했어요.';
      if(studySetsUI.homeEntry)closeStudySets();
    }),'study-sets-danger'));
    body.append(actions);return;
  }
  const form=document.createElement('form');form.className='study-sets-form';
  const label=studySetsNode('label','study-sets-field','세트 이름');
  const input=document.createElement('input');input.id='study-sets-rename-input';input.value=set.name;input.maxLength=100;input.required=true;input.setAttribute('data-study-sets-focus','');label.append(input);
  const save=studySetsButton('이름 저장',()=>{},'study-sets-primary');save.type='submit';
  form.append(label,save);form.addEventListener('submit',event=>{
    event.preventDefault();if(!input.value.trim()){input.setCustomValidity('세트 이름을 입력해 주세요.');input.reportValidity();return;}
    const name=input.value.trim();studySetsMutate(state=>BreezeStudySets.rename(state,set.id,name,Date.now()),()=>{if(studySetsUI.directoryOrigin){studySetsUI.pendingClose=true;history.back();return;}studySetsUI.screen='detail';studySetsUI.notice='';});
  });input.addEventListener('input',()=>input.setCustomValidity(''));body.append(form);
}
function renderStudySetsBooks(set){
  const form=studySetsNode('form','study-sets-form'),field=studySetsNode('fieldset','study-sets-books');
  field.append(studySetsNode('legend','','책 선택'));
  const counts=BreezeStudySets.countsByBook(words);
  const names=[...new Set(Object.values(words).filter(validWordMeaning).map(item=>typeof item.book==='string'?item.book:''))]
    .filter(title=>!set.bookTitles.includes(title)).sort((a,b)=>a.localeCompare(b));
  const selection=new Set(),count=studySetsNode('p','study-sets-selection-count');count.setAttribute('aria-live','polite');
  const save=studySetsButton('추가',()=>{},'study-sets-primary');save.type='submit';save.id='study-sets-add-books';save.disabled=true;
  for(const title of names){
    const row=studySetsNode('label','study-sets-book'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=title;
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked)selection.add(title);else selection.delete(title);
      const preview=BreezeStudySets.addBooks(studySetsUI.state,set.id,[...selection],words,Date.now());
      count.textContent=selection.size?`${selection.size}권 · ${preview.added}개`:'';save.disabled=!selection.size;
    });
    row.append(checkbox,studySetsNode('span','study-sets-book-name',title||'직접 추가'),
      studySetsNode('span','study-sets-caption',`${counts.get(title)||0}개`));field.append(row);
  }
  if(!names.length)field.append(studySetsEmpty('추가할 책이 없어요',''));
  form.append(field,count,save);form.addEventListener('submit',event=>{
    event.preventDefault();if(!selection.size)return;
    studySetsMutate(state=>BreezeStudySets.addBooks(state,set.id,[...selection],words,Date.now()),()=>{
      if(studySetsUI.directoryOrigin){studySetsUI.pendingClose=true;history.back();return;}
      studySetsUI.screen='detail';studySetsUI.notice='';
    });
  });studySetsUI.body.append(form);
}
// Undo owns a touch release directly: browsers can omit its compatibility click
// while the surrounding list is animating. Mouse and keyboard retain click.
function studySetsTouchAction(button,action){
  let press=null;
  button.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||event.isPrimary===false)return;
    press={id:event.pointerId,x:event.clientX,y:event.clientY,canceled:false};
  });
  button.addEventListener('pointermove',event=>{
    if(press&&event.pointerId===press.id&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8)press.canceled=true;
  });
  button.addEventListener('pointercancel',()=>{if(press)studySetsUI.releaseClickId=press.id;press=null;});
  button.addEventListener('pointerup',event=>{
    const start=press;press=null;if(!start||event.pointerId!==start.id||!button.isConnected)return;
    studySetsUI.releaseClickId=event.pointerId;event.preventDefault();
    const bounds=button.getBoundingClientRect();
    if(start.canceled||event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return;
    action(event);
  });
}
function renderStudySetsDetailFooter(set){
  studySetsUI.footer.replaceChildren();
  {
    const view=BreezeStudySets.view(studySetsUI.state,set.id);
    const available=BreezeStudySets.listedCards(set,words).length;
    const startText=view.status==='active'?`이어서 학습 · ${view.completed}/${view.total}`:'학습';
    const row=studySetsNode('div','study-sets-launch');
    const start=studySetsButton(startText,()=>studySetsStart(set.id),'study-sets-primary');start.id='study-sets-start';start.disabled=!available&&view.status!=='active';
    const prototype=typeof BreezeVocabularyTest!=='undefined'&&BreezeVocabularyTest.ENABLED;
    const test=studySetsButton('테스트',()=>studySetsGo('test-setup'));test.id=prototype?'study-set-recall-open':'study-sets-test';test.disabled=!available;
    row.append(start,test);
    studySetsUI.footer.hidden=false;studySetsUI.footer.append(row);
    if(prototype){const legacy=studySetsButton('단어 테스트',()=>openVocabularyTest({kind:'set',setId:set.id}));legacy.id='study-sets-test';legacy.disabled=set.cards.length===set.excludedIds.length;studySetsUI.footer.append(legacy);}
  }
  if(studySetsUI.undo){
    const undo=studySetsUI.undo;const notice=studySetsNode('div','study-sets-undo');notice.setAttribute('role','status');
    const restore=()=>studySetsMutate(state=>(undo.ids||[undo.id]).reduce((next,id)=>BreezeStudySets.restore(next.state,set.id,id,Date.now()),{state}),()=>{studySetsUI.undo=null;studySetsUI.notice='';});
    const button=studySetsButton('실행 취소',restore);studySetsTouchAction(button,restore);
    notice.append(studySetsNode('span','',`“${undo.word}” 제외됨`),button);studySetsUI.footer.prepend(notice);
  }
}
function renderStudySetsDetail(set,excluded){
  const body=studySetsUI.body;
  const cards=BreezeStudySets.listedCards(set,words,excluded);
  if(!excluded)renderStudySetsDetailFooter(set);
  if(!cards.length){body.append(studySetsEmpty(excluded?'제외한 단어가 없어요':'세트에 학습할 단어가 없어요',''));return;}
  const list=studySetsNode('ul','study-sets-word-list vocabulary-rows');list.id=excluded?'study-sets-excluded-list':'study-sets-word-list';
  if(!studySetsOpened.has(set.id))studySetsOpened.set(set.id,new Set());
  const opened=studySetsOpened.get(set.id),grouped=BreezeStudySets.groupedCards(cards);
  const createRow=index=>{
    const card=grouped[index],item=studySetsNode('li','study-sets-word-row');item.dataset.cardId=card.id;item.dataset.index=String(index);
    item.setAttribute('aria-posinset',String(index+1));item.setAttribute('aria-setsize',String(grouped.length));
    const clip=studySetsNode('div','study-sets-word-clip');
    const surface=studySetsNode('div','study-sets-word-surface');
    const members=card.senses||[card],memberIds=members.map(sense=>sense.id);
    const copy=createVocabularyGroup(members.map(sense=>[sense.id,{...sense,status:sense.status||1}]),{
      ordinal:index+1,opened,
      onStatus:status=>studySetsMutate(state=>BreezeStudySets.setStatus(state,set.id,card.id,status,Date.now()))
    });
    copy.querySelector('.vordinal')?.classList.add('study-sets-number');
    const action=studySetsButton(excluded?'다시 담기':'제외',()=>{
      studySetsMutate(state=>memberIds.reduce((next,id)=>excluded?BreezeStudySets.restore(next.state,set.id,id,Date.now()):BreezeStudySets.exclude(next.state,set.id,id,Date.now()),{state}),()=>{
        studySetsUI.undo=excluded?null:{id:card.id,ids:memberIds,word:card.word};studySetsUI.notice='';
      },excluded?null:item);
    },'study-sets-row-action'+(excluded?' study-sets-restore':''));action.setAttribute('aria-label',`${card.word} ${excluded?'다시 담기':'세트에서 제외'}`);
    surface.append(copy);
    if(excluded)surface.append(action);else{action.textContent='';action.append(studySetsIcon('remove'));action.title='세트에서 제외';clip.append(action);}
    clip.append(surface);item.append(clip);
    if(!excluded)studySetsSwipe(item,surface,action);
    return item;
  };
  body.append(list);
  studySetsUI.allWordsList=studySetsMountRows(list,grouped,createRow,{rowClass:'study-sets-word-row',spacerClass:'study-sets-window-spacer',tab:'edge',key:card=>'set:'+set.id+':'+card.id,open:card=>opened.has(card.id)});
}
function studySetsSwipe(row,surface,action){
  // These read-only rows own a horizontal gesture. Native text dragging would
  // cancel pointer events and hand the gesture to the app's file-drop overlay.
  // Cancel only selection/drag defaults here, not pointerdown or vertical scroll.
  row.addEventListener('selectstart',event=>event.preventDefault(),true);
  row.addEventListener('dragstart',event=>{event.preventDefault();event.stopPropagation();},true);
  let start=null,suppressClick=false,offset=0,stop=null;
  const width=()=>row.getBoundingClientRect().width||320;
  const fullThreshold=()=>Math.max(144,width()*.62);
  const paint=amount=>{
    offset=Math.max(0,Math.min(width(),amount));
    surface.style.transform=offset?`translateX(${-offset}px)`:'';
    action.style.width=Math.max(44,offset-28)+'px';action.style.opacity=String(Math.min(1,offset/32));
    row.classList.toggle('study-sets-revealed',offset>0);
    row.classList.toggle('study-sets-swiped',offset>=fullThreshold());
  };
  const settle=(target,velocity=0)=>{stop?.();row.classList.add('study-sets-dragging');stop=studySpring(offset,target,velocity,paint,()=>{stop=null;row.classList.remove('study-sets-dragging');});};
  const close=()=>{start=null;settle(0);if(studySetsUI.swipeClose===close)studySetsUI.swipeClose=null;};
  const park=(velocity=0)=>{settle(72,velocity);studySetsUI.swipeClose=close;};
  action.addEventListener('focus',()=>{if(!start&&!row.classList.contains('study-sets-exiting')){if(studySetsUI.swipeClose!==close)studySetsUI.swipeClose?.();park();}});
  row.addEventListener('pointerdown',event=>{
    if(studySetsQueuedRows.has(row)||row.classList.contains('study-sets-exiting')||event.button!==0||event.isPrimary===false||event.target instanceof Element&&event.target.closest('.study-sets-row-action'))return;
    if(studySetsUI.swipeClose!==close)studySetsUI.swipeClose?.();
    stop?.();stop=null;suppressClick=false;start={x:event.clientX,y:event.clientY,id:event.pointerId,axis:'',base:offset,samples:[{x:event.clientX,t:event.timeStamp}],control:event.target instanceof Element&&!!event.target.closest('.chip')};
  });
  row.addEventListener('pointermove',event=>{
    if(!start||start.id!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    start.samples.push({x:event.clientX,t:event.timeStamp});start.samples=start.samples.filter(p=>event.timeStamp-p.t<=120);
    if(start.control){if(Math.max(Math.abs(dx),Math.abs(dy))>=8)suppressClick=true;return;}
    if(!start.axis){
      if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;
      if(Math.abs(dy)>=Math.abs(dx)||dx>0&&!start.base){suppressClick=true;close();return;}
      start.axis='x';try{row.setPointerCapture(event.pointerId);}catch(_){}row.classList.add('study-sets-dragging');studySetsUI.swipeClose=close;
    }
    suppressClick=true;event.preventDefault();paint(start.base-dx);
  });
  row.addEventListener('pointerup',event=>{
    if(!start||start.id!==event.pointerId)return;
    if(start.control){start=null;return;}
    const moved=start.axis==='x',wasOpen=!!start.base,travel=start.x-event.clientX,amount=start.base+travel,velocity=-studyReleaseVelocity(start.samples,event.timeStamp);start=null;
    row.classList.remove('study-sets-dragging');
    if(moved&&velocity>=-.2&&travel>=36&&amount+Math.max(0,velocity)*140>=fullThreshold()){paint(amount);row.dataset.releaseVelocity=String(velocity);action.click();}
    else if(moved&&velocity>=-.2&&amount>=36)park(velocity);
    else{if(wasOpen)suppressClick=true;close();}
  });
  row.addEventListener('pointercancel',()=>{if(start)suppressClick=true;close();});
  // Touch initially captures to the hit child (e.g. .vko). Its capture-loss
  // bubbles here when we transfer capture to the row; that is not cancellation.
  row.addEventListener('lostpointercapture',event=>{if(start&&event.target===row&&event.pointerId===start.id) {suppressClick=true;close();}});
  row.addEventListener('click',event=>{if(suppressClick&&event.detail!==0&&event.target!==action&&!action.contains(event.target)){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
  // No per-row document listener: one shared owner closes a parked row.
}
document.addEventListener('click',event=>{
  const id=studySetsUI.releaseClickId;
  if(id!==null&&event.detail>0&&(!('pointerId' in event)||event.pointerId===id)){
    studySetsUI.releaseClickId=null;event.preventDefault();event.stopImmediatePropagation();
  }
},true);
document.addEventListener('pointerdown',event=>{
  studySetsUI.releaseClickId=null;
  if(studySetsUI.editOpen&&event.target instanceof Node&&!studySetsUI.editMenu?.contains(event.target)&&!studySetsUI.editButton?.contains(event.target)&&!studySetsUI.back?.contains(event.target)){studySetsCloseEditMenu(false);studySetsUI.releaseClickId=event.pointerId;event.stopPropagation();}
  const revealed=document.querySelector('.study-sets-word-row.study-sets-revealed:not(.study-sets-exiting)');
  if(revealed&&event.target instanceof Node&&!revealed.contains(event.target))studySetsUI.swipeClose?.();
},true);
function studySetsStart(id,restart=false){
  return studySetsMutate(state=>{
    const replacing=restart||BreezeStudySets.view(state,id).status==='complete';
    return BreezeStudySets.start(state,id,Date.now(),{restart:replacing,words:replacing?words:undefined});
  },()=>{
    const entering=studySetsUI.screen!=='study';studySetsUI.screen='study';studySetsUI.setId=id;studySetsUI.notice='';studySetsUI.undo=null;
    if(entering){if(studySetsUI.directoryOrigin)studySetsUI.directoryDepth++;history.pushState({...history.state,studySetsScreen:'study',studySetsDirectoryDepth:studySetsUI.directoryDepth},'');}});
}
function renderStudySetsStudy(set){
  const body=studySetsUI.body,view=BreezeStudySets.view(studySetsUI.state,set.id);
  body.classList.add('study-session-body');
  const undo=()=>studySetsMutate(state=>BreezeStudySets.undo(state,set.id,Date.now()),()=>{studySetsUI.notice='';});
  const undoButton=studySetsButton('되돌리기',undo,'study-session-undo');undoButton.id='study-sets-study-undo';undoButton.hidden=true;undoButton.disabled=!set.session?.answers.length;
  if(view.status==='complete'){
    const complete=studySetsNode('div','study-sets-complete');
    const back=studySetsButton('세트로 돌아가기',()=>studySetsGo('detail'));back.id='study-sets-complete-back';
    const restart=studySetsButton('다시 시작하기',()=>{if(restart.isConnected)studySetsStart(set.id,true);});restart.id='study-sets-restart';
    complete.append(studySetsNode('h3','','이번 세션 완료'),studySetsNode('p','study-sets-result',`${view.completed} / ${view.total}`),undoButton,back,restart);body.append(complete);return;
  }
  if(view.status!=='active'||!view.card){body.append(studySetsEmpty('학습할 단어가 없어요',''),studySetsButton('세트로 돌아가기',()=>studySetsGo('detail')));return;}
  const progress=studySetsNode('div','study-sets-progress');
  const text=studySetsNode('span','',`${view.completed} / ${view.total}`);text.id='study-sets-progress';progress.append(text);
  const meter=document.createElement('progress');meter.max=view.total;meter.value=view.completed;meter.setAttribute('aria-label','이번 세션에서 기억한 카드');body.append(progress,meter);
  const stack=studySetsNode('div','study-session-stack');
  const underneath=studySetsNode('div','study-session-next');underneath.setAttribute('aria-hidden','true');stack.append(underneath);
  const meanings=view.card.acceptedMeanings||[view.card.ko],meaningText=meanings.length>1?meanings.map((value,index)=>`${index+1}. ${value}`).join('\n'):view.card.ko;
  // Word/meaning only until the owner explicitly approves example display again.
  const card=studySetsNode('div','study-sets-flashcard');card.id='study-sets-flashcard';card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('data-study-sets-focus','');card.setAttribute('aria-label',`${view.card.word}. ${view.revealed?meaningText+'. 오른쪽 알아요, 왼쪽 다시 보기':'탭하여 정답 확인'}`);
  const word=studySetsNode('h3','',view.card.word);word.id='study-sets-expression';card.append(word);
  const meaning=studySetsNode('p','study-sets-card-meaning',view.revealed?meaningText:'');meaning.id='study-sets-answer';meaning.hidden=!view.revealed;card.append(meaning);
  stack.append(card);body.append(stack);
  const hint=studySetsNode('p','study-session-hint','탭하여 정답 확인');hint.hidden=view.revealed;hint.setAttribute('aria-live','polite');body.append(hint,undoButton);
  let busy=false;
  const reveal=()=>{if(busy||view.revealed)return;studySetsMutate(state=>BreezeStudySets.reveal(state,set.id,view.token),()=>{studySetsUI.notice='';});};
  const grade=async outcome=>{
    if(busy||studySetsUI.mutating||!view.revealed||!card.isConnected)return;
    busy=true;undoButton.disabled=true;card.dataset.direction=outcome;
    await studySetsMutate(state=>BreezeStudySets.grade(state,set.id,view.token,outcome,Date.now()),()=>{studySetsUI.notice='';},null,motion.exit(outcome==='remembered'?1:-1));
    if(card.isConnected){motion.reset();busy=false;undoButton.disabled=!set.session?.answers.length;}
  };
  const motion=studyCardMotion(card,{ready:()=>view.revealed,enabled:()=>!busy&&!studySetsUI.mutating,reveal,grade});
  card.addEventListener('keydown',event=>{
    if(['Enter',' '].includes(event.key)){event.preventDefault();reveal();}
    if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();grade(event.key==='ArrowLeft'?'repeat':'remembered');}
  });
  const actions=studySetsNode('div','study-session-accessible-actions');
  const revealAction=studySetsButton('정답 확인',reveal);revealAction.id='study-sets-reveal';revealAction.hidden=view.revealed;actions.append(revealAction);
  for(const [outcome,label] of [['repeat','← 다시 보기'],['remembered','알아요 →']]){const button=studySetsButton(label,event=>{if(event.detail>1)return;grade(outcome);});button.id='study-sets-grade-'+outcome;button.disabled=!view.revealed;button.hidden=!view.revealed;actions.append(button);}body.append(actions);

}
function studySetsStorageChanged(key){
  if(key!==null&&key!==STUDY_SETS_STORAGE)return;
  refreshStudySetsEntry();
  // Never discard typed input or replace a retryable answer after a failed write.
  if(studySetsIsOpen()&&!studySetsUI.retry&&!studySetsUI.mutating&&!['create','rename','books','delete','test-setup','test','test-result'].includes(studySetsUI.screen))studySetsReadAndRender(false);
}
window.addEventListener('storage',event=>studySetsStorageChanged(event.key));
window.addEventListener('breeze-study-storage',event=>studySetsStorageChanged(/** @type {CustomEvent} */(event).detail));
refreshStudySetsEntry();

document.addEventListener('keydown',event=>{if(!studySetsUI.editOpen)return;const items=[...(studySetsUI.editMenu?.querySelectorAll('button')||[])];if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();studySetsCloseEditMenu(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const at=items.findIndex(item=>item===document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;items[next]?.focus({preventScroll:true});}else if(event.key==='Tab'){studySetsCloseEditMenu(false,true);}},true);
