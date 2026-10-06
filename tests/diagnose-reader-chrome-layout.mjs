// Read-only instrumentation of the owned reader-work prefix. The zero-read
// assertion is unchanged; every bounded repetition retains its own evidence.
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const original=new URL('./verify-reader-work-browser.mjs',import.meta.url);
const temporary=new URL(`./.reader-chrome-trace-${process.pid}.mjs`,import.meta.url);
const proof=process.env.BREEZE_CHROME_TRACE_PROOF||'/tmp/breeze-chrome-layout';
mkdirSync(proof,{recursive:true});
let source=readFileSync(original,'utf8');
function replace(before,after){if(!source.includes(before))throw Error('Reader-work diagnostic no longer matches source: '+before.slice(0,80));source=source.replace(before,after);}
replace("import {readFileSync} from 'node:fs';","import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';");
replace('  await page.goto(url);await page.evaluate(()=>homeReady);',`  await page.addInitScript(()=>{
   window.qaChromeTrace=[];window.qaChromePhase='boot';window.qaChromeCapture=false;
   window.qaChromeRecord=row=>{if(!qaChromeCapture)return;qaChromeTrace.push({at:performance.now(),phase:qaChromePhase,...row});if(qaChromeTrace.length>500)qaChromeTrace.shift();};
   const Native=MutationObserver;
   window.MutationObserver=class extends Native{constructor(callback){
    const registered=new Error().stack;
    super((records,self)=>{
     const relevant=records.filter(r=>r.target instanceof Element&&(r.target===document.body||r.target===document.documentElement||r.target.matches('#v-read,#originalwrap,#original-stage,#original-content,#original-zoom,.pdf-source-page')));
     if(relevant.length)qaChromeRecord({kind:'mutation-delivery',registered,rows:relevant.map(r=>({target:r.target.id||r.target.className,page:r.target.dataset?.page,type:r.type,attribute:r.attributeName,old:r.oldValue,current:r.attributeName?r.target.getAttribute(r.attributeName):null}))});
     callback(records,self);
    });
   }};
  });
  await page.goto(url);await page.evaluate(()=>homeReady);
  await page.evaluate(()=>{
   const invalidate=invalidatePdfPageLayout,layout=pdfPageLayout;
   window.invalidatePdfPageLayout=function(session=originalSession){qaChromeRecord({kind:'invalidate',key:session?.pageLayout?.key,active:session?.paintActive?.pageNumber,queue:[...(session?.paintQueue?.keys()||[])],stack:new Error().stack});return invalidate.apply(this,arguments);};
   window.pdfPageLayout=function(session=originalSession){const before=session?.pageLayout,key=before?.key;const result=layout.apply(this,arguments);if(before!==session?.pageLayout)qaChromeRecord({kind:'rebuild',before:key,after:session?.pageLayout?.key,active:session?.paintActive?.pageNumber,queue:[...(session?.paintQueue?.keys()||[])],stack:new Error().stack});return result;};
   for(const type of ['transitionend','transitioncancel'])document.addEventListener(type,e=>{const n=e.target;if(n instanceof Element&&(n.closest('#v-read,#readchrome')||n===document.body||n===document.documentElement))qaChromeRecord({kind:type,target:n.id||n.className,property:e.propertyName});},true);
  });`);
replace("  await page.locator('#fileinput').setInputFiles({name:'Work.pdf'", "  await page.evaluate(()=>{qaChromeCapture=true;qaChromePhase='pdf-setup';});\n  await page.locator('#fileinput').setInputFiles({name:'Work.pdf'");
replace('  const controls=await page.evaluate(async()=>{', "  const controls=await page.evaluate(async()=>{\n   qaChromePhase='warm';qaChromeRecord({kind:'boundary',active:originalSession.paintActive?.pageNumber,queue:[...(originalSession.paintQueue?.keys()||[])],settled:[...originalSession.settled],key:originalSession.pageLayout?.key});");
replace('p.getBoundingClientRect=()=>{reads++;return originals[i]();}',"p.getBoundingClientRect=()=>{reads++;qaChromeRecord({kind:'paper-read',page:i+1,stack:new Error().stack});return originals[i]();}");
replace('   pdfPageLayout(originalSession);reads=0;',"   pdfPageLayout(originalSession);reads=0;qaChromePhase='measure';qaChromeRecord({kind:'measure-start',key:originalSession.pageLayout?.key});");
replace("   originalSession.pages.forEach((p,i)=>p.getBoundingClientRect=originals[i]);return reads;", "   originalSession.pages.forEach((p,i)=>p.getBoundingClientRect=originals[i]);qaChromeRecord({kind:'measure-end',reads,key:originalSession.pageLayout?.key});qaChromeCapture=false;return reads;");
replace("  assert.equal(controls,0,'Chrome-only motion must not invalidate and remeasure PDF paper');",`  const evidence={engine:engine.name(),attempt:process.env.BREEZE_CHROME_TRACE_ATTEMPT,reads:controls,trace:await page.evaluate(()=>qaChromeTrace)};
  const proof=process.env.BREEZE_CHROME_TRACE_PROOF||'/tmp/breeze-chrome-layout';mkdirSync(proof,{recursive:true});
  writeFileSync(resolve(proof,engine.name()+'-'+process.env.BREEZE_CHROME_TRACE_ATTEMPT+'.json'),JSON.stringify(evidence,null,2));
  console.log('Reader chrome layout evidence '+JSON.stringify(evidence));
  assert.equal(controls,0,'Chrome-only motion must not invalidate and remeasure PDF paper');`);
const end=source.indexOf('  // A pending PDF sentence ');
if(end<0)throw Error('Owned test boundary missing');
source=source.slice(0,end)+"  assert.deepEqual(errors,[]);\n }finally{await browser.close();}\n}}finally{await new Promise(done=>server.close(done));}\n";
writeFileSync(temporary,source);
const results=[];
try{
 const iterations=Number(process.env.BREEZE_CHROME_TRACE_ITERATIONS||3);
 if(!Number.isInteger(iterations)||iterations<1||iterations>3)throw Error('Diagnostic repetitions must be 1–3');
 for(let attempt=1;attempt<=iterations;attempt++){
  const child=spawn(process.execPath,[fileURLToPath(temporary)],{stdio:'inherit',env:{...process.env,BREEZE_CHROME_TRACE_ATTEMPT:String(attempt)}});
  const status=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});
  results.push({attempt,...status});writeFileSync(resolveProof('attempts.json'),JSON.stringify(results,null,2));
 }
 if(results.some(r=>r.code!==0||r.signal))process.exitCode=1;
}finally{unlinkSync(temporary);}
function resolveProof(name){return proof.replace(/\/$/,'')+'/'+name;}
