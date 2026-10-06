import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const pinchSource=readFileSync(new URL('../scripts/reader/pdf-pinch.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../scripts/reader/pdf-original.js',import.meta.url),'utf8');
function fixture(){
 const timers=new Map(),calls=[],events=new Map();let timerId=0;
 const box={addEventListener(name,fn){events.set(name,fn);}};
 const session={kind:'pdf',loadToken:1,bookId:'book',hash:'bytes',pages:[],settled:new Set(),wordBoxes:new Map(),rendering:new Map(),drawnAt:new Map(),paintQueue:new Map()};
 const context={console,Map,Set,WeakMap,performance:{now:()=>1000},
  setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},
  originalSession:session,originalLoadToken:1,curBook:{id:'book',original:{hash:'bytes'}},
  originalPdfContacts:0,originalPdfRenderPending:false,paused:false,
  registerReaderSurface(){},readerViewHeight:()=>1000,readerScroller:()=>box,readerModeChangeToken:0,readerPositionPending:()=>false,readerScrollWasProgrammatic:()=>false,
  document:{readyState:'complete',addEventListener(){}},window:{addEventListener(){}}};
 vm.createContext(context);vm.runInContext(source,context);vm.runInContext(pinchSource,context);
 context.schedulePdfSharpen=()=>{};
 context.pdfPagesInView=(_session,reach=0)=>reach?[3,4,5,6,7]:[4,5];
 context.originalPdfPaintPaused=()=>context.paused;
 context.paintOriginalPdfPage=async(s,n,options)=>{calls.push({n,options});s.settled.add(n);s.wordBoxes.set(n,[]);};
 async function tick(){const next=timers.entries().next().value;if(!next)return false;const [id,{fn}]=next;timers.delete(id);fn();for(let i=0;i<6;i++)await Promise.resolve();return true;}
 async function settle(){for(let n=0;n<12&&timers.size;n++)await tick();assert.equal(timers.size,0,'paint queue did not become idle');}
 return {context,session,timers,calls,tick,settle,scroll:()=>events.get('scroll')()};
}
test('a newly visible evicted page is admitted even without another intersection callback',async()=>{
 const f=fixture();f.session.settled.add(4);f.session.wordBoxes.set(4,[]);
 f.scroll();await f.settle();
 assert.deepEqual(f.calls.map(c=>c.n),[5]);assert.equal(f.calls[0].options.prefetch,true);
});
test('repeated scroll scheduling coalesces one canvas job per missing visible page',async()=>{
 const f=fixture();for(let n=0;n<30;n++)f.scroll();
 await f.settle();assert.deepEqual(f.calls.map(c=>c.n),[4,5]);
 for(let n=0;n<30;n++)f.scroll();
 await f.settle();assert.equal(f.calls.length,2,'settled visible paper was redrawn');
});
test('visible admission does not request offscreen pages or re-sharpen settled paper',async()=>{
 const f=fixture();f.session.settled=new Set([4,5]);
 f.scroll();await f.settle();assert.deepEqual(f.calls,[]);
});
test('pinch pause keeps one queued visible request and paints only after ownership releases',async()=>{
 const f=fixture();f.session.settled.add(4);f.session.wordBoxes.set(4,[]);f.context.paused=true;
 f.scroll();await f.tick();assert.deepEqual(f.calls,[]);
 assert.deepEqual([...f.session.paintQueue.keys()],[5]);
 for(let n=0;n<20;n++)f.scroll();
 assert.equal(f.session.paintQueue.size,1);f.context.paused=false;await f.settle();
 assert.deepEqual(f.calls.map(c=>c.n),[5]);
});
test('a queued callback cannot admit pages from a replaced document',async()=>{
 const f=fixture();f.scroll();f.context.originalLoadToken=2;f.context.originalSession=null;
 await f.settle();assert.deepEqual(f.calls,[]);assert.equal(f.session.paintQueue.size,2,'stale callback admitted additional work');
});
test('idle sharpening only requests visible pages, preserving offscreen cache capacity',()=>{
 const f=fixture(),requests=[];f.session.settled=new Set([3,4,5,6]);
 f.context.renderOriginalPdfPage=(_session,n,options)=>{requests.push({n,options});return Promise.resolve();};
 f.context.resharpenOriginalPages();assert.deepEqual(requests.map(r=>r.n),[4,5]);
 assert.ok(requests.every(r=>r.options.resharpen&&r.options.prefetch));
});

test('scrolling a non-PDF reader does not create PDF work',async()=>{
 const f=fixture();f.context.originalSession={kind:'epub'};f.scroll();await f.settle();
 assert.deepEqual(f.calls,[]);assert.equal(f.session.paintQueue.size,0);
});

test('new scrolling wakes a deferred prefetch timer before admitting visible paper',async()=>{
 const f=fixture();f.session.settled.add(4);f.session.wordBoxes.set(4,[]);
 f.session.paintTimer=f.context.setTimeout(()=>assert.fail('old idle retry ran'),160);
 f.scroll();assert.deepEqual([...f.timers.values()].map(t=>t.delay),[0]);
 await f.settle();assert.deepEqual(f.calls.map(c=>c.n),[5]);
});
