// Temporary baseline comparison; never changes application code or weakens a fixture assertion.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const phase=process.argv[2];assert.ok(['base','patched'].includes(phase));
const source=readFileSync('tests/verify-reader-notifications-browser.mjs','utf8');
const anchor=" assert.equal(await notice.evaluate(e=>e.scrollHeight<=e.clientHeight),true,'Notice clipped at narrow Reader width');";
assert.equal(source.split(anchor).length,2);
const diagnostic=` assert.deepEqual(errors,[]);
 console.log('NARROW_NOTICE_METRICS '+JSON.stringify({engine:engine.name(),...(await notice.evaluate(e=>({
   scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,
   text:e.textContent,font:getComputedStyle(e).font,lineHeight:getComputedStyle(e).lineHeight,
   whiteSpace:getComputedStyle(e).whiteSpace,display:getComputedStyle(e).display,
 })))}));
`;
const path='tests/.reader-notice-diagnostic.mjs';
let run;
try{
  writeFileSync(path,source.replace(anchor,diagnostic+anchor));
  run=spawnSync(process.execPath,[path],{encoding:'utf8',timeout:180000,maxBuffer:5*1024*1024});
}finally{rmSync(path,{force:true});}
const output=(run.stdout||'')+(run.stderr||'');process.stdout.write(output);
const rows=(run.stdout||'').split('\n').filter(line=>line.startsWith('NARROW_NOTICE_METRICS ')).map(line=>JSON.parse(line.slice(22)));
const report={phase,status:run.status,signal:run.signal,error:run.error?.message||'',rows,
  narrowFailure:output.includes('AssertionError [ERR_ASSERTION]: Notice clipped at narrow Reader width'),
  chromiumPassed:output.includes('chromium: Reader notice FIFO, interruption/resume')};
const reportPath='/tmp/breeze-reader-notice-base.json';
if(phase==='base'){
  writeFileSync(reportPath,JSON.stringify(report));
  console.log('BASELINE_READER_RESULT '+JSON.stringify(report));
  assert.ok(report.status===0 || report.status===1&&report.narrowFailure&&report.chromiumPassed&&rows.length===2,
    'Unexpected baseline failure: investigate before comparing');
}else{
  const base=JSON.parse(readFileSync(reportPath,'utf8'));
  if(report.status===0)console.log('PATCHED_READER_RESULT PASS (all unchanged assertions)');
  else{
    assert.equal(report.status,1);assert.equal(report.signal,null);assert.equal(report.error,'');
    assert.equal(report.narrowFailure,true);assert.equal(report.chromiumPassed,true);
    assert.equal(base.status,1);assert.equal(base.narrowFailure,true);assert.equal(base.chromiumPassed,true);
    assert.deepEqual(report.rows,base.rows,'Narrow Reader geometry changed from the verified base');
    assert.equal(rows.length,2);
    console.log('PATCHED_READER_RESULT KNOWN_BASELINE_FAILURE: identical WebKit narrow-notice metrics; not claimed as a passing layout test. No CSS/Reader change is included in the import fix.');
  }
}
