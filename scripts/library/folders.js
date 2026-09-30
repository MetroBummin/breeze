/* Device-local organization, independent of books, progress and synced content. */
const FOLDER_KEY='breeze.library-folders.v1';
let libraryFolders={folders:[],assignments:{}};
let folderStorageHealthy=true,activeLibraryFolder='';
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
function folderMatches(bookId){return !activeLibraryFolder||libraryFolders.assignments[bookId]===activeLibraryFolder;}
function folderBooks(list){return list.filter(book=>folderMatches(book.id));}
function changeLibraryFolder(id){activeLibraryFolder=id;renderAllBookViews();}
function createLibraryFolder(name){
  name=String(name||'').trim().slice(0,60);if(!name)return false;
  if(libraryFolders.folders.some(folder=>folder.name===name)){toast('같은 이름의 카테고리가 있어요.');return false;}
  const next=structuredClone(libraryFolders),id=crypto.randomUUID();next.folders.push({id,name});
  if(!saveLibraryFolders(next))return false;
  activeLibraryFolder=id;renderAllBookViews();return true;
}
function renameLibraryFolder(id,name){
  name=String(name||'').trim().slice(0,60);if(!name)return false;
  if(libraryFolders.folders.some(f=>f.id!==id&&f.name===name)){toast('같은 이름의 카테고리가 있어요.');return false;}
  const next=structuredClone(libraryFolders),folder=next.folders.find(f=>f.id===id);if(!folder)return false;
  folder.name=name;if(!saveLibraryFolders(next))return false;renderAllBookViews();return true;
}
function deleteLibraryFolder(id){
  const next=structuredClone(libraryFolders);next.folders=next.folders.filter(f=>f.id!==id);
  for(const book of Object.keys(next.assignments))if(next.assignments[book]===id)delete next.assignments[book];
  if(!saveLibraryFolders(next))return false;
  if(activeLibraryFolder===id)activeLibraryFolder='';renderAllBookViews();return true;
}
function assignLibraryFolder(bookId,id){
  const next=structuredClone(libraryFolders);
  if(id&&!next.folders.some(f=>f.id===id))return false;
  if(id)next.assignments[bookId]=id;else delete next.assignments[bookId];
  return saveLibraryFolders(next);
}
function renderFolderControls(){
  for(const hostId of ['v-home','v-casuals','v-longform']){
    const host=document.getElementById(hostId);if(!host)continue;
    let bar=host.querySelector('.library-folder-controls');
    if(!bar){bar=document.createElement('div');bar.className='library-folder-controls';host.prepend(bar);}
    bar.replaceChildren();
    const select=document.createElement('select');select.setAttribute('aria-label','서재 카테고리');
    for(const folder of [{id:'',name:'전체 서재'},...libraryFolders.folders]){
      const option=new Option(folder.name,folder.id);select.add(option);
    }
    select.value=activeLibraryFolder;select.onchange=()=>changeLibraryFolder(select.value);bar.append(select);
    const add=(label,action)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{button.focus({preventScroll:true});return action();};bar.append(button);};
    add('＋ 카테고리',async()=>{const name=await breezeTaskDialog({title:'새 카테고리',input:true});if(name)createLibraryFolder(name);});
    const folder=libraryFolders.folders.find(f=>f.id===activeLibraryFolder);
    if(folder){
      add('이름 변경',async()=>{const name=await breezeTaskDialog({title:'카테고리 이름 변경',input:true,value:folder.name});if(name)renameLibraryFolder(folder.id,name);});
      add('삭제',async()=>{if(await breezeTaskDialog({title:'카테고리만 삭제할까요?',description:'책과 읽기 기록은 그대로 남아요.',action:'삭제',danger:true}))deleteLibraryFolder(folder.id);});
    }
  }
}
function renderBookFolderChoice(book){
  let select=document.getElementById('ed-folder');
  if(!(select instanceof HTMLSelectElement)){
    const label=document.createElement('label');label.className='ed-lbl';label.htmlFor='ed-folder';label.textContent='카테고리';
    select=document.createElement('select');select.id='ed-folder';
    document.getElementById('ed-title').after(label,select);
  }
  if(!(select instanceof HTMLSelectElement))return;
  select.replaceChildren(new Option('분류 없음',''));
  for(const folder of libraryFolders.folders)select.add(new Option(folder.name,folder.id));
  select.value=libraryFolders.assignments[book.id]||'';
}
