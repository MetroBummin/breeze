// Breeze — dictionary Edge Function (OpenRouter/DeepSeek primary, Gemini/Claude fallback)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { meteredFetch, newAiTrace, type AiAction, type AiTrace } from "./telemetry.ts";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json"}});

const OPENROUTER_MODEL="deepseek/deepseek-v4-flash-0731";
const JEV_MODEL="jev-latest";
const JEV_PHRASE_CONFIDENCE=0.75;
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

const LOOK_SCHEMA={type:"object",additionalProperties:false,required:["lemma","pos","ko","gloss"],properties:{lemma:{type:"string"},pos:{type:"string"},ko:{type:"string"},gloss:{type:"string"}}};
function lookPrompt(word:string,clicked:string,sentence:string,avoid:string[]){
  const isPhrase=/\s/.test(word.trim());
  const form=isPhrase
    ? `표현: ${word}`
    : clicked&&clicked.toLowerCase()!==word.toLowerCase()
      ? `단어: ${word} (문장에서는 "${clicked}")`
      : `단어: ${word}`;
  const skip=avoid.length?`\n이미 보여 준 뜻이므로 같은 sense를 다시 만들지 마세요: ${avoid.join(", ")}\n`:"";
  return `${form}
문장: ${sentence||"(문장 없음 — 가장 일반적이고 재사용 가능한 사전 뜻으로 답하세요)"}
${skip}
현재 문맥을 근거로 target의 사전 sense를 정확히 하나 만드세요. 문장을 번역하지 말고, 다른 문장에서도 같은 의미라면 그대로 재사용할 수 있는 dictionary sense를 만드세요.

중요:
- 문장은 어떤 sense인지 판단하기 위한 증거입니다. 현재 문장의 주변 단어를 ko에 번역해 붙이지 마세요.
- target이 한 단어라면 ko는 그 단어 자체의 뜻만 나타내야 합니다.
  예: "design philosophy"에서 target이 philosophy라면 "철학"은 좋고 "디자인 철학"은 나쁩니다.
- target이 이미 여러 단어로 이루어진 표현이라면 그 표현 전체의 사전식 뜻을 만드세요.
  예: take off → "이륙하다".
- 새로운 phrase를 임의로 발명하거나 target 바깥의 단어를 sense에 끌어들이지 마세요.
- 현재 필요한 sense 하나만 만드세요. 다른 흔한 뜻이나 대체 sense를 추가로 생성하지 마세요.

- lemma: 사전 표제어(원형). 표현이면 전달된 표현 전체를 그대로, 고유명사나 약어면 그대로 적으세요.
- pos: 명사|동사|형용사|부사|전치사|기타 중 하나.
- ko: 재사용 가능한 짧은 한국어 사전 뜻 하나.
  * 설명문이 아니라 한 단어 또는 짧은 구를 우선하세요.
  * 현재 문장의 특정 인물·사물·상황을 포함하지 마세요.
  * 정확성을 해치지 않는 범위에서 한국 중·고등학생이나 일반 학습자가 바로 이해할 수 있는 쉬운 한국어를 우선하세요.
  * 드문 한자어, 지나치게 사전적인 문어체, 불필요한 전문 번역어보다 흔하고 직관적인 표현을 우선하세요.
  * 전문용어가 더 정확하더라도 쉬운 표현으로 같은 sense를 정확히 전달할 수 있으면 쉬운 표현을 ko에 쓰고, 전문적인 차이는 gloss에서 설명하세요.
  * 예: extrapolate는 문맥상 가능하다면 "추정하다"처럼 이해하기 쉬운 뜻을 우선하고, 외삽 개념은 gloss에서 정확히 설명하세요.
- gloss: 이 sense가 무엇을 뜻하는지 쉬운 한국어 한 문장으로 설명하세요.
  * 현재 문장의 특정 사건에 종속되지 않아야 합니다.
  * 다른 문장의 같은 sense에도 그대로 재사용 가능해야 합니다.
  * ko만으로 구분하기 어려운 의미 차이나 전문적 정확성은 여기서 보완하세요.

{"lemma":"","pos":"","ko":"","gloss":""}`;
}
async function opLook(body:any,userId:string|null,seeding=false){
  const word=clean(body.word,60).toLowerCase(),clicked=clean(body.clicked,60),sentence=clean(body.sentence,600),avoid=cleanList(body.avoid,4,40),retry=!!body.retry;let anonLeft:number|null=null,userLeft:number|null=null;
  if(seeding){}else if(!userId){const verdict=await takeAnonQuota(clean(body.device,64));if(verdict.status==="spent")return json({error:"anon_exhausted",free:ANON_FREE},429);if(verdict.status!=="ok")return json({error:"login_required"},401);anonLeft=Math.max(0,ANON_FREE-(verdict.calls??ANON_FREE))}else{const quota=await takeQuota(userId);if(!quota.ok)return json({error:"quota_exceeded",limit:quota.limit},429);userLeft=quota.left}
  const out=await ask({action:seeding?"seed":retry?"retry":"look",prompt:lookPrompt(word,clicked,sentence,avoid),maxTokens:450,schema:LOOK_SCHEMA});const parsed=parseJson(out.text);if(!parsed)return json({error:"parse_failed",raw:out.text.slice(0,300)},502);
  const cands=cleanList(body.cands,8,60).map(c=>c.toLowerCase()),aiLemma=clean(parsed.lemma,60).toLowerCase();const lemma=cands.includes(aiLemma)||aiLemma===word?aiLemma:(word||cands[0]||"");const ko=clean(parsed.ko,60);const answer={lemma,pos:clean(parsed.pos,12),ko,gloss:clean(parsed.gloss,300),alts:[],provider:out.provider,...(anonLeft!==null?{left:anonLeft}:userLeft!==null?{left:userLeft}:{})};if(!answer.ko)return json({error:"empty_answer"},502);return json(answer);
}

/* One Jev request routes a click to an existing sense, a phrase, or NONE.
   Phrase token membership is asked in the same System One request, so the normal
   saved-word path no longer pays phrase + judge as two serial HTTP round trips. */
async function opRoute(body:any,signal:AbortSignal){
  const key=Deno.env.get("JEV_API_KEY");if(!key)return json({error:"jev_not_configured"},503);
  const word=clean(body.word,60),sentence=clean(body.sentence,600);
  const rawSenses=Array.isArray(body.senses)?body.senses:[];
  const senses=rawSenses.slice(0,16).map((item:any,index:number)=>({
    id:`sense_${index}`,meaning:clean(item&&item.meaning,60),
    pos:clean(item&&item.pos,20),gloss:clean(item&&item.gloss,300)
  })).filter(item=>item.meaning);
  const rawTokens=Array.isArray(body.tokens)?body.tokens:[];
  const tokens=rawTokens.slice(0,500).map((item:any)=>clean(item&&item.text,60));
  const clickedIndex=Number(body.clickedIndex);
  const phraseEligible=tokens.length>=2&&Number.isInteger(clickedIndex)&&clickedIndex>=0&&clickedIndex<tokens.length;
  if(!word||!sentence)return json({error:"bad_route_request"},400);

  const criteria:Record<string,string>=Object.fromEntries(senses.map(item=>[
    item.id,[item.meaning,item.pos?`품사: ${item.pos}`:"",item.gloss?`설명: ${item.gloss}`:""].filter(Boolean).join(" · ")
  ]));
  if(phraseEligible)criteria.PHRASE="클릭한 token이 현재 문장에서 phrasal verb, idiom, fixed expression 또는 하나의 사전 단위로 봐야 하는 multiword lexical expression의 구성원임";
  criteria.NONE="클릭한 것은 이 문장에서 독립적인 word로 쓰였지만, 저장된 sense 중 맞는 것이 없음";

  const questions:Record<string,unknown>={
    route:{
      type:"choice",
      instructions:"현재 문장에서 클릭한 target을 분류하세요. 저장된 sense가 정확히 맞으면 해당 sense를 고르세요. 짧은 한국어 뜻뿐 아니라 품사와 gloss를 함께 비교하세요. 클릭 token이 phrasal verb, idiom, fixed expression 또는 하나의 사전 단위로 봐야 하는 multiword lexical expression의 구성원이면 PHRASE를 고르세요. design philosophy, economic pressure처럼 의미가 그대로 합쳐지는 일반 수식어+명사 조합이나 단순 collocation은 PHRASE가 아닙니다. 저장 sense가 맞지 않고 phrase도 아니면 NONE을 고르세요. 저장 sense가 얼핏 비슷해도 실제로 phrase 안에서 다른 의미가 생긴 경우에는 PHRASE가 우선입니다.",
      criteria
    }
  };
  if(phraseEligible){
    tokens.forEach((text,index)=>{
      questions[`token_${index}`]={
        type:"choice",
        instructions:`문장 전체에서 사용자가 클릭한 token은 ${clickedIndex}번 '${tokens[clickedIndex]}'입니다. ${index}번 token '${text}'이 클릭 token과 함께 하나의 lexical expression(phrasal verb, idiom, fixed expression, 의미 단위로 함께 봐야 하는 multiword expression)을 이루는 구성원인지 판단하세요. 학습자가 사전에서 찾아야 할 완전한 표현을 만드세요. 전치사·particle은 완전한 표현의 일부라면 반드시 YES입니다(예: take care of, look forward to는 세 token 모두 YES). 활용된 be동사는 표제어 자체가 be를 요구할 때만 YES입니다(be interested in의 is는 YES). 시제·수동태만 만드는 auxiliary는 NO입니다(were taken care of의 were는 NO). 분리 가능한 목적어도 구성원이 아닙니다(give the idea up의 idea는 NO, give/up은 YES). 같은 단어 조합처럼 보여도 현재 문맥이 문자 그대로의 방향·공간 이동이면 숙어가 아닙니다(looked forward across the field의 looked/forward는 모두 NO이고, look forward to에서만 look/forward/to가 YES). 단순히 의미적으로 관련되거나 가까이 있다는 이유만으로 YES를 선택하지 마세요. 여러 후보가 가능하면 현재 문맥에서 가장 확실한 하나만 선택하고, 애매하면 NO를 선택하세요.`,
        criteria:{YES:"같은 lexical expression의 사전형을 이루는 구성원",NO:"그 expression의 구성원이 아님"}
      };
    });
  }

  const trace=newAiTrace("route"),combined=AbortSignal.any([signal,AbortSignal.timeout(2200)]);
  const r=await meteredFetch(SR,trace,"jev",JEV_MODEL,"https://api.typesafe.ai/v1/systemone",{
    method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${key}`},
    body:JSON.stringify({model:JEV_MODEL,state:{word,sentence,clickedIndex,tokens},questions}),signal:combined
  });
  if(!r.ok)return json({error:"jev_failed",status:r.status},502);
  const data=await r.json(),selected=clean(data?.answers?.route?.choice,40);
  if(!(selected in criteria))return json({error:"jev_invalid_response"},502);
  const confidence=Number(data?.answers?.route?.confidence??0);
  if(selected!=="PHRASE")return json({selected,confidence,members:[],threshold:JEV_PHRASE_CONFIDENCE,provider:"jev"});

  const candidates:Array<{index:number;confidence:number}>=[];
  for(let index=0;index<tokens.length;index++){
    const answer=data?.answers?.[`token_${index}`],choice=clean(answer?.choice,8).toUpperCase();
    if(choice!=="YES"&&choice!=="NO")return json({error:"jev_invalid_response"},502);
    const tokenConfidence=Number(answer?.confidence??answer?.probabilities?.[choice]??0);
    if(choice==="YES")candidates.push({index,confidence:Number.isFinite(tokenConfidence)?tokenConfidence:0});
  }
  const members=candidates.filter(item=>item.confidence>=JEV_PHRASE_CONFIDENCE);
  const clicked=members.find(item=>item.index===clickedIndex);
  if(!clicked||members.length<2){
    return json({selected:"NONE",confidence,members:[],candidates,threshold:JEV_PHRASE_CONFIDENCE,
      phraseRejected:true,provider:"jev"});
  }
  return json({selected:"PHRASE",confidence,members,candidates,threshold:JEV_PHRASE_CONFIDENCE,provider:"jev"});
}

/* Jev only chooses from meanings the device supplied. It never writes a meaning. */
async function opJudge(body:any,signal:AbortSignal){
  const key=Deno.env.get("JEV_API_KEY");if(!key)return json({error:"jev_not_configured"},503);
  const word=clean(body.word,60),sentence=clean(body.sentence,600);const raw=Array.isArray(body.senses)?body.senses:[];
  const senses=raw.slice(0,16).map((item:any,index:number)=>({id:`sense_${index}`,meaning:clean(item&&item.meaning,60),pos:clean(item&&item.pos,20),gloss:clean(item&&item.gloss,300)})).filter(item=>item.meaning);
  if(!word||!sentence||!senses.length)return json({error:"bad_judge_request"},400);
  const criteria:Record<string,string>=Object.fromEntries(senses.map(item=>[item.id,[item.meaning,item.pos?`품사: ${item.pos}`:"",item.gloss?`설명: ${item.gloss}`:""].filter(Boolean).join(" · ")]));criteria.NEW="기존 뜻과 설명을 함께 봐도 현재 문장에 맞는 sense가 없음";
  const trace=newAiTrace("judge");const combined=AbortSignal.any([signal,AbortSignal.timeout(1800)]);
  const r=await meteredFetch(SR,trace,"jev",JEV_MODEL,"https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${key}`},body:JSON.stringify({model:JEV_MODEL,state:{word,sentence},questions:{reuse:{type:"choice",instructions:"현재 문장의 의미와 가장 잘 맞는 기존 저장 sense를 선택하세요. 각 후보의 짧은 한국어 뜻뿐 아니라 품사와 설명(gloss)도 함께 비교하세요. 뜻 글자가 비슷하더라도 gloss가 현재 문맥과 다르면 고르지 마세요. 기존 후보 중 맞는 sense가 없을 때는 NEW를 선택하세요.",criteria}}}),signal:combined});
  if(!r.ok)return json({error:"jev_failed",status:r.status},502);const data=await r.json();const selected=clean(data?.answers?.reuse?.choice,40);if(!(selected in criteria))return json({error:"jev_invalid_response"},502);return json({selected,confidence:Number(data?.answers?.reuse?.confidence??0),provider:"jev"});
}

/* The client owns tokenisation and sends the exact clicked index. Jev may only
   classify those tokens; it never invents a phrase string. A phrase is accepted
   only from YES tokens that clear one conservative threshold. */
async function opPhrase(body:any,signal:AbortSignal){
  const key=Deno.env.get("JEV_API_KEY");if(!key)return json({error:"jev_not_configured"},503);
  const sentence=clean(body.sentence,4000),raw=Array.isArray(body.tokens)?body.tokens:[];
  const tokens=raw.slice(0,500).map((item:any)=>clean(item&&item.text,60));
  const clickedIndex=Number(body.clickedIndex);
  if(!sentence||tokens.length<2||!Number.isInteger(clickedIndex)||clickedIndex<0||clickedIndex>=tokens.length)return json({error:"bad_phrase_request"},400);
  const questions:Record<string,unknown>={};
  tokens.forEach((text,index)=>{questions[`token_${index}`]={type:"choice",instructions:`문장 전체에서 사용자가 클릭한 token은 ${clickedIndex}번 '${tokens[clickedIndex]}'입니다. ${index}번 token '${text}'이 클릭 token과 함께 하나의 lexical expression(phrasal verb, idiom, fixed expression, 의미 단위로 함께 봐야 하는 multiword expression)을 이루는 구성원인지 판단하세요. 학습자가 사전에서 찾아야 할 완전한 표현을 만드세요. 전치사·particle은 완전한 표현의 일부라면 반드시 YES입니다(예: take care of, look forward to는 세 token 모두 YES). 활용된 be동사는 표제어 자체가 be를 요구할 때만 YES입니다(be interested in의 is는 YES). 시제·수동태만 만드는 auxiliary는 NO입니다(were taken care of의 were는 NO). 분리 가능한 목적어도 구성원이 아닙니다(give the idea up의 idea는 NO, give/up은 YES). 같은 단어 조합처럼 보여도 현재 문맥이 문자 그대로의 방향·공간 이동이면 숙어가 아닙니다(looked forward across the field의 looked/forward는 모두 NO이고, look forward to에서만 look/forward/to가 YES). 단순히 의미적으로 관련되거나 가까이 있다는 이유만으로 YES를 선택하지 마세요. 여러 후보가 가능하면 현재 문맥에서 가장 확실한 하나만 선택하고, 애매하면 NO를 선택하세요.`,criteria:{YES:"같은 lexical expression의 사전형을 이루는 구성원",NO:"그 expression의 구성원이 아님"}}});
  const trace=newAiTrace("phrase");const combined=AbortSignal.any([signal,AbortSignal.timeout(2200)]);
  const r=await meteredFetch(SR,trace,"jev",JEV_MODEL,"https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${key}`},body:JSON.stringify({model:JEV_MODEL,state:{sentence,clickedIndex,tokens},questions}),signal:combined});
  if(!r.ok)return json({error:"jev_failed",status:r.status},502);
  const data=await r.json(),candidates:Array<{index:number;confidence:number}>=[];
  for(let index=0;index<tokens.length;index++){
    const answer=data?.answers?.[`token_${index}`],choice=clean(answer?.choice,8).toUpperCase();
    if(choice!=="YES"&&choice!=="NO")return json({error:"jev_invalid_response"},502);
    const confidence=Number(answer?.confidence??answer?.probabilities?.[choice]??0);
    if(choice==="YES")candidates.push({index,confidence:Number.isFinite(confidence)?confidence:0});
  }
  const members=candidates.filter(item=>item.confidence>=JEV_PHRASE_CONFIDENCE);
  const clicked=members.find(item=>item.index===clickedIndex);
  const accepted=!!clicked&&members.length>=2;
  return json({accepted,members,candidates,threshold:JEV_PHRASE_CONFIDENCE,provider:"jev"});
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

Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(req.method!=="POST")return json({error:"POST only"},405);try{const body=await req.json().catch(()=>({}));const op=String(body.op??"look").trim();if(op==="warm")return json({ok:true});const seedToken=Deno.env.get("SEED_TOKEN")??"";const isSeed=op==="seed"&&!!seedToken&&req.headers.get("x-seed-token")===seedToken;if(op==="seed"&&!isSeed)return json({error:"seed_forbidden"},403);let userId:string|null=null;const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");if(token){const{data}=await SR.auth.getUser(token);userId=data?.user?.id??null}if(op==="log")return await opLog(body,userId);if(op==="purge_private_logs")return await opPurgePrivateLogs(userId);if(op==="delete_account")return await opDeleteAccount(userId);if(op==="explain")return await opExplain(body,userId);if(op==="route")return await opRoute(body,req.signal);if(op==="judge")return await opJudge(body,req.signal);if(op==="phrase")return await opPhrase(body,req.signal);const word=String(body.word??"").slice(0,60).trim();if(!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word))return json({error:"bad_word"},400);if(op==="look"||isSeed)return await opLook(body,userId,isSeed);return json({error:"bad_op"},400)}catch(e){const message=String(e);console.error("dict_request_failed",e instanceof Error?e.name:"Error");if(message.includes("AbortError")||message.includes("TimeoutError"))return json({error:"jev_timeout"},504);if(message.includes("server_not_configured"))return json({error:"server_not_configured"},500);return json({error:"internal"},500)}});
