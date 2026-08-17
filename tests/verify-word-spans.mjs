/* ================= 낱말 상자의 기준선 =================
 *
 *     node tests/verify-word-spans.mjs           (npm test 가 함께 돌립니다)
 *     node tests/verify-word-spans.mjs --update  (기준선을 다시 찍습니다)
 *
 * 왜 이 파일이 있는가: 글자 모드의 `<span class="w">` 는 이 앱에서 가장 많은
 * 것이 매달린 한 조각입니다. 낱말을 눌러 뜻을 보는 일, 저장한 낱말에 색이
 * 앉는 일, 저장한 표현이 두 낱말을 한 덩어리로 묶는 일, 모드를 바꿨을 때
 * "여기 있었다" 는 노란 표시 — 전부 이 span 이 있어야 돕니다. 여기가 어긋나면
 * 화면은 멀쩡해 보이는데 뜻이 다른 낱말로 열리거나, 저장한 낱말이 조용히
 * 안 칠해집니다. **눈으로는 안 보이는 종류의 고장입니다.**
 *
 * 그래서 빠르게 만들기 전에 기준선을 먼저 박습니다. `wordSpans()` 의 출력을
 * 글자 하나까지 파일로 떠 두고(`word-spans.golden.html`), 다음부터는 그것과
 * 맞춰 봅니다. 한 글자라도 달라지면 여기서 멈춥니다.
 *
 * 고르는 글은 실제 책에서 이 함수를 넘어뜨릴 수 있는 모양만 모았습니다 —
 * 줄임표(don't · 커브 따옴표), 붙임표, 약어(NASA · PDFs), HTML 로 새어 나갈 수
 * 있는 글자(< > & " '), 로마자가 아닌 글자, 숫자에 붙은 낱말, 겹치는 표현,
 * 문단 맨 앞·맨 뒤의 표현, 그리고 `mark:false` 로 꺼 둔 낱말.
 *
 * 기준선을 일부러 바꿀 때만 `--update` 를 쓰고, **바뀐 줄을 눈으로 읽어**
 * 커밋에 왜 바뀌었는지 적어 주세요. 생각 없이 다시 찍으면 이 파일은 아무것도
 * 지키지 않습니다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const goldenPath = resolve(root, 'tests/word-spans.golden.html');
const update = process.argv.includes('--update');

/* ---- 화면 없이 불러오기 -----------------------------------------------------
   `wordSpans` 자체는 글 하나를 받아 글 하나를 내는 순수 함수입니다. 화면이
   필요 없습니다. 다만 같은 파일 아래쪽에 화면에 붙는 코드가 있어서, 불러오는
   동안 넘어지지 않을 만큼의 흉내만 놓아 둡니다. */
const noop = () => {};
const fakeElement = () => new Proxy({}, {
  get(target, key){
    if(key in target) return target[key];
    if(key === 'classList') return {add:noop, remove:noop, toggle:noop, contains:()=>false};
    if(key === 'dataset' || key === 'style') return {};
    if(key === 'querySelectorAll') return () => [];
    if(key === 'querySelector' || key === 'closest') return () => null;
    return noop;
  },
  set(target, key, value){ target[key] = value; return true; },
});
const context = {
  document: { getElementById: fakeElement, querySelectorAll: () => [],
              querySelector: () => null, createElement: fakeElement,
              addEventListener: noop, documentElement: fakeElement(),
              body: fakeElement() },
  window: { addEventListener: noop },       // ResizeObserver 는 일부러 없습니다
  addEventListener: noop,                   // 창에 바로 붙는 online·offline
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  navigator: { language: 'ko' },
  console,
  /* 아래 두 개는 다른 파일에 있는 것을 부르는 자리입니다. 불러오는 동안에만
     쓰이고, 우리가 재는 함수는 건드리지 않습니다. */
  readerScroller: () => null,
  /* 글자판은 자기를 "종이"로 등록하고, iOS 가 만든 선택을 지워 달라고 부탁합니다.
     둘 다 scripts/reader/gesture.js 에 있고, 여기서는 부르기만 하면 됩니다. */
  registerReaderSurface: noop,
  suppressReaderSelection: noop,
  requestAnimationFrame: noop,
  setTimeout, clearTimeout, CSS: { escape: s => s },
  /* 단어장입니다. 원래는 scripts/core/state.js 가 `let words` 로 잡는데, 그
     파일은 저장소를 열어야 해서 여기서는 빈 표 하나로 대신합니다. */
  words: {},
};

/* `const` 로 잡은 것(`keyOf`)은 이 바깥에서 안 보입니다 — 파일 끝에 한 줄
   붙여 꺼냅니다. scripts/sync/vault-crypto.js 를 검사할 때와 같은 방법입니다. */
const EXPORTS = { 'scripts/reader/reader.js': ['wordSpans', 'keyOf', 'phraseParts'] };
for(const file of ['scripts/dictionary/dictionary.js', 'scripts/reader/reader.js']){
  const exported = EXPORTS[file] || [];
  const source = readFileSync(resolve(root, file), 'utf8') +
    exported.map(name => `\n;globalThis.${name} = ${name};`).join('');
  try{
    new Script(source, { filename:file }).runInNewContext(context);
  }catch(error){
    console.error(`${file} 을 화면 없이 불러오지 못했습니다: ${error.message}\n` +
      '  이 테스트가 흉내 내는 화면 조각이 모자란 것입니다 — 위 `context` 에 더해 주세요.');
    process.exit(1);
  }
}
const { wordSpans, keyOf } = context;
assert.equal(typeof wordSpans, 'function', 'scripts/reader/reader.js 에 wordSpans 가 없습니다');
assert.equal(typeof keyOf, 'function', 'scripts/reader/reader.js 에 keyOf 가 없습니다');

/* ---- 기준선을 만드는 글 ----------------------------------------------------- */
/* 저장해 둔 낱말표. 실제 단어장이 낼 수 있는 상태를 다 담습니다 — 별 셋,
   꺼 둔 표시(`mark:false`), 두 낱말 표현, 세 낱말 표현, 그리고 서로 겹쳐서
   "긴 쪽이 이긴다" 규칙을 시험하는 한 쌍. */
const words = {
  field:   {word:'field',   status:1, mark:true},
  charge:  {word:'charge',  status:2, mark:true},
  vector:  {word:'vector',  status:3, mark:true},
  quiet:   {word:'quiet',   status:2, mark:false},   // 꺼 둔 낱말 — 색이 앉으면 안 됩니다
  nasa:    {word:'NASA',    status:1, mark:true},
  'electric field':      {word:'electric field',      status:2, mark:true,
                          phraseParts:['electric','field']},
  'point charge':        {word:'point charge',        status:3, mark:true,
                          phraseParts:['point','charge']},
  'electric field line': {word:'electric field line', status:1, mark:true,
                          phraseParts:['electric','field','line']},
};

const SAMPLES = [
  ['plain',            'The quiet room held a single vector.'],
  ['apostrophe',       "It doesn't matter; the field's edge won't move."],
  ['curly-apostrophe', 'It doesn’t matter; the field’s edge won’t move.'],
  ['hyphen',           'A well-known half-life for the point charge.'],
  ['acronym',          'NASA and the PDFs from NASA, plus one PDF.'],
  ['markup',           'Use <b>&amp;</b> "quotes" & \'apostrophes\' <script>alert(1)</script>'],
  ['non-latin',        '전기장은 electric field 이고, café 는 그대로입니다.'],
  ['digits',           'Chapter 4 covers 3D fields and H2O at 25C.'],
  ['phrase-overlap',   'An electric field line meets an electric field here.'],
  ['phrase-at-edges',  'Electric field opens it and it ends with point charge'],
  ['phrase-broken',    'The electric, field is not one phrase. Nor electric  field.'],
  ['saved-forms',      'Fields, charges and vectors are charged and fielded.'],
  ['muted',            'The quiet quiet QUIET stays uncoloured.'],
  ['punctuation-run',  '— "Vector!" ... (charge?) [field] {quiet}'],
  ['whitespace',       '  leading and trailing spaces around a field  '],
  ['empty',            ''],
  ['no-words',         '123 456 — !!! ...'],
];

/* ---- 찍기 ------------------------------------------------------------------ */
Object.assign(context.words, words);
const rendered = SAMPLES.map(([name, text]) =>
  `### ${name}\n<<<${text}>>>\n${wordSpans(text)}`).join('\n\n');
/* 낱말표가 비어 있을 때도 함께 떠 둡니다. 새 사용자의 화면이 이쪽입니다. */
for(const key of Object.keys(context.words)) delete context.words[key];
const renderedPlain = SAMPLES.map(([name, text]) =>
  `### ${name}\n<<<${text}>>>\n${wordSpans(text)}`).join('\n\n');

const golden = `단어장이 있을 때\n${'='.repeat(60)}\n\n${rendered}\n\n\n` +
               `단어장이 비었을 때\n${'='.repeat(60)}\n\n${renderedPlain}\n`;

if(update || !existsSync(goldenPath)){
  writeFileSync(goldenPath, golden, 'utf8');
  console.log(`낱말 상자 기준선을 ${existsSync(goldenPath) ? '다시 ' : ''}찍었습니다 → tests/word-spans.golden.html`);
}else{
  const expected = readFileSync(goldenPath, 'utf8');
  if(golden !== expected){
    /* 어디가 처음 갈라졌는지 알려 줍니다 — 8MB 짜리 diff 보다 이게 낫습니다. */
    const a = golden.split('\n'), b = expected.split('\n');
    const at = a.findIndex((line, index) => line !== b[index]);
    console.error('낱말 상자가 예전과 다릅니다 — 글자 모드의 span 이 바뀌었습니다.\n' +
      `  tests/word-spans.golden.html 의 ${at + 1}번째 줄부터 갈라집니다.\n` +
      `  기준선: ${JSON.stringify(b[at])}\n  지금:   ${JSON.stringify(a[at])}\n` +
      '  일부러 바꾼 것이라면: node tests/verify-word-spans.mjs --update');
    process.exit(1);
  }
}

/* ---- 기준선이 지켜야 하는 성질 -----------------------------------------------
   위의 파일 비교는 "달라지면 멈춘다" 는 그물입니다. 아래는 "무엇이 참이어야
   하는가" 입니다. 기준선을 일부러 다시 찍더라도 이 성질들은 남습니다. */
const strip = html => html.replace(/<[^>]+>/g, '')
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
  .replace(/&#39;/g,"'").replace(/&amp;/g,'&');

Object.assign(context.words, words);
for(const [name, text] of SAMPLES){
  const html = wordSpans(text);
  /* ① 보이는 글자는 한 글자도 달라지지 않습니다. span 은 감싸는 일만 합니다. */
  assert.equal(strip(html), text, `[${name}] 낱말을 감싸면서 보이는 글자가 바뀌었습니다`);
  /* ② 태그가 열리면 반드시 닫힙니다. 안 닫히면 뒤의 문단까지 삼킵니다. */
  assert.equal((html.match(/<span/g)||[]).length, (html.match(/<\/span>/g)||[]).length,
    `[${name}] span 이 열리고 안 닫혔습니다`);
  /* ③ span 은 겹치지 않습니다 — 겹치면 closest('.w') 가 엉뚱한 낱말을 줍니다. */
  let depth = 0;
  for(const tag of html.match(/<\/?span[^>]*>/g) || []){
    depth += tag.startsWith('</') ? -1 : 1;
    assert.ok(depth === 0 || depth === 1, `[${name}] span 이 겹쳐 있습니다`);
  }
  /* ④ 새어 나가는 글자가 없습니다. `data-w` 는 따옴표 안에 들어갑니다. */
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /[<>]/,
    `[${name}] 꺾쇠가 그대로 남았습니다 — 책 제목 하나로 화면이 깨질 수 있습니다`);
  /* ⑤ 누른 낱말은 반드시 단어장에서 찾을 열쇠를 답니다. */
  for(const span of html.matchAll(/<span class="w[^"]*" data-w="([^"]*)">([^<]*)<\/span>/g)){
    assert.notEqual(span[1], '', `[${name}] 열쇠 없는 낱말 상자가 있습니다 — 눌러도 아무 일이 없습니다`);
  }
}
/* ⑥ 꺼 둔 낱말(`mark:false`)에는 색이 앉지 않습니다. 단어장에는 남아 있지만
      읽는 화면을 어지럽히지 않겠다는 뜻이라, 여기가 새면 그 설정이 무의미해집니다. */
assert.doesNotMatch(wordSpans('The quiet room'), /class="w s\d"[^>]*data-w="quiet"/,
  '표시를 꺼 둔 낱말에 색이 앉았습니다');
/* ⑦ 긴 표현이 짧은 표현을 이깁니다. "electric field line" 안에서 "electric
      field" 만 잡히면, 저장해 둔 긴 표현을 영영 다시 만나지 못합니다. */
assert.match(wordSpans('an electric field line here'),
  /data-w="electric field line">electric field line</,
  '긴 표현보다 짧은 표현이 먼저 잡혔습니다');
/* ⑧ 표현 하나는 span 하나입니다. 둘로 쪼개지면 한 낱말만 색이 앉습니다. */
assert.equal((wordSpans('a point charge here').match(/<span/g)||[]).length, 3,
  '두 낱말 표현이 하나로 묶이지 않았습니다');
/* ⑨ 열쇠는 굴절형을 원형으로 되돌립니다 — 화면의 "fields" 와 단어장의
      "field" 가 같은 것을 가리켜야 색이 앉습니다. */
assert.equal(keyOf('Fields'), 'field', '굴절형이 단어장 열쇠로 되돌아가지 않습니다');
assert.equal(keyOf('charged'), 'charge', 'silent-e 과거형이 가짜 표제어로 갈라졌습니다');
assert.equal(keyOf('NASA'), 'nasa', '약어가 단어장 열쇠로 되돌아가지 않습니다');

const total = SAMPLES.reduce((sum, [, text]) => sum + (wordSpans(text).match(/<span/g)||[]).length, 0);
console.log(`낱말 상자 기준선 통과 — 글 ${SAMPLES.length}개, 상자 ${total}개, 성질 9가지`);
