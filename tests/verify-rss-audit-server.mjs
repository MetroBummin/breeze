import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createAuditHandler,initialAuditRow,providerExecutor} from '../server/rss-quality/audit.mjs';
import {auditStore} from '../server/rss-quality/audit-store.mjs';
import {RESERVATION_NANO_USD,digest,LEDGER_ID} from '../server/rss-quality/audit-contract.mjs';
import {loadArms,sealPack,sha} from '../tools/rss-paired-eval.mjs';
import {convertCapture,convertParentHandoff,prepareBundle} from '../tools/prepare-rss-audit-bundle.mjs';
import {articleFor,purposeFixtures,mockResponse} from './fixtures/rss-quality/purpose.mjs';
const arms=await loadArms(),T=Date.parse('2026-10-05T10:00:00Z');
const article=articleFor(purposeFixtures.find(x=>x.id==='coherent-sensitive-news'));
function prepared(n=12){
  const seeds=Array.from({length:n},(_,i)=>({id:'A'+i,reference:{label:'retain',reviewStatus:'pending-human-review'}}));
  const {pack}=sealPack({runId:'offline-server-test',createdAt:new Date(T).toISOString(),seeds,arms,inputs:seeds.map(x=>({id:x.id,stage:'ready',article}))});
  pack.executionReview={inputReview:'reviewed-before-model',referenceReview:'proposed-reviewed-before-model',callerProof:'existing-service-role-auth-probe-400-operation',billingTerms:'verified-context-bound-no-retries',expiresAt:new Date(T+1800000).toISOString()};
  return {pack,packSha:sha(pack)};
}
function memoryStore(row){
  return {row:structuredClone(row),reads:0,claims:0,finishes:0,
    async read(){this.reads++;return structuredClone(this.row);},
    async claim(expected,result){this.claims++;if(this.row.status!=='queued'||this.row.token!==expected.token)return null;const token=crypto.randomUUID();this.row={id:LEDGER_ID,status:'running',token,result:structuredClone(result)};return token;},
    async finish(token,result,closed){this.finishes++;assert.equal(this.row.token,token);assert.equal(this.row.status,'running');this.row={...this.row,status:closed?'done':'queued',result:structuredClone(result)};},
  };
}
const request=(operation='next')=>new Request('https://example.org/private-audit',{method:'POST',body:JSON.stringify({operation})});
const dataFor=(input=article,implementation=arms.new.implementation)=>({...mockResponse(input,implementation),usage:{input_tokens:1000,output_tokens:50,cached_tokens:0}});
function harness(n=12,options={}){
  const p=prepared(n),store=memoryStore(initialAuditRow(p.pack,p.packSha)),logs=[],calls=[];
  const execute=async payload=>{calls.push(payload);return {ok:true,data:dataFor()};};
  const handler=createAuditHandler({...p,arms,store,authorized:async()=>true,execute,now:()=>T,log:event=>logs.push(event),...options});
  return {...p,store,logs,calls,handler};
}
test('auth denial precedes ledger/pack/body access; probe is paid-work-free',async()=>{
  const h=harness(1,{authorized:async()=>false});
  assert.equal((await h.handler(request())).status,403);assert.equal(h.store.reads,0);assert.equal(h.calls.length,0);
  const allowed=harness(1);assert.deepEqual(await (await allowed.handler(request('auth_probe'))).json(),{authorized:true,providerAttempts:0});
  assert.equal(allowed.store.reads,0);assert.equal(allowed.calls.length,0);
  assert.equal((await allowed.handler(new Request('https://example.org',{method:'POST',body:'x'.repeat(1025)}))).status,400);
});
test('missing reviews, changed snapshots, arm hashes, and malformed ledger stop before calls',async()=>{
  for(const mutate of [p=>{p.executionReview.inputReview='unreviewed';},p=>{p.inputs[0].articleSha='changed';},p=>{p.arms.new.sourceSha='changed';}]){
    const p=prepared(1);mutate(p.pack);p.packSha=sha(p.pack);
    const h=harness(1,p);assert.equal((await h.handler(request())).status,503);assert.equal(h.store.claims,0);assert.equal(h.calls.length,0);
  }
  const h=harness(1);h.store.row.result.reservedNanoUsd=0.1;
  assert.equal((await h.handler(request())).status,503);assert.equal(h.calls.length,0);
});
test('reservation is durably claimed before transport; failed claim sends nothing',async()=>{
  const h=harness(1);let count=0;
  const handler=createAuditHandler({...h,arms,authorized:async()=>true,now:()=>T,execute:async()=>{count++;assert.equal(h.store.row.status,'running');assert.equal(h.store.row.result.nextIndex,1);assert.equal(h.store.row.result.reservedNanoUsd,RESERVATION_NANO_USD);return {ok:true,data:dataFor()};}});
  assert.equal((await handler(request())).status,200);assert.equal(count,1);
  const failed=harness(1);failed.store.claim=async()=>{throw Error('db failed');};
  assert.equal((await failed.handler(request())).status,503);assert.equal(failed.calls.length,0);
});
test('parallel requests cannot start two provider attempts',async()=>{
  const h=harness(2);let release,entered;
  const wait=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});let calls=0;
  const handler=createAuditHandler({...h,arms,authorized:async()=>true,now:()=>T,execute:async()=>{calls++;entered();await wait;return {ok:true,data:dataFor()};}});
  const first=handler(request());await started;
  const losers=await Promise.all(Array.from({length:8},()=>handler(request())));
  assert.ok(losers.every(x=>x.status===409));assert.equal(calls,1);release();assert.equal((await first).status,200);
  assert.equal(h.store.row.result.nextIndex,1);
});
test('24 one-attempt calls close the pilot; replay and new handler cannot restart it',async()=>{
  const h=harness();
  for(let i=0;i<24;i++)assert.equal((await h.handler(request())).status,200);
  assert.equal(h.calls.length,24);assert.equal(h.store.row.status,'done');assert.equal(h.store.row.result.reservedNanoUsd,24*RESERVATION_NANO_USD);
  assert.equal((await h.handler(request())).status,409);assert.equal(h.calls.length,24);
  const restarted=createAuditHandler({...h,arms,authorized:async()=>true,execute:async()=>{throw Error('must not execute');},now:()=>T});
  assert.equal((await restarted(request())).status,409);
  const status=await (await restarted(request('status'))).json();assert.equal(status.reservations,24);assert.equal(status.confirmedClientAttempts,24);assert.equal(status.pendingReservations,0);
  assert.ok(!JSON.stringify(status).includes(article.paragraphs[0]));
});
test('foreground batch completes only sequential reserved attempts and shares the 24-slot cap',async()=>{
  const h=harness();let active=0,maxActive=0,authCalls=0;
  const handler=createAuditHandler({...h,arms,authorized:async()=>{authCalls++;return true;},now:()=>T,execute:async()=>{active++;maxActive=Math.max(maxActive,active);assert.equal(h.store.row.status,'running');await Promise.resolve();active--;return {ok:true,data:dataFor()};}});
  const response=await handler(request('run'));assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.completedThisRequest,24);assert.equal(body.closed,true);assert.equal(maxActive,1);assert.equal(authCalls,1);
  assert.equal(h.store.row.result.nextIndex,24);assert.equal((await handler(request('run'))).status,409);
});
test('batch request window pauses before another reservation; continuation sends untouched slots only',async()=>{
  const h=harness();let clock=0,calls=0;
  const handler=createAuditHandler({...h,arms,authorized:async()=>true,now:()=>T,elapsed:()=>clock,execute:async()=>{calls++;clock+=10000;return {ok:true,data:dataFor()};}});
  const first=await (await handler(request('run'))).json();assert.equal(first.completedThisRequest,7);assert.equal(first.pausedReason,'request_window');assert.equal(h.store.row.result.nextIndex,7);assert.equal(h.store.row.status,'queued');
  clock=0;const next=await (await handler(request('run'))).json();assert.equal(next.completedThisRequest,7);assert.equal(calls,14);
  assert.equal(new Set(h.store.row.result.attempts.map(x=>x.attemptId)).size,14);
});
test('batch stops at persistence failure and never continues a pending attempt after restart',async()=>{
  const h=harness();h.store.finish=async()=>{throw Error('failed');};
  assert.equal((await h.handler(request('run'))).status,503);assert.equal(h.calls.length,1);
  assert.equal((await h.handler(request('run'))).status,409);assert.equal(h.calls.length,1);
});
test('post-call persistence failure remains pending across restarts, with full unknown reservation',async()=>{
  const h=harness(1);h.store.finish=async()=>{throw Error('failed write');};
  assert.equal((await h.handler(request())).status,503);assert.equal(h.calls.length,1);assert.equal(h.store.row.status,'running');assert.equal(h.logs.length,0);
  assert.equal(h.store.row.result.attempts[0].status,'pending');assert.equal(h.store.row.result.attempts[0].cost.tokenEstimateUsd,null);
  const restarted=createAuditHandler({...h,arms,authorized:async()=>true,execute:async()=>{throw Error('must not resend');},now:()=>T});
  assert.equal((await restarted(request())).status,409);
  const status=await (await restarted(request('status'))).json();assert.equal(status.confirmedClientAttempts,0);assert.equal(status.pendingReservations,1);
});
test('unrecognized stored fields and manually queued pending reservations fail closed without text disclosure',async()=>{
  const h=harness(1);await h.handler(request());
  h.store.row.result.attempts[0].articleText='DO NOT DISCLOSE';
  const response=await h.handler(request('status'));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('DO NOT DISCLOSE'));
  delete h.store.row.result.attempts[0].articleText;
  h.store.row.result.attempts[0].status='pending';
  assert.equal((await h.handler(request())).status,503);assert.equal(h.calls.length,1);
});
test('stored diagnostic/reason/stage text cannot disclose prose through authorized status',async()=>{
  for(const patch of [{reasonCodes:['DO NOT DISCLOSE']},{diagnostics:[{stage:'schema',code:'optional_metadata_invalid',field:'topic',detail:'DO NOT DISCLOSE'}]},{stage:'DO NOT DISCLOSE'}]){
    const h=harness(1);await h.handler(request());Object.assign(h.store.row.result.attempts[0],patch);
    const response=await h.handler(request('status'));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('DO NOT DISCLOSE'));assert.equal(h.calls.length,1);
  }
});
test('expiry blocks next calls while retaining private numeric status after restart',async()=>{
  const h=harness(1);let clock=T;
  const handler=createAuditHandler({...h,arms,authorized:async()=>true,execute:async()=>({ok:true,data:dataFor()}),now:()=>clock});
  assert.equal((await handler(request())).status,200);clock=T+3600001;
  assert.equal((await handler(request())).status,410);
  const restarted=createAuditHandler({...h,arms,authorized:async()=>true,execute:async()=>{throw Error('must not execute');},now:()=>clock});
  assert.equal((await restarted(request('status'))).status,200);assert.equal((await restarted(request())).status,410);
});
test('provider/schema failures keep reported usage/cost; optional metadata does not alter core validity',async()=>{
  const h=harness(2);let calls=0;
  const handler=createAuditHandler({...h,arms,authorized:async()=>true,now:()=>T,execute:async()=>{calls++;const data=dataFor();if(calls===1)return {ok:false,data};if(calls===2)data.answers.topic.confidence=.1;if(calls===3)data.answers.promotion.confidence=.1;return {ok:true,data};}});
  for(let i=0;i<4;i++)assert.equal((await handler(request())).status,200);
  const rows=h.store.row.result.attempts;assert.equal(rows[0].status,'provider_error');assert.equal(rows[1].status,'approved');assert.equal(rows[2].status,'schema_error');
  assert.equal(rows[0].cost.tokenEstimateUsd,.000042);assert.equal(rows[2].cost.tokenEstimateUsd,.000042);assert.equal(rows[0].cost.invoiceChargeUsd,null);
  assert.equal(rows[1].diagnostics[0].code,'optional_metadata_invalid');assert.ok(h.logs.every(x=>!JSON.stringify(x).includes(article.paragraphs[0])));
});
test('unexpected model or token bound closes ledger; missing usage never becomes zero estimate',async()=>{
  for(const mutate of [data=>{data.model='jev-9.0.0';},data=>{data.usage.input_tokens=65537;}]){
    const h=harness(2),data=dataFor();mutate(data);
    const handler=createAuditHandler({...h,arms,authorized:async()=>true,now:()=>T,execute:async()=>({ok:true,data})});
    await handler(request());assert.equal(h.store.row.status,'done');assert.equal(h.store.row.result.stopReason,'billing_contract_violation');assert.equal((await handler(request())).status,409);
  }
  const h=harness(1),data=dataFor();delete data.usage;
  const handler=createAuditHandler({...h,arms,authorized:async()=>true,now:()=>T,execute:async()=>({ok:true,data})});
  await handler(request());assert.equal(h.store.row.result.attempts[0].cost.tokenEstimateUsd,null);
});
test('executor uses one fixed HTTP request, bounds JSON and preserves non-OK usage without raw errors',async()=>{
  let calls=0;
  const execute=providerExecutor('offline-test-key',{fetchImpl:async(url,init)=>{calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer offline-test-key');return Response.json({model:arms.new.implementation.MODEL,usage:{input_tokens:20,output_tokens:0}},{status:429});}});
  const response=await execute({model:arms.new.implementation.MODEL});assert.equal(calls,1);assert.equal(response.ok,false);assert.equal(response.data.usage.input_tokens,20);
  const oversized=providerExecutor('offline-test-key',{fetchImpl:async()=>new Response('x'.repeat(100001))});
  assert.equal((await oversized({model:arms.new.implementation.MODEL})).invalidDetail,'response_limit');
  const empty=providerExecutor('offline-test-key',{fetchImpl:async()=>new Response('')});
  assert.equal((await empty({model:arms.new.implementation.MODEL})).invalidDetail,'empty_response');
  const h=harness(1,{execute:async()=>{throw Error('RAW KEY / ARTICLE MUST NEVER APPEAR');}});
  assert.ok(!JSON.stringify(await (await h.handler(request())).json()).includes('RAW KEY'));
});
function capture(){
  const bodyText=article.paragraphs.join('\n')+'\nPage 1\nRepeated navigation link\nRepeated navigation link';
  return {schema:'rss-browser-capture-v1',items:Array.from({length:12},(_,i)=>({id:'B'+i,url:'https://example.org/'+i,title:article.title,capturedAt:new Date(T).toISOString(),captureMethod:i===11?'publisher-visible-text':'breeze-reader-visible-text',bodyText,bodySha256:sha(bodyText),reference:{label:i<7?'retain':i<11?'promotion':'uncertain',reviewStatus:'proposed-reviewed-before-model'}}))};
}
const review=()=>({schema:'rss-audit-execution-review-v1',inputReview:'reviewed-before-model',referenceReview:'proposed-reviewed-before-model',billingTerms:'verified-context-bound-no-retries',expiresAt:new Date(T+1800000).toISOString(),invocationProof:{projectId:'hrtfhojbhqvaoiulspto',functionSlug:'rss-quality',status:400,error:'operation',callerKind:'existing-server-job',callerId:'offline-test-only',verifiedAt:new Date(T).toISOString()}});
test('manual body-only probe evidence remains explicit and cannot claim an observed HTTP status',async()=>{
  const proof=review();Object.assign(proof.invocationProof,{status:null,callerKind:'manual-dashboard-existing-jwt',evidence:'user-reported-response-body'});
  const bundle=await prepareBundle(capture(),proof,{now:T});assert.equal(bundle.metadata.invocationProof.status,null);assert.equal(bundle.pack.executionReview.callerProof,'manual-existing-jwt-probe-operation-body-status-unreported');
  proof.invocationProof.status=400;await assert.rejects(prepareBundle(capture(),proof,{now:T}),/verified_execution_review_required/);
});
test('parent handoff adapter cross-checks full-file and body hashes, preserves capture-window uncertainty',()=>{
  const raw={schema_version:1,samples:capture().items.map(x=>({id:x.id,source:x.url,title:x.title,body:x.bodyText+'😀',capture:x.captureMethod==='publisher-visible-text'?'Visible publisher article-content DOM (not Breeze extraction)':'Visible Breeze reader DOM',manual_label:'retain_substantive_reporting',observed_window_utc:'2026-10-05T09:50:00Z/2026-10-05T10:00:00Z'}))};
  const rawText=JSON.stringify(raw),manifest={schema_version:1,raw_input_sha256:sha(rawText),samples:raw.samples.map(({body,...s})=>({...s,body_characters:[...body].length,body_sha256:sha(body)}))};
  const result=convertParentHandoff(rawText,JSON.stringify(manifest));assert.equal(result.items[0].capturedAtPrecision,'window-upper-bound');assert.equal(result.items[0].bodyText,raw.samples[0].body);
  manifest.samples[0].body_sha256='changed';assert.throws(()=>convertParentHandoff(rawText,JSON.stringify(manifest)),/parent_manifest_mismatch/);
});
test('capture conversion preserves repeated UI text and raw hashes; labels stay proposed and outside state',()=>{
  const converted=convertCapture(capture());assert.equal(converted.inputs.length,12);assert.equal(converted.inputs[0].rawBodySha,capture().items[0].bodySha256);
  assert.ok(converted.inputs[0].article.paragraphs.join('\n').includes('Repeated navigation link\nRepeated navigation link'));
  assert.equal(converted.inputs[0].article.checks.productionExtractionVerified,false);assert.equal(converted.seeds[0].reference.reviewStatus,'pending-human-review');
  const bad=capture();bad.items[0].bodyText+='tampered';assert.throws(()=>convertCapture(bad),/capture_item_invalid/);
  const short=capture();short.items[0].bodyText='short';short.items[0].bodySha256=sha('short');assert.equal(convertCapture(short).inputs[0].stage,'extraction');
});
test('private bundle requires review/probe evidence, pins exact auth helper, and omits bodies from metadata',async()=>{
  await assert.rejects(prepareBundle(capture(),null,{now:T}),/verified_execution_review_required/);
  const wrong=review();wrong.invocationProof.status=403;await assert.rejects(prepareBundle(capture(),wrong,{now:T}),/verified_execution_review_required/);
  const sensitive=review();sensitive.invocationProof.Authorization='never accept credentials';await assert.rejects(prepareBundle(capture(),sensitive,{now:T}),/proof_must_not_contain_credentials/);
  const bundle=await prepareBundle(capture(),review(),{now:T});assert.equal(bundle.metadata.verifyJwt,true);assert.equal(bundle.row.id,'RSS-000');assert.equal(bundle.metadata.maxProviderAttempts,24);
  assert.ok(!JSON.stringify(bundle.metadata).includes(article.paragraphs[0]));assert.ok(!JSON.stringify(bundle.row).includes(article.paragraphs[0]));
  assert.equal(sha(bundle.files.find(x=>x.name==='operator-auth.mjs').content),'2d612962b01784a76e1b72f5cf79de3c4972a337b6dd73b856ec67e31549ae79');
  assert.equal(await digest(bundle.pack),bundle.metadata.packSha);
  const source=bundle.files.find(x=>x.name==='index.ts').content;assert.ok(source.includes('operatorAuthorized'));assert.ok(!source.includes('createQualityService'));
});
test('real local Postgres CAS fences stale callers and writes only sentinel; no original cohort change',async()=>{
  const db=new PGlite();
  try{
    await db.exec("create table rss_quality_eval(id text primary key check(id ~ '^RSS-[0-9]{3}$'),status text not null check(status in ('queued','running','done')),token uuid,result jsonb); insert into rss_quality_eval values('RSS-000','queued',null,'{}'),('RSS-055','done',null,'{\"original\":true}');");
    const seen=[];
    const bridge={from(table){assert.equal(table,'rss_quality_eval');const filters=[],patch={};let mode='read';return {
      abortSignal(signal){assert.ok(signal instanceof AbortSignal);return this;},select(){return this;},update(value){mode='update';Object.assign(patch,value);return this;},eq(key,value){filters.push([key,value]);return this;},is(key,value){filters.push([key,value]);return this;},
      async maybeSingle(){
        assert.ok(filters.some(([key,value])=>key==='id'&&value===LEDGER_ID));seen.push({mode,filters,patch});
        const values=[],where=filters.map(([key,value])=>{assert.ok(['id','status','token'].includes(key));if(value===null)return key+' is null';values.push(value);return key+'=$'+values.length;}).join(' and ');
        let sql='select * from rss_quality_eval where '+where;
        if(mode==='update'){
          const set=Object.entries(patch).map(([key,value])=>{assert.ok(['status','token','result'].includes(key));values.push(key==='result'?JSON.stringify(value):value);return key+'=$'+values.length+(key==='result'?'::jsonb':'');}).join(',');
          sql='update rss_quality_eval set '+set+' where '+where+' returning *';
        }
        const result=await db.query(sql,values);return {data:result.rows[0] || null,error:null};
      },
    };}};
    const store=auditStore(bridge),row=await store.read();
    const [first,second]=await Promise.all([store.claim(row,{reserved:1}),store.claim(row,{reserved:1})]);assert.ok(first);assert.equal(second,null);
    await store.finish(first,{closed:true},true);assert.equal((await store.read()).status,'done');
    assert.equal(await store.claim(row,{}),null);
    const untouched=await db.query("select result from rss_quality_eval where id='RSS-055'");assert.deepEqual(untouched.rows[0].result,{original:true});
    assert.ok(seen.every(x=>x.filters.some(([key,value])=>key==='id'&&value===LEDGER_ID)));
  }finally{await db.close();}
});
