/* Controlled transport/clock experiment. Pass the exact baseline rss.js path.
   Numbers describe synthetic uncompressed responses, not production billing. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {rssDevice} from './egress-rss-transport.mjs';
if(!process.argv[2])throw Error('Provide the exact baseline scripts/importers/rss.js path');
const before=readFileSync(process.argv[2],'utf8');
const after=readFileSync(new URL('../scripts/importers/rss.js',import.meta.url),'utf8');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const report={measuredAt:new Date().toISOString(),scope:'Synthetic non-rendering transport experiment, uncompressed response body bytes. Not production egress, publisher availability or browser Home latency.',fixture:{feedDelayMs:10,unavailableArticleDelayMs:40,candidatesPerFeed:1},results:[]};
for(const [label,source] of [['baseline-245',before],['fixed',after]]){
  const h=rssDevice({source,candidates:1}),parse=h.context.parseRss;
  h.context.parseRss=(...args)=>parse(...args).map(e=>({...e,bodyProvided:true,contentHtml:'<p>'+('A public reading article offers context and evidence. '.repeat(40))+'</p>'}));
  const fetch=h.context.fetch;h.context.fetch=async(...args)=>{await pause(10);return fetch(...args);};
  const started=performance.now();await h.load(false);const homeMs=performance.now()-started,home=h.metrics();
  let originalRequests=0;h.context.readerOpenIntent=0;
  h.context.fetchArticleHtml=async()=>{originalRequests++;await pause(40);throw Error('Synthetic original unavailable');};
  const selectedAt=performance.now();let success=false;
  try{const selected=await h.context.rssResolveSelectedEntry(h.entries()[0][0]);await h.context.ingestArticle(selected.url,{...selected,preview:true,present:false,deferSave:true});success=true;}catch{}
  const selectedMs=performance.now()-selectedAt;
  const retry=rssDevice({source,mediumResolve:true,candidates:1});await retry.load(false);const entry=retry.entries()[12][0];
  retry.state.fail=true;await retry.context.rssResolveSelectedEntry(entry);retry.state.fail=false;
  const retried=await retry.context.rssResolveSelectedEntry(entry);
  report.results.push({label,sourceSha256:createHash('sha256').update(source).digest('hex'),homeRequests:home.requests,homeResponseBytes:home.responseBodyBytes,homeLoadFixtureMs:Math.round(homeMs*100)/100,selectedReadSuccess:success,selectedOriginalRequests:originalRequests,selectedFixtureMs:Math.round(selectedMs*100)/100,manualRetryBodyRecovered:retried.bodyProvided,ownerRequestsIncludingRetry:retry.calls.filter(c=>/\/feed\/@writer-/.test(c.target)).length});
}
const [baseline,fixed]=report.results;
assert.equal(baseline.homeRequests,fixed.homeRequests);assert.equal(baseline.homeResponseBytes,fixed.homeResponseBytes);
assert.equal(baseline.selectedReadSuccess,false);assert.equal(fixed.selectedReadSuccess,true);
assert.equal(baseline.manualRetryBodyRecovered,false);assert.equal(fixed.manualRetryBodyRecovered,true);
const output=process.argv[3];if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
