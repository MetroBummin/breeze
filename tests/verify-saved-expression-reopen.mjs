import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const reader=read('scripts/reader/reader.js');
const pdf=read('scripts/reader/pdf-original.js');
const epub=read('scripts/reader/epub-original.js');
const dictionary=read('scripts/dictionary/dictionary.js');
function fn(source,name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`missing ${name}`);
  const end=source.indexOf('\n}',start);
  assert.ok(end>start,`missing end of ${name}`);
  return source.slice(start,end+2);
}
function element(doc){
  return {ownerDocument:doc,dataset:{},style:{},children:[],className:'',
    classList:{add(){}},setAttribute(){},closest(){return null;},
    appendChild(child){child.parentElement=this;this.children.push(child);return child;},
    remove(){const a=this.parentElement?.children;if(a)a.splice(a.indexOf(this),1);},
    querySelectorAll(selector){return this.children.filter(n=>n.className.split(/\s+/).includes(selector.slice(1)));}};
}
function documentFixture(texts){
  const doc={};doc.head=element(doc);doc.body=element(doc);
  doc.defaultView={CSS:{highlights:new Map()},Highlight:class extends Set{constructor(...items){super(items);}}};
  doc.createElement=()=>element(doc);
  doc.getElementById=id=>doc.head.children.find(n=>n.id===id)||null;
  doc.nodes=texts.map(data=>{const parent=element(doc);parent.textContent=data;
    parent.closest=selector=>selector==='p,li,blockquote,h1,h2,h3,h4'?parent:null;
    return {data,ownerDocument:doc,parentElement:parent};});
  doc.walks=0;
  doc.createTreeWalker=(_root,_what,filter)=>{doc.walks++;const nodes=doc.nodes.filter(n=>filter.acceptNode(n)===1);let i=0;return {nextNode:()=>nodes[i++]||null};};
  doc.createRange=()=>({
    setStart(node,offset){this.startContainer=node;this.startOffset=offset;},
    setEnd(node,offset){this.endContainer=node;this.endOffset=offset;},
    selectNodeContents(owner){this.startContainer=doc.nodes.find(n=>n.parentElement===owner);this.startOffset=0;},
    toString(){return this.startContainer.data.slice(this.startOffset,this.endOffset);}
  });
  return doc;
}
const tokens=text=>[...text.matchAll(/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g)];
function fixture(words){
  const doc=documentFixture([]),calls={selected:[],new:[],resolve:[]};
  const c={words,document:doc,NodeFilter:{SHOW_TEXT:4,FILTER_ACCEPT:1,FILTER_REJECT:2},
    // Lexical candidates are fixed here: these tests cover occurrence routing, not lemmatization.
    lemmaCands:raw=>String(raw).toLowerCase()==='gave'?['give','gave']:[String(raw).toLowerCase()],
    getComputedStyle:()=>({getPropertyValue:()=>''}),wordLookupTargets:new WeakMap(),wordTapPoints:new WeakMap(),
    wordPeekSameTarget:()=>false,pendingWord:null,contextView:null,wordLookupLife:1,
    recentWordOpens:new Map(),RECENT_WORD_OPEN_MS:1500,
    lookupRequestFor:(_w,node)=>({sentence:node.dataset.example||'',clickedIndex:Number(node.dataset.clickedTokenIndex??-1)}),
    savedMeaningRecords:key=>Object.entries(c.words).filter(([id,w])=>(id===key||w.root===key)&&w.ko),
    findSavedSense:()=>null,meaningCards:(_key,_active,records)=>records,
    selectWord:(key,node)=>calls.selected.push({key,node,context:c.contextView}),
    addWord:(key,node)=>calls.new.push({key,node}),resolveCurrentLookup:key=>calls.resolve.push(key),
    originalSentence:text=>text,bridgeSentences:text=>[{text,start:0,end:text.length}],
    lookupSentenceTokens:tokens,originalLoadToken:1,curBook:{id:'book'},
    originalSession:null};
  vm.createContext(c);
  const keyStart=reader.indexOf('const keyOf = raw => {'),keyEnd=reader.indexOf('\n};',keyStart);
  assert.ok(keyStart>=0&&keyEnd>keyStart);
  vm.runInContext(reader.slice(keyStart,keyEnd+3)+'\n'+['savedPhraseStarts','savedPhraseMatch'].map(n=>fn(reader,n)).join('\n'),c);
  vm.runInContext('const pdfSavedWordKeys=new WeakMap();const epubSavedHighlightCache=new WeakMap();\n'
    +['currentPdfSession','ownsPdfPage','ownsPdfBoxes','makePdfWordMarker','renderPdfSavedWordMarkers','openPdfWord'].map(n=>fn(pdf,n)).join('\n')+'\n'
    +['epubSavedWordSnapshot','renderEpubSavedWordHighlights','openOriginalRange'].map(n=>fn(epub,n)).join('\n')+'\n'+fn(dictionary,'openWord'),c);
  return {c,calls,doc};
}
function pdfFixture(f,text){
  const page=element(f.doc);page.dataset.page='1';page.isConnected=true;
  const boxes=tokens(text).map((m,index)=>({word:m[0],example:text,tokenIndex:index,x:index/100,y:.1,w:.01,h:.02}));
  f.c.originalSession={kind:'pdf',bookId:'book',loadToken:1,pages:[page],wordBoxes:new Map([[1,boxes]])};
  const paint=()=>f.c.renderPdfSavedWordMarkers(page,boxes);
  paint();return {page,boxes,paint,tap:index=>f.c.openPdfWord(page,boxes[index])};
}
function epubFixture(f,text){
  const doc=documentFixture([text]),node=doc.nodes[0],matches=tokens(text);
  const paint=()=>f.c.renderEpubSavedWordHighlights(doc);
  const tap=index=>{const m=matches[index],range=doc.createRange();range.setStart(node,m.index);range.setEnd(node,m.index+m[0].length);
    f.c.openOriginalRange(doc,range,m[0],node.parentElement,{left:0,top:0,width:10,height:10});};
  paint();return {doc,node,matches,paint,tap};
}
const phraseKey='phrase:come to the point';
function saved(extra={}){return {word:'come to the point',phraseParts:['come','to','the','point'],phraseGaps:[0,0,0],
  ko:'요점을 말하다',status:1,mark:true,example:'To come to the point, we agree.',...extra};}
function assertImmediate(f,key){
  const picked=f.calls.selected.at(-1);
  assert.equal(picked?.key,key);
  assert.equal(picked.node.dataset.w,key,'marker and opened card disagree');
  assert.notEqual(picked.context?.loading,'checking');
  assert.equal(f.calls.new.length,0,'re-entered new-word lookup/cache path');
  assert.equal(f.calls.resolve.length,0,'re-entered unresolved AI/cache path');
}
for(const [kind,make] of [['PDF',pdfFixture],['EPUB',epubFixture]]){
  test(`${kind}: every member reopens the saved phrase synchronously, even with 2,100 saved words`,()=>{
    const words=Object.fromEntries(Array.from({length:2100},(_,i)=>['filler'+i,{word:'filler'+i,ko:'저장된 뜻',status:1}]));
    words[phraseKey]=saved();const f=fixture(words),view=make(f,'To come to the point, we agree.');
    // Painting is complete. A tap must not recognize phrases or scan source text again.
    f.c.savedPhraseStarts=()=>assert.fail('phrase scan during tap');
    f.c.savedPhraseMatch=()=>assert.fail('phrase matching during tap');
    const walks=view.doc?.walks;
    for(const index of [1,4,2,3,4,1]){view.tap(index);assertImmediate(f,phraseKey);}
    if(view.doc)assert.equal(view.doc.walks,walks);
    assert.deepEqual(f.calls.selected.map(p=>p.node.dataset.clickedTokenIndex),['1','4','2','3','4','1']);
  });
  test(`${kind}: a saved component word does not override the colored phrase; outside occurrence stays a word`,()=>{
    const f=fixture({[phraseKey]:saved(),point:{word:'point',ko:'점',status:1}}),view=make(f,'Come to the point. Another point.');
    view.tap(3);assertImmediate(f,phraseKey);
    view.tap(5);assertImmediate(f,'point');
  });
  test(`${kind}: gapped phrase members reopen the phrase, but intervening words do not`,()=>{
    const key='phrase:give up',f=fixture({[key]:{word:'give up',phraseParts:['give','up'],phraseGaps:[2],ko:'포기하다',status:1},
      plan:{word:'plan',ko:'계획',status:1}}),view=make(f,'He gave the plan up.');
    for(const i of [1,4]){view.tap(i);assertImmediate(f,key);}
    view.tap(3);assertImmediate(f,'plan');
  });
  test(`${kind}: hidden marks and status-only refresh preserve lexical identity`,()=>{
    const f=fixture({[phraseKey]:saved()}),view=make(f,'Come to the point.');
    for(const [status,mark] of [[3,true],[3,false],[1,true]]){
      Object.assign(f.c.words[phraseKey],{status,mark});view.paint();view.tap(3);assertImmediate(f,phraseKey);
    }
  });
  test(`${kind}: deleting a phrase cannot reopen a stale card`,()=>{
    const f=fixture({[phraseKey]:saved()}),view=make(f,'Come to the point.');
    delete f.c.words[phraseKey];view.tap(3);
    assert.equal(f.calls.new.at(-1).key,'point');
    view.paint();view.tap(3);assert.equal(f.calls.new.at(-1).key,'point');
    f.c.words[phraseKey]=saved();view.paint();f.calls.new.length=0;view.tap(3);assertImmediate(f,phraseKey);
  });
  test(`${kind}: after phrase membership changes, old members fall back to their own word`,()=>{
    const f=fixture({[phraseKey]:saved(),point:{word:'point',ko:'점',status:1}}),view=make(f,'Come to the point.');
    f.c.words[phraseKey].phraseParts=['come','to'];f.c.words[phraseKey].phraseGaps=[0];view.paint();
    view.tap(3);assertImmediate(f,'point');view.tap(0);assertImmediate(f,phraseKey);
  });
  test(`${kind}: reopening a source rebuilds occurrence identity without changing saved data`,()=>{
    const f=fixture({[phraseKey]:saved()}),before=JSON.stringify(f.c.words);
    make(f,'Come to the point.').tap(0);const reopened=make(f,'Come to the point.');reopened.tap(3);
    assertImmediate(f,phraseKey);assert.equal(JSON.stringify(f.c.words),before);
  });
}
test('PDF: boxes from a released page or another document cannot open a phrase',()=>{
  const f=fixture({[phraseKey]:saved()}),old=pdfFixture(f,'Come to the point.');
  pdfFixture(f,'Come to the point.');old.tap(3);
  assert.equal(f.calls.selected.length,0);assert.equal(f.calls.new.length,0);
});
test('EPUB: source-node identity and exact boundaries, not equal offsets/text, select the phrase',()=>{
  const f=fixture({[phraseKey]:saved()}),view=epubFixture(f,'Come to the point.');
  const other=documentFixture(['Come to the point.']);
  const range=other.createRange();range.setStart(other.nodes[0],12);range.setEnd(other.nodes[0],17);
  f.c.openOriginalRange(other,range,'point',other.nodes[0].parentElement,{left:0,top:0,width:10,height:10});
  assert.equal(f.calls.new.at(-1).key,'point','borrowed another document\'s phrase');
  const partial=view.doc.createRange();partial.setStart(view.node,12);partial.setEnd(view.node,16);
  f.c.openOriginalRange(view.doc,partial,'poin',view.node.parentElement,{left:0,top:0,width:10,height:10});
  assert.equal(f.calls.new.at(-1).key,'poin','accepted a different token boundary');
});
