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
   · 표시: 문단 innerHTML을 건드리지 않습니다 — 낱말 상자는 화면 근처에서만
     붙었다 떨어집니다(reader.js `hydrateWordSpanBatch`). 문장·낱말 강조는 글자
     자리(offset)로 만든 Range를 CSS Custom Highlight로 칠하고, 문단 DOM이
     바뀌면 다시 만듭니다.

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
/* `boundary`의 charIndex는 말하는 문장 안의 자리입니다. charLength가 없는 엔진은
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
  rate:1, generation:0, utterance:null, voice:null,
  follow:true, wordPause:null, lastPreviousAt:0,
  blocks:null, blocksFirst:null, blocksCount:0,
  watched:null, observer:null, repaintFrame:0, scrollFrame:0, scrollToken:0,
  hintTimer:0, fallbackLayer:null,
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
function listeningRange(sentence, from, to){
  const block=sentence && listeningBlocks()[sentence.index];
  if(!block || !block.el.isConnected || typeof domRangeForOffsets!=='function') return null;
  return domRangeForOffsets(block.el, sentence.start+(from||0), sentence.start+(to==null ? sentence.end-sentence.start : to));
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
  listening.sentence=sentence;
  listening.word=null;
  listening.wordPause=null;
  listening.playing=true;
  if(listening.book && !listening.book.transient)
    listeningWrite(LISTEN_POSITION_KEY+listening.book.id, {index:sentence.index, pi:sentence.pi, start:sentence.start, t:Date.now()});
  listeningBodyClass('listening-fading', false);
  listeningPaint();
  if(listening.follow || options.follow) listeningFollow(!!options.follow);
  listeningSpeak(sentence);
  listeningRenderBar();
}
function listeningSpeak(sentence){
  const synth=window.speechSynthesis;
  const generation=++listening.generation;
  try{ synth.cancel(); }catch(error){}
  const utterance=new SpeechSynthesisUtterance(sentence.text);
  const voice=listeningVoice();
  if(voice) utterance.voice=voice;
  utterance.lang=voice && voice.lang ? voice.lang : 'en-US';
  utterance.rate=listening.rate;
  utterance.onboundary=event=>{
    if(generation!==listening.generation || (event.name && event.name!=='word')) return;
    listening.word=listeningWordRange(sentence.text, event.charIndex, /** @type {any} */(event).charLength);
    listeningPaint();
    if(listening.follow) listeningFollowWord();
  };
  utterance.onend=()=>{
    if(generation!==listening.generation) return;
    listeningAdvance();
  };
  utterance.onerror=event=>{
    if(generation!==listening.generation) return;
    if(/interrupted|canceled|cancelled/i.test((event && event.error) || '')) return;
    listening.playing=false;
    listeningRenderBar();
    if(typeof toast==='function') toast('기기 음성으로 읽지 못했어요');
  };
  /* Chrome은 붙잡는 곳이 없는 utterance를 치워 버려 `end`가 안 오는 일이 있습니다. */
  listening.utterance=utterance;
  try{ if(synth.paused) synth.resume(); }catch(error){}
  synth.speak(utterance);
}
function listeningHalt(){
  listening.generation++;
  listening.playing=false;
  listening.word=null;
  try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(error){}
}
function listeningAdvance(){
  const next=listeningStep(listeningBlocks(), listening.sentence, 1, listeningPartsOf);
  if(next){ listeningPlay(next); return; }
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
  else listeningAdvance();
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
      listeningPaint();
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

/* "여기서부터 듣기" — 문장 결과(#ps-listen)와 실패 필(#sentence-peek-listen)의 단추.
   꾹 누르기만으로는 듣기 자리가 움직이지 않고, 이 단추를 눌렀을 때만 옮깁니다. */
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
function listeningHighlightApi(){
  const view=/** @type {any} */(window);
  return view.CSS && view.CSS.highlights && typeof view.Highlight==='function' ? view : null;
}
function listeningClearPaint(){
  if(typeof window==='undefined') return;
  const api=listeningHighlightApi();
  if(api){ api.CSS.highlights.delete('breeze-listen-sentence'); api.CSS.highlights.delete('breeze-listen-word'); }
  if(listening.fallbackLayer){ listening.fallbackLayer.remove(); listening.fallbackLayer=null; }
  listeningBodyClass('listening-fallback', false);
  if(listening.observer) listening.observer.disconnect();
  listening.watched=null;
  if(listening.repaintFrame) cancelAnimationFrame(listening.repaintFrame);
  listening.repaintFrame=0;
  listeningBodyClass('listening-dim', false);
}
function listeningPaint(){
  const sentence=listening.sentence;
  const block=sentence && listeningBlocks()[sentence.index];
  if(!listening.active || !block){ listeningClearPaint(); return; }
  const range=listeningRange(sentence);
  const word=listening.word ? listeningRange(sentence, listening.word.start, listening.word.end) : null;
  const api=listeningHighlightApi();
  if(api){
    api.CSS.highlights.set('breeze-listen-sentence', new api.Highlight(range));
    if(word){
      const highlight=new api.Highlight(word);
      highlight.priority=1;
      api.CSS.highlights.set('breeze-listen-word', highlight);
    }else api.CSS.highlights.delete('breeze-listen-word');
    listeningBodyClass('listening-dim', true);
  }else listeningPaintFallback(range, word);
  /* 낱말 상자가 붙거나 떨어지면 문단의 글자 마디가 바뀌어 Range가 접힙니다.
     지금 읽는 문단 하나만 지켜보고 다음 프레임에 다시 칠합니다. */
  if(listening.watched!==block.el && typeof MutationObserver==='function'){
    if(!listening.observer) listening.observer=new MutationObserver(()=>{
      if(listening.repaintFrame) return;
      listening.repaintFrame=requestAnimationFrame(()=>{ listening.repaintFrame=0; listeningPaint(); });
    });
    listening.observer.disconnect();
    listening.observer.observe(block.el, {childList:true, subtree:true, characterData:true});
    listening.watched=block.el;
  }
}
/* Custom Highlight가 없는 WebKit(iOS 17.1 이하)에서는 글자색을 못 바꾸므로 흐리게
   하지 않고, 문장·낱말 자리에 옅은 바탕만 깝니다. */
function listeningPaintFallback(range, word){
  const host=document.getElementById('readwrap');
  if(!host || !range) return;
  let layer=listening.fallbackLayer;
  if(!layer){
    layer=document.createElement('div');
    layer.className='listen-cue-layer';
    layer.setAttribute('aria-hidden','true');
    listeningBodyClass('listening-fallback', true);
    host.appendChild(layer);
    listening.fallbackLayer=layer;
  }
  const base=host.getBoundingClientRect();
  const rects=[...range.getClientRects()].map(rect=>['listen-cue',rect])
    .concat(word ? [...word.getClientRects()].map(rect=>['listen-cue listen-cue-word',rect]) : []);
  layer.replaceChildren(...rects.map(([name,rect])=>{
    const cue=document.createElement('span');
    cue.className=name;
    cue.style.cssText=`left:${rect.left-base.left}px;top:${rect.top-base.top}px;width:${rect.width}px;height:${rect.height}px`;
    return cue;
  }));
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
  const sentence=listening.sentence, word=listening.word;
  if(!sentence || !word) return;
  listeningBring(listeningRange(sentence, word.start, word.end));
}
/* 띠 밖에 있을 때만, 그 첫 줄을 화면 위쪽 1/3 쯤으로 옮깁니다. 띠보다 긴 문장은
   읽는 낱말이 띠 아래로 내려갈 때 다시 옮깁니다. */
function listeningBring(range, always){
  if(!range) return;
  const rect=range.getBoundingClientRect(), band=listeningBand();
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
