import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { test } from 'node:test';
import {fsrs,createEmptyCard} from 'ts-fsrs';
const oracle=fsrs({request_retention:.9,enable_fuzz:false,enable_short_term:true,learning_steps:['1m','10m'],relearning_steps:['10m']});

const source=readFileSync(new URL('../scripts/vendor/ts-fsrs-5.4.2.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../scripts/core/vocabulary-review.js',import.meta.url),'utf8');
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
  assert.equal(complete.nextDueAt,NOW+10*MINUTE);
  assert.equal(complete.eligibleCount,0);
  assert.equal(review.start(complete.state,words,NOW+10*MINUTE-1).status,'waiting');
  assert.equal(review.start(complete.state,words,NOW+10*MINUTE).status,'active');
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

test('all four ratings match upstream FSRS through learning, delayed review and relearning',()=>{
  const words={wind:saved('wind')};
  for(const initial of ['confused','uncertain','remembered','easy']){
    let state=null,at=NOW,memory=createEmptyCard(new Date(at));
    for(const outcome of [initial,'remembered','easy','confused','uncertain','remembered','remembered']){
      const start=review.start(state,words,at),rating={confused:1,uncertain:2,remembered:3,easy:4}[outcome];
      for(const [name,r] of Object.entries({confused:1,uncertain:2,remembered:3,easy:4})){
        const expected=oracle.next(memory,new Date(at),r);
        assert.equal(start.intervals[name],expected.card.due.getTime()-at);
        const branch=review.grade(start.state,words,start.token,name,at);
        assert.deepEqual(plain(branch.state.progress.wind.fsrs),plain(expected.card));
        assert.equal(branch.state.history.at(-1).schedule.rating,r);
      }
      const expected=oracle.next(memory,new Date(at),rating);
      const done=review.grade(start.state,words,start.token,outcome,at);
      assert.equal(done.accepted,true);
      assert.deepEqual(plain(done.state.history.at(-1).schedule.log),plain(expected.log));
      state=plain(done.state);memory=expected.card;at=memory.due.getTime()+3*DAY;
    }
  }
});
test('new learning steps and a lapse have distinct states, and previews equal saved schedules',()=>{
  const words={wind:saved('wind')};let start=review.start(null,words,NOW);
  let done=review.grade(start.state,words,start.token,'easy',NOW);
  assert.equal(done.state.progress.wind.fsrs.state,2);
  const at=done.state.progress.wind.dueAt+4*DAY;
  start=review.start(done.state,words,at);done=review.grade(start.state,words,start.token,'confused',at);
  assert.equal(done.state.progress.wind.fsrs.state,3);
  assert.equal(done.state.progress.wind.dueAt,at+10*MINUTE);
  assert.equal(review.start(done.state,words,at+10*MINUTE-1).status,'waiting');
  start=review.start(done.state,words,at+10*MINUTE);
  done=remembered(start,words,at+10*MINUTE);
  assert.equal(done.state.progress.wind.fsrs.state,2);
  assert.equal(done.state.progress.wind.dueAt,at+10*MINUTE+start.intervals.remembered);
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

test('edited definition, word or recreated key invalidates old progress',()=>{
  const words={wind:saved('wind')};
  const start=review.start(null,words,NOW);
  const done=remembered(start,words);
  for(const extra of [{word:'winds'},{ko:'수정한 뜻'},{addedAt:101}]){
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
  for(const raw of [null,undefined,[],42,'{}',{}, {version:99},Object.create({version:1})]){
    const normalized=review.normalize(raw);
    assert.equal(normalized.version,3);
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
  assert.equal(done.state.progress.a.streak,0);
});

test('large dictionaries remain bounded to five persisted session references',()=>{
  const words=Object.fromEntries(Array.from({length:5000},(_,index)=>[
    `word-${String(index).padStart(4,'0')}`,saved(`word ${index}`,{addedAt:index})]));
  const started=review.start(null,words,NOW);
  assert.equal(started.total,5);
  assert.equal(started.eligibleCount,20);
  assert.equal(started.newCount,5000);
  assert.equal(started.dueReviewCount,0);
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
  assert.throws(()=>review.grade(result.state,{a:saved('a')},result.token,'remembered',Number.MAX_SAFE_INTEGER),/Invalid review time/);
});

test('explicit selection includes future-due meanings and preserves unrelated progress',()=>{
  const words={a:saved('a'),b:saved('b'),c:saved('c')};
  let result=review.start(null,{a:words.a},NOW);
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

test('four grades publish exact new-card learning intervals and reject duplicate answers',()=>{
  const words={wind:saved('wind')},start=review.start(null,words,NOW);
  assert.deepEqual(plain(start.intervals),{confused:MINUTE,uncertain:6*MINUTE,remembered:10*MINUTE,easy:8*DAY});
  const done=review.grade(start.state,words,start.token,'uncertain',NOW);
  assert.equal(done.state.progress.wind.dueAt,NOW+start.intervals.uncertain);
  assert.equal(done.uncertain,1);
  assert.equal(review.grade(done.state,words,start.token,'uncertain',NOW).accepted,false);
});
test('malformed uncertain counts cannot corrupt a saved session',()=>{
  const start=review.start(null,{wind:saved('wind')},NOW);
  for(const uncertain of [-1,0.5,'1',1]){
    const raw=plain(start.state);raw.session.uncertain=uncertain;
    assert.equal(review.normalize(raw).session,null);
  }
});


const many=n=>Object.fromEntries(Array.from({length:n},(_,i)=>[`w${String(i).padStart(4,'0')}`,saved(`w${i}`,{addedAt:i})]));
function finish(view,words,at=NOW,outcome='remembered'){
  let guard=0;
  while(view.status==='active'){
    assert.ok(guard++<10001,'session terminates');
    view=review.grade(view.state,words,view.token,outcome,at);
  }
  return view;
}
test('2,000 new cards never become overdue; daily unused allocation does not roll over',()=>{
  const words=many(2000);
  let done=finish(review.start(null,words,NOW),words);
  assert.equal(done.newUsed,5);assert.equal(done.newCount,1995);assert.equal(done.dueReviewCount,0);
  const next=review.start(done.state,words,NOW+DAY);
  assert.equal(next.newUsed,0);assert.equal(next.dueRelearningCount,5);
  assert.equal(next.eligibleCount,25); // Five due + today's 20 new, never yesterday's 15.
  assert.equal(next.total,5);
});
test('1,000 overdue cards are backlog, limited separately from new cards and batch size',()=>{
  const words=many(1000),raw=review.normalize(null);
  for(const [key,word] of Object.entries(words))raw.progress[key]={identity:JSON.stringify([key,word.word,word.ko,word.addedAt]),streak:2,dueAt:NOW-1,lastReviewedAt:NOW-DAY};
  const state=review.configure(raw,{reviewLimit:7,newLimit:0,batchSize:20});
  const view=review.start(state,words,NOW);
  assert.equal(view.dueReviewCount,1000);assert.equal(view.eligibleCount,7);assert.equal(view.total,7);
  const done=finish(view,words);
  assert.equal(done.reviewUsed,7);assert.equal(done.newUsed,0);assert.equal(done.dueReviewCount,993);
  assert.equal(review.start(done.state,words,NOW).status,'waiting');
  assert.equal(review.start(done.state,words,NOW,true).total,20);
});
test('zero new limit and independent review budget, with explicit extra batches',()=>{
  const words=many(12);
  const zero=review.configure(null,{newLimit:0,batchSize:10});
  assert.equal(review.start(zero,words,NOW).total,0);
  let result=finish(review.start(zero,words,NOW,true),words);
  assert.equal(result.newUsed,10);assert.equal(result.responses,10);
  assert.equal(review.start(result.state,words,NOW).status,'waiting');
  result=review.start(result.state,words,NOW,true);
  assert.equal(result.total,2);
  const tomorrow=review.view(result.state,words,NOW+DAY);
  assert.equal(tomorrow.status,'paused','extra authorization expires at local midnight');
});
test('daily relearning increases responses, not distinct new/review card counts',()=>{
  const words={a:saved('a')};
  const raw=review.configure(null,{newLimit:1,reviewLimit:0});
  let result=finish(review.start(raw,words,NOW),words,NOW,'confused');
  assert.equal(result.newUsed,1);assert.equal(result.reviewUsed,0);assert.equal(result.responses,1);
  assert.equal(result.relearningCount,1);assert.equal(result.nextRelearningAt,NOW+MINUTE);
  assert.equal(review.start(result.state,words,NOW+MINUTE-1).status,'waiting');
  result=finish(review.start(result.state,words,NOW+10*MINUTE),words,NOW+10*MINUTE,'confused');
  result=finish(review.start(result.state,words,NOW+20*MINUTE),words,NOW+20*MINUTE);
  assert.equal(result.newUsed,1);assert.equal(result.reviewUsed,0);assert.equal(result.responses,3);
  assert.equal(result.learningCount,1);
  assert.deepEqual(plain(result.state.history.map(event=>event.kind)),['new','learning','learning']);
});
test('due relearning precedes overdue review, then new cards',()=>{
  const words={a:saved('a'),b:saved('b'),c:saved('c')},state=review.normalize(null);
  for(const key of ['a','b'])state.progress[key]={identity:JSON.stringify([key,words[key].word,words[key].ko,words[key].addedAt]),streak:1,dueAt:NOW-1,lastReviewedAt:NOW-DAY,relearning:key==='b'};
  const view=review.start(state,words,NOW);
  assert.deepEqual(plain(view.state.session.queue.map(ref=>ref.key)),['b','a','c']);
});
test('short early practice does not graduate cards, consume new limits or alter progress',()=>{
  const words={a:saved('a'),b:saved('b')};
  let result=finish(review.start(null,{a:words.a},NOW),{a:words.a});
  const before=plain(result.state.progress);
  for(let i=0;i<8;i++)result=finish(review.startSelection(result.state,words,['a','b'],NOW+i),words,NOW+i);
  assert.deepEqual(plain(result.state.progress),before);
  assert.equal(result.newUsed,1);assert.equal(result.responses,1);assert.equal(result.practiceResponses,16);
  assert.equal(result.state.history.filter(event=>event.kind==='practice').length,16);
});
test('shrinking limits or batch sizes preserves interrupted queues, including midnight resume',()=>{
  const words=many(20);
  let view=review.start(review.configure(null,{newLimit:20,batchSize:10}),words,NOW);
  view=remembered(view,words);
  const queue=plain(view.state.session.queue);
  const lowered=review.configure(view.state,{newLimit:1,batchSize:5});
  const paused=review.start(lowered,words,NOW);
  assert.equal(paused.status,'paused');assert.equal(paused.completed,1);
  assert.deepEqual(plain(paused.state.session.queue),queue);
  const tomorrow=review.start(paused.state,words,NOW+DAY);
  assert.equal(tomorrow.status,'active');assert.equal(tomorrow.card.key,'w0000','review due overnight precedes the parked new queue');
  const reviewed=remembered(tomorrow,words,NOW+DAY);
  const resumed=review.start(reviewed.state,words,NOW+DAY);
  assert.equal(resumed.card.key,'w0001');assert.equal(resumed.total,10,'existing queue remains intact');
  const next=remembered(resumed,words,NOW+DAY);
  assert.equal(next.status,'paused');assert.equal(next.newUsed,1);
});
test('switching between practice scopes and regular study retains all unanswered queues',()=>{
  const words=many(8);
  let regular=remembered(review.start(null,words,NOW),words);
  let practice=remembered(review.startSelection(regular.state,words,['w0006','w0007'],NOW),words);
  const other=review.startSelection(practice.state,words,['w0005'],NOW);
  const restored=review.start(other.state,words,NOW);
  assert.equal(restored.token,regular.token);
  const restoredPractice=review.startSelection(restored.state,words,['w0006','w0007'],NOW);
  assert.equal(restoredPractice.token,practice.token);
  const empty=review.startSelection(restoredPractice.state,words,[],NOW);
  assert.equal(empty.token,practice.token);
});
test('practice batches keep their remaining selected scope through restart and smaller next batch',()=>{
  const words=many(12),keys=Object.keys(words);
  let view=finish(review.startSelection(null,words,keys,NOW,5),words);
  assert.equal(view.total,5);assert.equal(view.practiceRemaining,7);
  view=review.startSelection(plain(view.state),words,keys,NOW+1,2);
  assert.equal(view.total,2);assert.equal(view.card.key,'w0005');
  view=finish(view,words);
  assert.equal(view.practiceRemaining,5);
  assert.equal(view.remembered,2);
});
test('source title and context edits preserve identities and progress',()=>{
  const words={a:saved('a')},start=review.start(null,words,NOW),done=remembered(start,words);
  const changed={a:{...words.a,example:'Updated sentence',book:'Renamed book'}};
  assert.deepEqual(plain(review.view(done.state,changed,NOW).state.progress),plain(done.state.progress));
  const current=review.view(start.state,changed,NOW);
  assert.equal(current.token,start.token);assert.equal(current.card.book,'Renamed book');
});
test('v1 migration preserves progress, due times and partial sessions with source edits',()=>{
  const words={a:saved('a'),b:saved('b')};
  const refs=Object.entries(words).map(([key,w])=>({key,identity:JSON.stringify([key,w.word,w.ko,w.example,w.book,w.addedAt])}));
  const raw={version:1,sequence:7,progress:{a:{identity:refs[0].identity,streak:2,dueAt:NOW+DAY,lastReviewedAt:NOW}},
    session:{id:'legacy',startedAt:NOW,queue:refs,index:1,remembered:1,confused:0}};
  const view=review.start(raw,{a:{...words.a,book:'Edited'},b:{...words.b,example:'Edited'}},NOW);
  assert.equal(view.state.version,3);assert.equal(view.card.key,'b');assert.equal(view.completed,1);
  assert.equal(view.state.progress.a.streak,2);assert.equal(view.state.progress.a.dueAt,NOW+DAY);
  assert.equal(view.legacyUsage,true);assert.equal(view.newUsed,1);assert.equal(view.reviewUsed,1);
  const migrated=review.normalize(plain(view.state));
  assert.deepEqual(plain(migrated),plain(view.state),'migration runs only once');
  assert.equal(raw.version,1,'source untouched');
});
test('failed commits and duplicate callbacks never persist a second response or event',()=>{
  const words=many(3),view=review.start(null,words,NOW),durable=plain(view.state);
  const failed=remembered(view,words); // caller cannot save this value
  const retry=review.grade(durable,words,view.token,'remembered',NOW);
  assert.deepEqual(plain(retry.state),plain(failed.state));
  const duplicate=review.grade(retry.state,words,view.token,'remembered',NOW);
  assert.equal(duplicate.accepted,false);assert.equal(duplicate.responses,1);assert.equal(duplicate.state.history.length,1);
});
test('local calendar date changes reset budgets without altering old daily totals',()=>{
  const before=new Date(2026,9,2,23,59,30).getTime(),after=new Date(2026,9,3,0,0,30).getTime(),words=many(10);
  const done=finish(review.start(review.configure(null,{newLimit:1}),words,before),words,before);
  assert.equal(done.newUsed,1);
  const next=review.start(done.state,words,after);
  assert.equal(next.newUsed,0);assert.equal(next.total,1);assert.equal(next.newCount,9);
  assert.equal(Object.values(next.state.daily)[0].new.length,1);
});

test('due relearning preempts a resumed queue without losing unanswered cards',()=>{
  const words=many(8);
  let view=review.start(review.configure(null,{newLimit:2}),words,NOW);
  view=review.grade(view.state,words,view.token,'confused',NOW);
  const savedQueue=plain(view.state.session.queue),oldToken=view.token;
  view=review.start(view.state,words,NOW+10*MINUTE);
  assert.equal(view.card.key,'w0000');assert.equal(view.total,1);
  view=finish(view,words,NOW+10*MINUTE);
  view=review.start(view.state,words,NOW+10*MINUTE);
  assert.equal(view.token,oldToken);assert.deepEqual(plain(view.state.session.queue),savedQueue);
});

test('deleted practice references do not restart already answered selected cards',()=>{
  const words=many(8),keys=Object.keys(words);
  let view=remembered(review.startSelection(null,words,keys,NOW,5),words);
  const token=view.token;delete words.w0007;
  view=review.startSelection(view.state,words,keys,NOW,5);
  assert.equal(view.token,token);assert.equal(view.completed,1);
});

function dueState(words,limit=100,batch=5){
  const state=review.configure(null,{newLimit:0,reviewLimit:limit,batchSize:batch});
  for(const [key,w] of Object.entries(words))state.progress[key]={identity:JSON.stringify([key,w.word,w.ko,w.addedAt]),streak:1,dueAt:NOW-1,lastReviewedAt:NOW-DAY};
  return state;
}
function answerJourney(view,words,n,outcome='remembered',at=NOW){
  for(let i=0;i<n;i++){
    if(!view.card)view=review.startJourney(view.state,words,at);
    assert.ok(view.card,'scheduled journey has a card');
    view=review.grade(view.state,words,view.token,outcome,at);
  }
  return view;
}
test('100 cards use a tiny opening and progressively larger stages with durable partial progress',()=>{
  const words=many(100);let view=review.startJourney(dueState(words),words,NOW);
  assert.equal(view.journey.target,100);assert.equal(view.journey.stages,5);
  for(let stage=1;stage<=5;stage++){
    view=answerJourney(view,words,[5,10,20,30,35][stage-1]);
    assert.equal(view.journey.done,[5,15,35,65,100][stage-1]);assert.equal(view.journey.milestone,stage);
    assert.equal(view.card,null,'a milestone waits for an explicit continue');
    const restored=review.view(plain(view.state),words,NOW);
    assert.deepEqual(plain(restored.journey),plain(view.journey));
  }
  assert.equal(view.reviewUsed,100);assert.equal(view.responses,100);
});
test('300-card goals stop only at their five stage boundaries',()=>{
  const words=many(300);let view=review.startJourney(dueState(words,300,60),words,NOW);
  assert.equal(view.journey.target,300);assert.equal(view.total,300);
  const milestones=[];
  for(let i=1;i<=300;i++){
    if(![1,16,46,106,196].includes(i))assert.ok(view.card,`No batch stop before answer ${i}`);
    if(!view.card)view=review.startJourney(view.state,words,NOW);
    view=remembered(view,words);
    if(view.journey.milestone)milestones.push([i,view.journey.milestone]);
  }
  assert.deepEqual(milestones,[[15,1],[45,2],[105,3],[195,4],[300,5]]);
});
test('a 60-card cap over 100 due cards completes the goal and leaves 40 pending',()=>{
  const words=many(100);let view=review.startJourney(dueState(words,60),words,NOW);
  assert.equal(view.journey.target,60);
  view=answerJourney(view,words,60);
  assert.equal(view.journey.done,60);assert.equal(view.journey.milestone,5);
  assert.equal(view.dueReviewCount,40);assert.equal(Object.keys(view.state.progress).length,100);
  const capped=review.startJourney(view.state,words,NOW);assert.equal(capped.card,null);
  const extra=review.startJourney(capped.state,words,NOW,true);assert.ok(extra.card);
});
test('failed answers earn milestones while repeated same-card attempts never earn duplicate progress',()=>{
  const words=many(20);let view=review.startJourney(dueState(words,20),words,NOW);
  view=answerJourney(view,words,20,'confused');
  assert.equal(view.journey.done,20);assert.equal(view.journey.milestone,5);
  assert.equal(view.relearningCount,20);assert.equal(view.journey.repeats,0);
  view=review.startJourney(view.state,words,NOW+10*MINUTE);
  view=answerJourney(view,words,4,'remembered',NOW+10*MINUTE);
  assert.equal(view.journey.done,20);assert.equal(view.journey.distinct,20);assert.equal(view.journey.repeats,4);
  assert.equal(view.journey.milestone,0);assert.equal(view.reviewUsed,20);assert.equal(view.responses,24);
});
test('new cards remain independent, practice does not fill stages, and small goals do not invent empty stages',()=>{
  const words=many(3);let view=review.startJourney(null,words,NOW);
  assert.equal(view.journey.target,3);assert.equal(view.journey.stages,3);
  view=remembered(view,words);assert.equal(view.journey.milestone,1);
  const progress=view.journey.done;
  const practice=finish(review.startSelection(view.state,words,Object.keys(words),NOW),words);
  assert.equal(practice.journey,null);
  const resumed=review.startJourney(practice.state,words,NOW);
  assert.equal(resumed.journey.done,progress);assert.equal(resumed.journey.milestone,0);
});
test('first relearning on a later day uses one review slot; its same-day repetitions use none',()=>{
  const words={a:saved('a')};
  let view=finish(review.start(null,words,NOW),words,NOW,'confused');
  view=review.startJourney(review.configure(view.state,{reviewLimit:1}),words,NOW+DAY);
  view=review.grade(view.state,words,view.token,'confused',NOW+DAY);
  assert.equal(view.newUsed,0);assert.equal(view.reviewUsed,1);
  view=review.startJourney(view.state,words,NOW+DAY+10*MINUTE);
  view=review.grade(view.state,words,view.token,'remembered',NOW+DAY+10*MINUTE);
  assert.equal(view.reviewUsed,1);assert.equal(view.journey.distinct,1);assert.equal(view.journey.repeats,1);
});
test('milestone save failure and duplicate clicks neither lose nor double-award a stage',()=>{
  const words=many(5),initial=review.startJourney(dueState(words,5),words,NOW);
  const pending=remembered(initial,words),retried=remembered(initial,words);
  assert.deepEqual(plain(pending.state),plain(retried.state));assert.equal(pending.journey.milestone,1);
  const duplicate=review.grade(pending.state,words,initial.token,'remembered',NOW);
  assert.equal(duplicate.accepted,false);assert.equal(duplicate.responses,1);
  assert.equal(duplicate.journey.milestone,1);
});
test('goals remain stable on added cards or increased limits, and cap reductions preserve unanswered queues',()=>{
  const words=many(100);let view=review.startJourney(dueState(words,100),words,NOW);
  view=answerJourney(view,words,20);
  const refs=plain(view.state.session.queue);
  view=review.startJourney(review.configure(view.state,{reviewLimit:60}),words,NOW);
  assert.equal(view.journey.target,60);assert.equal(view.journey.done,20);
  view=review.startJourney(review.configure(view.state,{reviewLimit:300}),words,NOW);
  assert.equal(view.journey.target,60);
  assert.equal(Object.keys(view.state.progress).length,100);
  assert.equal(refs.length,100);
  const tomorrow=review.startJourney(view.state,words,NOW+DAY);
  assert.equal(tomorrow.journey.done,0);assert.ok(tomorrow.journey.target>0);
});

test('integer stage sizes never decrease, even with small goals',()=>{
  for(let target=1;target<=350;target++){
    const words=many(target),view=review.startJourney(dueState(words,target),words,NOW);
    const ends=plain(view.journey.ends),sizes=ends.map((n,i)=>n-(ends[i-1]||0));
    assert.equal(ends.at(-1),target);assert.ok(sizes.every((n,i)=>n>0&&(!i||n>=sizes[i-1])),String(target));
  }
});

test('one daily cap combines scheduled review and new cards without starving due priority',()=>{
  const words=many(100),state=dueState(Object.fromEntries(Object.entries(words).slice(0,40)),100);
  let view=review.startJourney(review.configure(state,{dailyLimit:60}),words,NOW);
  assert.equal(view.journey.target,60);
  view=answerJourney(view,words,60);
  assert.equal(view.reviewUsed,40);assert.equal(view.newUsed,20);assert.equal(view.uniqueUsed,60);
  assert.equal(view.newCount,40);assert.equal(view.journey.milestone,5);
  view=review.startJourney(view.state,words,NOW);assert.equal(view.card,null);
  view=review.startJourney(view.state,words,NOW,true);assert.ok(view.card);
});
test('combined zero cap, reduction, repeated failures and next-day reset preserve data',()=>{
  const words=many(20);let view=review.startJourney(review.configure(null,{dailyLimit:0}),words,NOW);
  assert.equal(view.card,null);assert.equal(view.newCount,20);
  view=review.startJourney(review.configure(view.state,{dailyLimit:10}),words,NOW);
  view=answerJourney(view,words,3,'confused');
  const reduced=review.configure(view.state,{dailyLimit:2}),queue=plain(reduced.session.queue);
  view=review.startJourney(reduced,words,NOW);assert.equal(view.card,null);
  assert.deepEqual(plain(view.state.session.queue),queue);
  view=review.startJourney(view.state,words,NOW+10*MINUTE);
  view=answerJourney(view,words,3,'remembered',NOW+10*MINUTE);
  assert.equal(view.uniqueUsed,3);assert.equal(view.responses,6);
  view=review.startJourney(view.state,words,NOW+DAY);assert.equal(view.uniqueUsed,0);assert.ok(view.card);
});

test('v2 migration retains real history and due dates without inventing FSRS memory or answers',()=>{
  const words={a:saved('a')},ref=review.start(null,words,NOW).card.identity;
  const event={id:'actual-v2-answer',at:NOW-DAY,identity:ref,kind:'review',outcome:'uncertain'};
  const old={version:2,progress:{a:{identity:ref,streak:4,dueAt:NOW+2*DAY,lastReviewedAt:NOW-DAY}},history:[event]};
  const migrated=review.normalize(old);
  assert.deepEqual(plain(migrated.history),[event]);
  assert.equal(migrated.progress.a.fsrs,null);
  assert.equal(migrated.progress.a.dueAt,old.progress.a.dueAt);
  assert.equal(review.start(migrated,words,NOW).status,'waiting');
  const at=NOW+5*DAY,start=review.start(migrated,words,at);
  const done=review.grade(start.state,words,start.token,'easy',at);
  assert.equal(done.state.history.length,2);
  const log=done.state.history[1].schedule;
  assert.equal(log.before,null);assert.equal(log.scheduledAt,NOW+2*DAY);assert.equal(log.answeredAt,at);
  assert.deepEqual(plain(done.state.progress.a.fsrs),plain(oracle.next(createEmptyCard(new Date(at)),new Date(at),4).card));
  assert.equal(done.state.progress.a.legacy.streak,4);
});

test('timezone and DST boundaries reset unique caps but preserve absolute FSRS dates',()=>{
  const previous=process.env.TZ;
  try{for(const zone of ['UTC','Asia/Seoul','America/New_York']){
    process.env.TZ=zone;
    for(const [year,month,date] of [[2026,2,8],[2026,10,1]]){
      const at=new Date(year,month,date,23,59,30).getTime(),after=at+60000,words={a:saved('a'),b:saved('b')};
      const start=review.startJourney(review.configure(null,{dailyLimit:1}),words,at);
      const first=review.grade(start.state,words,start.token,'confused',at);
      assert.equal(first.uniqueUsed,1);assert.equal(first.journey.done,1);
      const due=first.state.progress.a.dueAt;
      assert.equal(due,after);
      const resume=review.startJourney(plain(first.state),words,after);
      assert.equal(resume.uniqueUsed,0);assert.equal(resume.card.key,'a');
      const second=review.grade(resume.state,words,resume.token,'confused',after);
      assert.equal(second.uniqueUsed,1);assert.equal(second.newUsed,0);assert.equal(second.reviewUsed,1);
      assert.equal(second.state.history[1].schedule.scheduledAt,due);
      assert.equal(Object.keys(second.state.daily).length,2);
    }
  }}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('elapsed time uses the actual answer timestamp and memory survives serialization',()=>{
  const words={a:saved('a')},start=review.start(null,words,NOW);
  const first=review.grade(start.state,words,start.token,'easy',NOW);
  const original=first.state.progress.a.fsrs,at=first.state.progress.a.dueAt+21*DAY;
  const next=review.start(plain(first.state),words,at);
  const answeredAt=at+3*DAY,done=review.grade(next.state,words,next.token,'remembered',answeredAt);
  assert.equal(done.state.history.at(-1).at,answeredAt);
  assert.deepEqual(plain(done.state.progress.a.fsrs),plain(oracle.next(original,new Date(answeredAt),3).card));
  assert.notDeepEqual(plain(done.state.progress.a.fsrs),plain(oracle.next(original,new Date(at),3).card));
});

 test('legacy five-card queues bridge directly into the rest of a stage',()=>{
  const words=many(100);let view=review.startJourney(dueState(words),words,NOW);
  view=answerJourney(view,words,5);
  view=review.startJourney(view.state,words,NOW);
  view.state.session.queue=view.state.session.queue.slice(0,10);
  view.state.session.batchEnd=10;
  for(let i=6;i<=15;i++){
    assert.ok(view.card,`stage two has no artificial stop at ${i}`);
    view=review.grade(view.state,words,view.token,'remembered',NOW);
  }
  assert.equal(view.journey.milestone,2);assert.equal(view.journey.done,15);
 });
