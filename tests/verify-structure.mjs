import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html',
  'styles/base.css',
  'styles/home.css',
  'styles/reader.css',
  'scripts/core/storage.js',
  'scripts/core/book-identity.js',
  'scripts/library/library.js',
  'scripts/library/classics.js',
  'scripts/library/samples.js',
  'scripts/importers/importers.js',
  'scripts/importers/article.js',
  'scripts/dictionary/dictionary.js',
  'scripts/reader/formatting.js',
  'scripts/reader/pdf-word-geometry.js',
  'scripts/reader/original-session.js',
  'scripts/reader/pdf-original.js',
  'scripts/reader/epub-original.js',
  'scripts/reader/reader-modes.js',
  'scripts/reader/mode-bridge.js',
  'scripts/reader/reader.js',
  'scripts/sync/sync.js',
  // 떼어 둔 기출 Shorts. 지우지 않고 언제든 다시 붙일 수 있게 남겨 둡니다.
  'modules/exam-shorts/README.md',
  'modules/exam-shorts/exam.js',
  'modules/exam-shorts/shorts.js',
  'modules/exam-shorts/shorts.css',
  // 떼어 둔 사전 씨앗. 받는 쪽은 앱에 살아 있고 만드는 쪽만 여기 있습니다.
  'modules/dict-seed/README.md',
  'modules/dict-seed/build-dict-seed.js',
  'server/article/index.ts',
];

for(const relative of required){
  if(!existsSync(resolve(root, relative))) throw new Error(`Missing ${relative}`);
}

const index = readFileSync(resolve(root, 'index.html'), 'utf8');
if(/id=["']tocfab["']|id=["']toc-sheet["']|openToc\s*\(/.test(index)){
  throw new Error('Active table-of-contents UI is still present');
}

const activeRoots = ['scripts', 'styles'];
for(const folder of activeRoots){
  const files = [];
  const walk = directory => {
    for(const entry of readdirSync(directory, { withFileTypes:true })){
      const full = resolve(directory, entry.name);
      if(entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(resolve(root, folder));
  for(const file of files){
    const content = readFileSync(file, 'utf8');
    if(/\b(?:openToc|renderTocList|buildToc|toc-sheet|tocfab)\b/.test(content)){
      throw new Error(`Active TOC reference in ${file}`);
    }
  }
}

const jsFiles = [];
const collectJs = directory => {
  for(const entry of readdirSync(directory, { withFileTypes:true })){
    const full = resolve(directory, entry.name);
    if(entry.isDirectory()) collectJs(full);
    else if(entry.name.endsWith('.js')) jsFiles.push(full);
  }
};
collectJs(resolve(root, 'scripts'));
const parkedJs = [];
const parkedSwap = jsFiles.length;
collectJs(resolve(root, 'modules'));
parkedJs.push(...jsFiles.splice(parkedSwap));
for(const file of [...jsFiles, ...parkedJs]){
  const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if(result.status !== 0) throw new Error(result.stderr || `Syntax error in ${file}`);
}

// Browser classic scripts share one global lexical scope. Parse them in the
// exact HTML order as one program to catch cross-file duplicate declarations.
const orderedScripts = [...index.matchAll(/<script defer src="([^"]+\.js)(?:\?[^"]*)?"><\/script>/g)]
  .map(match => match[1])
  .filter(relative => !relative.startsWith('http'));
const combined = orderedScripts
  .filter(relative => relative.startsWith('scripts/'))
  .map(relative => readFileSync(resolve(root, relative), 'utf8'))
  .join('\n');
new Script(combined, { filename:'breeze-active-scripts.js' });

// A book parsed into different paragraph boundaries must keep the same stable
// fingerprint, and a legacy server ID must reconcile through that fingerprint.
const identityContext = {};
new Script(readFileSync(resolve(root, 'scripts/core/book-identity.js'), 'utf8'))
  .runInNewContext(identityContext);
const segmented = identityContext.bookContentFingerprint(['Hello', 'world.', 'Next page']);
const joined = identityContext.bookContentFingerprint(['Hello world.', 'Next page']);
assert.equal(segmented, joined, 'Fingerprint changed with paragraph segmentation');
const localBook = { id:'new-id', title:'Same book', paras:['Hello world.', 'Next page'] };
assert.equal(identityContext.serverRowMatchesBook(
  { book_id:'legacy-id', meta:{ fingerprint:joined } },
  localBook,
), true, 'Legacy server ID did not reconcile through content fingerprint');
assert.equal(identityContext.serverRowIsActive(
  { book_id:'deleted-copy', meta:{ title:'Same book', fingerprint:joined, deleted:true } },
), false, 'Deleted tombstone was treated as an active server book');
const reimportedBook = { id:'same-id', addedAt:100, localSourceAt:500, paras:['Hello world.'] };
assert.equal(identityContext.serverTombstoneShouldDelete(
  { book_id:'same-id', meta:{ deleted:true, deletedAt:400 } },
  reimportedBook,
), false, 'A stale tombstone deletes a later local re-import');
assert.equal(identityContext.serverTombstoneShouldDelete(
  { book_id:'same-id', meta:{ deleted:true, deletedAt:600 } },
  reimportedBook,
), true, 'A genuinely newer remote deletion no longer propagates');
reimportedBook.detachedServerId='same-id';
assert.equal(identityContext.serverTombstoneShouldDelete(
  { book_id:'same-id', meta:{ deleted:true, deletedAt:700 } },
  reimportedBook,
), false, 'A deliberate server-only deletion erased its local copy');

const syncSource = readFileSync(resolve(root, 'scripts/sync/sync.js'), 'utf8');
assert.match(
  syncSource,
  /const twin = activeServerBooks\(\)\.find/,
  'Duplicate-title warning still inspects hidden deleted tombstones',
);
assert.doesNotMatch(syncSource, /aiFormatting|uploadBookFormatting|functions\/v1\/format/,
  'Removed AI typography is still part of book sync');
assert.doesNotMatch(syncSource, /originalGet\(|\.blob\b/,
  'Raw original files leaked into server sync');
assert.match(syncSource,/flushPendingBookDeletes/,
  'Failed server book deletions are not retried');
assert.match(syncSource,/if\(curBook && curBook\.id===lc\.id\)/,
  'A remote tombstone can still erase the book currently being read');
assert.ok(
  syncSource.indexOf("sb.from('books').upsert") < syncSource.indexOf("sb.storage.from('books').remove"),
  'Book payload is removed before its tombstone becomes authoritative',
);
assert.match(syncSource,/syncAgain=true/,
  'A sync request arriving during another sync is still dropped');
/* 로그아웃은 이 기기에서만. Supabase 의 기본값은 'global' 이라, 빼먹으면 노트북에서
   로그아웃한 사람이 폰까지 로그아웃시킵니다. */
assert.match(syncSource, /signOut\(\{\s*scope:\s*'local'\s*\}\)/,
  'Logging out again revokes the session on every device');
/* 계정을 지울 길이 없으면 애플 심사 5.1.1(v) 에서 그대로 반려됩니다. */
assert.match(syncSource, /op:'delete_account'/,
  'The in-app account deletion path is gone');
assert.match(readFileSync(resolve(root, 'server/dict/index.ts'), 'utf8'),
  /auth\.admin\.deleteUser/, 'The server no longer deletes the auth user');
/* 저절로 오가야 하는 것은 양쪽입니다. 올리는 쪽이 빠지면, 로그인 전에 담아 둔
   글과 실패한 글이 영영 서버에 올라가지 않은 채 올라간 것처럼 보입니다. */
assert.match(syncSource, /async function autoUploadCasuals/,
  'Casuals are only auto-downloaded, never auto-uploaded');
/* 자동 올리기는 `refreshBooks()` 안에서 돕니다. 거기서 다시 `refreshBooks()` 를
   부르면 서로를 기다리며 멈춥니다. */
assert.match(syncSource, /if\(auto\) renderAllBookViews\(\);\s*\n\s*else await refreshBooks\(\);/,
  'An automatic upload refreshes the book list again and deadlocks');
/* 사진 주소만 보내면 받는 기기가 그 매체 서버에서 다시 받아야 하고, 자주 실패합니다. */
assert.match(syncSource, /photos: await collectBookPhotos\(/,
  'Casual photos no longer travel with the article');
assert.match(syncSource, /await storeBookPhotos\(body\.photos\)/,
  'A downloaded casual never unpacks the photos it was sent');

const storageSource = readFileSync(resolve(root, 'scripts/core/storage.js'), 'utf8');
assert.match(storageSource, /openDb\('breeze-img',\s*3,/,
  'IndexedDB was not upgraded for local originals');
assert.match(storageSource, /createObjectStore\('originals'\)/,
  'Dedicated local original store is missing');
// One connection per database, not one per read. Pouring the dictionary seed
// opens a thousand of these in a row; opening a thousand connections took longer
// than the work itself.
assert.match(storageSource, /if\(job\) return job;/,
  'IndexedDB connections are no longer reused');
assert.match(storageSource, /async function dictPutAll/,
  'Bulk dictionary writes are missing — the seed would need one transaction each');
assert.match(storageSource,/originalGetForBook/,
  'Original files cannot recover across a legacy book-ID change');

// Adjacent large blocks stay separate in the safe local layout. A running
// header, PART label, and chapter title must never become one giant heading.
const layoutContext = {
  IMG_MARK:'[[IMG]]:',
  Map,
  Set,
  endsSentence:text=>/[.!?]$/.test(String(text||'').trim()),
  looksHeading:()=>false,
};
new Script(readFileSync(resolve(root, 'scripts/reader/formatting.js'), 'utf8'))
  .runInNewContext(layoutContext);
const layoutParas = [
  'NICK CHATER COVENTRY, 2017', 'PART ONE', 'THE ILLUSION OF MENTAL DEPTH',
  ...Array(12).fill('Ordinary body paragraph.'),
];
const layoutSignals = layoutParas.map((_,index)=>index<3 ? {z:1.5,b:true,c:true} : null);
const safeLayout = layoutContext.buildFormattingFromLayout(layoutParas,layoutSignals,null);
assert.equal(
  JSON.stringify(safeLayout.blocks.slice(0,3).map(block=>block.t)),
  JSON.stringify(layoutParas.slice(0,3)),
  'Adjacent headings were merged into a giant heading',
);

/* Junk filtering drops whole pages (blank leaves, watermark-only pages). The
   coordinate map has to keep the real PDF page number, or 원본 모드 opens
   several pages away from where the reader was — and the gap grows. */
const importerContext = {
  IMG_MARK:'[[IMG]]:', Math, JSON, RegExp, Object, Number, String, Array, Set, Uint32Array,
};
new Script(readFileSync(resolve(root, 'scripts/importers/importers.js'), 'utf8'))
  .runInNewContext(importerContext);
const line = (text, y, right) => ({ y, h:10, text, display:text, drop:false, bold:false,
                                    italic:false, left:50, right:right||400 });
const importedPages = [
  // A short closing line makes the page break a real paragraph break.
  { n:1, h:800, lines:[line('The first paragraph ends here.', 700, 200)] },
  { n:2, h:800, lines:[line('7', 40)] },                       // page number only -> dropped
  { n:3, h:800, lines:[line('A later paragraph on page three.', 700)] },
];
/* Pasted text is the entry point that needs no file and no DRM. Its three
   rules have to stay predictable: first line titles, blank lines separate
   paragraphs, and no blank line at all means one card per line. */
const article = importerContext.parsePastedText(
  'How to Read Anything\n\nReading is a habit, not\na talent.\n\nStart small. Finish something.');
assert.equal(article.title, 'How to Read Anything', 'Pasted first line did not become the title');
assert.equal(article.thread, false, 'A blank-line article was mistaken for a thread');
assert.deepEqual(Array.from(article.paras), [
  'How to Read Anything',
  'Reading is a habit, not a talent.',       // a hard-wrapped line is rejoined
  'Start small. Finish something.',
], 'Pasted paragraphs were not rebuilt from the blank lines');
assert.equal(article.formatting.blocks[0].r, 'h1', 'Pasted title was not promoted');
assert.equal(article.formatting.blocks[1].r, 'p', 'Pasted body stopped being body text');

const thread = importerContext.parsePastedText(
  'What I learned shipping\n1. Ship the boring version.\n2. Then make it fast.\n3. Then make it pretty.');
assert.equal(thread.thread, true, 'A line-per-post thread was not detected');
assert.equal(thread.paras.length, 4, 'Thread lines were merged into paragraphs');
assert.deepEqual(Array.from(thread.formatting.blocks, block => block.r),
  ['h1', 'note', 'note', 'note'], 'Thread lines did not become cards');
assert.equal(new Set(thread.formatting.blocks.slice(1).map(b => b.g)).size, 3,
  'Thread cards were grouped into one box instead of one card per line');

// A single pasted line is body text, not a heading with nothing under it.
const lone = importerContext.parsePastedText('  Just one sentence I want to read.  ');
assert.equal(lone.formatting.blocks[0].r, 'p', 'A lone pasted line became an empty-section heading');
assert.equal(importerContext.parsePastedText('   \n  \n '), null, 'Blank paste was accepted');

/* Two-column pages: grouping fragments by y alone glues the left column and
   the right column into one sentence. The gutter is found by geometry, never
   from a per-publisher template. */
const item = (str, x, y, w) => ({ str, width:w, height:10, transform:[10,0,0,10,x,y], fontName:'f' });
const twoColumn = [];
for(let row = 0; row < 30; row++){
  twoColumn.push(item('left column text', 60, 700 - row*14, 200));
  twoColumn.push(item('right column text', 320, 700 - row*14, 200));
}
const columns = importerContext.pdfPageColumns(twoColumn, 600);
assert.equal(columns.length, 2, 'A two-column page was not split at its gutter');
assert.ok(columns[0].every(i => i.transform[4] < 300) && columns[1].every(i => i.transform[4] >= 300),
  'The column split put fragments on the wrong side of the gutter');

/* 빈칸 문제의 밑줄은 그림이라 글자로 안 뽑히고 자리만 비어 옵니다. 낱말
   사이는 0.6em, 그 자리는 7.8em이었습니다 — 열두 배라 헷갈리지 않습니다. */
const blankLine = importerContext.itemsToLines([
  item('describe', 100, 700, 45), item('the', 150, 700, 18), item('.', 250, 700, 4),
])[0];
assert.equal(blankLine.text, 'describe the .', 'The plain line text changed');
assert.equal(blankLine.blank, 'describe the ______ .', 'A blank-fill gap was not made visible');

const ordinaryLine = importerContext.itemsToLines([
  item('one', 100, 700, 18), item('two', 124, 700, 18), item('three', 148, 700, 26),
])[0];
assert.equal(ordinaryLine.blank, '', 'Ordinary word spacing was mistaken for a blank');
const oneColumn = [];
for(let row = 0; row < 30; row++) oneColumn.push(item('one column of ordinary prose', 60, 700 - row*14, 460));
assert.equal(importerContext.pdfPageColumns(oneColumn, 600).length, 1,
  'A single-column page was split into columns that do not exist');

const importedParas = importerContext.assembleParagraphs(importedPages);
assert.deepEqual(Array.from(importedParas.sig, signal => signal.p), [1, 3],
  'A dropped page renumbered every later page in the original-mode coordinate map');

/* ---- 수능·모의고사 문항 분리 (AI 없음) ----
   기출 10종 240문항으로 검증한 규칙입니다. 측정값은 ROADMAP.md. */
const examContext = { Math, JSON, RegExp, Object, Number, String, Array, Set };
new Script(readFileSync(resolve(root, 'modules/exam-shorts/exam.js'), 'utf8'))
  .runInNewContext(examContext);

const longPassage = 'This passage is long enough to be treated as a real reading passage by the parser.';
const examLine = (text, outdent = 0) => ({ text, outdent, rel: 0.5 });
const sliced = examContext.sliceExamQuestions([
  examLine('18. 다음 글의 목적으로 가장 적절한 것은?', 4),
  examLine(longPassage),
  examLine('① first ② second ③ third ④ fourth ⑤ fifth'),
  // 수능은 전각 물결표(U+FF5E)를 씁니다. 이걸 빠뜨리면 묶음 문항이 통째로 빕니다.
  examLine('[31～34] 다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.', 4),
  examLine('31. ' + longPassage, 4),
  examLine('① alpha ② beta ③ gamma ④ delta ⑤ epsilon'),
]);
assert.deepEqual(Array.from(sliced, q => q.n), [18, 31], 'Exam questions were not separated');
assert.equal(sliced[0].prompt, '다음 글의 목적으로 가장 적절한 것은?', 'A question lost its own prompt');
assert.equal(sliced[1].prompt, '다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.',
  'A fullwidth-tilde question range did not hand its instruction to the group');
assert.equal(sliced[1].passage, longPassage, 'The group instruction leaked into the passage');
assert.deepEqual(Array.from(sliced[1].choices), ['alpha','beta','gamma','delta','epsilon'],
  'Choices were not split on the circled numbers');

// Numbers inside the passage are not question starts; only outdented lines are.
assert.deepEqual(
  Array.from(examContext.sliceExamQuestions([
    examLine('29. 다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?', 4),
    examLine('42. was the year everything changed, and ' + longPassage),
  ]), q => q.n),
  [29], 'A number inside the passage was mistaken for a question start');

/* 어법·흐름 문제는 ①~⑤가 지문 안에 박혀 있습니다. 줄 시작이 아니므로
   지문이 잘리면 안 됩니다. */
const inlineQuestion = examContext.sliceExamQuestions([
  examLine('29. 다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?', 4),
  examLine('Places like Little Italy ① exist and people ② do share values,'),
  examLine('rooted ③ in how our species ④ developed and ⑤ relate to others.'),
])[0];
assert.equal(inlineQuestion.choices.length, 0, 'Inline ①-⑤ were mistaken for a choice list');
assert.equal(inlineQuestion.inline, true, 'An inline-choice question was not recognised');
assert.match(inlineQuestion.passage, /Little Italy/, 'An inline-choice passage was truncated');

assert.equal(examContext.parseExam([{ n:1, lines:[examLine('Just a novel page. ' + longPassage)] }]), null,
  'Ordinary prose was accepted as an exam paper');
assert.equal(examContext.examWithoutBlanks('noisy ______'), 'noisy',
  'Choice-grid spacing kept a blank marker that is not a blank');
assert.equal(examContext.examSeconds(31), 100, 'Blank-fill questions lost their longer time limit');
assert.ok(!examContext.examQuestionInScope(3) && !examContext.examQuestionInScope(26)
  && examContext.examQuestionInScope(18) && examContext.examQuestionInScope(45),
  'Listening 1-17 and chart/notice 25-28 are no longer excluded');

const shortsSource = readFileSync(resolve(root, 'modules/exam-shorts/shorts.js'), 'utf8');
assert.match(shortsSource, /card\.classList\.contains\('revealed'\)/,
  'A word can be looked up while the timer is still running');
const shortsCss = readFileSync(resolve(root, 'modules/exam-shorts/shorts.css'), 'utf8');
assert.match(shortsCss, /\.short:not\(\.revealed\) \.short-passage \.w\{pointer-events:none/,
  'Word taps are not locked during the timer');
/* 떼어 둔 모듈이 다시 실행 경로로 새어 들어오지 않았는지. 되살리는 순서는
   modules/exam-shorts/README.md 에 있습니다. */
assert.doesNotMatch(index, /modules\/exam-shorts/, 'The parked exam module is loaded by index.html again');
assert.doesNotMatch(index, /id="v-shorts"|id="shorts-timer"|nav-shorts/,
  'Shorts UI is still in the page while the module is parked');
for(const file of jsFiles){
  assert.doesNotMatch(readFileSync(file, 'utf8'), /\b(?:parseExam|importExam|openShorts|shortsActive)\s*\(/,
    `Active code still calls into the parked exam module: ${file}`);
}
assert.match(readFileSync(resolve(root, 'modules/exam-shorts/README.md'), 'utf8'),
  /prepared\.exam/, 'The parked module lost its reconnection instructions');

/* ---- 떼어 둔 사전 씨앗 ----
   만드는 쪽만 떼어 뒀습니다. 받는 쪽(`loadDictSeed`)은 앱에 살아 있어야 파일
   한 장을 떨어뜨리는 것만으로 되살아납니다. */
assert.doesNotMatch(index, /modules\/dict-seed/,
  'The parked seed builder is loaded by index.html again');
assert.match(readFileSync(resolve(root, 'scripts/dictionary/dictionary.js'), 'utf8'),
  /async function loadDictSeed/,
  'The seed reader went away with the builder, so reviving it is no longer one file');
assert.match(readFileSync(resolve(root, 'modules/dict-seed/README.md'), 'utf8'),
  /x-seed-token/,
  'The parked seed module lost the CORS trap that made it fail in the first place');

const sourceMap = layoutContext.buildSourceMap([
  {p:47,y:.36,z:1},
  {src:'Text/chapter-2.xhtml',si:3,ei:18,r:'h2'},
]);
assert.equal(JSON.stringify(sourceMap),JSON.stringify([
  {page:47,y:.36},
  {href:'Text/chapter-2.xhtml',spine:3,element:18},
]),'Original-source bridge was not preserved');

const conservative = layoutContext.buildFormattingFromLayout(
  ['This is a long ordinary paragraph that ends with a complete sentence and must stay body text.'],
  [{z:1.5,b:false,c:false,in:.1,it:false,p:1,y:.2}],
  null,
);
assert.equal(conservative,null,'Weak PDF styling was promoted into visible typography');

const sessionSource = readFileSync(resolve(root, 'scripts/reader/original-session.js'), 'utf8');
const pdfSource = readFileSync(resolve(root, 'scripts/reader/pdf-original.js'), 'utf8');
const epubSource = readFileSync(resolve(root, 'scripts/reader/epub-original.js'), 'utf8');
const modesSource = readFileSync(resolve(root, 'scripts/reader/reader-modes.js'), 'utf8');
assert.match(pdfSource,/IntersectionObserver/,'PDF pages are not rendered lazily');
/* ---- 확대는 손가락이 합니다 ----
   단추도 쪽마다 주던 가로 스크롤 칸도 없앴습니다. 쪽은 늘 글 폭에 꽉 차고,
   문서 전체가 종이 한 장처럼 같은 축에서 움직입니다. */
assert.doesNotMatch(pdfSource,/pdf-page-lane|pdfZoom|panRatio/,
  'The per-page zoom lane is back, so pages no longer share one horizontal axis');
assert.doesNotMatch(readFileSync(resolve(root, 'index.html'), 'utf8'),/pdfzoom-(in|out)/,
  'The +/- zoom buttons are back; pinching is the gesture now');
/* 벌려서 본 캔버스는 늘어난 그림이라, 넉넉하게 그려 두어야 흐리지 않습니다. */
assert.match(pdfSource,/PDF_OVERSAMPLE/,
  'PDF canvases are drawn at screen resolution again, so pinching makes them blurry');
/* ---- 확대는 종이 안쪽 일입니다 ----
   예전에는 브라우저가 화면 전체를 키우고, 떠 있는 것들만 `visualViewport` 배율의
   역수로 되돌렸습니다(`--vv-k`). 그 보정은 원리적으로 늦어서 — 벌어지는 그림은
   컴포지터가 혼자 그립니다 — 벌리는 내내 단추가 딸려 다녔습니다.
   지금은 `#original-zoom` 만 `transform` 으로 커집니다. 되돌릴 것이 없어야 맞고,
   되돌리는 코드가 다시 생기면 그 싸움이 돌아온 것입니다. */
const scrollSource = readFileSync(resolve(root, 'scripts/reader/reader-scroll.js'), 'utf8');
const interactionsSource = readFileSync(resolve(root, 'scripts/ui/interactions.js'), 'utf8');
const withoutBlockComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
for(const [file, source] of [['scripts/ui/interactions.js', interactionsSource],
                             ['styles/dictionary.css', readFileSync(resolve(root, 'styles/dictionary.css'), 'utf8')],
                             ['styles/components.css', readFileSync(resolve(root, 'styles/components.css'), 'utf8')],
                             ['styles/reader.css', readFileSync(resolve(root, 'styles/reader.css'), 'utf8')]]){
  assert.doesNotMatch(withoutBlockComments(source), /vv-zoom|--vv-k/,
    `${file} counters the browser pinch again; zoom belongs inside #original-zoom`);
}
assert.match(scrollSource,/function setOriginalZoom/,
  'The reader no longer owns its zoom, so the browser scales the chrome with the paper');
assert.match(scrollSource,/transform-origin|scale\(/,
  'Zoom is not a transform on the paper any more');
/* 문서 폭이 화면보다 넓어지면 폰 브라우저는 스크롤바를 주는 대신 화면을 통째로
   축소합니다 — 키운 만큼 되돌아와 글자가 하나도 안 커집니다. 넓어지는 것은 읽는
   칸 안쪽뿐이어야 합니다. */
assert.match(readFileSync(resolve(root, 'styles/reader.css'), 'utf8'),
  /html\.reading, body\.reading\{[^}]*overflow:hidden/,
  'The document scrolls again, so a widened page shrinks the whole screen on mobile');
assert.match(readFileSync(resolve(root, 'index.html'), 'utf8'),/id="reader-scroll"/,
  'The reader has no scrolling box of its own');
/* 글자 화면은 벌리지 않습니다 — 글자 크기는 Aa 안에 있습니다. */
assert.match(modesSource,/mode==='text'\) resetOriginalZoom\(\)/,
  'Coming back to the 글자 view keeps the paper zoom, which nothing there can undo');
assert.match(epubSource,/sandbox','allow-same-origin'/,
  'EPUB chapters are not sandboxed');
assert.match(epubSource,/script,iframe,frame,object,embed/,
  'EPUB active content sanitizer is missing');
assert.match(modesSource,/readerModeChangeToken/,
  'Reader-mode race protection is missing');
assert.match(sessionSource,/sourceProgressForBook/,
  'Logical original progress calculation is missing');
assert.match(epubSource,/openOriginalSelection/,
  'Deliberate original-text selection is missing');
assert.match(pdfSource,/buildPdfWordBoxes/,
  'PDF clicks still depend on browser selection rectangles');
assert.match(pdfSource,/pdfWordAtPoint/,
  'PDF word-coordinate hit testing is missing');
assert.match(pdfSource,/box\.x\*100/,
  'PDF word highlights are not stored in resize-safe page coordinates');
assert.doesNotMatch(pdfSource,/range\.deleteContents\(\)/,
  'Original PDF text layer is still being mutated');
assert.match(pdfSource,/renderPdfSavedWordMarkers/,
  'Saved vocabulary is not painted in original PDF mode');
assert.match(epubSource,/CSS\.highlights/,
  'Saved vocabulary is not painted in original EPUB mode');
/* 저장 단어 표시는 블록 하나로 통일했습니다. 밑줄·끄기를 고르던 설정은
   설정을 위한 설정이었습니다. */
assert.doesNotMatch(epubSource,/dataset\.originalMarks/,
  'The deleted saved-word display preference is back in the EPUB reader');
assert.match(sessionSource,/firstElementBelow/,
  'Visible page lookup walks every page on each scroll frame again');
assert.match(sessionSource,/originalAnchorFromProgress/,
  'A book without a coordinate map jumps back to page one');
assert.match(pdfSource,/readerScrollBy\(after\.height-before\.height\)/,
  'A late page-size correction can still push the visible line');
/* 스크롤 주인이 문서에서 읽는 칸으로 옮겨졌습니다. `window.scrollY` 는 이제
   0 에 붙어 있으므로, 한 군데라도 남으면 그 자리가 조용히 맨 위로 튑니다. */
for(const [file, source] of [['scripts/core/state.js', readFileSync(resolve(root, 'scripts/core/state.js'), 'utf8')],
                             ['scripts/reader/reader.js', readFileSync(resolve(root, 'scripts/reader/reader.js'), 'utf8')],
                             ['scripts/reader/reader-modes.js', modesSource],
                             ['scripts/reader/original-session.js', sessionSource],
                             ['scripts/reader/pdf-original.js', pdfSource],
                             ['scripts/reader/epub-original.js', epubSource]]){
  assert.doesNotMatch(withoutBlockComments(source), /window\.scroll(Y|By)\b/,
    `${file} still moves the document instead of the reader's own scrolling box`);
}
assert.match(epubSource,/EPUB_FRAME_TIMEOUT/,
  'A chapter frame that never loads can hang the original reader');
/* ---- 붙임글자: 책이 스스로 답을 갖고 있습니다 ----
   Type 3 글꼴로 조판한 PDF 는 "Th"·"ft" 를 글꼴 안의 사용자 지정 자리에 넣어
   두고 그게 무슨 글자인지 적어 두지 않습니다. 같은 책의 멀쩡한 낱말과 맞춰
   보면 후보는 하나로 좁혀집니다 — 사전도 AI도 쓰지 않습니다. */
const bridgeContext = {};
new Script(readFileSync(resolve(root, 'scripts/importers/ligatures.js'), 'utf8'))
  .runInNewContext(bridgeContext);
{
  const TH = '\uE062', FT = '\uE09D';
  const book = [
    TH+'e scythe arrived late on a cold November a'+FT+'ernoon.',
    'His so'+FT+' shoes made no sound. A'+FT+'er all, scythes had to eat.',
    TH+'ey looked like robes. The soft light left the room, and after that they often waited.',
  ].join('\n');
  const learned = bridgeContext.learnLigatures(book);
  assert.deepEqual(JSON.parse(JSON.stringify(learned)), {[TH]:'th', [FT]:'ft'},
    'The book can no longer work out which letters its unnamed glyphs stand for');
  const fixed = bridgeContext.applyLigatures(book, learned);
  assert.match(fixed, /^The scythe arrived late on a cold November afternoon\./,
    'A sentence-opening ligature lost its capital');
  assert.match(fixed, /His soft shoes made no sound\. After all/,
    'A mid-sentence ligature was capitalised, or a sentence opener was not');
  assert.doesNotMatch(fixed, /[\uE000-\uF8FF]/, 'A box character survived the repair');
  /* 짐작이 서지 않으면 손대지 않습니다. 잘못 고친 글자는 네모보다 나쁩니다. */
  assert.equal(bridgeContext.learnLigatures('zz'+TH+'qq and nothing else here'), null,
    'An undecidable glyph is being replaced by a guess');
  assert.equal(bridgeContext.normalizeLigatures('the oﬃce ﬂag'), 'the office flag',
    'Unicode ligatures are no longer unpacked');
}
new Script(readFileSync(resolve(root, 'scripts/reader/mode-bridge.js'), 'utf8'))
  .runInNewContext(bridgeContext);
assert.deepEqual(Array.from(bridgeContext.bridgeTokens('“Michael  took—his eyes”')),
  ['michael','took','his','eyes'],'Mode bridge does not normalize book punctuation');
/* 두 화면이 붙임글자를 다르게 읽으면 같은 문장을 못 알아봅니다. */
assert.deepEqual(Array.from(bridgeContext.bridgeTokens('the oﬃce ﬂag')),
  ['the','office','flag'],'A ligature still splits one word into two tokens');
assert.deepEqual(JSON.parse(JSON.stringify(bridgeContext.bridgeFindSequence(
  ['before','michael','took','his','eyes','off','the','road'],
  'Michael took his eyes off the road.'))),
  {start:1,length:7,confidence:1,confirmed:false},'Mode bridge cannot locate a visible sentence');

/* ---- 같은 문장이 여러 번 나오는 책 ----
   예전에는 언제나 "책에서 처음 나오는 자리"로 뛰었습니다. 400쪽짜리 책
   한가운데서 모드를 바꾸면 1장으로 튀던 이유입니다. */
const twice = [];
for(let copy=0; copy<3; copy++){
  for(const word of ['he','nodded','and','then','she','left','the','room','so','they','waited'])
    twice.push(word);
}
assert.equal(bridgeContext.bridgeFindSequence(twice,'He nodded.',{near:13}).start,11,
  'The bridge still ignores where the reader actually was');
assert.equal(bridgeContext.bridgeFindSequence(twice,'He nodded.',{follow:'And then she left the room.',near:24}).start,22,
  'The following sentence no longer confirms which copy is the right one');
assert.equal(bridgeContext.bridgeFindSequence(twice,'He nodded.'),null,
  'A short sentence with several equal matches still picks one at random');
assert.equal(bridgeContext.bridgeFindSequence(
  [...Array(2000).fill('filler'),'he','nodded','deeply'],'He nodded deeply.',{near:0}),null,
  'A match on the far side of the book is still accepted as the same place');
assert.match(modesSource,/bridgeFindSequence/,
  'Reader modes no longer align by the visible sentence');
const geometryContext = {};
new Script(readFileSync(resolve(root, 'scripts/reader/pdf-word-geometry.js'), 'utf8'))
  .runInNewContext(geometryContext);
assert.equal(geometryContext.pdfFontAscentRatio({ascent:.82,descent:-.18}),.82,
  'Normal PDF font metrics were unexpectedly changed');
assert.ok(Math.abs(geometryContext.pdfFontAscentRatio({ascent:1.19628906,descent:-.43945313})-.7315)<.002,
  'Exceptional Charis SIL metrics were not normalized for Holes');

/* Verity ships one text item per glyph. Tokenising each item on its own turned
   every letter into a word, so the reader underlined every saved "h" and a tap
   looked up a single letter. Items on one baseline must become one line first,
   with the word gaps coming from the geometry rather than the item widths. */
const GLYPH_WIDTH = 6, GLYPH_HEIGHT = 12, SPACE_GAP = 4;
const glyphEntries = (line, startX, startY) => {
  const entries = [];
  let x = startX;
  for(const character of line){
    if(character === ' '){ x += SPACE_GAP; continue; }
    entries.push(geometryContext.pdfTextEntry(
      [GLYPH_HEIGHT, 0, 0, GLYPH_HEIGHT, x, startY], character, GLYPH_WIDTH, .89, 'sans-serif'));
    x += GLYPH_WIDTH;
  }
  return entries;
};
const measureByLength = value => value.length * GLYPH_WIDTH;
const glyphPage = geometryContext.pdfPageWords(
  [...glyphEntries('the man is here.', 20, 200), ...glyphEntries('He left.', 20, 220)],
  measureByLength, 600, 800);
assert.equal(glyphPage.text, 'the man is here. He left.',
  'Glyph-per-item PDF text was not reassembled into words');
assert.deepEqual(Array.from(glyphPage.boxes, box => box.word),
  ['the','man','is','here','He','left'],
  'Every glyph of a glyph-per-item PDF still became its own word');
const hereBox = glyphPage.boxes[3];
assert.ok(Math.abs(hereBox.w * 600 - 4 * GLYPH_WIDTH) < .01,
  'A rebuilt word box does not span all of its glyphs');
assert.equal(glyphPage.boxes[4].offset, glyphPage.text.indexOf('He'),
  'A rebuilt word lost the character offset that gives it its own sentence');

// A PDF that already hands out whole lines must come through unchanged.
const wholeLine = geometryContext.pdfPageWords(
  [geometryContext.pdfTextEntry([GLYPH_HEIGHT,0,0,GLYPH_HEIGHT,20,200],
    'the man is here.', 16 * GLYPH_WIDTH, .89, 'sans-serif')],
  measureByLength, 600, 800);
assert.equal(wholeLine.text, 'the man is here.', 'Line-per-item PDF text was altered');
assert.deepEqual(Array.from(wholeLine.boxes, box => box.word), ['the','man','is','here'],
  'Line-per-item PDF words regressed');
const readerSource = readFileSync(resolve(root, 'scripts/reader/reader.js'), 'utf8');
assert.match(readerSource,/suspendReaderScrollSave/,
  'Programmatic mode-switch scrolling can still overwrite progress');
const dictionaryCss = readFileSync(resolve(root, 'styles/dictionary.css'), 'utf8');
assert.match(dictionaryCss,/pointer:fine/,
  'Desktop browser zoom still falls into the oversized mobile dictionary');
const preferencesSource = readFileSync(resolve(root, 'scripts/ui/preferences.js'), 'utf8');
assert.doesNotMatch(preferencesSource,/function setOriginalMarkMode/,
  'The saved-word display preference is back');
assert.doesNotMatch(index,/aa-original-marks/,
  'The settings popover still offers the deleted display modes');
const readerCss = readFileSync(resolve(root, 'styles/reader.css'), 'utf8');

assert.equal(existsSync(resolve(root,'scripts/reader/rolling-formatting.js')),false,
  'AI typography client was not removed');
assert.equal(existsSync(resolve(root,'server/format/index.ts')),false,
  'AI typography server function was not removed');

/* ---- 홈: 짧은 글 레일 + 긴 글 서가 ---- */
const librarySource = readFileSync(resolve(root, 'scripts/library/library.js'), 'utf8');
assert.doesNotMatch(librarySource, /getElementById\('hero'\)/,
  'The old hero card is still rendered alongside the same book in the shelf');
assert.match(librarySource, /CASUAL_KINDS = new Set\(\['paste','article'\]\)/,
  'Casuals no longer collect both pasted text and fetched articles');
assert.match(librarySource, /function nowReadingIn\(list\)/,
  'Nothing marks which book is being read now that the hero card is gone');
/* 두 줄은 각자 자기 줄에서 마지막에 읽던 것을 기억해야 합니다. 기사를 한 편
   봤다고 읽던 원서 표시가 사라지면 안 됩니다. */
assert.match(librarySource, /nowReadingIn\(casuals\)/,
  'The Casuals rail no longer tracks its own last-read item');
assert.match(librarySource, /nowReadingIn\(longform\)/,
  'The long-form shelf shares its last-read marker with Casuals again');
assert.match(index, /id="casual-rail"/, 'The Casuals rail is missing from home');
assert.match(index, /id="casual-lib"[\s\S]{0,500}id="casual-add"/,
  'The Casuals header lost its library and add buttons');
assert.match(index, /id="longform-lib"[\s\S]{0,500}id="longform-add"/,
  'The long-form header lost its library and add buttons');
assert.match(index, /id="v-longform"/, 'The long-form library view is missing');
assert.match(librarySource, /function renderLongformLibrary/,
  'Nothing fills the long-form library view');
/* Casuals 의 + 는 파일 버튼을 감춥니다 — 짧은 글에 EPUB 을 넣을 수는 없습니다. */
assert.match(librarySource, /\.am-file'\)\.hidden = mode === 'casual'/,
  'The Casuals + sheet offers a file picker again');
/* Long-form 의 + 는 시트를 거치지 않고 곧장 파일 고르기입니다 — 고를 것이 하나뿐입니다. */
assert.match(index, /id="longform-add"[^>]*onclick="pickBookFile\(\)"/,
  'The long-form + no longer opens the file picker directly');
const homeCss = readFileSync(resolve(root, 'styles/home.css'), 'utf8');
assert.match(homeCss, /#casual-rail\{[^}]*overflow-x:auto/,
  'The Casuals rail no longer scrolls sideways');
assert.match(homeCss, /\.now-ring\{/, 'The currently-read card lost its ring');
const addSheet = index.slice(index.indexOf('id="add-modal"'), index.indexOf('id="edit-modal"'));
assert.equal((addSheet.match(/class="am-big/g) || []).length, 3,
  'The + sheet no longer offers exactly three ways in');

/* ---- 정보 바꾸기 시트와 두 갈래 삭제 ----
   되돌릴 수 없는 쪽을 기본으로 두면 안 됩니다. 폰에서 자리만 비우려던
   사람이 노트북의 책까지 잃습니다. */
const editSource = readFileSync(resolve(root, 'scripts/library/book-edit.js'), 'utf8');
assert.match(index, /id="edit-modal"/, 'The long-press edit sheet is missing');
assert.match(index, /runDelete\('local'\)[\s\S]{0,900}runDelete\('all'\)/,
  'The delete step no longer offers both scopes, with this device first');
assert.match(librarySource, /async function deleteBook\(b, scope\)/,
  'Deleting a book is back to one all-or-nothing path');
assert.match(librarySource, /if\(scope !== 'all'\)[\s\S]{0,400}return;/,
  'A device-only delete still reaches the server');
assert.doesNotMatch(librarySource, /confirm\(`"\$\{b\.title\}" 책을 삭제/,
  'The old two-button confirm is back in front of the scope question');
assert.match(editSource, /function openEditSheet/, 'Nothing opens the edit sheet');
assert.match(librarySource, /attachLongPress\(card, \(\)=>openEditSheet\(book\)\)/,
  'A long press no longer opens the edit sheet');
// 로그인하지 않았으면 서버 사본이 없습니다. 고를 것 없는 갈림길을 내지 않습니다.
assert.match(editSource, /\.ed-all'\)\.hidden = !signedIn/,
  'Signed-out users are offered a delete-everywhere button that does nothing');
/* 카드가 보이는 곳이 셋이라 하나만 다시 그리면 나머지가 옛 이름을 들고 남습니다. */
assert.match(librarySource, /function renderAllBookViews/,
  'The three book views are refreshed one by one again');

/* ---- Casuals 자동 올리기 ----
   Sync 창을 열어 책마다 올리기를 눌러야 한다면 그 일은 일어나지 않습니다. */
assert.match(librarySource, /autoUploadCasual\(book\)/,
  'A pasted or fetched article never reaches the server on its own');
assert.match(syncSource, /function autoUploadCasual/, 'Casual auto-upload is gone');
assert.match(syncSource, /if\(twin && \(auto \|\|/,
  'Auto-upload can pop a confirm dialog right after an import');

/* ---- 짐 덜기 ----
   xlsx 881KB 는 Review 탭 버튼 하나 때문에 모든 사용자가 매번 받던 짐이었고,
   PDF·EPUB 라이브러리 418KB 는 기사만 읽는 사람에게 한 번도 안 쓰일 짐입니다. */
assert.doesNotMatch(index, /xlsx/i, 'The 881KB spreadsheet library is loaded again');
assert.doesNotMatch(index, /<script[^>]+(?:pdf\.min\.js|jszip)/,
  'PDF/EPUB libraries are eagerly loaded again');
const dictionarySource = readFileSync(resolve(root, 'scripts/dictionary/dictionary.js'), 'utf8');
assert.doesNotMatch(dictionarySource, /\bXLSX\b/, 'The export still needs the xlsx library');
// 엑셀은 BOM 이 없으면 CSV 를 라틴1로 읽어 한글을 깹니다.
assert.match(dictionarySource, /'﻿' \+/, 'The CSV export lost its BOM, so Excel breaks Korean');
const importerSource = readFileSync(resolve(root, 'scripts/importers/importers.js'), 'utf8');
assert.match(importerSource, /await ensurePdfLib\(\)/, 'parsePDF no longer waits for the lazy library');
assert.match(importerSource, /await ensureZipLib\(\)/, 'EPUB reading no longer waits for JSZip');

/* ---- 배포마다 반쪽짜리 앱이 뜨던 문제 ----
   GitHub Pages 는 파일마다 캐시를 따로 잡습니다. 새 index.html 과 옛
   sync.js 가 함께 도는 상태가 실제로 만들어졌습니다. */
const localAssets = [...index.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="(?!https?:|\/\/|data:|#)([^"]+\.(?:js|css))([^"]*)"/g)];
assert.ok(localAssets.length > 20, 'Local asset scan found almost nothing — the regex is wrong');
for(const [, path, query] of localAssets){
  assert.match(query, /^\?v=[0-9a-f]{8}$/,
    `${path} has no cache-busting stamp — run \`npm run stamp\``);
}

/* ---- 원본 형식 표 ----
   같은 일을 부르는 자리마다 pdf/epub 삼항연산자를 쓰던 것을 표 하나로 모았습니다. */
const formatsSource = readFileSync(resolve(root, 'scripts/reader/original-formats.js'), 'utf8');
for(const job of ['open','captureAnchor','restoreAnchor','anchorFromProgress',
                  'progress','sentenceBridge','restoreSentence','refreshSavedWords']){
  assert.ok(new RegExp(`${job}:`).test(formatsSource), `The format table lost its ${job} entry`);
}
for(const file of ['scripts/reader/original-session.js','scripts/reader/reader-modes.js']){
  assert.doesNotMatch(readFileSync(resolve(root, file), 'utf8'),
    /kind\s*===?\s*'pdf'\s*\?|kind==='pdf'\s*\?/,
    `${file} dispatches on the format by hand again instead of using the table`);
}

/* ---- 켜고 끄는 집중 모드는 없습니다 ----
   읽는 방향이 신호입니다. 상단바만 미끄러져 나가고, 단추 둘은 늘 같은 자리에
   있습니다. 화면을 바꾸는 스위치가 두 군데 있으면 자리가 어긋납니다. */
assert.doesNotMatch(modesSource, /reader-mode-switch/,
  'The reader still drives a second, top-bar copy of the mode switch');
for(const gone of [/focusmode/, /id="focusbtn"/, /id="reader-mode-switch"/]){
  assert.doesNotMatch(index, gone, `The removed focus-mode chrome is back (${gone})`);
}
assert.doesNotMatch(readerCss, /focusmode|#reader-mode-switch/,
  'Focus-mode styling survived the switch to scroll-driven chrome');
assert.doesNotMatch(preferencesSource, /focusmode/,
  'The focus-mode toggle is back');
assert.match(index, /id="modefab"[^>]*onclick="toggleReaderMode\(\)"/,
  'The 원본↔글자 button is missing');
assert.match(index, /id="readfabs"/,
  'The two reading buttons are no longer stacked, so they move when one hides');
/* 단추에는 글자가 없습니다. 두 그림이 서로 자리를 바꿔야 어느 쪽으로 가는지 보입니다. */
for(const glyph of ['mf-original', 'mf-text']){
  assert.match(index, new RegExp(`class="${glyph}"`), `The mode button lost its ${glyph} glyph`);
}
assert.match(readerCss, /body\.reader-original #modefab \.mf-text\{opacity:1/,
  'The mode button no longer flips its icon, so it always points the same way');

/* 상단바가 사라져도 --topbar-h 는 그대로여야 합니다 — 0 으로 우기면 앵커
   계산이 글 첫 줄을 로고 뒤에 숨깁니다(예전 집중 모드의 버그). */
assert.match(readerCss, /body\.chrome-hidden #topbar\{[^}]*visibility:hidden/,
  'Reading downward no longer clears the top bar');
/* 이제는 밉니다. 밀지 못했던 것은 `position:sticky` 인 칸이 아이폰에서 스크롤과
   같은 층에 있어서, `transform` 을 얹으면 옛 그림 한 장이 노치 옆에 남았기
   때문입니다. 상단바가 흐름 밖(`fixed`)으로 나오면서 그 층이 갈라졌습니다. */
assert.match(readerCss, /body\.reading #topbar\{position:fixed/,
  'The top bar is in the flow again, so it reserves a blank strip beside the notch');
assert.match(readerCss, /body\.chrome-hidden #topbar\{[^}]*transform:translateY\(-100%\)/,
  'The top bar only fades instead of sliding out of the way');
assert.match(readerCss, /body\.chrome-hidden #topbar\{[^}]*backdrop-filter:none/,
  'The blur layer is left running while the bar is hidden');
assert.doesNotMatch(readerCss, /body\.chrome-hidden[^\n]*--topbar-h/,
  'The top bar forces its height to zero again while hidden');
const readerScroll = readFileSync(resolve(root, 'scripts/reader/reader.js'), 'utf8');
assert.match(readerScroll, /CHROME_STEP/,
  'Chrome follows every pixel of scroll, so the top bar flickers');
/* 돌아오는 문턱이 걷히는 문턱보다 높아야 아이폰 관성의 되튐이 상단바를
   깜빡이지 않습니다. */
assert.match(readerScroll, /CHROME_BACK = (\d+)/,
  'The top bar comes back on the same threshold it hides on, so momentum flashes it');
assert.ok(Number(/CHROME_BACK = (\d+)/.exec(readerScroll)[1])
        > Number(/CHROME_STEP = (\d+)/.exec(readerScroll)[1]),
  'The come-back threshold is not larger than the hide threshold');
assert.match(readerScroll, /Date\.now\(\) < readerScrollPauseUntil\)\{ chromeRun = 0/,
  'A programmatic mode-switch scroll can hide the top bar as if the reader scrolled');
assert.doesNotMatch(readerScroll, /classList\.add\('scrolling'\)/,
  'The old any-scroll fade is back alongside the direction signal');

/* ---- 좌우 여백은 Aa 안에서 ---- */
assert.match(preferencesSource, /const READ_MARGINS = \{/,
  'The margin control has no steps to choose from');
assert.match(preferencesSource, /keepPlace\(\(\)=>\{[\s\S]*?save\('breeze\.margin'/,
  'Changing the margin no longer keeps the sentence being read in place');
assert.match(readerCss, /#readwrap\{max-width:var\(--readw,700px\); margin:0 auto;\s*\n?\s*padding:calc\(var\(--topbar-h,56px\) \+ 36px\) var\(--readpad,26px\)/,
  'The reading column stopped following the margin setting, or lost the room the fixed top bar needs');
assert.match(index, /class="aa-row stack aa-text-only"[\s\S]*?id="aa-margin"/,
  'The 좌우 여백 row is missing from the Aa popover');

/* ---- 일회성 변환은 걷어냈습니다 ---- */
/* 주석은 "무엇을 왜 지웠는지" 설명하느라 지운 이름을 그대로 적습니다.
   실제로 도는 코드만 봅니다. */
const withoutComments = source => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const stateSource = withoutComments(readFileSync(resolve(root, 'scripts/core/state.js'), 'utf8'));
assert.doesNotMatch(stateSource, /readerSchema|book\.tidy|LS_BOOKS/,
  'A one-time migration is running on every boot again');
assert.doesNotMatch(withoutComments(syncSource), /hydrateServerFingerprints/,
  'Every book-list refresh re-downloads and re-hashes server books again');

/* ---- Casuals 는 양쪽으로 저절로 ---- */
assert.match(syncSource, /function autoDownloadCasuals/,
  'An article saved on another device never arrives on its own');
assert.match(syncSource, /kind:b\.kind\|\|''/,
  'The server list cannot tell a short read from a book, so nothing can be auto-pulled');
/* 이 기기에서만 지운 책이 다음 동기화에 도로 돌아오면 지운 것이 아닙니다. */
assert.match(librarySource, /hideBookLocally\(remoteId\)/,
  'A device-only delete is undone by the next auto-download');
assert.match(syncSource, /if\(hidden\[row\.book_id\]\) continue/,
  'Auto-download ignores the device-only delete marker');

/* ---- 샘플 책은 없앴습니다 ---- */
assert.equal(existsSync(resolve(root, 'scripts/core/demo-book.js')), false,
  'The sample book file is back');
for(const file of [...jsFiles, resolve(root, 'index.html')]){
  assert.doesNotMatch(readFileSync(file, 'utf8'), /DEMO_BOOK|allBooks\(\)/,
    `${file.slice(root.length + 1)} still reaches for the removed sample book`);
}

/* ---- 내장 고전 ---- */
const classicsContext = { console, Set, books:[] };
new Script(readFileSync(resolve(root, 'scripts/library/classics.js'), 'utf8'))
  .runInNewContext(classicsContext);
const offered = classicsContext.pendingClassics();
assert.equal(offered.length, 3, 'The bundled classic count changed');
for(const classic of offered){
  assert.ok(existsSync(resolve(root, `assets/classics/${classic.id}.epub`)),
    `Bundled classic file is missing: ${classic.id}`);
  /* 권유 카드는 아직 받기 전에 뜨므로, 표지 한 장을 보자고 책을 미리 받을 수
     없습니다. 같은 그림이 파일 밖에도 한 장 있어야 합니다. */
  assert.ok(existsSync(resolve(root, `assets/classics/${classic.id}.jpg`)),
    `Bundled classic cover is missing: ${classic.id}`);
}
// 이미 받은 고전은 권유 카드에서 빠져야 합니다.
classicsContext.books = [{ classicId: offered[0].id }];
assert.deepEqual(Array.from(classicsContext.pendingClassics(), classic => classic.id),
  Array.from(offered.slice(1), classic => classic.id),
  'An imported classic is still offered as a download card');
assert.match(readFileSync(resolve(root, 'scripts/library/classics.js'), 'utf8'), /importFile\(file,/,
  'Classics no longer go through the ordinary EPUB import, so they lose 원본 모드');

/* ---- 기사 URL ----
   DOM 을 쓰는 추출은 브라우저에서 확인합니다. 여기서는 순수 문자열 규칙만. */
const articleContext = { Map, Set, RegExp, String, Number, Math, Object, Array, JSON, URL, Date, console };
new Script(readFileSync(resolve(root, 'scripts/importers/article.js'), 'utf8'))
  .runInNewContext(articleContext);
assert.equal(articleContext.normalizeArticleUrl('bbc.com/news/x'), 'https://bbc.com/news/x',
  'A pasted URL without a scheme was rejected');
assert.equal(articleContext.normalizeArticleUrl('javascript:alert(1)'), '',
  'A non-http scheme was accepted as an article URL');
assert.equal(articleContext.normalizeArticleUrl('  '), '', 'Blank input produced a URL');
assert.equal(articleContext.normalizeArticleUrl('notaurl!!'), '',
  'A typo reached the network instead of being called a typo');
assert.equal(articleContext.normalizeArticleUrl('https://en.wikipedia.org/wiki/Reading'),
  'https://en.wikipedia.org/wiki/Reading', 'A perfectly good URL was rejected');
assert.equal(
  articleContext.articleStripSite('Whales are singing again - BBC News', 'BBC News', 'www.bbc.com'),
  'Whales are singing again', 'The publisher suffix was not trimmed from the title');
assert.equal(
  articleContext.articleStripSite('A tale of two - and only two - cities', 'BBC News', 'www.bbc.com'),
  'A tale of two - and only two - cities', 'A dash inside the title truncated it');
/* ---- 기사 사진 ---- */
// srcset 은 "주소 폭w, …" 입니다. 가장 큰 판을 골라야 카드 표지가 뭉개지지 않습니다.
const srcsetImage = {
  attrs:{ srcset:'/s.jpg 320w, /m.jpg 640w, /l.jpg 1280w', src:'/fallback.jpg' },
  getAttribute(name){ return this.attrs[name] === undefined ? null : this.attrs[name]; },
};
assert.equal(articleContext.articleBestSrc(srcsetImage), '/l.jpg',
  'The widest image in a srcset is no longer preferred');
const bareImage = { getAttribute(name){ return name === 'src' ? '/only.jpg' : null; } };
assert.equal(articleContext.articleBestSrc(bareImage), '/only.jpg',
  'An image with a plain src was dropped');
assert.equal(articleContext.articleAbsolute('/photo.jpg', 'https://www.bbc.com/news/x'),
  'https://www.bbc.com/photo.jpg', 'A site-relative image path was not resolved');
assert.equal(articleContext.articleAbsolute('data:image/gif;base64,R0lGOD', 'https://a.com/'), '',
  'A data: URI was treated as a fetchable image');
/* 그림 키는 주소에서 나옵니다 — 책 ID 는 그 키가 들어간 문단이 다 모여야
   정해지기 때문입니다. 어느 기기에서 넣어도 같은 값이어야 합니다. */
const sameKey = articleContext.articleImageKey('https://a.com/p.jpg');
assert.equal(sameKey, articleContext.articleImageKey('https://a.com/p.jpg'),
  'The image key is not stable, so the same article would import twice');
assert.notEqual(sameKey, articleContext.articleImageKey('https://a.com/q.jpg'),
  'Two different images share one storage key');
assert.match(articleContext.articleImageKey('https://a.com/p.jpg'), /^art\|/,
  'Article image keys lost the prefix that keeps them out of the EPUB namespace');
/* 크기는 긴 변으로 봅니다. 두 변을 다 재면 250x144 짜리 가로 사진이 아이콘과
   함께 걸러집니다 — 위키백과 본문 사진이 실제로 그렇게 사라졌습니다. */
const sized = (width, height) => ({ getAttribute(name){
  return name === 'width' ? String(width) : name === 'height' ? String(height) : null; } });
assert.equal(articleContext.articleTooSmall(sized(250, 144)), false,
  'A landscape photo was thrown out for being short');
assert.equal(articleContext.articleTooSmall(sized(50, 50)), true, 'An icon was kept as a photo');
assert.equal(articleContext.articleTooSmall(sized(728, 12)), true, 'A banner strip was kept as a photo');
assert.equal(articleContext.articleTooSmall({ getAttribute: () => null }), false,
  'An image without stated dimensions was thrown out — most sites state none');

const articleSource = readFileSync(resolve(root, 'scripts/importers/article.js'), 'utf8');
// 사진은 <figure> 안에 있고 <figure> 는 통째로 버려집니다. 순서가 뒤집히면 다 사라집니다.
assert.match(articleSource, /articleMarkImages\(doc, url\);[\s\S]{0,120}querySelectorAll\(ARTICLE_DROP\)/,
  'Images are collected after the drop pass removes the figures holding them');
/* BBC 는 사진 한 장과 매체 로고를 한 <figure>에 같이 넣습니다. 로고를 버리면서
   그 <figure>까지 지우면 사진도 함께 날아갑니다(실제로 BBC 사진이 0장이었습니다). */
assert.doesNotMatch(articleSource, /holder\.remove\(\)/,
  'Rejecting one image removes its whole <figure>, taking the real photo with it');

/* ---- 사진 동기화 ----
   사진 자체는 올리지 않습니다. 이미 공개된 남의 사진을 서버에 쌓아 둘 이유가
   없고, 받는 기기는 주소만 있으면 스스로 받아 옵니다. */
assert.match(articleSource, /parsed\.imgSrc\[articleImageKey\(url\)\] = url/,
  'Nothing records where each photo came from, so another device cannot fetch it');
assert.match(articleSource, /function bookImageBlob/,
  'A synced article has no way to recover its photos');
// 홈은 자주 다시 그려집니다. 못 받는 사진을 렌더링할 때마다 다시 부르면 안 됩니다.
assert.match(articleSource, /bookImageMissing\.has\(key\)/,
  'An unreachable photo is re-fetched on every home render');
for(const field of ['site', 'sourceUrl', 'cover', 'imgSrc']){
  assert.match(syncSource, new RegExp(`${field}:b\\.${field}`),
    `A synced article loses its ${field}`);
  assert.match(syncSource, new RegExp(`${field}:body\\.${field}`),
    `A downloaded article never reads back its ${field}`);
}
assert.doesNotMatch(syncSource, /storage\.from\('imgs'\)|uploadImage/,
  'Article photos are being re-hosted on the server instead of re-fetched');
assert.match(articleSource, /parsed\.blocks\.filter\(block => block\.r !== 'img' \|\| stored\.has/,
  'An image that failed to download would leave a broken figure in the article');

const articleServer = readFileSync(resolve(root, 'server/article/index.ts'), 'utf8');
assert.match(articleServer, /PRIVATE_HOST/,
  'The article relay would happily fetch private network addresses');
assert.match(articleServer, /MAX_BYTES/, 'The article relay has no response size limit');
assert.match(articleServer, /MAX_IMAGE_BYTES/, 'The image relay has no size limit');
// SVG 는 그림이 아니라 스크립트를 품을 수 있는 문서입니다.
assert.match(articleServer, /\/svg\/i\.test\(type\)/,
  'The image relay would pass an SVG document through as a photo');

/* ── 사진은 보내기 전에 한 번 줄입니다 ──
   매체가 내주는 원본은 2000~3000px 짜리 인쇄용입니다. 그대로 실어 보내면 짧은
   글 하나가 1MB 에 가까워지고, 짧은 글은 묻지도 않고 저절로 내려받습니다. */
assert.match(articleSource, /async function shrinkPhotoForTransport/,
  'Article photos are uploaded at their original print resolution');
assert.match(articleSource, /await blobToDataUrl\(await shrinkPhotoForTransport\(stored\)\)/,
  'The shrunk photo is built but the original is what actually gets sent');
/* 예산은 실제로 오가는 크기(base64)로 세야 합니다. 원본 바이트로 세면 오가는
   양은 언제나 그보다 3분의 1 많습니다. */
assert.match(articleSource, /spent \+ dataUrl\.length > BOOK_PHOTO_BUDGET/,
  'The photo budget counts raw bytes, so a third more than that actually travels');

/* ── 옛 줄의 `kind` 는 짐작이 아니라 아는 기기가 적어 줍니다 ── */
assert.match(syncSource, /async function backfillServerKinds/,
  'Legacy server rows are left to the size guess forever');
assert.ok(
  syncSource.indexOf('await backfillServerKinds()') < syncSource.indexOf('await autoDownloadCasuals()'),
  'The kind backfill runs after the download decision it was supposed to inform',
);
/* 크기 하나로는 긴 기사가 원서로 넘어갑니다. 문단 수를 함께 봐야 합니다. */
assert.match(librarySource, /LEGACY_CASUAL_MAX_PARAS/,
  'The legacy guess is back to size alone, so a long article lands on the wrong shelf');

/* ── 고전 표지는 파일 밖의 한 장이 이깁니다 ──
   그래야 `assets/classics/<id>.jpg` 를 갈아 끼우는 것만으로 권유 카드와 서가가
   함께 바뀝니다. EPUB 안의 표지를 그대로 쓰면 파일을 다시 만들어야 합니다. */
const classicsSource = readFileSync(resolve(root, 'scripts/library/classics.js'), 'utf8');
assert.match(classicsSource, /async function applyClassicCover/,
  'A downloaded classic keeps the cover buried in its EPUB');
assert.ok(
  classicsSource.indexOf('await applyClassicCover(classic)') >
  classicsSource.indexOf('await importFile(file'),
  'The classic cover is applied before the book it belongs to exists',
);

/* ── 문장 통째로 ── */
const sentenceSource = readFileSync(resolve(root, 'scripts/dictionary/sentence.js'), 'utf8');
/* 문은 하나입니다 — 낱말 창의 단추. 꾹 누르는 손짓은 폰에만 있었고, iOS 의
   복사·찾아보기를 가져오느라 읽는 화면의 글자 선택까지 함께 막았습니다. */
assert.doesNotMatch(sentenceSource, /lineRects|SENT_MOVE_SLOP|beginSentPress|sent-fill/,
  'The long-press sentence fill is back, so the phone and the laptop have different doors');
assert.match(sentenceSource, /function explainSelectedSentence/,
  'The word panel has no way into the sentence window');
assert.doesNotMatch(readFileSync(resolve(root, 'styles/reader.css'), 'utf8'), /[{;]\s*-webkit-touch-callout:none/,
  'Text selection in the reader is suppressed again, but nothing needs the long press now');
assert.match(sentenceSource, /op:'explain'/, 'The sentence window never asks the server');
/* 같은 문장을 다시 물으면 한도를 쓰지 않아야 합니다. */
assert.match(sentenceSource, /const sentKey = text => 's:' \+ sentenceHash\(text\)/,
  'Sentence explanations are not cached, so re-reading the same line costs a lookup again');
/* 서버 쪽: 한도를 낱말 조회와 한 통에 담으면 문장 다섯 번이 낱말 다섯 번을 먹습니다. */
const dictServerSource = readFileSync(resolve(root, 'server/dict/index.ts'), 'utf8');
assert.match(dictServerSource, /async function opExplain/, 'The server has no sentence explanation op');
assert.match(dictServerSource, /EXPLAIN_DAILY/, 'Sentence explanations have no daily ceiling');
assert.ok(
  dictServerSource.indexOf('if (op === "explain")') < dictServerSource.indexOf('if (!/^[A-Za-z]'),
  'The sentence op is rejected by the single-word guard it should have run before',
);

/* ── 기다림 ──
   낱말 창과 문장 창이 같은 것을 씁니다. 자리마다 다른 것이 뜨면 "무엇을 기다리는지"
   보다 "여기가 어디인지"를 먼저 읽게 됩니다. */
const dictCss = readFileSync(resolve(root, 'styles/dictionary.css'), 'utf8');
assert.match(dictCss, /\.aurora \.glow/, 'The shared AI waiting state is gone');
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
assert.strictEqual((indexHtml.match(/class="[^"]*aurora[^"]*"/g) || []).length, 2,
  'The word panel and the sentence window no longer wait in the same way');
/* 색도 하나입니다. AI 가 나오는 세 자리가 같은 변수만 씁니다 — 뜻 상자에 초록빛이,
   문장 창에 흰 종이가 깔려 있으면 같은 목소리로 들리지 않습니다. */
assert.match(readFileSync(resolve(root, 'styles/base.css'), 'utf8'), /--ai-bg1:/,
  'The shared AI palette is gone, so each AI surface picks its own colour again');
assert.match(dictCss, /#p-ai\{[^}]*var\(--ai-bg1\)/,
  'The word meaning box has its own colour again');
assert.match(readFileSync(resolve(root, 'styles/components.css'), 'utf8'), /#st-card\{[^}]*var\(--ai-bg1\)/,
  'The sentence window has its own colour again');

console.log(`Breeze checks passed: ${jsFiles.length} active + ${parkedJs.length} parked JavaScript files`);
