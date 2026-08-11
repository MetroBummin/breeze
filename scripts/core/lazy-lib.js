/* ================= 늦게 받는 라이브러리 =================
   PDF.js 320KB + JSZip 98KB 는 파일을 다룰 때만 필요합니다. 예전에는 첫
   화면에서 늘 받았습니다 — 기사만 읽는 사람에게는 한 번도 쓰지 않을 418KB
   였습니다.

   같은 주소를 두 번 부르면 한 번만 받습니다(약속을 재사용). 실패하면 다음에
   다시 시도할 수 있도록 기억해 둔 약속을 버립니다. */

const LAZY_LIBS = {
  pdf:  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  zip:  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  qr:   'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
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

const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
