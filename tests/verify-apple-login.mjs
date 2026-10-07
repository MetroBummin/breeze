import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const source=readFileSync(new URL('../scripts/sync/sync.js',import.meta.url),'utf8');
function device({native=false}={}){
 const {document}=parseHTML('<html><body><div id="settings-modal" class="on"><div id="sm-body"></div><div id="sm-status"></div></div><input id="recovery-fileinput"><input id="reading-backup-input"></body></html>');
 const requests=[],oauth=[],redirects=[],timers=new Map();let sequence=0;
 const context=vm.createContext({document,window:{Capacitor:{isNativePlatform:()=>native}},words:{kept:{ko:'보관한'}},dead:{},
  load:(_key,fallback)=>fallback,esc:String,console,URL,AbortController,
  location:{origin:'https://breeze.io.kr',pathname:'/',assign:url=>redirects.push(url)},
  setTimeout:callback=>{const id=++sequence;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  fetch:(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,resolve,reject});options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});}),
 });
 vm.runInContext(source+'\n globalThis.api={render:renderSyncModal,login:sbAppleLogin,advanceEpoch:()=>syncSessionEpoch++,setClient:client=>{sb=client;SB_URL="https://project.supabase.co";SB_KEY="existing-public-test-key";}};',context);
 const client={auth:{signInWithOAuth:async args=>{oauth.push(args);return {data:{url:'https://project.supabase.co/auth/v1/authorize?provider=apple'},error:null};}}};
 context.api.setClient(client);context.api.render();
 return {api:context.api,client,document,requests,oauth,redirects,timers,words:context.words,
  resolve:enabled=>requests.at(-1).resolve({ok:true,json:async()=>({external:{apple:enabled}})}),
  status:()=>document.getElementById('sm-status').textContent,
  button:()=>document.getElementById('sm-apple-login')};
}
test('configured web Apple starts real SDK consent with the existing redirect/session owner',async()=>{
 const h=device(),before=JSON.stringify(h.words);assert.equal(h.button().disabled,false);
 const work=h.api.login();h.resolve(true);await work;
 assert.equal(h.requests[0].url,'https://project.supabase.co/auth/v1/settings');
 assert.equal(h.requests[0].options.credentials,'omit');
 assert.deepEqual(JSON.parse(JSON.stringify(h.oauth[0])),{provider:'apple',options:{redirectTo:'https://breeze.io.kr/',skipBrowserRedirect:true}});
 assert.deepEqual(h.redirects,['https://project.supabase.co/auth/v1/authorize?provider=apple']);
 assert.equal(JSON.stringify(h.words),before);assert.equal(h.timers.size,0);
});
test('unconfigured provider keeps Settings usable without opening a broken consent page',async()=>{
 const h=device(),work=h.api.login();h.resolve(false);await work;
 assert.match(h.status(),/아직 설정되지/);assert.equal(h.oauth.length,0);assert.equal(h.redirects.length,0);assert.equal(h.button().disabled,false);
});
test('native cannot claim support without its Apple capability and authentication bridge',async()=>{
 const h=device({native:true});assert.equal(h.button().disabled,true);await h.api.login();
 assert.equal(h.requests.length,0);assert.equal(h.oauth.length,0);assert.match(h.document.getElementById('sm-apple-note').textContent,/아직 준비되지/);
});
test('pending clicks coalesce and an aborted provider check releases retry',async()=>{
 const h=device(),work=h.api.login();await h.api.login();assert.equal(h.requests.length,1);assert.equal(h.button().disabled,true);
 [...h.timers.values()][0]();await work;
 assert.equal(h.requests[0].options.signal.aborted,true);assert.match(h.status(),/연결하지 못했/);assert.equal(h.button().disabled,false);
 const retry=h.api.login();h.resolve(true);await retry;assert.equal(h.redirects.length,1);
});
test('changed session ignores an old provider result',async()=>{
 const h=device(),work=h.api.login();h.api.advanceEpoch();h.resolve(true);await work;
 assert.equal(h.oauth.length,0);assert.equal(h.redirects.length,0);
});
test('SDK failure or off-project redirect never navigates away and remains retryable',async()=>{
 for(const response of [{error:Error('unavailable'),data:null},{error:null,data:{url:'https://other.example/auth/v1/authorize'}}]){
  const h=device();h.client.auth.signInWithOAuth=async()=>response;
  const work=h.api.login();h.resolve(true);await work;
  assert.equal(h.redirects.length,0);assert.match(h.status(),/연결하지 못했/);assert.equal(h.button().disabled,false);
 }
});
