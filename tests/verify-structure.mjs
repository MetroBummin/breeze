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
  'scripts/reader/rolling-formatting.js',
  'scripts/reader/reader.js',
  'scripts/sync/sync.js',
  'server/format/index.ts',
  'legacy/toc-and-ai-formatting.disabled.js',
  'legacy/edge_function_tidy.disabled.ts',
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

const syncSource = readFileSync(resolve(root, 'scripts/sync/sync.js'), 'utf8');
assert.match(
  syncSource,
  /const twin = activeServerBooks\(\)\.find/,
  'Duplicate-title warning still inspects hidden deleted tombstones',
);

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

// A completed whole-book map owns only its selected candidates. Omitted
// candidates become body, while ordinary paragraphs never sent to AI keep the
// stable local layout.
const rollingContext = {
  IMG_MARK:'[[IMG]]:',
  Map,
  Set,
  navigator:{ onLine:true },
  setTimeout,
  clearTimeout,
};
new Script(readFileSync(resolve(root, 'scripts/reader/rolling-formatting.js'), 'utf8'))
  .runInNewContext(rollingContext);
const rollingBook = {
  paras:['Heuristic heading', 'A quoted line.', 'Ordinary body.'],
  layoutSignals:[{z:1.6,b:true,c:true,p:1}, {in:.1,p:1}, null],
  formatting:{ blocks:[
    {r:'h1', t:'Heuristic heading', f:0},
    {r:'p', t:'A quoted line.', f:1},
    {r:'p', t:'Ordinary body.', f:2},
  ]},
  aiFormatting:{ version:3, status:'ready', candidateRanges:[[0,2]],
    ops:[{i:1,n:1,r:'quote',b:'section'}], createdAt:1 },
};
const displayBlocks = rollingContext.buildRollingDisplayBlocks(rollingBook);
assert.equal(
  JSON.stringify(displayBlocks.map(block => [block.r, block.f, block.before || 'none'])),
  JSON.stringify([['p',0,'none'], ['quote',1,'section'], ['p',2,'none']]),
  'Atomic book typography map was not applied to candidate positions',
);
const plan = rollingContext.buildBookTypographyPlan(rollingBook);
assert.equal(plan.items.some(item => item.i === 2), false, 'Ordinary body was sent to AI');
assert.equal(plan.items.some(item => item.i === 0), true, 'Heading candidate was not selected');
assert.equal(
  rollingContext.validateBookTypographyOps(rollingBook, new Set([0,1]), [
    {i:0,n:2,r:'quote'}, {i:1,n:1,r:'quote'},
  ]),
  null,
  'Overlapping book-format operations were accepted',
);

// Even a model-selected heading is demoted when it is clearly a full body
// paragraph. This catches the giant multi-sentence heading regression.
const longBody = Array(8).fill(
  'This is a complete sentence describing an ordinary scene in the book.'
).join(' ');
const safetyBook = { paras:[longBody] };
const safeOps = rollingContext.validateBookTypographyOps(safetyBook, new Set([0]), [
  {i:0,n:1,r:'h2',b:'page'},
]);
assert.equal(safeOps.length, 0, 'Long body paragraph remained a heading');

const giantNarrative = Array(30).fill('The ministry building stood above the city.').join(' ');
const quoteSafetyBook = { paras:[giantNarrative], layoutSignals:[{in:.1,it:false}] };
assert.equal(
  rollingContext.validateBookTypographyOps(quoteSafetyBook, new Set([0]), [
    {i:0,n:1,r:'quote'},
  ]).length,
  0,
  'Long unquoted narrative became a giant block quote',
);

// Compact candidate ranges must round-trip without listing every body block.
assert.equal(
  JSON.stringify([...rollingContext.candidateIdsFromRanges([[2,3],[8,1]])]),
  JSON.stringify([2,3,4,8]),
  'Compact candidate ranges did not round-trip',
);

const formatServer = readFileSync(resolve(root, 'server/format/index.ts'), 'utf8');
assert.doesNotMatch(formatServer, /Return exactly one compact JSON role for every supplied segment/,
  'Server still emits a role for every paragraph');
assert.match(formatServer, /Ordinary body prose is the default/, 'Selective candidate contract is missing');
assert.match(formatServer, /safeHeading/, 'Server heading safety gate is missing');
assert.match(formatServer, /const VERSION = 3/, 'Old AI formatting maps were not invalidated');

console.log(`Breeze checks passed: ${jsFiles.length} active JavaScript files`);
