import {readFileSync} from 'node:fs';
import {verify272Boundary,verifyReviewedFollowup} from '../tools/record-193-build272-boundary.mjs';
const receipt=JSON.parse(readFileSync(new URL('../docs/qa/breeze-193-build272/boundary.json',import.meta.url)));
verify272Boundary(receipt);
console.log('Build272 boundary passed: exact tested PR159 source, restricted counter/runner packaging delta.');

// Prove that recording a receipt cannot bless unrelated or historical drift.
// Each mutation is restored in finally before any later build step can run.
const {writeFileSync,unlinkSync,existsSync,chmodSync,symlinkSync}=await import('node:fs');
const {default:assert}=await import('node:assert/strict');
const {spawnSync}=await import('node:child_process');
const changed=structuredClone(receipt);changed.reviewedSource='0'.repeat(40);
assert.throws(()=>verify272Boundary(changed),/Immutable build272 contract differs/);
for(const file of ['scripts/ui/study-sets.js','scripts/ui/vocabulary-review.js','styles/study-sets.css','docs/qa/breeze-193-build271/boundary.json','tools/record-193-build271-boundary.mjs','tests/verify-193-build271-boundary.mjs','tests/verify-post270-followup-boundary.mjs','scripts/ui/study-motion.js','scripts/reader/pdf-pinch.js','tests/verify-post271-followup-boundary.mjs','docs/qa/breeze-193-build270/boundary.json','ios/App/App.xcodeproj/project.pbxproj','tests/helpers/app-icon-family-scenes.mjs','.github/workflows/study-sets.yml','scripts/core/study-sets.js','docs/qa/breeze-192-integration/boundary.json','docs/qa/breeze-193-integration/boundary.json','tools/record-193-integration-boundary.mjs','tools/record-193-build272-boundary.mjs','tools/record-193-build269-boundary.mjs','tests/verify-193-build269-boundary.mjs','docs/qa/breeze-193-build269/boundary.json','tools/record-193-candidate-boundary.mjs','tests/verify-193-candidate-boundary.mjs','docs/qa/breeze-193-build267/boundary.json']){
 const path=new URL('../'+file,import.meta.url),original=readFileSync(path);
 try{writeFileSync(path,Buffer.concat([original,Buffer.from('\n// deliberate boundary regression\n')]));assert.throws(()=>verify272Boundary(receipt),/changed|drift|Unapproved build272 path/);}
 finally{writeFileSync(path,original);}
}
const extra=new URL('../breeze-193-unapproved-probe.txt',import.meta.url);
assert.equal(existsSync(extra),false);
try{writeFileSync(extra,'boundary regression probe\n');assert.throws(()=>verify272Boundary(receipt),/Unapproved build272 path/);}
finally{if(existsSync(extra))unlinkSync(extra);}
for(const file of ['tools/record-193-build272-boundary.mjs','docs/qa/breeze-193-build272/boundary.json']){
 const path=new URL('../'+file,import.meta.url),original=readFileSync(path);
 try{chmodSync(path,0o755);assert.throws(()=>verify272Boundary(receipt),/mode drift/);}
 finally{chmodSync(path,0o644);}
 if(file.endsWith('boundary.json')){
  try{unlinkSync(path);symlinkSync('../../../package.json',path);assert.throws(()=>verify272Boundary(receipt),/regular file/);}
  finally{unlinkSync(path);writeFileSync(path,original,{mode:0o644});}
 }
}
const receiptPath=new URL('../docs/qa/breeze-193-build272/boundary.json',import.meta.url);
const receiptBytes=readFileSync(receiptPath),dangling=new URL('../docs/qa/breeze-193-integration/must-not-be-created.json',import.meta.url);
assert.equal(existsSync(dangling),false);
try{
 unlinkSync(receiptPath);symlinkSync('must-not-be-created.json',receiptPath);
 const attempt=spawnSync(process.execPath,['tools/record-193-build272-boundary.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
 assert.notEqual(attempt.status,0);assert.match(attempt.stderr,/regular file/);assert.equal(existsSync(dangling),false,'Recorder must not follow a dangling receipt link');
}finally{unlinkSync(receiptPath);writeFileSync(receiptPath,receiptBytes,{mode:0o644});}
verify272Boundary(receipt);
console.log('Build272 negative checks passed: changed approved source, historical receipts/checker, candidate evidence and unapproved path all rejected.');

verifyReviewedFollowup();
console.log('Build272 reviewed-source and unchanged historical contracts passed.');
