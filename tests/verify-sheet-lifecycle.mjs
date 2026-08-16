/* ============ 한 번의 열림 · 하나의 임자 · 늦은 답은 손님 (실제로 돌려서) ============

   `verify-gesture-ownership.mjs` 가 지키는 것은 **손짓**의 임자입니다 —
   `pointerdown` 부터 `click` 까지. 이 파일이 지키는 것은 **열림**의 임자입니다 —
   낱말 창이 떠 있는 동안 시작된 조회들.

   둘은 수명이 다릅니다. 손짓은 손가락을 떼면 끝나지만, 조회는 그 뒤로도 몇 초를
   더 삽니다. 그 사이에 사람이 창을 닫으면 답은 주인 없는 답이 됩니다.

   ---- 왜 이 파일이 생겼는지 ----
   실기기에서 온 말 한 줄이 근거입니다: "뜻이 완성되기 전에 바로 나가면 렉이 훨씬
   잘 걸린다." 브라우저에서 재 보니 실제로 이런 일이 있었습니다.

     ① 시트를 닫고 **2초 뒤에 번역 요청이 새로 출발**했습니다. 닫힌 창을 위해서.
     ② "이 문장에서는?" 의 답이 늦게 오면 `selectWord` 를 불러 **시트가 저 혼자
        다시 열렸습니다.** 손은 이미 떠나서 글을 넘기고 있는데.
     ③ 표현 칩의 답이 늦게 오면 `renderBookBody` 로 **본문 전체를 다시
        조립했습니다** — 개츠비에서 문단 1600여 개를.

   셋 다 "늦게 도착한 답이 죽은 창을 조종한" 것입니다.

   ---- 무엇을 지키고 무엇을 지키지 않는지 ----
   지키는 것: **죽은 열림은 이후의 답으로 화면을 조종할 권리가 없다.**
   지키지 **않는** 것: "닫으면 아무것도 저장하지 않는다". 그 반대입니다 — 도착한
   답은 창이 닫혔어도 캐시와 카드에 남습니다. 한도는 이미 나갔고 답은 옳습니다.
   버리는 것은 화면을 만질 권리 하나뿐입니다.

   그래서 아래에는 "안 그렸다"를 세는 자리와 "그래도 남았다"를 세는 자리가 함께
   있습니다. 한쪽만 지키면 다른 쪽이 조용히 깨집니다. */

import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'scripts/dictionary/dictionary.js'), 'utf8');

/* ---- 가짜 화면 ----
   사전 창은 그리는 자리가 많습니다. 여기서 보고 싶은 것은 그 내용이 아니라
   **그렸는가 안 그렸는가** 뿐이라, 모든 자리를 같은 모양의 빈 상자로 만들고
   손댄 횟수만 셉니다. */
function makeElement(id, world){
  const element = {
    id, tagName:'DIV', hidden:false, textContent:'', innerHTML:'', href:'', value:'',
    dataset:{}, style:{}, onclick:null, scrollTop:0,
    classes:new Set(),
    classList:{
      contains:name=>element.classes.has(name),
      add(name){ element.classes.add(name); world.touched++; },
      remove(name){ element.classes.delete(name); world.touched++; },
      toggle(name,on){ if(on) element.classes.add(name); else element.classes.delete(name); },
    },
    appendChild(){ world.touched++; },
    addEventListener(){}, removeEventListener(){}, focus(){},
    getAttribute(){ return null; }, setAttribute(){}, removeAttribute(){},
    closest(){ return null; },
    /* 창 안의 자잘한 자리들은 없으면 그 자리에서 만들어 줍니다 — 이 시험은
       무엇이 쓰였나가 아니라 **그렸나 안 그렸나** 만 봅니다. */
    querySelector(sel){
      const kids = element.kids || (element.kids = new Map());
      if(!kids.has(sel)) kids.set(sel, makeElement(element.id+' '+sel, world));
      return kids.get(sel);
    },
    querySelectorAll(){ return []; },
    insertAdjacentHTML(){ world.touched++; },
  };
  return element;
}

function makeWorld(){
  const world = { touched:0, elements:new Map(), renders:0, saves:0, syncs:0,
                  bookRebuilds:0, sent:[], puts:[], aborted:0, timers:[] };
  world.el = id => {
    if(!world.elements.has(id)) world.elements.set(id, makeElement(id, world));
    return world.elements.get(id);
  };
  return world;
}

/* ---- 가짜 그물 ----
   답을 언제 돌려줄지 이 시험이 정합니다. `hold` 를 켜면 답을 손에 쥐고 있다가
   시험이 놓으라고 할 때 놓습니다 — "창을 닫은 **뒤에** 답이 왔다"를 만드는 길. */
function makeNet(world){
  const net = { pending:[], outran:false,
                answer:{ ko:'뜻', pos:'noun', note:'설명', lemma:'', alts:[], left:9 } };
  net.dictCall = (payload, signal) => {
    if(payload && payload.op === 'log') return Promise.resolve(null);
    if(payload && payload.op === 'warm') return Promise.resolve(null);
    world.sent.push(payload.op);
    return new Promise(res => {
      const entry = { res, signal, done:false };
      /* `outran` 은 "답이 끊기보다 빨랐다"입니다 — 이미 선을 타고 오던 답은
         우리가 끊어도 도착합니다. 실기기에서 흔한 쪽이고, 이 시험에서 "그래도
         남아야 한다"를 확인하는 유일한 길입니다. */
      if(signal && !net.outran) signal.addEventListener('abort', () => {
        if(entry.done) return;
        entry.done = true; world.aborted++; res(null);
      }, {once:true});
      else if(signal) signal.addEventListener('abort', ()=>{ world.aborted++; }, {once:true});
      net.pending.push(entry);
    });
  };
  /* 쥐고 있던 답을 모두 놓습니다. 끊긴 것은 빈손으로 — 진짜 `fetch` 가 그렇듯. */
  net.deliver = (value) => {
    const waiting = net.pending; net.pending = [];
    waiting.forEach(entry => {
      if(entry.done) return;
      entry.done = true;
      entry.res(value === undefined ? net.answer : value);
    });
  };
  return net;
}

function makeContext(world, net, store){
  const context = {
    console, performance, setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array,
    String, Number, Boolean, Set, Map, RegExp, Intl, AbortController, encodeURIComponent,
    CSS:{ escape:s=>String(s) },
    navigator:{ onLine:true },
    localStorage:{ getItem:()=>null, setItem(){}, removeItem(){} },
    crypto:{ randomUUID:()=>'test-device' },
    requestAnimationFrame(fn){ return setTimeout(fn, 0); },
    document:{
      getElementById:id=>world.el(id),
      querySelector:()=>null,
      querySelectorAll:()=>[],
      createElement:id=>makeElement(id, world),
      body:makeElement('body', world),
      addEventListener(){},
    },
    /* ---- 앱의 나머지 ----
       `selKey` 와 `curBook` 은 scripts/core/state.js 에 사는 것들입니다. */
    words:{}, dead:{}, positions:{}, selKey:null,
    curBook:{ id:'b', title:'시험책', paras:[] },
    currentReaderMode:'text',
    originalSession:null,
    sb:{ auth:{ getSession:()=>Promise.resolve({ data:{ session:null } }) } },
    sbUser:null, SB_URL:'https://example.test', SB_KEY:'key',
    LS_DEAD:'dead', LS_POS:'pos',
    load:()=>'', save(){},
    saveWords(){ world.saves++; },
    queueSync(){ world.syncs++; },
    keyOf:k=>k,
    esc:s=>String(s==null?'':s),
    toast(){},
    pinReaderChrome(){},
    closeSentence(){},
    refreshOriginalSavedWords(){},
    renderBookBody(){ world.bookRebuilds++; },
    captureAnchor:()=>null, restoreAnchor:()=>false,
    requestDurableLocalStorage(){},
    updateOriginalZoomControls(){},
    rememberAppView(){}, activeAppView:()=>'read',
    openSyncModal(){},
    phraseParts:t=>String(t).split(/\s+/),
    dictGet:key=>Promise.resolve(store.get(key) || null),
    dictPut:(key,value)=>{ store.set(key,value); world.puts.push(key); return Promise.resolve(); },
    dictCall:net.dictCall,
    /* 무료 사전은 이 시험의 주제가 아닙니다 — 취소표를 받았는지만 봅니다. */
    fetch:(url, opt)=>{
      const signal = opt && opt.signal;
      world.timers.push(signal ? 'signal' : 'bare');
      return new Promise((res, rej)=>{
        let done = false;
        if(signal) signal.addEventListener('abort', ()=>{
          if(done) return; done = true;
          rej(Object.assign(new Error('끊김'), { name:'AbortError' }));
        }, {once:true});
        /* 무료 사전이 빈손으로 돌아온 셈 칩니다 — 여기서 보는 것은 답의 내용이
           아니라 취소표를 들고 갔는가입니다. */
        setTimeout(()=>{ if(done) return; done = true; res({ ok:false, status:404, json:()=>Promise.resolve(null) }); }, 1);
      });
    },
  };
  context.window = context;
  context.matchMedia = () => ({ matches:false });
  context.window.matchMedia = context.matchMedia;
  return context;
}

function boot(){
  const world = makeWorld();
  const net = makeNet(world);
  const store = new Map();
  const context = makeContext(world, net, store);
  new Script(source, { filename:'dictionary.js' }).runInNewContext(context);
  /* `dictCall` 은 이 파일이 스스로 선언하므로, 올려놓은 **뒤에** 갈아 끼웁니다. */
  context.dictCall = net.dictCall;
  /* 그리는 횟수는 창을 그리는 문 하나만 세면 됩니다. */
  const realRender = context.renderPanel;
  context.renderPanel = function(...args){ world.renders++; return realRender.apply(this, args); };
  return { world, net, store, ctx:context };
}

const AI_MIN_WAIT = 400;    // dictionary.js 의 280ms 보다 넉넉하게
const tick = () => new Promise(res => setTimeout(res, 0));
/* 미세 작업이 여러 겹 쌓입니다 — 몇 번 돌려 다 가라앉힌 뒤에 봅니다. */
const settle = async (n=12) => { for(let i=0;i<n;i++) await tick(); };

/* 낱말 하나를 새로 누른 것과 같은 자리 — `addWord` 가 하는 일 그대로. */
function tapNewWord(ctx, key){
  ctx.words[key] = { word:key, clicked:key, forms:[key], ko:'', phon:'', defs:[], kodict:[],
    example:'A sentence with '+key+' in it.', book:'시험책', status:1, mark:true,
    addedAt:Date.now(), up:Date.now() };
  ctx.selectWord(key, null);
  return ctx.fetchDict(key);
}

/* ================= ① 닫으면 아직 안 끝난 일이 멈춘다 ================= */
{
  const { world, net, ctx } = boot();
  const running = tapNewWord(ctx, 'flutter');
  await settle();
  assert.equal(world.sent.length, 1, '낱말을 눌렀는데 AI 에게 묻지 않았습니다');

  const rendersWhileOpen = world.renders;
  ctx.closePanel();
  await settle();
  net.deliver(null);            // 끊긴 요청은 빈손으로 돌아옵니다
  await running;
  await settle();

  assert.equal(world.aborted, 1, '창을 닫았는데 달리던 요청이 끊기지 않았습니다');
  assert.equal(world.renders, rendersWhileOpen,
    '닫힌 창을 늦은 답이 다시 그렸습니다');
  assert.ok(!world.timers.includes('bare'),
    '무료 사전 요청 하나가 취소표 없이 나갔습니다 — 닫아도 안 멈춥니다');
  assert.ok(!ctx.words.flutter.aiOff,
    '끊긴 요청을 오류로 적었습니다 — 다시 열면 "안 됐다"가 먼저 보입니다');
  assert.equal(ctx.selKey, null, '닫힌 뒤에도 고른 낱말이 남아 있습니다');
}

/* ================= ② 그래도 도착한 답은 남는다 ================= */
{
  const { world, net, ctx } = boot();
  net.outran = true;                     // 끊기보다 답이 빨랐던 경우
  const running = tapNewWord(ctx, 'slender');
  await settle();
  ctx.closePanel();
  await settle();
  const rendersAfterClose = world.renders;
  net.deliver();                // 끊기보다 답이 빨랐던 경우
  await running;
  await settle();

  assert.equal(ctx.words.slender.ko, '뜻',
    '도착한 답을 버렸습니다 — 한도는 이미 나갔는데 낱말은 빈 채로 남습니다');
  assert.ok(world.puts.length >= 1,
    '도착한 답을 캐시에 넣지 않았습니다 — 다시 물으면 한도를 또 씁니다');
  assert.equal(world.renders, rendersAfterClose,
    '답을 남기면서 닫힌 창까지 그렸습니다');
  assert.ok(!ctx.words.slender.aiLoading && !ctx.words.slender.loading,
    '닫힌 낱말에 바람이 영영 붑니다');
}

/* ================= ③ 캐시에 있으면 서버에 묻지 않는다 ================= */
{
  const { world, net, ctx, store } = boot();
  const running = tapNewWord(ctx, 'basket');
  await settle();
  net.deliver();
  await running;
  await settle();
  const sentSoFar = world.sent.length;

  /* 같은 낱말 · 같은 문장을 다시 — 이번에는 기기에 답이 있습니다. */
  delete ctx.words.basket.ai; ctx.words.basket.ko = '';
  ctx.selectWord('basket', null);
  await ctx.fetchDict('basket');
  await settle();

  assert.equal(world.sent.length, sentSoFar,
    '기기에 있는 답을 두고 서버에 또 물었습니다 — 한도가 거기서 샙니다');
  assert.equal(ctx.words.basket.ko, '뜻', '캐시에서 꺼낸 답이 카드에 안 앉았습니다');
  assert.ok(store.size >= 1, '캐시가 비었습니다');
}

/* ================= ④ 요청이 나가기 전에 닫으면 아예 안 보낸다 ================= */
{
  const { world, ctx } = boot();
  /* 캐시를 뒤지는 동안 사람이 닫습니다. */
  const slowGet = ctx.dictGet;
  ctx.dictGet = key => new Promise(res => setTimeout(()=>slowGet(key).then(res), 5));
  const running = tapNewWord(ctx, 'lantern');
  ctx.closePanel();
  await settle(30);
  await running;

  assert.equal(world.sent.length, 0,
    '창이 이미 닫혔는데 AI 요청이 출발했습니다 — 아무도 안 볼 답에 한도를 씁니다');
}

/* ================= ⑤ 늦은 답이 창을 다시 열지 못한다 ================= */
{
  const { world, net, ctx } = boot();
  net.outran = true;
  ctx.words.moon = { word:'moon', clicked:'moon', forms:['moon'], ko:'달', ai:{ko:'달',done:true},
    example:'첫 문장', book:'시험책', status:1, mark:true, addedAt:1, up:1 };
  /* 저장해 둔 낱말을 **다른 문장에서** 만난 자리 — 그때만 "이 문장에서는?" 이
     뜹니다. 그 상태는 `openWord` 가 만듭니다. */
  const span = { textContent:'moon', dataset:{ example:'아주 다른 문장입니다.' },
                 classList:{ add(){}, remove(){} }, closest:()=>null };
  ctx.openWord('moon', span);
  const asking = ctx.askCurrentContext('moon');
  await settle();
  assert.equal(world.sent.length, 1, '"이 문장에서는?" 이 서버에 묻지 않았습니다');

  ctx.closePanel();
  await settle();
  const rendersAfterClose = world.renders;
  const panel = world.el('panel'), scrim = world.el('sheetbg');
  net.deliver();                // 답은 도착합니다 — 창이 닫힌 뒤에
  await asking;
  await settle();

  assert.equal(panel.classList.contains('on'), false,
    '닫은 시트가 늦은 답을 받고 저 혼자 다시 열렸습니다');
  assert.equal(scrim.classList.contains('on'), false,
    '닫은 시트의 바깥판이 늦은 답을 받고 다시 화면을 덮었습니다');
  assert.equal(ctx.selKey, null, '늦은 답이 `selectWord` 로 낱말을 다시 골랐습니다');
  assert.equal(world.renders, rendersAfterClose, '늦은 답이 닫힌 창을 그렸습니다');
  assert.ok(world.puts.length >= 1,
    '늦게 왔다는 이유로 답을 캐시에서도 뺐습니다 — 다시 물으면 한도를 또 씁니다');
}

/* ================= ⑥ 늦은 답이 본문을 다시 조립하지 못한다 ================= */
{
  const { world, net, ctx } = boot();
  net.outran = true;
  ctx.words.care = { word:'care', clicked:'care', forms:['care'], ko:'돌봄', phrase:'takes care of',
    example:'She takes care of it.', book:'시험책', status:1, mark:true, addedAt:1, up:1 };
  ctx.selectWord('care', null);
  const opening = ctx.openPhrase('care');
  await settle();
  ctx.closePanel();
  await settle();
  net.deliver();
  await opening;
  await settle();

  assert.equal(world.bookRebuilds, 0,
    '시트를 닫은 뒤 늦은 답이 본문 전체를 다시 조립했습니다 — 스크롤 한복판에서');
  assert.equal(world.el('panel').classList.contains('on'), false,
    '표현의 늦은 답이 닫은 시트를 다시 열었습니다');
}

/* ================= ⑦ 같은 낱말을 닫았다 다시 열어도 섞이지 않는다 =================
   `selKey === k` 로만 막던 시절에 못 잡던 자리입니다. 열쇠가 같으므로 앞 열림의
   늦은 답이 새 열림의 것인 척 들어옵니다. */
{
  const { world, net, ctx } = boot();
  net.outran = true;
  const first = tapNewWord(ctx, 'tide');
  await settle();
  const firstRound = net.pending.slice();
  net.pending = [];
  ctx.closePanel();
  await settle();

  ctx.selectWord('tide', null);           // 같은 낱말을 다시 엽니다
  await settle();
  const rendersInSecond = world.renders;

  firstRound.forEach(entry => { if(!entry.done){ entry.done = true; entry.res(net.answer); } });
  await first;
  await settle();

  assert.equal(world.renders, rendersInSecond,
    '앞 열림의 늦은 답이 새 열림의 창을 그렸습니다 — 열쇠가 같다고 같은 열림은 아닙니다');
}

/* ================= ⑧ 몇 번을 여닫아도 새는 것이 없다 ================= */
{
  const { world, net, ctx } = boot();
  for(let i=0;i<60;i++){
    const running = tapNewWord(ctx, 'w'+i);
    await settle(3);
    ctx.closePanel();
    net.deliver(i % 2 ? null : undefined);   // 절반은 끊기고 절반은 도착합니다
    await running;
    await settle(3);
  }
  assert.equal(world.el('panel').classList.contains('on'), false,
    '60번을 여닫았더니 시트가 열린 채로 남았습니다');
  assert.equal(net.pending.length, 0, '주인 없는 요청이 남았습니다');
  assert.equal(ctx.selKey, null, '고른 낱말이 남았습니다');
  const stuck = Object.keys(ctx.words).filter(k=>ctx.words[k].loading || ctx.words[k].aiLoading);
  assert.deepEqual(stuck, [], '바람이 멈추지 않은 낱말이 남았습니다: '+stuck.join(', '));
}

/* ================= ⑨ 확정 못 한 새 조회는 없던 일입니다 =================

   낱말을 누르는 그 순간 단어장에 자리가 하나 생기고, 뜻은 그 뒤에 옵니다.
   그래서 AI 를 기다리는 동안 창을 닫으면 뜻이 하나도 없는 낱말이 남았습니다 —
   실사용에서 제일 자주 만나는 쓰레기입니다. 한도가 떨어졌을 때도, 요청이
   실패했을 때도 같은 껍데기가 남습니다.

   규칙은 한 줄입니다: **새 조회는 창이 살아 있는 동안에만 낱말이 됩니다.**
   확정 못 한 채로 창이 끝나면 그 자리에서 없던 일입니다. 닫은 뒤에도 남아
   답을 기다리는 상태는 만들지 않습니다.

   그래서 여기서 지키는 것은 셋입니다:
     ① 확정 못 하고 끝난 새 조회는 버린다
     ② 확정의 기준은 **AI 의 답이거나 사람의 채택**이다 — 무료 사전 후보가
        뜻자리를 채웠다는 것만으로는 확정이 아닙니다. `yield` 를 누르면
        양보하다·산출하다·굴복하다·생산량이 함께 오는데, 그 중 무엇을 원했는지
        시스템은 모릅니다
     ③ 그 밖에는 **아무것도** 안 버린다 — 전에 저장해 둔 낱말은 뜻이 비어
        있어도 남고, 늦게 온 답이 버린 낱말을 되살리지도 않습니다
   ①만 지키면 단어장이 조용히 줄어듭니다. */
function newWordSpan(key){
  return { textContent:key, dataset:{}, classList:{ add(){}, remove(){} }, closest:()=>null };
}
/* 진짜 손짓이 지나는 문 그대로 — `addWord` 를 건너뛰면 이 규칙 자체가 안 걸립니다. */
const tapBrandNewWord = (ctx, key) => ctx.openWord(key, newWordSpan(key));
/* 창이 열려 있는 채로 답이 오면 `AI_MIN_WAIT`(280ms) 만큼 바람을 더 보여 준 뒤에
   놓습니다 — 미세 작업만 돌려서는 그 자리를 못 지납니다. */
const rest = ms => new Promise(res => setTimeout(res, ms));
const savedWord = (key, ko) => ({ word:key, clicked:key, forms:[key], ko, ai:ko?{ko,done:true}:undefined,
  phon:'', defs:[], kodict:[], example:'첫 문장', book:'시험책', status:1, mark:true, addedAt:1, up:1 });

{
  /* AI 뜻 로딩 중에 닫음 */
  const { world, net, ctx } = boot();
  tapBrandNewWord(ctx, 'gossamer');
  await settle();
  assert.ok(ctx.words.gossamer, '새 낱말이 창을 여는 동안에도 자리를 못 잡았습니다');
  assert.equal(world.syncs, 0,
    '뜻이 하나도 없는 낱말을 곧바로 다른 기기로 올려 보냈습니다 — 그대로 닫히면 부고까지 한 번 더 오갑니다');
  ctx.closePanel();
  await settle();
  net.deliver(null);
  await settle();
  assert.equal(ctx.words.gossamer, undefined,
    'AI 를 기다리다 닫았는데 뜻 없는 낱말이 단어장에 남았습니다');
}
{
  /* 답이 왔으면 채택입니다 — 닫아도 남습니다 */
  const { net, ctx } = boot();
  tapBrandNewWord(ctx, 'brindle');
  await settle();
  net.deliver();
  await rest(AI_MIN_WAIT); await settle();
  ctx.closePanel();
  await settle();
  assert.ok(ctx.words.brindle, '뜻을 받은 새 낱말이 닫으면서 함께 사라졌습니다');
  assert.equal(ctx.words.brindle.ko, '뜻', '남기기는 했는데 뜻이 안 붙어 있습니다');
}
{
  /* 한도가 떨어졌거나 요청이 실패한 뒤에 닫음 */
  const { net, ctx } = boot();
  tapBrandNewWord(ctx, 'quillon');
  await settle();
  net.deliver({ error:'quota_exceeded' });
  await settle();
  assert.equal(ctx.words.quillon.ko, '', '이 시험은 뜻이 안 붙은 상태를 봐야 합니다');
  ctx.closePanel();
  await settle();
  assert.equal(ctx.words.quillon, undefined,
    'AI 가 답하지 못한 낱말이 뜻 없이 단어장에 남았습니다');
}
{
  /* 이미 있던 낱말은 절대 안 지웁니다 — 뜻이 있든 없든 */
  const { ctx } = boot();
  ctx.words.harbour = savedWord('harbour', '항구');
  ctx.words.hollow  = savedWord('hollow', '');     // 사람이 뜻만 지워 둔 자리
  ctx.openWord('harbour', newWordSpan('harbour'));
  await settle();
  ctx.closePanel();
  await settle();
  ctx.openWord('hollow', newWordSpan('hollow'));
  await settle();
  ctx.closePanel();
  await settle();
  assert.ok(ctx.words.harbour, '이미 저장해 둔 낱말이 다시 열었다 닫는 것만으로 사라졌습니다');
  assert.ok(ctx.words.hollow,
    '뜻자리를 비워 둔 낱말이 사라졌습니다 — 버리는 기준은 "비었다"가 아니라 "이번에 만들었다"입니다');
}
{
  /* 닫지 않고 옆 낱말로 건너뛰어도 껍데기는 안 남습니다 */
  const { ctx } = boot();
  tapBrandNewWord(ctx, 'lintel');
  await settle();
  tapBrandNewWord(ctx, 'mullion');
  await settle();
  assert.equal(ctx.words.lintel, undefined,
    '뜻 없는 낱말을 띄운 채 옆 낱말을 열었더니 앞 껍데기가 그대로 남았습니다');
  assert.ok(ctx.words.mullion, '방금 연 낱말까지 함께 사라졌습니다');
}
{
  /* 뜻을 받은 뒤에 사람이 그 뜻을 × 로 지우는 것은 단어장을 손보는 일입니다 —
     이 규칙이 볼 일이 아닙니다. `deleteMeaning` 은 빈 뜻자리를 남깁니다. */
  const { net, ctx } = boot();
  tapBrandNewWord(ctx, 'tessera');
  await settle();
  net.deliver();
  await rest(AI_MIN_WAIT); await settle();
  ctx.deleteMeaning('tessera');
  await settle();
  ctx.closePanel();
  await settle();
  assert.ok(ctx.words.tessera,
    '뜻을 받은 뒤 그 뜻 하나를 지웠을 뿐인데 낱말까지 사라졌습니다');
  assert.equal(ctx.words.tessera.ko, '', '뜻자리가 비지 않았습니다');
}

{
  /* 무료 사전 후보만 있는 채로 닫음 — 후보가 여럿이라는 사실은 대표 뜻이 아닙니다.
     번역기가 실제로 돌려주는 모양 그대로 답하게 해서, `fetchKo` 가 빈 뜻자리를
     채우는 그 길을 진짜로 지나갑니다. */
  const { net, ctx } = boot();
  const bare = ctx.fetch;
  ctx.fetch = (url, opt) => String(url).includes('translate.googleapis.com')
    ? Promise.resolve({ ok:true, json:()=>Promise.resolve(
        [[['양보하다','yield']], [['동사',['양보하다','굴복하다']],['명사',['산출하다','생산량']]]]) })
    : bare(url, opt);
  tapBrandNewWord(ctx, 'yield');
  net.deliver({ error:'quota_exceeded' });
  await settle(40);
  assert.equal(ctx.words.yield.ko, '양보하다',
    '이 시험은 무료 사전이 뜻자리를 채운 상태를 봐야 합니다');
  assert.ok(ctx.words.yield.kodict.length >= 2, '무료 사전 후보가 여러 개인 상태여야 합니다');
  ctx.closePanel();
  await settle();
  assert.equal(ctx.words.yield, undefined,
    '무료 사전 후보만 보고 닫았는데 낱말이 남았습니다 — 어느 뜻을 원했는지 아무도 모릅니다');
}
{
  /* 늦게 도착한 답이 버린 낱말을 되살리지 않습니다.
     이 자리가 이번 규칙에서 제일 위험한 곳입니다: 요청은 이미 선을 타고 있고,
     답은 옳고, 캐시에는 남아야 합니다. 남으면 안 되는 것은 **낱말** 하나뿐입니다. */
  const { world, net, ctx } = boot();
  net.outran = true;                       // 끊기보다 답이 빨랐던 경우
  tapBrandNewWord(ctx, 'ferrule');
  await settle();
  assert.equal(world.sent.length, 1, '이 시험은 요청이 이미 나간 상태를 봐야 합니다');
  ctx.closePanel();
  await settle();
  assert.equal(ctx.words.ferrule, undefined, '닫는 그 자리에서 버리지 않았습니다');

  net.deliver();                           // 그 뒤에 답이 도착합니다
  await rest(AI_MIN_WAIT); await settle(30);
  assert.equal(ctx.words.ferrule, undefined,
    '늦게 온 답이 버린 낱말을 단어장에 되살렸습니다');
  assert.ok(world.puts.some(key=>key.includes('ferrule')),
    '늦게 온 답을 캐시에도 안 남겼습니다 — 다시 물으면 한도를 또 씁니다');
  assert.equal(world.el('panel').classList.contains('on'), false,
    '늦게 온 답이 낱말 창을 다시 열었습니다');
  assert.equal(ctx.selKey, null, '늦게 온 답이 고른 낱말을 되살렸습니다');
}
{
  /* 사람이 추천 뜻을 직접 채택했으면 확정입니다 — AI 가 답한 적이 없어도. */
  const { ctx } = boot();
  tapBrandNewWord(ctx, 'gimbal');
  await settle();
  ctx.adoptSuggestion('gimbal', '짐벌');
  ctx.closePanel();
  await settle();
  assert.ok(ctx.words.gimbal, '사람이 고른 뜻이 있는데도 닫으면서 낱말이 사라졌습니다');
  assert.equal(ctx.words.gimbal.ko, '짐벌', '남기기는 했는데 고른 뜻이 안 붙어 있습니다');
}
{
  /* 이미 있던 낱말은 AI 가 실패해도 그대로입니다 — 이번 규칙의 대상이 아닙니다. */
  const { net, ctx } = boot();
  ctx.words.harrow = savedWord('harrow', '써레');
  ctx.selectWord('harrow', null);
  const running = ctx.fetchDict('harrow');
  await settle();
  net.deliver({ error:'quota_exceeded' });
  await running; await settle();
  ctx.closePanel();
  await settle();
  assert.ok(ctx.words.harrow, 'AI 가 실패했다고 이미 있던 낱말을 지웠습니다');
  assert.equal(ctx.words.harrow.ko, '써레', '있던 뜻이 함께 사라졌습니다');
}

console.log('낱말 창 한살이 기준선 통과 — 죽은 열림은 화면을 못 만지고, 도착한 답은 남습니다 (60회 여닫기 무결)');
console.log('확정 못 한 새 조회는 없던 일 — AI 답·사람의 채택만 확정, 늦은 답도 되살리지 못합니다');
