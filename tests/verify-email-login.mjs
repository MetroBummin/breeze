import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const source=readFileSync(new URL('../scripts/sync/sync.js',import.meta.url),'utf8');
function device({native=false}={}){
  const {document}=parseHTML('<html><body><div id="settings-modal" class="on"><div id="sm-body"></div><div id="sm-status"></div></div><input id="recovery-fileinput"><input id="reading-backup-input"></body></html>');
  let now=1000000,sequence=0;
  const requests=[],timers=new Map();
  const auth={signInWithOtp:args=>new Promise((resolve,reject)=>requests.push({args,resolve,reject}))};
  const context=vm.createContext({document,window:{Capacitor:{isNativePlatform:()=>native}},load:(_key,fallback)=>fallback,
    words:{},dead:{},console,location:{origin:'https://breeze.io.kr',pathname:'/'},
    esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
    Date:class extends Date{static now(){return now;}},
    setTimeout:callback=>{const id=++sequence;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(source+'\n globalThis.api={render:renderSyncModal,send:sbSendLink,password:openPasswordLogin,back:closePasswordLogin,changed:typeof emailLoginChanged==="function"?emailLoginChanged:()=>{},setClient:client=>sb=client,setUser:user=>sbUser=user,advanceEpoch:()=>syncSessionEpoch++};',context);
  context.api.setClient({auth}); context.api.render();
  const get=id=>document.getElementById(id)||(id==='sm-send-link'?document.querySelector('button[onclick="sbSendLink()"]'):null);
  return {api:context.api,requests,document,get,timers,
    email:value=>{get('sm-email').value=value;context.api.changed();},
    advance:ms=>{now+=ms;const callbacks=[...timers.values()];timers.clear();callbacks.forEach(callback=>callback());}};
}
async function sent(h){h.email('reader@example.com');const send=h.api.send();h.requests.at(-1).resolve({error:null});await send;}

test('invalid email never requests an OTP',async()=>{
  const h=device();h.email('invalid');await h.api.send();
  assert.equal(h.requests.length,0);assert.match(h.get('sm-status').textContent,/이메일 형식/);
});
test('repeated send clicks coalesce while pending and during resend cooldown',async()=>{
  const h=device();h.email('reader@example.com');const first=h.api.send();await h.api.send();
  assert.equal(h.requests.length,1);assert.equal(h.get('sm-send-link').disabled,true);assert.equal(h.get('sm-email').disabled,true);
  h.requests[0].resolve({error:null});await first;await h.api.send();
  assert.equal(h.requests.length,1);assert.equal(h.get('sm-email').disabled,false);
  assert.match(h.get('sm-send-link').textContent,/60초/);
  h.advance(60001);assert.equal(h.get('sm-send-link').disabled,false);
  const again=h.api.send();assert.equal(h.requests.length,2);h.requests[1].resolve({error:null});await again;
});
test('settings dismissal and rerender retain email and the code step without retaining the OTP',async()=>{
  const h=device();await sent(h);h.get('sm-code').value='123456';h.api.render();
  assert.equal(h.get('sm-email').value,'reader@example.com');assert.equal(h.get('sm-codewrap').style.display,'block');
  assert.equal(h.get('sm-code').value,'');assert.equal(h.requests.length,1);assert.match(h.get('sm-status').textContent,/메일을 보냈어요/);
});
test('password round trip preserves email and code availability',async()=>{
  const h=device();await sent(h);h.api.password();assert.equal(h.get('sm-password-email').value,'reader@example.com');
  h.api.back();assert.equal(h.get('sm-email').value,'reader@example.com');assert.equal(h.get('sm-codewrap').style.display,'block');
  assert.equal(h.requests.length,1);
});
test('late email result does not overwrite the password screen and is available on return',async()=>{
  const h=device();h.email('reader@example.com');const send=h.api.send();h.api.password();h.get('sm-status').textContent='비밀번호 안내';
  h.requests[0].resolve({error:null});await send;assert.equal(h.get('sm-status').textContent,'비밀번호 안내');
  h.api.back();assert.equal(h.get('sm-codewrap').style.display,'block');assert.match(h.get('sm-status').textContent,/메일을 보냈어요/);
});
test('server resend delay is shown in Korean and already received code remains usable',async()=>{
  const h=device();await sent(h);h.advance(60001);const again=h.api.send();
  h.requests[1].resolve({error:{status:429,code:'over_email_send_rate_limit',message:'For security purposes, you can only request this after 27 seconds.'}});await again;
  assert.match(h.get('sm-status').textContent,/너무 자주/);assert.match(h.get('sm-send-link').textContent,/27초/);
  assert.equal(h.get('sm-codewrap').style.display,'block');await h.api.send();assert.equal(h.requests.length,2);
  h.advance(27001);assert.equal(h.get('sm-send-link').disabled,false);
});
test('countdown does not overwrite code-verification status',async()=>{
  const h=device();await sent(h);h.get('sm-status').textContent='코드 확인 실패';h.advance(1000);
  assert.equal(h.get('sm-status').textContent,'코드 확인 실패');
});
test('a rejected network promise restores the form and can be retried',async()=>{
  const h=device();h.email('reader@example.com');const send=h.api.send();h.requests[0].reject(new Error('Network failure'));await send;
  assert.match(h.get('sm-status').textContent,/인터넷 연결/);assert.equal(h.get('sm-send-link').disabled,false);assert.equal(h.get('sm-email').disabled,false);
  const retry=h.api.send();assert.equal(h.requests.length,2);h.requests[1].resolve({error:null});await retry;
});
test('another email does not inherit a previous address code step or resend lock',async()=>{
  const h=device();await sent(h);h.email('other@example.com');assert.equal(h.get('sm-codewrap').style.display,'none');assert.equal(h.get('sm-send-link').disabled,false);
  h.email('READER@example.com');assert.equal(h.get('sm-codewrap').style.display,'block');assert.equal(h.get('sm-send-link').disabled,true);
});
test('web and native email requests preserve existing redirect behavior',async()=>{
  for(const native of [false,true]){const h=device({native});await sent(h);assert.equal(h.requests[0].args.email,'reader@example.com');
    assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].args.options)),native?{}:{emailRedirectTo:'https://breeze.io.kr/'});}
});
test('success after a changed auth session cannot restore old email state',async()=>{
  const h=device();h.email('reader@example.com');const send=h.api.send();h.api.advanceEpoch();h.get('sm-status').textContent='새 세션';
  h.requests[0].resolve({error:null});await send;assert.equal(h.get('sm-codewrap').style.display,'none');
  assert.doesNotMatch(h.get('sm-status').textContent,/메일을 보냈어요/);
});
test('signed-in render clears temporary email state and countdown',async()=>{
  const h=device();await sent(h);h.api.setUser({id:'signed-in',email:'reader@example.com'});h.api.render();assert.equal(h.timers.size,0);
  h.api.setUser(null);h.api.render();assert.equal(h.get('sm-email').value,'');assert.equal(h.get('sm-codewrap').style.display,'none');
});

test('a throttled first request still lets an existing email code be entered',async()=>{
  const h=device();h.email('reader@example.com');const send=h.api.send();
  h.requests[0].resolve({error:{status:429,code:'over_email_send_rate_limit',message:'For security purposes, you can only request this after 17 seconds.'}});await send;
  assert.equal(h.get('sm-codewrap').style.display,'block');assert.match(h.get('sm-send-link').textContent,/17초/);
  h.api.render();assert.equal(h.get('sm-codewrap').style.display,'block');assert.equal(h.get('sm-email').value,'reader@example.com');
});

test('an old send cannot unlock a newer request after sign-in and sign-out',async()=>{
  const h=device();h.email('first@example.com');const first=h.api.send();
  h.api.advanceEpoch();h.api.setUser({id:'password-user',email:'password@example.com'});h.api.render();
  h.api.advanceEpoch();h.api.setUser(null);h.api.render();
  h.email('second@example.com');const second=h.api.send();
  h.requests[0].resolve({error:null});await first;
  assert.equal(h.get('sm-send-link').disabled,true,'An old finally released the new request');
  assert.equal(h.get('sm-email').disabled,true);
  assert.equal(h.get('sm-status').textContent,'메일 보내는 중…');
  await h.api.send();assert.equal(h.requests.length,2,'A duplicate send escaped while the new request was pending');
  h.requests[1].resolve({error:null});await second;
  assert.equal(h.get('sm-email').disabled,false);assert.equal(h.get('sm-email').value,'second@example.com');
  assert.equal(h.get('sm-codewrap').style.display,'block');
});
