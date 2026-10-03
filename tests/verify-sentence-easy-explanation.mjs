import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sentenceEasyInput,sentenceEasyPrompt,runSentenceEasyExplanation} from '../server/dict/sentence-easy-explanation.ts';
const input={sentence:'Although it was late, she kept reading.',translation:'늦은 시간이었지만 그녀는 계속 읽었다.',before:[],after:[]};
const explanation='시간이 늦었다는 상황과 계속 읽었다는 행동을 대비하는 문장이에요. Although 뒤의 내용은 배경이고, she kept reading이 중심 행동이에요.';
test('sentence help validates before quota, reuses one charge and has no meaning suggestion',async()=>{
  for(const body of [null,{}, {...input,sentence:''},{...input,sentence:'x'.repeat(2401)},{...input,translation:'x'.repeat(501)},{...input,before:['a','b','c']}]){
    assert.equal(sentenceEasyInput(body),null);
    assert.equal((await runSentenceEasyExplanation(body,{charge:()=>assert.fail('charged'),generate:()=>assert.fail('provider')})).status,400);
  }
  const order=[];
  const result=await runSentenceEasyExplanation(input,{charge:async()=>{order.push('charge');return {ok:true,left:5};},generate:async value=>{order.push('provider');assert.deepEqual(value,input);return {explanation,suggestedMeaning:'ignored'};}});
  assert.deepEqual(order,['charge','provider']);assert.deepEqual(result,{status:200,body:{explanation,left:5}});
  assert.match(sentenceEasyPrompt(input),/전체 문법 강의/);assert.ok(sentenceEasyPrompt(input).includes(JSON.stringify(input)));
});
test('sentence quota, cancellation and provider errors share the existing fail-closed path',async()=>{
  const denied=await runSentenceEasyExplanation(input,{charge:async()=>({ok:false,error:'quota_exceeded'}),generate:()=>assert.fail('provider')});assert.equal(denied.status,429);
  const controller=new AbortController();controller.abort();
  assert.equal((await runSentenceEasyExplanation(input,{signal:controller.signal,charge:()=>assert.fail('charged'),generate:()=>assert.fail('provider')})).status,499);
  const cancel=new AbortController();
  assert.equal((await runSentenceEasyExplanation(input,{signal:cancel.signal,charge:async()=>{cancel.abort();return {ok:true,left:4};},generate:()=>assert.fail('provider after cancellation')})).status,499);
  for(const value of [null,{explanation:'tiny'},{explanation:'x'.repeat(601)}])assert.equal((await runSentenceEasyExplanation(input,{charge:async()=>({ok:true,left:3}),generate:async()=>value})).status,502);
});

import * as wordHelp from '../server/dict/easy-explanation.ts';
import * as sentenceHelp from '../server/dict/sentence-easy-explanation.ts';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transpileModule} from 'typescript';
test('real Edge route authenticates owner, shares anonymous/account quota and advertises capability without provider work',async()=>{
  let handler,quotaCalls=[],providerCalls=0,denied=false,quotaError=false;
  const sr={auth:{getUser:async token=>({data:{user:token==='valid'?{id:'verified-user'}:null}})},rpc:async(name,p)=>{
    quotaCalls.push({name,p});
    if(quotaError)return {data:null,error:{message:'fixture error'}};
    if(name==='take_ai_quota')return {data:{ok:!denied,calls:1,limit:20},error:null};
    assert.equal(name,'take_anon_quota');return {data:{status:denied?'spent':'ok',calls:1},error:null};
  }};
  const source=readFileSync(new URL('../server/dict/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
  runInNewContext(transpileModule(source,{compilerOptions:{target:99,module:99}}).outputText,{
    ...wordHelp,...sentenceHelp,crypto,TextEncoder,AbortSignal,Response,console,
    createClient:()=>sr,newAiTrace:()=>({}),meteredFetch:async()=>{providerCalls++;return Response.json({choices:[{message:{content:JSON.stringify({explanation,suggestedMeaning:'ignored'})}}]});},
    Deno:{env:{get:key=>key==='OPENROUTER_API_KEY'?'fixture':key==='SUPABASE_URL'?'fixture':null},serve:fn=>handler=fn}
  });
  const invoke=async(body,token)=>handler(new Request('http://fixture',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
  assert.equal((await (await invoke({op:'warm'})).json()).sentenceEasyExplanation,true);assert.equal(providerCalls,0);assert.equal(quotaCalls.length,0);
  const res=await invoke({op:'sentence_easy_explanation',...input,userId:'forged'},'valid');assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).suggestedMeaning,undefined);
  assert.equal(quotaCalls[0].p.p_user,'verified-user');assert.equal(quotaCalls[0].p.p_cost,1);assert.equal(providerCalls,1);
  const anon=await invoke({op:'sentence_easy_explanation',...input,device:'device-fixture',userId:'forged'},'invalid');assert.equal(anon.status,200);assert.equal(quotaCalls.at(-1).name,'take_anon_quota');assert.equal(quotaCalls.at(-1).p.p_device,'device-fixture');
  denied=true;const before=providerCalls;assert.equal((await invoke({op:'sentence_easy_explanation',...input},'valid')).status,429);assert.equal(providerCalls,before);
  quotaError=true;assert.equal((await invoke({op:'sentence_easy_explanation',...input},'valid')).status,503);assert.equal(providerCalls,before);
  assert.equal((await invoke({op:'sentence_easy_explanation',...input,sentence:''},'valid')).status,400);
});
