import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const box={Response,AbortSignal,console,crypto,Deno:{env:{get:k=>k==='LIGHTNING_PREFETCH_ENABLED'?'true':''},serve(){}},
  createClient:()=>({}),newAiTrace:()=>({}),tokenUsage:()=>({input_tokens:100,output_tokens:200})};
vm.createContext(box);
const run=code=>vm.runInContext(ts.transpileModule(code.replace(/^import .*;$/gm,'').replace(/^export /gm,''),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,box);
for(const path of ['lookup.ts','prefetch.ts','index.ts'])run(readFileSync(new URL('../server/dict/'+path,import.meta.url),'utf8'));
const sentence='She gave the plan up.';
const input={version:1,sentences:[{sentence,tokens:['She','gave','the','plan','up'].map(text=>({text,cands:text==='gave'?['give']:[]}))}]};
const answer={sentences:[{units:[{kind:'expression',canonical:'give up',members:[1,4],ko:'포기하다'},
  {kind:'word',canonical:'plan',members:[3],ko:'계획'}]}]};
const parsed=box.prefetchInput(input);
assert.equal(parsed[0].sentence,sentence);
assert.equal(box.validatePrefetch(answer,parsed)[0].units[0].ko,'포기하다');
for(const bad of [{...input,version:0},{...input,sentences:[]},{...input,sentences:[...input.sentences,...input.sentences]},
  {version:1,sentences:[{sentence,tokens:[]}]}])assert.throws(()=>box.prefetchInput(bad));
assert.throws(()=>box.prefetchInput({version:1,sentences:[{sentence:'word '.repeat(49),tokens:Array.from({length:49},()=>({text:'word'}))}]}));
assert.throws(()=>box.validatePrefetch({sentences:[]},parsed));
for(const unit of [{kind:'expression',canonical:'give up',members:[1,4,99],ko:'포기하다'},
  {kind:'word',canonical:'invented',members:[3],ko:'틀림'},
  {kind:'expression',canonical:'give up',members:[1],ko:'포기하다'}])
  assert.throws(()=>box.validatePrefetch({sentences:[{units:[unit]}]},parsed));
assert.throws(()=>box.validatePrefetch({sentences:[{units:[...answer.sentences[0].units,{kind:'word',canonical:'up',members:[4],ko:'위'}]}]},parsed));
assert.equal(box.validatePrefetch({sentences:[{units:[]}]},parsed)[0].units.length,0,'empty/partial coverage is a cache miss, not guessed content');
run(`globalThis.costs=[];globalThis.asks=[];takeQuota=async(id,cost)=>{costs.push(cost);return {ok:true,left:99}};
 ask=async options=>{asks.push(options);return {text:${JSON.stringify(JSON.stringify(answer))},provider:'openrouter',usage:{}}};`);
assert.equal((await box.opPrefetch(input,null)).status,401);
assert.equal(box.costs.length,0);
box.Deno.env.get=()=>'';
assert.equal((await box.opPrefetch(input,'user')).status,503);assert.equal(box.costs.length,0);
box.Deno.env.get=()=> 'true';
assert.equal((await box.opPrefetch({...input,version:2},'user')).status,400);assert.equal(box.costs.length,0);
const good=await box.opPrefetch(input,'user');assert.equal(good.status,200);
const result=await good.json();assert.equal(result.sentences[0].units[0].ko,'포기하다');assert.equal(result.left,99);
assert.deepEqual([...box.costs],[1]);assert.equal(box.asks[0].prefetch,true);assert.equal(box.asks[0].maxTokens,3000);
run(`takeQuota=async()=>({ok:false,left:0,limit:300});`);
assert.equal((await box.opPrefetch(input,'user')).status,429);assert.equal(box.asks.length,1);
run(`takeQuota=async()=>({ok:true,left:98});ask=async()=>({text:'{}',provider:'openrouter'});`);
assert.equal((await box.opPrefetch(input,'user')).status,502);
const ctrl=new AbortController();ctrl.abort();
await assert.rejects(()=>box.opPrefetch(input,'user',ctrl.signal));
console.log('Lightning contract PASS: input bounds, expression alignment, partial coverage, overlap rejection, gate, auth, quota, invalid output, cancellation.');
