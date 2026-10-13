/* Only the reviewed server route can call OpenRouter. There is deliberately no
   live registration until deployment, receipt migration and paid QA approval. */
const VOCABULARY_TEST_REMOTE_ENABLED=false;
/** @param {(payload:object,signal?:AbortSignal)=>Promise<any>} request */
function createVocabularyTestGrader(request){
  return {async grade(batch,options={}){
    if(!batch||typeof batch.batchId!=='string'||!Array.isArray(batch.items)||!batch.items.length||batch.items.length>10)throw Error('Invalid grading batch');
    const ids=batch.items.map(item=>item.id);
    if(new Set(ids).size!==ids.length)throw Error('Duplicate grading item');
    // IDs and session/book/account metadata are only local correlation data.
    const payload={op:'vocabulary_test_grade',batchId:batch.batchId,items:batch.items.map(item=>({
      word:item.word,meanings:item.meanings,answer:item.answer,example:item.example
    }))};
    const signal=/** @type {{signal?:AbortSignal}} */(options).signal;
    const response=await request(payload,signal);
    if(signal?.aborted)throw Error('Grading cancelled');
    if(!response||response.error||!Array.isArray(response.results)||response.results.length!==ids.length)throw Error(response?.error||'Invalid grading result');
    if(typeof response.model!=='string'||!/^typesafe\/jev-1\.13(?:-\d{8})?$/.test(response.model))throw Error('Unexpected grading model');
    const byId=new Map(response.results.map(row=>[row.id,row]));
    if(byId.size!==ids.length)throw Error('Duplicate grading result');
    return {model:response.model,results:ids.map((id,index)=>{
      const result=/** @type {any} */(byId.get('q'+index));
      if(!result||!['correct','incorrect','uncertain'].includes(result.status))throw Error('Invalid grading result');
      // Only fixed app copy, never arbitrary provider HTML or generated prose.
      const reason=result.status==='correct'?'AI가 같은 뜻으로 판단했어요.':result.status==='incorrect'?'AI가 다른 뜻으로 판단했어요.':'직접 확인이 필요한 답이에요.';
      return {id,status:result.status,reason};
    })};
  }};
}
if(VOCABULARY_TEST_REMOTE_ENABLED){
  window['BreezeVocabularyTestGrader']=createVocabularyTestGrader((payload,signal)=>dictCall(payload,signal));
}
