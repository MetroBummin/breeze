/* ================= misc ================= */
let fs = load(LS_FS, 19);
document.documentElement.style.setProperty('--fs', fs+'px');
function fontSize(d){
  keepPlace(()=>{
    fs = Math.min(26, Math.max(14, fs+d));
    save(LS_FS, fs);
    document.documentElement.style.setProperty('--fs', fs+'px');
  });
  const el=document.getElementById('aa-fs'); if(el) el.textContent=fs;
}
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
  if(p.classList.contains('on') && !e.target.closest('#aa-pop') && !e.target.closest('#aafab'))
    p.classList.remove('on');
});
let darkMode = load('breeze.dark', false);
function applyDark(){
  document.body.classList.toggle('dark', !!darkMode);
  document.documentElement.classList.toggle('dark', !!darkMode);   // 화면 맨 아래까지 어둡게
  document.getElementById('aa-dark').classList.toggle('on', !!darkMode);
}
function toggleDark(){ darkMode = !darkMode; save('breeze.dark', darkMode); applyDark(); }
applyDark();

/* 저장 단어는 원본에서도 글자 화면과 같은 블록으로 칠합니다. 밑줄·블록·끄기를
   고르는 설정이 있었지만 설정을 위한 설정이었습니다. 남아 있던 선택값은
   지웁니다 — 다음 판에서 되살아날 자리를 남기지 않습니다. */
try{ localStorage.removeItem('breeze.originalMarks'); }catch(e){}

/* 집중 모드에서도 상단 막대는 로고 하나를 이고 남아 있습니다. 예전에는 여기서
   높이를 0으로 우겨서, 앵커 계산이 글 첫 줄을 로고 뒤에 숨겼습니다. */
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
function toggleFocus(force){
  const on = force!==undefined ? force : !document.body.classList.contains('focusmode');
  keepPlace(()=>{                       // 글 폭·여백이 바뀌어도 보던 문장 유지
    document.body.classList.toggle('focusmode', on);
    document.getElementById('fb-in').style.display = on ? 'none':'block';
    document.getElementById('fb-out').style.display = on ? 'block':'none';
    syncTopbarH();
  });
}
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
let curAudio = null;
function speak(text, audioUrl){
  const btn = document.getElementById('p-speak');
  const mark = on => btn && btn.classList.toggle('playing', on);
  try{ if(curAudio){ curAudio.pause(); curAudio = null; } }catch(e){}
  try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(e){}

  const tts = ()=>{
    if(!window.speechSynthesis){ toast('이 브라우저는 발음 재생을 지원하지 않아요'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.95;
    const v = speechSynthesis.getVoices().find(v=>/^en(-|_)/i.test(v.lang));
    if(v) u.voice = v;
    u.onstart = ()=>mark(true); u.onend = ()=>mark(false); u.onerror = ()=>mark(false);
    speechSynthesis.speak(u);
  };

  if(audioUrl){
    const a = new Audio(audioUrl);
    curAudio = a;
    a.onplay = ()=>mark(true);
    a.onended = ()=>{ mark(false); curAudio = null; };
    a.onerror = ()=>{ mark(false); curAudio = null; tts(); };   // 녹음이 없거나 막히면 기기 음성으로
    a.play().catch(()=>{ mark(false); curAudio = null; tts(); });
  }else tts();
}
function speakWord(){
  const w = words[selKey]; if(!w) return;
  speak(w.word, w.audio);
}

let toastTimer;
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('on'),2600);
}
window.addEventListener('beforeunload', saveReadingState);
