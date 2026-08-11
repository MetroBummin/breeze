/* 앱이 자기 파일 밖에서 만나는 이름들.
   여기 적는 것은 "이런 이름이 실행 중에 있다"는 사실뿐입니다. 코드는 한 줄도
   바뀌지 않고, 브라우저에는 이 파일이 가지 않습니다 — tsc 만 읽습니다. */

/* PDF.js 와 JSZip 은 파일을 처음 열 때 CDN 에서 받아 전역에 붙습니다
   (`scripts/core/lazy-lib.js`). 받기 전에는 없는 것이 맞아서, 이 둘은
   `undefined` 일 수 있다고 적지 않습니다 — 확인은 `ensurePdfLib()` 가 합니다. */
declare var pdfjsLib: any;
declare var JSZip: any;
declare var qrcode: any;

/* 창에 직접 붙여 두는 것들.
   - `supabase` : CDN 스크립트가 붙입니다
   - `BREEZE_CONFIG` : `config.js` 가 배포 때 채웁니다
   - `Capacitor` : 네이티브 셸에서만 있습니다(`isNativeShell()`)
   - `breezeExportDict` : 콘솔에서 사전 캐시를 들여다보는 문 */
interface Window {
  supabase?: any;
  BREEZE_CONFIG?: { SB_URL?: string; SB_KEY?: string };
  Capacitor?: any;
  breezeExportDict?: () => Promise<any>;
  showSaveFilePicker?: (options?: any) => Promise<any>;
}

/* ── 문단 배열에 얹혀 다니는 것들 ──
   이 앱은 본문을 `paras` 라는 문자열 배열 하나로 들고 다니고, 그 배열에 부속
   정보를 **속성으로 얹습니다**:

     paras.sig       문단마다의 서식 신호(크기·굵기·들여쓰기)
     paras.cover     대표 사진의 저장 열쇠
     paras.chapters  EPUB 장 경계
     paras.sheets    쪽마다의 줄 좌표 — 떼어 둔 `modules/exam-shorts` 가 씁니다

   배열 하나로 다니면 저장·동기화·복원이 한 덩어리로 끝납니다. 나란한 배열을
   여러 개 들고 다니면 어느 하나가 어긋나는 날이 옵니다. 여기 적어 두는 것은
   그 관례에 이름을 붙이는 일이기도 합니다. */
interface Array<T> {
  sig?: any[];
  cover?: string;
  chapters?: any[];
  sheets?: any[];
}
