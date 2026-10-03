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
const pdfSource=readFileSync(resolve(root,'scripts/reader/pdf-original.js'),'utf8');
const geometrySource=readFileSync(resolve(root,'scripts/reader/pdf-ink-geometry.js'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function geometry(){return vm.runInNewContext(geometrySource+'\nBreezeInkGeometry;');}
function fixture(){
  const frames=new Map(),listeners=new Map(),observers=[],posted=[],stored=new Map(),writes=[];
  let frameID=0,busy=false,failWrite=false,now=0,timerId=0;const timers=new Map();
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
    append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}}
    insertBefore(node,prior){if(node===prior)return;node.remove();node.parentElement=this;if(prior)this.children.splice(this.children.indexOf(prior),0,node);else this.children.push(node);}
    get firstChild(){return this.children[0]||null;}
    get nextSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]||null;}
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
  const session={hash:'fixture-pdf-sha256',kind:'pdf',bookId:'fixture',loadToken:1,pages:[paper],settled:new Set([1])};
  const state={key:JSON.stringify([session.hash,1]),strokes:[],revision:0,dirty:false,error:false,saving:null,loading:null,loaded:true,svg,element:paper,width:600,height:800};
  let controls=[];
  const document={body,documentElement:html,hidden:false,addEventListener:register,
    querySelectorAll:()=>controls,getElementById:()=>null,
    createElementNS:(_,tag)=>{const el=new Element();el.tagName=tag;return el;}};
  const db={transaction:()=>{
    const tx={error:null,objectStore:()=>({get:key=>{
      const request={result:stored.get(key)};queueMicrotask(()=>tx.oncomplete?.());return request;
    },put:(value,key)=>{const snapshot=structuredClone(value);writes.push(snapshot);queueMicrotask(()=>{
      if(failWrite){tx.error=new Error('simulated write failure');tx.onerror?.();}
      else {stored.set(key,snapshot);tx.oncomplete?.();}
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
    curBook:{id:'fixture'},originalLoadToken:1,registerReaderSurface(){},
    setTimeout(fn,ms){timers.set(++timerId,{fn,at:now+ms});return timerId;},clearTimeout(id){timers.delete(id);},
    crypto,structuredClone(){throw new Error('Completed ink must not be deeply cloned before IDB put');},queueMicrotask,console:{warn(){}},performance:{now:()=>now,timeOrigin:performance.timeOrigin}};
  const needle='  return {\n    open(s)';assert.ok(source.includes(needle),'test hook must bind to production engine');
  const instrumented=source.replace(needle,`  return {
    qa:{configure(s,state){session=s;mode='pen';pages.set(state.key,state);},
      scribble(enabled){scribbleEnabled=enabled;},
      valid,setMode,publishNativeScope,touchStart,touchMove,touchEnd,history,persist,
      active(){return active;},undo(){return undoStack;},redo(){return redoStack;}},
    open(s)`);
  vm.createContext(context);vm.runInContext(pdfSource+'\n'+geometrySource+'\n'+instrumented+'\nglobalThis.engine=BreezePdfInk;',context);
  const qa=context.engine.qa;qa.configure(session,state);
  const contact=(x,y,id=1,type='stylus')=>({identifier:id,touchType:type,target:canvas,clientX:x,clientY:y});
  const event=(type,touches,changedTouches=touches)=>({type,touches,changedTouches,cancelable:true,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){}});
  const flush=()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();};
  const mutate=(target,attributeName='class',oldValue=null)=>observers[0]([{target,type:'attributes',attributeName,oldValue}]);
  async function stroke(points,end=points.at(-1)){
    qa.touchStart(event('touchstart',[contact(...points[0])]));
    for(const p of points.slice(1))qa.touchMove(event('touchmove',[contact(...p)]));
    const preview=qa.active()?.preview?.getAttribute('points');
    qa.touchEnd(event('touchend',[],[contact(...end)]));await tick();return preview;
  }
  return {engine:context.engine,qa,state,session,document,html,body,box,stage,zoom,paper,canvas,svg,posted,stored,writes,frames,Element,contact,event,flush,mutate,stroke,
    advance(ms){now+=ms;for(const [id,t] of timers)if(t.at<=now){timers.delete(id);t.fn();}},timers,
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
test('scope: chrome-only body changes retain cached paper geometry',()=>{
  const f=fixture();f.qa.publishNativeScope();const reads=f.paper.reads;
  const prior=f.body.className;f.body.classList.add('chrome-hidden');f.mutate(f.body,'class',prior);f.flush();
  assert.equal(f.paper.reads,reads,'decorative control state must not rescan paper');
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
test('scope: layout invalidation refreshes paper before the next Pencil',()=>{
  const f=fixture();f.qa.publishNativeScope();f.paper.rect.x=31;f.mutate(f.stage);f.flush();
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

test('scope: ordinary finger contacts reuse all cached page boundaries',()=>{
 const f=fixture();
 for(let i=1;i<200;i++){const page=new f.Element('','pdf-source-page');page.rect={x:0,y:i*820,width:600,height:800};f.zoom.append(page);f.session.pages.push(page);}
 f.qa.publishNativeScope();const reads=f.session.pages.map(p=>p.reads),posts=f.posted.length;
 for(let i=0;i<100;i++){const t=f.contact(100,100,2,'direct');f.qa.touchStart(f.event('touchstart',[t]));f.qa.touchEnd(f.event('touchend',[],[t]));f.flush();}
 assert.deepEqual(f.session.pages.map(p=>p.reads),reads);assert.equal(f.posted.length,posts);assert.equal(f.posted.at(-1).pages.length,200);
});

test('highlighter: one translucent path, underneath pens, with durable tool metadata',async()=>{
 const f=fixture();await f.stroke([[20,100],[280,100]]);const pen=plain(f.state.strokes[0]);
 f.qa.setMode('highlighter');await f.stroke([[20,100],[280,100],[20,100]]);
 const highlight=f.state.strokes[1];assert.equal(highlight.tool,'highlighter');assert.equal(highlight.opacity,0.3);assert.equal(highlight.width,12);
 assert.equal(f.svg.children[0].getAttribute('data-ink-tool'),'highlighter');assert.equal(f.svg.children[0].getAttribute('opacity'),'0.3');
 assert.equal(f.svg.children[1].getAttribute('data-ink-tool'),'pen');assert.deepEqual(plain(f.state.strokes[0]),pen);
 assert.equal(f.qa.valid(f.stored.get(f.state.key)),true);
 const original=plain(f.state.strokes);f.qa.setMode('erase');await f.stroke([[150,70],[150,130]]);
 assert.ok(f.state.strokes.filter(s=>s.tool==='highlighter').length>=2);
 assert.equal(f.svg.children.filter(n=>n.getAttribute('data-ink-tool')==='highlighter').length,1);
 assert.ok(f.state.strokes.filter(s=>s.tool==='highlighter').every(s=>s.opacity===0.3&&s.color===highlight.color&&s.width===12));
 f.qa.history(true);await tick();assert.deepEqual(plain(f.state.strokes),original);f.qa.history(false);await tick();assert.equal(f.qa.valid(f.stored.get(f.state.key)),true);
});
test('highlighter: saved records validate attributes without accepting corrupt opacity/tool',()=>{
 const f=fixture(),stroke={tool:'highlighter',color:'#ffe34d',width:12,opacity:0.3,points:[[2,3]]};
 const valid=s=>f.qa.valid({version:1,strokes:[s]});assert.equal(valid(stroke),true);
 for(const changed of [{opacity:2},{opacity:undefined},{tool:'unknown'},{width:NaN},{color:'#123456'}])assert.equal(valid({...stroke,...changed}),false);
 assert.equal(valid({color:'#111111',width:1.5,points:[[2,3]]}),true);
});

test('input: a contact outside starting paper cannot create off-page ink',async()=>{
 const f=fixture();f.qa.setMode('highlighter');await f.stroke([[200,810],[200,780]]);
 assert.equal(f.state.strokes.length,0);assert.equal(f.qa.undo().length,0);
});


test('paint: completed paths survive another stroke; erased paths and released pages are dropped',async()=>{
 const f=fixture();await f.stroke([[20,100],[280,100]]);
 const first=f.state.strokes[0],element=f.svg.children[0];
 await f.stroke([[20,200],[280,200]]);
 assert.equal(f.svg.children[0],element);
 assert.equal(f.state.inkPaths.size,2);
 f.qa.setMode('erase');await f.stroke([[150,70],[150,130]]);
 assert.equal(f.state.inkPaths.has(first),false);
 assert.equal(element.isConnected,false);
 assert.equal(f.state.inkPaths.size,f.state.strokes.length);
 f.engine.release(f.session,1);assert.equal(f.state.inkPaths,null);
});


test('storage: edits during database acquisition keep independent revisions and persist the latest page',async()=>{
 const f=fixture();
 const first=Object.freeze({color:'#111111',width:1.5,points:Object.freeze([Object.freeze([10,20])])});
 const second=Object.freeze({color:'#111111',width:1.5,points:Object.freeze([Object.freeze([30,40])])});
 f.state.strokes=[first];f.state.revision=1;f.state.dirty=true;
 const saving=f.qa.persist(f.state);
 // write() yields while opening the database. The first snapshot must not grow.
 f.state.strokes.push(second);f.state.revision++;
 await saving;
 assert.equal(f.writes.length,2);
 assert.deepEqual(f.writes.map(w=>w.strokes.length),[1,2]);
 assert.deepEqual(f.stored.get(f.state.key).strokes,plain([first,second]));
 assert.equal(f.state.dirty,false);
});


test('eraser: unchanged strokes and highlight groups never leave their parent',async()=>{
 const f=fixture();
 for(let i=0;i<80;i++)await f.stroke([[20,200+i*5],[280,200+i*5]]);
 f.qa.setMode('highlighter');await f.stroke([[20,700],[280,700]]);
 f.qa.setMode('pen');await f.stroke([[20,100],[280,100]]);
 const stable=[...f.svg.children].slice(0,-1),group=stable[0],highlight=group.children[0];
 let detachments=0;
 for(const element of [...stable,highlight]){
  const remove=element.remove.bind(element);element.remove=()=>{detachments++;remove();};
 }
 f.qa.setMode('erase');await f.stroke([[150,70],[150,130]]);
 assert.equal(detachments,0,'Erasing one stroke must not detach unchanged ink');
 assert.equal(f.svg.children[0],group);assert.equal(group.children[0],highlight);
 assert.equal(f.state.strokes.length,83);
 f.qa.history(true);await tick();assert.equal(detachments,0);
 f.qa.history(false);await tick();assert.equal(detachments,0);
});

// Synthetic recognition fixtures establish boundaries, not a zero false-positive rate.
const loops=(turns=5,r=20)=>Array.from({length:turns*24+1},(_,i)=>[220+r*Math.cos(i*Math.PI/12),220+r*Math.sin(i*Math.PI/12)]);
function drawHeld(f,points=loops()){
  f.qa.touchStart(f.event('touchstart',[f.contact(...points[0])]));
  for(const p of points.slice(1)){f.advance(8);f.qa.touchMove(f.event('touchmove',[f.contact(...p)]));}
}
function liftHeld(f,p=loops().at(-1),type='touchend'){
  f.qa.touchEnd(f.event(type,[],[f.contact(...p)]));
}
const targetInk=()=>({color:'#111111',width:1.5,points:[[190,220],[250,220]]});
test('scribble classifier: repeated loops and dense scratch; circles, shapes, hatching and notes remain ink',()=>{
  const g=geometry();
  const classify=points=>{const r=g.createScribble(points[0],0);points.slice(1).forEach((p,i)=>r.add(p,(i+1)*8));return r.intentional();};
  assert.equal(classify(loops()),true);
  const scratch=Array.from({length:65},(_,i)=>{const row=Math.floor(i/4),x=(row%2?4-i%4:i%4)*10;return [200+x,210+(row%3)*8];});
  assert.equal(classify(scratch),true);
  for(const points of [loops(1),loops(2),[[0,0],[0,40],[30,40],[30,0],[0,0]],
    [[0,40],[15,0],[30,40],[5,25],[25,25]], // A
    Array.from({length:40},(_,i)=>[i*5,(i%2)*25]), // rapid notes / advancing hatching
    Array.from({length:40},(_,i)=>[i*5,20]),loops(5,80)])assert.equal(classify(points),false);
});
test('scribble is off by default and lifting before hold preserves ordinary ink',async()=>{
  for(const enabled of [false,true]){
    const f=fixture();f.state.strokes=[targetInk()];f.qa.scribble(enabled);drawHeld(f);liftHeld(f);await tick();
    assert.equal(f.state.strokes.length,2);assert.equal(f.qa.undo().length,1);
  }
});
test('held scribble: no tentative mutation, one undo/redo edit, persisted final state',async()=>{
  const f=fixture(),pen=targetInk(),highlight={...targetInk(),tool:'highlighter',strokeId:'highlight',opacity:.3,color:'#ffe34d',width:12};
  f.state.strokes=[pen,highlight];f.qa.scribble(true);drawHeld(f);f.advance(421);
  assert.equal(f.qa.active().scribbleTargets.size,2);assert.deepEqual(f.state.strokes,[pen,highlight]);assert.equal(f.writes.length,0);
  liftHeld(f);f.qa.history(true);await tick(); // Undo before first save completes.
  assert.deepEqual(f.state.strokes,[pen,highlight]);assert.equal(f.stored.get(f.state.key).strokes.length,2);
  f.qa.history(false);await tick();assert.equal(f.state.strokes.length,0);assert.equal(f.stored.get(f.state.key).strokes.length,0);
  assert.equal(f.qa.undo().length,1);assert.equal(f.timers.size,0);
});
test('scribble hold cancellation, movement, empty target and session interruption',async()=>{
  for(const reason of ['touchcancel','resize','blur','scroll','move','empty','close']){
    const f=fixture();f.state.strokes=reason==='empty'?[]:[targetInk()];f.qa.scribble(true);drawHeld(f);f.advance(421);
    if(reason==='touchcancel')liftHeld(f,loops().at(-1),'touchcancel');
    else if(reason==='move'){f.qa.touchMove(f.event('touchmove',[f.contact(260,250)]));f.advance(500);liftHeld(f,[260,250]);}
    else if(reason==='empty')liftHeld(f);
    else if(reason==='close')f.engine.close(f.session);
    else f.emit(reason,reason==='scroll'?f.box:null);
    await tick();assert.equal(f.state.strokes.length,reason==='move'?2:1,reason);
    assert.equal(f.timers.size,0,reason);
  }
});

test('rapid repeated scribbles each create one edit and leave no confirmation timer behind',async()=>{
 const f=fixture();f.qa.scribble(true);
 for(let i=0;i<12;i++){
  f.state.strokes=[targetInk()];drawHeld(f);f.advance(421);liftHeld(f);await tick();
  assert.equal(f.state.strokes.length,0);assert.equal(f.qa.undo().length,i+1);assert.equal(f.timers.size,0);
 }
});
