import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium,firefox,webkit} from 'playwright';

const cloud=readFileSync(new URL('../scripts/library/book-cloud.js',import.meta.url));
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/book-cloud.js')){
    res.setHeader('content-type','text/javascript');
    res.end(cloud);
    return;
  }
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end('<!doctype html><title>book cloud</title><script src="/book-cloud.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const hash='ab'.repeat(32);

async function scenario(page,mode){
  return page.evaluate(async({mode,hash})=>{
    const bytes=new Uint8Array([9,8,7,6,5]);
    window.BREEZE_CONFIG={BOOK_CLOUD:true,SB_URL:'https://example.test',SB_KEY:'anon'};
    books=[];positions={};sbUser={id:'11111111-1111-1111-1111-111111111111'};
    window.__applied=null;window.__opened='';
    const fetches=[];
    sb={auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},from(){return {select:async()=>({data:[]})};}};
    bookCloudCatalog=[{book_id:hash,title:'Sample',author:'Shelf',kind:'epub',status:'ready',byte_size:bytes.byteLength,tombstone:''}];
    bookCloudPost=async()=>({ok:true,url:'https://signed.example/get'});
    window.fetch=async(request,init)=>{fetches.push(init&&init.headers||{});return {ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(0)};};
    rawFileHash=async()=>hash;
    prepareImportedFile=async()=>({id:'saved',title:'Sample',kind:'epub',hash});
    applyPreparedBook=async book=>{window.__applied=book;};
    openBook=async book=>{window.__opened=book.id;};
    window.el=(tag,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;return node;};
    window.fillCard=(card,map)=>{for(const [sel,text] of Object.entries(map))card.querySelector(sel).textContent=text;};
    const gib=1024*1024*1024;
    if(mode!=='private-live'){
      const quota=mode==='incognito'?9*gib:mode==='tight'||mode==='manual'?1024*1024:20*gib;
      const storage={estimate:async()=>({quota,usage:0}),getDirectory:async()=>({})};
      Object.defineProperty(navigator,'storage',{configurable:true,get:()=>storage});
    }
    const type=mode==='cellular'||mode==='manual'?'cellular':'wifi';
    Object.defineProperty(navigator,'connection',{configurable:true,get:()=>({type,saveData:false,effectiveType:'4g',addEventListener(){}})});
    if(mode==='manual')await bookCloudDownload({bookId:hash,title:'Sample',kind:'epub',size:bytes.byteLength});
    else await bookCloudPullReady();
    const card=bookCloudCard(bookCloudLibraryRows()[0]||{bookId:hash,title:'Sample',author:'Shelf',kind:'epub'});
    return {
      fetched:fetches.length,
      opened:window.__opened,
      linked:!!(window.__applied&&window.__applied.bookCloudLink&&window.__applied.bookCloudLink.on),
      rows:bookCloudLibraryRows().length,
      label:card.querySelector('.getbtn').textContent
    };
  },{mode,hash});
}

const engines=[
  ['chrome',()=>chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true}),{viewport:{width:1280,height:800}}],
  ['firefox',()=>firefox.launch({headless:true}),{viewport:{width:1280,height:800}}],
  ['webkit',()=>webkit.launch({headless:true}),{viewport:{width:1280,height:800}}],
  ['webkit-mobile',()=>webkit.launch({headless:true}),{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]
];
const results=[];
try{
  for(const [name,launch,options] of engines){
    const browser=await launch();
    try{
      for(const mode of ['wifi','cellular','tight','incognito','manual']){
        const page=await (await browser.newContext(options)).newPage();
        await page.goto(url);
        const result=await scenario(page,mode);
        results.push({engine:name,mode,...result});
        if(mode==='wifi'){
          assert.equal(result.fetched,1,name+' wifi should fetch');
          assert.equal(result.opened,'',name+' wifi should stay in the background');
          assert.equal(result.linked,true,name+' wifi should link the saved book');
          assert.equal(result.rows,0,name+' wifi should leave the shelf without a download card');
        }else if(mode==='manual'){
          assert.equal(result.fetched,1,name+' manual should fetch on cellular');
          assert.equal(result.opened,'saved',name+' manual should open the book');
          assert.equal(result.label,'받아서 이어 읽기');
        }else{
          assert.equal(result.fetched,0,name+' '+mode+' should keep the card');
          assert.equal(result.rows,1,name+' '+mode+' should keep the ready row');
          assert.equal(result.label,'받아서 이어 읽기');
        }
        await page.context().close();
      }
    }finally{await browser.close();}
  }
  const browser=await firefox.launch({headless:true,firefoxUserPrefs:{'browser.privatebrowsing.autostart':true}});
  try{
    const page=await (await browser.newContext()).newPage();
    await page.goto(url);
    const result=await scenario(page,'private-live');
    results.push({engine:'firefox-private',mode:'private-live',...result});
    assert.equal(result.fetched,0,'Firefox private mode should not auto-download');
    assert.equal(result.rows,1);
    assert.equal(result.label,'받아서 이어 읽기');
  }finally{await browser.close();}
}finally{server.close();}
console.log(JSON.stringify(results,null,2));
