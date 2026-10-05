import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {browserPhase} from './helpers/browser-phase.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.BREEZE_COVER_PROOF||'/tmp/breeze-cover-chooser';mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{try{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root))throw Error();
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream');
  res.end(readFileSync(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const results=[],phases=[];
const report=result=>{phases.push(result);console.log(`[cover chooser] ${result.name}: ${result.status}${result.error?' '+result.error:''}`);};
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  const phase=(name,run,timeoutMs)=>browserPhase(`${engine.name()}:${name}`,run,{timeoutMs,report});
  // Match the existing import/PDF suites: native IndexedDB Blob writes require
  // a persistent WebKit profile. Each engine still gets fresh, real storage.
  const profile=mkdtempSync(resolve(tmpdir(),'breeze-cover-chooser-'));
  let context,failure;
  try{
    context=await phase('launch persistent profile',()=>engine.launchPersistentContext(profile,{
      executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined,
      viewport:{width:390,height:844},serviceWorkers:'block',timeout:30000,
    }),35000);
    await phase('configure context',async()=>{
      await context.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
      await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
    });
    const page=await phase('new page',()=>context.newPage());const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(['warning','error'].includes(message.type()))console.log(`[${engine.name()} page ${message.type()}] ${message.text()}`);});
    const evaluate=(name,fn,arg)=>phase(name,()=>page.evaluate(fn,arg));
    await phase('navigate',()=>page.goto(url));await evaluate('homeReady',()=>homeReady);
    const id=await evaluate('import EPUB',async()=>{
      const file=new File([await(await fetch('assets/classics/alice-in-wonderland.epub')).blob()],'Cover Alice.epub',{type:'application/epub+zip'});
      await importFile(file);return books.find(b=>b.kind==='epub').id;
    });
    await evaluate('open edit sheet',id=>openEditSheet(books.find(b=>b.id===id)),id);
    await phase('select photo',()=>page.locator('#ed-pick-file input').setInputFiles(resolve(root,'assets/longreads/covers/speckled-band.webp')));
    await phase('photo saved',()=>page.waitForFunction(id=>books.find(b=>b.id===id).cover===id+'|cover',id));
    await page.waitForTimeout(100);
    await phase('first photo screenshot',()=>page.screenshot({path:`${out}/${engine.name()}-photo-selected.png`}));
    const chosen=async()=>{
      await page.waitForFunction(()=>document.querySelector('#ed-covers .on img')?.naturalWidth>0,null,{timeout:5000});
      return evaluate('current cover byte hashes',async()=>{
        const b=editTarget,img=document.querySelector('#ed-covers .on img');
        return {cover:b.cover,pick:document.getElementById('ed-covers').dataset.pick,
          storedHash:await rawFileHash(await imgGet(b.cover)),shownHash:await rawFileHash(await(await fetch(img.src)).blob())};
      });
    };
    const photo=await chosen();assert.equal(photo.cover,id+'|cover');assert.equal(photo.pick,photo.cover);assert.equal(photo.shownHash,photo.storedHash);
    await page.locator('#ed-card .sm-btn.primary').click();
    await evaluate('reopen saved cover',id=>openEditSheet(books.find(b=>b.id===id)),id);assert.deepEqual(await chosen(),photo,'reopening shows the same saved bytes');
    for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
      await page.setViewportSize({width,height});await evaluate('theme',d=>{darkMode=d;applyDark();},dark);
      const geometry=await page.locator('#ed-card').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
      assert.ok(geometry.left>=0&&geometry.right<=width&&geometry.top>=0&&geometry.bottom<=height,'edit surface stays inside the viewport');
      await page.screenshot({path:`${out}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`});
    }
    await evaluate('close edit sheet',()=>closeEditSheet());await page.reload();await evaluate('reloaded homeReady',()=>homeReady);
    await evaluate('reopen after reload',id=>openEditSheet(books.find(b=>b.id===id)),id);assert.deepEqual(await chosen(),photo,'real IndexedDB cold reload retains cover projection');
    await page.locator('#ed-pick-file input').setInputFiles(resolve(root,'assets/longreads/covers/red-headed-league.webp'));
    await phase('replacement bytes saved',()=>page.waitForFunction(async old=>await rawFileHash(await imgGet(editTarget.cover))!==old,photo.storedHash));
    const replacement=await chosen();assert.notEqual(replacement.storedHash,photo.storedHash);assert.equal(replacement.shownHash,replacement.storedHash,'same cover key shows replacement bytes');
    await evaluate('save replacement',()=>saveEditSheet());
    await evaluate('reimport EPUB',async()=>{
      const file=new File([await(await fetch('assets/classics/alice-in-wonderland.epub')).blob()],'Cover Alice.epub',{type:'application/epub+zip'});
      await importFile(file);
    });
    await evaluate('reopen after reimport',id=>openEditSheet(books.find(b=>b.id===id)),id);assert.deepEqual(await chosen(),replacement,'reimport retains current custom cover and its bytes');
    await page.locator('#ed-covers .ed-cover').first().click();await evaluate('save None',()=>saveEditSheet());
    await page.reload();await evaluate('None reload homeReady',()=>homeReady);
    await evaluate('reopen None',id=>openEditSheet(books.find(b=>b.id===id)),id);
    assert.equal(await page.locator('#ed-covers .on').textContent(),'없음');
    assert.equal(await evaluate('None cover',()=>editTarget.cover),null,'None persists separately from custom');
    assert.equal(await evaluate('None selection',()=>document.getElementById('ed-covers').dataset.pick),'');
    // A picker read that resolves after closing/reopening the same book has no owner.
    const cancelled=await evaluate('cancelled picker ownership',async id=>{
      const b=books.find(b=>b.id===id);let release;
      const input={files:[{type:'image/png',arrayBuffer:()=>new Promise(r=>release=r)}],value:'photo.png'};
      const job=pickCoverFile(input);closeEditSheet();openEditSheet(b);release(new ArrayBuffer(1));await job;
      return {live:b.cover,durable:(await bookAll()).find(b=>b.id===id).cover};
    },id);
    assert.deepEqual(cancelled,{live:null,durable:null},'late read cannot replace the reopened sheet selection');
    const newest=await evaluate('newest picker ownership',async()=>{
      let release;
      const first=pickCoverFile({files:[{type:'image/png',arrayBuffer:()=>new Promise(r=>release=r)}],value:'old.png'});
      const bytes=await(await fetch('assets/longreads/covers/speckled-band.webp')).arrayBuffer();
      await pickCoverFile({files:[{type:'image/webp',arrayBuffer:async()=>bytes}],value:'new.webp'});
      release(new ArrayBuffer(1));await first;
      return {type:(await imgGet(editTarget.cover)).type,hash:await rawFileHash(await imgGet(editTarget.cover))};
    });
    assert.equal(newest.type,'image/webp');assert.equal(newest.hash,photo.storedHash,'the newest picker wins against an older delayed read');
    await evaluate('delete book',()=>runDelete());
    assert.equal(await evaluate('deleted memory',id=>books.some(b=>b.id===id),id),false);
    assert.equal(await evaluate('deleted durable book',id=>bookAll().then(all=>all.some(b=>b.id===id)),id),false);
    assert.equal(await evaluate('deleted cover bytes',id=>imgEntries().then(all=>all.some(([key])=>String(key).startsWith(id+'|'))),id),false,'delete removes owned cover bytes');
    assert.deepEqual(errors,[]);results.push({engine:engine.name(),id,photo,replacement,checks:'upload/reopen/reload/replace/reimport/None/stale-picker/latest-picker/delete/10 viewports'});
  }catch(error){failure=error;}
  finally{
    const browser=context?.browser();
    if(context)await phase('close context',()=>context.close(),5000).catch(error=>{failure??=error;});
    if(browser?.isConnected())await phase('close browser',()=>browser.close(),5000).catch(error=>{failure??=error;});
    rmSync(profile,{recursive:true,force:true});
  }
  if(failure)throw failure;
}}finally{
  // The test owns these local sockets; do not leave keep-alive clients behind.
  server.closeAllConnections();
  try{await browserPhase('server:close',()=>new Promise(r=>server.close(r)),{timeoutMs:5000,report});}
  finally{writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));writeFileSync(resolve(out,'phases.json'),JSON.stringify(phases,null,2));}
}
console.log(JSON.stringify(results,null,2));
