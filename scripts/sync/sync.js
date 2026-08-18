/* ================= Breeze E2EE sync =================
   서버에 올라가는 것은 단어·학습 기록·읽기자료의 제목과 진행도를 담은 암호문
   하나뿐입니다. PDF·EPUB·paras·기사 본문·사진은 이 파일의 어떤 서버 요청에도
   들어가지 않습니다. 기존 평문 동기화 자료는 암호문 저장 성공 뒤에 지웁니다. */
let SB_URL='', SB_KEY='', sb=null, sbInitProblem='', authListenerAttached=false;
let sbUser=null, syncTimer=null, syncPromise=null, syncAgain=false, syncAgainManual=false;
let lastSync=load('breeze.lastsync',0);
let progressSyncTimer=null, lastProgressSyncAt=0;

const VAULT_ROW='__breeze_vault_v2__';
const VAULT_META_ROW='__breeze_vault_meta_v2__';
const VAULT_LOCAL_CHANGED='breeze.vault.changed';
const LS_HIDDEN='breeze.hidden';
let vaultMaster=null, vaultMeta=null, vaultRemoteItems=[], serverBooks=[];
let pendingRecoveryKey='', vaultInfoOpen=false, vaultRecoveryError='', recoveryRotateOpen=false;
let pendingPair=null, pairingPoll=null, pairingError='';
let accountDeleteOpen=false, accountDeleteError='';
/** @param {string} id */
const syncInput=id=>/** @type {HTMLInputElement} */(document.getElementById(id));

function initSupabase(){
  if(sb) return sb;
  const config=window.BREEZE_CONFIG||{};
  SB_URL=typeof config.SB_URL==='string'?config.SB_URL.trim():'';
  SB_KEY=typeof config.SB_KEY==='string'?config.SB_KEY.trim():'';
  if(!SB_URL||!SB_KEY){ sbInitProblem='config'; return null; }
  if(!window.supabase||typeof window.supabase.createClient!=='function'){ sbInitProblem='sdk'; return null; }
  try{ sb=window.supabase.createClient(SB_URL,SB_KEY); sbInitProblem=''; attachSupabaseAuth(); }
  catch(error){ sbInitProblem='client'; console.error('Supabase 연결 초기화 실패:',error); }
  return sb;
}

function syncStatus(message){ const el=document.getElementById('sm-status'); if(el) el.textContent=message; }
/* 상단바에는 이제 "설정"이 섭니다. 로그인해 두었다는 사실은 그 이름 옆의 ✓
   하나로만 알립니다 — 이름표를 쓰는 곳은 여기 한 곳뿐입니다(i18n 이 덮지 않게). */
function syncBadge(){
  const el=document.getElementById('nav-settings');
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

async function saveMasterForDevice(master){
  const made=await VaultCrypto.createDeviceWrap(master,[sbUser.id,vaultDeviceId(),'device']);
  await vaultPut(vaultKeyName('device'),{key:made.key,wrap:made.wrap});
  vaultMaster=VaultCrypto.bytes(master);
}
async function loadMasterForDevice(){
  if(vaultMaster) return vaultMaster;
  const saved=await vaultGet(vaultKeyName('device'));
  if(!saved||!saved.key||!saved.wrap) return null;
  try{
    vaultMaster=await VaultCrypto.openDeviceWrap(saved.key,saved.wrap,[sbUser.id,vaultDeviceId(),'device']);
    return vaultMaster;
  }catch(error){ return null; }
}
async function fetchVaultMeta(){
  const result=await sb.from('words').select('data').eq('user_id',sbUser.id).eq('key',VAULT_META_ROW).maybeSingle();
  if(result.error) throw result.error;
  vaultMeta=result.data?result.data.data:null;
  return vaultMeta;
}
async function makeRecoveryWrap(master){
  const recovery=VaultCrypto.random(32);
  const vaultId=(vaultMeta&&vaultMeta.vaultId)||VaultCrypto.uuid();
  const recoveryWrap=await VaultCrypto.sealBytes(
    recovery,master,[sbUser.id,vaultId,'recovery'],'breeze/recovery/v2');
  const meta={...(vaultMeta||{}),v:2,vaultId,recoveryWrap,rotatedAt:Date.now()};
  const saved=await sb.from('words').upsert(
    [{user_id:sbUser.id,key:VAULT_META_ROW,data:meta}],{onConflict:'user_id,key'});
  if(saved.error) throw saved.error;
  vaultMeta=meta;
  pendingRecoveryKey=VaultCrypto.recoveryEncode(recovery);
  return pendingRecoveryKey;
}
async function ensureVaultReady(){
  await fetchVaultMeta();
  let master=await loadMasterForDevice();
  if(master) return master;
  if(vaultMeta) return null;
  master=VaultCrypto.random(32);
  await saveMasterForDevice(master);
  await makeRecoveryWrap(master);
  return master;
}

/* 동기화 화면은 설정 안의 한 탭입니다. 여기서 "열어 달라"고 하면 설정을 열되
   그 탭을 펴 둡니다 — 사전이 로그인을 요구할 때 이 문으로 들어옵니다. */
function openSyncModal(){ openSettings('sync'); }
function closeSyncModal(){ closeSettings(); }

function recoveryPanel(){
  if(vaultMeta&&!vaultMaster){
    const pairing=pendingPair
      ? `<div class="sm-pair-box"><img id="sm-pair-qr" alt="이전 기기로 스캔할 QR"><b>${esc(pendingPair.code)}</b><span>이전 기기에서 QR을 스캔하거나 이 코드를 입력하세요.</span></div>
         <button class="sm-reset" onclick="cancelDevicePairing()">연결 취소</button>`
      : `<button class="sm-pair-start" onclick="startDevicePairing()">이전 기기로 연결</button>`;
    return `<section class="sm-vault locked"><div class="sm-vault-head"><div><span class="sm-vault-kicker">END-TO-END ENCRYPTED</span><b>단어 보관함이 잠겨 있어요</b></div><button class="sm-info" onclick="toggleVaultInfo()" aria-label="암호화 설명">i</button></div>
      ${vaultInfoOpen?'<div class="sm-vault-info">이 기기에는 열쇠가 없어요. 저장해 둔 복구키를 입력하면 단어장과 진행도를 되찾을 수 있어요.</div>':''}
      <div class="sm-secret"><input id="sm-recovery-input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="복구키 붙여넣기"><button onclick="pickRecoveryFile()">파일</button></div>
      ${vaultRecoveryError?`<div class="sm-vault-error">${esc(vaultRecoveryError)}</div>`:''}
      <div class="sm-vault-actions"><button class="sm-mini primary" onclick="restoreRecoveryKey()">복원하기</button></div>
      <div class="sm-device-move"><b>기존 기기가 있나요?</b><span>복구키를 입력하지 않고 안전하게 열쇠를 받을 수 있어요.</span>${pairing}${pairingError?`<small class="sm-vault-error">${esc(pairingError)}</small>`:''}</div></section>`;
  }
  if(!vaultMeta&&!vaultMaster) return `<section class="sm-vault locked"><p>안전한 보관함을 준비하고 있어요.</p></section>`;
  const recovery=pendingRecoveryKey
    ? `<div class="sm-recovery-key">${esc(pendingRecoveryKey)}</div>
       <div class="sm-recovery-actions"><button onclick="copyRecoveryKey()">복사하기</button><button onclick="saveRecoveryFile()">파일에 저장</button><button onclick="shareRecoveryKey()">다른 앱으로 보내기</button></div>
       <button class="sm-saved" onclick="finishRecoverySave()">저장 안내를 완료했어요</button>`
    : recoveryRotateOpen
      ? `<div class="sm-reset-confirm"><b>새 복구키를 만들까요?</b><span>기존 데이터는 그대로지만, 이전 복구키는 사용할 수 없게 됩니다.</span><div><button class="sm-reset" onclick="cancelRecoveryRotate()">취소</button><button class="sm-mini danger" onclick="confirmRecoveryRotate()">새로 만들기</button></div></div>`
      : `<button class="sm-reset" onclick="openRecoveryRotate()">새 복구키 만들기</button>`;
  return `<section class="sm-vault"><div class="sm-vault-head"><div><span class="sm-vault-kicker">END-TO-END ENCRYPTED</span><b>단어 보관함 · 자동 동기화 중</b></div><button class="sm-info" onclick="toggleVaultInfo()" aria-label="암호화 설명">i</button></div>
    ${vaultInfoOpen?'<div class="sm-vault-info">단어·숙어·뜻·예문과 읽던 위치만 기기에서 암호화해 동기화해요. PDF·EPUB·기사 본문과 사진은 이 기기 밖으로 보내지 않아요. Breeze는 복호화 키를 보유하지 않습니다.</div>':''}
    <p>${pendingRecoveryKey?'기기를 잃어도 단어장을 되찾을 수 있도록 복구키를 안전한 곳에 저장해 주세요.':'이 기기의 열쇠로 자동 동기화하고 있어요. 이전에 저장한 복구키는 앱에서 다시 표시되지 않습니다.'}</p>${recovery}
    <details class="sm-fold"><summary><b>다른 기기 연결</b><span>6자리 코드 또는 QR</span></summary><div class="sm-device-move"><span>새 기기에 표시된 6자리 코드를 입력해 열쇠를 보내세요.</span><input id="sm-pair-code" inputmode="numeric" maxlength="6" placeholder="6자리 코드"><button onclick="approvePairingCode()">코드로 동기화</button><small>새 기기가 QR을 띄우면 이 기기의 카메라로 스캔해도 됩니다.</small></div></details>
    <details class="sm-fold"><summary><b>읽기자료 옮기기</b><span>이 기기에만 보관</span></summary><div class="sm-device-move"><span>서버에 올리지 않고 암호화 파일로 직접 옮겨요.</span><button onclick="exportReadingBackup()">내 책·글 내보내기</button><button onclick="pickReadingBackup()">백업 파일 불러오기</button></div></details></section>`;
}

function renderSyncModal(){
  const body=document.getElementById('sm-body');
  if(!sb){
    const guide=sbInitProblem==='sdk'?'동기화 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'
      :sbInitProblem==='client'?'Supabase 연결을 시작하지 못했어요. config.js를 확인해 주세요.'
      :'아직 서버가 연결되지 않았어요. config.js에 프로젝트 설정을 입력해 주세요.';
    body.innerHTML=`<div class="desc">${guide}</div>`; syncStatus(''); return;
  }
  if(sbUser){
    const deleteArea=accountDeleteOpen
      ? `<div class="sm-delete-confirm"><b>계정과 서버의 암호화 보관함을 지울까요?</b><span>이 기기의 책과 단어장은 그대로 남습니다. 계속하려면 DELETE를 입력하세요.</span><input id="sm-delete-input" autocomplete="off" spellcheck="false" placeholder="DELETE"><div><button class="sm-reset" onclick="cancelAccountDelete()">취소</button><button class="sm-mini danger" onclick="confirmAccountDelete()">계정 지우기</button></div>${accountDeleteError?`<small class="sm-vault-error">${esc(accountDeleteError)}</small>`:''}</div>`
      : `<button class="sm-linkish" onclick="openAccountDelete()">계정 지우기</button>`;
    body.innerHTML=`<div class="sm-account"><b>${esc(sbUser.email||'')}</b><span>마지막 동기화 · ${lastSync?new Date(lastSync).toLocaleString('ko-KR'):'아직 없음'}</span></div>
      ${recoveryPanel()}
      <button class="sm-btn primary" onclick="doSync(true)">지금 동기화</button>
      <button class="sm-btn ghost" onclick="sbLogout()">로그아웃 (이 기기에서만)</button>
      ${deleteArea}`;
  }else{
    body.innerHTML=`<div class="desc">이메일을 입력하면 <b>로그인 링크</b>를 보내드려요.
      비밀번호는 없습니다. 로그인하면 단어장이 기기 간에 암호화되어 동기화됩니다.</div>
      <input id="sm-email" type="email" placeholder="you@example.com" autocomplete="email">
      <button class="sm-btn primary" onclick="sbSendLink()">로그인 링크 보내기</button>
      <div id="sm-codewrap"><div class="hint">메일에 온 <b>6자리 코드</b>를 입력해도 로그인돼요</div>
      <input id="sm-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······">
      <button class="sm-btn ghost" onclick="sbVerifyCode()">코드로 로그인</button></div>`;
  }
  syncStatus('');
}

async function sbSendLink(){
  const email=(syncInput('sm-email').value||'').trim();
  if(!/.+@.+\..+/.test(email)){ syncStatus('이메일 형식을 확인해 주세요'); return; }
  const native=isNativeShell(); syncStatus(native?'코드 보내는 중…':'링크 보내는 중…');
  const options=native?{}:{emailRedirectTo:location.origin+location.pathname};
  const result=await sb.auth.signInWithOtp({email,options});
  if(result.error){ syncStatus('전송 실패: '+result.error.message); return; }
  syncStatus(native?'메일로 6자리 코드를 보냈어요.':'메일을 보냈어요. 링크를 누르거나 코드를 입력하세요.');
  const wrap=document.getElementById('sm-codewrap'); if(wrap){ wrap.style.display='block'; document.getElementById('sm-code').focus(); }
}
async function sbVerifyCode(){
  const email=(syncInput('sm-email').value||'').trim();
  const token=(syncInput('sm-code').value||'').replace(/[\s-]/g,'').trim();
  if(!/^\d{6}$/.test(token)){ syncStatus('6자리 숫자 코드를 입력해 주세요'); return; }
  syncStatus('코드 확인 중…');
  const result=await sb.auth.verifyOtp({email,token,type:'email'});
  if(result.error) syncStatus('코드 확인 실패: '+result.error.message);
}
document.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target===document.getElementById('sm-code')){ event.preventDefault(); sbVerifyCode(); }
});
async function sbLogout(){
  await sb.auth.signOut({scope:'local'});
  sbUser=null; serverBooks=[]; vaultMaster=null; vaultMeta=null; vaultRemoteItems=[]; pendingRecoveryKey='';
  syncBadge(); renderSyncModal(); renderAllBookViews();
}
function openAccountDelete(){ accountDeleteOpen=true; accountDeleteError=''; renderSyncModal(); }
function cancelAccountDelete(){ accountDeleteOpen=false; accountDeleteError=''; renderSyncModal(); }
async function confirmAccountDelete(){
  if(!sb||!sbUser) return;
  const typed=(syncInput('sm-delete-input').value||'').trim();
  if(typed!=='DELETE'){ accountDeleteError='DELETE를 정확히 입력해 주세요.'; renderSyncModal(); return; }
  syncStatus('계정을 지우는 중…');
  try{
    const answer=await dictCall({op:'delete_account'});
    if(!answer||!answer.ok) throw new Error((answer&&(answer.message||answer.error))||'서버가 응답하지 않았어요');
    try{ await sb.auth.signOut({scope:'local'}); }catch(error){}
    sbUser=null; serverBooks=[]; vaultMaster=null; vaultMeta=null; vaultRemoteItems=[]; pendingRecoveryKey=''; accountDeleteOpen=false;
    lastSync=0; save('breeze.lastsync',0); syncBadge(); renderSyncModal(); renderAllBookViews();
    syncStatus('계정을 지웠어요. 이 기기의 자료는 그대로 있어요.');
  }catch(error){ accountDeleteError='계정을 지우지 못했어요: '+(error.message||error); renderSyncModal(); }
}

function toggleVaultInfo(){ vaultInfoOpen=!vaultInfoOpen; renderSyncModal(); }
function finishRecoverySave(){ pendingRecoveryKey=''; renderSyncModal(); }
function openRecoveryRotate(){ recoveryRotateOpen=true; renderSyncModal(); }
function cancelRecoveryRotate(){ recoveryRotateOpen=false; renderSyncModal(); }
async function confirmRecoveryRotate(){
  recoveryRotateOpen=false;
  try{ await makeRecoveryWrap(vaultMaster); renderSyncModal(); }
  catch(error){ syncStatus('새 복구키를 만들지 못했어요'); }
}
async function copyRecoveryKey(){
  if(!pendingRecoveryKey) return;
  try{ await navigator.clipboard.writeText(pendingRecoveryKey); syncStatus('복구키를 복사했어요'); }
  catch(error){ syncStatus('길게 눌러 복사해 주세요'); }
}
function recoveryFile(){
  return new File([pendingRecoveryKey+'\n'],`Breeze-Recovery-Key-${new Date().toISOString().slice(0,10)}.txt`,{type:'text/plain'});
}
async function saveRecoveryFile(){
  if(!pendingRecoveryKey) return;
  const file=recoveryFile();
  try{
    if(window.showSaveFilePicker){
      const handle=await window.showSaveFilePicker({suggestedName:file.name,types:[{description:'Breeze 복구키',accept:{'text/plain':['.txt']}}]});
      const writable=await handle.createWritable(); await writable.write(file); await writable.close();
    }else{
      const url=URL.createObjectURL(file),a=document.createElement('a'); a.href=url; a.download=file.name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    syncStatus('복구키 저장 위치를 확인해 주세요');
  }catch(error){ if(error.name!=='AbortError') syncStatus('파일로 저장하지 못했어요'); }
}
async function shareRecoveryKey(){
  if(!pendingRecoveryKey) return;
  const file=recoveryFile();
  try{
    if(navigator.share){
      const files=navigator.canShare&&navigator.canShare({files:[file]})?[file]:undefined;
      await navigator.share({title:'Breeze 복구키',text:files?'Breeze 단어 보관함 복구키':pendingRecoveryKey,files});
    }else await saveRecoveryFile();
  }catch(error){ if(error.name!=='AbortError') syncStatus('공유하지 못했어요'); }
}
function pickRecoveryFile(){ document.getElementById('recovery-fileinput').click(); }
async function restoreRecoveryKey(){
  const input=syncInput('sm-recovery-input');
  try{
    const recovery=VaultCrypto.recoveryDecode((input&&input.value)||'');
    const master=await VaultCrypto.openBytes(recovery,vaultMeta.recoveryWrap,
      [sbUser.id,vaultMeta.vaultId,'recovery'],'breeze/recovery/v2');
    await saveMasterForDevice(master); vaultRecoveryError=''; renderSyncModal(); await doSync(true);
  }catch(error){ vaultRecoveryError='복구키가 맞지 않아요. 공백과 하이픈은 상관없습니다.'; renderSyncModal(); }
}
document.getElementById('recovery-fileinput').addEventListener('change',async event=>{
  const target=/** @type {HTMLInputElement} */(event.currentTarget),file=target.files[0]; target.value=''; if(!file) return;
  const input=syncInput('sm-recovery-input');
  if(input){ input.value=(await file.text()).trim(); await restoreRecoveryKey(); }
});

function pairingUrl(id){
  const url=new URL(location.href); url.search=''; url.hash=''; url.searchParams.set('breeze_pair',id); return url.href;
}
async function paintPairingQr(){
  if(!pendingPair) return;
  try{
    await ensureQrLib(); const image=/** @type {HTMLImageElement} */(document.getElementById('sm-pair-qr')); if(!image) return;
    const qr=qrcode(0,'M'); qr.addData(pairingUrl(pendingPair.id)); qr.make(); image.src=qr.createDataURL(5,2);
  }catch(error){ pairingError='QR을 만들지 못했어요. 아래 코드를 사용해 주세요.'; renderSyncModal(); }
}
async function startDevicePairing(){
  if(!sbUser||vaultMaster) return;
  pairingError='';
  try{
    /* 만료된 일회용 연결 요청은 같은 사용자가 새 연결을 시작할 때 정리합니다. */
    await sb.from('sync_pairings').delete().eq('user_id',sbUser.id).lt('expires_at',new Date().toISOString());
    const pair=await VaultCrypto.pairingCreate(),id=VaultCrypto.uuid();
    const salt=VaultCrypto.random(16),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
    const row={id,user_id:sbUser.id,code,request_pub:pair.publicJwk,request_salt:VaultCrypto.b64(salt),
      status:'waiting',expires_at:new Date(Date.now()+10*60*1000).toISOString()};
    const inserted=await sb.from('sync_pairings').insert(row); if(inserted.error) throw inserted.error;
    pendingPair={id,code,privateKey:pair.privateKey,salt}; renderSyncModal(); paintPairingQr();
    clearInterval(pairingPoll); pairingPoll=setInterval(checkDevicePairing,1500);
  }catch(error){ pairingError=String(error.message||error).includes('sync_pairings')
    ?'기기 연결용 서버 설정이 아직 필요해요. 지금은 복구키를 사용해 주세요.':'기기 연결을 시작하지 못했어요.'; renderSyncModal(); }
}
async function checkDevicePairing(){
  if(!pendingPair||!sbUser) return;
  const result=await sb.from('sync_pairings').select('*').eq('id',pendingPair.id).maybeSingle();
  if(result.error||!result.data) return;
  const row=result.data; if(row.status!=='ready'||!row.response_pub||!row.wrapped_key) return;
  try{
    const key=await VaultCrypto.pairingKey(pendingPair.privateKey,row.response_pub,pendingPair.salt,'breeze/pair/v2');
    const master=await VaultCrypto.pairingOpen(key,row.wrapped_key,[sbUser.id,row.id,'pair']);
    await saveMasterForDevice(master); await sb.from('sync_pairings').delete().eq('id',row.id);
    clearInterval(pairingPoll); pairingPoll=null; pendingPair=null; pairingError=''; renderSyncModal(); await doSync(true);
  }catch(error){ pairingError='연결 응답을 확인하지 못했어요. 다시 시도해 주세요.'; renderSyncModal(); }
}
async function cancelDevicePairing(){
  clearInterval(pairingPoll); pairingPoll=null;
  if(pendingPair&&sbUser) await sb.from('sync_pairings').delete().eq('id',pendingPair.id);
  pendingPair=null; pairingError=''; renderSyncModal();
}
async function approvePairing(row){
  if(!vaultMaster||!row||row.user_id!==sbUser.id||new Date(row.expires_at).getTime()<Date.now()) throw new Error('만료된 연결 요청이에요');
  const pair=await VaultCrypto.pairingCreate(),salt=VaultCrypto.unb64(row.request_salt);
  const key=await VaultCrypto.pairingKey(pair.privateKey,row.request_pub,salt,'breeze/pair/v2');
  const wrapped=await VaultCrypto.pairingSeal(key,vaultMaster,[sbUser.id,row.id,'pair']);
  const updated=await sb.from('sync_pairings').update({response_pub:pair.publicJwk,wrapped_key:wrapped,status:'ready'}).eq('id',row.id);
  if(updated.error) throw updated.error;
}
async function approvePairingCode(){
  const input=syncInput('sm-pair-code'),code=(input&&input.value||'').replace(/\D/g,'');
  if(!/^\d{6}$/.test(code)){ syncStatus('6자리 연결 코드를 입력해 주세요'); return; }
  try{
    const result=await sb.from('sync_pairings').select('*').eq('user_id',sbUser.id).eq('code',code).eq('status','waiting').maybeSingle();
    if(result.error||!result.data) throw new Error('연결 요청을 찾지 못했어요');
    await approvePairing(result.data); syncStatus('새 기기에 열쇠를 보냈어요'); if(input) input.value='';
  }catch(error){ syncStatus(error.message||'코드 연결에 실패했어요'); }
}
async function approvePairingFromUrl(){
  if(!sbUser||!vaultMaster) return;
  const id=new URL(location.href).searchParams.get('breeze_pair'); if(!id) return;
  try{
    const result=await sb.from('sync_pairings').select('*').eq('id',id).maybeSingle();
    if(result.error||!result.data) throw new Error('연결 요청을 찾지 못했어요');
    await approvePairing(result.data); miniToast('새 기기를 승인했어요');
  }catch(error){ miniToast(error.message||'기기 연결에 실패했어요'); }
  history.replaceState(null,'',location.pathname+location.hash);
}

function hiddenBookIds(){ return load(LS_HIDDEN,{}); }
function hideBookLocally(id){ const hidden=hiddenBookIds(); hidden[id]=Date.now(); save(LS_HIDDEN,hidden); }
function unhideBookLocally(id){ const hidden=hiddenBookIds(); if(hidden[id]===undefined) return; delete hidden[id]; save(LS_HIDDEN,hidden); }
function activeServerBooks(){ return serverBooks||[]; }
function serverBookIdFor(book){
  const match=activeServerBooks().find(row=>(row.meta||{}).localId===book.id);
  return match?match.book_id:book.id;
}
function queueSync(){
  if(!sb||!sbUser) return;
  save(VAULT_LOCAL_CHANGED,Date.now()); clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>doSync(false),4000);
}
/* 책을 읽는 동안 위치는 자주 바뀌지만, 매 손가락 움직임마다 서버를 부를 이유는
   없습니다. 25초마다 한 번이면 다른 기기로 옮겨 읽기에 충분히 빠르고 배터리도
   덜 씁니다. 앱을 숨길 때는 아래 visibilitychange가 이 대기열을 건너뛰고 즉시
   보냅니다. */
function queueReadingProgressSync(){
  if(!sb||!sbUser) return;
  const wait=Math.max(0,25000-(Date.now()-lastProgressSyncAt));
  clearTimeout(progressSyncTimer);
  progressSyncTimer=setTimeout(()=>{
    progressSyncTimer=null; lastProgressSyncAt=Date.now(); queueSync();
  },wait);
}
const upOf=word=>word?(word.up||word.addedAt||0):0;
function doSync(manual){
  if(!sb||!sbUser) return Promise.resolve(false);
  if(syncPromise){ syncAgain=true; syncAgainManual=syncAgainManual||!!manual; return syncPromise; }
  syncPromise=(async()=>{
    let nextManual=!!manual;
    do{
      syncAgain=false; const passManual=nextManual||syncAgainManual; syncAgainManual=false;
      await runSyncPass(passManual); nextManual=false;
    }while(syncAgain&&sb&&sbUser);
    return true;
  })().finally(()=>{ syncPromise=null; });
  return syncPromise;
}
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
  const rawHash=original.hash||book.sourceHash||'',position=safePosition(positions[book.id]);
  return {id:book.id,title:book.title||'(제목 없음)',author:book.author||'',kind:book.kind||'',site:book.site||'',
    sourceUrl:book.sourceUrl||'',classicId:book.classicId||'',identity:await vaultSourceIdentity(book,rawHash),originalKind:original.kind||'',
    fileSize:Number(original.size||book.sourceSize)||0,fileModified:Number(original.lastModified||book.sourceModified)||0,addedAt:book.addedAt||Date.now(),
    updatedAt:Math.max(book.renamedAt||0,book.coverUpdatedAt||0,position&&position.t||0,book.addedAt||0),position};
}
function itemIdentity(item){
  return item.identity||'id:'+item.id;
}
function mergeWordState(remoteWords,remoteDead){
  const all=new Set([...Object.keys(remoteWords||{}),...Object.keys(remoteDead||{}),...Object.keys(words),...Object.keys(dead)]);
  for(const key of all){
    const rw=(remoteWords||{})[key],rd=(remoteDead||{})[key]||0,lw=words[key],ld=dead[key]||0;
    const newest=Math.max(upOf(rw),rd,upOf(lw),ld);
    if(newest===rd||newest===ld){ delete words[key]; dead[key]=newest; }
    else if(newest===upOf(rw)){ words[key]=rw; delete dead[key]; }
  }
}
async function mergeVaultPayload(remote,legacyItems){
  if(remote) mergeWordState(remote.words||{},remote.dead||{});
  const map=new Map();
  [...(remote&&remote.items||[]),...(legacyItems||[]),...vaultRemoteItems].forEach(item=>{
    if(!item) return; const key=itemIdentity(item),old=map.get(key);
    if(!old||(item.updatedAt||0)>=(old.updatedAt||0)) map.set(key,item);
  });
  const localByIdentity=new Map();
  for(const book of books){
    if(book.sampleId) continue;
    const item=await localVaultItem(book),key=itemIdentity(item),old=map.get(key);
    if(!old||(item.updatedAt||0)>=(old.updatedAt||0)) map.set(key,item);
    localByIdentity.set(item.identity,book);
  }
  vaultRemoteItems=[...map.values()];
  serverBooks=vaultRemoteItems.map(item=>{
    const local=localByIdentity.get(item.identity)||books.find(book=>book.id===item.id);
    return {book_id:item.id,meta:{...item,localId:local?local.id:''}};
  });
  for(const item of vaultRemoteItems){
    const local=localByIdentity.get(item.identity)||books.find(book=>book.id===item.id);
    if(!local||!item.position) continue;
    const current=positions[local.id],active=curBook&&curBook.id===local.id&&document.getElementById('v-read').classList.contains('on');
    if(!active&&(!current||(item.position.t||0)>(current.t||0))) positions[local.id]=item.position;
  }
}
async function readLegacyData(rows){
  const legacyWords={},legacyDead={},items=[];
  (rows||[]).forEach(row=>{
    if(row.key===VAULT_ROW||row.key===VAULT_META_ROW) return;
    const value=row.data||{}; if(value.deleted) legacyDead[row.key]=value.up||Date.now(); else legacyWords[row.key]=value;
  });
  mergeWordState(legacyWords,legacyDead);
  try{
    const booksResult=await sb.from('books').select('book_id,meta').eq('user_id',sbUser.id);
    if(!booksResult.error) (booksResult.data||[]).forEach(row=>{
      const meta=row.meta||{}; if(meta.deleted) return;
      items.push({id:row.book_id,title:meta.title||'(제목 없음)',author:meta.author||'',kind:meta.kind||'',
        identity:'legacy:'+row.book_id,addedAt:meta.addedAt||0,updatedAt:meta.renamedAt||meta.addedAt||0,position:null});
    });
    const positionsResult=await sb.from('positions').select('book_id,data').eq('user_id',sbUser.id);
    if(!positionsResult.error) (positionsResult.data||[]).forEach(row=>{
      const item=items.find(one=>one.id===row.book_id);
      if(item){ item.position=safePosition(row.data); item.updatedAt=Math.max(item.updatedAt,item.position&&item.position.t||0); }
    });
  }catch(error){ console.warn('옛 동기화 메타데이터 이전을 건너뛰었어요:',error); }
  return items;
}
async function cleanLegacyServer(rows){
  if(vaultMeta&&vaultMeta.legacyCleanedAt) return;
  const legacyKeys=(rows||[]).map(row=>row.key).filter(key=>key!==VAULT_ROW&&key!==VAULT_META_ROW);
  if(legacyKeys.length){
    const removed=await sb.from('words').delete().eq('user_id',sbUser.id).in('key',legacyKeys);
    if(removed.error) throw removed.error;
  }
  const positionsRemoved=await sb.from('positions').delete().eq('user_id',sbUser.id);
  if(positionsRemoved.error) throw positionsRemoved.error;
  const booksRemoved=await sb.from('books').delete().eq('user_id',sbUser.id);
  if(booksRemoved.error) throw booksRemoved.error;
  const listed=await sb.storage.from('books').list(sbUser.id,{limit:1000});
  if(!listed.error&&listed.data&&listed.data.length){
    const removed=await sb.storage.from('books').remove(listed.data.map(file=>`${sbUser.id}/${file.name}`));
    if(removed.error) throw removed.error;
  }
  vaultMeta={...vaultMeta,legacyCleanedAt:Date.now()};
  const saved=await sb.from('words').upsert([{user_id:sbUser.id,key:VAULT_META_ROW,data:vaultMeta}],{onConflict:'user_id,key'});
  if(saved.error) throw saved.error;
}
async function purgePrivateDictionaryLogs(){
  const flag=`breeze.private-logs-purged:${sbUser.id}`;
  if(load(flag,false)) return;
  try{ const answer=await dictCall({op:'purge_private_logs'}); if(answer&&answer.ok) save(flag,true); }
  catch(error){}
}
async function runSyncPass(manual){
  if(manual) syncStatus('암호화해 동기화하는 중…');
  try{
    const master=await ensureVaultReady();
    if(!master){ if(manual){ renderSyncModal(); syncStatus('복구키로 보관함을 먼저 열어 주세요'); } return; }
    await approvePairingFromUrl();
    const rowsResult=await sb.from('words').select('key,data').eq('user_id',sbUser.id);
    if(rowsResult.error) throw rowsResult.error;
    const rows=rowsResult.data||[],vaultRow=rows.find(row=>row.key===VAULT_ROW);
    let remote=null;
    if(vaultRow&&vaultRow.data&&vaultRow.data.envelope){
      remote=await VaultCrypto.openJson(master,vaultRow.data.envelope,
        [sbUser.id,vaultMeta.vaultId,'snapshot'],'breeze/vault/v2');
    }
    const legacyItems=await readLegacyData(rows);
    await mergeVaultPayload(remote,legacyItems);
    const payload={v:2,updatedAt:Date.now(),deviceId:vaultDeviceId(),words,dead,items:vaultRemoteItems};
    const envelope=await VaultCrypto.sealJson(master,payload,[sbUser.id,vaultMeta.vaultId,'snapshot'],'breeze/vault/v2');
    const saved=await sb.from('words').upsert(
      [{user_id:sbUser.id,key:VAULT_ROW,data:{v:2,updatedAt:payload.updatedAt,envelope}}],{onConflict:'user_id,key'});
    if(saved.error) throw saved.error;
    await cleanLegacyServer(rows);
    await purgePrivateDictionaryLogs();
    saveWords(); save(LS_DEAD,dead); save(LS_POS,positions); save(VAULT_LOCAL_CHANGED,0);
    lastSync=Date.now(); save('breeze.lastsync',lastSync);
    if(manual){ renderSyncModal(); syncStatus('암호화 동기화를 마쳤어요'); }
    else miniToast(pendingRecoveryKey?'복구키를 저장해 주세요':'Auto-synced');
    renderAllBookViews();
    if(typeof restoreMissingVaultArticles==='function') restoreMissingVaultArticles();
    if(document.getElementById('v-vocab').classList.contains('on')) renderVocab();
  }catch(error){
    console.error(error); if(manual) syncStatus('동기화 실패: '+(error.message||error));
  }
}

/* 읽기자료 백업은 Breeze 서버를 거치지 않습니다. 각 항목을 현재 보관함 키로
   암호화한 뒤 ZIP으로 묶어 사용자가 고른 Files/Drive 위치에 저장합니다. */
async function exportReadingBackup(){
  if(!vaultMaster){ syncStatus('먼저 단어 보관함을 열어 주세요'); return; }
  syncStatus('읽기자료를 암호화하는 중…');
  try{
    await ensureZipLib(); const zip=new JSZip(),manifest={v:1,createdAt:Date.now(),books:[],positions:[],originals:[],images:[]};
    for(const book of books){
      const envelope=await VaultCrypto.sealJson(vaultMaster,book,[sbUser.id,'backup','book',book.id],'breeze/backup/v1');
      manifest.books.push({id:book.id,envelope});
      const position=safePosition(positions[book.id]);
      if(position&&position.t){
        const positionEnvelope=await VaultCrypto.sealJson(vaultMaster,position,[sbUser.id,'backup','position',book.id],'breeze/backup/v1');
        manifest.positions.push({id:book.id,envelope:positionEnvelope});
      }
    }
    for(const entry of await originalEntries()){
      const key=String(entry[0]),record=entry[1]||{},blob=record.blob;
      if(!blob) continue;
      const envelope=await VaultCrypto.sealBytes(vaultMaster,await blob.arrayBuffer(),[sbUser.id,'backup','original',key],'breeze/backup/v1');
      manifest.originals.push({key,meta:{...record,blob:undefined},envelope});
    }
    for(const entry of await imgEntries()){
      const key=String(entry[0]),blob=entry[1]; if(!(blob instanceof Blob)) continue;
      const envelope=await VaultCrypto.sealBytes(vaultMaster,await blob.arrayBuffer(),[sbUser.id,'backup','image',key],'breeze/backup/v1');
      manifest.images.push({key,type:blob.type||'application/octet-stream',envelope});
    }
    zip.file('breeze-backup.json',JSON.stringify(manifest));
    const file=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
    const name=`Breeze-Books-${new Date().toISOString().slice(0,10)}.breeze.zip`;
    const url=URL.createObjectURL(file),a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    syncStatus('암호화 백업 파일을 만들었어요');
  }catch(error){ console.error(error); syncStatus('백업을 만들지 못했어요: '+(error.message||error)); }
}
function pickReadingBackup(){ document.getElementById('reading-backup-input').click(); }

/* 백업은 책 ID가 아니라 원본 파일 자체가 같은지를 우선 봅니다. 아주 초기 버전의
   PDF/EPUB 카드는 본문 기반 ID를, 지금 카드는 파일 SHA-256 기반 ID를 가질 수
   있습니다. ID만 비교하면 같은 Scythe가 두 권이 됩니다. */
function backupOriginalHash(book, meta){
  return String((book&&book.sourceHash)||(book&&book.original&&book.original.hash)||(meta&&meta.hash)||'');
}
function remapBackupAssetKey(key, aliases){
  const value=String(key||'');
  for(const [from,to] of aliases){
    if(value===from || value.startsWith(from+'|')) return to+value.slice(from.length);
  }
  return value;
}
function remapBackupBookAssets(book, aliases){
  const copy={...book};
  copy.cover=remapBackupAssetKey(copy.cover,aliases)||null;
  if(Array.isArray(copy.paras)) copy.paras=copy.paras.map(paragraph=>
    paragraph.startsWith(IMG_MARK)
      ? IMG_MARK+remapBackupAssetKey(paragraph.slice(IMG_MARK.length),aliases)
      : paragraph);
  return copy;
}
function backupFieldTime(book, field){
  if(field==='title') return Number(book&&book.renamedAt||book&&book.addedAt||0);
  if(field==='cover') return Number(book&&book.coverUpdatedAt||book&&book.addedAt||0);
  return 0;
}
function mergeBackupBook(existing, incoming, aliases){
  const imported=remapBackupBookAssets(incoming,aliases);
  const merged={...existing,...imported,id:existing.id};
  /* 읽었다는 시간은 표지·제목을 고친 시간과 관계없습니다. 각각 마지막으로
     손댄 쪽만 남겨야, 다른 기기에서 읽었다고 내 표지가 되돌아가지 않습니다. */
  if(backupFieldTime(existing,'title')>backupFieldTime(imported,'title')){
    merged.title=existing.title; merged.renamedAt=existing.renamedAt;
  }
  if(backupFieldTime(existing,'cover')>backupFieldTime(imported,'cover')){
    merged.cover=existing.cover; merged.coverUpdatedAt=existing.coverUpdatedAt;
  }
  return merged;
}
async function preserveRemappedCover(source, merged, aliases){
  const from=String(source&&source.cover||''),to=remapBackupAssetKey(from,aliases);
  if(!from||from===to||merged.cover!==to) return;
  const blob=await imgGet(from); if(blob) await imgPut(to,blob);
}
async function importReadingBackup(file){
  if(!file||!vaultMaster) return;
  syncStatus('백업 파일을 여는 중…');
  try{
    await ensureZipLib(); const zip=await JSZip.loadAsync(await file.arrayBuffer());
    const packed=zip.file('breeze-backup.json'); if(!packed) throw new Error('Breeze 백업 파일이 아니에요');
    const manifest=JSON.parse(await packed.async('text')); if(manifest.v!==1) throw new Error('지원하지 않는 백업 형식이에요');
    const originalMeta=new Map((manifest.originals||[]).map(item=>[String(item.key),item.meta||{}]));
    const existingByHash=new Map(),aliases=new Map();
    for(const current of books){
      let hash=backupOriginalHash(current);
      if(!hash){ const original=await originalGetForBook(current); hash=backupOriginalHash(current,original); }
      if(!hash){ continue; }
      const previous=existingByHash.get(hash);
      if(!previous || previous.id===current.id){ existingByHash.set(hash,current); continue; }
      /* 이미 이 기기에 남아 있던 구형 ID와 새 파일 ID도 여기서 하나로 접습니다.
         파일 ID를 우선해 다음 가져오기·동기화 때 다시 갈라지지 않게 합니다. */
      const keep=current.id.startsWith('file-') ? current : previous;
      const drop=keep===current ? previous : current;
      aliases.set(drop.id,keep.id);
      if((positions[drop.id]&&positions[drop.id].t||0)>(positions[keep.id]&&positions[keep.id].t||0)) positions[keep.id]=positions[drop.id];
      delete positions[drop.id];
      const merged=mergeBackupBook(keep,drop,aliases);
      await preserveRemappedCover(drop,merged,aliases);
      await bookPut(merged); books=books.filter(book=>book.id!==keep.id&&book.id!==drop.id); books.push(merged); await bookDel(drop.id);
      existingByHash.set(hash,merged);
    }
    /* 예전 ID → 이 기기의 ID. 뒤에 원본·표지를 넣을 때도 같은 새 키를 씁니다. */
    for(const item of manifest.books||[]){
      const book=await VaultCrypto.openJson(vaultMaster,item.envelope,[sbUser.id,'backup','book',item.id],'breeze/backup/v1');
      const hash=backupOriginalHash(book,originalMeta.get(String(item.id)));
      const same=hash&&existingByHash.get(hash);
      if(same&&same.id!==book.id){
        aliases.set(book.id,same.id);
        const merged=mergeBackupBook(same,book,aliases);
        await bookPut(merged); books=books.filter(one=>one.id!==same.id); books.push(merged);
        existingByHash.set(hash,merged);
      }else{
        await bookPut(book); books=books.filter(one=>one.id!==book.id); books.push(book);
        if(hash) existingByHash.set(hash,book);
      }
    }
    for(const item of manifest.originals||[]){
      const bytes=await VaultCrypto.openBytes(vaultMaster,item.envelope,[sbUser.id,'backup','original',item.key],'breeze/backup/v1');
      const key=remapBackupAssetKey(item.key,aliases);
      await originalPut(key,{...(item.meta||{}),blob:new Blob([bytes],{type:(item.meta&&item.meta.type)||'application/octet-stream'})});
    }
    for(const item of manifest.images||[]){
      const bytes=await VaultCrypto.openBytes(vaultMaster,item.envelope,[sbUser.id,'backup','image',item.key],'breeze/backup/v1');
      const key=remapBackupAssetKey(item.key,aliases);
      await imgPut(key,new Blob([bytes],{type:item.type||'application/octet-stream'}));
    }
    for(const item of manifest.positions||[]){
      const imported=safePosition(await VaultCrypto.openJson(vaultMaster,item.envelope,[sbUser.id,'backup','position',item.id],'breeze/backup/v1'));
      const id=aliases.get(item.id)||item.id,current=positions[id];
      if(imported&&(!current||(imported.t||0)>(current.t||0))) positions[id]=imported;
    }
    save(LS_POS,positions);
    books.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0)); renderAllBookViews(); queueSync();
    syncStatus('읽기자료를 이 기기에 불러왔어요');
  }catch(error){ console.error(error); syncStatus('백업을 열지 못했어요. 같은 계정의 복구키인지 확인해 주세요.'); }
}
document.getElementById('reading-backup-input').addEventListener('change',event=>{
  const target=/** @type {HTMLInputElement} */(event.currentTarget),file=target.files[0]; target.value=''; if(file) importReadingBackup(file);
});

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
  const accept=session=>{
    /* 서버가 세션을 주지 않았어도 이 기기에 남아 있으면 그것이 지금의 사실입니다. */
    const next=session?session.user:storedAuthUser();
    if(!next||(sbUser&&sbUser.id!==next.id)){ vaultMaster=null; vaultMeta=null; vaultRemoteItems=[]; serverBooks=[]; }
    sbUser=next; syncBadge();
    if(typeof selKey!=='undefined'&&selKey&&typeof renderPanel==='function') renderPanel();
    if(sbUser) doSync(false);
    if(document.getElementById('settings-modal').classList.contains('on')) renderSyncModal();
  };
  /* 부팅하는 그 자리에서 한 번. `getSession()` 이 오프라인에서 돌아오지 않아도
     로그인 상태는 이미 서 있습니다. */
  accept(null);
  sb.auth.onAuthStateChange((_event,session)=>accept(session));
  sb.auth.getSession().then(({data:{session}})=>accept(session));
}
initSupabase();
document.addEventListener('visibilitychange',()=>{
  if(!sb||!sbUser) return; clearTimeout(syncTimer);
  if(document.hidden&&curBook&&typeof scrollTick!=='undefined'&&scrollTick){ clearTimeout(scrollTick); scrollTick=null; saveReadingState(); }
  doSync(false);
});
setInterval(()=>{ if(sb&&sbUser&&!document.hidden) doSync(false); },3*60*1000);
