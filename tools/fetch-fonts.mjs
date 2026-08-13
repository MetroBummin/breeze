/* 제목 글꼴을 우리 서버로 가져옵니다.
 *
 *     npm run fonts
 *
 * 왜 필요한가: 예전에는 index.html 이 fonts.googleapis.com 을 직접 걸었습니다.
 * 그러면 세 가지가 따라옵니다 — (1) 이 앱을 여는 모든 사람의 IP 가 구글에
 * 갑니다. 읽는 앱이 조용히 남기는 기록치고는 큽니다. (2) 비행기 모드로 켠
 * 네이티브 앱에서는 글꼴이 아예 안 옵니다. 읽기가 되는데 제목만 다른 글꼴로
 * 찍힙니다. (3) 글꼴 한 벌을 받으려고 남의 서버 두 곳에 새로 접속합니다.
 *
 * 그래서 파일을 받아 `assets/fonts/` 에 두고, `styles/fonts.css` 를 여기서
 * 만들어 냅니다. **그 CSS 는 손으로 고치지 마세요** — 다시 돌리면 덮어씁니다.
 *
 * 한글은 통째로 받지 않습니다. 고운바탕 한 벌은 몇 MB 인데, 이 앱이 그 글꼴로
 * 찍는 한글은 화면의 고정 문구뿐입니다(인사말·큰 물음·섹션 제목·상단바·설정
 * 제목). 읽는 글도 낱말 뜻도 이 글꼴을 쓰지 않습니다 — 그건 본문 글꼴입니다.
 * 그래서 scripts/ui/i18n.js 의 한국어 표에 실제로 적힌 글자만 잘라서 받습니다.
 * 표에 새 문구를 넣으면 tests/verify-structure.mjs 가 "글꼴을 다시 받으세요"
 * 라고 막습니다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = resolve(root, 'assets/fonts');

/* 구글은 브라우저인 척해야 woff2 를 줍니다. 그냥 부르면 훨씬 무거운 ttf 가 옵니다. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const get = async (url, asText = true) => {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if(!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  return asText ? response.text() : Buffer.from(await response.arrayBuffer());
};

/* ---- 화면의 한글 모으기 ------------------------------------------------- */
/* i18n.js 의 `ko: { ... }` 안에 적힌 값만 봅니다. 키(`'nav.home'`)는 화면에
   나오지 않으므로 글꼴에 넣을 이유가 없습니다. */
export function koreanGlyphs(source){
  const table = source.match(/\n  ko: \{([\s\S]*?)\n  \},/);
  if(!table) throw new Error('scripts/ui/i18n.js 에서 한국어 표를 못 찾았습니다');
  const values = [...table[1].matchAll(/:\s*'([^']*)'/g)].map(match => match[1]);
  return [...new Set(values.join('').split(''))]
    .filter(character => character.charCodeAt(0) > 0x7F)
    .sort()
    .join('');
}

/* ---- 받기 ---------------------------------------------------------------- */
/* css2 응답에서 woff2 주소를 꺼냅니다. 라틴 한 조각만 씁니다 — 이 앱이 로마자로
   찍는 것은 "Breeze" 와 몇 개의 영어 제목뿐이라 베트남어·확장 라틴은 받아 봐야
   한 글자도 안 씁니다. */
function pickWoff2(css, subsetComment){
  const at = subsetComment ? css.indexOf(`/* ${subsetComment} */`) : 0;
  if(at < 0) throw new Error(`css2 응답에 ${subsetComment} 조각이 없습니다`);
  const url = css.slice(at).match(/url\((https:\/\/[^)]+)\)\s*format\('woff2'\)/);
  if(!url) throw new Error('css2 응답에 woff2 주소가 없습니다');
  return url[1];
}

const hash = buffer => createHash('sha256').update(buffer).digest('hex').slice(0, 8);

async function main(){
  mkdirSync(fontDir, { recursive: true });
  const glyphs = koreanGlyphs(readFileSync(resolve(root, 'scripts/ui/i18n.js'), 'utf8'));
  const faces = [];

  /* Fraunces — 굵기 500·600 을 한 파일(가변 글꼴)이 함께 냅니다. 광학 크기
     축(opsz)은 범위 그대로 둡니다: 스플래시의 큰 "Breeze" 와 상단바의 작은
     "Breeze" 가 같은 파일에서 서로 다른 굵기로 그려지는 이유입니다. */
  const frauncesCss = await get(
    'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
  const frauncesFile = await get(pickWoff2(frauncesCss, 'latin'), false);
  writeFileSync(resolve(fontDir, 'fraunces-latin.woff2'), frauncesFile);
  faces.push({
    family: 'Fraunces', file: 'fraunces-latin.woff2', bytes: frauncesFile.length,
    hash: hash(frauncesFile), weight: '500 600',
    /* 라틴 조각의 unicode-range 를 그대로 옮깁니다. 한글이 이 파일을 기다리지
       않고 곧장 고운바탕으로 넘어가게 하는 것이 이 한 줄입니다. */
    range: frauncesCss.slice(frauncesCss.indexOf('/* latin */'))
      .match(/unicode-range: ([^;]+);/)[1],
  });

  /* 고운바탕 — 위에서 모은 글자만. `text=` 를 붙이면 구글이 그 글자만 담은
     조각을 내줍니다. 굵기는 400·700 두 벌뿐이라, 화면이 부르는 500 은 400 으로
     600 은 700 으로 맞춰집니다(CSS 의 굵기 고르기 규칙). */
  for(const weight of [400, 700]){
    const css = await get('https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@' +
      weight + '&text=' + encodeURIComponent(glyphs));
    const file = await get(pickWoff2(css), false);
    const name = `gowun-batang-ui-${weight}.woff2`;
    writeFileSync(resolve(fontDir, name), file);
    faces.push({ family: 'Gowun Batang', file: name, bytes: file.length,
      hash: hash(file), weight: String(weight), range: null });
  }

  /* 두 글꼴 다 OFL 입니다. 파일을 함께 나눠 줄 때는 라이선스 원문도 같이
     둬야 합니다 — 그래서 받아서 옆에 놓습니다. */
  for(const [dir, name] of [['fraunces', 'OFL-Fraunces.txt'], ['gowunbatang', 'OFL-GowunBatang.txt']]){
    writeFileSync(resolve(fontDir, name),
      await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`));
  }

  /* 잘라 담은 글자 목록. 테스트가 이 파일과 i18n.js 를 맞대어 봅니다. */
  writeFileSync(resolve(fontDir, 'gowun-batang-ui.txt'), glyphs + '\n');

  writeFileSync(resolve(root, 'styles/fonts.css'),
    `/* 이 파일은 tools/fetch-fonts.mjs 가 만듭니다 — 손으로 고치지 마세요.\n` +
    `   다시 만들려면: npm run fonts\n\n` +
    `   글꼴 파일은 assets/fonts/ 에 함께 들어 있습니다(둘 다 OFL). 주소 끝의\n` +
    `   \`?v=\` 는 파일 내용의 해시입니다 — 글꼴을 바꿔야 그 주소가 바뀝니다. */\n` +
    faces.map(face =>
      `@font-face{\n` +
      `  font-family:'${face.family}';\n` +
      `  font-style:normal;\n` +
      `  font-weight:${face.weight};\n` +
      /* swap: 글꼴이 오는 동안 제목이 안 보이는 것보다, 잠깐 다른 글꼴로 보이는
         편이 낫습니다. 같은 서버에서 오므로 그 잠깐이 아주 짧습니다. */
      `  font-display:swap;\n` +
      `  src:url(../assets/fonts/${face.file}?v=${face.hash}) format('woff2');` +
      (face.range ? `\n  unicode-range:${face.range};` : '') +
      `\n}\n`).join(''), 'utf8');

  const total = faces.reduce((sum, face) => sum + face.bytes, 0);
  for(const face of faces) console.log(`  ${face.file.padEnd(28)} ${(face.bytes/1024).toFixed(1)}KB`);
  console.log(`글꼴 ${faces.length}벌 — 모두 ${(total/1024).toFixed(1)}KB, 한글 ${glyphs.length}자`);
}

/* 테스트가 koreanGlyphs 만 빌려 쓸 수 있게, 직접 실행할 때만 받으러 갑니다. */
if(process.argv[1] === fileURLToPath(import.meta.url)) await main();
