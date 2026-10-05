import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=process.env.BREEZE_IMPORT_ROOT||fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_IMPORT_PROOF||'/tmp/breeze-import-commit-proof';mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(resolve(root)+'/'))throw Error();
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const results=[];
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=engine===webkit&&process.env.BREEZE_IMPORT_SINGLE_BROWSER==='1'?null:await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
 const run=async(name,fn)=>{
  if(process.env.BREEZE_IMPORT_CASE&&!process.env.BREEZE_IMPORT_CASE.split(',').includes(name))return;
  const profile=engine===webkit?mkdtempSync(resolve(tmpdir(),'breeze-import-')):null;
  const context=profile?await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'}):await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
  await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  const page=await context.newPage();page.setDefaultTimeout(15000);
  try{
   await page.goto(url);await page.evaluate(()=>homeReady);
   await page.evaluate(async()=>{
    const blob=await (await fetch('assets/classics/alice-in-wonderland.epub')).blob();
    window.commitQA={file:new File([blob],'Atomic Alice.epub',{type:'application/epub+zip'})};
    commitQA.import=async options=>{readerNotices.reset();return importFile(commitQA.file,null,options);};
    commitQA.hash=async(value,label)=>{
     try{return await rawFileHash(value);}
     catch(error){throw new Error(label+': '+error.name+': '+error.message);}
    };
    commitQA.snapshot=async()=>{
     const b=books.find(b=>b.kind==='epub');if(!b)return {book:null};
     const record=await originalGet(b.id),images={};
     for(const [key,value] of await imgEntries())if(String(key).startsWith(b.id+'|'))images[key]=await commitQA.hash(imageRecordBlob(value),'snapshot image '+key);
     return {book:await rawFileHash(new Blob([JSON.stringify((await bookAll()).find(x=>x.id===b.id))])),live:await rawFileHash(new Blob([JSON.stringify(b)])),images,
      original:record?{...record,blob:await commitQA.hash(record.blob,'snapshot original')}:null,position:JSON.stringify(posOf(b.id))};
    };
   });
   if(process.env.BREEZE_IMPORT_BYTE_DIAGNOSTICS==='1')await page.evaluate(readFileSync(new URL('./helpers/import-byte-diagnostics.js',import.meta.url),'utf8'));
   await fn(page);results.push({engine:engine.name(),name,pass:true});
  }catch(error){results.push({engine:engine.name(),name,pass:false,error:String(error),stack:error.stack});await page.screenshot({path:proof+'/'+engine.name()+'-'+name+'-failure.png'}).catch(()=>{});}
  finally{if(process.env.BREEZE_IMPORT_BYTE_DIAGNOSTICS==='1'){
   const bytes=await page.evaluate(async()=>{await window.importByteDiagnostics?.afterCase();return window.importByteDiagnostics?.events||JSON.parse(sessionStorage.getItem('import-byte-diagnostics')||'null');}).catch(error=>({error:String(error)}));
   writeFileSync(proof+'/'+engine.name()+'-'+name+'-bytes.json',JSON.stringify(bytes,null,2));
  }await context.close();if(profile)rmSync(profile,{recursive:true,force:true});console.log(JSON.stringify(results.at(-1)));}
 };
 try{
  await run('native-staged-promotion-bytes',async page=>{
   const result=await page.evaluate(async()=>{
    const expected=[],failures=[];
    for(let n=0;n<20;n++){
     const prefix='promotion-stage-'+n,id='promotion-book-'+n;
     const bytes=new Uint8Array(53578);for(let i=0;i<bytes.length;i++)bytes[i]=(i+n)%251;
     const blob=new Blob([bytes],{type:'image/jpeg'}),hash=await rawFileHash(blob);
     await imgPut(prefix+'|0',blob);await imgPut(prefix+'|cover',blob);
     const staged=await rawFileHash(await imgGet(prefix+'|0'));
     if(staged!==hash)failures.push({n,phase:'staging',staged,hash});
     await commitImportedBook({id,kind:'epub',cover:id+'|cover',paras:[IMG_MARK+id+'|0']},null,prefix);
     for(const suffix of ['0','cover']){
      const key=id+'|'+suffix;expected.push({key,hash});
      try{const actual=await rawFileHash(await imgGet(key));if(actual!==hash)failures.push({key,actual,hash});}
      catch(error){failures.push({key,error:String(error)});}
     }
     if((await imgEntries()).some(([key])=>String(key).startsWith(prefix+'|')))failures.push({n,phase:'staging-not-deleted'});
    }
    return {expected,failures};
   });
   assert.deepEqual(result.failures,[],'completed promotion must retain every native staged image byte');
   await page.reload();await page.evaluate(()=>homeReady);
   const failures=await page.evaluate(async expected=>{
    const failures=[];for(const {key,hash} of expected){try{if(await rawFileHash(await imgGet(key))!==hash)failures.push(key);}catch(error){failures.push({key,error:String(error)});}}return failures;
   },result.expected);
   assert.deepEqual(failures,[],'promoted image bytes must survive reload');
  });
  await run('staged-byte-read-failure-preserves-book',async page=>{
   await page.evaluate(()=>commitQA.import());
   const result=await page.evaluate(async()=>{
    const b=books.find(b=>b.kind==='epub'),before=await commitQA.snapshot(),prefix='unreadable-stage';
    await imgPut(prefix+'|0',new Blob(['unreadable staged image'],{type:'image/png'}));
    const read=Blob.prototype.arrayBuffer;let failed=false;
    Blob.prototype.arrayBuffer=async()=>{throw new DOMException('Controlled unreadable staged bytes','NotFoundError');};
    try{await commitImportedBook({...b,title:'Must not publish'},null,prefix);}catch{failed=true;}finally{Blob.prototype.arrayBuffer=read;}
    return {failed,before,after:await commitQA.snapshot()};
   });
   assert.equal(result.failed,true);assert.deepEqual(result.after,result.before,'unreadable staged bytes must not change any existing book or image');
  });
  await run('cover-edit-overlaps-reimport',async page=>{
   await page.evaluate(()=>commitQA.import());
   const result=await page.evaluate(async()=>{
    const b=books.find(b=>b.kind==='epub');b.cover=b.id+'|0';b.coverUpdatedAt=1;await bookPut(b);openEditSheet(b);
    const file=new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="red"/></svg>'],'custom.svg',{type:'image/svg+xml'});
    const dt=new DataTransfer();dt.items.add(file);const input=document.createElement('input');input.type='file';input.files=dt.files;
    const repair=waitForArticleBookRepair;let release;
    waitForArticleBookRepair=()=>new Promise(r=>release=r);
    try{
     const edit=pickCoverFile(input);while(!release)await new Promise(r=>setTimeout(r,5));
     await commitQA.import();release();await edit;closeEditSheet();
     return {expected:await rawFileHash(file),actual:await rawFileHash(await imgGet(b.cover)),cover:b.cover,durable:(await bookAll()).find(x=>x.id===b.id).cover};
    }finally{waitForArticleBookRepair=repair;}
   });
   assert.equal(result.actual,result.expected,'overlapping reimport must not replace newly selected cover bytes');
   assert.equal(result.cover,result.durable);
   await page.reload();await page.evaluate(()=>homeReady);
   assert.equal(await page.evaluate(async()=>{const b=books.find(b=>b.kind==='epub');return rawFileHash(await imgGet(b.cover));}),result.expected);
  });
  await run('explicit-no-cover-survives-reimport',async page=>{
   await page.evaluate(()=>commitQA.import());
   const result=await page.evaluate(async()=>{
    const b=books.find(b=>b.kind==='epub');openEditSheet(b);document.getElementById('ed-covers').dataset.pick='';await saveEditSheet();
    const revision=b.coverUpdatedAt;await commitQA.import();return {cover:b.cover,revision:b.coverUpdatedAt,expectedRevision:revision,durable:(await bookAll()).find(x=>x.id===b.id).cover};
   });
   assert.equal(result.cover,null);assert.equal(result.durable,null);assert.equal(result.revision,result.expectedRevision);
   await page.reload();await page.evaluate(()=>homeReady);assert.equal(await page.evaluate(()=>books.find(b=>b.kind==='epub').cover),null);
  });
  for(const noCover of [false,true])await run('edit-wins-over-import-snapshot-'+noCover,async page=>{
   await page.evaluate(()=>commitQA.import());
   const result=await page.evaluate(async noCover=>{
    const b=books.find(b=>b.kind==='epub'),commit=commitImportedBook;let release;
    commitImportedBook=async(...args)=>{await new Promise(r=>release=r);return commit(...args);};
    try{
     const importing=commitQA.import();while(!release)await new Promise(r=>setTimeout(r,5));
     openEditSheet(b);
     if(noCover)document.getElementById('ed-covers').dataset.pick='';
     else{
      const dt=new DataTransfer();dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"><circle r="50" fill="blue"/></svg>'],'chosen.svg',{type:'image/svg+xml'}));
      const input=document.createElement('input');input.type='file';input.files=dt.files;await pickCoverFile(input);
     }
     document.getElementById('ed-title').value='User title during import';await saveEditSheet();
     const expected={cover:b.cover,revision:b.coverUpdatedAt,hash:b.cover?await rawFileHash(await imgGet(b.cover)):null};
     release();await importing;const durable=(await bookAll()).find(x=>x.id===b.id);
     return {expected,actual:{cover:b.cover,revision:b.coverUpdatedAt,hash:b.cover?await rawFileHash(await imgGet(b.cover)):null},title:b.title,durableTitle:durable.title,durableCover:durable.cover};
    }finally{commitImportedBook=commit;}
   },noCover);
   assert.deepEqual(result.actual,result.expected);assert.equal(result.title,'User title during import');assert.equal(result.durableTitle,result.title);assert.equal(result.durableCover,result.expected.cover);
  });
  for(const store of ['imgs','books'])await run('cover-edit-abort-'+store,async page=>{
   await page.evaluate(()=>commitQA.import());
   const result=await page.evaluate(async store=>{
    const b=books.find(b=>b.kind==='epub'),before=await commitQA.snapshot();openEditSheet(b);
    const dt=new DataTransfer();dt.items.add(new File(['replacement image'],'chosen.png',{type:'image/png'}));
    const input=document.createElement('input');input.type='file';input.files=dt.files;
    const put=IDBObjectStore.prototype.put;let failed=false;
    IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(this.name===store)this.transaction.abort();return request;};
    try{await pickCoverFile(input);}catch{failed=true;}finally{IDBObjectStore.prototype.put=put;closeEditSheet();}
    return {failed,before,after:await commitQA.snapshot()};
   },store);
   assert.equal(result.failed,true);assert.deepEqual(result.after,result.before,'failed cover edit must preserve old image bytes and live/durable metadata');
  });
  await run('cover-preservation-and-home-revision',async page=>{
   await page.evaluate(()=>commitQA.import());
   await page.waitForFunction(()=>document.querySelector('#shelf .bookcard .cover')?.naturalWidth>0);
   await page.evaluate(async()=>{
    const book=books.find(b=>b.kind==='epub');openEditSheet(book);
    const file=new File(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"><rect width="100" height="150" fill="#db2777"/></svg>'],'personal.svg',{type:'image/svg+xml'});
    const dt=new DataTransfer();dt.items.add(file);const input=document.createElement('input');input.type='file';input.files=dt.files;
    await pickCoverFile(input);closeEditSheet();
    positions[book.id]={mode:'text',pi:10,dy:15,p:.2,t:123};save(LS_POS,positions);
    commitQA.before=await commitQA.snapshot();
   });
   const failures=[];
   await page.waitForTimeout(200);
   const home=await page.evaluate(async()=>{const b=books.find(b=>b.kind==='epub'),node=document.querySelector(`[data-local-book="${b.id}"] .cover`);return {shown:await rawFileHash(await(await fetch(node.src)).blob()),stored:await rawFileHash(await imgGet(b.cover))};});
   if(home.shown!==home.stored)failures.push('Home retains old cover bytes');
   await page.evaluate(()=>commitQA.import());
   const changed=await page.evaluate(async()=>{const after=await commitQA.snapshot();return {before:commitQA.before,after};});
   if(JSON.stringify(changed.after.images)!==JSON.stringify(changed.before.images))failures.push('reimport overwrites image bytes');
   assert.equal(changed.after.position,changed.before.position,'backward reading position survives reimport');
   for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const dark of [false,true]){
    await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();},dark);
    await page.screenshot({path:`${proof}/${engine.name()}-cover-${width}x${height}-${dark}.png`});
   }
   await page.reload();await page.evaluate(()=>homeReady);
   const cold=await page.evaluate(async()=>{const b=books.find(b=>b.kind==='epub');return {hash:await rawFileHash(await imgGet(b.cover)),p:posOf(b.id).p};});
   if(cold.hash!==home.stored)failures.push('cold reload lost custom cover');assert.equal(cold.p,.2);
   assert.deepEqual(failures,[]);
  });
  for(const store of ['imgs','originals','books'])await run('abort-'+store,async page=>{
   await page.evaluate(()=>commitQA.import());const before=await page.evaluate(()=>commitQA.snapshot());
   const result=await page.evaluate(async store=>{
    const put=IDBObjectStore.prototype.put;let aborted=false;
    IDBObjectStore.prototype.put=function(value,key){const req=put.call(this,value,key);
     if(!aborted&&this.name===store&&(store!=='imgs'||String(key).startsWith('file-'))){aborted=true;this.transaction.abort();}return req;};
    let receipt;try{receipt=await commitQA.import();}finally{IDBObjectStore.prototype.put=put;}
    return {aborted,receipt:receipt||null,after:await commitQA.snapshot(),notice:document.getElementById('home-notice').textContent};
   },store);
   assert.equal(result.aborted,true);assert.equal(result.receipt,null,'aborted promotion must not report a committed receipt');
   assert.deepEqual(result.after,before,'book, original, images and live state must all roll back');
   assert.ok(!result.notice.includes('연결했어요'));
   await page.reload();await page.evaluate(()=>homeReady);
   assert.equal(await page.evaluate(async()=>{const b=books.find(b=>b.kind==='epub');return !!await imgGet(b.cover);}),true);
  });
  await run('new-original-failure-publishes-nothing',async page=>{
   const result=await page.evaluate(async()=>{
    const put=IDBObjectStore.prototype.put;let aborted=false;
    IDBObjectStore.prototype.put=function(value,key){const req=put.call(this,value,key);if(this.name==='originals'&&!aborted){aborted=true;this.transaction.abort();}return req;};
    let receipt;try{receipt=await commitQA.import();}finally{IDBObjectStore.prototype.put=put;}
    return {aborted,receipt:receipt||null,live:books.length,durable:(await bookAll()).length,originals:(await originalAll()).length,images:(await imgEntries()).length};
   });
   assert.deepEqual(result,{aborted:true,receipt:null,live:0,durable:0,originals:0,images:0});
   assert.ok(await page.evaluate(()=>commitQA.import()),'failed first import can retry');
  });
  await run('abort-signal-during-promotion',async page=>{
   await page.evaluate(()=>commitQA.import());
   const result=await page.evaluate(async()=>{
    const before=await commitQA.snapshot(),controller=new AbortController(),put=IDBObjectStore.prototype.put;let interrupted=false;
    IDBObjectStore.prototype.put=function(value,key){const req=put.call(this,value,key);if(!interrupted&&this.name==='imgs'&&String(key).startsWith('file-')){interrupted=true;controller.abort();}return req;};
    let receipt;try{receipt=await commitQA.import({signal:controller.signal});}finally{IDBObjectStore.prototype.put=put;}
    return {interrupted,receipt:receipt||null,before,after:await commitQA.snapshot()};
   });
   assert.equal(result.interrupted,true);assert.equal(result.receipt,null);assert.deepEqual(result.after,result.before);
   assert.ok(await page.evaluate(()=>commitQA.import()),'interrupted identity can retry');
  });
  await run('same-and-different-file-owners',async page=>{
   const result=await page.evaluate(async()=>{
    const file=new File(['A repeated file has one identity.'],'Same.txt'),other=new File(['A different file has its own owner.'],'Different.txt');
    const put=bookPut,commit=typeof commitImportedBook==='function'?commitImportedBook:null;let release,entered=0;
    const hold=async(original,args)=>{if(args[0].title==='Same'&&++entered===1)await new Promise(r=>release=r);return original(...args);};
    bookPut=(...args)=>hold(put,args);if(commit)commitImportedBook=(...args)=>hold(commit,args);
    try{
     const a=importFile(file);while(!release)await new Promise(r=>setTimeout(r,5));
     const b=importFile(file),c=importFile(other);await c;
     const differentCompleted=books.some(x=>x.title==='Different');release();await Promise.all([a,b]);
     return {differentCompleted,sameCount:books.filter(x=>x.title==='Same').length,otherCount:books.filter(x=>x.title==='Different').length,durable:(await bookAll()).length};
    }finally{bookPut=put;if(commit)commitImportedBook=commit;}
   });
   assert.deepEqual(result,{differentCompleted:true,sameCount:1,otherCount:1,durable:2});
  });
  await run('cancelled-owner-does-not-cancel-follower',async page=>{
   const result=await page.evaluate(async()=>{
    const file=new File(['Cancellation keeps a later independent import alive.'],'Retry.txt'),controller=new AbortController();
    const prepare=prepareImportedFile;let release,held=false;
    prepareImportedFile=async(...args)=>{if(!held){held=true;await new Promise(r=>release=r);}return prepare(...args);};
    try{
     const first=importFile(file,null,{signal:controller.signal});while(!release)await new Promise(r=>setTimeout(r,5));
     const later=importFile(file);controller.abort();release();const receipts=await Promise.all([first,later]);
     return {first:!!receipts[0],later:!!receipts[1],count:books.filter(x=>x.title==='Retry').length};
    }finally{prepareImportedFile=prepare;}
   });
   assert.deepEqual(result,{first:false,later:true,count:1});
  });
 }finally{await browser?.close();}
}}finally{await new Promise(r=>server.close(r));writeFileSync(proof+'/results.json',JSON.stringify(results,null,2));}
assert.ok(results.every(r=>r.pass),'Import commit regressions failed; see '+proof+'/results.json');
