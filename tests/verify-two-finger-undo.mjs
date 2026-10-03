import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../scripts/reader/pdf-pinch.js',import.meta.url),'utf8');
function fixture(){
 let now=0,writing=true,busy=false,modal=false;
 const box={scrollLeft:0,scrollTop:0,clientWidth:820,clientHeight:1180};
 const c={performance:{now:()=>now},studyPrefs:{twoFingerUndo:true},BreezePdfInk:{writing:()=>writing,busy:()=>busy},
  readerPositionPending:()=>false,document:{hidden:false,querySelector:()=>modal},pdfNavigation:null,
  sentenceModalOpen:()=>modal,wordPanelOpen:()=>false,wordPeekOpen:()=>false,aaPopOpen:()=>false,
  activeGesture:null,readerScroller:()=>box,originalSession:{},originalZoom:()=>1,
  originalFingerContacts:e=>e.touches.filter(t=>t.touchType!=='stylus'&&!t.suppressed),
  originalPinchDistance:p=>Math.hypot(p[0].clientX-p[1].clientX,p[0].clientY-p[1].clientY)};
 vm.createContext(c);vm.runInContext(source.slice(0,source.indexOf('function originalPdfPaintPaused')),c);
 const t=(id=1,x=100,y=200)=>({identifier:id,clientX:x,clientY:y,touchType:'direct',target:{closest:()=>true}});
 const e=(type,touches,changedTouches=touches,cancelable=true)=>({type,touches,changedTouches,cancelable,preventDefault(){}});
 const start=(touches=[t(),t(2,160)])=>c.originalUndoStart(e('touchstart',touches));
 const end=(touches=[],changed=[t(),t(2,160)],type='touchend')=>c.originalUndoEnd(e(type,touches,changed));
 const pair=()=>{start();now+=40;return end();};
 return {c,box,t,e,start,end,pair,advance:n=>now+=n,writing:v=>writing=v,busy:v=>busy=v,modal:v=>modal=v};
}
test('exactly two stationary paired taps undo once; one pair or one-finger double tap cannot',()=>{
 const f=fixture();assert.equal(f.pair(),false);f.advance(80);assert.equal(f.pair(),true);assert.equal(f.end(),false);
 const g=fixture();for(let i=0;i<2;i++){g.start([g.t()]);g.advance(30);assert.equal(g.end([], [g.t()]),false);}
});
test('slightly staggered fingers are accepted; sequential and long contacts are rejected',()=>{
 for(const delay of [30,100]){
  const f=fixture();const tap=()=>{f.start([f.t()]);f.advance(delay);f.c.originalUndoStart(f.e('touchstart',[f.t(),f.t(2,160)],[f.t(2,160)]));f.advance(20);f.end([f.t(2,160)],[f.t()]);f.advance(20);return f.end([], [f.t(2,160)]);};
  assert.equal(tap(),false);f.advance(80);assert.equal(tap(),delay===30);
 }
 for(const delay of [250,1000]){const f=fixture();f.pair();f.advance(50);f.start();f.advance(delay);assert.equal(f.end(),false);}
});
test('movement, native pan, zoom/session/viewport changes, cancellations and ownership forbid undo',()=>{
 for(const kind of ['move','scroll','zoom','session','resize','cancel','reset','third','stylus','palm','modal','read','busy','off','dispatched','pinch']){
  const f=fixture();f.pair();f.advance(50);
  if(kind==='off')f.c.studyPrefs.twoFingerUndo=false;
  if(kind==='read')f.writing(false);if(kind==='busy')f.busy(true);if(kind==='modal')f.modal(true);
  if(kind==='dispatched')f.c.activeGesture={dispatched:1};
  if(kind==='pinch')vm.runInContext('originalPinchTouches=true;originalPinch={}',f.c);
  f.start();
  if(kind==='move')assert.equal(f.c.originalUndoMove(f.e('touchmove',[f.t(1,108),f.t(2,160)])),false);
  if(kind==='scroll')f.box.scrollTop=5;if(kind==='zoom')f.c.originalZoom=()=>1.5;
  if(kind==='session')f.c.originalSession={};if(kind==='resize')f.box.clientWidth=390;
  if(kind==='reset')f.c.cancelOriginalUndoTap();
  if(['third','stylus','palm'].includes(kind)){const extra=f.t(3,230);if(kind==='stylus')extra.touchType='stylus';if(kind==='palm')extra.suppressed=true;f.start([f.t(),f.t(2,160),extra]);}
  assert.equal(f.end([],undefined,kind==='cancel'?'touchcancel':'touchend'),false,kind);
 }
});
test('small jitter reserves a tap, spatially unrelated or slow second pair starts over',()=>{
 const f=fixture();f.pair();f.advance(50);f.start();assert.equal(f.c.originalUndoMove(f.e('touchmove',[f.t(1,103),f.t(2,162)])),true);assert.equal(f.end(),true);
 const g=fixture();g.pair();g.advance(321);assert.equal(g.pair(),false);
 const h=fixture();h.pair();h.advance(50);h.start([h.t(1,300),h.t(2,360)]);assert.equal(h.end([], [h.t(1,300),h.t(2,360)]),false);
});
