/* Runs the actual Edge handler after TypeScript transpilation. Supabase and the
   model are injected doubles: these tests do not establish deployed RPC/RLS E2E. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/article-preview/index.ts',import.meta.url),'utf8');
const executable=ts.transpileModule(source.replace(/^import .*;\n/gm,''),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
const meta={summaryKo:'한 가지 사례를 통해 사건의 배경을 소개합니다. 그 의미와 남아 있는 질문을 함께 살펴봅니다.'};
const body={url:'https://example.test/article',title:'Source title',excerpt:'A source excerpt with enough detail to describe an article and explain what the article is about.',device:'test-device'};
function setup(options={}){
  const state={calls:0,quota:0,writes:0,keys:[],rows:new Map(),...options};let handler;
  const db={auth:{getUser:async()=>({data:{user:state.anon?null:{id:'test-user'}}})},
    rpc:async()=>{state.quota++;return state.rpcResult || {data:state.anon?{status:'ok'}:{ok:true},error:null};},
    from:()=>({select:()=>({eq:(_,key)=>({maybeSingle:async()=>{
      state.keys.push(key);return {data:state.hit || state.rows.get(key) || null,error:state.readError || null};
    }})}),insert:async row=>{
      state.writes++;if(state.writeThrows)throw Error('db transport');
      if(!state.writeError)state.rows.set(row.cache_key,row);return {error:state.writeError || null};
    }})};
  const context=vm.createContext({createClient:()=>db,Deno:{env:{get:()=>''},serve:fn=>handler=fn},
    generateArticlePreview:async()=>{state.calls++;if(state.gate)await state.gate;if(state.fail)throw Error('model_failed');return {meta:state.meta || meta,model:'fixture',latencyMs:1};},
    Request,Response,TextEncoder,TextDecoder,URL,Uint8Array,crypto,console:{info(){},error(){}}});
  vm.runInContext(executable,context);
  return {state,send:(input=body,method='POST')=>handler(new Request('https://edge.test/article-preview',{
    method,headers:{'Content-Type':'application/json',Authorization:'Bearer test'},
    ...(['GET','OPTIONS'].includes(method)?{}:{body:JSON.stringify(input)})}))};
}
const sleep=()=>new Promise(r=>setTimeout(r,0));
test('valid miss generates and persists, then hit avoids AI and quota',async()=>{
  const {send,state}=setup();const first=await send();assert.equal(first.status,200);assert.equal((await first.json()).persisted,true);
  const hit=await send();assert.equal((await hit.json()).cached,true);assert.equal(state.calls,1);assert.equal(state.quota,1);
});
test('malformed inputs fail before cache/auth/model',async()=>{
  for(const input of [null,[],{}, {...body,title:4},{...body,excerpt:'short'}, {...body,url:'javascript:bad'}, {...body,url:'https://user:password@example.test'}, {...body,extra:'x'.repeat(17000)}]){
    const {send,state}=setup();assert.equal((await send(input)).status,400);assert.equal(state.calls,0);assert.equal(state.quota,0);
  }
});
test('preflight/method guard and private HTTP cache policy',async()=>{
  const {send}=setup();assert.equal((await send(body,'OPTIONS')).status,200);assert.equal((await send(body,'GET')).status,405);
  assert.equal((await send()).headers.get('Cache-Control'),'no-store');
});
test('authenticated null/malformed quota fails closed',async()=>{
  for(const data of [null,{},[],{ok:'true'}]){
    const {send,state}=setup({rpcResult:{data,error:null}});assert.equal((await send()).status,503);assert.equal(state.calls,0);
  }
});
test('quota denial and backend failure stay distinct',async()=>{
  const denied=setup({rpcResult:{data:{ok:false},error:null}});assert.equal((await denied.send()).status,429);
  const broken=setup({rpcResult:{data:null,error:{message:'unavailable'}}});assert.equal((await broken.send()).status,503);
  assert.equal(denied.state.calls+broken.state.calls,0);
});
test('anonymous device and quota required',async()=>{
  const noDevice=setup({anon:true});assert.equal((await noDevice.send({...body,device:''})).status,400);
  const invalid=setup({anon:true,rpcResult:{data:null,error:null}});assert.equal((await invalid.send()).status,503);
  const ok=setup({anon:true});assert.equal((await ok.send()).status,200);
});
test('bad or unreadable shared cache cannot launch a paid retry loop',async()=>{
  for(const options of [{readError:{message:'down'}},{hit:{hook_title:'',translated_title:'',teaser:''}}]){
    const {send,state}=setup(options);assert.equal((await send()).status,503);assert.equal(state.calls,0);
  }
});
test('cache write/transport failure still returns useful generated result',async()=>{
  for(const options of [{writeError:{code:'db_down'}},{writeThrows:true}]){
    const {send,state}=setup(options);const result=await send();assert.equal(result.status,200);
    const value=await result.json();assert.equal(value.summaryKo,meta.summaryKo);assert.equal(value.persisted,false);assert.equal(state.calls,1);
  }
});
test('duplicate insert is tolerated',async()=>{
  const {send}=setup({writeError:{code:'23505'}});assert.equal((await (await send()).json()).persisted,true);
});
test('concurrent same-evidence requests share model, still check each quota',async()=>{
  let release;const gate=new Promise(r=>release=r),{send,state}=setup({gate});
  const pending=Array.from({length:8},()=>send());
  for(let i=0;i<50 && state.quota<8;i++)await sleep();
  assert.equal(state.quota,8);assert.equal(state.calls,1);release();
  assert((await Promise.all(pending)).every(r=>r.status===200));assert.equal(state.writes,1);
});
test('generation failure is not cached and releases single-flight',async()=>{
  const {send,state}=setup({fail:true});assert.equal((await send()).status,503);assert.equal(state.writes,0);
  state.fail=false;assert.equal((await send()).status,200);assert.equal(state.calls,2);
});
test('unusable model output cannot poison shared cache',async()=>{
  const {send,state}=setup({meta:{summaryKo:'bad'}});assert.equal((await send()).status,503);assert.equal(state.writes,0);
});
test('versioned evidence key normalizes tracking but not changed evidence',async()=>{
  const {send,state}=setup();await send();await send({...body,url:body.url+'?utm_source=home#fragment'});
  assert.equal(state.calls,1);await send({...body,title:'Updated title'});assert.equal(state.calls,2);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('article-preview-v4\n'+body.url+'\n'+body.title+'\n'+body.excerpt));
  assert.equal(state.keys[0],Buffer.from(digest).toString('hex'));
});
