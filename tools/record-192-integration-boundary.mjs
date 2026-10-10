/* 1.9.2 advances the release boundary; it never rewrites a 1.9.1 receipt.
 * All current baseline files remain exact unless pinned to an immutable owner
 * or one of the explicit integration/version transformations below.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,lstatSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export const base='83cc182db73ed1d63784e66321a066ccb2943994';
export const owners=[
 {pr:143,source:'f7e67d3938ea7debed4a61243f5743980f7d4249',files:[
  ".github/workflows/pdf-ocr-native-stress.yml",
  ".github/workflows/pdf-ocr.yml",
  "android/app/build.gradle",
  "android/app/src/androidTest/java/kr/io/breeze/app/PdfOcrAccuracyTest.java",
  "android/app/src/androidTest/java/kr/io/breeze/app/PdfOcrStressTest.java",
  "android/app/src/main/java/kr/io/breeze/app/BreezePdfOcrPlugin.java",
  "android/app/src/main/java/kr/io/breeze/app/MainActivity.java",
  "docs/decisions/003-pdf-highlight-geometry.md",
  "docs/decisions/021-scanned-pdf-ocr.md",
  "docs/qa/evidence/pdf-ocr-confirm-phone-light.png",
  "docs/qa/evidence/pdf-ocr-recovery-small-light.png",
  "docs/qa/evidence/pdf-ocr-vision-5600d0b.json",
  "docs/qa/evidence/pdf-ocr-vision-9e76421.json",
  "docs/qa/scanned-pdf-ocr-20261009.md",
  "docs/qa/scanned-pdf-ocr-stress-20261009.md",
  "index.html",
  "ios/App/App.xcodeproj/project.pbxproj",
  "ios/App/App/BreezePdfOcrPlugin.swift",
  "ios/App/App/SceneDelegate.swift",
  "landing/index.html",
  "package.json",
  "scripts/core/storage.js",
  "scripts/reader/original-session.js",
  "scripts/reader/pdf-ocr.js",
  "scripts/reader/pdf-original.js",
  "styles/reader.css",
  "sw.js",
  "tests/fixtures/pdf-ocr-stress/blank.png",
  "tests/fixtures/pdf-ocr-stress/blur-1.5.png",
  "tests/fixtures/pdf-ocr-stress/blur-4.png",
  "tests/fixtures/pdf-ocr-stress/blur-8.png",
  "tests/fixtures/pdf-ocr-stress/clipped-edges.png",
  "tests/fixtures/pdf-ocr-stress/dense.png",
  "tests/fixtures/pdf-ocr-stress/flattened-ink-overlap.png",
  "tests/fixtures/pdf-ocr-stress/huge-360.png",
  "tests/fixtures/pdf-ocr-stress/large-180.png",
  "tests/fixtures/pdf-ocr-stress/low-contrast.png",
  "tests/fixtures/pdf-ocr-stress/manifest.json",
  "tests/fixtures/pdf-ocr-stress/mixed-print-ink.png",
  "tests/fixtures/pdf-ocr-stress/print-48.png",
  "tests/fixtures/pdf-ocr-stress/repeated.png",
  "tests/fixtures/pdf-ocr-stress/rotation--13.png",
  "tests/fixtures/pdf-ocr-stress/rotation-180.png",
  "tests/fixtures/pdf-ocr-stress/rotation-270.png",
  "tests/fixtures/pdf-ocr-stress/rotation-7.png",
  "tests/fixtures/pdf-ocr-stress/rotation-90.png",
  "tests/fixtures/pdf-ocr-stress/scribbles-no-words.png",
  "tests/fixtures/pdf-ocr-stress/small-12.png",
  "tests/fixtures/pdf-ocr-stress/small-16.png",
  "tests/fixtures/pdf-ocr-stress/small-24.png",
  "tests/fixtures/pdf-ocr-stress/small-8.png",
  "tests/fixtures/pdf-ocr-stress/synthetic-ink-only.png",
  "tests/fixtures/pdf-ocr-stress/two-columns.png",
  "tests/helpers/generate-pdf-ocr-corpus.py",
  "tests/helpers/pdf-ocr-browser-stress.mjs",
  "tests/helpers/pdf-scan-fixture.mjs",
  "tests/native/CapacitorOcrTestBridge.swift",
  "tests/native/pdf-ocr-vision-main.swift",
  "tests/native/run-pdf-ocr-android.sh",
  "tests/native/run-pdf-ocr-vision.sh",
  "tests/score-pdf-ocr-stress.mjs",
  "tests/verify-pdf-ocr-browser.mjs",
  "tests/verify-pdf-ocr.mjs",
  "tests/verify-pdf-session-regressions.mjs",
  "tests/verify-pdf-visible-repaint.mjs"
]},
 {pr:144,source:'e2bf032af786c8c26e03a8222e135cc9dc3a220f',files:[
  '.github/workflows/memory-edit-filter.yml','docs/qa/memory-edit-filter-20261009.md',
  ...['after','before'].flatMap(stage=>['browser.log','chromium.json',
   'phone-dark-book-outside-tap.png','phone-dark-meaning-focused.png',
   'phone-light-book-outside-tap.png','phone-light-meaning-focused.png']
   .map(file=>'docs/qa/memory-edit-filter-20261009/'+stage+'/'+file)),
  'docs/qa/memory-edit-filter-20261009/frozen-boundary.log','docs/qa/memory-edit-filter-20261009/npm-test.log',
  'index.html','scripts/core/state.js','scripts/ui/wordbook.js','styles/surfaces.css',
  'styles/wordbook.css','sw.js','tests/verify-memory-edit-filter-browser.mjs']},
];
// Reviewed post-integration correction. Pin exact bytes and exact parent delta,
// rather than relaxing the original owner or protected-baseline checks.
const amendments=[{pr:146,parent:'f17971773eb57ffda0b17b520b3d7e57734f6a60',
 source:'40e5719457c5cf60a6545d994630d9b4fe1379d1',files:[
 'docs/decisions/021-scanned-pdf-ocr.md','index.html','scripts/reader/pdf-ink.js',
 'scripts/reader/pdf-ocr.js','sw.js','tests/verify-pdf-ink-regressions.mjs','tests/verify-pdf-ocr.mjs']},
 {pr:147,parent:'b72436a2311b9b4a78738abd2b9fa057ab529460',
 source:'acdd7c580a5cb88a53049d93021dc171fa5510d5',files:["docs/decisions/021-scanned-pdf-ocr.md", "index.html", "landing/index.html", "scripts/reader/pdf-ocr.js", "scripts/reader/pdf-original.js", "styles/reader.css", "sw.js", "tests/helpers/pdf-ocr-browser-stress.mjs", "tests/verify-pdf-ocr-browser.mjs", "tests/verify-pdf-session-regressions.mjs"]},
 {pr:147,parent:'e2566f49e4c05f1c9cd0b506378732d9643309b6',
 source:'28e6688d3214daf470be562faad7292113a43861',files:['tests/helpers/pdf-ocr-browser-stress.mjs']},
 {pr:147,parent:'50fe13ae3acf01d307d0af0365f8189680dd6a02',
 source:'8f45c9527c83d43eea9c42815d13938bb8003ccf',files:[".github/workflows/pdf-ocr.yml", "docs/decisions/021-scanned-pdf-ocr.md", "index.html", "landing/index.html", "package.json", "scripts/core/state.js", "scripts/library/library.js", "scripts/reader/pdf-ocr-library.js", "scripts/reader/pdf-ocr.js", "styles/home.css", "sw.js", "tests/helpers/pdf-ocr-browser-stress.mjs", "tests/verify-pdf-ocr-browser.mjs", "tests/verify-pdf-ocr-library-browser.mjs", "tests/verify-pdf-ocr-library.mjs", "tests/verify-pdf-ocr.mjs"]},
 {pr:147,parent:'6afc94d4dae7d535f65ad99e83e8876ae0479c2e',source:'c698e89ff69bdc44c988e0232d7d28fdb3dcb7dd',files:['tests/verify-pdf-ocr-browser.mjs','tests/verify-pdf-ocr-library-browser.mjs']}];
const receiptFile='docs/qa/breeze-192-integration/boundary.json';
const authorization='2026-10-10: owner requested direct continuation of OCR checks and 1.9.2 integration without Codex tasks. Pin OCR PR143 f7e67d3938ea7debed4a61243f5743980f7d4249 and Memory PR144 e2bf032af786c8c26e03a8222e135cc9dc3a220f. Publish the existing PR145 candidate for exact-head verification. Preserve all historical 1.9.1 receipts and assertions. Keep Android KVM execution and WebKit offline Blob failures visible; do not skip them. Main merge, release build and submission remain held pending review of those failures and unverified physical-device acceptance. User will supply the separate iPad grading screenshot. Amendment 2026-10-10 11:51 UTC: owner explicitly requested merging the native bridge fix, iOS TestFlight build 264 and an Android update. This adds only immutable PR146 source bytes; App Store review submission is not implied. Amendment 2026-10-10 13:06 UTC: owner requested removing only the OCR spelling-confirmation step so one tap opens the existing meaning. PR147 pins that exact implementation; no correction editor, new merge, build or deployment is authorized by that earlier instruction. Amendment 2026-10-10 13:28 UTC: owner explicitly approved implementing the bookshelf OCR page-count/progress design and uploading the next TestFlight build. Include local whole-book preparation, visible-page priority, nonblocking reading and no delayed tap replay. This authorizes the tested integration and next TestFlight build; App Store review submission remains separate.';
export const integrationFiles=[receiptFile,'tests/verify-192-integration-boundary.mjs',
 'tools/record-192-integration-boundary.mjs','docs/decisions/022-breeze-192-integration.md',
 'docs/qa/breeze-192-integration-20261009.md'];
const versionFiles=['ios/App/App.xcodeproj/project.pbxproj','tools/verify-ios-release.mjs',
 'tests/verify-ios-cloud-build.mjs','tools/ios-testflight.sh'];
const runnerFiles=['.github/workflows/design-brand.yml','.github/workflows/social-auth.yml','.github/workflows/integrity.yml'];
const generated=new Set(['index.html','sw.js']);
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const sourceBytes=(sha,file)=>git('show',sha+':'+file);
const read=file=>readFileSync(join(root,file));
const hash=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const stampable=file=>/\.(?:js|css)$/.test(file)||/(?:^|\/)assets\/favicon\/[^/]+\.(?:png|svg|ico)$/.test(file);
const normalized=(file,bytes)=>file==='index.html'?bytes.toString().replace(
 /(<(?:script|link|img)\b[^>]*?\b(?:src|href)=")(?!https?:|\/\/|data:|#)([^"?]+)\?v=[a-f0-9]{8}(")/g,
 (match,prefix,path,quote)=>stampable(path)?prefix+path+quote:match):
 file==='sw.js'?bytes.toString().replace(/const VERSION = '[^']*';/,"const VERSION = 'STAMP';"):bytes;
const tree=sha=>Object.fromEntries(git('ls-tree','-rz',sha).toString().split('\0').filter(Boolean).map(line=>{
 const [meta,file]=line.split('\t'),[mode,type,object]=meta.split(' ');
 assert.equal(type,'blob','Unsupported tree entry: '+file);return [file,{mode,object}];
}));

function expectedContract(){
 const files={};
 for(const owner of owners){
  assert.equal(git('merge-base',base,owner.source).toString().trim(),base,'Unexpected owner baseline');
  git('merge-base','--is-ancestor',owner.source,'HEAD');
  const changed=git('diff','--name-only',base,owner.source).toString().trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(changed,[...owner.files].sort(),'Unexpected immutable PR'+owner.pr+' scope');
  const ownerTree=tree(owner.source);
  for(const file of owner.files){
   assert.ok(ownerTree[file],'Source deletion needs separate review: '+file);
   if(files[file]){
    assert.ok(generated.has(file),'Unresolved owner overlap: '+file);
    // PR144 changes only generated stamps in these shared files.
    assert.equal(hash(normalized(file,sourceBytes(owner.source,file))),hash(normalized(file,sourceBytes(base,file))),
     'Unexpected shared semantic change in PR'+owner.pr+': '+file);
    continue;
   }
   files[file]={pr:owner.pr,source:owner.source,mode:ownerTree[file].mode,
    sha256:hash(normalized(file,sourceBytes(owner.source,file)))};
  }
 }
 for(const file of versionFiles){
  const source=files[file]?.source||base;
  const original=sourceBytes(source,file).toString();
  assert.ok(original.includes('1.9.1'),'Missing prior marketing version: '+file);
  files[file]={pr:'version-only',source,mode:tree(source)[file].mode,
   transformation:'replace every literal 1.9.1 with 1.9.2',sha256:hash(original.replaceAll('1.9.1','1.9.2'))};
 }
 for(const file of runnerFiles){
  const original=sourceBytes(base,file).toString();
  assert.ok(original.includes('tests/verify-integration-boundary.mjs'),'Missing historical runner: '+file);
  files[file]={pr:'runner-only',source:base,mode:tree(base)[file].mode,
   transformation:'replace tests/verify-integration-boundary.mjs with tests/verify-192-integration-boundary.mjs',
   sha256:hash(original.replaceAll('tests/verify-integration-boundary.mjs','tests/verify-192-integration-boundary.mjs'))};
 }
 for(const amendment of amendments){
  git('merge-base','--is-ancestor',amendment.parent,amendment.source);
  git('merge-base','--is-ancestor',amendment.source,'HEAD');
  const parents=git('rev-list','--parents','-n','1',amendment.source).toString().trim().split(' ').slice(1);
  assert.deepEqual(parents,[amendment.parent],'Unexpected amendment parent');
  const changed=git('diff','--name-only',amendment.parent,amendment.source).toString().trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(changed,[...amendment.files].sort(),'Unexpected immutable amendment scope');
  const amendmentTree=tree(amendment.source);
  for(const file of amendment.files){
   assert.ok(amendmentTree[file],'Amendment deletion needs separate review: '+file);
   files[file]={pr:amendment.pr,source:amendment.source,mode:amendmentTree[file].mode,
    sha256:hash(normalized(file,sourceBytes(amendment.source,file)))};
  }
 }
 return {schemaVersion:1,version:'1.9.2',base,owners,amendments,files,integrationFiles,authorization};
}

function verifyCurrent(contract){
 // No old receipt, verifier helper, protected source, config, key, release
 // request or native hook can change unless explicitly named above.
 const baseline=tree(base),permitted=new Set([...Object.keys(contract.files),...integrationFiles]);
 const changed=new Set([...git('diff','--name-only',base).toString().split('\n'),
  ...git('ls-files','--others','--exclude-standard').toString().split('\n')].filter(Boolean));
 for(const file of changed)assert.ok(permitted.has(file),'Unapproved 1.9.2 path: '+file);
 for(const [file,entry] of Object.entries(baseline)){
  if(permitted.has(file))continue;
  const stat=lstatSync(join(root,file));
  assert.ok(stat.isFile(),'Baseline file replaced by a symlink/directory: '+file);
  assert.equal(stat.mode&0o111?'100755':'100644',entry.mode,'Baseline mode changed: '+file);
  assert.equal(blob(read(file)),entry.object,'Protected 1.9.1 baseline bytes changed: '+file);
 }
 for(const [file,entry] of Object.entries(contract.files)){
  const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Reviewed file replaced by a symlink/directory: '+file);
  assert.equal(stat.mode&0o111?'100755':'100644',entry.mode,'Reviewed source mode changed: '+file);
  assert.equal(hash(normalized(file,read(file))),entry.sha256,'Reviewed PR'+entry.pr+' source bytes changed: '+file);
 }
 const html=read('index.html').toString();
 const local=/(<(?:script|link|img)\b[^>]*?\b(?:src|href)=")(?!https?:|\/\/|data:|#)([^"?]+)(?:\?([^"?]*))?(")/g;
 for(const match of html.matchAll(local)){
  if(!stampable(match[2]))continue;
  assert.equal(match[3],'v='+hash(read(match[2])).slice(0,8),'Resource stamp drift: '+match[2]);
 }
 const ready=['ready/index.html','ready/admin/index.html','ready/app.js','ready/admin/app.js','ready/ready.css'];
 const version=hash([html,...ready.map(file=>read(file).toString())].join('\n')).slice(0,8);
 assert.ok(read('sw.js').toString().includes("const VERSION = '"+version+"';"),'Generated worker version drift');
}

export function verify192Boundary(receipt){
 const expected=expectedContract();
 assert.deepEqual(Object.keys(receipt).sort(),[...Object.keys(expected),'integrationSha256'].sort(),
  'Unexpected 1.9.2 receipt fields');
 for(const key of Object.keys(expected))assert.deepEqual(receipt[key],expected[key],'Immutable 1.9.2 contract differs: '+key);
 verifyCurrent(expected);
 assert.deepEqual(Object.keys(receipt.integrationSha256).sort(),integrationFiles.filter(file=>file!==receiptFile).sort(),
  'Incomplete integration evidence');
 for(const [file,expectedHash] of Object.entries(receipt.integrationSha256)){
  assert.ok(lstatSync(join(root,file)).isFile(),'Integration evidence replaced by symlink/directory: '+file);
  assert.equal(hash(read(file)),expectedHash,'Reviewed integration evidence changed: '+file);
 }
 return receipt;
}

export function verifyHistorical191(){
 const scratch=mkdtempSync(join(tmpdir(),'breeze-191-historical-'));
 let registered=false;
 try{
  git('worktree','add','--quiet','--detach',scratch,base);registered=true;
  execFileSync(process.execPath,['tests/verify-integration-boundary.mjs'],{cwd:scratch,stdio:'inherit'});
 }finally{
  if(registered)git('worktree','remove','--force',scratch);
  else rmSync(scratch,{recursive:true,force:true});
 }
}

function record(){
 execFileSync(process.execPath,['tools/stamp-version.mjs'],{cwd:root,stdio:'inherit'});
 const contract=expectedContract();verifyCurrent(contract);
 const receipt={...contract,
  integrationSha256:Object.fromEntries(integrationFiles.filter(file=>file!==receiptFile).map(file=>[file,hash(read(file))]))};
 mkdirSync(join(root,'docs/qa/breeze-192-integration'),{recursive:true});
 writeFileSync(join(root,receiptFile),JSON.stringify(receipt,null,2)+'\n');
 verify192Boundary(receipt);
 console.log('Recorded exact PR143/144 sources and 1.9.2 version delta; every other 1.9.1 byte remains pinned.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))record();
