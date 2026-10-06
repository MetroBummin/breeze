import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../scripts/dictionary/dictionary.js',import.meta.url),'utf8');
const fn=name=>source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0];
function fixture(pending=true){
  let now=0,id=0,closed=0,placed=0;
  const timers=new Map(),frames=[];
  const pill={hidden:true,classList:{toggle(){},add(){},remove(){}},style:{},dataset:{},
    getBoundingClientRect(){return {width:this.hidden?0:180,height:this.hidden?0:44};}};
  const elements={'word-peek':pill,'word-peek-meaning':{},'word-peek-retry':{setAttribute(){},removeAttribute(){}}};
  elements.readchrome={getBoundingClientRect:()=>({height:0,top:800})};
  const context={performance:{now:()=>now},document:{getElementById:key=>elements[key]},
    window:{innerWidth:1000,innerHeight:800},getComputedStyle:()=>({getPropertyValue:()=>''}),
    setTimeout:(cb,delay)=>{timers.set(++id,{cb,at:now+delay});return id;},clearTimeout:key=>timers.delete(key),
    requestAnimationFrame:cb=>frames.push(cb),settlePendingWord(){},displayedWord:()=>({ko:'뜻'}),
    currentContext:()=>null,wordPeekState:()=>({text:'뜻',loading:context.loading}),
    hasResolvedMeaning:()=>true,wordPeekTargetVisible:()=>context.visible,
    rememberWordPeekAnchor(){context.wordPeekAnchor={...context.target};},
    closePanel:()=>{closed++;context.wordPeekActive=false;context.wordLookupLife++;context.cancelWordPeekReveal();},
    wordLookupAlive:life=>life===context.wordLookupLife,
    wordPeekActive:true,wordLookupLife:1,selKey:'word',activeSelectedWordNode:{},wordPeekAnchor:{},
    target:{left:400,right:450,top:300,bottom:320},
    wordPeekRetryState:null,loading:true,visible:true};
  const helpers=source.slice(source.indexOf('const WORD_PEEK_SCROLL_IDLE_MS'),source.indexOf('function wordPeekOpen'));
  runInNewContext(helpers+'\n'+fn('wordPeekPending')+'\n'+fn('placeWordPeek')+'\n'+fn('placeLookupPeek')+'\n'+fn('renderWordPeek'),context);
  if(pending)context.renderWordPeek();
  const realPlace=context.placeWordPeek;
  context.placeWordPeek=()=>{placed++;realPlace();};
  const advance=ms=>{now+=ms;for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.cb();}};
  const frame=()=>{for(const cb of frames.splice(0))cb();};
  return {context,pill,advance,frame,timers,get closed(){return closed;},get placed(){return placed;}};
}

// A result arriving during momentum scroll stays hidden, then uses the live target.
{
  const f=fixture(),c=f.context;
  c.wordPeekUserScrolled();f.advance(100);c.loading=false;c.renderWordPeek();f.frame();
  assert.equal(f.pill.hidden,true);
  f.advance(100);c.wordPeekUserScrolled();f.advance(249);f.frame();
  assert.equal(f.pill.hidden,true);assert.equal(f.closed,0);
  f.advance(1);f.frame();assert.equal(f.pill.hidden,false);assert.equal(f.placed,1);
}
// A scroll between result rendering and the animation frame must prevent reveal.
{
  const f=fixture(),c=f.context;c.loading=false;c.renderWordPeek();
  c.wordPeekUserScrolled();f.frame();assert.equal(f.pill.hidden,true);
  f.advance(250);f.frame();assert.equal(f.pill.hidden,false);
  c.wordPeekUserScrolled();assert.equal(f.pill.hidden,true);assert.equal(f.closed,0);
  c.target={left:400,right:450,top:200,bottom:220};
  f.advance(250);f.frame();assert.equal(f.pill.hidden,false);
  assert.equal(f.pill.style.left,'335px');
  assert.equal(f.pill.style.top,'228px','reveal must measure the laid-out pill at the current word');
  assert.equal(f.pill.style.visibility,'');
}
// Off-screen completion closes only after idle; the saved meaning is untouched.
{
  const f=fixture(),c=f.context;c.wordPeekUserScrolled();c.loading=false;c.renderWordPeek();
  c.visible=false;f.advance(250);f.frame();assert.equal(f.closed,1);assert.equal(f.pill.hidden,true);
}
// A different lookup invalidates even an already queued callback.
{
  const f=fixture(),c=f.context;c.wordPeekUserScrolled();c.loading=false;c.renderWordPeek();
  c.wordLookupLife++;f.advance(250);f.frame();assert.equal(f.pill.hidden,true);assert.equal(f.placed,0);
}
// Without recent scroll a ready result appears on the next paint, with no timer.
{
  const f=fixture();f.context.loading=false;f.context.renderWordPeek();f.frame();
  assert.equal(f.pill.hidden,false);assert.equal(f.timers.size,0);
}
console.log('word scroll-idle presentation: passed');

// Scrolling changes geometry, never the identity of the tapped occurrence.
{
  const sourceNode={},otherNode={},page={},textNode={},endNode={};
  const context={wordPeekActive:true,selKey:'word',words:{word:{word:'word'}},
    activeSelectedWordNode:sourceNode,wordLookupTargets:new WeakMap()};
  runInNewContext(fn('wordPeekSameTarget'),context);
  assert.equal(context.wordPeekSameTarget('word',sourceNode),true);
  assert.equal(context.wordPeekSameTarget('word',otherNode),false);
  for(const target of [{owner:page,start:'0.1:0.2',end:'0.1:0.03'},
    {owner:textNode,start:12,endNode,end:16}]){
    context.wordLookupTargets.set(sourceNode,target);
    context.wordLookupTargets.set(otherNode,{...target});
    assert.equal(context.wordPeekSameTarget('word',otherNode),true,'replacement marker lost source identity');
    context.wordLookupTargets.set(otherNode,{...target,start:99});
    assert.equal(context.wordPeekSameTarget('word',otherNode),false,'different occurrence reused lookup');
    context.wordLookupTargets.set(otherNode,{...target,owner:{}});
    assert.equal(context.wordPeekSameTarget('word',otherNode),false,'another document/page reused lookup');
  }
}

// An immediate saved result needs no protected reading window or resurrection.
{
  const f=fixture(false),c=f.context;c.loading=false;c.renderWordPeek();f.frame();
  assert.equal(f.pill.hidden,false);f.advance(1);c.wordPeekUserScrolled();
  assert.equal(f.closed,1);assert.equal(f.pill.hidden,true);
  f.advance(1000);f.frame();assert.equal(f.pill.hidden,true);
}
