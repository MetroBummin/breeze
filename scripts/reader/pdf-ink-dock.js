/* Writing-mode dock. A finger long-press gathers the whole bottom row into one
   puck, then release parks that row on the nearest edge. Read mode never moves.
   The edge is its own localStorage key so a tool-color save cannot clear it. */
const INK_DOCK_KEY='breeze.pdfInk.dock';
const INK_DOCK_EDGES=['bottom','left','right','top'];
const INK_DOCK_HOLD=400;
const INK_DOCK_SLOP=8;

function inkDockNearest(point,slots){
  let best='bottom',bestD=Infinity;
  for(const name of INK_DOCK_EDGES){
    const slot=slots[name];
    if(!slot)continue;
    const dx=point.x-slot.x,dy=point.y-slot.y,d=dx*dx+dy*dy;
    if(d<bestD){bestD=d;best=name;}
  }
  return best;
}

function bootInkDock(){
  if(typeof document==='undefined'||!document.getElementById||!document.getElementById('readchrome'))return;
  const reducedQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
  let edge='bottom',pending=null,phase=null,activeId=0,swallow=false,frame=0,insetCache=null;
  let finger={x:0,y:0},pos={x:0,y:0},vel={x:0,y:0},merge=null,chosen='bottom',lastTick=0,snapStarted=0;
  const puck=document.createElement('div');
  puck.id='ink-dock-puck';
  puck.hidden=true;
  puck.setAttribute('aria-hidden','true');
  puck.innerHTML='<i class="ink-dock-stack"></i><i class="ink-dock-stack"></i><span class="ink-dock-face control-glass"></span>';
  document.body.append(puck);

  function reduced(){return reducedQuery.matches;}
  function inkApi(){return typeof BreezePdfInk==='undefined'?null:BreezePdfInk;}
  function writing(){const api=inkApi();return !!(api&&api.writing&&api.writing());}
  function loadEdge(){
    try{
      const value=localStorage.getItem(INK_DOCK_KEY);
      if(INK_DOCK_EDGES.indexOf(value)>=0)return value;
    }catch(e){}
    return 'bottom';
  }
  function storeEdge(value){
    edge=value;
    try{localStorage.setItem(INK_DOCK_KEY,value);}catch(e){}
  }
  function refreshScope(){const api=inkApi();if(api&&api.refreshScope)api.refreshScope();}
  function pieces(){
    return ['reader-navigation','readpill','aafab'].map(id=>document.getElementById(id)).filter(Boolean);
  }
  function shown(element){
    if(!element)return false;
    for(let node=element;node instanceof Element;node=node.parentElement){
      const style=getComputedStyle(node);
      if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0)return false;
    }
    return true;
  }
  function measureInsets(){
    const probe=document.createElement('div');
    probe.style.cssText='position:fixed;left:max(16px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));width:0;height:0;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    const left=probe.getBoundingClientRect().left,top=probe.getBoundingClientRect().top;
    probe.style.left='auto';
    probe.style.right='max(16px, env(safe-area-inset-right))';
    const right=window.innerWidth-probe.getBoundingClientRect().right;
    probe.remove();
    return {left,top,right};
  }
  function slots(){
    if(!insetCache)insetCache=measureInsets();
    const main=document.getElementById('readmain');
    const box=main?main.getBoundingClientRect():{left:0,width:window.innerWidth,bottom:window.innerHeight};
    const x=box.left+box.width/2;
    const chrome=document.getElementById('readchrome');
    const raw=chrome?parseFloat(getComputedStyle(chrome).getPropertyValue('--control-bottom')):8;
    const bottom=Number.isFinite(raw)?raw:8;
    return {
      bottom:{x,y:box.bottom-bottom-22},
      top:{x,y:insetCache.top+22},
      left:{x:insetCache.left+22,y:window.innerHeight/2},
      right:{x:window.innerWidth-insetCache.right-22,y:window.innerHeight/2}
    };
  }
  function releaseDockTransform(){
    const chrome=document.getElementById('readchrome');
    if(!chrome)return;
    const control=document.getElementById('pdf-page-control');
    const open=document.body.classList.contains('ink-dock-side')&&(
      document.getElementById('pdf-page-button')?.getAttribute('aria-expanded')==='true'
      ||control?.classList.contains('pdf-navigation-closing'));
    if(open){
      const height=chrome.getBoundingClientRect().height;
      chrome.style.top=Math.max(8,(window.innerHeight-height)/2)+'px';
      chrome.style.transform='none';
    }else{
      chrome.style.top='';
      chrome.style.transform='';
    }
  }
  function applyEdge(){
    const on=writing(),next=on?edge:'bottom';
    document.body.classList.toggle('ink-dock-side',on&&(next==='left'||next==='right'));
    document.body.classList.toggle('ink-dock-left',on&&next==='left');
    document.body.classList.toggle('ink-dock-right',on&&next==='right');
    document.body.classList.toggle('ink-dock-top',on&&next==='top');
    if(on)document.body.dataset.inkDock=next;
    else delete document.body.dataset.inkDock;
    releaseDockTransform();
  }
  function sync(){
    if(!writing()&&phase){
      phase=null;pending=null;
      document.body.classList.remove('ink-dock-away','ink-dock-settle');
      puck.hidden=true;
    }
    if(!phase)edge=loadEdge();
    if(phase)return;
    applyEdge();
    refreshScope();
  }
  function place(x,y,angle,sx,sy,stack,holdIcon){
    puck.hidden=false;
    puck.style.left=x+'px';
    puck.style.top=y+'px';
    puck.style.transform='translate(-50%,-50%) rotate('+angle+'deg) scale('+sx+','+sy+')';
    puck.style.setProperty('--ink-stack',String(stack));
    /* The circle may start as large as the row. The glyph stays at toolbar size. */
    puck.style.setProperty('--ink-icon-x',holdIcon&&sx?String(1/sx):'1');
    puck.style.setProperty('--ink-icon-y',holdIcon&&sy?String(1/sy):'1');
  }
  function stepToward(x,y,dt,freq,zeta,direct){
    if(direct||!(dt>0)){pos.x=x;pos.y=y;vel.x=0;vel.y=0;return;}
    const omega=freq*2*Math.PI;
    vel.x+= (omega*omega*(x-pos.x)-2*zeta*omega*vel.x)*dt;
    vel.y+= (omega*omega*(y-pos.y)-2*zeta*omega*vel.y)*dt;
    pos.x+=vel.x*dt;pos.y+=vel.y*dt;
  }
  function hint(){
    const svg=document.querySelector('#pdf-ink-tools [aria-pressed="true"] svg')||document.querySelector('.ink-pill-entry svg');
    const face=puck.querySelector('.ink-dock-face');
    face.replaceChildren(svg?svg.cloneNode(true):document.createElement('span'));
  }
  function finish(){
    phase=null;
    storeEdge(chosen);
    applyEdge();
    puck.hidden=true;
    puck.style.transform='none';
    document.body.classList.remove('ink-dock-away');
    if(reduced())document.body.classList.remove('ink-dock-settle');
    else{
      document.body.classList.add('ink-dock-settle');
      window.setTimeout(()=>document.body.classList.remove('ink-dock-settle'),240);
    }
    refreshScope();
  }
  function tick(now){
    frame=0;
    if(!phase)return;
    const dt=Math.min(0.032,lastTick? (now-lastTick)/1000 : 0);
    lastTick=now;
    const direct=reduced();
    if(phase==='merge'){
      const t=direct?1:Math.min(1,(now-merge.start)/220);
      const ease=1-Math.pow(1-t,3);
      stepToward(finger.x,finger.y,dt,2.5,0.66,direct);
      const sx=direct?1:merge.sx+(1-merge.sx)*ease;
      const sy=direct?1:merge.sy+(1-merge.sy)*ease;
      place(pos.x,pos.y,0,sx,sy,direct?1:Math.max(0,(t-0.55)/0.45),true);
      if(t>=1)phase='drag';
    }else if(phase==='drag'){
      if(direct){pos.x=finger.x;pos.y=finger.y;vel.x=0;vel.y=0;place(pos.x,pos.y,0,1,1,1);}
      else{
        stepToward(finger.x,finger.y,dt,2.5,0.66,false);
        const speed=Math.hypot(vel.x,vel.y),mag=Math.min(0.34,speed/1280);
        place(pos.x,pos.y,Math.atan2(vel.y,vel.x)*180/Math.PI+90,1-mag*0.72,1+mag,1);
      }
    }else if(phase==='snap'){
      const slot=slots()[chosen];
      if(direct){pos.x=slot.x;pos.y=slot.y;finish();}
      else{
        stepToward(slot.x,slot.y,dt,3.4,0.86,false);
        const speed=Math.hypot(vel.x,vel.y),mag=Math.min(0.2,speed/1600);
        const angle=speed<8?0:Math.atan2(vel.y,vel.x)*180/Math.PI+90;
        place(pos.x,pos.y,angle,1-mag*0.72,1+mag,Math.max(0,1-speed/900));
        if((Math.hypot(slot.x-pos.x,slot.y-pos.y)<0.8&&speed<24)||now-snapStarted>700)finish();
      }
    }
    if(phase)frame=window.requestAnimationFrame(tick);
    refreshScope();
  }
  function arm(){
    if(frame)return;
    lastTick=0;
    frame=window.requestAnimationFrame(tick);
  }
  function commit(start){
    if(!writing()||(inkApi()&&inkApi().busy&&inkApi().busy()))return;
    if(document.getElementById('pdf-page-button')?.getAttribute('aria-expanded')==='true')return;
    pending=null;
    activeId=start.id;
    const open=document.querySelector('#pdf-ink-tools [aria-expanded="true"]');
    if(open)open.click();
    if(typeof closeAa==='function')closeAa();
    swallow=true;
    const visible=pieces().filter(shown);
    const rects=visible.length?visible.map(element=>element.getBoundingClientRect()):[{left:start.x,top:start.y,right:start.x+44,bottom:start.y+44}];
    const left=Math.min.apply(null,rects.map(r=>r.left)),top=Math.min.apply(null,rects.map(r=>r.top));
    const right=Math.max.apply(null,rects.map(r=>r.right)),bottom=Math.max.apply(null,rects.map(r=>r.bottom));
    insetCache=null;
    document.body.classList.add('ink-dock-away');
    hint();
    pos={x:(left+right)/2,y:(top+bottom)/2};
    vel={x:0,y:0};
    finger={x:start.x,y:start.y};
    merge={start:performance.now(),sx:Math.max(1,(right-left)/44),sy:Math.max(1,(bottom-top)/44)};
    phase=reduced()?'drag':'merge';
    if(reduced()){pos.x=finger.x;pos.y=finger.y;}
    try{start.target.setPointerCapture(start.id);}catch(e){}
    arm();
    refreshScope();
  }
  function rowTarget(event){
    const target=event.target;
    if(!(target instanceof Element))return false;
    if(target.closest('#pdf-ink-settings,#pdf-ink-status,#pdf-page-navigation,#aa-pop,#ink-dock-puck'))return false;
    return !!target.closest('#reader-navigation,#readpill,#aafab');
  }
  function stopDrag(){
    phase=null;
    document.body.classList.remove('ink-dock-away','ink-dock-settle');
    puck.hidden=true;
    applyEdge();
    refreshScope();
  }
  function onDown(event){
    if(event.pointerType==='pen'&&(pending||phase)){
      if(pending){window.clearTimeout(pending.timer);pending=null;}
      if(phase)stopDrag();
      return;
    }
    if(pending&&event.pointerId!==pending.id){window.clearTimeout(pending.timer);pending=null;}
    if(event.pointerType!=='touch'||event.isPrimary===false)return;
    if(phase||pending)return;
    if(!writing()||(inkApi()&&inkApi().busy&&inkApi().busy()))return;
    if(document.getElementById('pdf-page-button')?.getAttribute('aria-expanded')==='true')return;
    if(!rowTarget(event))return;
    const start={id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target};
    pending={id:start.id,x:start.x,y:start.y,timer:window.setTimeout(()=>commit(start),INK_DOCK_HOLD)};
  }
  function onMove(event){
    if(pending&&event.pointerId===pending.id){
      const held=pending;
      if(Math.hypot(event.clientX-held.x,event.clientY-held.y)>INK_DOCK_SLOP){window.clearTimeout(held.timer);pending=null;}
      return;
    }
    if(!phase||event.pointerId!==activeId)return;
    finger={x:event.clientX,y:event.clientY};
    if(event.cancelable)event.preventDefault();
  }
  function onUp(event){
    if(pending&&event.pointerId===pending.id){window.clearTimeout(pending.timer);pending=null;return;}
    if(!phase||event.pointerId!==activeId)return;
    finger={x:event.clientX,y:event.clientY};
    chosen=inkDockNearest(finger,slots());
    phase='snap';
    snapStarted=performance.now();
    arm();
  }
  document.addEventListener('pointerdown',onDown,true);
  document.addEventListener('pointermove',onMove,{capture:true,passive:false});
  document.addEventListener('pointerup',onUp,true);
  document.addEventListener('pointercancel',onUp,true);
  document.addEventListener('click',event=>{
    if(!swallow)return;
    swallow=false;
    event.preventDefault();
    event.stopPropagation();
  },true);
  document.addEventListener('contextmenu',event=>{if(pending||phase)event.preventDefault();},true);
  window.addEventListener('resize',()=>{insetCache=null;releaseDockTransform();});
  const pill=document.getElementById('readpill');
  if(pill)new MutationObserver(sync).observe(pill,{attributes:true,attributeFilter:['class']});
  const pageButton=document.getElementById('pdf-page-button'),pageControl=document.getElementById('pdf-page-control');
  if(pageButton)new MutationObserver(releaseDockTransform).observe(pageButton,{attributes:true,attributeFilter:['aria-expanded']});
  if(pageControl)new MutationObserver(releaseDockTransform).observe(pageControl,{attributes:true,attributeFilter:['class']});
  window.addEventListener('breeze-ink-platform',sync);
  sync();
}
bootInkDock();
