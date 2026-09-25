import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const helper=readFileSync(resolve(root,'scripts/core/word-integrity.js'),'utf8');
const sync=readFileSync(resolve(root,'scripts/sync/sync.js'),'utf8');
const state=readFileSync(resolve(root,'scripts/core/state.js'),'utf8');
const merger=sync.slice(sync.indexOf('function preserveWordConflict('),sync.indexOf('async function mergeVaultPayload('));
assert.ok(merger.startsWith('function preserveWordConflict('));

function world(initial={},deleted={}){
  const memory=new Map();
  const context={words:structuredClone(initial),dead:structuredClone(deleted),pendingWord:null,Date,console,toast(){},
    load:(key,fallback)=>memory.get(key)??fallback,save:(key,value)=>{memory.set(key,value);return true;}};
  context.window=context;
  new Script(helper+'\nconst upOf=word=>word?(word.up||word.addedAt||0):0;\n'+merger).runInNewContext(context);
  return context;
}
const saved=(ko,up=10,extra={})=>({word:'wind',ko,up,addedAt:up,status:1,...extra});

{
  const memory=new Map();
  const localStorage={get length(){return memory.size;},key:i=>[...memory.keys()][i],
    getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  const c={localStorage,console,toast(){},Date};
  const boot=state.slice(0,state.indexOf('const posOf ='));
  new Script(helper+'\n'+boot+'\nglobalThis.persist={loadWordState,saveWords,set:value=>words=value};').runInNewContext(c);
  c.persist.set({wind:saved('  '),sun:saved('태양'),moon:saved('달',10,{koEdited:true})});
  c.persist.saveWords();
  assert.deepEqual(Object.keys(c.persist.loadWordState()).sort(),['moon','sun'],
    'an in-flight empty lookup must not enter local persistence');
}

{
  const c=world({wind:saved('바람'), 'wind::empty':saved('  ',9,{root:'wind',sense:true}),
    'wind::second':saved('기류',8,{root:'wind',sense:true})});
  assert.equal(c.cleanOrphanWords(c.words,c.dead),true);
  assert.equal(c.words.wind.ko,'바람');
  assert.equal(c.words['wind::second'].ko,'기류');
  assert.equal(c.words['wind::empty'],undefined);
  assert.ok(c.dead['wind::empty']);
  assert.equal(c.cleanOrphanWords(c.words,c.dead),false,'cleanup must be idempotent');
}
{
  const c=world({wind:saved('  ',4), 'wind::second':saved('산들바람',5,{root:'wind',sense:true,koEdited:true})});
  c.cleanOrphanWords(c.words,c.dead);
  assert.equal(c.words.wind.ko,'산들바람','a valid second sense should become the root');
  assert.equal(c.words.wind.koEdited,true,'user edits must survive promotion');
  assert.ok(c.dead['wind::second']);
}
{
  const c=world({wind:saved('',4,{kodict:[{terms:['후보']}],alts:['추천']})});
  c.cleanOrphanWords(c.words,c.dead);
  assert.equal(c.words.wind,undefined,'candidates are not saved meanings');
  assert.ok(c.dead.wind);
  c.mergeWordState({wind:saved(' ',4)},{});
  assert.equal(c.words.wind,undefined,'old local/remote orphan cannot resurrect');
}
{
  const c=world({wind:saved('수정한 바람',10,{koEdited:true,ai:{ko:'옛 뜻',done:true}})});
  c.mergeWordState({wind:saved('옛 뜻',9)},{});
  assert.equal(c.words.wind.ko,'수정한 바람');
  const legacy=world({wind:saved('',10,{ai:{ko:'보존할 뜻',done:true}})});
  legacy.cleanOrphanWords(legacy.words,legacy.dead);
  assert.equal(legacy.words.wind.ko,'보존할 뜻');
}
{
  const c=world();
  c.mergeWordState({wind:saved('  ',11)},{});
  assert.equal(c.words.wind,undefined,'a remote orphan must not become a vocabulary item');
  const vault={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,String,btoa,atob};
  new Script(readFileSync(resolve(root,'scripts/sync/vault-crypto.js'),'utf8')+
    '\nglobalThis.VaultCrypto=VaultCrypto;').runInNewContext(vault);
  const secret=webcrypto.getRandomValues(new Uint8Array(32));
  const envelope=await vault.VaultCrypto.sealJson(secret,
    {words:c.words,dead:c.dead},['account','vault','snapshot'],'breeze/vault/v2');
  const snap=await vault.VaultCrypto.openJson(secret,envelope,
    ['account','vault','snapshot'],'breeze/vault/v2');
  const next=world({wind:saved(' ',10)});
  next.mergeWordState(snap.words,snap.dead);
  assert.equal(next.words.wind,undefined,'round-trip must not restore an older orphan');
  assert.ok(next.dead.wind);
}
{
  const c=world({wind:saved('새 뜻',102)},{});
  c.mergeWordState({}, {wind:101});
  assert.equal(c.words.wind.ko,'새 뜻','an explicit re-add newer than its tombstone must survive');
}
console.log('Word meaning cleanup and sync resurrection checks passed');
