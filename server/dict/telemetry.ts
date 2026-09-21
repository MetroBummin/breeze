export type AiAction="look"|"retry"|"explain"|"seed"|"judge"|"phrase"|"route"|"repair";
export type AiTrace={requestId:string;action:AiAction;attempt:number};
type Provider="openrouter"|"gemini"|"claude"|"jev";
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
  if(provider==="openrouter"||provider==="jev"){
    const input=token(raw.prompt_tokens??raw.promptTokens??raw.input_tokens),output=token(raw.completion_tokens??raw.completionTokens??raw.output_tokens),total=token(raw.total_tokens??raw.totalTokens),thinking=token(raw?.completion_tokens_details?.reasoning_tokens??raw?.completionTokensDetails?.reasoningTokens??0),cached=token(raw?.prompt_tokens_details?.cached_tokens??raw?.promptTokensDetails?.cachedTokens??0);
    if(input===null&&output===null&&total===null)return null;
    return{input_tokens:input,output_tokens:output,thinking_tokens:thinking,total_tokens:total??(input!==null&&output!==null?input+output:null),cached_input_tokens:cached,cache_creation_input_tokens:0,tool_input_tokens:0};
  }
  const input=token(raw.input_tokens),output=token(raw.output_tokens);if(input===null&&output===null)return null;const cached=token(raw.cache_read_input_tokens??0),created=token(raw.cache_creation_input_tokens??0);return{input_tokens:input,output_tokens:output,thinking_tokens:null,total_tokens:input!==null&&output!==null&&cached!==null&&created!==null?input+output+cached+created:null,cached_input_tokens:cached,cache_creation_input_tokens:created,tool_input_tokens:0};
}
async function persist(client:RpcClient,args:Record<string,unknown>):Promise<void>{for(let i=0;i<2;i++){try{const{data,error}=await client.rpc("record_dict_ai_usage",args).abortSignal(AbortSignal.timeout(3000));if(!error&&data!==null&&data!==undefined)return;if(i===1)console.error("ai_metric_write_failed",JSON.stringify({request_id:args.p_request_id,attempt:args.p_attempt,code:error?.code??"missing_insert_id"}))}catch{if(i===1)console.error("ai_metric_write_failed",JSON.stringify({request_id:args.p_request_id,attempt:args.p_attempt,code:"transport_error"}))}}}
function background(task:Promise<void>):void{const safe=task.catch(()=>{});const runtime=(globalThis as any).EdgeRuntime;if(typeof runtime?.waitUntil==="function")runtime.waitUntil(safe)}
export async function meteredFetch(client:RpcClient,trace:AiTrace,provider:Provider,model:string,input:string,init:RequestInit):Promise<Response>{const attempt=++trace.attempt,start=Date.now();let response:Response;try{response=await fetch(input,init)}catch(error){background(persist(client,{p_request_id:trace.requestId,p_attempt:attempt,p_action:trace.action,p_provider:provider,p_model:model,p_http_status:null,p_duration_ms:Math.min(3600000,Math.max(0,Date.now()-start)),p_outcome:"network_error",p_usage:null}));throw error}background((async()=>{let body:any=null;try{body=await response.clone().json()}catch{}await persist(client,{p_request_id:trace.requestId,p_attempt:attempt,p_action:trace.action,p_provider:provider,p_model:model,p_http_status:response.status,p_duration_ms:Math.min(3600000,Math.max(0,Date.now()-start)),p_outcome:response.ok?"api_ok":"api_error",p_usage:tokenUsage(provider,provider==="gemini"?body?.usageMetadata:body?.usage)})})());return response}
