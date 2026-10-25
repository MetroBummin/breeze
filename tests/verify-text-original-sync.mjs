import {readFileSync} from 'node:fs';
import {Script, createContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

function extractFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  if(start<0) throw new Error(name);
  let depth=0,seen=false;
  for(let index=source.indexOf('{',start); index<source.length; index++){
    if(source[index]==='{'){ depth++; seen=true; }
    else if(source[index]==='}'){ depth--; if(seen&&depth===0) return source.slice(start,index+1); }
  }
  throw new Error(name);
}

const stateSource=readFileSync(resolve(root,'scripts/core/state.js'),'utf8');
const syncSource=readFileSync(resolve(root,'scripts/sync/sync.js'),'utf8');
const sessionSource=readFileSync(resolve(root,'scripts/reader/original-session.js'),'utf8');
const modesSource=readFileSync(resolve(root,'scripts/reader/reader-modes.js'),'utf8');
const epubSource=readFileSync(resolve(root,'scripts/reader/epub-original.js'),'utf8');
const pdfSource=readFileSync(resolve(root,'scripts/reader/pdf-original.js'),'utf8');

const epubMap=Array.from({length:50},(_,index)=>({
  href:`c${Math.floor(index/10)}.xhtml`, spine:Math.floor(index/10), element:index%10
}));
const pdfMap=Array.from({length:40},(_,index)=>({page:Math.floor(index/5)+1, y:(index%5)/5}));

function textSave(book,position,pi){
  const positions={book:{...position}};
  const context=createContext({
    curBook:book, positions, LS_POS:'pos', currentReaderMode:'text',
    readerPositionPending:()=>false,
    epubRestoreOwnsPosition:()=>false,
    pdfRestoreOwnsPosition:()=>false,
    textRestoreOwnsPosition:()=>false,
    captureAnchor:()=>({pi,dy:4}),
    readerScrollTop:()=>1200,
    textProgressForBook:()=>0.8,
    readerProgressAtEnd:value=>value,
    posOf:id=>positions[id],
    save(){},
    queueReadingProgressSync(){}
  });
  new Script([
    extractFunction(syncSource,'sameProgressLocation'),
    extractFunction(syncSource,'readingOriginal'),
    extractFunction(syncSource,'safePosition'),
    extractFunction(sessionSource,'sourceAnchorForParagraph'),
    extractFunction(sessionSource,'paragraphForSource'),
    extractFunction(stateSource,'saveReadingState')
  ].join('\n'),{filename:'text-original-sync.js'}).runInContext(context);
  context.saveReadingState();
  return positions.book.original;
}

{
  const book={id:'book',sourceMap:epubMap};
  const moved=textSave(book,{p:0.2,t:10,mode:'text',pi:12,dy:1,original:{
    kind:'epub',href:'c1.xhtml',spine:1,element:2,char:8}},40);
  assert.equal(moved.spine,4,'text past chapter 1 stores the later EPUB spine');
  assert.equal(moved.element,0);
  assert.equal(moved.char,undefined,'a later paragraph does not keep the old character offset');
  const same=textSave(book,{p:0.2,t:10,mode:'text',pi:12,dy:1,original:{
    kind:'epub',href:'c1.xhtml',spine:1,element:2,char:8}},12);
  assert.equal(same.spine,1);
  assert.equal(same.char,8,'the same EPUB paragraph keeps its character offset');
}

{
  const book={id:'book',sourceMap:pdfMap};
  const moved=textSave(book,{p:0.2,t:10,mode:'text',pi:7,dy:1,original:{kind:'pdf',page:2,y:0.4}},30);
  assert.equal(moved.page,7,'text past the old PDF page stores the later page');
  assert.equal(moved.y,0);
  const same=textSave(book,{p:0.2,t:10,mode:'text',pi:7,dy:1,original:{kind:'pdf',page:2,y:0.4}},7);
  assert.equal(same.page,2);
  assert.equal(same.y,0.4,'the same PDF paragraph keeps its page fraction');
}

{
  assert.match(modesSource,/if\(mode==='original'\) beginOriginalModeRestore\(originalSession\);/);
  const session={userMovedPlace:true};
  const context=createContext({session});
  new Script(extractFunction(modesSource,'beginOriginalModeRestore')+'\nbeginOriginalModeRestore(session);',
    {filename:'begin-original.js'}).runInContext(context);
  assert.equal(session.userMovedPlace,false,'a mode switch clears the previous hand-move veto');
}

{
  let top=0;
  const element={textContent:'later',getBoundingClientRect:()=>({top:20,height:18})};
  const frameAt=index=>({
    contentDocument:{querySelector:()=>element},
    getBoundingClientRect:()=>({top:index*1000})
  });
  const frames=[frameAt(0),frameAt(1)];
  const loaded=[];
  const context=createContext({
    console,Promise,Map,Set,WeakMap,RegExp,String,Number,Math,Date,
    Blob:globalThis.Blob,URL:globalThis.URL,
    document:{
      getElementById:()=>({clientWidth:390}),
      querySelectorAll:()=>[]
    },
    window:{innerWidth:390,innerHeight:720,matchMedia:()=>({matches:false})},
    readerViewHeight:()=>720,
    readerScrollTop:()=>top,
    readerScrollTo(value){top=value;},
    topInset:()=>0,
    setInterval:()=>1,
    clearInterval(){},
    registerReaderSurface(){},
    currentReaderMode:'original',
    originalSession:{
      kind:'epub',
      viewport:{width:390,height:720},
      viewportMedia:[],
      frameMeta:[],
      frames,
      archive:{spine:Array.from({length:6},(_,index)=>({path:`c${index}.xhtml`}))},
      async ensureChapter(index){
        loaded.push(index);
        frames[index]=frameAt(index);
      }
    }
  });
  new Script(epubSource+'\n;globalThis.__sync={epubSpineForSource,ensureEpubChaptersThrough,restoreEpubAnchor};',
    {filename:'epub-original.js'}).runInContext(context);
  const source={kind:'epub',href:'c4.xhtml',spine:4,element:0};
  assert.equal(context.__sync.epubSpineForSource(source),4,
    'a chapter that is not open yet is not clamped back to the loaded chapter');
  const placed=await context.__sync.restoreEpubAnchor(source,10);
  assert.deepEqual(loaded,[2,3,4],'restore opens every missing chapter through the text position');
  assert.equal(placed,true);
  assert.equal(top,4000+20-10,'EPUB restore lands on the later chapter, not the previously loaded one');
}

{
  let top=180;
  const cover={dataset:{page:'1'},classList:{contains:()=>false},style:{},isConnected:true};
  const page={dataset:{page:'7'},classList:{contains:()=>false},style:{},isConnected:true};
  const rect=element=>{
    const height=element===cover?400:500;
    const at=element===cover?0:2400;
    return {top:at-top,height,width:400,bottom:at-top+height};
  };
  cover.getBoundingClientRect=()=>rect(cover);
  page.getBoundingClientRect=()=>rect(page);
  const session={
    kind:'pdf',bookId:'book',hash:'h',loadToken:1,pages:[cover,,,,,,page],
    userMovedPlace:true,deletedPages:new Set(),settled:new Set([1,7]),
    rendering:new Map([[7,Promise.resolve()]]),wordBoxes:new Map([[7,[]]]),
    pdf:{async getPage(number){
      const size=number===1?{width:400,height:400}:{width:400,height:500};
      return {getViewport:()=>size,cleanup(){}};
    }}
  };
  const context=createContext({
    console,Promise,Map,Set,WeakMap,Math,Number,document:{getElementById:()=>null},
    registerReaderSurface(){},
    readerScrollTop:()=>top,
    readerScrollTo(value){top=value;},
    requestAnimationFrame(){return 0;},
    curBook:{id:'book',original:{hash:'h'}},
    originalZoom:()=>1,
    currentReaderMode:'original',
    originalLoadToken:1,
    originalSession:session,
    readerModeChangeToken:1
  });
  new Script(pdfSource,{filename:'pdf-original.js'}).runInContext(context);
  const source={kind:'pdf',page:7,y:0};
  assert.equal(await context.restorePdfAnchor(source,40),false);
  assert.equal(top,180,'the stale hand-move flag still blocks an ordinary restore');
  const modes=createContext({session});
  new Script(extractFunction(modesSource,'beginOriginalModeRestore')+'\nbeginOriginalModeRestore(session);',
    {filename:'begin-original.js'}).runInContext(modes);
  session.pendingAnchor=null;
  session.anchorMoved=false;
  session.revealFrozen=false;
  assert.equal(await context.restorePdfAnchor(source,40),true);
  assert.notEqual(top,180,'after a mode switch the PDF lands on the text position');
}

console.log('Text to original position sync verified');
