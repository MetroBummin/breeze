import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {publicAddress,publicUrl,publicAddresses,fetchPublic,readBounded,decodeHttpResponse} from '../server/article/public-fetch.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function functions(path,names){
  const source=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true);
  return source.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>
    ts.transpile(node.getText(source),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None})).join('\n');
}
const world=(source,values={})=>{const c=createContext({console,Promise,Map,Set,Date,URL,Blob,AbortController,DOMException,TextEncoder,Uint8Array,ArrayBuffer,crypto:webcrypto,setTimeout,clearTimeout,...values});new Script(source).runInContext(c);return c;};
test('read failure rejects instead of inventing an empty library',async()=>{
  const c=world(functions('scripts/core/storage.js',['localRead','localTransaction','bookAll']),{idb:async()=>{throw Error('offline storage');}});
  await assert.rejects(c.bookAll(),/offline storage/);
});
test('transaction abort rejects even when onerror never fires',async()=>{
  let tx;const db={transaction(){tx={abort(){tx.onabort();}};return tx;}};
  const c=world(functions('scripts/core/storage.js',['localTransaction']));
  const job=c.localTransaction(db,'books','readwrite',()=>{});tx.onabort();await assert.rejects(job,/transaction failed/);
});
test('transaction completion is required before write resolves',async()=>{
  let tx,done=false;const db={transaction(){tx={objectStore(){return {put(){}};}};return tx;}};
  const c=world(functions('scripts/core/storage.js',['localTransaction','localPut','bookPut']),{idb:async()=>db,requestDurableLocalStorage(){}});
  const job=c.bookPut({id:'a'}).then(()=>done=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);tx.oncomplete();await job;assert.equal(done,true);
});
test('failed atomic deletion never removes UI/progress or reports success',async()=>{
  const books=[{id:'a'}],positions={a:{t:1}},messages=[];
  const c=world(functions('scripts/library/library.js',['deleteBook']),{books,positions,curBook:null,serverBookIdFor:()=>'',bookDeleteAssets:async()=>{throw Error('abort');},toast:text=>messages.push(text),console:{error(){}}});
  assert.equal(await c.deleteBook(books[0]),false);assert.equal(c.books.length,1);assert.ok(c.positions.a);assert.ok(!messages.some(text=>text==='이 기기에서 지웠어요'));
});
test('atomic assets deletion protects images used by other books',async()=>{
  const deleted=[],requests={};let tx;
  const a={id:'a',cover:'shared',imgSrc:{private:'url'},paras:[]},b={id:'b',cover:'shared',paras:[]};
  const db={transaction(stores,mode){assert.deepEqual(Array.from(stores),['books','originals','imgs']);assert.equal(mode,'readwrite');tx={objectStore(name){return {getAll(){return requests.books={};},getAllKeys(){return requests.keys={};},delete(key){deleted.push([name,key]);}};}};return tx;}};
  const c=world(functions('scripts/core/storage.js',['localTransaction','bookAssetKeys','bookDeleteAssets']),{IMG_MARK:'[[IMG]]:',idb:async()=>db});
  const job=c.bookDeleteAssets(a);await new Promise(resolve=>setImmediate(resolve));requests.books.result=[a,b];requests.books.onsuccess();requests.keys.result=['shared','private','a|1','b|1'];requests.keys.onsuccess();
  assert.deepEqual(deleted,[['imgs','private'],['imgs','a|1'],['books','a'],['originals','a']]);tx.oncomplete();await job;
});
test('legacy image byte records normalize to exportable Blob',async()=>{
  const c=world(functions('scripts/core/storage.js',['imageRecordBlob']));const bytes=new Uint8Array([1,2,3]).buffer;
  const blob=c.imageRecordBlob({imageBytes:bytes,imageType:'image/png'});assert.ok(blob instanceof Blob);assert.equal(blob.size,3);assert.equal(blob.type,'image/png');
});
test('middle-only same-length edit has a different content digest',async()=>{
  const c=world(functions('scripts/library/library.js',['casualContentId','sameCasualContent']));
  const a=Array.from({length:100},(_,i)=>'paragraph '+i),b=[...a];b[50]='Paragraph 50';
  assert.notEqual(await c.casualContentId(a),await c.casualContentId(b));assert.equal(await c.casualContentId(a),await c.casualContentId([...a]));assert.equal(c.sameCasualContent(a,b),false);
});
for(const [name,answer] of [['error',{error:{message:'failed'},data:null}],['null',{error:null,data:null}],['missing fields',{error:null,data:{}}],['invalid quota',{error:null,data:{ok:true,limit:-1,calls:0}}]]){
  test('quota '+name+' fails closed',async()=>{
    const c=world(functions('server/dict/index.ts',['takeQuota']),{SR:{rpc:async()=>answer},DEFAULT_DAILY_LIMIT:300});
    await assert.rejects(c.takeQuota('id'),/quota_unavailable/);
  });
}
test('valid quota grant and refusal remain distinguishable',async()=>{
  let ok=true;const c=world(functions('server/dict/index.ts',['takeQuota']),{SR:{rpc:async()=>({error:null,data:{ok,calls:1,limit:300}})},DEFAULT_DAILY_LIMIT:300});
  assert.equal((await c.takeQuota('id')).left,299);ok=false;assert.equal((await c.takeQuota('id')).ok,false);
});
test('private and special address families are not public',()=>{
  for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','100.64.0.1','192.168.1.1','198.18.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
test('URL normalization cannot bypass destination or credentials policy',()=>{
  for(const url of ['http://2130706433','http://0x7f000001','http://localhost.','http://x.internal','https://u:p@example.com','http://example.com:8080','file:///tmp/a','http://[::ffff:127.0.0.1]'])assert.throws(()=>publicUrl(url));
});
test('mixed private/public DNS answers fail closed',async()=>{
  await assert.rejects(publicAddresses(new URL('https://example.com'),async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]),/bad_url/);
});
test('every redirect is validated before transport',async()=>{
  let calls=0;await assert.rejects(fetchPublic('https://example.com',{resolve:async()=>[{address:'8.8.8.8',family:4}],transport:async()=>{calls++;return {status:302,location:'http://127.0.0.1/'};}}),/bad_url/);assert.equal(calls,1);
});
test('pinned public address list reaches transport with original hostname',async()=>{
  const result=await fetchPublic('https://example.com/a',{resolve:async()=>[{address:'8.8.8.8',family:4}],transport:async(url,addresses)=>{assert.equal(url.hostname,'example.com');assert.equal(addresses[0].address,'8.8.8.8');return {status:200,bytes:new Uint8Array([1]),headers:{}};}});assert.equal(result.bytes.length,1);
});
test('stream byte limit stops before consuming the remainder',async()=>{
  let seen=0;async function* stream(){for(let i=0;i<100;i++){seen++;yield new Uint8Array(4);}}
  await assert.rejects(readBounded(stream(),7),/too_big/);assert.equal(seen,2);
});
test('DNS wait honors cancellation',async()=>{
  const controller=new AbortController();const job=fetchPublic('https://example.com',{signal:controller.signal,resolve:()=>new Promise(()=>{})});controller.abort();await assert.rejects(job);
});
test('pinned Deno response decoder keeps body bytes and rejects oversized chunks',()=>{
  const encode=text=>new TextEncoder().encode(text);
  const raw=encode('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nTest\r\n0\r\n\r\n');
  const result=decodeHttpResponse(raw,4);
  assert.equal(new TextDecoder().decode(result.bytes),'Test');
  assert.equal(result.headers['content-type'],'text/html');
  assert.throws(()=>decodeHttpResponse(raw,3),/too_big/);
  assert.equal(new TextDecoder().decode(decodeHttpResponse(encode('HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nTest'),4).bytes),'Test');
  assert.throws(()=>decodeHttpResponse(encode('HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nTest'),4),/too_big/);
  assert.deepEqual(decodeHttpResponse(encode('HTTP/1.1 302 Found\r\nLocation: https://example.com/next\r\n\r\n'),4).location,'https://example.com/next');
});
test('runtime PDF calls disable eval without upgrading the glyph adapter',()=>{
  for(const path of ['scripts/importers/importers.js','scripts/reader/pdf-original.js'])assert.match(read(path),/getDocument\(\{isEvalSupported:false,/);
});
test('failed new shell never activates and does not delete old caches',async()=>{
  const events={},deleted=[],store=new Map();const self={location:{href:'https://breeze.test/sw.js',origin:'https://breeze.test'},addEventListener:(name,fn)=>events[name]=fn};
  world(read('sw.js'),{self,Response,caches:{open:async()=>({put:async(k,v)=>store.set(k,v),match:async k=>store.get(k)}),delete:async name=>deleted.push(name)},fetch:async url=>new Response(url==='index.html'?'<script src="broken.js"></script>':'',{status:url==='index.html'?200:503})});
  let job;events.install({waitUntil:value=>job=value});await assert.rejects(job,/Incomplete shell/);assert.equal(deleted.length,0);assert.equal(store.has('__shell_complete__'),false);
});
test('worker never automatically takes over a live Reader',()=>{
  const s=read('sw.js');assert.doesNotMatch(s,/await self\.skipWaiting\(|await self\.clients\.claim\(/);assert.match(s,/\^breeze-/);
});
test('local sync commit failures abort before remote CAS and dirty clear',()=>{
  const s=read('scripts/sync/sync.js');assert.match(s,/if\(!saveWords\(\)\|\|!save\(LS_DEAD,dead\)\)throw/);
});
test('different definitions are journaled before replacement and journal failure refuses merge',()=>{
  const memory=new Map();let accept=true;const c=world(functions('scripts/sync/sync.js',['preserveWordConflict']),{load:(k,d)=>memory.get(k)||d,save:(k,v)=>{if(!accept)return false;memory.set(k,v);return true;},toast(){}});
  c.preserveWordConflict('word',{ko:'old'},{ko:'new'});assert.equal(Object.keys(memory.get('breeze.word-conflicts')).length,1);accept=false;assert.throws(()=>c.preserveWordConflict('word',{ko:'a'},{ko:'b'}));
});
test('late Reader preparation cannot replace a newer selection',async()=>{
  let release;const delayed=new Promise(resolve=>release=resolve),shown=[];
  const values={readerOpenIntent:0,readerModeChangeToken:0,onboardingOwnsReader:()=>false,closeSentence(){},canReuseReader:()=>false,releaseRetainedReader(){},leaveOriginalReader(){},repairBookLigatures:b=>b.id==='a'?delayed:Promise.resolve(),curBook:null,setReaderPillProgress(){},posOf:()=>({}),
    document:{querySelectorAll:()=>[],getElementById(id){return {classList:{add(){},remove(){}},set textContent(v){shown.push(v);},setAttribute(){},hidden:false};},body:{classList:{add(){},remove(){}}},documentElement:{classList:{add(){}}}},
    warmDict(){},renderReaderAttribution(){},rssDate:()=>'',showReaderChrome(){},renderBookBody(){},positions:{},save(){},LS_POS:'pos',updateReaderModeControls(){},bookSupportsOriginal:()=>false,requestAnimationFrame:fn=>{fn();},restoreAnchor:()=>false,readerScrollTo(){},captureAnchor:()=>null,updatePfill(){}};
  const c=world(functions('scripts/reader/reader.js',['openBook']),values);
  const a=c.openBook({id:'a',title:'A'});await c.openBook({id:'b',title:'B'});release();await a;assert.equal(c.curBook.id,'b');assert.ok(!shown.includes('A'));
});
