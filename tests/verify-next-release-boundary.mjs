// Approved PR160/161/162 integration plus reproduced PDF rotation and release readiness corrections.
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
  ".github/workflows/apple-release.yml": "483b649df36c39ab1d5f3c2c394c79bef9fb9190af83bd34d275f425ba5db89d",
  ".github/workflows/vocabulary-test.yml": "10d3dd7e82e7fc72299e6614947ac5d1467c5272c66cfa9e0be04c916bb3ca1e",
  "android/app/build.gradle": "669c6cf62ae4af864b914452a752c0b196db84feda2df6a32470d1fc29c874c3",
  "docs/apple-release-automation.md": "43012018b831ed2d8eaf548374e7ddf8eb6062ea855ac4302d1d254168763649",
  "docs/decisions/003-pdf-highlight-geometry.md": "1883bdb7d86ee35f4bb2d060a107050d37e8bc561d651e33e7313aeff8dc15ad",
  "docs/decisions/013-vocabulary-review.md": "76a0acb07f79bf854a31ceeb846a716107222973719048332f09a24fcacd2188",
  "docs/decisions/023-vocabulary-study-sets.md": "0047a9423775101d3953cb391828aa67d0e55aedd505900d50aea0ed6ba08993",
  "docs/decisions/031-apple-272-screenshot-preflight.md": "cebf316dc9f8761597ecebc58f4e84a59808a3b99502aa67cb035a51e9c6ad65",
  "docs/decisions/031-vocabulary-test.md": "d545f97a1388b988f3d285605d1ad03558988e434f79b55a007cf9ab0b1daff1",
  "docs/decisions/032-next-ios-android-release.md": "0d051e6bcb386291bfca4dea386f30863eb37907fdeaefdeedf46f029113ad91",
  "docs/qa/vocabulary-test/README.md": "573e4e532614d7bf145953786088c3a82128f74fc47243178bf22d799509497f",
  "docs/qa/vocabulary-test/breeze-study-directions.mp4": "ad729d4658f9059b652dece7483afbcf42782d3f27a2ac46ebf7713344140c85",
  "docs/qa/vocabulary-test/breeze-study-meanings-iphone.png": "2e7d83b276b326deb3d356f7071e4538dc6192aa39e8967a2e9f31cbb3710b78",
  "docs/qa/vocabulary-test/breeze-test-question-iphone.png": "3ee554d97978dd6b4307623144484634d54e317dc3944e17e781e7245154557f",
  "docs/qa/vocabulary-test/breeze-test-results-iphone.png": "1a143cf2b46be7bc7fe7a8f7cc0864bf8c47a6eb2ca08eee919df07b019fe052",
  "docs/qa/vocabulary-test/breeze-test-setup-ipad-dark.png": "f02c37c2b8f047e2b01daba7573838803265c1086c11e785136bf9238ac8f352",
  "docs/qa/vocabulary-test/browser-metrics.json": "075a7abeee9aba2846a54fb5e4c00c12ecab8fabe9f8669a86fdea4078447c8f",
  "docs/qa/vocabulary-test/direction-events.json": "87fd8a215b5c8dca7acff841ac9a0d90557dc8b83c7b906a28171d69e84089ba",
  "index.html": "22fcaf21d32ad8ab402fcb60402bf9e124944f7c0f1965664a24696a56cea5d0",
  "package.json": "c8d540df1cf23fb75e188d358c9e77d5a8fa9a5d3cfc544e5cc10d88fe649e74",
  "releases/apple/assets/breeze-193-build272.json": "5eb6bf34ed6789472365f2b8c9da3eccfee9d0bd056c1f656b43292bccd6e913",
  "scripts/core/state.js": "b29f6bf99cfd55ebce8d20a79be74b0f8749cb08f6d0f65647b1bfa86431484f",
  "scripts/core/study-sets.js": "9136b150a44aa5f5774ec616262f52d23d6d0c89ed36536607c2ef6396535ae5",
  "scripts/core/vocabulary-test-storage.js": "7e78cae9dd01272da00b708fd2f5bd58ad538319c624bc77d453948639fc1af5",
  "scripts/core/vocabulary-test.js": "816154d03bf2dbbb3ce46e3a5e03a9621a87046badc318986af7346cd9f8a864",
  "scripts/dictionary/vocabulary-test-grading.js": "83c32b98fe59255d9c1af6d3915a232faedd0e4a57d9acff4b7993d96c8cc084",
  "scripts/reader/pdf-original.js": "76c4ac7598b559ef79c18e0b810f09097374accfa0efbacb84c21711c1abbe3b",
  "scripts/ui/study-sets.js": "a2c41d7305fc42fae7b835adf868c1efa981929f8971e8b9f26bd2dc066a47de",
  "scripts/ui/vocabulary-review.js": "ce3a19611ab66f7ea30917260f80198d7cd6a313202305a74704374c9d2845a1",
  "scripts/ui/vocabulary-test.js": "aea5d8b458110a1bc34855956bb853c8ab75d2433f2cea2a173e7f64133616b3",
  "server/dict/index.ts": "3bdff9b52c91da218b4220b5ec0b96ed8a73d66faf2dd67a52e913eded4cea2e",
  "server/dict/vocabulary-test-receipts.sql": "b60dd70296d8d69da12aeb406b1e2990fea7bee8c507137719163ce227f6d345",
  "server/dict/vocabulary-test.ts": "3a81aca79a87f280223a432c060a60d10875cc89198f94d7db9266f4c74d03b0",
  "styles/header-controls.css": "509167f024e097d5037a9d6d31effbcbfca5cfaef90bf70328aea25372319917",
  "styles/study-sets.css": "4a4e7f565ccef67a7d0290d9a33c0e85e7f87d3d21b06fe532fb611f2b6ed5ff",
  "styles/vocabulary-test.css": "2c75722a6f21d8a8ef319765bc5a563b0a092f29330edfa8794796f5ebf0e4b1",
  "styles/wordbook.css": "fd5f7e3797b90eb31dadbb148d403529e1b758c9b51438ae17d981290c032c85",
  "sw.js": "794d414524dfd0435363ee6e7c8c53b02aade392a36ce93908676a7b8f930c8b",
  "tests/verify-all-words-window-browser.mjs": "0cdad010a2c074568521b676aa3a8c883b43dc6e94423f9e6057f82211b3a9d5",
  "tests/verify-android-build.mjs": "d48ee9d93fa8db6e795ef84f200b6b90f9ac96082b34050d9860cfea1e95dad8",
  "tests/verify-apple-build-inventory.mjs": "342a85e7a4fc7275ff083631eb6491a6d0dcd35876e054aa35e22f094785e525",
  "tests/verify-apple-release-boundary.mjs": "3bf465c199c564f303bc54e2dcf52f5852e4ae2c8300c7b06d23caa04e37dd4b",
  "tests/verify-apple-screenshot-assets.mjs": "8a90915db6518cee7f7d61170db6998b46dec88b3c7c1b8a6708b76c1de9f61e",
  "tests/verify-apple-screenshots.mjs": "1ffed2ef5b97c67c775c96bae5de8b575e23bab102b02d0bf8b162d03cb83f99",
  "tests/verify-pdf-elastic-motion-browser.mjs": "dbe97cdd2f4667c6e8f000ad96e1e0fcba022275e65d3ce5d9058219ba4bc97e",
  "tests/verify-pdf-session-regressions.mjs": "2625d06b1c09b6130cbecd7f12e9cb4fb51cfa56b74c646ec148c9b9cca6a698",
  "tests/verify-simple-word-cards-browser.mjs": "a291524a077107b61ac86decbac0a681cc80436764111bcd6d9151ccd6d4725c",
  "tests/verify-study-direction-browser.mjs": "9cca0ddab6e5ca4aaca65a231364bc3ac68e195411a92a1a74c302a8ac20fa3c",
  "tests/verify-study-motion-browser.mjs": "f2324bb5a107d583c3e4175a36a2921bf67743ca8be12730f81d432faf92197a",
  "tests/verify-study-sets-browser.mjs": "c29913328fdcf4a8f52c9d523dbed3667a2d571d6855a01277af4883148aa3b0",
  "tests/verify-study-sets-ui.mjs": "4e1ea003fd25f5ac451bf302062bc90c07fe14301a788af5a6f3599711ab512b",
  "tests/verify-study-sets.mjs": "b2ffa0751387d854e7ce3660f55b4fd984156d83d3f80575e9b4197744f2fc0f",
  "tests/verify-vocabulary-test-browser.mjs": "0bc442b93b49b64bddff5cb628c65a0252094d0bfd55c58556fdb4496c9ab4a9",
  "tests/verify-vocabulary-test-grading.mjs": "8dc9bc40fb94a64630d7c90b4bf026c677c83d3052b9b9d4f5530ee495f72980",
  "tests/verify-vocabulary-test-storage.mjs": "5ebaff005f7cf38e3b9a7132578730153579d7770a2dbf6fabf89a440777c93e",
  "tests/verify-vocabulary-test.mjs": "06bc259b9f01d3d6c33c748e15dd45a58afafb46d1faec9a2778a1816a245c9d",
  "tools/apple-build-inventory.mjs": "a97fcb1b3cdd7c6984ba70d79ef884a66873820d6a1bc4478395423d8801b95c",
  "tools/apple-release.mjs": "d2f56d69efeef17cc43e6b859a4dc2a753dd78d307243cf23a46b2c00d6d64c6",
  "tools/apple-screenshots.mjs": "3e35b9ec4915d0b913b5a56f9c1e23398cf31c20703c07cfd920b3ab721fb35a",
  "tools/verify-apple-release-boundary.mjs": "1d607169b82ceec028fddadd09cb2745f909935ad06f775b2acb6a2294e7c43c",
  "tools/verify-apple-screenshot-assets.mjs": "35224e1dcebfd44400cef0f5a00a544263aa189b9c82858c6b6b5a404fa389b4"
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
