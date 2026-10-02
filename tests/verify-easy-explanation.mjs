import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {easyInput,easyPrompt,easyText,easySuggestion,runEasyExplanation} from '../server/dict/easy-explanation.ts';
const input={before:[],after:[],word:'Federal Reserve',meaning:'연방준비제도',sentence:'The Federal Reserve held rates steady.'};
const explanation='미국의 중앙은행 역할을 하는 기관이에요. 금리와 돈의 흐름을 조절해 물가와 고용을 안정시키려 해요.';
test('invalid input and cancelled requests never consume quota or call a model',async()=>{
  const deps={charge:()=>assert.fail('charged'),generate:()=>assert.fail('generated')};
  for(const bad of [null,[],{}, {...input,word:' '},{...input,meaning:'x'.repeat(501)},{...input,sentence:12},{...input,before:['a','b','c']},{...input,after:[4]}]){
    assert.equal(easyInput(bad),null);assert.equal((await runEasyExplanation(bad,deps)).status,400);
  }
  assert.equal((await runEasyExplanation(input,{...deps,signal:AbortSignal.abort()})).status,499);
});
test('quota gate precedes provider and output is bounded, without durable answer receipt',async()=>{
  let calls=0;
  const denied=await runEasyExplanation(input,{charge:async()=>({ok:false,error:'anon_exhausted'}),generate:()=>{calls++;}});
  assert.equal(denied.status,429);assert.equal(calls,0);
  const sequence=[];
  const result=await runEasyExplanation(input,{charge:async()=>{sequence.push('quota');return {ok:true,left:4};},generate:async value=>{sequence.push('model');assert.deepEqual(value,input);return {explanation};}});
  assert.deepEqual(sequence,['quota','model']);assert.deepEqual(result,{status:200,body:{explanation,left:4}});
  for(const value of [null,{}, {explanation:'tiny'},{explanation:'x'.repeat(601)}])assert.throws(()=>easyText(value));
  const failure=await runEasyExplanation(input,{charge:async()=>({ok:true,left:3}),generate:async()=>{throw Error('provider');}});
  assert.equal(failure.status,502);assert.equal(failure.body.left,3);
  assert.ok(easyPrompt(input).includes(JSON.stringify(input)));
});
function client(){
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',classList:{contains:()=>false,toggle(){}},getBoundingClientRect:()=>({width:100,height:44}),focus(){},setAttribute(){},addEventListener(){}});return elements.get(id);};
  const requests=[],owner=new AbortController();
  const sandbox={normalizeLigatures:value=>String(value),document:{getElementById:element},Map,AbortController,setTimeout,clearTimeout,navigator:{onLine:true},
    activeSelectedWordNode:null,curBook:null,wordLookupTargets:new Map(),selKey:'fed',words:{fed:{word:input.word,ko:input.meaning,example:input.sentence}},previewWordCard:null,sbUser:{id:'one'},
    currentContext:()=>null,wordLookupLife:1,wordLookupSignal:()=>owner.signal,wordLookupAlive:life=>life===sandbox.wordLookupLife,
    deviceId:()=> 'test-device',rememberAiLeft:()=>{},wordDetailAnchored:false,
    dictCall:(body,signal)=>new Promise(resolve=>requests.push({body,signal,resolve})),
    localStorage:{setItem:()=>assert.fail('persisted explanation')},saveWords:()=>assert.fail('mutated vocabulary')};
  vm.createContext(sandbox);vm.runInContext(readFileSync(new URL('../scripts/reader/mode-bridge.js',import.meta.url),'utf8'),sandbox);vm.runInContext(readFileSync(new URL('../scripts/dictionary/easy-explanation.js',import.meta.url),'utf8'),sandbox);
  return {sandbox,requests,element,run:code=>vm.runInContext(code,sandbox)};
}
test('explanation is explicit, deduplicated, memory-only and shown as literal text',async()=>{
  const c=client(),before=JSON.stringify(c.sandbox.words);c.run('renderEasyExplanation()');assert.equal(c.requests.length,0);
  const pending=c.run('requestEasyExplanation()');await c.run('requestEasyExplanation()');assert.equal(c.requests.length,1);
  assert.equal(c.requests[0].body.op,'easy_explanation');c.requests[0].resolve({explanation:'<b>미국 중앙은행이라는 뜻입니다.</b>',left:4});await pending;
  assert.equal(c.element('p-easy-text').textContent,'<b>미국 중앙은행이라는 뜻입니다.</b>');
  assert.equal(c.element('p-easy-button').hidden,true);
  c.run('cancelEasyExplanation();renderEasyExplanation()');await c.run('requestEasyExplanation()');assert.equal(c.requests.length,1);
  assert.equal(JSON.stringify(c.sandbox.words),before);
});
test('close, different meaning and account changes reject late answers',async()=>{
  for(const change of ['cancelEasyExplanation();wordLookupLife++','words.fed.ko="새 뜻";renderEasyExplanation()','sbUser={id:"two"};renderEasyExplanation()']){
    const c=client();const pending=c.run('requestEasyExplanation()');c.run(change);
    assert.equal(c.requests[0].signal.aborted,true);c.requests[0].resolve({explanation});await pending;
    assert.notEqual(c.element('p-easy-text').textContent,explanation);
    assert.equal(c.run('easyExplanationCache.size'),0);
  }
});
test('offline performs no call, provider failure is manually retryable',async()=>{
  const c=client();c.sandbox.navigator.onLine=false;await c.run('requestEasyExplanation()');assert.equal(c.requests.length,0);
  c.sandbox.navigator.onLine=true;const first=c.run('requestEasyExplanation()');c.requests[0].resolve({error:'explanation_failed'});await first;
  assert.equal(c.element('p-easy-retry').hidden,false);assert.equal(c.requests.length,1);
  const retry=c.run('requestEasyExplanation()');c.requests[1].resolve({explanation});await retry;assert.equal(c.element('p-easy-text').textContent,explanation);
});

test('context includes two sentences per side across paragraphs and never guesses duplicate occurrences',()=>{
  const c=client();
  const read=code=>JSON.parse(JSON.stringify(c.run(code)));
  assert.deepEqual(read("easySentenceWindow(['First sentence. Second sentence.','Target sentence.','Fourth sentence. Fifth sentence. Sixth sentence.'],'Target sentence.',{pi:1,start:0})"),{before:['First sentence.','Second sentence.'],after:['Fourth sentence.','Fifth sentence.']});
  assert.deepEqual(read("easySentenceWindow(['First scene. Target sentence.','Other scene. Target sentence.'],'Target sentence.',null)"),{before:[],after:[]});
  assert.deepEqual(read("easySentenceWindow(['First scene. Target sentence.','Other scene. Target sentence.'],'Target sentence.',{pi:1,start:13})"),{before:['Target sentence.','Other scene.'],after:[]});
  assert.deepEqual(read("easySentenceWindow(['Only sentence.'],'Only sentence.',null)"),{before:[],after:[]});
});

test('current source sentence wins over saved example even when same meaning has no overlay',async()=>{
  const c=client();c.sandbox.activeSelectedWordNode={dataset:{},closest:()=>null};c.sandbox.sentenceOf=()=> 'Current B sentence.';
  const pending=c.run('requestEasyExplanation()');assert.equal(c.requests[0].body.sentence,'Current B sentence.');
  c.requests[0].resolve({explanation});await pending;
  assert.equal(c.sandbox.words.fed.example,input.sentence);
});

test('same context reopens expanded; changing context evicts its old explanation without retry',async()=>{
  const c=client();const first=c.run('requestEasyExplanation()');c.requests[0].resolve({explanation});await first;
  c.run('cancelEasyExplanation();renderEasyExplanation()');assert.equal(c.element('p-easy-button').hidden,true);
  c.sandbox.currentContext=()=>({sentence:'Different B sentence.'});c.run('easyExplanationInput();cancelEasyExplanation();renderEasyExplanation()');
  assert.equal(c.element('p-easy-button').hidden,false);assert.equal(c.element('p-easy-card').hidden,true);assert.equal(c.requests.length,1);
  c.sandbox.currentContext=()=>null;c.run('cancelEasyExplanation();renderEasyExplanation()');
  assert.equal(c.element('p-easy-card').hidden,true);assert.equal(c.run('easyExplanationCache.size'),0);
});

test('meaning suggestions are optional, bounded and never inferred from prose',async()=>{
  for(const suggestedMeaning of [undefined,null,{},'',input.meaning,'x'.repeat(121)])assert.equal(easySuggestion({suggestedMeaning},input),'');
  assert.equal(easySuggestion({suggestedMeaning:'다른 뜻'},{...input,sentence:''}),'');
  const result=await runEasyExplanation(input,{charge:async()=>({ok:true,left:4}),generate:async()=>({explanation,suggestedMeaning:' 미국 중앙은행 '})});
  assert.equal(result.body.suggestedMeaning,'미국 중앙은행');
});
test('accepting a same-example correction persists only on click and rejects repeated/stale applies',async()=>{
  const c=client();let saves=0,syncs=0;
  Object.assign(c.sandbox,{sentenceHash:s=>s,saveWords:()=>saves++,queueSync:()=>syncs++,rememberSenseContext:()=>{},refreshReaderWords:()=>{},renderWordLookup:()=>c.run('renderEasyExplanation()'),contextView:null});
  const pending=c.run('requestEasyExplanation()');c.requests[0].resolve({explanation,suggestedMeaning:'미국 중앙은행'});await pending;
  assert.equal(saves,0);assert.equal(c.sandbox.words.fed.ko,input.meaning);
  c.run('applyEasyMeaning();applyEasyMeaning()');
  assert.equal(c.sandbox.words.fed.ko,'미국 중앙은행');assert.equal(c.sandbox.words.fed.example,input.sentence);
  assert.equal(saves,1);assert.equal(syncs,1);assert.equal(c.requests.length,1);
  c.run('cancelEasyExplanation();renderEasyExplanation()');assert.equal(c.element('p-easy-apply').hidden,true);
  for(const change of ['delete words.fed','words.fed.ko="새 뜻"','words.fed.example="Changed example"','sbUser={id:"other"}','currentContext=()=>({sentence:"Elsewhere."})']){
    const stale=client();const req=stale.run('requestEasyExplanation()');stale.requests[0].resolve({explanation,suggestedMeaning:'미국 중앙은행'});await req;
    stale.run(change);stale.run('applyEasyMeaning()'); // saveWords throws if reached
  }
});
