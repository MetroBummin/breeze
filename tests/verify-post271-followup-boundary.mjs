/* Review-only followup: preserve the shipped release and permit only the
   two approved All Words/picker fixes. This is not a release receipt. */
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const shipped='dfdbbab45e798aabca7f64133eb170265b96a7de';
const guard='tests/verify-post271-followup-boundary.mjs';
// Keep this explicit. New files require review rather than a directory wildcard.
const allowed=new Set([
  "tests/verify-post271-followup-boundary.mjs",
  "docs/decisions/023-vocabulary-study-sets.md",
  "scripts/ui/study-sets.js",
  "scripts/ui/vocabulary-review.js",
  "styles/study-sets.css",
  "index.html",
  "sw.js",
  ".github/workflows/all-words-picker.yml",
  "tests/verify-study-motion-browser.mjs",
  "tests/verify-simple-study-session.mjs",
  "tests/verify-simple-word-cards-browser.mjs",
  "tests/helpers/all-words-fixture.mjs",
  "tests/measure-all-words-browser.mjs",
  "tests/measure-study-picker-scroll-browser.mjs",
  "tests/measure-breeze271-baseline.mjs",
  "tests/verify-all-words-window-browser.mjs",
  "tests/verify-study-picker-scroll-browser.mjs",
  "docs/reviews/breeze-post271-allwords/README.md",
  "docs/reviews/breeze-post271-allwords/after/all-words-phone-light.png",
  "docs/reviews/breeze-post271-allwords/after/all-words-short-dark.png",
  "docs/reviews/breeze-post271-allwords/after/chromium.json",
  "docs/reviews/breeze-post271-allwords/after/picker-checks-chromium.json",
  "docs/reviews/breeze-post271-allwords/after/picker-chromium.json",
  "docs/reviews/breeze-post271-allwords/after/picker-phone-light.png",
  "docs/reviews/breeze-post271-allwords/after/picker-short-dark.png",
  "docs/reviews/breeze-post271-allwords/after/window-chromium.json",
  "docs/reviews/breeze-post271-allwords/before/chromium.json",
  "docs/reviews/breeze-post271-allwords/before/picker-chromium.json"
]);
const runners=['.github/workflows/integrity.yml','.github/workflows/design-brand.yml','.github/workflows/social-auth.yml'];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const blob=value=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');};
const baseline=new Map(git('ls-tree','-rz',shipped).toString().split('\0').filter(Boolean).map(line=>{
  const [meta,file]=line.split('\t'),[mode,type,hash]=meta.split(' ');
  assert.equal(type,'blob');return [file,{mode,hash}];
}));
const runnerHashes=new Map(runners.map(file=>[file,blob(git('show',shipped+':'+file).toString().replaceAll('tests/verify-193-build271-boundary.mjs',guard))]));
const paths=new Set([...baseline.keys(),...git('ls-files','-z','--cached','--others','--exclude-standard').toString().split('\0').filter(Boolean)]);
const current=new Map([...paths].map(file=>{
  const stat=lstatSync(join(root,file));
  assert.ok(stat.isFile(),'Followup source must be a regular file: '+file);
  return [file,{mode:stat.mode&0o111?'100755':'100644',hash:blob(readFileSync(join(root,file)))}];
}));

function verify(entries){
  for(const [file,entry] of entries){
    const original=baseline.get(file);
    assert.ok(original||allowed.has(file),'Unapproved followup path: '+file);
    assert.equal(entry.mode,original?.mode||'100644','Followup mode drift: '+file);
    if(runnerHashes.has(file))assert.equal(entry.hash,runnerHashes.get(file),'Only the boundary entrypoint may change: '+file);
    else if(!allowed.has(file))assert.equal(entry.hash,original.hash,'Shipped source/evidence changed outside followup scope: '+file);
  }
  for(const file of baseline.keys())assert.ok(entries.has(file),'Shipped file removed: '+file);
  for(const file of allowed)assert.ok(entries.has(file),'Missing reviewed followup file: '+file);
}
git('merge-base','--is-ancestor',shipped,'HEAD');
verify(current);
// A scope check must reject historical receipt, counter, runner, unknown-path
// and executable-mode drift even though it permits reviewed product edits.
for(const file of ['docs/qa/breeze-193-build271/boundary.json','tools/record-193-build271-boundary.mjs','tests/verify-193-build271-boundary.mjs','ios/App/App.xcodeproj/project.pbxproj','assets/onboarding/study-light.mp4',runners[0]]){
  const changed=new Map(current);changed.set(file,{...changed.get(file),hash:'0'.repeat(40)});
  assert.throws(()=>verify(changed),/changed|change/);
}
const unknown=new Map(current);unknown.set('unapproved-followup.js',{mode:'100644',hash:'0'.repeat(40)});
assert.throws(()=>verify(unknown),/Unapproved followup path/);
const executable=new Map(current);executable.set(guard,{...executable.get(guard),mode:'100755'});
assert.throws(()=>verify(executable),/mode drift/);

// Run the original positive and negative build271 contracts against the exact
// shipped tree. Never re-record shipped evidence to bless these new changes.
const scratch=mkdtempSync(join(tmpdir(),'breeze-271-historical-'));let registered=false;
try{
  git('worktree','add','--quiet','--detach',scratch,shipped);registered=true;
  execFileSync(process.execPath,['tests/verify-193-build271-boundary.mjs'],{cwd:scratch,stdio:'inherit'});
}finally{
  if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});
}
console.log('Post271 followup scope passed; shipped271 and historical release contracts remain exact. Product review guard: build271 counters remain unchanged until separate build272 packaging.');
