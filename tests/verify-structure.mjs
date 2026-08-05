import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html',
  'styles/base.css',
  'styles/reader.css',
  'scripts/core/storage.js',
  'scripts/library/library.js',
  'scripts/importers/importers.js',
  'scripts/dictionary/dictionary.js',
  'scripts/reader/formatting.js',
  'scripts/reader/reader.js',
  'scripts/sync/sync.js',
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

console.log(`Breeze checks passed: ${jsFiles.length} active JavaScript files`);
