/* Cross-device pen and highlighter sync for books with 기기 간 연동 on.
   Dormant unless window.BREEZE_CONFIG.INK_SYNC === true and BOOK_CLOUD === true.
   Drawing never waits on this file. A page uploads a few seconds after the pen
   lifts, and immediately when the page is hidden. Remote strokes are merged
   only into a page that is already open. */
const INK_SYNC_DEBOUNCE_MS=3000;
const INK_SYNC_BATCH=40;
const INK_SYNC_PAGE_CAP=4000;
const INK_SYNC_STROKE_BYTES=24000;
const INK_SYNC_BOOK_BYTES=8000000;
const INK_SYNC_BACKOFF_MS=30000;
const inkSyncUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function inkSyncEnabled(){
  const config=typeof window!=='undefined'?window.BREEZE_CONFIG:null;
  return !!(config&&config.INK_SYNC===true&&config.BOOK_CLOUD===true);
}
function inkSyncUserId(){
  return typeof bookCloudUserId==='function'?bookCloudUserId():(typeof sbUser!=='undefined'&&sbUser&&sbUser.id||'');
}
function inkSyncSession(){
  return typeof bookCloudSession==='function'?bookCloudSession():{epoch:0,userId:inkSyncUserId()};
}
function inkSyncCurrent(session){
  if(typeof bookCloudCurrent==='function')return bookCloudCurrent(session);
  return !!(session&&session.userId&&session.userId===inkSyncUserId());
}
function inkParseKey(key){
  try{
    const parsed=JSON.parse(key);
    const sha=parsed&&parsed[0],page=parsed&&parsed[1];
    if(typeof sha==='string'&&/^[0-9a-f]{64}$/.test(sha)&&Number.isInteger(page)&&page>=1&&page<=100000)return {sha,page};
  }catch{}
  return null;
}
/* Reading positions are not ink pages. EPUB spine/cfi and PDF percent locators
   never select a pen record; only the PDF ink key [sha256, page] does. */
function inkPageFromLocator(){return null;}
function inkSyncRecordKey(userId,sha,page){return userId+'|'+sha+'|'+page;}
function inkSyncBook(sha){
  if(!inkSyncEnabled()||typeof books==='undefined'||typeof bookCloudHash!=='function')return null;
  return books.find(book=>book&&bookCloudHash(book)===sha&&book.bookCloudLink&&book.bookCloudLink.on)||null;
}
function inkSyncAdmits(book){return !!(book&&book.kind==='pdf');}
function inkUuid(value){return typeof value==='string'&&inkSyncUuid.test(value);}
function inkWithIds(strokes,uuid){
  const seen=new Set();
  let changed=false;
  const next=(Array.isArray(strokes)?strokes:[]).map(stroke=>{
    if(!stroke||typeof stroke!=='object')return stroke;
    let id=inkUuid(stroke.id)?stroke.id:'';
    if(!id||seen.has(id)){
      changed=true;
      return {...stroke,id:uuid()};
    }
    seen.add(id);
    return stroke;
  });
  return {strokes:next,changed};
}
function inkPublicStroke(stroke){
  const body={id:stroke.id,color:stroke.color,width:stroke.width,points:(stroke.points||[]).map(point=>[point[0],point[1]])};
  if(stroke.tool)body.tool=stroke.tool;
  if(stroke.opacity!=null)body.opacity=stroke.opacity;
  if(typeof stroke.strokeId==='string')body.strokeId=stroke.strokeId;
  return body;
}
function inkStrokeBytes(stroke){
  try{return JSON.stringify(inkPublicStroke(stroke)).length;}catch{return INK_SYNC_STROKE_BYTES+1;}
}
function inkCloneMeta(meta){
  return {
    version:1,
    clock:meta&&meta.clock||0,
    local:{...(meta&&meta.local||{})},
    tombs:{...(meta&&meta.tombs||{})},
    acked:{...(meta&&meta.acked||{})},
    omit:{...(meta&&meta.omit||{})},
    blocked:!!(meta&&meta.blocked),
    backoff:meta&&meta.backoff||0
  };
}
function inkLiveMap(strokes){
  const live=new Map();
  for(const stroke of strokes||[])if(stroke&&inkUuid(stroke.id)&&!live.has(stroke.id))live.set(stroke.id,stroke);
  return live;
}
function inkRemoteWins(row,localRev,liveHas,tombHas){
  if(!(row.rev>0))return false;
  if(row.rev>localRev)return true;
  return row.rev===localRev&&row.deleted&&liveHas&&!tombHas;
}
/* Per-id last revision wins. Different ids union. An equal revision keeps a
   tombstone over a live stroke so a tie cannot resurrect an erasure. */
function inkFoldRemote(strokes,meta,remote){
  const next=inkCloneMeta(meta);
  const live=inkLiveMap(strokes);
  const order=(strokes||[]).filter(stroke=>stroke&&inkUuid(stroke.id)&&live.get(stroke.id)===stroke).map(stroke=>stroke.id);
  let changed=false;
  const rows=(Array.isArray(remote)?remote:[]).filter(row=>row&&inkUuid(row.id)&&row.rev>0)
    .sort((a,b)=>a.rev-b.rev||String(a.id).localeCompare(String(b.id)));
  for(const row of rows){
    next.clock=Math.max(next.clock,row.rev);
    const localRev=Math.max(next.local[row.id]||0,next.tombs[row.id]||0);
    if(!inkRemoteWins(row,localRev,live.has(row.id),!!next.tombs[row.id]))continue;
    if(row.deleted){
      if(live.delete(row.id))changed=true;
      next.tombs[row.id]=row.rev;
      next.local[row.id]=row.rev;
      next.acked[row.id]=row.rev;
      delete next.omit[row.id];
    }else if(row.stroke&&inkUuid(row.stroke.id||row.id)){
      const stroke={...row.stroke,id:row.id};
      delete next.tombs[row.id];
      next.local[row.id]=row.rev;
      next.acked[row.id]=row.rev;
      delete next.omit[row.id];
      live.set(row.id,stroke);
      if(!order.includes(row.id))order.push(row.id);
      changed=true;
    }
  }
  return {strokes:order.filter(id=>live.has(id)).map(id=>live.get(id)),meta:next,changed};
}
function inkAdvance(strokes,meta){
  const next=inkCloneMeta(meta);
  const live=inkLiveMap(strokes);
  const ops=[];
  let capped=false;
  for(const [id,stroke] of live){
    if(next.omit[id])continue;
    const bytes=inkStrokeBytes(stroke);
    if(bytes>INK_SYNC_STROKE_BYTES&&!(next.acked[id]>0)){next.omit[id]=1;continue;}
    if(next.tombs[id]){
      next.clock+=1;
      delete next.tombs[id];
      next.local[id]=next.clock;
    }else if(!next.local[id]){
      if(Object.keys(next.local).length>=INK_SYNC_PAGE_CAP){capped=true;continue;}
      next.clock+=1;
      next.local[id]=next.clock;
    }
  }
  for(const id of Object.keys(next.local)){
    if(live.has(id)||next.tombs[id]||next.omit[id])continue;
    next.clock+=1;
    next.tombs[id]=next.clock;
    next.local[id]=next.clock;
  }
  for(const [id,stroke] of live){
    if(next.omit[id])continue;
    const rev=next.local[id]||0;
    if(rev>(next.acked[id]||0))ops.push({id,rev,deleted:false,stroke:inkPublicStroke(stroke)});
  }
  for(const id of Object.keys(next.tombs)){
    const rev=next.tombs[id];
    if(rev>(next.acked[id]||0))ops.push({id,rev,deleted:true});
  }
  return {meta:next,ops,capped};
}

const inkSyncMemory=new Map();
const inkSyncTimers=new Map();
let inkSyncDbPromise=null,inkSyncDbBroken=false,inkSyncHooks=null;
function registerBookInkPage(hooks){inkSyncHooks=hooks;}
function inkSyncOpenDb(){
  if(inkSyncDbBroken||typeof indexedDB==='undefined')return Promise.reject(new Error('ink sync storage unavailable'));
  if(inkSyncDbPromise)return inkSyncDbPromise;
  inkSyncDbPromise=new Promise((resolve,reject)=>{
    let settled=false;
    const fail=error=>{if(settled)return;settled=true;inkSyncDbPromise=null;inkSyncDbBroken=true;reject(error);};
    let request;
    try{request=indexedDB.open('breeze-ink-sync',1);}catch(error){fail(error);return;}
    const timer=setTimeout(()=>fail(new Error('ink sync storage open timed out')),10000);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('pages'))request.result.createObjectStore('pages');};
    request.onerror=()=>fail(request.error||new Error('ink sync storage open failed'));
    request.onblocked=()=>fail(new Error('ink sync storage is blocked'));
    request.onsuccess=()=>{
      if(settled){request.result.close();return;}
      settled=true;clearTimeout(timer);
      request.result.onversionchange=()=>{request.result.close();inkSyncDbPromise=null;};
      resolve(request.result);
    };
  });
  return inkSyncDbPromise;
}
function inkSyncQuota(error){
  const name=String(error&&(error.name||error.message)||'');
  return name==='QuotaExceededError'||/quota/i.test(name);
}
async function inkSyncLoad(key){
  if(inkSyncMemory.has(key))return inkCloneMeta(inkSyncMemory.get(key));
  try{
    const db=await inkSyncOpenDb();
    const value=await new Promise((resolve,reject)=>{
      const tx=db.transaction('pages');
      const request=tx.objectStore('pages').get(key);
      tx.oncomplete=()=>resolve(request.result||null);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('ink sync read failed'));
    });
    const meta=inkCloneMeta(value);
    inkSyncMemory.set(key,meta);
    return inkCloneMeta(meta);
  }catch(error){
    inkSyncDbBroken=true;
    console.error('ink_sync_storage',error&&error.name||'Error');
    return inkCloneMeta(null);
  }
}
async function inkSyncSave(key,meta){
  const copy=inkCloneMeta(meta);
  inkSyncMemory.set(key,copy);
  if(inkSyncDbBroken)return false;
  try{
    const db=await inkSyncOpenDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('pages','readwrite');
      tx.oncomplete=()=>resolve(undefined);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('ink sync write failed'));
      try{tx.objectStore('pages').put(copy,key);}catch(error){reject(error);}
    });
    return true;
  }catch(error){
    if(inkSyncQuota(error)||error)inkSyncDbBroken=true;
    console.error('ink_sync_storage',error&&error.name||'Error');
    return false;
  }
}
function resetInkSyncSession(){
  for(const timer of inkSyncTimers.values())clearTimeout(timer);
  inkSyncTimers.clear();
}
function inkSyncAccept(stroke){
  if(inkSyncHooks&&typeof inkSyncHooks.accept==='function')return inkSyncHooks.accept(stroke);
  return !!(stroke&&Array.isArray(stroke.points)&&stroke.points.length);
}
async function inkSyncRead(sha,page,session){
  if(typeof sb==='undefined'||!sb||typeof sb.from!=='function')return {ok:false,error:'offline'};
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return {ok:false,error:'offline'};
  try{
    const result=await sb.from('book_ink').select('stroke_id,rev,deleted,payload').eq('book_id',sha).eq('page',page).limit(INK_SYNC_PAGE_CAP);
    if(!inkSyncCurrent(session))return {ok:false,error:'stale'};
    if(result&&result.error){
      const message=String(result.error.message||'');
      if(result.error.code==='42P01'||result.error.code==='PGRST205'||/book_ink/i.test(message))return {ok:false,error:'not_ready'};
      return {ok:false,error:'read_failed'};
    }
    const rows=(result&&result.data||[]).map(row=>({
      id:row.stroke_id,rev:Number(row.rev),deleted:row.deleted===true,
      stroke:row.deleted?null:(row.payload&&typeof row.payload==='object'?{...row.payload,id:row.stroke_id}:null)
    })).filter(row=>row.deleted||inkSyncAccept(row.stroke));
    return {ok:true,rows};
  }catch(error){
    console.error('ink_sync_failed',error&&error.name||'Error');
    return {ok:false,error:'offline'};
  }
}
async function inkSyncMergeRpc(sha,page,ops,session){
  if(typeof sb==='undefined'||!sb||typeof sb.rpc!=='function')return {ok:false,error:'offline'};
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return {ok:false,error:'offline'};
  try{
    const result=await sb.rpc('breeze_merge_book_ink',{expected_user_id:session.userId,book_id:sha,page,ops});
    if(!inkSyncCurrent(session))return {ok:false,error:'stale'};
    if(result&&result.error){
      const message=String(result.error.message||'');
      if(/Ink account changed/i.test(message))return {ok:false,error:'stale'};
      if(result.error.code==='PGRST202'||/breeze_merge_book_ink/i.test(message))return {ok:false,error:'not_ready'};
      return {ok:false,error:'rpc'};
    }
    return result&&result.data||{ok:false,error:'bad_response'};
  }catch(error){
    console.error('ink_sync_failed',error&&error.name||'Error');
    return {ok:false,error:'offline'};
  }
}
function scheduleBookInk(state){
  if(!inkSyncEnabled()||!state||!state.key)return;
  const key=state.key;
  clearTimeout(inkSyncTimers.get(key));
  if(inkSyncHooks&&inkSyncHooks.busy(state)){
    inkSyncTimers.set(key,setTimeout(()=>scheduleBookInk(inkSyncHooks.page(key)||state),INK_SYNC_DEBOUNCE_MS));
    return;
  }
  inkSyncTimers.set(key,setTimeout(()=>{
    inkSyncTimers.delete(key);
    const live=inkSyncHooks&&inkSyncHooks.page(key)||state;
    if(inkSyncHooks&&inkSyncHooks.busy(live)){scheduleBookInk(live);return;}
    void flushBookInk(live);
  },INK_SYNC_DEBOUNCE_MS));
}
async function inkSyncSettle(state){
  if(!state.saving&&state.dirty&&inkSyncHooks&&typeof inkSyncHooks.persist==='function')inkSyncHooks.persist(state);
  if(state.saving){try{await state.saving;}catch{}}
  return !state.dirty&&!state.saving;
}
async function flushBookInk(state,immediate){
  if(!inkSyncEnabled()||!state||!inkParseKey(state.key))return false;
  const session=inkSyncSession();
  const userId=session.userId;
  const parsed=inkParseKey(state.key);
  if(!userId||!parsed||!inkSyncCurrent(session))return false;
  const book=inkSyncBook(parsed.sha);
  if(!inkSyncAdmits(book))return false;
  if(inkSyncHooks&&inkSyncHooks.busy(state)){scheduleBookInk(state);return false;}
  if(state.dirty||state.saving){
    if(!immediate){scheduleBookInk(state);return false;}
    if(!await inkSyncSettle(state)||!inkSyncCurrent(session))return false;
  }
  const recordKey=inkSyncRecordKey(userId,parsed.sha,parsed.page);
  let meta=await inkSyncLoad(recordKey);
  if(!inkSyncCurrent(session))return false;
  if(meta.blocked||meta.backoff>Date.now())return false;
  const prepared=inkWithIds(state.strokes,()=>crypto.randomUUID());
  if(prepared.changed){
    state.strokes=prepared.strokes;
    if(inkSyncHooks)inkSyncHooks.persist(state);
    if(state.saving){try{await state.saving;}catch{}}
  }
  const planned=inkAdvance(state.strokes,meta);
  meta=planned.meta;
  await inkSyncSave(recordKey,meta);
  if(!planned.ops.length)return true;
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return false;
  for(let index=0;index<planned.ops.length;index+=INK_SYNC_BATCH){
    if(!inkSyncCurrent(session))return false;
    const chunk=planned.ops.slice(index,index+INK_SYNC_BATCH);
    const result=await inkSyncMergeRpc(parsed.sha,parsed.page,chunk,session);
    if(!result||result.ok===false){
      if(result&&result.error==='not_linked'){meta.blocked=true;await inkSyncSave(recordKey,meta);return false;}
      if(result&&result.error==='not_ready')return false;
      if(result&&Array.isArray(result.applied)){
        for(const id of result.applied)meta.acked[id]=chunk.find(op=>op.id===id)?.rev||meta.acked[id];
        if(result.rejected)meta.omit[result.rejected]=meta.local[result.rejected]||1;
      }
      await inkSyncSave(recordKey,meta);
      return false;
    }
    const applied=new Set(result.applied||chunk.map(op=>op.id));
    for(const op of chunk)if(applied.has(op.id))meta.acked[op.id]=op.rev;
    await inkSyncSave(recordKey,meta);
    if(result.error==='ink_cap'){meta.backoff=Date.now()+INK_SYNC_BACKOFF_MS;await inkSyncSave(recordKey,meta);return false;}
  }
  return true;
}
async function pullBookInk(state){
  if(!inkSyncEnabled()||!state||!inkParseKey(state.key)||!inkSyncHooks)return false;
  const session=inkSyncSession();
  const parsed=inkParseKey(state.key);
  const book=parsed&&inkSyncBook(parsed.sha);
  if(!session.userId||!parsed||!inkSyncAdmits(book))return false;
  const remote=await inkSyncRead(parsed.sha,parsed.page,session);
  if(!remote.ok||!inkSyncCurrent(session))return false;
  const live=inkSyncHooks.page(state.key);
  if(!live||live.svg==null)return false;
  const recordKey=inkSyncRecordKey(session.userId,parsed.sha,parsed.page);
  const meta=await inkSyncLoad(recordKey);
  if(!inkSyncCurrent(session))return false;
  const folded=inkFoldRemote(live.strokes,meta,remote.rows);
  await inkSyncSave(recordKey,folded.meta);
  if(!folded.changed||!inkSyncCurrent(session))return true;
  const current=inkSyncHooks.page(state.key);
  if(!current||current.svg==null)return false;
  if(inkSyncHooks.busy(current)){current.inkHeld=folded.strokes;return true;}
  current.inkHeld=folded.strokes;
  inkSyncHooks.held(current);
  return true;
}
async function forgetBookInk(bookId){
  if(!inkSyncEnabled())return;
  const userId=inkSyncUserId();
  if(!userId||!/^[0-9a-f]{64}$/.test(String(bookId||'')))return;
  const prefix=userId+'|'+bookId+'|';
  for(const key of [...inkSyncMemory.keys()])if(key.startsWith(prefix)){
    const meta=inkCloneMeta(inkSyncMemory.get(key));
    meta.blocked=true;meta.local={};meta.tombs={};meta.acked={};
    inkSyncMemory.set(key,meta);
  }
  if(inkSyncDbBroken)return;
  try{
    const db=await inkSyncOpenDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('pages','readwrite');
      const store=tx.objectStore('pages');
      const request=store.getAllKeys();
      request.onsuccess=()=>{
        for(const key of request.result||[])if(String(key).startsWith(prefix))store.delete(key);
      };
      tx.oncomplete=()=>resolve(undefined);
      tx.onerror=tx.onabort=()=>reject(tx.error);
    });
  }catch(error){
    inkSyncDbBroken=true;
    console.error('ink_sync_storage',error&&error.name||'Error');
  }
}
function resumeBookInk(bookId){
  if(!inkSyncEnabled())return;
  const userId=inkSyncUserId();
  const prefix=userId+'|'+bookId+'|';
  for(const [key,meta] of inkSyncMemory){
    if(!key.startsWith(prefix))continue;
    meta.blocked=false;meta.backoff=0;inkSyncMemory.set(key,inkCloneMeta(meta));
  }
}
function flushBookInkNow(){
  if(!inkSyncEnabled()||!inkSyncHooks||typeof inkSyncHooks.pages!=='function')return Promise.resolve(false);
  const jobs=[];
  for(const state of inkSyncHooks.pages()){
    if(!state||!state.key)continue;
    clearTimeout(inkSyncTimers.get(state.key));
    inkSyncTimers.delete(state.key);
    jobs.push(flushBookInk(state,true));
  }
  return Promise.all(jobs);
}
function flushBookInkSoon(){return flushBookInkNow();}

if(typeof window!=='undefined')window.addEventListener('online',()=>{void flushBookInkNow();});
