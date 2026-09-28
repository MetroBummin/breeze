import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('const wordLookupRecoveries'),source.indexOf('/* 읽기 시작할 때 함수만'));
const payload={op:'look_v2',word:'patient',clicked:'patient',sentence:'patient reader',tokens:[{text:'patient'},{text:'reader'}],clickedIndex:0,cands:['patient'],retry:false};
const good={kind:'word',canonical:'patient',members:[0],ko:'참을성 있는'};
function fixture(responses){
  const requests=[],owner=new AbortController();let alive=true;
  const c={navigator:{onLine:true},sbUser:{id:'user'},deviceId:()=> 'device-1234',crypto,AbortController,
    setTimeout,clearTimeout,AI_TIMEOUT:10,wordLookupAlive:()=>alive,wordLookupSignal:()=>owner.signal,
    dictCall:async(p,signal)=>{requests.push(structuredClone(p));const next=responses.shift();return typeof next==='function'?await next(signal):next;}};
  runInNewContext(helper,c);
  return {c,requests,cancel(){alive=false;owner.abort();}};
}
for(const failure of [null,{error:'lookup_failed',httpStatus:502},{error:'invalid_response',httpStatus:200},{ko:'broken'},
  signal=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve(null)))]){
  const f=fixture([failure,good]);assert.equal((await f.c.recoverableWordLookup(payload,1)).ko,good.ko);
  assert.equal(f.requests.length,2);assert.equal(f.requests[0].lookupId,f.requests[1].lookupId);
}
{
  const f=fixture([null,null,good,good]);
  assert.equal((await f.c.recoverableWordLookup(payload,1)).error,'lookup_failed');
  const id=f.requests[0].lookupId;
  await f.c.recoverableWordLookup({...payload,retry:true,avoid:['old meaning']},1);
  assert.equal(f.requests.length,3,'manual recovery repeated automatic budget');
  assert.equal(f.requests[2].lookupId,id);assert.equal(f.requests[2].retry,false,'recovery changed server fingerprint');
  await f.c.recoverableWordLookup({...payload,retry:true},1);
  assert.notEqual(f.requests[3].lookupId,id,'quality retry reused completed receipt');
}
for(const error of ['quota_exceeded','anon_exhausted','login_required','offline','bad_op','request_conflict']){
  const f=fixture([{error},good]);await f.c.recoverableWordLookup(payload,1);assert.equal(f.requests.length,1,error);
}
{
  const f=fixture([good]);f.c.navigator.onLine=false;
  assert.equal((await f.c.recoverableWordLookup(payload,1)).error,'offline');assert.equal(f.requests.length,0);
}
{
  const f=fixture([signal=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve(null))),good]);
  const pending=f.c.recoverableWordLookup(payload,1);f.cancel();assert.equal(await pending,null);assert.equal(f.requests.length,1);
}
console.log('word lookup recovery: technical-only retry, IDs, manual recovery, cancellation passed');
