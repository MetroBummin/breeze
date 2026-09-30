import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const reader=read('scripts/reader/reader.js');
const review=read('scripts/ui/vocabulary-review.js');
function fn(source,name){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start);
  assert.ok(start>=0&&end>start,`Missing ${name}`);
  return source.slice(start,end+2);
}
function node(tag=''){
  return {tag,children:[],value:'',
    replaceChildren(){this.children=[];this.value='';},
    append(child){this.children.push(child);},
    get textContent(){return this.value+this.children.map(child=>child.textContent).join('');},
    set textContent(value){this.children=[];this.value=String(value);},
    set innerHTML(_value){assert.fail('Saved content must not be interpreted as HTML');}
  };
}
function highlight(record,other={}){
  const target=node(),created=[];
  const context=vm.createContext({words:{...other,saved:record},card:{...record,key:'saved'},document:{
    getElementById(id){assert.equal(id,'review-sentence');return target;},
    createTextNode(value){const result=node();result.textContent=value;return result;},
    createElement(tag){created.push(tag);return node(tag);}
  }});
  vm.runInContext(read('modules/lexical/core.js')+'\nconst lemmaCands=BreezeLexical.lemmaCands;\n'
    +reader.match(/^const WORD_RE = .*;$/m)[0]+'\n'+fn(reader,'savedPhraseMatch')+'\n'
    +fn(review,'highlightReviewSentence'),context);
  const before=JSON.stringify(context.words);
  vm.runInContext('highlightReviewSentence(card)',context);
  assert.equal(JSON.stringify(context.words),before,'Highlighting must not alter saved meanings');
  if(record.example)assert.equal(target.textContent,record.example,'Source text must remain exact');
  assert.ok(created.every(tag=>tag==='mark'),'Only highlight elements may be created');
  return {target,marks:target.children.filter(child=>child.tag==='mark').map(child=>child.textContent)};
}
const phrase=(word,parts,example,extra={})=>({word,clicked:word,forms:parts,phraseParts:parts,
  phraseGaps:new Array(parts.length-1).fill(0),example,...extra});

test('exact phrase forms do not mark unrelated member words',()=>{
  const result=highlight(phrase('come to the point',['come','to','the','point'],
    'Come to the point, then go to the door.'));
  assert.deepEqual(result.marks,['Come to the point']);
});

test('inflected contiguous phrase members merge into one highlight',()=>{
  const result=highlight(phrase('give up',['give','up'],'She gave up but did not look up.'));
  assert.deepEqual(result.marks,['gave up']);
});

test('inflected discontinuous phrase highlights only saved members',()=>{
  const result=highlight(phrase('take into account',['take','into','account'],
    'He took the criticism into account, then opened an account.',
    {clicked:'took … into account',phraseGaps:[2,0]}));
  assert.deepEqual(result.marks,['took','into account']);
});

test('separate meanings reuse their lexical root phrase membership',()=>{
  const root=phrase('give up',['give','up'],'He gave the plan up.',{phraseGaps:[2]});
  const result=highlight({word:'give up',root:'phrase:give up',forms:['give','up'],
    example:'He gave the plan up, then looked up.'},{'phrase:give up':root});
  assert.deepEqual(result.marks,['gave','up']);
});

test('partial phrases do not fall back to unrelated member highlights',()=>{
  const result=highlight(phrase('come to the point',['come','to','the','point'],
    'Come to the door and point to it.'));
  assert.deepEqual(result.marks,[]);
});

test('plain words retain saved inflections and whole-word matching',()=>{
  const result=highlight({word:'take',clicked:'took',forms:['take','taken'],
    example:'He took it, then had taken a mistake. Take it.'});
  assert.deepEqual(result.marks,['took','taken','Take']);
});

test('manual multiword records retain exact expression highlighting',()=>{
  const result=highlight({word:'put off',forms:['put off'],example:'They put off the meeting.'});
  assert.deepEqual(result.marks,['put off']);
});

test('regular expression punctuation and saved markup remain literal text',()=>{
  const result=highlight({word:'C++',forms:['C++'],
    example:'<img src=x onerror="alert(1)"> C++ & <script>C++</script>'});
  assert.deepEqual(result.marks,['C++','C++']);
  const markup=highlight({word:'<b>',forms:['<b>'],example:'Use <b> literally.'});
  assert.deepEqual(markup.marks,['<b>']);
});

test('missing context gives an accessible text fallback',()=>{
  const result=highlight({word:'word',example:''});
  assert.deepEqual(result.marks,[]);
  assert.match(result.target.textContent,/저장된 원문 문장이 없어요/);
});
