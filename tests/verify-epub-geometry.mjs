import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(resolve(root,'scripts/reader/epub-original.js'),'utf8');
const context=createContext({
  console, Promise, Map, Set, WeakMap, RegExp, String, Number, Math, Date,
  Blob:globalThis.Blob, URL:globalThis.URL,
  document:{getElementById:()=>({clientWidth:390})},
  window:{innerWidth:390,innerHeight:720,matchMedia:()=>({matches:false})},
  readerViewHeight:()=>720,
  registerReaderSurface(){},
});
new Script(source+'\n;globalThis.__epubGeometryTest={stabiliseEpubViewportCss,waitForEpubAnchorGeometry,epubSpineForSource,reapplyEpubAnchorIfPending,epubRestoreOwnsPosition,restoreEpubAnchor};',
  {filename:'epub-original.js'}).runInContext(context);

const {stabiliseEpubViewportCss,waitForEpubAnchorGeometry,epubSpineForSource,reapplyEpubAnchorIfPending,epubRestoreOwnsPosition,restoreEpubAnchor}=context.__epubGeometryTest;

{
  const state={viewportDependent:false};
  const css=stabiliseEpubViewportCss(
    '.cover{height:98vh}.hero{min-height:calc(100dvh - 2em);width:50vw}',state);
  assert.equal(state.viewportDependent,true,'viewport-dependent chapter was not detected');
  assert.match(css,/calc\(98 \* var\(--breeze-epub-vh\)\)/,
    'vh still depends on the iframe height');
  assert.match(css,/calc\(100 \* var\(--breeze-epub-vh\)\)/,
    'dynamic vh inside calc was not stabilised');
  assert.match(css,/calc\(50 \* var\(--breeze-epub-vw\)\)/,
    'vw was not tied to the stable reader width');
}

{
  const state={viewportDependent:false};
  const sourceCss='@media (min-height:700px) and (orientation:portrait){.cover{height:90%}}';
  const css=stabiliseEpubViewportCss(sourceCss,state);
  assert.equal(state.viewportDependent,true,'height media query was not detected');
  assert.equal(css,sourceCss,'media query syntax was changed before load-time freezing');
}

{
  const state={viewportDependent:false};
  const sourceCss='.chapter{margin:2em;line-height:1.5}.image{max-width:100%}';
  assert.equal(stabiliseEpubViewportCss(sourceCss,state),sourceCss,
    'normal EPUB CSS changed without a viewport dependency');
  assert.equal(state.viewportDependent,false,'normal EPUB was sent through viewport fallback');
}

{
  /* 되찾기가 기다리는 것은 둘입니다: **앵커가 든 장이 열릴 때까지**, 그리고 그
     위에서 **이미 열려 있는 장의 크기**. 아직 안 열린 장은 기다리지 않습니다.

     예전에는 앵커 위쪽 전부의 크기를 기다렸습니다. 그런데 끝내 자리를 잡지 못하는
     장이 실제로 있었고(표지 — 그림이 이미 다 와 있는데도 `decode()` 가 답하지
     않았습니다), 그 한 장 때문에 **어느 자리에서 눌러도** 되찾기가 8초짜리 포기
     타이머까지 멈춰 섰습니다. 그 8초 동안 화면은 책 맨 앞에 있었고, 그 자리가
     읽던 자리로 적히면 다음에도 표지에서 시작했습니다.
     늦게 열리는 장은 기다림이 아니라 `pendingAnchor` 가 맡습니다 — 크기가 확정되는
     그 사건마다 같은 앵커를 다시 앉힙니다. */
  const order=[];
  let releaseTarget,releaseOpened;
  const opened={contentDocument:{readyState:'complete'}};
  const neverOpens={contentDocument:{readyState:'loading'}};
  context.originalSession={kind:'epub',viewport:{width:390,height:720},viewportJob:null,
    frames:[opened,neverOpens,{}],
    frameReady:[null,null,
      new Promise(resolve=>{ releaseTarget=()=>{ order.push('target'); resolve(); }; })],
    frameGeometryReady:[
      new Promise(resolve=>{ releaseOpened=()=>{ order.push('opened'); resolve(); }; }),
      new Promise(()=>{}),          // 끝내 안 열리는 장 — 여기서 막히면 안 됩니다
      new Promise(()=>{}),
    ]};
  let restored=false;
  const waiting=waitForEpubAnchorGeometry({spine:2}).then(()=>{ restored=true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(restored,false,'앵커가 든 장이 열리기도 전에 되찾기가 지나갔습니다');
  releaseTarget(); await Promise.resolve(); await Promise.resolve();
  assert.equal(restored,false,'앵커 위에 이미 열려 있는 장의 크기를 기다리지 않았습니다');
  releaseOpened(); await waiting;
  assert.equal(restored,true,
    '안 열린 장 하나가 되찾기를 붙들었습니다 — 그 사이 화면은 책 맨 앞에 남습니다');
  assert.deepEqual(order,['target','opened']);
}

{
  context.currentReaderMode='original';
  context.document.querySelectorAll=selector=>selector==='.epub-source-chapter'
    ? [{dataset:{href:'cover.xhtml',spine:'0'}},{dataset:{href:'ch3.xhtml',spine:'4'}}]
    : [];
  const cover={contentDocument:{querySelector:()=>null},getBoundingClientRect:()=>({top:0})};
  const chapter={contentDocument:{querySelector:()=>null},getBoundingClientRect:()=>({top:4000})};
  context.originalSession={kind:'epub',frames:[cover,,,,chapter]};
  assert.equal(epubSpineForSource({kind:'epub',href:'ch3.xhtml',spine:0,element:4,char:12}),4,
    'href locates the chapter when the saved spine index is stale');
}

{
  let top=20;
  const element={textContent:'abcdefghijklmnopqrstuvwxyz',getBoundingClientRect:()=>({top:0,height:0})};
  const frame={contentDocument:{querySelector:()=>element},getBoundingClientRect:()=>({top:4000})};
  context.readerScrollTop=()=>top;
  context.readerScrollTo=value=>{top=value;};
  context.domRangeForOffsets=()=>({getClientRects:()=>[{top:240,height:16}]});
  context.currentReaderMode='original';
  const source={kind:'epub',href:'ch3.xhtml',spine:4,element:4,char:12};
  context.originalSession={kind:'epub',frames:[,,,,frame],frameMeta:[{stable:true},{stable:true},{stable:true},{stable:true},{stable:false}],
    pendingAnchor:{source,inset:40,spine:4,appliedTop:null},anchorMoved:false};
  reapplyEpubAnchorIfPending(context.originalSession,4);
  assert.equal(top,20,'unlaid-out chapter does not count as the start of the book');
  assert.ok(context.originalSession.pendingAnchor,'layout still owns the saved anchor');
  assert.equal(epubRestoreOwnsPosition(),true,'a local start must not be written while the anchor is pending');
  element.getBoundingClientRect=()=>({top:180,height:40});
  context.originalSession.frameMeta[4].stable=true;
  top=900;
  reapplyEpubAnchorIfPending(context.originalSession,4);
  assert.equal(top,900+4000+240-40,'character offset is restored after pagination');
  assert.equal(context.originalSession.pendingAnchor,null);
  element.getBoundingClientRect=()=>({top:0,height:0});
  context.originalSession.pendingAnchor={source,inset:40,spine:4,appliedTop:null};
  context.originalSession.frameMeta[4].stable=true;
  top=20;
  reapplyEpubAnchorIfPending(context.originalSession,5);
  assert.equal(top,20,'a later chapter does not turn the cover into the saved place');
  assert.ok(context.originalSession.pendingAnchor,'an unplaced anchor stays until the character has height');
  assert.equal(epubRestoreOwnsPosition(),true);
}

{
  let top=50;
  context.readerScrollTop=()=>top;
  context.readerScrollTo=value=>{top=value;};
  const element={textContent:'hello',getBoundingClientRect:()=>({top:80,height:20})};
  const frame={contentDocument:{querySelector:()=>element},getBoundingClientRect:()=>({top:1000})};
  context.originalSession={kind:'epub',frames:[frame],frameMeta:[{stable:true}],
    pendingAnchor:{source:{kind:'epub',spine:0,element:1,char:0},inset:10,spine:0,appliedTop:50},anchorMoved:true};
  context.currentReaderMode='original';
  reapplyEpubAnchorIfPending(context.originalSession,0);
  assert.equal(top,50,'a real scroll keeps the reader where their hand is');
  assert.equal(context.originalSession.pendingAnchor,null);
  assert.equal(epubRestoreOwnsPosition(),false);
}

{
  const state=readFileSync(resolve(root,'scripts/core/state.js'),'utf8');
  const slice=state.slice(state.indexOf('function saveReadingState(){'),state.indexOf('let appHistoryReady'));
  const saved={id:'book',p:0.27,mode:'original',original:{kind:'epub',href:'ch3.xhtml',spine:4,element:4,char:12}};
  const positions={book:{...saved}};
  const saveContext=createContext({
    curBook:{id:'book'},positions,
    epubRestoreOwnsPosition:()=>true,
    readerPositionPending:()=>false,
    captureOriginalAnchor(){ throw new Error('captured the cover'); },
    save(){ throw new Error('wrote the local start'); }
  });
  new Script(slice,{filename:'state.js'}).runInContext(saveContext);
  saveContext.saveReadingState();
  assert.equal(positions.book.original.spine,4,'pending EPUB layout does not overwrite the remote anchor');
  assert.equal(positions.book.original.char,12);
}

console.log('EPUB geometry contract verified');
