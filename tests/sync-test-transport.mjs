/* Stateful, serializable Supabase test double. Reads and writes are cloned;
   a SELECT cannot see future mutations through shared object references.
   CAS predicates are checked at commit time, not at SELECT time. No live I/O. */
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
export const VAULT='__breeze_vault_v2__',META='__breeze_vault_meta_v2__',PROGRESS='__breeze_progress_v1__',WORD='__breeze_wordbook_v1__';
export const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
export const pos=(p,t)=>({position:{p,t,mode:'text',pi:null,dy:0,original:null},updatedAt:t});
export const word=t=>({up:t,ko:'뜻'});
export const book=id=>({id,kind:'paste',title:id,addedAt:1});
export const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
export function barrier(count){let entered=0;const gate=deferred();return async()=>{if(++entered===count)gate.resolve();if(entered<=count)await gate.promise;};}
export function server({words={apple:word(100)},dead={},items=[],separated=true,revision='base',legacy=true,progress={},wordbook=true}={}){
  const rows=new Map(),calls=[],hooks={};
  const put=(user,key,data)=>rows.set(`${user}/${key}`,clone(data));
  const peek=(key,user='user')=>clone(rows.get(`${user}/${key}`));
  const seed=(user='user')=>{
    put(user,META,{v:2,vaultId:'vault',vaultUpdatedAt:100,...(legacy?{legacyMigratedAt:1}:{}),...(separated?{progressSeparatedAt:1}:{})});
    put(user,VAULT,{v:2,updatedAt:100,...(revision?{revision}:{}),envelope:{payload:{v:2,words,dead,items}}});
    if(wordbook)put(user,WORD,{v:1,updatedAt:100,...(revision?{revision}:{}),legacyImportedAt:1,words,dead});
    if(progress!==null)put(user,PROGRESS,{v:1,updatedAt:100,revision:'progress-base',envelope:{payload:{v:1,records:progress}}});
  };
  seed();
  const client=label=>({
    auth:{
      signOut:async()=>{if(hooks.auth?.[label])hooks.auth[label]('SIGNED_OUT',null);return {error:null};},
      onAuthStateChange:fn=>{hooks.auth||={};hooks.auth[label]=fn;},
      getSession:()=>new Promise(()=>{})
    },
    from(table){
      let kind='select',columns='',data,filters=[],executed;
      const query={
        select(value){columns=value;return query;},
        eq(key,value){filters.push([key,value]);return query;},
        is(key,value){filters.push([key,value]);return query;},
        not(key,operator,value){filters.push([`not:${key}`,value]);return query;},
        update(value){kind='update';data=clone(value);return query;},
        insert(value){kind='insert';data=clone(value);return query;},
        upsert(value){kind='upsert';data=clone(value);return query;},
        maybeSingle(){return execute();},
        then(resolve,reject){return execute().then(resolve,reject);}
      };
      function execute(){
        if(executed)return executed;
        executed=(async()=>{
          const user=filters.find(([key])=>key==='user_id')?.[1]??data?.[0]?.user_id;
          const key=filters.find(([key])=>key==='key')?.[1]??data?.[0]?.key;
          const call={label,table,kind,columns,key,user,filters:clone(filters),keys:Array.isArray(data)?data.map(row=>row.key):[key]};
          calls.push(call);
          if(kind==='select'){
            const error=await hooks.beforeRead?.(call);
            if(error)return {data:null,error};
            let answer;
            if(table!=='words'||filters.some(([key])=>key.startsWith('not:')))answer=[];
            else{
              const row=peek(key,user);
              answer=row===undefined?null:columns==='data'?{data:row}
                :{revision:row.revision??null,updatedAt:row.updatedAt??null,sync:row.sync??null};
            }
            const snapshot=clone(answer);
            await hooks.afterRead?.(call,snapshot);
            return {data:snapshot,error:null};
          }
          const error=await hooks.beforeWrite?.(call,data);
          if(error)return {data:null,error};
          const previous=peek(key,user);
          if(kind==='insert'&&previous!==undefined)return {data:null,error:{code:'23505',message:'duplicate key'}};
          if(kind==='update'){
            const matches=previous!==undefined&&filters.every(([field,value])=>{
              if(!field.startsWith('data->>'))return true;
              const actual=previous[field.slice(7)];
              return value===null?actual==null:String(actual)===String(value);
            });
            if(!matches){call.conflict=true;return {data:null,error:null};}
            put(user,key,data.data);
          }else for(const row of data)put(row.user_id,row.key,row.data);
          call.committed=true;
          await hooks.afterWrite?.(call);
          return {data:columns==='key'?{key}:null,error:null};
        })();
        return executed;
      }
      return query;
    }
  });
  return {rows,calls,hooks,client,peek,put,seed};
}
export function device(db,label,{user='user',words={},dead={},books=[],positions={},active=null,dirty=0,progressDirty=0,seen='old',legacyImported=true}={}){
  const memory=new Map(),timers=new Map(),views=new Set(active?['v-read']:[]),errors=[];
  const elements=new Map();let timerId=0;
  class Clock extends Date{static now(){return 200000;}}
  const context=createContext({
    console:{log(){},warn(){},error(error){errors.push(String(error?.message||error));}},
    URL,Date:Clock,Math,JSON,Object,Array,Set,Map,Number,String,Promise,
    setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId;},clearTimeout(id){timers.delete(id);},
    setInterval(fn,delay){timers.set(++timerId,{fn,delay});return timerId;},clearInterval(id){timers.delete(id);},
    window:{BREEZE_CONFIG:{}},location:{href:'https://breeze.test/',pathname:'/',hash:''},history:{replaceState(){}},
    localStorage:{getItem(){return null;}},
    document:{hidden:false,addEventListener(){},querySelector(selector){
      if(selector==='#nav-settings [data-i18n="nav.settings"]') return this.getElementById('nav-settings-label');
      return null;
    },getElementById(id){
      if(!elements.has(id))elements.set(id,{classList:{contains:()=>views.has(id)},addEventListener(){},style:{},textContent:'',innerHTML:''});
      return elements.get(id);
    }},
    load:(key,fallback)=>memory.has(key)?clone(memory.get(key)):fallback,save:(key,value)=>memory.set(key,clone(value)),
    vaultGet:async()=>({key:{},wrap:{}}),vaultPut:async()=>{},ensureBookFingerprint:one=>one.id,
    bookPut:async()=>{},originalGetForBook:async()=>null,cleanOrphanWords(){},
    saveWords(){memory.set('words',clone(context.words));},
    renderAllBookViews(){},renderVocab(){},miniToast(){},syncLoginNudge(){},settingsSyncTabLabel(){},
    restoreMissingVaultArticles(){},dictCall:async()=>({ok:true}),pendingWord:null,pendingWordResolved:()=>true,
    esc:value=>String(value),tr:value=>value,
    words:clone(words),dead:clone(dead),books:clone(books),positions:clone(positions),curBook:active,
    LS_DEAD:'dead',LS_POS:'positions',
    VaultCrypto:{uuid:randomUUID,bytes:value=>value,random:()=>({}),recordId:async(_key,_kind,value)=>`identity:${value}`,
      openJson:async(_key,envelope)=>clone(envelope.payload),sealJson:async(_key,payload)=>({payload:clone(payload)}),
      createDeviceWrap:async()=>({key:{},wrap:{}}),openDeviceWrap:async()=>({})}
  });
  const source=readFileSync(new URL('../scripts/sync/progress-merge.js',import.meta.url),'utf8')+'\n'+
    readFileSync(process.env.BREEZE_SYNC_SOURCE||new URL('../scripts/sync/sync.js',import.meta.url),'utf8');
  new Script(source+`\n;globalThis.syncTest={
    setup(client,user,meta){sb=client;sbUser={id:user};vaultMaster={};vaultMeta=meta;},
    vault:doSync,progress:doProgressSync,all:syncRemoteChanges,logout:sbLogout,attach:attachSupabaseAuth,
    queueWords:queueSync,queueProgress:queueReadingProgressSync,
    render:()=>{renderSyncModal();return document.getElementById('sm-body').innerHTML;},
    clearLegacyKey:()=>{vaultMaster=null;},
    snapshot:()=>({words,dead,positions,progressRemoteRecords,vaultRemoteItems,vaultMeta,vaultMaster,sbUser}),
    change:(key)=>{if(typeof markSyncDirty==='function')markSyncDirty(key);else save(key,Date.now());}
  };`,{filename:'actual-sync.js'}).runInContext(context);
  context.syncTest.setup(db.client(label),user,db.peek(META,user));
  memory.set('breeze.vault.remote:'+user,seen);memory.set('breeze.private-logs-purged:'+user,true);
  memory.set('breeze.vault.changed',dirty);memory.set('breeze.progress.changed',progressDirty);
  memory.set('breeze.wordbook.legacy-imported:'+user,legacyImported);
  return {api:context.syncTest,context,memory,timers,views,errors,snapshot:()=>clone(context.syncTest.snapshot()),
    add(key,value){context.words[key]=clone(value);context.syncTest.change('breeze.vault.changed');},
    move(id,position){context.positions[id]=clone(position);context.syncTest.change('breeze.progress.changed');}};
}
