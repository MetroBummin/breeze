import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');
const fn=name=>source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n\\}'))[0];
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
const answer={kind:'word',canonical:'bank',members:[1],ko:'은행',left:10};
const session=id=>({data:{session:id?{user:{id},access_token:'synthetic-'+id}:null}});

function fixture(names){
  let scope={id:'user:A',generation:1},life=1;
  const calls=[],saves=[],puts=[],renders=[],frames=[],reports=[],timers=new Map();let timer=0;
  const word={word:'bank',clicked:'bank',forms:['bank'],example:'A bank stands.',ko:'',book:'fixture'};
  const box={console:{warn(){}},navigator:{onLine:true},sbUser:{id:'A'},dictAuthCredential:{userId:'A',accessToken:'synthetic-A'},
    reportLookupFailure:reason=>reports.push(reason),sb:{auth:{getSession:async()=>session('A')}},
    SB_URL:'https://fixture.invalid',SB_KEY:'synthetic-anon',AbortController,Response,crypto,WeakMap,Map,
    captureLearningScope:()=>({...scope}),isLearningScopeCurrent:token=>token.id===scope.id&&token.generation===scope.generation,
    setTimeout:(callback,ms)=>{timers.set(++timer,{callback,ms});return timer;},clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:callback=>frames.push(callback),
    words:{bank:word},dead:{},selKey:'bank',wordLookupLife:life,activeSelectedWordNode:null,AI_MIN_WAIT:0,AI_TIMEOUT:9000,
    wordLookupAlive:value=>value===life,wordLookupSignal:()=>null,wordLookRequests:new WeakMap(),wordDictRequests:new WeakMap(),englishCardRequests:new WeakMap(),
    previewWordCard:null,homewardWordFor:()=>null,curBook:null,entryKeys:()=>['bank'],deviceId:()=> 'synthetic-device',
    lookupRequestFor:()=>({sentence:'A bank stands.',clicked:'bank',clickedIndex:1,before:'',after:''}),
    lookupSentenceTokens:()=>[{text:'A'},{text:'bank'},{text:'stands'}],lookupClickedTokenIndex:()=>1,
    expressionFromMini:()=>null,saveDetectedExpression:()=>saves.push('expression'),applyLook:(w,j)=>{w.ko=j.ko;saves.push('answer');},
    saveWords:id=>saves.push(id),queueSync:()=>saves.push('sync'),rememberSenseContext(){},rememberAiLeft:()=>saves.push('quota'),
    renderIfAlive:value=>{if(value===life)renders.push(value);},hasResolvedMeaning:w=>!!w.ko,
    dictGet:async()=>null,lookKey:()=> 'synthetic-cache',dictPut:(key,value)=>{puts.push({key,value});return Promise.resolve();},
    recoverableWordLookup:async()=>answer,
    fetch:async(url,opt)=>{calls.push({url,opt});return Response.json(answer);},
    touchMeaning:()=>saves.push('touch'),paintWord(){},renderWordLookup(){},
  };
  vm.createContext(box);vm.runInContext(names.map(fn).join('\n'),box);
  const switchTo=(id,{resetLife=false}={})=>{
    scope={id:id?'user:'+id:'guest',generation:scope.generation+1};box.sbUser=id?{id}:null;
    box.dictAuthCredential=id?{userId:id,accessToken:'synthetic-'+id}:null;
    box.sb.auth.getSession=async()=>session(id);
    if(resetLife)box.wordLookupLife=++life;
  };
  return {box,word,calls,saves,puts,renders,frames,reports,timers,switchTo,
    fire:async ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert.ok(entry,'missing timer');timers.delete(entry[0]);entry[1].callback();await flush();}};
}

test('a response that arrives after the account changes is discarded',async()=>{
  for(const returnToA of [false,true]){
    const f=fixture(['dictCall']),late=deferred();
    f.box.fetch=async(url,opt)=>{f.calls.push({url,opt});return late.promise;};
    const pending=f.box.dictCall({op:'look_v2'});await flush();
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].opt.headers.Authorization,'Bearer synthetic-A');
    f.switchTo('B');if(returnToA)f.switchTo('A');
    late.resolve(Response.json(answer));
    assert.equal(await pending,null);assert.equal(f.timers.size,0);
  }
});

test('a cached token for a different account is not sent',async()=>{
  const mismatch=fixture(['dictCall']);mismatch.box.dictAuthCredential={userId:'B',accessToken:'synthetic-B'};
  assert.equal(await mismatch.box.dictCall({op:'look_v2'}),null);assert.equal(mismatch.calls.length,0);
  assert.equal(mismatch.reports.at(-1),'scope_mismatch');
  const missing=fixture(['dictCall']);missing.box.dictAuthCredential=null;
  await missing.box.dictCall({op:'warm'});
  assert.equal(missing.calls[0].opt.headers.Authorization,'Bearer synthetic-anon');
  for(const actor of ['A',null]){
    const f=fixture(['dictCall']);f.switchTo(actor);f.box.sbUser={id:'B'};
    f.box.dictAuthCredential={userId:'B',accessToken:'synthetic-B'};
    assert.equal(await f.box.dictCall({op:'look_v2'}),null);assert.equal(f.calls.length,0);
  }
  const signedOut=fixture(['dictCall']);signedOut.switchTo(null);
  signedOut.box.dictAuthCredential={userId:'A',accessToken:'synthetic-A'};
  await signedOut.box.dictCall({op:'look_v2'});
  assert.equal(signedOut.calls[0].opt.headers.Authorization,'Bearer synthetic-anon');
  const f=fixture(['dictCall']);assert.equal((await f.box.dictCall({op:'look_v2'})).ko,answer.ko);
  assert.equal(f.calls[0].opt.headers.Authorization,'Bearer synthetic-A');
});

test('sbUser null keeps the cached token, and a real sign-out stays anonymous',async()=>{
  const cached=fixture(['dictCall']);cached.box.sbUser=null;
  assert.equal((await cached.box.dictCall({op:'look_v2'})).ko,answer.ko);
  assert.equal(cached.calls[0].opt.headers.Authorization,'Bearer synthetic-A');
  const signedOut=fixture(['dictCall']);signedOut.box.sbUser=null;signedOut.box.dictAuthCredential=null;
  await signedOut.box.dictCall({op:'warm'});
  assert.equal(signedOut.calls[0].opt.headers.Authorization,'Bearer synthetic-anon');
});


test('an auth user cannot dispatch while the active local scope still belongs elsewhere',async()=>{
  for(const local of ['A',null]){
    const f=fixture(['dictCall']);f.switchTo(local);f.box.sbUser={id:'B'};
    let authCalls=0;f.box.sb.auth.getSession=async()=>{authCalls++;return session('B');};
    assert.equal(await f.box.dictCall({op:'look_v2'}),null);assert.equal(authCalls,0);assert.equal(f.calls.length,0);
  }
  const f=fixture(['dictCall']),late=deferred();
  f.box.fetch=async(url,opt)=>{f.calls.push({url,opt});return late.promise;};
  const pending=f.box.dictCall({op:'look_v2'});await flush();f.box.sbUser={id:'B'};
  late.resolve(Response.json(answer));
  assert.equal(await pending,null);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].opt.headers.Authorization,'Bearer synthetic-A');
});

test('HTTP and body completions that ignore cancellation cannot return across a scope generation',async()=>{
  for(const stage of ['http','body']){
    const f=fixture(['dictCall']),late=deferred();
    f.box.fetch=async()=>stage==='http'?late.promise:{ok:true,status:200,json:()=>late.promise};
    const pending=f.box.dictCall({op:'look_v2'});await flush();f.switchTo('B');f.switchTo('A');
    late.resolve(stage==='http'?Response.json(answer):answer);
    assert.equal(await pending,null);assert.equal(f.timers.size,0);
  }
});

test('late word or expression answer cannot mutate the restored A record or quota',async()=>{
  for(const expression of [false,true])for(const hold of [false,true]){
    const f=fixture(['fetchLook']),late=deferred();f.box.recoverableWordLookup=()=>late.promise;
    f.box.expressionFromMini=()=>expression?{canonical:'bank on',parts:['bank','on']}:null;
    const pending=f.box.fetchLook('bank',{hold});f.switchTo('B');f.switchTo('A');
    late.resolve(answer);assert.equal(await pending,false);
    assert.equal(f.word.ko,'');assert.deepEqual(f.saves,[]);assert.equal(f.puts.length,0);
  }
});

test('response held for the minimum presentation time cannot apply after switching accounts',async()=>{
  for(const hold of [false,true]){
    const f=fixture(['fetchLook']);f.box.AI_MIN_WAIT=10000;
    const pending=f.box.fetchLook('bank',{hold});await flush();assert.equal(f.puts.length,1);
    const savedBefore=f.saves.slice();f.switchTo('B');f.switchTo('A');
    const waiting=[...f.timers.values()][0];assert.ok(waiting);waiting.callback();
    assert.equal(await pending,false);assert.equal(f.word.ko,'');assert.deepEqual(f.saves,savedBefore);
  }
});

test('cached answer and seed delay cannot mutate a later account generation',async()=>{
  for(const stage of ['cache','seed']){
    const f=fixture(['loadCachedLook']),late=deferred();f.box.AI_MIN_WAIT=10000;
    f.box.dictGet=()=>stage==='cache'?late.promise:Promise.resolve({...answer,seed:true});
    const pending=f.box.loadCachedLook('bank',Date.now(),1,null);await flush();
    f.switchTo('B');f.switchTo('A');
    if(stage==='cache')late.resolve(answer);else [...f.timers.values()][0].callback();
    assert.equal(await pending,true);assert.equal(f.word.ko,'');assert.deepEqual(f.saves,[]);
  }
});

test('same-account closed lookup still saves an already-arrived cached answer',async()=>{
  const f=fixture(['loadCachedLook']),late=deferred();f.box.dictGet=()=>late.promise;
  const pending=f.box.loadCachedLook('bank',Date.now(),1,null);f.box.wordLookupAlive=()=>false;
  late.resolve(answer);assert.equal(await pending,true);assert.equal(f.word.ko,answer.ko);
});

test('same-account dismissal keeps an already-arrived network answer and never awaits its cache write',async()=>{
  const f=fixture(['fetchLook']),late=deferred();f.box.recoverableWordLookup=()=>late.promise;
  f.box.dictPut=(key,value)=>{f.puts.push({key,value});return new Promise(()=>{});};
  const pending=f.box.fetchLook('bank');f.box.wordLookupAlive=()=>false;late.resolve(answer);
  assert.equal(await pending,true);assert.equal(f.puts.length,1);assert.equal(f.word.ko,answer.ko);
});

test('dictionary wrapper and English metadata ignore a later account generation',async()=>{
  for(const name of ['fetchDict','fillDictionaryMetadata']){
    const f=fixture([name]),late=deferred();
    f.box.loadCachedLook=()=>late.promise;f.box.fetchEnMetadata=()=>late.promise;
    const pending=f.box[name]('bank',1);f.switchTo('B');f.switchTo('A');
    late.resolve(name==='fetchDict'?true:{defs:[{def:'fixture definition'}],phon:'fixture'});
    await pending;assert.deepEqual(f.saves,[]);assert.equal(f.word.defs,undefined);
  }
});

test('deferred opening cannot bump or save the same restored record',()=>{
  const f=fixture(['deferWordOpenState']);f.word.ko='은행';f.word.status=1;
  f.box.deferWordOpenState('bank',true);f.switchTo('B');f.switchTo('A');f.frames[0]();
  assert.equal(f.word.status,1);assert.deepEqual(f.saves,[]);
});

test('old Memory blur, delete and star handlers cannot edit the next account',()=>{
  const f=fixture(['bindMemoryVocabularyGroup']);let blur;
  const chip={},remove={},ko={addEventListener:(type,handler)=>{if(type==='blur')blur=handler;}};
  const sense={dataset:{k:'bank'},querySelector:key=>key==='.rowdel'?remove:ko};
  const group={dataset:{head:'bank'},querySelector:()=>chip,querySelectorAll:()=>[sense]};
  f.box.bindVocabularyGroupToggle=()=>{};f.box.vocabOpen=new Set();
  f.box.deleteMeaning=()=>f.saves.push('delete');f.box.setStatus=()=>f.saves.push('status');f.box.renderVocab=()=>{};
  f.box.bindMemoryVocabularyGroup(group);f.switchTo('B');f.switchTo('A');
  blur({target:{textContent:'changed'}});remove.onclick();chip.onclick();
  assert.equal(f.word.ko,'');assert.deepEqual(f.saves,[]);
});

test('account teardown closes both lookups before dropping transient state',()=>{
  const f=fixture(['resetDictionaryLearningScope']),order=[];
  for(const name of ['recentWordOpens','wordLookupRecoveries','sentenceRecoveries','easyExplanationCache','easyExplanationContexts','vocabOpen','vocabWindowHeights']){
    f.box[name]=new Map([['fixture',true]]);
  }
  f.box.pendingWord={key:'bank'};f.box.firstLookupMeaning={root:'bank'};f.box.contextView={key:'bank'};
  f.box.vocabCatalogCache={};f.box.anonLooksLeft=12;
  f.box.closePanel=()=>order.push('word');f.box.closeSentence=()=>order.push('sentence');
  f.box.clearSentenceEasyCache=()=>order.push('help');f.box.disposeVocabWindow=()=>order.push('memory');
  f.box.resetDictionaryLearningScope();
  assert.deepEqual(order,['word','sentence','help','memory']);assert.equal(f.box.pendingWord,null);assert.equal(f.box.contextView,null);
  assert.equal(f.box.vocabCatalogCache,null);assert.equal(f.box.anonLooksLeft,null);
  assert.equal(f.box.wordLookupRecoveries.size,0);assert.equal(f.box.easyExplanationCache.size,0);assert.equal(f.box.vocabOpen.size,0);
});
