/* One presentation owner for direct dragging, interruptible springs and exits.
   Persistence/queue owners decide when a card may hand off. No cloned text. */
function studySpring(from,to,velocity,paint,done=()=>{}){
  let frame=0,last=performance.now(),x=from,v=velocity*1000,stopped=false;
  const stop=()=>{stopped=true;cancelAnimationFrame(frame);};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){paint(to);done();return stop;}
  const tick=now=>{
    const dt=Math.max(0,Math.min(.032,(now-last)/1000));last=now;
    // A near-critically damped spring: responsive, one restrained overshoot.
    const steps=Math.max(1,Math.ceil(dt/.008)),h=dt/steps;
    for(let i=0;i<steps;i++){v+=(-420*(x-to)-36*v)*h;x+=v*h;}
    paint(x);
    if(Math.abs(x-to)<.15&&Math.abs(v)<3){paint(to);done();return;}
    if(!stopped)frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);return stop;
}
function studyReleaseVelocity(samples,now){
  const last=samples.at(-1);if(!last||now-last.t>80)return 0;
  // A fast reversal can fit entirely inside the sampling window. Measure the
  // last uninterrupted direction, so earlier outward travel cannot grade/remove
  // after the finger has deliberately turned back toward the resting position.
  let first=last,direction=0;
  for(let i=samples.length-2;i>=0;i--){
    const point=samples[i];if(last.t-point.t>70)break;
    const step=Math.sign(first.x-point.x);
    if(step&&direction&&step!==direction)break;
    if(step)direction=step;
    first=point;
  }
  return last.t>first.t?(last.x-first.x)/(last.t-first.t):0;
}
function studyCardMotion(card,{ready,reveal,grade,enabled=()=>true}){
  let x=0,drag=null,stop=null,flight=null,suppress=false;
  const paint=value=>{x=value;card.style.transform=`translateX(${x}px) rotate(${Math.max(-12,Math.min(12,x/35))}deg)`;card.style.setProperty('--study-drag',String(Math.min(1,Math.abs(x)/120)));};
  const cancel=()=>{stop?.();stop=null;};
  const reset=()=>{cancel();flight?.cancel();flight=null;drag=null;x=0;card.style.removeProperty('transform');card.style.removeProperty('--study-drag');card.removeAttribute('data-direction');card.removeAttribute('data-dragging');};
  const settle=(velocity=0)=>{cancel();card.setAttribute('data-dragging','');stop=studySpring(x,0,velocity,paint,()=>{stop=null;card.removeAttribute('data-dragging');card.removeAttribute('data-direction');});};
  const exit=direction=>{
    cancel();drag=null;card.setAttribute('data-dragging','');
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
    const distance=Math.max(innerWidth,card.clientWidth)*1.15;
    const target=direction*distance,velocity=Number(card.dataset.releaseVelocity)||0;
    const duration=Math.max(120,Math.min(220,Math.abs(target-x)/Math.max(2.8,Math.abs(velocity))));
    flight=card.animate([{transform:card.style.transform||'none'},{transform:`translateX(${target}px) rotate(${direction*12}deg)`}],{duration,easing:'cubic-bezier(.18,.65,.35,1)',fill:'forwards'});
    return flight.finished.catch(()=>{});
  };
  card.addEventListener('pointerdown',event=>{
    if(!enabled()||event.button!==0||event.isPrimary===false)return;
    cancel();suppress=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,base:x,dx:0,axis:'',samples:[{x:event.clientX,t:event.timeStamp}]};
  });
  card.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    drag.samples.push({x:event.clientX,t:event.timeStamp});drag.samples=drag.samples.filter(p=>event.timeStamp-p.t<=120);
    if(!drag.axis){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;drag.axis=Math.abs(dx)>Math.abs(dy)*1.2?'x':'y';suppress=true;}
    if(drag.axis!=='x'||!ready())return;
    drag.dx=dx;card.setAttribute('data-dragging','');try{card.setPointerCapture(event.pointerId);}catch{}
    const amount=drag.base+dx;card.dataset.direction=amount>0?'remembered':'repeat';paint(amount);event.preventDefault();
  });
  const finish=(event,canceled)=>{
    if(!drag||drag.id!==event.pointerId)return;
    const current=drag;drag=null;
    const velocity=studyReleaseVelocity(current.samples,event.timeStamp),threshold=Math.min(90,card.clientWidth*.24);
    const reversed=velocity*x<0&&Math.abs(velocity)>.2;
    if(!canceled&&current.axis==='x'&&ready()&&!reversed&&Math.abs(current.dx)>=36&&Math.abs(x+velocity*130)>=threshold){card.dataset.releaseVelocity=String(velocity);grade(x>0?'remembered':'repeat');}
    else if(current.axis==='x'||x)settle(canceled?0:velocity);
    else if(!canceled&&event.pointerType==='touch'&&!current.axis&&event.target instanceof Node&&card.contains(event.target)){suppress=true;reveal();}
  };
  card.addEventListener('pointerup',event=>finish(event,false));card.addEventListener('pointercancel',event=>finish(event,true));
  card.addEventListener('lostpointercapture',event=>{if(event.target===card&&drag?.id===event.pointerId)finish(event,true);});
  card.addEventListener('click',event=>{if(suppress&&event.detail!==0){suppress=false;event.preventDefault();event.stopImmediatePropagation();return;}reveal();});
  return {exit,reset,settle};
}
