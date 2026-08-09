/* ================= 문장 통째로 물어보기 =================

   낱말 하나를 누르면 그 낱말의 뜻이 뜹니다. 그런데 낱말을 다 알아도 문장이
   안 읽히는 때가 있습니다 — 관계절이 겹쳤거나, 도치됐거나, 낱말은 쉬운데
   합쳐 놓으니 다른 뜻이 되는 관용구일 때. 그럴 때 필요한 것은 사전이 아니라
   "이 문장은 이렇게 읽는다" 한 마디입니다.

   ── 왜 꾹 누르기인가 ──
   문장을 고르는 손짓이 따로 있으면 안 됩니다. 읽는 중에는 손이 하나뿐이고,
   낱말 누르기는 이미 한 번 누르기가 가져갔습니다. 남은 것이 꾹 누르기이고,
   그 사이에 파란색이 문장에 퍼지는 것 자체가 "지금 문장을 고르고 있다"는
   설명입니다. 글씨로 안내할 것이 없습니다.

   ── 파란색은 되돌릴 수 있어야 합니다 ──
   하루 다섯 번뿐이라, 스크롤하다 손가락이 잠깐 멈춘 것이 한 번을 태우면
   안 됩니다. 그래서 ① 손가락이 조금이라도 움직이면 즉시 끝, ② 다 차기 전에
   떼면 아무 일도 없음. 다 찬 뒤에야 물어봅니다.

   ── 웜스타트 ──
   파란색이 차기 시작하는 순간 함수를 깨웁니다(`warmDict`). 문장은 보내지
   않습니다 — 깨우는 요청에는 아무 내용이 없고 한도도 쓰지 않습니다. 취소하면
   깨워 둔 것만 남는데, 그건 다음 낱말 조회가 씁니다. 버려지지 않습니다.

   ── 애플의 내장 사전 ──
   그냥 두면 iOS 가 꾹 누르기를 자기 것으로 가져가 "복사 / 찾아보기" 를 띄웁니다.
   `-webkit-touch-callout:none` 과 `user-select:none` 으로 막습니다(styles/reader.css).
   대가는 읽는 화면에서 드래그 선택·복사가 안 되는 것입니다. 단어장이 있는 앱에서
   본문 복사는 거의 쓰지 않아서 이쪽을 골랐습니다.

   ── 문장은 서버에 남지 않습니다 ──
   AI 에게는 보냅니다(보내지 않으면 답할 것이 없습니다). 서버 기록에 남는 것은
   소금을 섞은 지문과 낱말 수뿐입니다 — 낱말 조회와 완전히 같은 규칙입니다. */

const SENT_FILL_MS   = 850;    // 파란색이 문장을 다 채우는 데 걸리는 시간
const SENT_MOVE_SLOP = 10;     // 이보다 움직이면 읽는 손짓이 아니라 스크롤입니다
const SENT_DAILY     = 5;

const sentKey = text => 's:' + sentenceHash(text);
const LS_SENT_LEFT = 'breeze.sent-left';

/* 서버가 답할 때마다 남은 횟수를 알려 줍니다. 그 값을 날짜와 함께 들고 있다가
   창을 열 때 보여 줍니다 — 물어보기 전에 몇 번 남았는지 알아야 아낄 수 있습니다. */
function sentLeft(){
  const kept = load(LS_SENT_LEFT, null);
  const today = new Date().toISOString().slice(0,10);
  return (kept && kept.day === today) ? kept.left : null;
}
function rememberSentLeft(left){
  if(typeof left !== 'number') return;
  save(LS_SENT_LEFT, { day:new Date().toISOString().slice(0,10), left });
}

/* ---------- 눌린 자리에서 문장 찾기 ----------
   화면의 한 점 → 그 점이 놓인 글자 → 그 글자가 든 문장의 시작과 끝.
   문장을 어디서 끊는지는 `sentenceOf` 와 같은 규칙을 씁니다. 두 곳이 다르게
   끊으면 낱말 창에 저장된 예문과 여기서 물어본 문장이 어긋납니다. */
function caretIn(x, y){
  if(document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if(document.caretPositionFromPoint){
    const spot = document.caretPositionFromPoint(x, y);
    if(!spot) return null;
    const range = document.createRange();
    range.setStart(spot.offsetNode, spot.offset);
    return range;
  }
  return null;
}
/* 문단 안의 글자 순서대로 텍스트 노드를 훑습니다. 낱말은 <span> 으로 싸여
   있어서 문단의 textContent 와 노드 조각이 일대일이 아닙니다. */
function textNodesOf(element){
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while((node = walker.nextNode())) nodes.push(node);
  return nodes;
}
function offsetIn(element, node, offset){
  let seen = 0;
  for(const item of textNodesOf(element)){
    if(item === node) return seen + offset;
    seen += item.length;
  }
  return -1;
}
function rangeFor(element, from, to){
  const range = document.createRange();
  let seen = 0, placedStart = false;
  for(const node of textNodesOf(element)){
    const end = seen + node.length;
    if(!placedStart && from <= end){ range.setStart(node, from - seen); placedStart = true; }
    if(placedStart && to <= end){ range.setEnd(node, to - seen); return range; }
    seen = end;
  }
  return placedStart ? (range.setEnd(element, element.childNodes.length), range) : null;
}
/* 화면의 한 점 → { 문장, 그 문장을 덮는 Range } */
function sentenceAtPoint(x, y){
  const caret = caretIn(x, y);
  if(!caret) return null;
  const element = caret.startContainer.parentElement &&
                  caret.startContainer.parentElement.closest('#rtext [data-pi]');
  if(!element || element.tagName === 'PRE') return null;
  const text = element.textContent || '';
  const at = offsetIn(element, caret.startContainer, caret.startOffset);
  if(at < 0) return null;

  let cursor = 0, found = null;
  const parts = text.match(/[^.!?…]+[.!?…]*/g) || [text];
  for(const part of parts){
    if(at < cursor + part.length || part === parts[parts.length-1]){
      found = { from:cursor, to:cursor + part.length };
      break;
    }
    cursor += part.length;
  }
  if(!found) return null;
  /* 앞뒤 공백은 문장이 아닙니다. 칠할 때 빈 칸이 한 뼘 튀어나옵니다. */
  while(found.from < found.to && /\s/.test(text[found.from])) found.from++;
  while(found.to > found.from && /\s/.test(text[found.to-1])) found.to--;
  const body = text.slice(found.from, found.to).trim();
  /* 낱말 두 개짜리 제목이나 사진 설명에는 설명할 것이 없습니다. */
  if(body.length < 25) return null;
  const range = rangeFor(element, found.from, found.to);
  return range ? { text:body, range } : null;
}

/* ---------- 파란색이 퍼지는 것 ----------
   글자를 건드리지 않습니다. 문장이 놓인 줄마다 사각형을 하나씩 화면 위에
   얹고 왼쪽에서 오른쪽으로 늘립니다 — 줄이 셋이면 첫 줄이 다 찬 뒤 둘째 줄이
   시작해서, 글을 읽는 방향 그대로 색이 흐릅니다.
   글자를 감싸는 방식으로 만들면 문단을 다시 그려야 하고, 그러면 지금 눌러 둔
   손가락 밑에서 DOM 이 갈아엎어집니다. */
let sentFillLayer = null;

/* `getClientRects()` 는 줄이 아니라 조각을 줍니다 — 낱말마다 <span> 이라서
   한 줄짜리 문장도 쉰 개가 넘게 나옵니다. 세로로 겹치는 것끼리 묶어
   "줄" 로 되돌립니다. 안 묶으면 조각마다 따로 차올라서, 퍼지는 것이 아니라
   자잘하게 깜빡이는 것으로 보입니다. */
function lineRects(range){
  const lines = [];
  for(const rect of range.getClientRects()){
    if(rect.width < .5 || rect.height < .5) continue;
    const middle = rect.top + rect.height/2;
    const line = lines.find(item =>
      middle > item.top && middle < item.bottom);
    if(line){
      line.left   = Math.min(line.left, rect.left);
      line.right  = Math.max(line.right, rect.right);
      line.top    = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    }else{
      lines.push({ left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom });
    }
  }
  return lines.filter(line => line.right - line.left > 1)
              .sort((a, b) => a.top - b.top);
}
function paintSentFill(range){
  clearSentFill();
  const lines = lineRects(range);
  if(!lines.length) return false;
  const layer = document.createElement('div');
  layer.className = 'sent-fill';
  /* 줄 길이에 맞춰 시간을 나눕니다. 줄마다 같은 시간을 주면 짧은 마지막 줄에서
     색이 갑자기 빨라져서, 한 줄기로 흐르는 것으로 안 보입니다. */
  const total = lines.reduce((sum, line) => sum + (line.right - line.left), 0);
  let spent = 0;
  for(const line of lines){
    const width = line.right - line.left;
    const bar = document.createElement('i');
    bar.style.left   = line.left + 'px';
    bar.style.top    = line.top + 'px';
    bar.style.width  = width + 'px';
    bar.style.height = (line.bottom - line.top) + 'px';
    bar.style.animationDuration = (SENT_FILL_MS * width / total) + 'ms';
    bar.style.animationDelay    = (SENT_FILL_MS * spent / total) + 'ms';
    layer.appendChild(bar);
    spent += width;
  }
  document.body.appendChild(layer);
  sentFillLayer = layer;
  return true;
}
function clearSentFill(){
  if(sentFillLayer) sentFillLayer.remove();
  sentFillLayer = null;
}

/* ---------- 손짓 ---------- */
let sentTimer = null, sentStart = null, sentPick = null;

function cancelSentPress(){
  clearTimeout(sentTimer);
  sentTimer = null; sentStart = null; sentPick = null;
  clearSentFill();
}
function beginSentPress(x, y){
  cancelSentPress();
  if(!curBook || currentReaderMode !== 'text') return;
  const pick = sentenceAtPoint(x, y);
  if(!pick) return;
  if(!paintSentFill(pick.range)) return;
  sentStart = { x, y };
  sentPick = pick;
  /* 차기 시작하는 순간 함수를 깨웁니다. 문장은 보내지 않습니다. */
  warmDict();
  sentTimer = setTimeout(()=>{
    sentTimer = null;
    const text = sentPick && sentPick.text;
    cancelSentPress();
    if(text) openSentence(text);
  }, SENT_FILL_MS);
}
function moveSentPress(x, y){
  if(!sentStart) return;
  if(Math.abs(x - sentStart.x) > SENT_MOVE_SLOP ||
     Math.abs(y - sentStart.y) > SENT_MOVE_SLOP) cancelSentPress();
}
/* 다 차기 전에 떼면 아무 일도 일어나지 않습니다. 낱말 한 번 누르기는 그대로
   살아 있어야 하므로, 여기서 click 을 막지 않습니다 — 손가락을 뗀 시점이
   `SENT_FILL_MS` 전이면 애초에 낱말을 누른 것입니다. */
(function(){
  const text = document.getElementById('rtext');
  text.addEventListener('touchstart', event => {
    if(event.touches.length !== 1) return cancelSentPress();
    beginSentPress(event.touches[0].clientX, event.touches[0].clientY);
  }, {passive:true});
  text.addEventListener('touchmove', event => {
    if(event.touches.length) moveSentPress(event.touches[0].clientX, event.touches[0].clientY);
  }, {passive:true});
  text.addEventListener('touchend', cancelSentPress);
  text.addEventListener('touchcancel', cancelSentPress);
  /* 데스크탑도 똑같이 됩니다. 다만 마우스로 0.85초 누르기를 스스로 발견하는
     사람은 없으므로, 낱말 창 안에 같은 일을 하는 링크를 하나 둡니다. */
  text.addEventListener('mousedown', event => {
    if(event.button !== 0) return;
    beginSentPress(event.clientX, event.clientY);
  });
  text.addEventListener('mousemove', event => moveSentPress(event.clientX, event.clientY));
  text.addEventListener('mouseup', cancelSentPress);
  text.addEventListener('mouseleave', cancelSentPress);
  text.addEventListener('contextmenu', event => { if(sentStart) event.preventDefault(); });
  window.addEventListener('scroll', cancelSentPress, {passive:true});
})();

/* 낱말 창에서 들어오는 문. 창에 이미 그 낱말의 예문이 적혀 있으므로
   고를 것이 없습니다 — 화면에 보이는 그 문장 그대로입니다. */
function explainSelectedSentence(){
  const w = words[selKey];
  if(w && w.example) openSentence(w.example);
}

/* ---------- 창 ---------- */
const sentModal = () => document.getElementById('sent-modal');

function closeSentence(){
  sentModal().classList.remove('on');
  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} sentCtrl = null; }
}
function paintSentence(state){
  const card = sentModal();
  card.classList.add('on');
  document.getElementById('st-en').textContent = state.en || '';
  document.getElementById('st-wait').hidden = !state.waiting;
  const ko = document.getElementById('st-ko');
  ko.textContent = state.ko || '';
  ko.hidden = !state.ko;
  const points = document.getElementById('st-points');
  points.innerHTML = '';
  (state.points || []).forEach(line => {
    const item = document.createElement('li');
    item.textContent = line;
    points.appendChild(item);
  });
  points.hidden = !(state.points || []).length;
  const foot = document.getElementById('st-foot');
  foot.textContent = state.foot || '';
  foot.hidden = !state.foot;
  document.getElementById('st-cap').textContent = state.cached ? '전에 물어본 문장' : '문장 통째로 · AI';
}

let sentCtrl = null;
async function openSentence(text){
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if(!clean) return;
  paintSentence({ en:clean, waiting:true });

  /* ① 전에 물어본 적 있는 문장이면 그대로 내놓습니다. 한도를 쓰지 않습니다. */
  const key = sentKey(clean);
  const hit = await dictGet(key);
  if(hit && hit.ko){
    paintSentence({ en:clean, ko:hit.ko, points:hit.points || [], cached:true,
                    foot:'전에 물어본 문장이라 오늘 몫을 쓰지 않았어요' });
    return;
  }

  if(!sb || navigator.onLine === false){
    paintSentence({ en:clean, foot:'오프라인이라 문장 설명은 나중에 볼 수 있어요' });
    return;
  }
  if(!sbUser){
    paintSentence({ en:clean, foot:'문장 설명은 로그인하면 하루 5번 쓸 수 있어요' });
    return;
  }

  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} }
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  sentCtrl = ctrl;
  const answer = await dictCall({ op:'explain', sentence:clean, book:(curBook && curBook.title) || '' },
                                ctrl ? ctrl.signal : null);
  if(sentCtrl === ctrl) sentCtrl = null;
  if(!sentModal().classList.contains('on')) return;

  if(!answer || answer.error || !answer.ko){
    const why = answer && answer.error;
    paintSentence({ en:clean, foot:
        why === 'quota_exceeded' ? '오늘 문장 설명 5번을 다 썼어요. 자정에 다시 채워집니다'
      : why === 'login_required' ? '문장 설명은 로그인하면 하루 5번 쓸 수 있어요'
      :                            '잠깐 문제가 있었어요. 다시 눌러 보세요' });
    return;
  }
  rememberSentLeft(answer.left);
  await dictPut(key, { ko:answer.ko, points:answer.points || [], done:true });
  paintSentence({ en:clean, ko:answer.ko, points:answer.points || [],
                  foot: typeof answer.left === 'number'
                        ? `오늘 ${answer.left}번 남았어요` : '' });
}

sentModal().addEventListener('click', event => {
  if(event.target.id === 'sent-modal') closeSentence();
});
