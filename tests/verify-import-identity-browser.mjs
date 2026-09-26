import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';

const storage=readFileSync(new URL('../scripts/core/storage.js',import.meta.url),'utf8');
const server=createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><meta charset="utf-8"><title>Import identity storage test</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;

try{
  for(const engine of [chromium,webkit]){
    // Match the existing PDF regressions: WebKit needs a persistent profile for
    // native Blob writes to IndexedDB. Keep real original records and byte checks.
    const profile=mkdtempSync(join(tmpdir(),'breeze-import-identity-'));
    let context;
    try{
      context=await engine.launchPersistentContext(profile,{headless:true,serviceWorkers:'block'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.addScriptTag({content:`
        const load=(key,fallback)=>JSON.parse(localStorage.getItem(key)||'null')??fallback;
        const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
        ${storage}
        requestDurableLocalStorage=async()=>{};
      `});
      await page.evaluate(()=>{
        window.identityQA={};
        identityQA.bytes=[0,255,128,13,10,65,0,92,239,187,191];
        identityQA.record=(hash,tag)=>({hash,kind:'epub',name:tag+'.epub',
          blob:new Blob([new Uint8Array([...identityQA.bytes,tag.length])],{type:'application/epub+zip'})});
        identityQA.seed=async(books,originals)=>{
          const db=await idb();
          await localTransaction(db,['books','originals'],'readwrite',tx=>{
            const bs=tx.objectStore('books'),os=tx.objectStore('originals');bs.clear();os.clear();
            books.forEach(book=>bs.put(book,book.id));originals.forEach(([key,record])=>os.put(record,key));
          }).catch(error=>{throw Error('Seed books/originals: '+error.name+': '+error.message);});
          save('fixture.positions',Object.fromEntries(books.map(book=>[book.id,{p:.63,pi:7,t:123,mode:'original'}])));
        };
        identityQA.snapshot=async()=>({
          books:await bookAll(),positions:localStorage.getItem('fixture.positions'),
          originals:await Promise.all((await originalEntries()).map(async([id,record])=>{
            const {blob,...meta}=record;
            return {id,...meta,type:blob.type,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
          })),
        });
        /* Instrument native requests; keep their real transaction scheduling and
           completion/abort events intact. All hooks are restored after a case. */
        identityQA.observe=async(action,abortKey='')=>{
          const dbp=IDBDatabase.prototype,osp=IDBObjectStore.prototype;
          const originals={transaction:dbp.transaction,get:osp.get,getAll:osp.getAll,getAllKeys:osp.getAllKeys};
          const stats={readTransactions:0,writeTransactions:0,completed:0,aborted:0,gets:[],keyReads:0,bulkReads:0};
          dbp.transaction=function(...args){
            const tx=originals.transaction.apply(this,args);
            if(this.name==='breeze-img'&&Array.from(tx.objectStoreNames).includes('originals')){
              stats[tx.mode==='readonly'?'readTransactions':'writeTransactions']++;
              tx.addEventListener('complete',()=>stats.completed++);
              tx.addEventListener('abort',()=>stats.aborted++);
            }
            return tx;
          };
          osp.get=function(key){
            const request=originals.get.call(this,key);
            if(this.name==='originals'){
              stats.gets.push(key);
              if(abortKey===key){const tx=this.transaction;request.addEventListener('success',()=>tx.abort(),{once:true});}
            }
            return request;
          };
          osp.getAll=function(...args){if(this.name==='originals')stats.bulkReads++;return originals.getAll.apply(this,args);};
          osp.getAllKeys=function(...args){if(this.name==='originals')stats.keyReads++;return originals.getAllKeys.apply(this,args);};
          try{return {value:await action(),stats};}
          catch(error){return {error:error.name+': '+error.message,stats};}
          finally{dbp.transaction=originals.transaction;osp.get=originals.get;osp.getAll=originals.getAll;osp.getAllKeys=originals.getAllKeys;}
        };
      });

      const many=await page.evaluate(async()=>{
        const books=Array.from({length:120},(_,i)=>({id:'book-'+i,title:'Saved '+i,
          kind:i<100?'article':'epub',paras:['Saved text '+i],sourceHash:'stored-'+i,
          original:i<100?null:{hash:'stored-'+i},formatting:{blocks:[{r:'p',t:'Saved text '+i,f:0}]}}));
        const records=books.slice(100).map(book=>[book.id,identityQA.record(book.sourceHash,book.id)]);
        await identityQA.seed(books,records);const before=await identityQA.snapshot(),memory=JSON.stringify(books);
        const lookup=await identityQA.observe(()=>originalBookForHash(books,'new-file-hash'));
        return {lookup,unchanged:JSON.stringify(await identityQA.snapshot())===JSON.stringify(before),
          memoryUnchanged:JSON.stringify(books)===memory,expectedGets:books.slice(100).map(book=>book.id)};
      });
      assert.equal(many.lookup.error,undefined);assert.equal(many.lookup.value,null);
      assert.equal(many.lookup.stats.readTransactions,1);assert.equal(many.lookup.stats.completed,1);
      assert.equal(many.lookup.stats.writeTransactions,0);assert.equal(many.lookup.stats.keyReads,1);
      assert.equal(many.lookup.stats.bulkReads,0);assert.deepEqual(many.lookup.stats.gets,many.expectedGets);
      assert.equal(many.unchanged,true,'Miss changed saved books, progress, or original Blob bytes');
      assert.equal(many.memoryUnchanged,true);

      const stale=await page.evaluate(async()=>{
        const books=[{id:'z-first',title:'Keep my title',sourceHash:'stale-source',original:{hash:'stale-original'},paras:['Keep me.']},
          {id:'a-second',sourceHash:'different',paras:['Second.']}];
        await identityQA.seed(books,[['a-second',identityQA.record('target','second')],
          ['z-first',identityQA.record('target','first')],['orphan',identityQA.record('target','orphan')]]);
        const before=await identityQA.snapshot();
        const lookup=await identityQA.observe(async()=>{
          const book=await originalBookForHash(books,'target');return {id:book?.id,sameObject:book===books[0]};
        });
        const abort=await identityQA.observe(()=>originalBookForHash(books,'target'),'z-first');
        return {lookup,abort,unchanged:JSON.stringify(await identityQA.snapshot())===JSON.stringify(before)};
      });
      assert.equal(stale.lookup.error,undefined);assert.deepEqual(stale.lookup.value,{id:'z-first',sameObject:true});
      assert.deepEqual(stale.lookup.stats.gets,['z-first']);assert.equal(stale.lookup.stats.completed,1);
      assert.equal(stale.lookup.stats.readTransactions,1);assert.equal(stale.lookup.stats.writeTransactions,0);
      assert.match(stale.abort.error,/Abort|transaction failed/i);assert.equal(stale.abort.stats.aborted,1);
      assert.equal(stale.abort.stats.completed,0);assert.equal(stale.unchanged,true);

      const empty=await page.evaluate(async()=>{
        const books=[{id:'no-original',paras:['Saved.']},{id:'alias',original:{hash:'other'},paras:['Legacy.']}];
        await identityQA.seed(books,[]);const before=await identityQA.snapshot();
        const noCandidates=await identityQA.observe(()=>originalBookForHash([],'target'));
        const noOriginals=await identityQA.observe(()=>originalBookForHash(books,'target'));
        const unchanged=JSON.stringify(await identityQA.snapshot())===JSON.stringify(before);
        await originalPut('orphan',identityQA.record('target','orphan'));
        const orphanBefore=await identityQA.snapshot();
        const orphan=await identityQA.observe(()=>originalBookForHash(books,'target'));
        return {noCandidates,noOriginals,orphan,unchanged,
          orphanUnchanged:JSON.stringify(await identityQA.snapshot())===JSON.stringify(orphanBefore)};
      });
      assert.equal(empty.noCandidates.value,null);assert.equal(empty.noCandidates.stats.readTransactions,0);
      for(const result of [empty.noOriginals,empty.orphan]){
        assert.equal(result.error,undefined);assert.equal(result.value,null);
        assert.equal(result.stats.readTransactions,1);assert.equal(result.stats.completed,1);
        assert.equal(result.stats.writeTransactions,0);assert.deepEqual(result.stats.gets,[]);
      }
      assert.equal(empty.unchanged,true);assert.equal(empty.orphanUnchanged,true);

      const recovery=await page.evaluate(async()=>{
        const renamed={id:'renamed',title:'My legacy book',original:{hash:'legacy-hash'},paras:['Unchanged.']};
        await identityQA.seed([renamed],[['old-id',identityQA.record('legacy-hash','legacy')],
          ['unrelated',identityQA.record('another-hash','unrelated')]]);
        const before=await identityQA.snapshot();
        const lookup=await identityQA.observe(async()=>{
          const record=await originalGetForBook(renamed);
          return {hash:record.hash,type:record.blob.type,bytes:Array.from(new Uint8Array(await record.blob.arrayBuffer()))};
        });
        const after=await identityQA.snapshot();
        return {lookup,before,after};
      });
      assert.equal(recovery.lookup.error,undefined);assert.equal(recovery.lookup.value.hash,'legacy-hash');
      assert.deepEqual(recovery.after.books,recovery.before.books);
      assert.equal(recovery.after.positions,recovery.before.positions);
      assert.equal(recovery.after.originals.length,recovery.before.originals.length+1);
      for(const original of recovery.before.originals){
        assert.deepEqual(recovery.after.originals.find(record=>record.id===original.id),original);
      }
      const old=recovery.before.originals.find(record=>record.id==='old-id');
      assert.deepEqual(recovery.after.originals.find(record=>record.id==='renamed'),{...old,id:'renamed'});
      assert.deepEqual(recovery.lookup.value.bytes,old.bytes);assert.equal(recovery.lookup.value.type,old.type);
      assert.deepEqual(errors,[]);
      console.log(engine.name()+': import identity uses native IndexedDB transactions; 120-book miss, stale metadata, abort, empty/orphan originals and byte-preserving legacy recovery passed');
    }finally{try{await context?.close();}finally{rmSync(profile,{recursive:true,force:true});}}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
