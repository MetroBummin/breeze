import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const receipt=JSON.parse(readFileSync(new URL('docs/qa/breeze-1.9-integration/boundary.json',root)));
const canonical=receipt.approvedAiCanonicalFollowup;
const canonicalScope=canonical?.files||[];
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
const native=receipt.approvedNativeApple191;
const nativeScope=native?.files||[];
const bootstrap=receipt.approvedCloudBootstrapFollowup;
const bootstrapScope=bootstrap?.files||[];
const permitted=new Set([...Object.keys(receipt.files),...receipt.integrationScope,...nativeScope,...bootstrapScope,...canonicalScope]);
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
const web=receipt.approvedWebLandingIntegration;
const webScope=web?[...web.files,...web.integrationFiles]:[];
if(web){
  const scope=new Set([...webScope,...nativeScope,...bootstrapScope,...canonicalScope]);
  for(const file of new Set([...git('diff','--name-only',web.appBase).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean)))assert.ok(scope.has(file),'Combined web integration changed app source outside PR137: '+file);
  for(const file of web.files){
    if(bootstrap?.sha256[file]&&file!=='landing/index.html')continue; // Exact follow-up hash checked below.
    const bytes=readFileSync(new URL(file,root));
    const source=execFileSync('git',['show',web.landingSource+':'+file],{cwd:root,maxBuffer:16*1024*1024});
    const stamp=value=>file==='landing/index.html'?value.toString().replace(/\?v=[a-f0-9]{8}/g,'').replace(bootstrap?.newLoginCopy||'__NO_COPY_CHANGE__',bootstrap?.oldLoginCopy||'__NO_COPY_CHANGE__'):value;
    assert.equal(hash(stamp(bytes)),hash(stamp(source)),'Combined web integration changed approved landing bytes: '+file);
  }
}
const welcomeJoin=receipt.approvedWelcomeJoinFollowup;
if(welcomeJoin){
  const scope=new Set([...welcomeJoin.files,...webScope,...nativeScope,...bootstrapScope,...canonicalScope]);
  for(const file of new Set([...git('diff','--name-only',welcomeJoin.base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean)))assert.ok(scope.has(file),'Welcome join repair exceeded approved local scope: '+file);
  assert.equal(html.split(welcomeJoin.newJoin).length,2,'The replacement exit must occur exactly once');
  assert.equal(normalized('index.html',Buffer.from(html.replace(welcomeJoin.newJoin,welcomeJoin.oldJoin))).trim(),normalized('index.html',Buffer.from(git('show',welcomeJoin.base+':index.html'))),'Welcome join repair changed markup outside its one exit segment');
  for(const file of ['scripts/ui/onboarding.js','styles/onboarding.css','ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json','ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-light.png',...git('ls-tree','-r','--name-only',welcomeJoin.base,'assets/brand','assets/onboarding','android').split('\n').filter(Boolean)])assert.equal(git('hash-object',file),git('rev-parse',welcomeJoin.base+':'+file),'Welcome join repair changed protected timing/navigation/icon/source bytes: '+file);
}
const followup=receipt.approvedIconOnboardingFollowup;
if(followup){
  const scope=new Set([...followup.files,...webScope,...nativeScope,...bootstrapScope,...canonicalScope]);
  for(const file of new Set([...git('diff','--name-only',followup.base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean))){
    assert.ok(scope.has(file),'Icon/onboarding follow-up exceeded 253 scope: '+file);
  }
  for(const [file,entry] of Object.entries(receipt.files).filter(([,entry])=>entry.kind==='followup-reviewed')){
    assert.equal(hash(normalized(file,execFileSync('git',['show',followup.base+':'+file],{cwd:root}))),entry.followupBaseSha256,'Follow-up replaced an unexpected 253 baseline: '+file);
  }
  const baseHtml=git('show',followup.base+':index.html');
  const welcome=source=>source.slice(source.indexOf('<div id="onboard-welcome"'),source.indexOf('<div id="onboard-carousel"'));
  assert.equal(welcomeJoin?welcome(html).replace(welcomeJoin.newJoin,welcomeJoin.oldJoin):welcome(html),welcome(baseHtml),'Approved welcome markup changed outside its authorized b-to-r exit');
  const welcomeCss=source=>source.slice(source.indexOf('#onboard-welcome .breeze-wordmark'),source.indexOf('#onboard-carousel{'));
  assert.equal(welcomeCss(read('styles/onboarding.css')),welcomeCss(git('show',followup.base+':styles/onboarding.css')),'Approved welcome geometry/animation changed');
  for(const file of [...(native?[]:['ios/App/App.xcodeproj/project.pbxproj']),'scripts/library/library.js','ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',...git('ls-tree','-r','--name-only',followup.base,'assets/onboarding','android').split('\n').filter(Boolean)]){
    assert.equal(hash(readFileSync(new URL(file,root))),hash(execFileSync('git',['show',followup.base+':'+file],{cwd:root})),'253 protected icon/media/import/native bytes changed: '+file);
  }
}
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
assert.equal(project.replace(native?'\n\t\t\t\t\t\tSystemCapabilities = {com.apple.SignInWithApple = {enabled = 1; }; };':'__NO_NATIVE_CAPABILITY__','').replaceAll(native?'MARKETING_VERSION = 1.9.1;':'MARKETING_VERSION = 1.9;','MARKETING_VERSION = 1.8.1;').replaceAll('CURRENT_PROJECT_VERSION = 253;','CURRENT_PROJECT_VERSION = 236;').trim(),baselineProject,'Release scope changed settings beyond explicit version/build');
if(native){
 for(const file of native.files.filter(file=>!receipt.integrationScope.includes(file)&&file!=='docs/qa/breeze-1.9-integration/boundary.json'&&file!=='tests/verify-integration-boundary.mjs'))assert.equal(hash(normalized(file,readFileSync(new URL(file,root)))),native.sha256[file],'Native Apple 1.9.1 reviewed scope drift: '+file);
 assert.match(read('ios/App/App/Breeze.entitlements'),/<key>com.apple.developer.applesignin<\/key><array><string>Default<\/string><\/array>/);
 assert.ok(read('scripts/sync/sync.js').includes("signInWithIdToken({provider:'apple'"));
}
if(bootstrap){
  const scope=new Set([...bootstrapScope,...canonicalScope]);
  for(const file of new Set([...git('diff','--name-only',bootstrap.base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean)))assert.ok(scope.has(file),'Bootstrap/copy follow-up exceeded explicit scope: '+file);
  for(const [file,expected] of Object.entries(bootstrap.sha256))assert.equal(hash(readFileSync(new URL(file,root))),expected,'Reviewed bootstrap/copy bytes changed: '+file);
  const landing=read('landing/index.html');
  assert.equal(landing.split(bootstrap.newLoginCopy).length,2,'Exactly one web login sentence replacement');
  assert.equal(landing.replace(bootstrap.newLoginCopy,bootstrap.oldLoginCopy).trim(),git('show',bootstrap.base+':landing/index.html'),'Landing changed outside the approved web login sentence');
  const packageBase=JSON.parse(git('show',bootstrap.base+':package.json'));
  const packageNow=JSON.parse(read('package.json'));
  packageNow.scripts.test=packageNow.scripts.test.replace(' tests/verify-ios-bootstrap.mjs','');
  assert.deepEqual(packageNow,packageBase,'Package changed outside bootstrap test registration');
}
if(canonical){
  // Older release receipts still protect their scopes. This approved follow-up
  // pins both its unchanged base and exact current bytes; it is not a bypass.
  const scope=new Set(canonicalScope);
  for(const file of new Set([...git('diff','--name-only',canonical.base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean)))assert.ok(scope.has(file),'AI canonical follow-up exceeded approved scope: '+file);
  for(const [file,expected] of Object.entries(canonical.sha256)){
    assert.equal(hash(normalized(file,readFileSync(new URL(file,root)))),expected,'Reviewed AI canonical bytes changed: '+file);
    assert.equal(hash(normalized(file,execFileSync('git',['show',canonical.base+':'+file],{cwd:root}))),canonical.baseSha256[file],'AI canonical replaced an unexpected baseline: '+file);
  }
}
console.log('Combined 1.9/1.9.1 boundary passed: approved integration/follow-up scopes, independent auth/onboarding, deferred startup, stable source paragraphs, native PDF capability and release-only metadata.');
