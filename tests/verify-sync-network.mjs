import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script,createContext} from 'node:vm';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const memory=new Map(),calls=[];
const element={classList:{contains:()=>false},addEventListener(){},textContent:'',innerHTML:'',style:{}};
const context=createContext({
  console,URL,Date,Math,JSON,Object,Array,Set,Map,Number,String,Promise,setTimeout,clearTimeout,setInterval,clearInterval,
  window:{BREEZE_CONFIG:{}},location:{href:'https://breeze.test/'},history:{replaceState(){}},
  document:{hidden:false,addEventListener(){},getElementById(){return element;}},
  load:(key,fallback)=>memory.has(key)?memory.get(key):fallback,save:(key,value)=>memory.set(key,value),
  vaultGet:async()=>null,vaultPut:async()=>{},ensureBookFingerprint:book=>book.id,
  bookPut:async()=>{},originalGetForBook:async()=>null,cleanOrphanWords(){},saveWords(){},
  renderAllBookViews(){},renderVocab(){},miniToast(){},syncLoginNudge(){},settingsSyncTabLabel(){},
  restoreMissingVaultArticles(){},dictCall:async()=>({ok:true}),pendingWord:null,pendingWordResolved:()=>true,
  words:{},dead:{},books:[],positions:{},curBook:null,
  LS_DEAD:'dead',LS_POS:'positions',
  VaultCrypto:{
    uuid:()=> 'device',bytes:value=>value,random:()=>({}),recordId:async(_key,_kind,value)=>`identity:${value}`,
    openJson:async(_key,envelope)=>envelope.payload,
    sealJson:async(_key,payload)=>({payload}),
    createDeviceWrap:async()=>({key:{},wrap:{}}),
    openDeviceWrap:async()=>({})
  }
});
context.globalThis=context;

function client(meta,{vault=null,progress=null}={}){
  const responseFor=filters=>{
    const key=filters.key;
    if(key==='__breeze_vault_meta_v2__') return {data:{data:meta},error:null};
    if(key==='__breeze_vault_v2__') return {data:vault?{data:vault}:null,error:null};
    if(key==='__breeze_progress_v1__') return {data:progress?{data:progress}:null,error:null};
    return {data:[],error:null};
  };
  return {from(table){
    return {
      select(columns){
        const filters={};
        const query={
          eq(column,value){ filters[column]=value; return query; },
          not(){ return Promise.resolve({data:[],error:null}); },
          maybeSingle(){ calls.push({kind:'select',table,columns,key:filters.key}); return Promise.resolve(responseFor(filters)); }
        };
        return query;
      },
      upsert(rows){ calls.push({kind:'upsert',table,keys:rows.map(row=>row.key)}); return Promise.resolve({error:null}); }
    };
  }};
}

const source=readFileSync(resolve(root,'scripts/sync/progress-merge.js'),'utf8')+'\n'+
  readFileSync(resolve(root,'scripts/sync/sync.js'),'utf8')+`\n
globalThis.__syncTest={
  setup(nextClient,userState){
    sb=nextClient; sbUser={id:'user'}; vaultMaster={}; vaultMeta=userState.meta;
    words=userState.words||{}; dead=userState.dead||{}; books=userState.books||[];
    positions=userState.positions||{}; progressRemoteRecords={};
  },
  runVault:runSyncPass,
  runProgress:runProgressSyncPass
};`;
new Script(source,{filename:'sync-network-harness.js'}).runInContext(context);

const meta={v:2,vaultId:'vault',vaultUpdatedAt:100,legacyMigratedAt:1,progressSeparatedAt:1};
context.__syncTest.setup(client(meta),{meta});
memory.set('breeze.vault.remote:user',100);
memory.set('breeze.private-logs-purged:user',true);
calls.length=0;
assert.equal(await context.__syncTest.runVault(false),true);
assert.deepEqual(calls.map(call=>call.key),['__breeze_vault_meta_v2__'],
  'An unchanged v2 sync fetched more than the metadata row');

const vault={v:2,updatedAt:100,envelope:{payload:{v:2,words:{},dead:{},items:[]}}};
context.__syncTest.setup(client(meta,{vault}),{meta,words:{saved:{up:200,ko:'뜻'}}});
memory.set('breeze.vault.changed',200);
calls.length=0;
assert.equal(await context.__syncTest.runVault(false),true);
assert.deepEqual(calls.map(call=>call.kind+':'+(call.key||call.keys.join(','))),[
  'select:__breeze_vault_meta_v2__','select:__breeze_vault_v2__',
  'upsert:__breeze_vault_v2__,__breeze_vault_meta_v2__'
], 'One vocabulary change did not use the expected three-request transport');

const book={id:'book',kind:'paste',title:'Book',addedAt:1};
context.__syncTest.setup(client(meta),{meta,books:[book],positions:{book:{p:.5,t:300,mode:'text'}}});
memory.set('breeze.progress.changed',300);
calls.length=0;
assert.equal(await context.__syncTest.runProgress(false,false),true);
assert.deepEqual(calls.map(call=>call.kind+':'+(call.key||call.keys.join(','))),[
  'select:__breeze_progress_v1__','upsert:__breeze_progress_v1__'
], 'Progress-only sync touched a non-progress record or used the wrong request count');
assert.equal(calls.some(call=>call.key==='__breeze_vault_v2__'),false,
  'Progress-only sync downloaded the vocabulary vault');

console.log('Sync request-count harness passed');
