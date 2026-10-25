import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium,firefox,webkit} from './helpers/bounded-playwright.mjs';

const cloud=readFileSync(new URL('../scripts/library/book-cloud.js',import.meta.url));
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/book-cloud.js')){
    res.setHeader('content-type','text/javascript');
    res.end(cloud);
    return;
  }
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end('<!doctype html><title>book position</title><script src="/book-cloud.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const hash='cd'.repeat(32);
const places={
  pdf:{p:0.42,t:1000,mode:'original',original:{kind:'pdf',page:12,y:0.35}},
  epub:{p:0.27,t:1000,mode:'original',original:{kind:'epub',href:'ch3.xhtml',spine:3,element:4,char:12}},
  txt:{p:0.61,t:1000,mode:'text',pi:18,dy:4,y:900}
};

async function scenario(page,kind){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error&&error.message||error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const result=await page.evaluate(async({kind,hash,place})=>{
    const id='file-'+hash.slice(0,32);
    window.BREEZE_CONFIG={BOOK_CLOUD:true,SB_URL:'https://example.test',SB_KEY:'anon'};
    books=[{id,kind,title:'Sample',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}}];
    positions={[id]:{p:0,t:1,mode:kind==='txt'?'text':'original',original:null}};
    sbUser={id:'11111111-1111-1111-1111-111111111111'};
    deviceId=()=>'device-a';
    const sent=[];
    const restored=[];
    sb={
      auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},
      from(table){return {select:async()=>table==='book_device_positions'
        ? {data:[{book_id:hash,device_id:'other',locator:place,read_at:place.t}]}
        : {data:[{book_id:hash,title:'Sample',author:'Shelf',kind,status:'ready',byte_size:5,tombstone:''}]}};},
      rpc:async(name,args)=>{sent.push({name,bookId:args.book_id,deviceId:args.device_id,locator:args.locator});return {data:{ok:true,device_id:args.device_id,locator:args.locator}};}
    };
    bookCloudPost=async()=>({ok:true,ready:true});
    switchReaderMode=async(mode,options)=>{restored.push({mode,initial:!!(options&&options.initial),place:bookCloudLocator(positions[id])});};
    restoreAnchor=position=>{restored.push({mode:'text',place:bookCloudLocator(position)});return true;};
    readerScrollTo=()=>{};
    curBook=books[0];
    await syncBookCloud();
    const adopted=bookCloudLocator(positions[id]);
    positions[id]={...place,t:place.t+50,p:0.91};
    if(kind==='txt')positions[id].pi=40;
    await bookCloudRefresh(bookCloudSession());
    const kept=bookCloudLocator(positions[id]);
    return {
      errors:sent.filter(call=>call.bookId!==hash),
      adopted,
      keptP:kept.p,
      keptPi:kept.pi,
      restored,
      localKey:Object.prototype.hasOwnProperty.call(positions,id),
      hashKey:Object.prototype.hasOwnProperty.call(positions,hash)
    };
  },{kind,hash,place:places[kind]});
  return {...result,errors:errors.concat(result.errors||[])};
}

const engines=[
  ['chrome',()=>chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true}),{viewport:{width:1280,height:800}}],
  ['firefox',()=>firefox.launch({headless:true}),{viewport:{width:1280,height:800}}],
  ['webkit',()=>webkit.launch({headless:true}),{viewport:{width:1280,height:800}}],
  ['webkit-mobile',()=>webkit.launch({headless:true}),{viewport:{width:390,height:844},isMobile:true,hasTouch:true}],
  ['android-chrome',()=>chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true}),{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'}]
];
const results=[];
try{
  for(const [name,launch,options] of engines){
    const browser=await launch();
    try{
      for(const kind of ['pdf','epub','txt']){
        const page=await (await browser.newContext(options)).newPage();
        await page.goto(url);
        const result=await scenario(page,kind);
        results.push({engine:name,kind,adopted:result.adopted,keptP:result.keptP,restored:result.restored});
        assert.deepEqual(result.errors,[],name+' '+kind+' should stay quiet');
        assert.equal(result.localKey,true);
        assert.equal(result.hashKey,false,name+' '+kind+' should not key the reader by the hash');
        assert.equal(result.adopted.p,places[kind].p);
        assert.equal(result.adopted.mode,places[kind].mode);
        if(kind==='txt')assert.equal(result.adopted.pi,18);
        else assert.deepEqual(result.adopted.original,places[kind].original);
        assert.equal(result.restored.length>0,true,name+' '+kind+' should restore an open reader');
        assert.equal(result.restored[0].mode,kind==='txt'?'text':'original');
        assert.equal(result.keptP,0.91,name+' '+kind+' should keep a newer real place');
        await page.context().close();
      }
    }finally{await browser.close();}
  }
}finally{server.close();}
console.log(JSON.stringify(results,null,2));
