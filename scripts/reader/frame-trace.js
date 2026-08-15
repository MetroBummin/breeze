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

  /* 프레임에 이름을 붙여 주는 것들 — 무엇 때문에 이 프레임이 돌았는가. */
  document.addEventListener('DOMContentLoaded', ()=>{
    const scroller = typeof readerScroller === 'function' ? readerScroller() : null;
    if(scroller) scroller.addEventListener('scroll', ()=>scheduleReport('scroll'), {passive:true});
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

  /* 시간축으로 봐야 보이는 것이 있습니다 — 문장해석을 한 번 쓰고 닫은 뒤부터
     프레임이 조금씩 무거워지는지 같은 것. 창을 열고 닫는 순간만 보면 그 버그는
     재현된 적이 없는 것입니다. 이 요약은 그 비교를 위한 것입니다. */
  window.breezeFrameSummary = function(sinceMs){
    const list = (window.__breezeFrames||[]).filter(entry=>
      !sinceMs || entry.at >= Date.now()-sinceMs);
    if(!list.length) return '아직 잰 프레임이 없습니다';
    const total = key => list.reduce((sum,entry)=>sum+(entry[key]||0),0);
    const durations = list.map(entry=>entry.duration).sort((a,b)=>a-b);
    const at = q => durations[Math.min(durations.length-1,Math.floor(durations.length*q))];
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
      '판정': rafP95 > 100 ? 'A — 메인 스레드가 막혔습니다 (JS/layout 계층)'
            : rafP95 > 33  ? '애매 — 다시 재세요'
            :                'B — 메인 스레드는 정상입니다 (WebKit paint 계층)',
      '낱말 span': spansOff ? '꺼짐' : '켜짐',
      'captureAnchor/frame': +(total('captureAnchor')/list.length).toFixed(2),
      'paragraphForSource/frame': +(total('paragraphForSource')/list.length).toFixed(2),
      'getBoundingClientRect/frame': +(total('layout read: getBoundingClientRect')/list.length).toFixed(1),
      'elementFromPoint/frame': +(total('layout read: elementFromPoint')/list.length).toFixed(2),
      'duration p50': +at(.5).toFixed(2),
      'duration p95': +at(.95).toFixed(2),
      'duration max': +durations[durations.length-1].toFixed(2),
    };
  };
  window.breezeFrameReset = function(){ window.__breezeFrames = []; return 'ok'; };
  console.log('[breeze] frame trace on — breezeFrameSummary() / breezeFrameReset()');
})();
