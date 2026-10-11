/* Study sets are local snapshots. This surface never writes saved Meanings or
   enters the general word-card deck. Every action starts from durable state. */
const studySetsUI={
  dialog:/** @type {HTMLDialogElement|null} */(null),
  sheet:/** @type {HTMLElement|null} */(null),
  body:/** @type {HTMLElement|null} */(null),
  footer:/** @type {HTMLElement|null} */(null),
  error:/** @type {HTMLElement|null} */(null),
  title:/** @type {HTMLElement|null} */(null),
  back:/** @type {HTMLButtonElement|null} */(null),
  returnFocus:/** @type {HTMLElement|null} */(null),
  retry:/** @type {null|(()=>void)} */(null),
  screen:'list',setId:'',notice:'',undo:null,historyToken:'',pendingClose:false,homeEntry:false,managementEntry:false,
  swipeClose:/** @type {null|(()=>void)} */(null),
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
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',kind==='close'?'M6 6l12 12M18 6L6 18':kind==='back'?'M14 5l-7 7 7 7':kind==='chevron'?'M9 5l7 7-7 7':kind==='more'?'M5 12h.01M12 12h.01M19 12h.01':kind==='remove'?'M6 12h12':'M12 5v14M5 12h14');
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
  header.append(back,title,close);
  const error=studySetsNode('div','study-sets-error');error.id='study-sets-error';error.hidden=true;error.setAttribute('role','alert');
  const body=studySetsNode('div','study-sets-body');body.id='study-sets-content';
  const footer=studySetsNode('footer','study-sets-footer');footer.hidden=true;
  sheet.append(header,error,body,footer);dialog.append(sheet);document.body.append(dialog);
  Object.assign(studySetsUI,{dialog,sheet,body,footer,error,title,back});
  let backdropDown=false;
  dialog.addEventListener('pointerdown',event=>{backdropDown=event.target===dialog;});
  dialog.addEventListener('click',event=>{if(event.target===dialog&&backdropDown)closeStudySets();backdropDown=false;});
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeStudySets();});
  // Keep app-wide card/reader shortcuts from handling keys owned by this modal.
  dialog.addEventListener('keydown',event=>{event.stopPropagation();});
  dialog.addEventListener('close',()=>{
    studySetsUI.retry=null;studySetsUI.undo=null;
    renderStudySetsHome();
    const previous=studySetsUI.returnFocus;
    const target=previous?.isConnected?previous:previous?.dataset.setId?
      [...document.querySelectorAll('.study-sets-home-card[data-set-id]')].find(item=>item.getAttribute('data-set-id')===previous.dataset.setId):
      previous?.id?document.getElementById(previous.id):null;
    if(target instanceof HTMLElement)target.focus({preventScroll:true});
    else if(studySetsUI.homeEntry)document.getElementById('study-sets-home-create')?.focus({preventScroll:true});
  });
}
function refreshStudySetsEntry(){
  renderStudySetsHome();
}
function renderStudySetsHome(){
  const container=document.getElementById('study-sets-home-list');if(!container)return;
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
  const all=card(`전체 단어 · ${count}개`,'',()=>show('vocab'));all.id='study-sets-all';all.classList.add('study-sets-home-default');
  let state=null;
  try{state=readStudySets();}catch(error){
    const notice=studySetsNode('div','study-sets-home-error');notice.setAttribute('role','alert');
    notice.append(studySetsNode('p','','학습 세트를 불러오지 못했어요. 저장된 데이터는 바꾸지 않았어요.'),studySetsButton('다시 시도',renderStudySetsHome));
    const item=studySetsNode('li');item.append(notice);list.append(item);
  }
  for(const set of state?.sets||[]){
    const view=BreezeStudySets.view(state,set.id),active=set.cards.length-set.excludedIds.length;
    const progress=view.status==='active'?` · ${view.completed}/${view.total}`:'';
    const button=card(set.name,`${active}개${progress}`,()=>openStudySet(set.id));
    button.dataset.setId=set.id;studySetsHomeMenuGesture(button,set.id);
    const menu=studySetsIconButton(`${set.name} 관리`,'more',()=>{button.focus();openStudySets(false,'menu',set.id,true);});
    menu.classList.add('study-sets-home-menu-trigger');button.parentElement.append(menu);
    button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','study-sets-dialog');
  }
  const create=card('','',openStudySetsCreate,'add');
  create.id='study-sets-home-create';create.setAttribute('aria-label','새 학습 세트');create.classList.add('study-sets-home-add');create.disabled=!state;
  create.setAttribute('aria-haspopup','dialog');create.setAttribute('aria-controls','study-sets-dialog');
  container.replaceChildren(list);
  if(focused&&!studySetsUI.dialog?.open){
    const replacement=focused.dataset.setId?[...list.querySelectorAll('[data-set-id]')].find(item=>item.dataset.setId===focused.dataset.setId):document.getElementById(focused.id);
    if(replacement instanceof HTMLElement)replacement.focus({preventScroll:true});
  }
}
function studySetsHomeMenuGesture(button,id){
  let timer=null,start=null,suppressClick=false;
  const cancel=()=>{if(timer!==null)clearTimeout(timer);timer=null;start=null;};
  const open=()=>{cancel();if(!button.isConnected)return;suppressClick=true;button.focus();openStudySets(false,'menu',id,true);};
  button.addEventListener('contextmenu',event=>{event.preventDefault();open();});
  button.addEventListener('keydown',event=>{
    if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();open();}
  });
  button.addEventListener('pointerdown',event=>{
    cancel();suppressClick=false;if(event.button!==0)return;
    start={x:event.clientX,y:event.clientY,id:event.pointerId};timer=setTimeout(open,500);
  });
  button.addEventListener('pointermove',event=>{if(start&&start.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>8){suppressClick=true;cancel();}});
  for(const type of ['pointerup','lostpointercapture','pointerleave'])button.addEventListener(type,cancel);
  button.addEventListener('pointercancel',()=>{suppressClick=true;cancel();});
  button.addEventListener('click',event=>{if(suppressClick&&event.detail!==0){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
}
function openStudySetsCreate(){openStudySets(false,'create','',true);}
function openStudySet(id){openStudySets(false,'detail',id,true);}
function openStudySets(fromHistory=false,screen='list',setId='',homeEntry=false){
  if(studySetsUI.pendingClose)return;
  ensureStudySetsDialog();
  if(studySetsUI.dialog.open)return;
  studySetsUI.returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  studySetsUI.screen=fromHistory?history.state?.studySetsScreen||'list':screen;
  studySetsUI.setId=fromHistory?history.state?.studySetsSetId||'':setId;
  studySetsUI.homeEntry=fromHistory?!!history.state?.studySetsHome:homeEntry;
  studySetsUI.managementEntry=fromHistory?!!history.state?.studySetsManagement:screen==='menu';
  studySetsUI.notice='';studySetsUI.undo=null;
  studySetsUI.state=null;studySetsUI.body.replaceChildren();
  studySetsUI.title.textContent=studySetsUI.screen==='create'?'새 학습 세트':'학습 세트';
  studySetsUI.back.hidden=studySetsUI.screen==='list';
  if(!fromHistory){
    studySetsUI.historyToken=String(Date.now())+'-'+String(Math.random()).slice(2);
    history.pushState({breeze:true,view:typeof activeAppView==='function'?activeAppView():'memory',studySets:studySetsUI.historyToken,studySetsScreen:studySetsUI.screen,studySetsSetId:studySetsUI.setId,studySetsHome:studySetsUI.homeEntry,studySetsManagement:studySetsUI.managementEntry},'');
  }else studySetsUI.historyToken=history.state?.studySets||'';
  studySetsUI.dialog.showModal();studySetsReadAndRender();
}
function closeStudySets(fromHistory=false){
  if(!studySetsUI.dialog?.open)return;
  studySetsUI.dialog.close();
  if(fromHistory&&history.state?.studySets===studySetsUI.historyToken){
    const base={...history.state};for(const key of ['studySets','studySetsScreen','studySetsSetId','studySetsHome','studySetsManagement'])delete base[key];history.replaceState(base,'');
  }
  if(!fromHistory&&history.state?.studySets===studySetsUI.historyToken){
    studySetsUI.pendingClose=true;history.back();
  }
}
window.addEventListener('popstate',event=>{
  const currentView=typeof activeAppView==='function'?activeAppView():'vocab';
  const targetView=event.state?.breeze?event.state.view:'home';
  const wasOpen=!!studySetsUI.dialog?.open;
  if(studySetsUI.pendingClose){
    studySetsUI.pendingClose=false;
    if(targetView===currentView&&!event.state?.studySets)event.stopImmediatePropagation();
    return;
  }
  if(wasOpen)closeStudySets(true);
  if(event.state?.studySets){
    // A multi-entry history jump can reach a modal from a different app view.
    // Restore its underlying page before making the rest of the app inert.
    if(targetView!==currentView&&typeof show==='function')show(targetView,{fromHistory:true});
    event.stopImmediatePropagation();openStudySets(true);return;
  }
  // Normal Back dismisses this layer. A jump farther back still belongs to the
  // app's navigation handler so the displayed page and history cannot diverge.
  if(wasOpen&&targetView===currentView)event.stopImmediatePropagation();
},true);
function studySetsShowError(error,retry){
  studySetsUI.retry=retry;studySetsUI.error.replaceChildren();studySetsUI.error.hidden=false;
  const message=String(error?.message||'');
  const detail=/newer|version/i.test(message)?'이 앱보다 새로운 형식의 데이터예요. 앱을 업데이트해 주세요. 저장된 데이터는 바꾸지 않았어요.':
    /Invalid study sets data/i.test(message)?'저장된 데이터를 읽을 수 없어요. 원본 데이터는 그대로 보관하고 있어요.':
    /changed/i.test(message)?'다른 창에서 변경되었어요. 다시 시도하면 최신 상태에 반영해요.':
    '기기 저장 공간과 저장소 접근을 확인한 뒤 다시 시도해 주세요.';
  studySetsUI.error.append(studySetsNode('p','','학습 세트를 저장하거나 불러오지 못했어요. 현재 단계는 그대로예요.'),studySetsNode('p','study-sets-caption',detail));
  studySetsUI.error.append(studySetsButton('다시 시도',()=>studySetsUI.retry?.()));
}
function studySetsClearError(){studySetsUI.retry=null;studySetsUI.error.hidden=true;studySetsUI.error.replaceChildren();}
function studySetsReadAndRender(focus=true){
  try{studySetsUI.state=readStudySets();studySetsClearError();renderStudySets(focus);}
  catch(error){studySetsShowError(error,()=>studySetsReadAndRender(focus));}
}
function studySetsMutate(change,success,exitRow=null){
  const retry=()=>studySetsMutate(change,success,exitRow);
  try{
    const result=change(readStudySets());
    if(!result.accepted){
      studySetsUI.state=result.state;studySetsClearError();
      studySetsUI.notice='다른 곳에서 변경된 최신 상태를 불러왔어요.';renderStudySets();refreshStudySetsEntry();return;
    }
    // Do not advance the DOM, hide the answer, or drop form input before this succeeds.
    commitStudySets(result.state);studySetsUI.state=result.state;studySetsClearError();
    const previousScreen=studySetsUI.screen;
    if(success)success(result);
    const focus=!(['detail','excluded'].includes(previousScreen)&&previousScreen===studySetsUI.screen);
    refreshStudySetsEntry();
    if(exitRow&&studySetsAnimateExit(exitRow))return;
    renderStudySets(focus);
  }catch(error){if(exitRow)studySetsUI.swipeClose?.();studySetsShowError(error,retry);}
}
function studySetsAnimateExit(row){
  if(!row.isConnected||typeof row.animate!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return false;
  const surface=row.querySelector('.study-sets-word-surface'),height=row.getBoundingClientRect().height,width=row.getBoundingClientRect().width;
  if(!surface||!height)return false;
  const screen=studySetsUI.screen,setId=studySetsUI.setId;
  studySetsUI.swipeClose=null;row.classList.add('study-sets-exiting');row.setAttribute('aria-busy','true');
  const action=row.querySelector('.study-sets-row-action');if(action){action.disabled=true;action.style.width=Math.max(44,width-24)+'px';}
  // Membership is already durable. Animate only the committed visual removal.
  let exit;
  try{exit=surface.animate([{transform:surface.style.transform||'translateX(0)'},{transform:`translateX(${-width}px)`}],{duration:140,easing:'ease-in',fill:'forwards'});}catch(_){row.classList.remove('study-sets-exiting');return false;}
  const finish=()=>{
    if(!row.isConnected||!studySetsUI.dialog?.open||studySetsUI.screen!==screen||studySetsUI.setId!==setId)return;
    const set=studySetsUI.state?.sets.find(item=>item.id===setId);if(!set)return;
    const focused=row.contains(document.activeElement),next=row.nextElementSibling||row.previousElementSibling;
    row.remove();
    // Keep neighboring rows and their pointer capture alive during consecutive swipes.
    renderStudySetsDetailFooter(set);
    if(!studySetsUI.body.querySelector('.study-sets-word-row'))studySetsUI.body.replaceChildren(studySetsEmpty('세트에 학습할 단어가 없어요',''));
    if(focused){const target=next?.querySelector('.study-sets-word-toggle')||studySetsUI.title;target.focus({preventScroll:true});}
  };
  exit.finished.then(()=>{
    if(!row.isConnected)return;
    const collapse=row.animate([{height:height+'px',opacity:1},{height:'0px',opacity:0}],{duration:180,easing:'ease-out',fill:'forwards'});
    return collapse.finished;
  }).then(finish,finish);
  return true;
}
function studySetsGo(screen,setId=studySetsUI.setId){
  studySetsUI.screen=screen;studySetsUI.setId=setId;studySetsUI.notice='';
  if(screen!=='detail')studySetsUI.undo=null;
  studySetsReadAndRender();
}
function studySetsBack(){
  const screen=studySetsUI.screen;
  if(screen==='list'||studySetsUI.homeEntry&&['detail','create','menu'].includes(screen)){closeStudySets();return;}
  studySetsGo(studySetsUI.managementEntry&&['excluded','rename','delete'].includes(screen)?'menu':['study','excluded','rename','delete'].includes(screen)?'detail':'list');
}
function studySetsMessage(text){
  const message=studySetsNode('p','study-sets-caption',text);return message;
}
function studySetsEmpty(title,description){
  const empty=studySetsNode('div','study-sets-empty');
  empty.append(studySetsNode('h3','',title),studySetsMessage(description));return empty;
}
function renderStudySets(focus=true){
  const ui=studySetsUI;if(!ui.dialog?.open||!ui.state)return;
  const scrollTop=ui.body.scrollTop;
  const active=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const oldRows=[...ui.body.querySelectorAll('.study-sets-word-row')];
  const focusedRow=active?.closest('.study-sets-word-row');
  const focusedIndex=focusedRow?oldRows.indexOf(focusedRow):-1;
  const focusId=active?.id;
  const set=ui.state.sets.find(item=>item.id===ui.setId);
  if(ui.screen!=='list'&&ui.screen!=='create'&&!set){
    if(ui.homeEntry){closeStudySets();return;}
    ui.screen='list';ui.setId='';ui.notice='이 학습 세트가 삭제되었어요.';
  }
  if(history.state?.studySets===ui.historyToken)history.replaceState({...history.state,studySetsScreen:ui.screen,studySetsSetId:ui.setId,studySetsHome:ui.homeEntry,studySetsManagement:ui.managementEntry},'');
  ui.sheet.dataset.screen=ui.screen;
  ui.swipeClose?.();ui.body.replaceChildren();ui.footer.replaceChildren();ui.footer.hidden=true;ui.back.hidden=ui.screen==='list';
  const titles={list:'학습 세트',create:'새 학습 세트',excluded:'제외한 단어',rename:'이름 변경',delete:'학습 세트 삭제'};
  ui.title.textContent=titles[ui.screen]||set?.name||'학습 세트';
  if(ui.notice){const notice=studySetsNode('p','study-sets-notice',ui.notice);notice.setAttribute('role','status');ui.body.append(notice);}
  if(ui.screen==='list')renderStudySetsList();
  else if(ui.screen==='create')renderStudySetsCreate();
  else if(ui.screen==='menu')renderStudySetsMenu(set);
  else if(ui.screen==='rename'||ui.screen==='delete')renderStudySetsEdit(set);
  else if(ui.screen==='study')renderStudySetsStudy(set);
  else renderStudySetsDetail(set,ui.screen==='excluded');
  if(focus){
    ui.body.scrollTop=0;
    const preferred=ui.body.querySelector('[data-study-sets-focus]');
    if(preferred instanceof HTMLElement)preferred.focus({preventScroll:true});else ui.title.focus({preventScroll:true});
  }else{
    ui.body.scrollTop=scrollTop;
    const sameControl=focusId?document.getElementById(focusId):null;
    const rows=ui.body.querySelectorAll('.study-sets-word-row');
    const nearby=focusedIndex>=0?rows[Math.min(focusedIndex,rows.length-1)]?.querySelector('button'):null;
    if(sameControl instanceof HTMLElement)sameControl.focus({preventScroll:true});
    else if(nearby instanceof HTMLElement)nearby.focus({preventScroll:true});
    else if(focusedIndex>=0)ui.title.focus({preventScroll:true});
  }
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
    const active=set.cards.length-set.excludedIds.length;
    const view=BreezeStudySets.view(studySetsUI.state,set.id);
    let progress='';if(view.status==='active')progress=` · 학습 중 ${view.completed}/${view.total}`;else if(view.status==='complete')progress=' · 한 바퀴 완료';
    copy.append(studySetsNode('strong','',set.name),studySetsNode('span','study-sets-caption',`${set.bookTitles.length}권 · ${active}개${progress}`));
    button.append(copy,studySetsIcon('chevron'));item.append(button);list.append(item);
  }
  body.append(list);
}
function renderStudySetsCreate(){
  const body=studySetsUI.body,form=document.createElement('form');form.id='study-sets-create-form';form.className='study-sets-form';
  const label=studySetsNode('label','study-sets-field','세트 이름');
  const input=document.createElement('input');input.id='study-sets-name';input.name='name';input.type='text';input.required=true;input.maxLength=100;input.placeholder='예: 이번 주 읽은 책';input.autocomplete='off';label.append(input);
  const booksField=studySetsNode('fieldset','study-sets-books');booksField.append(studySetsNode('legend','','책 선택'));
  const names=[...new Set(Object.values(words).filter(item=>item&&typeof item.word==='string'&&item.word.trim()&&typeof item.ko==='string'&&item.ko.trim()).map(item=>typeof item.book==='string'?item.book:''))].sort((a,b)=>a.localeCompare(b));
  const selection=new Set(),count=studySetsNode('p','study-sets-selection-count','책을 선택해 주세요.');count.id='study-sets-selection-count';count.setAttribute('aria-live','polite');
  const create=studySetsButton('세트 만들기',()=>{},'study-sets-primary');create.type='submit';create.id='study-sets-save';create.disabled=true;
  for(const title of names){
    const row=studySetsNode('label','study-sets-book');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=title;
    const text=studySetsNode('span','study-sets-book-name',title||'직접 추가');
    const number=studySetsNode('span','study-sets-caption',`${BreezeStudySets.cards(words,[title]).length}개`);
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked)selection.add(title);else selection.delete(title);
      const total=selection.size?BreezeStudySets.cards(words,[...selection]).length:0;
      count.textContent=selection.size?`${selection.size}권 · 중복을 뺀 단어·뜻 ${total}개`:'책을 선택해 주세요.';create.disabled=!total;
    });row.append(checkbox,text,number);booksField.append(row);
  }
  if(!names.length)booksField.append(studySetsEmpty('저장된 단어가 없어요','책을 읽다가 뜻을 저장하거나 Memory에서 단어를 추가해 주세요.'));
  form.append(label,booksField,count,create);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!input.value.trim()){input.setCustomValidity('세트 이름을 입력해 주세요.');input.reportValidity();return;}
    const options={name:input.value.trim(),bookTitles:[...selection]};
    if(!selection.size)return;
    studySetsMutate(state=>BreezeStudySets.create(state,options,words,Date.now()),result=>{studySetsUI.setId=result.set.id;studySetsUI.screen='detail';studySetsUI.notice='';});
  });input.addEventListener('input',()=>input.setCustomValidity(''));body.append(form);
}
function renderStudySetsEdit(set){
  const body=studySetsUI.body;
  if(studySetsUI.screen==='delete'){
    body.append(studySetsNode('p','',`“${set.name}” 학습 세트를 삭제할까요?`),studySetsMessage('세트와 학습 기록이 삭제돼요. 원본 단어는 남아요.'));
    const actions=studySetsNode('div','study-sets-actions');
    actions.append(studySetsButton('취소',studySetsBack),studySetsButton('세트 삭제',()=>studySetsMutate(state=>BreezeStudySets.remove(state,set.id),()=>{
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
    const name=input.value.trim();studySetsMutate(state=>BreezeStudySets.rename(state,set.id,name,Date.now()),()=>{studySetsUI.screen=studySetsUI.managementEntry?'menu':'detail';studySetsUI.notice='';});
  });input.addEventListener('input',()=>input.setCustomValidity(''));body.append(form);
}
function renderStudySetsMenu(set){
  const body=studySetsUI.body,menu=studySetsNode('div','study-sets-menu');
  menu.append(studySetsButton('이름 변경',()=>studySetsGo('rename')),
    studySetsButton(`제외한 단어 ${set.excludedIds.length}개`,()=>studySetsGo('excluded')));
  const preview=BreezeStudySets.importPreview(studySetsUI.state,set.id,words);
  const importButton=studySetsButton(`새 단어 가져오기 · ${preview.count}개`,()=>studySetsMutate(state=>BreezeStudySets.importNew(state,set.id,words,Date.now()),result=>{
    studySetsUI.notice=result.added?`${result.added}개 추가됨`:'';
  }));importButton.id='study-sets-import';importButton.disabled=!preview.count;
  menu.append(importButton,studySetsButton('세트 삭제',()=>studySetsGo('delete'),'study-sets-danger-link'));body.append(menu);
}
function renderStudySetsDetailFooter(set){
  studySetsUI.footer.replaceChildren();
  {
    const view=BreezeStudySets.view(studySetsUI.state,set.id);
    const startText=view.status==='active'?`이어서 학습 · ${view.completed}/${view.total}`:view.status==='complete'?'학습 결과 보기':'학습 시작';
    const start=studySetsButton(startText,()=>studySetsStart(set.id),'study-sets-primary');start.id='study-sets-start';start.disabled=set.cards.length===set.excludedIds.length&&view.status!=='active'&&view.status!=='complete';
    studySetsUI.footer.hidden=false;studySetsUI.footer.append(start);
  }
  if(studySetsUI.undo){
    const undo=studySetsUI.undo;const notice=studySetsNode('div','study-sets-undo');notice.setAttribute('role','status');
    notice.append(studySetsNode('span','',`“${undo.word}” 제외됨`),studySetsButton('실행 취소',()=>studySetsMutate(state=>BreezeStudySets.restore(state,set.id,undo.id,Date.now()),()=>{studySetsUI.undo=null;studySetsUI.notice='';})));studySetsUI.footer.prepend(notice);
  }
}
function renderStudySetsDetail(set,excluded){
  const body=studySetsUI.body,excludedIds=new Set(set.excludedIds);
  const cards=set.cards.filter(card=>excluded===excludedIds.has(card.id));
  if(!excluded)renderStudySetsDetailFooter(set);
  if(!cards.length){body.append(studySetsEmpty(excluded?'제외한 단어가 없어요':'세트에 학습할 단어가 없어요',''));return;}
  const list=studySetsNode('ul','study-sets-word-list');list.id=excluded?'study-sets-excluded-list':'study-sets-word-list';
  for(const [index,card] of cards.entries()){
    const item=studySetsNode('li','study-sets-word-row');item.dataset.cardId=card.id;
    const surface=studySetsNode('div','study-sets-word-surface');
    const copy=studySetsButton('',()=>{},'study-sets-word-toggle');
    copy.append(studySetsNode('strong','study-sets-word',card.word),studySetsNode('span','study-sets-meaning',card.ko));
    if(card.example){
      const example=studySetsNode('span','study-sets-example',card.example);example.id='study-sets-example-'+index;example.hidden=true;
      copy.setAttribute('aria-expanded','false');copy.setAttribute('aria-controls',example.id);copy.append(example);
      copy.addEventListener('click',()=>{example.hidden=!example.hidden;copy.setAttribute('aria-expanded',String(!example.hidden));});
    }
    const action=studySetsButton(excluded?'다시 담기':'제외',()=>{
      studySetsMutate(state=>excluded?BreezeStudySets.restore(state,set.id,card.id,Date.now()):BreezeStudySets.exclude(state,set.id,card.id,Date.now()),()=>{
        studySetsUI.undo=excluded?null:{id:card.id,word:card.word};studySetsUI.notice='';
      },excluded?null:item);
    },'study-sets-row-action'+(excluded?' study-sets-restore':''));action.setAttribute('aria-label',`${card.word} ${excluded?'다시 담기':'세트에서 제외'}`);
    surface.append(copy);
    if(excluded)surface.append(action);else{action.textContent='';action.append(studySetsIcon('remove'));action.title='세트에서 제외';item.append(action);}
    item.append(surface);list.append(item);
    if(!excluded)studySetsSwipe(item,surface,action);
  }
  body.append(list);
}
function studySetsSwipe(row,surface,action){
  let start=null,suppressClick=false,offset=0;
  const width=()=>row.getBoundingClientRect().width||320;
  const fullThreshold=()=>Math.max(144,width()*.62);
  const paint=amount=>{
    offset=Math.max(0,Math.min(width(),amount));
    surface.style.transform=offset?`translateX(${-offset}px)`:'';
    action.style.width=Math.max(44,offset-28)+'px';action.style.opacity=String(Math.min(1,offset/32));
    row.classList.toggle('study-sets-revealed',offset>0);
    row.classList.toggle('study-sets-swiped',offset>=fullThreshold());
  };
  const close=()=>{start=null;row.classList.remove('study-sets-dragging');paint(0);if(studySetsUI.swipeClose===close)studySetsUI.swipeClose=null;};
  const park=()=>{row.classList.remove('study-sets-dragging');paint(72);studySetsUI.swipeClose=close;};
  action.addEventListener('focus',()=>{if(!start&&!row.classList.contains('study-sets-exiting')){if(studySetsUI.swipeClose!==close)studySetsUI.swipeClose?.();park();}});
  row.addEventListener('pointerdown',event=>{
    if(row.classList.contains('study-sets-exiting')||event.button!==0||event.isPrimary===false||event.target instanceof Element&&event.target.closest('.study-sets-row-action'))return;
    if(studySetsUI.swipeClose!==close)studySetsUI.swipeClose?.();
    suppressClick=false;start={x:event.clientX,y:event.clientY,id:event.pointerId,axis:'',base:offset};
  });
  row.addEventListener('pointermove',event=>{
    if(!start||start.id!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(!start.axis){
      if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;
      if(Math.abs(dy)>=Math.abs(dx)||dx>0&&!start.base){suppressClick=true;close();return;}
      start.axis='x';try{row.setPointerCapture(event.pointerId);}catch(_){}row.classList.add('study-sets-dragging');studySetsUI.swipeClose=close;
    }
    suppressClick=true;event.preventDefault();paint(start.base-dx);
  });
  row.addEventListener('pointerup',event=>{
    if(!start||start.id!==event.pointerId)return;
    const moved=start.axis==='x',wasOpen=!!start.base,amount=start.base-(event.clientX-start.x);start=null;
    row.classList.remove('study-sets-dragging');
    if(moved&&amount>=fullThreshold()){paint(amount);action.click();}
    else if(moved&&amount>=36)park();
    else{if(wasOpen)suppressClick=true;close();}
  });
  row.addEventListener('pointercancel',()=>{if(start)suppressClick=true;close();});
  row.addEventListener('lostpointercapture',()=>{if(start)close();});
  row.addEventListener('click',event=>{if(suppressClick&&event.detail!==0&&event.target!==action&&!action.contains(event.target)){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
  // No per-row document listener: one shared owner closes a parked row.
}
document.addEventListener('pointerdown',event=>{
  const revealed=document.querySelector('.study-sets-word-row.study-sets-revealed:not(.study-sets-exiting)');
  if(revealed&&event.target instanceof Node&&!revealed.contains(event.target))studySetsUI.swipeClose?.();
},true);
function studySetsStart(id,restart=false){
  studySetsMutate(state=>BreezeStudySets.start(state,id,Date.now(),{restart}),()=>{studySetsUI.screen='study';studySetsUI.setId=id;studySetsUI.notice='';studySetsUI.undo=null;});
}
function renderStudySetsStudy(set){
  const body=studySetsUI.body,view=BreezeStudySets.view(studySetsUI.state,set.id);
  if(view.status==='complete'){
    const complete=studySetsNode('div','study-sets-complete');
    complete.append(studySetsNode('p','study-sets-eyebrow',`${view.round}번째 학습`),studySetsNode('h3','','한 바퀴 완료했어요'),studySetsNode('p','study-sets-result',`${view.total}개 중 기억나요 ${view.remembered}개 · 다시 볼게요 ${view.repeat}개`));
    if(view.repeat){const repeat=studySetsButton(`다시 볼 단어 ${view.repeat}개 학습`,()=>studySetsMutate(state=>BreezeStudySets.nextRound(state,set.id,Date.now()),()=>{studySetsUI.notice='';}),'study-sets-primary');repeat.id='study-sets-repeat-round';complete.append(repeat);}

    complete.append(studySetsButton('세트로 돌아가기',()=>studySetsGo('detail')),studySetsButton('전체 새로 학습',()=>studySetsStart(set.id,true)));body.append(complete);return;
  }
  if(view.status!=='active'||!view.card){
    body.append(studySetsEmpty('학습할 단어가 없어요','세트로 돌아가 단어를 확인해 주세요.'),studySetsButton('세트로 돌아가기',()=>studySetsGo('detail')));return;
  }
  const progress=studySetsNode('div','study-sets-progress');
  const text=studySetsNode('span','',`${view.completed+1} / ${view.total}`);text.id='study-sets-progress';
  progress.append(studySetsNode('span','study-sets-caption',`${view.round}번째 학습`),text);
  const meter=document.createElement('progress');meter.max=view.total;meter.value=view.completed;meter.setAttribute('aria-label',`학습한 단어 ${view.completed}개, 전체 ${view.total}개`);
  body.append(progress,meter);
  const card=studySetsNode('div','study-sets-flashcard');
  const word=studySetsNode('h3','',view.card.word);word.id='study-sets-expression';card.append(word);
  if(view.card.example)card.append(studySetsNode('p','study-sets-card-example',view.card.example));
  if(view.card.book)card.append(studySetsNode('p','study-sets-caption',view.card.book));
  const meaning=studySetsNode('p','study-sets-card-meaning',view.card.ko);meaning.id='study-sets-answer';meaning.hidden=!view.revealed;
  if(view.revealed){meaning.tabIndex=-1;meaning.setAttribute('data-study-sets-focus','');}
  card.append(meaning);body.append(card);
  if(!view.revealed){

    const reveal=studySetsButton('뜻 보기',()=>studySetsMutate(state=>BreezeStudySets.reveal(state,set.id,view.token),()=>{studySetsUI.notice='';}),'study-sets-primary');reveal.id='study-sets-reveal';reveal.setAttribute('data-study-sets-focus','');body.append(reveal);
  }else{
    const actions=studySetsNode('div','study-sets-actions study-sets-grades');
    for(const [outcome,label] of [['repeat','다시 볼게요'],['remembered','기억나요']]){
      const grade=studySetsButton(label,event=>{
        // A second click from revealing the answer must not become an assessment
        // when controls move under the pointer. Keyboard activation has detail 0.
        if(event.detail>1)return;
        studySetsMutate(state=>BreezeStudySets.grade(state,set.id,view.token,outcome,Date.now()),()=>{studySetsUI.notice='';});
      });grade.id='study-sets-grade-'+outcome;actions.append(grade);
    }
    body.append(actions);
  }

}
window.addEventListener('storage',event=>{
  if(event.key!==null&&event.key!==STUDY_SETS_STORAGE)return;
  refreshStudySetsEntry();
  // Never discard typed input or replace a retryable answer after a failed write.
  if(studySetsUI.dialog?.open&&!studySetsUI.retry&&!['create','rename','delete'].includes(studySetsUI.screen))studySetsReadAndRender(false);
});
refreshStudySetsEntry();
