/* Build 267 pins the approved PR153 tree; build 266 evidence stays immutable. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const reviewedSource='d2c29b2df752cda43cd033d8906fe0efd9135656';
export const historical266='e9dc1f6986e1d73f1fd5df1aea9c50ad3723cae4';
const receiptFile='docs/qa/breeze-193-build267/boundary.json';
export const integrationFiles=[receiptFile,'tools/record-193-candidate-boundary.mjs','tests/verify-193-candidate-boundary.mjs','docs/decisions/025-breeze-193-build267.md'];
const versionFiles=['ios/App/App.xcodeproj/project.pbxproj','tools/verify-ios-release.mjs','tests/verify-ios-cloud-build.mjs','tools/ios-testflight.sh'];
const runnerFiles=['.github/workflows/design-brand.yml','.github/workflows/social-auth.yml','.github/workflows/integrity.yml'];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const bytes=(sha,file)=>git('show',sha+':'+file);
const read=file=>readFileSync(join(root,file));
const hash=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const tree=sha=>Object.fromEntries(git('ls-tree','-rz',sha).toString().split('\0').filter(Boolean).map(line=>{const [meta,file]=line.split('\t'),[mode,type,object]=meta.split(' ');assert.equal(type,'blob');return [file,{mode,object}];}));
export function expectedContract(){
 git('merge-base','--is-ancestor',historical266,reviewedSource);
 git('merge-base','--is-ancestor',reviewedSource,'HEAD');
 const files={};
 for(const file of versionFiles){
  let expected=bytes(reviewedSource,file).toString().replaceAll('266','267');
  if(file==='tools/verify-ios-release.mjs')expected=expected.replace('> 265n','> 266n').replace('must exceed released build 265','must exceed existing TestFlight build 266');
  if(file==='tests/verify-ios-cloud-build.mjs')expected=expected.replace("['267', '267',","['267', '268',").replace("'264', '265', '0'","'264', '265', '266', '0'");
  files[file]={mode:tree(reviewedSource)[file].mode,method:'exact build267 increment; existing TestFlight266 floor and counter/drift tests',sha256:hash(expected)};
 }
 for(const file of runnerFiles)files[file]={mode:'100644',method:'select build267 verifier; preserve historical266 checker',sha256:hash(bytes(reviewedSource,file).toString().replaceAll('tests/verify-193-integration-boundary.mjs','tests/verify-193-candidate-boundary.mjs'))};
 const followup=git('diff','--name-only',historical266,reviewedSource).toString().trim().split('\n');
 return {schemaVersion:1,version:'1.9.3',buildNumber:'267',previousTestFlightBuild:'266',historical266,reviewedSource,reviewedTree:git('rev-parse',reviewedSource+'^{tree}').toString().trim(),reviewedPR:153,followupSha256:Object.fromEntries(followup.map(file=>[file,hash(bytes(reviewedSource,file))])),files,integrationFiles};
}
function regular(file,mode='100644'){
 const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Candidate evidence/source must be a regular file: '+file);
 assert.equal(stat.mode&0o111?'100755':'100644',mode,'Candidate mode drift: '+file);
}
function verifyCurrent(contract){
 const baseline=tree(reviewedSource),permitted=new Set([...Object.keys(contract.files),...integrationFiles]);
 const changed=new Set([...git('diff','--name-only',reviewedSource).toString().split('\n'),...git('ls-files','--others','--exclude-standard').toString().split('\n')].filter(Boolean));
 for(const file of changed)assert.ok(permitted.has(file),'Unapproved build267 path: '+file);
 for(const [file,entry] of Object.entries(baseline)){
  if(permitted.has(file))continue;
  regular(file,entry.mode);assert.equal(blob(read(file)),entry.object,'Reviewed or historical source changed: '+file);
 }
 for(const [file,entry] of Object.entries(contract.files)){regular(file,entry.mode);assert.equal(hash(read(file)),entry.sha256,'Exact build267 release delta changed: '+file);}
}
export function verify267Boundary(receipt){
 for(const file of integrationFiles)regular(file);
 const expected=expectedContract();assert.deepEqual(Object.keys(receipt).sort(),[...Object.keys(expected),'integrationSha256'].sort());
 for(const key of Object.keys(expected))assert.deepEqual(receipt[key],expected[key],'Immutable build267 contract differs: '+key);
 verifyCurrent(expected);
 assert.deepEqual(Object.keys(receipt.integrationSha256).sort(),integrationFiles.filter(file=>file!==receiptFile).sort());
 for(const [file,value] of Object.entries(receipt.integrationSha256))assert.equal(hash(read(file)),value,'Candidate evidence drift: '+file);
}
export function verifyHistorical266(){
 const scratch=mkdtempSync(join(tmpdir(),'breeze-266-historical-'));let registered=false;
 try{git('worktree','add','--quiet','--detach',scratch,historical266);registered=true;execFileSync(process.execPath,['tests/verify-193-integration-boundary.mjs'],{cwd:scratch,stdio:'inherit'});}
 finally{if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
}
function record(){
 for(const file of integrationFiles)if(file!==receiptFile||lstatSync(join(root,file),{throwIfNoEntry:false}))regular(file);
 const contract=expectedContract();verifyCurrent(contract);
 const receipt={...contract,integrationSha256:Object.fromEntries(integrationFiles.filter(file=>file!==receiptFile).map(file=>[file,hash(read(file))]))};
 mkdirSync(join(root,'docs/qa/breeze-193-build267'),{recursive:true});writeFileSync(join(root,receiptFile),JSON.stringify(receipt,null,2)+'\n');verify267Boundary(receipt);
 console.log('Recorded build267: approved PR153 tree plus exact version/counter/runner deltas only.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))record();
