import {PRICE,LIMITS,LEDGER_ID,RESERVATION_NANO_USD,requestFor,usageRecord,costRecord,digest} from './audit-contract.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stages=new Set(['ready','source','extraction']);
const outcomes=new Set(['approved','rejected','uncertain','unavailable','schema_error','provider_error']);
const fields=new Set(['promotion','readability','mismatch','evidence','substance','context','interest','topic','sensitivity','timeliness']);
const details=new Set(['model','answers_shape','answer_count','choice_shape','probability_consistency','probability_sum','choice_not_top','confidence_mismatch','empty_response','response_limit','invalid_json','transport_failure','body_incomplete','contract_unknown','request_not_configured']);
const recordFields=new Set(['attemptId','packSha','id','arm','requestedModel','version','requestSha','cacheHit','status','stage','usage','cost','responseModel','transportAttempted','transportState','modelMatches','eligibility','reasonCodes','diagnostics','code','detail','field']);
const reasons=new Set(['promotion','readability','mismatch','uncertain','promotion_primary_purpose','body_unreadable','title_body_mismatch','hard_gate_uncertain','no_hard_exclusion','defect_evidence_missing']);
function safeRecord(attempt){
  return ['provider','quality','readability','schema'].includes(attempt.stage) && attempt.cacheHit===false && [true,false,null].includes(attempt.transportAttempted) && ['unknown','not_started','uncertain','complete'].includes(attempt.transportState) && (attempt.transportState==='unknown'?attempt.transportAttempted===null:attempt.transportState==='not_started'?attempt.transportAttempted===false:attempt.transportAttempted===true) && (attempt.responseModel===null || /^jev-\d+\.\d+\.\d+$/.test(attempt.responseModel)) &&
    (attempt.modelMatches===undefined || typeof attempt.modelMatches==='boolean') && (attempt.eligibility===undefined || ['approved','candidate','withheld'].includes(attempt.eligibility)) &&
    (attempt.reasonCodes===undefined || Array.isArray(attempt.reasonCodes)&&attempt.reasonCodes.length<=4&&attempt.reasonCodes.every(x=>reasons.has(x))) &&
    (attempt.code===undefined || ['invalid_evaluation','provider_unavailable','provider_transport_uncertain','provider_not_started'].includes(attempt.code)) && (attempt.detail===undefined || details.has(attempt.detail)||attempt.detail==='invalid_evaluation') && (attempt.field===undefined || attempt.field===null || fields.has(attempt.field)) &&
    (attempt.diagnostics===undefined || Array.isArray(attempt.diagnostics)&&attempt.diagnostics.length<=6&&attempt.diagnostics.every(x=>x&&Object.keys(x).every(k=>['stage','code','detail','field'].includes(k))&&x.stage==='schema'&&x.code==='optional_metadata_invalid'&&(details.has(x.detail)||x.detail==='missing_answer')&&['substance','context','interest','topic','sensitivity','timeliness'].includes(x.field)));
}
export function scheduleFor(pack){
  return pack.inputs.flatMap((input,index)=>input.stage==='ready'?(index%2?['new','old']:['old','new']).map(arm=>({input,arm})):[]);
}
export function initialAuditRow(pack,packSha){
  return {id:LEDGER_ID,status:'queued',token:null,result:{schema:'rss-audit-ledger-v2',packSha,runId:pack.runId,expiresAt:pack.executionReview.expiresAt,nextIndex:0,reservedNanoUsd:0,attempts:[]}};
}
export async function verifyAuditPack(pack,packSha,arms,now){
  if(await digest(pack)!==packSha || pack.schema!=='rss-paired-v1' || !same(pack.pricing,PRICE) || !same(pack.limits,LIMITS))throw Error('pack_invalid');
  const review=pack.executionReview;
  const created=Date.parse(pack.createdAt),expires=Date.parse(review?.expiresAt);
  if(!review || review.inputReview!=='reviewed-before-model' || review.referenceReview!=='proposed-reviewed-before-model' || !['existing-service-role-auth-probe-400-operation','manual-existing-jwt-probe-operation-body-status-unreported'].includes(review.callerProof) || review.billingTerms!=='verified-context-bound-no-retries' || !Number.isFinite(created) || created>now || !Number.isFinite(expires) || expires<=created || expires-created>3600000)throw Error('review_required');
  if(!pack.inputs.length || pack.inputs.length>12 || new Set(pack.inputs.map(x=>x.id)).size!==pack.inputs.length)throw Error('pack_invalid');
  for(const [name,arm] of Object.entries(arms))if(arm.implementation.MODEL!==PRICE.model || arm.implementation.VERSION!==pack.arms[name]?.version || arm.sourceSha!==pack.arms[name]?.sourceSha)throw Error('arm_invalid');
  if(!arms.old || !arms.new || Object.keys(arms).length!==2)throw Error('arm_invalid');
  for(const input of pack.inputs){
    if(!stages.has(input.stage))throw Error('pack_invalid');
    if(input.stage!=='ready')continue;
    const article=input.article,body=article?.paragraphs?.join('\n');
    if(typeof article?.title!=='string' || article.title.length>500 || !Array.isArray(article.paragraphs) || !article.paragraphs.length || article.paragraphs.length>200 || article.paragraphs.some(x=>typeof x!=='string'||!x.trim()) || typeof body!=='string' || body.length<500 || body.length>60000 || body.includes('\u0000') || (body.match(/\ufffd/g)||[]).length>body.length*.01 || !Array.isArray(article.links) || article.links.length>100 || await digest(article)!==input.articleSha)throw Error('input_invalid');
    for(const name of ['old','new'])if(await digest(requestFor(article,arms[name].implementation))!==input.requestHashes?.[name])throw Error('request_invalid');
  }
  return scheduleFor(pack);
}
function validLedger(row,pack,packSha,schedule){
  const data=row?.result;
  if(row?.id!==LEDGER_ID || !['queued','running','done'].includes(row.status) || !data || data.schema!=='rss-audit-ledger-v2' || data.packSha!==packSha || data.runId!==pack.runId || data.expiresAt!==pack.executionReview.expiresAt || !Array.isArray(data.attempts) || !Number.isSafeInteger(data.nextIndex) || data.nextIndex!==data.attempts.length || data.nextIndex>schedule.length || data.nextIndex>24 || data.reservedNanoUsd!==data.nextIndex*RESERVATION_NANO_USD || data.reservedNanoUsd>100000000)throw Error('ledger_invalid');
  if(Object.keys(data).some(x=>!['schema','packSha','runId','expiresAt','nextIndex','reservedNanoUsd','attempts','stopReason'].includes(x)) || row.token!==null&&!/^[a-f0-9-]{36}$/i.test(row.token) || row.status==='running'&&(row.token===null||data.attempts.at(-1)?.status!=='pending') || row.status==='queued'&&data.attempts.some(x=>x.status==='pending'))throw Error('ledger_invalid');
  for(const [index,attempt] of data.attempts.entries()){
    const expected=schedule[index];
    if(Object.keys(attempt).some(x=>!recordFields.has(x)) || !safeRecord(attempt) || attempt.id!==expected.input.id || attempt.arm!==expected.arm || attempt.attemptId!==`${pack.runId}:${expected.input.id}:${expected.arm}` || attempt.packSha!==packSha || attempt.requestSha!==expected.input.requestHashes[expected.arm] || attempt.version!==pack.arms[expected.arm].version || attempt.requestedModel!==PRICE.model || ![...outcomes,'pending'].includes(attempt.status) || !attempt.usage || !same(Object.keys(attempt.usage),['inputTokens','outputTokens','cachedTokens']) || Object.values(attempt.usage).some(x=>x!==null&&(!Number.isSafeInteger(x)||x<0)) || !same(attempt.cost,costRecord(attempt.usage,{responseModel:attempt.responseModel,attempted:attempt.transportAttempted!==false,reserved:true})))throw Error('ledger_invalid');
  }
  return data;
}
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function summary(row,data){return {runId:data.runId,state:row.status,reservations:data.nextIndex,confirmedClientAttempts:data.attempts.filter(x=>x.transportAttempted===true).length,knownNoCallReservations:data.attempts.filter(x=>x.transportAttempted===false).length,ambiguousReservations:data.attempts.filter(x=>x.status==='pending'&&x.transportAttempted!==false).length,completedTransports:data.attempts.filter(x=>x.transportState==='complete').length,pendingReservations:data.attempts.filter(x=>x.status==='pending').length,reservedUsd:data.reservedNanoUsd/1e9,attempts:data.attempts};}
function verdictRecord(raw,input,implementation){
  try{
    const verdict=implementation.validateAnswers(raw,input.article);
    return {status:verdict.status,stage:verdict.stage,eligibility:verdict.eligibility,reasonCodes:verdict.reasonCodes || verdict.reason,diagnostics:verdict.diagnostics || []};
  }catch(error){
    return {status:'schema_error',stage:'schema',code:'invalid_evaluation',detail:details.has(error.diagnostic?.detail)?error.diagnostic.detail:'invalid_evaluation',field:fields.has(error.diagnostic?.field)?error.diagnostic.field:null};
  }
}
export function createAuditHandler({pack,packSha,arms,store,authorized,execute,now=Date.now,elapsed=()=>performance.now(),log=()=>{}}){
  let verified;
  return async request=>{
    const started=elapsed();
    // Actual gateway verification is configured independently at deployment.
    if(!await authorized(request))return reply({error:'operator_required'},403);
    let operation;
    if(request.method==='GET')operation='status';
    else if(request.method==='POST'){
      let body;try{const text=await boundedText(request.body,1024);body=JSON.parse(text);}catch{return reply({error:'request'},400);}
      if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==1 || !['next','run','status','auth_probe'].includes(body.operation))return reply({error:'operation'},400);
      operation=body.operation;
    }else return reply({error:'method'},405);
    if(operation==='auth_probe')return reply({authorized:true,providerAttempts:0});
    async function one(){
      let schedule,row,data;
      try{
        verified ||= verifyAuditPack(pack,packSha,arms,now());schedule=await verified;
        row=await store.read();data=validLedger(row,pack,packSha,schedule);
      }catch{return reply({error:'audit_not_ready'},503);}
      if(operation==='status')return reply(summary(row,data));
      if(Date.parse(data.expiresAt)<=now())return reply({error:'audit_expired'},410);
      if(row.status==='running')return reply({error:'audit_pending',reservations:data.nextIndex},409);
      if(row.status==='done' || data.nextIndex>=schedule.length || data.nextIndex>=24 || data.reservedNanoUsd+RESERVATION_NANO_USD>100000000)return reply({error:'audit_closed',reservations:data.nextIndex},409);
      const {input,arm}=schedule[data.nextIndex];
      const attempt={attemptId:`${pack.runId}:${input.id}:${arm}`,packSha,id:input.id,arm,requestedModel:PRICE.model,version:pack.arms[arm].version,requestSha:input.requestHashes[arm],cacheHit:false,status:'pending',stage:'provider',usage:usageRecord(null),cost:costRecord(usageRecord(null)),responseModel:null,transportAttempted:null,transportState:'unknown'};
      const reserved={...data,nextIndex:data.nextIndex+1,reservedNanoUsd:data.reservedNanoUsd+RESERVATION_NANO_USD,attempts:[...data.attempts,attempt]};
      let token;
      try{token=await store.claim(row,reserved);}catch{return reply({error:'ledger_unavailable'},503);}
      if(!token)return reply({error:'audit_busy'},409);
      if(Date.parse(data.expiresAt)<=now()){
        Object.assign(attempt,{status:'provider_error',transportAttempted:false,transportState:'not_started',code:'provider_not_started'});
        attempt.cost=costRecord(attempt.usage,{attempted:false,reserved:true});reserved.stopReason='audit_expired';
        try{await store.finish(token,reserved,true);}catch{}
        return reply({error:'audit_expired',reservations:reserved.nextIndex},410);
      }
      let response;
      try{response=await execute(requestFor(input.article,arms[arm].implementation));}catch{response=null;}
      // Only the transport adapter can establish whether fetch was entered.
      // An unrecognized adapter result/exception is unknown, never a proven call.
      if(response?.transportState==='not_started' && response.transportAttempted===false){
        Object.assign(attempt,{transportAttempted:false,transportState:'not_started',status:'provider_error',code:'provider_not_started'});
        attempt.cost=costRecord(attempt.usage,{attempted:false,reserved:true});reserved.stopReason='provider_not_started';
        try{await store.finish(token,reserved,true);}catch{return reply({error:'ledger_pending',reservations:reserved.nextIndex},503);}
        return reply({error:'provider_not_started',reservations:reserved.nextIndex,closed:true,attempt},503);
      }
      if(response?.transportAttempted===true && ['complete','uncertain'].includes(response.transportState)){
        attempt.transportAttempted=true;attempt.transportState=response.transportState;
      }
      if(attempt.transportState!=='complete'){
        Object.assign(attempt,{code:'provider_transport_uncertain',detail:attempt.transportAttempted===true?(response.invalidDetail==='response_limit'?'response_limit':response.detail==='body_incomplete'?'body_incomplete':'transport_failure'):'contract_unknown'});
        reserved.stopReason='transport_uncertain';
        // A timeout/abort (including during body read) does not cancel remote
        // processing. Preserve pending/running even if the fixed detail saves.
        try{await store.hold(token,reserved);}catch{}
        return reply({error:'audit_transport_pending',reservations:reserved.nextIndex,attempt},503);
      }
      const raw=response?.data;
      attempt.responseModel=/^jev-\d+\.\d+\.\d+$/.test(raw?.model || '')?raw.model:null;
      attempt.modelMatches=raw?.model===PRICE.model;
      attempt.usage=usageRecord(raw?.usage ?? response?.usage);
      attempt.cost=costRecord(attempt.usage,{responseModel:attempt.responseModel,attempted:attempt.transportAttempted!==false,reserved:true});
      const result=response?.ok===true?(response.invalidJson?{status:'schema_error',stage:'schema',code:'invalid_evaluation',detail:details.has(response.invalidDetail)?response.invalidDetail:'invalid_json',field:null}:verdictRecord(raw,input,arms[arm].implementation)):{status:'provider_error',stage:'provider',code:'provider_unavailable'};
      Object.assign(attempt,result);
      const violation=attempt.usage.inputTokens>65536 || (raw?.model && raw.model!==PRICE.model);
      const closed=violation || reserved.nextIndex===schedule.length || Date.parse(data.expiresAt)<=now();
      if(violation)reserved.stopReason='billing_contract_violation';
      try{await store.finish(token,reserved,closed);}catch{return reply({error:'ledger_pending',reservations:reserved.nextIndex},503);}
      log({stage:attempt.stage,code:attempt.status,detail:attempt.detail || null,field:attempt.field || null,key:attempt.requestSha,usage:{inputTokens:attempt.usage.inputTokens,outputTokens:attempt.usage.outputTokens}});
      return reply({runId:pack.runId,reservations:reserved.nextIndex,closed,attempt});
    }
    if(operation!=='run')return one();
    // Foreground only: each iteration independently reserves/completes one slot.
    // Leave 20s for bounded DB (3s each), provider (10s), and response overhead.
    // A later manual run continues only untouched slots; pending never retries.
    let completedThisRequest=0,last=null;
    while(elapsed()-started<65000){
      const response=await one(),body=await response.json();
      if(response.status!==200)return reply({...body,operation:'run',completedThisRequest},response.status);
      completedThisRequest++;last=body;
      if(body.closed)return reply({...body,operation:'run',completedThisRequest});
    }
    return reply({...(last || {runId:pack.runId}),operation:'run',completedThisRequest,pausedReason:'request_window',requestWindowMs:85000});
  };
}
export async function boundedText(stream,limit){
  if(!stream)throw Error('empty_response');const reader=stream.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('response_limit');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(all);
}
export function providerExecutor(key,{fetchImpl=fetch}={}){
  return async payload=>{
    if(!key || payload?.model!==PRICE.model || typeof fetchImpl!=='function')return {transportAttempted:false,transportState:'not_started'};
    let init;
    try{init={method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(payload)};}
    catch{return {transportAttempted:false,transportState:'not_started'};}
    let response;
    try{response=await fetchImpl('https://api.typesafe.ai/v1/systemone',init);}
    catch{return {transportAttempted:true,transportState:'uncertain',detail:'transport_failure'};}
    let text;
    try{text=response.body?await boundedText(response.body,100000):'';}
    catch(error){return {transportAttempted:true,transportState:'uncertain',detail:'body_incomplete',invalidDetail:error.message==='response_limit'?'response_limit':null};}
    const transport={transportAttempted:true,transportState:'complete',ok:response.ok};
    if(!text)return {...transport,invalidJson:true,invalidDetail:'empty_response'};
    let data;try{data=JSON.parse(text);}catch{return {...transport,invalidJson:true,invalidDetail:'invalid_json'};}
    return {...transport,data};
  };
}
