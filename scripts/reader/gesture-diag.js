// @ts-nocheck
/* 문장 찾기 · 스크롤 손짓 진단. 기본은 꺼져 있다.

   켜는 법 (이 파일에만 적는다):
   설정 맨 아래 "Breeze" (#settings-version) 를 2.5초 안에 7번 누른다.
   localStorage `breeze.diag.gesture` 가 '1' 이 되고 페이지가 다시 열린다.
   같은 7번이 다시 끈다. 주소창이 없는 iPad 앱에서 닿는 방법이라
   `?diag=1` 은 쓰지 않는다.

   꺼져 있으면 그 라벨의 탭만 센다. 리스너·래퍼·버퍼·rAF 는 만들지 않는다.
   켜져 있으면 약 2,000줄 고리에 performance.now() 로 남긴다.
   문장 내용은 길이만. 네트워크로 보내지 않는다.
   복사 단추 "진단 로그 복사" 와 "로그 지우기" 는 켜져 있을 때만 만든다.

   줄 종류: env hover/fine/vw/vh/card, pd/pm/pu/pc, td/tm/tu/tc,
   scroll user/top, scrollend, decision, endModal, click prevented,
   open n/peek, anchored, close hidden/backdrop, cue/cueEnd,
   long (손짓 중 24ms 초과), tail (closeSentence 이후 1초의 매 프레임),
   cardScroll. slop 은 gesture.js 의 GESTURE_SLOP(10) 과 같은 수다.
   const 는 파일 안에 갇혀 여기서 읽을 수 없다. */

(function(){
  const KEY = 'breeze.diag.gesture';
  const CAP = 2000;
  const SLOP = 10;
  const LONG_MS = 24;
  const TAIL_MS = 1000;
  const TAP_GAP = 2500;
  const TAP_COUNT = 7;

  function readFlag(){
    try { return localStorage.getItem(KEY) === '1'; }
    catch(error){ return false; }
  }
  function writeFlag(on){
    try {
      if(on) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch(error){}
  }
  window.gestureDiagEnabled = readFlag;

  function armToggle(){
    const button = document.getElementById('settings-version');
    if(!button || button.dataset.gestureDiag === '1') return;
    button.dataset.gestureDiag = '1';
    let taps = 0;
    let last = 0;
    button.addEventListener('click', function(event){
      const now = Date.now();
      if(now - last > TAP_GAP) taps = 0;
      last = now;
      taps += 1;
      if(taps < TAP_COUNT) return;
      taps = 0;
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
      writeFlag(!readFlag());
      if(location && typeof location.reload === 'function') location.reload();
    });
  }
  armToggle();
  if(!readFlag()) return;

  const lines = [];
  function note(kind, fields){
    try {
      let line = kind + ' t=' + performance.now().toFixed(1);
      if(fields){
        const keys = Object.keys(fields);
        for(let i = 0; i < keys.length; i++){
          const value = fields[keys[i]];
          if(value == null || value === '') continue;
          line += ' ' + keys[i] + '=' + String(value).replace(/\s+/g, '_').slice(0, 96);
        }
      }
      lines.push(line);
      if(lines.length > CAP) lines.splice(0, lines.length - CAP);
    } catch(error){}
  }
  window.gestureDiagNote = note;
  window.gestureDiagText = function(){ return lines.join('\n'); };
  window.gestureDiagCap = CAP;

  function media(query){
    try { return matchMedia(query).matches ? 1 : 0; }
    catch(error){ return -1; }
  }
  function cardBox(){
    const card = document.getElementById('p-sentence');
    if(!card || typeof card.getBoundingClientRect !== 'function') return '0x0';
    const rect = card.getBoundingClientRect();
    return Math.round(rect.width) + 'x' + Math.round(rect.height);
  }
  function readerTop(){
    const box = document.getElementById('reader-scroll');
    return box ? Math.round(box.scrollTop || 0) : 0;
  }
  function envFields(){
    return {
      hover: media('(hover:hover)'),
      fine: media('(pointer:fine)'),
      vw: window.innerWidth || 0,
      vh: window.innerHeight || 0,
      card: cardBox(),
    };
  }
  function elementOf(node){
    if(!node) return null;
    if(node.nodeType === 1) return node;
    return node.parentElement || null;
  }
  function describe(node){
    const el = elementOf(node);
    if(!el || !el.tagName) return '';
    const id = el.id ? '#' + el.id : '';
    let cls = '';
    if(el.classList && el.classList.length){
      const names = [];
      const limit = Math.min(3, el.classList.length);
      for(let i = 0; i < limit; i++) names.push(el.classList[i]);
      cls = '.' + names.join('.');
    }
    return (id || cls || el.tagName.toLowerCase()).slice(0, 80);
  }
  function inside(id, node){
    const host = document.getElementById(id);
    const el = elementOf(node);
    return !!(host && el && typeof host.contains === 'function' && host.contains(el));
  }
  function cardTop(){
    const card = document.getElementById('p-sentence');
    return card ? Math.round(card.scrollTop || 0) : 0;
  }

  note('env', envFields());

  const pointers = new Set();
  const touches = new Set();
  let rafOn = false;
  let lastFrame = 0;
  let tailUntil = 0;
  let origin = null;

  function live(){ return pointers.size > 0 || touches.size > 0; }
  function requestLoop(){
    if(rafOn || (!live() && !tailUntil)) return;
    rafOn = true;
    lastFrame = performance.now();
    const step = function(now){
      const dt = now - lastFrame;
      lastFrame = now;
      const top = readerTop();
      if(live() && dt > LONG_MS) note('long', {dt: dt.toFixed(1), top: top});
      if(tailUntil){
        note('tail', {dt: dt.toFixed(1), top: top});
        if(now >= tailUntil) tailUntil = 0;
      }
      if(live() || tailUntil) requestAnimationFrame(step);
      else rafOn = false;
    };
    requestAnimationFrame(step);
  }
  function startTail(){
    tailUntil = performance.now() + TAIL_MS;
    requestLoop();
  }
  function track(set, id, down){
    const key = id == null ? '0' : String(id);
    if(down) set.add(key);
    else set.delete(key);
    if(live() || tailUntil) requestLoop();
  }

  function pointerFields(event, moved){
    const fields = {
      pt: event.pointerType || '',
      primary: event.isPrimary === false ? 0 : 1,
      x: Math.round(event.clientX || 0),
      y: Math.round(event.clientY || 0),
      target: describe(event.target),
      in: inside('p-sentence', event.target) ? 1 : 0,
    };
    if(fields.in) fields.cardTop = cardTop();
    if(moved != null) fields.moved = Math.round(moved);
    if(moved != null) fields.slop = moved > SLOP ? 1 : 0;
    return fields;
  }
  function rememberOrigin(event){
    if(event.isPrimary === false) return;
    origin = {id: event.pointerId, x: event.clientX || 0, y: event.clientY || 0};
  }
  function movedFromOrigin(event){
    if(!origin || event.pointerId !== origin.id) return null;
    return Math.hypot((event.clientX || 0) - origin.x, (event.clientY || 0) - origin.y);
  }
  function onPointer(kind, event){
    if(inside('gesture-diag-panel', event.target)) return;
    if(kind === 'pd') rememberOrigin(event);
    const moved = kind === 'pm' ? movedFromOrigin(event) : null;
    note(kind, pointerFields(event, moved));
    if(kind === 'pd') track(pointers, event.pointerId, true);
    else if(kind === 'pu' || kind === 'pc') track(pointers, event.pointerId, false);
  }
  function touchPoint(event){
    const list = (event.changedTouches && event.changedTouches.length && event.changedTouches)
      || (event.touches && event.touches.length && event.touches);
    return list && list[0] ? list[0] : null;
  }
  function onTouch(kind, event){
    if(inside('gesture-diag-panel', event.target)) return;
    const point = touchPoint(event);
    const fields = {
      x: point ? Math.round(point.clientX || 0) : 0,
      y: point ? Math.round(point.clientY || 0) : 0,
      target: describe(event.target),
      in: inside('p-sentence', event.target) ? 1 : 0,
    };
    if(fields.in) fields.cardTop = cardTop();
    note(kind, fields);
    const list = event.changedTouches;
    if(kind === 'td' && list){
      for(let i = 0; i < list.length; i++) track(touches, list[i].identifier, true);
    } else if((kind === 'tu' || kind === 'tc') && list){
      for(let i = 0; i < list.length; i++) track(touches, list[i].identifier, false);
    }
  }

  document.addEventListener('pointerdown', function(event){ onPointer('pd', event); }, true);
  document.addEventListener('pointermove', function(event){ onPointer('pm', event); }, true);
  document.addEventListener('pointerup', function(event){ onPointer('pu', event); }, true);
  document.addEventListener('pointercancel', function(event){ onPointer('pc', event); }, true);
  document.addEventListener('touchstart', function(event){ onTouch('td', event); }, true);
  document.addEventListener('touchmove', function(event){ onTouch('tm', event); }, true);
  document.addEventListener('touchend', function(event){ onTouch('tu', event); }, true);
  document.addEventListener('touchcancel', function(event){ onTouch('tc', event); }, true);

  const scroller = document.getElementById('reader-scroll');
  if(scroller && typeof scroller.addEventListener === 'function'){
    scroller.addEventListener('scrollend', function(){
      note('scrollend', {top: readerTop()});
    }, {passive: true});
  }
  const card = document.getElementById('p-sentence');
  if(card && typeof card.addEventListener === 'function'){
    card.addEventListener('scroll', function(){
      note('cardScroll', {top: cardTop(), reader: readerTop()});
    }, {passive: true});
  }

  function replace(name, factory){
    const original = window[name];
    if(typeof original !== 'function' || original.__gestureDiag) return;
    const wrapped = factory(original);
    if(typeof wrapped !== 'function') return;
    wrapped.__gestureDiag = true;
    window[name] = wrapped;
  }
  function call(original, host, args){
    try { return {value: original.apply(host, args)}; }
    catch(error){ return {error: error}; }
  }
  function finish(outcome){
    if(outcome && outcome.error) throw outcome.error;
    return outcome ? outcome.value : undefined;
  }

  replace('scrollGesture', function(original){
    return function(){
      const user = !(typeof readerScrollWasProgrammatic === 'function' && readerScrollWasProgrammatic());
      note('scroll', {top: readerTop(), user: user ? 1 : 0});
      return original.apply(this, arguments);
    };
  });
  replace('finishGesture', function(original){
    return function(){
      const outcome = call(original, this, arguments);
      try {
        const gesture = arguments[0] || {};
        note('decision', {
          owner: gesture.owner || '',
          decision: gesture.decision || '',
          moved: Math.round(gesture.moved || 0),
          slop: (gesture.moved || 0) > SLOP ? 1 : 0,
        });
      } catch(error){}
      return finish(outcome);
    };
  });
  replace('endSentenceModalGesture', function(original){
    return function(){
      const outcome = call(original, this, arguments);
      try {
        const gesture = arguments[0] || {};
        note('endModal', {
          decision: gesture.decision || '',
          moved: Math.round(gesture.moved || 0),
          slop: (gesture.moved || 0) > SLOP ? 1 : 0,
          dismisses: gesture.dismisses ? 1 : 0,
          pulls: gesture.pulls ? 1 : 0,
          dy: Math.round(gesture.dy || 0),
        });
      } catch(error){}
      return finish(outcome);
    };
  });
  replace('clickGesture', function(original){
    return function(event){
      const outcome = call(original, this, arguments);
      try { note('click', {prevented: event && event.defaultPrevented ? 1 : 0}); }
      catch(error){}
      return finish(outcome);
    };
  });
  replace('openSentence', function(original){
    return function(text, origin){
      note('open', {
        n: text == null ? 0 : String(text).length,
        peek: origin && origin.peekTarget ? 1 : 0,
        card: cardBox(),
      });
      return original.apply(this, arguments);
    };
  });
  replace('revealSentenceResult', function(original){
    return function(){
      const outcome = call(original, this, arguments);
      try {
        const modal = document.getElementById('sentence-modal');
        note('anchored', {
          hidden: modal && modal.hidden ? 1 : 0,
          backdrop: document.body.classList.contains('sentence-result-anchored') ? 1 : 0,
          card: cardBox(),
          hover: media('(hover:hover)'),
          fine: media('(pointer:fine)'),
          vw: window.innerWidth || 0,
          vh: window.innerHeight || 0,
        });
      } catch(error){}
      return finish(outcome);
    };
  });
  replace('closeSentence', function(original){
    return function(){
      const modal = document.getElementById('sentence-modal');
      const beforeHidden = modal && modal.hidden ? 1 : 0;
      const beforeBackdrop = document.body.classList.contains('sentence-result-anchored') ? 1 : 0;
      const started = performance.now();
      const outcome = call(original, this, arguments);
      try {
        note('close', {
          hidden: modal && modal.hidden ? 1 : 0,
          wasHidden: beforeHidden,
          backdrop: document.body.classList.contains('sentence-result-anchored') ? 1 : 0,
          backdropWas: beforeBackdrop,
          card: cardBox(),
          ms: (performance.now() - started).toFixed(1),
          vw: window.innerWidth || 0,
          vh: window.innerHeight || 0,
        });
        startTail();
      } catch(error){}
      return finish(outcome);
    };
  });
  replace('clearReaderModeCue', function(original){
    return function(){
      const started = performance.now();
      const outcome = call(original, this, arguments);
      try {
        const leaving = document.querySelector('.reader-sentence-cue-layer.is-leaving');
        note('cue', {ms: (performance.now() - started).toFixed(1), leaving: leaving ? 1 : 0});
        if(leaving){
          const fadeStart = performance.now();
          let logged = false;
          const done = function(how){
            if(logged) return;
            logged = true;
            note('cueEnd', {ms: (performance.now() - fadeStart).toFixed(1), how: how});
          };
          if(typeof leaving.addEventListener === 'function')
            leaving.addEventListener('transitionend', function(){ done('end'); });
          setTimeout(function(){ done('timeout'); }, 220);
        }
      } catch(error){}
      return finish(outcome);
    };
  });

  function toast(message){
    if(typeof miniToast === 'function') miniToast(message);
  }
  function exportText(){ return lines.join('\n'); }
  const panel = document.createElement('div');
  panel.id = 'gesture-diag-panel';
  panel.setAttribute('style', 'position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:110;display:flex;flex-direction:column;gap:8px;width:min(280px,calc(100vw - 24px));padding:8px;border-radius:12px;background:rgba(28,28,30,.92);color:#fff;font:12px/1.4 system-ui,-apple-system,sans-serif');
  const row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:8px');
  const area = document.createElement('textarea');
  area.readOnly = true;
  area.hidden = true;
  area.setAttribute('aria-label', '진단 로그');
  area.setAttribute('style', 'box-sizing:border-box;width:100%;height:140px;margin:0;padding:8px;border:0;border-radius:8px;background:#fff;color:#111;font:11px/1.35 ui-monospace,monospace');
  function showArea(text){
    area.hidden = false;
    area.value = text;
  }
  async function copyLog(){
    const text = exportText();
    showArea(text);
    try {
      if(navigator.clipboard && typeof navigator.clipboard.writeText === 'function'){
        await navigator.clipboard.writeText(text);
        toast('복사했습니다');
        return;
      }
    } catch(error){}
    try {
      if(navigator.share){
        await navigator.share({text: text});
        return;
      }
    } catch(error){
      if(error && error.name === 'AbortError') return;
    }
    if(typeof window.prompt === 'function') window.prompt('진단 로그 — 텍스트를 선택해 복사하세요', text);
  }
  function clearLog(){
    lines.length = 0;
    note('env', envFields());
    area.value = '';
    area.hidden = true;
    toast('지웠습니다');
  }
  function makeButton(label, action){
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('style', 'flex:1;min-height:44px;border:0;border-radius:12px;background:#fff;color:#111;font:600 13px/1 system-ui,-apple-system,sans-serif');
    button.addEventListener('click', function(event){
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
      if(event && typeof event.stopPropagation === 'function') event.stopPropagation();
      action();
    });
    return button;
  }
  row.appendChild(makeButton('진단 로그 복사', copyLog));
  row.appendChild(makeButton('로그 지우기', clearLog));
  panel.appendChild(row);
  panel.appendChild(area);
  if(document.body) document.body.appendChild(panel);
})();
