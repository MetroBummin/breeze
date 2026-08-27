/* index.html 의 우리 파일들에 `?v=` 를 찍습니다.
 *
 *     npm run stamp
 *
 * 왜 필요한가: GitHub Pages 는 파일마다 캐시를 따로 잡습니다. 배포하면
 * 브라우저가 새 index.html 은 받아 오면서 옛 scripts/sync.js 는 그대로 쓰는
 * 순간이 생깁니다. 절반은 새 코드, 절반은 옛 코드로 도는 상태입니다. 실제로
 * 그 상태에서 "방금 만든 함수가 undefined" 를 만났습니다.
 *
 * 파일 내용의 해시를 씁니다. 바뀐 파일만 주소가 바뀌므로, 안 고친 파일은
 * 캐시가 그대로 살아 있습니다. 날짜를 쓰면 배포할 때마다 전부 다시 받습니다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = resolve(root, 'index.html');
const html = readFileSync(page, 'utf8');

const shortHash = path =>
  createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex').slice(0, 8);

let stamped = 0, missing = [];
/* 우리 파일만 — CDN 주소는 이미 판 번호를 달고 있고 남의 서버입니다. */
const local = /(<(?:script|link)\b[^>]*?\b(?:src|href)=")(?!https?:|\/\/|data:|#)([^"?]+)(?:\?[^"]*)?(")/g;

const next = html.replace(local, (all, head, path, tail) => {
  if(!/\.(?:js|css)$/.test(path)) return all;
  try{
    stamped++;
    return `${head}${path}?v=${shortHash(path)}${tail}`;
  }catch(error){
    missing.push(path);
    return all;
  }
});

if(missing.length){
  console.error('index.html 이 없는 파일을 가리킵니다:\n  ' + missing.join('\n  '));
  process.exit(1);
}
if(next !== html) writeFileSync(page, next);
console.log(`Stamped ${stamped} local assets${next === html ? ' (변경 없음)' : ''}`);

/* ---- 서비스워커의 판 번호 ----
 * 브라우저는 sw.js 의 **바이트가 달라졌을 때만** 그것을 새로 설치합니다. 그래서
 * 판 번호를 안 찍으면, CSS 를 고쳐 배포해도 서비스워커는 옛 캐시를 그대로 안고
 * 있습니다. READY 는 별도 HTML 진입점이라 루트 index.html 에 나타나지 않으므로
 * 두 READY 화면과 앱 자산도 같은 판 번호 입력에 포함합니다.
 */
const worker = resolve(root, 'sw.js');
if(existsSync(worker)){
  const source = readFileSync(worker, 'utf8');
  const line = /^const VERSION = '[^']*';$/m;
  if(!line.test(source)){
    console.error("sw.js 에서 `const VERSION = '…';` 줄을 못 찾았습니다.");
    process.exit(1);
  }
  const readyAssets = ['ready/index.html','ready/admin/index.html','ready/app.js','ready/admin/app.js','ready/ready.css'];
  const versionInput = [next,...readyAssets.map(path=>readFileSync(resolve(root,path),'utf8'))].join('\n');
  const version = createHash('sha256').update(versionInput).digest('hex').slice(0, 8);
  const stampedWorker = source.replace(line, `const VERSION = '${version}';`);
  if(stampedWorker !== source) writeFileSync(worker, stampedWorker);
  console.log(`Service worker ${version}${stampedWorker === source ? ' (변경 없음)' : ''}`);
}
