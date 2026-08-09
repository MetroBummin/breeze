/* ================= 타입 검사 (내보내는 파일 없음) =================
 *
 * `tsc --noEmit` 를 돌리고, 파일마다 남아 있는 지적 수를 기준선과 견줍니다.
 *
 * 왜 "0개" 가 아니라 기준선인가 —
 * 지금 남은 지적은 거의 전부 한 가지입니다: `document.getElementById('am-url').value`
 * 처럼 브라우저가 돌려주는 `HTMLElement` 에서 `.value` 를 꺼내는 자리. 이 앱에서는
 * 그 요소가 `index.html` 에 반드시 있고 반드시 `<input>` 이지만, tsc 는 그걸 알
 * 방법이 없습니다. 버그가 아니라 tsc 가 모르는 사실입니다.
 *
 * 그 예순 군데를 한 번에 고치려면 프로덕션 코드에 주석 예순 줄을 심어야 하는데,
 * 그건 안전해지는 것이 아니라 시끄러워지는 것입니다. 그래서 **늘지 않게** 막고
 * 조금씩 줄입니다. 새로 쓰는 코드는 지적 하나도 못 늘리고, 옛 코드는 손댈 때마다
 * 하나씩 갚습니다. 줄면 이 스크립트가 기준선을 낮추라고 알려 줍니다.
 *
 *   npm run typecheck          검사만
 *   npm run typecheck -- --save   지금 상태를 새 기준선으로 저장
 *
 * 브라우저에 가는 바이트는 이 검사와 아무 상관이 없습니다. `.ts` 파일은 하나도
 * 없고, tsc 는 아무것도 내보내지 않습니다.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = resolve(root, 'tests/typecheck-baseline.json');
const save = process.argv.includes('--save');

const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
if(!existsSync(tsc)){
  console.error('타입 검사기가 없습니다. `npm install` 을 먼저 실행해 주세요.');
  process.exit(1);
}
const run = spawnSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.json')],
                      { cwd: root, encoding: 'utf8' });
const output = (run.stdout || '') + (run.stderr || '');

/* tsc 는 `경로(줄,칸): error TS1234: 설명` 한 줄씩 냅니다. */
const counts = {};
let total = 0;
for(const line of output.split('\n')){
  const match = /^(.+?)\(\d+,\d+\): error TS\d+:/.exec(line);
  if(!match) continue;
  counts[match[1]] = (counts[match[1]] || 0) + 1;
  total++;
}
/* 설정 파일 자체가 잘못되면 파일 이름 없이 오류가 납니다. 그건 기준선으로
   덮을 일이 아니라 바로 고칠 일입니다. */
const configBroken = /error TS(5\d{3}|18003)/.test(output);
if(configBroken){
  console.error(output.trim());
  process.exit(1);
}

if(save){
  writeFileSync(BASELINE, JSON.stringify({ total, files: counts }, null, 2) + '\n');
  console.log(`타입 검사 기준선을 새로 저장했습니다: ${total}개`);
  process.exit(0);
}

const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, 'utf8'))
  : { total: 0, files: {} };

const grew = [];
for(const [file, count] of Object.entries(counts)){
  const was = baseline.files[file] || 0;
  if(count > was) grew.push(`  ${file}: ${was} → ${count}`);
}
if(grew.length){
  console.error(`타입 지적이 늘었습니다 (${baseline.total} → ${total}):`);
  console.error(grew.join('\n'));
  console.error('\n무엇이 늘었는지 보려면: npx tsc -p tsconfig.json');
  console.error('고칠 수 없는 것이라면(브라우저가 아는 사실을 tsc 가 모르는 경우)');
  console.error('까닭을 적고 npm run typecheck -- --save 로 기준선을 옮기세요.');
  process.exit(1);
}

if(total < baseline.total){
  console.log(`타입 검사 통과 — 지적이 ${baseline.total}개에서 ${total}개로 줄었습니다.`);
  console.log('기준선을 낮춰 두세요: npm run typecheck -- --save');
}else{
  console.log(`타입 검사 통과 — 남은 지적 ${total}개 (늘지 않음)`);
}
