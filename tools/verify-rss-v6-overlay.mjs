// Offline integration rehearsal. Input is the nonsecret get_edge_function JSON.
// No deployment, credentials, HTTP requests or paid model calls. A temporary
// tree preserves captured v6 auth while exercising only three proposed overlays.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,symlinkSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as classifier from '../server/rss-quality/jev.mjs';
import {purposeFixtures,articleFor,mockResponse} from '../tests/fixtures/rss-quality/purpose.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const review=JSON.parse(readFileSync(join(root,'docs/qa/rss-purpose-20261005/v6-source-review.json')));
const captured=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(captured.slug,review.functionSlug);assert.equal(captured.version,review.deploymentVersion);
assert.equal(captured.verify_jwt,true);assert.equal(captured.ezbr_sha256,review.bundleSha256);
assert.equal(captured.files.length,review.files.length);
const digest=value=>createHash('sha256').update(value).digest('hex');
const files=new Map();
for(const file of captured.files){
  const expected=review.files.find(row=>row.name===file.name);
  assert.ok(expected,'Only captured manifest paths are accepted');assert.ok(!files.has(file.name));
  assert.equal(digest(file.content),expected.sha256,'Captured source hash changed: '+file.name);
  files.set(file.name,file.content);
}
for(const name of ['server/rss-quality/jev.mjs','server/rss-quality/service.mjs'])files.set(name,readFileSync(join(root,name),'utf8'));
const oldEvent='log({stage:verdict.stage,code:verdict.status,key:contentKey,usage:verdict.usage});';
const operator=files.get('server/rss-quality/operator.mjs');
assert.equal(operator.split(oldEvent).length,2,'Expected exactly one v6 verdict log site');
files.set('server/rss-quality/operator.mjs',operator.replace(oldEvent,
  "log({stage:verdict.stage,code:verdict.status,detail:verdict.reasonCodes?.[0]??null,key:contentKey,usage:verdict.usage});for(const diagnostic of verdict.diagnostics || [])log({...diagnostic,key:contentKey});"));
const unchanged=review.files.filter(file=>!['server/rss-quality/jev.mjs','server/rss-quality/service.mjs','server/rss-quality/operator.mjs'].includes(file.name));
for(const file of unchanged)assert.equal(digest(files.get(file.name)),file.sha256);
const temporary=mkdtempSync(join(tmpdir(),'breeze-rss-v6-overlay-'));
try{
  for(const [name,content] of files){const path=join(temporary,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content);}
  symlinkSync(join(root,'node_modules'),join(temporary,'node_modules'),'dir');
  const {evaluateCohortItem}=await import(pathToFileURL(join(temporary,'server/rss-quality/operator.mjs')));
  const input=articleFor(purposeFixtures.find(row=>row.id==='coherent-sensitive-news'));
  const html='<html><head><title>'+input.title+'</title></head><body><article>'+input.paragraphs.map(p=>'<p>'+p+'</p>').join('')+'</article></body></html>';
  const outcomes=[];
  for(const scenario of ['optional-invalid','core-invalid','budget-busy']){
    let calls=0,retries=0,finished;const events=[];
    const store={claimEvaluation:async()=>scenario==='budget-busy'?{}:{token:'unit-eval'},finishEvaluation:async()=>{},retryEvaluation:async()=>{retries++;}};
    const jobs={claim:async()=> 'unit-job',finish:async(_id,_token,result)=>{finished=result;}};
    const result=await evaluateCohortItem({id:'offline-test',url:'https://example.com/article',title:input.title},
      {store,jobs,key:'test-only',fetchDoc:async()=>({url:'https://example.com/article',html}),log:event=>events.push(event),
        evaluate:async article=>{calls++;const raw=mockResponse(article,classifier);raw.answers[scenario==='core-invalid'?'promotion':'topic'].confidence=.1;return classifier.validateAnswers(raw,article);}});
    assert.equal(result.status,scenario==='optional-invalid'?'approved':scenario==='core-invalid'?'error':'pending');
    assert.equal(calls,scenario==='budget-busy'?0:1);assert.equal(retries,scenario==='core-invalid'?1:0);
    assert.equal(finished.version,classifier.VERSION);
    assert.equal(events[0].code,scenario==='budget-busy'?'busy':'miss');
    if(scenario==='optional-invalid')assert.ok(events.some(event=>event.code==='optional_metadata_invalid' && event.field==='topic'));
    assert.ok(!JSON.stringify(events).includes(input.paragraphs[0]));
    assert.ok(!JSON.stringify(events).includes('test-only'));
    outcomes.push({scenario,status:result.status,mockedEvaluations:calls,retryRecords:retries});
  }
  console.log(JSON.stringify({kind:'offline_v6_overlay_rehearsal',deploymentVersion:6,verifyJwt:true,
    overlays:['jev.mjs','service.mjs','operator.mjs diagnostics only'],unchangedFiles:unchanged.length,
    entrypointAndAuthPreserved:true,networkCalls:0,paidCalls:0,outcomes,
    limitations:['The Deno entrypoint/gateway is not executed.','Provider and stores are mocks; no live JWT or durable-budget integration is measured.','Operator logging exists only in this temporary rehearsal; production auth/SQL remain unchanged.']},null,2));
}finally{rmSync(temporary,{recursive:true,force:true});}
