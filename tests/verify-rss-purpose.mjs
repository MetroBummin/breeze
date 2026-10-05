import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as classifier from '../server/rss-quality/jev.mjs';
import {candidateInventory,createQualityService} from '../server/rss-quality/service.mjs';
import {extractionReadiness} from '../server/rss-quality/extract.mjs';
import {qualityReport} from '../server/rss-quality/report.mjs';
import {unresolvedCause} from '../server/rss-quality/compare.mjs';
import {purposeFixtures,articleFor,mockResponse,trialObservations} from './fixtures/rss-quality/purpose.mjs';
import {sourceEvidence,syntheticEvidenceLinks} from './fixtures/rss-quality/source-evidence.mjs';
const article=articleFor(purposeFixtures.find(f=>f.id==='coherent-sensitive-news'));
const response=()=>mockResponse(article,classifier);

for(const fixture of purposeFixtures)test(`purpose policy contract, mocked model: ${fixture.id}`,()=>{
  if(fixture.error){assert.equal(fixture.status,'error');return;}
  const input=articleFor(fixture),readiness=extractionReadiness(input);
  if(readiness.status!=='ready'){assert.equal(fixture.status,'unavailable');return;}
  const result=classifier.validateAnswers(mockResponse(input,classifier,fixture.choices),input);
  assert.equal(result.status,fixture.status);
  if(fixture.eligibility)assert.equal(result.eligibility,fixture.eligibility);
  if(fixture.label==='promotion')assert.deepEqual(result.reasonCodes,['promotion_primary_purpose']);
});
test('label provenance distinguishes user observations from proposed synthetic policies',()=>{
  assert.equal(trialObservations.filter(f=>f.label==='promotion' && f.labelSource==='user-review').length,2);
  assert.ok(trialObservations.filter(f=>['RSS-002','RSS-021'].includes(f.id)).every(f=>f.label==='uncertain'));
  assert.ok(purposeFixtures.every(f=>f.labelSource==='proposed-policy' && f.reviewStatus==='pending-human-review'));
});
test('bounded source evidence retains uncertainty and stays outside classifier state',()=>{
  assert.equal(sourceEvidence.length,6);
  assert.equal(new Set(sourceEvidence.map(row=>row.url)).size,sourceEvidence.length);
  for(const row of sourceEvidence){
    assert.ok(row.quote.trim().split(/\s+/).length<=25);
    assert.equal(row.originalTrialSnapshot,false);assert.equal(row.modelInput,false);
    assert.ok(row.locator && row.supports && row.counterevidence && row.limitation);
    assert.ok(['user-review','proposed-policy'].includes(row.labelSource));
    if(row.labelSource==='proposed-policy')assert.equal(row.reviewStatus,'pending-human-review');
  }
  assert.equal(sourceEvidence.find(row=>row.id==='RSS-021').label,'uncertain');
  assert.equal(trialObservations.find(row=>row.id==='RSS-002').label,'uncertain');
  for(const fixture of purposeFixtures){
    const input=articleFor(fixture);
    assert.deepEqual(Object.keys(input),['title','paragraphs','links','checks']);
    assert.ok(!JSON.stringify(input).includes('pending-human-review'));
    for(const id of syntheticEvidenceLinks[fixture.id] || [])assert.ok(sourceEvidence.some(row=>row.id===id));
  }
});
test('rubric covers narrative campaigns, editorial commerce and substantial galleries',()=>{
  const specs=classifier.questions(article);
  assert.match(specs.promotion.instructions,/primary purpose/);
  assert.match(specs.promotion.criteria.yes,/narrative launch\/collaboration/);
  assert.match(specs.promotion.criteria.yes,/preserve substantive product reviews/);
  assert.match(specs.readability.criteria.yes,/gallery with developed biography/);
  assert.ok(Object.values(specs).every(spec=>spec.instructions.includes('UNTRUSTED DATA')));
});
const optional=['substance','context','interest','topic','sensitivity','timeliness'];
const corruptions={
  missing:(raw,key)=>delete raw.answers[key],
  choice:(raw,key)=>raw.answers[key].choice='RAW-SECRET-ARTICLE',
  confidence:(raw,key)=>raw.answers[key].confidence=NaN,
  mismatch:(raw,key)=>raw.answers[key].confidence=.1,
  sum:(raw,key)=>{const a=raw.answers[key];a.probabilities[a.choice]=.9;},
  top:(raw,key)=>{const a=raw.answers[key],other=Object.keys(a.probabilities).find(k=>k!==a.choice);a.probabilities[a.choice]=0;a.probabilities[other]=1;},
  shape:(raw,key)=>raw.answers[key].probabilities=[],
};
for(const key of optional)test(`optional ${key} degrades without changing eligibility`,()=>{
  for(const mutate of Object.values(corruptions)){
    const raw=response();mutate(raw,key);
    const result=classifier.validateAnswers(raw,article);
    assert.equal(result.status,'approved');assert.equal(result.eligibility,'approved');
    assert.equal(result.answers[key],undefined);assert.equal(result.diagnostics.length,1);
    assert.equal(result.diagnostics[0].code,'optional_metadata_invalid');assert.equal(result.diagnostics[0].field,key);
    assert.ok(!JSON.stringify(result).includes('RAW-SECRET-ARTICLE'));
    if(['topic','sensitivity','timeliness'].includes(key))assert.equal(result.metadata[key],'unknown');
  }
});
for(const key of ['promotion','readability','mismatch','evidence'])test(`core ${key} malformed output fails closed`,()=>{
  for(const mutate of Object.values(corruptions)){
    const raw=response();mutate(raw,key);
    assert.throws(()=>classifier.validateAnswers(raw,article),e=>e.message==='invalid_evaluation' && !JSON.stringify(e).includes('RAW-SECRET-ARTICLE'));
  }
});
test('optional failures cannot rescue a core defect or fabricate ranking',()=>{
  const raw=mockResponse(article,classifier,{promotion:'yes',evidence:'p1'});
  for(const key of optional)delete raw.answers[key];
  const result=classifier.validateAnswers(raw,article);
  assert.equal(result.status,'rejected');assert.equal(result.eligibility,'withheld');
  assert.equal(result.ranking,0);assert.equal(result.diagnostics.length,6);
});
test('core confidence formula and thresholds stay unchanged',()=>{
  const raw=response();raw.answers.promotion={type:'choice',choice:'no',confidence:.1,probabilities:{yes:.3,no:.4,uncertain:.3}};
  assert.equal(classifier.validateAnswers(raw,article).status,'uncertain');
  assert.equal(classifier.validateAnswers(raw,article).eligibility,'candidate');
  raw.answers.promotion={type:'choice',choice:'yes',confidence:.1,probabilities:{yes:.4,no:.3,uncertain:.3}};
  assert.equal(classifier.validateAnswers(raw,article).eligibility,'withheld');
});
test('safe diagnostics separate sum, selected maximum and confidence consistency',()=>{
  for(const [kind,detail] of [['sum','probability_sum'],['top','choice_not_top'],['mismatch','confidence_mismatch']]){
    const raw=response();corruptions[kind](raw,'promotion');
    assert.throws(()=>classifier.validateAnswers(raw,article),e=>e.diagnostic.detail===detail && e.diagnostic.field==='promotion');
  }
});
test('new rubric invalidates identical v2 content and the client stays OFF',async()=>{
  assert.equal(classifier.RUBRIC,'rss-quality-v3');
  const oldVersion=classifier.VERSION.replace('rss-quality-v3','rss-quality-v2');
  const oldBytes=new TextEncoder().encode(JSON.stringify([oldVersion,'https://example.com/a',article.title,article.paragraphs,article.links,article.checks]));
  const oldHash=Buffer.from(await crypto.subtle.digest('SHA-256',oldBytes)).toString('hex');
  assert.notEqual(await classifier.qualityKey('https://example.com/a',article),oldHash);
  assert.equal(candidateInventory([{quality:{version:oldVersion,status:'approved',checkedAt:Date.now()}}]).length,0);
  const source=readFileSync(new URL('../scripts/importers/rss.js',import.meta.url),'utf8');
  const ctx=vm.createContext({URL,Map,Set,WeakMap});
  vm.runInContext(source+'\nglobalThis.mode=RSS_QUALITY_MODE;',ctx);
  assert.equal(ctx.mode,'off');
});
test('optional diagnostic logging contains fixed codes and hashes; no second paid attempt',async()=>{
  const events=[];let evaluations=0,claims=0,writes=0;
  const raw=response();raw.answers.topic.confidence=.1;
  const store={claimFeed:async()=>({entries:[],cursor:0,token:'feed'}),finishFeed:async()=>{},
    claimEvaluation:async()=>{claims++;return {token:'eval'};},finishEvaluation:async()=>{writes++;}};
  await createQualityService({store,key:'test-only',mode:'shadow',fetchDoc:async()=>({html:'<rss><channel><item><title>Test</title><link>https://example.com/a</link><enclosure type="image/jpeg" url="https://example.com/cover.jpg"/></item></channel></rss>'}),
    load:async entry=>({url:entry.url,article}),evaluate:async()=>{evaluations++;return classifier.validateAnswers(raw,article);},log:e=>events.push(e)}).refresh(0);
  assert.deepEqual([claims,evaluations,writes],[1,1,1]);
  assert.equal(events.find(e=>e.stage==='cache').code,'miss');
  assert.equal(events.find(e=>e.code==='optional_metadata_invalid').detail,'confidence_mismatch');
  assert.ok(!JSON.stringify(events).includes(article.paragraphs[0]));
  assert.ok(events.every(e=>/^[a-f0-9]{64}$/.test(e.key)));
});
test('cohort accounting separates classifier decisions from source/schema errors',()=>{
  const reference=Array.from({length:46},(_,i)=>({url:`test-${i}`,source:'test'}));
  const results=reference.map((r,i)=>({...r,status:i<36?'approved':i===36?'uncertain':'error',eligibility:i===36?'candidate':undefined,
    diagnostic:i>36?{code:i<44?'invalid_evaluation':'source_unavailable',detail:i<44?'probability_consistency':undefined}:undefined}));
  const report=qualityReport(reference,results);
  assert.equal(report.processing.classified,37);assert.equal(report.processing.approved,36);
  assert.equal(report.processing.candidates,1);assert.equal(report.processing.errors,9);assert.equal(report.processing.rejected,0);
  assert.equal(unresolvedCause(results[37]),'invalid_evaluation:probability_consistency');
  assert.equal(unresolvedCause(results[44]),'source_unavailable');
});
