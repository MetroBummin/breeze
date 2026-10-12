import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(new URL('../scripts/ui/vocabulary-review.js',import.meta.url),'utf8');
const engine=vm.runInNewContext(source.slice(source.indexOf('const SimpleStudySession='),source.indexOf('const SIMPLE_STUDY_STORAGE='))+'SimpleStudySession;');
test('only distinct remembered cards advance; again rotates and duplicate tokens do nothing',()=>{
 let s=engine.start(['a','b','a']);const token=engine.token(s);
 s=engine.grade(s,token,'again');assert.equal(s.queue.join(','),'b,a');assert.equal(s.passed.length,0);
 assert.equal(engine.grade(s,token,'remember'),s);
 s=engine.grade(s,engine.token(s),'remember');assert.equal(s.passed.join(','),'b');assert.equal(s.initial.length,2);
 for(let i=0;i<20;i++){s=engine.grade(s,engine.token(s),'again');assert.equal(s.queue.join(','),'a');assert.equal(s.passed.length,1);}
 s=engine.grade(s,engine.token(s),'remember');assert.equal(s.queue.length,0);assert.equal(s.passed.length,2);
 s=engine.undo(s);assert.equal(s.queue.join(','),'a');assert.equal(s.passed.length,1);
 assert.equal(engine.restore(JSON.stringify(s)).queue.join(','),'a');
});
test('undo again restores exact order, including the final single card; new sessions include passed cards',()=>{
 let s=engine.start(['a','b','c']);s=engine.grade(s,engine.token(s),'again');s=engine.undo(s);assert.equal(s.queue.join(','),'a,b,c');assert.equal(s.history.length,0);
 s=engine.start(['a']);const token=engine.token(s);s=engine.grade(s,token,'again');assert.equal(s.queue.length,1);assert.equal(s.passed.length,0);
 s=engine.undo(s);assert.equal(s.queue.join(','),'a');assert.equal(engine.grade(s,token,'remember'),s);
 s=engine.grade(s,engine.token(s),'remember');assert.equal(engine.start(s.initial).queue.join(','),'a');
 assert.equal(engine.restore('{broken'),null);assert.equal(engine.restore(JSON.stringify({...s,passed:['a','a']})),null);
});
test('large sessions keep all keys/history and reject the same corrupt membership cases',()=>{
 const keys=Array.from({length:12000},(_,i)=>'word-'+i);
 let session=engine.start(keys);
 session=engine.grade(session,engine.token(session),'again');
 session=engine.grade(session,engine.token(session),'remember');
 const raw=JSON.stringify(session);assert.equal(JSON.stringify(engine.restore(raw)),raw);
 for(const mutate of [s=>s.queue[0]='unknown',s=>s.queue[0]=s.passed[0],s=>s.queue.pop(),s=>s.initial.push(s.initial[0]),s=>s.history[0].key='unknown',s=>s.history[0].outcome='invalid']){
  const damaged=JSON.parse(raw);mutate(damaged);assert.equal(engine.restore(JSON.stringify(damaged)),null);
 }
 const restored=engine.undo(engine.restore(raw));assert.equal(restored.queue[0],'word-1');assert.equal(restored.initial.length,12000);assert.equal(restored.passed.length,0);
});
