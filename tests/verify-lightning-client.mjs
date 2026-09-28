import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../scripts/dictionary/lightning.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(disk=new Map()){
  let now=1000000,id=0,pi=0,reads=0,saves=0,networkLookups=0,animations=0;
  const timers=new Map(),storage=new Map(),events=new Map(),jobs=[];
  const on=(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list);};
  const emit=name=>(events.get(name)||[]).forEach(fn=>fn({}));
  const element=()=>({textContent:'',hidden:false,attrs:{},classList:{contains:()=>true,toggle(){}},
    setAttribute(k,v){this.attrs[k]=v;},addEventListener:on,animate(){animations++;return{cancel(){}};}});
  const elements=new Map(['aa-lightning','aa-lightning-note','v-read','word-peek-meaning','reader-scroll'].map(k=>[k,element()]));
  const paras=['The bank flooded. The reader gave the plan up.','A distant signal appeared. Another quiet evening began.'];
  const sentences=text=>{const out=[];for(const m of String(text).matchAll(/[^.!?]+[.!?]?/g)){
    const lead=m[0].length-m[0].trimStart().length;out.push({text:m[0].trim(),start:m.index+lead,end:m.index+m[0].length});}return out;};
  const tokens=text=>[...String(text).matchAll(/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
  const db={transaction(){
    const tx={oncomplete:null,onerror:null,onabort:null,objectStore:()=>store};
    const store={get(key){reads++;const q={};queueMicrotask(()=>{q.result=disk.get(key);q.onsuccess?.();});return q;},
      put(value,key){disk.set(key,value);},delete(key){disk.delete(key);},openCursor(){
        const rows=[...disk],q={};let at=0;
        const step=()=>queueMicrotask(()=>{q.result=at<rows.length?{key:rows[at][0],value:rows[at][1],continue(){at++;step();}}:null;
          q.onsuccess?.();if(!q.result)queueMicrotask(()=>tx.oncomplete?.());});step();return q;
      }};return tx;
  }};
  const box={console,Promise,Map,Set,AbortController,Date:class extends Date{static now(){return now;}},
    setTimeout(fn,ms=0){timers.set(++id,{fn,at:now+ms});return id;},clearTimeout(n){timers.delete(n);},
    navigator:{onLine:true},document:{hidden:false,getElementById:k=>elements.get(k)||null,addEventListener:on,
      querySelector:()=>({textContent:paras[pi]}),querySelectorAll:()=>[]},MutationObserver:class{observe(){}},
    addEventListener:on,matchMedia:()=>({matches:false}),load:(k,f)=>storage.has(k)?storage.get(k):f,save:(k,v)=>storage.set(k,v),
    openDb:()=>()=>Promise.resolve(db),sbUser:{id:'fixture-user'},curBook:{id:'book-1',paras},currentReaderMode:'text',
    originalSession:null,readerScroller:()=>({addEventListener:on}),topInset:()=>0,captureAnchor:()=>({pi}),
    domRangeForOffsets:()=>({getBoundingClientRect:()=>({bottom:100})}),bridgeSentences:sentences,
    lookupSentenceTokens:tokens,lemmaCands:word=>[word.toLowerCase()],aiDay:()=> '2026-09-28',LS_AI_LEFT:'ai-left',
    rememberAiLeft:left=>storage.set('ai-left',{day:'2026-09-28',left}),onboardingOwnsReader:()=>false,
    wordLookupOpen:()=>false,sentenceLookupOpen:()=>false,words:{},dead:{},selKey:'bank',wordLookupLife:1,
    wordPeekActive:true,previewWordCard:null,wordPeekRetryState:null,activeSelectedWordNode:null,
    hasResolvedMeaning:w=>!!w?.ko,currentContext:()=>null,displayedWord:k=>box.words[k],
    senseCardKey:(root,ko)=>root+':'+ko,phraseCardKey:text=>'phrase:'+text,
    wordLookupAlive:life=>life===box.wordLookupLife,wordLookupSignal:()=>null,
    wordPeekState:w=>({text:w?.ko||'뜻 찾는 중',loading:!w?.ko}),
    renderWordPeek(){elements.get('word-peek-meaning').textContent=box.wordPeekState(box.words[box.selKey],null).text;},
    renderWordLookup(){box.renderWordPeek();},endWordLookupLife(){box.wordLookupLife++;},
    loadCachedLook:async()=>false,fetchLook:async()=>{networkLookups++;return false;},
    expressionFromMini:answer=>answer.kind==='expression'?{canonical:answer.canonical}:null,
    saveDetectedExpression(k,phrase,sentence,book,answer){box.words['phrase:'+phrase.canonical]={ko:answer.ko};delete box.words[k];},
    applyLook(w,answer){w.ko=answer.ko;},rememberSenseContext(){},saveWords(){saves++;},
    lookupRequestFor(w,node){return {sentence:node?.dataset?.example||w.example||'',before:node?.dataset?.contextBefore||'',
      after:node?.dataset?.contextAfter||'',clickedIndex:Number(node?.dataset?.clickedTokenIndex||0),clicked:node?.textContent||w.clicked||'',book:'fixture'};},
    dictCall(payload,signal){return new Promise(resolve=>jobs.push({payload,signal,resolve}));}
  };
  box.window=box;
  vm.createContext(box);vm.runInContext(source,box);
  const api=vm.runInContext('BreezeLightning',box);
  async function advance(ms){
    await flush();
    const end=now+ms;
    for(let steps=0;steps<100;steps++){
      const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].fn();await flush();
    }
    now=end;await flush();
  }
  function reply(job,error=''){
    job.resolve(error?{error}:{version:1,left:299,usage:{input_tokens:100,output_tokens:200},
      sentences:job.payload.sentences.map(input=>({sentence:input.sentence,units:input.tokens.map((token,index)=>({
        kind:'word',canonical:token.text.toLowerCase(),members:[index],ko:token.text.toLowerCase()==='bank'?'강둑':'뜻'}))}))});
  }
  return{api,box,jobs,storage,disk,elements,advance,reply,emit,scroll:n=>{pi=n;emit('scroll');},
    counters:()=>({reads,saves,networkLookups,animations})};
}
const f=fixture();
await f.advance(10000);assert.equal(f.jobs.length,0);assert.equal(f.api.enabled(),false);
f.api.setEnabled(true);await f.advance(0);assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].payload.sentences.length,2);
assert.equal(Object.keys(f.box.words).length,0);
f.reply(f.jobs[0]);await flush();
const input={sentence:'The bank flooded.',before:'',after:'The reader gave the plan up.',clickedIndex:1};
assert.equal(f.api.peek(input).ko,'강둑');assert.equal(f.api.peek({...input,before:'Different.'}),null);
assert.equal(Object.keys(f.box.words).length,0,'untapped prefetch must not save');
f.box.words.bank={word:'bank',clicked:'bank',ko:'',example:input.sentence};
f.box.activeSelectedWordNode={textContent:'bank',dataset:{example:input.sentence,contextBefore:input.before,contextAfter:input.after,clickedTokenIndex:'1'}};
assert.equal(f.box.wordPeekState(f.box.words.bank,null).text,'강둑');assert.equal(f.counters().saves,0);
f.box.renderWordPeek();assert.equal(f.elements.get('word-peek-meaning').textContent,'강둑');assert.equal(f.counters().animations,1);
f.box.renderWordPeek();assert.equal(f.counters().animations,1,'one reveal per opening');
assert.equal(await f.box.loadCachedLook('bank',0,f.box.wordLookupLife,f.box.activeSelectedWordNode),true);
assert.equal(f.box.words.bank.ko,'강둑');assert.equal(f.counters().networkLookups,0);
f.box.endWordLookupLife();f.box.words.bank.ko='내 뜻';
f.box.renderWordPeek();assert.equal(f.elements.get('word-peek-meaning').textContent,'내 뜻');assert.equal(f.counters().animations,1);
await f.box.fetchLook('bank',{...input,retry:true,hold:true});assert.equal(f.counters().networkLookups,1);
const reads=f.counters().reads;
assert.equal(await f.api.resolve({...input,sentence:'Not cached.'}),null);
assert.equal(f.counters().reads,reads,'a tap must not wait for disk hydration');
f.box.dead['bank:강둑']=1;f.box.words.bank.ko='';
assert.equal(f.box.wordPeekState(f.box.words.bank,null).loading,true,'deleted meaning must not preview');delete f.box.dead['bank:강둑'];
f.box.sbUser={id:'another-user'};assert.equal(f.api.peek(input),null,'account boundary');f.box.sbUser={id:'fixture-user'};
f.box.curBook.id='book-2';assert.equal(f.api.peek(input),null,'book boundary');f.box.curBook.id='book-1';
f.box.wordPeekActive=false;f.box.wordLookupOpen=()=>false;
f.scroll(1);await f.advance(1600);assert.equal(f.jobs.length,2);
const delayed=f.jobs[1];
const waiting=f.api.resolve({sentence:'A distant signal appeared.',before:'The reader gave the plan up.',after:'Another quiet evening began.',clickedIndex:1});
f.reply(delayed);await flush();assert.equal((await waiting).ko,'뜻');assert.equal(f.jobs.length,2,'joins existing request');
// A second instance reuses persisted cache without calling AI.
const reopened=fixture(f.disk);reopened.api.setEnabled(true);await reopened.advance(0);
assert.equal(reopened.jobs.length,0);assert.equal(reopened.api.peek(input).ko,'강둑');reopened.api.setEnabled(false);
// OFF aborts an in-flight request and rejects a late response.
const cancel=fixture();cancel.api.setEnabled(true);await cancel.advance(0);
assert.equal(cancel.jobs.length,1);cancel.api.setEnabled(false);assert.equal(cancel.jobs[0].signal.aborted,true);
cancel.reply(cancel.jobs[0]);await cancel.advance(10000);assert.equal(cancel.disk.size,0);assert.equal(cancel.jobs.length,1);
// Anonymous readers never prefetch.
const anon=fixture();anon.box.sbUser=null;anon.api.setEnabled(true);await anon.advance(5000);assert.equal(anon.jobs.length,0);
// Local safety budget and disabled backend fail softly without repeated requests.
const cap=fixture();cap.storage.set('breeze.lightning-budget.fixture-user',{day:'2026-09-28',sentences:200});
cap.api.setEnabled(true);await cap.advance(0);assert.equal(cap.jobs.length,0);assert.equal(cap.api.stats().stopped,'quota');
const switched=fixture();switched.api.setEnabled(true);await switched.advance(0);
switched.box.sbUser={id:'different-user'};switched.reply(switched.jobs[0]);await flush();
assert.equal(switched.disk.size,0,'response from previous account must be dropped');
assert.equal(switched.storage.has('ai-left'),false,'must not overwrite next account quota');
const reduced=fixture();reduced.box.matchMedia=()=>({matches:true});reduced.api.setEnabled(true);
reduced.api.reveal(reduced.elements.get('word-peek-meaning'));assert.equal(reduced.counters().animations,0);
const down=fixture();down.api.setEnabled(true);await down.advance(0);down.reply(down.jobs[0],'prefetch_disabled');
await down.advance(10000);assert.equal(down.jobs.length,1);assert.equal(down.api.stats().stopped,'server');
console.log('Lightning client PASS: OFF, 2-sentence limit, separate persistent cache, synchronous preview, one reveal, saved meaning priority, tombstones, retry, no tap-time disk I/O, account/book isolation, in-flight deduplication, cancellation, anonymous guard, budget, unavailable backend.');
