/* Build268 pins approved polished PR154; historical267/266 evidence stays immutable. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const reviewedSource='1075644dfe6293fa055f9d2d07eefc89358cf6ef';
export const historical267='e2c02c7e00ba4d99fc045427e0fb541438e0c3fd';
export const historical266='e9dc1f6986e1d73f1fd5df1aea9c50ad3723cae4';
const receiptFile='docs/qa/breeze-193-build268/boundary.json';
export const integrationFiles=[receiptFile,'tools/record-193-build268-boundary.mjs','tests/verify-193-build268-boundary.mjs','docs/decisions/026-breeze-193-build268.md'];
const versionFiles=['ios/App/App.xcodeproj/project.pbxproj','tools/verify-ios-release.mjs','tests/verify-ios-cloud-build.mjs','tools/ios-testflight.sh'];
const runnerFiles=['.github/workflows/design-brand.yml','.github/workflows/social-auth.yml','.github/workflows/integrity.yml'];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const bytes=(sha,file)=>git('show',sha+':'+file);
const read=file=>readFileSync(join(root,file));
const hash=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const tree=sha=>Object.fromEntries(git('ls-tree','-rz',sha).toString().split('\0').filter(Boolean).map(line=>{const [meta,file]=line.split('\t'),[mode,type,object]=meta.split(' ');assert.equal(type,'blob');return [file,{mode,object}];}));
export function expectedContract(){
 git('merge-base','--is-ancestor',historical267,reviewedSource);
 git('merge-base','--is-ancestor',reviewedSource,'HEAD');
 const files={};
 for(const file of versionFiles){
  let expected=bytes(reviewedSource,file).toString().replaceAll('267','268');
  if(file==='tools/verify-ios-release.mjs')expected=expected.replace('> 266n','> 267n').replace('existing TestFlight build 266','existing TestFlight build 267');
  if(file==='tests/verify-ios-cloud-build.mjs')expected=expected.replace("['268', '268',","['268', '269',").replace("'265', '266', '0'","'265', '266', '267', '0'");
  files[file]={mode:tree(reviewedSource)[file].mode,method:'exact268 increment; reject existing267 or lower; preserve counter/drift tests',sha256:hash(expected)};
 }
 for(const file of runnerFiles)files[file]={mode:'100644',method:'select268 verifier; preserve historical267/266 checkers',sha256:hash(bytes(reviewedSource,file).toString().replaceAll('tests/verify-193-candidate-boundary.mjs','tests/verify-193-build268-boundary.mjs'))};
 const followup=git('diff','--name-only',historical267,reviewedSource).toString().trim().split('\n');
 return {schemaVersion:1,version:'1.9.3',buildNumber:'268',previousTestFlightBuild:'267',historical267,historical266,reviewedSource,reviewedTree:git('rev-parse',reviewedSource+'^{tree}').toString().trim(),reviewedPR:154,followupSha256:Object.fromEntries(followup.map(file=>[file,hash(bytes(reviewedSource,file))])),files,integrationFiles};
}

function regular(file,mode='100644'){
 const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Candidate evidence/source must be a regular file: '+file);
 assert.equal(stat.mode&0o111?'100755':'100644',mode,'Candidate mode drift: '+file);
}
function verifyCurrent(contract){
 const baseline=tree(reviewedSource),permitted=new Set([...Object.keys(contract.files),...integrationFiles]);
 const changed=new Set([...git('diff','--name-only',reviewedSource).toString().split('\n'),...git('ls-files','--others','--exclude-standard').toString().split('\n')].filter(Boolean));
 for(const file of changed)assert.ok(permitted.has(file),'Unapproved build268 path: '+file);
 for(const [file,entry] of Object.entries(baseline)){
  if(permitted.has(file))continue;
  regular(file,entry.mode);assert.equal(blob(read(file)),entry.object,'Reviewed or historical source changed: '+file);
 }
 for(const [file,entry] of Object.entries(contract.files)){regular(file,entry.mode);assert.equal(hash(read(file)),entry.sha256,'Exact build268 release delta changed: '+file);}
}
export function verify268Boundary(receipt){
 for(const file of integrationFiles)regular(file);
 const expected=expectedContract();assert.deepEqual(Object.keys(receipt).sort(),[...Object.keys(expected),'integrationSha256'].sort());
 for(const key of Object.keys(expected))assert.deepEqual(receipt[key],expected[key],'Immutable build268 contract differs: '+key);
 verifyCurrent(expected);
 assert.deepEqual(Object.keys(receipt.integrationSha256).sort(),integrationFiles.filter(file=>file!==receiptFile).sort());
 for(const [file,value] of Object.entries(receipt.integrationSha256))assert.equal(hash(read(file)),value,'Candidate evidence drift: '+file);
}
export function verifyHistorical267(){
 const scratch=mkdtempSync(join(tmpdir(),'breeze-267-historical-'));let registered=false;
 try{git('worktree','add','--quiet','--detach',scratch,historical267);registered=true;execFileSync(process.execPath,['tests/verify-193-candidate-boundary.mjs'],{cwd:scratch,stdio:'inherit'});}
 finally{if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
}
function record(){
 for(const file of integrationFiles)if(file!==receiptFile||lstatSync(join(root,file),{throwIfNoEntry:false}))regular(file);
 const contract=expectedContract();verifyCurrent(contract);
 const receipt={...contract,integrationSha256:Object.fromEntries(integrationFiles.filter(file=>file!==receiptFile).map(file=>[file,hash(read(file))]))};
 mkdirSync(join(root,'docs/qa/breeze-193-build268'),{recursive:true});writeFileSync(join(root,receiptFile),JSON.stringify(receipt,null,2)+'\n');verify268Boundary(receipt);
 console.log('Recorded build268: approved polished PR154 tree plus exact version/counter/runner deltas only.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))record();
