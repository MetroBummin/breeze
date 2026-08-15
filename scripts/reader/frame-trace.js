// @ts-nocheck
/* 이 파일은 전역에 이미 앉아 있는 함수를 이름으로 찾아 껍데기로 갈아 끼웁니다
   (`window[name] = …`). 그건 타입으로 표현할 수 있는 일이 아니고, 표현할 수
   있게 고치면 재는 대상을 건드리게 됩니다 — 계측이 지켜야 할 첫 번째 규칙을
   어기는 셈입니다. 개발 모드에서만 도는 파일이므로 검사에서 뺍니다. */

/* ================= 프레임은 무슨 일을 했나 =================

   "또 버벅인다"는 제보가 오면, 예전에는 코드를 눈으로 읽고 그럴듯한 자리에
   guard 를 하나 더 붙였습니다. 그 방식으로는 고쳤는지도 알 수 없습니다.

   이 파일은 개발 모드에서만 켜지고, 한 프레임 안에서 실제로 무슨 일이
   몇 번 일어났는지를 셉니다:

     Frame #17391
     reasons: scroll, resize
     captureAnchor: 2
     paragraphForSource: 2  (sourceMap 3450)
     layout reads: 41
     anchor restore: 0
     duration: 12.4ms

   재는 대상은 손대지 않습니다 — 껍데기만 씌워 세고 그대로 넘깁니다. 그래서
   이 파일을 켜지 않으면 앱은 한 글자도 다르게 돌지 않습니다.

   켜는 법: 주소에 `?frames=1` 을 한 번 붙이면 이 기기에 남습니다. `?frames=0`
   으로 끕니다. 켜져 있는 동안에는 재는 값 자체가 조금 비싸므로(래퍼 호출과
   `performance.now()`), 절대값보다 **전후 비교**에 쓰세요.

   이 파일은 재는 것들이 모두 정의된 뒤에 실행돼야 하므로 맨 끝에 놓입니다. */

(function(){
  let on = false;
  try{
    if(/[?&]frames=1/.test(location.search)) localStorage.setItem('breeze.debug.frames','1');
    if(/[?&]frames=0/.test(location.search)) localStorage.removeItem('breeze.debug.frames');
    on = localStorage.getItem('breeze.debug.frames') === '1';
  }catch(error){}
  if(!on) return;

  const counts = Object.create(null);
  const reasons = new Set();
  let frameNo = 0, scheduled = false, frameStart = 0;

  function bump(name){ counts[name] = (counts[name]||0) + 1; }

  /* 프레임의 경계는 rAF 입니다. 무슨 일이든 한 번 세어졌으면 그 프레임 끝에
     한 줄 찍고 셈을 비웁니다. 아무 일도 없던 프레임은 찍지 않습니다. */
  function scheduleReport(reason){
    if(reason) reasons.add(reason);
    if(scheduled) return;
    scheduled = true;
    frameStart = performance.now();
    requestAnimationFrame(()=>{
      /* rAF 콜백들 사이에 우리가 마지막이 아닐 수 있으니, 이 프레임의 일이
         다 끝난 뒤에 재도록 한 박자 미룹니다. */
      const startedAt = frameStart;
      setTimeout(()=>{
        scheduled = false;
        const duration = performance.now() - startedAt;
        const entries = Object.entries(counts);
        if(entries.length){
          frameNo++;
          const lines = [`Frame #${frameNo}`,
            `reasons: ${[...reasons].join(', ') || '—'}`];
          entries.sort((a,b)=>b[1]-a[1]).forEach(([name,count])=>lines.push(`${name}: ${count}`));
          lines.push(`sourceMap: ${(window.curBook && curBook.sourceMap && curBook.sourceMap.length) || 0}`);
          lines.push(`duration: ${duration.toFixed(1)}ms`);
          console.log(lines.join('\n'));
          window.__breezeFrames = window.__breezeFrames || [];
          window.__breezeFrames.push({
            frame: frameNo, at: Date.now(), duration,
            reasons: [...reasons], ...Object.fromEntries(entries),
          });
        }
        for(const key of Object.keys(counts)) delete counts[key];
        reasons.clear();
      }, 0);
    });
  }

  /* ---- 세는 대상 ----
     전역 `function` 선언은 globalThis 의 고쳐 쓸 수 있는 자리에 앉습니다.
     그래서 다른 파일이 이름으로 부르던 것을 여기서 껍데기로 갈아 끼울 수
     있습니다 — 부르는 쪽은 한 줄도 안 바뀝니다. */
  function countCalls(name){
    const original = window[name];
    if(typeof original !== 'function') return;
    window[name] = function(){
      bump(name);
      scheduleReport();
      return original.apply(this, arguments);
    };
  }
  ['captureAnchor','restoreAnchor','captureOriginalAnchor','restoreOriginalAnchor',
   'paragraphForSource','sourceAnchorForParagraph','updatePfill','visibleReaderProgress',
   'textProgressForBook','sourceProgressForBook','renderBookBody','hydrateWordSpanBatch',
   'layoutOriginalZoom','clearReaderModeCue'].forEach(countCalls);

  /* 배치를 강제로 다시 계산하게 만드는 읽기들. 프레임당 몇 번인지가 곧
     "이 프레임이 왜 느렸나"의 답인 경우가 많습니다. */
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function(){
    bump('layout read: getBoundingClientRect');
    return rect.apply(this, arguments);
  };
  const fromPoint = Document.prototype.elementFromPoint;
  if(fromPoint) Document.prototype.elementFromPoint = function(){
    bump('layout read: elementFromPoint');
    return fromPoint.apply(this, arguments);
  };

  /* ---- 상단바는 언제 무엇을 하고 있었나 ----
     "빠르게 위아래로 밀면 상단바가 투명한 채로 굳는다" 를 눈으로 재현하는 것은
     어렵습니다. 굳은 뒤에 보면 이미 늦었고, 굳는 순간에는 손이 바쁩니다.
     그래서 미는 내내 시간순으로 적어 둡니다.

     한 줄에 드는 값은 전부 이미 메모리에 있는 것들입니다 — 배치를 다시 계산하게
     만드는 읽기는 없습니다. 계산이 드는 `getComputedStyle` 은 **클래스가 바뀐
     그 줄에서만** 한 번 합니다. 재는 일이 재는 대상을 무겁게 만들면 그 기록은
     거짓말이 됩니다. */
  const chromeTrace = [];
  let chromeTraceLastClass = null;
  /* 이름으로 붙잡습니다. reader.js 의 `let` 들은 window 에 앉지 않으므로 —
     전역 렉시컬 자리에 있습니다 — 닫힘으로 읽고, 없으면 조용히 '?' 입니다. */
  function peek(read, fallback){ try{ return read(); }catch(error){ return fallback; } }
  function since(value){ return Math.max(0, Math.round((Number(value) || 0) - Date.now())); }
  function sampleChrome(y, step){
    const hidden = document.body.classList.contains('chrome-hidden');
    const changed = hidden !== chromeTraceLastClass;
    chromeTraceLastClass = hidden;
    const row = {
      t: Math.round(performance.now()),
      y: Math.round(y),
      d: Math.round(step),                                    // 이번 걸음 (+아래 −위)
      run: Math.round(peek(()=>chromeRun, 0)),                // 같은 방향으로 이어 간 거리
      hidden,
      pin: peek(()=>chromePinned, '?'),
      hold: since(peek(()=>chromeHoldUntil, 0)),
      pause: since(peek(()=>readerScrollPauseUntil, 0)),
      anchor: peek(()=>readerAnchorHeld(), '?'),
      prog: peek(()=>readerScrollWasProgrammatic(), '?'),
    };
    if(changed){
      const bar = document.getElementById('topbar');
      if(bar){
        const style = getComputedStyle(bar);
        row.paint = `opacity ${style.opacity} · ${style.visibility} · ${style.transform}`;
      }
    }
    chromeTrace.push(row);
    if(chromeTrace.length > 600) chromeTrace.splice(0, 300);
  }

  /* 프레임에 이름을 붙여 주는 것들 — 무엇 때문에 이 프레임이 돌았는가. */
  document.addEventListener('DOMContentLoaded', ()=>{
    const scroller = typeof readerScroller === 'function' ? readerScroller() : null;
    if(!scroller) return;
    let lastY = scroller.scrollTop;
    scroller.addEventListener('scroll', ()=>{
      scheduleReport('scroll');
      const y = scroller.scrollTop;
      sampleChrome(y, y - lastY);
      lastY = y;
    }, {passive:true});
  });
  window.addEventListener('resize', ()=>scheduleReport('resize'));
  ['closeSentence','closePanel','switchReaderMode','selectWord'].forEach(name=>{
    const original = window[name];
    if(typeof original !== 'function') return;
    window[name] = function(){
      scheduleReport(name);
      return original.apply(this, arguments);
    };
  });

  /* ---- "렉"을 두 가지로 가르는 자 ----
     아이폰 녹화에서 본 것은 "문단 상자는 있는데 글자가 없다"였습니다. 그 그림은
     원인이 둘 중 하나입니다:

       A. 메인 스레드가 막혀서 아무것도 못 그린다   → rAF 가 함께 멈춥니다
       B. 메인 스레드는 멀쩡한데 WebKit 이 칠하지 못한다 → rAF 는 정상인데 화면만 빕니다

     둘은 정반대 자리를 고쳐야 하므로, 먼저 갈라야 합니다. rAF 는 우리 코드가
     아니라 브라우저가 부르는 것이라, 그 간격이 곧 메인 스레드의 건강입니다.
     화면이 비는 동안 아래 `rAF p95` 가 20ms 근처면 B, 100ms 를 넘으면 A 입니다. */
  let rafLast = performance.now();
  const rafGaps = [];
  (function beat(){
    const now = performance.now();
    rafGaps.push(now - rafLast); rafLast = now;
    if(rafGaps.length > 4000) rafGaps.splice(0, 2000);
    requestAnimationFrame(beat);
  })();
  const longTasks = [];
  try{
    new PerformanceObserver(list=>{ for(const entry of list.getEntries()) longTasks.push(entry.duration); })
      .observe({entryTypes:['longtask']});
  }catch(error){}

  /* ---- 낱말 상자를 끄고 견주는 자 ----
     문단은 화면에 들어올 때 낱말마다 `<span>` 으로 쪼개집니다 — 한 화면에 600~1000
     개입니다. 글리프를 칠하는 값이 여기서 몇 배가 되는지는 기기마다 다르고, 맥에서
     재면 답이 나오지 않습니다. 그래서 그 자리에서 껐다 켜 보게 합니다.

     `?spans=off` 로 켜면 낱말 쪼개기를 하지 않습니다 — 낱말 탭은 그동안 안 됩니다.
     고치는 것이 아니라 재는 것입니다. 이 상태에서 빠르게 밀어 화면이 안 비면,
     값을 치르는 자리는 낱말 span 입니다. */
  let spansOff = false;
  try{
    if(/[?&]spans=off/.test(location.search)) localStorage.setItem('breeze.debug.spans','off');
    if(/[?&]spans=on/.test(location.search)) localStorage.removeItem('breeze.debug.spans');
    spansOff = localStorage.getItem('breeze.debug.spans') === 'off';
  }catch(error){}
  if(spansOff){
    window.hydrateWordSpanBatch = function(){ bump('hydrate: 꺼짐'); };
    console.log('[breeze] 낱말 span 꺼짐 — 낱말 탭은 안 됩니다 (?spans=on 으로 되돌립니다)');
  }

  /* ---- 같은 창을 두 가지로 닫습니다 ----
     `X 단추`(28px)와 `바깥`(화면 전체를 덮은 scrim). 둘 다 `closeSentence()` 하나로
     끝나므로, 자바스크립트가 남기는 상태는 맥에서 재면 완전히 같습니다 — 떠서
     비교해 봤습니다. 그런데 기기에서는 한쪽만 렉이 온다고 합니다. 그렇다면 남는
     차이는 **누른 상자의 크기**입니다: iOS 는 누른 요소 위에 tap highlight 층을
     한 장 깔고, scrim 은 그 상자가 화면 전체입니다. 그 층이 깔린 채로 요소가
     `display:none` 이 되면 무엇이 남는지는 WebKit 만 압니다.

     그래서 여기서는 (1) 어느 길로 닫았는지와 닫은 직후에 남은 것을 세고,
     (2) `?taphl=off` 로 scrim 의 tap highlight 만 꺼 봅니다. 고치는 것이 아니라
     한 가지만 다르게 해 보는 것입니다 — 이것으로 화면이 안 비면 원인은 거기입니다. */
  /* 어느 길로 닫았는지는 **누른 순간**에 적습니다. 닫는 일이 손을 떼는 자리로
     옮겨 갔고(gesture.js 의 `DISMISS_SENTENCE`), 그때는 scrim 이 이미 사라진
     뒤라 뒤따라오는 click 의 target 을 믿을 수 없기 때문입니다. */
  let lastDismiss = '—';
  let pressedOn = '';
  const dismissMarks = [];
  document.addEventListener('pointerdown', event=>{
    const target = event.target;
    if(!target || typeof target.closest !== 'function'){ pressedOn = ''; return; }
    pressedOn = target.closest('#ps-close') ? '문장 X'
              : target.closest('#sentence-scrim') ? '문장 바깥'
              : target.closest('#p-close') ? '낱말 X'
              : target.closest('#p-handle') ? '낱말 손잡이'
              : target.closest('#sheetbg') ? '낱말 바깥' : '';
  }, true);
  document.addEventListener('pointerup', ()=>{
    const how = pressedOn;
    pressedOn = '';
    if(!how) return;
    lastDismiss = how;
    bump('닫기: ' + how);
    /* 닫힌 뒤에 세야 합니다 — 이 pointerup 이 아직 판정 계층에 닿기 전입니다. */
    setTimeout(()=>{
      /* 닫힌 뒤에도 화면 전체를 덮은 채 렌더 트리에 남는 것이 있는지 — 해석 창은
         `[hidden]` 으로 통째로 빠지고, 낱말 시트의 바깥은 `display:block` 인 채
         `opacity:0` 으로 남습니다. 그 차이를 실기기에서 눈으로 보려고 적습니다. */
      const scrim = document.getElementById('sheetbg');
      const scrimStyle = scrim ? getComputedStyle(scrim) : null;
      dismissMarks.push({how,
        highlights: (window.CSS && CSS.highlights) ? CSS.highlights.size : -1,
        cue: document.querySelectorAll('.reader-mode-cue,.reader-mode-cue-dom').length,
        selection: document.getSelection().rangeCount,
        scrim: scrimStyle ? `${scrimStyle.display}/${scrimStyle.opacity}` : '—',
        nodes: document.getElementsByTagName('*').length});
      if(dismissMarks.length > 40) dismissMarks.shift();
    }, 0);
  }, true);

  let tapHighlightOff = false;
  try{
    if(/[?&]taphl=off/.test(location.search)) localStorage.setItem('breeze.debug.taphl','off');
    if(/[?&]taphl=on/.test(location.search)) localStorage.removeItem('breeze.debug.taphl');
    tapHighlightOff = localStorage.getItem('breeze.debug.taphl') === 'off';
  }catch(error){}
  if(tapHighlightOff){
    const style = document.createElement('style');
    style.textContent = '#sentence-scrim,#sheetbg{-webkit-tap-highlight-color:transparent}';
    (document.head || document.documentElement).appendChild(style);
    console.log('[breeze] scrim tap highlight 꺼짐 (?taphl=on 으로 되돌립니다)');
  }

  /* 시간축으로 봐야 보이는 것이 있습니다 — 문장해석을 한 번 쓰고 닫은 뒤부터
     프레임이 조금씩 무거워지는지 같은 것. 창을 열고 닫는 순간만 보면 그 버그는
     재현된 적이 없는 것입니다. 이 요약은 그 비교를 위한 것입니다. */
  window.breezeFrameSummary = function(sinceMs){
    const list = (window.__breezeFrames||[]).filter(entry=>
      !sinceMs || entry.at >= Date.now()-sinceMs);
    /* 프레임 기록이 비어 있어도 rAF 값은 그대로 돌려줍니다 — 그 둘은 다른 자입니다.
       "아직 없습니다" 한 줄로 덮으면 기기에서 다시 재야 하는데, 그게 제일 비쌉니다. */
    const total = key => list.reduce((sum,entry)=>sum+(entry[key]||0),0);
    const per = key => list.length ? +(total(key)/list.length).toFixed(2) : 0;
    const durations = list.map(entry=>entry.duration).sort((a,b)=>a-b);
    const at = q => durations.length
      ? durations[Math.min(durations.length-1,Math.floor(durations.length*q))] : 0;
    const gaps = [...rafGaps].sort((a,b)=>a-b);
    const gapAt = q => gaps.length ? gaps[Math.min(gaps.length-1,Math.floor(gaps.length*q))] : 0;
    const rafP95 = +gapAt(.95).toFixed(1);
    return {
      frames: list.length,
      'rAF p50': +gapAt(.5).toFixed(1),
      'rAF p95': rafP95,
      'rAF max': gaps.length ? +gaps[gaps.length-1].toFixed(1) : 0,
      'long tasks': longTasks.length,
      'long task ms': +longTasks.reduce((sum,ms)=>sum+ms,0).toFixed(0),
      /* 표본이 없으면 p95 는 0 이고, 0 은 "빠르다"가 아니라 "재지 못했다"입니다.
         그 둘을 섞으면 판정 자체가 거짓말이 됩니다. */
      '판정': gaps.length < 30 ? '표본이 모자랍니다 — 몇 초 더 밀고 다시 보세요'
            : rafP95 > 100 ? 'A — 메인 스레드가 막혔습니다 (JS/layout 계층)'
            : rafP95 > 33  ? '애매 — 다시 재세요'
            :                'B — 메인 스레드는 정상입니다 (WebKit paint 계층)',
      '낱말 span': spansOff ? '꺼짐' : '켜짐',
      'scrim tap highlight': tapHighlightOff ? '꺼짐' : '켜짐',
      '마지막 닫기': lastDismiss,
      '닫은 뒤 남은 것': dismissMarks.length
        ? dismissMarks.slice(-3).map(mark=>
            `${mark.how}(highlight ${mark.highlights}·cue ${mark.cue}·선택 ${mark.selection}·노드 ${mark.nodes}·시트바깥 ${mark.scrim})`).join(' / ')
        : '아직 없음',
      'captureAnchor/frame': per('captureAnchor'),
      'paragraphForSource/frame': per('paragraphForSource'),
      'getBoundingClientRect/frame': per('layout read: getBoundingClientRect'),
      'elementFromPoint/frame': per('layout read: elementFromPoint'),
      'duration p50': +at(.5).toFixed(2),
      'duration p95': +at(.95).toFixed(2),
      'duration max': durations.length ? +durations[durations.length-1].toFixed(2) : 0,
    };
  };
  /* 한 번 재고 다음 조건으로 넘어갈 때, 앞 조건의 값이 섞이면 A/B 비교가 무의미해집니다.
     그래서 프레임 기록뿐 아니라 rAF 간격과 long task 도 함께 비웁니다. */
  window.breezeFrameReset = function(){
    window.__breezeFrames = [];
    rafGaps.length = 0; rafLast = performance.now();
    longTasks.length = 0;
    chromeTrace.length = 0;
    dismissMarks.length = 0;
    return 'ok';
  };

  /* 상단바가 굳는 자리를 찾으려면 요약이 아니라 **차례**가 필요합니다. 어떤 전이가
     빠졌는지는 평균으로는 안 보입니다 — 굳기 직전 몇 줄에 들어 있습니다. */
  window.breezeChromeTrace = function(){
    if(!chromeTrace.length) return '아직 민 적이 없습니다';
    const head = 't(ms)  y     걸음  run   상단바  pin   hold  pause anchor prog';
    const rows = chromeTrace.slice(-120).map(row=>{
      const pad = (value, width) => String(value).padEnd(width);
      const line = pad(row.t, 7) + pad(row.y, 6) + pad(row.d, 6) + pad(row.run, 6)
        + pad(row.hidden ? '걷힘' : '보임', 8) + pad(row.pin, 6) + pad(row.hold, 6)
        + pad(row.pause, 6) + pad(row.anchor, 7) + row.prog;
      return row.paint ? line + '\n        ↳ ' + row.paint : line;
    });
    return [head, ...rows].join('\n');
  };

  /* ---- 손에 들고 재기 ----
     이 계측은 기기에서 빠르게 밀어 봐야 뜻이 있는데, 아이폰에는 콘솔이 없습니다.
     그래서 `?frames=1` 일 때만 왼쪽 아래에 작은 단추를 답니다. 눌러서 값을 보고,
     복사해서 그대로 붙여 넣으면 됩니다. 이 파일 자체가 `?frames=1` 이 아니면
     실행되지 않으므로, 평소 화면에는 이 단추가 존재하지 않습니다. */
  function lines(summary){
    if(typeof summary === 'string') return [summary];
    return Object.entries(summary).map(([key,value])=>`${key}: ${value}`);
  }

  function buildPanel(){
    if(!document.body || document.getElementById('breeze-frame-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'breeze-frame-hud';
    hud.style.cssText = 'position:fixed; left:14px; bottom:calc(18px + env(safe-area-inset-bottom));' +
      /* 떠 있는 UI 위이되(진행줄·Aa·전환 단추), 문장해석 창(120) 아래입니다 —
         재는 동안 창을 가려 손짓을 가로채면 그 자체가 실험을 망칩니다. */
      'z-index:110; font:600 13px/1.45 -apple-system,system-ui,sans-serif;' +
      '-webkit-user-select:none; user-select:none;';

    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = '진단';
    open.style.cssText = 'appearance:none; border:0; border-radius:999px; padding:9px 15px;' +
      'background:#1b1b1f; color:#fff; box-shadow:0 3px 10px rgba(0,0,0,.3); font:inherit;';

    const sheet = document.createElement('div');
    sheet.hidden = true;
    sheet.style.cssText = 'position:fixed; left:12px; right:12px;' +
      'bottom:calc(66px + env(safe-area-inset-bottom)); max-height:62vh;' +
      'background:#fff; color:#111; border-radius:14px; padding:12px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.28); display:flex; flex-direction:column; gap:8px;';

    /* 값은 textarea 에 둡니다 — 복사가 막힌 상황에서도 길게 눌러 직접 고를 수 있습니다.
       (http 로 열면 clipboard API 가 없는 기기가 있습니다.) */
    const box = document.createElement('textarea');
    box.readOnly = true;
    box.style.cssText = 'width:100%; flex:1; min-height:200px; border:1px solid #ddd;' +
      'border-radius:9px; padding:9px; font:500 12px/1.5 ui-monospace,Menlo,monospace;' +
      'color:#111; background:#fafafa; -webkit-user-select:text; user-select:text; resize:none;';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:8px;';
    const button = (label, background) => {
      const el = document.createElement('button');
      el.type = 'button'; el.textContent = label;
      el.style.cssText = 'flex:1; appearance:none; border:0; border-radius:9px; padding:10px;' +
        `background:${background}; color:#fff; font:inherit;`;
      row.appendChild(el);
      return el;
    };
    const copy  = button('복사', '#2f6fed');
    const bar   = button('상단바', '#4a5568');
    const reset = button('초기화', '#8a8a90');
    const close = button('닫기', '#c9c9cf');
    close.style.color = '#111';

    /* 보고 있는 것이 요약인지 상단바 기록인지 — "새로" 는 그때 보던 것을 다시 뜹니다. */
    let view = 'summary';
    function refresh(){
      const head = [
        `Breeze 진단 ${new Date().toLocaleTimeString('ko-KR')}`,
        `주소: ${location.search || '(없음)'}`,
        '',
      ];
      box.value = view === 'chrome'
        ? head.concat('── 상단바 시간순 ──', window.breezeChromeTrace()).join('\n')
        : head.concat(lines(window.breezeFrameSummary())).join('\n');
    }

    open.addEventListener('click', ()=>{
      if(sheet.hidden){ refresh(); sheet.hidden = false; open.textContent = '새로'; }
      else refresh();
    });
    bar.addEventListener('click', ()=>{
      view = view === 'chrome' ? 'summary' : 'chrome';
      bar.textContent = view === 'chrome' ? '요약' : '상단바';
      refresh();
    });
    close.addEventListener('click', ()=>{ sheet.hidden = true; open.textContent = '진단'; });
    reset.addEventListener('click', ()=>{
      window.breezeFrameReset();
      box.value = '비웠습니다 — 이제 빠르게 밀어 본 뒤 "새로" 를 누르세요';
    });
    copy.addEventListener('click', async ()=>{
      const said = text => { copy.textContent = text; setTimeout(()=>{ copy.textContent = '복사'; }, 1200); };
      try{
        await navigator.clipboard.writeText(box.value);
        said('복사됨');
      }catch(error){
        /* 안전한 문맥이 아니면 clipboard API 가 없습니다 — 예전 방법으로 한 번 더. */
        box.removeAttribute('readonly');
        box.select(); box.setSelectionRange(0, box.value.length);
        const ok = document.execCommand && document.execCommand('copy');
        box.readOnly = true;
        said(ok ? '복사됨' : '길게 눌러 복사하세요');
      }
    });

    sheet.append(box, row);
    hud.append(sheet, open);
    document.body.appendChild(hud);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel);
  else buildPanel();

  console.log('[breeze] frame trace on — breezeFrameSummary() / breezeFrameReset()');
})();
