/* ================= 두 번째 실행부터는 네트워크를 기다리지 않습니다 =================
 *
 * 홈 화면에 추가한 앱을 켜면, 예전에는 매번 진짜 네트워크를 탔습니다. TLS 를 새로
 * 맺고, index.html 을 받고, 그제야 CSS 여덟 장을 요청합니다. 받는 양은 133KB 로
 * 작지만 시간을 먹는 것은 양이 아니라 **왕복 횟수**입니다. 셀룰러에서 그 사이가
 * 1~2초였고, 그동안 iOS 는 자기 런치 스크린(까만 화면)을 띄우고 있었습니다.
 *
 * 이제 그 왕복이 0 입니다.
 *
 * ---- 두 가지 규칙만 있습니다 ----
 *
 *   ① 화면 이동(navigate) — 캐시를 **먼저 주고**, 새것은 뒤에서 받아 둡니다.
 *      켜는 순간 그림이 나옵니다. 새로 배포한 것은 다음에 켤 때 보입니다.
 *   ② 그 밖의 우리 파일 — 캐시에 있으면 그것을 줍니다.
 *      주소마다 `?v=<내용해시>` 가 붙어 있어서(tools/stamp-version.mjs), 파일이
 *      바뀌면 주소가 바뀌고 캐시가 저절로 빗나갑니다. 옛 주소는 옛 내용을,
 *      새 주소는 새 내용을 줍니다 — 반은 새 코드, 반은 옛 코드가 될 수 없습니다.
 *
 * 남의 서버는 **한 글자도 손대지 않습니다.** 사전·RSS·Supabase 는 여기를 그냥
 * 지나갑니다. 캐시에 남는 것은 우리 서버에서 온 것뿐이라, 이 파일이 사전에
 * 찾아본 낱말이나 동기화한 내용을 붙잡아 두는 일은 없습니다.
 *
 * PDF.js · JSZip 도 이제 우리 서버에 있습니다(`assets/lib/`). 미리 담지는
 * 않습니다 — 기사만 읽는 사람에게는 한 번도 쓰지 않을 1.45MB 라서, 실제로
 * PDF 를 연 기기에서만 아래 `cacheFirst` 가 지나가는 길에 담아 둡니다.
 * 그 다음부터는 비행기 모드에서도 PDF 가 열립니다.
 *
 * 네이티브 셸(Capacitor)은 이 파일을 쓰지 않습니다 — 그쪽은 파일이 이미 앱 안에
 * 들어 있고, 주소가 http 가 아니라 등록 자체를 건너뜁니다 (scripts/main.js).
 */

/* tools/stamp-version.mjs 가 찍습니다 — 손으로 고치지 마세요.
   값은 "판 번호를 찍은 index.html 의 해시" 입니다. index.html 은 모든 파일의
   해시를 담고 있으니, 이 한 줄이 "무엇이든 바뀌었다" 를 정확히 가리킵니다. */
const VERSION = '3bb11aa9';
const CACHE = `breeze-${VERSION}`;

/* 담을 목록은 index.html 을 읽어서 그때그때 만듭니다. 손으로 적어 두면 파일을
   하나 더할 때마다 두 곳을 고쳐야 하고, 한 곳을 잊으면 조용히 옛 파일을 씁니다.
   글꼴은 styles/fonts.css 안에서만 이름이 나오므로 그 파일도 한 번 읽습니다. */
const LOCAL_TAG = /<(?:script|link)\b[^>]*?\b(?:src|href)="(?!https?:|\/\/|data:|#)([^"]+)"/g;
const CSS_URL = /url\(\.\.\/([^)"']+)\)/g;

async function shellUrls(){
  const html = await (await fetch('index.html', {cache:'reload'})).text();
  const tagged = [...html.matchAll(LOCAL_TAG)].map(match => match[1])
    .filter(url => /\.(?:js|css)(?:\?|$)/.test(url));
  const fonts = [];
  for(const style of tagged.filter(url => url.startsWith('styles/fonts.css'))){
    const css = await (await fetch(style)).text();
    for(const match of css.matchAll(CSS_URL)) fonts.push(match[1]);
  }
  /* 첫 화면 그림은 여기 없습니다. 화면 비율에 따라 넷 중 하나만 쓰는데 넷을 다
     담으면 380KB 를 받아 놓고 90KB 만 쓰게 됩니다. 실제로 쓴 한 벌은 아래
     `cacheFirst` 가 지나가는 길에 담아 둡니다. */
  return ['./', 'index.html', ...tagged, ...fonts];
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = await shellUrls();
    /* 하나씩 담습니다. `addAll` 은 하나만 실패해도 통째로 실패하고, 그러면
       서비스워커가 아예 안 켜집니다 — 파일 한 장 때문에 오프라인 실행 전체를
       잃을 이유가 없습니다. */
    await Promise.all(urls.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    /* 판이 바뀌면 옛 캐시는 통째로 버립니다. 새 캐시는 위 install 에서 이미 다
       채워진 뒤라 빈 구간이 생기지 않습니다. 주소마다 해시가 붙어 있어서
       배포할 때마다 옛 주소가 쌓이는데, 이렇게 해야 그것이 끝없이 늘지 않습니다. */
    for(const name of await caches.keys()) if(name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;
  /* 우리 서버에서 온 것만. 나머지는 이 파일이 없는 것처럼 그대로 흘러갑니다. */
  if(new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate'
    ? staleWhileRevalidate(request)
    : cacheFirst(request));
});

/* 화면을 먼저 띄우고, 새것은 뒤에서 받아 둡니다. index.html 만 이 규칙입니다 —
   이 파일에는 `?v=` 를 붙일 수 없어서(자기 자신을 가리킬 방법이 없습니다)
   "바뀌었나" 를 물어보는 수밖에 없는데, 그 물음을 켜는 길목에서 치웁니다.
   한 판 늦게 보이지만 어긋나지는 않습니다: 옛 index.html 이 부르는 주소는
   전부 옛 해시라, 그 짝인 옛 파일이 캐시에 그대로 있습니다. */
async function staleWhileRevalidate(request){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, {ignoreSearch:true});
  const fresh = fetch(request).then(response => {
    if(response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fresh || Response.error();
}

async function cacheFirst(request){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if(cached) return cached;
  const response = await fetch(request);
  /* `basic` 은 우리 서버에서 온, 내용을 읽을 수 있는 응답입니다. 실패한 응답을
     담으면 그 실패가 다음 판까지 굳습니다. */
  if(response && response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}
