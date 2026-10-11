import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Execute the production functions unchanged, including the actual scroll and
// ResizeObserver listeners. The fixture supplies layout, storage and chrome.
export function textRotationSource(root=process.env.BREEZE_ROTATION_SOURCE_ROOT||fileURLToPath(new URL('../../',import.meta.url))){
 const read=path=>readFileSync(resolve(root,path),'utf8');
 const state=read('scripts/core/state.js'),reader=read('scripts/reader/reader.js');
 const scroll=read('scripts/reader/reader-scroll.js'),original=read('scripts/reader/original-session.js');
 return [
  scroll.slice(scroll.indexOf('function readerScroller()'),scroll.indexOf('/* ================= 원본 종이')),
  state.slice(state.indexOf('function topInset()'),state.indexOf('let appHistoryReady=')),
  original.slice(original.indexOf('let currentReaderMode'),original.indexOf('/* ---- 좌표 지도')),
  reader.slice(reader.indexOf('let scrollTick ='),reader.indexOf('/* 하단 컨트롤')),
  reader.slice(reader.indexOf('let chromeFrame=0;'),reader.indexOf('/* ================= 글자판'))
 ].join('\n');
}
