import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {clientLookupFailureResponse} from '../server/dict/client-failure.ts';

const root=new URL('../',import.meta.url);
const dictionary=readFileSync(new URL('scripts/dictionary/dictionary.js',root),'utf8');
const server=readFileSync(new URL('server/dict/index.ts',root),'utf8');
const reporter=dictionary.slice(dictionary.indexOf('const LOOKUP_FAILURE_REASON'),dictionary.indexOf('\nasync function dictCall('));

test('client failure reports send only an allow-listed reason on the anonymous channel',()=>{
  const calls=[];
  const box={sb:{},navigator:{onLine:true},SB_URL:'https://fixture.invalid/',SB_KEY:'anon-key',dictAuthCredential:{userId:'user',accessToken:'synthetic-user-token'},
    fetch:async(url,opt)=>{calls.push({url,headers:{...opt.headers},body:opt.body});return {ok:true};}};
  vm.createContext(box);
  vm.runInContext(reporter+'\nreportLookupFailure("fetch_error");reportLookupFailure("patient");reportLookupFailure("Bearer synthetic-user-token");',box);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://fixture.invalid/functions/v1/dict');
  assert.equal(calls[0].headers.Authorization,'Bearer anon-key');
  assert.deepEqual(JSON.parse(calls[0].body),{op:'lookup_failure',reason:'fetch_error'});
  assert.doesNotMatch(reporter,/dictAuthCredential|access_token|payload\.(word|sentence|book)|sbUser/);
  assert.doesNotMatch(dictionary,/op:\s*['"]log['"]/);
});

test('the dict function records an allow-listed client failure before it reads the user',()=>{
  const logs=[];const error=console.error;
  console.error=(...args)=>logs.push(args);
  try{
    assert.deepEqual(clientLookupFailureResponse({reason:'timeout',word:'patient',access_token:'synthetic-user-token'}),{status:200,body:{ok:true}});
    assert.deepEqual(logs,[['client_lookup_failure',JSON.stringify({reason:'timeout'})]]);
    logs.length=0;
    for(const reason of ['clicked_index_missing','session_timeout','fetch_error','scope_mismatch','server_status_401','server_status_502']){
      assert.equal(clientLookupFailureResponse({reason}).status,200);
    }
    assert.equal(clientLookupFailureResponse({reason:'smoke and mirrors'}).status,400);
    assert.equal(clientLookupFailureResponse({reason:'server_status_no'}).status,400);
    assert.equal(logs.length,6);
    assert.ok(logs.every(entry=>entry[0]==='client_lookup_failure'&&!String(entry[1]).includes('patient')&&!String(entry[1]).includes('synthetic')));
  }finally{console.error=error;}
  const failureAt=server.indexOf('op==="lookup_failure"');
  const userAt=server.indexOf('SR.auth.getUser');
  assert.ok(failureAt>0&&failureAt<userAt);
  assert.doesNotMatch(server.slice(failureAt,server.indexOf('const seedToken')),/dict_events|sentence|access_token|\.from\(/);
});
