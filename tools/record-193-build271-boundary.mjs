/* Build271 packages the exact tested PR158 source; historical guards stay intact. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const reviewedSource='78967ed9f61091f25fa42a9df0eebdb11e770e82';
const receiptFile='docs/qa/breeze-193-build271/boundary.json';
export const integrationFiles=[receiptFile,'tools/record-193-build271-boundary.mjs','tests/verify-193-build271-boundary.mjs','docs/decisions/029-breeze-193-build271.md','docs/qa/breeze-193-build271/native-assets.json','docs/qa/breeze-193-build271/local-validation.json'];
const versionFiles=['ios/App/App.xcodeproj/project.pbxproj','tools/verify-ios-release.mjs','tests/verify-ios-cloud-build.mjs','tools/ios-testflight.sh'];
const runners=['.github/workflows/design-brand.yml','.github/workflows/social-auth.yml','.github/workflows/integrity.yml'];
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const read=file=>readFileSync(join(root,file));
const hash=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const tree=()=>Object.fromEntries(git('ls-tree','-rz',reviewedSource).toString().split('\0').filter(Boolean).map(line=>{const [meta,file]=line.split('\t'),[mode,type,object]=meta.split(' ');assert.equal(type,'blob');return [file,{mode,object}];}));
function expectedBytes(file){
 let source=git('show',reviewedSource+':'+file).toString();
 if(runners.includes(file))return Buffer.from(source.replaceAll('tests/verify-post270-followup-boundary.mjs','tests/verify-193-build271-boundary.mjs'));
 source=source.replaceAll('270','271');
 if(file==='tools/verify-ios-release.mjs')source=source.replaceAll('269','270');
 if(file==='tests/verify-ios-cloud-build.mjs')source=source.replace("['271', '271',", "['271', '272',").replace("'268', '269',", "'268', '269', '270',");
 return Buffer.from(source);
}
function regular(file,mode='100644'){
 const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'Expected regular file: '+file);
 assert.equal(stat.mode&0o111?'100755':'100644',mode,'Candidate mode drift: '+file);
}
export function expectedContract(){
 git('merge-base','--is-ancestor',reviewedSource,'HEAD');const baseline=tree();
 return {schemaVersion:1,version:'1.9.3',buildNumber:'271',previousTestFlightBuild:'270',reviewedPR:158,reviewedSource,reviewedTree:git('rev-parse',reviewedSource+'^{tree}').toString().trim(),files:Object.fromEntries([...versionFiles,...runners].map(file=>[file,{mode:baseline[file].mode,sha256:hash(expectedBytes(file))}])),integrationFiles};
}
function verifyCurrent(contract){
 const baseline=tree(),permitted=new Set([...Object.keys(contract.files),...integrationFiles]);
 const changed=new Set([...git('diff','--name-only',reviewedSource).toString().split('\n'),...git('ls-files','--others','--exclude-standard').toString().split('\n')].filter(Boolean));
 for(const file of changed)assert.ok(permitted.has(file),'Unapproved build271 path: '+file);
 for(const [file,entry] of Object.entries(baseline)){
  if(permitted.has(file))continue;
  regular(file,entry.mode);assert.equal(blob(read(file)),entry.object,'Tested or historical source changed: '+file);
 }
 for(const [file,entry] of Object.entries(contract.files)){regular(file,entry.mode);assert.equal(hash(read(file)),entry.sha256,'Exact build271 packaging delta changed: '+file);}
}
export function verify271Boundary(receipt){
 for(const file of integrationFiles)regular(file);
 const expected=expectedContract();assert.deepEqual(Object.keys(receipt).sort(),[...Object.keys(expected),'integrationSha256'].sort());
 for(const key of Object.keys(expected))assert.deepEqual(receipt[key],expected[key],'Immutable build271 contract differs: '+key);
 verifyCurrent(expected);
 assert.deepEqual(Object.keys(receipt.integrationSha256).sort(),integrationFiles.filter(file=>file!==receiptFile).sort());
 for(const [file,value] of Object.entries(receipt.integrationSha256))assert.equal(hash(read(file)),value,'Candidate evidence drift: '+file);
}
export function verifyReviewedFollowup(){
 const scratch=mkdtempSync(join(tmpdir(),'breeze-271-reviewed-'));let registered=false;
 try{git('worktree','add','--quiet','--detach',scratch,reviewedSource);registered=true;execFileSync(process.execPath,['tests/verify-post270-followup-boundary.mjs'],{cwd:scratch,stdio:'inherit'});}
 finally{if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
}
function record(){
 for(const file of integrationFiles)if(file!==receiptFile||lstatSync(join(root,file),{throwIfNoEntry:false}))regular(file);
 const contract=expectedContract();verifyCurrent(contract);
 const receipt={...contract,integrationSha256:Object.fromEntries(integrationFiles.filter(file=>file!==receiptFile).map(file=>[file,hash(read(file))]))};
 mkdirSync(join(root,'docs/qa/breeze-193-build271'),{recursive:true});writeFileSync(join(root,receiptFile),JSON.stringify(receipt,null,2)+'\n');verify271Boundary(receipt);
 console.log('Recorded build271: exact tested PR158 source; counters and packaging only.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))record();
