/* This cache-stamped script runs in the page and its dedicated worker.
   Disk remains breeze-pdf-ink v1. Only immutable edit deltas cross to the worker;
   full-page IndexedDB serialization must not run on the input thread. */
const BreezePdfInkStore = (()=>{
  function backend(){
    let opening=null;
    const pages=new Map();
    const database=typeof openDb==='function'
      ?openDb('breeze-pdf-ink',1,db=>db.createObjectStore('pages'))
      :()=>{
        if(opening)return opening;
        opening=new Promise((resolve,reject)=>{
          const request=indexedDB.open('breeze-pdf-ink',1);let settled=false;
          const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);};
          const timer=setTimeout(()=>fail(new Error('Ink storage open timed out')),10000);
          request.onupgradeneeded=()=>request.result.createObjectStore('pages');
          request.onerror=()=>fail(request.error||new Error('Ink storage open failed'));
          request.onblocked=()=>fail(new Error('Ink storage is blocked'));
          request.onsuccess=()=>{
            if(settled){request.result.close();return;}
            settled=true;clearTimeout(timer);
            request.result.onversionchange=()=>{request.result.close();opening=null;};
            resolve(request.result);
          };
        }).catch(error=>{opening=null;throw error;});
        return opening;
      };
    async function read(key){
      const db=await database();
      const value=await new Promise((resolve,reject)=>{
        const tx=db.transaction('pages'),request=tx.objectStore('pages').get(key);
        tx.oncomplete=()=>resolve(request.result);
        tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Ink read failed'));
      });
      // Validation belongs to the ink engine. Invalid records cannot be
      // admitted for editing and are never migrated or overwritten here.
      const strokes=value?.version===1&&Array.isArray(value.strokes)?value.strokes:[];
      pages.set(key,new Map(strokes.map((stroke,id)=>[id,stroke])));
      return value;
    }
    async function write(key,{order,additions}){
      const prior=pages.get(key)||new Map(),added=new Map(additions),current=new Map();
      const strokes=order.map(id=>{
        const stroke=added.get(id)||prior.get(id);
        if(!stroke)throw new Error('Missing ink stroke; retry the latest page');
        current.set(id,stroke);return stroke;
      });
      const db=await database();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('pages','readwrite');
        tx.oncomplete=()=>resolve(undefined);
        tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Ink write failed'));
        try{tx.objectStore('pages').put({version:1,strokes},key);}
        catch(error){try{tx.abort();}catch{}reject(error);}
      });
      // Keep only the committed page. Undo resends removed immutable strokes;
      // an unbounded worker-side undo cache would duplicate session history.
      pages.set(key,current);
    }
    return {read,write,release(key){pages.delete(key);}};
  }
  function dispatcher(){
    const store=backend(),jobs=new Map();
    return (op,key,payload)=>{
      const job=(jobs.get(key)||Promise.resolve()).catch(()=>{}).then(()=>store[op](key,payload));
      jobs.set(key,job);
      const clear=()=>{if(jobs.get(key)===job)jobs.delete(key);};
      job.then(clear,clear);return job;
    };
  }
  if(typeof document==='undefined'){
    const dispatch=dispatcher();
    self.addEventListener('message',event=>{
      const {id,op,key,payload}=event.data;
      if(!['read','write','release'].includes(op))return;
      dispatch(op,key,payload).then(value=>self.postMessage({id,value}),error=>
        self.postMessage({id,error:String(error?.message||error)}));
    });
    self.postMessage({ready:true});
    return null;
  }
  const scriptURL=document.currentScript?.getAttribute('src');
  const bindings=new Map();
  let transport=null,workerDisabled=false;
  function connection(){
    if(transport)return transport;
    if(!workerDisabled&&scriptURL&&typeof Worker==='function'){
      try{
        const worker=new Worker(scriptURL),pending=new Map();let next=0;
        const current={request(op,key,payload){
          return new Promise((resolve,reject)=>{
            const id=++next;pending.set(id,{resolve,reject});
            try{worker.postMessage({id,op,key,payload});}catch(error){pending.delete(id);reject(error);}
          });
        }};
        const failed=()=>{
          clearTimeout(startup);worker.terminate();workerDisabled=true;
          if(transport===current)transport=null;
          for(const job of pending.values())job.reject(new Error('Ink worker unavailable; retry saving'));
          pending.clear();
        };
        // Startup only. Never time out a live stroke or database transaction.
        const startup=setTimeout(failed,10000);
        worker.onerror=failed;worker.onmessageerror=failed;
        worker.onmessage=event=>{
          if(event.data.ready){clearTimeout(startup);return;}
          const {id,value,error}=event.data,job=pending.get(id);if(!job)return;
          pending.delete(id);if(error)job.reject(new Error(error));else job.resolve(value);
        };
        return transport=current;
      }catch{workerDisabled=true;}
    }
    // Unsupported/blocked workers retain the original durable local writer.
    // This fallback preserves data, but cannot promise the worker speedup.
    return transport={request:dispatcher()};
  }
  async function read(key){
    let owner=connection(),value;
    try{value=await owner.request('read',key);}
    catch(error){
      // Failed reads made no edit. Retry on the local fallback. Failed writes
      // instead surface their error and retain the latest dirty page for retry.
      if(transport===owner)throw error;
      owner=connection();value=await owner.request('read',key);
    }
    const ids=new WeakMap(),strokes=value?.version===1&&Array.isArray(value.strokes)?value.strokes:[];
    strokes.forEach((stroke,id)=>{if(stroke&&typeof stroke==='object')ids.set(stroke,id);});
    bindings.set(key,{owner,ids,next:strokes.length,known:new Set(strokes.map((_,id)=>id))});
    return value;
  }
  async function write(key,value){
    const owner=connection();let binding=bindings.get(key);
    if(!binding){binding={owner,ids:new WeakMap(),next:0,known:new Set()};bindings.set(key,binding);}
    if(binding.owner!==owner){binding.owner=owner;binding.known.clear();}
    const additions=[],order=value.strokes.map(stroke=>{
      let id=binding.ids.get(stroke);
      if(id===undefined){id=binding.next++;binding.ids.set(stroke,id);}
      if(!binding.known.has(id))additions.push([id,stroke]);
      return id;
    });
    await owner.request('write',key,{order,additions});
    binding.known=new Set(order);
  }
  return {read,write,release(key){
    bindings.delete(key);
    if(transport)void transport.request('release',key).catch(()=>{});
  }};
})();
