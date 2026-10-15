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
  ".github/workflows/account-learning.yml": "2f7a103c7f847aace27c8ea612d31068159fe443abe24ebd10e3d175f8dec272",
  ".github/workflows/social-import.yml": "b5a749685790947297724b74a44e4b2e3ae827c20826cb6935be90ef34dc4111",
  "SYNC.md": "b3a5a47153a6fd4b2a38cf6ad20c0a32a9e3af28ebbd1e75df10262b3da8729c",
  "docs/decisions/002-dictionary-panel-reading-anchor.md": "4ff235a3d15172ed65223bf04ea30110a5ce6eed77be622e76d7220f477faa13",
  "docs/decisions/007-word-item-storage.md": "b3230b0817b18964cc0afdb3f02ce8a886787b6fec14b64ece8d3e52f9dca582",
  "docs/decisions/008-web-content-ingestion.md": "b2b424b96c6c7b5fec5d4d0658a12f76b0fb9ff1c2919d31e84cdf8838f4df3a",
  "docs/decisions/023-vocabulary-study-sets.md": "c22f5ad4fd9cf5be584a827ab54cfd1d4fbd6286e1434bae9751196c042c72c6",
  "docs/decisions/031-vocabulary-test.md": "f9a6a46151df7a40a941c502d6d18504e4a627f1ed80f91193cd5c0f66cd1434",
  "docs/decisions/032-next-ios-android-release.md": "b0da4f94e3cbcdb386122394669e8f79972828a67d4834d2bd1642cec78a5cb3",
  "docs/decisions/033-account-learning-data.md": "17e414173ca999fdf9c91075b0cdd5baa439e84ab797b23e51008fb82660cc35",
  "docs/qa/account-learning-20261015.md": "9df0549e17ffa6abb32666207cd7ee6d7287811a4fa0aec2392ba8fd0840874c",
  "docs/sync.html": "357013a3d668517237160b8040f576e02ebbfb1c1c5ba91ee9d6d1b84c0698ad",
  "index.html": "45b1150f213a481221ea89c47705cff95e392d03308f4b2e2039dfc3de5f6ec4",
  "ios/App/App.xcodeproj/project.pbxproj": "c33b4d06986c7b23df3cc4d808efb341a83a7acd38ebc051b8a2de9476982b9c",
  "package.json": "a38f396245627575ce159e93e081ef2465988e309631962fcfc8987db7d998e1",
  "scripts/core/account-scope.js": "ad961c4cdbfe3caabae89b7055c454ce34b07309951edd6fd4319475341b1c7e",
  "scripts/core/state.js": "b7d537a395bc8a87d31c7ef35feffaef926530469ad5162fc78b638acdef903e",
  "scripts/core/study-sets-storage.js": "4c8438c26cc0abed1db6412d28300420ef116bc32bff9cc05c873fb49153a9f3",
  "scripts/core/study-sets.js": "13c27671b5fc73f7b1fe69d9a8394a0fded426e7dfea56c49b0c8b57a02cb626",
  "scripts/core/vocabulary-test-storage.js": "a29693471e1b8e5ef28258b4149e9872f0d9c0b11bea220cb7ae3e2a98b7f72f",
  "scripts/core/word-integrity.js": "26df65911266aed4eccbbde3b3ffd4ff17edb8aa3c973e9d0ec39496aad99292",
  "scripts/dictionary/dictionary.js": "ff8a87cdfdb40d2e7c5174442ea9076c807e3714736e8284abf1d6402a5a6d04",
  "scripts/dictionary/easy-explanation.js": "fc76e90ee36f765eec4c34328b888eb016b3c6890dc9266adb8a4adc419d591a",
  "scripts/importers/social.js": "0278bfd4ef980dd3deaf307956eea4480dcf211966094cc294901a0260e6a731",
  "scripts/sync/learning-sync.js": "4a39c4f0ae622580633715d52880254290eb661ffc2b8297b3eaff796b33af15",
  "scripts/sync/sync.js": "96ad75e42ab3da5dc7eb12e3a8cd3ed2c0ef95d77f7f60b35d2e5e4dd76fc5dc",
  "scripts/ui/study-set-test.js": "b2b398a8d862bb059c56834ec34618c5f89046e7e1075dc6c0695016493e8e42",
  "scripts/ui/study-sets.js": "477c7db8b4d85f811b92143291d499eab5604e465a77fe1416c9af69538724d2",
  "scripts/ui/vocabulary-review.js": "9c80dddb6f978b77a403284d87b843681d05c4ca51885287567a2c27b27defb7",
  "scripts/ui/wordbook.js": "6a635eaf84c4912d1cce486bb88fd64b871c6cb3a3439d76ad02c299da925803",
  "server/article/index.ts": "078924bf25202e60c88b0aac129dbda3a359255cbed43aee6d949fb355dcc0f0",
  "server/sync/study-state.sql": "158ea25b80c8ccebeaa353ce297ab3e9de657b056d727142133fcd85384b9eb4",
  "server/sync/wordbook-patch.sql": "66d8fdec07152bd1c52d3917c914e11290e213b4dc4a8724545df9d40951dfd5",
  "sw.js": "0b957f896931aca95bb55e8629470ca6cb6b3dd6cc329f1da63fad01b30271ff",
  "tests/measure-study-sets-list-browser.mjs": "47d27c32201925399ad8eb28f63e9d3dfcb5dd7208805564ed7e423d0b68d21d",
  "tests/sync-test-transport.mjs": "ff08f8ca16a7ff728e865511d3b092e9f24768d75ba49334bdb9e62a74de29dd",
  "tests/verify-account-scope-browser.mjs": "f9d38eefc7437502c1d124f46c07c402141787c9ecfe40abc2311594e5a5dafb",
  "tests/verify-account-scope.mjs": "2fc11dd9044d04ad8a9c3645a5520ac60256445bcef88e9056d5f005a853e992",
  "tests/verify-dictionary-account-scope.mjs": "c5ac692c86ee24f752182a7c3e46f23b3eaa23dca9daf28efaa547a16fd36d71",
  "tests/verify-incremental-word-browser.mjs": "b386ef4d23cb6de424d7b320d2762e94d111fc58a0dd1869126fa8e5fcc58fef",
  "tests/verify-incremental-word-save.mjs": "5ff45c338dd1c10d852b0e0aebca6d0be0c55c82303295cda7de4e7ec6d08b21",
  "tests/verify-ios-cloud-build.mjs": "7676c6f4c367637a5280171e06cde0f8e2cba8204ea7e8d6553d1d52c5e10f79",
  "tests/verify-learning-sync-sql.mjs": "2e872df5f9364dff26e1263469826663c2c90f1bace91ceade4c79efee5098b7",
  "tests/verify-learning-sync.mjs": "8eea53b910fd3a5948eb295fa2db17f48489a9243d0c415d607ba49812be54f4",
  "tests/verify-library-refresh-browser.mjs": "4f20734fe2e58d227a8af20760234d2f59fd0d32bf06821ef96c487e9d7ba903",
  "tests/verify-lookup-work-browser.mjs": "8612ed2e161894a3d9d0be9882e7081a6c567ba2ba6b21420a888f1336bb0620",
  "tests/verify-memory-edit-filter-browser.mjs": "e7b45b6d9f6ed80b5772ea6401d8b44d5d419de395ff9f73a6303c07d4d071e3",
  "tests/verify-onboarding-study-browser.mjs": "9e6a9bd5c99e6b9b719581a2a096b6fcaae13d92b01bcd016770be8f846d44f7",
  "tests/verify-pdf-pending-pinch-browser.mjs": "b9036b8f051e3f0cf28989dc5ea4ddb50375af5c4e5183ad1d68113974ae7d19",
  "tests/verify-pdf-pinch-browser.mjs": "328b2af30c9addbb53f5b553084990371ba8ac0d95b4899c37f3cbd387197d26",
  "tests/verify-sentence-help-browser.mjs": "a58c923aa985532f2ab16781750f33fe6cf9738b7defb93791f175691bea9a25",
  "tests/verify-simple-word-cards-browser.mjs": "a6ad71bbaed4c4428c8b2e363be0eb7968f25c977d2c9fb5c3714126a6de5c00",
  "tests/verify-social-content.mjs": "aa6615a2a9ca6644dc8c49d1810c2356b23d9803e47ce07f1af8bbddcb9a1170",
  "tests/verify-social-import-browser.mjs": "7b437ca75c7790013c14fdde96d07d1ca639aae54a93a3586bb0a777bc374f4a",
  "tests/verify-social-import-server.mjs": "be3b58cc8457569f11af548c748d7643a4b97e9f189a17673ea8fb44aa2df104",
  "tests/verify-social-inline.mjs": "5aeb7647df8327c402a373b60c9849e173590ef046d4c5e2352c7613397081d1",
  "tests/verify-structure.mjs": "e3a98ff8240eaf86a1d708ec5caf90548d9d80b01857cf8866dd910338cb3df3",
  "tests/verify-study-account-storage.mjs": "2e6f30a1fb7063b028b95be55c04b68e7523019d1fc826f3247ab6c8d503fceb",
  "tests/verify-study-completion-browser.mjs": "8fc6fac3cf17dbe035b36508c9d872d1064bda2e6c5fb8fa48a425a30274c73f",
  "tests/verify-study-create-browser.mjs": "9c1fe4bd0865c1abf7f34fd20a42ed440ebc5c1c2e579f3d89f0545c8a909c6c",
  "tests/verify-study-motion-browser.mjs": "f0985db2b4413d696486d50244c44ca5adc2e0a042d8880c7302d88185244736",
  "tests/verify-study-quota-browser.mjs": "1c92efd027097393ea12ede9d54bada35d21280fb6e0018543f6f0837a3ed25c",
  "tests/verify-study-sets-account-merge.mjs": "c25223fdc15c5ab5b2d6e45e4fb082c6746aba8ea47cf83088771a94882fc7b5",
  "tests/verify-study-sets-browser.mjs": "cee77d0dacd1dc8e39840b7506ae040182fd47b6cd6de96209b5437944d266fb",
  "tests/verify-study-sets-storage.mjs": "a828a74ccb5f1e5e2f9a85001b109e3b33755efb343e507644a96b1389bdd766",
  "tests/verify-study-sets-ui.mjs": "faec80a9af292439800eb9b9a54effdd506cde7cf10aec590a92c173203c40b4",
  "tests/verify-study-sets.mjs": "31d03b9465c7a10ea4adf713c75342157702eb325562733cbfff1b27265bc116",
  "tests/verify-vocabulary-review-browser.mjs": "26a437ae74d1e115cf836351a78f25b37f3c712284dfac635ffa620543d55253",
  "tests/verify-vocabulary-test-browser.mjs": "de4665a46c8358e7aeaaf8579f79540ad017f7749d43f147ad16c6e55a1133e1",
  "tests/verify-vocabulary-test-storage.mjs": "cd33119fe82eea784c4216ddaf3ef43a44eb7083e6fe452c9ba0c4aca34a019f",
  "tests/verify-word-arrival-browser.mjs": "6087b609226fe314e1973eb6797f0a3ec4fe8d286299f7ad93d1a29744a60b7d",
  "tests/verify-word-lifecycle.mjs": "80247cad86b4b7b8ad7c9fb478191d12a17479930e88d8c1730f49e416719517",
  "tests/verify-word-presentation-browser.mjs": "3b302dc72e997b08d47ec0b0e57a4120742f283237c4390d735f2328abdba439",
  "tests/verify-word-repeat-tap-browser.mjs": "8a62695f4ea352bdb51d96848480000d359b56964eb409a0cee9ba33d0b079a3",
  "tests/verify-wordbook-patch-sql.mjs": "1c491c30a20e39e616c4877109a53e6339ca4e586cfeb1ce94e6ca71a5dad551",
  "tools/ios-testflight.sh": "c44d9cc1a53e48b60bd3b2b341ff1e3db208791763c7ad1847117ca004cbdb7f",
  "tools/verify-ios-release.mjs": "a644746a2153f83dd7826d4080342e9e1eb02e3e0d8b4d0c6366a791e33579c6"
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
