/* Toss sentence results carry the same quiet AI mark as the word pill.
   The regular build never creates it. Loading, errors, and reviewed local
   answers stay unmarked. The pill mark sits before the retry control. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script, createContext} from 'node:vm';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(resolve(root,name),'utf8');
const sentenceSource=read('scripts/dictionary/sentence.js');
const dictionary=read('scripts/dictionary/dictionary.js');
const tossSource=dictionary.slice(dictionary.indexOf('function breezeToss('), dictionary.indexOf('function wordPeekState('));
const translation='그는 창밖을 힐끗 보았다.';
const noticeTitle='인공지능이 만든 뜻과 해석';
const noticeBody='단어와 문장의 뜻은 AI가 만들어요. 만든 결과에는 AI 표시가 붙어요.';

function boot(toss){
  const elements=new Map();
  const storage=new Map();
  const classes=new Set();
  class El{
    constructor(id){
      this.id=id||'';
      this.hidden=false;
      this.className='';
      this._text='';
      this.children=[];
      this.parent=null;
      this.dataset={};
      this.style={setProperty(){}, removeProperty(){}};
      this.button=null;
      this.open=false;
      this.innerHTML='';
    }
    set textContent(value){
      this._text=String(value??'');
      for(const child of [...this.children]) child.remove();
    }
    get textContent(){ return this._text+this.children.map(child=>child.textContent).join(''); }
    set id(value){
      if(this._id) elements.delete(this._id);
      this._id=value;
      if(value) elements.set(value,this);
    }
    get id(){ return this._id||''; }
    appendChild(node){
      if(node.parent){
        const index=node.parent.children.indexOf(node);
        if(index>=0) node.parent.children.splice(index,1);
      }
      node.parent=this;
      this.children.push(node);
      return node;
    }
    remove(){
      if(this.parent){
        const index=this.parent.children.indexOf(this);
        if(index>=0) this.parent.children.splice(index,1);
      }
      this.parent=null;
      if(this._id) elements.delete(this._id);
    }
    after(node){
      const parent=this.parent;
      if(!parent) return;
      if(node.parent){
        const index=node.parent.children.indexOf(node);
        if(index>=0) node.parent.children.splice(index,1);
      }
      const at=parent.children.indexOf(this);
      parent.children.splice(at+1,0,node);
      node.parent=parent;
    }
    setAttribute(name,value){ this[name]=value; }
    removeAttribute(name){ delete this[name]; }
    querySelector(selector){
      if(selector==='button'){
        if(!this.button) this.button={onclick:null};
        return this.button;
      }
      return null;
    }
    showModal(){ this.open=true; }
    close(){ this.open=false; }
    getBoundingClientRect(){ return {width:320,height:120,top:0,left:0,right:320,bottom:120}; }
    focus(){}
  }
  const element=id=>{
    if(!elements.has(id)) elements.set(id,new El(id));
    return elements.get(id);
  };
  const body=element('body');
  body.classList={
    contains:name=>classes.has(name),
    toggle(name,on){ if(on) classes.add(name); else classes.delete(name); },
  };
  const pill=element('sentence-peek');
  pill.hidden=true;
  const meaning=element('sentence-peek-meaning');
  const actions=element('sentence-peek-actions');
  const retry=element('sentence-peek-retry');
  pill.appendChild(meaning);
  pill.appendChild(actions);
  actions.appendChild(retry);
  for(const id of ['ps-en','ps-source','ps-ko','ps-foot','ps-retry','sentence-modal','sentence-loading-status','p-sentence']) element(id);
  element('ps-ko').hidden=true;
  element('ps-retry').hidden=true;
  element('sentence-modal').hidden=true;
  const window={
    BREEZE_TARGET:toss?'toss':'',
    visualViewport:{width:390,height:844,addEventListener(){}},
    addEventListener(){},
  };
  const context=createContext({
    console,Promise,Date,String,AbortController,setTimeout,clearTimeout,performance,Math,JSON,
    window,innerWidth:390,innerHeight:844,
    requestAnimationFrame:fn=>setTimeout(()=>fn(Date.now()),0),
    cancelAnimationFrame:clearTimeout,
    document:{
      body,
      getElementById:id=>elements.get(id)||null,
      createElement:()=>new El(''),
      addEventListener(){},
    },
    localStorage:{
      getItem:key=>storage.has(key)?storage.get(key):null,
      setItem:(key,value)=>storage.set(key,String(value)),
    },
    crypto,deviceId:()=>'qa',navigator:{onLine:true},sb:{},sbUser:{id:'u'},curBook:{title:'Book'},
    sentenceHash:text=>text,aiDay:()=>'',save(){},
  });
  new Script(tossSource,{filename:'dictionary-toss.js'}).runInContext(context);
  new Script(sentenceSource,{filename:'sentence.js'}).runInContext(context);
  return {context,element,elements,storage,classes};
}

test('source keeps the sentence mark on AI answers and out of the regular stylesheet',()=>{
  const local=sentenceSource.slice(sentenceSource.indexOf('if(local){'), sentenceSource.indexOf('if(!sb'));
  assert.match(local,/paintSentenceFor\(life,\{en:clean,ko:local\}\)/);
  assert.doesNotMatch(local,/ai:\s*true/);
  assert.match(sentenceSource,/paintSentenceFor\(life,\{en:clean,ko:hit\.ko,ai:true\}\)/);
  assert.match(sentenceSource,/paintSentenceFor\(life,\{\s*en:clean,\s*ko:answer\.ko,\s*ai:true\s*\}\)/);
  assert.match(dictionary,/인공지능이 만든 뜻과 해석/);
  assert.match(dictionary,/단어와 문장의 뜻은 AI가 만들어요\. 만든 결과에는 AI 표시가 붙어요\./);
  assert.match(dictionary,/<button type="button">확인<\/button>/);
  assert.doesNotMatch(read('index.html'),/ps-ko-ai-badge|sentence-peek-ai-badge/);
  assert.doesNotMatch(read('styles/dictionary.css'),/ps-ko-ai-badge|sentence-peek-ai-badge/);
  const tossCss=read('styles/toss.css');
  assert.match(tossCss,/html\[data-breeze-target="toss"\] :is\(#sentence-peek #sentence-peek-ai-badge,#ps-ko #ps-ko-ai-badge\)\{[^}]*border:0[^}]*color:#6C7377[^}]*font:600 10px\/1/);
  assert.match(tossCss,/#sentence-peek #sentence-peek-ai-badge\{[^}]*margin:0 6px 0 4px/);
  assert.match(tossCss,/#sentence-peek-meaning:has\(\+ #sentence-peek-ai-badge\)\{[^}]*padding-right:0/);
  assert.match(tossCss,/#ps-ko #ps-ko-ai-badge\{[^}]*display:inline/);
  const markRules=tossCss.slice(tossCss.indexOf('Sentence results use the word pill'), tossCss.indexOf('iOS WebKit paints the shared sheen'));
  assert.doesNotMatch(markRules,/position:\s*absolute/);
  const noticeRule=tossCss.slice(tossCss.indexOf('html[data-breeze-target="toss"] #toss-ai-notice{'), tossCss.indexOf('#toss-ai-notice::backdrop'));
  assert.match(noticeRule,/position:\s*fixed/);
  assert.match(noticeRule,/margin:\s*auto/);
  assert.match(noticeRule,/height:\s*fit-content/);
  assert.match(tossCss,/html\[data-breeze-target="toss"\] #toss-ai-notice::backdrop\{[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*\.45\)/);
  const noticeButton=tossCss.slice(tossCss.indexOf('#toss-ai-notice button{'), tossCss.indexOf('#toss-ai-notice button:active'));
  assert.match(noticeButton,/width:\s*100%/);
  assert.match(noticeButton,/min-height:\s*48px/);
  assert.match(noticeButton,/border:\s*1px solid var\(--sentence-glass-line-soft\)/);
  assert.match(noticeButton,/border-radius:\s*16px/);
  assert.match(noticeButton,/background:\s*var\(--sentence-glass-action\)/);
  assert.match(noticeButton,/color:\s*var\(--sentence-glass-ink\)/);
  assert.match(noticeButton,/font:\s*600 15px\/1\.5/);
  assert.doesNotMatch(noticeButton,/#1c1c1e|var\(--am-glass\)|var\(--settings-group\)/);
});

test('Toss shows the sentence mark only on a displayed AI translation',()=>{
  const app=boot(true);
  app.context.paintSentence({en:'He glanced out.',ko:translation,ai:true});
  const sheet=app.element('ps-ko-ai-badge');
  assert.equal(sheet.textContent,'AI');
  assert.equal(sheet.className,'toss-ai-badge');
  assert.equal(sheet.getAttribute?.('aria-label')||sheet['aria-label'],'인공지능이 만든 해석');
  assert.equal(sheet.parent,app.element('ps-ko'));
  assert.equal(app.element('ps-ko')._text,translation);
  assert.equal(app.element('ps-retry').hidden,true);
  assert.equal(app.elements.has('sentence-peek-ai-badge'),false);
  const dialog=app.element('toss-ai-notice');
  assert.equal(dialog.open,true);
  assert.match(dialog.innerHTML,new RegExp(noticeTitle));
  assert.match(dialog.innerHTML,new RegExp(noticeBody.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

  app.context.paintSentence({en:'He glanced out.',waiting:true});
  assert.equal(app.elements.has('ps-ko-ai-badge'),false,'loading kept the sentence mark');
  assert.equal(app.element('sentence-modal').hidden,true);

  app.context.paintSentence({en:'He glanced out.',retry:true,foot:'해석하지 못했어요'});
  assert.equal(app.elements.has('ps-ko-ai-badge'),false,'error sheet kept the sentence mark');
  assert.equal(app.elements.has('sentence-peek-ai-badge'),false,'error pill gained a sentence mark');
  assert.equal(app.element('ps-retry').hidden,false);

  app.context.paintSentence({en:'He glanced out.',ko:'검토된 번역'});
  assert.equal(app.elements.has('ps-ko-ai-badge'),false,'local sentence gained an AI mark');

  app.context.paintSentence({en:'He glanced out.',ko:translation,ai:true});
  const meaning=app.element('sentence-peek-meaning');
  const pill=app.element('sentence-peek');
  meaning.textContent=translation;
  pill.hidden=false;
  app.context.syncTossSentenceAiMarks({ko:translation,ai:true});
  const pillMark=app.element('sentence-peek-ai-badge');
  assert.equal(pillMark.textContent,'AI');
  assert.equal(pillMark['aria-label'],'인공지능이 만든 해석');
  assert.deepEqual(pill.children.map(node=>node.id),['sentence-peek-meaning','sentence-peek-ai-badge','sentence-peek-actions']);
  assert.equal(app.element('sentence-peek-retry').parent,app.element('sentence-peek-actions'));
  assert.notEqual(pillMark.parent.id,'sentence-peek-retry');

  meaning.textContent='해석하지 못했어요';
  app.context.syncTossSentenceAiMarks({ko:translation,ai:true});
  assert.equal(app.elements.has('sentence-peek-ai-badge'),false,'error text in the pill kept the mark');
  assert.deepEqual(pill.children.map(node=>node.id),['sentence-peek-meaning','sentence-peek-actions']);
});

test('the regular build does not paint a sentence AI mark or notice',()=>{
  const app=boot(false);
  app.context.paintSentence({en:'He glanced out.',ko:translation,ai:true});
  assert.equal(app.element('ps-ko')._text,translation);
  assert.equal(app.elements.has('ps-ko-ai-badge'),false);
  assert.equal(app.elements.has('sentence-peek-ai-badge'),false);
  assert.equal(app.elements.has('toss-ai-notice'),false);
  const meaning=app.element('sentence-peek-meaning');
  meaning.textContent=translation;
  app.element('sentence-peek').hidden=false;
  app.context.syncTossSentenceAiMarks({ko:translation,ai:true});
  assert.equal(app.elements.has('sentence-peek-ai-badge'),false);
  assert.equal(app.elements.has('ps-ko-ai-badge'),false);
  assert.deepEqual(app.element('sentence-peek').children.map(node=>node.id),['sentence-peek-meaning','sentence-peek-actions']);
});
