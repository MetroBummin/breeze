/* ================= 늦게 받는 라이브러리 =================
   PDF.js 320KB + JSZip 98KB 는 파일을 다룰 때만 필요합니다. 예전에는 첫
   화면에서 늘 받았습니다 — 기사만 읽는 사람에게는 한 번도 쓰지 않을 418KB
   였습니다.

   주소는 우리 서버입니다(`tools/fetch-libs.mjs` 가 받아 둡니다). 예전에는
   cdnjs 였는데, 그러면 세 가지가 따라옵니다 — PDF 를 여는 모든 사람의 IP 가
   남의 서버에 가고, 서비스워커가 남의 서버는 담지 않으니 **비행기 모드에서는
   PDF 가 아예 안 열리고**, 첫 PDF 마다 새 접속이 하나 더 생깁니다.

   미리 담아 두지는 않습니다. 웹에서는 처음 쓸 때 `sw.js` 가 지나가는 길에
   담아 두고(두 번째부터 오프라인), 네이티브 앱에는 이미 들어 있습니다.

   외부 라이브러리는 파일 이름에 판 번호를 둡니다. Readability, Homeward 풀이와
   선택형 계측 스크립트에는 stamp-version이 내용 해시를 붙여 로더와 판을 맞춥니다.

   같은 주소를 두 번 부르면 한 번만 받습니다(약속을 재사용). 실패하면 다음에
   다시 시도할 수 있도록 기억해 둔 약속을 버립니다. */

const LAZY_LIBS = {
  pdf:  'assets/lib/pdf-3.11.174.min.js',
  zip:  'assets/lib/jszip-3.10.1.min.js',
  qr:   'assets/lib/qrcode-1.4.4.min.js',
  readability: 'assets/lib/readability-0.6.0.js?v=34dcab3d',
  // tools/stamp-version.mjs versions these app-owned deferred scripts before HTML.
  homeward: 'assets/longreads/homeward-lookup-data.js?v=98cff2b8',
  frames: 'scripts/reader/frame-trace.js?v=14df1696',
};
const LAZY_LIB_READY = {
  pdf: () => typeof pdfjsLib !== 'undefined',
  zip: () => typeof JSZip !== 'undefined',
  qr:  () => typeof qrcode !== 'undefined',
  readability: () => typeof window.Readability === 'function',
  homeward: () => !!globalThis.HOMEWARD_LOOKUP_DATA,
  frames: () => typeof window.breezeFrameSummary === 'function',
};
const lazyLibJobs = {};

/* A first web page is not controlled merely because its worker is installed.
   Keep only immutable, version-named or content-hashed resources in a runtime cache before
   using them there. Neither this cache nor a new shell takes over a live Reader.
   Controlled pages use the worker's ordinary fetch path; native bundles need no
   CacheStorage. force-cache permits HTTP cache reuse by the following script tag. */
async function cacheUncontrolledLibraries(name){
  if(!['pdf','zip','readability','homeward'].includes(name) || !location.protocol.startsWith('http') || !('caches' in window)
      || window.Capacitor?.isNativePlatform?.()
      || !('serviceWorker' in navigator) || navigator.serviceWorker.controller)return;
  const cache=await caches.open('breeze-runtime-libs-v1');
  const urls=name==='pdf'?[LAZY_LIBS.pdf,PDF_WORKER]:[LAZY_LIBS[name]];
  await Promise.all(urls.map(async url=>{
    if(await cache.match(url))return;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(url,{cache:'force-cache',signal:controller.signal});
      if(!response.ok)throw new Error('오프라인 읽기를 준비하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
      const expected=new URL(url,location.href).searchParams.get('v');
      if(expected){
        const digest=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
        const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,8);
        if(actual!==expected)throw new Error('읽기 자료의 버전이 맞지 않아요. 다시 시도해 주세요.');
      }
      await cache.put(url,response);
    }finally{clearTimeout(timer);}
  }));
}

function loadLazyLib(name){
  if(LAZY_LIB_READY[name] && LAZY_LIB_READY[name]()) return Promise.resolve();
  if(lazyLibJobs[name]) return lazyLibJobs[name];
  lazyLibJobs[name] = cacheUncontrolledLibraries(name).then(()=>new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    const fail=()=>{clearTimeout(timer);tag.remove();reject(new Error('필요한 라이브러리를 받지 못했어요. 인터넷 연결을 확인해 주세요.'));};
    const timer=setTimeout(fail,20000);
    tag.src = LAZY_LIBS[name];
    tag.onload = ()=>{clearTimeout(timer);if(LAZY_LIB_READY[name]())resolve();else fail();};
    tag.onerror = fail;
    document.head.appendChild(tag);
  })).catch(error => { delete lazyLibJobs[name]; throw error; });
  return lazyLibJobs[name];
}

/* 일꾼은 PDF 를 실제로 푸는 쪽이고, 본체와 **판이 같아야 합니다** — 어긋나면
   PDF.js 가 "The API version does not match the Worker version" 으로 멈춥니다.
   그래서 둘을 한 파일(tools/fetch-libs.mjs)에서 함께 받습니다. */
const PDF_WORKER = 'assets/lib/pdf-3.11.174.worker.min.js';
async function ensurePdfLib(){
  await loadLazyLib('pdf');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  return pdfjsLib;
}
async function ensureZipLib(){
  await loadLazyLib('zip');
  return JSZip;
}
async function ensureQrLib(){
  await loadLazyLib('qr');
  return qrcode;
}
function ensureReadabilityLib(){return loadLazyLib('readability');}
function ensureHomewardLookupData(){return loadLazyLib('homeward');}

// Debug instrumentation runs after all deferred app scripts and is absent from
// normal startup requests. Keep the persisted opt-in and explicit opt-out.
function maybeLoadFrameTrace(){
  let on=false;
  try{
    if(/[?&]frames=1/.test(location.search))localStorage.setItem('breeze.debug.frames','1');
    if(/[?&]frames=0/.test(location.search))localStorage.removeItem('breeze.debug.frames');
    on=localStorage.getItem('breeze.debug.frames')==='1';
  }catch{}
  if(on)loadLazyLib('frames').catch(error=>console.warn('프레임 계측을 준비하지 못했습니다:',error));
}
document.addEventListener('DOMContentLoaded',maybeLoadFrameTrace,{once:true});
