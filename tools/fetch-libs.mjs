/* 늦게 받는 라이브러리를 우리 서버로 가져옵니다.
 *
 *     npm run libs
 *
 * 왜 필요한가: 글꼴 때와 같은 이유 세 가지입니다 — (1) PDF 나 EPUB 을 여는
 * 모든 사람의 IP 가 Cloudflare 에 갑니다. (2) 비행기 모드에서는 아예 안 열립니다.
 * 서비스워커는 남의 서버를 담지 않으므로, cdnjs 에 있는 한 이 파일들은 영원히
 * 매번 네트워크입니다. (3) 처음 PDF 를 열 때 남의 서버에 새로 접속합니다.
 *
 * 여기로 가져오면 셋 다 사라집니다. 웹에서는 `sw.js` 의 `cacheFirst` 가 처음
 * 쓸 때 지나가는 길에 담아 두고(두 번째부터 오프라인), 네이티브 앱에서는
 * `tools/build-www.mjs` 가 `assets/` 를 통째로 실으므로 **처음부터** 오프라인입니다.
 *
 * 미리 담아 두지는 않습니다. 기사만 읽는 사람에게 이 1.5MB 는 한 번도 쓰지 않을
 * 짐입니다 — 실제로 PDF 를 열어 본 사람의 기기에만 남습니다.
 *
 * 판 번호는 파일 이름에 넣습니다. `?v=<해시>` 를 쓰지 않는 유일한 자리인데,
 * 이 주소들은 index.html 이 아니라 scripts/core/lazy-lib.js 안에 적혀 있어서
 * `tools/stamp-version.mjs` 가 손대지 못하기 때문입니다. 올려 받으면 이름이
 * 바뀌고, 이름이 바뀌면 캐시가 저절로 빗나갑니다 — 같은 효과입니다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libDir = resolve(root, 'assets/lib');

/* 올릴 때는 여기만 고치고 `npm run libs` 를 돌리면 됩니다. `local` 이름이
   scripts/core/lazy-lib.js 에 적힌 이름과 같아야 하고, 테스트가 그것을 봅니다. */
const LIBS = [
  { local: 'pdf-3.11.174.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' },
  /* 일꾼(worker)은 PDF 를 실제로 푸는 쪽입니다. 본체보다 큽니다 — 대신 이게
     다른 갈래에서 돌기 때문에 스크롤이 안 멈춥니다. */
  { local: 'pdf-3.11.174.worker.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
  { local: 'jszip-3.10.1.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js' },
  { local: 'qrcode-1.4.4.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js' },
];

/* 남의 코드를 실어 나르는 조건입니다 — 글꼴의 OFL 과 같습니다. */
const LICENSES = [
  { file: 'LICENSE-pdfjs.txt',
    url: 'https://raw.githubusercontent.com/mozilla/pdf.js/v3.11.174/LICENSE' },
  { file: 'LICENSE-jszip.txt',
    url: 'https://raw.githubusercontent.com/Stuk/jszip/v3.10.1/LICENSE.markdown' },
  { file: 'LICENSE-qrcode-generator.txt',
    url: 'https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/master/LICENSE' },
];

const get = async url => {
  const response = await fetch(url);
  if(!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  return Buffer.from(await response.arrayBuffer());
};

mkdirSync(libDir, { recursive: true });

let total = 0;
for(const lib of LIBS){
  const file = await get(lib.url);
  writeFileSync(resolve(libDir, lib.local), file);
  const hash = createHash('sha256').update(file).digest('hex').slice(0, 12);
  total += file.length;
  console.log(`  ${lib.local.padEnd(30)} ${(file.length/1024).toFixed(1).padStart(7)}KB  ${hash}`);
}
for(const license of LICENSES){
  writeFileSync(resolve(libDir, license.file), await get(license.url));
}

/* lazy-lib.js 가 정말 이 파일들을 가리키는지 여기서 한 번 맞춰 봅니다. 파일만
   받아 놓고 주소를 안 고치면 아무 일도 안 일어나면서 조용히 예전대로 돕니다. */
const source = readFileSync(resolve(root, 'scripts/core/lazy-lib.js'), 'utf8');
const unwired = LIBS.filter(lib => !source.includes(`assets/lib/${lib.local}`));
if(unwired.length){
  console.error('scripts/core/lazy-lib.js 가 아직 안 가리킵니다:\n  ' +
    unwired.map(lib => lib.local).join('\n  '));
  process.exit(1);
}

console.log(`라이브러리 ${LIBS.length}벌 — 모두 ${(total/1024/1024).toFixed(2)}MB ` +
  `(미리 담지 않고, 실제로 쓸 때만 받습니다)`);
