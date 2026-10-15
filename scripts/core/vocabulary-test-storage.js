/* One immutable manifest, small transactional cursor and one row per response.
   Typing never clones or serializes the full 2k–12k-word inventory. */
// The disabled prototype remains local-only. Its old unscoped database is an
// untouched archive; opting in cannot silently adopt a previous user's session.
const vocabularyTestDatabases=new Map(),vocabularyTestOwners=new WeakMap();
const captureVocabularyTestScope=()=>typeof captureLearningScope==='function'?captureLearningScope():null;
function vocabularyTestDb(scope=captureVocabularyTestScope()){
  const name=scope?learningStorageKey('breeze-vocabulary-test',scope):'breeze-vocabulary-test';
  if(!vocabularyTestDatabases.has(name))vocabularyTestDatabases.set(name,openDb(name,1,db=>{
    db.createObjectStore('session');db.createObjectStore('answers',{keyPath:'index'});db.createObjectStore('batches',{keyPath:'start'});
  }));
  return vocabularyTestDatabases.get(name)();
}
function vocabularyTestOwner(value){
  if(typeof captureLearningScope!=='function')return null;
  const scope=value?vocabularyTestOwners.get(value):captureLearningScope();
  if(!scope)throw new Error('Vocabulary test changed account. Reopen to continue.');
  assertLearningScope(scope);return scope;
}
function bindVocabularyTestOwner(value,scope){
  if(value&&scope)vocabularyTestOwners.set(value,scope);
  return value;
}
function guardVocabularyTestTransaction(tx,scope){
  if(!scope)return;
  assertLearningScope(scope);
  const cancel=()=>{try{tx.abort();}catch{}};
  const release=()=>window.removeEventListener?.('breeze-learning-scope',cancel);
  window.addEventListener?.('breeze-learning-scope',cancel);
  tx.addEventListener('complete',release,{once:true});tx.addEventListener('abort',release,{once:true});
}
async function readVocabularyTest(){
  const scope=captureVocabularyTestScope(),db=await vocabularyTestDb(scope);
  if(scope)assertLearningScope(scope);
  const raw=await localTransaction(db,['session','answers','batches'],'readonly',(tx,done)=>{
    const result={manifest:undefined,meta:undefined,answers:[],batches:[]};let remaining=4;
    const read=(request,key)=>{request.onsuccess=()=>{result[key]=request.result;if(!--remaining)done(result);};};
    read(tx.objectStore('session').get('manifest'),'manifest');read(tx.objectStore('session').get('meta'),'meta');read(tx.objectStore('answers').getAll(),'answers');read(tx.objectStore('batches').getAll(),'batches');
  });
  if(scope)assertLearningScope(scope);
  const session=BreezeVocabularyTest.restore(raw.manifest,raw.meta,raw.answers,raw.batches);
  if(session)bindVocabularyTestOwner(session.meta,scope);
  return bindVocabularyTestOwner(session,scope);
}
async function replaceVocabularyTest(manifest,expected){
  const scope=vocabularyTestOwner(expected);
  BreezeVocabularyTest.validateManifest(manifest);
  const meta={version:1,id:manifest.id,revision:0,index:0,phase:'answering'};
  await vocabularyTestTransaction(expected,(tx)=>{
    tx.objectStore('session').put(manifest,'manifest');tx.objectStore('session').put(meta,'meta');tx.objectStore('answers').clear();tx.objectStore('batches').clear();

  },scope);
  bindVocabularyTestOwner(meta,scope);
  return bindVocabularyTestOwner({manifest,meta,answers:new Map(),batches:new Map()},scope);
}
async function vocabularyTestTransaction(expected,write,scope=vocabularyTestOwner(expected)){
  if(scope)assertLearningScope(scope);
  const db=await vocabularyTestDb(scope);let failure;
  await localTransaction(db,['session','answers','batches'],'readwrite',tx=>{
    guardVocabularyTestTransaction(tx,scope);
    const request=tx.objectStore('session').get('meta');
    request.onsuccess=()=>{
      try{
        if(scope)assertLearningScope(scope);
        const actual=request.result;
        if(expected===null?actual!==undefined:!actual||actual.id!==expected.id||actual.revision!==expected.revision)
          throw new Error('Vocabulary test changed in another window. Reopen to continue.');
        write(tx);
      }catch(error){failure=error;tx.abort();}
    };
  }).catch(error=>{throw failure||error;});
  if(scope)assertLearningScope(scope);
}
async function writeVocabularyTestAnswer(session,answer,advance=false){
  const scope=vocabularyTestOwner(session);
  const total=session.manifest.cards.length,old=session.meta;
  BreezeVocabularyTest.validateAnswer(answer,total);
  if(old.phase==='answering'?(answer.index!==old.index||answer.submitted!==advance||answer.verdict!==null):(!answer.submitted||advance))
    throw new Error('Invalid vocabulary test response');
  const index=old.index+(advance?1:0),meta={...old,revision:old.revision+1,index,phase:index===total?'results':'answering'};
  BreezeVocabularyTest.validateMeta(meta,total);
  await vocabularyTestTransaction(old,tx=>{tx.objectStore('answers').put(answer);tx.objectStore('session').put(meta,'meta');
    if(advance&&(index%10===0||index===total))tx.objectStore('batches').put(vocabularyTestBatch(session,index));
  },scope);
  return bindVocabularyTestOwner(meta,scope);
}

function vocabularyTestBatch(session,end){
  const start=Math.floor((end-1)/10)*10;
  return {sessionId:session.manifest.id,start,end,token:session.manifest.id+':batch-'+start,status:'waiting',results:null};
}
async function writeVocabularyTestBatch(session,batch,expectedStatus){
  const scope=vocabularyTestOwner(session),db=await vocabularyTestDb(scope);let failure;
  await localTransaction(db,['session','batches'],'readwrite',tx=>{
    guardVocabularyTestTransaction(tx,scope);
    const store=tx.objectStore('batches'),meta=tx.objectStore('session').get('meta');
    meta.onsuccess=()=>{
      if(scope&&!isLearningScopeCurrent(scope)){failure=new Error('Vocabulary test changed account');tx.abort();return;}
      if(meta.result?.id!==session.manifest.id){failure=new Error('Vocabulary test changed');tx.abort();return;}
      const previous=store.get(batch.start);previous.onsuccess=()=>{
        if(scope&&!isLearningScopeCurrent(scope)){failure=new Error('Vocabulary test changed account');tx.abort();return;}
        if(previous.result?.token!==batch.token||previous.result?.status!==expectedStatus){failure=new Error('Vocabulary test batch changed');tx.abort();return;}
        store.put(batch);

      };
    };
  }).catch(error=>{throw failure||error;});
  if(scope)assertLearningScope(scope);
}
