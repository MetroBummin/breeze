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

// A completed AI window owns the entire range: omitted heuristic headings
// become plain paragraphs, while explicit structural operations are applied.
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
  formatting:{ blocks:[
    {r:'h1', t:'Heuristic heading', f:0},
    {r:'p', t:'A quoted line.', f:1},
    {r:'p', t:'Ordinary body.', f:2},
  ]},
  aiFormatting:{ version:1, windows:[{
    from:0, to:3, createdAt:1,
    ops:[{i:1,n:1,r:'quote',j:false,b:'section'}],
  }]},
};
const displayBlocks = rollingContext.buildRollingDisplayBlocks(rollingBook);
assert.equal(
  JSON.stringify(displayBlocks.map(block => [block.r, block.f, block.before || 'none'])),
  JSON.stringify([['p',0,'none'], ['quote',1,'section'], ['p',2,'none']]),
  'AI window was not applied as the sole authority for its range',
);
assert.equal(
  rollingContext.validateRollingOps(rollingBook, {from:0,to:3}, [
    {i:0,n:2,r:'h2'}, {i:1,n:1,r:'quote'},
  ]),
  null,
  'Overlapping rolling operations were accepted',
);

console.log(`Breeze checks passed: ${jsFiles.length} active JavaScript files`);
