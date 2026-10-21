import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
const lookup=readFileSync(new URL('server/dict/lookup.ts',root),'utf8');
const server=readFileSync(new URL('server/dict/index.ts',root),'utf8');
const box={Response,AbortSignal,AbortController,setTimeout,clearTimeout,console,crypto,TextEncoder,touched:[],Deno:{env:{get:()=>''},serve(fn){box.handler=fn;}},createClient:()=>({rpc:async(name,p)=>({data:!p.p_user&&!p.p_device?{status:'login_required'}:box.quotaDenied?{status:'quota_exceeded'}:p.p_answer?{status:'replay',answer:p.p_answer,left:8}:{status:'ok'},error:null}),from(table){box.touched.push(table);throw new Error('db');},auth:{async getUser(){box.touched.push('auth');return {data:{user:null}};}}}),newAiTrace:()=>({})};
vm.createContext(box);
const run=code=>vm.runInContext(ts.transpileModule(code.replace(/^import .*;$/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,box);
run(readFileSync(new URL('modules/lexical/core.js',root),'utf8'));
run(readFileSync(new URL('server/dict/logical-lookup.ts',root),'utf8'));run(lookup);run(server);
const input=box.lookupInput({word:'apple',clicked:'apple',sentence:'He upset the apple cart.',clickedIndex:3});
const valid={kind:'expression',canonical:'upset the apple cart',members:[1,2,3,4],ko:'계획을 망치다'};
assert.equal(box.validateLook(valid,input).kind,'expression');
assert.equal(box.validateLook({...valid,ko:'망치다, 방해하다'},input).ko,'망치다');
for(const patch of [{members:[1]},{members:[null,1,2,3]},{members:[1,3,4]},{members:[3,2,1]},{members:[1,2,3,3]},{kind:'word'},{ko:''},{canonical:'upset (the) apple cart'}]){
 assert.throws(()=>box.validateLook({...valid,...patch},input),JSON.stringify(patch));
}
assert.throws(()=>box.lookupInput({word:'bank',sentence:'A bank faces another bank.'}),/ambiguous_target/);
assert.throws(()=>box.lookupInput({word:'bank',clicked:'bank',sentence:'A bank.',tokens:['A','apple'],clickedIndex:1}),/bad_tokens/);
assert.throws(()=>box.lookupInput({word:'bank',clicked:'bank',sentence:'A bank.',clickedIndex:0}),/bad_target/);
assert.throws(()=>box.lookupInput({word:'bank',sentence:'x'.repeat(2401)}),/bad_context/);
const phraseInput=box.lookupInput({word:'give up',clicked:'give up',sentence:'They give up.',clickedIndex:1});
assert.equal(phraseInput.clickedIndex,1);
const bank=box.lookupInput({word:'bank',clicked:'bank',sentence:'The bank flooded.',clickedIndex:1});
const contextual=box.miniPrompt(box.lookupInput({word:'wild',clicked:'wild',sentence:'It was completely wild.',clickedIndex:3,before:'He claimed the room opened into another city.',after:'Nobody believed him.'}));
assert.match(contextual,/If you were naturally translating the sentence into Korean/);
assert.match(contextual,/Do not default to the most common dictionary sense/);
assert.match(contextual,/"selected_index":3/);
assert.match(contextual,/"before":"He claimed the room opened into another city\."/);
assert.match(contextual,/"after":"Nobody believed him\."/);
const backrooms=box.miniPrompt(box.lookupInput({word:'wild',clicked:'wild',sentence:"It was something I hadn't ever seen before, it was completely wild.",clickedIndex:11,before:'Was this the Backrooms thing she had been obsessing over?',after:"I couldn't believe she had bought into this nonsense."}));
assert.match(backrooms,/"before":"Was this the Backrooms thing she had been obsessing over\?"/);
assert.match(backrooms,/"after":"I couldn't believe she had bought into this nonsense\."/);
// Semantic correctness belongs to the model; source membership is still checked.
assert.equal(box.validateLook({kind:'word',canonical:'flood',members:[1],ko:'홍수'},bank).canonical,'flood');
assert.throws(()=>box.validateLook({kind:'word',canonical:'flood',members:[2],ko:'홍수'},bank),/invalid_members/);
const selfies=box.lookupInput({word:'selfy',clicked:'Selfies',sentence:'Selfies are popular.',clickedIndex:0,cands:['selfy','selfies']});
assert.equal(box.validateLook({kind:'word',canonical:'selfie',members:[0],ko:'셀카'},selfies).canonical,'selfie');
assert.match(box.miniPrompt(selfies),/"selected_text":"Selfies"/);
assert.doesNotMatch(box.miniPrompt(selfies),/target_lemma|selfy/);
const repeated=box.lookupInput({word:'take',clicked:'take',sentence:'I take notes before the planes take off.',clickedIndex:1});
for(const members of [[1,6,7],[1,7]])assert.throws(()=>box.validateLook({kind:'expression',canonical:'take off',members,ko:'이륙하다'},repeated));
const possessive=box.lookupInput({word:'leg',clicked:'leg',sentence:'I am pulling your leg.',clickedIndex:4});
assert.throws(()=>box.validateLook({kind:'expression',canonical:"pull someone's leg",members:[2,3,4],ko:'놀리다'},possessive));
assert.doesNotMatch(server,/ANTHROPIC_API_KEY|api\.anthropic\.com|callClaude/);
assert.equal([...server.matchAll(/const HEDGE_DELAY_MS\s*=/g)].length,1);
assert.match(server,/const HEDGE_DELAY_MS=2000;/);
assert.match(server,/const WORD_LOOKUP_DEADLINE_MS=8000;/);
assert.match(server,/Date\.now\(\)\+\(compact\?8000:25000\)/);
assert.match(server,/openRouterLimit=compact\?5000:15000/);
assert.doesNotMatch(server,/openRouterLimit=compact&&input\.validate\?4000/);
function installClock(){
  let now=0;const queue=[];let seq=0;
  box.setTimeout=(fn,ms)=>{const id=++seq;queue.push({id,fn,at:now+Number(ms),cleared:false});return id;};
  box.clearTimeout=id=>{const item=queue.find(entry=>entry.id===id);if(item)item.cleared=true;};
  // setImmediate alone stays in the check phase and never collects crypto.subtle.digest.
  async function micro(){for(let i=0;i<4;i++){await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setTimeout(resolve,0));}}
  async function advance(ms){
    now+=ms;
    for(;;){
      const due=queue.filter(entry=>!entry.cleared&&entry.at<=now).sort((a,b)=>a.at-b.at||a.id-b.id);
      if(!due.length)break;
      const item=due[0];item.cleared=true;item.fn();
      await micro();
    }
  }
  async function settle(promise,limit=8000){
    let done=false,value,failure,empty=0;
    const started=now;
    promise.then(result=>{done=true;value=result;},error=>{done=true;failure=error;});
    while(!done&&now-started<=limit&&empty<8){
      await micro();
      if(done)break;
      const next=queue.filter(entry=>!entry.cleared).sort((a,b)=>a.at-b.at||a.id-b.id)[0];
      if(!next||next.at>started+limit){empty++;continue;}
      empty=0;
      await advance(Math.max(0,next.at-now));
    }
    if(!done)throw new Error('lookup did not settle');
    if(failure)throw failure;
    return value;
  }
  return {advance,settle,now:()=>now,restore(){box.setTimeout=setTimeout;box.clearTimeout=clearTimeout;}};
}
const clock=installClock();
const bankAnswer=JSON.stringify({kind:'word',canonical:'bank',members:[1],ko:'둑'});
const lookBody={word:'bank',clicked:'bank',sentence:'The bank flooded.',clickedIndex:1};
const providerBudgets=[];
const realTimeout=box.AbortSignal.timeout.bind(box.AbortSignal);
box.AbortSignal.timeout=ms=>{providerBudgets.push(ms);return realTimeout(ms);};
function arm(name,delay,result,{ignoreAbort=false}={}){
  return `(key,ask)=>new Promise((resolve,reject)=>{calls.push('${name}');prompts.push(ask.prompt);hedges.push(ask.trace.hedge);signals.push(ask.signal);
    const timer=setTimeout(()=>{${result instanceof Error?`reject(Object.assign(new Error(${JSON.stringify(result.message)}),{name:${JSON.stringify(result.name||'Error')}}))`:`resolve({text:${JSON.stringify(typeof result==='string'?result:bankAnswer)}})`}},${delay});
    ask.signal.addEventListener('abort',()=>{if(${ignoreAbort})return;clearTimeout(timer);reject(Object.assign(new Error('aborted'),{name:'AbortError'}));});
  })`;
}
async function hedgeOf(response){
  await clock.advance(8000);
  const hedge=box.hedges.at(-1);
  await hedge.settled;
  return {response,body:await response.json(),hedge};
}
run(`providerKeys=()=>({oKey:'fixture',gKey:'fixture'});globalThis.calls=[];globalThis.prompts=[];globalThis.hedges=[];globalThis.signals=[];`);
// An invalid primary answer is one failure. The hedge uses the same prompt; there is no correction retry.
run(`calls=[];prompts=[];hedges=[];signals=[];callOpenRouter=${arm('primary',0,new Error('invalid'))};callGemini=${arm('fallback',0,bankAnswer)};`);
let response=await clock.settle(box.opLook(lookBody,null,true));
assert.equal(response.status,200);
let settled=await hedgeOf(response);
assert.equal(settled.body.ko,'둑');
assert.equal(settled.body.provider,'gemini');
assert.equal(settled.body.lemma,'bank');
assert.equal(settled.body.pos,'');
assert.equal(settled.body.phrase,'');
assert.deepEqual(settled.body.alts,[]);
assert.deepEqual(Array.from(box.calls),['primary','fallback']);
assert.equal(box.prompts[0],box.prompts[1]);
assert.doesNotMatch(box.prompts[0],/Correction:/);
assert.equal(settled.hedge.hedged,true);
assert.equal(settled.hedge.winner,'gemini');
assert.equal(settled.hedge.loser,'failed');
// Invalid lexical members must never be silently relabeled as a word meaning.
run(`calls=[];callOpenRouter=${arm('primary',0,JSON.stringify({kind:'expression',canonical:'upset the apple cart',members:[1],ko:'계획을 망치다'}))};callGemini=callOpenRouter;`);
response=await clock.settle(box.opLook({word:'apple',clicked:'apple',sentence:'He upset the apple cart.',clickedIndex:3},null,true));
assert.equal(response.status,502);assert.equal((await response.json()).error,'lookup_failed');
assert.equal(box.calls.length,2);
const abort=new AbortController();abort.abort();box.calls=[];
await assert.rejects(()=>box.opLook({word:'apple',clicked:'apple',sentence:'An apple.',clickedIndex:1},null,true,abort.signal));
assert.equal(box.calls.length,0);
// DeepSeek returns inside the hedge delay, so Gemini never starts.
run(`calls=[];prompts=[];hedges=[];signals=[];callOpenRouter=${arm('primary',500,bankAnswer)};callGemini=${arm('fallback',0,bankAnswer)};`);
response=await clock.settle(box.opLook(lookBody,null,true));
settled=await hedgeOf(response);
assert.equal(settled.body.provider,'openrouter');
assert.deepEqual(Array.from(box.calls),['primary']);
assert.equal(settled.hedge.hedged,false);
assert.equal(settled.hedge.winner,'openrouter');
assert.equal(settled.hedge.loser,null);
assert.equal(providerBudgets.length,0,'word lookup used a per-provider timeout');
// DeepSeek is still running at 2s. Gemini wins and DeepSeek is aborted, not cancelled early.
run(`calls=[];prompts=[];hedges=[];signals=[];callOpenRouter=${arm('primary',5000,bankAnswer)};
callGemini=(key,ask)=>{calls.push('fallback');prompts.push(ask.prompt);hedges.push(ask.trace.hedge);signals.push(ask.signal);globalThis.primaryLive=!signals[0].aborted;return Promise.resolve({text:${JSON.stringify(bankAnswer)}});};`);
const hedgeStartedAt=clock.now();
response=await clock.settle(box.opLook(lookBody,null,true));
assert.equal(clock.now()-hedgeStartedAt,2000);
assert.equal(box.primaryLive,true,'hedging cancelled DeepSeek before Gemini started');
assert.equal(box.signals[0].aborted,true);
assert.equal(box.prompts[0],box.prompts[1]);
settled=await hedgeOf(response);
assert.equal(settled.body.provider,'gemini');
assert.deepEqual(Array.from(box.calls),['primary','fallback']);
assert.equal(settled.hedge.hedged,true);
assert.equal(settled.hedge.winner,'gemini');
assert.equal(settled.hedge.loser,'aborted');
// Gemini fails after the hedge; DeepSeek's later valid answer still wins.
run(`calls=[];hedges=[];signals=[];callOpenRouter=${arm('primary',4000,bankAnswer)};callGemini=${arm('fallback',0,new Error('gemini_503'))};`);
response=await clock.settle(box.opLook(lookBody,null,true));
assert.equal(box.signals[0].aborted,false,'a failed hedge aborted DeepSeek');
settled=await hedgeOf(response);
assert.equal(settled.body.provider,'openrouter');
assert.deepEqual(Array.from(box.calls),['primary','fallback']);
assert.equal(settled.hedge.hedged,true);
assert.equal(settled.hedge.winner,'openrouter');
assert.equal(settled.hedge.loser,'failed');
// A valid DeepSeek answer that arrives after Gemini already won is late, not a second response.
run(`calls=[];hedges=[];callOpenRouter=${arm('primary',3000,bankAnswer,{ignoreAbort:true})};callGemini=${arm('fallback',0,bankAnswer)};`);
response=await clock.settle(box.opLook(lookBody,null,true));
settled=await hedgeOf(response);
assert.equal(settled.body.provider,'gemini');
assert.equal(settled.hedge.winner,'gemini');
assert.equal(settled.hedge.loser,'late');
// Both providers fail inside the deadline.
run(`calls=[];hedges=[];callOpenRouter=${arm('primary',0,new Error('openrouter_down'))};callGemini=${arm('fallback',0,new Error('gemini_down'))};`);
response=await clock.settle(box.opLook(lookBody,null,true));
assert.equal(response.status,502);assert.equal((await response.json()).error,'lookup_failed');
await clock.advance(0);
await box.hedges.at(-1).settled;
assert.deepEqual(Array.from(box.calls),['primary','fallback']);
assert.equal(box.hedges.at(-1).hedged,true);
assert.equal(box.hedges.at(-1).winner,null);
assert.equal(box.hedges.at(-1).loser,'failed');
// Neither answer arrives. The single 8s deadline aborts both.
run(`calls=[];hedges=[];signals=[];callOpenRouter=${arm('primary',20000,bankAnswer)};callGemini=${arm('fallback',20000,bankAnswer)};`);
const deadlineStarted=clock.now();
response=await clock.settle(box.opLook(lookBody,null,true));
assert.equal(response.status,502);
assert.equal(clock.now()-deadlineStarted,8000);
assert.deepEqual(Array.from(box.calls),['primary','fallback']);
assert.equal(box.signals[0].aborted,true);
assert.equal(box.signals[1].aborted,true);
await box.hedges.at(-1).settled;
assert.equal(box.hedges.at(-1).hedged,true);
assert.equal(box.hedges.at(-1).winner,null);
assert.equal(box.hedges.at(-1).loser,'aborted');
assert.equal(providerBudgets.length,0,'word lookup introduced a per-provider timeout');
box.AbortSignal.timeout=realTimeout;
clock.restore();
// Sentence lookups keep the long provider cap and do not enter the word hedge.
run(`providerKeys=()=>({oKey:'fixture',gKey:''});callOpenRouter=async()=>({text:'{"ko":"번역"}'});`);
const sentenceBudgets=[];
box.AbortSignal.timeout=ms=>{sentenceBudgets.push(ms);return realTimeout(ms);};
await box.ask({action:'explain',prompt:'문장',maxTokens:600,schema:{type:'object'}});
assert.deepEqual(sentenceBudgets,[15000]);
box.AbortSignal.timeout=realTimeout;
console.log('Lookup contract, target alignment, hedged word lookup, cancellation and fail-closed checks passed');

// Sentence lookup generates only the translation while preserving quota/errors.
run(`globalThis.explainCalls=[];
takeQuota=async()=>({ok:true,left:8});
ask=async options=>{explainCalls.push(options);return {text:JSON.stringify({ko:'원문의 의미를 보존한 번역입니다.'}),provider:'fixture'}};`);
response=await box.opExplain({sentence:'A reader follows the meaning of the sentence.'},'fixture-user');
assert.deepEqual(await response.json(),{ko:'원문의 의미를 보존한 번역입니다.',provider:'fixture',left:8});
assert.deepEqual(Array.from(box.explainCalls[0].schema.required),['ko']);
assert.deepEqual(Object.keys(box.explainCalls[0].schema.properties),['ko']);
assert.equal(box.explainCalls[0].maxTokens,600);
assert.equal(box.explainCalls[0].validate,undefined);
assert.doesNotMatch(box.explainCalls[0].prompt,/points/);
assert.equal((await box.opExplain({sentence:'A complete sentence.'},null)).status,401);
assert.equal((await box.opExplain({sentence:'short'},'fixture-user')).status,400);
box.quotaDenied=true;
assert.equal((await box.opExplain({sentence:'A complete sentence.'},'fixture-user')).status,429);
assert.equal(box.explainCalls.length,1);
box.quotaDenied=false;run(`ask=async()=>({text:'{"ko":""}',provider:'fixture'});`);
await assert.rejects(()=>box.opExplain({sentence:'A complete sentence.'},'fixture-user'),/empty_answer/);
console.log('Sentence translation-only contract passed');
const purge=await box.handler(new Request('http://fixture',{method:'POST',headers:{authorization:'Bearer old-app','content-type':'application/json'},body:JSON.stringify({op:'purge_private_logs'})}));
assert.equal(purge.status,200);
assert.deepEqual(await purge.json(),{ok:true});
assert.deepEqual(box.touched,[]);
console.log('Retired purge op returns ok without a database call');
