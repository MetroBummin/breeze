import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEntries,originalGate,experimentGate} from './verify-boundary.mjs';
const fixture=()=>({
  baseline:{'scripts/reader/pdf-ocr.js':{mode:'100644',object:'production'},
    '.github/workflows/integrity.yml':{mode:'100644',object:'workflow'},
    'docs/qa/breeze-192-integration/boundary.json':{mode:'100644',object:'receipt'}},
  current:{'scripts/reader/pdf-ocr.js':{mode:'100644',object:'production'},
    '.github/workflows/integrity.yml':{mode:'100644',object:'changed'},
    'docs/qa/breeze-192-integration/boundary.json':{mode:'100644',object:'receipt'},
    'experiments/unlimited-ocr/run.mjs':{mode:'100644',object:'experiment'}}
});
test('only exact gate and isolated regular additions pass',()=>{
  const {baseline,current}=fixture();checkEntries(baseline,current,originalGate,experimentGate);
});
test('production/receipt changes, deletions and modes remain failures',()=>{
  for(const file of ['scripts/reader/pdf-ocr.js','docs/qa/breeze-192-integration/boundary.json']) {
    for(const mutation of ['bytes','mode','delete']) {
      const {baseline,current}=fixture();
      if(mutation==='delete')delete current[file];
      else current[file][mutation==='bytes'?'object':'mode']='bad';
      assert.throws(()=>checkEntries(baseline,current,originalGate,experimentGate));
    }
  }
});
test('other additions, symlinks, executable experiments and workflow drift fail',()=>{
  for(const [file,mode] of [['scripts/extra.js','100644'],['experiments/unlimited-ocr/link','120000'],['experiments/unlimited-ocr/exec','100755']]) {
    const {baseline,current}=fixture();current[file]={mode,object:'new'};
    assert.throws(()=>checkEntries(baseline,current,originalGate,experimentGate));
  }
  const {baseline,current}=fixture();
  assert.throws(()=>checkEntries(baseline,current,originalGate,experimentGate+'\nextra'));
});
