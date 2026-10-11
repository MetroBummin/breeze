import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {textRotationSource} from './helpers/text-rotation-source.mjs';

function surface(start=1180){
 let now=10000,width=start,height=200000,paragraphHeight=width===1180?180:200,y=250*paragraphHeight+70;
 let next=1;const frames=new Map(),timers=new Map(),observers=[],scrollListeners=[],saved=[];
 const elements=Array.from({length:600},(_,pi)=>({dataset:{pi:String(pi)},isConnected:true,
  getBoundingClientRect:()=>({top:pi*paragraphHeight-y,bottom:(pi+1)*paragraphHeight-y}),closest(){return this;}}));
 const box={get scrollTop(){return y;},set scrollTop(value){y=value;},get clientHeight(){return 820;},get scrollHeight(){return height;},addEventListener(type,fn){if(type==='scroll')scrollListeners.push(fn);}};
 const context={console,curBook:{id:'fixture'},lastAnchor:null,Date:{now:()=>now},window:{innerWidth:width,innerHeight:820,ResizeObserver:true},
  getComputedStyle:()=>({paddingTop:'24',getPropertyValue:()=>0}),
  requestAnimationFrame(fn){const id=next++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout(fn,delay){const id=next++;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
  ResizeObserver:class{constructor(fn){observers.push(fn);}observe(){}},
  document:{body:{classList:{contains:()=>true}},documentElement:{},
   getElementById:id=>id==='reader-scroll'?box:id==='readmain'?{getBoundingClientRect:()=>({width})}:id==='v-read'?{classList:{contains:()=>true}}:{},
   querySelectorAll:()=>elements,querySelector:q=>elements[Number(q.match(/data-pi="(\d+)"/)[1])],elementFromPoint:(x,yy)=>elements[Math.floor((y+yy)/paragraphHeight)]},
  updatePfill(){context.readerFrameAnchor();},followScrollDirection(){},whileRestoringChrome:fn=>fn(),
  positions:{},LS_POS:'positions',posOf:()=>context.positions.fixture||{},textProgressForBook:(book,a)=>a.pi/600,
  readerProgressAtEnd:p=>p,sameProgressLocation:()=>false,save(){saved.push({...context.positions.fixture});},
  restoreOriginalAnchor:a=>{context.originalRestores.push(a);},originalRestores:[]};
 vm.createContext(context);vm.runInContext(textRotationSource(),context);
 const run=code=>vm.runInContext(code,context);
 run('lastAnchor=captureAnchor()');
 const observe=()=>observers.forEach(fn=>fn([{contentRect:{width}}]));observe();
 return {context,saved,run,observe,
  anchor:()=>JSON.parse(run('JSON.stringify(captureAnchor())')),
  remembered:()=>JSON.parse(run('JSON.stringify(lastAnchor)')),
  resize(){width=width===1180?820:1180;paragraphHeight=width===1180?180:200;context.window.innerWidth=width;},
  frames(){const current=[...frames.values()];frames.clear();current.forEach(fn=>fn(now));},
  scroll(dy){y+=dy;scrollListeners.forEach(fn=>fn());},
  advance(ms){now+=ms;for(const [id,timer]of timers)if(timer.at<=now){timers.delete(id);timer.fn();}}
 };
}
for(const start of [820,1180])for(const count of [1,3,4,5])for(const delay of [80,350,700])for(const order of ['observer-first','progress-first']){
 test(`Text ${count} rotations from ${start}, ${delay}ms, ${order}`,()=>{
  const s=surface(start),before=s.anchor();
  for(let i=0;i<count;i++){
   s.run('scheduleProgressUpdate()');s.resize();
   if(order==='progress-first'){s.frames();s.observe();}else{s.observe();s.frames();}
   assert.deepEqual(s.anchor(),before,`rotation ${i+1} displaced the source paragraph`);
   assert.deepEqual(s.remembered(),before);
   s.advance(delay);
  }
  s.run('saveReadingState()');assert.equal(s.saved.at(-1).pi,before.pi);assert.equal(s.saved.at(-1).dy,before.dy);
 });
}
test('exit save before observer preserves the pre-layout position',()=>{
 const s=surface(),before=s.anchor();s.resize();s.run('saveReadingState()');
 assert.equal(s.saved.at(-1).pi,before.pi);assert.equal(s.saved.at(-1).dy,before.dy);
 s.observe();assert.deepEqual(s.anchor(),before);
});
test('in-flight 800ms scroll save cannot commit reflow as reading',()=>{
 const s=surface();s.scroll(350);s.frames();const before=s.anchor();
 s.resize();s.advance(800);assert.equal(s.saved.at(-1).pi,before.pi);
 s.observe();assert.deepEqual(s.anchor(),before);
});
test('user scroll immediately after restoration becomes the next stable source anchor',()=>{
 const s=surface();s.resize();s.observe();s.scroll(600);s.frames();const afterScroll=s.anchor();
 assert.deepEqual(s.remembered(),afterScroll,'no 600ms Text hold may discard real reading');
 s.resize();s.frames();s.observe();assert.deepEqual(s.anchor(),afterScroll);
});
test('width reconciliation is idempotent and does not steal opening restoration',()=>{
 const s=surface(),before=s.anchor();s.run('readerPositionRestoration={book:curBook}');
 s.resize();s.observe();assert.notDeepEqual(s.anchor(),before);s.run('readerPositionRestoration=null;restoreAnchor(lastAnchor)');
 s.observe();s.frames();assert.deepEqual(s.anchor(),before);
});
test('generic width restoration leaves original PDF to its existing owner',()=>{
 const s=surface();s.run("currentReaderMode='original';originalSession={bookId:'fixture',presented:true,kind:'pdf'};lastOriginalAnchor={page:20}");
 s.context.document.getElementById=new Proxy(s.context.document.getElementById,{apply(fn,self,args){if(args[0]==='originalwrap')return {hasAttribute:()=>false};return fn(...args);}});
 s.resize();s.observe();assert.equal(s.context.originalRestores.length,0);
});
test('original EPUB keeps its existing restore and hold policy',()=>{
 const s=surface();s.run("currentReaderMode='original';originalSession={bookId:'fixture',presented:true,kind:'epub'};lastOriginalAnchor={spine:3}");
 s.context.document.getElementById=new Proxy(s.context.document.getElementById,{apply(fn,self,args){if(args[0]==='originalwrap')return {hasAttribute:()=>false};return fn(...args);}});
 s.resize();s.observe();assert.equal(s.context.originalRestores.length,1);assert.equal(s.run('readerAnchorHeld()'),true);
});
