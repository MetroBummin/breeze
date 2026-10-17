import assert from 'node:assert/strict';

let releasePersist;
let backgroundTask;
globalThis.EdgeRuntime={waitUntil(task){backgroundTask=task;}};
globalThis.fetch=async()=>new Response(JSON.stringify({usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5}}),{status:200});

const {meteredFetch,newAiTrace}=await import('../server/dict/telemetry.ts');
const client={rpc(){return{abortSignal(){return new Promise(resolve=>{releasePersist=()=>resolve({data:'metric-id',error:null});});}};}};
const responsePromise=meteredFetch(client,newAiTrace('look'),'openrouter','deepseek/deepseek-v4-flash-0731','https://provider.test',{});
const winner=await Promise.race([responsePromise.then(()=> 'response'),new Promise(resolve=>setTimeout(()=>resolve('blocked'),50))]);
assert.equal(winner,'response','telemetry persistence still blocks the provider response');
assert.ok(backgroundTask,'telemetry was not registered as an Edge background task');
for(let i=0;i<20&&!releasePersist;i++)await new Promise(resolve=>setTimeout(resolve,5));
assert.equal(typeof releasePersist,'function','telemetry persistence did not start in the background');
releasePersist();
await backgroundTask;

async function outcomeFor(fail){
  let recorded;
  const recording={rpc(_name,args){recorded=args;return{abortSignal(){return Promise.resolve({data:'metric-id',error:null});}};}};
  globalThis.fetch=async()=>{throw fail();};
  await assert.rejects(()=>meteredFetch(recording,newAiTrace('look'),'openrouter','deepseek/deepseek-v4-flash-0731','https://provider.test',{}));
  await backgroundTask;
  return recorded.p_outcome;
}
const timeout=new Error('The operation was aborted due to timeout');timeout.name='TimeoutError';
assert.equal(await outcomeFor(()=>timeout),'timeout');
assert.equal(await outcomeFor(()=>new TypeError('fetch failed')),'network_error');
async function outcomeForBody(stream,init){
  let recorded;
  const recording={rpc(_name,args){recorded=args;return{abortSignal(){return Promise.resolve({data:'metric-id',error:null});}};}};
  globalThis.fetch=async()=>new Response(stream(),{status:200,headers:{'content-type':'application/json'}});
  const response=await meteredFetch(recording,newAiTrace('look'),'openrouter','deepseek/deepseek-v4-flash-0731','https://provider.test',init);
  await assert.rejects(()=>response.json());
  await backgroundTask;
  return recorded.p_outcome;
}
const abortedBody=()=>new ReadableStream({start(controller){controller.error(Object.assign(new Error('aborted'),{name:'AbortError'}));}});
assert.equal(await outcomeForBody(abortedBody,{signal:AbortSignal.abort()}),'timeout');
assert.equal(await outcomeForBody(()=>new ReadableStream({start(controller){controller.error(new SyntaxError('bad json'));}}),{}),'api_ok');

console.log('Dictionary telemetry persists behind the provider response');
