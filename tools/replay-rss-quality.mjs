// Offline v2 replay from independently captured same-snapshot article/response fixtures.
// No browser observations/labels are accepted as model input. No network or keys.
// Input [{url,source,article:{title,paragraphs,links,checks},response:{model,answers,usage}}]
import {readFileSync} from 'node:fs';
import {validateAnswers,qualityKey} from '../server/rss-quality/jev.mjs';
import {extractionReadiness,canonical} from '../server/rss-quality/extract.mjs';
import {safeDiagnostic} from '../server/rss-quality/service.mjs';
const rows=JSON.parse(readFileSync(process.argv[2],'utf8')),results=[];
for(const {url,source,article,response} of rows){
  try{
    const resolved=canonical(url),readiness=extractionReadiness(article);
    if(readiness.status!=='ready'){results.push({url,source,status:'unavailable',diagnostic:{stage:'extraction',code:readiness.reasons[0]}});continue;}
    results.push({url,source,mode:'offline',contentKey:await qualityKey(resolved,article),...validateAnswers(response,article)});
  }catch(error){results.push({url,source,mode:'offline',status:'error',diagnostic:safeDiagnostic(error)});}
}
console.log(JSON.stringify(results,null,2));
