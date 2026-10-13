/* One immutable manifest, small transactional cursor and one row per response.
   Typing never clones or serializes the full 2k–12k-word inventory. */
const vocabularyTestDb=openDb('breeze-vocabulary-test',1,db=>{
  db.createObjectStore('session');db.createObjectStore('answers',{keyPath:'index'});db.createObjectStore('batches',{keyPath:'start'});
});
async function readVocabularyTest(){
  const db=await vocabularyTestDb();
  const raw=await localTransaction(db,['session','answers','batches'],'readonly',(tx,done)=>{
    const result={manifest:undefined,meta:undefined,answers:[],batches:[]};let remaining=4;
    const read=(request,key)=>{request.onsuccess=()=>{result[key]=request.result;if(!--remaining)done(result);};};
    read(tx.objectStore('session').get('manifest'),'manifest');read(tx.objectStore('session').get('meta'),'meta');read(tx.objectStore('answers').getAll(),'answers');read(tx.objectStore('batches').getAll(),'batches');
  });
  return BreezeVocabularyTest.restore(raw.manifest,raw.meta,raw.answers,raw.batches);
}
async function replaceVocabularyTest(manifest,expected){
  BreezeVocabularyTest.validateManifest(manifest);
  const meta={version:1,id:manifest.id,revision:0,index:0,phase:'answering'};
  await vocabularyTestTransaction(expected,(tx)=>{
    tx.objectStore('session').put(manifest,'manifest');tx.objectStore('session').put(meta,'meta');tx.objectStore('answers').clear();tx.objectStore('batches').clear();

  });
  return {manifest,meta,answers:new Map(),batches:new Map()};
}
async function vocabularyTestTransaction(expected,write){
  const db=await vocabularyTestDb();let failure;
  await localTransaction(db,['session','answers','batches'],'readwrite',tx=>{
    const request=tx.objectStore('session').get('meta');
    request.onsuccess=()=>{
      try{
        const actual=request.result;
        if(expected===null?actual!==undefined:!actual||actual.id!==expected.id||actual.revision!==expected.revision)
          throw new Error('Vocabulary test changed in another window. Reopen to continue.');
        write(tx);
      }catch(error){failure=error;tx.abort();}
    };
  }).catch(error=>{throw failure||error;});
}
async function writeVocabularyTestAnswer(session,answer,advance=false){
  const total=session.manifest.cards.length,old=session.meta;
  BreezeVocabularyTest.validateAnswer(answer,total);
  if(old.phase==='answering'?(answer.index!==old.index||answer.submitted!==advance||answer.verdict!==null):(!answer.submitted||advance))
    throw new Error('Invalid vocabulary test response');
  const index=old.index+(advance?1:0),meta={...old,revision:old.revision+1,index,phase:index===total?'results':'answering'};
  BreezeVocabularyTest.validateMeta(meta,total);
  await vocabularyTestTransaction(old,tx=>{tx.objectStore('answers').put(answer);tx.objectStore('session').put(meta,'meta');
    if(advance&&(index%10===0||index===total))tx.objectStore('batches').put(vocabularyTestBatch(session,index));
  });
  return meta;
}

function vocabularyTestBatch(session,end){
  const start=Math.floor((end-1)/10)*10;
  return {sessionId:session.manifest.id,start,end,token:session.manifest.id+':batch-'+start,status:'waiting',results:null};
}
async function writeVocabularyTestBatch(session,batch,expectedStatus){
  const db=await vocabularyTestDb();let failure;
  await localTransaction(db,['session','batches'],'readwrite',tx=>{
    const store=tx.objectStore('batches'),meta=tx.objectStore('session').get('meta');
    meta.onsuccess=()=>{
      if(meta.result?.id!==session.manifest.id){failure=new Error('Vocabulary test changed');tx.abort();return;}
      const previous=store.get(batch.start);previous.onsuccess=()=>{
        if(previous.result?.token!==batch.token||previous.result?.status!==expectedStatus){failure=new Error('Vocabulary test batch changed');tx.abort();return;}
        store.put(batch);

      };
    };
  }).catch(error=>{throw failure||error;});
}
