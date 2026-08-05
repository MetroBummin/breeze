/* ================= sync (Supabase, magic link) =================
   ▼▼ 여기 두 줄에 Supabase 프로젝트의 URL과 anon key를 붙여넣으면 동기화가 켜집니다.
      (Supabase 대시보드 → Settings → API) 비워두면 로컬 전용으로 동작. */
const SB_URL = (window.BREEZE_CONFIG && window.BREEZE_CONFIG.SB_URL) || '';
const SB_KEY = (window.BREEZE_CONFIG && window.BREEZE_CONFIG.SB_KEY) || '';

let sb = null;
try{ if(SB_URL && SB_KEY && window.supabase) sb = window.supabase.createClient(SB_URL, SB_KEY); }catch(e){}
let sbUser = null, syncTimer = null, syncing = false;
let lastSync = load('breeze.lastsync', 0);

function syncStatus(msg){ const el=document.getElementById('sm-status'); if(el) el.textContent = msg; }
function syncBadge(){
  const b = document.getElementById('nav-sync');
  b.textContent = sbUser ? 'Sync ✓' : 'Sync';
}
function openSyncModal(){
  document.getElementById('sync-modal').classList.add('on');
  renderSyncModal();
}
function closeSyncModal(){ document.getElementById('sync-modal').classList.remove('on'); }
document.getElementById('sync-modal').addEventListener('click', e=>{ if(e.target.id==='sync-modal') closeSyncModal(); });

function renderSyncModal(){
  const body = document.getElementById('sm-body');
  if(!sb){
    body.innerHTML = `<div class="desc">아직 서버가 연결되지 않았어요.<br>
      Supabase 프로젝트를 만들고, <b>config.js</b> 파일에
      프로젝트 키를 붙여넣으면 동기화가 켜집니다.<br>
      (자세한 순서는 <b>SYNC_SETUP.md</b> 참고)</div>`;
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
        <div id="sm-booklist"><div class="sm-dim">목록 새로고침을 눌러 확인하세요</div></div>
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
/* 서버에 "지웠음" 표시가 있는 책을 이 기기에서도 지웁니다.
   책은 한 번 지우면 되살릴 이유가 없으므로 삭제가 항상 이깁니다.
   (같은 파일을 다시 넣으면 지문 ID가 같아 올리기 한 번으로 표시가 지워집니다) */
async function applyBookTombstones(rows){
  let removed = 0;
  for(const r of (rows||[])){
    if(!(r.meta||{}).deleted) continue;
    const lc = books.find(b => b.id === r.book_id);
    if(!lc) continue;
    books = books.filter(b => b.id !== r.book_id);
    await bookDel(r.book_id);
    imgPurge(r.book_id+'|');
    delete positions[r.book_id];
    removed++;
  }
  if(removed){
    save(LS_POS, positions);
    if(document.getElementById('v-home').classList.contains('on')) renderHome();
  }
  return removed;
}

async function refreshBooks(){
  if(!sb || !sbUser) return;
  syncStatus('책 목록 불러오는 중…');
  const { data, error } = await sb.from('books').select('book_id,meta').eq('user_id', sbUser.id);
  if(error){ syncStatus('목록 실패: '+error.message); return; }
  serverBooks = data || [];
  await applyBookTombstones(serverBooks);     // 다른 기기에서 지운 책을 여기서도 정리
  syncStatus('');
  renderBookList();
}
function renderBookList(){
  const el = document.getElementById('sm-booklist');
  if(!el) return;
  const srv = new Map((serverBooks||[])
    .filter(r => !(r.meta||{}).deleted)        // 지운 책은 목록에 띄우지 않음
    .map(r=>[r.book_id, r.meta||{}]));
  const rows = [];
  books.forEach(b=>{
    rows.push({ id:b.id, title:b.title, where: srv.has(b.id) ? 'both' : 'local' });
  });
  srv.forEach((meta,id)=>{
    if(!books.some(b=>b.id===id)) rows.push({ id, title: meta.title || '(제목 없음)', where:'server' });
  });
  if(!rows.length){ el.innerHTML = '<div class="sm-dim">책이 없어요</div>'; return; }
  el.innerHTML = rows.map(r=>`
    <div class="sm-book" data-id="${esc(r.id)}" data-title="${esc(r.title)}">
      <span class="t">${esc(r.title)}</span>
      ${r.where==='local'  ? '<button class="act" data-a="up">올리기</button>' : ''}
      ${r.where==='server' ? '<button class="act" data-a="down">이 기기에 받기</button>' : ''}
      ${r.where==='both'   ? '<span class="done">✓ 동기화됨</span>' : ''}
      ${r.where!=='local'  ? '<button class="act del" data-a="rm" title="서버에서 지우기">✕</button>' : ''}
    </div>`).join('');
  el.querySelectorAll('.act').forEach(btn=>{
    btn.onclick = ()=>{
      const row = btn.closest('.sm-book');
      const id = row.dataset.id, title = row.dataset.title;
      const job = btn.dataset.a==='up'   ? bookUpload(id)
                : btn.dataset.a==='down' ? bookDownload(id)
                :                          bookDeleteServer(id, title);
      btn.disabled = true;
      Promise.resolve(job).finally(()=>{ btn.disabled=false; });
    };
  });
}
const bookPath = id => `${sbUser.id}/${id}.json`;
async function bookDeleteServer(id, title){
  if(!confirm(`서버에서 "${title}"을(를) 지울까요?\n\n이 기기에 있는 책은 그대로 남습니다.`)) return;
  try{
    syncStatus('지우는 중…');
    await sb.storage.from('books').remove([bookPath(id)]);
    // Keep a tombstone so other devices learn about the deletion.
    const meta = { title, deleted:true, deletedAt:Date.now() };
    const { error } = await sb.from('books').upsert(
      [{ user_id:sbUser.id, book_id:id, meta }],
      { onConflict:'user_id,book_id' }
    );
    if(error) throw error;
    syncStatus('지웠어요');
    await refreshBooks();
  }catch(e){ console.error(e); syncStatus('삭제 실패: '+(e.message||e)); }
}
async function bookUpload(id){
  const b = books.find(x=>x.id===id); if(!b) return;
  const twin = (serverBooks||[]).find(r => r.book_id !== id && normTitle((r.meta||{}).title) === normTitle(b.title));
  if(twin && !confirm(`서버에 같은 제목의 책이 이미 있어요.\n\n"${b.title}"\n\n다른 판본일 수 있습니다. 따로 하나 더 올릴까요?`)) return;
  try{
    syncStatus('올리는 중…');
    // 원문과 별도로 저장된 포맷 지도도 함께 올립니다.
    const formatting = b.formatting || b.tidy || null;
    const blob = new Blob([JSON.stringify({paras:b.paras, formatting})], {type:'application/json'});
    const up = await sb.storage.from('books').upload(bookPath(id), blob, {upsert:true, contentType:'application/json'});
    if(up.error) throw up.error;
    const meta = { title:b.title, author:b.author||'', addedAt:b.addedAt||Date.now(),
                   renamedAt:b.renamedAt||0, paras:b.paras.length, bytes:blob.size,
                   deleted:false };   // 다시 올리면 "지웠음" 표시가 해제됩니다
    const { error } = await sb.from('books').upsert([{user_id:sbUser.id, book_id:id, meta}], {onConflict:'user_id,book_id'});
    if(error) throw error;
    syncStatus('올렸어요');
    await refreshBooks();
  }catch(e){ console.error(e); syncStatus('올리기 실패: '+(e.message||e)); }
}
async function bookDownload(id){
  try{
    syncStatus('받는 중…');
    const { data, error } = await sb.storage.from('books').download(bookPath(id));
    if(error) throw error;
    const body = JSON.parse(await data.text());
    const meta = (serverBooks.find(r=>r.book_id===id)||{}).meta || {};
    const book = { id, title: meta.title||'(제목 없음)', author: meta.author||'',
                   addedAt: meta.addedAt||Date.now(), paras: body.paras||[],
                   formatting: body.formatting || body.tidy || null };
    if(!book.paras.length) throw new Error('본문이 비어 있어요');
    await bookPut(book);
    books = books.filter(b=>b.id!==id); books.unshift(book);
    syncStatus('받았어요');
    renderHome(); renderBookList();
  }catch(e){ console.error(e); syncStatus('받기 실패: '+(e.message||e)); }
}

function queueSync(){
  if(!sb || !sbUser) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=>doSync(false), 4000);
}
const upOf = w => w ? (w.up || w.addedAt || 0) : 0;
async function doSync(manual){
  if(!sb || !sbUser || syncing) return;
  syncing = true;
  if(manual) syncStatus('동기화 중…');
  try{
    const uid = sbUser.id;
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
    /* ---- positions: LWW by t ---- */
    const { data: prows } = await sb.from('positions').select('book_id,data').eq('user_id', uid);
    const pserver = {}; (prows||[]).forEach(r=>pserver[r.book_id]=r.data||{});
    const ppush = [];
    for(const id of new Set([...Object.keys(pserver), ...Object.keys(positions)])){
      const sv = pserver[id], lc = positions[id] ? posOf(id) : null;
      const svT = sv ? (sv.t||0) : -1, lcT = lc ? (lc.t||0) : -1;
      if(sv && svT > lcT){ positions[id] = sv; pulled++; }
      else if(lc && lcT > svT) ppush.push({user_id:uid, book_id:id, data:lc});
    }
    if(ppush.length) await sb.from('positions').upsert(ppush, {onConflict:'user_id,book_id'});

    /* ---- 책 이름만 동기화 (본문은 수동 그대로) ----
       제목은 몇 바이트라 자동으로 오가도 부담이 없고, 한쪽에서 바꾼 이름이 다른 기기에도 반영됩니다.
       books 표가 아직 없는 계정(supabase_books.sql 미실행)에서도 단어 동기화가 멈추지 않도록 따로 감쌉니다. */
    try{
      const { data: brows } = await sb.from('books').select('book_id,meta').eq('user_id', uid);
      pulled += await applyBookTombstones(brows);      // 다른 기기에서 지운 책 정리
      for(const r of (brows||[])){
        const meta = r.meta || {};
        if(meta.deleted) continue;
        const lc = books.find(b => b.id === r.book_id);
        if(!lc || !meta.title || meta.title === lc.title) continue;
        if((meta.renamedAt||0) >= (lc.renamedAt||0)){      // 더 최근에 바꾼 이름이 이김
          lc.title = meta.title; lc.renamedAt = meta.renamedAt || Date.now();
          await bookPut(lc); pulled++;
        }
      }
    }catch(e){ console.warn('book title sync skipped:', e && e.message); }
    saveWords(); save(LS_DEAD, dead); save(LS_POS, positions);
    lastSync = Date.now(); save('breeze.lastsync', lastSync);
    if(manual){ syncStatus('완료!'); renderSyncModal(); }
    else if(pushes.length || ppush.length || pulled) miniToast('Auto-synced');
    if(document.getElementById('v-vocab').classList.contains('on')) renderVocab();
    if(document.getElementById('v-home').classList.contains('on')) renderHome();
  }catch(e){
    console.error(e);
    if(manual) syncStatus('동기화 실패: '+(e.message||e));
  }finally{ syncing = false; }
}
if(sb){
  sb.auth.onAuthStateChange((ev, session)=>{
    sbUser = session ? session.user : null;
    syncBadge();
    if(sbUser){ doSync(false); if(document.getElementById('sync-modal').classList.contains('on')) renderSyncModal(); }
  });
  sb.auth.getSession().then(({data:{session}})=>{
    sbUser = session ? session.user : null;
    syncBadge();
    if(sbUser) doSync(false);
  });
}
document.addEventListener('visibilitychange', ()=>{
  if(!sb || !sbUser) return;
  clearTimeout(syncTimer);
  doSync(false);            // leaving: flush, returning: pull fresh
});
/* periodic auto-sync (3분마다, 로그인 상태 + 화면 보이는 동안만) */
setInterval(()=>{ if(sb && sbUser && !document.hidden) doSync(false); }, 3*60*1000);
