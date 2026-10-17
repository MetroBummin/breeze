import {readFileSync} from 'node:fs';
import {Script, createContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
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

console.log('Reading place contract verified');
