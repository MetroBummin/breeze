// Breeze — dictionary Edge Function (OpenRouter/DeepSeek primary, Gemini fallback)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { LOOK_SCHEMA, lookupInput, miniPrompt, validateLook } from "./lookup.ts";
import { meteredFetch, newAiTrace, type AiAction, type AiTrace } from "./telemetry.ts";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json"}});

const OPENROUTER_MODEL="deepseek/deepseek-v4-flash-0731";
const GEMINI_MODEL="gemini-3.5-flash-lite";
const DEFAULT_DAILY_LIMIT=300;
const EXPLAIN_COST=2;
const ANON_FREE=Number(Deno.env.get("AI_ANON_FREE")??10);
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
async function ask(input:Ask){
  const a={...input,trace:newAiTrace(input.action)};const{oKey,gKey}=providerKeys();const attempts:Array<{provider:"openrouter"|"gemini";run:()=>Promise<{text:string;usage:any}>}>=[];
  if(oKey){attempts.push({provider:"openrouter",run:()=>callOpenRouter(oKey,a)});if(input.validate)attempts.push({provider:"openrouter",run:()=>callOpenRouter(oKey,a)});}if(gKey)attempts.push({provider:"gemini",run:()=>callGemini(gKey,a)});if(!attempts.length)throw new Error("server_not_configured");
  let lastError:unknown=new Error("server_not_configured");
  const compact=input.maxTokens<=120;
  const deadline=Date.now()+(compact?8000:25000);
  for(let index=0;index<attempts.length;index++){
    const remaining=deadline-Date.now();if(remaining<250||input.signal?.aborted)break;
    const timeout=AbortSignal.timeout(Math.min(compact?5000:15000,remaining));
    a.signal=input.signal?AbortSignal.any([input.signal,timeout]):timeout;
    try{
      const out=await attempts[index].run();
      if(input.validate)input.validate(parseJson(out.text));
      return {...out,provider:attempts[index].provider,attempts:index+1};
    }catch(error){
      lastError=error;if(input.signal?.aborted)throw error;
      const reason=String((error as Error).message);
      if(/^(invalid_|missing_fixed_word)/.test(reason))a.prompt=input.prompt+"\nCorrection: the previous response failed "+reason+". Recheck the selected token, headword and fixed member indices. Return the same four fields only.";
    }
  }
  throw lastError;
}

function parseJson(raw:string):Record<string,unknown>|null{try{return JSON.parse(raw)}catch{}const m=raw.match(/\{[\s\S]*\}/);if(m){try{return JSON.parse(m[0])}catch{}}return null}
const clean=(v:unknown,max:number)=>String(v??"").trim().slice(0,max);
const cleanList=(v:unknown,n:number,max:number)=>(Array.isArray(v)?v:[]).map(x=>clean(x,max)).filter(Boolean).slice(0,n);

async function opLook(body:any,userId:string|null,seeding=false,signal?:AbortSignal){
  let input;try{input=lookupInput(body)}catch(error){return json({error:String((error as Error).message)},400)}
  let anonLeft:number|null=null,userLeft:number|null=null;
  if(seeding){}else if(!userId){const verdict=await takeAnonQuota(clean(body.device,64));if(verdict.status==="spent")return json({error:"anon_exhausted",free:ANON_FREE},429);if(verdict.status!=="ok")return json({error:"login_required"},401);anonLeft=Math.max(0,ANON_FREE-(verdict.calls??ANON_FREE))}else{const quota=await takeQuota(userId);if(!quota.ok)return json({error:"quota_exceeded",limit:quota.limit},429);userLeft=quota.left}
  try{
    const out=await ask({action:seeding?"seed":input.retry?"retry":"look",prompt:miniPrompt(input),maxTokens:120,schema:LOOK_SCHEMA,temperature:0.2,signal,validate:value=>validateLook(value,input)});
    const result=validateLook(parseJson(out.text),input);
    return json({...result,lemma:result.canonical,pos:"",phrase:"",alts:[],provider:out.provider,...(anonLeft!==null?{left:anonLeft}:userLeft!==null?{left:userLeft}:{})});
  }catch(error){
    if(signal?.aborted)throw error;
    return json({error:"lookup_failed"},502);
  }
}

const EXPLAIN_SCHEMA={type:"object",additionalProperties:false,required:["ko","points"],properties:{ko:{type:"string"},points:{type:"array",items:{type:"string"}}}};
function explainPrompt(sentence:string){return `문장: ${sentence}\n\n영어를 읽는 한국인에게 이 문장 하나를 설명하세요.\n\n- ko: 문장 전체의 자연스러운 한국어 해석.\n  영어 어순과 표현을 그대로 옮기지 말고, 원문의 의미를 보존하면서 한국어 화자가 실제로 말하거나 글로 쓸 법한 자연스러운 문장으로 작성하세요.\n- points: 이 문장을 이해하는 데 실제로 도움이 되는 핵심 포인트만 1~3개 적으세요.\n  문장의 뼈대, 도치, 관계절, 삽입, 생략, 강조구문, 관용 표현 등 중요한 구조를 중심으로 설명하세요.\n  쉬운 문장이면 억지로 여러 개를 채우지 마세요.\n  낱말 하나의 뜻풀이는 하지 마세요.\n\n중요:\n- 문법 구조를 설명할 때는 원문에 실제로 존재하는 형태만 근거로 설명하세요.\n- 원문에 없는 시제, 도치, 생략, 관계절, 강조구문 등을 추정해서 만들어내지 마세요.\n- 설명하기 전에 해당 문법 요소가 원문에 실제로 있는지 확인하세요.\n- 확실하지 않은 문법 포인트는 생략하세요.\n- 해석에서 원문의 의미를 임의로 추가하거나 빼지 마세요.\n\n{"ko":"","points":[""]}`}
async function opExplain(body:any,userId:string|null){if(!userId)return json({error:"login_required"},401);const sentence=clean(body.sentence,600);if(sentence.length<12)return json({error:"bad_sentence"},400);const quota=await takeQuota(userId,EXPLAIN_COST);if(!quota.ok)return json({error:"quota_exceeded",limit:quota.limit,left:0},429);const out=await ask({action:"explain",prompt:explainPrompt(sentence),maxTokens:600,schema:EXPLAIN_SCHEMA});const parsed=parseJson(out.text);if(!parsed)return json({error:"parse_failed",raw:out.text.slice(0,300)},502);const ko=clean(parsed.ko,500);if(!ko)return json({error:"empty_answer"},502);const points=cleanList(parsed.points,3,300);return json({ko,points,provider:out.provider,left:quota.left})}

const LOG_ACTIONS=new Set(["edit","pick","star","known"]);
async function opLog(body:any,userId:string|null){if(!userId)return json({ok:false,reason:"anonymous"});const action=clean(body.action,20);if(!LOG_ACTIONS.has(action))return json({error:"bad_action"},400);return json({ok:true})}
async function opPurgePrivateLogs(userId:string|null){if(!userId)return json({error:"login_required"},401);const{error}=await SR.from("dict_events").delete().eq("user_id",userId);if(error)return json({error:"delete_failed"},500);return json({ok:true})}
async function takeQuota(userId:string,cost=1):Promise<{ok:boolean;left:number;limit:number}>{const{data,error}=await SR.rpc("take_ai_quota",{p_user:userId,p_limit:DEFAULT_DAILY_LIMIT,p_cost:cost});if(error){console.warn("quota check failed, allowing:",error.message);return{ok:true,left:DEFAULT_DAILY_LIMIT,limit:DEFAULT_DAILY_LIMIT}}const limit=Math.max(1,Number(data?.limit??DEFAULT_DAILY_LIMIT)),calls=Math.max(0,Number(data?.calls??0));return{ok:data?.ok!==false,left:Math.max(0,limit-calls),limit}}
type AnonVerdict={status:string;calls?:number};
async function takeAnonQuota(device:string):Promise<AnonVerdict>{if(!device)return{status:"bad_device"};const{data,error}=await SR.rpc("take_anon_quota",{p_device:device,p_limit:ANON_FREE,p_daily_cap:ANON_DAILY_CAP});if(error){console.warn("anon quota failed, refusing:",error.message);return{status:"closed"}}return(data??{status:"closed"})as AnonVerdict}
async function opDeleteAccount(userId:string|null){if(!userId)return json({error:"login_required"},401);const listed=await SR.storage.from("books").list(userId,{limit:1000});const files=(listed.data??[]).map(file=>`${userId}/${file.name}`);if(files.length){const removed=await SR.storage.from("books").remove(files);if(removed.error)return json({error:"delete_failed",message:removed.error.message},500)}for(const table of["words","positions","books","dict_events","ai_usage"]){const{error}=await SR.from(table).delete().eq("user_id",userId);if(error)return json({error:"delete_failed",message:error.message},500)}const{error}=await SR.auth.admin.deleteUser(userId);if(error)return json({error:"delete_failed",message:error.message},500);return json({ok:true})}

Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(req.method!=="POST")return json({error:"POST only"},405);try{const body=await req.json().catch(()=>({}));const op=String(body.op??"look").trim();if(op==="warm")return json({ok:true});const seedToken=Deno.env.get("SEED_TOKEN")??"";const isSeed=op==="seed"&&!!seedToken&&req.headers.get("x-seed-token")===seedToken;if(op==="seed"&&!isSeed)return json({error:"seed_forbidden"},403);let userId:string|null=null;const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");if(token){const{data}=await SR.auth.getUser(token);userId=data?.user?.id??null}if(op==="log")return await opLog(body,userId);if(op==="purge_private_logs")return await opPurgePrivateLogs(userId);if(op==="delete_account")return await opDeleteAccount(userId);if(op==="explain")return await opExplain(body,userId);const word=String(body.word??"").slice(0,60).trim();if(!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word))return json({error:"bad_word"},400);if(op==="look"||isSeed)return await opLook(body,userId,isSeed,req.signal);return json({error:"bad_op"},400)}catch(e){const message=String(e);console.error("dict_request_failed",e instanceof Error?e.name:"Error");if(message.includes("AbortError")||message.includes("TimeoutError"))return json({error:"request_timeout"},504);if(message.includes("server_not_configured"))return json({error:"server_not_configured"},500);return json({error:"internal"},500)}});
