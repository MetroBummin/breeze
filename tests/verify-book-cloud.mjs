import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=readFileSync(new URL('../scripts/library/book-cloud.js',import.meta.url),'utf8');
const hash='a'.repeat(64);
const user='11111111-1111-1111-1111-111111111111';

function boot({flag=false,online=true}={}){
  const fetches=[];
  const memory=new Map();
  const localStorage={
    getItem:key=>memory.has(key)?memory.get(key):null,
    setItem:(key,value)=>memory.set(key,String(value)),
    removeItem:key=>memory.delete(key)
  };
  const toasts=[];
  const context={
    window:{BREEZE_CONFIG:{BOOK_CLOUD:flag,SB_URL:'https://example.test',SB_KEY:'anon'}},
    localStorage,console:{error(){}},navigator:{onLine:online},
    fetch:async(url,init)=>{fetches.push({url,init});return {ok:true,json:async()=>({ok:true}),arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};},
    document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({append(){},setAttribute(){},className:'',onclick:null})},
    sbUser:{id:user},sb:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},from(){return {select:async()=>({data:[],error:null})};},rpc:async()=>({data:{ok:true}})},
    books:[],positions:{},curBook:null,LS_POS:'breeze.pos',
    toast:message=>toasts.push(message),
    save(key,value){localStorage.setItem(key,JSON.stringify(value));},
    bookPut:async book=>{context.saved=book;},
    crypto:webcrypto,setTimeout,clearTimeout,Blob,File,URL
  };
  context.window.BREEZE_CONFIG=context.window.BREEZE_CONFIG;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'scripts/library/book-cloud.js'});
  return {context,fetches,memory,toasts};
}

test('flag off does not render a link row, fetch, or write storage',async()=>{
  const {context,fetches,memory}=boot();
  assert.equal(context.bookCloudEnabled(),false);
  context.renderBookCloudToggle({id:'file-'+hash.slice(0,32),kind:'epub',sourceHash:hash,original:{hash}});
  context.scheduleBookCloudPosition();
  assert.equal(await context.syncBookCloud(),false);
  assert.equal(await context.flushBookCloud(),false);
  assert.equal(await context.forgetBookCloud({kind:'epub',sourceHash:hash,bookCloudLink:{on:true}}),true);
  assert.equal(fetches.length,0);
  assert.equal(memory.size,0);
  assert.equal(context.bookCloudLibraryRows().length,0);
});

test('missing config stays off',()=>{
  const {context,memory,fetches}=boot();
  context.window.BREEZE_CONFIG={};
  context.scheduleBookCloudPosition();
  assert.equal(context.bookCloudEnabled(),false);
  assert.equal(fetches.length,0);
  assert.equal(memory.size,0);
});

test('an opted-in book uploads and a book that is not opted in never does',async()=>{
  const {context,fetches}=boot({flag:true});
  const calls=[];
  context.sb.auth.getSession=async()=>({data:{session:{access_token:'token'}}});
  context.bookCloudPost=async(op,body)=>{calls.push({op,body});if(op==='reserve')return {ok:true,url:'https://signed.example/put'};if(op==='complete')return {ok:true,ready:true};return {ok:true};};
  context.fetch=async(url,init)=>{fetches.push({url,init});return {ok:true};};
  const bytes=new Uint8Array([9,8,7]);
  context.originalGetForBook=async()=>({blob:new Blob([bytes])});
  context.rawFileHash=async()=>hash;
  context.books=[{id:'file-'+hash.slice(0,32),kind:'epub',title:'Sample',author:'Author',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}}];
  context.bookCloudWriteOutbox(user,{version:1,uploads:{[hash]:{kind:'epub',title:'Sample',author:'Author',tombstone:''}},positions:{},removes:{}});
  assert.equal(await context.syncBookCloud(),true);
  assert.deepEqual(calls.map(call=>call.op),['reserve','complete']);
  assert.equal(calls[0].body.bookId,hash);
  assert.equal(fetches.some(call=>String(call.url).includes('/functions/v1/book-cloud')),false);
  assert.equal(fetches.some(call=>call.init&&call.init.method==='PUT'),true);
  const idle=boot({flag:true});
  const other=[];
  idle.context.bookCloudPost=async op=>{other.push(op);return {ok:true};};
  idle.context.books=[{id:'local',kind:'epub',sourceHash:hash,original:{hash}}];
  await idle.context.syncBookCloud();
  assert.deepEqual(other,[]);
});

test('turning the link off removes the server copy and keeps the local book',async()=>{
  const {context}=boot({flag:true});
  const ops=[];
  context.bookCloudPost=async op=>{ops.push(op);return {ok:true,removed:true};};
  const book={id:'file-'+hash.slice(0,32),kind:'pdf',title:'Sample',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:'old'}};
  await context.bookCloudSetLink(book,false);
  assert.deepEqual(ops,['remove']);
  assert.equal(book.bookCloudLink.on,false);
  assert.equal(context.saved,book);
});

test('a mismatched download is not opened',async()=>{
  const {context,toasts}=boot({flag:true});
  let opened=false;
  context.bookCloudPost=async()=>({ok:true,url:'https://signed.example/get'});
  context.fetch=async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1]).buffer});
  context.rawFileHash=async()=>'b'.repeat(64);
  context.prepareImportedFile=async()=>{throw new Error('should not parse');};
  context.openBook=async()=>{opened=true;};
  await context.bookCloudDownload({bookId:hash,title:'Sample',kind:'epub',locator:null});
  assert.equal(opened,false);
  assert.match(toasts.join('\n'),/원본과 달라/);
});

test('offline download does not fetch and offline removal stays queued',async()=>{
  const {context,fetches,memory,toasts}=boot({flag:true,online:false});
  await context.bookCloudDownload({bookId:hash,title:'Sample',kind:'epub'});
  assert.match(toasts.join('\n'),/오프라인/);
  const book={kind:'epub',sourceHash:hash,bookCloudLink:{on:true,tombstone:''}};
  assert.equal(await context.forgetBookCloud(book),true);
  const box=JSON.parse(memory.get('breeze.book-cloud.v1.'+user));
  assert.ok(box.removes[hash]);
  assert.equal(fetches.length,0);
});

test('a position conflict keeps the server head and does not rewrite the open reader',async()=>{
  const {context}=boot({flag:true});
  context.sb.rpc=async()=>({data:{ok:false,revision:'server-2',locator:{p:0.8,t:5,mode:'text'}}});
  context.books=[{id:'local',sourceHash:hash,bookCloudLink:{on:true}}];
  context.positions.local={p:0.2,t:9,mode:'text'};
  context.curBook=context.books[0];
  context.bookCloudWriteOutbox(user,{version:1,uploads:{},removes:{},positions:{[hash]:{base:'server-1',revision:'local-2',locator:{p:0.2,t:9,mode:'text'}}}});
  await context.syncBookCloud();
  assert.equal(context.positions.local.p,0.2);
  assert.equal(context.bookCloudHeads[hash].revision,'server-2');
  const box=context.bookCloudReadOutbox(user);
  assert.equal(box.positions[hash],undefined);
});

test('each account keeps its own outbox',()=>{
  const {context}=boot({flag:true});
  context.bookCloudWriteOutbox(user,{version:1,uploads:{[hash]:{kind:'epub'}},positions:{},removes:{}});
  context.sbUser={id:'22222222-2222-2222-2222-222222222222'};
  const other=context.bookCloudReadOutbox(context.sbUser.id);
  assert.equal(JSON.stringify(other.uploads),'{}');
  assert.ok(context.bookCloudReadOutbox(user).uploads[hash]);
});
