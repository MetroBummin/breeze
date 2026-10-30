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

const hedgeTrace=newAiTrace('look');
let releaseHedge;
hedgeTrace.hedge={settled:new Promise(resolve=>{releaseHedge=resolve;}),hedged:false,winner:null,loser:null};
let hedgedArgs;
const hedgedClient={rpc(_name,args){hedgedArgs=args;return{abortSignal(){return Promise.resolve({data:'metric-id',error:null});}};}};
globalThis.fetch=async()=>new Response(JSON.stringify({usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5}}),{status:200});
const hedgedResponse=meteredFetch(hedgedClient,hedgeTrace,'openrouter','deepseek/deepseek-v4-flash-0731','https://provider.test',{});
const hedgedWinner=await Promise.race([hedgedResponse.then(()=>'response'),new Promise(resolve=>setTimeout(()=>resolve('blocked'),50))]);
assert.equal(hedgedWinner,'response','hedge telemetry blocked the provider response');
assert.equal(hedgedArgs,undefined,'hedge fields were written before the race settled');
hedgeTrace.hedge.hedged=true;hedgeTrace.hedge.winner='gemini';hedgeTrace.hedge.loser='aborted';
releaseHedge();
await backgroundTask;
assert.equal(hedgedArgs.p_outcome,'api_ok');
assert.equal(hedgedArgs.p_usage.input_tokens,3);
assert.equal(hedgedArgs.p_usage.output_tokens,2);
assert.equal(hedgedArgs.p_usage.hedged,true);
assert.equal(hedgedArgs.p_usage.winner,'gemini');
assert.equal(hedgedArgs.p_usage.loser,'aborted');

let failureArgs;
const failureClient={rpc(_name,args){failureArgs=args;return{abortSignal(){return Promise.resolve({data:'metric-id',error:null});}};}};
const failureTrace=newAiTrace('look');
failureTrace.hedge={settled:Promise.resolve(),hedged:true,winner:null,loser:'failed'};
globalThis.fetch=async()=>{throw new TypeError('fetch failed');};
await assert.rejects(()=>meteredFetch(failureClient,failureTrace,'gemini','gemini-3.5-flash-lite','https://provider.test',{}));
await backgroundTask;
assert.equal(failureArgs.p_outcome,'network_error');
assert.equal(failureArgs.p_usage.hedged,true);
assert.equal(failureArgs.p_usage.winner,null);
assert.equal(failureArgs.p_usage.loser,'failed');
assert.equal(failureArgs.p_usage.input_tokens,undefined);

const plain=newAiTrace('explain');
let plainArgs;
const plainClient={rpc(_name,args){plainArgs=args;return{abortSignal(){return Promise.resolve({data:'metric-id',error:null});}};}};
globalThis.fetch=async()=>new Response(JSON.stringify({usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}),{status:200});
await meteredFetch(plainClient,plain,'openrouter','deepseek/deepseek-v4-flash-0731','https://provider.test',{});
await backgroundTask;
assert.equal(plainArgs.p_usage.hedged,undefined,'sentence telemetry gained hedge fields');
assert.equal(plainArgs.p_usage.reject_reason,undefined,'sentence telemetry gained a reject reason');
assert.equal(plainArgs.p_usage.downgraded,undefined,'sentence telemetry gained a downgrade flag');
assert.equal(plainArgs.p_usage.input_tokens,1);
const noted=newAiTrace('look');
let releaseNoted;
noted.hedge={settled:new Promise(resolve=>{releaseNoted=resolve;}),hedged:true,winner:'openrouter',loser:'failed'};
noted.providerNotes={openrouter:{rejectReason:'missing_fixed_word',downgraded:true},gemini:{rejectReason:'parse_failed'}};
let notedArgs;
const notedClient={rpc(_name,args){notedArgs=args;return{abortSignal(){return Promise.resolve({data:'metric-id',error:null});}};}};
globalThis.fetch=async()=>new Response(JSON.stringify({usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5}}),{status:200});
await meteredFetch(notedClient,noted,'openrouter','deepseek/deepseek-v4-flash-0731','https://provider.test',{});
assert.equal(notedArgs,undefined,'reject telemetry was written before the race settled');
releaseNoted();
await backgroundTask;
assert.equal(notedArgs.p_usage.reject_reason,'missing_fixed_word');
assert.equal(notedArgs.p_usage.downgraded,true);
assert.equal(notedArgs.p_usage.winner,'openrouter');
assert.equal(notedArgs.p_usage.input_tokens,3);

const {PGlite}=await import('@electric-sql/pglite');
const {readFileSync}=await import('node:fs');
const db=new PGlite();
await db.exec(`create table public.dict_events (
  id bigserial primary key,
  user_id uuid,
  at timestamptz not null default now(),
  action text not null,
  word text not null default '',
  provider text,
  meta jsonb not null default '{}'::jsonb
);
create unique index dict_events_telemetry_request_attempt
  on public.dict_events ((meta->>'request_id'), (meta->>'attempt'))
  where meta->>'telemetry_version' = '2';`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261021120000_dict_lookup_hedge_meta.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261021193000_dict_lookup_reject_meta.sql',import.meta.url),'utf8'));
const request='11111111-1111-4111-8111-111111111111';
const usage={input_tokens:3,output_tokens:2,thinking_tokens:0,total_tokens:5,cached_input_tokens:0,cache_creation_input_tokens:0,tool_input_tokens:0,hedged:true,winner:'openrouter',loser:'failed'};
const stored=await db.query(`select public.record_dict_ai_usage($1,1,'look','openrouter','deepseek/deepseek-v4-flash-0731',200,1200,'api_ok',$2::jsonb) as id`,[request,JSON.stringify(usage)]);
assert.equal(Number(stored.rows[0].id)>0,true);
const row=(await db.query(`select meta from public.dict_events where id=$1`,[stored.rows[0].id])).rows[0].meta;
assert.equal(row.telemetry_version,2);
assert.equal(row.outcome,'api_ok');
assert.equal(row.usage_available,true);
assert.equal(row.hedged,true);
assert.equal(row.winner,'openrouter');
assert.equal(row.loser,'failed');
assert.equal(row.ai_usage.input_tokens,3);
assert.equal(row.ai_usage.hedged,undefined);
const sentence=await db.query(`select public.record_dict_ai_usage($1,1,'explain','openrouter','deepseek/deepseek-v4-flash-0731',200,400,'api_ok',$2::jsonb) as id`,['22222222-2222-4222-8222-222222222222',JSON.stringify({input_tokens:4,output_tokens:1,thinking_tokens:0,total_tokens:5,cached_input_tokens:0,cache_creation_input_tokens:0,tool_input_tokens:0})]);
const sentenceMeta=(await db.query(`select meta from public.dict_events where id=$1`,[sentence.rows[0].id])).rows[0].meta;
assert.equal(Object.hasOwn(sentenceMeta,'hedged'),false);
assert.equal(sentenceMeta.usage_available,true);
assert.equal(sentenceMeta.ai_usage.input_tokens,4);
const failed=await db.query(`select public.record_dict_ai_usage($1,2,'look','gemini','gemini-3.5-flash-lite',null,8000,'timeout',$2::jsonb) as id`,[request,JSON.stringify({hedged:true,winner:null,loser:'aborted'})]);
const failedMeta=(await db.query(`select meta from public.dict_events where id=$1`,[failed.rows[0].id])).rows[0].meta;
assert.equal(failedMeta.usage_available,false);
assert.equal(failedMeta.ai_usage,null);
assert.equal(failedMeta.hedged,true);
assert.equal(failedMeta.winner,null);
assert.equal(failedMeta.loser,'aborted');
await assert.rejects(db.query(`select public.record_dict_ai_usage($1,3,'look','gemini','gemini-3.5-flash-lite',null,10,'timeout',$2::jsonb)`,[request,JSON.stringify({hedged:true,winner:'openrouter',loser:'dropped'})]));
const downgraded=await db.query(`select public.record_dict_ai_usage($1,4,'look','openrouter','deepseek/deepseek-v4-flash-0731',200,900,'api_ok',$2::jsonb) as id`,[request,JSON.stringify({input_tokens:3,output_tokens:2,thinking_tokens:0,total_tokens:5,cached_input_tokens:0,cache_creation_input_tokens:0,tool_input_tokens:0,hedged:true,winner:'openrouter',loser:'failed',reject_reason:'invalid_member_count',downgraded:true})]);
const downgradedMeta=(await db.query(`select meta from public.dict_events where id=$1`,[downgraded.rows[0].id])).rows[0].meta;
assert.equal(downgradedMeta.reject_reason,'invalid_member_count');
assert.equal(downgradedMeta.downgraded,true);
assert.equal(downgradedMeta.hedged,true);
assert.equal(downgradedMeta.ai_usage.input_tokens,3);
assert.equal(downgradedMeta.ai_usage.reject_reason,undefined);
assert.equal(downgradedMeta.ai_usage.downgraded,undefined);
assert.equal(Object.hasOwn(sentenceMeta,'reject_reason'),false);
assert.equal(Object.hasOwn(sentenceMeta,'downgraded'),false);
await assert.rejects(db.query(`select public.record_dict_ai_usage($1,5,'look','gemini','gemini-3.5-flash-lite',200,10,'api_ok',$2::jsonb)`,[request,JSON.stringify({reject_reason:'Not a code',downgraded:true})]));
await assert.rejects(db.query(`select public.record_dict_ai_usage($1,5,'look','gemini','gemini-3.5-flash-lite',200,10,'api_ok',$2::jsonb)`,[request,JSON.stringify({reject_reason:'invalid_members',downgraded:false})]));

// Lookup-level rows (telemetry_version 3): one per word or sentence lookup.
await db.exec(`create schema auth;create table auth.users(id uuid primary key);
  insert into auth.users values ('44444444-4444-4444-8444-444444444444');
  create role service_role;create role anon;create role authenticated;
  grant usage on schema public to service_role,anon,authenticated;`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261030150100_dict_lookup_rows.sql',import.meta.url),'utf8'));
const reader='44444444-4444-4444-8444-444444444444';
const lookupCall=(id,userId,type,action,outcome,provider,ms)=>db.query(`select public.record_dict_lookup($1,$2,$3,$4,$5,$6,$7) as id`,[id,userId,type,action,outcome,provider,ms]);
await db.exec('set role service_role');
const wordLookup='66666666-6666-4666-8666-666666666666';
assert.ok(Number((await lookupCall(wordLookup,reader,'word','look','failed',null,8000)).rows[0].id)>0);
// The same logical lookup retried with its lookupId updates its one row.
const again=await lookupCall(wordLookup,reader,'word','look','ok','gemini',1900);
await lookupCall('77777777-7777-4777-8777-777777777777',null,'sentence','explain','ok','openrouter',2400);
// An unknown account is stored as anonymous instead of failing the FK.
await lookupCall('88888888-8888-4888-8888-888888888888','99999999-9999-4999-8999-999999999999','word','retry','replay',null,30);
// Another account cannot take over a row by reusing the lookupId.
assert.equal((await lookupCall(wordLookup,null,'word','look','failed',null,1)).rows[0].id,null);
await db.exec('reset role');
const lookups=(await db.query(`select id,user_id,action,provider,lookup_type,word,meta from public.dict_events where meta->>'telemetry_version'='3' order by id`)).rows;
assert.equal(lookups.length,3);
assert.equal(lookups[0].id,again.rows[0].id);
assert.deepEqual(lookups.map(r=>[r.lookup_type,r.action,r.provider,r.meta.outcome,r.word]),[
  ['word','look','gemini','ok',''],['sentence','explain','openrouter','ok',''],['word','retry',null,'replay','']]);
assert.equal(lookups[0].user_id,reader);
assert.equal(lookups[0].meta.signed_in,true);
assert.equal(lookups[0].meta.duration_ms,1900);
assert.equal(lookups[2].user_id,null);
assert.deepEqual(Object.keys(lookups[1].meta).sort(),['duration_ms','lookup_type','outcome','request_id','signed_in','telemetry_version']);
const split=(await db.query(`select lookup_type,count(*)::int as n from public.dict_events where lookup_type is not null group by 1 order by 1`)).rows;
assert.deepEqual(split.map(r=>[r.lookup_type,r.n]),[['sentence',1],['word',2]]);
for(const bad of [['word','explain','ok'],['sentence','look','ok'],['word','look','weird'],['phrase','look','ok']]){
  await assert.rejects(lookupCall(crypto.randomUUID(),null,bad[0],bad[1],bad[2],null,1),/invalid lookup fields/,bad.join());
}
await assert.rejects(lookupCall(crypto.randomUUID(),null,'word','look','ok','claude',1),/invalid lookup fields/);
for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(lookupCall(crypto.randomUUID(),null,'word','look','ok',null,1),/permission denied/);
  await db.exec('reset role');
}
// The provider-attempt rows from above are untouched by the new column.
assert.equal((await db.query(`select count(*)::int as n from public.dict_events where meta->>'telemetry_version'='2' and lookup_type is null`)).rows[0].n,4);

// The edge helper sends exactly the RPC arguments the function accepts.
const {recordLookup,lookupOutcome}=await import('../server/dict/telemetry.ts');
let lookupArgs,lookupName;
const lookupClient={rpc(name,args){lookupName=name;lookupArgs=args;return{abortSignal(){return db.query(`select public.record_dict_lookup($1,$2,$3,$4,$5,$6,$7) as id`,[args.p_request_id,args.p_user,args.p_lookup_type,args.p_action,args.p_outcome,args.p_provider,args.p_duration_ms]).then(r=>({data:r.rows[0].id,error:null}),error=>({data:null,error:{code:error.code,message:error.message}}));}};}};
recordLookup(lookupClient,{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userId:reader,type:'sentence',action:'explain',outcome:lookupOutcome('replay'),provider:'fixture',durationMs:12.6});
await backgroundTask;
assert.equal(lookupName,'record_dict_lookup');
assert.equal(lookupArgs.p_provider,null);
assert.equal(lookupArgs.p_duration_ms,13);
assert.equal(lookupOutcome('something_new'),'failed');
assert.equal((await db.query(`select lookup_type from public.dict_events where meta->>'request_id'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`)).rows[0].lookup_type,'sentence');
const logged=[];const realError=console.error;console.error=(...args)=>logged.push(args.join(' '));
recordLookup(lookupClient,{requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',userId:null,type:'word',action:'explain',outcome:'ok',provider:null,durationMs:1});
await backgroundTask;
console.error=realError;
assert.equal(logged.length,1);
assert.match(logged[0],/lookup_metric_write_failed.*22023.*invalid lookup fields/);
await db.close();

console.log('Dictionary telemetry persists behind the provider response');
