import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url),core=require('../scripts/dictionary/local-lexicon.js');
const api=require('../scripts/dictionary/local-lexicon-packs.js');
const root=new URL('../',import.meta.url),out=new URL('assets/dictionaries/en-ko-expansion/',root);
const read=url=>JSON.parse(readFileSync(url,'utf8'));
const manifest=read(new URL('manifest.json',out));
const base=read(new URL(manifest.baseline.file,out));
const metas=[{...api.baseMetadata,...manifest.baseline},...manifest.packs];
const packs=metas.map(meta=>({meta,data:read(new URL(meta.file,out))}));
const input=word=>({sentence:word,clicked:word,clickedIndex:0});
const engine=api.create(packs,{allowExperimentalFallback:true});
const newWord=id=>Object.keys(packs.find(p=>p.meta.id===id).data.entries)[0];

test('exactly 30K new distinct headwords; original 10K unchanged',()=>{
  const words=packs.flatMap(p=>Object.keys(p.data.entries));
  assert.equal(words.length,40000);assert.equal(new Set(words).size,40000);
  assert.equal(words.length-Object.keys(base.entries).length,30000);
  assert.equal(createHash('sha256').update(readFileSync(new URL(manifest.baseline.file,out))).digest('hex'),
    'ba05be3d8643de29bf85c47899118441b7da48df8db0a27b964f72b8dff51c33');
  assert.equal(engine.stats().headwords,40000);
});
test('all 40K entries return synchronous deterministic source-backed previews',()=>{
  for(const pack of packs)for(const word of Object.keys(pack.data.entries)){
    const a=engine.lookup(input(word)),b=engine.lookup(input(word));
    assert.ok(a && !(a instanceof Promise),word);assert.deepEqual(a,b);
    assert.equal(a.lemma,word);assert.equal(a.pack,pack.meta.id);assert.equal(a.provisional,true);
    assert.equal(a.license,pack.meta.license);assert.ok(Object.values(pack.data.entries[word].pos).flat().includes(a.ko),word);
    assert.ok(Object.isFrozen(a));
  }
});
test('existing 10K meanings and POS behavior are preserved',()=>{
  const before=core.create(base);
  for(const word of Object.keys(base.entries)){
    const a=before.lookup(input(word)),b=engine.lookup(input(word));
    for(const field of ['lemma','ko','pos','predictedPos','rule','sourceUrl','license'])assert.deepEqual(b[field],a[field],word+':'+field);
  }
});
test('experimental Kengdic is omitted unless explicitly enabled',()=>{
  const safe=api.create(packs);
  assert.equal(safe.stats().headwords,12398);
  assert.equal(safe.lookup(input(newWord('kengdic-fallback'))),null);
  assert.equal(safe.stats().experimentalHits,0);
});
test('Kengdic returns unknown POS/default and correct MPL attribution',()=>{
  const word=newWord('kengdic-fallback'),a=engine.lookup(input(word));
  assert.equal(a.pos,null);assert.equal(a.predictedPos,null);assert.equal(a.license,'MPL-2.0');
  assert.match(a.sourceUrl,/garfieldnate\/kengdic\/blob\/793de236/);
  assert.equal(a.quality,'experimental-fallback');
});
test('English Wiktionary translations never get Korean Wiktionary source URLs',()=>{
  const a=engine.lookup(input(newWord('en-translations')));
  assert.match(a.sourceUrl,/^https:\/\/en.wiktionary.org\/wiki\/.+#English$/);
  assert.equal(a.license,'CC-BY-SA-4.0');
});
test('actual repeated occurrence distinguishes record verb and noun',()=>{
  const sentence='They record a record.';
  assert.equal(engine.lookup({sentence,clicked:'record',clickedIndex:1}).pos,'verb');
  assert.equal(engine.lookup({sentence,clicked:'record',clickedIndex:3}).pos,'noun');
  assert.equal(engine.lookup({sentence,clicked:'record'}),null);
});
test('source-backed aliases still delegate to original resolver',()=>{
  const reference=core.create(base);
  for(const word of Object.keys(base.forms)){
    const a=reference.lookup(input(word)),b=engine.lookup(input(word));
    assert.equal(a?.ko,b?.ko,word);assert.equal(b?.pack,'base-10k');
  }
});
test('missing dictionary entries and malformed targets safely return null',()=>{
  for(const x of [null,{},input('blorptasticxyz'),input('__proto__'),{sentence:'record',clicked:'cat',clickedIndex:0},
    {sentence:'record',clicked:'record',clickedIndex:7},{sentence:'a'.repeat(2500),clicked:'a',clickedIndex:0}]){
    assert.equal(engine.lookup(x),null);
  }
});
test('capitalized mid-sentence names and all-caps retain ordinary AI fallback',()=>{
  assert.equal(engine.lookup({sentence:'I visited Apple.',clicked:'Apple',clickedIndex:2}),null);
  assert.equal(engine.lookup(input('NASA')),null);
});
test('lookup makes no fetch calls and never mutates input dictionaries',()=>{
  const originalFetch=globalThis.fetch,snapshots=packs.map(p=>JSON.stringify(p.data));
  globalThis.fetch=()=>{throw Error('Unexpected tap-time network');};
  try{for(const p of packs)engine.lookup(input(Object.keys(p.data.entries)[0]));}
  finally{globalThis.fetch=originalFetch;}
  for(let i=0;i<packs.length;i++)assert.equal(JSON.stringify(packs[i].data),snapshots[i]);
});
test('duplicate words, duplicate IDs and incompatible metadata are rejected',()=>{
  assert.throws(()=>api.create([packs[0],packs[0]]),/metadata/);
  assert.throws(()=>api.create([packs[0],{data:base,meta:{...packs[0].meta,id:'other'}}]),/Duplicate headword/);
  assert.throws(()=>api.create([{data:base,meta:{...packs[0].meta,license:'MPL-2.0'}}]),/metadata/);
  assert.throws(()=>api.create([{data:base,meta:{...packs[0].meta,sourceUrlPrefix:'javascript:alert(1)'}}]),/metadata/);
});
test('stats count one user lookup, despite multiple pack attempts',()=>{
  engine.resetStats();engine.lookup(input('record'));engine.lookup(input(newWord('kengdic-fallback')));engine.lookup(input('blorptasticxyz'));
  assert.deepEqual({lookups:engine.stats().lookups,hits:engine.stats().localHits,misses:engine.stats().localMisses,
    experimental:engine.stats().experimentalHits},{lookups:3,hits:2,misses:1,experimental:1});
});
async function withFetch(fn){const old=globalThis.fetch;try{await fn();}finally{globalThis.fetch=old;}}
function assetResponse(url){
  const u=new URL(String(url));const rel=u.pathname.replace('/assets/dictionaries/en-ko-expansion/','');
  const path=u.pathname.includes('/en-ko-10k/')?new URL('assets/dictionaries/en-ko-10k/dictionary.json',root):new URL(rel,out);
  return new Response(readFileSync(path),{status:200});
}
test('load verifies assets before synchronous lookup; default loads no experimental data',async()=>withFetch(async()=>{
  const urls=[];globalThis.fetch=async url=>{urls.push(String(url));return assetResponse(url);};
  const loaded=await api.load('https://example.test/assets/dictionaries/en-ko-expansion/manifest.json');
  assert.equal(loaded.stats().headwords,12398);assert.equal(urls.length,4);
  assert.ok(!urls.some(url=>url.includes('kengdic')));
  globalThis.fetch=()=>{throw Error('Must not fetch on tap');};
  assert.ok(loaded.lookup(input('record')));
}));
test('explicit full pack loads all 40K without AI requests',async()=>withFetch(async()=>{
  let calls=0;globalThis.fetch=async url=>{calls++;return assetResponse(url);};
  const loaded=await api.load('https://example.test/assets/dictionaries/en-ko-expansion/manifest.json',{allowExperimentalFallback:true});
  assert.equal(loaded.stats().headwords,40000);assert.equal(calls,5);
}));
test('checksum failure rejects corrupt data, rather than silently accepting it',async()=>withFetch(async()=>{
  globalThis.fetch=async url=>String(url).endsWith('/manifest.json')?assetResponse(url):new Response('{}');
  await assert.rejects(api.load('https://example.test/assets/dictionaries/en-ko-expansion/manifest.json'),/checksum/);
}));
test('a pack manifest cannot make cross-origin requests',async()=>withFetch(async()=>{
  const hostile=structuredClone(manifest);hostile.baseline.file='https://attacker.invalid/words';
  globalThis.fetch=async url=>String(url).endsWith('/manifest.json')?Response.json(hostile):assetResponse(url);
  await assert.rejects(api.load('https://example.test/assets/dictionaries/en-ko-expansion/manifest.json'),/Cross-origin/);
}));

test('actual Breeze lemma candidates preserve baseline results and resolve new plurals',()=>{
  const lexical={};runInNewContext(readFileSync(new URL('modules/lexical/core.js',root),'utf8'),lexical);
  const opts={lemmaCandidates:lexical.BreezeLexical.lemmaCands};
  const reference=core.create(base,opts),expanded=api.create(packs,{...opts,allowExperimentalFallback:true});
  for(const word of Object.keys(base.entries)){
    const a=reference.lookup(input(word)),b=expanded.lookup(input(word));
    assert.equal(b.ko,a.ko,word);assert.equal(b.lemma,a.lemma,word);assert.equal(b.pos,a.pos,word);
  }
  for(const [surface,lemma] of [['recorded','record'],['running','run'],['took','take'],['billboards','billboard'],['rectors','rector']]){
    const a=expanded.lookup({sentence:'They saw '+surface+'.',clicked:surface,clickedIndex:2});
    assert.ok(a,surface);assert.equal(a.lemma,lemma,surface);
  }
});
