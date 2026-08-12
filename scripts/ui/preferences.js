/* ================= misc ================= */
let fs = load(LS_FS, 19);
document.documentElement.style.setProperty('--fs', fs+'px');
function fontSize(d){
  keepPlace(()=>{
    fs = Math.min(26, Math.max(14, fs+d));
    save(LS_FS, fs);
    document.documentElement.style.setProperty('--fs', fs+'px');
  });
  showFontSize();
}
/* 글자 크기를 보여 주는 곳은 읽는 화면의 Aa 하나뿐입니다 — 설정에는 두지
   않았습니다(글이 안 보이는 자리에서 A+ 를 눌러 봐야 소용이 없으니까요).
   처음 켤 때와 바뀔 때, 두 길에서 같은 함수를 부릅니다. */
function showFontSize(){
  const spot = document.getElementById('aa-fs');
  if(spot) spot.textContent = String(fs);
}
showFontSize();
/* ---- 좌우 여백 ----
   집중 모드가 몰래 넓혀 주던 글 폭을 여기로 꺼냈습니다. 폭은 스크롤과 묶지
   않습니다 — 읽는 도중 줄바꿈이 달라지면 보던 자리를 놓치기 때문입니다. */
const READ_MARGINS = {
  wide:   {width:'560px', pad:'34px', page:'54px'},
  normal: {width:'700px', pad:'26px', page:'44px'},
  narrow: {width:'920px', pad:'10px', page:'30px'},
};
let readMargin = load('breeze.margin', 'normal');
function applyReadMargin(){
  const m = READ_MARGINS[readMargin] || READ_MARGINS.normal;
  const root = document.documentElement.style;
  root.setProperty('--readw', m.width);
  root.setProperty('--readpad', m.pad);
  root.setProperty('--pagepad', m.page);
  const buttons = /** @type {NodeListOf<HTMLElement>} */
    (document.querySelectorAll('#aa-margin button'));
  buttons.forEach(button => button.classList.toggle('on', button.dataset.margin===readMargin));
}
function setReadMargin(next){
  if(!READ_MARGINS[next]) return;
  keepPlace(()=>{                       // 글 폭이 바뀌어도 보던 문장 유지
    readMargin = next;
    save('breeze.margin', next);
    applyReadMargin();
  });
}
applyReadMargin();

/* ---- Aa settings ---- */
function toggleAa(e){
  if(e) e.stopPropagation();
  const p = document.getElementById('aa-pop');
  const btn = document.getElementById('aafab');
  if(btn){
    const r = btn.getBoundingClientRect();
    p.style.top = 'auto';
    p.style.bottom = Math.round(window.innerHeight - r.top + 10) + 'px';
    p.style.right = Math.max(10, Math.round(window.innerWidth - r.right)) + 'px';
  }
  p.classList.toggle('on');
  document.getElementById('aa-fs').textContent = fs;
}
document.addEventListener('click', e=>{
  const p = document.getElementById('aa-pop');
  const hit = /** @type {Element} */ (e.target);
  if(p.classList.contains('on') && !hit.closest('#aa-pop') && !hit.closest('#aafab'))
    p.classList.remove('on');
});
let darkMode = load('breeze.dark', false);
function applyDark(){
  document.body.classList.toggle('dark', !!darkMode);
  document.documentElement.classList.toggle('dark', !!darkMode);   // 화면 맨 아래까지 어둡게
  /* 다크 모드를 켜는 자리는 둘입니다 — 읽는 화면의 Aa 와 설정. 어느 쪽에서
     켜든 나머지 하나도 같은 자리로 옮겨 놓습니다. */
  const toggles = /** @type {NodeListOf<HTMLElement>} */
    (document.querySelectorAll('#aa-dark, #set-dark'));
  toggles.forEach(toggle => {
    toggle.classList.toggle('on', !!darkMode);
    toggle.setAttribute('aria-pressed', darkMode ? 'true' : 'false');
  });
}
function toggleDark(){ darkMode = !darkMode; save('breeze.dark', darkMode); applyDark(); }
applyDark();

/* ---- 설정 ----------------------------------------------------------------
   설정은 탭 두 개짜리 시트 하나입니다. "일반"에는 이 앱이 쓰는 말(언어)이,
   "다른 기기와 연결하기"에는 예전의 동기화 화면이 통째로 들어와 있습니다.
   동기화 쪽 내용을 그리는 것은 여전히 scripts/sync/sync.js 하나뿐입니다. */
function settingsModal(){ return document.getElementById('settings-modal'); }
/** @param {string} name */
function settingsTab(name){
  const card = settingsModal();
  /** @type {NodeListOf<HTMLElement>} */
  (card.querySelectorAll('.set-tab')).forEach(tab => tab.classList.toggle('on', tab.dataset.tab===name));
  /** @type {NodeListOf<HTMLElement>} */
  (card.querySelectorAll('.set-panel')).forEach(panel => panel.classList.toggle('on', panel.dataset.panel===name));
  /* 동기화 탭은 열릴 때마다 지금 상태로 다시 그립니다 — 로그인·복구키·마지막
     동기화 시각은 시트를 닫아 둔 사이에도 바뀝니다. */
  if(name==='sync'){
    if(typeof initSupabase==='function') initSupabase();
    if(typeof renderSyncModal==='function') renderSyncModal();
  }
}
/** @param {string} [tab] */
function openSettings(tab){
  settingsModal().classList.add('on');
  /* 시트를 닫아 둔 사이에 읽는 화면에서 바꿔 놓았을 수 있습니다. 열 때마다
     지금 값으로 맞춥니다. */
  applyDark();
  settingsTab(tab || 'general');
}
function closeSettings(){ settingsModal().classList.remove('on'); }
settingsModal().addEventListener('click', event => {
  if(event.target===settingsModal()) closeSettings();
});

/* 저장 단어는 원본에서도 글자 화면과 같은 블록으로 칠합니다. 밑줄·블록·끄기를
   고르는 설정이 있었지만 설정을 위한 설정이었습니다. 남아 있던 선택값은
   지웁니다 — 다음 판에서 되살아날 자리를 남기지 않습니다. */
try{ localStorage.removeItem('breeze.originalMarks'); }catch(e){}

/* 상단 막대는 스크롤을 따라 미끄러져 나갈 뿐, 자리는 늘 지킵니다. 예전 집중
   모드는 여기서 높이를 0으로 우겨서, 앵커 계산이 첫 줄을 로고 뒤에 숨겼습니다. */
function syncTopbarH(){
  const tb = document.getElementById('topbar');
  document.documentElement.style.setProperty('--topbar-h', (tb ? tb.offsetHeight : 0)+'px');
}
let lastAnchor = null;
window.addEventListener('resize', ()=>{
  syncTopbarH();
  if(!curBook) return;
  holdReaderAnchor(400);
  requestAnimationFrame(()=>{
    if(currentReaderMode==='original'){
      if(lastOriginalAnchor) restoreOriginalAnchor(lastOriginalAnchor);
    }else if(lastAnchor) restoreAnchor(lastAnchor);
  });
});
window.addEventListener('load', syncTopbarH);
syncTopbarH();
let miniTimer;
function miniToast(msg){
  const t = document.getElementById('minitoast');
  if(!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(miniTimer); miniTimer = setTimeout(()=>t.classList.remove('on'), 1800);
}
/* ---- 발음 ----------------------------------------------------------------
   1순위: 사전이 주는 원어민 녹음(mp3)   2순위: 기기 내장 음성(TTS)
   앱(Capacitor)으로 옮길 때도 이 함수 안쪽만 교체하면 됩니다.            */
let curAudio = null, speakGeneration = 0;
function speak(text){
  const btn = document.getElementById('p-speak');
  const mark = on => btn && btn.classList.toggle('playing', on);
  const generation=++speakGeneration;
  try{ if(curAudio){ curAudio.pause(); curAudio.removeAttribute('src'); curAudio.load(); curAudio = null; } }catch(e){}
  try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(e){}
  if(!window.speechSynthesis){ toast('이 브라우저는 발음 재생을 지원하지 않아요'); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 0.95;
  const v = speechSynthesis.getVoices().find(v=>/^en(-|_)/i.test(v.lang));
  if(v) u.voice = v;
  u.onstart = ()=>{ if(generation===speakGeneration) mark(true); };
  u.onend = u.onerror = ()=>{ if(generation===speakGeneration) mark(false); };
  /* 원어민 mp3는 내려받고 실패하는 동안 뒤늦게 여러 TTS를 쌓았습니다. 발음은
     사전 정보보다 즉시성이 중요하므로, 기기 음성만 바로 재생합니다. */
  speechSynthesis.speak(u);
}
function speakWord(){
  const w = words[selKey]; if(!w) return;
  speak(w.word);
}

let toastTimer;
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('on'),2600);
}
window.addEventListener('beforeunload', saveReadingState);
