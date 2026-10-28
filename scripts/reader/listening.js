/* ================= 듣기 모드 =================

   Breeze가 함께 싣는 공개 저작물 고전만 기기 음성(Web Speech `speechSynthesis`)
   으로 읽어 줍니다. 서버도, 내려받는 음성도 없습니다.

   ── 누가 무엇을 맡는가 ──
   · 어느 책인가: `listeningBookEligible()` 하나가 정합니다. 고전 목록이 가져온
     책에만 `longReadId`가 붙고(scripts/library/longreads.js `importLongRead`),
     그 목록의 공개 저작물 라이선스가 있어야 합니다. 사용자가 넣은 EPUB·PDF·TXT,
     기사·RSS·AO3, 미리보기, CC BY-SA인 Homeward는 단추가 아예 없습니다.
   · 어느 문장인가: 꾹 누르기와 같은 문장 나누기(`bridgeSentences`)를 같은 문단
     요소(`#rtext [data-pi]`) 위에서 씁니다. 그래서 "여기서부터 듣기"가 가리키는
     문장과 읽어 주는 문장이 어긋날 자리가 없습니다.
   · 손짓: 판정은 여전히 scripts/reader/gesture.js 하나입니다. 이 파일은 종이에
     손짓 리스너를 달지 않습니다. 글자판 surface가 낱말을 열기 직전에
     `listeningWordTap()`에 한 번 묻고, 단추들은 제 `onclick`을 받습니다.
   · 말하기: 문장마다 utterance를 만들고 `end`를 기다려 다음을 `speak()`하면, 그리고
     그 앞에서 `cancel()`하면 문장 사이마다 엔진이 다시 시작하느라 소리가 끊깁니다.
     그래서 다음 덩어리를 미리 큐에 넣어 두고(늘 둘), 덩어리 사이에는 `cancel()`이
     없습니다. 낱말 경계(`boundary`)를 주는 음성이면 덩어리는 문단의 남은 문장
     전부이고 지금 문장은 경계의 `charIndex`가 알려 줍니다. 경계를 주지 않는
     음성(Chrome의 원격 음성 등)은 문장 하나씩이고, 각 덩어리의 `start`가 알려
     줍니다 — 시계로 짐작하지 않습니다.
   · 표시: 지금 문장의 글자 마디에 `listen-cur`, 지금 낱말에 `listen-word` class를
     붙입니다(`listeningMark`). 낱말 상자(.w)가 통째로 들어가면 그 상자에, 아니면
     그 글자 조각만 span으로 감쌉니다. 글자는 바뀌지 않으므로 offset·낱말 찾기·
     문장 찾기가 그대로입니다. 예전의 CSS `::highlight()`는 Mac Safari에서 글자색을
     바꾸지 못해 지금 문장도 흐린 채로 남았습니다. 낱말 상자가 붙었다 떨어지면
     (reader.js `hydrateWordSpanBatch`) 지금 문단만 지켜보다가 다시 붙입니다.

   ── 멈춤은 취소입니다 ──
   `speechSynthesis.pause()`는 Android Chrome에서 멈추지 않고, iOS에서는 다시
   이어지지 않는 일이 있습니다. 그래서 멈춤·속도 변경·낱말 보기는 모두 말을
   취소하고, 다시 들을 때 그 문장 처음부터 읽습니다. 늦게 오는 `end`/`error`는
   세대 번호(`generation`)로 거릅니다. */

const LISTEN_RATES = [0.75, 1, 1.25];
/* ⏮을 이 시간 안에 다시 누르면 앞 문장으로 갑니다. */
const LISTEN_PREVIOUS_WINDOW_MS = 1200;
/* 낱말 창이 끝내 열리지 않았으면(같은 낱말 다시 누르기 등) 이만큼 뒤에 이어 읽습니다. */
const LISTEN_WORD_OPEN_GRACE_MS = 1500;
const LISTEN_POSITION_KEY = 'breeze.listen.v1:';
const LISTEN_RATE_KEY = 'breeze.listen.rate.v1';
const LISTEN_HINT_KEY = 'breeze.listen.hint.v1';
const LISTEN_HINT_MS = 5000;

/* ================= 순수 판단 (tests/verify-listening.mjs) ================= */

function listeningBookEligible(book){
  if(!book || book.transient || book.kind!=='txt') return false;
  const id=typeof book.longReadId==='string' ? book.longReadId : '';
  if(!id) return false;
  const read=typeof longReadDefinition==='function' ? longReadDefinition(id) : null;
  const license=String((read && read.license) || (book.attribution && book.attribution.license) || '');
  return /public domain/i.test(license);
}
function listeningSupported(view){
  return !!(view && view.speechSynthesis && typeof view.SpeechSynthesisUtterance==='function');
}
function listeningSentenceParts(pi, text){
  return (typeof homewardSentenceParts==='function' && homewardSentenceParts(pi,text))
    || bridgeSentences(text);
}
function listeningPartIndex(parts, start){
  let index=parts.findIndex(part=>start>=part.start && start<part.end);
  if(index<0) index=parts.findIndex(part=>part.start>=start);
  return index<0 ? parts.length-1 : index;
}
/* blocks: 문단 요소 순서대로 [{pi, ...}], partsOf(block) → [{start,end,text}].
   cursor {index,start}에서 delta(−1·0·+1)만큼 옮긴 문장을 돌려줍니다. 문장이
   없는 문단(그림 설명이 빈 칸 등)은 건너뛰고, 쪽·장 경계는 경계가 아닙니다 —
   문단 목록이 책 전체를 한 줄로 잇기 때문입니다. 끝 너머는 null입니다. */
function listeningStep(blocks, cursor, delta, partsOf){
  if(!cursor || !blocks.length) return null;
  let index=Number(cursor.index);
  if(!(index>=0 && index<blocks.length)) return null;
  const sentence=(i,parts,j)=>({index:i, pi:blocks[i].pi, start:parts[j].start, end:parts[j].end, text:parts[j].text});
  let parts=partsOf(blocks[index]);
  const at=parts.length ? listeningPartIndex(parts, Number(cursor.start)||0) : -1;
  if(!delta){
    if(at>=0) return sentence(index,parts,at);
    delta=1;
  }
  if(delta>0){
    if(at>=0 && at+1<parts.length) return sentence(index,parts,at+1);
    for(index++; index<blocks.length; index++){
      parts=partsOf(blocks[index]);
      if(parts.length) return sentence(index,parts,0);
    }
    return null;
  }
  if(at>0) return sentence(index,parts,at-1);
  for(index--; index>=0; index--){
    parts=partsOf(blocks[index]);
    if(parts.length) return sentence(index,parts,parts.length-1);
  }
  return null;
}
/* 저장해 둔 자리를 지금 그린 문단 목록에 다시 앉힙니다. 문단 순서는 같은 책이면
   같지만, 혹시 바뀌었으면 같은 문단 번호(pi)의 첫 요소로 갑니다. */
function listeningResolveCursor(blocks, saved){
  if(!saved || !blocks.length) return null;
  const index=Number(saved.index), pi=Number(saved.pi);
  if(index>=0 && index<blocks.length && blocks[index].pi===pi) return {index, start:Number(saved.start)||0};
  const found=blocks.findIndex(block=>block.pi===pi);
  return found<0 ? null : {index:found, start:Number(saved.start)||0};
}
function listeningPreviousAction(now, lastPressAt){
  return lastPressAt && now-lastPressAt>=0 && now-lastPressAt<=LISTEN_PREVIOUS_WINDOW_MS ? 'previous' : 'restart';
}
function listeningNextRate(rate){
  const index=LISTEN_RATES.indexOf(rate);
  return index<0 ? 1 : LISTEN_RATES[(index+1)%LISTEN_RATES.length];
}
function listeningRateLabel(rate){
  return (rate===1 ? '1.0' : String(rate))+'x';
}
/* 한 번에 말할 덩어리. `whole`이면 그 문단의 남은 문장 전부, 아니면 문장 하나.
   문장들은 공백 하나로 잇고, 각 문장의 `offset`은 덩어리 글 안의 자리입니다. */
function listeningChunk(blocks, cursor, partsOf, whole){
  const first=listeningStep(blocks, cursor, 0, partsOf);
  if(!first) return null;
  const parts=partsOf(blocks[first.index]);
  const from=listeningPartIndex(parts, first.start);
  const sentences=[];
  let text='';
  for(const part of whole ? parts.slice(from) : [parts[from]]){
    if(text) text+=' ';
    sentences.push({index:first.index, pi:first.pi, start:part.start, end:part.end, text:part.text, offset:text.length});
    text+=part.text;
  }
  return {index:first.index, sentences, text};
}
function listeningNextChunk(blocks, chunk, partsOf, whole){
  const next=listeningStep(blocks, chunk.sentences[chunk.sentences.length-1], 1, partsOf);
  return next ? listeningChunk(blocks, next, partsOf, whole) : null;
}
function listeningChunkSentence(chunk, charIndex){
  let found=chunk.sentences[0];
  for(const sentence of chunk.sentences) if(sentence.offset<=charIndex) found=sentence;
  return found;
}
/* `boundary`의 charIndex는 말하는 덩어리 안의 자리입니다. charLength가 없는 엔진은
   그 자리에서 낱말 하나를 셉니다. 앞의 공백·따옴표는 건너뜁니다. */
function listeningWordRange(text, charIndex, charLength){
  const source=String(text||'');
  const at=Math.max(0, Math.min(source.length, Math.floor(Number(charIndex)||0)));
  const pattern=/[A-Za-z0-9\u00C0-\u024F]+(?:['\u2019\-][A-Za-z0-9\u00C0-\u024F]+)*/g;
  pattern.lastIndex=at;
  const match=pattern.exec(source);
  if(Number(charLength)>0){
    let start=at, end=Math.min(source.length, at+Math.floor(Number(charLength)));
    while(start<end && /[\s"'\u201c\u201d\u2018\u2019(\[]/.test(source[start])) start++;
    while(end>start && /[\s.,;:!?"'\u201c\u201d\u2018\u2019)\]\u2014\u2013-]/.test(source[end-1])) end--;
    return end>start ? {start, end} : null;
  }
  if(!match || match.index-at>3) return null;
  return {start:match.index, end:match.index+match[0].length};
}
/* 문장 상자가 읽는 띠(band) 밖으로 나갔는지 — 따라가야 하는지 — 와,
   조금이라도 보이는지를 따로 봅니다. */
function listeningOutsideBand(rect, band){
  return !!rect && (rect.top<band.top || rect.bottom>band.bottom);
}
function listeningOverlapsBand(rect, band){
  return !!rect && rect.bottom>band.top && rect.top<band.bottom && rect.height>0;
}

/* ================= 화면과 음성 ================= */

const listening = {
  active:false, playing:false, book:null, sentence:null, word:null,
  rate:1, generation:0, voice:null, queue:[], boundaries:false, keepAlive:0,
  follow:true, wordPause:null, lastPreviousAt:0,
  blocks:null, blocksFirst:null, blocksCount:0,
  marked:null, marks:[], wordMarks:[], observer:null, repaintFrame:0, scrollFrame:0, scrollToken:0,
  hintTimer:0,
};

function listeningStorage(){
  try{ return typeof localStorage==='undefined' ? null : localStorage; }catch(error){ return null; }
}
function listeningRead(key){
  try{ const raw=listeningStorage()?.getItem(key); return raw ? JSON.parse(raw) : null; }catch(error){ return null; }
}
function listeningWrite(key, value){
  try{ const store=listeningStorage(); if(!store) return; if(value==null) store.removeItem(key); else store.setItem(key, JSON.stringify(value)); }catch(error){}
}
function listeningBodyClass(name, on){
  if(typeof document!=='undefined' && document.body) document.body.classList.toggle(name, !!on);
}

/* 문단 목록은 그린 본문이 바뀔 때만 다시 셉니다(Aa가 본문을 다시 그리면 첫 요소가 바뀝니다). */
function listeningBlocks(){
  const root=document.getElementById('rtext');
  if(!root) return [];
  if(listening.blocks && listening.blocksFirst===root.firstElementChild
     && listening.blocksCount===root.childElementCount) return listening.blocks;
  const blocks=[];
  for(const element of root.querySelectorAll('[data-pi]')){
    const el=/** @type {HTMLElement} */(element);
    if(el.querySelector('[data-pi]') || el.matches('pre,figure,.toc-entry')) continue;
    const pi=Number(el.dataset.pi);
    if(!Number.isFinite(pi)) continue;
    blocks.push({pi, el, parts:null});
  }
  listening.blocks=blocks;
  listening.blocksFirst=root.firstElementChild;
  listening.blocksCount=root.childElementCount;
  return blocks;
}
function listeningPartsOf(block){
  if(!block.parts) block.parts=listeningSentenceParts(block.pi, block.el.textContent||'');
  return block.parts;
}
function listeningIndexOf(element){
  return listeningBlocks().findIndex(block=>block.el===element);
}
function listeningRange(sentence){
  const block=sentence && listeningBlocks()[sentence.index];
  if(!block || !block.el.isConnected || typeof domRangeForOffsets!=='function') return null;
  return domRangeForOffsets(block.el, sentence.start, sentence.end);
}

function listeningAvailable(){
  return !!curBook && currentReaderMode==='text' && listeningBookEligible(curBook)
    && listeningSupported(typeof window==='undefined' ? null : window);
}
/* 책을 열거나 모드를 바꿀 때마다(reader-modes.js `updateReaderModeControls`), 그리고
   서재로 나갈 때(state.js `show`) 부릅니다. 단추의 있고 없음과, 다른 책·모드로
   넘어간 듣기의 끝을 여기 하나가 맡습니다. */
function syncListeningControls(){
  if(typeof document==='undefined') return;
  const available=listeningAvailable();
  listeningBodyClass('listening-available', available);
  const fab=document.getElementById('listenfab');
  if(fab) fab.hidden=!available;
  if(listening.active && (!available || listening.book!==curBook)) stopListening();
}

function listeningVoice(){
  const synth=window.speechSynthesis;
  let voices=[];
  try{ voices=synth.getVoices()||[]; }catch(error){ voices=[]; }
  const english=voices.filter(voice=>/^en([-_]|$)/i.test(voice.lang||''));
  const pick=list=>list.find(voice=>/^en[-_]US$/i.test(voice.lang)&&voice.localService)
    || list.find(voice=>voice.localService) || list.find(voice=>/^en[-_]US$/i.test(voice.lang)) || list[0] || null;
  return pick(english);
}

/* 🎧 — 사용자의 탭 안에서 곧바로 말을 시작합니다. iOS Safari는 손짓 밖에서 처음
   시작한 `speak()`를 소리 없이 버립니다. 그래서 여기에는 await가 없습니다. */
function startListening(){
  if(!listeningAvailable()) return;
  const blocks=listeningBlocks();
  const remembered=listeningResolveCursor(blocks, listeningRead(LISTEN_POSITION_KEY+curBook.id));
  const cursor=remembered || listeningFirstVisible();
  listeningBegin(cursor);
}
function listeningBegin(cursor){
  const sentence=listeningStep(listeningBlocks(), cursor, 0, listeningPartsOf);
  if(!sentence){ if(typeof toast==='function') toast('읽을 문장을 찾지 못했어요'); return; }
  const stored=listeningRead(LISTEN_RATE_KEY);
  if(!listening.active) listening.rate=LISTEN_RATES.includes(stored) ? stored : 1;
  listening.active=true;
  listening.book=curBook;
  listening.follow=true;
  listening.lastPreviousAt=0;
  listeningBodyClass('reader-listening', true);
  if(typeof syncReaderControlInteractivity==='function') syncReaderControlInteractivity();
  listeningShowReturn(false);
  listeningPlay(sentence, {follow:true});
  listeningHintOnce();
  const toggle=document.getElementById('listen-toggle');
  if(toggle && document.activeElement && document.activeElement.id==='listenfab') toggle.focus({preventScroll:true});
}

function listeningPlay(sentence, options={}){
  if(!listening.active || !sentence) return;
  listeningHalt();
  listening.playing=true;
  listening.wordPause=null;
  listening.voice=listeningVoice();
  listeningKeepAlive(listening.voice);
  listeningBodyClass('listening-fading', false);
  listeningSetSentence(sentence, true);
  if(listening.follow || options.follow) listeningFollow(!!options.follow);
  listeningEnqueue(listeningChunk(listeningBlocks(), sentence, listeningPartsOf, listening.boundaries));
  listeningFill();
  listeningRenderBar();
}
/* 지금 문장을 바꾸는 곳은 여기 하나입니다 — 자리 기억·칠하기·따라가기가 함께 갑니다. */
function listeningSetSentence(sentence, repaint){
  const current=listening.sentence;
  const same=current && current.index===sentence.index && current.start===sentence.start;
  listening.sentence=sentence;
  if(same && !repaint) return;
  listening.word=null;
  if(listening.book && !listening.book.transient)
    listeningWrite(LISTEN_POSITION_KEY+listening.book.id, {index:sentence.index, pi:sentence.pi, start:sentence.start, t:Date.now()});
  listeningPaint();
  if(!repaint && listening.follow) listeningFollow(false);
}
function listeningEnqueue(chunk){
  if(!chunk) return;
  const generation=listening.generation, voice=listening.voice;
  const alive=()=>generation===listening.generation;
  const utterance=new SpeechSynthesisUtterance(chunk.text);
  if(voice) utterance.voice=voice;
  utterance.lang=voice && voice.lang ? voice.lang : 'en-US';
  utterance.rate=listening.rate;
  utterance.onstart=()=>{ if(alive()) listeningChunkStarted(chunk); };
  utterance.onboundary=event=>{
    if(!alive() || (event.name && event.name!=='word')) return;
    listening.boundaries=true;
    listeningChunkStarted(chunk);
    const sentence=listeningChunkSentence(chunk, event.charIndex);
    listeningSetSentence(sentence);
    const word=listeningWordRange(chunk.text, event.charIndex, /** @type {any} */(event).charLength);
    const inside=word && word.start>=sentence.offset && word.end<=sentence.offset+sentence.text.length;
    listening.word=inside ? {start:sentence.start+word.start-sentence.offset, end:sentence.start+word.end-sentence.offset} : null;
    listeningPaintWord();
    if(listening.follow) listeningFollowWord();
  };
  utterance.onend=()=>{ if(alive()) listeningChunkEnded(chunk); };
  utterance.onerror=event=>{
    if(!alive() || /interrupted|canceled|cancelled/i.test((event && event.error) || '')) return;
    listeningHalt();
    listeningPaint();
    listeningRenderBar();
    if(typeof toast==='function') toast('기기 음성으로 읽지 못했어요');
  };
  /* 큐가 utterance를 붙잡고 있습니다. Chrome은 붙잡는 곳이 없는 utterance를 치워 `end`를 잃습니다. */
  chunk.utterance=utterance;
  listening.queue.push(chunk);
  window.speechSynthesis.speak(utterance);
}
/* 엔진 큐에는 늘 지금 덩어리와 다음 덩어리가 있습니다. 끝나는 순간 다음이 바로 이어집니다. */
function listeningFill(){
  while(listening.playing && listening.queue.length && listening.queue.length<2){
    const next=listeningNextChunk(listeningBlocks(), listening.queue[listening.queue.length-1], listeningPartsOf, listening.boundaries);
    if(!next) return;
    listeningEnqueue(next);
  }
}
function listeningChunkStarted(chunk){
  if(chunk.started) return;
  chunk.started=true;
  const at=listening.queue.indexOf(chunk);
  if(at>0) listening.queue.splice(0, at);
  listeningSetSentence(chunk.sentences[0]);
  listeningFill();
}
function listeningChunkEnded(chunk){
  const at=listening.queue.indexOf(chunk);
  if(at>=0) listening.queue.splice(0, at+1);
  listeningFill();
  const next=listening.queue[0];
  /* 다음 덩어리의 `start`가 늦게 와도 표시는 지금 넘어갑니다. */
  if(next){ if(!next.started) listeningSetSentence(next.sentences[0]); return; }
  listeningFinish();
}
/* Chrome의 원격(네트워크) 음성은 한 utterance가 15초쯤 지나면 소리 없이 멈추고 `end`도
   주지 않습니다. 그 음성일 때만 10초마다 pause/resume으로 깨웁니다. Safari에서는
   pause/resume이 말을 끊으므로 하지 않습니다. */
function listeningKeepAlive(voice){
  clearInterval(listening.keepAlive);
  listening.keepAlive=0;
  const agent=typeof navigator==='undefined' ? '' : navigator.userAgent||'';
  const safari=/safari/i.test(agent) && !/chrome|chromium|crios|android/i.test(agent);
  if(!voice || voice.localService || safari) return;
  listening.keepAlive=setInterval(()=>{
    const synth=window.speechSynthesis;
    if(listening.playing && synth.speaking && !synth.paused){ synth.pause(); synth.resume(); }
  }, 10000);
}
/* 사람이 멈추거나 자리를 옮길 때만 취소합니다. 덩어리 사이에는 부르지 않습니다. */
function listeningHalt(){
  listening.generation++;
  listening.playing=false;
  listening.word=null;
  clearInterval(listening.keepAlive);
  listening.keepAlive=0;
  const queued=listening.queue.length;
  listening.queue=[];
  try{
    const synth=window.speechSynthesis;
    if(synth && (queued || synth.speaking || synth.pending)) synth.cancel();
  }catch(error){}
}
function listeningFinish(){
  const book=listening.book;
  stopListening();
  if(book) listeningWrite(LISTEN_POSITION_KEY+book.id, null);
  if(typeof readerPillStatus==='function') readerPillStatus('끝까지 들었어요');
}

/* ---- 단추 ---- */
function toggleListening(){
  if(!listening.active) return;
  if(listening.playing){
    listeningHalt();
    listening.wordPause=null;
    listeningPaint();
    listeningRenderBar();
    return;
  }
  listeningPlay(listening.sentence);
}
function listeningPrevious(){
  if(!listening.active || !listening.sentence) return;
  const now=Date.now();
  const action=listeningPreviousAction(now, listening.lastPreviousAt);
  listening.lastPreviousAt=now;
  const target=action==='previous'
    ? listeningStep(listeningBlocks(), listening.sentence, -1, listeningPartsOf) || listening.sentence
    : listening.sentence;
  listeningPlay(target);
}
function listeningNext(){
  if(!listening.active || !listening.sentence) return;
  const next=listeningStep(listeningBlocks(), listening.sentence, 1, listeningPartsOf);
  if(next) listeningPlay(next);
  else listeningFinish();
}
function cycleListeningRate(){
  if(!listening.active) return;
  listening.rate=listeningNextRate(listening.rate);
  listeningWrite(LISTEN_RATE_KEY, listening.rate);
  /* 말하는 중에는 속도를 바꿀 수 없습니다. 그 문장 처음부터 새 속도로 읽습니다. */
  if(listening.playing) listeningPlay(listening.sentence);
  else listeningRenderBar();
}
function stopListening(){
  const wasActive=listening.active;
  listeningHalt();
  listening.active=false;
  listening.book=null;
  listening.sentence=null;
  listening.wordPause=null;
  listening.scrollToken++;
  clearTimeout(listening.hintTimer);
  listeningClearPaint();
  listeningBodyClass('reader-listening', false);
  listeningBodyClass('listening-fading', false);
  listeningShowReturn(false);
  const hint=typeof document==='undefined' ? null : document.getElementById('listen-hint');
  if(hint) hint.hidden=true;
  if(wasActive){
    listeningRenderBar();
    if(typeof syncReaderControlInteractivity==='function') syncReaderControlInteractivity();
    /* 막대가 접힌 컨트롤 자리로 돌아가지 않도록 평소 줄을 펼쳐 둡니다 — 🎧가 바로 보입니다. */
    if(curBook && typeof expandReaderChrome==='function') expandReaderChrome();
    const fab=document.getElementById('listenfab');
    if(fab && !fab.hidden && document.activeElement && document.activeElement.closest
       && document.activeElement.closest('#listen-bar')) fab.focus({preventScroll:true});
  }
}
function listeningRenderBar(){
  const bar=document.getElementById('listen-bar');
  if(!bar) return;
  bar.hidden=!listening.active;
  bar.classList.toggle('is-playing', listening.active && listening.playing);
  const label=document.getElementById('listen-label');
  if(label) label.textContent=listening.playing ? '듣는 중' : '멈춤';
  const toggle=document.getElementById('listen-toggle');
  if(toggle){
    const name=listening.playing ? '일시정지' : '이어 듣기';
    toggle.setAttribute('aria-label', name); toggle.title=name;
  }
  const rate=document.getElementById('listen-rate');
  if(rate){
    rate.textContent=listeningRateLabel(listening.rate);
    rate.setAttribute('aria-label', `재생 속도 ${listeningRateLabel(listening.rate)} · 눌러서 바꾸기`);
  }
}

/* ---- 낱말·문장 손짓과의 약속 ----
   글자판 surface가 낱말 창을 열기 직전에 묻습니다(reader.js). true면 그 탭은
   듣기의 것이고 낱말 창은 열리지 않습니다. */
function listeningWordTap(span){
  if(!listening.active || !listening.sentence || typeof textSentencePartAt!=='function') return false;
  const found=textSentencePartAt(span);
  if(!found) return false;
  const index=listeningIndexOf(found.block);
  if(index===listening.sentence.index && found.part.start===listening.sentence.start){
    /* 지금 읽는 문장 — 처음부터 다시 읽습니다. 떠 있던 작은 뜻 필은 치웁니다. */
    listening.wordPause=null;
    if(typeof wordSurfaceAnchored==='function' && wordSurfaceAnchored() && typeof closePanel==='function') closePanel();
    listeningPlay(listening.sentence);
    return true;
  }
  if(listening.playing || listening.wordPause){
    /* 다른 문장의 낱말 — 말을 거두고 평소의 낱말 창을 엽니다. 창이 닫히면 읽던
       문장 처음부터 잇습니다. 읽는 자리는 옮기지 않습니다. */
    if(listening.playing){
      listeningHalt();
      listeningBodyClass('listening-fading', true);
      listeningPaintWord();
      listeningRenderBar();
    }
    const pause={sawOpen:false, startedAt:Date.now(), timer:0};
    pause.timer=setTimeout(()=>listeningWordSurfaceChanged(), LISTEN_WORD_OPEN_GRACE_MS);
    if(listening.wordPause) clearTimeout(listening.wordPause.timer);
    listening.wordPause=pause;
  }
  return false;
}
function listeningWordSurfaceOpen(){
  const panel=document.getElementById('panel'), peek=document.getElementById('word-peek');
  return !!(panel && panel.classList.contains('on')) || !!(peek && !peek.hidden);
}
function listeningWordSurfaceChanged(){
  const pause=listening.wordPause;
  if(!pause || !listening.active) return;
  if(listeningWordSurfaceOpen()){ pause.sawOpen=true; return; }
  if(!pause.sawOpen && Date.now()-pause.startedAt<LISTEN_WORD_OPEN_GRACE_MS) return;
  clearTimeout(pause.timer);
  listening.wordPause=null;
  listeningPlay(listening.sentence);
}

/* "여기서부터 듣기" — 문장 결과(#ps-listen)의 맨 위 단추. 실패 필은 승인된 그대로
   (문구와 재시도 하나) 둡니다. 꾹 누르기만으로는 듣기 자리가 움직이지 않고, 이
   단추를 눌렀을 때만 옮깁니다. */
function listenFromSentence(){
  const origin=typeof sentenceOrigin==='undefined' ? null : sentenceOrigin;
  const block=origin && origin.block;
  if(!block || !listeningAvailable()) return;
  const index=listeningIndexOf(block);
  if(index<0) return;
  const start=Number(origin.start)||0;
  if(typeof closeSentence==='function') closeSentence();
  if(listening.active){
    listening.follow=true;
    listeningShowReturn(false);
    listeningPlay(listeningStep(listeningBlocks(), {index, start}, 0, listeningPartsOf), {follow:true});
  }else listeningBegin({index, start});
}

/* ---- 처음 보이는 문장 ---- */
function listeningBand(){
  const box=readerScroller().getBoundingClientRect();
  const chrome=document.getElementById('readchrome');
  const chromeTop=chrome ? chrome.getBoundingClientRect().top : box.bottom;
  const inset=typeof topInset==='function' ? topInset() : 24;
  const top=box.top+Math.min(inset, box.height*.25);
  const bottom=Math.max(top+40, Math.min(box.bottom, chromeTop)-16);
  return {top, bottom, box};
}
function listeningFirstVisible(){
  const blocks=listeningBlocks();
  if(!blocks.length) return null;
  const band=listeningBand();
  let low=0, high=blocks.length-1;
  while(low<high){
    const middle=(low+high)>>1;
    if(blocks[middle].el.getBoundingClientRect().bottom<=band.top) low=middle+1;
    else high=middle;
  }
  let partial=null;
  for(let index=low; index<blocks.length && index<low+60; index++){
    const block=blocks[index];
    const blockRect=block.el.getBoundingClientRect();
    if(blockRect.top>=band.bottom) break;
    for(const part of listeningPartsOf(block)){
      const rect=domRangeForOffsets(block.el, part.start, part.end).getClientRects()[0];
      if(!rect) continue;
      if(rect.top>=band.top-4 && rect.top<band.bottom) return {index, start:part.start};
      if(!partial && rect.bottom>band.top) partial={index, start:part.start};
    }
  }
  if(partial) return partial;
  const parts=listeningPartsOf(blocks[low]);
  return {index:low, start:parts.length ? parts[0].start : 0};
}

/* ---- 칠하기 ---- */
/* 글자 [start,end) 를 class로 표시합니다. 글자 마디가 통째로 들어가는 낱말 상자(.w)는
   그 상자에, 그 밖의 글자는 그 조각만 span으로 감쌉니다. 요소 경계를 넘는 감싸기가
   없으므로 Holmes 문단 조각·이탤릭 표시가 섞여 있어도 됩니다. */
function listeningMark(root, start, end, name){
  const marks=[];
  if(!root || !(end>start)) return marks;
  const doc=root.ownerDocument||document;
  const walker=doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits=[];
  let at=0, node;
  while((node=/** @type {Text} */(walker.nextNode()))){
    const from=at;
    at+=node.data.length;
    if(at<=start) continue;
    if(from>=end) break;
    hits.push({text:node, a:Math.max(start,from)-from, b:Math.min(end,at)-from});
  }
  for(const {text, a, b} of hits){
    const parent=text.parentElement;
    if(a===0 && b===text.data.length && parent && parent.classList.contains('w') && parent.childNodes.length===1){
      parent.classList.add(name);
      marks.push({el:parent, wrap:false});
      continue;
    }
    let piece=text;
    if(b<piece.data.length) piece.splitText(b);
    if(a>0) piece=piece.splitText(a);
    const wrap=doc.createElement('span');
    wrap.className='listen-mark '+name;
    piece.replaceWith(wrap);
    wrap.appendChild(piece);
    marks.push({el:wrap, wrap:true});
  }
  return marks;
}
function listeningUnmark(marks, name){
  for(const mark of marks){
    if(!mark.el.isConnected) continue;
    if(mark.wrap) mark.el.replaceWith(...mark.el.childNodes);
    else mark.el.classList.remove(name);
  }
}
function listeningClearPaint(){
  if(typeof document==='undefined') return;
  listeningUnmark(listening.wordMarks, 'listen-word');
  listeningUnmark(listening.marks, 'listen-cur');
  listening.wordMarks=[];
  listening.marks=[];
  listening.marked=null;
  if(listening.observer){ listening.observer.takeRecords(); listening.observer.disconnect(); }
  if(listening.repaintFrame) cancelAnimationFrame(listening.repaintFrame);
  listening.repaintFrame=0;
  listeningBodyClass('listening-dim', false);
}
function listeningPaint(){
  listeningClearPaint();
  const sentence=listening.sentence;
  const block=sentence && listeningBlocks()[sentence.index];
  if(!listening.active || !block || !block.el.isConnected) return;
  listening.marks=listeningMark(block.el, sentence.start, sentence.end, 'listen-cur');
  listening.marked=block.el;
  listeningBodyClass('listening-dim', true);
  /* 낱말 상자가 붙거나 떨어지면(그 문단의 innerHTML이 바뀌면) 표시가 같이 지워집니다.
     지금 문단 하나만 지켜보다가 다음 프레임에 다시 붙입니다. 우리가 낸 변화는 버립니다. */
  if(typeof MutationObserver==='function'){
    if(!listening.observer) listening.observer=new MutationObserver(()=>{
      if(listening.repaintFrame) return;
      listening.repaintFrame=requestAnimationFrame(()=>{ listening.repaintFrame=0; listeningPaint(); });
    });
    listening.observer.observe(block.el, {childList:true, subtree:true, characterData:true});
  }
  listeningPaintWord();
}
function listeningPaintWord(){
  listeningUnmark(listening.wordMarks, 'listen-word');
  listening.wordMarks=[];
  const word=listening.word, el=listening.marked;
  if(word && el && el.isConnected) listening.wordMarks=listeningMark(el, word.start, word.end, 'listen-word');
  if(listening.observer) listening.observer.takeRecords();
}

/* ---- 따라가기 ----
   우리가 옮긴 스크롤은 `readerScrollTo`로만 씁니다. 그래야 reader.js의 하단 컨트롤
   접기와 아래의 "사람이 밀었나" 판단이 그 스크롤을 손짓으로 읽지 않습니다. */
function listeningFollow(force){
  if(!listening.active || (!listening.follow && !force)) return;
  const range=listeningRange(listening.sentence);
  if(!range) return;
  if(force){ listening.follow=true; listeningShowReturn(false); }
  listeningBring(range);
}
function listeningFollowWord(){
  const mark=listening.wordMarks[0];
  if(mark && mark.el.isConnected) listeningBring(mark.el);
}
/* 띠 밖에 있을 때만, 그 첫 줄을 화면 위쪽 1/3 쯤으로 옮깁니다. 띠보다 긴 문장은
   읽는 낱말이 띠 아래로 내려갈 때 다시 옮깁니다. */
function listeningBring(target, always){
  if(!target) return;
  const rect=target.getBoundingClientRect(), band=listeningBand();
  if(!always && !listeningOutsideBand(rect, band)) return;
  listeningScrollTo(readerScrollTop()+rect.top-(band.top+(band.bottom-band.top)*.28));
}
function listeningScrollTo(y){
  const from=readerScrollTop();
  const to=Math.max(0, Math.min(y, readerContentHeight()-readerViewHeight()));
  const token=++listening.scrollToken;
  if(listening.scrollFrame) cancelAnimationFrame(listening.scrollFrame);
  listening.scrollFrame=0;
  const reduced=typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced || Math.abs(to-from)<2 || Math.abs(to-from)>readerViewHeight()*3){ readerScrollTo(to); return; }
  const started=performance.now(), duration=320;
  const frame=now=>{
    listening.scrollFrame=0;
    if(token!==listening.scrollToken) return;
    /* 사람이 끼어들었으면 그 손을 따릅니다. */
    if(now>started && !readerScrollWasProgrammatic()) return;
    const t=Math.min(1,(now-started)/duration), eased=1-Math.pow(1-t,3);
    readerScrollTo(from+(to-from)*eased);
    if(t<1) listening.scrollFrame=requestAnimationFrame(frame);
  };
  listening.scrollFrame=requestAnimationFrame(frame);
}
let listeningScrollCheck=0;
function listeningReaderScrolled(){
  if(!listening.active || readerScrollWasProgrammatic() || listeningScrollCheck) return;
  listeningScrollCheck=requestAnimationFrame(()=>{
    listeningScrollCheck=0;
    if(!listening.active) return;
    listening.scrollToken++;
    const range=listeningRange(listening.sentence);
    const visible=!!range && listeningOverlapsBand(range.getBoundingClientRect(), listeningBand());
    listening.follow=visible;
    listeningShowReturn(!visible);
  });
}
function listeningShowReturn(show){
  if(typeof document==='undefined') return;
  const button=document.getElementById('listen-return');
  if(button) button.hidden=!show;
}
function returnToListeningSentence(){
  if(!listening.active) return;
  listening.follow=true;
  listeningShowReturn(false);
  listeningBring(listeningRange(listening.sentence), true);
}

/* ---- 한 번만 보이는 안내 ---- */
function listeningHintOnce(){
  if(listeningRead(LISTEN_HINT_KEY)) return;
  const hint=document.getElementById('listen-hint');
  if(!hint) return;
  listeningWrite(LISTEN_HINT_KEY, 1);
  hint.hidden=false;
  clearTimeout(listening.hintTimer);
  listening.hintTimer=setTimeout(()=>{ hint.hidden=true; }, LISTEN_HINT_MS);
}

if(typeof document!=='undefined' && typeof window!=='undefined'){
  const wire=()=>{
    const scroller=typeof readerScroller==='function' ? readerScroller() : null;
    if(scroller) scroller.addEventListener('scroll', listeningReaderScrolled, {passive:true});
    if(typeof MutationObserver==='function'){
      const watch=new MutationObserver(listeningWordSurfaceChanged);
      for(const id of ['panel','word-peek']){
        const element=document.getElementById(id);
        if(element) watch.observe(element, {attributes:true, attributeFilter:['class','hidden']});
      }
    }
    /* Chrome은 목록을 처음 물을 때 음성을 불러오기 시작합니다. 첫 🎧 전에 깨워 둡니다. */
    try{ window.speechSynthesis && window.speechSynthesis.getVoices(); }catch(error){}
    listeningRenderBar();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire, {once:true});
  else wire();
  /* 화면이 가려지면 말은 멈춥니다(iOS는 어차피 멈춥니다). 페이지를 떠나면 끝냅니다. */
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden && listening.active && listening.playing){
      listeningHalt(); listening.wordPause=null; listeningPaint(); listeningRenderBar();
    }
  });
  window.addEventListener('pagehide', ()=>{ if(listening.active) stopListening(); });
}
