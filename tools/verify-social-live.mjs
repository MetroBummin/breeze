/* One public, unauthenticated smoke sample, never a load test against X. */
import {writeFileSync} from 'node:fs';
import {fetchXEmbed} from '../server/article/social-embed.mjs';
import {fetchPublic} from '../server/article/public-fetch.mjs';
const url='https://x.com/Interior/status/463440424141459456';
const started=Date.now();let report;
try{
 const result=await fetchXEmbed(url,AbortSignal.timeout(15000),fetchPublic);
 report={url,status:result.status,elapsedMs:Date.now()-started,provider:'official public oEmbed',body:result.status===200?result.body:null,error:result.status===200?null:result.body.error};
}catch(e){report={url,status:null,elapsedMs:Date.now()-started,error:e.message};}
writeFileSync('/tmp/social-live.json',JSON.stringify(report,null,2));
console.log('LIVE_PUBLIC_SAMPLE',JSON.stringify({...report,body:undefined}));
