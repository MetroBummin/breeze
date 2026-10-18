import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');
const slice=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const transport=slice('async function dictCall(','\nconst wordLookupRecoveries');
const recovery=slice('const wordLookupRecoveries','/* 읽기 시작할 때 함수만');
const fetchLook=slice('const wordLookRequests','\nfunction applyLook');
const askAI=slice('async function askAI(){',"document.getElementById('p-aibtn')");
const fetchDict=slice('async function fetchDict(',"\ndocument.addEventListener('keydown'");
const flush=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const session={data:{session:{access_token:'synthetic-fixture-token'}}};
const answer=payload=>({kind:'word',canonical:payload.word||'patient',members:[payload.clickedIndex??1],ko:'참을성 있는'});
function fixture(){
  const timers=new Map(),calls=[],auth=[],puts=[],renders=[],reports=[];let sequence=0,life=1,owner=new AbortController();
  let getSession=async()=>session,fetch=async payload=>Response.json(answer(payload));
  const word=surface=>({word:surface,clicked:surface,example:`A ${surface} reader.`,ko:'',book:'fixture'});
  let context={key:'patient',error:'error'};
  const box={console:{warn(){}},navigator:{onLine:true},sb:{auth:{getSession:()=>{auth.push(true);return getSession();}}},sbUser:{id:'fixture-user'},
    dictAuthCredential:{userId:'fixture-user',accessToken:'synthetic-fixture-token'},reportLookupFailure:reason=>reports.push(reason),
    SB_URL:'https://fixture.invalid',SB_KEY:'synthetic-anon',
    Response,crypto,AbortController,WeakMap,setTimeout:(fn,ms)=>{timers.set(++sequence,{fn,ms});return sequence;},clearTimeout:id=>timers.delete(id),AI_TIMEOUT:9000,AI_MIN_WAIT:0,
    fetch:async(url,opt)=>{const payload=JSON.parse(opt.body);calls.push({payload,signal:opt.signal,headers:opt.headers});return fetch(payload,opt.signal);},
    words:{patient:word('patient'),another:word('another')},selKey:'patient',wordLookupLife:life,activeSelectedWordNode:{},
    wordLookupAlive:value=>value===life,wordLookupSignal:()=>owner.signal,deviceId:()=>'',
    currentContext:()=>context,renderIfAlive:value=>{if(value===life)renders.push(value);},
    lookupRequestFor:w=>({sentence:w.example,clicked:w.clicked,clickedIndex:1,before:'',after:''}),
    lookupSentenceTokens:s=>[...s.matchAll(/[A-Za-z]+/g)].map(m=>({text:m[0]})),lookupClickedTokenIndex:()=>-1,entryKeys:w=>[w.word],
    lookKey:(w,s,i)=>`${w}|${s}|${i}`,dictPut:async(key,value)=>{puts.push({key,value});},loadCachedLook:async()=>false,
    expressionFromMini:()=>null,applyLook:(w,j)=>{w.ko=j.ko;delete w.aiOff;},rememberSenseContext(){},saveWords(){},rememberAiLeft(){},openSyncModal(){},queueSync(){},hasResolvedMeaning:w=>!!w.ko,
  };
  vm.createContext(box);vm.runInContext([transport,recovery,fetchLook,askAI,fetchDict].join('\n'),box);
  return {box,calls,auth,puts,renders,reports,timers,session:fn=>{getSession=fn;},fetch:fn=>{fetch=fn;},context:()=>context,
    next:()=>{owner.abort();owner=new AbortController();box.wordLookupLife=++life;context={key:box.selKey};return life;},
    close:()=>{owner.abort();box.wordLookupLife=++life;},
    fire:async ms=>{const item=[...timers.entries()].find(([,t])=>t.ms===ms);assert.ok(item,`missing ${ms}ms deadline`);timers.delete(item[0]);item[1].fn();await flush();}};
}

test('cached credential sends without getSession; signed-out, HTTP, and network failures keep their contracts',async()=>{
  const f=fixture();const result=await f.box.dictCall({op:'look_v2',word:'patient'});
  assert.equal(result.ko,'참을성 있는');assert.equal(result.httpStatus,200);
  assert.equal(f.calls[0].headers.Authorization,'Bearer synthetic-fixture-token');
  assert.equal(f.auth.length,0);assert.equal(f.timers.size,0);
  f.box.sbUser=null;f.box.dictAuthCredential=null;await f.box.dictCall({op:'warm'});
  assert.equal(f.calls[1].headers.Authorization,'Bearer synthetic-anon');assert.equal(f.auth.length,0);
  f.box.sbUser={id:'fixture-user'};f.box.dictAuthCredential={userId:'fixture-user',accessToken:'synthetic-fixture-token'};
  f.fetch(async()=>Response.json({error:'quota_exceeded'},{status:429}));
  assert.equal((await f.box.dictCall({op:'look_v2'})).error,'quota_exceeded');
  assert.equal(f.reports.at(-1),'server_status_429');
  f.fetch(async()=>{throw Error('network down');});assert.equal(await f.box.dictCall({op:'look_v2'}),null);
  assert.equal(f.reports.at(-1),'fetch_error');assert.equal(f.timers.size,0);
});

test('401 refreshes the cached session once and retries the lookup once',async()=>{
  const f=fixture();let refreshes=0;
  f.box.sb.auth.refreshSession=()=>{
    refreshes++;
    return Promise.resolve({data:{session:{user:{id:'fixture-user'},access_token:'synthetic-refreshed'}}});
  };
  let n=0;
  f.fetch(async payload=>{
    n++;
    return n===1?Response.json({error:'login_required'},{status:401}):Response.json(answer(payload));
  });
  const result=await f.box.dictCall({op:'look_v2',word:'patient'});
  assert.equal(refreshes,1);assert.equal(f.auth.length,0);assert.equal(f.calls.length,2);
  assert.equal(f.calls[0].headers.Authorization,'Bearer synthetic-fixture-token');
  assert.equal(f.calls[1].headers.Authorization,'Bearer synthetic-refreshed');
  assert.equal(result.ko,'참을성 있는');assert.equal(f.box.dictAuthCredential.accessToken,'synthetic-refreshed');
  f.fetch(async()=>Response.json({error:'login_required'},{status:401}));
  assert.equal((await f.box.dictCall({op:'look_v2'})).httpStatus,401);
  assert.equal(refreshes,2);assert.equal(f.calls.length,4);assert.equal(f.reports.at(-1),'server_status_401');
});

test('a hung refresh reports session_timeout and does not retry',async()=>{
  const f=fixture();f.box.sb.auth.refreshSession=()=>new Promise(()=>{});
  f.fetch(async()=>Response.json({message:'Invalid JWT'},{status:401}));
  const pending=f.box.dictCall({op:'look_v2',word:'patient'});await flush();assert.equal(f.calls.length,1);
  await f.fire(2500);const result=await pending;
  assert.equal(result.httpStatus,401);assert.equal(f.calls.length,1);assert.deepEqual(f.reports,['session_timeout']);
});

test('anonymous 401 does not refresh',async()=>{
  const f=fixture();let refreshes=0;f.box.sbUser=null;f.box.dictAuthCredential=null;
  f.box.sb.auth.refreshSession=()=>{refreshes++;return Promise.resolve({data:{session:null}});};
  f.fetch(async()=>Response.json({error:'login_required'},{status:401}));
  assert.equal((await f.box.dictCall({op:'look_v2'})).error,'login_required');
  assert.equal(refreshes,0);assert.equal(f.calls[0].headers.Authorization,'Bearer synthetic-anon');
  assert.equal(f.reports.at(-1),'server_status_401');
});

test('a repeated token reports clicked_index_missing and does not fetch',async()=>{
  const f=fixture();
  f.box.lookupSentenceTokens=()=>[{text:'and'},{text:'smoke'},{text:'and'}];
  f.box.lookupClickedTokenIndex=()=>-1;
  const ok=await f.box.fetchLook('patient',{life:1,sentence:'and smoke and',clicked:'and',clickedIndex:-1});
  assert.equal(ok,false);assert.equal(f.calls.length,0);assert.deepEqual(f.reports,['clicked_index_missing']);
  assert.equal(f.box.words.patient.aiOff,'error');
});

test('pre-aborted and offline calls do not start auth or fetch',async()=>{
  const f=fixture(),owner=new AbortController();owner.abort();
  assert.equal(await f.box.dictCall({op:'look_v2'},owner.signal),null);
  f.box.navigator.onLine=false;assert.equal(await f.box.dictCall({op:'explain'}),null);
  assert.equal(f.auth.length,0);assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);
});

test('a hung fetch ends at 30s and a late getSession cannot send another request',async()=>{
  for(const op of ['explain','easy_explanation','sentence_easy_explanation','warm']){
    const f=fixture(),auth=deferred(),body=deferred();f.session(()=>auth.promise);f.fetch(()=>body.promise);
    const pending=f.box.dictCall({op});await flush();
    assert.equal(f.auth.length,0);assert.equal(f.calls.length,1);
    assert.equal(f.calls[0].headers.Authorization,'Bearer synthetic-fixture-token');
    await f.fire(30000);assert.equal(await pending,null);assert.equal(f.reports.at(-1),'timeout');assert.equal(f.timers.size,0);
    auth.resolve(session);await flush();assert.equal(f.calls.length,1,'late authentication dispatched another request');
  }
});

test('word 9s attempt starts at fetch; manual retry recovers and late auth cannot dispatch',async()=>{
  const f=fixture(),old=deferred(),hung=deferred();f.session(()=>old.promise);f.fetch(()=>hung.promise);
  const pending=f.box.askAI();await flush();
  assert.equal(f.auth.length,0);assert.equal(f.calls.length,1);
  assert.ok([...f.timers.values()].some(timer=>timer.ms===9000),'9s deadline was not armed when fetch started');
  await f.fire(9000);assert.equal(await pending,false);assert.equal(f.box.words.patient.aiLoading,undefined);
  assert.equal(f.context().loading,'');assert.equal(f.context().error,'error');assert.equal(f.reports.at(-1),'timeout');assert.equal(f.timers.size,0);
  f.fetch(async payload=>Response.json(answer(payload)));assert.equal(await f.box.askAI(),true);assert.equal(f.calls.length,2);assert.equal(f.box.words.patient.ko,'참을성 있는');
  const id=f.calls[1].payload.lookupId;assert.ok(id);assert.equal(f.calls[0].payload.lookupId,id);assert.equal(f.context().error,undefined);
  old.resolve(session);await flush();assert.equal(f.calls.length,2);assert.equal(f.puts.length,1);
});

test('close during fetch settles promptly without applying a late response',async()=>{
  const f=fixture(),body=deferred();f.fetch(()=>body.promise);const pending=f.box.askAI();await flush();f.close();await flush();
  assert.equal(await pending,false);assert.equal(f.auth.length,0);assert.equal(f.box.words.patient.aiLoading,undefined);
  assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);assert.equal(f.reports.length,0);
  body.resolve(Response.json(answer({word:'patient'})));await flush();assert.equal(f.calls.length,1);assert.equal(f.box.words.patient.ko,'');
});

test('same-record reopen retains the new request loading after the old fetch is cancelled',async()=>{
  const f=fixture(),old=deferred(),newer=deferred();let reads=0;f.fetch(()=>++reads===1?old.promise:newer.promise);
  const prior=f.box.fetchLook('patient',{life:1});await flush();const life=f.next();const current=f.box.fetchLook('patient',{life});
  await flush();await prior;assert.equal(f.box.words.patient.aiLoading,true,'old request cleared newer loading');
  old.resolve(Response.json(answer({word:'patient'})));await flush();assert.equal(f.calls.length,2);assert.equal(f.box.words.patient.aiLoading,true);
  newer.resolve(Response.json(answer({word:'patient'})));assert.equal(await current,true);assert.equal(f.box.words.patient.aiLoading,undefined);
  assert.equal(life,2);
});

test('navigation to another word cannot paint the old response',async()=>{
  const f=fixture(),old=deferred();f.fetch(()=>old.promise);const prior=f.box.askAI();await flush();
  f.box.selKey='another';f.next();f.fetch(async payload=>Response.json(answer(payload)));
  assert.equal(await f.box.askAI(),true);await prior;
  const count=f.renders.length;old.resolve(Response.json(answer({word:'patient'})));await flush();
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].payload.word,'another');assert.equal(f.box.words.patient.ko,'');assert.equal(f.renders.length,count);
});

test('fetchDict cancellation cannot clear a replacement card or a newer same-record request',async()=>{
  for(const replace of [false,true]){
    const f=fixture(),old=deferred(),newer=deferred();let reads=0;f.fetch(()=>++reads===1?old.promise:newer.promise);
    const prior=f.box.fetchDict('patient');await flush();f.next();
    if(replace)f.box.words.patient={...f.box.words.patient};
    const current=f.box.fetchDict('patient');await flush();await prior;
    assert.equal(f.box.words.patient.aiLoading,true);assert.equal(f.box.words.patient.loading,true);
    old.resolve(Response.json(answer({word:'patient'})));await flush();assert.equal(f.calls.length,2);
    newer.resolve(Response.json(answer({word:'patient'})));await current;assert.equal(f.box.words.patient.aiLoading,undefined);assert.equal(f.box.words.patient.loading,undefined);
  }
});

test('fetch and JSON body that ignore cancellation still settle by deadline and cannot return late data',async()=>{
  for(const stage of ['fetch','body']){
    const f=fixture(),pendingStage=deferred();
    f.fetch(async()=>stage==='fetch'?pendingStage.promise:{ok:true,status:200,json:()=>pendingStage.promise});
    const pending=f.box.dictCall({op:'look_v2'});await flush();assert.equal(f.calls.length,1);
    await f.fire(30000);assert.equal(await pending,null);assert.equal(f.calls[0].signal.aborted,true);
    pendingStage.resolve(stage==='fetch'?Response.json(answer({})):answer({}));await flush();assert.equal(f.timers.size,0);
  }
});

test('an aborted attempt cannot return, and the next attempt can',async()=>{
  const f=fixture(),first=deferred();f.fetch(()=>first.promise);const owner=new AbortController();
  const old=f.box.dictCall({op:'look_v2',word:'old'},owner.signal);await flush();owner.abort();assert.equal(await old,null);
  f.fetch(async payload=>Response.json(answer(payload)));
  const next=await f.box.dictCall({op:'look_v2',word:'new'});
  assert.equal(next.canonical,'new');assert.equal(f.calls.length,2);assert.equal(f.calls[1].payload.word,'new');assert.equal(f.auth.length,0);
  first.resolve(Response.json(answer({word:'old'})));await flush();assert.equal(f.calls.length,2);
});


test('already-arrived usable answer is saved without clearing a newer lookup loading',async()=>{
  const f=fixture(),hung=deferred();f.fetch(()=>hung.promise);
  f.box.pendingWord=null;f.box.meaningKey=s=>s;f.box.isAcro=()=>false;
  vm.runInContext(slice('function applyWordCanonical(', 'function contextCardKey(')+
    slice('function applyLook(', '/* A failed first lookup'),f.box);
  const newer=f.box.fetchLook('patient',{life:f.next()});await flush();
  f.box.applyLook(f.box.words.patient,answer({word:'patient'}),'patient',{life:1});
  assert.equal(f.box.words.patient.ko,'참을성 있는');assert.equal(f.box.words.patient.aiLoading,true);
  hung.resolve(Response.json(answer({word:'patient'})));await newer;assert.equal(f.box.words.patient.aiLoading,undefined);
});
