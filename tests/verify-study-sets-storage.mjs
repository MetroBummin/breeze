import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=['../scripts/core/study-sets.js','../scripts/core/study-sets-storage.js'].map(path=>readFileSync(new URL(path,import.meta.url),'utf8')).join('\n');
const key='breeze.study-sets.v1';
const words={a:{word:'wind',ko:'바람',book:'A',example:'The wind blew.'}};
function world(initial){
 const data=new Map(initial===undefined?[]:[[key,initial]]),writes=[];
 let fail=false;
 const context={localStorage:{getItem:k=>data.get(k)??null,setItem(k,v){if(fail)throw new Error('QuotaExceededError');writes.push([k,v]);data.set(k,v);}}};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.engine=BreezeStudySets;',context);
 return {context,data,writes,setFail:value=>fail=value};
}
test('legacy vocabulary and review remain untouched; new snapshots reload independently',()=>{
 const w=world();w.data.set('breeze.words','legacy');w.data.set('breeze.vocabulary-review.v1','dormant');
 const next=w.context.engine.create(w.context.readStudySets(),{name:'Exam',bookTitles:['A']},words,100).state;
 w.context.commitStudySets(next);
 assert.equal(w.data.get('breeze.words'),'legacy');assert.equal(w.data.get('breeze.vocabulary-review.v1'),'dormant');
 assert.deepEqual(w.writes.map(([k])=>k),[key]);
 const reload=world(w.data.get(key));assert.equal(reload.context.readStudySets().sets[0].cards[0].ko,'바람');
});
test('failed write does not advance persisted state and same action is retryable',()=>{
 const w=world(),next=w.context.engine.create(w.context.readStudySets(),{name:'Exam',bookTitles:['A']},words,100).state;
 w.setFail(true);assert.throws(()=>w.context.commitStudySets(next),/Quota/);assert.equal(w.data.has(key),false);
 w.setFail(false);w.context.commitStudySets(next);assert.equal(w.context.readStudySets().sets.length,1);
});
test('v1 migration backs up exact bytes; backup failure blocks replacing the collection',()=>{
 const initial=world(),state=initial.context.engine.create(null,{name:'Legacy',bookTitles:['A']},words,100).state;
 state.version=1;const raw=JSON.stringify(state),w=world(raw),next=w.context.readStudySets();
 w.setFail(true);assert.throws(()=>w.context.commitStudySets(next),/Quota/);assert.equal(w.data.get(key),raw);
 w.setFail(false);w.context.commitStudySets(next);assert.equal(w.data.get(key+'.backup-v1'),raw);
 assert.equal(JSON.parse(w.data.get(key)).version,2);
});
test('unread or changed storage is not overwritten by stale action',()=>{
 const w=world();assert.throws(()=>w.context.commitStudySets(w.context.engine.normalize(null)),/changed/);
 const next=w.context.engine.create(w.context.readStudySets(),{name:'Old',bookTitles:['A']},words,100).state;
 const fresh=JSON.stringify(w.context.engine.create(null,{name:'Other tab',bookTitles:['A']},words,200).state);
 w.data.set(key,fresh);assert.throws(()=>w.context.commitStudySets(next),/changed/);assert.equal(w.data.get(key),fresh);
});
test('malformed and future schema stay intact when read or write is attempted',()=>{
 for(const raw of ['{bad json',JSON.stringify({version:99,sets:[]}),JSON.stringify({version:1,sets:'broken'})]){
  const w=world(raw);assert.throws(()=>w.context.readStudySets());assert.throws(()=>w.context.commitStudySets(w.context.engine.normalize(null)));assert.equal(w.data.get(key),raw);assert.equal(w.writes.length,0);
 }
});
test('static app ships set model, storage and UI in dependency order without enabling scheduled review',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const core=html.indexOf('scripts/core/study-sets.js'),storage=html.indexOf('scripts/core/study-sets-storage.js'),ui=html.indexOf('scripts/ui/study-sets.js');
 assert.ok(core>0&&storage>core&&ui>storage);
 const home=html.indexOf('id="v-memory"'),vocab=html.indexOf('id="v-vocab"');assert.ok(home>0&&vocab>home);
 assert.match(html,/id="study-sets-home-list"/);assert.match(html,/id="v-memory-set"/);
 assert.doesNotMatch(html,/id="wordbook-sets-back"|id="wordbook-study-sets-entry"/);
 assert.match(html,/id="wordbook-review"[^>]+onclick="openStudySetsDirectory\(\)"[^>]*>학습하기<\/button>/);
 assert.match(html,/styles\/study-sets\.css/);
 assert.match(readFileSync(new URL('../scripts/ui/vocabulary-review.js',import.meta.url),'utf8'),/const ADVANCED_VOCABULARY_REVIEW_ENABLED=false;/);
 const model=readFileSync(new URL('../scripts/core/study-sets.js',import.meta.url),'utf8');assert.doesNotMatch(model,/\b(?:fetch|XMLHttpRequest|saveWords|queueWordSync)\s*\(/);
});
