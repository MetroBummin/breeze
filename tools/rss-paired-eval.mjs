// Headless evaluation preparation/reporting only. No credential lookup, SDK,
// provider transport, production database access, or automatic live CLI exists.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {extractionReadiness} from '../server/rss-quality/extract.mjs';
export const BASELINE='0e72a35be0fa663167acd7de2c7dd9a8dfbdfc4c';
export const PRICE=Object.freeze({model:'jev-1.13.0',asOf:'2026-10-05',source:'https://docs.typesafe.ai/models',inputUsdPerMillion:0.042,outputUsdPerMillion:0,cachedDiscount:'not documented; no discount assumed'});
export const LIMITS=Object.freeze({articles:12,attempts:24,usd:0.10,concurrency:1,retries:0,reservedInputTokens:65536});
export const RESERVATION_USD=LIMITS.reservedInputTokens*PRICE.inputUsdPerMillion/1e6;
export const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url));
export async function loadArms(){
  const sources={old:execFileSync('git',['show',`${BASELINE}:server/rss-quality/jev.mjs`],{cwd:root,encoding:'utf8'}),new:await readFile(new URL('../server/rss-quality/jev.mjs',import.meta.url),'utf8')};
  return Object.fromEntries(await Promise.all(Object.entries(sources).map(async([name,source])=>[name,{sourceSha:sha(source),implementation:await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))}])));
}
export function requestFor(article,implementation){
  return {model:implementation.MODEL,state:{untrusted_article:{title:article.title,paragraphs:article.paragraphs.map((text,i)=>({id:`p${i+1}`,text})),links:article.links,extraction:article.checks}},questions:implementation.questions(article)};
}
export function sealPack({runId,createdAt,inputs,seeds,arms,capture=null}){
  if(inputs.length!==seeds.length || inputs.length>LIMITS.articles)throw Error('article_limit');
  if(new Set(inputs.map(x=>x.id)).size!==inputs.length)throw Error('duplicate_article');
  const versions=Object.fromEntries(Object.entries(arms).map(([name,a])=>[name,{sourceSha:a.sourceSha,version:a.implementation.VERSION,model:a.implementation.MODEL}]));
  const rows=inputs.map((input,i)=>{
    if(input.id!==seeds[i].id)throw Error('seed_order');
    if(!['ready','source','extraction'].includes(input.stage))throw Error('input_stage');
    const base={...input,reference:seeds[i].reference};
    if(input.stage!=='ready')return base;
    if(extractionReadiness(input.article).status!=='ready')throw Error('extraction_not_ready');
    const requests=Object.fromEntries(Object.entries(arms).map(([name,a])=>[name,requestFor(input.article,a.implementation)]));
    return {...base,articleSha:sha(input.article),requests,requestHashes:Object.fromEntries(Object.entries(requests).map(([name,r])=>[name,sha(r)]))};
  });
  const pack={schema:'rss-paired-v1',runId,createdAt,seedSha:sha(seeds),capture,arms:versions,pricing:PRICE,limits:LIMITS,inputs:rows};
  const manifest={schema:pack.schema,runId,createdAt,packSha:sha(pack),seedSha:pack.seedSha,capture,arms:versions,pricing:PRICE,limits:LIMITS,
    maximumReservationUsd:LIMITS.attempts*RESERVATION_USD,
    inputs:rows.map(({article,requests,...row})=>({...row,...(article?{readiness:extractionReadiness(article),modelStateSha:sha(requests.old.state)}:{})})),
    counts:{articles:rows.length,ready:rows.filter(x=>x.stage==='ready').length,sourceFailures:rows.filter(x=>x.stage==='source').length,extractionFailures:rows.filter(x=>x.stage==='extraction').length},
    labelStatus:'Only supplied historical promotion labels are user-reviewed; all other reference labels await human review. Fresh snapshots are not archived trial inputs.'};
  return {pack,manifest};
}
export function verifyPack(pack,expectedSha,arms){
  if(!expectedSha || sha(pack)!==expectedSha)throw Error('pack_hash_mismatch');
  if(pack.schema!=='rss-paired-v1' || JSON.stringify(pack.limits)!==JSON.stringify(LIMITS) || JSON.stringify(pack.pricing)!==JSON.stringify(PRICE))throw Error('contract_changed');
  if(pack.inputs.length>LIMITS.articles || new Set(pack.inputs.map(x=>x.id)).size!==pack.inputs.length)throw Error('article_limit');
  for(const [name,a] of Object.entries(arms)){
    if(pack.arms[name]?.sourceSha!==a.sourceSha || pack.arms[name].version!==a.implementation.VERSION || a.implementation.MODEL!==PRICE.model)throw Error('arm_changed');
  }
  for(const row of pack.inputs){
    if(row.stage!=='ready')continue;
    if(sha(row.article)!==row.articleSha || extractionReadiness(row.article).status!=='ready')throw Error('article_changed');
    for(const [name,a] of Object.entries(arms))if(sha(requestFor(row.article,a.implementation))!==row.requestHashes[name] || sha(row.requests[name])!==row.requestHashes[name])throw Error('request_changed');
    if(sha(row.requests.old.state)!==sha(row.requests.new.state))throw Error('unpaired_input');
  }
}
const tokens=n=>Number.isSafeInteger(n)&&n>=0?n:null;
export function usageRecord(raw){
  // Cached tokens are metadata only: no undocumented billing discount.
  const inputTokens=tokens(raw?.input_tokens),outputTokens=tokens(raw?.output_tokens);
  const cachedTokens=tokens(raw?.cached_input_tokens ?? raw?.cached_tokens ?? raw?.input_tokens_details?.cached_tokens);
  return {inputTokens,outputTokens,cachedTokens:inputTokens!==null&&cachedTokens!==null&&cachedTokens<=inputTokens?cachedTokens:null};
}
export function costRecord(usage,{responseModel=null,attempted=true}={}){
  const known=usage.inputTokens!==null && usage.outputTokens!==null && responseModel===PRICE.model;
  return {pricing:PRICE,tokenEstimateUsd:attempted&&known?usage.inputTokens*PRICE.inputUsdPerMillion/1e6:null,
    estimateBasis:attempted&&known?'provider-reported tokens at documented price':'unknown',invoiceChargeUsd:null,billableStatus:attempted?'not invoice-verified':'no attempt',
    reservationUsd:attempted?RESERVATION_USD:0,cachedDiscountApplied:false};
}
const validStatus=new Set(['approved','rejected','uncertain','unavailable']);
function classify(raw,row,arm){
  try{
    const result=arm.implementation.validateAnswers(raw,row.article);
    return {status:result.status,eligibility:result.eligibility,stage:result.stage,
      reasonCodes:result.reasonCodes || result.reason,diagnostics:result.diagnostics || []};
  }catch(error){
    return {status:'schema_error',stage:'schema',code:'invalid_evaluation',detail:error.diagnostic?.detail || 'invalid_evaluation',field:error.diagnostic?.field || null};
  }
}
// Adapter contract is for a reviewed EXISTING private credential-resident runner.
// It must enforce durable run-wide idempotence/attempt/spend gates; the local
// journal is written before each invocation. No adapter or credential is supplied
// by this PR. A declaration is not proof of a runner's actual security or billing.
export async function runPaired(pack,{expectedSha,arms,executor,journal=[],checkpoint}={}){
  verifyPack(pack,expectedSha,arms);
  const contract=executor?.contract;
  if(!contract?.credentialResident || !contract.durableRunBudget || !contract.idempotentAttemptIds || contract.retries!==0 || contract.maxPhysicalAttempts!==1 || contract.model!==PRICE.model || contract.maxBillableInputTokens>LIMITS.reservedInputTokens || !Number.isSafeInteger(contract.maxBillableInputTokens) || contract.maxBillableInputTokens<1 || contract.priceAsOf!==PRICE.asOf || typeof executor.execute!=='function' || typeof checkpoint!=='function')throw Error('verified_private_executor_required');
  const allowedIds=new Set(pack.inputs.filter(x=>x.stage==='ready').flatMap(x=>['old','new'].map(a=>`${pack.runId}:${x.id}:${a}`)));
  if(journal.some(x=>!allowedIds.has(x.attemptId) || x.packSha!==expectedSha) || new Set(journal.map(x=>x.attemptId)).size!==journal.length)throw Error('invalid_journal');
  for(const row of journal){
    const input=pack.inputs.find(x=>x.id===row.id),expected=`${pack.runId}:${row.id}:${row.arm}`;
    if(row.attemptId!==expected || !arms[row.arm] || row.requestSha!==input?.requestHashes[row.arm] || row.version!==pack.arms[row.arm].version || row.requestedModel!==PRICE.model || ![...validStatus,'schema_error','provider_error','pending'].includes(row.status) || !row.usage || Object.values(row.usage).some(x=>x!==null&&tokens(x)===null) || JSON.stringify(row.cost)!==JSON.stringify(costRecord(row.usage,{responseModel:row.responseModel})))throw Error('invalid_journal');
  }
  // A pending prior attempt retains its full reservation and is never resent.
  const rows=structuredClone(journal);
  let budget=rows.reduce((sum,x)=>sum+Math.max(RESERVATION_USD,x.cost?.tokenEstimateUsd || 0),0),stopReason=null;
  for(const [index,input] of pack.inputs.entries()){
    if(input.stage!=='ready')continue;
    // Alternate order before results to reduce a systematic first-arm effect.
    for(const name of index%2?['new','old']:['old','new']){
      const attemptId=`${pack.runId}:${input.id}:${name}`;
      if(rows.some(x=>x.attemptId===attemptId))continue;
      if(rows.length>=LIMITS.attempts || budget+RESERVATION_USD>LIMITS.usd){stopReason='budget_limit';break;}
      const attempt={attemptId,packSha:expectedSha,id:input.id,arm:name,requestedModel:PRICE.model,version:pack.arms[name].version,
        requestSha:input.requestHashes[name],cacheHit:false,status:'pending',stage:'provider',usage:usageRecord(null),cost:costRecord(usageRecord(null)),responseModel:null};
      rows.push(attempt);budget+=RESERVATION_USD;
      await checkpoint(structuredClone(rows)); // Must succeed before transport.
      let response;
      try{response=await executor.execute(structuredClone(input.requests[name]),{attemptId,runId:pack.runId,packSha:expectedSha,maxAttempts:LIMITS.attempts,maxUsd:LIMITS.usd,reservationUsd:RESERVATION_USD,retries:0});}
      catch{response={ok:false};} // No raw exception/message/header/body logging.
      const raw=response?.data;
      attempt.responseModel=/^jev-\d+\.\d+\.\d+$/.test(raw?.model || '')?raw.model:null;
      attempt.modelMatches=raw?.model===PRICE.model;
      attempt.usage=usageRecord(raw?.usage ?? response?.usage);
      attempt.cost=costRecord(attempt.usage,{responseModel:attempt.responseModel});
      Object.assign(attempt,response?.ok===true?classify(raw,input,arms[name]):{status:'provider_error',stage:'provider',code:'provider_unavailable'});
      const observed=attempt.cost.tokenEstimateUsd;
      budget+=Math.max(0,(observed || 0)-RESERVATION_USD);
      await checkpoint(structuredClone(rows));
      if(attempt.usage.inputTokens>LIMITS.reservedInputTokens || (raw?.model && raw.model!==PRICE.model))stopReason='billing_contract_violation';
      if(stopReason)break;
    }
    if(stopReason)break;
  }
  return reportPaired(pack,rows,{stopReason});
}
function costSummary(rows,successfulArticles){
  const known=rows.filter(x=>x.cost?.tokenEstimateUsd!==null && typeof x.cost?.tokenEstimateUsd==='number');
  const estimated=known.reduce((s,x)=>s+x.cost.tokenEstimateUsd,0),reserved=rows.length*RESERVATION_USD;
  const allKnown=known.length===rows.length;
  return {attempts:rows.length,usageKnownAttempts:known.length,usageUnknownAttempts:rows.length-known.length,
    knownTokenEstimateUsd:estimated,completeTokenEstimateUsd:allKnown?estimated:null,invoiceChargeUsd:null,reservationUsd:reserved,
    meanTokenEstimatePerAttemptUsd:rows.length&&allKnown?estimated/rows.length:null,
    meanTokenEstimatePerSuccessfulArticleUsd:successfulArticles&&allKnown?estimated/successfulArticles:null,
    successfulArticles,cachedTokensReportedAttempts:rows.filter(x=>x.usage?.cachedTokens!==null).length,
    cacheHits:rows.filter(x=>x.cacheHit===true).length,cachingEffect:'not tested; isolated run cache disabled',
    failedAttemptKnownTokenEstimateUsd:known.filter(x=>!validStatus.has(x.status)).reduce((s,x)=>s+x.cost.tokenEstimateUsd,0)};
}
export function reportPaired(pack,rows,{stopReason=null}={}){
  const pairs=pack.inputs.map(input=>{
    const results=Object.fromEntries(['old','new'].map(name=>[name,rows.find(x=>x.id===input.id&&x.arm===name) || null]));
    return {id:input.id,inputStage:input.stage,reference:input.reference,
      old:results.old?.status || null,new:results.new?.status || null,
      bothValid:Object.values(results).every(x=>x&&validStatus.has(x.status)),
      costs:costSummary(Object.values(results).filter(Boolean),Object.values(results).some(x=>x&&validStatus.has(x.status))?1:0),
      proposedRetention:Object.fromEntries(Object.entries(results).map(([name,r])=>[name,r?.status==='approved'?'approved':r?.eligibility==='candidate'?'candidate':r&&validStatus.has(r.status)?'withheld':'not_classified']))};
  });
  const byArm=Object.fromEntries(['old','new'].map(name=>{
    const armRows=rows.filter(x=>x.arm===name),valid=armRows.filter(x=>validStatus.has(x.status));
    const positives=pairs.filter(x=>x.reference.label==='retain'&&x.reference.reviewStatus==='human-confirmed'&&validStatus.has(x[name]));
    const negatives=pairs.filter(x=>x.reference.label==='exclude'&&x.reference.reviewStatus==='user-reviewed'&&validStatus.has(x[name]));
    return [name,{counts:Object.fromEntries(['approved','rejected','uncertain','unavailable','schema_error','provider_error','pending'].map(s=>[s,armRows.filter(x=>x.status===s).length])),validDecisions:valid.length,
      userReviewedPromo:{classified:negatives.length,falseAccepts:negatives.filter(x=>x[name]==='approved').length},
      humanConfirmedRetention:{classified:positives.length,falseExclusions:positives.filter(x=>['rejected','unavailable'].includes(x[name])).length},
      costs:costSummary(armRows,valid.length)}];
  }));
  return {runId:pack.runId,pricing:PRICE,limits:LIMITS,counts:{articles:pack.inputs.length,ready:pack.inputs.filter(x=>x.stage==='ready').length,
    sourceFailures:pack.inputs.filter(x=>x.stage==='source').length,extractionFailures:pack.inputs.filter(x=>x.stage==='extraction').length,
    attempted:rows.length,completeValidPairs:pairs.filter(x=>x.bothValid).length,uniqueArticlesWithValidDecision:new Set(rows.filter(x=>validStatus.has(x.status)).map(x=>x.id)).size},
    stopReason,byArm,costs:costSummary(rows,new Set(rows.filter(x=>validStatus.has(x.status)).map(x=>x.id)).size),pairs,attempts:rows,
    limitations:['Proposed labels are not human-confirmed accuracy ground truth.','No population accuracy estimate from this purposive small sample.','Errors and unavailable source/extraction inputs are separate from quality rejection.','Reservations and token estimates are not invoices. Missing usage retains a full reservation and no zero-cost claim.','Pricing/context-bound reservation requires verification by the private executor before live transport.']};
}
