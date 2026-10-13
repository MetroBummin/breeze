// Review scope only. Preserve released272 and all earlier receipts/counters.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const base='5f8b178e45727948690c0ce52d1e5f0a30362544';
const released='37de13779b99bdfed7f0b20809577619f163f705';
const guard='tests/verify-vocabulary-export-boundary.mjs';
const allowed=new Set([
  guard,'scripts/dictionary/dictionary.js','tests/verify-vocabulary-export-browser.mjs',
  'tests/verify-reader-refinements-browser.mjs','docs/decisions/003-shared-control-glass.md',
  'index.html','sw.js','.github/workflows/vocabulary-export.yml'
]);
const runners=['.github/workflows/integrity.yml','.github/workflows/design-brand.yml','.github/workflows/social-auth.yml'];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const original=file=>git('show',base+':'+file).toString();
const baseline=new Map(git('ls-tree','-rz',base).toString().split('\0').filter(Boolean).map(line=>{
  const [meta,file]=line.split('\t'),[mode,type,hash]=meta.split(' ');assert.equal(type,'blob');return [file,{mode,hash}];
}));
const runnerHashes=new Map(runners.map(file=>[file,blob(Buffer.from(original(file).replaceAll('tests/verify-193-build272-boundary.mjs',guard)))]));
const paths=new Set([...baseline.keys(),...git('ls-files','-z','--cached','--others','--exclude-standard').toString().split('\0').filter(Boolean)]);
const current=new Map([...paths].map(file=>{
  const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Expected regular file: '+file);
  return [file,{mode:stat.mode&0o111?'100755':'100644',hash:blob(readFileSync(join(root,file)))}];
}));
function verify(entries){
  for(const [file,entry] of entries){
    const before=baseline.get(file);assert.ok(before||allowed.has(file),'Unapproved export path: '+file);
    assert.equal(entry.mode,before?.mode||'100644','Export mode drift: '+file);
    if(runnerHashes.has(file))assert.equal(entry.hash,runnerHashes.get(file),'Only boundary entrypoint may change: '+file);
    else if(!allowed.has(file))assert.equal(entry.hash,before.hash,'Source outside export scope changed: '+file);
  }
  for(const file of baseline.keys())assert.ok(entries.has(file),'Baseline file removed: '+file);
  for(const file of allowed)assert.ok(entries.has(file),'Missing export scope file: '+file);
}
git('merge-base','--is-ancestor',base,'HEAD');verify(current);
for(const file of ['ios/App/App.xcodeproj/project.pbxproj','ios/App/App/SceneDelegate.swift','package.json','docs/qa/breeze-193-build272/boundary.json','tools/record-193-build272-boundary.mjs','tests/verify-193-build272-boundary.mjs',runners[0]]){
  const changed=new Map(current);changed.set(file,{...changed.get(file),hash:'0'.repeat(40)});assert.throws(()=>verify(changed),/change/);
}
const unknown=new Map(current);unknown.set('unapproved-export.js',{mode:'100644',hash:'0'.repeat(40)});assert.throws(()=>verify(unknown),/Unapproved export path/);
const executable=new Map(current);executable.set(guard,{...executable.get(guard),mode:'100755'});assert.throws(()=>verify(executable),/mode drift/);
const read=file=>readFileSync(join(root,file),'utf8');
assert.equal(read('index.html').replace(/\?v=[a-f0-9]+/g,''),original('index.html').replace(/\?v=[a-f0-9]+/g,''),'HTML may change only asset stamps');
assert.equal(read('sw.js').replace(/^const VERSION = '[^']*';$/m,''),original('sw.js').replace(/^const VERSION = '[^']*';$/m,''),'Only the shell cache stamp may change');
assert.equal(read('scripts/dictionary/dictionary.js').split('function csvCell(')[0],original('scripts/dictionary/dictionary.js').split('function csvCell(')[0],'Dictionary lookup must remain unchanged');

// The current main includes a later Apple request, so run the immutable release
// contract on its actual release commit, not a modified working tree.
const scratch=mkdtempSync(join(tmpdir(),'breeze-export-released272-'));let registered=false;
try{
  git('worktree','add','--quiet','--detach',scratch,released);registered=true;
  execFileSync(process.execPath,['tests/verify-193-build272-boundary.mjs'],{cwd:scratch,stdio:'inherit'});
}finally{
  if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});
}
console.log('Vocabulary export scope passed; released272 and historical contracts remain exact, with unchanged native source and version counters.');
