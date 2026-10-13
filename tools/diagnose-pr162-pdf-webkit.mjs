// One fixed baseline/head pair with untouched assertions, followed by one
// instrumented pair. Diagnostic assertion failures remain failures; they are
// collected so the second known symptom can be measured in the same run.
// No application file is changed. Uses the existing synthetic PDF fixture.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {webkit} from 'playwright';

const root=resolve('.'),out='/tmp/breeze-pr162-pdf-comparison';
const refs={base:'5f8b178e45727948690c0ce52d1e5f0a30362544',head:'19bbb8d840df5129f4224f38093b8aa0b443f002'};
const testPath='tests/verify-pdf-elastic-motion-browser.mjs';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sha=s=>createHash('sha256').update(s).digest('hex');
mkdirSync(out,{recursive:true});
const browser=await webkit.launch();
const environment={node:process.version,browser:browser.version(),playwright:JSON.parse(readFileSync('node_modules/playwright/package.json')).version,refs,run:process.env.GITHUB_RUN_ID};
await browser.close();
const paths=[testPath,'package-lock.json','tests/helpers/study-sets-browser-fixture.mjs','tests/helpers/pdf-geometry-fixture.mjs','scripts/reader/pdf-pinch.js','scripts/reader/pdf-original.js','scripts/reader/reader-scroll.js','styles/reader.css'];
environment.hashes=Object.fromEntries(paths.map(path=>[path,Object.fromEntries(Object.entries(refs).map(([label,ref])=>[label,git('rev-parse',`${ref}:${path}`)]))]));
for(const [path,hashes] of Object.entries(environment.hashes))assert.equal(hashes.base,hashes.head,path);
console.log('ENVIRONMENT '+JSON.stringify(environment));
writeFileSync(join(out,'environment.json'),JSON.stringify(environment,null,2));
const dirs={};
for(const [label,ref] of Object.entries(refs)){
 const dir=`/tmp/breeze-pr162-pdf-source-${label}`;git('worktree','add','--detach',dir,ref);dirs[label]=dir;
 symlinkSync(join(root,'node_modules'),join(dir,'node_modules'),'dir');
}
const original=readFileSync(join(dirs.base,testPath),'utf8');
assert.equal(original,readFileSync(join(dirs.head,testPath),'utf8'));
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,from);return source.replace(from,to);};
let probe=once(original,"const server=await serveStudyFixture()",`const diagnosticFailures=[];
const diagnostic=(name,data)=>{console.log('DIAGNOSTIC '+name+' '+JSON.stringify(data));writeFileSync(out+'/'+name+'.json',JSON.stringify(data,null,2));};
const checkDiagnostic=(ok,message)=>{if(!ok){diagnosticFailures.push(message);console.log('DIAGNOSTIC_ASSERTION_FAILURE '+message);}};
const server=await serveStudyFixture()`);
probe=once(probe,'busy:originalPinchBusy()});if(qaFrames.length<45)','busy:originalPinchBusy(),animation:originalPinchReturn?{time:originalPinchReturn.currentTime,state:originalPinchReturn.playState,pending:originalPinchReturn.pending}:null});if(qaFrames.length<45)');
probe=once(probe,'const frames=await page.evaluate(()=>qaFrames);','const frames=await page.evaluate(()=>qaFrames);diagnostic("return-frames",frames);');
probe=once(probe,"assert.ok(frames.some(f=>f.a>1&&f.a<1.01),'restrained overshoot');","checkDiagnostic(frames.some(f=>f.a>1&&f.a<1.01),'restrained overshoot');");
probe=once(probe,'assert.equal(rotationAfter.anchor.page,rotationBefore.page);','diagnostic("rotation",{before:rotationBefore,after:rotationAfter,errorPx:Math.abs(rotationAfter.anchor.y-rotationBefore.y)*rotationAfter.height});assert.equal(rotationAfter.anchor.page,rotationBefore.page);');
probe=once(probe,"assert.ok(Math.abs(rotationAfter.anchor.y-rotationBefore.y)*rotationAfter.height<=1.5,'rotation preserves source point within scroll rounding');","checkDiagnostic(Math.abs(rotationAfter.anchor.y-rotationBefore.y)*rotationAfter.height<=1.5,'rotation preserves source point within scroll rounding');");
probe=once(probe,'assert.equal(rotationRestored.anchor.page,rotationBefore.page);','diagnostic("rotation-restored",{before:rotationBefore,restored:rotationRestored,errorPx:Math.abs(rotationRestored.anchor.y-rotationBefore.y)*rotationRestored.height});assert.equal(rotationRestored.anchor.page,rotationBefore.page);');
probe=once(probe,"assert.ok(Math.abs(rotationRestored.anchor.y-rotationBefore.y)*rotationRestored.height<=1.5,'return rotation preserves source point');","checkDiagnostic(Math.abs(rotationRestored.anchor.y-rotationBefore.y)*rotationRestored.height<=1.5,'return rotation preserves source point');");
probe=once(probe,"console.log(`${engine.name()} PDF elastic motion passed`);","diagnostic('assertion-failures',diagnosticFailures);if(diagnosticFailures.length)process.exitCode=1;else console.log(`${engine.name()} PDF elastic motion passed`);");
writeFileSync(join(out,'instrumented-test.mjs'),probe);
const results=[];
for(const mode of ['original','diagnostic'])for(const [label,ref] of Object.entries(refs)){
 const dir=dirs[label],runOut=join(out,`${mode}-${label}`);mkdirSync(runOut,{recursive:true});
 const entry=mode==='original'?testPath:'tests/.pr162-pdf-diagnostic.mjs';
 if(mode==='diagnostic')writeFileSync(join(dir,entry),probe);
 console.log(`RUN ${mode} ${label} ${ref}`);
 const result=spawnSync(process.execPath,[entry],{cwd:dir,env:{...process.env,BROWSER:'webkit',BREEZE_QA_ENGINE:'webkit',BREEZE_MOTION_OUTPUT:runOut},encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 const log=(result.stdout||'')+(result.stderr||'');writeFileSync(join(runOut,'console.log'),log);console.log(log);
 const row={mode,label,ref,testSha256:sha(mode==='original'?original:probe),status:result.status,signal:result.signal,error:result.error?.message||null};results.push(row);console.log('RESULT '+JSON.stringify(row));
}
writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));
console.log('RESULTS '+JSON.stringify(results));
// Diagnostic workflow success only means all measurements completed. The
// original suite outcomes remain explicit in results.json and this log.
assert.ok(results.every(r=>r.signal===null&&r.error===null),'Every controlled run must complete');
