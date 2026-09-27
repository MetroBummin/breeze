import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(new URL('../scripts/reader/pdf-original.js',import.meta.url),'utf8');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const gate=defer(),started=defer(),content={innerHTML:'',className:'',appendChild(){}},surfaces=[];
 const a={id:'A'},b={id:'B'},record={hash:'hash-A',blob:{arrayBuffer:async()=>new ArrayBuffer(0)}};
 let destroyed=0;
 const pdf={numPages:0,destroy(){destroyed++;},async getPage(){started.resolve();await gate.promise;return {getViewport:()=>({width:600,height:800})};}};
 const context={console,Map,Set,WeakMap,performance,setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
 originalLoadToken:1,originalSession:null,curBook:a,ensurePdfLib:async()=>{},pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},
 document:{getElementById:()=>content,addEventListener(){}},window:{addEventListener(){}},
 BreezePdfInk:{open(){}},IntersectionObserver:class{observe(){}},readerScroller:()=>({}),
 registerReaderSurface:s=>surfaces.push(s)};
 vm.createContext(context);vm.runInContext(source,context);
 context.renderOriginalPdfPage=async()=>{};
 return {context,a,b,record,gate,started,content,surfaces,destroyed:()=>destroyed};
}
for(const action of ['switch','close','delete','A-B-A'])test(`delayed first page cannot publish after ${action}`,async()=>{
 const f=fixture(),job=f.context.openOriginalPdf(f.a,f.record,1);await f.started.promise;
 f.context.originalLoadToken=action==='A-B-A'?3:2;
 const expected=action==='switch'?{kind:'pdf',bookId:'B',hash:'hash-B'}:null;
 f.context.originalSession=expected;f.context.curBook=action==='switch'?f.b:action==='A-B-A'?f.a:null;
 f.content.innerHTML='current screen';f.gate.resolve();await job;
 assert.equal(f.context.originalSession,expected);assert.equal(f.content.innerHTML,'current screen');assert.equal(f.destroyed(),1);
});
test('word picking rejects a foreign page even when its page number matches',()=>{
 const f=fixture(),current={dataset:{page:'1'},isConnected:true},foreign={dataset:{page:'1'},isConnected:true,getBoundingClientRect(){throw Error('foreign geometry read');}};
 f.context.originalSession={kind:'pdf',bookId:'A',hash:'hash-A',loadToken:1,pages:[current],wordBoxes:new Map([[1,[{word:'foreign'}]]])};
 assert.equal(f.context.pdfWordAtPoint(foreign,10,10),null);
});
