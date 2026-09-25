import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchXEmbed,xPostIdentity} from '../server/article/social-embed.mjs';
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
