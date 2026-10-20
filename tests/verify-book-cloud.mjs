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
    books:[],positions:{},curBook:null,LS_POS:'breeze.pos',deviceId:()=>'device-a',
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

test('a stale device upload never removes another device position',async()=>{
  const {context}=boot({flag:true});
  const stored={tablet:{p:0.8,t:50,mode:'text'}};
  context.deviceId=()=>'phone';
  context.sb.rpc=async(name,args)=>{
    assert.equal(name,'breeze_put_device_book_position');
    assert.equal(args.device_id,'phone');
    stored.phone=args.locator;
    return {data:{ok:true,device_id:'phone',locator:args.locator}};
  };
  context.books=[{id:'local',sourceHash:hash,bookCloudLink:{on:true}}];
  context.positions.local={p:0.2,t:9,mode:'text'};
  context.curBook=context.books[0];
  context.savedPlaceReleased=()=>true;
  context.bookCloudDevices[hash]={tablet:{locator:{p:0.8,t:50,mode:'text'},readAt:50}};
  context.bookCloudWriteOutbox(user,{version:1,uploads:{},removes:{},positions:{[hash]:{deviceId:'phone',token:'local-2',locator:{p:0.2,t:9,mode:'text'}}}});
  await context.syncBookCloud();
  assert.equal(context.positions.local.p,0.2);
  assert.equal(stored.phone.p,0.2);
  assert.equal(stored.phone.t,9);
  assert.equal(stored.tablet.p,0.8);
  assert.equal(stored.tablet.t,50);
  assert.equal(context.bookCloudDevices[hash].tablet.locator.p,0.8);
  assert.equal(context.bookCloudReadOutbox(user).positions[hash],undefined);
});

test('a not-linked position is dropped and is not sent again',async()=>{
  const {context}=boot({flag:true});
  let calls=0;
  context.sb.rpc=async()=>{
    calls++;
    return {data:null,error:{code:'42501',message:'Book is not linked'}};
  };
  context.bookCloudDevices[hash]={['device-a']:{locator:{p:0.2,t:9,mode:'text'},readAt:9}};
  const place={base:'rev-1',revision:'local-2',locator:{p:0.4,t:12,mode:'text'}};
  context.bookCloudWriteOutbox(user,{version:1,uploads:{},removes:{},positions:{[hash]:place}});
  await context.syncBookCloud();
  assert.equal(calls,1);
  assert.equal(context.bookCloudReadOutbox(user).positions[hash],undefined);
  assert.equal(context.bookCloudDevices[hash],undefined);
  await context.syncBookCloud();
  assert.equal(calls,1);

  const deleted=boot({flag:true});
  let refused=0;
  deleted.context.sb.rpc=async()=>{refused++;return {data:null,error:{code:'42501',message:'Book is not linked'}};};
  const id='file-'+hash.slice(0,32);
  deleted.context.books=[{id,kind:'pdf',title:'2026.03.16',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}}];
  deleted.context.positions[id]={p:0.4,t:12,mode:'original',original:{kind:'pdf',page:3,y:0.2}};
  deleted.context.sb.from=table=>({select:async()=>table==='book_cloud'
    ?{data:[{book_id:hash,title:'2026.03.16',author:'',kind:'pdf',status:'deleted',tombstone:'gone',byte_size:0}]}
    :{data:[]}});
  deleted.context.bookCloudWriteOutbox(user,{version:1,uploads:{},removes:{},positions:{[hash]:place}});
  await deleted.context.syncBookCloud();
  await deleted.context.syncBookCloud();
  assert.equal(refused,0);
  assert.equal(deleted.context.bookCloudReadOutbox(user).positions[hash],undefined);
});

test('ok still clears a position and a retryable failure stays queued',async()=>{
  for(const status of ['pending','ready']){
    const live=boot({flag:true});
    let calls=0;
    live.context.sb.rpc=async(name,args)=>{calls++;return {data:{ok:true,device_id:args.device_id,locator:args.locator}};};
    live.context.sb.from=table=>({select:async()=>table==='book_cloud'
      ?{data:[{book_id:hash,status,kind:'pdf',title:'',author:'',tombstone:'',byte_size:1}]}
      :{data:[]}});
    live.context.bookCloudWriteOutbox(user,{version:1,uploads:{},removes:{},positions:{[hash]:{base:null,revision:'local-'+status,locator:{p:0.2,t:3,mode:'text'}}}});
    await live.context.syncBookCloud();
    assert.equal(calls,1,status);
    assert.equal(live.context.bookCloudReadOutbox(user).positions[hash],undefined,status);
    assert.equal(live.context.bookCloudDevices[hash]['device-a'].locator.p,0.2,status);
  }

  const fail=boot({flag:true});
  let calls=0;
  fail.context.sb.rpc=async()=>{
    calls++;
    return {data:null,error:{code:'42501',message:'Book account changed'}};
  };
  const place={base:'rev-1',revision:'local-2',locator:{p:0.4,t:12,mode:'text'}};
  fail.context.bookCloudDevices[hash]={['device-a']:{locator:{p:0.2,t:9,mode:'text'},readAt:9}};
  fail.context.bookCloudWriteOutbox(user,{version:1,uploads:{},removes:{},positions:{[hash]:place}});
  await fail.context.syncBookCloud();
  assert.equal(calls,1);
  assert.equal(fail.context.bookCloudReadOutbox(user).positions[hash].revision,'local-2');
  assert.equal(fail.context.bookCloudDevices[hash]['device-a'].locator.p,0.2);
  await fail.context.syncBookCloud();
  assert.equal(calls,2);
});

test('forget during an in-flight position send is not written back',async()=>{
  const {context}=boot({flag:true});
  const other='b'.repeat(64);
  const book={id:'local',kind:'pdf',title:'2026.03.16',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
  context.books=[book];
  context.positions.local={p:0.4,t:12,mode:'text'};
  context.bookCloudPost=async()=>({ok:true,removed:true});
  const place={base:null,revision:'local-2',locator:{p:0.4,t:12,mode:'text'}};
  context.bookCloudWriteOutbox(user,{version:1,uploads:{},removes:{},positions:{[hash]:place}});
  context.sb.rpc=async()=>{
    await context.forgetBookCloud(book);
    const box=context.bookCloudReadOutbox(user);
    box.positions[other]={base:null,revision:'keep-me',locator:{p:0.1,t:1,mode:'text'}};
    context.bookCloudWriteOutbox(user,box);
    return {data:null,error:{message:'timeout'}};
  };
  await context.syncBookCloud();
  const box=context.bookCloudReadOutbox(user);
  assert.equal(box.positions[hash],undefined);
  assert.equal(box.removes[hash],undefined);
  assert.equal(box.positions[other].revision,'keep-me');
});

test('relinking a deleted book still publishes the place saved on this device',async()=>{
  const {context}=boot({flag:true});
  const sent=[];
  context.sb.rpc=async(name,args)=>{sent.push(args);return {data:{ok:true,revision:args.next_revision,locator:args.locator}};};
  context.bookCloudPost=async op=>op==='reserve'?{ok:true,ready:true}:{ok:true};
  context.originalGetForBook=async()=>({blob:new Blob([new Uint8Array([1,2,3])])});
  context.rawFileHash=async()=>hash;
  context.sb.from=()=>({select:async()=>({data:[{book_id:hash,title:'Sample',author:'',kind:'epub',status:'deleted',tombstone:'old',byte_size:0}]})});
  const id='file-'+hash.slice(0,32);
  const book={id,kind:'epub',title:'Sample',sourceHash:hash,original:{hash},bookCloudLink:{on:false,tombstone:''}};
  context.books=[book];
  context.positions[id]={p:0.27,t:1000,mode:'text'};
  await context.bookCloudSetLink(book,true);
  assert.equal(sent.length,1);
  assert.equal(sent[0].book_id,hash);
  assert.equal(sent[0].locator.p,0.27);
});

function readyCloud(bytes){
  return {book_id:hash,title:'Sample',author:'Author',kind:'epub',status:'ready',tombstone:'',byte_size:bytes.byteLength};
}
function armCloud(context,{type='wifi',quota=20*1024*1024*1024,usage=0,bytes=new Uint8Array([1,2,3,4,5]),saveData=false,effectiveType='4g'}={}){
  context.indexedDB={};
  context.navigator.connection={type,saveData,effectiveType,addEventListener(){}};
  context.navigator.storage={estimate:async()=>({quota,usage}),getDirectory:async()=>{throw new Error('private');}};
  context.bookCloudCatalog=[readyCloud(bytes)];
  context.sb.from=table=>({select:async()=>table==='book_cloud'?{data:[readyCloud(bytes)]}:{data:[]}});
  const calls=[];
  context.bookCloudPost=async op=>{calls.push(op);return op==='download'?{ok:true,url:'https://signed.example/get'}:{ok:true};};
  context.fetch=async(url,init)=>{calls.push(init&&init.headers||{});return {ok:true,status:200,arrayBuffer:async()=>bytes.slice().buffer};};
  context.rawFileHash=async()=>hash;
  context.prepareImportedFile=async()=>({id:'saved-book',title:'Sample',kind:'epub',hash});
  context.applyPreparedBook=async book=>{context.applied=book;};
  context.openBook=async book=>{context.opened=book;};
  context.books=[];
  return calls;
}

test('a ready book downloads in the background without opening it',async()=>{
  const {context}=boot({flag:true});
  const calls=armCloud(context);
  assert.equal(await context.bookCloudPullReady(),true);
  assert.equal(calls.includes('download'),true);
  assert.equal(context.opened,undefined);
  assert.equal(context.applied.bookCloudLink.on,true);
  assert.equal(context.bookCloudLibraryRows().length,0);
});

test('sync returns before a background download finishes',async()=>{
  const {context}=boot({flag:true});
  armCloud(context);
  let release=()=>{};
  const gate=new Promise(resolve=>{release=resolve;});
  context.fetch=()=>gate.then(()=>({ok:true,status:200,arrayBuffer:async()=>new Uint8Array([1,2,3,4,5]).buffer}));
  const raced=await Promise.race([
    context.syncBookCloud().then(()=>'sync'),
    new Promise(resolve=>setTimeout(()=>resolve('blocked'),100))
  ]);
  assert.equal(raced,'sync');
  release();
  await context.bookCloudPullReady();
  assert.equal(context.applied.bookCloudLink.on,true);
});

test('cellular, data saver, a tight quota, and a missing connection still download',async()=>{
  for(const connection of [{type:'cellular'},{type:'wifi',saveData:true},{type:'',effectiveType:'2g'},{quota:1024*1024},{quota:9*1024*1024*1024}]){
    const {context}=boot({flag:true});
    const calls=armCloud(context,connection);
    await context.bookCloudPullReady();
    assert.equal(calls.includes('download'),true,JSON.stringify(connection));
    assert.equal(context.opened,undefined);
    assert.equal(context.bookCloudLibraryRows().length,0);
    assert.equal(context.bookCloudManual.size,0);
  }
  const native=boot({flag:true});
  const calls=armCloud(native.context,{type:'cellular'});
  native.context.window.Capacitor={Plugins:{Network:{getStatus:async()=>({connectionType:'cellular'})}}};
  await native.context.bookCloudPullReady();
  assert.equal(calls.includes('download'),true);
  const missing=boot({flag:true});
  armCloud(missing.context);
  delete missing.context.navigator.connection;
  delete missing.context.navigator.storage;
  await missing.context.bookCloudPullReady();
  assert.equal(missing.context.applied.bookCloudLink.on,true);
});

test('a storage failure keeps the card and stays quiet',async()=>{
  const faults=[
    ()=>{const error=new Error('quota');error.name='QuotaExceededError';return error;},
    ()=>{const error=new Error('Error preparing Blob/File data to be stored in object store');error.name='UnknownError';return error;}
  ];
  for(const make of faults){
    const {context,toasts}=boot({flag:true});
    const errors=[];
    context.console.error=(...args)=>errors.push(args.join(' '));
    const calls=armCloud(context,{type:'cellular',quota:1024*1024});
    const kept=[];
    context.bookCloudWritePart=async(key,bytes)=>kept.push(bytes.byteLength);
    context.applyPreparedBook=async()=>{throw make();};
    assert.equal(await context.bookCloudPullReady(),true);
    assert.equal(calls.includes('download'),true);
    assert.equal(context.books.length,0);
    assert.equal(context.bookCloudLibraryRows().length,1);
    assert.equal(context.opened,undefined);
    assert.equal(toasts.length,0);
    assert.equal(errors.length,0);
    assert.equal(kept[0],5);
    assert.equal(context.bookCloudManual.has(hash),true);
    activityDocument(context,[]);
    context.el=(tag,cls)=>{const node=context.document.createElement(tag);node.className=cls||'';return node;};
    context.fillCard=(host,map)=>{for(const [sel,text] of Object.entries(map))host.querySelector(sel).textContent=text;};
    const failed=context.bookCloudCard({bookId:hash,title:'데미안',author:'헤르만 헤세'});
    assert.equal(String(failed.className).includes('editorial-cover'),true);
    assert.equal(failed.querySelector('.getbtn').hidden,false);
    assert.equal(failed.querySelector('.getbtn').textContent,'받아서 이어 읽기');
    const pending=context.bookCloudCard({bookId:'b'.repeat(64),title:'다른 책',author:'작가'});
    assert.equal(pending.querySelector('.getbtn').hidden,true);
    await context.bookCloudDownload({bookId:hash,title:'Sample',kind:'epub',size:5});
    assert.equal(context.opened,undefined);
    assert.equal(toasts.length,0);
    assert.equal(context.bookCloudLibraryRows().length,1);
  }
});

test('opening the card downloads and opens the book',async()=>{
  const {context,toasts}=boot({flag:true});
  const calls=armCloud(context,{type:'cellular',quota:1024*1024});
  await context.bookCloudDownload({bookId:hash,title:'Sample',kind:'epub',size:5});
  assert.equal(calls.includes('download'),true);
  assert.equal(context.opened&&context.opened.id,'saved-book');
  assert.equal(toasts.length,0);
});

test('a partial download resumes with Range on any link',async()=>{
  const {context}=boot({flag:true});
  const calls=armCloud(context,{type:'cellular'});
  const part=new Uint8Array([1,2]);
  const stored=[];
  context.bookCloudReadPart=async()=>part;
  context.bookCloudWritePart=async(key,bytes)=>{stored.push(bytes.byteLength);};
  context.bookCloudDropPart=async()=>{};
  let reads=0;
  context.fetch=async(url,init)=>{
    calls.push(init&&init.headers||{});
    return {ok:true,status:206,headers:{get:name=>name.toLowerCase()==='content-range'?'bytes 2-4/5':''},body:{getReader(){return {async read(){reads++;if(reads===1)return {done:false,value:new Uint8Array([3])};if(reads===2){context.navigator.connection.type='none';return {done:false,value:new Uint8Array([4,5])};}return {done:true};}}}}};
  };
  await context.bookCloudPullReady();
  assert.equal(calls.some(call=>call&&call.Range==='bytes=2-'),true);
  assert.equal(context.applied.bookCloudLink.on,true);
  assert.equal(context.opened,undefined);
  assert.equal(stored.length,0);
});

test('linking a book publishes its saved place on the file hash',async()=>{
  const places={
    pdf:{p:0.42,t:1000,mode:'original',original:{kind:'pdf',page:12,y:0.35}},
    epub:{p:0.27,t:1000,mode:'original',original:{kind:'epub',href:'ch3.xhtml',spine:3,element:4,char:12}},
    txt:{p:0.61,t:1000,mode:'text',pi:18,dy:4,y:900}
  };
  for(const [kind,place] of Object.entries(places)){
    const {context}=boot({flag:true});
    const sent=[];
    context.sb.rpc=async(name,args)=>{sent.push({name,args});return {data:{ok:true,device_id:args.device_id,locator:args.locator}};};
    context.bookCloudPost=async op=>op==='reserve'?{ok:true,ready:true}:{ok:true};
    const id='file-'+hash.slice(0,32);
    const book={id,kind,title:'Sample',sourceHash:hash,original:{hash},bookCloudLink:{on:false,tombstone:''}};
    context.books=[book];
    context.positions[id]=place;
    await context.bookCloudSetLink(book,true);
    assert.equal(sent.length,1,kind);
    assert.equal(sent[0].name,'breeze_put_device_book_position');
    assert.equal(sent[0].args.device_id,'device-a');
    assert.equal(sent[0].args.book_id,hash);
    assert.equal(sent[0].args.book_id===id,false);
    assert.equal(sent[0].args.locator.mode,place.mode);
    assert.equal(sent[0].args.locator.p,place.p);
    if(place.original)assert.equal(sent[0].args.locator.original.kind,kind);
    else assert.equal(sent[0].args.locator.pi,18);
  }
});

test('an already linked book publishes its place without another scroll',async()=>{
  const {context}=boot({flag:true});
  const sent=[];
  context.sb.rpc=async(name,args)=>{sent.push(args);return {data:{ok:true,device_id:args.device_id,locator:args.locator}};};
  const id='file-'+hash.slice(0,32);
  context.books=[{id,kind:'epub',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}}];
  context.positions[id]={p:0.27,t:1000,mode:'original',original:{kind:'epub',spine:3,element:4,char:12}};
  await context.syncBookCloud();
  assert.equal(sent.length,1);
  assert.equal(sent[0].book_id,hash);
  assert.equal(sent[0].locator.original.spine,3);
  await context.syncBookCloud();
  assert.equal(sent.length,1);
});

test('a newer device place replaces an older local place, and an older remote place does not',async()=>{
  const places={
    pdf:{p:0.42,t:1000,mode:'original',original:{kind:'pdf',page:12,y:0.35}},
    epub:{p:0.27,t:1000,mode:'original',original:{kind:'epub',href:'ch3.xhtml',spine:3,element:4,char:12}},
    txt:{p:0.61,t:1000,mode:'text',pi:18,dy:4,y:900}
  };
  for(const [kind,place] of Object.entries(places)){
    const {context}=boot({flag:true});
    const id='file-'+hash.slice(0,32);
    context.books=[{id,kind,sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}}];
    context.positions[id]={p:0,t:1,mode:kind==='txt'?'text':'original'};
    context.sb.from=table=>({select:async()=>table==='book_device_positions'?{data:[{book_id:hash,device_id:'other',locator:place,read_at:place.t}]}:{data:[{book_id:hash,title:'Sample',kind,status:'ready',byte_size:5}]}});
    await context.syncBookCloud();
    assert.equal(context.positions[id].p,place.p,kind);
    assert.equal(context.positions[hash],undefined,kind);
    if(place.original){
      assert.equal(context.positions[id].original.kind,kind);
      assert.equal(context.positions[id].original.page||context.positions[id].original.spine,place.original.page||place.original.spine);
    }else assert.equal(context.positions[id].pi,18);
    context.positions[id]={...place,t:place.t+50,p:0.8};
    await context.bookCloudRefresh(context.bookCloudSession());
    assert.equal(context.positions[id].p,0.8,kind);
  }
});

test('the saved place is local before the reader opens',async()=>{
  const places={
    pdf:{p:0.42,t:1000,mode:'original',original:{kind:'pdf',page:12,y:0.35}},
    epub:{p:0.27,t:1000,mode:'original',original:{kind:'epub',href:'ch3.xhtml',spine:3,element:4,char:12}},
    txt:{p:0.61,t:1000,mode:'text',pi:18,dy:4,y:900}
  };
  for(const [kind,place] of Object.entries(places)){
    const {context}=boot({flag:true});
    const id='file-'+hash.slice(0,32);
    const book={id,kind,sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
    context.books=[book];
    context.curBook=book;
    let moved=0;
    context.switchReaderMode=()=>{moved++;};
    context.restoreAnchor=()=>{moved++;return true;};
    context.readerScrollTo=()=>{moved++;};
    let selects=0;
    context.positions[id]=place;
    context.sb.from=()=>({select:async()=>{selects++;return {data:[]};}});
    await context.bookCloudPositionBeforeOpen(book);
    assert.equal(selects,1,kind+' already stored');
    assert.equal(context.positions[id].p,place.p,kind+' already stored');
    assert.equal(context.positions[id].t,place.t,kind+' opening does not bump the stamp');
    assert.equal(moved,0,kind);
    context.positions[id]={p:0,t:1,mode:kind==='txt'?'text':'original'};
    context.bookCloudRememberDevice(hash,'other',place,place.t);
    await context.bookCloudPositionBeforeOpen(book);
    assert.equal(selects,2,kind+' remembered');
    assert.equal(context.positions[id].p,place.p,kind);
    assert.equal(context.positions[id].t,place.t,kind+' a copied place keeps its stamp');
    assert.equal(moved,0,kind);
    if(place.original)assert.equal(context.positions[id].original.page||context.positions[id].original.spine,place.original.page||place.original.spine);
    else assert.equal(context.positions[id].pi,18);
  }
});

test('a late newer position jumps only when the reader has not moved',async()=>{
  const places={
    pdf:{p:0.42,t:1000,mode:'original',original:{kind:'pdf',page:12,y:0.35}},
    epub:{p:0.27,t:1000,mode:'original',original:{kind:'epub',href:'ch3.xhtml',spine:3,element:4,char:12}},
    txt:{p:0.61,t:1000,mode:'text',pi:18,dy:4,y:900}
  };
  const settle=async()=>{for(let step=0;step<8;step++)await new Promise(resolve=>setImmediate(resolve));};
  await Promise.all(Object.entries(places).map(async([kind,place])=>{
    const row={data:[{book_id:hash,device_id:'other',locator:place,read_at:place.t}]};
    const open=released=>{
      const {context}=boot({flag:true});
      const id='file-'+hash.slice(0,32);
      const book={id,kind,sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
      context.books=[book];
      context.curBook=null;
      context.positions[id]={p:0,t:1,mode:kind==='txt'?'text':'original'};
      let moved=0;
      context.switchReaderMode=()=>{moved++;};
      context.restoreAnchor=()=>{moved++;return true;};
      context.readerScrollTo=()=>{moved++;};
      context.savedPlaceReleased=()=>released;
      let release;
      const pending=new Promise(resolve=>{release=()=>resolve(row);});
      context.sb.from=table=>({select:()=>table==='book_device_positions'?pending:Promise.resolve({data:[]})});
      return {context,id,book,pending,release,moved:()=>moved};
    };
    const fresh=open(false);
    const started=Date.now();
    await fresh.context.bookCloudPositionBeforeOpen(fresh.book);
    assert.ok(Date.now()-started<100,kind+' open waits');
    assert.equal(fresh.context.positions[fresh.id].p,0,kind+' open');
    assert.equal(fresh.moved(),0,kind+' open');
    fresh.context.curBook=fresh.book;
    fresh.release();
    await fresh.pending;
    await settle();
    assert.equal(fresh.context.positions[fresh.id].p,place.p,kind+' late jump');
    assert.equal(fresh.context.positions[fresh.id].t,place.t,kind+' late jump keeps the stamp');
    assert.equal(fresh.moved(),1,kind+' late jump');
    const held=open(true);
    await held.context.bookCloudPositionBeforeOpen(held.book);
    held.context.curBook=held.book;
    held.release();
    await held.pending;
    await settle();
    assert.equal(held.moved(),0,kind+' already reading');
    assert.equal(held.context.positions[held.id].p,0,kind+' already reading');
    assert.equal(held.context.bookCloudLatestRemote(hash).locator.p,place.p,kind+' cached');
    held.context.savedPlaceReleased=()=>false;
    await held.context.bookCloudPositionBeforeOpen(held.book);
    assert.equal(held.context.positions[held.id].p,place.p,kind+' next open');
    assert.equal(held.moved(),0,kind+' next open does not scroll');
  }));
});

test('each account keeps its own outbox',()=>{
  const {context}=boot({flag:true});
  context.bookCloudWriteOutbox(user,{version:1,uploads:{[hash]:{kind:'epub'}},positions:{},removes:{}});
  context.sbUser={id:'22222222-2222-2222-2222-222222222222'};
  const other=context.bookCloudReadOutbox(context.sbUser.id);
  assert.equal(JSON.stringify(other.uploads),'{}');
  assert.ok(context.bookCloudReadOutbox(user).uploads[hash]);
});

function activityDocument(context,cards){
  const element=tag=>{
    const node={
      tag,className:'',children:[],
      attrs:new Map(),
      dataset:{},
      style:{
        values:new Map(),
        setProperty(name,value){this.values.set(name,String(value));},
        getPropertyValue(name){return this.values.get(name)||'';}
      },
      setAttribute(name,value){this.attrs.set(name,String(value));},
      getAttribute(name){return this.attrs.has(name)?this.attrs.get(name):null;},
      removeAttribute(name){this.attrs.delete(name);},
      appendChild(child){this.children.push(child);return child;},
      remove(){for(const card of cards){const index=card.children.indexOf(node);if(index>=0)card.children.splice(index,1);}}
    };
    Object.defineProperty(node,'textContent',{get(){return this._text||'';},set(value){this._text=String(value);}});
    Object.defineProperty(node,'innerHTML',{set(value){
      node.children=[];
      const html=String(value);
      if(html.includes('card-activity-label')){
        const label=element('span');
        label.className='card-activity-label';
        node.children.push(label);
      }
      if(html.includes('class="getbtn"')){
        for(const name of ['author','bt','getbtn']){
          const child=element(name==='getbtn'?'button':'div');
          child.className=name;
          node.children.push(child);
        }
      }
    }});
    const classes=new Set(String(node.className||'').split(/\s+/).filter(Boolean));
    node.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};
    node.querySelector=sel=>{
      const want=sel.includes('card-activity-label')?'card-activity-label':sel.includes('card-activity')?'card-activity':sel.startsWith('.')?sel.slice(1):sel;
      const walk=nodes=>{
        for(const child of nodes){
          if(String(child.className).split(/\s+/).includes(want))return child;
          const found=walk(child.children||[]);
          if(found)return found;
        }
        return null;
      };
      return walk(node.children);
    };
    return node;
  };
  for(const card of cards){
    card.children=[];
    card.dataset=card.dataset||{};
    const classes=new Set(String(card.className||'').split(/\s+/).filter(Boolean));
    card.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};
    card.appendChild=child=>{card.children.push(child);return child;};
    card.querySelector=sel=>{
      if(String(sel).includes('card-activity-label'))return null;
      if(String(sel).includes('card-activity'))return card.children.find(child=>String(child.className).split(/\s+/).includes('card-activity'))||null;
      const want=sel.startsWith('.')?sel.slice(1):sel;
      return card.children.find(child=>String(child.className).split(/\s+/).includes(want))||null;
    };
  }
  context.document={
    createElement:tag=>element(tag),
    querySelectorAll:sel=>sel==='.bookcard.cloud[data-book-cloud]'?cards:[],
    querySelector:()=>null,
    getElementById:()=>null
  };
  return element;
}

test('card activity stays off and does not schedule a frame unless a variant is chosen',()=>{
  const {context}=boot({flag:true});
  let frames=0;
  context.requestAnimationFrame=()=>{frames++;return 1;};
  context.bookCloudNoteActivity(hash,42000000,100000000);
  assert.equal(context.bookCloudActivityVariant(),'');
  assert.equal(frames,0);
  assert.equal(context.bookCloudActivity.size,0);
});

test('one frame paints the chosen variant and a recreated card keeps it',async()=>{
  const {context}=boot({flag:true});
  const card={className:'bookcard cloud',dataset:{bookCloud:hash}};
  const cards=[card];
  activityDocument(context,cards);
  let frame=null;
  context.requestAnimationFrame=fn=>{assert.equal(frame,null);frame=fn;return 1;};
  context.window.BREEZE_CARD_ACTIVITY='ring';
  context.bookCloudNoteActivity(hash,42000000,100000000);
  assert.equal(frame,null);
  context.window.BREEZE_CARD_ACTIVITY='fill';
  context.bookCloudNoteActivity(hash,42000000,100000000);
  context.bookCloudNoteActivity(hash,42000000,100000000);
  assert.equal(typeof frame,'function');
  frame();
  frame=null;
  const node=card.querySelector(':scope > .card-activity');
  assert.ok(node);
  assert.equal(card.classList.contains('is-receiving'),true);
  assert.equal(card.dataset.activity,'fill');
  assert.equal(node.dataset.variant,'fill');
  assert.equal(node.style.getPropertyValue('--p'),'0.42');
  assert.equal(node.getAttribute('aria-label'),'받는 중');
  assert.equal(node.getAttribute('aria-valuenow'),'42');
  assert.equal(node.querySelector('.card-activity-label').textContent,'받는 중');
  assert.equal(node.querySelector('.card-activity-label').textContent.includes('%'),false);
  context.bookCloudNoteActivity(hash,10,0);
  frame();
  frame=null;
  assert.equal(node.getAttribute('aria-label'),'받는 중');
  assert.equal(node.getAttribute('data-unknown'),'1');
  assert.equal(node.style.getPropertyValue('--p'),'0');
  context.el=(tag,cls)=>{const node=context.document.createElement(tag);node.className=cls||'';return node;};
  context.fillCard=(host,map)=>{for(const [sel,text] of Object.entries(map)){const child=host.querySelector(sel);child.textContent=text;}};
  const rebuilt=context.bookCloudCard({bookId:hash,title:'오디세이아',author:'호메로스'});
  cards.push(rebuilt);
  assert.equal(rebuilt.dataset.bookCloud,hash);
  await new Promise(resolve=>queueMicrotask(resolve));
  const again=rebuilt.querySelector('.card-activity');
  assert.equal(again.querySelector('.card-activity-label').textContent,'받는 중');
  context.bookCloudClearActivity(hash);
  assert.equal(rebuilt.querySelector('.card-activity'),null);
  assert.equal(rebuilt.classList.contains('is-receiving'),false);
  assert.equal(context.bookCloudActivity.size,0);
});

test('download progress is reported without checkpointing more often than 1 MiB',async()=>{
  const {context}=boot({flag:true});
  const chunks=[new Uint8Array(600000),new Uint8Array(600000)];
  let index=0;
  const response={body:{getReader:()=>({read:async()=>index<chunks.length?{done:false,value:chunks[index++]}:{done:true}})}};
  const marks=[];
  const checks=[];
  const bytes=await context.bookCloudReadBody(response,new Uint8Array(100),async merged=>{checks.push(merged.byteLength);return true;},total=>marks.push(total));
  assert.deepEqual(marks,[600100,1200100]);
  assert.deepEqual(checks,[1200100]);
  assert.equal(bytes.byteLength,1200100);
});

test('after the reader moves, a newer remote page does not take the open book',async()=>{
  const {context}=boot({flag:true});
  const id='file-'+hash.slice(0,32);
  const book={id,kind:'pdf',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
  context.books=[book];
  context.curBook=book;
  context.positions[id]={p:0.2,t:2000,mode:'original',original:{kind:'pdf',page:8,y:0.1}};
  let moved=0;
  context.switchReaderMode=()=>{moved++;};
  context.restoreAnchor=()=>{moved++;return true;};
  context.readerScrollTo=()=>{moved++;};
  context.savedPlaceReleased=()=>true;
  const remote={p:0.55,t:9000,mode:'original',original:{kind:'pdf',page:23,y:0.2}};
  context.sb.from=table=>({select:async()=>table==='book_device_positions'
    ?{data:[{book_id:hash,device_id:'tablet',locator:remote,read_at:remote.t}]}
    :{data:[{book_id:hash,title:'Sample',kind:'pdf',status:'ready',byte_size:5}]}});
  await context.bookCloudRefresh(context.bookCloudSession());
  assert.equal(moved,0);
  assert.equal(context.positions[id].original.page,8);
  assert.equal(context.bookCloudLatestRemote(hash).locator.original.page,23);
  context.bookCloudQueuePosition(book);
  const box=context.bookCloudReadOutbox(user);
  assert.equal(box.positions[hash].locator.original.page,8);
});

test('a phone page opens once on the tablet, then newer stamps of that page stay behind',async()=>{
  const {context}=boot({flag:true});
  const id='file-'+hash.slice(0,32);
  const book={id,kind:'pdf',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
  context.books=[book];
  context.curBook=book;
  context.positions[id]={p:0,t:1000,mode:'original',original:{kind:'pdf',page:1,y:0}};
  let moved=0;
  context.switchReaderMode=()=>{moved++;};
  context.restoreAnchor=()=>{moved++;return true;};
  context.readerScrollTo=()=>{moved++;};
  context.savedPlaceReleased=()=>false;
  const phone=stamp=>({p:0.62,t:stamp,mode:'original',original:{kind:'pdf',page:23,y:0.42}});
  let remote=phone(5000);
  context.sb.from=table=>({select:async()=>table==='book_device_positions'
    ?{data:[{book_id:hash,device_id:'phone',locator:remote,read_at:remote.t}]}
    :{data:[]}});
  await context.bookCloudRefresh(context.bookCloudSession());
  assert.equal(moved,1);
  assert.equal(context.positions[id].original.page,23);
  context.savedPlaceReleased=()=>true;
  context.positions[id]={p:0.35,t:6000,mode:'original',original:{kind:'pdf',page:14,y:0.2}};
  remote=phone(9000);
  await context.bookCloudRefresh(context.bookCloudSession());
  remote=phone(15000);
  await context.bookCloudRefresh(context.bookCloudSession());
  assert.equal(moved,1);
  assert.equal(context.positions[id].original.page,14);
  context.bookCloudQueuePosition(book);
  assert.equal(context.bookCloudReadOutbox(user).positions[hash].locator.original.page,14);
  assert.equal(context.bookCloudLatestRemote(hash).locator.original.page,23);
});

test('reading uploads immediately, then at most every 30s, and leaving publishes without waiting',async()=>{
  const preferences=readFileSync(new URL('../scripts/ui/preferences.js',import.meta.url),'utf8');
  const sync=readFileSync(new URL('../scripts/sync/sync.js',import.meta.url),'utf8');
  const scene=readFileSync(new URL('../ios/App/App/SceneDelegate.swift',import.meta.url),'utf8');
  const hidden=sync.slice(sync.lastIndexOf("document.addEventListener('visibilitychange'"));
  assert.match(preferences,/addEventListener\('pagehide', saveReadingState\)/);
  assert.doesNotMatch(preferences,/flushBookCloud/);
  assert.match(hidden,/document\.hidden/);
  assert.doesNotMatch(hidden,/flushBookCloud|syncBookCloud/);
  assert.match(source,/BOOK_CLOUD_POSITION_GAP=30000/);
  assert.match(source,/function bookCloudNativeHold/);
  assert.match(source,/breezePositionSync/);
  assert.match(source,/window\.addEventListener\('pagehide',\(\)=>\{void bookCloudPublishLeave\(\);\}\)/);
  assert.match(source,/if\(document\.hidden\)void bookCloudPublishLeave\(\)/);
  assert.doesNotMatch(source,/bookCloudRevealQuiet|bookCloudHeads|bookCloudPreferRemote|bookCloudAtStart|void syncBookCloud\(\);\},1500\)/);
  assert.match(scene,/beginBackgroundTask\(withName: "breeze\.position-sync"\)/);
  assert.match(scene,/breezePositionSync/);
  assert.match(scene,/func sceneWillResignActive\(_ scene: UIScene\) \{\n\s+\(window\?\.rootViewController as\? BreezeBridgeViewController\)\?\.beginPositionSyncTask\(\)/);
  assert.match(scene,/endPositionSyncTask\(\)/);

  const server={devices:{}};
  const phone=boot({flag:true});
  const tablet=boot({flag:true});
  const id='file-'+hash.slice(0,32);
  const book={id,kind:'pdf',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
  const place=(page,stamp,ratio)=>({p:ratio,t:stamp,mode:'original',original:{kind:'pdf',page,y:ratio}});
  const arm=context=>{
    let now=0,seq=0;
    const pending=[];
    context.setTimeout=(fn,ms)=>{const timer={id:++seq,fn,at:now+Number(ms)};pending.push(timer);return timer.id;};
    context.clearTimeout=timerId=>{const index=pending.findIndex(timer=>timer.id===timerId);if(index>=0)pending.splice(index,1);};
    return {now:()=>now,pending:()=>pending.length,next:()=>pending.length?Math.min(...pending.map(timer=>timer.at-now)):0,async advance(ms){
      now+=ms;
      for(const timer of pending.filter(item=>item.at<=now).sort((a,b)=>a.at-b.at)){
        const index=pending.indexOf(timer);if(index>=0)pending.splice(index,1);timer.fn();
      }
      for(let step=0;step<20;step++)await new Promise(resolve=>setImmediate(resolve));
    }};
  };
  const pageOf=device=>server.devices[hash]&&server.devices[hash][device]&&server.devices[hash][device].original.page;
  const serve=(context,clock)=>{
    context.sb.from=table=>({select:async()=>{
      if(table!=='book_device_positions')return {data:[]};
      return {data:Object.entries(server.devices[hash]||{}).map(([device_id,locator])=>({book_id:hash,device_id,locator,read_at:locator.t}))};
    }});
    context.sb.rpc=async(name,args)=>{
      assert.equal(name,'breeze_put_device_book_position');
      server.devices[args.book_id]||={};
      server.devices[args.book_id][args.device_id]=args.locator;
      server.readyAt=clock.now();
      return {data:{ok:true,device_id:args.device_id,locator:args.locator}};
    };
  };
  const phoneClock=arm(phone.context);
  const tabletClock=arm(tablet.context);
  serve(phone.context,phoneClock);
  serve(tablet.context,tabletClock);
  phone.context.deviceId=()=>'phone';
  tablet.context.deviceId=()=>'tablet';
  const holds=[];
  phone.context.window.webkit={messageHandlers:{breezePositionSync:{postMessage(body){holds.push(body);}}}};
  for(const context of [phone.context,tablet.context]){
    context.books=[book];
    context.curBook=book;
    context.switchReaderMode=()=>{context.moved=(context.moved||0)+1;};
    context.savedPlaceReleased=()=>false;
    context.document.hidden=false;
  }
  phone.context.positions[id]=place(23,5000,0.62);
  phone.context.scheduleBookCloudPosition();
  await phoneClock.advance(0);
  assert.equal(pageOf('phone'),23,'the first place uploads without waiting');
  assert.equal(phoneClock.now(),0);
  assert.equal(phoneClock.pending(),0);
  assert.equal(pageOf('tablet'),undefined);

  phone.context.positions[id]=place(19,12000,0.5);
  phone.context.scheduleBookCloudPosition();
  assert.equal(phoneClock.pending(),1,'a second place while reading waits');
  assert.ok(phoneClock.next()>=25000&&phoneClock.next()<=30000);
  await phoneClock.advance(5000);
  assert.equal(pageOf('phone'),23,'five seconds is inside the 30s gap');
  assert.equal(phoneClock.pending(),1);
  const leaveAt=phoneClock.now();
  await phone.context.bookCloudPublishLeave();
  assert.equal(phoneClock.now(),leaveAt,'leaving publishes without waiting out the gap');
  assert.equal(phoneClock.pending(),0,'leaving cancels the waiting upload');
  assert.equal(pageOf('phone'),19);
  assert.deepEqual(holds.map(item=>item.phase),['begin','end']);

  tablet.context.positions[id]=place(1,1,0);
  tablet.context.curBook=null;
  tablet.context.moved=0;
  await tablet.context.bookCloudRefresh(tablet.context.bookCloudSession());
  tablet.context.positions[id]=place(1,1,0);
  const openAt=tabletClock.now();
  await tablet.context.bookCloudPositionBeforeOpen(book);
  assert.equal(tablet.context.positions[id].original.page,19,'a tablet opens at the newer phone page');
  assert.equal(tablet.context.positions[id].t,12000,'opening keeps the phone stamp');
  assert.equal(tablet.context.moved||0,0,'that copy does not scroll');
  assert.equal(tabletClock.now(),openAt);

  tablet.context.positions[id]=place(14,20000,0.35);
  tablet.context.curBook=book;
  tablet.context.savedPlaceReleased=()=>true;
  tablet.context.document.hidden=false;
  tablet.context.scheduleBookCloudPosition();
  await tabletClock.advance(0);
  assert.equal(pageOf('tablet'),14);
  assert.equal(pageOf('phone'),19,'the tablet upload leaves the phone row');
  tablet.context.positions[id]=place(7,30000,0.22);
  tablet.context.document.hidden=true;
  const hiddenAt=tabletClock.now();
  tablet.context.scheduleBookCloudPosition();
  await tabletClock.advance(0);
  assert.equal(tabletClock.now(),hiddenAt,'a hidden change does not wait out the gap');
  assert.equal(tabletClock.pending(),0);
  assert.equal(pageOf('tablet'),7);
  assert.equal(pageOf('phone'),19);

  phone.context.curBook=null;
  phone.context.moved=0;
  phone.context.savedPlaceReleased=()=>false;
  phone.context.positions[id]=place(19,12000,0.5);
  const returnAt=phoneClock.now();
  await phone.context.bookCloudRefresh(phone.context.bookCloudSession());
  phone.context.positions[id]=place(19,12000,0.5);
  await phone.context.bookCloudPositionBeforeOpen(book);
  assert.equal(phone.context.positions[id].original.page,7,'the return open uses the newer tablet page');
  assert.equal(phone.context.moved,0,'that copy does not scroll');
  assert.equal(phoneClock.now(),returnAt);

  phone.context.curBook=book;
  phone.context.savedPlaceReleased=()=>true;
  phone.context.document.hidden=true;
  phone.context.positions[id]=place(2,1000,0.05);
  phone.context.scheduleBookCloudPosition();
  await phoneClock.advance(0);
  assert.equal(pageOf('phone'),2,'a stale phone upload writes only the phone row');
  assert.equal(pageOf('tablet'),7,'a stale phone upload leaves the tablet page');
});

test('before the reader moves, a newer remote page is still applied once',async()=>{
  const {context}=boot({flag:true});
  const id='file-'+hash.slice(0,32);
  const book={id,kind:'pdf',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
  context.books=[book];
  context.curBook=book;
  context.positions[id]={p:0.2,t:2000,mode:'original',original:{kind:'pdf',page:8,y:0.1}};
  let moved=0;
  context.switchReaderMode=()=>{moved++;};
  context.savedPlaceReleased=()=>false;
  const remote={p:0.55,t:9000,mode:'original',original:{kind:'pdf',page:23,y:0.2}};
  context.sb.from=table=>({select:async()=>table==='book_device_positions'
    ?{data:[{book_id:hash,device_id:'tablet',locator:remote,read_at:remote.t}]}
    :{data:[]}});
  await context.bookCloudRefresh(context.bookCloudSession());
  assert.equal(moved,1);
  assert.equal(context.positions[id].original.page,23);
  assert.equal(context.positions[id].t,9000);
});
