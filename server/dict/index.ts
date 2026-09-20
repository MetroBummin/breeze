// Breeze — dictionary Edge Function (OpenRouter/DeepSeek primary, Gemini/Claude fallback)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { meteredFetch, newAiTrace, type AiAction, type AiTrace } from "./telemetry.ts";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json"}});

const OPENROUTER_MODEL="deepseek/deepseek-v4-flash-0731";
const JEV_MODEL="jev-latest";
const JEV_PHRASE_CONFIDENCE=0.86;
const GEMINI_MODEL="gemini-3.5-flash-lite";
const CLAUDE_MODEL="claude-haiku-4-5";
const DEFAULT_DAILY_LIMIT=300;
const EXPLAIN_COST=2;
const ANON_FREE=Number(Deno.env.get("AI_ANON_FREE")??10);
const ANON_DAILY_CAP=Number(Deno.env.get("AI_ANON_DAILY_CAP")??2000);

const SYSTEM="You are a precise bilingual dictionary for Korean learners reading English books. Reply with ONLY minified JSON. No markdown, no code fence, no commentary.";
const SR=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
type Ask={prompt:string;maxTokens:number;schema?:unknown;system?:string;action:AiAction;trace?:AiTrace};

async function callOpenRouter(key:string,ask:Ask){
  const body:Record<string,unknown>={model:OPENROUTER_MODEL,messages:[{role:"system",content:ask.system??SYSTEM},{role:"user",content:ask.prompt}],temperature:0.2,max_tokens:ask.maxTokens,stream:false,reasoning:{enabled:false},provider:{sort:"throughput",max_price:{prompt:0.10,completion:0.30}}};
  if(ask.schema)body.response_format={type:"json_object"};
  const r=await meteredFetch(SR,ask.trace!,"openrouter",OPENROUTER_MODEL,"https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${key}`,"HTTP-Referer":"https://breeze.io.kr","X-Title":"Breeze"},body:JSON.stringify(body)});
  if(!r.ok){console.error("openrouter error",r.status,(await r.text()).slice(0,300));throw new Error(`openrouter_${r.status}`)}
  const d=await r.json();const raw=d?.choices?.[0]?.message?.content;const text=Array.isArray(raw)?raw.map((part:{text?:string})=>part?.text??"").join(""):String(raw??"");return{text:text.trim(),usage:d?.usage??null};
}
async function callGemini(key:string,ask:Ask){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;const base:Record<string,unknown>={maxOutputTokens:ask.maxTokens,temperature:0.2};if(ask.schema)base.responseMimeType="application/json";
  const r=await meteredFetch(SR,ask.trace!,"gemini",GEMINI_MODEL,url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:ask.system??SYSTEM}]},contents:[{role:"user",parts:[{text:ask.prompt}]}],generationConfig:base})});
  if(!r.ok){console.error("gemini error",r.status,(await r.text()).slice(0,300));throw new Error(`gemini_${r.status}`)}const d=await r.json();const text=d?.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p?.text??"").join("")??"";return{text:text.trim(),usage:d?.usageMetadata??null};
}
async function callClaude(key:string,ask:Ask){
  const body:Record<string,unknown>={model:CLAUDE_MODEL,max_tokens:ask.maxTokens,system:ask.system??SYSTEM,messages:[{role:"user",content:ask.prompt}]};if(ask.schema)body.output_config={format:{type:"json_schema",schema:ask.schema}};
  const r=await meteredFetch(SR,ask.trace!,"claude",CLAUDE_MODEL,"https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},body:JSON.stringify(body)});
  if(!r.ok){console.error("claude error",r.status,(await r.text()).slice(0,300));throw new Error(`claude_${r.status}`)}const d=await r.json();return{text:(d?.content?.[0]?.text??"").trim(),usage:d?.usage??null};
}
function providerKeys(){return{oKey:Deno.env.get("OPENROUTER_API_KEY"),gKey:Deno.env.get("GEMINI_API_KEY"),cKey:Deno.env.get("ANTHROPIC_API_KEY")}}
async function ask(input:Ask){
  const a={...input,trace:newAiTrace(input.action)};const{oKey,gKey,cKey}=providerKeys();const attempts:Array<{provider:"openrouter"|"gemini"|"claude";run:()=>Promise<{text:string;usage:any}>}>=[];
  if(oKey)attempts.push({provider:"openrouter",run:()=>callOpenRouter(oKey,a)});if(gKey)attempts.push({provider:"gemini",run:()=>callGemini(gKey,a)});if(cKey)attempts.push({provider:"claude",run:()=>callClaude(cKey,a)});if(!attempts.length)throw new Error("server_not_configured");
  let lastError:unknown=new Error("server_not_configured");for(let index=0;index<attempts.length;index++){const attempt=attempts[index];try{const out=await attempt.run();return{...out,provider:attempt.provider}}catch(error){lastError=error;if(index<attempts.length-1)console.warn(`${attempt.provider} failed, falling back:`,String(error))}}throw lastError;
}

function parseJson(raw:string):Record<string,unknown>|null{try{return JSON.parse(raw)}catch{}const m=raw.match(/\{[\s\S]*\}/);if(m){try{return JSON.parse(m[0])}catch{}}return null}
const clean=(v:unknown,max:number)=>String(v??"").trim().slice(0,max);
const cleanList=(v:unknown,n:number,max:number)=>(Array.isArray(v)?v:[]).map(x=>clean(x,max)).filter(Boolean).slice(0,n);

const LOOK_SCHEMA={type:"object",additionalProperties:false,required:["lemma","pos","ko","gloss","alts"],properties:{lemma:{type:"string"},pos:{type:"string"},ko:{type:"string"},gloss:{type:"string"},alts:{type:"array",items:{type:"string"}}}};
function lookPrompt(word:string,clicked:string,sentence:string,avoid:string[]){
  const isPhrase=/\s/.test(word.trim());const form=isPhrase?`표현: ${word}`:clicked&&clicked.toLowerCase()!==word.toLowerCase()?`단어: ${word} (문장에서는 "${clicked}")`:`단어: ${word}`;const skip=avoid.length?`\n이 뜻들은 이미 보여 줬으니 고르지 마세요: ${avoid.join(", ")}\n`:"";
  return `${form}\n문장: ${sentence||"(문장 없음 — 일반적인 뜻으로 답하세요)"}\n${skip}\n이 문장에서 클릭한 ${isPhrase?"표현 전체가":"단어나 표현이"} 실제로 어떤 뜻으로 쓰였는지 문맥을 기준으로 판단하세요.\n\n- lemma: 사전 표제어(원형). 표현이면 표현 전체를 그대로, 고유명사나 약어면 그대로 적으세요.\n- pos: 명사|동사|형용사|부사|전치사|기타 중 하나.\n- ko: 이 문장에서의 뜻. 한국어로 짧고 자연스럽게, 약 8자 내외. 설명이 아니라 사전에 실릴 짧은 뜻만 적으세요.\n- gloss: 이 뜻 자체가 어떤 상황에서 쓰이는지 한국어 한 문장으로 설명하세요.\n  현재 문장의 특정 인물·사물·사건에 종속되지 않게, 같은 뜻이 다른 문맥에서 다시 나와도 자연스럽게 재사용할 수 있는 설명으로 쓰세요.\n  예문을 만들지 말고, ko를 장황하게 반복하지 마세요.\n- alts: 현재 pos와 같은 품사에 해당하는 흔한 다른 한국어 뜻을 최대 3개 적으세요.\n  현재 문맥의 뜻과 겹치는 뜻은 빼세요. 다른 품사의 뜻은 절대 넣지 마세요.\n  숙어 속에서만 생기는 특수한 뜻도 일반적인 단어 뜻처럼 넣지 말고, 자신 없는 것은 빼세요.\n\n{"lemma":"","pos":"","ko":"","gloss":"","alts":[""]}`;
}
async function opLook(body:any,userId:string|null,seeding=false){
  const word=clean(body.word,60).toLowerCase(),clicked=clean(body.clicked,60),sentence=clean(body.sentence,600),avoid=cleanList(body.avoid,4,40),retry=!!body.retry;let anonLeft:number|null=null,userLeft:number|null=null;
  if(seeding){}else if(!userId){const verdict=await takeAnonQuota(clean(body.device,64));if(verdict.status==="spent")return json({error:"anon_exhausted",free:ANON_FREE},429);if(verdict.status!=="ok")return json({error:"login_required"},401);anonLeft=Math.max(0,ANON_FREE-(verdict.calls??ANON_FREE))}else{const quota=await takeQuota(userId);if(!quota.ok)return json({error:"quota_exceeded",limit:quota.limit},429);userLeft=quota.left}
  const out=await ask({action:seeding?"seed":retry?"retry":"look",prompt:lookPrompt(word,clicked,sentence,avoid),maxTokens:450,schema:LOOK_SCHEMA});const parsed=parseJson(out.text);if(!parsed)return json({error:"parse_failed",raw:out.text.slice(0,300)},502);
  const cands=cleanList(body.cands,8,60).map(c=>c.toLowerCase()),aiLemma=clean(parsed.lemma,60).toLowerCase();const lemma=cands.includes(aiLemma)||aiLemma===word?aiLemma:(word||cands[0]||"");const ko=clean(parsed.ko,60);const answer={lemma,pos:clean(parsed.pos,12),ko,gloss:clean(parsed.gloss,300),alts:cleanList(parsed.alts,3,40).filter(item=>item!==ko),provider:out.provider,...(anonLeft!==null?{left:anonLeft}:userLeft!==null?{left:userLeft}:{})};if(!answer.ko)return json({error:"empty_answer"},502);return json(answer);
}

/* Jev only chooses from meanings the device supplied. It never writes a meaning. */
async function opJudge(body:any,signal:AbortSignal){
  const key=Deno.env.get("JEV_API_KEY");if(!key)return json({error:"jev_not_configured"},503);
  const word=clean(body.word,60),sentence=clean(body.sentence,600);const raw=Array.isArray(body.senses)?body.senses:[];
  const senses=raw.slice(0,16).map((item:any,index:number)=>({id:`sense_${index}`,meaning:clean(item&&item.meaning,60)})).filter(item=>item.meaning);
  if(!word||!sentence||!senses.length)return json({error:"bad_judge_request"},400);
  const criteria:Record<string,string>=Object.fromEntries(senses.map(item=>[item.id,item.meaning]));criteria.NEW="기존 뜻 중 현재 문장에 맞는 뜻이 없음";
  const trace=newAiTrace("judge");const combined=AbortSignal.any([signal,AbortSignal.timeout(1800)]);
  const r=await meteredFetch(SR,trace,"jev",JEV_MODEL,"https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${key}`},body:JSON.stringify({model:JEV_MODEL,state:{word,sentence},questions:{reuse:{type:"choice",instructions:"현재 문장에서 이 단어의 의미와 가장 잘 맞는 기존 저장 뜻을 선택하세요. 기존 뜻 중 맞는 것이 없을 때만 NEW를 선택하세요.",criteria}}}),signal:combined});
  if(!r.ok)return json({error:"jev_failed",status:r.status},502);const data=await r.json();const selected=clean(data?.answers?.reuse?.choice,40);if(!(selected in criteria))return json({error:"jev_invalid_response"},502);return json({selected,confidence:Number(data?.answers?.reuse?.confidence??0),provider:"jev"});
}

/* The client owns tokenisation and sends the exact clicked index. Jev may only
   classify those tokens; it never invents a phrase string. A phrase is accepted
   only when every selected token clears one conservative threshold. */
async function opPhrase(body:any,signal:AbortSignal){
  const key=Deno.env.get("JEV_API_KEY");if(!key)return json({error:"jev_not_configured"},503);
  const sentence=clean(body.sentence,4000),raw=Array.isArray(body.tokens)?body.tokens:[];
  const tokens=raw.slice(0,500).map((item:any)=>clean(item&&item.text,60));
  const clickedIndex=Number(body.clickedIndex);
  if(!sentence||tokens.length<2||!Number.isInteger(clickedIndex)||clickedIndex<0||clickedIndex>=tokens.length)return json({error:"bad_phrase_request"},400);
  const questions:Record<string,unknown>={};
  tokens.forEach((text,index)=>{questions[`token_${index}`]={type:"choice",instructions:`문장 전체에서 사용자가 클릭한 token은 ${clickedIndex}번 '${tokens[clickedIndex]}'입니다. ${index}번 token '${text}'이 클릭 token과 함께 하나의 lexical expression(phrasal verb, idiom, fixed expression, 의미 단위로 함께 봐야 하는 multiword expression)을 이루는 구성원인지 판단하세요. 단순히 의미적으로 관련되거나 가까이 있다는 이유만으로 YES를 선택하지 마세요. 여러 후보가 가능하면 현재 문맥에서 가장 확실한 하나만 선택하고, 애매하면 NO를 선택하세요.`,criteria:{YES:"같은 lexical expression의 필수 구성원",NO:"그 expression의 구성원이 아님"}}});
  const trace=newAiTrace("phrase");const combined=AbortSignal.any([signal,AbortSignal.timeout(2200)]);
  const r=await meteredFetch(SR,trace,"jev",JEV_MODEL,"https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${key}`},body:JSON.stringify({model:JEV_MODEL,state:{sentence,clickedIndex,tokens},questions}),signal:combined});
  if(!r.ok)return json({error:"jev_failed",status:r.status},502);
  const data=await r.json(),members:Array<{index:number;confidence:number}>=[];
  for(let index=0;index<tokens.length;index++){
    const answer=data?.answers?.[`token_${index}`],choice=clean(answer?.choice,8).toUpperCase();
    if(choice!=="YES"&&choice!=="NO")return json({error:"jev_invalid_response"},502);
    const confidence=Number(answer?.confidence??answer?.probabilities?.[choice]??0);
    if(choice==="YES")members.push({index,confidence:Number.isFinite(confidence)?confidence:0});
  }
  const clicked=members.find(item=>item.index===clickedIndex);
  const accepted=!!clicked&&members.length>=2&&members.every(item=>item.confidence>=JEV_PHRASE_CONFIDENCE);
  return json({accepted,members,threshold:JEV_PHRASE_CONFIDENCE,provider:"jev"});
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

Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(req.method!=="POST")return json({error:"POST only"},405);try{const body=await req.json().catch(()=>({}));const op=String(body.op??"look").trim();if(op==="warm")return json({ok:true});const seedToken=Deno.env.get("SEED_TOKEN")??"";const isSeed=op==="seed"&&!!seedToken&&req.headers.get("x-seed-token")===seedToken;if(op==="seed"&&!isSeed)return json({error:"seed_forbidden"},403);let userId:string|null=null;const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");if(token){const{data}=await SR.auth.getUser(token);userId=data?.user?.id??null}if(op==="log")return await opLog(body,userId);if(op==="purge_private_logs")return await opPurgePrivateLogs(userId);if(op==="delete_account")return await opDeleteAccount(userId);if(op==="explain")return await opExplain(body,userId);if(op==="judge")return await opJudge(body,req.signal);if(op==="phrase")return await opPhrase(body,req.signal);const word=String(body.word??"").slice(0,60).trim();if(!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word))return json({error:"bad_word"},400);if(op==="look"||isSeed)return await opLook(body,userId,isSeed);return json({error:"bad_op"},400)}catch(e){console.error(e);const message=String(e);if(message.includes("AbortError")||message.includes("TimeoutError"))return json({error:"jev_timeout"},504);if(message.includes("server_not_configured"))return json({error:"server_not_configured"},500);return json({error:"internal",message},500)}});
