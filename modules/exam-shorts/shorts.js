/* ================= Shorts: 기출 한 문항씩 세로로 =================
   한 화면에 한 문항, 위로 넘기면 다음 문항. 시간이 흐르는 동안에는 단어 탭이
   잠겨 실전처럼 읽고, 답을 고르거나 시간이 끝나면 풀려서 사전이 열립니다.

   문제지 PDF에는 정답표가 없습니다. 그래서 채점하지 않습니다 — 고른 답을
   표시만 하고, 진짜 값어치인 "모르는 단어 눌러 보기"를 열어 줍니다.

   ⚠ 이 파일은 지금 앱에 연결되어 있지 않습니다. 되살리는 법은 같은 폴더의
   README.md 를 보세요. */

let shortsExam = null;
let shortsFrame = 0;
let shortsCard = null;

const SHORT_MARKS = ['①','②','③','④','⑤'];

function examBooks(){ return books.filter(book => book.kind === 'exam'); }

/* ---------- 타이머 ---------- */

function stopShortsTimer(){
  if(shortsFrame) cancelAnimationFrame(shortsFrame);
  shortsFrame = 0;
}

function paintShortsTimer(left){
  const bar = document.getElementById('shorts-timer');
  if(!bar) return;
  bar.style.width = Math.max(0, Math.min(1, left)) * 100 + '%';
  /* 남은 시간이 곧 색입니다. 파랑(205°)에서 빨강(0°)으로 내려옵니다. */
  bar.style.background = `hsl(${Math.round(205 * left)} 72% ${Math.round(48 + (1 - left) * 5)}%)`;
}

function startShortsTimer(card){
  stopShortsTimer();
  if(!card || card.classList.contains('revealed')){ paintShortsTimer(card ? 0 : 1); return; }
  const seconds = Math.max(10, Number(card.dataset.seconds) || 90);
  const began = performance.now();
  const tick = now => {
    if(shortsCard !== card) return;
    const left = 1 - (now - began) / (seconds * 1000);
    paintShortsTimer(left);
    if(left <= 0){ revealShort(card, 0); return; }
    shortsFrame = requestAnimationFrame(tick);
  };
  paintShortsTimer(1);
  shortsFrame = requestAnimationFrame(tick);
}

/* ---------- 잠금 해제 ---------- */

function revealShort(card, choice){
  if(!card || card.classList.contains('revealed')) return;
  stopShortsTimer();
  card.classList.add('revealed');
  if(!choice) card.classList.add('timeout');
  card.querySelectorAll('.short-choices button').forEach(button => {
    button.classList.toggle('chosen', Number(button.dataset.choice) === choice);
  });
  const hint = card.querySelector('.short-hint');
  if(hint) hint.textContent = choice
    ? '모르는 단어를 눌러 보세요'
    : '시간 종료 — 이제 단어를 눌러 볼 수 있어요';
}

/* ---------- 그리기 ---------- */

function shortsChoicesHtml(question){
  if(question.choices.length === 5){
    return question.choices.map((text, index) =>
      `<button type="button" data-choice="${index + 1}"><b>${SHORT_MARKS[index]}</b>${esc(text)}</button>`).join('');
  }
  /* 어법·흐름 문제는 ①~⑤가 지문 안에 박혀 있어 따로 적을 선택지가 없습니다. */
  return SHORT_MARKS.map((mark, index) =>
    `<button type="button" class="mark-only" data-choice="${index + 1}">${mark}</button>`).join('');
}

function shortsCardHtml(question, index, total){
  return `<article class="short" data-index="${index}" data-seconds="${question.seconds}">
    <div class="short-body">
      <div class="short-meta"><span class="short-n">${question.n}</span>
        <span class="short-count">${index + 1} / ${total}</span></div>
      ${question.prompt ? `<p class="short-prompt">${esc(question.prompt)}</p>` : ''}
      <div class="short-passage" data-pi="${index}">${wordSpans(question.passage)}</div>
      ${question.notes ? `<p class="short-note">${esc(question.notes)}</p>` : ''}
    </div>
    <div class="short-foot">
      <p class="short-hint">시간 안에 답을 골라 보세요 — 지금은 단어를 눌러도 뜻이 뜨지 않아요</p>
      <div class="short-choices${question.choices.length === 5 ? '' : ' marks'}">${shortsChoicesHtml(question)}</div>
    </div>
  </article>`;
}

function shortsCoverHtml(exam, others){
  const minutes = Math.round(exam.questions.reduce((sum, q) => sum + q.seconds, 0) / 60);
  return `<article class="short short-cover">
    <div class="short-cover-inner">
      <div class="short-kicker">기출 쇼츠</div>
      <h1>${esc(exam.title)}</h1>
      <p class="short-sub">읽기 ${exam.questions.length}문항 · 약 ${minutes}분<br>위로 넘겨서 시작하세요</p>
      <div class="short-swipe" aria-hidden="true">︿</div>
      ${others.length ? `<div class="short-others">${others.map(book =>
        `<button type="button" data-exam="${esc(book.id)}">${esc(book.title)}</button>`).join('')}</div>` : ''}
    </div>
  </article>`;
}

function renderShorts(){
  const feed = document.getElementById('shorts-feed');
  const exams = examBooks();
  if(!exams.length){
    shortsExam = null;
    feed.innerHTML = `<article class="short short-cover"><div class="short-cover-inner">
      <div class="short-kicker">기출 쇼츠</div>
      <h1>기출 문제지를 넣어 주세요</h1>
      <p class="short-sub">수능·모의고사 영어 <b>문제지 PDF</b>를 그냥 끌어다 놓거나 + 로 추가하면
        읽기 문항만 골라 한 문항씩 넘겨 볼 수 있어요.<br>
        듣기와 도표 문항은 빼고 담습니다.</p>
      <button type="button" class="short-add" onclick="finput.click()">문제지 추가</button>
    </div></article>`;
    paintShortsTimer(1);
    return;
  }
  if(!shortsExam || !exams.some(book => book.id === shortsExam.id)) shortsExam = exams[0];
  curBook = shortsExam;
  const others = exams.filter(book => book.id !== shortsExam.id);
  const total = shortsExam.questions.length;
  feed.innerHTML = shortsCoverHtml(shortsExam, others)
    + shortsExam.questions.map((question, index) => shortsCardHtml(question, index, total)).join('');
  feed.scrollTop = 0;
  shortsCard = null;
  paintShortsTimer(1);
  watchShortsCards();
}

/* 화면을 채운 카드가 "지금 푸는 문항"입니다. */
let shortsObserver = null;
function watchShortsCards(){
  if(shortsObserver) shortsObserver.disconnect();
  const feed = document.getElementById('shorts-feed');
  shortsObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      const card = entry.target;
      if(shortsCard === card) return;
      shortsCard = card;
      closePanel();
      if(card.classList.contains('short-cover')){ stopShortsTimer(); paintShortsTimer(1); return; }
      startShortsTimer(card);
    });
  }, { root: feed, threshold: 0.6 });
  feed.querySelectorAll('.short').forEach(card => shortsObserver.observe(card));
}

/* ---------- 열고 닫기 ---------- */

function openShorts(){
  shortsActive = true;
  renderShorts();
}
function closeShorts(){
  shortsActive = false;
  stopShortsTimer();
  if(shortsObserver){ shortsObserver.disconnect(); shortsObserver = null; }
  shortsCard = null;
}

/* ---------- 반입 ----------
   기출 문제지는 책장이 아니라 Shorts로 갑니다. 본문(paras)은 문항 지문을
   그대로 담아 두어 사전의 예문 찾기와 책 지문·동기화가 그대로 동작합니다. */

async function importExam(prepared){
  const paras = prepared.exam.map(question => question.passage);
  const id = bookHash(paras);
  const existing = books.find(book => book.id === id);
  const exam = { id, title:prepared.title, kind:'exam', questions:prepared.exam, paras,
    addedAt: existing ? existing.addedAt : Date.now(),
    fingerprint: bookContentFingerprint(paras), textAvailable:true, readerSchema:4,
    sourceMap:null, layoutSignals:null, formatting:null, original:null,
    localSourceAt: Date.now() };
  await bookPut(exam);
  books = books.filter(book => book.id !== id);
  books.unshift(exam);
  await imgPurge(prepared.tmpId+'|');
  shortsExam = exam;
  toast(`기출 ${prepared.exam.length}문항을 담았어요 — Shorts에서 풀어 보세요`);
  show('shorts');
}

/* ---------- 입력 ---------- */

(function(){
  const feed = document.getElementById('shorts-feed');

  feed.addEventListener('click', event => {
    const pick = event.target.closest('[data-exam]');
    if(pick){
      const chosen = examBooks().find(book => book.id === pick.dataset.exam);
      if(chosen){ shortsExam = chosen; renderShorts(); }
      return;
    }
    const choice = event.target.closest('.short-choices button');
    if(choice){ revealShort(choice.closest('.short'), Number(choice.dataset.choice)); return; }
    /* 시간이 흐르는 동안에는 사전이 열리지 않습니다. CSS로도 막지만,
       키보드나 접근성 도구로 들어오는 경우까지 여기서 한 번 더 막습니다. */
    const word = event.target.closest('.short-passage .w');
    const card = word && word.closest('.short');
    if(word && card && card.classList.contains('revealed')) openWord(word.dataset.w, word);
  });

  /* 홈 ↔ 쇼츠 좌우 넘기기. 세로 스크롤을 뺏지 않도록 가로가 확실히
     우세할 때만 화면을 바꿉니다. */
  let startX = 0, startY = 0, tracking = false;
  const onStart = event => {
    const touch = event.touches[0];
    startX = touch.clientX; startY = touch.clientY; tracking = true;
  };
  const onEnd = (event, from) => {
    if(!tracking) return;
    tracking = false;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX, dy = touch.clientY - startY;
    if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if(from === 'home' && dx < 0) show('shorts');
    if(from === 'shorts' && dx > 0) show('home');
  };
  const home = document.getElementById('v-home');
  home.addEventListener('touchstart', onStart, { passive:true });
  home.addEventListener('touchend', event => onEnd(event, 'home'));
  const shorts = document.getElementById('v-shorts');
  shorts.addEventListener('touchstart', onStart, { passive:true });
  shorts.addEventListener('touchend', event => onEnd(event, 'shorts'));
})();
