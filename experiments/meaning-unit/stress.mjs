import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {prepare,validate,normalizeMapped,highlightGlyphs,SelectionSession} from './core.mjs';
import {fixtures} from './fixtures.mjs';
const dir=new URL('./artifacts/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
const legacy=vm.createContext({normalizeLigatures:s=>s.normalize('NFKC')});
vm.runInContext(fs.readFileSync(new URL('../../scripts/reader/mode-bridge.js',import.meta.url),'utf8'),legacy);
const rows=[],checks=[];let count=0;
const check=(name,fn)=>{fn();count++;checks.push(name);};
const rejects=(name,prepared,value,code)=>check(name,()=>assert.throws(()=>validate(prepared,typeof value==='string'?value:JSON.stringify(value)),new RegExp(code)));
for(const f of fixtures){
 const prepared=prepare(f.input),raw=JSON.stringify(f.expected);
 check(f.name+' accepted',()=>assert.deepEqual(validate(prepared,raw).source,f.expected.source));
 const finder=vm.runInContext('bridgeSentenceFinder',legacy)(prepared.block.text);
 const baseline=finder(f.input.tap.start),server=baseline.slice(0,600);
 rows.push({name:f.name,baselineExact:baseline===f.expected.source,baselineRetainsTap:server.includes(prepared.data.tap.text),baselineChars:baseline.length,serverChars:server.length,prototypeChars:f.expected.source.length,translationChars:f.expected.translation.length,promptChars:prepared.prompt.length,stubExact:true,
  limitation:f.name==='page-boundary'?'Continued unit across page blocks cannot be selected; stub acceptance is not semantic completeness.':null});
 rejects(f.name+' fabricated',prepared,{...f.expected,source:f.expected.source+' invented'},'fabricated_source');
 rejects(f.name+' bounds',prepared,{...f.expected,end:prepared.block.text.length+1},'invalid_range');
 rejects(f.name+' partial',prepared,{...f.expected,complete:false},'partial_output');
 rejects(f.name+' context',prepared,{...f.expected,blockId:'context'},'invalid_range');
 rejects(f.name+' malformed',prepared,'{','invalid_json');
 const glyphs=[]; // original UTF-16 offsets, including supplementary characters
 for(let i=0;i<prepared.block.text.length;){const char=String.fromCodePoint(prepared.block.text.codePointAt(i));glyphs.push({blockId:'target',page:prepared.block.page,column:prepared.block.column,start:i,end:i+char.length,x:(i%70)*7,y:Math.floor(i/70)*20,width:7,height:18});i+=char.length;}
 check(f.name+' highlight agreement',()=>{const selected=highlightGlyphs(prepared,f.expected,glyphs);assert.equal(selected[0].start,f.expected.start);assert.equal(selected.at(-1).end,f.expected.end);});
 check(f.name+' missing geometry',()=>assert.throws(()=>highlightGlyphs(prepared,f.expected,glyphs.filter(g=>g.start!==f.input.tap.start)),/missing_geometry/));
}
const f=fixtures[6],p=prepare(f.input),answer=f.expected;
rejects('repeated sentence wrong occurrence',p,{...answer,start:0,end:10},'wrong_occurrence');
for(const [name,patch,code] of [['negative',{start:-1},'invalid_range'],['noninteger',{start:1.5},'invalid_range'],['empty',{translation:''},'partial_output'],['null',null,'invalid_output'],['insufficient',{error:'insufficient_context'},'insufficient_context'],['truncated',JSON.stringify(answer).slice(0,-5),'invalid_json']])rejects(name,p,patch===null?null:typeof patch==='string'?patch:{...answer,...patch},code);
const u=fixtures[11],up=prepare(u.input);
rejects('surrogate split',up,{...u.expected,start:6,source:up.block.text.slice(6,u.expected.end)},'invalid_range');
check('input budget fails explicitly',()=>assert.throws(()=>prepare(fixtures[4].input,{maxChars:1600}),/insufficient_context/));
check('normalization offsets',()=>{const source='oﬃce inter-\nnational  😀';const m=normalizeMapped(source);assert.equal(m.text,'office international 😀');const range=m.originalRange(7,20);assert.equal(source.slice(range.start,range.end),'inter-\nnational');assert.throws(()=>m.originalRange(2,3),/partial_normalized_glyph/);});
const deferred=[];const session=new SelectionSession((prepared,{signal})=>new Promise(resolve=>deferred.push({prepared,signal,resolve})));
const a=session.select(fixtures[0].input).catch(e=>e.message),b=session.select(fixtures[1].input);
deferred[1].resolve(JSON.stringify(fixtures[1].expected));await b;deferred[0].resolve(JSON.stringify(fixtures[0].expected));
check('stale response discarded',()=>{assert.equal(session.result.source,fixtures[1].expected.source);assert.equal(deferred[0].signal.aborted,true);});
const awaitValue=await a;
check('stale result rejected',()=>assert.equal(awaitValue,'stale_response'));
const cancelled=session.select(fixtures[2].input).catch(e=>e.message);session.cancel();deferred.at(-1).resolve(JSON.stringify(fixtures[2].expected));
const cancelledValue=await cancelled;check('cancel discards result',()=>{assert.equal(cancelledValue,'stale_response');assert.equal(session.result,null);});
let calls=0;const cached=new SelectionSession(async()=>{calls++;return JSON.stringify(answer);});
cached.cache.set(p.key,JSON.stringify({...answer,complete:false}));await cached.select(f.input);await cached.select(f.input);
check('partial cache evicted full hit revalidated',()=>assert.equal(calls,1));
const changed=structuredClone(f.input);changed.revision='2';await cached.select(changed);
check('revision cache isolation',()=>assert.equal(calls,2));
const wrongTap=structuredClone(f.input);wrongTap.tap.start=wrongTap.blocks[0].text.lastIndexOf('nodded');wrongTap.tap.end=wrongTap.tap.start+6;
await assert.rejects(()=>cached.select(wrongTap),/wrong_occurrence/);count++;checks.push('occurrence cache isolation');
check('output budget rejects without cutting',()=>assert.throws(()=>validate(p,JSON.stringify(answer),{maxOutputChars:10}),/invalid_output/));
check('geometry rejects cross column',()=>assert.throws(()=>highlightGlyphs(p,answer,[{blockId:'target',page:1,column:1,start:answer.start,end:answer.end,x:0,y:0,width:40,height:20}]),/invalid_geometry/));
check('tap cannot split emoji',()=>{const input=structuredClone(u.input);input.tap.start=6;input.tap.end=7;assert.throws(()=>prepare(input),/bad_tap/);});
check('context budget omission is visible',()=>{const input=structuredClone(f.input);input.blocks.unshift({id:'large-context',text:'context '.repeat(1000),page:1,column:0,kind:'paragraph'});assert.equal(prepare(input,{maxChars:1600}).data.contextOmitted,true);});
check('normalization maps ligature to original',()=>{const m=normalizeMapped('The oﬃce.');const span=m.originalRange(4,10);assert.deepEqual(span,{start:4,end:8});assert.equal('The oﬃce.'.slice(span.start,span.end),'oﬃce');});
check('semantic error counterexample accepted by structural validator',()=>assert.equal(validate(p,JSON.stringify({...answer,translation:'의도적으로 틀린 번역'})).translation,'의도적으로 틀린 번역'));
const badCache=new SelectionSession(async()=>'{');await assert.rejects(()=>badCache.select(f.input),/invalid_json/);check('invalid output never cached',()=>assert.equal(badCache.cache.size,0));
let overflowCalls=0;const bounded=new SelectionSession(async prepared=>{overflowCalls++;return JSON.stringify(fixtures.find(f=>f.input.documentId===prepared.documentId).expected);});
for(let i=0;i<20;i++){const input=structuredClone(fixtures[0].input);input.revision=String(i);await bounded.select(input);}check('cache bounded',()=>{assert.equal(bounded.cache.size,16);assert.equal(overflowCalls,20);});
const trials=1000,performanceRows=[];
for(const f of fixtures){const legacyFinder=vm.runInContext('bridgeSentenceFinder',legacy)(f.input.blocks.find(b=>b.id==='target').text);const baseline=[],prototype=[];
 for(let i=0;i<trials;i++){let t=performance.now();legacyFinder(f.input.tap.start);baseline.push(performance.now()-t);t=performance.now();const p=prepare(f.input);validate(p,JSON.stringify(f.expected));prototype.push(performance.now()-t);}
 const summarize=a=>{a.sort((a,b)=>a-b);return {p50Ms:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1)};};
 performanceRows.push({name:f.name,baseline:summarize(baseline),prototype:summarize(prototype)});
}
// A thousand adversarial responses to real prepared fixtures, never a provider.
for(let i=0;i<1000;i++){const f=fixtures[i%fixtures.length],p=prepare(f.input),bad={...f.expected,end:p.block.text.length+1+i};assert.throws(()=>validate(p,JSON.stringify(bad)),/invalid_range/);}count+=1000;
const report={semanticCounterexamples:['Valid source with deliberately wrong translation is accepted','Continued page unit can be incomplete despite complete:true'],generatedAt:new Date().toISOString(),provider:'oracle stub (expected fixture span supplied, zero live AI calls)',fixtures:rows.length,checks:count,adversarialRejections:1000,checksNamed:checks,rows,performanceTrialsPerFixture:trials,performanceRows,liveAccuracy:null,liveLatencyMs:null,liveCost:null};
fs.writeFileSync(new URL('stress-results.json',dir),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({fixtures:rows.length,checks:count,baselineExact:rows.filter(r=>r.baselineExact).length,artifact:'artifacts/stress-results.json'}));
