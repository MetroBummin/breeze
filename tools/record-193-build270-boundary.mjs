/* Build270 pins the approved PR156 source; historical269/268/267/266 remain immutable. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const reviewedSource='f0b43aa2496b19c3b55ac52e4d93e3c3892cc538';
export const historical269='2c82442b082ae148bcf41c0377d0f7ec108e9c23';
export const historical268='044f9ffdf610815c8d88b5ca8c816169e2815d01';
export const historical267='e2c02c7e00ba4d99fc045427e0fb541438e0c3fd';
export const historical266='e9dc1f6986e1d73f1fd5df1aea9c50ad3723cae4';
const receiptFile='docs/qa/breeze-193-build270/boundary.json';
export const integrationFiles=[receiptFile,'tools/record-193-build270-boundary.mjs','tests/verify-193-build270-boundary.mjs','docs/decisions/028-breeze-193-build270.md','docs/qa/breeze-193-build270/native-assets.json','docs/qa/breeze-193-build270/local-validation.json'];
const versionFiles=['ios/App/App.xcodeproj/project.pbxproj','tools/verify-ios-release.mjs','tests/verify-ios-cloud-build.mjs','tools/ios-testflight.sh'];
const runnerFiles=['.github/workflows/design-brand.yml','.github/workflows/social-auth.yml','.github/workflows/integrity.yml','.github/workflows/study-sets.yml','tests/helpers/app-icon-family-scenes.mjs'];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const bytes=(sha,file)=>git('show',sha+':'+file);
const read=file=>readFileSync(join(root,file));
const hash=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const tree=sha=>Object.fromEntries(git('ls-tree','-rz',sha).toString().split('\0').filter(Boolean).map(line=>{const [meta,file]=line.split('\t'),[mode,type,object]=meta.split(' ');assert.equal(type,'blob');return [file,{mode,object}];}));
export function expectedContract(){
 git('merge-base','--is-ancestor',historical269,reviewedSource);
 git('merge-base','--is-ancestor',reviewedSource,'HEAD');
 const files={};
 // This refreshed reviewed source already contains270 counters, exact engine
 // ownership and durable capture ordering. Pin their bytes with the whole tree;
 // no further product or runner normalization is permitted in release metadata.
 for(const file of [...versionFiles,...runnerFiles]){
  files[file]={mode:tree(reviewedSource)[file].mode,method:'exact reviewed270 source; existing269/lower rejected by native release contracts',sha256:hash(bytes(reviewedSource,file))};
 }
 const followup=git('diff','--name-only',historical269,reviewedSource).toString().trim().split('\n');
 return {schemaVersion:1,version:'1.9.3',buildNumber:'270',previousTestFlightBuild:'269',historical269,historical268,historical267,historical266,reviewedSource,reviewedTree:git('rev-parse',reviewedSource+'^{tree}').toString().trim(),reviewedPR:156,storageOrigin:'b5ec2f3755917b978c5d344f9a07bf173851e7b7',storageIntegration:'075922e',followupSha256:Object.fromEntries(followup.map(file=>[file,hash(bytes(reviewedSource,file))])),files,integrationFiles};
}

function regular(file,mode='100644'){
 const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Candidate evidence/source must be a regular file: '+file);
 assert.equal(stat.mode&0o111?'100755':'100644',mode,'Candidate mode drift: '+file);
}
function verifyCurrent(contract){
 const baseline=tree(reviewedSource),permitted=new Set([...Object.keys(contract.files),...integrationFiles]);
 const changed=new Set([...git('diff','--name-only',reviewedSource).toString().split('\n'),...git('ls-files','--others','--exclude-standard').toString().split('\n')].filter(Boolean));
 for(const file of changed)assert.ok(permitted.has(file),'Unapproved build270 path: '+file);
 for(const [file,entry] of Object.entries(baseline)){
  if(permitted.has(file))continue;
  regular(file,entry.mode);assert.equal(blob(read(file)),entry.object,'Reviewed or historical source changed: '+file);
 }
 for(const [file,entry] of Object.entries(contract.files)){regular(file,entry.mode);assert.equal(hash(read(file)),entry.sha256,'Exact build270 release delta changed: '+file);}
}
export function verify270Boundary(receipt){
 for(const file of integrationFiles)regular(file);
 const expected=expectedContract();assert.deepEqual(Object.keys(receipt).sort(),[...Object.keys(expected),'integrationSha256'].sort());
 for(const key of Object.keys(expected))assert.deepEqual(receipt[key],expected[key],'Immutable build270 contract differs: '+key);
 verifyCurrent(expected);
 assert.deepEqual(Object.keys(receipt.integrationSha256).sort(),integrationFiles.filter(file=>file!==receiptFile).sort());
 for(const [file,value] of Object.entries(receipt.integrationSha256))assert.equal(hash(read(file)),value,'Candidate evidence drift: '+file);
}
export function verifyHistorical269(){
 const scratch=mkdtempSync(join(tmpdir(),'breeze-269-historical-'));let registered=false;
 try{git('worktree','add','--quiet','--detach',scratch,historical269);registered=true;execFileSync(process.execPath,['tests/verify-193-build269-boundary.mjs'],{cwd:scratch,stdio:'inherit'});}
 finally{if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
}
function record(){
 for(const file of integrationFiles)if(file!==receiptFile||lstatSync(join(root,file),{throwIfNoEntry:false}))regular(file);
 const contract=expectedContract();verifyCurrent(contract);
 const receipt={...contract,integrationSha256:Object.fromEntries(integrationFiles.filter(file=>file!==receiptFile).map(file=>[file,hash(read(file))]))};
 mkdirSync(join(root,'docs/qa/breeze-193-build270'),{recursive:true});writeFileSync(join(root,receiptFile),JSON.stringify(receipt,null,2)+'\n');verify270Boundary(receipt);
 console.log('Recorded build270: approved PR156 learning/storage/header/handoff tree and exact270 counters; metadata only.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))record();
