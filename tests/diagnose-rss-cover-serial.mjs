// Preserve the photo-owned test and every assertion. Add lifecycle timestamps
// to a temporary sibling so delayed server-close accounting can be diagnosed.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const original=new URL('./verify-rss-visible-covers-browser.mjs',import.meta.url);
const temporary=new URL(`./.rss-cover-serial-${process.pid}.mjs`,import.meta.url);
let source=readFileSync(original,'utf8');
function replace(before,after){
  if(!source.includes(before))throw Error('Serial diagnostic no longer matches the owned test');
  source=source.replace(before,after);
}
replace('test.requests.push(record);','record.arrivedAt=Date.now();test.requests.push(record);');
replace("res.on('close',()=>{clearTimeout(timer);","res.on('close',()=>{record.closedAt=Date.now();clearTimeout(timer);");
replace('window.coverReaderEvidence=[];',`window.coverReaderEvidence=[];window.coverSerialEvents=[];window.coverSerialActive=0;window.coverSerialMax=0;`);
replace('const originalPhoto=window.rssCardPhoto;',`const originalFetch=window.rssCoverFetch;
      window.rssCoverFetch=async(...args)=>{
        window.coverSerialActive++;window.coverSerialMax=Math.max(window.coverSerialMax,window.coverSerialActive);
        window.coverSerialEvents.push({kind:'start',url:args[0],at:Date.now(),active:window.coverSerialActive});
        try{return await originalFetch(...args);}
        finally{window.coverSerialActive--;window.coverSerialEvents.push({kind:'settle',url:args[0],at:Date.now(),active:window.coverSerialActive});}
      };
      const originalPhoto=window.rssCardPhoto;`);
replace('reader.cancel=(reason)=>{record.cancelled=true;return cancel(reason);};',`reader.cancel=async(reason)=>{
          record.cancelled=true;record.cancelAt=Date.now();
          try{return await cancel(reason);}finally{record.cancelSettledAt=Date.now();}
        };`);
replace("assert.equal(state.maxActive,1,'Cover requests were not serial');",`const client=await h.page.evaluate(()=>({maxActive:coverSerialMax,events:coverSerialEvents}));
      const lifecycle={engine:engine.name(),serverMaxActive:state.maxActive,client,readers:first.readerEvidence,
        requests:cold.requests.map(({target,arrivedAt,closedAt})=>({target,arrivedAt,closedAt}))};
      writeFileSync(resolve(proof,engine.name()+'-serial-lifecycle.json'),JSON.stringify(lifecycle,null,2));
      console.log('RSS cover serial lifecycle:',JSON.stringify(lifecycle));
      assert.equal(client.maxActive,1,'Client metadata fetch/reader lifecycles overlapped');
      assert.equal(state.maxActive,1,'Cover requests were not serial');`);
writeFileSync(temporary,source);
try{
  const child=spawn(process.execPath,[fileURLToPath(temporary)],{stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve(signal?1:code));});
  process.exitCode=code||0;
}finally{unlinkSync(temporary);}
