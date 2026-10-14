// Approved release integration, typed-test hold, study completion and word-only display hold.
// Historical export/release guards run unchanged on their exact source commits.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='19bbb8d840df5129f4224f38093b8aa0b443f002';
const guard='tests/verify-next-release-boundary.mjs';
const expected={
  "tests/verify-saved-expression-reopen.mjs": "d45156d2881bf638d8da09977ab3e66d9fbc00bbc6695a5a191e18a40f27e102",
  "scripts/reader/reader.js": "d5c07b0805da49e4ca98d11c53ffc15b245db93500f9d4468f7f9f87401414d2",
  "tests/verify-word-only-browser.mjs": "9592e44c7f8bc22d6f197dc49c9e5f4068155c4477c4486e4ac19f60cd634ee9",
  "tests/verify-vocabulary-review-browser.mjs": "c96e6b14a1b660f900cd830911d8cb14b741affd80eacc4857d0bfccce77010b",
  "tests/verify-easy-explanation-browser.mjs": "d5b98275f413be840f1f417bf0ea6ef48bbc3431cedb354664aac4c8700e0351",
  "tests/verify-control-optics-browser.mjs": "649bca7843fbf8f002898b3d0b9e9eecbf710069f1da1939228765d7cc969129",
  "scripts/dictionary/dictionary.js": "cd263ecc75c728071995e82332cab625f3ac758e268a307fcf1bac6f98fa4c8d",
  "package-lock.json": "20d62e70707d6ec1d9780d5891e6468bb559cb8071ed4f70be2eb27976b9bd12",
  "tests/verify-offline-blob-engine.mjs": "84ca30d23049408a4b2742a8e105d54d727cfb7d376c0ae18781e78631f353a2",
  ".github/workflows/pdf-ocr.yml": "6164af42ab60c61ea2de8744c9753668753e3289e3a2bb71761137f2754afa09",
  ".github/workflows/apple-release.yml": "483b649df36c39ab1d5f3c2c394c79bef9fb9190af83bd34d275f425ba5db89d",
  ".github/workflows/vocabulary-test.yml": "35e2f3393644fbe45a5e8bb686a0b0acc6de60d10f7bcf109e744c7c5095e007",
  "android/app/build.gradle": "669c6cf62ae4af864b914452a752c0b196db84feda2df6a32470d1fc29c874c3",
  "docs/apple-release-automation.md": "43012018b831ed2d8eaf548374e7ddf8eb6062ea855ac4302d1d254168763649",
  "docs/decisions/003-pdf-highlight-geometry.md": "1883bdb7d86ee35f4bb2d060a107050d37e8bc561d651e33e7313aeff8dc15ad",
  "docs/decisions/013-vocabulary-review.md": "8187b4123f6d3209dac6bd345c6fb163ab5dd3d5be52b9d99897b5484e78980b",
  "docs/decisions/023-vocabulary-study-sets.md": "ae96d2e712e178b8264cb4652967680dc28bb0bc65d63355ae3329554119ef34",
  "docs/decisions/031-apple-272-screenshot-preflight.md": "cebf316dc9f8761597ecebc58f4e84a59808a3b99502aa67cb035a51e9c6ad65",
  "docs/decisions/031-vocabulary-test.md": "d4d41f85d7d65478511e97dc6565cd0182470b9c9442587da32b3b7d0a4e3366",
  "docs/decisions/032-next-ios-android-release.md": "77ee548db98de82e7f413a4dd4ab12065255b86d1336818838c29e95b5497e5a",
  "docs/qa/vocabulary-test/README.md": "573e4e532614d7bf145953786088c3a82128f74fc47243178bf22d799509497f",
  "docs/qa/vocabulary-test/breeze-study-directions.mp4": "ad729d4658f9059b652dece7483afbcf42782d3f27a2ac46ebf7713344140c85",
  "docs/qa/vocabulary-test/breeze-study-meanings-iphone.png": "2e7d83b276b326deb3d356f7071e4538dc6192aa39e8967a2e9f31cbb3710b78",
  "docs/qa/vocabulary-test/breeze-test-question-iphone.png": "3ee554d97978dd6b4307623144484634d54e317dc3944e17e781e7245154557f",
  "docs/qa/vocabulary-test/breeze-test-results-iphone.png": "1a143cf2b46be7bc7fe7a8f7cc0864bf8c47a6eb2ca08eee919df07b019fe052",
  "docs/qa/vocabulary-test/breeze-test-setup-ipad-dark.png": "f02c37c2b8f047e2b01daba7573838803265c1086c11e785136bf9238ac8f352",
  "docs/qa/vocabulary-test/browser-metrics.json": "075a7abeee9aba2846a54fb5e4c00c12ecab8fabe9f8669a86fdea4078447c8f",
  "docs/qa/vocabulary-test/direction-events.json": "87fd8a215b5c8dca7acff841ac9a0d90557dc8b83c7b906a28171d69e84089ba",
  "index.html": "1d9090ad62bc8aaf08620834644991858306e9f27d6ec51fb13d847ed64e8506",
  "package.json": "452f0b4a3c36ada20b4fc5176ce9dba943923e76b8a4bf76ebdb5275b86366ff",
  "releases/apple/assets/breeze-193-build272.json": "5eb6bf34ed6789472365f2b8c9da3eccfee9d0bd056c1f656b43292bccd6e913",
  "scripts/core/state.js": "116b25160234f3656a7f3c198ff6586b36b184a824e43d5a119fb7ec1c4ba125",
  "scripts/core/study-sets.js": "8658200be0993e909d9cab0db02ddd0c1115a01bf86501c6696197424847dc9e",
  "scripts/core/vocabulary-test-storage.js": "7e78cae9dd01272da00b708fd2f5bd58ad538319c624bc77d453948639fc1af5",
  "scripts/core/vocabulary-test.js": "3677f9b4a7db3652d2a90dbb20ca8a018be1ef5f40da04d67465f04fa69b8296",
  "scripts/dictionary/vocabulary-test-grading.js": "83c32b98fe59255d9c1af6d3915a232faedd0e4a57d9acff4b7993d96c8cc084",
  "scripts/reader/pdf-original.js": "76c4ac7598b559ef79c18e0b810f09097374accfa0efbacb84c21711c1abbe3b",
  "scripts/ui/study-sets.js": "691c48e2b8b3a1e2487946561e9148c4a3ca4a92ddcad1d8661ceeb91410481b",
  "scripts/ui/vocabulary-review.js": "a37546cb2d0683abc74a175de7ad294d70b11da7b0028e19d02662864e6a244e",
  "scripts/ui/vocabulary-test.js": "ae468ef859956ea1e221b909b7ea9f7ef021648a688669e1229e33a631e63eca",
  "server/dict/index.ts": "3bdff9b52c91da218b4220b5ec0b96ed8a73d66faf2dd67a52e913eded4cea2e",
  "server/dict/vocabulary-test-receipts.sql": "b60dd70296d8d69da12aeb406b1e2990fea7bee8c507137719163ce227f6d345",
  "server/dict/vocabulary-test.ts": "3a81aca79a87f280223a432c060a60d10875cc89198f94d7db9266f4c74d03b0",
  "styles/header-controls.css": "509167f024e097d5037a9d6d31effbcbfca5cfaef90bf70328aea25372319917",
  "styles/study-sets.css": "2d14218180e2a9687721cf7a1d3078889a82f7a0ab93c9d6dffb5cfaaaa7fa39",
  "styles/vocabulary-test.css": "844a3652ee47aedfc61d96fc87e34e0db0992910f7cf871e24992ac41cff7579",
  "styles/wordbook.css": "fd5f7e3797b90eb31dadbb148d403529e1b758c9b51438ae17d981290c032c85",
  "sw.js": "6d6a4c4bb4f278a0c519c83f242815fd5a58322914ac547c2ac68a4085e8967f",
  "tests/helpers/app-icon-family-scenes.mjs": "7c95d6a549db3e9ec1071466f5d9ee01d25ee00aba4c167f7fa31fb78d786d55",
  "tests/verify-all-words-window-browser.mjs": "11e8235ba10557cff22e3d503747f2362d7bd7752b7c6acf65360f8fb3401a5f",
  "tests/verify-android-build.mjs": "d48ee9d93fa8db6e795ef84f200b6b90f9ac96082b34050d9860cfea1e95dad8",
  "tests/verify-app-icon-family-scenes.mjs": "9d9d628718bfee29e5c980b53505c6f673e594a33cd9c10accafadabaff5326d",
  "tests/verify-apple-build-inventory.mjs": "342a85e7a4fc7275ff083631eb6491a6d0dcd35876e054aa35e22f094785e525",
  "tests/verify-apple-release-boundary.mjs": "3bf465c199c564f303bc54e2dcf52f5852e4ae2c8300c7b06d23caa04e37dd4b",
  "tests/verify-apple-screenshot-assets.mjs": "8a90915db6518cee7f7d61170db6998b46dec88b3c7c1b8a6708b76c1de9f61e",
  "tests/verify-apple-screenshots.mjs": "1ffed2ef5b97c67c775c96bae5de8b575e23bab102b02d0bf8b162d03cb83f99",
  "tests/verify-pdf-elastic-motion-browser.mjs": "dbe97cdd2f4667c6e8f000ad96e1e0fcba022275e65d3ce5d9058219ba4bc97e",
  "tests/verify-pdf-session-regressions.mjs": "2625d06b1c09b6130cbecd7f12e9cb4fb51cfa56b74c646ec148c9b9cca6a698",
  "tests/verify-simple-word-cards-browser.mjs": "44ea710d88e95a4b4d68ed72586093d1b362c5c9e9ab578373aa85abeaebf006",
  "tests/verify-study-direction-browser.mjs": "9cca0ddab6e5ca4aaca65a231364bc3ac68e195411a92a1a74c302a8ac20fa3c",
  "tests/verify-study-motion-browser.mjs": "f2324bb5a107d583c3e4175a36a2921bf67743ca8be12730f81d432faf92197a",
  "tests/verify-study-session-swipe-browser.mjs": "d3f87c673ba5a5525d596aef53e5134ad0bb1ec9ef770935e68e915f7c3d0228",
  "tests/verify-study-sets-browser.mjs": "92062bc63fdbab2368ecf16b74a2317e95d22f808aa727cd8e43ddb90864454b",
  "tests/verify-study-sets-ui.mjs": "7d3598f1bdf299c098d47d3b2fb1415740ac2c07e048d1ac1e89c9c401fb5528",
  "tests/verify-study-sets.mjs": "b5b6d8ce232609b83b2ba10fa895b69e76cfb924d07675590ef845a85fcb729e",
  "tests/verify-vocabulary-test-browser.mjs": "96db829a2c9015a2db6f3d48f42339dab1e5e8bb6dde93137de7d1291a74c74e",
  "tests/verify-vocabulary-test-grading.mjs": "8dc9bc40fb94a64630d7c90b4bf026c677c83d3052b9b9d4f5530ee495f72980",
  "tests/verify-vocabulary-test-storage.mjs": "5ebaff005f7cf38e3b9a7132578730153579d7770a2dbf6fabf89a440777c93e",
  "tests/verify-vocabulary-test.mjs": "06bc259b9f01d3d6c33c748e15dd45a58afafb46d1faec9a2778a1816a245c9d",
  "tools/apple-build-inventory.mjs": "a97fcb1b3cdd7c6984ba70d79ef884a66873820d6a1bc4478395423d8801b95c",
  "tools/apple-release.mjs": "d2f56d69efeef17cc43e6b859a4dc2a753dd78d307243cf23a46b2c00d6d64c6",
  "tools/apple-screenshots.mjs": "3e35b9ec4915d0b913b5a56f9c1e23398cf31c20703c07cfd920b3ab721fb35a",
  "tools/verify-apple-release-boundary.mjs": "1d607169b82ceec028fddadd09cb2745f909935ad06f775b2acb6a2294e7c43c",
  "tools/verify-apple-screenshot-assets.mjs": "35224e1dcebfd44400cef0f5a00a544263aa189b9c82858c6b6b5a404fa389b4",
  "tests/helpers/study-sets-browser-fixture.mjs": "af86dc71ba7e8abe53e23398ed16464d4d8678b25cba8a2fbc3b957d90488087",
  "tests/verify-study-completion-browser.mjs": "fb8092604361a546d9865e9052ece0d722b209822a452d50afc695ca21ec96e1",
  "README.md": "b36c6266adacad3876663e70e074c230b2b28473a649d79b3cb8f62f77b44b4b",
  "docs/index.html": "36355cebd126a6bc3729cc8607dc5a103b219d6ab728d49e74679f991505755a",
  "landing/index.html": "5332944a65525b0fc2ab41b06bd0f9ee24a24a6fa17a38a08fa13fc3b2f1ebf9",
  "scripts/core/storage.js": "1c1cde9073c4a30ce0babce5dc72adb8ba941a10b73ac3dead79a6d62eb5540a",
  "scripts/library/library.js": "3f27e9ed7f019a483b2c0a8bb538443d075cec291d7de3a83827e2f14ff58271",
  "scripts/library/shared-links.js": "9b5e1c4a000078eec892d7418a35a3f9bcbe51e181f0e8dbcad967f4e443ab28",
  "scripts/reader/mode-bridge.js": "922378bf8b77f49d393c590f15d57548d009f46d9bce3d0281294a4cf9c66159",
  "scripts/reader/original-session.js": "08a077c13c12435e789b107b258313050185ea7262d2cf966b00845c36495d91",
  "scripts/reader/reader-scroll.js": "5c42e8035c0ab257ea510b53f991de888d334af6504987613cd3d4ac26d5b863",
  "scripts/sync/sync.js": "54e68659b48c72f310d01e70dbe1ea371022f5bb48572a86fb10ac4e95406a00",
  "server/article/public-fetch.mjs": "f63b9baa9687c5349169c4dd7acfe31f72da1b0776b586ace567d7233793bde3",
  "server/rss-catalog/public-prefix.mjs": "b93d7fa0698c40a6bd0758b2541bd9fe760161ec5b894480fd0ac7d827cddb90",
  "styles/components.css": "007ef09d520efc7e30a8f2b763a253a3242986797aafaf3010a543aca8f5be5f",
  "styles/dictionary.css": "e8263cbe94fe61f4ea1f04f49f78e1effd337301bde94dd045227e04c97aa803",
  "styles/home-shell.css": "ff1c9643ee52bbf265942eb5239b1ed92eed749ed9d85e18dabd1e0378c51977",
  "styles/home.css": "07a20309434fa99ac33d8e4faaab833e99de1795840f61fee844b22e931ed304",
  "styles/reader.css": "d8d7ce52a96d982b959d2ea0b080e1757145a6fc8e67c190920a48188e3675ae",
  "styles/surfaces.css": "a1d196566758d018ce9cf184d60b338432c3bfb8e8c162b4e6b51a06accb7fb2",
  "tests/verify-native-package.mjs": "e506944bbb19576c89b87579151af9bcb1ad1a7c1dd2cbbaa4f4281d7ac770af",
  "tests/verify-structure.mjs": "f0f84b9e06138f9577b7a045f71517d3544d7248eeb5faeecfaadb31ceb6d070",
  "tests/verify-word-integrity.mjs": "19ac330d35e0c8b968d41be032a7ec7ab064a6405b13cf9a14dbee3ca6095778",
  "tests/verify-word-lifecycle.mjs": "2ae56fc092ddf41f73423c012b81e408f2c933efa86c803a457051ab2e2e8ae3",
  "tools/build-www.mjs": "a144c512101649f7d28b2862ee3e08034927ec7964d63841d9691fb5791586f7",
  "tsconfig.json": "a1ed3c76501dd733e6243e90ea0b806c8a8a44beec58c878636f2fbefe120a38",
  "scripts/sync/dormant/README.md": "9b840174bbba671d04bc89adae906431ec9cd5eecfe7fbb8ec10c02153a6728b",
  "scripts/sync/dormant/vault-recovery.js": "6dfdaee088a7b76cb279c6db42ace450506b75ce3c831f944bc9ede184e2c78b"

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
 git('worktree','add','--quiet','--detach',scratch,base);registered=true;
 execFileSync(process.execPath,['tests/verify-vocabulary-export-boundary.mjs'],{cwd:scratch,stdio:'inherit'});
}finally{if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
console.log('Exact CSV/PDF integration source passed; disabled grading and historical positive/negative gates remain protected.');
