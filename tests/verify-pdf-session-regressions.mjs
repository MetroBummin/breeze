import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(new URL('../scripts/reader/pdf-original.js',import.meta.url),'utf8');
const scrollSource=readFileSync(new URL('../scripts/reader/reader-scroll.js',import.meta.url),'utf8');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(realRender=false){
 const gate=defer(),started=defer(),content={innerHTML:'',className:'',appendChild(){}},surfaces=[];
 const a={id:'A'},b={id:'B'},record={hash:'hash-A',blob:{arrayBuffer:async()=>new ArrayBuffer(0)}};
 let destroyed=0;
 const pdf={numPages:0,destroy(){destroyed++;},async getPage(){started.resolve();await gate.promise;return {getViewport:()=>({width:600,height:800})};}};
 const context={console,Map,Set,WeakMap,performance,setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
 readerModeChangeToken:0,originalLoadToken:1,originalSession:null,curBook:a,ensurePdfLib:async()=>{},pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},
 document:{getElementById:()=>content,addEventListener(){}},window:{addEventListener(){}},
 BreezePdfInk:{open(){}},IntersectionObserver:class{observe(){}},readerScroller:()=>({}),
 registerReaderSurface:s=>surfaces.push(s)};
 vm.createContext(context);vm.runInContext(source,context);
 if(!realRender)context.renderOriginalPdfPage=async()=>{};
 return {context,a,b,record,gate,started,content,surfaces,destroyed:()=>destroyed};
}
for(const action of ['switch','close','delete','A-B-A'])test(`delayed first page cannot publish after ${action}`,async()=>{
 const f=fixture(),job=f.context.openOriginalPdf(f.a,f.record,1);await f.started.promise;
 f.context.originalLoadToken=action==='A-B-A'?3:2;
 const expected=action==='switch'?{kind:'pdf',bookId:'B',hash:'hash-B'}:null;
 f.context.originalSession=expected;f.context.curBook=action==='switch'?f.b:action==='A-B-A'?f.a:null;
 f.content.innerHTML='current screen';f.gate.resolve();await job;
 assert.equal(f.context.originalSession,expected);assert.equal(f.content.innerHTML,'current screen');assert.equal(f.destroyed(),1);
});
test('word picking rejects a foreign page even when its page number matches',()=>{
 const f=fixture(),current={dataset:{page:'1'},isConnected:true},foreign={dataset:{page:'1'},isConnected:true,getBoundingClientRect(){throw Error('foreign geometry read');}};
 f.context.originalSession={kind:'pdf',bookId:'A',hash:'hash-A',loadToken:1,pages:[current],wordBoxes:new Map([[1,[{word:'foreign'}]]])};
 assert.equal(f.context.pdfWordAtPoint(foreign,10,10),null);
});

test('original-byte identity rejects a stale map even for the same book id',()=>{
 const f=fixture();f.context.curBook={id:'A',original:{hash:'new-file'}};
 f.context.originalSession={kind:'pdf',bookId:'A',hash:'old-file',loadToken:1};
 assert.equal(f.context.currentPdfSession(),false);
});
test('a lookup waiting for its page cannot select words after a document switch',async()=>{
 const f=fixture(),page={dataset:{page:'1'},isConnected:true};
 const session={kind:'pdf',bookId:'A',hash:'hash-A',loadToken:1,pages:[page],wordBoxes:new Map()};
 f.context.originalSession=session;f.context.pdfPageAtPoint=()=>page;
 f.context.renderOriginalPdfPage=()=>f.gate.promise;
 f.context.openPdfWord=()=>assert.fail('stale English word was presented');
 const lookup=f.context.openPdfWordAt(10,10);
 f.context.originalLoadToken=2;f.context.curBook=f.b;f.context.originalSession={kind:'pdf',bookId:'B',loadToken:2};
 f.gate.resolve();assert.equal(await lookup,false);
});
test('a delayed sentence cue cannot paint boxes from the previous document',()=>{
 const f=fixture(),page={dataset:{page:'1'},isConnected:true},box={word:'Alpha',example:'Alpha belongs to A.'};
 const session={kind:'pdf',bookId:'A',loadToken:1,pages:[page],wordBoxes:new Map([[1,[box]]])};
 f.context.originalSession=session;f.context.createReaderSentenceCue=()=>assert.fail('stale English sentence was painted');
 f.context.originalLoadToken=2;f.context.curBook=f.b;f.context.originalSession={kind:'pdf',bookId:'B',loadToken:2,pages:[],wordBoxes:new Map()};
 f.context.showPdfSentenceCue(page,[box]);
});

function preparedPageFixture(){
 const f=fixture(true),c=f.context,page={dataset:{page:'1'},isConnected:true};
 const session={kind:'pdf',bookId:'A',hash:'hash-A',loadToken:1,pages:[page],wordBoxes:new Map(),drawToken:new Map([[1,1]]),settled:new Set([1]),rendering:new Map(),paintQueue:new Map(),lastScrollAt:1000};
 Object.assign(c,{originalSession:session,originalPdfContacts:0,performance:{now:()=>1000},originalPdfPaintPaused:()=>false,
  pdfPagesInView:()=>[1],schedulePdfPaint:()=>{},renderPdfSavedWordMarkers:()=>{f.painted++;}});
 f.painted=0;f.cleaned=0;f.built=0;
 session.pdf={getPage:async()=>({getViewport:()=>({width:600,height:800}),cleanup(){f.cleaned++;}})};
 c.buildPdfWordBoxes=async()=>{f.built++;return [{word:'visible'}];};
 return {...f,c,page,session};
}
test('scrollbar movement defers automatic maps but a direct lookup prepares the visible page',async()=>{
 const {c,session,page}=preparedPageFixture();
 assert.equal(await c.prepareOriginalPdfPage(session,1,{prefetch:true}),'deferred');
 assert.equal(session.wordBoxes.size,0);
 const pending=c.renderOriginalPdfPage(session,1);
 await c.drainPdfPaint(session);await pending;
 assert.equal(session.wordBoxes.get(1)[0].word,'visible');assert.equal(page.dataset.wordCount,'1');
 assert.equal(session.paintQueue.size,0);
});
test('a stationary held finger does not block lookup preparation for long press',async()=>{
 const {c,session}=preparedPageFixture();c.originalPdfContacts=1;session.lastScrollAt=0;
 await c.prepareOriginalPdfPage(session,1,{prefetch:true});
 assert.equal(session.wordBoxes.get(1)[0].word,'visible');
});
test('deferred map rejects a document switch while its PDF page is loading',async()=>{
 const {c,session,gate}=preparedPageFixture();session.lastScrollAt=0;
 session.pdf.getPage=()=>gate.promise;
 const pending=c.prepareOriginalPdfPage(session,1,{prefetch:true});
 c.originalLoadToken=2;c.originalSession=null;
 gate.resolve({cleanup(){},getViewport(){assert.fail('stale page used');}});await pending;
 assert.equal(session.wordBoxes.size,0);
});
test('resumed scroll interrupts preparation before glyph extraction and queues one retry',async()=>{
 const {c,session,gate}=preparedPageFixture();session.lastScrollAt=0;
 session.pdf.getPage=()=>gate.promise;
 const pending=c.renderOriginalPdfPage(session,1,{prepare:true,prefetch:true});
 const running=c.drainPdfPaint(session);session.lastScrollAt=1000;
 gate.resolve({cleanup(){},getViewport(){assert.fail('scrolling page extracted');}});
 await running;await pending;
 assert.equal(session.wordBoxes.size,0);assert.equal(session.paintQueue.size,1);
 assert.equal(session.paintQueue.get(1).options.prepare,true);
});
test('PDF preparation errors resolve without an unbounded automatic retry',async()=>{
 const {c,session}=preparedPageFixture();session.lastScrollAt=0;c.console={warn(){}};
 session.pdf.getPage=async()=>{throw Error('bad PDF');};
 const pending=c.renderOriginalPdfPage(session,1,{prepare:true,prefetch:true});
 await c.drainPdfPaint(session);await pending;
 assert.equal(session.wordBoxes.size,0);assert.equal(session.paintQueue.size,0);assert.equal(session.paintActive,null);
});


function rotationAnchorFixture(){
 const box={scrollTop:2450,scrollLeft:0,clientWidth:1180,clientHeight:800,scrollHeight:4000,
  getBoundingClientRect:()=>({top:0,left:0})};
 const context={console,Math,Date,setTimeout,clearTimeout,requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){},
  document:{getElementById:id=>id==='reader-scroll'?box:null,addEventListener(){}},
  window:{addEventListener(){},ResizeObserver:null},
  originalPinchBusy:()=>false,cancelOriginalPinch(){},readerModeChangeToken:0,currentReaderMode:'original',
  originalSession:null,topInset:()=>50,
  pdfPageIndexAtY(rects,y){let i=0;while(i<rects.length&&rects[i][1]+rects[i][3]<y)i++;return i;}};
 vm.createContext(context);vm.runInContext(scrollSource,context);
 return {context,box};
}
test('tablet rotation captures the logical PDF page before width reflow changes page heights',()=>{
 const {context}=rotationAnchorFixture();
 const rects=[0,1,2,3].map(i=>[0,i*1000,700,1000]);
 const session={kind:'pdf',readDirection:'vertical',pageLayout:{rects}};
 context.originalSession=session;
 assert.deepEqual(
  JSON.parse(JSON.stringify(context.capturePdfRotationAnchor(session))),
  {kind:'pdf',page:3,y:.5}
 );
 const reflowed=[0,1,2,3,4].map(i=>[0,i*700,700,700]);
 assert.equal(context.pdfPageIndexAtY(reflowed,2500),3,'raw scrollTop would now point at page 4');
 session.readDirection='horizontal';
 assert.equal(context.capturePdfRotationAnchor(session),null,'horizontal page navigation must keep its own page owner');
});

// A scroll callback may have refreshed the geometry cache before ResizeObserver.
test('rotation uses the last settled reading point even if page layout was already rebuilt',()=>{
 const {context}=rotationAnchorFixture();
 const session={kind:'pdf',readDirection:'vertical',readingAnchor:{kind:'pdf',page:3,y:.5},
  pageLayout:{rects:[0,1,2,3,4].map(i=>[0,i*700,700,700])}};
 context.originalSession=session;
 assert.deepEqual(JSON.parse(JSON.stringify(context.capturePdfRotationAnchor(session))),
  {kind:'pdf',page:3,y:.5});
});

// A PDF word tap can be waiting for geometry when a later pinch takes over.
// Exercise the production pinch owner, async adapter and shared dispatch cleanup.
for(const ending of ['during','release','cancel','fresh-lookup'])test(`deferred word geometry cannot reopen lookup after pinch: ${ending}`,async()=>{
 const f=fixture(),c=f.context,page={dataset:{page:'1'},isConnected:true};
 const session={kind:'pdf',bookId:'A',hash:'hash-A',loadToken:1,pages:[page],wordBoxes:new Map()};
 const box={scrollTop:0,scrollLeft:0,clientWidth:800,clientHeight:900,scrollHeight:1200,getBoundingClientRect:()=>({left:0,top:0})};
 const stage={classList:{add(){},remove(){}}};let anchored=true,opened=0,closed=0;
 Object.assign(c,{originalSession:session,readerModeChangeToken:0,originalZoomBaseHeight:1200,
  readerScroller:()=>box,originalZoomLayer:()=>({style:{}}),originalZoomStage:()=>stage,
  originalZoom:()=>1,originalZoomOrigin:()=>({x:0,y:0}),layoutOriginalZoom(){},cancelGesture(){},
  setOriginalZoom(){},resharpenOriginalPages(){},saveReadingState(){},applyOriginalZoomTransform(){},
  wordSurfaceAnchored:()=>anchored,closePanel(){anchored=false;closed++;},
  countDispatch(){},gestureLog(){},pdfPageAtPoint:()=>page,pdfWordAtPoint:()=>({word:'minimum'}),
  renderOriginalPdfPage:()=>f.gate.promise,openPdfWord(){opened++;anchored=true;}});
 const pinch=readFileSync(new URL('../scripts/reader/pdf-pinch.js',import.meta.url),'utf8');
 vm.runInContext(pinch.slice(0,pinch.indexOf('(function(){')),c);
 const gesture=readFileSync(new URL('../scripts/reader/gesture.js',import.meta.url),'utf8');
 vm.runInContext(gesture.match(/function dispatchWord\([^]*?\n\}/)[0],c);
 const pending=c.openPdfWordAt(10,10);
 c.dispatchWord({surface:{openWordAt:()=>pending}},10,10);
 c.beginOriginalPinch({x:200,y:200},100,[1,2]);
 if(ending==='release')c.finishOriginalPinch();
 if(ending==='cancel'||ending==='fresh-lookup')c.cancelOriginalPinch();
 if(ending==='fresh-lookup'){
  session.wordBoxes.set(1,[{word:'fresh'}]);
  assert.equal(await c.openPdfWordAt(10,10),true);
 }
 f.gate.resolve();assert.equal(await pending,false,'old tap must lose presentation ownership');
 await Promise.resolve();
 assert.equal(opened,ending==='fresh-lookup'?1:0,'stale geometry opened lookup');
 assert.equal(closed,1,'stale dispatch dismissed a newer lookup');
 assert.equal(anchored,ending==='fresh-lookup');
});
for(const hit of [true,false])test(`uninterrupted deferred word geometry keeps normal hit/miss behavior: ${hit}`,async()=>{
 const f=fixture(),c=f.context,page={dataset:{page:'1'},isConnected:true};let opened=0;
 c.originalSession={kind:'pdf',bookId:'A',hash:'hash-A',loadToken:1,pages:[page],wordBoxes:new Map()};
 c.pdfPageAtPoint=()=>page;c.renderOriginalPdfPage=()=>f.gate.promise;
 c.pdfWordAtPoint=()=>hit?{word:'minimum'}:null;c.openPdfWord=()=>opened++;
 const pending=c.openPdfWordAt(10,10);f.gate.resolve();
 assert.equal(await pending,hit);assert.equal(opened,hit?1:0);
});
