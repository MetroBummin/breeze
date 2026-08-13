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

   판 번호는 파일 이름에 있습니다 — 이 주소는 index.html 이 아니라 여기 적혀
   있어서 `tools/stamp-version.mjs` 의 `?v=` 가 닿지 않습니다. 이름이 곧 판이라
   올려 받으면 캐시가 저절로 빗나갑니다.

   같은 주소를 두 번 부르면 한 번만 받습니다(약속을 재사용). 실패하면 다음에
   다시 시도할 수 있도록 기억해 둔 약속을 버립니다. */

const LAZY_LIBS = {
  pdf:  'assets/lib/pdf-3.11.174.min.js',
  zip:  'assets/lib/jszip-3.10.1.min.js',
  qr:   'assets/lib/qrcode-1.4.4.min.js',
};
const LAZY_LIB_READY = {
  pdf: () => typeof pdfjsLib !== 'undefined',
  zip: () => typeof JSZip !== 'undefined',
  qr:  () => typeof qrcode !== 'undefined',
};
const lazyLibJobs = {};

function loadLazyLib(name){
  if(LAZY_LIB_READY[name] && LAZY_LIB_READY[name]()) return Promise.resolve();
  if(lazyLibJobs[name]) return lazyLibJobs[name];
  lazyLibJobs[name] = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = LAZY_LIBS[name];
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('필요한 라이브러리를 받지 못했어요. 인터넷 연결을 확인해 주세요.'));
    document.head.appendChild(tag);
  }).catch(error => { delete lazyLibJobs[name]; throw error; });
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
