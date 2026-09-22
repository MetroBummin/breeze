import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;


const source=readFileSync(new URL('../scripts/reader/epub-original.js',import.meta.url),'utf8');
const {execFileSync}=await import('node:child_process');
const baseline=execFileSync('git',['show','HEAD:scripts/reader/epub-original.js'],{cwd:root,encoding:'utf8'});
const begin=baseline.indexOf('function renderEpubSavedWordHighlights(doc)');
const original=baseline.slice(begin,baseline.indexOf('/* ================= selecting a word',begin));
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();try{
 const page=await browser.newPage({serviceWorkers:'block'});
 await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 const result=await page.evaluate(async original=>{
  const oldRender=eval('('+original.trim()+')');
  const check=(v,m)=>{if(!v)throw Error(m);};
  const frames=[];
  for(const text of ['They take the quiet road and take a long walk. Dogs were running.', 'A sunny day. Clouds drift slowly.']){
   const f=document.createElement('iframe');document.body.append(f);
   f.contentDocument.body.innerHTML='<p>'+text+'</p>';frames.push(f);
  }
  words={quiet:{status:1},dog:{status:2},run:{status:3}};
  const docs=frames.map(f=>f.contentDocument),counts=[0,0];
  docs.forEach((d,i)=>{const walk=d.createTreeWalker.bind(d);d.createTreeWalker=(...a)=>{counts[i]++;return walk(...a);};});
  const values=d=>[1,2,3].map(i=>[...(d.defaultView.CSS.highlights.get('breeze-saved-'+i)||[])].map(r=>r.startOffset+':'+r.endOffset+':'+r.toString()).sort());
  const parity=()=>docs.forEach(d=>{
    const result=values(d),cache=epubSavedHighlightCache.get(d);
    oldRender(d);check(JSON.stringify(result)===JSON.stringify(values(d)),'baseline mismatch');
    cache.highlights.forEach((h,i)=>d.defaultView.CSS.highlights.set('breeze-saved-'+(i+1),h));
  });
  const refresh=()=>refreshEpubSavedWords({frames});
  refresh();parity();counts.fill(0);
  words.quiet.status=3;refresh();check(counts.every(n=>n===0),'status rescanned chapter');parity();counts.fill(0);
  words.quiet.mark=false;refresh();check(counts.every(n=>n===0),'mark rescanned chapter');parity();counts.fill(0);
  words.quiet.mark=true;refresh();parity();counts.fill(0);
  words['take walk']={status:2,phraseParts:['take','walk'],phraseGaps:[2]};refresh();
  check(counts[0]===1&&counts[1]===0,'expression rescanned unrelated chapter');parity();counts.fill(0);
  words['take walk'].phraseGaps=[1];refresh();parity();counts.fill(0);
  delete words['take walk'];delete words.dog;refresh();parity();counts.fill(0);
  words.running={status:1};refresh();parity();counts.fill(0);
  words.sunny={status:2};refresh();check(counts[0]===0&&counts[1]===1,'new word rescanned unrelated chapter');parity();
  const t=performance.now();for(let i=0;i<100;i++){words.quiet.status=i%3+1;refresh();}
  const incrementalMs=performance.now()-t;
  return {engine:navigator.userAgent,parity:true,statusAndMarkScans:0,newWordChapters:1,totalChapters:2,updates100Ms:incrementalMs};
 },original);
 console.log(engine.name(),JSON.stringify(result));
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
