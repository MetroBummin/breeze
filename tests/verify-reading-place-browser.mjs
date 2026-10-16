import assert from 'node:assert/strict';
import http from 'node:http';
import {createReadStream, readFileSync} from 'node:fs';
import {chromium,firefox,webkit} from 'playwright';

const root=new URL('..',import.meta.url);
const server=http.createServer((req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(path==='/hang')return;
  if(path==='/'){
    res.setHeader('content-type','text/html; charset=utf-8');
    res.end(`<!doctype html><title>reading place</title>
      <div id="scroller" style="height:600px;overflow:auto"><div id="original-content"></div><div id="rtext"></div></div>
      <script>
        function registerReaderSurface(){}
        function readerScroller(){return document.getElementById('scroller');}
        function readerScrollTop(){return readerScroller().scrollTop;}
        function readerScrollTo(value){readerScroller().scrollTop=value;}
        function updatePfill(){}
        var originalSession=null,curBook=null,currentReaderMode='text',originalLoadToken=1,readerModeChangeToken=1;
      </script>
      <script src="/scripts/reader/pdf-original.js"></script>
      <script src="/scripts/reader/epub-original.js"></script>`);
    return;
  }
  if(!/^\/scripts\/(reader\/(?:pdf-original|epub-original)|core\/state)\.js$/.test(path)){
    res.statusCode=404;res.end();return;
  }
  res.setHeader('content-type','text/javascript; charset=utf-8');
  createReadStream(new URL('.'+path,root)).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;

async function scenario(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error&&error.message||error)));
  page.on('console',message=>{
    if(message.type()==='error'&&!/Failed to load resource/.test(message.text()))errors.push(message.text());
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  const state=readFileSync(new URL('../scripts/core/state.js',import.meta.url),'utf8');
  const slice=state.slice(state.indexOf('let textPendingAnchor'),state.indexOf('let appHistoryReady'));
  await page.addScriptTag({content:slice});
  const result=await page.evaluate(async()=>{
    const scroller=document.getElementById('scroller');
    const filler=document.createElement('div');
    filler.style.height='4000px';
    scroller.appendChild(filler);
    const pdf=await (async()=>{
      window.renderOriginalPdfPage=async()=>{};
      const content=document.getElementById('original-content');
      content.replaceChildren();
      const make=number=>{
        const article=document.createElement('article');
        article.dataset.page=String(number);
        article.style.display='block';
        article.style.width='400px';
        article.style.aspectRatio='2';
        content.appendChild(article);
        return article;
      };
      const cover=make(1),chapter=make(2);
      const session={
        kind:'pdf',bookId:'book',hash:'h',loadToken:1,pages:[cover,chapter],
        settled:new Set([1,2]),rendering:new Map(),wordBoxes:new Map(),deletedPages:new Set(),
        pdf:{async getPage(number){
          const size=number===1?{width:600,height:300}:{width:400,height:800};
          return {getViewport:()=>size,cleanup(){}};
        }}
      };
      curBook={id:'book',original:{hash:'h'}};
      currentReaderMode='original';
      originalLoadToken=1;
      originalSession=session;
      readerScrollTo(0);
      const cold=chapter.getBoundingClientRect.bind(chapter);
      chapter.getBoundingClientRect=()=>({top:0,height:0,width:0,bottom:0,left:0,right:0,x:0,y:0});
      const held=await restorePdfAnchor({kind:'pdf',page:2,y:0.25},40);
      const heldTop=readerScrollTop();
      const owns=pdfRestoreOwnsPosition();
      chapter.getBoundingClientRect=cold;
      session.pendingAnchor=null;
      session.anchorMoved=false;
      session.anchorTries=99;
      const placed=await restorePdfAnchor({kind:'pdf',page:2,y:0.25},40);
      return {held,heldTop,owns,placed,top:readerScrollTop(),ratio:chapter.dataset.breezeRatio,cover:cover.dataset.breezeRatio};
    })();
    const epub=(()=>{
      currentReaderMode='original';
      const element={textContent:'abcdefghijklmnopqrstuvwxyz',getBoundingClientRect:()=>({top:0,height:0})};
      const frame={contentDocument:{querySelector:()=>element},getBoundingClientRect:()=>({top:500})};
      originalSession={kind:'epub',frames:[,,,,frame],frameMeta:[{stable:true},{stable:true},{stable:true},{stable:true},{stable:false}],
        pendingAnchor:{source:{kind:'epub',href:'ch3.xhtml',spine:4,element:4,char:12},inset:40,spine:4,appliedTop:null},anchorMoved:false};
      readerScrollTo(20);
      reapplyEpubAnchorIfPending(originalSession,4);
      const heldTop=readerScrollTop();
      const owns=epubRestoreOwnsPosition();
      element.getBoundingClientRect=()=>({top:180,height:40});
      originalSession.frameMeta[4].stable=true;
      window.domRangeForOffsets=()=>({getClientRects:()=>[{top:240,height:16}]});
      readerScrollTo(100);
      reapplyEpubAnchorIfPending(originalSession,4);
      return {heldTop,owns,top:readerScrollTop(),pending:originalSession.pendingAnchor};
    })();
    const txt=await (async()=>{
      currentReaderMode='text';
      const host=document.getElementById('rtext');
      host.replaceChildren();
      const image=document.createElement('img');
      image.alt='';
      image.src='/hang';
      const paragraph=document.createElement('p');
      paragraph.dataset.pi='18';
      paragraph.style.margin='0';
      paragraph.style.height='0';
      paragraph.style.overflow='hidden';
      host.append(image,paragraph);
      readerScrollTo(15);
      const held=restoreAnchor({pi:18,dy:12});
      const heldTop=readerScrollTop();
      const owns=textRestoreOwnsPosition();
      paragraph.style.height='36px';
      paragraph.textContent='A saved paragraph.';
      image.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(textRestoreOwnsPosition())restoreAnchor({pi:18,dy:12});
      return {held,heldTop,owns,top:readerScrollTop(),pending:textRestoreOwnsPosition()};
    })();
    return {pdf,epub,txt};
  });
  return {...result,errors};
}

const engines=(process.env.PLACE_ENGINES||'chrome,firefox,webkit,webkit-mobile,android-chrome').split(',');
const allEngines=[
  ['chrome',()=>chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true}),{viewport:{width:1280,height:800}}],
  ['firefox',()=>firefox.launch({headless:true}),{viewport:{width:1280,height:800}}],
  ['webkit',()=>webkit.launch({headless:true}),{viewport:{width:1280,height:800}}],
  ['webkit-mobile',()=>webkit.launch({headless:true}),{viewport:{width:390,height:844},isMobile:true,hasTouch:true}],
  ['android-chrome',()=>chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true}),{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'}]
];
const results=[];
try{
  for(const [name,launch,options] of allEngines.filter(item=>engines.includes(item[0]))){
    const browser=await launch();
    try{
      const page=await (await browser.newContext(options)).newPage();
      const result=await scenario(page);
      results.push({engine:name,pdf:result.pdf,epub:result.epub,txt:result.txt,errors:result.errors});
      assert.deepEqual(result.errors,[],name+' should stay quiet');
      assert.equal(result.pdf.held,true,name+' pdf');
      assert.equal(result.pdf.heldTop,0,name+' pdf must not treat an unlaid page as the start');
      assert.equal(result.pdf.owns,true,name+' pdf');
      assert.equal(result.pdf.placed,true,name+' pdf');
      assert.equal(result.pdf.ratio,'own',name+' pdf target page');
      assert.equal(result.pdf.cover,'own',name+' pdf pages above the anchor');
      assert.ok(result.pdf.top>40,name+' pdf scroll '+result.pdf.top);
      assert.equal(result.epub.heldTop,20,name+' epub');
      assert.equal(result.epub.owns,true,name+' epub');
      assert.equal(result.epub.top,100+500+240-40,name+' epub character offset');
      assert.equal(result.epub.pending,null,name+' epub');
      assert.equal(result.txt.held,true,name+' txt');
      assert.equal(result.txt.heldTop,15,name+' txt must not jump before the paragraph has height');
      assert.equal(result.txt.owns,true,name+' txt');
      assert.equal(result.txt.pending,false,name+' txt');
      assert.ok(result.txt.top!==15,name+' txt should move to the saved paragraph, top='+result.txt.top);
      await page.context().close();
    }finally{await browser.close();}
  }
}finally{server.close();}
console.log(JSON.stringify(results,null,2));
