/* ================= Breeze E2EE primitives =================
   이 파일에는 저장·UI·Supabase 를 넣지 않습니다. 암호 규격을 한 곳에 가둬야
   검토와 교체가 가능하고, 앱의 다른 코드가 실수로 열쇠를 문자열로 저장하지
   못합니다. Web Crypto 의 AES-256-GCM, HKDF-SHA-256, HMAC-SHA-256 만 씁니다. */
const VaultCrypto = (() => {
  const te = new TextEncoder();
  const td = new TextDecoder();

  function bytes(value){
    if(value instanceof Uint8Array) return value;
    if(value instanceof ArrayBuffer) return new Uint8Array(value);
    if(ArrayBuffer.isView(value)) return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    return te.encode(String(value));
  }
  /* TS 5.7 distinguishes ArrayBuffer from SharedArrayBuffer more strictly than
     Web Crypto does. A fresh copy is unambiguously an ArrayBuffer in every browser. */
  function raw(value){ return new Uint8Array(bytes(value)).buffer; }
  function b64(value){
    const input=bytes(value); let out='';
    for(let i=0;i<input.length;i+=0x8000) out+=String.fromCharCode(...input.subarray(i,i+0x8000));
    return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function unb64(value){
    const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(normalized+'==='.slice((normalized.length+3)%4));
    const out=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
    return out;
  }
  function random(length){ const out=new Uint8Array(length); crypto.getRandomValues(out); return out; }
  function uuid(){
    if(crypto.randomUUID) return crypto.randomUUID();
    const value=random(16); value[6]=(value[6]&15)|64; value[8]=(value[8]&63)|128;
    const hex=[...value].map(x=>x.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function aad(parts){ return te.encode(parts.map(part=>String(part)).join('\u001f')); }
  async function hkdfKey(secret,salt,info,usage){
    const base=await crypto.subtle.importKey('raw',raw(secret),'HKDF',false,['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'HKDF',hash:'SHA-256',salt:raw(salt),info:raw(te.encode(String(info)))},
      base,{name:'AES-GCM',length:256},false,usage||['encrypt','decrypt']);
  }
  async function sealBytes(secret,plain,aadParts,info){
    const salt=random(16), iv=random(12);
    const key=await hkdfKey(secret,salt,info||'breeze/data/v2');
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:raw(iv),additionalData:raw(aad(aadParts))},key,raw(plain));
    return {v:2,alg:'A256GCM',salt:b64(salt),iv:b64(iv),ct:b64(cipher)};
  }
  async function openBytes(secret,envelope,aadParts,info){
    if(!envelope || envelope.v!==2 || envelope.alg!=='A256GCM') throw new Error('지원하지 않는 암호화 데이터예요');
    const key=await hkdfKey(secret,unb64(envelope.salt),info||'breeze/data/v2');
    const plain=await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:raw(unb64(envelope.iv)),additionalData:raw(aad(aadParts))},key,raw(unb64(envelope.ct)));
    return new Uint8Array(plain);
  }
  async function sealJson(secret,value,aadParts,info){
    return sealBytes(secret,te.encode(JSON.stringify(value)),aadParts,info);
  }
  async function openJson(secret,envelope,aadParts,info){
    return JSON.parse(td.decode(await openBytes(secret,envelope,aadParts,info)));
  }
  async function recordId(secret,type,logicalId){
    const key=await crypto.subtle.importKey('raw',raw(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=await crypto.subtle.sign('HMAC',key,raw(te.encode(`breeze/index/v2\u001f${type}\u001f${logicalId}`)));
    return b64(new Uint8Array(signature).subarray(0,24));
  }
  async function createDeviceWrap(master,aadParts){
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const iv=random(12);
    const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:raw(iv),additionalData:raw(aad(aadParts))},key,raw(master));
    return {key,wrap:{v:2,alg:'A256GCM',iv:b64(iv),ct:b64(ct)}};
  }
  async function openDeviceWrap(key,wrap,aadParts){
    const plain=await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:raw(unb64(wrap.iv)),additionalData:raw(aad(aadParts))},key,raw(unb64(wrap.ct)));
    return new Uint8Array(plain);
  }
  /* 복구키는 URL-safe base64가 아니라 영숫자만 쓰는 base32입니다. 표시용
     하이픈을 떼어도 원문과 구분이 되고, 메신저·비밀번호 관리자에서 복사해도
     기호가 사라지지 않습니다. */
  const B32='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function recoveryEncode(input){
    const src=bytes(input); let bits=0,value=0,out='';
    for(const byte of src){ value=(value<<8)|byte; bits+=8; while(bits>=5){ out+=B32[(value>>>(bits-5))&31]; bits-=5; } }
    if(bits) out+=B32[(value<<(5-bits))&31];
    return out.match(/.{1,4}/g).join('-');
  }
  function recoveryDecode(text){
    const clean=String(text||'').toUpperCase().replace(/[^A-Z2-9]/g,'');
    let bits=0,value=0,out=[];
    for(const ch of clean){ const index=B32.indexOf(ch); if(index<0) throw new Error('복구키 형식을 확인해 주세요');
      value=(value<<5)|index; bits+=5; if(bits>=8){ out.push((value>>>(bits-8))&255); bits-=8; } }
    const decoded=new Uint8Array(out);
    if(decoded.length!==32) throw new Error('복구키 길이를 확인해 주세요');
    return decoded;
  }
  async function pairingKey(privateKey,publicJwk,salt,info){
    const publicKey=await crypto.subtle.importKey('jwk',publicJwk,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const shared=await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},privateKey,256);
    return hkdfKey(new Uint8Array(shared),salt,info||'breeze/pair/v2');
  }
  async function pairingCreate(){
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
    return {privateKey:pair.privateKey,publicJwk:await crypto.subtle.exportKey('jwk',pair.publicKey)};
  }
  async function pairingSeal(key,plain,aadParts){
    const iv=random(12); const ct=await crypto.subtle.encrypt(
      {name:'AES-GCM',iv:raw(iv),additionalData:raw(aad(aadParts))},key,raw(plain));
    return {v:2,alg:'A256GCM',iv:b64(iv),ct:b64(ct)};
  }
  async function pairingOpen(key,wrap,aadParts){
    const plain=await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:raw(unb64(wrap.iv)),additionalData:raw(aad(aadParts))},key,raw(unb64(wrap.ct)));
    return new Uint8Array(plain);
  }
  return {bytes,b64,unb64,random,uuid,sealBytes,openBytes,sealJson,openJson,recordId,
    createDeviceWrap,openDeviceWrap,recoveryEncode,recoveryDecode,pairingCreate,pairingKey,
    pairingSeal,pairingOpen,utf8:value=>te.encode(String(value)),text:value=>td.decode(bytes(value))};
})();
