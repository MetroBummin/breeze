function greet(){
  const h = new Date().getHours();
  return h<5 ? 'GOOD NIGHT' : h<12 ? 'GOOD MORNING' : h<18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
}
/* 꾹 누르면(약 0.55초) 이름 바꾸기. 손가락이 움직이면(스크롤) 취소됩니다. */
function attachLongPress(el, fn){
  let timer = null, sx = 0, sy = 0, fired = false;
  const start = e => {
    fired = false;
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY;
    timer = setTimeout(()=>{ fired = true; fn(); }, 550);
  };
  const move = e => {
    if(!timer) return;
    const p = e.touches ? e.touches[0] : e;
    if(Math.abs(p.clientX-sx) > 10 || Math.abs(p.clientY-sy) > 10) cancel();
  };
  const cancel = ()=>{ clearTimeout(timer); timer = null; };
  el.addEventListener('touchstart', start, {passive:true});
  el.addEventListener('touchmove', move, {passive:true});
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mousemove', move);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('contextmenu', e=>e.preventDefault());
  return ()=>fired;      // 클릭 처리에서 "길게 눌렀던 건 무시"에 사용
}
/* 책 삭제 — 기기와 서버를 함께 지웁니다.
   "여기서만 지우고 서버엔 남기고 싶다"는 경우가 사실상 없어서 하나로 합쳤습니다. */
async function deleteBook(b){
  if(b.builtin) return;
  if(!confirm(`"${b.title}" 책을 삭제할까요?\n\n동기화한 경우 다른 기기에서도 삭제됩니다.\n(단어장은 그대로 남습니다)`)) return;
  const remoteId = typeof serverBookIdFor === 'function' ? serverBookIdFor(b) : b.id;
  books = books.filter(x=>x.id!==b.id);
  await bookDel(b.id);
  imgPurge(b.id+'|');
  delete positions[b.id]; save(LS_POS, positions);
  renderHome();
  if(sb && sbUser){
    try{
      // 본문과 작은 AI 조판 지도 파일을 실제로 지우고,
      const removedFiles = await sb.storage.from('books').remove([bookPath(remoteId), bookFormatPath(remoteId)]);
      if(removedFiles.error) throw removedFiles.error;
      // 목록 행은 "지웠음" 표시로 남깁니다. 이 표시가 있어야 다른 기기도 지울 수 있습니다.
      const meta = { title:b.title, fingerprint:ensureBookFingerprint(b),
                     deleted:true, deletedAt:Date.now() };
      const { error } = await sb.from('books').upsert([{user_id:sbUser.id, book_id:remoteId, meta}],
                                                      {onConflict:'user_id,book_id'});
      if(error) throw error;
      const positionDelete = await sb.from('positions').delete().eq('user_id', sbUser.id).eq('book_id', remoteId);
      if(positionDelete.error) console.warn('Position cleanup skipped:', positionDelete.error.message);
      if(serverBooks){
        serverBooks = serverBooks.filter(r => r.book_id !== remoteId);
        serverBooks.push({book_id:remoteId, meta});
      }
      renderBookList();
    }catch(e){ console.error(e); toast('기기에서는 지웠지만 서버에서 지우지 못했어요'); return; }
  }
  toast('삭제했어요');
}

async function renameBook(b){
  if(b.builtin){ toast('샘플 책은 이름을 바꿀 수 없어요'); return; }
  const typed = prompt('책 이름', b.title);
  if(typed === null) return;
  const t = typed.trim();
  if(!t || t === b.title) return;
  b.title = t;
  b.renamedAt = Date.now();            // 어느 쪽 이름이 최신인지 판단하는 기준
  await bookPut(b);
  renderHome();
  toast('이름을 바꿨어요');
  // 서버에 이미 올라간 책이면 목록의 이름도 함께 갱신
  if(sb && sbUser){
    try{
      const remoteId = typeof serverBookIdFor === 'function' ? serverBookIdFor(b) : b.id;
      const { data } = await sb.from('books').select('meta').eq('user_id', sbUser.id).eq('book_id', remoteId).maybeSingle();
      // 다른 기기가 이미 지운 책이면 서버 정보를 되살리지 않습니다(삭제가 이깁니다)
      if(data && !(data.meta||{}).deleted) await sb.from('books').upsert(
        [{user_id:sbUser.id, book_id:remoteId,
          meta:{...(data.meta||{}), title:t, fingerprint:ensureBookFingerprint(b), renamedAt:b.renamedAt}}],
        {onConflict:'user_id,book_id'});
    }catch(e){}
  }
}

function renderHome(){
  document.getElementById('greet').textContent = greet();
  const list = allBooks();
  // hero = most recently opened (default: demo)
  const hero = list.slice().sort((a,b)=>posOf(b.id).t - posOf(a.id).t)[0];
  const hp = posOf(hero.id);
  const pct = Math.round(hp.p*100);
  const minLeft = Math.max(1, Math.round(wcOf(hero)*(1-hp.p)/180));
  /* #hero는 화면을 다시 그려도 같은 요소입니다. 여기에 꾹 누르기 리스너를 계속 더하면
     renderHome()이 돈 횟수만큼 쌓여서, 한 번 꾹 눌렀는데 이름 바꾸기 창이
     연달아 여러 번 뜹니다(닫아도 다음 창이 또 뜨는 것처럼 보임).
     그래서 매번 빈 사본으로 갈아 끼워 옛 리스너를 통째로 떼어 냅니다. */
  const H = document.getElementById('hero').cloneNode(false);
  const H0 = document.getElementById('hero');
  H0.parentNode.replaceChild(H, H0);
  H.innerHTML = `
    ${WAVE('#BDDCCD','.45')}
    <div class="cover"><div class="inner"></div>
      <svg class="arc" viewBox="0 0 145 35" fill="none"><path d="M5 30 C54 0 103 -3 140 28" stroke="#A8D6E2" stroke-width="4" opacity=".8"/></svg>
      <div class="ct"></div>
    </div>
    <div class="meta">
      <div class="eyebrow">${hp.t? 'CONTINUE READING' : 'START READING'}</div>
      <div class="bt"></div>
      <div class="bm">${hp.t? pct+'% read · 약 '+minLeft+'분 남음' : wcOf(hero).toLocaleString()+' words · 약 '+minLeft+'분'}</div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      <button class="cta">${hp.t?'Read now':'Start'}</button>
    </div>`;
  H.querySelector('.ct').textContent = hero.title.toUpperCase();
  H.querySelector('.bt').textContent = hero.title;
  const heroPressed = attachLongPress(H, ()=>renameBook(hero));
  H.onclick = () => { if(heroPressed()) return; openBook(hero); };
  // shelf: the rest + add card
  const s = document.getElementById('shelf');
  s.innerHTML = '';
  list.filter(b=>b.id!==hero.id).forEach((b,i)=>{
    const pal = 'pal'+(i%3);
    const waveC = ['#C0DCC9','#9FCAB5','#B5D7C3'][i%3];
    const p = posOf(b.id);
    const card = document.createElement('div');
    card.className = 'bookcard '+pal;
    card.innerHTML = `<div class="author"></div><div class="bt"></div>
      ${WAVE(waveC,'.6')}
      ${p.t? `<div class="prog">${Math.round(p.p*100)}% 읽음</div>`:''}
      ${b.builtin?'':'<button class="del" title="삭제">✕</button>'}`;
    card.querySelector('.author').textContent = b.author || (b.builtin?'SAMPLE':'MY BOOK');
    card.querySelector('.bt').textContent = b.title;
    const pressed = attachLongPress(card, ()=>renameBook(b));
    card.onclick = e => { if(e.target.classList.contains('del') || pressed()) return; openBook(b); };
    const del = card.querySelector('.del');
    if(del) del.onclick = () => deleteBook(b);
    s.appendChild(card);
  });
  const add = document.createElement('div');
  add.className = 'bookcard add';
  add.innerHTML = '<div class="plus">+</div><div class="lbl">PDF · EPUB · TXT<br>파일 추가</div>';
  add.onclick = () => finput.click();
  s.appendChild(add);
}

/* ================= import ================= */
const finput = document.getElementById('fileinput');
document.getElementById('btn-add').onclick = () => finput.click();
finput.onchange = () => { if(finput.files[0]) importFile(finput.files[0]); finput.value=''; };
let dragDepth = 0;
window.addEventListener('dragenter', e=>{ e.preventDefault(); if(++dragDepth) document.getElementById('drop-overlay').classList.add('on'); });
window.addEventListener('dragleave', e=>{ e.preventDefault(); if(--dragDepth<=0){ dragDepth=0; document.getElementById('drop-overlay').classList.remove('on'); } });
window.addEventListener('dragover', e=>e.preventDefault());
window.addEventListener('drop', e=>{
  e.preventDefault(); dragDepth=0; document.getElementById('drop-overlay').classList.remove('on');
  const f = e.dataTransfer.files[0]; if(f) importFile(f);
});

/* 책 ID를 "반입한 시각"이 아니라 "내용"으로 만든다.
   같은 파일이면 어느 기기에서 넣어도 같은 ID → 중복이 생기지 않음.
   계산은 전부 기기 안에서 하고, 서버로 가는 건 짧은 문자열 하나뿐입니다. */
function bookHash(paras){
  const head = paras.slice(0, 40).join(' ');
  const tail = paras.slice(-10).join(' ');
  const norm = (head + '||' + tail).toLowerCase().replace(/\s+/g,' ').slice(0, 4000);
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for(let i=0;i<norm.length;i++){
    const c = norm.charCodeAt(i);
    h1 = Math.imul((h1 ^ c) >>> 0, 0x01000193) >>> 0;
    h2 = Math.imul((h2 + c * (i+1)) >>> 0, 0x85ebca6b) >>> 0;
  }
  const total = paras.reduce((a,p)=>a+p.length, 0);
  return 'b' + h1.toString(36) + h2.toString(36) + (total % 1000000).toString(36);
}
async function importFile(f){
  if(!/\.(pdf|epub|txt)$/i.test(f.name)){ toast('PDF, EPUB, TXT 파일만 지원해요'); return; }
  toast('텍스트 추출 중…');
  const name = f.name.replace(/\.(pdf|epub|txt)$/i,'').replace(/[-_]+/g,' ').trim();
  try{
    const tmpId = 'tmp'+Date.now();
    let paras;
    if(/\.pdf$/i.test(f.name)) paras = await parsePDF(f);
    else if(/\.epub$/i.test(f.name)) paras = await parseEPUB(f, tmpId);
    else paras = parseTXT(await f.text());
    const sig0 = paras.sig || null;
    /* 빈 문단을 걸러내면 번호가 밀리므로 조판 단서도 같은 순서로 당겨 줍니다. */
    const keep = [];
    paras.forEach(function(p, i){
      const t = p.startsWith(IMG_MARK) ? p : p.trim();
      if(t.length) keep.push({ t:t, i:i });
    });
    const shift = {}; keep.forEach(function(k, n){ shift[k.i] = n; });
    paras = keep.map(function(k){ return k.t; });
    const sig = sig0 ? keep.map(function(k){ return sig0[k.i] || null; }) : null;
    if(paras.length===0){ toast('텍스트를 찾지 못했어요 (스캔 이미지 PDF일 수 있어요)'); return; }
    const id = bookHash(paras);                       // 내용으로 ID 결정
    const already = books.find(b=>b.id===id);
    if(already){ toast(`이미 있는 책이에요 — "${already.title}"`); return; }
    // 제목은 파일 이름에서 가져옵니다. 바꾸려면 홈에서 책을 꾹 누르세요.
    // (반입할 때마다 이름을 묻지 않습니다 — 바로 뒤에 AI 정리 확인이 또 뜨면 성가시므로)
    const title = name;
    // EPUB 삽화는 임시 ID로 저장돼 있으므로 실제 ID로 표시를 바꿔 줍니다
    paras = paras.map(p => p.startsWith(IMG_MARK) ? p.replace(tmpId, id) : p);
    await imgRename(tmpId, id);
    const book = {id, title, paras, addedAt:Date.now()};
    ensureBookFingerprint(book);
    // Preserve raw structural hints for future rolling-formatting work.
    const packedSignals = packLayoutSignals(sig);
    if(packedSignals) book.layoutSignals = packedSignals;

    // EPUB/PDF layout can format obvious headings and quotes without AI.
    const formatting = buildFormattingFromLayout(paras, sig, null);
    if(formatting && validateFormattingBlocks(paras, formatting.blocks)){
      book.formatting = formatting;
    }

    await bookPut(book);
    books.unshift(book);
    renderHome();
    toast(book.formatting
      ? '추가 완료! 문서 구조를 정리했어요'
      : '추가 완료! 카드를 눌러 읽기 시작하세요');
  }catch(err){ console.error(err); toast('파일을 읽지 못했어요: '+err.message); }
}
