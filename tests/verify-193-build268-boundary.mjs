import {readFileSync} from 'node:fs';
import {verify268Boundary,verifyHistorical267} from '../tools/record-193-build268-boundary.mjs';
const receipt=JSON.parse(readFileSync(new URL('../docs/qa/breeze-193-build268/boundary.json',import.meta.url)));
verify268Boundary(receipt);
verifyHistorical267();
console.log('Build268 boundary passed: approved polished PR154 source, exact version/counter/runner delta, unchanged historical267/266/192/191 contracts.');

// Prove that recording a receipt cannot bless unrelated or historical drift.
// Each mutation is restored in finally before any later build step can run.
const {writeFileSync,unlinkSync,existsSync,chmodSync,symlinkSync}=await import('node:fs');
const {default:assert}=await import('node:assert/strict');
const {spawnSync}=await import('node:child_process');
const changed=structuredClone(receipt);changed.reviewedSource='0'.repeat(40);
assert.throws(()=>verify268Boundary(changed),/Immutable build268 contract differs/);
for(const file of ['scripts/core/study-sets.js','docs/qa/breeze-192-integration/boundary.json','docs/qa/breeze-193-integration/boundary.json','tools/record-193-integration-boundary.mjs','tools/record-193-build268-boundary.mjs','tools/record-193-candidate-boundary.mjs','tests/verify-193-candidate-boundary.mjs','docs/qa/breeze-193-build267/boundary.json']){
 const path=new URL('../'+file,import.meta.url),original=readFileSync(path);
 try{writeFileSync(path,Buffer.concat([original,Buffer.from('\n// deliberate boundary regression\n')]));assert.throws(()=>verify268Boundary(receipt),/changed|drift|Unapproved build268 path/);}
 finally{writeFileSync(path,original);}
}
const extra=new URL('../breeze-193-unapproved-probe.txt',import.meta.url);
assert.equal(existsSync(extra),false);
try{writeFileSync(extra,'boundary regression probe\n');assert.throws(()=>verify268Boundary(receipt),/Unapproved build268 path/);}
finally{if(existsSync(extra))unlinkSync(extra);}
for(const file of ['tools/record-193-build268-boundary.mjs','docs/qa/breeze-193-build268/boundary.json']){
 const path=new URL('../'+file,import.meta.url),original=readFileSync(path);
 try{chmodSync(path,0o755);assert.throws(()=>verify268Boundary(receipt),/mode drift/);}
 finally{chmodSync(path,0o644);}
 if(file.endsWith('boundary.json')){
  try{unlinkSync(path);symlinkSync('../../../package.json',path);assert.throws(()=>verify268Boundary(receipt),/regular file/);}
  finally{unlinkSync(path);writeFileSync(path,original,{mode:0o644});}
 }
}
const receiptPath=new URL('../docs/qa/breeze-193-build268/boundary.json',import.meta.url);
const receiptBytes=readFileSync(receiptPath),dangling=new URL('../docs/qa/breeze-193-integration/must-not-be-created.json',import.meta.url);
assert.equal(existsSync(dangling),false);
try{
 unlinkSync(receiptPath);symlinkSync('must-not-be-created.json',receiptPath);
 const attempt=spawnSync(process.execPath,['tools/record-193-build268-boundary.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
 assert.notEqual(attempt.status,0);assert.match(attempt.stderr,/regular file/);assert.equal(existsSync(dangling),false,'Recorder must not follow a dangling receipt link');
}finally{unlinkSync(receiptPath);writeFileSync(receiptPath,receiptBytes,{mode:0o644});}
verify268Boundary(receipt);
console.log('Build268 negative checks passed: changed approved source, historical receipts/checker, candidate evidence and unapproved path all rejected.');
