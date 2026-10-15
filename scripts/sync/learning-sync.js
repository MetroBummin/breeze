/* Account-owned learning metadata. Files, book bodies, covers and reading
   positions never enter this document. Old clients only read public.words. */
const LEARNING_ROW='learning-v1', LEARNING_CHANGED='breeze.learning.changed';
let learningSyncPromise=null,learningSyncAgain=false,learningSyncTimer=null,learningRemote=null;
let learningMutationVersion=0,learningFullNeeded=false;
const learningSetChanges=new Map();
function resetLearningSync(){
  clearTimeout(learningSyncTimer);learningSyncTimer=null;
  learningSyncPromise=null;learningSyncAgain=false;learningRemote=null;
  learningMutationVersion=0;learningFullNeeded=false;learningSetChanges.clear();
}
function queueLearningSync(event){
  const eventScope=event&&event.detail&&event.detail.scope;
  if(eventScope&&typeof captureLearningScope==='function'&&eventScope!==captureLearningScope().id)return;
  learningMutationVersion++;
  const ids=event&&event.detail&&event.detail.setIds;
  if(Array.isArray(ids)&&ids.length)ids.forEach(id=>learningSetChanges.set(id,learningMutationVersion));
  else learningFullNeeded=true;
  if(typeof markSyncDirty==='function')markSyncDirty(LEARNING_CHANGED);
  else save(LEARNING_CHANGED,Math.max(Date.now(),(Number(load(LEARNING_CHANGED,0))||0)+1));
  clearTimeout(learningSyncTimer);
  if(typeof sb==='undefined'||!sb||!sbUser)return;
  learningSyncTimer=setTimeout(()=>doLearningSync(false),4000);
}
async function patchAcknowledgedLearning(session,adapter,acknowledged){
  if(learningFullNeeded||!learningSetChanges.size||typeof adapter.exportAccountChanges!=='function')return false;
  const versions=new Map(learningSetChanges),version=learningMutationVersion,dirtyAt=Number(load(LEARNING_CHANGED,0))||0;
  const patch=await adapter.exportAccountChanges([...versions.keys()]);assertSyncSession(session);
  if(typeof sb.rpc!=='function')throw new Error('학습 변경 동기화 서버 준비가 필요해요. 변경은 이 기기에 보관했어요.');
  const revision=VaultCrypto.uuid(),result=await sb.rpc('breeze_patch_study_sets',{
    expected_user_id:session.userId,expected_revision:acknowledged.revision,next_revision:revision,changed_sets:patch.sets});
  assertSyncSession(session);if(result.error)throw result.error;
  if(result.data!==true)return false;
  versions.forEach((at,id)=>{if(learningSetChanges.get(id)===at)learningSetChanges.delete(id);});
  if(version===learningMutationVersion&&Number(load(LEARNING_CHANGED,0))===dirtyAt){
    if(!save(LEARNING_CHANGED,0))throw new Error('학습 동기화 상태를 저장하지 못했어요');
  }else learningSyncAgain=true;
  learningRemote={userId:session.userId,revision,version};
  noteSyncSuccess();return true;
}
async function compareAndSwapLearning(previous,data,session){
  assertSyncSession(session);
  let result;
  if(!previous){
    result=await sb.from('study_state').insert([{user_id:session.userId,key:LEARNING_ROW,data}]).select('key').maybeSingle();
    assertSyncSession(session);
    if(result.error&&String(result.error.code)==='23505')return false;
  }else{
    if(typeof previous.revision!=='string'||!previous.revision)throw new Error('알 수 없는 학습 동기화 형식이에요. 저장된 자료는 보존했어요.');
    result=await sb.from('study_state').update({data}).eq('user_id',session.userId).eq('key',LEARNING_ROW)
      .eq('data->>revision',previous.revision).select('key').maybeSingle();
    assertSyncSession(session);
  }
  if(result.error)throw result.error;
  return !!(result.data&&result.data.key===LEARNING_ROW);
}
function learningStorageAdapter(){return window['BreezeStudyStorage'];}
function doLearningSync(manual){
  const adapter=learningStorageAdapter();
  if(!adapter||!sb||!sbUser)return Promise.resolve(true);
  if(!syncAccountReady){const epoch=syncSessionEpoch;return syncAccountReadyPromise.then(ready=>ready&&epoch===syncSessionEpoch?doLearningSync(manual):false);}
  if(!manual&&Date.now()<syncCooldownUntil)return Promise.resolve(false);
  if(learningSyncPromise){
    if(manual||Number(load(LEARNING_CHANGED,0)))learningSyncAgain=true;
    return learningSyncPromise;
  }
  const epoch=syncSessionEpoch;
  learningSyncPromise=(async()=>{
    let nextManual=!!manual;
    do{
      learningSyncAgain=false;
      if(!await runLearningSyncPass(nextManual)||epoch!==syncSessionEpoch)return false;
      nextManual=false;
    }while(learningSyncAgain&&sb&&sbUser);
    return true;
  })().finally(()=>{if(epoch===syncSessionEpoch)learningSyncPromise=null;});
  return learningSyncPromise;
}
async function runLearningSyncPass(manual){
  const session=syncSession(),adapter=learningStorageAdapter();
  try{
    assertSyncSession(session);
    const acknowledged=learningRemote;
    if(acknowledged&&acknowledged.userId===session.userId
      &&await patchAcknowledgedLearning(session,adapter,acknowledged))return true;
    if(!manual&&acknowledged&&acknowledged.userId===session.userId&&!Number(load(LEARNING_CHANGED,0))
      &&acknowledged.version===learningMutationVersion){
      const header=await sb.from('study_state').select('revision:data->>revision').eq('user_id',session.userId).eq('key',LEARNING_ROW).maybeSingle();
      assertSyncSession(session);if(header.error)throw header.error;
      if(header.data&&header.data.revision===acknowledged.revision&&!Number(load(LEARNING_CHANGED,0))
        &&acknowledged.version===learningMutationVersion)return true;
    }
    for(let attempt=0;attempt<SYNC_CAS_ATTEMPTS;attempt++){
      const dirtyAt=Number(load(LEARNING_CHANGED,0))||0;
      const result=await sb.from('study_state').select('data').eq('user_id',session.userId).eq('key',LEARNING_ROW).maybeSingle();
      assertSyncSession(session);if(result.error)throw result.error;
      const previous=result.data&&result.data.data;
      if(previous){
        if(previous.version!==1||!previous.payload||typeof previous.revision!=='string')
          throw new Error('알 수 없는 학습 동기화 형식이에요. 저장된 자료는 보존했어요.');
        await adapter.mergeAccountState(previous.payload);assertSyncSession(session);
      }
      const localVersion=learningMutationVersion,versions=new Map(learningSetChanges);
      const payload=await adapter.exportAccountState();assertSyncSession(session);
      const syncedState=syncStableJson(payload);
      let revision=previous&&previous.revision;
      if(!previous||syncStableJson(previous.payload)!==syncedState){
        const data={version:1,revision:VaultCrypto.uuid(),updatedAt:Date.now(),payload};
        if(!await compareAndSwapLearning(previous,data,session))continue;
        revision=data.revision;
      }
      assertSyncSession(session);
      // An edit during the ACK still belongs to this scope, but not to this
      // acknowledged document. Retain its outbox marker and send another pass.
      const unchanged=localVersion===learningMutationVersion&&Number(load(LEARNING_CHANGED,0))===dirtyAt;
      if(unchanged){if(!save(LEARNING_CHANGED,0))throw new Error('학습 동기화 상태를 저장하지 못했어요');}
      else learningSyncAgain=true;
      versions.forEach((at,id)=>{if(learningSetChanges.get(id)===at)learningSetChanges.delete(id);});
      if(unchanged)learningFullNeeded=false;
      learningRemote={userId:session.userId,revision,version:localVersion};
      noteSyncSuccess();return true;
    }
    throw new Error('다른 기기의 학습 변경과 충돌했어요. 이 기기의 자료를 보관하고 다시 시도합니다.');
  }catch(error){
    if(error.syncCancelled||error.learningScopeCancelled)return false;
    noteSyncFailure(error);console.error(error);
    if(manual)syncStatus('학습 자료 동기화 실패: '+(error.message||error));
    return false;
  }
}
if(typeof window.addEventListener==='function'){
  window.addEventListener('breeze:study-changed',queueLearningSync);
  window.addEventListener('online',()=>{if(typeof sb!=='undefined'&&sb&&sbUser)syncRemoteChanges(false);});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&typeof sb!=='undefined'&&sb&&sbUser&&Number(load(LEARNING_CHANGED,0)))doLearningSync(false);
  });
}
