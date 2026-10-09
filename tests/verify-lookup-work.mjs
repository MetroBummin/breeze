import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const integrity=read('scripts/core/word-integrity.js');
const dictionary=read('scripts/dictionary/dictionary.js');
const fn=(source,name)=>source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n\\}'))[0];
const plain=value=>JSON.parse(JSON.stringify(value));
class Clock extends Date {static now(){return 1790662693000;}}
function world(items,dead={}){
 const c={items:structuredClone(items),dead:structuredClone(dead),Date:Clock};
 vm.createContext(c);vm.runInContext(integrity,c);return c;
}
// A simple legacy oracle preserves repair ordering, including malformed chains.
// It is test-only: production must never repeat this whole-state scan per root.
const reference=`function reference(items,tombstones,protectedKey){
 let changed=false;const groups=new Map();
 Object.entries(items).forEach(([key,item])=>{
  if(!item)return;
  if(!validWordMeaning(item)&&!item.koEdited&&item.ai&&item.ai.done&&typeof item.ai.ko==='string'&&item.ai.ko.trim()){
   item.ko=item.ai.ko.trim();changed=true;
  }
  const root=item.root||key;
  if(!groups.has(root))groups.set(root,[]);
  groups.get(root).push([key,item]);
 });
 groups.forEach((cards,root)=>{
  if(root===protectedKey)return;
  const valid=savedMeaningRecords(root,items),empty=cards.filter(([,item])=>!validWordMeaning(item));
  if(!empty.length)return;
  const bury=(key,item)=>{delete items[key];tombstones[key]=Math.max(Date.now(),(item.up||item.addedAt||0)+1,tombstones[key]||0);changed=true;};
  if(valid.length&&items[root]&&!validWordMeaning(items[root])){
   const [key,item]=valid[0],base=items[root];
   items[root]=promotedRootMeaning(base,item,Math.max(Date.now(),base.up||0,item.up||0)+1);bury(key,item);
  }
  empty.forEach(([key,item])=>{if(items[key]&&!validWordMeaning(items[key]))bury(key,item);});
 });return changed;
}`;
let seed=923719;
const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(let trial=0;trial<1000;trial++){
 const items={},dead={};
 for(let i=0;i<18;i++){
  const key=String(i),ko=['','  ','뜻 '+i,null][rand(4)];
  items[key]={word:'word'+i,ko,up:rand(20),addedAt:rand(20),status:rand(3)+1,mark:!!rand(2)};
  if(rand(3))items[key].root=String(rand(22));
  if(rand(4)===0)items[key].ai={done:true,ko:'AI '+i};
  if(rand(4)===0)items[key].koEdited=true;
  if(rand(4)===0)items[key].phraseParts=['a','b'];
  if(rand(4)===0)dead[key]=Clock.now()+100;
 }
 const protectedKey=trial%3===0?String(rand(18)):undefined;
 const a=world(items,dead),b=world(items,dead);vm.runInContext(reference,a);
 assert.equal(b.cleanOrphanWords(b.items,b.dead,protectedKey),a.reference(a.items,a.dead,protectedKey),'return '+trial);
 assert.deepEqual(plain(b.items),plain(a.items),'records '+trial);
 assert.deepEqual(plain(b.dead),plain(a.dead),'tombstones '+trial);
}
// Scale tests assert work, not machine-dependent millisecond thresholds.
for(const n of [0,100,2100,5000])for(const empty of [false,true]){
 const items=Object.fromEntries(Array.from({length:n},(_,i)=>['word'+i,{word:'word'+i,ko:empty?'':'뜻',status:1,addedAt:1}]));
 const c=world(items);
 vm.runInContext(`globalThis.enumerations=0;globalThis.visits=0;
 const originalEntries=Object.entries;
 Object.entries=value=>{const result=originalEntries(value);enumerations++;visits+=result.length;return result;};`,c);
 c.cleanOrphanWords(c.items,c.dead);
 assert.equal(c.enumerations,1,'cleanup enumerated state again: '+n);
 assert.equal(c.visits,n);
 assert.equal(Object.keys(c.items).length,empty?0:n);
}
// Completed cache writes are not a prerequisite for live or held/retry answers.
for(const hold of [false,true]){
 let cacheWrites=0,resolveCache;
 const cache=new Promise(resolve=>{resolveCache=resolve;});
 const w={word:'patient',clicked:'patient',forms:['patient'],ko:'',example:'patient reader'};
 const answer={kind:'word',canonical:'patient',members:[0],ko:'참을성 있는',left:10};
 const c={wordLookRequests:new WeakMap(),words:{patient:w},pendingWord:null,wordLookupLife:1,activeSelectedWordNode:null,
  navigator:{onLine:true},sb:{},sbUser:{id:'test'},AI_MIN_WAIT:0,
  lookupSentenceTokens:()=>[{text:'patient'},{text:'reader'}],entryKeys:()=>['patient'],
  wordLookupAlive:()=>true,renderIfAlive(){},rememberAiLeft(){},
  recoverableWordLookup:async()=>answer,lookKey:()=> 'test-cache',
  dictPut(){cacheWrites++;return cache;},expressionFromMini:()=>null,
  applyLook:(item,result)=>{item.ko=result.ko;},rememberSenseContext(){},saveWords(){},setTimeout};
 vm.createContext(c);vm.runInContext(fn(dictionary,'fetchLook'),c);
 const result=await Promise.race([
  c.fetchLook('patient',{life:1,sentence:'patient reader',clicked:'patient',clickedIndex:0,retry:true,hold}),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('answer waited for cache')),100))
 ]);
 assert.equal(cacheWrites,1);assert.equal(hold?result.ko:w.ko,answer.ko);resolveCache();
}
// Opening a mini pill does not fetch English content which is not on screen.
{
 let metadata=0;
 const element={classList:{add(){},remove(){},toggle(){}},removeAttribute(){},setAttribute(){},style:{}};
 const c={document:{getElementById:()=>element},words:{patient:{word:'patient',ko:'뜻'}},
  wordDetailAnchored:false,previewWordCard:null,wordLookupLife:1,selKey:null,
  stopWordMorph(){},beginWordLookupLife(){},currentContext:()=>null,
  clearActiveWordSelection(){},homewardWordFor:()=>null,wordLookupAlive:()=>true,
  fillDictionaryMetadata(){metadata++;},requestAnimationFrame:fn=>fn(),
  renderWordPeek(){},renderPanel(){},rememberWordPeekAnchor(){},deferWordOpenState(){}};
 vm.createContext(c);vm.runInContext(fn(dictionary,'selectWord'),c);
 c.selectWord('patient',null,true);assert.equal(metadata,0);
 c.selectWord('patient',null,false);assert.equal(metadata,1);
}
{
 let metadata=0;const saved=[];
 const c={wordLookRequests:new WeakMap(),wordDictRequests:new WeakMap(),words:{patient:{ko:'뜻'}},wordLookupLife:1,selKey:'patient',
  renderIfAlive(){},loadCachedLook:async()=>true,wordLookupAlive:()=>true,
  fillDictionaryMetadata(){metadata++;},saveWords:key=>saved.push(key),
  hasResolvedMeaning:()=>true,queueSync(){}};
 vm.createContext(c);vm.runInContext(fn(dictionary,'fetchDict'),c);
 await c.fetchDict('patient',null);assert.equal(metadata,0);assert.deepEqual(saved,['patient']);
}
// The shell animates transforms; layout-affecting keyframes are forbidden.
{
 let frames,reduced=false;
 const panel={classList:{add(){},remove(){}},animate(value){frames=value;return {finished:new Promise(()=>{})};}};
 const c={document:{getElementById:()=>panel},wordMorphGeneration:1,wordMorphAnimation:null,
  matchMedia:()=>({matches:reduced}),stopWordMorph(){c.wordMorphAnimation=null;}};
 vm.createContext(c);vm.runInContext(fn(dictionary,'morphWordSurface'),c);
 c.morphWordSurface({left:50,top:50,width:100,height:44},{left:20,top:50,width:360,height:380});
 assert.equal(frames.length,2);
 for(const frame of frames){assert.ok(frame.transform);for(const key of ['left','top','width','height'])assert.equal(frame[key],undefined);}
 reduced=true;c.morphWordSurface({},{width:360,height:380});assert.equal(c.wordMorphAnimation,null);
}
// Fresh users must not construct a hidden Home before entering the tutorial.
for(const onboarding of [true,false]){
 let homes=0,revealed=0;
 const c={startSharedFileImports(){},syncHomeNavigation(){},loadBooks:async()=>{},migrateLibraryFolders(){},upgradeHomewardLongRead:async()=>{},restoreMissingLongReadCovers:async()=>{},
  maybeShowOnboarding:async()=>{},onboardingSession:onboarding?{}:null,onboardingOwnsReader:()=>false,renderHome(){homes++;},
  document:{documentElement:{classList:{remove(){revealed++;}}}},navigator:{},console};
 vm.createContext(c);vm.runInContext(read('scripts/main.js')+'\nglobalThis.boot=homeReady;',c);
 await c.boot;assert.equal(homes,onboarding?0:1);assert.equal(revealed,1);
}
console.log('lookup work: 1000 cleanup parity cases; linear 0/100/2100/5000 state; cache independence; on-demand metadata; transform-only morph; visible-only boot passed');
