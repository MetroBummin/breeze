/* Study snapshots and sessions outgrow Web Storage's small shared quota.
   Keep their schemas intact in one transactional value per study engine. */
const studyStorageDb=openDb('breeze-study',1,db=>db.createObjectStore('records'));
const STUDY_SETS_STORAGE='breeze.study-sets.v1';
let studySetsReadValue,studySetsReadScope,studySetsReadRevision=0,studySetsLoadedState=null;
let studySetsLoadedPositions=new Map();
function studyScopeCapture(){return typeof captureLearningScope==='function'?captureLearningScope():null;}
function studyScopeAssert(scope){if(scope&&typeof assertLearningScope==='function')assertLearningScope(scope);}
function studyScopeKey(key,scope=studyScopeCapture()){return scope&&scope.id!=='legacy'?learningStorageKey(key,scope):key;}
function studyScopeChanged(){studySetsReadValue=undefined;studySetsReadScope=undefined;studySetsLoadedState=null;studySetsLoadedPositions.clear();studySetsReadRevision=0;}
if(typeof window.addEventListener==='function')window.addEventListener('breeze-learning-scope',studyScopeChanged);
function studyStorageNotify(key,scope=studyScopeCapture(),local=true,setIds=null){
  try{studyStorageChannel?.postMessage(studyScopeKey(key,scope));}catch{}
  if(local&&typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('breeze:study-changed',{detail:{scope:scope?.id,key,setIds}}));
}
const studyStorageWrites=new Map();
const studyStorageChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('breeze-study'):null;
if(studyStorageChannel)studyStorageChannel.onmessage=event=>window.dispatchEvent(new CustomEvent('breeze-study-storage',{detail:event.data}));

function studyStorageLegacy(key){
  const values={};
  for(let i=0;i<localStorage.length;i++){
    const name=localStorage.key(i);
    if(name===key||name?.startsWith(key+'.backup'))values[name]=localStorage.getItem(name);
  }
  return values;
}
function studyStorageRecord(record,decode){
  if(!record||record.version!==1||!(record.value===null||typeof record.value==='string')
    ||!record.legacy||typeof record.legacy!=='object'||Array.isArray(record.legacy)
    ||Object.values(record.legacy).some(value=>typeof value!=='string'))
    throw new Error('Invalid study storage record. The saved value was not changed.');
  decode(record.value);
  return record;
}
async function readStudyStorage(key,decode,scope=studyScopeCapture(),guard=scope){
  key=studyScopeKey(key,scope);studyScopeAssert(guard);
  await studyStorageWrites.get(key);studyScopeAssert(guard);
  const db=await studyStorageDb();studyScopeAssert(guard);let failure;
  // An absent IDB record alone admits migration. Existing IDB data is never
  // replaced by stale legacy data, an empty fallback, or a second tab's import.
  await localTransaction(db,'records','readwrite',tx=>{
    const store=tx.objectStore('records'),request=store.get(key);
    request.onsuccess=()=>{
      try{
        studyScopeAssert(guard);
        if(request.result!==undefined){studyStorageRecord(request.result,decode);return;}
        const legacy=studyStorageLegacy(key),value=legacy[key]??null;
        decode(value);
        store.add({version:1,value,legacy},key);
      }catch(error){failure=error;tx.abort();}
    };
  }).catch(error=>{throw failure||error;});
  // Read back the committed archive before releasing any Web Storage space.
  const record=await localTransaction(db,'records','readonly',(tx,done)=>{
    const request=tx.objectStore('records').get(key);request.onsuccess=()=>done(request.result);
  });
  studyScopeAssert(guard);studyStorageRecord(record,decode);
  const remaining=studyStorageLegacy(key);
  if(Object.entries(remaining).some(([name,value])=>record.legacy[name]!==value))
    throw new Error('Study storage changed in an older app. The saved values were not changed.');
  for(const [name,value] of Object.entries(remaining)){
    if(localStorage.getItem(name)!==value)throw new Error('Study storage changed. Reopen and retry.');
    localStorage.removeItem(name);
  }
  return record.value;
}
function commitStudyStorage(key,value,expected,decode,scope=studyScopeCapture(),guard=scope,notify=true,revision=undefined){
  const storageKey=studyScopeKey(key,scope);
  const job=writeStudyStorage(storageKey,value,expected,decode,guard,revision).then(()=>{studyScopeAssert(guard);studyStorageNotify(key,scope,notify);});
  studyStorageWrites.set(storageKey,job);
  return job.finally(()=>{if(studyStorageWrites.get(storageKey)===job)studyStorageWrites.delete(storageKey);});
}
async function writeStudyStorage(key,value,expected,decode,guard,revision){
  studyScopeAssert(guard);const db=await studyStorageDb();studyScopeAssert(guard);
  decode(value);
  if(expected===undefined)throw new Error('Study storage must be read before writing.');
  let failure;
  await localTransaction(db,'records','readwrite',tx=>{
    const store=tx.objectStore('records'),request=store.get(key);
    request.onsuccess=()=>{
      const replace=currentRevision=>{try{
        studyScopeAssert(guard);
        const current=studyStorageRecord(request.result,decode);
        if(current.value!==expected||(revision!==undefined&&currentRevision!==revision)||Object.keys(studyStorageLegacy(key)).length)
          throw new Error('Study storage changed. Reopen and retry.');
        store.put({...current,value},key);
        if(revision!==undefined){store.put({revision:revision+1},key+'.revision');studyClearSetItems(store,key);}
      }catch(error){failure=error;tx.abort();}};
      if(revision===undefined)replace(0);
      else{const stamp=store.get(key+'.revision');stamp.onsuccess=()=>replace(stamp.result?.revision||0);}
    };
  }).catch(error=>{throw failure||error;});
  // Persistence policy is optional; it must not reclassify a completed commit.
  try{if(typeof requestDurableLocalStorage==='function')Promise.resolve(requestDurableLocalStorage()).catch(()=>{});}catch{}
}
function studySetItemRange(key){return typeof IDBKeyRange==='undefined'?null:IDBKeyRange.bound(key+'.set.',key+'.set.\uffff');}
function studyClearSetItems(store,key){
  const cursor=store.openCursor(studySetItemRange(key));
  cursor.onsuccess=()=>{const row=cursor.result;if(row){if(String(row.key).startsWith(key+'.set.'))row.delete();row.continue();}};
}
async function readStudySetDocument(scope=studyScopeCapture(),guard=scope){
  await readLearningSource(STUDY_SETS_STORAGE,BreezeStudySets.decode,scope,guard);studyScopeAssert(guard);
  const key=studyScopeKey(STUDY_SETS_STORAGE,scope),db=await studyStorageDb();studyScopeAssert(guard);
  let failure;
  const result=await localTransaction(db,'records','readonly',(tx,done)=>{
    const store=tx.objectStore('records'),request=store.get(key),overrides=[];let record,revision,finished=false;
    const fail=error=>{failure=error;tx.abort();};
    const complete=()=>{try{if(record&&revision!==undefined&&finished){
      studyScopeAssert(guard);const state=BreezeStudySets.decode(record.value),byId=new Map(state.sets.map(set=>[set.id,set]));
      for(const set of overrides)byId.set(set.id,set);state.sets=[...byId.values()];done({state,raw:record.value,revision});
    }}catch(error){fail(error);}};
    request.onsuccess=()=>{try{record=studyStorageRecord(request.result,BreezeStudySets.decode);complete();}catch(error){fail(error);}};
    const stamp=store.get(key+'.revision');stamp.onsuccess=()=>{revision=stamp.result?.revision||0;complete();};
    const cursor=store.openCursor(studySetItemRange(key));
    cursor.onsuccess=()=>{try{const row=cursor.result;if(row){
      if(String(row.key).startsWith(key+'.set.')){const item=studyStorageRecord(row.value,BreezeStudySets.decode);overrides.push(...BreezeStudySets.decode(item.value).sets);}row.continue();
    }else{finished=true;complete();}}catch(error){fail(error);}};
  }).catch(error=>{throw failure||error;});
  studyScopeAssert(guard);return result;
}
async function loadStudySets(){
  const scope=studyScopeCapture();
  if(!scope){const raw=await readStudyStorage(STUDY_SETS_STORAGE,BreezeStudySets.decode,scope);studySetsReadValue=raw;studySetsReadScope=scope;studySetsLoadedState=null;return BreezeStudySets.decode(raw);}
  const document=await readStudySetDocument(scope);studyScopeAssert(scope);
  studySetsReadValue=document.raw;studySetsReadScope=scope;studySetsReadRevision=document.revision;studySetsLoadedState=document.state;studySetsLoadedPositions=new Map(document.state.sets.map((set,index)=>[set.id,index]));
  return document.state;
}
function readStudySets(){
  studyScopeAssert(studySetsReadScope);
  if(studySetsReadValue===undefined)throw new Error('Study sets have not finished loading.');
  return studySetsLoadedState?BreezeStudySets.normalize(studySetsLoadedState):BreezeStudySets.decode(studySetsReadValue);
}
async function commitStudySets(next){
  const scope=studySetsReadScope;studyScopeAssert(scope);
  const expected=studySetsReadValue,normalized=BreezeStudySets.normalize(next),serialized=JSON.stringify(normalized);
  await commitStudyStorage(STUDY_SETS_STORAGE,serialized,expected,BreezeStudySets.decode,scope,scope,true,scope?studySetsReadRevision:undefined);
  studyScopeAssert(scope);studySetsReadValue=serialized;studySetsLoadedState=normalized;studySetsLoadedPositions=new Map(normalized.sets.map((set,index)=>[set.id,index]));if(scope)studySetsReadRevision++;
}
async function commitStudySetsIncremental(next,setIds){
  const scope=studySetsReadScope;studyScopeAssert(scope);
  if(!scope)return commitStudySets(next);
  if(!studySetsLoadedState)throw new Error('Study sets must be loaded before incremental writing.');
  const ids=new Set(setIds),changed=[...ids].map(id=>next.sets[studySetsLoadedPositions.get(id)]).filter(Boolean);
  if(!changed.length)return;
  const serialized=changed.map(set=>[set.id,JSON.stringify(BreezeStudySets.normalize({version:2,sequence:0,sets:[set]}))]);
  const revision=studySetsReadRevision,key=studyScopeKey(STUDY_SETS_STORAGE,scope),db=await studyStorageDb();studyScopeAssert(scope);let failure;
  await localTransaction(db,'records','readwrite',tx=>{
    const store=tx.objectStore('records'),request=store.get(key+'.revision');
    request.onsuccess=()=>{try{
      studyScopeAssert(scope);
      if((request.result?.revision||0)!==revision)throw new Error('Study storage changed. Reopen and retry.');
      for(const [id,value] of serialized)store.put({version:1,value,legacy:{}},key+'.set.'+id);
      store.put({revision:revision+1},key+'.revision');
    }catch(error){failure=error;tx.abort();}};
  }).catch(error=>{throw failure||error;});
  studyScopeAssert(scope);studySetsReadRevision=revision+1;studySetsLoadedState=next;
  studyStorageNotify(STUDY_SETS_STORAGE,scope,true,[...ids]);
}

/* Account payloads contain captured learning content only. Books, their source
   text, images and local file handles never enter this adapter. */
const STUDY_SIMPLE_ARCHIVE='breeze.simple-study-archives.v1';
function studyTestsKey(scope=studyScopeCapture()){return studyScopeKey('breeze.study-set-tests.v1',scope);}
function studyTestsDecode(raw){
  const result=BreezeStudySetTest.read(raw);
  if(!result.ok)throw new Error('Invalid saved study test history. The saved value was not changed.');
  for(const [id,rows] of Object.entries(result.data.sets)){
    if(!Array.isArray(rows)||BreezeStudySetTest.records(raw,id).length!==rows.length)throw new Error('Invalid saved study test history.');
  }
  return result.data;
}
function studyStorageStableJson(value){return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
function studyTestsMerge(left,right){
  const sets={};
  for(const id of [...new Set([...Object.keys(left.sets),...Object.keys(right.sets)])].sort()){
    const rows=new Map();
    for(const row of [...left.sets[id]||[],...right.sets[id]||[]]){
      // The complete existing summary is the conflict identity. Exact retries
      // collapse; conflicting same-ID summaries are preserved in stable order.
      rows.set(studyStorageStableJson(row),row);
    }
    const settled=new Set([...rows.values()].filter(row=>row&&row.id&&!row.pending).map(row=>row.id));
    sets[id]=[...rows.values()].filter(row=>!(row&&row.pending&&settled.has(row.id))).sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id)||studyStorageStableJson(a).localeCompare(studyStorageStableJson(b)));
  }
  return {version:1,sets};
}
function saveStudySetTestRecord(setId,record,scope=studyScopeCapture()){
  studyScopeAssert(scope);const key=studyTestsKey(scope),raw=localStorage.getItem(key);
  const previous=studyTestsDecode(raw),saved=BreezeStudySetTest.save(raw,setId,record);
  if(!saved.ok)return false;
  // Import and device merges can bring more than forty extant summaries. Keep
  // those summaries instead of silently clipping another device's history.
  const next=studyTestsMerge(previous,studyTestsDecode(saved.raw));
  localStorage.setItem(key,JSON.stringify(next));studyStorageNotify(BreezeStudySetTest.KEY,scope);return true;
}
function studySimpleArchiveDecode(raw){
  if(raw===null)return {version:1,sessions:[]};
  const value=JSON.parse(raw);
  if(value?.version!==1||!Array.isArray(value.sessions))throw new Error('Invalid study session archive.');
  for(const session of value.sessions)decodeSimpleStudySession(JSON.stringify(session));
  return value;
}
function studySimpleMerge(left,right){
  const seen=new Set(),sessions=[];
  // Frozen sessions are not spliced together. Each distinct progress branch is
  // retained, with this device's current round remaining current when present.
  const active=left.active||right.active||null;
  const activeRaw=studyStorageStableJson(active);
  for(const session of [...left.sessions||[],...right.sessions||[],left.active,right.active]){
    if(!session)continue;
    const raw=studyStorageStableJson(session);
    if(raw!==activeRaw&&!seen.has(raw)){seen.add(raw);sessions.push(session);}
  }
  return {version:1,active,sessions};
}
async function readLearningSource(key,decode,scope,guard){
  if(scope?.id!=='legacy')return readStudyStorage(key,decode,scope,guard);
  studyScopeAssert(guard);const db=await studyStorageDb();studyScopeAssert(guard);
  const record=await localTransaction(db,'records','readonly',(tx,done)=>{
    const request=tx.objectStore('records').get(key);request.onsuccess=()=>done(request.result);
  });
  studyScopeAssert(guard);
  // No cleanup, overwrite or inferred ownership for pre-account data.
  if(record!==undefined){
    studyStorageRecord(record,decode);const recreated=localStorage.getItem(key);
    if(recreated!==null&&recreated!==record.value&&recreated!==record.legacy[key])throw new Error('Legacy study storage changed in an older app. Both original values were preserved.');
    return record.value;
  }
  const raw=localStorage.getItem(key);decode(raw);return raw;
}
async function exportLearningStorage(scope=studyScopeCapture(),guard=studyScopeCapture()){
  const [setsRaw,simpleRaw,archiveRaw]=await Promise.all([
    scope?.id==='legacy'?readLearningSource(STUDY_SETS_STORAGE,BreezeStudySets.decode,scope,guard):readStudySetDocument(scope,guard),
    readLearningSource('breeze.simple-study-session.v1',decodeSimpleStudySession,scope,guard),
    readLearningSource(STUDY_SIMPLE_ARCHIVE,studySimpleArchiveDecode,scope,guard)
  ]);
  studyScopeAssert(guard);
  const result={version:1,sets:typeof setsRaw==='object'&&setsRaw!==null?setsRaw.state:BreezeStudySets.decode(setsRaw),simple:{version:1,active:decodeSimpleStudySession(simpleRaw),sessions:studySimpleArchiveDecode(archiveRaw).sessions},tests:studyTestsDecode(localStorage.getItem(studyTestsKey(scope)))};
  Object.defineProperty(result,'localRevision',{value:setsRaw?.revision||0});return result;
}
function validateLearningPayload(payload){
  if(payload?.version!==1||payload.simple?.version!==1)throw new Error('Unsupported learning sync version.');
  const sets=BreezeStudySets.normalize(payload.sets),tests=studyTestsDecode(JSON.stringify(payload.tests));
  const active=decodeSimpleStudySession(payload.simple.active===null?null:JSON.stringify(payload.simple.active));
  const sessions=studySimpleArchiveDecode(JSON.stringify({version:1,sessions:payload.simple.sessions})).sessions;
  return {version:1,sets,simple:{version:1,active,sessions},tests};
}
async function mergeLearningStorage(remote,scope=studyScopeCapture(),guard=studyScopeCapture()){
  remote=validateLearningPayload(remote);studyScopeAssert(guard);
  // Compare-and-swap each durable record. Retries re-read local progress, so an
  // answer or exclusion saved while a fetch was pending cannot be overwritten.
  for(let attempt=0;attempt<4;attempt++){
    try{
      const local=await exportLearningStorage(scope,guard);studyScopeAssert(guard);
      const merged={version:1,sets:BreezeStudySets.mergeStates(local.sets,remote.sets),simple:studySimpleMerge(local.simple,remote.simple),tests:studyTestsMerge(local.tests,remote.tests)};
      const records=[
        [STUDY_SETS_STORAGE,JSON.stringify(merged.sets),BreezeStudySets.decode],
        ['breeze.simple-study-session.v1',merged.simple.active===null?null:JSON.stringify(merged.simple.active),decodeSimpleStudySession],
        [STUDY_SIMPLE_ARCHIVE,JSON.stringify({version:1,sessions:merged.simple.sessions}),studySimpleArchiveDecode]
      ];
      const db=await studyStorageDb();studyScopeAssert(guard);
      let failure;
      await localTransaction(db,'records','readwrite',tx=>{
        const store=tx.objectStore('records');
        for(const [key,value,decode] of records){
          const request=store.get(studyScopeKey(key,scope));
          request.onsuccess=()=>{
            const replace=revision=>{try{
              studyScopeAssert(guard);const current=studyStorageRecord(request.result,decode);
              if(key===STUDY_SETS_STORAGE){
                if(revision!==local.localRevision)throw new Error('Study storage changed. Reopen and retry.');
                store.put({revision:revision+1},studyScopeKey(key,scope)+'.revision');studyClearSetItems(store,studyScopeKey(key,scope));
              }else{
                const expected=key===STUDY_SIMPLE_ARCHIVE?JSON.stringify({version:1,sessions:local.simple.sessions}):local.simple.active===null?null:JSON.stringify(local.simple.active);
                const actual=key===STUDY_SIMPLE_ARCHIVE?JSON.stringify(studySimpleArchiveDecode(current.value)):current.value;
                if(actual!==expected)throw new Error('Study storage changed. Reopen and retry.');
              }
              store.put({...current,value},studyScopeKey(key,scope));
            }catch(error){failure=error;tx.abort();}};
            if(key===STUDY_SETS_STORAGE){const stamp=store.get(studyScopeKey(key,scope)+'.revision');stamp.onsuccess=()=>replace(stamp.result?.revision||0);}
            else replace(0);
          };
        }
      }).catch(error=>{throw failure||error;});
      studyScopeAssert(guard);
      // Read summaries again after IDB awaits; their synchronous local writer
      // can have added a completed test while the transaction was running.
      merged.tests=studyTestsMerge(studyTestsDecode(localStorage.getItem(studyTestsKey(scope))),merged.tests);
      localStorage.setItem(studyTestsKey(scope),JSON.stringify(merged.tests));
      if(!scope||typeof isLearningScopeCurrent!=='function'||isLearningScopeCurrent(scope))studyScopeChanged();
      studyStorageNotify(STUDY_SETS_STORAGE,scope,false);
      if(typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('breeze-study-storage',{detail:studyScopeKey(STUDY_SETS_STORAGE,scope)}));
      return merged;
    }catch(error){if(error?.syncCancelled||attempt===3||!/changed/.test(String(error?.message)))throw error;}
  }
}
async function importLearningStorage(sourceToken,targetToken,importId,wordKeyMap={}){
  const guard=studyScopeCapture(),source=await exportLearningStorage(sourceToken,guard);studyScopeAssert(guard);
  const migrated=BreezeStudySets.migrateIds(source.sets,importId,{wordKeys:wordKeyMap});
  source.sets=migrated.state;
  source.tests={version:1,sets:Object.fromEntries(Object.entries(source.tests.sets).map(([id,rows])=>[migrated.setIds[id]||id,rows]))};
  const remap=(session,active=false)=>{
    if(!session)return null;
    const key=value=>wordKeyMap[value]||value;
    // Several old meanings may now share one exact target key. Keep the original
    // frozen round archived when remapping would invalidate its queue/history.
    const candidate={...session,initial:session.initial.map(key),queue:session.queue.map(key),passed:session.passed.map(key),history:session.history.map(row=>({...row,key:key(row.key)}))};
    try{return decodeSimpleStudySession(JSON.stringify(candidate));}catch{if(active)unmapped.push(session);return active?null:session;}
  };
  const unmapped=[],active=remap(source.simple.active,true);
  source.simple={version:1,active,sessions:[...source.simple.sessions.map(session=>remap(session)),...unmapped]};
  const merged=await mergeLearningStorage(source,targetToken,guard);studyScopeAssert(guard);
  studyStorageNotify(STUDY_SETS_STORAGE,targetToken,true);return merged;
}
function canonicalLearningPayload(payload){
  const sessions=[...payload.simple.sessions,...(payload.simple.active?[payload.simple.active]:[])];
  const unique=[...new Map(sessions.map(session=>[studyStorageStableJson(session),session])).entries()].sort(([a],[b])=>a.localeCompare(b));
  return {...payload,simple:{version:1,active:unique[0]?.[1]||null,sessions:unique.slice(1).map(([,session])=>session)}};
}
if(typeof window!=='undefined')Reflect.set(window,'BreezeStudyStorage',{
  exportAccountState:async()=>canonicalLearningPayload(await exportLearningStorage()),
  mergeAccountState:async remote=>canonicalLearningPayload(await mergeLearningStorage(remote)),
  importLearningStorage,
  exportAccountChanges:async setIds=>{
    const scope=studyScopeCapture();
    if(!studySetsLoadedState)await loadStudySets();studyScopeAssert(scope);
    const sets=[...new Set(setIds)].map(id=>studySetsLoadedState.sets[studySetsLoadedPositions.get(id)]).filter(Boolean);
    return {version:1,sets:JSON.parse(JSON.stringify(sets))};
  }
});
async function hasLegacyLearningStorage(){
  const guard=studyScopeCapture(),db=await studyStorageDb();studyScopeAssert(guard);
  const keys=[STUDY_SETS_STORAGE,'breeze.simple-study-session.v1'];
  for(const key of [...keys,'breeze.study-set-tests.v1'])if(localStorage.getItem(key)!==null)return true;
  const found=await localTransaction(db,'records','readonly',(tx,done)=>{
    let pending=keys.length,found=false;
    for(const key of keys){const request=tx.objectStore('records').get(key);request.onsuccess=()=>{found ||= request.result?.value!=null;if(--pending===0)done(found);};}
  });
  studyScopeAssert(guard);return found;
}
async function archiveSimpleStudySession(session,scope=studyScopeCapture()){
  for(let attempt=0;attempt<3;attempt++){
    const raw=await readStudyStorage(STUDY_SIMPLE_ARCHIVE,studySimpleArchiveDecode,scope),archive=studySimpleArchiveDecode(raw),encoded=JSON.stringify(session);
    if(archive.sessions.some(item=>JSON.stringify(item)===encoded))return;
    archive.sessions.push(session);
    try{await commitStudyStorage(STUDY_SIMPLE_ARCHIVE,JSON.stringify(archive),raw,studySimpleArchiveDecode,scope,scope,false);return;}
    catch(error){if(error?.syncCancelled||attempt===2||!/changed/.test(String(error?.message)))throw error;}
  }
}
