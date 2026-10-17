/* Selective book sync. Dormant unless window.BREEZE_CONFIG.BOOK_CLOUD === true.
   Flag off: no menu row, no fetch, no storage writes. */
function bookCloudEnabled(){
  return !!(window.BREEZE_CONFIG&&window.BREEZE_CONFIG.BOOK_CLOUD===true);
}
var BOOK_CLOUD_BYTE_CAP=2147483648;
var bookCloudCatalog=[];
var bookCloudHeads={};
var bookCloudTimer=0;
var bookCloudPullTask=null;
var bookCloudPullAgain=false;
var bookCloudPullEpoch=0;
var bookCloudJobs=new Map();
var bookCloudActivity=new Map();
var bookCloudActivityFrame=0;
var bookCloudPartsPromise=null;
var bookCloudManual=new Set();
function bookCloudResetNotes(){
  const note=document.getElementById('ed-del-note');
  const choice=document.querySelector('#edit-modal [data-step="delete"] .am-d');
  if(note)note.textContent='단어장과 다른 기기의 읽기자료는 그대로 남습니다.';
  if(choice)choice.textContent='다른 기기의 읽기자료는 건드리지 않아요';
}
var bookCloudRevealQuiet=null;
function resetBookCloudSession(){
  bookCloudPullEpoch++;bookCloudPullAgain=false;
  clearTimeout(bookCloudTimer);bookCloudTimer=0;bookCloudCatalog=[];bookCloudHeads={};
  bookCloudRevealQuiet=null;bookCloudActivity.clear();bookCloudManual.clear();
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
function bookCloudSamePlace(left,right){
  const clean=value=>{const locator=bookCloudLocator(value||{});delete locator.t;return JSON.stringify(locator);};
  return clean(left)===clean(right);
}
function bookCloudAtStart(position){
  const locator=bookCloudLocator(position||{});
  if((Number(locator.p)||0)>0.001)return false;
  if(locator.pi!=null&&Number(locator.pi)>0)return false;
  if((Number(locator.y)||0)>8)return false;
  if((Number(locator.dy)||0)>8)return false;
  const original=locator.original;
  if(!original)return true;
  if(original.kind==='pdf')return (Number(original.page)||1)<=1&&(Number(original.y)||0)<=0.02;
  if(original.kind==='epub')return (Number(original.spine)||0)<=0&&(Number(original.element)||0)<=0&&(Number(original.char)||0)<=0;
  return true;
}
function bookCloudPreferRemote(local,remote){
  if(!remote||typeof remote!=='object')return false;
  if(!local)return true;
  if(bookCloudAtStart(local)&&!bookCloudAtStart(remote))return true;
  const remoteTime=Number(remote.t)||0,localTime=Number(local.t)||0;
  return remoteTime>localTime&&!bookCloudAtStart(remote);
}
function bookCloudLibraryRows(){
  if(!bookCloudEnabled())return [];
  const local=new Set();
  const list=typeof books==='undefined'?[]:books;
  for(const book of list){const hash=bookCloudHash(book);if(hash)local.add(hash);}
  return bookCloudCatalog.filter(row=>row&&row.status==='ready'&&row.book_id&&!local.has(row.book_id)).map(row=>{
    const head=bookCloudHeads[row.book_id];
    return {bookId:row.book_id,title:row.title||'',author:row.author||'',kind:row.kind||'',size:Number(row.byte_size)||0,locator:head&&head.locator||null};
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
    bookCloudQueuePosition(book);
    bookCloudLinkedNote(book);renderBookCloudToggle(book);
    if(typeof resumeBookInk==='function')resumeBookInk(bookCloudHash(book));
    toast('다른 기기와 이 책을 연동해요');
    return syncBookCloud();
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
  if(data&&data.ok){
    bookCloudHeads[bookId]={revision:data.revision||entry.revision,locator:data.locator||entry.locator||null};
    return 'ok';
  }
  if(data&&data.ok===false&&data.revision){
    bookCloudHeads[bookId]={revision:data.revision,locator:data.locator||null};
    return 'conflict';
  }
  return 'fail';
}
async function bookCloudRefresh(session){
  if(!sb||typeof sb.from!=='function')return;
  const listed=await sb.from('book_cloud').select('book_id,title,author,kind,status,tombstone,byte_size');
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
function bookCloudReaderHoldsPlace(book){
  return !!(book&&typeof curBook!=='undefined'&&curBook===book&&typeof savedPlaceReleased==='function'&&savedPlaceReleased());
}
function bookCloudAdoptPosition(hash,locator){
  if(!locator||typeof books==='undefined'||typeof positions==='undefined')return;
  const book=books.find(item=>bookCloudHash(item)===hash);
  if(!book||book.id===bookCloudRevealQuiet||!bookCloudPreferRemote(positions[book.id],locator))return;
  if(bookCloudReaderHoldsPlace(book))return;
  positions[book.id]={...bookCloudLocator(locator)};
  if(typeof save==='function'&&typeof LS_POS!=='undefined')save(LS_POS,positions);
  bookCloudShowAdopted(book);
}
function bookCloudShowAdopted(book){
  if(!book||book.id===bookCloudRevealQuiet)return;
  if(typeof curBook==='undefined'||curBook!==book)return;
  if(bookCloudReaderHoldsPlace(book))return;
  if(typeof readerPositionPending==='function'&&readerPositionPending())return;
  if(typeof pdfRestoreOwnsPosition==='function'&&pdfRestoreOwnsPosition())return;
  if(typeof epubRestoreOwnsPosition==='function'&&epubRestoreOwnsPosition())return;
  if(typeof textRestoreOwnsPosition==='function'&&textRestoreOwnsPosition())return;
  const position=positions[book.id];
  if(!position)return;
  if(position.mode==='original'&&position.original&&typeof switchReaderMode==='function'){
    void switchReaderMode('original',{initial:true});
    return;
  }
  if(typeof restoreAnchor==='function'&&restoreAnchor(position))return;
  if(typeof readerScrollTo==='function')readerScrollTo(position.y||0);
}
/* The open path paints the place already stored on this device. A linked book
   that still has only the start adopts a locator this device already fetched,
   or waits one short read. If that read is slow, the book opens at the local
   place and the late reply is kept for the next open — it does not move the
   page that is already visible. */
function bookCloudRememberHead(row){
  if(!row||!row.book_id)return null;
  const data=row.data||{};
  bookCloudHeads[row.book_id]={revision:data.revision||'',locator:data.locator||null};
  return data.locator||null;
}
async function bookCloudReadPositionRows(){
  if(!sb||typeof sb.from!=='function')return null;
  try{
    const query=sb.from('positions');
    if(query&&typeof query.select==='function')return await query.select('book_id,data');
    if(query&&typeof query.then==='function')return await query;
  }catch(error){}
  return null;
}
function bookCloudWriteLocator(book,locator){
  if(!book||typeof positions==='undefined'||!bookCloudPreferRemote(positions[book.id],locator))return false;
  positions[book.id]={...bookCloudLocator(locator)};
  if(typeof save==='function'&&typeof LS_POS!=='undefined')save(LS_POS,positions);
  return true;
}
async function bookCloudPositionBeforeOpen(book){
  if(!bookCloudEnabled()||typeof positions==='undefined'||!book)return;
  const local=positions[book.id];
  if(local&&!bookCloudAtStart(local)){
    if(bookCloudRevealQuiet===book.id)bookCloudRevealQuiet=null;
    return;
  }
  const hash=bookCloudHash(book);
  if(!hash||!(book.bookCloudLink&&book.bookCloudLink.on))return;
  const head=bookCloudHeads[hash];
  if(head){
    bookCloudWriteLocator(book,head.locator);
    if(bookCloudRevealQuiet===book.id)bookCloudRevealQuiet=null;
    return;
  }
  if(!bookCloudUserId())return;
  const session=bookCloudSession();
  let timer=0;
  const read=bookCloudReadPositionRows();
  const winner=await Promise.race([
    Promise.resolve(read).then(value=>({value})).catch(()=>({value:null})),
    new Promise(resolve=>{timer=setTimeout(()=>resolve({timeout:true}),400);})
  ]);
  clearTimeout(timer);
  if(!bookCloudCurrent(session))return;
  const locatorFor=rows=>{
    const list=rows&&rows.data||[];
    for(const row of list){
      if(row&&row.book_id===hash)return bookCloudRememberHead(row);
    }
    return null;
  };
  if(winner.timeout){
    bookCloudRevealQuiet=book.id;
    void Promise.resolve(read).then(rows=>{
      if(bookCloudCurrent(session))locatorFor(rows);
    }).catch(()=>{});
    return;
  }
  const locator=locatorFor(winner.value);
  if(locator)bookCloudWriteLocator(book,locator);
  if(bookCloudRevealQuiet===book.id)bookCloudRevealQuiet=null;
}
function bookCloudQueuePosition(book){
  if(!bookCloudEnabled())return;
  const userId=bookCloudUserId();
  if(!book||!userId||!(book.bookCloudLink&&book.bookCloudLink.on))return;
  const bookId=bookCloudHash(book);
  if(!bookId||typeof positions==='undefined'||!positions[book.id])return;
  const box=bookCloudReadOutbox(userId);
  if(box.removes[bookId])return;
  const locator=bookCloudLocator(positions[book.id]);
  const head=bookCloudHeads[bookId];
  if(head&&bookCloudPreferRemote(positions[book.id],head.locator)&&!bookCloudReaderHoldsPlace(book))return;
  if(head&&bookCloudSamePlace(head.locator,locator))return;
  const previous=box.positions[bookId];
  if(previous&&bookCloudSamePlace(previous.locator,locator))return;
  box.positions[bookId]={base:previous?previous.base:(head&&head.revision||null),revision:(previous&&previous.revision)||(crypto.randomUUID?crypto.randomUUID():String(Date.now())),locator};
  bookCloudWriteOutbox(userId,box);
}
async function syncBookCloud(){
  if(!bookCloudEnabled())return false;
  const session=bookCloudSession(),userId=session.userId;
  if(!userId)return false;
  try{
    if(navigator.onLine===false)return false;
    await bookCloudRefresh(session);
    if(!bookCloudCurrent(session))return false;
    if(typeof books!=='undefined')for(const book of books)bookCloudQueuePosition(book);
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
    if(typeof flushBookInkSoon==='function')flushBookInkSoon();
    for(const bookId of Object.keys(box.positions)){
      if(!bookCloudCurrent(session))return false;
      const sent=await bookCloudSendPosition(bookId,box.positions[bookId],session);
      if(sent==='ok'||sent==='conflict')delete box.positions[bookId];
    }
    if(bookCloudCurrent(session))bookCloudWriteOutbox(userId,box);
    await bookCloudRefresh(session);
    if(bookCloudCurrent(session))void bookCloudPullReady(session);
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
  bookCloudQueuePosition(book);
  if(!book||!bookCloudUserId()||!(book.bookCloudLink&&book.bookCloudLink.on)||!bookCloudHash(book))return;
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
  if(removed){
    delete box.removes[bookId];bookCloudWriteOutbox(userId,box);
    if(typeof forgetBookInk==='function')void forgetBookInk(bookId);
    return true;
  }
  delete box.removes[bookId];
  if(upload)box.uploads[bookId]=upload;
  bookCloudWriteOutbox(userId,box);
  return false;
}
/* `navigator.onLine` can change during an awaited download. A direct second
   comparison in the same turn is narrowed to the literal `true` by checkJs. */
function bookCloudOffline(){return navigator.onLine===false;}
function bookCloudStorageFault(error){
  if(!error)return false;
  const name=String(error.name||'');
  if(name==='QuotaExceededError'||error.code===22||error.code===1014)return true;
  const message=String(error.message||'');
  if(/QuotaExceededError|quota has been exceeded|Indexed Database|indexedDB|IDBFactory|IDBDatabase|private browsing|object store/i.test(message))return true;
  return (name==='SecurityError'||name==='InvalidStateError'||name==='UnknownError'||name==='AbortError')
    && /storage|database|indexedDB|quota|blob|file|private/i.test(message);
}
function bookCloudPullReady(session){
  if(!bookCloudEnabled())return Promise.resolve(false);
  bookCloudPullAgain=true;
  if(bookCloudPullTask)return bookCloudPullTask;
  const current=session||bookCloudSession();
  const epoch=bookCloudPullEpoch;
  const task=(async()=>{
    try{
      while(bookCloudPullAgain){
        bookCloudPullAgain=false;
        if(epoch!==bookCloudPullEpoch)return false;
        await bookCloudAutoPull(current,epoch);
      }
      return true;
    }catch(error){
      console.error('book_cloud_failed',error&&error.name||'Error');
      return false;
    }finally{bookCloudPullTask=null;}
  })();
  bookCloudPullTask=task;
  return task;
}
async function bookCloudAutoPull(session,epoch){
  if(!bookCloudEnabled()||!bookCloudCurrent(session)||epoch!==bookCloudPullEpoch)return;
  if(navigator.onLine===false)return;
  for(const row of bookCloudLibraryRows()){
    if(epoch!==bookCloudPullEpoch||!bookCloudCurrent(session))return;
    if(bookCloudOffline())return;
    if(Number(row.size)>BOOK_CLOUD_BYTE_CAP)continue;
    await bookCloudRunJob(row.bookId,()=>bookCloudImportRemote(row,session,{auto:true}));
    if(epoch!==bookCloudPullEpoch)return;
    if(typeof renderAllBookViews==='function')renderAllBookViews();
  }
}
function bookCloudRunJob(bookId,run){
  const existing=bookCloudJobs.get(bookId);
  if(existing)return existing;
  const job=Promise.resolve().then(run).finally(()=>{bookCloudJobs.delete(bookId);});
  bookCloudJobs.set(bookId,job);
  return job;
}
function bookCloudJoin(chunks){
  let size=0;
  for(const chunk of chunks)size+=chunk?chunk.byteLength:0;
  const out=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){
    if(!chunk||!chunk.byteLength)continue;
    out.set(chunk,offset);
    offset+=chunk.byteLength;
  }
  return out;
}
function bookCloudHeader(response,name){
  const headers=response&&response.headers;
  if(!headers)return '';
  if(typeof headers.get==='function')return String(headers.get(name)||'');
  return String(headers[name]||headers[name.toLowerCase()]||'');
}
function bookCloudDeclaredSize(response,fallback){
  const match=/\/(\d+)\s*$/.exec(bookCloudHeader(response,'content-range'));
  if(match)return Number(match[1]);
  if(response&&response.status===206)return fallback;
  const length=Number(bookCloudHeader(response,'content-length'));
  return Number.isFinite(length)&&length>0?length:fallback;
}
function bookCloudPartsDb(){
  if(bookCloudPartsPromise)return bookCloudPartsPromise;
  bookCloudPartsPromise=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'||!indexedDB){reject(new Error('no-idb'));return;}
    let request;
    try{request=indexedDB.open('breeze-book-cloud',1);}catch(error){reject(error);return;}
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('parts'))request.result.createObjectStore('parts');
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('idb'));
  }).catch(error=>{bookCloudPartsPromise=null;throw error;});
  return bookCloudPartsPromise;
}
function bookCloudPartOp(mode,run){
  return bookCloudPartsDb().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('parts',mode);
    let result;
    tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('idb'));
    try{run(tx.objectStore('parts'),value=>{result=value;});}catch(error){try{tx.abort();}catch{}reject(error);}
  }));
}
async function bookCloudReadPart(key){
  try{
    return await bookCloudPartOp('readonly',(store,done)=>{
      const request=store.get(key);
      request.onsuccess=()=>done(request.result||null);
    })||null;
  }catch{return null;}
}
async function bookCloudWritePart(key,bytes){
  try{await bookCloudPartOp('readwrite',store=>{store.put(bytes,key);});}catch{}
}
async function bookCloudDropPart(key){
  try{await bookCloudPartOp('readwrite',store=>{store.delete(key);});}catch{}
}
function bookCloudShowManual(bookId, show){
  if(!bookId)return;
  if(show)bookCloudManual.add(bookId);
  else bookCloudManual.delete(bookId);
  if(typeof document==='undefined'||typeof document.querySelectorAll!=='function')return;
  const cards=document.querySelectorAll('.bookcard.cloud[data-book-cloud]');
  for(const item of cards){
    const card=/** @type {HTMLElement} */(item);
    if(card.dataset.bookCloud!==bookId)continue;
    const button=/** @type {HTMLButtonElement|null} */(card.querySelector('.getbtn'));
    if(button)button.hidden=!bookCloudManual.has(bookId);
  }
}
function bookCloudActivityVariant(){
  if(typeof window==='undefined')return '';
  return window.BREEZE_CARD_ACTIVITY==='fill'?'fill':'';
}
function bookCloudActivityCopy(state){
  const pct=state.total?Math.round(state.ratio*100):0;
  return {pct,label:'받는 중',aria:'받는 중'};
}
function bookCloudScheduleActivity(){
  if(bookCloudActivityFrame)return;
  const pump=()=>{bookCloudActivityFrame=0;bookCloudPaintActivity();};
  if(typeof requestAnimationFrame==='function')bookCloudActivityFrame=requestAnimationFrame(pump)||1;
  else bookCloudActivityFrame=setTimeout(pump,16);
}
function bookCloudNoteActivity(bookId,received,total){
  const variant=bookCloudActivityVariant();
  if(!variant||!bookId){
    if(bookCloudActivity.size){bookCloudActivity.clear();bookCloudPaintActivity();}
    return;
  }
  received=Math.max(0,Number(received)||0);
  total=Math.max(0,Number(total)||0);
  if(total&&received>total)received=total;
  const ratio=total?Math.round(received/total*1000)/1000:0;
  const prev=bookCloudActivity.get(bookId);
  if(prev&&prev.received===received&&prev.total===total&&prev.ratio===ratio&&prev.variant===variant)return;
  bookCloudActivity.set(bookId,{received,total,ratio,variant});
  bookCloudScheduleActivity();
}
function bookCloudClearActivity(bookId){
  if(bookId)bookCloudActivity.delete(bookId);
  bookCloudPaintActivity();
}
function bookCloudActivityNode(){
  const node=document.createElement('div');
  node.className='card-activity';
  node.setAttribute('role','progressbar');
  node.setAttribute('aria-valuemin','0');
  node.setAttribute('aria-valuemax','100');
  node.innerHTML='<span class="card-activity-label"></span><span class="card-activity-fill" aria-hidden="true"><i></i></span>';
  return node;
}
function bookCloudPaintActivity(){
  if(!bookCloudActivityVariant())bookCloudActivity.clear();
  if(typeof document==='undefined'||typeof document.querySelectorAll!=='function')return;
  const cards=document.querySelectorAll('.bookcard.cloud[data-book-cloud]');
  for(const item of cards){
    const card=/** @type {HTMLElement} */(item);
    const state=bookCloudActivity.get(card.dataset.bookCloud);
    let node=/** @type {HTMLElement|null} */(card.querySelector(':scope > .card-activity'));
    if(!state){
      if(node)node.remove();
      card.classList.remove('is-receiving');
      delete card.dataset.activity;
      continue;
    }
    const copy=bookCloudActivityCopy(state);
    card.classList.add('is-receiving');
    card.dataset.activity=state.variant;
    if(!node){node=bookCloudActivityNode();card.appendChild(node);}
    const ratio=String(state.ratio);
    if(node.style.getPropertyValue('--p')!==ratio)node.style.setProperty('--p',ratio);
    node.dataset.kind='download';
    node.dataset.variant=state.variant;
    if(state.total)node.removeAttribute('data-unknown');
    else node.setAttribute('data-unknown','1');
    if(node.getAttribute('aria-valuenow')!==String(copy.pct))node.setAttribute('aria-valuenow',String(copy.pct));
    if(node.getAttribute('aria-label')!==copy.aria)node.setAttribute('aria-label',copy.aria);
    const label=node.querySelector('.card-activity-label');
    if(label&&label.textContent!==copy.label)label.textContent=copy.label;
  }
}
async function bookCloudReadBody(response,prefix,checkpoint,onBytes){
  const chunks=prefix&&prefix.byteLength?[prefix]:[];
  let since=0;
  let held=prefix&&prefix.byteLength?prefix.byteLength:0;
  const take=async chunk=>{
    if(!chunk||!chunk.byteLength)return true;
    chunks.push(chunk);
    since+=chunk.byteLength;
    held+=chunk.byteLength;
    if(typeof onBytes==='function')onBytes(held);
    if(since<1048576)return true;
    const merged=bookCloudJoin(chunks);
    chunks.length=0;chunks.push(merged);since=0;
    held=merged.byteLength;
    if(checkpoint&&await checkpoint(merged)===false)return false;
    return true;
  };
  if(response.body&&typeof response.body.getReader==='function'){
    const reader=response.body.getReader();
    while(true){
      let step;
      try{step=await reader.read();}
      catch(error){
        const partial=bookCloudJoin(chunks);
        if(partial.byteLength&&checkpoint)await checkpoint(partial);
        throw error;
      }
      if(step.done)break;
      if(await take(step.value)===false)return null;
    }
  }else if(typeof response.arrayBuffer==='function'){
    if(await take(new Uint8Array(await response.arrayBuffer()))===false)return null;
  }else return null;
  return bookCloudJoin(chunks);
}
async function bookCloudImportRemote(row,session,options){
  const auto=!!(options&&options.auto);
  const note=message=>{if(!auto&&message)toast(message);};
  if(!bookCloudEnabled()||!row||!row.bookId)return null;
  if(navigator.onLine===false){note('오프라인에서는 이 책을 받을 수 없어요.');return null;}
  if(!bookCloudCurrent(session))return null;
  if(auto)bookCloudShowManual(row.bookId, false);
  const size=Number(row.size)||0;
  const key=bookCloudUserId()+'/'+row.bookId;
  let prefix=null;
  try{prefix=await bookCloudReadPart(key);}catch{prefix=null;}
  if(prefix&&!(prefix instanceof Uint8Array))prefix=new Uint8Array(prefix);
  if(prefix&&(!size||prefix.byteLength>size)){await bookCloudDropPart(key);prefix=null;}
  let received=prefix&&prefix.byteLength<size?prefix.byteLength:0;
  let bytes=prefix&&size&&prefix.byteLength===size?prefix:null;
  if(!received)prefix=null;
  let tracked=false;
  try{
  if(!bytes){
    const granted=await bookCloudPost('download',{bookId:row.bookId},session);
    if(!granted||!granted.url||!bookCloudCurrent(session))return null;
    let response;
    try{response=await fetch(granted.url,received?{headers:{Range:'bytes='+received+'-'}}:undefined);}
    catch(error){
      console.error('book_cloud_failed',error&&error.name||'Error');
      note('오프라인에서는 이 책을 받을 수 없어요.');
      return null;
    }
    if(received&&response.status!==206){
      await bookCloudDropPart(key);
      received=0;prefix=null;
      if(response.status!==200){
        try{response=await fetch(granted.url);}catch{return null;}
      }
    }
    if(!(response.ok||response.status===206)||!bookCloudCurrent(session))return null;
    const declared=bookCloudDeclaredSize(response,size);
    if(declared>BOOK_CLOUD_BYTE_CAP||(size&&declared&&declared!==size)){
      await bookCloudDropPart(key);
      return null;
    }
    const watch=bookCloudActivityVariant();
    if(watch){tracked=true;bookCloudNoteActivity(row.bookId,received,declared||size);}
    try{
      bytes=await bookCloudReadBody(response,prefix,async merged=>{
        await bookCloudWritePart(key,merged);
        if(!bookCloudCurrent(session))return false;
        return true;
      },watch?total=>bookCloudNoteActivity(row.bookId,total,declared||size):null);
    }catch(error){
      console.error('book_cloud_failed',error&&error.name||'Error');
      note('오프라인에서는 이 책을 받을 수 없어요.');
      return null;
    }
    if(!bytes)return null;
  }
  if(size&&bytes.byteLength!==size){
    await bookCloudWritePart(key,bytes);
    return null;
  }
  if(bytes.byteLength<1||bytes.byteLength>BOOK_CLOUD_BYTE_CAP){
    await bookCloudDropPart(key);
    return null;
  }
  const name=(row.title||'book')+'.'+(row.kind||'epub');
  const hash=typeof rawFileHash==='function'?await rawFileHash(bytes):'';
  const file=new File([bytes],name,{type:row.kind==='pdf'?'application/pdf':row.kind==='txt'?'text/plain':'application/epub+zip'});
  file.breezeBytes=bytes;
  if(hash!==row.bookId){
    await bookCloudDropPart(key);
    note('받은 파일이 원본과 달라 열지 않았어요.');
    return null;
  }
  if(!bookCloudCurrent(session))return null;
  let target=null;
  let inserted=false;
  try{
    const prepared=await prepareImportedFile(file,{},hash);
    target={id:prepared.id,title:row.title||prepared.title,author:row.author||'',addedAt:Date.now(),sourceHash:row.bookId,bookCloudLink:{on:true,tombstone:''}};
    if(typeof books!=='undefined'&&!books.some(item=>item.id===target.id)){books.push(target);inserted=true;}
    await applyPreparedBook(target,prepared,file,{bytes});
  }catch(error){
    if(inserted&&target&&typeof books!=='undefined'){
      const index=books.indexOf(target);
      if(index>=0)books.splice(index,1);
    }
    if(bookCloudStorageFault(error)){
      await bookCloudWritePart(key,bytes);
      bookCloudShowManual(row.bookId, true);
      return null;
    }
    throw error;
  }
  await bookCloudDropPart(key);
  bookCloudShowManual(row.bookId, false);
  if(row.locator&&typeof positions!=='undefined'&&bookCloudPreferRemote(positions[target.id],row.locator)){
    positions[target.id]={...bookCloudLocator(row.locator)};
    if(typeof save==='function')save(LS_POS,positions);
  }
  return target;
  }finally{
    if(tracked)bookCloudClearActivity(row.bookId);
  }
}
function bookCloudCard(row){
  const index=typeof paletteOf==='function'?paletteOf({id:row.bookId||''},3):0;
  const card=el('div','bookcard cloud editorial-cover pal'+(index%3));
  const percent=row.locator&&row.locator.p!=null&&typeof readingPercent==='function'?readingPercent(row.locator.p):null;
  const label=percent?percent+'%부터 받아서 이어 읽기':'받아서 이어 읽기';
  const art=typeof coverArtwork==='function'?coverArtwork(row.bookId||row.title||''):'';
  card.innerHTML=art+'<div class="author"></div><div class="bt"></div><button class="getbtn" type="button" hidden></button>';
  fillCard(card,{'.author':row.author||'내 책','.bt':row.title||'(제목 없음)'});
  const button=card.querySelector('.getbtn');
  button.textContent=label;
  button.hidden=!bookCloudManual.has(row.bookId);
  if(row.bookId)card.dataset.bookCloud=row.bookId;
  const open=event=>{event.stopPropagation();void bookCloudDownload(row,card);};
  button.onclick=open;card.onclick=open;
  if(row.bookId&&bookCloudActivity.has(row.bookId)){
    const paint=()=>bookCloudPaintActivity();
    if(typeof queueMicrotask==='function')queueMicrotask(paint);
    else Promise.resolve().then(paint);
  }
  return card;
}
async function bookCloudDownload(row,card){
  if(!bookCloudEnabled()||!row)return;
  if(navigator.onLine===false){toast('오프라인에서는 이 책을 받을 수 없어요.');return;}
  const session=bookCloudSession();
  if(card)card.classList.add('busy-sync');
  try{
    const running=bookCloudJobs.get(row.bookId);
    let saved=running?await running:null;
    if(!saved)saved=await bookCloudRunJob(row.bookId,()=>bookCloudImportRemote(row,session,{auto:false}));
    if(saved&&typeof openBook==='function')await openBook(saved);
  }finally{if(card)card.classList.remove('busy-sync');}
}
