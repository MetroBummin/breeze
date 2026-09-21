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

console.log('Dictionary telemetry persists behind the provider response');
