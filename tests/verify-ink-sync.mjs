import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=readFileSync(new URL('../scripts/library/ink-sync.js',import.meta.url),'utf8');
const sha='ab'.repeat(32);
const other='cd'.repeat(32);
const userA='11111111-1111-1111-1111-111111111111';
const userB='22222222-2222-2222-2222-222222222222';
const idA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const idC='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function stroke(id,x=1){return {id,color:'#111111',width:1.5,points:[[x,1],[x,2]]};}
function highlight(id,group){return {id,tool:'highlighter',strokeId:group,color:'#ffe34d',width:12,opacity:0.3,points:[[1,1],[4,4]]};}

function boot({flag=true,online=true,user=userA}={}){
  const calls=[];
  const timers=new Map();
  let now=0,timerId=0,epoch=1,failPut=false;
  const rows=new Map();
  const db={
    objectStoreNames:{contains:name=>rows.has('store:'+name)},
    createObjectStore(name){rows.set('store:'+name,true);},
    close(){},
    transaction(){
      const tx={error:null};
      const store={
        get(key){const request={result:rows.has(key)?rows.get(key):undefined};queueMicrotask(()=>tx.oncomplete?.());return request;},
        put(value,key){
          if(failPut){const error=new Error('quota');error.name='QuotaExceededError';queueMicrotask(()=>{tx.error=error;tx.onabort?.();tx.onerror?.();});return {};}
          rows.set(key,JSON.parse(JSON.stringify(value)));
          queueMicrotask(()=>tx.oncomplete?.());
          return {};
        },
        delete(key){rows.delete(key);},
        getAllKeys(){
          const request={result:[...rows.keys()].filter(key=>!String(key).startsWith('store:'))};
          queueMicrotask(()=>{request.onsuccess?.();tx.oncomplete?.();});
          return request;
        }
      };
      return Object.assign(tx,{objectStore:()=>store});
    }
  };
  const context={
    window:{BREEZE_CONFIG:{INK_SYNC:flag,BOOK_CLOUD:true},addEventListener(){}},
    console:{error(){},log(...args){console.log(...args);}},navigator:{onLine:online},crypto:webcrypto,
    books:[],sbUser:{id:user},epoch,
    bookCloudHash:book=>book&&book.sourceHash||'',
    bookCloudUserId(){return context.sbUser&&context.sbUser.id||'';},
    bookCloudSession(){return {epoch:context.epoch,userId:context.bookCloudUserId()};},
    bookCloudCurrent(session){return !!(session&&session.userId===context.bookCloudUserId()&&session.epoch===context.epoch);},
    sb:{
      from(){
        const limit=async()=>({data:[],error:null});
        const eq=()=>({eq,limit});
        return {select:()=>({eq})};
      },
      async rpc(name,args){
        calls.push({name,args});
        return {data:{ok:true,applied:(args.ops||[]).map(op=>op.id)}};
      }
    },
    indexedDB:{open(){
      const request={result:db};
      queueMicrotask(()=>{
        if(!db.objectStoreNames.contains('pages'))request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }},
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,at:now+ms});return id;},
    clearTimeout(id){timers.delete(id);},
    queueMicrotask,JSON,Math,Date,Object,Array,Map,Set,Number,String,Promise,Error
  };
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'scripts/library/ink-sync.js'});
  context.registerBookInkPage({
    page:key=>context.pages.get(key)||null,
    pages:()=>[...context.pages.values()],
    busy:state=>!!state.busy,
    accept:stroke=>!!(stroke&&Array.isArray(stroke.points)&&stroke.points.length),
    persist(state){state.persisted=(state.persisted||0)+1;},
    held(state){
      if(!state.inkHeld||state.busy)return false;
      state.strokes=state.inkHeld;state.inkHeld=null;state.applied=(state.applied||0)+1;return true;
    }
  });
  context.pages=new Map();
  return {
    context,calls,rows,
    failPut(value){failPut=value;},
    flush(ms){
      now+=ms;
      for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}
    },
    pending:()=>timers.size
  };
}

test('the flag stops scheduling, fetching, and storage',async()=>{
  const {context,calls,rows,flush}=boot({flag:false});
  const state={key:JSON.stringify([sha,1]),strokes:[stroke(idA)],svg:{}};
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  context.scheduleBookInk(state);
  flush(10000);
  assert.equal(await context.pullBookInk(state),false);
  await context.forgetBookInk(sha);
  assert.equal(calls.length,0);
  assert.equal(rows.size,0);
  context.window.BREEZE_CONFIG={BOOK_CLOUD:true};
  context.scheduleBookInk(state);
  flush(10000);
  assert.equal(calls.length,0);
});

test('legacy strokes gain one stable id and duplicate ids split',()=>{
  const {context}=boot();
  let n=0;
  const uuid=()=>['dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'][n++];
  const first=context.inkWithIds([{color:'#111111',width:1.5,points:[[1,1]]},{id:idA,color:'#111111',width:1.5,points:[[2,2]]},{id:idA,color:'#111111',width:1.5,points:[[3,3]]}],uuid);
  assert.equal(first.changed,true);
  assert.equal(first.strokes[0].id,'dddddddd-dddd-4ddd-8ddd-ddddddddddd1');
  assert.equal(first.strokes[1].id,idA);
  assert.notEqual(first.strokes[2].id,idA);
  const again=context.inkWithIds(first.strokes,()=>{throw new Error('stable ids must not be reassigned');});
  assert.equal(again.changed,false);
});

test('two devices that already have ink union by stroke id',()=>{
  const {context}=boot();
  const left=context.inkAdvance([stroke(idA,1),highlight(idB,'group-1')],null);
  const right=context.inkAdvance([stroke(idC,9)],null);
  const seenLeft=context.inkFoldRemote([stroke(idA,1),highlight(idB,'group-1')],left.meta,right.ops.map(op=>({id:op.id,rev:op.rev,deleted:false,stroke:op.stroke})));
  const seenRight=context.inkFoldRemote([stroke(idC,9)],right.meta,left.ops.map(op=>({id:op.id,rev:op.rev,deleted:false,stroke:op.stroke})));
  assert.deepEqual(seenLeft.strokes.map(item=>item.id),[idA,idB,idC]);
  assert.deepEqual(seenRight.strokes.map(item=>item.id),[idC,idA,idB]);
  assert.equal(seenLeft.strokes[1].strokeId,'group-1');
  assert.equal(seenLeft.strokes[1].tool,'highlighter');
});

test('an erasure tombstones that stroke while the other device keeps its new stroke',()=>{
  const {context}=boot();
  const base=context.inkAdvance([stroke(idA),stroke(idB)],null);
  const erased=context.inkAdvance([stroke(idB)],base.meta);
  assert.equal(erased.ops.some(op=>op.id===idA&&op.deleted&&op.rev>base.meta.local[idA]),true);
  const other=context.inkAdvance([stroke(idA),stroke(idC)],{...base.meta,acked:{[idA]:base.meta.local[idA]}});
  const merged=context.inkFoldRemote([stroke(idA),stroke(idC)],other.meta,erased.ops);
  assert.deepEqual(merged.strokes.map(item=>item.id),[idC]);
  assert.equal(merged.meta.tombs[idA]>0,true);
});

test('offline edits from both devices merge when they reconnect',()=>{
  const {context}=boot();
  const shared=context.inkAdvance([stroke(idA)],null);
  const deviceA=context.inkAdvance([stroke(idA),stroke(idB)],shared.meta);
  const deviceB=context.inkAdvance([stroke(idA),highlight(idC,'group-2')],shared.meta);
  const remoteA=deviceA.ops.filter(op=>op.id!==idA);
  const remoteB=deviceB.ops.filter(op=>op.id!==idA);
  const onA=context.inkFoldRemote([stroke(idA),stroke(idB)],deviceA.meta,remoteB);
  const onB=context.inkFoldRemote([stroke(idA),highlight(idC,'group-2')],deviceB.meta,remoteA);
  assert.deepEqual(onA.strokes.map(item=>item.id).sort(),[idA,idB,idC]);
  assert.deepEqual(onB.strokes.map(item=>item.id).sort(),[idA,idB,idC]);
});

test('a later undo beats a tombstone and an equal revision does not',()=>{
  const {context}=boot();
  const drawn=context.inkAdvance([stroke(idA)],null);
  const removed=context.inkAdvance([],drawn.meta);
  const tie=context.inkFoldRemote([stroke(idA)],{...drawn.meta,local:{[idA]:removed.meta.tombs[idA]},acked:{}},removed.ops);
  assert.deepEqual(tie.strokes,[]);
  const undone=context.inkAdvance([stroke(idA,4)],removed.meta);
  assert.equal(undone.ops[0].deleted,false);
  assert.ok(undone.ops[0].rev>removed.meta.tombs[idA]);
  const restored=context.inkFoldRemote([],removed.meta,undone.ops);
  assert.equal(restored.strokes[0].points[0][0],4);
});

test('identity is the file hash and page, never the title or a reading locator',()=>{
  const {context}=boot();
  assert.equal(context.inkPageFromLocator({original:{page:3,spine:2}}),null);
  assert.equal(context.inkSyncRecordKey(userA,sha,3).includes('title'),false);
  assert.notEqual(context.inkSyncRecordKey(userA,sha,3),context.inkSyncRecordKey(userA,other,3));
  assert.equal(context.inkParseKey(JSON.stringify([sha,3])).page,3);
  assert.equal(context.inkParseKey(JSON.stringify(['same-name.pdf',3])),null);
  assert.equal(context.inkSyncAdmits({kind:'epub',sourceHash:sha,bookCloudLink:{on:true}}),false);
  assert.equal(context.inkSyncAdmits({kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}),true);
});

test('oversized strokes and a full page stay local instead of uploading',()=>{
  const {context}=boot();
  const huge=stroke(idA);
  huge.points=Array.from({length:4000},(_,index)=>[index,index]);
  const skipped=context.inkAdvance([huge],null);
  if(skipped.ops.length)throw new Error('oversized uploaded '+skipped.ops.length+' bytes '+JSON.stringify(huge).length);
  assert.equal(skipped.ops.length,0);
  assert.equal(skipped.meta.omit[idA],1);
  const seeded={};
  for(let index=0;index<4000;index++){
    const hex=index.toString(16).padStart(12,'0');
    seeded[`${hex.slice(0,8)}-aaaa-4aaa-8aaa-${hex}`]=1;
  }
  const held=context.inkAdvance([stroke(idB)],{version:1,clock:1,local:seeded,tombs:{},acked:{},omit:{}});
  assert.equal(held.ops.some(op=>op.id===idB),false);
  assert.equal(held.capped,true);
});

test('an epub locator does not pull or upload ink',async()=>{
  const {context,calls,flush}=boot();
  context.books=[{kind:'epub',title:'Same name',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,3]),strokes:[stroke(idA)],svg:{},dirty:false};
  context.pages.set(state.key,state);
  context.scheduleBookInk(state);
  flush(3000);
  await Promise.resolve();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,0);
  assert.equal(await context.pullBookInk(state),false);
});

test('upload waits until the pen is up, then sends one background batch',async()=>{
  const {context,calls,flush}=boot();
  context.books=[{kind:'pdf',title:'Notes',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,2]),strokes:[stroke(idA)],svg:{},dirty:false,busy:true};
  context.pages.set(state.key,state);
  context.scheduleBookInk(state);
  flush(3000);
  assert.equal(calls.length,0,'no network while the stroke is active');
  state.busy=false;
  flush(3000);
  flush(3000);
  for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);
  assert.equal(calls[0].args.book_id,sha);
  assert.equal(calls[0].args.page,2);
  assert.equal(calls[0].args.ops[0].id,idA);
  assert.equal(calls[0].args.expected_user_id,userA);
});

test('a failed later batch keeps the earlier acknowledgement and retries the rest',async()=>{
  const {context,calls,rows}=boot();
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  const strokes=Array.from({length:41},(_,index)=>stroke(`${(index+1).toString(16).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`));
  const state={key:JSON.stringify([sha,1]),strokes,svg:{},dirty:false,busy:false};
  context.pages.set(state.key,state);
  let attempt=0;
  context.sb.rpc=async(name,args)=>{
    attempt+=1;calls.push({name,args});
    if(attempt===2)return {data:{ok:false,error:'offline'}};
    return {data:{ok:true,applied:args.ops.map(op=>op.id)}};
  };
  assert.equal(await context.flushBookInk(state),false);
  assert.equal(calls.length,2);
  assert.equal(calls[0].args.ops.length,40);
  assert.equal(calls[1].args.ops.length,1);
  const saved=[...rows.values()].find(value=>value&&value.acked);
  assert.equal(Object.keys(saved.acked).length,40);
  calls.length=0;
  context.sb.rpc=async(name,args)=>{calls.push({name,args});return {data:{ok:true,applied:args.ops.map(op=>op.id)}};};
  assert.equal(await context.flushBookInk(state),true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].args.ops.length,1);
  assert.equal(calls[0].args.ops[0].id,strokes[40].id);
});

test('turning sync off blocks the queue and turning it on uploads the local ink again',async()=>{
  const {context,calls}=boot();
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,1]),strokes:[stroke(idA)],svg:{},dirty:false};
  context.pages.set(state.key,state);
  context.sb.rpc=async()=>({data:{ok:false,error:'not_linked'}});
  assert.equal(await context.flushBookInk(state),false);
  calls.length=0;
  assert.equal(await context.flushBookInk(state),false);
  assert.equal(calls.length,0);
  await context.forgetBookInk(sha);
  context.resumeBookInk(sha);
  context.sb.rpc=async(name,args)=>({data:{ok:true,applied:args.ops.map(op=>op.id)}});
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  assert.equal(await context.flushBookInk(state),true);
});

test('a deleted or unlinked book is not uploaded, and local strokes are not the server payload',async()=>{
  const {context,calls}=boot();
  context.books=[{kind:'pdf',title:'Gone',sourceHash:sha,bookCloudLink:{on:false}}];
  const state={key:JSON.stringify([sha,4]),strokes:[stroke(idA)],svg:{}};
  assert.equal(await context.flushBookInk(state),false);
  assert.equal(calls.length,0);
});

test('logout and account switch drop the previous user mid-upload',async()=>{
  const {context,calls}=boot();
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,1]),strokes:[stroke(idA),stroke(idB)],svg:{},dirty:false};
  context.pages.set(state.key,state);
  let release;
  context.sb.rpc=async(name,args)=>{
    calls.push({name,args});
    await new Promise(resolve=>{release=resolve;});
    return {data:{ok:true,applied:args.ops.map(op=>op.id)}};
  };
  const pending=context.flushBookInk(state);
  await new Promise(resolve=>setImmediate(resolve));
  context.sbUser={id:userB};
  context.epoch+=1;
  context.resetInkSyncSession();
  release();
  assert.equal(await pending,false);
  assert.equal(calls[0].args.expected_user_id,userA);
  const again=[];
  context.sb.rpc=async(name,args)=>{again.push(args.expected_user_id);return {data:{ok:true,applied:[]}};};
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  await context.flushBookInk(state);
  assert.deepEqual(again,[userB]);
});

test('remote ink is applied only after the open page has already painted',async()=>{
  const {context}=boot();
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,1]),strokes:[stroke(idA)],svg:{},dirty:false,busy:false};
  context.pages.set(state.key,state);
  let release;
  context.sb.from=()=>({
    select(){
      return {eq(){return {eq(){return {limit(){return new Promise(resolve=>{release=()=>resolve({data:[{stroke_id:idB,rev:2,deleted:false,payload:stroke(idB,8)}],error:null});});}};}};}};
    }
  });
  const order=[];
  order.push('paint');
  const pending=context.pullBookInk(state);
  order.push('returned');
  release();
  await pending;
  order.push('merged');
  assert.deepEqual(order,['paint','returned','merged']);
  assert.deepEqual(state.strokes.map(item=>item.id),[idA,idB]);
  assert.equal(state.applied,1);
});

test('storage quota keeps the pending page in memory and still retries',async()=>{
  const {context,calls,failPut}=boot();
  failPut(true);
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,1]),strokes:[stroke(idA)],svg:{},dirty:false};
  context.pages.set(state.key,state);
  assert.equal(await context.flushBookInk(state),true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].args.ops[0].id,idA);
});

test('hiding the page uploads finished strokes without the debounce',async()=>{
  const {context,calls,pending}=boot();
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,7]),strokes:[stroke(idA)],svg:{},dirty:false,busy:false};
  context.pages.set(state.key,state);
  context.scheduleBookInk(state);
  assert.equal(pending(),1);
  await context.flushBookInkNow();
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'breeze_merge_book_ink');
  assert.equal(calls[0].args.page,7);
  assert.equal(calls[0].args.ops[0].id,idA);
  assert.equal(pending(),0);
});

test('a stroke without an id uploads in the same flush',async()=>{
  const {context,calls}=boot();
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,7]),strokes:[{color:'#111111',width:1.5,points:[[1,1],[2,2]]}],svg:{},dirty:false,busy:false};
  context.pages.set(state.key,state);
  assert.equal(await context.flushBookInk(state),true);
  assert.equal(calls.length,1);
  assert.match(calls[0].args.ops[0].id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(state.persisted>0,true);
});

test('an active stroke waits, then an immediate flush sends it',async()=>{
  const {context,calls}=boot();
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  const state={key:JSON.stringify([sha,7]),strokes:[stroke(idA)],svg:{},dirty:false,busy:true};
  context.pages.set(state.key,state);
  await context.flushBookInkNow();
  assert.equal(calls.length,0);
  state.busy=false;
  await context.flushBookInkNow();
  assert.equal(calls.length,1);
  assert.equal(calls[0].args.ops[0].id,idA);
});

test('an immediate flush waits for the local write instead of another timer',async()=>{
  const {context,calls}=boot();
  context.books=[{kind:'pdf',sourceHash:sha,bookCloudLink:{on:true}}];
  let release;
  const state={key:JSON.stringify([sha,7]),strokes:[stroke(idA)],svg:{},dirty:true,busy:false};
  state.saving=new Promise(resolve=>{release=()=>{state.dirty=false;state.saving=null;resolve();};});
  context.pages.set(state.key,state);
  const pendingFlush=context.flushBookInk(state,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,0);
  release();
  assert.equal(await pendingFlush,true);
  assert.equal(calls.length,1);
});

test('the iPad path flushes on hide and does not treat a resting touch as a stroke',()=>{
  const ink=readFileSync(new URL('../scripts/reader/pdf-ink.js',import.meta.url),'utf8');
  assert.match(ink,/busy:\(\)=>!!active/);
  assert.doesNotMatch(ink,/busy:\(\)=>!!active\|\|suppressed/);
  assert.match(ink,/pagehide/);
  assert.match(ink,/flushBookInkNow\(\)/);
});

test('same display name with a different file does not share a page key',()=>{
  const {context}=boot();
  const left=context.inkSyncRecordKey(userA,sha,1);
  const right=context.inkSyncRecordKey(userA,other,1);
  assert.notEqual(left,right);
  assert.equal(context.inkParseKey(JSON.stringify([sha,1])).sha,sha);
});
