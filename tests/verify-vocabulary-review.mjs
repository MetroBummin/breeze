import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { test } from 'node:test';

const source=readFileSync(new URL('../scripts/core/vocabulary-review.js',import.meta.url),'utf8');
const context={};
new Script(source+'\nglobalThis.review=BreezeReview;').runInNewContext(context);
const review=context.review;
const DAY=86400000,MINUTE=60000,NOW=1770000000000;
const saved=(word,extra={})=>({word,ko:`${word}의 문맥 뜻`,example:`The ${word} in this sentence.`,
  book:'A saved book',addedAt:100,status:1,mark:true,...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
function freeze(value){
  if(value && typeof value==='object'){
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function remembered(result,words,at=NOW){
  return review.grade(result.state,words,result.token,'remembered',at);
}

test('uses only saved contextual Meanings, keeping source text and book intact',()=>{
  const words={wind:saved('wind',{ko:'  바람  ',example:'“Wind,” she said. <not HTML>',book:'책 & source'}),
    second:saved('wind',{ko:'감다',root:'wind',sense:true}),
    blank:saved('blank',{ko:'  ',ai:{done:true,ko:'generated'}}),
    candidate:{word:'candidate',kodict:[{terms:['후보']}],alts:['추천'],ai:{ko:'후보'}},
    missingWord:{ko:'누락'},deleted:null,badWord:saved(42),badMeaning:saved('x',{ko:5})};
  const start=review.start(null,words,NOW);
  assert.equal(start.total,2);
  assert.equal(start.card.key,'second');
  const next=remembered(start,words);
  assert.equal(next.card.word,'wind');
  assert.equal(next.card.ko,'  바람  ');
  assert.equal(next.card.example,'“Wind,” she said. <not HTML>');
  assert.equal(next.card.book,'책 & source');
  assert.equal(review.grade(next.state,words,next.token,'remembered',NOW).status,'complete');
});

test('empty, fewer than five, missing optional source, and not-yet-due states',()=>{
  assert.equal(review.start(null,{},NOW).status,'empty');
  assert.equal(review.view(null,null,NOW).status,'empty');
  const words={a:{word:'a',ko:'뜻'}};
  const start=review.start(null,words,NOW);
  assert.equal(start.total,1);
  assert.equal(start.card.example,'');
  assert.equal(start.card.book,'');
  const complete=remembered(start,words);
  assert.equal(complete.status,'complete');
  assert.equal(complete.nextDueAt,NOW+DAY);
  assert.equal(complete.eligibleCount,0);
  assert.equal(review.start(complete.state,words,NOW+DAY-1).status,'waiting');
  assert.equal(review.start(complete.state,words,NOW+DAY).status,'active');
});

test('selects at most five deterministically, without locale or insertion-order dependence',()=>{
  const entries=['z','b','a','d','c','e','f'].map(key=>[key,saved(key)]);
  const left=review.start(null,Object.fromEntries(entries),NOW);
  const right=review.start(null,Object.fromEntries([...entries].reverse()),NOW);
  assert.deepEqual(plain(left.state.session.queue),plain(right.state.session.queue));
  assert.deepEqual(plain(left.state.session.queue.map(item=>item.key)),['a','b','c','d','e']);
  assert.equal(left.total,5);
  assert.equal(left.eligibleCount,7);
});

test('oldest reviewed due cards precede oldest new cards, with stable key ties',()=>{
  const words={a:saved('a',{addedAt:50}),b:saved('b',{addedAt:100}),
    c:saved('c',{addedAt:5}),d:saved('d',{addedAt:5}),e:saved('e',{addedAt:1})};
  let state=review.normalize(null);
  for(const [key,dueAt] of [['a',NOW-10],['b',NOW-20],['e',NOW+DAY]]){
    const single=review.start(null,{[key]:words[key]},NOW-DAY);
    state.progress[key]={identity:single.card.identity,streak:1,dueAt,lastReviewedAt:NOW-DAY};
  }
  const start=review.start(state,words,NOW);
  assert.deepEqual(plain(start.state.session.queue.map(item=>item.key)),['b','a','c','d']);
  assert.equal(start.nextDueAt,NOW+DAY);
});

test('remembered schedules 1, 3, 7, 14, 30 days and caps at 30 days',()=>{
  const words={wind:saved('wind')};
  let state=null,at=NOW;
  for(const [index,days] of [1,3,7,14,30,30,30].entries()){
    const start=review.start(state,words,at);
    const complete=remembered(start,words,at);
    assert.equal(complete.accepted,true);
    assert.equal(complete.state.progress.wind.streak,Math.min(index+1,5));
    assert.equal(complete.state.progress.wind.lastReviewedAt,at);
    assert.equal(complete.state.progress.wind.dueAt,at+days*DAY);
    assert.equal(complete.remembered,1);
    state=plain(complete.state);
    at+=days*DAY;
  }
});

test('confused schedules ten minutes, resets streak, and restarts remembered at one day',()=>{
  const words={wind:saved('wind')};
  let result=remembered(review.start(null,words,NOW),words);
  result=remembered(review.start(result.state,words,NOW+DAY),words,NOW+DAY);
  assert.equal(result.state.progress.wind.streak,2);
  const at=NOW+4*DAY;
  const start=review.start(result.state,words,at);
  const confused=review.grade(start.state,words,start.token,'confused',at);
  assert.equal(confused.state.progress.wind.streak,0);
  assert.equal(confused.state.progress.wind.dueAt,at+10*MINUTE);
  assert.equal(confused.confused,1);
  assert.equal(confused.remembered,0);
  assert.equal(review.start(confused.state,words,at+10*MINUTE-1).status,'waiting');
  const retried=remembered(review.start(confused.state,words,at+10*MINUTE),words,at+10*MINUTE);
  assert.equal(retried.state.progress.wind.streak,1);
  assert.equal(retried.state.progress.wind.dueAt,at+10*MINUTE+DAY);
});

test('resumes the exact persisted queue/index, without appending newly saved words',()=>{
  const words={a:saved('a'),b:saved('b'),c:saved('c')};
  const start=review.start(null,words,NOW);
  const next=remembered(start,words);
  const persisted=plain(next.state);
  persisted.revealed=true;
  persisted.session.revealed=true;
  const reopened=review.start(persisted,{...words,z:saved('z')},NOW+5000);
  assert.equal(reopened.card.key,'b');
  assert.equal(reopened.token,next.token);
  assert.equal(reopened.total,3);
  assert.equal(reopened.completed,1);
  assert.equal(reopened.remembered,1);
  assert.deepEqual(plain(reopened.state.session.queue),plain(start.state.session.queue));
  assert.equal('revealed' in reopened.state,false);
  assert.equal('revealed' in reopened.state.session,false);
  assert.equal('revealed' in reopened,false);
});

test('accepts only the current opaque token once, including duplicate callbacks after completion',()=>{
  const words={a:saved('a'),b:saved('b')};
  const start=review.start(null,words,NOW);
  for(const [token,outcome] of [['','remembered'],['a','remembered'],[start.token,'unknown'],[{},'confused']]){
    const rejected=review.grade(start.state,words,token,outcome,NOW);
    assert.equal(rejected.accepted,false);
    assert.deepEqual(plain(rejected.state),plain(start.state));
  }
  const next=remembered(start,words);
  const duplicate=review.grade(next.state,words,start.token,'confused',NOW+1);
  assert.equal(duplicate.accepted,false);
  assert.equal(duplicate.card.key,'b');
  assert.equal(duplicate.completed,1);
  assert.equal(duplicate.state.progress.b,undefined);
  const done=remembered(next,words);
  assert.equal(done.completed,2);
  assert.equal(done.remembered,2);
  const replay=review.grade(done.state,words,next.token,'remembered',NOW+1);
  assert.equal(replay.accepted,false);
  assert.deepEqual(plain(replay.state),plain(done.state));
});

test('view never starts new work and completed sessions remain summary until start',()=>{
  const words={a:saved('a')};
  assert.equal(review.view(null,words,NOW).status,'idle');
  const done=remembered(review.start(null,words,NOW),words);
  const later=review.view(done.state,words,NOW+DAY);
  assert.equal(later.status,'complete');
  assert.equal(later.card,null);
  assert.equal(later.eligibleCount,1);
  const restarted=review.start(later.state,words,NOW+DAY);
  assert.equal(restarted.status,'active');
  assert.notEqual(restarted.token,review.start(null,words,NOW+DAY).token);
});

test('deleted or invalid current and upcoming cards skip safely without grading replacements',()=>{
  const words={a:saved('a'),b:saved('b'),c:saved('c')};
  const start=review.start(null,words,NOW);
  const changed={b:{...words.b,ko:'   '},c:words.c};
  const skipped=review.grade(start.state,changed,start.token,'remembered',NOW);
  assert.equal(skipped.accepted,false);
  assert.equal(skipped.card.key,'c');
  assert.equal(skipped.completed,2);
  assert.equal(skipped.total,3);
  assert.equal(skipped.remembered,0);
  assert.equal(skipped.confused,0);
  assert.equal(Object.keys(skipped.state.progress).length,0);
  assert.equal(review.view(skipped.state,{},NOW).status,'complete');
});

test('edited definition, word, source sentence, book or recreated key invalidates old progress',()=>{
  const words={wind:saved('wind')};
  const start=review.start(null,words,NOW);
  const done=remembered(start,words);
  for(const extra of [{word:'winds'},{ko:'수정한 뜻'},{example:'A new source sentence'},
    {book:'Another book'},{addedAt:101}]){
    const changed={wind:{...words.wind,...extra}};
    const refreshed=review.start(done.state,changed,NOW+1);
    assert.equal(refreshed.status,'active');
    assert.equal(refreshed.state.progress.wind,undefined);
    assert.notEqual(refreshed.card.identity,start.card.identity);
    const oldGrade=review.grade(start.state,changed,start.token,'remembered',NOW+1);
    assert.equal(oldGrade.accepted,false);
    assert.equal(oldGrade.status,'complete');
    assert.equal(oldGrade.state.progress.wind,undefined);
  }
});

test('learning flags, stars, metadata and picked timestamps preserve contextual identity',()=>{
  const words={wind:saved('wind')};
  const initial=review.start(null,words,NOW);
  const done=remembered(initial,words);
  const changed={wind:{...words.wind,status:3,mark:false,up:NOW+10,pickedAt:NOW+20,
    defs:[{definition:'new English metadata'}],ai:{ko:'not the saved answer',done:true}}};
  const later=review.start(done.state,changed,NOW+1);
  assert.equal(later.status,'waiting');
  assert.equal(later.state.progress.wind.identity,initial.card.identity);
});

test('prunes deleted progress and resets stale content to a new unreviewed card',()=>{
  const words={wind:saved('wind')};
  const done=remembered(review.start(null,words,NOW),words);
  const deleted=review.view(done.state,{},NOW);
  assert.equal(Object.keys(deleted.state.progress).length,0);
  const readded=review.start(deleted.state,words,NOW+1);
  assert.equal(readded.status,'active');
  assert.equal(readded.state.progress.wind,undefined);
});

test('prototype-looking keys are ordinary Meaning keys and cannot pollute state',()=>{
  const keys=['__proto__','constructor','toString','hasOwnProperty'];
  const words=Object.fromEntries(keys.map(key=>[key,saved(key)]));
  let result=review.start(null,words,NOW);
  while(result.status==='active') result=remembered(result,words);
  assert.equal(result.remembered,4);
  assert.deepEqual(Object.keys(result.state.progress).sort(),keys.sort());
  assert.equal(Object.getPrototypeOf(result.state.progress),null);
  const restored=review.start(plain(result.state),words,NOW+1);
  assert.equal(restored.status,'waiting');
  assert.equal(Object.prototype.streak,undefined);
  const inherited=Object.create({ghost:saved('ghost')});
  inherited.real=saved('real');
  assert.equal(review.start(null,inherited,NOW).total,1);
  assert.equal(review.start(null,{bad:Object.create(saved('bad'))},NOW).status,'empty');
});

test('invalid top-level schemas reset, malformed records drop, valid progress survives',()=>{
  for(const raw of [null,undefined,[],42,'{}',{}, {version:2},Object.create({version:1})]){
    const normalized=review.normalize(raw);
    assert.equal(normalized.version,1);
    assert.equal(normalized.session,null);
    assert.equal(Object.keys(normalized.progress).length,0);
  }
  const identity=review.start(null,{a:saved('a')},NOW).card.identity;
  const good={identity,streak:1,dueAt:NOW+DAY,lastReviewedAt:NOW};
  const progress={good,negative:{...good,dueAt:-1},nan:{...good,dueAt:NaN},
    fraction:{...good,streak:1.2},tooHigh:{...good,streak:6},string:{...good,dueAt:String(NOW)},
    reversed:{...good,dueAt:NOW-1},blank:{...good,identity:''},inherited:Object.create(good)};
  const state=review.normalize({version:1,sequence:'3',progress,session:42});
  assert.deepEqual(Object.keys(state.progress),['good']);
  assert.equal(state.sequence,0);
  assert.notEqual(state.progress.good,good);
});

test('corrupt sessions are discarded rather than shifting queue indexes or reusing a partial queue',()=>{
  const words={a:saved('a'),b:saved('b')};
  const initial=plain(review.start(null,words,NOW).state);
  const base=initial.session;
  for(const extra of [{queue:[]},{queue:[...base.queue,...base.queue]},
    {queue:[base.queue[0],null]},{queue:Array(6).fill(base.queue[0])},{index:-1},{index:0.5},
    {index:3},{remembered:1},{confused:1},{startedAt:'yesterday'},{id:''},
    {queue:[{key:'a'}]},{queue:[{key:'',identity:'x'}]}]){
    const normalized=review.normalize({...initial,session:{...base,...extra}});
    assert.equal(normalized.session,null,JSON.stringify(extra));
  }
});

test('all functions leave frozen input and saved vocabulary byte-for-byte unchanged',()=>{
  const words=freeze({wind:saved('wind',{ai:{ko:'AI copy'},defs:[{terms:['candidate']}]})});
  const wordsBefore=JSON.stringify(words);
  const start=review.start(null,words,NOW);
  const state=freeze(plain(start.state));
  const stateBefore=JSON.stringify(state);
  review.normalize(state);
  review.view(state,words,NOW);
  review.start(state,words,NOW+10);
  const next=review.grade(state,words,start.token,'remembered',NOW);
  assert.equal(next.accepted,true);
  assert.equal(JSON.stringify(words),wordsBefore);
  assert.equal(JSON.stringify(state),stateBefore);
  assert.equal('review' in words.wind,false);
  assert.equal(words.wind.status,1);
  assert.equal(words.wind.mark,true);
});

test('returned state and card do not alias mutable inputs or one another',()=>{
  const words={a:saved('a')};
  const start=review.start(null,words,NOW);
  const resumed=review.view(start.state,words,NOW);
  resumed.state.session.queue[0].identity='tampered';
  resumed.card.ko='tampered';
  assert.notEqual(start.state.session.queue[0].identity,'tampered');
  assert.notEqual(words.a.ko,'tampered');
  const done=remembered(start,words);
  const restored=review.normalize(done.state);
  restored.progress.a.streak=4;
  assert.equal(done.state.progress.a.streak,1);
});

test('large dictionaries remain bounded to five persisted session references',()=>{
  const words=Object.fromEntries(Array.from({length:5000},(_,index)=>[
    `word-${String(index).padStart(4,'0')}`,saved(`word ${index}`,{addedAt:index})]));
  const started=review.start(null,words,NOW);
  assert.equal(started.total,5);
  assert.equal(started.eligibleCount,5000);
  assert.equal(started.card.key,'word-0000');
  assert.equal(started.state.session.queue.length,5);
  assert.equal(Object.keys(started.state.progress).length,0);
});

test('no external APIs, Date clock, AI dependencies or stored answer visibility are required',()=>{
  const isolated={};
  new Script(source+'\nglobalThis.start=BreezeReview.start;').runInNewContext(isolated);
  const result=isolated.start(null,{a:saved('a')},NOW);
  assert.equal(result.status,'active');
  assert.equal(isolated.localStorage,undefined);
  assert.equal(isolated.fetch,undefined);
  assert.equal(isolated.words,undefined);
  assert.equal(JSON.stringify(result.state).includes('revealed'),false);
  assert.equal(review.grade(result.state,{a:saved('a')},result.token,'remembered',
    Number.MAX_SAFE_INTEGER).state.progress.a.dueAt,Number.MAX_SAFE_INTEGER);
});

test('explicit selection includes future-due meanings and preserves unrelated progress',()=>{
  const words={a:saved('a'),b:saved('b'),c:saved('c')};
  let result=review.startSelection(null,words,['a'],NOW);
  result=remembered(result,words);
  const aProgress=plain(result.state.progress.a);
  let scoped=review.startSelection(result.state,words,['b','c'],NOW);
  assert.equal(scoped.total,2);assert.equal(scoped.card.key,'b');
  scoped=remembered(scoped,words);assert.deepEqual(plain(scoped.state.progress.a),aProgress);
  const future=review.startSelection(scoped.state,words,['a'],NOW+1);
  assert.equal(future.card.key,'a');assert.equal(future.state.session.practice,true);
});
test('manual selection resumes its own queue and supports more than the daily five',()=>{
  const words=Object.fromEntries(Array.from({length:8},(_,i)=>['w'+i,saved('w'+i)])),keys=Object.keys(words);
  const start=review.startSelection(null,words,keys,NOW),graded=remembered(start,words);
  assert.equal(start.total,8);
  const resumed=review.startSelection(graded.state,words,keys,NOW+1);
  assert.equal(resumed.completed,1);assert.equal(resumed.card.key,'w1');
  const fresh=review.startSelection(resumed.state,words,['w7','w7','missing'],NOW+2);
  assert.equal(fresh.total,1);assert.equal(fresh.card.key,'w7');
});
