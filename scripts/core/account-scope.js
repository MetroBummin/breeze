/* Learning data belongs to an account, never to the last person using a phone.
   Original unscoped records are a read-only archive until explicitly claimed. */
const LEARNING_GUEST_KEY='breeze.learning.guest.v1';
const LEARNING_CLAIMS_KEY='breeze.learning.claims.v1';
const LEARNING_DEVICE_KEY='breeze.learning.device.v1';
function learningUuid(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function learningDeviceId(){
  let id=localStorage.getItem(LEARNING_DEVICE_KEY);
  if(!id){id=learningUuid();localStorage.setItem(LEARNING_DEVICE_KEY,id);}
  return id;
}
function learningGuestId(){
  let id=localStorage.getItem(LEARNING_GUEST_KEY);
  if(!id){id='guest:'+learningUuid();localStorage.setItem(LEARNING_GUEST_KEY,id);}
  return id;
}
function learningCachedUserId(){
  try{
    const url=window.BREEZE_CONFIG?.SB_URL;if(!url)return null;
    const ref=new URL(url).hostname.split('.')[0];
    const user=JSON.parse(localStorage.getItem('sb-'+ref+'-auth-token')||'null')?.user;
    return typeof user?.id==='string'&&user.id?user.id:null;
  }catch{return null;}
}
const learningBootUser=learningCachedUserId();
let learningScope={id:learningBootUser?'user:'+learningBootUser:learningGuestId(),generation:0};
let learningImportJob=null;
const captureLearningScope=()=>({...learningScope});
const isLearningScopeCurrent=token=>!!token&&token.id===learningScope.id&&token.generation===learningScope.generation;
function assertLearningScope(token){
  if(!isLearningScopeCurrent(token))throw Object.assign(new Error('학습 계정이 바뀌었어요'),{syncCancelled:true});
}
function learningStorageKey(base,token=captureLearningScope()){
  return token.id==='legacy'?base:'breeze.account.v1.'+encodeURIComponent(token.id)+'.'+base;
}
function isLearningStorageName(key){
  return ['breeze.words','breeze.dead','breeze.dead-write.pending','breeze.word-write.pending','breeze.word-conflicts',
    'breeze.vault.changed','breeze.learning.changed','breeze.lastsync','breeze.study-set-tests.v1','breeze.fs',
    'breeze.vocabulary-review.v1'].includes(key)||key.startsWith('breeze.word-item.')||key.startsWith('breeze.dead-item.');
}
function learningLocalKey(key){return isLearningStorageName(key)?learningStorageKey(key):key;}
function learningReadJson(key,fallback,token){
  const raw=localStorage.getItem(learningStorageKey(key,token));
  if(raw===null)return fallback;
  return JSON.parse(raw);
}
function learningSourceWords(token){
  const result=learningReadJson('breeze.words',{},token);
  const prefix=learningStorageKey('breeze.word-item.',token);
  for(let i=0;i<localStorage.length;i++){
    const name=localStorage.key(i);
    if(name?.startsWith(prefix)){
      const item=JSON.parse(localStorage.getItem(name));
      if(item===null)delete result[name.slice(prefix.length)];else result[name.slice(prefix.length)]=item;
    }
  }
  for(const [key,item] of Object.entries(learningReadJson('breeze.word-write.pending',{},token))){
    if(item===null)delete result[key];else result[key]=item;
  }
  return result;
}
function learningSourceDead(token){
  const result=learningReadJson('breeze.dead',{},token),prefix=learningStorageKey('breeze.dead-item.',token);
  for(let i=0;i<localStorage.length;i++){
    const name=localStorage.key(i);
    if(name?.startsWith(prefix)){
      const value=JSON.parse(localStorage.getItem(name));
      if(value===null)delete result[name.slice(prefix.length)];else result[name.slice(prefix.length)]=value;
    }
  }
  for(const [key,value] of Object.entries(learningReadJson('breeze.dead-write.pending',{},token))){
    if(value===null)delete result[key];else result[key]=value;
  }
  return result;
}
function learningClaims(){return JSON.parse(localStorage.getItem(LEARNING_CLAIMS_KEY)||'{}');}
// IndexedDB serializes ownership claims from different tabs. No source can be
// imported by two accounts, even when both tabs observed the same guest ID.
const learningClaimsDb=openDb('breeze-learning-ownership',1,db=>db.createObjectStore('claims'));
async function claimLearningSource(source,target){
  const db=await learningClaimsDb();assertLearningScope(target);
  return localTransaction(db,'claims','readwrite',(tx,done)=>{
    const store=tx.objectStore('claims'),request=store.get(source.id);
    request.onsuccess=()=>{
      const existing=request.result,intent=learningClaims()[source.id];
      if(!existing&&intent&&intent.owner!==target.id){done(null);return;}
      if(existing&&existing.owner!==target.id){done(null);return;}
      const claim=existing||{source:source.id,owner:target.id,id:'import:'+learningDeviceId()+':'+source.id,complete:false};
      if(!existing)store.add(claim,source.id);done(claim);
    };
  });
}
async function importLearningSource(source,target=captureLearningScope()){
  assertLearningScope(target);
  if(!target.id.startsWith('user:')||source.id.startsWith('user:'))throw new Error('Invalid learning import owner');
  const claim=await claimLearningSource(source,target);assertLearningScope(target);
  if(!claim||claim.complete)return false;
  // This small receipt is a retry index only. The transactional IDB claim owns
  // authorization; a failed receipt write cannot transfer ownership.
  const claims=learningClaims();claims[source.id]={source:claim.source,owner:claim.owner,id:claim.id,complete:false};
  localStorage.setItem(LEARNING_CLAIMS_KEY,JSON.stringify(claims));
  const originals=learningSourceWords(source),sourceDead=learningSourceDead(source),keyMap=claim.keyMap||{};
  const exact=item=>JSON.stringify([String(item.word||'').normalize('NFC').trim().replace(/\s+/g,' '),String(item.ko||'').normalize('NFC').trim().replace(/\s+/g,' ')]);
  const matches=new Map(Object.entries(words).filter(([,item])=>validWordMeaning(item)).map(([key,item])=>[exact(item),key]));
  for(const [key,item] of Object.entries(originals)){
    if(!validWordMeaning(item)||Object.prototype.hasOwnProperty.call(keyMap,key))continue;
    const same=matches.get(exact(item));
    const destination=same||(!words[key]&&!dead[key]?key:key+'~'+claim.id);
    keyMap[key]=destination;if(!same)matches.set(exact(item),destination);
  }
  for(const key of Object.keys(sourceDead))if(!Object.prototype.hasOwnProperty.call(keyMap,key))keyMap[key]=key+'~'+claim.id;
  // Freeze original addresses before applying any record. A retry after deletion
  // must not allocate another address and resurrect that imported meaning.
  claim.keyMap=keyMap;
  await localTransaction(await learningClaimsDb(),'claims','readwrite',tx=>tx.objectStore('claims').put(claim,source.id));
  assertLearningScope(target);
  const changed=[];
  for(const [key,item] of Object.entries(originals)){
    const destination=keyMap[key];if(!destination||words[destination]||dead[destination])continue;
    if(sourceDead[key]&&sourceDead[key]>=Math.max(item.up||0,item.addedAt||0))continue;
    words[destination]={...item,...(item.root?{root:keyMap[item.root]||item.root}:{})};changed.push(destination);
  }
  if(!saveWords(changed))throw new Error('가져온 단어를 이 기기에 저장하지 못했어요');
  const deleted=[];
  for(const [key,at] of Object.entries(sourceDead)){
    const destination=keyMap[key];
    if(!destination||words[destination]||dead[destination]>=at)continue;
    dead[destination]=at;deleted.push(destination);
  }
  if(!saveDead(deleted))throw new Error('가져온 삭제 기록을 이 기기에 저장하지 못했어요');
  const sourceConflicts=learningReadJson('breeze.word-conflicts',{},source);
  if(Object.keys(sourceConflicts).length){
    const conflicts=load('breeze.word-conflicts',{});
    for(const [id,entry] of Object.entries(sourceConflicts)){
      const importedId=JSON.stringify([claim.id,id]);
      if(!Object.prototype.hasOwnProperty.call(conflicts,importedId))conflicts[importedId]={...entry,key:keyMap[entry.key]||entry.key};
    }
    if(!save('breeze.word-conflicts',conflicts))throw new Error('가져온 뜻 충돌 기록을 이 기기에 저장하지 못했어요');
  }
  assertLearningScope(target);
  if(typeof importLearningStorage==='function')await importLearningStorage(source,target,claim.id,keyMap);
  assertLearningScope(target);
  const completed={...claim,complete:true};
  await localTransaction(await learningClaimsDb(),'claims','readwrite',tx=>tx.objectStore('claims').put(completed,source.id));
  assertLearningScope(target);
  const latest=learningClaims();latest[source.id]={source:claim.source,owner:claim.owner,id:claim.id,complete:true};
  localStorage.setItem(LEARNING_CLAIMS_KEY,JSON.stringify(latest));
  if(typeof queueSync==='function')queueSync();
  return true;
}
function swapLearningWords(){
  words=loadWordState();dead=loadDeadState();persistedWordItems.clear();
  persistedDeadItems.clear();Object.entries(dead).forEach(([key,value])=>persistedDeadItems.set(key,value));
  resetWordChangeTracking();
  rebuildWordIndex();
  Object.entries(words).forEach(([key,item])=>persistedWordItems.set(key,stableWordJson(item)));
  wordPaintRevision++;
}
async function switchLearningAccount(userId){
  const old=captureLearningScope(),next=userId?'user:'+userId:learningGuestId();
  if(userId&&old.id.startsWith('guest:')&&old.id!==next){
    const claims=learningClaims();
    if(!claims[old.id]){claims[old.id]={source:old.id,owner:next,complete:false};localStorage.setItem(LEARNING_CLAIMS_KEY,JSON.stringify(claims));}
    if(localStorage.getItem(LEARNING_GUEST_KEY)===old.id)localStorage.setItem(LEARNING_GUEST_KEY,'guest:'+learningUuid());
  }
  if(old.id!==next){
    if(typeof resetDictionaryLearningScope==='function')resetDictionaryLearningScope();
    learningScope={id:next,generation:old.generation+1};
    swapLearningWords();
    window.dispatchEvent(new CustomEvent('breeze-learning-scope',{detail:captureLearningScope()}));
  }
  const target=captureLearningScope();
  if(!userId)return;
  const sources=[];
  if(old.id.startsWith('guest:')&&old.id!==next){
    // Rotate before any asynchronous work. Logging out cannot expose the source
    // claimed for A as a new guest collection eligible for B.
    sources.push(old);
  }
  const durableClaims=await localTransaction(await learningClaimsDb(),'claims','readonly',(tx,done)=>{
    const request=tx.objectStore('claims').getAll();request.onsuccess=()=>done(request.result||[]);
  });assertLearningScope(target);
  for(const claim of [...Object.values(learningClaims()),...durableClaims])if(claim.owner===target.id&&!claim.complete&&!sources.some(s=>s.id===claim.source))sources.push({id:claim.source,generation:target.generation});
  const job=(async()=>{for(const source of sources){assertLearningScope(target);await importLearningSource(source,target);}})();
  learningImportJob=job;
  try{await job;assertLearningScope(target);}finally{if(learningImportJob===job)learningImportJob=null;}
}
async function hasLegacyLearningData(){
  if(Object.keys(learningSourceWords({id:'legacy'})).length)return true;
  if(Object.keys(learningReadJson('breeze.word-conflicts',{},{id:'legacy'})).length)return true;
  return typeof hasLegacyLearningStorage==='function'&&await hasLegacyLearningStorage();
}
async function resolveLegacyLearningImport(confirmed,token=captureLearningScope()){
  assertLearningScope(token);if(!token.id.startsWith('user:'))return false;
  // Declining leaves the originals accessible to recovery but never guest import.
  if(!confirmed){localStorage.setItem('breeze.learning.legacy-decision.v1','retained');return false;}
  const result=await importLearningSource({id:'legacy',generation:token.generation},token);
  assertLearningScope(token);localStorage.setItem('breeze.learning.legacy-decision.v1','claimed');return result;
}
async function confirmLegacyLearningImport(){
  const token=captureLearningScope();
  if(!token.id.startsWith('user:')||localStorage.getItem('breeze.learning.legacy-decision.v1'))return;
  if(!await hasLegacyLearningData()||!isLearningScopeCurrent(token))return;
  if(typeof breezeTaskDialog!=='function'||(typeof taskDialog!=='undefined'&&taskDialog.open))return;
  const answer=await breezeTaskDialog({title:'기존 학습 데이터 확인',description:'이전에 저장한 단어와 학습 기록의 계정을 확인할 수 없어요. 내 데이터가 맞으면 현재 로그인한 계정으로 가져옵니다. 원본은 이 기기에 그대로 보관합니다.',action:'내 데이터 가져오기'});
  if(isLearningScopeCurrent(token))await resolveLegacyLearningImport(answer!==null,token);
}
window.addEventListener('storage',event=>{
  if(event.key===LEARNING_GUEST_KEY&&learningScope.id.startsWith('guest:')&&event.newValue&&event.newValue!==learningScope.id){
    void switchLearningAccount(null).catch(()=>{});
  }
});
