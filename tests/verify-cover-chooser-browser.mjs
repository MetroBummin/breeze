import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.BREEZE_COVER_PROOF||'/tmp/breeze-cover-chooser';mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{try{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root))throw Error();
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream');
  res.end(readFileSync(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const results=[];
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await context.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
    await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.evaluate(()=>homeReady);
    const id=await page.evaluate(async()=>{
      const file=new File([await(await fetch('assets/classics/alice-in-wonderland.epub')).blob()],'Cover Alice.epub',{type:'application/epub+zip'});
      await importFile(file);return books.find(b=>b.kind==='epub').id;
    });
    await page.evaluate(id=>openEditSheet(books.find(b=>b.id===id)),id);
    await page.locator('#ed-pick-file input').setInputFiles(resolve(root,'assets/longreads/covers/speckled-band.webp'));
    await page.waitForFunction(id=>books.find(b=>b.id===id).cover===id+'|cover',id);
    await page.waitForTimeout(100);
    await page.screenshot({path:`${out}/${engine.name()}-photo-selected.png`});
    const chosen=async()=>{
      await page.waitForFunction(()=>document.querySelector('#ed-covers .on img')?.naturalWidth>0,null,{timeout:5000});
      return page.evaluate(async()=>{
        const b=editTarget,img=document.querySelector('#ed-covers .on img');
        return {cover:b.cover,pick:document.getElementById('ed-covers').dataset.pick,
          storedHash:await rawFileHash(await imgGet(b.cover)),shownHash:await rawFileHash(await(await fetch(img.src)).blob())};
      });
    };
    const photo=await chosen();assert.equal(photo.cover,id+'|cover');assert.equal(photo.pick,photo.cover);assert.equal(photo.shownHash,photo.storedHash);
    await page.locator('#ed-card .sm-btn.primary').click();
    await page.evaluate(id=>openEditSheet(books.find(b=>b.id===id)),id);assert.deepEqual(await chosen(),photo,'reopening shows the same saved bytes');
    for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
      await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
      const geometry=await page.locator('#ed-card').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
      assert.ok(geometry.left>=0&&geometry.right<=width&&geometry.top>=0&&geometry.bottom<=height,'edit surface stays inside the viewport');
      await page.screenshot({path:`${out}/${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`});
    }
    await page.evaluate(()=>closeEditSheet());await page.reload();await page.evaluate(()=>homeReady);
    await page.evaluate(id=>openEditSheet(books.find(b=>b.id===id)),id);assert.deepEqual(await chosen(),photo,'real IndexedDB cold reload retains cover projection');
    await page.locator('#ed-pick-file input').setInputFiles(resolve(root,'assets/longreads/covers/red-headed-league.webp'));
    await page.waitForFunction(async old=>await rawFileHash(await imgGet(editTarget.cover))!==old,photo.storedHash);
    const replacement=await chosen();assert.notEqual(replacement.storedHash,photo.storedHash);assert.equal(replacement.shownHash,replacement.storedHash,'same cover key shows replacement bytes');
    await page.evaluate(()=>saveEditSheet());
    await page.evaluate(async()=>{
      const file=new File([await(await fetch('assets/classics/alice-in-wonderland.epub')).blob()],'Cover Alice.epub',{type:'application/epub+zip'});
      await importFile(file);
    });
    await page.evaluate(id=>openEditSheet(books.find(b=>b.id===id)),id);assert.deepEqual(await chosen(),replacement,'reimport retains current custom cover and its bytes');
    await page.locator('#ed-covers .ed-cover').first().click();await page.evaluate(()=>saveEditSheet());
    await page.reload();await page.evaluate(()=>homeReady);
    await page.evaluate(id=>openEditSheet(books.find(b=>b.id===id)),id);
    assert.equal(await page.locator('#ed-covers .on').textContent(),'없음');
    assert.equal(await page.evaluate(()=>editTarget.cover),null,'None persists separately from custom');
    assert.equal(await page.evaluate(()=>document.getElementById('ed-covers').dataset.pick),'');
    // A picker read that resolves after closing/reopening the same book has no owner.
    const cancelled=await page.evaluate(async id=>{
      const b=books.find(b=>b.id===id);let release;
      const input={files:[{type:'image/png',arrayBuffer:()=>new Promise(r=>release=r)}],value:'photo.png'};
      const job=pickCoverFile(input);closeEditSheet();openEditSheet(b);release(new ArrayBuffer(1));await job;
      return {live:b.cover,durable:(await bookAll()).find(b=>b.id===id).cover};
    },id);
    assert.deepEqual(cancelled,{live:null,durable:null},'late read cannot replace the reopened sheet selection');
    const newest=await page.evaluate(async()=>{
      let release;
      const first=pickCoverFile({files:[{type:'image/png',arrayBuffer:()=>new Promise(r=>release=r)}],value:'old.png'});
      const bytes=await(await fetch('assets/longreads/covers/speckled-band.webp')).arrayBuffer();
      await pickCoverFile({files:[{type:'image/webp',arrayBuffer:async()=>bytes}],value:'new.webp'});
      release(new ArrayBuffer(1));await first;
      return {type:(await imgGet(editTarget.cover)).type,hash:await rawFileHash(await imgGet(editTarget.cover))};
    });
    assert.equal(newest.type,'image/webp');assert.equal(newest.hash,photo.storedHash,'the newest picker wins against an older delayed read');
    await page.evaluate(()=>runDelete());
    assert.equal(await page.evaluate(id=>books.some(b=>b.id===id),id),false);
    assert.equal(await page.evaluate(id=>bookAll().then(all=>all.some(b=>b.id===id)),id),false);
    assert.equal(await page.evaluate(id=>imgEntries().then(all=>all.some(([key])=>String(key).startsWith(id+'|'))),id),false,'delete removes owned cover bytes');
    assert.deepEqual(errors,[]);results.push({engine:engine.name(),id,photo,replacement,checks:'upload/reopen/reload/replace/reimport/None/stale-picker/latest-picker/delete/10 viewports'});
    await context.close();
  }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
