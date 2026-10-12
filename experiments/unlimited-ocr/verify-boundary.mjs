// This experiment is not a release candidate. Preserve the original verifier
// and receipts, verify every baseline byte, then run that verifier on its base.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const pinnedBase='8512e8fd25e51d6aa06cf926bad165d5c3994865';
const workflow='.github/workflows/integrity.yml';
export const originalGate='      - run: node tests/verify-192-integration-boundary.mjs';
export const experimentGate=`      - name: Verify release or isolated Unlimited-OCR boundary
        env:
          BREEZE_PR_HEAD: \${{ github.head_ref }}
        run: |
          if [ "$BREEZE_PR_HEAD" = "experiment/unlimited-ocr-comparison" ]; then
            node experiments/unlimited-ocr/verify-boundary.mjs
            node --test experiments/unlimited-ocr/contract.test.mjs experiments/unlimited-ocr/boundary.test.mjs
          else
            node tests/verify-192-integration-boundary.mjs
          fi`;
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
export function checkEntries(baseline,current,baseWorkflow,currentWorkflow) {
  assert.ok(baseWorkflow.includes(originalGate),'missing original release gate');
  assert.equal(currentWorkflow,baseWorkflow.replace(originalGate,experimentGate),'unapproved workflow change');
  for(const [file,entry] of Object.entries(baseline)) {
    assert.ok(current[file],'baseline deletion: '+file);
    assert.equal(current[file].mode,entry.mode,'baseline mode change: '+file);
    if(file!==workflow) assert.equal(current[file].object,entry.object,'baseline bytes changed: '+file);
  }
  for(const [file,entry] of Object.entries(current)) {
    if(baseline[file]) continue;
    assert.ok(file.startsWith('experiments/unlimited-ocr/'),'unapproved addition: '+file);
    assert.equal(entry.mode,'100644','experimental file must be regular nonexecutable: '+file);
  }
}
export function verifyBoundary() {
  git('merge-base','--is-ancestor',pinnedBase,'HEAD');
  const baseline=Object.fromEntries(git('ls-tree','-rz',pinnedBase).toString().split('\0').filter(Boolean).map(line=>{
    const [meta,file]=line.split('\t'),[mode,type,object]=meta.split(' ');
    assert.equal(type,'blob');return [file,{mode,object}];
  }));
  // Include working-tree bytes and additions; HEAD alone could hide drift.
  const paths=git('ls-files','--cached','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);
  const current={};
  for(const file of paths) {
    const stat=lstatSync(join(root,file));assert.ok(stat.isFile(),'symlink/directory rejected: '+file);
    current[file]={mode:stat.mode&0o111?'100755':'100644',object:blob(readFileSync(join(root,file)))};
  }
  checkEntries(baseline,current,git('show',pinnedBase+':'+workflow).toString(),readFileSync(join(root,workflow),'utf8'));
  const scratch=mkdtempSync(join(tmpdir(),'breeze-ocr-base-boundary-'));let registered=false;
  try {
    git('worktree','add','--quiet','--detach',scratch,pinnedBase);registered=true;
    execFileSync(process.execPath,['tests/verify-192-integration-boundary.mjs'],{cwd:scratch,stdio:'inherit'});
  } finally {if(registered)git('worktree','remove','--force',scratch);else rmSync(scratch,{recursive:true,force:true});}
  console.log('Unlimited-OCR boundary passed: pinned production bytes, exact workflow gate, unchanged historical release checks.');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) verifyBoundary();
