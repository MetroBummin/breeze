import {canonical,fetchDocument,extractArticle,extractionReadiness} from './extract.mjs';
import {qualityKey,evaluateArticle,VERSION} from './jev.mjs';
import {safeDiagnostic} from './service.mjs';

// Called only after gateway JWT verification AND exact existing service-key
// authentication. Input selects a frozen cohort ID, never an arbitrary URL.
export async function evaluateCohortItem(item,{store,jobs,key,fetchDoc=fetchDocument,evaluate=evaluateArticle,now=Date.now,log=(_event)=>{}}) {
  if(!key)throw Error('not_configured');
  const token=await jobs.claim(item.id);if(!token)return {status:'not_claimed'};
  const fetchedAt=new Date(now()).toISOString();
  let result;
  try {
    const signal=AbortSignal.timeout(70000), source=await fetchDoc(canonical(item.url),signal);
    const article=extractArticle(source.html,source.url,item.title), readiness=extractionReadiness(article);
    if(readiness.status!=='ready')throw Error(readiness.reasons[0]);
    const contentKey=await qualityKey(source.url,article);
    const claim=await store.claimEvaluation(contentKey,source.url);
    log({stage:'cache',code:claim.verdict?'hit':claim.token?'miss':'busy',key:contentKey});
    let verdict=claim.verdict;
    if(claim.token) {
      try {verdict=await evaluate(article,key,{signal});await store.finishEvaluation(contentKey,claim.token,verdict);log({stage:verdict.stage,code:verdict.status,key:contentKey,usage:verdict.usage});}
      catch(error){const diagnostic=safeDiagnostic(error,'provider');log({...diagnostic,key:contentKey});await store.retryEvaluation(contentKey,claim.token,diagnostic);throw error;}
    }
    result=verdict ? {...verdict,contentKey,resolvedUrl:source.url,fetchedAt,cacheHit:!claim.token} :
      {status:'pending',reason:['budget_or_lease'],contentKey,fetchedAt};
  } catch(error){result={status:'error',diagnostic:safeDiagnostic(error),fetchedAt};}
  await jobs.finish(item.id,token,{...result,version:VERSION});
  return {id:item.id,status:result.status};
}

export function operatorAuthorized(request,serviceKey){
  return Boolean(serviceKey) && request.headers.get('Authorization')===`Bearer ${serviceKey}`;
}
