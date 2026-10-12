// These tests validate plumbing with authored responses; no model is run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {textMetrics,parseUnlimited,geometryMetrics} from './metrics.mjs';
import {fixtureInputs,endpointURL,requestBody,requestPage,buildReport,main} from './run.mjs';
import {compare} from './compare.mjs';

const mockNative=()=>fixtureInputs().map(({sample})=>({id:sample.id,error:null,milliseconds:0,
  words:sample.expected.map((w,i)=>({...w,line:i,confidence:1}))}));
test('accuracy penalizes edits, omissions and blank hallucination',()=>{
  assert.equal(textMetrics('Bright world','bright world').wer,0);
  assert.equal(textMetrics('Bright world','Bright river').wer,.5);
  assert.equal(textMetrics('Bright world','Bright').wer,.5);
  assert.equal(textMetrics('','invented word').blankHallucinatedWords,2);
  assert.equal(textMetrics('','').wer,null);
});
test('column swaps affect order; repeated occurrences remain unscored',()=>{
  assert.equal(textMetrics('one two three four','three four one two').readingOrder.inversions,4);
  assert.equal(textMetrics('river river','river river').readingOrder.agreement,null);
});
test('both grounding dialects preserve text without manufacturing words',()=>{
  for(const raw of ['<|det|>text [10,20,30,40]<|/det|>Bright world',
    '<|ref|>Bright world<|/ref|><|det|>[[10,20,30,40]]<|/det|>']) {
    const result=parseUnlimited(raw); assert.equal(result.text,'Bright world');
    assert.equal(result.blocks.length,1); assert.deepEqual(result.words,[]);
    assert.equal(result.blocks[0].coordinateUnits,'unverified');
  }
});
test('word tapping uses actual reader admission and independent ink rectangles',()=>{
  const truth=fixtureInputs()[0].sample.expected;
  const words=truth.map(w=>({...w,confidence:1}));
  assert.equal(geometryMetrics(truth,words).recall,1);
  assert.equal(geometryMetrics(truth,words.map(w=>({...w,confidence:.1}))).readerAccepted,0);
  assert.equal(geometryMetrics(truth,words.map(w=>({...w,x:-1}))).readerAccepted,0);
  assert.equal(geometryMetrics(truth,words.map(w=>({...w,word:'wrong'}))).correctUnambiguousTaps,0);
  const broad=geometryMetrics(truth,[{word:truth[0].word,x:0,y:0,w:1,h:1,confidence:1}]);
  assert.equal(broad.correctUnambiguousTaps,0); assert.equal(broad.ambiguousRectangles,1);
});
test('bounds reject excessive model output and edit-distance inputs',()=>{
  assert.throws(()=>parseUnlimited('a'.repeat(200001)),/bound/);
  assert.throws(()=>textMetrics('one','word '.repeat(4001)),/bound/);
});
test('only loopback without credentials/query and exact path is allowed',()=>{
  for(const host of ['127.0.0.1','localhost','[::1]']) assert.ok(endpointURL(`http://${host}:8000/v1/chat/completions`));
  for(const bad of ['https://example.com/v1/chat/completions','http://example.com/v1/chat/completions',
    'http://user:secret@localhost/v1/chat/completions','http://localhost/v1/chat/completions?key=x','http://localhost/v1'])
    assert.throws(()=>endpointURL(bad));
});
test('request retains required model decoding recipe and only fixture data',()=>{
  const f=fixtureInputs()[0], body=requestBody(f.bytes);
  assert.equal(body.messages[0].content[0].text,'<image>document parsing.');
  assert.equal(body.skip_special_tokens,false); assert.equal(body.max_tokens,8192);
  assert.deepEqual(body.vllm_xargs,{ngram_size:35,window_size:128});
  assert.ok(body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'));
});
test('HTTP contract: raw response/timing retained, truncated/redirect/error rejected',async()=>{
  let kind='ok';
  const server=createServer(async(req,res)=>{
    const chunks=[]; for await(const chunk of req) chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks)); assert.equal(body.temperature,0);
    if(kind==='redirect') {res.writeHead(302,{Location:'http://example.com'});res.end();return;}
    if(kind==='error') {res.writeHead(500);res.end();return;}
    if(kind==='oversize') {res.end('a'.repeat(4*1024*1024+1));return;}
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({choices:[{finish_reason:kind==='truncate'?'length':'stop',message:{content:'<|ref|>mock<|/ref|>'}}]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=endpointURL(`http://127.0.0.1:${server.address().port}/v1/chat/completions`);
    const result=await requestPage(url,fixtureInputs()[0].bytes);
    assert.equal(result.rawText,'<|ref|>mock<|/ref|>');assert.ok(result.milliseconds>=0);
    for(kind of ['truncate','redirect','error','oversize']) await assert.rejects(requestPage(url,fixtureInputs()[0].bytes));
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('comparison validates real-shaped envelopes and recomputes tampered summaries (authored data only)',()=>{
  // Simulate the envelope to test validation; never write these as benchmarks.
  const baseline=buildReport('Apple Vision',{evidence:'authored mock in unit test'},mockNative());
  const candidate=buildReport('baidu/Unlimited-OCR (local vLLM)',{evidence:'authored mock in unit test'},
    fixtureInputs().map(({sample})=>({id:sample.id,error:null,milliseconds:0,
      rawText:sample.expected.map(w=>w.word).join(' ')})));
  candidate.rows[0].text.wer=999;
  assert.equal(compare(baseline,candidate).rows[0].candidate.text.wer,0);
  candidate.corpus.fixtureHashes['print-48']='tampered';
  assert.throws(()=>compare(baseline,candidate),/corpus mismatch/);
});
test('missing/error/invalid timing cases cannot become scored successes',()=>{
  for(const change of [{error:'failure'},{milliseconds:null},{milliseconds:-1}]) {
    const data=mockNative();Object.assign(data[0],change);
    assert.throws(()=>buildReport('mock',{},data,'contract'));
  }
});
test('contract report labels remain explicit and cannot enter paired comparisons',()=>{
  const report=buildReport('mock/native',{},mockNative(),'contract');
  assert.equal(report.mode,'contract'); assert.equal(report.rows.length,8);
  assert.equal(report.rows[0].coordinates.wordTapMetrics.recall,1);
  assert.throws(()=>compare(report,report),/contract/);
  assert.throws(()=>buildReport('mock',{},mockNative().slice(1),'contract'));
  const duplicate=mockNative();duplicate[1]=duplicate[0];
  assert.throws(()=>buildReport('mock',{},duplicate,'contract'),/duplicate/);
});
test('CLI requires explicit opt-in and rejects native input-only controls',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'ocr-contract-'));
  try {
    const metadata=join(dir,'metadata.json'), native=join(dir,'native.json'), out=join(dir,'out.json');
    writeFileSync(metadata,JSON.stringify({sourceCommit:'a'.repeat(40),hardware:'mock',runtime:'mock',
      modelRevision:null,inputProvenance:'same-committed-fixtures',costUSD:null,serverPeakVramBytes:null}));
    await assert.rejects(main(['--endpoint','http://localhost:8000/v1/chat/completions','--metadata',metadata,'--out',out]),/opt-in|explicit/);
    writeFileSync(native,JSON.stringify({engine:'Apple Vision',native:false,cases:mockNative()}));
    await assert.rejects(main(['--native',native,'--metadata',metadata,'--out',out]),/mock/);
    writeFileSync(native,JSON.stringify({engine:'Apple Vision',native:true,completed:false,cases:mockNative()}));
    await assert.rejects(main(['--native',native,'--metadata',metadata,'--out',out]),/incomplete/);
    // No success path writes mock outputs with real labels.
    assert.throws(()=>readFileSync(out));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
