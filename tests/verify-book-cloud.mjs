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
    context.sb.rpc=async(name,args)=>{sent.push({name,args});return {data:{ok:true,revision:args.next_revision,locator:args.locator}};};
    context.bookCloudPost=async op=>op==='reserve'?{ok:true,ready:true}:{ok:true};
    const id='file-'+hash.slice(0,32);
    const book={id,kind,title:'Sample',sourceHash:hash,original:{hash},bookCloudLink:{on:false,tombstone:''}};
    context.books=[book];
    context.positions[id]=place;
    await context.bookCloudSetLink(book,true);
    assert.equal(sent.length,1,kind);
    assert.equal(sent[0].name,'breeze_put_book_position');
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
  context.sb.rpc=async(name,args)=>{sent.push(args);return {data:{ok:true,revision:args.next_revision,locator:args.locator}};};
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

test('a downloaded book restores the remote place and a local start does not replace it',async()=>{
  const places={
    pdf:{p:0.42,t:1000,mode:'original',original:{kind:'pdf',page:12,y:0.35}},
    epub:{p:0.27,t:1000,mode:'original',original:{kind:'epub',href:'ch3.xhtml',spine:3,element:4,char:12}},
    txt:{p:0.61,t:1000,mode:'text',pi:18,dy:4,y:900}
  };
  for(const [kind,place] of Object.entries(places)){
    const {context}=boot({flag:true});
    const id='file-'+hash.slice(0,32);
    context.books=[{id,kind,sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}}];
    context.positions[id]={p:0,t:Date.now(),mode:kind==='txt'?'text':'original'};
    context.sb.from=table=>({select:async()=>table==='positions'?{data:[{book_id:hash,data:{revision:'rev-1',locator:place}}]}:{data:[{book_id:hash,title:'Sample',kind,status:'ready',byte_size:5}]}});
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
    assert.equal(selects,0,kind+' already stored');
    assert.equal(moved,0,kind);
    context.positions[id]={p:0,t:1,mode:kind==='txt'?'text':'original'};
    context.bookCloudHeads[hash]={revision:'rev-1',locator:place};
    await context.bookCloudPositionBeforeOpen(book);
    assert.equal(selects,0,kind+' remembered');
    assert.equal(context.positions[id].p,place.p,kind);
    assert.equal(moved,0,kind);
    context.positions[id]={p:0,t:1,mode:kind==='txt'?'text':'original'};
    context.bookCloudHeads={};
    context.sb.from=table=>({select:async()=>{
      selects++;
      return table==='positions'?{data:[{book_id:hash,data:{revision:'rev-1',locator:place}}]}:{data:[]};
    }});
    await context.bookCloudPositionBeforeOpen(book);
    assert.equal(context.positions[id].p,place.p,kind+' fetched');
    assert.equal(moved,0,kind+' fetched');
    if(place.original)assert.equal(context.positions[id].original.page||context.positions[id].original.spine,place.original.page||place.original.spine);
    else assert.equal(context.positions[id].pi,18);
  }
});

test('a slow position read opens at the local place and does not jump later',async()=>{
  const places={
    pdf:{p:0.42,t:1000,mode:'original',original:{kind:'pdf',page:12,y:0.35}},
    epub:{p:0.27,t:1000,mode:'original',original:{kind:'epub',href:'ch3.xhtml',spine:3,element:4,char:12}},
    txt:{p:0.61,t:1000,mode:'text',pi:18,dy:4,y:900}
  };
  await Promise.all(Object.entries(places).map(async([kind,place])=>{
    const {context}=boot({flag:true});
    const id='file-'+hash.slice(0,32);
    const book={id,kind,sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
    context.books=[book];
    context.curBook=book;
    context.positions[id]={p:0,t:1,mode:kind==='txt'?'text':'original'};
    let moved=0;
    context.switchReaderMode=()=>{moved++;};
    context.restoreAnchor=()=>{moved++;return false;};
    context.readerScrollTo=()=>{moved++;};
    let release;
    const pending=new Promise(resolve=>{release=resolve;});
    context.sb.from=table=>({select:()=>table==='positions'?pending:Promise.resolve({data:[]})});
    const started=Date.now();
    await context.bookCloudPositionBeforeOpen(book);
    const elapsed=Date.now()-started;
    assert.ok(elapsed>=300&&elapsed<1000,kind+' '+elapsed);
    assert.equal(context.positions[id].p,0,kind);
    assert.equal(moved,0,kind);
    release({data:[{book_id:hash,data:{revision:'rev-1',locator:place}}]});
    await pending;
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(moved,0,kind+' late');
    assert.equal(context.positions[id].p,0,kind+' late');
    assert.equal(context.bookCloudHeads[hash].locator.p,place.p,kind+' late');
    context.bookCloudRevealQuiet=null;
    context.positions[id]={p:0,t:1,mode:kind==='txt'?'text':'original'};
    await context.bookCloudPositionBeforeOpen(book);
    assert.equal(context.positions[id].p,place.p,kind+' next open');
    assert.equal(moved,0,kind+' next open');
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
  context.sb.from=table=>({select:async()=>table==='positions'
    ?{data:[{book_id:hash,data:{revision:'rev-9',locator:remote}}]}
    :{data:[{book_id:hash,title:'Sample',kind:'pdf',status:'ready',byte_size:5}]}});
  await context.bookCloudRefresh(context.bookCloudSession());
  assert.equal(moved,0);
  assert.equal(context.positions[id].original.page,8);
  assert.equal(context.bookCloudHeads[hash].locator.original.page,23);
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
  context.sb.from=table=>({select:async()=>table==='positions'
    ?{data:[{book_id:hash,data:{revision:'rev-phone',locator:remote}}]}
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
  assert.equal(context.bookCloudHeads[hash].locator.original.page,23);
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
  context.sb.from=table=>({select:async()=>table==='positions'
    ?{data:[{book_id:hash,data:{revision:'rev-9',locator:remote}}]}
    :{data:[]}});
  await context.bookCloudRefresh(context.bookCloudSession());
  assert.equal(moved,1);
  assert.equal(context.positions[id].original.page,23);
});
