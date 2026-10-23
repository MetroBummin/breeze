# 비게임 출시 체크리스트

상태 값은 코드에서 끝낸 항목과 콘솔·계정에서 소유자가 할 항목입니다.

| 항목 | 상태 | 메모 |
| --- | --- | --- |
| 웹뷰 SDK `@apps-in-toss/web-framework`, `apps-in-toss.config.ts` | done | `appName: breeze`, `webBundleDir: toss/dist` |
| 앱 코드를 묶고 원격 페이지를 열지 않음 | done | `npm run toss`. 고전 목록·사전은 데이터 요청 |
| 번들 100MB 미만 | done | 테스트가 생성 폴더 크기를 확인 |
| 단일 페이지. `location.replace`로 문서를 바꾸지 않음 | done | 토스 빌드에서 소셜 로그인이 그 줄에 닿기 전에 반환 |
| `eval` / `new Function` 없음 | done | PDF.js, JSZip, QR, Readability는 묶음에서 제외. 테스트가 생성 JS를 검사 |
| iframe | done | 텍스트 고전 경로에는 없음. EPUB 미리보기 iframe은 토스에서 만들지 않음. YouTube iframe 없음 |
| 토스 내비게이션 바, 자체 뒤로 버튼 숨김 | done | 첫 화면 뒤로는 미니앱 종료. Android 뒤로도 `backEvent` |
| 라이트 모드만 | done | 다크 전환은 토스에서 라이트로 고정 |
| 핀치 확대 잠금 | done | `maximum-scale=1, user-scalable=no` |
| 입장 시 로그인 시트 없음 | done | 온보딩을 열지 않음. 로그인 마크업을 HTML에서 제거 |
| 로그인 UI 없음 | done | 이메일, Apple, Google |
| 파일 가져오기 없음 | done | PDF, EPUB, TXT, 기사 |
| 외부 링크, 설치 안내, 웹사이트 공유 없음 | done | 클릭도 `http(s)` 이동을 막음 |
| 서비스 워커 없음 | done | 토스 플래그에서 등록하지 않고 `sw.js`를 복사하지 않음 |
| anonKey는 기기에만 저장 | done | 서버 동기화 없음. 발급 검증이지 신원 검증이 아님 |
| 인공지능 뜻 고지와 AI 배지 | done | 최초 1회 안내, 생성 뜻에만 배지 |
| 교육 카테고리, 무료 | done | 수익·광고·인앱 결제 없음. 유료로 바꾸면 자격 조항에 걸림 |
| 콘솔 앱 등록과 앱 아이디 `breeze` | needs-owner | 아이디가 다르면 config와 CORS 호스트를 같이 바꿈 |
| Supabase CORS에 토스 출처 허용 | needs-owner | 아래 네 주소. 지금은 `dict`가 `*`라 동작은 가능. 와일드카드를 좁힐 때 필수 |
| 600×600 불투명 로고 | needs-owner | 저장소 아이콘은 512×512 |
| 스크린샷 업로드 | needs-owner | 세로 3장은 스크립트. 가로 1장은 아직 없음 |
| `.ait` 업로드, QR 테스트, 심사 제출 | needs-owner | 샌드박스 앱은 SDK 3을 지원하지 않음. 토스 앱의 콘솔 QR로 확인 |
| 사업자 등록 | 해당 없음 | anonKey 경로는 사업자 등록 없이 개발 가능. 수익화를 열면 별도 조건 |

## 소유자가 할 일

1. [앱인토스 콘솔](https://developers-apps-in-toss.toss.im/)에 가입하고 비게임 앱을 만듭니다. 앱 아이디를 `breeze`로 맞춥니다.
2. 카테고리는 교육, 가격은 무료로 둡니다. 교육 카테고리에서 자격 없이 수익이 나면 출시할 수 없습니다.
3. 이름, 한 줄 소개, 상세 설명, 키워드는 `docs/toss/launch.md`를 넣습니다.
4. 600×600 PNG 로고를 올리고, 세로 636×1048 스크린샷 3장과 가능하면 가로 1504×741 1장을 올립니다.
5. Supabase와 Edge Function CORS에 다음 출처를 허용합니다. 이 저장소의 서버 설정은 바꾸지 않았습니다.
   - `https://breeze.apps.tossmini.com`
   - `https://breeze.private-apps.tossmini.com`
   - `https://breeze.web.tossmini.com`
   - `https://breeze.private-web.tossmini.com`
6. Node.js 24 이상에서 `npm run toss:ait`로 `.ait`를 만듭니다. 콘솔에 업로드합니다. 배포 명령은 이 변경에 없습니다.
7. 콘솔 QR을 토스 앱으로 스캔해 고전 열기, 단어 뜻, 단어장, 뒤로 가기, 라이트 모드를 확인합니다.
8. 심사에 제출합니다. 머지나 스토어 배포는 이 초안과 별개입니다.
