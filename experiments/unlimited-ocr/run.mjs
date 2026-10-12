import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {score} from './metrics.mjs';

const corpusRoot=new URL('../../tests/fixtures/pdf-ocr-stress/',import.meta.url);
const manifestBytes=readFileSync(new URL('manifest.json',corpusRoot));
export const corpus=JSON.parse(manifestBytes);
export const selectedIds=['print-48','small-12','low-contrast','rotation-90','two-columns','repeated','dense','blank'];
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
export function fixtureInputs() {
  return selectedIds.map(id=>{
    const sample=corpus.cases.find(row=>row.id===id); assert.ok(sample);
    const bytes=readFileSync(new URL(id+'.png',corpusRoot));
    assert.ok(bytes.length<=10*1024*1024, 'fixture byte bound');
    assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
    return {sample, bytes, sha256:sha(bytes)};
  });
}
export function endpointURL(value) {
  const url=new URL(value);
  assert.ok(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'only an explicit loopback HTTP server is allowed');
  assert.ok(!url.username && !url.password && !url.search && !url.hash, 'no endpoint credentials/query/fragment');
  assert.equal(url.pathname,'/v1/chat/completions','pass the exact completion path');
  return url;
}
export function requestBody(bytes) {
  return {model:'baidu/Unlimited-OCR', messages:[{role:'user',content:[
    {type:'text',text:'<image>document parsing.'},
    {type:'image_url',image_url:{url:'data:image/png;base64,'+bytes.toString('base64')}}]}],
    max_tokens:8192, temperature:0, stream:false, skip_special_tokens:false,
    vllm_xargs:{ngram_size:35,window_size:128}};
}
export async function requestPage(url, bytes) {
  const started=performance.now();
  const response=await fetch(url,{method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(requestBody(bytes)), redirect:'error', signal:AbortSignal.timeout(120000)});
  assert.ok(response.ok, `OCR HTTP status ${response.status}`);
  // Bound response buffering, including servers without Content-Length.
  let size=0; const chunks=[];
  for await(const chunk of response.body) {
    size+=chunk.length;
    if(size>4*1024*1024) { await response.body.cancel().catch(()=>{}); throw new Error('response byte bound exceeded'); }
    chunks.push(chunk);
  }
  const result=JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(result.choices?.length,1);
  assert.equal(result.choices[0].finish_reason,'stop','truncated/non-stop output is not a completed benchmark');
  assert.equal(typeof result.choices[0].message?.content,'string');
  return {rawText:result.choices[0].message.content, usage:result.usage??null,
    clientResidentBytes:process.memoryUsage().rss,
    milliseconds:performance.now()-started, error:null};
}
export function buildReport(engine, provenance, results, mode='real') {
  assert.ok(['real','contract'].includes(mode));
  const fixtures=fixtureInputs();
  assert.equal(results.length,fixtures.length);
  assert.equal(new Set(results.map(r=>r.id)).size,fixtures.length,'duplicate results');
  return {schema:1, mode, engine, provenance,
    corpus:{manifestSha256:sha(manifestBytes), fixtureHashes:Object.fromEntries(fixtures.map(f=>[f.sample.id,f.sha256])),
      description:corpus.provenance},
    bounds:{pages:8, concurrency:1, maxTokens:8192, requestTimeoutMs:120000, responseBytes:4194304},
    rows:fixtures.map(f=>score(f.sample,results.find(r=>r.id===f.sample.id) || {})),
    rawCases:results,
    limitations:['Synthetic raster pages; no private PDFs. PDF extraction/rasterization not timed.',
      'Per-page sequential requests; long multi-page decoding, thermal behavior and sustained memory not measured.',
      'HTTP timing includes encoding/transport/queue/decode; native timing covers the bridge, so scopes differ.',
      'Native English lexical output excludes punctuation; text metrics normalize case/spacing/markdown and are not full transcription quality.',
      'No quality/cost winner or universal accuracy rate follows from this small diagnostic corpus.']};
}
function options(args) {
  const flags=new Map();
  for(let i=0;i<args.length;i+=2) {
    assert.ok(['--endpoint','--native','--metadata','--out','--allow-local-inference'].includes(args[i]),'unknown option '+args[i]);
    assert.ok(args[i+1] && !args[i+1].startsWith('--'),'missing value '+args[i]);
    assert.ok(!flags.has(args[i]),'duplicate option'); flags.set(args[i],args[i+1]);
  }
  assert.ok(flags.has('--out') && flags.has('--metadata'),'--out and --metadata are required');
  assert.ok(flags.has('--endpoint')!==flags.has('--native'),'choose exactly one engine');
  return flags;
}
export async function main(args) {
  const flags=options(args), metadata=JSON.parse(readFileSync(flags.get('--metadata'),'utf8'));
  // Human-recorded environment evidence, never inferred GPU memory/cost.
  for(const key of ['sourceCommit','hardware','runtime','modelRevision','inputProvenance','costUSD','serverPeakVramBytes'])
    assert.ok(Object.hasOwn(metadata,key),'metadata requires '+key+' (null allowed when unknown)');
  assert.match(metadata.sourceCommit,/^[a-f0-9]{40}$/);
  for(const key of ['costUSD','serverPeakVramBytes'])
    assert.ok(metadata[key]===null || (Number.isFinite(metadata[key]) && metadata[key]>=0), key+' must be null or a measured nonnegative number');
  assert.ok(metadata.inputProvenance==='same-committed-fixtures','input provenance must be explicitly checked');
  let results, engine;
  if(flags.has('--endpoint')) {
    assert.equal(flags.get('--allow-local-inference'),'yes','explicit --allow-local-inference yes is required');
    const endpoint=endpointURL(flags.get('--endpoint'));
    results=[]; engine='baidu/Unlimited-OCR (local vLLM)';
    for(const fixture of fixtureInputs()) {
      const row={id:fixture.sample.id, ...await requestPage(endpoint,fixture.bytes)}; results.push(row);
      console.error(JSON.stringify({id:row.id,milliseconds:row.milliseconds}));
    }
  } else {
    assert.ok(!flags.has('--allow-local-inference'),'inference opt-in does not apply to native import');
    const native=JSON.parse(readFileSync(flags.get('--native'),'utf8'));
    assert.equal(native.native,true,'mock/input-only controls cannot be imported as native');
    assert.ok(native.completed!==false,'incomplete native report');
    assert.ok(['Apple Vision','bundled ML Kit 16.0.1'].includes(native.engine),'unknown baseline engine');
    engine=native.engine;
    results=selectedIds.map(id=>{
      const matches=native.cases.filter(r=>r.id===id); assert.equal(matches.length,1,'missing/duplicate native case '+id);
      assert.ok(Array.isArray(matches[0].words)); return matches[0];
    });
    metadata.nativeEvidence={environment:native.environment, memoryMetric:native.memoryMetric,
      memorySnapshots:native.memorySnapshots??null, repetitions:native.repetitions??null,
      importNote:'Legacy native format has no input hashes; same-fixture provenance is an operator attestation, not independently proved.'};
  }
  const report=buildReport(engine,metadata,results);
  writeFileSync(flags.get('--out'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({engine,mode:report.mode,cases:report.rows.length,out:flags.get('--out')}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
