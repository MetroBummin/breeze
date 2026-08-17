/* ================= 원형 만들기의 기준선 =================
 *
 *     node tests/verify-lemma.mjs        (npm test 가 함께 돌립니다)
 *
 * 왜 이 파일이 있는가: `lemma()` 가 내놓는 글자는 그 낱말의 **주소**가 됩니다.
 * 단어장의 열쇠도, 캐시의 열쇠도, 본문 색칠이 맞춰 보는 글자도 전부 여기서
 * 나옵니다. 그래서 여기가 한 글자 틀리면 사용자에게는 `considere` 같은 없는
 * 낱말이 저장되고, 나중에 `consider` 를 눌러도 그 카드와 영영 안 만납니다.
 * 화면은 멀쩡해 보이는데 단어장만 조용히 갈라지는 고장입니다.
 *
 * 아래 표는 규칙이 아니라 **판정**입니다. 새 규칙을 넣을 때 이 표가 하나라도
 * 빨개지면, 고친 것보다 깨뜨린 것이 많은지 먼저 세어 보세요.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* 화면 없이 불러오기 — verify-word-spans.mjs 와 같은 방법입니다. */
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
  window: { addEventListener: noop },
  addEventListener: noop,                   // 창에 바로 붙는 online·offline
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  navigator: { language: 'ko' },
  console, setTimeout, clearTimeout,
  requestAnimationFrame: noop,
  CSS: { escape: s => s },
  words: {},
};
const file = 'scripts/dictionary/dictionary.js';
const source = readFileSync(resolve(root, file), 'utf8') +
  '\n;globalThis.lemma = lemma;\n;globalThis.lemmaCands = lemmaCands;';
try{
  new Script(source, { filename:file }).runInNewContext(context);
}catch(error){
  console.error(`${file} 을 화면 없이 불러오지 못했습니다: ${error.message}`);
  process.exit(1);
}
const { lemma, lemmaCands } = context;

/* ---- 표 --------------------------------------------------------------------
   [누른 글자, 나와야 하는 원형, 왜 이 줄이 있는지] */
const CASES = [
  /* 힘 없는 꼬리 — 여기가 `considere` 를 만들던 자리입니다. 음절이 둘 이상이고
     끝이 -er/-en/-el/-on/-or 이면 사라진 e 같은 것은 없습니다. */
  ['considering', 'consider',  '-er 어간'],
  ['considered',  'consider',  '-er 어간 (과거)'],
  ['offering',    'offer',     '-er 어간'],
  ['answered',    'answer',    '-er 어간'],
  ['wondering',   'wonder',    '-er 어간'],
  ['remembered',  'remember',  '-er 어간 (3음절)'],
  ['discovered',  'discover',  '-er 어간'],
  ['gathered',    'gather',    '-er 어간'],
  ['entering',    'enter',     '-er 어간'],
  ['delivered',   'deliver',   '-er 어간'],
  ['opening',     'open',      '-en 어간'],
  ['listened',    'listen',    '-en 어간'],
  ['happening',   'happen',    '-en 어간'],
  ['threatened',  'threaten',  '-en 어간'],
  ['traveling',   'travel',    '-el 어간'],
  ['labeled',     'label',     '-el 어간'],
  ['mentioned',   'mention',   '-on 어간'],
  ['abandoned',   'abandon',   '-on 어간'],

  /* 한 음절짜리는 e 가 진짜 필요합니다 — 위 규칙이 이쪽까지 삼키면 안 됩니다. */
  ['hoping',      'hope',      '한 음절 + 사라진 e'],
  ['making',      'make',      '한 음절 + 사라진 e'],
  ['writing',     'write',     '한 음절 + 사라진 e'],
  ['sharing',     'share',     '한 음절 + 사라진 e'],
  ['caring',      'care',      '한 음절 + 사라진 e'],
  ['boring',      'bore',      '한 음절 -or'],
  ['storing',     'store',     '한 음절 -or'],
  ['phoning',     'phone',     '한 음절 -on'],
  ['coming',      'come',      '한 음절 -om'],
  ['noted',       'note',      '한 음절 + 사라진 e'],
  ['invited',     'invite',    '-it 은 갈라지지 않으므로 그대로 둡니다'],
  ['decided',     'decide',    '-id 도 마찬가지'],

  /* 예전부터 지키던 것들 — 이번 변경이 건드리지 않았는지 확인합니다. */
  ['charged',     'charge',    '어말 g 복원'],
  ['arrived',     'arrive',    '어말 v 복원'],
  ['sitting',     'sit',       '겹자음'],
  ['stopped',     'stop',      '겹자음'],
  ['running',     'run',       '겹자음'],
  ['took',        'take',      '불규칙'],
  ['being',       'be',        '불규칙'],
  ['leaves',      'leaf',      '불규칙 복수'],
  ['cities',      'city',      '-ies'],
  ['boxes',       'box',       '-xes'],
  ['dogs',        'dog',       '-s'],
  ['news',        'news',      '떼면 안 되는 -s'],
  ['themselves',  'themselves','떼면 없는 낱말이 되는 것'],
  ['analysis',    'analysis',  '-is'],
];

let bad = 0;
for(const [raw, want, why] of CASES){
  const got = lemma(raw);
  if(got !== want){
    console.error(`  ✗ ${raw} → ${got}   (${want} 이어야 합니다 — ${why})`);
    bad++;
  }
  /* 원형은 후보 목록의 첫 자리이기도 합니다. `keyOf` 가 저장된 카드를 못 찾으면
     이 첫 자리를 그대로 주소로 씁니다. */
  const first = lemmaCands(raw)[0];
  if(first !== want){
    console.error(`  ✗ lemmaCands('${raw}')[0] = ${first}   (${want} 이어야 합니다)`);
    bad++;
  }
}
if(bad){
  console.error(`\n원형 기준선 실패 — ${bad}개`);
  process.exit(1);
}
console.log(`원형 기준선 통과 — ${CASES.length}개`);
