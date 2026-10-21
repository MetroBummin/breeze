// Breeze — dictionary Edge Function (OpenRouter/DeepSeek primary, Gemini hedge for words)
import { runVocabularyTestGrading, VOCABULARY_TEST_GRADING_ENABLED } from "./vocabulary-test.ts";
import { runStudySetTestGrade } from "./study-set-test.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { deleteAccountBookCloud } from "../books/handler.ts";
import { runEasyExplanation, easyPrompt, type EasyInput } from "./easy-explanation.ts";
import { runSentenceEasyExplanation, sentenceEasyPrompt, type SentenceEasyInput } from "./sentence-easy-explanation.ts";
import { LOOK_SCHEMA, lookupInput, miniPrompt, validateLook } from "./lookup.ts";
import { meteredFetch, newAiTrace, type AiAction, type AiTrace } from "./telemetry.ts";
import { logicalLookup, lookupFingerprint } from "./logical-lookup.ts";
import { clientLookupFailureResponse } from "./client-failure.ts";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json"}});

const OPENROUTER_MODEL="deepseek/deepseek-v4-flash-0731";
const GEMINI_MODEL="gemini-3.5-flash-lite";
const HEDGE_DELAY_MS=2000;
const WORD_LOOKUP_DEADLINE_MS=8000;
const DEFAULT_DAILY_LIMIT=3000;
const ANON_SENT_FREE=50;
const ANON_FREE=50;
const ANON_DAILY_CAP=Number(Deno.env.get("AI_ANON_DAILY_CAP")??2000);

const SYSTEM="You are a precise bilingual dictionary for Korean learners reading English books. Reply with ONLY minified JSON. No markdown, no code fence, no commentary.";
const SR=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
type Ask={prompt:string;maxTokens:number;schema?:unknown;system?:string;action:AiAction;trace?:AiTrace;temperature?:number;signal?:AbortSignal;validate?:(value:any)=>unknown};

async function callOpenRouter(key:string,ask:Ask){
  const body:Record<string,unknown>={model:OPENROUTER_MODEL,messages:[{role:"system",content:ask.system??SYSTEM},{role:"user",content:ask.prompt}],temperature:ask.temperature??0.2,max_tokens:ask.maxTokens,stream:false,reasoning:{enabled:false},provider:{sort:"throughput",max_price:{prompt:0.10,completion:0.30}}};
  if(ask.schema)body.response_format={type:"json_object"};
  const r=await meteredFetch(SR,ask.trace!,"openrouter",OPENROUTER_MODEL,"https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${key}`,"HTTP-Referer":"https://breeze.io.kr","X-Title":"Breeze"},body:JSON.stringify(body),signal:ask.signal});
  if(!r.ok){console.error("openrouter error",r.status,(await r.text()).slice(0,300));throw new Error(`openrouter_${r.status}`)}
  const d=await r.json();const raw=d?.choices?.[0]?.message?.content;const text=Array.isArray(raw)?raw.map((part:{text?:string})=>part?.text??"").join(""):String(raw??"");return{text:text.trim(),usage:d?.usage??null};
}
async function callGemini(key:string,ask:Ask){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;const base:Record<string,unknown>={maxOutputTokens:ask.maxTokens,temperature:ask.temperature??0.2};if(ask.schema)base.responseMimeType="application/json";
  const r=await meteredFetch(SR,ask.trace!,"gemini",GEMINI_MODEL,url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:ask.system??SYSTEM}]},contents:[{role:"user",parts:[{text:ask.prompt}]}],generationConfig:base}),signal:ask.signal});
  if(!r.ok){console.error("gemini error",r.status,(await r.text()).slice(0,300));throw new Error(`gemini_${r.status}`)}const d=await r.json();const text=d?.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p?.text??"").join("")??"";return{text:text.trim(),usage:d?.usageMetadata??null};
}
function providerKeys(){return{oKey:Deno.env.get("OPENROUTER_API_KEY"),gKey:Deno.env.get("GEMINI_API_KEY")}}
type WordProvider="openrouter"|"gemini";
type LoserState="aborted"|"failed"|"late";
function providerAbort(signal?:AbortSignal){
  const reason=signal?.reason;
  if(reason instanceof Error)return reason;
  const error=new Error("The operation was aborted");
  error.name="AbortError";
  return error;
}
function abortedError(error:unknown){
  const name=error&&typeof error==="object"?(error as {name?:string}).name:"";
  return name==="AbortError"||name==="TimeoutError";
}
// Word lookups have one deadline. DeepSeek starts immediately; Gemini starts
// only if no valid answer has arrived after HEDGE_DELAY_MS. The first valid
// answer wins and aborts the other request.
async function askHedgedWord(input:Ask){
  const trace=newAiTrace(input.action);
  let releaseHedge=()=>{};
  let published=false;
  const hedge={settled:new Promise<void>(resolve=>{releaseHedge=resolve;}),hedged:false,winner:null as WordProvider|null,loser:null as LoserState|null};
  const release=()=>{if(published)return;published=true;releaseHedge();};
  trace.hedge=hedge;
  const inflight:Promise<void>[]=[];
  const states=new Map<WordProvider,LoserState>();
  const calls=new Map<WordProvider,AbortController>();
  const deadline=new AbortController();
  let hedgeTimer:ReturnType<typeof setTimeout>|undefined;
  let deadlineTimer:ReturnType<typeof setTimeout>|undefined;
  let hedgeStarted=false;
  let willHedge=false;
  let pending=0;
  let winner:{text:string;usage:unknown;provider:WordProvider}|null=null;
  let lastError:unknown=new Error("lookup_failed");
  let closed=false;
  let resolveLookup=()=>{};
  const lookupDone=new Promise<void>(resolve=>{resolveLookup=resolve;});
  const close=()=>{if(!closed){closed=true;resolveLookup();}};
  const note=(provider:WordProvider,state:LoserState)=>{if(!states.has(provider))states.set(provider,state);};
  const loserFor=(winning:WordProvider|null):LoserState=>{
    if(!winning){
      const seen=[...states.values()];
      if(seen.includes("failed"))return "failed";
      if(seen.includes("aborted"))return "aborted";
      return "failed";
    }
    const other:WordProvider=winning==="openrouter"?"gemini":"openrouter";
    return states.get(other)??"aborted";
  };
  const afterSettle=()=>{
    if(winner||input.signal?.aborted||deadline.signal.aborted)close();
    else if(pending===0&&!willHedge)close();
  };
  const {oKey,gKey}=providerKeys();
  const start=(provider:WordProvider)=>{
    const controller=new AbortController();
    calls.set(provider,controller);
    const signal=input.signal?AbortSignal.any([deadline.signal,controller.signal,input.signal]):AbortSignal.any([deadline.signal,controller.signal]);
    const ask={...input,trace,signal};
    pending++;
    inflight.push((async()=>{
      try{
        const out=provider==="openrouter"?await callOpenRouter(oKey!,ask):await callGemini(gKey!,ask);
        if(input.validate)input.validate(parseJson(out.text));
        pending--;
        if(winner)note(provider,"late");
        else if(input.signal?.aborted){note(provider,"aborted");lastError=providerAbort(input.signal);}
        else{
          winner={text:out.text,usage:out.usage,provider};
          willHedge=false;
          if(hedgeTimer!==undefined){clearTimeout(hedgeTimer);hedgeTimer=undefined;}
          for(const [name,control] of calls)if(name!==provider)control.abort();
        }
      }catch(error){
        pending--;
        lastError=error;
        note(provider,abortedError(error)?"aborted":"failed");
      }
      afterSettle();
    })());
  };
  try{
    if(!oKey&&!gKey)throw new Error("server_not_configured");
    if(input.signal?.aborted)throw providerAbort(input.signal);
    deadlineTimer=setTimeout(()=>deadline.abort(),WORD_LOOKUP_DEADLINE_MS);
    deadline.signal.addEventListener("abort",()=>{
      willHedge=false;
      if(hedgeTimer!==undefined){clearTimeout(hedgeTimer);hedgeTimer=undefined;}
      if(!winner)lastError=providerAbort(deadline.signal);
      close();
    },{once:true});
    input.signal?.addEventListener("abort",()=>{
      willHedge=false;
      if(hedgeTimer!==undefined){clearTimeout(hedgeTimer);hedgeTimer=undefined;}
      if(!winner)lastError=providerAbort(input.signal);
      close();
    },{once:true});
    willHedge=!!(oKey&&gKey);
    if(oKey)start("openrouter");else start("gemini");
    if(willHedge)hedgeTimer=setTimeout(()=>{
      hedgeTimer=undefined;
      willHedge=false;
      if(winner||input.signal?.aborted||deadline.signal.aborted){afterSettle();return;}
      hedgeStarted=true;
      start("gemini");
    },HEDGE_DELAY_MS);
    await lookupDone;
    if(input.signal?.aborted&&!winner)throw lastError instanceof Error?lastError:providerAbort(input.signal);
    if(!winner)throw lastError instanceof Error?lastError:new Error("lookup_failed");
    return {text:winner.text,usage:winner.usage,provider:winner.provider,attempts:trace.attempt};
  }finally{
    if(hedgeTimer!==undefined)clearTimeout(hedgeTimer);
    if(deadlineTimer!==undefined)clearTimeout(deadlineTimer);
    const hedged=hedgeStarted;
    const winning=winner?.provider??null;
    void Promise.all(inflight).then(()=>{
      hedge.hedged=hedged;
      hedge.winner=winning;
      hedge.loser=hedged?loserFor(winning):null;
      release();
    },()=>{
      hedge.hedged=hedged;
      hedge.winner=winning;
      hedge.loser=hedged?loserFor(winning):null;
      release();
    });
  }
}
async function ask(input:Ask){
  if(input.validate)return askHedgedWord(input);
  const a={...input,trace:newAiTrace(input.action)};const{oKey,gKey}=providerKeys();
  const providers:Array<"openrouter"|"gemini">=[];if(oKey)providers.push("openrouter");if(gKey)providers.push("gemini");
  if(!providers.length)throw new Error("server_not_configured");
  let lastError:unknown=new Error("server_not_configured");
  const compact=input.maxTokens<=120;
  const deadline=Date.now()+(compact?8000:25000);
  // Sentence and other non-word calls keep their per-provider caps. Word lookups never enter this loop.
  const openRouterLimit=compact?5000:15000;
  const geminiReserve=2500;
  let attempts=0;
  for(const provider of providers){
    let validationRetry=false;
    for(let pass=0;pass<2;pass++){
      const remaining=deadline-Date.now();
      if(remaining<250||input.signal?.aborted)break;
      if(pass===1){
        if(provider!=="openrouter"||!validationRetry)break;
        if(gKey&&remaining<openRouterLimit+geminiReserve)break;
      }
      const cap=provider==="openrouter"?openRouterLimit:(compact?5000:15000);
      const timeout=AbortSignal.timeout(Math.min(cap,remaining));
      a.signal=input.signal?AbortSignal.any([input.signal,timeout]):timeout;
      attempts++;
      try{
        const out=provider==="openrouter"?await callOpenRouter(oKey!,a):await callGemini(gKey!,a);
        return {...out,provider,attempts};
      }catch(error){
        lastError=error;if(input.signal?.aborted)throw error;
        const reason=String((error as Error).message);
        validationRetry=/^(invalid_|missing_fixed_word)/.test(reason);
        if(validationRetry)a.prompt=input.prompt+"\nCorrection: the previous response failed "+reason+". Recheck the selected token, headword and fixed member indices. Return the same four fields only.";
      }
    }
  }
  throw lastError;
}

function parseJson(raw:string):Record<string,unknown>|null{try{return JSON.parse(raw)}catch{}const m=raw.match(/\{[\s\S]*\}/);if(m){try{return JSON.parse(m[0])}catch{}}return null}
const clean=(v:unknown,max:number)=>String(v??"").trim().slice(0,max);
const cleanList=(v:unknown,n:number,max:number)=>(Array.isArray(v)?v:[]).map(x=>clean(x,max)).filter(Boolean).slice(0,n);

async function opLook(body:any,userId:string|null,seeding=false,signal?:AbortSignal){
  let input;try{input=lookupInput(body)}catch(error){return json({error:String((error as Error).message)},400)}
  const requestId=body.op==="look_v2"?String(body.lookupId??""):crypto.randomUUID();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))return json({error:"bad_lookup_id"},400);
  const fingerprint=await lookupFingerprint(input);
  try{
    const generate=async()=>{
      const out=await ask({action:seeding?"seed":input.retry?"retry":"look",prompt:miniPrompt(input),maxTokens:120,schema:LOOK_SCHEMA,temperature:0.2,signal,validate:value=>validateLook(value,input)});
      const result=validateLook(parseJson(out.text),input);
      return {...result,lemma:result.canonical,pos:"",phrase:"",alts:[],provider:out.provider};
    };
    if(seeding)return json(await generate());
    const verdict=await logicalLookup(async answer=>{
      const {data,error}=await SR.rpc("word_lookup_receipt",{p_user:userId,p_device:clean(body.device,64),p_request:requestId,p_fingerprint:fingerprint,p_answer:answer??null,p_limit:DEFAULT_DAILY_LIMIT,p_anon_limit:ANON_FREE,p_anon_cap:ANON_DAILY_CAP});
      if(error||!data||typeof data.status!=="string")throw new Error("quota_unavailable");
      return data;
    },generate);
    if(verdict.status==="replay")return json({...verdict.answer,left:verdict.left,lookupId:requestId});
    const code=verdict.status==="quota_exceeded"||verdict.status==="anon_exhausted"?429:verdict.status==="request_conflict"?409:401;
    return json({error:verdict.status,limit:verdict.limit??DEFAULT_DAILY_LIMIT,left:verdict.left},code);
  }catch(error){
    if(String(error).includes("quota_unavailable"))throw error;
    if(signal?.aborted)throw error;
    return json({error:"lookup_failed"},502);
  }
}

const EXPLAIN_SCHEMA={type:"object",additionalProperties:false,required:["ko"],properties:{ko:{type:"string"}}};
function explainPrompt(sentence:string){return `문장: ${sentence}\n\n영어를 읽는 한국인에게 이 문장을 자연스러운 한국어로 번역하세요.\n\n- ko: 문장 전체의 자연스러운 한국어 해석.\n- 영어 어순과 표현을 그대로 옮기지 말고, 원문의 의미를 보존하면서 한국어 화자가 실제로 말하거나 글로 쓸 법한 자연스러운 문장으로 작성하세요.\n- 해석에서 원문의 의미를 임의로 추가하거나 빼지 마세요.\n\n{"ko":""}`}
async function opExplain(body:any,userId:string|null,signal?:AbortSignal){
  const sentence=clean(body.sentence,600);if(sentence.length<12)return json({error:"bad_sentence"},400);
  const requestId=body.lookupId??crypto.randomUUID();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))return json({error:"bad_lookup_id"},400);
  const fingerprint=await lookupFingerprint({op:"explain",sentence});
  const verdict=await logicalLookup(async answer=>{
    const {data,error}=await SR.rpc("sentence_lookup_receipt",{p_user:userId,p_device:clean(body.device,64),p_request:requestId,p_fingerprint:fingerprint,p_answer:answer??null,p_limit:DEFAULT_DAILY_LIMIT,p_anon_limit:ANON_SENT_FREE,p_anon_cap:ANON_DAILY_CAP});
    if(error||!data||typeof data.status!=="string")throw new Error("quota_unavailable");return data;
  },async()=>{
    const out=await ask({action:"explain",prompt:explainPrompt(sentence),maxTokens:600,schema:EXPLAIN_SCHEMA,signal});
    const parsed=parseJson(out.text);if(!parsed)throw new Error("sentence_parse_failed");
    const ko=clean(parsed.ko,500);if(!ko)throw new Error("sentence_empty_answer");
    return {ko,provider:out.provider};
  });
  if(verdict.status==="replay")return json({...verdict.answer,left:verdict.left});
  return json({error:verdict.status,left:verdict.left,limit:verdict.limit??DEFAULT_DAILY_LIMIT},
    ['quota_exceeded','anon_exhausted'].includes(verdict.status)?429:verdict.status==='request_conflict'?409:401);
}

async function opEasyExplanation(body:any,userId:string|null,signal?:AbortSignal){
  const sentence=body.op==="sentence_easy_explanation";
  const run=sentence?runSentenceEasyExplanation:runEasyExplanation;
  const result=await run(body,{
    signal,
    charge:async()=>{
      if(userId)return await takeQuota(userId,1);
      const quota=await takeAnonQuota(clean(body.device,64));
      if(quota.status!=="ok")return {ok:false,error:quota.status==="spent"?"anon_exhausted":quota.status==="bad_device"?"bad_device":"quota_unavailable"};
      return {ok:true,left:Math.max(0,ANON_FREE-(quota.calls??ANON_FREE))};
    },
    generate:async input=>{
      const out=await ask({action:"explain",prompt:sentence?sentenceEasyPrompt(input as SentenceEasyInput):easyPrompt(input as EasyInput),maxTokens:500,
        schema:{type:"object",required:sentence?["explanation"]:["explanation","suggestedMeaning"],properties:{explanation:{type:"string"},suggestedMeaning:{type:"string"}}},signal});
      return parseJson(out.text);
    }
  });
  const response=json(result.body,result.status);
  response.headers.set("Cache-Control","no-store");
  return response;
}

async function opVocabularyTest(body:unknown,userId:string|null,signal?:AbortSignal){
  const receipt=async(name:string,args:Record<string,unknown>)=>{
    const {data,error}=await SR.rpc(name,args);
    if(error||!data||typeof data.status!=="string")throw Error("receipt_unavailable");
    return data;
  };
  const result=await runVocabularyTestGrading(body,{
    enabled:VOCABULARY_TEST_GRADING_ENABLED,userId,signal,key:Deno.env.get("OPENROUTER_API_KEY"),
    claim:(batch,fingerprint)=>receipt("vocabulary_test_claim",{p_user:userId,p_batch:batch,p_fingerprint:fingerprint}),
    finish:(batch,fingerprint,answer)=>receipt("vocabulary_test_finish",{p_user:userId,p_batch:batch,p_fingerprint:fingerprint,p_answer:answer})
  });
  const response=json(result.body,result.status);response.headers.set("Cache-Control","no-store");return response;
}

const LOG_ACTIONS=new Set(["edit","pick","star","known"]);
async function opLog(body:any,userId:string|null){if(!userId)return json({ok:false,reason:"anonymous"});const action=clean(body.action,20);if(!LOG_ACTIONS.has(action))return json({error:"bad_action"},400);return json({ok:true})
}
async function takeQuota(userId:string,cost=1):Promise<{ok:boolean;left:number;limit:number}>{
  const {data,error}=await SR.rpc("take_ai_quota",{p_user:userId,p_limit:DEFAULT_DAILY_LIMIT,p_cost:cost});
  if(error||!data||typeof data.ok!=="boolean"||!Number.isSafeInteger(data.calls)||data.calls<0||
     !Number.isSafeInteger(data.limit)||data.limit<1)throw new Error("quota_unavailable");
  return {ok:data.ok,left:Math.max(0,data.limit-data.calls),limit:data.limit};
}

type AnonVerdict={status:string;calls?:number};
async function takeAnonQuota(device:string):Promise<AnonVerdict>{if(!device)return{status:"bad_device"};const{data,error}=await SR.rpc("take_anon_quota",{p_device:device,p_limit:ANON_FREE,p_daily_cap:ANON_DAILY_CAP});if(error){console.warn("anon quota failed, refusing:",error.message);return{status:"closed"}}return(data??{status:"closed"})as AnonVerdict}
async function opStudySetTest(body:any,userId:string|null,signal?:AbortSignal){
  const result=await runStudySetTestGrade(body,{
    signal,
    charge:async()=>{
      if(userId){const quota=await takeQuota(userId,1);return quota.ok?{ok:true,left:quota.left}:{ok:false,error:"quota_exceeded",left:quota.left};}
      const quota=await takeAnonQuota(clean(body?.device,64));
      if(quota.status!=="ok")return {ok:false,error:quota.status==="spent"?"anon_exhausted":quota.status==="bad_device"?"bad_device":"quota_unavailable"};
      return {ok:true,left:Math.max(0,ANON_FREE-(quota.calls??ANON_FREE))};
    },
    generate:async prompt=>{
      const out=await ask({action:"explain",prompt,maxTokens:64,temperature:0,system:"Reply with minified JSON only.",schema:{type:"object",additionalProperties:false,required:["ok"],properties:{ok:{type:"array",items:{type:"integer",enum:[0,1]}}}},signal});
      return parseJson(out.text);
    }
  });
  const response=json(result.body,result.status);response.headers.set("Cache-Control","no-store");return response;
}
async function opDeleteAccount(userId:string|null){if(!userId)return json({error:"login_required"},401);const cloud=await deleteAccountBookCloud(SR,{get:(name:string)=>Deno.env.get(name)},userId);if(!cloud.ok)return json({error:"delete_failed",message:cloud.message||"delete_failed"},cloud.message==="R2 설정이 없습니다."?503:500);const listed=await SR.storage.from("books").list(userId,{limit:1000});const files=(listed.data??[]).map(file=>`${userId}/${file.name}`);if(files.length){const removed=await SR.storage.from("books").remove(files);if(removed.error)return json({error:"delete_failed",message:removed.error.message},500)}for(const table of["words","positions","books","dict_events","ai_usage"]){const{error}=await SR.from(table).delete().eq("user_id",userId);if(error)return json({error:"delete_failed",message:error.message},500)}const{error}=await SR.auth.admin.deleteUser(userId);if(error)return json({error:"delete_failed",message:error.message},500);return json({ok:true})}

Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(req.method!=="POST")return json({error:"POST only"},405);try{const body=await req.json().catch(()=>({}));const op=String(body.op??"look").trim();if(op==="warm")return json({ok:true,sentenceEasyExplanation:true});
// Exists only for old app versions that still send this retired op.
if(op==="purge_private_logs")return json({ok:true});if(op==="lookup_failure"){const failure=clientLookupFailureResponse(body);return json(failure.body,failure.status);}const seedToken=Deno.env.get("SEED_TOKEN")??"";const isSeed=op==="seed"&&!!seedToken&&req.headers.get("x-seed-token")===seedToken;if(op==="seed"&&!isSeed)return json({error:"seed_forbidden"},403);let userId:string|null=null;const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");if(token){const{data}=await SR.auth.getUser(token);userId=data?.user?.id??null}if(op==="study_set_test_grade")return await opStudySetTest(body,userId,req.signal);if(op==="vocabulary_test_grade")return await opVocabularyTest(body,userId,req.signal);if(op==="log")return await opLog(body,userId);if(op==="delete_account")return await opDeleteAccount(userId);if(op==="explain")return await opExplain(body,userId,req.signal);if(op==="easy_explanation"||op==="sentence_easy_explanation")return await opEasyExplanation(body,userId,req.signal);const word=String(body.word??"").slice(0,60).trim();if(!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word))return json({error:"bad_word"},400);if(op==="look"||op==="look_v2"||isSeed)return await opLook(body,userId,isSeed,req.signal);return json({error:"bad_op"},400)}catch(e){const message=String(e);console.error("dict_request_failed",e instanceof Error?e.name:"Error");if(message.includes("AbortError")||message.includes("TimeoutError"))return json({error:"request_timeout"},504);if(message.includes("quota_unavailable"))return json({error:"quota_unavailable"},503);if(message.includes("server_not_configured"))return json({error:"server_not_configured"},500);return json({error:"internal"},500)}});
