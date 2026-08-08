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
    if(typeof renderBookList === 'function') renderBookList();
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
      renderBookList();
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
function casualBooks(){ return books.filter(isCasual); }
function longformBooks(){ return books.filter(book => !isCasual(book)); }
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
   고치고, ✕는 지웁니다. 그 배선을 한 군데에 둡니다. */
function wireBookCard(card, book){
  const pressed = attachLongPress(card, ()=>openEditSheet(book));
  card.onclick = event => {
    if(event.target.classList.contains('del') || pressed()) return;
    openBook(book);
  };
  card.querySelector('.del').onclick = () => confirmDeleteBook(book);
  return card;
}

function casualCard(book, index, current){
  const position = posOf(book.id);
  const label = nowReadingLabel(book, current);
  const card = el('div', 'casual cpal'+(index%4));
  card.innerHTML = `<div class="thumb">
      <img class="cover" alt="" hidden>
      <div class="src"></div><div class="lede"></div>
      ${WAVE('#FFFFFF','.35')}
      ${position.t ? `<div class="bar"><i style="width:${Math.round(position.p*100)}%"></i></div>` : ''}
      <button class="del" title="삭제">✕</button>
    </div>
    <div class="ct"></div><div class="cm"></div>`;
  fillCard(card, {
    '.src': book.site || '붙여넣은 글',
    /* 표지 그림이 없으므로 글 자체가 표지입니다. 첫 문단을 보여 줍니다. */
    '.lede': book.paras[1] || book.paras[0] || '',
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

function bookCard(book, index, current){
  const label = nowReadingLabel(book, current);
  const card = el('div', 'bookcard pal'+(index%3));
  card.classList.toggle('now-ring', book.id === current);
  card.innerHTML = `<img class="cover" alt="" hidden>
    <div class="author"></div><div class="bt"></div>
    ${WAVE(['#C0DCC9','#9FCAB5','#B5D7C3'][index%3],'.6')}
    ${label ? '<div class="prog"></div>' : ''}
    <button class="del" title="삭제">✕</button>`;
  fillCard(card, {'.author': book.author || 'MY BOOK', '.bt': book.title, '.prog': label});
  applyCover(card, book);
  return wireBookCard(card, book);
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
  casuals.forEach((book, index) => rail.appendChild(casualCard(book, index, nowCasual)));
  rail.appendChild(casualAddCard());
  document.querySelector('#casuals .sec-sub').textContent = casuals.length
    ? `기사 · 스레드 · 짧은 글 ${casuals.length}편`
    : '기사 · 스레드 · 짧은 글';

  const longform = longformBooks();
  const shelf = document.getElementById('shelf');
  const nowLongform = nowReadingIn(longform);
  shelf.innerHTML = '';
  longform.forEach((book, index) => shelf.appendChild(bookCard(book, index, nowLongform)));
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
  casuals.forEach((book, index) => grid.appendChild(casualCard(book, index, current)));
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
  longform.forEach((book, index) => grid.appendChild(bookCard(book, index, current)));
  const offered = pendingClassics();
  offered.forEach(classic => grid.appendChild(classicCard(classic)));
  empty.hidden = longform.length > 0 || offered.length > 0;
  empty.innerHTML = '아직 넣어 둔 책이 없어요.<br>PDF·EPUB 파일을 끌어다 놓아 보세요.';
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
async function requestDurableLocalStorage(){
  if(!navigator.storage || !navigator.storage.persist || load('breeze.storage-persist-asked',false)) return;
  save('breeze.storage-persist-asked',true);
  try{ await navigator.storage.persist(); }catch(e){}
}
async function storeLocalOriginal(bookId, file, kind, hash){
  if(kind !== 'pdf' && kind !== 'epub') return null;
  await requestDurableLocalStorage();
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
    toast('파일을 읽지 못했어요: '+(error.message||error));
  }
}
