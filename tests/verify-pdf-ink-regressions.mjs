/* Production geometry and input functions in a deterministic DOM/IDB harness.
   This is NOT evidence of physical Apple Pencil delivery or native inertia. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
const root=process.env.BREEZE_INK_REGRESSION_BASE||fileURLToPath(new URL('../',import.meta.url));
const source=readFileSync(resolve(root,'scripts/reader/pdf-ink.js'),'utf8');
const geometrySource=readFileSync(resolve(root,'scripts/reader/pdf-ink-geometry.js'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function geometry(){return vm.runInNewContext(geometrySource+'\nBreezeInkGeometry;');}
function fixture(){
  const frames=new Map(),listeners=new Map(),observers=[],posted=[],stored=new Map();
  let frameID=0,busy=false,failWrite=false;
  const register=(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);};
  class Element {
    constructor(id='',className=''){
      this.id=id;this.className=className;this.children=[];this.parentElement=null;this.attributes={};this.inert=false;this.hidden=false;this.reads=0;
      this.style={visibility:'visible',display:'block',opacity:'1',pointerEvents:'auto'};
      this.rect={x:0,y:0,width:600,height:800};
      this.classList={contains:c=>this.className.split(' ').includes(c),add:c=>{if(!this.classList.contains(c))this.className+=' '+c;},
        toggle:(c,on)=>{this.className=this.className.split(' ').filter(x=>x!==c).concat(on?[c]:[]).join(' ');}};
    }
    matches(selector){return selector.split(',').some(s=>{s=s.trim();return s.startsWith('#')?this.id===s.slice(1):s.startsWith('.')?this.classList.contains(s.slice(1)):
      s==='[inert]'?this.inert:s==='[role=dialog]'||s==='[role="dialog"]'?this.attributes.role==='dialog':s===this.tagName;});}
    closest(selector){for(let p=this;p;p=p.parentElement)if(p.matches(selector))return p;return null;}
    getBoundingClientRect(){this.reads++;const r=this.rectFn?this.rectFn():this.rect;return {...r,left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height};}
    getClientRects(){return this.hidden?[]:[this.getBoundingClientRect()];}
    setAttribute(k,v){this.attributes[k]=String(v);}
    getAttribute(k){return this.attributes[k]??null;}
    append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
    replaceChildren(){for(const n of this.children)n.parentElement=null;this.children=[];}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
    get isConnected(){return !!this.parentElement;}
    querySelector(s){return this.children.find(x=>x.matches(s))||null;}
    querySelectorAll(){return [];}
  }
  const html=new Element('html'),body=new Element('body','reading reader-original'),reader=new Element('v-read'),box=new Element('originalwrap'),stage=new Element('original-stage'),zoom=new Element('original-zoom'),paper=new Element('','pdf-source-page');
  html.append(body);body.append(reader);reader.append(box);box.append(stage);stage.append(zoom);zoom.append(paper);
  html.clientWidth=600;box.scrollLeft=0;box.scrollTop=0;box.scrollHeight=1800;
  paper.dataset={page:'1'};const canvas=new Element();canvas.tagName='canvas';paper.append(canvas);
  const svg=new Element('','pdf-ink-layer');svg.tagName='svg';paper.append(svg);
  const session={hash:'fixture-pdf-sha256',kind:'pdf',pages:[paper],settled:new Set([1])};
  const state={key:JSON.stringify([session.hash,1]),strokes:[],revision:0,dirty:false,error:false,saving:null,loading:null,loaded:true,svg,element:paper,width:600,height:800};
  let controls=[];
  const document={body,documentElement:html,hidden:false,addEventListener:register,
    querySelectorAll:()=>controls,getElementById:()=>null,
    createElementNS:(_,tag)=>{const el=new Element();el.tagName=tag;return el;}};
  const db={transaction:()=>{
    const tx={error:null,objectStore:()=>({get:key=>{
      const request={result:stored.get(key)};queueMicrotask(()=>tx.oncomplete?.());return request;
    },put:(value,key)=>{queueMicrotask(()=>{
      if(failWrite){tx.error=new Error('simulated write failure');tx.onerror?.();}
      else {stored.set(key,structuredClone(value));tx.oncomplete?.();}
    });}})};return tx;
  }};
  const context={Element,document,window:{breezeInkIPad:true,addEventListener:register,
    webkit:{messageHandlers:{breezeInkScope:{postMessage:v=>posted.push(plain(v))}}}},
    MutationObserver:class {constructor(fn){observers.push(fn);}observe(){}},
    requestAnimationFrame:fn=>{frames.set(++frameID,fn);return frameID;},cancelAnimationFrame:id=>frames.delete(id),
    getComputedStyle:el=>el.style,openDb:()=>async()=>db,originalSession:session,
    readerScroller:()=>box,originalZoom:()=>1,originalPinchBusy:()=>busy,cancelOriginalPinch:()=>{busy=false;},
    originalPinchPan:false,originalPinch:null,originalPinchTouches:false,originalPdfContacts:0,
    cancelGesture:()=>{},closePanel:()=>{},closeSentence:()=>{},resumeOriginalPdfPaint:()=>{},
    structuredClone,queueMicrotask,console:{warn(){}},performance};
  const needle='  return {\n    open(s)';assert.ok(source.includes(needle),'test hook must bind to production engine');
  const instrumented=source.replace(needle,`  return {
    qa:{configure(s,state){session=s;mode='pen';pages.set(state.key,state);},
      setMode,publishNativeScope,touchStart,touchMove,touchEnd,history,persist,
      active(){return active;},undo(){return undoStack;},redo(){return redoStack;}},
    open(s)`);
  vm.createContext(context);vm.runInContext(geometrySource+'\n'+instrumented+'\nglobalThis.engine=BreezePdfInk;',context);
  const qa=context.engine.qa;qa.configure(session,state);
  const contact=(x,y,id=1,type='stylus')=>({identifier:id,touchType:type,target:canvas,clientX:x,clientY:y});
  const event=(type,touches,changedTouches=touches)=>({type,touches,changedTouches,cancelable:true,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){}});
  const flush=()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();};
  const mutate=(target,attributeName='class')=>observers[0]([{target,type:'attributes',attributeName}]);
  async function stroke(points,end=points.at(-1)){
    qa.touchStart(event('touchstart',[contact(...points[0])]));
    for(const p of points.slice(1))qa.touchMove(event('touchmove',[contact(...p)]));
    const preview=qa.active()?.preview?.getAttribute('points');
    qa.touchEnd(event('touchend',[],[contact(...end)]));await tick();return preview;
  }
  return {qa,state,session,document,html,body,box,stage,zoom,paper,canvas,svg,posted,stored,frames,Element,contact,event,flush,mutate,stroke,
    controls:v=>{controls=v;},pinch:v=>{busy=v;},failWrite:v=>{failWrite=v;},
    emit:(type,target)=>{for(const fn of listeners.get(type)||[])fn({type,target});}};
}

test('scope: selecting pen arms native scope before a later animation frame',()=>{
  const f=fixture();f.qa.setMode('read');assert.equal(f.posted.at(-1).enabled,false);
  f.qa.setMode('pen');assert.equal(f.posted.at(-1).enabled,true);
});
test('scope: ancestor layout changes invalidate paper even with unchanged extent/zoom',()=>{
  const f=fixture();f.qa.publishNativeScope();const old=f.posted.at(-1).pages[0][0];
  f.paper.rect.x=35;f.mutate(f.stage);f.flush();assert.equal(f.posted.at(-1).pages[0][0],old+35);
});
test('scope: body layout changes also invalidate cached paper',()=>{
  const f=fixture();f.qa.publishNativeScope();f.paper.rect.y=27;f.mutate(f.body);f.flush();
  assert.equal(f.posted.at(-1).pages[0][1],27);
});
test('scope: pinch dirty geometry survives deferral and refreshes after contact end',()=>{
  const f=fixture();f.qa.publishNativeScope();f.pinch(true);f.paper.rect.x=45;f.mutate(f.zoom);f.flush();
  assert.equal(f.posted.at(-1).pages[0][0],0,'keep committed scope during preview');
  f.qa.touchEnd(f.event('touchend',[],[f.contact(100,100,2,'direct')]));
  f.pinch(false);f.flush();assert.equal(f.posted.at(-1).pages[0][0],45);
});
test('scope: transition completion replaces an intermediate cached rectangle',()=>{
  const f=fixture();f.qa.publishNativeScope();f.paper.rect.y=60;
  f.emit('transitionend',f.stage);f.flush();assert.equal(f.posted.at(-1).pages[0][1],60);
});
test('scope: invisible/inert controls do not veto paper contacts; real controls do',()=>{
  const f=fixture(),parent=new f.Element(),hidden=new f.Element(),inert=new f.Element(),real=new f.Element();
  parent.style.opacity='0';parent.append(hidden);inert.inert=true;real.rect={x:10,y:20,width:30,height:40};
  f.controls([hidden,inert,real]);f.qa.publishNativeScope();assert.deepEqual(f.posted.at(-1).excluded,[[10,20,30,40]]);
});
test('scope: pointer-transparent controls do not exclude paper',()=>{
  const f=fixture(),control=new f.Element();control.style.pointerEvents='none';f.controls([control]);
  f.qa.publishNativeScope();assert.deepEqual(f.posted.at(-1).excluded,[]);
});
test('scope: scrolling retains content-coordinate cache without per-frame page scans',()=>{
  const f=fixture();f.qa.publishNativeScope();const reads=f.paper.reads;
  for(let i=1;i<=200;i++){f.box.scrollTop=i;f.emit('scroll',f.box);f.flush();}
  assert.equal(f.paper.reads,reads);assert.equal(f.posted.length,1);
});
test('scope: finger contact refreshes previously missed layout before next Pencil',()=>{
  const f=fixture();f.qa.publishNativeScope();f.paper.rect.x=31;
  f.qa.touchStart(f.event('touchstart',[f.contact(100,100,2,'direct')]));
  assert.equal(f.posted.at(-1).pages[0][0],31);assert.equal(f.qa.active(),null);
});
test('scope: read mode and document hiding disable the native gate',()=>{
  const f=fixture();f.qa.publishNativeScope();f.qa.setMode('read');assert.equal(f.posted.at(-1).enabled,false);
  f.qa.setMode('pen');f.document.hidden=true;f.emit('visibilitychange',f.document);assert.equal(f.posted.at(-1).enabled,false);
});

test('smoothing: taps and two-point lines preserve their exact endpoints',()=>{
  const g=geometry(),tap=g.createSmoother([1,2]);assert.deepEqual(plain(tap.finish()),[[1,2]]);
  const line=g.createSmoother([1,2]);line.add([30,40]);assert.deepEqual(plain(line.finish()),[[1,2],[30,40]]);
});
test('smoothing: curves add intermediate geometry with a live tip and no overshoot',()=>{
  const g=geometry(),raw=[[10,10],[40,25],[70,10]],s=g.createSmoother(raw[0]);
  for(const p of raw.slice(1)){s.add(p);assert.ok(s.svgPoints().endsWith(p.join(',')));}
  const result=plain(s.finish());assert.ok(result.length>raw.length);assert.deepEqual(result[0],raw[0]);assert.deepEqual(result.at(-1),raw.at(-1));
  assert.ok(result.every(([x,y])=>x>=10&&x<=70&&y>=10&&y<=25));
});
test('smoothing: broad arcs have smaller direction jumps than raw samples',()=>{
  const raw=Array.from({length:13},(_,i)=>[300+100*Math.cos(i*Math.PI/18),300+100*Math.sin(i*Math.PI/18)]);
  const g=geometry(),s=g.createSmoother(raw[0]);raw.slice(1).forEach(p=>s.add(p));
  const turn=points=>Math.max(...points.slice(1,-1).map((p,i)=>{
    const a=[p[0]-points[i][0],p[1]-points[i][1]],b=[points[i+2][0]-p[0],points[i+2][1]-p[1]];
    return Math.acos(Math.min(1,Math.max(-1,(a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b)))));
  }));
  assert.ok(turn(plain(s.finish()))<turn(raw)*0.6);
});
test('smoothing: deliberate corners and reversals are retained',()=>{
  const g=geometry(),s=g.createSmoother([0,0]);s.add([100,0]);s.add([100,100]);s.add([100,0]);
  const result=plain(s.finish());assert.ok(result.some(([x,y])=>x===100&&y===0));
  assert.ok(result.some(([x,y])=>x===100&&y===100));assert.ok(result.every(([x,y])=>x===100||y===0));
});
test('smoothing: repeated and invalid samples cannot poison a stroke',()=>{
  const g=geometry(),s=g.createSmoother([0,0]);for(let i=0;i<100;i++)s.add([0,0]);
  s.add([NaN,2]);s.add([2,Infinity]);s.add([3]);s.add([10,10]);
  assert.deepEqual(plain(s.finish()),[[0,0],[10,10]]);
});
test('smoothing: long dense strokes stay bounded rather than resampling history',()=>{
  const g=geometry(),s=g.createSmoother([0,300]);
  for(let i=1;i<=6000;i++)s.add([i/10,300+20*Math.sin(i/90)]);
  const points=s.finish();assert.ok(points.length<=12000);assert.equal(points.at(-1)[0],600);
});
test('input: preview, stored v1 geometry and repainted geometry are identical',async()=>{
  const f=fixture();const preview=await f.stroke([[20,20],[70,45],[120,20]]);
  assert.equal(f.state.strokes.length,1);assert.ok(f.state.strokes[0].points.length>3);
  const points=plain(f.state.strokes[0].points);
  assert.equal(preview,points.map(p=>p.join(',')).join(' '));
  assert.equal(f.svg.children[0].getAttribute('points'),preview);
  assert.deepEqual(f.stored.get(f.state.key),{version:1,strokes:plain(f.state.strokes)});
});
test('input: the last touchend sample is retained without waiting for another move',async()=>{
  const f=fixture();await f.stroke([[20,20],[60,30]],[100,40]);
  assert.deepEqual(plain(f.state.strokes[0].points.at(-1)),[100,40]);
});
test('input: cancellation discards the unfinished smoothed stroke',()=>{
  const f=fixture();f.qa.touchStart(f.event('touchstart',[f.contact(20,20)]));
  f.qa.touchMove(f.event('touchmove',[f.contact(70,45)]));
  f.qa.touchEnd(f.event('touchcancel',[],[f.contact(100,20)]));
  assert.equal(f.state.strokes.length,0);assert.equal(f.svg.children.length,0);assert.equal(f.qa.undo().length,0);
});
test('input: page exit clips and commits once; re-entry never joins across the gap',async()=>{
  const f=fixture();await f.stroke([[500,300],[550,310],[650,320],[500,300]]);
  assert.equal(f.state.strokes.length,1);assert.equal(f.qa.undo().length,1);
  const p=plain(f.state.strokes[0].points);assert.equal(p.at(-1)[0],600);assert.ok(p.every(([x,y])=>x>=0&&x<=600&&y>=0&&y<=800));
});
test('input: partial eraser and undo/redo use the actual visible smoothed path',async()=>{
  const f=fixture();await f.stroke([[20,100],[150,150],[280,100]]);
  const original=plain(f.state.strokes),points=f.state.strokes[0].points,p=points[Math.floor(points.length/2)];
  f.qa.setMode('erase');await f.stroke([[p[0],p[1]-25],[p[0],p[1]+25]]);
  assert.equal(f.state.strokes.length,2);const erased=plain(f.state.strokes);
  f.qa.history(true);await tick();assert.deepEqual(plain(f.state.strokes),original);
  f.qa.history(false);await tick();assert.deepEqual(plain(f.state.strokes),erased);
  assert.deepEqual(f.stored.get(f.state.key).strokes,erased);
});
test('input: old saved strokes are not re-smoothed on repaint or undo',async()=>{
  const f=fixture(),legacy={color:'#111111',width:1.5,points:[[10,10],[40,25],[70,10]]};
  f.state.strokes=[structuredClone(legacy)];await f.stroke([[100,100],[150,120],[200,100]]);
  assert.deepEqual(plain(f.state.strokes[0]),legacy);f.qa.history(true);await tick();
  assert.deepEqual(plain(f.state.strokes),[legacy]);
});
test('input: existing finger ownership rejects a late Pencil for its entire contact',()=>{
  const f=fixture(),finger=f.contact(10,10,2,'direct'),pen=f.contact(100,100);
  f.qa.touchStart(f.event('touchstart',[finger]));
  f.qa.touchStart(f.event('touchstart',[finger,pen],[pen]));
  f.qa.touchMove(f.event('touchmove',[f.contact(120,120)]));
  f.qa.touchEnd(f.event('touchend',[],[f.contact(120,120)]));assert.equal(f.state.strokes.length,0);
});
test('input: failed save retains the latest smoothed stroke and retry persists it',async()=>{
  const f=fixture();f.failWrite(true);await f.stroke([[20,20],[70,45],[120,20]]);
  assert.equal(f.state.dirty,true);assert.equal(f.state.error,true);assert.equal(f.stored.size,0);
  f.failWrite(false);await f.qa.persist(f.state);assert.equal(f.state.dirty,false);
  assert.deepEqual(f.stored.get(f.state.key).strokes,plain(f.state.strokes));
});
