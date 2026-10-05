import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');
const extract=name=>source.match(new RegExp('(async )?function '+name+'\\([^]*?\\n\\}'))[0];
function world(){
 const cache=new Map(),requests=[],saved=[],renders=[];
 const w={word:'patient',ko:'참을성 있는',defs:[]};
 const c={words:{patient:w},navigator:{onLine:false},englishMetadataRequests:new Map(),englishCardRequests:new WeakMap(),
  activeSelectedWordNode:null,previewWordCard:null,homewardWordFor:()=>null,wordLookupAlive:()=>true,
  dictGet:async key=>cache.get(key),dictPut:async(key,value)=>cache.set(key,value),
  fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({word:'patient',entries:[{language:{code:'en'},partOfSpeech:'adjective',senses:[{definition:'Able to wait.'}]}]})};},
  saveWords:key=>saved.push(key),renderIfAlive:life=>renders.push(life),AbortController,setTimeout,clearTimeout,Date};
 vm.createContext(c);vm.runInContext(extract('fetchEnMetadata')+'\n'+extract('fillDictionaryMetadata'),c);
 return {c,w,cache,requests,saved,renders};
}
test('offline metadata cache miss sends no request, sets no provider failure/cooldown, and reconnect retries',async()=>{
 const {c,w,requests,cache}=world();await c.fillDictionaryMetadata('patient',1);
 assert.equal(requests.length,0);assert.equal(w.enError,undefined);assert.equal(w.enRetryAt,undefined);assert.equal(w.enLoading,undefined);assert.equal(cache.size,0);
 c.navigator.onLine=true;await c.fillDictionaryMetadata('patient',1);assert.equal(requests.length,1);assert.equal(w.defs[0].def,'Able to wait.');
});
test('offline cached English definitions remain available and cache misses on forced retry stay local',async()=>{
 const {c,w,cache,requests}=world();cache.set('en:v2:patient',{defs:[{def:'Cached definition'}],phon:'cached IPA',source:'wiktionary',expires:Date.now()+10000});
 await c.fillDictionaryMetadata('patient',1);assert.equal(w.defs[0].def,'Cached definition');assert.equal(requests.length,0);
 w.defs=[];await c.fillDictionaryMetadata('patient',1,true);assert.equal(requests.length,0);assert.equal(w.enRetryAt,undefined);
});
test('metadata resolved after card deletion cannot recreate it',async()=>{
 const {c,requests,saved}=world();c.navigator.onLine=true;let release;c.dictGet=()=>new Promise(r=>release=r);
 const task=c.fillDictionaryMetadata('patient',1);delete c.words.patient;release(null);await task;
 assert.equal(c.words.patient,undefined);assert.equal(saved.length,0);assert.equal(requests.length,1);
});
