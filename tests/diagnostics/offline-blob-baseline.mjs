/* Characterization only: preserves both exact source trees and unmodified OCR gates. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,cpSync,existsSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
const workspace=process.env.GITHUB_WORKSPACE||process.cwd();
const out=process.env.BREEZE_BLOB_PROOF||'/tmp/breeze-offline-blob-proof';
mkdirSync(out,{recursive:true});
const subjects=[['baseline','8512e8fd25e51d6aa06cf926bad165d5c3994865'],['candidate','fde9cdd7a59b5a40e214856ec49af15cf00641c2']].map(([label,sha])=>({label,sha,root:resolve(workspace,'subjects',label)}));
const run=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const harness=['tests/verify-pdf-ocr-browser.mjs','tests/helpers/pdf-ocr-browser-stress.mjs','tests/helpers/pdf-scan-fixture.mjs','tests/verify-pdf-ocr.mjs','tests/verify-pdf-ocr-library-browser.mjs','package-lock.json'];
const unchangedProduction=['scripts/core/storage.js','scripts/reader/pdf-ocr.js','scripts/reader/pdf-ocr-library.js','scripts/reader/pdf-original.js','scripts/reader/original-session.js','scripts/reader/original-formats.js','scripts/reader/pdf-navigation.js','scripts/reader/pdf-pinch.js','scripts/reader/pdf-ink.js','assets/lib/pdf-3.11.174.min.js','assets/lib/pdf-3.11.174.worker.min.js'];
const existingProduction=unchangedProduction.filter(path=>existsSync(join(subjects[0].root,path)));
const proof={startedAt:new Date().toISOString(),runner:{os:process.env.RUNNER_OS,arch:process.env.RUNNER_ARCH,imageOS:process.env.ImageOS,imageVersion:process.env.ImageVersion,node:process.version,osRelease:readFileSync('/etc/os-release','utf8')},harness:[],unchangedProduction:[],subjects:[],gates:[]};
const save=()=>writeFileSync(join(out,'comparison.json'),JSON.stringify(proof,null,2)+'\n');
for(const subject of subjects){
 assert.equal(run(subject.root,'rev-parse','HEAD'),subject.sha);
 assert.equal(run(subject.root,'status','--porcelain'),'','Subject must be clean before testing');
 proof.subjects.push({...subject,tree:run(subject.root,'rev-parse','HEAD^{tree}'),beforeStatus:run(subject.root,'status','--porcelain')});
}
for(const [name,paths] of [['harness',harness],['unchangedProduction',existingProduction]])for(const path of paths){
 const hashes=subjects.map(s=>hash(join(s.root,path)));
 assert.equal(hashes[0],hashes[1],`${path} must be byte-identical`);
 proof[name].push({path,sha256:hashes[0]});
}
const require=createRequire(join(subjects[0].root,'package.json'));
const {webkit}=require('playwright');
proof.playwright={version:require('playwright/package.json').version,executable:webkit.executablePath(),browserManifest:JSON.parse(readFileSync(join(dirname(require.resolve('playwright-core/package.json')),'browsers.json'),'utf8'))};
const candidateRequire=createRequire(join(subjects[1].root,'package.json'));
assert.equal(candidateRequire('playwright/package.json').version,proof.playwright.version);
assert.equal(candidateRequire('playwright').webkit.executablePath(),webkit.executablePath());
assert.equal(hash(join(dirname(require.resolve('playwright-core/package.json')),'browsers.json')),hash(join(dirname(candidateRequire.resolve('playwright-core/package.json')),'browsers.json')));
save();
// A separate, script-free HTML page. No Breeze, PDF.js, OCR, service worker,
// import mock, or product monkeypatch can participate in these controls.
const server=createServer((request,response)=>{
 response.setHeader('Cache-Control','no-store');
 response.setHeader('Content-Type',request.url.startsWith('/probe')?'text/plain':'text/html');
 response.end(request.url.startsWith('/probe')?'transport alive':'<!doctype html><title>Blank Blob control</title>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const controls=[];
try{
 for(const routing of ['none','http-only','all']){
  const profile=mkdtempSync(join(tmpdir(),'breeze-blank-blob-'));
  const context=await webkit.launchPersistentContext(profile,{headless:true,viewport:{width:820,height:1180},serviceWorkers:'block'});
  try{
   const page=await context.newPage(),events=[];let blockHttp=false;
   if(routing!=='none')await page.route(routing==='all'?'**/*':/^https?:\/\//,route=>{
    const url=route.request().url();events.push({url,blocked:blockHttp&&/^https?:/.test(url)});
    return blockHttp&&/^https?:/.test(url)?route.abort('internetdisconnected'):route.continue();
   });
   await page.goto(origin+'/blank');
   await page.evaluate(async()=>{
    window.controlMemory=new Blob(['local control']);
    window.controlDb=await new Promise((resolve,reject)=>{
     const req=indexedDB.open('blank-blob',1);req.onupgradeneeded=()=>req.result.createObjectStore('records');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise((resolve,reject)=>{const tx=controlDb.transaction('records','readwrite');tx.objectStore('records').put(new Blob(['local control']),'stored');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
   });
   const read=phase=>page.evaluate(async({phase,origin})=>{
    const bounded=async fn=>{let timer;try{return await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('read timed out after 5 seconds')),5000);})]);}catch(error){return {error:error.name,message:error.message};}finally{clearTimeout(timer);}};
    const stored=await new Promise((resolve,reject)=>{const req=controlDb.transaction('records').objectStore('records').get('stored');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const blobs={fresh:new Blob(['local control']),memory:controlMemory,indexedDB:stored},reads={};
    for(const [kind,blob] of Object.entries(blobs)){
     const objectUrl=URL.createObjectURL(blob);
     reads[kind]={size:blob.size,arrayBuffer:await bounded(async()=>({bytes:(await blob.arrayBuffer()).byteLength})),text:await bounded(async()=>({text:await blob.text()})),fileReader:await bounded(()=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({bytes:r.result.byteLength});r.onerror=()=>reject(r.error);r.readAsArrayBuffer(blob);})),fetchBlob:await bounded(async()=>({bytes:(await (await fetch(objectUrl)).arrayBuffer()).byteLength}))};
     URL.revokeObjectURL(objectUrl);
    }
    const http=await bounded(async()=>({text:await (await fetch(origin+'/probe?'+phase,{cache:'no-store'})).text()}));
    return {phase,online:navigator.onLine,reads,http};
   },{phase,origin});
   const result={routing,url:page.url(),browserVersion:context.browser()?.version(),userAgent:await page.evaluate(()=>navigator.userAgent),phases:[],events};controls.push(result);
   // Cold offline read first: no source bytes are warmed before emulation.
   await context.setOffline(true);result.phases.push(await read('cold-setOffline'));
   await context.setOffline(false);result.phases.push(await read('restored-online'));
   await context.setOffline(true);result.phases.push(await read('warm-setOffline'));
   await context.setOffline(false);result.phases.push(await read('restored-online-again'));
   if(routing!=='none'){blockHttp=true;result.phases.push(await read('http-route-blocked'));blockHttp=false;}
   for(const phase of result.phases.filter(p=>p.phase.startsWith('restored-online'))){
    for(const blob of Object.values(phase.reads))assert.equal(blob.arrayBuffer.bytes,13,JSON.stringify(phase));
    assert.equal(phase.http.text,'transport alive',JSON.stringify(phase));
   }
   for(const phase of result.phases.filter(p=>p.phase.endsWith('setOffline')))assert.ok(phase.http.error,JSON.stringify(phase));
   writeFileSync(join(out,'blank-page-controls.json'),JSON.stringify({playwright:proof.playwright,controls},null,2)+'\n');
   console.log('Blank control',JSON.stringify(result));
  }finally{await context.close();rmSync(profile,{recursive:true,force:true});}
 }
}finally{await new Promise(r=>server.close(r));}
// Run both gates even if the first fails, retain each genuine exit status,
// and fail the overall job for any failed test. No expected-failure promotion.
for(const subject of subjects){
 for(const [name,command,args] of [['ocr-library','node',['tests/verify-pdf-ocr-library-browser.mjs']],['ocr-full','npm',['run','test:pdf-ocr']]]){
  const dir=join(out,subject.label,name);mkdirSync(dir,{recursive:true});
  const result=spawnSync(command,args,{cwd:subject.root,env:{...process.env,BROWSER:'webkit',BREEZE_OCR_STRESS_OUTPUT:join(dir,'stress')},encoding:'utf8',timeout:8*60*1000,maxBuffer:16*1024*1024});
  writeFileSync(join(dir,'stdout.log'),result.stdout||'');writeFileSync(join(dir,'stderr.log'),result.stderr||'');
  const gate={subject:subject.label,sha:subject.sha,name,command:[command,...args],exitCode:result.status,signal:result.signal,error:result.error?.message||null};proof.gates.push(gate);
  console.log('Unmodified gate result',JSON.stringify(gate));console.log(result.stdout);console.error(result.stderr);
  for(const directory of ['/tmp/breeze-ocr-confirm','/tmp/breeze-ocr-library'])if(existsSync(directory)){
   cpSync(directory,join(dir,directory.split('/').pop()),{recursive:true});rmSync(directory,{recursive:true,force:true});
  }
  save();
 }
 const record=proof.subjects.find(s=>s.label===subject.label);record.afterStatus=run(subject.root,'status','--porcelain');
 assert.equal(record.afterStatus,'','Subject must remain clean after testing');
 for(const h of proof.harness)assert.equal(hash(join(subject.root,h.path)),h.sha256);
 save();
}
proof.finishedAt=new Date().toISOString();proof.allGatesPassed=proof.gates.every(g=>g.exitCode===0);save();
process.exitCode=proof.allGatesPassed?0:1;
