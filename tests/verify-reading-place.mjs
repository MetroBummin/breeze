import {readFileSync} from 'node:fs';
import {Script, createContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

{
  const pdf=readFileSync(resolve(root,'scripts/reader/pdf-original.js'),'utf8');
  let top=0;
  const requested=[];
  const cover={dataset:{page:'1'},classList:{contains:()=>false},style:{},isConnected:true};
  const page={dataset:{page:'2'},classList:{contains:()=>false},style:{},isConnected:true};
  const pages=[cover,page];
  const rect=element=>{
    const own=element.dataset.breezeRatio==='own';
    const coverHeight=cover.dataset.breezeRatio==='own'?600:200;
    const height=element===cover?(own?600:200):(own?800:200);
    const at=element===cover?0:coverHeight;
    return {top:at-top,height,width:400,bottom:at-top+height};
  };
  cover.getBoundingClientRect=()=>rect(cover);
  page.getBoundingClientRect=()=>rect(page);
  const session={
    kind:'pdf',bookId:'book',hash:'h',loadToken:1,pages,deletedPages:new Set(),
    settled:new Set([1,2]),rendering:new Map(),wordBoxes:new Map([[1,[]],[2,[]]]),
    pdf:{async getPage(number){
      requested.push(number);
      const size=number===1?{width:600,height:600}:{width:400,height:800};
      return {getViewport:()=>size,cleanup(){}};
    }}
  };
  const context=createContext({
    console,Promise,Map,Set,WeakMap,Math,Number,document:{getElementById:()=>null},
    registerReaderSurface(){},
    readerScrollTop:()=>top,
    readerScrollTo(value){top=value;},
    requestAnimationFrame:fn=>{context.frames.push(fn);return context.frames.length;},
    frames:[],
    curBook:{id:'book',original:{hash:'h'}},
    currentReaderMode:'original',
    originalLoadToken:1,
    originalSession:session,
    readerModeChangeToken:1
  });
  new Script(pdf,{filename:'pdf-original.js'}).runInContext(context);
  const source={kind:'pdf',page:2,y:0.25};
  const placed=await context.restorePdfAnchor(source,40);
  assert.equal(placed,true);
  assert.deepEqual(requested,[1,2],'pages above the anchor learn their own aspect ratio');
  assert.equal(top,600-40+0.25*800,'the saved page fraction uses the real page height');
  assert.equal(context.pdfRestoreOwnsPosition(),false);

  top=180;
  session.userMovedPlace=true;
  session.pendingAnchor=null;
  const stayed=await context.restorePdfAnchor(source,40);
  assert.equal(stayed,false);
  assert.equal(top,180,'a later automatic restore leaves the page the reader moved to');
  const asked=await context.restorePdfAnchor({kind:'pdf',page:2,y:0.25},40,null,null,true);
  assert.equal(asked,true);
  assert.notEqual(top,180,'a page the reader asked for still moves');
  session.userMovedPlace=false;
  session.pendingAnchor=null;
  session.revealFrozen=false;
  session.anchorMoved=false;
  top=0;

  top=0;
  page.getBoundingClientRect=()=>({top:0,height:0,width:0,bottom:0});
  cover.getBoundingClientRect=()=>({top:0,height:0,width:0,bottom:0});
  const cold={kind:'pdf',page:2,y:0.25};
  session.pendingAnchor=null;
  const held=await context.restorePdfAnchor(cold,40);
  assert.equal(held,true);
  assert.equal(top,0,'a page with no height is not the start of the book');
  assert.equal(context.pdfRestoreOwnsPosition(),true,'a local measurement must not replace the remote page');
  session.anchorMoved=true;
  const moved=await context.restorePdfAnchor(cold,40);
  assert.equal(moved,false);
  assert.equal(top,0,'a hand scroll is left where it is');
  assert.equal(context.pdfRestoreOwnsPosition(),false);
}

{
  const state=readFileSync(resolve(root,'scripts/core/state.js'),'utf8');
  const slice=state.slice(state.indexOf('let textPendingAnchor'),state.indexOf('let appHistoryReady'));
  let top=15;
  const paragraph={
    dataset:{pi:'18'},
    textContent:'',
    getBoundingClientRect:()=>({top:0,height:0}),
    compareDocumentPosition:()=>0
  };
  const image={tagName:'IMG',complete:false,compareDocumentPosition:()=>4};
  const saved={id:'book',p:0.61,t:1000,mode:'text',pi:18,dy:12,y:900};
  const positions={book:{...saved}};
  let wrote=false;
  const frames=[];
  const context=createContext({
    console,Promise,Math,Number,Node:{DOCUMENT_POSITION_FOLLOWING:4},
    curBook:{id:'book'},positions,
    currentReaderMode:'text',
    document:{
      querySelector:()=>paragraph,
      querySelectorAll:selector=>selector==='#rtext img'?[image]:[],
      addEventListener(){},
      fonts:{status:'loaded',ready:Promise.resolve()}
    },
    readerScrollTop:()=>top,
    readerScrollTo(value){top=value;},
    updatePfill(){},
    requestAnimationFrame(fn){frames.push(fn);return frames.length;},
    readerPositionPending:()=>false,
    epubRestoreOwnsPosition:()=>false,
    pdfRestoreOwnsPosition:()=>false,
    save(){wrote=true;}
  });
  new Script(slice,{filename:'state.js'}).runInContext(context);
  assert.equal(context.restoreAnchor({pi:18,dy:12}),true);
  assert.equal(top,15,'an unfinished paragraph does not jump to its old pixel offset');
  assert.equal(context.textRestoreOwnsPosition(),true);
  context.saveReadingState();
  assert.equal(wrote,false);
  assert.equal(positions.book.pi,18,'pending text layout does not overwrite the remote paragraph');
  image.complete=true;
  paragraph.getBoundingClientRect=()=>({top:480,height:36});
  while(frames.length)frames.shift()();
  assert.equal(top,Math.round(15+480-12),'the saved paragraph is placed after the image loads');
  assert.equal(context.textRestoreOwnsPosition(),false);
  assert.equal(positions.book.pi,18);
  image.complete=false;
  image.getBoundingClientRect=()=>({top:-200,height:100});
  paragraph.getBoundingClientRect=()=>({top:480,height:36});
  top=15;
  assert.equal(context.restoreAnchor({pi:18,dy:12}),true);
  assert.equal(top,Math.round(15+480-12),'a reserved image box does not hold the saved paragraph');
  assert.equal(context.textRestoreOwnsPosition(),false);
}

{
  const pdf=readFileSync(resolve(root,'scripts/reader/pdf-original.js'),'utf8');
  const open=pdf.slice(pdf.indexOf('async function openOriginalPdf'),pdf.indexOf('async function prepareOriginalPdfPage'));
  const placeAt=open.indexOf('pdfPlaceBeforePaint');
  const observeAt=open.indexOf('new IntersectionObserver');
  const renderAt=open.lastIndexOf('renderOriginalPdfPage');
  assert.ok(placeAt>0&&placeAt<observeAt&&placeAt<renderAt,'the saved page is placed before page 1 can be observed or painted');
  const epub=readFileSync(resolve(root,'scripts/reader/epub-original.js'),'utf8');
  const epubOpen=epub.slice(epub.indexOf('async function openOriginalEpub'),epub.indexOf('/* ================= saved vocabulary'));
  assert.ok(epubOpen.indexOf('epubInitialSpine')<epubOpen.indexOf('await Promise.all'),'the saved chapter is waited on before the cover is the only ready frame');
  let top=0;
  const cover={dataset:{page:'1'},classList:{contains:()=>false},style:{},isConnected:true};
  const page={dataset:{page:'2'},classList:{contains:()=>false},style:{},isConnected:true};
  const rect=element=>{
    const height=element===cover?600:800;
    const at=element===cover?0:600;
    return {top:at-top,height,width:400,bottom:at-top+height};
  };
  cover.getBoundingClientRect=()=>rect(cover);
  page.getBoundingClientRect=()=>rect(page);
  const session={
    kind:'pdf',bookId:'book',hash:'h',loadToken:1,pages:[cover,page],
    settled:new Set([1,2]),rendering:new Map(),wordBoxes:new Map([[1,[]],[2,[]]]),
    pdf:{async getPage(number){
      const size=number===1?{width:600,height:600}:{width:400,height:800};
      return {getViewport:()=>size,cleanup(){}};
    }}
  };
  const positions={book:{mode:'original',original:{kind:'pdf',page:2,y:0.25}}};
  const context=createContext({
    console,Promise,Map,Set,WeakMap,Math,Number,Date,document:{getElementById:()=>null},
    registerReaderSurface(){},
    posOf:id=>positions[id],
    readerScrollTop:()=>top,
    readerScrollTo(value){top=value;},
    topInset:()=>30,
    requestAnimationFrame:fn=>fn,
    curBook:{id:'book',original:{hash:'h'}},
    currentReaderMode:'original',
    originalLoadToken:1,
    originalSession:session
  });
  new Script(pdf,{filename:'pdf-original.js'}).runInContext(context);
  const painted=await context.pdfPlaceBeforePaint(session,{id:'book'});
  assert.equal(painted,2);
  assert.equal(top,600-(30+10)+0.25*800,'the saved page is the first scroll, before page 1 is shown');
  assert.equal(page.dataset.breezeRatio,'own');
  assert.equal(cover.dataset.breezeRatio,'own');
}

{
  const modes=readFileSync(resolve(root,'scripts/reader/reader-modes.js'),'utf8');
  const timers=[];
  let restored=0;
  const book={id:'book'};
  const context=createContext({
    console,Promise,
    document:{addEventListener(){}},
    currentReaderMode:'original',
    readerModeChangeToken:1,
    curBook:book,
    originalSession:{userMovedPlace:true,pendingAnchor:null},
    setTimeout(fn){timers.push(fn);return timers.length;},
    suspendReaderScrollSave(){throw new Error('a hand move must not schedule another restore');},
    restoreOriginalAnchor(){restored++;return false;}
  });
  new Script(modes,{filename:'reader-modes.js'}).runInContext(context);
  context.stabilizePdfModeTarget({kind:'pdf'},{kind:'pdf',page:23,y:0.2},null,1,book);
  assert.equal(timers.length,2);
  await Promise.all(timers.map(fn=>fn()));
  assert.equal(restored,0,'the saved page is not applied again after the reader moves');
  context.originalSession.userMovedPlace=false;
  context.suspendReaderScrollSave=()=>{};
  context.restoreOriginalAnchor=()=>{restored++;return true;};
  timers.length=0;
  context.stabilizePdfModeTarget({kind:'pdf'},{kind:'pdf',page:23,y:0.2},null,1,book);
  await Promise.all(timers.splice(0).map(fn=>fn()));
  assert.equal(restored,2,'before the reader moves, the opening place can still settle');
}

{
  const pdf=readFileSync(resolve(root,'scripts/reader/pdf-original.js'),'utf8');
  const session={kind:'pdf',pendingAnchor:{source:{kind:'pdf',page:23},inset:40},anchorMoved:false,userMovedPlace:false,pages:[]};
  const listeners={};
  const box={
    addEventListener(type,fn){(listeners[type]||=[]).push(fn);},
    contains(){return true;}
  };
  let programmatic=false;
  const context=createContext({
    console,Promise,Map,Set,WeakMap,Math,Number,
    registerReaderSurface(){},
    document:{getElementById(){return null;}},
    originalSession:session,
    currentReaderMode:'original',
    readerScroller:()=>box,
    readerScrollWasProgrammatic:()=>programmatic,
    releaseSavedReadingPlace(){session.userMovedPlace=true;if(session.pendingAnchor)session.anchorMoved=true;}
  });
  new Script(pdf,{filename:'pdf-original.js'}).runInContext(context);
  context.pdfWatchAnchorInput(session);
  for(const fn of listeners.touchmove)fn();
  assert.equal(session.anchorMoved,true,'a touch during the opening restore does not fight the finger');
  assert.equal(session.userMovedPlace,false,'that touch still leaves page 23 free to settle');
  session.anchorMoved=false;
  context.noteOriginalAnchorInput({target:box});
  assert.equal(session.anchorMoved,true);
  assert.equal(session.userMovedPlace,false,'a tap is not a hand scroll');
  programmatic=true;
  for(const fn of listeners.scroll)fn();
  assert.equal(session.userMovedPlace,false,'the scroll that opens page 23 is not a hand move');
  programmatic=false;
  for(const fn of listeners.scroll)fn();
  assert.equal(session.userMovedPlace,true,'a hand scroll releases the saved page');
}

{
  const scroll=readFileSync(resolve(root,'scripts/reader/reader-scroll.js'),'utf8');
  let top=0;
  const listeners=[];
  const box={
    clientHeight:800,
    get scrollTop(){return top;},
    set scrollTop(value){top=value;for(const fn of listeners)fn();},
    addEventListener(type,fn){if(type==='scroll')listeners.push(fn);}
  };
  let during=null;
  const context=createContext({
    console,Math,
    window:{scrollTo(){},scrollY:0,innerHeight:800},
    document:{
      addEventListener(){},
      getElementById(id){return id==='reader-scroll'?box:null;},
      body:{classList:{contains(){return false;}}}
    }
  });
  new Script(scroll,{filename:'reader-scroll.js'}).runInContext(context);
  box.addEventListener('scroll',()=>{during=context.readerScrollWasProgrammatic();});
  context.readerScrollTo(900);
  assert.equal(during,true,'opening page 23 does not look like a hand scroll');
  assert.equal(context.readerScrollWasProgrammatic(),true);
  box.scrollTop=40;
  assert.equal(during,false,'a later hand scroll is distinguishable');
}

{
  const pdf=readFileSync(resolve(root,'scripts/reader/pdf-original.js'),'utf8');
  const cloud=readFileSync(resolve(root,'scripts/library/book-cloud.js'),'utf8');
  const hash='ab'.repeat(32);
  const bookId='file-'+hash.slice(0,32);
  const user='11111111-1111-1111-1111-111111111111';
  const book={id:bookId,kind:'pdf',sourceHash:hash,original:{hash},bookCloudLink:{on:true,tombstone:''}};
  const pageCount=30,target=23,earlier=14;
  const intrinsic=number=>number===1?{width:600,height:600}:{width:595,height:842};
  let view=null;
  let remote=null;
  let moves=0;
  let landing=null;
  const scrolls=[];
  const frames=[];
  const memory=new Map();
  const positions={};
  const session={
    kind:'pdf',bookId,hash,loadToken:1,pages:[],deletedPages:new Set(),
    settled:new Set(),rendering:new Map(),wordBoxes:new Map(),
    pdf:{async getPage(number){const size=intrinsic(number);return {getViewport:()=>size,cleanup(){}};}},
    userMovedPlace:false,pendingAnchor:null,anchorMoved:false
  };
  const makeView=(width,height)=>{
    let top=0;
    const listeners={};
    const pages=[];
    let cursor=0;
    for(let number=1;number<=pageCount;number++){
      const size=intrinsic(number);
      const pageHeight=width*size.height/size.width;
      const element={
        dataset:{page:String(number)},classList:{contains:()=>false},style:{},isConnected:true,
        documentTop:cursor,pageHeight
      };
      element.getBoundingClientRect=()=>({
        top:element.documentTop-top,left:0,width,height:element.pageHeight,
        bottom:element.documentTop-top+element.pageHeight,right:width
      });
      cursor+=pageHeight;
      pages.push(element);
    }
    const contentHeight=cursor;
    const scroller={
      clientWidth:width,clientHeight:height,scrollLeft:0,
      get scrollTop(){return top;},set scrollTop(value){top=value;},
      get scrollHeight(){return contentHeight;},
      getBoundingClientRect:()=>({top:0,left:0,width,height,bottom:height,right:width}),
      addEventListener(type,fn){(listeners[type]||=[]).push(fn);},
      contains:()=>true
    };
    return {width,height,pages,listeners,scroller,get top(){return top;},set top(value){top=value;}};
  };
  const context=createContext({
    console,Promise,Map,Set,WeakMap,Math,Number,Date,JSON,Object,Array,String,Error,
    crypto:webcrypto,setTimeout,clearTimeout,
    document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({append(){},setAttribute(){},className:''})},
    registerReaderSurface(){},
    window:{BREEZE_CONFIG:{BOOK_CLOUD:true,SB_URL:'https://example.test',SB_KEY:'anon'}},
    localStorage:{
      getItem:key=>memory.has(key)?memory.get(key):null,
      setItem:(key,value)=>memory.set(key,String(value)),
      removeItem:key=>memory.delete(key)
    },
    navigator:{onLine:true},
    sbUser:{id:user},
    sb:{
      auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},
      from(table){return {select:async()=>table==='positions'
        ?{data:[{book_id:hash,data:{revision:'rev-phone',locator:remote}}]}
        :{data:[]}};},
      rpc:async()=>({data:{ok:true}})
    },
    books:[book],positions,curBook:book,LS_POS:'breeze.pos',
    save(){},toast(){},bookPut:async()=>{},
    readerScrollTop:()=>view.top,
    readerScrollTo(value){scrolls.push(value);view.top=value;},
    readerScroller:()=>view.scroller,
    topInset:()=>47,
    originalZoom:()=>1,
    requestAnimationFrame(fn){frames.push(fn);return frames.length;},
    posOf:id=>positions[id]||{y:0,p:0,t:0,mode:'text',original:null},
    renderOriginalPdfPage:async()=>{},
    currentReaderMode:'original',originalLoadToken:1,originalSession:session,readerModeChangeToken:1
  });
  new Script(pdf,{filename:'pdf-original.js'}).runInContext(context);
  new Script(cloud,{filename:'book-cloud.js'}).runInContext(context);
  context.releaseSavedReadingPlace=()=>{session.userMovedPlace=true;if(session.pendingAnchor)session.anchorMoved=true;};
  context.savedPlaceReleased=()=>!!session.userMovedPlace;
  context.readerScrollWasProgrammatic=()=>false;
  context.switchReaderMode=()=>{moves++;landing=context.pdfPlaceBeforePaint(session,book);return landing;};
  const placeAt=inset=>{
    session.pageLayout=null;
    const layout=context.pdfPageLayout(session);
    const y=view.top+inset;
    const index=context.pdfPageIndexAtY(layout.rects,y);
    const rect=layout.rects[index];
    return {page:index+1,y:(y-rect[1])/rect[3]};
  };
  view=makeView(390,844);
  context.originalZoomObservedWidth=390;
  context.originalZoomObservedHeight=844;
  session.pages=view.pages;
  const phonePage=view.pages[target-1];
  view.top=phonePage.documentTop+0.42*phonePage.pageHeight-context.topInset();
  const captured=context.capturePdfAnchor(context.topInset());
  assert.equal(captured.page,target,'the phone is reading page N');
  assert.ok(Math.abs(captured.y-0.42)<1e-9,'the phone stores a page fraction, not a pixel');
  const phoneTop=view.top;
  const phonePlace=stamp=>remote={p:(target-1+captured.y)/pageCount,t:stamp,mode:'original',original:{kind:'pdf',page:captured.page,y:captured.y}};
  const landed=[];
  for(const [width,height] of [[1024,1366],[820,1180]]){
    view=makeView(width,height);
    context.originalZoomObservedWidth=width;
    context.originalZoomObservedHeight=height;
    session.pages=view.pages;
    session.pageLayout=null;
    session.userMovedPlace=false;
    session.pendingAnchor=null;
    session.anchorMoved=false;
    session.anchorWatch=false;
    session.anchorTimer=0;
    session.revealFrozen=false;
    positions[bookId]={p:0,t:1000,mode:'original',original:{kind:'pdf',page:1,y:0}};
    scrolls.length=0;frames.length=0;moves=0;landing=null;
    context.resetBookCloudSession();
    phonePlace(5000);
    await context.bookCloudRefresh(context.bookCloudSession());
    await landing;
    assert.equal(moves,1,width+'x'+height+' applies the phone page once');
    assert.equal(scrolls.length,1,width+'x'+height+' scrolls to that page once');
    const shown=placeAt(context.topInset()+10);
    assert.equal(shown.page,target,width+'x'+height+' opens on the phone page');
    assert.ok(Math.abs(shown.y-captured.y)<1e-6,width+'x'+height+' keeps the phone fraction');
    assert.notEqual(view.top,phoneTop,width+'x'+height+' uses its own page height');
    landed.push(view.top);
    const earlierPage=view.pages[earlier-1];
    view.top=earlierPage.documentTop+0.2*earlierPage.pageHeight-context.topInset();
    context.pdfWatchAnchorInput(session);
    for(const fn of view.listeners.scroll)fn();
    assert.equal(session.userMovedPlace,true);
    const stayed=view.top;
    assert.equal(placeAt(context.topInset()).page,earlier);
    positions[bookId]={p:0.4,t:6000,mode:'original',original:{kind:'pdf',page:earlier,y:0.2}};
    assert.equal(await context.restorePdfAnchor(captured,context.topInset()+10),false);
    session.pendingAnchor={source:captured,inset:context.topInset()+10};
    session.anchorMoved=false;
    context.pdfScheduleAnchor(session);
    while(frames.length)await frames.shift()();
    phonePlace(9000);
    await context.bookCloudRefresh(context.bookCloudSession());
    phonePlace(15000);
    await context.bookCloudRefresh(context.bookCloudSession());
    if(landing)await landing;
    assert.equal(moves,1,width+'x'+height+' does not reopen for a newer stamp of page N');
    assert.equal(scrolls.length,1,width+'x'+height+' does not scroll back to page N');
    assert.equal(view.top,stayed);
    assert.equal(placeAt(context.topInset()).page,earlier);
    assert.equal(positions[bookId].original.page,earlier);
    context.bookCloudQueuePosition(book);
    const box=context.bookCloudReadOutbox(user);
    assert.equal(box.positions[hash].locator.original.page,earlier,width+'x'+height+' sends the page it moved to');
  }
  assert.notEqual(landed[0],landed[1],'each tablet width lands with its own scroll');

  view=makeView(1024,1366);
  context.originalZoomObservedWidth=1024;
  context.originalZoomObservedHeight=1366;
  session.pages=view.pages;
  session.pageLayout=null;
  session.userMovedPlace=false;
  session.pendingAnchor=null;
  session.anchorMoved=false;
  session.anchorWatch=false;
  const tabletPage=view.pages[target-1];
  view.top=tabletPage.documentTop+0.42*tabletPage.pageHeight-context.topInset();
  const fromTablet=context.capturePdfAnchor(context.topInset());
  assert.equal(fromTablet.page,target,'the tablet is reading page N');
  view=makeView(390,844);
  context.originalZoomObservedWidth=390;
  context.originalZoomObservedHeight=844;
  session.pages=view.pages;
  session.pageLayout=null;
  session.userMovedPlace=false;
  session.pendingAnchor=null;
  session.anchorMoved=false;
  session.anchorWatch=false;
  session.anchorTimer=0;
  session.revealFrozen=false;
  positions[bookId]={p:0,t:1000,mode:'original',original:{kind:'pdf',page:1,y:0}};
  scrolls.length=0;frames.length=0;moves=0;landing=null;
  context.resetBookCloudSession();
  remote={p:0.7,t:5000,mode:'original',original:{kind:'pdf',page:fromTablet.page,y:fromTablet.y}};
  await context.bookCloudRefresh(context.bookCloudSession());
  await landing;
  assert.equal(moves,1,'the phone applies the tablet page once');
  assert.equal(scrolls.length,1,'the phone scrolls to that page once');
  assert.equal(placeAt(context.topInset()+10).page,target);
  const phoneEarlier=view.pages[earlier-1];
  view.top=phoneEarlier.documentTop+0.2*phoneEarlier.pageHeight-context.topInset();
  context.pdfWatchAnchorInput(session);
  for(const fn of view.listeners.scroll)fn();
  const phoneHeld=view.top;
  positions[bookId]={p:0.3,t:7000,mode:'original',original:{kind:'pdf',page:earlier,y:0.2}};
  remote={p:0.7,t:11000,mode:'original',original:fromTablet};
  await context.bookCloudRefresh(context.bookCloudSession());
  remote={p:0.7,t:16000,mode:'original',original:fromTablet};
  await context.bookCloudRefresh(context.bookCloudSession());
  if(landing)await landing;
  assert.equal(moves,1,'tablet stamps of page N do not reopen the phone');
  assert.equal(scrolls.length,1);
  assert.equal(view.top,phoneHeld);

  positions[bookId]={p:0.62,t:5000,mode:'original',original:{kind:'pdf',page:target,y:fromTablet.y}};
  remote={p:0.4,t:9000,mode:'original',original:{kind:'pdf',page:earlier,y:0.2}};
  session.userMovedPlace=false;
  session.pendingAnchor=null;
  session.anchorMoved=false;
  session.pageLayout=null;
  context.resetBookCloudSession();
  await context.bookCloudPositionBeforeOpen(book);
  assert.equal(positions[bookId].original.page,earlier,'the return open copies the newer page before paint');
  view.top=0;
  scrolls.length=0;moves=0;landing=null;
  assert.equal(await context.pdfPlaceBeforePaint(session,book),earlier);
  assert.equal(scrolls.length,1,'the return open paints the newer page once');
  assert.equal(placeAt(context.topInset()+10).page,earlier);
  await context.bookCloudRefresh(context.bookCloudSession());
  if(landing)await landing;
  assert.equal(moves,0,'a later refresh does not scroll again');
  assert.equal(scrolls.length,1);
  assert.equal(placeAt(context.topInset()+10).page,earlier);
}

console.log('Reading place contract verified');
