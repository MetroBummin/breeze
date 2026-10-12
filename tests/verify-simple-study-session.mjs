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
