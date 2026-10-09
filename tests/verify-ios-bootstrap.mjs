import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';

// Execute the complete production hook in an isolated shell. Only the external
// tool boundary is simulated; no network, real installation or shared locks.
const hook=readFileSync(new URL('../ios/App/ci_scripts/ci_post_clone.sh',import.meta.url),'utf8');
const driver=`#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.BREEZE_FIXTURE;
const statePath=path.join(root,'state.json');
const state=JSON.parse(fs.readFileSync(statePath));
const args=process.argv.slice(2),tool=path.basename(process.argv[1]);
const record=value=>fs.appendFileSync(path.join(root,'events.jsonl'),JSON.stringify(value)+'\\n');
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state));
const install=()=>{
 fs.mkdirSync(path.join(state.prefix,'bin'),{recursive:true});
 for(const name of ['node','npm'])fs.copyFileSync(path.join(root,'driver'),path.join(state.prefix,'bin',name));
 for(const name of ['node','npm'])fs.chmodSync(path.join(state.prefix,'bin',name),0o755);
};
if(tool==='brew'){
 if(args.join(' ')==='--prefix node@22'){record({tool,args});console.log(state.prefix);process.exit(0);}
 record({tool,args,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('HOMEBREW_')))});
 if(args.join(' ')!=='install node@22')process.exit(90);
 state.attempts++;save();
 if(state.failure==='checksum'){console.error('Error: SHA256 mismatch');process.exit(1);}
 if(state.failure==='network'){console.error('Error: Failed to download resource node@22');process.exit(1);}
 if(state.failure==='lock'||state.attempts<=(state.locks||0)){
  console.error('Error: A brew install node@22 process has already locked /opt/homebrew/Cellar/openssl@3');process.exit(1);
 }
 install();process.exit(0);
}
if(tool==='sleep'){record({tool,args});if(state.peerFinishes)install();process.exit(0);}
const inKeg=process.argv[1].startsWith(state.prefix+path.sep);
if(tool==='node'){
 if(args[0]==='-e'){
  vm.runInNewContext(args[1],{process:{versions:{node:(inKeg?state.kegMajor:state.pathMajor)+'.0.0'},exit:code=>process.exit(code)}});process.exit(0);
 }
 if(args[0]==='--version'){console.log('v'+(inKeg?state.kegMajor:state.pathMajor)+'.0.0');process.exit(0);}
 record({tool,args});process.exit(state.releaseFails?3:0);
}
if(tool==='npm'){
 if(args[0]==='--version'){console.log('10.9.0');process.exit(state.brokenNpm?1:0);}
 record({tool,args});process.exit(0);
}
process.exit(91);
`;
function run(options={}){
  const root=mkdtempSync(join(tmpdir(),'breeze bootstrap '));
  try{
    const bin=join(root,'bin'),prefix=join(root,'Homebrew keg with spaces'),temp=join(root,'temporary files');
    mkdirSync(bin);mkdirSync(temp);mkdirSync(join(root,'ios/App/ci_scripts'),{recursive:true});
    writeFileSync(join(root,'ios/App/ci_scripts/ci_post_clone.sh'),options.historicalHook||hook);
    writeFileSync(join(root,'driver'),driver,{mode:0o755});
    const state={prefix,attempts:0,kegMajor:22,...options};delete state.historicalHook;
    writeFileSync(join(root,'state.json'),JSON.stringify(state));
    for(const name of ['dirname','mktemp','cat','grep','rm'])symlinkSync(execFileSync('/bin/sh',['-c','command -v '+name],{encoding:'utf8'}).trim(),join(bin,name));
    for(const name of ['brew','sleep',...(options.pathMajor?['node','npm']:[])])symlinkSync(join(root,'driver'),join(bin,name));
    if(options.installed){
      mkdirSync(join(prefix,'bin'),{recursive:true});
      for(const name of ['node','npm'])writeFileSync(join(prefix,'bin',name),driver,{mode:0o755});
    }
    const result=spawnSync('/bin/sh',[join(root,'ios/App/ci_scripts/ci_post_clone.sh')],{
      encoding:'utf8',timeout:15000,env:{PATH:bin,TMPDIR:temp,BREEZE_FIXTURE:root,CI_BUILD_NUMBER:'900'}
    });
    assert.ifError(result.error);
    const events=existsSync(join(root,'events.jsonl'))?readFileSync(join(root,'events.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
    assert.deepEqual(readdirSync(temp),[],'Own temporary log must be removed on success/failure');
    return {...result,events};
  }finally{rmSync(root,{recursive:true,force:true});}
}
const installs=r=>r.events.filter(e=>e.tool==='brew'&&e.args[0]==='install');
const waits=r=>r.events.filter(e=>e.tool==='sleep');
const downstream=r=>r.events.filter(e=>e.tool==='node'||e.tool==='npm');
function successful(result){
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(downstream(result),[
    {tool:'node',args:['tools/verify-ios-release.mjs','--apply-cloud-build']},
    {tool:'npm',args:['ci','--ignore-scripts','--no-audit','--no-fund']},
    {tool:'npm',args:['test']},{tool:'npm',args:['run','ios:sync']}
  ]);
  for(const entry of installs(result))assert.deepEqual(entry.env,{HOMEBREW_NO_AUTO_UPDATE:'1',HOMEBREW_NO_INSTALL_UPGRADE:'1',HOMEBREW_NO_INSTALL_CLEANUP:'1'});
}
test('working PATH Node 22 avoids Homebrew entirely',()=>{
  const r=run({pathMajor:22});successful(r);assert.equal(r.events.filter(e=>e.tool==='brew').length,0);
});
test('installed keg-only Node 22 avoids the observed install lock even off PATH',()=>{
  const r=run({installed:true,failure:'lock'});successful(r);assert.equal(installs(r).length,0);
});
for(const pathMajor of [20,24])test('wrong PATH Node '+pathMajor+' selects existing Node 22 without upgrading',()=>{
  const r=run({pathMajor,installed:true});successful(r);assert.equal(installs(r).length,0);
});
test('missing formula installs once with verification enabled, then keeps release/test/sync order',()=>{
  const r=run();successful(r);assert.equal(installs(r).length,1);assert.equal(waits(r).length,0);
});
test('a competing installer completing during the wait is reused without another install',()=>{
  const r=run({locks:1,peerFinishes:true});successful(r);assert.equal(installs(r).length,1);assert.deepEqual(waits(r).map(e=>e.args),[['5']]);
});
test('transient openssl lock retries and then installs successfully',()=>{
  const r=run({locks:2});successful(r);assert.equal(installs(r).length,3);assert.equal(waits(r).length,2);
});
test('persistent lock has a finite bound and never starts release mutation or npm',()=>{
  const r=run({failure:'lock'});assert.equal(r.status,1);assert.equal(installs(r).length,12);assert.equal(waits(r).length,11);assert.deepEqual(downstream(r),[]);
});
for(const failure of ['checksum','network'])test(failure+' failure is immediate and retains the Homebrew diagnostic',()=>{
  const r=run({failure});assert.equal(r.status,1);assert.equal(installs(r).length,1);assert.equal(waits(r).length,0);assert.deepEqual(downstream(r),[]);assert.match(r.stderr,/Error:/);
});
for(const options of [{kegMajor:20},{brokenNpm:true}])test('an installation without usable Node 22/npm fails before project mutation: '+JSON.stringify(options),()=>{
  const r=run(options);assert.equal(r.status,1);assert.deepEqual(downstream(r),[]);assert.match(r.stderr,/working Node 22\/npm/);
});
test('invalid release metadata stops the unchanged verification chain before npm',()=>{
  const r=run({installed:true,releaseFails:true});assert.equal(r.status,3);assert.deepEqual(downstream(r),[{tool:'node',args:['tools/verify-ios-release.mjs','--apply-cloud-build']}]);
});
test('all shared Homebrew locks remain managed by Homebrew',()=>{
  assert.doesNotMatch(hook,/brew\s+(?:update|upgrade)|--force|--ignore-dependencies|--insecure|HOMEBREW_NO_VERIFY|rm[^\n]*(?:Cellar|\.locks)/);
  assert.equal(spawnSync('/bin/sh',['-n'],{input:hook,encoding:'utf8'}).status,0);
});
