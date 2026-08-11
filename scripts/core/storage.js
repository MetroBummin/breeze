/* ================= local book assets (IndexedDB) =================
   Extracted text stays in `books`, EPUB images in `imgs`, and the user's raw
   PDF/EPUB stays in `originals`. Originals never enter the sync payload. */
/* 연결은 한 번만 엽니다. 예전에는 dictGet/dictPut/imgGet 이 호출될 때마다
   indexedDB.open 을 새로 불렀습니다 — 낱말 하나 볼 때는 티가 안 나지만, 사전
   씨앗처럼 천 번을 잇달아 쓰면 연결 여는 값이 일하는 값보다 커집니다.
   실패하면 기억해 둔 약속을 버려서 다음에 다시 열어 볼 수 있게 합니다. */
function openDb(name, version, upgrade){
  let job = null;
  return function(){
    if(job) return job;
    job = new Promise((res, rej)=>{
      const r = indexedDB.open(name, version);
      r.onupgradeneeded = ()=>upgrade(r.result);
      r.onsuccess = ()=>{
        /* 다른 탭이 판을 올리려 하면 붙잡고 있지 않습니다. */
        r.result.onversionchange = ()=>{ try{ r.result.close(); }catch(e){} job = null; };
        res(r.result);
      };
      r.onerror = ()=>{ job = null; rej(r.error); };
    }).catch(error => { job = null; throw error; });
    return job;
  };
}

const idb = openDb('breeze-img', 4, db => {
  if(!db.objectStoreNames.contains('imgs'))  db.createObjectStore('imgs');
  if(!db.objectStoreNames.contains('books')) db.createObjectStore('books');   // 책 본문(용량 큼)
  if(!db.objectStoreNames.contains('originals')) db.createObjectStore('originals');
  /* E2EE 기기 열쇠와 잠긴 마스터 키. CryptoKey 는 구조화 복제로 IndexedDB에
     들어가며, extractable:false 로 만들어 원문 열쇠를 꺼낼 수 없게 합니다. */
  if(!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
});

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
async function storeEntries(name){ try{ const db=await idb(); return await new Promise(res=>{
  const store=db.transaction(name).objectStore(name), kr=store.getAllKeys(), vr=store.getAll();
  let keys=null,values=null; const done=()=>{ if(keys&&values) res(keys.map((key,index)=>[key,values[index]])); };
  kr.onsuccess=()=>{ keys=kr.result||[]; done(); }; vr.onsuccess=()=>{ values=vr.result||[]; done(); };
  kr.onerror=vr.onerror=()=>res([]); }); }catch(e){ return []; } }
const originalEntries=()=>storeEntries('originals');
const imgEntries=()=>storeEntries('imgs');
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
async function vaultPut(key, value){ const db=await idb(); return new Promise((res,rej)=>{
  const tx=db.transaction('vault','readwrite'); tx.objectStore('vault').put(value,key);
  tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function vaultGet(key){ try{ const db=await idb(); return await new Promise(res=>{
  const rq=db.transaction('vault').objectStore('vault').get(key);
  rq.onsuccess=()=>res(rq.result===undefined?null:rq.result); rq.onerror=()=>res(null); }); }catch(e){ return null; } }
async function vaultDel(key){ try{ const db=await idb(); return await new Promise(res=>{
  const tx=db.transaction('vault','readwrite'); tx.objectStore('vault').delete(key);
  tx.oncomplete=res; tx.onerror=res; }); }catch(e){} }
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
const ddb = openDb('breeze-dict', 1, db => {
  if(!db.objectStoreNames.contains('entries')) db.createObjectStore('entries');
});
/* 씨앗을 부을 때는 한 번의 거래로 다 씁니다. 낱말마다 거래를 열면 천 개를
   붓는 데 몇 초가 걸리고, 그동안 첫 낱말을 누른 사람은 그냥 기다립니다. */
async function dictPutAll(pairs){
  if(!pairs.length) return 0;
  const db = await ddb();
  return new Promise((res, rej)=>{
    const tx = db.transaction('entries','readwrite');
    const store = tx.objectStore('entries');
    for(const [key, value] of pairs) store.put(value, key);
    tx.oncomplete = ()=>res(pairs.length);
    tx.onerror = ()=>rej(tx.error);
    tx.onabort = ()=>rej(tx.error);
  });
}
/* 이미 있는 열쇠만 골라 냅니다 — 씨앗이 사람이 직접 받은 답을 덮지 않도록. */
async function dictExistingKeys(keys){
  const db = await ddb();
  return new Promise(res=>{
    const found = new Set();
    const tx = db.transaction('entries');
    const store = tx.objectStore('entries');
    for(const key of keys){
      const rq = store.openKeyCursor(IDBKeyRange.only(key));
      rq.onsuccess = ()=>{ if(rq.result) found.add(key); };
    }
    tx.oncomplete = ()=>res(found);
    tx.onerror = ()=>res(found);
  });
}
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
