import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const source=readFileSync(new URL('../scripts/sync/sync.js',import.meta.url),'utf8');
function device({native=false,bridge=null,android=false,plugins=true}={}){
 const {document}=parseHTML('<html><body><div id="settings-modal" class="on"><div id="sm-body"></div><div id="sm-status"></div></div><input id="recovery-fileinput"><input id="reading-backup-input"></body></html>');
 const requests=[],oauth=[],redirects=[],timers=new Map(),opened=[];let sequence=0;
 const events={appUrlOpen:new Set(),browserFinished:new Set()};
 const androidPlugins={
  App:{addListener(event,callback){assert.equal(event,'appUrlOpen');events.appUrlOpen.add(callback);return Promise.resolve({remove(){events.appUrlOpen.delete(callback);}});}},
  Browser:{
   open(options){opened.push(options&&options.url);return Promise.resolve();},
   close(){opened.push('close');return Promise.resolve();},
   addListener(event,callback){assert.equal(event,'browserFinished');events.browserFinished.add(callback);return Promise.resolve({remove(){events.browserFinished.delete(callback);}});},
  },
 };
 const Capacitor=android?{isNativePlatform:()=>true,getPlatform:()=>'android',isPluginAvailable:name=>plugins&&(name==='App'||name==='Browser'),Plugins:plugins?androidPlugins:{},registerPlugin:name=>androidPlugins[name]}
  :{isNativePlatform:()=>native};
 const context=vm.createContext({document,window:{Capacitor,webkit:bridge?{messageHandlers:{breezeAuth:bridge}}:undefined},words:{kept:{ko:'보관한'}},dead:{},
  load:(_key,fallback)=>fallback,esc:String,console,URL,URLSearchParams,AbortController,crypto:webcrypto,VaultCrypto:{uuid:()=>webcrypto.randomUUID()},
  location:{origin:android||native?'null':'https://breeze.io.kr',href:android?'https://localhost/index.html':native?'breeze://localhost/index.html':'https://breeze.io.kr/',pathname:'/',assign:url=>redirects.push(url),replace:url=>redirects.push(url)},
  setTimeout:callback=>{const id=++sequence;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  fetch:(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,resolve,reject});options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});}),
 });
 vm.runInContext(source+'\n globalThis.api={render:renderSyncModal,login:sbAppleLogin,google:sbGoogleLogin,cancel:cancelSocialLogin,operation:()=>socialLoginOperation,options:nativeAppleAuthOptions,advanceEpoch:()=>syncSessionEpoch++,setClient:client=>{sb=client;SB_URL="https://project.supabase.co";SB_KEY="existing-public-test-key";}};',context);
 const client={auth:{signInWithIdToken:async()=>({data:{user:{id:'same-existing-user'}},error:null}),signInWithOAuth:async args=>{oauth.push(args);return {data:{url:'https://project.supabase.co/auth/v1/authorize?provider=apple'},error:null};}}};
 context.api.setClient(client);context.api.render();
 return {api:context.api,client,document,requests,oauth,redirects,timers,words:context.words,opened,events,
  resolve:enabled=>requests.at(-1).resolve({ok:true,json:async()=>({external:{apple:enabled,google:enabled}})}),
  deliver:url=>{for(const callback of events.appUrlOpen)callback({url});},
  finish:()=>{for(const callback of events.browserFinished)callback();},
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
test('native cannot claim social support without its system authentication bridge',async()=>{
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

const turn=()=>new Promise(resolve=>setImmediate(resolve));
for(const provider of ['apple','google']){
 const login=h=>provider==='apple'?h.api.login():h.api.google();
 test(provider+': failed settings and stalled JSON release retry without requesting consent',async()=>{
  for(const stalled of [false,true]){
   const h=device(),work=login(h);let finish;
   if(stalled){h.requests[0].resolve({ok:true,json:()=>new Promise(resolve=>{finish=resolve;})});await turn();[...h.timers.values()][0]();}
   else h.requests[0].resolve({ok:false});
   await work;assert.equal(h.oauth.length,0);assert.equal(h.button().disabled,false);
   if(finish){finish({external:{[provider]:true}});await turn();assert.equal(h.oauth.length,0);}
   assert.equal(h.redirects.length,0);assert.equal(h.timers.size,0);
  }
 });
 test(provider+': credential-bearing, fragmented and ambiguous authorize URLs never navigate',async()=>{
  for(const url of [
   'https://user:password@project.supabase.co/auth/v1/authorize?provider='+provider,
   'https://project.supabase.co/auth/v1/authorize?provider='+provider+'#unexpected',
   'https://project.supabase.co/auth/v1/authorize?provider='+provider+'&provider=other',
  ]){
   const h=device();h.client.auth.signInWithOAuth=async()=>({data:{url},error:null});
   const work=login(h);h.resolve(true);await work;assert.equal(h.redirects.length,0);assert.equal(h.button().disabled,false);
  }
 });
 test(provider+': the whole-operation deadline settles a never-returning SDK promise and ignores its late URL',async()=>{
  const h=device();let finish;
  h.client.auth.signInWithOAuth=()=>new Promise(resolve=>{finish=resolve;});
  const work=login(h);h.resolve(true);await turn();assert.equal(typeof finish,'function');
  [...h.timers.values()][0]();await work;
  assert.equal(h.button().disabled,false);assert.equal(h.redirects.length,0);
  assert.match(h.status(),/연결하지 못했/);
  finish({data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null});await turn();
  assert.equal(h.redirects.length,0);assert.equal(h.timers.size,0);
 });
 test(provider+': close/cancel releases a new request and old completion cannot unlock or navigate it',async()=>{
  const h=device();let finishOld,finishNew;
  h.client.auth.signInWithOAuth=()=>new Promise(resolve=>{finishOld=resolve;});
  const first=login(h);h.resolve(true);await turn();h.api.cancel();await first;
  h.client.auth.signInWithOAuth=()=>new Promise(resolve=>{finishNew=resolve;});
  const second=login(h);h.resolve(true);await turn();
  finishOld({data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null});await turn();
  assert.equal(h.redirects.length,0);assert.equal(h.button().disabled,true);
  finishNew({data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null});await second;
  assert.deepEqual(h.redirects,['https://project.supabase.co/auth/v1/authorize?provider='+provider]);assert.equal(h.button().disabled,false);
 });
 test(provider+': timeout retry remains owned by the new request',async()=>{
  const h=device();h.client.auth.signInWithOAuth=()=>new Promise(()=>{});
  const first=login(h);h.resolve(true);await turn();[...h.timers.values()][0]();await first;
  h.client.auth.signInWithOAuth=async()=>({data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null});
  const retry=login(h);h.resolve(true);await retry;assert.equal(h.redirects.length,1);
 });
 test(provider+': stale session after SDK settlement cannot navigate',async()=>{
  const h=device();let finish;h.client.auth.signInWithOAuth=()=>new Promise(resolve=>{finish=resolve;});
  const work=login(h);h.resolve(true);await turn();h.api.advanceEpoch();
  finish({data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null});await work;assert.equal(h.redirects.length,0);
 });
}
test('Google button precedes Apple and invokes the configured provider through the existing client',async()=>{
 const h=device();assert.match(h.document.getElementById('sm-body').innerHTML,/sm-google-login[\s\S]*sm-apple-login/);
 assert.match(h.document.getElementById('sm-apple-login').innerHTML,/Apple로 로그인/);
 assert.doesNotMatch(h.document.getElementById('sm-apple-login').innerHTML,/signin-ko/);
 h.client.auth.signInWithOAuth=async args=>{h.oauth.push(args);return {data:{url:'https://project.supabase.co/auth/v1/authorize?provider=google'},error:null};};
 const work=h.api.google();h.resolve(true);await work;assert.equal(h.oauth[0].provider,'google');assert.equal(h.redirects.length,1);
});

for(const provider of ['google']){
 const login=h=>provider==='apple'?h.api.login():h.api.google();
 test(provider+': consent deadline and cancellation reject a late valid callback',async()=>{
  for(const timedOut of [false,true]){
   const messages=[];let reply;
   const bridge={postMessage:message=>{messages.push(message);return message.action==='start'?new Promise(resolve=>{reply=resolve;}):Promise.resolve(true);}};
   const h=device({native:true,bridge});h.client.auth.signInWithOAuth=async()=>({data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null});
   const work=login(h);h.resolve(true);await turn();const request=messages.find(m=>m.action==='start').request;
   if(timedOut)[...h.timers.values()][0]();else h.api.cancel();
   await work;reply('kr.io.breeze.app://auth/callback?request='+request+'#access_token=local-test-access&refresh_token=local-test-refresh&token_type=bearer');await turn();
   assert.equal(h.redirects.length,0);assert.equal(h.button().disabled,false);assert.equal(h.timers.size,0);
   assert.ok(messages.some(m=>m.action==='cancel'&&m.request===request));
  }
 });
 test(provider+': ambiguous or credential-bearing native callbacks cannot reload the app',async()=>{
  for(const address of [request=>'kr.io.breeze.app://user:password@auth/callback?request='+request,
   request=>'kr.io.breeze.app://auth:123/callback?request='+request,
   request=>'kr.io.breeze.app://auth/callback?request='+request+'&request=other']){
   const messages=[];let reply;
   const bridge={postMessage:message=>{messages.push(message);return message.action==='start'?new Promise(resolve=>{reply=resolve;}):Promise.resolve(true);}};
   const h=device({native:true,bridge});h.client.auth.signInWithOAuth=async()=>({data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null});
   const work=login(h);h.resolve(true);await turn();const request=messages.find(m=>m.action==='start').request;
   reply(address(request)+'#access_token=local-test-access&refresh_token=local-test-refresh&token_type=bearer');await work;
   assert.equal(h.redirects.length,0);assert.equal(h.button().disabled,false);assert.match(h.status(),/연결하지 못했/);
  }
 });
 test(provider+': iOS bridge returns a bound callback to a new app document, preserving custom-scheme origin',async()=>{
  const messages=[];let reply;
  const bridge={postMessage:message=>{messages.push(message);return message.action==='start'?new Promise(resolve=>{reply=resolve;}):Promise.resolve(true);}};
  const h=device({native:true,bridge});assert.equal(h.button().disabled,false);
  h.client.auth.signInWithOAuth=async args=>{h.oauth.push(args);return {data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null};};
  const work=login(h);h.resolve(true);await turn();
  const request=messages.find(message=>message.action==='start').request;
  assert.equal(h.oauth[0].options.redirectTo,'kr.io.breeze.app://auth/callback?request='+request);
  reply('kr.io.breeze.app://auth/callback?request='+request+'#access_token=local-test-access&refresh_token=local-test-refresh&token_type=bearer');await work;
  assert.deepEqual(h.redirects,['breeze://localhost/index.html?breeze_auth_return='+request+'#access_token=local-test-access&refresh_token=local-test-refresh&token_type=bearer']);assert.equal(h.timers.size,0);
 });
 test(provider+': cancellation ignores late native credentials and mismatched callbacks never reload',async()=>{
  for(const cancelled of [false,true]){
   const messages=[];let reply;
   const bridge={postMessage:message=>{messages.push(message);return message.action==='start'?new Promise(resolve=>{reply=resolve;}):Promise.resolve(true);}};
   const h=device({native:true,bridge});h.client.auth.signInWithOAuth=async()=>({data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+provider},error:null});
   const work=login(h);h.resolve(true);await turn();if(cancelled)h.api.cancel();
   reply('kr.io.breeze.app://auth/callback?request=wrong#access_token=local-test-access&refresh_token=local-test-refresh&token_type=bearer');await work;await turn();
   assert.equal(h.redirects.length,0);assert.ok(messages.some(message=>message.action==='cancel'));assert.equal(h.button().disabled,false);
  }
 });
}

function nativeApple(){
 const messages=[];let resolve,reject;
 const bridge={postMessage:message=>{messages.push(message);return message.action==='apple'?new Promise((yes,no)=>{resolve=yes;reject=no;}):Promise.resolve(true);}};
 const h=device({native:true,bridge}),exchanges=[];
 h.client.auth.signInWithIdToken=async args=>{exchanges.push(args);return {data:{user:{id:'existing-apple-user'}},error:null};};
 return {...h,messages,exchanges,
  pending:()=>resolve,reply:changed=>{const m=messages.findLast(m=>m.action==='apple');resolve({request:m.request,nonce:m.nonce,identityToken:'header.payload.signature',...changed});},
  fail:()=>reject(Error('로그인을 취소했어요.'))};
}
test('native Apple requests fresh OS nonce and exchanges ID token through the existing client',async()=>{
 const h=nativeApple(),before=JSON.stringify(h.words);
 for(let i=0;i<2;i++){
  const work=h.api.login();await h.api.login();h.resolve(true);await turn();
  const message=h.messages.findLast(m=>m.action==='apple');assert.match(message.nonce,/^[a-f0-9]{64}$/);assert.match(message.request,/^[a-f0-9-]{36}$/);
  h.reply();await work;
  assert.equal(h.exchanges[i].provider,'apple');assert.equal(h.exchanges[i].nonce,message.nonce);assert.equal(h.exchanges[i].token,'header.payload.signature');
 }
 assert.notEqual(h.messages.filter(m=>m.action==='apple')[0].nonce,h.messages.filter(m=>m.action==='apple')[1].nonce);
 assert.equal(h.oauth.length,0);assert.equal(h.redirects.length,0);assert.equal(h.timers.size,0);assert.equal(JSON.stringify(h.words),before);
});
test('native Apple cancellation, timeout and stale session reject late OS credentials',async()=>{
 for(const stop of [h=>h.api.cancel(),h=>[...h.timers.values()][0](),h=>h.api.advanceEpoch()]){
  const h=nativeApple(),work=h.api.login();h.resolve(true);await turn();stop(h);h.reply();await work;await turn();
  assert.equal(h.exchanges.length,0);assert.equal(h.redirects.length,0);assert.equal(h.button().disabled,false);assert.equal(h.timers.size,0);
 }
});
test('native Apple cancelled sheet, failed exchange and request/nonce mismatch are retryable',async()=>{
 for(const failure of ['cancel','exchange','request','nonce','identityToken']){
  const h=nativeApple(),work=h.api.login();h.resolve(true);await turn();
  if(failure==='cancel')h.fail();
  else if(failure==='exchange'){h.client.auth.signInWithIdToken=async()=>({error:Error('unavailable')});h.reply();}
  else h.reply({[failure]:'wrong'});
  await work;assert.equal(h.button().disabled,false);assert.equal(h.redirects.length,0);
  assert.match(h.status(),failure==='cancel'?/취소/:/연결하지 못했/);
 }
});
test('native Apple cancellation followed by retry cannot release the newer owner',async()=>{
 const h=nativeApple(),old=h.api.login();h.resolve(true);await turn();const oldMessage=h.messages.find(m=>m.action==='apple');
 const oldReply=h.pending();h.api.cancel();await old;
 const next=h.api.login();h.resolve(true);await turn();assert.equal(h.button().disabled,true);
 oldReply({request:oldMessage.request,nonce:oldMessage.nonce,identityToken:'header.payload.signature'});await turn();assert.equal(h.button().disabled,true);assert.equal(h.exchanges.length,0);
 h.reply();await next;
 assert.equal(h.exchanges.length,1);assert.equal(h.button().disabled,false);
});

async function until(check){
 for(let attempt=0;attempt<30;attempt++){ if(check())return; await turn(); }
 throw Error('android auth did not reach the expected state');
}
function androidDevice(options){
 const h=device({android:true,...options});
 h.client.auth.flowType='implicit';
 h.client.auth.signInWithIdToken=()=>{ throw Error('android must not exchange an Apple identity token'); };
 h.client.auth.signInWithOAuth=async args=>{
  h.oauth.push({provider:args.provider,redirectTo:args.options.redirectTo,skipBrowserRedirect:args.options.skipBrowserRedirect,flowType:h.client.auth.flowType});
  return {data:{url:'https://project.supabase.co/auth/v1/authorize?provider='+args.provider+'&redirect_to='+encodeURIComponent(args.options.redirectTo)+'&code_challenge=local-test-challenge&code_challenge_method=s256'},error:null};
 };
 return h;
}
const callbackFor=(request,extra='')=>'kr.io.breeze.app://auth/callback?request='+request+extra;

for(const provider of ['apple','google']){
 const login=h=>provider==='apple'?h.api.login():h.api.google();
 const button=h=>h.document.getElementById('sm-'+provider+'-login');
 test('android '+provider+': PKCE callback is bound to the request and carries no session token',async()=>{
  const h=androidDevice();
  assert.equal(button(h).disabled,false);
  assert.equal(h.document.getElementById('sm-'+provider+'-note').textContent,'');
  assert.match(h.document.getElementById('sm-google-login').innerHTML,/assets\/auth\/google-g\.png/);
  assert.match(h.document.getElementById('sm-apple-login').innerHTML,/Apple로 로그인/);
  const work=login(h);h.resolve(true);
  await until(()=>h.opened.some(url=>typeof url==='string'));
  const request=new URL(h.oauth[0].redirectTo).searchParams.get('request');
  assert.equal(h.oauth[0].provider,provider);
  assert.equal(h.oauth[0].flowType,'pkce');
  assert.equal(h.oauth[0].skipBrowserRedirect,true);
  assert.equal(h.client.auth.flowType,'implicit');
  assert.equal(h.opened[0],'https://project.supabase.co/auth/v1/authorize?provider='+provider+'&redirect_to='+encodeURIComponent(callbackFor(request))+'&code_challenge=local-test-challenge&code_challenge_method=s256');
  h.deliver(callbackFor(request,'&code=local-test-code'));
  await work;
  assert.deepEqual(h.redirects,['https://localhost/index.html?breeze_auth_return='+request+'&code=local-test-code']);
  assert.equal(h.redirects[0].includes('access_token')||h.redirects[0].includes('refresh_token')||h.redirects[0].includes('#'),false);
  assert.ok(h.opened.includes('close'));
  assert.equal(h.events.appUrlOpen.size,0);
  assert.equal(button(h).disabled,false);
  assert.equal(h.timers.size,0);
 });
 test('android '+provider+': a callback delivered with the browser close still completes',async()=>{
  const h=androidDevice(),work=login(h);h.resolve(true);
  await until(()=>h.opened.some(url=>String(url).startsWith('https:')));
  const request=new URL(h.oauth[0].redirectTo).searchParams.get('request');
  h.finish();
  h.deliver(callbackFor(request,'&code=local-test-code'));
  await work;
  assert.deepEqual(h.redirects,['https://localhost/index.html?breeze_auth_return='+request+'&code=local-test-code']);
  assert.equal(button(h).disabled,false);
 });
 test('android '+provider+': closing the browser returns the button without navigation',async()=>{
  const h=androidDevice(),work=login(h);h.resolve(true);
  await until(()=>h.opened.some(url=>String(url).startsWith('https:')));
  const request=new URL(h.oauth[0].redirectTo).searchParams.get('request');
  h.finish();[...h.timers.values()].at(-1)();await work;
  h.deliver(callbackFor(request,'&code=local-test-code'));await turn();
  assert.equal(h.redirects.length,0);
  assert.match(h.status(),/취소/);
  assert.equal(button(h).disabled,false);
  assert.equal(h.events.appUrlOpen.size,0);
  assert.equal(h.timers.size,0);
 });
 test('android '+provider+': dismissing the request ignores a late callback and frees the button',async()=>{
  const h=androidDevice(),work=login(h);h.resolve(true);
  await until(()=>h.opened.some(url=>String(url).startsWith('https:')));
  const request=new URL(h.oauth[0].redirectTo).searchParams.get('request');
  h.api.cancel();await work;
  h.deliver(callbackFor(request,'&code=local-test-code'));await turn();
  assert.equal(h.redirects.length,0);
  assert.equal(button(h).disabled,false);
  assert.equal(h.events.appUrlOpen.size,0);
  assert.equal(h.timers.size,0);
 });
 test('android '+provider+': a stale callback cannot navigate or release a newer request',async()=>{
  const opens=h=>h.opened.filter(url=>String(url).startsWith('https:')).length;
  const h=androidDevice(),first=login(h);h.resolve(true);
  await until(()=>opens(h)===1);
  const oldRequest=new URL(h.oauth[0].redirectTo).searchParams.get('request');
  h.api.cancel();await first;
  const second=login(h);h.resolve(true);
  await until(()=>h.oauth.length===2&&opens(h)===2);
  const request=new URL(h.oauth[1].redirectTo).searchParams.get('request');
  assert.notEqual(request,oldRequest);
  h.deliver(callbackFor(oldRequest,'&code=stale-test-code'));await turn();
  assert.equal(h.redirects.length,0);assert.equal(button(h).disabled,true);
  h.deliver(callbackFor(request,'&code=local-test-code'));await second;
  assert.deepEqual(h.redirects,['https://localhost/index.html?breeze_auth_return='+request+'&code=local-test-code']);
  assert.equal(button(h).disabled,false);
  const dropped=androidDevice(),stale=login(dropped);dropped.resolve(true);
  await until(()=>opens(dropped)===1);
  const live=new URL(dropped.oauth[0].redirectTo).searchParams.get('request');
  dropped.api.advanceEpoch();
  dropped.deliver(callbackFor(live,'&code=local-test-code'));await stale;await turn();
  assert.equal(dropped.redirects.length,0);assert.equal(button(dropped).disabled,false);
 });
 test('android '+provider+': malformed callbacks never reload the app',async()=>{
  for(const address of [
   request=>'kr.io.breeze.app://user:password@auth/callback?request='+request+'&code=local-test-code',
   request=>'kr.io.breeze.app://auth:123/callback?request='+request+'&code=local-test-code',
   request=>'kr.io.breeze.app://auth/callback?request='+request+'&request=other&code=local-test-code',
   request=>'kr.io.breeze.app://auth/callback?request='+request,
   request=>'kr.io.breeze.app://auth/callback?request='+request+'&code=',
   request=>'kr.io.breeze.app://auth/callback?request='+request+'&code=local-test-code&code=other-code',
   request=>'kr.io.breeze.app://auth/callback?request='+request+'&error=access_denied&code=local-test-code',
   request=>'kr.io.breeze.app://auth/callback?request='+request+'&code=local-test-code#access_token=local-test-access&refresh_token=local-test-refresh&token_type=bearer',
   request=>'kr.io.breeze.app://auth/callback?request='+request+'&access_token=local-test-access&code=local-test-code',
  ]){
   const h=androidDevice(),work=login(h);h.resolve(true);
   await until(()=>h.opened.some(url=>typeof url==='string'));
   const request=new URL(h.oauth[0].redirectTo).searchParams.get('request');
   h.deliver(address(request));await work;
   assert.equal(h.redirects.length,0);assert.equal(button(h).disabled,false);assert.match(h.status(),/연결하지 못했/);
  }
 });
}
test('android without the App and Browser plugins keeps social buttons disabled',()=>{
 const h=device({android:true,plugins:false});
 assert.equal(h.document.getElementById('sm-apple-login').disabled,true);
 assert.equal(h.document.getElementById('sm-google-login').disabled,true);
 assert.match(h.document.getElementById('sm-apple-note').textContent,/아직 준비되지/);
 assert.match(h.document.getElementById('sm-google-note').textContent,/아직 준비되지/);
 assert.match(h.document.getElementById('sm-google-login').innerHTML,/assets\/auth\/google-g\.png/);
});
test('android refuses an authorize URL whose redirect is not the request callback',async()=>{
 const h=androidDevice();
 h.client.auth.signInWithOAuth=async()=>({data:{url:'https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent('https://evil.example/callback')},error:null});
 const work=h.api.google();h.resolve(true);await work;
 assert.equal(h.opened.length,0);assert.equal(h.redirects.length,0);
 assert.equal(h.document.getElementById('sm-google-login').disabled,false);
 assert.match(h.status(),/연결하지 못했/);
});
