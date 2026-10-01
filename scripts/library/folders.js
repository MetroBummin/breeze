/* Device-local organization, independent of books, progress and synced content. */
const INBOX_FOLDER='__inbox__';
const FOLDER_KEY='breeze.library-folders.v1';
let libraryFolders={folders:[],assignments:{}};
let folderStorageHealthy=true;
const activeLibraryFolders={casuals:'',longform:''};
try{
  const value=JSON.parse(localStorage.getItem(FOLDER_KEY)||'null');
  if(value){
    if(!Array.isArray(value.folders)||!value.assignments||typeof value.assignments!=='object')throw Error('Invalid folder data');
    libraryFolders=value;
  }
}catch(error){folderStorageHealthy=false;console.warn('Folder data unavailable',error);}
function saveLibraryFolders(next){
  if(!folderStorageHealthy){toast('분류 정보를 읽을 수 없어 변경하지 않았어요.');return false;}
  try{localStorage.setItem(FOLDER_KEY,JSON.stringify(next));libraryFolders=next;return true;}
  catch(error){toast('분류를 저장하지 못했어요.');return false;}
}
function libraryFolderScope(){return document.getElementById('v-casuals').classList.contains('on')?'casuals':'longform';}
function bookFolderScope(book){return isCasual(book)?'casuals':'longform';}
function foldersFor(scope){return libraryFolders.folders.filter(folder=>folder.scope===scope);}
function currentLibraryFolder(scope=libraryFolderScope()){return activeLibraryFolders[scope]||'';}
/* Run only after the local book inventory loads. Split shared categories using
   their actual assignments; preserve unused categories independently on both
   shelves because the old schema never recorded where they were created. */
function migrateLibraryFolders(){
  if(!folderStorageHealthy||!libraryFolders.folders.some(folder=>!folder.scope))return;
  const next=structuredClone(libraryFolders),inventory=new Map(books.map(book=>[book.id,book]));
  for(const folder of [...next.folders]){
    if(folder.scope)continue;
    const ids=Object.keys(next.assignments).filter(id=>next.assignments[id]===folder.id);
    const scopes=new Set(ids.map(id=>inventory.has(id)?bookFolderScope(inventory.get(id)):'longform'));
    if(!scopes.size){scopes.add('longform');scopes.add('casuals');}
    folder.scope=scopes.has('longform')?'longform':'casuals';
    if(scopes.size>1){
      const copy={...folder,id:crypto.randomUUID(),scope:'casuals'};next.folders.push(copy);
      for(const id of ids)if(inventory.has(id)&&bookFolderScope(inventory.get(id))==='casuals')next.assignments[id]=copy.id;
    }
  }
  if(!saveLibraryFolders(next))folderStorageHealthy=false;
}
function folderMatches(bookId,scope){
  const active=currentLibraryFolder(scope),assigned=libraryFolders.assignments[bookId];
  return !active||(active===INBOX_FOLDER?!foldersFor(scope).some(f=>f.id===assigned):assigned===active);
}
function currentImportFolder(){
  const scope=libraryFolderScope(),active=currentLibraryFolder(scope);
  return document.querySelector('#v-casuals.on,#v-longform.on')&&foldersFor(scope).some(f=>f.id===active)?active:'';
}
function assignImportedFolder(bookId,id){
  if(id)assignLibraryFolder(bookId,id);
}
function folderBooks(list,scope){return list.filter(book=>folderMatches(book.id,scope));}
function changeLibraryFolder(id,scope=libraryFolderScope()){
  if(id&&id!==INBOX_FOLDER&&!foldersFor(scope).some(f=>f.id===id))return false;
  activeLibraryFolders[scope]=id;renderAllBookViews();return true;
}
function createLibraryFolder(name,scope=libraryFolderScope()){
  name=String(name||'').trim().slice(0,60);if(!name)return false;
  if(foldersFor(scope).some(folder=>folder.name===name)){toast('같은 이름의 카테고리가 있어요.');return false;}
  const next=structuredClone(libraryFolders),id=crypto.randomUUID();next.folders.push({id,name,scope});
  if(!saveLibraryFolders(next))return false;
  activeLibraryFolders[scope]=id;renderAllBookViews();return true;
}
function renameLibraryFolder(id,name){
  name=String(name||'').trim().slice(0,60);if(!name)return false;
  const next=structuredClone(libraryFolders),folder=next.folders.find(f=>f.id===id);if(!folder)return false;
  if(foldersFor(folder.scope).some(f=>f.id!==id&&f.name===name)){toast('같은 이름의 카테고리가 있어요.');return false;}
  folder.name=name;if(!saveLibraryFolders(next))return false;renderAllBookViews();return true;
}
function deleteLibraryFolder(id){
  const next=structuredClone(libraryFolders);next.folders=next.folders.filter(f=>f.id!==id);
  for(const book of Object.keys(next.assignments))if(next.assignments[book]===id)delete next.assignments[book];
  if(!saveLibraryFolders(next))return false;
  for(const scope of ['casuals','longform'])if(activeLibraryFolders[scope]===id)activeLibraryFolders[scope]='';
  renderAllBookViews();return true;
}
function assignLibraryFolder(bookId,id){
  const book=books.find(book=>book.id===bookId);if(!book)return false;
  const next=structuredClone(libraryFolders);
  if(id&&!foldersFor(bookFolderScope(book)).some(f=>f.id===id))return false;
  if(id)next.assignments[bookId]=id;else delete next.assignments[bookId];
  return saveLibraryFolders(next);
}
function makeFolderPicker(select){
  select.hidden=true;
  const picker=document.createElement('details');picker.className='breeze-folder-picker';
  const trigger=document.createElement('summary');trigger.setAttribute('aria-label',select.getAttribute('aria-label')||'카테고리 선택');
  const name=document.createElement('span');name.className='breeze-folder-name';
  const chevron=document.createElement('span');chevron.className='breeze-folder-chevron';chevron.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>';chevron.setAttribute('aria-hidden','true');
  trigger.append(name,chevron);
  const options=document.createElement('div');options.className='breeze-folder-options';options.setAttribute('role','group');options.setAttribute('aria-label','카테고리 목록');
  for(const option of select.options){
    const item=document.createElement('button');item.type='button';item.className='breeze-folder-option';item.textContent=option.textContent;item.dataset.value=option.value;
    item.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));picker.open=false;trigger.focus({preventScroll:true});};
    options.append(item);
  }
  const sync=()=>{name.textContent=select.selectedOptions[0]?.textContent||'카테고리';for(const item of options.querySelectorAll('button'))item.setAttribute('aria-current',String(item.dataset.value===select.value));};
  select.addEventListener('change',sync);sync();
  picker.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();picker.open=false;trigger.focus({preventScroll:true});}});
  picker.addEventListener('toggle',()=>{if(picker.open)for(const other of document.querySelectorAll('.breeze-folder-picker[open],.library-folder-menu[open]'))if(other instanceof HTMLDetailsElement&&other!==picker)other.open=false;});
  picker.append(trigger,options);return picker;
}
function renderFolderControls(){
  for(const hostId of ['v-casuals','v-longform']){
    const host=document.getElementById(hostId);if(!host)continue;
    const scope=hostId==='v-casuals'?'casuals':'longform',active=currentLibraryFolder(scope);
    let bar=host.querySelector('.library-folder-controls');
    if(!bar){bar=document.createElement('div');bar.className='library-folder-controls';host.querySelector('.casual-library-head,.head').after(bar);}
    bar.replaceChildren();
    const select=document.createElement('select');select.setAttribute('aria-label','서재 카테고리');
    for(const folder of [{id:'',name:'전체 서재'},{id:INBOX_FOLDER,name:'미지정 (Inbox)'},...foldersFor(scope)]){
      const option=new Option(folder.name,folder.id);select.add(option);
    }
    select.value=active;select.onchange=()=>changeLibraryFolder(select.value,scope);bar.append(select,makeFolderPicker(select));
    const add=document.createElement('button');add.type='button';add.className='library-folder-add';add.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';add.setAttribute('aria-label','카테고리 추가');add.title='카테고리 추가';
    add.onclick=async()=>{add.focus({preventScroll:true});const name=await breezeTaskDialog({title:'새 카테고리',input:true});if(name)createLibraryFolder(name,scope);};bar.append(add);
    const folder=foldersFor(scope).find(f=>f.id===active);
    if(folder){
      const menu=document.createElement('details');menu.className='library-folder-menu';
      const summary=document.createElement('summary');summary.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';summary.setAttribute('aria-label','카테고리 관리');summary.title='카테고리 관리';
      const actions=document.createElement('div');actions.className='library-folder-actions';
      const action=(label,run)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{menu.open=false;summary.focus({preventScroll:true});await run();};actions.append(button);};
      action('이름 변경',async()=>{const name=await breezeTaskDialog({title:'카테고리 이름 변경',input:true,value:folder.name});if(name&&renameLibraryFolder(folder.id,name)){const next=host.querySelector('.library-folder-menu summary');if(next instanceof HTMLElement)next.focus({preventScroll:true});}});
      action('카테고리 삭제',async()=>{if(await breezeTaskDialog({title:'카테고리만 삭제할까요?',description:'책과 읽기 기록은 그대로 남아요.',action:'삭제',danger:true})&&deleteLibraryFolder(folder.id)){const next=host.querySelector('.breeze-folder-picker summary');if(next instanceof HTMLElement)next.focus({preventScroll:true});}});
      menu.append(summary,actions);menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();menu.open=false;summary.focus({preventScroll:true});}});bar.append(menu);
    }
  }
}
document.addEventListener('click',event=>{
  if(!(event.target instanceof Node))return;
  for(const menu of document.querySelectorAll('.library-folder-menu[open]'))if(menu instanceof HTMLDetailsElement&&!menu.contains(event.target))menu.open=false;
  for(const menu of document.querySelectorAll('.breeze-folder-picker[open]'))if(menu instanceof HTMLDetailsElement&&!menu.contains(event.target))menu.open=false;
});
function renderBookFolderChoice(book){
  let select=document.getElementById('ed-folder');
  if(!(select instanceof HTMLSelectElement)){
    const label=document.createElement('label');label.className='ed-lbl';label.htmlFor='ed-folder';label.textContent='카테고리';
    select=document.createElement('select');select.id='ed-folder';
    document.getElementById('ed-title').after(label,select);
  }
  if(!(select instanceof HTMLSelectElement))return;
  select.replaceChildren(new Option('미지정 (Inbox)',''));
  for(const folder of foldersFor(bookFolderScope(book)))select.add(new Option(folder.name,folder.id));
  select.value=libraryFolders.assignments[book.id]||'';
  select.nextElementSibling?.matches('.breeze-folder-picker')&&select.nextElementSibling.remove();
  select.after(makeFolderPicker(select));
}
