// Engine control only: no Breeze, PDF.js, OCR bridge or application data.
// Failures remain failures; the existing OCR gate runs independently in CI.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
const require=createRequire(import.meta.url),engine=process.env.BROWSER==='webkit'?webkit:chromium;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Blob control</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`,rows=[];
const browserSpec=JSON.parse(readFileSync(join(dirname(require.resolve('playwright-core/package.json')),'browsers.json'),'utf8')).browsers.find(b=>b.name===engine.name());
const report={engine:engine.name(),playwright:require('playwright/package.json').version,platform:process.platform,arch:process.arch,packageBrowserSpec:browserSpec,executableOverride:process.env.BREEZE_BROWSER_EXECUTABLE||null,rows};
let context,profile;
try{
 for(const routing of ['none','http-only']){
  profile=mkdtempSync(join(tmpdir(),'breeze-blob-control-'));
  context=await engine.launchPersistentContext(profile,{headless:true,serviceWorkers:'block',executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
  const page=await context.newPage();
  report.actualBrowserVersion=context.browser()?.version();
  if(routing==='http-only')await page.route(/^https?:\/\//,route=>route.continue());
  await page.goto(url);
  await page.evaluate(async()=>{
   window.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('blob-control',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(new Blob(['local control']),'source');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  });
  for(const offline of [false,true,false]){
   await context.setOffline(offline);
   rows.push(await page.evaluate(async({routing,offline,url})=>{
    const stored=await new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get('source');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const read=async blob=>{try{const b=await blob.arrayBuffer();return {bytes:b.byteLength,text:new TextDecoder().decode(b)};}catch(error){return {error:error.name,message:error.message};}};
    const fileReader=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve({bytes:r.result.byteLength,text:new TextDecoder().decode(r.result)});r.onerror=()=>resolve({error:r.error.name,message:r.error.message});r.readAsArrayBuffer(new Blob(['local control']));});
    let http;try{await fetch(url+'?probe='+crypto.randomUUID(),{cache:'no-store'});http='succeeded';}catch(error){http=error.name;}
    return {routing,offline,online:navigator.onLine,stored:await read(stored),fresh:await read(new Blob(['local control'])),fileReader,http};
   },{routing,offline,url}));
  }
  await context.close();context=null;rmSync(profile,{recursive:true,force:true});profile=null;
 }
 for(const row of rows){
  assert.equal(row.online,!row.offline,JSON.stringify(row));
  for(const source of ['stored','fresh','fileReader'])assert.deepEqual(row[source],{bytes:13,text:'local control'},JSON.stringify(row));
  assert.equal(row.http==='succeeded',!row.offline,JSON.stringify(row));
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{
 const out=process.env.BREEZE_BLOB_CONTROL_OUTPUT||'/tmp/breeze-offline-blob-control';mkdirSync(out,{recursive:true});
 writeFileSync(join(out,`${engine.name()}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 await context?.close();if(profile)rmSync(profile,{recursive:true,force:true});await new Promise(resolve=>server.close(resolve));
}
