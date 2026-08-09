/* 네이티브 셸(Capacitor)에 실어 보낼 `www/` 를 만듭니다.
 *
 *     npm run www        (npm run sync:ios 가 먼저 돌립니다)
 *
 * 왜 필요한가: Capacitor 는 webDir 폴더를 통째로 앱 안에 복사합니다. 저장소 뿌리를
 * 그대로 가리키면 node_modules · ios · docs · sql · server · .git 까지 앱에 들어갑니다.
 * 그래서 실제로 브라우저가 읽는 파일만 골라 옮깁니다.
 *
 * 웹 배포는 예전 그대로 빌드 단계가 없습니다. GitHub Pages 는 저장소 뿌리를 그냥
 * 서빙하고, 이 스크립트는 네이티브 앱을 만들 때만 돕니다. "빌드 도구 없이 정적 배포"
 * 라는 규칙은 웹에 대한 것이고, 앱 번들을 만드는 일에는 복사가 필요합니다.
 */
import { readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'www');

/* 브라우저가 실제로 읽는 것만. 여기 없는 것은 앱에 들어가지 않습니다. */
const FILES = ['index.html', 'config.js'];
const DIRS  = ['scripts', 'styles', 'assets'];

/* assets 안에서도 빼는 것 — 내장 고전 5종(1.3MB)은 앱에 함께 넣습니다.
   비행기에서 읽을거리가 하나도 없는 앱이 되면 안 되니까요. */
const SKIP = /(^|\/)\.DS_Store$/;

let copied = 0, bytes = 0;
function copyInto(sourcePath){
  const stat = statSync(sourcePath);
  if(stat.isDirectory()){
    for(const name of readdirSync(sourcePath)) copyInto(join(sourcePath, name));
    return;
  }
  const rel = relative(root, sourcePath);
  if(SKIP.test(rel)) return;
  const target = resolve(out, rel);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(sourcePath, target);
  copied++; bytes += stat.size;
}

if(existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for(const name of [...FILES, ...DIRS]){
  const path = resolve(root, name);
  if(!existsSync(path)){ console.warn(`빠짐: ${name}`); continue; }
  copyInto(path);
}

console.log(`www/ 준비 완료 — 파일 ${copied}개, ${(bytes/1024/1024).toFixed(2)}MB`);
