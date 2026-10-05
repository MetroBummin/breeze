// Bounded comparison. Every failed attempt remains in the receipt; no retries
// replace failures and the ordinary Integrity browser gate runs unchanged.
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.cwd(), proof=process.env.BREEZE_BYTE_PROOF||'/tmp/breeze-import-byte-matrix';
mkdirSync(proof,{recursive:true});
const results=[];
for(const [revision,source] of [['base',process.env.BREEZE_BYTE_BASE_ROOT],['current',root]]){
  if(!source)throw new Error('BREEZE_BYTE_BASE_ROOT is required');
  for(const single of [false,true])for(const instrumented of [false,true])for(let attempt=1;attempt<=2;attempt++){
    const name=`${revision}-${single?'single':'existing'}-${instrumented?'bytes':'control'}-${attempt}`;
    const directory=resolve(proof,name);mkdirSync(directory,{recursive:true});
    const run=spawnSync('timeout',['--verbose','--kill-after=5s','90s',process.execPath,'tests/verify-import-commit-browser.mjs'],{
      cwd:root,encoding:'utf8',maxBuffer:10*1024*1024,
      env:{...process.env,BREEZE_QA_ENGINE:process.env.BREEZE_QA_ENGINE||'webkit',BREEZE_IMPORT_ROOT:source,BREEZE_IMPORT_PROOF:directory,
        BREEZE_IMPORT_CASE:'native-staged-promotion-bytes,abort-originals,abort-signal-during-promotion',BREEZE_IMPORT_SINGLE_BROWSER:single?'1':'0',BREEZE_IMPORT_BYTE_DIAGNOSTICS:instrumented?'1':'0'},
    });
    writeFileSync(resolve(directory,'process.log'),(run.stdout||'')+(run.stderr||''));
    let cases;try{cases=JSON.parse(readFileSync(resolve(directory,'results.json'),'utf8'));}catch{}
    const sha=spawnSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
    const result={name,revision,sha,source,single,instrumented,attempt,status:run.status,signal:run.signal,error:run.error?.message,cases};
    results.push(result);console.log(JSON.stringify(result));
    writeFileSync(resolve(proof,'matrix.json'),JSON.stringify(results,null,2));
  }
}
// Baseline failures are retained evidence, not expectations for the fixed head.
if(results.some(result=>result.revision==='current'&&result.status!==0))process.exitCode=1;
