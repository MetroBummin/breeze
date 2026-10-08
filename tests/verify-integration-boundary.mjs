import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const receipt=JSON.parse(readFileSync(new URL('docs/qa/breeze-1.9-integration/boundary.json',root)));
const hash=value=>createHash('sha256').update(value).digest('hex');
function normalized(file,bytes){
  if(file==='index.html'||file==='scripts/core/lazy-lib.js')return bytes.toString().replace(/\?v=[a-f0-9]{8}/g,'');
  if(file==='sw.js')return bytes.toString().replace(/const VERSION = '[^']*';/,"const VERSION = 'STAMP';");
  return bytes;
}
for(const [file,entry] of Object.entries(receipt.files)){
  assert.equal(hash(normalized(file,readFileSync(new URL(file,root)))),entry.sha256,'Combined scope drift: '+file);
  if(entry.kind==='single-source')assert.equal(entry.sha256,entry.sourceSha256[entry.owners[0]],'Single-owner content changed: '+file);
}
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const permitted=new Set([...Object.keys(receipt.files),...receipt.integrationScope]);
for(const file of new Set([...git('diff','--name-only',receipt.base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean))){
  assert.ok(permitted.has(file),'Unapproved file drift: '+file);
}
// Independently pinned launch, configuration, gesture and durable source text.
for(const file of ['config.js','capacitor.config.json','ios/App/App/Info.plist','ios/App/App/Base.lproj/LaunchScreen.storyboard','scripts/reader/gesture.js','scripts/dictionary/sentence-easy-explanation.js',...git('ls-tree','-r','--name-only',receipt.base,'assets/longreads').split('\n').filter(f=>f.endsWith('.txt'))]){
  const expected=execFileSync('git',['show',receipt.base+':'+file],{cwd:root});
  assert.equal(hash(readFileSync(new URL(file,root))),hash(expected),'Protected baseline changed: '+file);
}
const read=file=>readFileSync(new URL(file,root),'utf8');
const html=read('index.html');
assert.ok(html.includes('id="onboard-welcome"')&&html.includes('scripts/library/holmes-layout.js'));
for(const file of ['assets/lib/readability-0.6.0.js','assets/longreads/homeward-lookup-data.js','scripts/reader/frame-trace.js','scripts/wordbook/review-engine.js','assets/lib/fsrs-5.4.2.min.js'])assert.ok(!html.includes('src="'+file),'Eager resource resurrected: '+file);
assert.ok(read('scripts/main.js').includes('if(!onboardingSession)renderHome();'));
assert.ok(!read('scripts/main.js').includes('await upgradeHomewardLongRead'));
assert.ok(read('scripts/reader/reader.js').includes('await upgradeHomewardLongRead(b,alive,options.signal)'));
assert.ok(read('scripts/reader/reader.js').includes('holmes-paragraph-part'));
assert.ok(read('sw.js').includes('function keepRuntimeAsset(url)'));
assert.ok(read('scripts/ui/onboarding.js').includes("Reflect.get(BreezePdfInk,'availability')"));
assert.ok(read('scripts/reader/pdf-ink.js').includes('breeze-ink-platform'));
const project=read('ios/App/App.xcodeproj/project.pbxproj');
const baselineProject=git('show',receipt.base+':ios/App/App.xcodeproj/project.pbxproj');
assert.equal(project.replaceAll('MARKETING_VERSION = 1.9;','MARKETING_VERSION = 1.8.1;').replaceAll('CURRENT_PROJECT_VERSION = 250;','CURRENT_PROJECT_VERSION = 236;').trim(),baselineProject,'Release scope changed settings beyond explicit version/build');
console.log('Combined 1.9 boundary passed: approved six-PR scopes, independent auth/onboarding, deferred startup, stable source paragraphs, native PDF capability and release-only metadata.');
