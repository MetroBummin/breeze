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
function studyCardScroller(card){
  return card.closest('.study-sets-body')||card.closest('#vocabulary-review-page');
}
/* Card pronunciation. The English side owns one speaker button; it reuses the
   lookup panel's speak() path (iOS AVSpeechSynthesizer bridge, Web Speech in
   browsers), so the audio session and silent-switch behaviour stay the same.
   Button only: there is no auto-play setting to follow. Moving to another card
   stops the previous word; flipping the same card does not. */
const STUDY_CARD_SPEAKER_SVG='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
let studyCardSpeechWord='';
function studyCardSpeechStop(){
  if(studyCardSpeechWord&&typeof stopSpeech==='function')stopSpeech();
  studyCardSpeechWord='';
}
function studyCardSpeaker(button,word){
  const text=String(word||'').trim();
  if(studyCardSpeechWord&&studyCardSpeechWord!==text)studyCardSpeechStop();
  if(!button.dataset.studyCardControl){
    button.dataset.studyCardControl='speak';button.type='button';button.classList.add('study-card-speak');button.innerHTML=STUDY_CARD_SPEAKER_SVG;
    // studyCardMotion keeps drags from here as card swipes; taps land here.
    button.addEventListener('click',event=>{
      event.stopPropagation();
      const spoken=button.dataset.word||'';
      if(!spoken||button.hidden||typeof speak!=='function')return;
      studyCardSpeechWord=spoken;
      try{speak(spoken,button.id);}catch(error){console.warn('[BreezeSpeech] card',error);}
    });
    // Enter/Space activate the button only; arrow keys still grade the card.
    button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
  }
  button.dataset.word=text;
  // No engine (no Web Speech, no native bridge): no dead control on the card.
  button.hidden=!text||typeof speechAvailable!=='function'||!speechAvailable();
  button.title='발음 듣기';button.setAttribute('aria-label',`${text} 발음 듣기`);
  if(studyCardSpeechWord!==text)button.classList.remove('playing');
  return button;
}
function studyCardControlTarget(event){
  return event.target instanceof Element&&!!event.target.closest('[data-study-card-control]');
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
    // Rotation widens the horizontal bounds of long example cards. Clear the
    // whole final rectangle, including its height, before the durable handoff.
    const bounds=card.getBoundingClientRect(),center=bounds.x+bounds.width/2-x;
    const angle=Math.PI/15,halfWidth=(Math.cos(angle)*card.offsetWidth+Math.sin(angle)*card.offsetHeight)/2;
    const distance=Math.max(Math.max(innerWidth,card.clientWidth)*1.15,(direction>0?innerWidth-center:center)+halfWidth+24);
    const target=direction*distance,velocity=Number(card.dataset.releaseVelocity)||0;
    const duration=Math.max(120,Math.min(220,Math.abs(target-x)/Math.max(2.8,Math.abs(velocity))));
    flight=card.animate([{transform:card.style.transform||'none'},{transform:`translateX(${target}px) rotate(${direction*12}deg)`}],{duration,easing:'cubic-bezier(.18,.65,.35,1)',fill:'forwards'});
    return flight.finished.catch(()=>{});
  };
  const track=(clientX,clientY,time)=>{
    const dx=clientX-drag.x,dy=clientY-drag.y;
    drag.samples.push({x:clientX,t:time});drag.samples=drag.samples.filter(p=>time-p.t<=120);
    if(!drag.axis&&Math.max(Math.abs(dx),Math.abs(dy))>=10){
      drag.axis=Math.abs(dx)>Math.abs(dy)*1.2?'x':'y';
      suppress=true;
    }
    return {dx,dy};
  };
  const followScroll=(dy)=>{
    const scroller=studyCardScroller(card);if(!scroller)return;
    // touch-action stays none for the whole gesture. A mid-gesture change to
    // pan-x or pan-y is ignored by the browser, so the lock is preventDefault
    // plus this scroll owner: horizontal freezes the page, vertical scrolls
    // only when the card actually overflows.
    if(drag.axis==='x')scroller.scrollTop=drag.scrollBase;
    else if(drag.axis==='y'&&scroller.scrollHeight>scroller.clientHeight+1){
      if(scroller.style.overflowY==='hidden')scroller.style.overflowY='auto';
      scroller.scrollTop=drag.scrollBase-dy;
    }
  };
  card.addEventListener('pointerdown',event=>{
    if(!enabled()||event.button!==0||event.isPrimary===false)return;
    cancel();suppress=false;
    const scroller=studyCardScroller(card);
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,base:x,dx:0,axis:'',scrollBase:scroller?scroller.scrollTop:0,samples:[{x:event.clientX,t:event.timeStamp}]};
  });
  card.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const {dx,dy}=track(event.clientX,event.clientY,event.timeStamp);
    if(!drag.axis)return;
    followScroll(dy);
    if(drag.axis!=='x'||!ready())return;
    drag.dx=dx;card.setAttribute('data-dragging','');try{card.setPointerCapture(event.pointerId);}catch{}
    const amount=drag.base+dx;card.dataset.direction=amount>0?'remembered':'repeat';paint(amount);if(event.cancelable)event.preventDefault();
  });
  card.addEventListener('touchmove',event=>{
    if(!drag)return;
    const point=[...event.touches].find(touch=>touch.identifier===drag.id)||event.touches[0];
    if(!point)return;
    const {dy}=track(point.clientX,point.clientY,event.timeStamp);
    if(!drag.axis)return;
    followScroll(dy);
    if(event.cancelable)event.preventDefault();
  },{passive:false});
  const finish=(event,canceled)=>{
    if(!drag||drag.id!==event.pointerId)return;
    const current=drag;drag=null;
    const velocity=studyReleaseVelocity(current.samples,event.timeStamp),threshold=Math.min(90,card.clientWidth*.24);
    const reversed=velocity*x<0&&Math.abs(velocity)>.2;
    if(!canceled&&current.axis==='x'&&ready()&&!reversed&&Math.abs(current.dx)>=36&&Math.abs(x+velocity*130)>=threshold){card.dataset.releaseVelocity=String(velocity);grade(x>0?'remembered':'repeat');}
    else if(current.axis==='x'||x)settle(canceled?0:velocity);
    else if(!canceled&&event.pointerType==='touch'&&!current.axis&&event.target instanceof Node&&card.contains(event.target)&&!studyCardControlTarget(event)){suppress=true;reveal();}
  };
  card.addEventListener('pointerup',event=>finish(event,false));card.addEventListener('pointercancel',event=>finish(event,true));
  card.addEventListener('lostpointercapture',event=>{if(event.target===card&&drag?.id===event.pointerId)finish(event,true);});
  // A drag that starts on a card control still swipes/scrolls the card; only
  // a plain tap reaches the control. Capture runs before the control's handler.
  card.addEventListener('click',event=>{if(suppress&&event.detail!==0&&studyCardControlTarget(event)){suppress=false;event.preventDefault();event.stopPropagation();}},true);
  card.addEventListener('click',event=>{if(studyCardControlTarget(event))return;if(suppress&&event.detail!==0){suppress=false;event.preventDefault();event.stopImmediatePropagation();return;}reveal();});
  return {exit,reset,settle};
}
