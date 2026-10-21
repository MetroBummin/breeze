#!/usr/bin/env node
// Local stress harness for hedged word lookup.
//
// Drives the real server/dict word path (opLook -> askHedgedWord -> meteredFetch)
// against in-process mocked DeepSeek and Gemini HTTP servers. Latency and faults
// are injected here. There are no production calls and no real provider calls.
//
// A full run uses the real 8s deadline, so hang scenarios take minutes. It is not
// part of npm test.
//
//   node server/dict/test/hedge-stress.mjs
//   node server/dict/test/hedge-stress.mjs --fast
//   node server/dict/test/hedge-stress.mjs --lookups 500 --concurrency 20
//   node server/dict/test/hedge-stress.mjs --scenario healthy

import http from 'node:http';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const DEADLINE_MS=8000;
// setTimeout under a 20-wide load can fire a few hundred milliseconds late.
// Anything past this slack means the lookup kept running after the deadline.
const DEADLINE_SLACK_MS=400;
const WATCHDOG_MS=12000;
const SENTENCE='The bank flooded.';
const ANSWER_TEXT=JSON.stringify({kind:'word',canonical:'bank',members:[1],ko:'둑'});
const INVALID_TEXT=JSON.stringify({kind:'expression',canonical:'upset the apple cart',members:[1],ko:'계획을 망치다'});

const args=process.argv.slice(2);
const flag=(name,fallback)=>{
  const index=args.indexOf(name);
  if(index<0)return fallback;
  const value=args[index+1];
  if(value===undefined||value.startsWith('--'))return true;
  return value;
};
const fast=args.includes('--fast');
const lookups=Number(flag('--lookups',fast?40:500));
const concurrency=Number(flag('--concurrency',fast?8:20));
const only=flag('--scenario',null);
const seed=Number(flag('--seed',20261021));
if(!Number.isInteger(lookups)||lookups<1||!Number.isInteger(concurrency)||concurrency<1){
  throw new Error('lookups and concurrency must be positive integers');
}

function mulberry32(seedValue){
  let state=seedValue>>>0;
  return ()=>{
    state=state+0x6D2B79F5|0;
    let t=Math.imul(state^state>>>15,1|state);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function boxMuller(rng){
  const u=Math.max(rng(),Number.EPSILON);
  const v=rng();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function lognormal(rng,median,tail,tailRank){
  const z=tailRank===95?1.6448536269514722:1.2815515655446004;
  const mu=Math.log(median);
  const sigma=(Math.log(tail)-mu)/z;
  return ()=>Math.max(1,Math.exp(mu+sigma*boxMuller(rng)));
}
function quantile(sorted,p){
  if(!sorted.length)return 0;
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil(p/100*sorted.length)-1));
  return sorted[index];
}
function checkSampler(label,draw,median,tail,tailRank){
  const sample=Array.from({length:20000},draw).sort((a,b)=>a-b);
  const mid=quantile(sample,50);
  const hi=quantile(sample,tailRank);
  const midOk=Math.abs(mid-median)/median<=0.08;
  const hiOk=Math.abs(hi-tail)/tail<=0.08;
  if(!midOk||!hiOk)throw new Error(`${label} sampler drifted: p50 ${Math.round(mid)} target ${median}, p${tailRank} ${Math.round(hi)} target ${tail}`);
  return `${label} p50 ${Math.round(mid)} p${tailRank} ${Math.round(hi)}`;
}

const samplerRng=mulberry32(seed+1);
const deepseekHealthy=lognormal(samplerRng,1100,2100,90);
const geminiHealthy=lognormal(samplerRng,900,1600,95);
const samplerReport=[
  checkSampler('DeepSeek healthy',deepseekHealthy,1100,2100,90),
  checkSampler('Gemini healthy',geminiHealthy,900,1600,95),
].join('; ');

function openrouterBody(text){
  return JSON.stringify({choices:[{message:{content:text}}],usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}});
}
function geminiBody(text){
  return JSON.stringify({candidates:[{content:{parts:[{text}]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:8,totalTokenCount:20}});
}
function validBody(provider){return provider==='deepseek'?openrouterBody(ANSWER_TEXT):geminiBody(ANSWER_TEXT)}
function respond(provider,delayMs,body=validBody(provider),status=200){
  return {mode:'respond',status,delayMs,body};
}
function hang(){return {mode:'hang'}}
function stallBody(headerMs){return {mode:'stall-body',headerMs}}

function scenarioPlan(name,rng){
  const ds=lognormal(rng,1100,2100,90);
  const gem=lognormal(rng,900,1600,95);
  if(name==='healthy')return {deepseek:respond('deepseek',ds()),gemini:respond('gemini',gem())};
  if(name==='degraded'){
    const latency=lognormal(rng,3100,5900,90)();
    const fault=rng();
    const deepseek=fault<0.085?hang():fault<0.17?respond('deepseek',latency,'{"error":"injected"}',500):respond('deepseek',latency);
    return {deepseek,gemini:respond('gemini',gem())};
  }
  if(name==='deepseek-body-stall')return {deepseek:stallBody(lognormal(rng,180,400,90)()),gemini:respond('gemini',gem())};
  if(name==='deepseek-hang')return {deepseek:hang(),gemini:respond('gemini',gem())};
  if(name==='gemini-hang')return {deepseek:respond('deepseek',ds()),gemini:hang()};
  if(name==='both-slow'){
    const slowDs=lognormal(rng,5000,9000,90)();
    const slowGem=lognormal(rng,4500,8500,90)();
    return {deepseek:respond('deepseek',slowDs),gemini:respond('gemini',slowGem)};
  }
  if(name==='both-fail'){
    const fail=lognormal(rng,40,120,90);
    return {deepseek:respond('deepseek',fail(),'{"error":"down"}',500),gemini:respond('gemini',fail(),'{"error":"down"}',500)};
  }
  if(name==='random-http-errors'){
    const faultLatency=lognormal(rng,250,900,90);
    const one=provider=>{
      const roll=rng();
      if(roll<0.20)return respond(provider,faultLatency(),'{"error":"rate"}',429);
      if(roll<0.35)return respond(provider,faultLatency(),'{"error":"down"}',500);
      return respond(provider,provider==='deepseek'?ds():gem());
    };
    return {deepseek:one('deepseek'),gemini:one('gemini')};
  }
  if(name==='malformed-invalid'){
    const one=provider=>{
      const bad=rng()<0.5;
      const text=bad?'not-json':INVALID_TEXT;
      const body=provider==='deepseek'?openrouterBody(text):geminiBody(text);
      if(bad&&rng()<0.5)return respond(provider,provider==='deepseek'?ds():gem(),'{',200);
      return respond(provider,provider==='deepseek'?ds():gem(),body,200);
    };
    return {deepseek:one('deepseek'),gemini:one('gemini')};
  }
  throw new Error('unknown scenario '+name);
}

const SCENARIOS=[
  ['healthy','DeepSeek p50 1.1s p90 2.1s; Gemini p50 0.9s p95 1.6s; both valid'],
  ['degraded','DeepSeek p50 3.1s p90 5.9s, plus 8.5% hang and 8.5% HTTP 500; Gemini healthy'],
  ['deepseek-body-stall','DeepSeek sends HTTP 200 headers then never sends the body; Gemini healthy'],
  ['deepseek-hang','DeepSeek accepts the request and never answers; Gemini healthy'],
  ['gemini-hang','DeepSeek healthy; Gemini never answers if the hedge starts'],
  ['both-slow','DeepSeek p50 5.0s p90 9.0s; Gemini p50 4.5s p90 8.5s; both valid'],
  ['both-fail','Both return HTTP 500 after a few tens of milliseconds'],
  ['random-http-errors','Each provider independently returns 429 (20%) or 500 (15%), otherwise healthy'],
  ['malformed-invalid','Each provider returns broken JSON or a lexical answer that fails validation'],
];

function waitFor(ms,req){
  if(req.aborted)return Promise.resolve('aborted');
  if(ms<=0)return Promise.resolve('ok');
  return new Promise(resolve=>{
    const timer=setTimeout(done,ms,'ok');
    const stop=()=>done('aborted');
    function done(result){
      clearTimeout(timer);
      req.off('aborted',stop);
      resolve(result);
    }
    req.on('aborted',stop);
  });
}
function untilAbort(req){
  return new Promise(resolve=>{
    if(req.aborted){resolve();return}
    req.once('aborted',resolve);
  });
}

const plans=new Map();
const openRequests=new Set();
const server=http.createServer(async(req,res)=>{
  const provider=(req.url||'').split('?')[0].replace(/^\//,'');
  const chunks=[];
  for await(const chunk of req)chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString('utf8');
  const id=(raw.match(/sim:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)||[])[1];
  const plan=id?plans.get(id)?.[provider]:null;
  const ticket={id,provider};
  openRequests.add(ticket);
  let closed=false;
  const finish=()=>{if(closed)return;closed=true;openRequests.delete(ticket);};
  req.on('aborted',finish);
  res.on('close',finish);
  try{
    if(!plan){res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"missing plan"}');return}
    if(plan.mode==='hang'){await untilAbort(req);return}
    if(await waitFor(plan.mode==='stall-body'?plan.headerMs:plan.delayMs,req)==='aborted'||req.aborted)return;
    if(plan.mode==='stall-body'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.flushHeaders();
      await untilAbort(req);
      res.destroy();
      return;
    }
    if(req.aborted)return;
    res.writeHead(plan.status,{'content-type':'application/json','content-length':Buffer.byteLength(plan.body)});
    res.end(plan.body);
  }finally{
    finish();
  }
});
server.requestTimeout=0;
server.headersTimeout=0;
server.timeout=0;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();

const pendingTimers=new Set();
const backgroundTasks=[];
const receiptLog=[];
const telemetryLog=[];
const unhandled=[];
process.on('unhandledRejection',error=>{unhandled.push(error instanceof Error?error:new Error(String(error)));});

function handleRpc(name,args){
  if(name==='word_lookup_receipt'){
    const phase=args.p_answer?'debit':'check';
    receiptLog.push({id:args.p_request,phase});
    if(phase==='debit')return {data:{status:'replay',answer:args.p_answer,left:8},error:null};
    return {data:{status:'ok'},error:null};
  }
  if(name==='record_dict_ai_usage'){
    telemetryLog.push({requestId:args.p_request_id,attempt:args.p_attempt,usage:args.p_usage,outcome:args.p_outcome});
    return {data:'metric',error:null};
  }
  return {data:null,error:{message:'unexpected rpc '+name,code:'unexpected'}};
}

const root=new URL('../../../',import.meta.url);
const box={
  Response,AbortSignal,AbortController,TextEncoder,URL,crypto,console:{log(){},error(){},warn(){},info(){}},
  setTimeout(fn,ms,...rest){
    const id=setTimeout(()=>{pendingTimers.delete(id);fn(...rest);},ms);
    pendingTimers.add(id);
    return id;
  },
  clearTimeout(id){pendingTimers.delete(id);clearTimeout(id);},
  fetch(url,init={}){
    const href=String(url);
    const provider=href.includes('openrouter.ai')?'deepseek':href.includes('generativelanguage.googleapis.com')?'gemini':null;
    if(!provider)return Promise.reject(new Error('unexpected provider url'));
    return fetch(`http://127.0.0.1:${port}/${provider}`,init);
  },
  Deno:{
    env:{get(key){return ({
      SUPABASE_URL:'http://127.0.0.1',
      SUPABASE_SERVICE_ROLE_KEY:'fixture',
      OPENROUTER_API_KEY:'fixture',
      GEMINI_API_KEY:'fixture',
    })[key];}},
    serve(){},
  },
  createClient:()=>({
    rpc(name,args){
      const promise=Promise.resolve(handleRpc(name,args));
      promise.abortSignal=()=>promise;
      return promise;
    },
    auth:{async getUser(){return {data:{user:null}}}},
  }),
  EdgeRuntime:{waitUntil(task){backgroundTasks.push(Promise.resolve(task));}},
};
vm.createContext(box);
const load=file=>vm.runInContext(ts.transpileModule(readFileSync(new URL(file,root),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,box);
load('server/dict/logical-lookup.ts');
load('server/dict/lookup.ts');
load('server/dict/telemetry.ts');
load('server/dict/index.ts');

function duplicates(rows,keyFn){
  const counts=new Map();
  for(const row of rows){
    const key=keyFn(row);
    counts.set(key,(counts.get(key)||0)+1);
  }
  let extra=0;
  for(const count of counts.values())if(count>1)extra+=count-1;
  return extra;
}
function tracesOf(rows){
  const grouped=new Map();
  let mismatch=0;
  for(const row of rows){
    const usage=row.usage||{};
    const existing=grouped.get(row.requestId);
    if(!existing){grouped.set(row.requestId,{usage,attempts:1});continue}
    existing.attempts++;
    if(existing.usage.hedged!==usage.hedged||existing.usage.winner!==usage.winner||existing.usage.loser!==usage.loser)mismatch++;
  }
  return {traces:[...grouped.values()],mismatch};
}
function pct(count,total){return total?`${(100*count/total).toFixed(1)}%`:'0.0%'}
function ms(value){return String(Math.round(value))}

async function runLookup(rng,scenario){
  const id=crypto.randomUUID();
  plans.set(id,scenarioPlan(scenario,rng));
  const started=performance.now();
  let watchdog=false;
  const lookup=box.opLook({
    op:'look_v2',lookupId:id,word:'bank',clicked:'bank',sentence:SENTENCE,clickedIndex:1,before:`sim:${id}`,
  },'stress-user',false).then(async response=>({response,body:await response.json()}),error=>({response:{status:0},body:{error:error instanceof Error?error.message:String(error)},thrown:true}));
  const outcome=await Promise.race([
    lookup,
    new Promise(resolve=>setTimeout(()=>resolve({watchdog:true}),WATCHDOG_MS)),
  ]);
  if(outcome.watchdog){
    watchdog=true;
    outcome.body={error:'watchdog'};
    outcome.response={status:0};
    lookup.then(()=>{},()=>{});
  }
  return {
    ms:performance.now()-started,
    status:outcome.response.status,
    body:outcome.body,
    watchdog,
    thrown:outcome.thrown===true,
  };
}

async function pool(count,width,fn){
  const results=new Array(count);
  let cursor=0,done=0;
  async function worker(){
    while(cursor<count){
      const index=cursor++;
      results[index]=await fn(index);
      done++;
      if(done%100===0||done===count)process.stderr.write(`  ${done}/${count}\n`);
    }
  }
  await Promise.all(Array.from({length:Math.min(width,count)},()=>worker()));
  return results;
}

function resetLogs(){
  receiptLog.length=0;
  telemetryLog.length=0;
  plans.clear();
}

async function runScenario(name){
  resetLogs();
  const beforeUnhandled=unhandled.length;
  const beforeTasks=backgroundTasks.length;
  const rng=mulberry32(seed+SCENARIOS.findIndex(([id])=>id===name)*997);
  const started=performance.now();
  const results=await pool(lookups,concurrency,()=>runLookup(rng,name));
  await Promise.all(backgroundTasks.slice(beforeTasks));
  await new Promise(resolve=>setTimeout(resolve,50));
  const durations=results.map(result=>result.ms).sort((a,b)=>a-b);
  const successes=results.filter(result=>result.status===200&&result.body?.ko==='둑');
  const overDeadline=results.filter(result=>result.ms>DEADLINE_MS+DEADLINE_SLACK_MS||result.watchdog);
  const overNominal=results.filter(result=>result.ms>DEADLINE_MS);
  const scenarioReceipts=receiptLog.filter(row=>results.length);
  const scenarioTelemetry=telemetryLog.slice();
  // Logs are reset per scenario, so the arrays are this scenario's writes.
  const receiptDups=duplicates(scenarioReceipts,row=>`${row.id}:${row.phase}`);
  const telemetryDups=duplicates(scenarioTelemetry,row=>`${row.requestId}:${row.attempt}`);
  const {traces,mismatch}=tracesOf(scenarioTelemetry);
  const hedged=traces.filter(trace=>trace.usage?.hedged===true);
  const winners={openrouter:0,gemini:0,none:0};
  let loserAborted=0,loserFailed=0,loserLate=0,loserNone=0;
  for(const trace of traces){
    const winner=trace.usage?.winner;
    if(winner==='openrouter'||winner==='gemini')winners[winner]++;
    else winners.none++;
    const loser=trace.usage?.loser;
    if(loser==='aborted')loserAborted++;
    else if(loser==='failed')loserFailed++;
    else if(loser==='late')loserLate++;
    else loserNone++;
  }
  const providerMismatch=successes.filter(result=>{
    const winner=result.body?.provider;
    return winner!=='openrouter'&&winner!=='gemini';
  }).length;
  return {
    name,
    elapsed:performance.now()-started,
    n:results.length,
    success:successes.length,
    p50:quantile(durations,50),
    p90:quantile(durations,90),
    p99:quantile(durations,99),
    max:durations.at(-1)||0,
    hedged:hedged.length,
    winners,
    loserAborted,loserFailed,loserLate,loserNone,
    traces:traces.length,
    mismatch,providerMismatch,
    overDeadline:overDeadline.length,
    overNominal:overNominal.length,
    thrown:results.filter(result=>result.thrown).length,
    unhandled:unhandled.length-beforeUnhandled,
    leakedTimers:pendingTimers.size,
    openRequests:openRequests.size,
    receiptDups,telemetryDups,
  };
}

const selected=only?SCENARIOS.filter(([name])=>name===only):SCENARIOS;
if(!selected.length)throw new Error('unknown scenario '+only);
console.log(`Hedge stress seed ${seed}, lookups ${lookups}, concurrency ${concurrency}`);
console.log(`Sampler check (n=20000): ${samplerReport}`);
console.log('');
const rows=[];
for(const [name] of selected){
  process.stderr.write(`running ${name}...\n`);
  rows.push(await runScenario(name));
}

const header=['Scenario','N','Success','p50','p90','p99','max','Hedge','DeepSeek','Gemini','None','Loser aborted','Past deadline','Unhandled','Leaked timers','Open requests','Dup receipts','Dup telemetry'];
const table=[header];
const failures=[];
for(const row of rows){
  table.push([
    row.name,String(row.n),pct(row.success,row.n),ms(row.p50),ms(row.p90),ms(row.p99),ms(row.max),
    pct(row.hedged,row.traces||row.n),String(row.winners.openrouter),String(row.winners.gemini),String(row.winners.none),
    pct(row.loserAborted,row.traces||row.n),String(row.overDeadline),String(row.unhandled),String(row.leakedTimers),
    String(row.openRequests),String(row.receiptDups),String(row.telemetryDups),
  ]);
  if(row.thrown)failures.push(`${row.name}: ${row.thrown} lookups threw out of opLook`);
  if(row.overDeadline)failures.push(`${row.name}: ${row.overDeadline} lookups exceeded the 8s deadline (max ${Math.round(row.max)}ms, nominal >8000 ${row.overNominal})`);
  if(row.unhandled)failures.push(`${row.name}: ${row.unhandled} unhandled rejections`);
  if(row.leakedTimers)failures.push(`${row.name}: ${row.leakedTimers} leaked timers`);
  if(row.openRequests)failures.push(`${row.name}: ${row.openRequests} requests still open`);
  if(row.receiptDups)failures.push(`${row.name}: ${row.receiptDups} duplicate receipt writes`);
  if(row.telemetryDups)failures.push(`${row.name}: ${row.telemetryDups} duplicate telemetry writes`);
  if(row.traces!==row.n)failures.push(`${row.name}: ${row.traces} telemetry traces for ${row.n} lookups`);
  if(row.mismatch)failures.push(`${row.name}: ${row.mismatch} traces disagreed about hedge fields`);
  if(row.providerMismatch)failures.push(`${row.name}: ${row.providerMismatch} successes lacked a provider`);
}
const widths=header.map((_,index)=>Math.max(...table.map(line=>line[index].length)));
const render=line=>`| ${line.map((cell,index)=>cell.padEnd(widths[index])).join(' | ')} |`;
console.log(render(header));
console.log(`| ${widths.map(width=>'-'.repeat(width)).join(' | ')} |`);
for(const line of table.slice(1))console.log(render(line));
console.log('');
console.log('Times are milliseconds. Past deadline counts lookups still running more than 400ms after the 8s deadline, or still running at the 12s watchdog. A return a few milliseconds after 8000 is the deadline timer firing.');
console.log('Winner and loser columns are telemetry traces. Hedge is the share of traces where the Gemini request started.');
for(const [name,detail] of SCENARIOS)if(selected.some(([id])=>id===name))console.log(`- ${name}: ${detail}`);
for(const row of rows){
  console.log(`${row.name} detail: loser failed ${row.loserFailed}, late ${row.loserLate}, none ${row.loserNone}; wall clock >8000ms ${row.overNominal}; scenario took ${Math.round(row.elapsed/1000)}s`);
}
if(failures.length){
  console.error('\nInvariant failures:');
  for(const failure of failures)console.error(`- ${failure}`);
  if(unhandled.length)console.error(unhandled.slice(0,5).map(error=>error.stack||error.message).join('\n'));
  server.close();
  process.exit(1);
}
console.log('\nInvariants passed');
server.close();
process.exit(0);
