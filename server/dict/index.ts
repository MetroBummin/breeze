// Breeze — dictionary Edge Function (OpenRouter/DeepSeek primary, Gemini/Claude fallback)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { meteredFetch, newAiTrace, type AiAction, type AiTrace } from "./telemetry.ts";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json"}});

const OPENROUTER_MODEL="deepseek/deepseek-v4-flash-0731";
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

const LOOK_SCHEMA={type:"object",additionalProperties:false,required:["kind","canonical","members","ko"],properties:{kind:{type:"string"},canonical:{type:"string"},members:{type:"array",items:{type:"integer"}},ko:{type:"string"}}};
function fallbackTokens(sentence:string){const out:string[]=[];for(const match of String(sentence||"").matchAll(/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g))out.push(match[0]);return out}
function miniPrompt(word:string,clicked:string,sentence:string,tokens:string[],clickedIndex:number,avoid:string[]){
  const skip=avoid.length?`\n이미 보여 준 뜻이므로 같은 뜻은 다시 만들지 마세요: ${avoid.join(", ")}\n`:"";
  return `target: ${word}
clicked: ${clicked||word}
sentence: ${sentence||"(문장 없음)"}
tokens: ${tokens.map((token,index)=>`${index}:${token}`).join(" | ")}
clicked_index: ${clickedIndex}
${skip}
한국인 영어 학습자가 지금 누른 target을 바로 이해하도록 하나의 lexical lookup 결과만 만드세요.

반드시 다음 원칙을 지키세요.
- kind는 word 또는 expression.
- 기본값은 word입니다. expression을 남발하지 마세요.
- 단일 단어의 짧은 한국어 뜻만으로 현재 의미를 충분히 정확하게 전달할 수 있으면 word로 처리하세요.
- phrasal verb, idiom, fixed expression, 전문적인 고정 용어처럼 여러 단어를 하나로 보지 않으면 의미가 달라지거나 중요한 lexical identity를 잃을 때만 expression으로 처리하세요.
- 단순 collocation, 일반적인 수식어+명사, 의미가 그대로 합쳐지는 전치사 결합은 expression으로 올리지 마세요.
- canonical은 저장할 사전형입니다. word면 원형 단어, expression이면 재사용 가능한 표제형을 적으세요.
- members는 현재 sentence의 token index입니다. clicked_index는 반드시 포함하세요.
- word면 members는 clicked_index 하나뿐입니다.
- expression이면 lexical identity를 이루는 token만 포함하세요. 다만 contiguous expression 안의 of/to/at 같은 function word를 임의로 빼면 안 됩니다.
- 표제형에서 one's/someone/something처럼 바뀔 수 있는 variable slot은 members에 넣지 마세요. 예: "a feather in your cap"은 고정된 a/feather/in/cap이 members이고 your는 variable gap입니다.
- 분리 가능한 구동사의 목적어/변수도 members에 넣지 마세요. 예: "gave the plan up"의 give up은 give/up만.
- 반대로 고정된 function word는 빼지 마세요. "policy of benign neglect"를 하나의 expression으로 판단했다면 of도 member입니다.
- members를 이어 붙여 canonical을 만들지 마세요. canonical은 별도로 올바른 사전형을 작성하세요.
- ko는 현재 sense의 짧고 자연스러운 한국어 사전 뜻 하나만. 설명, gloss, 다른 뜻은 쓰지 마세요.

{"kind":"word","canonical":"","members":[${clickedIndex}],"ko":""}`;
}
async function opLook(body:any,userId:string|null,seeding=false){
  const word=clean(body.word,60).toLowerCase(),clicked=clean(body.clicked,60),sentence=clean(body.sentence,600),avoid=cleanList(body.avoid,4,40),retry=!!body.retry;
  let anonLeft:number|null=null,userLeft:number|null=null;
  if(seeding){}else if(!userId){const verdict=await takeAnonQuota(clean(body.device,64));if(verdict.status==="spent")return json({error:"anon_exhausted",free:ANON_FREE},429);if(verdict.status!=="ok")return json({error:"login_required"},401);anonLeft=Math.max(0,ANON_FREE-(verdict.calls??ANON_FREE))}else{const quota=await takeQuota(userId);if(!quota.ok)return json({error:"quota_exceeded",limit:quota.limit},429);userLeft=quota.left}
  const supplied:string[]=Array.isArray(body.tokens)?body.tokens.slice(0,300).map((item:any)=>clean(item&&item.text!==undefined?item.text:item,60)):[];
  const tokens:string[]=supplied.length?supplied:fallbackTokens(sentence);
  let clickedIndex=Number(body.clickedIndex);
  if(!Number.isInteger(clickedIndex)||clickedIndex<0||clickedIndex>=tokens.length){const needle=(clicked||word).replace(/’/g,"'").toLowerCase();const matches=tokens.map((token:string,index:number)=>({token,index})).filter((item:{token:string;index:number})=>item.token.replace(/’/g,"'").toLowerCase()===needle);clickedIndex=matches.length===1?matches[0].index:Math.max(0,matches[0]?.index??0)}
  const out=await ask({action:seeding?"seed":retry?"retry":"look",prompt:miniPrompt(word,clicked,sentence,tokens,clickedIndex,avoid),maxTokens:120,schema:LOOK_SCHEMA});
  const parsed=parseJson(out.text);if(!parsed)return json({error:"parse_failed",raw:out.text.slice(0,300)},502);
  const cands=cleanList(body.cands,8,60).map(c=>c.toLowerCase());
  let kind=clean(parsed.kind,20).toLowerCase()==="expression"?"expression":"word";
  let members:number[]=(Array.isArray(parsed.members)?parsed.members:[]).map((value:unknown)=>Number(value)).filter((index:number)=>Number.isInteger(index)&&index>=0&&index<tokens.length);
  members=[...new Set(members)].sort((a,b)=>a-b);
  if(kind==="word")members=[clickedIndex];
  if(kind==="expression"&&(members.length<2||!members.includes(clickedIndex))){kind="word";members=[clickedIndex]}
  let canonical=clean(parsed.canonical,120).replace(/\s+/g," ").trim();
  if(kind==="word"){const lower=canonical.toLowerCase();canonical=cands.includes(lower)||lower===word?lower:(word||cands[0]||lower)}
  else if(!/^[A-Za-z][A-Za-z'’\- ]*$/.test(canonical))canonical=word;
  const ko=clean(parsed.ko,60);if(!ko)return json({error:"empty_answer"},502);
  return json({kind,canonical,members,ko,lemma:canonical,pos:"",gloss:"",note:"",phrase:"",alts:[],provider:out.provider,...(anonLeft!==null?{left:anonLeft}:userLeft!==null?{left:userLeft}:{})});
}

const DETAIL_SCHEMA={type:"object",additionalProperties:false,required:["pos","gloss"],properties:{pos:{type:"string"},gloss:{type:"string"}}};
function detailPrompt(canonical:string,ko:string,sentence:string){return `표제어: ${canonical}
저장된 한국어 뜻: ${ko}
처음 저장된 문장: ${sentence||"(없음)"}

저장된 이 뜻 하나를 한국인 영어 학습자에게 짧게 설명하세요. 새로운 뜻을 만들거나 다른 sense를 추가하지 마세요.
- pos: 명사|동사|형용사|부사|전치사|기타 중 하나
- gloss: 저장된 한국어 뜻이 정확히 어떤 의미인지 쉬운 한국어 한 문장. 특정 문장 번역이 아니라 같은 sense에 재사용 가능해야 합니다.

{"pos":"","gloss":""}`}
async function opDetail(body:any,userId:string|null){
  const canonical=clean(body.canonical||body.word,120),ko=clean(body.ko,80),sentence=clean(body.sentence,600);
  if(!canonical||!ko)return json({error:"bad_detail_request"},400);
  let anonLeft:number|null=null,userLeft:number|null=null;
  if(!userId){const verdict=await takeAnonQuota(clean(body.device,64));if(verdict.status==="spent")return json({error:"anon_exhausted",free:ANON_FREE},429);if(verdict.status!=="ok")return json({error:"login_required"},401);anonLeft=Math.max(0,ANON_FREE-(verdict.calls??ANON_FREE))}else{const quota=await takeQuota(userId);if(!quota.ok)return json({error:"quota_exceeded",limit:quota.limit},429);userLeft=quota.left}
  const out=await ask({action:"detail",prompt:detailPrompt(canonical,ko,sentence),maxTokens:180,schema:DETAIL_SCHEMA});
  const parsed=parseJson(out.text);if(!parsed)return json({error:"parse_failed",raw:out.text.slice(0,300)},502);
  const gloss=clean(parsed.gloss,400);if(!gloss)return json({error:"empty_answer"},502);
  return json({pos:clean(parsed.pos,20),gloss,provider:out.provider,...(anonLeft!==null?{left:anonLeft}:userLeft!==null?{left:userLeft}:{})});
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

Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(req.method!=="POST")return json({error:"POST only"},405);try{const body=await req.json().catch(()=>({}));const op=String(body.op??"look").trim();if(op==="warm")return json({ok:true});const seedToken=Deno.env.get("SEED_TOKEN")??"";const isSeed=op==="seed"&&!!seedToken&&req.headers.get("x-seed-token")===seedToken;if(op==="seed"&&!isSeed)return json({error:"seed_forbidden"},403);let userId:string|null=null;const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");if(token){const{data}=await SR.auth.getUser(token);userId=data?.user?.id??null}if(op==="log")return await opLog(body,userId);if(op==="purge_private_logs")return await opPurgePrivateLogs(userId);if(op==="delete_account")return await opDeleteAccount(userId);if(op==="explain")return await opExplain(body,userId);if(op==="detail")return await opDetail(body,userId);const word=String(body.word??"").slice(0,60).trim();if(!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word))return json({error:"bad_word"},400);if(op==="look"||isSeed)return await opLook(body,userId,isSeed);return json({error:"bad_op"},400)}catch(e){const message=String(e);console.error("dict_request_failed",e instanceof Error?e.name:"Error");if(message.includes("AbortError")||message.includes("TimeoutError"))return json({error:"request_timeout"},504);if(message.includes("server_not_configured"))return json({error:"server_not_configured"},500);return json({error:"internal"},500)}});
