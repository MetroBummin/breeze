import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadArms,sealPack,verifyPack,runPaired,reportPaired,usageRecord,costRecord,sha,PRICE,LIMITS,RESERVATION_USD} from '../tools/rss-paired-eval.mjs';
import {articleFor,purposeFixtures,mockResponse} from './fixtures/rss-quality/purpose.mjs';
const arms=await loadArms();
const article=articleFor(purposeFixtures.find(x=>x.id==='coherent-sensitive-news'));
function prepared(n=12){
  const seeds=Array.from({length:n},(_,i)=>({id:`A${i}`,reference:{label:'retain',reviewStatus:'pending-human-review',rationale:'LABEL_MUST_NEVER_ENTER_MODEL'}}));
  return sealPack({runId:'offline-test',createdAt:'2026-10-05T00:00:00Z',seeds,arms,inputs:seeds.map(x=>({id:x.id,url:'https://example.org/'+x.id,stage:'ready',article}))});
}
function adapter(execute){return {contract:{credentialResident:true,durableRunBudget:true,idempotentAttemptIds:true,retries:0,maxPhysicalAttempts:1,model:PRICE.model,maxBillableInputTokens:65536,priceAsOf:PRICE.asOf},execute};}
function response(name='new',usage={input_tokens:1000,output_tokens:50}){
  return {...mockResponse(article,arms[name].implementation),usage};
}
test('sealed model inputs are paired and exclude proposed labels; public manifest omits bodies',()=>{
  const {pack,manifest}=prepared();verifyPack(pack,manifest.packSha,arms);
  assert.equal(pack.inputs.length,12);assert.equal(manifest.counts.ready,12);
  assert.ok(!JSON.stringify(pack.inputs[0].requests).includes('LABEL_MUST_NEVER_ENTER_MODEL'));
  assert.ok(!JSON.stringify(manifest).includes(article.paragraphs[0]));
  assert.deepEqual(pack.inputs[0].requests.old.state,pack.inputs[0].requests.new.state);
  assert.notDeepEqual(pack.inputs[0].requests.old.questions,pack.inputs[0].requests.new.questions);
  assert.equal(manifest.maximumReservationUsd,24*RESERVATION_USD);
  assert.ok(manifest.maximumReservationUsd<LIMITS.usd);
});
test('snapshot, labels and implementation hashes are checked before any adapter call',async()=>{
  const {pack,manifest}=prepared();let calls=0;
  const options={expectedSha:manifest.packSha,arms,executor:adapter(async()=>{calls++;}),checkpoint:async()=>{}};
  const changed=structuredClone(pack);changed.inputs[0].article.paragraphs[0]+=' changed';
  await assert.rejects(runPaired(changed,options),/pack_hash_mismatch/);
  changed.inputs[0].reference.label='exclude';
  await assert.rejects(runPaired(changed,options),/pack_hash_mismatch/);
  await assert.rejects(runPaired(pack,{...options,arms:{...arms,new:{...arms.new,sourceSha:'changed'}}}),/arm_changed/);
  await assert.rejects(runPaired(changed,{...options,executor:adapter(async()=>{}) ,expectedSha:sha(changed)}),/article_changed/);
  assert.equal(calls,0);
});
test('24 mocked attempts execute sequentially once, journal before transport, and retain failure costs',async()=>{
  const {pack,manifest}=prepared();let active=0,maxActive=0,last=[],calls=0;
  const executor=adapter(async(request,meta)=>{
    active++;maxActive=Math.max(maxActive,active);calls++;
    assert.equal(last.at(-1).attemptId,meta.attemptId);assert.equal(last.at(-1).status,'pending');
    assert.equal(meta.retries,0);assert.ok(!JSON.stringify(request).includes('LABEL_MUST_NEVER_ENTER_MODEL'));
    await Promise.resolve();active--;
    const name=meta.attemptId.endsWith(':old')?'old':'new',data=response(name);
    if(calls===1)return {ok:false,data};
    if(calls===2)data.answers.promotion.confidence=.1;
    return {ok:true,data};
  });
  const report=await runPaired(pack,{expectedSha:manifest.packSha,arms,executor,checkpoint:async rows=>{last=rows;}});
  assert.equal(calls,24);assert.equal(maxActive,1);assert.equal(report.counts.attempted,24);
  assert.equal(report.counts.completeValidPairs,11);assert.equal(report.attempts[0].status,'provider_error');assert.equal(report.attempts[1].status,'schema_error');
  assert.equal(report.costs.usageUnknownAttempts,0);assert.ok(Math.abs(report.costs.knownTokenEstimateUsd-24*.000042)<1e-12);
  assert.ok(Math.abs(report.costs.failedAttemptKnownTokenEstimateUsd-2*.000042)<1e-12);
  assert.equal(report.costs.invoiceChargeUsd,null);assert.equal(report.costs.successfulArticles,11);
  assert.ok(Math.abs(report.costs.meanTokenEstimatePerSuccessfulArticleUsd-24*.000042/11)<1e-12);
  assert.equal(report.byArm.new.humanConfirmedRetention.classified,0);
  assert.equal(report.costs.cacheHits,0);
  await runPaired(pack,{expectedSha:manifest.packSha,arms,executor,journal:last,checkpoint:async()=>{}});
  assert.equal(calls,24); // Never resend a completed attempt on resume.
});
test('durable pending attempts are reserved and skipped on resume; failed checkpoint sends nothing',async()=>{
  const {pack,manifest}=prepared(1);let journal,calls=0;
  const options={expectedSha:manifest.packSha,arms,executor:adapter(async()=>{calls++;return {ok:true,data:response()};}),checkpoint:async rows=>{journal=rows;throw Error('disk');}};
  await assert.rejects(runPaired(pack,options),/disk/);assert.equal(calls,0);assert.equal(journal[0].status,'pending');
  const report=await runPaired(pack,{...options,journal,checkpoint:async()=>{}});
  assert.equal(calls,1);assert.equal(report.attempts[0].status,'pending');assert.equal(report.costs.usageUnknownAttempts,1);
  assert.equal(report.costs.completeTokenEstimateUsd,null);assert.equal(report.costs.meanTokenEstimatePerAttemptUsd,null);
  assert.equal(report.costs.reservationUsd,2*RESERVATION_USD);
});
test('no unverified transport, SDK retry contract, malformed journals or duplicate IDs',async()=>{
  const {pack,manifest}=prepared(1),options={expectedSha:manifest.packSha,arms,checkpoint:async()=>{}};
  await assert.rejects(runPaired(pack,options),/verified_private_executor_required/);
  const executor=adapter(async()=>{throw Error('must not call');});executor.contract.retries=1;
  await assert.rejects(runPaired(pack,{...options,executor}),/verified_private_executor_required/);
  executor.contract.retries=0;
  await assert.rejects(runPaired(pack,{...options,executor,journal:[{attemptId:'different-run:A0:old',packSha:manifest.packSha}]}),/invalid_journal/);
  const bad={attemptId:'offline-test:A0:old',packSha:manifest.packSha};
  await assert.rejects(runPaired(pack,{...options,executor,journal:[bad,bad]}),/invalid_journal/);
  const input=prepared(1).pack.inputs[0];
  assert.throws(()=>sealPack({runId:'x',createdAt:'x',arms,seeds:[{id:input.id},{id:input.id}],inputs:[input,input]}),/duplicate_article/);
});
test('model or billing-bound violations stop immediately; no retry or fabricated price',async()=>{
  const {pack,manifest}=prepared();
  for(const mutation of [data=>{data.model='unexpected-model';},data=>{data.usage.input_tokens=65537;}]){
    let calls=0;
    const report=await runPaired(pack,{expectedSha:manifest.packSha,arms,checkpoint:async()=>{},executor:adapter(async()=>{calls++;const data=response('old');mutation(data);return {ok:true,data};})});
    assert.equal(calls,1);assert.equal(report.stopReason,'billing_contract_violation');
    if(report.attempts[0].modelMatches===false)assert.equal(report.attempts[0].cost.tokenEstimateUsd,null);
  }
});
test('missing usage is unknown, cached usage has no invented discount, failures included',()=>{
  const missing=usageRecord(null);assert.equal(costRecord(missing).tokenEstimateUsd,null);
  const usage=usageRecord({input_tokens:1000,output_tokens:100,cached_input_tokens:800});
  assert.equal(usage.cachedTokens,800);assert.equal(costRecord(usage,{responseModel:PRICE.model}).tokenEstimateUsd,.000042);
  assert.equal(costRecord(usage,{responseModel:PRICE.model}).cachedDiscountApplied,false);
  assert.equal(usageRecord({input_tokens:10,output_tokens:1,cached_tokens:11}).cachedTokens,null);
  assert.equal(usageRecord({input_tokens:-1,output_tokens:1}).inputTokens,null);
});
test('source and extraction failures never become classifier rejects or paid attempts',async()=>{
  const seeds=[{id:'source',reference:{label:'source-check',reviewStatus:'pending-human-review'}},{id:'extract',reference:{label:'uncertain',reviewStatus:'pending-human-review'}}];
  const {pack,manifest}=sealPack({runId:'failures',createdAt:'2026-10-05',seeds,arms,inputs:[{id:'source',stage:'source',code:'source_unavailable'},{id:'extract',stage:'extraction',code:'incomplete'}]});
  let calls=0;const report=await runPaired(pack,{expectedSha:manifest.packSha,arms,checkpoint:async()=>{},executor:adapter(async()=>{calls++;})});
  assert.equal(calls,0);assert.equal(report.counts.sourceFailures,1);assert.equal(report.counts.extractionFailures,1);assert.equal(report.byArm.new.counts.rejected,0);
  assert.equal(reportPaired(pack,[]).costs.invoiceChargeUsd,null);
});
test('workspace capture infrastructure failure cannot freeze a false source-failure cohort',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rss-preflight-'));
  try{
    const seeds=JSON.parse(await readFile(new URL('./fixtures/rss-quality/real-source-seeds.json',import.meta.url),'utf8'));
    const capture=join(dir,'capture.json'),pack=join(dir,'pack.json'),manifest=join(dir,'manifest.json');
    await writeFile(capture,JSON.stringify({schema:'rss-public-capture-v1',sources:seeds.map(x=>({id:x.id,requestedUrl:x.url,stage:'infrastructure',code:'capture_network_unavailable'}))}));
    const result=spawnSync(process.execPath,['tools/freeze-rss-real-inputs.mjs',pack,manifest,capture],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/capture_infrastructure_blocked_not_a_publisher_verdict/);
    await assert.rejects(access(pack));await assert.rejects(access(manifest));
  }finally{await rm(dir,{recursive:true,force:true});}
});
