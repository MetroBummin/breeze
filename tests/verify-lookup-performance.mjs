import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const dictionary=read('scripts/dictionary/dictionary.js');
const fn=(source,name)=>source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0];
// A saved revisit changes status, not the set/geometry of saved source words.
for(const statusOnly of [true,false]){
 let refreshes=0,queries=0;const classes=new Set(['s1']);
 const c={words:{quiet:{status:2}},currentReaderMode:'original',originalSession:{pages:[{dataset:{wordCount:'1'}}],wordBoxes:new Map()},CSS:{escape:x=>x},
  renderPdfSavedWordMarkers(){refreshes++;},readerWordNodes(){queries++;return[{classList:{remove(...a){a.forEach(x=>classes.delete(x));},add(x){classes.add(x);}}}];}};
 vm.createContext(c);
 vm.runInContext(fn(read('scripts/reader/pdf-original.js'),'refreshPdfSavedWords')+'\n'+fn(read('scripts/reader/original-session.js'),'refreshOriginalSavedWords')+'\n'+fn(dictionary,'paintWord')+'\nfunction originalFormat(){return {refreshSavedWords:refreshPdfSavedWords};}',c);
 c.paintWord('quiet',statusOnly);
 assert.equal(refreshes,statusOnly?0:1);assert.equal(queries,1);assert.deepEqual([...classes],['s2']);
}
// One source occurrence serves sentence text, token index and surrounding context.
let scans=0;
const c={curBook:{id:'book'},selKey:null,currentContext:()=>null,
 textSentencePartAt(){scans++;return {sentence:'A quiet day.',tokenIndex:1,part:{start:0,end:12},block:{dataset:{pi:'0'},textContent:'A quiet day.'}};},
 lookupSentenceTokens:s=>[...s.matchAll(/\w+/g)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length})),bridgeSentences:s=>[{text:s,start:0,end:s.length}]};
vm.createContext(c);vm.runInContext(['sentenceOf','lookupClickedTokenIndex','lookupRequestFor'].map(n=>fn(dictionary,n)).join('\n'),c);
c.lookupRequestFor({word:'quiet',clicked:'quiet'}, {dataset:{},closest:()=>null},true);
assert.equal(scans,1);
console.log('lookup performance invariants: passed');

for(const name of ['addWord','discardPendingWord','applyLook','fillDictionaryMetadata','fetchDict']){
 assert.ok(!fn(dictionary,name).includes('saveWords()'),name+' must persist only its changed word');
}

// A known mutation is durably dirty immediately, including offline; uploads stay debounced.
for(const online of [false,true]){
 let scans=0,dirty=0,cleared=0,timers=0;
 const c={words:{},dead:{},lastQueuedWordState:'same',syncTimer:7,sb:online,sbUser:online,
  VAULT_LOCAL_CHANGED:'dirty',markSyncDirty(){dirty++;},syncStableJson(){scans++;return 'same';},
  clearTimeout(){cleared++;},setTimeout(fn,ms){assert.equal(ms,4000);timers++;return 8;},doSync(){}};
 vm.createContext(c);vm.runInContext(fn(read('scripts/sync/sync.js'),'queueSync'),c);
 c.queueSync();assert.equal(dirty,0);
 c.queueSync(true);assert.equal(scans,1);assert.equal(dirty,1);assert.equal(cleared,1);assert.equal(timers,online?1:0);
 c.queueSync();assert.equal(scans,2);assert.equal(dirty,2,'generic callers must see invalidated snapshot');
 c.queueSync();assert.equal(dirty,2,'generic unchanged calls stay no-ops');
}


// Every spelling candidate uses the same source snapshot, including after an await.
{
 let scans=0;const keys=[];
 const c={words:{run:{word:'run'}},lookupRequestFor(){scans++;return {sentence:'They run.',clickedIndex:1};},
 homewardWordFor:()=>null,entryKeys:()=>['run','running','ran'],lookKey:(key,sentence,index)=>[key,sentence,index],
 dictGet:async key=>{keys.push(key);return null;}};
 vm.createContext(c);vm.runInContext('async '+fn(dictionary,'loadCachedLook'),c);
 assert.equal(await c.loadCachedLook('run',0,1,null),false);
 assert.equal(scans,1);assert.equal(keys.length,3);
 assert.ok(keys.every(k=>k[1]==='They run.'&&k[2]===1));
}
// Shared candidates preserve exact-context precedence and recent-meaning fallback.
{
 let scans=0;const records=[['bank',{ko:'은행',contextHashes:['v2:S:1'],pickedAt:1}],
 ['bank::river',{root:'bank',ko:'강둑',pickedAt:2}]];
 const c={savedMeaningRecords(){scans++;return records;},sentenceHash:()=> 'S',lookupSentenceTokens:()=>[]};
 vm.createContext(c);vm.runInContext(['meaningKey','meaningPickedAt','meaningCards','findSavedSense'].map(n=>fn(dictionary,n)).join('\n'),c);
 const shared=c.savedMeaningRecords();
 assert.equal(c.findSavedSense('bank','sentence',1,shared),'bank');
 assert.equal(c.findSavedSense('bank','other',2,shared),null);
 assert.equal(c.meaningCards('bank',null,shared)[0][0],'bank::river');
 assert.equal(scans,1);assert.equal(records[0][0],'bank','sorting must not mutate shared candidates');
}

// Work budgets and slow-storage regression checks.
await import("./verify-lookup-work.mjs");
