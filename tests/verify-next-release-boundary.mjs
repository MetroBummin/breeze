// Approved release integration, typed-test hold, study completion, word-only display hold,
// and account learning isolation/incremental persistence (decision033,2026-10-15).
// Historical export/release guards run unchanged on their exact source commits.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// The old release allowlist had already drifted on main. Freeze this approved
// feature against its fetched main base; keep the original historical gate below.
const base='fd67f0a0f6f09be247f371d085ad097aea304784';
const historicalBase='19bbb8d840df5129f4224f38093b8aa0b443f002';
const guard='tests/verify-next-release-boundary.mjs';
const expected={
  ".github/workflows/account-learning.yml": "df955b4e0b1639099e01bda6cf36e75581c19170e9014f4b5b1b41102c9a2d9e",
  "SYNC.md": "b3a5a47153a6fd4b2a38cf6ad20c0a32a9e3af28ebbd1e75df10262b3da8729c",
  "docs/decisions/002-dictionary-panel-reading-anchor.md": "4ff235a3d15172ed65223bf04ea30110a5ce6eed77be622e76d7220f477faa13",
  "docs/decisions/007-word-item-storage.md": "b3230b0817b18964cc0afdb3f02ce8a886787b6fec14b64ece8d3e52f9dca582",
  "docs/decisions/023-vocabulary-study-sets.md": "c22f5ad4fd9cf5be584a827ab54cfd1d4fbd6286e1434bae9751196c042c72c6",
  "docs/decisions/031-vocabulary-test.md": "f9a6a46151df7a40a941c502d6d18504e4a627f1ed80f91193cd5c0f66cd1434",
  "docs/decisions/033-account-learning-data.md": "17e414173ca999fdf9c91075b0cdd5baa439e84ab797b23e51008fb82660cc35",
  "docs/qa/account-learning-20261015.md": "b546212d8121355c2a8bc39b92b8abf9ce6a7c7b624350d495438a43fc83dd02",
  "docs/sync.html": "357013a3d668517237160b8040f576e02ebbfb1c1c5ba91ee9d6d1b84c0698ad",
  "index.html": "5faa32cdd2f71870785b00a029ff8aa4a88d5363e554c5ae0cbfd8d6fa43886b",
  "package.json": "a38f396245627575ce159e93e081ef2465988e309631962fcfc8987db7d998e1",
  "scripts/core/account-scope.js": "ad961c4cdbfe3caabae89b7055c454ce34b07309951edd6fd4319475341b1c7e",
  "scripts/core/state.js": "b7d537a395bc8a87d31c7ef35feffaef926530469ad5162fc78b638acdef903e",
  "scripts/core/study-sets-storage.js": "4c8438c26cc0abed1db6412d28300420ef116bc32bff9cc05c873fb49153a9f3",
  "scripts/core/study-sets.js": "13c27671b5fc73f7b1fe69d9a8394a0fded426e7dfea56c49b0c8b57a02cb626",
  "scripts/core/vocabulary-test-storage.js": "a29693471e1b8e5ef28258b4149e9872f0d9c0b11bea220cb7ae3e2a98b7f72f",
  "scripts/core/word-integrity.js": "26df65911266aed4eccbbde3b3ffd4ff17edb8aa3c973e9d0ec39496aad99292",
  "scripts/dictionary/dictionary.js": "ff8a87cdfdb40d2e7c5174442ea9076c807e3714736e8284abf1d6402a5a6d04",
  "scripts/dictionary/easy-explanation.js": "fc76e90ee36f765eec4c34328b888eb016b3c6890dc9266adb8a4adc419d591a",
  "scripts/sync/learning-sync.js": "4a39c4f0ae622580633715d52880254290eb661ffc2b8297b3eaff796b33af15",
  "scripts/sync/sync.js": "96ad75e42ab3da5dc7eb12e3a8cd3ed2c0ef95d77f7f60b35d2e5e4dd76fc5dc",
  "scripts/ui/study-set-test.js": "b2b398a8d862bb059c56834ec34618c5f89046e7e1075dc6c0695016493e8e42",
  "scripts/ui/study-sets.js": "5964f04a512fe00ec08583a6026acec78219f6d700ecb211d15f1ebe391acb68",
  "scripts/ui/vocabulary-review.js": "9c80dddb6f978b77a403284d87b843681d05c4ca51885287567a2c27b27defb7",
  "scripts/ui/wordbook.js": "6a635eaf84c4912d1cce486bb88fd64b871c6cb3a3439d76ad02c299da925803",
  "server/sync/study-state.sql": "158ea25b80c8ccebeaa353ce297ab3e9de657b056d727142133fcd85384b9eb4",
  "server/sync/wordbook-patch.sql": "66d8fdec07152bd1c52d3917c914e11290e213b4dc4a8724545df9d40951dfd5",
  "sw.js": "856c951a7ce57b2d4241c94d36f44efac30e920bc05f8e474d0cc8e695184e77",
  "tests/sync-test-transport.mjs": "ff08f8ca16a7ff728e865511d3b092e9f24768d75ba49334bdb9e62a74de29dd",
  "tests/verify-account-scope-browser.mjs": "99fff7f912e890bcd0d5101c593b4031a00decd6765a90af423365ffcb40ca3e",
  "tests/verify-account-scope.mjs": "2fc11dd9044d04ad8a9c3645a5520ac60256445bcef88e9056d5f005a853e992",
  "tests/verify-dictionary-account-scope.mjs": "c5ac692c86ee24f752182a7c3e46f23b3eaa23dca9daf28efaa547a16fd36d71",
  "tests/verify-incremental-word-browser.mjs": "14217eea03225be8af4ea826a4a4268d58200a7b72524c8b3b5682dfb13d24e7",
  "tests/verify-incremental-word-save.mjs": "5ff45c338dd1c10d852b0e0aebca6d0be0c55c82303295cda7de4e7ec6d08b21",
  "tests/verify-learning-sync-sql.mjs": "2e872df5f9364dff26e1263469826663c2c90f1bace91ceade4c79efee5098b7",
  "tests/verify-learning-sync.mjs": "8eea53b910fd3a5948eb295fa2db17f48489a9243d0c415d607ba49812be54f4",
  "tests/verify-lookup-work-browser.mjs": "8612ed2e161894a3d9d0be9882e7081a6c567ba2ba6b21420a888f1336bb0620",
  "tests/verify-structure.mjs": "e3a98ff8240eaf86a1d708ec5caf90548d9d80b01857cf8866dd910338cb3df3",
  "tests/verify-study-account-storage.mjs": "2e6f30a1fb7063b028b95be55c04b68e7523019d1fc826f3247ab6c8d503fceb",
  "tests/verify-study-create-browser.mjs": "9c1fe4bd0865c1abf7f34fd20a42ed440ebc5c1c2e579f3d89f0545c8a909c6c",
  "tests/verify-study-quota-browser.mjs": "1c92efd027097393ea12ede9d54bada35d21280fb6e0018543f6f0837a3ed25c",
  "tests/verify-study-sets-account-merge.mjs": "c25223fdc15c5ab5b2d6e45e4fb082c6746aba8ea47cf83088771a94882fc7b5",
  "tests/verify-study-sets-browser.mjs": "ff7af4472b1e68b09de2da2940c8b51b9879180c6c9d2a79895b919203f29996",
  "tests/verify-study-sets-storage.mjs": "a828a74ccb5f1e5e2f9a85001b109e3b33755efb343e507644a96b1389bdd766",
  "tests/verify-study-sets-ui.mjs": "0b240d9efb981f730a205726cb67a1d0678839645db870e1d9c5e53623790cdb",
  "tests/verify-study-sets.mjs": "31d03b9465c7a10ea4adf713c75342157702eb325562733cbfff1b27265bc116",
  "tests/verify-vocabulary-review-browser.mjs": "26a437ae74d1e115cf836351a78f25b37f3c712284dfac635ffa620543d55253",
  "tests/verify-vocabulary-test-browser.mjs": "de4665a46c8358e7aeaaf8579f79540ad017f7749d43f147ad16c6e55a1133e1",
  "tests/verify-vocabulary-test-storage.mjs": "cd33119fe82eea784c4216ddaf3ef43a44eb7083e6fe452c9ba0c4aca34a019f",
  "tests/verify-word-lifecycle.mjs": "80247cad86b4b7b8ad7c9fb478191d12a17479930e88d8c1730f49e416719517",
  "tests/verify-word-presentation-browser.mjs": "3b302dc72e997b08d47ec0b0e57a4120742f283237c4390d735f2328abdba439",
  "tests/verify-wordbook-patch-sql.mjs": "1c491c30a20e39e616c4877109a53e6339ca4e586cfeb1ce94e6ca71a5dad551"
};
const runners=[".github/workflows/integrity.yml", ".github/workflows/design-brand.yml", ".github/workflows/social-auth.yml"];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const baseline=new Map(git('ls-tree','-rz',base).toString().split('\0').filter(Boolean).map(line=>{
 const [meta,file]=line.split('\t'),[mode,type,hash]=meta.split(' ');assert.equal(type,'blob');return [file,{mode,hash}];
}));
for(const file of runners)expected[file]=sha(Buffer.from(git('show',base+':'+file).toString().replaceAll('tests/verify-vocabulary-export-boundary.mjs',guard)));
const paths=new Set([...baseline.keys(),...git('ls-files','-z','--cached','--others','--exclude-standard').toString().split('\0').filter(Boolean)]);
const current=new Map([...paths].map(file=>{
 const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Expected regular file: '+file);
 const bytes=readFileSync(join(root,file));return [file,{mode:stat.mode&0o111?'100755':'100644',hash:blob(bytes),sha256:sha(bytes)}];
}));
function verify(entries){
 for(const [file,entry] of entries){
  const before=baseline.get(file);assert.ok(before||Object.hasOwn(expected,file)||file===guard,'Unapproved path: '+file);
  assert.equal(entry.mode,before?.mode||'100644','Mode drift: '+file);
  if(Object.hasOwn(expected,file))assert.equal(entry.sha256,expected[file],'Approved source changed: '+file);
  else if(file!==guard)assert.equal(entry.hash,before.hash,'Source outside approved scope changed: '+file);
 }
 for(const file of [...baseline.keys(),...Object.keys(expected),guard])assert.ok(entries.has(file),'Missing source: '+file);
}
git('merge-base','--is-ancestor',base,'HEAD');verify(current);
assert.match(readFileSync(join(root,'scripts/core/vocabulary-test.js'),'utf8'),/const ENABLED=false;/);
assert.match(readFileSync(join(root,'scripts/dictionary/vocabulary-test-grading.js'),'utf8'),/const VOCABULARY_TEST_REMOTE_ENABLED=false;/);
assert.match(readFileSync(join(root,'server/dict/vocabulary-test.ts'),'utf8'),/const VOCABULARY_TEST_GRADING_ENABLED = false;/);
for(const file of ['scripts/reader/pdf-original.js','ios/App/App.xcodeproj/project.pbxproj','package.json','tests/verify-vocabulary-export-boundary.mjs',...runners]){
 const changed=new Map(current);changed.set(file,{...changed.get(file),hash:'0'.repeat(40),sha256:'0'.repeat(64)});assert.throws(()=>verify(changed),/changed/);
}
const unknown=new Map(current);unknown.set('unapproved.js',{mode:'100644',hash:''});assert.throws(()=>verify(unknown),/Unapproved/);
const executable=new Map(current);executable.set(guard,{...executable.get(guard),mode:'100755'});assert.throws(()=>verify(executable),/Mode drift/);
const missing=new Map(current);missing.delete('scripts/reader/pdf-original.js');assert.throws(()=>verify(missing),/Missing/);
const scratch=mkdtempSync(join(tmpdir(),'breeze-next-export-'));let registered=false;
try{
 git('worktree','add','--quiet','--detach',scratch,historicalBase);registered=true;
 execFileSync(process.execPath,['tests/verify-vocabulary-export-boundary.mjs'],{cwd:scratch,stdio:'inherit'});
}finally{if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
console.log('Exact approved integration/account-learning source passed; native release and disabled grading/historical gates remain protected.');
