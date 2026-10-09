import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {lookCases} from '../benchmarks/lookup-quality/cases.mjs';
import {holdout} from '../benchmarks/lookup-quality/holdout.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const receipts=new Map();let charged=0,providerCalls=0,answer,transientFailures=0;
const box={console,Response,AbortSignal,crypto,TextEncoder,Deno:{env:{get:()=>''},serve(){}},
  newAiTrace:()=>({}),createClient:()=>({rpc:async(name,p)=>{
    const old=receipts.get(p.p_request);
    if(old)return {data:{status:'replay',answer:old,left:3000-charged},error:null};
    if(p.p_answer){receipts.set(p.p_request,p.p_answer);charged++;}
    return {data:p.p_answer?{status:'replay',answer:p.p_answer,left:3000-charged}:{status:'ok'},error:null};
  }})};
vm.createContext(box);
const run=code=>vm.runInContext(ts.transpileModule(code.replace(/^import .*;$/gm,'').replace(/^export /gm,''),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,box);
for(const file of ['modules/lexical/core.js','server/dict/logical-lookup.ts','server/dict/lookup.ts','server/dict/index.ts'])run(read(file));
box.fakeProvider=async()=>{providerCalls++;if(transientFailures-->0)throw Error('fixture_timeout');return {text:JSON.stringify(answer)};};
run("providerKeys=()=>({oKey:'fixture',gKey:'fixture'});callOpenRouter=fakeProvider;callGemini=fakeProvider;");

const cases=[
  ['slept','sleep','slept'],['stole','steal','stole'],['swam','swim','swam'],['hung','hang','hung'],
  ['denied','deny','deni'],['studied','study','studi'],['tried','try','tri'],['cried','cry','cri'],
  ['died','die','died'],['lied','lie','lied'],['tied','tie','tied'],
  ['drank','drink','drank'],['sung','sing','sung'],['won','win','won'],['forgotten','forget','forgotten'],
  ['ate','eat','eat'],['cities','city','city'],['making','make','make'],['running','run','run'],['patient','patient','patient'],
  ['Selfies','selfie','selfy'],['brownies','brownie','browny'],['zombies','zombie','zomby'],
  ['neckties','necktie','neckty'],['smoothies','smoothie','smoothy'],['indices','index','indice'],['glorped','glorp','glorp']
];
for(const [surface,canonical,oldKey] of cases){
  assert.equal(box.BreezeLexical.lemma(surface),oldKey,`${surface}: saved vocabulary identity changed`);
  assert.equal(box.BreezeLexical.lemmaCands(surface)[0],oldKey,`${surface}: preferred key changed`);
  // An existing client can send old/incorrect candidates. The model's canonical
  // is accepted without changing saved vocabulary identity or input fingerprints.
  const input=box.lookupInput({word:oldKey,clicked:surface,sentence:`The word is ${surface}.`,clickedIndex:3,cands:[oldKey,surface]});
  assert.equal(box.validateLook({kind:'word',canonical,members:[3],ko:'테스트 뜻'},input).canonical,canonical);
}
for(const [surface,expected] of [['slept',['slept']],['studied',['studi','studie','studied']],['TRIED',['tried']],["field's",["field'","field's"]]]){
  assert.deepEqual(Array.from(box.BreezeLexical.lemmaCands(surface)),expected,`${surface}: existing candidate set changed`);
}
for(const [surface,canonical] of [['SLEPT','sleep'],['TRIED','try'],['US','US'],['NEWS','NEWS'],['IDs','ID'],['AIs','AI'],['CDs','CD'],['APIs','API'],['Apple’s','Apple'],['children’s','child'],["John's",'John'],['constructor','constructor'],['constructor’s','constructor']]){
  const input=box.lookupInput({word:surface,clicked:surface,sentence:`The word is ${surface}.`,clickedIndex:3,cands:[]});
  assert.equal(box.validateLook({kind:'word',canonical,members:[3],ko:'테스트 뜻'},input).canonical,canonical);
}
const goldenWords=[...lookCases,...holdout].filter(item=>item.expected.kind==='word');
for(const fixture of goldenWords){
  const input=box.lookupInput({...fixture,word:fixture.clicked,cands:[]});
  assert.equal(box.validateLook({...fixture.expected,ko:'테스트 뜻'},input).canonical,fixture.expected.canonical,fixture.id);
}
// Do not substitute a spelling rule for the model's semantic judgment. Its
// response must still point at the selected occurrence, not another token.
for(const [surface,canonical] of [['bank','flood'],['slept','sweep'],['studied','student'],['tried','tire']]){
  const input=box.lookupInput({word:canonical,clicked:surface,sentence:`The ${surface} is near ${canonical}.`,clickedIndex:1,cands:[canonical]});
  assert.equal(box.validateLook({kind:'word',canonical,members:[1],ko:'테스트 뜻'},input).canonical,canonical);
  assert.throws(()=>box.validateLook({kind:'word',canonical,members:[4],ko:'다른 위치'},input),/invalid_members/);
}
const selected=box.lookupInput({word:'slept',clicked:'slept',sentence:'They slept outside.',clickedIndex:1});
for(const patch of [null,[],{members:[2]},{members:[1,2]},{members:[-1]},{members:[1.5]},{members:[99]},
  {canonical:'sleep outside'},{canonical:''},{canonical:'a'.repeat(121)},{canonical:42},{canonical:'<script>alert(1)</script>'},
  {ko:''},{ko:42},{ko:'뜻'.repeat(61)},{ko:'뜻\n추가'},{kind:'other'}]){
  if(patch===null||Array.isArray(patch)){assert.throws(()=>box.validateLook(patch,selected));continue;}
  assert.throws(()=>box.validateLook({kind:'word',canonical:'sleep',members:[1],ko:'잠을 자다',...patch},selected));
}
const source=read('scripts/dictionary/dictionary.js');
const recovery=source.slice(source.indexOf('const wordLookupRecoveries'),source.indexOf('/* 읽기 시작할 때 함수만'));
const requests=[],owner=new AbortController();
const client={navigator:{onLine:true},sbUser:{id:'fixture-user'},deviceId:()=>'',crypto,AbortController,setTimeout,clearTimeout,
  AI_TIMEOUT:9000,wordLookupAlive:()=>true,wordLookupSignal:()=>owner.signal,
  dictCall:async payload=>{requests.push(structuredClone(payload));const response=await box.opLook(payload,'fixture-user');return {...await response.json(),httpStatus:response.status};}};
vm.runInNewContext(recovery,client);
const payload={op:'look_v2',word:'slept',clicked:'slept',sentence:'They slept outside.',tokens:[{text:'They'},{text:'slept'},{text:'outside'}],clickedIndex:1,cands:['slept'],retry:false};
answer={kind:'word',canonical:'sleep',members:[1],ko:'잠을 자다'};
// Exhaust both HTTP attempts once, then recover the same logical request.
// This proves a technical failure is not permanently cached and that old client
// candidates no longer force the otherwise-correct retry to fail again.
transientFailures=6;
assert.equal((await client.recoverableWordLookup(payload,1)).error,'lookup_failed');
assert.equal(charged,0);assert.equal(requests.length,2);
const id=requests[0].lookupId;
assert.equal((await client.recoverableWordLookup({...payload,retry:true},1)).ko,'잠을 자다');
assert.equal(requests.length,3);assert.equal(requests[2].lookupId,id);assert.equal(charged,1);
const count=providerCalls;
assert.equal((await (await box.opLook(requests[2],'fixture-user')).json()).ko,'잠을 자다');
assert.equal(providerCalls,count);assert.equal(charged,1,'same ID receipt was charged twice');
// A fresh quality retry is distinct after success, and another word also works.
assert.equal((await client.recoverableWordLookup({...payload,retry:true},1)).ko,'잠을 자다');
assert.notEqual(requests[3].lookupId,id);assert.equal(charged,2);
answer={kind:'word',canonical:'patient',members:[1],ko:'참을성 있는'};
assert.equal((await client.recoverableWordLookup({...payload,word:'patient',clicked:'patient',sentence:'A patient reader.',tokens:[{text:'A'},{text:'patient'},{text:'reader'}],cands:['patient']},1)).ko,'참을성 있는');
assert.equal(charged,3);

// Run the existing app's fetch/cache/apply path: a server-only change must update
// the displayed canonical while keeping the saved object under its original ID.
const slice=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const cache=new Map(),cacheWrites=[],saved=[],appRequests=[];
const card={word:'selfy',clicked:'Selfies',forms:['selfy','selfies'],example:'Selfies are popular.',ko:'',book:'fixture'};
const app={navigator:{onLine:true},sb:{},sbUser:{id:'fixture-app'},deviceId:()=>'',crypto,AbortController,setTimeout,clearTimeout,
  AI_TIMEOUT:9000,AI_MIN_WAIT:0,wordLookupLife:1,wordLookupAlive:()=>true,wordLookupSignal:()=>owner.signal,
  words:{selfy:card},activeSelectedWordNode:null,curBook:{},pendingWord:null,
  lemmaCands:box.BreezeLexical.lemmaCands,isAcro:box.BreezeLexical.isAcro,meaningKey:s=>s.trim(),
  renderIfAlive(){},saveWords:k=>saved.push(k),queueSync(){},rememberAiLeft(){},rememberSenseContext(){},
  lookupRequestFor:()=>({sentence:card.example,clicked:'Selfies',clickedIndex:0,before:'',after:''}),
  lookupSentenceTokens:s=>vm.runInContext('tokenize',box)(s).map(text=>({text})),lookupClickedTokenIndex:()=>-1,
  homewardWordFor:()=>null,expressionFromMini:()=>null,
  dictGet:async key=>cache.get(key),dictPut:async(key,value)=>{cacheWrites.push(key);cache.set(key,value);},
  dictCall:async payload=>{appRequests.push(structuredClone(payload));const response=await box.opLook(payload,'fixture-app');return {...await response.json(),httpStatus:response.status};}};
vm.runInNewContext([
  slice('function applyWordCanonical(', 'function contextCardKey('),
  slice('function sentenceHash(', '/* ---- 로그인 전 맛보기'),recovery,
  slice('async function loadCachedLook(', '/* 낱말 하나'),
  slice('const wordLookRequests','\nasync function askAI()')
].join('\n'),app);
const beforeCharge=charged;
// A structurally invalid answer must not cache, consume quota or keep loading.
answer={kind:'word',canonical:'selfie',members:[99],ko:'셀카'};
assert.equal(await app.fetchLook('selfy',{life:1}),false);
assert.equal(appRequests.length,2);assert.equal(card.aiOff,'error');assert.equal(card.aiLoading,undefined);
assert.equal(charged,beforeCharge);assert.equal(cache.size,0);
const failedId=appRequests[0].lookupId;
answer={kind:'word',canonical:'selfie',members:[0],ko:'셀카'};
const beforeManualProvider=providerCalls;
assert.equal(await app.fetchLook('selfy',{life:1,retry:true}),true);
assert.equal(providerCalls,beforeManualProvider+1,'valid canonical started an unnecessary fallback');
assert.equal(appRequests.length,3);assert.equal(appRequests[2].lookupId,failedId);
assert.equal(card.word,'selfie');assert.equal(card.aiLemma,'selfie');assert.equal(card.ko,'셀카');
assert.equal(card.clicked,'Selfies');assert.equal(card.aiOff,undefined);assert.equal(card.aiLoading,undefined);
assert.equal(app.words.selfy,card);assert.equal(app.words.selfie,undefined);
assert.equal(charged,beforeCharge+1);assert.equal(cacheWrites.length,1);
const afterProvider=providerCalls;
assert.equal((await (await box.opLook(appRequests[2],'fixture-app')).json()).ko,'셀카');
assert.equal(providerCalls,afterProvider);assert.equal(charged,beforeCharge+1);
assert.equal(await app.loadCachedLook('selfy',0,1,null),true);
assert.equal(providerCalls,afterProvider);assert.equal(charged,beforeCharge+1);
assert.equal(card.ai.cached,true);assert.equal(card.word,'selfie');assert.equal(card.clicked,'Selfies');
assert.deepEqual(Object.keys(app.words),['selfy']);assert.ok(saved.every(key=>key==='selfy'));
console.log(`word canonical validation: ${cases.length} AI canonical/legacy identity cases, 13 casing/possessives, ${goldenWords.length} word goldens, schema/source guards, same-ID recovery and receipt/quota passed`);
