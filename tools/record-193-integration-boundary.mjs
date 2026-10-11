/* Pin reviewed 1.9.3 sources without modifying historical release contracts. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,lstatSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const base='8512e8fd25e51d6aa06cf926bad165d5c3994865';
export const owners=[
  {
    "pr": 149,
    "source": "aebbad7446a5b85a794a632cfa8f5b39cd972415",
    "files": [
      ".github/workflows/study-sets.yml",
      "docs/decisions/023-vocabulary-study-sets.md",
      "docs/qa/vocabulary-study-sets-20261011.md",
      "index.html",
      "package.json",
      "scripts/core/state.js",
      "scripts/core/study-sets-storage.js",
      "scripts/core/study-sets.js",
      "scripts/dictionary/dictionary.js",
      "scripts/ui/study-sets.js",
      "scripts/ui/vocabulary-review.js",
      "styles/study-sets.css",
      "styles/surfaces.css",
      "styles/wordbook.css",
      "sw.js",
      "tests/capture-study-sets-browser.mjs",
      "tests/verify-client-polish-browser.mjs",
      "tests/verify-design-memory-browser.mjs",
      "tests/verify-home-controls-browser.mjs",
      "tests/verify-simple-word-cards-browser.mjs",
      "tests/verify-structure.mjs",
      "tests/verify-study-sets-browser.mjs",
      "tests/verify-study-sets-storage.mjs",
      "tests/verify-study-sets-ui.mjs",
      "tests/verify-study-sets.mjs",
      "tests/verify-vocabulary-review-browser.mjs",
      "tests/verify-wordbook-browser.mjs"
    ]
  },
  {
    "pr": 150,
    "source": "fc8a94d20f6f4009ed89998c2627aef91c72dc23",
    "files": [
      ".github/workflows/word-retry-recovery.yml",
      "docs/decisions/002-dictionary-panel-reading-anchor.md",
      "docs/decisions/011-word-lookup-recovery.md",
      "index.html",
      "scripts/dictionary/dictionary.js",
      "sw.js",
      "tests/verify-word-lifecycle.mjs",
      "tests/verify-word-presentation-browser.mjs",
      "tests/verify-word-repeat-tap-browser.mjs",
      "tests/verify-word-scroll-idle-browser.mjs"
    ]
  },
  {
    "pr": 151,
    "source": "990cb810452eb80f4e819411233ca439e1f8ddaa",
    "files": [
      ".github/workflows/text-rotation.yml",
      "docs/decisions/023-text-rotation-source-anchor.md",
      "index.html",
      "package.json",
      "scripts/core/state.js",
      "scripts/reader/reader.js",
      "sw.js",
      "tests/helpers/text-rotation-source.mjs",
      "tests/verify-text-rotation-browser.mjs",
      "tests/verify-text-rotation.mjs"
    ]
  }
];
const receiptFile='docs/qa/breeze-193-integration/boundary.json';
export const integrationFiles=[receiptFile,'tools/record-193-integration-boundary.mjs','tests/verify-193-integration-boundary.mjs','docs/decisions/024-breeze-193-integration.md'];
const versionFiles=['ios/App/App.xcodeproj/project.pbxproj','tools/verify-ios-release.mjs','tests/verify-ios-cloud-build.mjs','tools/ios-testflight.sh'];
const runnerFiles=['.github/workflows/design-brand.yml','.github/workflows/social-auth.yml','.github/workflows/integrity.yml'];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const bytes=(sha,file)=>git('show',sha+':'+file);
const read=file=>readFileSync(join(root,file));
const hash=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const stampable=file=>/\.(?:js|css)$/.test(file)||/(?:^|\/)assets\/favicon\/[^/]+\.(?:png|svg|ico)$/.test(file);
const normalize=(file,value)=>file==='index.html'?value.toString().replace(/(<(?:script|link|img)\b[^>]*?\b(?:src|href)=")(?!https?:|\/\/|data:|#)([^"?]+)\?v=[a-f0-9]{8}(")/g,(match,prefix,path,quote)=>stampable(path)?prefix+path+quote:match):file==='sw.js'?value.toString().replace(/const VERSION = '[^']*';/,"const VERSION = 'STAMP';"):value;
const tree=sha=>Object.fromEntries(git('ls-tree','-rz',sha).toString().split('\0').filter(Boolean).map(line=>{const [meta,file]=line.split('\t'),[mode,type,object]=meta.split(' ');assert.equal(type,'blob');return [file,{mode,object}];}));
function mergeText(file,left,right){
 const scratch=mkdtempSync(join(tmpdir(),'breeze-193-merge-'));
 try{for(const [name,data] of [['ours',left],['base',bytes(base,file)],['theirs',right]]){assert.equal(Buffer.from(data.toString()).equals(Buffer.from(data)),true,'Binary overlap requires separate review: '+file);writeFileSync(join(scratch,name),data);}
  return execFileSync('git',['merge-file','--stdout',join(scratch,'ours'),join(scratch,'base'),join(scratch,'theirs')]);
 }catch(error){throw new Error('Unresolved owner overlap: '+file,{cause:error});}finally{rmSync(scratch,{recursive:true,force:true});}
}
export function expectedContract(){
 const sources={},files={};
 for(const owner of owners){
  assert.equal(git('merge-base',base,owner.source).toString().trim(),base,'Unexpected PR baseline');
  git('merge-base','--is-ancestor',owner.source,'HEAD');
  const changed=git('diff','--name-only',base,owner.source).toString().trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(changed,[...owner.files].sort(),'Immutable PR scope changed: '+owner.pr);
  const snapshot=tree(owner.source);
  for(const file of owner.files){assert.ok(snapshot[file],'Owner deletion requires explicit review: '+file);assert.equal(snapshot[file].mode,'100644','Unexpected source mode: '+file);(sources[file]??=[]).push(owner);}
 }
 for(const [file,list] of Object.entries(sources)){
  let expected=normalize(file,bytes(list[0].source,file)),method='exact owner bytes';
  for(const owner of list.slice(1)){
   const incoming=normalize(file,bytes(owner.source,file));
   if(hash(incoming)===hash(expected))continue;
   if(file==='index.html'||file==='sw.js'){
    assert.equal(hash(incoming),hash(normalize(file,bytes(base,file))),'Second owner changed shared generated semantics: '+file);method='first semantic owner; later owners change stamps only';
   }else if(file==='package.json'){
    const before='tests/verify-epub-navigation-motion.mjs tests/verify-text-anchor-restoration.mjs';
    const after=before+' tests/verify-text-rotation.mjs';
    assert.equal(owner.pr,151);assert.equal(incoming.toString(),bytes(base,file).toString().replace(before,after),'Unexpected rotation package change');
    assert.equal(expected.toString().split(before).length,2);expected=expected.toString().replace(before,after);method='PR149 test prefix plus exact PR151 rotation-test insertion';
   }else{expected=mergeText(file,expected,incoming);method='conflict-free git three-way merge against immutable base';}
  }
  files[file]={sources:list.map(({pr,source})=>({pr,source})),mode:'100644',method,sha256:hash(expected)};
 }
 for(const file of versionFiles){assert.ok(!files[file],'Version source overlap requires review');const original=bytes(base,file).toString();assert.ok(original.includes('1.9.2'));files[file]={source:base,mode:tree(base)[file].mode,method:'replace every literal 1.9.2 with 1.9.3; build253 unchanged',sha256:hash(original.replaceAll('1.9.2','1.9.3'))};}
 for(const file of runnerFiles){assert.ok(!files[file]);const original=bytes(base,file).toString();assert.ok(original.includes('tests/verify-192-integration-boundary.mjs'));files[file]={source:base,mode:tree(base)[file].mode,method:'select new 1.9.3 verifier; historical 1.9.2 verifier remains unchanged',sha256:hash(original.replaceAll('tests/verify-192-integration-boundary.mjs','tests/verify-193-integration-boundary.mjs'))};}
 return {schemaVersion:1,version:'1.9.3',base,owners,files,integrationFiles};
}
function verifyCurrent(contract){
 const baseline=tree(base),permitted=new Set([...Object.keys(contract.files),...integrationFiles]);
 const changed=new Set([...git('diff','--name-only',base).toString().split('\n'),...git('ls-files','--others','--exclude-standard').toString().split('\n')].filter(Boolean));
 for(const file of changed)assert.ok(permitted.has(file),'Unapproved 1.9.3 path: '+file);
 for(const [file,entry] of Object.entries(baseline)){
  if(permitted.has(file))continue;
  const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Protected baseline replaced: '+file);
  assert.equal(stat.mode&0o111?'100755':'100644',entry.mode,'Protected mode drift: '+file);
  assert.equal(blob(read(file)),entry.object,'Protected 1.9.2 bytes changed: '+file);
 }
 for(const [file,entry] of Object.entries(contract.files)){
  const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Source replaced: '+file);assert.equal(stat.mode&0o111?'100755':'100644',entry.mode,'Source mode drift: '+file);
  assert.equal(hash(normalize(file,read(file))),entry.sha256,'Reviewed source or exact integration delta changed: '+file);
 }
 const html=read('index.html').toString(),local=/(<(?:script|link|img)\b[^>]*?\b(?:src|href)=")(?!https?:|\/\/|data:|#)([^"?]+)(?:\?([^"?]*))?(")/g;
 for(const match of html.matchAll(local))if(stampable(match[2]))assert.equal(match[3],'v='+hash(read(match[2])).slice(0,8),'Asset stamp drift: '+match[2]);
 const ready=['ready/index.html','ready/admin/index.html','ready/app.js','ready/admin/app.js','ready/ready.css'];
 const version=hash([html,...ready.map(file=>read(file).toString())].join('\n')).slice(0,8);
 assert.ok(read('sw.js').toString().includes("const VERSION = '"+version+"';"),'Worker version drift');
}
function verifyEvidenceFile(file){
 const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Integration evidence must be a regular file: '+file);
 assert.equal(stat.mode&0o111?'100755':'100644','100644','Integration evidence mode drift: '+file);
}
export function verify193Boundary(receipt){
 for(const file of integrationFiles)verifyEvidenceFile(file);
 const expected=expectedContract();assert.deepEqual(Object.keys(receipt).sort(),[...Object.keys(expected),'integrationSha256'].sort());
 for(const key of Object.keys(expected))assert.deepEqual(receipt[key],expected[key],'Immutable 1.9.3 contract differs: '+key);
 verifyCurrent(expected);
 assert.deepEqual(Object.keys(receipt.integrationSha256).sort(),integrationFiles.filter(file=>file!==receiptFile).sort());
 for(const [file,value] of Object.entries(receipt.integrationSha256)){assert.ok(lstatSync(join(root,file)).isFile());assert.equal(hash(read(file)),value,'Integration evidence drift: '+file);}
}
export function verifyHistorical192(){
 const scratch=mkdtempSync(join(tmpdir(),'breeze-192-historical-'));let registered=false;
 try{git('worktree','add','--quiet','--detach',scratch,base);registered=true;execFileSync(process.execPath,['tests/verify-192-integration-boundary.mjs'],{cwd:scratch,stdio:'inherit'});}
 finally{if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
}
function record(){
 execFileSync(process.execPath,['tools/stamp-version.mjs'],{cwd:root,stdio:'inherit'});
 for(const file of integrationFiles)if(file!==receiptFile||lstatSync(join(root,file),{throwIfNoEntry:false}))verifyEvidenceFile(file);
 const contract=expectedContract();verifyCurrent(contract);
 const receipt={...contract,integrationSha256:Object.fromEntries(integrationFiles.filter(file=>file!==receiptFile).map(file=>[file,hash(read(file))]))};
 mkdirSync(join(root,'docs/qa/breeze-193-integration'),{recursive:true});writeFileSync(join(root,receiptFile),JSON.stringify(receipt,null,2)+'\n');verify193Boundary(receipt);console.log('Recorded exact PR149/150/151 and restricted 1.9.3 deltas.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))record();
