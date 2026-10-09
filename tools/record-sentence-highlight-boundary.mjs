/* Record only the reviewed Text sentence highlight follow-up. Historical
 * owner receipts stay intact; verify-integration-boundary verifies both views.
 * Run after source review: node tools/record-sentence-highlight-boundary.mjs
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const base='b55f3df241607c95855a53009aceaa903e1da164';
const source='9f292c1a0488111b46c9e6eefdf78c05d4ab85dd';
const files=[
  '.github/workflows/sentence-inline-feedback.yml',
  'docs/decisions/004-sentence-lookup-feedback.md',
  'index.html','scripts/reader/reader-modes.js','sw.js',
  'tests/verify-light-lookup-tone-browser.mjs',
  'tests/verify-sentence-cue-browser.mjs',
  'tests/verify-sentence-inline-browser.mjs',
  'tests/verify-sentence-text-ink-browser.mjs',
];
const integrationFiles=[
  'docs/qa/breeze-1.9-integration/boundary.json',
  'tests/verify-integration-boundary.mjs',
  'tools/record-sentence-highlight-boundary.mjs',
  'tests/verify-article-preview-browser.mjs',
];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalized=(file,bytes)=>file==='index.html'?bytes.toString().replace(/\?v=[a-f0-9]{8}/g,''):
  file==='sw.js'?bytes.toString().replace(/const VERSION = '[^']*';/,"const VERSION = 'STAMP';"):bytes;
assert.deepEqual(git('diff','--name-only',base,source).toString().trim().split('\n').sort(),[...files].sort(),'Reviewed source exceeded the sentence scope');
const receiptPath=new URL('docs/qa/breeze-1.9-integration/boundary.json',root);
const receipt=JSON.parse(readFileSync(receiptPath));
const sha256={},baseSha256={},integrationSha256={};
for(const file of files){
  const current=normalized(file,readFileSync(new URL(file,root)));
  const approved=normalized(file,git('show',source+':'+file));
  assert.equal(hash(current),hash(approved),'Unreviewed current sentence bytes: '+file);
  sha256[file]=hash(approved);
  if(file!=='tests/verify-sentence-text-ink-browser.mjs')baseSha256[file]=hash(normalized(file,git('show',base+':'+file)));
}
// The generated stamps may change; the HTML and worker source must not.
for(const file of ['index.html','sw.js'])assert.equal(sha256[file],baseSha256[file],'Sentence fix changed normalized shell source: '+file);
// Integrity's unchanged main fixture sampled a loading placeholder at 100ms.
// Preserve its fallback assertion; require the actual mocked failure to finish.
const completionFixture={file:'tests/verify-article-preview-browser.mjs',
  oldWait:'await page.waitForTimeout(100);',
  newWait:"await page.waitForFunction(()=>document.querySelector('#article-preview').dataset.metadata==='fallback'&&document.querySelector('#article-preview').dataset.metadataReason==='network');"};
const fixtureNow=readFileSync(new URL(completionFixture.file,root),'utf8');
const fixtureBase=git('show',base+':'+completionFixture.file);
assert.equal(fixtureNow.split(completionFixture.newWait).length,2);
assert.equal(hash(fixtureNow.replace(completionFixture.newWait,completionFixture.oldWait)),hash(fixtureBase),'Article fallback fixture changed beyond completion wait');
completionFixture.baseSha256=hash(fixtureBase);
for(const file of integrationFiles.filter(file=>file!== 'docs/qa/breeze-1.9-integration/boundary.json'))
  integrationSha256[file]=hash(readFileSync(new URL(file,root)));
receipt.approvedSentenceTextHighlightFollowup={
  base,source,
  scope:'Explicit 2026-10-09 sentence-highlight investigation/quick-fix approval and parent instruction to repair CI formally without bypassing checks. Only Text reader cue paint order/coordinates/cleanup, provider-free pixel/lifecycle/browser evidence, its decision record and generated cache stamps. One existing article fallback test now waits for the mocked network failure instead of assuming completion after 100ms; its original assertion and all other bytes stay unchanged. Preserve word appearance, original PDF/EPUB rendering, text/Range/gesture ownership, AI/server/storage/auth/billing and native/release metadata. Main merge and release build remain gated on user screenshot review.',
  files,integrationFiles,sha256,baseSha256,integrationSha256,completionFixture,
};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log('Recorded exact sentence source '+source+' without rewriting historical owner hashes.');
