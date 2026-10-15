/* WebKit gives one origin about 5MB of localStorage. A later setItem then throws
   QuotaExceededError. boot-safety.js reports every uncaught error as a failed
   startup, so a full disk on the test-result screen looked like a boot failure.
   This wrapper frees disposable caches, redundant word snapshots, and oversized
   test logs, then retries. Word records are never deleted to make room. */
(function(){
  if(typeof Storage==='undefined'||typeof localStorage==='undefined')return;
  const nativeSet=Storage.prototype.setItem;
  const nativeRemove=Storage.prototype.removeItem;
  let recovering=false;

  function quotaError(error){
    return !!error&&(error.name==='QuotaExceededError'||error.code===22||error.code===1014);
  }
  function learningBase(key){
    const at=String(key).lastIndexOf('.breeze.');
    return at===-1?String(key):String(key).slice(at+1);
  }
  function durableName(name){
    return name==='breeze.words'||name==='breeze.dead'
      ||name==='breeze.word-write.pending'||name==='breeze.dead-write.pending'
      ||name==='breeze.word-conflicts'
      ||name.startsWith('breeze.word-item.')||name.startsWith('breeze.dead-item.')
      ||name.startsWith('breeze.learning.')||name.startsWith('breeze.device-local-merge.')
      ||name.startsWith('sb-');
  }
  function disposableName(name){
    if(durableName(name))return false;
    return name.startsWith('breeze.rss-')||name.startsWith('breeze.article-preview.')
      ||name.startsWith('breeze.home-crop.')||name.startsWith('breeze.debug.')
      ||name.startsWith('breeze.vocabulary-review.v1.backup');
  }
  function eachKey(visit){
    const keys=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key)keys.push(key);
    }
    keys.forEach(visit);
  }
  function pruneDisposableCaches(){
    const drop=[];
    eachKey(key=>{if(disposableName(learningBase(key)))drop.push(key);});
    drop.forEach(key=>{try{nativeRemove.call(localStorage,key);}catch(e){}});
  }
  /* The full breeze.words snapshot is redundant once every key also has a
     word-item in the same account scope. Words that exist only in the snapshot
     stay there. */
  function compactRedundantWordSnapshots(){
    const blobs=[];
    eachKey(key=>{if(learningBase(key)==='breeze.words')blobs.push(key);});
    blobs.forEach(key=>{
      let blob;
      try{blob=JSON.parse(localStorage.getItem(key)||'null');}catch(e){return;}
      if(!blob||typeof blob!=='object'||Array.isArray(blob))return;
      const names=Object.keys(blob);
      if(!names.length)return;
      const prefix=key.slice(0,key.length-'breeze.words'.length)+'breeze.word-item.';
      if(!names.every(name=>localStorage.getItem(prefix+name)!==null))return;
      try{nativeRemove.call(localStorage,key);}catch(e){}
    });
  }
  function cappedStudyTests(data){
    const local={version:1,sets:{}},overflow={version:1,sets:{}};
    for(const [id,rows] of Object.entries(data&&data.sets||{})){
      if(!Array.isArray(rows))continue;
      const pending=[],done=[];
      for(const row of rows){
        if(!row||typeof row!=='object')continue;
        if(row.pending){pending.push(row);continue;}
        if(Object.prototype.hasOwnProperty.call(row,'rows')){const copy={...row};delete copy.rows;done.push(copy);}
        else done.push(row);
      }
      done.sort((a,b)=>(b.at||0)-(a.at||0)||String(a.id||'').localeCompare(String(b.id||'')));
      local.sets[id]=pending.concat(done.slice(0,40));
      if(done.length>40)overflow.sets[id]=done.slice(40);
    }
    return {local,overflow};
  }
  function capOversizedStudyTests(){
    const keys=[];
    eachKey(key=>{if(learningBase(key)==='breeze.study-set-tests.v1')keys.push(key);});
    keys.forEach(key=>{
      const raw=localStorage.getItem(key);
      if(!raw||raw.length<100000)return;
      let data;
      try{data=JSON.parse(raw);}catch(e){return;}
      if(!data||data.version!==1||!data.sets)return;
      const parts=cappedStudyTests(data),slim=JSON.stringify(parts.local);
      if(slim.length>=raw.length)return;
      try{
        nativeRemove.call(localStorage,key);
        nativeSet.call(localStorage,key,slim);
        if(typeof breezeQueueTestOverflow==='function')void breezeQueueTestOverflow(key,parts.overflow,false);
      }catch(e){
        try{if(localStorage.getItem(key)===null)nativeSet.call(localStorage,key,raw);}catch(restore){}
      }
    });
  }
  function breezeRecoverStorageQuota(){
    if(recovering)return;
    recovering=true;
    try{
      pruneDisposableCaches();
      capOversizedStudyTests();
      compactRedundantWordSnapshots();
    }finally{recovering=false;}
  }
  function breezeQueueTestOverflow(key,overflow,complete){
    const task=async()=>{
      let next=overflow&&overflow.sets?overflow:{version:1,sets:{}};
      if(!complete&&typeof studyTestsOverflowRead==='function'&&typeof studyTestsMerge==='function')
        next=studyTestsMerge(await studyTestsOverflowRead(key),next);
      if(typeof studyStorageDb!=='function'||typeof localTransaction!=='function')return;
      const empty=!Object.values(next.sets||{}).some(rows=>Array.isArray(rows)&&rows.length);
      const db=await studyStorageDb();
      await localTransaction(db,'records','readwrite',tx=>{
        const store=tx.objectStore('records');
        if(empty)store.delete(key+'.test-overflow');
        else store.put({value:JSON.stringify(next)},key+'.test-overflow');
      });
    };
    const chain=(globalThis.__breezeTestOverflowChain||Promise.resolve()).catch(()=>{}).then(task);
    globalThis.__breezeTestOverflowChain=chain;
    return chain;
  }
  globalThis.breezeRecoverStorageQuota=breezeRecoverStorageQuota;
  globalThis.breezeQueueTestOverflow=breezeQueueTestOverflow;
  globalThis.breezeStorageQuotaError=quotaError;

  Storage.prototype.setItem=function(key,value){
    if(this!==localStorage||recovering){nativeSet.call(this,key,value);return;}
    try{nativeSet.call(this,key,value);}
    catch(error){
      if(!quotaError(error))throw error;
      breezeRecoverStorageQuota();
      try{nativeSet.call(this,key,value);}
      catch(again){
        if(!quotaError(again))throw again;
        throw again;
      }
    }
  };
  try{compactRedundantWordSnapshots();}catch(e){}
})();
