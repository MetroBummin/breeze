import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(process.env.BREEZE_PDF_INK_SOURCE||new URL('../scripts/reader/pdf-ink.js',import.meta.url),'utf8');
function fixture(){
 const observers=[];let invalidations=0;
 class Element{
  constructor(id='',attributes={}){this.id=id;this.attributes={...attributes};this.classList={contains:name=>(this.attributes.class||'').split(/\s+/).includes(name)};}
  getAttribute(name){return this.attributes[name]??null;}
  closest(){return null;}
  matches(selectors){return selectors.split(',').some(s=>s.trim()==='#'+this.id||s.trim()==='.pdf-source-page'&&this.classList.contains('pdf-source-page'));}
 }
 const root=new Element('',{class:'reading'}),body=new Element('',{class:'reading reader-original'});
 const c={console,Element,Map,Set,Reflect,JSON,performance,setTimeout,clearTimeout,
  localStorage:{getItem:()=>null},openDb:()=>({}),
  document:{documentElement:root,body,addEventListener(){}},window:{addEventListener(){}},
  originalSession:{kind:'pdf'},invalidatePdfPageLayout(){invalidations++;},
  MutationObserver:class{constructor(callback){observers.push(callback);}observe(){}},
 };
 vm.createContext(c);vm.runInContext(source,c);
 assert.equal(observers.length,1,'fixture must exercise the production document observer');
 const deliver=(target,type='attributes',attributeName='class',oldValue='reading')=>observers[0]([{target,type,attributeName,oldValue}]);
 return {root,body,Element,deliver,observations:()=>invalidations};
}
test('removing an already absent boot class does not invalidate PDF paper',()=>{
 const f=fixture();f.deliver(f.root);assert.equal(f.observations(),0);
});
test('a same-value page style and absent hidden attribute cause no paper invalidation',()=>{
 const f=fixture(),page=new f.Element('',{class:'pdf-source-page',style:'aspect-ratio: 3 / 4;'});
 f.deliver(page,'attributes','style','aspect-ratio: 3 / 4;');f.deliver(page,'attributes','hidden',null);
 assert.equal(f.observations(),0);
});
test('actual root class changes still invalidate paper geometry',()=>{
 const f=fixture();f.root.attributes.class='reading dark';f.deliver(f.root);assert.equal(f.observations(),1);
});
test('actual source aspect-ratio changes still invalidate paper geometry',()=>{
 const f=fixture(),page=new f.Element('',{class:'pdf-source-page',style:'aspect-ratio: 4 / 3;'});
 f.deliver(page,'attributes','style','aspect-ratio: 3 / 4;');assert.equal(f.observations(),1);
});
test('actual page-list changes still invalidate paper geometry',()=>{
 const f=fixture();f.deliver(new f.Element('original-content'),'childList',null,null);assert.equal(f.observations(),1);
});
test('chrome-only body class changes remain excluded',()=>{
 const f=fixture();f.body.attributes.class+=' chrome-hidden';f.deliver(f.body,'attributes','class','reading reader-original');assert.equal(f.observations(),0);
});
test('a changed-then-restored class batch still carries the real transition',()=>{
 const f=fixture();f.deliver(f.root,'attributes','class','reading');f.deliver(f.root,'attributes','class','reading dark');assert.equal(f.observations(),1);
});
