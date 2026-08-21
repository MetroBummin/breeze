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
new Script(source+'\n;globalThis.__epubGeometryTest={stabiliseEpubViewportCss,waitForEpubAnchorGeometry};',
  {filename:'epub-original.js'}).runInContext(context);

const {stabiliseEpubViewportCss,waitForEpubAnchorGeometry}=context.__epubGeometryTest;

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
  const order=[];
  let release0,release1,release2;
  context.originalSession={kind:'epub',viewport:{width:390,height:720},viewportJob:null,
    frames:[{},{},{}],frameGeometryReady:[
    new Promise(resolve=>{ release0=()=>{ order.push(0); resolve(); }; }),
    new Promise(resolve=>{ release1=()=>{ order.push(1); resolve(); }; }),
    new Promise(resolve=>{ release2=()=>{ order.push(2); resolve(); }; }),
  ]};
  let restored=false;
  const waiting=waitForEpubAnchorGeometry({spine:1}).then(()=>{ restored=true; });
  release2(); await Promise.resolve();
  assert.equal(restored,false,'restore waited on the wrong side of the target');
  release0(); await Promise.resolve();
  assert.equal(restored,false,'restore ran before the target frame was stable');
  release1(); await waiting;
  assert.equal(restored,true,'restore did not run after the required prefix became stable');
  assert.deepEqual(order,[2,0,1]);
}

console.log('EPUB geometry contract verified');
