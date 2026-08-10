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
/* 책 목록이 보이는 곳은 셋입니다. 하나만 다시 그리면 나머지 둘이 옛날 이름을
   들고 남아 있습니다. */
function renderAllBookViews(){
  renderHome();
  renderCasualLibrary();
  renderLongformLibrary();
}

/* 이 책이 쓰던 그림을 전부 지웁니다. EPUB 삽화는 `책ID|번호`라 접두어로
   쓸어내지만, 기사 사진은 주소에서 키를 만들어서 책 ID로 시작하지 않습니다. */
async function purgeBookImages(b){
  await imgPurge(b.id+'|');
  const keys = new Set(Object.keys(b.imgSrc || {}));
  if(b.cover) keys.add(b.cover);
  (b.paras || []).forEach(paragraph => {
    if(paragraph.startsWith(IMG_MARK)) keys.add(paragraph.slice(IMG_MARK.length));
  });
  for(const key of keys) await imgDel(key);
}

/* 책 삭제. `scope`는 'local'(이 기기에서만) 또는 'all'(모든 기기에서).
   되돌릴 수 없는 쪽을 기본으로 두지 않으려고 갈라 두었습니다 — 물어보는
   화면은 `openEditSheet(book,'delete')`에 있습니다. */
async function deleteBook(b, scope){
  const remoteId = serverBookIdFor(b);
  /* Deleting the book that is open would leave the reader pointing at content
     that no longer exists. Leave the reader first. */
  if(curBook && curBook.id===b.id) show('home');
  books = books.filter(x=>x.id!==b.id);
  await bookDel(b.id);
  await originalDel(b.id);
  await purgeBookImages(b);
  delete positions[b.id]; save(LS_POS, positions);
  renderAllBookViews();
  if(scope !== 'all'){
    /* 서버 사본은 그대로 둡니다. 그래서 "이 기기에서 숨김"을 적어 둬야
       합니다 — 짧은 글은 저절로 내려받으므로, 표시가 없으면 다음 동기화가
       곧바로 도로 가져옵니다. Sync 창에서 손수 받으면 표시가 풀립니다. */
    hideBookLocally(remoteId);
    hideBookLocally(b.id);
    toast('이 기기에서 지웠어요');
    return;
  }
  if(sb && sbUser){
    try{
      const meta = { title:b.title, fingerprint:ensureBookFingerprint(b),
                     deleted:true, deletedAt:Date.now() };
      queueServerBookDelete(remoteId,meta.title,meta.fingerprint,meta.deletedAt);
      const result=await flushPendingBookDeletes();
      if(result.failed) throw new Error('다음 동기화 때 서버 삭제를 다시 시도합니다.');
      if(serverBooks){
        serverBooks = serverBooks.filter(r => r.book_id !== remoteId);
        serverBooks.push({book_id:remoteId, meta});
      }
      renderAllBookViews();
    }catch(e){ console.error(e); toast('기기에서는 지웠지만 서버에서 지우지 못했어요'); return; }
  }
  toast('모든 기기에서 지웠어요');
}

/* ================= 홈 =================
   짧은 글(Casuals)은 옆으로, 긴 글(Long-form)은 아래로. 두 줄이면 "무엇을
   읽지"에 답이 되고, 그 이상은 이 앱에 필요 없습니다.

   "이어서 읽기" 칸은 따로 두지 않습니다. 두면 같은 책이 한 화면에 두 번
   나오니까요. 대신 마지막에 읽던 것 하나만 테두리로 표시합니다. */

/* 카드는 다섯 군데에서 만들고, 전부 "틀을 innerHTML 로 찍고 → querySelector 로
   글자를 넣는" 같은 짓을 했습니다. 사용자가 지은 제목이 마크업으로 새지
   않게 하려면 textContent 로 넣어야 하는데, 그러다 보니 두 줄씩 늘어났습니다. */
function el(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text != null) node.textContent = text;
  return node;
}
/* 틀 안의 자리마다 글자를 채웁니다 — `{'.ct': 제목, '.cm': 부제}` */
function fillCard(card, parts){
  Object.keys(parts).forEach(selector => {
    const slot = card.querySelector(selector);
    if(slot) slot.textContent = parts[selector];
  });
  return card;
}

const CASUAL_KINDS = new Set(['paste','article']);
const isCasual = book => CASUAL_KINDS.has(book.kind);
const HOME_CASUAL_LIMIT = 4;

/* 목록만 보고 "이건 짧은 글"인지 아는 법.

   답은 `kind` 하나입니다. 그리고 `kind` 는 짐작이 아니라 **어떻게 들어왔는지**
   그 자체입니다 — 붙여넣기는 `paste`, 주소는 `article`, 파일은 `pdf`·`epub`·`txt`.
   넣는 순간 적히므로 틀릴 수가 없습니다.

   문제는 `kind` 를 목록에 적기 시작하기 *전에* 올라간 줄입니다. 그 줄에는 그
   칸이 아예 없어서, 지금 Books 선반에 흐린 카드로 앉아 있습니다. 그 줄들을
   위해 두 가지를 합니다.

   ① 아는 기기가 대신 적어 줍니다(`backfillServerKinds`). 그 책을 손에 들고
      있는 기기라면 짐작할 것이 없습니다 — 그냥 알고 있는 값을 올려 줍니다.
      이쪽이 거의 다 처리하고, 한 번 적히면 그걸로 끝입니다.
   ② 그래도 남는 줄 — 어느 기기에도 없는, 순전히 서버에만 있는 옛 줄. 여기서만
      어림짐작합니다. 크기 하나로는 긴 기사가 원서로 넘어갈 수 있어서 문단 수를
      함께 봅니다: 기사는 아무리 길어도 수백 문단이고 원서는 수천 문단입니다.
      둘 다 통과해야 짧은 글로 봅니다. */
const LEGACY_CASUAL_MAX_BYTES = 300 * 1024;
const LEGACY_CASUAL_MAX_PARAS = 400;
function rowLooksCasual(meta){
  const kind = (meta || {}).kind || '';
  if(kind) return CASUAL_KINDS.has(kind);
  const bytes = (meta || {}).bytes || 0;
  const paras = (meta || {}).paras || 0;
  return bytes > 0 && bytes <= LEGACY_CASUAL_MAX_BYTES
      && paras > 0 && paras <= LEGACY_CASUAL_MAX_PARAS;
}

/* 최근에 읽던 것이 앞에 옵니다. 한 번도 열지 않은 것은 그 뒤에, 넣은 순서로.
   읽던 책을 늘 첫 칸에서 찾을 수 있으면 정렬 단추가 필요 없습니다. */
function byRecentlyRead(list){
  return list.slice().sort((a,b) =>
    (posOf(b.id).t||0)-(posOf(a.id).t||0) || (b.addedAt||0)-(a.addedAt||0));
}
function casualBooks(){ return byRecentlyRead(books.filter(isCasual)); }
function longformBooks(){ return byRecentlyRead(books.filter(book => !isCasual(book))); }

/* 카드 색은 자리가 아니라 책에 붙습니다. 줄이 자주 바뀌는데 색까지 따라
   움직이면 같은 책을 눈으로 좇을 수 없습니다. */
function paletteOf(book, count){
  const id = String(book && book.id || '');
  let sum = 0;
  for(let index=0; index<id.length; index++) sum = (sum*31 + id.charCodeAt(index)) >>> 0;
  return sum % count;
}
const readMinutes = book => Math.max(1, Math.round(wcOf(book)/180));

/* 두 줄이 각자 자기 줄에서 마지막으로 읽던 것을 기억합니다. 지하철에서 기사를
   한 편 봤다고 해서 읽던 원서 표시가 사라지면 안 되니까요. */
function nowReadingIn(list){
  const opened = list.filter(book => posOf(book.id).t);
  if(!opened.length) return null;
  return opened.sort((a,b) => posOf(b.id).t - posOf(a.id).t)[0].id;
}
/* 테두리와 진행도 글귀 하나로 표시합니다. 카드 위에 배지를 얹으면 지은이나
   출처 줄을 가려 버립니다. */
function nowReadingLabel(book, current){
  const position = posOf(book.id);
  const percent = position.t ? Math.round(position.p*100)+'% 읽음' : '';
  if(book.id !== current) return percent;
  return percent ? '이어서 · '+percent : '이어서 읽기';
}

/* 표지 사진은 IndexedDB에 있습니다. 다른 기기에서 받은 기사면 `bookImageBlob`이
   원래 주소에서 한 번 받아 옵니다. 그래도 없으면(사진이 없는 기사, 오프라인)
   지금까지의 글자 표지가 그대로 나옵니다. 두 줄의 카드가 같은 함수를 씁니다. */
function applyCover(host, book){
  if(!book.cover) return;
  bookImageBlob(book, book.cover).then(blob => {
    if(!blob) return;
    const image = host.querySelector('.cover');
    image.src = URL.createObjectURL(blob);
    image.hidden = false;
    host.classList.add('has-cover');
  });
}

/* 읽을거리 카드는 전부 같은 방식으로 동작합니다 — 누르면 열리고, 꾹 누르면
   고칩니다(이름 바꾸기 · 표지 · 삭제). 그 배선을 한 군데에 둡니다.

   모서리의 ✕ 는 걷어냈습니다. 오른쪽 위는 이제 백업 화살표 자리인데, 둘이
   한 모서리를 나눠 쓰다 보니 화살표가 안 뜨는 상황(로그인 전)에서는 ✕ 가
   아무것도 없는 자리를 비켜서서 혼자 어정쩡하게 떠 있었습니다. 지우는 길은
   꾹 누르기로 이미 있고, 그쪽이 "이 기기에서만/모든 기기에서"까지 물어봅니다. */
function wireBookCard(card, book){
  const pressed = attachLongPress(card, ()=>openEditSheet(book));
  card.onclick = () => { if(!pressed()) openBook(book); };
  return card;
}

/* 표지 그림이 없는 짧은 글은 글 자체가 표지입니다 — 첫 문단을 카드에 깝니다.
   그런데 그 자리에는 기자 이름("By Owen Delaney")이나 사진 표시가 먼저 오기도
   합니다. 그러면 카드가 아무 말도 하지 않게 됩니다. 읽을 만한 길이의 첫 줄을
   찾고, 없으면 지금까지처럼 맨 앞을 씁니다. */
function cardLede(book){
  const paras = book.paras || [];
  const real = paras.slice(1).find(text =>
    !text.startsWith(IMG_MARK) && text.trim().length >= 60);
  return real || paras[1] || paras[0] || '';
}

function casualCard(book, current){
  const index = paletteOf(book, 4);
  const position = posOf(book.id);
  const label = nowReadingLabel(book, current);
  const card = el('div', 'casual cpal'+(index%4));
  card.innerHTML = `<div class="thumb">
      <img class="cover" alt="" hidden>
      <div class="src"></div><div class="lede"></div>
      ${WAVE('#FFFFFF','.35')}
      ${position.t ? `<div class="bar"><i style="width:${Math.round(position.p*100)}%"></i></div>` : ''}
    </div>
    <div class="ct"></div><div class="cm"></div>`;
  fillCard(card, {
    '.src': book.site || '붙여넣은 글',
    '.lede': cardLede(book),
    '.ct': book.title,
    '.cm': label ? `${label} · ${readMinutes(book)}분` : `${readMinutes(book)}분 읽기`,
  });
  card.querySelector('.thumb').classList.toggle('now-ring', book.id === current);
  applyCover(card.querySelector('.thumb'), book);
  return wireBookCard(card, book);
}

function casualAddCard(){
  const card = el('div', 'casual add');
  card.innerHTML = `<div class="thumb"><div class="plus">+</div>
    <div class="lbl">기사 URL<br>또는 붙여넣기</div></div>`;
  card.onclick = () => openAddModal('casual');
  return card;
}
function casualMoreCard(count){
  const card = el('div', 'casual more');
  card.innerHTML = `<div class="thumb"><div class="plus">→</div>
    <div class="lbl">내 Casual<br>${count}편 더 보기</div></div>`;
  card.onclick = () => show('casuals');
  return card;
}

/* ================= 책이 서버에 있는가 =================
   예전에는 이걸 Sync 창 안 목록에서만 알 수 있었습니다. 창을 열고, 책마다
   `올리기`를 누르고, 다른 기기에서는 다시 열어서 `받기`를 눌러야 했습니다.
   그 일은 일어나지 않습니다 — 그래서 백업은 "하려고 마음먹은 사람"만 가졌습니다.

   이제 상태와 단추가 책 위에 있습니다. 카드를 보면 이 책이 안전한지 보이고,
   올리는 것도 거기서 합니다. Sync 창은 로그인만 맡습니다. */
function serverRowForBook(book){
  if(!sbUser || typeof activeServerBooks !== 'function') return null;
  return activeServerBooks().find(row => serverRowMatchesBook(row, book)) || null;
}
/* 서버에만 있는 원서. 짧은 글은 저절로 오가므로 여기 나오지 않습니다.
   "이 기기에서만 지운" 책도 나오지 않습니다 — 서버 사본을 남기기로 하고 서가에서
   치운 것인데, 흐린 카드로 도로 올라오면 지운 적이 없는 것과 같습니다. */
function serverOnlyBooks(){
  if(!sbUser || typeof activeServerBooks !== 'function') return [];
  const hidden = hiddenBookIds();
  return activeServerBooks()
    .filter(row => !rowLooksCasual(row.meta || {}))
    .filter(row => !hidden[row.book_id])
    .filter(row => !findLocalBookForServerRow(row, books));
}

const cardBusy = new Set();      // 올리는/받는 중인 책 — 두 번 누르는 것을 막습니다

function bookCard(book, current){
  const index = paletteOf(book, 3);
  const label = nowReadingLabel(book, current);
  const card = el('div', 'bookcard pal'+(index%3));
  card.classList.toggle('now-ring', book.id === current);
  card.innerHTML = `<img class="cover" alt="" hidden>
    <div class="author"></div><div class="bt"></div>
    ${WAVE(['#C0DCC9','#9FCAB5','#B5D7C3'][index%3],'.6')}
    ${label ? '<div class="prog"></div>' : ''}
    <button class="up" type="button"></button>`;
  fillCard(card, {'.author': book.author || 'MY BOOK', '.bt': book.title, '.prog': label});
  applyCover(card, book);
  paintBookSync(card, book);
  return wireBookCard(card, book);
}

/* 화살표 하나가 상태이자 단추입니다. 올라가 있으면 조용한 ✓ 로 남아
   "이 책은 기기가 죽어도 남는다"만 말합니다 — 누를 것이 없으니 흐리게. */
function paintBookSync(card, book){
  const button = card.querySelector('.up');
  if(!button) return;
  const busy = cardBusy.has(book.id);
  const synced = !busy && !!serverRowForBook(book);
  card.classList.toggle('synced', synced);
  card.classList.toggle('busy-sync', busy);
  /* 로그인 전에는 올릴 곳이 없습니다. 단추 대신 아무것도 두지 않습니다 —
     읽으러 온 사람에게 계정 이야기를 카드마다 하지 않기 위해서. */
  button.style.display = sbUser ? 'flex' : 'none';
  button.textContent = busy ? '↑' : (synced ? '✓' : '↑');
  button.title = busy ? '올리는 중…'
    : synced ? '서버에 백업돼 있어요' : '서버에 올려 두기 (다른 기기에서도 읽기)';
  button.onclick = event => {
    event.stopPropagation();          // 카드를 누른 것이 아닙니다
    if(busy || synced) return;
    uploadBookFromCard(book);
  };
}

async function uploadBookFromCard(book){
  if(cardBusy.has(book.id)) return;
  cardBusy.add(book.id);
  renderAllBookViews();
  try{
    await bookUpload(book.id);
    toast(`"${book.title}" 올렸어요`);
  }catch(error){
    console.error(error);
    toast('올리지 못했어요: '+((error && error.message) || error));
  }finally{
    cardBusy.delete(book.id);
    renderAllBookViews();
  }
}

/* 서버에만 있는 책. 이름만 받아 와서 흐린 카드로 둡니다 — 있다는 것은 보이고,
   가운데 단추가 "받으면 읽을 수 있다"를 말합니다. */
function cloudBookCard(row){
  const meta = row.meta || {};
  const busy = cardBusy.has(row.book_id);
  const card = el('div', 'bookcard cloud' + (busy ? ' busy-sync' : ''));
  card.innerHTML = `<div class="author"></div><div class="bt"></div>
    <button class="getbtn" type="button">${busy ? '받는 중…' : '↓ 이 기기에 받기'}</button>
    <button class="del" type="button" title="서버에서 지우기">✕</button>`;
  fillCard(card, { '.author': meta.author || '서버에 있음', '.bt': meta.title || '(제목 없음)' });
  /* 서버에만 있는 책을 지우는 길은 예전 Sync 목록에만 있었습니다. 목록을 걷어낸
     이상 여기 없으면 아예 지울 수 없게 됩니다. */
  card.querySelector('.del').onclick = event => {
    event.stopPropagation();
    bookDeleteServer(row.book_id, meta.title || '(제목 없음)');
  };
  card.onclick = () => { if(!cardBusy.has(row.book_id)) downloadBookFromCard(row); };
  return card;
}

async function downloadBookFromCard(row){
  const id = row.book_id;
  if(cardBusy.has(id)) return;
  cardBusy.add(id);
  renderAllBookViews();
  try{
    await bookDownload(id);
  }catch(error){
    console.error(error);
    toast('받지 못했어요: '+((error && error.message) || error));
  }finally{
    cardBusy.delete(id);
    renderAllBookViews();
  }
}

function longformAddCard(){
  const card = document.createElement('div');
  card.className = 'bookcard add';
  card.innerHTML = '<div class="plus">+</div><div class="lbl">PDF · EPUB · TXT<br>파일 추가</div>';
  card.onclick = () => pickBookFile();
  return card;
}

function renderHome(){
  document.getElementById('greet').textContent = greet();

  const casuals = casualBooks();
  const rail = document.getElementById('casual-rail');
  const nowCasual = nowReadingIn(casuals);
  rail.innerHTML = '';
  casuals.slice(0, HOME_CASUAL_LIMIT).forEach(book => rail.appendChild(casualCard(book, nowCasual)));
  if(casuals.length > HOME_CASUAL_LIMIT) rail.appendChild(casualMoreCard(casuals.length - HOME_CASUAL_LIMIT));
  rail.appendChild(casualAddCard());
  document.querySelector('#casuals .sec-sub').textContent = casuals.length
    ? `기사 · 스레드 · 짧은 글 ${casuals.length}편`
    : '기사 · 스레드 · 짧은 글';
  if(typeof appendRssCards === 'function') appendRssCards(rail);

  const longform = longformBooks();
  const shelf = document.getElementById('shelf');
  const nowLongform = nowReadingIn(longform);
  shelf.innerHTML = '';
  longform.forEach(book => shelf.appendChild(bookCard(book, nowLongform)));
  /* 서버에만 있는 책은 내 책 다음, 권유하는 고전 앞에 옵니다 — 이미 내 것이니까요. */
  serverOnlyBooks().forEach(row => shelf.appendChild(cloudBookCard(row)));
  pendingClassics().forEach(classic => shelf.appendChild(classicCard(classic)));
  shelf.appendChild(longformAddCard());
  document.querySelector('#longform .sec-sub').textContent = longform.length
    ? `원서 · PDF · EPUB ${longform.length}권 — 꾹 누르면 정보 바꾸기`
    : '원서 · PDF · EPUB';
}

/* 두 라이브러리는 같은 카드를 격자에만 다시 깔 뿐입니다. 홈은 "무엇을 읽지"에
   답하는 자리고, 여기는 "그때 그거 어디 갔지"에 답하는 자리입니다. */
function renderCasualLibrary(){
  const casuals = casualBooks();
  const current = nowReadingIn(casuals);
  const grid = document.getElementById('casual-grid');
  const empty = document.getElementById('casual-empty');
  document.getElementById('casual-cnt').textContent = casuals.length ? `${casuals.length}편` : '';
  grid.innerHTML = '';
  casuals.forEach(book => grid.appendChild(casualCard(book, current)));
  empty.hidden = casuals.length > 0;
  empty.innerHTML = '아직 담아 둔 짧은 글이 없어요.<br>기사 URL을 넣거나 본문을 붙여넣어 보세요.';
}

function renderLongformLibrary(){
  const longform = longformBooks();
  const current = nowReadingIn(longform);
  const grid = document.getElementById('longform-grid');
  if(!grid) return;
  const empty = document.getElementById('longform-empty');
  document.getElementById('longform-cnt').textContent = longform.length ? `${longform.length}권` : '';
  grid.innerHTML = '';
  longform.forEach(book => grid.appendChild(bookCard(book, current)));
  const cloud = serverOnlyBooks();
  cloud.forEach(row => grid.appendChild(cloudBookCard(row)));
  const offered = pendingClassics();
  offered.forEach(classic => grid.appendChild(classicCard(classic)));
  empty.hidden = longform.length > 0 || offered.length > 0 || cloud.length > 0;
  empty.innerHTML = '아직 넣어 둔 책이 없어요.<br>PDF·EPUB 파일을 끌어다 놓아 보세요.';
  renderHiddenBooksNote();
}

/* "이 기기에서만 지우기"를 고른 책은 서버에 남아 있지만 서가에 나오지 않습니다.
   예전에는 Sync 창 목록에서 다시 받을 수 있었는데, 그 목록을 걷어내면서 되살릴
   길이 없어졌습니다. 이 줄이 그 길입니다 — 서가는 어지럽히지 않고,
   찾는 사람만 찾을 수 있게 라이브러리 화면 아래에만 둡니다. */
function renderHiddenBooksNote(){
  const host = document.getElementById('longform-hidden');
  if(!host) return;
  const hidden = hiddenBookIds();
  const count = (sbUser && typeof activeServerBooks === 'function')
    ? activeServerBooks().filter(row => hidden[row.book_id]).length : 0;
  host.hidden = count === 0;
  if(!count) return;
  host.innerHTML = `이 기기에서 숨긴 책 ${count}권 <button type="button" class="linkish">다시 보기</button>`;
  host.querySelector('button').onclick = () => {
    activeServerBooks().forEach(row => { if(hidden[row.book_id]) unhideBookLocally(row.book_id); });
    renderAllBookViews();
    toast('숨긴 책을 다시 꺼냈어요');
  };
}

/* ================= 하나뿐인 추가 시트 =================
   붙여넣기 · 기사 URL · 내 파일. 셋 다 넣는 순간부터 오프라인에서 읽힙니다. */
function addModal(){ return document.getElementById('add-modal'); }
function addStep(step){
  addModal().querySelectorAll('.am-step').forEach(section =>
    section.classList.toggle('on', section.dataset.step === step));
  if(step === 'paste'){ document.getElementById('am-text').focus(); updatePastePreview(); }
  if(step === 'url'){
    document.getElementById('am-url').focus();
    document.getElementById('am-url-status').textContent = '';
  }
}
/* mode='casual'이면 짧은 글 두 가지만 보여 줍니다. */
function openAddModal(mode){
  addModal().classList.add('on');
  addModal().querySelector('.am-file').hidden = mode === 'casual';
  addStep('pick');
}
function closeAddModal(){ addModal().classList.remove('on'); }
function pickBookFile(){ closeAddModal(); finput.click(); }

function updatePastePreview(){
  const parsed = parsePastedText(document.getElementById('am-text').value);
  const preview = document.getElementById('am-preview');
  if(!parsed){ preview.textContent = ''; return; }
  const bodies = parsed.paras.length - (parsed.paras.length > 1 ? 1 : 0);
  preview.innerHTML = parsed.paras.length > 1
    ? `제목 <b>${esc(parsed.title)}</b> · ${parsed.thread ? `카드 <b>${bodies}</b>장` : `문단 <b>${bodies}</b>개`}`
    : '문단 <b>1</b>개';
}

/* 붙여넣은 글과 가져온 기사가 같은 저장 경로를 씁니다. */
async function saveCasualBook(parsed, extra){
  const id = bookHash(parsed.paras);
  const existing = books.find(book => book.id === id);
  if(existing){ closeAddModal(); toast(`이미 있는 글이에요 — "${existing.title}"`); openBook(existing); return; }
  const book = { id, title:parsed.title, kind:'paste', paras:parsed.paras,
    addedAt:Date.now(), fingerprint:bookContentFingerprint(parsed.paras),
    textAvailable:true, sourceMap:null, layoutSignals:null,
    formatting:parsed.formatting, original:null, localSourceAt:Date.now(), ...extra };
  await bookPut(book);
  books.unshift(book);
  closeAddModal();
  renderHome();
  openBook(book);
  autoUploadCasual(book);        // 읽기를 막지 않도록 기다리지 않습니다
}

async function importPastedText(){
  const parsed = parsePastedText(document.getElementById('am-text').value);
  if(!parsed){ toast('읽을 영어 글이 없어요'); return; }
  document.getElementById('am-text').value = '';
  await saveCasualBook(parsed, null);
}

document.getElementById('am-text').addEventListener('input', updatePastePreview);
document.getElementById('am-url').addEventListener('keydown', event => {
  if(event.key === 'Enter') importArticleUrl();
});
addModal().addEventListener('click', event => { if(event.target.id === 'add-modal') closeAddModal(); });

/* ================= import ================= */
const finput = document.getElementById('fileinput');
const originalInput = document.getElementById('original-fileinput');
finput.onchange = () => { if(finput.files[0]) importFile(finput.files[0]); finput.value=''; };
let reconnectTarget = null;
originalInput.onchange = async()=>{
  const file = originalInput.files[0];
  originalInput.value = '';
  const target = reconnectTarget;
  reconnectTarget = null;
  if(file && target) await reconnectOriginalFile(target, file);
};
function requestOriginalReconnect(book){
  if(!book) return;
  reconnectTarget = book;
  originalInput.accept = book.original && book.original.kind
    ? '.'+book.original.kind
    : '.pdf,.epub';
  originalInput.click();
}
/* Dragging over a child element fires dragleave on the parent, so the overlay
   is driven by a depth counter rather than by the last event seen. */
let dragDepth = 0;
const dropOverlay = () => document.getElementById('drop-overlay');
window.addEventListener('dragenter', e=>{ e.preventDefault(); dragDepth++; dropOverlay().classList.add('on'); });
window.addEventListener('dragleave', e=>{ e.preventDefault(); if(--dragDepth<=0){ dragDepth=0; dropOverlay().classList.remove('on'); } });
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

function importKind(file){
  const match = String(file.name||'').toLowerCase().match(/\.(pdf|epub|txt)$/);
  return match ? match[1] : '';
}
async function rawFileHash(file){
  const buffer = await file.arrayBuffer();
  if(window.crypto && crypto.subtle){
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  }
  let hash = 0x811c9dc5;
  const bytes = new Uint8Array(buffer);
  for(let index=0; index<bytes.length; index++) hash = Math.imul((hash^bytes[index])>>>0,0x01000193)>>>0;
  return 'fallback-'+hash.toString(16)+'-'+bytes.length;
}
async function storeLocalOriginal(bookId, file, kind, hash){
  if(kind !== 'pdf' && kind !== 'epub') return null;
  const metadata = { kind, name:file.name, type:file.type||'', size:file.size,
                     hash, storedAt:Date.now() };
  await originalPut(bookId, {...metadata, blob:file.slice(0,file.size,file.type||'application/octet-stream')});
  return metadata;
}
async function prepareImportedFile(file){
  const kind = importKind(file);
  if(!kind) throw new Error('PDF, EPUB, TXT 파일만 지원해요');
  const title = file.name.replace(/\.(pdf|epub|txt)$/i,'').replace(/[-_]+/g,' ').trim();
  const tmpId = 'tmp'+Date.now()+Math.random().toString(36).slice(2,7);
  try{
    const hash = await rawFileHash(file);
    let parsed;
    if(kind === 'pdf') parsed = await parsePDF(file);
    else if(kind === 'epub') parsed = await parseEPUB(file, tmpId);
    else parsed = parseTXT(await file.text());

    const sig0 = parsed.sig || null;
    const keep = [];
    parsed.forEach((paragraph,index)=>{
      const text = paragraph.startsWith(IMG_MARK) ? paragraph : paragraph.trim();
      if(text.length) keep.push({text,index});
    });
    let paras = keep.map(item=>item.text);
    let sig = sig0 ? keep.map(item=>sig0[item.index]||null) : null;
    let textAvailable = paras.some(text=>!text.startsWith(IMG_MARK) && text.trim().length);
    if(!textAvailable && kind === 'pdf'){
      paras = ['이 PDF에는 선택할 수 있는 글자가 없어요. 원본 모드에서 읽어주세요.'];
      sig = [{p:1,y:0}];
    }
    if(!paras.length) throw new Error('읽을 수 있는 내용을 찾지 못했어요');

    /* 붙임글자를 되살린 뒤에 지문을 냅니다 — 네모가 섞인 글과 고쳐진 글은
       서로 다른 책이 되어 버리니까요. */
    const glyphs = learnLigatures(paras.join('\n'));
    paras = paras.map(text => text.startsWith(IMG_MARK) ? text : applyLigatures(text, glyphs));

    const id = textAvailable ? bookHash(paras) : 'raw-'+hash.slice(0,24);
    const fingerprint = textAvailable ? bookContentFingerprint(paras) : 'raw:'+hash;
    const sourceMap = buildSourceMap(sig);
    const packedSignals = packLayoutSignals(sig);
    const formatting = buildFormattingFromLayout(paras,sig,null);
    return {kind,title,tmpId,hash,id,fingerprint,paras,sig,sourceMap,packedSignals,glyphs,
            /* EPUB 안에 들어 있던 표지. 아직 임시 ID 로 담겨 있어서, 진짜 ID 가
               정해지면 그림과 함께 이름이 바뀝니다(`imgRename`). */
            cover:parsed.cover || '',
            formatting:formatting && validateFormattingBlocks(paras,formatting.blocks) ? formatting : null,
            textAvailable};
  }catch(error){
    await imgPurge(tmpId+'|');
    throw error;
  }
}
function remapImportedImages(paras, fromId, toId){
  return paras.map(text=>text.startsWith(IMG_MARK) ? text.replace(fromId,toId) : text);
}
async function applyPreparedBook(target, prepared, file){
  const original = await storeLocalOriginal(target.id,file,prepared.kind,prepared.hash);
  if(prepared.kind === 'epub'){
    await imgPurge(target.id+'|');
    await imgRename(prepared.tmpId,target.id);
  }
  target.paras = remapImportedImages(prepared.paras,prepared.tmpId,target.id);
  /* 사용자가 손수 고른 표지가 있으면 건드리지 않습니다 — 같은 책의 원본을
     다시 연결했다고 해서 골라 둔 표지가 파일 안의 것으로 되돌아가면 안 됩니다. */
  if(prepared.cover && !target.cover) target.cover = prepared.cover.replace(prepared.tmpId,target.id);
  target.kind = prepared.kind;
  target.fingerprint = prepared.fingerprint;
  target.textAvailable = prepared.textAvailable;
  target.sourceMap = prepared.sourceMap;
  target.glyphs = prepared.glyphs || null;
  target.layoutSignals = prepared.packedSignals || null;
  target.formatting = prepared.formatting || null;
  target.original = original;
  target.localSourceAt = original ? original.storedAt : Date.now();
  const position = posOf(target.id);
  if(position.pi != null && position.pi >= target.paras.length){
    position.pi = Math.max(0,Math.round((position.p||0)*(target.paras.length-1)));
    position.dy = 0;
    positions[target.id] = position;
    save(LS_POS,positions);
  }
  await bookPut(target);
}
async function reconnectOriginalFile(target,file){
  if(!/\.(pdf|epub)$/i.test(file.name)){ toast('원본은 PDF 또는 EPUB 파일을 골라주세요'); return; }
  toast('같은 책인지 확인하고 있어요…');
  let prepared = null;
  try{
    prepared = await prepareImportedFile(file);
    if(prepared.fingerprint !== ensureBookFingerprint(target)){
      imgPurge(prepared.tmpId+'|');
      toast('다른 책으로 보여요. 원래 반입했던 파일을 골라주세요');
      return;
    }
    await applyPreparedBook(target,prepared,file);
    toast('원본을 연결했어요');
    if(curBook && curBook.id === target.id) await switchReaderMode('original',{reload:true});
  }catch(error){
    if(prepared) imgPurge(prepared.tmpId+'|');
    console.error(error);
    toast('원본을 연결하지 못했어요: '+(error.message||error));
  }
}
/* `extra`는 파일에서 알 수 없는 것만 얹습니다 — 지금은 내장 고전의
   지은이와 고전 ID뿐입니다. */
async function importFile(file, extra){
  /* 도서관에서 빌리면 책이 아니라 이 표가 내려옵니다. 확장자만 보고 "지원하지
     않는 형식"이라고 하면, 실제로는 어도비 프로그램으로 받아야 하는 잠긴 책인데
     파일을 잘못 고른 줄 알게 됩니다. */
  if(/\.acsm$/i.test(file.name)){
    toast('이건 책 파일이 아니라 어도비 대출 표(.acsm)예요. 저작권 보호가 걸려 있어 열 수 없어요');
    return;
  }
  if(!/\.(pdf|epub|txt)$/i.test(file.name)){ toast('PDF, EPUB, TXT 파일만 지원해요'); return; }
  toast('책을 준비하고 있어요…');
  let prepared = null;
  try{
    prepared = await prepareImportedFile(file);
    const already = books.find(book=>book.id===prepared.id || ensureBookFingerprint(book)===prepared.fingerprint);
    if(already){
      if(prepared.kind === 'txt'){
        imgPurge(prepared.tmpId+'|');
        toast(`이미 있는 책이에요 — "${already.title}"`);
        return;
      }
      Object.assign(already, extra);      // 같은 고전을 다시 받았을 때 표시가 남도록
      await applyPreparedBook(already,prepared,file);
      renderHome();
      toast(`기존 책에 원본을 연결했어요 — "${already.title}"`);
      return;
    }

    const id = prepared.id;
    if(prepared.kind === 'epub') await imgRename(prepared.tmpId,id);
    const paras = remapImportedImages(prepared.paras,prepared.tmpId,id);
    let original = null;
    try{ original = await storeLocalOriginal(id,file,prepared.kind,prepared.hash); }
    catch(storageError){
      console.warn('Original file storage failed:',storageError);
      toast('책은 추가했지만 원본 파일을 기기에 보관하지 못했어요');
    }
    const book = {id,title:prepared.title,kind:prepared.kind,paras,addedAt:Date.now(),
      cover:prepared.cover ? prepared.cover.replace(prepared.tmpId,id) : '',
      fingerprint:prepared.fingerprint,textAvailable:prepared.textAvailable,
      sourceMap:prepared.sourceMap,glyphs:prepared.glyphs||null,
      layoutSignals:prepared.packedSignals||null,formatting:prepared.formatting||null,
      original,localSourceAt:original ? original.storedAt : Date.now(), ...extra};
    await bookPut(book);
    books.unshift(book);
    renderHome();
    toast(original
      ? '추가 완료! 원본과 편한 글자 모드를 모두 준비했어요'
      : '추가 완료! 카드를 눌러 읽기 시작하세요');
  }catch(error){
    if(prepared) imgPurge(prepared.tmpId+'|');
    console.error(error);
    /* 잠긴 책은 실패가 아니라 사실입니다. "읽지 못했어요"라고 하면 앱이 고장 난
       줄 알지만, 잠겼다고 하면 다른 파일을 찾아볼 생각을 합니다. */
    if(error && error.drm){
      toast('저작권 보호(DRM)가 걸린 책이에요. DRM이 없는 EPUB·PDF는 열려요');
      return;
    }
    toast('파일을 읽지 못했어요: '+(error.message||error));
  }
}
