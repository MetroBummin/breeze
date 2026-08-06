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
  await originalDel(b.id);
  await imgPurge(b.id+'|');
  delete positions[b.id]; save(LS_POS, positions);
  renderHome();
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
const originalInput = document.getElementById('original-fileinput');
document.getElementById('btn-add').onclick = () => finput.click();
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
  if(!book || book.builtin) return;
  reconnectTarget = book;
  originalInput.accept = book.original && book.original.kind
    ? '.'+book.original.kind
    : '.pdf,.epub';
  originalInput.click();
}
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

    const id = textAvailable ? bookHash(paras) : 'raw-'+hash.slice(0,24);
    const fingerprint = textAvailable ? bookContentFingerprint(paras) : 'raw:'+hash;
    const sourceMap = buildSourceMap(sig);
    const packedSignals = packLayoutSignals(sig);
    const formatting = buildFormattingFromLayout(paras,sig,null);
    return {kind,title,tmpId,hash,id,fingerprint,paras,sig,sourceMap,packedSignals,
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
  target.fingerprint = prepared.fingerprint;
  target.textAvailable = prepared.textAvailable;
  target.sourceMap = prepared.sourceMap;
  target.layoutSignals = prepared.packedSignals || null;
  target.formatting = prepared.formatting || null;
  target.original = original;
  target.localSourceAt = original ? original.storedAt : Date.now();
  target.readerSchema = 4;
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
    if(curBook && curBook.id === target.id && typeof switchReaderMode === 'function'){
      await switchReaderMode('original',{reload:true});
    }
  }catch(error){
    if(prepared) imgPurge(prepared.tmpId+'|');
    console.error(error);
    toast('원본을 연결하지 못했어요: '+(error.message||error));
  }
}
async function importFile(file){
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
    const book = {id,title:prepared.title,paras,addedAt:Date.now(),
      fingerprint:prepared.fingerprint,textAvailable:prepared.textAvailable,
      readerSchema:4,sourceMap:prepared.sourceMap,
      layoutSignals:prepared.packedSignals||null,formatting:prepared.formatting||null,
      original,localSourceAt:original ? original.storedAt : Date.now()};
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
