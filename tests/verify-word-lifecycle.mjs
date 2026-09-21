/* ============ 한 번의 열림 · 하나의 임자 · 늦은 답은 손님 (실제로 돌려서) ============

   `verify-gesture-ownership.mjs` 가 지키는 것은 **손짓**의 임자입니다 —
   `pointerdown` 부터 `click` 까지. 이 파일이 지키는 것은 **열림**의 임자입니다 —
   낱말 창이 떠 있는 동안 시작된 조회들.

   둘은 수명이 다릅니다. 손짓은 손가락을 떼면 끝나지만, 조회는 그 뒤로도 몇 초를
   더 삽니다. 그 사이에 사람이 창을 닫으면 답은 주인 없는 답이 됩니다.

   ---- 왜 이 파일이 생겼는지 ----
   실기기에서 온 말 한 줄이 근거입니다: "뜻이 완성되기 전에 바로 나가면 렉이 훨씬
   잘 걸린다." 브라우저에서 재 보니 실제로 이런 일이 있었습니다.

     ① lookup를 닫고 **2초 뒤에 metadata 요청이 새로 출발**했습니다. 닫힌 창을 위해서.
     ② 다른 문장의 늦은 분류·생성 답이 **lookup를 저 혼자 다시 열었습니다.**
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
const lexicalCore = readFileSync(resolve(root, 'modules/lexical/core.js'), 'utf8');
const wordIntegrity = readFileSync(resolve(root, 'scripts/core/word-integrity.js'), 'utf8');
const syncSource = readFileSync(resolve(root, 'scripts/sync/sync.js'), 'utf8');
const mergeWordStateSource = syncSource.slice(syncSource.indexOf('function mergeWordState('),
  syncSource.indexOf('async function mergeVaultPayload('));

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
    remove(){ element.removed=true; world.removed++; },
    insertAdjacentHTML(){ world.touched++; },
  };
  return element;
}

function makeWorld(){
  const world = { touched:0, elements:new Map(), renders:0, saves:0, syncs:0,
                  bookRebuilds:0, sent:[], puts:[], aborted:0, timers:[], queries:0, removed:0 };
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
    world.sent.push(payload.op);world.payloads=(world.payloads||[]).concat(payload);
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
      querySelectorAll:()=>{ world.queries++; return []; },
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
    validWordMeaning:item=>!!(item && String(item.ko||'').trim()),
    queueSync(){ world.syncs++; },
    keyOf:k=>k,
    esc:s=>String(s==null?'':s),
    toast(){},
    readerPillStatus(){},
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
    /* 영어 metadata는 이 시험의 주제가 아닙니다 — 취소표만 봅니다. */
    fetch:(url, opt)=>{
      const signal = opt && opt.signal;
      world.timers.push(signal ? 'signal' : 'bare');
      return new Promise((res, rej)=>{
        let done = false;
        if(signal) signal.addEventListener('abort', ()=>{
          if(done) return; done = true;
          rej(Object.assign(new Error('끊김'), { name:'AbortError' }));
        }, {once:true});
        /* metadata가 빈손으로 돌아온 셈 칩니다 — 여기서 보는 것은 답의 내용이
           아니라 취소표를 들고 갔는가입니다. */
        setTimeout(()=>{ if(done) return; done = true; res({ ok:false, status:404, json:()=>Promise.resolve(null) }); }, 1);
      });
    },
  };
  context.window = context;
  /* 창 자체에 붙는 것은 지금 `online`·`offline` 둘뿐입니다 — 이 시험의 주제가
     아니라 받아만 둡니다. */
  context.addEventListener = () => {};
  context.matchMedia = () => ({ matches:false });
  context.window.matchMedia = context.matchMedia;
  return context;
}

function boot(){
  const world = makeWorld();
  const net = makeNet(world);
  const store = new Map();
  const context = makeContext(world, net, store);
  new Script(lexicalCore, { filename:'modules/lexical/core.js' }).runInNewContext(context);
  new Script(wordIntegrity, { filename:'scripts/core/word-integrity.js' }).runInNewContext(context);
  new Script(source, { filename:'dictionary.js' }).runInNewContext(context);
  new Script('const upOf=word=>word?(word.up||word.addedAt||0):0;\n'+mergeWordStateSource,
    { filename:'scripts/sync/sync.js#mergeWordState' }).runInNewContext(context);
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
const rest = ms => new Promise(res => setTimeout(res, ms));

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
    'metadata 요청 하나가 취소표 없이 나갔습니다 — 닫아도 안 멈춥니다');
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

/* A saved word in a new sentence is classified once; same occurrence reuses the result. */
{
  const {world,ctx,net}=boot();
  ctx.words.moon={word:'moon',clicked:'moon',forms:['moon'],ko:'달',ai:{ko:'달',done:true},example:'The moon is bright.',book:'시험책',status:1,mark:true,addedAt:1,up:1};
  const span={textContent:'moon',dataset:{example:'The moon orbits the planet.'},classList:{add(){},remove(){}},closest:()=>null};
  ctx.openWord('moon',span);await settle();
  assert.deepEqual(world.sent,['look']);
  assert.equal(world.el('word-peek-meaning').textContent,'뜻 확인 중');
  net.deliver({kind:'word',canonical:'moon',members:[1],ko:'위성'});await settle(320);
  assert.equal(world.el('word-peek-meaning').textContent,'위성');
  ctx.closePanel();ctx.openWord('moon',span);await settle();
  assert.deepEqual(world.sent,['look'],'same occurrence spent another request');
  assert.equal(world.el('word-peek-meaning').textContent,'위성');
}

/* ================= ⑦ 기존 phrase 데이터 read compatibility ================= */
{
  const {world,ctx}=boot();
  const id='phrase:take care of';
  ctx.words[id]={word:'take care of',clicked:'takes care of',forms:['take','care','of'],
    phraseParts:['take','care','of'],ko:'돌보다',ai:{ko:'돌보다',done:true},
    example:'She takes care of it.',book:'시험책',status:1,mark:true,addedAt:1,up:1};
  ctx.words.care={word:'care',clicked:'care',forms:['care'],ko:'돌봄',ai:{ko:'돌봄',done:true},
    phrase:'takes care of',example:'첫 문장',book:'시험책',status:1,mark:true,addedAt:1,up:1}; // 예전 suggestion metadata
  ctx.selectWord(id,null);await settle();
  assert.equal(ctx.words[id].ko,'돌보다','기존 저장 phrase meaning을 읽지 못했습니다');
  ctx.selectWord('care',null);await settle();
  assert.equal(ctx.words.care.ko,'돌봄','예전 suggestion metadata가 일반 word meaning을 훼손했습니다');
  assert.equal(world.bookRebuilds,0,'legacy phrase를 읽는 것만으로 Reader를 다시 조립했습니다');
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
    '60번을 여닫았더니 lookup가 열린 채로 남았습니다');
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
  return { textContent:key, dataset:{example:'A sentence with '+key+' in it.'}, classList:{ add(){}, remove(){} }, closest:()=>null };
}
/* 진짜 손짓이 지나는 문 그대로 — `addWord` 를 건너뛰면 이 규칙 자체가 안 걸립니다. */
const tapBrandNewWord = (ctx, key) => ctx.openWord(key, newWordSpan(key));
/* 창이 열려 있는 채로 답이 오면 `AI_MIN_WAIT`(280ms) 만큼 바람을 더 보여 준 뒤에
   놓습니다 — 미세 작업만 돌려서는 그 자리를 못 지납니다. */
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
  /* 기존 저장 뜻은 새 조회가 실패해도 유지합니다. */
  const { ctx } = boot();
  ctx.words.harbour = savedWord('harbour', '항구');
  ctx.openWord('harbour', newWordSpan('harbour'));
  await settle();
  ctx.closePanel();
  await settle();
  assert.ok(ctx.words.harbour, '이미 저장해 둔 낱말이 다시 열었다 닫는 것만으로 사라졌습니다');
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
  /* 마지막으로 저장한 뜻을 지우면 낱말도 제거하고 tombstone을 남깁니다. */
  const { net, ctx } = boot();
  tapBrandNewWord(ctx, 'tessera');
  await settle();
  net.deliver();
  await rest(AI_MIN_WAIT); await settle();
  ctx.deleteMeaning('tessera');
  await settle();
  ctx.closePanel();
  await settle();
  assert.equal(ctx.words.tessera,undefined,'마지막 뜻을 지운 낱말이 남았습니다');
  assert.ok(ctx.dead.tessera,'삭제한 낱말의 tombstone이 없습니다');
}

{
  /* 실제 Words 목록에는 둘 다 보이지만 popup presentation은 legacy phrase metadata가
     붙은 child를 숨깁니다. UI용 목록이 삭제 판단에 쓰이면 root 하나를 지운 것이
     whole-word 삭제로 커지는 실사용 회귀입니다. */
  const { ctx } = boot();
  ctx.words.run = savedWord('run', '달리다');
  ctx.words['run::legacy-phrase'] = {
    ...savedWord('run', '운영하다'), root:'run', sense:true, phrase:'run a company',
    phraseParts:['run','company'], phraseGaps:[1]
  };
  ctx.deleteMeaning('run');
  assert.ok(ctx.words.run,'legacy phrase metadata child가 있는데 root 뜻 삭제가 단어 전체 삭제로 확대됐습니다');
  assert.equal(ctx.words.run.ko,'운영하다','남은 뜻이 root identity로 승격되지 않았습니다');
  assert.equal(ctx.dead.run,undefined,'살아 있는 root identity에 tombstone이 생겼습니다');
  assert.ok(ctx.dead['run::legacy-phrase'],'승격되어 사라진 child identity의 tombstone이 없습니다');
  assert.deepEqual(Array.from(ctx.words.run.forms),['run'],'root forms가 legacy child metadata로 바뀌었습니다');
  assert.equal(ctx.words.run.phraseParts,undefined,'legacy child phrase identity가 word root로 승격됐습니다');
}

{
  /* presentation dedupe는 같은 뜻을 한 줄로 보이게 할 뿐, 실제 저장 레코드의
     존재를 없애지 않습니다. */
  const { ctx } = boot();
  ctx.words.echo = savedWord('echo', '메아리');
  ctx.words['echo::duplicate'] = {...savedWord('echo', '메아리'),root:'echo',sense:true};
  ctx.deleteMeaning('echo');
  assert.ok(ctx.words.echo,'duplicate meaning child가 있는데 root 삭제가 whole-word 삭제로 확대됐습니다');
  assert.equal(ctx.words.echo.ko,'메아리');
  assert.equal(ctx.dead.echo,undefined,'duplicate survivor root가 tombstone됐습니다');
}

{
  /* A/B/C 어느 카드를 지워도 실제 survivor가 있으면 root identity와 학습 상태가
     유지됩니다. active/non-active 분기는 선택 상태만 바꾸고 파괴 범위를 넓히지 않습니다. */
  const { ctx } = boot();
  ctx.words.run={...savedWord('run','A'),clicked:'ran',forms:['run','ran'],status:3,mark:false,addedAt:17,up:20};
  ctx.words['run::B']={...savedWord('run','B'),root:'run',sense:true,pickedAt:30,up:30};
  ctx.words['run::C']={...savedWord('run','C'),root:'run',sense:true,pickedAt:25,up:25};
  ctx.selectWord('run::B',null);
  ctx.deleteMeaning('run::C');                         // non-active middle/child
  assert.deepEqual(Object.values(ctx.words).map(item=>item.ko).sort(),['A','B']);
  ctx.deleteMeaning('run::B');                         // active child
  assert.equal(ctx.words.run.ko,'A');
  ctx.words['run::D']={...savedWord('run','D'),root:'run',sense:true,pickedAt:40,up:40};
  ctx.deleteMeaning('run');                            // active root promotion
  assert.equal(ctx.words.run.ko,'D');
  assert.equal(ctx.words.run.clicked,'ran');
  assert.deepEqual(Array.from(ctx.words.run.forms),['run','ran']);
  assert.equal(ctx.words.run.status,3);
  assert.equal(ctx.words.run.mark,false);
  assert.equal(ctx.words.run.addedAt,17);
  assert.equal(ctx.dead.run,undefined);
  assert.ok(ctx.dead['run::B']&&ctx.dead['run::C']&&ctx.dead['run::D']);
}

{
  /* 삭제 뒤 old remote snapshot을 합쳐도 child는 tombstone으로 막히고, 승격된 root는
     오래된 root 사본이나 unrelated child tombstone에 같이 사라지지 않습니다. */
  const { ctx } = boot();
  ctx.words.run={...savedWord('run','달리다'),up:100};
  ctx.words['run::operate']={...savedWord('run','운영하다'),root:'run',sense:true,up:110};
  ctx.deleteMeaning('run');
  const promotedUp=ctx.words.run.up;
  const childDead=ctx.dead['run::operate'];
  ctx.mergeWordState({
    run:{...savedWord('run','달리다'),up:100},
    'run::operate':{...savedWord('run','운영하다'),root:'run',sense:true,up:110}
  },{});
  assert.equal(ctx.words.run.ko,'운영하다','old remote root가 승격된 survivor를 되돌렸습니다');
  assert.equal(ctx.words['run::operate'],undefined,'삭제된 child가 old remote copy로 부활했습니다');
  assert.equal(ctx.dead['run::operate'],childDead);
  assert.equal(ctx.dead.run,undefined,'child tombstone이 survivor root까지 지웠습니다');
  assert.ok(ctx.words.run.up===promotedUp&&ctx.words.run.up>100);
  ctx.cleanOrphanWords(ctx.words,ctx.dead);
  assert.equal(ctx.words.run.ko,'운영하다','cleanOrphanWords가 승격된 root invariant를 깨뜨렸습니다');
}

{
  /* 수백 회의 delete/add/promote/merge/cleanup 순환에서도 root는 하나이고 삭제된
     child는 되살아나지 않아야 합니다. */
  for(let cycle=0;cycle<500;cycle++){
    const { ctx } = boot();
    const rootKey=`stress-${cycle}`;
    ctx.words[rootKey]={...savedWord(rootKey,'A'),up:10,status:2,mark:cycle%2===0};
    for(const [at,ko] of ['B','C','D','E'].entries())
      ctx.words[`${rootKey}::${ko}`]={...savedWord(rootKey,ko),root:rootKey,sense:true,up:20+at,pickedAt:20+at};
    ctx.deleteMeaning(rootKey);                        // B/C/D/E, promote E
    ctx.deleteMeaning(`${rootKey}::C`);               // E/B/D
    const added=ctx.createMeaning(rootKey,'F',{example:'new'});
    ctx.selectWord(added,null);
    ctx.deleteMeaning(rootKey);                        // promote active F
    const snapshot=structuredClone(ctx.words);
    const deadSnapshot=structuredClone(ctx.dead);
    ctx.mergeWordState({...snapshot,
      [`${rootKey}::C`]:{...savedWord(rootKey,'C'),root:rootKey,sense:true,up:21}},{});
    ctx.cleanOrphanWords(ctx.words,ctx.dead);
    const records=ctx.savedMeaningRecords(rootKey);
    assert.equal(records.length,3,`cycle ${cycle}: meaning count drift`);
    assert.ok(ctx.words[rootKey],`cycle ${cycle}: root identity missing`);
    assert.equal(ctx.words[`${rootKey}::C`],undefined,`cycle ${cycle}: deleted sense resurrected`);
    assert.equal(ctx.dead[rootKey],undefined,`cycle ${cycle}: unexpected whole-word tombstone`);
    assert.ok(ctx.dead[`${rootKey}::C`]>=deadSnapshot[`${rootKey}::C`],`cycle ${cycle}: child tombstone lost`);
    assert.equal(records.filter(([id])=>id===rootKey).length,1,`cycle ${cycle}: root multiplicity`);
  }
}

{
  /* 영어 metadata 응답은 한국어 뜻이나 후보를 만들지 않습니다. */
  const { net, ctx } = boot();
  const bare = ctx.fetch;
  ctx.fetch = (url, opt) => String(url).includes('api.dictionaryapi.dev')
    ? Promise.resolve({ok:true,json:()=>Promise.resolve([{phonetic:'/jiːld/',phonetics:[],meanings:[{partOfSpeech:'verb',definitions:[{definition:'give way'}]}]}])})
    : bare(url, opt);
  tapBrandNewWord(ctx, 'yield');
  net.deliver({ error:'quota_exceeded' });
  await settle(40);
  assert.equal(ctx.words.yield.ko,'','영어 metadata가 한국어 뜻자리를 채웠습니다');
  assert.equal(ctx.words.yield.phon,'/jiːld/','실제로 쓰는 IPA metadata가 사라졌습니다');
  assert.equal(ctx.words.yield.defs[0].def,'give way','실제로 쓰는 영어 정의 metadata가 사라졌습니다');
  ctx.closePanel();
  await settle();
  assert.equal(ctx.words.yield, undefined,
    '한국어 뜻을 못 받은 새 낱말이 metadata만으로 저장됐습니다');
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
{
  /* 선택 표시는 opening 이 만든 node 하나입니다. 새 선택과 close 가 그 reference 만
     치우고 document/EPUB 전체에서 다시 찾지 않는 계약을 지킵니다. */
  const { world, ctx } = boot();
  ctx.words.anchor = savedWord('anchor','닻');
  const first=makeElement('first-selection',world);
  ctx.selectWord('anchor',first);
  assert.equal(first.classList.contains('sel'),true,'선택 node 가 opening 에 붙지 않았습니다');
  const queriesAfterOpen=world.queries;
  ctx.closePanel();
  assert.equal(first.classList.contains('sel'),false,'close 가 소유한 선택 node 를 놓지 않았습니다');
  assert.equal(world.queries,queriesAfterOpen,'normal close 가 전체 document 에서 선택을 다시 찾았습니다');

  const marker=makeElement('original-marker',world);
  marker.classList.add('original-selection-marker');
  ctx.selectWord('anchor',marker);
  ctx.closePanel();
  assert.equal(marker.removed,true,'original selection marker 를 reference 로 제거하지 않았습니다');
}
{
  /* 원본 session 을 보존해도 Text interaction 에는 참여하지 않습니다. */
  const { ctx }=boot();
  let frameQueries=0;
  ctx.originalSession={frames:[{contentDocument:{querySelectorAll(){ frameQueries++; return []; }}}]};
  ctx.currentReaderMode='text';
  ctx.readerWordNodes('.w');
  assert.equal(frameQueries,0,'Text mode 가 hidden EPUB frame 을 query 했습니다');
  ctx.currentReaderMode='original';
  ctx.readerWordNodes('.w');
  assert.equal(frameQueries,1,'Original mode 의 active EPUB frame 까지 제외했습니다');
}

/* ================= DeepSeek mini lookup → expression identity ================= */
{
  const {world,net,ctx}=boot();
  const sentence='He took the criticism into account.';
  const span={textContent:'took',dataset:{example:sentence,clickedTokenIndex:'1'},
    classList:{add(){},remove(){}},closest:()=>null};
  ctx.openWord('take',span);await settle(20);
  assert.deepEqual(world.sent,['look'],'새 lexical item이 DeepSeek mini lookup으로 바로 가지 않았습니다');
  assert.equal(world.payloads[0].sentence,sentence,'DeepSeek mini lookup에 문장 전체가 가지 않았습니다');
  assert.equal(world.payloads[0].clickedIndex,1,'클릭 token index가 drift했습니다');
  assert.deepEqual(Array.from(world.payloads[0].tokens,item=>item.text),['He','took','the','criticism','into','account'],
    '문장 token mapping이 달라졌습니다');
  net.deliver({kind:'expression',canonical:'take into account',members:[1,4,5],ko:'고려하다',
    lemma:'take into account',pos:'',gloss:'',alts:[]});
  await rest(AI_MIN_WAIT);await settle(20);
  assert.deepEqual(world.sent,['look'],'expression 하나를 저장하는 데 추가 AI 호출이 생겼습니다');
  const phrase=ctx.words['phrase:take into account'];
  assert.ok(phrase,'DeepSeek expression이 실제 저장 phrase 카드가 되지 않았습니다');
  assert.deepEqual(Array.from(phrase.phraseParts),['take','into','account'],'expression member 순서를 잃었습니다');
  assert.deepEqual(Array.from(phrase.phraseGaps),[2,0],'비연속 member gap이 저장되지 않았습니다');
  assert.equal(phrase.ko,'고려하다','expression 뜻이 저장되지 않았습니다');
  assert.equal(ctx.words.take,undefined,'expression과 함께 이번 탭이 만든 빈 word 껍데기가 남았습니다');
}
{
  const {world,net,ctx}=boot();
  const sentence='She took a book from the shelf.';
  const span={textContent:'took',dataset:{example:sentence,clickedTokenIndex:'1'},classList:{add(){},remove(){}},closest:()=>null};
  ctx.openWord('take',span);await settle(20);
  assert.deepEqual(world.sent,['look'],'평범한 새 단어가 DeepSeek mini lookup으로 바로 가지 않았습니다');
  net.deliver({kind:'word',canonical:'take',members:[1],ko:'가져가다',lemma:'take',pos:'',gloss:'',alts:[]});
  await rest(AI_MIN_WAIT);await settle(20);
  assert.equal(ctx.words.take.ko,'가져가다','word mini result가 단어 Meaning으로 저장되지 않았습니다');
  assert.equal(ctx.words['phrase:take'],undefined,'word result가 expression 카드로 승격됐습니다');
}
{
  const {world,ctx,net}=boot();
  ctx.words.take=savedWord('take','가져가다');
  const span={textContent:'took',dataset:{example:'He took the criticism into account.',clickedTokenIndex:'1'},classList:{add(){},remove(){}},closest:()=>null};
  ctx.openWord('take',span);await settle(20);
  assert.deepEqual(world.sent,['look'],'new sentence must identify the lexical unit');
  net.deliver({kind:'expression',canonical:'take into account',members:[1,4,5],ko:'고려하다'});
  await rest(AI_MIN_WAIT);await settle();
  assert.equal(ctx.words['phrase:take into account'].ko,'고려하다');
  assert.equal(ctx.words.take.ko,'가져가다','existing independent word was deleted by expression discovery');
}
{
  const {world,net,ctx}=boot();net.outran=true;
  const sentence='They gave the idea up yesterday.';
  const span={textContent:'gave',dataset:{example:sentence,clickedTokenIndex:'1'},classList:{add(){},remove(){}},closest:()=>null};
  ctx.openWord('give',span);await settle(20);
  assert.deepEqual(world.sent,['look'],'새 expression 후보가 DeepSeek mini lookup으로 바로 가지 않았습니다');
  ctx.closePanel();
  net.deliver({kind:'expression',canonical:'give up',members:[1,4],ko:'포기하다',lemma:'give up',pos:'',gloss:'',alts:[]});
  await rest(AI_MIN_WAIT);await settle(20);
  assert.equal(ctx.words['phrase:give up'],undefined,'닫힌 lookup의 늦은 DeepSeek 답이 expression을 저장했습니다');
  assert.equal(world.el('panel').classList.contains('on'),false,'늦은 expression 답이 popup을 다시 열었습니다');
}

console.log('낱말 lookup 한살이 기준선 통과 — 죽은 열림은 화면을 못 만지고, 도착한 답은 남습니다 (60회 여닫기 무결)');
console.log('확정 못 한 새 조회는 없던 일 — AI 답·사람의 채택만 확정, 늦은 답도 되살리지 못합니다');
