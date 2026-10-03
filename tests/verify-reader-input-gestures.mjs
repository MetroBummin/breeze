/* Production navigation decisions, with deterministic contact ownership. */
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const file=readFileSync(new URL('../scripts/reader/pdf-navigation.js',import.meta.url),'utf8');
const code=file.slice(file.indexOf('let originalNavigationContact='),file.indexOf("document.addEventListener('DOMContentLoaded',()=>{"));
function fixture(){
 let opened=0,paged=0,zoom=1,busy=false,modal=false,pinch=false;
 class Element {closest(s){return s.includes('#originalwrap')||s==='.pdf-source-page'?this:null;}}
 const target=new Element(),box={scrollTop:0,scrollLeft:0,getBoundingClientRect:()=>({left:0})},session={};
 const c={Element,document:{body:{classList:{contains:()=>true}},querySelector:()=>modal,addEventListener(){}},window:{addEventListener(){}},
  activeGesture:null,currentReaderMode:'original',originalSession:session,currentPdfSession:()=>true,currentEpubNavigationSession:()=>false,
  originalZoom:()=>zoom,readerPositionPending:()=>false,BreezePdfInk:{busy:()=>busy,finger:t=>t.touchType==='direct'},
  originalPinchBusy:()=>pinch,originalPinchTouches:false,pdfNavigation:null,sentenceModalOpen:()=>modal,wordPanelOpen:()=>false,aaPopOpen:()=>false,
  sentenceWaitingActive:()=>false,readerScroller:()=>box,pdfHorizontal:()=>true,cancelGesture(){},reclaimReaderSelection(){},
  togglePdfNavigation:()=>opened++,stepPdfPage:d=>paged+=d};
 vm.createContext(c);vm.runInContext(code,c);
 const touch=(x=12,y=150,id=1,type='direct')=>({identifier:id,clientX:x,clientY:y,touchType:type,target});
 const event=(type,touches,changedTouches=touches,cancelable=true)=>({type,touches,changedTouches,cancelable,preventDefault(){this.prevented=true;}});
 const start=(p=touch())=>c.originalNavigationStart(event('touchstart',[p]));
 const move=(p=touch(100))=>c.originalNavigationMove(event('touchmove',[p]));
 const end=(p=touch(100),type='touchend',live=[])=>c.originalNavigationEnd(event(type,live,[p]));
 return {c,box,session,touch,event,start,move,end,result:()=>({opened,paged}),zoom:v=>zoom=v,busy:v=>busy=v,modal:v=>modal=v,pinch:v=>pinch=v};
}
test('edge opens once on release and never also pages; ordinary horizontal swipe pages',()=>{
 const f=fixture();f.start();assert.equal(f.move(),true);assert.deepEqual(f.result(),{opened:0,paged:0});f.end();f.end();
 assert.deepEqual(f.result(),{opened:1,paged:0});assert.equal(f.c.originalNavigationConsumes({type:'click',detail:1}),true);
 f.c.originalNavigationConsumes({type:'pointerdown'});assert.equal(f.c.originalNavigationConsumes({type:'click',detail:1}),false);
 f.start(f.touch(200));f.move(f.touch(100));f.end(f.touch(100));assert.deepEqual(f.result(),{opened:1,paged:1});
});
test('vertical, short, leftward, noncancelable and native admitted pan are never stolen',()=>{
 for(const kind of ['vertical','short','left','native','noncancelable']){
  const f=fixture();f.start();
  if(kind==='native')f.box.scrollTop=5;
  if(kind==='noncancelable')f.c.originalNavigationMove(f.event('touchmove',[f.touch(100)],undefined,false));
  else f.move(f.touch(kind==='left'?-80:kind==='short'?35:100,kind==='vertical'?300:150));
  f.end(f.touch(kind==='short'?35:100));assert.deepEqual(f.result(),{opened:0,paged:0},kind);
 }
});
test('Pencil, ink busy, zoom, pinch tail, popup, mode and session changes cannot open',()=>{
 for(const kind of ['stylus','busy','zoom','pinch','tail','modal','mode','session']){
  const f=fixture();if(kind==='busy')f.busy(true);if(kind==='zoom')f.zoom(2);if(kind==='pinch')f.pinch(true);
  if(kind==='tail')f.c.originalPinchTouches=true;if(kind==='modal')f.modal(true);
  f.start(f.touch(12,150,1,kind==='stylus'?'stylus':'direct'));f.move();
  if(kind==='mode')f.c.currentReaderMode='text';if(kind==='session')f.c.originalSession={};
  f.end();assert.deepEqual(f.result(),{opened:0,paged:0},kind);
 }
});
test('multitouch and partial cancel never admit a leftover finger; fresh contact recovers',()=>{
 const f=fixture();f.start();f.move();
 f.c.originalNavigationStart(f.event('touchstart',[f.touch(),f.touch(100,200,2)],[f.touch(100,200,2)]));
 f.end(f.touch(), 'touchcancel',[f.touch(100,200,2)]);f.move(f.touch(200,200,2));f.end(f.touch(200,200,2));
 assert.deepEqual(f.result(),{opened:0,paged:0});f.start();f.move();f.end();assert.equal(f.result().opened,1);
});
test('cancel, lost capture and resize cancellation clear a candidate; normal pointer release remains valid',()=>{
 for(const kind of ['touchcancel','lost','cancel','normal']){
  const f=fixture();f.start();f.move();
  if(kind==='lost')f.c.originalNavigationLostCapture();if(kind==='cancel')f.c.cancelOriginalNavigation();
  if(kind==='normal'){f.c.originalNavigationPointerEnd({pointerType:'touch'});f.c.originalNavigationLostCapture();}
  f.end(f.touch(100),kind==='touchcancel'?kind:'touchend');assert.equal(f.result().opened,kind==='normal'?1:0,kind);
 }
});

test('a long press already dispatched by the gesture owner cannot also open navigation',()=>{
 const f=fixture();f.c.activeGesture={dispatched:0};f.start();f.c.activeGesture.dispatched=1;
 assert.equal(f.move(),false);f.end();assert.equal(f.result().opened,0);
});
