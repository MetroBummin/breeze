/* Immutable owner contracts for the approved single 1.9.1 integration.
 * Record after source review/stamping; the verifier checks the same contracts
 * independently of receipt-supplied hashes. No historical owner hash changes.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
export const base='b55f3df241607c95855a53009aceaa903e1da164';
const receiptFile='docs/qa/breeze-1.9-integration/boundary.json';
const guardFile='tests/verify-integration-boundary.mjs';
export const owners=[
 {pr:139,source:'63c79d28e850b5e0c21c67be38e98641aa2390ef',key:'approvedMemoryTitleFollowup',files:[
  'docs/decisions/014-design-only-brand-release.md',receiptFile,'docs/qa/memory-handwritten-title-20261009.md',
  'index.html','styles/wordbook.css','sw.js','tests/verify-design-memory-browser.mjs',guardFile]},
 {pr:140,source:'da0d935098c89a0d4482bd8d65463c93690ebf4d',key:'approvedAiCanonicalFollowup',files:[
  'docs/decisions/011-word-lookup-recovery.md',receiptFile,'index.html','scripts/dictionary/dictionary.js',
  'server/dict/lookup.ts','sw.js',guardFile,'tests/verify-lookup-contract.mjs',
  'tests/verify-word-arrival-browser.mjs','tests/verify-word-auth-deadline.mjs',
  'tests/verify-word-lemma-validation.mjs','tests/verify-word-lookup-quota.mjs']},
 {pr:141,source:'902af5c3544b94e6b9c2787559aea5a4b76cd33e',key:'approvedSentenceTextHighlightFollowup',files:[
  '.github/workflows/sentence-inline-feedback.yml','docs/decisions/004-sentence-lookup-feedback.md',receiptFile,
  'index.html','scripts/reader/reader-modes.js','sw.js','tests/verify-article-preview-browser.mjs',guardFile,
  'tests/verify-light-lookup-tone-browser.mjs','tests/verify-sentence-cue-browser.mjs',
  'tests/verify-sentence-inline-browser.mjs','tests/verify-sentence-text-ink-browser.mjs',
  'tools/record-sentence-highlight-boundary.mjs']},
];
export const integrationFiles=[receiptFile,guardFile,'tools/record-191-followups-boundary.mjs',
 'docs/decisions/020-breeze-191-followup-integration.md','docs/qa/breeze-191-followups-20261009.md'];
const shared=new Set([receiptFile,guardFile,'index.html','sw.js']);
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
const sourceBytes=(sha,file)=>git('show',sha+':'+file);
const read=file=>readFileSync(new URL(file,root));
const hash=value=>createHash('sha256').update(value).digest('hex');
export const normalizeGenerated=(file,bytes)=>file==='index.html'||file==='scripts/core/lazy-lib.js'?
 bytes.toString().replace(/\?v=[a-f0-9]{8}/g,''):file==='sw.js'?
 bytes.toString().replace(/const VERSION = '[^']*';/,"const VERSION = 'STAMP';"):bytes;
const baselineReceipt=()=>JSON.parse(sourceBytes(base,receiptFile));
const ownerReceipt=owner=>JSON.parse(sourceBytes(owner.source,receiptFile))[owner.key];

function expectedContract(){
 const files={};
 for(const owner of owners){
  const changed=git('diff','--name-only',base,owner.source).toString().trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(changed,[...owner.files].sort(),'Unexpected immutable PR'+owner.pr+' source scope');
  for(const file of owner.files.filter(file=>!shared.has(file))){
   assert.ok(!files[file],'Follow-ups require an explicit shared-file resolution: '+file);
   const sha256=hash(normalizeGenerated(file,sourceBytes(owner.source,file)));
   files[file]={pr:owner.pr,source:owner.source,sha256};
  }
 }
 // Only PR139 changes semantic shell markup. The other owners only stamp it.
 for(const owner of owners.slice(1))assert.equal(hash(normalizeGenerated('index.html',sourceBytes(owner.source,'index.html'))),
  hash(normalizeGenerated('index.html',sourceBytes(base,'index.html'))),'Unexpected owner shell markup');
 for(const owner of owners)assert.equal(hash(normalizeGenerated('sw.js',sourceBytes(owner.source,'sw.js'))),
  hash(normalizeGenerated('sw.js',sourceBytes(base,'sw.js'))),'Unexpected owner worker behavior');
 files['index.html']={pr:139,source:owners[0].source,sha256:hash(normalizeGenerated('index.html',sourceBytes(owners[0].source,'index.html')))};
 files['sw.js']={pr:'baseline',source:base,sha256:hash(normalizeGenerated('sw.js',sourceBytes(base,'sw.js')))};
 return {base,owners,files,integrationFiles};
}

function verifyCurrentFiles(contract){
 for(const [file,entry] of Object.entries(contract.files))assert.equal(hash(normalizeGenerated(file,read(file))),entry.sha256,
  'Reviewed PR'+entry.pr+' source bytes changed: '+file);
 const permitted=new Set([...Object.keys(contract.files),...integrationFiles]);
 const changed=new Set([...git('diff','--name-only',base).toString().split('\n'),
  ...git('ls-files','--others','--exclude-standard').toString().split('\n')].filter(Boolean));
 for(const file of changed)assert.ok(permitted.has(file),'Unapproved 1.9.1 integration path: '+file);
 // Keep the article assertion and every byte except its one completion wait.
 const fixture=ownerReceipt(owners[2]).completionFixture;
 const article=read(fixture.file).toString();
 assert.equal(article.split(fixture.newWait).length,2,'Exactly one article completion-wait change');
 assert.equal(hash(article.replace(fixture.newWait,fixture.oldWait)),hash(sourceBytes(base,fixture.file)),
  'Article fallback assertion or unrelated fixture changed');
 // The reviewed sentence runtime/test source remains identical to its owner freeze.
 const sentence=ownerReceipt(owners[2]);
 for(const file of sentence.files.filter(file=>file!=='index.html'&&file!=='sw.js'))
  assert.equal(hash(normalizeGenerated(file,read(file))),hash(normalizeGenerated(file,sourceBytes(sentence.source,file))),
   'Sentence reviewed freeze changed: '+file);
 const html=read('index.html').toString();
 const local=/(<(?:script|link|img)\b[^>]*?\b(?:src|href)=")(?!https?:|\/\/|data:|#)([^"?]+)(?:\?([^"?]*))?(")/g;
 for(const match of html.matchAll(local)){
  if(!/\.(?:js|css)$/.test(match[2])&&!/(?:^|\/)assets\/favicon\/[^/]+\.(?:png|svg|ico)$/.test(match[2]))continue;
  assert.equal(match[3],'v='+hash(read(match[2])).slice(0,8),'Resource stamp drift: '+match[2]);
 }
 const ready=['ready/index.html','ready/admin/index.html','ready/app.js','ready/admin/app.js','ready/ready.css'];
 const version=hash([html,...ready.map(file=>read(file).toString())].join('\n')).slice(0,8);
 assert.ok(read('sw.js').toString().includes("const VERSION = '"+version+"';"),'Generated worker version drift');
 // The existing Cloud hook owns the future counter; all native settings are immutable here.
 for(const file of ['ios/App/App.xcodeproj/project.pbxproj','ios/App/App/Breeze.entitlements',
  'ios/App/App/Info.plist','ios/App/ci_scripts/ci_post_clone.sh','config.js','capacitor.config.json',
  'package.json','package-lock.json'])assert.equal(hash(read(file)),hash(sourceBytes(base,file)),
   'Protected native/config/release bytes changed: '+file);
}

export function verifyCombinedBoundary(receipt){
 const expected=expectedContract();
 const current=receipt.approved191FollowupsIntegration;
 assert.ok(current,'Missing approved single-integration receipt');
 assert.deepEqual(Object.keys(receipt).sort(),[...Object.keys(baselineReceipt()),...owners.map(owner=>owner.key),
  'approved191FollowupsIntegration'].sort(),'Unexpected receipt fields');
 for(const key of ['base','owners','files','integrationFiles'])assert.deepEqual(current[key],expected[key],
  'Integration contract differs from immutable owners: '+key);
 // Historical receipts, including their original single-owner hashes, stay exact.
 for(const [key,value] of Object.entries(baselineReceipt()))assert.deepEqual(receipt[key],value,'Historical receipt rewritten: '+key);
 for(const owner of owners)assert.deepEqual(receipt[owner.key],ownerReceipt(owner),'Historical follow-up receipt rewritten: PR'+owner.pr);
 verifyCurrentFiles(current);
 assert.deepEqual(Object.keys(current.integrationSha256).sort(),integrationFiles.filter(file=>file!==receiptFile).sort(),
  'Incomplete integration verification evidence');
 for(const [file,expectedHash] of Object.entries(current.integrationSha256))assert.equal(hash(read(file)),expectedHash,
  'Reviewed integration verification bytes changed: '+file);
 return current;
}

// After independently checking current owner bytes, project them onto the old
// baseline only for historical receipt checks. Current-source checks above never
// use this projection, so a mutated renderer/dictionary/test cannot be hidden.
export function historicalBytes(file,bytes,contract){
 if(file==='index.html'){
  const memory=ownerReceipt(owners[0]);
  return Buffer.from(bytes.toString().replace(memory.newTitle,memory.oldTitle));
 }
 const entry=contract.files[file];
 if(entry&&hash(normalizeGenerated(file,bytes))===entry.sha256&&
   git('ls-tree','--name-only',base,'--',file).toString().trim()===file){
  return sourceBytes(base,file);
 }
 return bytes;
}

function record(){
 execFileSync(process.execPath,['tools/stamp-version.mjs'],{cwd:root,stdio:'inherit'});
 const contract=expectedContract();
 verifyCurrentFiles(contract);
 const receipt=baselineReceipt();
 for(const owner of owners)receipt[owner.key]=ownerReceipt(owner);
 const integrationSha256=Object.fromEntries(integrationFiles.filter(file=>file!==receiptFile).map(file=>[file,hash(read(file))]));
 receipt.approved191FollowupsIntegration={...contract,
  authorization:'User requested a new build on 2026-10-09 12:25 UTC: 새빌드 ㄱㄱ 테스트플라이트보고 괜찮으면 다시심사. Parent designated a single repo integration owner. Prepare/verify one combined source, then coordinate one main update and one existing automatic Cloud/TestFlight build. Keep 1.9.1 and Cloud-owned unique counter. No server redeploy, keys/DB changes, marketing-image replacement, review cancellation or new review submission before TestFlight user confirmation.',
  integrationSha256};
 writeFileSync(new URL(receiptFile,root),JSON.stringify(receipt,null,2)+'\n');
 verifyCombinedBoundary(receipt);
 console.log('Recorded exact PR139/140/141 sources, unchanged historical receipts and official generated stamps.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))record();
