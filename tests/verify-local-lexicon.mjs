import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import '../modules/lexical/core.js';
import '../scripts/dictionary/local-lexicon.js';
const base=new URL('../assets/dictionaries/en-ko-10k/',import.meta.url);
const bytes=readFileSync(new URL('dictionary.json',base));
const data=JSON.parse(bytes),manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
const evidence=gunzipSync(readFileSync(new URL('provenance.jsonl.gz',base))).toString().trim().split('\n').map(JSON.parse);
const factory=()=>globalThis.BreezeLocalLexicon.create(data);
const input=(sentence,index)=>({sentence,clicked:globalThis.BreezeLocalLexicon.tokenize(sentence)[index].text,clickedIndex:index});

test('exactly 10,000 unique source-backed headwords, no inflated form count',()=>{
 assert.equal(Object.keys(data.entries).length,10000);assert.equal(manifest.headwords,10000);
 assert.equal(Object.values(data.entries).reduce((n,e)=>n+Object.values(e.pos).reduce((a,s)=>a+s.length,0),0),manifest.senses);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.dictionarySha256);
 assert.deepEqual(gunzipSync(readFileSync(new URL('dictionary.json.gz',base))),bytes);
});
test('every default/POS sense has provenance and no invalid placeholder',()=>{
 const allowed=new Set(evidence.map(row=>JSON.stringify([row.lemma,row.pos,row.ko])));
 for(const [lemma,e] of Object.entries(data.entries)){
  assert.match(lemma,/^[a-z]+(?:['-][a-z]+)*$/);
  assert.ok(Object.values(e.pos).flat().includes(e.default));
  for(const [pos,senses] of Object.entries(e.pos))for(const ko of senses){
   assert.match(ko,/[가-힣]/);assert.ok(ko.length<=40);assert.ok(allowed.has(JSON.stringify([lemma,pos,ko])));
  }
 }
 assert.equal(evidence.length,manifest.senses);
});
for(const [title,sentence,index,pos,prefix] of [
 ['verb record','They record everything.',1,'verb','기록하다'],
 ['noun record','A record is missing.',1,'noun','기록'],
 ['second occurrence is noun','They record a record.',3,'noun','기록'],
 ['first occurrence is verb','They record a record.',1,'verb','기록하다'],
 ['plural noun','These records matter.',1,'noun','기록'],
 ['inflected verb','They recorded everything.',1,'verb','기록하다'],
 ['progressive verb','She is running.',2,'verb','달리다'],
 ['irregular verb','They took everything.',1,'verb','가져가다'],
 ['adjective not ly-adverb','A friendly person smiled.',1,'adjective','친구의'],
 ['single POS adverb','She moved swiftly.',2,'adverb','재빨리'],
 ['adjective homograph','A very close friend.',2,'adjective','가까운'],
 ['verb homograph','They close the door.',1,'verb','닫다'],
 ['noun book','The book is here.',1,'noun','책'],
 ['verb book','They book a room.',1,'verb','예약하다'],
 ['determiner plus noun light','The light is bright.',1,'noun','빛'],
 ['imperative light','Light a fire.',0,'verb','점화하다']]){
 test(title,()=>{const r=factory().lookup(input(sentence,index));assert.ok(r);assert.equal(r.pos,pos);assert.ok(r.ko.startsWith(prefix));assert.equal(r.provisional,true);});
}
test('ambiguous POS falls back to default, not invented confidence',()=>{
 const r=factory().lookup(input('record',0));assert.equal(r.pos,null);assert.equal(r.ko,data.entries.record.default);
});
test('compound modifier ambiguity falls back',()=>{
 const r=factory().lookup(input('The light box fell.',1));assert.equal(r.pos,null);assert.equal(r.rule,'ambiguous');
});
test('ambiguous morphology does not assert saw=see',()=>{
 const r=factory().lookup(input('They saw wood.',1));assert.equal(r.pos,null);assert.equal(r.rule,'ambiguous-lemma');
});
test('unknown POS has a valid default fallback',()=>{
 const r=globalThis.BreezeLocalLexicon.create({version:1,entries:{sample:{default:'견본',pos:{unknown:['견본']}}}}).lookup(input('sample',0));
 assert.equal(r.ko,'견본');assert.equal(r.pos,null);
});
test('proper-name guard, single-word only, invalid/missing occurrence',()=>{
 const r=factory();assert.equal(r.lookup(input('I visited Apple.',2)),null);
 assert.equal(r.lookup({sentence:'record record',clicked:'record'}),null);
 assert.equal(r.lookup({sentence:'They record.',clicked:'other',clickedIndex:1}),null);
 assert.equal(r.lookup({sentence:'give up',clicked:'give up',clickedIndex:0}),null);
 assert.equal(r.lookup(input('unlistedxyz',0)),null);
});
test('all headword lookups are synchronous, deterministic and read-only',()=>{
 const r=factory(),before=JSON.stringify(data);
 for(const word of Object.keys(data.entries)){
  const a=r.lookup({sentence:word,clicked:word,clickedIndex:0});
  assert.ok(a&&!(a instanceof Promise));
  assert.deepEqual(a,r.lookup({sentence:word,clicked:word,clickedIndex:0}));
 }
 assert.equal(JSON.stringify(data),before);
 assert.equal(r.stats().localHits,20000);
});
test('no browser storage/network access during lookup; no AI/Wordbook side effects',()=>{
 const r=factory(),fetch=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('network on hot path');};
 try{assert.equal(r.lookup(input('They record everything.',1)).ko,'기록하다');}finally{globalThis.fetch=fetch;}
 const source=readFileSync(new URL('../scripts/dictionary/local-lexicon.js',import.meta.url),'utf-8');
 assert.ok(!/dictCall|saveWords|localStorage|indexedDB|setInterval|BreezeLightning\.setEnabled/.test(source));
});
test('malformed dataset rejected',()=>{
 assert.throws(()=>globalThis.BreezeLocalLexicon.create({version:1,entries:{bad:{default:'누락',pos:{noun:['다름']}}}}));
});
