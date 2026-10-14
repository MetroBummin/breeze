/* 잠든 코드입니다. 앱은 이 파일을 읽지 않고, 네이티브 묶음에도 넣지 않습니다.
   index.html 의 script 로 추가하지 마세요. 호출되면 숨은 입력칸을 찾고,
   그 칸은 페이지에 없습니다.
   무엇을 하던 코드인지, 왜 잠들었는지, 어떻게 되돌리는지는 같은 폴더의 README.md 에 있습니다.
   아래 묶음은 일부러 호출하지 않습니다. 되돌릴 때는 안의 선언과 함수만
   scripts/sync/sync.js 로 옮기세요. */

/* resetSyncSession 안에 있던 줄입니다. 함수 전체를 덮어쓰지 말고 그 함수 안에 다시 넣으세요.
     clearTimeout(syncTimer); clearTimeout(progressSyncTimer); clearInterval(pairingPoll);
     syncTimer=null; progressSyncTimer=null; pairingPoll=null; pendingPair=null;
     pendingRecoveryKey=''; lastProgressSyncAt=0; noteSyncSuccess();
*/

void function BreezeDormantSyncArchive(){
'use strict';
let pendingRecoveryKey='', vaultInfoOpen=false, vaultRecoveryError='', recoveryRotateOpen=false;
let pendingPair=null, pairingPoll=null, pairingError='';

function syncRowVersion(data){ return String(data&&(data.revision||data.updatedAt)||''); }
function vaultSyncState(data){
  const state=data&&data.sync||vaultMeta||{};
  return {legacyCleanedAt:state.legacyCleanedAt,legacyMigratedAt:state.legacyMigratedAt,
    legacyAudit:state.legacyAudit,progressSeparatedAt:state.progressSeparatedAt};
}

function vaultNeedsRepair(remote,syncedWords){
  return !remote||syncStableJson(remote.words||{})!==syncStableJson(syncedWords)
    ||syncStableJson(remote.dead||{})!==syncStableJson(dead);
}

async function saveMasterForDevice(master){
  const session=syncSession(),device=vaultDeviceId(),name=vaultKeyName('device');
  const made=await VaultCrypto.createDeviceWrap(master,[session.userId,device,'device']);
  assertSyncSession(session);
  await vaultPut(name,{key:made.key,wrap:made.wrap});
  assertSyncSession(session); vaultMaster=VaultCrypto.bytes(master);
}

async function makeRecoveryWrap(master){
  const session=syncSession();
  const recovery=VaultCrypto.random(32);
  const vaultId=(vaultMeta&&vaultMeta.vaultId)||VaultCrypto.uuid();
  const recoveryWrap=await VaultCrypto.sealBytes(
    recovery,master,[session.userId,vaultId,'recovery'],'breeze/recovery/v2');
  assertSyncSession(session);
  const meta={...(vaultMeta||{}),v:2,vaultId,recoveryWrap,rotatedAt:Date.now()};
  const saved=await sb.from('words').upsert(
    [{user_id:session.userId,key:VAULT_META_ROW,data:meta}],{onConflict:'user_id,key'});
  assertSyncSession(session);
  if(saved.error) throw saved.error;
  vaultMeta=meta;
  pendingRecoveryKey=VaultCrypto.recoveryEncode(recovery);
  return pendingRecoveryKey;
}
async function ensureVaultReady(){
  const session=syncSession();
  await fetchVaultMeta(); assertSyncSession(session);
  let master=await loadMasterForDevice(); assertSyncSession(session);
  if(master) return master;
  if(vaultMeta) return null;
  master=VaultCrypto.random(32);
  await saveMasterForDevice(master); assertSyncSession(session);
  await makeRecoveryWrap(master); assertSyncSession(session);
  return master;
}

function closeSyncModal(){ closeSettings(); }

function recoveryPanel(){
  if(vaultMeta&&!vaultMaster){
    const pairing=pendingPair
      ? `<div class="sm-pair-box"><img id="sm-pair-qr" alt="이전 기기로 스캔할 QR"><b>${esc(pendingPair.code)}</b><span>이전 기기에서 QR을 스캔하거나 이 코드를 입력하세요.</span></div>
         <button class="sm-reset" onclick="cancelDevicePairing()">연결 취소</button>`
      : `<button class="sm-pair-start" onclick="startDevicePairing()">이전 기기로 연결</button>`;
    return `<section class="sm-vault locked"><div class="sm-vault-head"><div><span class="sm-vault-kicker">END-TO-END ENCRYPTED</span><b>단어 보관함이 잠겨 있어요</b></div><button class="sm-info" onclick="toggleVaultInfo()" aria-label="암호화 설명">i</button></div>
      ${vaultInfoOpen?'<div class="sm-vault-info">이 기기에는 열쇠가 없어요. 저장해 둔 복구키를 입력하면 단어장을 되찾을 수 있어요.</div>':''}
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
    ${vaultInfoOpen?'<div class="sm-vault-info">단어·숙어·뜻·예문을 기기에서 암호화해 동기화해요. 책과 읽던 위치는 이 기기에만 남습니다. Breeze는 복호화 키를 보유하지 않습니다.</div>':''}
    <p>${pendingRecoveryKey?'기기를 잃어도 단어장을 되찾을 수 있도록 복구키를 안전한 곳에 저장해 주세요.':'이 기기의 열쇠로 자동 동기화하고 있어요. 이전에 저장한 복구키는 앱에서 다시 표시되지 않습니다.'}</p>${recovery}
    <details class="sm-fold"><summary><b>다른 기기 연결</b><span>6자리 코드 또는 QR</span></summary><div class="sm-device-move"><span>새 기기에 표시된 6자리 코드를 입력해 열쇠를 보내세요.</span><input id="sm-pair-code" inputmode="numeric" maxlength="6" placeholder="6자리 코드"><button onclick="approvePairingCode()">코드로 동기화</button><small>새 기기가 QR을 띄우면 이 기기의 카메라로 스캔해도 됩니다.</small></div></details></section>`;
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
    await saveMasterForDevice(master); vaultRecoveryError=''; renderSyncModal(); await syncRemoteChanges(true);
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
    clearInterval(pairingPoll); pairingPoll=null; pendingPair=null; pairingError=''; renderSyncModal(); await syncRemoteChanges(true);
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

function vaultRemoteVersionKey(){ return `breeze.vault.remote:${sbUser?sbUser.id:'none'}`; }

async function mergeVaultPayload(remote,legacyItems){
  const session=syncSession();
  const map=new Map(),embeddedProgress={};
  [...(remote&&remote.items||[]),...(legacyItems||[]),...vaultRemoteItems].forEach(item=>{
    if(!item) return; const key=itemIdentity(item),old=map.get(key);
    if(item.position){
      const position=safePosition(item.position),record={position,updatedAt:position&&position.t||0};
      if(position&&(!embeddedProgress[key]||record.updatedAt>embeddedProgress[key].updatedAt)) embeddedProgress[key]=record;
    }
    const clean={...item}; delete clean.position;
    if(!old||(clean.updatedAt||0)>=(old.updatedAt||0)) map.set(key,clean);
  });
  const localByIdentity=new Map();
  for(const book of books){
    if(book.sampleId) continue;
    const item=await localVaultItem(book); assertSyncSession(session);
    const key=itemIdentity(item),old=map.get(key);
    if(!old||(item.updatedAt||0)>=(old.updatedAt||0)) map.set(key,item);
    localByIdentity.set(item.identity,book);
  }
  assertSyncSession(session);
  if(remote) mergeWordState(remote.words||{},remote.dead||{});
  vaultRemoteItems=[...map.values()];
  serverBooks=vaultRemoteItems.map(item=>{
    const local=localByIdentity.get(item.identity)||books.find(book=>book.id===item.id);
    const progress=progressRemoteRecords[itemIdentity(item)]||embeddedProgress[itemIdentity(item)];
    return {book_id:item.id,meta:{...item,position:progress&&progress.position||null,localId:local?local.id:''}};
  });
  for(const [identity,record] of Object.entries(embeddedProgress)){
    const previous=progressRemoteRecords[identity];
    if(!previous||record.updatedAt>previous.updatedAt) progressRemoteRecords[identity]=record;
    const local=localByIdentity.get(identity);
    const active=local&&curBook&&curBook.id===local.id&&document.getElementById('v-read').classList.contains('on');
    if(local&&!active&&(!positions[local.id]||record.updatedAt>(positions[local.id].t||0))) positions[local.id]=record.position;
  }
  if(Object.keys(embeddedProgress).length) markSyncDirty(PROGRESS_LOCAL_CHANGED);
  return Object.keys(embeddedProgress).length>0;
}
async function readLegacyData(rows){
  const session=syncSession();
  const legacyWords={},legacyDead={},items=[];
  (rows||[]).forEach(row=>{
    if(row.key===VAULT_ROW||row.key===VAULT_META_ROW||row.key===PROGRESS_ROW) return;
    const value=row.data||{}; if(value.deleted) legacyDead[row.key]=value.up||Date.now(); else legacyWords[row.key]=value;
  });
  mergeWordState(legacyWords,legacyDead);
  let bookRows=0,positionRows=0,readError='';
  try{
    const booksResult=await sb.from('books').select('book_id,meta').eq('user_id',session.userId);
    assertSyncSession(session);
    if(booksResult.error) throw booksResult.error;
    bookRows=(booksResult.data||[]).length;
    (booksResult.data||[]).forEach(row=>{
      const meta=row.meta||{}; if(meta.deleted) return;
      items.push({id:row.book_id,title:meta.title||'(제목 없음)',author:meta.author||'',kind:meta.kind||'',
        identity:'legacy:'+row.book_id,addedAt:meta.addedAt||0,updatedAt:meta.renamedAt||meta.addedAt||0,position:null});
    });
    const positionsResult=await sb.from('positions').select('book_id,data').eq('user_id',session.userId);
    assertSyncSession(session);
    if(positionsResult.error) throw positionsResult.error;
    positionRows=(positionsResult.data||[]).length;
    (positionsResult.data||[]).forEach(row=>{
      const item=items.find(one=>one.id===row.book_id);
      if(item){ item.position=safePosition(row.data); item.updatedAt=Math.max(item.updatedAt,item.position&&item.position.t||0); }
    });
  }catch(error){ if(error.syncCancelled) throw error; readError=String(error&&error.message||error); console.warn('옛 동기화 메타데이터 이전을 건너뛰었어요:',error); }
  return {items,audit:{wordRows:(rows||[]).length,bookRows,positionRows,readError,auditedAt:Date.now()}};
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
      const key=String(entry[0]),blob=imageRecordBlob(entry[1]); if(!(blob instanceof Blob)) continue;
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
    books.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0)); renderAllBookViews(); queueSync(); queueReadingProgressSync();
    syncStatus('읽기자료를 이 기기에 불러왔어요');
  }catch(error){ console.error(error); syncStatus('백업을 열지 못했어요. 같은 계정의 복구키인지 확인해 주세요.'); }
}
document.getElementById('reading-backup-input').addEventListener('change',event=>{
  const target=/** @type {HTMLInputElement} */(event.currentTarget),file=target.files[0]; target.value=''; if(file) importReadingBackup(file);
});
};
