import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';

const server=await serveStudyFixture();
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
const results=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  await prepareStudyPage(page,server.url);
  for(const count of [1000,5000,12000,50000]){
    const initial=await page.evaluate(async count=>{
      // Synthetic load bypasses storage quota so this test measures the active
      // add/render path; durable item bytes are asserted separately below.
      const started=performance.now();
      words=Object.fromEntries(Array.from({length:count},(_,i)=>['w'+i,{word:'word'+i,ko:'뜻 '+i,book:'Saved',status:1,addedAt:i+1}]));
      dead={};persistedWordItems.clear();rebuildWordIndex();resetWordChangeTracking();
      show('vocab');await scheduleStudySetsVocabularySync([]);
      return performance.now()-started;
    },count);
    for(const mode of [
      {name:'recent',sort:'recent',q:'',stars:[],books:[]},
      {name:'oldest',sort:'oldest',q:'',stars:[],books:[]},
      {name:'alpha',sort:'alpha',q:'',stars:[],books:[]},
      {name:'book-star',sort:'recent',q:'',stars:[1],books:['Saved']},
      {name:'search-alpha',sort:'alpha',q:'word',stars:[1],books:['Saved']}
    ]){
    await page.evaluate(mode=>{
      const sort=document.getElementById('vsort');if(sort)sort.value=mode.sort;document.getElementById('vsearch').value=mode.q;
      wordbookStars.clear();wordbookBooks.clear();mode.stars.forEach(value=>wordbookStars.add(value));mode.books.forEach(value=>wordbookBooks.add(value));
      renderVocab();
    },mode);
    const result=await page.evaluate(async ({count,mode})=>{
      let scans=0,serializedWhole=0,writtenChars=0,groupWalks=0;
      const originalObject={},originalArray={},originalStringify=JSON.stringify,originalSetItem=Storage.prototype.setItem;
      const groupIndex=vocabCatalog().groups,filteredIndex=wordbookFilteredCache?.groups,beforeCount=groupIndex.length;
      for(const method of ['keys','values','entries']){
        originalObject[method]=Object[method];Object[method]=value=>{if(value===words||value===dead)scans++;return originalObject[method](value);};
      }
      for(const method of ['map','filter','forEach','flatMap','sort']){
        originalArray[method]=Array.prototype[method];Array.prototype[method]=function(...args){if(this===groupIndex||this===filteredIndex)groupWalks++;return originalArray[method].apply(this,args);};
      }
      JSON.stringify=function(value,...args){if(value===words||value===dead)serializedWhole++;return originalStringify(value,...args);};
      Storage.prototype.setItem=function(key,value){writtenChars+=String(value).length;return originalSetItem.call(this,key,value);};
      const samples=[];
      try{
        for(let index=0;index<10;index++){
          const key='new-'+mode.name+'-'+count+'-'+index,started=performance.now();
          words[key]={word:'word '+key,ko:'',book:'Saved',status:1,addedAt:Date.now()+index};
          createMeaning(key,'새 의미',{});renderVocab();
          samples.push(performance.now()-started);
          await scheduleStudySetsVocabularySync([]);
          acknowledgeWordChanges(captureWordChanges());
        }
      }finally{
        for(const method in originalObject)Object[method]=originalObject[method];
        for(const method in originalArray)Array.prototype[method]=originalArray[method];
        JSON.stringify=originalStringify;Storage.prototype.setItem=originalSetItem;
      }
      samples.sort((a,b)=>a-b);
      return {count,mode:mode.name,scans,serializedWhole,groupWalks,writtenChars,medianMs:samples[5],maximumMs:samples[9],
        addedGroups:vocabCatalog().groups.length-beforeCount,mountedRows:document.querySelectorAll('#vtablewrap .vgroup').length};
    },{count,mode});
    assert.equal(result.scans,0,JSON.stringify(result));assert.equal(result.serializedWhole,0);
    assert.equal(result.groupWalks,0,'add with unchanged filters must reuse its sorted group index');
    assert.equal(result.addedGroups,10);assert.ok(result.mountedRows<100);
    assert.ok(result.writtenChars<10000,'ten additions must not write the existing vocabulary');
    results.push({...result,initialLoadAndRenderMs:initial});
    }
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({incrementalVisibleWordAdd:results}));
}finally{await browser.close();await server.close();}
