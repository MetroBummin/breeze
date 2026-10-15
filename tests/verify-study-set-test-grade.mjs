import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runStudySetTestGrade, studySetTestInput, studySetTestPrompt, studySetTestVerdicts} from '../server/dict/study-set-test.ts';

const item={word:'bank',meanings:['은행','강둑'],answer:'금융 기관'};
const deps={charge:async()=>assert.fail('charged'),generate:async()=>assert.fail('generated')};

test('bad batches never spend quota or call a model',async()=>{
  for(const body of [null,{}, {items:[]},{items:[item,{...item,answer:'x'.repeat(1001)}]},{items:Array.from({length:11},()=>item)},{items:[{...item,meanings:[]}]}]){
    assert.equal(studySetTestInput(body),null);
    assert.equal((await runStudySetTestGrade(body,deps)).status,400);
  }
  assert.equal((await runStudySetTestGrade({items:[item]},{...deps,signal:AbortSignal.abort()})).status,499);
});

test('quota comes before the model, and the prompt is word and meaning only',async()=>{
  let calls=0;
  const denied=await runStudySetTestGrade({items:[item]},{charge:async()=>({ok:false,error:'anon_exhausted',left:0}),generate:async()=>{calls++;}});
  assert.equal(denied.status,429);assert.equal(calls,0);
  const sequence=[];
  const result=await runStudySetTestGrade({items:[item]},{
    charge:async()=>{sequence.push('quota');return {ok:true,left:4};},
    generate:async prompt=>{
      sequence.push('model');
      assert.match(prompt,/any one accepted meaning/i);
      assert.match(prompt,/책\/도서/);
      assert.match(prompt,/개\/강아지/);
      assert.match(prompt,/학교\/학원/);
      assert.ok(prompt.includes(JSON.stringify([{word:item.word,meanings:item.meanings,answer:item.answer}])));
      assert.equal(prompt.includes('example'),false);
      return {ok:[1]};
    }
  });
  assert.deepEqual(sequence,['quota','model']);
  assert.deepEqual(result,{status:200,body:{results:[{ok:true}],left:4}});
  assert.deepEqual(studySetTestVerdicts({ok:[1,0]},2),[true,false]);
  assert.throws(()=>studySetTestVerdicts({ok:[2]},1),/invalid_grade/);
  assert.throws(()=>studySetTestVerdicts({results:[{ok:true}]},1),/invalid_grade/);
  const failure=await runStudySetTestGrade({items:[item]},{charge:async()=>({ok:true,left:3}),generate:async()=>{throw Error('provider');}});
  assert.equal(failure.status,502);assert.equal(failure.body.left,3);
  const unavailable=await runStudySetTestGrade({items:[item]},{charge:async()=>({ok:false,error:'quota_unavailable'}),generate:async()=>{calls++;}});
  assert.equal(unavailable.status,503);assert.equal(calls,0);
});
