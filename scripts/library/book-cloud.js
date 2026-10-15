/* Selective book sync. Dormant unless window.BREEZE_CONFIG.BOOK_CLOUD === true.
   Flag off: no menu row, no fetch, no storage writes. */
function bookCloudEnabled(){
  return !!(window.BREEZE_CONFIG&&window.BREEZE_CONFIG.BOOK_CLOUD===true);
}
var bookCloudCatalog=[];
var bookCloudHeads={};
var bookCloudTimer=0;
function bookCloudResetNotes(){
  const note=document.getElementById('ed-del-note');
  const choice=document.querySelector('#edit-modal [data-step="delete"] .am-d');
  if(note)note.textContent='단어장과 다른 기기의 읽기자료는 그대로 남습니다.';
  if(choice)choice.textContent='다른 기기의 읽기자료는 건드리지 않아요';
}
function resetBookCloudSession(){
  clearTimeout(bookCloudTimer);bookCloudTimer=0;bookCloudCatalog=[];bookCloudHeads={};
}
function bookCloudHash(book){
  const hash=String(book&&(book.sourceHash||(book.original&&book.original.hash))||'');
  return /^[0-9a-f]{64}$/.test(hash)?hash:'';
}
function bookCloudKind(book){
  return book&&['pdf','epub','txt'].includes(book.kind)?book.kind:'';
}
function bookCloudFileBook(book){return !!(bookCloudHash(book)&&bookCloudKind(book));}
function bookCloudUserId(){return typeof sbUser!=='undefined'&&sbUser&&sbUser.id||'';}
function bookCloudOutboxKey(userId){return 'breeze.book-cloud.v1.'+userId;}
function bookCloudReadOutbox(userId){
  try{
    const parsed=JSON.parse(localStorage.getItem(bookCloudOutboxKey(userId))||'null');
    if(parsed&&parsed.version===1&&parsed.uploads&&parsed.positions&&parsed.removes)return parsed;
  }catch{}
  return {version:1,uploads:{},positions:{},removes:{}};
}
function bookCloudWriteOutbox(userId,box){
  if(!bookCloudEnabled()||!userId)return;
  localStorage.setItem(bookCloudOutboxKey(userId),JSON.stringify(box));
}
function bookCloudSession(){
  return typeof syncSession==='function'?syncSession():{epoch:0,userId:bookCloudUserId(),scope:null};
}
function bookCloudCurrent(session){
  if(!session||session.userId!==bookCloudUserId())return false;
  if(typeof assertSyncSession==='function'){
    try{assertSyncSession(session);}catch{return false;}
  }
  return true;
}
function bookCloudLocator(position){
  if(!position||typeof position!=='object')return {};
  const locator={};
  for(const key of ['p','t','mode','pi','dy','y'])if(position[key]!=null)locator[key]=position[key];
  const original=position.original;
  if(original&&typeof original==='object'){
    const keep={};
    for(const key of ['kind','page','y','href','spine','element','char'])if(original[key]!=null)keep[key]=original[key];
    if(Object.keys(keep).length)locator.original=keep;
  }
  return locator;
}
function bookCloudLibraryRows(){
  if(!bookCloudEnabled())return [];
  const local=new Set();
  const list=typeof books==='undefined'?[]:books;
  for(const book of list){const hash=bookCloudHash(book);if(hash)local.add(hash);}
  return bookCloudCatalog.filter(row=>row&&row.status==='ready'&&row.book_id&&!local.has(row.book_id)).map(row=>{
    const head=bookCloudHeads[row.book_id];
    return {bookId:row.book_id,title:row.title||'',author:row.author||'',kind:row.kind||'',locator:head&&head.locator||null};
  });
}
function bookCloudLinkedNote(book){
  const note=document.getElementById('ed-del-note');
  const choice=document.querySelector('#edit-modal [data-step="delete"] .am-d');
  if(book&&book.bookCloudLink&&book.bookCloudLink.on){
    if(note)note.textContent='이 계정의 다른 기기에서도 원본이 지워집니다.';
    if(choice)choice.textContent='이 계정의 다른 기기 원본도 함께 지워요';
  }else bookCloudResetNotes();
}
function renderBookCloudToggle(book){
  document.getElementById('ed-cloud')?.remove();
  if(!bookCloudEnabled()){bookCloudResetNotes();return;}
  bookCloudLinkedNote(book);
  if(!bookCloudFileBook(book))return;
  const host=document.querySelector('#edit-modal .ed-step[data-step="edit"] .ed-acts');
  if(!host)return;
  const row=document.createElement('div');row.id='ed-cloud';
  const copy=document.createElement('div');copy.className='ed-cloud-copy';
  const title=document.createElement('span');title.className='ed-cloud-title';title.textContent='기기 간 연동';
  const detail=document.createElement('span');detail.className='ed-cloud-note';
  const loggedIn=!!bookCloudUserId();
  const missing=!book.original&&!(book.bookCloudLink&&book.bookCloudLink.on);
  if(!loggedIn)detail.textContent='로그인하면 다른 기기와 이 책을 연동할 수 있어요.';
  else if(missing)detail.textContent='이 기기에는 원본 파일이 없어 연동할 수 없어요.';
  else detail.textContent=book.bookCloudLink&&book.bookCloudLink.on?'같은 계정의 다른 기기에서 이 책을 이어 읽을 수 있어요.':'이 기기에만 둡니다.';
  copy.append(title,detail);
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='aa-toggle'+(book.bookCloudLink&&book.bookCloudLink.on?' on':'');
  toggle.setAttribute('aria-pressed',book.bookCloudLink&&book.bookCloudLink.on?'true':'false');
  toggle.setAttribute('aria-label','기기 간 연동');
  toggle.disabled=!loggedIn||missing;
  const knob=document.createElement('i');toggle.append(knob);
  toggle.onclick=()=>{if(!toggle.disabled)void bookCloudSetLink(book,!(book.bookCloudLink&&book.bookCloudLink.on));};
  row.append(copy,toggle);host.before(row);
}
async function bookCloudSetLink(book,on){
  if(!bookCloudEnabled()||!bookCloudFileBook(book)||!bookCloudUserId())return;
  if(on){
    const remote=bookCloudCatalog.find(row=>row.book_id===bookCloudHash(book));
    const tombstone=remote&&remote.status==='deleted'?String(remote.tombstone||''):'';
    book.bookCloudLink={on:true,tombstone};
    if(typeof bookPut==='function')await bookPut(book);
    const userId=bookCloudUserId(),box=bookCloudReadOutbox(userId);
    delete box.removes[bookCloudHash(book)];
    box.uploads[bookCloudHash(book)]={kind:book.kind,title:book.title||'',author:book.author||'',tombstone};
    bookCloudWriteOutbox(userId,box);
    bookCloudLinkedNote(book);renderBookCloudToggle(book);
    toast('다른 기기와 이 책을 연동해요');
    void syncBookCloud();
    return;
  }
  const removed=await forgetBookCloud(book);
  if(removed===false){toast('서버의 원본을 아직 지우지 못했어요. 책은 그대로 두었어요.');return;}
  book.bookCloudLink={on:false,tombstone:book.bookCloudLink&&book.bookCloudLink.tombstone||''};
  if(typeof bookPut==='function')await bookPut(book);
  bookCloudLinkedNote(book);renderBookCloudToggle(book);
  toast('이 기기에만 둡니다');
}
async function bookCloudPost(op,body,session){
  const cfg=window.BREEZE_CONFIG||{};
  let token='';
  try{
    const sessionData=await sb.auth.getSession();
    token=sessionData&&sessionData.data&&sessionData.data.session&&sessionData.data.session.access_token||'';
  }catch{return {ok:false,error:'login_required'};}
  if(!bookCloudCurrent(session)||!token)return {ok:false,error:'login_required'};
  let response;
  try{
    response=await fetch(String(cfg.SB_URL||'').replace(/\/$/,'')+'/functions/v1/book-cloud',{
      method:'POST',
      headers:{Authorization:'Bearer '+token,apikey:cfg.SB_KEY||'','Content-Type':'application/json'},
      body:JSON.stringify({op,...body})
    });
  }catch(error){
    console.error('book_cloud_failed',error&&error.name||'Error');
    return {ok:false,error:'offline'};
  }
  if(!bookCloudCurrent(session))return {ok:false,error:'stale'};
  try{return await response.json();}catch{return {ok:false,error:'bad_response'};}
}
async function bookCloudSendUpload(bookId,entry,session){
  const book=(typeof books==='undefined'?[]:books).find(item=>bookCloudHash(item)===bookId&&item.bookCloudLink&&item.bookCloudLink.on);
  if(!book||typeof originalGetForBook!=='function')return false;
  const record=await originalGetForBook(book);
  if(!bookCloudCurrent(session))return false;
  const blob=record&&(record.blob||record);
  if(!blob||typeof blob.arrayBuffer!=='function')return false;
  const bytes=await blob.arrayBuffer();
  if(!bookCloudCurrent(session))return false;
  const hash=typeof rawFileHash==='function'?await rawFileHash(new Blob([bytes])):'';
  if(hash!==bookId)return false;
  const reserved=await bookCloudPost('reserve',{
    bookId,size:bytes.byteLength,kind:entry.kind||book.kind,title:entry.title||book.title||'',author:entry.author||book.author||'',
    acknowledgedTombstone:entry.tombstone||''
  },session);
  if(!reserved||reserved.ok===false){
    if(reserved&&reserved.error==='book_cap')toast('연동할 수 있는 책은 40권까지예요');
    else if(reserved&&reserved.error==='byte_cap')toast('연동할 수 있는 용량은 2GB까지예요');
    return false;
  }
  if(reserved.ready)return true;
  if(!reserved.url)return false;
  let put;
  try{put=await fetch(reserved.url,{method:'PUT',body:bytes});}
  catch(error){console.error('book_cloud_failed',error&&error.name||'Error');return false;}
  if(!put.ok||!bookCloudCurrent(session))return false;
  const done=await bookCloudPost('complete',{bookId},session);
  return !!(done&&done.ok);
}
async function bookCloudSendRemove(bookId,session){
  const result=await bookCloudPost('remove',{bookId},session);
  return !!(result&&result.ok);
}
async function bookCloudSendPosition(bookId,entry,session){
  const userId=bookCloudUserId();
  const result=await sb.rpc('breeze_put_book_position',{
    expected_user_id:userId,book_id:bookId,expected_revision:entry.base||null,next_revision:entry.revision,locator:entry.locator
  });
  if(!bookCloudCurrent(session))return false;
  const data=result&&result.data;
  if(data&&data.ok)return 'ok';
  if(data&&data.ok===false&&data.revision){
    bookCloudHeads[bookId]={revision:data.revision,locator:data.locator||null};
    return 'conflict';
  }
  return 'fail';
}
async function bookCloudRefresh(session){
  if(!sb||typeof sb.from!=='function')return;
  const listed=await sb.from('book_cloud').select('book_id,title,author,kind,status,tombstone');
  const placed=await sb.from('positions').select('book_id,data');
  if(!bookCloudCurrent(session))return;
  bookCloudCatalog=listed&&listed.data||[];
  const rows=placed&&placed.data||[];
  for(const row of rows){
    const data=row&&row.data||{};
    bookCloudHeads[row.book_id]={revision:data.revision||'',locator:data.locator||null};
    bookCloudAdoptPosition(row.book_id,data.locator);
  }
  if(typeof renderAllBookViews==='function')renderAllBookViews();
}
function bookCloudAdoptPosition(hash,locator){
  if(!locator||typeof books==='undefined'||typeof positions==='undefined')return;
  const book=books.find(item=>bookCloudHash(item)===hash);
  if(!book)return;
  const local=positions[book.id];
  if(local&&local.t)return;
  positions[book.id]={...bookCloudLocator(locator)};
  if(typeof save==='function'&&typeof LS_POS!=='undefined')save(LS_POS,positions);
}
async function syncBookCloud(){
  if(!bookCloudEnabled())return false;
  const session=bookCloudSession(),userId=session.userId;
  if(!userId)return false;
  try{
    if(navigator.onLine===false)return false;
    const box=bookCloudReadOutbox(userId);
    for(const bookId of Object.keys(box.removes)){
      if(!bookCloudCurrent(session))return false;
      if(await bookCloudSendRemove(bookId,session))delete box.removes[bookId];
    }
    for(const bookId of Object.keys(box.uploads)){
      if(!bookCloudCurrent(session))return false;
      if(box.removes[bookId])continue;
      if(await bookCloudSendUpload(bookId,box.uploads[bookId],session))delete box.uploads[bookId];
    }
    for(const bookId of Object.keys(box.positions)){
      if(!bookCloudCurrent(session))return false;
      const sent=await bookCloudSendPosition(bookId,box.positions[bookId],session);
      if(sent==='ok'||sent==='conflict')delete box.positions[bookId];
    }
    if(bookCloudCurrent(session))bookCloudWriteOutbox(userId,box);
    await bookCloudRefresh(session);
    return true;
  }catch(error){
    console.error('book_cloud_failed',error&&error.name||'Error');
    return false;
  }
}
function flushBookCloud(){
  if(!bookCloudEnabled())return Promise.resolve(false);
  return syncBookCloud();
}
function scheduleBookCloudPosition(){
  if(!bookCloudEnabled())return;
  const book=typeof curBook!=='undefined'?curBook:null;
  const userId=bookCloudUserId();
  if(!book||!userId||!(book.bookCloudLink&&book.bookCloudLink.on))return;
  const bookId=bookCloudHash(book);
  if(!bookId||typeof positions==='undefined')return;
  const box=bookCloudReadOutbox(userId);
  const previous=box.positions[bookId];
  box.positions[bookId]={base:previous?previous.base:(bookCloudHeads[bookId]&&bookCloudHeads[bookId].revision||null),revision:(previous&&previous.revision)||(crypto.randomUUID?crypto.randomUUID():String(Date.now())),locator:bookCloudLocator(positions[book.id])};
  bookCloudWriteOutbox(userId,box);
  clearTimeout(bookCloudTimer);
  bookCloudTimer=setTimeout(()=>{bookCloudTimer=0;void syncBookCloud();},1500);
}
async function forgetBookCloud(book){
  if(!bookCloudEnabled())return true;
  const bookId=bookCloudHash(book);
  const userId=bookCloudUserId();
  if(!bookId||!userId||!(book&&book.bookCloudLink&&book.bookCloudLink.on))return true;
  const box=bookCloudReadOutbox(userId);
  const upload=box.uploads[bookId];
  delete box.uploads[bookId];delete box.positions[bookId];
  box.removes[bookId]={at:Date.now()};
  bookCloudWriteOutbox(userId,box);
  if(navigator.onLine===false)return true;
  const session=bookCloudSession();
  const removed=await bookCloudSendRemove(bookId,session);
  if(!bookCloudCurrent(session))return false;
  if(removed){delete box.removes[bookId];bookCloudWriteOutbox(userId,box);return true;}
  delete box.removes[bookId];
  if(upload)box.uploads[bookId]=upload;
  bookCloudWriteOutbox(userId,box);
  return false;
}
function bookCloudCard(row){
  const card=el('div','bookcard cloud');
  const percent=row.locator&&row.locator.p!=null&&typeof readingPercent==='function'?readingPercent(row.locator.p):null;
  const label=percent?percent+'%부터 받아서 이어 읽기':'받아서 이어 읽기';
  card.innerHTML='<div class="author"></div><div class="bt"></div><button class="getbtn" type="button"></button>';
  fillCard(card,{'.author':row.author||'내 책','.bt':row.title||'(제목 없음)'});
  const button=card.querySelector('.getbtn');
  button.textContent=label;
  const open=event=>{event.stopPropagation();void bookCloudDownload(row,card);};
  button.onclick=open;card.onclick=open;
  return card;
}
async function bookCloudDownload(row,card){
  if(!bookCloudEnabled())return;
  if(navigator.onLine===false){toast('오프라인에서는 이 책을 받을 수 없어요.');return;}
  const session=bookCloudSession();
  if(card)card.classList.add('busy-sync');
  try{
    const granted=await bookCloudPost('download',{bookId:row.bookId},session);
    if(!granted||!granted.url||!bookCloudCurrent(session))return;
    let response;
    try{response=await fetch(granted.url);}
    catch(error){console.error('book_cloud_failed',error&&error.name||'Error');toast('오프라인에서는 이 책을 받을 수 없어요.');return;}
    if(!response.ok||!bookCloudCurrent(session))return;
    const bytes=await response.arrayBuffer();
    const name=(row.title||'book')+'.'+(row.kind||'epub');
    const file=new File([bytes],name,{type:row.kind==='pdf'?'application/pdf':row.kind==='txt'?'text/plain':'application/epub+zip'});
    const hash=await rawFileHash(file);
    if(hash!==row.bookId){toast('받은 파일이 원본과 달라 열지 않았어요.');return;}
    if(!bookCloudCurrent(session))return;
    const prepared=await prepareImportedFile(file,{},hash);
    const target={id:prepared.id,title:row.title||prepared.title,author:row.author||'',addedAt:Date.now()};
    if(typeof books!=='undefined'&&!books.some(item=>item.id===target.id))books.push(target);
    await applyPreparedBook(target,prepared,file);
    if(row.locator&&typeof positions!=='undefined'){
      positions[target.id]={...bookCloudLocator(row.locator)};
      if(typeof save==='function')save(LS_POS,positions);
    }
    if(typeof openBook==='function')await openBook(target);
  }finally{if(card)card.classList.remove('busy-sync');}
}
