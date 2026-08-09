/* ================= local book assets (IndexedDB) =================
   Extracted text stays in `books`, EPUB images in `imgs`, and the user's raw
   PDF/EPUB stays in `originals`. Originals never enter the sync payload. */
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open('breeze-img',3);
  r.onupgradeneeded=()=>{ const db=r.result;
    if(!db.objectStoreNames.contains('imgs'))  db.createObjectStore('imgs');
    if(!db.objectStoreNames.contains('books')) db.createObjectStore('books');   // 책 본문(용량 큼)
    if(!db.objectStoreNames.contains('originals')) db.createObjectStore('originals');
  };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }

/* ---- 이 기기의 저장소를 "영구"로 표시해 달라고 한 번 부탁합니다 ----
   표시가 없으면 브라우저는 공간이 모자랄 때 이 사이트의 저장소를 지울 수 있고,
   사파리는 한동안 안 들어온 사이트의 저장소를 아예 비웁니다. 여기에는 단어장과
   책이 통째로 들어 있으므로, 지워지면 사용자가 잃는 것은 캐시가 아니라 자기 것입니다.

   예전에는 PDF·EPUB 파일을 반입할 때만 불렀습니다. 기사만 붙여넣는 사람과 내장
   고전만 읽는 사람은 — 첫 사용자 대부분이 그쪽인데 — 한 번도 부탁하지 않았습니다.

   부팅하자마자 부르지는 않습니다. 파이어폭스는 이걸 물어보는데, 아무것도 저장한
   적 없는 첫 방문자에게 뜨는 권한 창은 답할 근거가 없는 질문입니다. 대신 잃을
   것이 처음 생기는 순간 — 책이 들어오거나 단어를 처음 담을 때 — 부릅니다. */
async function requestDurableLocalStorage(){
  if(!navigator.storage || !navigator.storage.persist) return;
  if(load('breeze.storage-persist-asked', false)) return;
  save('breeze.storage-persist-asked', true);
  try{ await navigator.storage.persist(); }catch(e){}
}

/* ---- 책 저장소: localStorage(5MB 한계)에서 IndexedDB로 이전 ---- */
async function bookPut(b){ requestDurableLocalStorage(); const db=await idb(); return new Promise((res,rej)=>{
  const tx=db.transaction('books','readwrite'); tx.objectStore('books').put(b, b.id);
  tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function bookDel(id){ try{ const db=await idb(); return await new Promise(res=>{
  const tx=db.transaction('books','readwrite'); tx.objectStore('books').delete(id); tx.oncomplete=res; tx.onerror=res; }); }catch(e){} }
async function bookAll(){ try{ const db=await idb(); return await new Promise(res=>{
  const rq=db.transaction('books').objectStore('books').getAll();
  rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>res([]); }); }catch(e){ return []; } }
async function originalPut(id, record){ const db=await idb(); return new Promise((res,rej)=>{
  const tx=db.transaction('originals','readwrite'); tx.objectStore('originals').put(record,id);
  tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function originalGet(id){ try{ const db=await idb(); return await new Promise(res=>{
  const rq=db.transaction('originals').objectStore('originals').get(id);
  rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>res(null); }); }catch(e){ return null; } }
async function originalAll(){ try{ const db=await idb(); return await new Promise(res=>{
  const rq=db.transaction('originals').objectStore('originals').getAll();
  rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>res([]); }); }catch(e){ return []; } }
/* A synced/legacy book can acquire a different local ID even though its raw
   file is already present on this device. Recover it through the file hash and
   repair the direct ID lookup instead of asking the reader to reconnect. */
async function originalGetForBook(book){
  if(!book || !book.id) return null;
  const direct=await originalGet(book.id);
  if(direct) return direct;
  const hash=book.original && book.original.hash;
  if(!hash) return null;
  const recovered=(await originalAll()).find(record=>record && record.hash===hash) || null;
  if(recovered){
    try{ await originalPut(book.id,recovered); }catch(e){}
  }
  return recovered;
}
async function originalDel(id){ try{ const db=await idb(); return await new Promise(res=>{
  const tx=db.transaction('originals','readwrite'); tx.objectStore('originals').delete(id);
  tx.oncomplete=res; tx.onerror=res; }); }catch(e){} }
async function originalHas(id){ return !!(await originalGet(id)); }
async function imgPut(id, blob){ const db=await idb(); return new Promise((res,rej)=>{
  const tx=db.transaction('imgs','readwrite'); tx.objectStore('imgs').put(blob,id); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function imgGet(id){ try{ const db=await idb(); return await new Promise(res=>{
  const rq=db.transaction('imgs').objectStore('imgs').get(id); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(null); }); }catch(e){ return null; } }
async function imgDel(id){ try{ const db=await idb(); return await new Promise(res=>{
  const tx=db.transaction('imgs','readwrite'); tx.objectStore('imgs').delete(id); tx.oncomplete=res; tx.onerror=res; }); }catch(e){} }
async function imgRename(oldPrefix, newPrefix){
  try{
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('imgs', 'readwrite');
      const store = tx.objectStore('imgs');
      const keysRequest = store.getAllKeys();

      keysRequest.onsuccess = () => {
        keysRequest.result
          .filter(key => String(key).startsWith(oldPrefix + '|'))
          .forEach(key => {
            const valueRequest = store.get(key);
            valueRequest.onsuccess = () => {
              if(valueRequest.result === undefined) return;
              store.put(valueRequest.result, String(key).replace(oldPrefix, newPrefix));
              store.delete(key);
            };
          });
      };
      keysRequest.onerror = () => reject(keysRequest.error);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }catch(error){
    console.warn('Could not rename imported images:', error);
  }
}
async function imgPurge(prefix){ try{ const db=await idb(); return await new Promise((resolve,reject)=>{
  const tx=db.transaction('imgs','readwrite');
  const st=tx.objectStore('imgs');
  const rq=st.getAllKeys();
  rq.onsuccess=()=>rq.result.filter(k=>String(k).startsWith(prefix)).forEach(k=>st.delete(k));
  rq.onerror=()=>reject(rq.error); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
}); }catch(e){} }
const IMG_MARK = '[[IMG]]:';

/* ---- AI dictionary cache (별도 DB: 나중에 내장 데이터셋의 씨앗이 됨) ---- */
function ddb(){ return new Promise((res,rej)=>{ const r=indexedDB.open('breeze-dict',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('entries'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function dictGet(key){ try{ const db=await ddb(); return await new Promise(res=>{
  const rq=db.transaction('entries').objectStore('entries').get(key);
  rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>res(null); }); }catch(e){ return null; } }
async function dictPut(key,val){ try{ const db=await ddb(); await new Promise((res,rej)=>{
  const tx=db.transaction('entries','readwrite'); tx.objectStore('entries').put(val,key);
  tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }catch(e){} }
async function dictCount(){ try{ const db=await ddb(); return await new Promise(res=>{
  const rq=db.transaction('entries').objectStore('entries').count();
  rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(0); }); }catch(e){ return 0; } }
/* 캐시를 JSON으로 내보내기 — 콘솔에서 breezeExportDict() 로 호출 */
window.breezeExportDict = async function(){
  const db=await ddb();
  const [keys,vals]=await Promise.all([
    new Promise(r=>{const q=db.transaction('entries').objectStore('entries').getAllKeys(); q.onsuccess=()=>r(q.result);}),
    new Promise(r=>{const q=db.transaction('entries').objectStore('entries').getAll();     q.onsuccess=()=>r(q.result);})
  ]);
  const out={}; keys.forEach((k,i)=>out[k]=vals[i]);
  const blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='breeze_dict_'+keys.length+'.json'; a.click();
  return keys.length+'개 내보냄';
};
