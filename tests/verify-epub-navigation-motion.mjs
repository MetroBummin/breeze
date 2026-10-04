import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const source=readFileSync(new URL('../scripts/reader/pdf-navigation.js',import.meta.url),'utf8');
const go=source.slice(source.indexOf('async function goEpubNavigationPage('),source.indexOf('function installEpubNavigationContact('));
for(const [direction,start,index,end] of [['forward',32,1,532],['backward',532,0,32]]){
 test(`EPUB ${direction} move cannot extrapolate before its start on an older queued rAF timestamp`,async()=>{
  let top=start;const callbacks=[],values=[];
  const session={frames:[{getBoundingClientRect:()=>({top:64-top})}],pendingAnchor:{old:true}};
  const nav={session,pages:[{spine:0,y:0},{spine:0,y:500}]};
  const c={pdfNavigation:nav,originalSession:session,currentEpubNavigationSession:()=>session,currentReaderMode:'original',readerModeChangeToken:1,
   activeGesture:null,performance:{now:()=>100},requestAnimationFrame:callback=>callbacks.push(callback),matchMedia:()=>({matches:false}),
   readerScrollTop:()=>top,readerScrollTo:y=>{top=y;values.push(y);},readerContentHeight:()=>3000,readerViewHeight:()=>844,
   originalZoom:()=>1,topInset:()=>32,closePanel(){},saveReadingState(){},updatePfill(){},updatePdfNavigationControls(){}};
  new Script(go).runInNewContext(c);
  const movement=c.goEpubNavigationPage(nav,index);
  callbacks.shift()(96);assert.equal(top,start,'Older callback must retain the actual start position');
  callbacks.shift()(100);assert.equal(top,start);
  callbacks.shift()(150);assert.ok(direction==='forward'?top>start&&top<end:top<start&&top>end);
  callbacks.shift()(300);await movement;
  assert.equal(top,end);assert.equal(callbacks.length,0);assert.equal(session.pendingAnchor,null);
  assert.ok(values.every((y,i)=>!i||(direction==='forward'?y>=values[i-1]:y<=values[i-1])));
 });
}
