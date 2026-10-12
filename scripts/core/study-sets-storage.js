/* Study snapshots and sessions outgrow Web Storage's small shared quota.
   Keep their schemas intact in one transactional value per study engine. */
const studyStorageDb=openDb('breeze-study',1,db=>db.createObjectStore('records'));
const STUDY_SETS_STORAGE='breeze.study-sets.v1';
let studySetsReadValue;
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
async function readStudyStorage(key,decode){
  await studyStorageWrites.get(key);
  const db=await studyStorageDb();let failure;
  // An absent IDB record alone admits migration. Existing IDB data is never
  // replaced by stale legacy data, an empty fallback, or a second tab's import.
  await localTransaction(db,'records','readwrite',tx=>{
    const store=tx.objectStore('records'),request=store.get(key);
    request.onsuccess=()=>{
      try{
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
  studyStorageRecord(record,decode);
  const remaining=studyStorageLegacy(key);
  if(Object.entries(remaining).some(([name,value])=>record.legacy[name]!==value))
    throw new Error('Study storage changed in an older app. The saved values were not changed.');
  for(const [name,value] of Object.entries(remaining)){
    if(localStorage.getItem(name)!==value)throw new Error('Study storage changed. Reopen and retry.');
    localStorage.removeItem(name);
  }
  return record.value;
}
function commitStudyStorage(key,value,expected,decode){
  const job=writeStudyStorage(key,value,expected,decode);
  studyStorageWrites.set(key,job);
  return job.finally(()=>{if(studyStorageWrites.get(key)===job)studyStorageWrites.delete(key);});
}
async function writeStudyStorage(key,value,expected,decode){
  const db=await studyStorageDb();
  decode(value);
  if(expected===undefined)throw new Error('Study storage must be read before writing.');
  let failure;
  await localTransaction(db,'records','readwrite',tx=>{
    const store=tx.objectStore('records'),request=store.get(key);
    request.onsuccess=()=>{
      try{
        const current=studyStorageRecord(request.result,decode);
        if(current.value!==expected||Object.keys(studyStorageLegacy(key)).length)
          throw new Error('Study storage changed. Reopen and retry.');
        store.put({...current,value},key);
      }catch(error){failure=error;tx.abort();}
    };
  }).catch(error=>{throw failure||error;});
  // Persistence policy is optional; it must not reclassify a completed commit.
  try{studyStorageChannel?.postMessage(key);}catch{}
  try{if(typeof requestDurableLocalStorage==='function')Promise.resolve(requestDurableLocalStorage()).catch(()=>{});}catch{}
}
async function loadStudySets(){
  const raw=await readStudyStorage(STUDY_SETS_STORAGE,BreezeStudySets.decode);
  studySetsReadValue=raw;
  return BreezeStudySets.decode(raw);
}
function readStudySets(){
  if(studySetsReadValue===undefined)throw new Error('Study sets have not finished loading.');
  return BreezeStudySets.decode(studySetsReadValue);
}
async function commitStudySets(next){
  const expected=studySetsReadValue,serialized=JSON.stringify(BreezeStudySets.normalize(next));
  await commitStudyStorage(STUDY_SETS_STORAGE,serialized,expected,BreezeStudySets.decode);
  studySetsReadValue=serialized;
}
