/* ================= 한 손짓 · 한 임자 · 한 뜻 (실제로 돌려서) =================

   `verify-structure.mjs` 는 코드의 **모양**을 봅니다 — 어디에 `onclick` 이
   있는지, 임자를 몇 군데서 적는지. 그것만으로는 못 잡는 것이 하나 있습니다:

     손짓 **도중에** 창이 닫혀 눌렀던 자리가 사라지고, 그 밑에서 종이가
     드러났을 때, 남은 조각들(`pointerup` · `click`)이 종이로 내려가는가?

   이것은 모양이 아니라 순서의 문제라 실제로 돌려 봐야 압니다. 그래서 여기서는
   `scripts/reader/gesture.js` 를 가짜 DOM 위에 올려 놓고 진짜 손짓 순서대로
   조각을 넣어 봅니다.

   ---- 왜 이 파일이 생겼는지 ----
   실기기에서 잰 A/B 하나가 근거입니다. 같은 화면에서:

     낱말 시트를 바깥(`#sheetbg` 의 `onclick`)으로 닫으면  → 렉 · 빈 화면
     해석 창을 바깥(임자 방식)으로 닫으면                  → 다시 부드러워짐

   두 길이 남기는 JS/DOM 상태를 떠서 비교하면 한 글자도 다르지 않았습니다.
   다른 것은 **손짓의 한살이** 였습니다 — 한쪽만 판정 계층 바깥에 있었습니다.
   그래서 낱말 시트도 임자를 갖게 했고, 그 사실을 여기서 지킵니다.

   (렉 자체가 모든 책에서 나지는 않습니다. 기사에서는 안 나고 긴 책에서 납니다.
    바깥 누르기는 방아쇠이고 그리는 양이 조건입니다. 그러니 이 파일이 지키는
    것은 "렉이 없다"가 아니라 "판정 계층 바깥에 남은 입력이 없다" 입니다.) */

import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- 가짜 화면 ----
   실제 화면에서 오는 것 중 판정에 쓰이는 것만 흉내 냅니다: 무엇이 열려 있는가
   (`hidden` · `classList`), 어디를 짚었는가(`closest`), 그리고 종이가
   그 자리를 자기 것이라 하는가(`claims`). */
function makeElement(id, parent){
  const element = {
    id, parent: parent || null, hidden: true, classes: new Set(),
    tagName: 'DIV', nodeType: 1,
    classList: {
      contains: name => element.classes.has(name),
      add: name => element.classes.add(name),
      remove: name => element.classes.delete(name),
    },
    closest(selector){
      const wants = selector.split(',').map(part => part.trim());
      let node = element;
      while(node){
        if(wants.some(wanted => wanted.startsWith('#') ? node.id === wanted.slice(1)
          : wanted === '[contenteditable]' ? !!node.contenteditable
          : wanted === node.tagName.toLowerCase())) return node;
        node = node.parent;
      }
      return null;
    },
  };
  return element;
}

function makeWorld(){
  const nodes = {};
  const element = (id, parent) => (nodes[id] = makeElement(id, parent ? nodes[parent] : null));
  element('v-read');
  element('rtext', 'v-read');
  element('word');            // 종이 위의 낱말 하나
  nodes.word.parent = nodes.rtext;
  element('sentence-modal', 'v-read');
  element('sentence-scrim', 'sentence-modal');
  element('ps-body', 'sentence-modal');      // 창 안 — 눌러도 닫히지 않아야 합니다
  element('aa-pop');
  element('aa-dark', 'aa-pop');
  /* 읽는 동안 떠 있는 조각 — 상단바 자리를 대신하는 것들입니다. 종이가 아니므로
     여기서 시작한 손짓은 판정 계층이 통째로 UI 로 보냅니다. */
  element('readchrome', 'v-read');
  element('readback', 'readchrome');
  element('readfabs', 'readchrome');
  element('aafab', 'readfabs');
  element('modefab', 'readfabs');
  element('sheetbg', 'v-read');
  element('panel', 'v-read');
  element('p-close', 'panel');
  element('p-handle', 'panel');
  element('p-body', 'panel');
  element('p-input', 'panel'); nodes['p-input'].tagName = 'INPUT';
  element('p-textarea', 'panel'); nodes['p-textarea'].tagName = 'TEXTAREA';
  element('p-edit', 'panel'); nodes['p-edit'].contenteditable = true;
  element('topbar');

  const listeners = {};
  const selection = {
    isCollapsed: true, anchorNode: null,
    removeAllRanges(){ selection.isCollapsed = true; selection.anchorNode = null; },
  };
  const doc = {
    __nodes: nodes,
    getElementById: id => nodes[id] || null,
    addEventListener: (type, handler) => { (listeners[type] = listeners[type] || []).push(handler); },
    getSelection: () => selection,
  };
  const world = {
    nodes, doc, listeners, selection,
    calls: { closeSentence: 0, closePanel: 0, closeAa: 0, openSentence: 0, openWordAt: 0, sentenceAt: 0 },
    errors: [], timers: [],
    sheetLayout: true,          // 폰(바텀시트)인가, 넓은 화면(옆 칸)인가
    /* 실제 화면에서 하는 일을 그대로 흉내 냅니다 — 닫으면 정말로 닫힙니다.
       그래야 "손짓 도중에 창이 닫힌다"를 진짜로 재현할 수 있습니다. */
    openSentenceModal(){ nodes['sentence-modal'].hidden = false; },
    openWordPanel(){ nodes.panel.classList.add('on'); nodes.sheetbg.classList.add('on'); },
    openAa(){ nodes['aa-pop'].classList.add('on'); },
  };
  return world;
}

function makeContext(world){
  const { doc, nodes } = world;
  const context = {
    document: doc,
    performance: { now: () => Date.now() },
    /* 꾹 누르기 타이머를 세어 둡니다. "창이 임자인 손짓에는 꾹 누르기가 아예
       없다"는 것은 결과(문장이 안 뜬다)가 아니라 **타이머를 걸지 않는다**로
       지켜야 합니다 — 결과만 보면 안쪽에서 조용히 터진 오류와 구별이 안 됩니다. */
    setTimeout: (fn, ms) => { world.timers.push(ms); return setTimeout(fn, ms); },
    clearTimeout,
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    location: { search: '' },
    console: { log(){}, error: (...args) => world.errors.push(String(args[0])) },
    CSS: { highlights: null },
    closeSentence(){ world.calls.closeSentence++; nodes['sentence-modal'].hidden = true; },
    closePanel(){
      world.calls.closePanel++;
      nodes.panel.classList.remove('on');
      nodes.sheetbg.classList.remove('on');
    },
    closeAa(){ world.calls.closeAa++; nodes['aa-pop'].classList.remove('on'); },
    panelIsSheet: () => world.sheetLayout,
    openSentence(){ world.calls.openSentence++; },
    clearReaderModeCue(){},
    readerScroller: () => null,
    readerScrollWasProgrammatic: () => false,
  };
  context.window = context;
  context.globalThis = context;
  new Script(readFileSync(resolve(root, 'scripts/reader/gesture.js'), 'utf8'))
    .runInNewContext(context);
  /* 종이 한 장을 등록합니다. `#rtext` 안에서 시작한 손짓만 자기 것이라고 합니다. */
  context.registerReaderSurface({
    name: 'text',
    claims: event => !!(event.target && event.target.closest && event.target.closest('#rtext')),
    sentenceAt(){ world.calls.sentenceAt++; return { sentence: 'a sentence.', paint(){} }; },
    openWordAt(){ world.calls.openWordAt++; return true; },
    document: () => doc,
  });
  return context;
}

/* ---- 조각을 넣는 자리 ---- */
function fire(world, type, target, x, y){
  const event = {
    type, target, clientX: x, clientY: y,
    pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
    stopped: false, prevented: false,
    stopPropagation(){ this.stopped = true; },
    preventDefault(){ this.prevented = true; },
  };
  (world.listeners[type] || []).forEach(handler => handler(event));
  return event;
}
/* 실제 브라우저가 내놓는 순서 그대로: down → (move…) → up → click */
function tap(world, target, x, y, moves){
  fire(world, 'pointerdown', target, x, y);
  (moves || []).forEach(([mx, my]) => fire(world, 'pointermove', target, mx, my));
  const last = (moves && moves.length) ? moves[moves.length-1] : [x, y];
  fire(world, 'pointerup', target, last[0], last[1]);
  /* 손을 뗀 자리가 사라졌으면 브라우저는 그 밑에 있던 것에 click 을 줍니다. */
  return fire(world, 'click', world.clickTarget || target, last[0], last[1]);
}

function scenario(setup){
  const world = makeWorld();
  const context = makeContext(world);
  if(setup) setup(world, context);
  return { world, context };
}

/* Reading experience의 표시 텍스트만 native selection을 못 시작합니다. 이
   선택 방지는 pointerdown을 취소하지 않고, 남은 selection도 다음 interaction의
   capture 단계에서 지워 기존 word/scroll ownership으로 돌아갑니다. */
{
  const { world } = scenario();
  assert.equal(fire(world, 'selectstart', world.nodes.word, 120, 320).prevented, true,
    'Text Reader lets native selection begin');
  assert.equal(fire(world, 'selectstart', world.nodes['p-body'], 120, 320).prevented, true,
    'Dictionary display text lets native selection begin');
  assert.equal(fire(world, 'selectstart', world.nodes['sentence-modal'], 120, 320).prevented, true,
    'Sentence modal lets native selection begin');
  assert.equal(fire(world, 'selectstart', world.nodes['p-input'], 120, 320).prevented, false,
    'Dictionary input lost native editing selection');
  assert.equal(fire(world, 'selectstart', world.nodes['p-textarea'], 120, 320).prevented, false,
    'Dictionary textarea lost native editing selection');
  assert.equal(fire(world, 'selectstart', world.nodes['p-edit'], 120, 320).prevented, false,
    'Dictionary contenteditable lost native editing selection');
  assert.equal(fire(world, 'selectstart', world.nodes.topbar, 120, 320).prevented, false,
    'Reading selection policy leaks into normal app UI');
  world.selection.isCollapsed = false;
  world.selection.anchorNode = world.nodes['p-body'];
  const recovery = fire(world, 'pointerdown', world.nodes.word, 120, 320);
  assert.equal(world.selection.isCollapsed, true,
    'A stale dictionary selection survives the next Reader interaction');
  assert.equal(recovery.prevented, false,
    'Selection recovery cancels the pointerdown needed for Reader gestures');
}

/* ================= 해석 창 ================= */
{
  const { world } = scenario(w => w.openSentenceModal());
  /* 창이 닫히면 scrim 이 사라지고 그 밑의 종이가 드러납니다 — 실기기에서 뒤따라
     오는 click 이 실제로 종이에 떨어지는 자리입니다. */
  world.clickTarget = world.nodes.word;
  const click = tap(world, world.nodes['sentence-scrim'], 100, 100);
  assert.equal(world.calls.closeSentence, 1, '바깥으로 닫는 손짓이 해석 창을 한 번 닫지 않습니다');
  assert.equal(world.calls.openWordAt, 0,
    '창이 닫힌 뒤 드러난 종이로 꼬리 click 이 내려가 낱말이 함께 열립니다');
  assert.ok(click.stopped && click.prevented, '바깥 닫기의 꼬리 click 이 그대로 흘러갑니다');
  assert.deepEqual(world.errors, [], '한 손짓이 두 가지 일을 했습니다');
}
{
  /* 창 안을 누른 손짓은 아무것도 닫지 않고, 꼬리 click 도 막지 않습니다 — 그
     click 은 창 안의 ↻ 가 받아야 할 자기 것입니다. X 를 뗀 뒤 닫는 길은 바깥
     하나뿐이므로, 이 줄이 그 하나가 안쪽까지 삼키지 않는다는 것을 지킵니다. */
  const { world } = scenario(w => w.openSentenceModal());
  const click = tap(world, world.nodes['ps-body'], 300, 200);
  assert.equal(world.calls.closeSentence, 0, '창 안을 눌렀는데 해석 창이 닫혔습니다');
  assert.equal(world.nodes['sentence-modal'].hidden, false, '창 안을 눌렀는데 창이 사라졌습니다');
  assert.ok(!click.stopped && !click.prevented, '창 안의 단추가 받을 click 을 판정 계층이 삼켰습니다');
  assert.deepEqual(world.errors, [], '창 안을 누른 손짓이 무언가를 했습니다');
}
{
  /* 창 안에서 시작해 크게 민 손짓은 닫지도, 종이의 SCROLL 이 되지도 않습니다. */
  const { world, context } = scenario(w => w.openSentenceModal());
  tap(world, world.nodes['sentence-scrim'], 100, 100, [[100, 260]]);
  assert.equal(world.calls.closeSentence, 0, '창 위에서 민 손짓이 창을 닫았습니다');
  assert.equal(world.nodes['sentence-modal'].hidden, false, '민 손짓에 창이 닫혔습니다');
  assert.equal(context.readerGestureDocument().getElementById('rtext').id, 'rtext', '가짜 화면이 어긋났습니다');
}

/* ================= 낱말 시트 =================
   `#sheetbg` 의 `onclick` 을 지우고 여기로 옮긴 길입니다. 위의 해석 창과
   **똑같은 줄들이** 통과해야 합니다 — 그것이 이 migration 의 목적입니다. */
{
  const { world } = scenario(w => w.openWordPanel());
  world.clickTarget = world.nodes.word;
  const click = tap(world, world.nodes.sheetbg, 100, 100);
  assert.equal(world.calls.closePanel, 1, '바깥으로 닫는 손짓이 낱말 시트를 한 번 닫지 않습니다');
  assert.equal(world.calls.openWordAt, 0,
    '시트가 닫힌 뒤 드러난 종이로 꼬리 click 이 내려가 낱말이 함께 열립니다');
  assert.ok(click.stopped && click.prevented, '시트 바깥 닫기의 꼬리 click 이 그대로 흘러갑니다');
  assert.deepEqual(world.errors, [], '한 손짓이 두 가지 일을 했습니다');
}
{
  const { world } = scenario(w => w.openWordPanel());
  tap(world, world.nodes['p-close'], 300, 20);
  assert.equal(world.calls.closePanel, 1, '낱말 창의 X 가 창을 한 번 닫지 않습니다');
}
{
  /* 시트 안을 눌렀다 뗀 손짓은 아무 일도 하지 않고, 꼬리 click 도 막지
     않습니다 — 그 click 은 시트 안의 단추가 받아야 할 자기 것입니다. */
  const { world } = scenario(w => w.openWordPanel());
  const click = tap(world, world.nodes['p-body'], 180, 500);
  assert.equal(world.calls.closePanel, 0, '시트 안을 눌렀는데 시트가 닫혔습니다');
  assert.ok(!click.stopped && !click.prevented, '시트 안의 단추가 받을 click 을 판정 계층이 삼켰습니다');
}
{
  /* 손잡이를 조금 당긴 것은 닫는 손짓이 아닙니다. */
  const { world } = scenario(w => w.openWordPanel());
  tap(world, world.nodes['p-handle'], 180, 400, [[180, 440]]);
  assert.equal(world.calls.closePanel, 0, '손잡이를 조금 당겼을 뿐인데 시트가 닫혔습니다');
}
{
  /* 끝까지 끌어내리면 닫습니다 — 예전에는 이 판정을 interactions.js 가
     따로 했습니다(한 손짓, 두 판정). */
  const { world } = scenario(w => w.openWordPanel());
  tap(world, world.nodes['p-handle'], 180, 400, [[180, 460], [180, 540]]);
  assert.equal(world.calls.closePanel, 1, '손잡이를 끝까지 끌어내려도 시트가 닫히지 않습니다');
  assert.deepEqual(world.errors, [], '끌어내려 닫는 한 손짓이 두 가지 일을 했습니다');
}
{
  /* 시트를 위로 미는 것은 시트 안의 스크롤입니다 — 거리만 보고 닫으면
     시트를 훑어 올릴 때마다 닫힙니다. */
  const { world } = scenario(w => w.openWordPanel());
  tap(world, world.nodes['p-handle'], 180, 500, [[180, 380], [180, 300]]);
  assert.equal(world.calls.closePanel, 0, '시트를 위로 밀었는데 닫혔습니다');
}

/* ---- 시트가 덮고 있는 동안에는 종이가 손짓을 못 가져갑니다 ---- */
{
  const { world } = scenario(w => w.openWordPanel());
  tap(world, world.nodes.word, 100, 300);
  assert.equal(world.calls.openWordAt, 0, '시트가 덮고 있는데 그 밑의 낱말이 열렸습니다');
  assert.equal(world.calls.closePanel, 0, '시트 밑을 눌렀을 뿐인데 시트가 닫혔습니다');
}
{
  /* 시트가 임자인 손짓에는 꾹 누르기 타이머 **자체가** 걸리지 않습니다. 종이의
     손짓에는 걸립니다 — 둘을 나란히 재야 "안 뜬다"와 "못 뜬다"가 구별됩니다. */
  const paper = scenario();
  fire(paper.world, 'pointerdown', paper.world.nodes.word, 100, 300);
  assert.deepEqual(paper.world.timers, [750], '종이 위의 꾹 누르기 타이머가 사라졌습니다');

  const covered = scenario(w => w.openWordPanel());
  fire(covered.world, 'pointerdown', covered.world.nodes.word, 100, 300);
  assert.deepEqual(covered.world.timers, [],
    '시트가 덮고 있는데 그 밑의 종이가 꾹 누르기 시간을 재기 시작했습니다');
  fire(covered.world, 'pointerup', covered.world.nodes.word, 100, 300);
  assert.equal(covered.world.calls.sentenceAt, 0, '시트가 덮고 있는데 그 밑에서 문장 해석이 떴습니다');

  const modal = scenario(w => w.openSentenceModal());
  fire(modal.world, 'pointerdown', modal.world.nodes['sentence-scrim'], 100, 100);
  assert.deepEqual(modal.world.timers, [], '해석 창 위의 손짓이 꾹 누르기 시간을 재기 시작했습니다');
}

/* ---- 옆 칸일 때는 종이가 그대로 종이 것입니다 ----
   넓은 화면의 낱말 창은 본문을 가리지 않습니다. 여기까지 손짓을 가져가면
   뜻을 하나 열어 둔 채로 다음 낱말을 누를 수 없게 됩니다. */
{
  const { world } = scenario(w => { w.sheetLayout = false; w.openWordPanel(); });
  tap(world, world.nodes.word, 100, 300);
  assert.equal(world.calls.openWordAt, 1, '옆 칸이 열려 있으면 다음 낱말을 누를 수 없습니다');
  assert.equal(world.calls.closePanel, 0, '옆 칸일 때 종이를 누른 것이 창을 닫았습니다');
}
{
  /* 옆 칸일 때도 그 칸의 닫기 단추만은 창의 손짓입니다. */
  const { world } = scenario(w => { w.sheetLayout = false; w.openWordPanel(); });
  tap(world, world.nodes['p-close'], 700, 90);
  assert.equal(world.calls.closePanel, 1, '옆 칸의 X 가 창을 닫지 않습니다');
}

/* ================= Aa 보기 설정 =================

   Aa 에는 scrim 이 없습니다 — 바깥이 곧 읽는 종이입니다. 그래서 "바깥을 눌러
   닫는 손짓"이 동시에 "글자를 누른 손짓"이었고, 실사용에서 설정을 닫는 터치가
   낱말 팝업이나 문장 해석을 함께 열었습니다. 해석 창·낱말 시트와 같은 규칙으로
   옮긴 뒤에는, 그 한 터치가 Aa 를 닫고 **거기서 끝나야** 합니다. */
{
  const { world } = scenario(w => w.openAa());
  /* 뒤에 글자가 있는 자리를 눌러 닫습니다 — 사용자가 실제로 하는 그 손짓. */
  const click = tap(world, world.nodes.word, 120, 320);
  assert.equal(world.calls.closeAa, 1, '바깥을 눌렀는데 Aa 가 닫히지 않습니다');
  assert.equal(world.calls.openWordAt, 0,
    'Aa 를 닫은 그 터치가 종이로 이어져 낱말 창이 함께 열립니다');
  assert.ok(click.stopped && click.prevented, 'Aa 를 닫은 손짓의 꼬리 click 이 그대로 흘러갑니다');
  assert.deepEqual(world.errors, [], '한 손짓이 두 가지 일을 했습니다');
}
{
  /* 꾹 누르기 타이머 **자체가** 안 걸려야 합니다 — 걸리면 1초 뒤에 문장 해석이
     뜹니다. "안 뜬다"가 아니라 "못 뜬다"로 지킵니다. */
  const { world } = scenario(w => w.openAa());
  fire(world, 'pointerdown', world.nodes.word, 120, 320);
  assert.deepEqual(world.timers, [],
    'Aa 가 떠 있는데 그 뒤의 종이가 꾹 누르기 시간을 재기 시작했습니다');
  fire(world, 'pointerup', world.nodes.word, 120, 320);
  assert.equal(world.calls.sentenceAt, 0, 'Aa 를 닫는 손짓이 문장 해석까지 열었습니다');
}
{
  /* 창 안의 단추는 제 `onclick` 을 받아야 합니다 — 여기까지 가져가면 A+ 도
     다크 모드도 안 눌립니다. */
  const { world } = scenario(w => w.openAa());
  const click = tap(world, world.nodes['aa-dark'], 300, 600);
  assert.equal(world.calls.closeAa, 0, 'Aa 안을 눌렀는데 Aa 가 닫혔습니다');
  assert.ok(!click.stopped && !click.prevented, 'Aa 안의 단추가 받을 click 을 판정 계층이 삼켰습니다');
}
{
  /* Aa 단추 자신도 그렇습니다 — 그 click 은 토글이 받습니다. */
  const { world } = scenario(w => w.openAa());
  const click = tap(world, world.nodes.aafab, 340, 700);
  assert.equal(world.calls.closeAa, 0, 'Aa 단추를 눌렀는데 판정 계층이 먼저 닫았습니다');
  assert.ok(!click.stopped && !click.prevented, 'Aa 단추의 click 을 판정 계층이 삼켰습니다');
}
{
  /* 바깥을 밀었으면 읽던 글을 굴린 것입니다. 창은 그대로 두고, 종이의 낱말도
     열지 않습니다 — 임자가 다른 손짓이기 때문입니다. */
  const { world } = scenario(w => w.openAa());
  tap(world, world.nodes.word, 120, 320, [[120, 180]]);
  assert.equal(world.calls.closeAa, 0, '밀었을 뿐인데 Aa 가 닫혔습니다');
  assert.equal(world.calls.openWordAt, 0, '민 손짓이 낱말을 열었습니다');
}
{
  /* 손을 완전히 뗀 뒤의 새 손짓은 평소대로 reader 의 것입니다. */
  const { world } = scenario(w => w.openAa());
  tap(world, world.nodes.word, 120, 320);
  world.clickTarget = null;
  tap(world, world.nodes.word, 120, 320);
  assert.equal(world.calls.closeAa, 1, 'Aa 가 두 번 닫혔습니다');
  assert.equal(world.calls.openWordAt, 1, 'Aa 를 닫은 뒤 새로 누른 낱말이 열리지 않습니다');
}
{
  /* pointer 조각 없이 click 만 오는 기기에서도 닫히고, 거기서 끝나야 합니다. */
  const { world } = scenario(w => w.openAa());
  const click = fire(world, 'click', world.nodes.word, 120, 320);
  assert.equal(world.calls.closeAa, 1, 'click 만 오는 기기에서 Aa 를 바깥으로 닫을 수 없습니다');
  assert.equal(world.calls.openWordAt, 0, 'click 만 오는 기기에서 Aa 를 닫은 터치가 낱말까지 열었습니다');
  assert.ok(click.stopped && click.prevented, '그 click 이 그대로 흘러갑니다');
}
/* ---- 새 조작 조각에서 시작한 손짓은 종이로 안 내려갑니다 ----
   상단바가 걷힌 자리에 뜬 것들이라 **뒤에 글자가 깔려 있습니다.** 예전 상단바에서
   "단어장" 을 눌렀을 때 그 뒤의 낱말이 함께 열리던 자리와 똑같은 모양입니다.
   허용 목록(`READER_PAPER`)이 종이만 reader 로 보내므로 규칙은 이미 서 있지만,
   자리가 겹치는 조각이 새로 셋 생겼으니 그 셋을 이름으로 세워 둡니다. */
for(const id of ['readback', 'aafab', 'modefab']){
  const { world } = scenario();
  const click = tap(world, world.nodes[id], 30, 60);
  assert.equal(world.calls.openWordAt, 0, `#${id} 를 누른 손짓이 그 뒤의 낱말까지 열었습니다`);
  assert.equal(world.calls.sentenceAt, 0, `#${id} 를 누른 손짓이 문장 해석을 열었습니다`);
  assert.deepEqual(world.timers, [], `#${id} 위에서 꾹 누르기 시간을 재기 시작했습니다`);
  assert.ok(!click.stopped && !click.prevented,
    `#${id} 가 받을 click 을 판정 계층이 삼켰습니다 — 단추가 아예 안 눌립니다`);
  assert.deepEqual(world.errors, [], `#${id} 에서 시작한 한 손짓이 두 가지 일을 했습니다`);
}
{
  /* 조각을 눌렀다 손가락이 글 위로 흘러가도 마찬가지입니다 — 임자는 시작할 때
     정해지고 도중에 바뀌지 않습니다. */
  const { world } = scenario();
  fire(world, 'pointerdown', world.nodes.readback, 30, 60);
  fire(world, 'pointerup', world.nodes.word, 120, 320);
  assert.equal(world.calls.openWordAt, 0, '조각에서 시작해 글 위에서 뗀 손짓이 낱말을 열었습니다');
}
{
  /* 겹쳐 있으면 위에 있는 것이 임자입니다 — 낱말 시트가 덮고 있으면 Aa 가
     아니라 시트의 손짓입니다. */
  const { world } = scenario(w => { w.openAa(); w.openWordPanel(); });
  tap(world, world.nodes.sheetbg, 100, 100);
  assert.equal(world.calls.closePanel, 1, '시트가 덮고 있는데 바깥 누르기가 시트를 닫지 않습니다');
  assert.equal(world.calls.closeAa, 0, '시트를 닫는 손짓이 Aa 까지 닫았습니다');
}

/* ---- 겹쳐 있으면 위에 있는 것이 임자입니다 ---- */
{
  const { world } = scenario(w => { w.openWordPanel(); w.openSentenceModal(); });
  tap(world, world.nodes['sentence-scrim'], 100, 100);
  assert.equal(world.calls.closeSentence, 1, '겹쳐 있을 때 바깥 누르기가 해석 창을 닫지 않습니다');
  assert.equal(world.calls.closePanel, 0, '해석 창을 닫는 손짓이 그 밑의 낱말 창까지 닫았습니다');
}

/* ---- 손짓 도중에 화면이 굴러도 임자는 그대로입니다 ----
   실기기에서 닫자마자 빠르게 스크롤하던 자리입니다. */
{
  const { world, context } = scenario(w => w.openWordPanel());
  fire(world, 'pointerdown', world.nodes.sheetbg, 100, 100);
  context.__scroll = null;
  /* 읽는 칸의 scroll 은 gesture.js 안의 `scrollGesture` 가 받습니다. 여기서는
     그 함수를 직접 불러 "화면이 굴렀다"를 만듭니다. */
  context.scrollGesture();
  fire(world, 'pointerup', world.nodes.sheetbg, 100, 100);
  assert.equal(world.calls.closePanel, 1, '누르는 도중 화면이 구르면 시트가 안 닫힙니다');
  assert.deepEqual(world.errors, [], '구르는 도중의 손짓이 두 가지 일을 했습니다');
}

/* ---- pointer 조각 없이 click 만 오는 길 (자판의 Enter 포함) ---- */
{
  const { world } = scenario(w => w.openWordPanel());
  fire(world, 'click', world.nodes['p-close'], 300, 20);
  assert.equal(world.calls.closePanel, 1, 'click 만 오는 기기에서 낱말 창을 닫을 수 없습니다');
}
{
  const { world } = scenario(w => w.openSentenceModal());
  fire(world, 'click', world.nodes['sentence-scrim'], 100, 100);
  assert.equal(world.calls.closeSentence, 1, 'click 만 오는 기기에서 해석 창을 닫을 수 없습니다');
}

/* ---- 한 손짓, 한 뜻 (많이 해 봐도) ----
   실기기에서 반복한 순서 그대로: 낱말 → 바깥으로 닫기 → 스크롤 → 다시. */
{
  const { world, context } = scenario();
  for(let round = 0; round < 200; round++){
    world.clickTarget = null;
    tap(world, world.nodes.word, 100, 300);        // 낱말 열기
    world.openWordPanel();                          // 실제 화면이 하는 일
    world.clickTarget = world.nodes.word;           // 닫히면 그 밑의 종이가 드러납니다
    tap(world, world.nodes.sheetbg, 100, 100);      // 바깥으로 닫기
    context.scrollGesture();                        // 곧바로 스크롤
  }
  assert.equal(world.calls.openWordAt, 200, '200번 도는 사이에 낱말이 열리지 않은 회차가 있습니다');
  assert.equal(world.calls.closePanel, 200, '200번 도는 사이에 닫히지 않은 회차가 있습니다');
  assert.equal(world.calls.sentenceAt, 0, '탭만 했는데 문장 해석이 끼어들었습니다');
  assert.deepEqual(world.errors, [], '반복하는 동안 한 손짓이 두 가지 일을 했습니다');
}

console.log('손짓 임자 기준선 통과 — 해석 창 · 낱말 시트 같은 규칙, 200회 반복 무결');
