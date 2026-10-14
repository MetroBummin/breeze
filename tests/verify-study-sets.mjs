import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { test } from 'node:test';

const source=readFileSync(new URL('../scripts/core/study-sets.js',import.meta.url),'utf8');
const context={};
// Intentionally no DOM, storage, scheduling library, clock or network globals.
new Script(source+'\nglobalThis.studySets=BreezeStudySets;').runInNewContext(context);
const sets=context.studySets,NOW=1780000000000;
const plain=value=>JSON.parse(JSON.stringify(value));
const saved=(word,extra={})=>({word,ko:`${word} 뜻`,example:`The ${word} in this sentence.`,book:'Book A',addedAt:10,...extra});
const words={a:saved('a'),b:saved('b',{book:'Book B',addedAt:20}),c:saved('c',{book:'Book A',addedAt:30})};
const create=(inventory=words,options={name:'My snapshot',bookTitles:['Book A','Book B']})=>sets.create(null,options,inventory,NOW);
function freeze(value){
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
function answer(current,outcome='remembered',at=NOW){
  const revealed=sets.reveal(current.state,current.set.id,current.token);
  assert.equal(revealed.accepted,true);
  return sets.grade(revealed.state,current.set.id,revealed.token,outcome,at);
}
function start(inventory=words){const created=create(inventory);return sets.start(created.state,created.set.id,NOW);}

test('creates a fixed snapshot from only selected books and real saved Meanings',()=>{
  const inventory={...words,d:saved('other',{book:'Book C'}),
    blank:saved('blank',{ko:'  ',ai:{done:true,ko:'not saved'}}),
    suggestion:{word:'suggestion',ai:{ko:'not saved'},kodict:[{terms:['dictionary answer']}]},
    emptyWord:saved('  '),invalidWord:saved(42),invalidMeaning:saved('x',{ko:22}),deleted:null};
  const result=create(inventory);
  assert.equal(result.accepted,true);
  assert.equal(result.state.version,2);
  assert.equal(result.set.name,'My snapshot');
  assert.equal(result.set.cards.length,3);
  assert.deepEqual(plain(result.set.bookTitles),['Book A','Book B']);
  assert.deepEqual(plain(result.set.cards.map(card=>card.key)),['a','b','c']);
  assert.equal(result.set.session,null);
  assert.equal(sets.view(result.state,result.set.id).status,'idle');
  assert.deepEqual(plain(sets.cards(inventory,[])),[]);
  assert.equal(sets.cards(inventory).length,4);
});

test('the same exact meaning across sources is one card while distinct meanings survive',()=>{
  const inventory={a:saved('wind',{ko:'바람',book:'Book A',addedAt:10}),
    b:saved('wind',{ko:'바람',book:'Book B',addedAt:20,example:'A later occurrence.'}),
    c:saved('wind',{ko:'감다',book:'Book B',root:'a',sense:true,addedAt:30})};
  const created=create(inventory);
  assert.equal(created.set.cards.length,2);
  assert.equal(created.set.cards[0].key,'a');
  assert.equal(created.set.cards[0].example,inventory.a.example);
  assert.notEqual(created.set.cards[0].id,created.set.cards[1].id);
  // Key/time/root/source are provenance, not semantic identity.
  const duplicate=sets.cards({other:saved('wind',{ko:'바람',book:'Book B',root:'different',addedAt:900})});
  assert.equal(duplicate[0].id,created.set.cards[0].id);
  assert.deepEqual(plain(sets.cards(Object.fromEntries(Object.entries(inventory).reverse()))),plain(created.set.cards));
});

test('retains exact saved text and missing source; never normalizes distinct saved definitions',()=>{
  const inventory={a:saved('  wind  ',{ko:'  바람  ',example:'“Wind,” she said. <not HTML>',book:'책 & source'}),
    b:saved('wind',{ko:'바람',example:null,book:null})};
  const snapshots=sets.cards(inventory);
  assert.equal(snapshots.length,2);
  assert.equal(snapshots[0].word,'  wind  ');
  assert.equal(snapshots[0].ko,'  바람  ');
  assert.equal(snapshots[0].example,'“Wind,” she said. <not HTML>');
  assert.equal(snapshots[0].book,'책 & source');
  assert.equal(snapshots[1].example,'');
  assert.equal(snapshots[1].book,'');
});

test('supports set create, rename and delete independently from the vocabulary',()=>{
  const inventory=freeze(plain(words)),initial=freeze(sets.normalize(null));
  const first=sets.create(initial,{name:'  First  ',bookTitles:['Book A','Book A','Book B']},inventory,NOW);
  assert.equal(first.set.name,'First');
  assert.deepEqual(plain(initial),{version:2,sequence:0,sets:[]});
  const second=sets.create(freeze(first.state),{name:'Second',bookTitles:['Book A']},inventory,NOW+1);
  assert.notEqual(second.set.id,first.set.id);
  assert.equal(second.state.sets.length,2);
  const renamed=sets.rename(freeze(second.state),first.set.id,'  New name  ',NOW+2);
  assert.equal(renamed.accepted,true);
  assert.equal(renamed.set.name,'New name');
  assert.equal(renamed.set.updatedAt,NOW+2);
  assert.equal(sets.rename(renamed.state,first.set.id,'New name',NOW+3).accepted,false);
  assert.equal(sets.rename(renamed.state,first.set.id,'  ',NOW+3).accepted,false);
  const removed=sets.remove(freeze(renamed.state),first.set.id);
  assert.equal(removed.accepted,true);
  assert.equal(removed.state.sets.length,1);
  assert.equal(removed.state.sets[0].id,second.set.id);
  assert.equal(sets.view(removed.state,first.set.id).status,'missing');
  assert.deepEqual(plain(inventory),words);
});

test('invalid creation never broadens an empty book selection; selected empty books are empty',()=>{
  for(const options of [{name:'',bookTitles:['Book A']},{name:'Set',bookTitles:[]},{name:'Set'},null]){
    assert.equal(sets.create(null,options,words,NOW).accepted,false);
  }
  const created=create(words,{name:'Empty',bookTitles:['Missing book']});
  assert.equal(created.accepted,true);
  assert.equal(created.set.cards.length,0);
  assert.equal(sets.start(created.state,created.set.id,NOW).status,'empty');
  assert.equal(sets.start(created.state,created.set.id,NOW).total,0);
});

test('exclusion persists by semantic ID, survives import, and restores the original snapshot explicitly',()=>{
  let created=create(),state=created.state,id=created.set.id;
  const card=created.set.cards[0],original=plain(card);
  let result=sets.exclude(freeze(state),id,card.id,NOW+1);
  assert.equal(result.accepted,true);
  assert.equal(result.set.cards.length,3);
  assert.deepEqual(plain(result.set.excludedIds),[card.id]);
  assert.equal(sets.start(result.state,id,NOW+2).total,2);
  state=sets.decode(JSON.stringify(result.state));
  const inventory={...words,newRecord:saved(card.word,{ko:card.ko,book:'Book B',example:'changed example'}),newWord:saved('fresh')};
  result=sets.importNew(state,id,inventory,NOW+3);
  assert.equal(result.added,1);
  assert.deepEqual(plain(result.set.excludedIds),[card.id]);
  assert.deepEqual(plain(result.set.cards.find(item=>item.id===card.id)),original);
  assert.equal(sets.exclude(result.state,id,card.id,NOW+4).accepted,false);
  result=sets.restore(freeze(result.state),id,card.id,NOW+5);
  assert.equal(result.accepted,true);
  assert.deepEqual(plain(result.set.excludedIds),[]);
  assert.deepEqual(plain(result.set.cards.find(item=>item.id===card.id)),original);
  assert.equal(sets.start(result.state,id,NOW+6).total,4);
  assert.equal(sets.restore(result.state,id,card.id,NOW+7).accepted,false);
});

test('explicit import adds only new identities, preserving edits, order and exclusions',()=>{
  const created=create(),id=created.set.id,original=plain(created.set.cards);
  const inventory={...words,a:{...words.a,example:'edited example',book:'Book B'},
    secondSense:saved('a',{ko:'다른 뜻'}),fresh:saved('fresh'),outside:saved('outside',{book:'Book C'})};
  const preview=sets.importPreview(freeze(created.state),id,freeze(inventory));
  assert.equal(preview.count,2);
  assert.deepEqual(plain(created.set.cards),original);
  const imported=sets.importNew(created.state,id,inventory,NOW+1);
  assert.equal(imported.accepted,true);
  assert.equal(imported.added,2);
  assert.deepEqual(plain(imported.set.cards.slice(0,3)),original);
  assert.equal(sets.importPreview(imported.state,id,inventory).count,0);
  assert.equal(sets.importNew(imported.state,id,inventory,NOW+2).accepted,false);
  assert.equal(sets.importNew(imported.state,id,{},NOW+3).set.cards.length,5);
});

test('source edits and removal cannot erase or mutate the saved set snapshot',()=>{
  const inventory=plain(words),created=create(inventory),original=plain(created.set.cards),id=created.set.id;
  inventory.a.ko='changed';inventory.a.example='new source';delete inventory.b;
  assert.deepEqual(plain(sets.view(created.state,id).set.cards),original);
  const withoutSources=sets.importNew(created.state,id,{},NOW+1);
  assert.deepEqual(plain(withoutSources.set.cards),original);
  const run=sets.start(withoutSources.state,id,NOW+2);
  assert.equal(run.total,3);
  assert.equal(run.card.ko,original[0].ko);
  assert.equal(run.card.example,original[0].example);
  const reloaded=sets.decode(JSON.stringify(run.state));
  assert.deepEqual(plain(sets.view(reloaded,id).set.cards),original);
});

test('requires reveal before either assessment and advances a fixed denominator exactly once',()=>{
  const current=start(),id=current.set.id;
  assert.equal(current.status,'active');assert.equal(current.total,3);assert.equal(current.completed,0);
  assert.equal(current.revealed,false);assert.equal(current.round,1);
  for(const outcome of ['remembered','repeat']){
    const rejected=sets.grade(freeze(current.state),id,current.token,outcome,NOW);
    assert.equal(rejected.accepted,false);assert.deepEqual(plain(rejected.state),plain(current.state));
  }
  const revealed=sets.reveal(freeze(current.state),id,current.token);
  assert.equal(revealed.accepted,true);assert.equal(revealed.revealed,true);assert.equal(revealed.token,current.token);
  assert.equal(sets.reveal(revealed.state,id,current.token).accepted,false);
  for(const [token,outcome] of [['','remembered'],[{},'repeat'],[current.token,'easy']]){
    assert.equal(sets.grade(revealed.state,id,token,outcome,NOW).accepted,false);
  }
  const next=sets.grade(freeze(revealed.state),id,current.token,'repeat',NOW+1);
  assert.equal(next.accepted,true);assert.equal(next.total,3);assert.equal(next.completed,0);
  assert.equal(next.repeat,1);assert.equal(next.remembered,0);assert.equal(next.revealed,false);
  const duplicate=sets.grade(next.state,id,current.token,'remembered',NOW+2);
  assert.equal(duplicate.accepted,false);assert.deepEqual(plain(duplicate.state),plain(next.state));
  assert.equal(sets.reveal(next.state,id,current.token).accepted,false);
});

test('repeat stays at the back until remembered and completion counts unique passed cards',()=>{
  let current=start();const id=current.set.id,original=plain(current.set.session.queue);
  current=answer(current,'repeat');assert.equal(current.completed,0);assert.equal(current.card.id,original[1].id);
  current=answer(current);current=answer(current,'repeat');
  assert.equal(current.status,'active');assert.equal(current.completed,1);assert.equal(current.total,3);
  assert.equal(current.card.id,original[0].id);assert.equal(current.repeat,2);
  assert.equal(sets.nextRound(current.state,id,NOW+3).accepted,false);
  current=answer(current);assert.equal(current.completed,2);assert.equal(current.card.id,original[2].id);
  const token=current.token;current=answer(current,'repeat');
  assert.equal(current.status,'active');assert.equal(current.completed,2);assert.equal(current.card.id,original[2].id);
  assert.equal(sets.grade(current.state,id,token,'remembered',NOW+4).accepted,false);
  current=answer(current);assert.equal(current.status,'complete');assert.equal(current.completed,3);
  const undone=sets.undo(current.state,id,NOW+5);assert.equal(undone.status,'active');assert.equal(undone.completed,2);assert.equal(undone.revealed,false);
  const restarted=sets.start(current.state,id,NOW+6,{restart:true});assert.equal(restarted.total,3);assert.equal(restarted.completed,0);
});

test('reload and exit/resume preserve current queue, index and responses while concealing the answer',()=>{
  let current=answer(start(),'repeat');const id=current.set.id;
  current=sets.reveal(current.state,id,current.token);
  const persisted=JSON.stringify(current.state),decoded=sets.decode(persisted);
  assert.equal(sets.view(decoded,id).revealed,true);
  const resumed=sets.start(freeze(decoded),id,NOW+10);
  assert.equal(resumed.revealed,false);assert.equal(resumed.card.id,current.card.id);
  assert.equal(resumed.token,current.token);assert.equal(resumed.total,3);assert.equal(resumed.completed,0);
  assert.equal(resumed.repeat,1);assert.equal(resumed.remembered,0);
  assert.deepEqual(plain(resumed.set.session.queue),plain(current.set.session.queue));
  assert.deepEqual(plain(resumed.set.session.answers),plain(current.set.session.answers));
  assert.equal(sets.grade(resumed.state,id,current.token,'remembered',NOW+11).accepted,false);
  const next=answer(resumed);
  assert.equal(next.completed,1);assert.equal(next.repeat,1);assert.equal(next.remembered,1);
});

test('import during a round applies only to the next fresh session, including across repeat rounds',()=>{
  let current=start();const id=current.set.id,queue=plain(current.set.session.queue);
  current=answer(current,'repeat');
  const inventory={...words,new:saved('new')};
  const imported=sets.importNew(freeze(current.state),id,inventory,NOW+1);
  current=sets.view(imported.state,id);
  assert.equal(imported.added,1);assert.equal(current.set.cards.length,4);
  assert.equal(current.total,3);assert.equal(current.completed,0);
  assert.deepEqual(plain(current.set.session.queue),queue);
  current=sets.start(sets.decode(JSON.stringify(current.state)),id,NOW+2);
  assert.equal(current.total,3);current=answer(current);current=answer(current);
  let repeat=sets.nextRound(current.state,id,NOW+3);
  assert.equal(repeat.total,3);assert.equal(repeat.completed,2);assert.equal(repeat.card.id,queue[0].id);
  repeat=answer(repeat);
  const fresh=sets.start(repeat.state,id,NOW+4,{restart:true});
  assert.equal(fresh.total,4);assert.equal(fresh.round,1);
  assert.equal(fresh.set.session.queue.at(-1).word,'new');
});

test('exclusion during an active round preserves its denominator and requires an actual assessment',()=>{
  let current=start();const id=current.set.id,card=current.card;
  const excluded=sets.exclude(current.state,id,card.id,NOW+1);
  current=sets.view(excluded.state,id);
  assert.equal(current.total,3);assert.equal(current.completed,0);assert.equal(current.card.id,card.id);
  current=answer(current,'repeat');current=answer(current);current=answer(current);
  assert.equal(current.total,3);assert.equal(current.completed,2);assert.equal(current.repeat,1);
  const repeat=sets.nextRound(current.state,id,NOW+2);
  assert.equal(repeat.total,3);assert.equal(repeat.completed,2);assert.equal(repeat.card.id,card.id);
  const fresh=sets.start(repeat.state,id,NOW+3,{restart:true});
  assert.equal(fresh.total,2);assert.equal(fresh.set.session.queue.some(item=>item.id===card.id),false);
});

test('sets have independent paused queues and grades cannot cross sets or restarted sessions',()=>{
  let one=start();const firstId=one.set.id,firstToken=one.token;
  const second=sets.create(one.state,{name:'Second',bookTitles:['Book B']},words,NOW+1),secondId=second.set.id;
  let two=sets.start(second.state,secondId,NOW+2);
  assert.equal(two.total,1);assert.equal(sets.view(two.state,firstId).token,firstToken);
  two=sets.reveal(two.state,secondId,two.token);
  assert.equal(sets.grade(two.state,secondId,firstToken,'remembered',NOW+3).accepted,false);
  two=sets.grade(two.state,secondId,two.token,'remembered',NOW+3);
  one=sets.start(two.state,firstId,NOW+4);
  assert.equal(one.completed,0);assert.equal(one.token,firstToken);
  const restarted=sets.start(one.state,firstId,NOW+5,{restart:true});
  assert.notEqual(restarted.token,firstToken);
  assert.equal(sets.reveal(restarted.state,firstId,firstToken).accepted,false);
});

test('all-excluded sets are empty and an explicit restart clears old work durably',()=>{
  let current=start({a:words.a}),id=current.set.id;
  let result=sets.exclude(current.state,id,current.card.id,NOW+1);
  current=sets.start(result.state,id,NOW+2,{restart:true});
  assert.equal(current.accepted,true);assert.equal(current.status,'empty');assert.equal(current.set.session,null);
  assert.equal(sets.view(sets.decode(JSON.stringify(current.state)),id).status,'empty');
  assert.equal(sets.start(current.state,id,NOW+3).accepted,false);
  result=sets.restore(current.state,id,current.set.cards[0].id,NOW+4);
  assert.equal(sets.start(result.state,id,NOW+5).total,1);
});

test('only missing storage initializes empty; malformed and future schemas are refused',()=>{
  const empty={version:2,sequence:0,sets:[]};
  assert.deepEqual(plain(sets.normalize(null)),empty);
  assert.deepEqual(plain(sets.decode(null)),empty);
  assert.deepEqual(plain(sets.decode(undefined)),empty);
  assert.deepEqual(plain(sets.decode(JSON.stringify(empty))),empty);
  for(const raw of ['', '{','null','[]','true','"text"','42','{}','{"version":0}','{"version":1,"sets":[]}']){
    assert.throws(()=>sets.decode(raw),/Invalid study sets data/);
  }
  assert.throws(()=>sets.decode('{"version":3,"sets":[]}'),/newer than this app/);
  assert.throws(()=>sets.normalize({version:3,sequence:0,sets:[]}),/newer than this app/);
  assert.throws(()=>sets.create({version:99,sequence:0,sets:[]},{name:'Do not overwrite',bookTitles:['Book A']},words,NOW),/newer than this app/);
});

test('invalid individual cards, sets and progress reject the entire value without losing valid neighbors',()=>{
  const initial=start(),good=plain(initial.state);
  const invalid=[];
  const damaged=change=>{const value=plain(good);change(value);invalid.push(value);};
  damaged(value=>value.sequence=-1);
  damaged(value=>value.sets.push(plain(value.sets[0])));
  damaged(value=>value.sets[0].name=' ');
  damaged(value=>value.sets[0].cards[0].id='not the saved identity');
  damaged(value=>value.sets[0].cards[0].word='');
  damaged(value=>value.sets[0].cards.push(plain(value.sets[0].cards[0])));
  damaged(value=>value.sets[0].bookTitles=[]);
  damaged(value=>value.sets[0].excludedIds=[1]);
  damaged(value=>value.sets[0].excludedIds=['unknown']);
  damaged(value=>value.sets[0].session.queue=[]);
  damaged(value=>value.sets[0].session.queue.push(plain(value.sets[0].session.queue[0])));
  damaged(value=>value.sets[0].session.index=99);
  damaged(value=>value.sets[0].session.index=1);
  damaged(value=>value.sets[0].session.revealed='yes');
  damaged(value=>value.sets[0].session.round=0);
  damaged(value=>value.sets[0].session.answers=[{id:'wrong',outcome:'remembered',at:NOW}]);
  damaged(value=>value.sets[0].cards.shift());
  for(const value of invalid){
    const before=JSON.stringify(value);
    assert.throws(()=>sets.decode(before),/Invalid study sets data/);
    assert.throws(()=>sets.normalize(value),/Invalid study sets data/);
    assert.equal(JSON.stringify(value),before);
  }
  assert.deepEqual(plain(sets.decode(JSON.stringify(good))),good);
});

test('every operation leaves input state, snapshots and vocabulary untouched',()=>{
  const inventory=freeze(plain(words)),created=freeze(create(inventory)),id=created.set.id,cardId=created.set.cards[0].id;
  const before=JSON.stringify(created.state);
  sets.view(created.state,id);sets.normalize(created.state);sets.rename(created.state,id,'Renamed',NOW+1);
  sets.remove(created.state,id);sets.exclude(created.state,id,cardId,NOW+1);sets.restore(created.state,id,cardId,NOW+1);
  sets.importPreview(created.state,id,{...inventory,new:saved('new')});
  sets.importNew(created.state,id,{...inventory,new:saved('new')},NOW+1);
  const current=freeze(sets.start(created.state,id,NOW+1));
  const revealed=freeze(sets.reveal(current.state,id,current.token));
  const done=sets.grade(revealed.state,id,revealed.token,'remembered',NOW+2);
  assert.equal(done.completed,1);assert.equal(revealed.completed,0);assert.equal(current.revealed,false);
  assert.equal(JSON.stringify(created.state),before);assert.deepEqual(plain(inventory),words);
});

test('unknown IDs and premature next-round requests never create or advance work',()=>{
  const created=create(),id=created.set.id,current=sets.start(created.state,id,NOW);
  const before=plain(current.state);
  const attempts=[sets.rename(current.state,'missing','name',NOW),sets.remove(current.state,'missing'),
    sets.exclude(current.state,id,'missing',NOW),sets.restore(current.state,id,'missing',NOW),
    sets.importNew(current.state,'missing',words,NOW),sets.start(current.state,'missing',NOW),
    sets.reveal(current.state,'missing',current.token),sets.grade(current.state,'missing',current.token,'remembered',NOW),
    sets.nextRound(current.state,id,NOW),sets.nextRound(current.state,'missing',NOW)];
  for(const result of attempts){assert.equal(result.accepted,false);assert.deepEqual(plain(result.state),before);}
  assert.deepEqual(plain(sets.importPreview(current.state,'missing',words)),{cards:[],count:0});
});

test('rejects invalid caller clocks and cannot recycle a deleted set ID',()=>{
  const created=create(),id=created.set.id;
  for(const now of [-1,NaN,Infinity,'2026',0.5,8640000000000001]){
    assert.throws(()=>sets.start(created.state,id,now),/Invalid study set time/);
  }
  const removed=sets.remove(created.state,id);
  const next=sets.create(removed.state,{name:'New',bookTitles:['Book A']},words,NOW);
  assert.notEqual(next.set.id,id);
});


test('directly added words use the empty-string source and import through the same scope',()=>{
  const inventory={manual:saved('manual',{book:''}),...words};
  const created=create(inventory,{name:'Directly added',bookTitles:['']});
  assert.equal(created.accepted,true);
  assert.deepEqual(plain(created.set.bookTitles),['']);
  assert.equal(created.set.cards.length,1);
  assert.equal(created.set.cards[0].word,'manual');
  assert.deepEqual(plain(sets.decode(JSON.stringify(created.state))),plain(created.state));
  const imported=sets.importNew(created.state,created.set.id,{...inventory,new:saved('new manual',{book:''})},NOW+1);
  assert.equal(imported.added,1);
  assert.equal(sets.start(imported.state,created.set.id,NOW+2).total,2);
});


test('snapshot star status survives reload independently and old cards default safely',()=>{
  const inventory={a:saved('a',{status:3})},before=JSON.stringify(inventory);
  const created=create(inventory,{name:'Stars',bookTitles:['Book A']});
  assert.equal(created.set.cards[0].status,3);
  const active=sets.start(created.state,created.set.id,NOW+1);
  const changed=sets.setStatus(active.state,created.set.id,created.set.cards[0].id,2,NOW+2);
  assert.equal(changed.set.cards[0].status,2);
  assert.equal(changed.set.session.queue[0].status,3,'current round keeps its snapshot');
  assert.equal(sets.decode(JSON.stringify(changed.state)).sets[0].cards[0].status,2);
  assert.equal(JSON.stringify(inventory),before);
  const legacy=plain(created.state);delete legacy.sets[0].cards[0].status;
  assert.equal(sets.normalize(legacy).sets[0].cards[0].status,1);
  const broken=plain(created.state);broken.sets[0].cards[0].status=4;
  assert.throws(()=>sets.normalize(broken),/Invalid study sets data/);
  assert.throws(()=>sets.setStatus(created.state,created.set.id,created.set.cards[0].id,0,NOW),/Invalid study card status/);
});

test('adding books preserves exclusions, frozen rounds and source vocabulary without duplicates',()=>{
 const inventory={...words,dupe:saved('a',{book:'Book C'}),excluded:saved('c',{book:'Book C'}),fresh:saved('fresh',{book:'Book C'}),unrelated:saved('unrelated',{book:'Other'})};
 const original=plain(inventory);
 let state=sets.create(null,{name:'Selected',bookTitles:['Book A']},inventory,NOW).state,id=state.sets[0].id;
 const excludedId=state.sets[0].cards.find(card=>card.word==='c').id;
 state=sets.exclude(state,id,excludedId,NOW+1).state;
 state=sets.start(state,id,NOW+2).state;
 const session=plain(state.sets[0].session),cards=plain(state.sets[0].cards);
 const result=sets.addBooks(freeze(state),id,['Book C','Book C','Book A'],inventory,NOW+3);
 assert.equal(result.accepted,true);assert.equal(result.added,1);
 assert.deepEqual(plain(result.set.bookTitles),['Book A','Book C']);
 assert.deepEqual(plain(result.set.excludedIds),[excludedId]);
 assert.deepEqual(plain(result.set.session),session);
 assert.deepEqual(plain(result.set.cards.slice(0,cards.length)),cards);
 assert.deepEqual(plain(result.set.cards.map(card=>card.word).sort()),['a','c','fresh']);
 assert.equal(sets.addBooks(result.state,id,['Book C'],inventory,NOW+4).accepted,false);
 assert.deepEqual(plain(inventory),original);
 assert.deepEqual(plain(sets.decode(JSON.stringify(result.state)).sets[0]),plain(result.set));
});


test('v1 sessions migrate without losing inventory or responses, returning legacy repeats to pending',()=>{
  const current=start(),id=current.set.id,legacy=plain(current.state),session=legacy.sets[0].session;
  legacy.version=1;delete session.format;delete session.serial;
  session.index=3;session.answers=session.queue.map((card,i)=>({id:card.id,outcome:i===1?'remembered':'repeat',at:NOW+i}));
  const original=JSON.stringify(legacy),migrated=sets.decode(original),view=sets.view(migrated,id);
  assert.equal(migrated.version,2);assert.equal(view.total,3);assert.equal(view.completed,1);assert.equal(view.status,'active');
  assert.equal(view.card.id,session.queue[0].id);assert.deepEqual(plain(view.set.session.answers),session.answers);
  assert.equal(JSON.stringify(legacy),original);assert.equal(sets.view(sets.decode(JSON.stringify(migrated)),id).token,view.token);
  const undone=sets.undo(migrated,id,NOW+8);assert.equal(undone.completed,1);assert.equal(undone.card.id,session.queue[2].id);
});

test('new sessions present one word with all frozen meanings and preserve every source row',()=>{
  const inventory={bank:saved('bank',{ko:'은행',example:'The bank opens early.',status:2}),
    'bank::sense:river':saved('bank',{root:'bank',ko:'강둑',example:'They walked along the river bank.',status:3}),
    wind:saved('wind',{ko:'바람'})},before=JSON.stringify(inventory);
  const created=create(inventory),id=created.set.id,originalCards=plain(created.set.cards),current=sets.start(created.state,id,NOW);
  assert.equal(current.total,2);assert.equal(current.set.cards.length,3);
  assert.deepEqual(plain(current.card.acceptedMeanings),['은행','강둑']);assert.equal(current.card.senses.length,2);
  assert.equal(current.card.senses[1].example,inventory['bank::sense:river'].example);
  assert.deepEqual(plain(current.set.cards),originalCards);assert.equal(JSON.stringify(inventory),before);
  const reloaded=sets.view(sets.decode(JSON.stringify(current.state)),id);assert.deepEqual(plain(reloaded.card),plain(current.card));
});

test('groupedCards accepts set or cards; exact snapshot words preserve case and phrases',()=>{
  const inventory={one:saved('bank',{ko:'은행'}),two:saved('bank',{ko:'강둑'}),capital:saved('US',{ko:'미국'}),
    pronoun:saved('us',{ko:'우리'}),phrase:saved('give up',{ko:'포기하다'}),verb:saved('give',{ko:'주다'})};
  const created=create(inventory),grouped=sets.groupedCards(created.set);
  assert.equal(grouped.length,5);assert.deepEqual(plain(sets.groupedCards(created.set.cards)),plain(grouped));
  assert.deepEqual(plain(sets.groupedCards(grouped)),plain(grouped),'projection is idempotent without nested representative metadata');
  assert.deepEqual(plain(grouped.find(card=>card.word==='bank').acceptedMeanings),['은행','강둑']);
  const excluded=sets.exclude(created.state,created.set.id,created.set.cards.find(card=>card.ko==='강둑').id,NOW+1);
  assert.equal(sets.groupedCards(excluded.set).find(card=>card.word==='bank').senses.length,1);assert.equal(excluded.set.cards.length,6);
});

test('preserved explicit roots group inflected saved forms without guessed lemma merging',()=>{
  const created=create({run:saved('run',{ko:'달리다'}),running:saved('running',{root:'run',ko:'달리는'}),
    runner:saved('runner',{ko:'달리는 사람'})});
  const grouped=sets.groupedCards(created.set);assert.equal(grouped.length,2);assert.equal(grouped[0].group,'root:run');
  assert.deepEqual(plain(grouped[0].senses.map(card=>card.word)),['run','running']);
  assert.equal(sets.decode(JSON.stringify(created.state)).sets[0].cards.find(card=>card.word==='running').root,'run');
});

test('representative repeat retries all meanings without progress; remembered and undo cover frozen members',()=>{
  let current=start({bank:saved('bank',{ko:'은행'}),other:saved('bank',{ko:'강둑'})});const id=current.set.id,memberIds=current.card.senses.map(card=>card.id);
  assert.equal(current.total,1);current=answer(current,'repeat');assert.equal(current.completed,0);assert.equal(current.total,1);assert.equal(current.card.senses.length,2);
  assert.deepEqual(plain(current.pendingMeaningIds),plain(memberIds));assert.deepEqual(plain(current.rememberedMeaningIds),[]);
  current=answer(current,'remembered');assert.equal(current.status,'complete');assert.equal(current.completed,1);
  assert.deepEqual(plain(current.rememberedMeaningIds),plain(memberIds));assert.equal(current.set.cards.every(card=>card.status===1),true);
  current=sets.undo(current.state,id,NOW+3);assert.equal(current.completed,0);assert.deepEqual(plain(current.pendingMeaningIds),plain(memberIds));assert.equal(current.card.senses.length,2);
});

test('existing ungrouped in-progress sessions remain unchanged until explicit restart',()=>{
  const created=create({a:saved('bank',{ko:'은행'}),b:saved('bank',{ko:'강둑'})}),id=created.set.id;
  const legacy=plain(created.state);legacy.sets[0].session={id:'session-old',startedAt:NOW,round:1,queue:plain(created.set.cards),index:1,
    answers:[{id:created.set.cards[0].id,outcome:'remembered',at:NOW}],revealed:true,format:2,serial:1};
  const resumed=sets.start(legacy,id,NOW+1);assert.equal(resumed.total,2);assert.equal(resumed.completed,1);assert.equal(resumed.card.ko,'강둑');assert.equal(resumed.card.senses,undefined);assert.equal(resumed.revealed,false);
  assert.deepEqual(plain(resumed.set.session.answers),legacy.sets[0].session.answers);
  const restarted=sets.start(resumed.state,id,NOW+2,{restart:true});assert.equal(restarted.total,1);assert.equal(restarted.completed,0);assert.deepEqual(plain(restarted.card.acceptedMeanings),['은행','강둑']);
});

test('book counts match one-book card selection, including duplicates and a blank book',()=>{
  const inventory={
    a:saved('wind',{ko:'바람',book:'Book A',addedAt:10}),
    b:saved('wind',{ko:'바람',book:'Book A',addedAt:20}),
    c:saved('wind',{ko:'감다',book:'Book B',addedAt:30}),
    d:saved('direct',{book:'',addedAt:40}),
    e:saved('none',{book:null,addedAt:50}),
    blank:saved('blank',{ko:'  '}),
    gone:null
  };
  const counts=sets.countsByBook(inventory);
  const names=[...new Set(Object.values(inventory).filter(item=>item&&typeof item.word==='string'&&item.word.trim()&&typeof item.ko==='string'&&item.ko.trim()).map(item=>typeof item.book==='string'?item.book:''))];
  for(const name of names)assert.equal(counts.get(name)||0,sets.cards(inventory,[name]).length,name);
  assert.equal(counts.get('Book A'),1);
  assert.equal(counts.get('Book B'),1);
  assert.equal(counts.get(''),2);
  assert.equal(sets.countsByBook(null).size,0);
});

test('book sets pick up later saves, keep exclusions, and drop Memory deletions outside a live round',()=>{
  const created=create(),id=created.set.id,original=plain(created.set.cards);
  const added={...words,fresh:saved('fresh'),elsewhere:saved('elsewhere',{book:'Book C'})};
  const linked=sets.syncVocabulary(created.state,added,NOW+1);
  assert.equal(linked.accepted,true);assert.equal(linked.added,1);assert.equal(linked.removed,0);
  assert.equal(linked.state.sets[0].cards.at(-1).word,'fresh');
  assert.equal(sets.syncVocabulary(linked.state,added,NOW+2).accepted,false);
  assert.deepEqual(plain(linked.state.sets[0].cards.slice(0,3)),original);
  const excludedId=original[0].id;
  const excluded=sets.exclude(linked.state,id,excludedId,NOW+3);
  const again=sets.syncVocabulary(excluded.state,{...added,repeat:saved('a')},NOW+4);
  assert.equal(again.added,0);
  assert.deepEqual(plain(again.state.sets[0].excludedIds),[excludedId]);
  const edited={...added,a:{...added.a,ko:'고친 뜻',example:'edited'}};
  const kept=sets.syncVocabulary(linked.state,edited,NOW+5);
  assert.equal(kept.accepted,false);
  assert.equal(kept.state.sets[0].cards[0].ko,original[0].ko);
  const removed={...added};delete removed.b;
  const dropped=sets.syncVocabulary(linked.state,removed,NOW+6);
  assert.equal(dropped.removed,1);
  assert.equal(dropped.state.sets[0].cards.some(card=>card.key==='b'),false);
  assert.equal(sets.decode(JSON.stringify(created.state)).sets[0].cards.length,3);
  const restored=sets.syncVocabulary(dropped.state,{...removed,b:saved('b',{book:'Book B',addedAt:20})},NOW+7);
  assert.equal(restored.added,1);
});

test('a study round stays at its starting size, then the next round sees saves and Memory deletions',()=>{
  let current=start(),id=current.set.id;
  const queue=plain(current.set.session.queue);
  const grown={...words,fresh:saved('fresh')};
  let linked=sets.syncVocabulary(current.state,grown,NOW+1);
  current=sets.view(linked.state,id);
  assert.equal(linked.added,1);assert.equal(current.total,3);
  assert.deepEqual(plain(current.set.session.queue),queue);
  assert.equal(sets.listedCards(current.set,grown).some(card=>card.word==='fresh'),true);
  const during={...grown};delete during.a;
  linked=sets.syncVocabulary(current.state,during,NOW+2);
  current=sets.view(linked.state,id);
  assert.equal(linked.removed,0);assert.equal(current.total,3);assert.equal(current.card.word,'a');
  assert.equal(current.set.cards.some(card=>card.key==='a'),true);
  assert.equal(sets.listedCards(current.set,during).some(card=>card.key==='a'),true);
  while(current.status==='active')current=answer(current);
  assert.equal(current.status,'complete');assert.equal(current.total,3);
  assert.equal(sets.listedCards(current.set,during).some(card=>card.key==='a'),false);
  assert.equal(current.set.cards.some(card=>card.key==='a'),true,'the finished round can still undo');
  const undone=sets.undo(current.state,id,NOW+3);
  assert.equal(undone.accepted,true);assert.equal(undone.status,'active');
  const next=sets.start(current.state,id,NOW+4,{restart:true,words:during});
  assert.equal(next.total,3);assert.equal(next.set.session.queue.some(card=>card.key==='a'),false);
  assert.equal(next.set.session.queue.some(card=>card.word==='fresh'),true);
  assert.equal(sets.syncVocabulary(next.state,during,NOW+5).accepted,false);
});

test('representative metadata corruption cannot drop, invent or nest saved meanings',()=>{
  const current=start({a:saved('bank',{ko:'은행'}),b:saved('bank',{ko:'강둑'}),c:saved('wind',{ko:'바람'})});
  for(const damage of [
    card=>{card.acceptedMeanings=['invented'];},
    card=>{card.senses[0].senses=[];},
    card=>{card.group='word:other';},
    card=>{card.senses.push({...current.set.cards[2]});card.acceptedMeanings.push('바람');},
    card=>{card.senses[1].id='unknown';}
  ]){const raw=plain(current.state);damage(raw.sets[0].session.queue[0]);assert.throws(()=>sets.normalize(raw),/Invalid study sets data/);}
});
