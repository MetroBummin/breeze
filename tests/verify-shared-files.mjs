import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {File} from 'node:buffer';
const source=readFileSync(new URL('../scripts/library/shared-files.js',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const bytes=Buffer.alloc(256*1024+11,91);
const item={id,name:'Book.pdf',size:bytes.length};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function environment(overrides={}){
  const events=new Map(),docEvents=new Map(),reads=[],imports=[],acks=[],messages=[];
  const context={File,atob,Uint8Array,Map,Set,Promise,console:{warn(){}},libraryLoadError:false,
    document:{visibilityState:'visible',addEventListener:(name,fn)=>docEvents.set(name,fn)},
    addEventListener:(name,fn)=>events.set(name,fn),toast:message=>messages.push(message),
    breezeSharedFiles:{readChunk:async(key,offset)=>{reads.push([key,offset]);return bytes.subarray(offset,offset+256*1024).toString('base64');},
      acknowledge:async key=>acks.push(key)},
    importFile:async(file,extra,options)=>{imports.push({file,extra,options});return {bookId:'book',originalStored:true};},...overrides};
  context.window=context;runInNewContext(source,context);
  return {context,reads,imports,acks,messages,deliver:items=>events.get('breeze-shared-files')({detail:items}),
    foreground:()=>docEvents.get('visibilitychange')(),run:()=>context.importPendingSharedFiles()};
}
test('waits for library startup, reads bounded chunks, acknowledges only after persistence',async()=>{
  const e=environment();e.deliver([item]);await turn();assert.equal(e.reads.length,0);
  let persist;e.context.importFile=async(file)=>{assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);await new Promise(resolve=>persist=resolve);return {originalStored:true};};
  const job=e.context.startSharedFileImports();await turn();assert.deepEqual(e.reads,[[id,0],[id,256*1024]]);
  assert.deepEqual(e.acks,[]);persist();await job;assert.deepEqual(e.acks,[id]);
});
test('repeated native deliveries while importing do not start duplicate jobs',async()=>{
  const e=environment();let release;
  e.context.importFile=async()=>{e.imports.push(1);await new Promise(resolve=>release=resolve);return {originalStored:true};};
  await e.context.startSharedFileImports();e.deliver([item,item]);await turn();
  e.deliver([item]);assert.equal(e.imports.length,1);release();await e.run();assert.deepEqual(e.acks,[id]);
  e.deliver([item]);await e.run();assert.equal(e.imports.length,1);
});
test('failed/partial imports retain originals, retry next foreground, and allow later files',async()=>{
  const e=environment();let succeed=false;
  e.context.importFile=async file=>{e.imports.push(file.name);return {originalStored:file.name==='Second.epub'||succeed};};
  await e.context.startSharedFileImports();e.deliver([item,{...item,id:second,name:'Second.epub'}]);await e.run();
  assert.deepEqual(e.acks,[second]);assert.equal(e.imports.length,2);
  e.deliver([item]);await e.run();assert.equal(e.imports.length,2,'failed share looped without a retry gesture');
  succeed=true;e.foreground();await e.run();assert.deepEqual(e.acks,[second,id]);
});
test('acknowledgement failure retries cleanup without reimporting in the same session',async()=>{
  const e=environment();let failed=true;
  e.context.breezeSharedFiles.acknowledge=async key=>{if(failed)throw Error('disk');e.acks.push(key);};
  await e.context.startSharedFileImports();e.deliver([item]);await e.run();assert.equal(e.imports.length,1);assert.deepEqual(e.acks,[]);
  failed=false;e.foreground();await e.run();assert.equal(e.imports.length,1);assert.deepEqual(e.acks,[id]);
});
test('invalid metadata or truncated transfer never reaches importer or acknowledgement',async()=>{
  const e=environment();await e.context.startSharedFileImports();
  e.deliver([{...item,id:'../escape'},{...item,name:'../Book.pdf'},{...item,name:'Book.txt'},
    {...item,size:0},{...item,size:100*1024*1024+1}]);await e.run();assert.equal(e.reads.length,0);
  e.context.breezeSharedFiles.readChunk=async()=>Buffer.from('short').toString('base64');e.deliver([item]);await e.run();
  assert.equal(e.imports.length,0);assert.deepEqual(e.acks,[]);
});
test('failed library load preserves all pending files until the library can be read',async()=>{
  const e=environment({libraryLoadError:true});e.deliver([item]);await e.context.startSharedFileImports();assert.equal(e.reads.length,0);
  e.context.libraryLoadError=false;e.foreground();await e.run();assert.deepEqual(e.acks,[id]);
});
test('startup snapshot is imported with no category inherited from the visible shelf',async()=>{
  const e=environment({breezeSharedFilesPending:[item]});await e.context.startSharedFileImports();
  assert.equal(e.imports.length,1);assert.equal(e.imports[0].options.folderId,'');assert.equal(e.imports[0].file.type,'application/pdf');
});
