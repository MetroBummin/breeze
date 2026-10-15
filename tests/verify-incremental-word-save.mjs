import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const state=read('scripts/core/state.js');
const dictionary=read('scripts/dictionary/dictionary.js');
const fn=(source,name)=>source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0];
function fixture(size=0,memory=new Map()){
  if(!memory.size)memory.set('breeze.words',JSON.stringify(Object.fromEntries(Array.from({length:size},(_,i)=>
    ['w'+i,{word:'word'+i,ko:'뜻 '+i,status:1,addedAt:1,up:1}]))));
  const stats={bytes:0,writes:0,failAt:Infinity};
  const context={console:{warn(){}},toast(){},Date,memory,stats,
    vocabSort:'recent',document:{getElementById:()=>({value:context.vocabSort})},
    localStorage:{get length(){return memory.size;},key:i=>[...memory.keys()][i],getItem:key=>memory.get(key)??null,
      setItem(key,value){if(++stats.writes===stats.failAt)throw new DOMException('full','QuotaExceededError');stats.bytes+=value.length;memory.set(key,value);},removeItem:key=>memory.delete(key)},
    setTimeout(){return 1;},clearTimeout(){},sb:{},sbUser:{id:'synthetic-account'},
    applyWordCanonical(){},senseCardKey:(root,meaning)=>root+'::'+meaning};
  vm.createContext(context);
  const started=performance.now();
  vm.runInContext(read('scripts/core/word-integrity.js')+'\n'+state.slice(0,state.indexOf('const posOf ='))+`
    let syncTimer=null,lastQueuedWordState=null;const VAULT_LOCAL_CHANGED='breeze.vault.changed';
    function markSyncDirty(key){save(key,1);}function doSync(){}
    globalThis.api={get words(){return words;},get dead(){return dead;},saveWords,saveDead,loadDeadState,
      wordChangeRevision,hasWordChanges,captureWordChanges,acknowledgeWordChanges,resetWordChangeTracking,
      wordEntriesForRoot,refreshWordIndex,rebuildWordIndex};
    globalThis.wholeScans=0;globalThis.wholeSerializations=0;
    for(const name of ['entries','values','keys']){
      const original=Object[name];Object[name]=value=>{if(value===words||value===dead)wholeScans++;return original(value);};
    }
    const originalStringify=JSON.stringify;
    JSON.stringify=(value,...args)=>{if(value===words||value===dead)wholeSerializations++;return originalStringify(value,...args);};
  `,context);
  vm.runInContext('let vocabCatalogCache=null;\n'+['meaningKey','findSenseByMeaning','touchMeaning','createMeaning','dropSuggestion',
    'vocabCatalogOrder','vocabCatalogPosition','updateVocabCatalogKeys','vocabCatalog','orderVocabEntries'].map(name=>fn(dictionary,name)).join('\n')
    +'\n'+fn(read('scripts/sync/sync.js'),'queueSync'),context);
  const wordbook=read('scripts/ui/wordbook.js');
  vm.runInContext(wordbook.slice(0,wordbook.indexOf('function renderWordbookBookOptions'))+`
    globalThis.setFilter=(sort,stars,books)=>{vocabSort=sort;wordbookStars.clear();wordbookBooks.clear();stars.forEach(value=>wordbookStars.add(value));books.forEach(value=>wordbookBooks.add(value));};
    globalThis.wholeGroupScans=0;
    for(const name of ['map','filter','forEach','flatMap','sort']){
      const original=Array.prototype[name];Array.prototype[name]=function(...args){
        if(this===vocabCatalogCache?.groups||this===wordbookFilteredCache?.groups)wholeGroupScans++;
        return original.apply(this,args);
      };
    }
  `,context);
  context.vocabCatalog();context.wholeScans=0;context.wholeSerializations=0;
  return {context,api:context.api,stats,memory,loadMs:performance.now()-started};
}

// Unchanged active filters/sorts apply the same delta contract, including entries
// moving into/out of the view and reordering. Compare with the original full
// filter semantics as an independent oracle after each operation.
for(const sort of ['recent','oldest','alpha'])for(const criteria of [
  {q:'',stars:[],books:[]},{q:'word',stars:[1],books:[]},{q:'',stars:[],books:['Saved']},
  {q:'word',stars:[1,2],books:['Saved']}
]){
  const w=fixture(1000),{api,context}=w;
  context.setFilter(sort,criteria.stars,criteria.books);
  context.filterWordbookGroups(context.vocabCatalog().groups,criteria.q);context.wholeGroupScans=0;
  const verify=()=>{
    const actual=context.filterWordbookGroups(context.vocabCatalog().groups,criteria.q);
    assert.equal(context.wholeGroupScans,0,`filtered delta scanned ${sort}/${criteria.q}`);
    const grouped=new Map();
    Object.entries(api.words).filter(([,item])=>item?.ko).sort((a,b)=>b[1].addedAt-a[1].addedAt).forEach(([id,item])=>{
      const root=item.root||id;if(!grouped.has(root))grouped.set(root,[]);grouped.get(root).push([id,item]);
    });
    for(const entries of grouped.values())entries.sort((a,b)=>(a[0]===(a[1].root||a[0])?-1:0)-(b[0]===(b[1].root||b[0])?-1:0)||(b[1].addedAt||0)-(a[1].addedAt||0));
    const expected=[...grouped].map(([root,entries])=>{
      const head=api.words[root]||entries[0][1];
      const selected=(!criteria.stars.length||criteria.stars.includes(head.status))?entries.filter(([,item])=>
        (!criteria.books.length||criteria.books.includes(item.book||''))&&(!criteria.q||[item.word,item.ko,item.book||''].some(value=>value.toLowerCase().includes(criteria.q)))):[];
      return [root,selected];
    }).filter(([,entries])=>entries.length);
    const added=entries=>Math.max(...entries.map(([,item])=>Number(item.addedAt)||0));
    expected.sort((a,b)=>sort==='alpha'?a[1][0][1].word.localeCompare(b[1][0][1].word):(sort==='oldest'?1:-1)*(added(a[1])-added(b[1])));
    const ids=groups=>Array.from(groups,([root,entries])=>[root,Array.from(entries,([id])=>id)]);
    assert.deepEqual(ids(actual),ids(expected));
  };
  api.words.fresh={word:'word fresh',ko:'new',status:1,book:'Saved',addedAt:20};api.saveWords('fresh');verify();
  api.words.fresh.status=3;api.saveWords('fresh');verify();
  api.words.fresh.status=2;api.words.fresh.word='aaa word';api.words.fresh.addedAt=0;api.saveWords('fresh');verify();
  api.words.fresh.book='Other';api.saveWords('fresh');verify();
  api.words.sense={word:'word sense',ko:'sense',root:'fresh',status:1,book:'Saved',addedAt:30};api.saveWords('sense');verify();
  delete api.words.fresh;api.saveWords('fresh');verify();
  delete api.words.sense;api.saveWords('sense');verify();
}

// The real add/meaning/save/dirty path remains bounded as the vocabulary grows.
// The initial snapshot/index load is measured separately from each interaction.
const measurements=[];
for(const size of [1000,5000,12000,50000]){
  const w=fixture(size),samples=[],writeBytes=[];
  for(let index=0;index<15;index++){
    const key='added-'+String(index).padStart(2,'0');
    w.api.words[key]={word:key,ko:'',status:1,addedAt:Date.now()+index,up:1};
    const before=w.stats.bytes,started=performance.now();
    assert.equal(w.context.createMeaning(key,'새 의미',{}),key);
    const catalog=w.context.vocabCatalog();assert.equal(catalog.count,size+index+1);
    assert.equal(catalog.groups[0][0],key);
    const delta=w.api.captureWordChanges();
    assert.deepEqual([...delta.keys],[key]);
    assert.equal(delta.words[key].ko,'새 의미');
    w.api.acknowledgeWordChanges(delta);
    samples.push(performance.now()-started);writeBytes.push(w.stats.bytes-before);
    assert.equal(w.api.hasWordChanges(),false);
  }
  assert.equal(w.context.wholeScans,0,`single add enumerated ${size} words`);
  assert.equal(w.context.wholeSerializations,0,`single add serialized ${size} words`);
  assert.ok(Math.max(...writeBytes)<1200,'one addition must not write unrelated records');
  samples.sort((a,b)=>a-b);
  measurements.push({words:size,initialLoadMs:+w.loadMs.toFixed(2),singleAddWholeScans:w.context.wholeScans,
    singleAddMaxWrittenChars:Math.max(...writeBytes),singleAddMedianMs:+samples[7].toFixed(3),singleAddP95Ms:+samples[14].toFixed(3)});
}

// Incremental grouping handles removal, root moves and a changed group order.
{
  const w=fixture(1000),{api}=w;
  api.words.a={word:'a',ko:'A',book:'Book A',addedAt:10};api.words.b={word:'a',root:'a',ko:'B',book:'Book B',addedAt:20};
  api.saveWords(['a','b']);const catalog=w.context.vocabCatalog();
  assert.equal(catalog.groups[0][0],'a');assert.equal(catalog.groups[0][1].length,2);
  delete api.words.b;api.saveWords('b');assert.equal(w.context.vocabCatalog().groups[0][1].length,1);
  assert.equal(catalog.bookCounts.has('Book B'),false);
  api.words.a.root='new-root';api.saveWords('a');assert.equal(catalog.groups[0][0],'new-root');
  assert.equal(catalog.groupRecords.has('a'),false);assert.equal(w.context.wholeScans,0);
}

// An ACK removes exactly the versions it sent. A newer mutation and a different
// account epoch cannot lose their pending changes to a delayed response.
{
  const {api}=fixture();api.words.bank={word:'bank',ko:'은행',up:1};api.saveWords('bank');
  const first=api.captureWordChanges();
  api.words.bank.ko='강둑';api.words.bank.up=2;api.saveWords('bank');
  api.acknowledgeWordChanges(first);assert.equal(api.hasWordChanges(),true);
  const second=api.captureWordChanges();assert.equal(second.words.bank.ko,'강둑');assert.equal(first.words.bank.ko,'은행');
  api.resetWordChangeTracking();api.words.bank.ko='계정 B';api.saveWords('bank');
  api.acknowledgeWordChanges(second);assert.equal(api.hasWordChanges(),true);
  api.acknowledgeWordChanges(api.captureWordChanges());assert.equal(api.hasWordChanges(),false);
}

// Tombstones use the same bounded transaction/recovery contract as words.
{
  const w=fixture(1000);w.memory.set('breeze.dead',JSON.stringify({legacy:7}));
  let current=fixture(0,w.memory);current.api.dead.removed=20;current.api.dead['removed::sense']=21;
  current.stats.failAt=current.stats.writes+3;
  assert.equal(current.api.saveDead(['removed','removed::sense']),false);
  current=fixture(0,w.memory);
  assert.equal(current.api.dead.removed,20);assert.equal(current.api.dead['removed::sense'],21);
  assert.equal(current.api.saveDead(['removed','removed::sense']),true);
  assert.equal(w.memory.has('breeze.dead-write.pending'),false);
  delete current.api.dead.removed;assert.equal(current.api.saveDead('removed'),true);
  assert.equal(fixture(0,w.memory).api.dead.removed,undefined);
  assert.equal(w.memory.get('breeze.dead'),'{"legacy":7}','legacy archive is unchanged');
  assert.equal(current.context.wholeScans,0);
}

// Index repairs only touched IDs and handles moving a meaning or retry owner.
{
  const {api}=fixture(1000);
  api.words.child={word:'bank',ko:'은행',root:'bank',retryOwner:'old-owner'};api.saveWords('child');
  assert.deepEqual([...api.wordEntriesForRoot('bank')].map(([id])=>id),['child']);
  api.words.child.root='new-root';api.words.child.retryOwner='new-owner';api.saveWords('child');
  assert.equal(api.wordEntriesForRoot('bank').length,0);assert.equal(api.wordEntriesForRoot('old-owner').length,0);
  assert.equal(api.wordEntriesForRoot('new-root').length,1);assert.equal(api.wordEntriesForRoot('new-owner').length,1);
  delete api.words.child;api.saveWords('child');assert.equal(api.wordEntriesForRoot('new-root').length,0);
}
console.log(JSON.stringify({incrementalWordSave:measurements,ackVersionIsolation:true,tombstoneRecovery:true}));
