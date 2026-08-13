/* ================= 문장 통째로 물어보기 =================

   낱말 하나를 누르면 그 낱말의 뜻이 뜹니다. 그런데 낱말을 다 알아도 문장이
   안 읽히는 때가 있습니다 — 관계절이 겹쳤거나, 도치됐거나, 낱말은 쉬운데
   합쳐 놓으니 다른 뜻이 되는 관용구일 때. 그럴 때 필요한 것은 사전이 아니라
   "이 문장은 이렇게 읽는다" 한 마디입니다.

   ── 문은 하나입니다 ──
   한때 문장을 꾹 누르면 파란색이 퍼지는 손짓을 달아 두었습니다. 예뻤지만
   문이 둘이 되었고, 둘은 서로 다르게 굴었습니다: 폰에서만 있었고, iOS 의
   기본 동작(복사·찾아보기)을 막느라 본문 선택까지 함께 잃었고, 스크롤하다
   손가락이 멈춘 것이 하루 몫을 태울 위험이 늘 있었습니다.

   지금은 낱말 창 안의 단추 하나뿐입니다(`#p-explain`). 낱말을 눌러 뜻을 봤는데
   그래도 문장이 안 풀릴 때가 이 기능이 필요한 바로 그 순간이라, 그 자리에
   있는 것이 맞습니다. 폰이든 노트북이든 같은 자리, 같은 손짓입니다.
   물어볼 문장은 이미 창에 적혀 있는 그 예문입니다 — 고를 것이 없습니다.

   ── 문장은 서버에 남지 않습니다 ──
   AI 에게는 보냅니다(보내지 않으면 답할 것이 없습니다). 서버 기록에 남는 것은
   소금을 섞은 지문과 낱말 수뿐입니다 — 낱말 조회와 완전히 같은 규칙입니다. */

const sentKey = text => 's:' + sentenceHash(text);
const LS_SENT_LEFT = 'breeze.ai-left';
const AI_DAILY_TOKENS = 100;

/* 서버가 답할 때마다 남은 횟수를 알려 줍니다. 한국 날짜와 함께 들고 있다가
   창을 열 때 보여 줍니다 — 물어보기 전에 몇 번 남았는지 알아야 아낄 수 있습니다. */
function sentDay(){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date()).reduce((o,x)=>(o[x.type]=x.value,o),{});
  return `${p.year}-${p.month}-${p.day}`;
}
function sentLeft(){
  const kept = load(LS_SENT_LEFT, null);
  const today = sentDay();
  return (kept && kept.day === today) ? kept.left : null;
}
function rememberSentLeft(left, day){
  if(typeof left !== 'number') return;
  save(LS_SENT_LEFT, { day:day||sentDay(), left });
  if(typeof refreshSentenceExplainAvailability === 'function') refreshSentenceExplainAvailability(words[selKey]);
}

/* 이 기능은 로그인한 상태에서만 새 해석을 만들 수 있습니다. 전에는 이 사실을
   눌러 본 뒤의 작은 오류 문구로만 알려 줬습니다. 버튼을 보기 전에 알려야 합니다. */
function refreshSentenceExplainAvailability(w){
  const button = document.getElementById('p-explain');
  const note = document.getElementById('p-explain-note');
  if(!button || !note) return;
  const context = typeof currentContext === 'function' && w ? currentContext(selKey) : null;
  const hasSentence = !!(context ? context.sentence : (w && w.example));
  let reason = '';
  if(!hasSentence) reason = '이 낱말에는 문장 해석에 쓸 예문이 없어요';
  else if(!sb || !sbUser) reason = '로그인하면 문장 해석을 쓸 수 있어요';
  else if(navigator.onLine === false) reason = '인터넷에 연결되면 문장 해석을 쓸 수 있어요';
  else if(typeof sentLeft()==='number' && sentLeft() < 2) reason = '문장 해석에는 2회가 필요해요. 내일 다시 채워져요';
  button.style.display = hasSentence ? 'flex' : 'none';
  button.disabled = !!reason;
  button.classList.toggle('ready', !reason);
  const left=sentLeft();
  note.textContent = reason || (typeof left === 'number' ? `오늘 AI 조회 ${left}회 남았어요 · 문장 해석 2회` : `하루 AI 조회 ${AI_DAILY_TOKENS}회 · 문장 해석 2회`);
  note.classList.toggle('on', hasSentence);
}

/* 낱말 창에서 들어오는 유일한 문. 창에 이미 그 낱말의 예문이 적혀 있으므로
   무엇을 물어볼지 고를 것이 없습니다 — 화면에 보이는 그 문장 그대로입니다. */
function explainSelectedSentence(){
  const w = words[selKey];
  const context = typeof currentContext === 'function' && w ? currentContext(selKey) : null;
  const sentence = context ? context.sentence : (w && w.example);
  if(!sentence) return;
  refreshSentenceExplainAvailability(w);
  if(document.getElementById('p-explain').disabled) return;
  openSentence(sentence);
}

function closeSentence(){
  const card = document.getElementById('p-sentence');
  if(card) card.hidden = true;
  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} sentCtrl = null; }
}
function paintSentence(state){
  const card = document.getElementById('p-sentence');
  card.hidden = false;
  document.getElementById('ps-en').textContent = state.en || '';
  document.getElementById('ps-wait').hidden = !state.waiting;
  const ko = document.getElementById('ps-ko');
  ko.textContent = state.ko || '';
  ko.hidden = !state.ko;
  const points = document.getElementById('ps-points');
  points.innerHTML = '';
  (state.points || []).forEach(line => {
    const item = document.createElement('li');
    item.textContent = line;
    points.appendChild(item);
  });
  points.hidden = !(state.points || []).length;
  const foot = document.getElementById('ps-foot');
  foot.textContent = state.foot || '';
  foot.hidden = !state.foot;
  document.getElementById('ps-cap').textContent = state.cached ? '전에 물어본 문장' : '문장 통째로 · AI';
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
    paintSentence({ en:clean, foot:'문장 설명은 로그인하면 쓸 수 있어요' });
    return;
  }

  if(sentCtrl){ try{ sentCtrl.abort(); }catch(e){} }
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  sentCtrl = ctrl;
  const answer = await dictCall({ op:'explain', sentence:clean, book:(curBook && curBook.title) || '' },
                                ctrl ? ctrl.signal : null);
  if(sentCtrl === ctrl) sentCtrl = null;
  if(document.getElementById('p-sentence').hidden) return;

  if(!answer || answer.error || !answer.ko){
    const why = answer && answer.error;
    if(why === 'quota_exceeded') rememberSentLeft(0,answer.day);
    paintSentence({ en:clean, foot:
        why === 'login_required' ? '문장 설명은 로그인하면 쓸 수 있어요'
      : why === 'quota_exceeded' ? '오늘 AI 조회가 부족해요. 문장 해석에는 2회가 필요해요'
      :                            '잠깐 문제가 있었어요. 다시 눌러 보세요' });
    return;
  }
  rememberSentLeft(answer.left,answer.day);
  await dictPut(key, { ko:answer.ko, points:answer.points || [], done:true });
  paintSentence({ en:clean, ko:answer.ko, points:answer.points || [] });
}
