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
  'styles/reader.css',
  'scripts/core/storage.js',
  'scripts/core/book-identity.js',
  'scripts/library/library.js',
  'scripts/importers/importers.js',
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
for(const file of jsFiles){
  const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if(result.status !== 0) throw new Error(result.stderr || `Syntax error in ${file}`);
}

// Browser classic scripts share one global lexical scope. Parse them in the
// exact HTML order as one program to catch cross-file duplicate declarations.
const orderedScripts = [...index.matchAll(/<script defer src="([^"]+\.js)"><\/script>/g)]
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

const storageSource = readFileSync(resolve(root, 'scripts/core/storage.js'), 'utf8');
assert.match(storageSource, /indexedDB\.open\('breeze-img',3\)/,
  'IndexedDB was not upgraded for local originals');
assert.match(storageSource, /createObjectStore\('originals'\)/,
  'Dedicated local original store is missing');
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
  IMG_MARK:'[[IMG]]:', Math, JSON, RegExp, Object, Number, String, Array, Set,
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
const importedParas = importerContext.assembleParagraphs(importedPages);
assert.deepEqual(Array.from(importedParas.sig, signal => signal.p), [1, 3],
  'A dropped page renumbered every later page in the original-mode coordinate map');

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
assert.match(epubSource,/dataset\.originalMarks/,
  'Original EPUB highlights ignore the saved display preference');
assert.match(sessionSource,/firstElementBelow/,
  'Visible page lookup walks every page on each scroll frame again');
assert.match(sessionSource,/originalAnchorFromProgress/,
  'A book without a coordinate map jumps back to page one');
assert.match(pdfSource,/window\.scrollBy\(0,after\.height-before\.height\)/,
  'A late page-size correction can still push the visible line');
assert.match(epubSource,/EPUB_FRAME_TIMEOUT/,
  'A chapter frame that never loads can hang the original reader');
const bridgeContext = {};
new Script(readFileSync(resolve(root, 'scripts/reader/mode-bridge.js'), 'utf8'))
  .runInNewContext(bridgeContext);
assert.deepEqual(Array.from(bridgeContext.bridgeTokens('“Michael  took—his eyes”')),
  ['michael','took','his','eyes'],'Mode bridge does not normalize book punctuation');
assert.deepEqual(JSON.parse(JSON.stringify(bridgeContext.bridgeFindSequence(
  ['before','michael','took','his','eyes','off','the','road'],
  'Michael took his eyes off the road.'))),
  {start:1,length:7,confidence:1},'Mode bridge cannot locate a visible sentence');
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
assert.match(preferencesSource,/breeze\.originalMarks/,
  'Original highlight preference is not persisted');
assert.match(preferencesSource,/underline','block','off/,
  'Original highlight preference no longer offers all three modes');
const readerCss = readFileSync(resolve(root, 'styles/reader.css'), 'utf8');
assert.match(readerCss,/#reader-mode-switch\{right:10px; top:9px;/,
  'Mobile reader switch regressed to a duplicated top-bar offset');

assert.equal(existsSync(resolve(root,'scripts/reader/rolling-formatting.js')),false,
  'AI typography client was not removed');
assert.equal(existsSync(resolve(root,'server/format/index.ts')),false,
  'AI typography server function was not removed');

console.log(`Breeze checks passed: ${jsFiles.length} active JavaScript files`);
