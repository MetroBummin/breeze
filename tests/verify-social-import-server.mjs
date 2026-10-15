import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {fetchXEmbed,xPostIdentity} from '../server/article/social-embed.mjs';
import {publicUrl} from '../server/article/public-fetch.mjs';
const url='https://x.com/writer/status/123456789';
const response=()=>({status:200,bytes:new TextEncoder().encode(JSON.stringify({provider_name:'Twitter',url,html:'<blockquote class="twitter-tweet"><p>Words</p></blockquote>',author_name:'Writer'}))});
for(const u of ['https://x.com/writer','https://x.com.evil.test/a/status/1','https://127.0.0.1/a/status/1','https://x.com/i/article/1','https://u:p@x.com/a/status/1','https://x.com:8080/a/status/1'])test('reject before transport '+u,async()=>{
 let calls=0;const r=await fetchXEmbed(u,new AbortController().signal,async()=>{calls++;return response();});assert.equal(r.status,400);assert.equal(calls,0);
});
test('public endpoint and bounded transport only, no account credentials',async()=>{
 let seen;const signal=new AbortController().signal;
 const result=await fetchXEmbed(url,signal,async(u,options)=>{seen={u,options};return response();});
 assert.equal(result.status,200);const target=new URL(seen.u);assert.equal(target.origin,'https://publish.x.com');assert.equal(target.pathname,'/oembed');assert.equal(target.searchParams.get('omit_script'),'1');assert.equal(target.searchParams.get('hide_thread'),'1');assert.equal(seen.options.limit,150000);assert.equal(seen.options.signal,signal);assert(!seen.options.headers.Authorization);
});
for(const status of [401,403,404,410,429,500])test('upstream failure '+status,async()=>{const r=await fetchXEmbed(url,new AbortController().signal,async()=>({status}));assert.equal(r.status,status===500?502:status);});
for(const patch of [{provider_name:'Other'},{url:'https://x.com/a/status/4'},{html:null},{html:'x'.repeat(100001)}])test('malformed output '+Object.keys(patch)[0],async()=>{const r=await fetchXEmbed(url,new AbortController().signal,async()=>({status:200,bytes:new TextEncoder().encode(JSON.stringify({provider_name:'Twitter',url,html:'body',...patch}))}));assert.equal(r.status,502);});
test('malformed JSON does not escape handler',async()=>{const r=await fetchXEmbed(url,new AbortController().signal,async()=>({status:200,bytes:new TextEncoder().encode('{')}));assert.equal(r.status,502);});
test('X aliases identify same post',()=>{assert.equal(xPostIdentity('https://mobile.twitter.com/x/status/123456789/photo/1?s=46'),xPostIdentity(url));});

// Exercise the actual relay handler offline. Public HTTP transport is the only
// injected server dependency; no X, Supabase, credentials or paid calls are used.
const handlerSource=ts.transpileModule(readFileSync(new URL('../server/article/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
const loaderSource=readFileSync(new URL('../scripts/importers/social.js',import.meta.url),'utf8');
function setupRelay(upstream){
 let handler;const calls=[];
 const context=vm.createContext({
  Deno:{serve:fn=>handler=fn},publicUrl,fetchXEmbed,
  fetchPublic:async(target,options)=>{calls.push({target,options});return typeof upstream==='function'?upstream(target):upstream;},
  Request,Response,TextEncoder,TextDecoder,URL,Uint8Array,AbortController,setTimeout,clearTimeout,
  console:{error(){}}
 });
 vm.runInContext(handlerSource,context);
 const send=(source=url,mode='')=>handler(new Request('https://relay.example/article?url='+encodeURIComponent(source)+(mode?'&as='+mode:'')));
 return {calls,send,handler};
}
for(const status of [401,403,429])test('HTML relay preserves upstream '+status+' and stops social fallback',async()=>{
 const {calls,send,handler}=setupRelay({status});
 const response=await send();assert.equal(response.status,status);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 const failure=await response.json();assert.equal(failure.error,'upstream');assert.equal(failure.html,undefined);
 calls.length=0;
 const context=vm.createContext({
  URL,Response,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,
  SB_URL:'https://relay.example',SB_KEY:'public-test-key',
  articleProxyUrl:(source,mode='')=>'https://relay.example/article?url='+encodeURIComponent(source)+(mode?'&as='+mode:''),
  fetch:target=>handler(new Request(target))
 });
 vm.runInContext(loaderSource,context);
 await assert.rejects(vm.runInContext('loadSocialArticle('+JSON.stringify(url)+')',context),error=>error.code===(status===429?'social_rate_limited':'social_restricted'));
 assert.equal(calls.length,1);assert.equal(calls[0].target,url);
});
for(const status of [404,410,500])test('HTML relay keeps ordinary upstream '+status+' as unavailable',async()=>{
 const {send}=setupRelay({status});assert.equal((await send()).status,502);
});
test('HTML relay retains complete UTF-8 body and resolved URL after an upstream failure',async()=>{
 const html='<html><body>First line.\n한글 &amp; emoji 😀.\nThe final line.</body></html>';
 const resolved='https://x.com/writer/status/123456789';let failing=true;
 const {send,calls}=setupRelay(()=>failing?{status:429}:{status:200,headers:{'content-type':'text/html; charset=utf-8'},bytes:new TextEncoder().encode(html),url:resolved});
 assert.equal((await send()).status,429);failing=false;
 const response=await send('https://t.co/example');assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{url:resolved,html});assert.equal(calls.length,2);
});
test('image relay retains its existing upstream error mapping',async()=>{
 const {send}=setupRelay({status:403});assert.equal((await send(url,'image')).status,502);
});
