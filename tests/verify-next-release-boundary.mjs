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
    "SYNC.md": "839f737e00986295d51b55c99fed223a6f8d514534c0e565dbbb27ed9535c14f",
    "docs/decisions/002-dictionary-panel-reading-anchor.md": "4ff235a3d15172ed65223bf04ea30110a5ce6eed77be622e76d7220f477faa13",
    "docs/decisions/007-word-item-storage.md": "b3230b0817b18964cc0afdb3f02ce8a886787b6fec14b64ece8d3e52f9dca582",
    "docs/decisions/008-web-content-ingestion.md": "b2b424b96c6c7b5fec5d4d0658a12f76b0fb9ff1c2919d31e84cdf8838f4df3a",
    "docs/decisions/023-vocabulary-study-sets.md": "6cf8faa4fd587092ff9db286d7de45f07430e73d5aa898c0c9b2798f52772c1d",
    "docs/decisions/031-vocabulary-test.md": "f9a6a46151df7a40a941c502d6d18504e4a627f1ed80f91193cd5c0f66cd1434",
    "docs/decisions/032-next-ios-android-release.md": "3bfc88cc7bda09d4f4fabfb02ec04f6730c87f047c3fbdc0d003fbf052dcd104",
    "docs/decisions/033-account-learning-data.md": "f033e7906a4c82dd690ac48a9bee1bf76438d6ea7e1314ec48a6d827080d0c38",
    "docs/qa/account-learning-20261015.md": "9df0549e17ffa6abb32666207cd7ee6d7287811a4fa0aec2392ba8fd0840874c",
    "docs/privacy.html": "ed796df746a08547ef7b634457721f5d67078bb69fc3629248cfd250a94a568f",
    "docs/sync.html": "b290f7221b4a55a9188800c4a5cee48b72a862c88ea6e0411c44535f58101c74",
    "index.html": "61e1b6bdb80617a2c9debb9af3bd578dbfae04fa9bd665901ef983b32cbcf508",
    "ios/App/App.xcodeproj/project.pbxproj": "733b98e25e5ad8b3b8adcec3ac35783ba94565834f915f905a4b65d96eb06446",
    "package.json": "780730592a451e46c276e7de7074abc651d96208a925e1c11cba76119a1d7e31",
    "scripts/core/account-scope.js": "5bf138efc126a7935274cbc7d5ae2421e6c3c67ec2f6b0c411c68c2e03627b61",
    "scripts/core/state.js": "b7d537a395bc8a87d31c7ef35feffaef926530469ad5162fc78b638acdef903e",
    "scripts/core/study-sets-storage.js": "4108636f22a03a725a25efc2cfe33b26608fe783afbd6b95a30d1ad9d55857d0",
    "scripts/core/study-sets.js": "13c27671b5fc73f7b1fe69d9a8394a0fded426e7dfea56c49b0c8b57a02cb626",
    "scripts/core/vocabulary-test-storage.js": "a29693471e1b8e5ef28258b4149e9872f0d9c0b11bea220cb7ae3e2a98b7f72f",
    "scripts/core/word-integrity.js": "26df65911266aed4eccbbde3b3ffd4ff17edb8aa3c973e9d0ec39496aad99292",
    "scripts/dictionary/dictionary.js": "bb488a405de891945c5444a32519a05f6bcc4e0e7e2ebe7e19e7167b2731e302",
    "scripts/dictionary/easy-explanation.js": "fc76e90ee36f765eec4c34328b888eb016b3c6890dc9266adb8a4adc419d591a",
    "scripts/importers/social.js": "0278bfd4ef980dd3deaf307956eea4480dcf211966094cc294901a0260e6a731",
    "scripts/reader/reader.js": "4142ed2907e80c4b9df5412546aa4a691eb8747c0d15f4f3f90e7f9facec0ac6",
    "scripts/sync/learning-sync.js": "4a39c4f0ae622580633715d52880254290eb661ffc2b8297b3eaff796b33af15",
    "scripts/sync/sync.js": "03a2abeaa6dd9a9ff33d48d34169ba01a6224b3160f4e582964c65c8815f386f",
    "scripts/ui/onboarding.js": "0f95c0b7ed6f477f55bcea75b1eb794c6d708dfb753794907faeaea9f75c32a2",
    "scripts/ui/study-set-test.js": "1879f4ab37e59033c81d54a4d9c1bcfab889e0e767652c11fbaba7baab1b4cab",
    "scripts/ui/study-sets.js": "b4d166adf6e89d9f01c37368392193b47d8d4ad63a67d42beaae62c04601e480",
    "scripts/ui/vocabulary-review.js": "9c80dddb6f978b77a403284d87b843681d05c4ca51885287567a2c27b27defb7",
    "scripts/ui/wordbook.js": "6a635eaf84c4912d1cce486bb88fd64b871c6cb3a3439d76ad02c299da925803",
    "server/article/index.ts": "078924bf25202e60c88b0aac129dbda3a359255cbed43aee6d949fb355dcc0f0",
    "server/sync/study-state.sql": "158ea25b80c8ccebeaa353ce297ab3e9de657b056d727142133fcd85384b9eb4",
    "server/sync/wordbook-patch.sql": "66d8fdec07152bd1c52d3917c914e11290e213b4dc4a8724545df9d40951dfd5",
    "sw.js": "4cbf3772ecb0f82139b940242bdb439e8871eaddb36e80b1a479d5fff718998b",
    "tests/measure-study-sets-list-browser.mjs": "47d27c32201925399ad8eb28f63e9d3dfcb5dd7208805564ed7e423d0b68d21d",
    "tests/sync-test-transport.mjs": "ff08f8ca16a7ff728e865511d3b092e9f24768d75ba49334bdb9e62a74de29dd",
    "tests/verify-account-scope-browser.mjs": "80fdcba127faaa8ed2d53c091d0d98165f3e833ac0b553852a390de112e7067e",
    "tests/verify-account-scope.mjs": "ff766c7ffec78bba33f05c9cb72889a7e0ea3a61a43990ffae56d7dba3684fa9",
    "tests/verify-dictionary-account-scope.mjs": "c5ac692c86ee24f752182a7c3e46f23b3eaa23dca9daf28efaa547a16fd36d71",
    "tests/verify-incremental-word-browser.mjs": "b386ef4d23cb6de424d7b320d2762e94d111fc58a0dd1869126fa8e5fcc58fef",
    "tests/verify-incremental-word-save.mjs": "5ff45c338dd1c10d852b0e0aebca6d0be0c55c82303295cda7de4e7ec6d08b21",
    "tests/verify-ios-cloud-build.mjs": "a9710832154ee7c9736659447b6c28617a6e017b267bfe4a431dbda9e48489c5",
    "tests/verify-learning-sync-sql.mjs": "2e872df5f9364dff26e1263469826663c2c90f1bace91ceade4c79efee5098b7",
    "tests/verify-learning-sync.mjs": "8eea53b910fd3a5948eb295fa2db17f48489a9243d0c415d607ba49812be54f4",
    "tests/verify-library-refresh-browser.mjs": "4f20734fe2e58d227a8af20760234d2f59fd0d32bf06821ef96c487e9d7ba903",
    "tests/verify-lookup-work-browser.mjs": "3ca2e4dddf48cf293c6a3f9daebe29fb59208c86b5371921e67bf45aed846178",
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
    "tests/verify-study-sets-ui.mjs": "32aa3e3814d8198fcd2548b118c359710cb7a6cdaf8c0ef39764880d48a64bb2",
    "tests/verify-study-sets.mjs": "31d03b9465c7a10ea4adf713c75342157702eb325562733cbfff1b27265bc116",
    "tests/verify-vocabulary-review-browser.mjs": "26a437ae74d1e115cf836351a78f25b37f3c712284dfac635ffa620543d55253",
    "tests/verify-vocabulary-test-browser.mjs": "de4665a46c8358e7aeaaf8579f79540ad017f7749d43f147ad16c6e55a1133e1",
    "tests/verify-vocabulary-test-storage.mjs": "cd33119fe82eea784c4216ddaf3ef43a44eb7083e6fe452c9ba0c4aca34a019f",
    "tests/verify-word-arrival-browser.mjs": "6087b609226fe314e1973eb6797f0a3ec4fe8d286299f7ad93d1a29744a60b7d",
    "tests/verify-word-lifecycle.mjs": "80247cad86b4b7b8ad7c9fb478191d12a17479930e88d8c1730f49e416719517",
    "tests/verify-word-presentation-browser.mjs": "3b302dc72e997b08d47ec0b0e57a4120742f283237c4390d735f2328abdba439",
    "tests/verify-word-repeat-tap-browser.mjs": "8a62695f4ea352bdb51d96848480000d359b56964eb409a0cee9ba33d0b079a3",
    "tests/verify-wordbook-patch-sql.mjs": "1c491c30a20e39e616c4877109a53e6339ca4e586cfeb1ce94e6ca71a5dad551",
    "tools/ios-testflight.sh": "a4c2fea8bcfaf63f1306e37a1c4491d8ee50197401aab4003b8d93f8c36c1b7d",
    "tools/verify-ios-release.mjs": "dceed36664a24edc2cdec0eec98bb52507b1b4f69ace056d8c3757499c0afe88",
    "PRIVACY.md": "bdee7e68a9aa3eb4570fdec496c8cf3088dd4a41b38e7b4603f59db31db5025f",
    "config.js": "0d535cee59664ebcbe1318e8fec71a78c717c2d0958d3626e1051819f8eba295",
    "scripts/core/study-set-test.js": "3b3ced0964bb06d8785cf4d2bc93284e627d111df5edae05681a943d30465494",
    "scripts/library/book-edit.js": "5670e5897d40b74973967dbb92a974831d92f6d41459b70ecf416c14fa67626e",
    "scripts/library/library.js": "c8e47c6773b0d429901a98daca13f4045c9c4d282b4e3e46d7c71ddfd1bec7e8",
    "server/dict/index.ts": "22c245178298ed9f41abb10513cec4df180d27eeca66e4f4ddc9c0886054b6e0",
    "server/dict/study-set-test.ts": "5d873ebd9a40be7a94a05fc78b3309a0d5dfbcfdbfa2b87b970bf5b1184d8ceb",
    "styles/study-sets.css": "06f1120fe34cc2c83091baaabffdfd62456320df1b2275407b43cffacde0f1e3",
    "styles/surfaces.css": "349f7af79cc797db90621d9e3a0bb00d0743d1e26ee8b6e7f50625c2c6ada0fe",
    "styles/wordbook.css": "d1190e78175900d3348103713c88a4f9f99b90ad9f99bf1ee56485f43624abdd",
    "tests/verify-study-set-test-grade.mjs": "9fd53eb9a70383c6d79e18aac34cec698c4fba5e314acba6a289ee0f3cc8b662",
    "tests/verify-study-set-test.mjs": "d09884a9908d01d205c8fb25a5a6694ffeda8782248dcb7b08da80a8e9e82757",
    "tests/verify-wordbook-window-browser.mjs": "e646141b3b1a4c1748663af41775d5937b20bcbfa7abc2eb21c86f81cf3ad194",
    "docs/decisions/034-selective-book-sync.md": "0535bc65057730f6d16b706f61d778160eeadbb69dbb0ff627c5364a561500f6",
    "scripts/library/book-cloud.js": "586191d2b70f3154ae4e4d74ddf7dd37a4fa5493ca90857796eed2f1c4861096",
    "server/books/handler.ts": "5bb10d2f90ed77b8019af228d5f1590bd6675fd2f6052b0c7b5f86a01125de6a",
    "server/books/index.ts": "09ef295aceabd49f4f555dd4808db48cc79756ace7de60f12df7fafb2517e335",
    "server/books/r2.ts": "ff0da8de2f736ad396a07446c54a36ab7f06eb50aab288e3f06a269106b945e4",
    "server/sync/book-cloud.sql": "3363a1ca16473e132e1cadf625f3841184eebf3f4f9bd1e7b209a04617050ce3",
    "tests/verify-book-cloud-edge.mjs": "3b3dadc38e654a5c006440fbf7a974781dd40f5aceeb6e0f167e01ad10dfa7ad",
    "tests/verify-book-cloud-sql.mjs": "4b5e5a86d42dd2fd5d30087c6d7caf5b0ef708ff99d550f7b5bc3682dcfdfddc",
    "tests/verify-book-cloud.mjs": "ae674570071d6c27bb466680b96e8b86403d47278950de704ba49ded8dd3a1a9",
    "types/globals.d.ts": "06ae5ca696945aaf85061b1d6ae4f5d993fe519dbaf11337431cd265aedb8c32"
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
