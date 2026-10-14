import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context={};
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../scripts/core/study-set-test.js',import.meta.url),'utf8'),context,{filename:'study-set-test.js'});
const api=vm.runInContext('BreezeStudySetTest',context);

test('normalization accepts spacing, punctuation, case, and any one saved meaning',()=>{
  assert.equal(api.matches('  은행. ',['은행']),true);
  assert.equal(api.matches('조용 한',['조용한']),true);
  assert.equal(api.matches('HELLO',['hello']),true);
  assert.equal(api.matches('\u1100\u1161',['가']),true);
  assert.equal(api.matches('강둑',['은행','강둑']),true);
  assert.equal(api.matches('   ',['은행']),false);
  assert.equal(api.matches('산',['은행']),false);
  assert.equal(api.matches('은행',null),false);
});

test('sampling stays inside the pool and keeps saved meanings',()=>{
  const cards=[{id:'a',word:'bank',ko:'은행',acceptedMeanings:['은행','강둑'],example:'hidden'},{id:'b',word:'calm',ko:'고요한'},{id:'',word:'drop',ko:'버림'},{id:'c',word:'empty',ko:'  '}];
  assert.throws(()=>api.questions(cards,0),/Invalid/);
  assert.throws(()=>api.questions(cards,1.5),/Invalid/);
  assert.throws(()=>api.questions(cards,3),/Invalid/);
  const plain=value=>JSON.parse(JSON.stringify(value));
  const one=api.questions(cards,1,()=>0);
  assert.deepEqual(plain(one),[{id:'a',word:'bank',meanings:['은행','강둑']}]);
  const both=plain(api.questions(cards,2,()=>0.999));
  assert.deepEqual(both.map(card=>card.id).sort(),['a','b']);
  assert.equal(both[0].example,undefined);
  assert.deepEqual(both.find(card=>card.id==='b').meanings,['고요한']);
});

test('score is a rounded percent and refuses impossible counts',()=>{
  assert.equal(api.score(0,1),0);
  assert.equal(api.score(5,6),83);
  assert.equal(api.score(10,10),100);
  assert.equal(api.score(2,0),null);
  assert.equal(api.score(3,2),null);
  assert.equal(api.score(1.5,2),null);
});

test('records append newest first, update the same id, and refuse a bad store',()=>{
  const first={id:'one',at:10,count:10,correct:8,score:80};
  const saved=api.save('', 'set-a', first);
  assert.equal(saved.ok,true);
  const plain=value=>JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(api.records(saved.raw,'set-a')),[first]);
  const second={id:'two',at:20,count:4,correct:1,score:25};
  const both=api.save(saved.raw,'set-a',second);
  assert.deepEqual(plain(api.records(both.raw,'set-a')).map(row=>row.id),['two','one']);
  const revised={...first,at:30,correct:9,score:90};
  const updated=api.save(both.raw,'set-a',revised);
  assert.deepEqual(plain(api.records(updated.raw,'set-a')).map(row=>row.correct),[9,1]);
  const other=api.save(updated.raw,'set-b',{id:'b',at:1,count:1,correct:1,score:100});
  assert.equal(api.records(other.raw,'set-a').length,2);
  let raw=other.raw;
  for(let i=0;i<50;i++)raw=api.save(raw,'set-a',{id:'n'+i,at:100+i,count:1,correct:1,score:100}).raw;
  assert.equal(api.records(raw,'set-a').length,40);
  assert.equal(api.records(raw,'set-a')[0].id,'n49');
  for(const bad of ['{','{"version":2,"sets":{}}','{"version":1,"sets":[]}']){
    const refused=api.save(bad,'set-a',first);
    assert.equal(refused.ok,false);
    assert.equal(refused.raw,bad);
  }
  assert.equal(api.save(saved.raw,'set-a',{...first,score:81}).ok,false);
  assert.equal(api.save(saved.raw,'',first).ok,false);
});
