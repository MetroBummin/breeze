// Deterministic validator comparison only; no model calls, URLs fetched or keys.
// Read the exact main baseline from local git, never a moving branch or PR89.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as next from '../server/rss-quality/jev.mjs';
import {extractionReadiness} from '../server/rss-quality/extract.mjs';
import {qualityReport} from '../server/rss-quality/report.mjs';
import {purposeFixtures,articleFor,mockResponse} from '../tests/fixtures/rss-quality/purpose.mjs';
export const BASELINE='0e72a35be0fa663167acd7de2c7dd9a8dfbdfc4c';
const source=execFileSync('git',['show',`${BASELINE}:server/rss-quality/jev.mjs`],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'});
const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const rows=purposeFixtures.map(f=>({...f,article:articleFor(f)}));
const editorial=purposeFixtures.find(f=>f.id==='coherent-sensitive-news');
for(const field of ['substance','context','interest','topic','sensitivity','timeliness'])rows.push({...editorial,id:`optional-${field}`,article:articleFor(editorial),corrupt:field});
const results={before:[],after:[]},pairs=[];
for(const row of rows){
  const raw=mockResponse(row.article,next,row.choices);
  if(row.corrupt)raw.answers[row.corrupt].confidence=.1;
  const pair={id:row.id,label:row.label,synthetic:true};
  for(const [name,implementation] of [['before',before],['after',next]]){
    let result;
    try{
      if(row.error)throw Error(row.error);
      const ready=extractionReadiness(row.article);
      result=ready.status!=='ready'?{status:'unavailable',diagnostic:{stage:'extraction',code:ready.reasons[0]}}:implementation.validateAnswers(raw,row.article);
    }catch(error){result={status:'error',diagnostic:error.diagnostic || {stage:'transport',code:row.error || 'unknown_error'}};}
    results[name].push({url:row.id,...result});
    pair[name]={status:result.status,eligibility:result.eligibility || null,diagnostic:result.diagnostic || null};
  }
  pairs.push(pair);
}
const reference=rows.map(row=>({url:row.id,source:'synthetic',label:row.label==='editorial'?'positive':row.label==='promotion'?'negative':'ambiguous'}));
console.log(JSON.stringify({kind:'offline_validator_contract',baseline:BASELINE,version:next.VERSION,modelCalls:0,
  distinctSyntheticArticles:purposeFixtures.length,validatorCases:rows.length,
  distinctArticleProcessing:{before:qualityReport(reference.slice(0,purposeFixtures.length),results.before.slice(0,purposeFixtures.length)).processing,
    after:qualityReport(reference.slice(0,purposeFixtures.length),results.after.slice(0,purposeFixtures.length)).processing},
  before:qualityReport(reference,results.before),after:qualityReport(reference,results.after),pairs,
  limitations:['Responses are scripted, not actual Jev judgments.','Synthetic labels are proposed policy labels pending human review.','Six optional-field corruptions reuse one article and are test cases, not six additional articles.','Promotion classification improvement is unmeasured; unchanged scripted core answers cannot establish a rubric effect.','Original numeric values for the seven trial schema errors were not retained.']},null,2));
