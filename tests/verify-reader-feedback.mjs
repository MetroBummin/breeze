import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('scripts/dictionary/dictionary.js');
const part=(name,next)=>source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+next+'('));
let clock=0,placed=0;
const registry=new Map();
function element(id,doc){
  const classes=new Set(),attrs=new Map(),props=new Map();
  return {id,ownerDocument:doc,hidden:true,textContent:'',children:[],
    classList:{add:(...ns)=>ns.forEach(n=>classes.add(n)),remove:(...ns)=>ns.forEach(n=>classes.delete(n)),
      contains:n=>classes.has(n),toggle(n,on){if(on)classes.add(n);else classes.delete(n);}},
    style:{setProperty:(n,v)=>props.set(n,v),removeProperty:n=>props.delete(n),getPropertyValue:n=>props.get(n)||''},
    setAttribute:(n,v)=>attrs.set(n,String(v)),getAttribute:n=>attrs.get(n)??null,removeAttribute:n=>attrs.delete(n),
    appendChild(n){this.children.push(n);registry.set(n.id,n);},focus(){},remove(){},
    getBoundingClientRect:()=>({left:10,right:40,top:20,bottom:40,width:30,height:20})};
}
const doc={getElementById:id=>registry.get(id)||null,createElement:()=>element('',doc)};
doc.head=element('head',doc);doc.body=element('body',doc);
for(const id of ['word-peek','word-peek-meaning','word-peek-retry','panel','readpill','readback','aafab','modefab','readpill-title'])
  registry.set(id,element(id,doc));
const word=element('word',doc);
const context=vm.createContext({console,document:doc,performance:{now:()=>clock},
  getComputedStyle:()=>({getPropertyValue:n=>n==='--sentence-glass-ink'?'#293034':'#f6f6f3'}),
  requestAnimationFrame:fn=>fn(),window:{},wordLookupLife:1,wordLookupCtrl:null,firstLookupMeaning:null,
  discardPendingWord(){},settlePendingWord(){},hasResolvedMeaning:w=>!!w.ko,
  displayedWord:()=>context.card,currentContext:()=>context.current,
  selKey:'private-word-do-not-log',card:{ko:'',loading:true},current:null,wordPeekRetryState:null,
  activeSelectedWordNode:word,wordPeekActive:true,placeWordPeek:()=>placed++,
  wordPeekTargetVisible:()=>true,
  navigator:{onLine:true},meaningWaitLine:()=> '뜻을 찾지 못했어요'});
vm.runInContext(read('scripts/dictionary/lookup-feedback.js')+'\n'+
  part('wordPeekState','placeWordPeek')+part('renderWordPeek','renderWordLookup')+
  part('endWordLookupLife','wordLookupAlive'),context);
const api=vm.runInContext('wordLookupFeedback',context);
api.start(1,'text');context.renderWordPeek();
assert.equal(registry.get('word-peek').hidden,true,'pending pill covers reading');
assert.equal(word.classList.contains('breeze-lookup-pending'),true);
assert.equal(word.getAttribute('aria-busy'),'true');assert.equal(placed,0);
assert.match(registry.get('breeze-word-feedback-style').textContent,/prefers-reduced-motion:reduce/);
assert.doesNotMatch(registry.get('breeze-word-feedback-style').textContent,/transform:|filter:|width:.*pending/);
clock=180;api.repeat(1);api.repeat(1);
clock=700;const ticket=api.request(1,'text');clock=1000;api.response(ticket,'success');
context.card={ko:'검증된 뜻'};context.renderWordPeek();context.renderWordPeek();
assert.equal(registry.get('word-peek').hidden,false);assert.equal(word.getAttribute('aria-busy'),null);
assert.equal(word.classList.contains('breeze-lookup-pending'),false);
let summary=api.summary();
assert.equal(summary.lookupCount,1,'metadata rerender counted as another lookup');
assert.equal(summary.readyP50Ms,1000);assert.equal(summary.requestP50Ms,300);
assert.equal(summary.repeatTapRate,2/3);assert.equal(summary.events[1].source,'ai');
assert.doesNotMatch(JSON.stringify(summary),/private-word|검증된 뜻|book|sentence|account|token/i);
context.endWordLookupLife();assert.equal(context.wordLookupLife,2);
// Existing confirmed meaning is instant, including a new contextual occurrence.
api.start(2,'pdf');context.renderWordPeek();
assert.equal(api.summary().events.at(-1).hadPending,false);
assert.equal(api.summary().events.at(-1).latencyMs,0);
context.endWordLookupLife();
// Discarding/switching a pending lookup clears cue without recording a failure.
api.start(3,'epub');context.card={ko:'',loading:true};context.renderWordPeek();
clock=1300;api.switchTarget(3);context.endWordLookupLife();
summary=api.summary();assert.equal(summary.dismissedCount,1);assert.equal(summary.failureCount,0);
assert.equal(summary.pendingSwitchRate,.5);assert.equal(word.getAttribute('aria-busy'),null);
// A terminal failure finally exposes the pill rather than an endless shimmer.
api.start(4,'epub');context.card={ko:'',aiOff:'error'};context.renderWordPeek();
assert.equal(registry.get('word-peek').hidden,false);assert.equal(api.summary().failureCount,1);
context.endWordLookupLife();
// A fresh PDF/EPUB marker can replace the old one on a repeat hit.
api.start(5,'pdf');context.wordLookupLife=5;context.card={ko:'',loading:true};context.renderWordPeek();
const replacement=element('replacement',doc);replacement.setAttribute('aria-busy','false');
context.activeSelectedWordNode=replacement;context.renderWordPeek();
assert.equal(word.classList.contains('breeze-lookup-pending'),false);
assert.equal(replacement.classList.contains('breeze-lookup-pending'),true);
context.endWordLookupLife();assert.equal(replacement.getAttribute('aria-busy'),'false');
for(let i=6;i<406;i++){
 api.start(i,'pdf');api.present(i,null,{loading:false,text:'safe'},true);api.end(i);
}
assert.equal(api.summary().events.length,240,'diagnostic retention is unbounded');
api.reset();assert.equal(api.summary().lookupCount,0);
// Ink mode guards the single chrome setter, not just CSS. Reading still collapses.
const reader=read('scripts/reader/reader.js');
vm.runInContext(reader.slice(reader.indexOf('function setReaderChrome('),reader.indexOf('function expandReaderChrome(')),context);
const pill=registry.get('readpill');
context.setReaderChrome(true);assert.equal(doc.body.classList.contains('chrome-hidden'),true);
pill.classList.add('ink-pill-active');context.setReaderChrome(true);
assert.equal(doc.body.classList.contains('chrome-hidden'),false);
assert.equal(registry.get('aafab').inert,false);
pill.classList.remove('ink-pill-active');context.setReaderChrome(true);
assert.equal(doc.body.classList.contains('chrome-hidden'),true);
assert.match(read('scripts/reader/pdf-ink.js'),/if\(writing&&typeof setReaderChrome==='function'\)setReaderChrome\(false\)/);
assert.doesNotMatch(read('styles/pdf-ink.css'),/body\.chrome-hidden #readpill\.ink-pill-active/);
assert.match(source,/if\(pill\.hidden\)return;/,'hidden pending pill is expandable');
assert.match(source,/wordLookupFeedback\.repeat\(wordLookupLife\)/);
assert.match(source,/wordLookupFeedback\.switchTarget\(wordLookupLife\)/);
assert.match(source,/function wordPeekPending\(\)/);
assert.match(source,/wordPeekTargetVisible\(activeSelectedWordNode\)/);
const gesture=read('scripts/reader/gesture.js');
assert.match(gesture,/wordPeekPending==='function'&&wordPeekPending\(\)/,
  'user scroll still kills a pending shimmer lookup');
assert.match(read('index.html'),/scripts\/dictionary\/lookup-feedback\.js/);
console.log('Reader feedback: pending/ready/failure, cue ownership, metrics/privacy/bounds, and writing chrome passed.');
