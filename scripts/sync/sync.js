/* ================= sync (Supabase, magic link) =================
   ▼▼ 여기 두 줄에 Supabase 프로젝트의 URL과 anon key를 붙여넣으면 동기화가 켜집니다.
      (Supabase 대시보드 → Settings → API) 비워두면 로컬 전용으로 동작. */
let SB_URL = '';
let SB_KEY = '';
let sb = null;
let sbInitProblem = '';
let authListenerAttached = false;

function initSupabase(){
  if(sb) return sb;

  const config = window.BREEZE_CONFIG || {};
  SB_URL = typeof config.SB_URL === 'string' ? config.SB_URL.trim() : '';
  SB_KEY = typeof config.SB_KEY === 'string' ? config.SB_KEY.trim() : '';

  if(!SB_URL || !SB_KEY){
    sbInitProblem = 'config';
    return null;
  }
  if(!window.supabase || typeof window.supabase.createClient !== 'function'){
    sbInitProblem = 'sdk';
    return null;
  }

  try{
    sb = window.supabase.createClient(SB_URL, SB_KEY);
    sbInitProblem = '';
    attachSupabaseAuth();
  }catch(e){
    sbInitProblem = 'client';
    console.error('Supabase 연결 초기화 실패:', e);
  }
  return sb;
}

let sbUser = null, syncTimer = null, syncing = false;
let syncPromise = null, syncAgain = false, syncAgainManual = false;
let lastSync = load('breeze.lastsync', 0);

function syncStatus(msg){ const el=document.getElementById('sm-status'); if(el) el.textContent = msg; }
function syncBadge(){
  const b = document.getElementById('nav-sync');
  b.textContent = sbUser ? 'Sync ✓' : 'Sync';
}
function openSyncModal(){
  initSupabase();
  document.getElementById('sync-modal').classList.add('on');
  renderSyncModal();
  if(sbUser) refreshBooks();
}
function closeSyncModal(){ document.getElementById('sync-modal').classList.remove('on'); }
document.getElementById('sync-modal').addEventListener('click', e=>{ if(e.target.id==='sync-modal') closeSyncModal(); });

function renderSyncModal(){
  const body = document.getElementById('sm-body');
  if(!sb){
    const guide = sbInitProblem === 'sdk'
      ? '동기화 라이브러리를 불러오지 못했어요.<br>인터넷 연결을 확인한 뒤 새로고침해 주세요.'
      : sbInitProblem === 'client'
        ? 'Supabase 연결을 시작하지 못했어요.<br><b>config.js</b>의 프로젝트 URL과 공개 키를 확인해 주세요.'
        : '아직 서버가 연결되지 않았어요.<br><b>config.js</b>에 Supabase 프로젝트 URL과 공개 키를 입력해 주세요.';
    body.innerHTML = `<div class="desc">${guide}</div>`;
    syncStatus('');
    return;
  }
  if(sbUser){
    body.innerHTML = `<div class="desc">로그인됨: <b>${esc(sbUser.email||'')}</b><br>
      단어장과 읽던 위치가 자동으로 동기화됩니다.<br>
      마지막 동기화: ${lastSync? new Date(lastSync).toLocaleString('ko-KR') : '아직 없음'}</div>
      <button class="sm-btn primary" onclick="doSync(true)">지금 동기화</button>
      <div class="sm-books">
        <div class="sm-books-head">
          <span>책 <span class="sm-dim">(수동)</span></span>
          <button class="sm-mini" onclick="refreshBooks()">목록 새로고침</button>
        </div>
        <div id="sm-booklist"><div class="sm-dim">서버 목록 확인 중…</div></div>
      </div>
      <button class="sm-btn ghost" onclick="sbLogout()">로그아웃</button>`;
    if(serverBooks) renderBookList();
  }else{
    body.innerHTML = `<div class="desc">이메일을 입력하면 <b>로그인 링크</b>를 보내드려요.
      비밀번호는 없습니다. 링크를 누르면 이 브라우저에서 로그인되고,
      단어장이 기기 간에 동기화됩니다.</div>
      <input id="sm-email" type="email" placeholder="you@example.com" autocomplete="email">
      <button class="sm-btn primary" onclick="sbSendLink()">로그인 링크 보내기</button>
      <div id="sm-codewrap">
        <div class="hint">메일에 온 <b>6자리 코드</b>를 입력해도 로그인돼요<br>(다른 기기에서 메일을 열어도 OK)</div>
        <input id="sm-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······">
        <button class="sm-btn ghost" onclick="sbVerifyCode()">코드로 로그인</button>
      </div>`;
  }
  syncStatus('');
}
async function sbSendLink(){
  const email = (document.getElementById('sm-email').value||'').trim();
  if(!/.+@.+\..+/.test(email)){ syncStatus('이메일 형식을 확인해 주세요'); return; }
  syncStatus('링크 보내는 중…');
  const { error } = await sb.auth.signInWithOtp({ email,
    options:{ emailRedirectTo: location.origin + location.pathname } });
  if(error){ syncStatus('전송 실패: '+error.message); return; }
  syncStatus('메일을 보냈어요! 링크를 누르거나, 6자리 코드를 입력하세요.');
  const cw = document.getElementById('sm-codewrap');
  if(cw){ cw.style.display='block'; document.getElementById('sm-code').focus(); }
}
document.addEventListener('keydown', e=>{
  if(e.key==='Enter' && e.target && e.target.id==='sm-code'){ e.preventDefault(); sbVerifyCode(); }
});
async function sbVerifyCode(){
  const email = (document.getElementById('sm-email').value||'').trim();
  const token = (document.getElementById('sm-code').value||'').replace(/[\s-]/g,'').trim();
  if(!/^\d{6}$/.test(token)){ syncStatus('6자리 숫자 코드를 입력해 주세요'); return; }
  syncStatus('코드 확인 중…');
  const { error } = await sb.auth.verifyOtp({ email, token, type:'email' });
  if(error) syncStatus('코드 확인 실패: '+error.message+' (코드는 1시간 뒤 만료돼요)');
  // 성공 시 onAuthStateChange가 자동으로 로그인 화면 전환 + 동기화 시작
}
async function sbLogout(){
  await sb.auth.signOut();
  sbUser = null; syncBadge(); renderSyncModal();
}
/* ================= 책 동기화 (수동) =================
   책은 반입 후 바뀌지 않으므로 충돌 판정이 필요 없습니다. 올리기/받기만 있습니다.
   본문은 Storage(파일), 목록은 books 테이블에 둡니다.                      */
let serverBooks = null;
function activeServerBooks(){
  return (serverBooks || []).filter(serverRowIsActive);
}
function serverBookIdFor(book){
  const match = activeServerBooks().find(row => serverRowMatchesBook(row, book));
  return match ? match.book_id : book.id;
}
function localBookForServerId(serverId){
  const row = (serverBooks || []).find(item => item.book_id === serverId);
  return row ? findLocalBookForServerRow(row, books) : (books.find(book => book.id === serverId) || null);
}

/* 지문 없는 옛 업로드에 지문을 채워 넣는 `hydrateServerFingerprints()`가
   여기 있었습니다. 목록을 새로 고칠 때마다 서버 책을 통째로 내려받아 다시
   해싱했습니다 — 한 번 돌고 끝났어야 할 일이 매번 도는 비용이 됐습니다.
   지문 없는 책은 이제 제목으로 짝을 찾고, 한 번 `올리기`를 누르면 지문이
   붙습니다. */

/* 서버에 "지웠음" 표시가 있는 책을 이 기기에서도 지웁니다.
   책은 한 번 지우면 되살릴 이유가 없으므로 삭제가 항상 이깁니다.
   (같은 파일을 다시 넣으면 지문 ID가 같아 올리기 한 번으로 표시가 지워집니다) */
async function applyBookTombstones(rows){
  let removed = 0;
  for(const r of (rows||[])){
    if(!(r.meta||{}).deleted) continue;
    const lc = findLocalBookForServerRow(r, books);
    if(!lc) continue;
    const originalRecord=await originalGetForBook(lc);
    if(!serverTombstoneShouldDelete(r,lc,originalRecord)){
      /* The local file was imported after the server deletion. Keep it visible
         as a local-only copy; pressing Upload clears the old tombstone. */
      if(lc.detachedServerId!==r.book_id){
        lc.detachedServerId=r.book_id;
        delete lc.remoteDeletePendingAt; delete lc.remoteDeletePendingId;
        await bookPut(lc);
      }
      continue;
    }
    /* Never pull the floor out from under an open reader. The same tombstone
       is applied on the next sync after the user leaves the book. */
    if(curBook && curBook.id===lc.id){
      lc.remoteDeletePendingAt=(r.meta||{}).deletedAt||Date.now();
      lc.remoteDeletePendingId=r.book_id;
      await bookPut(lc);
      continue;
    }
    books = books.filter(b => b.id !== lc.id);
    await bookDel(lc.id);
    await originalDel(lc.id);
    await imgPurge(lc.id+'|');
    delete positions[lc.id];
    removed++;
  }
  if(removed){
    save(LS_POS, positions);
    if(document.getElementById('v-home').classList.contains('on')) renderHome();
  }
  return removed;
}

let refreshingBooks = null;
async function refreshBooks(){
  if(!sb || !sbUser) return;
  if(refreshingBooks) return refreshingBooks;
  refreshingBooks=(async()=>{
    syncStatus('책 목록 불러오는 중…');
    await flushPendingBookDeletes();
    const { data, error } = await sb.from('books').select('book_id,meta').eq('user_id', sbUser.id);
    if(error){ syncStatus('목록 실패: '+error.message); return; }
    serverBooks = data || [];
    await applyBookTombstones(serverBooks);     // 다른 기기에서 지운 책을 여기서도 정리
    await autoDownloadCasuals();                // 다른 기기에서 담은 짧은 글
    syncStatus('');
    renderBookList();
  })();
  try{ await refreshingBooks; }
  finally{ refreshingBooks=null; }
}
function renderBookList(){
  const el = document.getElementById('sm-booklist');
  if(!el) return;
  const srv = activeServerBooks();
  const consumedServerIds = new Set();
  const rows = [];
  books.forEach(b=>{
    const match = srv.find(row => !consumedServerIds.has(row.book_id) && serverRowMatchesBook(row, b));
    if(match) consumedServerIds.add(match.book_id);
    rows.push({ id:b.id, serverId:match ? match.book_id : '',
                title:b.title, where:match ? 'both' : 'local' });
  });
  srv.forEach(row=>{
    if(!consumedServerIds.has(row.book_id)) rows.push({
      id:row.book_id,
      serverId:row.book_id,
      title:(row.meta || {}).title || '(제목 없음)',
      where:'server',
    });
  });
  if(!rows.length){ el.innerHTML = '<div class="sm-dim">책이 없어요</div>'; return; }
  el.innerHTML = rows.map(r=>`
    <div class="sm-book" data-id="${esc(r.id)}" data-server-id="${esc(r.serverId || '')}" data-title="${esc(r.title)}">
      <span class="t">${esc(r.title)}</span>
      ${r.where==='local'  ? '<button class="act" data-a="up">올리기</button>' : ''}
      ${r.where==='server' ? '<button class="act" data-a="down">이 기기에 받기</button>' : ''}
      ${r.where==='both'   ? '<span class="done">✓ 동기화됨</span>' : ''}
      ${r.where!=='local'  ? '<button class="act del" data-a="rm" title="서버에서 지우기">✕</button>' : ''}
    </div>`).join('');
  el.querySelectorAll('.act').forEach(btn=>{
    btn.onclick = ()=>{
      const row = btn.closest('.sm-book');
      const id = row.dataset.id, serverId = row.dataset.serverId || id, title = row.dataset.title;
      const job = btn.dataset.a==='up'   ? bookUpload(id)
                : btn.dataset.a==='down' ? bookDownload(serverId)
                :                          bookDeleteServer(serverId, title);
      btn.disabled = true;
      Promise.resolve(job).finally(()=>{ btn.disabled=false; });
    };
  });
}
const bookPath = id => `${sbUser.id}/${id}.json`;
const legacyBookFormatPath = id => `${sbUser.id}/${id}.format.json`;
const LS_BOOK_DELETE_QUEUE='breeze.pending-book-deletes';
let pendingBookDeletes=load(LS_BOOK_DELETE_QUEUE,{});
function pendingDeleteQueue(){
  if(!sbUser) return null;
  if(!pendingBookDeletes[sbUser.id]) pendingBookDeletes[sbUser.id]={};
  return pendingBookDeletes[sbUser.id];
}
function queueServerBookDelete(id,title,fingerprint,deletedAt){
  const queue=pendingDeleteQueue();
  if(!queue) return;
  queue[id]={title:title||'(제목 없음)',fingerprint:fingerprint||'',
             deletedAt:deletedAt||Date.now()};
  save(LS_BOOK_DELETE_QUEUE,pendingBookDeletes);
}
function cancelQueuedServerBookDelete(id){
  const queue=pendingDeleteQueue();
  if(!queue || !queue[id]) return;
  delete queue[id];
  save(LS_BOOK_DELETE_QUEUE,pendingBookDeletes);
}
async function flushPendingBookDeletes(){
  const queue=pendingDeleteQueue();
  if(!sb || !sbUser || !queue) return {flushed:0,failed:0,cleanupPending:0};
  let flushed=0, failed=0, cleanupPending=0;
  for(const [id,item] of Object.entries({...queue})){
    try{
      /* The tombstone is authoritative. Publish it before removing the payload
         so a partial failure can never leave an active row with a missing file. */
      const meta={title:item.title,fingerprint:item.fingerprint||'',deleted:true,
                  deletedAt:item.deletedAt||Date.now()};
      const saved=await sb.from('books').upsert(
        [{user_id:sbUser.id,book_id:id,meta}],{onConflict:'user_id,book_id'});
      if(saved.error) throw saved.error;
      let cleanupFailed=false;
      const removed=await sb.storage.from('books').remove([bookPath(id),legacyBookFormatPath(id)]);
      if(removed.error){ cleanupFailed=true; console.warn('Deleted book payload cleanup will retry:',removed.error.message); }
      const positionDelete=await sb.from('positions').delete()
        .eq('user_id',sbUser.id).eq('book_id',id);
      if(positionDelete.error){ cleanupFailed=true; console.warn('Deleted book position cleanup will retry:',positionDelete.error.message); }
      if(cleanupFailed){ cleanupPending++; continue; }
      delete queue[id];
      save(LS_BOOK_DELETE_QUEUE,pendingBookDeletes);
      flushed++;
    }catch(error){
      failed++;
      console.warn('Pending book deletion will retry:',error&&error.message);
    }
  }
  return {flushed,failed,cleanupPending};
}
async function bookDeleteServer(id, title){
  if(!confirm(`서버에서 "${title}"을(를) 지울까요?\n\n이 기기에 있는 책은 그대로 남습니다.`)) return;
  try{
    syncStatus('지우는 중…');
    const local = localBookForServerId(id);
    if(local){
      local.detachedServerId = id;
      delete local.remoteDeletePendingAt; delete local.remoteDeletePendingId;
      await bookPut(local);
    }
    queueServerBookDelete(id,title,local ? ensureBookFingerprint(local) : '',Date.now());
    const result=await flushPendingBookDeletes();
    if(result.failed) throw new Error('서버 삭제를 완료하지 못했어요. 다음 동기화 때 다시 시도합니다.');
    syncStatus('지웠어요');
    await refreshBooks();
  }catch(e){ console.error(e); syncStatus('삭제 실패: '+(e.message||e)); }
}
/* 이름을 바꾸면 서버 목록의 이름도 따라가야 다른 기기가 옛 이름을 되돌려
   놓지 않습니다. 아직 안 올린 책이면 조용히 아무 일도 하지 않습니다. */
async function pushBookTitle(b){
  if(!sb || !sbUser || !b) return;
  try{
    const remoteId = serverBookIdFor(b);
    const { data } = await sb.from('books').select('meta')
      .eq('user_id', sbUser.id).eq('book_id', remoteId).maybeSingle();
    // 다른 기기가 이미 지운 책이면 서버 정보를 되살리지 않습니다(삭제가 이깁니다)
    if(data && !(data.meta||{}).deleted) await sb.from('books').upsert(
      [{user_id:sbUser.id, book_id:remoteId,
        meta:{...(data.meta||{}), title:b.title,
              fingerprint:ensureBookFingerprint(b), renamedAt:b.renamedAt}}],
      {onConflict:'user_id,book_id'});
  }catch(e){}
}

/* 짧은 글은 몇 KB라 넣자마자 올립니다. "폰에서 담고 노트북에서 읽는다"가
   Casuals 가 있는 이유인데, 그러려면 Sync 창을 열어 책마다 `올리기`를 눌러야
   했습니다. 그 일은 일어나지 않습니다. 원서는 수백 KB라 그대로 수동입니다. */
async function autoUploadCasual(book){
  if(!sb || !sbUser || !book || !isCasual(book)) return;
  try{ await bookUpload(book.id, {auto:true}); }
  catch(e){ console.warn('Casual auto-upload skipped:', e && e.message); }
}

/* 이 기기에서만 지운 책. 서버 사본은 남겨 두었으므로, 표시가 없으면 다음
   동기화가 곧바로 도로 받아 옵니다. 지운 사람 눈에는 안 지워진 것과 같습니다. */
const LS_HIDDEN = 'breeze.hidden';
function hiddenBookIds(){ return load(LS_HIDDEN, {}); }
function hideBookLocally(id){
  const hidden = hiddenBookIds();
  hidden[id] = Date.now();
  save(LS_HIDDEN, hidden);
}
function unhideBookLocally(id){
  const hidden = hiddenBookIds();
  if(hidden[id] === undefined) return;
  delete hidden[id];
  save(LS_HIDDEN, hidden);
}

/* 짧은 글은 저절로 내려받습니다. 폰에서 담고 노트북에서 읽는 것이 Casuals 가
   있는 이유인데, 노트북에서 Sync 창을 열어 `받기`를 눌러야 한다면 그 일은
   일어나지 않습니다. 원서는 수백 KB라 손으로 고릅니다 — 서버가 금방 찹니다. */
async function autoDownloadCasuals(){
  const hidden = hiddenBookIds();
  for(const row of activeServerBooks()){
    const meta = row.meta || {};
    if(!CASUAL_KINDS.has(meta.kind || '')) continue;
    if(hidden[row.book_id]) continue;
    if(findLocalBookForServerRow(row, books)) continue;
    try{ await bookDownload(row.book_id, {auto:true}); }
    catch(e){ console.warn('Casual auto-download skipped:', e && e.message); }
  }
}
async function bookUpload(id, options){
  const auto = !!(options && options.auto);
  const b = books.find(x=>x.id===id); if(!b) return;
  const fingerprint = ensureBookFingerprint(b);
  const remoteId=b.detachedServerId||b.remoteDeletePendingId||id;
  const twin = activeServerBooks().find(r =>
    r.book_id !== remoteId && normalizeBookTitle((r.meta||{}).title) === normalizeBookTitle(b.title)
  );
  if(twin && (twin.meta || {}).fingerprint === fingerprint){
    syncStatus('이미 서버에 있는 같은 책이에요');
    renderBookList();
    return;
  }
  // 자동 올리기는 절대 물어보지 않습니다. 방금 붙여넣은 참인데 창이 뜨면 놀랍니다.
  if(twin && (auto || !confirm(`서버에 같은 제목의 책이 이미 있어요.\n\n"${b.title}"\n\n다른 판본일 수 있습니다. 따로 하나 더 올릴까요?`))) return;
  try{
    syncStatus('올리는 중…');
    cancelQueuedServerBookDelete(remoteId);
    // 원본 PDF/EPUB Blob은 IndexedDB 전용입니다. 서버에는 재배치한 글자와
    // 작은 위치 지도만 올라가며 `original`에는 파일 이름/형식만 담깁니다.
    const formatting = b.formatting || null;
    const blob = new Blob([JSON.stringify({
      paras:b.paras,
      fingerprint,
      kind:b.kind||'',
      formatting,
      layoutSignals:b.layoutSignals || null,
      sourceMap:b.sourceMap || null,
      original:b.original ? {...b.original,storedAt:undefined} : null,
      /* 기사는 어디서 왔는지가 본문의 일부입니다 — 출처 이름, 원문 링크,
         그리고 사진이 어느 주소에서 왔는지. 사진 자체는 올리지 않습니다.
         이미 공개된 남의 사진을 서버에 쌓아 둘 이유가 없고, 받는 기기는
         주소만 있으면 스스로 받아 옵니다(`bookImageBlob`). */
      site:b.site || '',
      sourceUrl:b.sourceUrl || '',
      cover:b.cover || '',
      imgSrc:b.imgSrc || null,
      textAvailable:b.textAvailable !== false,
    })], {type:'application/json'});
    const up = await sb.storage.from('books').upload(bookPath(remoteId), blob, {upsert:true, contentType:'application/json'});
    if(up.error) throw up.error;
    const meta = { title:b.title, author:b.author||'', addedAt:b.addedAt||Date.now(),
                   renamedAt:b.renamedAt||0, paras:b.paras.length, bytes:blob.size,
                   /* 다른 기기가 목록만 보고 "이건 저절로 받아도 되는 짧은
                      글"인지 판단할 수 있어야 합니다. 본문을 받아 봐야 알면
                      저절로 받을지 말지를 정할 수가 없습니다. */
                   kind:b.kind||'',
                   fingerprint, deleted:false };   // 다시 올리면 "지웠음" 표시가 해제됩니다
    const { error } = await sb.from('books').upsert([{user_id:sbUser.id, book_id:remoteId, meta}], {onConflict:'user_id,book_id'});
    if(error) throw error;
    if(b.detachedServerId || b.remoteDeletePendingAt || b.remoteDeletePendingId){
      delete b.detachedServerId; delete b.remoteDeletePendingAt; delete b.remoteDeletePendingId;
      await bookPut(b);
    }
    syncStatus('올렸어요');
    await refreshBooks();
  }catch(e){ console.error(e); syncStatus('올리기 실패: '+(e.message||e)); }
}
async function bookDownload(id, options){
  const auto = !!(options && options.auto);
  try{
    if(!auto) syncStatus('받는 중…');
    const { data, error } = await sb.storage.from('books').download(bookPath(id));
    if(error) throw error;
    const body = JSON.parse(await data.text());
    const meta = (((serverBooks||[]).find(r=>r.book_id===id))||{}).meta || {};
    const existing=books.find(item=>item.id===id)||null;
    const localOriginal=existing ? await originalGetForBook(existing) : null;
    const book = { id, title: meta.title||'(제목 없음)', author: meta.author||'',
                   addedAt: meta.addedAt||Date.now(), paras: body.paras||[],
                   fingerprint:meta.fingerprint || body.fingerprint || '',
                   kind:body.kind || '',
                   formatting:body.formatting || body.tidy || null,
                   layoutSignals:body.layoutSignals || null,
                   sourceMap:body.sourceMap || null,
                   original:localOriginal ? existing.original : (body.original || null),
                   localSourceAt:localOriginal ? localBookSourceTime(existing,localOriginal) : 0,
                   site:body.site || '',
                   sourceUrl:body.sourceUrl || '',
                   cover:body.cover || '',
                   imgSrc:body.imgSrc || null,
                   textAvailable:body.textAvailable !== false };
    if(!book.paras.length) throw new Error('본문이 비어 있어요');
    ensureBookFingerprint(book);
    unhideBookLocally(id);        // 손수 받았으면 "이 기기에서 숨김"은 끝입니다
    await bookPut(book);
    books = books.filter(b=>b.id!==id); books.unshift(book);
    if(!auto) syncStatus('받았어요');
    renderAllBookViews(); renderBookList();
  }catch(e){
    console.error(e);
    if(!auto) syncStatus('받기 실패: '+(e.message||e));
    else throw e;
  }
}

function queueSync(){
  if(!sb || !sbUser) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=>doSync(false), 4000);
}
const upOf = w => w ? (w.up || w.addedAt || 0) : 0;
function doSync(manual){
  if(!sb || !sbUser) return Promise.resolve(false);
  if(syncPromise){
    syncAgain=true;
    syncAgainManual=syncAgainManual||!!manual;
    if(manual) syncStatus('현재 변경사항까지 이어서 동기화 중…');
    return syncPromise;
  }
  syncing=true;
  syncPromise=(async()=>{
    let nextManual=!!manual;
    do{
      syncAgain=false;
      const passManual=nextManual||syncAgainManual;
      syncAgainManual=false;
      await runSyncPass(passManual);
      nextManual=false;
    }while(syncAgain && sb && sbUser);
    return true;
  })().finally(()=>{
    syncing=false;
    syncPromise=null;
  });
  return syncPromise;
}
async function runSyncPass(manual){
  if(manual) syncStatus('동기화 중…');
  try{
    const uid = sbUser.id;
    await flushPendingBookDeletes();
    /* ---- words: pull, merge (last-write-wins + tombstones), push ---- */
    const { data: rows, error } = await sb.from('words').select('key,data').eq('user_id', uid);
    if(error) throw error;
    const server = {}; (rows||[]).forEach(r=>server[r.key]=r.data||{});
    const pushes = []; let pulled = 0;
    const keys = new Set([...Object.keys(server), ...Object.keys(words), ...Object.keys(dead)]);
    for(const k of keys){
      const sv = server[k], lc = words[k], dt = dead[k]||0;
      const svUp = sv ? (sv.up||0) : -1;
      if(dt && dt >= svUp && dt >= upOf(lc)){          // deletion is the newest fact
        if(!sv || !sv.deleted) pushes.push({key:k, data:{deleted:true, up:dt}});
        if(lc){ delete words[k]; pulled++; }
        continue;
      }
      if(sv && sv.deleted){                            // server says deleted
        if(lc && upOf(lc) > svUp) pushes.push({key:k, data:lc});   // local edit is newer -> revive
        else if(lc){ delete words[k]; pulled++; }
        continue;
      }
      if(sv && (!lc || svUp > upOf(lc))){ words[k] = sv; delete dead[k]; pulled++; }
      else if(lc && (!sv || upOf(lc) > svUp)) pushes.push({key:k, data:lc});
    }
    if(pushes.length){
      const { error: e2 } = await sb.from('words')
        .upsert(pushes.map(p=>({user_id:uid, key:p.key, data:p.data})), {onConflict:'user_id,key'});
      if(e2) throw e2;
    }
    /* ---- book identity + names ----
       Metadata is loaded before positions so legacy IDs can be mapped through
       the stable content fingerprint. */
    try{
      const { data: brows, error:bookError } = await sb.from('books').select('book_id,meta').eq('user_id', uid);
      if(bookError) throw bookError;
      serverBooks = brows || [];
      pulled += await applyBookTombstones(serverBooks);      // 다른 기기에서 지운 책 정리
      await autoDownloadCasuals();                            // 다른 기기에서 담은 짧은 글
      for(const r of serverBooks){
        const meta = r.meta || {};
        if(meta.deleted) continue;
        const lc = findLocalBookForServerRow(r, books);
        if(!lc || !meta.title || meta.title === lc.title) continue;
        if((meta.renamedAt||0) >= (lc.renamedAt||0)){      // 더 최근에 바꾼 이름이 이김
          lc.title = meta.title; lc.renamedAt = meta.renamedAt || Date.now();
          await bookPut(lc); pulled++;
        }else{
          r.meta = { ...meta, title:lc.title, renamedAt:lc.renamedAt,
                     fingerprint:ensureBookFingerprint(lc) };
          const renamed = await sb.from('books').upsert(
            [{ user_id:uid, book_id:r.book_id, meta:r.meta }],
            { onConflict:'user_id,book_id' }
          );
          if(renamed.error) throw renamed.error;
        }
      }
    }catch(e){ console.warn('book title sync skipped:', e && e.message); }

    /* ---- positions: LWW by t, with legacy book-ID reconciliation ---- */
    const { data: prows, error:positionError } = await sb.from('positions')
      .select('book_id,data').eq('user_id', uid);
    if(positionError) throw positionError;
    const pserver = {}; (prows||[]).forEach(r=>pserver[r.book_id]=r.data||{});

    for(const serverId of Object.keys(pserver)){
      const localBook = localBookForServerId(serverId);
      const localId = localBook ? localBook.id : serverId;
      const serverPosition = pserver[serverId];
      const localPosition = positions[localId] ? posOf(localId) : null;
      const activelyReading=curBook && curBook.id===localId
        && document.getElementById('v-read').classList.contains('on');
      if(!activelyReading && (serverPosition.t||0) > (localPosition ? localPosition.t||0 : -1)){
        positions[localId] = serverPosition;
        pulled++;
      }
    }

    const positionPushes = new Map();
    for(const localId of Object.keys(positions)){
      const localBook = books.find(book => book.id === localId);
      const serverId = localBook ? serverBookIdFor(localBook) : localId;
      const localPosition = posOf(localId);
      const serverPosition = pserver[serverId] || null;
      if((localPosition.t||0) > (serverPosition ? serverPosition.t||0 : -1)){
        positionPushes.set(serverId, {user_id:uid, book_id:serverId, data:localPosition});
      }
    }
    const ppush = [...positionPushes.values()];
    if(ppush.length){
      const positionUpsert = await sb.from('positions').upsert(ppush, {onConflict:'user_id,book_id'});
      if(positionUpsert.error) throw positionUpsert.error;
    }
    saveWords(); save(LS_DEAD, dead); save(LS_POS, positions);
    lastSync = Date.now(); save('breeze.lastsync', lastSync);
    if(manual){ renderSyncModal(); syncStatus('완료!'); }
    else if(pushes.length || ppush.length || pulled) miniToast('Auto-synced');
    if(document.getElementById('v-vocab').classList.contains('on')) renderVocab();
    if(document.getElementById('v-home').classList.contains('on')) renderHome();
  }catch(e){
    console.error(e);
    if(manual) syncStatus('동기화 실패: '+(e.message||e));
  }
}
function attachSupabaseAuth(){
  if(!sb || authListenerAttached) return;
  authListenerAttached = true;
  sb.auth.onAuthStateChange((ev, session)=>{
    sbUser = session ? session.user : null;
    syncBadge();
    if(sbUser){
      doSync(false);
      if(document.getElementById('sync-modal').classList.contains('on')) renderSyncModal();
    }
  });
  sb.auth.getSession().then(({data:{session}})=>{
    sbUser = session ? session.user : null;
    syncBadge();
    if(sbUser){
      doSync(false);
    }
  });
}
initSupabase();
document.addEventListener('visibilitychange', ()=>{
  if(!sb || !sbUser) return;
  clearTimeout(syncTimer);
  /* If the tab is hidden during the 800ms scroll debounce, save exactly that
     pending movement before sending positions. Do not stamp an unchanged
     position merely because visibility changed. */
  if(document.hidden && curBook && typeof scrollTick!=='undefined' && scrollTick){
    clearTimeout(scrollTick); scrollTick=null; saveReadingState();
  }
  doSync(false);            // leaving: flush, returning: pull fresh
});
/* periodic auto-sync (3분마다, 로그인 상태 + 화면 보이는 동안만) */
setInterval(()=>{ if(sb && sbUser && !document.hidden) doSync(false); }, 3*60*1000);
