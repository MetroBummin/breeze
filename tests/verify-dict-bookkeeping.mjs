import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root=new URL('../',import.meta.url);
const jobs=[];
const calls=[];
const errors=[];
let debit=async()=>({data:{status:'replay',answer:{},left:0},error:null});
const box={
  Response,AbortSignal,crypto,TextEncoder,jobs,providerCalls:0,
  providerAnswer:{kind:'word',canonical:'patient',members:[0],ko:'참을성 있는'},
  remaining:10,quota:null,delayAuth:false,delayCheck:false,releaseAuth(){},releaseCheck(){},
  console:{log(){},error(...args){errors.push(args.map(String).join(' '));}},
  EdgeRuntime:{waitUntil(task){jobs.push(task);}},
  Deno:{env:{get:()=>''},serve(fn){box.handler=fn;}},
  createClient:()=>({
    auth:{getUser:()=>box.delayAuth?new Promise(resolve=>{box.releaseAuth=()=>resolve({data:{user:{id:'user-1'}}});}):Promise.resolve({data:{user:{id:'user-1'}}})},
    rpc:async(name,args)=>{
      calls.push({name,args:structuredClone(args)});
      if(!args.p_answer){
        if(box.delayCheck)await new Promise(resolve=>{box.releaseCheck=resolve;});
        if(box.quota==='denied')return {data:{status:'quota_exceeded',left:0,limit:3000},error:null};
        return {data:{status:'ok',left:box.remaining,limit:3000},error:null};
      }
      return debit(name,args);
    }
  }),
  newAiTrace:()=>({})
};
vm.createContext(box);
const run=code=>vm.runInContext(ts.transpileModule(code.replace(/^import .*;$/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,box);
for(const file of ['server/dict/logical-lookup.ts','server/dict/lookup.ts','server/dict/index.ts'])run(readFileSync(new URL(file,root),'utf8'));
run(`providerKeys=()=>({oKey:'fixture',gKey:''});
callOpenRouter=async()=>{providerCalls++;return {text:JSON.stringify(providerAnswer)};};
callGemini=async()=>{throw new Error('gemini_unused');};`);

const look=()=>({op:'look_v2',lookupId:crypto.randomUUID(),word:'patient',clicked:'patient',sentence:'patient reader',clickedIndex:0,cands:['patient']});
function reset(){calls.length=0;jobs.length=0;errors.length=0;box.quota=null;box.delayAuth=false;box.delayCheck=false;box.remaining=10;}

box.delayCheck=true;
const blocked=box.opLook(look(),'user-1');
assert.equal(await Promise.race([blocked.then(()=>'response'),new Promise(resolve=>setTimeout(()=>resolve('waiting'),40))]),'waiting','quota check ran after the response');
box.delayCheck=false;box.releaseCheck();
assert.equal((await blocked).status,200);

reset();
let releaseDebit;
debit=()=>new Promise(resolve=>{releaseDebit=()=>resolve({data:{status:'replay',answer:box.providerAnswer,left:9},error:null});});
const fresh=look();
const pending=box.opLook(fresh,'user-1');
assert.equal(await Promise.race([pending.then(()=>'response'),new Promise(resolve=>setTimeout(()=>resolve('blocked'),50))]),'response','lookup waited on the success debit');
const response=await pending;
assert.equal(response.status,200);
const body=await response.json();
assert.equal(body.ko,'참을성 있는');assert.equal(body.lemma,'patient');assert.equal(body.canonical,'patient');
assert.equal(body.left,9);assert.equal(body.lookupId,fresh.lookupId);assert.equal(body.provider,'openrouter');
const saved=calls.filter(call=>call.args.p_answer);
assert.equal(saved.length,1);assert.equal(saved[0].name,'word_lookup_receipt');
assert.equal(saved[0].args.p_user,'user-1');assert.equal(saved[0].args.p_request,fresh.lookupId);
assert.equal(saved[0].args.p_fingerprint.length,64);
assert.deepEqual(saved[0].args.p_answer,{kind:'word',canonical:'patient',members:[0],ko:'참을성 있는',lemma:'patient',pos:'',phrase:'',alts:[],provider:'openrouter'});
assert.equal(calls[0].args.p_answer,null);assert.equal(jobs.length,1);
releaseDebit();await jobs[0];assert.deepEqual(errors,[]);

reset();
const failedId=crypto.randomUUID();
debit=async()=>({data:null,error:{message:'db down'}});
const failed=await box.opLook({...look(),lookupId:failedId},'user-1');
assert.equal(failed.status,200);assert.equal((await failed.json()).ko,'참을성 있는');
await Promise.all(jobs);
assert.equal(errors.length,1);assert.match(errors[0],new RegExp(`^lookup_receipt_failed \\{"request_id":"${failedId}","code":"quota_unavailable"\\}$`));
assert.equal(errors[0].includes('\n'),false);

reset();
debit=async()=>({data:{status:'quota_exceeded',left:0,limit:3000},error:null});
const slipped=await box.opLook(look(),'user-1');
assert.equal(slipped.status,200);assert.equal((await slipped.json()).left,9);
await Promise.all(jobs);
assert.match(errors[0],/"status":"quota_exceeded"/);

reset();
const beforeProvider=box.providerCalls;
box.quota='denied';
const denied=await box.opLook(look(),'user-1');
assert.equal(denied.status,429);assert.equal((await denied.json()).error,'quota_exceeded');
assert.equal(box.providerCalls,beforeProvider);assert.equal(calls.length,1);assert.equal(calls[0].args.p_answer,null);assert.equal(jobs.length,0);

reset();
run(`callOpenRouter=async()=>{providerCalls++;throw new Error('fixture_timeout');};`);
const broken=await box.opLook(look(),'user-1');
assert.equal(broken.status,502);assert.equal(calls.filter(call=>call.args.p_answer).length,0);assert.equal(jobs.length,0);

reset();
box.remaining=10;
run(`callOpenRouter=async()=>{providerCalls++;return {text:JSON.stringify({ko:'자연스러운 번역'})};};`);
let releaseSentence;
debit=(name,args)=>new Promise(resolve=>{releaseSentence=()=>resolve({data:{status:'replay',answer:args.p_answer,left:8},error:null});});
const sentenceId=crypto.randomUUID();
const sentencePending=box.opExplain({lookupId:sentenceId,sentence:'A reader follows the meaning of the sentence.'},'user-1');
assert.equal(await Promise.race([sentencePending.then(()=>'response'),new Promise(resolve=>setTimeout(()=>resolve('blocked'),50))]),'response','sentence lookup waited on the success debit');
const sentence=await sentencePending;
assert.equal(sentence.status,200);
assert.deepEqual(await sentence.json(),{ko:'자연스러운 번역',provider:'openrouter',left:8});
assert.equal(calls.at(-1).name,'sentence_lookup_receipt');
assert.deepEqual(calls.at(-1).args.p_answer,{ko:'자연스러운 번역',provider:'openrouter'});
releaseSentence();await Promise.all(jobs);

reset();
box.delayAuth=true;
debit=async(_name,args)=>({data:{status:'replay',answer:args.p_answer,left:9},error:null});
run(`callOpenRouter=async()=>{providerCalls++;return {text:JSON.stringify(providerAnswer)};};`);
const authed=box.handler(new Request('http://fixture',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify(look())}));
assert.equal(await Promise.race([authed.then(()=>'response'),new Promise(resolve=>setTimeout(()=>resolve('waiting'),40))]),'waiting','auth ran after the response');
box.releaseAuth();
assert.equal((await authed).status,200);

console.log('dictionary bookkeeping stays off the lookup response');
