import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {test} from 'node:test';

const source=readFileSync(new URL('../scripts/core/study-sets.js',import.meta.url),'utf8');
function engine(){const context={};new Script(source+'\nglobalThis.model=BreezeStudySets;').runInNewContext(context);return context.model;}
const model=engine(),at=1780000000000;
const plain=value=>JSON.parse(JSON.stringify(value));
const word=(text,ko=text+' 뜻',book='Book A')=>({word:text,ko,book,example:'Saved example.',addedAt:at-10});
const words={bank:word('bank','은행'),river:word('bank','강둑'),wind:word('wind','바람')};
const make=(inventory=words)=>model.create(null,{name:'Learning',bookTitles:['Book A']},inventory,at);
function grade(state,id,outcome,now=at+3){const current=model.view(state,id),revealed=model.reveal(state,id,current.token);return model.grade(revealed.state,id,revealed.token,outcome,now).state;}

test('independent devices allocate different set and session IDs at the same local sequence',()=>{
  const a=make(),b=engine().create(null,{name:'Other device',bookTitles:['Book A']},words,at);
  assert.notEqual(a.set.id,b.set.id);
  const first=model.start(a.state,a.set.id,at),second=model.start(b.state,b.set.id,at);
  assert.notEqual(first.set.session.id,second.set.session.id);
  const merged=model.mergeStates(first.state,second.state);
  assert.equal(merged.sets.length,2);
  assert.equal(new Set(merged.sets.map(set=>set.id)).size,2);
});

test('legacy reference migration is stable, namespace-specific, immutable and preserves answers',()=>{
  const created=make();let state=model.start(created.state,created.set.id,at).state;
  state=grade(state,created.set.id,'repeat');state=plain(state);
  state.sets[0].id='set-1';state.sets[0].session.id='session-2';
  const original=JSON.stringify(state),options={wordKeys:{bank:'imported-bank',river:'imported-river'}};
  const first=model.migrateIds(state,'stable-import-1',options),retry=model.migrateIds(state,'stable-import-1',options);
  assert.deepEqual(plain(first),plain(retry));
  assert.deepEqual(plain(model.migrateIds(first.state,'stable-import-1',options).state),plain(first.state));
  assert.notEqual(first.setIds['set-1'],model.migrateIds(state,'other-device').setIds['set-1']);
  assert.equal(first.state.sets[0].cards.find(card=>card.ko==='은행').key,'imported-bank');
  assert.equal(first.state.sets[0].session.queue[0].senses[0].key,'imported-bank');
  assert.deepEqual(plain(first.state.sets[0].session.answers),state.sets[0].session.answers);
  assert.equal(JSON.stringify(state),original);
});

test('set-first synchronization preserves captured study content on a device without books or words',()=>{
  const created=make(),merged=model.syncVocabulary(created.state,{},at+1);
  assert.equal(merged.accepted,false);
  assert.equal(model.listedCards(merged.state.sets[0],{}).length,3);
  const started=model.start(merged.state,created.set.id,at+2,{words:{}});
  assert.equal(started.total,2);assert.equal(started.card.senses.length,2);
  assert.equal(started.card.example,'Saved example.');
});

test('exclusion survives tombstoned source disappearance, old-replica merge and source return',()=>{
  const created=make(),id=created.set.id,card=created.set.cards[0];
  const excluded=model.exclude(created.state,id,card.id,at+1).state;
  const remaining={...words};delete remaining[card.key];
  const removed=model.syncVocabulary(excluded,remaining,at+2,{deletedKeys:[card.key]}).state;
  assert.equal(removed.sets[0].excludedIds.includes(card.id),true);
  const merged=model.mergeStates(removed,created.state);
  assert.equal(model.listedCards(merged.sets[0],remaining,true).some(item=>item.id===card.id),true);
  const returned=model.syncVocabulary(merged,words,at+3).state;
  assert.equal(returned.sets[0].excludedIds.includes(card.id),true);
  assert.equal(model.listedCards(returned.sets[0],words).some(item=>item.id===card.id),false);
  const restored=model.restore(returned,id,card.id,at+4).state;
  assert.equal(model.listedCards(restored.sets[0],words).some(item=>item.id===card.id),true);
  assert.equal(model.mergeStates(restored,excluded).sets[0].excludedIds.includes(card.id),false);
});

test('explicit source tombstones remove membership without stale replica resurrection, and a new save can restore it',()=>{
  const created=make(),card=created.set.cards[0],remaining={...words};delete remaining[card.key];
  const removed=model.syncVocabulary(created.state,remaining,at+1,{deletedKeys:[card.key]}).state;
  const merged=model.mergeStates(removed,created.state);
  assert.equal(merged.sets[0].cards.some(item=>item.id===card.id),false);
  const returned=model.syncVocabulary(merged,words,at+2).state;
  assert.equal(returned.sets[0].cards.some(item=>item.id===card.id),true);
  assert.equal(model.mergeStates(returned,removed).sets[0].cards.some(item=>item.id===card.id),true);
});

test('a live exact duplicate prevents deleting a captured meaning even when its old record key is tombstoned',()=>{
  const created=make(),card=created.set.cards[0],inventory={...words,replacement:words[card.key]};delete inventory[card.key];
  const next=model.syncVocabulary(created.state,inventory,at+1,{deletedKeys:{[card.key]:at}});
  assert.equal(next.removed,0);assert.equal(next.state.sets[0].cards.length,3);
});

test('set tombstones win over delayed saves and migrate with the same stable legacy ID',()=>{
  const created=make(),removed=model.remove(created.state,created.set.id).state;
  const renamed=model.rename(created.state,created.set.id,'Offline rename',at+50).state;
  const merged=model.mergeStates(renamed,removed);
  assert.equal(merged.sets.length,0);assert.deepEqual(plain(merged.deletedSetIds),[created.set.id]);
  const old=plain(created.state);old.sets[0].id='set-1';
  const migratedDelete=model.migrateIds(model.remove(old,'set-1').state,'device').state;
  const migratedLive=model.migrateIds(old,'device').state;
  assert.equal(model.mergeStates(migratedDelete,migratedLive).sets.length,0);
});

test('concurrent book additions and different meanings both survive deterministic merge',()=>{
  const created=make(),inventory={...words,one:word('lead','이끌다','Book B'),two:word('lead','납','Book C')};
  const left=model.addBooks(created.state,created.set.id,['Book B'],inventory,at+1).state;
  const right=model.addBooks(created.state,created.set.id,['Book C'],inventory,at+2).state;
  const merged=model.mergeStates(left,right);
  assert.deepEqual(plain(merged.sets[0].bookTitles),['Book A','Book B','Book C']);
  assert.equal(merged.sets[0].cards.filter(card=>card.word==='lead').length,2);
  assert.deepEqual(plain(model.mergeStates(right,left)),plain(merged));
  assert.deepEqual(plain(model.mergeStates(merged,merged)),plain(merged));
});

test('conflicting frozen sessions preserve both answer histories without interleaving them',()=>{
  const created=make(),id=created.set.id,initial=model.start(created.state,id,at+1).state;
  const left=grade(initial,id,'remembered',at+2),right=grade(initial,id,'repeat',at+2);
  const merged=model.mergeStates(left,right),set=merged.sets[0];
  assert.equal(set.session.answers.length,1);assert.equal(set.archivedSessions.length,1);
  assert.equal(set.archivedSessions[0].answers.length,1);
  assert.deepEqual(new Set([set.session.answers[0].outcome,set.archivedSessions[0].answers[0].outcome]),new Set(['remembered','repeat']));
  assert.deepEqual(plain(model.mergeStates(right,left)),plain(merged));
  assert.deepEqual(plain(model.mergeStates(merged,left)),plain(merged));
  assert.equal(model.normalize(plain(merged)).sets[0].archivedSessions.length,1);
});

test('stale prefixes do not create duplicate archives on every successful answer sync',()=>{
  const created=make(),id=created.set.id,initial=model.start(created.state,id,at+1).state;
  const answered=grade(initial,id,'remembered',at+2),merged=model.mergeStates(answered,initial);
  assert.equal(merged.sets[0].session.answers.length,1);
  assert.equal(merged.sets[0].archivedSessions.length,0);
});

test('three-replica merge order preserves rename, membership, status and exclusion decisions',()=>{
  const created=make(),id=created.set.id,cardId=created.set.cards[0].id;
  const branches=[model.rename(created.state,id,'First rename',at+1).state,
    model.rename(created.state,id,'Second rename',at+1).state,
    model.addBooks(created.state,id,['Book B'],{b:word('other','다른','Book B')},at+1).state,
    model.exclude(created.state,id,cardId,at+1).state,
    model.setStatus(created.state,id,cardId,3,at+1).state];
  for(const first of branches)for(const second of branches)for(const third of branches)
    assert.deepEqual(plain(model.mergeStates(model.mergeStates(first,second),third)),plain(model.mergeStates(first,model.mergeStates(second,third))));
});

test('archiving a superseded session removes stale prefixes regardless of replica delivery order',()=>{
  const created=make(),id=created.set.id,first=model.start(created.state,id,at+1).state;
  const answered=grade(first,id,'remembered',at+2);
  const restarted=model.start(answered,id,at+3,{restart:true}).state;
  const left=model.mergeStates(model.mergeStates(first,answered),restarted);
  const right=model.mergeStates(first,model.mergeStates(answered,restarted));
  assert.deepEqual(plain(left),plain(right));
  assert.equal(left.sets[0].archivedSessions.length,1);
  assert.equal(left.sets[0].archivedSessions[0].answers.length,1);
});

test('large independent inventories merge all meanings without book assets or schema damage',()=>{
  const inventory=Object.fromEntries(Array.from({length:6000},(_,index)=>['key-'+index,word('word-'+index)]));
  const first=make(inventory),second=make(inventory);
  const merged=model.mergeStates(first.state,second.state);
  assert.equal(merged.sets.length,2);assert.equal(merged.sets.reduce((sum,set)=>sum+set.cards.length,0),12000);
  assert.equal(model.decode(JSON.stringify(merged)).sets[0].cards.length,6000);
});

test('keyed save visits only its related sets without enumerating the vocabulary',()=>{
  const inventory={...words,elsewhere:word('elsewhere','다른 곳','Book B')},first=make(inventory);
  const second=model.create(first.state,{name:'Unrelated',bookTitles:['Book B']},inventory,at+1);
  const index=model.createVocabularySyncIndex(second.state,inventory),unrelated=second.state.sets[1];
  const guardedState={...second.state,sets:[second.state.sets[0],new Proxy(unrelated,{get(target,key){if(key==='cards')throw new Error('Unrelated set was inspected');return target[key];}})]};
  inventory.fresh=word('fresh');
  const guardedWords=new Proxy(inventory,{ownKeys(){throw new Error('Full vocabulary enumeration is forbidden during a keyed save');}});
  const next=model.syncVocabularyChanges(guardedState,guardedWords,['fresh'],at+2,index);
  assert.equal(next.added,1);assert.equal(next.touched,1);
  assert.equal(next.state.sets[0].cards.at(-1).word,'fresh');
  assert.equal(next.state.sets[1],guardedState.sets[1]);
  assert.deepEqual(plain(next.changedSetIds),[first.set.id]);
  assert.equal(model.listedCards(next.state.sets[0],guardedWords).length,4);
  assert.equal(model.syncVocabularyChanges(next.state,guardedWords,['fresh'],at+3,index).accepted,false);
});

test('keyed deletion considers duplicate meanings across books and keeps exclusions after re-save',()=>{
  const inventory={only:word('bank','은행'),duplicate:word('bank','은행','Book B')},created=make(inventory),id=created.set.id;
  let state=model.exclude(created.state,id,created.set.cards[0].id,at+1).state;
  const index=model.createVocabularySyncIndex(state,inventory),deleted={only:at+2};
  delete inventory.only;
  let next=model.syncVocabularyChanges(state,inventory,['only'],at+2,index,{deletedKeys:deleted});
  assert.equal(next.removed,0);state=next.state;
  delete inventory.duplicate;deleted.duplicate=at+3;
  next=model.syncVocabularyChanges(state,inventory,['duplicate'],at+3,index,{deletedKeys:deleted});
  assert.equal(next.removed,1);state=next.state;
  inventory.replacement=word('bank','은행');
  next=model.syncVocabularyChanges(state,inventory,['replacement'],at+4,index,{deletedKeys:deleted});
  assert.equal(next.accepted,true);assert.equal(next.state.sets[0].excludedIds.length,1);
  const restored=model.restore(next.state,id,created.set.cards[0].id,at+5);
  assert.equal(model.listedCards(restored.set,inventory).length,1);
});

test('keyed changes and a full pass retain the same captured content and frozen sessions',()=>{
  const created=make(),id=created.set.id,active=model.start(created.state,id,at+1).state;
  const inventory={...words},index=model.createVocabularySyncIndex(active,inventory);
  inventory.fresh=word('fresh');delete inventory.bank;
  const options={deletedKeys:['bank']};
  const keyed=model.syncVocabularyChanges(active,inventory,['fresh','bank'],at+2,index,options);
  const full=model.syncVocabulary(active,inventory,at+2,options);
  assert.deepEqual(plain(keyed.state.sets[0].cards),plain(full.state.sets[0].cards));
  assert.deepEqual(plain(keyed.state.sets[0].session),plain(full.state.sets[0].session));
  assert.equal(keyed.added,full.added);assert.equal(keyed.removed,full.removed);
});
