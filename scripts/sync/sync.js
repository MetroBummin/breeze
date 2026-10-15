/* ================= Breeze wordbook sync =================
   The signed-in account owns one conditional-write wordbook row. Old encrypted
   vault rows are read only for word migration and are never deleted or changed.
   Reading progress and book content stay local. */
let SB_URL='', SB_KEY='', sb=null, sbInitProblem='', authListenerAttached=false;
let sbUser=null, syncTimer=null, syncPromise=null, syncAgain=false, syncAgainManual=false;
let lastSync=load('breeze.lastsync',0);
let progressSyncTimer=null, lastProgressSyncAt=0;
let syncCooldownUntil=0, syncFailureCount=0;
let progressSyncPromise=null, progressSyncAgain=false, progressSyncAgainRemote=false;
let remoteSyncPromise=null, remoteSyncManual=false;
let syncSessionEpoch=0;
let syncAccountReady=true, syncAccountReadyPromise=Promise.resolve(true), acceptedSyncIdentity;
const SYNC_CAS_ATTEMPTS=4;
let lastQueuedWordState='';
let legacyWordbookPending=false;
// A new document/account first reads and persists a full snapshot. Only that
// acknowledged local state may use the small revision probe on later checks.
let wordbookRemote=null;

const VAULT_ROW='__breeze_vault_v2__';
const VAULT_META_ROW='__breeze_vault_meta_v2__';
const WORDBOOK_ROW='__breeze_wordbook_v1__';
const VAULT_LOCAL_CHANGED='breeze.vault.changed';
const PROGRESS_ROW='__breeze_progress_v1__';
const PROGRESS_LOCAL_CHANGED='breeze.progress.changed';
const LS_HIDDEN='breeze.hidden';
let vaultMaster=null, vaultMeta=null, vaultRemoteItems=[], serverBooks=[],progressRemoteRecords={};
let accountDeleteOpen=false, accountDeleteError='', passwordLoginOpen=false;
/** @type {null | {client:any,epoch:number,controller:AbortController,timer:any,native:any,nonce:string,nativeApple:boolean,rawNonce:string,accepted:boolean,releaseTokens?:()=>void}} */
let socialLoginOperation=null;
// Keep the current email step across settings dismissal/auth rerenders. Never
// persist a password or OTP; Supabase continues to own session verification.
const emailLogin={email:'',sentTo:'',message:'',sending:false,request:0,retryAt:0,retryEmail:'',timer:null};
function rememberLoginEmail(){
  const input=syncInput('sm-email')||syncInput('sm-password-email');
  if(!input) return;
  const email=(input.value||'').trim();
  if(email.toLowerCase()!==emailLogin.email.toLowerCase()) emailLogin.message='';
  emailLogin.email=email;
}
function emailLoginChanged(){ rememberLoginEmail(); updateEmailLoginControls(); }
function updateEmailLoginControls(showMessage=true){
  clearTimeout(emailLogin.timer); emailLogin.timer=null;
  const input=syncInput('sm-email'),button=/** @type {HTMLButtonElement} */(document.getElementById('sm-send-link'));
  if(!input||!button||sbUser) return;
  const email=emailLogin.email.toLowerCase();
  const seconds=email===emailLogin.retryEmail?Math.max(0,Math.ceil((emailLogin.retryAt-Date.now())/1000)):0;
  input.disabled=emailLogin.sending;
  button.disabled=emailLogin.sending||seconds>0;
  button.textContent=emailLogin.sending?'메일 보내는 중…':seconds?`다시 보내기 (${seconds}초)`:'로그인 링크 보내기';
  const wrap=document.getElementById('sm-codewrap');
  if(wrap) wrap.style.display=email&&email===emailLogin.sentTo?'block':'none';
  if(showMessage&&!passwordLoginOpen) syncStatus(emailLogin.message);
  if(seconds) emailLogin.timer=setTimeout(()=>updateEmailLoginControls(false),1000);
}
function clearEmailLogin(){
  emailLogin.request++;
  clearTimeout(emailLogin.timer);
  Object.assign(emailLogin,{email:'',sentTo:'',message:'',sending:false,retryAt:0,retryEmail:'',timer:null});
}
/** @param {string} id */
const syncInput=id=>/** @type {HTMLInputElement} */(document.getElementById(id));

function initSupabase(){
  if(sb) return sb;
  const config=window.BREEZE_CONFIG||{};
  SB_URL=typeof config.SB_URL==='string'?config.SB_URL.trim():'';
  SB_KEY=typeof config.SB_KEY==='string'?config.SB_KEY.trim():'';
  if(!SB_URL||!SB_KEY){ sbInitProblem='config'; return null; }
  if(!window.supabase||typeof window.supabase.createClient!=='function'){ sbInitProblem='sdk'; return null; }
  try{ sb=window.supabase.createClient(SB_URL,SB_KEY,socialNativeBridge()?nativeAppleAuthOptions():undefined); sbInitProblem=''; attachSupabaseAuth(); }
  catch(error){ sbInitProblem='client'; console.error('Supabase 연결 초기화 실패:',error); }
  return sb;
}

function syncStatus(message){ const el=document.getElementById('sm-status'); if(el) el.textContent=message; }
/* 상단바에는 이제 "설정"이 섭니다. 로그인해 두었다는 사실은 그 이름 옆의 ✓
   하나로만 알립니다 — 이름표를 쓰는 곳은 여기 한 곳뿐입니다(i18n 이 덮지 않게). */
function syncBadge(){
  const el=document.querySelector('#nav-settings [data-i18n="nav.settings"]');
  if(el) el.textContent=tr('nav.settings')+(sbUser?' ✓':'');
  if(typeof syncLoginNudge==='function') syncLoginNudge();
  /* 두 번째 탭 이름도 로그인 여부를 따릅니다 — scripts/ui/i18n.js */
  settingsSyncTabLabel();
}
function isNativeShell(){
  try{ return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()); }
  catch(error){ return false; }
}
function vaultDeviceId(){
  let id=load('breeze.vault.device','');
  if(!id){ id=VaultCrypto.uuid(); save('breeze.vault.device',id); }
  return id;
}
const vaultKeyName=suffix=>`u:${sbUser?sbUser.id:'none'}:${suffix}`;

function syncSession(){ return {epoch:syncSessionEpoch,userId:sbUser&&sbUser.id,
  scope:typeof captureLearningScope==='function'?captureLearningScope():null}; }
function assertSyncSession(session){
  if(!syncAccountReady||!session.userId||session.epoch!==syncSessionEpoch||!sbUser||session.userId!==sbUser.id){
    throw Object.assign(new Error('동기화 계정이 바뀌었어요'),{syncCancelled:true});
  }
  if(session.scope&&typeof assertLearningScope==='function')assertLearningScope(session.scope);
}
function resetSyncSession(){
  cancelSocialLogin();
  if(typeof closeSentence==='function') closeSentence();
  if(typeof clearSentenceEasyCache==='function') clearSentenceEasyCache();
  syncSessionEpoch++;
  clearTimeout(syncTimer); clearTimeout(progressSyncTimer);
  syncTimer=null; progressSyncTimer=null;
  syncPromise=null; progressSyncPromise=null; remoteSyncPromise=null;
  syncAgain=false; syncAgainManual=false; progressSyncAgain=false; progressSyncAgainRemote=false; remoteSyncManual=false;
  vaultMaster=null; vaultMeta=null; vaultRemoteItems=[]; serverBooks=[]; progressRemoteRecords={};
  lastProgressSyncAt=0; noteSyncSuccess();
  legacyWordbookPending=false;
  wordbookRemote=null;
  if(typeof resetLearningSync==='function')resetLearningSync();
  if(typeof resetBookCloudSession==='function')resetBookCloudSession();
}
/* Change the local owner before any network callback can run. A return to the
   same user gets a new epoch too, so an earlier A request cannot commit to A
   after the intervening B session. Local activation never awaits a server ACK. */
function activateSyncAccount(next){
  const identity=next&&next.id||null;
  if(acceptedSyncIdentity===identity&&(sbUser&&sbUser.id||null)===identity)return syncAccountReadyPromise;
  acceptedSyncIdentity=identity;
  resetSyncSession();sbUser=next;syncAccountReady=false;
  const epoch=syncSessionEpoch;
  let activation;
  try{activation=typeof switchLearningAccount==='function'?switchLearningAccount(identity):null;}
  catch(error){activation=Promise.reject(error);}
  syncAccountReadyPromise=Promise.resolve(activation).then(()=>{
    if(epoch!==syncSessionEpoch)return false;
    syncAccountReady=true;lastSync=load('breeze.lastsync',0);
    lastQueuedWordState=typeof wordChangeRevision==='function'?null:syncStableJson({words,dead});
    if(identity&&typeof confirmLegacyLearningImport==='function')
      Promise.resolve().then(()=>{if(epoch===syncSessionEpoch)return confirmLegacyLearningImport();}).catch(error=>console.error(error));
    return true;
  }).catch(error=>{
    if(epoch===syncSessionEpoch){
      syncAccountReady=false;acceptedSyncIdentity=undefined;sbUser=null;
      syncBadge();console.error(error);syncStatus('이 계정의 학습 자료를 열지 못했어요. 원본은 보관되어 있어요.');
    }
    return false;
  });
  return syncAccountReadyPromise;
}
function markSyncDirty(key){
  // Distinct writes in the same millisecond must not clear each other's dirty flag.
  const version=Math.max(Date.now(),(Number(load(key,0))||0)+1);
  save(key,version); return version;
}
/* No SQL migration is required: PostgreSQL rechecks these WHERE predicates
   after a competing update. Never fall back to unconditional upsert on conflict.
   Return only the key, not the encrypted snapshot (which can be large). */
async function compareAndSwapSyncRow(key,previous,data,session){
  assertSyncSession(session);
  let result;
  if(!previous){
    result=await sb.from('words').insert([{user_id:session.userId,key,data}]).select('key').maybeSingle();
    assertSyncSession(session);
    if(result.error&&String(result.error.code)==='23505') return false;
  }else{
    let query=sb.from('words').update({data}).eq('user_id',session.userId).eq('key',key);
    if(previous.revision) query=query.eq('data->>revision',String(previous.revision));
    else{
      query=query.is('data->>revision',null);
      query=previous.updatedAt==null?query.is('data->>updatedAt',null):query.eq('data->>updatedAt',String(previous.updatedAt));
    }
    result=await query.select('key').maybeSingle();
    assertSyncSession(session);
  }
  if(result.error) throw result.error;
  return !!(result.data&&result.data.key===key);
}
function syncStableJson(value){
  const stable=one=>Array.isArray(one)?one.map(stable):one&&typeof one==='object'
    ?Object.fromEntries(Object.keys(one).sort().map(key=>[key,stable(one[key])])):one;
  return JSON.stringify(stable(value));
}
async function loadMasterForDevice(){
  if(vaultMaster) return vaultMaster;
  const session=syncSession(),device=vaultDeviceId();
  const saved=await vaultGet(vaultKeyName('device')); assertSyncSession(session);
  if(!saved||!saved.key||!saved.wrap) return null;
  try{
    const master=await VaultCrypto.openDeviceWrap(saved.key,saved.wrap,[session.userId,device,'device']);
    assertSyncSession(session); vaultMaster=master; return master;
  }catch(error){ if(error.syncCancelled) throw error; return null; }
}
async function fetchVaultMeta(){
  const session=syncSession();
  const result=await sb.from('words').select('data').eq('user_id',session.userId).eq('key',VAULT_META_ROW).maybeSingle();
  assertSyncSession(session);
  if(result.error) throw result.error;
  vaultMeta=result.data?result.data.data:null;
  return vaultMeta;
}

/* 동기화 화면은 설정 안의 한 탭입니다. 여기서 "열어 달라"고 하면 설정을 열되
   그 탭을 펴 둡니다 — 사전이 로그인을 요구할 때 이 문으로 들어옵니다. */
function openSyncModal(){ openSettings('sync'); }

function socialNativeBridge(){
  return isNativeShell()?Reflect.get(window,'webkit')?.messageHandlers?.breezeAuth:null;
}
function socialLoginSupported(provider='google'){
  return !!(sb && (!isNativeShell()||socialNativeBridge()) && typeof sb.auth[provider==='apple'&&socialNativeBridge()?'signInWithIdToken':'signInWithOAuth']==='function');
}
function appleLoginWebSupported(){ return socialLoginSupported('apple'); }
function socialLoginCurrent(operation){
  return socialLoginOperation===operation&&!operation.controller.signal.aborted&&operation.epoch===syncSessionEpoch&&operation.client===sb&&!sbUser;
}
/* The SDK remains the sole session owner and uses its existing localStorage
   keys. Bind only native Apple token exchange to the request's abort signal,
   including delayed JSON and the final storage write. A dismissed request must
   never persist a late session or start wordbook sync. All other calls pass on. */
function nativeAppleAuthOptions(){
  const tokenOwners=new Map();
  const storage={
    getItem:key=>localStorage.getItem(key),removeItem:key=>localStorage.removeItem(key),
    setItem:(key,value)=>{
      const token=JSON.parse(value)?.access_token,operation=tokenOwners.get(token);
      if(operation){
        if(!socialLoginCurrent(operation))throw Error('social_cancelled');
        // The synchronous session write is the commit point. The auth listener
        // can now reset sync ownership without aborting this accepted login.
        operation.accepted=true;
      }
      localStorage.setItem(key,value);
    },
  };
  const authFetch=async(input,options)=>{
    const url=new URL(String(input));
    if(url.origin!==new URL(SB_URL).origin||url.pathname!=='/auth/v1/token'||url.searchParams.get('grant_type')!=='id_token')return fetch(input,options);
    const operation=socialLoginOperation,body=JSON.parse(options.body);
    if(!operation?.nativeApple||!socialLoginCurrent(operation)||body.provider!=='apple'||body.nonce!==operation.rawNonce)throw Error('social_cancelled');
    const response=await fetch(input,{...options,signal:operation.controller.signal});
    if(!socialLoginCurrent(operation))throw Error('social_cancelled');
    return new Proxy(response,{get(target,key){
      if(key==='json')return async()=>{
        const result=await target.json();
        if(!socialLoginCurrent(operation))throw Error('social_cancelled');
        if(result?.access_token){
          tokenOwners.set(result.access_token,operation);
          operation.releaseTokens=()=>tokenOwners.delete(result.access_token);
        }
        return result;
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  return {auth:{storage},global:{fetch:authFetch}};
}
function updateSocialLoginControls(){
  for(const provider of ['apple','google']){
    const button=/** @type {HTMLButtonElement} */(document.getElementById('sm-'+provider+'-login'));
    if(button)button.disabled=!socialLoginSupported(provider)||!!socialLoginOperation;
  }
}
function cancelSocialLogin(){
  const operation=socialLoginOperation;
  if(!operation)return;
  socialLoginOperation=null;
  clearTimeout(operation.timer);
  if(!operation.accepted)operation.controller.abort();
  if(operation.native)operation.native.postMessage({action:'cancel',request:operation.nonce}).catch(()=>{});
  updateSocialLoginControls();
}
function renderSyncModal(){
  rememberLoginEmail();
  const body=document.getElementById('sm-body');
  if(!sb){
    const guide=sbInitProblem==='sdk'?'동기화 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'
      :sbInitProblem==='client'?'Supabase 연결을 시작하지 못했어요. config.js를 확인해 주세요.'
      :'아직 서버가 연결되지 않았어요. config.js에 프로젝트 설정을 입력해 주세요.';
    body.innerHTML=`<div class="desc">${guide}</div>`; syncStatus(''); return;
  }
  if(sbUser){
    clearEmailLogin();
    const deleteArea=accountDeleteOpen
      ? `<div class="sm-delete-confirm"><b>계정과 서버의 단어장을 지울까요?</b><span>이 기기의 책과 단어장은 그대로 남습니다. 계속하려면 DELETE를 입력하세요.</span><input id="sm-delete-input" autocomplete="off" spellcheck="false" placeholder="DELETE"><div><button class="sm-reset" onclick="cancelAccountDelete()">취소</button><button class="sm-mini danger" onclick="confirmAccountDelete()">계정 지우기</button></div>${accountDeleteError?`<small class="sm-vault-error">${esc(accountDeleteError)}</small>`:''}</div>`
      : `<button class="sm-linkish" onclick="openAccountDelete()">계정 지우기</button>`;
    body.innerHTML=`<h3 class="settings-section-title">계정</h3>
      <div class="settings-account-group">
        <div class="sm-account"><small>로그인된 계정</small><b>${esc(sbUser.email||'')}</b></div>
        <div class="settings-sync-row"><b>단어장 동기화</b><span>마지막 동기화 · ${lastSync?new Date(lastSync).toLocaleString('ko-KR'):'아직 없음'}</span>
          <button class="sm-mini" onclick="syncRemoteChanges(true)">지금 동기화</button></div>
      </div>
      <p class="settings-sync-note">단어장은 로그인한 계정에 저장되어 자동으로 동기화됩니다. 책과 읽던 위치는 각 기기에 남습니다.</p>
      ${legacyWordbookPending?'<p class="settings-sync-note">예전 암호화 단어장은 기존 기기에서 한 번 동기화하면 이 기기로 옮겨집니다.</p>':''}
      <h3 class="settings-section-title">계정 관리</h3>
      <div class="settings-actions-group"><button class="sm-btn ghost" onclick="sbLogout()">로그아웃 (이 기기에서만)</button>${deleteArea}</div>`;
  }else if(passwordLoginOpen){
    body.innerHTML=`<div class="desc">이미 비밀번호가 설정된 계정으로 로그인합니다.
      새 비밀번호를 만들거나 바꾸는 곳은 아니에요.</div>
      <input id="sm-password-email" type="email" value="${esc(emailLogin.email)}" placeholder="you@example.com" autocomplete="email">
      <input id="sm-password" type="password" placeholder="비밀번호" autocomplete="current-password">
      <button class="sm-btn primary" onclick="sbPasswordLogin()">비밀번호로 로그인</button>
      <button class="sm-linkish neutral" onclick="closePasswordLogin()">이메일 코드 로그인으로 돌아가기</button>`;
  }else{
    body.innerHTML=`<p class="settings-sync-note">로그인하면 단어장을 다른 기기에서도 볼 수 있어요.</p>
      <div class="settings-signin-choices">
        <details id="sm-email-login" ${emailLogin.email?'open':''}>
          <summary>이메일 로그인</summary>
          <div class="settings-email-form">
            <label for="sm-email">이메일 주소</label>
            <input id="sm-email" type="email" value="${esc(emailLogin.email)}" placeholder="you@example.com" autocomplete="email" oninput="emailLoginChanged()">
            <button id="sm-send-link" class="sm-btn primary" onclick="sbSendLink()">로그인 링크 보내기</button>
            <div id="sm-codewrap"><div class="hint">메일의 링크를 누르거나 <b>6자리 코드</b>를 입력하세요.</div>
            <input id="sm-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" aria-label="이메일 로그인 코드">
            <button class="sm-btn ghost" onclick="sbVerifyCode()">코드로 로그인</button></div>
          </div>
        </details>
        <button id="sm-apple-login" class="settings-apple-signin" type="button" onclick="sbAppleLogin()" ${!appleLoginWebSupported()||socialLoginOperation?'disabled':''} aria-describedby="sm-apple-note" aria-label="Apple로 로그인"><img class="settings-apple-art light" src="assets/auth/signin-ko-black.png" width="250" height="48" alt="" aria-hidden="true"><img class="settings-apple-art dark" src="assets/auth/signin-ko-white.png" width="250" height="48" alt="" aria-hidden="true"></button>
        <span id="sm-apple-note" hidden>${isNativeShell()&&!socialNativeBridge()?'이 앱의 Apple 로그인 연결은 아직 준비되지 않았어요.':''}</span>
        <button id="sm-google-login" class="settings-google-signin ${isNativeShell()?'native':''}" type="button" onclick="sbGoogleLogin()" ${!socialLoginSupported()||socialLoginOperation?'disabled':''} aria-describedby="sm-google-note"><img class="settings-google-logo" src="assets/auth/google-g.png" width="20" height="20" alt="" aria-hidden="true"><span>Google로 로그인</span></button>
        <span id="sm-google-note" hidden>${isNativeShell()&&!socialNativeBridge()?'이 앱의 Google 로그인 연결은 아직 준비되지 않았어요.':''}</span>
        <button id="sm-password-login" class="sm-linkish neutral settings-password-link" onclick="openPasswordLogin()">비밀번호 로그인</button>
      </div>`;
  }
  syncStatus('');
  updateEmailLoginControls();
}

/* The five-second preparation deadline covers settings, body parsing and the
   SDK authorization URL. Aborting fetch alone cannot settle an SDK promise.
   Only the current operation may navigate or release its buttons. Consent and
   callback session persistence remain owned by the existing Supabase client. */
async function sbAppleLogin(){ return sbSocialLogin('apple'); }
async function sbGoogleLogin(){ return sbSocialLogin('google'); }
async function sbSocialLogin(provider){
  if(!['apple','google'].includes(provider)||!socialLoginSupported(provider)||sbUser||socialLoginOperation)return;
  const label=provider==='apple'?'Apple':'Google';
  const operation={client:sb,epoch:syncSessionEpoch,controller:new AbortController(),timer:null,native:socialNativeBridge(),nonce:'',nativeApple:false,rawNonce:'',accepted:false,releaseTokens:null};
  if(operation.native)operation.nonce=VaultCrypto.uuid();
  operation.nativeApple=provider==='apple'&&!!operation.native;
  socialLoginOperation=operation;
  const current=()=>socialLoginCurrent(operation);
  const deadline=new Promise((_,reject)=>{
    operation.controller.signal.addEventListener('abort',()=>reject(Error('social_cancelled')),{once:true});
    operation.timer=setTimeout(()=>operation.controller.abort(),5000);
  });
  updateSocialLoginControls();syncStatus(label+' 로그인 준비 중…');
  try{
    const prepare=async()=>{
      const response=await fetch(SB_URL.replace(/\/$/,'')+'/auth/v1/settings',{
        headers:{apikey:SB_KEY},signal:operation.controller.signal,credentials:'omit',
      });
      if(!response.ok)throw Error('provider_settings');
      const settings=await response.json();
      if(!current())return null;
      if(settings.external?.[provider]!==true)return {unconfigured:true};
      if(operation.nativeApple)return {appleNative:true};
      const {data,error}=await operation.client.auth.signInWithOAuth({provider,options:{
        redirectTo:operation.native?'kr.io.breeze.app://auth/callback?request='+operation.nonce:location.origin+location.pathname,skipBrowserRedirect:true,
      }});
      if(!current())return null;
      if(error||!data?.url)throw Error('social_signin');
      const target=new URL(data.url),project=new URL(SB_URL);
      if(target.protocol!=='https:'||target.origin!==project.origin||target.username||target.password||target.hash||target.pathname!=='/auth/v1/authorize'||target.searchParams.getAll('provider').length!==1||target.searchParams.get('provider')!==provider)throw Error('social_url');
      return {url:target.href};
    };
    const result=await Promise.race([prepare(),deadline]);
    if(!current()||!result)return;
    if(result.unconfigured){syncStatus(label+' 로그인이 아직 설정되지 않았어요. 이메일로 로그인해 주세요.');return;}
    if(!operation.native){location.assign(result.url);return;}
    // Preparation has a five-second bound; interactive consent gets two minutes.
    // Cancellation invalidates the owner before the native reply can return.
    clearTimeout(operation.timer);
    operation.timer=setTimeout(()=>operation.controller.abort(),120000);
    syncStatus(label+'에서 로그인을 마쳐 주세요.');
    if(operation.nativeApple){
      operation.rawNonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
      const credential=await Promise.race([operation.native.postMessage({action:'apple',request:operation.nonce,nonce:operation.rawNonce}),deadline]);
      if(!current())return;
      if(credential?.request!==operation.nonce||credential?.nonce!==operation.rawNonce||typeof credential?.identityToken!=='string'||credential.identityToken.split('.').length!==3)throw Error('apple_credential');
      syncStatus('Apple 로그인 확인 중…');
      const exchange=operation.client.auth.signInWithIdToken({provider:'apple',token:credential.identityToken,nonce:operation.rawNonce})
        .finally(()=>operation.releaseTokens?.());
      const result=await Promise.race([exchange,deadline]);
      if(result.error)throw Error('apple_signin');
      return;
    }
    const callback=await Promise.race([operation.native.postMessage({action:'start',request:operation.nonce,url:result.url}),deadline]);
    if(!current())return;
    const returned=new URL(String(callback));
    if(returned.protocol!=='kr.io.breeze.app:'||returned.hostname!=='auth'||returned.username||returned.password||returned.port||returned.pathname!=='/callback'||returned.searchParams.getAll('request').length!==1||returned.searchParams.get('request')!==operation.nonce)throw Error('social_callback');
    const tokens=new URLSearchParams(returned.hash.slice(1));
    if(tokens.get('error')||!tokens.get('access_token')||!tokens.get('refresh_token')||tokens.get('token_type')!=='bearer')throw Error('social_callback');
    // A new app document hands the callback to the same bundled SDK's URL
    // initialization and persistent session store, rather than a second client
    // or a cancellable setSession promise that could write after its owner died.
    // A fragment-only replace is same-document navigation: the SDK would never
    // reinitialize. A request-bound query forces a fresh document without a
    // second auth client; the accepted-session listener removes it below.
    const appURL=new URL(location.href);appURL.search='';appURL.searchParams.set('breeze_auth_return',operation.nonce);appURL.hash=returned.hash;
    location.replace(appURL.href);
  }catch(error){
    if(socialLoginOperation===operation&&operation.epoch===syncSessionEpoch&&operation.client===sb&&!sbUser)syncStatus(String(error).includes('취소')?label+' 로그인을 취소했어요.':label+' 로그인에 연결하지 못했어요. 다시 시도하거나 이메일로 로그인해 주세요.');
  }finally{
    clearTimeout(operation.timer);
    if(operation.native)operation.native.postMessage({action:'cancel',request:operation.nonce}).catch(()=>{});
    if(socialLoginOperation===operation){socialLoginOperation=null;updateSocialLoginControls();}
  }
}

async function sbSendLink(){
  const input=syncInput('sm-email');
  if(!input||!sb||sbUser||emailLogin.sending) return;
  rememberLoginEmail();
  const email=emailLogin.email;
  if(!/.+@.+\..+/.test(email)){ emailLogin.message='이메일 형식을 확인해 주세요'; updateEmailLoginControls(); return; }
  if(email.toLowerCase()===emailLogin.retryEmail&&Date.now()<emailLogin.retryAt){ updateEmailLoginControls(); return; }
  const native=isNativeShell(),epoch=syncSessionEpoch,request=++emailLogin.request;
  emailLogin.sending=true; emailLogin.message='메일 보내는 중…'; updateEmailLoginControls();
  try{
    const options=native?{}:{emailRedirectTo:location.origin+location.pathname};
    const result=await sb.auth.signInWithOtp({email,options});
    if(sbUser||epoch!==syncSessionEpoch||request!==emailLogin.request) return;
    if(result.error){
      const error=result.error;
      if(error.status===429||error.code==='over_email_send_rate_limit'){
        const seconds=Number(String(error.message||'').match(/after (\d+) seconds?/i)?.[1])||60;
        emailLogin.sentTo=email.toLowerCase();
        emailLogin.retryEmail=email.toLowerCase(); emailLogin.retryAt=Date.now()+seconds*1000;
        emailLogin.message='메일을 너무 자주 요청했어요. 표시된 시간이 지나면 다시 보낼 수 있어요. 이미 받은 코드는 그대로 입력할 수 있어요.';
      }else emailLogin.message='메일을 보내지 못했어요. 이메일 주소와 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
      return;
    }
    emailLogin.sentTo=email.toLowerCase(); emailLogin.retryEmail=email.toLowerCase();
    emailLogin.retryAt=Date.now()+60000;
    emailLogin.message=native?'메일로 6자리 코드를 보냈어요.':'메일을 보냈어요. 링크를 누르거나 코드를 입력하세요.';
    updateEmailLoginControls();
    // A response must not steal focus after the user leaves this form.
    if(syncInput('sm-email')===input&&document.getElementById('settings-modal')?.classList.contains('on')) syncInput('sm-code')?.focus();
  }catch(error){
    if(!sbUser&&epoch===syncSessionEpoch&&request===emailLogin.request) emailLogin.message='메일을 보내지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  }finally{
    // Account transitions can clear this form while a transport is pending.
    // Only the active request may release the form's busy state.
    if(request===emailLogin.request){
      emailLogin.sending=false;
      if(!sbUser&&epoch!==syncSessionEpoch) emailLogin.message='로그인 상태가 바뀌었어요. 다시 시도해 주세요.';
      updateEmailLoginControls();
    }
  }
}
async function sbVerifyCode(){
  const email=(syncInput('sm-email').value||'').trim();
  const token=(syncInput('sm-code').value||'').replace(/[\s-]/g,'').trim();
  if(!/^\d{6}$/.test(token)){ syncStatus('6자리 숫자 코드를 입력해 주세요'); return; }
  syncStatus('코드 확인 중…');
  const result=await sb.auth.verifyOtp({email,token,type:'email'});
  if(result.error) syncStatus('코드 확인 실패: '+result.error.message);
}
function openPasswordLogin(){ passwordLoginOpen=true; renderSyncModal(); syncInput('sm-password-email')?.focus(); }
function closePasswordLogin(){ passwordLoginOpen=false; renderSyncModal(); syncInput('sm-email')?.focus(); }
async function sbPasswordLogin(){
  const email=(syncInput('sm-password-email').value||'').trim();
  const password=syncInput('sm-password').value||'';
  if(!/.+@.+\..+/.test(email)){ syncStatus('이메일 형식을 확인해 주세요'); return; }
  if(!password){ syncStatus('비밀번호를 입력해 주세요'); return; }
  syncStatus('로그인 중…');
  const result=await sb.auth.signInWithPassword({email,password});
  if(result.error) syncStatus('로그인 실패: 이메일 또는 비밀번호를 확인해 주세요');
}
document.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target===document.getElementById('sm-code')){ event.preventDefault(); sbVerifyCode(); }
  if(event.key==='Enter'&&event.target===document.getElementById('sm-password')){ event.preventDefault(); sbPasswordLogin(); }
});
async function sbLogout(){
  const previous=sbUser&&sbUser.id,epoch=syncSessionEpoch;
  await sb.auth.signOut({scope:'local'});
  if(sbUser&&(sbUser.id!==previous||syncSessionEpoch!==epoch))return;
  await activateSyncAccount(null);
  syncBadge(); renderSyncModal(); renderAllBookViews();
}
function openAccountDelete(){ accountDeleteOpen=true; accountDeleteError=''; renderSyncModal(); }
function cancelAccountDelete(){ accountDeleteOpen=false; accountDeleteError=''; renderSyncModal(); }
async function confirmAccountDelete(){
  if(!sb||!sbUser) return;
  const typed=(syncInput('sm-delete-input').value||'').trim();
  if(typed!=='DELETE'){ accountDeleteError='DELETE를 정확히 입력해 주세요.'; renderSyncModal(); return; }
  syncStatus('계정을 지우는 중…');
  const session=syncSession();
  try{
    const answer=await dictCall({op:'delete_account'});
    assertSyncSession(session);
    if(!answer||!answer.ok) throw new Error((answer&&(answer.message||answer.error))||'서버가 응답하지 않았어요');
    const logoutEpoch=syncSessionEpoch;
    try{ await sb.auth.signOut({scope:'local'}); }catch(error){}
    if(sbUser&&(sbUser.id!==session.userId||syncSessionEpoch!==logoutEpoch))return;
    await activateSyncAccount(null);accountDeleteOpen=false;
    lastSync=0; save('breeze.lastsync',0); syncBadge(); renderSyncModal(); renderAllBookViews();
    syncStatus('계정을 지웠어요. 이 기기의 자료는 그대로 있어요.');
  }catch(error){ if(error.syncCancelled)return;accountDeleteError='계정을 지우지 못했어요: '+(error.message||error); renderSyncModal(); }
}


function hiddenBookIds(){ return load(LS_HIDDEN,{}); }
function hideBookLocally(id){ const hidden=hiddenBookIds(); hidden[id]=Date.now(); save(LS_HIDDEN,hidden); }
function unhideBookLocally(id){ const hidden=hiddenBookIds(); if(hidden[id]===undefined) return; delete hidden[id]; save(LS_HIDDEN,hidden); }
function activeServerBooks(){ return []; }
function serverBookIdFor(book){
  const match=activeServerBooks().find(row=>(row.meta||{}).localId===book.id);
  return match?match.book_id:book.id;
}
function queueSync(changed=false){
  // Lookup already knows which record it mutated. Mark it dirty immediately
  // without serializing the entire vocabulary on the interaction frame.
  if(typeof hasWordChanges==='function'){
    if(changed!==true&&!hasWordChanges()&&!Number(load(VAULT_LOCAL_CHANGED,0)))return;
  }else if(changed===true)lastQueuedWordState=null;
  else{
    const current=syncStableJson({words,dead});
    if(current===lastQueuedWordState)return;
    lastQueuedWordState=current;
  }
  markSyncDirty(VAULT_LOCAL_CHANGED); clearTimeout(syncTimer);
  if(!sb||!sbUser) return;
  syncTimer=setTimeout(()=>doSync(false),4000);
}
/* The reader still calls this hook; progress sync is dormant. */
function queueReadingProgressSync(){
  // Reading locations are local until the broader sync feature returns.
  if(typeof bookCloudEnabled==='function'&&bookCloudEnabled()&&typeof scheduleBookCloudPosition==='function')scheduleBookCloudPosition();
}
function sameProgressLocation(left,right){
  const clean=value=>{ const safe=safePosition(value); if(safe) delete safe.t; return safe; };
  return JSON.stringify(clean(left))===JSON.stringify(clean(right));
}
const upOf=word=>word?(word.up||word.addedAt||0):0;
function doSync(manual){
  if(!sb||!sbUser) return Promise.resolve(false);
  if(!syncAccountReady){const epoch=syncSessionEpoch;return syncAccountReadyPromise.then(ready=>ready&&epoch===syncSessionEpoch?doSync(manual):false);}
  if(!manual&&Date.now()<syncCooldownUntil) return Promise.resolve(false);
  if(syncPromise){
    /* Auth can report the same session more than once during startup. A second
       remote check is not useful; only a manual request or a real local write
       earns another pass. */
    if(manual||Number(load(VAULT_LOCAL_CHANGED,0))){ syncAgain=true; syncAgainManual=syncAgainManual||!!manual; }
    return syncPromise;
  }
  const epoch=syncSessionEpoch;
  syncPromise=(async()=>{
    let nextManual=!!manual,completed=true;
    do{
      syncAgain=false; const passManual=nextManual||syncAgainManual; syncAgainManual=false;
      const ok=await runSyncPass(passManual); if(epoch!==syncSessionEpoch) return false; nextManual=false;
      if(!ok){ completed=false; syncAgain=false; break; }
    }while(syncAgain&&sb&&sbUser);
    return completed;
  })().finally(()=>{ if(epoch===syncSessionEpoch) syncPromise=null; });
  return syncPromise;
}
function syncErrorStatus(error){ return Number(error&&(error.status||error.statusCode||error.code))||0; }
function noteSyncFailure(error){
  syncFailureCount=Math.min(syncFailureCount+1,5);
  const quota=syncErrorStatus(error)===402||/quota|egress|restriction|payment required/i.test(String(error&&(error.message||error)));
  const delay=quota?15*60*1000:Math.min(15*60*1000,30000*(2**(syncFailureCount-1)));
  syncCooldownUntil=Date.now()+delay;
}
function noteSyncSuccess(){ syncFailureCount=0; syncCooldownUntil=0; }
function safePosition(position){
  if(!position) return null;
  return {p:Number(position.p)||0,t:Number(position.t)||0,mode:position.mode==='original'?'original':'text',
    pi:Number.isFinite(position.pi)?position.pi:null,dy:Number(position.dy)||0,
    original:position.original?{page:Number(position.original.page)||1,ratio:Number(position.original.ratio)||0}:null};
}
async function vaultFileIdentity(rawHash){
  if(!vaultMaster||!rawHash) return '';
  return VaultCrypto.recordId(vaultMaster,'file-sha256',String(rawHash));
}
async function vaultSourceIdentity(book,rawHash){
  if(rawHash) return vaultFileIdentity(rawHash);
  if(book.kind==='article'&&book.sourceUrl){
    let url=String(book.sourceUrl); try{ const parsed=new URL(url); parsed.hash=''; url=parsed.href; }catch(error){}
    return VaultCrypto.recordId(vaultMaster,'article-url',url);
  }
  /* 붙여넣기에는 파일 바이트나 URL이 없습니다. 원문 자체는 저장하지 않고,
     이 경우에만 기존 로컬 지문을 HMAC 입력으로 써서 다시 붙여넣은 글을 찾습니다. */
  if(book.kind==='paste') return VaultCrypto.recordId(vaultMaster,'pasted-text',ensureBookFingerprint(book));
  /* 예전 버전에서 원본 해시를 보관하지 않은 파일은 본문으로 추측하지 않습니다.
     이 기기에서 만든 무작위 표식만 쓰며, 원본을 다시 연결하는 순간 파일 해시로 교체됩니다. */
  if(!book.syncIdentity){ book.syncIdentity=VaultCrypto.uuid(); await bookPut(book); }
  return VaultCrypto.recordId(vaultMaster,'unlinked-local-item',book.syncIdentity);
}
async function localVaultItem(book){
  let original=book.original||{};
  if(['pdf','epub'].includes(book.kind||'')&&!original.hash){
    const record=await originalGetForBook(book); if(record) original=record;
  }
  const rawHash=original.hash||book.sourceHash||'';
  return {id:book.id,title:book.title||'(제목 없음)',author:book.author||'',kind:book.kind||'',site:book.site||'',
    sourceUrl:book.sourceUrl||'',classicId:book.classicId||'',longReadId:book.longReadId||'',
    originalTitle:book.originalTitle||'',attribution:book.attribution||null,coverPosition:book.coverPosition||'',
    identity:await vaultSourceIdentity(book,rawHash),originalKind:original.kind||'',
    fileSize:Number(original.size||book.sourceSize)||0,fileModified:Number(original.lastModified||book.sourceModified)||0,addedAt:book.addedAt||Date.now(),
    updatedAt:Math.max(book.renamedAt||0,book.coverUpdatedAt||0,book.addedAt||0)};
}
function itemIdentity(item){
  return item.identity||'id:'+item.id;
}
/* Keep a local, exportable conflict journal before replacing a different
   expression/meaning tuple. Neither spelling nor meaning alone proves equality. */
function preserveWordConflict(key,left,right){
  if(!left||!right||!left.ko||!right.ko)return;
  const text=value=>String(value||'').normalize('NFC').trim().replace(/\s+/g,' ');
  const identity=item=>JSON.stringify([text(item.word||key),text(item.ko)]);
  const leftIdentity=identity(left),rightIdentity=identity(right);
  if(leftIdentity===rightIdentity)return;
  const saved=load('breeze.word-conflicts',{});
  const conflicts=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
  const id=JSON.stringify([key,...[leftIdentity,rightIdentity].sort()]);
  if(Object.prototype.hasOwnProperty.call(conflicts,id))return;
  conflicts[id]={key,left,right,at:Date.now()};
  if(!save('breeze.word-conflicts',conflicts))throw new Error('뜻 충돌 사본을 저장하지 못했어요');
  toast('기기 간 다른 학습 항목을 발견했어요. 두 항목을 이 기기에 보존했어요.');
}
window['breezeExportWordConflicts']=function(){
  const blob=new Blob([JSON.stringify(load('breeze.word-conflicts',{}),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='breeze-word-conflicts.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function wordSyncMeaning(item){return String(item&&item.ko||'').normalize('NFC').trim().replace(/\s+/g,' ');}
function wordSyncExpression(key,item){return String(item&&item.word||key).normalize('NFC').trim().replace(/\s+/g,' ');}
function wordSyncIdentity(key,item){return JSON.stringify([wordSyncExpression(key,item),wordSyncMeaning(item)]);}
function wordSyncOrder(item){
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
    ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
  return JSON.stringify(stable(item));
}
function retainConcurrentWordMeaning(key,loser,winner,remoteWords,remoteDead){
  const root=loser.root||key;
  // Keep the complete spelling/meaning in the ID: no hash collision can merge
  // unrelated senses, and a retry or another device chooses the same address.
  const sameExpression=wordSyncExpression(key,loser)===wordSyncExpression(key,winner);
  const id=root+(sameExpression?'::sync-sense:':'::sync-expression:')+encodeURIComponent(wordSyncIdentity(key,loser));
  const buried=Math.max(dead[id]||0,(remoteDead||{})[id]||0);
  const remote=(remoteWords||{})[id],existing=words[id];
  const retained={...loser};
  if(sameExpression){retained.root=root;retained.sense=true;}
  else{delete retained.root;delete retained.sense;}
  const candidates=[existing,remote,retained].filter(Boolean);
  candidates.sort((a,b)=>upOf(b)-upOf(a)||wordSyncOrder(b).localeCompare(wordSyncOrder(a)));
  if(buried>=upOf(candidates[0])&&buried){delete words[id];dead[id]=buried;return;}
  words[id]=candidates[0];delete dead[id];
}
function mergeWordState(remoteWords,remoteDead){
  const all=new Set([...Object.keys(remoteWords||{}),...Object.keys(remoteDead||{}),...Object.keys(words),...Object.keys(dead)]);
  for(const key of all){
    const rw=(remoteWords||{})[key],rd=(remoteDead||{})[key]||0,lw=words[key],ld=dead[key]||0;
    const newest=Math.max(upOf(rw),rd,upOf(lw),ld);
    if((rd&&newest===rd)||(ld&&newest===ld)){ delete words[key]; dead[key]=newest; }
    else{
      preserveWordConflict(key,lw,rw);
      const remoteWins=upOf(rw)>upOf(lw)||(upOf(rw)===upOf(lw)&&rw&&(!lw||wordSyncOrder(rw)>=wordSyncOrder(lw)));
      if(lw&&rw&&wordSyncMeaning(lw)&&wordSyncMeaning(rw)&&wordSyncIdentity(key,lw)!==wordSyncIdentity(key,rw))
        retainConcurrentWordMeaning(key,remoteWins?lw:rw,remoteWins?rw:lw,remoteWords,remoteDead);
      if(remoteWins){words[key]=rw;delete dead[key];}
    }
  }
  cleanOrphanWords(words,dead,pendingWord&&pendingWord.key);
}
async function readLegacyRows(){
  const session=syncSession();
  const result=await sb.from('words').select('key,data').eq('user_id',session.userId)
    .not('key','in',`(${VAULT_ROW},${VAULT_META_ROW},${PROGRESS_ROW},${WORDBOOK_ROW})`);
  assertSyncSession(session);
  if(result.error) throw result.error;
  return result.data||[];
}
async function purgePrivateDictionaryLogs(){
  const flag=`breeze.private-logs-purged:${sbUser.id}`;
  if(load(flag,false)) return;
  try{ const answer=await dictCall({op:'purge_private_logs'}); if(answer&&answer.ok) save(flag,true); }
  catch(error){}
}
async function importLegacyWordbook(session,wordbook){
  const flag=`breeze.wordbook.legacy-imported:${session.userId}`;
  if(wordbook&&wordbook.legacyImportedAt){
    save(flag,true);legacyWordbookPending=false;return true;
  }
  if(load(flag,false)) return true;
  // Old encrypted vaults need one visit from a device that still has the key.
  // Keep the old rows untouched, including their book and progress metadata.
  const metaResult=await sb.from('words').select('data').eq('user_id',session.userId).eq('key',VAULT_META_ROW).maybeSingle();
  assertSyncSession(session); if(metaResult.error) throw metaResult.error;
  const meta=metaResult.data&&metaResult.data.data;
  if(meta){
    vaultMeta=meta;
    const master=await loadMasterForDevice(); assertSyncSession(session);
    if(!master){ legacyWordbookPending=true; return false; }
    legacyWordbookPending=false;
    const oldResult=await sb.from('words').select('data').eq('user_id',session.userId).eq('key',VAULT_ROW).maybeSingle();
    assertSyncSession(session); if(oldResult.error) throw oldResult.error;
    const old=oldResult.data&&oldResult.data.data;
    if(old&&old.envelope){
      const payload=await VaultCrypto.openJson(master,old.envelope,
        [session.userId,meta.vaultId,'snapshot'],'breeze/vault/v2');
      assertSyncSession(session);
      mergeWordState(payload.words||{},payload.dead||{});
    }
  }
  const rows=await readLegacyRows(); assertSyncSession(session);
  const oldWords={},oldDead={};
  for(const row of rows){
    const value=row.data||{};
    // Legacy clients interpret every non-reserved words row as a dictionary
    // item. Learning snapshots therefore live in their own table, and this
    // migration additionally refuses unknown objects instead of inventing words.
    if(typeof row.key!=='string'||row.key.startsWith('__breeze_')||!value||typeof value!=='object'||Array.isArray(value))continue;
    if(value.deleted) oldDead[row.key]=value.up||0;
    else if(typeof value.ko==='string'&&value.ko.trim()||value.ai&&value.ai.done&&typeof value.ai.ko==='string'&&value.ai.ko.trim())oldWords[row.key]=value;
  }
  mergeWordState(oldWords,oldDead);
  legacyWordbookPending=false;
  return true;
}

async function completeWordbookSync(manual,session){
  noteSyncSuccess();lastSync=Date.now();save('breeze.lastsync',lastSync);
  await purgePrivateDictionaryLogs(); assertSyncSession(session);
  if(manual||document.getElementById('settings-modal').classList.contains('on')) renderSyncModal();
  if(manual) syncStatus('단어장 동기화를 마쳤어요');
  if(document.getElementById('v-vocab').classList.contains('on')) renderVocab();
  return true;
}
async function patchAcknowledgedWordbook(session,acknowledged){
  if(typeof captureWordChanges!=='function'||typeof acknowledgeWordChanges!=='function')return null;
  if(!hasWordChanges())return null;
  let patch=captureWordChanges();
  if(!saveWords(patch.keys)||(typeof saveDead==='function'&&!saveDead(patch.keys)))
    throw new Error('이 기기에 단어장을 저장하지 못했어요');
  patch=captureWordChanges();
  const dirtyAt=Number(load(VAULT_LOCAL_CHANGED,0))||0,revision=VaultCrypto.uuid();
  if(typeof sb.rpc!=='function')throw new Error('단어 변경 동기화 서버 준비가 필요해요. 변경은 이 기기에 보관했어요.');
  const result=await sb.rpc('breeze_patch_wordbook',{expected_user_id:session.userId,expected_revision:acknowledged.revision,next_revision:revision,
    patch_words:patch.words,patch_dead:patch.dead});
  assertSyncSession(session);
  if(result.error)throw result.error;
  if(result.data!==true)return null; // Another writer won: fetch and merge once.
  acknowledgeWordChanges(patch);
  if(!hasWordChanges()&&Number(load(VAULT_LOCAL_CHANGED,0))===dirtyAt&&!save(VAULT_LOCAL_CHANGED,0))
    throw new Error('동기화 상태를 저장하지 못했어요');
  wordbookRemote={userId:session.userId,revision,version:patch.version};
  if(hasWordChanges())syncAgain=true;
  return true;
}
async function runSyncPass(manual){
  const session=syncSession();
  if(manual) syncStatus('단어장을 동기화하는 중…');
  try{
    const acknowledged=wordbookRemote;
    if(acknowledged&&acknowledged.userId===session.userId&&typeof wordChangeRevision==='function'
      &&load(`breeze.wordbook.legacy-imported:${session.userId}`,false)){
      if(await patchAcknowledgedWordbook(session,acknowledged))return await completeWordbookSync(manual,session);
    }
    if(!manual&&acknowledged&&acknowledged.userId===session.userId
      &&!Number(load(VAULT_LOCAL_CHANGED,0))
      &&load(`breeze.wordbook.legacy-imported:${session.userId}`,false)
      &&(typeof wordChangeRevision==='function'?acknowledged.version===wordChangeRevision():acknowledged.state===syncStableJson({words,dead}))){
      const header=await sb.from('words').select('revision:data->>revision,legacyImportedAt:data->legacyImportedAt')
        .eq('user_id',session.userId).eq('key',WORDBOOK_ROW).maybeSingle();
      assertSyncSession(session);if(header.error)throw header.error;
      // A local mutation while the probe was in flight must still take the
      // ordinary read/merge/CAS path, including writes without a dirty hook.
      if(header.data&&header.data.revision===acknowledged.revision&&header.data.legacyImportedAt
        &&!Number(load(VAULT_LOCAL_CHANGED,0))&&(typeof wordChangeRevision==='function'?acknowledged.version===wordChangeRevision():acknowledged.state===syncStableJson({words,dead}))){
        return await completeWordbookSync(manual,session);
      }
    }
    for(let attempt=0;attempt<SYNC_CAS_ATTEMPTS;attempt++){
      const dirtyAt=Number(load(VAULT_LOCAL_CHANGED,0))||0;
      const result=await sb.from('words').select('data').eq('user_id',session.userId).eq('key',WORDBOOK_ROW).maybeSingle();
      assertSyncSession(session); if(result.error) throw result.error;
      const previous=result.data&&result.data.data;
      const imported=await importLegacyWordbook(session,previous); assertSyncSession(session);
      if(previous) mergeWordState(previous.words||{},previous.dead||{});
      if(!saveWords()||!save(LS_DEAD,dead))throw new Error('이 기기에 단어장을 저장하지 못했어요');
      const localChanges=typeof captureWordChanges==='function'?captureWordChanges():null;
      const syncedWords={...words};
      if(pendingWord&&!pendingWordResolved(pendingWord.key)) delete syncedWords[pendingWord.key];
      const changed=!previous||(imported&&!previous.legacyImportedAt)
        ||syncStableJson(previous.words||{})!==syncStableJson(syncedWords)
        ||syncStableJson(previous.dead||{})!==syncStableJson(dead);
      const syncedState=localChanges?null:syncStableJson({words,dead});
      let revision=previous&&previous.revision;
      if(changed){
        const data={v:1,updatedAt:Date.now(),revision:VaultCrypto.uuid(),words:syncedWords,dead:{...dead},
          ...(imported?{legacyImportedAt:previous&&previous.legacyImportedAt||Date.now()}: {})};
        if(!await compareAndSwapSyncRow(WORDBOOK_ROW,previous,data,session)) continue;
        revision=data.revision;
      }
      assertSyncSession(session);
      if(localChanges)acknowledgeWordChanges(localChanges);
      if(imported) save(`breeze.wordbook.legacy-imported:${session.userId}`,true);
      if((!localChanges||!hasWordChanges())&&Number(load(VAULT_LOCAL_CHANGED,0))===dirtyAt&&!save(VAULT_LOCAL_CHANGED,0))throw new Error('동기화 상태를 저장하지 못했어요');
      if(localChanges&&hasWordChanges())syncAgain=true;
      lastQueuedWordState=localChanges?null:syncStableJson({words,dead});
      wordbookRemote=imported&&revision?{userId:session.userId,revision,...(localChanges?{version:localChanges.version}:{state:syncedState})}:null;
      return await completeWordbookSync(manual,session);
    }
    throw new Error('다른 기기의 변경과 충돌했어요. 이 기기의 단어는 보관하고 다음에 다시 합칩니다.');
  }catch(error){
    if(error.syncCancelled) return false;
    noteSyncFailure(error);console.error(error);
    if(manual) syncStatus('동기화 실패: '+(error.message||error));
    return false;
  }
}

async function localProgressRecords(){
  const session=syncSession();
  const records={},localByIdentity=new Map();
  for(const book of books){
    if(book.sampleId) continue;
    const item=await localVaultItem(book); assertSyncSession(session);
    const position=safePosition(positions[book.id]);
    localByIdentity.set(item.identity,book);
    if(position&&position.t) records[item.identity]={position,updatedAt:position.t};
  }
  return {records,localByIdentity};
}
function refreshServerBookProgress(){
  serverBooks=(serverBooks||[]).map(row=>{
    const meta=row.meta||{},record=progressRemoteRecords[itemIdentity(meta)];
    return {...row,meta:{...meta,position:record&&record.position||null}};
  });
}
async function runProgressSyncPass(manual,checkRemote){
  const session=syncSession();
  if(!Number(load(PROGRESS_LOCAL_CHANGED,0))&&!checkRemote&&!manual) return true;
  try{
    if(!vaultMeta) await fetchVaultMeta(); assertSyncSession(session);
    const master=vaultMaster||await loadMasterForDevice(); assertSyncSession(session);
    if(!master||!vaultMeta) return false;
    const vaultId=vaultMeta.vaultId;
    for(let attempt=0;attempt<SYNC_CAS_ATTEMPTS;attempt++){
      const dirtyAt=Number(load(PROGRESS_LOCAL_CHANGED,0))||0;
      const result=await sb.from('words').select('data').eq('user_id',session.userId).eq('key',PROGRESS_ROW).maybeSingle();
      assertSyncSession(session); if(result.error) throw result.error;
      const previous=result.data&&result.data.data;
      const payload=previous&&previous.envelope?await VaultCrypto.openJson(master,previous.envelope,
        [session.userId,vaultId,'progress'],'breeze/progress/v1'):null;
      assertSyncSession(session);
      const remoteRecords=payload&&payload.records||{};
      const local=await localProgressRecords(); assertSyncSession(session);
      let activeIdentity='';
      if(curBook&&document.getElementById('v-read').classList.contains('on')){
        const activeItem=await localVaultItem(curBook); assertSyncSession(session); activeIdentity=activeItem.identity;
      }
      // A spread would replace a newer cached/migrated position with a stale
      // active reader position. Merge all candidates by timestamp instead.
      const localCandidates=BreezeProgressMerge.merge(progressRemoteRecords,local.records,'').records;
      const merged=BreezeProgressMerge.merge(remoteRecords,localCandidates,activeIdentity);
      if(merged.serverChanged||!previous){
        const updatedAt=Date.now(),payload=JSON.parse(JSON.stringify({v:1,updatedAt,deviceId:vaultDeviceId(),records:merged.records}));
        const envelope=await VaultCrypto.sealJson(master,payload,[session.userId,vaultId,'progress'],'breeze/progress/v1');
        assertSyncSession(session);
        const data={v:1,updatedAt,revision:VaultCrypto.uuid(),envelope};
        if(!await compareAndSwapSyncRow(PROGRESS_ROW,previous,data,session)) continue;
      }
      assertSyncSession(session);
      progressRemoteRecords=BreezeProgressMerge.merge(merged.records,progressRemoteRecords,'').records;
      // Recheck the live local position after async writes. Do not overwrite a
      // scroll that occurred during encryption/network, or move an open reader.
      let applied=false;
      for(const [identity,record] of Object.entries(progressRemoteRecords)){
        const book=local.localByIdentity.get(identity); if(!book) continue;
        if(curBook&&curBook.id===book.id&&document.getElementById('v-read').classList.contains('on')) continue;
        if(!positions[book.id]||record.updatedAt>(positions[book.id].t||0)){
          positions[book.id]=record.position; applied=true;
        }
      }
      if(applied) save(LS_POS,positions);
      if(Number(load(PROGRESS_LOCAL_CHANGED,0))===dirtyAt) save(PROGRESS_LOCAL_CHANGED,0);
      lastProgressSyncAt=Date.now(); refreshServerBookProgress(); noteSyncSuccess(); renderAllBookViews();
      return true;
    }
    throw new Error('진행도 변경이 충돌했어요. 읽던 위치는 보관하고 다음 동기화에서 다시 합칩니다.');
  }catch(error){
    if(error.syncCancelled) return false;
    noteSyncFailure(error); console.error(error);
    if(manual) syncStatus('진행도 동기화 실패: '+(error.message||error));
    return false;
  }
}
function doProgressSync(manual,checkRemote){
  if(!sb||!sbUser) return Promise.resolve(false);
  if(!manual&&Date.now()<syncCooldownUntil) return Promise.resolve(false);
  if(progressSyncPromise){
    if(manual||checkRemote||Number(load(PROGRESS_LOCAL_CHANGED,0))){
      progressSyncAgain=true; progressSyncAgainRemote=progressSyncAgainRemote||!!checkRemote;
    }
    return progressSyncPromise;
  }
  const epoch=syncSessionEpoch;
  progressSyncPromise=(async()=>{
    let nextManual=!!manual,nextRemote=!!checkRemote,completed=true;
    do{
      progressSyncAgain=false;
      const check=nextRemote||progressSyncAgainRemote; progressSyncAgainRemote=false;
      const ok=await runProgressSyncPass(nextManual,check); if(epoch!==syncSessionEpoch) return false;
      nextManual=false; nextRemote=false;
      if(!ok){ completed=false; progressSyncAgain=false; break; }
    }while(progressSyncAgain&&sb&&sbUser);
    return completed;
  })().finally(()=>{ if(epoch===syncSessionEpoch) progressSyncPromise=null; });
  return progressSyncPromise;
}
function syncRemoteChanges(manual){
  // Publish the owner before activation finishes. A caller that treats
  // "no promise" as idle (a reload, or WebKit aborting an intercepted REST
  // read) must not slip through the gap while device words are still merging.
  if(remoteSyncPromise){ remoteSyncManual=remoteSyncManual||!!manual; return remoteSyncPromise; }
  const epoch=syncSessionEpoch;
  remoteSyncPromise=(async()=>{
    if(!syncAccountReady){
      const ready=await syncAccountReadyPromise;
      if(!ready||epoch!==syncSessionEpoch)return false;
    }
    let nextManual=!!manual,completed=true;
    do{
      remoteSyncManual=false;
      const vaultOk=await doSync(nextManual); if(epoch!==syncSessionEpoch) return false;
      completed=completed&&!!vaultOk;
      if(typeof doLearningSync==='function'){
        const learningOk=await doLearningSync(nextManual);if(epoch!==syncSessionEpoch)return false;
        completed=completed&&!!learningOk;
      }
      if(typeof bookCloudEnabled==='function'&&bookCloudEnabled()&&typeof syncBookCloud==='function'){
        try{await syncBookCloud();}catch(error){if(error&&error.syncCancelled)return false;}
      }
      nextManual=remoteSyncManual;
    }while(nextManual&&sb&&sbUser);
    if(manual&&completed){ renderSyncModal(); syncStatus('단어장 동기화를 마쳤어요'); }
    return completed;
  })().finally(()=>{ if(epoch===syncSessionEpoch) remoteSyncPromise=null; });
  return remoteSyncPromise;
}


/* ---- 로그인했다는 사실은 이 기기의 것입니다 ----
   supabase-js 는 로그인한 세션을 localStorage 의 `sb-<프로젝트>-auth-token` 아래
   둡니다. 로그아웃하면 지우고, 서버가 "이 토큰은 무효다" 라고 답했을 때도
   지웁니다. 그런데 **네트워크가 없어서** 새 토큰을 못 받은 것은 그 둘 중 어느
   것도 아니라서, supabase 자신도 이 값을 그대로 둡니다.

   그동안 Breeze 는 로그인한 적 없는 사람처럼 굴었습니다. 접근 토큰은 한 시간
   만에 만료되고, `getSession()` 은 만료됐으면 새로 받아 보려 하는데, 오프라인
   에서는 그 재시도가 물러서며 되풀이됩니다 — 재어 보니 25초 동안 답도
   `onAuthStateChange` 이벤트도 오지 않았습니다(그동안 저장된 세션은 그대로
   있었습니다). 그 25초 내내, 그리고 그 뒤로도 `sbUser` 는 null 이고 화면은
   "로그인" 을 권합니다. 어제 로그인해 둔 사람이 비행기 모드로 앱을 켜면 늘
   이것입니다.

   그래서 저장된 세션을 먼저 읽고, 그 뒤에 오는 진짜 답이 이것을 덮게 합니다.
   가짜 로그인을 만드는 것이 아닙니다 — 이미 이 기기에 있는 것을 네트워크가
   대답할 때까지 버리지 않는 것뿐입니다. 로그아웃하면 이 값이 사라지므로
   로그아웃은 그대로 로그아웃입니다. */
function storedAuthUser(){
  try{
    const ref=new URL(SB_URL).hostname.split('.')[0];
    const raw=localStorage.getItem(`sb-${ref}-auth-token`);
    if(!raw) return null;
    const saved=JSON.parse(raw);
    return saved&&saved.user&&saved.user.id?saved.user:null;
  }catch(error){ return null; }
}

function attachSupabaseAuth(){
  if(!sb||authListenerAttached) return; authListenerAttached=true;
  let authVersion=0;
  const accept=(session,event)=>{
    /* 서버가 세션을 주지 않았어도 이 기기에 남아 있으면 그것이 지금의 사실입니다. */
    const next=event==='SIGNED_OUT'?null:session?session.user:storedAuthUser();
    activateSyncAccount(next);
    syncBadge();
    if(sbUser&&isNativeShell()){
      const url=new URL(location.href);
      if(url.searchParams.has('breeze_auth_return')){
        url.searchParams.delete('breeze_auth_return');
        history.replaceState(null,'',url.pathname+url.search+url.hash);
      }
    }
    if(typeof selKey!=='undefined'&&selKey&&typeof renderPanel==='function') renderPanel();
    if(next)syncRemoteChanges(false);
    if(document.getElementById('settings-modal').classList.contains('on')) renderSyncModal();
  };
  /* 부팅하는 그 자리에서 한 번. `getSession()` 이 오프라인에서 돌아오지 않아도
     로그인 상태는 이미 서 있습니다. */
  accept(null);
  sb.auth.onAuthStateChange((event,session)=>{authVersion++;accept(session,event);});
  const initialVersion=authVersion;
  sb.auth.getSession().then(({data:{session}})=>{if(authVersion===initialVersion)accept(session);});
}
lastQueuedWordState=syncStableJson({words,dead});
initSupabase();
document.addEventListener('visibilitychange',()=>{
  if(!sb||!sbUser) return; clearTimeout(syncTimer);
  if(document.hidden){
    if(curBook&&typeof scrollTick!=='undefined'&&scrollTick){ clearTimeout(scrollTick); scrollTick=null; saveReadingState(); }
    if(Number(load(VAULT_LOCAL_CHANGED,0))) doSync(false);
  }else syncRemoteChanges(false);
});
