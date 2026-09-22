import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const state=readFileSync(new URL('../scripts/core/state.js',import.meta.url),'utf8');
const helper=readFileSync(new URL('../scripts/core/word-integrity.js',import.meta.url),'utf8');
const base=Object.fromEntries(Array.from({length:5000},(_,i)=>['word'+i,{word:'word'+i,ko:'뜻',status:1,up:1}]));
const memory=new Map([['breeze.words',JSON.stringify(base)]]);let bytes=0,writes=0,failAt=Infinity;
const storage={get length(){return memory.size;},key:i=>[...memory.keys()][i],getItem:k=>memory.get(k)??null,
 setItem(k,v){if(++writes===failAt)throw new Error('QuotaExceededError');bytes+=v.length;memory.set(k,v);},removeItem:k=>memory.delete(k)};
function boot(){const c={localStorage:storage,console:{warn(){}},toast(){},Date};vm.createContext(c);
 vm.runInContext(helper+'\n'+state.slice(0,state.indexOf('const posOf ='))+'\nglobalThis.api={saveWords,loadWordState,words};',c);return c.api;}
let app=boot();app.words.word100.status=3;assert.equal(app.saveWords('word100'),true);
assert.equal(writes,2);assert.ok(bytes<300);assert.equal(boot().words.word100.status,3);
const singleBytes=bytes,fullBytes=JSON.stringify(base).length;
app.words.word100.ko='사용자 수정';delete app.words.word101;app.words.newMeaning={word:'newMeaning',ko:'새 뜻',status:2};
failAt=writes+3;assert.equal(app.saveWords(),false);
app=boot();assert.equal(app.words.word100.ko,'사용자 수정');assert.equal(app.words.word101,undefined);assert.equal(app.words.newMeaning.ko,'새 뜻');
failAt=Infinity;assert.equal(app.saveWords(),true);assert.equal(memory.has('breeze.word-write.pending'),false);
app=boot();assert.equal(app.words.word101,undefined);assert.equal(Object.keys(app.words).length,5000);
app.words.unresolved={word:'unresolved',ko:''};app.saveWords('unresolved');assert.equal(boot().words.unresolved,undefined);
console.log(JSON.stringify({records:5000,fullWriteChars:fullBytes,singleChangeChars:singleBytes,interruptedBatchRecovered:true,legacyPreserved:memory.get('breeze.words')===JSON.stringify(base)}));
