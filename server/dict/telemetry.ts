export type AiAction="look"|"retry"|"explain"|"seed";
export type HedgeTelemetry={settled:Promise<void>;hedged:boolean;winner:"openrouter"|"gemini"|null;loser:"aborted"|"failed"|"late"|null};
export type ProviderNote={rejectReason?:string;downgraded?:true};
export type AiTrace={requestId:string;action:AiAction;attempt:number;hedge?:HedgeTelemetry;providerNotes?:Partial<Record<Provider,ProviderNote>>};
type Provider="openrouter"|"gemini"|"claude";
type RpcClient={rpc:(name:string,args:Record<string,unknown>)=>any};
type Usage=Record<string,number|null>;
export function newAiTrace(action:AiAction):AiTrace{return{requestId:crypto.randomUUID(),action,attempt:0}}
function token(value:unknown):number|null{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<1e12?value:null}
export function tokenUsage(provider:Provider,raw:any):Usage|null{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  if(provider==="gemini"){
    const input=token(raw.promptTokenCount),output=token(raw.candidatesTokenCount),thinking=token(raw.thoughtsTokenCount??0),reportedTotal=token(raw.totalTokenCount);
    if(input===null&&output===null&&reportedTotal===null)return null;
    return{input_tokens:input,output_tokens:output,thinking_tokens:thinking,total_tokens:reportedTotal??(input!==null&&output!==null&&thinking!==null?input+output+thinking:null),cached_input_tokens:token(raw.cachedContentTokenCount??0),cache_creation_input_tokens:0,tool_input_tokens:token(raw.toolUsePromptTokenCount??0)};
  }
  if(provider==="openrouter"){
    const input=token(raw.prompt_tokens??raw.promptTokens??raw.input_tokens),output=token(raw.completion_tokens??raw.completionTokens??raw.output_tokens),total=token(raw.total_tokens??raw.totalTokens),thinking=token(raw?.completion_tokens_details?.reasoning_tokens??raw?.completionTokensDetails?.reasoningTokens??0),cached=token(raw?.prompt_tokens_details?.cached_tokens??raw?.promptTokensDetails?.cachedTokens??0);
    if(input===null&&output===null&&total===null)return null;
    return{input_tokens:input,output_tokens:output,thinking_tokens:thinking,total_tokens:total??(input!==null&&output!==null?input+output:null),cached_input_tokens:cached,cache_creation_input_tokens:0,tool_input_tokens:0};
  }
  const input=token(raw.input_tokens),output=token(raw.output_tokens);if(input===null&&output===null)return null;const cached=token(raw.cache_read_input_tokens??0),created=token(raw.cache_creation_input_tokens??0);return{input_tokens:input,output_tokens:output,thinking_tokens:null,total_tokens:input!==null&&output!==null&&cached!==null&&created!==null?input+output+cached+created:null,cached_input_tokens:cached,cache_creation_input_tokens:created,tool_input_tokens:0};
}
async function hedgedUsage(trace:AiTrace,usage:Usage|null,provider:Provider):Promise<Record<string,unknown>|null>{
  const hedge=trace.hedge,note=trace.providerNotes?.[provider];
  if(!hedge&&!note?.rejectReason&&!note?.downgraded)return usage;
  if(hedge)await hedge.settled;
  const extra:Record<string,unknown>={};
  if(hedge){extra.hedged=hedge.hedged;extra.winner=hedge.winner;extra.loser=hedge.loser;}
  if(note?.rejectReason)extra.reject_reason=note.rejectReason;
  if(note?.downgraded)extra.downgraded=true;
  return {...(usage??{}),...extra};
}
async function persist(client:RpcClient,args:Record<string,unknown>):Promise<void>{for(let i=0;i<2;i++){try{const{data,error}=await client.rpc("record_dict_ai_usage",args).abortSignal(AbortSignal.timeout(3000));if(!error&&data!==null&&data!==undefined)return;if(i===1)console.error("ai_metric_write_failed",JSON.stringify({request_id:args.p_request_id,attempt:args.p_attempt,code:error?.code??"missing_insert_id",message:String(error?.message??"").slice(0,160)}))}catch{if(i===1)console.error("ai_metric_write_failed",JSON.stringify({request_id:args.p_request_id,attempt:args.p_attempt,code:"transport_error"}))}}}
export function background(task:Promise<void>):void{const safe=task.catch(()=>{});const runtime=(globalThis as any).EdgeRuntime;if(typeof runtime?.waitUntil==="function")runtime.waitUntil(safe)}
export async function meteredFetch(client:RpcClient,trace:AiTrace,provider:Provider,model:string,input:string,init:RequestInit):Promise<Response>{const attempt=++trace.attempt,start=Date.now();let response:Response;try{response=await fetch(input,init)}catch(error){const timedOut=init.signal?.aborted===true||(error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"));background((async()=>{await persist(client,{p_request_id:trace.requestId,p_attempt:attempt,p_action:trace.action,p_provider:provider,p_model:model,p_http_status:null,p_duration_ms:Math.min(3600000,Math.max(0,Date.now()-start)),p_outcome:timedOut?"timeout":"network_error",p_usage:await hedgedUsage(trace,null,provider)})})());throw error}background((async()=>{let body:any=null;let aborted=false;try{body=await response.clone().json()}catch(error){aborted=init.signal?.aborted===true||(error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"));}await persist(client,{p_request_id:trace.requestId,p_attempt:attempt,p_action:trace.action,p_provider:provider,p_model:model,p_http_status:response.status,p_duration_ms:Math.min(3600000,Math.max(0,Date.now()-start)),p_outcome:aborted?"timeout":response.ok?"api_ok":"api_error",p_usage:await hedgedUsage(trace,tokenUsage(provider,provider==="gemini"?body?.usageMetadata:body?.usage),provider)})})());return response}
export type LookupType="word"|"sentence";
export type LookupOutcome="ok"|"replay"|"failed"|"timeout"|"quota_exceeded"|"anon_exhausted"|"login_required"|"request_conflict"|"quota_unavailable";
export type LookupRecord={requestId:string;userId:string|null;type:LookupType;action:"look"|"retry"|"explain";outcome:LookupOutcome;provider:unknown;durationMs:number};
const LOOKUP_OUTCOMES=new Set(["ok","replay","failed","timeout","quota_exceeded","anon_exhausted","login_required","request_conflict","quota_unavailable"]);
export function lookupOutcome(status:unknown):LookupOutcome{return typeof status==="string"&&LOOKUP_OUTCOMES.has(status)?status as LookupOutcome:"failed"}
// One dict_events row per answered word or sentence lookup (telemetry_version 3).
// It never blocks the response. A failed write logs the database error code so
// a silent stop is visible in the function logs.
export function recordLookup(client:RpcClient,record:LookupRecord):void{
  const provider=record.provider==="openrouter"||record.provider==="gemini"?record.provider:null;
  const args={p_request_id:record.requestId,p_user:record.userId,p_lookup_type:record.type,p_action:record.action,p_outcome:record.outcome,p_provider:provider,p_duration_ms:Math.min(3600000,Math.max(0,Math.round(record.durationMs)))};
  background((async()=>{for(let i=0;i<2;i++){try{const{error}=await client.rpc("record_dict_lookup",args).abortSignal(AbortSignal.timeout(3000));if(!error)return;if(i===1)console.error("lookup_metric_write_failed",JSON.stringify({request_id:args.p_request_id,code:error?.code??"unknown",message:String(error?.message??"").slice(0,160)}))}catch(error){if(i===1)console.error("lookup_metric_write_failed",JSON.stringify({request_id:args.p_request_id,code:"transport_error",message:String((error as Error)?.message??"").slice(0,160)}))}}})());
}
